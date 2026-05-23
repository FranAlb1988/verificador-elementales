// Parseo de DXF y normalización a estructura interna.
import DxfParser from 'dxf-parser';

export function parseDxf(text) {
  const dxf = new DxfParser().parseSync(text);
  const blocks = dxf.blocks || {};
  const entities = expandEntities(dxf.entities || [], blocks);
  const bbox = computeBbox(entities);
  const layers = {};
  for (const e of entities) {
    const k = e.layer || '?';
    layers[k] = (layers[k] || 0) + 1;
  }
  return { entities, bbox, layers, raw: dxf };
}

// Expande INSERT (referencias a bloques) en su geometría real, transformada.
function expandEntities(ents, blocks, depth = 0) {
  if (depth > 4) return [];
  const out = [];
  for (const e of ents) {
    if (e.type === 'INSERT') {
      const block = blocks[e.name];
      if (block && block.entities) {
        const sx = e.xScale ?? 1;
        const sy = e.yScale ?? 1;
        const rot = (e.rotation || 0) * Math.PI / 180;
        const cos = Math.cos(rot), sin = Math.sin(rot);
        const ox = e.position?.x || 0, oy = e.position?.y || 0;
        const ix = block.position?.x || 0, iy = block.position?.y || 0;
        const transform = (p) => {
          // Restar el basepoint del bloque, escalar, rotar, trasladar
          const x0 = (p.x - ix) * sx;
          const y0 = (p.y - iy) * sy;
          return { x: ox + x0 * cos - y0 * sin, y: oy + x0 * sin + y0 * cos };
        };
        const sub = expandEntities(block.entities, blocks, depth + 1);
        for (const s of sub) {
          out.push(transformEntity(s, transform, e.layer));
        }
      }
    } else {
      out.push(e);
    }
  }
  return out;
}

function transformEntity(e, T, parentLayer) {
  const layer = e.layer === '0' ? parentLayer : (e.layer || parentLayer);
  if (e.type === 'LINE') {
    return { ...e, layer, vertices: e.vertices.map(T) };
  }
  if (e.type === 'CIRCLE' || e.type === 'ARC') {
    return { ...e, layer, center: T(e.center) };
  }
  if (e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') {
    return { ...e, layer, vertices: e.vertices.map(T) };
  }
  if (e.type === 'TEXT' || e.type === 'MTEXT') {
    const p = e.position || e.startPoint;
    return { ...e, layer, position: T(p) };
  }
  if (e.type === 'SOLID') {
    return { ...e, layer, points: (e.points || []).map(T) };
  }
  if (e.type === 'ELLIPSE') {
    return { ...e, layer, center: T(e.center) };
  }
  return { ...e, layer };
}

export function computeBbox(entities) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const push = (x, y) => {
    if (typeof x === 'number' && Number.isFinite(x)) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    }
    if (typeof y === 'number' && Number.isFinite(y)) {
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
  };
  for (const e of entities) {
    if (e.type === 'LINE' && e.vertices) for (const v of e.vertices) push(v.x, v.y);
    else if (e.type === 'CIRCLE' || e.type === 'ARC') {
      const c = e.center;
      if (c) { push(c.x - e.radius, c.y - e.radius); push(c.x + e.radius, c.y + e.radius); }
    }
    else if (e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') {
      for (const v of (e.vertices || [])) push(v.x, v.y);
    }
    else if (e.type === 'TEXT' || e.type === 'MTEXT') {
      const p = e.position || e.startPoint;
      if (p) push(p.x, p.y);
    }
    else if (e.type === 'SOLID' && e.points) for (const v of e.points) push(v.x, v.y);
    else if (e.type === 'ELLIPSE' && e.center) push(e.center.x, e.center.y);
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}
