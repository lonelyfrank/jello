/**
 * Local persistence of the lab (IndexedDB). Lab only: the runtime never
 * imports this module.
 *
 *   materials  personal materials (built-ins live in code and are never stored)
 *   projects   'last': the material open in the editor, its unsaved draft and the view
 *   assets     images chosen by the user, by SHA-256 (added in DB version 2)
 *   components saved components of the builder, jello-component documents (DB version 3)
 *   projectdocs jello-project documents: settings, favourites and assets (DB version 4)
 *
 * Materials and components carry an optional `projectId`; records written before
 * projects existed have none and are adopted by the first project.
 *
 * Every stored document is validated again when read (and migrated if it
 * is an older format). Failures are reported as StorageError with a kind,
 * never swallowed: the UI must not claim a save that did not happen.
 */

import { parseGlassMaterial, type GlassDocument } from '../../model';
import type { ComponentDefinition } from '../../components';
import { importComponent } from '../../migration';
import { parseProject } from '../../project/document';
import type { ProjectDoc } from '../../project/types';
import type { ViewOptions } from '../../stage/view';

export const DB_NAME = 'jello-lab';
export const DB_VERSION = 4;

export type StorageErrorKind = 'unavailable' | 'quota' | 'blocked' | 'failed';

export class StorageError extends Error {
  constructor(
    readonly kind: StorageErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'StorageError';
  }
}

export interface StoredMaterial {
  id: string;
  doc: GlassDocument;
  /** Owning project; absent on records from before projects. */
  projectId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoredComponent {
  id: string;
  doc: ComponentDefinition;
  projectId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectRecord {
  id: 'last';
  materialId: string;
  /** Working document when it differs from the stored one (e.g. an edited built-in). */
  draft: GlassDocument | null;
  options: ViewOptions;
  /** Local image of the photo scene / texture (assets store). */
  imageHash?: string | null;
  /** Builder (DB version 3): open workspace, component, and the draft of an edited template. */
  workspace?: 'material' | 'builder';
  /** Active project and the page shown (DB version 4). */
  projectId?: string | null;
  page?: 'home' | 'lab' | 'assets' | 'settings';
  componentId?: string | null;
  componentDraft?: ComponentDefinition | null;
  savedAt: string;
}

export interface StoredAsset {
  hash: string;
  type: string;
  blob: Blob;
  name: string;
}

export interface ReadReport<T> {
  items: T[];
  /** Records that could not be read (invalid or from a newer version). */
  skipped: string[];
}

export interface Repository {
  /** False for the in-memory fallback: nothing survives a reload. */
  readonly persistent: boolean;
  readonly reason: string | null;
  listMaterials(): Promise<ReadReport<StoredMaterial>>;
  putMaterial(m: StoredMaterial): Promise<void>;
  deleteMaterial(id: string): Promise<void>;
  getProject(): Promise<ProjectRecord | null>;
  putProject(p: ProjectRecord): Promise<void>;
  putAsset(a: StoredAsset): Promise<void>;
  getAsset(hash: string): Promise<StoredAsset | null>;
  listComponents(): Promise<ReadReport<StoredComponent>>;
  putComponent(c: StoredComponent): Promise<void>;
  deleteComponent(id: string): Promise<void>;
  listProjectDocs(): Promise<ReadReport<ProjectDoc>>;
  putProjectDoc(p: ProjectDoc): Promise<void>;
  deleteProjectDoc(id: string): Promise<void>;
  close(): void;
}

/** Schema upgrades, one step per version. Data of earlier versions is kept. */
export function upgrade(db: IDBDatabase, tx: IDBTransaction, oldVersion: number): void {
  if (oldVersion < 1) {
    db.createObjectStore('materials', { keyPath: 'id' });
    db.createObjectStore('projects', { keyPath: 'id' });
  }
  if (oldVersion < 2) {
    db.createObjectStore('assets', { keyPath: 'hash' });
    tx.objectStore('materials').createIndex('updatedAt', 'updatedAt');
  }
  if (oldVersion < 3) {
    db.createObjectStore('components', { keyPath: 'id' });
  }
  if (oldVersion < 4) {
    db.createObjectStore('projectdocs', { keyPath: 'id' });
  }
}

export function toStorageError(e: unknown): StorageError {
  if (e instanceof StorageError) return e;
  const name = (e as { name?: string } | null)?.name ?? '';
  const message = (e as { message?: string } | null)?.message ?? String(e);
  if (name === 'QuotaExceededError') return new StorageError('quota', 'Spazio di archiviazione esaurito: il salvataggio non è riuscito.');
  if (name === 'SecurityError' || name === 'InvalidStateError') {
    return new StorageError('unavailable', `Archiviazione locale non disponibile (${name}).`);
  }
  return new StorageError('failed', `Salvataggio non riuscito: ${message}`);
}

const req = <T>(r: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

/** Resolves only when the transaction commits: that is the moment a save is real. */
const done = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new DOMException('Transazione annullata', 'AbortError'));
    tx.onerror = () => reject(tx.error);
  });

