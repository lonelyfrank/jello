/**
 * M6.4.1 data integrity of the experimental Jelly store: revisions and compare-and-swap, the v1 → v2 upgrade,
 * the read-only reconciliation (detect, classify, quarantine, restore) and the workbench lifecycle under
 * project switches, failed writes, concurrent saves and a second tab.
 */
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import {
  JELLY_DB_NAME, JELLY_DB_VERSION, JellyConflictError, JellyStorageError, MemoryJellyRepository, linkKey, openJellyRepository,
  type JellyBatch, type JellyCommitResult, type JellyRepository,
} from '../../src/lab/experimental/jelly/repository';
import {
  classifyRow, quarantineOrphans, readLiveSnapshot, recoveryBundle, rowId, scanJelly, type LiveSnapshot, type StableReader,
} from '../../src/lab/experimental/jelly/reconcile';
import { JellyWorkbench, presetDoc } from '../../src/lab/experimental/jelly/workbench';

const iso = '2026-11-02T10:00:00.000Z';
const soft = () => presetDoc('jelly-soft')!;
const rec = (id: string, projectId: string, name = id) => ({ id, projectId, doc: { ...soft(), id, name }, basePreset: 'jelly-soft', createdAt: iso, updatedAt: iso });
const link = (projectId: string, componentId: string) => ({ projectId, componentId, enabled: true, sourceId: 'jelly-candy', doc: presetDoc('jelly-candy')!, updatedAt: iso });
const draft = (projectId: string) => ({ projectId, doc: soft(), recordId: null, basePreset: 'jelly-soft', savedAt: iso });

/** Opens the experimental database by hand at the version the first release (M6.4) used: stores, no revisions, no quarantine. */
async function seedV1(factory: IDBFactory, rows: { materials?: object[]; drafts?: object[]; links?: object[] }): Promise<void> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const r = factory.open(JELLY_DB_NAME, 1);
    r.onupgradeneeded = () => {
      const m = r.result.createObjectStore('jelly-materials', { keyPath: 'id' });
      m.createIndex('projectId', 'projectId');
      r.result.createObjectStore('jelly-drafts', { keyPath: 'projectId' });
      r.result.createObjectStore('jelly-links', { keyPath: 'key' });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  const tx = db.transaction(['jelly-materials', 'jelly-drafts', 'jelly-links'], 'readwrite');
  for (const v of rows.materials ?? []) tx.objectStore('jelly-materials').put(v);
  for (const v of rows.drafts ?? []) tx.objectStore('jelly-drafts').put(v);
  for (const v of rows.links ?? []) tx.objectStore('jelly-links').put(v);
  await new Promise<void>((resolve) => { tx.oncomplete = () => resolve(); });
  db.close();
}

async function rawPut(factory: IDBFactory, store: string, value: object): Promise<void> {
  const db = await new Promise<IDBDatabase>((resolve) => { const r = factory.open(JELLY_DB_NAME); r.onsuccess = () => resolve(r.result); });
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).put(value);
  await new Promise<void>((resolve) => { tx.oncomplete = () => resolve(); });
  db.close();
}

describe('database upgrade v1 → v2', () => {
  it('reads every v1 record unchanged (revision 0) and adds only the quarantine store', async () => {
    const factory = new IDBFactory();
    await seedV1(factory, { materials: [rec('a', 'p1')], drafts: [draft('p1')], links: [{ key: linkKey('p1', 'c1'), ...link('p1', 'c1') }] });
    const repo = await openJellyRepository(factory);
    expect(repo.persistent).toBe(true);
    expect(JELLY_DB_VERSION).toBe(2);
    const list = await repo.list('p1');
    expect(list.items.map((m) => [m.id, m.rev])).toEqual([['a', 0]]);
    expect(list.items[0]!.doc).toEqual({ ...soft(), id: 'a', name: 'a' });
    expect((await repo.readDraft('p1')).rev).toBe(0);
    expect((await repo.getLink('p1', 'c1'))?.rev).toBe(0);
    expect(await repo.listQuarantine()).toEqual([]);
    repo.close();
    const db = await new Promise<IDBDatabase>((resolve) => { const r = factory.open(JELLY_DB_NAME); r.onsuccess = () => resolve(r.result); });
    expect([...db.objectStoreNames].sort()).toEqual(['jelly-drafts', 'jelly-links', 'jelly-materials', 'jelly-quarantine']);
    db.close();
  });

  it('a v1 record can be written with an expectation of revision 0, and then moves to 1', async () => {
    const factory = new IDBFactory();
    await seedV1(factory, { materials: [rec('a', 'p1')] });
    const repo = await openJellyRepository(factory);
    const r = await repo.commit({ materials: { put: [{ ...rec('a', 'p1', 'renamed'), rev: 99 }], expect: { a: 0 } } });
    expect(r.materials.a).toBe(1); // a rev carried by the caller is ignored: only the repository assigns it
    await expect(repo.commit({ materials: { put: [rec('a', 'p1', 'again')], expect: { a: 0 } } })).rejects.toBeInstanceOf(JellyConflictError);
    expect((await repo.list('p1')).items[0]).toMatchObject({ rev: 1 });
    expect((await repo.list('p1')).items[0]!.doc.name).toBe('renamed');
  });
});

