/**
 * The `jello-component-definition` document, schema version 1: the one
 * canonical component format. The builder, the library, projects, exports and
 * the runtime all read and write it; older formats (`jello-component`) are
 * converted to it on import (src/migration) and never used by the application.
 *
 *   {
 *     format: 'jello-component-definition', schemaVersion: 1,
 *     type: 'button' | 'mobile-navbar' | 'desktop-navbar' | 'input', typeVersion: 1,
 *     id, name, runtime: { min },
 *     structure:    { id: 'root', role, children?: [ { id, role, children? } ] },   // what the component is made of
 *     content:      { [nodeId]: { text?, icon?, value?, href?, disabled?, … } },    // what it says and points to
 *     layout:       { … },                                                          // where and how big
 *     responsive:   { … },                                                          // how layout changes with width
 *     style:        { … },                                                          // non-material appearance
 *     material:     { family, preset, revision, params, document? },                // which material, which parameters
 *     states:       { [state]: { material?: {…overrides}, style?: {…} } },          // what changes per state
 *     interactions: { behavior: {…}, events: { [trigger]: 'event-name' } },        // what it reports
 *     meta:         { createdAt, updatedAt, basedOn, notes }
 *   }
 *
 * Structure carries no text and no style; content carries no hierarchy;
 * material carries no content. `layout`, `responsive`, `style`, the `style`
 * of a state and `interactions.behavior` are the properties of the component
 * type: Button and Mobile have renderers; Desktop has a validated property
 * contract (M5.1) and waits for its renderer/editor. Input declares slots only.
 *
 * Material. `family` + `preset` + `params` describe the material from the
 * registry: the built-in preset (or the family's defaults) and the parameter
 * values changed over it. `document`, when present, is a complete material
 * document used as the base instead (a personal material, or a preset edited
 * in the component): the component then reopens and exports exactly as it was
 * even if the preset it came from changes or is deleted; `revision` tells
 * whether the preset moved since. `params` and the per-state `material`
 * overrides apply on top, validated by the descriptors of the chosen family
 * through the registry.
 *
 * Callbacks are never serialized: `events` maps a trigger to the name of a DOM
 * event the host listens to. Parsing is atomic and reports every reason.
 */

import * as z from 'zod/mini';
import { checkKeys } from '../core/descriptors';
import { ID_PATTERN, formatIssues, serializeMaterial, type MaterialDocument } from '../model/document';
import { parseMaterial } from '../model/migrate';
import { MATERIALS, type MaterialStateId } from '../model/registry';
import { RUNTIME_VERSION, compareVersions, isVersion } from '../model/version';
import type { FieldDescriptor } from './fields';
import { checkIconRef, type IconRef } from './icons';
import { BUTTON_FIELDS, BUTTON_STATES, BUTTON_TRIGGERS, checkButtonSections, withButtonDefaults } from './button';
import { NAVBAR_FIELDS, NAVBAR_STATES, NAVBAR_TRIGGERS, checkNavbarSections, type NavbarSections } from './navbar';
import { checkNavbarAction, checkNavbarStructure, isSafeNavigationHref, navbarItemNodes, type NavbarAction, type NavbarIconPosition } from './navbar-contract';
import { DESKTOP_NAVBAR_FIELDS, checkDesktopNavbarSections } from './navbar-desktop';
import { DESKTOP_NAVBAR_REGION_FIELD, NAVBAR_GROUP_FIELDS, NAVBAR_ITEM_FIELDS } from './navbar-inspector';

export const DEFINITION_FORMAT = 'jello-component-definition';
export const DEFINITION_SCHEMA_VERSION = 1;

export type DefinitionType = 'button' | 'mobile-navbar' | 'desktop-navbar' | 'input';
export type NodeRole = 'button' | 'navbar' | 'group' | 'field' | 'label' | 'icon' | 'item' | 'brand' | 'action' | 'control' | 'helper';
export type Trigger = 'press' | 'hover' | 'focus' | 'change' | 'submit' | 'reselect' | 'action';
/** Material states plus `focus`, a ring drawn by the component rather than a material state. */
export type ComponentStateId = MaterialStateId | 'focus';

export interface Slot {
  role: NodeRole;
  min: number;
  max: number;
  children?: readonly Slot[];
}

export interface DefinitionTypeInfo {
  type: DefinitionType;
  label: string;
  description: string;
  typeVersion: 1;
  /** Has a renderer and an editor. */
  implemented: boolean;
  /** `jello-component` type this one replaces (converted on import). */
  legacyType?: string;
  root: { role: NodeRole; slots: readonly Slot[] };
  /** States the component can be in. A material must render a state for `states.<s>.material` to be accepted. */
  states: readonly ComponentStateId[];
  triggers: readonly Trigger[];
  /** Roles that receive input. */
  interactive: readonly NodeRole[];
  /** Which property profile validates layout, style, per-state style and behavior. `null`: none yet. */
  profile: 'navbar' | 'desktop-navbar' | 'button' | null;
}

const optional = (role: NodeRole, max = 1): Slot => ({ role, min: 0, max });
const required = (role: NodeRole, min = 1, max = min): Slot => ({ role, min, max });
const navbarItemSlot: Slot = { role: 'item', min: 0, max: 200, children: [optional('icon'), optional('label')] };
const navbarGroupSlot: Slot = { role: 'group', min: 0, max: 200, children: [navbarItemSlot] };

