/** Shared navigation data. No material, framework, DOM or viewport dependency. */
import type { ComponentDefinition, NodeContent, StructureNode } from './definition';
import type { IconRef } from './icons';
import type { BnLayout, BnResponsive } from './navbar';

export type NavbarType = 'mobile-navbar' | 'desktop-navbar';
export type NavbarAction =
  | { kind: 'select' }
  | { kind: 'navigate'; href: string; target?: '_self' | '_blank' }
  | { kind: 'consumer'; name: string };
export type NavbarIconPosition = 'start' | 'end' | 'top' | 'bottom';
export type NavbarRegion = 'start' | 'main' | 'end';

export interface DesktopNavbarLayout {
  orientation: 'horizontal';
  align: 'start' | 'center' | 'end';
  distribution: 'start' | 'center' | 'end' | 'between' | 'evenly';
  widthMode: 'fill' | 'fixed' | 'hug';
  width: number;
  maxWidth: number;
  height: number;
  padding: number;
  gap: number;
  radius: number | 'capsule';
  itemLayout: 'stacked' | 'inline';
  labels: 'show' | 'hide' | 'active';
  icons: 'show' | 'hide';
  compact: boolean;
  /** Root item/group IDs; group members inherit their group's region. */
  regions: Record<string, NavbarRegion>;
}

export type MobileNavbarDefinition = ComponentDefinition & { type: 'mobile-navbar'; layout: BnLayout & Record<string, unknown>; responsive: BnResponsive & Record<string, unknown> };
export type DesktopNavbarDefinition = ComponentDefinition & { type: 'desktop-navbar'; layout: DesktopNavbarLayout & Record<string, unknown>; responsive: BnResponsive & Record<string, unknown> };
export type NavbarDefinition = MobileNavbarDefinition | DesktopNavbarDefinition;

/** Read model only; content and hierarchy remain in the canonical document. */
export interface NavbarItem {
  id: string;
  role: 'item' | 'brand' | 'action';
  groupId: string | null;
  label: string;
  icon: IconRef;
  iconPosition?: NavbarIconPosition;
  accessibleLabel?: string;
  description?: string;
  value: string | null;
  visible: boolean;
  disabled: boolean;
  action: NavbarAction;
}
export interface NavbarGroup {
  id: string;
  label?: string;
  itemIds: string[];
}
/** Transient state is owned by the runtime, never written into NodeContent. */
export interface NavbarRuntimeState {
  activeItem: string | null;
  focusedItem: string | null;
  hoveredItem: string | null;
  pressedItem: string | null;
}

export function isNavbarDefinition(def: ComponentDefinition): def is NavbarDefinition {
  return def.type === 'mobile-navbar' || def.type === 'desktop-navbar';
}

/** Same destination forms as existing components; validates authorities and refuses controls. */
export function isSafeNavigationHref(value: unknown): value is string {
  if (typeof value !== 'string' || !value || value.length > 2048 || /[\s\u0000-\u001f\u007f\\]/.test(value)) return false;
  if (value.startsWith('#')) return true;
  if (value.startsWith('/') && !value.startsWith('//')) return true;
  const protocolRelative = value.startsWith('//') && !value.startsWith('///');
  if (!protocolRelative && !/^https?:\/\//i.test(value)) return false;
  try {
    const url = new URL(protocolRelative ? `https:${value}` : value);
    return !!url.hostname && !url.username && !url.password;
  } catch { return false; }
}

export function checkNavbarAction(value: unknown): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return 'attesa un’azione serializzabile';
  const v = value as Record<string, unknown>;
  const keys = v.kind === 'select' ? ['kind'] : v.kind === 'navigate' ? ['kind', 'href', 'target'] : v.kind === 'consumer' ? ['kind', 'name'] : [];
  if (!keys.length) return 'kind: atteso select, navigate o consumer';
  if (Object.keys(v).some((k) => !keys.includes(k))) return 'proprietà di azione sconosciuta';
  if (v.kind === 'navigate') {
    if (!isSafeNavigationHref(v.href)) return 'href: destinazione non sicura (percorso /…, ancora #… o URL http(s))';
    if (v.target !== undefined && v.target !== '_self' && v.target !== '_blank') return 'target: atteso _self o _blank';
  }
  if (v.kind === 'consumer' && (typeof v.name !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(v.name))) return 'name: identificatore di azione non valido';
  return null;
}

