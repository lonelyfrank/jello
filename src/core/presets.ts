import { defaultParams, type GlassParams } from './params';

export interface Preset {
  id: string;
  label: string;
  note: string;
  /** True when the preset approximates a treatment it does not reproduce exactly (none of the built-ins today). */
  approximation: boolean;
  params: GlassParams;
}

const make = (overrides: Partial<GlassParams>): GlassParams => ({ ...defaultParams(), ...overrides });

export const PRESETS: readonly Preset[] = [
  {
    id: 'jello',
    label: 'Jello · iniziale',
    note: 'Valori iniziali di Jello: rifrazione sul perimetro, centro neutro, blur leggero, aberrazione disattivata.',
    approximation: false,
    params: make({}),
  },
  {
    id: 'optics',
    label: 'Ottica nuda',
    note: 'Blur, tinta, luce e ombra a zero: resta solo la deviazione geometrica. Usato dalle verifiche raster.',
    approximation: false,
    params: make({ blur: 0, tintOpacity: 0, light: 0, shadow: 0, saturation: 100 }),
  },
  {
    id: 'satin',
    label: 'Satinato',
    note: 'Nessuna rifrazione: solo blur, saturazione e tinta. Utile per isolare il contributo della lente.',
    approximation: false,
    params: make({ refraction: 0, blur: 14, saturation: 160, tintOpacity: 0.16 }),
  },
  {
    id: 'deep',
    label: 'Lente marcata',
    note: 'Fascia più ampia e deviazione forte, quasi senza blur: rende evidente il profilo.',
    approximation: false,
    params: make({ band: 36, refraction: 36, blur: 0.5, tintOpacity: 0.04, light: 0.7 }),
  },
  {
    id: 'navbar',
    label: 'Jello · navbar',
    note:
      'Calibrato sulla navbar del laboratorio (barra larga e bassa sopra contenuti che scorrono): fascia stretta, ' +
      'rifrazione moderata sul perimetro, centro neutro e leggibile, blur medio. Pressione con poca scala, più luce.',
    approximation: false,
    params: make({
      band: 16,
      refraction: 10,
      profile: 'smooth',
      blur: 4,
      saturation: 160,
      tint: '#ffffff',
      tintOpacity: 0.14,
      light: 0.65,
      lightAngle: 330,
      shadow: 0.2,
      shadowBlur: 26,
      shadowOffset: 8,
      damping: 0.8,
      stretch: 0,
      pressScale: 1.02,
      pressRefraction: 0.4,
      pressLight: 0.45,
    }),
  },
];

export function presetById(id: string): Preset | undefined {
  return PRESETS.find((p) => p.id === id);
}
