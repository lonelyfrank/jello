/** Pure M6.2 calculations. No DOM, scheduling or second parameter schema. */
import type { JellyBubbles, JellyGeometry, JellyMaterial, JellyQuality } from './jelly';
import { elevationShadow } from '../solid';

export type OpticalQuality = 'high' | 'medium' | 'low';
export const JELLY_BUBBLE_CAPS: Readonly<Record<OpticalQuality, number>> = { high: 24, medium: 12, low: 4 };
export const opticalQuality = (p: JellyQuality['profile']): OpticalQuality => p === 'auto' || p === 'static' ? 'medium' : p;

/** Mulberry32, unsigned 32-bit wrapping including seed zero. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Raw draws remain independent of dimensions, optical values and quality. */
export interface BubbleCandidate { index: number; x: number; y: number; size: number; depth: number }
export function bubbleCandidates(seed: number, count: number): BubbleCandidate[] {
  const random = mulberry32(seed);
  return Array.from({ length: Math.min(24, Math.max(0, Math.floor(count))) }, (_, index) =>
    ({ index, x: random(), y: random(), size: random(), depth: random() }));
}
export function bubbleCount(b: JellyBubbles, width: number, height: number, quality: OpticalQuality): number {
  if (b.enabled === 'disabled' || width <= 0 || height <= 0 || !Number.isFinite(width * height)) return 0;
  return Math.min(JELLY_BUBBLE_CAPS[quality], Math.max(0, Math.floor(b.density * width * height / 10000)));
}

export interface JellyVisualGeometry {
  width: number; height: number; radius: number; pose: number; path: string;
}
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
/** Same local mapping for the silhouette and inclusions; diagnostic only, no solver. */
export function surfacePoint(g: Pick<JellyVisualGeometry, 'width' | 'height' | 'pose'>, x: number, y: number): { x: number; y: number } {
  const middle = g.width / 2;
  return {
    x: middle + (x - middle) * (1 + g.pose * 0.45 * Math.sin(Math.PI * y / (g.height || 1))),
    y: g.height / 2 + (y - g.height / 2) * (1 - g.pose),
  };
}
export function jellyGeometry(width: number, height: number, geometry: JellyGeometry, hostRadius?: number, diagnosticPose = 0): JellyVisualGeometry {
  const w = Number.isFinite(width) ? Math.max(0, width) : 0;
  const h = Number.isFinite(height) ? Math.max(0, height) : 0;
  const r = clamp(hostRadius ?? (geometry.shape === 'capsule' ? Math.min(w, h) / 2 : geometry.radius), 0, Math.min(w, h) / 2);
  const g = { width: w, height: h, radius: r, pose: clamp(Number.isFinite(diagnosticPose) ? diagnosticPose : 0, 0, 0.05) };
  const p = (x: number, y: number) => { const v = surfacePoint(g, x, y); return `${v.x},${v.y}`; };
  // Cubic rounded rectangle. Mapping every control point also supports a future surface-only deformation.
  const k = r * 0.5522847498;
  const path = `M${p(r, 0)} L${p(w-r, 0)} C${p(w-r+k, 0)} ${p(w, r-k)} ${p(w, r)} L${p(w, h-r)} C${p(w, h-r+k)} ${p(w-r+k, h)} ${p(w-r, h)} L${p(r, h)} C${p(r-k, h)} ${p(0, h-r+k)} ${p(0, h-r)} L${p(0, r)} C${p(0, r-k)} ${p(r-k, 0)} ${p(r, 0)} Z`;
  return { ...g, path };
}

export interface ProjectedBubble { index: number; x: number; y: number; radius: number; depth: number; opacity: number }
export function projectBubble(c: BubbleCandidate, b: JellyBubbles, g: JellyVisualGeometry, m: JellyMaterial): ProjectedBubble {
  const depth = b.depthMin + c.depth * (b.depthMax - b.depthMin);
  const radius = (b.radiusMin + c.size * (b.radiusMax - b.radiusMin)) * (1 - 0.35 * depth);
  const point = surfacePoint(g, c.x * g.width, c.y * g.height);
  // A content-independent central band reduces contrast behind typical button text/icons.
  const central = c.x > 0.18 && c.x < 0.82 && c.y > 0.28 && c.y < 0.72 ? 0.38 : 1;
  return { index: c.index, ...point, radius, depth,
    opacity: b.opacity * Math.exp(-depth * (0.45 + 0.5 * m.absorption * m.thickness)) * (1 - m.scattering * 0.5) * central };
}

const mix = (hex: string, target: number, amount: number): string => {
  const channels = [1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i+2), 16) * (1-amount) + target * amount));
  return `#${channels.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
};
export interface JellyOptics {
  centerAlpha: number; edgeAlpha: number; transmission: number; compositingAlpha: number;
  tint: string; deepTint: string; lightTint: string; rimWidth: number; edgeStop: number;
  veil: number; highlight: number; highlightSpread: number; shadowBlur: number; shadowY: number;
  shadowOpacity: number; shadowColor: string; shadowCSS: string; padding: number; foreground: string;
}
/** Artistic optical profile: the RFC's non-refracted compositing equation plus curvature cues. */
export function jellyOptics(m: JellyMaterial, shortSide: number, opaque = false): JellyOptics {
  const transmittance = (path: number) => m.transmission * Math.exp(-m.absorption * m.thickness * path) * (1-m.scattering);
  const shadowY = m.elevation * 1.5;
  const shadowBlur = m.elevation ? 2 + m.elevation * 2.5 : 0;
  return {
    centerAlpha: opaque ? 1 : 1-transmittance(1), edgeAlpha: opaque ? 1 : 1-transmittance(2),
    transmission: opaque ? 0 : m.transmission, compositingAlpha: opaque ? 1 : m.bodyOpacity,
    tint: opaque ? '#b8a2e8' : m.tint, foreground: opaque ? '#211735' : m.foreground,
    deepTint: mix(opaque ? '#b8a2e8' : m.tint, 12, 0.12 + m.thickness * 0.22),
    lightTint: mix(opaque ? '#b8a2e8' : m.tint, 255, 0.35),
    rimWidth: Math.min(shortSide / 4, (1.5 + shortSide * m.thickness * 0.16) * (0.6 + 0.4/m.edgeFalloff)),
    edgeStop: 100 * (1 - Math.pow(0.5, 1/m.edgeFalloff)),
    veil: m.scattering * 0.22, highlight: m.highlightStrength * (1 - 0.55*m.roughness),
    highlightSpread: 0.13 + 0.38*m.roughness,
    shadowY, shadowBlur, shadowColor: m.shadowColor,
    shadowOpacity: m.elevation ? m.shadowOpacity * (opaque ? 1 : m.bodyOpacity) : 0,
    shadowCSS: elevationShadow(m.elevation, m.shadowColor, m.shadowOpacity*(opaque ? 1 : m.bodyOpacity), false),
    padding: Math.ceil(3*shadowBlur + shadowY + shortSide*0.05 + 2),
  };
}
