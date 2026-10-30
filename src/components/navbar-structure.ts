/** Immutable operations on the canonical definition, shared by both navbar types. */
import { parseDefinition, type ComponentDefinition, type NodeContent, type StructureNode } from './definition';
import { checkNavbarAction, isNavbarDefinition, navbarActiveItem, navbarItemNodes, type NavbarAction, type NavbarIconPosition, type NavbarRegion } from './navbar-contract';
import type { IconRef } from './icons';
import { uniqueId } from './navbar';

export class NavbarStructureError extends Error {
  constructor(readonly errors: string[]) { super(errors.join('; ')); this.name = 'NavbarStructureError'; }
}
const fail = (message: string): never => { throw new NavbarStructureError([message]); };

/** Validate, but return the edited object: parsing must not discard unrelated extension fields. */
function checked<T extends ComponentDefinition>(def: T): T {
  if (!isNavbarDefinition(def)) return fail('Richiesta una mobile-navbar o desktop-navbar');
  const result = parseDefinition(def);
  if (!result.ok) throw new NavbarStructureError(result.errors);
  const repairs = result.warnings.filter((warning) => /assente|uso |normalizzat|nessun breakpoint/.test(warning));
  if (repairs.length) throw new NavbarStructureError(repairs.map((message) => `Definizione da importare prima della modifica: ${message}`));
  return def;
}
function nodeIds(def: ComponentDefinition): Set<string> {
  const all = new Set<string>();
  const walk = (n: StructureNode) => { all.add(n.id); n.children?.forEach(walk); };
  walk(def.structure);
  return all;
}
function item(def: ComponentDefinition, id: string) {
  return navbarItemNodes(def).find((n) => n.node.id === id) ?? fail(`Voce «${id}» inesistente`);
}
function group(def: ComponentDefinition, id: string): StructureNode {
  return def.structure.children?.find((n) => n.id === id && n.role === 'group') ?? fail(`Gruppo «${id}» inesistente`);
}
function children(def: ComponentDefinition, groupId: string | null): StructureNode[] {
  return (groupId === null ? def.structure : group(def, groupId)).children ?? [];
}
function at(index: number, max: number): number {
  if (!Number.isInteger(index) || index < 0 || index > max) return fail(`Indice ${index} fuori intervallo [0, ${max}]`);
  return index;
}
function replaceChildren<T extends ComponentDefinition>(def: T, groupId: string | null, next: StructureNode[]): T {
  return { ...def, structure: groupId === null ? { ...def.structure, children: next }
    : { ...def.structure, children: def.structure.children!.map((n) => n.id === groupId ? { ...n, children: next } : n) } };
}
function replaceItem<T extends ComponentDefinition>(def: T, id: string, next: StructureNode): T {
  const found = item(def, id);
  return replaceChildren(def, found.groupId, children(def, found.groupId).map((n) => n.id === id ? next : n));
}
function defaultAfter<T extends ComponentDefinition>(def: T): T {
  const active = navbarActiveItem(def);
  const fallback = navbarItemNodes(def).find(({ node }) => node.role === 'item')?.node.id ?? '';
  return { ...def, interactions: { ...def.interactions, behavior: { ...def.interactions.behavior, defaultItem: active || fallback } } };
}

export interface NavbarItemPatch {
  label?: string;
  icon?: IconRef;
  iconPosition?: NavbarIconPosition | null;
  accessibleLabel?: string | null;
  description?: string | null;
  value?: string | null;
  visible?: boolean;
  disabled?: boolean;
  action?: NavbarAction;
}
export interface NavbarInsertPosition { groupId?: string | null; index?: number }

export function addNavbarItem<T extends ComponentDefinition>(def: T, input: NavbarItemPatch = {}, position: NavbarInsertPosition = {}): { definition: T; id: string } {
  checked(def);
  const id = uniqueId('tab', nodeIds(def));
  const groupId = position.groupId ?? null;
  const list = [...children(def, groupId)];
  list.splice(at(position.index ?? list.length, list.length), 0, { id, role: 'item' });
  const next = replaceChildren(def, groupId, list);
  return { definition: patchedItem(next, id, { label: `Tab ${navbarItemNodes(def).length + 1}`, icon: { kind: 'builtin', name: 'star' }, ...input }), id };
}

