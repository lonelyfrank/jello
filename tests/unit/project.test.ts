import { describe, expect, it } from 'vitest';
import { createGlassDocument, glassParams, withGlassParams } from '../../src/model';
import { componentTemplate } from '../../src/components/document';
import { contrast, formatHsl, formatOklch, grade, oklchToRgb, parseColor, rgbToOklch, hexToRgb } from '../../src/project/color';
import { kitAssets, minimalAssets } from '../../src/project/defaults';
import { createProject, parseProject, serializeProject, tokenFor, uniqueName, uniqueToken } from '../../src/project/document';
import { collect, findConflicts, inspectFile, mergeAssets } from '../../src/project/importer';
import { buildProjectPackage, cssVariables, packageBytes, readProjectEntries, readZip, usedIconNames } from '../../src/project/package';

const project = () => createProject({ id: 'p1', name: 'Kit glass', platform: 'both', assets: kitAssets(), at: '2026-10-30T10:00:00.000Z' });
const material = (name: string, blur = 6) => {
  const d = createGlassDocument({ id: `m-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, name });
  return withGlassParams(d, { ...glassParams(d), blur });
};

describe('colour', () => {
  it('reads hex, rgb, hsl and oklch in modern and legacy syntax', () => {
    expect(parseColor('#7C4DEB')?.hex).toBe('#7c4deb');
    expect(parseColor('7c4deb')?.hex).toBe('#7c4deb');
    expect(parseColor('#fff')?.hex).toBe('#ffffff');
    expect(parseColor('rgb(124 77 235)')?.hex).toBe('#7c4deb');
    expect(parseColor('rgba(124, 77, 235, 0.5)')).toMatchObject({ hex: '#7c4deb', alpha: 0.5 });
    // HSL rounds to whole degrees and percents: within one step of the source colour.
    expect(parseColor('hsl(258 80% 61%)')?.hex).toMatch(/^#7c4[c-d]eb$/);
    expect(parseColor('rgb(124 77 235 / 40%)')?.alpha).toBeCloseTo(0.4);
    expect(parseColor('oklch(0.56 0.28 292)')?.format).toBe('oklch');
    expect(parseColor('#7C4DZ')).toBeNull();
    expect(parseColor('')).toBeNull();
  });

  it('round-trips through oklch and flags colours outside sRGB', () => {
    const o = rgbToOklch(hexToRgb('#7c4deb'));
    const back = oklchToRgb(o);
    expect(back.inGamut).toBe(true);
    expect(back.rgb).toEqual(hexToRgb('#7c4deb'));
    expect(oklchToRgb({ l: 0.56, c: 0.4, h: 292 }).inGamut).toBe(false);
    expect(formatHsl('#7c4deb')).toBe('hsl(258 80% 61%)');
    expect(formatOklch('#7c4deb')).toMatch(/^oklch\(0\.\d\d 0\.\d\d \d+\)$/);
  });

  it('computes WCAG contrast like the design asset page', () => {
    expect(contrast('#7c4deb', '#ffffff')).toBeCloseTo(5.1, 1);
    expect(grade(contrast('#7c4deb', '#ffffff'))).toBe('AA');
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 0);
    expect(grade(3.2)).toBe('large');
    expect(grade(2)).toBe('fail');
  });
});

describe('project document', () => {
  it('serializes and parses back the same project', () => {
    const p = project();
    const r = parseProject(JSON.parse(serializeProject(p)));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.doc).toEqual(p);
  });

  it('refuses invalid or newer documents as a whole', () => {
    expect(parseProject(null).ok).toBe(false);
    expect(parseProject({ ...project(), schemaVersion: 99 })).toMatchObject({ ok: false });
    const bad = project();
    bad.assets.palettes[0]!.colors[0]!.hex = 'rosso';
    expect(parseProject(JSON.parse(JSON.stringify(bad))).ok).toBe(false);
  });

  it('derives tokens and unique names', () => {
    expect(tokenFor('Viola Jello')).toBe('--jello-viola-jello');
    expect(tokenFor('Più chiaro!')).toBe('--jello-piu-chiaro');
    expect(uniqueToken('--jello-viola', new Set(['--jello-viola', '--jello-viola-2']))).toBe('--jello-viola-3');
    expect(uniqueName('Navbar BT', new Set(['Navbar BT']))).toBe('Navbar BT 2');
    expect(uniqueName('Navbar BT 2', new Set(['Navbar BT 2']))).toBe('Navbar BT 3');
  });
});

describe('.jello package', () => {
  it('round-trips materials, components and assets through a real ZIP', async () => {
    const comp = componentTemplate('bottom-navigation')!.create();
    const files = buildProjectPackage(project(), { materials: [material('Glass personale')], components: [comp], colors: true, icons: 'used', fonts: true });
    const paths = files.map((f) => f.path);
    expect(paths).toContain('progetto.json');
    expect(paths).toContain('materiali/glass-personale.json');
    expect(paths.some((p) => p.startsWith('componenti/'))).toBe(true);
    expect(paths).toContain('asset/token.json');
    const entries = await readZip(packageBytes(files));
    const r = readProjectEntries(entries);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.materials.map((m) => m.doc.name)).toEqual(['Glass personale']);
    expect(r.value.components).toHaveLength(1);
    expect(r.value.project.name).toBe('Kit glass');
    // Only the icons the component uses are kept.
    const used = usedIconNames([comp]);
    expect(r.value.project.assets.iconSets[0]!.icons.map((i) => i.name).sort()).toEqual([...used].sort());
  });

  it('is deterministic and rejects broken or unsafe archives', async () => {
    const a = packageBytes(buildProjectPackage(project(), { materials: [], components: [], colors: true, icons: 'none', fonts: false }));
    const b = packageBytes(buildProjectPackage(project(), { materials: [], components: [], colors: true, icons: 'none', fonts: false }));
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
    await expect(readZip(new Uint8Array([1, 2, 3, 4]))).rejects.toThrow(/ZIP/);
    expect(readProjectEntries([]).ok).toBe(false);
  });

  it('writes CSS variables for colours and type', () => {
    const css = cssVariables(kitAssets(), 'Kit glass');
    expect(css).toContain('--jello-viola: #7c4deb;');
    expect(css).toContain('--jello-titolo: 600 24px/30px "Inter", sans-serif;');
    expect(css).toContain('fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700');
  });
});

describe('import', () => {
  const enc = (s: string) => new TextEncoder().encode(s);

  it('classifies files and rejects a partial material as a whole', async () => {
    const good = JSON.stringify(createGlassDocument({ id: 'x', name: 'Navbar BT' }));
    expect((await inspectFile('glass-bt.json', enc(good))).kind).toBe('material');
    const broken = await inspectFile('glass-rotto.json', enc('{"format":"jello-glass","schemaVersion":1,"material":{"blur":64}}'));
    expect(broken.kind).toBe('rejected');
    expect((await inspectFile('x.json', enc('{nope'))).kind).toBe('rejected');
    expect((await inspectFile('x.png', enc('x'))).kind).toBe('unsupported');
    const svg = await inspectFile('casa.svg', enc('<svg viewBox="0 0 24 24"><path d="M4 11l8-7 8 7v9H4z" stroke="currentColor" fill="none"/></svg>'));
    expect(svg.kind).toBe('icon');
    expect((await inspectFile('evil.svg', enc('<svg viewBox="0 0 24 24"><script>alert(1)</script></svg>'))).kind).toBe('rejected');
    expect((await inspectFile('f.woff2', enc('not a font'))).kind).toBe('rejected');
  });

  it('finds conflicts and keeps both, replaces or skips as chosen', async () => {
    const existing = { materials: [{ id: 'user-1', name: 'Navbar BT', doc: material('Navbar BT', 10) }], components: [], assets: kitAssets() };
    const incomingDoc = JSON.stringify(material('Navbar BT', 14));
    const items = [await inspectFile('glass-bt.json', enc(incomingDoc))];
    const inc = collect(items);
    const conflicts = findConflicts(inc, existing);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ kind: 'material', existing: 'user-1', detail: '1 parametro diverso' });

    // A colour whose value differs conflicts; an identical one does not.
    const pkg = readProjectEntries(await readZip(packageBytes(buildProjectPackage(project(), { materials: [], components: [], colors: true, icons: 'none', fonts: false }))));
    expect(pkg.ok).toBe(true);
    if (!pkg.ok) return;
    const changed = structuredClone(pkg.value);
    changed.project.assets.palettes[0]!.colors[0]!.hex = '#7b4ce8';
    const colorInc = collect([{ kind: 'project', file: 'kit.jello', size: 1, pkg: changed, warnings: [] }]);
    const cc = findConflicts(colorInc, { ...existing, assets: kitAssets() });
    expect(cc.filter((c) => c.kind === 'color')).toHaveLength(1);
    expect(cc[0]!.detail).toBe('#7C4DEB → #7B4CE8');

    const key = cc[0]!.key;
    const keepMine = mergeAssets(kitAssets(), colorInc, { [key]: 'skip' });
    expect(keepMine.assets.palettes[0]!.colors[0]!.hex).toBe('#7c4deb');
    expect(keepMine.skipped.colors).toBeGreaterThan(0);
    const both = mergeAssets(kitAssets(), colorInc, { [key]: 'both' });
    const tokens = both.assets.palettes.flatMap((p) => p.colors.map((c) => c.token));
    expect(tokens).toContain('--jello-viola-2');
    expect(new Set(tokens).size).toBe(tokens.length);
  });

  it('starts a minimal project with the brand palette and interface fonts', () => {
    const a = minimalAssets();
    expect(a.palettes.map((p) => p.name)).toEqual(['Brand Jello']);
    expect(a.fonts.length).toBe(3);
  });
});

describe('asset edits', () => {
  it('adds colours with a unique token and refuses a taken one', async () => {
    const { addColor, addPalette, tokenProblem, updateColor, removeColor, removePalette, removeFont, addTypeStyle } = await import('../../src/project/assets');
    const a = kitAssets();
    const r = addColor(a, a.palettes[0]!.id);
    const c = r.assets.palettes[0]!.colors.at(-1)!;
    expect(c.token).toBe('--jello-nuovo-colore');
    const again = addColor(r.assets, a.palettes[0]!.id);
    expect(again.assets.palettes[0]!.colors.at(-1)!.token).toBe('--jello-nuovo-colore-2');
    expect(tokenProblem(r.assets, '--jello-viola', c.id)).toMatch(/già usato/);
    expect(tokenProblem(r.assets, '--jello-viola', 'c-viola')).toBeNull();
    expect(tokenProblem(r.assets, 'viola', c.id)).toMatch(/inizia con --/);
    expect(updateColor(r.assets, c.id, { hex: '#112233' }).palettes[0]!.colors.at(-1)!.hex).toBe('#112233');
    expect(removeColor(r.assets, c.id).palettes[0]!.colors.some((x) => x.id === c.id)).toBe(false);
    const np = addPalette(a, 'Brand Jello');
    expect(a.palettes.map((p) => p.name)).toContain('Brand Jello');
    expect(np.assets.palettes.at(-1)!.name).toBe('Brand Jello 2');
    expect(removePalette(np.assets, np.id).palettes).toHaveLength(a.palettes.length);
    // Removing a font re-points the styles that used it.
    const f = removeFont(a, 'f-fredoka');
    expect(f.typeStyles.find((t) => t.id === 't-display')!.family).toBe('f-inter');
    const ts = addTypeStyle(a, 'Didascalia');
    expect(ts.assets.typeStyles.at(-1)!.token).toBe('--jello-didascalia');
  });

  it('finds the colour a component uses and the fixed colours of an icon', async () => {
    const { colorUsage, fixedColor, toCurrentColor, warningFor, iconUsage } = await import('../../src/project/assets');
    const comp = componentTemplate('bottom-navigation')!.create();
    expect(iconUsage([comp], 'home')[0]).toContain('Bottom Navigation · tab Home');
    expect(iconUsage([comp], 'nope')).toEqual([]);
    const body = '<circle cx="12" cy="12" r="8" fill="none" stroke="#E8553F"/>';
    expect(fixedColor(body)).toBe('#E8553F');
    expect(toCurrentColor(body)).toBe('<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor"/>');
    expect(warningFor(toCurrentColor(body))).toBeNull();
    expect(warningFor(body)).toContain('#E8553F');
    expect(colorUsage([comp], '#000001')).toEqual([]);
  });
});
