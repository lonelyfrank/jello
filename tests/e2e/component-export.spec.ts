/**
 * Preview ↔ exported component. A component is built in the lab, exported with
 * the same adapter the dialog uses, unpacked and served from another origin;
 * a plain page then mounts the package's `component.json` with the package's
 * own `runtime/jello.js` (the built library, not the lab's sources).
 *
 * What is compared is what a person sees, as the browser computed it: the
 * element, its attributes, text and icon, the computed style of every layer
 * and the geometry — at rest and in each state (hover, pressed, focus). The
 * values transition, so the comparison waits until the two agree (a polled
 * condition, with the differences in the failure message), never for a time.
 */
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { addBreakpoint, applyNavbarView, componentTemplate, navbarView, serializeDefinition, setButtonDisabled, setButtonField, setButtonLink, switchMaterialFamily, updateBreakpoint, type ComponentDefinition } from '../../src/components';
import { unzip } from '../../src/export/zip';
import { lab, openLab } from './helpers';

const TYPES: Record<string, string> = { js: 'text/javascript', css: 'text/css', json: 'application/json', html: 'text/html', md: 'text/markdown', ts: 'text/plain' };

const HARNESS = `<!doctype html>
<html lang="it"><head><meta charset="utf-8"><link rel="stylesheet" href="/runtime/jello.css">
<style>body{margin:0;background:#f4f4f6;font:14px system-ui}#src{position:fixed;inset:0;background:repeating-linear-gradient(135deg,#ff453a 0 18px,#f4f4f2 18px 54px)}#slot{position:fixed;left:0;top:0;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box}</style>
</head><body><a id="before" href="#before" style="position:fixed;left:-999px;top:0">before</a><div id="src"></div><div id="slot"></div>
<script type="module">
import { createComponent } from './runtime/jello.js';
const config = await (await fetch('./component.json')).json();
const container = document.getElementById('slot');
// The box the component is laid out in is the lab stage's own, so widths and breakpoints mean the same on both pages.
const q = new URLSearchParams(location.search);
container.style.width = q.get('w') + 'px';
container.style.height = q.get('h') + 'px';
// A GlassSource behind the component, as the lab's stage has: both run the same path.
const instance = createComponent({ container, config, source: document.getElementById('src'), ...(config.type === 'mobile-navbar' ? { anchor: 'container' } : { inertLinks: true }) });
instance.mount();
window.__instance = instance;
document.documentElement.dataset.ready = 'true';
</script></body></html>`;

async function exportPackage(page: Page): Promise<Map<string, Uint8Array>> {
  const [download] = await Promise.all([page.waitForEvent('download'), lab(page, `return h.builder.exportWith('component-react')`)]);
  const entries = unzip(new Uint8Array(readFileSync((await download.path())!)));
  const root = entries[0]!.path.split('/')[0]!;
  const files = new Map(entries.map((e) => [e.path.slice(root.length + 1), e.data]));
  files.set('harness.html', new TextEncoder().encode(HARNESS));
  return files;
}

async function open(page: Page, ctxPage: Page, d: ComponentDefinition) {
  const json = serializeDefinition(d);
  await openLab(page, `workspace=builder&component=${d.type}&scene=app&animate=0`);
  expect(await lab(page, `return h.builder.importComponent(${JSON.stringify(json)})`)).toBe(true);
  await expect.poll(() => lab(page, 'return h.builder.doc.name')).toBe(d.name);
  const files = await exportPackage(page);
  await ctxPage.context().route('http://pkg.test/**', (route) => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname.slice(1)) || 'harness.html';
    const data = files.get(path);
    if (!data) return route.fulfill({ status: 404, body: 'not found' });
    return route.fulfill({ status: 200, contentType: TYPES[path.split('.').pop()!] ?? 'application/octet-stream', body: Buffer.from(data) });
  });
  const area = (await page.locator('#stageMain .overlay').boundingBox())!;
  await ctxPage.goto(`http://pkg.test/harness.html?w=${area.width}&h=${area.height}`);
  await ctxPage.waitForSelector('html[data-ready=true]', { state: 'attached' });
  // The package is the component the lab shows, byte for byte.
  expect(new TextDecoder().decode(files.get('component.json'))).toBe(serializeDefinition(JSON.parse(await lab<string>(page, 'return h.builder.json()')) as never) + '\n');
}

