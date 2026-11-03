/**
 * Experimental Jelly persistence (M6.4). Lab only.
 *
 * Deliberately a SEPARATE IndexedDB database (`jello-lab-experimental`): the stable
 * `jello-lab` database (version 4), the `jello-project` / `jello-material` /
 * `jello-component-definition` formats and `MaterialDocument` are not touched, so a
 * Jelly record can never reach the production autosave, the project exporter or the
 * `.jello` package. The price is explicit and documented: no cross-database
 * transaction, hence records of a deleted project are purged lazily (`purgeOrphans`).
 *
 *   jelly-materials  personal experimental materials (wrapper + jello-material/jelly document)
 *   jelly-drafts     'projectId' -> working document, so a reload restores unsaved edits
 *   jelly-links      'projectId::componentId' -> Builder trial (snapshot, never a material.preset)
 *
 * Only persistent parameters are stored: the parser used on every read and write has no
 * field for oscillator position, velocity, pressed state, timestamps or scheduler data.
 * A record that fails validation (corrupt, or written by a newer version) is reported
 * and LEFT IN PLACE: reading never deletes.
 */
import { parseExperimentalJelly, type JellyExperimentalDocument } from '../../../model/experimental/jelly';

export const JELLY_DB_NAME = 'jello-lab-experimental';
export const JELLY_DB_VERSION = 1;
/** Version of the wrapper around the document, independent of the document's own schema. */
export const JELLY_STORE_VERSION = 1;

export type JellyStorageErrorKind = 'unavailable' | 'quota' | 'blocked' | 'invalid' | 'failed';
export class JellyStorageError extends Error {
  constructor(readonly kind: JellyStorageErrorKind, message: string) {
    super(message);
    this.name = 'JellyStorageError';
  }
}

