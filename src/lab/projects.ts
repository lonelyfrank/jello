/**
 * Project actions of the lab: create, duplicate, rename and delete projects,
 * edit their assets and favourites, apply an import and build an export.
 * Materials and components stay in the session's maps (stamped with the
 * project that owns them); this class owns the project documents.
 */

import { bindMaterial, componentTemplate, resolveDefinitionMaterial, type ComponentDefinition } from '../components';
import { MATERIALS, type MaterialDocument } from '../model';
import { newToken } from '../sync/protocol';
import { createProject, uniqueName } from '../project/document';
import { kitAssets, minimalAssets, stagePalette, statePalette, brandPalette } from '../project/defaults';
import { collect, mergeAssets, type Choice, type Incoming, type ImportItem } from '../project/importer';
import { buildProjectPackage, cssVariables, fileSlug, packageBytes, type PackageSelection } from '../project/package';
import { addFont } from '../project/assets';
import type { FontFamilyAsset, Platform, PreviewTheme, ProjectAssets, ProjectDoc } from '../project/types';
import { materialIdMap, remapMaterialReference, type MaterialIdMap } from '../project/references';
import type { LabSession } from './session';
import { sha256 } from './sync-sender';
import type { StoredAsset, StoredComponent, StoredMaterial } from './storage/repository';

const now = () => new Date().toISOString();
const matId = () => `user-${newToken().slice(0, 10).toLowerCase()}`;
export const projectDocId = () => `prj-${newToken().slice(0, 10).toLowerCase()}`;
const cmpId = () => `cmp-${newToken().slice(0, 10).toLowerCase()}`;

/** `blank`: no material at all (used when an import needs a home); `empty`: a project with one Glass material. */
export type StartKind = 'kit' | 'empty' | 'blank' | 'file' | 'duplicate';

export interface NewProjectSpec {
  name: string;
  platform: Platform;
  previewTheme: PreviewTheme;
  start: StartKind;
  /** `kit`: built-in preset ids to copy and whether to add the example navbar. */
  presets?: string[];
  navbar?: boolean;
  /** `kit`: also bring the Brand Jello and state palettes. */
  palettes?: boolean;
  /** `duplicate`: source project. */
  from?: string;
  /** `file`: what the file brought (a package, or one material). */
  items?: ImportItem[];
}

export interface ImportOutcome {
  materials: number;
  components: number;
  colors: number;
  icons: number;
  fonts: number;
  skipped: number;
  warnings: number;
  /** Id of the first material created, to open it. */
  firstMaterial: string | null;
  /** Components whose material was not part of the import: kept with their embedded material, no longer linked. */
  unlinked: string[];
}

/**
 * Built-in presets copied into a project started from the kit. Designer-facing materials only: a diagnostic
 * configuration («Refraction Test», id `optics`) is never created for the user (M6.4.2). Projects created before
 * this change keep the copy they already have.
 */
export const KIT_PRESETS = ['jello', 'satin', 'deep'] as const;

export class ProjectActions {
  private readonly dirty = new Set<string>();

  constructor(private readonly host: LabSession) {}

  private get state() {
    return this.host.state;
  }

  get active(): ProjectDoc | null {
    const s = this.state;
    return s.projects.find((p) => p.id === s.projectId) ?? null;
  }

  // ---------- project documents ----------

  /** Edits the active project's document; saved with the autosave. */
  update(fn: (p: ProjectDoc) => ProjectDoc): void {
    const cur = this.active;
    if (!cur) return;
    const next = { ...fn(cur), updatedAt: now() };
    this.host.store.set({ projects: this.state.projects.map((p) => (p.id === cur.id ? next : p)) });
    this.dirty.add(cur.id);
    this.host.touch();
  }

  updateAssets(fn: (a: ProjectAssets) => ProjectAssets): void {
    this.update((p) => ({ ...p, assets: fn(p.assets) }));
  }

  /** Project documents edited since they were last committed (the session's write puts them in its batch). */
  pending(): ProjectDoc[] {
    return [...this.dirty].flatMap((id) => this.state.projects.find((x) => x.id === id) ?? []);
  }

