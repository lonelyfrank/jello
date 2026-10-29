/**
 * The `jello-component` document, schema version 1. One format for the
 * builder, the library, the exporters and (later) CLI, MCP server and AI
 * agents: there is no separate format for tools.
 *
 *   {
 *     format: 'jello-component', schemaVersion: 1,
 *     type: 'bottom-navigation', typeVersion: 1,
 *     id, name, runtime: { min },
 *     material: { family, preset, document },   // a full jello-material document
 *     root: { kind, id, label, semantics, defaultTab, layout, appearance,
 *             typography, icon, states, interactions, motion, responsive,
 *             children: [ { kind: 'tab', id, label, icon, value, disabled, style } ] },
 *     meta: { createdAt, updatedAt, basedOn, notes }
 *   }
 *
 * The material travels inside the component, so a saved component reopens
 * and exports exactly as it was even if the preset it came from changes or is
 * deleted; `material.preset` keeps the link for the editor.
 *
 * Callbacks are never serialized: interactions are declarative (event names,
 * tab values) and the host application binds behaviour at runtime.
 *
 * Parsing is atomic and reports every reason, like jello-material.
 * Migrations: `schemaVersion` (envelope) and `typeVersion` (per component
 * type) each have a step table; newer versions are refused with a message.
 */

import * as z from 'zod/mini';
import { formatIssues, ID_PATTERN, type MaterialDocument } from '../model/document';
import { parseMaterial } from '../model/migrate';
import { builtinMaterial } from '../model/builtins';
import { RUNTIME_VERSION, compareVersions, isVersion } from '../model/version';
import { checkField, checkFields, setPath } from './fields';
import { parseSvgBody, serializeSvgNodes, BUILTIN_ICONS, type IconRef } from './icons';
import {
  BN_FIELDS,
  BN_FIELD_INDEX,
  BREAKPOINT_ID,
  createRoot,
  createTab,
  OVERRIDE_PATHS,
  TAB_ID,
  TAB_LABEL_MAX,
  TAB_STYLE_FIELDS,
  type BnRoot,
  type BnTab,
} from './bottom-navigation/model';

export const COMPONENT_FORMAT = 'jello-component';
export const COMPONENT_SCHEMA_VERSION = 1;

export type ComponentType = 'bottom-navigation';

export interface MaterialBinding {
  family: MaterialDocument['family'];
  /** Library entry the material came from (built-in or personal preset), if any. */
  preset: string | null;
  document: MaterialDocument;
}

export interface ComponentMeta {
  createdAt: string | null;
  updatedAt: string | null;
  /** Template the component was created from. */
  basedOn: string | null;
  notes: string;
}

export interface ComponentDocument {
  format: typeof COMPONENT_FORMAT;
  schemaVersion: typeof COMPONENT_SCHEMA_VERSION;
  type: ComponentType;
  typeVersion: 1;
  id: string;
  name: string;
  runtime: { min: string };
  material: MaterialBinding;
  root: BnRoot;
  meta: ComponentMeta;
}

export type ComponentImport =
  | { ok: true; doc: ComponentDocument; warnings: string[]; migratedFrom: string | null }
  | { ok: false; errors: string[] };

/** Latest version of each component type's own structure. */
export const TYPE_VERSIONS: Readonly<Record<ComponentType, number>> = { 'bottom-navigation': 1 };

/**
 * Envelope migrations, `from` version → next. Empty while 1 is the only
 * published version; a v2 adds `1: (doc) => …` here and a test that reads a
 * stored v1 document.
 */
export const ENVELOPE_MIGRATIONS: Readonly<Record<number, (doc: Record<string, unknown>) => Record<string, unknown>>> = {};
/** Per-type structure migrations, same rule. */
export const TYPE_MIGRATIONS: Readonly<Record<ComponentType, Readonly<Record<number, (root: Record<string, unknown>) => Record<string, unknown>>>>> = { 'bottom-navigation': {} };

