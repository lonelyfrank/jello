/**
 * Button / CTA properties of the canonical definition (`button`).
 *
 * A button is a label with an optional icon on one material surface. Its
 * described properties (BUTTON_FIELDS) are addressed by the same dotted paths
 * the document uses (`layout.size`, `style.variant`,
 * `states.hover.style.background`, `interactions.events.press`), so reading and
 * writing one is `getPath` / `setPath` on the definition: there is no
 * intermediate view to keep in step.
 *
 *   structure   root(button) → icon? · label
 *   content     label.text · icon.icon · root.{href, value, disabled}
 *   layout      size, width, padding, gap, radius, alignment, icon position
 *   style       variant (primary · secondary · ghost), content colors, typography, icon
 *   states      hover · pressed · focus · disabled   (the component's own part of each state)
 *   behavior    semantics: `action` renders a <button>, `link` an <a href>
 *
 * Material. The button never paints a surface itself: `family` + `preset` give
 * the surface, and `style.variant: 'primary'` asks the family for its accent
 * (`MaterialDefinition.accent`). What a family renders on its own (Solid's
 * hover, pressed and disabled) is not drawn a second time by the component:
 * `BUTTON_UNSUPPORTED` lists, per family, the properties that therefore have
 * no effect, and `buttonPresentation` leaves them out, so the claim is checked
 * by comparing what is written to the DOM (tests/unit/button.test.ts).
 *
 * Pure data and functions: the DOM renderer is runtime/button.ts.
 */

import type { ComponentDefinition, NodeContent, StructureNode } from './definition';
import { EVENT_NAME_PATTERN, checkField, checkFields, choices, getPath, numberField, setPath, type FieldDescriptor } from './fields';
import type { IconRef } from './icons';
import type { NavbarSections } from './navbar';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';
export type ButtonSemantics = 'action' | 'link';

/** Minimum height of each size, in px. `md` and `lg` meet the 44 px touch target; `sm` is for dense, pointer-first layouts. */
export const BUTTON_SIZES: Readonly<Record<ButtonSize, number>> = { sm: 36, md: 44, lg: 52 };

const num = numberField;
const opts = choices;

