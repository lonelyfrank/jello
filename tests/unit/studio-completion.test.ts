import { describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { createSolidDocument, serializeMaterial, applyControl, MATERIALS } from '../../src/model';
import { bindMaterial, bindingState, componentTemplate, materialRevision, switchMaterialFamily } from '../../src/components';
import { openRepository } from '../../src/lab/storage/repository';
import { inspectJsonText } from '../../src/project/importer';
import { buildProjectPackage, readProjectEntries } from '../../src/project/package';
import { createProject } from '../../src/project/document';
import { minimalAssets } from '../../src/project/defaults';
import { optionsFromQuery } from '../../src/stage/url';

describe('Solid studio persistence', () => {
  it('validates controls atomically, stores material and draft, and reopens them', async () => {
    const doc = createSolidDocument({ id: 'my-solid', name: 'My Solid' });
    const spec = MATERIALS.get('solid')!;
    expect(applyControl(spec, doc, { key: 'elevation' }, 99).ok).toBe(false);
    const result = applyControl(spec, doc, { key: 'fill', state: 'hover' }, '#123456');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const factory = new IDBFactory();
    const repo = await openRepository(factory, 'solid-studio');
    await repo.putMaterial({ id: doc.id, doc: result.doc, createdAt: '', updatedAt: '' });
    await repo.putProject({ id: 'last', materialId: doc.id, draft: result.doc, options: optionsFromQuery(new URLSearchParams(), false).options, savedAt: '' });
    repo.close();
    const again = await openRepository(factory, 'solid-studio');
    expect((await again.listMaterials()).items[0]!.doc).toEqual(result.doc);
    expect((await again.getProject())!.draft).toEqual(result.doc);
    again.close();
  });

  it('imports Solid JSON and carries it through a project package', async () => {
    const doc = createSolidDocument({ id: 'my-solid', name: 'My Solid' });
    expect(inspectJsonText('solid.json', serializeMaterial(doc))).toMatchObject({ kind: 'material', doc });
    const project = createProject({ id: 'p-solid', name: 'Solid project', assets: minimalAssets() });
    const pkg = buildProjectPackage(project, { materials: [doc], components: [], colors: true, icons: 'all', fonts: true });
    const parsed = readProjectEntries(pkg);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value.materials[0]!.doc).toEqual(doc);
  });

  it('preserves component data across families and detects revised/diverged Solid presets', () => {
    const button = componentTemplate('button')!.create();
    const solid = switchMaterialFamily(button, 'solid').definition;
    const glass = switchMaterialFamily(solid, 'glass').definition;
    for (const field of ['structure', 'content', 'layout', 'interactions', 'responsive'] as const) expect(glass[field]).toEqual(button[field]);
    const doc = createSolidDocument({ id: 'my-solid', name: 'My Solid' });
    const binding = bindMaterial(doc, doc.id);
    const changed = { ...doc, material: { ...doc.material, fill: '#123456' } };
    expect(materialRevision(doc)).not.toBe(materialRevision(changed));
    expect(bindingState(binding, changed, false)).toBe('outdated');
    expect(bindingState(binding, changed, true)).toBe('diverged');
  });
});