/** Missing action preserves historical selection, including legacy href payloads. */
export function navbarItemAction(content: NodeContent): NavbarAction {
  return content.action ?? { kind: 'select' };
}

export function navbarItemNodes(def: Pick<ComponentDefinition, 'structure'>): { node: StructureNode; groupId: string | null }[] {
  return (def.structure.children ?? []).flatMap<{ node: StructureNode; groupId: string | null }>((node) => node.role === 'group'
    ? (node.children ?? []).map((item) => ({ node: item, groupId: node.id }))
    : ['item', 'brand', 'action'].includes(node.role) ? [{ node, groupId: null }] : []);
}

export function navbarItems(def: ComponentDefinition): NavbarItem[] {
  return navbarItemNodes(def).map(({ node, groupId }) => {
    const c = def.content[node.id] ?? {};
    const label = node.children?.find((n) => n.role === 'label');
    const icon = node.children?.find((n) => n.role === 'icon');
    return {
      id: node.id, role: node.role as NavbarItem['role'], groupId,
      label: label ? def.content[label.id]?.text ?? '' : '',
      icon: icon ? def.content[icon.id]?.icon ?? { kind: 'none' } : { kind: 'none' },
      ...(c.iconPosition ? { iconPosition: c.iconPosition } : {}),
      ...(c.accessibleLabel ? { accessibleLabel: c.accessibleLabel } : {}),
      ...(c.description ? { description: c.description } : {}),
      value: c.value ?? null, visible: c.visible ?? true, disabled: c.disabled ?? false,
      action: navbarItemAction(c),
    };
  });
}

export function navbarGroups(def: ComponentDefinition): NavbarGroup[] {
  return (def.structure.children ?? []).filter((n) => n.role === 'group').map((n) => ({
    id: n.id, ...(def.content[n.id]?.text ? { label: def.content[n.id]!.text } : {}), itemIds: (n.children ?? []).map((c) => c.id),
  }));
}

/** Explicit default is a preference; an unavailable selection falls back in display order. */
export function navbarActiveItem(def: ComponentDefinition, preferred: string | null = null): string {
  const items = navbarItems(def).filter((n) => n.role === 'item' && n.visible && !n.disabled && n.action.kind !== 'consumer');
  return items.find((n) => n.id === preferred)?.id
    ?? items.find((n) => n.id === def.interactions.behavior.defaultItem)?.id
    ?? items[0]?.id ?? '';
}

/** Additional invariants beyond the role/slot validator; no data is repaired. */
export function checkNavbarStructure(def: Pick<ComponentDefinition, 'type' | 'structure' | 'content' | 'interactions'>, errors: string[]): void {
  const nodes = navbarItemNodes(def);
  const items = nodes.filter(({ node }) => node.role === 'item');
  if (items.length < 1 || items.length > 200) errors.push(`structure: «item» ammesso da 1 a 200, trovati ${items.length}`);
  for (const { node } of nodes) {
    const c = def.content[node.id] ?? {};
    if (c.action && c.href && (c.action.kind !== 'navigate' || c.action.href !== c.href)) errors.push(`content.${node.id}: href e action in conflitto`);
    if (c.action?.kind === 'navigate' && def.interactions.behavior.semantics === 'tabs') errors.push(`content.${node.id}.action: navigate richiede semantica navigation`);
    if (!c.accessibleLabel && !node.children?.some((n) => n.role === 'label')) {
      // Historical icon-only entries are accepted; explicit actions must be accessible.
      if (c.action || def.type === 'desktop-navbar') errors.push(`content.${node.id}.accessibleLabel: richiesto senza etichetta`);
    }
  }
}
