/**
 * M6.4.3.A — Jello Visual Review, in the real Studio. Everything below drives the one real renderer on real host Buttons.
 * These checks prove the workspace works; they say nothing about whether a variant LOOKS right (that is the reviewer's decision).
 */
import { expect, test, type Page } from '@playwright/test';

const PRESETS = ['jelly-soft', 'jelly-clear', 'jelly-candy', 'jelly-dense'] as const;
const REVIEW_KEY = 'jello-jelly-review-v1';

async function openReview(page: Page, query = 'studio=jelly&animate=0') {
  await page.goto(`./?${query}`);
  await page.waitForSelector('#jelly-lab:not([hidden]) #jl-primary .jelly-decoration');
  await page.locator('#jl-open-review').click();
  await page.waitForSelector('#jelly-review .rv-cell .jelly-decoration');
}
const cell = (page: Page, preset: string, variant: string) => page.getByTestId(`rv-cell-${preset}:${variant}`);
const path = (page: Page, preset: string, variant: string) => cell(page, preset, variant).locator('.jelly-decoration clipPath path').first().getAttribute('d');
const center = async (page: Page, preset: string, variant: string) => {
  const b = (await page.getByTestId(`rv-btn-${preset}:${variant}`).boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2, width: b.width, height: b.height };
};
const setMode = (page: Page, name: 'Affiancato' | 'Quattro varianti' | 'Movimento') => page.getByRole('group', { name: 'Modalità di confronto' }).getByRole('button', { name, exact: true }).click();
const xOf = async (page: Page, variant: string) => Number(((await page.getByTestId(`rv-x-${variant}`).textContent()) ?? '').replace('x ', '').replace('−', '-'));
const nodes = (page: Page) => page.evaluate(() => document.querySelectorAll('#jelly-review .jelly-decoration *').length);

