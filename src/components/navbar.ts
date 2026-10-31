/**
 * Navbar properties of the canonical definition (`mobile-navbar`).
 *
 * The persisted model is `jello-component-definition` (definition.ts). This
 * file holds what is specific to navigation bars: the described properties
 * (ranges, units, defaults), the checks, and a derived, read-only **view**
 * (`navbarView`, the `BnRoot` shape) that the DOM renderer and the exporters
 * read. The view is never stored or exchanged. Structural editing uses the
 * shared operations in navbar-structure.ts; `applyNavbarView` and the view
 * operations remain compatibility APIs, `setNavbarField` edits described properties.
 *
 *   root (view)  layout · appearance · typography · icon · states · interactions · motion · responsive
 *   children     tab × n   stable ids, independent of the visible labels
 *
 * Tabs are not tied to pages: the component reports `change`, `press` and
 * `reselect` and the host application decides what they mean. There is no
 * maximum number of tabs; when they do not fit, `responsive.overflow` decides.
 *
 * Pure data and pure functions: the DOM renderer is runtime/bottom-navigation.ts.
 */

import type { IconRef } from './icons';
import type { ComponentDefinition, NodeContent, StructureNode } from './definition';
import { navbarItemNodes, type NavbarAction, type NavbarIconPosition } from './navbar-contract';
import { EVENT_NAME_PATTERN, checkField, checkFields, choices, defaultsOf, getPath, numberField, setPath, type FieldDescriptor, type NumberField } from './fields';

export type Color = string;

export interface BnLayout {
  /** `viewport`: fixed to the window. `container`: absolute in the nearest positioned ancestor. `inline`: in the flow. */
  anchor: 'viewport' | 'container' | 'inline';
  placement: 'floating' | 'docked';
  align: 'start' | 'center' | 'end';
  /** `fill`: available width minus the offset, up to maxWidth. `fixed`: `width`. `hug`: as wide as the tabs. */
  widthMode: 'fill' | 'fixed' | 'hug';
  width: number;
  maxWidth: number;
  height: number;
  padding: number;
  gap: number;
  radius: number | 'capsule';
  offset: number;
  itemLayout: 'stacked' | 'inline';
  labels: 'show' | 'hide' | 'active';
  icons?: 'show' | 'hide';
  distribution?: 'start' | 'center' | 'end' | 'between' | 'evenly';
  compact?: boolean;
}

export interface BnAppearance {
  foreground: Color;
  textShadow: boolean;
  indicator: { style: 'pill' | 'none'; color: Color; inset: number };
}

export interface BnTypography {
  fontFamily: 'system' | 'inherit';
  fontSize: number;
  fontWeight: number;
  letterSpacing: number;
}

export interface BnIconStyle {
  size: number;
  strokeWidth: number;
}

export interface BnStates {
  active: { color: Color; fontWeight: number };
  hover: { background: Color };
  pressed: { background: Color; scale: number };
  focus: { color: Color; width: number; offset: number };
  disabled: { opacity: number };
}

export interface BnInteractions {
  /** Press light (and scale, if the material has one) on the glass surface. */
  pressFeedback: boolean;
  /** Wheel input over the bar scrolls the content element given by the host. */
  wheelForward: boolean;
  /** Pressing the active tab again: emit `reselect` or nothing. */
  reselect: 'event' | 'none';
  /** DOM event names dispatched on the root element (CustomEvent, bubbles). */
  events: { change: string; press: string; reselect: string; action?: string };
}

export interface BnMotion {
  indicator: 'spring' | 'ease' | 'none';
  duration: number;
}

export type BnOverrideKey = (typeof OVERRIDE_PATHS)[number];
export type BnOverrides = Partial<Record<BnOverrideKey, number | string | boolean>>;

export interface BnBreakpoint {
  id: string;
  /** Applies while the container is at most this wide (px). Smaller breakpoints win. */
  maxWidth: number;
  overrides: BnOverrides;
}

export interface BnResponsive {
  overflow: 'scroll' | 'compress';
  minTabWidth: number;
  breakpoints: BnBreakpoint[];
}

export interface BnTabStyle {
  iconSize: number | null;
  fontSize: number | null;
  fontWeight: number | null;
  letterSpacing: number | null;
}

export interface BnTab {
  kind: 'tab';
  /** Stable identifier: events, persistence and the host's code use it, never the label. */
  id: string;
  label: string;
  icon: IconRef;
  /** Free payload for the host (a route, a key…), sent with every event. */
  value: string | null;
  disabled: boolean;
  visible?: boolean;
  action?: NavbarAction;
  iconPosition?: NavbarIconPosition;
  accessibleLabel?: string;
  description?: string;
  groupId?: string;
  /** Per-tab overrides; null inherits from the root. */
  style: BnTabStyle;
}

export interface BnRoot {
  kind: 'mobile-navbar';
  id: 'root';
  /** Accessible name of the navigation. */
  label: string;
  /** `navigation`: nav landmark, aria-current. `tabs`: tablist, aria-selected, roving focus. */
  semantics: 'navigation' | 'tabs';
  defaultTab: string;
  layout: BnLayout;
  appearance: BnAppearance;
  typography: BnTypography;
  icon: BnIconStyle;
  states: BnStates;
  interactions: BnInteractions;
  motion: BnMotion;
  responsive: BnResponsive;
  children: BnTab[];
}

const num = numberField;
const opts = choices;
const EVENT_NAME = EVENT_NAME_PATTERN;