  /**
   * After the batch committed: a document is clean only if it is still the
   * one that was written (an edit made during the write stays dirty). A
   * failed write calls nothing, so every edit stays dirty and is retried.
   */
  committed(docs: readonly ProjectDoc[]): void {
    for (const d of docs) if (this.state.projects.find((x) => x.id === d.id) === d) this.dirty.delete(d.id);
    for (const id of [...this.dirty]) if (!this.state.projects.some((x) => x.id === id)) this.dirty.delete(id);
  }

  /** Stores an uploaded .woff2 and adds its family to the project. */
  async addUploadedFont(font: FontFamilyAsset, bytes: Uint8Array): Promise<void> {
    const hash = await sha256(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    await this.host.repo.putAsset({ hash, type: 'font/woff2', blob: new Blob([bytes as BlobPart], { type: 'font/woff2' }), name: font.name });
    this.updateAssets((a) => addFont(a, { ...font, fileHash: hash }).assets);
  }

  rename(id: string, name: string): void {
    const clean = name.trim().slice(0, 80);
    if (!clean) return;
    this.host.store.set({ projects: this.state.projects.map((p) => (p.id === id ? { ...p, name: clean, updatedAt: now() } : p)) });
    this.dirty.add(id);
    this.host.touch();
  }

  isFavorite(materialId: string): boolean {
    return this.active?.favorites.includes(materialId) ?? false;
  }

  toggleFavorite(materialId: string): void {
    this.update((p) => ({ ...p, favorites: p.favorites.includes(materialId) ? p.favorites.filter((x) => x !== materialId) : [...p.favorites, materialId] }));
  }

  counts(id: string): { materials: number; components: number } {
    return {
      materials: [...this.host.userMaterials.values()].filter((m) => m.projectId === id).length,
      components: [...this.host.userComponents.values()].filter((c) => c.projectId === id).length,
    };
  }

  // ---------- creating ----------

  private record<T extends MaterialDocument | ComponentDefinition>(doc: T, projectId: string, at: string) {
    return { id: doc.id, doc, projectId, createdAt: at, updatedAt: at };
  }

  private copyOfPreset(presetId: string): MaterialDocument | null {
    const b = MATERIALS.preset(presetId);
    if (!b) return null;
    return { ...b.doc, id: matId(), meta: { ...b.doc.meta, basedOn: presetId, createdAt: now(), updatedAt: now() } };
  }

  /**
   * Creates the project, fills it as asked and makes it the active one.
   * Everything is prepared in memory and committed in one transaction: a
   * failure leaves no project, material or component behind (and throws).
   */
  create(spec: NewProjectSpec): Promise<string> {
    return this.host.exclusive(() => this.createNow(spec));
  }

  private async createNow(spec: NewProjectSpec): Promise<string> {
    const id = projectDocId();
    const at = now();
    const names = new Set(this.state.projects.map((p) => p.name));
    const name = uniqueName(spec.name.trim() || 'Nuovo progetto', names);
    let assets: ProjectAssets = minimalAssets();
    let source: ProjectDoc | null = null;
    if (spec.start === 'kit') {
      const k = kitAssets();
      assets = spec.palettes === false ? { ...k, palettes: [] } : k;
    }
    if (spec.start === 'empty' || spec.start === 'blank') assets = { ...minimalAssets(), palettes: [brandPalette()] };
    if (spec.start === 'duplicate') {
      source = this.state.projects.find((p) => p.id === spec.from) ?? null;
      if (source) assets = structuredClone(source.assets);
    }
    let doc = createProject({ id, name, platform: spec.platform, previewTheme: spec.previewTheme, defaultPath: source?.defaultPath ?? 'auto', assets, at });
    const fromFile = spec.start === 'file' ? (spec.items ?? []) : [];
    for (const it of fromFile) {
      if (it.kind === 'project') doc = { ...doc, assets: structuredClone(it.pkg.project.assets), favorites: [] };
    }

    const materials: StoredMaterial[] = [];
    const components: StoredComponent[] = [];
    const unlinked: string[] = [];
    const addMaterial = (m: MaterialDocument) => materials.push(this.record(m, id, at));
    /** A copied component: new id, its material link rewritten through `ids` (see project/references). */
    const addCopy = (c: ComponentDefinition, ids: MaterialIdMap) => {
      const r = remapMaterialReference(c, ids);
      if (r.unlinked) unlinked.push(c.name);
      components.push(this.record({ ...r.doc, id: cmpId(), meta: { ...r.doc.meta, createdAt: at, updatedAt: at } }, id, at));
    };

    if (spec.start === 'kit') {
      for (const p of spec.presets ?? KIT_PRESETS) {
        const m = this.copyOfPreset(p);
        if (m) addMaterial(m);
      }
      if (spec.navbar !== false) {
        const t = componentTemplate('mobile-navbar')!.create();
        components.push(this.record({ ...t, id: cmpId(), name: 'Navbar', meta: { ...t.meta, basedOn: t.id, createdAt: at, updatedAt: at } }, id, at));
      }
    } else if (spec.start === 'empty') {
      const m = this.copyOfPreset('jello');
      if (m) addMaterial({ ...m, name: 'Glass' });
    } else if (spec.start === 'duplicate' && source) {
      // The copy is independent: its components link to the copied materials, never to the source project's.
      const srcMaterials = [...this.host.userMaterials.values()].filter((m) => m.projectId === source!.id);
      const ids = materialIdMap(srcMaterials.map((m) => [m.id, matId()]));
      for (const rec of srcMaterials) addMaterial({ ...rec.doc, id: ids.map.get(rec.id)!, meta: { ...rec.doc.meta, createdAt: at, updatedAt: at } });
      for (const rec of [...this.host.userComponents.values()].filter((c) => c.projectId === source!.id)) addCopy(rec.doc, ids.map);
      doc = { ...doc, favorites: source.favorites.map((f) => ids.map.get(f)).filter((x): x is string => !!x) };
    } else if (spec.start === 'file') {
      const incoming = fromFile.flatMap((it) => (it.kind === 'project' ? it.pkg.materials.map((m) => m.doc) : it.kind === 'material' ? [it.doc] : []));
      const fresh = incoming.map((m) => ({ ...m, id: matId(), meta: { ...m.meta, createdAt: at, updatedAt: at } }));
      // Ids are mapped across the whole import, so components link to materials of the same file set.
      const ids = materialIdMap(incoming.map((m, i) => [m.id, fresh[i]!.id]));
      fresh.forEach(addMaterial);
      for (const it of fromFile) {
        if (it.kind === 'project') for (const c of it.pkg.components) addCopy(c.doc, ids.map);
        else if (it.kind === 'component') addCopy(it.doc, ids.map);
      }
    }

    await this.host.repo.commit({ projectDocs: { put: [doc] }, materials: { put: materials }, components: { put: components } });
    // Committed: only now does the lab show the project.
    for (const m of materials) this.host.userMaterials.set(m.id, m);
    for (const c of components) this.host.userComponents.set(c.id, c);
    this.host.store.set({ projects: [...this.state.projects, doc] });
    this.host.switchProject(id);
    if (unlinked.length) this.host.notify(`Materiale non incluso per ${unlinked.map((n) => `«${n}»`).join(', ')}: la componente mantiene il suo aspetto ma non segue più un materiale della libreria.`, false, 10000);
    return id;
  }

  duplicate(id: string): Promise<string | null> {
    const src = this.state.projects.find((p) => p.id === id);
    if (!src) return Promise.resolve(null);
    return this.create({ name: `Copia di ${src.name}`.slice(0, 80), platform: src.platform, previewTheme: src.previewTheme, start: 'duplicate', from: id }).catch((e: unknown) => {
      this.host.notify(`Progetto non duplicato: ${(e as Error).message}`);
      return null;
    });
  }

  /** Deletes the project with its materials and components, in one transaction. */
  remove(id: string): Promise<boolean> {
    return this.host.exclusive(async () => {
      const s = this.state;
      if (!s.projects.some((p) => p.id === id)) return false;
      const materials = [...this.host.userMaterials.values()].filter((m) => m.projectId === id).map((m) => m.id);
      const components = [...this.host.userComponents.values()].filter((c) => c.projectId === id).map((c) => c.id);
      try {
        await this.host.repo.commit({ materials: { delete: materials }, components: { delete: components }, projectDocs: { delete: [id] } });
      } catch (e) {
        this.host.notify(`Progetto non eliminato: ${(e as Error).message}`);
        return false;
      }
      for (const m of materials) this.host.userMaterials.delete(m);
      for (const c of components) this.host.userComponents.delete(c);
      this.dirty.delete(id);
      this.host.announce([id]);
      const rest = this.state.projects.filter((p) => p.id !== id);
      this.host.store.set({ projects: rest });
      if (this.state.projectId === id) {
        if (rest[0]) this.host.switchProject(rest[0].id);
        else {
          this.host.store.set({ projectId: null, page: 'home' });
          this.host.rescope();
        }
      }
      return true;
    });
  }

  // ---------- import ----------

  /**
   * Applies verified items to the active project. `choices` answers the
   * conflicts. Materials, components, font files and the project's assets are
   * committed in one transaction; nothing is shown before it commits.
   */
  applyImport(items: readonly ImportItem[], choices: Readonly<Record<string, Choice>>): Promise<ImportOutcome> {
    return this.host.exclusive(() => this.importNow(items, choices));
  }

  private async importNow(items: readonly ImportItem[], choices: Readonly<Record<string, Choice>>): Promise<ImportOutcome> {
    const proj = this.active;
    if (!proj) throw new Error('Nessun progetto attivo');
    const at = now();
    const inc: Incoming = collect(items);
    const out: ImportOutcome = { materials: 0, components: 0, colors: 0, icons: 0, fonts: 0, skipped: 0, warnings: items.reduce((n, i) => n + ('warnings' in i ? i.warnings.length : 0), 0), firstMaterial: null, unlinked: [] };
    const materials: StoredMaterial[] = [];
    const components: StoredComponent[] = [];
    const assets: StoredAsset[] = [];
    const mine = [...this.host.userMaterials.values()].filter((m) => m.projectId === proj.id);
    const takenNames = new Set(mine.map((m) => m.doc.name));
    // Where each incoming material ends up: a new material, the one it replaces, or (skipped) the
    // project's material it conflicted with. Components are relinked through this map only.
    const target: [string, string][] = [];
    for (const m of inc.materials) {
      const choice = choices[m.key];
      const existing = mine.find((x) => x.doc.name === m.doc.name);
      if (choice === 'skip') {
        if (existing) target.push([m.doc.id, existing.id]);
        out.skipped++;
        continue;
      }
      if (choice === 'replace' && existing) {
        materials.push({ ...existing, doc: { ...m.doc, id: existing.id, meta: { ...m.doc.meta, updatedAt: at } }, updatedAt: at });
        target.push([m.doc.id, existing.id]);
        out.firstMaterial ??= existing.id;
      } else {
        const name = takenNames.has(m.doc.name) ? uniqueName(m.doc.name, takenNames) : m.doc.name;
        takenNames.add(name);
        const rec = this.record({ ...m.doc, id: matId(), name, meta: { ...m.doc.meta, createdAt: m.doc.meta.createdAt ?? at, updatedAt: at } }, proj.id, at);
        materials.push(rec);
        target.push([m.doc.id, rec.id]);
        out.firstMaterial ??= rec.id;
      }
      out.materials++;
    }
    const ids = materialIdMap(target);
    const mineC = [...this.host.userComponents.values()].filter((c) => c.projectId === proj.id);
    const takenC = new Set(mineC.map((c) => c.doc.name));
    for (const c of inc.components) {
      const choice = choices[c.key];
      if (choice === 'skip') {
        out.skipped++;
        continue;
      }
      const r = remapMaterialReference(c.doc, ids.map);
      if (r.unlinked) out.unlinked.push(c.doc.name);
      const linked = r.doc.material.preset ? r.doc.material : bindMaterial(resolveDefinitionMaterial(r.doc), null);
      const existing = mineC.find((x) => x.doc.name === c.doc.name);
      if (choice === 'replace' && existing) {
        components.push({ ...existing, doc: { ...r.doc, id: existing.id, meta: { ...r.doc.meta, updatedAt: at } }, updatedAt: at });
      } else {
        const name = takenC.has(c.doc.name) ? uniqueName(c.doc.name, takenC) : c.doc.name;
        takenC.add(name);
        components.push(this.record({ ...r.doc, id: cmpId(), name, material: linked, meta: { ...r.doc.meta, updatedAt: at } }, proj.id, at));
      }
      out.components++;
    }
    const fonts = inc.fonts.map((f) => ({ ...f, font: { ...f.font } }));
    for (const f of fonts) {
      if (f.bytes && choices[f.key] !== 'skip') {
        const hash = await sha256(f.bytes.buffer.slice(f.bytes.byteOffset, f.bytes.byteOffset + f.bytes.byteLength) as ArrayBuffer);
        assets.push({ hash, type: 'font/woff2', blob: new Blob([f.bytes as BlobPart], { type: 'font/woff2' }), name: f.font.name });
        f.font.fileHash = hash;
      }
    }
    const merged = mergeAssets(proj.assets, { ...inc, fonts }, choices);
    out.colors = merged.added.colors;
    out.icons = merged.added.icons;
    out.fonts = merged.added.fonts;
    out.skipped += merged.skipped.colors + merged.skipped.icons + merged.skipped.fonts;
    // By id: the user may have switched project while the font files were hashed.
    const current = this.state.projects.find((p) => p.id === proj.id) ?? proj;
    const next: ProjectDoc = { ...current, assets: merged.assets, updatedAt: at };

    await this.host.repo.commit({ materials: { put: materials }, components: { put: components }, assets: { put: assets }, projectDocs: { put: [next] } });
    for (const m of materials) this.host.userMaterials.set(m.id, m);
    for (const c of components) this.host.userComponents.set(c.id, c);
    this.host.store.set({ projects: this.state.projects.map((p) => (p.id === next.id ? next : p)) });
    this.committed([next]);
    this.host.announce([next.id]);
    this.host.rescope();
    return out;
  }

  // ---------- export ----------

  /** Materials and components of the active project as documents. */
  contents(): { materials: MaterialDocument[]; components: ComponentDefinition[] } {
    const id = this.state.projectId;
    return {
      materials: [...this.host.userMaterials.values()].filter((m) => m.projectId === id).map((m) => m.doc),
      components: [...this.host.userComponents.values()].filter((c) => c.projectId === id).map((c) => c.doc),
    };
  }

  /** Files of the chosen format for the selection. */
  buildExport(format: 'jello' | 'json' | 'css', fileName: string, sel: PackageSelection): { name: string; data: Uint8Array | string; type: string; files: number } | null {
    const p = this.active;
    if (!p) return null;
    const name = fileSlug(fileName);
    if (format === 'jello') {
      const files = buildProjectPackage(p, sel);
      return { name: `${name}.jello`, data: packageBytes(files), type: 'application/zip', files: files.length };
    }
    if (format === 'json') {
      const files = buildProjectPackage(p, { ...sel, components: [], colors: false, icons: 'none', fonts: false }).filter((f) => f.path.startsWith('materiali/'));
      return { name: `${name}.zip`, data: packageBytes(files), type: 'application/zip', files: files.length };
    }
    const assets = { ...p.assets, palettes: sel.colors ? p.assets.palettes : [], fonts: sel.fonts ? p.assets.fonts : [], typeStyles: sel.fonts ? p.assets.typeStyles : [] };
    return { name: `${name}.css`, data: cssVariables(assets, p.name), type: 'text/css', files: 1 };
  }
}

export { stagePalette, statePalette };