const envelopeSchema = z.object({
  format: z.literal(COMPONENT_FORMAT),
  schemaVersion: z.literal(COMPONENT_SCHEMA_VERSION),
  type: z.literal('bottom-navigation'),
  typeVersion: z.literal(1),
  id: z.string().check(z.regex(ID_PATTERN)),
  name: z.string().check(z.minLength(1), z.maxLength(80)),
  runtime: z.object({ min: z.string() }),
  material: z.object({ family: z.string(), preset: z.optional(z.nullable(z.string().check(z.regex(ID_PATTERN)))), document: z.unknown() }),
  root: z.unknown(),
  meta: z.optional(
    z.object({
      createdAt: z.optional(z.nullable(z.string())),
      updatedAt: z.optional(z.nullable(z.string())),
      basedOn: z.optional(z.nullable(z.string())),
      notes: z.optional(z.string().check(z.maxLength(4000))),
    }),
  ),
});
const ENVELOPE_KEYS = new Set(Object.keys(envelopeSchema.def.shape));

const iconSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('builtin'), name: z.string().check(z.maxLength(40)) }),
  z.object({ kind: z.literal('svg'), name: z.string().check(z.maxLength(40)), viewBox: z.string().check(z.maxLength(64)), body: z.string().check(z.maxLength(16384)), paint: z.enum(['stroke', 'fill']) }),
  z.object({ kind: z.literal('none') }),
]);

const nullableNumber = z.nullable(z.number());
const tabSchema = z.object({
  kind: z.literal('tab'),
  id: z.string().check(z.regex(TAB_ID)),
  label: z.string().check(z.minLength(1), z.maxLength(TAB_LABEL_MAX)),
  icon: iconSchema,
  value: z.optional(z.nullable(z.string().check(z.maxLength(200)))),
  disabled: z.optional(z.boolean()),
  style: z.optional(z.object({ iconSize: z.optional(nullableNumber), fontSize: z.optional(nullableNumber), fontWeight: z.optional(nullableNumber), letterSpacing: z.optional(nullableNumber) })),
});

const rootShellSchema = z.object({
  kind: z.literal('bottom-navigation'),
  id: z.optional(z.literal('root')),
  label: z.string().check(z.minLength(1), z.maxLength(80)),
  semantics: z.optional(z.enum(['navigation', 'tabs'])),
  defaultTab: z.optional(z.string()),
  children: z.array(z.unknown()).check(z.minLength(1), z.maxLength(200)),
});

const breakpointSchema = z.object({
  id: z.string().check(z.regex(BREAKPOINT_ID)),
  maxWidth: z.number().check(z.gte(200), z.lte(2000)),
  overrides: z.record(z.string(), z.union([z.number(), z.string()])),
});

const SECTION_KEYS = ['layout', 'appearance', 'typography', 'icon', 'states', 'interactions', 'motion', 'responsive'] as const;

function checkIcon(icon: IconRef, at: string, errors: string[], warnings: string[]): IconRef {
  if (icon.kind === 'builtin' && !BUILTIN_ICONS[icon.name]) {
    warnings.push(`${at}: icona "${icon.name}" sconosciuta a questo runtime, uso «star»`);
    return { kind: 'builtin', name: 'star' };
  }
  if (icon.kind !== 'svg') return icon;
  // Untrusted input: parse again, keep only what this runtime would have written.
  const r = parseSvgBody(icon.viewBox, icon.body);
  if (!r.ok) {
    errors.push(...r.errors.map((e) => `${at}: SVG ${e}`));
    return icon;
  }
  const body = serializeSvgNodes(r.nodes);
  if (body !== icon.body) warnings.push(`${at}: SVG normalizzato`);
  return { ...icon, viewBox: r.viewBox, body };
}

