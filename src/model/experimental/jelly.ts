/**
 * M6.1 candidate model. Import this module explicitly for experiments only.
 * Deliberately absent from model/index, MaterialDocument, parseMaterial and
 * MATERIALS: familyVersion 1 here does not make the planned family available.
 * No renderer, scheduling, measurements or transient solver state live here.
 */
import * as z from 'zod/mini';
import { checkKeys, defaultsOf, type Descriptor, type KeysCheck } from '../../core/descriptors';
import type { ShapeKind } from '../../core/params';
import { formatIssues, ID_PATTERN, type MaterialMeta } from '../document';
import { compareVersions, isVersion, MATERIAL_FORMAT, RUNTIME_VERSION, SCHEMA_VERSION } from '../version';

export const JELLY_FAMILY_VERSION = 1;
/** Experimental tooling floor, NOT a claim that this runtime renders Jelly. Revisit at M6.4. */
export const JELLY_EXPERIMENTAL_MIN_RUNTIME = RUNTIME_VERSION;

export type JellyToggle = 'enabled' | 'disabled';
export interface JellyMaterial {
  tint: string;
  foreground: string;
  bodyOpacity: number;
  highlightStrength: number;
  roughness: number;
  thickness: number;
  transmission: number;
  absorption: number;
  scattering: number;
  edgeFalloff: number;
  elevation: number;
  shadowColor: string;
  shadowOpacity: number;
}
export interface JellyGeometry { shape: ShapeKind; radius: number }
export interface JellyBubbles {
  enabled: JellyToggle;
  seed: number;
  density: number;
  radiusMin: number;
  radiusMax: number;
  depthMin: number;
  depthMax: number;
  opacity: number;
}
export interface JellyBehavior {
  responseMs: number;
  dampingRatio: number;
  maxDeformation: number;
  press: JellyToggle;
  hover: JellyToggle;
  pressStrength: number;
  releaseImpulse: number;
}
export interface JellyQuality { profile: 'auto' | 'high' | 'medium' | 'low' | 'static' }
export interface JellyTarget { backend: 'auto' | 'svg' | 'css'; fallback: 'css' | 'opaque' }
export interface JellySections {
  material: JellyMaterial;
  geometry: JellyGeometry;
  bubbles: JellyBubbles;
  behavior: JellyBehavior;
  quality: JellyQuality;
  target: JellyTarget;
}
export type JellyParams = JellyMaterial & JellyGeometry & JellyBubbles & JellyBehavior & JellyQuality & JellyTarget;
export type JellyParamKey = keyof JellyParams;
export type JellySectionId = keyof JellySections;
export type JellyStage = 'surface' | 'geometry' | 'inclusions' | 'motion' | 'pipeline';
export type JellyGroupId = 'appearance' | 'volume' | 'shadow' | 'shape' | 'bubbles' | 'motion' | 'interaction' | 'quality' | 'target';
export type JellyDescriptor = Descriptor<JellyParamKey, JellyStage, JellyGroupId>;

const num = (key: JellyParamKey, group: JellyGroupId, affects: JellyStage, label: string, unit: string, min: number, max: number, step: number, def: number, description: string): JellyDescriptor =>
  ({ type: 'number', key, group, affects, label, unit, min, max, step, default: def, description });
const color = (key: JellyParamKey, group: JellyGroupId, label: string, def: string, description: string): JellyDescriptor =>
  ({ type: 'color', key, group, affects: 'surface', label, default: def, description });
const choice = (key: JellyParamKey, group: JellyGroupId, affects: JellyStage, label: string, options: readonly string[], def: string, description: string): JellyDescriptor =>
  ({ type: 'enum', key, group, affects, label, options, default: def, description });

export const JELLY_GROUPS: readonly { id: JellyGroupId; label: string }[] = [
  { id: 'appearance', label: 'Aspetto' }, { id: 'volume', label: 'Volume' },
  { id: 'shadow', label: 'Ombra ed elevazione' }, { id: 'shape', label: 'Forma' },
  { id: 'bubbles', label: 'Inclusioni' }, { id: 'motion', label: 'Movimento' },
  { id: 'interaction', label: 'Interazione' }, { id: 'quality', label: 'Qualità' },
  { id: 'target', label: 'Backend preferito' },
];

