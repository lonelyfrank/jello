/**
 * Controlled time for the Motion comparison (M6.4.3.A).
 *
 * The real surfaces already take an injectable clock through their coordinator (the M6.4.3 harness
 * does the same). This adapter only supplies that clock and replays the press → hold → release
 * sequence on it; every frame shown is rendered by the real renderer from the real oscillator.
 * There is no second solver and no pre-computed frame: scrubbing backwards resets the surfaces and
 * replays forward from 0 ms with the same deterministic input, which is exactly how they got there.
 * Framework-free, so it is testable with fake targets.
 */
import type { JellyClock } from '../../../../runtime/experimental/jelly-scheduler';
import { FRAME_MS, HOLD_MS, TIMELINE_MS } from './review-model';

export class ManualClock implements JellyClock {
  private t = 0;
  private nextId = 0;
  private callbacks = new Map<number, (time: number) => void>();
  now(): number { return this.t; }
  request(callback: (time: number) => void): number { const id = ++this.nextId; this.callbacks.set(id, callback); return id; }
  cancel(id: number): void { this.callbacks.delete(id); }
  /** Callbacks waiting for the next frame: zero when every surface is at rest. */
  get pending(): number { return this.callbacks.size; }
  /** One display frame at time `t`: runs the callbacks queued so far, once. */
  advance(t: number): void {
    this.t = t;
    const batch = [...this.callbacks.values()];
    this.callbacks.clear();
    for (const cb of batch) cb(t);
  }
  /** Moves time back without running anything. Only valid right after the participants were reset. */
  rewind(t: number): void { this.t = t; this.callbacks.clear(); }
}

export interface TimelineTarget {
  press(pressed: boolean): void;
  reset(): void;
  /** Pull-only motion snapshot of the real surface. */
  readonly motion: { x: number } | null;
}
export interface TimelineOptions {
  holdMs?: number; totalMs?: number; frameMs?: number;
  /** Receives the time and the displacement of every target after each advance; used to write the readouts without React. */
  onTime?(time: number, xs: number[]): void;
  /** RAF-like scheduler for Play; replaceable in tests. */
  schedule?(callback: (realTime: number) => void): number;
  unschedule?(id: number): void;
  onPlayingChange?(playing: boolean): void;
}

export class TimelineController {
  private time = 0;
  private started = false;
  private released = false;
  private raf: number | null = null;
  private last = 0;
  private destroyed = false;
  private peaks: number[] = [];
  private readonly hold: number;
  private readonly total: number;
  private readonly frame: number;

  constructor(private readonly clock: ManualClock, private readonly targets: () => TimelineTarget[], private readonly o: TimelineOptions = {}) {
    this.hold = o.holdMs ?? HOLD_MS;
    this.total = o.totalMs ?? TIMELINE_MS;
    this.frame = o.frameMs ?? FRAME_MS;
  }

  get currentTime(): number { return this.time; }
  get totalMs(): number { return this.total; }
  get playing(): boolean { return this.raf !== null; }
  /** Largest |x| each target reached since the last reset (fractions of the short side). */
  get peakDisplacement(): readonly number[] { return this.peaks; }

  /** Back to the idle surface at 0 ms, no press yet. */
  reset(): void {
    this.stop();
    this.clock.rewind(0);
    for (const t of this.targets()) t.reset();
    this.time = 0; this.started = false; this.released = false; this.peaks = this.targets().map(() => 0);
    this.emit();
  }

  private advanceTo(target: number): void {
    const end = Math.min(this.total, Math.max(0, target));
    if (!this.started) { this.started = true; for (const t of this.targets()) t.press(true); }
    while (this.time < end) {
      let next = Math.min(end, this.time + this.frame);
      if (!this.released && this.time < this.hold && next > this.hold) next = this.hold;
      this.clock.advance(next);
      this.time = next;
      if (!this.released && this.time >= this.hold) { this.released = true; for (const t of this.targets()) t.press(false); }
      this.sample();
    }
    this.emit();
  }
  private sample(): void {
    this.targets().forEach((t, i) => { this.peaks[i] = Math.max(this.peaks[i] ?? 0, Math.abs(t.motion?.x ?? 0)); });
  }
  private emit(): void { this.o.onTime?.(this.time, this.targets().map((t) => t.motion?.x ?? 0)); }

  /** Deterministic: reset and replay forward to `ms`. */
  seek(ms: number): void {
    const wasPlaying = this.playing;
    this.reset();
    if (ms > 0) this.advanceTo(ms);
    if (wasPlaying && this.time < this.total) this.play();
  }
  /** One display frame forward (pauses). */
  step(): void { this.stop(); this.advanceTo(this.time + this.frame); }
  restart(): void { this.reset(); this.play(); }

  play(): void {
    if (this.destroyed || this.raf !== null) return;
    if (this.time >= this.total) this.reset();
    const schedule = this.o.schedule ?? ((cb) => requestAnimationFrame(cb));
    this.last = 0;
    const tick = (real: number) => {
      if (this.destroyed) return;
      const dt = this.last ? Math.min(50, Math.max(0, real - this.last)) : this.frame;
      this.last = real;
      this.advanceTo(this.time + dt);
      if (this.time >= this.total) { this.raf = null; this.o.onPlayingChange?.(false); return; }
      this.raf = schedule(tick);
    };
    this.raf = schedule(tick);
    this.o.onPlayingChange?.(true);
  }
  pause(): void { if (this.stop()) this.o.onPlayingChange?.(false); }
  private stop(): boolean {
    if (this.raf === null) return false;
    (this.o.unschedule ?? ((id) => cancelAnimationFrame(id)))(this.raf);
    this.raf = null;
    return true;
  }
  destroy(): void { this.destroyed = true; this.stop(); }
}
