/**
 * Component types. Only `available` types have a schema, a renderer and an
 * exporter; `planned` types are listed so the editor can show what comes next
 * without pretending it exists.
 */

import { BN_FIELDS } from './bottom-navigation/model';
import type { FieldDescriptor } from './fields';

export interface ComponentTypeInfo {
  type: string;
  label: string;
  status: 'available' | 'planned';
  description: string;
  fields: readonly FieldDescriptor[];
}

export const COMPONENT_TYPES: readonly ComponentTypeInfo[] = [
  { type: 'bottom-navigation', label: 'Bottom Navigation', status: 'available', description: 'Barra di tab in basso, flottante o agganciata, con una superficie di materiale.', fields: BN_FIELDS },
  { type: 'desktop-navbar', label: 'Desktop Navbar', status: 'planned', description: 'Barra di navigazione orizzontale per schermi larghi. In arrivo.', fields: [] },
  { type: 'floating-dock', label: 'Floating Dock', status: 'planned', description: 'Dock di azioni flottante. In arrivo.', fields: [] },
  { type: 'flyout-menu', label: 'Flyout Menu', status: 'planned', description: 'Menu a comparsa ancorato a un controllo. In arrivo.', fields: [] },
];

export function componentType(type: string): ComponentTypeInfo | undefined {
  return COMPONENT_TYPES.find((t) => t.type === type);
}
