/**
 * Debounced saving with a visible status. "Salvato" is shown only after the
 * write resolved, i.e. after the IndexedDB transaction committed.
 */

import { toStorageError, type StorageErrorKind } from './repository';

export type SaveState =
  | { kind: 'idle' }
  | { kind: 'pending' }
  | { kind: 'saving' }
  | { kind: 'saved'; at: number }
  | { kind: 'error'; error: StorageErrorKind; message: string }
  | { kind: 'memory'; message: string };

export class Autosaver {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running: Promise<void> | null = null;
  private again = false;
  private state: SaveState = { kind: 'idle' };

  constructor(
    private readonly write: () => Promise<void>,
    private readonly onState: (s: SaveState) => void,
    private readonly delay = 600,
    /** Non-persistent repository: writes still run (same tab), the state says so. */
    private readonly memoryReason: string | null = null,
  ) {}

  get status(): SaveState {
    return this.state;
  }

  schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    this.set({ kind: 'pending' });
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.run();
    }, this.delay);
  }

  /** Writes now (explicit "Salva", page hide). */
  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    await this.run();
  }

  private async run(): Promise<void> {
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.set({ kind: 'saving' });
    this.running = (async () => {
      try {
        await this.write();
        this.set(this.memoryReason ? { kind: 'memory', message: this.memoryReason } : { kind: 'saved', at: Date.now() });
      } catch (e) {
        const err = toStorageError(e);
        this.set({ kind: 'error', error: err.kind, message: err.message });
      } finally {
        this.running = null;
      }
    })();
    await this.running;
    if (this.again) {
      this.again = false;
      await this.run();
    }
  }

  private set(s: SaveState) {
    this.state = s;
    this.onState(s);
  }
}
