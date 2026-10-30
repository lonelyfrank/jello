/**
 * PreviewController: everything the preview does, without any editor.
 *
 * Used by the lab dashboard (inside its centre column) and by the phone
 * preview page. It owns the stages, their GlassGroups, the scenes and the
 * WebGL2 scene view; it never owns the state. Interactions inside the
 * preview that change state (navbar selection, dock selector and slider)
 * are sent to the host through `onRequest`; the host applies them and calls
 * back setOption / setMaterial. React, when present, is never the clock:
 * motion runs on the runtime's own requestAnimationFrame loops, which run
 * only while something moves.
 */

import { computeLensMap, type LensGeometry } from '../core/geometry';
import type { ContextStatus } from '../core/context';
import { encodeMapAsPng, type FilterStats } from '../core/renderer/source-filter';
import type { GlassSurface } from '../core/surface';
import type { GlassDocument, MaterialDocument } from '../model/document';
import { builtinMaterial } from '../model/builtins';
import type { SolidDocument, SolidState } from '../model/solid';
import type { BottomNavigation } from '../runtime/bottom-navigation';
import { engineParams, type GroupStatus, type UpdateReport } from '../runtime/glass-group';
import type { SceneStatus } from '../runtime/scene-types';
import type { ComponentInstance } from '../runtime/component-types';
import { bindMaterial, componentTemplate, resolveDefinitionMaterial, type ComponentDefinition } from '../components';
import { Dock } from './dock';
import { renderScene, type SceneId } from './scenes';
import { SceneStage } from './scene-stage';
import { buildStage, Stage, type ComponentHandlers } from './stage';
import { VERIFICATION } from './verification';
import type { NavId, ViewOptions } from './view';

export type PreviewRequest =
  | { type: 'option'; key: 'nav'; value: NavId }
  | { type: 'option'; key: 'scene'; value: SceneId }
  | { type: 'param'; key: 'refraction'; value: number };

export interface MapView {
  url: string;
  note: string;
  inUse: boolean;
  key: string;
  surface: string;
  object: string;
}

export interface PreviewReport {
  options: ViewOptions;
  main: ContextStatus;
  group: GroupStatus;
  compare: ContextStatus | null;
  stats: FilterStats & { surfaces: number; animating: number };
  geometry: LensGeometry | null;
  map: MapView | null;
  scene: SceneStatus | null;
  /** Whether a JavaScript animation loop is running right now, and which. */
  loops: string[];
  suspended: boolean;
}

export interface ControllerOptions {
  root: HTMLElement;
  material: MaterialDocument;
  options: ViewOptions;
  onRequest(r: PreviewRequest): void;
  /** Resolves `example:` and `asset:` image URLs of scene textures. */
  resolveAsset?: (url: string) => string;
  /** Default photo of the "photo" scene. */
  photo?: string;
}

const OBJECT_LABEL = { capsule: 'Capsula', navbar: 'Navbar', button: 'Pulsante', card: 'Card', dialog: 'Pannello' } as const;
export const PATH_LABEL = { refraction: 'Rifrazione SVG', satin: 'Satinato CSS', opaque: 'Opaco' } as const;
export const REQUEST_LABEL = { auto: 'Automatico', ...PATH_LABEL } as const;

/** "Opaco · richiesto Satinato CSS" when the request could not be honoured. */
export function stageLabel(status: ContextStatus): string {
  const effective = PATH_LABEL[status.effective];
  if (status.configured === 'auto' || status.configured === status.effective) return effective;
  return `${effective} · richiesto ${REQUEST_LABEL[status.configured]}`;
}

