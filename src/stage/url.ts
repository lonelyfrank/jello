/** Reproducible scenarios in the URL. Shared by the lab and the phone preview. */
import { PRESETS } from '../core/presets';
import { QUALITY_IDS, type QualityProfileId } from '../model/quality';
import { SCENES, type SceneId } from './scenes';
import {
  CUSTOM_LIMITS,
  DEVICES,
  MODES,
  PATHS,
  TEXTURES,
  THEMES,
  isNav,
  isObject,
  type ViewOptions,
} from './view';

export type LabOptions = ViewOptions;

const isQuality = (v: string | null): v is QualityProfileId => QUALITY_IDS.some((q) => q === v);

export const isScene = (v: string | null): v is SceneId => SCENES.some((s) => s.id === v);

export interface BootState {
  options: LabOptions;
  /** Built-in material to start from (the `preset` key of the first milestones). */
  preset: string;
  /** `material=<id>`: a built-in or personal material; wins over `preset`. */
  material: string | null;
  quality: QualityProfileId | null;
  /** True when the URL describes a scenario: the last project is then not restored. */
  explicit: boolean;
}

const clampInt = (v: string | null, lo: number, hi: number, fallback: number) => {
  const n = v === null ? NaN : Number(v);
  return Number.isFinite(n) ? Math.round(Math.min(hi, Math.max(lo, n))) : fallback;
};

/**
 * Reads a reproducible scenario from the URL. Without explicit `preset` or
 * `scene`, `object=navbar` starts from the navbar preset on the app scene;
 * switching object later never changes the parameters. Keys of the first
 * milestones keep their meaning; new keys: mode, texture, material, quality,
 * device=custom with w and h.
 */
export function optionsFromQuery(query: URLSearchParams, systemReducedMotion: boolean): BootState {
  const flag = (name: string, fallback: boolean) => (query.has(name) ? query.get(name) !== '0' : fallback);
  const objectParam = query.get('object');
  const object = isObject(objectParam) ? objectParam : 'capsule';
  const scene = query.get('scene');
  const nav = query.get('nav');
  const preset = PRESETS.find((p) => p.id === query.get('preset'))?.id ?? (object === 'navbar' ? 'navbar' : 'jello');
  const material = query.get('material');
  const quality = query.get('quality');
  return {
    preset,
    material: material && /^[A-Za-z0-9._-]{1,64}$/.test(material) ? material : null,
    quality: isQuality(quality) ? quality : null,
    explicit: [...query.keys()].length > 0,
    options: {
      mode: MODES.find((m) => m === query.get('mode')) ?? 'components',
      object,
      nav: isNav(nav) ? nav : 'home',
      scene: isScene(scene) ? scene : object === 'navbar' ? 'app' : 'grid',
      texture: TEXTURES.find((t) => t === query.get('texture')) ?? 'pattern',
      animate: flag('animate', !systemReducedMotion),
      theme: THEMES.find((t) => t === query.get('theme')) ?? 'system',
      path: PATHS.find((p) => p === query.get('path')) ?? 'auto',
      compare: flag('compare', false),
      device: DEVICES.find((d) => d === query.get('device')) ?? 'desktop',
      width: clampInt(query.get('w'), CUSTOM_LIMITS.minWidth, CUSTOM_LIMITS.maxWidth, 390),
      height: clampInt(query.get('h'), CUSTOM_LIMITS.minHeight, CUSTOM_LIMITS.maxHeight, 720),
      showMap: flag('map', false),
      components: flag('components', true),
      reduceMotion: flag('reduceMotion', false),
      reduceTransparency: flag('reduceTransparency', false),
    },
  };
}

/** The scenario as URL keys (only values that differ from the defaults). */
export function queryFromOptions(o: LabOptions, materialId: string, quality: string): URLSearchParams {
  const q = new URLSearchParams();
  const d = optionsFromQuery(new URLSearchParams(), false).options;
  q.set('material', materialId);
  if (quality !== 'balanced') q.set('quality', quality);
  const keys: [keyof LabOptions, string][] = [
    ['mode', 'mode'],
    ['object', 'object'],
    ['nav', 'nav'],
    ['scene', 'scene'],
    ['texture', 'texture'],
    ['theme', 'theme'],
    ['path', 'path'],
    ['device', 'device'],
  ];
  for (const [k, name] of keys) if (o[k] !== d[k]) q.set(name, String(o[k]));
  if (o.device === 'custom') {
    q.set('w', String(o.width));
    q.set('h', String(o.height));
  }
  const flags: [keyof LabOptions, string][] = [
    ['animate', 'animate'],
    ['compare', 'compare'],
    ['showMap', 'map'],
    ['components', 'components'],
    ['reduceMotion', 'reduceMotion'],
    ['reduceTransparency', 'reduceTransparency'],
  ];
  for (const [k, name] of flags) if (o[k] !== d[k] || k === 'animate') q.set(name, o[k] ? '1' : '0');
  return q;
}
