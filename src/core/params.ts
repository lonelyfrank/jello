/**
 * Jello material parameters: definition, defaults, validation and serialization.
 *
 * Every parameter declares its unit, range and which stage of the pipeline it
 * touches (`affects`). The renderer uses `affects` to keep the expensive
 * operation (regenerating the displacement map) separate from cheap ones
 * (filter attributes, CSS variables, motion). A future Android renderer is
 * expected to read the same table.
 *
 * These are Jello's own parameters, not those of Apple's shader.
 */

import {
  checkValue,
  onStep,
  parseNumberInput,
  type ColorDescriptor as GenericColorDescriptor,
  type EnumDescriptor as GenericEnumDescriptor,
  type InputResult,
  type NumberDescriptor as GenericNumberDescriptor,
} from './descriptors';

export { checkValue, onStep, parseNumberInput, type InputResult };

export type Profile = 'circle' | 'smooth' | 'linear' | 'bump';
export type ShapeKind = 'capsule' | 'rounded';

export interface GlassParams {
  shape: ShapeKind;
  width: number;
  height: number;
  radius: number;
  band: number;
  refraction: number;
  profile: Profile;
  dome: number;
  chroma: number;
  blur: number;
  saturation: number;
  tint: string;
  tintOpacity: number;
  light: number;
  lightAngle: number;
  shadow: number;
  shadowBlur: number;
  shadowOffset: number;
  stiffness: number;
  damping: number;
  stretch: number;
  pressScale: number;
  pressRefraction: number;
  pressLight: number;
}

export type ParamKey = keyof GlassParams;

/**
 * - `map`: regenerates the displacement map (geometry of the lens).
 * - `filter`: updates SVG filter attributes only.
 * - `surface`: updates CSS variables of the surface layer only.
 * - `motion`: read by the interaction loop only.
 */
export type ParamStage = 'map' | 'filter' | 'surface' | 'motion';

export type ParamGroup = 'shape' | 'optics' | 'material' | 'light' | 'shadow' | 'motion';

/** Glass descriptors: the generic descriptor types (core/descriptors.ts) specialised on Glass keys, stages and groups. */
export type NumberDescriptor<K extends ParamKey = ParamKey> = GenericNumberDescriptor<K, ParamStage, ParamGroup>;
export type EnumDescriptor<K extends ParamKey = ParamKey> = GenericEnumDescriptor<K, ParamStage, ParamGroup>;
export type ColorDescriptor<K extends ParamKey = ParamKey> = GenericColorDescriptor<K, ParamStage, ParamGroup>;
export type ParamDescriptor = NumberDescriptor | EnumDescriptor | ColorDescriptor;

const num = (
  key: ParamKey,
  group: ParamGroup,
  affects: ParamStage,
  label: string,
  unit: string,
  min: number,
  max: number,
  step: number,
  def: number,
  description: string,
): NumberDescriptor => ({ type: 'number', key, group, affects, label, unit, min, max, step, default: def, description });

export const PARAMS: readonly ParamDescriptor[] = [
  {
    type: 'enum',
    key: 'shape',
    group: 'shape',
    affects: 'map',
    label: 'Forma',
    options: ['capsule', 'rounded'],
    default: 'capsule',
    description: 'capsule: raggio = metà del lato corto; rounded: usa il raggio indicato.',
  },
  num('width', 'shape', 'map', 'Larghezza', 'px', 80, 480, 1, 280, 'Larghezza della capsula trascinabile in pixel CSS.'),
  num('height', 'shape', 'map', 'Altezza', 'px', 40, 240, 1, 104, 'Altezza della capsula trascinabile in pixel CSS.'),
  num('radius', 'shape', 'map', 'Raggio', 'px', 0, 120, 1, 32, 'Raggio degli angoli per la forma rounded (limitato a metà del lato corto).'),
  num('band', 'optics', 'map', 'Fascia curva', 'px', 2, 80, 1, 26, 'Ampiezza della fascia perimetrale in cui la superficie è curva e devia la luce.'),
  num('refraction', 'optics', 'filter', 'Rifrazione', 'px', -40, 80, 0.5, 22, 'Spostamento massimo del campionamento sul bordo. Positivo: il bordo mostra contenuto esterno compresso; negativo: lo ingrandisce.'),
  {
    type: 'enum',
    key: 'profile',
    group: 'optics',
    affects: 'map',
    label: 'Profilo',
    options: ['circle', 'smooth', 'linear', 'bump'],
    default: 'circle',
    description: 'Andamento della deviazione nella fascia: circle (bordo convesso), smooth, linear, bump (sin², massimo a metà fascia).',
  },
  num('dome', 'optics', 'map', 'Lente centrale', '', 0, 1, 0.01, 0, 'Ingrandimento verso il centro. 0 = centro neutro.'),
  num('chroma', 'optics', 'filter', 'Aberrazione cromatica', '', 0, 1, 0.01, 0, 'Separazione dei canali RGB nella fascia. Opzionale, disattivata nel preset iniziale.'),
  num('blur', 'material', 'filter', 'Blur', 'px', 0, 40, 0.5, 2, 'Deviazione standard della sfocatura del contenuto sotto la lente.'),
  num('saturation', 'material', 'filter', 'Saturazione', '%', 0, 300, 1, 130, 'Saturazione del contenuto sotto la lente (100 = invariata).'),
  { type: 'color', key: 'tint', group: 'material', affects: 'surface', label: 'Tinta', default: '#ffffff', description: 'Colore della tinta sovrapposta al materiale.' },
  num('tintOpacity', 'material', 'surface', 'Opacità tinta', '', 0, 1, 0.01, 0.08, 'Opacità della tinta (0 = vetro chiaro).'),
  num('light', 'light', 'surface', 'Luce', '', 0, 1, 0.01, 0.55, 'Intensità del riflesso sul perimetro.'),
  num('lightAngle', 'light', 'surface', 'Direzione luce', '°', 0, 360, 1, 315, 'Direzione da cui arriva la luce: 0 = alto, in senso orario.'),
  num('shadow', 'shadow', 'surface', 'Ombra', '', 0, 1, 0.01, 0.22, 'Opacità dell’ombra esterna.'),
  num('shadowBlur', 'shadow', 'surface', 'Sfocatura ombra', 'px', 0, 80, 1, 28, 'Raggio di sfocatura dell’ombra.'),
  num('shadowOffset', 'shadow', 'surface', 'Distanza ombra', 'px', 0, 40, 1, 10, 'Spostamento verticale dell’ombra.'),
  num('stiffness', 'motion', 'motion', 'Rigidità', '1/s²', 40, 1200, 10, 420, 'Rigidità della molla che insegue il puntatore.'),
  num('damping', 'motion', 'motion', 'Smorzamento', 'ζ', 0.1, 1.5, 0.01, 0.68, 'Rapporto di smorzamento (1 = critico, <1 = rimbalzo).'),
  num('stretch', 'motion', 'motion', 'Elasticità', '', 0, 0.4, 0.01, 0.12, 'Deformazione massima dovuta alla velocità di trascinamento.'),
  num('pressScale', 'motion', 'motion', 'Scala alla pressione', '×', 1, 1.15, 0.005, 1.05, 'Ingrandimento della superficie durante la pressione (il foreground non scala).'),
  num('pressRefraction', 'motion', 'motion', 'Rifrazione alla pressione', '', 0, 1, 0.01, 0.3, 'Rifrazione aggiunta durante la pressione, come frazione del valore base.'),
  num('pressLight', 'motion', 'motion', 'Luce alla pressione', '', 0, 1, 0.01, 0.35, 'Luce locale aggiunta nel punto di contatto.'),
];