export class PreviewController {
  readonly root: HTMLElement;
  readonly stagesEl: HTMLElement;
  readonly main: Stage;
  private compareStage: Stage | null = null;
  private compareCleanups: (() => void)[] = [];
  private readonly compareRoot: HTMLElement;
  private readonly sceneRoot: HTMLElement;
  private sceneStage: SceneStage | null = null;
  private readonly dock: Dock;
  private readonly opts: ViewOptions;
  private doc: GlassDocument;
  private solidLab: SolidDocument | null = null;
  private materialState: SolidState = 'default';
  private localImage: string | null = null;
  private capsuleAt: { x: number; y: number } | null = null;
  private readonly host: ControllerOptions;
  private readonly listeners = new Set<(r: PreviewReport) => void>();
  private readonly cleanups: (() => void)[] = [];
  private reportTimer = 0;
  private readonly mapOverlay: HTMLImageElement;
  private fallbackMap = { key: '', url: '' };
  private mapView: MapView | null = null;
  private offscreen = false;
  private hidden = false;
  private destroyed = false;
  private componentListeners: (() => void)[] = [];

  constructor(o: ControllerOptions) {
    this.host = o;
    this.root = o.root;
    this.opts = { ...o.options };
    this.doc = o.material.family === 'glass' ? o.material : builtinMaterial('jello')!.doc;
    const doc = o.root.ownerDocument;
    this.stagesEl = doc.createElement('div');
    this.stagesEl.className = 'stages';
    this.stagesEl.id = 'stages';
    this.stagesEl.dataset.compare = 'off';
    const mainRoot = buildStage(doc, 'main');
    this.compareRoot = buildStage(doc, 'compare');
    this.compareRoot.hidden = true;
    this.sceneRoot = doc.createElement('figure');
    this.sceneRoot.className = 'stage scene-stage';
    this.sceneRoot.id = 'stageScene';
    this.sceneRoot.hidden = true;
    this.stagesEl.append(mainRoot, this.compareRoot, this.sceneRoot);
    o.root.append(this.stagesEl);

    this.main = this.makeStage(mainRoot, 'main', this.opts.path, 'Navigazione dimostrativa');
    this.dock = new Dock(this.main.overlay, {
      onCentre: () => this.centreCapsule(),
      onScene: (id) => o.onRequest({ type: 'option', key: 'scene', value: id }),
      onRefraction: (v) => o.onRequest({ type: 'param', key: 'refraction', value: v }),
    });
    this.mapOverlay = doc.createElement('img');
    this.mapOverlay.className = 'map-overlay';
    this.mapOverlay.alt = '';
    this.mapOverlay.setAttribute('aria-hidden', 'true');

    this.cleanups.push(this.main.group.onStatus(() => this.onStatus()));
    const ro = new ResizeObserver(() => this.scheduleReport());
    ro.observe(this.stagesEl);
    this.cleanups.push(() => ro.disconnect());
    this.watchVisibility();
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const onMotion = () => this.syncAnimations();
    motion.addEventListener('change', onMotion);
    this.cleanups.push(() => motion.removeEventListener('change', onMotion));

    this.applyTheme();
    this.applyDevice();
    this.applyObject();
    this.renderScenes();
    this.applyMaterial();
    if (this.opts.compare) this.setCompare(true);
    if (this.opts.showMap) this.stagesEl.classList.add('show-map');
    this.applyMode();
    this.syncMotion();
    if (o.material.family === 'solid') this.setMaterial(o.material);
  }

  // ---------- public API ----------

  get options(): ViewOptions {
    return { ...this.opts };
  }

  get material(): MaterialDocument {
    return this.solidLab ?? this.doc;
  }

  get compare(): Stage | null {
    return this.compareStage;
  }

  get scene(): SceneStage | null {
    return this.sceneStage;
  }

  get dockSurfaces(): readonly GlassSurface[] {
    return this.dock.surfaceList;
  }

  stages(): Stage[] {
    return this.compareStage ? [this.main, this.compareStage] : [this.main];
  }

