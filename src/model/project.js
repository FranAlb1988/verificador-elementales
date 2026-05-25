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

// Proyecto de ejemplo realista: estructura típica de partidor CCM como el
// plano CT-001M de RAJO INCA. Incluye:
//   - Sección de fuerza 480V 3F: alimentación, TTCC, contactor (representado
//     por sus contactos M en cada fase), motor con tierra.
//   - Transformador de control 480/120V.
//   - Circuito de control 120V con seal-in: EMERG → PARAR → (PARTIR ‖ M-seal)
//     → bobina M.
//   - Luces piloto FUNC (verde), DET (roja).
//   - IED (relé multifunción) como bloque.
//   - Bornera CCM ↔ CAMPO con la botonera externa.
export function exampleProject() {
  nextId = 1;
  const comps = [];
  const wires = [];

  // ============ SECCIÓN DE FUERZA 480V 3F ============
  const sup3 = c('supply-3ph', 40, 40, { voltage: 480 });        // L1=(40,60) L2=(40,80) L3=(40,100)

  // TTCC sobre L1 (decorativo, una fase)
  const ct1 = c('ct', 120, 40);                                   // P1=(120,60) P2=(160,60)

  // Contactor M (3 contactos NO, uno por fase). Estos representan los polos de
  // fuerza; comparten el tag "M" con la bobina del circuito de control.
  const polM1 = c('contact-no', 220, 40, { tag: 'M' });          // (240,40)-(240,80) → vertical
  const polM2 = c('contact-no', 280, 40, { tag: 'M' });
  const polM3 = c('contact-no', 340, 40, { tag: 'M' });

  // Motor 3F + tierra de protección
  const motor = c('motor', 440, 40, { tag: 'M1', hp: 40 });       // T1=(440,60) T2=(440,80) T3=(440,100) PE=(520,80)
  const gnd   = c('ground', 540, 20);                              // G=(560,20)

  comps.push(sup3, ct1, polM1, polM2, polM3, motor, gnd);

  // Wires fuerza: cada fase atraviesa TTCC (L1) o directo (L2/L3) → polo del
  // contactor → terminal del motor.
  wires.push(W(sup3, 'L1', ct1,   'P1'));     // L1 a TTCC
  wires.push(W(ct1,  'P2', polM1, '1'));     // TTCC al polo M1 superior (240,40)
  wires.push(W(polM1,'2',  motor, 'T1'));    // polo M1 inferior (240,80) al motor T1
  wires.push(W(sup3, 'L2', polM2, '1'));     // L2 directo al polo
  wires.push(W(polM2,'2',  motor, 'T2'));
  wires.push(W(sup3, 'L3', polM3, '1'));
  wires.push(W(polM3,'2',  motor, 'T3'));
  wires.push(W(motor,'PE', gnd,   'G'));

  // ============ TRANSFORMADOR DE CONTROL 480/120 ============
  // Primario alimentado entre L1 y L2 de fuerza
  const trafo = c('transformer', 40, 180, { primaryV: 480, secondaryV: 120 });
  // H1=(40,200) H2=(40,240) X1=(140,200) X2=(140,240)
  comps.push(trafo);
  wires.push(W(sup3, 'L1', trafo, 'H1'));    // 480V primario
  wires.push(W(sup3, 'L2', trafo, 'H2'));

  // ============ CIRCUITO DE CONTROL 120V (ladder vertical) ============
  // Riel L (de X1, columna x=200) baja por la columna central.
  // Riel N (de X2, columna x=560) baja por la derecha.

  // Junction inicial del riel L y N para distribuir
  const jL0 = c('junction', 190, 200);   // (200,200)
  const jN0 = c('junction', 550, 240);   // (560,250)
  comps.push(jL0, jN0);

  // Riel L: X1 → jL0 → ...
  wires.push(W(trafo, 'X1', jL0, 'W'));     // (140,200)→(190,210) horizontal
  // Riel N: X2 → jN0
  wires.push(W(trafo, 'X2', jN0, 'W'));

  // Rung 1 — bobina M con seal-in (columna principal x=200, derivación en x=300)
  const estop  = c('estop',         180, 260, { label: 'EMERG' });    // (200,260)-(200,300)
  const parar  = c('pushbutton-nc', 180, 300, { label: 'PARAR' });    // (200,300)-(200,340)
  const partir = c('pushbutton-no', 180, 340, { label: 'PARTIR' });   // (200,340)-(200,380)
  const seal   = c('contact-no',    280, 340, { tag: 'M' });          // (300,340)-(300,380) — paralelo a partir
  const coilM  = c('coil',          180, 380, { tag: 'M' });          // (200,380)-(200,420)
  comps.push(estop, parar, partir, seal, coilM);

  // jL0(200,220) → estop.1(200,260) baja por riel
  wires.push(W(jL0, 'S', estop, '1'));
  // estop.2(200,300) = parar.1(200,300) → contiguos (no need wire)
  // parar.2(200,340) = partir.1(200,340) → contiguos
  // partir.2(200,380) = coilM.A1(200,380) → contiguos
  // Seal en paralelo a partir: partir.1 ↔ seal.1, partir.2 ↔ seal.2
  wires.push(W(partir, '1', seal, '1'));
  wires.push(W(partir, '2', seal, '2'));
  // coilM.A2(200,420) → jN0 a través de junction intermedio
  const jN1 = c('junction', 550, 410); comps.push(jN1);    // (560,420)
  wires.push(W(coilM, 'A2', jN1, 'W'));
  wires.push(W(jN0, 'S', jN1, 'N'));   // riel N descendente

  // Rung 2 — Luz FUNC (verde): L → M NO → lamp → N (columna x=380)
  const mFunc = c('contact-no', 360, 260, { tag: 'M' });             // (380,260)-(380,300)
  const lampF = c('lamp',       360, 300, { color: 'green', label: 'FUNC' });
  comps.push(mFunc, lampF);
  // mFunc.1(380,260) → riel L (jL0 derivación)
  const jL1 = c('junction', 370, 250); comps.push(jL1);   // (380,260) ; ah jL1 N=(380,250)
  wires.push(W(jL0, 'E', jL1, 'W'));    // jL0(200,210) E=(210,210) → jL1.W(370,260) diagonal
  wires.push(W(jL1, 'S', mFunc, '1'));  // (380,260)→(380,260) mismo coord ✓
  // mFunc.2(380,300) = lampF.X1(380,300)
  // lampF.X2(380,340) → riel N
  const jN2 = c('junction', 550, 330); comps.push(jN2);   // (560,340)
  wires.push(W(lampF, 'X2', jN2, 'W'));
  wires.push(W(jN0, 'S', jN2, 'N'));     // ...ya conectado a jN0 (junction S es passthrough)

  // Rung 3 — Luz DET (roja): L → M NC → lamp → N (columna x=460)
  const mDet  = c('contact-nc', 440, 260, { tag: 'M' });             // (460,260)-(460,300)
  const lampD = c('lamp',       440, 300, { color: 'red', label: 'DET' });
  comps.push(mDet, lampD);
  const jL2 = c('junction', 450, 250); comps.push(jL2);
  wires.push(W(jL1, 'E', jL2, 'W'));
  wires.push(W(jL2, 'S', mDet, '1'));
  // mDet.2(460,300) = lampD.X1(460,300)
  wires.push(W(lampD, 'X2', jN2, 'E'));

  // ============ BORNERA CCM ↔ CAMPO (interfaz con botonera externa) ============
  // PARTIR field
  const bcCcmP = c('terminal', 100, 460, { location: 'CCM', number: '1' });
  const bcCmpP = c('terminal', 160, 460, { location: 'CAMPO', number: '1' });
  // PARAR field
  const bcCcmR = c('terminal', 220, 460, { location: 'CCM', number: '2' });
  const bcCmpR = c('terminal', 280, 460, { location: 'CAMPO', number: '2' });
  // EMERG field
  const bcCcmE = c('terminal', 340, 460, { location: 'CCM', number: '3' });
  const bcCmpE = c('terminal', 400, 460, { location: 'CAMPO', number: '3' });
  comps.push(bcCcmP, bcCmpP, bcCcmR, bcCmpR, bcCcmE, bcCmpE);

  // ============ IED (relé multifunción) ============
  const ied = c('ied', 660, 60, { tag: 'IED1' });
  comps.push(ied);
  // IED alimentación L/N (módulo base 120 VAC). Conectar a riel control.
  wires.push(W(jL0, 'N', ied, 'L'));    // (200,200) → IED.L=(660,80)
  wires.push(W(jN0, 'N', ied, 'N'));    // (560,240) → IED.N=(660,100)

  return { components: comps, wires };
}

function c(type, x, y, props) {
  const def = COMPONENT_TYPES[type];
  return { id: newId('c'), type, x, y, rot: 0, props: { ...def.defaultProps, ...props } };
}
function W(c1, t1, c2, t2) {
  return { id: newId('w'), from: { compId: c1.id, termId: t1 }, to: { compId: c2.id, termId: t2 } };
}
