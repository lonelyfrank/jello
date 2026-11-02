/**
 * SVG trust boundary: icon markup from a `.jello` file, from IndexedDB or
 * from a component definition is untrusted. Every payload here is inert
 * (it would only call a missing global); the tests check that none of it
 * survives validation, and that valid icons keep working.
 */
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { checkIconRef, parseSvgBody, validateSvgBody } from '../../src/components/icons';
import { kitAssets } from '../../src/project/defaults';
import { createProject, parseProject, serializeProject } from '../../src/project/document';
import { inspectFile } from '../../src/project/importer';
import { buildProjectPackage, iconSvg, packageBytes, readProjectEntries, readZip } from '../../src/project/package';
import type { IconAsset, ProjectDoc } from '../../src/project/types';
import { openRepository } from '../../src/lab/storage/repository';

const HOSTILE: [string, string][] = [
  ['event attribute', '<path d="M0 0h4" onload="__pwned()"/>'],
  ['event attribute, mixed case', '<path d="M0 0h4" OnClick="__pwned()"/>'],
  ['script element', '<script>__pwned()</script><path d="M0 0h4"/>'],
  ['namespaced script', '<svg:script>__pwned()</svg:script>'],
  ['foreignObject with HTML', '<foreignObject><img src="x" onerror="__pwned()"/></foreignObject>'],
  ['nested svg', '<svg onload="__pwned()"><path d="M0 0h4"/></svg>'],
  ['image element', '<image href="https://example.invalid/x.png"/>'],
  ['use with external href', '<use href="https://example.invalid/sprite.svg#a"/>'],
  ['xlink:href javascript', '<a xlink:href="javascript:__pwned()"><path d="M0 0h4"/></a>'],
  ['style attribute', '<path d="M0 0h4" style="fill:url(https://example.invalid/x)"/>'],
  ['url() paint', '<path d="M0 0h4" fill="url(#x)"/>'],
  ['style element', '<style>path{fill:url(https://example.invalid/x)}</style><path d="M0 0h4"/>'],
  ['entity', '<path d="M0 0h4" fill="&#x6a;avascript"/>'],
  ['CDATA', '<![CDATA[<script>__pwned()</script>]]>'],
  ['unclosed markup', '<path d="M0 0h4"'],
  ['raw HTML', '<img src=x onerror=__pwned()>'],
  ['attribute value breaking out', '<path d="M0 0h4"/><path d=\'M0 0" onload="__pwned()\'/>'],
  ['text node', 'hello<path d="M0 0h4"/>'],
];

const deep = (n: number) => '<g>'.repeat(n) + '<path d="M0 0h4"/>' + '</g>'.repeat(n);

describe('validateSvgBody', () => {
  it.each(HOSTILE)('refuses %s', (_, body) => {
    const r = validateSvgBody('0 0 24 24', body);
    expect(r.ok).toBe(false);
  });

  it('refuses view boxes that would add attributes to the wrapper', () => {
    for (const vb of ['0 0 24 24" onload="__pwned()', '0 0 24', '0 0 -1 24', 'a b c d', '0 0 24 24 24', '']) {
      expect(validateSvgBody(vb, '<path d="M0 0h4"/>').ok, vb).toBe(false);
      expect(parseSvgBody(vb, '<path d="M0 0h4"/>').ok, vb).toBe(false);
    }
  });

  it('refuses non-strings, excessive depth and too many nodes', () => {
    expect(validateSvgBody(null, '<path d="M0 0h4"/>').ok).toBe(false);
    expect(validateSvgBody('0 0 24 24', { toString: () => '<path/>' }).ok).toBe(false);
    expect(validateSvgBody('0 0 24 24', deep(40)).ok).toBe(false);
    expect(validateSvgBody('0 0 24 24', '<path d="M0 0h4"/>'.repeat(600)).ok).toBe(false);
  });

  it('keeps a valid icon and returns its canonical form', () => {
    const r = validateSvgBody('0 0 24 24', '<path   d="M4 10.6 12 4l8 6.6"  stroke-linecap="round" /><circle cx="12" cy="12" r="3"/>');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.body).toBe('<path d="M4 10.6 12 4l8 6.6" stroke-linecap="round"/><circle cx="12" cy="12" r="3"/>');
    expect(r.warnings).toContain('SVG normalizzato');
    // Canonical input validates to itself, without warnings.
    const again = validateSvgBody(r.viewBox, r.body);
    expect(again.ok && again.body).toBe(r.body);
    expect(again.ok && again.warnings).toEqual([]);
  });

  it('a component icon reference with hostile markup is an error, not a warning', () => {
    const errors: string[] = [];
    checkIconRef({ kind: 'svg', name: 'x', viewBox: '0 0 24 24', body: HOSTILE[0]![1], paint: 'stroke' }, 'tab', errors, []);
    expect(errors.length).toBeGreaterThan(0);
  });
});

