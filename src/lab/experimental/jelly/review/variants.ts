/**
 * Review variants A / B1 / B2 / B3 of the four Jello presets (M6.4.3.A).
 *
 * Derived on demand from the built-in candidates; nothing here is registered, saved or written back,
 * and the built-ins are only read (they are cloned first). The numbers are the M6.4.3 *candidate*
 * values from tests/fixtures/jelly-m643/variants.ts, repeated here because src/ must never import
 * from tests/; `tests/unit/m643a-review.test.ts` asserts the two copies produce equal documents.
 * Only existing descriptors are used: no new persisted property, no schema change.
 */
import { JELLY_CANDIDATE_PRESETS } from '../../../../model/experimental/jelly-presets';
import { createExperimentalJellyDocument, jellyParams, type JellyExperimentalDocument, type JellyParamKey, type JellyParams } from '../../../../model/experimental/jelly';
import type { JellyRenderOptions } from '../../../../runtime/experimental/jelly';

export const REVIEW_PRESET_IDS = ['jelly-soft', 'jelly-clear', 'jelly-candy', 'jelly-dense'] as const;
export type ReviewPresetId = typeof REVIEW_PRESET_IDS[number];
export const REVIEW_VARIANT_IDS = ['A', 'B1', 'B2', 'B3'] as const;
export type ReviewVariantId = typeof REVIEW_VARIANT_IDS[number];

export const PRESET_TITLE: Record<ReviewPresetId, { short: string; full: string; identity: string }> = {
  'jelly-soft': { short: 'Soft', full: 'Jello Soft', identity: 'Soft Skin' },
  'jelly-clear': { short: 'Clear', full: 'Jello Clear', identity: 'Transparent Gel' },
  'jelly-candy': { short: 'Candy', full: 'Jello Candy', identity: 'Glossy Gummy' },
  'jelly-dense': { short: 'Dense', full: 'Jello Dense', identity: 'Dense Gel' },
};

export const VARIANT_INFO: Record<ReviewVariantId, { label: string; kind: string; treatment: 'm642' | 'm643'; summary: string }> = {
  A: { label: 'A — Baseline', kind: 'Riferimento (built-in invariato)', treatment: 'm642', summary: 'Documento built-in M6.4.2, rendering storico.' },
  B1: { label: 'B1 — Optical Refinement', kind: 'Esperimento ottico', treatment: 'm643', summary: 'Solo valori ottici candidati + trattamento delle bolle m643; movimento di A.' },
  B2: { label: 'B2 — Motion Refinement', kind: 'Esperimento di movimento', treatment: 'm642', summary: 'Solo valori di movimento candidati; ottica e rendering di A.' },
  B3: { label: 'B3 — Combined Refinement', kind: 'Esperimento combinato', treatment: 'm643', summary: 'B1 + B2.' },
};

const shade = (tint: string, factor: number) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(tint.slice(i, i + 2), 16) * factor).toString(16).padStart(2, '0')).join('');

/** Same state derivation as jelly-presets.ts `candidate()`, re-applied after a parameter override. */
function withParams(doc: JellyExperimentalDocument, params: Partial<JellyParams>, name = doc.name): JellyExperimentalDocument {
  const p = { ...jellyParams(doc), ...params };
  return createExperimentalJellyDocument({
    id: doc.id, name, params: p, meta: doc.meta,
    states: {
      hover: doc.states.hover,
      pressed: { tint: shade(p.tint, 0.84), bodyOpacity: 0.98, highlightStrength: 0.12, shadowOpacity: 0.06 },
      active: { tint: shade(p.tint, 0.9), bodyOpacity: 0.98, highlightStrength: 0.5 },
      disabled: doc.states.disabled,
    },
  });
}

/** Optical candidates (B1). */
const OPTICS: Record<ReviewPresetId, Partial<JellyParams>> = {
  'jelly-soft': { highlightStrength: 0.5, roughness: 0.72, thickness: 0.42, transmission: 0.5, scattering: 0.3, bodyOpacity: 0.86, edgeFalloff: 1.3, elevation: 2, shadowOpacity: 0.16, density: 8, radiusMin: 1.5, radiusMax: 3.5, opacity: 0.55 },
  'jelly-clear': { tint: '#b9e1ee', bodyOpacity: 0.9, transmission: 0.72, absorption: 0.6, scattering: 0.1, thickness: 0.45, edgeFalloff: 2.2, highlightStrength: 0.5, roughness: 0.2, density: 6, radiusMin: 2.5, radiusMax: 5, opacity: 0.95 },
  'jelly-candy': { thickness: 0.62, edgeFalloff: 2.4, absorption: 2.6, transmission: 0.45, highlightStrength: 0.75, roughness: 0.25, bodyOpacity: 0.93, density: 9, radiusMin: 2, radiusMax: 5, opacity: 0.9 },
  'jelly-dense': { tint: '#8fb7a0', bodyOpacity: 0.97, transmission: 0.12, absorption: 2.4, scattering: 0.55, thickness: 0.65, edgeFalloff: 2.6, highlightStrength: 0.3, roughness: 0.85, elevation: 1, shadowOpacity: 0.3, density: 6, radiusMin: 2, radiusMax: 4, opacity: 0.55 },
};
/** Motion candidates (B2). Candy's motion is deliberately unchanged. */
const MOTION: Record<ReviewPresetId, Partial<JellyParams>> = {
  'jelly-soft': { responseMs: 380, dampingRatio: 0.52, maxDeformation: 0.065, releaseImpulse: 0.22 },
  'jelly-clear': { responseMs: 320, dampingRatio: 0.7, maxDeformation: 0.055, releaseImpulse: 0.12 },
  'jelly-candy': {},
  'jelly-dense': { responseMs: 270, dampingRatio: 1.1, maxDeformation: 0.04, releaseImpulse: 0.04 },
};

