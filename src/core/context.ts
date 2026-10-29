/**
 * GlassContext ties one GlassSource (the element whose content may be
 * refracted) to the surfaces drawn above it, chooses the render path and
 * owns every global listener, so destroy() leaves nothing behind.
 */

import type { GlassParams } from './params';
import {
  detectCapabilities,
  findVerification,
  parseEngine,
  resolvePath,
  type Capabilities,
  type EngineInfo,
  type PathRequest,
  type RenderPath,
  type VerificationRecord,
} from './renderer/capabilities';
import { SourceFilter, type FilterStats, type LensInput } from './renderer/source-filter';
import { GlassSurface, type SurfaceHost, type SurfaceOptions } from './surface';

export interface GlassContextOptions {
  source: HTMLElement;
  path?: PathRequest;
  /** Only use refraction where a raster verification record matches this engine. */
  requireVerified?: boolean;
  verification?: readonly VerificationRecord[];
  /** Map pixels per CSS px. */
  resolution?: number;
  /** `auto`: on for WebKit (not Chromium) user agents. */
  refreshIdOnUpdate?: boolean | 'auto';
  /** End of the fallback chain when refraction is requested but not usable. */
  fallback?: 'satin' | 'opaque';
  /** Maps kept in the renderer cache (LRU). */
  mapCacheSize?: number;
  /** Verification records count only for this runtime version (see findVerification). */
  runtimeVersion?: string;
}

export interface ContextStatus {
  configured: PathRequest;
  detected: Capabilities;
  engine: EngineInfo;
  verified: VerificationRecord | null;
  effective: RenderPath;
  reasons: string[];
  motionReduced: boolean;
  suspended: boolean;
}

const QUERIES = {
  reducedTransparency: '(prefers-reduced-transparency: reduce)',
  contrastMore: '(prefers-contrast: more)',
  forcedColors: '(forced-colors: active)',
  reducedMotion: '(prefers-reduced-motion: reduce)',
} as const;

export class GlassContext implements SurfaceHost {
  readonly source: HTMLElement;
  readonly renderer: SourceFilter;
  private readonly win: Window & typeof globalThis;
  private readonly surfaces = new Set<GlassSurface>();
  private readonly listeners = new Set<(status: ContextStatus) => void>();
  private readonly cleanups: (() => void)[] = [];
  private readonly measureQueue = new Set<GlassSurface>();
  private readonly verification: readonly VerificationRecord[];
  private readonly requireVerified: boolean;
  private readonly runtimeVersion: string | undefined;
  private readonly caps: Capabilities;
  private readonly engine: EngineInfo;
  private readonly media: Record<keyof typeof QUERIES, MediaQueryList>;
  private configured: PathRequest;
  private fallback: 'satin' | 'opaque';
  private suspended = false;
  private manualTransparency = false;
  private manualMotion = false;
  private measureRaf = 0;
  private current: ContextStatus;
  private destroyed = false;

  constructor(options: GlassContextOptions) {
    this.source = options.source;
    this.win = (options.source.ownerDocument.defaultView ?? window) as Window & typeof globalThis;
    this.configured = options.path ?? 'auto';
    this.fallback = options.fallback ?? 'satin';
    this.requireVerified = options.requireVerified ?? false;
    this.verification = options.verification ?? [];
    this.runtimeVersion = options.runtimeVersion;
    this.caps = detectCapabilities(this.win);
    this.engine = parseEngine(this.win.navigator.userAgent);
    const refresh =
      options.refreshIdOnUpdate === undefined || options.refreshIdOnUpdate === 'auto'
        ? this.engine.engine === 'webkit'
        : options.refreshIdOnUpdate;
    this.renderer = new SourceFilter(this.source, {
      resolution: options.resolution ?? 1,
      refreshIdOnUpdate: refresh,
      ...(options.mapCacheSize ? { mapCacheSize: options.mapCacheSize } : {}),
    });
    this.source.classList.add('jello-source');

    this.media = Object.fromEntries(
      Object.entries(QUERIES).map(([k, q]) => [k, this.win.matchMedia(q)]),
    ) as Record<keyof typeof QUERIES, MediaQueryList>;
    for (const mql of Object.values(this.media)) this.listen(mql, 'change', () => this.refresh());

    const ro = new this.win.ResizeObserver(() => this.measureAll());
    ro.observe(this.source);
    this.cleanups.push(() => ro.disconnect());
    this.listen(this.win, 'resize', () => this.measureAll());
    const cancel = () => this.cancelInteractions();
    this.listen(this.win.document, 'visibilitychange', () => {
      if (this.win.document.visibilityState !== 'visible') cancel();
    });
    this.listen(this.win, 'blur', cancel);
    this.listen(this.win, 'pagehide', cancel);

    this.current = this.computeStatus();
    this.applyPath();
  }

  get path(): RenderPath {
    return this.current.effective;
  }

  get motionReduced(): boolean {
    return this.current.motionReduced;
  }

  get status(): ContextStatus {
    return this.current;
  }

  get stats(): FilterStats & { surfaces: number; animating: number } {
    let animating = 0;
    for (const s of this.surfaces) if (s.animating) animating++;
    return { ...this.renderer.stats, surfaces: this.surfaces.size, animating };
  }

  setPath(request: PathRequest): void {
    this.configured = request;
    this.refresh();
  }

  setFallback(fallback: 'satin' | 'opaque'): void {
    if (fallback === this.fallback) return;
    this.fallback = fallback;
    this.refresh();
  }

