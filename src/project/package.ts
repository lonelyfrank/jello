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

import { definitionIcons, serializeDefinition, type ComponentDefinition } from '../components';
import { validateSvgBody } from '../components/icons';
import { importComponentText } from '../migration';
import { serializeMaterial, parseMaterialText, type MaterialDocument } from '../model';
import { zip, type ZipEntry } from '../export/zip';
import { formatHsl, formatOklch, formatRgb } from './color';
import { parseProject, serializeProject, usedTokens } from './document';
import type { IconAsset, ProjectAssets, ProjectDoc, TypeStyle } from './types';

const enc = new TextEncoder();
const dec = new TextDecoder();

export interface PackageSelection {
  materials: MaterialDocument[];
  components: ComponentDefinition[];
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
export function usedIconNames(components: readonly ComponentDefinition[]): Set<string> {
  const names = new Set<string>();
  for (const c of components) {
    for (const i of definitionIcons(c)) if (i.icon.kind !== 'none') names.add(i.icon.name);
  }
  return names;
}

/** A standalone .svg of a project icon. The body is validated again: an export never carries markup the allowlist refuses. */
export function iconSvg(icon: IconAsset): string {
  const safe = validateSvgBody(icon.viewBox, icon.body);
  const viewBox = safe.ok ? safe.viewBox : '0 0 24 24';
  const body = safe.ok ? safe.body : '';
  const paint =
    icon.paint === 'stroke'
      ? 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"'
      : 'fill="currentColor"';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" ${paint}>${body}</svg>\n`;
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
  for (const c of sel.components) files.push({ path: pathFor('componenti', c.name), data: enc.encode(serializeDefinition(c)) });
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

export { readZip, ZipError, ZIP_LIMITS } from './unzip';

export interface ReadPackage {
  project: ProjectDoc;
  materials: { path: string; doc: MaterialDocument; warnings: string[] }[];
  components: { path: string; doc: ComponentDefinition; warnings: string[] }[];
  /** Entries refused as a whole, with the reason. */
  rejected: { path: string; errors: string[] }[];
  /** What `progetto.json` needed to be safe (icons normalised or put in quarantine). */
  warnings: string[];
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
      const r = importComponentText(dec.decode(e.data));
      if (r.ok) components.push({ path: e.path, doc: r.doc, warnings: r.warnings });
      else rejected.push({ path: e.path, errors: r.errors });
    }
  }
  return { ok: true, value: { project: project.doc, materials, components, rejected, warnings: project.warnings.map((w) => `progetto.json: ${w}`) } };
}

export { usedTokens };
