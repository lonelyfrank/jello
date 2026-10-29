import { defaultParams, type GlassParams } from './params';

export interface Preset {
  id: string;
  label: string;
  note: string;
  /** True when the preset approximates another project's treatment. */
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
    id: 'cable',
    label: 'Cable .vetro (approssimazione)',
    note:
      'Approssima il materiale .vetro di Cable in tema chiaro (blur 30px, saturate 185%, bianco ≈43%, raggio 28px). ' +
      'Cable non ha rifrazione: anche qui è a zero. Non è una copia del rendering di Cable.',
    approximation: true,
    params: make({
      shape: 'rounded',
      radius: 28,
      refraction: 0,
      blur: 30,
      saturation: 185,
      tint: '#ffffff',
      tintOpacity: 0.43,
      light: 0.85,
      lightAngle: 320,
      shadow: 0.3,
      shadowBlur: 40,
      shadowOffset: 18,
    }),
  },
  {
    id: 'bt',
    label: 'BT navbar (approssimazione)',
    note:
      'Approssima la navbar di BT Score Board: fascia 12px, picco 5px con profilo sin², blur 10px, saturazione 150%, ' +
      'tinta rgb(18,18,22) al 14%, nessuna scala alla pressione. BT usa backdrop-filter: url() su Chromium; qui la stessa ' +
      'geometria passa dal filtro sulla sorgente. Non è una copia della navbar.',
    approximation: true,
    params: make({
      shape: 'capsule',
      band: 12,
      refraction: 5,
      profile: 'bump',
      blur: 10,
      saturation: 150,
      tint: '#121216',
      tintOpacity: 0.14,
      light: 0.18,
      shadow: 0.2,
      shadowBlur: 22,
      shadowOffset: 7,
      stretch: 0,
      pressScale: 1,
      pressRefraction: 0,
      pressLight: 0.22,
    }),
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
