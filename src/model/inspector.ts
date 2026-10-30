/**
 * The inspector of a material, as data.
 *
 * Everything an editor needs to show and change a material is already in the
 * registry: the descriptors (type, unit, range, step, default, group, stage,
 * description), the groups in display order, the per-state override keys and
 * `read` / `customize`. This module only assembles it into the model a panel
 * renders, identically for every family, so Glass and Solid share one panel
 * instead of each having its own:
 *
 *   const model = inspectorModel(MATERIALS.get(doc.family)!, doc);
 *   model.groups[0].controls[0]          // { key, kind: 'slider', label, unit, min, max, step, value, … }
 *   applyControl(def, doc, { key }, 12)  // → { ok: true, doc } | { ok: false, error }
 *
 * Pure data: no React, no DOM. What it does not decide: which controls apply
 * to what is on screen (the lab's `applicability`, the per-backend support
 * notes of Glass). Those are renderer-specific and come from the host.
 */

import type { Descriptor } from '../core/descriptors';
import { checkValue } from '../core/descriptors';
import { controlGroups, type MaterialDefinition, type MaterialStateId } from './registry';
import type { MaterialFeature } from './families';
import type { MaterialDocument } from './document';

export type ControlKind = 'slider' | 'select' | 'color';

export interface InspectorControl {
  /** Parameter key (or state-override key). */
  key: string;
  /** Group id of the family (`optics`, `surface`…), or `states` for per-state overrides. */
  group: string;
  kind: ControlKind;
  label: string;
  description: string;
  /** Pipeline stage the parameter touches: lets a host skip expensive work for cheap edits. */
  stage: string;
  default: number | string;
  /** Effective value now. For a state override, the override or, when absent, the value it inherits. */
  value: number | string;
  /** Number controls. */
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  /** Select controls. */
  options?: readonly { value: string; label: string }[];
  /** Per-state controls: the state, and whether the document overrides the inherited value. */
  state?: MaterialStateId;
  overridden?: boolean;
}

export interface InspectorGroup {
  id: string;
  label: string;
  controls: InspectorControl[];
}

export interface InspectorStateSection {
  state: MaterialStateId;
  controls: InspectorControl[];
}

export interface InspectorModel {
  family: string;
  name: string;
  groups: InspectorGroup[];
  /** One section per state that can carry overrides. Empty for families without per-state values. */
  states: InspectorStateSection[];
  features: readonly MaterialFeature[];
  interactions: readonly string[];
}

const kindOf = (d: Descriptor): ControlKind => (d.type === 'number' ? 'slider' : d.type === 'enum' ? 'select' : 'color');

function control(d: Descriptor, value: unknown, extra: Partial<InspectorControl> = {}): InspectorControl {
  const c: InspectorControl = {
    key: d.key,
    group: d.group,
    kind: kindOf(d),
    label: d.label,
    description: d.description,
    stage: d.affects,
    default: d.default,
    value: (value ?? d.default) as number | string,
    ...extra,
  };
  if (d.type === 'number') Object.assign(c, { unit: d.unit, min: d.min, max: d.max, step: d.step });
  if (d.type === 'enum') c.options = d.options.map((o) => ({ value: o, label: o }));
  return c;
}

/** States that can carry overrides: the ones the family renders, minus `default` (the material itself). */
const overridable = (def: MaterialDefinition): MaterialStateId[] => (def.stateParams.length ? def.states.filter((s) => s !== 'default') : []);

export function inspectorModel(def: MaterialDefinition, doc: MaterialDocument): InspectorModel {
  const values = def.read(doc);
  const byKey = new Map(def.params.map((d) => [d.key, d]));
  const groups = controlGroups(def).map((g) => ({
    id: g.id,
    label: g.label,
    controls: g.keys.map((k) => control(byKey.get(k)!, values.params[k])),
  }));
  const states = overridable(def).map((state) => ({
    state,
    controls: def.stateParams.map((d) => {
      const own = values.states[state]?.[d.key];
      // A state key shared with the material inherits the material's value; the others inherit their neutral default.
      const inherited = d.key in values.params ? values.params[d.key] : d.default;
      return control(d, own ?? inherited, { group: 'states', state, overridden: own !== undefined });
    }),
  }));
  return { family: def.id, name: def.name, groups, states, features: def.features, interactions: def.interactions };
}

export interface ControlTarget {
  key: string;
  /** Set to change a per-state override instead of the material. */
  state?: MaterialStateId;
}

export type ControlResult = { ok: true; doc: MaterialDocument } | { ok: false; error: string };

/** Sets one control. Invalid values and unknown keys are refused with a reason; nothing is applied. */
export function applyControl(def: MaterialDefinition, doc: MaterialDocument, target: ControlTarget, value: unknown): ControlResult {
  if (doc.family !== def.id) return { ok: false, error: `Il documento è di famiglia «${doc.family}», non «${def.id}»` };
  const table = target.state ? def.stateParams : def.params;
  const d = table.find((x) => x.key === target.key);
  if (!d) return { ok: false, error: `${target.state ? `${target.state}.` : ''}${target.key}: parametro sconosciuto per ${def.name}` };
  if (target.state && !overridable(def).includes(target.state)) return { ok: false, error: `${def.name} non rende lo stato «${target.state}»` };
  const error = checkValue(d, value);
  if (error) return { ok: false, error };
  const v = d.type === 'color' ? String(value).toLowerCase() : value;
  const next = target.state ? def.customize(doc, { states: { [target.state]: { [target.key]: v } } }) : def.customize(doc, { params: { [target.key]: v } });
  return { ok: true, doc: next };
}
