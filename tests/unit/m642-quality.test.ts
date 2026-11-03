/**
 * M6.4.2: small invariants behind defects found by the quality gate (docs/m642/audit-baseline.md).
 */
import { describe, expect, it } from 'vitest';
import { FAMILIES } from '../../src/model/families';
import { catalogEntry } from '../../src/model/catalog';
import { KIT_PRESETS } from '../../src/lab/projects';
import { isDiagnosticId } from '../../src/lab/app/catalog-ui';

describe('M642-03 · the new-project kit is made of designer-facing materials', () => {
  it('copies only catalog presets of a stable family, never a diagnostic configuration', () => {
    for (const id of KIT_PRESETS) {
      const entry = catalogEntry(id);
      expect(entry, `${id} must be a catalog preset`).toBeDefined();
      expect(entry!.kind, `${id} must be a material preset`).toBe('material-preset');
      expect(entry!.availability, `${id} must be available`).toBe('available');
      expect(isDiagnosticId(id)).toBe(false);
    }
  });
  it('keeps Refraction Test out of the kit by id (it stays a built-in configuration, reachable in advanced mode)', () => {
    expect([...KIT_PRESETS]).not.toContain('optics');
    expect(isDiagnosticId('optics')).toBe(true);
  });
});

describe('M642-10 · family metadata says what the Studio does', () => {
  it('every available family is editable in the Material Lab; the planned one is not', () => {
    for (const f of FAMILIES) expect(f.editor, f.id).toBe(f.status === 'available');
  });
});

describe('§4.1 · layout reset', () => {
  it('restores widths, closed panels, panes and zoom, and keeps the area and the diagnostics choice', async () => {
    const prefs = await import('../../src/lab/studio-preferences');
    prefs.setStudioPreferences({ leftWidth: 360, rightWidth: 440, left: false, right: false, builderPane: 'assets', inspectorTab: 'advanced', zoom: 1.5, diagnostics: true, area: 'library' });
    prefs.resetLayoutPreferences();
    expect(prefs.studioPreferences()).toEqual({ area: 'library', diagnostics: true, zoom: 1, leftWidth: 256, rightWidth: 336, left: true, right: true, builderPane: 'all', inspectorTab: 'all' });
  });
});
