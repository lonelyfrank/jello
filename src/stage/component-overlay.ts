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

import type { BottomNavigation } from '../runtime/bottom-navigation';

export class ComponentOverlay {
  private readonly box: HTMLDivElement;
  private readonly chip: HTMLSpanElement;
  private selected: string | null = null;
  private picking = false;
  private raf = 0;
  private readonly cleanups: (() => void)[] = [];

  constructor(
    private readonly stage: HTMLElement,
    private readonly nav: BottomNavigation,
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
      const tab = (e.target as Element | null)?.closest<HTMLElement>('.jello-bnav-tab');
      this.onPick(tab?.dataset.tab ?? 'root');
    };
    nav.host.addEventListener('click', pick, true);
    this.cleanups.push(
      () => ro.disconnect(),
      () => nav.host.removeEventListener('click', pick, true),
    );
  }

  setSelected(id: string | null, name = ''): void {
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

  private schedule() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.place();
    });
  }

  private place() {
    const el = this.selected ? this.nav.elementFor(this.selected) : null;
    if (!el || el.offsetParent === null) {
      this.box.hidden = true;
      return;
    }
    const s = this.stage.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const b = this.box.style;
    b.left = `${r.left - s.left - 3}px`;
    b.top = `${r.top - s.top - 3}px`;
    b.width = `${r.width + 6}px`;
    b.height = `${r.height + 6}px`;
    this.box.dataset.kind = this.selected === 'root' ? 'root' : 'tab';
    this.box.hidden = false;
  }
}
