/**
 * Component registry: what a component type *is*, independent of the editor
 * that shows it and of the material that paints it.
 *
 * Each entry describes one type that can be rendered today: identity, the
 * schema of its properties (the descriptors an inspector and a validator are
 * generated from), the values a new one starts with, the states it supports,
 * the interactions it reports, the materials it can be drawn with, what an
 * export contains and the renderer that draws it. The renderer itself lives
 * in `src/runtime` (this module is pure, no DOM): `renderer.id` is bound there
 * (`runtime/components.ts`) the way a material's renderer is, and a test checks
 * that every entry has a runtime and every runtime an entry.
 *
 * Adding a type (Desktop Navbar, Input) means: its slots in `DEFINITION_TYPES`
 * (they already exist), a property table and checks, a renderer, and one
 * entry here that passes `validateComponentSpec`. Until then the type is
 * *planned*: listed with the reason it is not available, not registered, not
 * editable, not exportable and not renderable — `parseDefinition` still reads
 * its schema, but says that its layout, style and behavior are ignored.
 */

import { MATERIALS } from '../model/registry';
import { BUTTON_FIELDS, BUTTON_UNSUPPORTED, setButtonField } from './button';
import { DEFINITION_TYPES, definitionType, parseDefinition, serializeDefinition, starterDefinition, type ComponentDefinition, type ComponentStateId, type DefinitionType, type DefinitionTypeInfo, type Trigger } from './definition';
import { defaultsOf, getPath, type FieldDescriptor } from './fields';
import { NAVBAR_FIELDS, NAVBAR_UNSUPPORTED, setNavbarField } from './navbar';

export interface UnsupportedProperty {
  /** Canonical path of the property. */
  path: string;
  /** Why it has no effect on this material and where to change the same thing. */
  reason: string;
}

export interface ComponentSpec {
  id: DefinitionType;
  name: string;
  description: string;
  /** `typeVersion` of the documents it reads and writes. */
  version: number;
  /** Slots, states and triggers (the structural part of the schema). */
  info: DefinitionTypeInfo;
  /** Described properties, by canonical path: ranges, units, defaults, inspector section. */
  fields: readonly FieldDescriptor[];
  /** Values of the described properties, as nested objects (what a new component starts with). */
  defaults(): Record<string, unknown>;
  /** A new component of this type, valid, with the given material. */
  create(o?: { id?: string; name?: string }): ComponentDefinition;
  /** Sets one described property (canonical path); invalid values are refused (null). */
  setField(def: ComponentDefinition, path: string, value: unknown): ComponentDefinition | null;
  /** Behavior switches of `interactions.behavior`, in the order the inspector lists them. */
  behavior: readonly string[];
  /** States the component supports (`default` first). */
  states: readonly ComponentStateId[];
  /** What the component reports to the application, and the DOM event each one dispatches by default. */
  interactions: readonly { trigger: Trigger; event: string }[];
  /** Material families it can be drawn with and the library entry each starts from. Every registered family is listed. */
  materials: Readonly<Record<string, { preset: string }>>;
  /** Properties that have no effect on a family (and why). Empty list: everything described is rendered. */
  unsupported(family: string): readonly UnsupportedProperty[];
  /** The renderer that draws it; `src/runtime/components.ts` binds the same id. */
  renderer: { id: string };
  export: {
    /** `component-json` is always available (the definition is the format); `react` needs a runtime and a template. */
    formats: readonly ('component-json' | 'component-react' | 'component-vanilla')[];
    /** Families the exporter can ship (the runtime is included). */
    families: readonly string[];
    /** Events (DOM) the exported component dispatches. */
    events: readonly string[];
    notes: readonly string[];
  };
}

const eventsOf = (info: DefinitionTypeInfo, defaults: Record<string, unknown>): { trigger: Trigger; event: string }[] =>
  info.triggers.map((trigger) => ({ trigger, event: String(getPath(defaults, `interactions.events.${trigger}`) ?? '') })).filter((e) => e.event !== '');

const BUTTON_INFO = definitionType('button')!;
const NAVBAR_INFO = definitionType('mobile-navbar')!;

