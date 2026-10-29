/**
 * Quality profiles: explicit numbers, no hidden heuristics. Every renderer
 * reads only the fields that apply to it and reports which ones it ignored.
 *
 * 30 and 60 fps are budgets the WebGL2 loop aims at, not promises.
 */

export type QualityProfileId = 'economy' | 'balanced' | 'quality';

export interface QualityProfile {
  id: QualityProfileId;
  label: string;
  /** Upper bound applied to devicePixelRatio (WebGL2 canvas). */
  dprCap: number;
  /** Fraction of the capped device resolution rendered by WebGL2 (0.25–1). */
  internalScale: number;
  /** Displacement map pixels per CSS px (SVG and WebGL2). */
  mapResolution: number;
  /** Largest number of taps per blur pass (WebGL2); larger blurs are downsampled first. */
  blurTaps: number;
  /** Frame budget for dynamic sources (WebGL2 loop), frames per second. */
  maxFps: number;
  /** Chromatic aberration allowed (otherwise forced to 0). */
  chroma: boolean;
  /** Maps kept per renderer (LRU). */
  mapCache: number;
}

export const QUALITY_PROFILES: Readonly<Record<QualityProfileId, QualityProfile>> = {
  economy: {
    id: 'economy',
    label: 'Economy',
    dprCap: 1,
    internalScale: 0.5,
    mapResolution: 0.5,
    blurTaps: 5,
    maxFps: 30,
    chroma: false,
    mapCache: 8,
  },
  balanced: {
    id: 'balanced',
    label: 'Balanced',
    dprCap: 1.5,
    internalScale: 0.75,
    mapResolution: 1,
    blurTaps: 9,
    maxFps: 60,
    chroma: true,
    mapCache: 32,
  },
  quality: {
    id: 'quality',
    label: 'Quality',
    dprCap: 2,
    internalScale: 1,
    mapResolution: 1,
    blurTaps: 13,
    maxFps: 60,
    chroma: true,
    mapCache: 48,
  },
};

export const QUALITY_IDS = Object.keys(QUALITY_PROFILES) as QualityProfileId[];

/** Per-document overrides on top of a profile (null = use the profile value). */
export interface QualitySettings {
  profile: QualityProfileId;
  dprCap: number | null;
  internalScale: number | null;
  /** Visible, opt-in: the WebGL2 view lowers internalScale when frames run long. */
  adaptive: boolean;
}

export function resolveQuality(q: QualitySettings): QualityProfile {
  const base = QUALITY_PROFILES[q.profile];
  return {
    ...base,
    dprCap: q.dprCap ?? base.dprCap,
    internalScale: q.internalScale ?? base.internalScale,
  };
}