describe.each([
  ['IndexedDB', async () => openJellyRepository(new IDBFactory())],
  ['memory', async () => new MemoryJellyRepository('test') as JellyRepository],
])('compare-and-swap (%s)', (_name, open) => {
  it('assigns an increasing revision per record', async () => {
    const repo = await open();
    expect((await repo.commit({ materials: { put: [rec('a', 'p1')] } })).materials.a).toBe(1);
    expect((await repo.commit({ materials: { put: [rec('a', 'p1', 'x')] } })).materials.a).toBe(2);
    expect(await repo.revisionOf('materials', 'a')).toBe(2);
    expect(await repo.revisionOf('materials', 'nope')).toBeNull();
  });

  it('refuses a write whose expectation no longer holds, and writes NOTHING of the batch', async () => {
    const repo = await open();
    await repo.commit({ materials: { put: [rec('a', 'p1')] }, drafts: { put: [draft('p1')] } });
    const batch: JellyBatch = { materials: { put: [rec('a', 'p1', 'mine'), rec('b', 'p1')], expect: { a: 0 } }, drafts: { delete: ['p1'] } };
    const err = await repo.commit(batch).catch((e) => e);
    expect(err).toBeInstanceOf(JellyConflictError);
    expect(err.kind).toBe('conflict');
    expect(err.conflicts).toEqual([{ store: 'materials', key: 'a', expected: 0, actual: 1 }]);
    expect((await repo.list('p1')).items.map((m) => [m.id, m.doc.name])).toEqual([['a', 'a']]);
    expect(await repo.getDraft('p1')).not.toBeNull();
  });

  it('null expects absence; a deleted record is a conflict, not a silent re-create', async () => {
    const repo = await open();
    await repo.commit({ materials: { put: [rec('a', 'p1')], expect: { a: null } } });
    await expect(repo.commit({ materials: { put: [rec('a', 'p1')], expect: { a: null } } })).rejects.toBeInstanceOf(JellyConflictError);
    await repo.commit({ materials: { delete: ['a'], expect: { a: 1 } } });
    const err = await repo.commit({ materials: { put: [rec('a', 'p1', 'late')], expect: { a: 1 } } }).catch((e) => e);
    expect(err.conflicts[0]).toMatchObject({ expected: 1, actual: null });
    expect(err.message).toMatch(/eliminato da un’altra scheda/);
    expect((await repo.list('p1')).items).toEqual([]);
  });

  it('a stale delete does not delete', async () => {
    const repo = await open();
    await repo.commit({ materials: { put: [rec('a', 'p1')] } });
    await repo.commit({ materials: { put: [rec('a', 'p1', 'edited elsewhere')] } });
    await expect(repo.commit({ materials: { delete: ['a'], expect: { a: 1 } } })).rejects.toBeInstanceOf(JellyConflictError);
    expect((await repo.list('p1')).items).toHaveLength(1);
  });

  it('guards drafts and Builder links the same way', async () => {
    const repo = await open();
    const d = await repo.commit({ drafts: { put: [draft('p1')], expect: { p1: null } } });
    expect(d.drafts.p1).toBe(1);
    await expect(repo.commit({ drafts: { put: [draft('p1')], expect: { p1: null } } })).rejects.toBeInstanceOf(JellyConflictError);
    const l = await repo.commit({ links: { put: [link('p1', 'c1')], expect: { [linkKey('p1', 'c1')]: null } } });
    expect(l.links[linkKey('p1', 'c1')]).toBe(1);
    await expect(repo.commit({ links: { put: [link('p1', 'c1')], expect: { [linkKey('p1', 'c1')]: 0 } } })).rejects.toBeInstanceOf(JellyConflictError);
    expect((await repo.getLink('p1', 'c1'))?.rev).toBe(1);
  });

  it('two connections behave as two tabs: the second, stale, writer is refused', async () => {
    if (_name === 'memory') return; // needs two real connections
    const factory = new IDBFactory();
    const tab1 = await openJellyRepository(factory);
    const tab2 = await openJellyRepository(factory);
    await tab1.commit({ materials: { put: [rec('r', 'p1')] } });
    const seen1 = (await tab1.list('p1')).items[0]!.rev;
    const seen2 = (await tab2.list('p1')).items[0]!.rev;
    await tab1.commit({ materials: { put: [rec('r', 'p1', 'from tab 1')], expect: { r: seen1! } } });
    await expect(tab2.commit({ materials: { put: [rec('r', 'p1', 'from tab 2')], expect: { r: seen2! } } })).rejects.toBeInstanceOf(JellyConflictError);
    expect((await tab2.list('p1')).items[0]!.doc.name).toBe('from tab 1');
  });
});

