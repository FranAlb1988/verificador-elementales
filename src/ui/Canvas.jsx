import React, { useRef, useState, useEffect } from 'react';
import { COMPONENT_TYPES, terminalAbsPos } from '../model/components.js';
import { GRID } from '../model/components.js';
import Symbol from './Symbol.jsx';
import { snap } from '../model/project.js';

export default function Canvas({
  project, netlist, simResult,
  mode, pending, selection,
  wireStart, setWireStart,
  onPlace, onSelect, onMove, onWire, onDelete,
  onButtonPress, simInputs,
}) {
  const svgRef = useRef(null);
  const [drag, setDrag] = useState(null); // {compId, dx, dy}

  const width = 1400;
  const height = 1000;

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

        {/* Wires */}
        {project.wires.map(wire => {
          const pa = endpointPos(wire.from, project, netlist);
          const pb = endpointPos(wire.to,   project, netlist);
          if (!pa || !pb) return null;
          const net = netlist.wireNet.get(wire.id);
          const power = simResult?.netPower.get(net);
          let cls = 'wire';
          if (mode === 'sim' && power) {
            if (power.L && power.N) cls += ' powered-both';
            else if (power.L) cls += ' powered-L';
            else if (power.N) cls += ' powered-N';
          }
          if (selection === wire.id) cls += ' selected';
          // path L-shape: H luego V
          const midX = pb.x;
          const d = `M ${pa.x} ${pa.y} L ${midX} ${pa.y} L ${pb.x} ${pb.y}`;
          return (
            <path key={wire.id} className={cls} d={d}
                  onClick={(e) => { e.stopPropagation(); if (mode === 'edit') onSelect(wire.id); }} />
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
              {def.terminals.map(t => (
                <circle key={t.id}
                        className={`terminal ${wireStart && wireStart.compId === comp.id && wireStart.termId === t.id ? 'wire-start' : ''}`}
                        cx={t.x} cy={t.y} r={3.5}
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
              ))}
            </g>
          );
        })}
      </svg>
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
