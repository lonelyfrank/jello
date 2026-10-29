/**
 * Refraction renderer: one SVG filter applied with `filter: url(#…)` to an
 * explicit GlassSource element (never `backdrop-filter: url(…)`).
 *
 * Each lens adds a small primitive chain whose subregions are limited to the
 * lens rectangle, so only that region is blurred, displaced and clipped; the
 * rest of the source passes through `feMerge` untouched. Foreground content is
 * not a descendant of the source and is therefore never part of the input.
 *
 * Update paths, cheapest first:
 * - position / transient scale → subregion attributes only;
 * - refraction, blur, saturation → primitive attributes only;
 * - chroma on/off → rebuild of that lens' chain (no new map);
 * - geometry (size, radius, band, profile, dome) → new map, cached by key.
 */

import { computeLensMap, geometryKey, type LensGeometry, type LensMap } from '../geometry';

const SVG_NS = 'http://www.w3.org/2000/svg';

export interface LensInput {
  /** Unscaled rect in source coordinates (CSS px from the source border box). */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Transient scale around the lens centre (press, stretch). The map is stretched, not rebuilt. */
  scaleX: number;
  scaleY: number;
  geometry: LensGeometry;
  refraction: number;
  blur: number;
  saturation: number;
  chroma: number;
}

export interface FilterStats {
  mapRegenerations: number;
  mapCacheHits: number;
  chainBuilds: number;
  attributeWrites: number;
  idRefreshes: number;
}

export interface SourceFilterOptions {
  /** Map pixels per CSS px. */
  resolution?: number;
  /**
   * Assign a fresh filter id on every update. Needed where the engine caches
   * filter output by id (reported for Safari by Aave and liquid-glass-web-react).
   */
  refreshIdOnUpdate?: boolean;
  encodeMap?: (map: LensMap) => string;
  mapCacheSize?: number;
}

interface LensNodes {
  group: SVGElement[];
  image: SVGElement;
  regionNodes: SVGElement[];
  padNodes: SVGElement[];
  blur: SVGElement;
  saturate: SVGElement;
  displacements: SVGElement[];
}

interface LensRecord {
  index: number;
  input: LensInput;
  key: string;
  url: string;
  chromatic: boolean;
  nodes: LensNodes;
}

let instances = 0;

export function encodeMapAsPng(map: LensMap): string {
  const canvas = document.createElement('canvas');
  canvas.width = map.width;
  canvas.height = map.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D non disponibile per la mappa di displacement');
  const image = ctx.createImageData(map.width, map.height);
  image.data.set(map.data);
  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL('image/png');
}

export class SourceFilter {
  readonly stats: FilterStats = {
    mapRegenerations: 0,
    mapCacheHits: 0,
    chainBuilds: 0,
    attributeWrites: 0,
    idRefreshes: 0,
  };

  private readonly source: HTMLElement;
  private readonly svg: SVGSVGElement;
  private readonly filter: SVGElement;
  private readonly merge: SVGElement;
  private readonly baseId: string;
  private readonly resolution: number;
  private readonly refreshId: boolean;
  private readonly encode: (map: LensMap) => string;
  private readonly cacheSize: number;
  private readonly cache = new Map<string, string>();
  private readonly lenses = new Map<string, LensRecord>();
  private readonly written = new WeakMap<Element, Map<string, string>>();
  private nextIndex = 0;
  private version = 0;
  private active = false;
  private dirty = false;
  private commitQueued = false;
  private size = { width: 0, height: 0 };

  constructor(source: HTMLElement, options: SourceFilterOptions = {}) {
    this.source = source;
    this.resolution = options.resolution ?? 1;
    this.refreshId = options.refreshIdOnUpdate ?? false;
    this.encode = options.encodeMap ?? encodeMapAsPng;
    this.cacheSize = options.mapCacheSize ?? 32;
    this.baseId = `jello-glass-${++instances}`;

    const doc = source.ownerDocument;
    this.svg = doc.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
    this.svg.setAttribute('aria-hidden', 'true');
    this.svg.setAttribute('focusable', 'false');
    this.svg.setAttribute('width', '0');
    this.svg.setAttribute('height', '0');
    this.svg.setAttribute('data-jello-filters', '');
    // Not display:none: some engines drop filters defined in non-rendered SVG.
    this.svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
    const defs = doc.createElementNS(SVG_NS, 'defs');
    this.filter = this.fe('filter', {
      id: this.baseId,
      filterUnits: 'userSpaceOnUse',
      primitiveUnits: 'userSpaceOnUse',
      'color-interpolation-filters': 'sRGB',
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    });
    this.merge = this.fe('feMerge', {});
    this.merge.appendChild(this.fe('feMergeNode', { in: 'SourceGraphic' }));
    this.filter.appendChild(this.merge);
    defs.appendChild(this.filter);
    this.svg.appendChild(defs);
    doc.body.appendChild(this.svg);
  }

