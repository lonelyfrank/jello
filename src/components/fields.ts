/**
 * Property descriptors of component documents: one table gives defaults,
 * ranges, units, labels and the inspector section of every property, the
 * way core/params.ts does for material parameters. Validation, the editor's
 * controls and the exporter's documentation are all generated from it, so a
 * property cannot exist in one place and be missing in another.
 *
 * Paths are dotted (`layout.height`, `states.focus.color`).
 */

export type InspectorSection = 'structure' | 'layout' | 'appearance' | 'typography' | 'material' | 'states' | 'interactions' | 'responsive';

export const INSPECTOR_SECTIONS: readonly { id: InspectorSection; label: string }[] = [
  { id: 'structure', label: 'Struttura' },
  { id: 'layout', label: 'Layout' },
  { id: 'appearance', label: 'Aspetto' },
  { id: 'typography', label: 'Tipografia' },
  { id: 'material', label: 'Materiale' },
  { id: 'states', label: 'Stati' },
  { id: 'interactions', label: 'Interazioni' },
  { id: 'responsive', label: 'Responsive' },
];

interface Base {
  path: string;
  section: InspectorSection;
  label: string;
  description: string;
}

export interface NumberField extends Base {
  type: 'number';
  min: number;
  max: number;
  step: number;
  unit: string;
  default: number;
}
export interface EnumField extends Base {
  type: 'enum';
  options: readonly { value: string; label: string }[];
  default: string;
}
/** `#rrggbb` or `#rrggbbaa`. */
export interface ColorField extends Base {
  type: 'color';
  default: string;
}
export interface BooleanField extends Base {
  type: 'boolean';
  default: boolean;
}
export interface TextField extends Base {
  type: 'text';
  pattern: RegExp;
  maxLength: number;
  default: string;
}
/** A number of px, or the keyword `capsule` (half of the short side). */
export interface RadiusField extends Base {
  type: 'radius';
  min: number;
  max: number;
  default: number | 'capsule';
}

export type FieldDescriptor = NumberField | EnumField | ColorField | BooleanField | TextField | RadiusField;

export const COLOR = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i;

/** Error message, or null when `value` is valid for `f`. */
export function checkField(f: FieldDescriptor, value: unknown): string | null {
  switch (f.type) {
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) return `${f.path}: atteso un numero`;
      if (value < f.min || value > f.max) return `${f.path}: ${value} fuori intervallo [${f.min}, ${f.max}]`;
      return null;
    case 'radius':
      if (value === 'capsule') return null;
      if (typeof value !== 'number' || !Number.isFinite(value)) return `${f.path}: atteso un numero o "capsule"`;
      if (value < f.min || value > f.max) return `${f.path}: ${value} fuori intervallo [${f.min}, ${f.max}]`;
      return null;
    case 'enum':
      if (typeof value !== 'string' || !f.options.some((o) => o.value === value)) return `${f.path}: atteso uno tra ${f.options.map((o) => o.value).join(', ')}`;
      return null;
    case 'color':
      if (typeof value !== 'string' || !COLOR.test(value)) return `${f.path}: atteso un colore #rrggbb o #rrggbbaa`;
      return null;
    case 'boolean':
      if (typeof value !== 'boolean') return `${f.path}: atteso true o false`;
      return null;
    case 'text':
      if (typeof value !== 'string' || value.length > f.maxLength || !f.pattern.test(value)) return `${f.path}: testo non valido`;
      return null;
  }
}

export function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const k of path.split('.')) {
    if (typeof cur !== 'object' || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

/** Immutable set: returns a copy of `obj` with `path` replaced. */
export function setPath<T>(obj: T, path: string, value: unknown): T {
  const [head, ...rest] = path.split('.');
  const src = (obj ?? {}) as Record<string, unknown>;
  return { ...src, [head!]: rest.length ? setPath(src[head!], rest.join('.'), value) : value } as T;
}

/** Nested object of defaults built from the descriptors. */
export function defaultsOf(fields: readonly FieldDescriptor[]): Record<string, unknown> {
  let out: Record<string, unknown> = {};
  for (const f of fields) out = setPath(out, f.path, f.default);
  return out;
}

export interface FieldsCheck {
  value: Record<string, unknown>;
  errors: string[];
  warnings: string[];
}

/**
 * Validates every described leaf under `prefix`. Same policy as material
 * sections: a missing value takes its default (warning), an invalid one
 * rejects the document, an unknown key is dropped (warning).
 */
export function checkFields(input: unknown, fields: readonly FieldDescriptor[], prefix: string): FieldsCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  let value: Record<string, unknown> = {};
  for (const f of fields) {
    const v = getPath(input, f.path);
    if (v === undefined) {
      warnings.push(`${prefix}${f.path}: assente, uso il valore iniziale`);
      value = setPath(value, f.path, f.default);
      continue;
    }
    const e = checkField(f, v);
    if (e) errors.push(prefix + e);
    else value = setPath(value, f.path, f.type === 'color' ? String(v).toLowerCase() : v);
  }
  const known = new Set(fields.map((f) => f.path));
  const branches = new Set(fields.flatMap((f) => f.path.split('.').slice(0, -1).map((_, i, a) => a.slice(0, i + 1).join('.'))));
  const walk = (node: unknown, at: string) => {
    if (typeof node !== 'object' || node === null || Array.isArray(node)) return;
    for (const [k, v] of Object.entries(node)) {
      const p = at ? `${at}.${k}` : k;
      if (known.has(p)) continue;
      if (branches.has(p)) walk(v, p);
      else warnings.push(`${prefix}${p}: proprietà sconosciuta, ignorata`);
    }
  };
  walk(input, '');
  return { value, errors, warnings };
}