/** What is seen of the component under `selector`, as computed values. */
function signature(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const root = document.querySelector<HTMLElement>(sel)!;
    const props = ['display', 'minHeight', 'height', 'width', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopLeftRadius', 'color', 'opacity', 'fontFamily', 'fontSize', 'fontWeight', 'letterSpacing', 'columnGap', 'justifyContent', 'flexDirection', 'textShadow', 'outlineStyle', 'outlineWidth', 'outlineColor', 'outlineOffset', 'backgroundColor', 'backgroundImage', 'borderTopWidth', 'borderTopColor', 'boxShadow', 'transform', 'filter', 'backdropFilter', 'cursor', 'textAlign', 'whiteSpace'];
    const style = (el: Element) => {
      const cs = getComputedStyle(el);
      return Object.fromEntries(props.map((p) => [p, (cs as unknown as Record<string, string>)[p]]));
    };
    const custom = (el: HTMLElement, keep: RegExp, skip?: RegExp) =>
      Object.fromEntries([...el.style].filter((p) => p.startsWith('--') && keep.test(p) && !(skip && skip.test(p))).map((p) => [p, el.style.getPropertyValue(p).trim()]));
    const attrs = (el: Element) => Object.fromEntries([...el.attributes].filter((a) => !/^(style|class|data-jello-(path|sizing)|id|data-preview-state)$/.test(a.name)).map((a) => [a.name, a.value]));
    const rect = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 };
    };
    const layer = root.querySelector<HTMLElement>(':scope > .jello-solid, :scope > .jello-surface');
    const kids = [...root.querySelectorAll<HTMLElement>('.jello-btn-label, .jello-btn-icon, .jello-bnav-tab, .jello-bnav-indicator')];
    return {
      tag: root.tagName,
      attrs: attrs(root),
      vars: custom(root, /^--(jbtn|jbn|jsolid)-/),
      style: style(root),
      rect: rect(root),
      layer: layer && { cls: (layer.getAttribute('class') ?? '').replace(/\bjello-host\b/, '').trim(), style: style(layer), vars: custom(layer, /^--jello-/, /^--jello-(px|py|press|hover|host)/) },
      parts: kids.map((k) => ({ cls: (k.getAttribute('class') ?? '').replace(/\s+/g, ' '), text: k.textContent, attrs: attrs(k), style: style(k), rect: rect(k), svg: k.querySelector('svg')?.innerHTML ?? k.innerHTML.slice(0, 0) })),
    };
  }, selector);
}

