/**
 * SolidGroup: Solid on real DOM components.
 *
 * One group = one Solid material + the surfaces attached to it. Unlike Glass
 * there is no source, no filter, no canvas and no layout measurement: a
 * surface is a positioned span whose appearance is a handful of CSS variables
 * on the host, recomputed from `resolveSolid` when the state or the material
 * changes. Transitions are CSS (runtime/solid.css), so a state change costs a
 * few style writes and no JavaScript animation loop.
 *
 *   const group = createSolidGroup({ material });
 *   const surface = group.attach(button, { interaction: 'interactive' });
 *   surface.setActive(true);          // persistent states are set by the host
 *   surface.setDisabled(true);        // aria-disabled / disabled stay the host's job
 *   group.setMaterial(next);          // → { changed: ['material.fill', …], stages }
 *   group.destroy();                  // layers, variables, listeners
 *
 * Hover and press are bound with `interaction: 'interactive'` (pointer and
 * keyboard, through the same bindPress Glass uses); with 'none' (default) the
 * host drives every state with the setters.
 */

import { bindPress } from '../core/interaction';
import { NO_FLAGS, diffSolid, resolveSolid, solidStagesFor, type SolidDocument, type SolidFlags, type SolidStage, type SolidState, type SolidStyle } from '../model/solid';
import type { MaterialStatusBase, MaterialSurface } from './material-types';
import './solid.css';

export interface SolidGroupOptions {
  material: SolidDocument;
  /** Write shadows with `color-mix()` (default: detected). `false` writes `rgba()`, for browsers without it. */
  colorMix?: boolean;
}

/** `color-mix()` is supported (CSS Color 5). Anything unknown counts as unsupported. */
export function supportsColorMix(): boolean {
  try {
    return typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('color', 'color-mix(in srgb, red 50%, transparent)');
  } catch {
    return false;
  }
}

export interface SolidAttachOptions {
  /** Overrides the document's shape: px, or `capsule` (half of the short side). */
  radius?: number | 'capsule';
  /** `interactive`: hover and press follow pointer and keyboard. `none` (default): the host sets states. */
  interaction?: 'none' | 'interactive';
  /** Initial persistent flags. */
  flags?: Partial<Pick<SolidFlags, 'active' | 'disabled'>>;
}

export interface SolidStatus extends MaterialStatusBase {
  family: 'solid';
}

export interface SolidUpdateReport {
  /** Changed paths, e.g. `material.fill`, `states.hover.elevation`. */
  changed: string[];
  stages: SolidStage[];
  /** Surfaces whose variables were rewritten (0 when nothing changed). */
  surfaces: number;
}

const REDUCED = '(prefers-reduced-motion: reduce)';
const VARS = ['fg', 'opacity', 'duration', 'ease', 'fill', 'sheen', 'border', 'border-w', 'shadow', 'scale', 'radius'] as const;

export class SolidSurface implements MaterialSurface {
  readonly host: HTMLElement;
  readonly layer: HTMLSpanElement;
  /** Increments with every variable write that changed something; tests use it to prove no-op updates stay no-ops. */
  writes = 0;

  private readonly group: SolidGroup;
  private radiusOption: number | 'capsule' | undefined;
  private flags: SolidFlags = { ...NO_FLAGS };
  private applied = new Map<string, string>();
  private current: SolidStyle | null = null;
  private readonly cleanups: (() => void)[] = [];
  private destroyed = false;

  constructor(group: SolidGroup, host: HTMLElement, options: SolidAttachOptions) {
    this.group = group;
    this.host = host;
    this.radiusOption = options.radius;
    this.flags = { ...NO_FLAGS, ...options.flags };
    this.layer = host.ownerDocument.createElement('span');
    this.layer.className = 'jello-solid';
    this.layer.setAttribute('aria-hidden', 'true');
    host.classList.add('jello-solid-host');
    host.prepend(this.layer);
    this.apply();
    if (options.interaction === 'interactive') this.bindInput();
  }

  /** The dominant state (disabled > pressed > hover > active > default). */
  get state(): SolidState {
    return this.current?.state ?? 'default';
  }

  /** The values last written to the host. */
  get style(): SolidStyle {
    return this.current ?? resolveSolid(this.group.material, this.flags);
  }

  setFlags(next: Partial<SolidFlags>): void {
    if (this.destroyed) return;
    this.flags = { ...this.flags, ...next };
    this.apply();
  }

  setHovered(hover: boolean): void {
    this.setFlags({ hover });
  }

  /** Press feedback; the point is unused (Solid has no local light). */
  setPressed(pressed: boolean): void {
    this.setFlags({ pressed });
  }

  /** Selected / current (a tab, a toggled button). Persistent: the host owns it. */
  setActive(active: boolean): void {
    this.setFlags({ active });
  }

  setDisabled(disabled: boolean): void {
    this.setFlags({ disabled });
  }

