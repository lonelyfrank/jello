/**
 * The material inspector as data: one contract for every family. If a family
 * registers descriptors, it gets a panel for free; Glass and Solid are
 * described, read and edited by exactly the same code.
 */
import { describe, expect, it } from 'vitest';
import { applyControl, inspectorModel, MATERIALS, controlGroups, type InspectorControl, type MaterialDefinition } from '../../src/model';
import type { ParamFieldProps } from '../../src/lab/app/ParamField';
import { SOLID_PARAMS } from '../../src/model';
import { PARAMS } from '../../src/core/params';

const families = () => MATERIALS.list();
const docOf = (def: MaterialDefinition) => def.create('inspect-1', 'Inspect');

/** A valid value different from the current one. */
function other(c: InspectorControl): number | string {
  if (c.kind === 'slider') return c.value === c.max ? (c.min as number) : (c.max as number);
  if (c.kind === 'select') return c.options!.find((o) => o.value !== c.value)!.value;
  return c.value === '#123456' ? '#654321' : '#123456';
}

// Type-level proof, checked by tsc: the one parameter field accepts the descriptors of both families.
const _glass: ParamFieldProps['d'] = PARAMS[0]!;
const _solid: ParamFieldProps['d'] = SOLID_PARAMS[0]!;
void _glass;
void _solid;

