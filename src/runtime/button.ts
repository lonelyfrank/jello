/**
 * JelloButton on the DOM: the renderer of a `jello-component-definition` of
 * type `button`. Framework-independent; the lab's preview, the builder and the
 * exported React component all run this class.
 *
 *   button.jello-btn | a.jello-btn       host: one material surface, the content never filtered
 *     span.jello-surface | span.jello-solid   added by the material group
 *     svg.jello-btn-icon                 optional, before or after the label (layout.iconPosition)
 *     span.jello-btn-label
 *
 * Semantics. `interactions.behavior.semantics: 'action'` renders a `<button>`
 * and reports the press to the application; `'link'` renders an `<a href>`,
 * which the browser follows by itself: the component never navigates and
 * never invents a destination. A disabled button is `disabled`; a disabled
 * link has no `href`, `role="link"` and `aria-disabled="true"` (it cannot be
 * focused or followed, and still reads as a link to a screen reader).
 *
 * Material. The surface comes from a MaterialBinding (surface-binding.ts):
 * Glass over a source (or a shared group) or Solid, chosen by the definition's
 * family. The component reports its state (hover, pressed, disabled) to the
 * surface and draws only what the family does not: for Glass a veil on hover
 * and press and the disabled opacity, for every family the focus ring and the
 * ghost variant's "surface only on interaction". What a family renders itself
 * is not drawn twice (`buttonPresentation` leaves those properties out).
 *
 * Responsive. Breakpoints are evaluated against the width of the box the
 * button is laid out in and re-evaluated when that box resizes.
 */

import './button.css';
import type { GlassSurface } from '../core/surface';
import { buttonPresentation, resolveButton, type ButtonProps } from '../components/button';
import { resolveDefinitionMaterial, type ComponentDefinition } from '../components/definition';
import { iconTree, type SvgNode } from '../components/icons';
import { unsupportedProperties } from '../components/registry';
import type { BackendRequest } from '../model/support';
import type { ComponentInstance, ComponentStatus, PreviewState } from './component-types';
import type { MaterialGroup } from './materials';
import { MaterialBinding, type BoundSurface } from './surface-binding';

export interface ButtonEvent {
  /** `root.value` of the definition: free payload for the application, or null. */
  value: string | null;
  /** Destination of a link, or null for an action. */
  href: string | null;
  trigger: 'pointer' | 'keyboard' | 'api';
}

export interface JelloButtonOptions {
  /** Element the button is appended to. */
  container: HTMLElement;
  config: ComponentDefinition;
  /** GlassSource: opaque element behind the button whose content may be refracted (Glass only). */
  source?: HTMLElement | null;
  /** Shared Glass group (not destroyed by this component). Wins over `source` while the material is Glass. */
  group?: MaterialGroup;
  /** Backend of the Glass group created here. */
  backend?: BackendRequest;
  /** Replaces the label (the definition's text stays the default). */
  label?: string;
  /** Replaces the definition's `disabled`. */
  disabled?: boolean;
  /** The editor's preview: a link reports its press but is not followed. */
  inertLinks?: boolean;
  /** Extra class name on the host. */
  className?: string;
  onPress?(e: ButtonEvent): void;
  onHover?(e: ButtonEvent): void;
  onFocus?(e: ButtonEvent): void;
}

