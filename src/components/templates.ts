/**
 * Creating and binding canonical definitions: the official template, the
 * link between a component and a library material (revision, state of the
 * link), and the resolved material document.
 */

import { builtinMaterial } from '../model/builtins';
import { contentHash, type GlassDocument, type MaterialDocument } from '../model/document';
import { checkKeys } from '../core/descriptors';
import { MATERIALS } from '../model/registry';
import { RUNTIME_VERSION } from '../model/version';
import {
  DEFINITION_FORMAT,
  DEFINITION_SCHEMA_VERSION,
  resolveDefinitionMaterial,
  starterDefinition,
  type ComponentDefinition,
  type ComponentStateId,
  type DefinitionMaterial,
  type DefinitionMeta,
} from './definition';
import { setButtonIcon, setButtonText } from './button';
import { COMPONENTS } from './registry';
import { applyNavbarView, createRoot, createTab, type BnRoot, type BnTab } from './navbar';

/** Content revision of a material: what it looks like and how it behaves (id and timestamps excluded). */
export function materialRevision(doc: MaterialDocument): string {
  if (doc.family === 'solid') {
    const { name, family, familyVersion, material, geometry, behavior, states } = doc;
    return contentHash(JSON.stringify({ name, family, familyVersion, material, geometry, behavior, states }));
  }
  const { name, family, familyVersion, material, geometry, behavior, quality, source, target } = doc;
  return contentHash(JSON.stringify({ name, family, familyVersion, material, geometry, behavior, quality, source, target }));
}

export type BindingState =
  /** Same content as the preset: follows it. */
  | 'linked'
  /** Edited in the component; the preset has not changed since. */
  | 'modified'
  /** The preset changed after it was applied and the component is untouched: it should follow. */
  | 'outdated'
  /** Both changed: updating would drop the component's own values. */
  | 'diverged'
  /** No preset, or the preset no longer exists. */
  | 'embedded';

/** Does the component change the material's own values (parameters, or per-state overrides)? */
export function hasMaterialOverrides(def: Pick<ComponentDefinition, 'material' | 'states'>): boolean {
  return Object.keys(def.material.params).length > 0 || Object.values(def.states).some((e) => e?.material && Object.keys(e.material).length > 0);
}

/**
 * How a component's material relates to its preset right now. `overridden`:
 * the component changes values over its material (`hasMaterialOverrides`),
 * which counts as editing it locally.
 */
export function bindingState(binding: DefinitionMaterial, preset: MaterialDocument | undefined, overridden = false): BindingState {
  if (!binding.preset || !preset) return 'embedded';
  // Without an embedded document the material is the preset itself.
  if (!binding.document) return overridden ? 'modified' : 'linked';
  const own = materialRevision(binding.document);
  const current = materialRevision(preset);
  if (own === current) return overridden ? 'modified' : 'linked';
  if (binding.revision === null) return 'modified';
  const edited = own !== binding.revision || overridden;
  const moved = current !== binding.revision;
  return edited ? (moved ? 'diverged' : 'modified') : 'outdated';
}

/** Applies `doc` (the current content of library entry `preset`) to a component as a self-contained binding. */
export function bindMaterial(doc: MaterialDocument, preset: string | null): DefinitionMaterial {
  return { family: doc.family, preset, revision: preset ? materialRevision(doc) : null, params: {}, document: doc };
}

/**
 * The Glass material of a definition (embedded document, preset or defaults,
 * then parameters and state overrides). The builder edits Glass components
 * only; any other family is refused by the editor before it gets here.
 */
export function glassMaterialOf(def: ComponentDefinition): GlassDocument {
  const m = resolveDefinitionMaterial(def);
  if (m.family !== 'glass') throw new Error(`Il materiale «${m.family}» non è modificabile in questo editor`);
  return m;
}

// ---------- binding a material to a component ----------

export interface MaterialBinding {
  definition: ComponentDefinition;
  /** What was not carried over because it belongs to the previous material, as readable paths. Empty when nothing was lost. */
  dropped: string[];
}