export const BUTTON_FIELDS: readonly FieldDescriptor[] = [
  { type: 'enum', path: 'layout.size', section: 'layout', label: 'Dimensione', options: opts(['sm', 'Piccolo · 36 px'], ['md', 'Medio · 44 px'], ['lg', 'Grande · 52 px']), default: 'md', description: 'Altezza minima del pulsante. Medio e grande rispettano i 44 px del bersaglio tattile.' },
  { type: 'enum', path: 'layout.widthMode', section: 'layout', label: 'Larghezza', options: opts(['hug', 'Adatta al contenuto'], ['fill', 'Riempi il contenitore'], ['fixed', 'Fissa']), default: 'hug', description: 'Come si calcola la larghezza. Con «Riempi» il pulsante segue il contenitore, anche quando cambia.' },
  num('layout.width', 'layout', 'Larghezza fissa', 'px', 48, 1200, 1, 200, 'Usata con «Larghezza: fissa».'),
  num('layout.paddingX', 'layout', 'Padding orizzontale', 'px', 0, 48, 1, 20, 'Spazio tra il bordo e il contenuto, a sinistra e a destra.'),
  num('layout.paddingY', 'layout', 'Padding verticale', 'px', 0, 24, 1, 10, 'Spazio tra il bordo e il contenuto, sopra e sotto. L’altezza non scende sotto la dimensione scelta.'),
  num('layout.gap', 'layout', 'Spazio icona-testo', 'px', 0, 24, 1, 8, 'Distanza tra icona ed etichetta.'),
  { type: 'radius', path: 'layout.radius', section: 'layout', label: 'Raggio', min: 0, max: 60, default: 'capsule', description: '«capsule»: metà dell’altezza. Un numero: raggio in px (la superficie del materiale lo segue).' },
  { type: 'enum', path: 'layout.align', section: 'layout', label: 'Allineamento del contenuto', options: opts(['start', 'Inizio'], ['center', 'Centro'], ['end', 'Fine']), default: 'center', description: 'Dove sta il contenuto quando il pulsante è più largo di esso («Riempi» o «Fissa»). La posizione del pulsante nella pagina è del tuo layout.' },
  { type: 'enum', path: 'layout.iconPosition', section: 'layout', label: 'Posizione dell’icona', options: opts(['start', 'Prima del testo'], ['end', 'Dopo il testo']), default: 'start', description: 'Da che parte dell’etichetta sta l’icona (se c’è). Non dipende dall’ordine nella struttura.' },

  { type: 'enum', path: 'style.variant', section: 'appearance', label: 'Variante', options: opts(['primary', 'Primary · accento'], ['secondary', 'Secondary · materiale'], ['ghost', 'Ghost · senza superficie']), default: 'secondary', description: 'Primary chiede al materiale il suo accento; Secondary mostra il materiale com’è; Ghost mostra la superficie solo con hover, pressione e focus.' },
  { type: 'color', path: 'style.colors.primary', section: 'appearance', label: 'Contenuto · Primary', default: '#ffffff', description: 'Colore di testo e icona nella variante Primary. Con Solid lo decide il materiale (parametro «Colore del contenuto»).' },
  { type: 'color', path: 'style.colors.secondary', section: 'appearance', label: 'Contenuto · Secondary', default: '#0c0c10', description: 'Colore di testo e icona nella variante Secondary. Con Solid lo decide il materiale (parametro «Colore del contenuto»).' },
  { type: 'color', path: 'style.colors.ghost', section: 'appearance', label: 'Contenuto · Ghost', default: '#0c0c10', description: 'Colore di testo e icona nella variante Ghost a riposo, quando non c’è superficie; con la superficie visibile torna quello del materiale (Solid).' },
  { type: 'enum', path: 'style.typography.fontFamily', section: 'typography', label: 'Carattere', options: opts(['system', 'Sistema'], ['inherit', 'Eredita dalla pagina']), default: 'system', description: 'Famiglia del testo.' },
  num('style.typography.fontSize', 'typography', 'Dimensione testo', 'px', 8, 32, 0.5, 15, 'Dimensione dell’etichetta.'),
  num('style.typography.fontWeight', 'typography', 'Peso', '', 300, 900, 50, 600, 'Peso dell’etichetta.'),
  num('style.typography.letterSpacing', 'typography', 'Spaziatura lettere', 'px', -2, 4, 0.05, 0.1, 'Spaziatura tra le lettere.'),
  num('style.icon.size', 'typography', 'Dimensione icona', 'px', 12, 40, 1, 20, 'Lato dell’icona.'),
  num('style.icon.strokeWidth', 'typography', 'Spessore tratto icona', 'px', 0.5, 3, 0.1, 1.8, 'Spessore delle icone a tratto.'),

  { type: 'color', path: 'states.hover.style.background', section: 'states', label: 'Hover · velo', default: '#ffffff38', description: 'Velo sopra la superficie sotto il puntatore (solo dispositivi con hover). Con Solid lo stato hover è del materiale.' },
  { type: 'color', path: 'states.pressed.style.background', section: 'states', label: 'Premuto · velo', default: '#00000014', description: 'Velo sopra la superficie durante la pressione. Con Solid lo stato premuto è del materiale.' },
  { type: 'color', path: 'states.focus.style.color', section: 'states', label: 'Focus · colore anello', default: '#7a2fb8', description: 'Anello di focus visibile da tastiera.' },
  num('states.focus.style.width', 'states', 'Focus · spessore', 'px', 1, 4, 0.5, 2, 'Spessore dell’anello di focus.'),
  num('states.focus.style.offset', 'states', 'Focus · distanza', 'px', -4, 6, 1, 2, 'Distanza dell’anello dal bordo (positiva: fuori).'),
  num('states.disabled.style.opacity', 'states', 'Disabilitato · opacità', '', 0.1, 1, 0.05, 0.4, 'Opacità del pulsante disabilitato. Con Solid lo stato disabilitato è del materiale.'),

  { type: 'enum', path: 'interactions.behavior.semantics', section: 'interactions', label: 'Elemento', options: opts(['action', 'Azione · <button>'], ['link', 'Navigazione · <a href>']), default: 'action', description: 'Azione: un pulsante che riporta la pressione all’applicazione. Navigazione: un collegamento vero (richiede un indirizzo) che naviga il browser.' },
  { type: 'boolean', path: 'interactions.behavior.pressFeedback', section: 'interactions', label: 'Risposta alla pressione del materiale', default: true, description: 'Il materiale risponde alla pressione (luce e scala per Glass, stato «premuto» per Solid).' },
  { type: 'text', path: 'interactions.events.press', section: 'interactions', label: 'Evento pressione', pattern: EVENT_NAME_PATTERN, maxLength: 40, default: 'jello-press', description: 'Nome del CustomEvent DOM emesso all’attivazione (clic, Invio, Spazio).' },
  { type: 'text', path: 'interactions.events.hover', section: 'interactions', label: 'Evento hover', pattern: EVENT_NAME_PATTERN, maxLength: 40, default: 'jello-hover', description: 'Nome del CustomEvent emesso quando il puntatore entra (non da tocco).' },
  { type: 'text', path: 'interactions.events.focus', section: 'interactions', label: 'Evento focus', pattern: EVENT_NAME_PATTERN, maxLength: 40, default: 'jello-focus', description: 'Nome del CustomEvent emesso quando il pulsante riceve il focus.' },
];

