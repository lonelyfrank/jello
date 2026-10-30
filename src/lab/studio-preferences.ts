/** Editor-only preferences. Never included in a material, component or project backup. */
import { useSyncExternalStore } from 'react';

export interface StudioPreferences {
  area: 'editor' | 'library' | 'preview';
  zoom: number;
  leftWidth: number;
  rightWidth: number;
  left: boolean;
  right: boolean;
  builderPane: 'all' | 'layers' | 'components' | 'assets';
  inspectorTab: 'all' | 'design' | 'interactions' | 'advanced';
}

const KEY = 'jello-studio-preferences-v1';
const defaults: StudioPreferences = { area: 'editor', zoom: 1, leftWidth: 256, rightWidth: 336, left: true, right: true, builderPane: 'all', inspectorTab: 'all' };
export function parseStudioPreferences(value: unknown): StudioPreferences {
  const p = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const number = (key: string, min: number, max: number, fallback: number) => typeof p[key] === 'number' && Number.isFinite(p[key]) ? Math.min(max, Math.max(min, p[key] as number)) : fallback;
  return {
    area: p.area === 'library' || p.area === 'preview' ? p.area : 'editor',
    zoom: number('zoom', .5, 1.5, 1),
    leftWidth: number('leftWidth', 224, 360, 256),
    rightWidth: number('rightWidth', 300, 440, 336),
    left: typeof p.left === 'boolean' ? p.left : true,
    right: typeof p.right === 'boolean' ? p.right : true,
    builderPane: p.builderPane === 'layers' || p.builderPane === 'components' || p.builderPane === 'assets' ? p.builderPane : 'all',
    inspectorTab: p.inspectorTab === 'design' || p.inspectorTab === 'interactions' || p.inspectorTab === 'advanced' ? p.inspectorTab : 'all',
  };
}
function read(): StudioPreferences {
  try { return parseStudioPreferences(JSON.parse(localStorage.getItem(KEY) ?? 'null')); } catch { return { ...defaults }; }
}
let state = read();
// Explicit scenarios continue to open their editor, regardless of the previous Studio area.
if (typeof location !== 'undefined' && location.search) {
  const studio = new URLSearchParams(location.search).get('studio');
  state = { ...state, area: studio === 'library' || studio === 'preview' ? studio : 'editor' };
}
const listeners = new Set<() => void>();
export function setStudioPreferences(patch: Partial<StudioPreferences>) {
  state = parseStudioPreferences({ ...state, ...patch });
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* Preferences are optional; IndexedDB reports document persistence independently. */ }
  listeners.forEach((listener) => listener());
}
export function studioPreferences() { return state; }
export function useStudioPreferences() {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => state);
}