export const DEFINITION_TYPES: readonly DefinitionTypeInfo[] = [
  {
    type: 'button',
    label: 'Button',
    description: 'Pulsante o collegamento con etichetta e icona facoltativa, in tre varianti (Primary, Secondary, Ghost).',
    typeVersion: 1,
    implemented: true,
    root: { role: 'button', slots: [required('label'), optional('icon')] },
    states: BUTTON_STATES,
    triggers: BUTTON_TRIGGERS,
    interactive: ['button'],
    profile: 'button',
  },
  {
    type: 'mobile-navbar',
    label: 'Mobile Navbar',
    description: 'Barra di navigazione per telefono (ex Bottom Navigation): una o più voci con icona e/o etichetta.',
    typeVersion: 1,
    implemented: true,
    legacyType: 'bottom-navigation',
    root: { role: 'navbar', slots: [navbarItemSlot, navbarGroupSlot] },
    states: NAVBAR_STATES,
    triggers: NAVBAR_TRIGGERS,
    interactive: ['item'],
    profile: 'navbar',
  },
  {
    type: 'desktop-navbar',
    label: 'Desktop Navbar',
    description: 'Barra orizzontale per schermi larghi: marchio, voci con etichetta e azioni.',
    typeVersion: 1,
    implemented: true,
    root: {
      role: 'navbar',
      slots: [
        { role: 'brand', min: 0, max: 1, children: [optional('icon'), optional('label')] },
        navbarItemSlot,
        navbarGroupSlot,
        { role: 'action', min: 0, max: 4, children: [optional('icon'), optional('label')] },
      ],
    },
    states: ['default', 'hover', 'pressed', 'active', 'focus', 'disabled'],
    triggers: NAVBAR_TRIGGERS,
    interactive: ['brand', 'item', 'action'],
    profile: 'desktop-navbar',
  },
  {
    type: 'input',
    label: 'Input',
    description: 'Campo di testo con etichetta, icone ai lati e testo di aiuto.',
    typeVersion: 1,
    implemented: false,
    root: { role: 'field', slots: [optional('label'), optional('icon', 2), required('control'), optional('helper')] },
    states: ['default', 'hover', 'focus', 'disabled'],
    triggers: ['change', 'focus', 'submit'],
    interactive: ['control'],
    profile: null,
  },
];

export function definitionType(type: string): DefinitionTypeInfo | undefined {
  return DEFINITION_TYPES.find((t) => t.type === type);
}