export interface ButtonStatus extends ComponentStatus {
  type: 'button';
  /** `button` or `a`: what the definition's semantics rendered. */
  element: 'button' | 'a';
  /** Surface drawn: ghost buttons draw it only on interaction. */
  surface: 'shown' | 'rest';
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const MANAGED_ATTRS = ['data-variant', 'data-size', 'data-width', 'data-align', 'data-icon-position', 'data-has-icon', 'data-material'];
const MANAGED_VARS = ['--jbtn-color-primary', '--jbtn-color-secondary', '--jbtn-color-ghost', '--jbtn-hover', '--jbtn-press', '--jbtn-disabled'];

export class JelloButton implements ComponentInstance {
  readonly type = 'button' as const;
  private el: HTMLElement;
  private config: ComponentDefinition;
  private props: ButtonProps;
  private readonly options: JelloButtonOptions;
  private readonly binding: MaterialBinding;
  private material: ComponentDefinition['material'];
  private surface: BoundSurface | null = null;
  private icon: SVGSVGElement | null = null;
  private iconKey = '';
  private label: HTMLSpanElement;
  private flags = { hover: false, pressed: false, focus: false };
  private preview: PreviewState | null = null;
  private pointer: number | null = null;
  private interactive = true;
  private cleanups: (() => void)[] = [];
  private readonly lifetime: (() => void)[] = [];
  private resizeObserver: ResizeObserver | null = null;
  private destroyed = false;
  private mountedFlag = false;

  constructor(options: JelloButtonOptions) {
    this.options = options;
    this.config = options.config;
    this.material = options.config.material;
    this.binding = new MaterialBinding({
      container: options.container,
      material: resolveDefinitionMaterial(options.config),
      ...(options.source ? { source: options.source } : {}),
      ...(options.group ? { group: options.group } : {}),
      ...(options.backend ? { backend: options.backend } : {}),
    });
    this.props = resolveButton(options.config, this.containerWidth());
    this.el = this.create();
    this.label = this.el.querySelector<HTMLSpanElement>('.jello-btn-label')!;
    this.el.hidden = true;
    options.container.append(this.el);
    this.lifetime.push(this.binding.onStatus(() => this.syncMotion()));
    this.render();
  }

  // ---------- public API ----------

  get host(): HTMLElement {
    return this.el;
  }

  get component(): ComponentDefinition {
    return this.config;
  }

  get mounted(): boolean {
    return this.mountedFlag;
  }

  /** The Glass surface while the material is Glass, else null. */
  get glassSurface(): GlassSurface | null {
    return this.surface?.glass ?? null;
  }

  /** The surface of the button, whichever family draws it. */
  get materialSurface(): BoundSurface | null {
    return this.surface;
  }

  get status(): ButtonStatus {
    const material = this.binding.status;
    return {
      type: 'button',
      family: this.binding.family,
      material,
      breakpoint: this.props.breakpoint,
      reasons: [...material.reasons],
      unsupported: unsupportedProperties(this.config),
      element: this.el.tagName === 'A' ? 'a' : 'button',
      surface: this.surfaceShown() ? 'shown' : 'rest',
    };
  }

  /** The resolved properties in effect (breakpoint applied). */
  get resolved(): ButtonProps {
    return this.props;
  }

  elementFor(id: string): HTMLElement | null {
    return id === 'root' ? this.el : null;
  }

  nodeAt(): string {
    return 'root';
  }

  /** Shows the button, attaches its surface and binds input. Idempotent. */
  mount(): void {
    if (this.mountedFlag || this.destroyed) return;
    this.mountedFlag = true;
    this.el.hidden = false;
    this.attach();
    this.bind();
    this.render();
  }

  /** Releases the surface and every listener; hides the button. */
  unmount(): void {
    if (!this.mountedFlag) return;
    this.mountedFlag = false;
    this.flags = { hover: false, pressed: false, focus: false };
    for (const c of this.cleanups.splice(0)) c();
    this.detach();
    this.el.hidden = true;
  }

  /** New definition of the same component. The element is replaced only when its semantics (button ↔ link) change. */
  update(config: ComponentDefinition): void {
    const materialChanged = config.material !== this.material || config.states !== this.config.states || config.style.variant !== this.config.style.variant;
    this.config = config;
    this.material = config.material;
    if (materialChanged) this.binding.setMaterial(resolveDefinitionMaterial(config));
    this.render();
  }

  /** False: pointer and keyboard input are ignored (the editor's selection mode). */
  setInteractive(on: boolean): void {
    this.interactive = on;
    if (!on) this.release();
    this.el.toggleAttribute('data-inert-preview', !on);
  }

