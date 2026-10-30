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
  applyControl,
  builtinMaterial,
  MATERIALS,
  type ControlTarget,
  type MaterialDocument,
  glassParams,
  parseMaterialText,
  serializeMaterial,
  toLegacyV1,
  withGlassParams,
  type BackendRequest,
  type GlassDocument,
  type QualitySettings,
} from '../model';
import { defaultParams, type GlassParams, type ParamKey } from '../core/params';
import { buildPackage, packageZip, type PackageKind, type RuntimeBundle } from '../export/package';
import { exportAdapter, type ExportRequest } from '../export/adapters';
import {
  addButtonBreakpoint,
  applyNavbarView,
  bindComponentMaterial,
  bindingState,
  bindMaterial,
  COMPONENT_TEMPLATES,
  hasMaterialOverrides,
  componentTemplate,
  COMPONENTS,
  navbarView,
  removeButtonBreakpoint,
  resolveDefinitionMaterial,
  serializeDefinition,
  setButtonDisabled,
  setButtonIcon,
  setButtonLink,
  setButtonText,
  setButtonValue,
  setRootField,
  switchMaterialFamily,
  updateButtonBreakpoint,
  type ButtonOverridePath,
  type ButtonSemantics,
  type ComponentDefinition,
} from '../components';
import { importComponentText, legacyPreset, legacyTemplate } from '../migration';
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
} from '../components';
import { iconFromSvg, SVG_MAX_BYTES, type IconRef } from '../components/icons';
import type { BottomNavigation } from '../runtime/bottom-navigation';
import type { PreviewState } from '../runtime/component-types';
import { ComponentOverlay } from '../stage/component-overlay';
import { PreviewController, type PreviewRequest } from '../stage/controller';
import { PHOTO } from '../stage/scenes';
import { isNav, type ViewOptions } from '../stage/view';
import { optionsFromQuery, queryFromOptions } from './state';
import { Autosaver, type SaveState } from './storage/autosave';
import { openRepository, type Repository, type StoredAsset, type StoredComponent, type StoredMaterial } from './storage/repository';
import { bindStore, Store, type BuilderState, type ComponentItem, type LabState, type LibraryItem, type Page, type Workspace } from './store';
import { sha256, SyncSender } from './sync-sender';
import { newToken } from '../sync/protocol';
import { createProject } from '../project/document';
import { kitAssets } from '../project/defaults';
import type { ProjectDoc } from '../project/types';
import { ProjectActions, projectDocId } from './projects';

const now = () => new Date().toISOString();
const PAGES: readonly Page[] = ['home', 'lab', 'assets', 'settings'];

function userId(): string {
  return `user-${newToken().slice(0, 10).toLowerCase()}`;
}

