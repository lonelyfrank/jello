import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { builtinMaterial, createGlassDocument, serializeMaterial } from '../../src/model';
import { serializeParams, defaultParams } from '../../src/core/params';
import { Autosaver, type SaveState } from '../../src/lab/storage/autosave';
import { componentTemplate } from '../../src/components';
import { DB_VERSION, MemoryRepository, openRepository, StorageError, toStorageError, type Repository } from '../../src/lab/storage/repository';
import { optionsFromQuery } from '../../src/lab/state';

const options = optionsFromQuery(new URLSearchParams(''), false).options;
const doc = createGlassDocument({ id: 'user-abc', name: 'Mio glass', params: { ...defaultParams(), refraction: 33 } });
const iso = '2026-10-29T10:00:00.000Z';

describe('IndexedDB repository', () => {
  it('saves, lists and reopens materials and the last project', async () => {
    const factory = new IDBFactory();
    const repo = await openRepository(factory, 'jello-test');
    expect(repo.persistent).toBe(true);
    await repo.putMaterial({ id: doc.id, doc, createdAt: iso, updatedAt: iso });
    await repo.putProject({ id: 'last', materialId: doc.id, draft: null, options, savedAt: iso, imageHash: null });
    repo.close();
    const again = await openRepository(factory, 'jello-test');
    const list = await again.listMaterials();
    expect(list.items.map((m) => m.doc)).toEqual([doc]);
    expect((await again.getProject())?.materialId).toBe(doc.id);
    await again.deleteMaterial(doc.id);
    expect((await again.listMaterials()).items).toEqual([]);
  });

  it('keeps the draft of an edited built-in and validates it on read', async () => {
    const factory = new IDBFactory();
    const repo = await openRepository(factory, 'jello-draft');
    const draft = { ...builtinMaterial('navbar')!.doc, material: { ...builtinMaterial('navbar')!.doc.material, blur: 9 } };
    await repo.putProject({ id: 'last', materialId: 'navbar', draft, options, savedAt: iso });
    expect((await repo.getProject())?.draft?.material.blur).toBe(9);
  });

  it('migrates a version 1 database without losing records, and reads stored v1 documents', async () => {
    const factory = new IDBFactory();
    await new Promise<void>((resolve, reject) => {
      const r = factory.open('jello-old', 1);
      r.onupgradeneeded = () => {
        r.result.createObjectStore('materials', { keyPath: 'id' });
        r.result.createObjectStore('projects', { keyPath: 'id' });
      };
      r.onsuccess = () => {
        const tx = r.result.transaction('materials', 'readwrite');
        // A record written by an older lab: the jello-glass v1 format.
        tx.objectStore('materials').put({ id: 'old-1', doc: JSON.parse(serializeParams({ ...defaultParams(), blur: 11 })), createdAt: iso, updatedAt: iso });
        tx.objectStore('materials').put({ id: 'broken', doc: { format: 'jello-material', schemaVersion: 99 }, createdAt: iso, updatedAt: iso });
        tx.oncomplete = () => {
          r.result.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      r.onerror = () => reject(r.error);
    });
    const repo = await openRepository(factory, 'jello-old');
    const list = await repo.listMaterials();
    expect(list.items).toHaveLength(1);
    expect(list.items[0]!.id).toBe('old-1');
    expect(list.items[0]!.doc.material.blur).toBe(11);
    expect(list.skipped[0]).toMatch(/broken: schemaVersion 99/);
    // Version 2 added the assets store.
    await repo.putAsset({ hash: 'a'.repeat(64), type: 'image/png', blob: new Blob(['x']), name: 'x.png' });
    expect((await repo.getAsset('a'.repeat(64)))?.name).toBe('x.png');
    // Version 3 added the components store; materials of version 1 are still there.
    const demo = componentTemplate('mobile-navbar')!.create();
    await repo.putComponent({ id: 'cmp-1', doc: { ...demo, id: 'cmp-1' }, createdAt: iso, updatedAt: iso });
    expect((await repo.listComponents()).items.map((c) => c.id)).toEqual(['cmp-1']);
    expect((await repo.listMaterials()).items).toHaveLength(1);
    expect(DB_VERSION).toBe(4);
  });

  it('falls back to a memory repository that says it is not persistent', async () => {
    const repo = await openRepository(null);
    expect(repo.persistent).toBe(false);
    expect(repo.reason).toMatch(/solo in questa scheda/);
    const broken = { open: () => { throw new DOMException('denied', 'SecurityError'); } } as unknown as IDBFactory;
    const r2 = await openRepository(broken);
    expect(r2.persistent).toBe(false);
  });

  it('maps storage failures to readable kinds', () => {
    expect(toStorageError(new DOMException('full', 'QuotaExceededError')).kind).toBe('quota');
    expect(toStorageError(new DOMException('no', 'SecurityError')).kind).toBe('unavailable');
    expect(toStorageError(new Error('x')).kind).toBe('failed');
  });
});

describe('autosave', () => {
  const states = () => {
    const seen: SaveState[] = [];
    return { seen, on: (s: SaveState) => seen.push(s) };
  };

  it('debounces writes and reports "saved" only after the write resolved', async () => {
    let writes = 0;
    const s = states();
    const a = new Autosaver(async () => void writes++, s.on, 20);
    a.schedule();
    a.schedule();
    a.schedule();
    expect(a.status.kind).toBe('pending');
    await new Promise((r) => setTimeout(r, 60));
    expect(writes).toBe(1);
    expect(a.status.kind).toBe('saved');
  });

  it('never claims a save when storage fails (quota)', async () => {
    const s = states();
    const a = new Autosaver(async () => {
      throw new DOMException('full', 'QuotaExceededError');
    }, s.on, 5);
    await a.flush();
    expect(a.status).toMatchObject({ kind: 'error', error: 'quota' });
    expect(s.seen.some((x) => x.kind === 'saved')).toBe(false);
  });

  it('marks saves to the memory fallback as not persistent', async () => {
    const repo: Repository = new MemoryRepository('IndexedDB non disponibile');
    const a = new Autosaver(() => repo.putProject({ id: 'last', materialId: 'jello', draft: null, options, savedAt: iso }), () => {}, 5, repo.reason);
    await a.flush();
    expect(a.status.kind).toBe('memory');
  });

  it('serializes overlapping flushes', async () => {
    let running = 0;
    let max = 0;
    const a = new Autosaver(async () => {
      running++;
      max = Math.max(max, running);
      await new Promise((r) => setTimeout(r, 10));
      running--;
    }, () => {}, 1);
    await Promise.all([a.flush(), a.flush(), a.flush()]);
    expect(max).toBe(1);
  });

  it('StorageError keeps its kind', () => {
    expect(new StorageError('blocked', 'x').kind).toBe('blocked');
    expect(serializeMaterial(doc)).toContain('"user-abc"');
  });

  it('stores project documents apart from materials, and keeps the owner of a record', async () => {
    const { createProject } = await import('../../src/project/document');
    const { kitAssets } = await import('../../src/project/defaults');
    const repo = await openRepository(new IDBFactory(), 'projects-db');
    const p = createProject({ id: 'prj-1', name: 'Kit', assets: kitAssets(), at: iso });
    await repo.putProjectDoc(p);
    await repo.putProjectDoc({ ...p, id: 'prj-2', name: 'Altro' });
    expect((await repo.listProjectDocs()).items.map((x) => x.id)).toEqual(['prj-1', 'prj-2']);
    await repo.deleteProjectDoc('prj-2');
    expect((await repo.listProjectDocs()).items.map((x) => x.id)).toEqual(['prj-1']);
    // A record with a wrong shape is reported, never swallowed.
    const mem = new MemoryRepository('test');
    await mem.putProjectDoc(p);
    expect((await mem.listProjectDocs()).items).toHaveLength(1);
    const doc = createGlassDocument({ id: 'user-a', name: 'A' });
    await repo.putMaterial({ id: 'user-a', doc, projectId: 'prj-1', createdAt: iso, updatedAt: iso });
    expect((await repo.listMaterials()).items[0]!.projectId).toBe('prj-1');
    repo.close();
  });
});
