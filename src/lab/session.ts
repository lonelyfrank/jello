/**
 * LabSession: the editor's actions. It owns the store (read by React), the
 * preview controller (driven directly, never by React renders), the local
 * repository with autosave, the URL and the optional phone sync.
 *
 * Library rules:
 * - built-in materials are read-only; editing one keeps the change as a
 *   draft of the project (autosaved, survives a reload) until "Salva come
 *   copia" makes it a personal material;
 * - personal materials are saved in place (autosave, debounced);
 * - imports are atomic and become a new personal material.
 *
 * Component Builder (same preview, same material renderer): templates are
 * read-only like built-in materials (edits are a project draft until "Salva
 * nella libreria"), user components are saved in place. A component carries
 * its material; saving it as a personal preset adds it to the material
 * library without touching what the Material Lab has open.
 */

import {
  BUILTIN_MATERIALS,
  builtinMaterial,
  createGlassDocument,
  glassParams,
  isBuiltinId,
  parseMaterialText,
  serializeMaterial,
  toLegacyV1,
  withGlassParams,
  type BackendRequest,
  type MaterialDocument,
  type QualitySettings,
} from '../model';
import { defaultParams, type GlassParams, type ParamKey } from '../core/params';
import { buildPackage, packageZip, type PackageKind, type RuntimeBundle } from '../export/package';
import { exportAdapter, type ExportRequest } from '../export/adapters';
import {
  bindMaterial,
  COMPONENT_TEMPLATES,
  componentTemplate,
  parseComponentText,
  serializeComponent,
  withRootField,
  type ComponentDocument,
} from '../components/document';
import {
  addBreakpoint,
  addTab,
  duplicateTab,
  moveTab,
  removeBreakpoint,
  removeTab,
  updateBreakpoint,
  updateTab,
  type BnOverrideKey,
  type BnRoot,
  type BnTab,
  type BnTabStyle,
} from '../components/bottom-navigation/model';
import { iconFromSvg, SVG_MAX_BYTES, type IconRef } from '../components/icons';
import type { PreviewState } from '../runtime/bottom-navigation';
import { ComponentOverlay } from '../stage/component-overlay';
import { PreviewController, type PreviewRequest } from '../stage/controller';
import { PHOTO } from '../stage/scenes';
import type { ViewOptions } from '../stage/view';
import { optionsFromQuery, queryFromOptions } from './state';
import { Autosaver, type SaveState } from './storage/autosave';
import { openRepository, type Repository, type StoredAsset, type StoredComponent, type StoredMaterial } from './storage/repository';
import { bindStore, Store, type BuilderState, type ComponentItem, type LabState, type LibraryItem, type Workspace } from './store';
import { sha256, SyncSender } from './sync-sender';
import { newToken } from '../sync/protocol';

const now = () => new Date().toISOString();

function userId(): string {
  return `user-${newToken().slice(0, 10).toLowerCase()}`;
}

function builtinItems(): LibraryItem[] {
  return BUILTIN_MATERIALS.map((b) => ({
    id: b.doc.id,
    name: b.doc.name,
    origin: 'builtin',
    doc: b.doc,
    approximation: b.approximation,
    note: b.note,
    updatedAt: null,
  }));
}

function userItem(m: StoredMaterial): LibraryItem {
  return { id: m.id, name: m.doc.name, origin: 'user', doc: m.doc, approximation: false, note: m.doc.meta.notes, updatedAt: m.updatedAt };
}

function templateItems(): ComponentItem[] {
  return COMPONENT_TEMPLATES.map((t) => ({ id: t.id, name: t.label, origin: 'template', doc: t.create(), description: t.description, updatedAt: null }));
}

function componentItem(c: StoredComponent): ComponentItem {
  return { id: c.id, name: c.doc.name, origin: 'user', doc: c.doc, description: c.doc.meta.notes, updatedAt: c.updatedAt };
}

function componentId(): string {
  return `cmp-${newToken().slice(0, 10).toLowerCase()}`;
}

function builderState(doc: ComponentDocument, componentId: string, origin: BuilderState['origin'], modified: boolean): BuilderState {
  return { doc, componentId, origin, modified, selection: 'root', previewTab: doc.root.defaultTab, previewState: null, pick: false, messages: null };
}

const PATH_OF_BACKEND: Record<BackendRequest, ViewOptions['path'] | null> = { auto: 'auto', svg: 'refraction', css: 'satin', webgl2: null };
const BACKEND_OF_PATH: Record<ViewOptions['path'], BackendRequest | null> = { auto: 'auto', refraction: 'svg', satin: 'css', opaque: null };

export class LabSession {
  readonly store: Store;
  controller: PreviewController | null = null;
  private readonly repo: Repository;
  private readonly autosaver: Autosaver;
  private readonly sync: SyncSender;
  private userMaterials = new Map<string, StoredMaterial>();
  private userComponents = new Map<string, StoredComponent>();
  private overlay: ComponentOverlay | null = null;
  private discarded: Pick<LabState, 'doc' | 'materialId' | 'origin' | 'modified'> | null = null;
  private image: { hash: string; blob: Blob; url: string } | null = null;
  private urlTimer = 0;
  private noticeTimer = 0;
  private readonly readyListeners: (() => void)[] = [];

