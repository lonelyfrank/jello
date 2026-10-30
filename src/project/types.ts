/**
 * Project model. A project groups what a team ships together: personal
 * materials and components (referenced by id, stored by the lab) and its own
 * assets (colours, icons, fonts). Built-in presets and templates are never part
 * of a project: they live in code.
 */

import type { IconPaint } from '../components/icons';

export const PROJECT_FORMAT = 'jello-project';
export const PROJECT_SCHEMA_VERSION = 1;

export type Platform = 'web' | 'android' | 'both';
export type PreviewTheme = 'system' | 'light' | 'dark';
export type DefaultPath = 'auto' | 'refraction' | 'satin' | 'opaque';

export const PLATFORM_LABEL: Record<Platform, string> = { web: 'Web', android: 'Android', both: 'Web + WebView' };

export interface ColorAsset {
  id: string;
  name: string;
  /** CSS custom property, e.g. `--jello-viola`. */
  token: string;
  /** #rrggbb. */
  hex: string;
  /** 0 – 1. */
  alpha: number;
}

export interface Palette {
  id: string;
  name: string;
  colors: ColorAsset[];
}

export interface IconAsset {
  id: string;
  name: string;
  viewBox: string;
  /** Allowlisted markup produced by `components/icons`, never raw user SVG. */
  body: string;
  paint: IconPaint;
  /** Why the icon is not fully clean (fixed colour, …); null when it is. */
  warning: string | null;
}

export interface IconSet {
  id: string;
  name: string;
  /** The Jello built-in set is derived from code and not editable. */
  builtin: boolean;
  icons: IconAsset[];
}

export type FontSource = 'google' | 'upload' | 'system';

export interface FontFamilyAsset {
  id: string;
  name: string;
  role: string;
  source: FontSource;
  weights: number[];
  license: string;
  /** Generic fallback stack appended in the exported CSS. */
  fallback: 'sans-serif' | 'serif' | 'monospace' | 'system-ui';
  /** Hash of the uploaded .woff2 in the lab's asset store (source `upload`). */
  fileHash: string | null;
}

export interface TypeStyle {
  id: string;
  /** CSS custom property, e.g. `--jello-titolo`. */
  token: string;
  label: string;
  sample: string;
  /** Id of a font family of the project. */
  family: string;
  weight: number;
  size: number;
  lineHeight: number;
}

export interface ProjectAssets {
  palettes: Palette[];
  iconSets: IconSet[];
  fonts: FontFamilyAsset[];
  typeStyles: TypeStyle[];
}

export interface ProjectDoc {
  format: typeof PROJECT_FORMAT;
  schemaVersion: number;
  id: string;
  name: string;
  platform: Platform;
  previewTheme: PreviewTheme;
  defaultPath: DefaultPath;
  /** Material ids marked as favourite. */
  favorites: string[];
  assets: ProjectAssets;
  createdAt: string;
  updatedAt: string;
}

export function emptyAssets(): ProjectAssets {
  return { palettes: [], iconSets: [], fonts: [], typeStyles: [] };
}

export function countColors(a: ProjectAssets): number {
  return a.palettes.reduce((n, p) => n + p.colors.length, 0);
}

export function countIcons(a: ProjectAssets): number {
  return a.iconSets.reduce((n, s) => n + s.icons.length, 0);
}