/** Every root property, with Jello's defaults (a floating capsule bar, 64 px, up to 440 px wide). */
export const BN_FIELDS: readonly FieldDescriptor[] = [
  { type: 'enum', path: 'layout.anchor', section: 'layout', label: 'Ancoraggio', options: opts(['viewport', 'Finestra (fixed)'], ['container', 'Contenitore (absolute)'], ['inline', 'Nel flusso']), default: 'viewport', description: 'A cosa si ancora la barra nell’applicazione. L’anteprima la mostra sempre nel riquadro.' },
  { type: 'enum', path: 'layout.placement', section: 'layout', label: 'Posizionamento', options: opts(['floating', 'Flottante'], ['docked', 'Agganciata al bordo']), default: 'floating', description: 'Flottante: staccata dal bordo di «Distanza dal bordo». Agganciata: a filo del bordo, a tutta larghezza.' },
  { type: 'enum', path: 'layout.align', section: 'layout', label: 'Allineamento', options: opts(['start', 'Inizio'], ['center', 'Centro'], ['end', 'Fine']), default: 'center', description: 'Posizione orizzontale quando la barra è più stretta dello spazio disponibile.' },
  { type: 'enum', path: 'layout.widthMode', section: 'layout', label: 'Larghezza', options: opts(['fill', 'Riempi fino al massimo'], ['fixed', 'Fissa'], ['hug', 'Adatta alle tab']), default: 'fill', description: 'Come si calcola la larghezza della barra.' },
  num('layout.width', 'layout', 'Larghezza fissa', 'px', 120, 1600, 1, 440, 'Usata con «Larghezza: fissa».'),
  num('layout.maxWidth', 'layout', 'Larghezza massima', 'px', 160, 2000, 1, 440, 'Limite superiore con «Riempi».'),
  num('layout.height', 'layout', 'Altezza', 'px', 40, 120, 1, 64, 'Altezza della barra.'),
  num('layout.padding', 'layout', 'Padding', 'px', 0, 24, 1, 6, 'Spazio interno tra il bordo della barra e le tab.'),
  num('layout.gap', 'layout', 'Spazio tra tab', 'px', 0, 32, 1, 2, 'Distanza tra una tab e la successiva.'),
  { type: 'radius', path: 'layout.radius', section: 'layout', label: 'Raggio', min: 0, max: 60, default: 'capsule', description: '«capsule»: metà dell’altezza. Un numero: raggio in px.' },
  num('layout.offset', 'layout', 'Distanza dal bordo', 'px', 0, 64, 1, 12, 'Distanza dal bordo inferiore e dai lati (posizionamento flottante).'),
  { type: 'enum', path: 'layout.itemLayout', section: 'layout', label: 'Disposizione tab', options: opts(['stacked', 'Icona sopra'], ['inline', 'Icona accanto']), default: 'stacked', description: 'Posizione dell’icona rispetto all’etichetta.' },
  { type: 'enum', path: 'layout.labels', section: 'layout', label: 'Etichette', options: opts(['show', 'Sempre'], ['active', 'Solo tab attiva'], ['hide', 'Nascoste']), default: 'show', description: 'Le etichette nascoste restano il nome accessibile della tab.' },
  { type: 'enum', path: 'layout.icons', section: 'layout', label: 'Icone', options: opts(['show', 'Visibili'], ['hide', 'Nascoste']), default: 'show', optional: true, description: 'Visibilità delle icone, indipendente dalle etichette.' },
  { type: 'enum', path: 'layout.distribution', section: 'layout', label: 'Distribuzione', options: opts(['evenly', 'Uniforme'], ['start', 'Inizio'], ['center', 'Centro'], ['end', 'Fine'], ['between', 'Spazio tra elementi']), default: 'evenly', optional: true, description: 'Distribuzione delle voci nello spazio disponibile.' },
  { type: 'boolean', path: 'layout.compact', section: 'layout', label: 'Compatta', default: false, optional: true, description: 'Riduce gli spazi interni senza cambiare il tipo di navigazione.' },

  { type: 'color', path: 'appearance.foreground', section: 'appearance', label: 'Colore testo e icone', default: '#0c0c10', description: 'Colore delle tab non attive.' },
  { type: 'boolean', path: 'appearance.textShadow', section: 'appearance', label: 'Alone di leggibilità', default: true, description: 'Leggero alone chiaro dietro testo e icone, per sfondi variabili.' },
  { type: 'enum', path: 'appearance.indicator.style', section: 'appearance', label: 'Indicatore', options: opts(['pill', 'Pillola'], ['none', 'Nessuno']), default: 'pill', description: 'Strato visivo sotto la tab attiva (non è una seconda lente).' },
  { type: 'color', path: 'appearance.indicator.color', section: 'appearance', label: 'Colore indicatore', default: '#ffffff9e', description: 'Colore e opacità (#rrggbbaa) dell’indicatore.' },
  num('appearance.indicator.inset', 'appearance', 'Margine indicatore', 'px', 0, 16, 1, 0, 'Rientro dell’indicatore dentro la tab.'),

  { type: 'enum', path: 'typography.fontFamily', section: 'typography', label: 'Carattere', options: opts(['system', 'Sistema'], ['inherit', 'Eredita dalla pagina']), default: 'system', description: 'Famiglia del testo delle etichette.' },
  num('typography.fontSize', 'typography', 'Dimensione testo', 'px', 8, 24, 0.5, 11.5, 'Dimensione delle etichette.'),
  num('typography.fontWeight', 'typography', 'Peso', '', 300, 900, 50, 600, 'Peso delle etichette non attive.'),
  num('typography.letterSpacing', 'typography', 'Spaziatura lettere', 'px', -2, 4, 0.05, 0.1, 'Spaziatura tra le lettere.'),
  num('icon.size', 'typography', 'Dimensione icone', 'px', 12, 40, 1, 22, 'Lato delle icone.'),
  num('icon.strokeWidth', 'typography', 'Spessore tratto icone', 'px', 0.5, 3, 0.1, 1.8, 'Spessore delle icone a tratto.'),

  { type: 'color', path: 'states.active.color', section: 'states', label: 'Attiva · colore', default: '#0a54bd', description: 'Colore di testo e icona della tab attiva.' },
  num('states.active.fontWeight', 'states', 'Attiva · peso', '', 300, 900, 50, 750, 'Peso dell’etichetta attiva.'),
  { type: 'color', path: 'states.hover.background', section: 'states', label: 'Hover · sfondo', default: '#ffffff38', description: 'Sfondo della tab sotto il puntatore (solo dispositivi con hover).' },
  { type: 'color', path: 'states.pressed.background', section: 'states', label: 'Premuta · sfondo', default: '#00000014', description: 'Sfondo della tab durante la pressione.' },
  num('states.pressed.scale', 'states', 'Premuta · scala contenuto', '×', 0.85, 1.1, 0.01, 1, 'Scala di icona ed etichetta durante la pressione (1 = nessuna).'),
  { type: 'color', path: 'states.focus.color', section: 'states', label: 'Focus · colore anello', default: '#7a2fb8', description: 'Anello di focus visibile da tastiera.' },
  num('states.focus.width', 'states', 'Focus · spessore', 'px', 1, 4, 0.5, 2, 'Spessore dell’anello di focus.'),
  num('states.focus.offset', 'states', 'Focus · distanza', 'px', -4, 4, 1, -2, 'Distanza dell’anello dal bordo della tab.'),
  num('states.disabled.opacity', 'states', 'Disabilitata · opacità', '', 0.1, 1, 0.05, 0.4, 'Opacità delle tab disabilitate.'),

  { type: 'boolean', path: 'interactions.pressFeedback', section: 'interactions', label: 'Risposta alla pressione del materiale', default: true, description: 'Luce di contatto (e scala, se il materiale la prevede) sulla superficie glass.' },
  { type: 'boolean', path: 'interactions.wheelForward', section: 'interactions', label: 'La rotella sopra la barra scorre il contenuto', default: true, description: 'Richiede che l’applicazione indichi l’elemento che scorre.' },
  { type: 'enum', path: 'interactions.reselect', section: 'interactions', label: 'Tab attiva premuta di nuovo', options: opts(['event', 'Emetti «reselect»'], ['none', 'Niente']), default: 'event', description: 'Utile per tornare in cima a un elenco.' },
  { type: 'text', path: 'interactions.events.change', section: 'interactions', label: 'Evento cambio tab', pattern: EVENT_NAME, maxLength: 40, default: 'jello-change', description: 'Nome del CustomEvent DOM emesso al cambio di tab.' },
  { type: 'text', path: 'interactions.events.press', section: 'interactions', label: 'Evento pressione', pattern: EVENT_NAME, maxLength: 40, default: 'jello-press', description: 'Nome del CustomEvent DOM emesso alla pressione di una tab.' },
  { type: 'text', path: 'interactions.events.reselect', section: 'interactions', label: 'Evento riselezione', pattern: EVENT_NAME, maxLength: 40, default: 'jello-reselect', description: 'Nome del CustomEvent DOM emesso quando si preme la tab già attiva.' },
  { type: 'enum', path: 'motion.indicator', section: 'interactions', label: 'Animazione indicatore', options: opts(['spring', 'Elastica'], ['ease', 'Morbida'], ['none', 'Nessuna']), default: 'spring', description: 'Con movimento ridotto l’indicatore salta sempre senza animazione.' },
  num('motion.duration', 'interactions', 'Durata transizioni', 'ms', 0, 1000, 10, 340, 'Durata dello spostamento dell’indicatore e dei cambi di stato.'),

  { type: 'enum', path: 'responsive.overflow', section: 'responsive', label: 'Troppe tab per la larghezza', options: opts(['scroll', 'Scorrimento orizzontale'], ['compress', 'Comprimi (nasconde le etichette)']), default: 'scroll', description: 'Cosa succede quando le tab non stanno nella barra.' },
  num('responsive.minTabWidth', 'responsive', 'Larghezza minima tab', 'px', 44, 160, 1, 56, 'Sotto questa larghezza le tab vanno in overflow (44 px è il minimo per il tocco).'),
];