function builtinItems(): LibraryItem[] {
  return MATERIALS.list().flatMap((d) => d.presets).map((b) => ({
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

/** The states of a component without the overrides of its material (their own style stays). */
function withoutMaterialOverrides(states: ComponentDefinition['states']): ComponentDefinition['states'] {
  const out: ComponentDefinition['states'] = {};
  for (const [k, v] of Object.entries(states) as [keyof ComponentDefinition['states'], NonNullable<ComponentDefinition['states'][keyof ComponentDefinition['states']]>][]) {
    if (v.style) out[k] = { style: v.style };
  }
  return out;
}

const isNavbar = (doc: ComponentDefinition) => doc.type === 'mobile-navbar';
/** Tabs of a navbar; any other component has none. */
const tabsOf = (doc: ComponentDefinition) => (isNavbar(doc) ? navbarView(doc).children : []);

function builderState(doc: ComponentDefinition, componentId: string, origin: BuilderState['origin'], modified: boolean): BuilderState {
  return { doc, componentId, origin, modified, selection: 'root', previewTab: isNavbar(doc) ? navbarView(doc).defaultTab : '', previewState: null, pick: false, messages: null };
}

const PATH_OF_BACKEND: Record<BackendRequest, ViewOptions['path'] | null> = { auto: 'auto', svg: 'refraction', css: 'satin', webgl2: null };
const BACKEND_OF_PATH: Record<ViewOptions['path'], BackendRequest | null> = { auto: 'auto', refraction: 'svg', satin: 'css', opaque: null };

export class LabSession {
  readonly store: Store;
  controller: PreviewController | null = null;
  /** @internal shared with ProjectActions */
  readonly repo: Repository;
  private readonly autosaver: Autosaver;
  private readonly sync: SyncSender;
  /** @internal every stored record, of all projects; the store holds the active project's. */
  userMaterials = new Map<string, StoredMaterial>();
  /** @internal */
  userComponents = new Map<string, StoredComponent>();
  readonly projects: ProjectActions;
  private overlay: ComponentOverlay | null = null;
  private discarded: Pick<LabState, 'doc' | 'materialId' | 'origin' | 'modified'> | null = null;
  private image: { hash: string; blob: Blob; url: string } | null = null;
  private urlTimer = 0;
  private centreOnShow = false;
  private noticeTimer = 0;
  private readonly readyListeners: (() => void)[] = [];

  private constructor(repo: Repository, state: LabState) {
    this.repo = repo;
    this.store = new Store(state);
    bindStore(this.store);
    this.projects = new ProjectActions(this);
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
    const query = new URLSearchParams(location.search);
    const saved = await repo.getProject().catch(() => null);
    // A reload of the Studio's own address restores its working drafts. Explicit
    // links to other scenarios still use their URL options, not the last view.
    const sameWorkingCopy = saved && query.get('project') === saved.projectId && query.get('material') === saved.materialId &&
      (!query.has('component') || query.get('component') === saved.componentId);
    const project = !boot.explicit || sameWorkingCopy ? saved : null;
    const ws = query.get('workspace');
    const workspace: Workspace = ws === 'builder' || ws === 'material' ? ws : (project?.workspace ?? 'material');
    const pdocs = await repo.listProjectDocs().catch(() => ({ items: [] as ProjectDoc[], skipped: ['lettura dei progetti non riuscita'] }));
    const projects = [...pdocs.items];
    // Records written before projects existed belong to the first project (made now if there is none and something to adopt).
    const hasOrphans = lib.items.some((m) => !m.projectId) || comps.items.some((c) => !c.projectId);
    const hasQuery = [...query.keys()].length > 0;
    if (!projects.length && (hasOrphans || hasQuery)) {
      const first = createProject({ id: projectDocId(), name: 'Il mio progetto', assets: kitAssets() });
      await repo.putProjectDoc(first).catch(() => undefined);
      projects.push(first);
    }
    const wantedProject = /^[A-Za-z0-9._-]{1,64}$/.test(query.get('project') ?? '') ? query.get('project') : (project?.projectId ?? null);
    const projectId = projects.find((p) => p.id === wantedProject)?.id ?? projects[0]?.id ?? null;
    const adopt = <T extends { projectId?: string }>(r: T): T => (r.projectId || !projects[0] ? r : { ...r, projectId: projects[0].id });
    const allMaterials = lib.items.map((m) => adopt(m));
    const allComponents = comps.items.map((c) => adopt(c));
    await Promise.all([
      ...allMaterials.filter((m, i) => m.projectId !== lib.items[i]!.projectId).map((m) => repo.putMaterial(m).catch(() => undefined)),
      ...allComponents.filter((c, i) => c.projectId !== comps.items[i]!.projectId).map((c) => repo.putComponent(c).catch(() => undefined)),
    ]);
    const scopedMaterials = allMaterials.filter((m) => m.projectId === projectId);
    const scopedComponents = allComponents.filter((c) => c.projectId === projectId);
    const userComps = new Map(scopedComponents.map((c) => [c.id, c]));
    const notes: string[] = [];
    const wantedComponent = query.get('component') ?? project?.componentId ?? 'mobile-navbar';
    let builder: BuilderState;
    if (userComps.has(wantedComponent)) builder = builderState(userComps.get(wantedComponent)!.doc, wantedComponent, 'user', false);
    else {
      // A template that is no longer official opens as the generic one; an unsaved draft of it is kept.
      const legacyT = legacyTemplate(wantedComponent);
      const t = componentTemplate(legacyT?.replacement ?? wantedComponent) ?? componentTemplate('mobile-navbar')!;
      const draft = project?.componentDraft && project.componentId === wantedComponent ? project.componentDraft : null;
      builder = builderState(draft ? { ...draft, id: t.id } : t.create(), t.id, 'template', draft !== null);
      if (legacyT?.reason === 'removed') {
        notes.push(
          draft
            ? `Il template «${wantedComponent}» non è più incluso: la tua bozza resta aperta, salvala nella libreria per tenerla.`
            : `Il template «${wantedComponent}» non è più incluso: aperto «${t.label}».`,
        );
      }
    }

    let doc: MaterialDocument = builtinMaterial(boot.preset)!.doc;
    let materialId = boot.preset;
    let origin: 'builtin' | 'user' = 'builtin';
    let modified = false;
    let options = boot.options;
    const user = new Map(scopedMaterials.map((m) => [m.id, m]));
    const rawPreset = query.get('preset');
    const wanted = boot.material ?? project?.materialId ?? (legacyPreset(rawPreset) ? rawPreset : null);
    const legacy = wanted && !user.has(wanted) ? legacyPreset(wanted) : undefined;
    if (wanted && user.has(wanted)) {
      doc = user.get(wanted)!.doc;
      materialId = wanted;
      origin = 'user';
    } else if (legacy) {
      // A preset that is no longer official: its parameters (or the user's draft of it) open as an
      // unsaved draft of the replacement. Nothing is written until the user saves a copy.
      const base = builtinMaterial(legacy.replacement)!.doc;
      const draft = project?.draft && project.materialId === wanted ? project.draft : null;
      doc = draft ? { ...draft, id: base.id, name: legacy.name } : withGlassParams({ ...base, name: legacy.name }, legacy.params);
      materialId = base.id;
      modified = true;
      notes.push(`«${wanted}» non è più un preset incluso: i suoi parametri sono aperti come bozza di «${base.name}». Usa «Salva come copia» per tenerli.`);
    } else if (wanted && MATERIALS.preset(wanted)) {
      doc = MATERIALS.preset(wanted)!.doc;
      materialId = wanted;
    }
    if (project) {
      if (!boot.explicit) options = { ...options, ...project.options };
      if (!legacy && project.draft && project.materialId === materialId) {
        doc = project.draft;
        modified = origin === 'builtin';
      }
    }
    // Tabs of the demo navbar changed: an id that no longer exists goes back to the first one.
    if (!isNav(options.nav)) options = { ...options, nav: 'home' };
    if (boot.quality && doc.family === 'glass') doc = { ...doc, quality: { ...doc.quality, profile: boot.quality } };
    // A document that targets a DOM backend sets the path unless the URL chose one.
    if (doc.family === 'glass' && !new URLSearchParams(location.search).has('path')) {
      const path = PATH_OF_BACKEND[doc.target.backend];
      if (path) options = { ...options, path };
    }

    const session = new LabSession(repo, {
      doc,
      materialId,
      origin,
      modified,
      options,
      library: [...builtinItems(), ...scopedMaterials.map(userItem)],
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
      components: [...templateItems(), ...scopedComponents.map(componentItem)],
      componentsSkipped: comps.skipped,
      exportOpen: false,
      page: !projectId ? 'home' : (PAGES.find((x) => x === query.get('page')) ?? (hasQuery ? 'lab' : (project?.page ?? 'home'))),
      projects,
      projectId,
      projectsSkipped: pdocs.skipped,
      assetTab: 'colors',
      flow: null,
      importSeed: null,
      libraryTab: origin === 'user' ? 'mine' : 'jello',
      panelTab: 'params',
      confirm: null,
    });
    session.centreOnShow = session.state.page !== 'lab';
    session.userMaterials = new Map(allMaterials.map((m) => [m.id, m]));
    session.userComponents = new Map(allComponents.map((c) => [c.id, c]));
    if (notes.length) session.notify(notes.join(' '), false, 12000);
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
    this.syncBuilderMaterial();
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

  setMaterialControl(target: ControlTarget, value: unknown): boolean {
    const doc = this.state.doc;
    const result = applyControl(MATERIALS.get(doc.family)!, doc, target, value);
    if (!result.ok) {
      this.store.set({ importMessages: { ok: false, messages: [result.error] } });
      return false;
    }
    this.applyDoc(result.doc);
    return true;
  }

  setParam<K extends ParamKey>(key: K, value: GlassParams[K]): void {
    if (this.state.doc.family !== 'glass') return;
    const p = glassParams(this.state.doc);
    if (p[key] === value) return;
    this.applyDoc(withGlassParams(this.state.doc, { ...p, [key]: value }));
  }

  setParams(patch: Partial<GlassParams>): void {
    if (this.state.doc.family !== 'glass') return;
    this.applyDoc(withGlassParams(this.state.doc, { ...glassParams(this.state.doc), ...patch }));
  }

  resetParams(): void {
    const doc = this.state.doc;
    if (doc.family === 'glass') {
      this.applyDoc(withGlassParams(doc, defaultParams()));
      return;
    }
    const fresh = MATERIALS.get(doc.family)!.create(doc.id, doc.name);
    this.applyDoc({ ...fresh, meta: doc.meta });
  }

  setQuality(patch: Partial<QualitySettings>): void {
    if (this.state.doc.family !== 'glass') return;
    this.applyDoc({ ...this.state.doc, quality: { ...this.state.doc.quality, ...patch } });
  }

  /** Requested backend. WebGL2 materials describe a texture source; DOM backends a DOM source. */
  setBackend(backend: BackendRequest): void {
    const doc = this.state.doc;
    if (doc.family !== 'glass') return;
    const source: GlassDocument['source'] =
      backend === 'webgl2' ? { kind: 'texture', texture: this.textureSpec() } : { kind: 'dom' };
    this.applyDoc({ ...doc, target: { ...doc.target, backend }, source });
    const path = PATH_OF_BACKEND[backend];
    if (path) this.setOption('path', path, false);
    else if (this.state.options.mode !== 'scene') this.setOption('mode', 'scene');
  }

  setFallback(fallback: 'css' | 'opaque'): void {
    if (this.state.doc.family !== 'glass') return;
    this.applyDoc({ ...this.state.doc, target: { ...this.state.doc.target, fallback } });
  }

  setNotes(notes: string): void {
    this.applyDoc({ ...this.state.doc, meta: { ...this.state.doc.meta, notes } });
  }

  private textureSpec(): Extract<GlassDocument['source'], { kind: 'texture' }>['texture'] {
    const o = this.state.options;
    if (o.texture === 'image') return { kind: 'image', url: this.image ? `asset:${this.image.hash}` : 'example:tulips' };
    return { kind: 'pattern', pattern: 'grid', animated: o.animate };
  }

  private applyDoc(doc: MaterialDocument, opts: { dirty?: boolean } = {}) {
    if (doc.family === 'solid' && this.state.workspace === 'material') {
      if (this.state.options.mode !== 'components') this.setOption('mode', 'components', false);
      if (!['button', 'navbar'].includes(this.state.options.object)) this.setOption('object', 'button', false);
    }
    // In the builder the preview shows the component's material; the Material Lab's waits.
    const report = this.state.workspace === 'material' ? this.controller?.setMaterial(doc) : undefined;
    const modified = opts.dirty === false ? false : this.state.origin === 'builtin' ? true : this.state.modified;
    this.store.set({ doc, modified, library: this.syncLibrary(doc) });
    if (this.state.origin === 'user') this.followPreset(this.state.materialId);
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
    if (syncDoc && key === 'path' && this.state.doc.family === 'glass') {
      const backend = BACKEND_OF_PATH[value as ViewOptions['path']];
      // "opaque" inspects the fallback; it is not a property of the material.
      if (backend && backend !== this.state.doc.target.backend && this.state.doc.target.backend !== 'webgl2') {
        this.applyDoc({ ...this.state.doc, target: { ...this.state.doc.target, backend }, source: { kind: 'dom' } });
      }
    }
    if ((key === 'texture' || key === 'animate') && this.state.doc.family === 'glass' && this.state.doc.source.kind === 'texture') {
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
    this.store.set({ materialId: id, origin: item.origin, modified: false, ...(s.libraryTab === 'favorites' ? {} : { libraryTab: item.origin === 'user' ? 'mine' : 'jello' }) });
    this.loadDocIntoView(item.doc);
  }

  private loadDocIntoView(doc: MaterialDocument) {
    this.applyDoc(doc, { dirty: false });
    if (doc.family !== 'glass') return;
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

  async newMaterial(family = this.state.doc.family): Promise<void> {
    const n = this.state.library.filter((i) => i.origin === 'user').length + 1;
    const doc = MATERIALS.get(family)!.create(userId(), `Nuovo ${family} ${n}`);
    doc.meta = { ...doc.meta, createdAt: now(), updatedAt: now() };
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

  /** @internal Something outside the material/component documents changed: schedule a save. */
  touch(): void {
    this.autosaver.schedule();
  }

  rename(name: string): void {
    const clean = name.trim().slice(0, 80);
    if (!clean || this.state.origin !== 'user') return;
    this.applyDoc({ ...this.state.doc, name: clean });
  }

  async deleteMaterial(id: string): Promise<void> {
    if (MATERIALS.preset(id)) return;
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
    const rec: StoredMaterial = { id: doc.id, doc, ...this.owner(), createdAt: now(), updatedAt: now() };
    this.userMaterials.set(doc.id, rec);
    this.store.set({ library: [...this.state.library, userItem(rec)], materialId: doc.id, origin: 'user', modified: false, libraryTab: 'mine' });
    this.applyDoc(doc, { dirty: false });
    await this.autosaver.flush();
    const s = this.state.save;
    this.notify(s.kind === 'error' ? `${message} ${s.message}` : message);
  }

  /** `projectId` of a record: its own, else the active project's. */
  owner(prev?: { projectId?: string }): { projectId?: string } {
    const id = prev?.projectId ?? this.state.projectId;
    return id ? { projectId: id } : {};
  }

  /** The only place that writes: project + the personal material being edited. */
  private async write() {
    const s = this.state;
    if (s.origin === 'user') {
      const prev = this.userMaterials.get(s.materialId);
      const rec: StoredMaterial = {
        id: s.materialId,
        doc: { ...s.doc, meta: { ...s.doc.meta, updatedAt: now() } },
        ...this.owner(prev),
        createdAt: prev?.createdAt ?? now(),
        updatedAt: now(),
      };
      await this.repo.putMaterial(rec);
      this.userMaterials.set(rec.id, rec);
    }
    if (s.origin === 'user') await this.propagatePreset(s.materialId);
    const b = this.state.builder;
    if (b.origin === 'user') {
      const prev = this.userComponents.get(b.componentId);
      // The document is stored exactly as edited: reopening it gives the same JSON.
      const rec: StoredComponent = {
        id: b.componentId,
        doc: b.doc,
        ...this.owner(prev),
        createdAt: prev?.createdAt ?? now(),
        updatedAt: now(),
      };
      await this.repo.putComponent(rec);
      this.userComponents.set(rec.id, rec);
    }
    await this.projects.flush();
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
      projectId: s.projectId,
      page: s.page,
    });
    clearTimeout(this.urlTimer);
    history.replaceState(null, '', this.scenarioUrl());
  }

  // ---------- import / export ----------

  importText(text: string): void {
    const r = parseMaterialText(text);
    if (!r.ok) {
      this.store.set({ importMessages: { ok: false, messages: r.errors } });
      return;
    }
    // Atomic: from here on the document is complete and valid.
    const taken = !!MATERIALS.preset(r.doc.id) || this.userMaterials.has(r.doc.id);
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
    if (this.state.doc.family !== 'glass') return { text: '', dropped: ['Solid non è rappresentabile in jello-glass v1'] };
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
    if (this.state.doc.family === 'solid') return this.exportWith('material-runtime');
    const material = this.state.doc;
    try {
      const runtime = kind === 'runtime' ? await fetchRuntime() : undefined;
      const result = await buildPackage({
        material,
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
    if (this.state.doc.family === 'glass' && this.state.doc.source.kind === 'texture') this.applyDoc({ ...this.state.doc, source: { kind: 'texture', texture: this.textureSpec() } });
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

  notify(text: string, undo = false, ms = undo ? 8000 : 4000, action?: { label: string; run: () => void }): void {
    this.store.set({ notice: { text, undo, ...(action ? { action } : {}) } });
    clearTimeout(this.noticeTimer);
    this.noticeTimer = window.setTimeout(() => this.store.set({ notice: null }), ms);
  }

  get saveState(): SaveState {
    return this.autosaver.status;
  }

  scenarioUrl(): string {
    const s = this.state;
    const q = queryFromOptions(s.options, s.materialId, s.doc.family === 'glass' ? s.doc.quality.profile : 'balanced');
    if (s.workspace === 'builder') {
      q.set('workspace', 'builder');
      q.set('component', s.builder.componentId);
    }
    if (s.projectId) q.set('project', s.projectId);
    if (s.page !== 'lab') q.set('page', s.page);
    return `${location.origin}${location.pathname}?${q}`;
  }

  private scheduleUrl() {
    clearTimeout(this.urlTimer);
    this.urlTimer = window.setTimeout(() => {
      history.replaceState(null, '', this.scenarioUrl());
    }, 400);
  }
  // ---------- pages and projects ----------

  /** Home, Asset or Impostazioni; `lab` shows the preview workspace chosen by `ws`. */
  setPage(page: Page, ws?: Workspace): void {
    if (ws) this.setWorkspace(ws);
    if (page === this.state.page && !this.state.flow) return;
    this.store.set({ page, flow: null });
    // The preview was laid out while hidden (first load on another page): centre once it has a size.
    if (page === 'lab' && this.centreOnShow) {
      this.centreOnShow = false;
      requestAnimationFrame(() => requestAnimationFrame(() => this.controller?.centreCapsule()));
    }
    this.autosaver.schedule();
    this.scheduleUrl();
  }

  setAssetTab(tab: LabState['assetTab']): void {
    this.store.set({ assetTab: tab, page: 'assets', flow: null });
    this.scheduleUrl();
  }

  setLibraryTab(tab: LabState['libraryTab']): void {
    this.store.set({ libraryTab: tab });
  }

  setPanelTab(tab: LabState['panelTab']): void {
    this.store.set({ panelTab: tab });
  }

  openConfirm(confirm: LabState['confirm']): void {
    this.store.set({ confirm });
  }

  openFlow(flow: LabState['flow'], seed: File[] | null = null): void {
    this.store.set({ flow, importSeed: seed });
  }

  /** The active project's materials and components, in the library lists. */
  rescope(): void {
    const id = this.state.projectId;
    const mats = [...this.userMaterials.values()].filter((m) => m.projectId === id);
    const comps = [...this.userComponents.values()].filter((c) => c.projectId === id);
    this.store.set({ library: [...builtinItems(), ...mats.map(userItem)], components: [...templateItems(), ...comps.map(componentItem)] });
  }

  /** Switches the active project; what is open from another project falls back to the built-ins. */
  switchProject(id: string): void {
    if (id === this.state.projectId || !this.state.projects.some((p) => p.id === id)) return;
    this.store.set({ projectId: id });
    this.rescope();
    const s = this.state;
    if (s.origin === 'user' && !s.library.some((i) => i.id === s.materialId)) {
      this.store.set({ materialId: 'jello', origin: 'builtin', modified: false });
      this.loadDocIntoView(builtinMaterial('jello')!.doc);
    }
    const b = s.builder;
    if (b.origin === 'user' && !s.components.some((i) => i.id === b.componentId)) this.openComponent('mobile-navbar');
    this.autosaver.schedule();
    this.scheduleUrl();
  }

  // ---------- workspace ----------

  setWorkspace(ws: Workspace): void {
    if (ws === this.state.workspace) return;
    this.store.set({ workspace: ws });
    if (ws === 'builder') {
      this.syncBuilderMaterial();
      this.showBuilderPreview();
    } else this.hideBuilderPreview();
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

  /** The preview shows `doc`: updated in place, or mounted again when it is another type of component. */
  private syncPreview(doc: ComponentDefinition) {
    const shown = this.controller?.component;
    if (shown && shown.type !== doc.type) this.showBuilderPreview();
    else this.controller?.updateComponent(doc);
  }

  private hideBuilderPreview() {
    this.overlay?.destroy();
    this.overlay = null;
    this.controller?.hideComponent(this.state.doc);
  }

  /** Brings the open component up to date with a preset that changed while it was closed. */
  private syncBuilderMaterial() {
    const id = this.state.builder.doc.material.preset;
    if (id) this.followPreset(id);
  }

  private patchBuilder(patch: Partial<BuilderState>) {
    this.store.set({ builder: { ...this.state.builder, ...patch } });
  }

  /** The only path a component edit takes: preview first, then the store, then autosave. */
  private applyComponent(doc: ComponentDefinition, opts: { dirty?: boolean } = {}) {
    const b = this.state.builder;
    const modified = opts.dirty === false ? false : b.origin === 'template' ? true : b.modified;
    if (this.state.workspace === 'builder') this.syncPreview(doc);
    const previewTab = tabsOf(doc).some((t) => t.id === b.previewTab) ? b.previewTab : isNavbar(doc) ? navbarView(doc).defaultTab : '';
    const selection = b.selection === 'root' || b.selection === 'material' || tabsOf(doc).some((t) => t.id === b.selection) ? b.selection : 'root';
    const components = b.origin === 'user' ? this.state.components.map((i) => (i.id === b.componentId ? { ...i, name: doc.name, doc } : i)) : this.state.components;
    this.store.set({ builder: { ...b, doc, modified, previewTab, selection }, components });
    this.syncSelection();
    this.autosaver.schedule();
    this.scheduleUrl();
  }

  /** The definition with an edited view written back (structure, content, layout, style, states, interactions). */
  private withRoot(root: BnRoot): ComponentDefinition {
    return applyNavbarView(this.state.builder.doc, root);
  }

  // ---------- selection and preview simulation ----------

  selectElement(id: string): void {
    const doc = this.state.builder.doc;
    if (id !== 'root' && id !== 'material' && !tabsOf(doc).some((t) => t.id === id)) return;
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
    if (!tabsOf(this.state.builder.doc).some((t) => t.id === id)) return;
    this.patchBuilder({ previewTab: id });
    this.navbarInstance()?.setActiveTab(id);
  }

  /** The mounted navbar, when the open component is one. */
  private navbarInstance(): BottomNavigation | null {
    const c = this.controller?.component;
    return c?.type === 'mobile-navbar' ? (c as BottomNavigation) : null;
  }

  private syncSelection() {
    const b = this.state.builder;
    const id = b.selection === 'material' ? 'root' : b.selection;
    const tab = tabsOf(b.doc).find((t) => t.id === id);
    this.overlay?.setSelected(id, tab ? tab.label : b.doc.name);
    this.overlay?.refresh();
    // A navbar shows a state on the selected tab; a button, which has no parts, on itself.
    const target = tab ? tab.id : !isNavbar(b.doc) && b.selection === 'root' ? 'root' : null;
    this.controller?.component?.previewState(target, target ? b.previewState : null);
  }

  // ---------- structure ----------

  setComponentName(name: string): void {
    const clean = name.trim().slice(0, 80);
    if (clean) this.applyComponent({ ...this.state.builder.doc, name: clean });
  }

  /**
   * A described property. A navbar takes the path of its view (`layout.height`, `states.focus.color`…);
   * any other component the canonical path of the definition (`layout.size`, `states.hover.style.background`…).
   * Invalid values are refused.
   */
  setComponentField(path: string, value: unknown): boolean {
    const doc = this.state.builder.doc;
    if (isNavbar(doc)) {
      const root = setRootField(navbarView(doc), path, value);
      if (!root) return false;
      this.applyComponent(this.withRoot(root));
      return true;
    }
    const next = COMPONENTS.get(doc.type)?.setField(doc, path, value) ?? null;
    if (!next) return false;
    this.applyComponent(next);
    return true;
  }

  // ---------- button ----------

  /** Edits the open button with a pure operation of src/components/button.ts; a refused edit changes nothing. */
  private editButton(edit: (doc: ComponentDefinition) => ComponentDefinition | null): boolean {
    const doc = this.state.builder.doc;
    if (doc.type !== 'button') return false;
    const next = edit(doc);
    if (!next) return false;
    this.applyComponent(next);
    return true;
  }

  setButtonText(text: string): boolean {
    return this.editButton((d) => setButtonText(d, text));
  }

  setButtonIcon(icon: IconRef | null): boolean {
    return this.editButton((d) => setButtonIcon(d, icon));
  }

  /** Custom SVG icon for the button: sanitized (allowlist), refused with every reason otherwise. */
  async uploadButtonIcon(file: File): Promise<boolean> {
    if (file.size > SVG_MAX_BYTES) {
      this.patchBuilder({ messages: { ok: false, messages: [`«${file.name}»: SVG troppo grande (massimo ${SVG_MAX_BYTES / 1024} KB).`] } });
      return false;
    }
    const r = iconFromSvg(await file.text(), file.name);
    if (!r.ok) {
      this.patchBuilder({ messages: { ok: false, messages: [`«${file.name}» rifiutato:`, ...r.errors] } });
      return false;
    }
    this.setButtonIcon(r.icon);
    this.patchBuilder({ messages: { ok: true, messages: [`Icona «${r.icon.name}» applicata (${r.icon.paint === 'fill' ? 'riempimento' : 'tratto'}).`, ...r.warnings] } });
    return true;
  }

  /** `link` needs an address; without a valid one the change is refused with the reason. */
  setButtonSemantics(semantics: ButtonSemantics, href?: string | null): boolean {
    const ok = this.editButton((d) => setButtonLink(d, semantics, href));
    if (!ok && semantics === 'link') this.notify('Un collegamento ha bisogno di un indirizzo: un percorso (/…), un’ancora (#…) o un URL http(s).');
    return ok;
  }

  setButtonDisabled(disabled: boolean): boolean {
    return this.editButton((d) => setButtonDisabled(d, disabled));
  }

  setButtonValue(value: string | null): boolean {
    return this.editButton((d) => setButtonValue(d, value));
  }

  addButtonBreakpoint(maxWidth = 360): void {
    this.editButton((d) => addButtonBreakpoint(d, maxWidth).def);
  }

  updateButtonBreakpoint(id: string, patch: { maxWidth?: number; set?: [ButtonOverridePath, number | string | null] }): void {
    this.editButton((d) => updateButtonBreakpoint(d, id, patch));
  }

  removeButtonBreakpoint(id: string): void {
    this.editButton((d) => removeButtonBreakpoint(d, id));
  }

  setComponentRoot(patch: Partial<Pick<BnRoot, 'label' | 'semantics' | 'defaultTab'>>): void {
    if (!isNavbar(this.state.builder.doc)) return;
    const root = navbarView(this.state.builder.doc);
    if (patch.defaultTab !== undefined && !root.children.some((t) => t.id === patch.defaultTab)) return;
    if (patch.label !== undefined && !patch.label.trim()) return;
    this.applyComponent(this.withRoot({ ...root, ...patch }));
  }

  addTab(): string {
    if (!isNavbar(this.state.builder.doc)) return '';
    const b = this.state.builder;
    const after = navbarView(b.doc).children.some((t) => t.id === b.selection) ? b.selection : undefined;
    const r = addTab(navbarView(b.doc), after ? { after } : {});
    this.applyComponent(this.withRoot(r.root));
    this.selectElement(r.id);
    return r.id;
  }

  removeTab(id: string): void {
    if (!isNavbar(this.state.builder.doc)) return;
    const root = navbarView(this.state.builder.doc);
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
    if (!isNavbar(this.state.builder.doc)) return;
    const r = duplicateTab(navbarView(this.state.builder.doc), id);
    this.applyComponent(this.withRoot(r.root));
    this.selectElement(r.id);
  }

  /** delta -1: one place towards the start; +1: towards the end. */
  moveTab(id: string, delta: number): void {
    if (!isNavbar(this.state.builder.doc)) return;
    const root = navbarView(this.state.builder.doc);
    const i = root.children.findIndex((t) => t.id === id);
    if (i < 0) return;
    this.applyComponent(this.withRoot(moveTab(root, id, i + delta)));
  }

  updateTab(id: string, patch: Partial<Pick<BnTab, 'label' | 'icon' | 'value' | 'disabled'>>): void {
    if (!isNavbar(this.state.builder.doc)) return;
    if (patch.label !== undefined && (!patch.label.trim() || patch.label.length > 40)) return;
    this.applyComponent(this.withRoot(updateTab(navbarView(this.state.builder.doc), id, patch)));
  }

  setTabStyle(id: string, key: keyof BnTabStyle, value: number | null): void {
    if (!isNavbar(this.state.builder.doc)) return;
    this.applyComponent(this.withRoot(updateTab(navbarView(this.state.builder.doc), id, { style: { [key]: value } as Partial<BnTabStyle> as BnTabStyle })));
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
    if (!isNavbar(this.state.builder.doc)) return;
    this.applyComponent(this.withRoot(addBreakpoint(navbarView(this.state.builder.doc), maxWidth).root));
  }

  updateBreakpoint(id: string, patch: { maxWidth?: number; set?: [BnOverrideKey, number | string | null] }): void {
    if (!isNavbar(this.state.builder.doc)) return;
    this.applyComponent(this.withRoot(updateBreakpoint(navbarView(this.state.builder.doc), id, patch)));
  }

  removeBreakpoint(id: string): void {
    if (!isNavbar(this.state.builder.doc)) return;
    this.applyComponent(this.withRoot(removeBreakpoint(navbarView(this.state.builder.doc), id)));
  }

  // ---------- the component's material ----------

  /**
   * One control of the component's material, Glass or Solid alike (`inspectorModel` lists them, `applyControl`
   * validates one). The value is stored as an override of the component (`material.params`, or
   * `states.<state>.material` for a state), over the material it is linked to: the preset and the variant's
   * accent stay what they are, and «Ripristina» takes the overrides away. An invalid value is refused and reported.
   */
  setComponentControl(target: ControlTarget, value: unknown): boolean {
    const doc = this.state.builder.doc;
    if (target.state && (!COMPONENTS.get(doc.type)?.states.includes(target.state) ||
      (doc.type === 'mobile-navbar' && ['pressed', 'active', 'disabled'].includes(target.state)))) {
      this.notify(`Lo stato materiale «${target.state}» non è applicabile alla superficie di ${doc.type}. Usa gli stati della componente o modifica il preset nel Material Lab.`);
      return false;
    }
    const def = MATERIALS.get(doc.material.family);
    if (!def) return false;
    const r = applyControl(def, resolveDefinitionMaterial(doc), target, value);
    if (!r.ok) {
      this.notify(r.error);
      return false;
    }
    // Read back what was accepted (colors are normalised), and store only that.
    const read = def.read(r.doc);
    const stored = target.state ? read.states[target.state]?.[target.key] : read.params[target.key];
    if (stored === undefined) return false;
    if (target.state) {
      const entry = doc.states[target.state] ?? {};
      if (entry.material?.[target.key] === stored) return true;
      this.applyComponent({ ...doc, states: { ...doc.states, [target.state]: { ...entry, material: { ...entry.material, [target.key]: stored } } } });
    } else {
      if (doc.material.params[target.key] === stored) return true;
      this.applyComponent({ ...doc, material: { ...doc.material, params: { ...doc.material.params, [target.key]: stored } } });
    }
    return true;
  }

  setComponentParam<K extends ParamKey>(key: K, value: GlassParams[K]): void {
    this.setComponentControl({ key }, value);
  }

  /** A library entry (personal or built-in Glass) or a built-in preset of any other family. */
  private materialPreset(id: string): { doc: MaterialDocument; name: string } | undefined {
    const item = this.state.library.find((i) => i.id === id);
    if (item) return { doc: item.doc, name: item.name };
    const b = MATERIALS.preset(id);
    return b ? { doc: b.doc, name: b.doc.name } : undefined;
  }

  /**
   * The component takes the material as it is: content, structure, layout,
   * states' style and interactions stay; the previous material's own state
   * overrides are dropped when the family changes, and the notice says which.
   */
  private bindToComponent(binding: ComponentDefinition['material'], then?: string): boolean {
    const doc = this.state.builder.doc;
    let r;
    try {
      r = bindComponentMaterial(doc, binding);
    } catch (e) {
      this.notify((e as Error).message);
      return false;
    }
    // Choosing a material gives the component that material: the overrides made over the previous one are not carried along.
    const replaced = [...(Object.keys(doc.material.params).length ? ['material.params'] : []), ...Object.entries(doc.states).filter(([, v]) => v?.material).map(([k]) => `states.${k}.material`)];
    this.applyComponent({ ...r.definition, states: withoutMaterialOverrides(r.definition.states) });
    const dropped = [...new Set([...r.dropped, ...replaced])];
    const notes = [then, dropped.length ? `Modifiche locali al materiale precedente non riportate: ${dropped.join(', ')}.` : undefined].filter(Boolean);
    if (notes.length) this.notify(notes.join(' '));
    return true;
  }

  /** Applies a library material (built-in or personal) to the component, linked to it. */
  applyMaterialPreset(id: string): void {
    const preset = this.materialPreset(id);
    if (!preset) return;
    this.bindToComponent(bindMaterial(preset.doc, id));
  }

  /** Changes the component's material family: the family's own initial material, everything else kept. */
  setComponentFamily(family: string): void {
    const doc = this.state.builder.doc;
    if (family === doc.material.family) return;
    let r;
    try {
      r = switchMaterialFamily(doc, family);
    } catch (e) {
      this.notify((e as Error).message);
      return;
    }
    this.applyComponent(r.definition);
    const name = MATERIALS.get(family)?.name ?? family;
    this.notify(`Materiale: ${name}.${r.dropped.length ? ` Non riportato dal materiale precedente: ${r.dropped.join(', ')}.` : ' Contenuto, struttura, layout e stati restano.'}`);
  }

  /** Back to the preset's current content (the component follows it again), or to the material without the component's overrides when it has no preset. */
  resetComponentMaterial(): void {
    const doc = this.state.builder.doc;
    const id = doc.material.preset;
    if (id && this.materialPreset(id)) return this.applyMaterialPreset(id);
    this.applyComponent({ ...doc, states: withoutMaterialOverrides(doc.states), material: { ...doc.material, params: {} } });
  }

  /**
   * The open component follows a library material it is linked to and has
   * not edited (state `outdated`). Components with their own values keep
   * them; the inspector offers «Aggiorna dal preset».
   */
  private followPreset(id: string): void {
    const b = this.state.builder;
    if (b.doc.material.preset !== id) return;
    const item = this.state.library.find((i) => i.id === id);
    if (!item || bindingState(b.doc.material, item.doc, hasMaterialOverrides(b.doc)) !== 'outdated') return;
    this.applyComponent({ ...b.doc, material: bindMaterial(item.doc, id) });
  }

  /** Saved components that are not open follow the material too (autosave, debounced). */
  private async propagatePreset(id: string): Promise<void> {
    const item = this.state.library.find((i) => i.id === id);
    if (!item) return;
    let components = this.state.components;
    for (const rec of this.userComponents.values()) {
      if (rec.id === this.state.builder.componentId || rec.doc.material.preset !== id) continue;
      if (bindingState(rec.doc.material, item.doc, hasMaterialOverrides(rec.doc)) !== 'outdated') continue;
      const next: StoredComponent = { ...rec, doc: { ...rec.doc, material: bindMaterial(item.doc, id) }, updatedAt: now() };
      await this.repo.putComponent(next);
      this.userComponents.set(next.id, next);
      components = components.map((c) => (c.id === next.id ? { ...c, doc: next.doc } : c));
    }
    if (components !== this.state.components) this.store.set({ components });
  }

  /** Components (saved, and the one open) whose material comes from library entry `id`. */
  componentsUsing(id: string): string[] {
    const names = new Set<string>();
    for (const c of this.state.components) if (c.origin === 'user' && c.doc.material.preset === id) names.add(c.id);
    if (this.state.builder.doc.material.preset === id) names.add(this.state.builder.componentId);
    return [...names];
  }

  /**
   * Material Lab → builder: the material being edited goes on the component
   * open in the builder. An edited built-in is first saved as a personal
   * copy, so the component links to something that exists in the library.
   */
  async useMaterialInComponent(): Promise<void> {
    if (this.state.origin === 'builtin' && this.state.modified) await this.saveAsCopy();
    else await this.autosaver.flush();
    const id = this.state.materialId;
    this.applyMaterialPreset(id);
    this.setWorkspace('builder');
    this.selectElement('material');
    this.notify(`«${this.state.doc.name}» applicato a «${this.state.builder.doc.name}». La componente segue le modifiche del materiale.`);
  }

  /** The component's material becomes a personal preset of the library (Material Lab selection unchanged). */
  async saveComponentMaterialAsPreset(name: string): Promise<string | null> {
    const clean = name.trim().slice(0, 80);
    if (!clean) return null;
    const doc = this.state.builder.doc;
    const src = resolveDefinitionMaterial(doc);
    const m: MaterialDocument = { ...src, id: userId(), name: clean, meta: { ...src.meta, basedOn: doc.material.preset ?? src.meta.basedOn, createdAt: now(), updatedAt: now() } };
    const rec: StoredMaterial = { id: m.id, doc: m, ...this.owner(), createdAt: now(), updatedAt: now() };
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
    this.syncBuilderMaterial();
    if (this.state.workspace === 'builder') {
      this.syncPreview(doc);
      if (isNavbar(doc)) this.navbarInstance()?.setActiveTab(navbarView(doc).defaultTab, false);
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
    if (this.state.builder.componentId === id) this.openComponent('mobile-navbar');
    this.notify('Componente eliminata dalla libreria.');
  }

  importComponentText(text: string): boolean {
    const r = importComponentText(text);
    if (!r.ok) {
      this.patchBuilder({ messages: { ok: false, messages: ['Import rifiutato: nessuna modifica applicata.', ...r.errors] } });
      return false;
    }
    const taken = this.userComponents.has(r.doc.id) || componentTemplate(r.doc.id) !== undefined;
    const doc: ComponentDefinition = { ...r.doc, id: taken ? componentId() : r.doc.id, meta: { ...r.doc.meta, createdAt: r.doc.meta.createdAt ?? now(), updatedAt: now() } };
    const messages = [...(r.migratedFrom ? [`Migrato da ${r.migratedFrom}.`] : []), ...r.warnings, ...(taken ? [`id «${r.doc.id}» già in uso: salvata come «${doc.id}».`] : [])];
    void this.addUserComponent(doc, `Importata «${doc.name}».`).then(() => this.patchBuilder({ messages: { ok: true, messages } }));
    return true;
  }

  componentJson(): string {
    return serializeDefinition(this.state.builder.doc);
  }

  private async addUserComponent(doc: ComponentDefinition, message: string) {
    const rec: StoredComponent = { id: doc.id, doc, ...this.owner(), createdAt: now(), updatedAt: now() };
    this.userComponents.set(doc.id, rec);
    this.store.set({ components: [...this.state.components, componentItem(rec)], builder: { ...builderState(doc, doc.id, 'user', false), selection: this.state.builder.selection, pick: this.state.builder.pick } });
    if (this.state.workspace === 'builder') this.syncPreview(doc);
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
      material: builder ? resolveDefinitionMaterial(s.builder.doc) : s.doc,
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
