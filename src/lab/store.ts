/**
 * Lab state, outside React. React components read slices through
 * useLab(); the preview controller is driven by LabSession, never by React
 * renders.
 */

import { useSyncExternalStore } from 'react';
import type { MaterialDocument } from '../model';
import type { ComponentDocument } from '../components/document';
import type { PreviewState } from '../runtime/bottom-navigation';
import type { PreviewReport } from '../stage/controller';
import type { ViewOptions } from '../stage/view';
import type { SaveState } from './storage/autosave';
import type { SyncState } from './sync-sender';

export interface LibraryItem {
  id: string;
  name: string;
  origin: 'builtin' | 'user';
  doc: MaterialDocument;
  approximation: boolean;
  note: string;
  updatedAt: string | null;
}

export interface Messages {
  ok: boolean;
  messages: string[];
}

export interface ComponentItem {
  id: string;
  name: string;
  /** Templates live in code and are read-only; user components are stored (IndexedDB). */
  origin: 'template' | 'user';
  doc: ComponentDocument;
  description: string;
  updatedAt: string | null;
}

export type Workspace = 'material' | 'builder';

export interface BuilderState {
  doc: ComponentDocument;
  /** Template id or user component id. */
  componentId: string;
  origin: 'template' | 'user';
  /** Template edited in place: a draft of the project until saved in the library. */
  modified: boolean;
  /** `root`, a tab id, or `material`. */
  selection: string;
  /** Tab shown as active in the preview (the document's default is root.defaultTab). */
  previewTab: string;
  previewState: PreviewState | null;
  /** Selection mode: clicks in the preview select elements instead of activating them. */
  pick: boolean;
  messages: Messages | null;
}

export interface LabState {
  doc: MaterialDocument;
  /** Library entry being edited. */
  materialId: string;
  origin: 'builtin' | 'user';
  /** Built-in edited in place: lives in the project draft until saved as a copy. */
  modified: boolean;
  options: ViewOptions;
  library: LibraryItem[];
  librarySkipped: string[];
  save: SaveState;
  persistent: boolean;
  storageNote: string | null;
  report: PreviewReport | null;
  importMessages: Messages | null;
  exportText: string;
  notice: { text: string; undo: boolean } | null;
  sync: SyncState;
  layout: { left: boolean; right: boolean; drawer: boolean };
  workspace: Workspace;
  builder: BuilderState;
  components: ComponentItem[];
  componentsSkipped: string[];
  exportOpen: boolean;
}

type Listener = () => void;

export class Store {
  private state: LabState;
  private readonly listeners = new Set<Listener>();

  constructor(initial: LabState) {
    this.state = initial;
  }

  get = (): LabState => this.state;

  set(patch: Partial<LabState> | ((s: LabState) => Partial<LabState>)): void {
    const p = typeof patch === 'function' ? patch(this.state) : patch;
    this.state = { ...this.state, ...p };
    for (const l of this.listeners) l();
  }

  subscribe = (l: Listener): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
}

let current: Store | null = null;

export function bindStore(s: Store): void {
  current = s;
}

export function useLab<T>(select: (s: LabState) => T): T {
  const store = current!;
  return useSyncExternalStore(store.subscribe, () => select(store.get()));
}
