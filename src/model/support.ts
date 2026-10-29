/**
 * What each backend does with each Glass parameter. The same document can
 * look different on different backends: this table says how, so the editor
 * and the export manifest never promise visual equivalence.
 *
 * - supported:    rendered as the parameter describes;
 * - approximated: rendered, but by a different technique (stated in `note`);
 * - ignored:      kept in the document, no effect on this backend.
 */

import { PARAMS, type ParamKey } from '../core/params';

export type Backend = 'css' | 'svg' | 'webgl2';
export type BackendRequest = 'auto' | Backend;
export type SupportLevel = 'supported' | 'approximated' | 'ignored';

export interface SupportEntry {
  level: SupportLevel;
  note: string;
}

export const BACKENDS: readonly Backend[] = ['css', 'svg', 'webgl2'];

export const BACKEND_LABEL: Readonly<Record<Backend, string>> = {
  css: 'CSS (backdrop-filter)',
  svg: 'SVG (rifrazione della sorgente DOM)',
  webgl2: 'WebGL2 (texture controllata)',
};

/** Capabilities a backend needs; reported in the export manifest. */
export const BACKEND_REQUIRES: Readonly<Record<Backend, readonly string[]>> = {
  css: ['backdrop-filter (altrimenti superficie opaca)'],
  svg: ['filter: url(#…) su elementi HTML con feDisplacementMap e feImage', 'una GlassSource DOM opaca dichiarata'],
  webgl2: ['WebGL2', 'una texture controllata (pattern, immagine stessa origine o CORS, canvas)'],
};

const OPTICS: ParamKey[] = ['band', 'refraction', 'profile', 'dome', 'chroma'];

const RULES: Record<Backend, Partial<Record<ParamKey, SupportEntry>>> = {
  css: {
    ...Object.fromEntries(OPTICS.map((k) => [k, { level: 'ignored', note: 'CSS non devia il contenuto: nessuna lente.' }])),
    pressRefraction: { level: 'ignored', note: 'Nessuna rifrazione da aumentare.' },
  },
  svg: {},
  webgl2: {
    blur: { level: 'approximated', note: 'Gaussiana separabile su texture ridotta, non la feGaussianBlur del browser.' },
    light: { level: 'approximated', note: 'Riflesso sul perimetro calcolato nello shader, simile allo strato CSS.' },
    lightAngle: { level: 'approximated', note: 'Come la luce: direzione del riflesso nello shader.' },
    shadow: { level: 'approximated', note: 'Ombra disegnata dallo shader dalla distanza dal bordo.' },
    shadowBlur: { level: 'approximated', note: 'Ombra disegnata dallo shader dalla distanza dal bordo.' },
    shadowOffset: { level: 'approximated', note: 'Ombra disegnata dallo shader dalla distanza dal bordo.' },
    pressLight: { level: 'approximated', note: 'Luce di contatto radiale nello shader.' },
  },
};

const SUPPORTED: SupportEntry = { level: 'supported', note: '' };

export function supportOf(backend: Backend, key: ParamKey): SupportEntry {
  return RULES[backend][key] ?? SUPPORTED;
}

export function supportReport(backend: Backend): { key: ParamKey; level: SupportLevel; note: string }[] {
  return PARAMS.map((d) => ({ key: d.key, ...supportOf(backend, d.key) }));
}

/** Counts per level, e.g. for a compact summary in the editor. */
export function supportSummary(backend: Backend): Record<SupportLevel, number> {
  const out: Record<SupportLevel, number> = { supported: 0, approximated: 0, ignored: 0 };
  for (const r of supportReport(backend)) out[r.level]++;
  return out;
}