export const BN_FIELD_INDEX: Readonly<Record<string, FieldDescriptor>> = Object.fromEntries(BN_FIELDS.map((f) => [f.path, f]));

/** Root properties a breakpoint may override. */
export const OVERRIDE_PATHS = ['layout.placement', 'layout.height', 'layout.padding', 'layout.gap', 'layout.offset', 'layout.itemLayout', 'layout.labels', 'typography.fontSize', 'icon.size', 'layout.icons', 'layout.align', 'layout.width', 'layout.maxWidth', 'layout.distribution', 'layout.compact'] as const;

/** Per-tab overrides and their descriptors (same ranges as the root). */
export const TAB_STYLE_FIELDS: Readonly<Record<keyof BnTabStyle, NumberField>> = {
  iconSize: BN_FIELD_INDEX['icon.size'] as NumberField,
  fontSize: BN_FIELD_INDEX['typography.fontSize'] as NumberField,
  fontWeight: BN_FIELD_INDEX['typography.fontWeight'] as NumberField,
  letterSpacing: BN_FIELD_INDEX['typography.letterSpacing'] as NumberField,
};

export const TAB_ID = /^[A-Za-z][A-Za-z0-9_-]{0,47}$/;
export const MAX_TABS = 200;
export const TAB_LABEL_MAX = 40;
export const BREAKPOINT_ID = /^[A-Za-z][A-Za-z0-9_-]{0,31}$/;

export const NO_TAB_STYLE: BnTabStyle = { iconSize: null, fontSize: null, fontWeight: null, letterSpacing: null };

export function createTab(id: string, label: string, icon: IconRef = { kind: 'builtin', name: 'star' }): BnTab {
  return { kind: 'tab', id, label, icon, value: null, disabled: false, style: { ...NO_TAB_STYLE } };
}

/** A root with the default properties and the given tabs. */
export function createRoot(children: BnTab[], patch: Partial<Pick<BnRoot, 'label' | 'semantics' | 'defaultTab'>> = {}): BnRoot {
  const d = defaultsOf(BN_FIELDS) as Omit<BnRoot, 'kind' | 'id' | 'label' | 'semantics' | 'defaultTab' | 'children'> & { responsive: Omit<BnResponsive, 'breakpoints'> };
  return {
    kind: 'mobile-navbar',
    id: 'root',
    label: patch.label ?? 'Navigazione principale',
    semantics: patch.semantics ?? 'navigation',
    defaultTab: patch.defaultTab ?? children[0]?.id ?? '',
    layout: d.layout,
    appearance: d.appearance,
    typography: d.typography,
    icon: d.icon,
    states: d.states,
    interactions: d.interactions,
    motion: d.motion,
    responsive: { ...d.responsive, breakpoints: [] },
    children,
  };
}

// ---------- editing (immutable; every function returns a new root) ----------

/** Smallest `base-n` (or `base` itself) not in `taken`, always a valid tab id. */
export function uniqueId(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  let b = base
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  if (!/^[a-z]/.test(b)) b = `tab${b ? `-${b}` : ''}`;
  if (!used.has(b)) return b;
  for (let n = 2; ; n++) if (!used.has(`${b}-${n}`)) return `${b}-${n}`;
}

