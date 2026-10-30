/**
 * Demo navbar of the Material Lab: the official Bottom Navigation template of
 * the generic BottomNavigation component (src/runtime/bottom-navigation.ts), mounted on
 * the stage's own material group. Nothing here renders tabs or material: the
 * adapter only keeps the lab's contract (class names, theme colours, the
 * NavId selection driven by the lab state).
 *
 *   nav.navbar.jello-bnav (.jello-host, sizing: element, capsule)
 *     span.jello-surface              material, added by the group
 *     div.jello-bnav-track
 *       span.nav-indicator            selection layer (not a second lens)
 *       button.nav-item × 3           icon + label, never filtered or scaled
 *
 * Selection is controlled (`aria-current`, from the lab state); press is
 * transient and never changes the selection by itself.
 */

import { hexToRgb, type GlassContext, type GlassParams, type GlassSurface } from '../core';
import { componentTemplate } from '../components/document';
import { BottomNavigation } from '../runtime/bottom-navigation';
import type { MaterialGroup } from '../runtime/materials';
import type { NavId } from './view';

export interface NavbarOptions {
  overlay: HTMLElement;
  /** Content under the bar; wheel input over the bar scrolls it. */
  scroller: HTMLElement;
  /** Material group of the stage: the bar's surface is one of its surfaces. */
  group: MaterialGroup;
  label: string;
  selected: NavId;
  onSelect(id: NavId): void;
}

export class Navbar {
  readonly nav: BottomNavigation;

  constructor(options: NavbarOptions) {
    this.nav = new BottomNavigation({
      container: options.overlay,
      config: componentTemplate('bottom-navigation')!.create(),
      group: options.group,
      scroller: options.scroller,
      activeTab: options.selected,
      controlled: true,
      label: options.label,
      anchor: 'container',
      classNames: { root: 'navbar', tab: 'nav-item', label: 'nav-label', indicator: 'nav-indicator' },
      onChange: (id) => options.onSelect(id as NavId),
    });
  }

  get host(): HTMLElement {
    return this.nav.host;
  }

  get surface(): GlassSurface | null {
    return this.nav.glassSurface;
  }

  get selected(): NavId {
    return this.nav.activeTab as NavId;
  }

  get pressed(): NavId | null {
    return this.nav.pressed as NavId | null;
  }

  /** Shows the bar and attaches its single surface. Idempotent. */
  mount(_ctx: GlassContext, params: GlassParams): GlassSurface {
    this.nav.mount();
    this.setParams(params);
    return this.nav.glassSurface!;
  }

  /** Detaches the surface (its lens leaves the filter), drops every listener, hides the bar. */
  unmount(): void {
    this.nav.unmount();
  }

  dispose(): void {
    this.nav.destroy();
  }

  setSelected(id: NavId): void {
    this.nav.setActiveTab(id);
  }

  setParams(p: GlassParams): void {
    this.nav.glassSurface?.setParams(p);
    this.nav.setMaterial();
    const [r, g, b] = hexToRgb(p.tint);
    this.host.style.setProperty('--nav-tint', `${r} ${g} ${b}`);
    this.host.style.setProperty('--nav-light', String(p.light));
  }
}
