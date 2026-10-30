/**
 * Solid family: a plain surface. Fill, border, shape, shadow and elevation,
 * five states and light transitions. It is its own material, not an opaque
 * Glass: no SVG filter, no displacement map, no backdrop, no canvas. The DOM
 * renderer (runtime/solid-group.ts) only writes CSS variables.
 *
 * Document sections (same split as Glass):
 *   material  fill, foreground, finish, border, elevation, shadow color
 *   geometry  shape and radius (size comes from the host's layout)
 *   behavior  transition duration and easing
 *   states    per-state overrides of a few material keys (+ scale, opacity)
 *
 * States. `default` is the material itself. `hover`, `pressed`, `active`
 * (selected / current) and `disabled` override only the keys they declare.
 * `resolveSolid` is the one place that turns a document and the current
 * flags into concrete values; the renderer and the tests both use it.
 */

import * as z from 'zod/mini';
import { checkKeys, defaultsOf, type ColorDescriptor, type Descriptor, type EnumDescriptor, type NumberDescriptor } from '../core/descriptors';
import type { ShapeKind } from '../core/params';
import { formatIssues, ID_PATTERN, type ImportResult, type MaterialMeta } from './document';
import { FAMILY_MIN_RUNTIME, MATERIAL_FORMAT, RUNTIME_VERSION, SCHEMA_VERSION, compareVersions, isVersion } from './version';

// ---------------------------------------------------------------------------
// Parameters
// ---------------------------------------------------------------------------

export type SolidFinish = 'flat' | 'soft';
export type SolidEasing = 'standard' | 'emphasized' | 'linear';

export interface SolidParams {
  fill: string;
  foreground: string;
  finish: SolidFinish;
  borderColor: string;
  borderWidth: number;
  elevation: number;
  shadowColor: string;
  shadowOpacity: number;
  shape: ShapeKind;
  radius: number;
  duration: number;
  easing: SolidEasing;
}

export type SolidParamKey = keyof SolidParams;
/** `surface`: CSS variables of the layer. `motion`: transition timing only. Neither touches layout. */
export type SolidStage = 'surface' | 'motion';
export type SolidGroupId = 'surface' | 'border' | 'elevation' | 'shape' | 'motion';

export type SolidDescriptor = Descriptor<SolidParamKey, SolidStage, SolidGroupId>;

const num = (key: SolidParamKey, group: SolidGroupId, affects: SolidStage, label: string, unit: string, min: number, max: number, step: number, def: number, description: string): NumberDescriptor<SolidParamKey, SolidStage, SolidGroupId> => ({
  type: 'number', key, group, affects, label, unit, min, max, step, default: def, description,
});
const color = (key: SolidParamKey, group: SolidGroupId, label: string, def: string, description: string): ColorDescriptor<SolidParamKey, SolidStage, SolidGroupId> => ({
  type: 'color', key, group, affects: 'surface', label, default: def, description,
});
const choice = (key: SolidParamKey, group: SolidGroupId, affects: SolidStage, label: string, options: readonly string[], def: string, description: string): EnumDescriptor<SolidParamKey, SolidStage, SolidGroupId> => ({
  type: 'enum', key, group, affects, label, options, default: def, description,
});

export const SOLID_GROUPS: readonly { id: SolidGroupId; label: string }[] = [
  { id: 'surface', label: 'Superficie' },
  { id: 'border', label: 'Bordo' },
  { id: 'elevation', label: 'Ombra ed elevazione' },
  { id: 'shape', label: 'Forma' },
  { id: 'motion', label: 'Transizioni' },
];