export interface StoredJelly {
  id: string;
  projectId: string;
  doc: JellyExperimentalDocument;
  /** Candidate preset (or saved material) the copy started from; provenance only. */
  basePreset: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface JellyDraft {
  projectId: string;
  doc: JellyExperimentalDocument;
  /** Saved record being edited, if any. */
  recordId: string | null;
  basePreset: string | null;
  savedAt: string;
}
export interface JellyComponentLink {
  projectId: string;
  componentId: string;
  enabled: boolean;
  /** Where the snapshot came from; informational. */
  sourceId: string | null;
  /** Snapshot: the trial survives deletion of its source and never follows it implicitly. */
  doc: JellyExperimentalDocument;
  updatedAt: string;
}
export const linkKey = (projectId: string, componentId: string) => `${projectId}::${componentId}`;

export interface JellyReadReport<T> { items: T[]; skipped: string[] }
export interface JellyBatch {
  materials?: { put?: StoredJelly[]; delete?: string[] };
  drafts?: { put?: JellyDraft[]; delete?: string[] };
  links?: { put?: JellyComponentLink[]; delete?: string[] };
}

export interface JellyRepository {
  readonly persistent: boolean;
  readonly reason: string | null;
  list(projectId: string): Promise<JellyReadReport<StoredJelly>>;
  getDraft(projectId: string): Promise<JellyDraft | null>;
  getLink(projectId: string, componentId: string): Promise<JellyComponentLink | null>;
  /** All of the batch or nothing; resolves only after the transaction committed. */
  commit(batch: JellyBatch): Promise<void>;
  /** Removes records of projects that no longer exist. Returns how many records were removed. */
  purgeOrphans(projectIds: readonly string[]): Promise<number>;
  close(): void;
}

function toError(e: unknown): JellyStorageError {
  if (e instanceof JellyStorageError) return e;
  const name = (e as { name?: string } | null)?.name ?? '';
  if (name === 'QuotaExceededError') return new JellyStorageError('quota', 'Spazio di archiviazione esaurito: il salvataggio sperimentale non è riuscito.');
  if (name === 'SecurityError' || name === 'InvalidStateError') return new JellyStorageError('unavailable', `Archiviazione locale non disponibile (${name}).`);
  return new JellyStorageError('failed', `Salvataggio sperimentale non riuscito: ${(e as Error | null)?.message ?? String(e)}`);
}
const req = <T>(r: IDBRequest<T>) => new Promise<T>((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
const done = (tx: IDBTransaction) => new Promise<void>((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onabort = () => reject(tx.error ?? new DOMException('Transazione annullata', 'AbortError'));
  tx.onerror = () => reject(tx.error);
});

/** Validates a document read from storage; the record's id is authoritative. */
function readDoc(raw: unknown, id: string): { ok: true; doc: JellyExperimentalDocument } | { ok: false; error: string } {
  const parsed = parseExperimentalJelly(raw);
  if (!parsed.ok) return { ok: false, error: parsed.errors[0] ?? 'non leggibile' };
  return { ok: true, doc: { ...parsed.doc, id } };
}

/** Writes are validated BEFORE any transaction is opened: an invalid document never reaches a store. */
function validateBatch(batch: JellyBatch): void {
  const docs: unknown[] = [...(batch.materials?.put ?? []).map((m) => m.doc), ...(batch.drafts?.put ?? []).map((d) => d.doc), ...(batch.links?.put ?? []).map((l) => l.doc)];
  for (const doc of docs) {
    const r = parseExperimentalJelly(doc);
    if (!r.ok) throw new JellyStorageError('invalid', `Documento Jelly non valido, nulla è stato scritto: ${r.errors[0]}`);
  }
  for (const m of batch.materials?.put ?? []) {
    if (!m.projectId || m.doc.id !== m.id) throw new JellyStorageError('invalid', 'Record Jelly incoerente (progetto o id): nulla è stato scritto.');
  }
}

const clean = <T>(v: T): T => structuredClone(v);

class IdbJellyRepository implements JellyRepository {
  readonly persistent = true;
  readonly reason = null;
  constructor(private readonly db: IDBDatabase) {}

  async list(projectId: string): Promise<JellyReadReport<StoredJelly>> {
    const tx = this.db.transaction('jelly-materials', 'readonly');
    const raw = (await req(tx.objectStore('jelly-materials').index('projectId').getAll(IDBKeyRange.only(projectId)))) as (Partial<StoredJelly> & { doc?: unknown })[];
    const items: StoredJelly[] = [];
    const skipped: string[] = [];
    for (const r of raw) {
      if (typeof r.id !== 'string' || r.projectId !== projectId) { skipped.push(`${String(r.id)}: record incoerente`); continue; }
      const doc = readDoc(r.doc, r.id);
      if (!doc.ok) { skipped.push(`${r.id}: ${doc.error}`); continue; }
      items.push({ id: r.id, projectId, doc: doc.doc, basePreset: r.basePreset ?? null, createdAt: r.createdAt ?? '', updatedAt: r.updatedAt ?? '' });
    }
    items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return { items, skipped };
  }

  async getDraft(projectId: string): Promise<JellyDraft | null> {
    const tx = this.db.transaction('jelly-drafts', 'readonly');
    const raw = (await req(tx.objectStore('jelly-drafts').get(projectId))) as (Partial<JellyDraft> & { doc?: unknown }) | undefined;
    if (!raw || raw.projectId !== projectId) return null;
    const doc = readDoc(raw.doc, (raw.doc as { id?: string } | undefined)?.id ?? '');
    if (!doc.ok) return null;
    return { projectId, doc: doc.doc, recordId: raw.recordId ?? null, basePreset: raw.basePreset ?? null, savedAt: raw.savedAt ?? '' };
  }

  async getLink(projectId: string, componentId: string): Promise<JellyComponentLink | null> {
    const tx = this.db.transaction('jelly-links', 'readonly');
    const raw = (await req(tx.objectStore('jelly-links').get(linkKey(projectId, componentId)))) as (Partial<JellyComponentLink> & { doc?: unknown }) | undefined;
    if (!raw || raw.projectId !== projectId || raw.componentId !== componentId) return null;
    const doc = readDoc(raw.doc, (raw.doc as { id?: string } | undefined)?.id ?? '');
    if (!doc.ok) return null;
    return { projectId, componentId, enabled: raw.enabled === true, sourceId: raw.sourceId ?? null, doc: doc.doc, updatedAt: raw.updatedAt ?? '' };
  }

  async commit(batch: JellyBatch): Promise<void> {
    validateBatch(batch);
    const names = [batch.materials && 'jelly-materials', batch.drafts && 'jelly-drafts', batch.links && 'jelly-links'].filter((n): n is string => !!n);
    if (!names.length) return;
    try {
      const tx = this.db.transaction(names, 'readwrite');
      const committed = done(tx);
      try {
        const apply = (name: string, ops: { put?: unknown[]; delete?: string[] } | undefined) => {
          if (!ops) return;
          const store = tx.objectStore(name);
          for (const id of ops.delete ?? []) store.delete(id);
          for (const v of ops.put ?? []) store.put(clean(v));
        };
        apply('jelly-materials', batch.materials);
        apply('jelly-drafts', batch.drafts);
        apply('jelly-links', batch.links ? { delete: batch.links.delete ?? [], put: (batch.links.put ?? []).map((l) => ({ key: linkKey(l.projectId, l.componentId), ...l })) } : undefined);
      } catch (e) {
        committed.catch(() => undefined);
        tx.abort();
        throw e;
      }
      await committed;
    } catch (e) {
      throw toError(e);
    }
  }

  async purgeOrphans(projectIds: readonly string[]): Promise<number> {
    const alive = new Set(projectIds);
    try {
      const tx = this.db.transaction(['jelly-materials', 'jelly-drafts', 'jelly-links'], 'readwrite');
      const committed = done(tx);
      let removed = 0;
      for (const [name, key] of [['jelly-materials', 'id'], ['jelly-drafts', 'projectId'], ['jelly-links', 'key']] as const) {
        const store = tx.objectStore(name);
        const rows = (await req(store.getAll())) as { projectId?: string; [k: string]: unknown }[];
        for (const row of rows) {
          if (typeof row.projectId === 'string' && !alive.has(row.projectId)) { store.delete(row[key] as string); removed++; }
        }
      }
      await committed;
      return removed;
    } catch (e) {
      throw toError(e);
    }
  }

  close(): void { this.db.close(); }
}

/** Fallback when IndexedDB cannot be opened. It says so; it never pretends to persist. */
export class MemoryJellyRepository implements JellyRepository {
  readonly persistent = false;
  private materials = new Map<string, StoredJelly>();
  private drafts = new Map<string, JellyDraft>();
  private links = new Map<string, JellyComponentLink>();
  constructor(readonly reason: string) {}
  async list(projectId: string) { return { items: [...this.materials.values()].filter((m) => m.projectId === projectId).map(clean), skipped: [] }; }
  async getDraft(projectId: string) { const d = this.drafts.get(projectId); return d ? clean(d) : null; }
  async getLink(projectId: string, componentId: string) { const l = this.links.get(linkKey(projectId, componentId)); return l ? clean(l) : null; }
  async commit(batch: JellyBatch) {
    validateBatch(batch);
    const b = clean(batch);
    for (const id of b.materials?.delete ?? []) this.materials.delete(id);
    for (const m of b.materials?.put ?? []) this.materials.set(m.id, m);
    for (const id of b.drafts?.delete ?? []) this.drafts.delete(id);
    for (const d of b.drafts?.put ?? []) this.drafts.set(d.projectId, d);
    for (const id of b.links?.delete ?? []) this.links.delete(id);
    for (const l of b.links?.put ?? []) this.links.set(linkKey(l.projectId, l.componentId), l);
  }
  async purgeOrphans(projectIds: readonly string[]) {
    const alive = new Set(projectIds);
    let removed = 0;
    for (const map of [this.materials, this.drafts, this.links] as Map<string, { projectId: string }>[]) {
      for (const [k, v] of [...map]) if (!alive.has(v.projectId)) { map.delete(k); removed++; }
    }
    return removed;
  }
  close() {}
}

function upgrade(db: IDBDatabase, oldVersion: number): void {
  if (oldVersion < 1) {
    const materials = db.createObjectStore('jelly-materials', { keyPath: 'id' });
    materials.createIndex('projectId', 'projectId');
    db.createObjectStore('jelly-drafts', { keyPath: 'projectId' });
    db.createObjectStore('jelly-links', { keyPath: 'key' });
  }
}

export async function openJellyRepository(factory: IDBFactory | null = globalThis.indexedDB ?? null, name = JELLY_DB_NAME): Promise<JellyRepository> {
  if (!factory) return new MemoryJellyRepository('IndexedDB non disponibile: i materiali Jelly restano solo in questa scheda.');
  try {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = factory.open(name, JELLY_DB_VERSION);
      r.onupgradeneeded = (e) => upgrade(r.result, e.oldVersion);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.onblocked = () => reject(new JellyStorageError('blocked', 'Database sperimentale bloccato da un’altra scheda.'));
    });
    db.onversionchange = () => db.close();
    return new IdbJellyRepository(db);
  } catch (e) {
    return new MemoryJellyRepository(`${toError(e).message} I materiali Jelly restano solo in questa scheda.`);
  }
}