describe('inventory, quarantine, restore', () => {
  async function seeded() {
    const factory = new IDBFactory();
    const repo = await openJellyRepository(factory);
    await repo.commit({
      materials: { put: [rec('keep', 'p1'), rec('gone-m', 'gone', 'Orfano')] },
      drafts: { put: [draft('gone')] },
      links: { put: [link('p1', 'c-del'), link('p1', 'button')] },
    });
    await rawPut(factory, 'jelly-materials', { ...rec('future', 'gone'), doc: { ...soft(), id: 'future', schemaVersion: 99 }, rev: 3 });
    await rawPut(factory, 'jelly-materials', { id: 'broken', projectId: 'gone', doc: { nope: true }, rev: 1 });
    await rawPut(factory, 'jelly-materials', { ...rec('wrapped', 'gone'), storeVersion: 7 });
    return { factory, repo };
  }

  it('the inventory lists every row, readable or not, and changes nothing', async () => {
    const { repo } = await seeded();
    const before = JSON.stringify(await repo.inventory());
    const rows = await repo.inventory();
    expect(JSON.stringify(rows)).toBe(before);
    const by = Object.fromEntries(rows.map((r) => [rowId(r), r]));
    expect(by['materials/keep']).toMatchObject({ readable: 'ok', projectId: 'p1', rev: 1, name: 'keep' });
    expect(by['materials/future']).toMatchObject({ readable: 'newer', rev: 3 });
    expect(by['materials/broken']).toMatchObject({ readable: 'corrupt' });
    expect(by['materials/wrapped']).toMatchObject({ readable: 'newer' });
    expect(by['links/p1::c-del']).toMatchObject({ readable: 'ok', componentId: 'c-del' });
    expect(by['drafts/gone']).toMatchObject({ readable: 'ok', projectId: 'gone' });
  });

  it('moves only readable rows still at the revision seen, in one step, and keeps every other row in place', async () => {
    const { repo } = await seeded();
    const inv = await repo.inventory();
    const want = ['materials/gone-m', 'drafts/gone', 'materials/future', 'materials/broken', 'materials/wrapped', 'materials/keep'].map((id) => inv.find((r) => rowId(r) === id)!);
    // keep is edited after the scan
    await repo.commit({ materials: { put: [rec('keep', 'p1', 'edited')] } });
    const out = await repo.quarantine(want.map((r) => ({ store: r.store, key: r.key, rev: r.rev })), 'test', iso);
    expect(out.moved).toBe(2);
    expect(out.skipped.join('|')).toMatch(/future.*più recente/);
    expect(out.skipped.join('|')).toMatch(/broken.*non leggibile/);
    expect(out.skipped.join('|')).toMatch(/wrapped.*più recente/);
    expect(out.skipped.join('|')).toMatch(/keep.*modificato nel frattempo/);
    const left = (await repo.inventory()).map(rowId).sort();
    expect(left).toEqual(['links/p1::button', 'links/p1::c-del', 'materials/broken', 'materials/future', 'materials/keep', 'materials/wrapped']);
    expect((await repo.listQuarantine()).map((q) => [q.store, q.key, q.name])).toEqual([['materials', 'gone-m', 'Orfano'], ['drafts', 'gone', soft().name]].sort());
  });

  it('restores a quarantined row exactly as it was, and never overwrites a row that exists again', async () => {
    const { repo } = await seeded();
    const before = (await repo.inventory()).find((r) => rowId(r) === 'materials/gone-m')!;
    await repo.quarantine([{ store: 'materials', key: 'gone-m', rev: before.rev }], 'test', iso);
    expect((await repo.inventory()).some((r) => rowId(r) === 'materials/gone-m')).toBe(false);
    const [q] = await repo.listQuarantine();
    expect((await repo.restoreFromQuarantine([q!.qkey])).moved).toBe(1);
    const after = (await repo.inventory()).find((r) => rowId(r) === 'materials/gone-m')!;
    expect(after.value).toEqual(before.value);
    expect(after.rev).toBe(before.rev);
    expect(await repo.listQuarantine()).toEqual([]);
    // quarantine it again, recreate the key, and the restore leaves both alone
    await repo.quarantine([{ store: 'materials', key: 'gone-m', rev: after.rev }], 'again', '2026-11-02T11:00:00.000Z');
    await repo.commit({ materials: { put: [rec('gone-m', 'gone', 'new life')] } });
    const [q2] = await repo.listQuarantine();
    const r = await repo.restoreFromQuarantine([q2!.qkey]);
    expect(r.moved).toBe(0);
    expect(r.skipped.join()).toMatch(/esiste già/);
    expect((await repo.listQuarantine())).toHaveLength(1);
    expect((await repo.list('gone')).items.find((m) => m.id === 'gone-m')!.doc.name).toBe('new life');
  });

  it('the memory repository has the same semantics', async () => {
    const repo = new MemoryJellyRepository('test');
    await repo.commit({ materials: { put: [rec('a', 'gone')] } });
    const [row] = await repo.inventory();
    expect((await repo.quarantine([{ store: 'materials', key: 'a', rev: row!.rev + 1 }], 'x')).moved).toBe(0);
    expect((await repo.quarantine([{ store: 'materials', key: 'a', rev: row!.rev }], 'x', iso)).moved).toBe(1);
    expect(await repo.inventory()).toEqual([]);
    const [q] = await repo.listQuarantine();
    expect((await repo.restoreFromQuarantine([q!.qkey])).moved).toBe(1);
    expect((await repo.list('gone')).items).toHaveLength(1);
  });
});