  setMaterial(doc: MaterialDocument): UpdateReport {
    if (doc.family === 'solid') {
      const state = this.solidLab ? this.materialState : 'default';
      if (this.opts.mode !== 'components') this.setOption('mode', 'components');
      const template = componentTemplate(this.opts.object === 'navbar' ? 'mobile-navbar' : 'button')!.create();
      // A neutral variant shows the material itself rather than the component's accent.
      const config = { ...template, style: { ...template.style, variant: 'secondary' }, layout: { ...template.layout, radius: doc.geometry.shape === 'capsule' ? 'capsule' : doc.geometry.radius }, material: bindMaterial(doc, null) };
      if (this.solidLab && this.main.component?.type === config.type) this.updateComponent(config);
      else this.showComponent(config, { activeTab: this.opts.nav, onChange: (id) => this.host.onRequest({ type: 'option', key: 'nav', value: id as NavId }) });
      this.solidLab = doc;
      this.previewMaterialState(state);
      return { changed: [], stages: [], mapsGenerated: 0 };
    }
    if (this.solidLab) {
      this.solidLab = null;
      this.materialState = 'default';
      this.hideComponent(doc);
    }
    this.doc = doc;
    return this.applyMaterial();
  }

  /** Material Lab simulation; no component definition is changed. */
  previewMaterialState(state: SolidState): void {
    this.materialState = state;
    if (!this.solidLab) return;
    const component = this.main.component;
    component?.previewState(component.type === 'button' ? 'root' : null, state === 'disabled' ? 'disabled' : null);
    component?.setInteractive(state === 'default');
    const surface = component?.materialSurface;
    surface?.setActive(state === 'active');
    surface?.setHovered(state === 'hover');
    surface?.setPressed(state === 'pressed');
    surface?.setDisabled(state === 'disabled');
  }

  // ---------- builder component ----------

  /** The builder's component, if one is shown instead of the demo object. */
  get component(): ComponentInstance | null {
    return this.main.component;
  }

  /**
   * Shows a component document on the main stage, on the same material group
   * and renderer as every demo object. The material shown is the
   * component's; compare and the capsule dock are off while it is shown. The
   * stage's group is Glass: a component with another family draws itself
   * with its own group and leaves the stage's untouched.
   */
  showComponent(config: ComponentDefinition, handlers: ComponentHandlers = {}): ComponentInstance {
    this.solidLab = null;
    this.setCompare(false);
    this.dock.unmount();
    this.followGlass(config);
    const nav = this.main.showComponent({ config, ...handlers });
    for (const off of this.componentListeners.splice(0)) off();
    const ro = new ResizeObserver(() => this.scheduleReport());
    ro.observe(nav.host);
    this.componentListeners.push(() => ro.disconnect());
    this.main.host.append(this.mapOverlay);
    this.stagesEl.dataset.object = 'component';
    this.scheduleReport();
    return nav;
  }

  updateComponent(config: ComponentDefinition): void {
    const nav = this.main.component;
    if (!nav) return;
    this.followGlass(config);
    nav.update(config);
    this.scheduleReport();
  }

  /** The stage's Glass group follows the component's material while that is Glass. */
  private followGlass(config: ComponentDefinition): void {
    const material = resolveDefinitionMaterial(config);
    if (material.family !== 'glass' || material === this.doc) return;
    this.doc = material;
    this.applyMaterial();
  }

  /** Back to the demo object and the given material (the Material Lab's). */
  hideComponent(material: MaterialDocument): void {
    this.solidLab = null;
    if (material.family === 'solid') {
      this.setMaterial(material);
      return;
    }
    if (!this.main.component) return;
    for (const off of this.componentListeners.splice(0)) off();
    this.main.hideComponent();
    this.doc = material;
    this.applyMaterial();
    this.applyObject();
    if (this.opts.compare) this.setCompare(true);
  }

