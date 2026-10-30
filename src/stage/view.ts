/**
 * What the preview shows and how. Shared by the lab dashboard, the phone
 * preview page and the sync protocol; not part of the material document.
 */

import type { SceneId } from './scenes';

export type PreviewMode = 'components' | 'scene';
export type ObjectKind = 'capsule' | 'navbar' | 'button' | 'card' | 'dialog';
export type DeviceKind = 'desktop' | 'tablet' | 'phone' | 'custom';
export type TextureChoice = 'pattern' | 'image';

export const OBJECTS: readonly { id: ObjectKind; label: string }[] = [
  { id: 'capsule', label: 'Capsula' },
  { id: 'navbar', label: 'Navbar' },
  { id: 'button', label: 'Pulsante' },
  { id: 'card', label: 'Card' },
  { id: 'dialog', label: 'Pannello' },
];

/** Tabs of the demo navbar: the generic Bottom Navigation template (src/components/document.ts). */
export const NAV_ITEMS = [
  { id: 'home', label: 'Home' },
  { id: 'explore', label: 'Explore' },
  { id: 'profile', label: 'Profile' },
] as const;

export type NavId = (typeof NAV_ITEMS)[number]['id'];

export interface ViewOptions {
  /** Real DOM components (CSS/SVG) or a controlled scene (WebGL2 texture). */
  mode: PreviewMode;
  object: ObjectKind;
  nav: NavId;
  scene: SceneId;
  /** Texture of the controlled scene. */
  texture: TextureChoice;
  animate: boolean;
  theme: 'system' | 'light' | 'dark';
  path: 'auto' | 'refraction' | 'satin' | 'opaque';
  compare: boolean;
  /** Preview frame: full width, a 768 px tablet or 390 px phone column, or width × height. */
  device: DeviceKind;
  width: number;
  height: number;
  showMap: boolean;
  components: boolean;
  reduceMotion: boolean;
  reduceTransparency: boolean;
}

export const PATHS = ['auto', 'refraction', 'satin', 'opaque'] as const;
export const THEMES = ['light', 'dark'] as const;
export const DEVICES = ['desktop', 'tablet', 'phone', 'custom'] as const;
export const MODES = ['components', 'scene'] as const;
export const TEXTURES = ['pattern', 'image'] as const;

export const CUSTOM_LIMITS = { minWidth: 240, maxWidth: 1600, minHeight: 240, maxHeight: 1200 } as const;

export const isNav = (v: string | null): v is NavId => NAV_ITEMS.some((n) => n.id === v);
export const isObject = (v: string | null): v is ObjectKind => OBJECTS.some((o) => o.id === v);

/** Objects that are sized by CSS layout, not by geometry.width/height. */
export const layoutSized = (o: ObjectKind) => o !== 'capsule';
