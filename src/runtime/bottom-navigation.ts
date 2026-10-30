/**
 * BottomNavigation on the DOM: the renderer of a `jello-component-definition`
 * of type `mobile-navbar`. Reads the derived view (`navbarView`), never a
 * second stored model. Framework-independent; the lab's preview, the
 * builder and the exported React component all run this class.
 *
 *   nav.jello-bnav                 host: one material surface for the whole bar
 *     span.jello-surface           added by the material group
 *     div.jello-bnav-track         tabs (scrolls horizontally on overflow)
 *       span.jello-bnav-indicator  selection layer, moved with a CSS transition (not a second lens)
 *       button.jello-bnav-tab × n  icon + label, never filtered or scaled
 *
 * Material: the bar gets its surface through a MaterialBinding (surface-binding.ts),
 * which uses a group shared by the host (`group`, Glass) or creates the group of
 * the definition's family: Glass over `source` (without one it runs on the CSS
 * backend) or Solid. Changing the family in `update()` replaces the group and
 * keeps the bar, its tabs and its state.
 *
 * Selection is persistent (aria-current / aria-selected); press is transient
 * (data-pressed + press light on the surface) and never selects by itself.
 * Controlled mode: the bar reports `change` and waits for setActiveTab().
 */

import './bottom-navigation.css';
import type { GlassSurface } from '../core/surface';
import { glassParams } from '../model/document';
import type { BackendRequest } from '../model/support';
import { resolveDefinitionMaterial, type ComponentDefinition } from '../components/definition';
import { unsupportedProperties } from '../components/registry';
import { iconTree, type SvgNode } from '../components/icons';
import { navbarPresentation, navbarView, resolveNavbar, tabStyle, type BnLayout, type BnRoot, type BnTab } from '../components/navbar';
import type { ComponentInstance, ComponentStatus, PreviewState } from './component-types';
import type { MaterialGroup } from './materials';
import { MaterialBinding, type BoundSurface } from './surface-binding';

export type { PreviewState } from './component-types';

export interface BottomNavigationEvent {
  tabId: string;
  previous: string | null;
  value: string | null;
  index: number;
  trigger: 'pointer' | 'keyboard' | 'api';
}

export interface BottomNavigationOptions {
  /** Element the <nav> is appended to. */
  container: HTMLElement;
  config: ComponentDefinition;
  /** GlassSource: opaque element behind the bar whose content may be refracted (Glass only). */
  source?: HTMLElement | null;
  /** Shared Glass group (not destroyed by this component). Wins over `source` while the material is Glass. */
  group?: MaterialGroup;
  /** Element scrolled by wheel input over the bar (interactions.wheelForward). */
  scroller?: HTMLElement | null;
  /** Initial active tab (default: the definition's default item). */
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

export interface BottomNavigationStatus extends ComponentStatus {
  type: 'mobile-navbar';
  overflowing: boolean;
  activeTab: string;
}

interface TabView {
  el: HTMLButtonElement;
  icon: SVGSVGElement | null;
  label: HTMLSpanElement;
  iconKey: string;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const PRESS_KEYS = new Set([' ', 'Enter']);

export class BottomNavigation implements ComponentInstance {
  readonly type = 'mobile-navbar' as const;
  readonly host: HTMLElement;
  readonly track: HTMLDivElement;
  readonly indicator: HTMLSpanElement;
  private config: ComponentDefinition;
  private effective: BnRoot;
  private breakpoint: string | null = null;
  private readonly options: BottomNavigationOptions;
  private readonly binding: MaterialBinding;
  private material: ComponentDefinition['material'];
  private readonly reasons: string[] = [];
  private readonly tabs = new Map<string, TabView>();
  private surface: BoundSurface | null = null;
  private active: string;
  private preview: { target: string; state: PreviewState } | null = null;
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
    this.effective = navbarView(options.config);
    const doc = options.container.ownerDocument;
    this.material = options.config.material;
    this.binding = new MaterialBinding({
      container: options.container,
      material: resolveDefinitionMaterial(options.config),
      ...(options.source ? { source: options.source } : {}),
      ...(options.group ? { group: options.group } : {}),
      ...(options.backend ? { backend: options.backend } : {}),
    });
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
    const first = options.activeTab ?? navbarView(options.config).defaultTab;
    this.active = navbarView(options.config).children.some((t) => t.id === first) ? first : navbarView(options.config).defaultTab;
    this.host.toggleAttribute('data-motion-reduced', this.binding.status.motionReduced);
    this.lifetime.push(this.binding.onStatus((s) => this.host.toggleAttribute('data-motion-reduced', s.motionReduced)));
    this.render(true);
  }

