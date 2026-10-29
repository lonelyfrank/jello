/**
 * Capsule mode test components: a button, a three-option selector (native
 * radios) and a native slider with a glass thumb. Each one has its own
 * surface on the main stage; the selector indicator and the slider fill are
 * plain visual layers.
 */

import { bindPress } from '../core/interaction';
import type { GlassContext } from '../core/context';
import type { GlassParams } from '../core/params';
import type { GlassSurface } from '../core/surface';
import type { SceneId } from './scenes';

const MARKUP = `
  <button class="glass-button" id="centerButton" type="button">
    <svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="3" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
    </svg>
    <span>Centra</span>
  </button>
  <fieldset class="glass-segmented" id="sceneSegmented">
    <legend class="visually-hidden">Sfondo</legend>
    <label><input type="radio" name="segScene" value="grid" /><span>Griglia</span></label>
    <label><input type="radio" name="segScene" value="blocks" /><span>Blocchi</span></label>
    <label><input type="radio" name="segScene" value="photo" /><span>Foto</span></label>
    <span class="seg-indicator" aria-hidden="true"></span>
  </fieldset>
  <div class="glass-slider" id="refractionSlider">
    <label for="refractionRange" class="slider-label">Rifrazione</label>
    <div class="slider-track">
      <input id="refractionRange" type="range" min="-40" max="80" step="0.5" />
      <span class="slider-fill" aria-hidden="true"></span>
      <span class="glass-thumb" aria-hidden="true"></span>
    </div>
  </div>`;

export interface DockHandlers {
  onCentre(): void;
  onScene(id: SceneId): void;
  onRefraction(value: number): void;
}

export class Dock {
  readonly el: HTMLElement;
  private readonly button: HTMLButtonElement;
  private readonly segmented: HTMLElement;
  private readonly slider: HTMLElement;
  private readonly range: HTMLInputElement;
  private readonly thumb: HTMLElement;
  private surfaces: GlassSurface[] = [];
  private cleanups: (() => void)[] = [];
  private ctx: GlassContext | null = null;

  constructor(overlay: HTMLElement, handlers: DockHandlers) {
    const doc = overlay.ownerDocument;
    this.el = doc.createElement('div');
    this.el.className = 'dock';
    this.el.id = 'dock';
    this.el.hidden = true;
    this.el.innerHTML = MARKUP;
    overlay.append(this.el);
    this.button = this.el.querySelector('#centerButton')!;
    this.segmented = this.el.querySelector('#sceneSegmented')!;
    this.slider = this.el.querySelector('#refractionSlider')!;
    this.range = this.el.querySelector('#refractionRange')!;
    this.thumb = this.slider.querySelector('.glass-thumb')!;
    this.button.addEventListener('click', () => handlers.onCentre());
    this.segmented.addEventListener('change', (e) => handlers.onScene((e.target as HTMLInputElement).value as SceneId));
    this.range.addEventListener('input', () => handlers.onRefraction(this.range.valueAsNumber));
  }

  get mounted(): boolean {
    return this.surfaces.length > 0;
  }

  get surfaceList(): readonly GlassSurface[] {
    return this.surfaces;
  }

  mount(ctx: GlassContext, params: GlassParams): void {
    if (this.mounted) return;
    this.ctx = ctx;
    this.el.hidden = false;
    this.surfaces = [
      ctx.attach(this.button, { params, sizing: 'element' }),
      ctx.attach(this.segmented, { params, sizing: 'element' }),
      ctx.attach(this.thumb, { params, sizing: 'element' }),
    ];
    this.cleanups = [bindPress(this.surfaces[0]!, this.button), bindPress(this.surfaces[1]!, this.segmented), bindPress(this.surfaces[2]!, this.slider)];
  }

  unmount(): void {
    for (const c of this.cleanups.splice(0)) c();
    for (const s of this.surfaces) s.destroy();
    this.surfaces = [];
    this.el.hidden = true;
  }

  setParams(params: GlassParams): void {
    for (const s of this.surfaces) s.setParams(params);
    this.syncSlider(params.refraction);
  }

  syncSlider(refraction: number): void {
    this.range.value = String(refraction);
    const min = Number(this.range.min);
    const max = Number(this.range.max);
    this.slider.style.setProperty('--v', String((refraction - min) / (max - min)));
    const s = this.surfaces[2];
    if (s) this.ctx?.requestMeasure(s);
  }

  syncScene(scene: SceneId): void {
    const radios = [...this.segmented.querySelectorAll<HTMLInputElement>('input[type=radio]')];
    const index = radios.findIndex((r) => r.value === scene);
    radios.forEach((r, i) => (r.checked = i === index));
    this.segmented.style.setProperty('--seg-index', String(Math.max(0, index)));
    this.segmented.toggleAttribute('data-has-selection', index >= 0);
    const s = this.surfaces[1];
    if (s) this.ctx?.requestMeasure(s);
  }
}
