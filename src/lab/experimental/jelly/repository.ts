/**
 * Experimental Jelly persistence (M6.4, hardened in M6.4.1). Lab only.
 *
 * Deliberately a SEPARATE IndexedDB database (`jello-lab-experimental`): the stable
 * `jello-lab` database (version 4), the `jello-project` / `jello-material` /
 * `jello-component-definition` formats and `MaterialDocument` are not touched, so a
 * Jelly record can never reach the production autosave, the project exporter or the
 * `.jello` package. The price is explicit and documented: no cross-database
 * transaction, hence a record can outlive the project or component it belongs to.
 * Those records are never deleted on a guess: see reconcile.ts (detect, classify,
 * quarantine, restore) — this repository only offers the safe primitives.
 *
 *   jelly-materials   personal experimental materials (wrapper + jello-material/jelly document)
 *   jelly-drafts      'projectId' -> working document, so a reload restores unsaved edits
 *   jelly-links       'projectId::componentId' -> Builder trial (snapshot, never a material.preset)
 *   jelly-quarantine  (v2) rows moved aside by an explicit user action, byte-for-byte, restorable
 *
 * Revisions (v2). Every record carries `rev`, a counter this repository increments on each
 * write; a record written by v1 has no `rev` and reads as 0, so v1 data is read unchanged. A
 * batch may state the revision it last saw (`expect`): the check and the write happen in the
 * SAME readwrite transaction (compare-and-swap), so two tabs can never overwrite each other
 * silently — the later writer gets a JellyConflictError and nothing is written. BroadcastChannel
 * is deliberately not used: it could only signal, never guarantee.
 *
 * Only persistent parameters are stored: the parser used on every read and write has no
 * field for oscillator position, velocity, pressed state, timestamps or scheduler data.
 * A record that fails validation (corrupt, or written by a newer version) is reported
 * and LEFT IN PLACE: reading never deletes.
 */
import { JELLY_FAMILY_VERSION, parseExperimentalJelly, type JellyExperimentalDocument } from '../../../model/experimental/jelly';
import { SCHEMA_VERSION } from '../../../model/version';

export const JELLY_DB_NAME = 'jello-lab-experimental';
/** 1: materials, drafts, links. 2: + `rev` on records (no migration needed, absent = 0) and the quarantine store. */
export const JELLY_DB_VERSION = 2;
/** Version of the wrapper around the document, independent of the document's own schema. */
export const JELLY_STORE_VERSION = 1;

export type JellyStorageErrorKind = 'unavailable' | 'quota' | 'blocked' | 'invalid' | 'failed' | 'conflict';
export class JellyStorageError extends Error {
  constructor(readonly kind: JellyStorageErrorKind, message: string) {
    super(message);
    this.name = 'JellyStorageError';
  }
}