class IdbRepository implements Repository {
  readonly persistent = true;
  readonly reason = null;
  constructor(private readonly db: IDBDatabase) {}

  async listMaterials(): Promise<ReadReport<StoredMaterial>> {
    const tx = this.db.transaction('materials', 'readonly');
    const raw = await req(tx.objectStore('materials').getAll());
    const items: StoredMaterial[] = [];
    const skipped: string[] = [];
    for (const r of raw as { id: string; doc: unknown; projectId?: string; createdAt: string; updatedAt: string }[]) {
      const parsed = parseGlassMaterial(r.doc);
      if (parsed.ok) items.push({ id: r.id, doc: { ...parsed.doc, id: r.id }, ...(r.projectId ? { projectId: r.projectId } : {}), createdAt: r.createdAt, updatedAt: r.updatedAt });
      else skipped.push(`${r.id}: ${parsed.errors[0] ?? 'non leggibile'}`);
    }
    items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return { items, skipped };
  }

  async putMaterial(m: StoredMaterial): Promise<void> {
    await this.write('materials', (s) => s.put(m));
  }

  async deleteMaterial(id: string): Promise<void> {
    await this.write('materials', (s) => s.delete(id));
  }

  async getProject(): Promise<ProjectRecord | null> {
    const tx = this.db.transaction('projects', 'readonly');
    const raw = (await req(tx.objectStore('projects').get('last'))) as (Omit<ProjectRecord, 'draft' | 'componentDraft'> & { draft: unknown; componentDraft?: unknown }) | undefined;
    if (!raw) return null;
    let draft: GlassDocument | null = null;
    if (raw.draft) {
      const parsed = parseGlassMaterial(raw.draft);
      if (parsed.ok) draft = parsed.doc;
    }
    let componentDraft: ComponentDefinition | null = null;
    if (raw.componentDraft) {
      const parsed = importComponent(raw.componentDraft);
      if (parsed.ok) componentDraft = parsed.doc;
    }
    return { ...raw, draft, componentDraft };
  }

  async listComponents(): Promise<ReadReport<StoredComponent>> {
    const tx = this.db.transaction('components', 'readonly');
    const raw = await req(tx.objectStore('components').getAll());
    const items: StoredComponent[] = [];
    const skipped: string[] = [];
    for (const r of raw as { id: string; doc: unknown; projectId?: string; createdAt: string; updatedAt: string }[]) {
      const parsed = importComponent(r.doc);
      if (parsed.ok) items.push({ id: r.id, doc: { ...parsed.doc, id: r.id }, ...(r.projectId ? { projectId: r.projectId } : {}), createdAt: r.createdAt, updatedAt: r.updatedAt });
      else skipped.push(`${r.id}: ${parsed.errors[0] ?? 'non leggibile'}`);
    }
    items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return { items, skipped };
  }

  async putComponent(c: StoredComponent): Promise<void> {
    await this.write('components', (s) => s.put(c));
  }

  async deleteComponent(id: string): Promise<void> {
    await this.write('components', (s) => s.delete(id));
  }

  async putProject(p: ProjectRecord): Promise<void> {
    await this.write('projects', (s) => s.put(p));
  }