const ids = (root: BnRoot) => root.children.map((t) => t.id);

export function addTab(root: BnRoot, options: { after?: string; label?: string; icon?: IconRef } = {}): { root: BnRoot; id: string } {
  const id = uniqueId('tab', ids(root));
  const label = options.label ?? `Tab ${root.children.length + 1}`;
  const tab = createTab(id, label, options.icon);
  const at = options.after ? root.children.findIndex((t) => t.id === options.after) + 1 : root.children.length;
  const children = [...root.children];
  children.splice(at > 0 ? at : children.length, 0, tab);
  return { root: { ...root, children }, id };
}

/** The last tab cannot be removed: a navigation without destinations is not a component. */
export function removeTab(root: BnRoot, id: string): BnRoot {
  if (root.children.length <= 1) return root;
  const children = root.children.filter((t) => t.id !== id);
  if (children.length === root.children.length) return root;
  const defaultTab = root.defaultTab === id ? children[0]!.id : root.defaultTab;
  const responsive = root.responsive;
  return { ...root, children, defaultTab, responsive };
}

export function duplicateTab(root: BnRoot, id: string): { root: BnRoot; id: string } {
  const i = root.children.findIndex((t) => t.id === id);
  if (i < 0) return { root, id };
  const src = root.children[i]!;
  const copy: BnTab = { ...structuredClone(src), id: uniqueId(`${src.id}-copia`, ids(root)), label: `${src.label} (copia)`.slice(0, TAB_LABEL_MAX) };
  const children = [...root.children];
  children.splice(i + 1, 0, copy);
  return { root: { ...root, children }, id: copy.id };
}

/** Moves a tab to `index` (clamped). */
export function moveTab(root: BnRoot, id: string, index: number): BnRoot {
  const from = root.children.findIndex((t) => t.id === id);
  if (from < 0) return root;
  const to = Math.max(0, Math.min(root.children.length - 1, index));
  if (to === from) return root;
  const children = [...root.children];
  const [tab] = children.splice(from, 1);
  children.splice(to, 0, tab!);
  return { ...root, children };
}

export function updateTab(root: BnRoot, id: string, patch: Partial<Omit<BnTab, 'kind' | 'id'>>): BnRoot {
  return { ...root, children: root.children.map((t) => (t.id === id ? { ...t, ...patch, style: { ...t.style, ...patch.style } } : t)) };
}

/** Sets one described root property; invalid values are refused (null) instead of applied. */
export function setRootField(root: BnRoot, path: string, value: unknown): BnRoot | null {
  const f = BN_FIELD_INDEX[path];
  if (!f || checkField(f, value)) return null;
  return setPath(root, path, f.type === 'color' ? String(value).toLowerCase() : value);
}

export function rootField(root: BnRoot, path: string): unknown {
  return getPath(root, path);
}

export function addBreakpoint(root: BnRoot, maxWidth = 480): { root: BnRoot; id: string } {
  const id = uniqueId(`bp-${maxWidth}`, root.responsive.breakpoints.map((b) => b.id));
  const bp: BnBreakpoint = { id, maxWidth, overrides: {} };
  return { root: { ...root, responsive: { ...root.responsive, breakpoints: [...root.responsive.breakpoints, bp] } }, id };
}

export function updateBreakpoint(root: BnRoot, id: string, patch: { maxWidth?: number; set?: [BnOverrideKey, number | string | boolean | null] }): BnRoot {
  const breakpoints = root.responsive.breakpoints.map((b) => {
    if (b.id !== id) return b;
    let overrides = b.overrides;
    if (patch.set) {
      const [k, v] = patch.set;
      overrides = { ...overrides };
      if (v === null) delete overrides[k];
      else if (!checkField(BN_FIELD_INDEX[k]!, v)) overrides[k] = v;
    }
    return { ...b, maxWidth: patch.maxWidth ?? b.maxWidth, overrides };
  });
  return { ...root, responsive: { ...root.responsive, breakpoints } };
}

export function removeBreakpoint(root: BnRoot, id: string): BnRoot {
  return { ...root, responsive: { ...root.responsive, breakpoints: root.responsive.breakpoints.filter((b) => b.id !== id) } };
}

// ---------- responsive resolution ----------

/**
 * Root properties in effect at a container width: every breakpoint whose
 * maxWidth is ≥ width applies, from the widest to the narrowest (so the
 * narrowest wins). Pure, so the editor, the DOM renderer and tests agree.
 */
export function resolveRoot(root: BnRoot, containerWidth: number): { root: BnRoot; breakpoint: string | null } {
  const active = root.responsive.breakpoints.filter((b) => containerWidth <= b.maxWidth).sort((a, b) => b.maxWidth - a.maxWidth);
  let out = root;
  for (const bp of active) for (const [k, v] of Object.entries(bp.overrides)) out = setPath(out, k, v);
  return { root: out, breakpoint: active.length ? active[active.length - 1]!.id : null };
}

/** Effective style of one tab: its overrides, else the root. */
export function tabStyle(root: BnRoot, tab: BnTab): { iconSize: number; fontSize: number; fontWeight: number; letterSpacing: number } {
  return {
    iconSize: tab.style.iconSize ?? root.icon.size,
    fontSize: tab.style.fontSize ?? root.typography.fontSize,
    fontWeight: tab.style.fontWeight ?? root.typography.fontWeight,
    letterSpacing: tab.style.letterSpacing ?? root.typography.letterSpacing,
  };
}

// ---------------------------------------------------------------------------
// Canonical definition ↔ view
// ---------------------------------------------------------------------------

/**
 * Where each property lives in `jello-component-definition`:
 *
 *   layout.*                          layout.*
 *   responsive.*                      responsive.*  (breakpoint override keys use the canonical names too)
 *   appearance|typography|icon|motion style.<name>.*
 *   states.<state>.<key>              states.<state>.style.<key>
 *   interactions.events.*             interactions.events.*
 *   interactions.<behavior key>       interactions.behavior.<key>
 *   label | semantics | defaultTab    content.root.text | interactions.behavior.semantics | …defaultItem
 */
