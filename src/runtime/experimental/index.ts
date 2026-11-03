/**
 * Entry of the EXPERIMENTAL Jelly runtime bundle (dist-jelly). Nothing but re-exports of the
 * modules the Studio preview itself runs: the export package ships these exact sources, built
 * separately, and no alternative renderer. Not part of src/runtime/index.ts, never reachable
 * from the production library (tests/unit/boundaries.test.ts).
 */
export { attachExperimentalJelly, ExperimentalJellySurface } from './jelly';
export type { JellyRenderOptions, JellyRenderStatus } from './jelly';
export { bindJellyInput } from './jelly-input';
export { createJellyCoordinator, JellyCoordinator } from './jelly-scheduler';
export { parseExperimentalJelly, parseExperimentalJellyText, serializeExperimentalJelly, JELLY_PARAMS } from '../../model/experimental/jelly';
