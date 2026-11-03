/**
 * M6.4.2: the WebGL2 scene backend is a separate chunk loaded on the first createSceneView() call (public runtime API).
 * A failed load (offline, a blocked request) must not be remembered: the next call tries again.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const CHUNK = '../../src/runtime/webgl2/scene-view';

afterEach(() => {
  vi.doUnmock(CHUNK);
  vi.resetModules();
});

describe('createSceneView · chunk loading', () => {
  it('a failed chunk load is reported, is not cached, and the next call succeeds', async () => {
    vi.resetModules();
    vi.doMock(CHUNK, () => {
      throw new Error('Failed to fetch dynamically imported module');
    });
    const scene = await import('../../src/runtime/scene');
    await expect(scene.createSceneView({} as never)).rejects.toThrow();
    expect(scene.sceneBackendLoaded()).toBe(false); // nothing is loaded, and no rejected promise is kept as if it were

    vi.doUnmock(CHUNK);
    vi.doMock(CHUNK, () => ({ WebGLSceneView: class { constructor(readonly options: unknown) {} } }));
    const view = (await scene.createSceneView({ marker: 1 } as never)) as unknown as { options: unknown };
    expect(view.options).toEqual({ marker: 1 });
    expect(scene.sceneBackendLoaded()).toBe(true);
  });

  it('concurrent first calls share one load', async () => {
    vi.resetModules();
    let loads = 0;
    vi.doMock(CHUNK, () => {
      loads++;
      return { WebGLSceneView: class { constructor(readonly options: unknown) {} } };
    });
    const scene = await import('../../src/runtime/scene');
    await Promise.all([scene.createSceneView({ a: 1 } as never), scene.createSceneView({ b: 2 } as never)]);
    expect(loads).toBe(1);
  });
});
