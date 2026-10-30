/**
 * WebGL2 scene view: Glass over a controlled texture.
 *
 * Pipeline, each step run only when its inputs change:
 *   source pass   pattern (procedural) or texture → scene target   [source changed, time, resize]
 *   blur passes   scene → downsampled separable Gaussian          [scene changed, blur changed]
 *   composite     scene + blur + lens map → canvas                 [anything]
 *
 * The lens map is the CPU map of core/geometry.ts (the same one the SVG
 * backend uses), uploaded once per geometry and cached (LRU). Every slider
 * that is not geometry only writes uniforms; the program is compiled once
 * per context. Nothing renders at rest: frames are requested by changes, and
 * a loop runs only while a dynamic source plays or the lens spring moves.
 */

import { computeLensMap, geometryKey, type LensGeometry } from '../../core/geometry';
import { changedKeys, effectiveRadius, type GlassParams } from '../../core/params';
import { isSettled, snapSpring, spring, stepSpring } from '../../core/spring';
import { hexToRgb } from '../../core/surface';
import type { GlassDocument } from '../../model/document';
import { stagesFor } from '../../model/glass';
import { resolveQuality, type QualityProfile } from '../../model/quality';
import { supportReport } from '../../model/support';
import { engineParams } from '../glass-group';
import type { SceneStatus, SceneUpdate, SceneView, SceneViewOptions, Stat, TextureInput } from '../scene-types';
import { BLUR, BROKEN, COMPOSITE, SOURCE, VERTEX } from './shaders';

type GL = WebGL2RenderingContext;
type Events = HTMLElementEventMap & DocumentEventMap & WindowEventMap & { webglcontextlost: WebGLContextEvent; webglcontextrestored: WebGLContextEvent };

interface Target {
  tex: WebGLTexture;
  fbo: WebGLFramebuffer;
  width: number;
  height: number;
}

interface Programs {
  source: WebGLProgram;
  blur: WebGLProgram;
  composite: WebGLProgram;
  vao: WebGLVertexArrayObject;
  buffer: WebGLBuffer;
  uniforms: Map<WebGLProgram, Map<string, WebGLUniformLocation | null>>;
}

const PATTERN_INDEX = { grid: 0, blocks: 1, bands: 2 } as const;
const RING = 120;

class Ring {
  private values: number[] = [];
  push(v: number) {
    this.values.push(v);
    if (this.values.length > RING) this.values.shift();
  }
  clear() {
    this.values = [];
  }
  stat(): Stat | null {
    if (this.values.length < 3) return null;
    const s = [...this.values].sort((a, b) => a - b);
    const q = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))]!;
    return { median: round(q(0.5)), p95: round(q(0.95)), samples: s.length };
  }
  get size() {
    return this.values.length;
  }
}

const round = (v: number) => Math.round(v * 100) / 100;

/** 3×3 saturation matrix, column-major (feColorMatrix type=saturate coefficients). */
function saturation(s: number): Float32Array {
  const r = [
    [0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s],
    [0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s],
    [0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s],
  ];
  return new Float32Array([r[0]![0]!, r[1]![0]!, r[2]![0]!, r[0]![1]!, r[1]![1]!, r[2]![1]!, r[0]![2]!, r[1]![2]!, r[2]![2]!]);
}

/** Gaussian half-kernel with linear-sampling offsets is overkill here: plain taps, normalized. */
function kernel(sigma: number, taps: number): { w: Float32Array; o: Float32Array; n: number } {
  const n = Math.max(1, Math.min(8, Math.floor((taps + 1) / 2)));
  const w = new Float32Array(8);
  const o = new Float32Array(8);
  const step = n > 1 ? Math.max(1, (sigma * 2.5) / (n - 1)) : 1;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const x = i * step;
    const v = Math.exp(-(x * x) / (2 * sigma * sigma));
    w[i] = v;
    o[i] = x;
    sum += i === 0 ? v : 2 * v;
  }
  for (let i = 0; i < n; i++) w[i] = w[i]! / sum;
  return { w, o, n };
}

