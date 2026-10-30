/**
 * Autosaver.flush promises that what the state is *now* has been written when
 * it resolves — also when a debounced write is already in flight. A flush that
 * resolved with that older write left a reload (the e2e suite's, a closing page)
 * reading the previous state: the intermittent failure of the Material Lab test.
 */
import { describe, expect, it } from 'vitest';
import { Autosaver, type SaveState } from '../../src/lab/storage/autosave';

/** A write that records the state it saw when it started and finishes when told to. */
function harness() {
  let state = 0;
  const written: number[] = [];
  const gates: (() => void)[] = [];
  const states: SaveState['kind'][] = [];
  const save = new Autosaver(
    async () => {
      const seen = state;
      await new Promise<void>((resolve) => gates.push(resolve));
      written.push(seen);
    },
    (s) => states.push(s.kind),
    0,
  );
  return {
    save,
    states,
    written,
    set: (v: number) => (state = v),
    /** Lets the oldest pending write finish. */
    finish: async () => {
      gates.shift()?.();
      await new Promise((r) => setTimeout(r, 0));
    },
    pending: () => gates.length,
  };
}

describe('Autosaver', () => {
  it('flush writes the state as it is now, even when a write started earlier is still in flight', async () => {
    const h = harness();
    h.set(1);
    h.save.schedule(); // the debounce fires (delay 0) and the write of state 1 starts
    await new Promise((r) => setTimeout(r, 5));
    expect(h.pending()).toBe(1);
    h.set(2); // edited while that write is in flight
    let resolved = false;
    const flushed = h.save.flush().then(() => (resolved = true));
    await h.finish(); // the first write completes…
    await new Promise((r) => setTimeout(r, 5));
    // …but the state of the edit is not on disk yet, so flush must not have resolved.
    expect(resolved).toBe(false);
    expect(h.written).toEqual([1]);
    await h.finish();
    await flushed;
    expect(h.written).toEqual([1, 2]);
    expect(h.save.status.kind).toBe('saved');
  });

  it('a flush with nothing in flight writes once, and a scheduled write is not repeated by it', async () => {
    const h = harness();
    h.set(7);
    h.save.schedule();
    const flushed = h.save.flush();
    await h.finish();
    await flushed;
    expect(h.written).toEqual([7]);
  });

  it('edits made during a scheduled write are written after it (no lost update)', async () => {
    const h = harness();
    h.set(1);
    h.save.schedule();
    await new Promise((r) => setTimeout(r, 5));
    h.set(2);
    h.save.schedule();
    await new Promise((r) => setTimeout(r, 5));
    await h.finish();
    await new Promise((r) => setTimeout(r, 5));
    await h.finish();
    await new Promise((r) => setTimeout(r, 5));
    expect(h.written).toEqual([1, 2]);
  });
});
