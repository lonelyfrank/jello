/**
 * Parameter descriptors, independent of any material family.
 *
 * A descriptor declares a parameter once: type, unit, range, step, default,
 * editor group, the pipeline stage it touches (`affects`) and a description.
 * Defaults, validation, documentation and the editor's controls are all
 * generated from the table, so a parameter cannot exist in one place and be
 * missing in another. Glass (params.ts) and Solid (model/solid.ts) each own a
 * table; a table is specialised by its own key, stage and group unions.
 */

interface BaseDescriptor<K extends string, S extends string, G extends string> {
  key: K;
  label: string;
  group: G;
  affects: S;
  description: string;
}

export interface NumberDescriptor<K extends string = string, S extends string = string, G extends string = string> extends BaseDescriptor<K, S, G> {
  type: 'number';
  unit: string;
  min: number;
  max: number;
  step: number;
  default: number;
}

export interface EnumDescriptor<K extends string = string, S extends string = string, G extends string = string> extends BaseDescriptor<K, S, G> {
  type: 'enum';
  options: readonly string[];
  default: string;
}

export interface ColorDescriptor<K extends string = string, S extends string = string, G extends string = string> extends BaseDescriptor<K, S, G> {
  type: 'color';
  default: string;
}

export type Descriptor<K extends string = string, S extends string = string, G extends string = string> =
  | NumberDescriptor<K, S, G>
  | EnumDescriptor<K, S, G>
  | ColorDescriptor<K, S, G>;

const HEX = /^#[0-9a-f]{6}$/i;

/** Returns an error message, or null when `value` is valid for `d`. */
export function checkValue(d: Descriptor, value: unknown): string | null {
  switch (d.type) {
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) return `${d.key}: atteso un numero`;
      if (value < d.min || value > d.max) return `${d.key}: ${value} fuori intervallo [${d.min}, ${d.max}]`;
      return null;
    case 'enum':
      if (typeof value !== 'string' || !d.options.includes(value)) {
        return `${d.key}: atteso uno tra ${d.options.join(', ')}`;
      }
      return null;
    case 'color':
      if (typeof value !== 'string' || !HEX.test(value)) return `${d.key}: atteso un colore #rrggbb`;
      return null;
  }
}

/** True when `value` is `min + k·step` for an integer k (within float noise). */
export function onStep(d: NumberDescriptor, value: number): boolean {
  const k = (value - d.min) / d.step;
  return Math.abs(k - Math.round(k)) < 1e-6;
}

export type InputResult = { ok: true; value: number } | { ok: false; error: string };

/**
 * Validates text typed in a numeric field. Stricter than an import: the value
 * must be finite, inside the range and on the slider's step. Accepts a comma
 * as decimal separator.
 */
export function parseNumberInput(d: NumberDescriptor, text: string): InputResult {
  const t = text.trim().replace(',', '.');
  if (t === '') return { ok: false, error: 'Valore vuoto' };
  if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(t)) return { ok: false, error: 'Non è un numero' };
  const value = Number(t);
  if (!Number.isFinite(value)) return { ok: false, error: 'Numero non finito' };
  if (value < d.min || value > d.max) return { ok: false, error: `Fuori intervallo (${d.min} – ${d.max})` };
  if (!onStep(d, value)) return { ok: false, error: `Non compatibile con il passo ${d.step}` };
  // Snap away float noise (0.1 + 0.2) so the stored value is the step's value.
  const digits = Math.max(0, Math.ceil(-Math.log10(d.step)) + 1);
  return { ok: true, value: Number(value.toFixed(digits)) };
}

/** Initial values of a table, by key. */
export function defaultsOf<D extends Descriptor>(table: readonly D[]): Record<D['key'], D['default']> {
  return Object.fromEntries(table.map((d) => [d.key, d.default])) as Record<D['key'], D['default']>;
}

export interface KeysCheck {
  values: Record<string, unknown>;
  errors: string[];
  warnings: string[];
}

export interface CheckKeysOptions {
  /** Prefix of every message, e.g. the document section (`material`). */
  scope?: string;
  /** Keys that must be present when `partial` is false. With `partial`, absent keys are simply absent. */
  partial?: boolean;
  /** Explains an unknown key that belongs elsewhere (another section). Return null for a plain unknown key. */
  elsewhere?: (key: string) => string | null;
}

/**
 * Validates an object of values against the descriptors in `table`. Policy
 * shared by every family: an invalid value is an error (the whole document is
 * refused), a missing key takes its default (warning), an unknown key is
 * ignored (warning). Colors are normalised to lower case.
 */
export function checkKeys(table: readonly Descriptor[], input: unknown, options: CheckKeysOptions = {}): KeysCheck {
  const scope = options.scope ? `${options.scope}.` : '';
  const errors: string[] = [];
  const warnings: string[] = [];
  const values: Record<string, unknown> = {};
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { values, errors: [`${options.scope ?? 'valori'}: atteso un oggetto`], warnings };
  }
  const src = input as Record<string, unknown>;
  const known = new Set(table.map((d) => d.key));
  for (const d of table) {
    if (!(d.key in src)) {
      if (!options.partial) {
        warnings.push(`${scope}${d.key}: assente, uso il valore iniziale`);
        values[d.key] = d.default;
      }
      continue;
    }
    const error = checkValue(d, src[d.key]);
    if (error) errors.push(`${scope}${error}`);
    else values[d.key] = d.type === 'color' ? String(src[d.key]).toLowerCase() : src[d.key];
  }
  for (const key of Object.keys(src)) {
    if (!known.has(key)) warnings.push(`${scope}${key}: ${options.elsewhere?.(key) ?? 'parametro sconosciuto, ignorato'}`);
  }
  return { values, errors, warnings };
}
