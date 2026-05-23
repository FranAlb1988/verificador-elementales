// Firma geométrica de un cluster, rotación-invariante.
// Se basa en: conteos de cada tipo de entidad, set de radios (round 0.1),
// set ordenado de largos de línea (round 0.1), y dimensiones de bbox ordenadas
// (de modo que un símbolo a 0° y a 90° tengan la misma firma).

export function fingerprint(cluster) {
  let lc = 0, cc = 0, ac = 0, pc = 0;
  const radii = [], lineLengths = [], polyLengths = [], arcRadii = [];
  let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;

  for (const { entity: e } of cluster) {
    if (e.type === 'LINE') {
      lc++;
      const a = e.vertices[0], b = e.vertices[1];
      lineLengths.push(round(Math.hypot(b.x-a.x, b.y-a.y), 1));
      pushBB(a, b);
    } else if (e.type === 'CIRCLE') {
      cc++;
      radii.push(round(e.radius, 1));
      const c = e.center, r = e.radius;
      pushBB({x:c.x-r,y:c.y-r}, {x:c.x+r,y:c.y+r});
    } else if (e.type === 'ARC') {
      ac++;
      arcRadii.push(round(e.radius, 1));
      // Aproximamos bbox como caja circunscrita
      const c = e.center, r = e.radius;
      pushBB({x:c.x-r,y:c.y-r}, {x:c.x+r,y:c.y+r});
    } else if (e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') {
      pc++;
      const verts = e.vertices || [];
      let L = 0;
      for (let i = 1; i < verts.length; i++) {
        L += Math.hypot(verts[i].x - verts[i-1].x, verts[i].y - verts[i-1].y);
      }
      polyLengths.push(round(L, 1));
      for (const v of verts) pushBB(v, v);
    }
  }

  lineLengths.sort((a,b)=>a-b);
  radii.sort((a,b)=>a-b);
  arcRadii.sort((a,b)=>a-b);
  polyLengths.sort((a,b)=>a-b);

  const w = round(maxX - minX, 1), h = round(maxY - minY, 1);
  const dims = [w, h].sort((a,b) => a - b);
  const aspect = dims[1] === 0 ? 0 : round(dims[1] / dims[0], 2);

  const sig = `n=${lc}-${cc}-${ac}-${pc}` +
              `|r=${radii.join(',')}` +
              `|ar=${arcRadii.join(',')}` +
              `|L=${lineLengths.join(',')}` +
              `|P=${polyLengths.join(',')}` +
              `|d=${dims.join('x')}`;

  return {
    sig,
    counts: { lines: lc, circles: cc, arcs: ac, polys: pc },
    bbox: { minX, minY, maxX, maxY, w, h },
    center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
    aspect,
  };

  function pushBB(a, b) {
    if (typeof a.x === 'number') { minX = Math.min(minX, a.x); maxX = Math.max(maxX, a.x); }
    if (typeof a.y === 'number') { minY = Math.min(minY, a.y); maxY = Math.max(maxY, a.y); }
    if (typeof b.x === 'number') { minX = Math.min(minX, b.x); maxX = Math.max(maxX, b.x); }
    if (typeof b.y === 'number') { minY = Math.min(minY, b.y); maxY = Math.max(maxY, b.y); }
  }
}

function round(v, d) { const f = 10 ** d; return Math.round(v * f) / f; }

// Agrupa clusters por firma idéntica. Devuelve { signature → { fp, instances: [{cluster, fp}] } }
export function groupByFingerprint(clusters) {
  const groups = new Map();
  for (const cluster of clusters) {
    const fp = fingerprint(cluster);
    if (!groups.has(fp.sig)) groups.set(fp.sig, { fp, instances: [] });
    groups.get(fp.sig).instances.push({ cluster, fp });
  }
  return groups;
}