  setOption<K extends keyof ViewOptions>(key: K, value: ViewOptions[K]): void {
    if (this.opts[key] === value) return;
    this.opts[key] = value;
    switch (key) {
      case 'mode':
        this.applyMode();
        break;
      case 'object':
        if (this.solidLab) this.setMaterial(this.solidLab);
        else this.applyObject();
        break;
      case 'nav':
        for (const st of this.stages()) st.navbar.setSelected(this.opts.nav);
        if (this.solidLab && this.main.component?.type === 'mobile-navbar') (this.main.component as BottomNavigation).setActiveTab(this.opts.nav);
        break;
      case 'scene':
        this.renderScenes();
        break;
      case 'texture':
        this.sceneStage?.setTexture(this.opts.texture, this.imageUrl());
        break;
      case 'animate':
        this.syncAnimations();
        break;
      case 'theme':
        this.applyTheme();
        break;
      case 'path':
        this.main.setPath(this.opts.path);
        break;
      case 'compare':
        if (!this.main.component) this.setCompare(this.opts.compare);
        break;
      case 'device':
      case 'width':
      case 'height':
        this.applyDevice();
        break;
      case 'components':
        this.syncDock();
        break;
      case 'reduceMotion':
        for (const st of this.stages()) st.ctx.setManualReduceMotion(this.opts.reduceMotion);
        this.sceneStage?.setReducedMotion(this.opts.reduceMotion);
        break;
      case 'reduceTransparency':
        for (const st of this.stages()) st.ctx.setManualReduceTransparency(this.opts.reduceTransparency);
        this.sceneStage?.setReducedTransparency(this.opts.reduceTransparency);
        break;
      case 'showMap':
        this.stagesEl.classList.toggle('show-map', this.opts.showMap);
        break;
    }
    this.scheduleReport();
  }

  /** Replaces the photo of the photo scene (and the image texture); null restores the bundled one. */
  setLocalImage(url: string | null): void {
    this.localImage = url;
    this.renderScenes();
    this.sceneStage?.setTexture(this.opts.texture, this.imageUrl());
  }

  resetScroll(): void {
    // The compare stage follows through the scroll sync.
    this.main.scroller.scrollTo({ top: 0, left: 0, behavior: this.main.ctx.motionReduced ? 'auto' : 'smooth' });
  }

  centreCapsule(): void {
    const c = this.main.centre();
    this.capsuleAt = c;
    for (const st of this.stages()) st.capsule?.setPosition(c.x, c.y);
  }

  /** "Ripristino": content to the top, capsule centred, scene time to zero. */
  restore(): void {
    this.resetScroll();
    this.centreCapsule();
    this.sceneStage?.resetTime();
  }

  setCapsulePosition(x: number, y: number, immediate = true): void {
    this.capsuleAt = { x, y };
    for (const st of this.stages()) st.capsule?.setPosition(x, y, immediate);
  }

  get capsulePosition(): { x: number; y: number } | null {
    return this.main.capsule?.position ?? this.capsuleAt;
  }

  onReport(listener: (r: PreviewReport) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  report(): PreviewReport {
    const g = this.main.surface?.lensGeometry() ?? null;
    const loops: string[] = [];
    for (const st of this.stages()) if (st.ctx.stats.animating) loops.push(`molla (${st === this.main ? 'principale' : 'confronto'})`);
    const scene = this.sceneStage?.status ?? null;
    if (scene?.looping) loops.push('WebGL2 (sorgente dinamica)');
    return {
      options: this.options,
      main: this.main.ctx.status,
      group: this.main.group.status,
      compare: this.compareStage?.ctx.status ?? null,
      stats: this.main.ctx.stats,
      geometry: g,
      map: this.mapView,
      scene: this.opts.mode === 'scene' ? scene : null,
      loops,
      suspended: this.offscreen || this.hidden,
    };
  }

  /** Frame intervals over `ms` (on request only, never in the background). */
  measure(ms = 5000): Promise<string> {
    return new Promise((resolve) => {
      const before = this.main.ctx.stats.mapRegenerations;
      const frames: number[] = [];
      let last = 0;
      const start = performance.now();
      const step = (now: number) => {
        if (last) frames.push(now - last);
        last = now;
        if (now - start < ms) requestAnimationFrame(step);
        else {
          const sorted = [...frames].sort((a, b) => a - b);
          const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0;
          const long = frames.filter((f) => f > 33.4).length;
          const what = this.opts.mode === 'scene' ? 'scena WebGL2' : this.main.component ? 'componente' : OBJECT_LABEL[this.opts.object];
          resolve(
            `${frames.length} frame · intervallo mediano ${q(0.5).toFixed(1)} ms · p95 ${q(0.95).toFixed(1)} ms · >33 ms: ${long} · ` +
              `mappe rigenerate: ${this.main.ctx.stats.mapRegenerations - before} · superfici: ${this.main.ctx.stats.surfaces} · ` +
              `${what} · sfondo ${this.stagesEl.classList.contains('is-animated') ? 'animato' : 'fermo'}`,
          );
        }
      };
      requestAnimationFrame(step);
    });
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.reportTimer) clearTimeout(this.reportTimer);
    for (const off of this.componentListeners.splice(0)) off();
    this.setCompare(false);
    this.dock.unmount();
    this.main.destroy();
    this.sceneStage?.destroy();
    this.sceneStage = null;
    for (const c of this.cleanups.splice(0)) c();
    this.listeners.clear();
    this.stagesEl.remove();
  }