describe('reconciliation: classify, never guess', () => {
  const live = (over: Partial<LiveSnapshot> = {}): LiveSnapshot => ({
    complete: true, reason: null, projectIds: new Set(['p1']), components: new Map([['p1', new Set(['c-user'])]]), unscopedComponents: new Set(['c-legacy']),
    templateIds: new Set(['button', 'mobile-navbar', 'desktop-navbar']), ...over,
  });
  const row = async (store: 'materials' | 'drafts' | 'links', v: object, key: string) => {
    const repo = new MemoryJellyRepository('t');
    await repo.commit({ [store]: { put: [v] } } as JellyBatch);
    return (await repo.inventory()).find((r) => r.key === key)!;
  };

  it('a row of an existing project is valid', async () => {
    expect(classifyRow(await row('materials', rec('a', 'p1'), 'a'), live())).toMatchObject({ class: 'valid', recoverable: false });
    expect(classifyRow(await row('drafts', draft('p1'), 'p1'), live()).class).toBe('valid');
  });

  it('a row of a project that is not there is an orphan, and recoverable, only when the read of the stable database was complete', async () => {
    const r = await row('materials', rec('a', 'p9'), 'a');
    expect(classifyRow(r, live())).toMatchObject({ class: 'orphan', recoverable: true, why: expect.stringMatching(/progetto non esiste più/) });
    const partial = classifyRow(r, live({ complete: false, reason: 'lettura parziale' }));
    expect(partial).toMatchObject({ class: 'unverifiable', recoverable: false });
    expect(partial.why).toBe('lettura parziale');
  });

  it('a Builder trial is valid for a stored component, a template or a project-less legacy component; an orphan only when it is none of them', async () => {
    const k = (c: string) => linkKey('p1', c);
    expect(classifyRow(await row('links', link('p1', 'c-user'), k('c-user')), live()).class).toBe('valid');
    expect(classifyRow(await row('links', link('p1', 'button'), k('button')), live()).class).toBe('valid');
    expect(classifyRow(await row('links', link('p1', 'c-legacy'), k('c-legacy')), live()).class).toBe('valid');
    expect(classifyRow(await row('links', link('p1', 'c-deleted'), k('c-deleted')), live())).toMatchObject({ class: 'orphan', recoverable: true });
    expect(classifyRow(await row('links', link('p1', 'c-deleted'), k('c-deleted')), live({ complete: false, reason: 'x' })).class).toBe('unverifiable');
    // the same component id in ANOTHER project does not vouch for this one
    expect(classifyRow(await row('links', link('p1', 'c-other'), k('c-other')), live({ components: new Map([['p2', new Set(['c-other'])]]), projectIds: new Set(['p1', 'p2']) })).class).toBe('orphan');
  });

  it('a corrupt row or a row from a newer version is never an orphan, even when its project is gone', async () => {
    const repo = new MemoryJellyRepository('t');
    await repo.commit({ materials: { put: [rec('ok', 'p9')] } });
    const inv = await repo.inventory();
    const base = inv[0]!;
    expect(classifyRow({ ...base, readable: 'newer' }, live()).class).toBe('newer');
    expect(classifyRow({ ...base, readable: 'corrupt', detail: 'bodyOpacity' }, live()).class).toBe('corrupt');
    expect(classifyRow({ ...base, readable: 'newer' }, live()).recoverable).toBe(false);
    expect(classifyRow({ ...base, projectId: null }, live()).class).toBe('corrupt');
  });

  describe('readLiveSnapshot reads the stable database fresh and concludes nothing from a partial read', () => {
    const stable = (over: Partial<StableReader> = {}): StableReader => ({
      persistent: true, reason: null,
      listProjectDocs: async () => ({ items: [{ id: 'p1' }], skipped: [] }),
      listComponents: async () => ({ items: [{ id: 'c1', projectId: 'p1' }, { id: 'old' }], skipped: [] }),
      ...over,
    });
    it('complete', async () => {
      const s = await readLiveSnapshot(stable());
      expect(s.complete).toBe(true);
      expect([...s.projectIds]).toEqual(['p1']);
      expect([...(s.components.get('p1') ?? [])]).toEqual(['c1']);
      expect([...s.unscopedComponents]).toEqual(['old']);
      expect(s.templateIds.has('button')).toBe(true);
    });
    it('a skipped record, a failing read or a non-persistent store make it incomplete', async () => {
      expect((await readLiveSnapshot(stable({ listProjectDocs: async () => ({ items: [{ id: 'p1' }], skipped: ['p2: illeggibile'] }) }))).complete).toBe(false);
      expect((await readLiveSnapshot(stable({ listComponents: async () => { throw new Error('boom'); } }))).reason).toMatch(/boom/);
      expect((await readLiveSnapshot(stable({ persistent: false, reason: 'IndexedDB assente' }))).complete).toBe(false);
    });
  });

  describe('scan and quarantine', () => {
    const setup = async () => {
      const repo = new MemoryJellyRepository('t');
      await repo.commit({
        materials: { put: [rec('m-ok', 'p1'), rec('m-orphan', 'p2')] },
        drafts: { put: [draft('p2')] },
        links: { put: [link('p1', 'c-user'), link('p1', 'c-gone')] },
      });
      return repo;
    };
    const liveOf = (projects: string[], complete = true): (() => Promise<LiveSnapshot>) => async () => ({
      complete, reason: complete ? null : 'parziale', projectIds: new Set(projects), components: new Map([['p1', new Set(['c-user'])]]), unscopedComponents: new Set(), templateIds: new Set(['button']),
    });

    it('a scan classifies and modifies nothing', async () => {
      const repo = await setup();
      const before = JSON.stringify(await repo.inventory());
      const report = await scanJelly(repo, liveOf(['p1']), () => iso);
      expect(report.counts).toEqual({ valid: 2, orphan: 3, unverifiable: 0, corrupt: 0, newer: 0 });
      expect(report.rows.filter((r) => r.class === 'orphan').map(rowId).sort()).toEqual(['drafts/p2', 'links/p1::c-gone', 'materials/m-orphan']);
      expect(JSON.stringify(await repo.inventory())).toBe(before);
      expect(await repo.listQuarantine()).toEqual([]);
    });

    it('with an incomplete view of the stable database nothing is an orphan and nothing is moved', async () => {
      const repo = await setup();
      const report = await scanJelly(repo, liveOf(['p1'], false));
      expect(report.counts.orphan).toBe(0);
      expect(report.counts.unverifiable).toBe(3);
      expect(await quarantineOrphans(repo, liveOf(['p1'], false))).toMatchObject({ moved: 0, considered: 0 });
      expect((await repo.inventory())).toHaveLength(5);
    });

    it('moves orphans to quarantine instead of deleting them, and the quarantine can give them back', async () => {
      const repo = await setup();
      const out = await quarantineOrphans(repo, liveOf(['p1']), undefined, () => iso);
      expect(out).toMatchObject({ moved: 3, considered: 3, skipped: [] });
      expect((await repo.inventory()).map(rowId).sort()).toEqual(['links/p1::c-user', 'materials/m-ok']);
      const q = await repo.listQuarantine();
      expect(q).toHaveLength(3);
      expect((await repo.restoreFromQuarantine(q.map((x) => x.qkey))).moved).toBe(3);
      expect((await repo.inventory())).toHaveLength(5);
    });

    it('re-reads the stable database at the moment of the move: a project that reappeared since the scan is not touched', async () => {
      const repo = await setup();
      const first = await scanJelly(repo, liveOf(['p1']));
      expect(first.counts.orphan).toBe(3);
      // the user imports a project p2 in another tab before confirming
      const out = await quarantineOrphans(repo, liveOf(['p1', 'p2']), first.rows.filter((r) => r.class === 'orphan').map(rowId));
      expect(out.moved).toBe(1); // only the trial of the component that is still missing
      expect((await repo.inventory()).map(rowId)).toContain('materials/m-orphan');
      expect((await repo.inventory()).map(rowId)).toContain('drafts/p2');
    });

    it('can be limited to the rows the user picked', async () => {
      const repo = await setup();
      const out = await quarantineOrphans(repo, liveOf(['p1']), ['links/p1::c-gone']);
      expect(out.moved).toBe(1);
      expect((await repo.inventory()).map(rowId)).toContain('materials/m-orphan');
    });

    it('a row edited between the scan and the move stays where it is', async () => {
      const repo = await setup();
      const flaky: JellyRepository = Object.create(repo, {
        inventory: { value: async () => { const rows = await repo.inventory(); await repo.commit({ materials: { put: [rec('m-orphan', 'p2', 'edited after the scan')] } }); return rows; } },
      });
      const out = await quarantineOrphans(flaky, liveOf(['p1']));
      expect(out.skipped.join()).toMatch(/m-orphan.*modificato nel frattempo/);
      expect((await repo.inventory()).map(rowId)).toContain('materials/m-orphan');
    });

    it('exports a recovery bundle with the raw values', async () => {
      const repo = await setup();
      const report = await scanJelly(repo, liveOf(['p1']));
      const bundle = recoveryBundle(report.rows.filter((r) => r.class === 'orphan'), iso);
      expect(bundle).toMatchObject({ format: 'jello-experimental-recovery', version: 1, exportedAt: iso });
      expect(bundle.rows).toHaveLength(3);
      const m = bundle.rows.find((r) => r.key === 'm-orphan')!;
      expect((m.value as { doc: { name: string } }).doc.name).toBe('m-orphan');
      expect(() => JSON.parse(JSON.stringify(bundle))).not.toThrow();
    });
  });
});

