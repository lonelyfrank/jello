/**
 * Synchronised input for the comparison (M6.4.3.A).
 *
 * The cell the person interacts with keeps its own real input adapter. The hub forwards the SEMANTIC
 * result (press at a contact point, release, hover, reset) to the other cells through the bridge API,
 * i.e. the calls the DOM adapter itself makes on a surface. It never re-dispatches a native event and
 * never produces a click: only the cell that was really clicked has a native click.
 */
export interface SyncTarget {
  press(pressed: boolean, point?: { x: number; y: number }): void;
  hover(hovered: boolean): void;
  reset(): void;
}

export class SyncHub {
  private members = new Map<string, SyncTarget>();
  private source: string | null = null;
  private on = true;

  get enabled(): boolean { return this.on; }
  /** Turning it off in the middle of a gesture releases the followers instead of leaving them pressed. */
  set enabled(value: boolean) {
    if (this.on && !value) this.cancel();
    this.on = value;
  }
  get size(): number { return this.members.size; }
  get pressing(): boolean { return this.source !== null; }
  /** The cell whose gesture is being mirrored, if any. */
  get sourceId(): string | null { return this.source; }

  register(id: string, target: SyncTarget): () => void {
    this.members.set(id, target);
    return () => { if (this.members.get(id) === target) this.members.delete(id); if (this.source === id) this.source = null; };
  }
  private followers(from: string): SyncTarget[] { return [...this.members].filter(([id]) => id !== from).map(([, t]) => t); }

  press(from: string, point: { x: number; y: number }): void {
    if (!this.on || this.source !== null) return;
    this.source = from;
    for (const t of this.followers(from)) t.press(true, point);
  }
  release(from: string): void {
    if (this.source !== from) return;
    this.source = null;
    for (const t of this.followers(from)) t.press(false);
  }
  /** The source gesture was cancelled (pointer left, lost, blur): followers drop the press without a rebound, like the source. */
  cancel(): void {
    const from = this.source;
    if (from === null) return;
    this.source = null;
    for (const [id, t] of this.members) if (id !== from) t.reset();
  }
  hover(from: string, hovered: boolean): void {
    if (!this.on) return;
    for (const t of this.followers(from)) t.hover(hovered);
  }
}
