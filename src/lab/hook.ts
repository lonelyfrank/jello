/**
 * window.__jello: inspection hook for tests and manual debugging. Same shape
 * as in the first milestones (tests/e2e/helpers.ts → LabHook), plus the
 * material, library, storage, export and scene-view entries.
 */

import type { GlassParams } from '../core/params';
import { glassParams } from '../model';
import { createSceneView, sceneBackendLoaded } from '../runtime/scene';
import type { NavId, ViewOptions } from '../stage/view';
import type { LabSession } from './session';

declare global {
  interface Window {
    __jello: unknown;
  }
}

export function installHook(session: LabSession): void {
  const c = () => session.controller!;
  const main = () => c().main;
  const compare = () => c().compare;
  window.__jello = {
    get params(): GlassParams {
      return glassParams(session.state.doc);
    },
    setParams: (patch: Partial<GlassParams>) => session.setParams(patch),
    setOption: <K extends keyof ViewOptions>(key: K, value: ViewOptions[K]) => session.setOption(key, value),
    options: () => ({ ...session.state.options }),
    stats: () => main().ctx.stats,
    compareStats: () => compare()?.ctx.stats ?? null,
    status: () => main().ctx.status,
    compareStatus: () => compare()?.ctx.status ?? null,
    groupStatus: () => main().group.status,
    lenses: () => ({
      main: main().ctx.renderer.lensIds,
      compare: compare()?.ctx.renderer.lensIds ?? null,
      active: main().surface?.id ?? null,
      activeCompare: compare()?.surface?.id ?? null,
      components: c().dockSurfaces.map((s) => s.id),
    }),
    map: () => {
      const m = c().inspectMap();
      return m ? { surface: m.surface, object: m.object, key: m.key, inUse: m.inUse } : null;
    },
    capsule: {
      get position() {
        return c().capsulePosition;
      },
      get rect() {
        return main().capsule?.rect ?? null;
      },
      get frames() {
        return main().capsule?.frames ?? 0;
      },
      get animating() {
        return main().capsule?.animating ?? false;
      },
      get pressed() {
        return main().capsule?.isPressed ?? false;
      },
      setPosition: (x: number, y: number, immediate = true) => c().setCapsulePosition(x, y, immediate),
    },
    navbar: {
      get rect() {
        return main().navbar.surface?.rect ?? null;
      },
      get frames() {
        return main().navbar.surface?.frames ?? 0;
      },
      get selected(): NavId {
        return main().navbar.selected;
      },
      get compareSelected(): NavId | null {
        return compare()?.navbar.selected ?? null;
      },
      get pressedItem() {
        return main().navbar.pressed;
      },
      get pressed() {
        return main().navbar.surface?.isPressed ?? false;
      },
    },
    componentRects: () => c().dockSurfaces.map((s) => s.rect),
    filterId: () => main().ctx.renderer.id,
    measure: (ms?: number) => c().measure(ms),
    // ---- material lab ----
    material: () => session.state.doc,
    materialId: () => session.state.materialId,
    origin: () => session.state.origin,
    modified: () => session.state.modified,
    library: () => session.state.library.map((i) => ({ id: i.id, name: i.name, origin: i.origin })),
    save: () => session.state.save,
    flush: () => session.saveNow(),
    open: (id: string) => session.openMaterial(id),
    duplicate: () => session.duplicate(),
    newMaterial: () => session.newMaterial(),
    rename: (name: string) => session.rename(name),
    remove: (id: string) => session.deleteMaterial(id),
    importText: (text: string) => session.importText(text),
    exportJson: () => session.exportJson(),
    exportLegacy: () => session.exportLegacy(),
    setBackend: (b: Parameters<LabSession['setBackend']>[0]) => session.setBackend(b),
    setQuality: (q: Parameters<LabSession['setQuality']>[0]) => session.setQuality(q),
    scenarioUrl: () => session.scenarioUrl(),
    // ---- component builder ----
    workspace: () => session.state.workspace,
    setWorkspace: (w: 'material' | 'builder') => session.setWorkspace(w),
    builder: {
      get doc() {
        return session.state.builder.doc;
      },
      get state() {
        const b = session.state.builder;
        return { componentId: b.componentId, origin: b.origin, modified: b.modified, selection: b.selection, previewTab: b.previewTab, previewState: b.previewState, pick: b.pick };
      },
      components: () => session.state.components.map((c) => ({ id: c.id, name: c.name, origin: c.origin })),
      /** The component mounted in the preview (the runtime's BottomNavigation). */
      get nav() {
        const n = c().component;
        return n ? { active: n.activeTab, mounted: n.mounted, status: n.status, tabs: [...n.host.querySelectorAll<HTMLElement>('.jello-bnav-tab')].map((t) => t.dataset.tab) } : null;
      },
      select: (id: string) => session.selectElement(id),
      addTab: () => session.addTab(),
      setField: (path: string, value: unknown) => session.setComponentField(path, value),
      setParam: (key: keyof GlassParams, value: never) => session.setComponentParam(key, value),
      open: (id: string) => session.openComponent(id),
      save: () => session.saveComponent(),
      json: () => session.componentJson(),
      exportWith: (id: string) => session.exportWith(id),
    },
    report: () => c().report(),
    /** Same runtime entry a consumer imports (diagnostics: shader errors, extra views). */
    createSceneView,
    scene: {
      get loaded() {
        return sceneBackendLoaded();
      },
      get status() {
        return c().scene?.status ?? null;
      },
      get view() {
        return c().scene?.sceneView ?? null;
      },
      get fallback() {
        return c().scene?.usingFallback ?? false;
      },
    },
  };
}