export const SOLID_PARAMS: readonly SolidDescriptor[] = [
  color('fill', 'surface', 'Colore', '#f1f3f5', 'Colore di riempimento della superficie.'),
  color('foreground', 'surface', 'Colore del contenuto', '#111827', 'Colore di testo e icone sopra la superficie. Il contrasto con il colore resta a carico di chi sceglie i valori.'),
  choice('finish', 'surface', 'surface', 'Finitura', ['flat', 'soft'], 'flat', 'flat: tinta unita; soft: sfumatura verticale appena percettibile.'),
  color('borderColor', 'border', 'Colore del bordo', '#d0d5dd', 'Colore del bordo interno della superficie.'),
  num('borderWidth', 'border', 'surface', 'Spessore del bordo', 'px', 0, 8, 0.5, 1, 'Spessore del bordo. 0 = nessun bordo. Il bordo non cambia le dimensioni dell’elemento.'),
  num('elevation', 'elevation', 'surface', 'Elevazione', 'livello', 0, 5, 1, 1, 'Livello di elevazione: 0 piatto, 5 massimo. Decide scostamento e sfocatura dell’ombra.'),
  color('shadowColor', 'elevation', 'Colore ombra', '#101828', 'Colore dell’ombra.'),
  num('shadowOpacity', 'elevation', 'surface', 'Intensità ombra', '', 0, 1, 0.01, 0.18, 'Intensità dell’ombra al livello di elevazione impostato.'),
  choice('shape', 'shape', 'surface', 'Forma', ['capsule', 'rounded'], 'rounded', 'capsule: raggio = metà del lato corto; rounded: usa il raggio indicato.'),
  num('radius', 'shape', 'surface', 'Raggio', 'px', 0, 120, 1, 12, 'Raggio degli angoli per la forma rounded.'),
  num('duration', 'motion', 'motion', 'Durata', 'ms', 0, 600, 10, 140, 'Durata delle transizioni tra stati. 0 = istantanee. Con movimento ridotto la durata è limitata e la scala non si anima.'),
  choice('easing', 'motion', 'motion', 'Andamento', ['standard', 'emphasized', 'linear'], 'standard', 'Curva delle transizioni: standard (morbida), emphasized (più decisa all’inizio), linear.'),
];

export const SOLID_INDEX: Readonly<Record<SolidParamKey, SolidDescriptor>> = Object.fromEntries(SOLID_PARAMS.map((d) => [d.key, d])) as Record<SolidParamKey, SolidDescriptor>;

export function defaultSolidParams(): SolidParams {
  return defaultsOf(SOLID_PARAMS) as unknown as SolidParams;
}

export const SOLID_EASING: Readonly<Record<SolidEasing, string>> = {
  standard: 'cubic-bezier(0.2, 0, 0, 1)',
  emphasized: 'cubic-bezier(0.05, 0.7, 0.1, 1)',
  linear: 'linear',
};

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

export type SolidSectionId = 'material' | 'geometry' | 'behavior';
export const SOLID_SECTIONS: readonly SolidSectionId[] = ['material', 'geometry', 'behavior'];

const SECTION_OF_GROUP: Record<SolidGroupId, SolidSectionId> = {
  surface: 'material',
  border: 'material',
  elevation: 'material',
  shape: 'geometry',
  motion: 'behavior',
};

export function solidSectionOf(key: SolidParamKey): SolidSectionId {
  return SECTION_OF_GROUP[SOLID_INDEX[key].group];
}

export const SOLID_SECTION_KEYS: Readonly<Record<SolidSectionId, readonly SolidParamKey[]>> = {
  material: SOLID_PARAMS.filter((d) => solidSectionOf(d.key) === 'material').map((d) => d.key),
  geometry: SOLID_PARAMS.filter((d) => solidSectionOf(d.key) === 'geometry').map((d) => d.key),
  behavior: SOLID_PARAMS.filter((d) => solidSectionOf(d.key) === 'behavior').map((d) => d.key),
};

type Pick2<K extends SolidParamKey> = { [P in K]: SolidParams[P] };
export type SolidGeometry = Pick2<'shape' | 'radius'>;
export type SolidBehavior = Pick2<'duration' | 'easing'>;
export type SolidMaterial = Omit<SolidParams, keyof SolidGeometry | keyof SolidBehavior>;

export interface SolidSections {
  material: SolidMaterial;
  geometry: SolidGeometry;
  behavior: SolidBehavior;
}

export function splitSolidParams(p: SolidParams): SolidSections {
  const pick = (section: SolidSectionId) => Object.fromEntries(SOLID_SECTION_KEYS[section].map((k) => [k, p[k]]));
  return {
    material: pick('material') as unknown as SolidMaterial,
    geometry: pick('geometry') as unknown as SolidGeometry,
    behavior: pick('behavior') as unknown as SolidBehavior,
  };
}

export function joinSolidSections(s: SolidSections): SolidParams {
  return { ...s.material, ...s.geometry, ...s.behavior };
}

