/**
 * "Scena controllata": Glass on a controlled texture through the WebGL2
 * scene view of the runtime. The backend chunk is loaded only when this
 * stage is first shown.
 *
 * The lens label is DOM above the canvas, positioned by the view: it is
 * never rendered into the texture. When WebGL2 is not usable (missing,
 * shader error, lost context that does not come back) the stage shows the
 * same texture as DOM with a CSS surface on it, and says why.
 */

import type { MaterialDocument } from '../model/document';
import { createGlassGroup, engineParams, type GlassGroup } from '../runtime/glass-group';
import { createSceneView } from '../runtime/scene';
import type { SceneStatus, SceneView, TextureInput } from '../runtime/scene-types';
import type { GlassSurface } from '../core/surface';
import type { TextureChoice } from './view';

export interface SceneStageOptions {
  texture: TextureChoice;
  imageUrl: string;
  animate: boolean;
  reducedMotion: boolean;
  reducedTransparency: boolean;
  onChange(): void;
}

const ICON_DROP =
  '<path d="M12 3.2c3.4 4 6 7.4 6 10.4a6 6 0 0 1-12 0c0-3 2.6-6.4 6-10.4Z" /><path d="M9.4 14.6a2.8 2.8 0 0 0 2.6 2.3" />';

export class SceneStage {
  readonly root: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  readonly label: HTMLElement;
  private view: SceneView | null = null;
  private pending: Promise<void> | null = null;
  private doc: MaterialDocument;
  private o: SceneStageOptions;
  private fallback: { group: GlassGroup; surface: GlassSurface; source: HTMLElement } | null = null;
  private suspended = true;
  private destroyed = false;
  private off: (() => void) | null = null;

  constructor(root: HTMLElement, doc: MaterialDocument, o: SceneStageOptions) {
    this.root = root;
    this.doc = doc;
    this.o = o;
    const d = root.ownerDocument;
    root.innerHTML =
      '<figcaption class="stage-label" id="stageSceneLabel">WebGL2</figcaption>' +
      '<canvas class="scene-canvas" id="sceneCanvas" tabindex="0" role="group" aria-label="Scena controllata con lente glass. Usa le frecce per spostare la lente."></canvas>' +
      `<div class="scene-lens-label" aria-hidden="true"><svg class="icon" viewBox="0 0 24 24" focusable="false">${ICON_DROP}</svg><span>Trascinami</span></div>`;
    this.canvas = root.querySelector('canvas')!;
    this.label = root.querySelector<HTMLElement>('.scene-lens-label')!;
    void d;
  }

  get sceneView(): SceneView | null {
    return this.view;
  }

  get status(): SceneStatus | null {
    if (this.view) return this.view.status;
    return null;
  }

  get usingFallback(): boolean {
    return this.fallback !== null;
  }

  /** Starts (or resumes) the view; the WebGL2 chunk is fetched on the first call. */
  resume(): void {
    this.suspended = false;
    if (this.fallback) {
      this.fallback.group.resume();
      return;
    }
    if (this.view) {
      this.view.resume();
      return;
    }
    this.pending ??= this.start();
  }

  suspend(): void {
    this.suspended = true;
    this.view?.suspend();
    this.fallback?.group.suspend();
  }

  setMaterial(doc: MaterialDocument): void {
    this.doc = doc;
    this.view?.setMaterial(doc);
    if (this.fallback) this.fallback.group.setMaterial(this.cssDoc(doc));
    if (this.fallback) this.fallback.surface.setParams(engineParams(doc));
  }

  setTexture(choice: TextureChoice, imageUrl: string): void {
    this.o = { ...this.o, texture: choice, imageUrl };
    void this.view?.setSource(this.input());
    if (this.fallback) this.paintFallbackSource(this.fallback.source);
  }

  setAnimate(on: boolean): void {
    this.o = { ...this.o, animate: on };
    if (this.view) {
      void this.view.setSource(this.input());
      this.view.setAnimated(on);
    }
  }

