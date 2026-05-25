// Opciones de tag para el panel de Tagging. Cada opción mapea a un tipo de
// componente del editor + props por defecto. Los "subtipos" de borne se
// codifican como tag values distintos (terminal-ccm, terminal-campo, ...)
// para que el clasificador automático pueda sugerir el subtipo correcto.

export const TAG_OPTIONS = [
  { value: '',                  label: '— ignorar —',                           type: null },

  { value: 'coil',              label: 'Bobina contactor',                       type: 'coil' },
  { value: 'contact-no',        label: 'Contacto NO',                            type: 'contact-no' },
  { value: 'contact-nc',        label: 'Contacto NC',                            type: 'contact-nc' },
  { value: 'pushbutton-no',     label: 'Pulsador NO (partir)',                   type: 'pushbutton-no' },
  { value: 'pushbutton-nc',     label: 'Pulsador NC (parar)',                    type: 'pushbutton-nc' },
  { value: 'estop',             label: 'Parada emergencia / pull cord',          type: 'estop' },
  { value: 'selector-2',        label: 'Selector 2 pos. (LOC/REM)',              type: 'selector-2' },
  { value: 'lamp',              label: 'Luz piloto',                             type: 'lamp' },
  { value: 'motor',             label: 'Motor',                                  type: 'motor' },
  { value: 'ied',               label: 'Relé multifunción (IED)',                type: 'ied' },
  { value: 'protection-relay',  label: 'Relé protección (ANSI)',                 type: 'protection-relay' },
  { value: 'overload',          label: 'Relé térmico (sobrecarga)',              type: 'overload' },
  { value: 'fuse',              label: 'Fusible',                                type: 'fuse' },

  // Bornes — subtipos por location (Lámina 606)
  { value: 'terminal-ccm',       label: 'Borne CCM (cuadrado negro)',            type: 'terminal', props: { location: 'CCM' } },
  { value: 'terminal-campo',     label: 'Borne CAMPO (cuadrado blanco)',         type: 'terminal', props: { location: 'CAMPO' } },
  { value: 'terminal-plc',       label: 'Borne PLC/DCS (rombo)',                 type: 'terminal', props: { location: 'PLC' } },
  { value: 'terminal-variador',  label: 'Borne VARIADOR (triángulo)',            type: 'terminal', props: { location: 'VARIADOR' } },
  { value: 'terminal-switchgear',label: 'Borne SWITCHGEAR',                      type: 'terminal', props: { location: 'SWITCHGEAR' } },

  { value: 'junction',           label: 'Nodo / unión',                          type: 'junction' },
  { value: 'ground',             label: 'Tierra',                                type: 'ground' },
  { value: 'ct',                 label: 'TT/CC',                                 type: 'ct' },
  { value: 'transformer',        label: 'Transformador control',                 type: 'transformer' },
];

const OPTION_BY_VALUE = Object.fromEntries(TAG_OPTIONS.map(o => [o.value, o]));
export function optionFor(value) {
  return OPTION_BY_VALUE[value] || null;
}