export function toCanonicalPath(path: string): string {
  const [head, ...rest] = path.split('.');
  switch (head) {
    case 'layout':
    case 'responsive':
      return path;
    case 'appearance':
    case 'typography':
    case 'icon':
    case 'motion':
      return `style.${path}`;
    case 'states':
      return `states.${rest[0]}.style.${rest.slice(1).join('.')}`;
    case 'interactions':
      return rest[0] === 'events' ? path : `interactions.behavior.${rest.join('.')}`;
    case 'label':
      return 'content.root.text';
    case 'semantics':
      return 'interactions.behavior.semantics';
    case 'defaultTab':
      return 'interactions.behavior.defaultItem';
    default:
      return path;
  }
}

export function fromCanonicalPath(path: string): string {
  const parts = path.split('.');
  if (parts[0] === 'style') return parts.slice(1).join('.');
  if (parts[0] === 'states' && parts[2] === 'style') return `states.${parts[1]}.${parts.slice(3).join('.')}`;
  if (parts[0] === 'interactions' && parts[1] === 'behavior') return `interactions.${parts.slice(2).join('.')}`;
  return path;
}

/** The described properties of a navbar, addressed by canonical path (what an inspector for the definition lists). */
export const NAVBAR_FIELDS: readonly FieldDescriptor[] = BN_FIELDS.map((f) => ({ ...f, path: toCanonicalPath(f.path),
  scope: ['layout.anchor', 'layout.placement', 'layout.offset'].includes(f.path) ? 'mobile-navbar' : 'common',
  level: ['layout.widthMode', 'layout.width', 'layout.maxWidth', 'layout.radius', 'layout.gap', 'layout.labels', 'layout.placement', 'appearance.indicator.style', 'appearance.indicator.color'].includes(f.path) ? 'base' : 'advanced',
}));

/**
 * Described properties that have no effect on a material family, with the
 * reason and where to change it instead (see BUTTON_UNSUPPORTED). The
 * renderer leaves them out of what it writes (`navbarPresentation`).
 */
export const NAVBAR_UNSUPPORTED: Readonly<Record<string, readonly { path: string; reason: string }[]>> = {
  glass: [],
  solid: [
    { path: 'style.appearance.foreground', reason: 'Con Solid il colore di testo e icone delle tab è del materiale: si cambia in Materiale → «Colore del contenuto».' },
    { path: 'style.appearance.indicator.color', reason: 'Con Solid l’indicatore è tinto con il colore della tab attiva (Stati → Attiva · colore), così resta visibile su qualunque riempimento.' },
    { path: 'style.appearance.textShadow', reason: 'Con Solid il testo sta su un riempimento pieno: l’alone di leggibilità non serve e non viene disegnato.' },
    { path: 'interactions.behavior.pressFeedback', reason: 'Una barra Solid non si abbassa alla pressione: il feedback è lo sfondo della tab premuta (Stati → Premuta).' },
  ],
};

export interface Presentation {
  attrs: Record<string, string>;
  vars: Record<string, string>;
}

const EASING = { spring: 'cubic-bezier(0.3, 1.2, 0.4, 1)', ease: 'cubic-bezier(0.2, 0.8, 0.2, 1)', none: 'linear' } as const;

/**
 * Every visual decision of the bar for a material family, as attributes and
 * CSS variables (what `runtime/bottom-navigation.ts` writes to the root).
 * Properties the family does not support (`NAVBAR_UNSUPPORTED`) are left out,
 * which is what makes "ignored" observable by a test.
 */
export function navbarPresentation(r: BnRoot, family: string, o: { anchor?: BnLayout['anchor']; breakpoint: string | null }): Presentation {
  const L = r.layout;
  const docked = L.placement === 'docked';
  const off = new Set((NAVBAR_UNSUPPORTED[family] ?? []).map((u) => u.path));
  const attrs: Record<string, string> = {
    'data-material': family,
    'data-anchor': o.anchor ?? L.anchor,
    'data-placement': L.placement,
    'data-align': L.align,
    'data-width': L.widthMode,
    'data-item-layout': L.itemLayout,
    'data-labels': L.labels,
    'data-indicator': r.appearance.indicator.style,
    'data-font': r.typography.fontFamily,
    'data-overflow': r.responsive.overflow,
    'data-motion': r.motion.indicator,
    'data-semantics': r.semantics,
  };
  if (L.icons !== undefined) attrs['data-icons'] = L.icons;
  if (L.distribution !== undefined) attrs['data-distribution'] = L.distribution;
  if (L.compact !== undefined) attrs['data-compact'] = String(L.compact);
  if (!off.has('style.appearance.textShadow')) attrs['data-text-shadow'] = String(r.appearance.textShadow);
  if (o.breakpoint) attrs['data-breakpoint'] = o.breakpoint;
  const vars: Record<string, string> = {
    '--jbn-width': `${L.width}px`,
    '--jbn-max-width': `${L.maxWidth}px`,
    '--jbn-height': `${L.height}px`,
    '--jbn-padding': `${L.padding}px`,
    '--jbn-gap': `${L.gap}px`,
    '--jbn-radius': docked ? '0px' : L.radius === 'capsule' ? '9999px' : `${L.radius}px`,
    '--jbn-offset': docked ? '0px' : `${L.offset}px`,
    '--jbn-indicator-inset': `${r.appearance.indicator.inset}px`,
    '--jbn-font-size': `${r.typography.fontSize}px`,
    '--jbn-font-weight': String(r.typography.fontWeight),
    '--jbn-letter-spacing': `${r.typography.letterSpacing}px`,
    '--jbn-icon': `${r.icon.size}px`,
    '--jbn-stroke': String(r.icon.strokeWidth),
    '--jbn-active': r.states.active.color,
    '--jbn-active-weight': String(r.states.active.fontWeight),
    '--jbn-hover': r.states.hover.background,
    '--jbn-press': r.states.pressed.background,
    '--jbn-press-scale': String(r.states.pressed.scale),
    '--jbn-focus': r.states.focus.color,
    '--jbn-focus-width': `${r.states.focus.width}px`,
    '--jbn-focus-offset': `${r.states.focus.offset}px`,
    '--jbn-disabled': String(r.states.disabled.opacity),
    '--jbn-duration': `${r.motion.indicator === 'none' ? 0 : r.motion.duration}ms`,
    '--jbn-easing': EASING[r.motion.indicator],
    '--jbn-min-tab': `${r.responsive.minTabWidth}px`,
  };
  if (!off.has('style.appearance.foreground')) vars['--jbn-fg'] = r.appearance.foreground;
  if (!off.has('style.appearance.indicator.color')) vars['--jbn-indicator'] = r.appearance.indicator.color;
  return { attrs, vars };
}

