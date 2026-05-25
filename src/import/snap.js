// Snap de endpoints de cable a terminales de componentes cercanos.
// + addJunctionsAtBranches: inserta junctions donde concurren 3+ endpoints sueltos.
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

// Inserta un componente junction donde 3+ endpoints sueltos concurren al mismo
// punto (con tolerancia), y reconecta esos endpoints al junction.
// Junction.S=(10,20), N=(10,0), W=(0,10), E=(20,10) en coords locales; el
// componente se centra en el punto de concurrencia.
export function addJunctionsAtBranches(project, opts = {}) {
  const tolerance = opts.tolerance ?? 5;
  const minWires = opts.minWires ?? 3;

  // Agrupar endpoints sueltos por coord (snapeada a tolerance)
  const groups = new Map();   // key → [{ wireId, side, x, y }]
  for (const w of project.wires) {
    for (const side of ['from', 'to']) {
      const ep = w[side];
      if (!ep || ep.compId) continue;
      const bx = Math.round(ep.x / tolerance) * tolerance;
      const by = Math.round(ep.y / tolerance) * tolerance;
      const key = `${bx},${by}`;
      let arr = groups.get(key);
      if (!arr) { arr = []; groups.set(key, arr); }
      arr.push({ wireId: w.id, side, x: ep.x, y: ep.y });
    }
  }

  const newComps = [];
  const updates = new Map(); // wireId → { from?, to? }
  let added = 0;

  for (const [, members] of groups) {
    if (members.length < minWires) continue;
    // Centroide del grupo
    const cx = members.reduce((s, m) => s + m.x, 0) / members.length;
    const cy = members.reduce((s, m) => s + m.y, 0) / members.length;
    const id = `j${Date.now().toString(36)}${Math.random().toString(36).slice(2,4)}${added}`;
    newComps.push({
      id,
      type: 'junction',
      x: Math.round(cx) - 10,    // junction.size = 20x20; centro local = (10,10)
      y: Math.round(cy) - 10,
      rot: 0,
      props: {},
    });
    added++;
    // Asignar cada endpoint a la terminal más natural del junction según dirección
    for (const m of members) {
      const dx = m.x - cx, dy = m.y - cy;
      let term;
      if (Math.abs(dx) > Math.abs(dy)) term = dx > 0 ? 'E' : 'W';
      else                              term = dy > 0 ? 'S' : 'N';
      const u = updates.get(m.wireId) || {};
      u[m.side] = { compId: id, termId: term };
      updates.set(m.wireId, u);
    }
  }

  const newWires = project.wires.map(w => {
    const u = updates.get(w.id);
    if (!u) return w;
    return { ...w, ...u };
  });

  return {
    project: {
      ...project,
      components: [...project.components, ...newComps],
      wires: newWires,
    },
    added,
    reconnected: [...updates.values()].reduce((s, u) => s + (u.from?1:0) + (u.to?1:0), 0),
  };
}
