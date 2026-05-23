// Clustering espacial de entidades de simbología. Dos entidades pertenecen al
// mismo cluster si comparten al menos un punto clave dentro de tolerancia ε.
// Punto clave = endpoints de LINE/LWPOLYLINE, centro+cardinal de CIRCLE/ARC.

const DEFAULT_EPS = 4;          // DXF units
const SYMBOL_LAYERS = new Set([
  'JRI_EL-Simbología',
  'JRI_EL-Módulo',
  'JRI_EL-Equipo eléctrico',
]);

export function clusterSymbols(entities, opts = {}) {
  const eps = opts.eps ?? DEFAULT_EPS;
  const layers = opts.layers ?? SYMBOL_LAYERS;
  const items = [];
  for (let i = 0; i < entities.length; i++) {
    const e = entities[i];
    if (!layers.has(e.layer)) continue;
    // No incluir TEXT en el clustering primario (provoca over-merging entre
    // símbolos adyacentes con etiquetas comunes). Se asignan después.
    if (e.type === 'TEXT' || e.type === 'MTEXT') continue;
    const kps = keypointsOf(e);
    if (kps.length === 0) continue;
    items.push({ entity: e, originalIndex: i, kps });
  }

  // Spatial hash para no ser O(N²K²). Bin size = eps.
  const bin = (v) => Math.floor(v / eps);
  const grid = new Map(); // "bx,by" → array de índices
  for (let i = 0; i < items.length; i++) {
    for (const p of items[i].kps) {
      const key = `${bin(p.x)},${bin(p.y)}`;
      let arr = grid.get(key);
      if (!arr) { arr = []; grid.set(key, arr); }
      arr.push(i);
    }
  }

  // Union-find sobre items.
  const parent = items.map((_, i) => i);
  const find = (i) => parent[i] === i ? i : (parent[i] = find(parent[i]));
  const union = (i, j) => { const ri = find(i), rj = find(j); if (ri !== rj) parent[ri] = rj; };

  const eps2 = eps * eps;
  const seen = new Set();
  for (let i = 0; i < items.length; i++) {
    for (const p of items[i].kps) {
      const bx = bin(p.x), by = bin(p.y);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const arr = grid.get(`${bx+dx},${by+dy}`);
        if (!arr) continue;
        for (const j of arr) {
          if (j === i) continue;
          const pairKey = i < j ? `${i}|${j}` : `${j}|${i}`;
          if (seen.has(pairKey)) continue;
          // Verificar realmente si alguna pareja de keypoints está dentro de eps.
          let near = false;
          for (const a of items[i].kps) {
            for (const b of items[j].kps) {
              const dxk = a.x - b.x, dyk = a.y - b.y;
              if (dxk*dxk + dyk*dyk <= eps2) { near = true; break; }
            }
            if (near) break;
          }
          seen.add(pairKey);
          if (near) union(i, j);
        }
      }
    }
  }

  const groups = new Map();
  for (let i = 0; i < items.length; i++) {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(items[i]);
  }
  return [...groups.values()];
}

export function keypointsOf(e) {
  if (e.type === 'LINE' && e.vertices?.length >= 2) {
    return [e.vertices[0], e.vertices[1]];
  }
  if (e.type === 'CIRCLE' && e.center) {
    const c = e.center, r = e.radius;
    return [c, {x:c.x+r,y:c.y}, {x:c.x-r,y:c.y}, {x:c.x,y:c.y+r}, {x:c.x,y:c.y-r}];
  }
  if (e.type === 'ARC' && e.center) {
    const c = e.center, r = e.radius;
    const a0 = (e.startAngle || 0) * Math.PI / 180;
    const a1 = (e.endAngle   || 0) * Math.PI / 180;
    return [
      c,
      { x: c.x + r * Math.cos(a0), y: c.y + r * Math.sin(a0) },
      { x: c.x + r * Math.cos(a1), y: c.y + r * Math.sin(a1) },
    ];
  }
  if ((e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') && e.vertices) {
    return e.vertices;
  }
  return [];
}

// Bounding box de un cluster.
export function clusterBbox(cluster) {
  let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
  const push = (x, y) => {
    if (typeof x === 'number') { minX = Math.min(minX,x); maxX = Math.max(maxX,x); }
    if (typeof y === 'number') { minY = Math.min(minY,y); maxY = Math.max(maxY,y); }
  };
  for (const item of cluster) {
    for (const p of item.kps) push(p.x, p.y);
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}
