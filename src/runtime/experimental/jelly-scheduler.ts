/** Shared experimental coordinator. No DOM dependency; injectable clock and RAF. */
export interface JellyClock {
  now(): number;
  request(callback: (time: number) => void): number;
  cancel(id: number): void;
}
export interface JellyParticipant { frame(time: number): boolean }
export class JellyCoordinator {
  private active = new Set<JellyParticipant>();
  private pending: number | null = null;
  private destroyed = false;
  private frames = 0;
  private updates = 0;
  constructor(readonly clock: JellyClock) {}
  get status() { return { active: this.active.size, pending: this.pending !== null, frames: this.frames, updates: this.updates }; }
  add(surface: JellyParticipant): void {
    if (this.destroyed) return;
    this.active.add(surface);
    this.schedule();
  }
  remove(surface: JellyParticipant): void {
    this.active.delete(surface);
    if (!this.active.size && this.pending !== null) { this.clock.cancel(this.pending); this.pending = null; }
  }
  destroy(): void {
    this.destroyed = true;
    this.active.clear();
    if (this.pending !== null) this.clock.cancel(this.pending);
    this.pending = null;
  }
  private schedule(): void {
    if (!this.destroyed && this.active.size && this.pending === null) this.pending = this.clock.request(this.tick);
  }
  private tick = (time: number): void => {
    this.pending = null;
    if (this.destroyed) return;
    this.frames++;
    for (const surface of [...this.active]) {
      if (this.destroyed) break;
      if (!this.active.has(surface)) continue;
      this.updates++;
      if (!surface.frame(time)) this.remove(surface);
    }
    this.schedule();
  };
}
export function createJellyCoordinator(): JellyCoordinator {
  return new JellyCoordinator({ now: () => performance.now(), request: (cb) => requestAnimationFrame(cb), cancel: (id) => cancelAnimationFrame(id) });
}
