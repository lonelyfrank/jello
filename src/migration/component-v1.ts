/**
 * `jello-component` v1 (type `bottom-navigation`) → `jello-component-definition`
 * (type `mobile-navbar`).
 *
 * The converter only rearranges: tabs become items with an icon and a label
 * slot, the root's sections move to `layout`, `responsive`, `style`, the
 * `style` of each state and `interactions`, and the embedded material travels
 * as it is. It does not validate: the result goes through `parseDefinition`,
 * the same atomic validation every canonical document gets, so a v1 file is
 * accepted or refused for the same reasons as a new one.
 *
 * Preserved: every tab (id, label, icon including custom SVG, value, disabled,
 * per-tab style), the default tab, the accessible name and semantics, every
 * layout / appearance / typography / icon / motion / state / interaction
 * property, the events' names, the breakpoints and their overrides, the
 * material binding (preset, revision and the embedded document) and the
 * metadata. Not preserved: nothing; the format of the file changes, not what it describes.
 */

import { parseDefinition, type DefinitionImport } from '../components/definition';
import { toCanonicalPath } from '../components/navbar';
import { RUNTIME_VERSION } from '../model/version';
import { legacyTemplate } from './legacy';

export const COMPONENT_V1_FORMAT = 'jello-component';
const MIGRATED_FROM = `${COMPONENT_V1_FORMAT}@1 (bottom-navigation → mobile-navbar)`;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function convertComponentV1(input: unknown): DefinitionImport {
  if (!isObj(input) || input.format !== COMPONENT_V1_FORMAT) return { ok: false, errors: [`format: atteso "${COMPONENT_V1_FORMAT}"`] };
  const v = input.schemaVersion;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) return { ok: false, errors: ['schemaVersion: atteso un intero ≥ 1'] };
  if (v > 1) {
    return { ok: false, errors: [`schemaVersion ${v}: componente creato da una versione più recente di Jello. Questo runtime (${RUNTIME_VERSION}) legge ${COMPONENT_V1_FORMAT} fino alla versione 1. Nessuna modifica applicata.`] };
  }
  if (input.type !== 'bottom-navigation') return { ok: false, errors: [`type: componente "${String(input.type)}" sconosciuto a questo runtime`] };
  const root = input.root;
  if (!isObj(root)) return { ok: false, errors: ['root: atteso un oggetto'] };
  if (!Array.isArray(root.children)) return { ok: false, errors: ['root.children: atteso un elenco di tab'] };

  const tabs = root.children.filter(isObj);
  const taken = new Set<string>(['root', ...tabs.map((t) => String(t.id))]);
  const slotId = (tab: string, suffix: string) => {
    let id = `${tab}-${suffix}`;
    for (let n = 2; taken.has(id); n++) id = `${tab}-${suffix}-${n}`;
    taken.add(id);
    return id;
  };

  const content: Record<string, unknown> = { root: { text: root.label } };
  const items: Record<string, unknown> = {};
  const children = tabs.map((t) => {
    const id = String(t.id);
    const kids: unknown[] = [];
    content[id] = { ...(typeof t.value === 'string' ? { value: t.value } : {}), ...(t.disabled === true ? { disabled: true } : {}) };
    const icon = t.icon;
    if (isObj(icon) && icon.kind !== 'none') {
      const iconId = slotId(id, 'icon');
      kids.push({ id: iconId, role: 'icon' });
      content[iconId] = { icon };
    }
    if (typeof t.label === 'string' && t.label !== '') {
      const labelId = slotId(id, 'label');
      kids.push({ id: labelId, role: 'label' });
      content[labelId] = { text: t.label };
    }
    if (isObj(t.style)) {
      const own = Object.fromEntries(Object.entries(t.style).filter(([, val]) => val !== null && val !== undefined));
      if (Object.keys(own).length) items[id] = own;
    }
    return kids.length ? { id, role: 'item', children: kids } : { id, role: 'item' };
  });

  const responsive = isObj(root.responsive) ? root.responsive : {};
  const states = isObj(root.states) ? root.states : {};
  const inter = isObj(root.interactions) ? root.interactions : {};
  const material = isObj(input.material) ? input.material : {};
  const meta = isObj(input.meta) ? input.meta : {};
  const basedOn = typeof meta.basedOn === 'string' ? (legacyTemplate(meta.basedOn)?.replacement ?? meta.basedOn) : null;

  const canonical = {
    format: 'jello-component-definition',
    schemaVersion: 1,
    type: 'mobile-navbar',
    typeVersion: 1,
    id: input.id,
    name: input.name,
    runtime: { min: RUNTIME_VERSION },
    structure: { id: 'root', role: 'navbar', children },
    content,
    layout: root.layout,
    responsive: {
      ...Object.fromEntries(Object.entries(responsive).filter(([k]) => k !== 'breakpoints')),
      ...(responsive.breakpoints !== undefined
        ? {
            breakpoints: Array.isArray(responsive.breakpoints)
              ? responsive.breakpoints.map((b) => (isObj(b) && isObj(b.overrides) ? { ...b, overrides: Object.fromEntries(Object.entries(b.overrides).map(([k, val]) => [toCanonicalPath(k), val])) } : b))
              : responsive.breakpoints,
          }
        : {}),
    },
    style: { appearance: root.appearance, typography: root.typography, icon: root.icon, motion: root.motion, items },
    material: { family: material.family, preset: material.preset ?? null, revision: material.revision ?? null, params: {}, document: material.document },
    states: Object.fromEntries((['active', 'hover', 'pressed', 'focus', 'disabled'] as const).filter((k) => states[k] !== undefined).map((k) => [k, { style: states[k] }])),
    interactions: {
      behavior: { semantics: root.semantics, defaultItem: root.defaultTab, pressFeedback: inter.pressFeedback, wheelForward: inter.wheelForward, reselect: inter.reselect },
      events: inter.events,
    },
    meta: { createdAt: meta.createdAt ?? null, updatedAt: meta.updatedAt ?? null, basedOn, notes: meta.notes ?? '' },
  };

  const r = parseDefinition(canonical);
  return r.ok ? { ...r, migratedFrom: MIGRATED_FROM } : r;
}