  // ---------- internals ----------

  private makeStage(root: HTMLElement, role: 'main' | 'compare', path: ViewOptions['path'], navLabel: string): Stage {
    const stage: Stage = new Stage(
      {
        root,
        role,
        path,
        verification: VERIFICATION,
        navLabel,
        nav: this.opts.nav,
        onSelect: (id) => this.host.onRequest({ type: 'option', key: 'nav', value: id }),
        onCapsuleMove: (x, y) => {
          this.capsuleAt = { x, y };
          for (const other of this.stages()) if (other !== stage) other.capsule?.setPosition(x, y);
        },
      },
      this.doc,
    );
    stage.ctx.setManualReduceMotion(this.opts.reduceMotion);
    stage.ctx.setManualReduceTransparency(this.opts.reduceTransparency);
    return stage;
  }

  private applyMaterial(): UpdateReport {
    const report = this.main.setMaterial(this.doc);
    // The compare stage keeps its satin path override whatever the document asks.
    this.compareStage?.setMaterial(this.doc);
    this.dock.setParams(engineParams(this.doc));
    this.sceneStage?.setMaterial(this.doc);
    this.scheduleReport();
    return report;
  }

  private applyMode() {
    const scene = this.opts.mode === 'scene';
    this.stagesEl.dataset.mode = this.opts.mode;
    this.main.root.hidden = scene;
    this.compareRoot.hidden = scene || !this.compareStage;
    this.sceneRoot.hidden = !scene;
    if (scene) {
      for (const st of this.stages()) st.group.suspend();
      if (!this.sceneStage) {
        this.sceneStage = new SceneStage(this.sceneRoot, this.doc, {
          texture: this.opts.texture,
          imageUrl: this.imageUrl(),
          animate: this.animationOn(),
          reducedMotion: this.opts.reduceMotion,
          reducedTransparency: this.opts.reduceTransparency,
          onChange: () => this.scheduleReport(),
        });
      }
      this.sceneStage.resume();
    } else {
      this.sceneStage?.suspend();
      if (!this.offscreen && !this.hidden) for (const st of this.stages()) st.group.resume();
    }
    this.scheduleReport();
  }

  private imageUrl(): string {
    if (this.localImage) return this.localImage;
    const fallback = this.host.photo ?? '';
    return this.host.resolveAsset ? this.host.resolveAsset('example:tulips') : fallback;
  }

  private applyObject() {
    if (this.main.component) {
      this.scheduleReport();
      return;
    }
    if (this.main.capsule) this.capsuleAt = this.main.capsule.position;
    for (const st of this.stages()) st.setObject(this.opts.object, this.capsuleAt ?? this.main.centre());
    if (!this.capsuleAt && this.main.capsule) this.capsuleAt = this.main.capsule.position;
    this.stagesEl.dataset.object = this.opts.object;
    this.syncDock();
    this.main.host.append(this.mapOverlay);
    this.scheduleReport();
  }

