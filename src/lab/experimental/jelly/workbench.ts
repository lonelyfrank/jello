/**
 * State of the experimental Jelly lab, outside React (same pattern as lab/store.ts).
 *
 * Holds the working document, the base it can be reset to, the saved personal copies of
 * the active project and the save status. Everything here is parameters and metadata:
 * oscillator state, pressed flags and timestamps live in the renderer and are never part
 * of this state or of what it persists. All persistence goes through JellyRepository
 * (separate database); the stable repository is never used.
 *
 * Lifecycle guarantees (M6.4.1), each covered by tests/unit/jelly-integrity.test.ts:
 *  - repository calls run strictly in order (one queue), so a read never overtakes a write;
 *  - a response that arrives after the project changed is dropped: it can neither show A's data
 *    in B nor write A's document into B (while a project loads the workbench accepts no edit);
 *  - an edit made while a save is in flight is kept, never replaced by the saved copy;
 *  - a failed write (quota, closed database…) leaves the working document untouched and the draft
 *    is scheduled again, so the edits stay recoverable; `exportText()` always works;
 *  - every record write is a compare-and-swap on the revision last seen: a write that would overwrite
 *    a newer version from another tab does not happen, `conflict` says why, and the user chooses
 *    (save as a copy, overwrite explicitly, take the other version). Nothing is merged automatically.
 */
import { presetDisplayName } from '../../../model/catalog';
import { JELLY_CANDIDATE_PRESETS } from '../../../model/experimental/jelly-presets';
import { parseExperimentalJellyText, serializeExperimentalJelly, type JellyExperimentalDocument, type JellyOverrideState, type JellyParamKey, type JellyStateOverride } from '../../../model/experimental/jelly';
import {
  editJellyParam, editJellyState, isJellyDirty, newJellyId, personalJellyCopy, randomSeed, renameJelly,
  resetJellyParam, resetJellyToBase, resetJellyToFactory, stampJelly, type EditResult,
} from './inspector-model';
import { JellyConflictError, JellyStorageError, type JellyDraft, type JellyRepository, type StoredJelly } from './repository';

export const DEFAULT_PRESET_ID = 'jelly-soft';
export type JellyBase = { kind: 'preset' | 'record' | 'import'; id: string; doc: JellyExperimentalDocument };
export type JellySave =
  | { kind: 'clean' } | { kind: 'dirty' } | { kind: 'saving' }
  | { kind: 'saved'; at: string } | { kind: 'error'; message: string };

/** Another tab got there first. The working document is untouched and nothing was overwritten. */
export type JellyConflictState =
  | { kind: 'record'; recordId: string; reason: 'changed' | 'deleted'; message: string }
  | { kind: 'delete'; recordId: string; message: string }
  | { kind: 'draft'; message: string };

export interface JellyWorkState {
  projectId: string | null;
  loading: boolean;
  doc: JellyExperimentalDocument;
  base: JellyBase;
  /** Saved personal copy being edited; null while working on a preset or an unsaved import. */
  recordId: string | null;
  records: StoredJelly[];
  skipped: string[];
  /** Persistent parameters only; true if every write of this session is volatile. */
  persistent: boolean;
  note: string | null;
  save: JellySave;
  /** Last rejected edit per parameter: shown to the user, never applied. */
  rejections: Partial<Record<string, string>>;
  dirty: boolean;
  conflict: JellyConflictState | null;
  /** The stored draft cannot be read (corrupt or newer version): it is kept, and drafts are not written over it. */
  draftNote: string | null;
}

export const candidatePresets = () => JELLY_CANDIDATE_PRESETS;
/**
 * Name shown for a document: the catalog's display name ("Jello · Soft") for an unmodified candidate preset, otherwise the
 * document's own name. The stored name of a preset stays the technical one ("Jelly Soft"); a user's name is never replaced.
 */
export const presetLabel = (doc: Pick<JellyExperimentalDocument, 'id' | 'name'>): string => (JELLY_CANDIDATE_PRESETS.some((p) => p.doc.id === doc.id && p.doc.name === doc.name) ? presetDisplayName(doc.id) : undefined) ?? doc.name;
export const presetDoc = (id: string): JellyExperimentalDocument | null => structuredClone(JELLY_CANDIDATE_PRESETS.find((p) => p.doc.id === id)?.doc ?? null);

