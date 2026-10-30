/**
 * Material binding: how a DOM component gets its surface from whichever
 * family its material belongs to, without knowing which.
 *
 *   const binding = new MaterialBinding({ container, material, source, group });
 *   const surface = binding.attach(host, { radius: 'capsule' });   // BoundSurface
 *   surface.setPressed(true, point);  surface.setHovered(true);  surface.setDisabled(true);
 *   binding.setMaterial(next);        // same family: parameters updated in place
 *                                     // other family: group replaced, every surface re-attached
 *   binding.destroy();
 *
 * A component asks for a surface and reports its state; the family's own
 * group draws it (GlassGroup: SVG / CSS; SolidGroup: CSS variables). Nothing
 * here renders a material: it only chooses the group, re-creates it when the
 * family changes and hands the component one stable `BoundSurface` that keeps
 * its state (disabled, active, hovered) across that change. A shared Glass group
 * (the lab's stage owns one) is used while the material is Glass and left alone
 * otherwise.
 */

import type { GlassSurface } from '../core/surface';
import type { GlassDocument, MaterialDocument } from '../model/document';
import type { BackendRequest } from '../model/support';
import type { GroupStatus } from './glass-group';
import type { BaseMaterialGroup, MaterialStatusBase } from './material-types';
import { createMaterialGroup, type MaterialGroup } from './materials';
import type { SolidGroup, SolidSurface } from './solid-group';

export type Radius = number | 'capsule';

export interface MaterialBindingOptions {
  material: MaterialDocument;
  /** Element the surfaces live in; the Glass source when none is given (CSS backend, no refraction). */
  container: HTMLElement;
  /** GlassSource: opaque element behind the surfaces. Without it Glass runs on `backdrop-filter`. */
  source?: HTMLElement | null;
  /** Shared Glass group owned by the host (not destroyed here). Used only while the material is Glass. */
  group?: MaterialGroup;
  /** Backend of the Glass group created here. */
  backend?: BackendRequest;
}

export interface BoundAttach {
  radius: Radius;
}

/** The surface of one host, whatever family draws it. Stays valid when the family changes. */
export interface BoundSurface {
  readonly host: HTMLElement;
  readonly family: MaterialDocument['family'];
  /** The Glass surface while the material is Glass (lens geometry, rect, frames…), else null. */
  readonly glass: GlassSurface | null;
  /** The Solid surface while the material is Solid (state, style, writes…), else null. */
  readonly solid: SolidSurface | null;
  /** Press feedback. `point` (0–1 inside the host) places Glass's local light; Solid has none. */
  setPressed(pressed: boolean, point?: { x: number; y: number }): void;
  /** Hover. Glass has no hover state: the component draws its own. */
  setHovered(hovered: boolean): void;
  /** Persistent selected / current state. Glass has none. */
  setActive(active: boolean): void;
  /** Disabled look. Glass has none: the component draws its own. */
  setDisabled(disabled: boolean): void;
  setRadius(radius: Radius): void;
}

interface Entry {
  host: HTMLElement;
  radius: Radius;
  flags: { hovered: boolean; active: boolean; disabled: boolean };
  glass: GlassSurface | null;
  solid: SolidSurface | null;
  facade: BoundSurface;
}

export class MaterialBinding {
  private readonly options: MaterialBindingOptions;
  private doc: MaterialDocument;
  private current: BaseMaterialGroup;
  private owned: boolean;
  private readonly records = new Set<Entry>();
  private readonly listeners = new Set<(s: MaterialStatusBase) => void>();
  private off: (() => void) | null = null;
  private readonly reasons: string[] = [];
  private destroyed = false;

  constructor(options: MaterialBindingOptions) {
    this.options = options;
    this.doc = options.material;
    const made = this.make(options.material);
    this.current = made.group;
    this.owned = made.owned;
    this.watch();
  }

  get family(): MaterialDocument['family'] {
    return this.doc.family;
  }

  get material(): MaterialDocument {
    return this.doc;
  }

  /** The group in use (a Glass or a Solid group; the shared one while it is the one drawing). */
  get group(): BaseMaterialGroup {
    return this.current;
  }

  /** The Glass group while the material is Glass. */
  get glassGroup(): MaterialGroup | null {
    return this.doc.family === 'glass' ? (this.current as MaterialGroup) : null;
  }

  get status(): MaterialStatusBase & Partial<GroupStatus> {
    const s = this.current.status as MaterialStatusBase & Partial<GroupStatus>;
    return { ...s, reasons: [...this.reasons, ...s.reasons] };
  }

