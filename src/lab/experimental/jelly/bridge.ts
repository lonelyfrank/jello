/**
 * Studio ↔ experimental Jelly renderer adapter (M6.4.1).
 *
 * One bridge owns one host element: it validates the document, mounts the real M6.3
 * renderer (`ExperimentalJellySurface`), applies parameter updates in place with
 * `update()`, holds the preview state, exposes diagnostics and releases every resource
 * on destroy. It contains no optics, physics or bubble code: those stay in the model
 * and the renderer. Framework-free on purpose, so React only decides WHEN to call it.
 *
 * The surface is created once per host. Parameter edits, backend changes, resize and
 * state changes never recreate it; only a different host element (or an invalid first
 * document) does. An invalid update is rejected as a whole and the last valid rendering
 * stays on screen: the host button remains a working native button either way.
 */
import { parseExperimentalJelly, type JellyExperimentalDocument, type JellyOverrideState } from '../../../model/experimental/jelly';
import { attachExperimentalJelly, type JellyRenderOptions, type JellyRenderStatus } from '../../../runtime/experimental/jelly';
import { bindJellyInput } from '../../../runtime/experimental/jelly-input';
import { createJellyCoordinator, type JellyCoordinator } from '../../../runtime/experimental/jelly-scheduler';
import { stateFlags, type PreviewState } from './preview-model';

/** The part of the renderer the bridge relies on; the real surface satisfies it structurally. */
export interface SurfaceLike {
  update(doc: JellyExperimentalDocument, options?: JellyRenderOptions): void;
  setState(flags: Partial<Record<JellyOverrideState, boolean>>): void;
  setPressed(pressed: boolean, point?: { x: number; y: number }): void;
  cancelPress(): void;
  setHovered(hover: boolean): void;
  setDisabled(disabled: boolean): void;
  setSuspended(suspended: boolean): void;
  resize(): void;
  destroy(): void;
  readonly status: JellyRenderStatus;
  readonly motion: JellyMotionSnapshot;
  onStatus(listener: (status: JellyRenderStatus) => void): () => void;
}
export interface JellyMotionSnapshot {
  x: number; v: number; target: number; time: number; pressed: boolean;
  contact: { x: number; y: number }; updates: number;
  scheduler: { active: number; pending: boolean; frames: number; updates: number };
}
export interface BridgeDeps {
  attach(host: HTMLElement, doc: JellyExperimentalDocument, options: JellyRenderOptions, coordinator: JellyCoordinator): SurfaceLike;
  bind(host: HTMLElement, surface: SurfaceLike): () => void;
}
export const realDeps: BridgeDeps = {
  attach: (host, doc, options, coordinator) => attachExperimentalJelly(host, doc, options, coordinator) as unknown as SurfaceLike,
  bind: (host, surface) => bindJellyInput(host, surface as never),
};

export type BridgeResult = { ok: true } | { ok: false; errors: string[] };
const fail = (errors: string[]): BridgeResult => ({ ok: false, errors });

/** Press → hold 450 ms → release: the same sequence the M6.3 evidence uses. */
export const BOUNCE_HOLD_MS = 450;

export class JellyBridge {
  private surface: SurfaceLike | null = null;
  private unbind: (() => void) | null = null;
  private unsubscribe: (() => void) | null = null;
  private state: PreviewState = 'live';
  private timers: ReturnType<typeof setTimeout>[] = [];
  private destroyed = false;
  private invalid: string[] | null = null;
  private readonly listeners = new Set<(status: JellyRenderStatus | null) => void>();
  private readonly ownsCoordinator: boolean;
  private readonly coordinator: JellyCoordinator;

  /** `coordinator` may be shared by several bridges (comparison view); a shared one is never destroyed here. */
  constructor(readonly host: HTMLElement, private readonly deps: BridgeDeps = realDeps, coordinator?: JellyCoordinator) {
    this.coordinator = coordinator ?? createJellyCoordinator();
    this.ownsCoordinator = !coordinator;
  }