function checkRoot(input: unknown, errors: string[], warnings: string[]): BnRoot | null {
  const shell = rootShellSchema.safeParse(input);
  if (!shell.success) {
    errors.push(...formatIssues(shell.error.issues as never).map((e) => `root.${e}`));
    return null;
  }
  const src = input as Record<string, unknown>;
  const sections = Object.fromEntries(SECTION_KEYS.filter((k) => k in src).map((k) => [k, src[k]]));
  // Breakpoints are an array: checked below, not as described leaves.
  const responsive = sections.responsive as Record<string, unknown> | undefined;
  const breakpointsIn = responsive?.breakpoints;
  if (responsive) sections.responsive = Object.fromEntries(Object.entries(responsive).filter(([k]) => k !== 'breakpoints'));
  const f = checkFields(sections, BN_FIELDS, 'root.');
  errors.push(...f.errors);
  warnings.push(...f.warnings);

  const children: BnTab[] = [];
  const seen = new Set<string>();
  (shell.data.children as unknown[]).forEach((raw, i) => {
    const at = `root.children.${i}`;
    const t = tabSchema.safeParse(raw);
    if (!t.success) {
      errors.push(...formatIssues(t.error.issues as never).map((e) => `${at}.${e}`));
      return;
    }
    if (seen.has(t.data.id)) errors.push(`${at}.id: "${t.data.id}" duplicato (gli id delle tab devono essere unici)`);
    seen.add(t.data.id);
    const style = { ...createTab('x', 'x').style };
    for (const [k, d] of Object.entries(TAB_STYLE_FIELDS) as [keyof typeof style, (typeof TAB_STYLE_FIELDS)[keyof typeof style]][]) {
      const v = t.data.style?.[k];
      if (v === undefined || v === null) continue;
      const e = checkField(d, v);
      if (e) errors.push(`${at}.style.${k}: ${e.split(': ').slice(1).join(': ')}`);
      else style[k] = v;
    }
    children.push({
      kind: 'tab',
      id: t.data.id,
      label: t.data.label,
      icon: checkIcon(t.data.icon as IconRef, `${at}.icon`, errors, warnings),
      value: t.data.value ?? null,
      disabled: t.data.disabled ?? false,
      style,
    });
  });

  const breakpoints: BnRoot['responsive']['breakpoints'] = [];
  if (breakpointsIn !== undefined) {
    if (!Array.isArray(breakpointsIn)) errors.push('root.responsive.breakpoints: atteso un elenco');
    else {
      const bpIds = new Set<string>();
      breakpointsIn.forEach((raw, i) => {
        const at = `root.responsive.breakpoints.${i}`;
        const b = breakpointSchema.safeParse(raw);
        if (!b.success) {
          errors.push(...formatIssues(b.error.issues as never).map((e) => `${at}.${e}`));
          return;
        }
        if (bpIds.has(b.data.id)) errors.push(`${at}.id: "${b.data.id}" duplicato`);
        bpIds.add(b.data.id);
        const overrides: Record<string, number | string> = {};
        for (const [k, v] of Object.entries(b.data.overrides)) {
          if (!(OVERRIDE_PATHS as readonly string[]).includes(k)) {
            warnings.push(`${at}.overrides.${k}: non sovrascrivibile da un breakpoint, ignorato`);
            continue;
          }
          const e = checkField(BN_FIELD_INDEX[k]!, v);
          if (e) errors.push(`${at}.overrides.${e}`);
          else overrides[k] = v;
        }
        breakpoints.push({ id: b.data.id, maxWidth: b.data.maxWidth, overrides });
      });
    }
  } else warnings.push('root.responsive.breakpoints: assente, nessun breakpoint');

  if (errors.length) return null;
  let defaultTab = shell.data.defaultTab ?? '';
  if (!children.some((t) => t.id === defaultTab)) {
    if (defaultTab) warnings.push(`root.defaultTab: "${defaultTab}" non è una tab, uso "${children[0]!.id}"`);
    defaultTab = children[0]!.id;
  }
  const v = f.value as unknown as Omit<BnRoot, 'kind' | 'id' | 'label' | 'semantics' | 'defaultTab' | 'children'>;
  return {
    kind: 'bottom-navigation',
    id: 'root',
    label: shell.data.label,
    semantics: shell.data.semantics ?? 'navigation',
    defaultTab,
    layout: v.layout,
    appearance: v.appearance,
    typography: v.typography,
    icon: v.icon,
    states: v.states,
    interactions: v.interactions,
    motion: v.motion,
    responsive: { ...v.responsive, breakpoints },
    children,
  };
}