/** Descriptors of one section, in table order. */
export function solidDescriptorsOf(section: SolidSectionId): SolidDescriptor[] {
  return SOLID_SECTION_KEYS[section].map((k) => SOLID_INDEX[k]);
}

// ---------------------------------------------------------------------------
// States
// ---------------------------------------------------------------------------

export type SolidState = 'default' | 'hover' | 'pressed' | 'active' | 'disabled';
export const SOLID_STATES: readonly SolidState[] = ['default', 'hover', 'pressed', 'active', 'disabled'];
/** States that carry overrides; `default` is the material itself. */
export type SolidOverrideState = Exclude<SolidState, 'default'>;
export const SOLID_OVERRIDE_STATES: readonly SolidOverrideState[] = ['hover', 'pressed', 'active', 'disabled'];

export interface SolidStateOverride {
  fill?: string;
  foreground?: string;
  borderColor?: string;
  elevation?: number;
  scale?: number;
  opacity?: number;
}
export type SolidStates = Record<SolidOverrideState, SolidStateOverride>;

type StateKey = keyof SolidStateOverride;
export type SolidStateDescriptor = Descriptor<StateKey, SolidStage, 'states'>;

const fromMaterial = (key: 'fill' | 'foreground' | 'borderColor' | 'elevation'): SolidStateDescriptor => ({ ...SOLID_INDEX[key], group: 'states' }) as SolidStateDescriptor;

/** Keys a state may override. Shared keys reuse the material's descriptor (same range and unit). */
export const SOLID_STATE_PARAMS: readonly SolidStateDescriptor[] = [
  fromMaterial('fill'),
  fromMaterial('foreground'),
  fromMaterial('borderColor'),
  fromMaterial('elevation'),
  { type: 'number', key: 'scale', group: 'states', affects: 'surface', label: 'Scala', unit: '×', min: 0.9, max: 1.1, step: 0.005, default: 1, description: 'Scala della superficie (il contenuto non scala). Ignorata con movimento ridotto.' },
  { type: 'number', key: 'opacity', group: 'states', affects: 'surface', label: 'Opacità', unit: '', min: 0.2, max: 1, step: 0.01, default: 1, description: 'Opacità dell’intero elemento, contenuto compreso.' },
];

/** Initial overrides: legible on the initial material, no value copied from any other project. */
export function defaultSolidStates(): SolidStates {
  return {
    hover: { fill: '#e7eaee', elevation: 2 },
    pressed: { fill: '#dce0e5', elevation: 0, scale: 0.98 },
    active: { fill: '#111827', foreground: '#ffffff', borderColor: '#111827' },
    disabled: { elevation: 0, opacity: 0.45 },
  };
}

/** Transient and persistent flags a host sets; `resolveSolid` turns them into values. */
export interface SolidFlags {
  hover: boolean;
  pressed: boolean;
  active: boolean;
  disabled: boolean;
}
export const NO_FLAGS: Readonly<SolidFlags> = { hover: false, pressed: false, active: false, disabled: false };

/** The state shown to assistive tooling and `data-state`: disabled > pressed > hover > active > default. */
export function solidState(f: SolidFlags): SolidState {
  if (f.disabled) return 'disabled';
  if (f.pressed) return 'pressed';
  if (f.hover) return 'hover';
  if (f.active) return 'active';
  return 'default';
}

export interface SolidStyle {
  state: SolidState;
  fill: string;
  foreground: string;
  /** CSS `background-image` laid over the fill (finish applied); `none` for flat. Kept apart from the fill so the fill can transition. */
  sheen: string;
  borderColor: string;
  borderWidth: number;
  elevation: number;
  /** CSS `box-shadow` value. */
  shadow: string;
  scale: number;
  opacity: number;
  radius: number | 'capsule';
  duration: number;
  /** CSS timing function. */
  easing: string;
}

/**
 * Elevation levels: a key shadow and an ambient shadow. `k` scales the
 * document's shadowOpacity so higher levels get softer, not just larger.
 */
const ELEVATION: readonly { key: [y: number, blur: number, k: number]; ambient: [y: number, blur: number, k: number] }[] = [
  { key: [0, 0, 0], ambient: [0, 0, 0] },
  { key: [1, 2, 0.6], ambient: [0, 1, 0.3] },
  { key: [2, 6, 0.55], ambient: [0, 2, 0.3] },
  { key: [4, 12, 0.5], ambient: [1, 4, 0.3] },
  { key: [8, 22, 0.45], ambient: [2, 6, 0.3] },
  { key: [14, 36, 0.4], ambient: [4, 10, 0.3] },
];