const BUTTON: ComponentSpec = {
  id: 'button',
  name: 'Button',
  description: BUTTON_INFO.description,
  version: BUTTON_INFO.typeVersion,
  info: BUTTON_INFO,
  fields: BUTTON_FIELDS,
  defaults: () => defaultsOf(BUTTON_FIELDS),
  create: (o) => starterDefinition('button', o),
  setField: setButtonField,
  behavior: ['semantics', 'pressFeedback'],
  states: BUTTON_INFO.states,
  interactions: eventsOf(BUTTON_INFO, defaultsOf(BUTTON_FIELDS)),
  materials: { glass: { preset: 'jello' }, solid: { preset: 'solid-neutral' } },
  unsupported: (family) => BUTTON_UNSUPPORTED[family] ?? [],
  renderer: { id: 'button' },
  export: {
    formats: ['component-json', 'component-react', 'component-vanilla'],
    families: ['glass', 'solid'],
    events: eventsOf(BUTTON_INFO, defaultsOf(BUTTON_FIELDS)).map((e) => e.event),
    notes: ['Azione (<button>) o navigazione (<a href>), secondo «Elemento». Il pulsante non naviga da solo: un’azione riporta la pressione all’applicazione, un collegamento lo segue il browser.'],
  },
};

const NAVBAR: ComponentSpec = {
  id: 'mobile-navbar',
  name: 'Mobile Navbar',
  description: NAVBAR_INFO.description,
  version: NAVBAR_INFO.typeVersion,
  info: NAVBAR_INFO,
  fields: NAVBAR_FIELDS,
  defaults: () => defaultsOf(NAVBAR_FIELDS),
  create: (o) => starterDefinition('mobile-navbar', o),
  setField: setNavbarField,
  behavior: ['semantics', 'defaultItem', 'pressFeedback', 'wheelForward', 'reselect'],
  states: NAVBAR_INFO.states,
  interactions: [
    { trigger: 'press', event: 'jello-press' },
    { trigger: 'change', event: 'jello-change' },
    { trigger: 'reselect', event: 'jello-reselect' },
  ],
  materials: { glass: { preset: 'navbar' }, solid: { preset: 'solid-neutral' } },
  unsupported: (family) => NAVBAR_UNSUPPORTED[family] ?? [],
  renderer: { id: 'mobile-navbar' },
  export: {
    formats: ['component-json', 'component-react', 'component-vanilla'],
    families: ['glass', 'solid'],
    events: ['jello-change', 'jello-press', 'jello-reselect'],
    notes: ['Le tab non sono pagine: l’applicazione decide che cosa significano. Nessun router richiesto.'],
  },
};

