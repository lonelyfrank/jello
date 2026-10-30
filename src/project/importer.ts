/**
 * Import planning, pure. A dropped or chosen file becomes an `ImportItem`
 * (verified as a whole: a partial document is never applied), the items are
 * compared with the project to find conflicts, and the user's choices are
 * merged into the project's assets. Writing materials and components to
 * storage is the session's job.
 */

import type { ComponentDefinition } from '../components';
import { importComponentText } from '../migration';
import { iconFromSvg } from '../components/icons';
import { glassParams, parseGlassMaterialText, type GlassDocument } from '../model';
import { readProjectEntries, readZip, ZipError, type ReadPackage } from './package';
import { warningFor } from './assets';
import { uniqueName, uniqueToken } from './document';
import type { ColorAsset, FontFamilyAsset, IconAsset, Palette, ProjectAssets } from './types';

export const MAX_JSON_BYTES = 2 * 1024 * 1024;
export const MAX_SVG_BYTES = 200 * 1024;
export const MAX_FONT_BYTES = 4 * 1024 * 1024;
export const MAX_PACKAGE_BYTES = 32 * 1024 * 1024;

export type ImportItem =
  | { kind: 'material'; file: string; size: number; doc: GlassDocument; warnings: string[] }
  | { kind: 'component'; file: string; size: number; doc: ComponentDefinition; warnings: string[] }
  | { kind: 'project'; file: string; size: number; pkg: ReadPackage; warnings: string[] }
  | { kind: 'icon'; file: string; size: number; icon: IconAsset; warnings: string[] }
  | { kind: 'font'; file: string; size: number; font: FontFamilyAsset; bytes: Uint8Array; warnings: string[] }
  | { kind: 'rejected'; file: string; size: number; errors: string[] }
  | { kind: 'unsupported'; file: string; size: number };

export const ITEM_LABEL: Record<ImportItem['kind'], string> = {
  material: 'materiale',
  component: 'componente',
  project: 'progetto',
  icon: 'icona',
  font: 'font',
  rejected: 'rifiutato',
  unsupported: 'non supportato',
};

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'x';
const baseName = (file: string) => file.replace(/\.[^.]+$/, '');
const ext = (file: string) => (/\.([^.]+)$/.exec(file)?.[1] ?? '').toLowerCase();

/** Reads one file as the lab understands it. Never throws: problems become `rejected`. */
export async function inspectFile(file: string, bytes: Uint8Array): Promise<ImportItem> {
  const size = bytes.length;
  const e = ext(file);
  try {
    if (e === 'json') {
      if (size > MAX_JSON_BYTES) return { kind: 'rejected', file, size, errors: [`file troppo grande (massimo ${MAX_JSON_BYTES / 1024 / 1024} MB)`] };
      return inspectJsonText(file, new TextDecoder().decode(bytes));
    }
    if (e === 'jello') {
      if (size > MAX_PACKAGE_BYTES) return { kind: 'rejected', file, size, errors: ['pacchetto troppo grande'] };
      const r = readProjectEntries(await readZip(bytes));
      if (!r.ok) return { kind: 'rejected', file, size, errors: r.errors };
      const warnings = [...r.value.materials.flatMap((m) => m.warnings.map((w) => `${m.path}: ${w}`)), ...r.value.rejected.map((x) => `${x.path}: saltato (${x.errors[0] ?? 'non valido'})`)];
      return { kind: 'project', file, size, pkg: r.value, warnings };
    }
    if (e === 'svg') {
      if (size > MAX_SVG_BYTES) return { kind: 'rejected', file, size, errors: [`svg: file troppo grande (massimo ${MAX_SVG_BYTES / 1024} KB)`] };
      const r = iconFromSvg(new TextDecoder().decode(bytes), baseName(file));
      if (!r.ok) return { kind: 'rejected', file, size, errors: r.errors };
      const icon: IconAsset = { id: `ic-${slug(r.icon.name)}-${size}`, name: r.icon.name, viewBox: r.icon.viewBox, body: r.icon.body, paint: r.icon.paint, warning: warningFor(r.icon.body) };
      return { kind: 'icon', file, size, icon, warnings: r.warnings };
    }
    if (e === 'woff2' || e === 'woff') {
      if (size > MAX_FONT_BYTES) return { kind: 'rejected', file, size, errors: [`font: file troppo grande (massimo ${MAX_FONT_BYTES / 1024 / 1024} MB)`] };
      if (e === 'woff2' && !(bytes[0] === 0x77 && bytes[1] === 0x4f && bytes[2] === 0x46 && bytes[3] === 0x32)) {
        return { kind: 'rejected', file, size, errors: ['font: il file non è un WOFF2 valido'] };
      }
      const name = baseName(file).replace(/[-_](regular|bold|medium|light|semibold|italic)$/i, '').replace(/[-_]+/g, ' ').trim() || 'Font caricato';
      const font: FontFamilyAsset = { id: `f-${slug(name)}-${size}`, name, role: 'Caricato', source: 'upload', weights: [400], license: 'Da verificare', fallback: 'sans-serif', fileHash: null };
      return { kind: 'font', file, size, font, bytes, warnings: ['licenza da verificare prima di distribuire il font'] };
    }
  } catch (err) {
    const msg = err instanceof ZipError ? err.message : `lettura non riuscita: ${(err as Error).message}`;
    return { kind: 'rejected', file, size, errors: [msg] };
  }
  return { kind: 'unsupported', file, size };
}

