/**
 * BottomNavigation on the DOM: the renderer of a `jello-component` document
 * of type bottom-navigation. Framework-independent; the lab's preview, the
 * builder and the exported React component all run this class.
 *
 *   nav.jello-bnav                 host: one material surface for the whole bar
 *     span.jello-surface           added by the material group
 *     div.jello-bnav-track         tabs (scrolls horizontally on overflow)
 *       span.jello-bnav-indicator  selection layer, moved with a CSS transition (not a second lens)
 *       button.jello-bnav-tab × n  icon + label, never filtered or scaled
 *
 * Material: the bar gets its surface from a MaterialGroup (src/runtime/materials.ts),
 * either shared by the host (`group`) or created here from `config.material`
 * over `source`. Without a source the group runs on the CSS backend.
 *
 * Selection is persistent (aria-current / aria-selected); press is transient
 * (data-pressed + press light on the surface) and never selects by itself.
 * Controlled mode: the bar reports `change` and waits for setActiveTab().
 */

import './bottom-navigation.css';
import type { GlassSurface } from '../core/surface';
import { glassParams } from '../model/document';
import type { BackendRequest } from '../model/support';
import type { ComponentDocument } from '../components/document';
import { iconTree, type SvgNode } from '../components/icons';
import { resolveRoot, tabStyle, type BnLayout, type BnRoot, type BnTab } from '../components/bottom-navigation/model';
import { createMaterialGroup, type MaterialGroup } from './materials';

export interface BottomNavigationEvent {
  tabId: string;
  previous: string | null;
  value: string | null;
  index: number;
  trigger: 'pointer' | 'keyboard' | 'api';
}

export type PreviewState = 'hover' | 'pressed' | 'focus';

export interface BottomNavigationOptions {
  /** Element the <nav> is appended to. */
  container: HTMLElement;
  config: ComponentDocument;
  /** GlassSource: opaque element behind the bar whose content may be refracted. */
  source?: HTMLElement | null;
  /** Shared material group (not destroyed by this component). Wins over `source`. */
  group?: MaterialGroup;
  /** Element scrolled by wheel input over the bar (interactions.wheelForward). */
  scroller?: HTMLElement | null;
  /** Initial active tab (default: config.root.defaultTab). */
  activeTab?: string | null;
  /** True: clicks only report `change`; the host calls setActiveTab(). */
  controlled?: boolean;
  /** Accessible name; overrides root.label. */
  label?: string;
  /** Overrides layout.anchor (the editor previews inside a frame). */
  anchor?: BnLayout['anchor'];
  /** Backend for the group created here (default: the material's target). */
  backend?: BackendRequest;
  /** Extra class names, e.g. to keep an existing stylesheet. */
  classNames?: Partial<Record<'root' | 'tab' | 'label' | 'icon' | 'indicator', string>>;
  onChange?(tabId: string, e: BottomNavigationEvent): void;
  onTabPress?(tabId: string, e: BottomNavigationEvent): void;
  onReselect?(tabId: string, e: BottomNavigationEvent): void;
}

export interface BottomNavigationStatus {
  material: MaterialGroup['status'];
  breakpoint: string | null;
  overflowing: boolean;
  activeTab: string;
  reasons: string[];
}

interface TabView {
  el: HTMLButtonElement;
  icon: SVGSVGElement | null;
  label: HTMLSpanElement;
  iconKey: string;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const PRESS_KEYS = new Set([' ', 'Enter']);
const EASING = { spring: 'cubic-bezier(0.3, 1.2, 0.4, 1)', ease: 'cubic-bezier(0.2, 0.8, 0.2, 1)', none: 'linear' } as const;

export class BottomNavigation {
  readonly host: HTMLElement;
  readonly track: HTMLDivElement;
  readonly indicator: HTMLSpanElement;
  private config: ComponentDocument;
  private effective: BnRoot;
  private breakpoint: string | null = null;
  private readonly options: BottomNavigationOptions;
  private readonly group: MaterialGroup;
  private readonly ownsGroup: boolean;
  private readonly reasons: string[] = [];
  private readonly tabs = new Map<string, TabView>();
  private surface: GlassSurface | null = null;
  private surfaceRadius: number | 'capsule' | null = null;
  private active: string;
  private pressedTab: HTMLButtonElement | null = null;
  private pointer: number | null = null;
  private overflowing = false;
  private interactive = true;
  private appliedKey = '';
  private cleanups: (() => void)[] = [];
  private readonly lifetime: (() => void)[] = [];
  private destroyed = false;

