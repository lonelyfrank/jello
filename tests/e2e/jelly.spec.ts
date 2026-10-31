import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/fixtures/jelly/');
  await page.waitForFunction(() => !!window.jellyFixture);
});

test('semantic content, hit target, static states, focus and simultaneous SVG IDs', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => { if (e.type() === 'error') errors.push(e.text()); });
  const host = page.locator('#primary-button');
  await expect(host).toHaveText('Jelly');
  const before = await host.locator('.button-content').boundingBox();
  await host.click();
  await expect(host).toHaveAttribute('data-clicks', '1');
  const hitbox = await host.boundingBox();
  for (const state of ['hover', 'pressed', 'active', 'disabled', 'default']) {
    await page.selectOption('#state', state);
    expect(await host.locator('.button-content').boundingBox()).toEqual(before);
    expect(await host.boundingBox()).toEqual(hitbox);
  }
  await host.focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(host).toBeFocused();
  expect(await host.evaluate((e) => getComputedStyle(e).outlineStyle)).toBe('solid');
  expect(await page.evaluate(() => {
    const ids = [...document.querySelectorAll('.jelly-decoration [id]')].map((e) => e.id);
    const references = [...document.querySelectorAll('.jelly-decoration *')].flatMap((e) => [...e.attributes].flatMap((a) => [...a.value.matchAll(/url\(#([^)]*)\)/g)].map((m) => m[1])));
    return { unique: new Set(ids).size === ids.length, resolved: references.every((id) => !!document.getElementById(id!)), instances: document.querySelectorAll('.jelly-decoration > svg').length };
  })).toMatchObject({ unique: true, resolved: true });
  const distributions = await page.locator('#preset-matrix .test-button').evaluateAll((hosts) => hosts.slice(0, 4).map((host) => [...host.querySelectorAll('[data-bubble-index]')].map((e) => e.getAttribute('transform'))));
  expect(distributions.every((d) => JSON.stringify(d) === JSON.stringify(distributions[0]))).toBe(true);
  expect(errors).toEqual([]);
});

test('resize and hidden/reopened host retain bubble identity and do not schedule continuously', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { primary } = window.jellyFixture;
    const get = () => [...primary.host.querySelectorAll('[data-bubble-index]')].map((e) => ({ id: e.getAttribute('data-bubble-index'), position: e.getAttribute('transform') }));
    const before = get();
    const initial = primary.surface.status;
    primary.host.style.width = '600px';
    primary.surface.resize();
    const after = get();
    const resized = primary.surface.status;
    primary.host.style.display = 'none';
    primary.surface.resize();
    const hidden = primary.surface.status;
    primary.host.style.display = '';
    primary.host.style.width = '240px';
    primary.surface.resize();
    const restored = get();
    await new Promise((r) => setTimeout(r, 120));
    const settled = primary.surface.status.updates;
    await new Promise((r) => setTimeout(r, 160));
    return { before, after, restored, initial, resized, hidden, settled, idle: primary.surface.status.updates };
  });
  expect(result.after.map((e) => e.id).slice(0, result.before.length)).toEqual(result.before.map((e) => e.id));
  expect(result.after[0]!.position).not.toBe(result.before[0]!.position);
  expect(result.resized.distributions).toBe(result.initial.distributions);
  expect(result.hidden.suspended).toBe(true);
  expect(result.hidden.bubbles).toBe(0);
  expect(result.restored).toEqual(result.before);
  expect(result.idle).toBe(result.settled);
});

