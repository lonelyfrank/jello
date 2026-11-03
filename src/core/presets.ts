import { presetName } from '../model/catalog/names';
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
    label: presetName('jello'),
    note: 'Configurazione iniziale di Glass: rifrazione perimetrale simulata, centro neutro, blur leggero e riflessi. Aberrazione cromatica disattivata.',
    approximation: false,
    params: make({}),
  },
  {
    id: 'optics',
    label: presetName('optics'),
    note: 'Configurazione diagnostica: blur, tinta, luce e ombra a zero, resta solo la deviazione geometrica del bordo. Usata dalle verifiche raster.',
    approximation: false,
    params: make({ blur: 0, tintOpacity: 0, light: 0, shadow: 0, saturation: 100 }),
  },
  {
    id: 'satin',
    label: presetName('satin'),
    note: 'Superficie traslucida: backdrop blur, saturazione e tinta, nessuna rifrazione. Non simula la microstruttura di un vetro smerigliato.',
    approximation: false,
    params: make({ refraction: 0, blur: 14, saturation: 160, tintOpacity: 0.16 }),
  },
  {
    id: 'deep',
    label: presetName('deep'),
    note: 'Fascia più ampia e rifrazione di bordo forte, con blur quasi nullo: rende evidente il profilo.',
    approximation: false,
    params: make({ band: 36, refraction: 36, blur: 0.5, tintOpacity: 0.04, light: 0.7 }),
  },
  {
    id: 'navbar',
    label: presetName('navbar'),
    note:
      'Rifrazione di bordo moderata su una fascia stretta, centro neutro e leggibile, blur medio: adatto a superfici ampie e poco profonde ' +
      '(barre, toolbar, overlay). Pressione con poca scala, più luce. Nato dalla navbar del laboratorio.',
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
