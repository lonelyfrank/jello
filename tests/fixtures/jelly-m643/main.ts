/** M6.4.3 comparison harness. Development/test entry only; never part of a production input.
 * Every cell is the REAL ExperimentalJellySurface driven by an injected clock (no native RAF, no alternate renderer). */
import { initJellyMotion, evolveJellyMotion, pressJellyMotion } from '../../../src/model/experimental/jelly-motion';
import type { JellyExperimentalDocument } from '../../../src/model/experimental/jelly';
import { attachExperimentalJelly, type ExperimentalJellySurface, type JellyRenderOptions } from '../../../src/runtime/experimental/jelly';
import { JellyCoordinator } from '../../../src/runtime/experimental/jelly-scheduler';
import { baselineDoc, normalized, withParams, PRESET_IDS } from './variants';
import * as variants from './variants';
import './style.css';

export type StateName = `t${number}` | 'idle' | 'hover' | 'press' | 'hold' | 'release' | 'rebound' | 'rest' | 'disabled';
export const HOLD_MS = 600;
export interface CellSpec {
  label?: string; doc: JellyExperimentalDocument; options?: JellyRenderOptions | undefined;
  w: number; h: number; bg: 'light' | 'dark' | 'gradient' | 'text' | 'structured';
  state: StateName; hideContent?: boolean; contact?: { x: number; y: number };
}
const PAD = 28;
const LOREM = 'Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua ut enim ad minim veniam quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur '.repeat(8);

/** Time of the deepest opposite-side excursion after release, from the same pure oscillator the surface uses. */
function reboundTime(doc: JellyExperimentalDocument): number {
  let s = pressJellyMotion(initJellyMotion(doc.behavior, 0), true, 0);
  s = evolveJellyMotion(s, HOLD_MS);
  s = pressJellyMotion(s, false, HOLD_MS);
  let best = 0, at = 140;
  for (let t = HOLD_MS + 1; t <= HOLD_MS + 1500; t++) { s = evolveJellyMotion(s, t); if (-s.x > best) { best = -s.x; at = t - HOLD_MS; } }
  return best > 1e-4 ? at : 140; // presets with no measurable rebound: a fixed point on the return path
}

interface Mounted { spec: CellSpec; surface: ExperimentalJellySurface; clock: JellyCoordinator; host: HTMLButtonElement; cell: HTMLElement }
let mounted: Mounted[] = [];
const stage = document.getElementById('stage')!;

function mountCell(spec: CellSpec): Mounted {
  const cell = document.createElement('div');
  cell.className = `cell bg-${spec.bg}${spec.hideContent ? ' hide-content' : ''}`;
  cell.style.width = `${spec.w + 2 * PAD}px`; cell.style.height = `${spec.h + 2 * PAD}px`;
  if (spec.bg === 'text') { const copy = document.createElement('div'); copy.className = 'copy'; copy.textContent = LOREM; cell.append(copy); }
  const host = document.createElement('button');
  host.type = 'button'; host.className = 'jb';
  host.style.width = `${spec.w}px`; host.style.height = `${spec.h}px`;
  host.style.borderRadius = '16px';
  host.style.fontSize = spec.h < 40 ? '12px' : spec.h > 70 ? '18px' : '14px';
  host.innerHTML = '<span class="content"><svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24"><path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z" fill="none" stroke="currentColor" stroke-width="2"/></svg><span>Jelly</span></span>';
  cell.append(host);
  if (spec.label) { const l = document.createElement('span'); l.className = 'label'; l.textContent = spec.label; cell.append(l); }
  stage.append(cell);
  let t = 0; let id = 0; const cbs = new Map<number, (time: number) => void>();
  const clock = new JellyCoordinator({ now: () => t, request: (cb) => { cbs.set(++id, cb); return id; }, cancel: (k) => { cbs.delete(k); } });
  const advance = (next: number) => { t = next; const batch = [...cbs.values()]; cbs.clear(); batch.forEach((cb) => cb(t)); };
  const surface = attachExperimentalJelly(host, spec.doc, spec.options ?? {}, clock);
  const contact = spec.contact ?? { x: 0.5, y: 0.5 };
  const hold = () => { surface.setPressed(true, contact); advance(70); advance(HOLD_MS); };
  switch (spec.state) {
    case 'idle': break;
    case 'hover': surface.setHovered(true); break;
    case 'press': surface.setPressed(true, contact); advance(70); break;
    case 'hold': hold(); break;
    case 'release': hold(); surface.setPressed(false); advance(HOLD_MS + 60); break;
    case 'rebound': hold(); surface.setPressed(false); advance(HOLD_MS + reboundTime(spec.doc)); break;
    case 'rest': hold(); surface.setPressed(false); advance(HOLD_MS + 4000); advance(HOLD_MS + 4016); break;
    case 'disabled': host.disabled = true; surface.setDisabled(true); break;
    default: { // `t<ms>`: pressed at 0, released at HOLD_MS, observed at <ms> after the press
      const at = Number(spec.state.slice(1));
      surface.setPressed(true, contact);
      if (at <= HOLD_MS) advance(at); else { advance(HOLD_MS); surface.setPressed(false); advance(at); }
    }
  }
  return { spec, surface, clock, host, cell };
}

function destroyAll() { for (const m of mounted) { m.surface.destroy(); m.clock.destroy(); m.cell.remove(); } mounted = []; }
function mount(cells: CellSpec[], columns: number) {
  destroyAll();
  stage.style.gridTemplateColumns = `repeat(${columns}, max-content)`;
  mounted = cells.map(mountCell);
  return mounted.map((m) => ({ ...m.spec, doc: undefined, status: m.surface.status, motion: m.surface.motion }));
}
const api = { mount, destroyAll, baselineDoc, normalized, withParams, variants, PRESET_IDS, reboundTime, get mounted() { return mounted; } };
declare global { interface Window { m643: typeof api } }
window.m643 = api;
