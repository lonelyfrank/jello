/**
 * State of the experimental Jelly lab, outside React (same pattern as lab/store.ts).
 *
 * Holds the working document, the base it can be reset to, the saved personal copies of
 * the active project and the save status. Everything here is parameters and metadata:
 * oscillator state, pressed flags and timestamps live in the renderer and are never part
 * of this state or of what it persists. All persistence goes through JellyRepository
 * (separate database); the stable repository is never used.
 */
import { JELLY_CANDIDATE_PRESETS } from '../../../model/experimental/jelly-presets';
import { parseExperimentalJellyText, serializeExperimentalJelly, type JellyExperimentalDocument, type JellyOverrideState, type JellyParamKey, type JellyStateOverride } from '../../../model/experimental/jelly';
import {
  editJellyParam, editJellyState, isJellyDirty, newJellyId, personalJellyCopy, randomSeed, renameJelly,
  resetJellyParam, resetJellyToBase, resetJellyToFactory, stampJelly, type EditResult,
} from './inspector-model';
import { JellyStorageError, type JellyDraft, type JellyRepository, type StoredJelly } from './repository';

export const DEFAULT_PRESET_ID = 'jelly-soft';
export type JellyBase = { kind: 'preset' | 'record' | 'import'; id: string; doc: JellyExperimentalDocument };
export type JellySave =
  | { kind: 'clean' } | { kind: 'dirty' } | { kind: 'saving' }
  | { kind: 'saved'; at: string } | { kind: 'error'; message: string };

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
}