  constructor(options: BottomNavigationOptions) {
    this.options = options;
    this.config = options.config;
    this.effective = options.config.root;
    const doc = options.container.ownerDocument;
    if (options.group) {
      this.group = options.group;
      this.ownsGroup = false;
    } else {
      const source = options.source ?? null;
      if (!source) this.reasons.push('Nessuna GlassSource indicata: superficie su backdrop-filter (CSS), senza rifrazione');
      this.group = createMaterialGroup({
        source: source ?? options.container,
        material: options.config.material.document,
        ...(source ? (options.backend ? { backend: options.backend } : {}) : { backend: 'css' as const }),
      });
      this.ownsGroup = true;
    }
    this.host = doc.createElement('nav');
    this.host.className = cls('jello-bnav', options.classNames?.root);
    this.host.hidden = true;
    this.track = doc.createElement('div');
    this.track.className = 'jello-bnav-track';
    this.indicator = doc.createElement('span');
    this.indicator.className = cls('jello-bnav-indicator', options.classNames?.indicator);
    this.indicator.setAttribute('aria-hidden', 'true');
    this.track.append(this.indicator);
    this.host.append(this.track);
    options.container.append(this.host);
    const first = options.activeTab ?? options.config.root.defaultTab;
    this.active = options.config.root.children.some((t) => t.id === first) ? first : options.config.root.defaultTab;
    this.host.toggleAttribute('data-motion-reduced', this.group.status.motionReduced);
    this.lifetime.push(this.group.onStatus((s) => this.host.toggleAttribute('data-motion-reduced', s.motionReduced)));
    this.render(true);
  }

  // ---------- public API ----------

  get component(): ComponentDocument {
    return this.config;
  }

  get activeTab(): string {
    return this.active;
  }

  get pressed(): string | null {
    return this.pressedTab?.dataset.tab ?? null;
  }

  get glassSurface(): GlassSurface | null {
    return this.surface;
  }

  get materialGroup(): MaterialGroup {
    return this.group;
  }

  get mounted(): boolean {
    return this.surface !== null;
  }

  get status(): BottomNavigationStatus {
    const material = this.group.status;
    return { material, breakpoint: this.breakpoint, overflowing: this.overflowing, activeTab: this.active, reasons: [...this.reasons, ...material.reasons] };
  }

  /** Element of the root (`root`) or of a tab, for hosts that highlight or measure it. */
  elementFor(id: string): HTMLElement | null {
    return id === 'root' ? this.host : (this.tabs.get(id)?.el ?? null);
  }

  /** Shows the bar, attaches its surface and binds input. Idempotent. */
  mount(): void {
    if (this.surface || this.destroyed) return;
    this.host.hidden = false;
    this.attachSurface();
    this.bind();
    this.render(true);
    this.placeIndicator(false);
  }

  /** Releases the surface (its lens leaves the filter) and every listener; hides the bar. */
  unmount(): void {
    if (!this.surface) return;
    this.release();
    for (const c of this.cleanups.splice(0)) c();
    this.detachSurface();
    this.host.hidden = true;
  }

  /** New configuration (same component). The surface is re-created only if its shape changes. */
  update(config: ComponentDocument): void {
    const materialChanged = config.material.document !== this.config.material.document;
    this.config = config;
    if (!config.root.children.some((t) => t.id === this.active)) this.active = config.root.defaultTab;
    if (materialChanged && this.ownsGroup) this.group.setMaterial(config.material.document);
    this.render(false);
    this.placeIndicator(false);
  }

  /** Material only (a shared group is updated by its owner). */
  setMaterial(): void {
    this.applyLight();
  }

  setActiveTab(id: string, animate = true): void {
    if (id === this.active || !this.config.root.children.some((t) => t.id === id)) return;
    this.active = id;
    this.applySelection();
    this.placeIndicator(animate);
  }

