/** Desktop DOM renderer. The definition, material binding and entry point are shared with Studio/consumers. */
import './desktop-navigation.css';
import { parseDefinition, resolveDefinitionMaterial, type ComponentDefinition } from '../components/definition';
import { desktopNavbarPresentation, desktopNavbarRegions, resolveDesktopNavbar } from '../components/navbar-desktop';
import { navbarActiveItem, navbarItems, type DesktopNavbarDefinition, type NavbarItem, type NavbarRegion } from '../components/navbar-contract';
import { iconTree, type SvgNode } from '../components/icons';
import { unsupportedProperties } from '../components/registry';
import type { BottomNavigationEvent, BottomNavigationOptions, NavbarActionEvent } from './bottom-navigation';
import type { ComponentInstance, ComponentStatus, PreviewState } from './component-types';
import { MaterialBinding, type BoundSurface } from './surface-binding';

export interface DesktopNavigationEvent extends BottomNavigationEvent { itemId: string }
export interface DesktopNavigationActionEvent extends DesktopNavigationEvent, NavbarActionEvent {}
export interface DesktopNavigationOptions extends Omit<BottomNavigationOptions, 'config' | 'anchor' | 'classNames' | 'onChange' | 'onTabPress' | 'onReselect' | 'onAction'> {
  config: DesktopNavbarDefinition;
  activeItem?: string | null;
  onChange?(id: string, event: DesktopNavigationEvent): void;
  onTabPress?(id: string, event: DesktopNavigationEvent): void;
  onReselect?(id: string, event: DesktopNavigationEvent): void;
  onAction?(id: string, event: DesktopNavigationActionEvent): void;
  onHover?(id: string, event: DesktopNavigationEvent): void;
  onFocus?(id: string, event: DesktopNavigationEvent): void;
}
export interface DesktopNavigationStatus extends ComponentStatus {
  type: 'desktop-navbar';
  activeItem: string;
  overflowing: boolean;
}
interface ItemView { el: HTMLButtonElement | HTMLAnchorElement; label: HTMLSpanElement; iconKey: string }

export class DesktopNavigation implements ComponentInstance {
  readonly type = 'desktop-navbar' as const;
  readonly host: HTMLElement;
  readonly regions: Record<NavbarRegion, HTMLDivElement>;
  private readonly row: HTMLDivElement;
  private readonly binding: MaterialBinding;
  private config: DesktopNavbarDefinition;
  private effective: DesktopNavbarDefinition;
  private surface: BoundSurface | null = null;
  private readonly views = new Map<string, ItemView>();
  private active: string;
  private breakpoint: string | null = null;
  private preview: { id: string; state: PreviewState } | null = null;
  private pressedItem: string | null = null;
  private pointer: number | null = null;
  private interactive = true;
  private destroyed = false;
  private cleanups: (() => void)[] = [];
  private readonly offStatus: () => void;
  private writtenVars: string[] = [];
  private writtenAttrs: string[] = [];

  constructor(private readonly options: DesktopNavigationOptions) {
    this.config = validate(options.config);
    this.effective = this.config;
    this.active = navbarActiveItem(this.config, options.activeItem ?? options.activeTab ?? null);
    const doc = options.container.ownerDocument;
    this.host = doc.createElement('nav');
    this.host.className = 'jello-dnav';
    this.host.hidden = true;
    this.host.tabIndex = -1;
    this.row = doc.createElement('div');
    this.row.className = 'jello-dnav-row';
    this.regions = Object.fromEntries((['start', 'main', 'end'] as const).map((region) => {
      const el = doc.createElement('div');
      el.className = 'jello-dnav-region'; el.dataset.region = region;
      this.row.append(el);
      return [region, el];
    })) as Record<NavbarRegion, HTMLDivElement>;
    this.host.append(this.row);
    this.binding = new MaterialBinding({ container: options.container, material: resolveDefinitionMaterial(this.config),
      ...(options.source ? { source: options.source } : {}), ...(options.group ? { group: options.group } : {}),
      ...(options.backend ? { backend: options.backend } : {}),
    });
    this.offStatus = this.binding.onStatus((s) => this.host.toggleAttribute('data-motion-reduced', s.motionReduced));
    this.host.toggleAttribute('data-motion-reduced', this.binding.status.motionReduced);
    options.container.append(this.host);
    this.render();
  }