// ---------------------------------------------------------------------------------------------
// Workbench lifecycle
// ---------------------------------------------------------------------------------------------

/** A repository whose reads and writes can be held, delayed or made to fail, to put operations in the order a test needs. */
class ScriptedRepo implements JellyRepository {
  persistent = true;
  reason = null;
  listGate: ((projectId: string) => Promise<void>) | null = null;
  commitGate: ((batch: JellyBatch) => Promise<void>) | null = null;
  failCommit: Error | null = null;
  commits: JellyBatch[] = [];
  constructor(readonly inner: JellyRepository) {}
  async list(projectId: string) { await this.listGate?.(projectId); return this.inner.list(projectId); }
  getDraft(p: string) { return this.inner.getDraft(p); }
  readDraft(p: string) { return this.inner.readDraft(p); }
  getLink(p: string, c: string) { return this.inner.getLink(p, c); }
  revisionOf(s: Parameters<JellyRepository['revisionOf']>[0], k: string) { return this.inner.revisionOf(s, k); }
  async commit(batch: JellyBatch): Promise<JellyCommitResult> {
    this.commits.push(batch);
    await this.commitGate?.(batch);
    if (this.failCommit) throw this.failCommit;
    return this.inner.commit(batch);
  }
  inventory() { return this.inner.inventory(); }
  quarantine(...a: Parameters<JellyRepository['quarantine']>) { return this.inner.quarantine(...a); }
  listQuarantine() { return this.inner.listQuarantine(); }
  restoreFromQuarantine(q: readonly string[]) { return this.inner.restoreFromQuarantine(q); }
  close() { this.inner.close(); }
}
const gate = () => { let open!: () => void; const p = new Promise<void>((r) => { open = r; }); return { p, open }; };
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

const mk = (repo: JellyRepository, prefix = 'copy') => {
  let n = 0;
  return new JellyWorkbench({ repo, now: () => iso, newId: () => `${prefix}-${++n}`, draftDelay: 5 });
};

describe('workbench · Scenario A: project switch during load', () => {
  it('the late answer for A never reaches B, and nothing can be edited, saved or drafted while B loads', async () => {
    const inner = new MemoryJellyRepository('t');
    await inner.commit({ materials: { put: [rec('a-copy', 'A', 'Copia di A')] }, drafts: { put: [{ ...draft('A'), doc: { ...soft(), name: 'bozza di A' } }] } });
    const repo = new ScriptedRepo(inner);
    const gateA = gate();
    repo.listGate = async (p) => { if (p === 'A') await gateA.p; };
    const wb = mk(repo);
    const openA = wb.open('A');
    await tick();
    const openB = wb.open('B');
    await tick(10);
    expect(wb.get().projectId).toBe('B');
    gateA.open();
    await Promise.all([openA, openB]);
    const s = wb.get();
    expect(s.projectId).toBe('B');
    expect(s.loading).toBe(false);
    expect(s.records).toEqual([]);
    expect(s.doc.name).not.toBe('bozza di A');
    expect(s.recordId).toBeNull();
  });

  it('while a project loads, edits and saves are refused and write nothing under it', async () => {
    const inner = new MemoryJellyRepository('t');
    const repo = new ScriptedRepo(inner);
    const hold = gate();
    repo.listGate = async () => hold.p;
    const wb = mk(repo);
    const opening = wb.open('A');
    await tick(5);
    expect(wb.get().loading).toBe(true);
    expect(wb.edit('density', 3)).toMatchObject({ ok: false });
    expect(wb.selectPreset('jelly-clear')).toBe(false);
    expect(await wb.save()).toBe(false);
    expect(await wb.saveAsCopy()).toBe(false);
    await tick(20);
    expect(repo.commits).toEqual([]);
    hold.open();
    await opening;
    expect(wb.edit('density', 3).ok).toBe(true);
  });

  it('A → B → A restores each project\'s own draft', async () => {
    const repo = new MemoryJellyRepository('t');
    const wb = mk(repo);
    await wb.open('A');
    wb.edit('density', 11);
    await wb.open('B');
    expect(wb.get().doc.bubbles.density).toBe(8);
    wb.edit('density', 2);
    await wb.open('A');
    expect(wb.get().doc.bubbles.density).toBe(11);
    await wb.open('B');
    expect(wb.get().doc.bubbles.density).toBe(2);
  });
});