/** Validates a value that claims to be a jello-component document (any supported version). */
export function parseComponent(input: unknown): ComponentImport {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return { ok: false, errors: ['Il documento deve essere un oggetto JSON'] };
  let raw = input as Record<string, unknown>;
  if (raw.format !== COMPONENT_FORMAT) return { ok: false, errors: [`format: atteso "${COMPONENT_FORMAT}"`] };
  const v = raw.schemaVersion;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) return { ok: false, errors: ['schemaVersion: atteso un intero ≥ 1'] };
  if (v > COMPONENT_SCHEMA_VERSION) {
    return {
      ok: false,
      errors: [`schemaVersion ${v}: componente creato da una versione più recente di Jello. Questo runtime (${RUNTIME_VERSION}) legge fino alla versione ${COMPONENT_SCHEMA_VERSION}. Nessuna modifica applicata.`],
    };
  }
  let migratedFrom: string | null = null;
  for (let at = v; at < COMPONENT_SCHEMA_VERSION; at++) {
    const step = ENVELOPE_MIGRATIONS[at];
    if (!step) return { ok: false, errors: [`schemaVersion ${at}: nessuna migrazione disponibile`] };
    raw = step(raw);
    migratedFrom ??= `${COMPONENT_FORMAT}@${v}`;
  }
  const type = raw.type;
  if (typeof type !== 'string' || !(type in TYPE_VERSIONS)) return { ok: false, errors: [`type: componente "${String(type)}" sconosciuto a questo runtime`] };
  const tv = raw.typeVersion;
  const latest = TYPE_VERSIONS[type as ComponentType];
  if (typeof tv !== 'number' || !Number.isInteger(tv) || tv < 1) return { ok: false, errors: ['typeVersion: atteso un intero ≥ 1'] };
  if (tv > latest) return { ok: false, errors: [`typeVersion ${tv}: ${type} più recente di quello supportato (${latest}). Nessuna modifica applicata.`] };
  for (let at = tv; at < latest; at++) {
    const step = TYPE_MIGRATIONS[type as ComponentType][at];
    if (!step) return { ok: false, errors: [`typeVersion ${at}: nessuna migrazione disponibile`] };
    raw = { ...raw, root: step(raw.root as Record<string, unknown>), typeVersion: at + 1 };
    migratedFrom ??= `${type}@${tv}`;
  }

  const env = envelopeSchema.safeParse(raw);
  if (!env.success) return { ok: false, errors: formatIssues(env.error.issues as never) };
  const e = env.data;
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isVersion(e.runtime.min)) errors.push('runtime.min: attesa una versione x.y.z');
  else if (compareVersions(e.runtime.min, RUNTIME_VERSION) > 0) errors.push(`runtime.min: il componente richiede il runtime ${e.runtime.min}, questo è ${RUNTIME_VERSION}`);
  for (const k of Object.keys(raw)) if (!ENVELOPE_KEYS.has(k)) warnings.push(`${k}: campo sconosciuto, ignorato`);

  const m = parseMaterial(e.material.document);
  let material: MaterialDocument | null = null;
  if (!m.ok) errors.push(...m.errors.map((x) => `material.document.${x}`));
  else {
    material = m.doc;
    warnings.push(...m.warnings.map((x) => `material.document.${x}`));
    if (m.migratedFrom) {
      warnings.push(`material.document: migrato da ${m.migratedFrom}`);
      migratedFrom ??= m.migratedFrom;
    }
    if (e.material.family !== m.doc.family) errors.push(`material.family: "${e.material.family}" non corrisponde al documento (${m.doc.family})`);
  }
  const root = checkRoot(e.root, errors, warnings);
  if (errors.length || !root || !material) return { ok: false, errors };
  return {
    ok: true,
    migratedFrom,
    warnings,
    doc: {
      format: COMPONENT_FORMAT,
      schemaVersion: COMPONENT_SCHEMA_VERSION,
      type: 'bottom-navigation',
      typeVersion: 1,
      id: e.id,
      name: e.name,
      runtime: { min: e.runtime.min },
      material: { family: material.family, preset: e.material.preset ?? null, document: material },
      root,
      meta: { createdAt: e.meta?.createdAt ?? null, updatedAt: e.meta?.updatedAt ?? null, basedOn: e.meta?.basedOn ?? null, notes: e.meta?.notes ?? '' },
    },
  };
}

export function parseComponentText(text: string): ComponentImport {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (err) {
    return { ok: false, errors: [`JSON non valido: ${(err as Error).message}`] };
  }
  return parseComponent(data);
}

/** Stable key order (the material document keeps its own order). */
export function serializeComponent(doc: ComponentDocument): string {
  const { format, schemaVersion, type, typeVersion, id, name, runtime, material, root, meta } = doc;
  return JSON.stringify({ format, schemaVersion, type, typeVersion, id, name, runtime, material: { family: material.family, preset: material.preset, document: orderMaterial(material.document) }, root, meta }, null, 2);
}

