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
import type { LabSession } from './session';
import { sha256 } from './sync-sender';
import type { StoredComponent, StoredMaterial } from './storage/repository';

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
}

export const KIT_PRESETS = ['jello', 'satin', 'deep', 'optics'] as const;

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

  /** Called by the session's write: persists edited project documents. */
  async flush(): Promise<void> {
    for (const id of [...this.dirty]) {
      const p = this.state.projects.find((x) => x.id === id);
      this.dirty.delete(id);
      if (p) await this.host.repo.putProjectDoc(p);
    }
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

  private async addMaterial(doc: MaterialDocument, projectId: string): Promise<StoredMaterial> {
    const rec: StoredMaterial = { id: doc.id, doc, projectId, createdAt: now(), updatedAt: now() };
    await this.host.repo.putMaterial(rec);
    this.host.userMaterials.set(rec.id, rec);
    return rec;
  }

  private async addComponent(doc: ComponentDefinition, projectId: string): Promise<StoredComponent> {
    const rec: StoredComponent = { id: doc.id, doc, projectId, createdAt: now(), updatedAt: now() };
    await this.host.repo.putComponent(rec);
    this.host.userComponents.set(rec.id, rec);
    return rec;
  }

  private copyOfPreset(presetId: string): MaterialDocument | null {
    const b = MATERIALS.preset(presetId);
    if (!b) return null;
    return { ...b.doc, id: matId(), meta: { ...b.doc.meta, basedOn: presetId, createdAt: now(), updatedAt: now() } };
  }

  /** Creates the project, fills it as asked and makes it the active one. Returns its id. */
  async create(spec: NewProjectSpec): Promise<string> {
    const id = projectDocId();
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
    const base = createProject({ id, name, platform: spec.platform, previewTheme: spec.previewTheme, defaultPath: source?.defaultPath ?? 'auto', assets });
    let doc = base;
    const fromFile = spec.start === 'file' ? (spec.items ?? []) : [];
    for (const it of fromFile) {
      if (it.kind === 'project') doc = { ...doc, assets: structuredClone(it.pkg.project.assets), favorites: [] };
    }
    await this.host.repo.putProjectDoc(doc);
    this.host.store.set({ projects: [...this.state.projects, doc] });

    const favMap = new Map<string, string>();
    if (spec.start === 'kit') {
      for (const p of spec.presets ?? KIT_PRESETS) {
        const m = this.copyOfPreset(p);
        if (m) await this.addMaterial(m, id);
      }
      if (spec.navbar !== false) {
        const t = componentTemplate('mobile-navbar')!.create();
        await this.addComponent({ ...t, id: cmpId(), name: 'Navbar', meta: { ...t.meta, basedOn: t.id, createdAt: now(), updatedAt: now() } }, id);
      }
    } else if (spec.start === 'empty') {
      const m = this.copyOfPreset('jello');
      if (m) await this.addMaterial({ ...m, name: 'Glass' }, id);
    } else if (spec.start === 'duplicate' && source) {
      for (const rec of [...this.host.userMaterials.values()].filter((m) => m.projectId === source!.id)) {
        const copy: MaterialDocument = { ...rec.doc, id: matId(), meta: { ...rec.doc.meta, createdAt: now(), updatedAt: now() } };
        favMap.set(rec.id, copy.id);
        await this.addMaterial(copy, id);
      }
      for (const rec of [...this.host.userComponents.values()].filter((c) => c.projectId === source!.id)) {
        await this.addComponent({ ...rec.doc, id: cmpId(), meta: { ...rec.doc.meta, createdAt: now(), updatedAt: now() } }, id);
      }
      if (source.favorites.length) {
        const favorites = source.favorites.map((f) => favMap.get(f)).filter((x): x is string => !!x);
        doc = { ...doc, favorites };
        await this.host.repo.putProjectDoc(doc);
        this.host.store.set({ projects: this.state.projects.map((p) => (p.id === id ? doc : p)) });
      }
    } else if (spec.start === 'file') {
      for (const it of fromFile) {
        if (it.kind === 'project') {
          for (const m of it.pkg.materials) await this.addMaterial({ ...m.doc, id: matId(), meta: { ...m.doc.meta, createdAt: now(), updatedAt: now() } }, id);
          for (const c of it.pkg.components) await this.addComponent({ ...c.doc, id: cmpId(), meta: { ...c.doc.meta, createdAt: now(), updatedAt: now() } }, id);
        } else if (it.kind === 'material') await this.addMaterial({ ...it.doc, id: matId(), meta: { ...it.doc.meta, createdAt: now(), updatedAt: now() } }, id);
        else if (it.kind === 'component') await this.addComponent({ ...it.doc, id: cmpId(), meta: { ...it.doc.meta, createdAt: now(), updatedAt: now() } }, id);
      }
    }
    this.host.switchProject(id);
    return id;
  }

  async duplicate(id: string): Promise<string | null> {
    const src = this.state.projects.find((p) => p.id === id);
    if (!src) return null;
    return this.create({ name: `Copia di ${src.name}`.slice(0, 80), platform: src.platform, previewTheme: src.previewTheme, start: 'duplicate', from: id });
  }

  /** Deletes the project with its materials and components. */
  async remove(id: string): Promise<boolean> {
    const s = this.state;
    if (!s.projects.some((p) => p.id === id)) return false;
    try {
      for (const rec of [...this.host.userMaterials.values()].filter((m) => m.projectId === id)) {
        await this.host.repo.deleteMaterial(rec.id);
        this.host.userMaterials.delete(rec.id);
      }
      for (const rec of [...this.host.userComponents.values()].filter((c) => c.projectId === id)) {
        await this.host.repo.deleteComponent(rec.id);
        this.host.userComponents.delete(rec.id);
      }
      await this.host.repo.deleteProjectDoc(id);
    } catch (e) {
      this.host.notify((e as Error).message);
      return false;
    }
    this.dirty.delete(id);
    const rest = s.projects.filter((p) => p.id !== id);
    this.host.store.set({ projects: rest });
    if (s.projectId === id) {
      if (rest[0]) this.host.switchProject(rest[0].id);
      else {
        this.host.store.set({ projectId: null, page: 'home' });
        this.host.rescope();
      }
    }
    return true;
  }

  // ---------- import ----------

  /** Applies verified items to the active project. `choices` answers the conflicts. */
  async applyImport(items: readonly ImportItem[], choices: Readonly<Record<string, Choice>>): Promise<ImportOutcome> {
    const proj = this.active;
    if (!proj) throw new Error('Nessun progetto attivo');
    const inc: Incoming = collect(items);
    const out: ImportOutcome = { materials: 0, components: 0, colors: 0, icons: 0, fonts: 0, skipped: 0, warnings: items.reduce((n, i) => n + ('warnings' in i ? i.warnings.length : 0), 0), firstMaterial: null };
    const mine = [...this.host.userMaterials.values()].filter((m) => m.projectId === proj.id);
    const takenNames = new Set(mine.map((m) => m.doc.name));
    for (const m of inc.materials) {
      const choice = choices[m.key];
      if (choice === 'skip') {
        out.skipped++;
        continue;
      }
      const existing = mine.find((x) => x.doc.name === m.doc.name);
      if (choice === 'replace' && existing) {
        const rec: StoredMaterial = { ...existing, doc: { ...m.doc, id: existing.id, meta: { ...m.doc.meta, updatedAt: now() } }, updatedAt: now() };
        await this.host.repo.putMaterial(rec);
        this.host.userMaterials.set(rec.id, rec);
        out.firstMaterial ??= rec.id;
      } else {
        const name = takenNames.has(m.doc.name) ? uniqueName(m.doc.name, takenNames) : m.doc.name;
        takenNames.add(name);
        const rec = await this.addMaterial({ ...m.doc, id: matId(), name, meta: { ...m.doc.meta, createdAt: m.doc.meta.createdAt ?? now(), updatedAt: now() } }, proj.id);
        out.firstMaterial ??= rec.id;
      }
      out.materials++;
    }
    const mineC = [...this.host.userComponents.values()].filter((c) => c.projectId === proj.id);
    const takenC = new Set(mineC.map((c) => c.doc.name));
    for (const c of inc.components) {
      const choice = choices[c.key];
      if (choice === 'skip') {
        out.skipped++;
        continue;
      }
      const existing = mineC.find((x) => x.doc.name === c.doc.name);
      if (choice === 'replace' && existing) {
        const rec: StoredComponent = { ...existing, doc: { ...c.doc, id: existing.id, meta: { ...c.doc.meta, updatedAt: now() } }, updatedAt: now() };
        await this.host.repo.putComponent(rec);
        this.host.userComponents.set(rec.id, rec);
      } else {
        const name = takenC.has(c.doc.name) ? uniqueName(c.doc.name, takenC) : c.doc.name;
        takenC.add(name);
        await this.addComponent({ ...c.doc, id: cmpId(), name, material: c.doc.material.preset ? c.doc.material : bindMaterial(resolveDefinitionMaterial(c.doc), null), meta: { ...c.doc.meta, updatedAt: now() } }, proj.id);
      }
      out.components++;
    }
    for (const f of inc.fonts) {
      if (f.bytes && choices[f.key] !== 'skip') {
        const hash = await sha256(f.bytes.buffer.slice(f.bytes.byteOffset, f.bytes.byteOffset + f.bytes.byteLength) as ArrayBuffer);
        await this.host.repo.putAsset({ hash, type: 'font/woff2', blob: new Blob([f.bytes as BlobPart], { type: 'font/woff2' }), name: f.font.name });
        f.font.fileHash = hash;
      }
    }
    const merged = mergeAssets(proj.assets, inc, choices);
    out.colors = merged.added.colors;
    out.icons = merged.added.icons;
    out.fonts = merged.added.fonts;
    out.skipped += merged.skipped.colors + merged.skipped.icons + merged.skipped.fonts;
    this.update((p) => ({ ...p, assets: merged.assets }));
    this.host.rescope();
    await this.host.saveNow();
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
