import React from 'react';
import { COMPONENT_TYPES } from '../model/components.js';
import TaggingPanel from './TaggingPanel.jsx';

export default function SidePanel({
  tab, setTab,
  project, selection, onUpdateProp, onRotate, onDelete,
  findings, simInputs, onTogglePress, onToggleIed,
  mode, simResult,
  patterns, tagAssignments, onAssignTag, onApplyTags, onClearTags,
}) {
  return (
    <div className="side">
      <div className="tabs">
        <button className={tab === 'props' ? 'active' : ''} onClick={() => setTab('props')}>Props</button>
        <button className={tab === 'checks' ? 'active' : ''} onClick={() => setTab('checks')}>Chequeos</button>
        <button className={tab === 'sim' ? 'active' : ''} onClick={() => setTab('sim')}>Sim</button>
        {patterns && (
          <button className={tab === 'tagging' ? 'active' : ''} onClick={() => setTab('tagging')}>
            Tagging
          </button>
        )}
      </div>
      {tab === 'props' && <PropsTab project={project} selection={selection} onUpdateProp={onUpdateProp} onRotate={onRotate} onDelete={onDelete} />}
      {tab === 'checks' && <ChecksTab findings={findings} project={project} />}
      {tab === 'sim' && <SimTab project={project} mode={mode} simInputs={simInputs} simResult={simResult} onTogglePress={onTogglePress} onToggleIed={onToggleIed} />}
      {tab === 'tagging' && patterns && (
        <TaggingPanel patterns={patterns} assignments={tagAssignments}
                      onAssign={onAssignTag} onApply={onApplyTags} onClear={onClearTags} />
      )}
    </div>
  );
}

function PropsTab({ project, selection, onUpdateProp, onRotate, onDelete }) {
  const comp = project.components.find(c => c.id === selection);
  if (!comp) {
    return <div className="props"><p style={{ color: '#6b7280', padding: 8 }}>Selecciona un componente para editar sus propiedades.</p></div>;
  }
  const def = COMPONENT_TYPES[comp.type];
  return (
    <div className="props" style={{ padding: 4 }}>
      <h3>{def.label}</h3>
      <p style={{ fontSize: 11, color: '#6b7280', margin: '4px 0' }}>ID: {comp.id}</p>
      <div className="row">
        <button onClick={() => onRotate(comp.id)}>Rotar 90°</button>
        <button onClick={() => onDelete(comp.id)}>Eliminar</button>
      </div>
      {Object.entries(def.defaultProps).map(([key, val]) => (
        <div key={key}>
          <label>{key}</label>
          {typeof val === 'boolean' ? (
            <select value={String(comp.props[key])} onChange={e => onUpdateProp(comp.id, key, e.target.value === 'true')}>
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          ) : key === 'color' ? (
            <select value={comp.props[key]} onChange={e => onUpdateProp(comp.id, key, e.target.value)}>
              <option value="green">verde</option>
              <option value="red">rojo</option>
              <option value="white">blanco</option>
              <option value="yellow">amarillo</option>
            </select>
          ) : key === 'location' ? (
            <select value={comp.props[key]} onChange={e => onUpdateProp(comp.id, key, e.target.value)}>
              <option value="CCM">CCM</option>
              <option value="CAMPO">CAMPO</option>
              <option value="PLC">PLC / DCS</option>
              <option value="VARIADOR">VARIADOR</option>
              <option value="SWITCHGEAR">SWITCHGEAR</option>
            </select>
          ) : (
            <input value={comp.props[key] ?? ''} onChange={e => {
              const v = typeof val === 'number' ? Number(e.target.value) : e.target.value;
              onUpdateProp(comp.id, key, v);
            }} />
          )}
        </div>
      ))}
    </div>
  );
}

function ChecksTab({ findings, project }) {
  const order = { error: 0, warning: 1, info: 2, ok: 3 };
  const sorted = [...findings].sort((a, b) => order[a.severity] - order[b.severity]);
  return (
    <div className="results">
      <h3>Resultados ({findings.length})</h3>
      {sorted.map((f, i) => (
        <div key={i} className="result-item">
          <span className={`sev ${f.severity}`}>{f.severity.toUpperCase()}</span>
          <div>
            <div>{f.message}</div>
            {f.related && f.related.length > 0 && (
              <div style={{ color: '#6b7280', fontSize: 11 }}>
                {f.related.map(id => idLabel(id, project)).join(', ')}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function idLabel(id, project) {
  const c = project.components.find(x => x.id === id);
  if (!c) return id;
  const tag = c.props.tag || c.props.label || c.props.number;
  return tag ? `${c.id}(${tag})` : c.id;
}

function SimTab({ project, mode, simInputs, simResult, onTogglePress, onToggleIed }) {
  const buttons = project.components.filter(c => {
    const d = COMPONENT_TYPES[c.type];
    return d && d.electrical.role === 'switch' && d.electrical.kind === 'button';
  });
  const ieds = project.components.filter(c => COMPONENT_TYPES[c.type]?.electrical.role === 'block');
  if (mode !== 'sim') {
    return <div style={{ padding: 8, color: '#6b7280' }}>Cambia a modo Simulación en la barra superior para interactuar.</div>;
  }
  return (
    <div className="sim-panel" style={{ padding: 4 }}>
      <h3>Botones / Operador</h3>
      {buttons.length === 0 && <p style={{ color: '#6b7280' }}>Sin botones.</p>}
      {buttons.map(b => {
        const d = COMPONENT_TYPES[b.type];
        const maint = !!b.props.maintained;
        const pressed = !!simInputs.buttons[b.id];
        const label = b.props.label || d.label;
        return (
          <button key={b.id}
                  className={pressed ? (maint ? 'latched' : 'pressed') : ''}
                  onMouseDown={() => { if (!maint) onTogglePress(b.id, true); }}
                  onMouseUp={() => { if (!maint) onTogglePress(b.id, false); }}
                  onMouseLeave={() => { if (!maint && pressed) onTogglePress(b.id, false); }}
                  onClick={() => { if (maint) onTogglePress(b.id, !pressed); }}>
            {label} {maint ? (pressed ? '[ACTIVO]' : '[normal]') : ''} {pressed && !maint ? '◉' : ''}
          </button>
        );
      })}

      {ieds.length > 0 && <h3>Salidas IED</h3>}
      {ieds.map(ied => {
        const def = COMPONENT_TYPES[ied.type];
        return (def.electrical.outputs || []).map(out => {
          const key = `${ied.id}.${out}`;
          const on = !!simInputs.iedOutputs[key];
          return (
            <button key={key} className={on ? 'latched' : ''}
                    onClick={() => onToggleIed(key, !on)}>
              {ied.props.tag || ied.id} · {out} {on ? '[CERRADO]' : '[abierto]'}
            </button>
          );
        });
      })}

      <h3>Estado bobinas</h3>
      {[...(simResult?.coilEnergized || new Map())].map(([tag, on]) => (
        <div key={tag} style={{ padding: '4px 8px', borderBottom: '1px solid #f3f4f6' }}>
          <span style={{ display: 'inline-block', width: 12, height: 12, marginRight: 6, borderRadius: 6,
                         background: on ? '#16a34a' : '#cbd5e1' }} />
          {tag} {on ? 'energizada' : 'apagada'}
        </div>
      ))}

      {simResult?.oscillating && (
        <div className="result-item">
          <span className="sev warning">OSC</span>
          <div>La simulación no se estabiliza (circuito oscilante)</div>
        </div>
      )}
    </div>
  );
}
