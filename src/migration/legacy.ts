/**
 * Compatibility with presets and templates that earlier versions of Jello
 * shipped and that are no longer part of the official library.
 *
 * ISOLATED: this module exists only so that data a user already has keeps
 * opening: a scenario URL that names a removed preset or template, a saved
 * project whose last open material or component was one, a stored component
 * based on one. Nothing here is listed, selectable, exported or used to
 * create anything new: the official library, the templates, the exporters and
 * the public runtime never import it (tests/unit/boundaries.test.ts), and no
 * new project, component or export carries these identifiers.
 *
 * The original parameters are kept, so nothing the user was looking at is
 * lost; the editor opens them as an unsaved draft of a generic replacement
 * and says so. Personal materials and components are self-contained
 * documents: they never need this table.
 */

import { defaultParams, type GlassParams } from '../core/params';

export interface LegacyPreset {
  /** Built-in opened instead. */
  replacement: string;
  /** Neutral name for the draft that keeps the original parameters. */
  name: string;
  params: GlassParams;
}

const make = (o: Partial<GlassParams>): GlassParams => ({ ...defaultParams(), ...o });

/** Built-in material ids removed from the official library (they were shipped up to the experimental phase). */
export const LEGACY_PRESETS: Readonly<Record<string, LegacyPreset>> = {
  cable: {
    replacement: 'satin',
    name: 'Vetro smerigliato (preset non più incluso)',
    params: make({ shape: 'rounded', radius: 28, refraction: 0, blur: 30, saturation: 185, tint: '#ffffff', tintOpacity: 0.43, light: 0.85, lightAngle: 320, shadow: 0.3, shadowBlur: 40, shadowOffset: 18 }),
  },
  bt: {
    replacement: 'navbar',
    name: 'Navbar a profilo bump (preset non più incluso)',
    params: make({ shape: 'capsule', band: 12, refraction: 5, profile: 'bump', blur: 10, saturation: 150, tint: '#121216', tintOpacity: 0.14, light: 0.18, shadow: 0.2, shadowBlur: 22, shadowOffset: 7, stretch: 0, pressScale: 1, pressRefraction: 0, pressLight: 0.22 }),
  },
};

export interface LegacyTemplate {
  /** Official template opened instead. */
  replacement: string;
  /** `renamed`: same thing under its new name, nothing to tell. `removed`: no longer official, say so. */
  reason: 'renamed' | 'removed';
}

/**
 * Component template ids that no longer exist. `bottom-navigation` is the
 * template of the type that is now `mobile-navbar`; `bt-darts` belonged to
 * the experimental phase.
 */
export const LEGACY_TEMPLATES: Readonly<Record<string, LegacyTemplate>> = {
  'bottom-navigation': { replacement: 'mobile-navbar', reason: 'renamed' },
  'bt-darts': { replacement: 'mobile-navbar', reason: 'removed' },
};

export function legacyTemplate(id: string | null | undefined): LegacyTemplate | undefined {
  return id ? LEGACY_TEMPLATES[id] : undefined;
}

export function legacyPreset(id: string | null | undefined): LegacyPreset | undefined {
  return id ? LEGACY_PRESETS[id] : undefined;
}