/** States a navbar can be in (focus is a ring drawn by the component, not a material state). */
export const NAVBAR_STATES = ['default', 'hover', 'pressed', 'active', 'focus', 'disabled'] as const;
/** Events a navbar reports. */
export const NAVBAR_TRIGGERS = ['press', 'hover', 'focus', 'change', 'reselect', 'action'] as const;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const obj = (v: unknown): Record<string, unknown> => (isObj(v) ? v : {});

/** The canonical sections that hold navbar properties. */
export interface NavbarSections {
  layout: Record<string, unknown>;
  responsive: Record<string, unknown>;
  style: Record<string, unknown>;
  /** Per-state `style` objects, by state. */
  stateStyles: Partial<Record<(typeof NAVBAR_STATES)[number], Record<string, unknown>>>;
  behavior: Record<string, unknown>;
  events: Record<string, unknown>;
}

/** Regroups canonical sections into the shape the described properties (BN_FIELDS) are written for. */
function viewSections(s: { layout?: unknown; responsive?: unknown; style?: unknown; states?: unknown; interactions?: unknown }): Record<string, unknown> {
  const style = obj(s.style);
  const states = obj(s.states);
  const inter = obj(s.interactions);
  const beh = obj(inter.behavior);
  const { breakpoints: _bp, ...responsive } = obj(s.responsive);
  void _bp;
  return {
    layout: s.layout,
    appearance: style.appearance,
    typography: style.typography,
    icon: style.icon,
    motion: style.motion,
    states: Object.fromEntries((['active', 'hover', 'pressed', 'focus', 'disabled'] as const).map((k) => [k, obj(states[k]).style])),
    interactions: { pressFeedback: beh.pressFeedback, wheelForward: beh.wheelForward, reselect: beh.reselect, events: isObj(inter.events) ? Object.fromEntries(Object.entries(inter.events).filter(([k]) => !['action', 'hover', 'focus'].includes(k))) : inter.events },
    responsive,
  };
}

const mapMessage = (m: string) => m.replace(/^([A-Za-z0-9_.]+): /, (_, p: string) => `${toCanonicalPath(p)}: `);

/** Canonical override key (as stored in a breakpoint) for each view key. */
export interface ItemRef {
  id: string;
}

export interface NavbarCheck {
  sections: NavbarSections;
  defaultItem: string;
  semantics: BnRoot['semantics'];
}

/**
 * Validates the navbar sections of a raw definition. Same policy as every
 * format: a missing value takes its default (warning), an invalid one refuses
 * the document, an unknown key is dropped (warning). Messages name the
 * canonical path.
 */
export function checkNavbarSections(
  raw: { layout?: unknown; responsive?: unknown; style?: unknown; states?: unknown; interactions?: unknown },
  items: readonly ItemRef[],
  errors: string[],
  warnings: string[],
  fields: readonly FieldDescriptor[] = BN_FIELDS,
  overridePaths: readonly string[] = OVERRIDE_PATHS,
  styleItems: readonly ItemRef[] = items,
): NavbarCheck | null {
  const before = errors.length;
  for (const k of ['layout', 'responsive', 'style', 'states', 'interactions'] as const) {
    if (raw[k] !== undefined && !isObj(raw[k])) errors.push(`${k}: atteso un oggetto`);
  }
  const style = obj(raw.style);
  const inter = obj(raw.interactions);
  const behavior = obj(inter.behavior);
  const f = checkFields(viewSections(raw), fields, '');
  const fieldIndex = Object.fromEntries(fields.map((f) => [f.path, f]));
  const overrideCanonical = overridePaths.map(toCanonicalPath);
  errors.push(...f.errors.map(mapMessage));
  warnings.push(...f.warnings.map(mapMessage));
  for (const k of Object.keys(behavior)) if (!['semantics', 'defaultItem', 'pressFeedback', 'wheelForward', 'reselect'].includes(k)) warnings.push(`interactions.behavior.${k}: proprietà sconosciuta, ignorata`);

  const semantics = behavior.semantics ?? 'navigation';
  if (semantics !== 'navigation' && semantics !== 'tabs') errors.push('interactions.behavior.semantics: atteso navigation o tabs');
  let defaultItem = typeof behavior.defaultItem === 'string' ? behavior.defaultItem : '';
  if (!items.some((t) => t.id === defaultItem)) {
    if (defaultItem) warnings.push(`interactions.behavior.defaultItem: "${defaultItem}" non è una voce, uso "${items[0]?.id ?? ''}"`);
    defaultItem = items[0]?.id ?? '';
  }

  // Breakpoints: a list, not described leaves.
  const breakpoints: BnBreakpoint[] = [];
  const bpIn = obj(raw.responsive).breakpoints;
  if (bpIn === undefined) warnings.push('responsive.breakpoints: assente, nessun breakpoint');
  else if (!Array.isArray(bpIn)) errors.push('responsive.breakpoints: atteso un elenco');
  else {
    const seen = new Set<string>();
    bpIn.forEach((b, i) => {
      const at = `responsive.breakpoints.${i}`;
      if (!isObj(b)) return void errors.push(`${at}: atteso un oggetto`);
      if (typeof b.id !== 'string' || !BREAKPOINT_ID.test(b.id)) errors.push(`${at}.id: identificatore non valido`);
      else if (seen.has(b.id)) errors.push(`${at}.id: "${b.id}" duplicato`);
      else seen.add(b.id);
      if (typeof b.maxWidth !== 'number' || !Number.isFinite(b.maxWidth) || !(b.maxWidth >= 200 && b.maxWidth <= 2000)) errors.push(`${at}.maxWidth: atteso un numero tra 200 e 2000`);
      const overrides: BnOverrides = {};
      if (!isObj(b.overrides)) errors.push(`${at}.overrides: atteso un oggetto`);
      else {
        for (const [k, v] of Object.entries(b.overrides)) {
          const i2 = overrideCanonical.indexOf(k);
          if (i2 < 0) {
            warnings.push(`${at}.overrides.${k}: non sovrascrivibile da un breakpoint, ignorato`);
            continue;
          }
          const viewKey = overridePaths[i2]! as BnOverrideKey;
          const e = checkField(fieldIndex[viewKey]!, v);
          if (e) errors.push(`${at}.overrides.${k}: ${e.split(': ').slice(1).join(': ')}`);
          else overrides[viewKey] = v as number | string | boolean;
        }
      }
      if (typeof b.id === 'string' && typeof b.maxWidth === 'number') breakpoints.push({ id: b.id, maxWidth: b.maxWidth, overrides });
    });
  }

  // Per-item overrides of the typography.
  const itemStyles: Record<string, Partial<BnTabStyle>> = {};
  const itemsIn = style.items;
  if (itemsIn !== undefined && !isObj(itemsIn)) errors.push('style.items: atteso un oggetto');
  else if (isObj(itemsIn)) {
    for (const [id, st] of Object.entries(itemsIn)) {
      const at = `style.items.${id}`;
      if (!styleItems.some((t) => t.id === id)) {
        warnings.push(`${at}: nessuna voce con questo id, ignorato`);
        continue;
      }
      if (!isObj(st)) {
        errors.push(`${at}: atteso un oggetto`);
        continue;
      }
      const out: Partial<BnTabStyle> = {};
      for (const [k, v] of Object.entries(st)) {
        const d = TAB_STYLE_FIELDS[k as keyof BnTabStyle];
        if (!d) {
          warnings.push(`${at}.${k}: proprietà sconosciuta, ignorata`);
          continue;
        }
        if (v === null || v === undefined) continue;
        const e = checkField(d, v);
        if (e) errors.push(`${at}.${k}: ${e.split(': ').slice(1).join(': ')}`);
        else out[k as keyof BnTabStyle] = v as number;
      }
      if (Object.keys(out).length) itemStyles[id] = out;
    }
  }
  for (const k of Object.keys(style)) if (!['appearance', 'typography', 'icon', 'motion', 'items'].includes(k)) warnings.push(`style.${k}: proprietà sconosciuta, ignorata`);
  if (errors.length > before) return null;

  const v = f.value as Record<string, any>;
  const stateStyles: NavbarSections['stateStyles'] = {};
  for (const k of ['hover', 'pressed', 'active', 'focus', 'disabled'] as const) stateStyles[k] = v.states[k];
  return {
    defaultItem,
    semantics: semantics as BnRoot['semantics'],
    sections: {
      layout: v.layout,
      responsive: { ...v.responsive, breakpoints: breakpoints.map((b) => ({ id: b.id, maxWidth: b.maxWidth, overrides: Object.fromEntries(Object.entries(b.overrides).map(([key, val]) => [toCanonicalPath(key), val])) })) },
      style: { appearance: v.appearance, typography: v.typography, icon: v.icon, motion: v.motion, items: itemStyles },
      stateStyles,
      behavior: { semantics, defaultItem, pressFeedback: v.interactions.pressFeedback, wheelForward: v.interactions.wheelForward, reselect: v.interactions.reselect },
      events: v.interactions.events,
    },
  };
}

