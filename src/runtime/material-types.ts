/**
 * What every family's DOM renderer has in common. A component that only needs
 * lifecycle, status and press feedback can be written against these; family
 * specifics (Glass backends, Solid states) stay on the family's own group.
 */
import type { MaterialDocument } from '../model/document';

/** Implemented by GlassSurface and SolidSurface. */
export interface MaterialSurface {
  readonly host: HTMLElement;
  setPressed(pressed: boolean, point?: { x: number; y: number }): void;
}

export interface MaterialStatusBase {
  suspended: boolean;
  motionReduced: boolean;
  /** Why the renderer is not doing what was asked, in plain language. Empty when it is. */
  reasons: string[];
}

/** Lifecycle shared by GlassGroup and SolidGroup. */
export interface BaseMaterialGroup {
  readonly material: MaterialDocument;
  readonly status: MaterialStatusBase;
  onStatus(listener: (s: MaterialStatusBase) => void): () => void;
  invalidate(): void;
  suspend(): void;
  resume(): void;
  destroy(): void;
}
