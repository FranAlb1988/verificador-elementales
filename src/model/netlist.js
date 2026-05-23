// Construye el netlist (grafo eléctrico) a partir del proyecto.
// Estrategia: union-find sobre coordenadas snapeadas a la grilla.
// Cada cable conecta dos coordenadas. Terminales que comparten coord quedan
// en el mismo net automáticamente.

import { COMPONENT_TYPES, terminalAbsPos } from './components.js';

class UnionFind {
  constructor() { this.parent = new Map(); }
  find(k) {
    if (!this.parent.has(k)) this.parent.set(k, k);
    let p = this.parent.get(k);
    while (p !== k) { k = p; p = this.parent.get(k); }
    return k;
  }
  union(a, b) {
    const ra = this.find(a), rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

const keyOf = (x, y) => `${Math.round(x)},${Math.round(y)}`;

export function buildNetlist(project) {
  const uf = new UnionFind();

  // Recolectar coords de cada terminal y unir por wire.
  const termPos = new Map(); // compId -> { termId -> {x,y,def} }
  for (const c of project.components) {
    termPos.set(c.id, terminalAbsPos(c));
  }

  // Asegurar que toda coord queda registrada en el UF.
  for (const tp of termPos.values()) {
    for (const t of Object.values(tp)) uf.find(keyOf(t.x, t.y));
  }
  for (const w of project.wires) {
    const a = wireEndpointPos(w, 'from', termPos);
    const b = wireEndpointPos(w, 'to', termPos);
    if (!a || !b) continue;
    uf.union(keyOf(a.x, a.y), keyOf(b.x, b.y));
  }

  // Construir nets: agrupar terminales por raíz UF.
  const nets = new Map(); // netId(=root key) -> {id, terminals:[{compId,termId,def}], coords:Set}
  for (const c of project.components) {
    const tp = termPos.get(c.id);
    for (const [termId, t] of Object.entries(tp)) {
      const root = uf.find(keyOf(t.x, t.y));
      if (!nets.has(root)) nets.set(root, { id: root, terminals: [], coords: new Set() });
      const net = nets.get(root);
      net.terminals.push({ compId: c.id, termId, def: t.def, x: t.x, y: t.y });
      net.coords.add(keyOf(t.x, t.y));
    }
  }
  // Asegurar también los nets que sólo tocan wires (sin terminal)
  for (const w of project.wires) {
    const a = wireEndpointPos(w, 'from', termPos);
    const b = wireEndpointPos(w, 'to', termPos);
    if (a) {
      const r = uf.find(keyOf(a.x, a.y));
      if (!nets.has(r)) nets.set(r, { id: r, terminals: [], coords: new Set() });
      nets.get(r).coords.add(keyOf(a.x, a.y));
    }
    if (b) {
      const r = uf.find(keyOf(b.x, b.y));
      if (!nets.has(r)) nets.set(r, { id: r, terminals: [], coords: new Set() });
      nets.get(r).coords.add(keyOf(b.x, b.y));
    }
  }

  // Índice: para cada (compId,termId) -> netId
  const termNet = new Map();
  for (const net of nets.values()) {
    for (const t of net.terminals) {
      termNet.set(`${t.compId}.${t.termId}`, net.id);
    }
  }

  // Para cada wire: netId al que pertenece (para colorear en UI).
  const wireNet = new Map();
  for (const w of project.wires) {
    const a = wireEndpointPos(w, 'from', termPos);
    if (a) wireNet.set(w.id, uf.find(keyOf(a.x, a.y)));
  }

  return { nets, termNet, wireNet, termPos };
}

export function wireEndpointPos(wire, side, termPosMap) {
  const ep = wire[side];
  if (!ep) return null;
  if (ep.compId) {
    const tp = termPosMap.get(ep.compId);
    if (!tp) return null;
    const t = tp[ep.termId];
    return t ? { x: t.x, y: t.y } : null;
  }
  return { x: ep.x, y: ep.y };
}

// Devuelve los componentes con su rol eléctrico expandido.
export function classifyComponents(project) {
  return project.components.map(c => ({
    ...c,
    def: COMPONENT_TYPES[c.type],
  }));
}