export interface WorkbenchDeps {
  repo: JellyRepository;
  now?: () => string;
  newId?: () => string;
  rng?: () => number;
  /** Debounce of the draft write, ms. */
  draftDelay?: number;
}

export class JellyWorkbench {
  private state: JellyWorkState;
  private readonly listeners = new Set<() => void>();
  private readonly repo: JellyRepository;
  private readonly now: () => string;
  private readonly newId: () => string;
  private readonly rng: () => number;
  private readonly draftDelay: number;
  private token = 0;
  private draftTimer: ReturnType<typeof setTimeout> | null = null;
  private draftProject: string | null = null;
  private destroyed = false;
  /** Revision of the project's draft row as this workbench last saw it; null = it did not exist. */
  private draftRev: number | null = null;
  /** Unreadable draft in storage: kept, and not written over. */
  private draftBlocked = false;
  /** Another tab wrote the draft: ours waits for an explicit choice. */
  private draftPaused = false;
  private tail: Promise<unknown> = Promise.resolve();
  /** Bumped whenever the user moves to another document (preset, copy, import, project): edits do not bump it. */
  private navigation = 0;

  constructor(deps: WorkbenchDeps) {
    this.repo = deps.repo;
    this.now = deps.now ?? (() => new Date().toISOString());
    this.newId = deps.newId ?? (() => newJellyId());
    this.rng = deps.rng ?? Math.random;
    this.draftDelay = deps.draftDelay ?? 400;
    const soft = presetDoc(DEFAULT_PRESET_ID)!;
    this.state = {
      projectId: null, loading: false, doc: soft, base: { kind: 'preset', id: DEFAULT_PRESET_ID, doc: soft }, recordId: null,
      records: [], skipped: [], persistent: this.repo.persistent, note: this.repo.reason, save: { kind: 'clean' }, rejections: {}, dirty: false,
      conflict: null, draftNote: null,
    };
  }

  get = (): JellyWorkState => this.state;
  subscribe = (l: () => void): (() => void) => { this.listeners.add(l); return () => { this.listeners.delete(l); }; };
  private set(patch: Partial<JellyWorkState>): void {
    if (this.destroyed) return;
    const next = { ...this.state, ...patch };
    next.dirty = isJellyDirty(next.doc, next.base.doc);
    // A manual save status only describes the moment of the save: any edit makes the document dirty again.
    if (patch.doc && next.dirty && next.save.kind !== 'saving' && next.save.kind !== 'error') next.save = { kind: 'dirty' };
    this.state = next;
    for (const l of this.listeners) l();
  }

  /** Every repository call goes through here: strictly one after the other, in the order they were asked. */
  private enqueue<T>(job: () => Promise<T>): Promise<T> {
    const run = this.tail.then(job, job);
    this.tail = run.catch(() => undefined);
    return run;
  }

  // ---------------------------------------------------------------- project scope

  /**
   * Switches project: the pending draft of the previous one is written first; then records and draft of the new one
   * are read. The working document is reset at once, so nothing of the previous project can be edited, saved or
   * drafted under the new one while it loads, and an answer that arrives after another switch is dropped.
   */
  async open(projectId: string | null): Promise<void> {
    if (this.destroyed || projectId === this.state.projectId) return;
    await this.flushDraft();
    if (this.destroyed || projectId === this.state.projectId) return;
    const token = ++this.token;
    this.navigation++;
    this.draftRev = null;
    this.draftBlocked = false;
    this.draftPaused = false;
    const soft = presetDoc(DEFAULT_PRESET_ID)!;
    const fresh = { doc: soft, base: { kind: 'preset', id: DEFAULT_PRESET_ID, doc: structuredClone(soft) } as JellyBase, recordId: null, rejections: {}, save: { kind: 'clean' } as JellySave, conflict: null, draftNote: null };
    if (!projectId) {
      this.set({ projectId: null, loading: false, records: [], skipped: [], ...fresh });
      return;
    }
    this.set({ projectId, loading: true, records: [], skipped: [], ...fresh });
    try {
      const [report, drafted] = await this.enqueue(() => Promise.all([this.repo.list(projectId), this.repo.readDraft(projectId)]));
      if (token !== this.token || this.destroyed) return;
      this.draftRev = drafted.rev;
      this.draftBlocked = drafted.error !== null;
      const restored = this.restore(drafted.draft, report.items);
      this.set({
        loading: false, records: report.items, skipped: report.skipped, persistent: this.repo.persistent, note: this.repo.reason, save: { kind: 'clean' },
        draftNote: drafted.error ? `Bozza salvata non leggibile (${drafted.error}): conservata, non viene sovrascritta.` : null,
        ...restored,
      });
    } catch (e) {
      if (token !== this.token || this.destroyed) return;
      this.set({ loading: false, save: { kind: 'error', message: (e as Error).message } });
    }
  }