export const BUTTON_FIELD_INDEX: Readonly<Record<string, FieldDescriptor>> = Object.fromEntries(BUTTON_FIELDS.map((f) => [f.path, f]));

/** Properties a breakpoint may override. */
export const BUTTON_OVERRIDE_PATHS = ['layout.size', 'layout.widthMode', 'layout.width', 'layout.paddingX', 'layout.paddingY', 'layout.gap', 'layout.align', 'layout.iconPosition', 'style.typography.fontSize', 'style.icon.size'] as const;
export type ButtonOverridePath = (typeof BUTTON_OVERRIDE_PATHS)[number];

export const BUTTON_STATES = ['default', 'hover', 'pressed', 'focus', 'disabled'] as const;
export const BUTTON_TRIGGERS = ['press', 'hover', 'focus'] as const;
export const BUTTON_LABEL_MAX = 60;
export const BUTTON_BREAKPOINT_ID = /^[A-Za-z][A-Za-z0-9_-]{0,31}$/;

/**
 * Described properties that have no effect on a material family, with the
 * reason and where to change it instead. The renderer does not apply them
 * (`buttonPresentation`) and the inspector, the export and the tests read this
 * same list: a property is never ignored without being listed.
 */
export const BUTTON_UNSUPPORTED: Readonly<Record<string, readonly { path: string; reason: string }[]>> = {
  glass: [],
  solid: [
    { path: 'style.colors.primary', reason: 'Con Solid il colore del contenuto è del materiale: si cambia in Materiale → «Colore del contenuto».' },
    { path: 'style.colors.secondary', reason: 'Con Solid il colore del contenuto è del materiale: si cambia in Materiale → «Colore del contenuto».' },
    { path: 'states.hover.style.background', reason: 'Solid rende da sé lo stato hover: si cambia in Materiale → Stati → Hover.' },
    { path: 'states.pressed.style.background', reason: 'Solid rende da sé lo stato premuto: si cambia in Materiale → Stati → Premuto.' },
    { path: 'states.disabled.style.opacity', reason: 'Solid rende da sé lo stato disabilitato: si cambia in Materiale → Stati → Disabilitato.' },
  ],
};

// ---------------------------------------------------------------------------
// Sections of the definition
// ---------------------------------------------------------------------------

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const obj = (v: unknown): Record<string, unknown> => (isObj(v) ? v : {});

export interface ButtonCheck {
  sections: NavbarSections;
}

/**
 * Validates the button sections of a raw definition. Same policy as every
 * format: a missing value takes its default (warning), an invalid one refuses
 * the document, an unknown key is dropped (warning).
 */
