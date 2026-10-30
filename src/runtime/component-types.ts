/**
 * What every DOM component the runtime renders has in common, so the lab's
 * stage, the selection overlay and the exported wrappers work with a
 * component without knowing which type it is. `BottomNavigation` and
 * `JelloButton` implement it; navbar-only operations (active tab, scroller)
 * stay on `BottomNavigation`.
 */
import type { GlassSurface } from '../core/surface';
import type { ComponentDefinition, DefinitionType, UnsupportedProperty } from '../components';
import type { MaterialStatusBase } from './material-types';
import type { BoundSurface } from './surface-binding';

/** A state shown without input (the editor's «anteprima stato»). */
export type PreviewState = 'hover' | 'pressed' | 'focus' | 'active' | 'disabled';

export interface ComponentStatus {
  type: DefinitionType;
  /** Family of the material drawing the component right now. */
  family: string;
  material: MaterialStatusBase;
  /** Breakpoint in effect, or null. */
  breakpoint: string | null;
  /** Why the component is not drawn as described, in plain language. */
  reasons: string[];
  /** Described properties that have no effect on this material (with the reason). */
  unsupported: readonly UnsupportedProperty[];
}

export interface ComponentInstance {
  readonly type: DefinitionType;
  readonly host: HTMLElement;
  readonly component: ComponentDefinition;
  readonly mounted: boolean;
  readonly status: ComponentStatus;
  /** The Glass surface while the material is Glass (lens geometry, frames…), else null. */
  readonly glassSurface: GlassSurface | null;
  readonly materialSurface: BoundSurface | null;
  /** Shows the component and attaches its surface. Idempotent. */
  mount(): void;
  /** Releases the surface and every listener; hides the component. */
  unmount(): void;
  /** New definition of the same component. The material may change family. */
  update(config: ComponentDefinition): void;
  /** False: pointer and keyboard input are ignored (the editor's selection mode). */
  setInteractive(on: boolean): void;
  /** Shows a state on the node `target` without input. null clears it. */
  previewState(target: string | null, state: PreviewState | null): void;
  /** Element of the root (`root`) or of a node, for hosts that highlight or measure it. */
  elementFor(id: string): HTMLElement | null;
  /** Id of the node under `target` (`root` when it is none). */
  nodeAt(target: EventTarget | null): string;
  destroy(): void;
}
