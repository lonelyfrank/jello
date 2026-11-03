/**
 * M6.4.1 material catalog: identity vs presentation, honest capabilities, legacy compatibility.
 * The catalog describes presets; it never changes a stored document, id or revision.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PRESETS } from '../../src/core/presets';
import { bindMaterial, bindingState, materialRevision } from '../../src/components';
import { importComponentText } from '../../src/migration';
import {
  BUILTIN_MATERIALS, FAMILIES, MATERIALS, SOLID_PRESETS, createGlassDocument, familyInfo, parseMaterialText, serializeMaterial,
} from '../../src/model';
import {
  CATALOG, EFFECTS, PRESET_DISPLAY_NAMES, TREATMENTS, availabilityLabel, catalogByFamily, catalogByKind, catalogEntry, effectInfo,
  entryMeta, familyLabel, presetDisplayName, treatmentInfo, usedEffects, validateCatalog, type MaterialCatalogEntry,
} from '../../src/model/catalog';
import { JELLY_CANDIDATE_PRESETS } from '../../src/model/experimental/jelly-presets';
import { JELLY_PARAMS, JELLY_STATE_PARAMS } from '../../src/model/experimental/jelly';

const STABLE_PRESET_IDS = ['jello', 'optics', 'satin', 'deep', 'navbar', 'solid-neutral', 'solid-dark', 'solid-accent', 'solid-outline'];
/** `materialRevision` of every built-in preset, computed at M6.4 (8e077bd), before any rename. */
const REVISIONS_AT_M64: Record<string, string> = {
  jello: 'fdf3b5bf', optics: 'b1d3fbf4', satin: 'e23b94ef', deep: 'ba0b7bac', navbar: '3ba35a63',
  'solid-neutral': 'ffa68551', 'solid-dark': 'eec5ff3c', 'solid-accent': 'bed47a5a', 'solid-outline': '9fc94d0d',
};

describe('catalog consistency', () => {
  it('has no problems', () => {
    expect(validateCatalog()).toEqual([]);
  });

  it('has unique ids and display names, each present in names.ts', () => {
    const ids = CATALOG.map((e) => e.presetId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(CATALOG.map((e) => e.displayName)).size).toBe(CATALOG.length);
    for (const e of CATALOG) expect(PRESET_DISPLAY_NAMES[e.presetId]).toBe(e.displayName);
    expect(Object.keys(PRESET_DISPLAY_NAMES).sort()).toEqual([...ids].sort());
  });

  it('names every registered built-in preset, and the documents carry the catalog name (one source for labels)', () => {
    for (const d of MATERIALS.list()) {
      for (const p of d.presets) {
        const e = catalogEntry(p.doc.id);
        expect(e, p.doc.id).toBeDefined();
        expect(e!.familyId).toBe(d.id);
        expect(p.doc.name).toBe(e!.displayName);
      }
    }
    expect(PRESETS.map((p) => p.label)).toEqual(PRESETS.map((p) => catalogEntry(p.id)!.displayName));
    expect(SOLID_PRESETS.map((p) => p.doc.name)).toEqual(SOLID_PRESETS.map((p) => catalogEntry(p.doc.id)!.displayName));
  });

  it('gives the names of the taxonomy', () => {
    expect(Object.fromEntries(CATALOG.map((e) => [e.presetId, e.displayName]))).toEqual({
      jello: 'Glass · Default', satin: 'Glass · Frosted', deep: 'Glass · Refractive', navbar: 'Glass · Subtle', optics: 'Refraction Test',
      'solid-neutral': 'Solid · Matte', 'solid-dark': 'Solid · Dark', 'solid-accent': 'Solid · Accent Blue', 'solid-outline': 'Solid · Outlined',
      'jelly-soft': 'Jello · Soft', 'jelly-clear': 'Jello · Clear', 'jelly-candy': 'Jello · Candy', 'jelly-dense': 'Jello · Dense',
    });
  });

  it('defines every treatment it uses and never reuses a word for two treatments of one family', () => {
    for (const e of CATALOG) expect(treatmentInfo(e.familyId, e.treatment), e.presetId).toBeDefined();
    for (const table of Object.values(TREATMENTS)) {
      const labels = Object.values(table).map((t) => t.label);
      expect(new Set(labels).size).toBe(labels.length);
      for (const t of Object.values(table)) expect(t.definition.length).toBeGreaterThan(20);
    }
  });

  it('keeps only the diagnostic configuration out of the designer-facing materials', () => {
    expect(catalogByKind('diagnostic').map((e) => e.presetId)).toEqual(['optics']);
    expect(catalogByKind('material-preset')).toHaveLength(CATALOG.length - 1);
    expect(catalogEntry('optics')!.intendedUse).toEqual(['verification', 'raster-tests']);
  });

  it('classifies availability from the family, with Jello experimental and the family still planned', () => {
    expect(familyInfo('jelly')).toMatchObject({ id: 'jelly', label: 'Jello', status: 'planned' });
    for (const e of catalogByFamily('jelly')) expect(e.availability).toBe('experimental');
    for (const e of [...catalogByFamily('glass'), ...catalogByFamily('solid')]) expect(e.availability).toBe('available');
    expect(availabilityLabel('experimental')).toBe('Sperimentale');
    expect(MATERIALS.has('jelly')).toBe(false);
  });

  it('describes Subtle for navigation surfaces without calling the material «Navbar»', () => {
    const e = catalogEntry('navbar')!;
    expect(e.displayName).toBe('Glass · Subtle');
    expect(e.intendedUse).toEqual(['navigation', 'toolbar', 'overlay']);
    expect(CATALOG.some((c) => /navbar/i.test(c.displayName))).toBe(false);
  });

  it('formats family · treatment · variant without repeating the preset name', () => {
    expect(entryMeta(catalogEntry('satin')!)).toBe('Glass · Frosted');
    expect(entryMeta(catalogEntry('solid-dark')!)).toBe('Solid · Matte · Dark');
    expect(entryMeta(catalogEntry('jelly-candy')!)).toBe('Jello · Gel · Candy');
  });
});