describe('workbench · Scenario B: a save in flight while the project changes', () => {
  it('completes against A and leaves B untouched', async () => {
    const inner = new MemoryJellyRepository('t');
    const repo = new ScriptedRepo(inner);
    const wb = mk(repo);
    await wb.open('A');
    wb.edit('density', 12);
    const hold = gate();
    repo.commitGate = async (b) => { if (b.materials) await hold.p; };
    const saving = wb.saveAsCopy();
    await tick(5);
    expect(wb.get().save.kind).toBe('saving');
    const switching = wb.open('B');
    await tick(5);
    hold.open();
    await Promise.all([saving, switching]);
    const s = wb.get();
    expect(s.projectId).toBe('B');
    expect(s.records).toEqual([]);
    expect(s.recordId).toBeNull();
    expect(s.doc.bubbles.density).toBe(8);
    expect(s.save.kind).toBe('clean');
    expect((await inner.list('A')).items.map((m) => m.id)).toEqual(['copy-1']);
    expect((await inner.list('B')).items).toEqual([]);
    expect(await inner.getDraft('B')).toBeNull();
  });

  it('keeps an edit made while the save is in flight (it is newer than what was saved)', async () => {
    const inner = new MemoryJellyRepository('t');
    const repo = new ScriptedRepo(inner);
    const wb = mk(repo);
    await wb.open('A');
    wb.edit('density', 12);
    const hold = gate();
    repo.commitGate = async (b) => { if (b.materials) await hold.p; };
    const saving = wb.saveAsCopy();
    await tick(5);
    wb.edit('density', 14); // typed during the write
    hold.open();
    expect(await saving).toBe(true);
    const s = wb.get();
    expect(s.doc.bubbles.density).toBe(14);
    expect(s.recordId).toBe('copy-1');
    expect(s.base.kind).toBe('record');
    expect(s.base.doc.bubbles.density).toBe(12);
    expect(s.dirty).toBe(true);
    expect(s.save.kind).toBe('dirty');
    await tick(30);
    expect((await inner.getDraft('A'))!.doc.bubbles.density).toBe(14);
    expect((await inner.list('A')).items[0]!.doc.bubbles.density).toBe(12);
  });

  it('serialises repository calls: a draft write queued behind a save finishes after it', async () => {
    const inner = new MemoryJellyRepository('t');
    const repo = new ScriptedRepo(inner);
    const wb = mk(repo);
    await wb.open('A');
    wb.edit('density', 12);
    const order: string[] = [];
    const hold = gate();
    repo.commitGate = async (b) => { if (b.materials) await hold.p; order.push(b.materials ? 'save' : 'draft'); };
    const saving = wb.saveAsCopy();
    await tick(5);
    wb.edit('density', 13);
    await tick(30);
    expect(order).toEqual([]); // the draft waits behind the save
    hold.open();
    await saving;
    await tick(30);
    expect(order[0]).toBe('save'); // never a draft before the save it waited for
    expect(order.slice(1).every((o) => o === 'draft')).toBe(true);
    expect(wb.get().conflict).toBeNull(); // sequential draft writes do not conflict with each other
  });
});

describe('workbench · Scenario C: a failing write (quota)', () => {
  it('reports it, keeps the edits recoverable, and succeeds on retry', async () => {
    const inner = new MemoryJellyRepository('t');
    const repo = new ScriptedRepo(inner);
    const wb = mk(repo);
    await wb.open('A');
    wb.edit('density', 15);
    wb.edit('tint', '#112233');
    const edited = wb.get().doc;
    repo.failCommit = new JellyStorageError('quota', 'Spazio di archiviazione esaurito: il salvataggio sperimentale non è riuscito.');
    expect(await wb.saveAsCopy()).toBe(false);
    expect(wb.get().save).toEqual({ kind: 'error', message: expect.stringMatching(/Spazio di archiviazione esaurito/) });
    expect(wb.get().doc).toBe(edited);
    expect(wb.get().dirty).toBe(true);
    expect(wb.get().records).toEqual([]);
    expect(JSON.parse(wb.exportText()).bubbles.density).toBe(15); // the work can always be taken out as a file
    await tick(30);
    expect(repo.commits.some((b) => b.drafts && !b.materials)).toBe(true); // the draft was attempted again
    expect(wb.get().save.kind).toBe('error');
    repo.failCommit = null;
    expect(await wb.saveAsCopy()).toBe(true);
    expect(wb.get().save.kind).toBe('saved');
    expect((await inner.list('A')).items[0]!.doc.bubbles.density).toBe(15);
    expect((await inner.list('A')).items[0]!.doc.material.tint).toBe('#112233');
  });

  it('a draft that cannot be written is reported without losing the in-memory document, and the next one goes through', async () => {
    const inner = new MemoryJellyRepository('t');
    const repo = new ScriptedRepo(inner);
    const wb = mk(repo);
    await wb.open('A');
    repo.failCommit = new JellyStorageError('quota', 'quota');
    wb.edit('density', 3);
    await tick(30);
    expect(wb.get().save.kind).toBe('error');
    expect(wb.get().doc.bubbles.density).toBe(3);
    repo.failCommit = null;
    wb.edit('density', 4);
    await tick(30);
    expect((await inner.getDraft('A'))!.doc.bubbles.density).toBe(4);
  });

  it('a failed save of an existing copy leaves the stored copy as it was', async () => {
    const inner = new MemoryJellyRepository('t');
    const repo = new ScriptedRepo(inner);
    const wb = mk(repo);
    await wb.open('A');
    wb.edit('density', 5);
    await wb.save();
    const stored = JSON.stringify((await inner.list('A')).items[0]);
    wb.edit('density', 6);
    repo.failCommit = new JellyStorageError('failed', 'disk');
    expect(await wb.save()).toBe(false);
    expect(JSON.stringify((await inner.list('A')).items[0])).toBe(stored);
  });
});

