/**
 * GlassSurface: geometry and material of one lens, plus its motion.
 *
 * DOM contract (see docs/rendering.md):
 *   host (.jello-host)          positioned above the GlassSource, not inside it
 *     span.jello-surface        material layer: tint, light, shadow; aria-hidden
 *     …foreground…              text, icons and controls, never filtered or scaled
 *
 * Motion only writes transforms, one CSS variable and lens subregion
 * attributes; the displacement map is regenerated only on geometry changes.
 */

import { effectiveRadius, type GlassParams } from './params';
import type { LensGeometry } from './geometry';
import type { LensInput } from './renderer/source-filter';
import type { RenderPath } from './renderer/capabilities';
import { isSettled, snapSpring, spring, stepSpring } from './spring';

export type Sizing = 'params' | 'element';

export interface SurfaceOptions {
  params: GlassParams;
  /**
   * `params`: free surface sized by params.width/height and moved with
   * setPosition (the draggable capsule). `element`: sized and placed by the
   * host's own layout (button, selector, slider thumb).
   */
  sizing: Sizing;
  /** Corner radius for `element` sizing; defaults to a capsule. */
  radius?: number | 'capsule';
}

/** What a surface needs from its context. Implemented by GlassContext. */
export interface SurfaceHost {
  readonly path: RenderPath;
  readonly motionReduced: boolean;
  upsertLens(id: string, input: LensInput): void;
  removeLens(id: string): void;
  requestMeasure(surface: GlassSurface): void;
  detach(surface: GlassSurface): void;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

let surfaces = 0;

export class GlassSurface {
  readonly id: string;
  readonly host: HTMLElement;
  readonly layer: HTMLSpanElement;
  readonly sizing: Sizing;
  /** Increments whenever a motion frame runs; used by tests to prove the loop stops. */
  frames = 0;

  private params: GlassParams;
  private readonly radiusOption: number | 'capsule';
  private readonly ctx: SurfaceHost;
  private readonly x = spring(0);
  private readonly y = spring(0);
  private readonly press = spring(0);
  /** Layout rect (element sizing) or origin offset (params sizing), source coords. */
  private base: Rect = { x: 0, y: 0, width: 0, height: 0 };
  private raf = 0;
  private last = 0;
  private pointer = { x: 0.5, y: 0.5, dirty: false };
  private destroyed = false;
  private pressed = false;

  constructor(ctx: SurfaceHost, host: HTMLElement, options: SurfaceOptions) {
    this.id = `jello-surface-${++surfaces}`;
    this.ctx = ctx;
    this.host = host;
    this.sizing = options.sizing;
    this.params = options.params;
    this.radiusOption = options.radius ?? 'capsule';
    host.classList.add('jello-host');
    host.dataset.jelloSizing = options.sizing;
    const layer = host.ownerDocument.createElement('span');
    layer.className = 'jello-surface';
    layer.setAttribute('aria-hidden', 'true');
    host.prepend(layer);
    this.layer = layer;
    this.applyParams();
    this.setPath(ctx.path);
    ctx.requestMeasure(this);
  }

  get position(): { x: number; y: number } {
    return { x: this.x.target, y: this.y.target };
  }

  get isPressed(): boolean {
    return this.pressed;
  }

  get animating(): boolean {
    return this.raf !== 0;
  }

  getParams(): GlassParams {
    return this.params;
  }

  setParams(params: GlassParams): void {
    this.params = params;
    this.applyParams();
    if (this.sizing === 'element') this.ctx.requestMeasure(this);
    this.render();
  }

  setPath(path: RenderPath): void {
    this.layer.dataset.jelloPath = path;
    this.host.dataset.jelloPath = path;
    if (path !== 'refraction') this.ctx.removeLens(this.id);
    else this.render();
  }

  /** Moves a `params` surface (source coordinates of its top-left corner). */
  setPosition(x: number, y: number, immediate = false): void {
    this.x.target = x;
    this.y.target = y;
    if (immediate || this.ctx.motionReduced) {
      snapSpring(this.x);
      snapSpring(this.y);
      this.render();
    }
    this.wake();
  }

  /** Transient press. `point` is relative to the host, in [0, 1]. */
  setPressed(pressed: boolean, point?: { x: number; y: number }): void {
    if (point) {
      this.pointer.x = point.x;
      this.pointer.y = point.y;
      this.pointer.dirty = true;
    }
    if (pressed === this.pressed && !point) return;
    this.pressed = pressed;
    this.host.toggleAttribute('data-pressed', pressed);
    this.press.target = pressed ? 1 : 0;
    if (this.ctx.motionReduced) snapSpring(this.press);
    this.wake();
  }

  /** Called by the context after batched layout reads. */
  setBase(rect: Rect): void {
    const b = this.base;
    if (b.x === rect.x && b.y === rect.y && b.width === rect.width && b.height === rect.height) return;
    this.base = rect;
    this.render();
  }

  /** Current lens rect in source coordinates, without transient scale. */
  get rect(): Rect {
    if (this.sizing === 'element') return { ...this.base };
    return {
      x: this.base.x + this.x.value,
      y: this.base.y + this.y.value,
      width: this.params.width,
      height: this.params.height,
    };
  }

  /** Clears transient interaction state (gesture cancelled, page hidden). */
  cancelInteraction(): void {
    this.setPressed(false);
    snapSpring(this.x);
    snapSpring(this.y);
    this.render();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.ctx.removeLens(this.id);
    this.ctx.detach(this);
    this.layer.remove();
    this.host.classList.remove('jello-host');
    this.host.removeAttribute('data-pressed');
    this.host.style.removeProperty('transform');
  }

