/**
 * Pure description of the Jello Visual Review (M6.4.3.A): viewports, backgrounds, contents, comparison
 * modes, the motion timeline and the criteria shown next to the preview. None of it is part of a Jello
 * document and none of it is saved with a material.
 */
import { evolveJellyMotion, initJellyMotion, jellyMotionSettled, pressJellyMotion } from '../../../../model/experimental/jelly-motion';
import type { JellyBehavior } from '../../../../model/experimental/jelly';
import { PRESET_TITLE, REVIEW_PRESET_IDS, REVIEW_VARIANT_IDS, VARIANT_INFO, type ReviewPresetId, type ReviewVariantId } from './variants';

// ------------------------------------------------------------------ viewports

export interface Viewport { id: string; label: string; width: number; height: number }
export const VIEWPORTS: readonly Viewport[] = [
  { id: 'xs', label: '80×32', width: 80, height: 32 },
  { id: 'md', label: '160×44', width: 160, height: 44 },
  { id: 'lg', label: '320×96', width: 320, height: 96 },
];
export const CUSTOM_LIMITS = { minW: 48, maxW: 480, minH: 24, maxH: 160 } as const;
export const clampCustom = (width: number, height: number): { width: number; height: number } => ({
  width: Math.round(Math.min(CUSTOM_LIMITS.maxW, Math.max(CUSTOM_LIMITS.minW, Number.isFinite(width) ? width : 160))),
  height: Math.round(Math.min(CUSTOM_LIMITS.maxH, Math.max(CUSTOM_LIMITS.minH, Number.isFinite(height) ? height : 44))),
});
/** Smaller buttons get tighter padding and type, like the M6.4.3 harness (font 12/14/18 px by height). */
export const viewportMetrics = (v: { width: number; height: number }) => ({
  paddingX: v.width < 100 ? 10 : v.width < 200 ? 18 : 24,
  fontSize: v.height < 40 ? 12 : v.height > 70 ? 18 : 14,
});

// ------------------------------------------------------------------ backgrounds, contents

export const REVIEW_BACKGROUNDS = ['light', 'dark', 'gradient', 'text', 'structured'] as const;
export type ReviewBackground = typeof REVIEW_BACKGROUNDS[number];
export const REVIEW_BACKGROUND_LABEL: Record<ReviewBackground, string> = { light: 'Chiaro', dark: 'Scuro', gradient: 'Gradiente', text: 'Testo', structured: 'Strutturato' };

export const REVIEW_CONTENTS = ['short', 'long', 'icon-text', 'icon'] as const;
export type ReviewContent = typeof REVIEW_CONTENTS[number];
export const REVIEW_CONTENT_LABEL: Record<ReviewContent, string> = { short: 'Etichetta breve', long: 'Etichetta lunga', 'icon-text': 'Icona + testo', icon: 'Solo icona' };
export const contentProps = (c: ReviewContent): { label: string; icon: boolean; ariaLabel?: string } =>
  c === 'short' ? { label: 'Jello', icon: false }
  : c === 'long' ? { label: 'Etichetta molto lunga di prova', icon: false }
  : c === 'icon-text' ? { label: 'Jello', icon: true }
  : { label: '', icon: true, ariaLabel: 'Jello' };

// ------------------------------------------------------------------ comparison

export const REVIEW_MODES = ['side', 'grid', 'motion'] as const;
export type ReviewMode = typeof REVIEW_MODES[number];
export const REVIEW_MODE_LABEL: Record<ReviewMode, string> = { side: 'Affiancato', grid: 'Quattro varianti', motion: 'Movimento' };
/** What the 2×2 grid varies: the four variants of the selected preset, or the four presets under the selected variant. */
export const GRID_AXES = ['variants', 'presets'] as const;
export type GridAxis = typeof GRID_AXES[number];

/** Interaction states a cell can be forced into (`live` = real pointer and keyboard input). */
export const REVIEW_STATES = ['live', 'hover', 'pressed', 'active', 'disabled'] as const;

// ------------------------------------------------------------------ motion timeline