  private restore(draft: JellyDraft | null, records: StoredJelly[]): Pick<JellyWorkState, 'doc' | 'base' | 'recordId'> {
    const soft = presetDoc(DEFAULT_PRESET_ID)!;
    const fallback = { doc: soft, base: { kind: 'preset', id: DEFAULT_PRESET_ID, doc: structuredClone(soft) } as JellyBase, recordId: null };
    if (!draft) return fallback;
    const record = draft.recordId ? records.find((r) => r.id === draft.recordId) : undefined;
    if (record) return { doc: draft.doc, base: { kind: 'record', id: record.id, doc: structuredClone(record.doc) }, recordId: record.id };
    const preset = draft.basePreset ? presetDoc(draft.basePreset) : null;
    if (preset) return { doc: draft.doc, base: { kind: 'preset', id: preset.id, doc: preset }, recordId: null };
    // Source gone (deleted copy): the draft itself becomes the base, nothing is lost.
    return { doc: draft.doc, base: { kind: 'import', id: draft.doc.id, doc: structuredClone(draft.doc) }, recordId: null };
  }

  /** Re-reads the project's saved copies (after a conflict, or on request). The working document is not touched. */
  async refresh(): Promise<void> {
    const projectId = this.state.projectId;
    if (!projectId || this.state.loading) return;
    try {
      const report = await this.enqueue(() => this.repo.list(projectId));
      if (this.state.projectId === projectId) this.set({ records: report.items, skipped: report.skipped });
    } catch (e) {
      if (this.state.projectId === projectId) this.set({ save: { kind: 'error', message: (e as Error).message } });
    }
  }

  // ---------------------------------------------------------------- editing

  private busy(): EditResult | null {
    return this.state.loading ? { ok: false, error: 'Caricamento del progetto in corso.' } : null;
  }

  edit(key: JellyParamKey, value: unknown): EditResult {
    return this.busy() ?? this.applyEdit(key, editJellyParam(this.state.doc, key, value));
  }
  editState(state: JellyOverrideState, key: keyof JellyStateOverride, value: string | number | undefined): EditResult {
    return this.busy() ?? this.applyEdit(`${state}.${key}`, editJellyState(this.state.doc, state, key, value));
  }
  rename(name: string): EditResult { return this.busy() ?? this.applyEdit('name', renameJelly(this.state.doc, name)); }
  resetParam(key: JellyParamKey): EditResult { return this.busy() ?? this.applyEdit(key, resetJellyParam(this.state.doc, this.state.base.doc, key)); }
  resetAll(): void { if (!this.state.loading) this.replace(resetJellyToBase(this.state.doc, this.state.base.doc)); }
  resetFactory(): void { if (!this.state.loading) this.replace(resetJellyToFactory(this.state.doc)); }
  /** The one explicit way a seed changes. */
  newSeed(): EditResult { return this.edit('seed', randomSeed(this.rng)); }
  clearRejection(key: string): void {
    if (this.state.rejections[key] === undefined) return;
    const { [key]: _gone, ...rest } = this.state.rejections;
    this.set({ rejections: rest });
  }

  private applyEdit(key: string, r: EditResult): EditResult {
    if (!r.ok) { this.set({ rejections: { ...this.state.rejections, [key]: r.error } }); return r; }
    const { [key]: _gone, ...rest } = this.state.rejections;
    this.replace(r.doc, rest);
    return r;
  }
  private replace(doc: JellyExperimentalDocument, rejections: Partial<Record<string, string>> = {}): void {
    this.set({ doc, rejections });
    this.scheduleDraft();
  }