/** `#rrggbb` → `[r, g, b]`. Inputs are validated colors; anything else reads as black. */
export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(hex);
  return m ? [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)] : [0, 0, 0];
}

/**
 * `box-shadow` for an elevation level; `none` for level 0 or no opacity.
 * With `colorMix` (default) the color is mixed in CSS (`color-mix`); without
 * it (browsers before 2023) the same translucent color is written as `rgba()`,
 * so the shadow looks the same instead of disappearing.
 */
export function elevationShadow(level: number, shadowColor: string, shadowOpacity: number, colorMix = true): string {
  const l = ELEVATION[Math.max(0, Math.min(ELEVATION.length - 1, Math.round(level)))] ?? ELEVATION[0]!;
  if (l.key[2] === 0 || shadowOpacity <= 0) return 'none';
  const [r, g, b] = hexToRgb(shadowColor);
  const layer = ([y, blur, k]: readonly [number, number, number]) =>
    colorMix
      ? `0 ${y}px ${blur}px color-mix(in srgb, ${shadowColor} ${Math.round(shadowOpacity * k * 1000) / 10}%, transparent)`
      : `0 ${y}px ${blur}px rgba(${r}, ${g}, ${b}, ${Math.round(shadowOpacity * k * 1000) / 1000})`;
  return `${layer(l.key)}, ${layer(l.ambient)}`;
}

const SHEEN: Readonly<Record<SolidFinish, string>> = {
  flat: 'none',
  soft: 'linear-gradient(180deg, rgb(255 255 255 / 0.12), rgb(255 255 255 / 0))',
};

/**
 * Concrete values for the document under the given flags. Overrides compose
 * in the order active → hover → pressed → disabled, each replacing only the
 * keys it declares. A disabled element ignores hover and pressed.
 */
export function resolveSolid(doc: SolidDocument, flags: SolidFlags = NO_FLAGS, options: { colorMix?: boolean } = {}): SolidStyle {
  const { material: m, geometry: g, behavior: b } = doc;
  const applied: SolidStateOverride[] = [];
  if (flags.active) applied.push(doc.states.active);
  if (!flags.disabled && flags.hover) applied.push(doc.states.hover);
  if (!flags.disabled && flags.pressed) applied.push(doc.states.pressed);
  if (flags.disabled) applied.push(doc.states.disabled);
  const v = { fill: m.fill, foreground: m.foreground, borderColor: m.borderColor, elevation: m.elevation, scale: 1, opacity: 1 };
  for (const o of applied) {
    for (const k of Object.keys(o) as StateKey[]) if (o[k] !== undefined) (v as Record<string, unknown>)[k] = o[k];
  }
  return {
    state: solidState(flags),
    fill: v.fill,
    foreground: v.foreground,
    sheen: SHEEN[m.finish],
    borderColor: v.borderColor,
    borderWidth: m.borderWidth,
    elevation: v.elevation,
    shadow: elevationShadow(v.elevation, m.shadowColor, m.shadowOpacity, options.colorMix ?? true),
    scale: v.scale,
    opacity: v.opacity,
    radius: g.shape === 'capsule' ? 'capsule' : g.radius,
    duration: b.duration,
    easing: SOLID_EASING[b.easing],
  };
}

// ---------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------

export interface SolidDocument {
  format: typeof MATERIAL_FORMAT;
  schemaVersion: typeof SCHEMA_VERSION;
  id: string;
  name: string;
  family: 'solid';
  familyVersion: 1;
  runtime: { min: string };
  material: SolidMaterial;
  geometry: SolidGeometry;
  behavior: SolidBehavior;
  states: SolidStates;
  meta: MaterialMeta;
}

export interface SolidCreateOptions {
  id: string;
  name: string;
  params?: Partial<SolidParams>;
  /** Each state given replaces that state's initial overrides as a whole; the others keep theirs. */
  states?: Partial<Record<SolidOverrideState, SolidStateOverride>>;
  meta?: Partial<MaterialMeta>;
}