export function checkButtonSections(
  raw: { layout?: unknown; responsive?: unknown; style?: unknown; states?: unknown; interactions?: unknown },
  content: Readonly<Record<string, NodeContent>>,
  errors: string[],
  warnings: string[],
): ButtonCheck | null {
  const before = errors.length;
  for (const k of ['layout', 'responsive', 'style', 'states', 'interactions'] as const) {
    if (raw[k] !== undefined && !isObj(raw[k])) errors.push(`${k}: atteso un oggetto`);
  }
  const states = obj(raw.states);
  const inter = obj(raw.interactions);
  // Only the component's own part of each state is described here; `material` overrides belong to the family.
  const wrapper = {
    layout: raw.layout,
    style: raw.style,
    states: Object.fromEntries((['hover', 'pressed', 'focus', 'disabled'] as const).map((s) => [s, { style: obj(states[s]).style }])),
    interactions: { behavior: inter.behavior, events: inter.events },
  };
  const f = checkFields(wrapper, BUTTON_FIELDS, '');
  errors.push(...f.errors);
  warnings.push(...f.warnings);

  const resp = obj(raw.responsive);
  for (const k of Object.keys(resp)) if (k !== 'breakpoints') warnings.push(`responsive.${k}: proprietà sconosciuta, ignorata`);
  const breakpoints: { id: string; maxWidth: number; overrides: Record<string, number | string> }[] = [];
  if (resp.breakpoints === undefined) warnings.push('responsive.breakpoints: assente, nessun breakpoint');
  else if (!Array.isArray(resp.breakpoints)) errors.push('responsive.breakpoints: atteso un elenco');
  else {
    const seen = new Set<string>();
    resp.breakpoints.forEach((b: unknown, i: number) => {
      const at = `responsive.breakpoints.${i}`;
      if (!isObj(b)) return void errors.push(`${at}: atteso un oggetto`);
      if (typeof b.id !== 'string' || !BUTTON_BREAKPOINT_ID.test(b.id)) errors.push(`${at}.id: identificatore non valido`);
      else if (seen.has(b.id)) errors.push(`${at}.id: "${b.id}" duplicato`);
      else seen.add(b.id);
      if (typeof b.maxWidth !== 'number' || !(b.maxWidth >= 100 && b.maxWidth <= 2000)) errors.push(`${at}.maxWidth: atteso un numero tra 100 e 2000`);
      const overrides: Record<string, number | string> = {};
      if (!isObj(b.overrides)) errors.push(`${at}.overrides: atteso un oggetto`);
      else {
        for (const [k, v] of Object.entries(b.overrides)) {
          if (!(BUTTON_OVERRIDE_PATHS as readonly string[]).includes(k)) {
            warnings.push(`${at}.overrides.${k}: non sovrascrivibile da un breakpoint, ignorato`);
            continue;
          }
          const e = checkField(BUTTON_FIELD_INDEX[k]!, v);
          if (e) errors.push(`${at}.overrides.${k}: ${e.split(': ').slice(1).join(': ')}`);
          else overrides[k] = v as number | string;
        }
      }
      if (typeof b.id === 'string' && typeof b.maxWidth === 'number') breakpoints.push({ id: b.id, maxWidth: b.maxWidth, overrides });
    });
  }

  // A link is a real link: it needs somewhere to go. An action has nowhere to go, so an address would never be used.
  const semantics = getPath(f.value, 'interactions.behavior.semantics');
  const href = content.root?.href;
  if (semantics === 'link' && !href) errors.push('interactions.behavior.semantics: «link» richiede content.root.href');
  if (semantics === 'action' && href) warnings.push('content.root.href: un pulsante di azione non naviga, indirizzo ignorato (usa semantics «link»)');
  if (errors.length > before) return null;

  const v = f.value as Record<string, any>;
  return {
    sections: {
      layout: v.layout,
      responsive: { breakpoints },
      style: v.style,
      stateStyles: { hover: v.states.hover.style, pressed: v.states.pressed.style, focus: v.states.focus.style, disabled: v.states.disabled.style },
      behavior: v.interactions.behavior,
      events: v.interactions.events,
    },
  };
}