/**
 * Applies a material to a component and keeps everything that is not the
 * material: structure, content, layout, responsive rules, style, the style of
 * each state and the interactions. What belongs to the material is its own:
 * the per-state parameter overrides (`states.<s>.material`) only make sense for
 * the family that wrote them, so they are kept when the family stays the
 * same (and still valid) and reported in `dropped` when it changes.
 */
export function bindComponentMaterial(def: ComponentDefinition, binding: DefinitionMaterial): MaterialBinding {
  const next = MATERIALS.get(binding.family);
  if (!next) throw new Error(`Materiale non registrato: ${binding.family}`);
  if (!COMPONENTS.supports(def.type, binding.family) && def.type !== 'desktop-navbar') throw new Error(`«${def.type}» non si disegna con il materiale ${binding.family}`);
  const dropped: string[] = [];
  if (def.material.family !== binding.family && Object.keys(def.material.params).length) dropped.push('material.params');
  const states: ComponentDefinition['states'] = {};
  for (const [s, entry] of Object.entries(def.states) as [ComponentStateId, NonNullable<ComponentDefinition['states'][ComponentStateId]>][]) {
    const { material, ...rest } = entry;
    let kept = material;
    if (material) {
      const renders = (next.states as readonly string[]).includes(s);
      const valid = renders && def.material.family === binding.family && !checkKeys(next.stateParams, material, { scope: s, partial: true }).errors.length;
      if (!valid) {
        dropped.push(`states.${s}.material`);
        kept = undefined;
      }
    }
    if (kept || rest.style) states[s] = { ...rest, ...(kept ? { material: kept } : {}) };
  }
  return { definition: { ...def, material: binding, states }, dropped };
}

/** The component with its material replaced by the family's initial one (`ComponentSpec.materials`). */
export function switchMaterialFamily(def: ComponentDefinition, family: string): MaterialBinding {
  const start = COMPONENTS.get(def.type)?.materials[family];
  const preset = start ? MATERIALS.get(family)?.presets.find((p) => p.doc.id === start.preset) : def.type === 'desktop-navbar' ? MATERIALS.get(family)?.presets[0] : undefined;
  if (!preset) throw new Error(`«${def.type}» non si disegna con il materiale ${family}`);
  return bindComponentMaterial(def, bindMaterial(preset.doc, preset.doc.id));
}

export interface CreateNavbarOptions {
  id: string;
  name: string;
  tabs: BnTab[];
  /** Properties other than the tabs; defaults otherwise. */
  root?: BnRoot;
  label?: string;
  defaultTab?: string;
  material: DefinitionMaterial;
  meta?: Partial<DefinitionMeta>;
}

/** A `mobile-navbar` definition with the given tabs and every described property at its default. */
export function createNavbarDefinition(o: CreateNavbarOptions): ComponentDefinition {
  const skeleton: ComponentDefinition = {
    format: DEFINITION_FORMAT,
    schemaVersion: DEFINITION_SCHEMA_VERSION,
    type: 'mobile-navbar',
    typeVersion: 1,
    id: o.id,
    name: o.name,
    runtime: { min: RUNTIME_VERSION },
    structure: { id: 'root', role: 'navbar' },
    content: {},
    layout: {},
    responsive: {},
    style: {},
    material: o.material,
    states: {},
    interactions: { behavior: {}, events: {} },
    meta: { createdAt: null, updatedAt: null, basedOn: null, notes: '', ...o.meta },
  };
  const patch: Partial<Pick<BnRoot, 'label' | 'defaultTab'>> = {};
  if (o.label !== undefined) patch.label = o.label;
  if (o.defaultTab !== undefined) patch.defaultTab = o.defaultTab;
  return applyNavbarView(skeleton, o.root ?? createRoot(o.tabs, patch));
}

// ---------- templates ----------

export interface ComponentTemplate {
  id: string;
  label: string;
  description: string;
  create(): ComponentDefinition;
}

/**
 * The official demo: a generic bar with three destinations, every property
 * at its descriptor default and Jello's own navbar material. Nothing in it
 * belongs to a specific product: it is a starting point to edit.
 */
