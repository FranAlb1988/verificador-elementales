import React, { useRef, useState, useEffect } from 'react';
import { COMPONENT_TYPES, terminalAbsPos } from '../model/components.js';
import { GRID } from '../model/components.js';
import Symbol from './Symbol.jsx';
import DxfBackground from './DxfBackground.jsx';
import { snap } from '../model/project.js';

export default function Canvas({
  project, netlist, simResult,
  mode, pending, selection,
  wireStart, setWireStart,
  onPlace, onSelect, onMove, onWire, onDelete,
  onButtonPress, simInputs,
  dxf, dxfScale, showDxf, planeOnly,
}) {
  const svgRef = useRef(null);
  const [drag, setDrag] = useState(null); // {compId, dx, dy}

  // Canvas se adapta al DXF si está presente.
  let width = 1400, height = 1000;
  if (dxf && dxf.bbox) {
    const w = (dxf.bbox.maxX - dxf.bbox.minX) * dxfScale + 80;
    const h = (dxf.bbox.maxY - dxf.bbox.minY) * dxfScale + 80;
    width = Math.max(width, Math.ceil(w));
    height = Math.max(height, Math.ceil(h));
  }

  const screenToSvg = (clientX, clientY) => {
    const r = svgRef.current.getBoundingClientRect();
    return { x: clientX - r.left, y: clientY - r.top };
  };

  const handleSvgClick = (e) => {
    if (mode !== 'edit') return;
    if (pending) {
      const { x, y } = screenToSvg(e.clientX, e.clientY);
      onPlace(pending, x, y);
      return;
    }
    if (e.target === svgRef.current || e.target.classList.contains('grid-bg')) {
      onSelect(null);
      setWireStart(null);
    }
  };

  const handleMouseMove = (e) => {
    if (drag) {
      const { x, y } = screenToSvg(e.clientX, e.clientY);
      onMove(drag.compId, x - drag.dx, y - drag.dy);
    }
  };

  const handleMouseUp = () => setDrag(null);

  useEffect(() => {
    const onKey = (e) => {
      if (mode !== 'edit') return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selection) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
        onDelete(selection);
      }
      if (e.key === 'Escape') {
        setWireStart(null);
        onSelect(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, selection, onDelete, onSelect, setWireStart]);

  // Estadísticas para la leyenda
  const looseWires = project.wires.filter(w => !w.from?.compId || !w.to?.compId).length;
  const danglingTerms = [...netlist.nets.values()].filter(n =>
    n.terminals.length === 1 &&
    !(project.components.find(c => c.id === n.terminals[0].compId)?.type === 'junction')
  ).length;

  return (
    <div className="canvas-wrap" onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}>
      <svg ref={svgRef}
           className={`canvas-svg mode-${mode} ${pending ? 'placing' : ''} ${wireStart ? 'wiring' : ''}`}
           width={width} height={height}
           onClick={handleSvgClick}>
        <defs>
          <pattern id="gridPattern" width={GRID} height={GRID} patternUnits="userSpaceOnUse">
            <circle cx={0} cy={0} r={0.7} fill="#cbd5e1" />
          </pattern>
        </defs>
        <rect className="grid-bg" x={0} y={0} width={width} height={height} />

        {/* DXF background */}
        {dxf && showDxf && (
          <DxfBackground dxf={dxf} scale={dxfScale} offsetX={40} offsetY={40} opacity={1} />
        )}

        {/* Si Solo plano: no renderizar wires ni componentes (solo el DXF fiel) */}
        {!planeOnly && (
        <>
        {/* Wires */}
        {project.wires.map(wire => {
          const pa = endpointPos(wire.from, project, netlist);
          const pb = endpointPos(wire.to,   project, netlist);
          if (!pa || !pb) return null;
          const net = netlist.wireNet.get(wire.id);
          const power = simResult?.netPower.get(net);
          // ¿Algún endpoint no está conectado a un terminal?
          const looseA = !wire.from?.compId;
          const looseB = !wire.to?.compId;
          let cls = 'wire';
          if (mode === 'sim' && power) {
            if (power.L && power.N) cls += ' powered-both';
            else if (power.L) cls += ' powered-L';
            else if (power.N) cls += ' powered-N';
          } else if (looseA || looseB) {
            cls += ' loose';
          }
          if (selection === wire.id) cls += ' selected';
          const midX = pb.x;
          const d = `M ${pa.x} ${pa.y} L ${midX} ${pa.y} L ${pb.x} ${pb.y}`;
          return (
            <g key={wire.id}>
              <path className={cls} d={d}
                    onClick={(e) => { e.stopPropagation(); if (mode === 'edit') onSelect(wire.id); }} />
              {looseA && mode !== 'sim' && <circle className="wire-endpoint-loose" cx={pa.x} cy={pa.y} r={2.5} />}
              {looseB && mode !== 'sim' && <circle className="wire-endpoint-loose" cx={pb.x} cy={pb.y} r={2.5} />}
            </g>
          );
        })}

        {/* Components */}
        {project.components.map(comp => {
          const def = COMPONENT_TYPES[comp.type];
          if (!def) return null;
          const rotated = comp.rot || 0;
          const tp = terminalAbsPos(comp);

          // Estado para render
          const energized = simResult ? simResult.loadEnergized.get(comp.id) : false;
          const tag = comp.props.tag;
          const coilOn = tag ? !!simResult?.coilEnergized.get(tag) : false;
          let conducts = false;
          if (def.electrical.role === 'switch') {
            if (def.electrical.kind === 'contact') {
              conducts = def.electrical.no ? coilOn : !coilOn;
            } else if (def.electrical.kind === 'button') {
              const pressed = !!simInputs.buttons[comp.id];
              conducts = def.electrical.no ? pressed : !pressed;
            }
          }

          const isClickableInSim = mode === 'sim' &&
            def.electrical.role === 'switch' && def.electrical.kind === 'button';

          return (
            <g key={comp.id}
               className={`component-group ${selection === comp.id ? 'selected' : ''} ${isClickableInSim ? 'clickable' : ''}`}
               transform={`translate(${comp.x},${comp.y}) rotate(${rotated} ${def.size.w/2} ${def.size.h/2})`}
               onMouseDown={(e) => {
                 if (mode === 'edit') {
                   e.stopPropagation();
                   onSelect(comp.id);
                   const r = svgRef.current.getBoundingClientRect();
                   setDrag({ compId: comp.id, dx: e.clientX - r.left - comp.x, dy: e.clientY - r.top - comp.y });
                 }
               }}
               onClick={(e) => {
                 if (mode === 'sim' && isClickableInSim) {
                   e.stopPropagation();
                   onButtonPress(comp.id, 'toggle');
                 }
               }}>
              <Symbol comp={comp} def={def} energized={energized || coilOn} conducts={conducts} />
              {/* Terminales */}
              {def.terminals.map(t => {
                // ¿Este terminal está colgando? (nadie más en su net)
                const netId = netlist.termNet.get(`${comp.id}.${t.id}`);
                const net = netId ? netlist.nets.get(netId) : null;
                const dangling = mode !== 'sim' && net && net.terminals.length <= 1
                  && def.electrical.role !== 'block' && comp.type !== 'junction';
                const isWireStart = wireStart && wireStart.compId === comp.id && wireStart.termId === t.id;
                return (
                  <circle key={t.id}
                          className={`terminal ${isWireStart ? 'wire-start' : ''} ${dangling ? 'dangling' : ''}`}
                          cx={t.x} cy={t.y} r={dangling ? 4.5 : 3.5}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (mode !== 'edit') return;
                            if (!wireStart) {
                              setWireStart({ compId: comp.id, termId: t.id });
                            } else if (wireStart.compId === comp.id && wireStart.termId === t.id) {
                              setWireStart(null);
                            } else {
                              onWire(wireStart, { compId: comp.id, termId: t.id });
                              setWireStart(null);
                            }
                          }} />
                );
              })}
            </g>
          );
        })}
        </>
        )}
      </svg>

      {mode !== 'sim' && !planeOnly && (looseWires > 0 || danglingTerms > 0) && (
        <div className="legend">
          <div className="row">
            <svg width="22" height="6">
              <line x1="0" y1="3" x2="22" y2="3" stroke="#ef4444" strokeWidth="1.8" strokeDasharray="5 3" />
              <circle cx="22" cy="3" r="2.5" fill="#ef4444" stroke="#b91c1c" />
            </svg>
            <span>{looseWires} cables sin terminal</span>
          </div>
          <div className="row">
            <svg width="22" height="14"><circle cx="11" cy="7" r="4.5" fill="#fee2e2" stroke="#ef4444" strokeWidth="2"/></svg>
            <span>{danglingTerms} terminales sin conexión</span>
          </div>
        </div>
      )}
      {mode === 'sim' && (
        <div className="legend">
          <div className="row"><svg width="22" height="6"><line x1="0" y1="3" x2="22" y2="3" stroke="#dc2626" strokeWidth="2"/></svg><span>Línea (L)</span></div>
          <div className="row"><svg width="22" height="6"><line x1="0" y1="3" x2="22" y2="3" stroke="#2563eb" strokeWidth="2"/></svg><span>Neutro (N)</span></div>
          <div className="row"><svg width="22" height="6"><line x1="0" y1="3" x2="22" y2="3" stroke="#f97316" strokeWidth="3"/></svg><span>Cortocircuito</span></div>
        </div>
      )}
    </div>
  );
}

function endpointPos(ep, project, netlist) {
  if (!ep) return null;
  if (ep.compId) {
    const c = project.components.find(c => c.id === ep.compId);
    if (!c) return null;
    const tp = terminalAbsPos(c);
    return tp[ep.termId] || null;
  }
  return { x: ep.x, y: ep.y };
}