  private wake() {
    if (this.raf || this.destroyed) return;
    this.last = 0;
    this.raf = requestAnimationFrame(this.tick);
  }

  private readonly tick = (now: number) => {
    this.raf = 0;
    if (this.destroyed) return;
    this.frames++;
    const dt = this.last ? (now - this.last) / 1000 : 1 / 60;
    this.last = now;
    const config = { stiffness: this.params.stiffness, damping: this.params.damping };
    if (this.ctx.motionReduced) {
      snapSpring(this.x);
      snapSpring(this.y);
      snapSpring(this.press);
    } else {
      stepSpring(this.x, dt, config);
      stepSpring(this.y, dt, config);
      // Press responds faster than travel and never overshoots much.
      stepSpring(this.press, dt, { stiffness: config.stiffness * 2.5, damping: Math.max(0.8, config.damping) });
    }
    this.render();
    const settled = isSettled(this.x, 0.05) && isSettled(this.y, 0.05) && isSettled(this.press, 0.002, 0.01);
    if (!settled) {
      this.raf = requestAnimationFrame(this.tick);
    } else {
      snapSpring(this.x);
      snapSpring(this.y);
      snapSpring(this.press);
      this.render();
      this.last = 0;
    }
  };

  private deformation(): { sx: number; sy: number } {
    const p = this.params;
    const reduced = this.ctx.motionReduced;
    const press = reduced ? 0 : this.press.value;
    const s = 1 + (p.pressScale - 1) * press;
    let sx = s;
    let sy = s;
    if (!reduced && p.stretch > 0) {
      const vx = this.x.velocity;
      const vy = this.y.velocity;
      const speed = Math.hypot(vx, vy);
      if (speed > 1) {
        const e = Math.min(1, speed / 2400) * p.stretch;
        const k = (vx * vx - vy * vy) / (speed * speed);
        sx *= 1 + e * k;
        sy *= 1 - e * k;
      }
    }
    return { sx, sy };
  }

  private render() {
    if (this.destroyed) return;
    const p = this.params;
    const { sx, sy } = this.deformation();
    if (this.sizing === 'params') {
      this.host.style.transform = `translate3d(${r2(this.x.value)}px, ${r2(this.y.value)}px, 0)`;
    }
    this.layer.style.transform = sx === 1 && sy === 1 ? '' : `scale(${r4(sx)}, ${r4(sy)})`;
    this.layer.style.setProperty('--jello-press', r4(this.press.value).toString());
    if (this.pointer.dirty) {
      this.pointer.dirty = false;
      this.layer.style.setProperty('--jello-px', `${r2(this.pointer.x * 100)}%`);
      this.layer.style.setProperty('--jello-py', `${r2(this.pointer.y * 100)}%`);
    }
    if (this.ctx.path !== 'refraction') return;
    const rect = this.rect;
    if (rect.width <= 0 || rect.height <= 0) return;
    const press = this.ctx.motionReduced ? 0 : this.press.value;
    this.ctx.upsertLens(this.id, {
      ...rect,
      scaleX: sx,
      scaleY: sy,
      geometry: this.geometry(rect),
      refraction: p.refraction * (1 + p.pressRefraction * press),
      blur: p.blur,
      saturation: p.saturation,
      chroma: p.chroma,
    });
  }

  private geometry(rect: Rect): LensGeometry {
    const p = this.params;
    let radius: number;
    if (this.sizing === 'params') radius = effectiveRadius(p);
    else if (this.radiusOption === 'capsule') radius = Math.min(rect.width, rect.height) / 2;
    else radius = Math.min(this.radiusOption, rect.width / 2, rect.height / 2);
    return { width: rect.width, height: rect.height, radius, band: p.band, profile: p.profile, dome: p.dome };
  }

  private applyParams() {
    const p = this.params;
    const s = this.layer.style;
    const h = this.host.style;
    if (this.sizing === 'params') {
      h.width = `${p.width}px`;
      h.height = `${p.height}px`;
      s.setProperty('--jello-radius', `${effectiveRadius(p)}px`);
    } else {
      s.setProperty('--jello-radius', this.radiusOption === 'capsule' ? '9999px' : `${this.radiusOption}px`);
    }
    // Inherited by the host so foreground controls (focus ring, selection pill) can match.
    h.setProperty('--jello-host-radius', s.getPropertyValue('--jello-radius'));
    const rgb = hexToRgb(p.tint);
    s.setProperty('--jello-tint', `${rgb[0]} ${rgb[1]} ${rgb[2]}`);
    s.setProperty('--jello-tint-a', String(p.tintOpacity));
    s.setProperty('--jello-blur', `${p.blur}px`);
    s.setProperty('--jello-saturation', `${p.saturation}%`);
    s.setProperty('--jello-light', String(p.light));
    s.setProperty('--jello-light-angle', `${p.lightAngle}deg`);
    const a = (p.lightAngle * Math.PI) / 180;
    // Inner highlight offset toward the light (0° = top, clockwise).
    s.setProperty('--jello-lx', `${r2(Math.sin(a) * 1.5)}px`);
    s.setProperty('--jello-ly', `${r2(-Math.cos(a) * 1.5)}px`);
    s.setProperty('--jello-shadow', String(p.shadow));
    s.setProperty('--jello-shadow-blur', `${p.shadowBlur}px`);
    s.setProperty('--jello-shadow-y', `${p.shadowOffset}px`);
    s.setProperty('--jello-press-light', String(p.pressLight));
  }
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const r4 = (v: number) => Math.round(v * 10000) / 10000;

export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return [255, 255, 255];
  return [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)];
}