const mobileNavbar = (): ComponentDefinition =>
  createNavbarDefinition({
    id: 'mobile-navbar',
    name: 'Mobile Navbar',
    tabs: [
      createTab('home', 'Home', { kind: 'builtin', name: 'home' }),
      createTab('explore', 'Explore', { kind: 'builtin', name: 'compass' }),
      createTab('profile', 'Profile', { kind: 'builtin', name: 'user' }),
    ],
    label: 'Navigazione principale',
    defaultTab: 'home',
    material: bindMaterial(builtinMaterial('navbar')!.doc, 'navbar'),
    meta: { basedOn: 'mobile-navbar', notes: 'Demo iniziale di Jello: tre voci modificabili, una superficie di materiale, indicatore come strato visivo.' },
  });

/**
 * The official call to action: a primary button, a label and an icon, on
 * Jello's own glass. The same definition renders on Solid after a material
 * switch, with the same content, layout and states.
 */
const cta = (): ComponentDefinition => {
  const base = starterDefinition('button', { id: 'button', name: 'Button' });
  let doc: ComponentDefinition = { ...base, material: bindMaterial(builtinMaterial('jello')!.doc, 'jello'), meta: { ...base.meta, basedOn: 'button', notes: 'Pulsante di partenza: etichetta e icona modificabili, tre varianti, stessi stati con Glass e Solid.' } };
  doc = setButtonText(doc, 'Inizia')!;
  doc = setButtonIcon(doc, { kind: 'builtin', name: 'play' });
  return { ...doc, style: { ...doc.style, variant: 'primary' } };
};

/** Official Jello templates (read-only). User components live in the personal library. */
export const COMPONENT_TEMPLATES: readonly ComponentTemplate[] = [
  { id: 'mobile-navbar', label: 'Mobile Navbar', description: 'Demo generica: Home, Explore, Profile. Aggiungi, riordina e personalizza le voci.', create: mobileNavbar },
  { id: 'button', label: 'Button', description: 'Pulsante con etichetta e icona: Primary, Secondary o Ghost, azione o collegamento.', create: cta },
  { id: 'desktop-navbar', label: 'Desktop Navbar', description: 'Anteprima tecnica: Start / Main / End, Glass e Solid. Editor completo in M5.3.', create: desktopNavbar },
];

/** Generic serializable Desktop starter; the consumer owns the brand. */
function desktopNavbar(): ComponentDefinition {
  const base = starterDefinition('desktop-navbar', { id: 'desktop-navbar', name: 'Desktop Navbar' });
  const entries = [
    ['brand', 'brand', 'Your brand', 'star'], ['home', 'item', 'Home', 'home'],
    ['explore', 'item', 'Explore', 'compass'], ['projects', 'item', 'Projects', 'matrix'],
    ['settings', 'item', 'Settings', 'settings'], ['action', 'action', 'Action', 'plus'],
  ] as const;
  const content: ComponentDefinition['content'] = { root: { text: 'Main navigation' } };
  const children = entries.map(([id, role, label, icon]) => {
    content[id] = { value: id, action: id === 'brand' ? { kind: 'navigate', href: '#home' }
      : id === 'action' ? { kind: 'consumer', name: 'primary-action' } : { kind: 'select' } };
    content[`${id}-label`] = { text: label };
    content[`${id}-icon`] = { icon: { kind: 'builtin', name: icon } };
    return { id, role, children: [{ id: `${id}-icon`, role: 'icon' as const }, { id: `${id}-label`, role: 'label' as const }] };
  });
  return { ...base, structure: { id: 'root', role: 'navbar', children }, content,
    material: bindMaterial(builtinMaterial('navbar')!.doc, 'navbar'),
    layout: { ...base.layout, regions: { brand: 'start', settings: 'end', action: 'end' } },
    style: { ...base.style, typography: { ...(base.style.typography as object), fontSize: 14 } },
    interactions: { ...base.interactions, behavior: { ...base.interactions.behavior, defaultItem: 'home' } },
    responsive: { ...base.responsive, breakpoints: [{ id: 'compact', maxWidth: 640, overrides: { 'layout.compact': true, 'layout.labels': 'hide', 'layout.gap': 4, 'layout.padding': 8 } }] },
  };
}

export function componentTemplate(id: string): ComponentTemplate | undefined {
  return COMPONENT_TEMPLATES.find((t) => t.id === id);
}

export const isTemplateId = (id: string) => COMPONENT_TEMPLATES.some((t) => t.id === id);