  /** Shows a state without input (editor). null clears it. */
  previewState(target: string | null, state: PreviewState | null): void {
    this.preview = target === null || state === 'active' ? null : state;
    this.applySemantics(this.props);
    this.syncState();
  }

  /** Replaces the label shown (`null`: the definition's text). */
  setLabel(text: string | null): void {
    if (text === null) delete this.options.label;
    else this.options.label = text;
    this.render();
  }

  /** Replaces the definition's `disabled` (`null`: the definition's own). */
  setDisabled(disabled: boolean | null): void {
    if (disabled === null) delete this.options.disabled;
    else this.options.disabled = disabled;
    this.render();
  }

  /** Activates the button as the application would from code; reports the press like an input would. */
  press(): void {
    this.activate('api');
  }

  focus(): void {
    this.el.focus();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.unmount();
    this.destroyed = true;
    for (const c of this.lifetime.splice(0)) c();
    this.resizeObserver?.disconnect();
    this.el.remove();
    this.binding.destroy();
  }

  // ---------- rendering ----------

  private create(): HTMLElement {
    const doc = this.options.container.ownerDocument;
    const el = doc.createElement(this.props.semantics === 'link' ? 'a' : 'button');
    if (el instanceof HTMLButtonElement) el.type = 'button';
    el.className = ['jello-btn', this.options.className].filter(Boolean).join(' ');
    const label = doc.createElement('span');
    label.className = 'jello-btn-label';
    el.append(label);
    return el;
  }

  /** Box the button is laid out in: its container, or the first ancestor with a box (a wrapper may be `display: contents`). */
  private layoutParent(): HTMLElement {
    let el: HTMLElement | null = this.options.container;
    const win = this.options.container.ownerDocument.defaultView;
    while (el && win && win.getComputedStyle(el).display === 'contents') el = el.parentElement;
    return el ?? this.options.container;
  }

  private containerWidth(): number {
    // Not laid out (hidden, detached): no width to compare, so no breakpoint applies.
    return this.layoutParent().clientWidth || Number.POSITIVE_INFINITY;
  }

  private render() {
    if (this.destroyed) return;
    this.props = resolveButton(this.config, this.containerWidth());
    const wanted = this.props.semantics === 'link' ? 'A' : 'BUTTON';
    if (this.el.tagName !== wanted) this.replaceElement();
    const p = this.props;
    const view = buttonPresentation(p, this.binding.family);
    const el = this.el;
    for (const name of MANAGED_ATTRS) if (!(name in view.attrs)) el.removeAttribute(name);
    for (const [k, v] of Object.entries(view.attrs)) el.setAttribute(k, v);
    for (const name of MANAGED_VARS) if (!(name in view.vars)) el.style.removeProperty(name);
    for (const [k, v] of Object.entries(view.vars)) el.style.setProperty(k, v);
    const text = this.options.label ?? p.text;
    if (this.label.textContent !== text) this.label.textContent = text;
    this.renderIcon(p);
    this.applySemantics(p);
    this.surface?.setRadius(p.layout.radius);
    this.syncMotion();
    this.syncState();
    // The breakpoint in effect is data too: the editor and the tests read it.
    if (p.breakpoint) el.setAttribute('data-breakpoint', p.breakpoint);
    else el.removeAttribute('data-breakpoint');
  }

  private renderIcon(p: ButtonProps) {
    const icon = p.icon && p.icon.kind !== 'none' ? p.icon : null;
    const key = JSON.stringify(icon);
    if (key !== this.iconKey) {
      this.icon?.remove();
      this.icon = icon ? renderIcon(this.el.ownerDocument, icon) : null;
      this.iconKey = key;
    }
    if (this.icon) {
      // Order in the DOM follows the position, so reading order and visual order agree.
      if (p.layout.iconPosition === 'start') {
        if (this.icon.nextSibling !== this.label) this.el.insertBefore(this.icon, this.label);
      } else if (this.icon.previousSibling !== this.label) this.label.after(this.icon);
    }
  }

