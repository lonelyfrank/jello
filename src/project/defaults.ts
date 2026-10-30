/**
 * Starter assets of a new project: the Jello kit. Colours are the lab's own
 * brand and state colours; icons are the built-in set of the components;
 * fonts are the families the lab interface is drawn with.
 */

import { BUILTIN_ICONS } from '../components/icons';
import type { ColorAsset, FontFamilyAsset, IconSet, Palette, ProjectAssets, TypeStyle } from './types';

const color = (id: string, name: string, token: string, hex: string, alpha = 1): ColorAsset => ({ id, name, token, hex, alpha });

export function brandPalette(): Palette {
  return {
    id: 'pal-brand',
    name: 'Brand Jello',
    colors: [
      color('c-viola', 'Viola Jello', '--jello-viola', '#7c4deb'),
      color('c-magenta', 'Magenta gelatina', '--jello-magenta', '#e246c8'),
      color('c-lavanda', 'Lavanda', '--jello-lavanda', '#a78bfa'),
      color('c-grafite', 'Grafite', '--jello-grafite', '#121218'),
      color('c-nebbia', 'Nebbia', '--jello-nebbia', '#eeedf3'),
    ],
  };
}

export function stagePalette(): Palette {
  return {
    id: 'pal-stage',
    name: 'Sfondi di prova',
    colors: [
      color('c-blu', 'Blu elettrico', '--jello-blu', '#2148e8'),
      color('c-arancio', 'Arancio', '--jello-arancio', '#f7863a'),
      color('c-rosa', 'Rosa', '--jello-rosa', '#f24fa6'),
      color('c-indaco', 'Indaco', '--jello-indaco', '#5b3fe0'),
    ],
  };
}

export function statePalette(): Palette {
  return {
    id: 'pal-state',
    name: 'Stati',
    colors: [
      color('c-ok', 'Superata', '--jello-ok', '#8fe3b8'),
      color('c-warn', 'Attenzione', '--jello-warn', '#f5c77a'),
      color('c-err', 'Errore', '--jello-errore', '#ff8a80'),
    ],
  };
}

export function jelloIconSet(): IconSet {
  return {
    id: 'icons-jello',
    name: 'Jello · tratto',
    builtin: true,
    icons: Object.entries(BUILTIN_ICONS).map(([name, i]) => ({ id: `ic-${name}`, name, viewBox: '0 0 24 24', body: i.body, paint: 'stroke' as const, warning: null })),
  };
}

export function defaultFonts(): FontFamilyAsset[] {
  return [
    { id: 'f-inter', name: 'Inter', role: 'Interfaccia', source: 'google', weights: [400, 500, 600, 700], license: 'SIL Open Font License', fallback: 'sans-serif', fileHash: null },
    { id: 'f-fredoka', name: 'Fredoka', role: 'Logotipo', source: 'google', weights: [600, 700], license: 'SIL Open Font License', fallback: 'sans-serif', fileHash: null },
    { id: 'f-jetbrains', name: 'JetBrains Mono', role: 'Codice', source: 'google', weights: [400, 500], license: 'SIL Open Font License', fallback: 'monospace', fileHash: null },
  ];
}

export function defaultTypeStyles(): TypeStyle[] {
  return [
    { id: 't-display', token: '--jello-display', label: 'Display', sample: 'Jello Studio', family: 'f-fredoka', weight: 700, size: 40, lineHeight: 44 },
    { id: 't-titolo', token: '--jello-titolo', label: 'Titolo', sample: 'Glass personale', family: 'f-inter', weight: 600, size: 24, lineHeight: 30 },
    { id: 't-sezione', token: '--jello-sezione', label: 'Sezione', sample: 'Luce e profondità', family: 'f-inter', weight: 600, size: 16, lineHeight: 22 },
    { id: 't-corpo', token: '--jello-corpo', label: 'Corpo', sample: 'Spostamento massimo del campionamento sul bordo.', family: 'f-inter', weight: 400, size: 14, lineHeight: 20 },
    { id: 't-etichetta', token: '--jello-etichetta', label: 'Etichetta', sample: 'Home · Cerca · Preferiti', family: 'f-inter', weight: 500, size: 13, lineHeight: 18 },
    { id: 't-codice', token: '--jello-codice', label: 'Codice', sample: '"format": "jello-glass"', family: 'f-jetbrains', weight: 400, size: 13, lineHeight: 20 },
  ];
}

/** Everything the Jello kit brings. */
export function kitAssets(): ProjectAssets {
  return { palettes: [brandPalette(), stagePalette(), statePalette()], iconSets: [jelloIconSet()], fonts: defaultFonts(), typeStyles: defaultTypeStyles() };
}

/** What an empty project starts with: just the Jello icon set and the interface fonts. */
export function minimalAssets(): ProjectAssets {
  return { palettes: [brandPalette()], iconSets: [jelloIconSet()], fonts: defaultFonts(), typeStyles: defaultTypeStyles() };
}
