import React from 'react';
import { listByCategory } from '../model/components.js';

export default function Palette({ pending, onPick }) {
  const cats = listByCategory();
  return (
    <div className="palette">
      <h3>Componentes</h3>
      {Object.entries(cats).map(([cat, items]) => (
        <div key={cat}>
          <h3>{cat}</h3>
          {items.map(it => (
            <div key={it.type}
                 className={`palette-item ${pending === it.type ? 'active' : ''}`}
                 onClick={() => onPick(pending === it.type ? null : it.type)}
                 title={it.label}>
              <PaletteIcon type={it.type} />
              <span>{it.label}</span>
            </div>
          ))}
        </div>
      ))}
      <p style={{ fontSize: 11, color: '#6b7280', margin: '12px 4px' }}>
        Click un componente y luego en el lienzo para colocarlo. Click en un terminal para iniciar un cable; click en otro terminal para cerrarlo.
      </p>
    </div>
  );
}

function PaletteIcon({ type }) {
  const icons = {
    'supply':        <rect x={2} y={6} width={20} height={12} rx={2} fill="#fff" stroke="#111"/>,
    'supply-3ph':    <rect x={2} y={4} width={20} height={16} rx={2} fill="#fff" stroke="#111"/>,
    'transformer':   <><circle cx={8}  cy={12} r={5} fill="none" stroke="#111"/><circle cx={16} cy={12} r={5} fill="none" stroke="#111"/></>,
    'coil':          <circle cx={12} cy={12} r={6} fill="#fff" stroke="#111"/>,
    'contact-no':    <><line x1={12} y1={2}  x2={12} y2={8}  stroke="#111"/><line x1={12} y1={16} x2={12} y2={22} stroke="#111"/><line x1={5}  y1={8}  x2={19} y2={5}  stroke="#111"/></>,
    'contact-nc':    <><line x1={12} y1={2}  x2={12} y2={8}  stroke="#111"/><line x1={12} y1={16} x2={12} y2={22} stroke="#111"/><line x1={5}  y1={5}  x2={19} y2={9}  stroke="#111"/><line x1={4}  y1={9}  x2={20} y2={9}  stroke="#111"/></>,
    'pushbutton-no': <><line x1={12} y1={2}  x2={12} y2={7}  stroke="#111"/><line x1={4}  y1={7}  x2={20} y2={7}  stroke="#111"/><line x1={11} y1={2}  x2={13} y2={2}  stroke="#111"/><line x1={4}  y1={15} x2={20} y2={11} stroke="#111"/><line x1={12} y1={17} x2={12} y2={22} stroke="#111"/></>,
    'pushbutton-nc': <><line x1={12} y1={2}  x2={12} y2={7}  stroke="#111"/><line x1={4}  y1={11} x2={20} y2={11} stroke="#111"/><line x1={4}  y1={11} x2={20} y2={7}  stroke="#111"/><line x1={12} y1={17} x2={12} y2={22} stroke="#111"/></>,
    'estop':         <><circle cx={12} cy={6}  r={4} fill="#dc2626"/><line x1={4}  y1={14} x2={20} y2={10} stroke="#111"/><line x1={12} y1={17} x2={12} y2={22} stroke="#111"/></>,
    'lamp':          <><circle cx={12} cy={12} r={6} fill="#fde047" stroke="#111"/><line x1={8}  y1={8}  x2={16} y2={16} stroke="#111"/><line x1={16} y1={8}  x2={8}  y2={16} stroke="#111"/></>,
    'ground':        <><line x1={12} y1={4}  x2={12} y2={12} stroke="#111"/><line x1={6}  y1={12} x2={18} y2={12} stroke="#111"/><line x1={8}  y1={15} x2={16} y2={15} stroke="#111"/><line x1={10} y1={18} x2={14} y2={18} stroke="#111"/></>,
    'terminal':      <rect x={6} y={6} width={12} height={12} fill="#111"/>,
    'junction':      <circle cx={12} cy={12} r={3} fill="#111"/>,
    'motor':         <><circle cx={12} cy={12} r={9} fill="#fff" stroke="#111"/><text x={12} y={16} textAnchor="middle" fontSize="11" fontWeight="bold">M</text></>,
    'ct':            <><circle cx={9} cy={12} r={5} fill="none" stroke="#111"/><circle cx={15} cy={12} r={5} fill="none" stroke="#111"/></>,
    'ied':           <rect x={2} y={4} width={20} height={16} rx={3} fill="#fff" stroke="#111"/>,
  };
  return (
    <svg width={24} height={24} viewBox="0 0 24 24">
      {icons[type] || <rect x={4} y={4} width={16} height={16} fill="#fff" stroke="#111"/>}
    </svg>
  );
}