  /** False: pointer and keyboard input are ignored (the editor's selection mode). */
  setInteractive(on: boolean): void {
    this.interactive = on;
    if (!on) this.release();
    this.host.toggleAttribute('data-inert-preview', !on);
  }

  /** Shows a state on one tab without input (editor). null clears it. */
  previewState(tabId: string | null, state: PreviewState | null): void {
    for (const [id, t] of this.tabs) {
      if (id === tabId && state) t.el.dataset.previewState = state;
      else delete t.el.dataset.previewState;
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.unmount();
    this.destroyed = true;
    for (const c of this.lifetime.splice(0)) c();
    this.host.remove();
    if (this.ownsGroup) this.group.destroy();
  }

  // ---------- rendering ----------

  /** Box the bar is laid out in: its containing block (container anchor) or first ancestor with a box. */
  private layoutParent(): HTMLElement {
    const anchor = this.options.anchor ?? this.config.root.layout.anchor;
    if (anchor === 'container' && this.host.offsetParent instanceof HTMLElement) return this.host.offsetParent;
    let el: HTMLElement | null = this.options.container;
    const win = this.host.ownerDocument.defaultView;
    while (el && win && win.getComputedStyle(el).display === 'contents') el = el.parentElement;
    return el ?? this.options.container;
  }

  /** Width the responsive breakpoints are evaluated against. */
  private containerWidth(): number {
    const anchor = this.options.anchor ?? this.config.root.layout.anchor;
    if (anchor === 'viewport') return this.host.ownerDocument.defaultView?.innerWidth ?? this.options.container.clientWidth;
    return this.layoutParent().clientWidth;
  }

  private render(force: boolean) {
    const { root, breakpoint } = resolveRoot(this.config.root, this.containerWidth());
    this.effective = root;
    this.breakpoint = breakpoint;
    const key = JSON.stringify([root.layout, root.appearance, root.typography, root.icon, root.states, root.motion, root.responsive.overflow, root.responsive.minTabWidth, root.semantics, this.options.label ?? root.label, breakpoint]);
    if (force || key !== this.appliedKey) {
      this.appliedKey = key;
      this.applyRoot(root);
    }
    this.renderTabs(root);
    this.applySelection();
    this.applyLight();
    if (this.surface && this.radius() !== this.surfaceRadius) {
      this.detachSurface();
      this.attachSurface();
    }
    this.checkOverflow();
  }

  private applyRoot(r: BnRoot) {
    const h = this.host;
    const L = r.layout;
    const docked = L.placement === 'docked';
    h.setAttribute('aria-label', this.options.label ?? r.label);
    const d = h.dataset;
    d.anchor = this.options.anchor ?? L.anchor;
    d.placement = L.placement;
    d.align = L.align;
    d.width = L.widthMode;
    d.itemLayout = L.itemLayout;
    d.labels = L.labels;
    d.indicator = r.appearance.indicator.style;
    d.textShadow = String(r.appearance.textShadow);
    d.font = r.typography.fontFamily;
    d.overflow = r.responsive.overflow;
    d.motion = r.motion.indicator;
    d.semantics = r.semantics;
    if (this.breakpoint) d.breakpoint = this.breakpoint;
    else delete d.breakpoint;
    this.track.setAttribute('role', r.semantics === 'tabs' ? 'tablist' : 'presentation');
    if (r.semantics === 'tabs') this.track.setAttribute('aria-label', this.options.label ?? r.label);
    else this.track.removeAttribute('aria-label');
    const vars: Record<string, string> = {
      '--jbn-width': `${L.width}px`,
      '--jbn-max-width': `${L.maxWidth}px`,
      '--jbn-height': `${L.height}px`,
      '--jbn-padding': `${L.padding}px`,
      '--jbn-gap': `${L.gap}px`,
      '--jbn-radius': docked ? '0px' : L.radius === 'capsule' ? '9999px' : `${L.radius}px`,
      '--jbn-offset': docked ? '0px' : `${L.offset}px`,
      '--jbn-fg': r.appearance.foreground,
      '--jbn-indicator': r.appearance.indicator.color,
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
    for (const [k, v] of Object.entries(vars)) h.style.setProperty(k, v);
  }

  private renderTabs(root: BnRoot) {
    const doc = this.host.ownerDocument;
    const wanted = new Set(root.children.map((t) => t.id));
    for (const [id, t] of this.tabs) {
      if (wanted.has(id)) continue;
      if (this.pressedTab === t.el) this.release();
      t.el.remove();
      this.tabs.delete(id);
    }
    root.children.forEach((tab, i) => {
      let view = this.tabs.get(tab.id);
      if (!view) {
        const el = doc.createElement('button');
        el.type = 'button';
        el.className = cls('jello-bnav-tab', this.options.classNames?.tab);
        el.dataset.tab = tab.id;
        const label = doc.createElement('span');
        label.className = cls('jello-bnav-label', this.options.classNames?.label);
        el.append(label);
        view = { el, icon: null, label, iconKey: '' };
        this.tabs.set(tab.id, view);
      }
      this.updateTab(view, tab, root);
      const at = this.track.children[i + 1] ?? null;
      if (at !== view.el) this.track.insertBefore(view.el, at);
    });
  }

  private updateTab(view: TabView, tab: BnTab, root: BnRoot) {
    const el = view.el;
    if (view.label.textContent !== tab.label) view.label.textContent = tab.label;
    const iconKey = JSON.stringify(tab.icon);
    if (iconKey !== view.iconKey) {
      view.icon?.remove();
      view.icon = renderIcon(el.ownerDocument, tab, this.options.classNames?.icon);
      if (view.icon) el.prepend(view.icon);
      view.iconKey = iconKey;
    }
    if (tab.disabled) el.setAttribute('aria-disabled', 'true');
    else el.removeAttribute('aria-disabled');
    if (tab.value !== null) el.dataset.value = tab.value;
    else delete el.dataset.value;
    const s = tabStyle(root, tab);
    const set = (k: string, v: string | null) => (v === null ? el.style.removeProperty(k) : el.style.setProperty(k, v));
    set('--jbn-tab-icon', tab.style.iconSize !== null ? `${s.iconSize}px` : null);
    set('--jbn-tab-font-size', tab.style.fontSize !== null ? `${s.fontSize}px` : null);
    set('--jbn-tab-font-weight', tab.style.fontWeight !== null ? String(s.fontWeight) : null);
    set('--jbn-tab-letter-spacing', tab.style.letterSpacing !== null ? `${s.letterSpacing}px` : null);
  }

  private applySelection() {
    const tabs = this.effective.semantics === 'tabs';
    for (const [id, t] of this.tabs) {
      const on = id === this.active;
      t.el.toggleAttribute('data-active', on);
      if (tabs) {
        t.el.setAttribute('role', 'tab');
        t.el.setAttribute('aria-selected', String(on));
        t.el.tabIndex = on ? 0 : -1;
        t.el.removeAttribute('aria-current');
      } else {
        t.el.removeAttribute('role');
        t.el.removeAttribute('aria-selected');
        t.el.removeAttribute('tabindex');
        if (on) t.el.setAttribute('aria-current', 'page');
        else t.el.removeAttribute('aria-current');
      }
    }
  }

  /** The indicator's rim follows the material's light (read from the document, not re-rendered). */
  private applyLight() {
    const doc = this.group.material;
    if (doc.family === 'glass') this.host.style.setProperty('--jbn-light', String(glassParams(doc).light));
  }

  private checkOverflow() {
    const r = this.effective;
    const n = r.children.length;
    const needed = n * r.responsive.minTabWidth + Math.max(0, n - 1) * r.layout.gap;
    let available = this.track.clientWidth;
    if (r.layout.widthMode === 'hug') available = Math.max(0, this.containerWidth() - 2 * (r.layout.offset + r.layout.padding));
    const over = available > 0 && needed > available + 0.5;
    if (over !== this.overflowing) {
      this.overflowing = over;
      this.host.toggleAttribute('data-overflowing', over);
    }
  }

  /** Layout reads happen only on mount, resize and selection changes. */
  private placeIndicator(animate: boolean) {
    if (!this.surface) return;
    const view = this.tabs.get(this.active);
    if (!view) return;
    const s = this.indicator.style;
    if (!animate) this.indicator.setAttribute('data-instant', '');
    s.setProperty('--jbn-ind-x', `${view.el.offsetLeft}px`);
    s.setProperty('--jbn-ind-w', `${view.el.offsetWidth}px`);
    if (!animate) {
      void this.indicator.offsetWidth; // commit the jump before transitions return
      this.indicator.removeAttribute('data-instant');
    }
    if (this.overflowing && animate) view.el.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: this.host.hasAttribute('data-motion-reduced') ? 'auto' : 'smooth' });
  }