export const candidatePresets = () => JELLY_CANDIDATE_PRESETS;
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

  // ---------------------------------------------------------------- project scope

  /** Switches project: pending draft of the previous one is written first; then records and draft of the new one are read. */
  async open(projectId: string | null): Promise<void> {
    if (this.destroyed || projectId === this.state.projectId) return;
    await this.flushDraft();
    const token = ++this.token;
    if (!projectId) {
      const soft = presetDoc(DEFAULT_PRESET_ID)!;
      this.set({ projectId: null, loading: false, records: [], skipped: [], doc: soft, base: { kind: 'preset', id: DEFAULT_PRESET_ID, doc: soft }, recordId: null, rejections: {}, save: { kind: 'clean' } });
      return;
    }
    this.set({ projectId, loading: true, records: [], skipped: [], rejections: {} });
    try {
      const [report, draft] = await Promise.all([this.repo.list(projectId), this.repo.getDraft(projectId)]);
      if (token !== this.token || this.destroyed) return;
      const patch: Partial<JellyWorkState> = { loading: false, records: report.items, skipped: report.skipped, persistent: this.repo.persistent, note: this.repo.reason, save: { kind: 'clean' } };
      const restored = this.restore(draft, report.items);
      this.set({ ...patch, ...restored });
    } catch (e) {
      if (token !== this.token) return;
      const soft = presetDoc(DEFAULT_PRESET_ID)!;
      this.set({ loading: false, doc: soft, base: { kind: 'preset', id: DEFAULT_PRESET_ID, doc: soft }, recordId: null, save: { kind: 'error', message: (e as Error).message } });
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

  // ---------------------------------------------------------------- editing

  edit(key: JellyParamKey, value: unknown): EditResult {
    const r = editJellyParam(this.state.doc, key, value);
    return this.applyEdit(key, r);
  }
  editState(state: JellyOverrideState, key: keyof JellyStateOverride, value: string | number | undefined): EditResult {
    return this.applyEdit(`${state}.${key}`, editJellyState(this.state.doc, state, key, value));
  }
  rename(name: string): EditResult { return this.applyEdit('name', renameJelly(this.state.doc, name)); }
  resetParam(key: JellyParamKey): EditResult { return this.applyEdit(key, resetJellyParam(this.state.doc, this.state.base.doc, key)); }
  resetAll(): void { this.replace(resetJellyToBase(this.state.doc, this.state.base.doc)); }
  resetFactory(): void { this.replace(resetJellyToFactory(this.state.doc)); }
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

  selectPreset(id: string): boolean {
    const doc = presetDoc(id);
    if (!doc) return false;
    this.set({ doc, base: { kind: 'preset', id, doc: structuredClone(doc) }, recordId: null, rejections: {}, save: { kind: 'clean' } });
    this.scheduleDraft();
    return true;
  }
  openRecord(id: string): boolean {
    const r = this.state.records.find((x) => x.id === id);
    if (!r) return false;
    this.set({ doc: structuredClone(r.doc), base: { kind: 'record', id, doc: structuredClone(r.doc) }, recordId: id, rejections: {}, save: { kind: 'clean' } });
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
    const copyName = (name ?? (this.state.recordId ? `${source.name} copia` : `${source.name} personale`)).slice(0, 80);
    const doc = personalJellyCopy(source, { id, name: copyName, basedOn: this.state.base.kind === 'preset' ? this.state.base.id : source.meta.basedOn, now: this.now() });
    return this.write(id, copyName, doc);
  }
  private async write(id: string, name: string, copy?: JellyExperimentalDocument): Promise<boolean> {
    const projectId = this.state.projectId;
    if (!projectId) { this.set({ save: { kind: 'error', message: 'Nessun progetto attivo: il materiale non è stato salvato.' } }); return false; }
    const at = this.now();
    const existing = this.state.records.find((r) => r.id === id);
    const doc = stampJelly(copy ?? { ...this.state.doc, id, name }, at);
    const record: StoredJelly = { id, projectId, doc, basePreset: existing?.basePreset ?? (this.state.base.kind === 'preset' ? this.state.base.id : doc.meta.basedOn), createdAt: existing?.createdAt ?? at, updatedAt: at };
    const draft: JellyDraft = { projectId, doc, recordId: id, basePreset: record.basePreset, savedAt: at };
    this.cancelDraft();
    this.set({ save: { kind: 'saving' } });
    try {
      await this.repo.commit({ materials: { put: [record] }, drafts: { put: [draft] } });
    } catch (e) {
      // Nothing was written (single transaction); the working document is untouched.
      this.set({ save: { kind: 'error', message: e instanceof JellyStorageError ? e.message : (e as Error).message } });
      return false;
    }
    if (this.state.projectId !== projectId || this.destroyed) return true;
    const records = [...this.state.records.filter((r) => r.id !== id), record].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    this.set({ records, doc: structuredClone(doc), base: { kind: 'record', id, doc: structuredClone(doc) }, recordId: id, rejections: {}, save: { kind: 'saved', at } });
    return true;
  }

  async deleteRecord(id: string): Promise<boolean> {
    const projectId = this.state.projectId;
    if (!projectId || !this.state.records.some((r) => r.id === id)) return false;
    const editing = this.state.recordId === id;
    try {
      // The draft that pointed at the deleted record goes with it, in the same transaction.
      await this.repo.commit({ materials: { delete: [id] }, ...(editing ? { drafts: { delete: [projectId] } } : {}) });
    } catch (e) {
      this.set({ save: { kind: 'error', message: (e as Error).message } });
      return false;
    }
    if (this.state.projectId !== projectId) return true;
    const patch: Partial<JellyWorkState> = { records: this.state.records.filter((r) => r.id !== id) };
    if (editing) Object.assign(patch, { recordId: null, base: { kind: 'import', id: this.state.doc.id, doc: structuredClone(this.state.doc) } satisfies JellyBase });
    this.set(patch);
    return true;
  }

  exportText(): string { return serializeExperimentalJelly(this.state.doc); }

  /** Validated import; an invalid file changes nothing. The imported material gets a new id (no collisions, no cross-project links). */
  async importText(text: string): Promise<{ ok: true } | { ok: false; errors: string[] }> {
    const r = parseExperimentalJellyText(text);
    if (!r.ok) return { ok: false, errors: r.errors };
    const doc = personalJellyCopy(r.doc, { id: this.newId(), name: r.doc.name, basedOn: r.doc.meta.basedOn, now: this.now() });
    this.set({ doc, base: { kind: 'import', id: doc.id, doc: structuredClone(doc) }, recordId: null, rejections: {}, save: { kind: 'clean' } });
    this.scheduleDraft();
    return { ok: true };
  }

  // ---------------------------------------------------------------- draft

  private scheduleDraft(): void {
    if (!this.state.projectId || this.destroyed) return;
    this.cancelDraft();
    this.draftProject = this.state.projectId;
    this.draftTimer = setTimeout(() => { void this.flushDraft(); }, this.draftDelay);
  }
  private cancelDraft(): void { if (this.draftTimer) clearTimeout(this.draftTimer); this.draftTimer = null; this.draftProject = null; }

  /** Writes the pending draft now. Failure keeps the in-memory state and is surfaced in `save`. */
  async flushDraft(): Promise<void> {
    if (!this.draftTimer || !this.draftProject) return;
    const projectId = this.draftProject;
    this.cancelDraft();
    if (projectId !== this.state.projectId) return;
    const s = this.state;
    try {
      await this.repo.commit({ drafts: { put: [{ projectId, doc: s.doc, recordId: s.recordId, basePreset: s.base.kind === 'preset' ? s.base.id : null, savedAt: this.now() }] } });
    } catch (e) {
      this.set({ save: { kind: 'error', message: (e as Error).message } });
    }
  }

  destroy(): void {
    void this.flushDraft();
    this.destroyed = true;
    this.listeners.clear();
  }
}