test('host radius, tiny capsules, wide proportions and decorative clipping are coherent', async ({ page }) => {
  const result = await page.evaluate(() => {
    const { attach, soft } = window.jellyFixture;
    const host = document.createElement('button');
    host.style.cssText = 'width:480px;height:24px;background:transparent;border:0;position:relative';
    host.textContent = 'Host';
    document.body.append(host);
    const capsule = { ...soft, geometry: { ...soft.geometry, shape: 'capsule' as const } };
    const surface = attach(host, capsule, { radius: 3 });
    const radius = host.querySelector<HTMLElement>('.jelly-decoration')!.style.borderRadius;
    surface.update(capsule);
    // update without new options retains host radius. An explicit empty object clears it.
    surface.update(capsule, {});
    const capsuleRadius = host.querySelector<HTMLElement>('.jelly-decoration')!.style.borderRadius;
    host.style.width = '24px'; host.style.height = '24px';
    surface.resize();
    const path = host.querySelector('clipPath path')!.getAttribute('d');
    const clip = host.querySelector('[data-jelly-bubbles]')!.parentElement!.getAttribute('clip-path');
    const overflow = getComputedStyle(host.querySelector('.jelly-decoration > svg')!).overflow;
    surface.destroy(); host.remove();
    return { radius, capsuleRadius, path, clip, overflow };
  });
  expect(result.radius).toBe('3px');
  expect(result.capsuleRadius).toBe('12px');
  expect(result.path).not.toMatch(/NaN|Infinity/);
  expect(result.clip).toMatch(/^url\(#jello-jelly-\d+-clip\)$/);
  expect(result.overflow).toBe('visible');
});

test('bubbles off removes nodes and repeated optical updates preserve the deterministic pool', async ({ page }) => {
  const result = await page.evaluate(() => {
    const { primary, soft } = window.jellyFixture;
    const circle = primary.host.querySelector('[data-bubble-index]');
    const distributions = primary.surface.status.distributions;
    for (const value of [0.1, 0.2, 0.3]) primary.surface.update({ ...soft, material: { ...soft.material, scattering: value } });
    const reused = circle === primary.host.querySelector('[data-bubble-index]');
    const noRegeneration = distributions === primary.surface.status.distributions;
    primary.surface.update({ ...soft, bubbles: { ...soft.bubbles, enabled: 'disabled' } });
    const disabled = primary.surface.status.bubbles;
    const nodes = primary.host.querySelectorAll('[data-bubble-index]').length;
    primary.surface.update({ ...soft, bubbles: { ...soft.bubbles, density: 0 } });
    return { reused, noRegeneration, disabled, nodes, zero: primary.surface.status.bubbles };
  });
  expect(result).toEqual({ reused: true, noRegeneration: true, disabled: 0, nodes: 0, zero: 0 });
});

test('initial load and lifecycle produce no console errors, observer loops or RAF work', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => { if (e.type() === 'error') errors.push(e.text()); });
  await page.addInitScript(() => {
    const original = window.requestAnimationFrame.bind(window);
    let count = 0;
    window.requestAnimationFrame = (callback) => { count++; return original(callback); };
    Object.defineProperty(window, 'jellyRAFCount', { get: () => count });
  });
  await page.reload();
  await page.waitForFunction(() => !!window.jellyFixture);
  const before = await page.evaluate(() => Reflect.get(window, 'jellyRAFCount'));
  await page.selectOption('#geometry', 'small');
  await page.selectOption('#param-profile', 'static');
  await page.waitForTimeout(200);
  const after = await page.evaluate(() => Reflect.get(window, 'jellyRAFCount'));
  expect(before).toBe(0);
  expect(after).toBe(0);
  expect(errors).toEqual([]);
});

test('updates are atomic, preserve nodes/input and honor caps, seed zero and fallback policy', async ({ page }) => {
  const result = await page.evaluate(() => {
    const { primary, soft } = window.jellyFixture;
    const doc = structuredClone(soft);
    const before = JSON.stringify(doc);
    const text = primary.host.querySelector('.button-content');
    const image = primary.host.querySelector('.jelly-decoration > svg');
    primary.surface.update({ ...doc, bubbles: { ...doc.bubbles, seed: 0, density: 20 }, quality: { profile: 'high' } });
    const indices = () => [...primary.host.querySelectorAll('[data-bubble-index]')].map((e) => e.getAttribute('transform'));
    const high = indices();
    primary.surface.update({ ...doc, bubbles: { ...doc.bubbles, seed: 0, density: 20 }, quality: { profile: 'low' } });
    const low = indices();
    primary.surface.update({ ...doc, material: { ...doc.material, tint: '#aabbcc' } });
    const distributions = primary.surface.status.distributions;
    const html = primary.host.innerHTML;
    let rejected = false;
    try { primary.surface.update({ ...doc, bubbles: { ...doc.bubbles, radiusMin: 10, radiusMax: 1 } }, { opaque: true }); } catch { rejected = true; }
    const atomic = html === primary.host.innerHTML && !primary.surface.status.opaque;
    primary.surface.update(doc, { svgAvailable: false });
    const fallback = primary.surface.status;
    primary.surface.update(doc, { opaque: true });
    const opaque = primary.surface.status;
    return { rejected, atomic, high, low, distributions, fallback, opaque, sameText: text === primary.host.querySelector('.button-content'), sameSVG: image === primary.host.querySelector('.jelly-decoration > svg'), unchanged: before === JSON.stringify(doc) };
  });
  expect(result.high).toHaveLength(24);
  expect(result.low).toEqual(result.high.slice(0, 4));
  expect(result).toMatchObject({ rejected: true, atomic: true, sameText: true, sameSVG: true, unchanged: true });
  expect(result.fallback).toMatchObject({ requestedBackend: 'auto', backend: 'css', bubbles: 0 });
  expect(result.opaque).toMatchObject({ backend: 'css', effectiveAlpha: 1, effectiveTransmission: 0, bubbles: 0 });
});

