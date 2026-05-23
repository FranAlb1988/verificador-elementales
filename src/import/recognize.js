// Reconocedor geométrico: DXF → componentes + cables.
// Estrategia primera pasada:
//   1. Cables: LINEs en layers de alambrado/barra (con confianza alta).
//   2. Componentes circulares: bobinas (r≈1), luces (r≈2-3 con X), motor (r≥4 con "M").
//   3. Resto: clasificable iterativamente (contactos, botones, IED, etc.).
//
// Coords: el DXF está en unidades CAD; las transformamos a coords del editor
// usando la misma proyección que DxfBackground (scale, offset, flip Y).

import { COMPONENT_TYPES } from '../model/components.js';
import { newId } from '../model/project.js';

const WIRE_LAYERS = new Set([
  'JRI_EL-Alambrado Interno',
  'JRI_EL-Alambrado Externo',
  'JRI_EL-Alimentación BT',
  'JRI_EL-Barra',
]);
const SYMBOL_LAYERS = new Set([
  'JRI_EL-Simbología',
  'JRI_EL-Módulo',
  'JRI_EL-Equipo eléctrico',
]);

export function recognize(dxfData, opts) {
  const { scale, offsetX = 40, offsetY = 40 } = opts;
  const bbox = dxfData.bbox;
  const T = (p) => ({
    x: (p.x - bbox.minX) * scale + offsetX,
    y: (bbox.maxY - p.y) * scale + offsetY,
  });

  const components = [];
  const wires = [];
  const report = { components: 0, wires: 0, byType: {}, unknownClusters: 0 };

  // --- 1) Cables ---
  for (const e of dxfData.entities) {
    if (e.type !== 'LINE') continue;
    if (!WIRE_LAYERS.has(e.layer)) continue;
    const a = T(e.vertices[0]);
    const b = T(e.vertices[1]);
    wires.push({
      id: newId('w'),
      from: { x: round(a.x), y: round(a.y) },
      to:   { x: round(b.x), y: round(b.y) },
    });
  }
  report.wires = wires.length;

  // También LWPOLYLINE en layers de cable: descomponer en segmentos rectos.
  for (const e of dxfData.entities) {
    if (e.type !== 'LWPOLYLINE') continue;
    if (!WIRE_LAYERS.has(e.layer)) continue;
    for (let i = 0; i < e.vertices.length - 1; i++) {
      const a = T(e.vertices[i]);
      const b = T(e.vertices[i+1]);
      wires.push({
        id: newId('w'),
        from: { x: round(a.x), y: round(a.y) },
        to:   { x: round(b.x), y: round(b.y) },
      });
      report.wires++;
    }
  }

  // --- 2) Componentes circulares ---
  const circles = dxfData.entities.filter(e =>
    e.type === 'CIRCLE' && SYMBOL_LAYERS.has(e.layer)
  );
  const texts = dxfData.entities.filter(e =>
    (e.type === 'TEXT' || e.type === 'MTEXT')
  );

  for (const c of circles) {
    const r = c.radius;
    const ctr = T(c.center);
    // Texto interior cercano (radio≤2)
    const inner = texts.find(t => {
      const p = t.position || t.startPoint;
      return p && Math.hypot(p.x - c.center.x, p.y - c.center.y) <= r * 1.1;
    });
    const innerText = (inner?.text || inner?.string || '').trim();

    // Clasificación por radio + contenido
    let type = null, props = {};
    if (r >= 3.5 && innerText === 'M') {
      type = 'motor';
      props = { tag: nearestTagText(c.center, texts, r * 4) || 'M1', hp: 40 };
    } else if (r >= 1.5 && r < 3.5) {
      // Posible luz piloto (círculo con X). ¿Hay líneas diagonales que cruzan?
      const hasX = countDiagonalsThroughCircle(dxfData.entities, c) >= 2;
      if (hasX) {
        type = 'lamp';
        const tagText = nearestTagText(c.center, texts, r * 6);
        const color = tagText && /FALLA/i.test(tagText) ? 'white'
                    : tagText && /(DET|PARAD)/i.test(tagText) ? 'red'
                    : 'green';
        props = { color, label: tagText || 'L' };
      }
    }
    // Nota: los círculos r≈1 en este DXF son marcadores de terminal, NO bobinas.
    // No los clasificamos como componentes — los cables ya capturan la conectividad.

    if (type) {
      const def = COMPONENT_TYPES[type];
      // Posicionar de manera que el centro visual del símbolo del editor coincida con c.center
      const x = round(ctr.x - def.size.w / 2);
      const y = round(ctr.y - def.size.h / 2);
      components.push({
        id: newId('c'), type, x, y, rot: 0,
        props: { ...def.defaultProps, ...props },
      });
      report.byType[type] = (report.byType[type] || 0) + 1;
      report.components++;
    }
  }

  return { components, wires, report };
}

function round(v) { return Math.round(v); }

function nearestTagText(point, texts, maxDist) {
  let best = null, bestD = maxDist;
  for (const t of texts) {
    const p = t.position || t.startPoint;
    if (!p) continue;
    const txt = (t.text || t.string || '').trim();
    if (!txt) continue;
    // Excluir textos largos (notas) y números puros de borneros
    if (txt.length > 12) continue;
    const d = Math.hypot(p.x - point.x, p.y - point.y);
    if (d < bestD) { bestD = d; best = txt; }
  }
  return best;
}

function countDiagonalsThroughCircle(entities, c) {
  let n = 0;
  for (const e of entities) {
    if (e.type !== 'LINE') continue;
    const a = e.vertices[0], b = e.vertices[1];
    const dx = b.x - a.x, dy = b.y - a.y;
    if (Math.abs(dx) < 0.1 || Math.abs(dy) < 0.1) continue; // no diagonal
    // ¿pasa cerca del centro?
    const dist = pointLineDist(c.center, a, b);
    if (dist <= c.radius * 0.7) {
      // ¿ambos endpoints cerca del círculo?
      const da = Math.hypot(a.x - c.center.x, a.y - c.center.y);
      const db = Math.hypot(b.x - c.center.x, b.y - c.center.y);
      if (da <= c.radius * 1.4 && db <= c.radius * 1.4) n++;
    }
  }
  return n;
}

function pointLineDist(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const L2 = dx*dx + dy*dy;
  if (L2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2));
  const px = a.x + t * dx, py = a.y + t * dy;
  return Math.hypot(p.x - px, p.y - py);
}
