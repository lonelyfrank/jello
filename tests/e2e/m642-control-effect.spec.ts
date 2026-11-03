/**
 * M6.4.2 §4.4 / §6.1: no inert slider. Every operative control of the Material Lab changes what the renderer draws,
 * and its own reset button brings the drawing back. Driven through the Inspector (the real controls), checked on
 * pixels of the Stage — not on React state.
 *
 *   static parameters  → the Stage raster changes, and returns to the baseline after «Ripristina»
 *   motion parameters  → the quantity they drive changes while pressed (scale, light variable, lens strength, spring)
 *   Solid timing       → the computed CSS transition of the Solid surface
 */
import { expect, test, type Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { PARAMS, type ParamDescriptor } from '../../src/core/params';
import { SOLID_PARAMS } from '../../src/model/solid';
import { settle } from './helpers';

test.skip(({ isMobile }) => isMobile, 'the Inspector is a drawer on phones; the control → render chain is the same code, checked once on desktop engines');

/** A parameter whose control is shared by every family (the inspector draws all of them from the descriptors). */
type Desc = Pick<ParamDescriptor, 'type' | 'affects' | 'label' | 'default'> & { key: string; min?: number; max?: number; options?: readonly string[] };

const MIN_CHANGED_PIXELS = 100; // a visible change, far above anti-aliasing noise
const MAX_RESIDUE_PIXELS = 10; // after reset the Stage must be the baseline again
/**
 * A pixel counts as changed above this per-channel delta (of 255). Re-creating an element re-rasterises its text with different
 * sub-pixel anti-aliasing: measured on the Solid button, max delta 7, mean 1.4, ~100 px. A real change is far above it.
 */
const NOISE = 12;

async function open(page: Page, query: string) {
  await page.goto(`./?${query}&scene=grid&animate=0`);
  await page.waitForSelector('html[data-ready=true]');
  await page.addStyleTag({ content: '.stage-label{visibility:hidden!important}' });
  await page.evaluate(() => document.querySelectorAll('details').forEach((d) => (d.open = true)));
  await settle(page);
}
const stage = async (page: Page) => {
  await page.waitForTimeout(300);
  return PNG.sync.read(await page.locator('#stageMain').screenshot());
};
function changed(a: PNG, b: PNG, noise = NOISE): number {
  expect([a.width, a.height]).toEqual([b.width, b.height]);
  let n = 0;
  for (let i = 0; i < a.data.length; i += 4) if (Math.max(Math.abs(a.data[i]! - b.data[i]!), Math.abs(a.data[i + 1]! - b.data[i + 1]!), Math.abs(a.data[i + 2]! - b.data[i + 2]!)) > noise) n++;
  return n;
}
/** The value far from the default (numbers) or the first other option (enums). */
const target = (d: Desc): number | string => (d.type === 'number' ? (d.default as number) - d.min! < d.max! - (d.default as number) ? d.max! : d.min! : d.type === 'enum' ? d.options!.find((o) => o !== d.default)! : '#ff0000');

async function drive(page: Page, d: Desc) {
  const to = target(d);
  if (d.type === 'number') await page.locator(`#num-${d.key}`).fill(String(to));
  else if (d.type === 'enum') await page.locator(`#param-${d.key}`).selectOption(String(to));
  else await page.evaluate(([key, v]) => (window as unknown as { __jello: { setMaterialControl(t: unknown, v: unknown): void } }).__jello.setMaterialControl({ key }, v), [d.key, to]);
}

const sheenOf = (p: Page) => p.locator('#stageMain .jello-solid-host').first().evaluate((el) => (el as HTMLElement).style.getPropertyValue('--jsolid-sheen'));
const staticOf = (list: readonly Desc[]) => list.filter((d) => d.affects !== 'motion');

for (const family of [
  { id: 'glass', query: 'preset=jello', params: PARAMS as readonly Desc[] },
  { id: 'solid', query: 'material=solid-neutral', params: SOLID_PARAMS as readonly Desc[] },
]) {
  test.describe(`${family.id}: every static control changes the Stage and its reset restores it`, () => {
    for (const d of staticOf(family.params)) {
      test(`${d.key}`, async ({ page }) => {
        // «soft» lays 12 % white over the fill: on the neutral light fill that is under 2/255 per channel (measured) — faint by design, so
        // the control is exercised on a dark fill where it can be seen. Which is itself a finding (docs/m642/material-quality.md).
        await open(page, d.key === 'finish' ? 'material=solid-dark' : family.query);
        // `radius` only applies to a rounded rectangle: with a capsule the control is disabled and says why (that is its contract).
        if (d.key === 'radius' && family.id === 'glass') {
          await expect(page.locator('#param-radius')).toBeDisabled();
          await expect(page.locator('#note-radius')).not.toBeEmpty();
          await page.locator('#param-shape').selectOption('rounded');
          await settle(page);
          await expect(page.locator('#param-radius')).toBeEnabled();
        }
        // A faint contributor is first made prominent, so that "no visible effect" cannot hide behind a low-opacity shadow.
        if (d.key === 'shadowColor') {
          await page.locator('#num-elevation').fill('5');
          await page.locator('#num-shadowOpacity').fill('1');
          await settle(page);
        }
        const base = await stage(page);
        await drive(page, d);
        await settle(page);
        const moved = await stage(page);
        if (d.key === 'finish') expect(await sheenOf(page), 'soft lays a gradient over the fill').toContain('linear-gradient');
        expect(changed(base, moved), `${d.key} must change the drawing`).toBeGreaterThan(MIN_CHANGED_PIXELS);
        // Scoped to the field: several controls share a label («Colore»).
        await page.locator(`[data-param-field="${d.key}"] .control-reset`).click();
        await settle(page);
        const back = await stage(page);
        expect(changed(base, back), `reset of ${d.key} must restore the drawing`).toBeLessThanOrEqual(MAX_RESIDUE_PIXELS);
      });
    }
  });
}

test.describe('glass: motion controls drive the quantity they name', () => {
  const surface = (page: Page) => page.locator('#capsuleMain .jello-surface');
  const scaleX = async (page: Page) => surface(page).evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a);
  async function press(page: Page) {
    const box = (await surface(page).boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    return box;
  }

  test('pressScale: the held capsule is scaled by exactly that factor', async ({ page }) => {
    for (const [value, expected] of [['1.15', 1.15], ['1', 1]] as const) {
      await open(page, 'preset=jello');
      await page.locator('#num-pressScale').fill(value);
      await press(page);
      await page.waitForTimeout(700);
      expect(await scaleX(page)).toBeCloseTo(expected, 2);
      await page.mouse.up();
    }
  });

  test('pressLight: the contact light reaches the surface as --jello-press-light', async ({ page }) => {
    await open(page, 'preset=jello');
    await page.locator('#num-pressLight').fill('0.9');
    await settle(page);
    expect(await surface(page).evaluate((el) => getComputedStyle(el).getPropertyValue('--jello-press-light'))).toBe('0.9');
    await page.getByRole('button', { name: 'Ripristina Luce alla pressione', exact: true }).click();
    expect(await surface(page).evaluate((el) => getComputedStyle(el).getPropertyValue('--jello-press-light'))).toBe('0.35');
  });

  test('pressRefraction: the lens strengthens by (1 + value) while pressed', async ({ page }) => {
    const displacement = (p: Page) =>
      p.evaluate(() => {
        const id = (window as unknown as { __jello: { filterId(): string } }).__jello.filterId();
        return Number(document.getElementById(id)!.querySelector('feDisplacementMap')!.getAttribute('scale'));
      });
    for (const [value, factor] of [['1', 2], ['0', 1]] as const) {
      await open(page, 'preset=jello');
      await page.locator('#num-pressRefraction').fill(value);
      await settle(page);
      const rest = await displacement(page);
      await press(page);
      await page.waitForTimeout(700);
      const held = await displacement(page);
      expect(held / rest, `pressRefraction=${value}`).toBeCloseTo(factor, 1);
      await page.mouse.up();
    }
  });

  test('stiffness: a stiff spring is further along 60 ms after the press than a soft one', async ({ page }) => {
    const progress = async (stiffness: string) => {
      await open(page, 'preset=jello');
      await page.locator('#num-pressScale').fill('1.15');
      await page.locator('#num-stiffness').fill(stiffness);
      await press(page);
      await page.waitForTimeout(60);
      const s = (await scaleX(page)) - 1;
      await page.mouse.up();
      return s;
    };
    const soft = await progress('40');
    const stiff = await progress('1200');
    expect(stiff).toBeGreaterThan(soft * 2);
  });
});

test.describe('solid: timing controls drive the computed transition of the surface', () => {
  test('duration and easing', async ({ page }) => {
    await open(page, 'material=solid-neutral');
    const host = page.locator('#stageMain .jello-solid-host').first();
    const timing = () => host.evaluate((el) => ({ d: getComputedStyle(el).transitionDuration, e: getComputedStyle(el).transitionTimingFunction }));
    expect((await timing()).d).toBe('0.14s');
    await page.locator('#num-duration').fill('600');
    await page.locator('#param-easing').selectOption('emphasized');
    await settle(page);
    const after = await timing();
    expect(after.d).toBe('0.6s');
    expect(after.e).toBe('cubic-bezier(0.05, 0.7, 0.1, 1)');
    await page.getByRole('button', { name: 'Ripristina Durata', exact: true }).click();
    await page.getByRole('button', { name: 'Ripristina Andamento', exact: true }).click();
    await settle(page);
    expect(await timing()).toEqual({ d: '0.14s', e: 'cubic-bezier(0.2, 0, 0, 1)' });
  });
});
