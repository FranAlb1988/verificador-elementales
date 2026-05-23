// Renderiza el símbolo SVG de cada tipo de componente. Coordenadas locales:
// origen (0,0) en esquina superior izquierda; tamaño en COMPONENT_TYPES.
import React from 'react';

export default function Symbol({ comp, def, energized, conducts }) {
  const { w, h } = def.size;
  const inner = renderInner(comp, def, { energized, conducts });
  const tagText = comp.props.tag || comp.props.label || comp.props.number || '';
  return (
    <g>
      {inner}
      {tagText && (
        <text className="component-text component-tag"
              x={w + 4} y={12} textAnchor="start">{tagText}</text>
      )}
    </g>
  );
}

function renderInner(comp, def, state) {
  const { w, h } = def.size;
  switch (comp.type) {
    case 'supply':
      return (
        <>
          <rect className="component-body" x={0} y={0} width={w} height={h} rx={4} />
          <text className="component-text" x={w/2} y={h/2+4} textAnchor="middle">
            {comp.props.voltage || 120} V
          </text>
          <text className="component-text" x={6} y={h/2+4}>L</text>
          <text className="component-text" x={w-12} y={h/2+4}>N</text>
        </>
      );
    case 'supply-3ph':
      return (
        <>
          <rect className="component-body" x={0} y={0} width={w} height={h} rx={4} />
          <text className="component-text" x={w/2} y={h/2+4} textAnchor="middle">
            {comp.props.voltage || 480} V
          </text>
          <text className="component-text" x={12} y={24}>L1</text>
          <text className="component-text" x={12} y={44}>L2</text>
          <text className="component-text" x={12} y={64}>L3</text>
        </>
      );
    case 'transformer':
      return (
        <>
          <rect className="component-body" x={0} y={0} width={w} height={h} rx={4} />
          {/* dos bobinas estilizadas */}
          <path d="M 30 20 q 0 10 10 10 q -10 0 -10 10 q 0 10 10 10 q -10 0 -10 10 q 0 10 10 10" className="component-body" fill="none"/>
          <path d="M 70 20 q 0 10 -10 10 q 10 0 10 10 q 0 10 -10 10 q 10 0 10 10 q 0 10 -10 10" className="component-body" fill="none"/>
          <line x1={50} y1={20} x2={50} y2={60} stroke="#111827" strokeWidth={1}/>
          <text className="component-text" x={12} y={18}>H1</text>
          <text className="component-text" x={12} y={58}>H2</text>
          <text className="component-text" x={w-22} y={18}>X1</text>
          <text className="component-text" x={w-22} y={58}>X2</text>
        </>
      );
    case 'coil': {
      const on = state.energized;
      return (
        <>
          <circle cx={w/2} cy={h/2} r={14}
            className={`component-body ${on ? 'coil-on' : ''}`} />
          <line x1={w/2} y1={0} x2={w/2} y2={h/2-14} stroke="#111827" strokeWidth={1.5}/>
          <line x1={w/2} y1={h/2+14} x2={w/2} y2={h} stroke="#111827" strokeWidth={1.5}/>
        </>
      );
    }
    case 'contact-no': {
      const closed = state.conducts;
      const yClosed = h/2;
      const yOpen = h/2 - 8;
      return (
        <>
          <line x1={w/2} y1={0} x2={w/2} y2={h/2-4} stroke="#111827" strokeWidth={1.5}/>
          <line x1={w/2} y1={h/2+4} x2={w/2} y2={h} stroke="#111827" strokeWidth={1.5}/>
          {/* contacto: línea diagonal cuando abierto, horizontal cuando cerrado */}
          <line x1={w/2-8} y1={h/2-4} x2={w/2+8} y2={closed ? h/2-4 : yOpen}
                stroke={closed ? '#16a34a' : '#111827'} strokeWidth={2}/>
        </>
      );
    }
    case 'contact-nc': {
      const closed = state.conducts;
      return (
        <>
          <line x1={w/2} y1={0} x2={w/2} y2={h/2-4} stroke="#111827" strokeWidth={1.5}/>
          <line x1={w/2} y1={h/2+4} x2={w/2} y2={h} stroke="#111827" strokeWidth={1.5}/>
          <line x1={w/2-8} y1={h/2-4} x2={w/2+8} y2={closed ? h/2-4 : h/2-12}
                stroke={closed ? '#16a34a' : '#111827'} strokeWidth={2}/>
          {/* barra horizontal NC */}
          <line x1={w/2-10} y1={h/2-8} x2={w/2+10} y2={h/2-8}
                stroke={closed ? '#16a34a' : '#111827'} strokeWidth={1.5}/>
        </>
      );
    }
    case 'pushbutton-no': {
      const pressed = state.conducts; // si conduce, está presionado
      return (
        <>
          <line x1={w/2} y1={0} x2={w/2} y2={h/2-6} stroke="#111827" strokeWidth={1.5}/>
          <line x1={w/2} y1={h/2+6} x2={w/2} y2={h} stroke="#111827" strokeWidth={1.5}/>
          <line x1={w/2-10} y1={h/2-6} x2={w/2+10} y2={h/2-6} stroke="#111827" strokeWidth={1.5}/>
          <line x1={w/2-3} y1={h/2-6} x2={w/2-3} y2={h/2-12} stroke="#111827" strokeWidth={1.5}/>
          <line x1={w/2-7} y1={h/2-12} x2={w/2+1} y2={h/2-12} stroke="#111827" strokeWidth={1.5}/>
          {/* contacto */}
          <line x1={w/2-10} y1={h/2+6} x2={w/2+10} y2={pressed ? h/2+6 : h/2-2}
                stroke={pressed ? '#16a34a' : '#111827'} strokeWidth={2}/>
        </>
      );
    }
    case 'pushbutton-nc':
    case 'estop': {
      const pressed = !state.conducts; // NC: si no conduce, está presionado
      const isEstop = comp.type === 'estop';
      return (
        <>
          <line x1={w/2} y1={0} x2={w/2} y2={h/2-6} stroke="#111827" strokeWidth={1.5}/>
          <line x1={w/2} y1={h/2+6} x2={w/2} y2={h} stroke="#111827" strokeWidth={1.5}/>
          {isEstop ? (
            <circle cx={w/2} cy={h/2-12} r={6} fill="#dc2626" stroke="#7f1d1d" strokeWidth={1}/>
          ) : (
            <>
              <line x1={w/2-3} y1={h/2-6} x2={w/2-3} y2={h/2-12} stroke="#111827" strokeWidth={1.5}/>
              <line x1={w/2-7} y1={h/2-12} x2={w/2+1} y2={h/2-12} stroke="#111827" strokeWidth={1.5}/>
            </>
          )}
          <line x1={w/2-10} y1={h/2-6} x2={w/2+10} y2={pressed ? h/2-12 : h/2-6}
                stroke={pressed ? '#dc2626' : '#111827'} strokeWidth={2}/>
          {/* barra NC */}
          <line x1={w/2-10} y1={h/2-2} x2={w/2+10} y2={h/2-2} stroke="#111827" strokeWidth={1}/>
        </>
      );
    }
    case 'lamp': {
      const on = state.energized;
      const colorMap = { green: '#16a34a', red: '#dc2626', white: '#f3f4f6', yellow: '#facc15' };
      const fill = on ? (colorMap[comp.props.color] || '#fde047') : '#ffffff';
      return (
        <>
          <line x1={w/2} y1={0} x2={w/2} y2={h/2-10} stroke="#111827" strokeWidth={1.5}/>
          <line x1={w/2} y1={h/2+10} x2={w/2} y2={h} stroke="#111827" strokeWidth={1.5}/>
          <circle cx={w/2} cy={h/2} r={10} fill={fill} stroke="#111827" strokeWidth={1.5}/>
          <line x1={w/2-7} y1={h/2-7} x2={w/2+7} y2={h/2+7} stroke="#111827" strokeWidth={1}/>
          <line x1={w/2-7} y1={h/2+7} x2={w/2+7} y2={h/2-7} stroke="#111827" strokeWidth={1}/>
        </>
      );
    }
    case 'ground':
      return (
        <>
          <line x1={w/2} y1={0} x2={w/2} y2={h/2} stroke="#111827" strokeWidth={1.5}/>
          <line x1={w/2-10} y1={h/2}   x2={w/2+10} y2={h/2}   stroke="#111827" strokeWidth={2}/>
          <line x1={w/2-7}  y1={h/2+4} x2={w/2+7}  y2={h/2+4} stroke="#111827" strokeWidth={2}/>
          <line x1={w/2-4}  y1={h/2+8} x2={w/2+4}  y2={h/2+8} stroke="#111827" strokeWidth={2}/>
        </>
      );
    case 'terminal':
      return (
        <>
          <line x1={w/2} y1={0} x2={w/2} y2={h} stroke="#111827" strokeWidth={1.5}/>
          <rect className="component-body" x={w/2-8} y={h/2-8} width={16} height={16}
                fill={comp.props.location === 'CCM' ? '#111827' : '#ffffff'} />
          <text className="component-text" x={w/2} y={h/2+3} textAnchor="middle"
                fill={comp.props.location === 'CCM' ? '#ffffff' : '#111827'}>
            {comp.props.number || ''}
          </text>
        </>
      );
    case 'junction':
      return (
        <circle cx={w/2} cy={h/2} r={3.5} fill="#111827" />
      );
    case 'motor':
      return (
        <>
          <circle cx={w/2} cy={h/2} r={28} className="component-body"/>
          <text className="component-text" x={w/2} y={h/2+6} textAnchor="middle" fontSize="18" fontWeight="bold">M</text>
          <text className="component-text" x={w/2} y={h-4} textAnchor="middle">{comp.props.hp || ''} HP</text>
        </>
      );
    case 'ct':
      return (
        <>
          <circle cx={w/2-4} cy={h/2} r={10} className="component-body"/>
          <circle cx={w/2+4} cy={h/2} r={10} className="component-body"/>
          <line x1={0} y1={h/2} x2={w} y2={h/2} stroke="#111827" strokeWidth={1.5}/>
        </>
      );
    case 'ied':
      return (
        <>
          <rect className="component-body" x={0} y={0} width={w} height={h} rx={6}/>
          <text className="component-text" x={w/2} y={h/2+4} textAnchor="middle">IED</text>
          <text className="component-text" x={4} y={16}>L</text>
          <text className="component-text" x={4} y={36}>N</text>
          <text className="component-text" x={4} y={76}>IC</text>
          <text className="component-text" x={4} y={96}>I1</text>
          <text className="component-text" x={w-16} y={16}>Q1a</text>
          <text className="component-text" x={w-16} y={36}>Q1b</text>
          <text className="component-text" x={w-16} y={76}>Q2a</text>
          <text className="component-text" x={w-16} y={96}>Q2b</text>
        </>
      );
    default:
      return (
        <rect className="component-body" x={0} y={0} width={w} height={h}/>
      );
  }
}
