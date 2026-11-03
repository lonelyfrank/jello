/**
 * Display names of the experimental Jello presets (technical family id `jelly`). Kept apart from ./names.ts so the
 * exportable runtime never carries them; the experimental documents themselves keep their persisted technical names
 * («Jelly Soft»…), these are presentation only.
 */
export const JELLO_PRESET_NAMES = {
  'jelly-soft': 'Jello · Soft',
  'jelly-clear': 'Jello · Clear',
  'jelly-candy': 'Jello · Candy',
  'jelly-dense': 'Jello · Dense',
} as const;