  get component(): DesktopNavbarDefinition { return this.config; }
  get activeItem(): string { return this.active; }
  /** Compatibility with the existing navbar handlers. */
  get activeTab(): string { return this.active; }
  get pressed(): string | null { return this.pressedItem; }
  get materialSurface(): BoundSurface | null { return this.surface; }
  get glassSurface() { return this.surface?.glass ?? null; }
  get materialGroup() { return this.binding.glassGroup; }
  get mounted(): boolean { return this.surface !== null; }
  get status(): DesktopNavigationStatus {
    const material = this.binding.status;
    const reasons = ['pressed', 'active', 'disabled'].filter((state) => {
      const entry = this.config.states[state as 'pressed' | 'active' | 'disabled'];
      return entry?.material && Object.keys(entry.material).length;
    }).map((state) => `states.${state}.material: conservato; lo stato della singola voce usa states.${state}.style, non la superficie dell’intera navbar.`);
    return { type: this.type, family: this.binding.family, material, breakpoint: this.breakpoint, activeItem: this.active,
      overflowing: this.host.hasAttribute('data-overflowing'), reasons: [...material.reasons, ...reasons], unsupported: unsupportedProperties(this.config) };
  }
  elementFor(id: string): HTMLElement | null { return id === 'root' ? this.host : this.views.get(id)?.el ?? null; }
  nodeAt(target: EventTarget | null): string { return this.control(target)?.dataset.item ?? 'root'; }

  mount(): void {
    if (this.mounted || this.destroyed) return;
    this.host.hidden = false;
    this.surface = this.binding.attach(this.host, { radius: this.effective.layout.radius });
    this.bind(); this.render();
  }
  unmount(): void {
    if (!this.surface) return;
    this.release(); this.surface.setHovered(false);
    for (const off of this.cleanups.splice(0)) off();
    this.binding.detach(this.surface); this.surface = null;
    this.host.hidden = true;
  }
  update(config: ComponentDefinition): void {
    if (this.destroyed) return;
    const next = validate(config); // Refuse bad updates before changing a live instance.
    const material = resolveDefinitionMaterial(next);
    this.release();
    this.config = next;
    this.active = navbarActiveItem(next, this.active);
    this.binding.setMaterial(material);
    this.render();
  }
  setActiveItem(id: string): void {
    if (this.destroyed || navbarActiveItem(this.config, id) !== id) return;
    this.active = id; this.selection(); this.measureOverflow();
  }
  setActiveTab(id: string): void { this.setActiveItem(id); }
  /** The Stage owns updates to a supplied Glass group. */
  setMaterial(): void { if (!this.destroyed) this.render(); }
  setInteractive(on: boolean): void {
    this.interactive = on;
    this.host.toggleAttribute('data-inert-preview', !on);
    if (!on) { this.release(); this.surface?.setHovered(false); }
  }
  previewState(id: string | null, state: PreviewState | null): void {
    this.preview = id && state ? { id, state } : null;
    this.release(); this.render();
    this.surface?.setHovered(state === 'hover');
    this.surface?.setPressed(state === 'pressed' && this.feedback());
  }
  destroy(): void {
    if (this.destroyed) return;
    this.unmount(); this.destroyed = true;
    this.offStatus(); this.binding.destroy();
    this.views.clear(); this.host.remove();
  }