describe('capabilities are the effects a preset really uses', () => {
  const effects = (id: string) => [...catalogEntry(id)!.capabilities].sort();
  it('Glass presets, derived from their own parameters', () => {
    expect(effects('jello')).toEqual(['backdrop-blur', 'drag-motion', 'edge-refraction', 'highlight', 'press-feedback', 'shadow', 'tint']);
    expect(effects('satin')).toEqual(['backdrop-blur', 'drag-motion', 'highlight', 'press-feedback', 'shadow', 'tint']); // refraction is 0
    expect(effects('satin')).not.toContain('edge-refraction');
    expect(effects('deep')).toContain('edge-refraction');
    expect(effects('navbar')).toContain('edge-refraction');
    expect(effects('optics')).toEqual(['drag-motion', 'edge-refraction', 'press-feedback']); // blur, tint, light, shadow at zero
  });
  it('Solid presets have no refraction, backdrop or tint, and Outlined has no shadow', () => {
    for (const id of ['solid-neutral', 'solid-dark', 'solid-accent', 'solid-outline']) {
      for (const no of ['edge-refraction', 'backdrop-blur', 'tint', 'elastic-deformation', 'internal-bubbles']) expect(effects(id), id).not.toContain(no);
    }
    expect(effects('solid-outline')).not.toContain('shadow');
    expect(effects('solid-neutral')).toContain('shadow');
  });
  it('matches usedEffects of the registered documents, and rejects a promise the parameters do not keep', () => {
    for (const d of MATERIALS.list()) for (const p of d.presets) expect([...usedEffects(p.doc)].sort(), p.doc.id).toEqual(effects(p.doc.id));
    const lie = CATALOG.map((e) => (e.presetId === 'satin' ? { ...e, capabilities: [...e.capabilities, 'edge-refraction' as const] } : e));
    expect(validateCatalog(lie).join('|')).toMatch(/satin: capacità dichiarate/);
  });
  it('every effect exists in the family it is declared for (feature of the registry, evidence in the parameters for Jello)', () => {
    for (const e of CATALOG) for (const c of e.capabilities) expect(effectInfo(c)!.requires.families, `${e.presetId}/${c}`).toContain(e.familyId);
    expect(EFFECTS.map((e) => e.id).sort()).toEqual([...new Set(EFFECTS.map((e) => e.id))].sort());
  });
  it('Jello entries match the experimental documents: bubbles, deformation, states — and no refraction or backdrop', () => {
    const keys = new Set(JELLY_PARAMS.map((d) => d.key as string));
    expect(keys.has('refraction')).toBe(false);
    expect(keys.has('blur')).toBe(false);
    const stateKeys = new Set(JELLY_STATE_PARAMS.map((d) => d.key as string));
    expect(JELLY_CANDIDATE_PRESETS.map((p) => p.doc.id).sort()).toEqual(catalogByFamily('jelly').map((e) => e.presetId).sort());
    for (const p of JELLY_CANDIDATE_PRESETS) {
      const e = catalogEntry(p.doc.id)!;
      const caps = new Set<string>(e.capabilities);
      const d = p.doc;
      expect(caps.has('internal-bubbles'), p.doc.id).toBe(d.bubbles.enabled === 'enabled' && d.bubbles.density > 0 && d.bubbles.opacity > 0);
      expect(caps.has('elastic-deformation')).toBe(d.behavior.maxDeformation > 0);
      expect(caps.has('press-feedback')).toBe(d.behavior.press === 'enabled');
      expect(caps.has('shadow')).toBe(d.material.shadowOpacity > 0);
      expect(caps.has('elevation')).toBe(d.material.elevation > 0);
      expect(caps.has('highlight')).toBe(d.material.highlightStrength > 0);
      expect(caps.has('state-styles')).toBe(stateKeys.size > 0 && Object.values(d.states).some((s) => Object.keys(s).length > 0));
      expect(caps.has('edge-refraction') || caps.has('backdrop-blur')).toBe(false);
      expect(p.visuallyVerified).toBe(false);
      expect(e.limitations!.join(' ')).toMatch(/non approvato/);
    }
  });
  it('the variants differ in the parameters their descriptions name', () => {
    const doc = (id: string) => JELLY_CANDIDATE_PRESETS.find((p) => p.doc.id === id)!.doc;
    expect(doc('jelly-clear').material.transmission).toBeGreaterThan(doc('jelly-soft').material.transmission);
    expect(doc('jelly-clear').material.scattering).toBeLessThan(doc('jelly-soft').material.scattering);
    expect(doc('jelly-dense').material.transmission).toBeLessThan(doc('jelly-soft').material.transmission);
    expect(doc('jelly-dense').material.scattering).toBeGreaterThan(doc('jelly-soft').material.scattering);
    expect(doc('jelly-dense').behavior.dampingRatio).toBeGreaterThan(doc('jelly-soft').behavior.dampingRatio);
    expect(doc('jelly-candy').behavior.dampingRatio).toBeLessThan(doc('jelly-soft').behavior.dampingRatio);
    expect(doc('jelly-candy').material.absorption).toBeGreaterThan(doc('jelly-soft').material.absorption);
  });
});