  // ---------------------------------------------------------------- documents

  /** Moving to another document ends a conflict about the previous one (the unsaved draft stays; the Library asks before discarding). */
  private leavingConflict(): Partial<JellyWorkState> {
    const c = this.state.conflict;
    return c && c.kind !== 'draft' ? { conflict: null } : {};
  }

  selectPreset(id: string): boolean {
    const doc = presetDoc(id);
    if (!doc || this.state.loading) return false;
    this.navigation++;
    this.set({ doc, base: { kind: 'preset', id, doc: structuredClone(doc) }, recordId: null, rejections: {}, save: { kind: 'clean' }, ...this.leavingConflict() });
    this.scheduleDraft();
    return true;
  }
  openRecord(id: string): boolean {
    const r = this.state.records.find((x) => x.id === id);
    if (!r || this.state.loading) return false;
    this.navigation++;
    this.set({ doc: structuredClone(r.doc), base: { kind: 'record', id, doc: structuredClone(r.doc) }, recordId: id, rejections: {}, save: { kind: 'clean' }, ...this.leavingConflict() });
    this.scheduleDraft();
    return true;
  }

  /** Saves the working document: in place when editing a personal copy, otherwise as a new personal copy. */
  async save(name?: string): Promise<boolean> {
    return this.state.recordId && !name ? this.write(this.state.recordId, this.state.doc.name) : this.saveAsCopy(name);
  }
  async saveAsCopy(name?: string): Promise<boolean> {
    const source = this.state.doc;
    const id = this.newId();
    const copyName = (name ?? (this.state.recordId ? `${source.name} copia` : `${presetLabel(source)} personale`)).slice(0, 80);
    const doc = personalJellyCopy(source, { id, name: copyName, basedOn: this.state.base.kind === 'preset' ? this.state.base.id : source.meta.basedOn, now: this.now() });
    return this.write(id, copyName, doc);
  }

  /**
   * One transaction: the record (conditional on the revision last seen) and the draft that points at it.
   * `expectRev` overrides the revision to expect (an explicit overwrite after a conflict); `undefined` = the revision we know.
   */
  private async write(id: string, name: string, copy?: JellyExperimentalDocument, expectRev?: number | null): Promise<boolean> {
    const projectId = this.state.projectId;
    if (this.state.loading) return false;
    if (!projectId) { this.set({ save: { kind: 'error', message: 'Nessun progetto attivo: il materiale non è stato salvato.' } }); return false; }
    const at = this.now();
    const startDoc = this.state.doc;
    const startNavigation = this.navigation;
    const existing = this.state.records.find((r) => r.id === id);
    const doc = stampJelly(copy ?? { ...startDoc, id, name }, at);
    const expected = expectRev !== undefined ? expectRev : existing ? (existing.rev ?? 0) : null;
    const record: StoredJelly = { id, projectId, doc, basePreset: existing?.basePreset ?? (this.state.base.kind === 'preset' ? this.state.base.id : doc.meta.basedOn), createdAt: existing?.createdAt ?? at, updatedAt: at };
    const draft: JellyDraft = { projectId, doc, recordId: id, basePreset: record.basePreset, savedAt: at };
    this.cancelDraft();
    this.set({ save: { kind: 'saving' } });
    let revs: { record: number | undefined; draft: number | undefined };
    try {
      const writeDraft = !this.draftBlocked;
      const result = await this.enqueue(() => this.repo.commit({ materials: { put: [record], expect: { [id]: expected } }, ...(writeDraft ? { drafts: { put: [draft] } } : {}) }));
      revs = { record: result.materials[id], draft: result.drafts[projectId] };
    } catch (e) {
      // Nothing was written (single transaction); the working document is untouched and its draft is scheduled again.
      if (this.destroyed || this.state.projectId !== projectId) return false;
      if (e instanceof JellyConflictError) {
        const gone = e.conflicts.find((c) => c.store === 'materials')?.actual === null;
        const message = gone
          ? 'Questa copia è stata eliminata da un’altra scheda. Le tue modifiche sono ancora qui e non sono state salvate.'
          : 'Questa copia è stata modificata da un’altra scheda dopo che l’hai aperta. La tua versione non è stata salvata: nulla è stato sovrascritto.';
        this.set({ save: { kind: 'error', message }, conflict: { kind: 'record', recordId: id, reason: gone ? 'deleted' : 'changed', message } });
      } else this.set({ save: { kind: 'error', message: e instanceof JellyStorageError ? e.message : (e as Error).message } });
      this.scheduleDraft();
      return false;
    }
    if (this.destroyed || this.state.projectId !== projectId) return true;
    if (revs.draft !== undefined) this.draftRev = revs.draft;
    const saved: StoredJelly = { ...record, rev: revs.record ?? 0 };
    const records = [...this.state.records.filter((r) => r.id !== id), saved].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    if (this.state.doc === startDoc && this.navigation === startNavigation) {
      this.draftPaused = false;
      this.set({ records, doc: structuredClone(doc), base: { kind: 'record', id, doc: structuredClone(doc) }, recordId: id, rejections: {}, save: { kind: 'saved', at }, conflict: null });
    } else if (this.navigation === startNavigation) {
      // Edited while the write was in flight (same working document): those edits are newer than what was saved. Keep them.
      this.set({ records, base: { kind: 'record', id, doc: structuredClone(doc) }, recordId: id, save: { kind: 'dirty' }, conflict: null });
      this.scheduleDraft();
    } else {
      // The user moved to another document meanwhile: only the list of saved copies changes.
      this.set({ records });
    }
    return true;
  }