describe.each([
  ['IndexedDB', () => openJellyRepository(new IDBFactory())],
  ['memory', async () => new MemoryJellyRepository('t') as JellyRepository],
])('workbench · Scenario D: two tabs on the same project (%s)', (_name, open) => {
  const twoTabs = async () => {
    const shared = await open();
    // Two tabs of one browser share the database; for IndexedDB each tab has its own connection to the same factory.
    const repo2 = _name === 'IndexedDB' ? shared : shared;
    const tab1 = mk(shared, 't1');
    const tab2 = mk(repo2, 't2');
    await tab1.open('P');
    tab1.edit('density', 9);
    await tab1.save('Condivisa');
    await tab1.flushDraft();
    await tab2.open('P');
    return { shared, tab1, tab2 };
  };

  it('the second tab opens the same copy; the first saves; the second is refused and loses nothing', async () => {
    const { shared, tab1, tab2 } = await twoTabs();
    const id = tab1.get().records[0]!.id;
    tab2.openRecord(id);
    tab1.edit('density', 10);
    expect(await tab1.save()).toBe(true);
    tab2.edit('density', 18);
    expect(await tab2.save()).toBe(false);
    const s = tab2.get();
    expect(s.conflict).toMatchObject({ kind: 'record', recordId: id, reason: 'changed' });
    expect(s.save.kind).toBe('error');
    expect(s.doc.bubbles.density).toBe(18); // tab 2's edit is still there
    expect(s.dirty).toBe(true);
    expect((await shared.list('P')).items[0]!.doc.bubbles.density).toBe(10); // tab 1's save was not overwritten
    expect(JSON.parse(tab2.exportText()).bubbles.density).toBe(18);
  });

  it('resolution 1 — save as a copy: both versions exist', async () => {
    const { shared, tab1, tab2 } = await twoTabs();
    const id = tab1.get().records[0]!.id;
    tab2.openRecord(id);
    tab1.edit('density', 10);
    await tab1.save();
    tab2.edit('density', 18);
    await tab2.save();
    expect(await tab2.saveAsCopy('Mia versione')).toBe(true);
    expect(tab2.get().conflict).toBeNull();
    const all = (await shared.list('P')).items;
    expect(all.map((m) => m.doc.bubbles.density).sort()).toEqual([10, 18]);
    expect(all.find((m) => m.id === id)!.doc.bubbles.density).toBe(10);
  });

  it('resolution 2 — overwrite, only on explicit request', async () => {
    const { shared, tab1, tab2 } = await twoTabs();
    const id = tab1.get().records[0]!.id;
    tab2.openRecord(id);
    tab1.edit('density', 10);
    await tab1.save();
    tab2.edit('density', 18);
    await tab2.save();
    expect(await tab2.overwriteRecord()).toBe(true);
    expect(tab2.get().conflict).toBeNull();
    expect((await shared.list('P')).items.find((m) => m.id === id)!.doc.bubbles.density).toBe(18);
    // and tab 1, now stale in its turn, is refused
    tab1.edit('density', 11);
    expect(await tab1.save()).toBe(false);
    expect(tab1.get().conflict?.kind).toBe('record');
  });

  it('resolution 3 — take the other version (drops the unsaved edits of this tab)', async () => {
    const { tab1, tab2 } = await twoTabs();
    const id = tab1.get().records[0]!.id;
    tab2.openRecord(id);
    tab1.edit('density', 10);
    await tab1.save();
    tab2.edit('density', 18);
    await tab2.save();
    expect(await tab2.takeTheirs()).toBe(true);
    expect(tab2.get().doc.bubbles.density).toBe(10);
    expect(tab2.get().conflict).toBeNull();
    expect(tab2.get().dirty).toBe(false);
    tab2.edit('density', 12);
    expect(await tab2.save()).toBe(true);
  });

  it('a copy deleted in the other tab: saving is refused, then it can be re-created on request', async () => {
    const { shared, tab1, tab2 } = await twoTabs();
    const id = tab1.get().records[0]!.id;
    tab2.openRecord(id);
    expect(await tab1.deleteRecord(id)).toBe(true);
    tab2.edit('density', 17);
    expect(await tab2.save()).toBe(false);
    expect(tab2.get().conflict).toMatchObject({ kind: 'record', reason: 'deleted' });
    expect((await shared.list('P')).items).toEqual([]);
    expect(await tab2.takeTheirs()).toBe(false); // nothing to take
    expect(await tab2.overwriteRecord()).toBe(true);
    expect((await shared.list('P')).items.map((m) => [m.id, m.doc.bubbles.density])).toEqual([[id, 17]]);
  });

  it('deleting a copy that the other tab changed does not delete it', async () => {
    const { shared, tab1, tab2 } = await twoTabs();
    const id = tab1.get().records[0]!.id;
    tab2.openRecord(id);
    tab1.edit('density', 10);
    await tab1.save();
    expect(await tab2.deleteRecord(id)).toBe(false);
    expect(tab2.get().conflict).toMatchObject({ kind: 'delete', recordId: id });
    expect((await shared.list('P')).items).toHaveLength(1);
    await tick(10);
    expect(tab2.get().records[0]!.doc.bubbles.density).toBe(10); // the list was refreshed
  });

  it('the shared draft is not overwritten by the other tab: it asks', async () => {
    const shared = await open();
    const tab1 = mk(shared, 't1');
    const tab2 = mk(shared, 't2');
    await tab1.open('P');
    await tab2.open('P');
    tab1.edit('density', 4);
    await tab1.flushDraft();
    tab2.edit('density', 5);
    await tab2.flushDraft();
    expect(tab2.get().conflict).toMatchObject({ kind: 'draft' });
    expect((await shared.getDraft('P'))!.doc.bubbles.density).toBe(4);
    expect(tab2.get().doc.bubbles.density).toBe(5);
    // while the conflict stands, further edits in tab 2 do not write the draft either
    tab2.edit('density', 6);
    await tick(30);
    expect((await shared.getDraft('P'))!.doc.bubbles.density).toBe(4);
    expect(await tab2.overwriteDraft()).toBe(true);
    expect((await shared.getDraft('P'))!.doc.bubbles.density).toBe(6);
    expect(tab2.get().conflict).toBeNull();
  });

  it('draft: take the other tab\'s draft instead', async () => {
    const shared = await open();
    const tab1 = mk(shared, 't1');
    const tab2 = mk(shared, 't2');
    await tab1.open('P');
    await tab2.open('P');
    tab1.edit('density', 4);
    await tab1.flushDraft();
    tab2.edit('density', 5);
    await tab2.flushDraft();
    expect(await tab2.adoptDraft()).toBe(true);
    expect(tab2.get().doc.bubbles.density).toBe(4);
    expect(tab2.get().conflict).toBeNull();
    tab2.edit('density', 7);
    await tab2.flushDraft();
    expect((await shared.getDraft('P'))!.doc.bubbles.density).toBe(7);
  });

  it('saving a copy is not blocked by a draft conflict, and reconciles the draft pointer', async () => {
    const shared = await open();
    const tab1 = mk(shared, 't1');
    const tab2 = mk(shared, 't2');
    await tab1.open('P');
    await tab2.open('P');
    tab1.edit('density', 4);
    await tab1.flushDraft();
    tab2.edit('density', 5);
    await tab2.flushDraft();
    expect(tab2.get().conflict?.kind).toBe('draft');
    expect(await tab2.saveAsCopy('Dalla scheda 2')).toBe(true);
    expect(tab2.get().conflict).toBeNull();
    expect((await shared.list('P')).items.map((m) => m.doc.name)).toEqual(['Dalla scheda 2']);
  });
});

