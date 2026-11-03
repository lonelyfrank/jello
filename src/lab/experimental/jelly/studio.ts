/**
 * Lazily created singletons of the experimental Jelly lab: the repository, the workbench and
 * the primary preview bridge. Nothing here runs until the Jelly area is opened.
 */
import { useSyncExternalStore } from 'react';
import { openJellyRepository, type JellyRepository } from './repository';
import { JellyWorkbench, type JellyWorkState } from './workbench';
import type { JellyBridge } from './bridge';
import { DEFAULT_ENV, PREVIEW_BACKGROUNDS, PREVIEW_SCALES, PREVIEW_SIZES, type PreviewBackground, type PreviewEnv, type PreviewSize, type PreviewState } from './preview-model';

export interface JellyStudio { workbench: JellyWorkbench; repo: JellyRepository }
let studio: Promise<JellyStudio> | null = null;

export function loadJellyStudio(): Promise<JellyStudio> {
  studio ??= openJellyRepository().then((repo) => {
    const workbench = new JellyWorkbench({ repo });
    // A pending draft must not depend on the user leaving the page politely.
    const flush = () => { void workbench.flushDraft(); };
    addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
    return { workbench, repo };
  });
  return studio;
}

export function useWorkbench<T>(wb: JellyWorkbench, select: (s: JellyWorkState) => T): T {
  return useSyncExternalStore(wb.subscribe, () => select(wb.get()));
}

// ------------------------------------------------------------------ view preferences

export interface JellyView {
  level: 'base' | 'advanced';
  background: PreviewBackground;
  size: PreviewSize;
  scale: number;
  env: PreviewEnv;
  compare: boolean;
  /** Lab-only, never persisted: a forced state must not survive a reload as a surprise. */
  state: PreviewState;
}
const KEY = 'jello-jelly-view-v1';
const defaults: JellyView = { level: 'base', background: 'light', size: 'md', scale: 1, env: { ...DEFAULT_ENV }, compare: false, state: 'live' };

export function parseJellyView(value: unknown): JellyView {
  const p = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const env = p.env && typeof p.env === 'object' ? (p.env as Record<string, unknown>) : {};
  const flag = (k: keyof PreviewEnv) => env[k] === true;
  return {
    level: p.level === 'advanced' ? 'advanced' : 'base',
    background: (PREVIEW_BACKGROUNDS as readonly unknown[]).includes(p.background) ? (p.background as PreviewBackground) : 'light',
    size: (PREVIEW_SIZES as readonly unknown[]).includes(p.size) ? (p.size as PreviewSize) : 'md',
    scale: (PREVIEW_SCALES as readonly unknown[]).includes(p.scale) ? (p.scale as number) : 1,
    env: { reducedMotion: flag('reducedMotion'), svgUnavailable: flag('svgUnavailable'), opaque: flag('opaque'), reducedTransparency: flag('reducedTransparency') },
    compare: p.compare === true,
    state: 'live',
  };
}
function read(): JellyView {
  try { return parseJellyView(JSON.parse(localStorage.getItem(KEY) ?? 'null')); } catch { return { ...defaults, env: { ...DEFAULT_ENV } }; }
}
let view = read();
const viewListeners = new Set<() => void>();
export function setJellyView(patch: Partial<JellyView>): void {
  view = { ...parseJellyView({ ...view, ...patch, env: { ...view.env, ...patch.env } }), state: patch.state ?? view.state };
  try { localStorage.setItem(KEY, JSON.stringify({ ...view, state: undefined })); } catch { /* per-viewer convenience only */ }
  viewListeners.forEach((l) => l());
}
export const jellyView = () => view;
export function useJellyView(): JellyView {
  return useSyncExternalStore((l) => { viewListeners.add(l); return () => { viewListeners.delete(l); }; }, () => view);
}

// ------------------------------------------------------------------ primary preview bridge

let primary: JellyBridge | null = null;
const bridgeListeners = new Set<() => void>();
export function setPrimaryBridge(b: JellyBridge | null): void {
  primary = b;
  bridgeListeners.forEach((l) => l());
}
export const primaryBridge = () => primary;
export function usePrimaryBridge(): JellyBridge | null {
  return useSyncExternalStore((l) => { bridgeListeners.add(l); return () => { bridgeListeners.delete(l); }; }, () => primary);
}