  private constructor(repo: Repository, state: LabState) {
    this.repo = repo;
    this.store = new Store(state);
    bindStore(this.store);
    this.autosaver = new Autosaver(() => this.write(), (s) => this.store.set({ save: s }), 600, repo.persistent ? null : repo.reason);
    this.sync = new SyncSender(
      () => ({ material: this.state.doc, view: this.state.options, image: this.image?.blob ?? null }),
      (s) => this.store.set({ sync: s }),
    );
    addEventListener('pagehide', () => void this.autosaver.flush());
  }

  static async boot(): Promise<LabSession> {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const boot = optionsFromQuery(new URLSearchParams(location.search), reduced);
    const repo = await openRepository();
    const lib = await repo.listMaterials().catch(() => ({ items: [], skipped: ['lettura della libreria non riuscita'] }));
    const comps = await repo.listComponents().catch(() => ({ items: [] as StoredComponent[], skipped: ['lettura delle componenti non riuscita'] }));
    const project = boot.explicit ? null : await repo.getProject().catch(() => null);
    const query = new URLSearchParams(location.search);
    const ws = query.get('workspace');
    const workspace: Workspace = ws === 'builder' || ws === 'material' ? ws : (project?.workspace ?? 'material');
    const userComps = new Map(comps.items.map((c) => [c.id, c]));
    const wantedComponent = query.get('component') ?? project?.componentId ?? 'bt-darts';
    let builder: BuilderState;
    if (userComps.has(wantedComponent)) builder = builderState(userComps.get(wantedComponent)!.doc, wantedComponent, 'user', false);
    else {
      const t = componentTemplate(wantedComponent) ?? componentTemplate('bt-darts')!;
      const draft = project?.componentDraft && project.componentId === t.id ? project.componentDraft : null;
      builder = builderState(draft ?? t.create(), t.id, 'template', draft !== null);
    }

    let doc: MaterialDocument = builtinMaterial(boot.preset)!.doc;
    let materialId = boot.preset;
    let origin: 'builtin' | 'user' = 'builtin';
    let modified = false;
    let options = boot.options;
    const user = new Map(lib.items.map((m) => [m.id, m]));
    const wanted = boot.material ?? project?.materialId ?? null;
    if (wanted && user.has(wanted)) {
      doc = user.get(wanted)!.doc;
      materialId = wanted;
      origin = 'user';
    } else if (wanted && isBuiltinId(wanted)) {
      doc = builtinMaterial(wanted)!.doc;
      materialId = wanted;
    }
    if (project) {
      options = { ...options, ...project.options };
      if (project.draft && project.materialId === materialId) {
        doc = project.draft;
        modified = origin === 'builtin';
      }
    }
    if (boot.quality) doc = { ...doc, quality: { ...doc.quality, profile: boot.quality } };
    // A document that targets a DOM backend sets the path unless the URL chose one.
    if (!new URLSearchParams(location.search).has('path')) {
      const path = PATH_OF_BACKEND[doc.target.backend];
      if (path) options = { ...options, path };
    }

    const session = new LabSession(repo, {
      doc,
      materialId,
      origin,
      modified,
      options,
      library: [...builtinItems(), ...lib.items.map(userItem)],
      librarySkipped: lib.skipped,
      save: repo.persistent ? { kind: 'idle' } : { kind: 'memory', message: repo.reason ?? '' },
      persistent: repo.persistent,
      storageNote: repo.reason,
      report: null,
      importMessages: null,
      exportText: '',
      notice: null,
      sync: { kind: 'off' },
      layout: { left: true, right: true, drawer: false },
      workspace,
      builder,
      components: [...templateItems(), ...comps.items.map(componentItem)],
      componentsSkipped: comps.skipped,
      exportOpen: false,
    });
    session.userMaterials = user;
    session.userComponents = userComps;
    const imageHash = project?.imageHash;
    if (imageHash) await session.restoreImage(imageHash);
    return session;
  }

  get state(): LabState {
    return this.store.get();
  }

  // ---------- preview ----------

  /** Called once by the Preview component with its container. */
  mountPreview(el: HTMLElement): void {
    if (this.controller) {
      el.append(this.controller.stagesEl);
      return;
    }
    this.controller = new PreviewController({
      root: el,
      material: this.state.doc,
      options: this.state.options,
      onRequest: (r) => this.onPreviewRequest(r),
      resolveAsset: (url) => this.resolveAsset(url),
      photo: PHOTO.src,
    });
    if (this.image) this.controller.setLocalImage(this.image.url);
    this.controller.onReport((r) => this.store.set({ report: r }));
    if (this.state.workspace === 'builder') this.showBuilderPreview();
    this.store.set({ report: this.controller.report() });
    // The address bar always shows the scenario being looked at.
    this.scheduleUrl();
    for (const l of this.readyListeners.splice(0)) l();
  }

  onReady(l: () => void): void {
    if (this.controller) l();
    else this.readyListeners.push(l);
  }

  private onPreviewRequest(r: PreviewRequest) {
    if (r.type === 'option') this.setOption(r.key, r.value as never);
    else this.setParam(r.key, r.value);
  }

  resolveAsset(url: string): string {
    if (url === 'example:tulips') return PHOTO.src;
    if (url.startsWith('asset:') && this.image && url === `asset:${this.image.hash}`) return this.image.url;
    return url;
  }