describe('workbench · unreadable stored draft', () => {
  it('is kept byte for byte and never written over, but copies can still be saved', async () => {
    const factory = new IDBFactory();
    const repo = await openJellyRepository(factory);
    await repo.commit({ drafts: { put: [draft('P')] } });
    await rawPut(factory, 'jelly-drafts', { projectId: 'P', doc: { ...soft(), schemaVersion: 99 }, recordId: null, basePreset: null, savedAt: iso, rev: 5 });
    const before = (await repo.inventory()).find((r) => r.store === 'drafts')!;
    expect(before.readable).toBe('newer');
    const wb = mk(repo);
    await wb.open('P');
    expect(wb.get().draftNote).toMatch(/conservata, non viene sovrascritta/);
    wb.edit('density', 2);
    await wb.flushDraft();
    await tick(30);
    expect(await wb.save()).toBe(true);
    const after = (await repo.inventory()).find((r) => r.store === 'drafts')!;
    expect(after.value).toEqual(before.value);
    expect(after.rev).toBe(5);
    expect((await repo.list('P')).items).toHaveLength(1);
  });
});

describe('workbench · destroy and cleanup', () => {
  it('flushes the pending draft on destroy and ignores the late answer', async () => {
    const inner = new MemoryJellyRepository('t');
    const repo = new ScriptedRepo(inner);
    const wb = mk(repo);
    await wb.open('A');
    wb.edit('density', 6);
    wb.destroy();
    await tick(20);
    expect((await inner.getDraft('A'))!.doc.bubbles.density).toBe(6);
    expect(() => wb.edit('density', 7)).not.toThrow();
  });
});

describe('Builder snapshots', () => {
  it('are keyed by project and component: another project or another component never sees them', async () => {
    const repo = new MemoryJellyRepository('t');
    await repo.commit({ links: { put: [link('p1', 'c1')] } });
    expect(await repo.getLink('p1', 'c1')).not.toBeNull();
    expect(await repo.getLink('p2', 'c1')).toBeNull();
    expect(await repo.getLink('p1', 'c2')).toBeNull();
  });

  it('a duplicated component, a duplicated project and an imported component start without a trial; nothing is copied implicitly', async () => {
    const repo = new MemoryJellyRepository('t');
    await repo.commit({ links: { put: [link('p1', 'c1')] } });
    // the stable Studio gives a duplicate/import a NEW component id and (for a project copy) a NEW project id
    expect(await repo.getLink('p1', 'c1-copy')).toBeNull();
    expect(await repo.getLink('p1-copy', 'c1')).toBeNull();
    expect((await repo.inventory())).toHaveLength(1);
  });

  it('deleting the component leaves the snapshot in place: detected as an orphan, recoverable, not deleted', async () => {
    const repo = new MemoryJellyRepository('t');
    await repo.commit({ links: { put: [link('p1', 'c-deleted')] } });
    const report = await scanJelly(repo, async () => ({ complete: true, reason: null, projectIds: new Set(['p1']), components: new Map([['p1', new Set(['c-other'])]]), unscopedComponents: new Set(), templateIds: new Set() }));
    expect(report.rows[0]).toMatchObject({ class: 'orphan', recoverable: true, componentId: 'c-deleted' });
    expect(await repo.getLink('p1', 'c-deleted')).not.toBeNull();
  });

  it('a snapshot reattaches when a component with the same id comes back (e.g. the same file is imported again)', async () => {
    const repo = new MemoryJellyRepository('t');
    await repo.commit({ links: { put: [link('p1', 'c1')] } });
    const live = (has: boolean): LiveSnapshot => ({ complete: true, reason: null, projectIds: new Set(['p1']), components: new Map([['p1', new Set(has ? ['c1'] : [])]]), unscopedComponents: new Set(), templateIds: new Set() });
    expect((await scanJelly(repo, async () => live(false))).rows[0]!.class).toBe('orphan');
    expect((await scanJelly(repo, async () => live(true))).rows[0]!.class).toBe('valid');
  });

  it('a stale second tab cannot overwrite a newer trial', async () => {
    const repo = new MemoryJellyRepository('t');
    const first = await repo.commit({ links: { put: [link('p1', 'c1')], expect: { [linkKey('p1', 'c1')]: null } } });
    const seen = first.links[linkKey('p1', 'c1')]!;
    await repo.commit({ links: { put: [{ ...link('p1', 'c1'), sourceId: 'jelly-clear' }], expect: { [linkKey('p1', 'c1')]: seen } } });
    await expect(repo.commit({ links: { put: [{ ...link('p1', 'c1'), sourceId: 'jelly-dense' }], expect: { [linkKey('p1', 'c1')]: seen } } })).rejects.toBeInstanceOf(JellyConflictError);
    expect((await repo.getLink('p1', 'c1'))?.sourceId).toBe('jelly-clear');
  });
});

describe('the repository exposes no unconditional purge', () => {
  it('purgeOrphans (a deletion based on a list of project ids) no longer exists', async () => {
    const repo = await openJellyRepository(new IDBFactory());
    expect('purgeOrphans' in repo).toBe(false);
    expect(Object.getOwnPropertyNames(Object.getPrototypeOf(repo)).filter((n) => /purge|delete|clear|remove/i.test(n))).toEqual([]);
  });
});