  async deleteRecord(id: string): Promise<boolean> {
    const projectId = this.state.projectId;
    const record = this.state.records.find((r) => r.id === id);
    if (!projectId || !record || this.state.loading) return false;
    const editing = this.state.recordId === id;
    try {
      // The draft that pointed at the deleted record goes with it, in the same transaction.
      const result = await this.enqueue(() => this.repo.commit({ materials: { delete: [id], expect: { [id]: record.rev ?? 0 } }, ...(editing && !this.draftBlocked ? { drafts: { delete: [projectId] } } : {}) }));
      void result;
    } catch (e) {
      if (this.destroyed || this.state.projectId !== projectId) return false;
      if (e instanceof JellyConflictError) {
        const message = 'Questa copia è stata modificata o eliminata da un’altra scheda: non è stata eliminata. Ricarica l’elenco per vedere lo stato attuale.';
        this.set({ save: { kind: 'error', message }, conflict: { kind: 'delete', recordId: id, message } });
        void this.refresh();
      } else this.set({ save: { kind: 'error', message: (e as Error).message } });
      return false;
    }
    if (this.destroyed || this.state.projectId !== projectId) return true;
    if (editing && !this.draftBlocked) { this.draftRev = null; this.draftPaused = false; }
    const patch: Partial<JellyWorkState> = { records: this.state.records.filter((r) => r.id !== id) };
    if (editing) Object.assign(patch, { recordId: null, base: { kind: 'import', id: this.state.doc.id, doc: structuredClone(this.state.doc) } satisfies JellyBase });
    this.set(patch);
    return true;
  }

  // ---------------------------------------------------------------- conflicts (explicit choices, never automatic)

  /** Record conflict → write my version over the other tab's, knowing its current revision (recreates the copy if it was deleted). */
  async overwriteRecord(): Promise<boolean> {
    const c = this.state.conflict;
    if (c?.kind !== 'record') return false;
    let rev: number | null;
    try { rev = await this.enqueue(() => this.repo.revisionOf('materials', c.recordId)); }
    catch (e) { this.set({ save: { kind: 'error', message: (e as Error).message } }); return false; }
    return this.write(c.recordId, this.state.doc.name, undefined, rev);
  }

  /** Record conflict → drop my unsaved edits and open the other tab's version. Destructive for the working document: the UI says so. */
  async takeTheirs(): Promise<boolean> {
    const c = this.state.conflict;
    if (c?.kind !== 'record' || c.reason !== 'changed') return false;
    await this.refresh();
    const ok = this.openRecord(c.recordId);
    if (ok) this.set({ conflict: null });
    return ok;
  }

