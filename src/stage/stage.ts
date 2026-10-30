/**
 * One preview stage: GlassSource + overlay + the object shown on it.
 *
 * The stage uses the public runtime (GlassGroup), the same code a consumer
 * project imports. Exactly one object is mounted at a time. Unmounting is
 * explicit: the surface is destroyed (its lens leaves the filter, its layer
 * leaves the DOM), every listener and observer bound for it is released and
 * the host is hidden. Nothing relies on a path change to hide a lens.
 */

import { bindDrag } from '../core/interaction';
import type { GlassParams } from '../core/params';
import type { PathRequest, VerificationRecord } from '../core/renderer/capabilities';
import type { GlassSurface } from '../core/surface';
import type { GlassDocument } from '../model/document';
import { createGlassGroup, engineParams, type GlassGroup } from '../runtime/glass-group';
import { BottomNavigation, type BottomNavigationOptions } from '../runtime/bottom-navigation';
import { JelloButton } from '../runtime/button';
import type { ComponentInstance } from '../runtime/component-types';
import type { ComponentDefinition } from '../components';
import { ButtonDemo, CardDemo, DialogDemo, type StageObject } from './components';
import { Navbar } from './navbar';
import type { NavId, ObjectKind } from './view';

export interface StageOptions {
  root: HTMLElement;
  /** `main` or `compare`: ids of the built elements end with it (stageMain, sourceMain…). */
  role: 'main' | 'compare';
  path: PathRequest;
  verification: readonly VerificationRecord[];
  navLabel: string;
  nav: NavId;
  onSelect(id: NavId): void;
  /** Capsule dragged or moved with the keyboard (source coordinates). */
  onCapsuleMove(x: number, y: number): void;
}

const ICON_DROP =
  '<path d="M12 3.2c3.4 4 6 7.4 6 10.4a6 6 0 0 1-12 0c0-3 2.6-6.4 6-10.4Z" /><path d="M9.4 14.6a2.8 2.8 0 0 0 2.6 2.3" />';

/** Stage markup. The ids are part of the lab's test contract (tests/e2e). */
export function buildStage(doc: Document, role: 'main' | 'compare'): HTMLElement {
  const suffix = role === 'main' ? 'Main' : 'Compare';
  const fig = doc.createElement('figure');
  fig.className = 'stage';
  fig.id = `stage${suffix}`;
  fig.dataset.role = role;
  const label = role === 'main' ? 'Contenuto dietro la lente, scorrevole' : 'Contenuto di confronto, scorrevole';
  const capsule =
    role === 'main'
      ? `<div class="capsule" id="capsuleMain" tabindex="0" role="group" aria-label="Capsula glass trascinabile. Usa le frecce per spostarla.">` +
        `<span class="capsule-content"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICON_DROP}</svg>` +
        `<span class="capsule-label">Trascinami</span></span></div>`
      : `<div class="capsule" id="capsuleCompare" tabindex="0" role="group" aria-label="Capsula di confronto, percorso satinato">` +
        `<span class="capsule-content"><span class="capsule-label">Satinato</span></span></div>`;
  fig.innerHTML =
    `<figcaption class="stage-label" id="stage${suffix}Label">${role === 'main' ? 'Percorso selezionato' : 'Satinato'}</figcaption>` +
    `<div class="source" id="source${suffix}"><div class="scroller" tabindex="0" aria-label="${label}"></div></div>` +
    `<div class="overlay">${capsule}</div>`;
  return fig;
}

/** What the editor listens to while a component is shown (a navbar's tabs; a button reports nothing to the editor). */
export type ComponentHandlers = Pick<BottomNavigationOptions, 'onChange' | 'onTabPress' | 'onReselect' | 'activeTab'>;