export function inspectJsonText(file: string, text: string): ImportItem {
  const size = text.length;
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (err) {
    return { kind: 'rejected', file, size, errors: [`JSON non valido: ${(err as Error).message}`] };
  }
  const format = (json as { format?: unknown } | null)?.format;
  if (format === 'jello-component' || format === 'jello-component-definition') {
    const r = importComponentText(text);
    return r.ok ? { kind: 'component', file, size, doc: r.doc, warnings: r.warnings } : { kind: 'rejected', file, size, errors: r.errors };
  }
  const r = parseGlassMaterialText(text);
  return r.ok ? { kind: 'material', file, size, doc: r.doc, warnings: r.warnings } : { kind: 'rejected', file, size, errors: r.errors };
}

export function summarize(items: readonly ImportItem[]): string {
  const n = (k: ImportItem['kind']) => items.filter((i) => i.kind === k).length;
  const parts: string[] = [];
  const add = (count: number, one: string, many: string) => count && parts.push(`${count} ${count === 1 ? one : many}`);
  add(n('material'), 'materiale', 'materiali');
  add(n('component'), 'componente', 'componenti');
  add(n('project'), 'progetto', 'progetti');
  add(n('icon'), 'icona', 'icone');
  add(n('font'), 'font', 'font');
  add(n('rejected'), 'rifiutato', 'rifiutati');
  add(n('unsupported'), 'non supportato', 'non supportati');
  return parts.join(', ');
}

// ---------- conflicts ----------

export type Choice = 'both' | 'replace' | 'skip';

export interface Conflict {
  key: string;
  kind: 'material' | 'component' | 'color' | 'icon' | 'font';
  /** Existing item's id (material, component) or the token / name (asset). */
  existing: string;
  label: string;
  detail: string;
  /** Options offered, in the order shown. The first one is the safe default. */
  options: Choice[];
}

export interface Existing {
  materials: readonly { id: string; name: string; doc: GlassDocument }[];
  components: readonly { id: string; name: string; doc: ComponentDefinition }[];
  assets: ProjectAssets;
}

/** Everything an import would add, flattened across files. */
export interface Incoming {
  materials: { key: string; doc: GlassDocument }[];
  components: { key: string; doc: ComponentDefinition }[];
  colors: { key: string; palette: string; color: ColorAsset }[];
  icons: { key: string; set: string; icon: IconAsset }[];
  fonts: { key: string; font: FontFamilyAsset; bytes: Uint8Array | null }[];
}