export class WebGLSceneView implements SceneView {
  readonly canvas: HTMLCanvasElement;
  private gl: GL | null = null;
  private programs: Programs | null = null;
  private scene: Target | null = null;
  private blurA: Target | null = null;
  private blurB: Target | null = null;
  private sourceTex: WebGLTexture | null = null;
  private readonly maps = new Map<string, WebGLTexture>();
  private mapKey = '';
  private params: GlassParams;
  private quality: QualityProfile;
  private source: TextureInput;
  private sourceImage: HTMLImageElement | null = null;
  private sourceError: string | null = null;
  private sourceReady = false;
  private effective: SceneStatus['effective'] = 'webgl2';
  private readonly reasons: string[] = [];
  private readonly listeners = new Set<(s: SceneStatus) => void>();
  private readonly cleanups: (() => void)[] = [];
  private readonly x = spring(0);
  private readonly y = spring(0);
  private readonly press = spring(0);
  private pointer = { x: 0.5, y: 0.5 };
  private lensPlaced = false;
  private css = { width: 0, height: 0 };
  private px = { width: 1, height: 1 };
  private dpr = 1;
  private raf = 0;
  private lastFrame = 0;
  private lastStep = 0;
  private sceneDirty = true;
  private blurDirty = true;
  private animated = false;
  private fixedTime: number | null;
  private t0 = performance.now();
  /** Clock frozen at this time (s) while not animated; starts at 0. */
  private pausedAt: number | null = 0;
  private blurLevel = 0;
  private suspended = false;
  private offscreen = false;
  private hidden = false;
  private reducedMotion: boolean;
  private reducedTransparency: boolean;
  private adaptive: boolean;
  private adaptiveScale = 1;
  private reductions = 0;
  private slowFrames = 0;
  private destroyed = false;
  private readonly frameRing = new Ring();
  private readonly cpuRing = new Ring();
  private readonly gpuRing = new Ring();
  private timer: { ext: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null; pending: WebGLQuery[] } = { ext: null, pending: [] };
  private readonly counters: SceneStatus['counters'] = {
    programBuilds: 0,
    uniformUpdates: 0,
    mapUploads: 0,
    mapCacheHits: 0,
    sourceUploads: 0,
    blurPasses: 0,
    frames: 0,
    contextLosses: 0,
    contextRestores: 0,
    texturesAlive: 0,
  };
  private readonly foreground: HTMLElement | null;
  private readonly breakShader: boolean;
  private emitQueued = false;
  private loseExt: WEBGL_lose_context | null = null;

  constructor(o: SceneViewOptions) {
    this.canvas = o.canvas;
    this.params = engineParams(o.material);
    this.quality = resolveQuality(o.material.quality);
    this.adaptive = o.material.quality.adaptive;
    this.source = o.source;
    this.fixedTime = o.time ?? null;
    this.reducedMotion = o.reducedMotion ?? false;
    this.reducedTransparency = o.reducedTransparency ?? false;
    this.foreground = o.foreground ?? null;
    this.breakShader = o.debugBreakShader ?? false;
    if (o.lens) {
      this.x.value = this.x.target = o.lens.x;
      this.y.value = this.y.target = o.lens.y;
      this.lensPlaced = true;
    }
    this.measure();
    if (!this.lensPlaced) this.centre();
    this.init();
    this.listen(this.canvas, 'webglcontextlost', (e) => {
      e.preventDefault();
      this.counters.contextLosses++;
      this.stopLoop();
      this.dropResources(false);
      this.effective = 'lost';
      this.setReason('contesto WebGL2 perso: in attesa del ripristino');
      this.emit();
    });
    this.listen(this.canvas, 'webglcontextrestored', () => {
      this.counters.contextRestores++;
      this.clearReason('contesto WebGL2 perso');
      this.effective = 'webgl2';
      this.init();
      this.emit();
    });
    const ro = new ResizeObserver(() => this.resize());
    ro.observe(this.canvas);
    this.cleanups.push(() => ro.disconnect());
    if (o.autoSuspend ?? true) this.watchVisibility();
    if (o.interactive ?? true) this.bindInteraction();
    void this.loadSource();
  }

  // ---------- public ----------

  get status(): SceneStatus {
    const dynamic = this.isDynamic();
    return {
      requested: 'webgl2',
      effective: this.effective,
      reasons: [...this.reasons],
      source: { kind: this.source.kind, ready: this.sourceReady, error: this.sourceError, dynamic },
      canvas: { cssWidth: this.css.width, cssHeight: this.css.height, pixelWidth: this.px.width, pixelHeight: this.px.height, dpr: this.dpr, scale: round(this.scale()) },
      quality: this.quality,
      adaptive: { enabled: this.adaptive, scale: round(this.adaptiveScale), reductions: this.reductions },
      looping: this.raf !== 0 && this.loopWanted(),
      suspended: this.suspended,
      counters: { ...this.counters },
      metrics: {
        frameInterval: this.frameRing.stat(),
        cpu: this.cpuRing.stat(),
        gpu: this.gpuRing.stat(),
        gpuNote: this.timer.ext ? 'EXT_disjoint_timer_query_webgl2' : 'tempo GPU non disponibile su questo browser (estensione assente)',
      },
      lens: { ...this.lensRect() },
      support: supportReport('webgl2'),
    };
  }

  setMaterial(doc: GlassDocument): SceneUpdate {
    const next = engineParams(doc);
    const changed = changedKeys(this.params, next);
    const stages = stagesFor(changed);
    const quality = resolveQuality(doc.quality);
    const applied: SceneUpdate['applied'] = [];
    const builds = this.counters.programBuilds;
    const qualityChanged = JSON.stringify(quality) !== JSON.stringify(this.quality);
    const blurChanged = next.blur !== this.params.blur;
    this.params = next;
    if (doc.quality.adaptive !== this.adaptive) this.setAdaptive(doc.quality.adaptive);
    if (qualityChanged) {
      this.quality = quality;
      this.adaptiveScale = 1;
      this.resize();
      applied.push('resize');
    }
    if (stages.has('map') || qualityChanged) {
      if (this.ensureMap()) applied.push('map');
    }
    if (blurChanged) {
      this.blurDirty = true;
      applied.push('blur');
    }
    if (changed.length) {
      this.counters.uniformUpdates++;
      applied.push('uniforms');
    }
    this.keepInside();
    this.invalidate();
    return { changed, applied, programBuilt: this.counters.programBuilds > builds };
  }