  /** The dock belongs to capsule mode; other objects own their part of the stage. */
  private syncDock() {
    const want = this.opts.components && this.opts.object === 'capsule' && !this.main.component;
    if (want) this.dock.mount(this.main.ctx, engineParams(this.doc));
    else this.dock.unmount();
    this.dock.syncSlider(this.doc.material.refraction);
    this.dock.syncScene(this.opts.scene);
  }

  private renderScenes() {
    for (const st of this.stages()) renderScene(st.scroller, this.opts.scene, this.localImage ?? this.host.photo);
    this.dock.syncScene(this.opts.scene);
    this.syncAnimations();
  }

  private animationOn() {
    return this.opts.animate && !this.main.ctx.motionReduced && !this.offscreen && !this.hidden;
  }

  private syncAnimations() {
    const on = this.animationOn();
    this.stagesEl.classList.toggle('is-animated', this.opts.animate && !this.main.ctx.motionReduced);
    // Off-screen or hidden: CSS animations are paused, not removed (they resume in place).
    this.stagesEl.classList.toggle('is-paused', this.offscreen || this.hidden);
    // Start every background animation at the same instant so the compared stages match.
    const t = this.root.ownerDocument.timeline.currentTime;
    if (on && t !== null) {
      for (const st of this.stages()) for (const a of st.scroller.getAnimations({ subtree: true })) a.startTime = t;
    }
    this.sceneStage?.setAnimate(on);
  }

  private syncMotion() {
    this.root.ownerDocument.documentElement.dataset.motionReduced = String(this.main.ctx.motionReduced);
    this.syncAnimations();
  }

  private applyTheme() {
    this.root.ownerDocument.documentElement.dataset.theme = this.opts.theme;
  }

  private applyDevice() {
    const o = this.opts;
    this.stagesEl.dataset.device = o.device;
    if (o.device === 'custom') {
      this.stagesEl.style.setProperty('--frame-w', `${o.width}px`);
      this.stagesEl.style.setProperty('--frame-h', `${o.height}px`);
    } else {
      this.stagesEl.style.removeProperty('--frame-w');
      this.stagesEl.style.removeProperty('--frame-h');
    }
    for (const st of this.stages()) st.ctx.measureAll();
    this.sceneStage?.invalidate();
  }

  private setCompare(on: boolean) {
    const root = this.compareRoot;
    if (on && !this.compareStage) {
      root.hidden = this.opts.mode === 'scene';
      this.stagesEl.dataset.compare = 'on';
      const st = this.makeStage(root, 'compare', 'satin', 'Navigazione dimostrativa, riquadro di confronto');
      this.compareStage = st;
      st.setObject(this.opts.object, this.main.capsule?.position ?? this.capsuleAt ?? this.main.centre());
      renderScene(st.scroller, this.opts.scene, this.localImage ?? this.host.photo);
      const a = this.main.scroller;
      const b = st.scroller;
      // Each write is remembered so its echo (the scroll event it causes on the
      // other side) is ignored instead of bouncing back and cutting a smooth scroll.
      const written = new WeakMap<HTMLElement, number>();
      const sync = (from: HTMLElement, to: HTMLElement) => () => {
        const echo = written.get(from);
        if (echo !== undefined && Math.abs(echo - from.scrollTop) < 1) {
          written.delete(from);
          return;
        }
        if (Math.abs(to.scrollTop - from.scrollTop) < 1 && Math.abs(to.scrollLeft - from.scrollLeft) < 1) return;
        to.scrollTop = from.scrollTop;
        to.scrollLeft = from.scrollLeft;
        written.set(to, to.scrollTop);
      };
      const ab = sync(a, b);
      const ba = sync(b, a);
      a.addEventListener('scroll', ab, { passive: true });
      b.addEventListener('scroll', ba, { passive: true });
      b.scrollTop = a.scrollTop;
      this.compareCleanups = [
        () => a.removeEventListener('scroll', ab),
        () => b.removeEventListener('scroll', ba),
        st.group.onStatus(() => this.scheduleReport()),
      ];
      this.syncAnimations();
    } else if (!on && this.compareStage) {
      for (const c of this.compareCleanups.splice(0)) c();
      this.compareStage.destroy();
      this.compareStage = null;
      root.hidden = true;
      this.stagesEl.dataset.compare = 'off';
    }
    // Both stages resize: remeasure.
    this.main.ctx.measureAll();
  }

