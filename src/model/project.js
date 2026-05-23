import { COMPONENT_TYPES, GRID } from './components.js';

let nextId = 1;
export function newId(prefix = 'c') {
  return `${prefix}${nextId++}`;
}
export function resetIds(project) {
  let max = 0;
  for (const c of project.components) {
    const m = /(\d+)$/.exec(c.id);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  for (const w of project.wires) {
    const m = /(\d+)$/.exec(w.id);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  nextId = max + 1;
}

export function emptyProject() {
  return { components: [], wires: [] };
}

export function newComponent(type, x, y) {
  const def = COMPONENT_TYPES[type];
  if (!def) throw new Error(`Tipo desconocido: ${type}`);
  return {
    id: newId('c'),
    type,
    x: snap(x), y: snap(y),
    rot: 0,
    props: { ...def.defaultProps },
  };
}

export function newWire(from, to) {
  return { id: newId('w'), from, to };
}

export function snap(v) {
  return Math.round(v / GRID) * GRID;
}

export function serialize(project) {
  return JSON.stringify(project, null, 2);
}

export function deserialize(text) {
  const p = JSON.parse(text);
  if (!p.components || !p.wires) throw new Error('Archivo de proyecto inválido');
  resetIds(p);
  return p;
}

// Proyecto de ejemplo: ladder de partidor M con seal-in, parada de emergencia,
// parar, partir y luces FUNC (verde) y DET (roja). Réplica simplificada del
// plano CT-001M, con componentes alineados verticalmente para que los
// terminales coincidan por coordenadas (sin necesidad de cables extra).
export function exampleProject() {
  nextId = 1;
  const comps = [];
  const wires = [];

  // Fuente 120 VAC arriba. L=(60,80) N=(140,80)
  const sup = c('supply', 60, 60, { voltage: 120 });

  // Rung principal (columna x=80) — la chain L → estop → parar → (partir||mAux) → coilM → N
  const estop  = c('estop',         60, 100, { label: 'EMERG', maintained: true });
  const parar  = c('pushbutton-nc', 60, 140, { label: 'PARAR', maintained: false });
  const partir = c('pushbutton-no', 60, 180, { label: 'PARTIR', maintained: false });
  const coilM  = c('coil',          60, 220, { tag: 'M' });

  // Seal-in: contacto M NO en paralelo con PARTIR (columna x=160)
  const mAuxSeal = c('contact-no', 140, 180, { tag: 'M' });

  // Lámpara FUNC (verde): rama L → M NO → lampF → N (columna x=240)
  const mAuxFunc = c('contact-no', 220, 100, { tag: 'M' });
  const lampF    = c('lamp',       220, 140, { color: 'green', label: 'FUNC' });

  // Lámpara DET (roja): rama L → M NC → lampD → N (columna x=320)
  const mAuxDet  = c('contact-nc', 300, 100, { tag: 'M' });
  const lampD    = c('lamp',       300, 140, { color: 'red',   label: 'DET' });

  comps.push(sup, estop, parar, partir, coilM, mAuxSeal, mAuxFunc, lampF, mAuxDet, lampD);

  // Cableado.
  // Riel L: supply.L (60,80) → estop.1 (80,100)
  wires.push(W(sup, 'L', estop, '1'));
  // estop, parar, partir, coilM están apilados verticalmente: sus terminales
  // contiguos coinciden por coordenada (no se necesitan cables intermedios).

  // Seal-in: mAuxSeal en paralelo con partir.
  //   partir.1 (80,180) ↔ mAuxSeal.1 (160,180)
  //   partir.2 (80,220) ↔ mAuxSeal.2 (160,220)
  wires.push(W(partir,   '1', mAuxSeal, '1'));
  wires.push(W(partir,   '2', mAuxSeal, '2'));

  // Retorno N: coilM.A2 (80,260) → supply.N (140,80)
  wires.push(W(coilM, 'A2', sup, 'N'));

  // Rama FUNC: L (supply.L 60,80) → mAuxFunc.1 (240,100)
  wires.push(W(sup, 'L', mAuxFunc, '1'));
  // mAuxFunc, lampF apilados: mAuxFunc.2 (240,140) = lampF.X1 (240,140)
  // lampF.X2 (240,180) → supply.N (140,80)
  wires.push(W(lampF, 'X2', sup, 'N'));

  // Rama DET: L → mAuxDet.1 (320,100)
  wires.push(W(sup, 'L', mAuxDet, '1'));
  // mAuxDet, lampD apilados: mAuxDet.2 (320,140) = lampD.X1 (320,140)
  // lampD.X2 (320,180) → supply.N
  wires.push(W(lampD, 'X2', sup, 'N'));

  return { components: comps, wires };
}

function c(type, x, y, props) {
  const def = COMPONENT_TYPES[type];
  return { id: newId('c'), type, x, y, rot: 0, props: { ...def.defaultProps, ...props } };
}
function W(c1, t1, c2, t2) {
  return { id: newId('w'), from: { compId: c1.id, termId: t1 }, to: { compId: c2.id, termId: t2 } };
}
