// Snap de endpoints de cable a terminales de componentes cercanos.
// Tras la auto-extracción del DXF, los cables tienen endpoints {x,y} y los
// componentes están colocados en posiciones aproximadas. Esta función
// convierte endpoints {x,y} a {compId, termId} cuando hay un terminal a
// distancia ≤ tolerance, para que el netlist conecte correctamente.

import { COMPONENT_TYPES, terminalAbsPos } from '../model/components.js';

export function snapWires(project, opts = {}) {
  const tolerance = opts.tolerance ?? 20;
  const eps2 = tolerance * tolerance;

  // Indexar terminales en una grid espacial (bin size = tolerance) para no
  // recorrer todos los terminales por cada endpoint.
  const bin = (v) => Math.floor(v / tolerance);
  const grid = new Map(); // "bx,by" → array de { compId, termId, x, y }
  for (const comp of project.components) {
    const def = COMPONENT_TYPES[comp.type];
    if (!def) continue;
    const tp = terminalAbsPos(comp);
    for (const [termId, pos] of Object.entries(tp)) {
      const t = { compId: comp.id, termId, x: pos.x, y: pos.y };
      const key = `${bin(t.x)},${bin(t.y)}`;
      let arr = grid.get(key);
      if (!arr) { arr = []; grid.set(key, arr); }
      arr.push(t);
    }
  }

  let snapped = 0, total = 0;
  const newWires = project.wires.map(wire => {
    const from = snapEndpoint(wire.from, grid, bin, eps2);
    const to = snapEndpoint(wire.to,   grid, bin, eps2);
    if (wire.from?.compId == null) { total++; if (from?.compId) snapped++; }
    if (wire.to?.compId   == null) { total++; if (to?.compId)   snapped++; }
    return { ...wire, from, to };
  });

  return { project: { ...project, wires: newWires }, snapped, total };
}

function snapEndpoint(ep, grid, bin, eps2) {
  if (!ep) return ep;
  if (ep.compId) return ep;                    // ya es ref a terminal
  if (typeof ep.x !== 'number') return ep;

  const bx = bin(ep.x), by = bin(ep.y);
  let best = null, bestD = Infinity;
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    const arr = grid.get(`${bx+dx},${by+dy}`);
    if (!arr) continue;
    for (const t of arr) {
      const dxk = t.x - ep.x, dyk = t.y - ep.y;
      const d = dxk*dxk + dyk*dyk;
      if (d < bestD && d <= eps2) { bestD = d; best = t; }
    }
  }
  if (best) return { compId: best.compId, termId: best.termId };
  return ep;
}
