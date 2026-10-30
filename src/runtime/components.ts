/**
 * Runtime side of the component registry (src/components/registry.ts): how a
 * type renders on the DOM. The lab's stage and the exported wrappers ask for a
 * component by its definition and never import a type's renderer directly, so
 * the preview and an exported package run the same code path.
 *
 *   const nav = createComponent({ container, config: navbarDefinition, source });   // BottomNavigation
 *   const btn = createComponent({ container, config: buttonDefinition, source });   // JelloButton
 *   instance.update(next);  instance.destroy();
 *
 * Adding a type means one entry in RUNTIMES, with the same `renderer` id as
 * its registry entry (tests/unit/component-registry.test.ts checks that every
 * entry has a runtime and the other way round).
 */
import type { DefinitionType } from '../components/definition';
import { BottomNavigation, type BottomNavigationOptions } from './bottom-navigation';
import { JelloButton, type JelloButtonOptions } from './button';
import { DesktopNavigation, type DesktopNavigationOptions } from './desktop-navigation';
import type { ComponentInstance } from './component-types';

export interface ComponentRuntime {
  type: DefinitionType;
  /** Id of the registry entry's `renderer`. */
  renderer: string;
  create(options: BottomNavigationOptions | JelloButtonOptions | DesktopNavigationOptions): ComponentInstance;
}

const RUNTIMES = new Map<string, ComponentRuntime>([
  ['mobile-navbar', { type: 'mobile-navbar', renderer: 'mobile-navbar', create: (o) => new BottomNavigation(o as BottomNavigationOptions) }],
  ['button', { type: 'button', renderer: 'button', create: (o) => new JelloButton(o as JelloButtonOptions) }],
  ['desktop-navbar', { type: 'desktop-navbar', renderer: 'desktop-navbar', create: (o) => new DesktopNavigation(o as DesktopNavigationOptions) }],
]);

export function componentRuntime(type: string): ComponentRuntime | undefined {
  return RUNTIMES.get(type);
}

/** Types that have a renderer in this runtime. */
export function componentRuntimes(): ComponentRuntime[] {
  return [...RUNTIMES.values()];
}

/** Creates (without mounting) the renderer of `options.config.type`. Call `mount()` to show it. */
export function createComponent(options: DesktopNavigationOptions): DesktopNavigation;
export function createComponent(options: BottomNavigationOptions): BottomNavigation;
export function createComponent(options: JelloButtonOptions): JelloButton;
export function createComponent(options: BottomNavigationOptions | JelloButtonOptions | DesktopNavigationOptions): ComponentInstance;
export function createComponent(options: BottomNavigationOptions | JelloButtonOptions | DesktopNavigationOptions): ComponentInstance {
  const rt = RUNTIMES.get(options.config.type);
  if (!rt) throw new Error(`Nessun renderer per il tipo «${options.config.type}»`);
  return rt.create(options);
}

/** Creates and mounts. */
export function mountComponent(options: DesktopNavigationOptions): DesktopNavigation;
export function mountComponent(options: BottomNavigationOptions): BottomNavigation;
export function mountComponent(options: JelloButtonOptions): JelloButton;
export function mountComponent(options: BottomNavigationOptions | JelloButtonOptions | DesktopNavigationOptions): ComponentInstance;
export function mountComponent(options: BottomNavigationOptions | JelloButtonOptions | DesktopNavigationOptions): ComponentInstance {
  const c = createComponent(options);
  c.mount();
  return c;
}