/** The described properties of a type, by canonical path (what an inspector for the component lists). */
export function definitionFields(type: DefinitionType, role?: NodeRole): readonly FieldDescriptor[] {
  if ((type === 'mobile-navbar' || type === 'desktop-navbar') && role) {
    const fields = role === 'group' ? NAVBAR_GROUP_FIELDS : ['item', 'brand', 'action'].includes(role) ? NAVBAR_ITEM_FIELDS : [];
    return type === 'desktop-navbar' && fields.length ? [...fields, { ...DESKTOP_NAVBAR_REGION_FIELD, path: role === 'group' ? 'layout.regions.$group' : DESKTOP_NAVBAR_REGION_FIELD.path }] : fields;
  }
  switch (definitionType(type)?.profile) {
    case 'navbar':
      return NAVBAR_FIELDS;
    case 'desktop-navbar':
      return DESKTOP_NAVBAR_FIELDS;
    case 'button':
      return BUTTON_FIELDS;
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------

export interface StructureNode {
  id: string;
  role: NodeRole;
  children?: StructureNode[];
}

export type InputType = 'text' | 'email' | 'password' | 'search' | 'number' | 'tel' | 'url';
const INPUT_TYPES: readonly InputType[] = ['text', 'email', 'password', 'search', 'number', 'tel', 'url'];

export interface NodeContent {
  text?: string;
  icon?: IconRef;
  /** Payload the host receives with the item's events (a route, a key, an action id) or a field's name. Free text. */
  value?: string;
  href?: string;
  disabled?: boolean;
  visible?: boolean;
  action?: NavbarAction;
  iconPosition?: NavbarIconPosition;
  accessibleLabel?: string;
  description?: string;
  inputType?: InputType;
  placeholder?: string;
}

export interface DefinitionMaterial {
  family: MaterialDocument['family'];
  /** Library entry the material comes from (built-in or personal), or null. */
  preset: string | null;
  /** Content revision of the preset when it was applied (`materialRevision`); null when unknown or unlinked. */
  revision: string | null;
  /** Flat parameter values over the base (validated by the family's descriptors). */
  params: Record<string, unknown>;
  /** Complete material document used as the base instead of the preset. */
  document?: MaterialDocument;
}

export interface StateEntry {
  /** Material parameters this state overrides (the family's `stateParams`). */
  material?: Record<string, unknown>;
  /** Component style of this state (the type's property profile). */
  style?: Record<string, unknown>;
}

export interface DefinitionInteractions {
  /** Type-specific switches (navbar: semantics, defaultItem, pressFeedback, wheelForward, reselect). */
  behavior: Record<string, unknown>;
  /** DOM event name reported for each trigger. */
  events: Record<string, string>;
}

export interface DefinitionMeta {
  createdAt: string | null;
  updatedAt: string | null;
  /** Template or component the definition was created from. */
  basedOn: string | null;
  notes: string;
}

export interface ComponentDefinition {
  format: typeof DEFINITION_FORMAT;
  schemaVersion: typeof DEFINITION_SCHEMA_VERSION;
  type: DefinitionType;
  typeVersion: 1;
  id: string;
  name: string;
  runtime: { min: string };
  structure: StructureNode;
  content: Record<string, NodeContent>;
  layout: Record<string, unknown>;
  responsive: Record<string, unknown>;
  style: Record<string, unknown>;
  material: DefinitionMaterial;
  states: Partial<Record<ComponentStateId, StateEntry>>;
  interactions: DefinitionInteractions;
  meta: DefinitionMeta;
}

export type DefinitionImport =
  | { ok: true; doc: ComponentDefinition; warnings: string[]; migratedFrom: string | null }
  | { ok: false; errors: string[] };

/** What each role may carry. Required keys must be present; others are refused. */
const ROLE_CONTENT: Readonly<Record<NodeRole, { required: readonly (keyof NodeContent)[]; allowed: readonly (keyof NodeContent)[] }>> = {
  /** An action's `value` travels with its event; a link's `href` is where it goes. */
  button: { required: [], allowed: ['value', 'href', 'disabled'] },
  /** `text` is the accessible name of the navigation. */
  navbar: { required: ['text'], allowed: ['text'] },
  group: { required: [], allowed: ['text'] },
  field: { required: [], allowed: [] },
  label: { required: ['text'], allowed: ['text'] },
  icon: { required: ['icon'], allowed: ['icon'] },
  item: { required: [], allowed: ['value', 'href', 'disabled', 'visible', 'action', 'iconPosition', 'accessibleLabel', 'description'] },
  brand: { required: [], allowed: ['value', 'href', 'disabled', 'visible', 'action', 'iconPosition', 'accessibleLabel', 'description'] },
  action: { required: ['value'], allowed: ['value', 'href', 'disabled', 'visible', 'action', 'iconPosition', 'accessibleLabel', 'description'] },
  control: { required: ['value'], allowed: ['value', 'inputType', 'placeholder', 'disabled'] },
  helper: { required: ['text'], allowed: ['text'] },
};

export const NODE_ID = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
/** DOM event names a host listens to. */
export const EVENT_NAME = /^[a-z][a-z0-9-]{0,39}$/;
const VALUE_MAX = 200;
const TEXT_MAX = 120;
const MAX_NODES = 1024;
const META = z.object({
  createdAt: z.optional(z.nullable(z.string())),
  updatedAt: z.optional(z.nullable(z.string())),
  basedOn: z.optional(z.nullable(z.string())),
  notes: z.optional(z.string().check(z.maxLength(4000))),
});

const BASE_SCHEMA = z.object({
  format: z.literal(DEFINITION_FORMAT),
  schemaVersion: z.literal(DEFINITION_SCHEMA_VERSION),
  type: z.string(),
  typeVersion: z.literal(1),
  id: z.string().check(z.regex(ID_PATTERN)),
  name: z.string().check(z.minLength(1), z.maxLength(80)),
  runtime: z.object({ min: z.string() }),
  structure: z.unknown(),
  content: z.optional(z.unknown()),
  layout: z.optional(z.unknown()),
  responsive: z.optional(z.unknown()),
  style: z.optional(z.unknown()),
  material: z.unknown(),
  states: z.optional(z.unknown()),
  interactions: z.optional(z.unknown()),
  meta: z.optional(META),
});
const KNOWN_KEYS = new Set(Object.keys(BASE_SCHEMA.def.shape));

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Flat list of nodes with the slot rules applied; reports every violation. */
function checkStructure(root: unknown, info: DefinitionTypeInfo, errors: string[]): Map<string, NodeRole> {
  const ids = new Map<string, NodeRole>();
  let count = 0;
  const visit = (node: unknown, at: string, rules: { role: NodeRole; slots: readonly Slot[] } | null, role: NodeRole | null) => {
    if (!isObject(node)) {
      errors.push(`${at}: atteso un oggetto`);
      return;
    }
    if (++count > MAX_NODES) {
      if (count === MAX_NODES + 1) errors.push(`structure: più di ${MAX_NODES} nodi`);
      return;
    }
    const id = node.id;
    if (typeof id !== 'string' || !NODE_ID.test(id)) errors.push(`${at}.id: atteso un identificatore (lettere, cifre, trattino e underscore, max 64)`);
    else if (ids.has(id)) errors.push(`${at}.id: «${id}» è duplicato`);
    else if (rules === info.root && id !== 'root') errors.push(`${at}.id: la radice si chiama «root»`);
    const r = node.role;
    if (typeof r !== 'string' || !(r in ROLE_CONTENT)) {
      errors.push(`${at}.role: ruolo sconosciuto`);
      return;
    }
    if (typeof id === 'string' && !ids.has(id)) ids.set(id, r as NodeRole);
    if (role !== null && r !== role) errors.push(`${at}.role: atteso «${role}», trovato «${r}»`);
    const kids = node.children ?? [];
    if (!Array.isArray(kids)) {
      errors.push(`${at}.children: attesa una lista`);
      return;
    }
    const slots = rules?.slots ?? [];
    for (const k of kids) {
      const kr = isObject(k) ? k.role : undefined;
      if (!slots.some((s) => s.role === kr)) errors.push(`${at}: un nodo «${String(kr)}» non è ammesso dentro «${r}» (ammessi: ${slots.map((s) => s.role).join(', ') || 'nessuno'})`);
    }
    for (const slot of slots) {
      const n = kids.filter((k) => isObject(k) && k.role === slot.role).length;
      if (n < slot.min || n > slot.max) errors.push(`${at}: «${slot.role}» ammesso da ${slot.min} a ${slot.max}, trovati ${n}`);
    }
    kids.forEach((k, i) => {
      const kr = isObject(k) ? k.role : undefined;
      const slot = slots.find((s) => s.role === kr);
      if (slot) visit(k, `${at}.children[${i}]`, { role: slot.role, slots: slot.children ?? [] }, slot.role);
    });
  };
  visit(root, 'structure', info.root, info.root.role);
  return ids;
}

function checkContent(input: unknown, ids: ReadonlyMap<string, NodeRole>, errors: string[], warnings: string[]): Record<string, NodeContent> {
  const out: Record<string, NodeContent> = {};
  const src = input === undefined ? {} : input;
  if (!isObject(src)) {
    errors.push('content: atteso un oggetto');
    return out;
  }
  for (const [id, role] of ids) {
    const spec = ROLE_CONTENT[role];
    const raw = src[id];
    if (raw === undefined) {
      if (spec.required.length) errors.push(`content.${id}: «${role}» richiede ${spec.required.join(', ')}`);
      continue;
    }
    if (!isObject(raw)) {
      errors.push(`content.${id}: atteso un oggetto`);
      continue;
    }
    const c: NodeContent = {};
    for (const key of Object.keys(raw)) {
      if (!(spec.allowed as readonly string[]).includes(key)) {
        errors.push(`content.${id}.${key}: non ammesso per un nodo «${role}»`);
        continue;
      }
      const v = raw[key];
      const at = `content.${id}.${key}`;
      switch (key as keyof NodeContent) {
        case 'text':
        case 'placeholder':
        case 'accessibleLabel':
        case 'description':
          if (typeof v !== 'string' || (key === 'text' && v.trim() === '') || v.length > TEXT_MAX) errors.push(`${at}: atteso un testo di 1–${TEXT_MAX} caratteri`);
          else c[key as 'text' | 'placeholder' | 'accessibleLabel' | 'description'] = v;
          break;
        case 'value':
          // Free payload for the host (a route, a key…): the item's id is its identity, not this.
          if (typeof v !== 'string' || v.length > VALUE_MAX) errors.push(`${at}: atteso un testo di al più ${VALUE_MAX} caratteri`);
          else c.value = v;
          break;
        case 'href':
          if (!isSafeNavigationHref(v)) errors.push(`${at}: atteso un percorso (/…), un'ancora (#…) o un URL http(s)`);
          else c.href = v;
          break;
        case 'disabled':
        case 'visible':
          if (typeof v !== 'boolean') errors.push(`${at}: atteso true o false`);
          else c[key as 'disabled' | 'visible'] = v;
          break;
        case 'action': {
          const error = checkNavbarAction(v);
          if (error) errors.push(`${at}: ${error}`);
          else c.action = structuredClone(v) as NavbarAction;
          break;
        }
        case 'iconPosition':
          if (!['start', 'end', 'top', 'bottom'].includes(String(v))) errors.push(`${at}: posizione icona non valida`);
          else c.iconPosition = v as NavbarIconPosition;
          break;
        case 'inputType':
          if (typeof v !== 'string' || !(INPUT_TYPES as readonly string[]).includes(v)) errors.push(`${at}: atteso uno tra ${INPUT_TYPES.join(', ')}`);
          else c.inputType = v as InputType;
          break;
        case 'icon': {
          const icon = parseIcon(v, at, errors, warnings);
          if (icon) c.icon = icon;
          break;
        }
      }
    }
    for (const key of spec.required) if (!(key in raw)) errors.push(`content.${id}.${key}: richiesto per un nodo «${role}»`);
    out[id] = c;
  }
  for (const id of Object.keys(src)) if (!ids.has(id)) warnings.push(`content.${id}: nessun nodo con questo id, ignorato`);
  return out;
}

const ICON_SCHEMA = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('builtin'), name: z.string().check(z.maxLength(40)) }),
  z.object({ kind: z.literal('svg'), name: z.string().check(z.maxLength(40)), viewBox: z.string().check(z.maxLength(64)), body: z.string().check(z.maxLength(16384)), paint: z.enum(['stroke', 'fill']) }),
  z.object({ kind: z.literal('none') }),
]);