/** Same Descriptor/checkKeys contract as Glass and Solid; no parallel schema for parameters. */
export const JELLY_PARAMS: readonly JellyDescriptor[] = [
  color('tint', 'appearance', 'Tinta', '#b8a2e8', 'Colore del corpo; il bordo deriva dalla stessa tinta attenuata.'),
  color('foreground', 'appearance', 'Contenuto', '#211735', 'Colore di testo e icone; il contrasto sullo sfondo va verificato.'),
  num('bodyOpacity', 'appearance', 'surface', 'Opacità corpo', '', 0, 1, 0.01, 0.82, 'Alpha del solo strato decorativo, mai del contenuto.'),
  num('highlightStrength', 'appearance', 'surface', 'Riflesso', '', 0, 1, 0.01, 0.35, 'Intensità artistica del riflesso morbido.'),
  num('roughness', 'appearance', 'surface', 'Diffusione riflesso', '', 0, 1, 0.01, 0.55, 'Allarga e attenua il riflesso; nessuna unità fisica.'),
  num('thickness', 'volume', 'surface', 'Spessore apparente', 'lato corto', 0, 1, 0.01, 0.35, 'Profondità stilizzata normalizzata sul lato corto; non millimetri.'),
  num('transmission', 'volume', 'surface', 'Trasmissione', '', 0, 1, 0.01, 0.55, 'Quota di sfondo non deviato prima dell’attenuazione; distinta dall’alpha del corpo.'),
  num('absorption', 'volume', 'surface', 'Assorbimento', '', 0, 4, 0.01, 1.2, 'Coefficiente normalizzato nell’attenuazione exp(-absorption × thickness × percorso).'),
  num('scattering', 'volume', 'surface', 'Diffusione interna', '', 0, 1, 0.01, 0.25, 'Velatura artistica del volume, non uno scattering fisico.'),
  num('edgeFalloff', 'volume', 'surface', 'Densità del bordo', '', 0.5, 4, 0.05, 1.5, 'Esponente del profilo di bordo; definito nella RFC.'),
  num('elevation', 'shadow', 'surface', 'Elevazione', 'livello', 0, 5, 1, 1, 'Convenzione Solid: livello dell’ombra, nessun effetto sul layout.'),
  color('shadowColor', 'shadow', 'Colore ombra', '#241838', 'Colore dell’ombra, convenzione condivisa con Solid.'),
  num('shadowOpacity', 'shadow', 'surface', 'Opacità ombra', '', 0, 1, 0.01, 0.18, 'Intensità dell’ombra al livello impostato.'),
  choice('shape', 'shape', 'geometry', 'Forma', ['rounded', 'capsule'], 'rounded', 'Default della forma; la geometria esplicita dell’host ha precedenza.'),
  num('radius', 'shape', 'geometry', 'Raggio', 'px CSS', 0, 120, 1, 16, 'Raggio rounded; capsule usa metà del lato corto. Nessuna dimensione persistita.'),
  choice('enabled', 'bubbles', 'inclusions', 'Bolle', ['enabled', 'disabled'], 'enabled', 'Inclusioni interne statiche; nessun drift in M6.'),
  num('seed', 'bubbles', 'inclusions', 'Seed', 'uint32', 0, 4294967295, 1, 10631, 'Intero persistito, incluso zero. Cambia solo su azione esplicita.'),
  num('density', 'bubbles', 'inclusions', 'Densità', 'bolle / 10000 px² CSS', 0, 20, 0.1, 2, 'Densità artistica; il limite tecnico appartiene al profilo runtime.'),
  num('radiusMin', 'bubbles', 'inclusions', 'Raggio minimo', 'px CSS', 0.5, 12, 0.5, 1, 'Raggio prima dell’attenuazione prospettica; deve essere ≤ radiusMax.'),
  num('radiusMax', 'bubbles', 'inclusions', 'Raggio massimo', 'px CSS', 0.5, 12, 0.5, 3, 'Raggio prima dell’attenuazione prospettica; deve essere ≥ radiusMin.'),
  num('depthMin', 'bubbles', 'inclusions', 'Profondità minima', '', 0, 1, 0.01, 0.15, '0 davanti, 1 dietro; deve essere ≤ depthMax.'),
  num('depthMax', 'bubbles', 'inclusions', 'Profondità massima', '', 0, 1, 0.01, 0.85, '0 davanti, 1 dietro; deve essere ≥ depthMin.'),
  num('opacity', 'bubbles', 'surface', 'Opacità inclusioni', '', 0, 1, 0.01, 0.35, 'Contrasto massimo delle inclusioni prima dell’attenuazione in profondità.'),
  num('responseMs', 'motion', 'motion', 'Risposta', 'ms', 80, 1200, 10, 360, 'Periodo naturale non smorzato: omega0 = 2π / (responseMs / 1000).'),
  num('dampingRatio', 'motion', 'motion', 'Smorzamento', '', 0.15, 2, 0.01, 0.65, 'Rapporto zeta; 1 critico, sotto 1 oscillatorio. Non è un settle time.'),
  num('maxDeformation', 'motion', 'motion', 'Deformazione massima', 'lato corto', 0, 0.15, 0.005, 0.06, 'Ampiezza massima del modo sul lato corto; al contatto estremo il bordo opposto può muoversi fino al doppio. Contenuto e hitbox stabili.'),
  choice('press', 'interaction', 'motion', 'Pressione', ['enabled', 'disabled'], 'enabled', 'Abilita il feedback, non un nuovo evento semantico.'),
  choice('hover', 'interaction', 'surface', 'Hover', ['enabled', 'disabled'], 'enabled', 'Solo feedback di aspetto, senza spostamento del focus.'),
  num('pressStrength', 'interaction', 'motion', 'Intensità pressione', '', 0, 1, 0.01, 0.65, 'Frazione di maxDeformation usata dal target di compressione.'),
  num('releaseImpulse', 'interaction', 'motion', 'Impulso rilascio', '', 0, 1, 0.01, 0.15, 'Incremento di velocità normalizzata: -releaseImpulse × omega0 × maxDeformation.'),
  choice('profile', 'quality', 'pipeline', 'Qualità preferita', ['auto', 'high', 'medium', 'low', 'static'], 'auto', 'Preferenza salvata. Static ferma il moto usando il budget ottico medium.'),
  choice('backend', 'target', 'pipeline', 'Backend preferito', ['auto', 'svg', 'css'], 'auto', 'Preferenza, non backend effettivo. WebGL2 rinviato a prova di necessità.'),
  choice('fallback', 'target', 'pipeline', 'Fallback', ['css', 'opaque'], 'css', 'CSS statico oppure corpo opaco; diagnostica effettiva solo nel runtime.'),
];