export function collect(items: readonly ImportItem[]): Incoming {
  const out: Incoming = { materials: [], components: [], colors: [], icons: [], fonts: [] };
  items.forEach((it, n) => {
    const k = `${n}`;
    if (it.kind === 'material') out.materials.push({ key: `m:${k}`, doc: it.doc });
    else if (it.kind === 'component') out.components.push({ key: `c:${k}`, doc: it.doc });
    else if (it.kind === 'icon') out.icons.push({ key: `i:${k}`, set: 'Caricate', icon: it.icon });
    else if (it.kind === 'font') out.fonts.push({ key: `f:${k}`, font: it.font, bytes: it.bytes });
    else if (it.kind === 'project') {
      it.pkg.materials.forEach((m, i) => out.materials.push({ key: `m:${k}.${i}`, doc: m.doc }));
      it.pkg.components.forEach((c, i) => out.components.push({ key: `c:${k}.${i}`, doc: c.doc }));
      const a = it.pkg.project.assets;
      a.palettes.forEach((p, pi) => p.colors.forEach((c, ci) => out.colors.push({ key: `p:${k}.${pi}.${ci}`, palette: p.name, color: c })));
      a.iconSets.forEach((s, si) => s.icons.forEach((i, ii) => out.icons.push({ key: `i:${k}.${si}.${ii}`, set: s.builtin ? '' : s.name, icon: i })));
      a.fonts.forEach((f, fi) => out.fonts.push({ key: `f:${k}.${fi}`, font: f, bytes: null }));
    }
  });
  return out;
}