export class Stage {
  readonly root: HTMLElement;
  readonly source: HTMLElement;
  readonly scroller: HTMLElement;
  readonly overlay: HTMLElement;
  readonly group: GlassGroup;
  readonly capsuleHost: HTMLElement;
  readonly navbar: Navbar;
  readonly button: ButtonDemo;
  readonly card: CardDemo;
  readonly dialog: DialogDemo;
  bounds = { width: 0, height: 0 };
  private kind: ObjectKind | null = null;
  /** Component of the builder, mounted instead of the demo object (same group, same renderer). */
  private componentNav: ComponentInstance | null = null;
  /** Centred box a non-navbar component is laid out in (a navbar positions itself). */
  private componentSlot: HTMLElement | null = null;
  private capsuleSurface: GlassSurface | null = null;
  private capsuleCleanups: (() => void)[] = [];
  private readonly cleanups: (() => void)[] = [];
  private doc: GlassDocument;
  private params: GlassParams;
  private readonly options: StageOptions;

  constructor(options: StageOptions, doc: GlassDocument) {
    this.options = options;
    this.doc = doc;
    this.params = engineParams(doc);
    this.root = options.root;
    this.source = this.root.querySelector<HTMLElement>('.source')!;
    this.scroller = this.source.querySelector<HTMLElement>('.scroller')!;
    this.overlay = this.root.querySelector<HTMLElement>('.overlay')!;
    this.capsuleHost = this.overlay.querySelector<HTMLElement>('.capsule')!;
    this.capsuleHost.hidden = true;
    // The lab suspends stages itself (visibility of the dashboard preview).
    this.group = createGlassGroup({ source: this.source, material: doc, verification: options.verification, autoSuspend: false });
    this.setPath(options.path);
    this.navbar = new Navbar({
      overlay: this.overlay,
      scroller: this.scroller,
      group: this.group,
      label: options.navLabel,
      selected: options.nav,
      onSelect: options.onSelect,
    });
    this.button = new ButtonDemo(this.overlay);
    this.card = new CardDemo(this.overlay);
    this.dialog = new DialogDemo(this.overlay);
    const ro = new ResizeObserver(() => {
      this.bounds = { width: this.overlay.clientWidth, height: this.overlay.clientHeight };
      this.keepInside();
    });
    ro.observe(this.overlay);
    this.bounds = { width: this.overlay.clientWidth, height: this.overlay.clientHeight };
    this.cleanups.push(() => ro.disconnect());
  }

  get ctx() {
    return this.group.context;
  }

  get object(): ObjectKind | null {
    return this.kind;
  }

  get capsule(): GlassSurface | null {
    return this.capsuleSurface;
  }

  private demo(kind: ObjectKind): StageObject | null {
    switch (kind) {
      case 'navbar':
        return this.navbar;
      case 'button':
        return this.button;
      case 'card':
        return this.card;
      case 'dialog':
        return this.dialog;
      case 'capsule':
        return null;
    }
  }

  get component(): ComponentInstance | null {
    return this.componentNav;
  }

  /**
   * Mounts a builder component on this stage's material group. The demo
   * object is unmounted first, so exactly one thing owns the stage. A navbar
   * positions itself in the overlay; a button is centred in a box of its own,
   * and its links are inert (the editor never navigates away).
   */
  showComponent(options: ComponentHandlers & { config: ComponentDefinition }): ComponentInstance {
    this.hideComponent();
    this.unmountObject();
    let instance: ComponentInstance;
    if (options.config.type === 'button') {
      const slot = this.overlay.ownerDocument.createElement('div');
      slot.className = 'component-slot';
      this.overlay.append(slot);
      this.componentSlot = slot;
      instance = new JelloButton({ container: slot, config: options.config, group: this.group, inertLinks: true });
    } else {
      const { config, activeTab, onChange, onTabPress, onReselect } = options;
      instance = new BottomNavigation({
        config,
        container: this.overlay,
        group: this.group,
        scroller: this.scroller,
        anchor: 'container',
        ...(activeTab !== undefined ? { activeTab } : {}),
        ...(onChange ? { onChange } : {}),
        ...(onTabPress ? { onTabPress } : {}),
        ...(onReselect ? { onReselect } : {}),
      });
    }
    instance.mount();
    this.componentNav = instance;
    this.root.dataset.object = 'component';
    return instance;
  }

