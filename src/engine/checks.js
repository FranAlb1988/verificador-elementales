// Chequeo estático del diagrama. Cuatro familias:
//   1) Cortocircuitos (peor caso + actuales en reposo)
//   2) Circuitos abiertos / bobinas que nunca podrán energizarse
//   3) Referencias cruzadas contacto-bobina
//   4) Conflictos de tensión / dominio
// Devuelve lista de findings: { severity, code, message, related:[compIds...] }

import { COMPONENT_TYPES } from '../model/components.js';
import { simulate } from './simulation.js';

export function runChecks(project, netlist) {
  const findings = [];

  // ---- 3) Referencias cruzadas ----
  const coilTags = new Map(); // tag -> [compIds]
  const contactTags = new Map();
  for (const c of project.components) {
    const def = COMPONENT_TYPES[c.type];
    if (!def) continue;
    const e = def.electrical;
    if (e.role === 'load' && e.kind === 'coil') {
      const t = c.props.tag || '';
      if (!coilTags.has(t)) coilTags.set(t, []);
      coilTags.get(t).push(c.id);
    }
    if (e.role === 'switch' && e.kind === 'contact') {
      const t = c.props.tag || '';
      if (!contactTags.has(t)) contactTags.set(t, []);
      contactTags.get(t).push(c.id);
    }
  }
  for (const [tag, ids] of coilTags) {
    if (!tag) {
      findings.push({ severity: 'warning', code: 'COIL_NO_TAG', message: `Bobina sin tag`, related: ids });
    }
    if (ids.length > 1) {
      findings.push({ severity: 'error', code: 'DUP_COIL', message: `Tag de bobina duplicado: "${tag}"`, related: ids });
    }
  }
  for (const [tag, ids] of contactTags) {
    if (!coilTags.has(tag)) {
      findings.push({ severity: 'error', code: 'CONTACT_NO_COIL', message: `Contacto "${tag}" no tiene bobina asociada`, related: ids });
    }
  }
  for (const [tag, ids] of coilTags) {
    if (!contactTags.has(tag)) {
      findings.push({ severity: 'info', code: 'COIL_NO_CONTACT', message: `Bobina "${tag}" sin contactos auxiliares en el diagrama`, related: ids });
    }
  }

  // ---- 4) Conflictos de tensión ----
  // Simulamos en reposo para obtener netPower y dominios.
  const sim = simulate(project, netlist, { buttons: {}, iedOutputs: {} });
  const rootDomain = sim.rootDomain;
  for (const [root, set] of rootDomain) {
    // Separar tensiones distintas en el mismo root.
    const volts = new Set();
    for (const lbl of set) {
      const m = /^(\d+)V/.exec(lbl);
      if (m) volts.add(m[1]);
    }
    if (volts.size > 1) {
      findings.push({
        severity: 'error',
        code: 'VOLT_CONFLICT',
        message: `Conflicto de tensión en una misma net: ${[...volts].join(', ')} V`,
        related: relatedFromRoot(netlist, sim.ufNet, root),
      });
    }
  }

  // ---- 1) Cortocircuitos ----
  for (const s of sim.shorts) {
    findings.push({
      severity: 'error',
      code: 'SHORT_REST',
      message: `Cortocircuito en reposo (L y N unidos)`,
      related: relatedFromRoot(netlist, sim.ufNet, s.root),
    });
  }
  // Peor caso: si forzamos todos los switches cerrados, ¿hay L↔N sin carga
  // de por medio? Lo aproximamos forzando todos los pulsadores y bobinas
  // como si todos los contactos estuvieran cerrados.
  const worstButtons = {};
  const worstIed = {};
  for (const c of project.components) {
    const def = COMPONENT_TYPES[c.type];
    if (!def) continue;
    if (def.electrical.role === 'switch' && def.electrical.kind === 'button') {
      worstButtons[c.id] = true;
    }
    if (def.electrical.role === 'block') {
      for (const out of (def.electrical.outputs || [])) worstIed[`${c.id}.${out}`] = true;
    }
  }
  // Worst-case real: TODOS los switches conducen (contactos NO y NC, botones
  // NO y NC). Es un chequeo de topología, no de estado.
  const worst = oneShotEvaluate(project, netlist, { buttons: {}, iedOutputs: worstIed }, new Map(), true);
  for (const s of worst.shorts) {
    // Sólo si NO fue ya reportado en reposo.
    if (!sim.shorts.find(x => x.root === s.root)) {
      findings.push({
        severity: 'warning',
        code: 'SHORT_POSSIBLE',
        message: `Posible cortocircuito en algún estado de operación`,
        related: relatedFromRoot(netlist, worst.ufNet, s.root),
      });
    }
  }

  // ---- 2) Circuitos abiertos / cargas sin posibilidad de energizar ----
  // Estrategia: con todos los switches forzados a conducir (topología pura),
  // ¿alguna carga sigue sin tener L en un lado y N en el otro?
  const fullyOn = oneShotEvaluate(project, netlist, { buttons: {}, iedOutputs: worstIed }, new Map(), true);
  for (const c of project.components) {
    const def = COMPONENT_TYPES[c.type];
    if (!def || def.electrical.role !== 'load') continue;
    if (!fullyOn.loadEnergized.get(c.id)) {
      const tag = c.props.tag || c.props.label || c.type;
      findings.push({
        severity: 'error',
        code: 'LOAD_UNREACHABLE',
        message: `"${tag}" no puede energizarse en ningún estado (¿falta retorno a N o alimentación L?)`,
        related: [c.id],
      });
    }
  }

  // Terminales sueltos: nets con un solo terminal y sin wire. Ignora terminales
  // "extra" de junctions e IED (su rol es proveer puntos de unión sobrantes).
  for (const net of netlist.nets.values()) {
    if (net.terminals.length === 1 && net.coords.size === 1) {
      const t = net.terminals[0];
      const c = project.components.find(x => x.id === t.compId);
      const def = c ? COMPONENT_TYPES[c.type] : null;
      if (c && (c.type === 'junction' || def?.electrical.role === 'block')) continue;
      findings.push({
        severity: 'warning',
        code: 'DANGLING',
        message: `Terminal suelto sin conexión (${t.compId}.${t.termId})`,
        related: [t.compId],
      });
    }
  }

  // Cables que no llegan a ningún terminal (ambos endpoints en coords sin terminal).
  // Detección simple: net que sólo tiene coords pero ningún terminal => útil sólo si hay wires.
  // Omitido para Fase 1.

  if (findings.length === 0) {
    findings.push({ severity: 'ok', code: 'OK', message: 'Sin observaciones', related: [] });
  }

  return findings;
}

