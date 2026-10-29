/**
 * Which parameters act on what is on screen. Two levels:
 * - `disabled`: the control cannot affect the current object (the navbar is
 *   sized by CSS layout, so capsule width/height are not navbar controls);
 * - `inactive`: the value is kept but not used right now (path, reduced
 *   motion); the control stays editable so it can be prepared in advance.
 */

import type { GlassParams, ParamKey, RenderPath } from '../core';
import type { ObjectKind, PreviewMode } from '../stage/view';

export interface Applicability {
  disabled: boolean;
  note: string;
}

export interface ApplicabilityInput {
  object: ObjectKind;
  path: RenderPath;
  motionReduced: boolean;
  params: Pick<GlassParams, 'shape'>;
  /** Scene mode: the lens is free and sized by geometry, like the capsule. */
  mode?: PreviewMode;
}

const LENS_ONLY: ParamKey[] = ['band', 'refraction', 'profile', 'dome', 'chroma'];
const MATERIAL_FILTER: ParamKey[] = ['blur', 'saturation'];
const SURFACE_TINT: ParamKey[] = ['tint', 'tintOpacity', 'light', 'lightAngle'];
const PRESS: ParamKey[] = ['pressScale', 'pressRefraction', 'pressLight'];

const LAYOUT_NOTE: Record<Exclude<ObjectKind, 'capsule'>, string> = {
  navbar: 'La navbar prende le dimensioni dal layout CSS dell’anteprima.',
  button: 'Il pulsante prende le dimensioni dal layout CSS dell’anteprima.',
  card: 'La card prende le dimensioni dal layout CSS dell’anteprima.',
  dialog: 'Il pannello prende le dimensioni dal layout CSS dell’anteprima.',
};

export function applicability(input: ApplicabilityInput): Map<ParamKey, Applicability> {
  const out = new Map<ParamKey, Applicability>();
  const set = (keys: ParamKey[], disabled: boolean, note: string) => {
    for (const k of keys) if (!out.has(k)) out.set(k, { disabled, note });
  };
  const free = input.mode === 'scene' || input.object === 'capsule';

  if (!free) {
    const o = input.object as Exclude<ObjectKind, 'capsule'>;
    set(['width', 'height'], true, LAYOUT_NOTE[o]);
    set(['shape', 'radius'], true, o === 'navbar' || o === 'button' ? 'Sempre una capsula (raggio = metà dell’altezza).' : 'Raggio fissato dal componente.');
    set(['stretch'], true, 'Solo per la lente trascinabile: questo componente non si sposta.');
    if (o === 'card' || o === 'dialog') set(PRESS, true, 'Il componente non risponde alla pressione: i suoi controlli interni sì.');
  } else if (input.params.shape === 'capsule') {
    set(['radius'], true, 'Usato solo con la forma rounded.');
  }

  if (input.mode !== 'scene') {
    if (input.path === 'satin') {
      set(LENS_ONLY, false, 'Non usato dal percorso satinato (nessuna lente).');
    } else if (input.path === 'opaque') {
      set([...LENS_ONLY, ...MATERIAL_FILTER, ...SURFACE_TINT], false, 'Non usato dal percorso opaco.');
    }
  }
  if (input.motionReduced) {
    set(['stiffness', 'damping', 'stretch', 'pressScale', 'pressRefraction'], false, 'Disattivato dal movimento ridotto.');
  }
  return out;
}