/** Press at 0, release at HOLD_MS (the sequence M6.4.3 evidence uses), observed until TIMELINE_MS. */
export const HOLD_MS = 600;
export const TIMELINE_MS = 2600;
/** One display frame of the manual clock. */
export const FRAME_MS = 16;
export const MOTION_PHASES = ['idle', 'hover', 'press', 'hold', 'release', 'rebound', 'rest', 'disabled'] as const;
export type MotionPhase = typeof MOTION_PHASES[number];
export const MOTION_PHASE_LABEL: Record<MotionPhase, string> = { idle: 'Idle', hover: 'Hover', press: 'Press', hold: 'Hold', release: 'Release', rebound: 'Rebound', rest: 'Rest', disabled: 'Disabled' };

/** Measures of the pure oscillator for the press → hold → release scenario (same function the surface runs). */
export interface MotionMetrics {
  pressPeak: number; pressT90Ms: number | null;
  /** Largest excursion to the opposite side after release (fractions of the short side). */
  releaseSwing: number; releaseSwingAtMs: number | null;
  /** First instant after release where displacement and velocity are both at rest. */
  restMs: number | null;
}
export function motionMetrics(behavior: JellyBehavior): MotionMetrics {
  let s = pressJellyMotion(initJellyMotion(behavior, 0), true, 0);
  let peak = 0, t90: number | null = null;
  const target = behavior.pressStrength * behavior.maxDeformation;
  for (let t = 1; t <= HOLD_MS; t++) {
    s = evolveJellyMotion(s, t);
    peak = Math.max(peak, Math.abs(s.x));
    if (t90 === null && target && Math.abs(s.x) >= 0.9 * target) t90 = t;
  }
  s = pressJellyMotion(s, false, HOLD_MS);
  let swing = 0, swingAt: number | null = null, rest: number | null = null;
  for (let t = HOLD_MS + 1; t <= HOLD_MS + 3000; t++) {
    s = evolveJellyMotion(s, t);
    if (s.x < 0 && -s.x > swing) { swing = -s.x; swingAt = t - HOLD_MS; }
    if (rest === null && jellyMotionSettled(s)) rest = t - HOLD_MS;
  }
  const r = (n: number) => Math.round(n * 10000) / 10000;
  return { pressPeak: r(peak), pressT90Ms: t90, releaseSwing: r(swing), releaseSwingAtMs: swingAt, restMs: rest };
}

/** Representative instant of each phase for a behaviour. `null` = a state, not an instant of the press timeline. */
export function phaseTime(phase: MotionPhase, behavior: JellyBehavior): number | null {
  const m = motionMetrics(behavior);
  switch (phase) {
    case 'idle': case 'hover': case 'disabled': return null;
    case 'press': return 70;
    case 'hold': return HOLD_MS;
    case 'release': return HOLD_MS + 60;
    // No measurable rebound (Dense): a fixed point on the return path, as in the M6.4.3 harness.
    case 'rebound': return HOLD_MS + (m.releaseSwing > 1e-4 && m.releaseSwingAtMs ? m.releaseSwingAtMs : 140);
    case 'rest': return Math.min(TIMELINE_MS, HOLD_MS + (m.restMs ?? 2000) + 50);
  }
}

// ------------------------------------------------------------------ identity and criteria (§7)

export interface PresetCriteria { direction: readonly string[]; watch: readonly string[] }
export const PRESET_CRITERIA: Record<ReviewPresetId, PresetCriteria> = {
  'jelly-soft': {
    direction: ['Corpo morbido e leggermente lattiginoso, riflessi diffusi', 'Bordo poco aggressivo, bolle piccole e discrete', 'Pressione cedevole e recupero morbido; niente aspetto plastico o metallico'],
    watch: ['Il rimbalzo di B2/B3 è ancora sub-pixel: valuta se l’assestamento attuale sia più coerente di un rimbalzo marcato (non aumentare elasticità senza evidenza)'],
  },
  'jelly-clear': {
    direction: ['Corpo visibilmente traslucido con profondità ottica percepibile', 'Bolle riconoscibili, riflessi sottili, bordo leggibile', 'Movimento relativamente rapido e controllato'],
    watch: ['Visibilità su fondo chiaro', 'Distinzione da Glass: non può dipendere solo dal colore, e Clear non dichiara rifrazione reale'],
  },
  'jelly-candy': {
    direction: ['Superficie lucida, bordi spessi, corpo saturo', 'Riflessioni concentrate e curve; aspetto da caramella gelatinosa', 'Pressione gommoso-elastica con ritorno leggibile'],
    watch: ['Rischio che il riflesso di B1/B3 sembri plastica verniciata: confronta B1 con A', 'Non aumentare il movimento senza evidenze'],
  },
  'jelly-dense': {
    direction: ['Corpo più opaco e profondo, maggiore massa visiva', 'Bordi consistenti, riflessi attenuati, bolle poco invasive', 'Risposta più smorzata, nessun rimbalzo significativo'],
    watch: ['Distinguibilità da Soft e Candy a tinta normalizzata', 'Non deve diventare un materiale completamente solido'],
  },
};