  /** Draft conflict → write my draft over the other tab's (explicit). */
  async overwriteDraft(): Promise<boolean> {
    const projectId = this.state.projectId;
    if (!projectId || this.state.conflict?.kind !== 'draft') return false;
    try { this.draftRev = await this.enqueue(() => this.repo.revisionOf('drafts', projectId)); }
    catch (e) { this.set({ save: { kind: 'error', message: (e as Error).message } }); return false; }
    this.draftPaused = false;
    this.set({ conflict: null });
    this.scheduleDraft();
    await this.flushDraft();
    return this.state.conflict === null;
  }

  /** Draft conflict → drop my draft and load the other tab's. Destructive for the working document: the UI says so. */
  async adoptDraft(): Promise<boolean> {
    const projectId = this.state.projectId;
    if (!projectId || this.state.conflict?.kind !== 'draft') return false;
    try {
      const [report, drafted] = await this.enqueue(() => Promise.all([this.repo.list(projectId), this.repo.readDraft(projectId)]));
      if (this.state.projectId !== projectId) return false;
      this.draftRev = drafted.rev;
      this.draftPaused = false;
      const restored = drafted.draft ? this.restore(drafted.draft, report.items) : null;
      this.navigation++;
      this.set({ records: report.items, skipped: report.skipped, conflict: null, save: { kind: 'clean' }, ...(restored ?? {}) });
      return true;
    } catch (e) {
      this.set({ save: { kind: 'error', message: (e as Error).message } });
      return false;
    }
  }

  exportText(): string { return serializeExperimentalJelly(this.state.doc); }

  /** Validated import; an invalid file changes nothing. The imported material gets a new id (no collisions, no cross-project links). */
  async importText(text: string): Promise<{ ok: true } | { ok: false; errors: string[] }> {
    if (this.state.loading) return { ok: false, errors: ['Caricamento del progetto in corso.'] };
    const r = parseExperimentalJellyText(text);
    if (!r.ok) return { ok: false, errors: r.errors };
    const doc = personalJellyCopy(r.doc, { id: this.newId(), name: r.doc.name, basedOn: r.doc.meta.basedOn, now: this.now() });
    this.navigation++;
    this.set({ doc, base: { kind: 'import', id: doc.id, doc: structuredClone(doc) }, recordId: null, rejections: {}, save: { kind: 'clean' }, ...this.leavingConflict() });
    this.scheduleDraft();
    return { ok: true };
  }

  // ---------------------------------------------------------------- draft

  private scheduleDraft(): void {
    if (!this.state.projectId || this.destroyed || this.state.loading) return;
    this.cancelDraft();
    this.draftProject = this.state.projectId;
    this.draftTimer = setTimeout(() => { void this.flushDraft(); }, this.draftDelay);
  }
  private cancelDraft(): void { if (this.draftTimer) clearTimeout(this.draftTimer); this.draftTimer = null; this.draftProject = null; }

  /**
   * Writes the pending draft now, conditional on the draft revision this tab last saw. If another tab wrote the draft
   * in the meantime, ours is NOT written: `conflict` asks the user. Failure keeps the in-memory state and is surfaced in `save`.
   */
  async flushDraft(): Promise<void> {
    if (!this.draftTimer || !this.draftProject) return;
    const projectId = this.draftProject;
    this.cancelDraft();
    if (projectId !== this.state.projectId || this.draftBlocked || this.draftPaused) return;
    const s = this.state;
    const draft: JellyDraft = { projectId, doc: s.doc, recordId: s.recordId, basePreset: s.base.kind === 'preset' ? s.base.id : null, savedAt: this.now() };
    try {
      const result = await this.enqueue(() => this.repo.commit({ drafts: { put: [draft], expect: { [projectId]: this.draftRev } } }));
      if (this.state.projectId === projectId) this.draftRev = result.drafts[projectId] ?? this.draftRev;
    } catch (e) {
      if (this.destroyed || this.state.projectId !== projectId) return; // an answer about a project we left says nothing about this one
      if (e instanceof JellyConflictError) {
        this.draftPaused = true;
        this.set({ conflict: { kind: 'draft', message: 'La bozza di questo progetto è stata aggiornata da un’altra scheda. La tua non è stata scritta: nulla è stato sovrascritto.' } });
      } else this.set({ save: { kind: 'error', message: (e as Error).message } });
    }
  }

  destroy(): void {
    void this.flushDraft();
    this.destroyed = true;
    this.listeners.clear();
  }
}
