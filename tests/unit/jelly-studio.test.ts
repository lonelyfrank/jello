import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';
import { JELLY_PARAMS, defaultJellyParams, jellyParams, parseExperimentalJelly, serializeExperimentalJelly } from '../../src/model/experimental/jelly';
import { JELLY_CANDIDATE_PRESETS } from '../../src/model/experimental/jelly-presets';
import {
  JELLY_BASE_KEYS, JELLY_INSPECTOR, changedJellyKeys, editJellyParam, editJellyState, inspectorCoverage, isJellyDirty, newJellyId,
  personalJellyCopy, randomSeed, resetJellyParam, resetJellyToBase, resetJellyToFactory,
} from '../../src/lab/experimental/jelly/inspector-model';
import { JELLY_DB_NAME, JellyStorageError, MemoryJellyRepository, linkKey, openJellyRepository } from '../../src/lab/experimental/jelly/repository';
import { JellyWorkbench, presetDoc } from '../../src/lab/experimental/jelly/workbench';

const soft = () => presetDoc('jelly-soft')!;
const iso = '2026-11-02T10:00:00.000Z';

describe('Jelly inspector model', () => {
  it('shows every descriptor exactly once and invents none', () => {
    expect(inspectorCoverage()).toEqual({ missing: [], duplicated: [] });
    const keys = new Set(JELLY_PARAMS.map((d) => d.key));
    for (const s of JELLY_INSPECTOR) for (const k of s.keys) expect(keys.has(k), k).toBe(true);
    for (const k of JELLY_BASE_KEYS) expect(keys.has(k), k).toBe(true);
  });

  it('applies a valid edit through the parser and leaves the input untouched', () => {
    const before = soft();
    const r = editJellyParam(before, 'density', 12);
    expect(r.ok && r.doc.bubbles.density).toBe(12);
    expect(before.bubbles.density).toBe(8);
  });

  it('rejects out-of-range, wrong-type and non-integer values without clamping', () => {
    const doc = soft();
    for (const [key, value] of [['bodyOpacity', 1.5], ['dampingRatio', 0.01], ['tint', 'red'], ['density', Number.NaN], ['seed', 1.5], ['enabled', 'maybe']] as const) {
      const r = editJellyParam(doc, key, value);
      expect(r.ok, key).toBe(false);
    }
    expect(jellyParams(doc).bodyOpacity).toBe(0.82);
  });

  it('explains relational errors with the real labels and values', () => {
    const doc = soft();
    const lower = editJellyParam(doc, 'radiusMax', 1);
    expect(lower).toEqual({ ok: false, error: expect.stringMatching(/Raggio massimo \(1\).*Raggio minimo \(2\.5\).*abbassa prima/) });
    const upper = editJellyParam(doc, 'depthMin', 0.95);
    expect(upper).toEqual({ ok: false, error: expect.stringMatching(/Profondità minima \(0\.95\).*Profondità massima \(0\.85\).*alza prima/) });
    expect(editJellyParam(doc, 'radiusMin', 6).ok).toBe(true);
  });

  it('keeps the seed, and only an explicit action changes it', () => {
    const doc = soft();
    const edited = editJellyParam(doc, 'density', 3);
    expect(edited.ok && edited.doc.bubbles.seed).toBe(10631);
    expect(randomSeed(() => 0)).toBe(0);
    expect(randomSeed(() => 0.9999999999)).toBeLessThanOrEqual(4294967295);
    expect(Number.isInteger(randomSeed())).toBe(true);
  });

  it('edits state overrides within the model’s own allow-list', () => {
    const doc = soft();
    const ok = editJellyState(doc, 'hover', 'tint', '#112233');
    expect(ok.ok && ok.doc.states.hover.tint).toBe('#112233');
    expect(editJellyState(doc, 'hover', 'tint', 'nope').ok).toBe(false);
    const cleared = ok.ok ? editJellyState(ok.doc, 'hover', 'tint', undefined) : null;
    expect(cleared?.ok && cleared.doc.states.hover.tint).toBeUndefined();
  });

  it('resets one parameter, all parameters and the factory values separately', () => {
    const base = presetDoc('jelly-candy')!;
    const edited = editJellyParam(base, 'dampingRatio', 1.2);
    if (!edited.ok) throw new Error('edit');
    expect(changedJellyKeys(edited.doc, base)).toEqual(['dampingRatio']);
    expect(isJellyDirty(edited.doc, base)).toBe(true);
    const one = resetJellyParam(edited.doc, base, 'dampingRatio');
    expect(one.ok && isJellyDirty(one.doc, base)).toBe(false);
    expect(isJellyDirty(resetJellyToBase(edited.doc, base), base)).toBe(false);
    const factory = resetJellyToFactory(edited.doc);
    expect(jellyParams(factory)).toEqual(defaultJellyParams());
    expect(factory.id).toBe(edited.doc.id);
  });

  it('personal copies get a new identity and provenance, never the preset id', () => {
    const id = newJellyId(1, () => 0.5);
    const copy = personalJellyCopy(soft(), { id, name: 'Mia gelatina', basedOn: 'jelly-soft', now: iso });
    expect(copy.id).toBe(id);
    expect(copy.id).not.toBe('jelly-soft');
    expect(copy.meta).toMatchObject({ basedOn: 'jelly-soft', createdAt: iso });
    expect(parseExperimentalJelly(JSON.parse(serializeExperimentalJelly(copy))).ok).toBe(true);
  });

  it('carries no transient solver data: every key is a descriptor, an envelope field or a state override', () => {
    const doc = JSON.parse(serializeExperimentalJelly(soft())) as Record<string, Record<string, unknown>>;
    expect(Object.keys(doc).sort()).toEqual(['behavior', 'bubbles', 'family', 'familyVersion', 'format', 'geometry', 'id', 'material', 'meta', 'name', 'quality', 'runtime', 'schemaVersion', 'states', 'target']);
    const known = new Set<string>(JELLY_PARAMS.map((d) => d.key));
    for (const section of ['material', 'geometry', 'bubbles', 'behavior', 'quality', 'target']) for (const k of Object.keys(doc[section]!)) expect(known.has(k), `${section}.${k}`).toBe(true);
    expect(Object.keys(doc.states!).sort()).toEqual(['active', 'disabled', 'hover', 'pressed']);
    for (const state of Object.values(doc.states!)) for (const k of Object.keys(state as object)) expect(known.has(k), k).toBe(true);
    expect(Object.keys(doc.meta!).sort()).toEqual(['basedOn', 'createdAt', 'notes', 'updatedAt']);
  });
});

