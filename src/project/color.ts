/**
 * Colour maths for project assets: parsing the formats people paste (hex, rgb,
 * hsl, oklch), formatting them back, WCAG contrast and the sRGB gamut check.
 * Pure: shared by the colour picker, the asset editor, the exporter and tests.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface Hsl {
  h: number;
  s: number;
  l: number;
}

export interface Oklch {
  l: number;
  c: number;
  h: number;
}

export interface ParsedColor {
  hex: string;
  /** 0 – 1. */
  alpha: number;
  format: 'hex' | 'rgb' | 'hsl' | 'oklch';
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const byte = (n: number) => Math.round(clamp(n, 0, 255));

export const HEX6 = /^#[0-9a-f]{6}$/i;

export function normalizeHex(input: string): string | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(input.trim());
  if (!m) return null;
  let h = m[1]!.toLowerCase();
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  return `#${h}`;
}

export function hexToRgb(hex: string): Rgb {
  const h = normalizeHex(hex) ?? '#000000';
  return { r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16) };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b].map((v) => byte(v).toString(16).padStart(2, '0')).join('')}`;
}

export function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l: l * 100 };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === R) h = ((G - B) / d) % 6;
  else if (max === G) h = (B - R) / d + 2;
  else h = (R - G) / d + 4;
  return { h: (h * 60 + 360) % 360, s: s * 100, l: l * 100 };
}

export function hslToRgb({ h, s, l }: Hsl): Rgb {
  const S = clamp(s, 0, 100) / 100;
  const L = clamp(l, 0, 100) / 100;
  const c = (1 - Math.abs(2 * L - 1)) * S;
  const hh = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  const [r1, g1, b1] = hh < 1 ? [c, x, 0] : hh < 2 ? [x, c, 0] : hh < 3 ? [0, c, x] : hh < 4 ? [0, x, c] : hh < 5 ? [x, 0, c] : [c, 0, x];
  const m = L - c / 2;
  return { r: byte((r1! + m) * 255), g: byte((g1! + m) * 255), b: byte((b1! + m) * 255) };
}

const toLinear = (v: number) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (v: number) => {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
  return c * 255;
};

/** Linear sRGB (unclamped) → OKLab, after Björn Ottosson. */
function linearToOklab(r: number, g: number, b: number): [number, number, number] {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}

function oklabToLinear(L: number, a: number, b: number): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
}

export function rgbToOklch(rgb: Rgb): Oklch {
  const [L, a, b] = linearToOklab(toLinear(rgb.r), toLinear(rgb.g), toLinear(rgb.b));
  const c = Math.hypot(a, b);
  const h = c < 1e-4 ? 0 : ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
  return { l: L, c, h };
}

/** `inGamut` is false when any sRGB channel falls outside 0..1 before clamping. */
export function oklchToRgb({ l, c, h }: Oklch): { rgb: Rgb; inGamut: boolean } {
  const rad = (h * Math.PI) / 180;
  const lin = oklabToLinear(l, c * Math.cos(rad), c * Math.sin(rad));
  const eps = 0.0005;
  const inGamut = lin.every((v) => v >= -eps && v <= 1 + eps);
  const [r, g, b] = lin.map((v) => fromLinear(clamp(v, 0, 1)));
  return { rgb: { r: byte(r!), g: byte(g!), b: byte(b!) }, inGamut };
}

/** WCAG 2.x relative luminance. */
export function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export type ContrastGrade = 'AAA' | 'AA' | 'large' | 'fail';

/** `large`: passes only for large text (3:1). */
export function grade(ratio: number): ContrastGrade {
  if (ratio >= 7) return 'AAA';
  if (ratio >= 4.5) return 'AA';
  if (ratio >= 3) return 'large';
  return 'fail';
}

export const GRADE_LABEL: Record<ContrastGrade, string> = { AAA: 'AAA', AA: 'AA', large: 'Solo testo grande', fail: 'Non sufficiente' };

/** Blends `hex` at `alpha` over an opaque backdrop. */
export function over(hex: string, alpha: number, backdrop: string): string {
  const f = hexToRgb(hex);
  const b = hexToRgb(backdrop);
  const a = clamp(alpha, 0, 1);
  return rgbToHex({ r: f.r * a + b.r * (1 - a), g: f.g * a + b.g * (1 - a), b: f.b * a + b.b * (1 - a) });
}

const num = (s: string) => Number.parseFloat(s);
const pct = (s: string, full: number) => (s.endsWith('%') ? (num(s) / 100) * full : num(s));
const alphaOf = (s: string | undefined) => (s === undefined ? 1 : clamp(s.endsWith('%') ? num(s) / 100 : num(s), 0, 1));

const SEP = String.raw`[\s,]+`;
const FN = (name: string) => new RegExp(String.raw`^${name}\(\s*([^)]+?)\s*\)$`, 'i');

/** Splits "a b c / d", "a, b, c, d" or "a b c d" into values and an optional alpha. */
function args(inner: string): { values: string[]; alpha: string | undefined } {
  const [main, slash] = inner.split('/').map((s) => s.trim());
  const values = main!.split(new RegExp(SEP)).filter(Boolean);
  if (slash) return { values, alpha: slash };
  if (values.length === 4) return { values: values.slice(0, 3), alpha: values[3] };
  return { values, alpha: undefined };
}

/** Accepts #rgb, #rrggbb, rgb(), hsl() and oklch() in modern or legacy syntax. null when unreadable. */
export function parseColor(input: string): ParsedColor | null {
  const text = input.trim();
  if (!text) return null;
  const hex = normalizeHex(text);
  if (hex) return { hex, alpha: 1, format: 'hex' };
  const hex8 = /^#?([0-9a-f]{6})([0-9a-f]{2})$/i.exec(text);
  if (hex8) return { hex: `#${hex8[1]!.toLowerCase()}`, alpha: parseInt(hex8[2]!, 16) / 255, format: 'hex' };

  let m = FN('rgba?').exec(text);
  if (m) {
    const { values, alpha } = args(m[1]!);
    if (values.length !== 3) return null;
    const [r, g, b] = values.map((v) => pct(v, 255));
    if ([r, g, b].some((v) => !Number.isFinite(v))) return null;
    return { hex: rgbToHex({ r: r!, g: g!, b: b! }), alpha: alphaOf(alpha), format: 'rgb' };
  }
  m = FN('hsla?').exec(text);
  if (m) {
    const { values, alpha } = args(m[1]!);
    if (values.length !== 3) return null;
    const h = num(values[0]!.replace('deg', ''));
    const s = num(values[1]!);
    const l = num(values[2]!);
    if (![h, s, l].every(Number.isFinite)) return null;
    return { hex: rgbToHex(hslToRgb({ h, s, l })), alpha: alphaOf(alpha), format: 'hsl' };
  }
  m = FN('oklch').exec(text);
  if (m) {
    const { values, alpha } = args(m[1]!);
    if (values.length !== 3) return null;
    const l = pct(values[0]!, 1);
    const c = pct(values[1]!, 0.4);
    const h = num(values[2]!.replace('deg', ''));
    if (![l, c, h].every(Number.isFinite)) return null;
    return { hex: rgbToHex(oklchToRgb({ l, c, h }).rgb), alpha: alphaOf(alpha), format: 'oklch' };
  }
  return null;
}

const r1 = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');

export function formatRgb(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgb(${r} ${g} ${b})`;
}

export function formatHsl(hex: string): string {
  const { h, s, l } = rgbToHsl(hexToRgb(hex));
  return `hsl(${Math.round(h)} ${Math.round(s)}% ${Math.round(l)}%)`;
}

export function formatOklch(hex: string): string {
  const { l, c, h } = rgbToOklch(hexToRgb(hex));
  return `oklch(${l.toFixed(2)} ${c.toFixed(2)} ${Math.round(h)})`;
}

/** Human decimal (comma) for the interface; CSS uses the dot. */
export const decimal = r1;