function diffParams(a: GlassDocument, b: GlassDocument): number {
  const pa = glassParams(a) as unknown as Record<string, unknown>;
  const pb = glassParams(b) as unknown as Record<string, unknown>;
  return Object.keys(pa).filter((k) => pa[k] !== pb[k]).length;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function findConflicts(incoming: Incoming, ex: Existing): Conflict[] {
  const out: Conflict[] = [];
  for (const m of incoming.materials) {
    const hit = ex.materials.find((x) => x.name === m.doc.name);
    if (!hit) continue;
    const d = diffParams(hit.doc, m.doc);
    out.push({
      key: m.key,
      kind: 'material',
      existing: hit.id,
      label: `Materiale “${m.doc.name}”`,
      detail: d === 0 ? 'Stessi parametri' : `${plural(d, 'parametro diverso', 'parametri diversi')}`,
      options: ['both', 'replace', 'skip'],
    });
  }
  for (const c of incoming.components) {
    const hit = ex.components.find((x) => x.name === c.doc.name);
    if (!hit) continue;
    out.push({ key: c.key, kind: 'component', existing: hit.id, label: `Componente “${c.doc.name}”`, detail: 'Esiste già una componente con questo nome', options: ['both', 'replace', 'skip'] });
  }
  const tokens = new Map<string, ColorAsset>();
  for (const p of ex.assets.palettes) for (const c of p.colors) tokens.set(c.token, c);
  for (const c of incoming.colors) {
    const hit = tokens.get(c.color.token);
    if (!hit || (hit.hex === c.color.hex && hit.alpha === c.color.alpha)) continue;
    out.push({ key: c.key, kind: 'color', existing: hit.token, label: `Colore “${c.color.name}”`, detail: `${hit.hex.toUpperCase()} → ${c.color.hex.toUpperCase()}`, options: ['both', 'skip'] });
  }
  const iconNames = new Set(ex.assets.iconSets.flatMap((s) => s.icons.map((i) => i.name)));
  for (const i of incoming.icons) {
    if (!iconNames.has(i.icon.name)) continue;
    out.push({ key: i.key, kind: 'icon', existing: i.icon.name, label: `Icona “${i.icon.name}”`, detail: 'Esiste già un’icona con questo nome', options: ['both', 'replace', 'skip'] });
  }
  const fontNames = new Set(ex.assets.fonts.map((f) => f.name));
  for (const f of incoming.fonts) {
    if (!fontNames.has(f.font.name)) continue;
    out.push({ key: f.key, kind: 'font', existing: f.font.name, label: `Font “${f.font.name}”`, detail: 'Esiste già una famiglia con questo nome', options: ['both', 'skip'] });
  }
  return out;
}

export const CHOICE_LABEL: Record<Conflict['kind'], Partial<Record<Choice, (name: string) => string>>> = {
  material: { both: (n) => `Mantieni entrambi (“${uniqueName(n, new Set([n]))}”)`, replace: () => 'Sostituisci il materiale esistente', skip: () => 'Salta' },
  component: { both: (n) => `Mantieni entrambi (“${uniqueName(n, new Set([n]))}”)`, replace: () => 'Sostituisci la componente esistente', skip: () => 'Salta' },
  color: { both: () => 'Mantieni entrambi', skip: () => 'Tieni il mio, ignora quello importato' },
  icon: { both: () => 'Mantieni entrambe', replace: () => 'Sostituisci l’icona esistente', skip: () => 'Salta' },
  font: { both: () => 'Mantieni entrambi', skip: () => 'Tieni il mio, ignora quello importato' },
};

// ---------- merging assets ----------

export interface MergeResult {
  assets: ProjectAssets;
  added: { colors: number; icons: number; fonts: number };
  skipped: { colors: number; icons: number; fonts: number };
}

/** `choices` is keyed like `Conflict.key`; a missing key means "no conflict". */
export function mergeAssets(base: ProjectAssets, incoming: Incoming, choices: Readonly<Record<string, Choice>>): MergeResult {
  const assets: ProjectAssets = structuredClone(base);
  const added = { colors: 0, icons: 0, fonts: 0 };
  const skipped = { colors: 0, icons: 0, fonts: 0 };
  const taken = new Set([...assets.palettes.flatMap((p) => p.colors.map((c) => c.token)), ...assets.typeStyles.map((t) => t.token)]);

  const paletteFor = (name: string): Palette => {
    let p = assets.palettes.find((x) => x.name === name);
    if (!p) {
      p = { id: `pal-${slug(name)}-${assets.palettes.length}`, name, colors: [] };
      assets.palettes.push(p);
    }
    return p;
  };
  for (const c of incoming.colors) {
    const choice = choices[c.key];
    if (choice === 'skip') {
      skipped.colors++;
      continue;
    }
    const pal = paletteFor(c.palette);
    let color = c.color;
    if (taken.has(color.token)) {
      const same = assets.palettes.flatMap((p) => p.colors).find((x) => x.token === color.token);
      if (same && same.hex === color.hex && same.alpha === color.alpha) {
        skipped.colors++;
        continue;
      }
      color = { ...color, token: uniqueToken(color.token, taken), name: uniqueName(color.name, new Set(pal.colors.map((x) => x.name))) };
    }
    taken.add(color.token);
    pal.colors.push({ ...color, id: `${color.id}-${assets.palettes.length}-${pal.colors.length}` });
    added.colors++;
  }

  const setFor = (name: string) => {
    let s = assets.iconSets.find((x) => !x.builtin && x.name === name);
    if (!s) {
      s = { id: `set-${slug(name)}-${assets.iconSets.length}`, name, builtin: false, icons: [] };
      assets.iconSets.push(s);
    }
    return s;
  };
  for (const i of incoming.icons) {
    const choice = choices[i.key];
    if (choice === 'skip') {
      skipped.icons++;
      continue;
    }
    const set = i.set ? setFor(i.set) : setFor('Caricate');
    if (choice === 'replace') {
      for (const s of assets.iconSets) s.icons = s.icons.filter((x) => x.name !== i.icon.name || s.builtin);
    }
    const names = new Set(assets.iconSets.flatMap((s) => s.icons.map((x) => x.name)));
    const icon = names.has(i.icon.name) ? { ...i.icon, name: uniqueName(i.icon.name, names) } : i.icon;
    set.icons.push({ ...icon, id: `${icon.id}-${set.icons.length}` });
    added.icons++;
  }

  for (const f of incoming.fonts) {
    const choice = choices[f.key];
    if (choice === 'skip') {
      skipped.fonts++;
      continue;
    }
    const names = new Set(assets.fonts.map((x) => x.name));
    const name = names.has(f.font.name) ? uniqueName(f.font.name, names) : f.font.name;
    assets.fonts.push({ ...f.font, name, id: `${f.font.id}-${assets.fonts.length}` });
    added.fonts++;
  }
  assets.iconSets = assets.iconSets.filter((s) => s.builtin || s.icons.length > 0);
  return { assets, added, skipped };
}
