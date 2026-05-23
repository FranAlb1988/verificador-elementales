// Librería de componentes para elementales de control CCM.
// Cada tipo declara: terminales (con posición relativa), tamaño, props por defecto
// y un "rol eléctrico" que consume el motor de simulación / checks.

export const GRID = 20;

// roles:
//  source      : terminales con .role 'line' | 'neutral' que inyectan potencial
//  transformer : aísla dominios de tensión; secundario actúa como source
//  load        : 2 terminales; se energiza si uno está en L y el otro en N
//  switch      : conduce o no entre sus terminales según estado
//  passthrough : siempre conduce (borne, junction)
//  ground      : 1 terminal a potencial 'ground'
//  motor       : carga trifásica + tierra
//  block       : caja genérica (IED) con terminales; conducción manual vía sim
//  ct          : transformador de corriente — pasivo en simulación de control

export const COMPONENT_TYPES = {
  'supply': {
    label: 'Fuente 120 VAC',
    category: 'Fuentes',
    size: { w: 80, h: 40 },
    terminals: [
      { id: 'L', x: 0,  y: 20, role: 'line',    voltage: 120 },
      { id: 'N', x: 80, y: 20, role: 'neutral', voltage: 120 },
    ],
    defaultProps: { voltage: 120 },
    electrical: { role: 'source' },
  },

  'supply-3ph': {
    label: 'Fuente 480 V 3F',
    category: 'Fuentes',
    size: { w: 80, h: 80 },
    terminals: [
      { id: 'L1', x: 0, y: 20, role: 'L1', voltage: 480 },
      { id: 'L2', x: 0, y: 40, role: 'L2', voltage: 480 },
      { id: 'L3', x: 0, y: 60, role: 'L3', voltage: 480 },
    ],
    defaultProps: { voltage: 480 },
    electrical: { role: 'source' },
  },

  'transformer': {
    label: 'Transformador control',
    category: 'Fuentes',
    size: { w: 100, h: 80 },
    terminals: [
      { id: 'H1', x: 0,   y: 20, role: 'line',    voltage: 480, domain: 'pri' },
      { id: 'H2', x: 0,   y: 60, role: 'neutral', voltage: 480, domain: 'pri' },
      { id: 'X1', x: 100, y: 20, role: 'line',    voltage: 120, domain: 'sec' },
      { id: 'X2', x: 100, y: 60, role: 'neutral', voltage: 120, domain: 'sec' },
    ],
    defaultProps: { primaryV: 480, secondaryV: 120 },
    electrical: { role: 'transformer' },
  },

  'coil': {
    label: 'Bobina',
    category: 'Control',
    size: { w: 40, h: 40 },
    terminals: [
      { id: 'A1', x: 20, y: 0  },
      { id: 'A2', x: 20, y: 40 },
    ],
    defaultProps: { tag: 'K1' },
    electrical: { role: 'load', kind: 'coil' },
  },

  'contact-no': {
    label: 'Contacto NO',
    category: 'Control',
    size: { w: 40, h: 40 },
    terminals: [
      { id: '1', x: 20, y: 0  },
      { id: '2', x: 20, y: 40 },
    ],
    defaultProps: { tag: 'K1' },
    electrical: { role: 'switch', kind: 'contact', no: true },
  },

  'contact-nc': {
    label: 'Contacto NC',
    category: 'Control',
    size: { w: 40, h: 40 },
    terminals: [
      { id: '1', x: 20, y: 0  },
      { id: '2', x: 20, y: 40 },
    ],
    defaultProps: { tag: 'K1' },
    electrical: { role: 'switch', kind: 'contact', no: false },
  },

  'pushbutton-no': {
    label: 'Pulsador NO (partir)',
    category: 'Operador',
    size: { w: 40, h: 40 },
    terminals: [
      { id: '1', x: 20, y: 0  },
      { id: '2', x: 20, y: 40 },
    ],
    defaultProps: { label: 'PARTIR', maintained: false },
    electrical: { role: 'switch', kind: 'button', no: true },
  },

  'pushbutton-nc': {
    label: 'Pulsador NC (parar)',
    category: 'Operador',
    size: { w: 40, h: 40 },
    terminals: [
      { id: '1', x: 20, y: 0  },
      { id: '2', x: 20, y: 40 },
    ],
    defaultProps: { label: 'PARAR', maintained: false },
    electrical: { role: 'switch', kind: 'button', no: false },
  },

  'estop': {
    label: 'Parada emergencia',
    category: 'Operador',
    size: { w: 40, h: 40 },
    terminals: [
      { id: '1', x: 20, y: 0  },
      { id: '2', x: 20, y: 40 },
    ],
    defaultProps: { label: 'EMERG', maintained: true },
    electrical: { role: 'switch', kind: 'button', no: false },
  },

  'lamp': {
    label: 'Luz piloto',
    category: 'Operador',
    size: { w: 40, h: 40 },
    terminals: [
      { id: 'X1', x: 20, y: 0  },
      { id: 'X2', x: 20, y: 40 },
    ],
    defaultProps: { color: 'green', label: 'FUNC' },
    electrical: { role: 'load', kind: 'lamp' },
  },

  'ground': {
    label: 'Tierra',
    category: 'Otros',
    size: { w: 40, h: 40 },
    terminals: [
      { id: 'G', x: 20, y: 0 },
    ],
    defaultProps: {},
    electrical: { role: 'ground' },
  },

  'terminal': {
    label: 'Borne',
    category: 'Otros',
    size: { w: 40, h: 40 },
    terminals: [
      { id: 'A', x: 20, y: 0  },
      { id: 'B', x: 20, y: 40 },
    ],
    defaultProps: { number: '1', location: 'CCM' },
    electrical: { role: 'passthrough' },
  },

  'junction': {
    label: 'Nodo / unión',
    category: 'Otros',
    size: { w: 20, h: 20 },
    terminals: [
      { id: 'N', x: 10, y: 0  },
      { id: 'S', x: 10, y: 20 },
      { id: 'W', x: 0,  y: 10 },
      { id: 'E', x: 20, y: 10 },
    ],
    defaultProps: {},
    electrical: { role: 'passthrough' },
  },

  'motor': {
    label: 'Motor 3F',
    category: 'Fuerza',
    size: { w: 80, h: 80 },
    terminals: [
      { id: 'T1', x: 0,  y: 20, role: 'L1' },
      { id: 'T2', x: 0,  y: 40, role: 'L2' },
      { id: 'T3', x: 0,  y: 60, role: 'L3' },
      { id: 'PE', x: 80, y: 40, role: 'ground' },
    ],
    defaultProps: { tag: 'M1', hp: 40 },
    electrical: { role: 'motor' },
  },

  'ct': {
    label: 'TT/CC',
    category: 'Fuerza',
    size: { w: 40, h: 40 },
    terminals: [
      { id: 'P1', x: 0,  y: 20 },
      { id: 'P2', x: 40, y: 20 },
    ],
    defaultProps: { ratio: '100/5' },
    electrical: { role: 'passthrough' },
  },

  'ied': {
    label: 'Relé inteligente (IED)',
    category: 'Control',
    size: { w: 120, h: 120 },
    terminals: [
      // Alimentación módulo base 120VAC
      { id: 'L',  x: 0,   y: 20  },
      { id: 'N',  x: 0,   y: 40  },
      // Entradas digitales 120VAC (común y entradas)
      { id: 'IC', x: 0,   y: 80  },
      { id: 'I1', x: 0,   y: 100 },
      // Salidas: dos contactos (Q1, Q2)
      { id: 'Q1a', x: 120, y: 20 },
      { id: 'Q1b', x: 120, y: 40 },
      { id: 'Q2a', x: 120, y: 80 },
      { id: 'Q2b', x: 120, y: 100 },
    ],
    defaultProps: { tag: 'IED1' },
    electrical: { role: 'block', outputs: ['Q1', 'Q2'] },
  },
};