  // ---------- material edits ----------

  setParam<K extends ParamKey>(key: K, value: GlassParams[K]): void {
    const p = glassParams(this.state.doc);
    if (p[key] === value) return;
    this.applyDoc(withGlassParams(this.state.doc, { ...p, [key]: value }));
  }

  setParams(patch: Partial<GlassParams>): void {
    this.applyDoc(withGlassParams(this.state.doc, { ...glassParams(this.state.doc), ...patch }));
  }

  resetParams(): void {
    this.applyDoc(withGlassParams(this.state.doc, defaultParams()));
  }

  setQuality(patch: Partial<QualitySettings>): void {
    this.applyDoc({ ...this.state.doc, quality: { ...this.state.doc.quality, ...patch } });
  }

  /** Requested backend. WebGL2 materials describe a texture source; DOM backends a DOM source. */
  setBackend(backend: BackendRequest): void {
    const doc = this.state.doc;
    const source: MaterialDocument['source'] =
      backend === 'webgl2' ? { kind: 'texture', texture: this.textureSpec() } : { kind: 'dom' };
    this.applyDoc({ ...doc, target: { ...doc.target, backend }, source });
    const path = PATH_OF_BACKEND[backend];
    if (path) this.setOption('path', path, false);
    else if (this.state.options.mode !== 'scene') this.setOption('mode', 'scene');
  }

  setFallback(fallback: 'css' | 'opaque'): void {
    this.applyDoc({ ...this.state.doc, target: { ...this.state.doc.target, fallback } });
  }

  setNotes(notes: string): void {
    this.applyDoc({ ...this.state.doc, meta: { ...this.state.doc.meta, notes } });
  }

  private textureSpec(): Extract<MaterialDocument['source'], { kind: 'texture' }>['texture'] {
    const o = this.state.options;
    if (o.texture === 'image') return { kind: 'image', url: this.image ? `asset:${this.image.hash}` : 'example:tulips' };
    return { kind: 'pattern', pattern: 'grid', animated: o.animate };
  }

  private applyDoc(doc: MaterialDocument, opts: { dirty?: boolean } = {}) {
    // In the builder the preview shows the component's material; the Material Lab's waits.
    const report = this.state.workspace === 'material' ? this.controller?.setMaterial(doc) : undefined;
    const modified = opts.dirty === false ? false : this.state.origin === 'builtin' ? true : this.state.modified;
    this.store.set({ doc, modified, library: this.syncLibrary(doc) });
    this.afterChange();
    return report;
  }

  /** Personal material edited: the library card shows the new name/params at once. */
  private syncLibrary(doc: MaterialDocument): LibraryItem[] {
    const s = this.state;
    if (s.origin !== 'user') return s.library;
    return s.library.map((i) => (i.id === s.materialId ? { ...i, name: doc.name, doc } : i));
  }

  private afterChange() {
    this.autosaver.schedule();
    this.sync.push();
    this.scheduleUrl();
  }

  // ---------- view options ----------

  setOption<K extends keyof ViewOptions>(key: K, value: ViewOptions[K], syncDoc = true): void {
    const options = { ...this.state.options, [key]: value };
    this.controller?.setOption(key, value);
    this.store.set({ options });
    if (syncDoc && key === 'path') {
      const backend = BACKEND_OF_PATH[value as ViewOptions['path']];
      // "opaque" inspects the fallback; it is not a property of the material.
      if (backend && backend !== this.state.doc.target.backend && this.state.doc.target.backend !== 'webgl2') {
        this.applyDoc({ ...this.state.doc, target: { ...this.state.doc.target, backend }, source: { kind: 'dom' } });
      }
    }
    if ((key === 'texture' || key === 'animate') && this.state.doc.source.kind === 'texture') {
      this.applyDoc({ ...this.state.doc, source: { kind: 'texture', texture: this.textureSpec() } });
    }
    this.autosaver.schedule();
    this.sync.push();
    this.scheduleUrl();
  }

  // ---------- library ----------

  openMaterial(id: string): void {
    const s = this.state;
    if (id === s.materialId && !s.modified) return;
    const item = s.library.find((i) => i.id === id);
    if (!item) return;
    if (s.origin === 'builtin' && s.modified) {
      this.discarded = { doc: s.doc, materialId: s.materialId, origin: s.origin, modified: true };
      this.notify(`Modifiche a «${s.doc.name}» scartate.`, true);
    }
    this.store.set({ materialId: id, origin: item.origin, modified: false });
    this.loadDocIntoView(item.doc);
  }

  private loadDocIntoView(doc: MaterialDocument) {
    this.applyDoc(doc, { dirty: false });
    const path = PATH_OF_BACKEND[doc.target.backend];
    if (path && path !== this.state.options.path) this.setOption('path', path, false);
    if (doc.source.kind === 'texture') {
      const t = doc.source.texture;
      if (t.kind === 'pattern' || t.kind === 'image') this.setOption('texture', t.kind, false);
    }
  }

  undoDiscard(): void {
    const d = this.discarded;
    if (!d) return;
    this.discarded = null;
    this.store.set({ materialId: d.materialId, origin: d.origin, notice: null });
    this.applyDoc(d.doc);
  }