  get id(): string {
    return this.filter.id;
  }

  get lensCount(): number {
    return this.lenses.size;
  }

  /** Source border-box size; sets the filter region. */
  resize(width: number, height: number): void {
    if (width === this.size.width && height === this.size.height) return;
    this.size = { width, height };
    this.attr(this.filter, 'width', width);
    this.attr(this.filter, 'height', height);
    this.markDirty();
  }

  setActive(active: boolean): void {
    if (this.active === active) return;
    this.active = active;
    this.applyFilterProperty();
  }

  upsert(id: string, input: LensInput): void {
    const key = geometryKey(input.geometry, this.resolution);
    let record = this.lenses.get(id);
    const chromatic = input.chroma > 0;
    if (!record) {
      const url = this.mapFor(input.geometry, key);
      const index = this.nextIndex++;
      record = { index, input, key, url, chromatic, nodes: this.buildChain(index, chromatic, url) };
      this.lenses.set(id, record);
      this.mergeAppend(index);
      this.applyFilterProperty();
    } else {
      if (record.key !== key) {
        record.key = key;
        record.url = this.mapFor(input.geometry, key);
        this.attr(record.nodes.image, 'href', record.url);
      }
      if (record.chromatic !== chromatic) {
        for (const node of record.nodes.group) node.remove();
        record.chromatic = chromatic;
        record.nodes = this.buildChain(record.index, chromatic, record.url);
      }
      record.input = input;
    }
    this.writeLens(record);
    this.markDirty();
  }

  remove(id: string): void {
    const record = this.lenses.get(id);
    if (!record) return;
    for (const node of record.nodes.group) node.remove();
    this.merge.querySelector(`[in="l${record.index}"]`)?.remove();
    this.lenses.delete(id);
    this.applyFilterProperty();
    this.markDirty();
  }

  /** Current map of a lens, for inspection (lab, tests). */
  mapOf(id: string): { url: string; key: string } | null {
    const record = this.lenses.get(id);
    return record ? { url: record.url, key: record.key } : null;
  }

  destroy(): void {
    this.source.style.removeProperty('filter');
    this.svg.remove();
    this.lenses.clear();
    this.cache.clear();
    this.active = false;
  }

  private mapFor(geometry: LensGeometry, key: string): string {
    const hit = this.cache.get(key);
    if (hit) {
      this.stats.mapCacheHits++;
      // Refresh LRU order.
      this.cache.delete(key);
      this.cache.set(key, hit);
      return hit;
    }
    const url = this.encode(computeLensMap(geometry, this.resolution));
    this.stats.mapRegenerations++;
    this.cache.set(key, url);
    if (this.cache.size > this.cacheSize) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    return url;
  }

