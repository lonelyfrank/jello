/** Node descriptors consumed by the existing component inspector. `$item` is a node ID. */
import { choices, type FieldDescriptor } from './fields';

const text = (path: string, section: 'content' | 'accessibility' | 'structure' | 'interactions', label: string, maxLength = 120): FieldDescriptor => ({ type: 'text', path, section, label, maxLength, pattern: /^[\s\S]*$/, default: '', description: label, level: section === 'accessibility' ? 'advanced' : 'base', scope: 'common' });
export const NAVBAR_ITEM_FIELDS: readonly FieldDescriptor[] = [
  text('content.$label.text', 'content', 'Etichetta'),
  text('content.$item.value', 'content', 'Valore applicativo', 200),
  { type: 'enum', path: 'content.$item.iconPosition', section: 'content', label: 'Posizione icona', options: choices(['start', 'Inizio'], ['end', 'Fine'], ['top', 'Sopra'], ['bottom', 'Sotto']), default: 'top', description: 'In assenza eredita il layout.', scope: 'common', level: 'advanced' },
  { type: 'boolean', path: 'content.$item.visible', section: 'structure', label: 'Visibile', default: true, description: 'Una voce nascosta resta nella definizione.', scope: 'common', level: 'base' },
  { type: 'boolean', path: 'content.$item.disabled', section: 'states', label: 'Disabilitata', default: false, description: 'Non può essere attivata.', scope: 'common', level: 'base' },
  { type: 'enum', path: 'content.$item.action.kind', section: 'interactions', label: 'Azione', options: choices(['select', 'Selezione'], ['navigate', 'Navigazione URL'], ['consumer', 'Gestita dal consumatore']), default: 'select', description: 'Contratto serializzabile; callback forniti al runtime.', scope: 'common', level: 'base' },
  text('content.$item.action.href', 'interactions', 'Destinazione URL', 2048),
  { type: 'enum', path: 'content.$item.action.target', section: 'interactions', label: 'Apri in', options: choices(['_self', 'Stessa scheda'], ['_blank', 'Nuova scheda']), default: '_self', description: 'Nuove schede con noopener noreferrer.', scope: 'common', level: 'advanced' },
  text('content.$item.action.name', 'interactions', 'Nome azione', 64),
  text('content.$item.accessibleLabel', 'accessibility', 'Nome accessibile'),
  text('content.$item.description', 'accessibility', 'Descrizione accessibile'),
];
export const NAVBAR_GROUP_FIELDS: readonly FieldDescriptor[] = [text('content.$group.text', 'structure', 'Etichetta del gruppo')];
export const DESKTOP_NAVBAR_REGION_FIELD: FieldDescriptor = { type: 'enum', path: 'layout.regions.$item', section: 'layout', label: 'Regione', options: choices(['start', 'Inizio'], ['main', 'Principale'], ['end', 'Fine']), default: 'main', description: 'Solo elementi e gruppi della radice; i membri ereditano la regione del gruppo.', scope: 'desktop-navbar', level: 'advanced' };