  async newMaterial(): Promise<void> {
    const n = this.state.library.filter((i) => i.origin === 'user').length + 1;
    const doc = createGlassDocument({ id: userId(), name: `Nuovo glass ${n}`, meta: { createdAt: now(), updatedAt: now() } });
    await this.addUser(doc, `Creato «${doc.name}».`);
  }

  async duplicate(): Promise<void> {
    const src = this.state.doc;
    const doc: MaterialDocument = {
      ...src,
      id: userId(),
      name: `Copia di ${src.name}`.slice(0, 80),
      meta: { ...src.meta, basedOn: src.meta.basedOn ?? (this.state.origin === 'builtin' ? this.state.materialId : null), createdAt: now(), updatedAt: now() },
    };
    await this.addUser(doc, `Creata la copia personale «${doc.name}».`);
  }

  /** Built-in edited: its draft becomes a personal material. */
  saveAsCopy(): Promise<void> {
    return this.duplicate();
  }

  async saveNow(): Promise<void> {
    await this.autosaver.flush();
  }

  rename(name: string): void {
    const clean = name.trim().slice(0, 80);
    if (!clean || this.state.origin !== 'user') return;
    this.applyDoc({ ...this.state.doc, name: clean });
  }

  async deleteMaterial(id: string): Promise<void> {
    if (isBuiltinId(id)) return;
    try {
      await this.repo.deleteMaterial(id);
    } catch (e) {
      this.notify((e as Error).message);
      return;
    }
    this.userMaterials.delete(id);
    const library = this.state.library.filter((i) => i.id !== id);
    this.store.set({ library });
    if (this.state.materialId === id) {
      const fallback = builtinMaterial('jello')!.doc;
      this.store.set({ materialId: 'jello', origin: 'builtin', modified: false });
      this.loadDocIntoView(fallback);
    }
    this.notify('Materiale personale eliminato.');
  }

  private async addUser(doc: MaterialDocument, message: string) {
    const rec: StoredMaterial = { id: doc.id, doc, createdAt: now(), updatedAt: now() };
    this.userMaterials.set(doc.id, rec);
    this.store.set({ library: [...this.state.library, userItem(rec)], materialId: doc.id, origin: 'user', modified: false });
    this.applyDoc(doc, { dirty: false });
    await this.autosaver.flush();
    const s = this.state.save;
    this.notify(s.kind === 'error' ? `${message} ${s.message}` : message);
  }

  /** The only place that writes: project + the personal material being edited. */
  private async write() {
    const s = this.state;
    if (s.origin === 'user') {
      const prev = this.userMaterials.get(s.materialId);
      const rec: StoredMaterial = {
        id: s.materialId,
        doc: { ...s.doc, meta: { ...s.doc.meta, updatedAt: now() } },
        createdAt: prev?.createdAt ?? now(),
        updatedAt: now(),
      };
      await this.repo.putMaterial(rec);
      this.userMaterials.set(rec.id, rec);
    }
    const b = s.builder;
    if (b.origin === 'user') {
      const prev = this.userComponents.get(b.componentId);
      // The document is stored exactly as edited: reopening it gives the same JSON.
      const rec: StoredComponent = {
        id: b.componentId,
        doc: b.doc,
        createdAt: prev?.createdAt ?? now(),
        updatedAt: now(),
      };
      await this.repo.putComponent(rec);
      this.userComponents.set(rec.id, rec);
    }
    await this.repo.putProject({
      id: 'last',
      materialId: s.materialId,
      draft: s.origin === 'builtin' && s.modified ? s.doc : null,
      options: s.options,
      savedAt: now(),
      imageHash: this.image?.hash ?? null,
      workspace: s.workspace,
      componentId: b.componentId,
      componentDraft: b.origin === 'template' && b.modified ? b.doc : null,
    });
  }

  // ---------- import / export ----------

  importText(text: string): void {
    const r = parseMaterialText(text);
    if (!r.ok) {
      this.store.set({ importMessages: { ok: false, messages: r.errors } });
      return;
    }
    // Atomic: from here on the document is complete and valid.
    const taken = isBuiltinId(r.doc.id) || this.userMaterials.has(r.doc.id);
    const doc: MaterialDocument = { ...r.doc, id: taken ? userId() : r.doc.id, meta: { ...r.doc.meta, createdAt: r.doc.meta.createdAt ?? now(), updatedAt: now() } };
    const messages = [...(r.migratedFrom ? [`Migrato da ${r.migratedFrom} a jello-material v2, nessun parametro perso.`] : []), ...r.warnings];
    if (taken) messages.push(`id «${r.doc.id}» già in uso: salvato come «${doc.id}».`);
    this.store.set({ importMessages: { ok: true, messages } });
    void this.addUser(doc, `Importato «${doc.name}».`);
  }

  exportJson(): string {
    const text = serializeMaterial(this.state.doc);
    this.store.set({ exportText: text });
    return text;
  }

  exportLegacy(): { text: string; dropped: string[] } {
    const r = toLegacyV1(this.state.doc);
    this.store.set({ exportText: r.text, importMessages: { ok: true, messages: [`Formato jello-glass v1. Non rappresentabili e omessi: ${r.dropped.join('; ')}.`] } });
    return r;
  }