export function updateNavbarItem<T extends ComponentDefinition>(def: T, id: string, patch: NavbarItemPatch): T {
  checked(def);
  return patchedItem(def, id, patch);
}

function patchedItem<T extends ComponentDefinition>(def: T, id: string, patch: NavbarItemPatch): T {
  if ('action' in patch) { const error = checkNavbarAction(patch.action); if (error) fail(error); }
  const found = item(def, id).node;
  const content = { ...def.content };
  const own: NodeContent = { ...content[id] };
  // Reject misspelled fields even when invoked from plain JavaScript.
  for (const k of Object.keys(patch)) if (!['label', 'icon', 'iconPosition', 'accessibleLabel', 'description', 'value', 'visible', 'disabled', 'action'].includes(k)) fail(`Proprietà di voce sconosciuta: ${k}`);
  const taken = nodeIds(def);
  let kids = [...found.children ?? []];
  for (const role of ['label', 'icon'] as const) {
    const value = patch[role];
    if (value === undefined) continue;
    const previous = kids.find((n) => n.role === role);
    const remove = role === 'label' ? value === '' : (value as IconRef).kind === 'none';
    if (remove) {
      if (previous) { kids = kids.filter((n) => n.id !== previous.id); delete content[previous.id]; }
    } else {
      const slotId = previous?.id ?? uniqueId(`${id}-${role}`, taken);
      taken.add(slotId);
      if (!previous) kids.push({ id: slotId, role });
      content[slotId] = { ...content[slotId], ...(role === 'label' ? { text: value as string } : { icon: structuredClone(value as IconRef) }) };
    }
  }
  for (const key of ['iconPosition', 'accessibleLabel', 'description', 'value', 'visible', 'disabled', 'action'] as const) {
    if (!(key in patch)) continue;
    const value = patch[key];
    if (value === null || value === undefined) delete own[key];
    else Object.assign(own, { [key]: structuredClone(value) });
  }
  if (patch.action) delete own.href;
  content[id] = own;
  const { children: _children, ...node } = found;
  return checked(defaultAfter({ ...replaceItem(def, id, { ...node, ...(kids.length ? { children: kids } : {}) }), content }));
}

export function duplicateNavbarItem<T extends ComponentDefinition>(def: T, id: string): { definition: T; id: string } {
  checked(def);
  const found = item(def, id);
  const taken = nodeIds(def);
  const content = { ...def.content };
  const clone = (node: StructureNode): StructureNode => {
    const copyId = uniqueId(`${node.id}-copia`, taken); taken.add(copyId);
    if (content[node.id]) content[copyId] = structuredClone(content[node.id]!);
    return { ...node, id: copyId, ...(node.children ? { children: node.children.map(clone) } : {}) };
  };
  const copy = clone(found.node);
  const list = [...children(def, found.groupId)];
  list.splice(list.findIndex((n) => n.id === id) + 1, 0, copy);
  let next = { ...replaceChildren(def, found.groupId, list), content };
  const styles = def.style.items as Record<string, unknown> | undefined;
  if (styles?.[id]) next = { ...next, style: { ...def.style, items: { ...styles, [copy.id]: structuredClone(styles[id]) } } };
  const regions = def.layout.regions as Record<string, NavbarRegion> | undefined;
  if (regions?.[id]) next = { ...next, layout: { ...def.layout, regions: { ...regions, [copy.id]: regions[id] } } };
  return { definition: checked(next), id: copy.id };
}

export function removeNavbarItem<T extends ComponentDefinition>(def: T, id: string): T {
  checked(def);
  const found = item(def, id);
  if (found.node.role === 'item' && navbarItemNodes(def).filter(({ node }) => node.role === 'item').length <= 1) fail('Impossibile eliminare l’ultima voce richiesta');
  const content = { ...def.content };
  const drop = (n: StructureNode) => { delete content[n.id]; n.children?.forEach(drop); }; drop(found.node);
  let next = { ...replaceChildren(def, found.groupId, children(def, found.groupId).filter((n) => n.id !== id)), content };
  if (def.style.items) {
    const items = { ...def.style.items as Record<string, unknown> }; delete items[id];
    next = { ...next, style: { ...def.style, items } };
  }
  if (def.layout.regions) {
    const regions = { ...def.layout.regions as Record<string, unknown> }; delete regions[id];
    next = { ...next, layout: { ...def.layout, regions } };
  }
  return checked(defaultAfter(next));
}