export function listByCategory() {
  const cats = {};
  for (const [type, def] of Object.entries(COMPONENT_TYPES)) {
    const cat = def.category || 'Otros';
    if (!cats[cat]) cats[cat] = [];
    cats[cat].push({ type, ...def });
  }
  return cats;
}

// Rota un punto (x,y) sobre la caja (w,h) en pasos de 90°.
export function rotatePoint(x, y, w, h, rot) {
  const r = ((rot % 360) + 360) % 360;
  switch (r) {
    case 90:  return { x: h - y, y: x };
    case 180: return { x: w - x, y: h - y };
    case 270: return { x: y,     y: w - x };
    default:  return { x, y };
  }
}

// Tamaño de la caja considerando rotación.
export function rotatedSize(w, h, rot) {
  const r = ((rot % 360) + 360) % 360;
  if (r === 90 || r === 270) return { w: h, h: w };
  return { w, h };
}

// Posición absoluta de un terminal de una instancia de componente.
export function terminalAbsPos(comp) {
  const def = COMPONENT_TYPES[comp.type];
  const out = {};
  for (const t of def.terminals) {
    const r = rotatePoint(t.x, t.y, def.size.w, def.size.h, comp.rot || 0);
    out[t.id] = { x: comp.x + r.x, y: comp.y + r.y, def: t };
  }
  return out;
}