  setRadius(radius: number | 'capsule' | undefined): void {
    this.radiusOption = radius;
    this.apply();
  }

  /** Rewrites the variables from the group's current material. */
  refresh(): void {
    this.apply();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const c of this.cleanups.splice(0)) c();
    this.layer.remove();
    this.host.classList.remove('jello-solid-host');
    this.host.removeAttribute('data-jello-state');
    for (const v of VARS) this.host.style.removeProperty(`--jsolid-${v}`);
    this.applied.clear();
    this.current = null;
  }

  private apply() {
    if (this.destroyed) return;
    const s = resolveSolid(this.group.material, this.flags, { colorMix: this.group.colorMix });
    this.current = s;
    const radius = this.radiusOption ?? s.radius;
    this.set('fg', s.foreground);
    this.set('opacity', String(s.opacity));
    this.set('duration', `${s.duration}ms`);
    this.set('ease', s.easing);
    this.set('fill', s.fill);
    this.set('sheen', s.sheen);
    this.set('border', s.borderColor);
    this.set('border-w', `${s.borderWidth}px`);
    this.set('shadow', s.shadow);
    this.set('scale', String(s.scale));
    this.set('radius', radius === 'capsule' ? '9999px' : `${radius}px`);
    if (this.host.getAttribute('data-jello-state') !== s.state) this.host.setAttribute('data-jello-state', s.state);
  }

  private set(name: (typeof VARS)[number], value: string) {
    if (this.applied.get(name) === value) return;
    this.applied.set(name, value);
    this.host.style.setProperty(`--jsolid-${name}`, value);
    this.writes++;
  }

  private bindInput() {
    const el = this.host;
    const enter = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') this.setHovered(true);
    };
    const leave = () => this.setHovered(false);
    el.addEventListener('pointerenter', enter);
    el.addEventListener('pointerleave', leave);
    el.addEventListener('pointercancel', leave);
    this.cleanups.push(
      () => el.removeEventListener('pointerenter', enter),
      () => el.removeEventListener('pointerleave', leave),
      () => el.removeEventListener('pointercancel', leave),
      bindPress(this),
    );
  }
}

export class SolidGroup {
  private doc: SolidDocument;
  private readonly surfaces = new Set<SolidSurface>();
  private readonly listeners = new Set<(s: SolidStatus) => void>();
  private readonly cleanups: (() => void)[] = [];
  private reduced: boolean;
  private destroyed = false;
  /** Whether shadows are written with `color-mix()`; decided once per group. */
  readonly colorMix: boolean;

  constructor(options: SolidGroupOptions) {
    this.doc = options.material;
    this.colorMix = options.colorMix ?? supportsColorMix();
    const mq = typeof globalThis.matchMedia === 'function' ? globalThis.matchMedia(REDUCED) : null;
    this.reduced = mq?.matches ?? false;
    if (mq) {
      const onChange = () => {
        this.reduced = mq.matches;
        this.emit();
      };
      mq.addEventListener('change', onChange);
      this.cleanups.push(() => mq.removeEventListener('change', onChange));
    }
  }

  get material(): SolidDocument {
    return this.doc;
  }

  /** Solid never suspends: there is no loop, no observer and no source to wait for. */
  get status(): SolidStatus {
    return { family: 'solid', suspended: false, motionReduced: this.reduced, reasons: [] };
  }

  attach(host: HTMLElement, options: SolidAttachOptions = {}): SolidSurface {
    if (this.destroyed) throw new Error('Il gruppo è stato distrutto');
    for (const s of this.surfaces) if (s.host === host) throw new Error('Questo elemento ha già una superficie Solid in questo gruppo');
    const surface = new SolidSurface(this, host, options);
    this.surfaces.add(surface);
    return surface;
  }

  detach(surface: SolidSurface): void {
    if (this.surfaces.delete(surface)) surface.destroy();
  }

  /** Cheap by construction: only the surfaces' variables are rewritten, and only if the document changed. */
  setMaterial(doc: SolidDocument): SolidUpdateReport {
    const changed = diffSolid(this.doc, doc);
    this.doc = doc;
    if (!changed.length) return { changed, stages: [], surfaces: 0 };
    for (const s of this.surfaces) s.refresh();
    return { changed, stages: [...solidStagesFor(changed)], surfaces: this.surfaces.size };
  }

  onStatus(listener: (s: SolidStatus) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Nothing to measure; present so Solid and Glass groups share a lifecycle. */
  invalidate(): void {}
  suspend(): void {}
  resume(): void {}

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const s of this.surfaces) s.destroy();
    this.surfaces.clear();
    for (const c of this.cleanups.splice(0)) c();
    this.listeners.clear();
  }

  private emit() {
    if (this.destroyed || !this.listeners.size) return;
    const s = this.status;
    for (const l of this.listeners) l(s);
  }
}

export function createSolidGroup(options: SolidGroupOptions): SolidGroup {
  return new SolidGroup(options);
}