// ---------- view ----------

interface ItemNodes {
  id: string;
  iconId: string | null;
  labelId: string | null;
}

/** The items of a definition with the ids of their icon and label slots. */
export function itemNodes(def: Pick<ComponentDefinition, 'structure'>): ItemNodes[] {
  return navbarItemNodes(def).map(({ node }) => node)
    .filter((n) => n.role === 'item')
    .map((n) => ({
      id: n.id,
      iconId: n.children?.find((c) => c.role === 'icon')?.id ?? null,
      labelId: n.children?.find((c) => c.role === 'label')?.id ?? null,
    }));
}

const VIEWS = new WeakMap<ComponentDefinition, BnRoot>();

/**
 * The navbar as the renderer and the exporters read it. Derived from the
 * definition and cached by identity (definitions are immutable); never stored,
 * never exchanged, never edited directly.
 */
export function navbarView(def: ComponentDefinition): BnRoot {
  const hit = VIEWS.get(def);
  if (hit) return hit;
  const sec = viewSections(def) as Record<string, any>;
  const beh = obj(def.interactions.behavior);
  const itemStyles = obj(obj(def.style).items) as Record<string, Partial<BnTabStyle>>;
  const membership = new Map(navbarItemNodes(def).map(({ node, groupId }) => [node.id, groupId]));
  const children: BnTab[] = itemNodes(def).map((n) => {
    const c = def.content[n.id] ?? {};
    return {
      kind: 'tab',
      id: n.id,
      label: n.labelId ? (def.content[n.labelId]?.text ?? '') : '',
      icon: n.iconId ? (def.content[n.iconId]?.icon ?? { kind: 'none' }) : { kind: 'none' },
      value: c.value ?? null,
      disabled: c.disabled ?? false,
      ...(c.visible !== undefined ? { visible: c.visible } : {}),
      ...(c.action ? { action: c.action } : {}),
      ...(c.iconPosition ? { iconPosition: c.iconPosition } : {}),
      ...(c.accessibleLabel ? { accessibleLabel: c.accessibleLabel } : {}),
      ...(c.description ? { description: c.description } : {}),
      ...(membership.get(n.id) ? { groupId: membership.get(n.id)! } : {}),
      style: { ...NO_TAB_STYLE, ...itemStyles[n.id] },
    };
  });
  const resp = obj(def.responsive) as Record<string, any>;
  const view: BnRoot = {
    kind: 'mobile-navbar',
    id: 'root',
    label: def.content.root?.text ?? '',
    semantics: (beh.semantics as BnRoot['semantics']) ?? 'navigation',
    defaultTab: (beh.defaultItem as string) ?? children[0]?.id ?? '',
    layout: sec.layout,
    appearance: sec.appearance,
    typography: sec.typography,
    icon: sec.icon,
    states: sec.states,
    interactions: { ...sec.interactions, events: { ...sec.interactions.events, ...def.interactions.events } },
    motion: sec.motion,
    responsive: {
      overflow: resp.overflow,
      minTabWidth: resp.minTabWidth,
      breakpoints: ((resp.breakpoints ?? []) as BnBreakpoint[]).map((b) => ({ ...b, overrides: Object.fromEntries(Object.entries(b.overrides).map(([k, v]) => [fromCanonicalPath(k), v])) })),
    },
    children,
  };
  VIEWS.set(def, view);
  return view;
}

