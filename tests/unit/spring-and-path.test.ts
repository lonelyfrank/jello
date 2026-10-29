import { describe, expect, it } from 'vitest';
import { isSettled, spring, stepSpring } from '../../src/core/spring';
import {
  findVerification,
  parseEngine,
  resolvePath,
  type Capabilities,
  type Preferences,
} from '../../src/core/renderer/capabilities';

describe('spring', () => {
  it('converges to the target and settles', () => {
    const s = spring(0);
    s.target = 100;
    for (let i = 0; i < 120; i++) stepSpring(s, 1 / 60, { stiffness: 420, damping: 0.68 });
    expect(isSettled(s, 0.05)).toBe(true);
    expect(s.value).toBeCloseTo(100, 1);
  });

  it('is independent of the frame rate', () => {
    const a = spring(0);
    const b = spring(0);
    a.target = b.target = 50;
    for (let i = 0; i < 30; i++) stepSpring(a, 1 / 60, { stiffness: 300, damping: 0.5 });
    for (let i = 0; i < 60; i++) stepSpring(b, 1 / 120, { stiffness: 300, damping: 0.5 });
    expect(a.value).toBeCloseTo(b.value, 3);
  });

  it('overshoots when under-damped and not when critically damped', () => {
    const run = (damping: number) => {
      const s = spring(0);
      s.target = 1;
      let max = 0;
      for (let i = 0; i < 240; i++) {
        stepSpring(s, 1 / 60, { stiffness: 400, damping });
        max = Math.max(max, s.value);
      }
      return max;
    };
    expect(run(0.3)).toBeGreaterThan(1.2);
    expect(run(1)).toBeLessThanOrEqual(1.0001);
  });

  it('jumps instead of simulating long gaps', () => {
    const s = spring(0);
    s.target = 10;
    stepSpring(s, 5, { stiffness: 400, damping: 0.7 });
    expect(s.value).toBe(10);
    expect(s.velocity).toBe(0);
  });
});

const all: Capabilities = { svgFilter: true, backdropFilter: true };
const none: Preferences = {
  reducedTransparency: false,
  contrastMore: false,
  forcedColors: false,
  manualReduceTransparency: false,
};
const opts = { requireVerified: false, verified: false };

describe('render path', () => {
  it('auto picks refraction when the SVG filter is detected', () => {
    expect(resolvePath('auto', all, none, opts).effective).toBe('refraction');
  });

  it('falls back to satin, then opaque, and says why', () => {
    const satin = resolvePath('auto', { svgFilter: false, backdropFilter: true }, none, opts);
    expect(satin.effective).toBe('satin');
    expect(satin.reasons.join()).toMatch(/SVG/);
    const opaque = resolvePath('auto', { svgFilter: false, backdropFilter: false }, none, opts);
    expect(opaque.effective).toBe('opaque');
  });

  it('accessibility preferences force the opaque path', () => {
    for (const k of Object.keys(none) as (keyof Preferences)[]) {
      expect(resolvePath('refraction', all, { ...none, [k]: true }, opts).effective).toBe('opaque');
    }
  });

  it('requireVerified keeps unverified engines on satin', () => {
    expect(resolvePath('auto', all, none, { requireVerified: true, verified: false }).effective).toBe('satin');
    expect(resolvePath('auto', all, none, { requireVerified: true, verified: true }).effective).toBe('refraction');
  });
});

describe('engine parsing and verification lookup', () => {
  const desktop =
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/148.0.0.0 Safari/537.36';
  const android =
    'Mozilla/5.0 (Linux; Android 15; Pixel 7 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36';
  const webview =
    'Mozilla/5.0 (Linux; Android 15; Pixel 7 Pro; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/148.0.0.0 Mobile Safari/537.36';
  const firefox = 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0';
  const safari =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15';

  it('recognizes engines', () => {
    expect(parseEngine(desktop)).toMatchObject({ engine: 'chromium', major: 148, android: false });
    expect(parseEngine(android)).toMatchObject({ engine: 'chromium', android: true, webview: false });
    expect(parseEngine(webview)).toMatchObject({ engine: 'chromium', android: true, webview: true });
    expect(parseEngine(firefox)).toMatchObject({ engine: 'firefox', major: 140 });
    expect(parseEngine(safari)).toMatchObject({ engine: 'webkit', major: 26 });
  });

  it('never treats a desktop record as proof for Android or WebView', () => {
    const records = [
      { engine: 'chromium' as const, major: 148, environment: 'x', mobileEmulated: true, date: 'd', checks: [] },
    ];
    expect(findVerification(parseEngine(desktop), records)).not.toBeNull();
    expect(findVerification(parseEngine(android), records)).toBeNull();
    expect(findVerification(parseEngine(webview), records)).toBeNull();
  });
});
