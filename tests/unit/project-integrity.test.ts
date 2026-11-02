/**
 * Material ↔ component links across projects (P0-B) and atomic project
 * operations (P1). ProjectActions runs against the real IndexedDB
 * repository (fake-indexeddb) through a small host that mirrors what
 * LabSession gives it; propagation uses the session's own function.
 */
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { bindMaterial, bindingState, componentTemplate, hasMaterialOverrides, type ComponentDefinition } from '../../src/components';
import { glassParams, withGlassParams, type MaterialDocument } from '../../src/model';
import { numberedName } from '../../src/project/document';
import { inspectFile } from '../../src/project/importer';
import { buildProjectPackage, packageBytes } from '../../src/project/package';
import { materialIdMap, remapMaterialReference, unresolvedReferences } from '../../src/project/references';
import type { ProjectDoc } from '../../src/project/types';
import { followingComponents } from '../../src/lab/material-links';
import { ProjectActions } from '../../src/lab/projects';
import { Autosaver } from '../../src/lab/storage/autosave';
import { openRepository, StorageError, type Repository, type StoredComponent, type StoredMaterial, type WriteBatch } from '../../src/lab/storage/repository';

/** Fails every commit while `fail` is set, like a quota error or an aborted transaction. */
function failing(repo: Repository): Repository & { fail: StorageError | null; commits: number } {
  const r = Object.create(repo) as Repository & { fail: StorageError | null; commits: number };
  r.fail = null;
  r.commits = 0;
  r.commit = async (b: WriteBatch) => {
    r.commits++;
    if (r.fail) throw r.fail;
    return repo.commit(b);
  };
  return r;
}

async function lab(name = `jello-${Math.random()}`) {
  const factory = new IDBFactory();
  const repo = failing(await openRepository(factory, name));
  const state = { projects: [] as ProjectDoc[], projectId: null as string | null };
  const notices: string[] = [];
  const host = {
    repo,
    state,
    userMaterials: new Map<string, StoredMaterial>(),
    userComponents: new Map<string, StoredComponent>(),
    store: { set: (patch: Partial<typeof state>) => Object.assign(state, patch) },
    autosaver: new Autosaver(async () => {}, () => {}, 1),
    switchProject(id: string) {
      state.projectId = id;
    },
    rescope() {},
    notify(t: string) {
      notices.push(t);
    },
    touch() {},
    announce() {},
    exclusive<T>(fn: () => Promise<T>) {
      return this.autosaver.exclusive(fn);
    },
  };
  // The host is a structural stand-in for LabSession: only what ProjectActions uses.
  const projects = new ProjectActions(host as never);
  /** Edits a personal material like the Material Lab does, then lets saved components follow. */
  const editMaterial = (id: string, blur: number) => {
    const rec = host.userMaterials.get(id)!;
    const doc = withGlassParams(rec.doc as Extract<MaterialDocument, { family: 'glass' }>, { ...glassParams(rec.doc as Extract<MaterialDocument, { family: 'glass' }>), blur });
    host.userMaterials.set(id, { ...rec, doc });
    for (const c of followingComponents(host.userMaterials.get(id)!, host.userComponents.values(), null)) host.userComponents.set(c.id, c);
  };
  const of = (projectId: string) => ({
    materials: [...host.userMaterials.values()].filter((m) => m.projectId === projectId),
    components: [...host.userComponents.values()].filter((c) => c.projectId === projectId),
  });
  return { factory, name, repo, host, projects, editMaterial, of, notices };
}

const blurOf = (c: StoredComponent) => (c.doc.material.document as Extract<MaterialDocument, { family: 'glass' }>).material.blur;

/** Project A: one personal material and a navbar linked to it. */
async function projectA(l: Awaited<ReturnType<typeof lab>>) {
  const a = await l.projects.create({ name: 'A', platform: 'web', previewTheme: 'system', start: 'kit', presets: ['jello'], navbar: true });
  const mat = l.of(a).materials[0]!;
  const cmp = l.of(a).components[0]!;
  const linked: StoredComponent = { ...cmp, doc: { ...cmp.doc, material: bindMaterial(mat.doc, mat.id) } };
  l.host.userComponents.set(cmp.id, linked);
  await l.repo.commit({ components: { put: [linked] } });
  return { a, mat, cmp: linked };
}