/** Container-width resolution: the view with the breakpoints in effect applied (see resolveRoot). */
export function resolveNavbar(def: ComponentDefinition, containerWidth: number): { root: BnRoot; breakpoint: string | null } {
  return resolveRoot(navbarView(def), containerWidth);
}

/**
 * Writes a (possibly edited) view back into the definition: structure,
 * content, layout, responsive, style, states, interactions. Slot ids that
 * already exist are kept; new ones are derived from the item id. Material
 * bindings and per-state material overrides are untouched.
 */
export function applyNavbarView(def: ComponentDefinition, view: BnRoot): ComponentDefinition {
  const known = new Map(itemNodes(def).map((n) => [n.id, n]));
  const itemIds = new Set(view.children.map((t) => t.id));
  const groups = (def.structure.children ?? []).filter((n) => n.role === 'group');
  const taken = new Set<string>(['root', ...itemIds, ...groups.map((g) => g.id)]);
  const slot = (itemId: string, suffix: 'icon' | 'label', existing: string | null) => {
    // A slot id is kept across edits, unless an item has since taken that id.
    if (existing && !itemIds.has(existing) && !taken.has(existing)) {
      taken.add(existing);
      return existing;
    }
    const id = uniqueId(`${itemId}-${suffix}`, taken);
    taken.add(id);
    return id;
  };
  const content: Record<string, NodeContent> = { ...def.content, root: { ...def.content.root, text: view.label } };
  for (const n of itemNodes(def)) {
    if (!itemIds.has(n.id)) delete content[n.id];
    if (n.iconId) delete content[n.iconId];
    if (n.labelId) delete content[n.labelId];
  }
  const itemChildren = view.children.map((t) => {
    const prev = known.get(t.id);
    const kids: StructureNode[] = [];
    const { value: _value, disabled: _disabled, ...rest } = content[t.id] ?? {};
    content[t.id] = { ...rest, ...(t.value !== null ? { value: t.value } : {}), ...(t.disabled ? { disabled: true } : {}),
      ...(t.visible !== undefined ? { visible: t.visible } : {}), ...(t.action ? { action: t.action } : {}),
      ...(t.iconPosition ? { iconPosition: t.iconPosition } : {}), ...(t.accessibleLabel ? { accessibleLabel: t.accessibleLabel } : {}), ...(t.description ? { description: t.description } : {}),
    };
    if (t.icon.kind !== 'none') {
      const id = slot(t.id, 'icon', prev?.iconId ?? null);
      kids.push({ id, role: 'icon' });
      content[id] = { ...def.content[id], icon: t.icon };
    }
    if (t.label !== '') {
      const id = slot(t.id, 'label', prev?.labelId ?? null);
      kids.push({ id, role: 'label' });
      content[id] = { ...def.content[id], text: t.label };
    }
    return kids.length ? ({ id: t.id, role: 'item', children: kids } as StructureNode) : ({ id: t.id, role: 'item' } as StructureNode);
  });
  const children: StructureNode[] = [];
  const placed = new Set<string>();
  for (const [i, t] of view.children.entries()) {
    if (!t.groupId) children.push(itemChildren[i]!);
    else if (!placed.has(t.groupId)) {
      const group = groups.find((g) => g.id === t.groupId);
      if (!group) throw new Error(`Gruppo inesistente: ${t.groupId}`);
      children.push({ ...group, children: itemChildren.filter((_, j) => view.children[j]?.groupId === t.groupId) });
      placed.add(t.groupId);
    }
  }
  for (const g of groups) if (!placed.has(g.id)) children.splice(Math.min(def.structure.children!.indexOf(g), children.length), 0, { ...g, children: [] });
  const items: Record<string, Partial<BnTabStyle>> = {};
  for (const t of view.children) {
    const own = Object.fromEntries(Object.entries(t.style).filter(([, v]) => v !== null));
    if (Object.keys(own).length) items[t.id] = own as Partial<BnTabStyle>;
  }
  const styleOf = (k: 'active' | 'hover' | 'pressed' | 'focus' | 'disabled') => ({ ...def.states[k], style: { ...view.states[k] } });
  return {
    ...def,
    structure: { id: 'root', role: 'navbar', children },
    content,
    layout: { ...def.layout, ...view.layout },
    responsive: {
      ...def.responsive,
      overflow: view.responsive.overflow,
      minTabWidth: view.responsive.minTabWidth,
      breakpoints: view.responsive.breakpoints.map((b) => ({ id: b.id, maxWidth: b.maxWidth, overrides: Object.fromEntries(Object.entries(b.overrides).map(([k, v]) => [toCanonicalPath(k), v])) })),
    },
    style: { ...def.style, appearance: view.appearance, typography: view.typography, icon: view.icon, motion: view.motion, items },
    // Canonical order (NAVBAR_STATES), so a document reads the same however it was produced.
    states: { ...def.states, hover: styleOf('hover'), pressed: styleOf('pressed'), active: styleOf('active'), focus: styleOf('focus'), disabled: styleOf('disabled') },
    interactions: {
      ...def.interactions,
      behavior: { ...def.interactions.behavior, semantics: view.semantics, defaultItem: view.defaultTab, pressFeedback: view.interactions.pressFeedback, wheelForward: view.interactions.wheelForward, reselect: view.interactions.reselect },
      events: { ...def.interactions.events, ...view.interactions.events },
    },
  };
}

/** Sets one described property (canonical path). Invalid values are refused (null) instead of applied. */
export function setNavbarField(def: ComponentDefinition, path: string, value: unknown): ComponentDefinition | null {
  const next = setRootField(navbarView(def), fromCanonicalPath(path), value);
  return next ? applyNavbarView(def, next) : null;
}

export function getNavbarField(def: ComponentDefinition, path: string): unknown {
  return rootField(navbarView(def), fromCanonicalPath(path));
}

/** Tab-level operations on a definition: apply an operation on the view, write the result back. */
export function editNavbar(def: ComponentDefinition, edit: (root: BnRoot) => BnRoot): ComponentDefinition {
  return applyNavbarView(def, edit(navbarView(def)));
}
