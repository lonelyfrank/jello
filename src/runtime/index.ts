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
export { BottomNavigation, createBottomNavigation } from './bottom-navigation';
export type { BottomNavigationEvent, BottomNavigationOptions, BottomNavigationStatus, PreviewState } from './bottom-navigation';
export { createSceneView, probeWebGL2, sceneBackendLoaded, textureFromDocument } from './scene';
export type { SceneStatus, SceneUpdate, SceneView, SceneViewOptions, Stat, TextureInput } from './scene-types';
export { bindDrag, bindPress, type DragOptions } from '../core/interaction';
export { GlassContext, type ContextStatus, type GlassContextOptions } from '../core/context';
export type { GlassSurface, Rect, Sizing } from '../core/surface';
export { detectCapabilities, parseEngine, resolvePath, findVerification } from '../core/renderer/capabilities';
export type { Capabilities, EngineInfo, PathRequest, RenderPath, VerificationRecord } from '../core/renderer/capabilities';
export { PARAMS, PARAM_INDEX, defaultParams, type GlassParams, type ParamKey, type ParamStage, type ParamDescriptor } from '../core/params';
export { computeLensMap, geometryKey, type LensGeometry, type LensMap } from '../core/geometry';
