import { expect, type Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { sdRoundedRect } from '../../src/core/geometry';
import type { GlassParams } from '../../src/core/params';
import type { ContextStatus } from '../../src/core/context';
import type { FilterStats } from '../../src/core/renderer/source-filter';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Shape of the inspection hook exposed by the lab (src/lab/main.ts). */
export interface LabHook {
  params: GlassParams;
  setParams(patch: Partial<GlassParams>): void;
  setOption(key: string, value: unknown): void;
  stats(): FilterStats & { surfaces: number; animating: number };
  compareStats(): (FilterStats & { surfaces: number; animating: number }) | null;
  status(): ContextStatus;
  capsule: {
    position: { x: number; y: number };
    rect: Rect;
    frames: number;
    animating: boolean;
    pressed: boolean;
    setPosition(x: number, y: number, immediate?: boolean): void;
  };
  componentRects(): Rect[];
  filterId(): string;
}

declare global {
  interface Window {
    __jello: unknown;
  }
}

export const OPTICS = 'preset=optics&scene=grid&animate=0';

export async function openLab(page: Page, query = OPTICS) {
  await page.goto(`./?${query}`);
  await page.waitForSelector('html[data-ready=true]');
  // Raster captures must not include labels that change with the path.
  await page.addStyleTag({ content: '.stage-label{visibility:hidden!important}' });
  await settle(page);
}

/** Waits for pending rAF work (measure, springs) and two paints. */
export async function settle(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const hook = window.__jello as { stats(): { animating: number } };
        const start = performance.now();
        const wait = () => {
          if (hook.stats().animating === 0 || performance.now() - start > 3000) {
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
          } else requestAnimationFrame(wait);
        };
        wait();
      }),
  );
  // Image decoding (feImage data URL, photos) can land after the frame.
  await page.waitForTimeout(150);
}

/** Runs `body` with `h` bound to the lab hook (see LabHook). */
export async function lab<T>(page: Page, body: string): Promise<T> {
  return page.evaluate(`(async (h) => { ${body} })(window.__jello)`) as Promise<T>;
}

/** On narrow layouts the panel is collapsed behind a toggle. */
export async function showPanel(page: Page) {
  const toggle = page.locator('#panelToggle');
  if ((await toggle.isVisible()) && (await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
}

/**
 * Presses at `from` and moves through `steps` offsets; returns `release`.
 * Touch contexts use real touch events through CDP (Chromium only); others
 * use the mouse.
 */
export async function drag(page: Page, from: { x: number; y: number }, steps: { x: number; y: number }[]) {
  const touch = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
  if (touch) {
    const cdp = await page.context().newCDPSession(page);
    const point = (p: { x: number; y: number }) => [{ x: p.x, y: p.y, id: 1, radiusX: 4, radiusY: 4, force: 1 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(from) });
    for (const s of steps) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point({ x: from.x + s.x, y: from.y + s.y }) });
    }
    return async () => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };
  }
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (const s of steps) await page.mouse.move(from.x + s.x, from.y + s.y);
  return () => page.mouse.up();
}

export async function setPath(page: Page, path: 'auto' | 'refraction' | 'satin' | 'opaque') {
  await lab(page, `h.setOption('path', '${path}')`);
  await settle(page);
}

export interface Capture {
  png: PNG;
  dpr: number;
  /** Capsule rect relative to the captured stage, CSS px. */
  capsule: Rect;
  stage: Rect;
}

export async function captureStage(page: Page, selector = '#stageMain'): Promise<Capture> {
  const info = await page.evaluate((sel) => {
    const stage = document.querySelector(sel)!.getBoundingClientRect();
    const capsule = document.querySelector(`${sel} .capsule`)!.getBoundingClientRect();
    return {
      dpr: devicePixelRatio,
      stage: { x: stage.x, y: stage.y, width: stage.width, height: stage.height },
      capsule: { x: capsule.x - stage.x, y: capsule.y - stage.y, width: capsule.width, height: capsule.height },
    };
  }, selector);
  const buf = await page.locator(selector).screenshot({ animations: 'disabled', caret: 'hide' });
  return { png: PNG.sync.read(buf), ...info };
}

export type Region = 'rim' | 'centre' | 'outside' | 'top' | 'bottom' | 'left' | 'right';

/**
 * Mean absolute RGB difference between two captures over a region of the
 * capsule, classified with the same signed distance the renderer uses.
 */