  private radius(): number | 'capsule' {
    const L = this.effective.layout;
    return L.placement === 'docked' ? 0 : L.radius;
  }

  private attachSurface() {
    this.surfaceRadius = this.radius();
    this.surface = this.group.attach(this.host, { sizing: 'element', radius: this.surfaceRadius, interaction: 'none' });
  }

  private detachSurface() {
    if (!this.surface) return;
    this.group.detach(this.surface);
    this.surface = null;
  }

  // ---------- input ----------

  private bind() {
    const h = this.host;
    const win = h.ownerDocument.defaultView;
    const ro = new ResizeObserver(() => {
      this.render(false);
      this.placeIndicator(false);
    });
    ro.observe(h);
    ro.observe(this.layoutParent());
    this.cleanups = [
      () => ro.disconnect(),
      listen(h, 'pointerdown', (e) => {
        if (!this.interactive || !e.isPrimary || e.button !== 0 || this.pointer !== null) return;
        const tab = this.tabOf(e.target);
        if (!tab || tab.getAttribute('aria-disabled') === 'true') return;
        this.pointer = e.pointerId;
        this.press(tab, relative(h, e.clientX, e.clientY), 'pointer');
      }),
      listen(h, 'pointermove', (e) => {
        if (e.pointerId === this.pointer && this.feedback()) this.surface?.setPressed(true, relative(h, e.clientX, e.clientY));
      }),
      listen(h, 'pointerup', (e) => e.pointerId === this.pointer && this.release()),
      listen(h, 'pointercancel', (e) => e.pointerId === this.pointer && this.release()),
      // Leaving the pressed tab ends the press: releasing elsewhere does not select.
      listen(h, 'pointerout', (e) => {
        if (e.pointerId !== this.pointer || !this.pressedTab) return;
        if (!this.pressedTab.contains(e.relatedTarget as Node | null)) this.release();
      }),
      listen(h, 'click', (e) => {
        if (!this.interactive) return;
        const tab = this.tabOf(e.target);
        if (tab) this.select(tab.dataset.tab!, e.detail === 0 ? 'keyboard' : 'pointer');
      }),
      listen(h, 'keydown', (e) => {
        if (!this.interactive) return;
        const tab = this.tabOf(e.target);
        if (!tab) return;
        if (PRESS_KEYS.has(e.key)) {
          if (!e.repeat && tab.getAttribute('aria-disabled') !== 'true') this.press(tab, this.centreOf(tab), 'keyboard');
          return;
        }
        const list = [...this.tabs.values()].map((t) => t.el);
        const i = list.indexOf(tab);
        const next = { ArrowLeft: i - 1, ArrowRight: i + 1, Home: 0, End: list.length - 1 }[e.key];
        if (next === undefined) return;
        e.preventDefault();
        const target = list[(next + list.length) % list.length]!;
        if (this.effective.semantics === 'tabs') {
          for (const el of list) el.tabIndex = el === target ? 0 : -1;
        }
        target.focus();
      }),
      listen(h, 'keyup', (e) => PRESS_KEYS.has(e.key) && this.release()),
      listen(h, 'focusout', () => this.release()),
      listen(
        h,
        'wheel',
        (e) => {
          const s = this.options.scroller;
          if (!s || !this.effective.interactions.wheelForward) return;
          // A horizontal gesture over an overflowing bar scrolls the tabs themselves.
          if (this.overflowing && Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
          const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? s.clientHeight : 1;
          s.scrollBy(e.deltaX * k, e.deltaY * k);
          e.preventDefault();
        },
        { passive: false },
      ),
    ];
    if (win) {
      const cancel = () => this.release();
      const resize = () => this.render(false);
      win.addEventListener('blur', cancel);
      win.addEventListener('resize', resize);
      this.cleanups.push(() => win.removeEventListener('blur', cancel), () => win.removeEventListener('resize', resize));
    }
  }

  private feedback() {
    return this.effective.interactions.pressFeedback;
  }

  private tabOf(target: EventTarget | null): HTMLButtonElement | null {
    const tab = target instanceof Element ? target.closest<HTMLButtonElement>('.jello-bnav-tab') : null;
    return tab && this.host.contains(tab) ? tab : null;
  }

  private event(id: string, trigger: BottomNavigationEvent['trigger'], previous: string | null): BottomNavigationEvent {
    const i = this.config.root.children.findIndex((t) => t.id === id);
    return { tabId: id, previous, value: this.config.root.children[i]?.value ?? null, index: i, trigger };
  }

  private emit(name: string, detail: BottomNavigationEvent) {
    this.host.dispatchEvent(new CustomEvent(name, { detail, bubbles: true }));
  }

  private press(tab: HTMLButtonElement, point: { x: number; y: number }, trigger: BottomNavigationEvent['trigger']) {
    if (this.pressedTab && this.pressedTab !== tab) this.pressedTab.removeAttribute('data-pressed');
    this.pressedTab = tab;
    tab.setAttribute('data-pressed', '');
    if (this.feedback()) this.surface?.setPressed(true, point);
    const e = this.event(tab.dataset.tab!, trigger, this.active);
    this.options.onTabPress?.(e.tabId, e);
    this.emit(this.effective.interactions.events.press, e);
  }

  private release() {
    this.pointer = null;
    this.pressedTab?.removeAttribute('data-pressed');
    this.pressedTab = null;
    this.surface?.setPressed(false);
  }

  private select(id: string, trigger: BottomNavigationEvent['trigger']) {
    const tab = this.config.root.children.find((t) => t.id === id);
    if (!tab || tab.disabled) return;
    const e = this.event(id, trigger, this.active);
    if (id === this.active) {
      if (this.effective.interactions.reselect === 'event') {
        this.options.onReselect?.(id, e);
        this.emit(this.effective.interactions.events.reselect, e);
      }
      return;
    }
    if (!this.options.controlled) this.setActiveTab(id);
    this.options.onChange?.(id, e);
    this.emit(this.effective.interactions.events.change, e);
  }

  private centreOf(el: HTMLElement) {
    const r = el.getBoundingClientRect();
    return relative(this.host, r.left + r.width / 2, r.top + r.height / 2);
  }
}

export function createBottomNavigation(options: BottomNavigationOptions): BottomNavigation {
  const nav = new BottomNavigation(options);
  nav.mount();
  return nav;
}

function renderIcon(doc: Document, tab: BnTab, extra: string | undefined): SVGSVGElement | null {
  const tree = iconTree(tab.icon);
  if (!tree) return null;
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', cls('jello-bnav-icon', extra));
  svg.setAttribute('viewBox', tree.viewBox);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.dataset.paint = tree.paint;
  const add = (parent: Element, nodes: readonly SvgNode[]) => {
    for (const n of nodes) {
      const el = doc.createElementNS(SVG_NS, n.tag);
      for (const [k, v] of n.attrs) el.setAttribute(k, v);
      add(el, n.children);
      parent.append(el);
    }
  };
  add(svg, tree.nodes);
  return svg;
}

const cls = (base: string, extra: string | undefined) => (extra ? `${base} ${extra}` : base);

function listen<K extends keyof HTMLElementEventMap>(el: HTMLElement, type: K, fn: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions): () => void {
  el.addEventListener(type, fn, opts);
  return () => el.removeEventListener(type, fn, opts);
}

function relative(el: HTMLElement, x: number, y: number) {
  const r = el.getBoundingClientRect();
  return {
    x: r.width ? Math.min(1, Math.max(0, (x - r.left) / r.width)) : 0.5,
    y: r.height ? Math.min(1, Math.max(0, (y - r.top) / r.height)) : 0.5,
  };
}