const SECTION_OF_GROUP: Record<JellyGroupId, JellySectionId> = {
  appearance: 'material', volume: 'material', shadow: 'material', shape: 'geometry',
  bubbles: 'bubbles', motion: 'behavior', interaction: 'behavior', quality: 'quality', target: 'target',
};
export const JELLY_SECTIONS: readonly JellySectionId[] = ['material', 'geometry', 'bubbles', 'behavior', 'quality', 'target'];
export const JELLY_INDEX = Object.fromEntries(JELLY_PARAMS.map((d) => [d.key, d])) as Readonly<Record<JellyParamKey, JellyDescriptor>>;
export const jellySectionOf = (key: JellyParamKey): JellySectionId => SECTION_OF_GROUP[JELLY_INDEX[key].group];
export const jellyDescriptorsOf = (section: JellySectionId): JellyDescriptor[] => JELLY_PARAMS.filter((d) => jellySectionOf(d.key) === section);
export const defaultJellyParams = (): JellyParams => defaultsOf(JELLY_PARAMS) as unknown as JellyParams;

/** Cross-field constraints augment the shared descriptor policy; no clamping. */
export function checkJellyParams(input: unknown, options: { partial?: boolean; scope?: string } = {}): KeysCheck {
  const r = checkKeys(JELLY_PARAMS, input, { scope: 'params', ...options });
  checkRelations(r.values, r.errors, options.scope ?? 'params');
  return r;
}

function checkRelations(v: Record<string, unknown>, errors: string[], scope: string): void {
  if (typeof v.seed === 'number' && !Number.isInteger(v.seed)) errors.push(`${scope}.seed: atteso un intero uint32`);
  for (const [min, max] of [['radiusMin', 'radiusMax'], ['depthMin', 'depthMax']] as const) {
    if (typeof v[min] === 'number' && typeof v[max] === 'number' && v[min] > v[max]) errors.push(`${scope}.${min}: deve essere ≤ ${max}`);
  }
}

export function splitJellyParams(p: JellyParams): JellySections {
  const pick = (s: JellySectionId) => Object.fromEntries(jellyDescriptorsOf(s).map((d) => [d.key, p[d.key]]));
  // Every section is validated from this same descriptor table before parsing succeeds.
  return Object.fromEntries(JELLY_SECTIONS.map((s) => [s, pick(s)])) as unknown as JellySections;
}
export const jellyParams = (doc: JellySections): JellyParams => ({ ...doc.material, ...doc.geometry, ...doc.bubbles, ...doc.behavior, ...doc.quality, ...doc.target });