  /** Accessibility attributes: the element's own semantics, never a made-up behavior. */
  private applySemantics(p: ButtonProps) {
    const el = this.el;
    const disabled = this.preview === 'disabled' || (this.options.disabled ?? p.disabled);
    el.toggleAttribute('data-disabled', disabled);
    if (el instanceof HTMLButtonElement) {
      el.disabled = disabled;
      el.removeAttribute('aria-disabled');
    } else if (el instanceof HTMLAnchorElement) {
      if (disabled || !p.href) {
        el.removeAttribute('href');
        el.setAttribute('role', 'link');
        if (disabled) el.setAttribute('aria-disabled', 'true');
        else el.removeAttribute('aria-disabled');
      } else {
        el.setAttribute('href', p.href);
        el.removeAttribute('role');
        el.removeAttribute('aria-disabled');
      }
      el.tabIndex = disabled ? -1 : 0;
    }
    if (p.value !== null) el.dataset.value = p.value;
    else delete el.dataset.value;
    this.surface?.setDisabled(disabled);
  }

  /** The element changes only when semantics change: the surface and the listeners follow it. */
  private replaceElement() {
    const was = this.mountedFlag;
    if (was) {
      for (const c of this.cleanups.splice(0)) c();
      this.detach();
    }
    const next = this.create();
    next.hidden = this.el.hidden;
    this.el.replaceWith(next);
    this.icon?.remove();
    this.icon = null;
    this.iconKey = '';
    this.el = next;
    this.label = next.querySelector<HTMLSpanElement>('.jello-btn-label')!;
    if (was) {
      this.attach();
      this.bind();
    }
  }

  private surfaceShown(): boolean {
    return this.props.style.variant !== 'ghost' || this.flags.hover || this.flags.pressed || this.flags.focus || this.preview !== null;
  }

  /** What the element shows for the current state: data attributes for the CSS, flags for the surface. */
  private syncState() {
    const el = this.el;
    const hover = this.flags.hover || this.preview === 'hover';
    const pressed = this.flags.pressed || this.preview === 'pressed';
    el.toggleAttribute('data-hover', hover);
    el.toggleAttribute('data-pressed', pressed);
    if (this.preview) el.setAttribute('data-preview-state', this.preview);
    else el.removeAttribute('data-preview-state');
    el.setAttribute('data-surface', this.surfaceShown() ? 'shown' : 'rest');
    const s = this.surface;
    if (!s) return;
    s.setDisabled(this.isDisabled());
    s.setHovered(hover);
    // Press feedback only when the definition asks for it; Glass places its light at the contact point.
    s.setPressed(pressed && this.props.pressFeedback);
  }

  private syncMotion() {
    this.el.toggleAttribute('data-motion-reduced', this.binding.status.motionReduced);
  }

  private attach() {
    if (this.surface) return;
    this.surface = this.binding.attach(this.el, { radius: this.props.layout.radius });
    this.surface.setDisabled(this.options.disabled ?? this.props.disabled);
    this.syncState();
  }

  private detach() {
    if (!this.surface) return;
    this.binding.detach(this.surface);
    this.surface = null;
  }

  // ---------- input ----------