  /** Map pixels per CSS px. Every lens regenerates its map once at the new resolution. */
  setResolution(resolution: number): void {
    if (resolution === this.renderer.mapResolution) return;
    this.renderer.setResolution(resolution);
    for (const s of this.surfaces) s.invalidate();
  }

  /**
   * Off-screen or hidden: gestures are cancelled and layout reads are
   * deferred until resume(). There is no JS loop to stop at rest; what the
   * browser still composites is outside this object's control.
   */
  suspend(): void {
    if (this.suspended || this.destroyed) return;
    this.suspended = true;
    this.cancelInteractions();
    if (this.measureRaf) cancelAnimationFrame(this.measureRaf);
    this.measureRaf = 0;
    this.refresh();
  }

  resume(): void {
    if (!this.suspended || this.destroyed) return;
    this.suspended = false;
    this.refresh();
    this.measureAll();
  }

  get isSuspended(): boolean {
    return this.suspended;
  }

  setManualReduceTransparency(on: boolean): void {
    this.manualTransparency = on;
    this.refresh();
  }

  setManualReduceMotion(on: boolean): void {
    this.manualMotion = on;
    this.refresh();
  }

  onChange(listener: (status: ContextStatus) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  attach(host: HTMLElement, options: SurfaceOptions): GlassSurface {
    const surface = new GlassSurface(this, host, options);
    this.surfaces.add(surface);
    const ro = new this.win.ResizeObserver(() => this.requestMeasure(surface));
    ro.observe(host);
    const off = () => ro.disconnect();
    surfaceCleanups.set(surface, off);
    return surface;
  }

  /** Re-measure every surface (layout changed outside the observed boxes). */
  measureAll(): void {
    for (const s of this.surfaces) this.measureQueue.add(s);
    this.scheduleMeasure();
  }

  requestMeasure(surface: GlassSurface): void {
    this.measureQueue.add(surface);
    this.scheduleMeasure();
  }

  upsertLens(id: string, input: LensInput): void {
    this.renderer.upsert(id, input);
  }

  removeLens(id: string): void {
    this.renderer.remove(id);
  }

  detach(surface: GlassSurface): void {
    this.surfaces.delete(surface);
    this.measureQueue.delete(surface);
    surfaceCleanups.get(surface)?.();
    surfaceCleanups.delete(surface);
  }

  cancelInteractions(): void {
    for (const s of this.surfaces) s.cancelInteraction();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const s of [...this.surfaces]) s.destroy();
    if (this.measureRaf) cancelAnimationFrame(this.measureRaf);
    for (const c of this.cleanups.splice(0)) c();
    this.listeners.clear();
    this.renderer.destroy();
    this.source.classList.remove('jello-source');
    delete this.source.dataset.jelloPath;
  }

  private scheduleMeasure() {
    if (this.measureRaf || this.destroyed || this.suspended) return;
    this.measureRaf = requestAnimationFrame(() => {
      this.measureRaf = 0;
      this.flushMeasure();
    });
  }

  /** All layout reads first, then all writes. */
  private flushMeasure() {
    const src = this.source.getBoundingClientRect();
    const reads: [GlassSurface, { x: number; y: number; width: number; height: number }][] = [];
    for (const s of this.measureQueue) {
      if (s.sizing === 'element') {
        const r = s.host.getBoundingClientRect();
        reads.push([s, { x: r.left - src.left, y: r.top - src.top, width: r.width, height: r.height }]);
      } else {
        // Free surfaces are positioned from their offset parent's origin;
        // only that origin is read here, the translation is known.
        const parent = s.host.offsetParent ?? this.source;
        const p = parent.getBoundingClientRect();
        reads.push([s, { x: p.left - src.left, y: p.top - src.top, width: 0, height: 0 }]);
      }
    }
    this.measureQueue.clear();
    this.renderer.resize(src.width, src.height);
    for (const [s, rect] of reads) s.setBase(rect);
  }

  private computeStatus(): ContextStatus {
    const verified = findVerification(this.engine, this.verification, this.runtimeVersion);
    const prefs = {
      reducedTransparency: this.media.reducedTransparency.matches,
      contrastMore: this.media.contrastMore.matches,
      forcedColors: this.media.forcedColors.matches,
      manualReduceTransparency: this.manualTransparency,
    };
    const { effective, reasons } = resolvePath(this.configured, this.caps, prefs, {
      requireVerified: this.requireVerified,
      verified: verified !== null,
      fallback: this.fallback,
    });
    return {
      configured: this.configured,
      detected: this.caps,
      engine: this.engine,
      verified,
      effective,
      reasons,
      motionReduced: this.manualMotion || this.media.reducedMotion.matches,
      suspended: this.suspended,
    };
  }

  private refresh() {
    if (this.destroyed) return;
    const prev = this.current;
    this.current = this.computeStatus();
    if (prev.effective !== this.current.effective) this.applyPath();
    if (prev.motionReduced !== this.current.motionReduced) this.cancelInteractions();
    for (const l of this.listeners) l(this.current);
  }

  private applyPath() {
    const path = this.current.effective;
    this.source.dataset.jelloPath = path;
    this.renderer.setActive(path === 'refraction');
    for (const s of this.surfaces) s.setPath(path);
  }

  private listen(target: EventTarget, type: string, fn: () => void) {
    target.addEventListener(type, fn);
    this.cleanups.push(() => target.removeEventListener(type, fn));
  }
}

const surfaceCleanups = new WeakMap<GlassSurface, () => void>();

export type { GlassParams };