describe('reference remapping (pure)', () => {
  const nav = componentTemplate('mobile-navbar')!.create();
  const local = (preset: string): ComponentDefinition => ({ ...nav, material: { ...nav.material, preset } });

  it('rewrites local links through the map, keeps built-ins, unlinks the rest', () => {
    const ids = materialIdMap([['user-a', 'user-b']]).map;
    expect(remapMaterialReference(local('user-a'), ids).doc.material.preset).toBe('user-b');
    expect(remapMaterialReference(local('jello'), ids)).toMatchObject({ unlinked: null, doc: { material: { preset: 'jello' } } });
    const missing = remapMaterialReference(local('user-gone'), ids);
    expect(missing.unlinked).toBe('user-gone');
    expect(missing.doc.material).toMatchObject({ preset: null, revision: null });
    // The embedded document stays: the component looks the same.
    expect(missing.doc.material.document).toEqual(nav.material.document);
  });

  it('treats a source id given twice as ambiguous instead of picking one', () => {
    const m = materialIdMap([['dup', 'x1'], ['dup', 'x2'], ['ok', 'y']]);
    expect(m.ambiguous).toEqual(new Set(['dup']));
    expect(m.map.has('dup')).toBe(false);
    expect(remapMaterialReference(local('dup'), m.map).unlinked).toBe('dup');
  });

  it('finds links that do not resolve in a project', () => {
    expect(unresolvedReferences([local('user-a'), local('jello'), nav], new Set(['user-a']))).toHaveLength(0);
    expect(unresolvedReferences([local('user-x')], new Set(['user-a']))).toHaveLength(1);
  });

  it('numbers new names by the first free slot, not by a count', () => {
    expect(numberedName('Nuovo glass', new Set())).toBe('Nuovo glass 1');
    expect(numberedName('Nuovo glass', new Set(['Nuovo glass 1', 'Nuovo glass 3']))).toBe('Nuovo glass 2');
    // Two materials, the first deleted: a count would give «2» again.
    expect(numberedName('Nuovo glass', new Set(['Nuovo glass 2']))).toBe('Nuovo glass 1');
  });
});

describe('projects stay independent', () => {
  it('Test A — duplicating A into B, then editing A, leaves B unchanged', async () => {
    const l = await lab();
    const { a, mat } = await projectA(l);
    const b = (await l.projects.duplicate(a))!;
    const [bm] = l.of(b).materials;
    const [bc] = l.of(b).components;
    expect(bm!.id).not.toBe(mat.id);
    // B's component links to B's copy of the material, not to A's.
    expect(bc!.doc.material.preset).toBe(bm!.id);
    expect(unresolvedReferences(l.of(b).components.map((c) => c.doc), new Set(l.of(b).materials.map((m) => m.id)))).toEqual([]);
    const before = blurOf(bc!);
    l.editMaterial(mat.id, 17);
    expect(blurOf(l.of(a).components[0]!)).toBe(17);
    expect(blurOf(l.host.userComponents.get(bc!.id)!)).toBe(before);
  });

  it('a legacy component of B still linked to A’s material does not follow A', async () => {
    const l = await lab();
    const { a, mat, cmp } = await projectA(l);
    const b = await l.projects.create({ name: 'B', platform: 'web', previewTheme: 'system', start: 'blank' });
    // As a duplicate made by an earlier version left it: B's component names A's material.
    const legacy: StoredComponent = { ...cmp, id: 'cmp-legacy', projectId: b, doc: { ...cmp.doc, id: 'cmp-legacy' } };
    l.host.userComponents.set(legacy.id, legacy);
    l.editMaterial(mat.id, 31);
    expect(blurOf(l.of(a).components[0]!)).toBe(31);
    expect(l.host.userComponents.get(legacy.id)!.doc).toBe(legacy.doc);
  });

  it('Test B — editing the copy in B updates B only, and respects local overrides', async () => {
    const l = await lab();
    const { a } = await projectA(l);
    const b = (await l.projects.duplicate(a))!;
    const bm = l.of(b).materials[0]!;
    const bc = l.of(b).components[0]!;
    // A second component in B with its own material values does not follow.
    const own: StoredComponent = { ...bc, id: 'cmp-own', doc: { ...bc.doc, id: 'cmp-own', material: { ...bc.doc.material, params: { blur: 3 } } } };
    l.host.userComponents.set(own.id, own);
    l.editMaterial(bm.id, 22);
    expect(blurOf(l.host.userComponents.get(bc.id)!)).toBe(22);
    expect(l.host.userComponents.get(own.id)!.doc).toBe(own.doc);
    expect(bindingState(own.doc.material, l.host.userMaterials.get(bm.id)!.doc, hasMaterialOverrides(own.doc))).toBe('diverged');
    const aBlur = blurOf(l.of(a).components[0]!);
    expect(aBlur).not.toBe(22);
  });

  it('Test C — export then import as a new project relinks to the imported materials', async () => {
    const l = await lab();
    const { a } = await projectA(l);
    const src = l.host.state.projects.find((p) => p.id === a)!;
    const files = buildProjectPackage(src, { materials: l.of(a).materials.map((m) => m.doc), components: l.of(a).components.map((c) => c.doc), colors: true, icons: 'all', fonts: false });
    const item = await inspectFile('a.jello', packageBytes(files));
    expect(item.kind).toBe('project');
    const c = await l.projects.create({ name: 'C', platform: 'web', previewTheme: 'system', start: 'file', items: [item] });
    const [cm] = l.of(c).materials;
    const [cc] = l.of(c).components;
    expect(cc!.doc.material.preset).toBe(cm!.id);
    expect(cm!.id).not.toBe(l.of(a).materials[0]!.id);
    l.editMaterial(cm!.id, 9);
    expect(blurOf(l.host.userComponents.get(cc!.id)!)).toBe(9);
    expect(blurOf(l.of(a).components[0]!)).not.toBe(9);

    // The same package imported into an existing project: links follow the conflict choices.
    l.host.state.projectId = a;
    const out = await l.projects.applyImport([item], {});
    expect(out.unlinked).toEqual([]);
    const ids = new Set(l.of(a).materials.map((m) => m.id));
    expect(unresolvedReferences(l.of(a).components.map((x) => x.doc), ids)).toEqual([]);
  });

  it('Test D — a component whose material is missing is unlinked and reported, never relinked by guess', async () => {
    const l = await lab();
    const { a } = await projectA(l);
    const src = l.host.state.projects.find((p) => p.id === a)!;
    // The package carries the component but not its material.
    const files = buildProjectPackage(src, { materials: [], components: l.of(a).components.map((c) => c.doc), colors: false, icons: 'none', fonts: false });
    const item = await inspectFile('solo-componenti.jello', packageBytes(files));
    const d = await l.projects.create({ name: 'D', platform: 'web', previewTheme: 'system', start: 'file', items: [item] });
    const [dc] = l.of(d).components;
    expect(dc!.doc.material.preset).toBeNull();
    expect(dc!.doc.material.document).toBeDefined();
    expect(l.notices.join(' ')).toMatch(/Materiale non incluso/);
    // Into an existing project the outcome lists it.
    l.host.state.projectId = a;
    const out = await l.projects.applyImport([item], {});
    expect(out.unlinked.length).toBe(1);
  });
});

