/**
 * Edits of a project's assets as pure functions: the UI passes the result to
 * `session.projects.updateAssets`. Tokens stay unique across colours and type.
 */

import { definitionIcons, type ComponentDefinition } from '../components';
import { tokenFor, uniqueName, uniqueToken, usedTokens } from './document';
import type { ColorAsset, FontFamilyAsset, IconAsset, IconSet, ProjectAssets, TypeStyle } from './types';

let counter = 0;
export const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${(counter++).toString(36)}`;

// ---------- colours ----------

export function addPalette(a: ProjectAssets, name: string): { assets: ProjectAssets; id: string } {
  const names = new Set(a.palettes.map((p) => p.name));
  const id = newId('pal');
  return { assets: { ...a, palettes: [...a.palettes, { id, name: uniqueName(name.trim() || 'Nuova palette', names), colors: [] }] }, id };
}

export function renamePalette(a: ProjectAssets, id: string, name: string): ProjectAssets {
  const clean = name.trim().slice(0, 80);
  if (!clean) return a;
  return { ...a, palettes: a.palettes.map((p) => (p.id === id ? { ...p, name: clean } : p)) };
}

export function removePalette(a: ProjectAssets, id: string): ProjectAssets {
  return { ...a, palettes: a.palettes.filter((p) => p.id !== id) };
}

export function addColor(a: ProjectAssets, paletteId: string, init: { name?: string; hex?: string } = {}): { assets: ProjectAssets; id: string } {
  const pal = a.palettes.find((p) => p.id === paletteId);
  if (!pal) return { assets: a, id: '' };
  const name = uniqueName(init.name?.trim() || 'Nuovo colore', new Set(pal.colors.map((c) => c.name)));
  const token = uniqueToken(tokenFor(name), usedTokens(a));
  const id = newId('c');
  const color: ColorAsset = { id, name, token, hex: init.hex ?? '#7c4deb', alpha: 1 };
  return { assets: { ...a, palettes: a.palettes.map((p) => (p.id === paletteId ? { ...p, colors: [...p.colors, color] } : p)) }, id };
}

export function updateColor(a: ProjectAssets, id: string, patch: Partial<Pick<ColorAsset, 'name' | 'token' | 'hex' | 'alpha'>>): ProjectAssets {
  return { ...a, palettes: a.palettes.map((p) => ({ ...p, colors: p.colors.map((c) => (c.id === id ? { ...c, ...patch } : c)) })) };
}

export function removeColor(a: ProjectAssets, id: string): ProjectAssets {
  return { ...a, palettes: a.palettes.map((p) => ({ ...p, colors: p.colors.filter((c) => c.id !== id) })) };
}

export const TOKEN_RE = /^--[a-z0-9][a-z0-9-]{0,47}$/;

/** null when `token` is free for `ownId`; otherwise why not. */
export function tokenProblem(a: ProjectAssets, token: string, ownId: string): string | null {
  if (!TOKEN_RE.test(token)) return 'Il token inizia con -- e usa minuscole, cifre e trattini';
  for (const p of a.palettes) for (const c of p.colors) if (c.token === token && c.id !== ownId) return `«${token}» è già usato da «${c.name}»`;
  for (const t of a.typeStyles) if (t.token === token && t.id !== ownId) return `«${token}» è già usato dallo stile «${t.label}»`;
  return null;
}

/** Where a component of the project uses exactly this colour. */
export function colorUsage(components: readonly ComponentDefinition[], hex: string): string[] {
  const want = hex.toLowerCase();
  const out: string[] = [];
  const walk = (node: unknown, path: string, comp: ComponentDefinition) => {
    if (typeof node === 'string') {
      if (node.toLowerCase() === want) out.push(`${comp.name} · ${path}`);
    } else if (Array.isArray(node)) node.forEach((x, i) => walk(x, `${path}[${i}]`, comp));
    else if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) walk(v, path ? `${path}.${k}` : k, comp);
  };
  for (const c of components) walk({ content: c.content, layout: c.layout, style: c.style, states: c.states, material: c.material.params }, '', c);
  return [...new Set(out)];
}

/** Where a component uses an icon by name. */
export function iconUsage(components: readonly ComponentDefinition[], name: string): string[] {
  const out: string[] = [];
  for (const c of components) for (const i of definitionIcons(c)) if (i.icon.kind !== 'none' && i.icon.name === name) out.push(`${c.name} · ${i.owner}`);
  return out;
}

// ---------- icons ----------

const FIXED = /\b(?:stroke|fill)="(#[0-9a-fA-F]{3,8}|rgba?\([^"]*\))"/;

/** The first fixed colour in the markup, if any (currentColor and none are fine). */
export function fixedColor(body: string): string | null {
  const m = FIXED.exec(body);
  return m ? m[1]! : null;
}

export function toCurrentColor(body: string): string {
  return body.replace(/\b(stroke|fill)="(#[0-9a-fA-F]{3,8}|rgba?\([^"]*\))"/g, '$1="currentColor"');
}

export function warningFor(body: string): string | null {
  const c = fixedColor(body);
  return c ? `usa un colore fisso (${c.toUpperCase()}): convertilo in currentColor per farlo seguire al tema` : null;
}

export function addIconSet(a: ProjectAssets, name: string): { assets: ProjectAssets; id: string } {
  const names = new Set(a.iconSets.map((s) => s.name));
  const id = newId('set');
  const set: IconSet = { id, name: uniqueName(name.trim() || 'Nuova raccolta', names), builtin: false, icons: [] };
  return { assets: { ...a, iconSets: [...a.iconSets, set] }, id };
}

export function removeIconSet(a: ProjectAssets, id: string): ProjectAssets {
  return { ...a, iconSets: a.iconSets.filter((s) => s.id !== id || s.builtin) };
}

export function updateIcon(a: ProjectAssets, id: string, fn: (i: IconAsset) => IconAsset): ProjectAssets {
  return { ...a, iconSets: a.iconSets.map((s) => (s.builtin ? s : { ...s, icons: s.icons.map((i) => (i.id === id ? fn(i) : i)) })) };
}

export function removeIcon(a: ProjectAssets, id: string): ProjectAssets {
  return { ...a, iconSets: a.iconSets.map((s) => (s.builtin ? s : { ...s, icons: s.icons.filter((i) => i.id !== id) })) };
}

// ---------- fonts ----------

export function addFont(a: ProjectAssets, f: Omit<FontFamilyAsset, 'id'>): { assets: ProjectAssets; id: string } {
  const names = new Set(a.fonts.map((x) => x.name));
  const id = newId('f');
  return { assets: { ...a, fonts: [...a.fonts, { ...f, id, name: uniqueName(f.name, names) }] }, id };
}

export function updateFont(a: ProjectAssets, id: string, patch: Partial<Omit<FontFamilyAsset, 'id'>>): ProjectAssets {
  return { ...a, fonts: a.fonts.map((f) => (f.id === id ? { ...f, ...patch } : f)) };
}

/** Removing a family re-points the type styles that used it to the first remaining one. */
export function removeFont(a: ProjectAssets, id: string): ProjectAssets {
  const fonts = a.fonts.filter((f) => f.id !== id);
  const fallback = fonts[0]?.id ?? '';
  return { ...a, fonts, typeStyles: a.typeStyles.map((t) => (t.family === id ? { ...t, family: fallback } : t)) };
}

export function updateTypeStyle(a: ProjectAssets, id: string, patch: Partial<Omit<TypeStyle, 'id'>>): ProjectAssets {
  return { ...a, typeStyles: a.typeStyles.map((t) => (t.id === id ? { ...t, ...patch } : t)) };
}

export function addTypeStyle(a: ProjectAssets, label: string): { assets: ProjectAssets; id: string } {
  const id = newId('t');
  const names = new Set(a.typeStyles.map((t) => t.label));
  const name = uniqueName(label.trim() || 'Nuovo stile', names);
  const token = uniqueToken(tokenFor(name), usedTokens(a));
  const style: TypeStyle = { id, token, label: name, sample: 'Un’interfaccia più morbida per idee solide', family: a.fonts[0]?.id ?? '', weight: 400, size: 14, lineHeight: 20 };
  return { assets: { ...a, typeStyles: [...a.typeStyles, style] }, id };
}

export function removeTypeStyle(a: ProjectAssets, id: string): ProjectAssets {
  return { ...a, typeStyles: a.typeStyles.filter((t) => t.id !== id) };
}
