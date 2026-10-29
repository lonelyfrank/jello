import type { VerificationRecord } from '../core';

/**
 * Raster verification records written by the Playwright suite
 * (tests/e2e/raster.spec.ts → verification/<engine>.json) and committed.
 * They describe the engine/version that passed, never the visitor's device.
 */
const files = import.meta.glob<VerificationRecord>('../../verification/*.json', { eager: true, import: 'default' });

export const VERIFICATION: readonly VerificationRecord[] = Object.values(files).filter(
  (r): r is VerificationRecord => typeof r === 'object' && r !== null && typeof r.engine === 'string',
);