  onStatus(listener: (s: MaterialStatusBase) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  attach(host: HTMLElement, options: BoundAttach): BoundSurface {
    if (this.destroyed) throw new Error('Il legame è stato distrutto');
    const rec = {} as Entry;
    Object.assign(rec, { host, radius: options.radius, flags: { hovered: false, active: false, disabled: false }, glass: null, solid: null });
    rec.facade = this.facade(rec);
    this.records.add(rec);
    this.open(rec);
    return rec.facade;
  }

  detach(surface: BoundSurface): void {
    for (const rec of this.records) {
      if (rec.facade !== surface) continue;
      this.close(rec);
      this.records.delete(rec);
    }
  }

  /**
   * Same family: the group updates its parameters in place (cheap by
   * construction). Another family: the group is replaced and every surface is
   * attached again to the new one, keeping its state.
   */
  setMaterial(next: MaterialDocument): { familyChanged: boolean } {
    if (this.destroyed) return { familyChanged: false };
    const familyChanged = next.family !== this.doc.family;
    if (!familyChanged) {
      this.doc = next;
      // A shared group is updated by its owner.
      if (this.owned) (this.current as unknown as { setMaterial(d: MaterialDocument): unknown }).setMaterial(next);
      return { familyChanged };
    }
    for (const rec of this.records) this.close(rec);
    this.release();
    this.doc = next;
    const made = this.make(next);
    this.current = made.group;
    this.owned = made.owned;
    this.watch();
    for (const rec of this.records) this.open(rec);
    this.emit();
    return { familyChanged };
  }

  destroy(): void {
    if (this.destroyed) return;
    for (const rec of this.records) this.close(rec);
    this.records.clear();
    this.release();
    this.destroyed = true;
    this.listeners.clear();
  }

  // ---------- internals ----------

  private make(doc: MaterialDocument): { group: BaseMaterialGroup; owned: boolean } {
    this.reasons.length = 0;
    if (doc.family === 'solid') return { group: createMaterialGroup({ material: doc }), owned: true };
    if (this.options.group) return { group: this.options.group, owned: false };
    const source = this.options.source ?? null;
    if (!source) this.reasons.push('Nessuna GlassSource indicata: superficie su backdrop-filter (CSS), senza rifrazione');
    const group = createMaterialGroup({
      source: source ?? this.options.container,
      material: doc as GlassDocument,
      ...(source ? (this.options.backend ? { backend: this.options.backend } : {}) : { backend: 'css' as const }),
    });
    return { group, owned: true };
  }

  private watch() {
    this.off?.();
    this.off = this.current.onStatus(() => this.emit());
  }

  private release() {
    this.off?.();
    this.off = null;
    if (this.owned) this.current.destroy();
  }

  private emit() {
    if (!this.listeners.size) return;
    const s = this.status;
    for (const l of this.listeners) l(s);
  }

  private open(rec: Entry) {
    if (this.doc.family === 'solid') {
      const group = this.current as SolidGroup;
      rec.solid = group.attach(rec.host, { radius: rec.radius, interaction: 'none', flags: { active: rec.flags.active, disabled: rec.flags.disabled } });
      if (rec.flags.hovered) rec.solid.setHovered(true);
    } else {
      rec.glass = (this.current as MaterialGroup).attach(rec.host, { sizing: 'element', radius: rec.radius, interaction: 'none' });
    }
  }

  private close(rec: Entry) {
    if (rec.glass) (this.current as MaterialGroup).detach(rec.glass);
    if (rec.solid) (this.current as SolidGroup).detach(rec.solid);
    rec.glass = null;
    rec.solid = null;
  }

  private facade(rec: Entry): BoundSurface {
    const self = this;
    return {
      host: rec.host,
      get family() {
        return self.doc.family;
      },
      get glass() {
        return rec.glass;
      },
      get solid() {
        return rec.solid;
      },
      setPressed: (pressed, point) => {
        rec.glass?.setPressed(pressed, point);
        rec.solid?.setPressed(pressed);
      },
      setHovered: (hovered) => {
        rec.flags.hovered = hovered;
        rec.solid?.setHovered(hovered);
      },
      setActive: (active) => {
        rec.flags.active = active;
        rec.solid?.setActive(active);
      },
      setDisabled: (disabled) => {
        rec.flags.disabled = disabled;
        rec.solid?.setDisabled(disabled);
      },
      setRadius: (radius) => {
        if (radius === rec.radius) return;
        rec.radius = radius;
        rec.solid?.setRadius(radius);
        // Glass fixes the lens shape when the surface is attached.
        if (rec.glass) {
          this.close(rec);
          this.open(rec);
        }
      },
    };
  }
}