describe('validation catches a bad catalog', () => {
  const base = CATALOG;
  const swap = (id: string, patch: Partial<MaterialCatalogEntry>) => base.map((e) => (e.presetId === id ? ({ ...e, ...patch } as MaterialCatalogEntry) : e));
  it('duplicate id', () => expect(validateCatalog([...base, base[0]!]).join('|')).toMatch(/id duplicato/));
  it('unknown treatment', () => expect(validateCatalog(swap('satin', { treatment: 'glossy' })).join('|')).toMatch(/trattamento «glossy»/));
  it('a family that is not known', () => expect(validateCatalog(swap('satin', { familyId: 'metal' as never })).join('|')).toMatch(/famiglia metal sconosciuta/));
  it('available inside a planned family, experimental inside an available one', () => {
    expect(validateCatalog(swap('jelly-soft', { availability: 'available' })).join('|')).toMatch(/«available» in una famiglia planned/);
    expect(validateCatalog(swap('satin', { availability: 'experimental' })).join('|')).toMatch(/«experimental» in una famiglia già disponibile/);
  });
  it('a capability the family does not have', () => expect(validateCatalog(swap('solid-neutral', { capabilities: ['edge-refraction'] })).join('|')).toMatch(/non esiste nella famiglia solid/));
  it('an effect that is not in the vocabulary', () => expect(validateCatalog(swap('satin', { capabilities: ['volumetric-scattering' as never] })).join('|')).toMatch(/sconosciuto/));
  it('an empty description or a missing intended use', () => {
    expect(validateCatalog(swap('satin', { description: ' ' })).join('|')).toMatch(/descrizione vuota/);
    expect(validateCatalog(swap('satin', { intendedUse: [] })).join('|')).toMatch(/destinazione d’uso/);
  });
  it('a preset left out of the catalog', () => expect(validateCatalog(base.filter((e) => e.presetId !== 'deep')).join('|')).toMatch(/deep: preset glass senza voce di catalogo/));
});