describe('project operations are atomic', () => {
  it('a failed duplicate leaves no project, material or component behind', async () => {
    const l = await lab();
    const { a } = await projectA(l);
    const before = { projects: l.host.state.projects.length, materials: l.host.userMaterials.size, components: l.host.userComponents.size };
    l.repo.fail = new StorageError('quota', 'Spazio di archiviazione esaurito: il salvataggio non è riuscito.');
    expect(await l.projects.duplicate(a)).toBeNull();
    expect(l.notices.at(-1)).toMatch(/non duplicato.*Spazio/);
    expect({ projects: l.host.state.projects.length, materials: l.host.userMaterials.size, components: l.host.userComponents.size }).toEqual(before);
    expect(l.host.state.projectId).toBe(a);
    // Nothing reached the database either.
    const again = await openRepository(l.factory, l.name);
    expect((await again.listProjectDocs()).items).toHaveLength(1);
    expect((await again.listMaterials()).items).toHaveLength(before.materials);
  });

  it('a failed import changes nothing; a failed delete keeps the project', async () => {
    const l = await lab();
    const { a } = await projectA(l);
    const src = l.host.state.projects.find((p) => p.id === a)!;
    const item = await inspectFile('a.jello', packageBytes(buildProjectPackage(src, { materials: l.of(a).materials.map((m) => m.doc), components: [], colors: true, icons: 'all', fonts: false })));
    const assets = src.assets;
    l.repo.fail = new StorageError('failed', 'Salvataggio non riuscito: AbortError');
    await expect(l.projects.applyImport([item], {})).rejects.toThrow(/AbortError/);
    expect(l.of(a).materials).toHaveLength(1);
    expect(l.host.state.projects.find((p) => p.id === a)!.assets).toBe(assets);
    expect(await l.projects.remove(a)).toBe(false);
    expect(l.host.state.projects.some((p) => p.id === a)).toBe(true);
    expect(l.of(a).materials).toHaveLength(1);
    l.repo.fail = null;
    expect(await l.projects.remove(a)).toBe(true);
    const again = await openRepository(l.factory, l.name);
    expect((await again.listProjectDocs()).items).toEqual([]);
    expect((await again.listMaterials()).items).toEqual([]);
    expect((await again.listComponents()).items).toEqual([]);
  });

  it('an edited project document stays dirty until a write commits it', async () => {
    const l = await lab();
    await projectA(l);
    l.projects.rename(l.host.state.projectId!, 'Rinominato');
    const pending = l.projects.pending();
    expect(pending.map((p) => p.name)).toEqual(['Rinominato']);
    // Failed write: nothing is marked committed, the edit is still pending.
    expect(l.projects.pending()).toHaveLength(1);
    // An edit made while the write ran keeps the document dirty after it commits.
    l.projects.rename(l.host.state.projectId!, 'Ancora');
    l.projects.committed(pending);
    expect(l.projects.pending().map((p) => p.name)).toEqual(['Ancora']);
    l.projects.committed(l.projects.pending());
    expect(l.projects.pending()).toEqual([]);
  });
});