function parseIcon(v: unknown, at: string, errors: string[], warnings: string[]): IconRef | null {
  const r = ICON_SCHEMA.safeParse(v);
  if (!r.success) {
    errors.push(...formatIssues(r.error.issues as never).map((e) => `${at}.${e}`));
    return null;
  }
  return checkIconRef(r.data as IconRef, at, errors, warnings);
}

function checkMaterial(input: unknown, errors: string[], warnings: string[], migrated: { from: string | null }): DefinitionMaterial | null {
  const before = errors.length;
  if (!isObject(input)) {
    errors.push('material: atteso un oggetto');
    return null;
  }
  const family = input.family;
  const def = typeof family === 'string' ? MATERIALS.get(family) : undefined;
  if (!def) {
    errors.push(`material.family: «${String(family)}» non è un materiale disponibile (disponibili: ${MATERIALS.list().map((d) => d.id).join(', ')})`);
    return null;
  }
  const preset = input.preset ?? null;
  const hasDocument = input.document !== undefined;
  if (preset !== null) {
    if (typeof preset !== 'string' || !ID_PATTERN.test(preset)) errors.push('material.preset: atteso un id o null');
    // Without an embedded document the preset must be one the registry can resolve.
    else if (!hasDocument && !def.presets.some((p) => p.doc.id === preset)) errors.push(`material.preset: «${preset}» non è un preset di ${def.name}`);
  }
  const revision = input.revision ?? null;
  if (revision !== null && (typeof revision !== 'string' || !/^[0-9a-f]{8}$/.test(revision))) errors.push('material.revision: atteso otto cifre esadecimali o null');
  let document: MaterialDocument | undefined;
  if (hasDocument) {
    const m = parseMaterial(input.document);
    if (!m.ok) errors.push(...m.errors.map((e) => `material.document.${e}`));
    else {
      document = m.doc;
      warnings.push(...m.warnings.map((e) => `material.document.${e}`));
      if (m.migratedFrom) {
        warnings.push(`material.document: migrato da ${m.migratedFrom}`);
        migrated.from ??= m.migratedFrom;
      }
      if (m.doc.family !== def.id) errors.push(`material.family: "${def.id}" non corrisponde al documento (${m.doc.family})`);
    }
  }
  // A definition lists only what it changes: absent keys are not warnings here.
  const checked = def.validateParams(input.params ?? {}, { scope: 'material.params', partial: true });
  errors.push(...checked.errors);
  warnings.push(...checked.warnings);
  for (const key of Object.keys(input)) if (!['family', 'preset', 'revision', 'params', 'document'].includes(key)) warnings.push(`material.${key}: campo sconosciuto, ignorato`);
  if (errors.length > before) return null;
  return { family: def.id as DefinitionMaterial['family'], preset: preset as string | null, revision: revision as string | null, params: checked.values, ...(document ? { document } : {}) };
}