export function createSolidDocument(o: SolidCreateOptions): SolidDocument {
  const s = splitSolidParams({ ...defaultSolidParams(), ...o.params });
  return {
    format: MATERIAL_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    id: o.id,
    name: o.name,
    family: 'solid',
    familyVersion: 1,
    runtime: { min: FAMILY_MIN_RUNTIME.solid },
    ...s,
    states: { ...defaultSolidStates(), ...o.states },
    meta: { createdAt: null, updatedAt: null, basedOn: null, notes: '', ...o.meta },
  };
}

/** Flat parameters of a Solid document (states excluded: they have their own section). */
export function solidParams(doc: SolidDocument): SolidParams {
  return joinSolidSections(doc);
}

export function withSolidParams(doc: SolidDocument, params: SolidParams): SolidDocument {
  return { ...doc, ...splitSolidParams(params) };
}

/** Checks a flat set of Solid parameters (what an editor or a component definition passes). */
export function checkSolidParams(values: unknown, scope = 'params') {
  return checkKeys(SOLID_PARAMS, values, { scope, partial: true });
}

/** Paths whose value differs, e.g. `material.fill`, `states.hover.elevation`. Lets a renderer keep updates cheap. */
export function diffSolid(a: SolidDocument, b: SolidDocument): string[] {
  const out: string[] = [];
  for (const section of SOLID_SECTIONS) {
    for (const k of SOLID_SECTION_KEYS[section]) {
      if ((a[section] as unknown as Record<string, unknown>)[k] !== (b[section] as unknown as Record<string, unknown>)[k]) out.push(`${section}.${k}`);
    }
  }
  for (const s of SOLID_OVERRIDE_STATES) {
    for (const d of SOLID_STATE_PARAMS) {
      if (a.states[s][d.key] !== b.states[s][d.key]) out.push(`states.${s}.${d.key}`);
    }
  }
  return out;
}

/** Stages touched by a set of changed paths: transition timing is `motion`, everything else rewrites surface variables. */
export function solidStagesFor(paths: readonly string[]): Set<SolidStage> {
  return new Set(paths.map((p): SolidStage => (p.startsWith('behavior.') ? 'motion' : 'surface')));
}

const metaSchema = z.object({
  createdAt: z.optional(z.nullable(z.string())),
  updatedAt: z.optional(z.nullable(z.string())),
  basedOn: z.optional(z.nullable(z.string())),
  notes: z.optional(z.string().check(z.maxLength(4000))),
});

const envelopeSchema = z.object({
  format: z.literal(MATERIAL_FORMAT),
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: z.string().check(z.regex(ID_PATTERN)),
  name: z.string().check(z.minLength(1), z.maxLength(80)),
  family: z.literal('solid'),
  familyVersion: z.literal(1),
  runtime: z.object({ min: z.string() }),
  material: z.unknown(),
  geometry: z.unknown(),
  behavior: z.unknown(),
  states: z.optional(z.unknown()),
  meta: z.optional(metaSchema),
});

const ENVELOPE_KEYS = new Set(Object.keys(envelopeSchema.def.shape));

/** Validates a value that claims to be a Solid `jello-material` document. Atomic: every reason is reported, nothing is half-applied. */
export function validateSolidDocument(input: unknown): ImportResult {
  const parsed = envelopeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: formatIssues(parsed.error.issues as never) };
  const env = parsed.data;
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isVersion(env.runtime.min)) errors.push('runtime.min: attesa una versione x.y.z');
  else if (compareVersions(env.runtime.min, RUNTIME_VERSION) > 0) {
    errors.push(`runtime.min: il documento richiede il runtime ${env.runtime.min}, questo è ${RUNTIME_VERSION}`);
  }
  const sections: Record<string, Record<string, unknown>> = {};
  for (const section of SOLID_SECTIONS) {
    const r = checkKeys(solidDescriptorsOf(section), env[section], {
      scope: section,
      elsewhere: (key) => (key in SOLID_INDEX ? `appartiene alla sezione ${solidSectionOf(key as SolidParamKey)}, ignorato qui` : null),
    });
    errors.push(...r.errors);
    warnings.push(...r.warnings);
    sections[section] = r.values;
  }
  const states = checkStates(env.states, errors, warnings);
  for (const key of Object.keys(input as object)) {
    if (!ENVELOPE_KEYS.has(key)) warnings.push(`${key}: campo sconosciuto, ignorato`);
  }
  if (errors.length) return { ok: false, errors };
  const doc: SolidDocument = {
    format: MATERIAL_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    id: env.id,
    name: env.name,
    family: 'solid',
    familyVersion: 1,
    runtime: { min: env.runtime.min },
    material: sections.material as unknown as SolidMaterial,
    geometry: sections.geometry as unknown as SolidGeometry,
    behavior: sections.behavior as unknown as SolidBehavior,
    states,
    meta: {
      createdAt: env.meta?.createdAt ?? null,
      updatedAt: env.meta?.updatedAt ?? null,
      basedOn: env.meta?.basedOn ?? null,
      notes: env.meta?.notes ?? '',
    },
  };
  return { ok: true, doc, warnings, migratedFrom: null };
}

