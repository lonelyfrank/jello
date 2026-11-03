/** Shared helpers for the M6.4.3 tools: dev server on 4178 (npm run dev -- --host 127.0.0.1 --port 4178). */
import { createHash } from 'node:crypto';
import { chromium, firefox } from '@playwright/test';

export const BASE = process.env.BASE ?? 'http://127.0.0.1:4178/tests/fixtures/jelly-m643/';
export const PRESETS = ['jelly-soft', 'jelly-clear', 'jelly-candy', 'jelly-dense'];
export const STATES = ['idle', 'hover', 'press', 'hold', 'release', 'rebound', 'rest', 'disabled'];
export const SIZES = { '80x32': [80, 32], '160x44': [160, 44], '320x96': [320, 96] };
export const BGS = ['light', 'dark', 'gradient', 'text', 'structured'];
export const PAD = 28;
export const sha = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 16);
export const ENGINES = { chromium, firefox };

export async function openPage(browser, dpr = 1) {
  const ctx = await browser.newContext({ viewport: { width: 1800, height: 1400 }, deviceScaleFactor: dpr, reducedMotion: 'no-preference' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => { if (e.type() === 'error') errors.push(e.text()); });
  await page.goto(BASE);
  await page.waitForFunction(() => !!window.m643);
  return { ctx, page, errors };
}

/** Builds cell specs page-side so that docs never cross the Node boundary. rows = presets, columns = states. */
export async function sheet(page, { variant, size, bg, states = STATES, presets = PRESETS, hideContent = false, bubblesOff = false, contact }) {
  const [w, h] = SIZES[size];
  await page.evaluate(({ variant, w, h, bg, states, presets, hideContent, bubblesOff, contact }) => {
    const v = window.m643.variants.VARIANTS[variant];
    const cells = [];
    for (const id of presets) for (const state of states) { const { doc, options } = v(id); if (bubblesOff) doc.bubbles.enabled = 'disabled'; cells.push({ label: hideContent ? '' : `${id.slice(6)} ${state}`, doc, options, w, h, bg, state, hideContent, contact }); }
    window.m643.mount(cells, states.length);
  }, { variant, w, h, bg, states, presets, hideContent, bubblesOff, contact });
  await page.evaluate(() => document.fonts.ready);
  return page.locator('#stage');
}