describe('unknown families and ids are never dressed up as known ones', () => {
  it('labels', () => {
    expect(familyLabel('glass')).toBe('Glass');
    expect(familyLabel('solid')).toBe('Solid');
    expect(familyLabel('jelly')).toBe('Jello');
    expect(familyLabel('metal')).toBe('Famiglia sconosciuta');
    expect(familyLabel('constructor')).toBe('Famiglia sconosciuta');
    expect(familyLabel('')).toBe('Famiglia sconosciuta');
  });
  it('lookups', () => {
    expect(catalogEntry('nope')).toBeUndefined();
    expect(catalogEntry('constructor')).toBeUndefined();
    expect(catalogEntry('__proto__')).toBeUndefined();
    expect(catalogEntry(null)).toBeUndefined();
    expect(presetDisplayName('personal-1')).toBeUndefined();
    expect(treatmentInfo('metal', 'matte')).toBeUndefined();
    expect(treatmentInfo('constructor', 'x')).toBeUndefined();
    expect(treatmentInfo('glass', 'toString')).toBeUndefined();
    expect(FAMILIES.map((f) => f.id)).toEqual(['glass', 'solid', 'jelly']);
  });
});

describe('legacy ids, documents and revisions survive the renaming', () => {
  it('keeps every historic preset id and the three family ids', () => {
    expect(BUILTIN_MATERIALS.map((b) => b.doc.id)).toEqual(['jello', 'optics', 'satin', 'deep', 'navbar']);
    expect(SOLID_PRESETS.map((p) => p.doc.id)).toEqual(['solid-neutral', 'solid-dark', 'solid-accent', 'solid-outline']);
    expect(JELLY_CANDIDATE_PRESETS.map((p) => p.doc.id)).toEqual(['jelly-soft', 'jelly-clear', 'jelly-candy', 'jelly-dense']);
    expect(FAMILIES.map((f) => f.id)).toEqual(['glass', 'solid', 'jelly']);
  });

  it('does not rename the experimental documents (their stored name stays the technical one)', () => {
    expect(JELLY_CANDIDATE_PRESETS.map((p) => p.doc.name)).toEqual(['Jelly Soft', 'Jelly Clear', 'Jelly Candy', 'Jelly Dense']);
  });

  it('computes the same content revision as M6.4 for every built-in preset (a rename is not «the preset changed»)', () => {
    for (const d of MATERIALS.list()) for (const p of d.presets) expect(materialRevision(p.doc), p.doc.id).toBe(REVISIONS_AT_M64[p.doc.id]);
    expect(Object.keys(REVISIONS_AT_M64).sort()).toEqual([...STABLE_PRESET_IDS].sort());
  });

  it('a component bound before the rename stays «linked», not «outdated»', () => {
    for (const id of STABLE_PRESET_IDS) {
      const current = MATERIALS.preset(id)!.doc;
      // What an M6.4 component stored: the old name, the old revision.
      const legacyDoc = { ...current, name: ({ jello: 'Jello · iniziale', optics: 'Ottica nuda', satin: 'Satinato', deep: 'Lente marcata', navbar: 'Jello · navbar', 'solid-neutral': 'Solid · neutro', 'solid-dark': 'Solid · scuro', 'solid-accent': 'Solid · accento', 'solid-outline': 'Solid · contorno' } as Record<string, string>)[id]! };
      const binding = { ...bindMaterial(legacyDoc, id), revision: REVISIONS_AT_M64[id]! };
      expect(materialRevision(legacyDoc), id).toBe(REVISIONS_AT_M64[id]);
      expect(bindingState(binding, current), id).toBe('linked');
      // New binding after the rename: same revision, same state.
      expect(bindMaterial(current, id).revision).toBe(REVISIONS_AT_M64[id]);
    }
  });

  it('a personal material that happens to carry a catalog name, or any other name, is hashed as written', () => {
    const copy = { ...MATERIALS.preset('satin')!.doc, id: 'mine-1' };
    expect(materialRevision(copy)).not.toBe(REVISIONS_AT_M64.satin);
    const renamed = createGlassDocument({ id: 'mine-2', name: 'Il mio satinato' });
    expect(parseMaterialText(serializeMaterial(renamed))).toMatchObject({ ok: true, doc: { id: 'mine-2', name: 'Il mio satinato' } });
  });

  it('opens the M6.4 legacy navbar template: the embedded name is data and is not rewritten', () => {
    const raw = readFileSync('tests/fixtures/legacy/bottom-navigation-template.component.json', 'utf8');
    expect(raw).toContain('"name": "Jello · navbar"');
    const r = importComponentText(raw);
    expect(r.ok).toBe(true);
  });

  it('round-trips a stored reference to a preset by id, whatever the display name is', () => {
    for (const id of STABLE_PRESET_IDS) {
      const doc = MATERIALS.preset(id)!.doc;
      const again = parseMaterialText(serializeMaterial(doc));
      expect(again.ok && again.doc.id).toBe(id);
      expect(again.ok && again.doc.meta.basedOn).toBe(id);
    }
  });
});