/** A button definition with every described property at its default. */
export function withButtonDefaults(def: ComponentDefinition): ComponentDefinition {
  const errors: string[] = [];
  const c = checkButtonSections({}, def.content, errors, []);
  if (!c) throw new Error(`Valori iniziali del pulsante non validi: ${errors.join('; ')}`);
  const states: ComponentDefinition['states'] = { ...def.states };
  for (const [k, v] of Object.entries(c.sections.stateStyles)) states[k as keyof typeof states] = { ...states[k as keyof typeof states], style: v! };
  return {
    ...def,
    layout: c.sections.layout,
    responsive: c.sections.responsive,
    style: c.sections.style,
    states,
    interactions: { behavior: c.sections.behavior, events: c.sections.events as Record<string, string> },
  };
}

// ---------------------------------------------------------------------------
// Resolved properties (what the renderer reads)
// ---------------------------------------------------------------------------

export interface ButtonProps {
  text: string;
  icon: IconRef | null;
  semantics: ButtonSemantics;
  href: string | null;
  value: string | null;
  disabled: boolean;
  layout: {
    size: ButtonSize;
    widthMode: 'hug' | 'fill' | 'fixed';
    width: number;
    paddingX: number;
    paddingY: number;
    gap: number;
    radius: number | 'capsule';
    align: 'start' | 'center' | 'end';
    iconPosition: 'start' | 'end';
  };
  style: {
    variant: ButtonVariant;
    colors: Record<ButtonVariant, string>;
    typography: { fontFamily: 'system' | 'inherit'; fontSize: number; fontWeight: number; letterSpacing: number };
    icon: { size: number; strokeWidth: number };
  };
  states: {
    hover: { background: string };
    pressed: { background: string };
    focus: { color: string; width: number; offset: number };
    disabled: { opacity: number };
  };
  pressFeedback: boolean;
  events: { press: string; hover: string; focus: string };
  /** Breakpoint in effect (the narrowest one that matches), or null. */
  breakpoint: string | null;
}

interface Breakpoint {
  id: string;
  maxWidth: number;
  overrides: Record<string, number | string>;
}

export const buttonBreakpoints = (def: Pick<ComponentDefinition, 'responsive'>): Breakpoint[] => ((obj(def.responsive).breakpoints ?? []) as Breakpoint[]).map((b) => ({ id: b.id, maxWidth: b.maxWidth, overrides: { ...b.overrides } }));

/** The button's own icon and label nodes. */
export function buttonNodes(def: Pick<ComponentDefinition, 'structure'>): { iconId: string | null; labelId: string } {
  const kids = def.structure.children ?? [];
  return { iconId: kids.find((n) => n.role === 'icon')?.id ?? null, labelId: kids.find((n) => n.role === 'label')?.id ?? 'label' };
}

/**
 * Properties in effect at a container width: every breakpoint whose maxWidth
 * is ≥ width applies, from the widest to the narrowest (the narrowest wins).
 * Pure, so the editor, the DOM renderer and the tests agree.
 */
export function resolveButton(def: ComponentDefinition, containerWidth: number): ButtonProps {
  let sections: Record<string, unknown> = { layout: def.layout, style: def.style };
  const active = buttonBreakpoints(def)
    .filter((b) => containerWidth <= b.maxWidth)
    .sort((a, b) => b.maxWidth - a.maxWidth);
  for (const bp of active) for (const [k, v] of Object.entries(bp.overrides)) sections = setPath(sections, k, v);
  const nodes = buttonNodes(def);
  const root = def.content.root ?? {};
  const at = (path: string) => getPath(def, path);
  const style = sections.style as ButtonProps['style'] & { colors: ButtonProps['style']['colors'] };
  return {
    text: def.content[nodes.labelId]?.text ?? '',
    icon: nodes.iconId ? (def.content[nodes.iconId]?.icon ?? null) : null,
    semantics: (at('interactions.behavior.semantics') as ButtonSemantics) ?? 'action',
    href: root.href ?? null,
    value: root.value ?? null,
    disabled: root.disabled ?? false,
    layout: sections.layout as ButtonProps['layout'],
    style,
    states: {
      hover: { background: at('states.hover.style.background') as string },
      pressed: { background: at('states.pressed.style.background') as string },
      focus: { color: at('states.focus.style.color') as string, width: at('states.focus.style.width') as number, offset: at('states.focus.style.offset') as number },
      disabled: { opacity: at('states.disabled.style.opacity') as number },
    },
    pressFeedback: (at('interactions.behavior.pressFeedback') as boolean) ?? true,
    events: { press: at('interactions.events.press') as string, hover: at('interactions.events.hover') as string, focus: at('interactions.events.focus') as string },
    breakpoint: active.length ? active[active.length - 1]!.id : null,
  };
}

