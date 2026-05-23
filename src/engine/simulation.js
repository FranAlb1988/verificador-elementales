// Motor de simulación: evalúa la lógica del circuito de control por punto fijo.
//
// Conceptos:
//  - Cada net tiene flags: poweredL (alcanza una fuente 'line') y poweredN ('neutral').
//  - Switches cerrados (contactos NO con bobina energizada, NC con bobina
//    NO energizada, botones según presión, passthrough siempre) unen nets:
//    si A y B están unidos, su poweredL/N se fusiona.
//  - Cargas (coil, lamp) NO propagan L/N a través — sólo se "energizan" si
//    uno de sus terminales tiene L y el otro N (en cualquier orden).
//  - Iteramos hasta que el conjunto de bobinas energizadas se estabilice.
//
// Salida: { coilEnergized: Map<tag,bool>, loadEnergized: Map<compId,bool>,
//           netPower: Map<netId,{L,N}>, shorts: [...], oscillating: bool }

import { COMPONENT_TYPES } from '../model/components.js';

const MAX_ITER = 30;

export function simulate(project, netlist, simInputs, prevCoils) {
  // simInputs: { buttons: { [compId]: bool }, iedOutputs: { [compId+'.QX']: bool } }
  // prevCoils: Map<tag,bool> con el estado de bobinas del ciclo anterior —
  // permite el sellado (seal-in): un contacto cerrado en t-1 mantiene su bobina.
  const inputs = simInputs || { buttons: {}, iedOutputs: {} };
  const coilEnergized = new Map();
  if (prevCoils) for (const [k, v] of prevCoils) coilEnergized.set(k, v);
  let prevSig = '';
  let oscillating = false;

  let result;
  for (let iter = 0; iter < MAX_ITER; iter++) {
    result = evaluate(project, netlist, inputs, coilEnergized);
    const sig = signature(result.coilEnergized);
    if (sig === prevSig) break;
    prevSig = sig;
    // Avanzar estado
    for (const [k, v] of result.coilEnergized) coilEnergized.set(k, v);
    if (iter === MAX_ITER - 1) oscillating = true;
  }

  return { ...result, oscillating };
}

function signature(m) {
  return [...m.entries()].sort().map(([k, v]) => `${k}:${v ? 1 : 0}`).join('|');
}

