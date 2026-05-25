// Tabla de códigos ANSI/IEEE de funciones de protección y medida según
// Lámina 603 del Anexo G CODELCO/JRI.
// El número (o letra) dentro de un círculo indica la función.

export const ANSI_CODES = {
  '21':    'Relé de protección de distancia',
  '21N':   'Relé de distancia de falla a tierra',
  '26':    'Relé de temperatura del aceite',
  '26Q':   'Relé de temperatura del aceite',
  '27':    'Relé de bajo voltaje',
  '30':    'Relé de alarma',
  '47':    'Relé de secuencia de fases',
  '49':    'Relé de temperatura de enrollados',
  '50':    'Relé de sobrecorriente instantáneo',
  '50/51': 'Relé de sobrecorriente instantáneo y temporizado',
  '51':    'Relé de sobrecorriente temporizado',
  '50N':   'Relé de sobrecorriente de neutro instantáneo',
  '50/51N':'Relé de sobrecorriente de neutro instantáneo y temporizado',
  '51N':   'Relé de sobrecorriente de neutro temporizado',
  '50BF':  'Relé de respaldo de falla del interruptor',
  '52':    'Interruptor AC',
  '59':    'Relé de sobre voltaje',
  '63':    'Relé Buchholz',
  '63P':   'Relé de sobrepresión',
  '63A':   'Relé de presión súbita',
  '67':    'Relé de dirección de potencia',
  '71':    'Relé de nivel de aceite',
  '74':    'Relé localizador de falla',
  '81':    'Relé de frecuencia',
  '86':    'Relé maestro de disparo',
  '87':    'Relé diferencial',
  '87G':   'Relé diferencial de tierra',
  '87N':   'Relé diferencial de neutro',
  '90':    'Relé de regulación de presión',
  // Instrumentos y otros (Lámina 603 derecha)
  'V':     'Voltímetro',
  'A':     'Amperímetro',
  'S':     'Estado DCS',
  'M':     'Accionamiento motorizado',
};

// Devuelve true si un texto coincide con un código ANSI conocido.
export function isAnsiCode(text) {
  if (!text) return false;
  return Object.prototype.hasOwnProperty.call(ANSI_CODES, text.trim());
}

export function ansiDescription(code) {
  return ANSI_CODES[code?.trim()] || null;
}
