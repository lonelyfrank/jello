/**
 * Compatibility with presets and templates that earlier versions of Jello
 * shipped and that are no longer part of the official library.
 *
 * They are not listed, not selectable and not exported. They exist only so
 * that what a user already has keeps opening: a scenario URL that names one,
 * or a project whose last open material or component was one. The original
 * parameters are kept, so nothing the user was looking at is lost; the
 * editor opens them as an unsaved draft of the replacement and says so.
 * Personal materials and components are self-contained documents: they
 * never need this table.
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

/** Component template ids removed from the library → template opened instead. */
export const LEGACY_TEMPLATES: Readonly<Record<string, string>> = {
  'bt-darts': 'bottom-navigation',
};

export function legacyPreset(id: string | null | undefined): LegacyPreset | undefined {
  return id ? LEGACY_PRESETS[id] : undefined;
}