/** `states`: which states exist for the type and, for each, its material overrides. Style is checked by the type's profile. */
function checkStateMaterials(input: unknown, info: DefinitionTypeInfo, family: DefinitionMaterial['family'] | null, errors: string[], warnings: string[]): Partial<Record<ComponentStateId, Record<string, unknown>>> {
  const out: Partial<Record<ComponentStateId, Record<string, unknown>>> = {};
  if (input === undefined) return out;
  if (!isObject(input)) {
    errors.push('states: atteso un oggetto');
    return out;
  }
  const def = family ? MATERIALS.get(family) : undefined;
  for (const [state, raw] of Object.entries(input)) {
    const at = `states.${state}`;
    if (state === 'default') {
      errors.push(`${at}: lo stato iniziale è il materiale (usa material.params)`);
      continue;
    }
    if (!(info.states as readonly string[]).includes(state)) {
      errors.push(`${at}: il tipo «${info.type}» non ha lo stato «${state}» (ha: ${info.states.join(', ')})`);
      continue;
    }
    if (!isObject(raw)) {
      errors.push(`${at}: atteso un oggetto`);
      continue;
    }
    for (const k of Object.keys(raw)) if (k !== 'material' && k !== 'style') warnings.push(`${at}.${k}: proprietà sconosciuta, ignorata`);
    if (raw.material === undefined || !def) continue;
    if (!(def.states as readonly string[]).includes(state)) {
      errors.push(`${at}.material: il materiale ${def.name} non rende lo stato «${state}»`);
      continue;
    }
    const r = checkKeys(def.stateParams, raw.material, { scope: `${at}.material`, partial: true });
    errors.push(...r.errors);
    warnings.push(...r.warnings);
    out[state as ComponentStateId] = r.values;
  }
  return out;
}

function checkEvents(events: unknown, info: DefinitionTypeInfo, errors: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  if (events === undefined) return out;
  if (!isObject(events)) {
    errors.push('interactions.events: atteso un oggetto');
    return out;
  }
  for (const [trigger, name] of Object.entries(events)) {
    if (!(info.triggers as readonly string[]).includes(trigger)) errors.push(`interactions.events.${trigger}: il tipo «${info.type}» ammette ${info.triggers.join(', ')}`);
    else if (typeof name !== 'string' || !EVENT_NAME.test(name)) errors.push(`interactions.events.${trigger}: atteso un nome di evento (minuscole, cifre, trattino, max 40)`);
    else out[trigger] = name;
  }
  return out;
}

