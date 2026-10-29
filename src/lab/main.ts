import '../core/glass.css';
import './lab.css';
import {
  GlassContext,
  bindDrag,
  bindPress,
  computeLensMap,
  defaultParams,
  effectiveRadius,
  encodeMapAsPng,
  parseParams,
  presetById,
  serializeParams,
  type ContextStatus,
  type GlassParams,
  type GlassSurface,
  type ParamKey,
} from '../core';
import { Panel, type LabOptions } from './panel';
import { renderScene, SCENES, type SceneId } from './scenes';
import { VERIFICATION } from './verification';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} mancante`);
  return el as T;
};

// ---------- initial state (URL parameters make scenarios reproducible) ----------

const query = new URLSearchParams(location.search);
const flag = (name: string, fallback: boolean) => (query.has(name) ? query.get(name) !== '0' : fallback);
const systemReducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const isScene = (v: string | null): v is SceneId => SCENES.some((s) => s.id === v);
const PATHS = ['auto', 'refraction', 'satin', 'opaque'] as const;

let presetId: string | null = presetById(query.get('preset') ?? '')?.id ?? 'jello';
let params: GlassParams = { ...(presetById(presetId ?? '')?.params ?? defaultParams()) };
const opts: LabOptions = {
  scene: isScene(query.get('scene')) ? (query.get('scene') as SceneId) : 'grid',
  animate: flag('animate', !systemReducedMotion.matches),
  theme: (['light', 'dark'] as const).find((t) => t === query.get('theme')) ?? 'system',
  path: PATHS.find((p) => p === query.get('path')) ?? 'auto',
  compare: flag('compare', false),
  showMap: flag('map', false),
  components: flag('components', true),
  reduceMotion: flag('reduceMotion', false),
  reduceTransparency: flag('reduceTransparency', false),
};
let localImage: string | null = null;

// ---------- stages ----------

interface Stage {
  root: HTMLElement;
  source: HTMLElement;
  scroller: HTMLElement;
  overlay: HTMLElement;
  ctx: GlassContext;
  capsule: GlassSurface;
  bounds: { width: number; height: number };
  cleanups: (() => void)[];
}

function createStage(rootId: string, sourceId: string, capsuleId: string, path: LabOptions['path']): Stage {
  const root = $(rootId);
  const source = $(sourceId);
  const scroller = source.querySelector<HTMLElement>('.scroller')!;
  const overlay = root.querySelector<HTMLElement>('.overlay')!;
  const ctx = new GlassContext({ source, path, verification: VERIFICATION });
  ctx.setManualReduceMotion(opts.reduceMotion);
  ctx.setManualReduceTransparency(opts.reduceTransparency);
  const capsule = ctx.attach($(capsuleId), { params, sizing: 'params' });
  const stage: Stage = { root, source, scroller, overlay, ctx, capsule, bounds: { width: 0, height: 0 }, cleanups: [] };
  const ro = new ResizeObserver(() => {
    stage.bounds = { width: overlay.clientWidth, height: overlay.clientHeight };
    keepInside(stage);
  });
  ro.observe(overlay);
  stage.bounds = { width: overlay.clientWidth, height: overlay.clientHeight };
  stage.cleanups.push(
    () => ro.disconnect(),
    bindDrag(capsule, {
      bounds: () => stage.bounds,
      onMove: (x, y) => {
        for (const other of stages()) if (other !== stage) other.capsule.setPosition(x, y);
      },
    }),
  );
  return stage;
}

function destroyStage(stage: Stage) {
  for (const c of stage.cleanups.splice(0)) c();
  stage.ctx.destroy();
}

function keepInside(stage: Stage) {
  const { x, y } = stage.capsule.position;
  const maxX = Math.max(0, stage.bounds.width - params.width);
  const maxY = Math.max(0, stage.bounds.height - params.height);
  if (x > maxX || y > maxY) stage.capsule.setPosition(Math.min(x, maxX), Math.min(y, maxY), true);
}

function centerPosition(stage: Stage) {
  return {
    x: Math.max(0, (stage.bounds.width - params.width) / 2),
    y: Math.max(0, Math.min(stage.bounds.height * 0.28, stage.bounds.height - params.height)),
  };
}

const main = createStage('stageMain', 'sourceMain', 'capsuleMain', opts.path);
let compare: Stage | null = null;
const stages = () => (compare ? [main, compare] : [main]);

// ---------- components: button, three-option selector, native slider ----------

interface Components {
  surfaces: GlassSurface[];
  cleanups: (() => void)[];
}
let components: Components | null = null;
const dock = $('dock');
const button = $('centerButton') as HTMLButtonElement;
const segmented = $('sceneSegmented');
const slider = $('refractionSlider');
const range = $('refractionRange') as HTMLInputElement;
const thumb = slider.querySelector<HTMLElement>('.glass-thumb')!;

function mountComponents() {
  if (components) return;
  dock.hidden = false;
  const s = [
    main.ctx.attach(button, { params, sizing: 'element' }),
    main.ctx.attach(segmented, { params, sizing: 'element' }),
    main.ctx.attach(thumb, { params, sizing: 'element' }),
  ];
  components = {
    surfaces: s,
    cleanups: [bindPress(s[0]!, button), bindPress(s[1]!, segmented), bindPress(s[2]!, slider)],
  };
}

function unmountComponents() {
  if (!components) return;
  for (const c of components.cleanups) c();
  for (const s of components.surfaces) s.destroy();
  components = null;
  dock.hidden = true;
}

button.addEventListener('click', () => {
  const c = centerPosition(main);
  for (const st of stages()) st.capsule.setPosition(c.x, c.y);
});

segmented.addEventListener('change', (e) => {
  const input = e.target as HTMLInputElement;
  if (isScene(input.value)) setOption('scene', input.value);
});

function syncSlider() {
  range.value = String(params.refraction);
  const min = Number(range.min);
  const max = Number(range.max);
  slider.style.setProperty('--v', String((params.refraction - min) / (max - min)));
  const thumbSurface = components?.surfaces[2];
  if (thumbSurface) main.ctx.requestMeasure(thumbSurface);
}

range.addEventListener('input', () => setParam('refraction', range.valueAsNumber));

function syncSegmented() {
  const radios = [...segmented.querySelectorAll<HTMLInputElement>('input[type=radio]')];
  const index = radios.findIndex((r) => r.value === opts.scene);
  radios.forEach((r, i) => (r.checked = i === index));
  segmented.style.setProperty('--seg-index', String(Math.max(0, index)));
  segmented.toggleAttribute('data-has-selection', index >= 0);
  const indicator = components?.surfaces[1];
  if (indicator) main.ctx.requestMeasure(indicator);
}

// ---------- applying state ----------

function allSurfaces(): GlassSurface[] {
  return [...stages().map((s) => s.capsule), ...(components?.surfaces ?? [])];
}

function applyParams() {
  for (const s of allSurfaces()) s.setParams(params);
  for (const st of stages()) keepInside(st);
  panel.setParams(params);
  panel.setPreset(presetId);
  syncSlider();
  scheduleReport();
}

function setParam(key: ParamKey, value: GlassParams[ParamKey]) {
  if (params[key] === value) return;
  params = { ...params, [key]: value };
  presetId = null;
  applyParams();
}

function renderScenes() {
  for (const st of stages()) renderScene(st.scroller, opts.scene, localImage ?? undefined);
  syncSegmented();
  syncAnimations();
}

function syncAnimations() {
  const on = opts.animate && !main.ctx.motionReduced;
  $('stages').classList.toggle('is-animated', on);
  // Start every background animation at the same instant so the compared stages match.
  const t = document.timeline.currentTime;
  if (on && t !== null) {
    for (const st of stages()) for (const a of st.scroller.getAnimations({ subtree: true })) a.startTime = t;
  }
}

function applyTheme() {
  document.documentElement.dataset.theme = opts.theme;
}

function setCompare(on: boolean) {
  const root = $('stageCompare');
  if (on && !compare) {
    root.hidden = false;
    $('stages').dataset.compare = 'on';
    compare = createStage('stageCompare', 'sourceCompare', 'capsuleCompare', 'satin');
    compare.capsule.setParams(params);
    const p = main.capsule.position;
    compare.capsule.setPosition(p.x, p.y, true);
    renderScene(compare.scroller, opts.scene, localImage ?? undefined);
    const a = main.scroller;
    const b = compare.scroller;
    let syncing = false;
    const sync = (from: HTMLElement, to: HTMLElement) => () => {
      if (syncing) return;
      syncing = true;
      to.scrollTop = from.scrollTop;
      requestAnimationFrame(() => (syncing = false));
    };
    const ab = sync(a, b);
    const ba = sync(b, a);
    a.addEventListener('scroll', ab, { passive: true });
    b.addEventListener('scroll', ba, { passive: true });
    b.scrollTop = a.scrollTop;
    compare.cleanups.push(() => a.removeEventListener('scroll', ab), () => b.removeEventListener('scroll', ba));
    compare.ctx.onChange(() => scheduleReport());
    syncAnimations();
  } else if (!on && compare) {
    destroyStage(compare);
    compare = null;
    root.hidden = true;
    $('stages').dataset.compare = 'off';
  }
  // Both stages resize: remeasure.
  main.ctx.measureAll();
}

function setOption<K extends keyof LabOptions>(key: K, value: LabOptions[K]) {
  opts[key] = value;
  panel.setOption(key, value);
  switch (key) {
    case 'scene':
      renderScenes();
      break;
    case 'animate':
      syncAnimations();
      break;
    case 'theme':
      applyTheme();
      break;
    case 'path':
      main.ctx.setPath(opts.path);
      break;
    case 'compare':
      setCompare(opts.compare);
      break;
    case 'components':
      if (opts.components) mountComponents();
      else unmountComponents();
      syncSlider();
      syncSegmented();
      break;
    case 'reduceMotion':
      for (const st of stages()) st.ctx.setManualReduceMotion(opts.reduceMotion);
      syncAnimations();
      break;
    case 'reduceTransparency':
      for (const st of stages()) st.ctx.setManualReduceTransparency(opts.reduceTransparency);
      break;
    case 'showMap':
      $('stages').classList.toggle('show-map', opts.showMap);
      break;
  }
  scheduleReport();
}

// ---------- reporting (event-driven, never per frame) ----------

const PATH_LABEL = { refraction: 'Rifrazione SVG', satin: 'Satinato CSS', opaque: 'Opaco' } as const;
const REQUEST_LABEL = { auto: 'Automatico', ...PATH_LABEL } as const;
let reportTimer = 0;

function scheduleReport() {
  if (reportTimer) return;
  reportTimer = window.setTimeout(() => {
    reportTimer = 0;
    report();
  }, 120);
}

function describe(status: ContextStatus) {
  const e = status.engine;
  const engine = `${e.engine}${e.major ? ` ${e.major}` : ''}${e.android ? ' · Android' : ''}${e.webview ? ' · WebView' : ''}${
    e.mobile && !e.android ? ' · mobile' : ''
  }`;
  const v = status.verified;
  const verified = v
    ? `sì — ${v.engine} ${v.major}, ${v.environment}, ${v.date}`
    : e.android
      ? 'no — le verifiche desktop/emulate non valgono per Android reale'
      : 'no — nessun test raster per questo motore e versione';
  return { engine, verified };
}

function report() {
  const status = main.ctx.status;
  const { engine, verified } = describe(status);
  const stats = main.ctx.stats;
  panel.setStatus({
    configured: REQUEST_LABEL[status.configured],
    detected: `filtro SVG su HTML: ${status.detected.svgFilter ? 'sì' : 'no'} · backdrop-filter: ${status.detected.backdropFilter ? 'sì' : 'no'}`,
    verified,
    effective: PATH_LABEL[status.effective],
    reasons: status.reasons.join('; ') || '—',
    engine,
    maps: `${stats.mapRegenerations} generate · ${stats.mapCacheHits} dalla cache · ${stats.surfaces} superfici`,
  });
  $('stageMainLabel').textContent = PATH_LABEL[status.effective];
  const chips = $('statusChips');
  chips.replaceChildren(
    chip(`Percorso: ${PATH_LABEL[status.effective]}`, status.effective),
    chip(status.verified ? 'Verificato (raster)' : 'Non verificato su questo motore', status.verified ? 'ok' : 'warn'),
  );
  document.documentElement.dataset.motionReduced = String(status.motionReduced);
  updateMap();
}

function chip(text: string, kind: string) {
  const s = document.createElement('span');
  s.className = 'chip';
  s.dataset.kind = kind;
  s.textContent = text;
  return s;
}

const mapOverlay = document.createElement('img');
mapOverlay.className = 'map-overlay';
mapOverlay.alt = '';
mapOverlay.setAttribute('aria-hidden', 'true');
main.capsule.host.append(mapOverlay);
let fallbackMapKey = '';

function updateMap() {
  const inUse = main.ctx.renderer.mapOf(main.capsule.id);
  if (inUse) {
    mapOverlay.src = inUse.url;
    panel.setMap(inUse.url, `Mappa in uso (${inUse.key.split('|').slice(0, 2).join('×')} px). Rigenerata solo se cambia la geometria.`);
    return;
  }
  // Not in use on this path: compute it on demand for inspection only.
  const g = { width: params.width, height: params.height, radius: effectiveRadius(params), band: params.band, profile: params.profile, dome: params.dome };
  const key = JSON.stringify(g);
  if (key !== fallbackMapKey) {
    fallbackMapKey = key;
    mapOverlay.src = encodeMapAsPng(computeLensMap(g));
  }
  panel.setMap(mapOverlay.src, `Il percorso ${PATH_LABEL[main.ctx.path]} non usa la mappa: anteprima calcolata a parte.`);
}

// ---------- frame measurement (on request only) ----------

function measure(ms = 5000): Promise<string> {
  return new Promise((resolve) => {
    const before = main.ctx.stats.mapRegenerations;
    const frames: number[] = [];
    let last = 0;
    const start = performance.now();
    const step = (now: number) => {
      if (last) frames.push(now - last);
      last = now;
      if (now - start < ms) requestAnimationFrame(step);
      else {
        const sorted = [...frames].sort((a, b) => a - b);
        const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0;
        const long = frames.filter((f) => f > 33.4).length;
        resolve(
          `${frames.length} frame · mediana ${q(0.5).toFixed(1)} ms · p95 ${q(0.95).toFixed(1)} ms · >33 ms: ${long} · ` +
            `mappe rigenerate: ${main.ctx.stats.mapRegenerations - before} · superfici: ${main.ctx.stats.surfaces} · ` +
            `sfondo ${$('stages').classList.contains('is-animated') ? 'animato' : 'fermo'}`,
        );
      }
    };
    requestAnimationFrame(step);
  });
}

// ---------- panel ----------

const panel = new Panel($('panelInner'), {
  onParam: (key, value) => setParam(key, value),
  onPreset: (id) => {
    const p = presetById(id);
    if (!p) return;
    presetId = p.id;
    params = { ...p.params };
    applyParams();
  },
  onOption: (key, value) => setOption(key, value),
  onReset: () => {
    presetId = 'jello';
    params = defaultParams();
    applyParams();
  },
  onExport: () => serializeParams(params),
  onImport: (text) => {
    const r = parseParams(text);
    if (!r.ok) return { ok: false, messages: r.errors };
    params = r.params;
    presetId = null;
    applyParams();
    return { ok: true, messages: r.warnings };
  },
  onLocalImage: (file) => {
    if (localImage) URL.revokeObjectURL(localImage);
    localImage = URL.createObjectURL(file);
    setOption('scene', 'photo');
  },
  onMeasure: () => measure(),
}, opts);

// ---------- mobile panel toggle ----------

const toggle = $('panelToggle');
const panelEl = $('panel');
toggle.addEventListener('click', () => {
  const open = toggle.getAttribute('aria-expanded') !== 'true';
  toggle.setAttribute('aria-expanded', String(open));
  panelEl.classList.toggle('is-open', open);
  if (open) panelEl.focus({ preventScroll: false });
  main.ctx.measureAll();
});

// ---------- boot ----------

main.ctx.onChange(() => {
  syncAnimations();
  scheduleReport();
});
systemReducedMotion.addEventListener('change', syncAnimations);
applyTheme();
if (opts.components) mountComponents();
else dock.hidden = true;
renderScenes();
applyParams();
{
  const c = centerPosition(main);
  main.capsule.setPosition(c.x, c.y, true);
}
for (const key of ['compare', 'showMap'] as const) if (opts[key]) setOption(key, true);
report();
document.documentElement.dataset.ready = 'true';

// ---------- inspection hook for tests and manual debugging ----------

declare global {
  interface Window {
    __jello: unknown;
  }
}

window.__jello = {
  get params() {
    return params;
  },
  setParams(patch: Partial<GlassParams>) {
    params = { ...params, ...patch };
    presetId = null;
    applyParams();
  },
  setOption,
  stats: () => main.ctx.stats,
  compareStats: () => compare?.ctx.stats ?? null,
  status: () => main.ctx.status,
  capsule: {
    get position() {
      return main.capsule.position;
    },
    get rect() {
      return main.capsule.rect;
    },
    get frames() {
      return main.capsule.frames;
    },
    get animating() {
      return main.capsule.animating;
    },
    get pressed() {
      return main.capsule.isPressed;
    },
    setPosition: (x: number, y: number, immediate = true) => {
      for (const st of stages()) st.capsule.setPosition(x, y, immediate);
    },
  },
  componentRects: () => components?.surfaces.map((s) => s.rect) ?? [],
  filterId: () => main.ctx.renderer.id,
  measure,
};