/** The ten questions of the milestone, answered by the reviewer (never by the tool). */
export const REVIEW_QUESTIONS: readonly string[] = [
  'Soft appare realmente morbido?',
  'Clear appare traslucido senza diventare un duplicato di Glass?',
  'Candy appare gommoso e lucido senza sembrare plastica?',
  'Dense appare più denso e pesante degli altri?',
  'I quattro preset sono distinguibili con la stessa tinta?',
  'Le differenze restano percepibili su componenti piccoli?',
  'La pressione è coerente con l’identità di ciascun preset?',
  'I contenuti restano leggibili in tutti gli stati?',
  'Il trattamento m643 dà benefici sufficienti rispetto al suo costo?',
  'Quale combinazione di ottica e movimento va candidata all’approvazione?',
];

// ------------------------------------------------------------------ view state and cells

/** Everything the person chooses in the workspace. Lab view state only: never saved with a material. */
export interface ReviewView {
  presetId: ReviewPresetId;
  /** The variant under discussion: right-hand side of the side-by-side, subject of the inspector and the decision. */
  variantId: ReviewVariantId;
  mode: ReviewMode;
  axis: GridAxis;
  viewportId: string;
  custom: { width: number; height: number };
  background: ReviewBackground;
  content: ReviewContent;
  state: typeof REVIEW_STATES[number];
  sync: boolean;
  normalized: boolean;
  reducedMotion: boolean;
  zoom: 1 | 2;
}
export const DEFAULT_REVIEW_VIEW: ReviewView = {
  presetId: 'jelly-soft', variantId: 'B3', mode: 'side', axis: 'variants', viewportId: 'md', custom: { width: 200, height: 56 },
  background: 'light', content: 'short', state: 'live', sync: true, normalized: false, reducedMotion: false, zoom: 1,
};
export const viewportOf = (v: ReviewView): { width: number; height: number; label: string } =>
  v.viewportId === 'custom' ? { ...clampCustom(v.custom.width, v.custom.height), label: 'Personalizzata' } : (VIEWPORTS.find((p) => p.id === v.viewportId) ?? VIEWPORTS[1]!);

export interface CellSpec { key: string; presetId: ReviewPresetId; variantId: ReviewVariantId; label: string }
/**
 * Which surfaces a view shows. Side by side: baseline and the variant under discussion (just the baseline
 * when that is the variant). Grid: the four variants of the preset, or the four presets under one variant.
 * Motion: the four variants of the preset.
 */
export function cellsFor(v: ReviewView): CellSpec[] {
  const variant = (variantId: ReviewVariantId): CellSpec => ({ key: `${v.presetId}:${variantId}`, presetId: v.presetId, variantId, label: VARIANT_INFO[variantId].label });
  if (v.mode === 'grid' && v.axis === 'presets') {
    return REVIEW_PRESET_IDS.map((presetId) => ({ key: `${presetId}:${v.variantId}`, presetId, variantId: v.variantId, label: `${PRESET_TITLE[presetId].short} · ${v.variantId}` }));
  }
  if (v.mode === 'side') return v.variantId === 'A' ? [variant('A')] : [variant('A'), variant(v.variantId)];
  return REVIEW_VARIANT_IDS.map(variant);
}