test('repeated mount/destroy restores host-owned content, classes and styles with no late callbacks', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { attach, soft } = window.jellyFixture;
    const host = document.createElement('button');
    host.className = 'owned';
    host.style.cssText = 'width:96px;height:48px;color:red;--jelly-foreground:blue !important';
    host.setAttribute('aria-label', 'Originale');
    host.innerHTML = '<span>Originale</span>';
    document.body.append(host);
    const original = host.outerHTML;
    let callbacks = 0;
    for (let i = 0; i < 100; i++) {
      const surface = attach(host, soft);
      surface.onStatus(() => callbacks++);
      surface.destroy();
      surface.destroy();
      surface.update(soft);
      surface.setPressed(true);
      surface.resize();
    }
    await new Promise((r) => setTimeout(r, 100));
    const preserved = host.outerHTML === original;
    const external = attach(host, soft);
    host.style.setProperty('--jelly-foreground', 'green', 'important');
    host.style.backgroundColor = 'yellow';
    host.classList.add('added-by-host');
    const extra = document.createElement('span'); extra.textContent = 'Nuovo'; host.append(extra);
    external.destroy();
    const externalPreserved = host.style.getPropertyValue('--jelly-foreground') === 'green' && host.style.backgroundColor === 'yellow' && host.classList.contains('added-by-host') && extra.parentNode === host;
    // Also tolerate an initially hidden host, then ResizeObserver's first nonzero measurement.
    host.style.display = 'none';
    const surface = attach(host, soft);
    const hidden = surface.status.suspended;
    host.style.display = '';
    await new Promise((r) => setTimeout(r, 100));
    const reopened = !surface.status.suspended;
    surface.destroy(); host.remove();
    return { callbacks, preserved, externalPreserved, hidden, reopened };
  });
  expect(result).toEqual({ callbacks: 0, preserved: true, externalPreserved: true, hidden: true, reopened: true });
});

test('CSS, opaque, reduced preferences and forced colors keep content and focus usable', async ({ page }) => {
  await page.selectOption('#param-backend', 'css');
  await expect(page.locator('#primary-button .jelly-decoration')).toHaveAttribute('data-backend', 'css');
  await page.check('#transparency');
  expect(await page.evaluate(() => window.jellyFixture.primary.surface.status)).toMatchObject({ opaque: true, transparencyReduced: true });
  await page.uncheck('#transparency');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(() => page.evaluate(() => window.jellyFixture.primary.surface.status.motionReduced)).toBe(true);
  await page.emulateMedia({ forcedColors: 'active' });
  await expect.poll(() => page.evaluate(() => window.jellyFixture.primary.surface.status.forcedColors)).toBe(true);
  expect(await page.evaluate(() => window.jellyFixture.primary.surface.status)).toMatchObject({ backend: 'css', opaque: true, effectiveAlpha: 1, effectiveTransmission: 0, bubbles: 0 });
  await page.locator('#primary-button').focus();
  await expect(page.locator('#primary-button')).toBeFocused();
  await expect(page.locator('#primary-button .button-content')).toHaveText('Jelly');
});