function evaluate(project, netlist, inputs, coilStates) {
  // 1) Determinar qué switches conducen en este momento.
  const conducts = new Map(); // compId -> bool
  for (const c of project.components) {
    const def = COMPONENT_TYPES[c.type];
    if (!def) continue;
    const e = def.electrical;
    if (e.role === 'passthrough') { conducts.set(c.id, true); continue; }
    if (e.role === 'switch') {
      if (e.kind === 'contact') {
        const tag = c.props.tag;
        const energized = !!coilStates.get(tag);
        conducts.set(c.id, e.no ? energized : !energized);
      } else if (e.kind === 'button') {
        const pressed = !!inputs.buttons[c.id];
        // NO: cerrado cuando pressed; NC: abierto cuando pressed.
        conducts.set(c.id, e.no ? pressed : !pressed);
      }
      continue;
    }
    if (e.role === 'block') {
      // No conduce por sí mismo; sus salidas se modelan como switches lógicos
      // expuestos por el IED: para Fase 1, cada salida QX abre/cierra entre
      // terminales QXa-QXb según inputs.iedOutputs[compId+'.QX'].
      conducts.set(c.id, false);
      continue;
    }
    conducts.set(c.id, false);
  }

  // 2) Union-find sobre nets, uniendo a través de switches cerrados.
  const ufNet = new UnionFind();
  for (const netId of netlist.nets.keys()) ufNet.find(netId);

  const netOf = (compId, termId) => netlist.termNet.get(`${compId}.${termId}`);

  for (const c of project.components) {
    const def = COMPONENT_TYPES[c.type];
    if (!def) continue;
    const e = def.electrical;
    if (e.role === 'passthrough' || (e.role === 'switch' && conducts.get(c.id))) {
      // Unir TODOS los terminales del componente.
      const ids = def.terminals.map(t => netOf(c.id, t.id)).filter(Boolean);
      for (let i = 1; i < ids.length; i++) ufNet.union(ids[0], ids[i]);
    }
    if (e.role === 'transformer') {
      // No une primario con secundario; cada par actúa como source/load aparte.
    }
    if (e.role === 'block') {
      // IED: por cada salida QX, si está en 'true', unir QXa con QXb.
      for (const out of (e.outputs || [])) {
        const on = !!inputs.iedOutputs[`${c.id}.${out}`];
        if (on) {
          const a = netOf(c.id, `${out}a`);
          const b = netOf(c.id, `${out}b`);
          if (a && b) ufNet.union(a, b);
        }
      }
    }
  }

  // 3) Marcar power: recorrer fuentes y agrupar L/N por raíz post-merge.
  const rootL = new Set();
  const rootN = new Set();
  const rootDomain = new Map(); // root -> Set de etiquetas de dominio (voltage|fase)
  const rootSrcInfo = new Map(); // root -> array de fuentes que la alimentan (para conflictos)

  for (const c of project.components) {
    const def = COMPONENT_TYPES[c.type];
    if (!def) continue;
    const e = def.electrical;
    if (e.role === 'source') {
      for (const t of def.terminals) {
        const net = netOf(c.id, t.id);
        if (!net) continue;
        const r = ufNet.find(net);
        if (t.role === 'line' || t.role === 'L1' || t.role === 'L2' || t.role === 'L3') rootL.add(r);
        if (t.role === 'neutral') rootN.add(r);
        addDomain(rootDomain, r, `${t.voltage || c.props.voltage}V/${t.role || 'line'}`);
        addSrc(rootSrcInfo, r, c.id, t.id);
      }
    }
    if (e.role === 'transformer') {
      // secundario emite L/N en su dominio
      for (const t of def.terminals) {
        const net = netOf(c.id, t.id);
        if (!net) continue;
        const r = ufNet.find(net);
        if (t.domain === 'sec') {
          if (t.role === 'line') rootL.add(r);
          if (t.role === 'neutral') rootN.add(r);
          addDomain(rootDomain, r, `${t.voltage}V/sec(${c.id})`);
          addSrc(rootSrcInfo, r, c.id, t.id);
        } else if (t.domain === 'pri') {
          // primario aparece como una carga de su propia tensión, no es fuente
          addDomain(rootDomain, r, `${t.voltage}V/pri`);
        }
      }
    }
    if (e.role === 'ground') {
      for (const t of def.terminals) {
        const net = netOf(c.id, t.id);
        if (!net) continue;
        addDomain(rootDomain, ufNet.find(net), 'GND');
      }
    }
  }

  // 4) Estado de bobinas: para cada coil, evaluar si una terminal está en L y
  //    la otra en N. Si sí, energizada. Acumular por tag.
  const newCoilTagged = new Map();
  const loadEnergized = new Map(); // compId -> bool

  for (const c of project.components) {
    const def = COMPONENT_TYPES[c.type];
    if (!def) continue;
    const e = def.electrical;
    if (e.role !== 'load') continue;
    const [t1, t2] = def.terminals;
    const r1 = ufNet.find(netOf(c.id, t1.id) || '');
    const r2 = ufNet.find(netOf(c.id, t2.id) || '');
    const a = rootL.has(r1) && rootN.has(r2);
    const b = rootL.has(r2) && rootN.has(r1);
    const energized = (a || b) && r1 !== r2;
    loadEnergized.set(c.id, energized);
    if (e.kind === 'coil') {
      const tag = c.props.tag;
      const prev = newCoilTagged.get(tag) || false;
      newCoilTagged.set(tag, prev || energized);
    }
  }

  // 5) Detectar cortocircuitos en estado actual: net con L y N a la vez.
  const shorts = [];
  const allRoots = new Set([...rootL, ...rootN]);
  for (const r of allRoots) {
    if (rootL.has(r) && rootN.has(r)) {
      shorts.push({ root: r, msg: 'Cortocircuito: net con L y N simultáneamente' });
    }
  }

  // 6) Construir netPower por netId original (no la raíz), para colorear UI.
  const netPower = new Map();
  for (const netId of netlist.nets.keys()) {
    const r = ufNet.find(netId);
    netPower.set(netId, {
      L: rootL.has(r),
      N: rootN.has(r),
      root: r,
    });
  }

  return {
    coilEnergized: newCoilTagged,
    loadEnergized,
    netPower,
    shorts,
    rootDomain,
    rootSrcInfo,
    ufNet,
  };
}

function addDomain(map, root, label) {
  if (!map.has(root)) map.set(root, new Set());
  map.get(root).add(label);
}
function addSrc(map, root, compId, termId) {
  if (!map.has(root)) map.set(root, []);
  map.get(root).push({ compId, termId });
}

class UnionFind {
  constructor() { this.parent = new Map(); }
  find(k) {
    if (!this.parent.has(k)) { this.parent.set(k, k); return k; }
    let p = this.parent.get(k);
    while (p !== k) { k = p; p = this.parent.get(k); }
    return k;
  }
  union(a, b) {
    const ra = this.find(a), rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}