describe('Jelly experimental repository', () => {
  const rec = (id: string, projectId: string) => ({ id, projectId, doc: { ...soft(), id }, basePreset: 'jelly-soft', createdAt: iso, updatedAt: iso });

  it('uses its own database and leaves the stable one alone', async () => {
    const factory = new IDBFactory();
    const repo = await openJellyRepository(factory);
    expect(repo.persistent).toBe(true);
    await repo.commit({ materials: { put: [rec('a', 'p1')] } });
    repo.close();
    const names = (await factory.databases()).map((d) => d.name);
    expect(names).toEqual([JELLY_DB_NAME]);
    expect(JELLY_DB_NAME).not.toBe('jello-lab');
  });

  it('isolates projects and reopens validated data', async () => {
    const factory = new IDBFactory();
    const repo = await openJellyRepository(factory);
    await repo.commit({ materials: { put: [rec('a', 'p1'), rec('b', 'p2')] } });
    expect((await repo.list('p1')).items.map((m) => m.id)).toEqual(['a']);
    expect((await repo.list('p2')).items.map((m) => m.id)).toEqual(['b']);
    expect((await repo.list('p3')).items).toEqual([]);
  });

  it('refuses an invalid document before opening any transaction', async () => {
    const repo = await openJellyRepository(new IDBFactory());
    const bad = rec('a', 'p1');
    (bad.doc.material as { bodyOpacity: number }).bodyOpacity = 7;
    await expect(repo.commit({ materials: { put: [rec('ok', 'p1'), bad] } })).rejects.toBeInstanceOf(JellyStorageError);
    expect((await repo.list('p1')).items).toEqual([]);
  });

  it('is atomic across stores: a failing put aborts the delete and the other puts', async () => {
    const repo = await openJellyRepository(new IDBFactory());
    await repo.commit({ materials: { put: [rec('keep', 'p1')] } });
    const uncloneable = { ...rec('x', 'p1'), basePreset: (() => 1) as never };
    await expect(repo.commit({ materials: { delete: ['keep'], put: [uncloneable] }, drafts: { put: [{ projectId: 'p1', doc: soft(), recordId: null, basePreset: null, savedAt: iso }] } })).rejects.toBeInstanceOf(JellyStorageError);
    expect((await repo.list('p1')).items.map((m) => m.id)).toEqual(['keep']);
    expect(await repo.getDraft('p1')).toBeNull();
  });

  it('reports a corrupt or newer record and keeps it in place', async () => {
    const factory = new IDBFactory();
    const repo = await openJellyRepository(factory);
    await repo.commit({ materials: { put: [rec('good', 'p1')] } });
    repo.close();
    const raw = await new Promise<IDBDatabase>((resolve) => { const r = factory.open(JELLY_DB_NAME, 1); r.onsuccess = () => resolve(r.result); });
    const tx = raw.transaction('jelly-materials', 'readwrite');
    tx.objectStore('jelly-materials').put({ ...rec('future', 'p1'), doc: { ...soft(), id: 'future', schemaVersion: 99 } });
    tx.objectStore('jelly-materials').put({ id: 'broken', projectId: 'p1', doc: { nope: true } });
    await new Promise((resolve) => { tx.oncomplete = resolve; });
    raw.close();
    const again = await openJellyRepository(factory);
    const report = await again.list('p1');
    expect(report.items.map((m) => m.id)).toEqual(['good']);
    expect(report.skipped.join('|')).toMatch(/future.*più recente/);
    expect(report.skipped.join('|')).toMatch(/broken/);
    const reread = await again.list('p1');
    expect(reread.skipped).toHaveLength(2);
  });

  it('purges only records of vanished projects', async () => {
    const repo = await openJellyRepository(new IDBFactory());
    await repo.commit({
      materials: { put: [rec('a', 'p1'), rec('b', 'gone')] },
      drafts: { put: [{ projectId: 'gone', doc: soft(), recordId: null, basePreset: null, savedAt: iso }] },
      links: { put: [{ projectId: 'gone', componentId: 'c', enabled: true, sourceId: null, doc: soft(), updatedAt: iso }] },
    });
    expect(await repo.purgeOrphans(['p1'])).toBe(3);
    expect((await repo.list('p1')).items).toHaveLength(1);
    expect(await repo.getLink('gone', 'c')).toBeNull();
  });

  it('stores Builder links as snapshots keyed by project and component', async () => {
    const repo = await openJellyRepository(new IDBFactory());
    await repo.commit({ links: { put: [{ projectId: 'p1', componentId: 'c1', enabled: true, sourceId: 'jelly-candy', doc: presetDoc('jelly-candy')!, updatedAt: iso }] } });
    expect((await repo.getLink('p1', 'c1'))?.doc.id).toBe('jelly-candy');
    expect(await repo.getLink('p2', 'c1')).toBeNull();
    expect(linkKey('p1', 'c1')).toBe('p1::c1');
  });

  it('falls back to memory without IndexedDB and says so', async () => {
    const repo = await openJellyRepository(null);
    expect(repo.persistent).toBe(false);
    expect(repo.reason).toMatch(/solo in questa scheda/);
    await repo.commit({ materials: { put: [rec('a', 'p1')] } });
    expect((await repo.list('p1')).items).toHaveLength(1);
    await expect(repo.commit({ materials: { put: [{ ...rec('b', 'p1'), id: 'mismatch' }] } })).rejects.toBeInstanceOf(JellyStorageError);
  });
});

