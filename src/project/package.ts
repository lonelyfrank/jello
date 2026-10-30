/**
 * Project package (`.jello`, a ZIP) and the other project exports. Pure: it
 * returns files, the lab decides how to download them.
 *
 *   progetto.json                       the project (settings, favourites, assets)
 *   materiali/<nome>.json               one jello-glass document per material
 *   componenti/<nome>.json              one jello-component document per component
 *   asset/icone/<set>/<icona>.svg       readable copies of the icons
 *   asset/token.json                    colour and type tokens
 */

import { serializeComponent, parseComponentText, type ComponentDocument } from '../components/document';
import { serializeMaterial, parseMaterialText, type MaterialDocument } from '../model';
import { zip, type ZipEntry } from '../export/zip';
import { formatHsl, formatOklch, formatRgb } from './color';
import { parseProject, serializeProject, usedTokens } from './document';
import type { IconAsset, ProjectAssets, ProjectDoc, TypeStyle } from './types';

const enc = new TextEncoder();
const dec = new TextDecoder();

export interface PackageSelection {
  materials: MaterialDocument[];
  components: ComponentDocument[];
  colors: boolean;
  /** `used`: only icons referenced by the exported components. */
  icons: 'all' | 'used' | 'none';
  fonts: boolean;
}

export interface ProjectFile {
  path: string;
  data: Uint8Array;
}

export const fileSlug = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'senza-nome';

/** Names of the icons a set of components uses. */
export function usedIconNames(components: readonly ComponentDocument[]): Set<string> {
  const names = new Set<string>();
  for (const c of components) {
    for (const t of c.root.children) if (t.icon.kind !== 'none') names.add(t.icon.name);
  }
  return names;
}

export function iconSvg(icon: IconAsset): string {
  const paint =
    icon.paint === 'stroke'
      ? 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"'
      : 'fill="currentColor"';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${icon.viewBox}" ${paint}>${icon.body}</svg>\n`;
}

/** Assets of the project as the selection keeps them. */
export function selectAssets(a: ProjectAssets, sel: Pick<PackageSelection, 'colors' | 'icons' | 'fonts'> & { used?: ReadonlySet<string> }): ProjectAssets {
  const used = sel.used ?? new Set<string>();
  return {
    palettes: sel.colors ? a.palettes : [],
    iconSets:
      sel.icons === 'none'
        ? []
        : a.iconSets
            .map((s) => ({ ...s, icons: sel.icons === 'used' ? s.icons.filter((i) => used.has(i.name)) : s.icons }))
            .filter((s) => s.icons.length > 0),
    fonts: sel.fonts ? a.fonts : [],
    typeStyles: sel.fonts ? a.typeStyles : [],
  };
}

export function tokensJson(a: ProjectAssets): string {
  const colors: Record<string, string> = {};
  for (const p of a.palettes) for (const c of p.colors) colors[c.token] = cssColor(c.hex, c.alpha);
  const type: Record<string, string> = {};
  for (const t of a.typeStyles) type[t.token] = typeShorthand(t, a);
  return JSON.stringify({ colors, type }, null, 2);
}

export function cssColor(hex: string, alpha: number): string {
  if (alpha >= 1) return hex;
  return `${formatRgb(hex).replace(')', '')} / ${Math.round(alpha * 100)}%)`;
}

function familyStack(a: ProjectAssets, id: string): string {
  const f = a.fonts.find((x) => x.id === id);
  if (!f) return 'system-ui, sans-serif';
  const generic = f.fallback === 'system-ui' ? 'system-ui, sans-serif' : f.fallback;
  return f.source === 'system' ? generic : `"${f.name}", ${generic}`;
}

export function typeShorthand(t: TypeStyle, a: ProjectAssets): string {
  return `${t.weight} ${t.size}px/${t.lineHeight}px ${familyStack(a, t.family)}`;
}

/** CSS custom properties for colours and type, plus the Google Fonts link as a comment. */
export function cssVariables(a: ProjectAssets, name: string): string {
  const lines = [`/* ${name} · variabili Jello */`, ':root {'];
  for (const p of a.palettes) {
    lines.push(`  /* ${p.name} */`);
    for (const c of p.colors) lines.push(`  ${c.token}: ${cssColor(c.hex, c.alpha)};`);
  }
  const g = a.fonts.filter((f) => f.source === 'google');
  if (a.fonts.length) {
    lines.push('  /* Tipografia */');
    for (const f of a.fonts) lines.push(`  --jello-font-${fileSlug(f.role || f.name)}: ${familyStack(a, f.id)};`);
  }
  for (const t of a.typeStyles) lines.push(`  ${t.token}: ${typeShorthand(t, a)};`);
  lines.push('}');
  if (g.length) lines.push('', `/* Google Fonts: ${googleFontsUrl(g)} */`);
  return lines.join('\n') + '\n';
}

export function googleFontsUrl(fonts: readonly { name: string; weights: number[] }[]): string {
  const fam = fonts.map((f) => `family=${encodeURIComponent(f.name).replace(/%20/g, '+')}:wght@${[...f.weights].sort((x, y) => x - y).join(';')}`);
  return `https://fonts.googleapis.com/css2?${fam.join('&')}&display=swap`;
}

/** Colour values a developer might paste elsewhere. */
export function colorFormats(hex: string): { hex: string; rgb: string; hsl: string; oklch: string } {
  return { hex, rgb: formatRgb(hex), hsl: formatHsl(hex), oklch: formatOklch(hex) };
}

