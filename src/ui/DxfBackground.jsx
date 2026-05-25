// Renderiza un DXF (entidades normalizadas) como capa SVG de fondo.
// Aplica un transform que invierte Y (CAD usa Y-up; SVG usa Y-down) y traslada
// el bbox al origen, con factor de escala configurable.
import React from 'react';

// Estilo "plano de ingeniería": casi todo negro como en AutoCAD impreso.
// Solo unas líneas finas en colores tenues para distinguir capas auxiliares.
const LAYER_COLORS = {
  'JRI_EL-Simbología':         '#000000',
  'JRI_EL-Alambrado Interno':  '#000000',
  'JRI_EL-Alambrado Externo':  '#000000',
  'JRI_EL-Alimentación BT':    '#000000',
  'JRI_EL-Módulo':             '#000000',
  'JRI_EL-Barra':              '#000000',
  'JRI_EL-Equipo eléctrico':   '#000000',
  'JRI_CM-Texto':              '#000000',
  'JRI_CM-Titulos':            '#000000',
  'JRI_CM-Cotas':              '#6b7280',
  'FTEX_SUBTIT':               '#000000',
  'FORMATO_LG':                '#94a3b8',
  'JRI_CM-Ventanas':           '#94a3b8',
  '0':                         '#000000',
};

const colorFor = (layer) => LAYER_COLORS[layer] || '#000000';

export default function DxfBackground({ dxf, scale, offsetX, offsetY, opacity = 1 }) {
  if (!dxf || !dxf.entities) return null;
  const T = ({ x, y }) => ({
    x: (x - dxf.bbox.minX) * scale + offsetX,
    y: (dxf.bbox.maxY - y) * scale + offsetY,
  });
  // Stroke width un poco más grueso para que se vea como plano impreso
  const sw = Math.max(0.6, 0.9 * scale);

  return (
    <g style={{ opacity, pointerEvents: 'none' }}>
      {dxf.entities.map((e, i) => renderEntity(e, i, T, sw, scale))}
    </g>
  );
}

function renderEntity(e, i, T, sw, scale) {
  const c = colorFor(e.layer);
  switch (e.type) {
    case 'LINE': {
      if (!e.vertices || e.vertices.length < 2) return null;
      const a = T(e.vertices[0]), b = T(e.vertices[1]);
      return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={c} strokeWidth={sw} />;
    }
    case 'CIRCLE': {
      const p = T(e.center);
      return <circle key={i} cx={p.x} cy={p.y} r={e.radius * scale} fill="none" stroke={c} strokeWidth={sw} />;
    }
    case 'ARC': {
      const r = e.radius * scale;
      const a0 = (e.startAngle || 0) * Math.PI / 180;
      const a1 = (e.endAngle   || 0) * Math.PI / 180;
      const p0 = T({ x: e.center.x + e.radius * Math.cos(a0), y: e.center.y + e.radius * Math.sin(a0) });
      const p1 = T({ x: e.center.x + e.radius * Math.cos(a1), y: e.center.y + e.radius * Math.sin(a1) });
      let large = ((a1 - a0 + 2 * Math.PI) % (2 * Math.PI)) > Math.PI ? 1 : 0;
      return <path key={i} d={`M ${p0.x} ${p0.y} A ${r} ${r} 0 ${large} 0 ${p1.x} ${p1.y}`} fill="none" stroke={c} strokeWidth={sw} />;
    }
    case 'LWPOLYLINE':
    case 'POLYLINE': {
      if (!e.vertices) return null;
      const pts = e.vertices.map(T).map(p => `${p.x},${p.y}`).join(' ');
      return <polyline key={i} points={pts} fill="none" stroke={c} strokeWidth={sw} />;
    }
    case 'TEXT':
    case 'MTEXT': {
      const p = T(e.position || e.startPoint);
      const text = (e.text || e.string || '').replace(/\\[A-Z][^;]*;/g, '').trim();
      if (!text) return null;
      const h = (e.height || e.textHeight || 2.5) * scale;
      return (
        <text key={i} x={p.x} y={p.y} fontSize={Math.max(5, h)} fill={c}
              style={{ fontFamily: 'monospace' }}>
          {text}
        </text>
      );
    }
    case 'SOLID': {
      if (!e.points) return null;
      const pts = e.points.map(T).map(p => `${p.x},${p.y}`).join(' ');
      return <polygon key={i} points={pts} fill={c} stroke={c} strokeWidth={sw} />;
    }
    case 'HATCH': {
      // Renderiza el HATCH como polígono(s) cerrados de sus boundaries.
      const paths = [];
      const boundaries = e.boundaries || [];
      for (const b of boundaries) {
        if (!Array.isArray(b) || b.length === 0) continue;
        const pts = b.map(v => v && typeof v.x === 'number' ? T(v) : null).filter(Boolean);
        if (pts.length < 3) continue;
        paths.push(pts.map(p => `${p.x},${p.y}`).join(' '));
      }
      if (paths.length === 0) return null;
      return <g key={i}>
        {paths.map((d, k) => (
          <polygon key={k} points={d} fill={c} stroke="none" />
        ))}
      </g>;
    }
    case 'ELLIPSE': {
      if (!e.center || !e.majorAxisEndPoint) return null;
      const cp = T(e.center);
      const rx = Math.hypot(e.majorAxisEndPoint.x || 0, e.majorAxisEndPoint.y || 0) * scale;
      const ry = rx * (e.axisRatio || 1);
      if (!Number.isFinite(rx) || !Number.isFinite(ry) || rx <= 0) return null;
      return <ellipse key={i} cx={cp.x} cy={cp.y} rx={rx} ry={ry} fill="none" stroke={c} strokeWidth={sw} />;
    }
    default:
      return null;
  }
}