export type JellyStoreKind = 'materials' | 'drafts' | 'links';
/** One write that did not happen because the record is no longer at the revision the writer last saw. */
export interface JellyConflict {
  store: JellyStoreKind;
  key: string;
  /** Revision the writer expected; null = the record was expected not to exist. */
  expected: number | null;
  /** Revision found; null = the record does not exist (anymore). */
  actual: number | null;
}
export class JellyConflictError extends JellyStorageError {
  constructor(readonly conflicts: JellyConflict[]) {
    super('conflict', conflicts.length === 1 && conflicts[0]!.actual === null
      ? 'Il record è stato eliminato da un’altra scheda. Nulla è stato scritto.'
      : 'Il record è stato modificato da un’altra scheda. Nulla è stato scritto.');
    this.name = 'JellyConflictError';
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
  /** Assigned by the repository on every write; 0/absent for a record written before revisions existed. */
  rev?: number;
}
export interface JellyDraft {
  projectId: string;
  doc: JellyExperimentalDocument;
  /** Saved record being edited, if any. */
  recordId: string | null;
  basePreset: string | null;
  savedAt: string;
  rev?: number;
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
  rev?: number;
}
export const linkKey = (projectId: string, componentId: string) => `${projectId}::${componentId}`;

export interface JellyReadReport<T> { items: T[]; skipped: string[] }

/** `expect` maps a key to the revision the writer last saw (null = must not exist); a key that is absent is written unconditionally. */
export interface JellyStoreOps<T> { put?: T[]; delete?: string[]; expect?: Record<string, number | null> }
export interface JellyBatch {
  materials?: JellyStoreOps<StoredJelly>;
  drafts?: JellyStoreOps<JellyDraft>;
  links?: JellyStoreOps<JellyComponentLink>;
}
/** Revision assigned to every record the batch wrote, by store and key. */
export interface JellyCommitResult { materials: Record<string, number>; drafts: Record<string, number>; links: Record<string, number> }

export type JellyReadability = 'ok' | 'corrupt' | 'newer';
/** A stored row as it is, with what could be established without knowing anything about projects. */
export interface JellyInventoryRow {
  store: JellyStoreKind;
  key: string;
  projectId: string | null;
  componentId: string | null;
  rev: number;
  readable: JellyReadability;
  detail: string | null;
  name: string | null;
  updatedAt: string;
  /** The raw stored value (cloned): enough to export or move the row without interpreting it. */
  value: unknown;
}
export interface JellyQuarantineRow {
  qkey: string;
  store: JellyStoreKind;
  key: string;
  projectId: string | null;
  componentId: string | null;
  name: string | null;
  reason: string;
  movedAt: string;
  rev: number;
  value: unknown;
}
export interface JellyMoveRequest { store: JellyStoreKind; key: string; rev: number }
export interface JellyMoveResult { moved: number; skipped: string[] }

export interface JellyRepository {
  readonly persistent: boolean;
  readonly reason: string | null;
  list(projectId: string): Promise<JellyReadReport<StoredJelly>>;
  /** The readable draft of a project, or null (absent or unreadable: see `readDraft`). */
  getDraft(projectId: string): Promise<JellyDraft | null>;
  /** The draft with its revision, also when it cannot be read (then `error` says why and the row is left alone). */
  readDraft(projectId: string): Promise<{ draft: JellyDraft | null; rev: number | null; error: string | null }>;
  getLink(projectId: string, componentId: string): Promise<JellyComponentLink | null>;
  /** Current revision of a row whatever its content (null = no such row). */
  revisionOf(store: JellyStoreKind, key: string): Promise<number | null>;
  /** All of the batch or nothing; resolves only after the transaction committed. Rejects with JellyConflictError when an `expect` does not hold. */
  commit(batch: JellyBatch): Promise<JellyCommitResult>;
  /** Read-only: every row of the three stores. Nothing is modified. */
  inventory(): Promise<JellyInventoryRow[]>;
  /** Moves rows to quarantine in ONE transaction, each only if it is still at the revision seen and still readable. Never deletes. */
  quarantine(rows: readonly JellyMoveRequest[], reason: string, now?: string): Promise<JellyMoveResult>;
  listQuarantine(): Promise<JellyQuarantineRow[]>;
  /** Puts quarantined rows back exactly as they were, unless a row with that key exists again. Never overwrites. */
  restoreFromQuarantine(qkeys: readonly string[]): Promise<JellyMoveResult>;
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

const revOf = (row: unknown): number => {
  const rev = (row as { rev?: unknown } | null | undefined)?.rev;
  return typeof rev === 'number' && Number.isInteger(rev) && rev >= 0 ? rev : 0;
};

/** Validates a document read from storage; the record's id is authoritative. */
function readDoc(raw: unknown, id: string): { ok: true; doc: JellyExperimentalDocument } | { ok: false; error: string; newer: boolean } {
  const parsed = parseExperimentalJelly(raw);
  if (!parsed.ok) return { ok: false, error: parsed.errors[0] ?? 'non leggibile', newer: isNewer(raw) };
  return { ok: true, doc: { ...parsed.doc, id } };
}
/** A document or wrapper written by a version this code does not know: never touched, only reported. */
function isNewer(row: unknown): boolean {
  const r = row as { storeVersion?: unknown; doc?: { schemaVersion?: unknown; familyVersion?: unknown } } | null;
  const d = r?.doc ?? (row as { schemaVersion?: unknown; familyVersion?: unknown } | null);
  return (typeof r?.storeVersion === 'number' && r.storeVersion > JELLY_STORE_VERSION)
    || (typeof d?.schemaVersion === 'number' && d.schemaVersion > SCHEMA_VERSION)
    || (typeof d?.familyVersion === 'number' && d.familyVersion > JELLY_FAMILY_VERSION);
}

/** Writes are validated BEFORE any transaction is opened: an invalid document never reaches a store. */
function validateBatch(batch: JellyBatch): void {
  const docs: unknown[] = [...(batch.materials?.put ?? []).map((m) => m.doc), ...(batch.drafts?.put ?? []).map((d) => d.doc), ...(batch.links?.put ?? []).map((l) => l.doc)];
  for (const doc of docs) {
    const r = parseExperimentalJelly(doc);
    if (!r.ok) throw new JellyStorageError('invalid', `Documento Jello non valido, nulla è stato scritto: ${r.errors[0]}`);
  }
  for (const m of batch.materials?.put ?? []) {
    if (!m.projectId || m.doc.id !== m.id) throw new JellyStorageError('invalid', 'Record Jelly incoerente (progetto o id): nulla è stato scritto.');
  }
}

const clean = <T>(v: T): T => structuredClone(v);

/** Strips the revision a caller may carry over from an earlier read: only the repository assigns it. */
const withoutRev = <T extends { rev?: number }>(v: T): Omit<T, 'rev'> => { const { rev: _rev, ...rest } = v; return rest; };

const STORE_NAME = { materials: 'jelly-materials', drafts: 'jelly-drafts', links: 'jelly-links' } as const;
const KEY_OF = {
  materials: (m: StoredJelly) => m.id,
  drafts: (d: JellyDraft) => d.projectId,
  links: (l: JellyComponentLink) => linkKey(l.projectId, l.componentId),
};

function describeRow(store: JellyStoreKind, key: string, raw: Record<string, unknown>): JellyInventoryRow {
  const docRaw = raw.doc;
  const id = store === 'materials' ? key : ((docRaw as { id?: string } | undefined)?.id ?? '');
  const doc = readDoc(docRaw, id);
  const projectId = typeof raw.projectId === 'string' && raw.projectId ? raw.projectId : null;
  const componentId = store === 'links' && typeof raw.componentId === 'string' ? raw.componentId : null;
  const stamp = String(raw.updatedAt ?? raw.savedAt ?? '');
  const base = { store, key, projectId, componentId, rev: revOf(raw), updatedAt: stamp, value: clean(raw) };
  if (isNewer(raw)) return { ...base, readable: 'newer', detail: doc.ok ? 'versione più recente di quella supportata' : doc.error, name: doc.ok ? doc.doc.name : null };
  if (!doc.ok) return { ...base, readable: doc.newer ? 'newer' : 'corrupt', detail: doc.error, name: null };
  return { ...base, readable: 'ok', detail: null, name: doc.doc.name };
}

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
      items.push({ id: r.id, projectId, doc: doc.doc, basePreset: r.basePreset ?? null, createdAt: r.createdAt ?? '', updatedAt: r.updatedAt ?? '', rev: revOf(r) });
    }
    items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return { items, skipped };
  }

  async readDraft(projectId: string): Promise<{ draft: JellyDraft | null; rev: number | null; error: string | null }> {
    const tx = this.db.transaction('jelly-drafts', 'readonly');
    const raw = (await req(tx.objectStore('jelly-drafts').get(projectId))) as (Partial<JellyDraft> & { doc?: unknown }) | undefined;
    if (!raw) return { draft: null, rev: null, error: null };
    const rev = revOf(raw);
    if (raw.projectId !== projectId) return { draft: null, rev, error: 'bozza incoerente' };
    const doc = readDoc(raw.doc, (raw.doc as { id?: string } | undefined)?.id ?? '');
    if (!doc.ok || isNewer(raw)) return { draft: null, rev, error: doc.ok ? 'versione più recente di quella supportata' : doc.error };
    return { draft: { projectId, doc: doc.doc, recordId: raw.recordId ?? null, basePreset: raw.basePreset ?? null, savedAt: raw.savedAt ?? '', rev }, rev, error: null };
  }
  async getDraft(projectId: string): Promise<JellyDraft | null> { return (await this.readDraft(projectId)).draft; }

  async getLink(projectId: string, componentId: string): Promise<JellyComponentLink | null> {
    const tx = this.db.transaction('jelly-links', 'readonly');
    const raw = (await req(tx.objectStore('jelly-links').get(linkKey(projectId, componentId)))) as (Partial<JellyComponentLink> & { doc?: unknown }) | undefined;
    if (!raw || raw.projectId !== projectId || raw.componentId !== componentId) return null;
    const doc = readDoc(raw.doc, (raw.doc as { id?: string } | undefined)?.id ?? '');
    if (!doc.ok || isNewer(raw)) return null;
    return { projectId, componentId, enabled: raw.enabled === true, sourceId: raw.sourceId ?? null, doc: doc.doc, updatedAt: raw.updatedAt ?? '', rev: revOf(raw) };
  }

  async revisionOf(store: JellyStoreKind, key: string): Promise<number | null> {
    const tx = this.db.transaction(STORE_NAME[store], 'readonly');
    const raw = await req(tx.objectStore(STORE_NAME[store]).get(key));
    return raw === undefined ? null : revOf(raw);
  }

  async commit(batch: JellyBatch): Promise<JellyCommitResult> {
    validateBatch(batch);
    const kinds = (['materials', 'drafts', 'links'] as const).filter((k) => batch[k] !== undefined);
    const result: JellyCommitResult = { materials: {}, drafts: {}, links: {} };
    if (!kinds.length) return result;
    try {
      const tx = this.db.transaction(kinds.map((k) => STORE_NAME[k]), 'readwrite');
      const committed = done(tx);
      const conflicts: JellyConflict[] = [];
      try {
        for (const kind of kinds) {
          const ops = batch[kind] as unknown as JellyStoreOps<Record<string, unknown> & { rev?: number }>;
          const store = tx.objectStore(STORE_NAME[kind]);
          const guard = (key: string, existing: unknown): boolean => {
            if (!ops.expect || !Object.hasOwn(ops.expect, key)) return true;
            const expected = ops.expect[key] ?? null;
            const actual = existing === undefined ? null : revOf(existing);
            if (expected === actual) return true;
            conflicts.push({ store: kind, key, expected, actual });
            tx.abort(); // nothing of the batch is applied
            return false;
          };
          // Clones are made now, synchronously: a value that cannot be stored aborts before any write.
          const puts = (ops.put ?? []).map((v) => ({ key: (KEY_OF[kind] as (x: never) => string)(v as never), value: clean(withoutRev(v)) }));
          for (const key of ops.delete ?? []) {
            const g = store.get(key);
            g.onsuccess = () => { if (guard(key, g.result)) store.delete(key); };
          }
          for (const { key, value } of puts) {
            const g = store.get(key);
            g.onsuccess = () => {
              if (!guard(key, g.result)) return;
              const rev = revOf(g.result) + 1;
              store.put(kind === 'links' ? { key, ...value, rev } : { ...value, rev });
              result[kind][key] = rev;
            };
          }
        }
      } catch (e) {
        committed.catch(() => undefined);
        tx.abort();
        throw e;
      }
      try {
        await committed;
      } catch (e) {
        if (conflicts.length) throw new JellyConflictError(conflicts);
        throw e;
      }
      return result;
    } catch (e) {
      throw toError(e);
    }
  }

  async inventory(): Promise<JellyInventoryRow[]> {
    try {
      const tx = this.db.transaction(['jelly-materials', 'jelly-drafts', 'jelly-links'], 'readonly');
      const rows: JellyInventoryRow[] = [];
      for (const kind of ['materials', 'drafts', 'links'] as const) {
        const store = tx.objectStore(STORE_NAME[kind]);
        const [keys, values] = await Promise.all([req(store.getAllKeys()), req(store.getAll())]);
        keys.forEach((k, i) => {
          const raw = values[i];
          if (typeof raw !== 'object' || raw === null) rows.push({ store: kind, key: String(k), projectId: null, componentId: null, rev: 0, readable: 'corrupt', detail: 'valore non è un oggetto', name: null, updatedAt: '', value: clean(raw) });
          else rows.push(describeRow(kind, String(k), raw as Record<string, unknown>));
        });
      }
      return rows;
    } catch (e) {
      throw toError(e);
    }
  }

  async quarantine(rows: readonly JellyMoveRequest[], reason: string, now = new Date().toISOString()): Promise<JellyMoveResult> {
    if (!rows.length) return { moved: 0, skipped: [] };
    try {
      const tx = this.db.transaction(['jelly-materials', 'jelly-drafts', 'jelly-links', 'jelly-quarantine'], 'readwrite');
      const committed = done(tx);
      const skipped: string[] = [];
      let moved = 0;
      for (const r of rows) {
        const store = tx.objectStore(STORE_NAME[r.store]);
        const g = store.get(r.key);
        g.onsuccess = () => {
          const raw = g.result as Record<string, unknown> | undefined;
          const label = `${r.store}/${r.key}`;
          if (raw === undefined) { skipped.push(`${label}: non più presente`); return; }
          if (revOf(raw) !== r.rev) { skipped.push(`${label}: modificato nel frattempo (revisione ${revOf(raw)}, vista ${r.rev})`); return; }
          const info = describeRow(r.store, r.key, raw);
          if (info.readable !== 'ok') { skipped.push(`${label}: ${info.readable === 'newer' ? 'versione più recente, non toccato' : 'non leggibile, non toccato'}`); return; }
          tx.objectStore('jelly-quarantine').put({ qkey: `${r.store}|${r.key}|${now}`, store: r.store, key: r.key, projectId: info.projectId, componentId: info.componentId, name: info.name, reason, movedAt: now, rev: info.rev, value: clean(raw) } satisfies JellyQuarantineRow);
          store.delete(r.key);
          moved++;
        };
      }
      await committed;
      return { moved, skipped };
    } catch (e) {
      throw toError(e);
    }
  }

  async listQuarantine(): Promise<JellyQuarantineRow[]> {
    try {
      const tx = this.db.transaction('jelly-quarantine', 'readonly');
      const rows = (await req(tx.objectStore('jelly-quarantine').getAll())) as JellyQuarantineRow[];
      return rows.sort((a, b) => a.movedAt.localeCompare(b.movedAt));
    } catch (e) {
      throw toError(e);
    }
  }

  async restoreFromQuarantine(qkeys: readonly string[]): Promise<JellyMoveResult> {
    if (!qkeys.length) return { moved: 0, skipped: [] };
    try {
      const tx = this.db.transaction(['jelly-materials', 'jelly-drafts', 'jelly-links', 'jelly-quarantine'], 'readwrite');
      const committed = done(tx);
      const skipped: string[] = [];
      let moved = 0;
      for (const qkey of qkeys) {
        const q = tx.objectStore('jelly-quarantine');
        const g = q.get(qkey);
        g.onsuccess = () => {
          const row = g.result as JellyQuarantineRow | undefined;
          if (!row) { skipped.push(`${qkey}: non trovato in quarantena`); return; }
          const target = tx.objectStore(STORE_NAME[row.store]);
          const exists = target.get(row.key);
          exists.onsuccess = () => {
            if (exists.result !== undefined) { skipped.push(`${row.store}/${row.key}: esiste già un record con questa chiave, lasciato in quarantena`); return; }
            target.put(clean(row.value));
            q.delete(qkey);
            moved++;
          };
        };
      }
      await committed;
      return { moved, skipped };
    } catch (e) {
      throw toError(e);
    }
  }

  close(): void { this.db.close(); }
}