  /** Removes the builder component (surface, listeners, DOM). The caller re-mounts an object. */
  hideComponent(): void {
    if (!this.componentNav) return;
    this.componentNav.destroy();
    this.componentNav = null;
    this.componentSlot?.remove();
    this.componentSlot = null;
    delete this.root.dataset.object;
  }

  /** Surface of the mounted object. */
  get surface(): GlassSurface | null {
    if (this.componentNav) return this.componentNav.glassSurface;
    if (!this.kind) return null;
    return this.kind === 'capsule' ? this.capsuleSurface : (this.demo(this.kind)?.surface ?? null);
  }

  get host(): HTMLElement {
    if (this.componentNav) return this.componentNav.host;
    if (!this.kind || this.kind === 'capsule') return this.capsuleHost;
    return this.demo(this.kind)!.host;
  }

  /** Lab `path` option: auto/refraction/satin follow the backend, opaque is an inspection override. */
  setPath(path: PathRequest): void {
    this.group.setPathRequest(path === 'auto' ? null : path);
  }

  setObject(kind: ObjectKind, capsuleAt: { x: number; y: number }): void {
    if (this.kind === kind || this.componentNav) return;
    this.unmountObject();
    this.kind = kind;
    this.root.dataset.object = kind;
    const demo = this.demo(kind);
    if (demo) {
      demo.mount(this.ctx, this.params);
      demo.setParams(this.params);
      return;
    }
    this.capsuleHost.hidden = false;
    const surface = this.ctx.attach(this.capsuleHost, { params: this.params, sizing: 'params' });
    this.capsuleSurface = surface;
    this.capsuleCleanups.push(
      bindDrag(surface, { bounds: () => this.bounds, onMove: (x, y) => this.options.onCapsuleMove(x, y) }),
    );
    const c = this.clamp(capsuleAt.x, capsuleAt.y);
    surface.setPosition(c.x, c.y, true);
  }

  setMaterial(doc: GlassDocument) {
    this.doc = doc;
    const report = this.group.setMaterial(doc);
    this.params = engineParams(doc);
    this.capsuleSurface?.setParams(this.params);
    if (this.kind && this.kind !== 'capsule') this.demo(this.kind)?.setParams(this.params);
    if (this.componentNav instanceof BottomNavigation) this.componentNav.setMaterial();
    this.keepInside();
    return report;
  }

  get material(): GlassDocument {
    return this.doc;
  }

  centre(): { x: number; y: number } {
    return {
      x: Math.max(0, (this.bounds.width - this.params.width) / 2),
      y: Math.max(0, Math.min(this.bounds.height * 0.28, this.bounds.height - this.params.height)),
    };
  }

  destroy(): void {
    this.hideComponent();
    this.unmountObject();
    for (const c of this.cleanups.splice(0)) c();
    this.navbar.dispose();
    this.button.dispose();
    this.card.dispose();
    this.dialog.dispose();
    this.group.destroy();
  }

  private unmountObject() {
    if (this.kind && this.kind !== 'capsule') this.demo(this.kind)?.unmount();
    if (this.capsuleSurface) {
      for (const c of this.capsuleCleanups.splice(0)) c();
      this.capsuleSurface.destroy();
      this.capsuleSurface = null;
      this.capsuleHost.hidden = true;
    }
    this.kind = null;
    delete this.root.dataset.object;
  }

  private clamp(x: number, y: number) {
    return {
      x: Math.min(Math.max(0, x), Math.max(0, this.bounds.width - this.params.width)),
      y: Math.min(Math.max(0, y), Math.max(0, this.bounds.height - this.params.height)),
    };
  }

  private keepInside() {
    const s = this.capsuleSurface;
    if (!s) return;
    const { x, y } = s.position;
    const c = this.clamp(x, y);
    if (c.x !== x || c.y !== y) s.setPosition(c.x, c.y, true);
  }
}
