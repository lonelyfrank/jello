/**
 * Contract of the WebGL2 scene view. Types only: importing this file never
 * loads the WebGL2 backend (that happens in createSceneView, on demand).
 *
 * WebGL2 does not read the page underneath the canvas. It samples a
 * controlled texture: a deterministic pattern, an image (same origin or
 * served with CORS headers), or a canvas the integrator renders. Video
 * sources are reserved in this contract (`kind: 'video'`) but not
 * implemented yet.
 */

import type { PatternId } from '../model/document';
import type { MaterialDocument } from '../model/document';
import type { QualityProfile } from '../model/quality';
import type { ParamKey } from '../core/params';
import type { SupportLevel } from '../model/support';

export type TextureInput =
  | { kind: 'pattern'; pattern: PatternId; animated: boolean }
  | { kind: 'image'; url: string; crossOrigin?: 'anonymous' | 'use-credentials' | null }
  /** A canvas rendered by the integrator. `dynamic`: re-uploaded every frame of the loop. */
  | { kind: 'canvas'; canvas: HTMLCanvasElement; dynamic: boolean };

export interface SceneViewOptions {
  canvas: HTMLCanvasElement;
  material: MaterialDocument;
  source: TextureInput;
  /** Top-left of the lens in CSS px of the canvas; default: centred. */
  lens?: { x: number; y: number };
  /** Drag and press the lens with pointer and keyboard (default true). */
  interactive?: boolean;
  /** Element kept above the lens (text, icons): positioned by the view, never rendered into the canvas. */
  foreground?: HTMLElement;
  /** Suspend while the canvas is off-screen or the page hidden (default true). */
  autoSuspend?: boolean;
  /** Fixed animation time in seconds (deterministic frames, e.g. tests and comparisons). */
  time?: number;
  reducedMotion?: boolean;
  reducedTransparency?: boolean;
  /** Diagnostics only: compile a broken shader to exercise the error path. */
  debugBreakShader?: boolean;
}

export type SceneEffective = 'webgl2' | 'unavailable' | 'lost';

export interface Stat {
  median: number;
  p95: number;
  samples: number;
}

export interface SceneStatus {
  requested: 'webgl2';
  effective: SceneEffective;
  reasons: string[];
  source: { kind: TextureInput['kind']; ready: boolean; error: string | null; dynamic: boolean };
  canvas: { cssWidth: number; cssHeight: number; pixelWidth: number; pixelHeight: number; dpr: number; scale: number };
  quality: QualityProfile;
  adaptive: { enabled: boolean; scale: number; reductions: number };
  looping: boolean;
  suspended: boolean;
  counters: {
    programBuilds: number;
    uniformUpdates: number;
    mapUploads: number;
    mapCacheHits: number;
    sourceUploads: number;
    blurPasses: number;
    frames: number;
    contextLosses: number;
    contextRestores: number;
    texturesAlive: number;
  };
  metrics: {
    /** Interval between rendered frames while the loop runs. */
    frameInterval: Stat | null;
    /** JavaScript time spent preparing and submitting a frame. */
    cpu: Stat | null;
    /** GPU time (EXT_disjoint_timer_query_webgl2), null when the extension is not available. */
    gpu: Stat | null;
    gpuNote: string;
  };
  lens: { x: number; y: number; width: number; height: number };
  support: { key: ParamKey; level: SupportLevel; note: string }[];
}

export interface SceneUpdate {
  changed: ParamKey[];
  /** How the change was applied: uniforms only, a new map, a new blur, or nothing. */
  applied: ('uniforms' | 'map' | 'blur' | 'resize')[];
  programBuilt: boolean;
}

export interface SceneView {
  readonly status: SceneStatus;
  readonly canvas: HTMLCanvasElement;
  setMaterial(doc: MaterialDocument): SceneUpdate;
  setSource(source: TextureInput): Promise<void>;
  setLens(x: number, y: number, immediate?: boolean): void;
  setAnimated(on: boolean): void;
  /** Fixes the animation clock (seconds); null returns to real time. */
  setTime(t: number | null): void;
  /** Restarts the animation clock from zero (paused: stays at zero). */
  resetTime(): void;
  setReducedMotion(on: boolean): void;
  setReducedTransparency(on: boolean): void;
  setAdaptive(on: boolean): void;
  /** Canvas size or position changed outside the observers. */
  resize(): void;
  /** Requests one frame (the view renders only when something changed). */
  invalidate(): void;
  /** Renders now and returns the canvas as a PNG data URL (comparisons, tests). */
  snapshot(): string;
  suspend(): void;
  resume(): void;
  onStatus(listener: (s: SceneStatus) => void): () => void;
  /** Releases programs, textures, framebuffers, listeners, observers and loops. */
  destroy(): void;
  /** Diagnostics: forces a context loss/restore through WEBGL_lose_context when available. */
  debugLoseContext(): boolean;
  debugRestoreContext(): boolean;
}