describe('Jelly workbench', () => {
  const make = async (repo = new MemoryJellyRepository('test'), project = 'p1') => {
    let n = 0;
    const wb = new JellyWorkbench({ repo, now: () => iso, newId: () => `copy-${++n}`, draftDelay: 10 });
    await wb.open(project);
    return { wb, repo };
  };

  it('starts from Jelly Soft and marks edits dirty', async () => {
    const { wb } = await make();
    expect(wb.get().doc.id).toBe('jelly-soft');
    expect(wb.get().dirty).toBe(false);
    expect(wb.edit('density', 4).ok).toBe(true);
    expect(wb.get().dirty).toBe(true);
    expect(wb.get().save.kind).toBe('dirty');
  });

  it('records a rejection and leaves the document alone', async () => {
    const { wb } = await make();
    const before = wb.get().doc;
    expect(wb.edit('radiusMax', 0.5).ok).toBe(false);
    expect(wb.get().doc).toBe(before);
    expect(wb.get().rejections.radiusMax).toMatch(/non può/);
    expect(wb.edit('radiusMax', 7).ok).toBe(true);
    expect(wb.get().rejections.radiusMax).toBeUndefined();
  });

  it('saves a personal copy and reopens it with the same seed and parameters', async () => {
    const repo = new MemoryJellyRepository('test');
    const { wb } = await make(repo);
    wb.edit('dampingRatio', 0.9);
    wb.edit('seed', 424242);
    expect(await wb.save()).toBe(true);
    expect(wb.get().recordId).toBe('copy-1');
    expect(wb.get().dirty).toBe(false);
    const { wb: reopened } = await make(repo);
    expect(reopened.get().records.map((r) => r.id)).toEqual(['copy-1']);
    expect(reopened.get().doc.behavior.dampingRatio).toBe(0.9);
    expect(reopened.get().doc.bubbles.seed).toBe(424242);
    expect(reopened.get().doc.meta.basedOn).toBe('jelly-soft');
  });

  it('does not leak between projects and restores each project’s own draft', async () => {
    const repo = new MemoryJellyRepository('test');
    const { wb } = await make(repo, 'p1');
    wb.edit('density', 2.5);
    await wb.save();
    wb.edit('density', 9);
    await wb.open('p2');
    expect(wb.get().records).toEqual([]);
    expect(wb.get().doc.bubbles.density).toBe(8);
    await wb.open('p1');
    expect(wb.get().records).toHaveLength(1);
    expect(wb.get().doc.bubbles.density).toBe(9); // unsaved draft of p1 survived the switch
    expect(wb.get().base.kind).toBe('record');
  });

  it('reports a failed save without changing the document or claiming success', async () => {
    const repo = new MemoryJellyRepository('test');
    const { wb } = await make(repo);
    wb.edit('density', 5);
    vi.spyOn(repo, 'commit').mockRejectedValueOnce(new JellyStorageError('quota', 'pieno'));
    expect(await wb.save()).toBe(false);
    expect(wb.get().save).toEqual({ kind: 'error', message: 'pieno' });
    expect(wb.get().doc.bubbles.density).toBe(5);
    expect(wb.get().records).toEqual([]);
    expect(await wb.save()).toBe(true);
  });

  it('keeps the seed through preset switches only by explicit choice', async () => {
    const { wb } = await make();
    wb.edit('seed', 77);
    wb.selectPreset('jelly-candy');
    expect(wb.get().doc.bubbles.seed).toBe(30631);
    wb.selectPreset('jelly-soft');
    expect(wb.get().doc.bubbles.seed).toBe(10631);
  });

  it('imports only valid documents and gives them a new id', async () => {
    const { wb } = await make();
    const text = serializeExperimentalJelly(JELLY_CANDIDATE_PRESETS[1]!.doc);
    expect(await wb.importText('{"nope":1}')).toMatchObject({ ok: false });
    expect(wb.get().doc.id).toBe('jelly-soft');
    expect(await wb.importText(text)).toEqual({ ok: true });
    expect(wb.get().doc.id).toBe('copy-1');
    expect(wb.get().doc.name).toBe('Jelly Clear');
  });

  it('deletes a record together with the draft that pointed at it', async () => {
    const repo = new MemoryJellyRepository('test');
    const { wb } = await make(repo);
    await wb.save();
    expect(await wb.deleteRecord('copy-1')).toBe(true);
    expect(await repo.getDraft('p1')).toBeNull();
    expect(wb.get().records).toEqual([]);
    expect(wb.get().doc.id).toBe('copy-1');
  });

  it('writes the draft after the debounce and on project change', async () => {
    const repo = new MemoryJellyRepository('test');
    const { wb } = await make(repo);
    wb.edit('density', 6);
    expect(await repo.getDraft('p1')).toBeNull();
    await new Promise((r) => setTimeout(r, 40));
    expect((await repo.getDraft('p1'))?.doc.bubbles.density).toBe(6);
    wb.edit('density', 7);
    await wb.open('p2');
    expect((await repo.getDraft('p1'))?.doc.bubbles.density).toBe(7);
  });

  it('ignores a stale load when the project changes quickly', async () => {
    const repo = new MemoryJellyRepository('test');
    await repo.commit({ materials: { put: [{ id: 'only-p1', projectId: 'p1', doc: { ...soft(), id: 'only-p1' }, basePreset: null, createdAt: iso, updatedAt: iso }] } });
    const slow = vi.spyOn(repo, 'list').mockImplementationOnce(async () => { await new Promise((r) => setTimeout(r, 30)); return { items: (await repo.list('p1')).items, skipped: [] }; });
    const { wb } = await make(repo, 'none');
    void slow;
    const first = wb.open('p1');
    const second = wb.open('p2');
    await Promise.all([first, second]);
    expect(wb.get().projectId).toBe('p2');
    expect(wb.get().records).toEqual([]);
  });
});