/** Known limits of each preset's candidates, from the M6.4.3 evidence (docs/m643/*). Stated, not softened. */
const LIMITS: Record<ReviewPresetId, readonly string[]> = {
  'jelly-soft': ['Il rimbalzo di B2/B3 resta sub-pixel (≈ 0,29 px a 44 px): più assestamento che rimbalzo.', 'A 80×32 le bolle sono praticamente assenti (volutamente piccole).'],
  'jelly-clear': ['Distinzione da Glass non verificata fianco a fianco (nessuna rifrazione né lettura dello sfondo).', 'Contrasto del corpo su fondo chiaro ancora il più basso della famiglia.'],
  'jelly-candy': ['B2 è identico ad A e B3 è identico a B1 (movimento invariato per decisione).', 'Rischio «plastica verniciata» del riflesso: da giudicare a occhio.', 'Con tinta normalizzata è la coppia più simile a Dense nelle immagini ferme.'],
  'jelly-dense': ['Il corpo più scuro riduce il contrasto sul fondo scuro (9,4 → 8,6).', 'Risposta al 90 % in 190 ms contro 146 ms di A.'],
};

export interface ParamChange { key: JellyParamKey; from: unknown; to: unknown }
export interface ReviewVariant {
  presetId: ReviewPresetId;
  id: ReviewVariantId;
  doc: JellyExperimentalDocument;
  options: JellyRenderOptions;
  treatment: 'm642' | 'm643';
  /** Parameters that differ from the unchanged built-in (empty for A). */
  changes: ParamChange[];
  /** True when the variant is, document and options included, equal to another one of the same preset. */
  sameAs: ReviewVariantId | null;
  limitations: readonly string[];
  /** Always false in this phase: no variant is approved, and `visuallyVerified` is untouched. */
  approved: false;
}

/** A fresh clone of the built-in document: callers can never mutate the library through it. */
export function baselineDocument(id: ReviewPresetId): JellyExperimentalDocument {
  const preset = JELLY_CANDIDATE_PRESETS.find((p) => p.doc.id === id);
  if (!preset) throw new Error(`Preset Jello sconosciuto: ${id}`);
  return structuredClone(preset.doc);
}

export const NORMALIZED_TINT = { tint: '#b8a2e8', foreground: '#211735' } as const;

function build(presetId: ReviewPresetId, id: ReviewVariantId): { doc: JellyExperimentalDocument; options: JellyRenderOptions } {
  const base = baselineDocument(presetId);
  const m643: JellyRenderOptions = { treatment: 'm643' };
  switch (id) {
    case 'A': return { doc: base, options: {} };
    case 'B1': return { doc: withParams(base, OPTICS[presetId]), options: m643 };
    case 'B2': return { doc: withParams(base, MOTION[presetId]), options: {} };
    case 'B3': return { doc: withParams(base, { ...OPTICS[presetId], ...MOTION[presetId] }), options: m643 };
  }
}

/** Same tint and foreground for every preset; treatment and behaviour untouched (lab view only, never saved). */
export function normalizeTint(doc: JellyExperimentalDocument): JellyExperimentalDocument {
  return withParams(doc, NORMALIZED_TINT, `${doc.name} (tinta normalizzata)`);
}

export function reviewVariant(presetId: ReviewPresetId, id: ReviewVariantId): ReviewVariant {
  const { doc, options } = build(presetId, id);
  const before = jellyParams(baselineDocument(presetId)), after = jellyParams(doc);
  const changes = (Object.keys(after) as JellyParamKey[]).filter((k) => before[k] !== after[k]).map((key) => ({ key, from: before[key], to: after[key] }));
  const same = REVIEW_VARIANT_IDS.slice(0, REVIEW_VARIANT_IDS.indexOf(id)).find((o) => {
    const other = build(presetId, o);
    return JSON.stringify(other.doc) === JSON.stringify(doc) && JSON.stringify(other.options) === JSON.stringify(options);
  }) ?? null;
  return { presetId, id, doc, options, treatment: options.treatment ?? 'm642', changes, sameAs: same, limitations: LIMITS[presetId], approved: false };
}

export const reviewVariants = (presetId: ReviewPresetId): ReviewVariant[] => REVIEW_VARIANT_IDS.map((id) => reviewVariant(presetId, id));
