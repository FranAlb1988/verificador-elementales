import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { COMPONENT_TYPES } from './model/components.js';
import { emptyProject, exampleProject, newComponent, newWire, serialize, deserialize, snap } from './model/project.js';
import { buildNetlist } from './model/netlist.js';
import { runChecks } from './engine/checks.js';
import { simulate } from './engine/simulation.js';
import { parseDxf } from './import/dxf.js';
import { recognize } from './import/recognize.js';
import { extractPatterns, loadSavedTags, saveTags } from './import/patterns.js';
import { optionFor } from './import/tagOptions.js';
import Canvas from './ui/Canvas.jsx';
import Palette from './ui/Palette.jsx';
import SidePanel from './ui/SidePanel.jsx';

export default function App() {
  const [project, setProject] = useState(() => exampleProject());
  const [mode, setMode] = useState('edit');
  const [pending, setPending] = useState(null);
  const [selection, setSelection] = useState(null);
  const [wireStart, setWireStart] = useState(null);
  const [tab, setTab] = useState('checks');
  const [simInputs, setSimInputs] = useState({ buttons: {}, iedOutputs: {} });
  const [dxf, setDxf] = useState(null);
  const [dxfScale, setDxfScale] = useState(0.3);
  const [showDxf, setShowDxf] = useState(true);
  const [patterns, setPatterns] = useState(null);          // [{sig, fp, count, ...}]
  const [tagAssignments, setTagAssignments] = useState({}); // sig → componentType

  const netlist = useMemo(() => buildNetlist(project), [project]);
  const findings = useMemo(() => runChecks(project, netlist), [project, netlist]);
  const prevCoilsRef = useRef(new Map());
  const simResult = useMemo(() => {
    if (mode !== 'sim') return null;
    const r = simulate(project, netlist, simInputs, prevCoilsRef.current);
    prevCoilsRef.current = new Map(r.coilEnergized);
    return r;
  }, [project, netlist, simInputs, mode]);

  // Acciones sobre el proyecto
  const placeComponent = useCallback((type, x, y) => {
    setProject(p => ({ ...p, components: [...p.components, newComponent(type, x, y)] }));
    setPending(null);
  }, []);

  const moveComponent = useCallback((id, x, y) => {
    setProject(p => ({
      ...p,
      components: p.components.map(c => c.id === id ? { ...c, x: snap(x), y: snap(y) } : c),
    }));
  }, []);

  const updateProp = useCallback((id, key, value) => {
    setProject(p => ({
      ...p,
      components: p.components.map(c => c.id === id ? { ...c, props: { ...c.props, [key]: value } } : c),
    }));
  }, []);

  const rotateComponent = useCallback((id) => {
    setProject(p => ({
      ...p,
      components: p.components.map(c => c.id === id ? { ...c, rot: ((c.rot || 0) + 90) % 360 } : c),
    }));
  }, []);

  const deleteThing = useCallback((id) => {
    setProject(p => {
      const isWire = p.wires.find(w => w.id === id);
      if (isWire) return { ...p, wires: p.wires.filter(w => w.id !== id) };
      return {
        components: p.components.filter(c => c.id !== id),
        wires: p.wires.filter(w =>
          !(w.from?.compId === id) && !(w.to?.compId === id)
        ),
      };
    });
    setSelection(null);
  }, []);

  const addWire = useCallback((from, to) => {
    setProject(p => ({ ...p, wires: [...p.wires, newWire(from, to)] }));
  }, []);

  const togglePress = useCallback((compId, pressed) => {
    setSimInputs(s => ({ ...s, buttons: { ...s.buttons, [compId]: pressed } }));
  }, []);

  const toggleIed = useCallback((key, on) => {
    setSimInputs(s => ({ ...s, iedOutputs: { ...s.iedOutputs, [key]: on } }));
  }, []);

  // Cuando entras en sim, resetea presiones momentáneas y memoria de bobinas.
  useEffect(() => {
    if (mode === 'sim') {
      prevCoilsRef.current = new Map();
      setSimInputs(s => {
        const buttons = { ...s.buttons };
        for (const c of project.components) {
          const d = COMPONENT_TYPES[c.type];
          if (d?.electrical.role === 'switch' && d.electrical.kind === 'button' && !c.props.maintained) {
            buttons[c.id] = false;
          }
        }
        return { ...s, buttons };
      });
    }
  }, [mode]); // intencional: solo al cambiar modo

  const newProject = () => {
    if (!confirm('¿Crear proyecto vacío? Se perderán los cambios sin guardar.')) return;
    setProject(emptyProject());
    setSelection(null);
  };

  const loadExample = () => {
    if (!confirm('¿Cargar proyecto de ejemplo? Se perderán los cambios sin guardar.')) return;
    setProject(exampleProject());
    setSelection(null);
  };

  const saveProject = () => {
    const text = serialize(project);
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'elemental.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const loadProject = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        setProject(deserialize(reader.result));
        setSelection(null);
      } catch (err) {
        alert(`No se pudo cargar el archivo: ${err.message}`);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const importDxf = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = parseDxf(reader.result);
        if (!parsed.bbox) throw new Error('DXF sin entidades reconocibles');
        setDxf(parsed);
        setShowDxf(true);
        // Auto-ajustar escala para encajar ~1400 de ancho
        const w = parsed.bbox.maxX - parsed.bbox.minX;
        const h = parsed.bbox.maxY - parsed.bbox.minY;
        const s = Math.min(1400 / Math.max(w, 1), 4000 / Math.max(h, 1));
        setDxfScale(Math.max(0.1, Math.min(1, s)));
      } catch (err) {
        alert(`No se pudo leer el DXF: ${err.message}`);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const runRecognize = () => {
    if (!dxf) return;
    // 1) Cables (extracción directa por layer).
    const r = recognize(dxf, { scale: dxfScale });
    // 2) Patrones de símbolos (clustering + fingerprint).
    const { patterns: pats } = extractPatterns(dxf);
    // 3) Pre-asignar tags guardados en localStorage por firma idéntica.
    const saved = loadSavedTags();
    const auto = {};
    for (const p of pats) if (saved[p.sig]) auto[p.sig] = saved[p.sig];
    setPatterns(pats);
    setTagAssignments(auto);
    // 4) Volcar wires (+ motor si lo detectó por heurística separada) al proyecto.
    const replace = project.components.length === 0 ||
      confirm(`Encontrados ${pats.length} patrones únicos (${pats.reduce((s,p)=>s+p.count,0)} instancias) y ${r.wires.length} cables.\n¿Reemplazar el proyecto actual?`);
    setProject(p => replace
      ? { components: r.components, wires: r.wires }
      : { components: [...p.components, ...r.components], wires: [...p.wires, ...r.wires] });
    setSelection(null);
    setTab('tagging');
  };

  const assignTag = (sig, type) => {
    setTagAssignments(a => {
      const next = { ...a };
      if (type) next[sig] = type; else delete next[sig];
      return next;
    });
  };

  const applyTags = () => {
    if (!patterns) return;
    const bbox = dxf.bbox;
    const T = (p) => ({
      x: Math.round((p.x - bbox.minX) * dxfScale + 40),
      y: Math.round((bbox.maxY - p.y) * dxfScale + 40),
    });
    const newComps = [];
    // Tags efectivos = asignación explícita o sugerencia automática.
    const effective = {};
    for (const p of patterns) {
      const v = tagAssignments[p.sig] || p.suggestion;
      if (v) effective[p.sig] = v;
    }
    for (const p of patterns) {
      const tagVal = effective[p.sig];
      const opt = optionFor(tagVal);
      if (!opt || !opt.type) continue;
      const def = COMPONENT_TYPES[opt.type];
      if (!def) continue;
      for (const inst of p.instances) {
        const ctr = inst.fp.center;
        const eCtr = T(ctr);
        newComps.push({
          id: `c${Date.now().toString(36)}${Math.random().toString(36).slice(2,6)}-${newComps.length}`,
          type: opt.type,
          x: eCtr.x - def.size.w / 2,
          y: eCtr.y - def.size.h / 2,
          rot: 0,
          props: { ...def.defaultProps, ...(opt.props || {}) },
        });
      }
    }
    setProject(p => ({ ...p, components: [...p.components, ...newComps] }));
    // Persistir asignaciones (explícitas, no sugerencias automáticas — el usuario las acepta al confirmar)
    const saved = loadSavedTags();
    saveTags({ ...saved, ...effective });
    alert(`Colocados ${newComps.length} componentes. ${Object.keys(effective).length} firmas guardadas.`);
  };

  const clearTags = () => setTagAssignments({});

  const errCount = findings.filter(f => f.severity === 'error').length;
  const warnCount = findings.filter(f => f.severity === 'warning').length;

  return (
    <div className="app">
      <div className="toolbar">
        <h1>Verificador de Elementales</h1>
        <button className={mode === 'edit' ? 'active' : ''} onClick={() => setMode('edit')}>Editar</button>
        <button className={mode === 'sim' ? 'active' : ''} onClick={() => { setMode('sim'); setTab('sim'); }}>Simular</button>
        <span style={{ width: 16 }} />
        <button onClick={newProject}>Nuevo</button>
        <button onClick={loadExample}>Ejemplo</button>
        <button onClick={saveProject}>Guardar JSON</button>
        <label style={{ position: 'relative', overflow: 'hidden' }}>
          Cargar JSON
          <input type="file" accept="application/json"
                 onChange={loadProject}
                 style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
        </label>
        <label style={{ position: 'relative', overflow: 'hidden' }}>
          Importar DXF
          <input type="file" accept=".dxf"
                 onChange={importDxf}
                 style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
        </label>
        {dxf && (
          <>
            <button className={showDxf ? 'active' : ''} onClick={() => setShowDxf(s => !s)} title="Mostrar/ocultar fondo DXF">
              Fondo {showDxf ? 'ON' : 'OFF'}
            </button>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '0 6px' }}>
              Zoom
              <input type="range" min="0.1" max="2" step="0.05" value={dxfScale}
                     onChange={e => setDxfScale(parseFloat(e.target.value))}
                     style={{ width: 90 }} />
              <span style={{ width: 32 }}>{dxfScale.toFixed(2)}x</span>
            </label>
            <button onClick={runRecognize} title="Reconocer símbolos y cables del DXF">Reconocer</button>
            <button onClick={() => { setDxf(null); }} title="Quitar DXF">×</button>
          </>
        )}
        <div className="spacer" />
        <span style={{ fontSize: 12 }}>
          <span style={{ color: '#fca5a5', marginRight: 8 }}>● {errCount} errores</span>
          <span style={{ color: '#fcd34d' }}>● {warnCount} avisos</span>
        </span>
      </div>
      <div className="main">
        <Palette pending={pending} onPick={setPending} />
        <Canvas
          project={project}
          netlist={netlist}
          simResult={simResult}
          mode={mode}
          pending={pending}
          selection={selection}
          wireStart={wireStart}
          setWireStart={setWireStart}
          simInputs={simInputs}
          dxf={dxf} dxfScale={dxfScale} showDxf={showDxf}
          onPlace={placeComponent}
          onSelect={(id) => { setSelection(id); if (id && project.components.find(c=>c.id===id)) setTab('props'); }}
          onMove={moveComponent}
          onWire={addWire}
          onDelete={deleteThing}
          onButtonPress={(id, kind) => {
            const c = project.components.find(x => x.id === id);
            if (!c) return;
            const maint = !!c.props.maintained;
            if (maint) togglePress(id, !simInputs.buttons[id]);
            else { togglePress(id, true); setTimeout(() => togglePress(id, false), 200); }
          }}
        />
        <SidePanel
          tab={tab} setTab={setTab}
          project={project} selection={selection}
          onUpdateProp={updateProp}
          onRotate={rotateComponent}
          onDelete={deleteThing}
          findings={findings}
          simInputs={simInputs}
          onTogglePress={togglePress}
          onToggleIed={toggleIed}
          mode={mode}
          simResult={simResult}
          patterns={patterns}
          tagAssignments={tagAssignments}
          onAssignTag={assignTag}
          onApplyTags={applyTags}
          onClearTags={clearTags}
        />
      </div>
    </div>
  );
}