const withIcons = (icons: Partial<IconAsset>[]): ProjectDoc => {
  const p = createProject({ id: 'p-svg', name: 'Icone', assets: kitAssets(), at: '2026-10-30T10:00:00.000Z' });
  const set = { id: 'set-up', name: 'Caricate', builtin: false, icons: icons.map((i, n) => ({ id: `ic-${n}`, name: `icona-${n}`, viewBox: '0 0 24 24', body: '<path d="M0 0h4"/>', paint: 'stroke' as const, warning: null, ...i })) };
  return { ...p, assets: { ...p.assets, iconSets: [...p.assets.iconSets, set] } };
};

describe('project documents carry only allowlisted icons', () => {
  it('puts hostile icons in quarantine and keeps the rest of the project', () => {
    const doc = withIcons([{ body: '<path d="M1 1h4"/>' }, { body: HOSTILE[0]![1] }, { body: HOSTILE[4]![1] }, { viewBox: '0 0 24 24" onload="__pwned()' }]);
    const r = parseProject(JSON.parse(serializeProject(doc)));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const up = r.doc.assets.iconSets.find((s) => s.id === 'set-up')!;
    expect(up.icons.map((i) => i.name)).toEqual(['icona-0']);
    expect(r.quarantined).toHaveLength(3);
    // The built-in set and the palettes are untouched.
    expect(r.doc.assets.iconSets[0]!.icons.length).toBe(doc.assets.iconSets[0]!.icons.length);
    expect(r.doc.assets.palettes).toEqual(doc.assets.palettes);
    expect(JSON.stringify(r.doc)).not.toMatch(/__pwned|onload|foreignObject/);
  });

  it('a .jello package with a hostile icon imports without it and says so', async () => {
    const doc = withIcons([{ body: '<path d="M1 1h4"/>' }]);
    const files = buildProjectPackage(doc, { materials: [], components: [], colors: true, icons: 'all', fonts: false });
    // Tamper with progetto.json after export, as a crafted file would.
    const main = files.find((f) => f.path === 'progetto.json')!;
    const json = JSON.parse(new TextDecoder().decode(main.data));
    json.assets.iconSets.at(-1).icons[0].body = '<image href="x" onerror="__pwned()"/>';
    main.data = new TextEncoder().encode(JSON.stringify(json));
    const item = await inspectFile('ostile.jello', packageBytes(files));
    expect(item.kind).toBe('project');
    if (item.kind !== 'project') return;
    expect(item.pkg.project.assets.iconSets.flatMap((s) => s.icons).some((i) => /onerror|image/.test(i.body))).toBe(false);
    expect(item.warnings.join(' ')).toMatch(/rimossa/);
    const entries = readProjectEntries(await readZip(packageBytes(files)));
    expect(entries.ok && entries.value.warnings.length).toBe(1);
  });

  it('a project already in IndexedDB with a hostile icon is read without it and reported', async () => {
    const factory = new IDBFactory();
    const repo = await openRepository(factory, 'jello-svg');
    // Written as an older or tampered version would have: the repository stores what it is given.
    await repo.putProjectDoc(withIcons([{ body: '<path d="M1 1h4"/>' }, { name: 'trappola', body: '<script>__pwned()</script>' }]));
    repo.close();
    const again = await openRepository(factory, 'jello-svg');
    const read = await again.listProjectDocs();
    expect(read.items).toHaveLength(1);
    const icons = read.items[0]!.assets.iconSets.find((s) => s.id === 'set-up')!.icons;
    expect(icons.map((i) => i.name)).toEqual(['icona-0']);
    expect(read.skipped.join(' ')).toMatch(/trappola.*rimossa/);
  });

  it('exported .svg files never carry refused markup', () => {
    const svg = iconSvg({ id: 'x', name: 'x', viewBox: '0 0 24 24" onload="__pwned()', body: '<script>__pwned()</script>', paint: 'fill', warning: null });
    expect(svg).not.toMatch(/__pwned|script|onload/);
    expect(iconSvg({ id: 'y', name: 'y', viewBox: '0 0 24 24', body: '<path d="M0 0h4"/>', paint: 'stroke', warning: null })).toContain('<path d="M0 0h4"/>');
  });
});

describe('attribute names that exist on Object.prototype', () => {
  // `ATTRS[k]` on a plain object finds inherited members: the parser used to
  // call `.test` on a function and throw, which crashed rendering of a stored icon.
  for (const name of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf']) {
    it(`${name} is dropped, not thrown on (inner element and root)`, () => {
      const inner = validateSvgBody('0 0 24 24', `<path ${name}="x" d="M0 0h4"/>`);
      expect(inner.ok).toBe(true);
      if (inner.ok) expect(inner.body).toBe('<path d="M0 0h4"/>');
      expect(() => parseSvgBody('0 0 24 24', `<g ${name}="x"><path d="M0 0h4"/></g>`)).not.toThrow();
    });
  }

  it('an icon name inherited from Object.prototype is not a built-in', () => {
    const errors: string[] = [];
    const warnings: string[] = [];
    expect(checkIconRef({ kind: 'builtin', name: 'constructor' }, 'x', errors, warnings)).toEqual({ kind: 'builtin', name: 'star' });
    expect(warnings).toHaveLength(1);
  });
});