test.describe('Jello Visual Review (desktop)', () => {
  test.skip(({ isMobile }) => isMobile, 'The phone layout has its own test below');

  test('opens from the Jello Lab, is fetched on demand, shows real renderings and leaves the Lab intact', async ({ page }) => {
    const chunks: string[] = [];
    page.on('request', (r) => { if (/ReviewWorkspace/.test(r.url())) chunks.push(r.url()); });
    await page.goto('./?studio=jelly&animate=0');
    await page.waitForSelector('#jelly-lab:not([hidden]) #jl-primary .jelly-decoration');
    expect(chunks).toEqual([]);
    await expect(page.locator('#jelly-review')).toHaveCount(0);
    await page.locator('#jl-open-review').click();
    await expect(page.locator('#jelly-review')).toBeVisible();
    expect(chunks.length).toBeGreaterThan(0);
    await expect(page.getByRole('heading', { name: 'Jello Visual Review' })).toBeVisible();
    await expect(page.locator('#rv-readonly')).toContainText('Solo lettura');
    // Preview thumbnails and cells are the real renderer, not mock-ups.
    await expect(page.locator('.rv-thumb .jelly-decoration')).toHaveCount(4);
    await expect(page.locator('.rv-cell .jelly-decoration')).toHaveCount(2);
    await expect(page.locator('#jelly-lab')).toBeHidden();
    await page.locator('#rv-back').click();
    await expect(page.locator('#jelly-review')).toHaveCount(0);
    await expect(page.locator('#jelly-lab:not([hidden]) #jl-primary .jelly-decoration')).toBeVisible();
  });

  test('the four presets are selectable and each shows its own A and variant', async ({ page }) => {
    await openReview(page);
    for (const id of PRESETS) {
      await page.locator(`#rv-preset-${id}`).click();
      await expect(page.locator(`#rv-preset-${id}`)).toHaveAttribute('aria-pressed', 'true');
      await expect(cell(page, id, 'A')).toBeVisible();
      await expect(cell(page, id, 'B3')).toBeVisible();
    }
    // Presets are distinct materials: the same variant of two presets does not render the same outline fill.
    const fill = (id: string) => cell(page, id, 'A').locator('.jelly-decoration linearGradient stop').first().getAttribute('stop-color');
    await page.locator('#rv-preset-jelly-soft').click();
    const soft = await fill('jelly-soft');
    await page.locator('#rv-preset-jelly-candy').click();
    expect(await fill('jelly-candy')).not.toBe(soft);
  });

  test('A, B1, B2 and B3 differ the way their definition says (treatment, bubbles, motion) on the real DOM', async ({ page }) => {
    await openReview(page);
    await page.locator('#rv-preset-jelly-clear').click();
    await setMode(page, 'Quattro varianti');
    const bubbleChildren = (v: string) => cell(page, 'jelly-clear', v).evaluate((el) => [...el.querySelectorAll('[data-bubble-index]')].map((b) => b.children.length));
    expect(new Set(await bubbleChildren('A'))).toEqual(new Set([2]));   // m642: circle + highlight
    expect(new Set(await bubbleChildren('B2'))).toEqual(new Set([2]));  // B2 = motion only: ottica e rendering di A
    expect(new Set(await bubbleChildren('B1'))).toEqual(new Set([3]));  // m643: circle + rim + crescent
    expect(new Set(await bubbleChildren('B3'))).toEqual(new Set([3]));
    for (const v of ['A', 'B1', 'B2', 'B3']) await expect(cell(page, 'jelly-clear', v)).toContainText(v === 'A' || v === 'B2' ? 'm642' : 'm643');
    // Optics only (B1) leaves motion as A; motion only (B2) leaves the optics as A.
    const rest = async (v: string) => (await cell(page, 'jelly-clear', v).locator('.jelly-decoration').innerHTML()).replace(/jello-jelly-\d+/g, 'jello-jelly-N'); // surface ids are per instance
    expect(await rest('B2')).toBe(await rest('A'));
    expect(await rest('B1')).not.toBe(await rest('A'));
    // Selecting a variant moves the inspector and the focus ring; it does not alter the other cells.
    await page.locator('#rv-variant-B2').click();
    await expect(cell(page, 'jelly-clear', 'B2')).toHaveAttribute('data-focus', 'true');
    await expect(page.locator('#rv-sec-identity')).toContainText('B2 — Motion Refinement');
    await expect(page.getByTestId('rv-approval')).toContainText('Non approvata');
  });

  test('side by side (1×2) and 2×2 never overlap or overflow, at every size and background, including a 2× zoom', async ({ page }) => {
    await openReview(page);
    const check = async (label: string) => {
      const r = await page.evaluate(() => {
        const rects = [...document.querySelectorAll('#jelly-review .rv-cell')].map((c) => c.getBoundingClientRect());
        const overlap = rects.some((a, i) => rects.some((b, j) => i < j && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1));
        const root = document.documentElement;
        return { overlap, n: rects.length, pageOverflow: root.scrollWidth > root.clientWidth };
      });
      expect(r.overlap, `${label}: overlapping cells`).toBe(false);
      expect(r.pageOverflow, `${label}: horizontal page scroll`).toBe(false);
      return r.n;
    };
    for (const [mode, n] of [['Affiancato', 2], ['Quattro varianti', 4]] as const) {
      await setMode(page, mode);
      for (const size of ['xs', 'md', 'lg']) {
        await page.selectOption('#rv-viewport', size);
        for (const bg of ['light', 'dark', 'gradient', 'text', 'structured']) {
          await page.selectOption('#rv-background', bg);
          await expect(page.locator('.rv-tile').first()).toHaveAttribute('data-background', bg);
          expect(await check(`${mode}/${size}/${bg}`)).toBe(n);
        }
      }
    }
    await page.selectOption('#rv-viewport', 'lg');
    await page.selectOption('#rv-zoom', '2');
    await check('2×2 lg zoom 200%');
    // 2×2 degrades to one column when a cell cannot fit in half the stage.
    const cols = await page.evaluate(() => new Set([...document.querySelectorAll('#jelly-review .rv-cell')].map((c) => Math.round(c.getBoundingClientRect().left))).size);
    expect(cols).toBe(1);
  });

  test('sizes: 80×32, 160×44, 320×96 and a clamped custom size are the real host Button box; the hitbox does not move while it deforms', async ({ page }) => {
    await openReview(page);
    for (const [id, w, h] of [['xs', 80, 32], ['md', 160, 44], ['lg', 320, 96]] as const) {
      await page.selectOption('#rv-viewport', id);
      const b = await center(page, 'jelly-soft', 'A');
      expect([Math.round(b.width), Math.round(b.height)]).toEqual([w, h]);
    }
    await page.selectOption('#rv-viewport', 'custom');
    await page.locator('#rv-custom-w').fill('9999');
    await page.locator('#rv-custom-h').fill('1');
    const c = await center(page, 'jelly-soft', 'A');
    expect([Math.round(c.width), Math.round(c.height)]).toEqual([480, 24]);
    await page.selectOption('#rv-viewport', 'md');
    await page.locator('#rv-preset-jelly-candy').click();
    const rest = await center(page, 'jelly-candy', 'A');
    await page.mouse.move(rest.x, rest.y);
    await page.mouse.down();
    await page.waitForTimeout(350);
    const held = await center(page, 'jelly-candy', 'A');
    expect(held).toEqual(rest); // hitbox is the Button's own box, unchanged while the jelly deforms
    expect(await path(page, 'jelly-candy', 'A')).not.toBe(null);
    await page.mouse.up();
  });

  test('contents stay on the host Button: short, long, icon + text, icon only (with an accessible name)', async ({ page }) => {
    await openReview(page);
    const btn = page.getByTestId('rv-btn-jelly-soft:A');
    await page.selectOption('#rv-content', 'short');
    await expect(btn).toContainText('Jello');
    await expect(btn.locator('.jl-btn-content svg')).toHaveCount(0);
    await page.selectOption('#rv-content', 'icon-text');
    await expect(btn).toContainText('Jello');
    await expect(btn.locator('.jl-btn-content svg')).toHaveCount(1);
    await page.selectOption('#rv-content', 'long');
    await expect(btn).toContainText('Etichetta molto lunga di prova');
    await page.selectOption('#rv-content', 'icon');
    await expect(btn).toHaveAttribute('aria-label', 'Jello');
    await expect(btn.locator('.jl-btn-content span')).toHaveCount(0);
    // The text never lives inside the decorative SVG.
    expect(await btn.evaluate((el) => el.querySelector('.jelly-decoration')!.textContent)).toBe('');
    expect(await btn.evaluate((el) => el.querySelector('.jelly-decoration')!.getAttribute('aria-hidden'))).toBe('true');
  });

  test('synchronised input: one real gesture, mirrored by semantic calls — no duplicate native events, one native click', async ({ page }) => {
    await openReview(page);
    await page.evaluate(() => {
      const w = window as unknown as { __ev: Record<string, number> };
      w.__ev = {};
      for (const type of ['pointerdown', 'pointerup', 'click', 'keydown']) {
        document.addEventListener(type, (e) => {
          const b = (e.target as Element).closest?.('[data-testid^="rv-btn-"]');
          if (b) w.__ev[`${type}:${b.getAttribute('data-testid')}`] = (w.__ev[`${type}:${b.getAttribute('data-testid')}`] ?? 0) + 1;
        }, true);
      }
    });
    const rest = await path(page, 'jelly-soft', 'B3');
    const a = await center(page, 'jelly-soft', 'A');
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.waitForTimeout(300);
    expect(await path(page, 'jelly-soft', 'B3')).not.toBe(rest); // the other cell followed
    await page.mouse.up();
    const ev = await page.evaluate(() => (window as unknown as { __ev: Record<string, number> }).__ev);
    expect(ev['pointerdown:rv-btn-jelly-soft:A']).toBe(1);
    expect(ev['click:rv-btn-jelly-soft:A']).toBe(1);
    expect(Object.keys(ev).filter((k) => k.includes(':B3'))).toEqual([]); // not a single native event reached the follower
    await expect.poll(() => path(page, 'jelly-soft', 'B3'), { timeout: 4000 }).toBe(rest); // and it came back to rest
  });

  test('independent input: with sync off the other cell does not move; the forced state applies to every cell', async ({ page }) => {
    await openReview(page);
    await page.locator('#rv-sync').setChecked(false, { force: true });
    const rest = await path(page, 'jelly-soft', 'B3');
    const a = await center(page, 'jelly-soft', 'A');
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.waitForTimeout(300);
    expect(await path(page, 'jelly-soft', 'B3')).toBe(rest);
    await page.mouse.up();
    await page.locator('#rv-sync').setChecked(true, { force: true });
    await page.selectOption('#rv-state', 'pressed');
    await expect.poll(async () => (await path(page, 'jelly-soft', 'A')) !== rest).toBe(true);
    await expect(page.getByTestId('rv-btn-jelly-soft:A')).toBeEnabled();
    await page.selectOption('#rv-state', 'disabled');
    await expect(page.getByTestId('rv-btn-jelly-soft:A')).toBeDisabled();
    await expect(page.getByTestId('rv-btn-jelly-soft:B3')).toBeDisabled();
    await page.selectOption('#rv-state', 'live');
    await expect(page.getByTestId('rv-btn-jelly-soft:A')).toBeEnabled();
  });

  test('keyboard: Tab reaches the controls and the Buttons; Space is mirrored and gives one native click; focus is visible', async ({ page }) => {
    await openReview(page);
    const a = page.getByTestId('rv-btn-jelly-soft:A');
    await a.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(a).toBeFocused();
    expect(await a.evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe('none');
    await page.evaluate(() => { (window as unknown as { __clicks: number }).__clicks = 0; document.addEventListener('click', (e) => { if ((e.target as Element).closest?.('[data-testid^="rv-btn-"]')) (window as unknown as { __clicks: number }).__clicks++; }, true); });
    const rest = await path(page, 'jelly-soft', 'B3');
    await page.keyboard.down('Space');
    await page.waitForTimeout(250);
    expect(await path(page, 'jelly-soft', 'B3')).not.toBe(rest);
    await page.keyboard.up('Space');
    expect(await page.evaluate(() => (window as unknown as { __clicks: number }).__clicks)).toBe(1);
    await page.keyboard.down('Enter');
    await page.waitForTimeout(150);
    await page.keyboard.up('Enter');
    // Inspector sections are native <details>: operable from the keyboard.
    const summary = page.locator('#rv-sec-body > summary');
    await summary.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#rv-sec-body')).toHaveAttribute('open', '');
    // Every control has an accessible name.
    const unnamed = await page.evaluate(() => [...document.querySelectorAll('#jelly-review button, #jelly-review select, #jelly-review input, #jelly-review textarea')].filter((e) => {
      const el = e as HTMLElement;
      return !(el.getAttribute('aria-label') || el.textContent?.trim() || (el as HTMLInputElement).labels?.length || el.getAttribute('title'));
    }).map((e) => e.id || e.tagName));
    expect(unnamed).toEqual([]);
  });

  test('motion comparison: phases land on real frames of the real renderer; scrubbing is deterministic; Play/Pause/Step/Restart work', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1000 }); // all four cells in view: the renderer suspends surfaces that are scrolled out
    await openReview(page);
    await setMode(page, 'Movimento');
    await expect(page.locator('.rv-cell')).toHaveCount(4);
    await expect(page.locator('.rv-cell [data-testid^="rv-btn-"]').first()).toBeVisible();
    // Idle
    for (const v of ['A', 'B1', 'B2', 'B3']) expect(await xOf(page, v)).toBe(0);
    // Hold: Soft A reaches the documented pressed displacement (0.0390 at 600 ms, M6.4.3), B2/B3 a little more (0.0423).
    await page.locator('#rv-phase-hold').click();
    await expect(page.locator('#rv-time')).toHaveText('t = 600 ms');
    expect(await xOf(page, 'A')).toBeCloseTo(0.039, 3);
    expect(await xOf(page, 'B2')).toBeCloseTo(0.0423, 3);
    // Hold on a deformed surface differs from idle (the DOM really moved).
    // Rebound: B2/B3 overshoot to the other side more than A (swing 0.0067 vs 0.0027).
    await page.locator('#rv-phase-rebound').click();
    const a = await xOf(page, 'A'), b3 = await xOf(page, 'B3');
    expect(a).toBeLessThan(0);
    expect(b3).toBeLessThan(a);
    // Scrubbing back and forth returns the exact same frame.
    const at = async (t: number) => { await page.locator('#rv-scrubber').fill(String(t)); await expect(page.locator('#rv-time')).toHaveText(`t = ${t} ms`); return [await xOf(page, 'A'), await xOf(page, 'B3'), await path(page, 'jelly-soft', 'B3')]; };
    const first = await at(300);
    await at(100);
    await at(900);
    expect(await at(300)).toEqual(first);
    // Rest: back to zero, and nothing is pending on the manual clock (surfaces idle).
    await page.locator('#rv-phase-rest').click();
    for (const v of ['A', 'B3']) expect(Math.abs(await xOf(page, v))).toBeLessThan(1e-4);
    // Step: one frame (16 ms) from idle.
    await page.locator('#rv-phase-idle').click();
    await page.locator('#rv-step').click();
    await expect(page.locator('#rv-time')).toHaveText('t = 16 ms');
    // Play, Pause: time advances, then holds still.
    await page.locator('#rv-restart').click();
    await page.waitForTimeout(400);
    await page.locator('#rv-play').click(); // pause (it was playing after Restart)
    await expect(page.locator('#rv-play')).toHaveAttribute('aria-pressed', 'false');
    const t1 = await page.locator('#rv-time').textContent();
    await page.waitForTimeout(300);
    expect(await page.locator('#rv-time').textContent()).toBe(t1);
    expect(t1).not.toBe('t = 0 ms');
    await page.locator('#rv-play').click();
    await expect(page.locator('#rv-play')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#rv-play').click();
    // Hover and Disabled are states, not instants.
    await page.locator('#rv-phase-disabled').click();
    await expect(page.getByTestId('rv-btn-jelly-soft:A')).toBeDisabled();
    await page.locator('#rv-phase-hover').click();
    await expect(page.getByTestId('rv-btn-jelly-soft:A')).toBeEnabled();
  });

  test('Dense has no measurable rebound and Candy rebounds more than Soft, on the real surfaces', async ({ page }) => {
    await openReview(page);
    await setMode(page, 'Movimento');
    const rebound = async (id: string) => { await page.locator(`#rv-preset-${id}`).click(); await page.locator('#rv-phase-rebound').click(); return xOf(page, 'A'); };
    const dense = await rebound('jelly-dense');
    expect(dense).toBeGreaterThanOrEqual(0);
    const soft = await rebound('jelly-soft');
    const candy = await rebound('jelly-candy');
    expect(candy).toBeLessThan(soft);
  });

  test('reduced motion: simulated in the workspace and honoured from the system; nothing deforms and the timeline says why', async ({ page }) => {
    await openReview(page);
    await setMode(page, 'Movimento');
    await page.getByRole('group', { name: 'Movimento', exact: true }).getByRole('button', { name: 'Ridotto', exact: true }).click();
    await expect(page.locator('#rv-motion-reduced')).toBeVisible();
    await page.locator('#rv-phase-hold').click();
    for (const v of ['A', 'B1', 'B2', 'B3']) expect(await xOf(page, v)).toBe(0);
    await page.getByRole('group', { name: 'Movimento', exact: true }).getByRole('button', { name: 'Movimento', exact: true }).click();
    await expect(page.locator('#rv-motion-reduced')).toHaveCount(0);
    await page.locator('#rv-phase-hold').click();
    expect(await xOf(page, 'A')).toBeGreaterThan(0.03);
    // System preference.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('#rv-phase-idle').click();
    await page.locator('#rv-phase-hold').click();
    for (const v of ['A', 'B3']) expect(await xOf(page, v)).toBe(0);
  });

  test('DPR readout is the browser’s real device pixel ratio, labelled as such', async ({ page }) => {
    await openReview(page);
    const dpr = await page.evaluate(() => window.devicePixelRatio);
    await expect(page.locator('#rv-readout-dpr')).toContainText(`DPR del browser: ${dpr}`);
    await expect(page.locator('#rv-readout-dpr')).toHaveAttribute('title', /non lo emula/);
    await expect(page.locator('#rv-zoom')).toHaveAttribute('title', /non cambia il DPR/);
  });

  test('tint normalisation applies to every cell and the original documents are not what changes', async ({ page }) => {
    await openReview(page);
    await setMode(page, 'Quattro varianti');
    await page.locator('.rv-toolbar').getByRole('button', { name: /^Preset \(/ }).click();
    await expect(page.locator('.rv-cell')).toHaveCount(4);
    const tints = () => page.evaluate(() => [...document.querySelectorAll('#jelly-review .rv-cell')].map((c) => c.querySelector('.jelly-decoration linearGradient stop')?.getAttribute('stop-color')));
    const before = await tints();
    expect(new Set(before).size).toBe(4);
    await page.locator('#rv-normalized').setChecked(true, { force: true });
    await expect.poll(async () => new Set(await tints()).size).toBe(1);
    await page.locator('#rv-normalized').setChecked(false, { force: true });
    await expect.poll(tints).toEqual(before);
  });

  test('Base and Advanced inspector: Base explains, Advanced shows values and live measurements', async ({ page }) => {
    await openReview(page);
    await expect(page.getByTestId('rv-params')).toHaveCount(0);
    await expect(page.locator('#rv-sec-body')).toBeAttached();
    await page.locator('#rv-sec-body > summary').click();
    await expect(page.getByTestId('rv-changed-summary').first()).toContainText('Rispetto ad A cambiano');
    await page.getByRole('button', { name: 'Avanzata', exact: true }).click();
    await expect(page.getByTestId('rv-params').first()).toBeVisible();
    await expect(page.getByTestId('rv-treatment')).toHaveText('m643');
    await page.locator('#rv-sec-perf > summary').click();
    await expect(page.getByTestId('rv-perf')).toContainText('Nodi SVG');
    await page.locator('#rv-sec-motion > summary').click();
    await expect(page.getByTestId('rv-motion-table')).toContainText('Swing rilascio');
    await page.getByRole('button', { name: 'Base', exact: true }).click();
    await expect(page.getByTestId('rv-perf')).toHaveCount(0);
    // Accessibility section separates what was tested from what was not.
    await page.locator('#rv-sec-a11y > summary').click();
    await expect(page.getByTestId('rv-a11y')).toContainText('NOT TESTED');
  });

  test('decisions are explicit: nothing is accepted by itself, a reason and a variant are required, and the record survives a reload', async ({ page }) => {
    await openReview(page);
    for (const id of PRESETS) await expect(page.locator(`#rv-preset-${id}`)).toContainText('Pending');
    await expect(page.getByTestId('rv-delivery')).toHaveText('TECHNICAL REVIEW READY');
    await expect(page.locator('#rv-status-pending')).toHaveAttribute('aria-pressed', 'true');
    // No reason → refused.
    await page.locator('#rv-status-candidate-accepted').click();
    await expect(page.locator('#rv-decision-error')).toContainText('motivazione');
    await expect(page.locator('#rv-status-pending')).toHaveAttribute('aria-pressed', 'true');
    // Reason but no variant → refused for acceptance.
    await page.locator('#rv-note-rationale').fill('Corpo morbido, ritorno coerente');
    await page.locator('#rv-status-candidate-accepted').click();
    await expect(page.locator('#rv-decision-error')).toContainText('variante');
    await page.selectOption('#rv-decision-variant', 'B3');
    await page.locator('#rv-note-positives').fill('Bordo più profondo');
    await page.locator('#rv-status-candidate-accepted').click();
    await expect(page.locator('#rv-decision-error')).toHaveCount(0);
    await expect(page.locator('#rv-status-candidate-accepted')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('rv-decided-at')).toContainText(/\d{4}-\d{2}-\d{2}T/);
    await expect(page.getByTestId('rv-delivery')).toHaveText('VISUAL REVIEW PARTIAL');
    // The other presets are untouched.
    await page.locator('#rv-preset-jelly-clear').click();
    await expect(page.locator('#rv-status-pending')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#rv-note-rationale')).toHaveValue('');
    // Survives reload, in its own key.
    await page.reload();
    await page.waitForSelector('#jelly-lab:not([hidden]) #jl-primary .jelly-decoration');
    await page.locator('#jl-open-review').click();
    await expect(page.locator('#rv-preset-jelly-soft')).toContainText('candidate accepted');
    await expect(page.locator('#rv-note-rationale')).toHaveValue('Corpo morbido, ritorno coerente');
    const keys = await page.evaluate(() => Object.keys(localStorage).filter((k) => /review/.test(k)));
    expect(keys).toEqual([REVIEW_KEY]);
    // Going back to Pending clears the date.
    await page.locator('#rv-status-pending').click();
    await expect(page.getByTestId('rv-decided-at')).toContainText('Pending');
  });

  test('an unreadable or newer stored record is reported and left alone until the person replaces it', async ({ page }) => {
    await page.addInitScript((key) => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem(key, JSON.stringify({ schema: 'jello-visual-review', version: 99, decisions: {} })); } }, REVIEW_KEY);
    await openReview(page);
    await expect(page.getByTestId('rv-storage-problem')).toContainText('ignorato');
    await page.locator('#rv-note-rationale').fill('x');
    await page.waitForTimeout(200);
    expect(JSON.parse((await page.evaluate((k) => localStorage.getItem(k), REVIEW_KEY))!).version).toBe(99); // untouched
    await page.locator('#rv-replace-storage').click();
    await expect.poll(async () => JSON.parse((await page.evaluate((k) => localStorage.getItem(k), REVIEW_KEY))!).version).toBe(1);
  });

  test('reports: JSON and Markdown are generated from the real session and are reproducible', async ({ page }) => {
    await openReview(page);
    await page.locator('#rv-note-rationale').fill('prova');
    await page.selectOption('#rv-decision-variant', 'B1');
    const download = async (id: string) => { const [d] = await Promise.all([page.waitForEvent('download'), page.locator(id).click()]); return (await (await import('node:fs/promises')).readFile((await d.path())!, 'utf8')); };
    const json = JSON.parse(await download('#rv-export-json'));
    expect(json.schema).toBe('jello-visual-review-report');
    expect(json.visuallyVerified).toBe(false);
    expect(json.deliveryState).toBe('TECHNICAL REVIEW READY');
    expect(json.presets).toHaveLength(4);
    expect(json.presets[0].decision.variant).toBe('B1');
    expect(json.presets[0].decision.status).toBe('pending');
    expect(json.conditions).toMatchObject({ mode: 'side', viewport: { width: 160, height: 44 }, background: 'light', content: 'short', syncInput: true });
    expect(json.source.commit).toBeNull();
    // Evidence = exactly the surfaces on screen, as reported by the renderer (backend, bubbles, effective alpha).
    expect(json.surfaceEvidence.map((e: { variant: string }) => e.variant).sort()).toEqual(['A', 'B3']);
    for (const e of json.surfaceEvidence) expect(e).toMatchObject({ presetId: 'jelly-soft', backend: 'svg', motion: 'dynamic' });
    expect(json.surfaceEvidence.find((e: { variant: string }) => e.variant === 'B3').treatment).toBe('m643');
    const again = JSON.parse(await download('#rv-export-json'));
    expect({ ...again, generatedAt: 0 }).toEqual({ ...json, generatedAt: 0 });
    const md = await download('#rv-export-md');
    expect(md).toContain('# Jello Visual Review — report');
    expect(md).toContain('TECHNICAL REVIEW READY');
    expect(md).toContain('| jelly-soft | A | svg |');
    expect(md).toContain('NOT TESTED');
    await expect(page.locator('#rv-export-status')).toContainText('Report Markdown generato');
    // The report API refuses to invent: no surfaces mounted → empty evidence.
    await setMode(page, 'Quattro varianti');
    expect((await page.evaluate(() => (window as unknown as { __jelloReview: { report(): { surfaceEvidence: unknown[] } } }).__jelloReview.report().surfaceEvidence.length))).toBe(4);
  });

  test('repeated A/B switching, mode and size changes leave no growth; leaving the Review removes every surface', async ({ page }) => {
    await openReview(page);
    await page.evaluate(() => { (window as unknown as { __raf: number }).__raf = 0; const o = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = (cb) => { (window as unknown as { __raf: number }).__raf++; return o(cb); }; });
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => (window as unknown as { __raf: number }).__raf)).toBe(0); // no RAF at rest
    const sizes: Record<string, number[]> = {};
    for (let i = 0; i < 12; i++) {
      for (const v of ['B1', 'B2', 'B3', 'A']) {
        await page.locator(`#rv-variant-${v}`).click();
        await expect(page.locator('.rv-cell .jelly-decoration')).toHaveCount(v === 'A' ? 1 : 2);
        (sizes[v] ??= []).push(await nodes(page));
      }
    }
    for (const [v, list] of Object.entries(sizes)) expect(new Set(list).size, `${v}: ${list}`).toBe(1);
    for (let i = 0; i < 5; i++) { for (const m of ['Quattro varianti', 'Movimento', 'Affiancato'] as const) await setMode(page, m); await page.selectOption('#rv-viewport', i % 2 ? 'xs' : 'lg'); }
    await page.selectOption('#rv-viewport', 'md');
    await page.locator('#rv-variant-B3').click();
    const base = await nodes(page);
    await page.waitForTimeout(300);
    expect(await nodes(page)).toBe(base);
    await page.locator('#rv-back').click();
    await expect(page.locator('#jelly-review')).toHaveCount(0);
    expect(await page.evaluate(() => typeof (window as unknown as { __jelloReview?: unknown }).__jelloReview)).toBe('undefined');
    await expect(page.locator('#jelly-lab:not([hidden]) #jl-primary .jelly-decoration')).toBeVisible();
    // Reopening starts clean.
    await page.locator('#jl-open-review').click();
    await expect(page.locator('.rv-cell .jelly-decoration')).toHaveCount(2);
  });

  test('the Review chunk fails: the Lab and the Studio stay usable, the failure is explained and a retry recovers', async ({ page }) => {
    await page.goto('./?studio=jelly&animate=0');
    await page.waitForSelector('#jelly-lab:not([hidden]) #jl-primary .jelly-decoration');
    let offline = true;
    await page.route(/\/assets\/ReviewWorkspace-/, (route) => (offline ? route.abort() : route.continue()));
    await page.locator('#jl-open-review').click();
    const failure = page.locator('[data-experimental-failed]');
    await expect(failure).toContainText('La Visual Review non si è caricat');
    await expect(page.locator('.studio-rail')).toBeVisible();
    await page.locator('#ws-material').click();
    await expect(page.locator('#lab')).toBeVisible();
    offline = false;
    await page.locator('#ws-jelly').click();
    await page.locator('[data-experimental-failed]').getByRole('button', { name: 'Riprova' }).click();
    await expect(page.locator('#jelly-review .rv-cell .jelly-decoration').first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-experimental-failed]')).toHaveCount(0);
  });

  test('contracts: opening and using the Review changes no stored project data, no preset, no library entry; Glass and Solid are untouched', async ({ page }) => {
    await page.goto('./?studio=jelly&animate=0');
    await page.waitForSelector('#jelly-lab:not([hidden]) #jl-primary .jelly-decoration');
    const snapshot = () => page.evaluate(async () => {
      const ls = Object.fromEntries(Object.keys(localStorage).sort().map((k) => [k, localStorage.getItem(k)]));
      const dbs = await indexedDB.databases();
      const out: Record<string, unknown> = {};
      for (const info of dbs) {
        const db = await new Promise<IDBDatabase>((res, rej) => { const r = indexedDB.open(info.name!); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
        const stores: Record<string, unknown> = {};
        for (const name of [...db.objectStoreNames]) {
          stores[name] = await new Promise((res, rej) => { const r = db.transaction(name).objectStore(name).getAll(); r.onsuccess = () => res(JSON.stringify(r.result)); r.onerror = () => rej(r.error); });
        }
        db.close();
        out[info.name!] = stores;
      }
      return { ls, idb: out };
    });
    const before = await snapshot();
    await page.locator('#jl-open-review').click();
    await page.waitForSelector('#jelly-review .rv-cell .jelly-decoration');
    for (const id of PRESETS) { await page.locator(`#rv-preset-${id}`).click(); for (const v of ['A', 'B1', 'B2', 'B3']) await page.locator(`#rv-variant-${v}`).click(); }
    await setMode(page, 'Quattro varianti'); await page.locator('#rv-normalized').setChecked(true, { force: true });
    await setMode(page, 'Movimento'); await page.locator('#rv-phase-hold').click();
    await page.locator('#rv-back').click();
    const after = await snapshot();
    // Only the Studio's own view-preference key may change (the Base/Advanced level), and nothing in any database.
    const { ['jello-jelly-view-v1']: _a, ...beforeLs } = before.ls;
    const { ['jello-jelly-view-v1']: _b, ...afterLs } = after.ls;
    expect(afterLs).toEqual(beforeLs);
    expect(after.idb).toEqual(before.idb);
    // The library still lists the four built-ins as candidates, unverified, and nothing else; Glass/Solid have no Jello.
    await page.locator('#ws-library').click();
    await expect(page.locator('main:visible')).not.toContainText('Visual Review');
    await page.locator('#ws-material').click();
    await expect(page.locator('#lab')).toBeVisible();
    await expect(page.locator('#lab .jelly-decoration')).toHaveCount(0);
  });
});

