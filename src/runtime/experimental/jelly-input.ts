/** Optional DOM input adapter; owns feedback only. Native click/scroll/key semantics
 * remain with the component. No pointer capture, synthetic clicks or preventDefault.
 */
import { jellyContact, type JellyContact } from '../../model/experimental/jelly-visual';
export interface JellyPressReceiver {
  setPressed(pressed: boolean, point?: JellyContact): void;
  setHovered(hovered: boolean): void;
  setDisabled(disabled: boolean): void;
  cancelPress(): void;
  onDestroy(listener: () => void): () => void;
  onInputReset(listener: () => void): () => void;
}
/** viewport CSS -> border-box [0,1]^2. Supports translation and positive axis-
 * aligned scale (including ancestors). Rotation/skew/perspective are unsupported.
 * Bounding rect is read only when input starts, never by the animation loop.
 */
export function jellyLocalContact(host: HTMLElement, clientX: number, clientY: number): JellyContact {
  const r = host.getBoundingClientRect();
  return jellyContact({ x: r.width ? (clientX-r.left)/r.width : 0.5, y: r.height ? (clientY-r.top)/r.height : 0.5 });
}
export function bindJellyInput(host: HTMLElement, surface: JellyPressReceiver): () => void {
  const events = new AbortController(), { signal } = events;
  let pointer: number | null = null, key: string | null = null, destroyed = false;
  const disabled = () => host.matches(':disabled') || host.getAttribute('aria-disabled') === 'true';
  const clear = () => { pointer = null; key = null; };
  const cancel = () => { clear(); surface.cancelPress(); surface.setHovered(false); };
  const unsubscribe = surface.onInputReset(clear);
  host.addEventListener('pointerdown', (e) => {
    if (disabled() || e.button !== 0 || !e.isPrimary || pointer !== null || key !== null) return;
    pointer = e.pointerId;
    surface.setPressed(true, jellyLocalContact(host, e.clientX, e.clientY));
  }, { signal });
  // Window listener handles up/cancel outside the host. Leaving cancels feedback;
  // reentry needs a new press. Touch remains scrollable with native touch-action.
  window.addEventListener('pointerup', (e) => {
    if (e.pointerId !== pointer) return;
    clear(); surface.setPressed(false);
  }, { signal });
  window.addEventListener('pointercancel', (e) => { if (e.pointerId === pointer) cancel(); }, { signal });
  host.addEventListener('lostpointercapture', (e) => { if (e.pointerId === pointer) cancel(); }, { signal });
  host.addEventListener('pointerleave', () => { if (pointer !== null) cancel(); else surface.setHovered(false); }, { signal });
  host.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch' && !disabled()) surface.setHovered(true); }, { signal });
  host.addEventListener('keydown', (e) => {
    if (disabled() || e.repeat || key !== null || pointer !== null) return;
    if (e.key !== 'Enter' && !(e.key === ' ' && host.tagName === 'BUTTON')) return;
    key = e.key;
    surface.setPressed(true, { x: 0.5, y: 0.5 });
  }, { signal });
  host.addEventListener('keyup', (e) => { if (e.key === key) { clear(); surface.setPressed(false); } }, { signal });
  host.addEventListener('blur', cancel, { signal });
  window.addEventListener('blur', cancel, { signal });
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancel(); }, { signal });
  const observer = new MutationObserver(() => {
    if (destroyed) return;
    const value = disabled();
    if (value) cancel();
    surface.setDisabled(value);
  });
  observer.observe(host, { attributes: true, attributeFilter: ['disabled', 'aria-disabled'] });
  const cleanup = () => {
    if (destroyed) return;
    destroyed = true;
    events.abort(); observer.disconnect(); unsubscribe(); clear();
  };
  const detachDestroy = surface.onDestroy(cleanup);
  return () => { cleanup(); detachDestroy(); };
}