// ---------------------------------------------------------------------------
// Presentation: what the renderer writes to the DOM, as data
// ---------------------------------------------------------------------------

export interface ButtonPresentation {
  /** `a` for navigation, `button` for actions. A disabled link is still an `a`, without `href`. */
  tag: 'a' | 'button';
  attrs: Record<string, string>;
  vars: Record<string, string>;
}

const FONT_STACK = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

/**
 * Every visual decision of the button for a material family, as attributes
 * and CSS variables. `runtime/button.ts` writes exactly this; properties the
 * family does not support (`BUTTON_UNSUPPORTED`) are not written, which is
 * what makes "ignored" something a test can observe.
 */
export function buttonPresentation(p: ButtonProps, family: string): ButtonPresentation {
  const L = p.layout;
  const S = p.style;
  const unsupported = new Set((BUTTON_UNSUPPORTED[family] ?? []).map((u) => u.path));
  const vars: Record<string, string> = {
    '--jbtn-min-height': `${BUTTON_SIZES[L.size]}px`,
    '--jbtn-width': `${L.width}px`,
    '--jbtn-pad-x': `${L.paddingX}px`,
    '--jbtn-pad-y': `${L.paddingY}px`,
    '--jbtn-gap': `${L.gap}px`,
    '--jbtn-radius': L.radius === 'capsule' ? '9999px' : `${L.radius}px`,
    '--jbtn-font-family': S.typography.fontFamily === 'system' ? FONT_STACK : 'inherit',
    '--jbtn-font-size': `${S.typography.fontSize}px`,
    '--jbtn-font-weight': String(S.typography.fontWeight),
    '--jbtn-letter-spacing': `${S.typography.letterSpacing}px`,
    '--jbtn-icon': `${S.icon.size}px`,
    '--jbtn-stroke': String(S.icon.strokeWidth),
    '--jbtn-focus': p.states.focus.color,
    '--jbtn-focus-width': `${p.states.focus.width}px`,
    '--jbtn-focus-offset': `${p.states.focus.offset}px`,
  };
  const optional: [string, string, string][] = [
    ['style.colors.primary', '--jbtn-color-primary', S.colors.primary],
    ['style.colors.secondary', '--jbtn-color-secondary', S.colors.secondary],
    ['style.colors.ghost', '--jbtn-color-ghost', S.colors.ghost],
    ['states.hover.style.background', '--jbtn-hover', p.states.hover.background],
    ['states.pressed.style.background', '--jbtn-press', p.states.pressed.background],
    ['states.disabled.style.opacity', '--jbtn-disabled', String(p.states.disabled.opacity)],
  ];
  for (const [path, name, value] of optional) if (!unsupported.has(path)) vars[name] = value;
  return {
    tag: p.semantics === 'link' ? 'a' : 'button',
    attrs: {
      'data-variant': S.variant,
      'data-size': L.size,
      'data-width': L.widthMode,
      'data-align': L.align,
      'data-icon-position': L.iconPosition,
      'data-has-icon': String(p.icon !== null && p.icon.kind !== 'none'),
      'data-material': family,
    },
    vars,
  };
}

// ---------------------------------------------------------------------------
// Editing (immutable: every function returns a new definition)
// ---------------------------------------------------------------------------

/** Sets one described property (canonical path). Invalid values are refused (null) instead of applied. */
export function setButtonField(def: ComponentDefinition, path: string, value: unknown): ComponentDefinition | null {
  const f = BUTTON_FIELD_INDEX[path];
  if (!f || checkField(f, value)) return null;
  return setPath(def, path, f.type === 'color' ? String(value).toLowerCase() : value);
}

export function getButtonField(def: ComponentDefinition, path: string): unknown {
  return getPath(def, path);
}

const withContent = (def: ComponentDefinition, id: string, c: NodeContent | null): Record<string, NodeContent> => {
  const content = { ...def.content };
  if (c === null) delete content[id];
  else content[id] = c;
  return content;
};

