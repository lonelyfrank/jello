/**
 * Icons of Jello components: a built-in set (24×24, stroke) and custom SVG
 * uploaded by the user.
 *
 * Custom SVG is never inserted as markup. It is parsed into a small tree of
 * allowlisted elements and attributes (shapes, paths, presentation), every
 * value is checked, and the tree is re-serialized by this module; renderers
 * build the nodes with createElementNS from the same tree. Scripts, event
 * handlers, links, styles, external references (url(), href), entities,
 * foreignObject, images and anything not listed below are refused. Pure: no
 * DOM, so components, editor, exporter and tests share one implementation.
 */

export interface SvgNode {
  tag: SvgTag;
  attrs: [string, string][];
  children: SvgNode[];
}

export type SvgTag = 'g' | 'path' | 'circle' | 'ellipse' | 'rect' | 'line' | 'polyline' | 'polygon';

/** `stroke`: outlined like the built-in set; `fill`: solid shapes in the text colour. */
export type IconPaint = 'stroke' | 'fill';

export type IconRef =
  | { kind: 'builtin'; name: string }
  | { kind: 'svg'; name: string; viewBox: string; body: string; paint: IconPaint }
  | { kind: 'none' };

export const SVG_MAX_BYTES = 16 * 1024;
const MAX_NODES = 512;
const MAX_DEPTH = 16;

