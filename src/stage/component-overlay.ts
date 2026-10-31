/**
 * Selection layer of the Component Builder, over the preview stage.
 *
 * - Draws an outline (and a name chip) around the selected element of the
 *   component: the root or one tab. It is a sibling of the overlay, never a
 *   child of the component, so it is not exported and never filtered.
 * - In pick mode the component stops reacting to input and a click (or
 *   Enter/Space on a focused tab) selects the element instead.
 *
 * Layout is read only when the selection, the component or a size changes.
 */

import type { ComponentInstance } from '../runtime/component-types';

export class ComponentOverlay {
  private readonly box: HTMLDivElement;
  private readonly chip: HTMLSpanElement;
  private selected: string | null = null;
  private picking = false;
  private raf = 0;
  private readonly cleanups: (() => void)[] = [];

  constructor(
    private readonly stage: HTMLElement,
    private readonly nav: ComponentInstance,
    private readonly onPick: (id: string) => void,
  ) {
    const doc = stage.ownerDocument;
    this.box = doc.createElement('div');
    this.box.className = 'builder-highlight';
    this.box.setAttribute('aria-hidden', 'true');
    this.box.hidden = true;
    this.chip = doc.createElement('span');
    this.chip.className = 'builder-highlight-name';
    this.box.append(this.chip);
    stage.append(this.box);
    const ro = new ResizeObserver(() => this.schedule());
    ro.observe(stage);
    ro.observe(nav.host);
    const pick = (e: MouseEvent) => {
      if (!this.picking) return;
      e.preventDefault();
      e.stopPropagation();
      this.onPick(this.nav.nodeAt(e.target));
    };
    const pickKey = (e: KeyboardEvent) => {
      if (!this.picking || !['Enter', ' '].includes(e.key)) return;
      e.preventDefault(); e.stopPropagation(); this.onPick(this.nav.nodeAt(e.target));
    };
    const pickPointer = (e: PointerEvent) => {
      if (!this.picking || e.button !== 0) return;
      e.preventDefault(); e.stopPropagation(); this.onPick(this.nav.nodeAt(e.target));
    };
    nav.host.addEventListener('pointerdown', pickPointer, true);
    nav.host.addEventListener('click', pick, true);
    nav.host.addEventListener('keydown', pickKey, true);
    const scroll = () => this.schedule();
    nav.host.addEventListener('scroll', scroll, true);
    this.cleanups.push(
      () => ro.disconnect(),
      () => nav.host.removeEventListener('pointerdown', pickPointer, true),
      () => nav.host.removeEventListener('click', pick, true),
      () => nav.host.removeEventListener('keydown', pickKey, true),
      () => nav.host.removeEventListener('scroll', scroll, true),
    );
  }

  setSelected(id: string | null, name = ''): void {
    if (id !== this.selected && id) this.reveal(id);
    this.selected = id;
    this.chip.textContent = name;
    this.schedule();
  }

  setPicking(on: boolean): void {
    this.picking = on;
    this.nav.setInteractive(!on);
    this.stage.toggleAttribute('data-picking', on);
  }

  /** Re-measure after the component changed. */
  refresh(): void {
    this.schedule();
  }

  destroy(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    for (const c of this.cleanups.splice(0)) c();
    this.setPicking(false);
    this.box.remove();
  }

  /** Reveal the control inside navbar scroll containers without moving the Studio page. */
  private reveal(id: string) {
    const group = this.nav.component.structure.children?.find((n) => n.id === id && n.role === 'group');
    const el = this.nav.elementFor(id) ?? group?.children?.map((n) => this.nav.elementFor(n.id)).find((el) => el && el.offsetParent !== null);
    if (!el) return;
    for (let parent = el.parentElement; parent && this.nav.host.contains(parent); parent = parent.parentElement) {
      if (parent.scrollWidth <= parent.clientWidth) continue;
      const rect = el.getBoundingClientRect(), bounds = parent.getBoundingClientRect();
      if (rect.left < bounds.left) parent.scrollLeft += rect.left - bounds.left;
      else if (rect.right > bounds.right) parent.scrollLeft += rect.right - bounds.right;
    }
  }

  private schedule() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.place();
    });
  }

  private place() {
    const group = this.nav.component.structure.children?.find((n) => n.id === this.selected && n.role === 'group');
    const targets = group ? (group.children ?? []).map((n) => this.nav.elementFor(n.id)) : [this.selected ? this.nav.elementFor(this.selected) : null];
    const rects = targets.filter((el): el is HTMLElement => !!el && el.offsetParent !== null).map((el) => el.getBoundingClientRect());
    if (!rects.length) { this.box.hidden = true; return; }
    const s = this.stage.getBoundingClientRect();
    const left = Math.min(...rects.map((r) => r.left)), top = Math.min(...rects.map((r) => r.top));
    const r = { left, top, width: Math.max(...rects.map((r) => r.right)) - left, height: Math.max(...rects.map((r) => r.bottom)) - top };
    const b = this.box.style;
    b.left = `${r.left - s.left - 3}px`;
    b.top = `${r.top - s.top - 3}px`;
    b.width = `${r.width + 6}px`;
    b.height = `${r.height + 6}px`;
    this.box.dataset.kind = this.selected === 'root' ? 'root' : 'tab';
    this.box.hidden = false;
  }
}