/** Fallback when IndexedDB cannot be opened. It says so; it never pretends to persist. Same revision/quarantine semantics. */
export class MemoryJellyRepository implements JellyRepository {
  readonly persistent = false;
  private materials = new Map<string, StoredJelly>();
  private drafts = new Map<string, JellyDraft>();
  private links = new Map<string, JellyComponentLink>();
  private quarantined = new Map<string, JellyQuarantineRow>();
  constructor(readonly reason: string) {}
  private table(kind: JellyStoreKind): Map<string, Record<string, unknown>> {
    return (kind === 'materials' ? this.materials : kind === 'drafts' ? this.drafts : this.links) as unknown as Map<string, Record<string, unknown>>;
  }
  async list(projectId: string) { return { items: [...this.materials.values()].filter((m) => m.projectId === projectId).map((m) => ({ ...clean(m), rev: revOf(m) })), skipped: [] }; }
  async readDraft(projectId: string) { const d = this.drafts.get(projectId); return d ? { draft: { ...clean(d), rev: revOf(d) }, rev: revOf(d), error: null } : { draft: null, rev: null, error: null }; }
  async getDraft(projectId: string) { return (await this.readDraft(projectId)).draft; }
  async getLink(projectId: string, componentId: string) { const l = this.links.get(linkKey(projectId, componentId)); return l ? { ...clean(l), rev: revOf(l) } : null; }
  async revisionOf(store: JellyStoreKind, key: string) { const r = this.table(store).get(key); return r === undefined ? null : revOf(r); }
  async commit(batch: JellyBatch): Promise<JellyCommitResult> {
    validateBatch(batch);
    const b = clean(batch);
    const conflicts: JellyConflict[] = [];
    for (const kind of ['materials', 'drafts', 'links'] as const) {
      const ops = b[kind] as unknown as JellyStoreOps<Record<string, unknown>> | undefined;
      if (!ops?.expect) continue;
      const table = this.table(kind);
      for (const [key, expected] of Object.entries(ops.expect)) {
        const actual = table.has(key) ? revOf(table.get(key)) : null;
        if (expected !== actual) conflicts.push({ store: kind, key, expected, actual });
      }
    }
    if (conflicts.length) throw new JellyConflictError(conflicts);
    const result: JellyCommitResult = { materials: {}, drafts: {}, links: {} };
    for (const kind of ['materials', 'drafts', 'links'] as const) {
      const ops = b[kind] as unknown as JellyStoreOps<Record<string, unknown> & { rev?: number }> | undefined;
      if (!ops) continue;
      const table = this.table(kind);
      for (const key of ops.delete ?? []) table.delete(key);
      for (const v of ops.put ?? []) {
        const key = (KEY_OF[kind] as (x: never) => string)(v as never);
        const rev = revOf(table.get(key)) + 1;
        table.set(key, { ...withoutRev(v), rev });
        result[kind][key] = rev;
      }
    }
    return result;
  }
  async inventory(): Promise<JellyInventoryRow[]> {
    const rows: JellyInventoryRow[] = [];
    for (const kind of ['materials', 'drafts', 'links'] as const) for (const [key, raw] of this.table(kind)) rows.push(describeRow(kind, key, raw));
    return rows;
  }
  async quarantine(rows: readonly JellyMoveRequest[], reason: string, now = new Date().toISOString()): Promise<JellyMoveResult> {
    const skipped: string[] = [];
    let moved = 0;
    for (const r of rows) {
      const raw = this.table(r.store).get(r.key);
      const label = `${r.store}/${r.key}`;
      if (raw === undefined) { skipped.push(`${label}: non più presente`); continue; }
      if (revOf(raw) !== r.rev) { skipped.push(`${label}: modificato nel frattempo (revisione ${revOf(raw)}, vista ${r.rev})`); continue; }
      const info = describeRow(r.store, r.key, raw);
      if (info.readable !== 'ok') { skipped.push(`${label}: ${info.readable === 'newer' ? 'versione più recente, non toccato' : 'non leggibile, non toccato'}`); continue; }
      this.quarantined.set(`${r.store}|${r.key}|${now}`, { qkey: `${r.store}|${r.key}|${now}`, store: r.store, key: r.key, projectId: info.projectId, componentId: info.componentId, name: info.name, reason, movedAt: now, rev: info.rev, value: clean(raw) });
      this.table(r.store).delete(r.key);
      moved++;
    }
    return { moved, skipped };
  }
  async listQuarantine() { return [...this.quarantined.values()].map(clean).sort((a, b) => a.movedAt.localeCompare(b.movedAt)); }
  async restoreFromQuarantine(qkeys: readonly string[]): Promise<JellyMoveResult> {
    const skipped: string[] = [];
    let moved = 0;
    for (const qkey of qkeys) {
      const row = this.quarantined.get(qkey);
      if (!row) { skipped.push(`${qkey}: non trovato in quarantena`); continue; }
      if (this.table(row.store).has(row.key)) { skipped.push(`${row.store}/${row.key}: esiste già un record con questa chiave, lasciato in quarantena`); continue; }
      this.table(row.store).set(row.key, clean(row.value) as Record<string, unknown>);
      this.quarantined.delete(qkey);
      moved++;
    }
    return { moved, skipped };
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
  // v2 adds a store and nothing else: existing rows are not rewritten (an absent `rev` reads as 0).
  if (oldVersion < 2) db.createObjectStore('jelly-quarantine', { keyPath: 'qkey' });
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