  get mounted(): boolean { return this.surface !== null && !this.destroyed; }
  /** Errors of the last rejected document, or null when the rendering reflects the last document given. */
  get errors(): string[] | null { return this.invalid; }
  get status(): JellyRenderStatus | null { return this.surface?.status ?? null; }
  /** Pull-only snapshot: reading it never schedules work. */
  get motion(): JellyMotionSnapshot | null { return this.surface?.motion ?? null; }

  /** Status is re-sent after renders (parameter, resize, state), never per animation frame. */
  onStatus(listener: (status: JellyRenderStatus | null) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  /** Mounts on first valid document; afterwards equivalent to `update`. */
  apply(doc: JellyExperimentalDocument, options: JellyRenderOptions = {}): BridgeResult {
    if (this.destroyed) return fail(['bridge distrutto']);
    const parsed = parseExperimentalJelly(doc);
    if (!parsed.ok) { this.invalid = parsed.errors; this.emit(); return fail(parsed.errors); }
    this.invalid = null;
    if (!this.surface) {
      try {
        const surface = this.deps.attach(this.host, parsed.doc, options, this.coordinator);
        this.surface = surface;
        this.unsubscribe = surface.onStatus((s) => this.emit(s));
        this.syncInput();
        surface.setState(stateFlags(this.state));
      } catch (e) {
        this.surface = null;
        this.invalid = [(e as Error).message];
        this.emit();
        return fail(this.invalid);
      }
      this.emit();
      return { ok: true };
    }
    try {
      this.surface.update(parsed.doc, options);
    } catch (e) {
      this.invalid = [(e as Error).message];
      this.emit();
      return fail(this.invalid);
    }
    return { ok: true };
  }

  /** Forces one static state, or `live` to hand the host back to real pointer and keyboard input. */
  setPreviewState(state: PreviewState): void {
    if (this.destroyed || state === this.state) return;
    this.state = state;
    this.clearTimers();
    this.surface?.cancelPress();
    this.syncInput();
    this.surface?.setState(stateFlags(state));
  }
  get previewState(): PreviewState { return this.state; }

  /** Input is bound only while live: a forced state must not be undone by a stray pointer. */
  private syncInput(): void {
    this.unbind?.();
    this.unbind = null;
    if (this.surface && this.state === 'live') this.unbind = this.deps.bind(this.host, this.surface);
  }

  /** Programmatic press/hold/release (no click is produced; the host's semantics are untouched). */
  playBounce(holdMs = BOUNCE_HOLD_MS): void {
    if (!this.surface || this.state !== 'live' || this.destroyed) return;
    this.clearTimers();
    this.surface.cancelPress();
    this.surface.setPressed(true);
    this.timers.push(setTimeout(() => { this.surface?.setPressed(false); }, holdMs));
  }

  reset(): void {
    this.clearTimers();
    this.surface?.cancelPress();
  }

  /**
   * Semantic input for the review workspace: the same surface calls the DOM adapter makes, without any
   * DOM event (no pointer, no click). Honoured only while the host is live, like real input.
   */
  press(pressed: boolean, point?: { x: number; y: number }): void {
    if (!this.surface || this.destroyed || this.state !== 'live') return;
    this.clearTimers();
    this.surface.setPressed(pressed, point);
  }
  hover(hovered: boolean): void {
    if (!this.surface || this.destroyed || this.state !== 'live') return;
    this.surface.setHovered(hovered);
  }

  setSuspended(suspended: boolean): void { this.surface?.setSuspended(suspended); }
  resize(): void { this.surface?.resize(); }

  private emit(status: JellyRenderStatus | null = this.status): void {
    for (const l of [...this.listeners]) { if (this.destroyed) break; l(status); }
  }
  private clearTimers(): void { for (const t of this.timers) clearTimeout(t); this.timers = []; }

  /** Idempotent. Stops timers and input, destroys the surface (observers, media queries, RAF) and an owned coordinator. */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.clearTimers();
    this.unbind?.();
    this.unsubscribe?.();
    this.unbind = this.unsubscribe = null;
    const surface = this.surface;
    this.surface = null;
    surface?.destroy();
    if (this.ownsCoordinator) this.coordinator.destroy();
    this.listeners.clear();
  }
}