  download(name: string, data: BlobPart, type: string): void {
    const blob = new Blob([data], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async exportPackage(kind: PackageKind): Promise<{ ok: boolean; messages: string[] }> {
    try {
      const runtime = kind === 'runtime' ? await fetchRuntime() : undefined;
      const result = await buildPackage({
        material: this.state.doc,
        kind,
        ...(runtime ? { runtime } : {}),
        resolveAsset: (url) => this.assetBytes(url),
      });
      this.download(`${result.root}.zip`, packageZip(result) as Uint8Array<ArrayBuffer>, 'application/zip');
      const messages = [`Pacchetto ${kind === 'runtime' ? 'runtime' : 'solo CSS'}: ${result.files.length} file.`, ...result.warnings];
      this.store.set({ importMessages: { ok: true, messages } });
      return { ok: true, messages };
    } catch (e) {
      const messages = [(e as Error).message];
      this.store.set({ importMessages: { ok: false, messages } });
      return { ok: false, messages };
    }
  }

  private async assetBytes(url: string) {
    if (url === 'example:tulips') {
      const r = await fetch(PHOTO.src);
      return { data: new Uint8Array(await r.arrayBuffer()), type: 'image/jpeg', name: 'tulips-kuznietsov-cc0.jpg' };
    }
    if (url.startsWith('asset:')) {
      const a = await this.repo.getAsset(url.slice(6));
      if (!a) return null;
      const ext = a.type.split('/')[1]?.replace('jpeg', 'jpg') ?? 'bin';
      return { data: new Uint8Array(await a.blob.arrayBuffer()), type: a.type, name: `${a.hash.slice(0, 16)}.${ext}` };
    }
    return null;
  }

  // ---------- local image ----------

  async setLocalImage(file: File): Promise<void> {
    const buf = await file.arrayBuffer();
    const hash = await sha256(buf);
    const asset: StoredAsset = { hash, type: file.type || 'image/*', blob: new Blob([buf], { type: file.type }), name: file.name };
    try {
      await this.repo.putAsset(asset);
    } catch (e) {
      this.notify(`Immagine usata ma non salvata: ${(e as Error).message}`);
    }
    this.useImage(asset);
    this.setOption('scene', 'photo');
    if (this.state.doc.source.kind === 'texture') this.applyDoc({ ...this.state.doc, source: { kind: 'texture', texture: this.textureSpec() } });
  }

  private async restoreImage(hash: string) {
    const a = await this.repo.getAsset(hash).catch(() => null);
    if (a) this.useImage(a);
  }

  private useImage(a: StoredAsset) {
    if (this.image) URL.revokeObjectURL(this.image.url);
    this.image = { hash: a.hash, blob: a.blob, url: URL.createObjectURL(a.blob) };
    this.controller?.setLocalImage(this.image.url);
    this.autosaver.schedule();
    this.sync.push();
  }

  // ---------- phone sync ----------

  startSync(relay: string): string {
    const token = newToken();
    this.sync.start(relay, token);
    return token;
  }

  stopSync(): void {
    this.sync.stop();
  }

  // ---------- layout and notices ----------

  toggleColumn(which: 'left' | 'right'): void {
    const layout = { ...this.state.layout, [which]: !this.state.layout[which] };
    this.store.set({ layout });
    requestAnimationFrame(() => this.controller?.main.ctx.measureAll());
  }

  setDrawer(open: boolean): void {
    this.store.set({ layout: { ...this.state.layout, drawer: open } });
    requestAnimationFrame(() => {
      for (const st of this.controller?.stages() ?? []) st.ctx.measureAll();
    });
  }

  notify(text: string, undo = false): void {
    this.store.set({ notice: { text, undo } });
    clearTimeout(this.noticeTimer);
    this.noticeTimer = window.setTimeout(() => this.store.set({ notice: null }), undo ? 8000 : 4000);
  }

  get saveState(): SaveState {
    return this.autosaver.status;
  }

  scenarioUrl(): string {
    const s = this.state;
    const q = queryFromOptions(s.options, s.materialId, s.doc.quality.profile);
    if (s.workspace === 'builder') {
      q.set('workspace', 'builder');
      q.set('component', s.builder.componentId);
    }
    return `${location.origin}${location.pathname}?${q}`;
  }

  private scheduleUrl() {
    clearTimeout(this.urlTimer);
    this.urlTimer = window.setTimeout(() => {
      history.replaceState(null, '', this.scenarioUrl());
    }, 400);
  }
  // ---------- workspace ----------

  setWorkspace(ws: Workspace): void {
    if (ws === this.state.workspace) return;
    this.store.set({ workspace: ws });
    if (ws === 'builder') this.showBuilderPreview();
    else this.hideBuilderPreview();
    this.autosaver.schedule();
    this.scheduleUrl();
  }

  /** Mounts the builder's component on the preview's main stage (same group and renderer as the demo objects). */
  private showBuilderPreview() {
    const c = this.controller;
    if (!c) return;
    if (this.state.options.mode !== 'components') this.setOption('mode', 'components', false);
    const b = this.state.builder;
    const nav = c.showComponent(b.doc, { activeTab: b.previewTab, onChange: (id) => this.patchBuilder({ previewTab: id }) });
    this.overlay?.destroy();
    this.overlay = new ComponentOverlay(c.main.root, nav, (id) => this.selectElement(id));
    this.overlay.setPicking(b.pick);
    this.syncSelection();
  }

  private hideBuilderPreview() {
    this.overlay?.destroy();
    this.overlay = null;
    this.controller?.hideComponent(this.state.doc);
  }

  private patchBuilder(patch: Partial<BuilderState>) {
    this.store.set({ builder: { ...this.state.builder, ...patch } });
  }

  /** The only path a component edit takes: preview first, then the store, then autosave. */
  private applyComponent(doc: ComponentDocument, opts: { dirty?: boolean } = {}) {
    const b = this.state.builder;
    const modified = opts.dirty === false ? false : b.origin === 'template' ? true : b.modified;
    if (this.state.workspace === 'builder') this.controller?.updateComponent(doc);
    const previewTab = doc.root.children.some((t) => t.id === b.previewTab) ? b.previewTab : doc.root.defaultTab;
    const selection = b.selection === 'root' || b.selection === 'material' || doc.root.children.some((t) => t.id === b.selection) ? b.selection : 'root';
    const components = b.origin === 'user' ? this.state.components.map((i) => (i.id === b.componentId ? { ...i, name: doc.name, doc } : i)) : this.state.components;
    this.store.set({ builder: { ...b, doc, modified, previewTab, selection }, components });
    this.syncSelection();
    this.autosaver.schedule();
    this.scheduleUrl();
  }

  private withRoot(root: BnRoot): ComponentDocument {
    return { ...this.state.builder.doc, root };
  }

  // ---------- selection and preview simulation ----------

  selectElement(id: string): void {
    const doc = this.state.builder.doc;
    if (id !== 'root' && id !== 'material' && !doc.root.children.some((t) => t.id === id)) return;
    this.patchBuilder({ selection: id, previewState: null });
    this.syncSelection();
  }

  setPick(on: boolean): void {
    this.patchBuilder({ pick: on });
    this.overlay?.setPicking(on);
  }

  /** Shows hover / pressed / focus on the selected tab without input. */
  setPreviewState(state: PreviewState | null): void {
    this.patchBuilder({ previewState: state });
    this.syncSelection();
  }

  setPreviewTab(id: string): void {
    if (!this.state.builder.doc.root.children.some((t) => t.id === id)) return;
    this.patchBuilder({ previewTab: id });
    this.controller?.component?.setActiveTab(id);
  }

  private syncSelection() {
    const b = this.state.builder;
    const id = b.selection === 'material' ? 'root' : b.selection;
    const tab = b.doc.root.children.find((t) => t.id === id);
    this.overlay?.setSelected(id, tab ? tab.label : b.doc.name);
    this.overlay?.refresh();
    this.controller?.component?.previewState(tab ? tab.id : null, tab ? b.previewState : null);
  }

  // ---------- structure ----------

  setComponentName(name: string): void {
    const clean = name.trim().slice(0, 80);
    if (clean) this.applyComponent({ ...this.state.builder.doc, name: clean });
  }

  /** A described root property (layout.height, states.focus.color…). Invalid values are refused. */
  setComponentField(path: string, value: unknown): boolean {
    const next = withRootField(this.state.builder.doc, path, value);
    if (!next) return false;
    this.applyComponent(next);
    return true;
  }

  setComponentRoot(patch: Partial<Pick<BnRoot, 'label' | 'semantics' | 'defaultTab'>>): void {
    const root = this.state.builder.doc.root;
    if (patch.defaultTab !== undefined && !root.children.some((t) => t.id === patch.defaultTab)) return;
    if (patch.label !== undefined && !patch.label.trim()) return;
    this.applyComponent(this.withRoot({ ...root, ...patch }));
  }

  addTab(): string {
    const b = this.state.builder;
    const after = b.doc.root.children.some((t) => t.id === b.selection) ? b.selection : undefined;
    const r = addTab(b.doc.root, after ? { after } : {});
    this.applyComponent(this.withRoot(r.root));
    this.selectElement(r.id);
    return r.id;
  }

  removeTab(id: string): void {
    const root = this.state.builder.doc.root;
    if (root.children.length <= 1) {
      this.notify('Una navigazione ha almeno una tab: aggiungine un’altra prima di eliminare questa.');
      return;
    }
    const i = root.children.findIndex((t) => t.id === id);
    const next = removeTab(root, id);
    this.applyComponent(this.withRoot(next));
    this.selectElement(next.children[Math.min(i, next.children.length - 1)]?.id ?? 'root');
  }

  duplicateTab(id: string): void {
    const r = duplicateTab(this.state.builder.doc.root, id);
    this.applyComponent(this.withRoot(r.root));
    this.selectElement(r.id);
  }

  /** delta -1: one place towards the start; +1: towards the end. */
  moveTab(id: string, delta: number): void {
    const root = this.state.builder.doc.root;
    const i = root.children.findIndex((t) => t.id === id);
    if (i < 0) return;
    this.applyComponent(this.withRoot(moveTab(root, id, i + delta)));
  }

  updateTab(id: string, patch: Partial<Pick<BnTab, 'label' | 'icon' | 'value' | 'disabled'>>): void {
    if (patch.label !== undefined && (!patch.label.trim() || patch.label.length > 40)) return;
    this.applyComponent(this.withRoot(updateTab(this.state.builder.doc.root, id, patch)));
  }

  setTabStyle(id: string, key: keyof BnTabStyle, value: number | null): void {
    this.applyComponent(this.withRoot(updateTab(this.state.builder.doc.root, id, { style: { [key]: value } as Partial<BnTabStyle> as BnTabStyle })));
  }

  setTabIcon(id: string, icon: IconRef): void {
    this.updateTab(id, { icon });
  }

  /** Custom SVG icon: sanitized (allowlist), refused with every reason otherwise. */
  async uploadTabIcon(id: string, file: File): Promise<boolean> {
    if (file.size > SVG_MAX_BYTES) {
      this.patchBuilder({ messages: { ok: false, messages: [`«${file.name}»: SVG troppo grande (massimo ${SVG_MAX_BYTES / 1024} KB).`] } });
      return false;
    }
    const r = iconFromSvg(await file.text(), file.name);
    if (!r.ok) {
      this.patchBuilder({ messages: { ok: false, messages: [`«${file.name}» rifiutato:`, ...r.errors] } });
      return false;
    }
    this.setTabIcon(id, r.icon);
    this.patchBuilder({ messages: { ok: true, messages: [`Icona «${r.icon.name}» applicata (${r.icon.paint === 'fill' ? 'riempimento' : 'tratto'}).`, ...r.warnings] } });
    return true;
  }

  addBreakpoint(maxWidth = 480): void {
    this.applyComponent(this.withRoot(addBreakpoint(this.state.builder.doc.root, maxWidth).root));
  }

  updateBreakpoint(id: string, patch: { maxWidth?: number; set?: [BnOverrideKey, number | string | null] }): void {
    this.applyComponent(this.withRoot(updateBreakpoint(this.state.builder.doc.root, id, patch)));
  }

  removeBreakpoint(id: string): void {
    this.applyComponent(this.withRoot(removeBreakpoint(this.state.builder.doc.root, id)));
  }

  // ---------- the component's material ----------

  setComponentParam<K extends ParamKey>(key: K, value: GlassParams[K]): void {
    const doc = this.state.builder.doc;
    const m = doc.material.document;
    const p = glassParams(m);
    if (p[key] === value) return;
    this.applyComponent({ ...doc, material: { ...doc.material, document: withGlassParams(m, { ...p, [key]: value }) } });
  }

  /** Applies a library material (built-in or personal) to the component. */
  applyMaterialPreset(id: string): void {
    const item = this.state.library.find((i) => i.id === id);
    if (!item) return;
    this.applyComponent({ ...this.state.builder.doc, material: bindMaterial(item.doc, id) });
  }

  /** Back to the values of the preset the material came from (or the defaults). */
  resetComponentMaterial(): void {
    const doc = this.state.builder.doc;
    const preset = doc.material.preset ? this.state.library.find((i) => i.id === doc.material.preset) : undefined;
    const params = preset ? glassParams(preset.doc) : defaultParams();
    this.applyComponent({ ...doc, material: { ...doc.material, document: withGlassParams(doc.material.document, params) } });
  }

  /** The component's material becomes a personal preset of the library (Material Lab selection unchanged). */
  async saveComponentMaterialAsPreset(name: string): Promise<string | null> {
    const clean = name.trim().slice(0, 80);
    if (!clean) return null;
    const doc = this.state.builder.doc;
    const src = doc.material.document;
    const m: MaterialDocument = { ...src, id: userId(), name: clean, meta: { ...src.meta, basedOn: doc.material.preset ?? src.meta.basedOn, createdAt: now(), updatedAt: now() } };
    const rec: StoredMaterial = { id: m.id, doc: m, createdAt: now(), updatedAt: now() };
    try {
      await this.repo.putMaterial(rec);
    } catch (e) {
      this.notify(`Preset non salvato: ${(e as Error).message}`);
      return null;
    }
    this.userMaterials.set(m.id, rec);
    this.store.set({ library: [...this.state.library, userItem(rec)] });
    this.applyComponent({ ...doc, material: bindMaterial(m, m.id) });
    this.notify(`Preset «${clean}» salvato nella libreria.`);
    return m.id;
  }

  // ---------- component library ----------

  openComponent(id: string): void {
    const b = this.state.builder;
    if (id === b.componentId && !b.modified) return;
    const item = this.state.components.find((i) => i.id === id);
    if (!item) return;
    if (b.origin === 'template' && b.modified) this.notify(`Modifiche al template «${b.doc.name}» scartate.`);
    const doc = item.origin === 'template' ? componentTemplate(id)!.create() : item.doc;
    this.store.set({ builder: builderState(doc, id, item.origin, false) });
    if (this.state.workspace === 'builder') {
      this.controller?.updateComponent(doc);
      this.controller?.component?.setActiveTab(doc.root.defaultTab, false);
      this.overlay?.setPicking(false);
    }
    this.syncSelection();
    this.autosaver.schedule();
    this.scheduleUrl();
  }

  /** Template → a personal copy; personal → saved now. */
  async saveComponent(): Promise<void> {
    const b = this.state.builder;
    if (b.origin === 'user') {
      await this.autosaver.flush();
      this.notify(`«${b.doc.name}» salvata.`);
      return;
    }
    await this.addUserComponent({ ...b.doc, id: componentId(), meta: { ...b.doc.meta, basedOn: b.componentId, createdAt: now(), updatedAt: now() } }, `«${b.doc.name}» salvata nella libreria.`);
  }

  async duplicateComponent(): Promise<void> {
    const b = this.state.builder;
    const name = `Copia di ${b.doc.name}`.slice(0, 80);
    await this.addUserComponent({ ...b.doc, id: componentId(), name, meta: { ...b.doc.meta, createdAt: now(), updatedAt: now() } }, `Creata la copia «${name}».`);
  }

  renameComponent(name: string): void {
    if (this.state.builder.origin !== 'user') return;
    this.setComponentName(name);
  }

  async deleteComponent(id: string): Promise<void> {
    if (!this.userComponents.has(id)) return;
    try {
      await this.repo.deleteComponent(id);
    } catch (e) {
      this.notify((e as Error).message);
      return;
    }
    this.userComponents.delete(id);
    this.store.set({ components: this.state.components.filter((i) => i.id !== id) });
    if (this.state.builder.componentId === id) this.openComponent('bt-darts');
    this.notify('Componente eliminata dalla libreria.');
  }

  importComponentText(text: string): boolean {
    const r = parseComponentText(text);
    if (!r.ok) {
      this.patchBuilder({ messages: { ok: false, messages: ['Import rifiutato: nessuna modifica applicata.', ...r.errors] } });
      return false;
    }
    const taken = this.userComponents.has(r.doc.id) || componentTemplate(r.doc.id) !== undefined;
    const doc: ComponentDocument = { ...r.doc, id: taken ? componentId() : r.doc.id, meta: { ...r.doc.meta, createdAt: r.doc.meta.createdAt ?? now(), updatedAt: now() } };
    const messages = [...(r.migratedFrom ? [`Migrato da ${r.migratedFrom}.`] : []), ...r.warnings, ...(taken ? [`id «${r.doc.id}» già in uso: salvata come «${doc.id}».`] : [])];
    void this.addUserComponent(doc, `Importata «${doc.name}».`).then(() => this.patchBuilder({ messages: { ok: true, messages } }));
    return true;
  }

  componentJson(): string {
    return serializeComponent(this.state.builder.doc);
  }

  private async addUserComponent(doc: ComponentDocument, message: string) {
    const rec: StoredComponent = { id: doc.id, doc, createdAt: now(), updatedAt: now() };
    this.userComponents.set(doc.id, rec);
    this.store.set({ components: [...this.state.components, componentItem(rec)], builder: { ...builderState(doc, doc.id, 'user', false), selection: this.state.builder.selection, pick: this.state.builder.pick } });
    if (this.state.workspace === 'builder') this.controller?.updateComponent(doc);
    this.syncSelection();
    await this.autosaver.flush();
    const s = this.state.save;
    this.notify(s.kind === 'error' ? `${message} ${s.message}` : message);
  }

  // ---------- export (adapters) ----------

  setExportOpen(open: boolean): void {
    this.store.set({ exportOpen: open });
  }

  /** What is open: the builder exports its component (and the component's material). */
  exportRequest(): ExportRequest {
    const s = this.state;
    const builder = s.workspace === 'builder';
    return {
      material: builder ? s.builder.doc.material.document : s.doc,
      ...(builder ? { component: s.builder.doc } : {}),
      resolveAsset: (url) => this.assetBytes(url),
    };
  }

  async exportWith(adapterId: string): Promise<{ ok: boolean; messages: string[] }> {
    const adapter = exportAdapter(adapterId);
    if (!adapter) return { ok: false, messages: [`Formato sconosciuto: ${adapterId}`] };
    try {
      const req = this.exportRequest();
      if (adapter.needsRuntime) req.runtime = await fetchRuntime();
      const result = await adapter.build(req);
      if (adapter.output === 'file') {
        const f = result.files[0]!;
        this.download(f.path, f.data as Uint8Array<ArrayBuffer>, 'application/json');
      } else this.download(`${result.root}.zip`, packageZip(result) as Uint8Array<ArrayBuffer>, 'application/zip');
      const messages = [`${adapter.label}: ${result.files.length} file.`, ...result.warnings];
      this.store.set({ importMessages: { ok: true, messages } });
      return { ok: true, messages };
    } catch (e) {
      const messages = [(e as Error).message];
      this.store.set({ importMessages: { ok: false, messages } });
      return { ok: false, messages };
    }
  }

}

/** Built runtime served next to the lab (vite plugin, see vite.config.ts). */
async function fetchRuntime(): Promise<RuntimeBundle> {
  const base = new URL('runtime/', new URL(import.meta.env.BASE_URL, location.href));
  const r = await fetch(new URL('manifest.json', base));
  if (!r.ok) throw new Error('Runtime costruito non trovato: esegui npm run build:lib (in sviluppo) e ricarica.');
  const m = (await r.json()) as { version: string; files: string[] };
  const files = await Promise.all(
    m.files.map(async (path) => {
      const f = await fetch(new URL(path, base));
      if (!f.ok) throw new Error(`Runtime: ${path} non scaricabile (HTTP ${f.status})`);
      return { path, data: new Uint8Array(await f.arrayBuffer()) };
    }),
  );
  return { version: m.version, files };
}
