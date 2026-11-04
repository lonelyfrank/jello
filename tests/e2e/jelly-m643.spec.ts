import { test, expect, type Page } from '@playwright/test';

/** M6.4.3 browser checks on the private comparison fixture (real ExperimentalJellySurface, injected clock). */
test.beforeEach(async ({ page }) => {
  await page.goto('/tests/fixtures/jelly-m643/');
  await page.waitForFunction(() => !!window.m643);
});

type Cell = { variant: string; id?: string; state?: string; w?: number; h?: number; bg?: string; mutate?: string };
const mount = (page: Page, cells: Cell[]) => page.evaluate((cells) => {
  const api = window.m643;
  return api.mount(cells.map((c) => {
    const v = api.variants.VARIANTS[c.variant]!((c.id ?? 'jelly-clear') as never);
    return { doc: v.doc, options: v.options, w: c.w ?? 160, h: c.h ?? 44, bg: (c.bg ?? 'light') as never, state: (c.state ?? 'idle') as never };
  }), 4).length;
}, cells);
const nodes = (page: Page) => page.evaluate(() => document.querySelectorAll('.jelly-decoration *').length);
const bubbles = (page: Page) => page.evaluate(() => [...document.querySelectorAll('.cell')].map((cell) => [...cell.querySelectorAll('[data-bubble-index]')].map((b) => [b.getAttribute('data-bubble-index'), b.getAttribute('transform'), b.children.length])));

test('legacy treatment keeps its DOM; m643 keeps identity and position of every inclusion', async ({ page }) => {
  await mount(page, [{ variant: 'X0' }, { variant: 'X5' }]);
  const [legacy, refined] = (await bubbles(page)) as [string, string, number][][];
  expect(legacy!.length).toBeGreaterThan(0);
  expect(legacy!.every((b) => b[2] === 2)).toBe(true);        // circle + highlight ellipse, as in M6.4.2
  expect(refined!.every((b) => b[2] === 3)).toBe(true);       // circle + rim + crescent
  expect(refined!.map((b) => [b[0], b[1]])).toEqual(legacy!.map((b) => [b[0], b[1]]));
});

test('node count is constant through press, hold, release, rebound and rest, in both treatments', async ({ page }) => {
  for (const variant of ['A', 'B3']) {
    const counts: number[] = [];
    for (const state of ['idle', 'press', 'hold', 'release', 'rebound', 'rest']) {
      await mount(page, [{ variant, id: 'jelly-candy', state }]);
      counts.push(await nodes(page));
    }
    expect(new Set(counts).size, `${variant}: ${counts}`).toBe(1);
  }
});

test('the surface goes back to the exact rest geometry after the rebound', async ({ page }) => {
  for (const variant of ['A', 'B3']) {
    const d = async (state: string) => { await mount(page, [{ variant, id: 'jelly-candy', state }]); return page.evaluate(() => document.querySelector('.jelly-decoration clipPath path')!.getAttribute('d')); };
    expect(await d('rest')).toBe(await d('idle'));
    expect(await d('hold')).not.toBe(await d('idle'));
  }
});

test('treatment switch rebuilds inclusions without growth, leaks or duplicate ids; an invalid treatment is rejected atomically', async ({ page }) => {
  await mount(page, [{ variant: 'A', id: 'jelly-soft', w: 320, h: 96 }]);
  const result = await page.evaluate(() => {
    const m = window.m643.mounted[0]!;
    const base = m.surface['doc'] as never;
    const count = () => document.querySelectorAll('.jelly-decoration *').length;
    const sizes: number[] = [];
    for (let i = 0; i < 20; i++) { m.surface.update(base, { treatment: i % 2 ? 'm642' : 'm643' }); sizes.push(count()); }
    const final = { m642: sizes.filter((_, i) => i % 2).at(-1), m643: sizes.filter((_, i) => !(i % 2)).at(-1) };
    const stable = new Set(sizes.filter((_, i) => i % 2)).size === 1 && new Set(sizes.filter((_, i) => !(i % 2))).size === 1;
    const ids = [...document.querySelectorAll('.jelly-decoration [id]')].map((e) => e.id);
    let threw = false;
    const before = m.host.querySelector('.jelly-decoration')!.innerHTML;
    try { m.surface.update(base, { treatment: 'bogus' as never }); } catch { threw = true; }
    return { stable, final, uniqueIds: new Set(ids).size === ids.length, threw, unchanged: m.host.querySelector('.jelly-decoration')!.innerHTML === before };
  });
  expect(result).toMatchObject({ stable: true, uniqueIds: true, threw: true, unchanged: true });
  expect(result.final.m643).toBeGreaterThan(result.final.m642!);
});