  private bind() {
    const el = this.el;
    const win = el.ownerDocument.defaultView;
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => this.render()) : null;
    this.resizeObserver?.disconnect();
    this.resizeObserver = ro;
    ro?.observe(this.layoutParent());
    const point = (e: PointerEvent) => relative(el, e.clientX, e.clientY);
    const on = <K extends keyof HTMLElementEventMap>(type: K, fn: (e: HTMLElementEventMap[K]) => void) => {
      el.addEventListener(type, fn);
      this.cleanups.push(() => el.removeEventListener(type, fn));
    };
    on('pointerenter', (e) => {
      if (!this.interactive || e.pointerType === 'touch' || this.isDisabled()) return;
      this.flags.hover = true;
      this.syncState();
      this.report('hover', 'pointer');
    });
    on('pointerleave', () => {
      this.flags.hover = false;
      this.release();
    });
    on('pointerdown', (e) => {
      if (!this.interactive || !e.isPrimary || e.button !== 0 || this.pointer !== null || this.isDisabled()) return;
      this.pointer = e.pointerId;
      this.flags.pressed = true;
      this.syncState();
      this.surface?.setPressed(this.props.pressFeedback, point(e));
    });
    on('pointermove', (e) => {
      if (e.pointerId === this.pointer && this.props.pressFeedback) this.surface?.setPressed(true, point(e));
    });
    on('pointerup', (e) => e.pointerId === this.pointer && this.release());
    on('pointercancel', (e) => {
      if (e.pointerId !== this.pointer) return;
      this.flags.hover = false;
      this.release();
    });
    on('keydown', (e) => {
      if (!this.interactive || e.repeat || this.isDisabled()) return;
      // A button activates on Enter and Space, a link on Enter only: the same keys the browser uses.
      if (e.key === 'Enter' || (e.key === ' ' && this.el.tagName === 'BUTTON')) {
        this.flags.pressed = true;
        this.syncState();
        this.surface?.setPressed(this.props.pressFeedback, { x: 0.5, y: 0.5 });
      }
    });
    on('keyup', (e) => (e.key === 'Enter' || e.key === ' ') && this.release());
    on('focus', () => {
      this.flags.focus = el.matches(':focus-visible');
      this.syncState();
      // `:focus-visible` is the browser's own answer to "did this focus come from the keyboard?".
      if (this.interactive) this.report('focus', this.flags.focus ? 'keyboard' : 'pointer');
    });
    on('blur', () => {
      this.flags.focus = false;
      this.release();
    });
    on('click', (e) => {
      if (!this.interactive || this.isDisabled()) {
        // A disabled link or an inert preview never acts, whatever the browser would do.
        e.preventDefault();
        return;
      }
      if (this.el.tagName === 'A' && this.options.inertLinks) e.preventDefault();
      this.activate(e.detail === 0 ? 'keyboard' : 'pointer');
    });
    if (win) {
      const cancel = () => this.release();
      const resize = () => this.render();
      win.addEventListener('blur', cancel);
      win.addEventListener('resize', resize);
      this.cleanups.push(() => win.removeEventListener('blur', cancel), () => win.removeEventListener('resize', resize));
    }
  }

  private isDisabled(): boolean {
    return this.preview === 'disabled' || (this.options.disabled ?? this.props.disabled);
  }

  private release() {
    this.pointer = null;
    this.flags.pressed = false;
    this.syncState();
  }

  private event(trigger: ButtonEvent['trigger']): ButtonEvent {
    return { value: this.props.value, href: this.props.semantics === 'link' ? this.props.href : null, trigger };
  }

  private report(kind: 'press' | 'hover' | 'focus', trigger: ButtonEvent['trigger']) {
    const e = this.event(trigger);
    const name = this.props.events[kind];
    if (kind === 'press') this.options.onPress?.(e);
    else if (kind === 'hover') this.options.onHover?.(e);
    else this.options.onFocus?.(e);
    this.el.dispatchEvent(new CustomEvent(name, { detail: e, bubbles: true }));
  }

  private activate(trigger: ButtonEvent['trigger']) {
    if (this.isDisabled()) return;
    this.report('press', trigger);
  }
}

export function createButton(options: JelloButtonOptions): JelloButton {
  const b = new JelloButton(options);
  b.mount();
  return b;
}

function renderIcon(doc: Document, icon: NonNullable<ButtonProps['icon']>): SVGSVGElement | null {
  const tree = iconTree(icon);
  if (!tree) return null;
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'jello-btn-icon');
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

function relative(el: HTMLElement, x: number, y: number) {
  const r = el.getBoundingClientRect();
  return {
    x: r.width ? Math.min(1, Math.max(0, (x - r.left) / r.width)) : 0.5,
    y: r.height ? Math.min(1, Math.max(0, (y - r.top) / r.height)) : 0.5,
  };
}