  // ---------- public API ----------

  get component(): ComponentDefinition {
    return this.config;
  }

  get activeTab(): string {
    return this.active;
  }

  get pressed(): string | null {
    return this.pressedTab?.dataset.tab ?? null;
  }

  /** The Glass surface while the material is Glass (lens geometry, frames…), else null. */
  get glassSurface(): GlassSurface | null {
    return this.surface?.glass ?? null;
  }

  /** The surface of the bar, whichever family draws it. */
  get materialSurface(): BoundSurface | null {
    return this.surface;
  }

  /** The Glass group in use while the material is Glass. */
  get materialGroup(): MaterialGroup | null {
    return this.binding.glassGroup;
  }

  get mounted(): boolean {
    return this.surface !== null;
  }

  get status(): BottomNavigationStatus {
    const material = this.binding.status;
    return {
      type: 'mobile-navbar',
      family: this.binding.family,
      material,
      breakpoint: this.breakpoint,
      overflowing: this.overflowing,
      activeTab: this.active,
      reasons: [...this.reasons, ...material.reasons],
      unsupported: unsupportedProperties(this.config),
    };
  }

  /** Id of the tab under `target` (`root` when it is none). */
  nodeAt(target: EventTarget | null): string {
    return this.tabOf(target)?.dataset.tab ?? 'root';
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
  update(config: ComponentDefinition): void {
    const materialChanged = config.material !== this.material || config.states !== this.config.states;
    this.config = config;
    this.material = config.material;
    if (!navbarView(config).children.some((t) => t.id === this.active)) this.active = navbarView(config).defaultTab;
    if (materialChanged) this.binding.setMaterial(resolveDefinitionMaterial(config));
    this.render(false);
    this.placeIndicator(false);
  }

  /** Material only (a shared group is updated by its owner). */
  setMaterial(): void {
    this.applyLight();
  }

  setActiveTab(id: string, animate = true): void {
    if (id === this.active || !navbarView(this.config).children.some((t) => t.id === id)) return;
    this.active = id;
    this.applySelection();
    this.placeIndicator(animate);
  }

  /** False: pointer and keyboard input are ignored (the editor's selection mode). */
  setInteractive(on: boolean): void {
    this.interactive = on;
    if (!on) { this.release(); this.surface?.setHovered(false); }
    this.host.toggleAttribute('data-inert-preview', !on);
  }

  /** Shows a state on one tab without input (editor). null clears it. */
  previewState(tabId: string | null, state: PreviewState | null): void {
    this.preview = tabId && state ? { target: tabId, state } : null;
    this.render(false);
    for (const [id, t] of this.tabs) {
      if (id === tabId && state) t.el.dataset.previewState = state;
      else delete t.el.dataset.previewState;
      if (id === tabId && state === 'disabled') t.el.setAttribute('aria-disabled', 'true');
    }
    this.surface?.setHovered(state === 'hover');
    this.surface?.setPressed(state === 'pressed' && this.feedback());
    this.placeIndicator(false);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.unmount();
    this.destroyed = true;
    for (const c of this.lifetime.splice(0)) c();
    this.host.remove();
    this.binding.destroy();
  }

  // ---------- rendering ----------

  /** Box the bar is laid out in: its containing block (container anchor) or first ancestor with a box. */
  private layoutParent(): HTMLElement {
    const anchor = this.options.anchor ?? navbarView(this.config).layout.anchor;
    if (anchor === 'container' && this.host.offsetParent instanceof HTMLElement) return this.host.offsetParent;
    let el: HTMLElement | null = this.options.container;
    const win = this.host.ownerDocument.defaultView;
    while (el && win && win.getComputedStyle(el).display === 'contents') el = el.parentElement;
    return el ?? this.options.container;
  }

  /** Width the responsive breakpoints are evaluated against. */
  private containerWidth(): number {
    const anchor = this.options.anchor ?? navbarView(this.config).layout.anchor;
    if (anchor === 'viewport') return this.host.ownerDocument.defaultView?.innerWidth ?? this.options.container.clientWidth;
    return this.layoutParent().clientWidth;
  }

  private render(force: boolean) {
    const { root, breakpoint } = resolveNavbar(this.config, this.containerWidth());
    this.effective = root;
    this.breakpoint = breakpoint;
    const key = JSON.stringify([root.layout, root.appearance, root.typography, root.icon, root.states, root.motion, root.responsive.overflow, root.responsive.minTabWidth, root.semantics, this.options.label ?? root.label, breakpoint, this.binding.family]);
    if (force || key !== this.appliedKey) {
      this.appliedKey = key;
      this.applyRoot(root);
    }
    this.renderTabs(root);
    this.applySelection();
    this.applyLight();
    this.surface?.setRadius(this.radius());
    this.checkOverflow();
  }

  private applyRoot(r: BnRoot) {
    const h = this.host;
    h.setAttribute('aria-label', this.options.label ?? r.label);
    // The presentation is data (components/navbar.ts): what is written here is what the tests compare.
    const p = navbarPresentation(r, this.binding.family, { breakpoint: this.breakpoint, ...(this.options.anchor ? { anchor: this.options.anchor } : {}) });
    for (const name of MANAGED_ATTRS) if (!(name in p.attrs)) h.removeAttribute(name);
    for (const [k, v] of Object.entries(p.attrs)) h.setAttribute(k, v);
    for (const name of MANAGED_VARS) if (!(name in p.vars)) h.style.removeProperty(name);
    for (const [k, v] of Object.entries(p.vars)) h.style.setProperty(k, v);
    this.track.setAttribute('role', r.semantics === 'tabs' ? 'tablist' : 'presentation');
    if (r.semantics === 'tabs') this.track.setAttribute('aria-label', this.options.label ?? r.label);
    else this.track.removeAttribute('aria-label');
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
      const on = id === (this.preview?.state === 'active' ? this.preview.target : this.active);
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

  /** The indicator's rim follows the material's light (Glass; read from the document, not re-rendered). */
  private applyLight() {
    const doc = this.binding.material;
    if (doc.family === 'glass') this.host.style.setProperty('--jbn-light', String(glassParams(doc).light));
    else this.host.style.removeProperty('--jbn-light');
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
    const view = this.tabs.get(this.preview?.state === 'active' ? this.preview.target : this.active);
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
    this.surface = this.binding.attach(this.host, { radius: this.radius() });
  }

  private detachSurface() {
    if (!this.surface) return;
    this.binding.detach(this.surface);
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
      listen(h, 'pointerenter', (e) => {
        if (this.interactive && e.pointerType !== 'touch') this.surface?.setHovered(true);
      }),
      listen(h, 'pointerleave', () => this.surface?.setHovered(false)),
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
        if (tab && tab.getAttribute('aria-disabled') !== 'true') this.select(tab.dataset.tab!, e.detail === 0 ? 'keyboard' : 'pointer');
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
      // Focus leaving the bar ends a press; focus moving to another tab of the bar (the mouse pressed it) does not.
      listen(h, 'focusout', (e) => {
        if (e.relatedTarget instanceof Node && h.contains(e.relatedTarget)) return;
        this.release();
      }),
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

  /** Press feedback on the bar's surface: a Glass bar answers with local light; a Solid bar does not dip (see NAVBAR_UNSUPPORTED). */
  private feedback() {
    return this.effective.interactions.pressFeedback && this.binding.family === 'glass';
  }

  private tabOf(target: EventTarget | null): HTMLButtonElement | null {
    const tab = target instanceof Element ? target.closest<HTMLButtonElement>('.jello-bnav-tab') : null;
    return tab && this.host.contains(tab) ? tab : null;
  }

  private event(id: string, trigger: BottomNavigationEvent['trigger'], previous: string | null): BottomNavigationEvent {
    const i = navbarView(this.config).children.findIndex((t) => t.id === id);
    return { tabId: id, previous, value: navbarView(this.config).children[i]?.value ?? null, index: i, trigger };
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
    const tab = navbarView(this.config).children.find((t) => t.id === id);
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

/** Attributes and variables `navbarPresentation` may write: the ones it leaves out are removed, so a material switch leaves nothing behind. */
const MANAGED_ATTRS = ['data-text-shadow', 'data-breakpoint'];
const MANAGED_VARS = ['--jbn-fg', '--jbn-indicator'];

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