test('the scheduler runs only while the surface moves; no RAF at rest; destroy releases every node', async ({ page }) => {
  await mount(page, [{ variant: 'B3', id: 'jelly-candy', state: 'press' }, { variant: 'B3', id: 'jelly-candy', state: 'rest' }, { variant: 'B3', id: 'jelly-dense', state: 'rest' }, { variant: 'B3', id: 'jelly-clear', state: 'idle' }]);
  const status = await page.evaluate(() => window.m643.mounted.map((m) => m.clock.status));
  expect(status[0]).toMatchObject({ active: 1, pending: true });          // pressed and still moving
  for (const i of [1, 2, 3]) expect(status[i], `cell ${i}`).toMatchObject({ active: 0, pending: false });
  const left = await page.evaluate(() => { window.m643.destroyAll(); return { decorations: document.querySelectorAll('.jelly-decoration').length, classes: document.querySelectorAll('.jelly-surface').length }; });
  expect(left).toEqual({ decorations: 0, classes: 0 });
});

test('reduced motion: static profile, geometry identical to rest, treatment unchanged', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1200, height: 800 } });
  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:4178/tests/fixtures/jelly-m643/');
  await page.waitForFunction(() => !!window.m643);
  const d = async (state: string) => { await mount(page, [{ variant: 'B3', id: 'jelly-candy', state }]); return page.evaluate(() => ({ path: document.querySelector('.jelly-decoration clipPath path')!.getAttribute('d'), motion: window.m643.mounted[0]!.surface.status.motion, reduced: window.m643.mounted[0]!.surface.status.motionReduced, nodes: document.querySelectorAll('.jelly-decoration *').length })); };
  const idle = await d('idle'), hold = await d('hold'), rest = await d('rest');
  expect([idle.motion, idle.reduced]).toEqual(['static', true]);
  expect(hold.path).toBe(idle.path);
  expect(rest.path).toBe(idle.path);
  expect(hold.nodes).toBe(idle.nodes);
  await ctx.close();
});

test('quality profiles keep identity and prefix of inclusions under the refined treatment', async ({ page }) => {
  const r = await page.evaluate(() => {
    const api = window.m643;
    const out: Record<string, { idx: string[]; pos: string[] }> = {};
    for (const profile of ['low', 'medium', 'high']) {
      const v = api.variants.VARIANTS.B1!('jelly-candy');
      const doc = structuredClone(v.doc); doc.quality.profile = profile as never; doc.bubbles.density = 20;
      api.mount([{ doc, options: v.options, w: 320, h: 96, bg: 'light', state: 'idle' }], 1);
      const nodes = [...document.querySelectorAll('[data-bubble-index]')];
      out[profile] = { idx: nodes.map((n) => n.getAttribute('data-bubble-index')!), pos: nodes.map((n) => n.getAttribute('transform')!) };
    }
    return out;
  });
  expect(r.low!.idx).toHaveLength(4);
  expect(r.medium!.idx).toHaveLength(12);
  expect(r.high!.idx).toHaveLength(24);
  expect(r.medium!.pos.slice(0, 4)).toEqual(r.low!.pos);
  expect(r.high!.pos.slice(0, 12)).toEqual(r.medium!.pos);
});

test('CSS fallback and opaque fallback are unaffected by the treatment (no inclusions, same body)', async ({ page }) => {
  const r = await page.evaluate(() => {
    const api = window.m643, out: Record<string, { n: number; backend: string }> = {};
    for (const [name, mutate] of [['css', (d: any) => { d.target.backend = 'css'; }], ['opaque', (d: any) => { d.target.fallback = 'opaque'; }]] as const) {
      const v = api.variants.VARIANTS.B1!('jelly-clear'); const doc = structuredClone(v.doc); mutate(doc);
      api.mount([{ doc, options: v.options, w: 160, h: 44, bg: 'light', state: 'idle' }], 1);
      out[name] = { n: document.querySelectorAll('[data-bubble-index]').length, backend: window.m643.mounted[0]!.surface.status.backend };
    }
    return out;
  });
  expect(r).toEqual({ css: { n: 0, backend: 'css' }, opaque: { n: 0, backend: 'css' } });
});