/** The label of the button (1–60 characters after trimming); refused (null) otherwise. */
export function setButtonText(def: ComponentDefinition, text: string): ComponentDefinition | null {
  const t = text.trim();
  if (!t || t.length > BUTTON_LABEL_MAX) return null;
  return { ...def, content: withContent(def, buttonNodes(def).labelId, { text: t }) };
}

/** Sets the icon, or removes it (`null` or `{ kind: 'none' }`): the icon node leaves the structure with it. */
export function setButtonIcon(def: ComponentDefinition, icon: IconRef | null): ComponentDefinition {
  const { iconId, labelId } = buttonNodes(def);
  if (!icon || icon.kind === 'none') {
    if (!iconId) return def;
    return { ...def, structure: { ...def.structure, children: (def.structure.children ?? []).filter((n) => n.id !== iconId) }, content: withContent(def, iconId, null) };
  }
  if (iconId) return { ...def, content: withContent(def, iconId, { icon }) };
  const node: StructureNode = { id: labelId === 'icon' ? 'icon-1' : 'icon', role: 'icon' };
  return { ...def, structure: { ...def.structure, children: [node, ...(def.structure.children ?? [])] }, content: withContent(def, node.id, { icon }) };
}

/** `link` needs an address: without one the change is refused (null). Switching to `action` keeps no address. */
export function setButtonLink(def: ComponentDefinition, semantics: ButtonSemantics, href?: string | null): ComponentDefinition | null {
  const root = { ...def.content.root };
  if (semantics === 'action') delete root.href;
  else {
    const h = href ?? root.href ?? '';
    if (!/^(\/|#|https?:\/\/)[^\s]*$/.test(h) || h.length > 2048) return null;
    root.href = h;
  }
  const next = setPath(def, 'interactions.behavior.semantics', semantics);
  return { ...next, content: { ...next.content, root } };
}

export function setButtonDisabled(def: ComponentDefinition, disabled: boolean): ComponentDefinition {
  const root = { ...def.content.root };
  if (disabled) root.disabled = true;
  else delete root.disabled;
  return { ...def, content: { ...def.content, root } };
}

export function setButtonValue(def: ComponentDefinition, value: string | null): ComponentDefinition | null {
  if (value !== null && value.length > 200) return null;
  const root = { ...def.content.root };
  if (value === null || value === '') delete root.value;
  else root.value = value;
  return { ...def, content: { ...def.content, root } };
}

const uniqueBreakpointId = (base: string, taken: Iterable<string>): string => {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) if (!used.has(`${base}-${n}`)) return `${base}-${n}`;
};

export function addButtonBreakpoint(def: ComponentDefinition, maxWidth = 360): { def: ComponentDefinition; id: string } {
  const list = buttonBreakpoints(def);
  const id = uniqueBreakpointId(`bp-${maxWidth}`, list.map((b) => b.id));
  return { def: { ...def, responsive: { ...def.responsive, breakpoints: [...list, { id, maxWidth, overrides: {} }] } }, id };
}

export function updateButtonBreakpoint(def: ComponentDefinition, id: string, patch: { maxWidth?: number; set?: [ButtonOverridePath, number | string | null] }): ComponentDefinition {
  const breakpoints = buttonBreakpoints(def).map((b) => {
    if (b.id !== id) return b;
    const overrides = { ...b.overrides };
    if (patch.set) {
      const [k, v] = patch.set;
      if (v === null) delete overrides[k];
      else if (!checkField(BUTTON_FIELD_INDEX[k]!, v)) overrides[k] = v;
    }
    const maxWidth = patch.maxWidth !== undefined && patch.maxWidth >= 100 && patch.maxWidth <= 2000 ? patch.maxWidth : b.maxWidth;
    return { ...b, maxWidth, overrides };
  });
  return { ...def, responsive: { ...def.responsive, breakpoints } };
}

export function removeButtonBreakpoint(def: ComponentDefinition, id: string): ComponentDefinition {
  return { ...def, responsive: { ...def.responsive, breakpoints: buttonBreakpoints(def).filter((b) => b.id !== id) } };
}
