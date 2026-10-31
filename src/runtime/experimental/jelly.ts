/** Private M6.2 DOM renderer. Explicit imports only; not a registered material runtime. */
import { parseExperimentalJelly, resolveExperimentalJelly, type JellyExperimentalDocument, type JellyOverrideState } from '../../model/experimental/jelly';
import { bubbleCandidates, bubbleCount, jellyGeometry, jellyOptics, opticalQuality, projectBubble, type BubbleCandidate, type OpticalQuality } from '../../model/experimental/jelly-visual';
import type { MaterialSurface } from '../material-types';
import './jelly.css';

export interface JellyRenderOptions {
  /** Explicit host radius wins even over material capsule. Dimensions remain owned by host. */
  radius?: number;
  opaque?: boolean;
  reducedTransparency?: boolean;
  /** Deterministic fallback test / environment capability policy, not a visual-quality probe. */
  svgAvailable?: boolean;
  diagnosticPose?: number;
}
export interface JellyRenderStatus {
  requestedBackend: 'auto' | 'svg' | 'css'; backend: 'svg' | 'css';
  requestedProfile: JellyExperimentalDocument['quality']['profile']; opticalProfile: OpticalQuality;
  motion: 'static'; motionReduced: boolean; transparencyReduced: boolean; forcedColors: boolean; opaque: boolean;
  suspended: boolean; bubbles: number; effectiveAlpha: number; effectiveTransmission: number;
  reasons: string[]; unsupported: string[]; updates: number; distributions: number; decorativePadding: number;
}
const NS = 'http://www.w3.org/2000/svg';
let nextId = 0;
function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  attributes(node, attrs);
  return node;
}
function attributes(node: Element, attrs: Record<string, string | number>): void {
  for (const [key, value] of Object.entries(attrs)) if (node.getAttribute(key) !== String(value)) node.setAttribute(key, String(value));
}
function validated(input: JellyExperimentalDocument): JellyExperimentalDocument {
  const parsed = parseExperimentalJelly(input);
  if (!parsed.ok) throw new Error(parsed.errors.join('; '));
  return parsed.doc;
}
function validateOptions(o: JellyRenderOptions): void {
  if (o.radius !== undefined && (!Number.isFinite(o.radius) || o.radius < 0)) throw new Error('Raggio host non valido');
  if (o.diagnosticPose !== undefined && !Number.isFinite(o.diagnosticPose)) throw new Error('Posa non valida');
}

export class ExperimentalJellySurface implements MaterialSurface {
  readonly host: HTMLElement;
  private doc: JellyExperimentalDocument;
  private options: JellyRenderOptions;
  private flags: Partial<Record<JellyOverrideState, boolean>> = {};
  private destroyed = false;
  private root = document.createElement('span');
  private image: SVGSVGElement | null = null;
  private parts: Record<string, SVGElement> = {};
  private bubbleNodes: SVGGElement[] = [];
  private candidates: BubbleCandidate[] = [];
  private seed: number | null = null;
  private width = 0;
  private height = 0;
  private updates = 0;
  private distributions = 0;
  private id = `jello-jelly-${++nextId}`;
  private readonly hadClass: boolean;
  private readonly savedForeground: string;
  private readonly savedPriority: string;
  private ownedForeground = '';
  private observer: ResizeObserver;
  private media = {
    motion: matchMedia('(prefers-reduced-motion: reduce)'),
    transparency: matchMedia('(prefers-reduced-transparency: reduce)'),
    forced: matchMedia('(forced-colors: active)'),
  };
  private currentStatus!: JellyRenderStatus;
  private listeners = new Set<(status: JellyRenderStatus) => void>();
  private mediaChanged = () => this.render();