export const JELLY_OVERRIDE_STATES = ['hover', 'pressed', 'active', 'disabled'] as const;
export type JellyOverrideState = typeof JELLY_OVERRIDE_STATES[number];
export type JellyStateOverride = Partial<Pick<JellyMaterial, 'tint' | 'foreground' | 'bodyOpacity' | 'highlightStrength' | 'shadowOpacity'>>;
export type JellyStates = Record<JellyOverrideState, JellyStateOverride>;
export const JELLY_STATE_PARAMS = JELLY_PARAMS.filter((d) => (['tint', 'foreground', 'bodyOpacity', 'highlightStrength', 'shadowOpacity'] as readonly string[]).includes(d.key));
export const defaultJellyStates = (): JellyStates => ({ hover: {}, pressed: {}, active: {}, disabled: {} });

export interface JellyExperimentalDocument extends JellySections {
  format: typeof MATERIAL_FORMAT;
  schemaVersion: typeof SCHEMA_VERSION;
  id: string;
  name: string;
  family: 'jelly';
  familyVersion: typeof JELLY_FAMILY_VERSION;
  runtime: { min: string };
  states: JellyStates;
  meta: MaterialMeta;
}
export type JellyExperimentalResult =
  | { ok: true; doc: JellyExperimentalDocument; warnings: string[]; migratedFrom: null }
  | { ok: false; errors: string[] };

export interface JellyExperimentalCreateOptions {
  id: string;
  name: string;
  params?: Partial<JellyParams>;
  states?: Partial<JellyStates>;
  meta?: Partial<MaterialMeta>;
}

/** Validated construction: invalid combinations never escape as a partial document. */
export function createExperimentalJellyDocument(o: JellyExperimentalCreateOptions): JellyExperimentalDocument {
  const r = parseExperimentalJelly({
    format: MATERIAL_FORMAT, schemaVersion: SCHEMA_VERSION, id: o.id, name: o.name,
    family: 'jelly', familyVersion: JELLY_FAMILY_VERSION, runtime: { min: JELLY_EXPERIMENTAL_MIN_RUNTIME },
    ...splitJellyParams({ ...defaultJellyParams(), ...o.params }),
    states: { ...defaultJellyStates(), ...o.states }, meta: o.meta ?? {},
  });
  if (!r.ok) throw new Error(`Jelly sperimentale: ${r.errors.join('; ')}`);
  return r.doc;
}

const envelopeSchema = z.object({
  format: z.literal(MATERIAL_FORMAT), schemaVersion: z.literal(SCHEMA_VERSION),
  id: z.string().check(z.regex(ID_PATTERN)), name: z.string().check(z.minLength(1), z.maxLength(80)),
  family: z.literal('jelly'), familyVersion: z.literal(JELLY_FAMILY_VERSION),
  runtime: z.object({ min: z.string() }),
  material: z.unknown(), geometry: z.unknown(), bubbles: z.unknown(), behavior: z.unknown(),
  quality: z.optional(z.unknown()), target: z.optional(z.unknown()), states: z.optional(z.unknown()),
  meta: z.optional(z.object({
    createdAt: z.optional(z.nullable(z.string())), updatedAt: z.optional(z.nullable(z.string())),
    basedOn: z.optional(z.nullable(z.string())), notes: z.optional(z.string().check(z.maxLength(4000))),
  })),
});
const ENVELOPE_KEYS = new Set(Object.keys(envelopeSchema.def.shape));