  private layoutParent(): HTMLElement {
    let parent = this.options.container;
    const win = this.host.ownerDocument.defaultView;
    while (parent.parentElement && win?.getComputedStyle(parent).display === 'contents') parent = parent.parentElement;
    return parent;
  }
  private render(): void {
    const resolved = resolveDesktopNavbar(this.config, this.layoutParent().clientWidth);
    this.effective = resolved.definition as DesktopNavbarDefinition; this.breakpoint = resolved.breakpoint;
    const p = desktopNavbarPresentation(this.effective, this.binding.family, this.breakpoint);
    for (const key of this.writtenVars) if (!(key in p.vars)) this.host.style.removeProperty(key);
    for (const key of this.writtenAttrs) if (!(key in p.attrs)) this.host.removeAttribute(key);
    for (const [key, value] of Object.entries(p.vars)) this.host.style.setProperty(key, value);
    for (const [key, value] of Object.entries(p.attrs)) this.host.setAttribute(key, value);
    this.writtenVars = Object.keys(p.vars); this.writtenAttrs = Object.keys(p.attrs);
    this.host.setAttribute('aria-label', this.options.label || this.config.content.root?.text || this.config.name);
    const focused = this.control(this.host.ownerDocument.activeElement)?.dataset.item;
    const regions = desktopNavbarRegions(this.effective);
    const wanted = new Set(Object.values(regions).flat().map((item) => item.id));
    for (const [id, view] of this.views) if (!wanted.has(id)) { view.el.remove(); this.views.delete(id); }
    for (const region of ['start', 'main', 'end'] as const) {
      const parent = this.regions[region];
      parent.hidden = !regions[region].length;
      regions[region].forEach((item, index) => {
        let view = this.views.get(item.id);
        const link = item.action.kind === 'navigate';
        if (view && (view.el.tagName === 'A') !== link) { view.el.remove(); this.views.delete(item.id); view = undefined; }
        if (!view) {
          const el = link ? parent.ownerDocument.createElement('a') : parent.ownerDocument.createElement('button');
          if (el.tagName === 'BUTTON') (el as HTMLButtonElement).type = 'button';
          el.className = 'jello-dnav-item'; el.dataset.item = item.id;
          const label = parent.ownerDocument.createElement('span'); label.className = 'jello-dnav-label';
          el.append(label); view = { el, label, iconKey: '' }; this.views.set(item.id, view);
        }
        this.updateItem(view, item);
        if (parent.children[index] !== view.el) parent.insertBefore(view.el, parent.children[index] ?? null);
      });
    }
    this.selection();
    if (focused) {
      const preferred = this.views.get(focused)?.el;
      const target = preferred?.getAttribute('aria-disabled') !== 'true' ? preferred : null;
      const fallback = target ?? this.views.get(this.active)?.el ?? this.controls()[0];
      if (fallback && this.host.ownerDocument.activeElement !== fallback) fallback.focus({ preventScroll: true });
      else if (!fallback) this.host.focus({ preventScroll: true });
    }
    this.surface?.setRadius(this.effective.layout.radius);
    this.measureOverflow();
  }
  private updateItem(view: ItemView, item: NavbarItem): void {
    const el = view.el;
    const disabled = item.disabled || (this.preview?.id === item.id && this.preview.state === 'disabled');
    el.dataset.role = item.role;
    for (const [key, value] of Object.entries({ group: item.groupId, value: item.value,
      iconPosition: item.iconPosition ?? (this.effective.layout.itemLayout === 'stacked' ? 'top' : 'start'),
      previewState: this.preview?.id === item.id ? this.preview.state : null })) {
      if (value === null) delete el.dataset[key]; else el.dataset[key] = value;
    }
    el.setAttribute('aria-label', item.accessibleLabel || item.label || item.id);
    if (item.description) el.setAttribute('aria-description', item.description); else el.removeAttribute('aria-description');
    if (disabled) el.setAttribute('aria-disabled', 'true'); else el.removeAttribute('aria-disabled');
    if (el.tagName === 'BUTTON') (el as HTMLButtonElement).disabled = disabled;
    if (el.tagName === 'A' && item.action.kind === 'navigate') {
      if (disabled) el.removeAttribute('href'); else el.setAttribute('href', item.action.href);
      if (disabled) el.setAttribute('role', 'link'); else el.removeAttribute('role');
      el.setAttribute('target', item.action.target ?? '_self');
      if (item.action.target === '_blank') el.setAttribute('rel', 'noopener noreferrer'); else el.removeAttribute('rel');
    }
    el.tabIndex = disabled ? -1 : 0;
    view.label.textContent = item.label;
    const key = JSON.stringify(item.icon);
    if (key !== view.iconKey) {
      el.querySelector('svg')?.remove();
      const tree = iconTree(item.icon);
      if (tree) {
        const svg = el.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'jello-dnav-icon'); svg.setAttribute('viewBox', tree.viewBox);
        svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false'); svg.dataset.paint = tree.paint;
        const append = (parent: Element, nodes: readonly SvgNode[]) => {
          for (const n of nodes) {
            const child = el.ownerDocument.createElementNS('http://www.w3.org/2000/svg', n.tag);
            for (const [k, v] of n.attrs) child.setAttribute(k, v);
            append(child, n.children); parent.append(child);
          }
        };
        append(svg, tree.nodes); el.prepend(svg);
      }
      view.iconKey = key;
    }
    const style = (this.effective.style.items as Record<string, Record<string, number>> | undefined)?.[item.id] ?? {};
    for (const [name, variable, unit] of [['iconSize', '--jbn-tab-icon', 'px'], ['fontSize', '--jbn-tab-font-size', 'px'], ['fontWeight', '--jbn-tab-font-weight', ''], ['letterSpacing', '--jbn-tab-letter-spacing', 'px']]) {
      if (style[name!] != null) el.style.setProperty(variable!, `${style[name!]}${unit}`); else el.style.removeProperty(variable!);
    }
  }
  private selection(): void {
    for (const [id, view] of this.views) {
      const active = id === (this.preview?.state === 'active' ? this.preview.id : this.active);
      view.el.toggleAttribute('data-active', active);
      if (active) view.el.setAttribute('aria-current', 'page'); else view.el.removeAttribute('aria-current');
    }
  }
  private measureOverflow(): void {
    // Main shrinks first. At extreme widths the whole row scrolls as well, so no control disappears.
    this.host.removeAttribute('data-compressed');
    if (this.effective.responsive.overflow === 'compress' && this.regions.main.scrollWidth > this.regions.main.clientWidth + 1) this.host.setAttribute('data-compressed', '');
    const overflowing = [this.row, ...Object.values(this.regions)].some((el) => el.scrollWidth > el.clientWidth + 1);
    this.host.toggleAttribute('data-overflowing', overflowing);
  }
  private controls(): HTMLElement[] {
    return [...this.row.querySelectorAll<HTMLElement>('[data-item]')].filter((el) => el.getAttribute('aria-disabled') !== 'true');
  }
  private control(target: EventTarget | null): HTMLElement | null {
    const node = target as Element | null;
    const el = typeof node?.closest === 'function' ? node.closest<HTMLElement>('[data-item]') : null;
    return el && this.host.contains(el) ? el : null;
  }
  private feedback(): boolean { return this.binding.family === 'glass' && !!this.effective.interactions.behavior.pressFeedback; }
  private event(id: string, trigger: DesktopNavigationEvent['trigger']): DesktopNavigationEvent {
    const items = navbarItems(this.config);
    return { itemId: id, tabId: id, previous: this.active || null, value: items.find((item) => item.id === id)?.value ?? null,
      index: items.findIndex((item) => item.id === id), trigger };
  }
  private emit(trigger: string, detail: DesktopNavigationEvent): void {
    const name = this.config.interactions.events[trigger] ?? `jello-${trigger}`;
    this.host.dispatchEvent(new CustomEvent(name, { detail, bubbles: true }));
  }
  private activate(id: string, trigger: DesktopNavigationEvent['trigger']): void {
    const item = navbarItems(this.config).find((item) => item.id === id);
    if (!item || !item.visible || item.disabled) return;
    const event = this.event(id, trigger);
    const action = { ...event, action: item.action };
    this.options.onAction?.(id, action); this.emit('action', action);
    if (item.action.kind !== 'select' || item.role !== 'item') return;
    if (id === this.active) {
      if (this.config.interactions.behavior.reselect === 'event') { this.options.onReselect?.(id, event); this.emit('reselect', event); }
    } else {
      if (!this.options.controlled) this.setActiveItem(id);
      this.options.onChange?.(id, event); this.emit('change', event);
    }
  }
  private release(): void {
    if (this.pressedItem) this.views.get(this.pressedItem)?.el.removeAttribute('data-pressed');
    this.pressedItem = null; this.pointer = null; this.surface?.setPressed(false);
  }
  private press(el: HTMLElement, trigger: DesktopNavigationEvent['trigger'], point?: { x: number; y: number }): void {
    this.release(); this.pressedItem = el.dataset.item!; el.setAttribute('data-pressed', '');
    if (this.feedback()) this.surface?.setPressed(true, point);
    const event = this.event(this.pressedItem, trigger);
    this.options.onTabPress?.(this.pressedItem, event); this.emit('press', event);
  }
  private bind(): void {
    const h = this.host, win = h.ownerDocument.defaultView!;
    const listen = <K extends keyof HTMLElementEventMap>(type: K, fn: (event: HTMLElementEventMap[K]) => void, options?: AddEventListenerOptions) => {
      h.addEventListener(type, fn, options); this.cleanups.push(() => h.removeEventListener(type, fn, options));
    };
    const usable = (target: EventTarget | null) => {
      const el = this.control(target); return this.interactive && el?.getAttribute('aria-disabled') !== 'true' ? el : null;
    };
    listen('click', (event) => {
      const el = usable(event.target);
      if (!el) { event.preventDefault(); return; }
      this.activate(el.dataset.item!, event.detail === 0 ? 'keyboard' : 'pointer');
    });
    listen('pointerdown', (event) => {
      const el = usable(event.target);
      if (!el || !event.isPrimary || event.button !== 0) return;
      const r = h.getBoundingClientRect();
      this.press(el, 'pointer', { x: (event.clientX - r.left) / r.width, y: (event.clientY - r.top) / r.height });
      this.pointer = event.pointerId;
    });
    listen('pointerover', (event) => {
      const el = usable(event.target);
      if (!el || event.pointerType === 'touch' || el.contains(event.relatedTarget as Node | null)) return;
      this.surface?.setHovered(true);
      const e = this.event(el.dataset.item!, 'pointer'); this.options.onHover?.(e.itemId, e); this.emit('hover', e);
    });
    listen('pointerout', (event) => {
      const el = this.control(event.target);
      if (el?.contains(event.relatedTarget as Node | null)) return;
      this.surface?.setHovered(false);
      if (this.pointer === event.pointerId) this.release();
    });
    listen('focusin', (event) => {
      const el = usable(event.target); if (!el) return;
      const e = this.event(el.dataset.item!, 'keyboard'); this.options.onFocus?.(e.itemId, e); this.emit('focus', e);
    });
    listen('focusout', (event) => {
      if (event.relatedTarget && h.contains(event.relatedTarget as Node)) return;
      this.release();
    });
    listen('keydown', (event) => {
      const el = usable(event.target); if (!el) return;
      if (event.key === 'Enter' || event.key === ' ') {
        // Anchors retain native Enter behavior; Space scrolls the page.
        if (!event.repeat && !(el.tagName === 'A' && event.key === ' ')) this.press(el, 'keyboard');
        return;
      }
      const controls = this.controls(), i = controls.indexOf(el);
      const rtl = win.getComputedStyle(h).direction === 'rtl';
      const next = { ArrowLeft: i + (rtl ? 1 : -1), ArrowRight: i + (rtl ? -1 : 1), Home: 0, End: controls.length - 1 }[event.key];
      if (next === undefined || !controls.length) return;
      event.preventDefault(); this.release(); controls[(next + controls.length) % controls.length]!.focus();
    });
    listen('keyup', (event) => { if (event.key === 'Enter' || event.key === ' ') this.release(); });
    listen('wheel', (event) => {
      const scroller = this.options.scroller;
      if (!this.interactive || !scroller || !this.effective.interactions.behavior.wheelForward || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? scroller.clientHeight : 1;
      scroller.scrollBy(event.deltaX * scale, event.deltaY * scale); event.preventDefault();
    }, { passive: false });
    const release = () => this.release(), resize = () => this.render();
    win.addEventListener('pointerup', release); win.addEventListener('pointercancel', release); win.addEventListener('blur', release); win.addEventListener('resize', resize);
    this.cleanups.push(() => { win.removeEventListener('pointerup', release); win.removeEventListener('pointercancel', release); win.removeEventListener('blur', release); win.removeEventListener('resize', resize); });
    const observer = new ResizeObserver(() => this.render());
    observer.observe(this.layoutParent()); observer.observe(h);
    this.cleanups.push(() => observer.disconnect());
  }
}

function validate(config: ComponentDefinition): DesktopNavbarDefinition {
  if (config.type !== 'desktop-navbar') throw new Error('DesktopNavigation richiede una desktop-navbar');
  const parsed = parseDefinition(config);
  if (!parsed.ok) throw new Error(`Desktop Navbar non valida: ${parsed.errors.join('; ')}`);
  if (parsed.doc.interactions.behavior.semantics !== 'navigation') throw new Error('Desktop Navbar: tabs non supportate senza un contratto di associazione ai pannelli; usare navigation');
  return parsed.doc as DesktopNavbarDefinition;
}