  async setSource(source: TextureInput): Promise<void> {
    this.source = source;
    await this.loadSource();
  }

  setLens(x: number, y: number, immediate = false): void {
    this.lensPlaced = true;
    const c = this.clamp(x, y);
    this.x.target = c.x;
    this.y.target = c.y;
    if (immediate || this.reducedMotion) {
      snapSpring(this.x);
      snapSpring(this.y);
    }
    this.wake();
  }

  setAnimated(on: boolean): void {
    if (on === this.animated) return;
    this.animated = on;
    // Pausing freezes the clock where it is; resuming continues from there.
    if (!on) this.pausedAt = this.now();
    else if (this.pausedAt !== null) {
      this.t0 = performance.now() - this.pausedAt * 1000;
      this.pausedAt = null;
    }
    this.wake();
    this.emit();
  }

  setTime(t: number | null): void {
    this.fixedTime = t;
    if (t === null) this.t0 = performance.now();
    this.sceneDirty = true;
    this.invalidate();
  }

  resetTime(): void {
    this.t0 = performance.now();
    this.pausedAt = this.animated ? null : 0;
    this.sceneDirty = true;
    this.invalidate();
  }

  setReducedMotion(on: boolean): void {
    this.reducedMotion = on;
    if (on) {
      snapSpring(this.x);
      snapSpring(this.y);
      snapSpring(this.press);
    }
    this.wake();
    this.emit();
  }

  setReducedTransparency(on: boolean): void {
    this.reducedTransparency = on;
    if (on) this.setReason('trasparenza ridotta: lente opaca');
    else this.clearReason('trasparenza ridotta');
    this.invalidate();
    this.emit();
  }

  setAdaptive(on: boolean): void {
    this.adaptive = on;
    this.slowFrames = 0;
    if (!on && this.adaptiveScale !== 1) {
      this.adaptiveScale = 1;
      this.resize();
    }
    this.emit();
  }

  resize(): void {
    if (this.destroyed) return;
    this.measure();
    if (this.gl && this.programs) {
      this.allocateTargets();
      this.sceneDirty = true;
      this.blurDirty = true;
    }
    if (!this.lensPlaced) this.centre();
    this.keepInside();
    this.invalidate();
  }

  invalidate(): void {
    this.wake();
  }

  snapshot(): string {
    this.render(performance.now());
    return this.canvas.toDataURL('image/png');
  }

  suspend(): void {
    if (this.suspended) return;
    this.suspended = true;
    this.press.target = 0;
    snapSpring(this.press);
    this.stopLoop();
    this.emit();
  }

  resume(): void {
    if (!this.suspended || this.offscreen || this.hidden) return;
    this.suspended = false;
    this.frameRing.clear();
    this.invalidate();
    this.emit();
  }

  onStatus(listener: (s: SceneStatus) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.stopLoop();
    for (const c of this.cleanups.splice(0)) c();
    this.dropResources(true);
    this.listeners.clear();
    this.sourceImage = null;
  }

  debugLoseContext(): boolean {
    const ext = this.loseExt;
    if (!ext) return false;
    ext.loseContext();
    return true;
  }

  debugRestoreContext(): boolean {
    // Kept from init: getExtension() returns null while the context is lost.
    const ext = this.loseExt;
    if (!ext) return false;
    ext.restoreContext();
    return true;
  }

  // ---------- setup ----------