/** Validates a value that claims to be a component definition. Atomic: every reason is reported, nothing is half-applied. */
export function parseDefinition(input: unknown): DefinitionImport {
  if (!isObject(input)) return { ok: false, errors: ['Il documento deve essere un oggetto JSON'] };
  if (input.format !== DEFINITION_FORMAT) return { ok: false, errors: [`format: atteso "${DEFINITION_FORMAT}"`] };
  const v = input.schemaVersion;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) return { ok: false, errors: ['schemaVersion: atteso un intero'] };
  if (v > DEFINITION_SCHEMA_VERSION) {
    return {
      ok: false,
      errors: [`schemaVersion ${v}: la definizione è stata creata da una versione più recente di Jello. Questo runtime (${RUNTIME_VERSION}) legge fino alla versione ${DEFINITION_SCHEMA_VERSION}. Nessuna modifica applicata.`],
    };
  }
  const info = typeof input.type === 'string' ? definitionType(input.type) : undefined;
  if (!info) return { ok: false, errors: [`type: «${String(input.type)}» sconosciuto (tipi: ${DEFINITION_TYPES.map((t) => t.type).join(', ')})`] };
  if (typeof input.typeVersion === 'number' && input.typeVersion > info.typeVersion) {
    return { ok: false, errors: [`typeVersion ${input.typeVersion}: «${info.label}» è più recente di quello supportato (${info.typeVersion}). Nessuna modifica applicata.`] };
  }
  const parsed = BASE_SCHEMA.safeParse(input);
  if (!parsed.success) return { ok: false, errors: formatIssues(parsed.error.issues as never) };
  const env = parsed.data;
  const errors: string[] = [];
  const warnings: string[] = [];
  const migrated: { from: string | null } = { from: null };
  if (!isVersion(env.runtime.min)) errors.push('runtime.min: attesa una versione x.y.z');
  else if (compareVersions(env.runtime.min, RUNTIME_VERSION) > 0) errors.push(`runtime.min: la definizione richiede il runtime ${env.runtime.min}, questo è ${RUNTIME_VERSION}`);
  for (const k of Object.keys(input)) if (!KNOWN_KEYS.has(k)) warnings.push(`${k}: campo sconosciuto, ignorato`);

  const before = errors.length;
  const ids = checkStructure(env.structure, info, errors);
  // Content and the type's properties refer to node ids: with a broken structure they would only repeat the same fault.
  const structureOk = errors.length === before;
  const content = structureOk ? checkContent(env.content, ids, errors, warnings) : {};
  const material = checkMaterial(env.material, errors, warnings, migrated);
  const stateMaterials = checkStateMaterials(env.states, info, material?.family ?? null, errors, warnings);

  let profile: { sections: NavbarSections } | null = null;
  let events: Record<string, string> = {};
  if (structureOk) {
    const sections = { layout: env.layout, responsive: env.responsive, style: env.style, states: env.states, interactions: env.interactions };
    if (info.profile === 'navbar' || info.profile === 'desktop-navbar') {
      const structure = env.structure as StructureNode;
      const items = navbarItemNodes({ structure }).filter(({ node }) => node.role === 'item').map(({ node }) => node);
      profile = info.profile === 'navbar' ? checkNavbarSections(sections, items, errors, warnings) : checkDesktopNavbarSections(sections, items, structure, errors, warnings);
      const inter = isObject(env.interactions) ? env.interactions : {};
      checkNavbarStructure({ type: info.type, structure, content, interactions: { behavior: isObject(inter.behavior) ? inter.behavior : {}, events: {} } }, errors);
    } else if (info.profile === 'button') {
      profile = checkButtonSections(sections, content, errors, warnings);
    } else {
      for (const k of ['layout', 'responsive', 'style'] as const) {
        if (isObject(env[k]) && Object.keys(env[k] as object).length) warnings.push(`${k}: «${info.label}» non ha ancora proprietà di ${k}, ignorato`);
      }
      const inter = isObject(env.interactions) ? env.interactions : {};
      events = checkEvents(inter.events, info, errors);
      // The type has no property table yet: say so instead of dropping the values without a word.
      if (isObject(inter.behavior) && Object.keys(inter.behavior).length) warnings.push(`interactions.behavior: «${info.label}» non ha ancora proprietà di comportamento, ignorato`);
      for (const [s, entry] of Object.entries(isObject(env.states) ? env.states : {})) {
        if (isObject(entry) && isObject(entry.style) && Object.keys(entry.style).length) warnings.push(`states.${s}.style: «${info.label}» non ha ancora proprietà di stile per gli stati, ignorato`);
      }
    }
    if (profile) {
      events = profile.sections.events as Record<string, string>;
      if (info.profile === 'navbar' || info.profile === 'desktop-navbar') {
        const inter = isObject(env.interactions) ? env.interactions : {};
        const extra = isObject(inter.events) ? Object.fromEntries(Object.entries(inter.events).filter(([k]) => !['press', 'change', 'reselect'].includes(k))) : {};
        events = { ...events, ...checkEvents(extra, info, errors) };
      }
    }
  }
  if (errors.length || !material || !structureOk) return { ok: false, errors };

  const states: ComponentDefinition['states'] = {};
  for (const s of info.states) {
    if (s === 'default') continue;
    const entry: StateEntry = {};
    const style = profile?.sections.stateStyles[s as keyof NavbarSections['stateStyles']];
    if (style) entry.style = style;
    if (stateMaterials[s]) entry.material = stateMaterials[s]!;
    if (entry.style || entry.material) states[s] = entry;
  }
  const doc: ComponentDefinition = {
    format: DEFINITION_FORMAT,
    schemaVersion: DEFINITION_SCHEMA_VERSION,
    type: info.type,
    typeVersion: 1,
    id: env.id,
    name: env.name,
    runtime: { min: env.runtime.min },
    structure: normalizeStructure(env.structure as StructureNode),
    content,
    layout: profile?.sections.layout ?? {},
    responsive: profile?.sections.responsive ?? {},
    style: profile?.sections.style ?? {},
    material,
    states,
    interactions: { behavior: profile?.sections.behavior ?? {}, events },
    meta: { createdAt: env.meta?.createdAt ?? null, updatedAt: env.meta?.updatedAt ?? null, basedOn: env.meta?.basedOn ?? null, notes: env.meta?.notes ?? '' },
  };
  return { ok: true, doc, warnings, migratedFrom: migrated.from };
}

