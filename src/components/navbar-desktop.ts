/** Desktop contract, validation and pure renderer presentation. */
import type { ComponentDefinition, StructureNode } from './definition';
import { choices, checkField, getPath, setPath, type FieldDescriptor } from './fields';
import { BN_FIELDS, NAVBAR_UNSUPPORTED, checkNavbarSections, fromCanonicalPath, navbarPresentation, navbarView, toCanonicalPath, type ItemRef, type NavbarCheck, type Presentation } from './navbar';
import { navbarItems, type NavbarItem, type NavbarRegion } from './navbar-contract';

const MOBILE_ONLY = new Set(['layout.anchor', 'layout.placement', 'layout.offset']);
const DEFAULTS: Record<string, unknown> = { 'layout.height': 72, 'layout.padding': 24, 'layout.gap': 16, 'layout.width': 1280, 'layout.maxWidth': 1600, 'layout.itemLayout': 'inline', 'layout.distribution': 'start' };
const DESKTOP_VIEW_FIELDS: readonly FieldDescriptor[] = [
  ...BN_FIELDS.filter((f) => !MOBILE_ONLY.has(f.path)).map((f) => ({ ...f, optional: false,
    ...(f.type === 'number' && ['layout.padding', 'layout.gap'].includes(f.path) ? { max: 96 } : {}),
    ...(f.path in DEFAULTS ? { default: DEFAULTS[f.path] } : {}),
  } as FieldDescriptor)),
  { type: 'enum', path: 'layout.orientation', section: 'layout', label: 'Orientamento', options: choices(['horizontal', 'Orizzontale']), default: 'horizontal', description: 'Navbar orizzontale; nessuna conversione automatica in Bottom Navigation.' },
];

export const DESKTOP_NAVBAR_FIELDS: readonly FieldDescriptor[] = DESKTOP_VIEW_FIELDS.map((f) => ({ ...f, path: toCanonicalPath(f.path), scope: f.path === 'layout.orientation' ? 'desktop-navbar' : 'common', level: ['layout.height', 'layout.padding', 'layout.gap', 'layout.align', 'layout.distribution'].includes(f.path) ? 'base' : 'advanced' }));
export const DESKTOP_NAVBAR_OVERRIDE_PATHS = ['layout.labels', 'layout.icons', 'layout.gap', 'layout.padding', 'layout.align', 'layout.distribution', 'layout.height', 'layout.width', 'layout.maxWidth', 'layout.compact', 'typography.fontSize', 'icon.size'] as const;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function checkDesktopNavbarSections(
  raw: Parameters<typeof checkNavbarSections>[0], items: readonly ItemRef[], structure: StructureNode, errors: string[], warnings: string[],
): NavbarCheck | null {
  const layout = isObj(raw.layout) ? raw.layout : {};
  const { regions: inputRegions, ...rest } = layout;
  const checked = checkNavbarSections({ ...raw, layout: raw.layout === undefined || isObj(raw.layout) ? rest : raw.layout }, items, errors, warnings, DESKTOP_VIEW_FIELDS, DESKTOP_NAVBAR_OVERRIDE_PATHS);
  const regions: Record<string, NavbarRegion> = {};
  if (inputRegions !== undefined) {
    if (!isObj(inputRegions)) errors.push('layout.regions: atteso un oggetto');
    else for (const [id, value] of Object.entries(inputRegions)) {
      if (!structure.children?.some((n) => n.id === id)) errors.push(`layout.regions.${id}: richiesto un elemento o gruppo della radice`);
      else if (value !== 'start' && value !== 'main' && value !== 'end') errors.push(`layout.regions.${id}: atteso start, main o end`);
      else regions[id] = value;
    }
  }
  if (checked) checked.sections.layout = { ...checked.sections.layout, regions };
  return checked;
}

/** Sets one described field. Refuses properties absent from the Desktop contract. */
export function setDesktopNavbarField(def: ComponentDefinition, path: string, value: unknown): ComponentDefinition | null {
  if (def.type !== 'desktop-navbar') return null;
  const f = DESKTOP_NAVBAR_FIELDS.find((f) => f.path === path);
  return f && !checkField(f, value) ? setPath(def, path, value) : null;
}

/** Assign a root item/group to a Desktop region; null restores main. */
export function setDesktopNavbarRegion(def: ComponentDefinition, id: string, region: NavbarRegion | null): ComponentDefinition | null {
  if (def.type !== 'desktop-navbar' || !def.structure.children?.some((n) => n.id === id)) return null;
  if (region !== null && !['start', 'main', 'end'].includes(region)) return null;
  const regions = { ...def.layout.regions as Record<string, NavbarRegion> };
  if (region === null) delete regions[id]; else regions[id] = region;
  return { ...def, layout: { ...def.layout, regions } };
}

/** Pure breakpoint resolution, identical maxWidth ordering to Mobile; never changes component type. */
export function resolveDesktopNavbar(def: ComponentDefinition, width: number): { definition: ComponentDefinition; breakpoint: string | null } {
  if (def.type !== 'desktop-navbar') throw new Error('Richiesta una desktop-navbar');
  const points = (def.responsive.breakpoints ?? []) as { id: string; maxWidth: number; overrides: Record<string, unknown> }[];
  const matching = points.filter((b) => width > 0 && width <= b.maxWidth).sort((a, b) => b.maxWidth - a.maxWidth);
  let definition = def;
  for (const bp of matching) for (const [path, value] of Object.entries(bp.overrides)) definition = setPath(definition, path, value);
  return { definition, breakpoint: matching.at(-1)?.id ?? null };
}

export function getDesktopNavbarField(def: ComponentDefinition, path: string): unknown {
  return getPath(def, toCanonicalPath(fromCanonicalPath(path)));
}

/** Regions are derived, never stored a second time. Members inherit the root group's assignment. */
export function desktopNavbarRegions(def: ComponentDefinition): Record<NavbarRegion, NavbarItem[]> {
  const regions: Record<NavbarRegion, NavbarItem[]> = { start: [], main: [], end: [] };
  const assignments = def.layout.regions as Record<string, NavbarRegion>;
  for (const item of navbarItems(def)) {
    if (item.visible) regions[assignments[item.groupId ?? item.id] ?? 'main'].push(item);
  }
  return regions;
}

/** Same state/style vocabulary as Mobile, with Desktop geometry and DOM. */
export function desktopNavbarPresentation(def: ComponentDefinition, family: string, breakpoint: string | null): Presentation {
  const p = navbarPresentation(navbarView(def), family, { breakpoint });
  for (const key of ['data-anchor', 'data-placement', 'data-semantics']) delete p.attrs[key];
  delete p.vars['--jbn-offset'];
  p.attrs['data-orientation'] = 'horizontal';
  return p;
}

export const DESKTOP_NAVBAR_UNSUPPORTED = NAVBAR_UNSUPPORTED;
