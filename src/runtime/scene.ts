/**
 * Entry point of the WebGL2 backend. The implementation is a separate chunk
 * loaded on the first createSceneView() call: pages that only use DOM
 * materials never download it.
 */

import type { MaterialDocument, TextureSpec } from '../model/document';
import type { SceneView, SceneViewOptions, TextureInput } from './scene-types';

let loaded: Promise<typeof import('./webgl2/scene-view')> | null = null;

/** True once the WebGL2 chunk has been requested (inspection, tests). */
export function sceneBackendLoaded(): boolean {
  return loaded !== null;
}

export async function createSceneView(options: SceneViewOptions): Promise<SceneView> {
  loaded ??= import('./webgl2/scene-view');
  const { WebGLSceneView } = await loaded;
  return new WebGLSceneView(options);
}

/** Cheap probe without keeping a context alive. */
export function probeWebGL2(doc: Document = document): boolean {
  const c = doc.createElement('canvas');
  const gl = c.getContext('webgl2');
  if (!gl) return false;
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return true;
}

/**
 * The texture a document declares, as runtime input. `external` sources and
 * DOM documents have no JSON form: the integrator passes `fallback`.
 */
export function textureFromDocument(
  doc: MaterialDocument,
  resolve: (url: string) => string = (u) => u,
  fallback: TextureInput = { kind: 'pattern', pattern: 'grid', animated: false },
): TextureInput {
  if (doc.source.kind !== 'texture') return fallback;
  const t: TextureSpec = doc.source.texture;
  if (t.kind === 'pattern') return { kind: 'pattern', pattern: t.pattern, animated: t.animated };
  if (t.kind === 'image') return { kind: 'image', url: resolve(t.url) };
  return fallback;
}