export function parseDefinitionText(text: string): DefinitionImport {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { ok: false, errors: [`JSON non valido: ${(e as Error).message}`] };
  }
  return parseDefinition(data);
}

/** Keeps only `id`, `role` and `children` of each node (a validated tree, without stray fields). */
function normalizeStructure(n: StructureNode): StructureNode {
  return n.children?.length || (n.role === 'group' && n.children) ? { id: n.id, role: n.role, children: n.children!.map(normalizeStructure) } : { id: n.id, role: n.role };
}

/** Content in the order of the structure (depth first), so a definition reads the same however it was edited. */
function orderedContent(doc: Pick<ComponentDefinition, 'structure' | 'content'>): Record<string, NodeContent> {
  const out: Record<string, NodeContent> = {};
  const walk = (n: StructureNode) => {
    if (n.id in doc.content) out[n.id] = doc.content[n.id]!;
    for (const c of n.children ?? []) walk(c);
  };
  walk(doc.structure);
  // Anything the structure does not name keeps its place after the rest: nothing is dropped by writing.
  for (const [id, c] of Object.entries(doc.content)) if (!(id in out)) out[id] = c;
  return out;
}

/** Stable key order, two-space indent. The material document keeps the order of `serializeMaterial`. */
export function serializeDefinition(doc: ComponentDefinition): string {
  const m = doc.material;
  return JSON.stringify(
    {
      format: doc.format,
      schemaVersion: doc.schemaVersion,
      type: doc.type,
      typeVersion: doc.typeVersion,
      id: doc.id,
      name: doc.name,
      runtime: doc.runtime,
      structure: doc.structure,
      content: orderedContent(doc),
      layout: doc.layout,
      responsive: doc.responsive,
      style: doc.style,
      material: { family: m.family, preset: m.preset, revision: m.revision, params: m.params, ...(m.document ? { document: JSON.parse(serializeMaterial(m.document)) } : {}) },
      states: doc.states,
      interactions: doc.interactions,
      meta: doc.meta,
    },
    null,
    2,
  );
}

/**
 * The full material document a definition describes: the embedded document
 * or the preset (or the family's defaults), then `params`, then the per-state
 * overrides. Goes through the registry, never through a family.
 */
export function resolveDefinitionMaterial(doc: ComponentDefinition): MaterialDocument {
  const def = MATERIALS.get(doc.material.family);
  if (!def) throw new Error(`Materiale non registrato: ${doc.material.family}`);
  const preset = doc.material.preset ? def.presets.find((p) => p.doc.id === doc.material.preset)?.doc : undefined;
  if (!doc.material.document && doc.material.preset && !preset) throw new Error(`Preset non trovato: ${doc.material.preset}`);
  let base = doc.material.document ?? preset ?? def.create(`${doc.id}-material`, `${doc.name} · materiale`);
  // A component that asks for emphasis (a primary button) gets the family's own accent first; its parameters win over it.
  if (doc.style.variant === 'primary') base = def.customize(base, def.accent);
  const states: Partial<Record<MaterialStateId, Record<string, unknown>>> = {};
  for (const [s, e] of Object.entries(doc.states)) if (e?.material) states[s as MaterialStateId] = e.material;
  // Nothing to apply: the base itself, so identity comparisons ("did the material change?") keep working.
  if (!Object.keys(doc.material.params).length && !Object.keys(states).length) return base;
  return def.customize(base, { params: doc.material.params, states });
}

// ---------------------------------------------------------------------------
// Compatibility between a component type and a material family
// ---------------------------------------------------------------------------

export interface MaterialCompatibility {
  type: DefinitionType;
  family: string;
  /** Always true for a registered family: a state the material does not render is drawn by the component's own style. */
  compatible: boolean;
  /** States of the type that the material renders itself. */
  rendered: ComponentStateId[];
  /** States of the type that only the component's style expresses. */
  byComponent: ComponentStateId[];
  /** Interactions the material reacts to on its own (press feedback, hover…). */
  materialInteractions: readonly string[];
  notes: string[];
}

export function materialCompatibility(type: DefinitionType, family: string): MaterialCompatibility | null {
  const info = definitionType(type);
  const def = MATERIALS.get(family);
  if (!info || !def) return null;
  const states = info.states.filter((s) => s !== 'default');
  const rendered = states.filter((s) => (def.states as readonly string[]).includes(s));
  const byComponent = states.filter((s) => !rendered.includes(s));
  const notes = byComponent.length ? [`${def.name} non rende ${byComponent.map((s) => `«${s}»`).join(', ')}: ${byComponent.length > 1 ? 'li esprime' : 'lo esprime'} lo stile del componente.`] : [];
  return { type, family, compatible: true, rendered, byComponent, materialInteractions: def.interactions, notes };
}

// ---------------------------------------------------------------------------
// Starters
// ---------------------------------------------------------------------------

const node = (id: string, role: NodeRole, children?: StructureNode[]): StructureNode => (children ? { id, role, children } : { id, role });
const text = (t: string): NodeContent => ({ text: t });
const icon = (name: string): NodeContent => ({ icon: { kind: 'builtin', name } });