/** Index is among all siblings in the same container (including root groups). */
export function moveNavbarItem<T extends ComponentDefinition>(def: T, id: string, index: number): T {
  checked(def);
  const found = item(def, id);
  const list = [...children(def, found.groupId)];
  at(index, list.length - 1);
  list.splice(list.findIndex((n) => n.id === id), 1); list.splice(index, 0, found.node);
  return checked(replaceChildren(def, found.groupId, list));
}

/** Exact permutation of sibling items; group positions are preserved. */
export function reorderNavbarItems<T extends ComponentDefinition>(def: T, order: readonly string[], groupId: string | null = null): T {
  checked(def);
  const list = children(def, groupId);
  const items = list.filter((n) => n.role !== 'group');
  if (order.length !== items.length || new Set(order).size !== order.length || order.some((id) => !items.some((n) => n.id === id))) fail('Riordinamento: richiesta una permutazione esatta delle voci del contenitore');
  let i = 0;
  const ordered = order.map((id) => items.find((n) => n.id === id)!);
  return checked(replaceChildren(def, groupId, list.map((n) => n.role === 'group' ? n : ordered[i++]!)));
}

export const setNavbarItemVisibility = <T extends ComponentDefinition>(def: T, id: string, visible: boolean): T => updateNavbarItem(def, id, { visible });
export const setNavbarItemDisabled = <T extends ComponentDefinition>(def: T, id: string, disabled: boolean): T => updateNavbarItem(def, id, { disabled });
export const setNavbarItemAction = <T extends ComponentDefinition>(def: T, id: string, action: NavbarAction): T => updateNavbarItem(def, id, { action });

export function addNavbarGroup<T extends ComponentDefinition>(def: T, label?: string, index?: number): { definition: T; id: string } {
  checked(def);
  const id = uniqueId('group', nodeIds(def));
  const list = [...def.structure.children ?? []];
  list.splice(at(index ?? list.length, list.length), 0, { id, role: 'group', children: [] });
  return { definition: checked({ ...replaceChildren(def, null, list), content: { ...def.content, [id]: label === undefined ? {} : { text: label } } }), id };
}

/** Removing a group unwraps its members in place, preserving their order and IDs. */
export function removeNavbarGroup<T extends ComponentDefinition>(def: T, id: string): T {
  checked(def);
  const found = group(def, id);
  const content = { ...def.content }; delete content[id];
  let next = { ...replaceChildren(def, null, def.structure.children!.flatMap((n) => n.id === id ? n.children ?? [] : [n])), content };
  if (def.layout.regions) {
    const regions = { ...def.layout.regions as Record<string, NavbarRegion> };
    for (const n of found.children ?? []) if (regions[id]) regions[n.id] = regions[id]!;
    delete regions[id]; next = { ...next, layout: { ...def.layout, regions } };
  }
  return checked(next);
}

export function moveNavbarGroup<T extends ComponentDefinition>(def: T, id: string, index: number): T {
  checked(def); const found = group(def, id);
  const list = [...def.structure.children!]; at(index, list.length - 1);
  list.splice(list.findIndex((n) => n.id === id), 1); list.splice(index, 0, found);
  return checked(replaceChildren(def, null, list));
}

export function moveNavbarItemToGroup<T extends ComponentDefinition>(def: T, id: string, groupId: string | null, index?: number): T {
  checked(def); const found = item(def, id);
  if (groupId !== null) {
    group(def, groupId);
    if (found.node.role !== 'item') fail('Un gruppo accetta soltanto voci item');
  }
  const regions = { ...def.layout.regions as Record<string, NavbarRegion> | undefined };
  const region = regions[found.groupId ?? id] ?? 'main';
  if (groupId !== null && region !== (regions[groupId] ?? 'main')) fail('La voce e il gruppo appartengono a regioni incompatibili');
  let next = replaceChildren(def, found.groupId, children(def, found.groupId).filter((n) => n.id !== id));
  const list = [...children(next, groupId)]; list.splice(at(index ?? list.length, list.length), 0, found.node);
  next = replaceChildren(next, groupId, list);
  if (def.layout.regions) {
    delete regions[id]; if (groupId === null) regions[id] = region;
    next = { ...next, layout: { ...def.layout, regions } };
  }
  return checked(next);
}