/** `states` absent → initial states (warning). A state absent from a present `states` has no overrides. */
function checkStates(input: unknown, errors: string[], warnings: string[]): SolidStates {
  if (input === undefined) {
    warnings.push('states: assente, uso gli stati iniziali');
    return defaultSolidStates();
  }
  const out: SolidStates = { hover: {}, pressed: {}, active: {}, disabled: {} };
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    errors.push('states: atteso un oggetto');
    return out;
  }
  const src = input as Record<string, unknown>;
  for (const s of SOLID_OVERRIDE_STATES) {
    if (!(s in src)) continue;
    const r = checkKeys(SOLID_STATE_PARAMS, src[s], { scope: `states.${s}`, partial: true });
    errors.push(...r.errors);
    warnings.push(...r.warnings);
    out[s] = r.values as SolidStateOverride;
  }
  for (const key of Object.keys(src)) {
    if (!(SOLID_OVERRIDE_STATES as readonly string[]).includes(key)) {
      warnings.push(key === 'default' ? 'states.default: lo stato iniziale è il materiale, ignorato' : `states.${key}: stato sconosciuto, ignorato`);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Built-in presets
// ---------------------------------------------------------------------------

export interface SolidPreset {
  doc: SolidDocument;
  /** Solid presets are original: none approximates another project's treatment. */
  approximation: false;
  note: string;
}

const preset = (id: string, name: string, note: string, params: Partial<SolidParams>, states?: SolidCreateOptions['states']): SolidPreset => ({
  doc: createSolidDocument({ id, name, params, ...(states ? { states } : {}), meta: { basedOn: id, notes: note } }),
  approximation: false,
  note,
});

export const SOLID_PRESETS: readonly SolidPreset[] = [
  preset('solid-neutral', 'Solid · neutro', 'Grigio chiaro con bordo sottile e ombra leggera. Valori iniziali di Solid.', {}),
  preset(
    'solid-dark',
    'Solid · scuro',
    'Superficie scura con contenuto chiaro; lo stato attivo si inverte.',
    { fill: '#1d2433', foreground: '#f5f7fa', borderColor: '#2e3748', elevation: 2, shadowOpacity: 0.35 },
    {
      hover: { fill: '#262f42', elevation: 3 },
      pressed: { fill: '#161c29', elevation: 1, scale: 0.98 },
      active: { fill: '#f5f7fa', foreground: '#1d2433', borderColor: '#f5f7fa' },
    },
  ),
  preset(
    'solid-accent',
    'Solid · accento',
    'Blu pieno con contenuto bianco (contrasto ≥ 4,5:1), capsula e finitura soft.',
    { fill: '#2563eb', foreground: '#ffffff', finish: 'soft', borderColor: '#1d4ed8', shape: 'capsule', shadowColor: '#1e3a8a', shadowOpacity: 0.3 },
    {
      hover: { fill: '#1e56d4', elevation: 2 },
      pressed: { fill: '#1b4bbd', elevation: 0, scale: 0.98 },
      active: { fill: '#17399a', foreground: '#ffffff', borderColor: '#17399a' },
    },
  ),
  preset(
    'solid-outline',
    'Solid · contorno',
    'Sfondo bianco, bordo marcato, nessuna ombra a riposo.',
    { fill: '#ffffff', borderColor: '#98a2b3', borderWidth: 1.5, elevation: 0 },
    {
      hover: { fill: '#f9fafb', borderColor: '#667085', elevation: 1 },
      pressed: { fill: '#f2f4f7', borderColor: '#667085', elevation: 0, scale: 0.98 },
      active: { fill: '#111827', foreground: '#ffffff', borderColor: '#111827' },
    },
  ),
];
