/**
 * M6.4.3 diagnostic configurations. NOT persisted, NOT part of any library, never imported by src/.
 * Baseline A is the unchanged M6.4.2 built-in (JELLY_CANDIDATE_PRESETS); nothing here edits it.
 */
import { JELLY_CANDIDATE_PRESETS } from '../../../src/model/experimental/jelly-presets';
import { createExperimentalJellyDocument, defaultJellyParams, jellyParams, type JellyExperimentalDocument, type JellyParams } from '../../../src/model/experimental/jelly';

export const PRESET_IDS = ['jelly-soft', 'jelly-clear', 'jelly-candy', 'jelly-dense'] as const;
export type PresetId = typeof PRESET_IDS[number];
export const baselineDoc = (id: string): JellyExperimentalDocument => structuredClone(JELLY_CANDIDATE_PRESETS.find((p) => p.doc.id === id)!.doc);

const shade = (tint: string, factor: number) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(tint.slice(i, i + 2), 16) * factor).toString(16).padStart(2, '0')).join('');

/** Same state derivation as jelly-presets.ts `candidate()`, re-applied after a parameter override. */
export function withParams(doc: JellyExperimentalDocument, params: Partial<JellyParams>, name = doc.name): JellyExperimentalDocument {
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
void defaultJellyParams;

/** Normalization (§11): one tint and one foreground for the four presets; treatment and behaviour untouched. */
export const NORMALIZED = { tint: '#b8a2e8', foreground: '#211735' } as const;
export const normalized = (doc: JellyExperimentalDocument) => withParams(doc, NORMALIZED, `${doc.name} (tinta normalizzata)`);

import type { JellyRenderOptions } from '../../../src/runtime/experimental/jelly';

export interface Variant { doc: JellyExperimentalDocument; options?: JellyRenderOptions }

/** Optical candidates (B1). Only existing descriptors: no new persisted property. Values are candidates, not approved. */
export const OPTICS: Record<PresetId, Partial<JellyParams>> = {
  'jelly-soft': { highlightStrength: 0.5, roughness: 0.72, thickness: 0.42, transmission: 0.5, scattering: 0.3, bodyOpacity: 0.86, edgeFalloff: 1.3, elevation: 2, shadowOpacity: 0.16, density: 8, radiusMin: 1.5, radiusMax: 3.5, opacity: 0.55 },
  'jelly-clear': { tint: '#b9e1ee', bodyOpacity: 0.9, transmission: 0.72, absorption: 0.6, scattering: 0.1, thickness: 0.45, edgeFalloff: 2.2, highlightStrength: 0.5, roughness: 0.2, density: 6, radiusMin: 2.5, radiusMax: 5, opacity: 0.95 },
  'jelly-candy': { thickness: 0.62, edgeFalloff: 2.4, absorption: 2.6, transmission: 0.45, highlightStrength: 0.75, roughness: 0.25, bodyOpacity: 0.93, density: 9, radiusMin: 2, radiusMax: 5, opacity: 0.9 },
  'jelly-dense': { tint: '#8fb7a0', bodyOpacity: 0.97, transmission: 0.12, absorption: 2.4, scattering: 0.55, thickness: 0.65, edgeFalloff: 2.6, highlightStrength: 0.3, roughness: 0.85, elevation: 1, shadowOpacity: 0.3, density: 6, radiusMin: 2, radiusMax: 4, opacity: 0.55 },
};
/** Motion candidates (B2): the spec's initial values, to be validated by the oscillator, not applied blindly. */
export const MOTION: Record<PresetId, Partial<JellyParams>> = {
  'jelly-soft': { responseMs: 380, dampingRatio: 0.52, maxDeformation: 0.065, releaseImpulse: 0.22 },
  'jelly-clear': { responseMs: 320, dampingRatio: 0.7, maxDeformation: 0.055, releaseImpulse: 0.12 },
  'jelly-candy': {}, // spec §6.2: Candy's motion is kept
  'jelly-dense': { responseMs: 270, dampingRatio: 1.1, maxDeformation: 0.04, releaseImpulse: 0.04 },
};
const M643: JellyRenderOptions = { treatment: 'm643' };

/**
 * A = unchanged built-in · B1 = optics (+ m643 treatment) · B2 = motion only · B3 = B1 + B2.
 * N* = same with the normalized tint. X* = inclusion experiments (§8) on the baseline documents.
 */
export const VARIANTS: Record<string, (id: PresetId) => Variant> = {
  A: (id) => ({ doc: baselineDoc(id) }),
  B1: (id) => ({ doc: withParams(baselineDoc(id), OPTICS[id]), options: M643 }),
  B2: (id) => ({ doc: withParams(baselineDoc(id), MOTION[id]) }),
  B3: (id) => ({ doc: withParams(baselineDoc(id), { ...OPTICS[id], ...MOTION[id] }), options: M643 }),
  N: (id) => ({ doc: normalized(baselineDoc(id)) }),
  NB1: (id) => ({ doc: normalized(withParams(baselineDoc(id), { ...OPTICS[id], tint: NORMALIZED.tint })), options: M643 }),
  NB3: (id) => ({ doc: normalized(withParams(baselineDoc(id), { ...OPTICS[id], ...MOTION[id], tint: NORMALIZED.tint })), options: M643 }),
  // §8.2 contrast experiment on the baseline documents: legacy · parameters only · each m643 layer · all layers.
  X0: (id) => ({ doc: baselineDoc(id) }),
  X1: (id) => ({ doc: withParams(baselineDoc(id), { opacity: 1, radiusMin: 2.5, radiusMax: 6 }) }),
  X2: (id) => ({ doc: baselineDoc(id), options: { treatment: 'm643', diagnosticBubbleParts: ['gradient'] } }),
  X3: (id) => ({ doc: baselineDoc(id), options: { treatment: 'm643', diagnosticBubbleParts: ['rim'] } }),
  X4: (id) => ({ doc: baselineDoc(id), options: { treatment: 'm643', diagnosticBubbleParts: ['crescent'] } }),
  X5: (id) => ({ doc: baselineDoc(id), options: M643 }),
};
