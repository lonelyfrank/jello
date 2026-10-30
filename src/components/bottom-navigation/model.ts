/**
 * BottomNavigation: a generic, configurable tab bar. The lab's demo navbar
 * and the official template are both documents of this component.
 *
 *   root (kind: bottom-navigation, id: root)
 *     layout · appearance · typography · icon · states · interactions · motion · responsive
 *     children: tab × n     stable ids, independent of the visible labels
 *
 * Tabs are not tied to pages: the component reports `change`, `press` and
 * `reselect` and the host application decides what they mean (routing,
 * panels, nothing). There is no maximum number of tabs; when they do not fit,
 * `responsive.overflow` decides (scroll or compress).
 *
 * Pure data and pure functions: the DOM renderer is dom.ts.
 */

import type { IconRef } from '../icons';
import { checkField, defaultsOf, getPath, setPath, type FieldDescriptor, type NumberField } from '../fields';

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
  events: { change: string; press: string; reselect: string };
}

export interface BnMotion {
  indicator: 'spring' | 'ease' | 'none';
  duration: number;
}

export type BnOverrideKey = (typeof OVERRIDE_PATHS)[number];
export type BnOverrides = Partial<Record<BnOverrideKey, number | string>>;

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
  /** Per-tab overrides; null inherits from the root. */
  style: BnTabStyle;
}

export interface BnRoot {
  kind: 'bottom-navigation';
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

const num = (path: string, section: NumberField['section'], label: string, unit: string, min: number, max: number, step: number, def: number, description: string): NumberField => ({
  type: 'number',
  path,
  section,
  label,
  unit,
  min,
  max,
  step,
  default: def,
  description,
});
const opts = (...pairs: [string, string][]) => pairs.map(([value, label]) => ({ value, label }));
const EVENT_NAME = /^[a-z][a-z0-9-]{0,39}$/;

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
export const OVERRIDE_PATHS = ['layout.placement', 'layout.height', 'layout.padding', 'layout.gap', 'layout.offset', 'layout.itemLayout', 'layout.labels', 'typography.fontSize', 'icon.size'] as const;

/** Per-tab overrides and their descriptors (same ranges as the root). */
export const TAB_STYLE_FIELDS: Readonly<Record<keyof BnTabStyle, NumberField>> = {
  iconSize: BN_FIELD_INDEX['icon.size'] as NumberField,
  fontSize: BN_FIELD_INDEX['typography.fontSize'] as NumberField,
  fontWeight: BN_FIELD_INDEX['typography.fontWeight'] as NumberField,
  letterSpacing: BN_FIELD_INDEX['typography.letterSpacing'] as NumberField,
};

export const TAB_ID = /^[A-Za-z][A-Za-z0-9_-]{0,47}$/;
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
    kind: 'bottom-navigation',
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

export function updateBreakpoint(root: BnRoot, id: string, patch: { maxWidth?: number; set?: [BnOverrideKey, number | string | null] }): BnRoot {
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