  private buildChain(n: number, chromatic: boolean, url: string): LensNodes {
    this.stats.chainBuilds++;
    const group: SVGElement[] = [];
    const add = (name: string, attrs: Record<string, string | number>) => {
      const el = this.fe(name, attrs);
      group.push(el);
      return el;
    };
    const image = add('feImage', { href: url, preserveAspectRatio: 'none', result: `m${n}` });
    const mask = add('feColorMatrix', {
      in: `m${n}`,
      type: 'matrix',
      // Coverage (blue) becomes alpha.
      values: '0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 1 0 0',
      result: `k${n}`,
    });
    const blur = add('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: 0, result: `b${n}` });
    const saturate = add('feColorMatrix', { in: 'SourceGraphic', type: 'saturate', values: 1, result: `s${n}` });
    const displacements: SVGElement[] = [];
    const regionNodes: SVGElement[] = [image, mask];
    if (!chromatic) {
      const d = add('feDisplacementMap', {
        in: `s${n}`,
        in2: `m${n}`,
        scale: 0,
        xChannelSelector: 'R',
        yChannelSelector: 'G',
        result: `d${n}`,
      });
      displacements.push(d);
      regionNodes.push(d);
    } else {
      const keep = [
        '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0',
        '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0',
        '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0',
      ];
      keep.forEach((values, c) => {
        const d = add('feDisplacementMap', {
          in: `s${n}`,
          in2: `m${n}`,
          scale: 0,
          xChannelSelector: 'R',
          yChannelSelector: 'G',
        });
        displacements.push(d);
        regionNodes.push(d);
        regionNodes.push(add('feColorMatrix', { type: 'matrix', values, result: `c${n}_${c}` }));
      });
      regionNodes.push(
        add('feComposite', { in: `c${n}_0`, in2: `c${n}_1`, operator: 'arithmetic', k2: 1, k3: 1, result: `c${n}_01` }),
      );
      // Each isolated channel keeps alpha; the sum saturates it back to 1 on opaque sources.
      regionNodes.push(
        add('feComposite', { in: `c${n}_01`, in2: `c${n}_2`, operator: 'arithmetic', k2: 1, k3: 1, result: `d${n}` }),
      );
    }
    regionNodes.push(add('feComposite', { in: `d${n}`, in2: `k${n}`, operator: 'in', result: `l${n}` }));
    for (const node of group) this.filter.insertBefore(node, this.merge);
    return { group, image, regionNodes, padNodes: [blur, saturate], blur, saturate, displacements };
  }

  private mergeAppend(n: number) {
    this.merge.appendChild(this.fe('feMergeNode', { in: `l${n}` }));
  }

  private writeLens(record: LensRecord) {
    const { input, nodes } = record;
    const w = input.width * input.scaleX;
    const h = input.height * input.scaleY;
    const x = input.x + (input.width - w) / 2;
    const y = input.y + (input.height - h) / 2;
    for (const node of nodes.regionNodes) this.region(node, x, y, w, h);
    // Blur and saturation feed the displacement, which samples up to
    // |refraction| px outside the lens rect: their subregion is inflated.
    const pad = Math.ceil(Math.abs(input.refraction) * Math.max(input.scaleX, input.scaleY) + 3 * input.blur + 2);
    for (const node of nodes.padNodes) this.region(node, x - pad, y - pad, w + 2 * pad, h + 2 * pad);
    this.attr(nodes.blur, 'stdDeviation', round(input.blur));
    // stdDeviation 0 is not handled consistently across engines: bypass instead.
    this.attr(nodes.saturate, 'in', input.blur > 0 ? `b${record.index}` : 'SourceGraphic');
    this.attr(nodes.saturate, 'values', round(input.saturation / 100));
    const scale = 2 * input.refraction;
    if (nodes.displacements.length === 1) {
      this.attr(nodes.displacements[0]!, 'scale', round(scale));
    } else {
      const spread = 0.12 * input.chroma;
      const factors = [1 + spread, 1, 1 - spread];
      nodes.displacements.forEach((d, i) => this.attr(d, 'scale', round(scale * (factors[i] ?? 1))));
    }
  }

  private region(node: SVGElement, x: number, y: number, w: number, h: number) {
    this.attr(node, 'x', round(x));
    this.attr(node, 'y', round(y));
    this.attr(node, 'width', round(Math.max(0, w)));
    this.attr(node, 'height', round(Math.max(0, h)));
  }

  private attr(el: Element, name: string, value: string | number) {
    const v = String(value);
    let map = this.written.get(el);
    if (!map) {
      map = new Map();
      this.written.set(el, map);
    }
    if (map.get(name) === v) return;
    map.set(name, v);
    el.setAttribute(name, v);
    this.stats.attributeWrites++;
  }

  private fe(name: string, attrs: Record<string, string | number>): SVGElement {
    const el = this.source.ownerDocument.createElementNS(SVG_NS, name) as SVGElement;
    for (const [k, v] of Object.entries(attrs)) this.attr(el, k, v);
    return el;
  }

  private applyFilterProperty() {
    const on = this.active && this.lenses.size > 0;
    if (on) this.source.style.setProperty('filter', `url("#${this.filter.id}")`);
    else this.source.style.removeProperty('filter');
  }

  private markDirty() {
    if (!this.refreshId) return;
    this.dirty = true;
    if (this.commitQueued) return;
    this.commitQueued = true;
    queueMicrotask(() => {
      this.commitQueued = false;
      if (!this.dirty) return;
      this.dirty = false;
      this.filter.id = `${this.baseId}-v${++this.version}`;
      this.stats.idRefreshes++;
      this.applyFilterProperty();
    });
  }
}

const round = (v: number) => Math.round(v * 100) / 100;