  private init() {
    const gl = this.canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      powerPreference: 'low-power',
    });
    if (!gl) {
      this.effective = 'unavailable';
      this.setReason('WebGL2 non disponibile su questo browser o dispositivo');
      return;
    }
    this.gl = gl;
    if (gl.isContextLost()) return;
    this.loseExt ??= gl.getExtension('WEBGL_lose_context');
    try {
      this.programs = this.buildPrograms(gl);
    } catch (e) {
      this.effective = 'unavailable';
      this.setReason(`errore di compilazione degli shader: ${(e as Error).message}`);
      this.programs = null;
      return;
    }
    const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') as { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;
    this.timer = { ext, pending: [] };
    this.allocateTargets();
    this.mapKey = '';
    this.ensureMap();
    if (this.sourceImage) this.uploadImage(this.sourceImage);
    this.sceneDirty = true;
    this.blurDirty = true;
    this.invalidate();
  }

  private buildPrograms(gl: GL): Programs {
    const compile = (type: number, src: string, name: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) {
        const log = gl.getShaderInfoLog(s) ?? 'nessun log';
        gl.deleteShader(s);
        throw new Error(`${name}: ${log.trim()}`);
      }
      return s;
    };
    const link = (fs: string, name: string) => {
      const p = gl.createProgram()!;
      const v = compile(gl.VERTEX_SHADER, VERTEX, `${name} (vertex)`);
      const f = compile(gl.FRAGMENT_SHADER, fs, name);
      gl.attachShader(p, v);
      gl.attachShader(p, f);
      gl.bindAttribLocation(p, 0, 'a_pos');
      gl.linkProgram(p);
      gl.deleteShader(v);
      gl.deleteShader(f);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) {
        const log = gl.getProgramInfoLog(p) ?? '';
        gl.deleteProgram(p);
        throw new Error(`${name}: ${log.trim()}`);
      }
      return p;
    };
    const source = link(SOURCE, 'source');
    const blur = link(BLUR, 'blur');
    const composite = link(this.breakShader ? BROKEN : COMPOSITE, 'composite');
    const vao = gl.createVertexArray()!;
    const buffer = gl.createBuffer()!;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    this.counters.programBuilds++;
    return { source, blur, composite, vao, buffer, uniforms: new Map() };
  }

  private texture(gl: GL, width: number, height: number, mip: boolean): WebGLTexture {
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.counters.texturesAlive++;
    return t;
  }

  private deleteTexture(t: WebGLTexture | null) {
    if (!t) return;
    this.gl?.deleteTexture(t);
    this.counters.texturesAlive = Math.max(0, this.counters.texturesAlive - 1);
  }

  private target(gl: GL, width: number, height: number, mip: boolean): Target {
    const tex = this.texture(gl, width, height, mip);
    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex, fbo, width, height };
  }

  private freeTarget(t: Target | null) {
    if (!t) return;
    this.deleteTexture(t.tex);
    this.gl?.deleteFramebuffer(t.fbo);
  }

  private allocateTargets() {
    const gl = this.gl;
    if (!gl || gl.isContextLost()) return;
    const { width, height } = this.px;
    if (!this.scene || this.scene.width !== width || this.scene.height !== height) {
      this.freeTarget(this.scene);
      this.scene = this.target(gl, width, height, false);
    }
    this.allocateBlur(this.blurLevel);
  }

  /** Blur targets at 1/2^level of the canvas: large blurs run on small targets. */
  private allocateBlur(level: number) {
    const gl = this.gl;
    if (!gl || gl.isContextLost()) return;
    const f = Math.pow(2, level);
    const bw = Math.max(1, Math.ceil(this.px.width / f));
    const bh = Math.max(1, Math.ceil(this.px.height / f));
    if (!this.blurA || this.blurA.width !== bw || this.blurA.height !== bh) {
      this.freeTarget(this.blurA);
      this.freeTarget(this.blurB);
      this.blurA = this.target(gl, bw, bh, false);
      this.blurB = this.target(gl, bw, bh, false);
    }
    this.blurLevel = level;
  }

  /** Uploads the map for the current geometry; true when it was not cached. */
  private ensureMap(): boolean {
    const gl = this.gl;
    if (!gl || gl.isContextLost() || !this.programs) return false;
    const g = this.geometry();
    const res = this.quality.mapResolution;
    const key = geometryKey(g, res);
    if (key === this.mapKey) return false;
    this.mapKey = key;
    const hit = this.maps.get(key);
    if (hit) {
      this.maps.delete(key);
      this.maps.set(key, hit);
      this.counters.mapCacheHits++;
      return false;
    }
    const map = computeLensMap(g, res);
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, map.width, map.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(map.data.buffer));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.counters.texturesAlive++;
    this.counters.mapUploads++;
    this.maps.set(key, t);
    // GPU cache is bounded separately from the CPU map cache: maps can be large.
    const limit = Math.max(2, Math.min(8, this.quality.mapCache));
    while (this.maps.size > limit) {
      const oldest = this.maps.keys().next().value as string;
      this.deleteTexture(this.maps.get(oldest)!);
      this.maps.delete(oldest);
    }
    return true;
  }

  private async loadSource() {
    const s = this.source;
    this.sourceReady = false;
    this.sourceError = null;
    this.clearReason('sorgente');
    this.sourceImage = null;
    this.deleteTexture(this.sourceTex);
    this.sourceTex = null;
    if (s.kind === 'pattern') {
      this.sourceReady = true;
    } else if (s.kind === 'canvas') {
      this.sourceReady = true;
    } else {
      const img = new Image();
      img.decoding = 'async';
      const cross = s.crossOrigin === undefined ? (isCrossOrigin(s.url) ? 'anonymous' : null) : s.crossOrigin;
      if (cross) img.crossOrigin = cross;
      img.src = s.url;
      try {
        await img.decode();
      } catch {
        if (this.source !== s) return;
        this.fail(`sorgente: immagine non caricata (${s.url}): rete, formato o CORS`);
        return;
      }
      if (this.source !== s || this.destroyed) return;
      this.sourceImage = img;
      this.uploadImage(img);
    }
    this.sceneDirty = true;
    this.invalidate();
    this.emit();
  }

  private uploadImage(img: HTMLImageElement) {
    const gl = this.gl;
    if (!gl || gl.isContextLost()) return;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, img);
    } catch (e) {
      gl.deleteTexture(t);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      this.fail(
        (e as Error).name === 'SecurityError'
          ? 'sorgente: immagine di un’altra origine senza intestazioni CORS: WebGL2 non può leggerla'
          : `sorgente: caricamento della texture non riuscito (${(e as Error).message})`,
      );
      return;
    }
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.counters.texturesAlive++;
    this.counters.sourceUploads++;
    this.deleteTexture(this.sourceTex);
    this.sourceTex = t;
    this.sourceReady = true;
    this.sceneDirty = true;
  }

  private fail(reason: string) {
    this.sourceError = reason;
    this.sourceReady = false;
    this.setReason(reason);
    this.invalidate();
    this.emit();
  }

  private dropResources(includeGl: boolean) {
    const gl = this.gl;
    if (gl && !gl.isContextLost() && includeGl) {
      for (const t of this.maps.values()) this.deleteTexture(t);
      this.deleteTexture(this.sourceTex);
      this.freeTarget(this.scene);
      this.freeTarget(this.blurA);
      this.freeTarget(this.blurB);
      if (this.programs) {
        gl.deleteProgram(this.programs.source);
        gl.deleteProgram(this.programs.blur);
        gl.deleteProgram(this.programs.composite);
        gl.deleteVertexArray(this.programs.vao);
        gl.deleteBuffer(this.programs.buffer);
      }
      for (const q of this.timer.pending) gl.deleteQuery(q);
    }
    // After a loss every handle is dead: forget them without calling into GL.
    this.maps.clear();
    this.sourceTex = null;
    this.scene = this.blurA = this.blurB = null;
    this.programs = null;
    this.timer.pending = [];
    this.counters.texturesAlive = 0;
    this.mapKey = '';
  }

  // ---------- geometry and interaction ----------

  private geometry(): LensGeometry {
    const p = this.params;
    return { width: p.width, height: p.height, radius: effectiveRadius(p), band: p.band, profile: p.profile, dome: p.dome };
  }

  private lensRect() {
    return { x: this.x.value, y: this.y.value, width: this.params.width, height: this.params.height };
  }

  private scale(): number {
    return this.quality.internalScale * this.adaptiveScale;
  }

  private measure() {
    const r = this.canvas.getBoundingClientRect();
    this.css = { width: Math.max(1, r.width), height: Math.max(1, r.height) };
    this.dpr = window.devicePixelRatio || 1;
    const k = Math.min(this.dpr, this.quality.dprCap) * this.scale();
    this.px = { width: Math.max(1, Math.round(this.css.width * k)), height: Math.max(1, Math.round(this.css.height * k)) };
    if (this.canvas.width !== this.px.width) this.canvas.width = this.px.width;
    if (this.canvas.height !== this.px.height) this.canvas.height = this.px.height;
  }

  private centre() {
    const c = { x: (this.css.width - this.params.width) / 2, y: (this.css.height - this.params.height) / 2 };
    this.x.value = this.x.target = Math.max(0, c.x);
    this.y.value = this.y.target = Math.max(0, c.y);
  }

  private clamp(x: number, y: number) {
    return {
      x: Math.min(Math.max(0, x), Math.max(0, this.css.width - this.params.width)),
      y: Math.min(Math.max(0, y), Math.max(0, this.css.height - this.params.height)),
    };
  }

  private keepInside() {
    const c = this.clamp(this.x.target, this.y.target);
    if (c.x !== this.x.target || c.y !== this.y.target) {
      this.x.target = this.x.value = c.x;
      this.y.target = this.y.value = c.y;
    }
  }

  private bindInteraction() {
    const el = this.canvas;
    el.style.touchAction = 'none';
    let pointerId: number | null = null;
    let offset = { x: 0, y: 0 };
    const local = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const inside = (p: { x: number; y: number }) => {
      const l = this.lensRect();
      return p.x >= l.x && p.y >= l.y && p.x <= l.x + l.width && p.y <= l.y + l.height;
    };
    const end = () => {
      if (pointerId !== null && el.hasPointerCapture(pointerId)) el.releasePointerCapture(pointerId);
      pointerId = null;
      this.press.target = 0;
      if (this.reducedMotion) snapSpring(this.press);
      el.removeAttribute('data-dragging');
      this.wake();
    };
    this.listen(el, 'pointerdown', (e) => {
      if (!e.isPrimary || e.button !== 0 || pointerId !== null) return;
      const p = local(e);
      if (!inside(p)) return;
      pointerId = e.pointerId;
      el.setPointerCapture(e.pointerId);
      el.setAttribute('data-dragging', '');
      offset = { x: p.x - this.x.target, y: p.y - this.y.target };
      const l = this.lensRect();
      this.pointer = { x: (p.x - l.x) / l.width, y: (p.y - l.y) / l.height };
      this.press.target = 1;
      if (this.reducedMotion) snapSpring(this.press);
      this.lensPlaced = true;
      this.wake();
      e.preventDefault();
    });
    this.listen(el, 'pointermove', (e) => {
      if (e.pointerId !== pointerId) return;
      const p = local(e);
      this.setLens(p.x - offset.x, p.y - offset.y);
      const l = this.lensRect();
      this.pointer = { x: Math.min(1, Math.max(0, (p.x - l.x) / l.width)), y: Math.min(1, Math.max(0, (p.y - l.y) / l.height)) };
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
      this.listen(el, type, (e) => {
        if (e.pointerId === pointerId) end();
      });
    }
    this.listen(el, 'keydown', (e) => {
      const step = 8 * (e.shiftKey ? 4 : 1);
      const d: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      const v = d[e.key];
      if (!v) return;
      e.preventDefault();
      this.setLens(this.x.target + v[0], this.y.target + v[1]);
    });
    this.listen(window, 'blur', end);
  }

  private watchVisibility() {
    const doc = this.canvas.ownerDocument;
    const sync = () => {
      if (this.offscreen || this.hidden) this.suspend();
      else this.resume();
    };
    this.listen(doc, 'visibilitychange', () => {
      this.hidden = doc.visibilityState === 'hidden';
      sync();
    });
    const io = new IntersectionObserver((entries) => {
      const e = entries[entries.length - 1];
      if (!e) return;
      this.offscreen = !e.isIntersecting;
      sync();
    });
    io.observe(this.canvas);
    this.cleanups.push(() => io.disconnect());
  }

  // ---------- frames ----------

  private isDynamic(): boolean {
    const s = this.source;
    return (s.kind === 'pattern' && s.animated) || (s.kind === 'canvas' && s.dynamic);
  }

  private springsMoving(): boolean {
    return !(isSettled(this.x, 0.05) && isSettled(this.y, 0.05) && isSettled(this.press, 0.002, 0.01));
  }

  private loopWanted(): boolean {
    const playing = this.isDynamic() && this.animated && !this.reducedMotion && this.fixedTime === null;
    return !this.suspended && (playing || this.springsMoving());
  }

  private wake() {
    if (this.raf || this.destroyed || this.suspended) return;
    this.raf = requestAnimationFrame(this.tick);
  }

  private stopLoop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.lastFrame = 0;
    this.lastStep = 0;
  }

  private readonly tick = (now: number) => {
    this.raf = 0;
    if (this.destroyed || this.suspended) return;
    const budget = 1000 / this.quality.maxFps;
    const playing = this.isDynamic() && this.animated && !this.reducedMotion && this.fixedTime === null;
    // Frame budget for dynamic sources (e.g. 30 fps on Economy): skip early vsyncs.
    if (playing && !this.springsMoving() && this.lastFrame && now - this.lastFrame < budget - 2) {
      this.raf = requestAnimationFrame(this.tick);
      return;
    }
    const dt = this.lastStep ? Math.min(0.1, (now - this.lastStep) / 1000) : 1 / 60;
    this.lastStep = now;
    const config = { stiffness: this.params.stiffness, damping: this.params.damping };
    if (this.reducedMotion) {
      snapSpring(this.x);
      snapSpring(this.y);
      snapSpring(this.press);
    } else {
      stepSpring(this.x, dt, config);
      stepSpring(this.y, dt, config);
      stepSpring(this.press, dt, { stiffness: config.stiffness * 2.5, damping: Math.max(0.8, config.damping) });
    }
    if (playing) this.sceneDirty = true;
    if (this.lastFrame) this.frameRing.push(now - this.lastFrame);
    this.lastFrame = now;
    this.render(now);
    if (this.loopWanted()) this.raf = requestAnimationFrame(this.tick);
    else {
      snapSpring(this.x);
      snapSpring(this.y);
      snapSpring(this.press);
      this.lastFrame = 0;
      this.lastStep = 0;
    }
    this.queueEmit();
  };

  private now(): number {
    if (this.fixedTime !== null) return this.fixedTime;
    if (this.pausedAt !== null) return this.pausedAt;
    return (performance.now() - this.t0) / 1000;
  }

  private uniform(program: WebGLProgram, name: string): WebGLUniformLocation | null {
    const p = this.programs!;
    let m = p.uniforms.get(program);
    if (!m) {
      m = new Map();
      p.uniforms.set(program, m);
    }
    if (!m.has(name)) m.set(name, this.gl!.getUniformLocation(program, name));
    return m.get(name)!;
  }

  private render(now: number) {
    const gl = this.gl;
    const pr = this.programs;
    if (!gl || !pr || gl.isContextLost() || !this.scene || !this.blurA || !this.blurB) return;
    const start = performance.now();
    const query = this.beginGpuQuery(gl);
    gl.bindVertexArray(pr.vao);
    const k = this.px.width / this.css.width;
    const src = this.source;
    const p = this.params;

    if (this.sceneDirty) {
      if (src.kind === 'canvas') this.uploadCanvas(gl, src.canvas);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.scene.fbo);
      gl.viewport(0, 0, this.scene.width, this.scene.height);
      gl.useProgram(pr.source);
      gl.uniform2f(this.uniform(pr.source, 'u_res'), this.scene.width, this.scene.height);
      gl.uniform1f(this.uniform(pr.source, 'u_k'), k);
      gl.uniform1f(this.uniform(pr.source, 'u_time'), this.now());
      const textured = src.kind !== 'pattern' && this.sourceTex;
      // 3 = neutral fill while an image loads or after it failed.
      gl.uniform1i(this.uniform(pr.source, 'u_pattern'), src.kind === 'pattern' ? PATTERN_INDEX[src.pattern] : textured ? -1 : 3);
      // Unit 0 must never hold the scene texture while drawing into it (feedback loop).
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, textured ? this.sourceTex : null);
      gl.uniform1i(this.uniform(pr.source, 'u_tex'), 0);
      if (textured) {
        const size = this.sourceSize();
        const ca = this.css.width / this.css.height;
        const ia = size.width / size.height;
        gl.uniform2f(this.uniform(pr.source, 'u_cover'), ca > ia ? 1 : ca / ia, ca > ia ? ia / ca : 1);
      }
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      // Mipmaps only feed blurs too large for the kernel at full resolution.
      if (this.blurLevelFor(p.blur * k) > 0) {
        gl.bindTexture(gl.TEXTURE_2D, this.scene.tex);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      } else {
        gl.bindTexture(gl.TEXTURE_2D, this.scene.tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      }
      this.sceneDirty = false;
      this.blurDirty = true;
    }

    const blurPx = p.blur * k;
    if (this.blurDirty && blurPx > 0.01) {
      this.blurPasses(gl, pr, blurPx);
      this.blurDirty = false;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.px.width, this.px.height);
    gl.useProgram(pr.composite);
    const c = pr.composite;
    const u = (n: string) => this.uniform(c, n);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.scene.tex);
    gl.uniform1i(u('u_scene'), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.blurB.tex);
    gl.uniform1i(u('u_blur'), 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.maps.get(this.mapKey) ?? null);
    gl.uniform1i(u('u_map'), 2);
    const press = this.reducedMotion ? 0 : this.press.value;
    const s = 1 + (p.pressScale - 1) * press;
    const { sx, sy } = this.stretch(s);
    const l = this.lensRect();
    gl.uniform2f(u('u_res'), this.px.width, this.px.height);
    gl.uniform1f(u('u_k'), k);
    gl.uniform4f(u('u_lens'), l.x, l.y, l.width, l.height);
    gl.uniform2f(u('u_scale'), sx, sy);
    gl.uniform1f(u('u_radius'), effectiveRadius(p));
    gl.uniform1f(u('u_refraction'), p.refraction * (1 + p.pressRefraction * press));
    gl.uniform1f(u('u_chroma'), p.chroma);
    gl.uniform1f(u('u_useBlur'), blurPx > 0.01 ? 1 : 0);
    gl.uniformMatrix3fv(u('u_sat'), false, saturation(p.saturation / 100));
    const [r, g, b] = hexToRgb(p.tint);
    gl.uniform3f(u('u_tint'), r / 255, g / 255, b / 255);
    gl.uniform1f(u('u_tintA'), p.tintOpacity);
    gl.uniform1f(u('u_light'), p.light);
    gl.uniform1f(u('u_lightAngle'), (p.lightAngle * Math.PI) / 180);
    gl.uniform1f(u('u_press'), press);
    gl.uniform2f(u('u_pointer'), this.pointer.x, this.pointer.y);
    gl.uniform1f(u('u_pressLight'), p.pressLight);
    gl.uniform1f(u('u_shadow'), p.shadow);
    gl.uniform1f(u('u_shadowBlur'), p.shadowBlur);
    gl.uniform1f(u('u_shadowY'), p.shadowOffset);
    gl.uniform1f(u('u_opaque'), this.reducedTransparency ? 1 : 0);
    gl.uniform3f(u('u_opaqueColor'), 0.97, 0.97, 0.98);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    if (query) this.endGpuQuery(gl, query);
    this.counters.frames++;
    const cpu = performance.now() - start;
    this.cpuRing.push(cpu);
    this.placeForeground(l, sx, sy);
    this.adapt(now, cpu);
  }

  private stretch(s: number) {
    let sx = s;
    let sy = s;
    const p = this.params;
    if (!this.reducedMotion && p.stretch > 0) {
      const vx = this.x.velocity;
      const vy = this.y.velocity;
      const speed = Math.hypot(vx, vy);
      if (speed > 1) {
        const e = Math.min(1, speed / 2400) * p.stretch;
        const kk = (vx * vx - vy * vy) / (speed * speed);
        sx *= 1 + e * kk;
        sy *= 1 - e * kk;
      }
    }
    return { sx, sy };
  }

  /** Mip level a blur of `sigmaPx` device px runs on (0 = full resolution). */
  private blurLevelFor(sigmaPx: number): number {
    if (sigmaPx <= 0.01) return 0;
    const n = Math.max(1, Math.min(8, Math.floor((this.quality.blurTaps + 1) / 2)));
    const maxSigma = Math.max(0.8, (n - 1) / 2.5);
    return sigmaPx <= maxSigma ? 0 : Math.ceil(Math.log2(sigmaPx / maxSigma));
  }

  private blurPasses(gl: GL, pr: Programs, sigmaPx: number) {
    // Kernel of n taps per side covers ±2.5σ with steps ≤ 1 texel up to maxSigma;
    // larger blurs read a smaller mip level and run on a smaller target.
    const level = this.blurLevelFor(sigmaPx);
    if (level !== this.blurLevel || !this.blurA) this.allocateBlur(level);
    const a = this.blurA!;
    const b = this.blurB!;
    const kern = kernel(Math.max(0.5, sigmaPx / Math.pow(2, level)), this.quality.blurTaps);
    const pass = (from: WebGLTexture, to: Target, dir: [number, number], lod: number) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, to.fbo);
      gl.viewport(0, 0, to.width, to.height);
      gl.useProgram(pr.blur);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, from);
      gl.uniform1i(this.uniform(pr.blur, 'u_tex'), 0);
      gl.uniform2f(this.uniform(pr.blur, 'u_res'), to.width, to.height);
      gl.uniform2f(this.uniform(pr.blur, 'u_dir'), dir[0] / to.width, dir[1] / to.height);
      gl.uniform1f(this.uniform(pr.blur, 'u_lod'), lod);
      gl.uniform1i(this.uniform(pr.blur, 'u_taps'), kern.n);
      gl.uniform1fv(this.uniform(pr.blur, 'u_w'), kern.w);
      gl.uniform1fv(this.uniform(pr.blur, 'u_o'), kern.o);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      this.counters.blurPasses++;
    };
    pass(this.scene!.tex, a, [1, 0], level);
    pass(a.tex, b, [0, 1], 0);
  }

  private uploadCanvas(gl: GL, canvas: HTMLCanvasElement) {
    if (!this.sourceTex) {
      this.sourceTex = gl.createTexture();
      this.counters.texturesAlive++;
      gl.bindTexture(gl.TEXTURE_2D, this.sourceTex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
    gl.bindTexture(gl.TEXTURE_2D, this.sourceTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    this.counters.sourceUploads++;
  }

  private sourceSize(): { width: number; height: number } {
    const s = this.source;
    if (s.kind === 'canvas') return { width: s.canvas.width || 1, height: s.canvas.height || 1 };
    if (this.sourceImage) return { width: this.sourceImage.naturalWidth || 1, height: this.sourceImage.naturalHeight || 1 };
    return { width: 1, height: 1 };
  }

  private placeForeground(l: { x: number; y: number; width: number; height: number }, sx: number, sy: number) {
    const f = this.foreground;
    if (!f) return;
    // The foreground follows the lens but is never scaled (text stays crisp).
    f.style.width = `${l.width}px`;
    f.style.height = `${l.height}px`;
    f.style.transform = `translate3d(${round(l.x)}px, ${round(l.y)}px, 0)`;
    void sx;
    void sy;
  }

  private adapt(now: number, cpu: number) {
    if (!this.adaptive) return;
    const budget = 1000 / this.quality.maxFps;
    const interval = this.lastFrame ? now - this.lastFrame : 0;
    if (cpu > budget * 0.5 || interval > budget * 1.5) this.slowFrames++;
    else this.slowFrames = Math.max(0, this.slowFrames - 1);
    if (this.slowFrames > 30 && this.adaptiveScale > 0.4) {
      this.adaptiveScale = Math.max(0.4, this.adaptiveScale * 0.85);
      this.reductions++;
      this.slowFrames = 0;
      queueMicrotask(() => this.resize());
      this.emit();
    }
  }

  private beginGpuQuery(gl: GL): WebGLQuery | null {
    const ext = this.timer.ext;
    if (!ext) return null;
    this.collectGpuQueries(gl);
    if (this.timer.pending.length > 4) return null;
    const q = gl.createQuery();
    if (!q) return null;
    gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
    return q;
  }

  private endGpuQuery(gl: GL, q: WebGLQuery) {
    gl.endQuery(this.timer.ext!.TIME_ELAPSED_EXT);
    this.timer.pending.push(q);
  }

  private collectGpuQueries(gl: GL) {
    const ext = this.timer.ext!;
    const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT) as boolean;
    this.timer.pending = this.timer.pending.filter((q) => {
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) return true;
      if (!disjoint) this.gpuRing.push((gl.getQueryParameter(q, gl.QUERY_RESULT) as number) / 1e6);
      gl.deleteQuery(q);
      return false;
    });
  }

  // ---------- status ----------

  private setReason(reason: string) {
    if (!this.reasons.includes(reason)) this.reasons.push(reason);
  }

  private clearReason(prefix: string) {
    for (let i = this.reasons.length - 1; i >= 0; i--) if (this.reasons[i]!.startsWith(prefix)) this.reasons.splice(i, 1);
  }

  private queueEmit() {
    if (this.emitQueued || !this.listeners.size) return;
    this.emitQueued = true;
    setTimeout(() => {
      this.emitQueued = false;
      this.emit();
    }, 250);
  }

  private emit() {
    if (this.destroyed || !this.listeners.size) return;
    const s = this.status;
    for (const l of this.listeners) l(s);
  }

  private listen<K extends keyof Events>(target: EventTarget, type: K, fn: (e: Events[K]) => void) {
    const h = fn as unknown as EventListener;
    target.addEventListener(type, h);
    this.cleanups.push(() => target.removeEventListener(type, h));
  }
}

function isCrossOrigin(url: string): boolean {
  try {
    return new URL(url, location.href).origin !== location.origin;
  } catch {
    return false;
  }
}