export function buildProjectPackage(project: ProjectDoc, sel: PackageSelection): ProjectFile[] {
  const used = usedIconNames(sel.components);
  const assets = selectAssets(project.assets, { colors: sel.colors, icons: sel.icons, fonts: sel.fonts, used });
  const doc: ProjectDoc = { ...project, assets, favorites: project.favorites.filter((id) => sel.materials.some((m) => m.id === id)) };
  const files: ProjectFile[] = [{ path: 'progetto.json', data: enc.encode(serializeProject(doc)) }];
  const names = new Set<string>();
  const pathFor = (dir: string, name: string) => {
    let slug = fileSlug(name);
    for (let i = 2; names.has(`${dir}/${slug}`); i++) slug = `${fileSlug(name)}-${i}`;
    names.add(`${dir}/${slug}`);
    return `${dir}/${slug}.json`;
  };
  for (const m of sel.materials) files.push({ path: pathFor('materiali', m.name), data: enc.encode(serializeMaterial(m)) });
  for (const c of sel.components) files.push({ path: pathFor('componenti', c.name), data: enc.encode(serializeComponent(c)) });
  for (const s of assets.iconSets) for (const i of s.icons) files.push({ path: `asset/icone/${fileSlug(s.name)}/${fileSlug(i.name)}.svg`, data: enc.encode(iconSvg(i)) });
  if (assets.palettes.length || assets.typeStyles.length) files.push({ path: 'asset/token.json', data: enc.encode(tokensJson(assets)) });
  return files;
}

export function packageBytes(files: readonly ProjectFile[]): Uint8Array {
  return zip(files.map((f): ZipEntry => ({ path: f.path, data: f.data })));
}

export function estimateBytes(files: readonly ProjectFile[]): number {
  return files.reduce((n, f) => n + f.data.length, 0);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

// ---------- reading ----------

const MAX_ENTRIES = 2000;
const MAX_ENTRY_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_BYTES = 64 * 1024 * 1024;

export class ZipError extends Error {}

async function inflateRaw(data: Uint8Array, expected: number): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') throw new ZipError('Questo browser non sa leggere file ZIP compressi.');
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const out = new Uint8Array(await new Response(stream).arrayBuffer());
  if (out.length !== expected) throw new ZipError('Voce ZIP danneggiata (dimensione).');
  return out;
}

/** Reads a ZIP by its central directory: stored and deflated entries, with size limits. */
export async function readZip(bytes: Uint8Array): Promise<ZipEntry[]> {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (v.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ZipError('Non è un pacchetto .jello valido (ZIP non riconosciuto).');
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  if (count > MAX_ENTRIES) throw new ZipError(`Il pacchetto ha troppe voci (${count}).`);
  const out: ZipEntry[] = [];
  let total = 0;
  for (let n = 0; n < count; n++) {
    if (p + 46 > bytes.length || v.getUint32(p, true) !== 0x02014b50) throw new ZipError('Indice del pacchetto danneggiato.');
    const method = v.getUint16(p + 10, true);
    const csize = v.getUint32(p + 20, true);
    const size = v.getUint32(p + 24, true);
    const nameLen = v.getUint16(p + 28, true);
    const extraLen = v.getUint16(p + 30, true);
    const commentLen = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const path = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (path.endsWith('/')) continue;
    if (path.startsWith('/') || path.includes('..') || path.includes('\\')) throw new ZipError(`Percorso non ammesso nel pacchetto: ${path}`);
    if (size > MAX_ENTRY_BYTES) throw new ZipError(`«${path}» è troppo grande.`);
    total += size;
    if (total > MAX_TOTAL_BYTES) throw new ZipError('Il pacchetto decompresso è troppo grande.');
    if (local + 30 > bytes.length || v.getUint32(local, true) !== 0x04034b50) throw new ZipError('Voce del pacchetto danneggiata.');
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const raw = bytes.subarray(start, start + csize);
    if (method === 0) out.push({ path, data: raw.slice() });
    else if (method === 8) out.push({ path, data: await inflateRaw(raw, size) });
    else throw new ZipError(`Compressione non supportata in «${path}».`);
  }
  return out;
}

export interface ReadPackage {
  project: ProjectDoc;
  materials: { path: string; doc: MaterialDocument; warnings: string[] }[];
  components: { path: string; doc: ComponentDocument; warnings: string[] }[];
  /** Entries refused as a whole, with the reason. */
  rejected: { path: string; errors: string[] }[];
}

export type PackageRead = { ok: true; value: ReadPackage } | { ok: false; errors: string[] };

export function readProjectEntries(entries: readonly ZipEntry[]): PackageRead {
  const main = entries.find((e) => e.path === 'progetto.json');
  if (!main) return { ok: false, errors: ['progetto.json: manca nel pacchetto'] };
  let json: unknown;
  try {
    json = JSON.parse(dec.decode(main.data));
  } catch {
    return { ok: false, errors: ['progetto.json: non è JSON valido'] };
  }
  const project = parseProject(json);
  if (!project.ok) return { ok: false, errors: project.errors.map((e) => `progetto.json · ${e}`) };
  const materials: ReadPackage['materials'] = [];
  const components: ReadPackage['components'] = [];
  const rejected: ReadPackage['rejected'] = [];
  for (const e of entries) {
    if (e.path.startsWith('materiali/') && e.path.endsWith('.json')) {
      const r = parseMaterialText(dec.decode(e.data));
      if (r.ok) materials.push({ path: e.path, doc: r.doc, warnings: r.warnings });
      else rejected.push({ path: e.path, errors: r.errors });
    } else if (e.path.startsWith('componenti/') && e.path.endsWith('.json')) {
      const r = parseComponentText(dec.decode(e.data));
      if (r.ok) components.push({ path: e.path, doc: r.doc, warnings: r.warnings });
      else rejected.push({ path: e.path, errors: r.errors });
    }
  }
  return { ok: true, value: { project: project.doc, materials, components, rejected } };
}

export { usedTokens };
