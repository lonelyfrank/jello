/**
 * Pointer and keyboard bindings. Interaction state is transient and never
 * stored as selection: selection belongs to the semantic control (checked,
 * aria-pressed, value). Hover and focus are left to CSS (:hover,
 * :focus-visible) so the four states stay independent.
 */

import type { GlassSurface } from './surface';

/** What press feedback needs from a surface: any family's surface can be bound. GlassSurface satisfies it. */
export interface PressTarget {
  readonly host: HTMLElement;
  setPressed(pressed: boolean, point?: { x: number; y: number }): void;
}

type Cleanup = () => void;

function on<K extends keyof HTMLElementEventMap>(
  el: HTMLElement,
  type: K,
  fn: (e: HTMLElementEventMap[K]) => void,
  opts?: AddEventListenerOptions,
): Cleanup {
  el.addEventListener(type, fn, opts);
  return () => el.removeEventListener(type, fn, opts);
}

const relative = (el: HTMLElement, e: PointerEvent) => {
  const r = el.getBoundingClientRect();
  return {
    x: r.width ? Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) : 0.5,
    y: r.height ? Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) : 0.5,
  };
};

const PRESS_KEYS = new Set([' ', 'Enter']);

/**
 * Press feedback for a control. No pointer capture: a native button must
 * still cancel its click when the pointer is released outside.
 */
export function bindPress(surface: PressTarget, el: HTMLElement = surface.host): Cleanup {
  let pointer: number | null = null;
  const release = () => {
    pointer = null;
    surface.setPressed(false);
  };
  const offs = [
    on(el, 'pointerdown', (e) => {
      if (!e.isPrimary || e.button !== 0) return;
      if ((e.target as Element).closest(':disabled, [aria-disabled="true"]')) return;
      pointer = e.pointerId;
      surface.setPressed(true, relative(el, e));
    }),
    on(el, 'pointermove', (e) => {
      if (e.pointerId === pointer) surface.setPressed(true, relative(el, e));
    }),
    on(el, 'pointerup', release),
    on(el, 'pointercancel', release),
    on(el, 'pointerleave', release),
    on(el, 'lostpointercapture', release),
    on(el, 'keydown', (e) => {
      if (PRESS_KEYS.has(e.key) && !e.repeat) surface.setPressed(true, { x: 0.5, y: 0.5 });
    }),
    on(el, 'keyup', (e) => {
      if (PRESS_KEYS.has(e.key)) release();
    }),
    // Focus moving between controls inside the host (a tab bar) is not the end of a press.
    on(el, 'focusout', (e) => {
      if (!el.contains(e.relatedTarget as Node | null)) release();
    }),
  ];
  return () => {
    offs.forEach((off) => off());
    release();
  };
}

export interface DragOptions {
  /** Size of the area the surface can move in (its offset parent). */
  bounds: () => { width: number; height: number };
  onMove?: (x: number, y: number) => void;
  keyboardStep?: number;
}

/**
 * Dragging a free surface. Only the surface has `touch-action: none` (set in
 * glass.css), so the rest of the page keeps scrolling. Pointer capture keeps
 * the gesture while the finger leaves the lens; every way a gesture can end
 * (up, cancel, lost capture, blur, hidden page) clears the state.
 */
export function bindDrag(surface: GlassSurface, options: DragOptions): Cleanup {
  const el = surface.host;
  let pointer: number | null = null;
  let offset = { x: 0, y: 0 };
  let origin = { x: 0, y: 0 };

  const clampTo = (x: number, y: number) => {
    const b = options.bounds();
    const p = surface.getParams();
    return {
      x: Math.min(Math.max(0, x), Math.max(0, b.width - p.width)),
      y: Math.min(Math.max(0, y), Math.max(0, b.height - p.height)),
    };
  };
  const moveTo = (x: number, y: number, immediate = false) => {
    const c = clampTo(x, y);
    surface.setPosition(c.x, c.y, immediate);
    options.onMove?.(c.x, c.y);
  };
  const end = () => {
    if (pointer !== null && el.hasPointerCapture?.(pointer)) el.releasePointerCapture(pointer);
    pointer = null;
    el.removeAttribute('data-dragging');
    surface.setPressed(false);
  };

  const offs = [
    on(el, 'pointerdown', (e) => {
      if (!e.isPrimary || e.button !== 0 || pointer !== null) return;
      const parent = (el.offsetParent as HTMLElement | null) ?? el.parentElement;
      const pr = parent?.getBoundingClientRect() ?? { left: 0, top: 0 };
      origin = { x: pr.left, y: pr.top };
      const pos = surface.position;
      offset = { x: e.clientX - origin.x - pos.x, y: e.clientY - origin.y - pos.y };
      pointer = e.pointerId;
      el.setPointerCapture(e.pointerId);
      el.setAttribute('data-dragging', '');
      surface.setPressed(true, relative(el, e));
      e.preventDefault();
    }),
    on(el, 'pointermove', (e) => {
      if (e.pointerId !== pointer) return;
      moveTo(e.clientX - origin.x - offset.x, e.clientY - origin.y - offset.y);
      surface.setPressed(true, relative(el, e));
    }),
    on(el, 'pointerup', (e) => e.pointerId === pointer && end()),
    on(el, 'pointercancel', (e) => e.pointerId === pointer && end()),
    on(el, 'lostpointercapture', (e) => e.pointerId === pointer && end()),
    on(el, 'keydown', (e) => {
      const step = (options.keyboardStep ?? 8) * (e.shiftKey ? 4 : 1);
      const d: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };
      const v = d[e.key];
      if (!v) return;
      e.preventDefault();
      const pos = surface.position;
      moveTo(pos.x + v[0], pos.y + v[1]);
    }),
  ];
  const win = el.ownerDocument.defaultView;
  const hidden = () => end();
  win?.addEventListener('blur', hidden);
  el.ownerDocument.addEventListener('visibilitychange', hidden);
  return () => {
    offs.forEach((off) => off());
    win?.removeEventListener('blur', hidden);
    el.ownerDocument.removeEventListener('visibilitychange', hidden);
    end();
  };
}