  private onStatus() {
    this.syncMotion();
    this.scheduleReport();
  }

  private scheduleReport() {
    if (this.reportTimer || this.destroyed) return;
    this.reportTimer = window.setTimeout(() => {
      this.reportTimer = 0;
      this.updateMap();
      this.updateLabels();
      const r = this.report();
      for (const l of this.listeners) l(r);
    }, 120);
  }

  /** Map of the mounted surface, recomputed now (inspection). */
  inspectMap(): MapView | null {
    this.updateMap();
    return this.mapView;
  }

  private updateLabels() {
    for (const st of this.stages()) {
      const el = st.root.querySelector<HTMLElement>('.stage-label');
      if (!el) continue;
      if (st.component?.status.family === 'solid') {
        el.textContent = 'Solid · CSS';
        el.dataset.effective = 'solid';
        el.dataset.requested = 'solid';
        el.title = 'Renderer Solid: riempimento, bordo, ombra e stati CSS';
        continue;
      }
      const status = st.ctx.status;
      el.textContent = stageLabel(status);
      el.dataset.effective = status.effective;
      el.dataset.requested = status.configured;
      el.title = status.reasons.join('; ');
    }
  }

  /** The map always belongs to the surface mounted on the main stage. */
  private updateMap() {
    const s = this.main.surface;
    const g = s?.lensGeometry() ?? null;
    if (!s || !g) {
      this.mapView = null;
      return;
    }
    const round = (v: number) => Math.round(v * 10) / 10;
    const object = this.main.component ? 'component' : this.opts.object;
    const owner = `${this.main.component ? 'Componente' : OBJECT_LABEL[this.opts.object]} ${round(g.width)}×${round(g.height)} px`;
    const inUse = this.main.ctx.renderer.mapOf(s.id);
    if (inUse) {
      this.mapOverlay.src = inUse.url;
      this.mapView = {
        url: inUse.url,
        note: `Mappa in uso · ${owner}. Rigenerata solo se cambia la geometria.`,
        inUse: true,
        key: inUse.key,
        surface: s.id,
        object,
      };
      return;
    }
    // Not in use on this path: computed on demand for inspection only.
    const key = JSON.stringify(g);
    if (key !== this.fallbackMap.key) this.fallbackMap = { key, url: encodeMapAsPng(computeLensMap(g)) };
    this.mapOverlay.src = this.fallbackMap.url;
    this.mapView = {
      url: this.fallbackMap.url,
      note: `Il percorso ${PATH_LABEL[this.main.ctx.path]} non usa la mappa: anteprima calcolata a parte · ${owner}.`,
      inUse: false,
      key,
      surface: s.id,
      object,
    };
  }

  /** Suspends the preview while it is off-screen or the page is hidden. */
  private watchVisibility() {
    const doc = this.root.ownerDocument;
    const apply = () => {
      const off = this.offscreen || this.hidden;
      if (this.opts.mode === 'components') for (const st of this.stages()) off ? st.group.suspend() : st.group.resume();
      if (off) this.sceneStage?.suspend();
      else if (this.opts.mode === 'scene') this.sceneStage?.resume();
      this.syncAnimations();
      this.scheduleReport();
    };
    const onVis = () => {
      this.hidden = doc.visibilityState === 'hidden';
      apply();
    };
    doc.addEventListener('visibilitychange', onVis);
    this.cleanups.push(() => doc.removeEventListener('visibilitychange', onVis));
    const io = new IntersectionObserver((entries) => {
      const e = entries[entries.length - 1];
      if (!e) return;
      const off = !e.isIntersecting;
      if (off === this.offscreen) return;
      this.offscreen = off;
      apply();
    });
    io.observe(this.root);
    this.cleanups.push(() => io.disconnect());
  }
}