/** A small valid definition of each type, as a starting point (and as test fixtures). Material: Solid, initial values. */
export function starterDefinition(type: DefinitionType, o: { id?: string; name?: string } = {}): ComponentDefinition {
  const info = definitionType(type)!;
  let structure = node('root', info.root.role);
  let content: Record<string, NodeContent> = {};
  let events: Record<string, string> = {};
  switch (type) {
    case 'button':
      structure = node('root', 'button', [node('icon', 'icon'), node('label', 'label')]);
      content = { icon: icon('plus'), label: text('Aggiungi') };
      break;
    case 'mobile-navbar':
      structure = node('root', 'navbar', [
        node('home', 'item', [node('home-icon', 'icon'), node('home-label', 'label')]),
        node('search', 'item', [node('search-icon', 'icon'), node('search-label', 'label')]),
        node('profile', 'item', [node('profile-icon', 'icon'), node('profile-label', 'label')]),
      ]);
      content = {
        root: text('Navigazione principale'),
        home: { value: 'home' }, 'home-icon': icon('home'), 'home-label': text('Home'),
        search: { value: 'search' }, 'search-icon': icon('search'), 'search-label': text('Cerca'),
        profile: { value: 'profile' }, 'profile-icon': icon('user'), 'profile-label': text('Profilo'),
      };
      break;
    case 'desktop-navbar':
      structure = node('root', 'navbar', [
        node('brand', 'brand', [node('brand-label', 'label')]),
        node('docs', 'item', [node('docs-label', 'label')]),
        node('pricing', 'item', [node('pricing-label', 'label')]),
        node('signin', 'action', [node('signin-label', 'label')]),
      ]);
      content = {
        root: text('Navigazione principale'),
        brand: { href: '/' }, 'brand-label': text('Your brand'),
        docs: { value: 'docs', href: '/docs' }, 'docs-label': text('Documentazione'),
        pricing: { value: 'pricing', href: '/pricing' }, 'pricing-label': text('Prezzi'),
        signin: { value: 'signin' }, 'signin-label': text('Accedi'),
      };
      events = { press: 'navbar-action' };
      break;
    case 'input':
      structure = node('root', 'field', [node('label', 'label'), node('leading', 'icon'), node('control', 'control'), node('helper', 'helper')]);
      content = { label: text('Cerca'), leading: icon('search'), control: { value: 'query', inputType: 'search', placeholder: 'Cerca nel catalogo' }, helper: text('Premi Invio per cercare.') };
      events = { change: 'input-change', submit: 'input-submit' };
      break;
  }
  const base: ComponentDefinition = {
    format: DEFINITION_FORMAT,
    schemaVersion: DEFINITION_SCHEMA_VERSION,
    type,
    typeVersion: 1,
    id: o.id ?? `${type}-starter`,
    name: o.name ?? info.label,
    runtime: { min: RUNTIME_VERSION },
    structure,
    content,
    layout: {},
    responsive: {},
    style: {},
    material: { family: 'solid', preset: 'solid-neutral', revision: null, params: {} },
    states: {},
    interactions: { behavior: {}, events },
    meta: { createdAt: null, updatedAt: null, basedOn: null, notes: '' },
  };
  return info.profile === 'navbar' || info.profile === 'desktop-navbar' ? withNavbarDefaults(base) : info.profile === 'button' ? withButtonDefaults(base) : base;
}

/** A navbar definition with every described property at its default (used by starters and templates). */
export function withNavbarDefaults(def: ComponentDefinition): ComponentDefinition {
  const items = navbarItemNodes(def).filter(({ node }) => node.role === 'item').map(({ node }) => node);
  const warnings: string[] = [];
  const errors: string[] = [];
  const c = def.type === 'desktop-navbar' ? checkDesktopNavbarSections({}, items, def.structure, errors, warnings) : checkNavbarSections({}, items, errors, warnings);
  if (!c) throw new Error(`Valori iniziali della navbar non validi: ${errors.join('; ')}`);
  const states: ComponentDefinition['states'] = {};
  for (const [k, v] of Object.entries(c.sections.stateStyles)) states[k as ComponentStateId] = { style: v! };
  return {
    ...def,
    layout: def.type === 'mobile-navbar' ? { ...c.sections.layout, icons: 'show', distribution: 'evenly', compact: false } : c.sections.layout,
    responsive: c.sections.responsive,
    style: c.sections.style,
    states,
    interactions: { behavior: c.sections.behavior, events: c.sections.events as Record<string, string> },
  };
}

// ---------------------------------------------------------------------------
// Reading helpers
// ---------------------------------------------------------------------------

export interface DefinitionIcon {
  /** Id of the icon slot. */
  node: string;
  /** Text next to the icon (the sibling label), else the owner's id: how a person recognises where it is used. */
  owner: string;
  icon: IconRef;
}

/** Every icon a definition uses, in document order. */
export function definitionIcons(def: Pick<ComponentDefinition, 'structure' | 'content'>): DefinitionIcon[] {
  const out: DefinitionIcon[] = [];
  const walk = (n: StructureNode, parent: StructureNode | null) => {
    const icon = n.role === 'icon' ? def.content[n.id]?.icon : undefined;
    if (icon && parent) {
      const label = parent.children?.find((c) => c.role === 'label');
      out.push({ node: n.id, owner: (label && def.content[label.id]?.text) || parent.id, icon });
    }
    for (const c of n.children ?? []) walk(c, n);
  };
  walk(def.structure, null);
  return out;
}
