/**
 * Pure editing model of the experimental Jelly lab (M6.4). No DOM, no React, no storage.
 *
 * The Inspector is generated from JELLY_PARAMS: this module only decides the order
 * and grouping of the keys (presentation) and validates every edit by running the
 * whole next document through the experimental parser. A rejected edit leaves the
 * document untouched and returns a message; nothing is clamped or corrected silently.
 */
import {
  JELLY_INDEX,
  JELLY_PARAMS,
  JELLY_STATE_PARAMS,
  checkJellyParams,
  createExperimentalJellyDocument,
  defaultJellyParams,
  jellyParams,
  jellySectionOf,
  parseExperimentalJelly,
  serializeExperimentalJelly,
  type JellyExperimentalDocument,
  type JellyOverrideState,
  type JellyParamKey,
  type JellyParams,
  type JellyStateOverride,
} from '../../../model/experimental/jelly';
import { ID_PATTERN } from '../../../model/document';

export type JellyInspectorId = 'appearance' | 'volume' | 'shape' | 'bubbles' | 'motion' | 'interaction' | 'quality';
export interface JellyInspectorSection {
  id: JellyInspectorId;
  title: string;
  hint: string;
  keys: readonly JellyParamKey[];
}

/** Presentation order of the Inspector. Labels, ranges and defaults always come from JELLY_PARAMS. */
export const JELLY_INSPECTOR: readonly JellyInspectorSection[] = [
  { id: 'appearance', title: 'Appearance', hint: 'Colore e trasparenza del corpo.', keys: ['tint', 'foreground', 'bodyOpacity', 'transmission'] },
  { id: 'volume', title: 'Volume & Light', hint: 'Spessore apparente, luce e riflessi.', keys: ['thickness', 'absorption', 'scattering', 'edgeFalloff', 'highlightStrength', 'roughness'] },
  { id: 'shape', title: 'Shape & Shadow', hint: 'Forma dell’host e ombra.', keys: ['shape', 'radius', 'elevation', 'shadowColor', 'shadowOpacity'] },
  { id: 'bubbles', title: 'Internal Bubbles', hint: 'Inclusioni interne, deterministiche per seed.', keys: ['enabled', 'seed', 'density', 'radiusMin', 'radiusMax', 'depthMin', 'depthMax', 'opacity'] },
  { id: 'motion', title: 'Motion & Physics', hint: 'Oscillatore elastico: risposta, smorzamento, limiti.', keys: ['responseMs', 'dampingRatio', 'maxDeformation', 'pressStrength', 'releaseImpulse'] },
  { id: 'interaction', title: 'Interaction', hint: 'Quali stati reagiscono e come cambiano.', keys: ['hover', 'press'] },
  { id: 'quality', title: 'Quality & Rendering', hint: 'Preferenze salvate; il backend effettivo è nella diagnostica.', keys: ['profile', 'backend', 'fallback'] },
];

/** Base level: colour, transparency, softness, bubbles, elasticity, interaction strength. Same document, fewer controls. */
export const JELLY_BASE_KEYS: ReadonlySet<JellyParamKey> = new Set<JellyParamKey>([
  'tint', 'foreground', 'bodyOpacity', 'transmission', 'roughness', 'enabled', 'density',
  'dampingRatio', 'maxDeformation', 'pressStrength', 'releaseImpulse', 'press',
]);

/** Keys that appear in no section or in more than one: must both be empty (tested). */
export function inspectorCoverage(): { missing: JellyParamKey[]; duplicated: JellyParamKey[] } {
  const seen = new Map<JellyParamKey, number>();
  for (const s of JELLY_INSPECTOR) for (const k of s.keys) seen.set(k, (seen.get(k) ?? 0) + 1);
  return {
    missing: JELLY_PARAMS.map((d) => d.key).filter((k) => !seen.has(k)),
    duplicated: [...seen].filter(([, n]) => n > 1).map(([k]) => k),
  };
}

export type EditResult = { ok: true; doc: JellyExperimentalDocument } | { ok: false; error: string };

const RELATIONS: readonly (readonly [JellyParamKey, JellyParamKey])[] = [['radiusMin', 'radiusMax'], ['depthMin', 'depthMax']];
const fmt = (n: number) => String(Number(n.toFixed(3)));

function relationError(doc: JellyExperimentalDocument, key: JellyParamKey, value: number): string | null {
  const all = jellyParams(doc) as unknown as Record<JellyParamKey, number>;
  for (const [min, max] of RELATIONS) {
    if (key === min && value > all[max]) return `${JELLY_INDEX[min].label} (${fmt(value)}) non può superare ${JELLY_INDEX[max].label} (${fmt(all[max])}): alza prima ${JELLY_INDEX[max].label}.`;
    if (key === max && value < all[min]) return `${JELLY_INDEX[max].label} (${fmt(value)}) non può essere inferiore a ${JELLY_INDEX[min].label} (${fmt(all[min])}): abbassa prima ${JELLY_INDEX[min].label}.`;
  }
  return null;
}