export const PARAM_INDEX: Readonly<Record<ParamKey, ParamDescriptor>> = Object.fromEntries(
  PARAMS.map((d) => [d.key, d]),
) as Record<ParamKey, ParamDescriptor>;

export function defaultParams(): GlassParams {
  return Object.fromEntries(PARAMS.map((d) => [d.key, d.default])) as unknown as GlassParams;
}

export const FORMAT = 'jello-glass';
export const FORMAT_VERSION = 1;

export type ParseResult =
  | { ok: true; params: GlassParams; warnings: string[] }
  | { ok: false; errors: string[] };

/**
 * Validates a parsed object. Missing keys take their default (reported as
 * warnings); unknown keys are ignored (warnings); any invalid value rejects
 * the whole import so a partial, inconsistent material is never applied.
 */
export function validateParams(input: unknown): ParseResult {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, errors: ['Il documento deve essere un oggetto JSON'] };
  }
  const doc = input as Record<string, unknown>;
  const errors: string[] = [];
  const warnings: string[] = [];
  if (doc.format !== FORMAT) errors.push(`format: atteso "${FORMAT}"`);
  if (doc.version !== FORMAT_VERSION) errors.push(`version: attesa ${FORMAT_VERSION}`);
  const raw = doc.params;
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    errors.push('params: atteso un oggetto');
    return { ok: false, errors };
  }
  const source = raw as Record<string, unknown>;
  const params = defaultParams() as unknown as Record<string, unknown>;
  for (const d of PARAMS) {
    if (!(d.key in source)) {
      warnings.push(`${d.key}: assente, uso il valore iniziale`);
      continue;
    }
    const error = checkValue(d, source[d.key]);
    if (error) errors.push(error);
    else params[d.key] = d.type === 'color' ? String(source[d.key]).toLowerCase() : source[d.key];
  }
  for (const key of Object.keys(source)) {
    if (!(key in PARAM_INDEX)) warnings.push(`${key}: parametro sconosciuto, ignorato`);
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, params: params as unknown as GlassParams, warnings };
}

export function parseParams(text: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { ok: false, errors: [`JSON non valido: ${(e as Error).message}`] };
  }
  return validateParams(data);
}

export function serializeParams(params: GlassParams): string {
  const ordered = Object.fromEntries(PARAMS.map((d) => [d.key, params[d.key]]));
  return JSON.stringify({ format: FORMAT, version: FORMAT_VERSION, params: ordered }, null, 2);
}

/** Keys whose values differ between `a` and `b`. */
export function changedKeys(a: GlassParams, b: GlassParams): ParamKey[] {
  return PARAMS.filter((d) => a[d.key] !== b[d.key]).map((d) => d.key);
}

export function stagesOf(keys: readonly ParamKey[]): Set<ParamStage> {
  return new Set(keys.map((k) => PARAM_INDEX[k].affects));
}

/** Effective corner radius of the draggable capsule. */
export function effectiveRadius(p: Pick<GlassParams, 'shape' | 'width' | 'height' | 'radius'>): number {
  const half = Math.min(p.width, p.height) / 2;
  return p.shape === 'capsule' ? half : Math.min(p.radius, half);
}