/** Everything wrong with a spec, as readable sentences (empty when it is complete and consistent). */
export function validateComponentSpec(spec: ComponentSpec): string[] {
  const problems: string[] = [];
  const info = definitionType(spec.id);
  if (!info) return [`tipo «${spec.id}» sconosciuto`];
  if (!info.implemented) problems.push('il tipo è dichiarato non implementato in DEFINITION_TYPES');
  if (spec.info !== info) problems.push('info non coincide con DEFINITION_TYPES');
  if (!spec.renderer.id) problems.push('renderer non dichiarato');
  if (spec.states[0] !== 'default') problems.push('il primo stato deve essere «default»');
  if (spec.states.join() !== info.states.join()) problems.push('gli stati non coincidono con quelli del tipo');
  const paths = new Set<string>();
  for (const f of spec.fields) {
    if (paths.has(f.path)) problems.push(`${f.path}: proprietà duplicata`);
    paths.add(f.path);
  }
  if (!spec.fields.length) problems.push('nessuna proprietà descritta');
  for (const t of spec.interactions) if (!info.triggers.includes(t.trigger)) problems.push(`interazione «${t.trigger}» che il tipo non ha`);
  // `semantics` and `defaultItem` are checked by the type's own validator rather than described as a range.
  for (const b of spec.behavior) if (!paths.has(`interactions.behavior.${b}`) && b !== 'semantics' && b !== 'defaultItem') problems.push(`comportamento «${b}» non descritto`);
  for (const family of MATERIALS.list().map((d) => d.id)) {
    const m = spec.materials[family];
    if (!m) {
      problems.push(`materiale «${family}»: manca il preset iniziale`);
      continue;
    }
    if (!MATERIALS.get(family)!.presets.some((p) => p.doc.id === m.preset)) problems.push(`materiale «${family}»: il preset «${m.preset}» non esiste`);
    for (const u of spec.unsupported(family)) {
      if (!paths.has(u.path)) problems.push(`${family}: «${u.path}» non è una proprietà descritta`);
      if (!u.reason) problems.push(`${family}: «${u.path}» senza motivo`);
    }
    if (!spec.export.families.includes(family)) problems.push(`materiale «${family}»: l’export non lo include`);
  }
  for (const family of Object.keys(spec.materials)) if (!MATERIALS.has(family)) problems.push(`materiale «${family}» non registrato`);
  // A new component must be valid as written and at rest on its own defaults.
  const fresh = spec.create();
  if (fresh.type !== spec.id) problems.push(`create(): tipo ${fresh.type}`);
  const parsed = parseDefinition(JSON.parse(serializeDefinition(fresh)));
  if (!parsed.ok) problems.push(`create(): non supera la validazione (${parsed.errors[0]})`);
  else if (parsed.warnings.length) problems.push(`create(): avvisi alla lettura (${parsed.warnings[0]})`);
  for (const f of spec.fields) {
    const v = getPath(fresh, f.path);
    if (v === undefined) problems.push(`create(): «${f.path}» senza valore`);
    else if (spec.setField(fresh, f.path, v) === null) problems.push(`setField(): rifiuta il valore iniziale di «${f.path}»`);
  }
  const defaults = spec.defaults();
  for (const f of spec.fields) if (JSON.stringify(getPath(defaults, f.path)) !== JSON.stringify(f.default)) problems.push(`defaults(): «${f.path}»`);
  for (const e of spec.export.events) if (!/^[a-z][a-z0-9-]{0,39}$/.test(e)) problems.push(`export: evento «${e}» non valido`);
  if (!spec.export.formats.includes('component-json')) problems.push('export: il JSON della definizione è sempre disponibile');
  return problems;
}

/** A type that has its schema but no renderer, editor or exporter yet. */
export interface PlannedComponent {
  id: DefinitionType;
  name: string;
  description: string;
  reason: string;
}

export class ComponentRegistry {
  private readonly entries = new Map<string, ComponentSpec>();

  register(spec: ComponentSpec): void {
    if (this.entries.has(spec.id)) throw new Error(`Componente già registrato: ${spec.id}`);
    const problems = validateComponentSpec(spec);
    if (problems.length) throw new Error(`Componente ${spec.id} non valido: ${problems.join('; ')}`);
    this.entries.set(spec.id, spec);
  }

  get(id: string): ComponentSpec | undefined {
    return this.entries.get(id);
  }

  has(id: string): boolean {
    return this.entries.has(id);
  }

  /** Registered (available) components, in registration order. */
  list(): ComponentSpec[] {
    return [...this.entries.values()];
  }

  /** Types that have a schema and no implementation: shown as «in arrivo», never offered as working. */
  planned(): PlannedComponent[] {
    return DEFINITION_TYPES.filter((t) => !this.entries.has(t.type)).map((t) => ({
      id: t.type,
      name: t.label,
      description: t.description,
      reason: 'Lo schema esiste (struttura, contenuti, stati) ma non ci sono ancora renderer, editor ed export: layout, stile e comportamento vengono ignorati con un avviso.',
    }));
  }

  /** Is `family` one the component can be drawn with? Every registered family is, by `validateComponentSpec`. */
  supports(id: string, family: string): boolean {
    return !!this.entries.get(id)?.materials[family];
  }
}

export const COMPONENTS = new ComponentRegistry();
COMPONENTS.register(BUTTON);
COMPONENTS.register(NAVBAR);

export function componentSpec(id: string): ComponentSpec | undefined {
  return COMPONENTS.get(id);
}

/** Properties of `def` that have no effect on its material family: what the inspector, the export and the renderer report. */
export function unsupportedProperties(def: Pick<ComponentDefinition, 'type' | 'material'>): readonly UnsupportedProperty[] {
  return COMPONENTS.get(def.type)?.unsupported(def.material.family) ?? [];
}