/** Dedicated, atomic parser. Never delegates to or changes the public parser/registry. */
export function parseExperimentalJelly(input: unknown): JellyExperimentalResult {
  if (typeof input === 'object' && input !== null && !Array.isArray(input)) {
    const v = input as Record<string, unknown>;
    for (const [key, current] of [['schemaVersion', SCHEMA_VERSION], ['familyVersion', JELLY_FAMILY_VERSION]] as const) {
      if (typeof v[key] === 'number' && v[key] > current) return { ok: false, errors: [`${key}: versione ${v[key]} più recente di quella sperimentale supportata (${current}). Nessuna modifica applicata.`] };
    }
  }
  const parsed = envelopeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: formatIssues(parsed.error.issues as never) };
  const env = parsed.data;
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isVersion(env.runtime.min)) errors.push('runtime.min: attesa una versione x.y.z');
  else if (compareVersions(env.runtime.min, RUNTIME_VERSION) > 0) errors.push(`runtime.min: il documento richiede ${env.runtime.min}, il tooling sperimentale è ${RUNTIME_VERSION}`);
  const sections: Record<string, Record<string, unknown>> = {};
  for (const section of JELLY_SECTIONS) {
    const optional = section === 'quality' || section === 'target';
    const r = checkKeys(jellyDescriptorsOf(section), optional && env[section] === undefined ? {} : env[section], {
      scope: section,
      elsewhere: (key) => Object.hasOwn(JELLY_INDEX, key) ? `appartiene alla sezione ${jellySectionOf(key as JellyParamKey)}, ignorato qui` : null,
    });
    sections[section] = r.values;
    errors.push(...r.errors);
    warnings.push(...r.warnings);
  }
  checkRelations(sections.bubbles!, errors, 'bubbles');
  const states = defaultJellyStates();
  if (env.states === undefined) warnings.push('states: assente, uso gli stati iniziali');
  else if (typeof env.states !== 'object' || env.states === null || Array.isArray(env.states)) errors.push('states: atteso un oggetto');
  else {
    const src = env.states as Record<string, unknown>;
    for (const s of JELLY_OVERRIDE_STATES) {
      if (!Object.hasOwn(src, s)) continue;
      const r = checkKeys(JELLY_STATE_PARAMS, src[s], { scope: `states.${s}`, partial: true });
      states[s] = r.values;
      errors.push(...r.errors);
      warnings.push(...r.warnings);
    }
    warnUnknown(src, JELLY_OVERRIDE_STATES, 'states', warnings);
  }
  warnUnknown(input as Record<string, unknown>, [...ENVELOPE_KEYS], '', warnings);
  warnUnknown((input as Record<string, unknown>).runtime as Record<string, unknown>, ['min'], 'runtime', warnings);
  if (env.meta) warnUnknown((input as Record<string, unknown>).meta as Record<string, unknown>, ['createdAt', 'updatedAt', 'basedOn', 'notes'], 'meta', warnings);
  if (errors.length) return { ok: false, errors };
  return {
    ok: true, warnings, migratedFrom: null,
    doc: {
      format: MATERIAL_FORMAT, schemaVersion: SCHEMA_VERSION, id: env.id, name: env.name,
      family: 'jelly', familyVersion: JELLY_FAMILY_VERSION, runtime: { min: env.runtime.min },
      ...(sections as unknown as JellySections), states,
      meta: { createdAt: env.meta?.createdAt ?? null, updatedAt: env.meta?.updatedAt ?? null, basedOn: env.meta?.basedOn ?? null, notes: env.meta?.notes ?? '' },
    },
  };
}

function warnUnknown(src: Record<string, unknown>, known: readonly string[], scope: string, warnings: string[]): void {
  for (const k of Object.keys(src)) if (!known.includes(k)) warnings.push(`${scope ? `${scope}.` : ''}${k}: campo sconosciuto, ignorato`);
}

export function parseExperimentalJellyText(text: string): JellyExperimentalResult {
  let input: unknown;
  try { input = JSON.parse(text); }
  catch (e) { return { ok: false, errors: [`JSON non valido: ${(e as Error).message}`] }; }
  return parseExperimentalJelly(input);
}

/** Parsing rebuilds every section in descriptor order, including sparse state overrides. */
export function serializeExperimentalJelly(doc: JellyExperimentalDocument): string {
  const r = parseExperimentalJelly(doc);
  if (!r.ok) throw new Error(`Jelly sperimentale: ${r.errors.join('; ')}`);
  return JSON.stringify(r.doc, null, 2);
}

/** Appearance only. Solver state and interaction coordinates are always ephemeral. */
export function resolveExperimentalJelly(doc: JellyExperimentalDocument, flags: Partial<Record<JellyOverrideState, boolean>> = {}): JellyMaterial {
  let material = { ...doc.material };
  if (flags.active) material = { ...material, ...doc.states.active };
  if (!flags.disabled && flags.hover && doc.behavior.hover === 'enabled') material = { ...material, ...doc.states.hover };
  if (!flags.disabled && flags.pressed && doc.behavior.press === 'enabled') material = { ...material, ...doc.states.pressed };
  if (flags.disabled) material = { ...material, ...doc.states.disabled };
  return material;
}