  async listProjectDocs(): Promise<ReadReport<ProjectDoc>> {
    const tx = this.db.transaction('projectdocs', 'readonly');
    const raw = await req(tx.objectStore('projectdocs').getAll());
    const items: ProjectDoc[] = [];
    const skipped: string[] = [];
    for (const r of raw as { id?: string }[]) {
      const parsed = parseProject(r);
      if (parsed.ok) items.push(parsed.doc);
      else skipped.push(`${r.id ?? 'progetto'}: ${parsed.errors[0] ?? 'non leggibile'}`);
    }
    items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return { items, skipped };
  }

  async putProjectDoc(p: ProjectDoc): Promise<void> {
    await this.write('projectdocs', (s) => s.put(p));
  }

  async deleteProjectDoc(id: string): Promise<void> {
    await this.write('projectdocs', (s) => s.delete(id));
  }

  async putAsset(a: StoredAsset): Promise<void> {
    await this.write('assets', (s) => s.put(a));
  }

  async getAsset(hash: string): Promise<StoredAsset | null> {
    const tx = this.db.transaction('assets', 'readonly');
    return ((await req(tx.objectStore('assets').get(hash))) as StoredAsset | undefined) ?? null;
  }

  close(): void {
    this.db.close();
  }

  private async write(store: string, op: (s: IDBObjectStore) => IDBRequest) {
    try {
      const tx = this.db.transaction(store, 'readwrite');
      op(tx.objectStore(store));
      await done(tx);
    } catch (e) {
      throw toStorageError(e);
    }
  }
}

/** Fallback when IndexedDB cannot be opened. Says so; never pretends to persist. */
export class MemoryRepository implements Repository {
  readonly persistent = false;
  private readonly materials = new Map<string, StoredMaterial>();
  private project: ProjectRecord | null = null;
  private readonly assets = new Map<string, StoredAsset>();
  private readonly components = new Map<string, StoredComponent>();
  private readonly projectDocs = new Map<string, ProjectDoc>();
  constructor(readonly reason: string) {}

  async listMaterials() {
    return { items: [...this.materials.values()], skipped: [] };
  }
  async putMaterial(m: StoredMaterial) {
    this.materials.set(m.id, structuredClone(m));
  }
  async deleteMaterial(id: string) {
    this.materials.delete(id);
  }
  async getProject() {
    return this.project;
  }
  async putProject(p: ProjectRecord) {
    this.project = structuredClone(p);
  }
  async putAsset(a: StoredAsset) {
    this.assets.set(a.hash, a);
  }
  async getAsset(hash: string) {
    return this.assets.get(hash) ?? null;
  }
  async listComponents() {
    return { items: [...this.components.values()], skipped: [] };
  }
  async putComponent(c: StoredComponent) {
    this.components.set(c.id, structuredClone(c));
  }
  async deleteComponent(id: string) {
    this.components.delete(id);
  }
  async listProjectDocs() {
    return { items: [...this.projectDocs.values()], skipped: [] };
  }
  async putProjectDoc(p: ProjectDoc) {
    this.projectDocs.set(p.id, structuredClone(p));
  }
  async deleteProjectDoc(id: string) {
    this.projectDocs.delete(id);
  }
  close() {}
}

/** `factory: null` means IndexedDB is not available (tests, private modes that remove it). */
export async function openRepository(factory: IDBFactory | null = globalThis.indexedDB ?? null, name = DB_NAME): Promise<Repository> {
  if (!factory) return new MemoryRepository('IndexedDB non disponibile in questo browser: le modifiche restano solo in questa scheda.');
  try {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = factory.open(name, DB_VERSION);
      r.onupgradeneeded = (e) => upgrade(r.result, r.transaction!, e.oldVersion);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.onblocked = () => reject(new StorageError('blocked', 'Database bloccato da un’altra scheda con una versione precedente.'));
    });
    // Another tab upgrading later must not be blocked by this one.
    db.onversionchange = () => db.close();
    return new IdbRepository(db);
  } catch (e) {
    const err = toStorageError(e);
    return new MemoryRepository(`${err.message} Le modifiche restano solo in questa scheda.`);
  }
}
