import { describe, expect, it } from 'vitest';
import { parseStudioPreferences } from '../../src/lab/studio-preferences';
import { optionsFromQuery, queryFromOptions } from '../../src/stage/url';
import { decodeState, encodeState } from '../../src/sync/protocol';
import { builtinMaterial } from '../../src/model';

describe('Studio preference recovery', () => {
  it('recovers a usable layout from missing or malformed browser preferences', () => {
    for (const value of [null, [], '', { leftWidth: 'wide', zoom: NaN, area: 'unknown', left: 'no' }]) {
      expect(parseStudioPreferences(value)).toMatchObject({ area: 'editor', zoom: 1, leftWidth: 256, rightWidth: 336, left: true });
    }
  });
  it('bounds saved sizes so stale values cannot make the canvas unreachable', () => {
    expect(parseStudioPreferences({ leftWidth: 50000, rightWidth: -900, zoom: 0 })).toMatchObject({ leftWidth: 360, rightWidth: 300, zoom: .5 });
  });
});

describe('Jello environments retain URL and phone protocol compatibility', () => {
  it('round trips a branded environment without changing the material schema', () => {
    const view = optionsFromQuery(new URLSearchParams('scene=jelly-macro&animate=0&device=tablet'), false).options;
    const material = builtinMaterial('jello')!.doc;
    const query = queryFromOptions(view, material.id, 'balanced');
    expect(optionsFromQuery(query, false).options).toEqual(view);
    const result = decodeState(encodeState({ seq: 1, sentAt: 0, material, view, image: null }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.message.view.scene).toBe('jelly-macro');
      expect(result.message.material).toEqual(material);
    }
  });
});
