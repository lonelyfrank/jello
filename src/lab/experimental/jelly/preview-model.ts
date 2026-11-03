/**
 * Pure description of the Jelly preview: which states, sizes, backgrounds and simulated
 * environments the lab offers, and how they become renderer inputs. None of this is part
 * of a Jelly document; it is lab view state and is never saved with the material.
 */
import { BUTTON_SIZES } from '../../../components';
import type { JellyExperimentalDocument, JellyOverrideState } from '../../../model/experimental/jelly';
import type { JellyRenderOptions } from '../../../runtime/experimental/jelly';

/** `live` binds real pointer/keyboard input; the others hold one static state and ignore input. */
export const PREVIEW_STATES = ['live', 'hover', 'pressed', 'active', 'disabled'] as const;
export type PreviewState = typeof PREVIEW_STATES[number];
export const PREVIEW_STATE_LABEL: Record<PreviewState, string> = { live: 'Interattivo', hover: 'Hover', pressed: 'Premuto', active: 'Attivo / selezionato', disabled: 'Disabilitato' };

export const PREVIEW_BACKGROUNDS = ['light', 'dark', 'gradient', 'checker'] as const;
export type PreviewBackground = typeof PREVIEW_BACKGROUNDS[number];
export const PREVIEW_BACKGROUND_LABEL: Record<PreviewBackground, string> = { light: 'Chiaro', dark: 'Scuro', gradient: 'Gradiente', checker: 'Scacchiera' };

/** Heights follow the Button component's sizes (36 / 44 / 52 px); `wide` is a stretched fixed width. */
export const PREVIEW_SIZES = ['sm', 'md', 'lg', 'wide'] as const;
export type PreviewSize = typeof PREVIEW_SIZES[number];
export const PREVIEW_SIZE_LABEL: Record<PreviewSize, string> = { sm: 'Piccolo', md: 'Medio', lg: 'Grande', wide: 'Largo' };
export const previewSizePx = (size: PreviewSize): { width: number; height: number } =>
  size === 'wide' ? { width: 320, height: BUTTON_SIZES.lg } : { width: size === 'sm' ? 112 : size === 'md' ? 148 : 188, height: BUTTON_SIZES[size] };

export const PREVIEW_SCALES = [1, 1.5, 2] as const;

/** Simulated environment for the preview. Flags the real renderer already supports as options, plus the static profile. */
export interface PreviewEnv {
  /** Simulates reduced motion with the document's own `static` quality profile (the OS preference is detected by the renderer separately). */
  reducedMotion: boolean;
  /** Treats SVG as unavailable: exercises the CSS / opaque fallback. */
  svgUnavailable: boolean;
  opaque: boolean;
  reducedTransparency: boolean;
}
export const DEFAULT_ENV: PreviewEnv = { reducedMotion: false, svgUnavailable: false, opaque: false, reducedTransparency: false };

/** What the renderer receives: the saved document, except for the simulated static profile. The saved document is never altered. */
export function effectiveDoc(doc: JellyExperimentalDocument, env: PreviewEnv): JellyExperimentalDocument {
  return env.reducedMotion && doc.quality.profile !== 'static' ? { ...doc, quality: { profile: 'static' } } : doc;
}

export function renderOptions(env: PreviewEnv, radius?: number): JellyRenderOptions {
  return {
    ...(env.svgUnavailable ? { svgAvailable: false } : {}),
    ...(env.opaque ? { opaque: true } : {}),
    ...(env.reducedTransparency ? { reducedTransparency: true } : {}),
    ...(radius !== undefined ? { radius } : {}),
  };
}

export function stateFlags(state: PreviewState): Partial<Record<JellyOverrideState, boolean>> {
  return { hover: state === 'hover', pressed: state === 'pressed', active: state === 'active', disabled: state === 'disabled' };
}

/** Candidate presets in the order requested for comparison. */
export const COMPARE_ORDER = ['jelly-soft', 'jelly-candy', 'jelly-clear', 'jelly-dense'] as const;