function relatedFromRoot(netlist, uf, root) {
  const ids = new Set();
  for (const net of netlist.nets.values()) {
    if (uf.find(net.id) === root) {
      for (const t of net.terminals) ids.add(t.compId);
    }
  }
  return [...ids];
}

// Implementación local de un solo paso de evaluación.
// Si forceAllClosed=true, TODOS los switches (contactos NO/NC y botones NO/NC)
// se consideran cerrados — útil para chequeos de topología/peor caso.
function oneShotEvaluate(project, netlist, inputs, coilStates, forceAllClosed = false) {
  const ufNet = new UF();
  for (const id of netlist.nets.keys()) ufNet.find(id);
  const netOf = (compId, termId) => netlist.termNet.get(`${compId}.${termId}`);

  for (const c of project.components) {
    const def = COMPONENT_TYPES[c.type];
    if (!def) continue;
    const e = def.electrical;
    let close = false;
    if (e.role === 'passthrough') close = true;
    else if (forceAllClosed && e.role === 'switch') close = true;
    else if (e.role === 'switch' && e.kind === 'contact') {
      const energ = !!coilStates.get(c.props.tag);
      close = e.no ? energ : !energ;
    } else if (e.role === 'switch' && e.kind === 'button') {
      const p = !!inputs.buttons[c.id];
      close = e.no ? p : !p;
    }
    if (close) {
      const ids = def.terminals.map(t => netOf(c.id, t.id)).filter(Boolean);
      for (let i = 1; i < ids.length; i++) ufNet.union(ids[0], ids[i]);
    }
    if (e.role === 'block') {
      for (const out of (e.outputs || [])) {
        if (inputs.iedOutputs[`${c.id}.${out}`]) {
          const a = netOf(c.id, `${out}a`);
          const b = netOf(c.id, `${out}b`);
          if (a && b) ufNet.union(a, b);
        }
      }
    }
  }

  const rootL = new Set();
  const rootN = new Set();
  for (const c of project.components) {
    const def = COMPONENT_TYPES[c.type];
    if (!def) continue;
    const e = def.electrical;
    if (e.role === 'source') {
      for (const t of def.terminals) {
        const n = netOf(c.id, t.id);
        if (!n) continue;
        const r = ufNet.find(n);
        if (['line','L1','L2','L3'].includes(t.role)) rootL.add(r);
        if (t.role === 'neutral') rootN.add(r);
      }
    }
    if (e.role === 'transformer') {
      for (const t of def.terminals) {
        if (t.domain !== 'sec') continue;
        const n = netOf(c.id, t.id);
        if (!n) continue;
        const r = ufNet.find(n);
        if (t.role === 'line') rootL.add(r);
        if (t.role === 'neutral') rootN.add(r);
      }
    }
  }

  const shorts = [];
  for (const r of new Set([...rootL, ...rootN])) {
    if (rootL.has(r) && rootN.has(r)) shorts.push({ root: r });
  }

  const loadEnergized = new Map();
  for (const c of project.components) {
    const def = COMPONENT_TYPES[c.type];
    if (!def || def.electrical.role !== 'load') continue;
    const [t1, t2] = def.terminals;
    const r1 = ufNet.find(netOf(c.id, t1.id) || '');
    const r2 = ufNet.find(netOf(c.id, t2.id) || '');
    const a = rootL.has(r1) && rootN.has(r2);
    const b = rootL.has(r2) && rootN.has(r1);
    loadEnergized.set(c.id, (a || b) && r1 !== r2);
  }

  return { shorts, loadEnergized, ufNet };
}

class UF {
  constructor() { this.p = new Map(); }
  find(k) {
    if (!this.p.has(k)) { this.p.set(k, k); return k; }
    let x = this.p.get(k);
    while (x !== k) { k = x; x = this.p.get(k); }
    return k;
  }
  union(a, b) {
    const ra = this.find(a), rb = this.find(b);
    if (ra !== rb) this.p.set(ra, rb);
  }
}