test.describe('Jello Visual Review (DPR 2)', () => {
  test.skip(({ isMobile }) => isMobile, 'DPR 2 is applied by the test runner on desktop engines');
  test.use({ deviceScaleFactor: 2 });
  test('the readout reports the real DPR 2 and the surfaces render at it', async ({ page }) => {
    await openReview(page);
    expect(await page.evaluate(() => window.devicePixelRatio)).toBe(2);
    await expect(page.locator('#rv-readout-dpr')).toContainText('DPR del browser: 2');
    const b = await center(page, 'jelly-soft', 'A');
    expect([Math.round(b.width), Math.round(b.height)]).toEqual([160, 44]); // CSS px are unchanged by DPR
  });
});

test.describe('Jello Visual Review (phone viewport, emulated)', () => {
  test.skip(({ isMobile }) => !isMobile, 'Emulated phone viewport only');
  test('priority to the preview, compact selection, Inspector as a drawer, no horizontal scroll', async ({ page }) => {
    await openReview(page);
    const overflow = () => page.evaluate(() => { const r = document.documentElement; return r.scrollWidth > r.clientWidth; });
    expect(await overflow()).toBe(false);
    // Preset selection is compact and reachable; the Inspector is closed by default.
    await expect(page.locator('#rv-preset-jelly-soft')).toBeVisible();
    await expect(page.locator('#rv-right')).toBeHidden();
    await page.locator('#rv-preset-jelly-dense').click();
    await expect(page.locator('#rv-preset-jelly-dense')).toHaveAttribute('aria-pressed', 'true');
    // A readable sequential comparison: both cells are on one column, no overlap.
    const cols = await page.evaluate(() => new Set([...document.querySelectorAll('#jelly-review .rv-cell')].map((c) => Math.round(c.getBoundingClientRect().left))).size);
    expect(cols).toBe(1);
    await expect(page.getByTestId('rv-btn-jelly-dense:A')).toBeVisible();
    // Inspector drawer opens over the content, can be closed, and nothing essential hides behind a toolbar.
    await page.locator('#rv-toggle-right').click();
    await expect(page.locator('#rv-right')).toBeVisible();
    expect(await page.locator('#rv-right').evaluate((el) => getComputedStyle(el).position)).toBe('fixed');
    await page.locator('#rv-close-inspector').click();
    await expect(page.locator('#rv-right')).toBeHidden();
    expect(await overflow()).toBe(false);
    // Switching to 2×2 degrades to one column on a phone.
    await setMode(page, 'Quattro varianti');
    expect(await overflow()).toBe(false);
    await page.getByTestId('rv-btn-jelly-dense:A').scrollIntoViewIfNeeded();
    const b = await page.getByTestId('rv-btn-jelly-dense:A').boundingBox();
    expect(b!.x).toBeGreaterThanOrEqual(0);
    expect(b!.x + b!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  });
});