function orderMaterial(m: MaterialDocument) {
  const { format, schemaVersion, id, name, family, familyVersion, runtime, material, geometry, behavior, quality, source, target, meta } = m;
  return { format, schemaVersion, id, name, family, familyVersion, runtime, material, geometry, behavior, quality, source, target, meta };
}

export function bindMaterial(doc: MaterialDocument, preset: string | null): MaterialBinding {
  return { family: doc.family, preset, document: doc };
}

export interface CreateComponentOptions {
  id: string;
  name: string;
  root: BnRoot;
  material: MaterialBinding;
  meta?: Partial<ComponentMeta>;
}

export function createComponentDocument(o: CreateComponentOptions): ComponentDocument {
  return {
    format: COMPONENT_FORMAT,
    schemaVersion: COMPONENT_SCHEMA_VERSION,
    type: 'bottom-navigation',
    typeVersion: 1,
    id: o.id,
    name: o.name,
    runtime: { min: RUNTIME_VERSION },
    material: o.material,
    root: o.root,
    meta: { createdAt: null, updatedAt: null, basedOn: null, notes: '', ...o.meta },
  };
}

export function withRoot(doc: ComponentDocument, root: BnRoot): ComponentDocument {
  return { ...doc, root };
}

/** Set a described property of the root by path (returns null if refused). */
export function withRootField(doc: ComponentDocument, path: string, value: unknown): ComponentDocument | null {
  const f = BN_FIELD_INDEX[path];
  if (!f || checkField(f, value)) return null;
  return { ...doc, root: setPath(doc.root, path, f.type === 'color' ? String(value).toLowerCase() : value) };
}

// ---------- templates ----------

export interface ComponentTemplate {
  id: string;
  label: string;
  description: string;
  create(): ComponentDocument;
}

const bt = (): ComponentDocument => {
  const tabs: BnTab[] = [
    createTab('home', 'Home', { kind: 'builtin', name: 'home' }),
    createTab('live', 'Live', { kind: 'builtin', name: 'live' }),
    createTab('matrix', 'Matrice', { kind: 'builtin', name: 'matrix' }),
    createTab('results', 'Risultati', { kind: 'builtin', name: 'results' }),
  ];
  return createComponentDocument({
    id: 'bt-darts',
    name: 'BT Darts',
    root: createRoot(tabs, { label: 'Navigazione principale', defaultTab: 'home' }),
    material: bindMaterial(builtinMaterial('navbar')!.doc, 'navbar'),
    meta: { basedOn: 'bt-darts', notes: 'Template ricavato dalla navbar dimostrativa del laboratorio (caso d’uso BT Darts): quattro tab, una superficie glass, indicatore come strato visivo.' },
  });
};

const basic = (): ComponentDocument => {
  const tabs: BnTab[] = [
    createTab('home', 'Home', { kind: 'builtin', name: 'home' }),
    createTab('search', 'Cerca', { kind: 'builtin', name: 'search' }),
    createTab('profile', 'Profilo', { kind: 'builtin', name: 'user' }),
  ];
  const root = createRoot(tabs, { label: 'Navigazione', defaultTab: 'home' });
  return createComponentDocument({
    id: 'bottom-navigation',
    name: 'Bottom Navigation',
    root: { ...root, layout: { ...root.layout, maxWidth: 380 }, responsive: { ...root.responsive, breakpoints: [{ id: 'compact', maxWidth: 360, overrides: { 'layout.labels': 'active', 'layout.height': 58 } }] } },
    material: bindMaterial(builtinMaterial('jello')!.doc, 'jello'),
    meta: { basedOn: 'bottom-navigation', notes: 'Punto di partenza generico: tre tab, etichette compatte sotto i 360 px.' },
  });
};

export const COMPONENT_TEMPLATES: readonly ComponentTemplate[] = [
  { id: 'bt-darts', label: 'BT Darts', description: 'La navbar dimostrativa del laboratorio come template: Home, Live, Matrice, Risultati.', create: bt },
  { id: 'bottom-navigation', label: 'Base', description: 'Tre tab con etichette compatte su schermi stretti.', create: basic },
];

export function componentTemplate(id: string): ComponentTemplate | undefined {
  return COMPONENT_TEMPLATES.find((t) => t.id === id);
}

export const isTemplateId = (id: string) => COMPONENT_TEMPLATES.some((t) => t.id === id);
