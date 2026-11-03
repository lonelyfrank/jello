import { afterEach, describe, expect, it, vi } from 'vitest';
import { JellyBridge, type BridgeDeps, type SurfaceLike } from '../../src/lab/experimental/jelly/bridge';
import { DEFAULT_ENV, effectiveDoc, previewSizePx, renderOptions, stateFlags } from '../../src/lab/experimental/jelly/preview-model';
import { presetDoc } from '../../src/lab/experimental/jelly/workbench';
import { JellyCoordinator } from '../../src/runtime/experimental/jelly-scheduler';

/** Fake renderer: records calls, no DOM. The real one is exercised by the browser tests. */
function fakes() {
  const log: string[] = [];
  const surfaces: SurfaceLike[] = [];
  const listeners = new Set<(s: never) => void>();
  const deps: BridgeDeps = {
    attach: (_host, doc) => {
      log.push(`attach:${doc.id}`);
      const s = {
        update: vi.fn((d) => { log.push(`update:${d.id}`); }),
        setState: vi.fn((f) => { log.push(`state:${Object.entries(f).filter(([, v]) => v).map(([k]) => k).join(',')}`); }),
        setPressed: vi.fn((p) => { log.push(`pressed:${p}`); }),
        cancelPress: vi.fn(() => { log.push('cancel'); }),
        setHovered: vi.fn(), setDisabled: vi.fn(), setSuspended: vi.fn(), resize: vi.fn(),
        destroy: vi.fn(() => { log.push('destroy'); }),
        status: { backend: 'svg' } as never, motion: {} as never,
        onStatus: vi.fn((l) => { listeners.add(l); return () => listeners.delete(l); }),
      } as unknown as SurfaceLike;
      surfaces.push(s);
      return s;
    },
    bind: () => { log.push('bind'); return () => { log.push('unbind'); }; },
  };
  return { deps, log, surfaces, listeners };
}
const host = {} as HTMLElement;
const coordinator = () => new JellyCoordinator({ now: () => 0, request: () => 1, cancel: () => undefined });

afterEach(() => vi.useRealTimers());