export function regionDiff(a: Capture, b: Capture, region: Region, band: number): number {
  const { png: pa, dpr } = a;
  const pb = b.png;
  expect(pa.width).toBe(pb.width);
  const c = a.capsule;
  const hw = c.width / 2;
  const hh = c.height / 2;
  const r = Math.min(hw, hh);
  let sum = 0;
  let n = 0;
  const margin = 24;
  const x0 = Math.max(0, Math.floor((c.x - margin) * dpr));
  const x1 = Math.min(pa.width, Math.ceil((c.x + c.width + margin) * dpr));
  const y0 = Math.max(0, Math.floor((c.y - margin) * dpr));
  const y1 = Math.min(pa.height, Math.ceil((c.y + c.height + margin) * dpr));
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      const lx = (px + 0.5) / dpr - c.x - hw;
      const ly = (py + 0.5) / dpr - c.y - hh;
      const sd = sdRoundedRect(lx, ly, hw, hh, r);
      const depth = -sd;
      let inRegion = false;
      const inRim = depth > 1.5 && depth < band - 2;
      switch (region) {
        case 'rim':
          inRegion = inRim;
          break;
        case 'centre':
          inRegion = depth > band + 3;
          break;
        case 'outside':
          inRegion = sd > 3;
          break;
        case 'top':
          inRegion = inRim && ly < -hh + band && Math.abs(lx) < hw - r;
          break;
        case 'bottom':
          inRegion = inRim && ly > hh - band && Math.abs(lx) < hw - r;
          break;
        case 'left':
          inRegion = inRim && lx < -hw + r * 0.6;
          break;
        case 'right':
          inRegion = inRim && lx > hw - r * 0.6;
          break;
      }
      if (!inRegion) continue;
      const i = (py * pa.width + px) * 4;
      sum +=
        (Math.abs(pa.data[i]! - pb.data[i]!) +
          Math.abs(pa.data[i + 1]! - pb.data[i + 1]!) +
          Math.abs(pa.data[i + 2]! - pb.data[i + 2]!)) /
        3;
      n++;
    }
  }
  return n ? sum / n : 0;
}

/**
 * Bounding box (CSS px, stage coordinates) of pixels that differ by more than
 * `threshold`. Isolated pixels and the stage frame (see `ignored`) are skipped.
 */
export function diffBox(a: Capture, b: Capture, threshold = 24): Rect | null {
  const { png: pa, dpr } = a;
  const pb = b.png;
  const W = pa.width;
  const H = pa.height;
  const mask = new Uint8Array(W * H);
  for (let p = 0; p < W * H; p++) {
    const i = p * 4;
    const d = Math.max(
      Math.abs(pa.data[i]! - pb.data[i]!),
      Math.abs(pa.data[i + 1]! - pb.data[i + 1]!),
      Math.abs(pa.data[i + 2]! - pb.data[i + 2]!),
    );
    mask[p] = d > threshold ? 1 : 0;
  }
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!mask[y * W + x]) continue;
      if (ignored(x, y, W, H, dpr)) continue;
      let neighbours = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if ((dx || dy) && nx >= 0 && ny >= 0 && nx < W && ny < H) neighbours += mask[ny * W + nx]!;
        }
      }
      if (!neighbours) continue;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return null;
  return { x: x0 / dpr, y: y0 / dpr, width: (x1 + 1 - x0) / dpr, height: (y1 + 1 - y0) / dpr };
}

/**
 * Pixels excluded from whole-stage comparisons: a 3 px frame and the 24 px
 * corners. Once the source becomes its own filtered layer, engines blend the
 * device pixels where it meets the stage's rounded clip and 1 px border
 * differently (one or two pixels in Chromium/Firefox at DPR 1, a full device
 * row at the emulated DPR 2.625). The lens itself is far from this frame.
 */
function ignored(x: number, y: number, W: number, H: number, dpr: number): boolean {
  const edge = Math.ceil(3 * dpr);
  const corner = 24 * dpr;
  if (x < edge || y < edge || x >= W - edge || y >= H - edge) return true;
  return (x < corner || x >= W - corner) && (y < corner || y >= H - corner);
}

/** Mean difference over the stage, frame excluded. */
export function meanDiff(a: Capture, b: Capture): number {
  const W = a.png.width;
  const H = a.png.height;
  const pa = a.png.data;
  const pb = b.png.data;
  let sum = 0;
  let n = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (ignored(x, y, W, H, a.dpr)) continue;
      const i = (y * W + x) * 4;
      sum += (Math.abs(pa[i]! - pb[i]!) + Math.abs(pa[i + 1]! - pb[i + 1]!) + Math.abs(pa[i + 2]! - pb[i + 2]!)) / 3;
      n++;
    }
  }
  return n ? sum / n : 0;
}

/** Tolerance covers sub-pixel lens positions, which engines snap to device pixels. */
export function expectInside(box: Rect, outer: Rect, tolerance = 2) {
  expect(box.x).toBeGreaterThanOrEqual(outer.x - tolerance);
  expect(box.y).toBeGreaterThanOrEqual(outer.y - tolerance);
  expect(box.x + box.width).toBeLessThanOrEqual(outer.x + outer.width + tolerance);
  expect(box.y + box.height).toBeLessThanOrEqual(outer.y + outer.height + tolerance);
}