/** Validated edit of one persistent parameter. The document is rebuilt through the parser: no partial result escapes. */
export function editJellyParam(doc: JellyExperimentalDocument, key: JellyParamKey, value: unknown): EditResult {
  const d = JELLY_INDEX[key];
  if (!d) return { ok: false, error: `${String(key)}: parametro sconosciuto` };
  const checked = checkJellyParams({ [key]: value }, { partial: true });
  if (checked.errors.length) return { ok: false, error: checked.errors[0]!.replace(/^params\./, '') };
  if (typeof value === 'number') {
    const relation = relationError(doc, key, value);
    if (relation) return { ok: false, error: relation };
  }
  const section = jellySectionOf(key);
  const next = parseExperimentalJelly({ ...doc, [section]: { ...doc[section], [key]: value } });
  return next.ok ? { ok: true, doc: next.doc } : { ok: false, error: next.errors[0]! };
}

/** Override of one appearance key in one state (undefined removes the override). */
export function editJellyState(doc: JellyExperimentalDocument, state: JellyOverrideState, key: keyof JellyStateOverride, value: string | number | undefined): EditResult {
  const states = { ...doc.states, [state]: { ...doc.states[state] } } as JellyExperimentalDocument['states'];
  if (value === undefined) delete (states[state] as Record<string, unknown>)[key];
  else (states[state] as Record<string, unknown>)[key] = value;
  const next = parseExperimentalJelly({ ...doc, states });
  return next.ok ? { ok: true, doc: next.doc } : { ok: false, error: next.errors[0]! };
}

export function renameJelly(doc: JellyExperimentalDocument, name: string): EditResult {
  const next = parseExperimentalJelly({ ...doc, name });
  return next.ok ? { ok: true, doc: next.doc } : { ok: false, error: next.errors[0]!.replace(/^name: ?/, 'Nome: ') };
}

/** One parameter back to the value it has in `base` (the preset or saved material being edited). */
export function resetJellyParam(doc: JellyExperimentalDocument, base: JellyExperimentalDocument, key: JellyParamKey): EditResult {
  const section = jellySectionOf(key);
  const next = parseExperimentalJelly({ ...doc, [section]: { ...doc[section], [key]: base[section][key as never] } });
  return next.ok ? { ok: true, doc: next.doc } : { ok: false, error: next.errors[0]! };
}

/** All persistent content back to `base`, keeping the working identity (id, name, meta). */
export function resetJellyToBase(doc: JellyExperimentalDocument, base: JellyExperimentalDocument): JellyExperimentalDocument {
  const next = parseExperimentalJelly({ ...base, id: doc.id, name: doc.name, meta: doc.meta });
  if (!next.ok) throw new Error(next.errors.join('; '));
  return next.doc;
}

/** Descriptor defaults (not any preset), keeping identity. */
export function resetJellyToFactory(doc: JellyExperimentalDocument): JellyExperimentalDocument {
  const fresh = createExperimentalJellyDocument({ id: doc.id, name: doc.name, meta: doc.meta });
  return fresh;
}

export const isJellyDirty = (doc: JellyExperimentalDocument, base: JellyExperimentalDocument): boolean => {
  // Identity and timestamps are not content: only parameters and state overrides count.
  const content = (d: JellyExperimentalDocument) => JSON.stringify([jellyParams(d), d.states]);
  return content(doc) !== content(base);
};

/** Parameters that differ from `base`, for the "modificato" markers. */
export function changedJellyKeys(doc: JellyExperimentalDocument, base: JellyExperimentalDocument): JellyParamKey[] {
  const a = jellyParams(doc), b = jellyParams(base);
  return JELLY_PARAMS.map((d) => d.key).filter((k) => a[k] !== b[k]);
}

/** uint32 from an injectable source of [0,1) numbers: the only place a seed is ever randomised, on explicit action. */
export const randomSeed = (rng: () => number = Math.random): number => Math.min(4294967295, Math.floor(rng() * 4294967296));

export function newJellyId(now: number = Date.now(), rng: () => number = Math.random): string {
  const id = `jelly-${now.toString(36)}${Math.floor(rng() * 36 ** 4).toString(36).padStart(4, '0')}`;
  if (!ID_PATTERN.test(id)) throw new Error('id non valido');
  return id;
}

/** Personal experimental copy: new identity, provenance in meta.basedOn, same parameters and overrides. */
export function personalJellyCopy(doc: JellyExperimentalDocument, o: { id: string; name: string; basedOn: string | null; now: string }): JellyExperimentalDocument {
  const next = parseExperimentalJelly({ ...doc, id: o.id, name: o.name, meta: { createdAt: o.now, updatedAt: o.now, basedOn: o.basedOn, notes: doc.meta.notes } });
  if (!next.ok) throw new Error(next.errors.join('; '));
  return next.doc;
}

export const stampJelly = (doc: JellyExperimentalDocument, now: string): JellyExperimentalDocument => {
  const next = parseExperimentalJelly({ ...doc, meta: { ...doc.meta, createdAt: doc.meta.createdAt ?? now, updatedAt: now } });
  if (!next.ok) throw new Error(next.errors.join('; '));
  return next.doc;
};

export { JELLY_STATE_PARAMS, defaultJellyParams, serializeExperimentalJelly };
export type { JellyParams };
