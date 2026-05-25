// Panel de tagging: muestra cada patrón único encontrado, con thumbnail,
// nº de instancias, y dropdown para asignar tipo de componente.
import React, { useMemo, useState } from 'react';
import { COMPONENT_TYPES } from '../model/components.js';
import { TAG_OPTIONS } from '../import/tagOptions.js';

export default function TaggingPanel({ patterns, assignments, onAssign, onApply, onClear }) {
  const [filter, setFilter] = useState('relevant'); // relevant | all
  const shown = useMemo(() => {
    if (filter === 'all') return patterns;
    return patterns.filter(p => p.count >= 2 || assignments[p.sig]);
  }, [patterns, filter, assignments]);
  const totalInstances = patterns.reduce((s, p) => s + p.count, 0);
  // Cuenta tanto los tags asignados explícitos como las sugerencias automáticas.
  const suggValue = (s) => typeof s === 'string' ? s : (s?.value || null);
  const effective = (p) => assignments[p.sig] || suggValue(p.suggestion);
  const tagged = patterns.filter(p => effective(p));
  const taggedCount = tagged.length;
  const suggestedCount = tagged.filter(p => !assignments[p.sig] && p.suggestion).length;
  const willPlace = tagged.reduce((s, p) => s + p.count, 0);

  return (
    <div style={{ padding: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h3 style={{ margin: 0, fontSize: 11, color: '#6b7280' }}>
          {patterns.length} patrones · {totalInstances} instancias
        </h3>
        <select value={filter} onChange={e => setFilter(e.target.value)}
                style={{ fontSize: 11, padding: '2px 4px' }}>
          <option value="relevant">Solo ≥2 inst.</option>
          <option value="all">Todos</option>
        </select>
      </div>

      {shown.map(p => (
        <PatternRow key={p.sig} pattern={p}
                    type={assignments[p.sig] || ''}
                    suggested={suggValue(p.suggestion)}
                    suggestedProps={typeof p.suggestion === 'object' ? p.suggestion?.props : null}
                    onChange={t => onAssign(p.sig, t)} />
      ))}

      <div style={{ position: 'sticky', bottom: 0, background: '#fff',
                    borderTop: '1px solid #e5e7eb', padding: '8px 4px', marginTop: 12 }}>
        <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6 }}>
          {taggedCount} patrones tagueados ({suggestedCount} sugerencia auto) → colocará {willPlace} componentes
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={onApply} disabled={taggedCount === 0}
                  style={{ flex: 1, padding: '6px 8px', background: '#2563eb', color: '#fff',
                           border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12,
                           opacity: taggedCount === 0 ? 0.4 : 1 }}>
            Aplicar
          </button>
          <button onClick={onClear}
                  style={{ padding: '6px 8px', background: '#f3f4f6', border: '1px solid #d1d5db',
                           borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>
            Limpiar tags
          </button>
        </div>
      </div>
    </div>
  );
}

function PatternRow({ pattern, type, suggested, suggestedProps, onChange }) {
  const fp = pattern.fp;
  const isSuggested = !!suggested && !type;
  const showValue = type || suggested || '';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px',
                  borderBottom: '1px solid #f3f4f6' }}>
      <Thumbnail cluster={pattern.representative} size={48} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600 }}>
          ×{pattern.count}
          {isSuggested && (
            <span style={{ marginLeft: 6, fontSize: 9, color: '#2563eb',
                            background: '#dbeafe', padding: '1px 4px', borderRadius: 3 }}>
              sugerido{suggestedProps?.ansi ? ` · ANSI ${suggestedProps.ansi}` : ''}
            </span>
          )}
        </div>
        <div style={{ fontSize: 10, color: '#6b7280' }}>
          L:{fp.counts.lines} C:{fp.counts.circles} A:{fp.counts.arcs} P:{fp.counts.polys} · {fp.bbox.w}×{fp.bbox.h}
        </div>
        <select value={showValue} onChange={e => onChange(e.target.value)}
                style={{ width: '100%', fontSize: 11, marginTop: 3, padding: '2px 4px',
                         borderColor: isSuggested ? '#2563eb' : '#d1d5db',
                         background: isSuggested ? '#eff6ff' : '#fff' }}>
          {TAG_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

// Renderiza un cluster como SVG pequeño, escalado al cuadro.
function Thumbnail({ cluster, size }) {
  let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
  for (const item of cluster) {
    for (const p of item.kps) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }
  }
  const w = maxX - minX || 1, h = maxY - minY || 1;
  const pad = 2;
  const scale = Math.min((size - pad*2) / w, (size - pad*2) / h);
  // Y-flip
  const T = (p) => ({ x: (p.x - minX) * scale + pad, y: (maxY - p.y) * scale + pad });
  return (
    <svg width={size} height={size} style={{ background: '#fafafa', border: '1px solid #e5e7eb',
                                              borderRadius: 3, flexShrink: 0 }}>
      {cluster.map((item, i) => {
        const e = item.entity;
        if (e.type === 'LINE') {
          const a = T(e.vertices[0]), b = T(e.vertices[1]);
          return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#111" strokeWidth={0.8} />;
        }
        if (e.type === 'CIRCLE') {
          const c = T(e.center);
          return <circle key={i} cx={c.x} cy={c.y} r={e.radius * scale} fill="none" stroke="#111" strokeWidth={0.8} />;
        }
        if (e.type === 'ARC') {
          const r = e.radius * scale;
          const a0 = (e.startAngle || 0) * Math.PI / 180;
          const a1 = (e.endAngle   || 0) * Math.PI / 180;
          const p0 = T({ x: e.center.x + e.radius * Math.cos(a0), y: e.center.y + e.radius * Math.sin(a0) });
          const p1 = T({ x: e.center.x + e.radius * Math.cos(a1), y: e.center.y + e.radius * Math.sin(a1) });
          let large = ((a1 - a0 + 2 * Math.PI) % (2 * Math.PI)) > Math.PI ? 1 : 0;
          return <path key={i} d={`M ${p0.x} ${p0.y} A ${r} ${r} 0 ${large} 0 ${p1.x} ${p1.y}`}
                       fill="none" stroke="#111" strokeWidth={0.8} />;
        }
        if (e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') {
          const pts = (e.vertices || []).map(T).map(p => `${p.x},${p.y}`).join(' ');
          return <polyline key={i} points={pts} fill="none" stroke="#111" strokeWidth={0.8} />;
        }
        return null;
      })}
    </svg>
  );
}