function differences(a: unknown, b: unknown, path = ''): string[] {
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return a === b ? [] : [`${path}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`];
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].flatMap((k) => differences((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`));
}

/** The two pages agree on `labSel` (inside the lab's stage) and `pkgSel`. */
async function same(preview: Page, pkg: Page, labSel: string, pkgSel: string, what: string) {
  await expect.poll(async () => differences(await signature(preview, labSel), await signature(pkg, pkgSel)), { timeout: 8000, message: `${what}: the exported component differs from the preview` }).toEqual([]);
}

/** Lands on `sel` the way a keyboard does, so `:focus-visible` applies: step away backwards, then Tab back to it. */
async function focusWithKeyboard(p: Page, sel: string) {
  await p.locator(sel).focus();
  await p.keyboard.press('Shift+Tab');
  for (let i = 0; i < 3 && !(await p.locator(sel).evaluate((el) => el === document.activeElement)); i++) await p.keyboard.press('Tab');
  await expect(p.locator(sel)).toBeFocused();
}

const BTN = '.jello-btn';
const BAR = 'nav.jello-bnav';
const TAB = '.jello-bnav-tab';
const inLab = (s: string) => `#stageMain ${s}:not(.navbar)`;

const solid = (d: ComponentDefinition) => switchMaterialFamily(d, 'solid').definition;
const button = (name: string, f: (d: ComponentDefinition) => ComponentDefinition) => f({ ...componentTemplate('button')!.create(), name });
const navbar = (name: string, f: (d: ComponentDefinition) => ComponentDefinition) => f({ ...componentTemplate('mobile-navbar')!.create(), name });

const BUTTONS: { name: string; def: () => ComponentDefinition; disabled?: boolean }[] = [
  { name: 'Glass primary', def: () => button('Fidelity glass', (d) => d) },
  { name: 'Solid primary', def: () => button('Fidelity solid', solid) },
  {
    name: 'Solid secondary link, large, square, icon after, fixed width',
    def: () =>
      button('Fidelity link', (d) => {
        let x = solid(d);
        x = setButtonField(x, 'style.variant', 'secondary')!;
        x = setButtonField(x, 'layout.size', 'lg')!;
        x = setButtonField(x, 'layout.radius', 6)!;
        x = setButtonField(x, 'layout.iconPosition', 'end')!;
        x = setButtonField(x, 'layout.widthMode', 'fixed')!;
        x = setButtonField(x, 'layout.align', 'start')!;
        return setButtonLink(x, 'link', '/docs')!;
      }),
  },
  { name: 'Glass ghost', def: () => button('Fidelity ghost', (d) => setButtonField(d, 'style.variant', 'ghost')!) },
  { name: 'Solid ghost', def: () => button('Fidelity ghost solid', (d) => solid(setButtonField(d, 'style.variant', 'ghost')!)) },
  { name: 'Glass secondary, disabled', def: () => button('Fidelity off glass', (d) => setButtonDisabled(setButtonField(d, 'style.variant', 'secondary')!, true)), disabled: true },
  { name: 'Solid primary, disabled', def: () => button('Fidelity off solid', (d) => setButtonDisabled(solid(d), true)), disabled: true },
];

test.describe('button', () => {
  for (const c of BUTTONS) {
    test(`${c.name}: the exported button looks and answers like the preview`, async ({ page, context }) => {
      const pkg = await context.newPage();
      await open(page, pkg, c.def());
      const L = inLab(BTN);
      await same(page, pkg, L, BTN, 'rest');
      if (c.disabled) return;
      // Hover.
      await page.locator(L).hover();
      await pkg.locator(BTN).hover();
      await same(page, pkg, L, BTN, 'hover');
      // Pressed.
      for (const [p, sel] of [[page, L], [pkg, BTN]] as const) {
        const box = (await p.locator(sel).boundingBox())!;
        await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await p.mouse.down();
      }
      await same(page, pkg, L, BTN, 'pressed');
      await page.mouse.up();
      await pkg.mouse.up();
      await page.mouse.move(2, 2);
      await pkg.mouse.move(2, 2);
      // Keyboard focus: the ring of the definition.
      for (const [p, sel] of [[page, L], [pkg, BTN]] as const) {
        await focusWithKeyboard(p, sel);
      }
      await same(page, pkg, L, BTN, 'focus');
    });
  }
});

const BARS: { name: string; def: () => ComponentDefinition }[] = [
  { name: 'Glass', def: () => navbar('Fidelity bar glass', (d) => d) },
  { name: 'Solid', def: () => navbar('Fidelity bar solid', solid) },
  {
    name: 'Solid with a breakpoint, a disabled tab and tabs-semantics',
    def: () =>
      navbar('Fidelity bar custom', (d) => {
        let x = solid(d);
        const added = addBreakpoint(navbarView(x), 2000);
        x = applyNavbarView(x, updateBreakpoint(added.root, added.id, { set: ['layout.labels', 'active'] }));
        x = { ...x, content: { ...x.content, profile: { ...x.content.profile, disabled: true } }, interactions: { ...x.interactions, behavior: { ...x.interactions.behavior, semantics: 'tabs' } } };
        return x;
      }),
  },
];

test.describe('mobile navbar', () => {
  for (const c of BARS) {
    test(`${c.name}: the exported bar looks and answers like the preview`, async ({ page, context }) => {
      const pkg = await context.newPage();
      await open(page, pkg, c.def());
      const L = inLab(BAR);
      await same(page, pkg, L, BAR, 'rest');
      // Select another tab in both: the active state and the indicator follow.
      await page.locator(`${L} ${TAB}`).nth(1).click();
      await pkg.locator(`${BAR} ${TAB}`).nth(1).click();
      await same(page, pkg, L, BAR, 'selected');
      // Hover another tab, then press it.
      await page.locator(`${L} ${TAB}`).nth(0).hover();
      await pkg.locator(`${BAR} ${TAB}`).nth(0).hover();
      await same(page, pkg, L, BAR, 'hover');
      for (const [p, sel] of [[page, `${L} ${TAB}`], [pkg, `${BAR} ${TAB}`]] as const) {
        const box = (await p.locator(sel).nth(0).boundingBox())!;
        await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await p.mouse.down();
      }
      await same(page, pkg, L, BAR, 'pressed');
      await page.mouse.up();
      await pkg.mouse.up();
      await page.mouse.move(2, 2);
      await pkg.mouse.move(2, 2);
      // Keyboard focus on the active tab.
      await page.locator(`${L} ${TAB}`).nth(1).focus();
      await pkg.locator(`${BAR} ${TAB}`).nth(1).focus();
      await page.keyboard.press('ArrowRight');
      await pkg.keyboard.press('ArrowRight');
      await same(page, pkg, L, BAR, 'focus');
    });
  }
});