describe('JellyBridge lifecycle', () => {
  it('mounts once, then updates in place without recreating the surface', () => {
    const { deps, log, surfaces } = fakes();
    const bridge = new JellyBridge(host, deps, coordinator());
    expect(bridge.apply(presetDoc('jelly-soft')!)).toEqual({ ok: true });
    for (let i = 0; i < 5; i++) bridge.apply(presetDoc('jelly-candy')!);
    expect(surfaces).toHaveLength(1);
    expect(log.filter((l) => l.startsWith('attach'))).toHaveLength(1);
    expect(log.filter((l) => l.startsWith('update'))).toHaveLength(5);
  });

  it('rejects an invalid document as a whole and keeps the last valid rendering', () => {
    const { deps, log, surfaces } = fakes();
    const bridge = new JellyBridge(host, deps, coordinator());
    bridge.apply(presetDoc('jelly-soft')!);
    const bad = presetDoc('jelly-soft')!;
    bad.material.bodyOpacity = 9;
    const r = bridge.apply(bad);
    expect(r.ok).toBe(false);
    expect(bridge.errors?.[0]).toMatch(/bodyOpacity/);
    expect(surfaces[0]!.update).not.toHaveBeenCalled();
    expect(log).not.toContain('destroy');
    expect(bridge.apply(presetDoc('jelly-soft')!).ok).toBe(true);
    expect(bridge.errors).toBeNull();
  });

  it('does not attach anything for an invalid first document', () => {
    const { deps, surfaces } = fakes();
    const bridge = new JellyBridge(host, deps, coordinator());
    const bad = presetDoc('jelly-soft')!;
    bad.bubbles.radiusMin = 9;
    expect(bridge.apply(bad).ok).toBe(false);
    expect(surfaces).toHaveLength(0);
    expect(bridge.mounted).toBe(false);
  });

  it('reports an attach failure instead of throwing', () => {
    const bridge = new JellyBridge(host, { attach: () => { throw new Error('boom'); }, bind: () => () => undefined }, coordinator());
    expect(bridge.apply(presetDoc('jelly-soft')!)).toEqual({ ok: false, errors: ['boom'] });
  });

  it('binds input only while live and unbinds when a static state is forced', () => {
    const { deps, log } = fakes();
    const bridge = new JellyBridge(host, deps, coordinator());
    bridge.apply(presetDoc('jelly-soft')!);
    expect(log.filter((l) => l === 'bind')).toHaveLength(1);
    bridge.setPreviewState('pressed');
    expect(log).toContain('unbind');
    expect(log.at(-1)).toBe('state:pressed');
    bridge.setPreviewState('live');
    expect(log.filter((l) => l === 'bind')).toHaveLength(2);
  });

  it('applies the chosen state to a surface mounted later', () => {
    const { deps, log } = fakes();
    const bridge = new JellyBridge(host, deps, coordinator());
    bridge.setPreviewState('disabled');
    bridge.apply(presetDoc('jelly-soft')!);
    expect(log.at(-1)).toBe('state:disabled');
    expect(log).not.toContain('bind');
  });

  it('plays press → hold → release with a single owned timer, cancelled by destroy', () => {
    vi.useFakeTimers();
    const { deps, log } = fakes();
    const bridge = new JellyBridge(host, deps, coordinator());
    bridge.apply(presetDoc('jelly-soft')!);
    bridge.playBounce();
    expect(log.filter((l) => l.startsWith('pressed'))).toEqual(['pressed:true']);
    vi.advanceTimersByTime(449);
    expect(log).not.toContain('pressed:false');
    vi.advanceTimersByTime(2);
    expect(log).toContain('pressed:false');
    bridge.playBounce();
    bridge.destroy();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('releases everything on destroy, idempotently, and ignores later calls', () => {
    const { deps, log, surfaces, listeners } = fakes();
    const coord = coordinator();
    const destroyCoordinator = vi.spyOn(coord, 'destroy');
    const bridge = new JellyBridge(host, deps, coord);
    bridge.apply(presetDoc('jelly-soft')!);
    bridge.destroy();
    bridge.destroy();
    expect(log.filter((l) => l === 'destroy')).toHaveLength(1);
    expect(log.filter((l) => l === 'unbind')).toHaveLength(1);
    expect(listeners.size).toBe(0);
    expect(destroyCoordinator).not.toHaveBeenCalled(); // shared coordinator belongs to the caller
    expect(bridge.apply(presetDoc('jelly-soft')!)).toEqual({ ok: false, errors: ['bridge distrutto'] });
    expect(surfaces).toHaveLength(1);
  });

  it('survives React Strict Mode: mount, destroy, mount on a fresh bridge', () => {
    const { deps, log } = fakes();
    const a = new JellyBridge(host, deps, coordinator());
    a.apply(presetDoc('jelly-soft')!);
    a.destroy();
    const b = new JellyBridge(host, deps, coordinator());
    b.apply(presetDoc('jelly-soft')!);
    expect(log.filter((l) => l.startsWith('attach'))).toHaveLength(2);
    expect(log.filter((l) => l === 'destroy')).toHaveLength(1);
    b.destroy();
  });

  it('forwards status after renders and stops after unsubscribe', () => {
    const { deps, listeners } = fakes();
    const bridge = new JellyBridge(host, deps, coordinator());
    const seen: unknown[] = [];
    const off = bridge.onStatus((s) => seen.push(s?.backend));
    bridge.apply(presetDoc('jelly-soft')!);
    for (const l of listeners) l({ backend: 'css' } as never);
    expect(seen).toEqual(['svg', 'css']);
    off();
    for (const l of listeners) l({ backend: 'svg' } as never);
    expect(seen).toHaveLength(2);
  });
});

describe('Jelly preview model', () => {
  it('simulates reduced motion with the static profile and never mutates the saved document', () => {
    const doc = presetDoc('jelly-soft')!;
    const eff = effectiveDoc(doc, { ...DEFAULT_ENV, reducedMotion: true });
    expect(eff.quality.profile).toBe('static');
    expect(doc.quality.profile).toBe('auto');
    expect(effectiveDoc(doc, DEFAULT_ENV)).toBe(doc);
  });

  it('maps the environment onto the renderer options that exist', () => {
    expect(renderOptions(DEFAULT_ENV)).toEqual({});
    expect(renderOptions({ reducedMotion: false, svgUnavailable: true, opaque: true, reducedTransparency: true })).toEqual({ svgAvailable: false, opaque: true, reducedTransparency: true });
  });

  it('maps states to flags and sizes to the Button heights', () => {
    expect(stateFlags('pressed')).toEqual({ hover: false, pressed: true, active: false, disabled: false });
    expect(stateFlags('live')).toEqual({ hover: false, pressed: false, active: false, disabled: false });
    expect(previewSizePx('sm').height).toBe(36);
    expect(previewSizePx('md').height).toBe(44);
    expect(previewSizePx('lg').height).toBe(52);
  });
});