  constructor(host: HTMLElement, doc: JellyExperimentalDocument, options: JellyRenderOptions = {}) {
    this.doc = validated(doc);
    validateOptions(options);
    this.options = { ...options };
    this.host = host;
    this.hadClass = host.classList.contains('jelly-surface');
    this.savedForeground = host.style.getPropertyValue('--jelly-foreground');
    this.savedPriority = host.style.getPropertyPriority('--jelly-foreground');
    this.root.className = 'jelly-decoration';
    this.root.setAttribute('aria-hidden', 'true');
    host.classList.add('jelly-surface');
    host.prepend(this.root);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    for (const query of Object.values(this.media)) query.addEventListener('change', this.mediaChanged);
    this.resize();
  }
  get status(): JellyRenderStatus { return { ...this.currentStatus, reasons: [...this.currentStatus.reasons], unsupported: [...this.currentStatus.unsupported] }; }
  onStatus(listener: (status: JellyRenderStatus) => void): () => void {
    if (this.destroyed) return () => {};
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  /** Validate the entire next document/options before committing either. No caller-owned references retained. */
  update(doc: JellyExperimentalDocument, options: JellyRenderOptions = this.options): void {
    if (this.destroyed) return;
    const next = validated(doc);
    validateOptions(options);
    this.doc = next;
    this.options = { ...options };
    this.render();
  }
  setState(flags: Partial<Record<JellyOverrideState, boolean>>): void {
    if (this.destroyed) return;
    this.flags = { ...this.flags, ...flags };
    this.render();
  }
  setPressed(pressed: boolean): void { this.setState({ pressed }); }
  setHovered(hover: boolean): void { this.setState({ hover }); }
  setActive(active: boolean): void { this.setState({ active }); }
  setDisabled(disabled: boolean): void { this.setState({ disabled }); }
  resize(): void {
    if (this.destroyed) return;
    const { width, height } = this.host.getBoundingClientRect();
    if (this.currentStatus && width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    this.render();
  }
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.observer.disconnect();
    for (const query of Object.values(this.media)) query.removeEventListener('change', this.mediaChanged);
    this.listeners.clear();
    this.root.remove();
    this.root.replaceChildren();
    if (!this.hadClass) this.host.classList.remove('jelly-surface');
    if (this.host.style.getPropertyValue('--jelly-foreground') === this.ownedForeground && this.host.style.getPropertyPriority('--jelly-foreground') === '') {
      if (this.savedForeground) this.host.style.setProperty('--jelly-foreground', this.savedForeground, this.savedPriority);
      else this.host.style.removeProperty('--jelly-foreground');
    }
    this.candidates = [];
    this.bubbleNodes = [];
    this.parts = {};
    this.image = null;
  }

  private setupSVG(): void {
    if (this.image) return;
    const image = svg('svg', { 'aria-hidden': 'true', focusable: 'false', preserveAspectRatio: 'none' });
    const defs = svg('defs');
    const gradient = (name: string, stops: [number, string, number][], radial = false) => {
      const node = radial ? svg('radialGradient', { id: `${this.id}-${name}` }) : svg('linearGradient', { id: `${this.id}-${name}`, x1: 0, y1: 0, x2: 0, y2: 1 });
      for (const [offset, color, opacity] of stops) node.append(svg('stop', { offset: `${offset}%`, 'stop-color': color, 'stop-opacity': opacity }));
      defs.append(node);
      this.parts[name] = node;
      return node;
    };
    gradient('body', [[0, '#fff', 1], [48, '#fff', 1], [100, '#fff', 1]]);
    gradient('rim', [[0, '#fff', 0.38], [38, '#fff', 0.02], [75, '#000', 0.12], [100, '#000', 0.4]]);
    gradient('pool', [[0, '#fff', 0], [55, '#fff', 0], [100, '#000', 0.3]]);
    gradient('light', [[0, '#fff', 0.8], [60, '#fff', 0.28], [100, '#fff', 0]], true);
    gradient('gloss', [[0, '#fff', 0.95], [50, '#fff', 0.38], [100, '#fff', 0.02]]);
    gradient('bubble', [[0, '#142238', 0.15], [62, '#fff', 0.03], [88, '#fff', 0.5], [100, '#122036', 0.85]], true);
    gradient('core', [[0, '#fff', 0.5], [58, '#fff', 0.14], [100, '#fff', 0]], true);
    attributes(this.parts.core!, { cx: '45%', cy: '43%', r: '68%' });
    const clip = svg('clipPath', { id: `${this.id}-clip`, clipPathUnits: 'userSpaceOnUse' });
    this.parts.clip = svg('path');
    clip.append(this.parts.clip);
    defs.append(clip);
    const filter = svg('filter', { id: `${this.id}-shadow`, filterUnits: 'userSpaceOnUse', 'color-interpolation-filters': 'sRGB' });
    this.parts.blur = svg('feGaussianBlur', { stdDeviation: 3 });
    filter.append(this.parts.blur);
    defs.append(filter);
    this.parts.filter = filter;
    const soften = svg('filter', { id: `${this.id}-soften`, x: '-30%', y: '-50%', width: '160%', height: '200%' });
    soften.append(svg('feGaussianBlur', { stdDeviation: 1.6 }));
    defs.append(soften);
    this.parts.shadow = svg('path', { filter: `url(#${this.id}-shadow)` });
    this.parts.surface = svg('g');
    const clipped = svg('g', { 'clip-path': `url(#${this.id}-clip)` });
    this.parts.base = svg('path', { fill: `url(#${this.id}-body)` });
    this.parts.corePath = svg('path', { fill: `url(#${this.id}-core)` });
    this.parts.bubbles = svg('g', { 'data-jelly-bubbles': '' });
    this.parts.veil = svg('path');
    this.parts.poolPath = svg('path', { fill: `url(#${this.id}-pool)` });
    this.parts.rimPath = svg('path', { fill: 'none', stroke: `url(#${this.id}-rim)`, filter: `url(#${this.id}-soften)` });
    this.parts.highlight = svg('ellipse', { fill: `url(#${this.id}-light)` });
    this.parts.glossPath = svg('path', { fill: `url(#${this.id}-gloss)`, filter: `url(#${this.id}-soften)` });
    this.parts.gleam = svg('path', { fill: 'none', stroke: '#fff', 'stroke-linecap': 'round' });
    this.parts.caustic = svg('path', { fill: 'none', stroke: '#fff', 'stroke-linecap': 'round', filter: `url(#${this.id}-soften)` });
    clipped.append(this.parts.base, this.parts.corePath, this.parts.bubbles, this.parts.veil, this.parts.poolPath, this.parts.rimPath, this.parts.highlight, this.parts.glossPath, this.parts.gleam, this.parts.caustic);
    this.parts.surface.append(clipped);
    image.append(defs, this.parts.shadow, this.parts.surface);
    this.root.append(image);
    this.image = image;
  }

  private render(): void {
    if (this.destroyed) return;
    const m = resolveExperimentalJelly(this.doc, this.flags);
    const forced = this.media.forced.matches;
    const transparencyReduced = this.options.reducedTransparency ?? this.media.transparency.matches;
    const opaque = !!this.options.opaque || transparencyReduced || forced || this.doc.target.fallback === 'opaque';
    const available = this.options.svgAvailable ?? typeof SVGSVGElement !== 'undefined';
    const backend = opaque || this.doc.target.backend === 'css' || !available ? 'css' : 'svg';
    const quality = opticalQuality(this.doc.quality.profile);
    const g = jellyGeometry(this.width, this.height, this.doc.geometry, this.options.radius, backend === 'svg' ? this.options.diagnosticPose : 0);
    const o = jellyOptics(m, Math.min(this.width, this.height), opaque);
    const reasons = ['M6.2: resa statica; solver, rifrazione e lettura dello sfondo assenti.'];
    if (this.doc.quality.profile === 'auto') reasons.push('Auto usa medium; nessun adattamento hardware o budget di gruppo misurato.');
    if (this.doc.quality.profile === 'static') reasons.push('Static usa ottica medium.');
    if (!available) reasons.push('SVG escluso dalla policy/capacità: fallback CSS.');
    if (backend === 'css') reasons.push('CSS: corpo, bordo, highlight e ombra approssimati; nessuna inclusione o deformazione.');
    if (opaque) reasons.push('Opaco: alpha 1, trasmissione 0; coppia lilla/inchiostro fissa per leggibilità.');
    if (transparencyReduced) reasons.push('Trasparenza ridotta: preferenza rilevata o override manuale.');
    if (forced) reasons.push('Forced colors: colori di sistema; decorazioni eliminate.');
    if (this.media.motion.matches) reasons.push('Reduced motion rilevato; nessuna animazione in questa fase.');
    const count = backend === 'svg' ? bubbleCount(this.doc.bubbles, this.width, this.height, quality) : 0;
    if (backend === 'css' || this.doc.bubbles.enabled === 'disabled' || this.doc.bubbles.density === 0) { this.candidates = []; this.seed = null; }
    else if (count && this.seed !== this.doc.bubbles.seed) {
      // The fixed maximum pool avoids even repeating the PRNG prefix during resize/profile changes.
      this.candidates = bubbleCandidates(this.doc.bubbles.seed, 24);
      this.seed = this.doc.bubbles.seed;
      this.distributions++;
    }
    this.root.dataset.backend = backend;
    this.root.dataset.opaque = String(opaque);
    this.root.dataset.forced = String(forced);
    this.root.style.borderRadius = `${g.radius}px`;
    this.root.style.setProperty('--jelly-shadow', o.shadowCSS);
    this.root.style.setProperty('--jelly-css-alpha', String(o.compositingAlpha));
    this.root.style.setProperty('--jelly-css-body', opaque ? o.tint : `linear-gradient(180deg, ${o.lightTint}${Math.round(o.edgeAlpha*255).toString(16).padStart(2, '0')}, ${o.tint}${Math.round(o.centerAlpha*255).toString(16).padStart(2, '0')} ${45+o.edgeStop*0.3}%, ${o.deepTint}${Math.round(o.edgeAlpha*255).toString(16).padStart(2, '0')})`);
    this.root.style.setProperty('--jelly-css-rim', `${Math.max(1, o.rimWidth/2)}px`);
    this.root.style.setProperty('--jelly-css-highlight', String(o.highlight));
    this.root.style.setProperty('--jelly-css-spread', `${o.highlightSpread*100}%`);
    this.ownedForeground = forced ? 'ButtonText' : o.foreground;
    this.host.style.setProperty('--jelly-foreground', this.ownedForeground);
    if (backend === 'svg') {
      this.setupSVG();
      this.image!.style.display = '';
      attributes(this.image!, { viewBox: `0 0 ${this.width || 1} ${this.height || 1}` });
      for (const key of ['clip', 'base', 'corePath', 'veil', 'poolPath', 'rimPath', 'shadow']) attributes(this.parts[key]!, { d: g.path });
      attributes(this.parts.surface!, { opacity: o.compositingAlpha });
      attributes(this.parts.corePath!, { opacity: 0.3 + m.thickness*0.45 });
      attributes(this.parts.shadow!, { fill: o.shadowColor, opacity: o.shadowOpacity, transform: `translate(0 ${o.shadowY})` });
      attributes(this.parts.filter!, { x: -o.padding, y: -o.padding, width: this.width+2*o.padding, height: this.height+2*o.padding });
      attributes(this.parts.blur!, { stdDeviation: o.shadowBlur });
      const stops = this.parts.body!.children;
      attributes(stops[0]!, { 'stop-color': o.lightTint, 'stop-opacity': o.edgeAlpha });
      attributes(stops[1]!, { 'stop-color': o.tint, 'stop-opacity': o.centerAlpha });
      attributes(stops[2]!, { 'stop-color': o.deepTint, 'stop-opacity': o.edgeAlpha });
      attributes(this.parts.pool!.children[1]!, { offset: `${o.edgeStop}%` });
      attributes(this.parts.pool!.children[2]!, { 'stop-color': o.deepTint, 'stop-opacity': 0.18 + m.thickness*0.3 });
      attributes(this.parts.rimPath!, { 'stroke-width': o.rimWidth*2, opacity: 0.35 + m.thickness*0.5 });
      attributes(this.parts.veil!, { fill: o.lightTint, opacity: o.veil });
      attributes(this.parts.highlight!, { cx: this.width*0.36, cy: this.height*0.11, rx: this.width*0.55, ry: this.height*o.highlightSpread, opacity: o.highlight*1.5 });
      const inset = Math.min(g.radius*0.6+3, this.width*0.2);
      const glossY = this.height * (0.15+0.16*m.roughness);
      attributes(this.parts.glossPath!, { d: `M${inset},${this.height*0.21} Q${inset},5 ${g.radius+5},5 C${this.width*0.35},3 ${this.width*0.7},4 ${this.width-inset-5},${this.height*0.15} Q${this.width*0.6},${glossY} ${this.width*0.35},${glossY} Q${inset},${glossY+3} ${inset},${this.height*0.21} Z`, opacity: o.highlight*(1-m.roughness*0.3) });
      attributes(this.parts.gleam!, { d: `M${Math.max(5, g.radius*0.5)},${this.height*0.25} Q${Math.max(7, g.radius*0.5)},${5+g.pose*this.height/2} ${g.radius+8},5 Q${this.width*0.3},3 ${this.width*0.6},6`, 'stroke-width': 1+o.highlight, opacity: o.highlight*0.8, filter: `url(#${this.id}-soften)` });
      attributes(this.parts.caustic!, { d: `M${g.radius+5},${this.height-6} Q${this.width*0.58},${this.height-2-g.pose*this.height/2} ${this.width-g.radius-5},${this.height-8}`, 'stroke-width': 1+m.thickness*2, opacity: 0.1+m.transmission*m.thickness*0.45 });
    } else if (this.image) this.image.style.display = 'none';
    while (this.bubbleNodes.length > count) this.bubbleNodes.pop()!.remove();
    while (this.bubbleNodes.length < count) {
      const node = svg('g');
      node.append(svg('circle', { fill: `url(#${this.id}-bubble)`, stroke: o.deepTint, 'stroke-width': 0.45 }), svg('ellipse', { fill: '#fff' }));
      this.bubbleNodes.push(node);
      this.parts.bubbles!.append(node);
    }
    this.bubbleNodes.forEach((node, i) => {
      const b = projectBubble(this.candidates[i]!, this.doc.bubbles, g, m);
      attributes(node, { 'data-bubble-index': b.index, transform: `translate(${b.x} ${b.y})`, opacity: b.opacity });
      attributes(node.children[0]!, { r: b.radius, stroke: o.deepTint });
      attributes(node.children[1]!, { cx: -b.radius*0.28, cy: -b.radius*0.4, rx: b.radius*0.38, ry: b.radius*0.16, opacity: 0.6 });
    });
    this.currentStatus = {
      requestedBackend: this.doc.target.backend, backend, requestedProfile: this.doc.quality.profile, opticalProfile: quality,
      motion: 'static', motionReduced: this.media.motion.matches, transparencyReduced, forcedColors: forced, opaque,
      suspended: !this.width || !this.height, bubbles: count,
      effectiveAlpha: o.compositingAlpha, effectiveTransmission: o.transmission, reasons,
      unsupported: ['responseMs', 'dampingRatio', 'maxDeformation', 'pressStrength', 'releaseImpulse', 'drift', 'refraction', ...(backend === 'css' ? ['bubbles.*', 'diagnosticPose'] : [])],
      updates: ++this.updates, distributions: this.distributions, decorativePadding: o.padding,
    };
    for (const listener of this.listeners) { if (this.destroyed) break; listener(this.status); }
  }
}

export function attachExperimentalJelly(host: HTMLElement, doc: JellyExperimentalDocument, options?: JellyRenderOptions): ExperimentalJellySurface {
  return new ExperimentalJellySurface(host, doc, options);
}