  setReducedMotion(on: boolean): void {
    this.o = { ...this.o, reducedMotion: on };
    this.view?.setReducedMotion(on);
  }

  setReducedTransparency(on: boolean): void {
    this.o = { ...this.o, reducedTransparency: on };
    this.view?.setReducedTransparency(on);
    this.fallback?.group.context.setManualReduceTransparency(on);
  }

  invalidate(): void {
    this.view?.resize();
    this.fallback?.group.invalidate();
  }

  resetTime(): void {
    this.view?.resetTime();
  }

  destroy(): void {
    this.destroyed = true;
    this.off?.();
    this.view?.destroy();
    this.view = null;
    this.dropFallback();
  }

  private input(): TextureInput {
    return this.o.texture === 'image'
      ? { kind: 'image', url: this.o.imageUrl }
      : { kind: 'pattern', pattern: 'grid', animated: this.o.animate };
  }

  private async start() {
    const view = await createSceneView({
      canvas: this.canvas,
      material: this.doc,
      source: this.input(),
      foreground: this.label,
      // The controller decides visibility for the whole preview.
      autoSuspend: false,
      reducedMotion: this.o.reducedMotion,
      reducedTransparency: this.o.reducedTransparency,
    });
    if (this.destroyed) {
      view.destroy();
      return;
    }
    this.view = view;
    view.setAnimated(this.o.animate);
    this.off = view.onStatus((s) => {
      this.syncLabel(s);
      if (s.effective === 'unavailable') this.useFallback();
      this.o.onChange();
    });
    if (view.status.effective === 'unavailable') this.useFallback();
    if (this.suspended) view.suspend();
    this.syncLabel(view.status);
    this.o.onChange();
  }

  private syncLabel(s: SceneStatus) {
    const el = this.root.querySelector<HTMLElement>('#stageSceneLabel')!;
    el.textContent = s.effective === 'webgl2' ? 'WebGL2' : s.effective === 'lost' ? 'WebGL2 · contesto perso' : 'CSS su texture · WebGL2 non disponibile';
    el.dataset.effective = s.effective;
    el.title = s.reasons.join('; ');
  }

  /** The texture as DOM with a CSS surface: no refraction, stated in the label. */
  private useFallback() {
    if (this.fallback || this.destroyed) return;
    const d = this.root.ownerDocument;
    this.canvas.hidden = true;
    const source = d.createElement('div');
    source.className = 'source scene-fallback';
    this.paintFallbackSource(source);
    const overlay = d.createElement('div');
    overlay.className = 'overlay';
    const host = d.createElement('div');
    host.className = 'capsule';
    host.setAttribute('aria-hidden', 'true');
    overlay.append(host);
    this.root.append(source, overlay);
    const group = createGlassGroup({ source, material: this.cssDoc(this.doc), autoSuspend: false });
    group.context.setManualReduceTransparency(this.o.reducedTransparency);
    const surface = group.attach(host, { sizing: 'params' });
    const r = this.root.getBoundingClientRect();
    const p = engineParams(this.doc);
    surface.setPosition(Math.max(0, (r.width - p.width) / 2), Math.max(0, (r.height - p.height) / 2), true);
    this.fallback = { group, surface, source };
    this.label.style.transform = `translate3d(${Math.max(0, (r.width - p.width) / 2)}px, ${Math.max(0, (r.height - p.height) / 2)}px, 0)`;
    this.label.style.width = `${p.width}px`;
    this.label.style.height = `${p.height}px`;
  }

  private paintFallbackSource(el: HTMLElement) {
    el.dataset.texture = this.o.texture;
    el.style.backgroundImage = this.o.texture === 'image' ? `url("${this.o.imageUrl}")` : '';
  }

  private cssDoc(doc: MaterialDocument): MaterialDocument {
    return { ...doc, target: { ...doc.target, backend: 'css' } };
  }

  private dropFallback() {
    if (!this.fallback) return;
    this.fallback.group.destroy();
    this.fallback.source.remove();
    this.fallback = null;
  }
}