describe('inspector model', () => {
  it.each(families().map((d) => d.id))('%s: every parameter appears exactly once, grouped as the registry says, with everything a control needs', (id) => {
    const def = MATERIALS.get(id)!;
    const m = inspectorModel(def, docOf(def));
    expect(m).toMatchObject({ family: id, name: def.name });
    expect(m.groups.map((g) => g.id)).toEqual(controlGroups(def).map((g) => g.id));
    const all = m.groups.flatMap((g) => g.controls);
    expect(all.map((c) => c.key).sort()).toEqual(def.params.map((d) => d.key).sort());
    for (const g of m.groups) {
      expect(g.label.length).toBeGreaterThan(0);
      for (const c of g.controls) {
        expect(c.group, c.key).toBe(g.id);
        expect(c.label.length, c.key).toBeGreaterThan(0);
        expect(c.description.length, c.key).toBeGreaterThan(0);
        expect(c.stage.length, c.key).toBeGreaterThan(0);
        expect(['slider', 'select', 'color']).toContain(c.kind);
        if (c.kind === 'slider') {
          expect(c.min! < c.max!, c.key).toBe(true);
          expect(c.step! > 0, c.key).toBe(true);
          expect(typeof c.unit, c.key).toBe('string');
          expect(typeof c.value).toBe('number');
        }
        if (c.kind === 'select') expect(c.options!.map((o) => o.value), c.key).toContain(c.value);
        if (c.kind === 'color') expect(c.value, c.key).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
    expect(m.features).toBe(def.features);
    expect(m.interactions).toBe(def.interactions);
  });

  it('shows the values of the document, not the defaults', () => {
    const solid = MATERIALS.get('solid')!;
    const doc = applyControl(solid, docOf(solid), { key: 'fill' }, '#abcdef');
    expect(doc.ok).toBe(true);
    if (!doc.ok) return;
    const m = inspectorModel(solid, doc.doc);
    const fill = m.groups.flatMap((g) => g.controls).find((c) => c.key === 'fill')!;
    expect(fill.value).toBe('#abcdef');
    expect(fill.default).toBe('#f1f3f5');
    const glass = MATERIALS.get('glass')!;
    const navbar = glass.presets.find((p) => p.doc.id === 'navbar')!.doc;
    expect(inspectorModel(glass, navbar).groups.flatMap((g) => g.controls).find((c) => c.key === 'refraction')!.value).toBe(10);
  });

  it('both families expose the same contract: the same control fields, differing only in content', () => {
    const shape = (c: InspectorControl) => Object.keys(c).filter((k) => !['state', 'overridden'].includes(k)).sort().join();
    const kinds = new Set(families().flatMap((d) => inspectorModel(d, docOf(d)).groups.flatMap((g) => g.controls.map((c) => c.kind))));
    expect([...kinds].sort()).toEqual(['color', 'select', 'slider']);
    for (const kind of kinds) {
      const shapes = new Set(families().flatMap((d) => inspectorModel(d, docOf(d)).groups.flatMap((g) => g.controls.filter((c) => c.kind === kind).map(shape))));
      expect(shapes.size, kind).toBe(1);
    }
  });
});

describe('editing through the contract', () => {
  it.each(families().map((d) => d.id))('%s: every control can be changed, and the document reads back exactly that', (id) => {
    const def = MATERIALS.get(id)!;
    for (const c of inspectorModel(def, docOf(def)).groups.flatMap((g) => g.controls)) {
      const v = other(c);
      const r = applyControl(def, docOf(def), { key: c.key }, v);
      expect(r.ok, c.key).toBe(true);
      if (!r.ok) continue;
      expect(def.read(r.doc).params[c.key], c.key).toBe(v);
      // Nothing else moved.
      const before = def.read(docOf(def)).params;
      const after = def.read(r.doc).params;
      for (const k of Object.keys(before)) if (k !== c.key) expect(after[k], `${c.key} → ${k}`).toEqual(before[k]);
      // And the result is a valid document of the family.
      expect(def.parse(JSON.parse(def.serialize(r.doc))).ok, c.key).toBe(true);
    }
  });

  it('refuses invalid values, unknown keys and a document of another family, with a reason', () => {
    const solid = MATERIALS.get('solid')!;
    const glass = MATERIALS.get('glass')!;
    expect(applyControl(solid, docOf(solid), { key: 'elevation' }, 9)).toEqual({ ok: false, error: 'elevation: 9 fuori intervallo [0, 5]' });
    expect(applyControl(solid, docOf(solid), { key: 'fill' }, 'red')).toEqual({ ok: false, error: 'fill: atteso un colore #rrggbb' });
    expect(applyControl(solid, docOf(solid), { key: 'band' }, 4)).toMatchObject({ ok: false, error: expect.stringMatching(/sconosciuto per Solid/) });
    expect(applyControl(solid, docOf(glass), { key: 'fill' }, '#000000')).toMatchObject({ ok: false, error: expect.stringMatching(/famiglia «glass»/) });
    expect(applyControl(glass, docOf(glass), { key: 'refraction' }, Infinity)).toMatchObject({ ok: false });
    expect(applyControl(glass, docOf(glass), { key: 'refraction', state: 'hover' }, 10)).toMatchObject({ ok: false });
  });

  it('normalises colors to lower case, as the documents do', () => {
    const solid = MATERIALS.get('solid')!;
    const r = applyControl(solid, docOf(solid), { key: 'fill' }, '#ABCDEF');
    expect(r.ok && solid.read(r.doc).params.fill).toBe('#abcdef');
  });
});

describe('per-state controls', () => {
  it('Solid lists the overrides of each state it renders, saying which are the document’s and which are inherited', () => {
    const solid = MATERIALS.get('solid')!;
    const m = inspectorModel(solid, docOf(solid));
    expect(m.states.map((s) => s.state)).toEqual(['hover', 'pressed', 'active', 'disabled']);
    const hover = m.states[0]!;
    expect(hover.controls.map((c) => c.key)).toEqual(['fill', 'foreground', 'borderColor', 'elevation', 'scale', 'opacity']);
    const byKey = Object.fromEntries(hover.controls.map((c) => [c.key, c]));
    expect(byKey.fill).toMatchObject({ overridden: true, value: '#e7eaee', group: 'states', state: 'hover' });
    // Not overridden: inherits the material's value (shared key) or the neutral default (state-only key).
    expect(byKey.foreground).toMatchObject({ overridden: false, value: '#111827' });
    expect(byKey.scale).toMatchObject({ overridden: false, value: 1, min: 0.9, max: 1.1 });
  });

  it('every state control can be changed and reads back', () => {
    const solid = MATERIALS.get('solid')!;
    for (const s of inspectorModel(solid, docOf(solid)).states) {
      for (const c of s.controls) {
        const v = other(c);
        const r = applyControl(solid, docOf(solid), { key: c.key, state: s.state }, v);
        expect(r.ok, `${s.state}.${c.key}`).toBe(true);
        if (!r.ok) continue;
        const again = inspectorModel(solid, r.doc).states.find((x) => x.state === s.state)!.controls.find((x) => x.key === c.key)!;
        expect(again, `${s.state}.${c.key}`).toMatchObject({ value: v, overridden: true });
      }
    }
    expect(applyControl(solid, docOf(solid), { key: 'scale', state: 'hover' }, 2)).toMatchObject({ ok: false });
    expect(applyControl(solid, docOf(solid), { key: 'fill', state: 'default' as never }, '#000000')).toMatchObject({ ok: false });
  });

  it('Glass has no per-state values: its state is press feedback, tuned by the motion group', () => {
    const glass = MATERIALS.get('glass')!;
    expect(inspectorModel(glass, docOf(glass)).states).toEqual([]);
    expect(inspectorModel(glass, docOf(glass)).groups.find((g) => g.id === 'motion')!.controls.map((c) => c.key)).toEqual(expect.arrayContaining(['pressScale', 'pressRefraction', 'pressLight']));
  });
});