const TAGS = new Set<SvgTag>(['g', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon']);
/** Dropped with their content: they carry text, never rendering. */
const IGNORED_TAGS = new Set(['title', 'desc', 'metadata']);

const NUM = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?(px|%)?$/i;
const NUM_LIST = /^[\d\s,.eE+-]*$/;
const PATH_DATA = /^[MmZzLlHhVvCcSsQqTtAa\d\s,.eE+-]*$/;
const TRANSFORM = /^(\s*(matrix|translate|scale|rotate|skewX|skewY)\s*\([\d\s,.eE+-]*\)\s*,?)*\s*$/;
const PAINT = /^(none|currentColor|#[0-9a-f]{3}|#[0-9a-f]{6}|#[0-9a-f]{8}|rgba?\(\s*[\d.%\s,/]+\))$/i;

const ATTRS: Record<string, RegExp> = {
  d: PATH_DATA,
  points: NUM_LIST,
  transform: TRANSFORM,
  cx: NUM,
  cy: NUM,
  r: NUM,
  rx: NUM,
  ry: NUM,
  x: NUM,
  y: NUM,
  x1: NUM,
  y1: NUM,
  x2: NUM,
  y2: NUM,
  width: NUM,
  height: NUM,
  fill: PAINT,
  stroke: PAINT,
  'stroke-width': NUM,
  'stroke-linecap': /^(butt|round|square)$/,
  'stroke-linejoin': /^(miter|round|bevel)$/,
  'stroke-miterlimit': NUM,
  'stroke-dasharray': NUM_LIST,
  'stroke-dashoffset': NUM,
  'fill-rule': /^(nonzero|evenodd)$/,
  'clip-rule': /^(nonzero|evenodd)$/,
  opacity: NUM,
  'fill-opacity': NUM,
  'stroke-opacity': NUM,
};

/** Root attributes that are read (viewBox, size) or harmless and dropped silently. */
const ROOT_KNOWN = new Set(['viewBox', 'viewbox', 'width', 'height', 'xmlns', 'xmlns:xlink', 'version', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'class', 'id', 'aria-hidden', 'role', 'focusable']);
/** Attributes dropped without a warning (identity, styling hooks, accessibility on inner nodes). */
const SILENT = new Set(['id', 'class', 'data-name', 'aria-hidden', 'vector-effect', 'shape-rendering']);

export type SvgParse =
  | { ok: true; viewBox: string; nodes: SvgNode[]; paint: IconPaint; root: [string, string][]; warnings: string[] }
  | { ok: false; errors: string[] };

const TAG_RE = /<(\/?)([A-Za-z][\w:.-]*)((?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'))?)*)\s*(\/?)>/y;
const ATTR_RE = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g;

/**
 * Parses SVG markup into the allowlisted tree. Refuses (with every reason)
 * anything that could execute, fetch or style beyond the icon itself.
 */
export function parseSvg(text: string): SvgParse {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (new TextEncoder().encode(text).length > SVG_MAX_BYTES) return { ok: false, errors: [`SVG troppo grande (massimo ${SVG_MAX_BYTES / 1024} KB)`] };
  if (/&/.test(text)) return { ok: false, errors: ['entità XML (&…;) non ammesse'] };
  let src = text.replace(/^﻿/, '').trim();
  src = src.replace(/^<\?xml[^>]*\?>/, '').replace(/<!--[\s\S]*?-->/g, '');
  if (/<!|<\?/.test(src)) return { ok: false, errors: ['DOCTYPE, CDATA e istruzioni di elaborazione non ammessi'] };

  type Frame = { node: SvgNode | null; tag: string; ignored: boolean };
  const stack: Frame[] = [];
  let root: { viewBox: string | null; width: string | null; height: string | null; attrs: [string, string][] } | null = null;
  const top: SvgNode[] = [];
  let count = 0;
  let pos = 0;
  while (pos < src.length) {
    const lt = src.indexOf('<', pos);
    const textChunk = src.slice(pos, lt < 0 ? src.length : lt);
    if (textChunk.trim() && !stack.some((f) => f.ignored)) {
      errors.push('testo fuori dagli elementi non ammesso');
      break;
    }
    if (lt < 0) break;
    TAG_RE.lastIndex = lt;
    const m = TAG_RE.exec(src);
    if (!m) {
      errors.push(`markup non valido vicino a «${src.slice(lt, lt + 24)}»`);
      break;
    }
    pos = TAG_RE.lastIndex;
    const closing = m[1] === '/';
    const name = m[2]!;
    const selfClosing = m[4] === '/';
    if (closing) {
      const f = stack.pop();
      if (!f || f.tag !== name) {
        errors.push(`chiusura inattesa </${name}>`);
        break;
      }
      continue;
    }
    const attrs = readAttrs(m[3] ?? '');
    const inIgnored = stack.some((f) => f.ignored);
    if (inIgnored) {
      if (!selfClosing) stack.push({ node: null, tag: name, ignored: true });
      continue;
    }
    if (!root) {
      if (name !== 'svg') {
        errors.push(`elemento radice atteso <svg>, trovato <${name}>`);
        break;
      }
      const get = (k: string) => attrs.find(([a]) => a === k)?.[1] ?? null;
      root = { viewBox: get('viewBox') ?? get('viewbox'), width: get('width'), height: get('height'), attrs: [] };
      for (const [k, v] of attrs) {
        if (/^on/i.test(k)) errors.push(`svg: attributo ${k} non ammesso`);
        else if (!ROOT_KNOWN.has(k)) warnings.push(`svg: attributo ${k} ignorato`);
        else if (ATTRS[k] && k !== 'width' && k !== 'height') {
          if (ATTRS[k]!.test(v.trim())) root.attrs.push([k, v.trim()]);
          else errors.push(`svg: valore non ammesso per ${k}`);
        }
      }
      if (!selfClosing) stack.push({ node: null, tag: 'svg', ignored: false });
      continue;
    }
    if (stack.length === 0) {
      errors.push('contenuto dopo la chiusura di <svg>');
      break;
    }
    if (IGNORED_TAGS.has(name)) {
      if (!selfClosing) stack.push({ node: null, tag: name, ignored: true });
      continue;
    }
    if (!TAGS.has(name as SvgTag)) {
      errors.push(`elemento <${name}> non ammesso`);
      break;
    }
    if (stack.length > MAX_DEPTH) {
      errors.push('annidamento troppo profondo');
      break;
    }
    if (++count > MAX_NODES) {
      errors.push(`troppi elementi (massimo ${MAX_NODES})`);
      break;
    }
    const node: SvgNode = { tag: name as SvgTag, attrs: [], children: [] };
    for (const [k, v] of attrs) {
      const rule = ATTRS[k];
      if (/^on/i.test(k) || /href$/i.test(k) || k === 'style') {
        errors.push(`<${name}>: attributo ${k} non ammesso`);
      } else if (!rule) {
        if (!SILENT.has(k) && !k.startsWith('data-')) warnings.push(`<${name}>: attributo ${k} ignorato`);
      } else if (v.length > 8192 || !rule.test(v.trim())) {
        errors.push(`<${name}>: valore non ammesso per ${k}`);
      } else node.attrs.push([k, v.trim().replace(/\s+/g, ' ')]);
    }
    const parent = stack[stack.length - 1]!.node;
    (parent ? parent.children : top).push(node);
    if (!selfClosing) stack.push({ node, tag: name, ignored: false });
  }
  if (!errors.length && stack.length) errors.push(`elemento <${stack[stack.length - 1]!.tag}> non chiuso`);
  if (!errors.length && !root) errors.push('nessun elemento <svg>');
  if (!errors.length && count === 0) errors.push('l’icona non contiene forme');
  if (errors.length) return { ok: false, errors };

  const viewBox = normaliseViewBox(root!.viewBox, root!.width, root!.height);
  if (!viewBox) return { ok: false, errors: ['viewBox mancante o non valido'] };
  return { ok: true, viewBox, nodes: top, paint: detectPaint(root!.attrs, top), root: root!.attrs, warnings };
}

function readAttrs(raw: string): [string, string][] {
  const out: [string, string][] = [];
  for (const m of raw.matchAll(ATTR_RE)) out.push([m[1]!, m[2] ?? m[3] ?? '']);
  return out;
}

function normaliseViewBox(vb: string | null, w: string | null, h: string | null): string | null {
  if (vb) {
    const parts = vb.trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts.every(Number.isFinite) && parts[2]! > 0 && parts[3]! > 0) return parts.join(' ');
    return null;
  }
  const nw = Number.parseFloat(w ?? '');
  const nh = Number.parseFloat(h ?? '');
  return Number.isFinite(nw) && Number.isFinite(nh) && nw > 0 && nh > 0 ? `0 0 ${nw} ${nh}` : null;
}

/** Outlined unless the drawing is clearly made of filled shapes. */
function detectPaint(root: [string, string][], nodes: SvgNode[]): IconPaint {
  const rootFill = root.find(([k]) => k === 'fill')?.[1];
  const rootStroke = root.find(([k]) => k === 'stroke')?.[1];
  if (rootStroke && rootStroke !== 'none') return 'stroke';
  if (rootFill === 'none') return 'stroke';
  let strokes = false;
  const walk = (n: SvgNode[]) => {
    for (const x of n) {
      if (x.attrs.some(([k, v]) => k === 'stroke' && v !== 'none')) strokes = true;
      walk(x.children);
    }
  };
  walk(nodes);
  return strokes ? 'stroke' : 'fill';
}

/** Re-serializes the allowlisted tree (children of <svg>). */
export function serializeSvgNodes(nodes: readonly SvgNode[]): string {
  return nodes
    .map((n) => {
      const attrs = n.attrs.map(([k, v]) => ` ${k}="${v}"`).join('');
      return n.children.length ? `<${n.tag}${attrs}>${serializeSvgNodes(n.children)}</${n.tag}>` : `<${n.tag}${attrs}/>`;
    })
    .join('');
}

/** Body markup → tree, for renderers. The body must have been produced by this module. */
export function parseSvgBody(viewBox: string, body: string): SvgParse {
  return parseSvg(`<svg viewBox="${viewBox}">${body}</svg>`);
}

export type IconImport = { ok: true; icon: Extract<IconRef, { kind: 'svg' }>; warnings: string[] } | { ok: false; errors: string[] };

/** A file chosen by the user → a safe icon reference (or every reason it was refused). */
export function iconFromSvg(text: string, name: string): IconImport {
  const r = parseSvg(text);
  if (!r.ok) return r;
  return {
    ok: true,
    icon: { kind: 'svg', name: name.replace(/\.svg$/i, '').replace(/[^\w .-]/g, '').slice(0, 40) || 'icona', viewBox: r.viewBox, body: serializeSvgNodes(r.nodes), paint: r.paint },
    warnings: r.warnings,
  };
}

/** Built-in icons: Jello's own drawings, 24×24, stroke 1.8, round caps. */
export const BUILTIN_ICONS: Readonly<Record<string, { label: string; body: string }>> = {
  home: { label: 'Casa', body: '<path d="M4 10.6 12 4l8 6.6"/><path d="M6.5 9.2V20h11V9.2"/><path d="M10 20v-5.2h4V20"/>' },
  compass: { label: 'Bussola', body: '<circle cx="12" cy="12" r="8.5"/><path d="m15.4 8.6-2.1 4.7-4.7 2.1 2.1-4.7Z"/>' },
  live: {
    label: 'Diretta',
    body: '<circle cx="12" cy="12" r="2.1"/><path d="M8.3 8.3a5.2 5.2 0 0 0 0 7.4M15.7 8.3a5.2 5.2 0 0 1 0 7.4"/><path d="M5.5 5.5a9.2 9.2 0 0 0 0 13M18.5 5.5a9.2 9.2 0 0 1 0 13"/>',
  },
  matrix: { label: 'Griglia', body: '<rect x="4" y="4" width="16" height="16" rx="2.6"/><path d="M9.4 4v16M14.6 4v16M4 9.4h16M4 14.6h16"/>' },
  results: {
    label: 'Coppa',
    body: '<path d="M8 4.5h8v4.8a4 4 0 0 1-8 0V4.5Z"/><path d="M8 6.2H5.2a3 3 0 0 0 2.9 3.6M16 6.2h2.8a3 3 0 0 1-2.9 3.6"/><path d="M12 13.3v3.4M9 20h6M10.2 16.7h3.6"/>',
  },
  target: { label: 'Bersaglio', body: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1.2"/>' },
  search: { label: 'Cerca', body: '<circle cx="10.8" cy="10.8" r="6"/><path d="m15.4 15.4 4.6 4.6"/>' },
  user: { label: 'Profilo', body: '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.8 20a7.2 7.2 0 0 1 14.4 0"/>' },
  settings: {
    label: 'Impostazioni',
    body: '<circle cx="12" cy="12" r="3"/><path d="M12 3.5v2.6M12 17.9v2.6M3.5 12h2.6M17.9 12h2.6M6 6l1.8 1.8M16.2 16.2 18 18M6 18l1.8-1.8M16.2 7.8 18 6"/>',
  },
  bell: { label: 'Notifiche', body: '<path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 1.5H5Z"/><path d="M10 20.5h4"/>' },
  heart: { label: 'Preferiti', body: '<path d="M12 19.5s-7-4.3-7-9.6A3.9 3.9 0 0 1 12 7.6a3.9 3.9 0 0 1 7 2.3c0 5.3-7 9.6-7 9.6Z"/>' },
  star: { label: 'Stella', body: '<path d="m12 4 2.4 5 5.4.7-4 3.8 1 5.4L12 16.3l-4.8 2.6 1-5.4-4-3.8 5.4-.7Z"/>' },
  calendar: { label: 'Calendario', body: '<rect x="4" y="5.5" width="16" height="14.5" rx="2.4"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>' },
  chat: { label: 'Messaggi', body: '<path d="M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v8.5A1.5 1.5 0 0 1 19 17h-8l-4.5 3.5V17H5a1.5 1.5 0 0 1-1.5-1.5V7A1.5 1.5 0 0 1 5 5.5Z"/>' },
  list: { label: 'Elenco', body: '<path d="M9 7h11M9 12h11M9 17h11"/><circle cx="5" cy="7" r="1"/><circle cx="5" cy="12" r="1"/><circle cx="5" cy="17" r="1"/>' },
  chart: { label: 'Statistiche', body: '<path d="M4 20h16"/><path d="M7 16v-5M12 16V6M17 16v-8"/>' },
  map: { label: 'Mappa', body: '<path d="m9 5-5 2v12l5-2 6 2 5-2V5l-5 2Z"/><path d="M9 5v12M15 7v12"/>' },
  cart: { label: 'Carrello', body: '<path d="M3.5 5h2.2l2 10.5h10l1.8-7.5H7"/><circle cx="9.5" cy="19" r="1.3"/><circle cx="16.5" cy="19" r="1.3"/>' },
  play: { label: 'Riproduci', body: '<circle cx="12" cy="12" r="8.5"/><path d="M10.2 8.6v6.8l5.4-3.4Z"/>' },
  plus: { label: 'Aggiungi', body: '<circle cx="12" cy="12" r="8.5"/><path d="M12 8v8M8 12h8"/>' },
};

export const BUILTIN_ICON_NAMES = Object.keys(BUILTIN_ICONS);

/** View box and allowlisted tree of any icon reference (null for `none` or an unknown name). */
export function iconTree(icon: IconRef): { viewBox: string; nodes: SvgNode[]; paint: IconPaint } | null {
  if (icon.kind === 'none') return null;
  if (icon.kind === 'builtin') {
    const b = BUILTIN_ICONS[icon.name];
    if (!b) return null;
    const r = parseSvgBody('0 0 24 24', b.body);
    return r.ok ? { viewBox: '0 0 24 24', nodes: r.nodes, paint: 'stroke' } : null;
  }
  const r = parseSvgBody(icon.viewBox, icon.body);
  return r.ok ? { viewBox: icon.viewBox, nodes: r.nodes, paint: icon.paint } : null;
}
