/**
 * Render path selection. Three states are kept apart on purpose:
 * - configured: what the integrator asked for;
 * - detected:   what feature detection reports (CSS.supports & co.) — this
 *               does NOT prove that the effect renders correctly;
 * - verified:   whether a raster test passed on this engine/version
 *               (records produced by the Playwright suite, see verification/).
 */

export type RenderPath = 'refraction' | 'satin' | 'opaque';
export type PathRequest = 'auto' | RenderPath;

export interface Capabilities {
  /** `filter: url(#svg)` on HTML elements with feDisplacementMap/feImage. */
  svgFilter: boolean;
  backdropFilter: boolean;
}

export interface Preferences {
  reducedTransparency: boolean;
  contrastMore: boolean;
  forcedColors: boolean;
  /** Manual switch exposed by the integrator (e.g. the lab). */
  manualReduceTransparency: boolean;
}

export type EngineName = 'chromium' | 'firefox' | 'webkit' | 'unknown';

export interface EngineInfo {
  engine: EngineName;
  major: number | null;
  mobile: boolean;
  android: boolean;
  webview: boolean;
}

export interface VerificationRecord {
  engine: EngineName;
  major: number;
  /** Free text, e.g. "Linux x86_64, headless, desktop viewport". */
  environment: string;
  mobileEmulated: boolean;
  date: string;
  checks: string[];
}

export interface PathResolution {
  effective: RenderPath;
  reasons: string[];
}

export function detectCapabilities(win: Window & typeof globalThis = window): Capabilities {
  const css = win.CSS;
  const supports = (p: string, v: string) => !!css && typeof css.supports === 'function' && css.supports(p, v);
  return {
    svgFilter:
      supports('filter', 'url(#jello)') &&
      typeof win.SVGFEDisplacementMapElement === 'function' &&
      typeof win.SVGFEImageElement === 'function',
    backdropFilter: supports('backdrop-filter', 'blur(1px)') || supports('-webkit-backdrop-filter', 'blur(1px)'),
  };
}

/** UA parsing is used for reporting and verification lookup only, never as feature detection. */
export function parseEngine(ua: string): EngineInfo {
  const android = /Android/i.test(ua);
  const mobile = /Mobile|Android|iPhone|iPad/i.test(ua);
  const webview = android && (/; wv\)/.test(ua) || /Version\/\d+\.\d+ Chrome\//.test(ua));
  const chrome = /(?:HeadlessChrome|Chrome|Chromium|CriOS)\/(\d+)/.exec(ua);
  const firefox = /(?:Firefox|FxiOS)\/(\d+)/.exec(ua);
  const webkit = /Version\/(\d+)[\d.]*.*Safari/.exec(ua) ?? /AppleWebKit\/(\d+)/.exec(ua);
  if (firefox) return { engine: 'firefox', major: Number(firefox[1]), mobile, android, webview };
  if (chrome) return { engine: 'chromium', major: Number(chrome[1]), mobile, android, webview };
  if (webkit) return { engine: 'webkit', major: Number(webkit[1]), mobile, android, webview };
  return { engine: 'unknown', major: null, mobile, android, webview };
}

export function findVerification(
  engine: EngineInfo,
  records: readonly VerificationRecord[],
): VerificationRecord | null {
  if (engine.major === null) return null;
  // A desktop or emulated record never counts as proof for a real phone.
  if (engine.android || engine.webview) return null;
  const same = records.filter((r) => r.engine === engine.engine && r.major === engine.major);
  return same.find((r) => r.mobileEmulated === engine.mobile) ?? same[0] ?? null;
}

export function resolvePath(
  request: PathRequest,
  caps: Capabilities,
  prefs: Preferences,
  options: { requireVerified: boolean; verified: boolean },
): PathResolution {
  const reasons: string[] = [];
  if (prefs.forcedColors) reasons.push('forced-colors attivo');
  if (prefs.contrastMore) reasons.push('prefers-contrast: more');
  if (prefs.reducedTransparency) reasons.push('prefers-reduced-transparency');
  if (prefs.manualReduceTransparency) reasons.push('trasparenza ridotta manualmente');
  if (reasons.length) return { effective: 'opaque', reasons };
  if (request === 'opaque') return { effective: 'opaque', reasons: ['richiesto opaco'] };

  if (request === 'auto' || request === 'refraction') {
    if (!caps.svgFilter) reasons.push('filtro SVG su HTML non rilevato');
    else if (options.requireVerified && !options.verified) reasons.push('motore non verificato visivamente');
    else return { effective: 'refraction', reasons };
  }
  if (caps.backdropFilter) return { effective: 'satin', reasons };
  reasons.push('backdrop-filter non rilevato');
  return { effective: 'opaque', reasons };
}
