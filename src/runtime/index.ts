/**
 * Jello runtime: the public API shared by the lab preview, the phone preview
 * and consumer projects. Framework-independent. It must never import the
 * editor (src/lab), lab storage, the sync relay or React: the boundary is
 * checked by tests/unit/boundaries.test.ts.
 *
 *   import { createGlassGroup, parseMaterialText } from '@jello/runtime';
 *   import '@jello/runtime/jello.css';
 */
import '../core/glass.css';

export * from '../model';
export * from '../components';
export { createGlassGroup, engineParams, GlassGroup } from './glass-group';
export type { AttachOptions, GlassGroupOptions, GroupStatus, UpdateReport } from './glass-group';
export { createMaterialGroup, materialRuntime, type MaterialGroup, type MaterialGroupOptions, type MaterialRuntime } from './materials';
export type { BaseMaterialGroup, MaterialStatusBase, MaterialSurface } from './material-types';
export { createSolidGroup, SolidGroup, SolidSurface, supportsColorMix } from './solid-group';
export type { SolidAttachOptions, SolidGroupOptions, SolidStatus, SolidUpdateReport } from './solid-group';
export { MaterialBinding } from './surface-binding';
export type { BoundSurface, MaterialBindingOptions, Radius } from './surface-binding';
export { BottomNavigation, createBottomNavigation } from './bottom-navigation';
export type { BottomNavigationEvent, BottomNavigationOptions, BottomNavigationStatus, NavbarActionEvent } from './bottom-navigation';
export { DesktopNavigation } from './desktop-navigation';
export type { DesktopNavigationOptions, DesktopNavigationEvent, DesktopNavigationActionEvent, DesktopNavigationStatus } from './desktop-navigation';
export { JelloButton, createButton } from './button';
export type { ButtonEvent, ButtonStatus, JelloButtonOptions } from './button';
export type { ComponentInstance, ComponentStatus, PreviewState } from './component-types';
export { componentRuntime, componentRuntimes, createComponent, mountComponent } from './components';
export type { ComponentRuntime } from './components';
export { createSceneView, probeWebGL2, sceneBackendLoaded, textureFromDocument } from './scene';
export type { SceneStatus, SceneUpdate, SceneView, SceneViewOptions, Stat, TextureInput } from './scene-types';
export { bindDrag, bindPress, type DragOptions, type PressTarget } from '../core/interaction';
export { GlassContext, type ContextStatus, type GlassContextOptions } from '../core/context';
export type { GlassSurface, Rect, Sizing } from '../core/surface';
export { detectCapabilities, parseEngine, resolvePath, findVerification } from '../core/renderer/capabilities';
export type { Capabilities, EngineInfo, PathRequest, RenderPath, VerificationRecord } from '../core/renderer/capabilities';
export { PARAMS, PARAM_INDEX, defaultParams, type GlassParams, type ParamKey, type ParamStage, type ParamDescriptor } from '../core/params';
export { computeLensMap, geometryKey, type LensGeometry, type LensMap } from '../core/geometry';
