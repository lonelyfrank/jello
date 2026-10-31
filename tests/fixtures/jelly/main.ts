/** Development/test entry only. Never included in Vite production inputs. */
import { JELLY_CANDIDATE_PRESETS } from '../../../src/model/experimental/jelly-presets';
import { JELLY_PARAMS, jellyParams, jellySectionOf, parseExperimentalJelly, type JellyExperimentalDocument, type JellyOverrideState } from '../../../src/model/experimental/jelly';
import { attachExperimentalJelly, type ExperimentalJellySurface, type JellyRenderOptions } from '../../../src/runtime/experimental/jelly';
import './style.css';

const root = document.querySelector<HTMLElement>('#fixture')!;
const events = new AbortController();
root.innerHTML = `<header><span class="eyebrow">JELLO / MATERIAL EXPERIMENT</span><h1>Jelly, da ferma.</h1><p>M6.2 · Button nativo · SVG decorativo / fallback CSS · nessun solver</p></header>
<section class="workbench"><div><div id="main-preview" class="sample light"></div><pre id="status" aria-live="polite"></pre><p id="error" role="alert"></p></div><form id="controls"><label>Preset<select id="preset"></select></label><label>Sfondo<select id="background"><option>light</option><option>dark</option><option>gradient</option><option>checker</option></select></label><label>Geometria<select id="geometry"><option value="main">240×64 rounded</option><option value="small">96×48 rounded</option><option value="capsule">180×56 capsule</option></select></label><label>Stato<select id="state"><option>default</option><option>hover</option><option>pressed</option><option>active</option><option>disabled</option></select></label><label><input id="opaque" type="checkbox"> Modalità opaca</label><label><input id="transparency" type="checkbox"> Override trasparenza ridotta</label><label><input id="pose" type="checkbox"> Posa diagnostica statica (5%)</label><div id="descriptor-controls"></div><p>Movimento non disponibile in M6.2. DPR SVG non controllato; cap reali 24/12/4 bolle. Nessun budget di gruppo adattivo.</p></form></section>
<section><h2>Quattro materiali, quattro sfondi</h2><div id="preset-matrix" class="matrix"></div></section>
<section><h2>Forma, inclusioni e backend</h2><div id="variant-matrix" class="matrix"></div></section>
<section><h2>Stati statici e focus</h2><div id="state-matrix" class="matrix"></div></section>
<details id="optical-comparison"><summary>Confronto ottico: estremi dei parametri</summary><div id="optical-matrix" class="matrix"></div></details>`;
const select = (id: string) => document.getElementById(id) as HTMLSelectElement;
const check = (id: string) => (document.getElementById(id) as HTMLInputElement).checked;
const mainPreview = document.querySelector<HTMLElement>('#main-preview')!;
let clicks = 0;
/** One logical test component, reused for every matrix entry. Host owns semantics, dimensions and content. */
function button(parent: HTMLElement, doc: JellyExperimentalDocument, options: JellyRenderOptions = {}, geometry = 'main') {
  const host = document.createElement('button');
  host.type = 'button';
  host.className = `test-button ${geometry}`;
  host.innerHTML = '<span class="button-content"><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24"><path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z" fill="none" stroke="currentColor" stroke-width="1.7"/></svg><span>Jelly</span></span>';
  host.addEventListener('click', () => { host.dataset.clicks = String(++clicks); });
  parent.append(host);
  const surface = attachExperimentalJelly(host, doc, options);
  return { host, surface };
}
const soft = JELLY_CANDIDATE_PRESETS[0]!.doc;
let current = structuredClone(soft);
const primary = button(mainPreview, current);
primary.host.id = 'primary-button';
const syncStatus = () => { document.getElementById('status')!.textContent = JSON.stringify(primary.surface.status, null, 2); };
primary.surface.onStatus(syncStatus);
syncStatus();
for (const { doc } of JELLY_CANDIDATE_PRESETS) select('preset').add(new Option(doc.name, doc.id));

const controls = new Map<string, HTMLInputElement | HTMLSelectElement>();
for (const d of JELLY_PARAMS.filter((d) => d.affects !== 'motion' && d.key !== 'hover')) {
  const label = document.createElement('label');
  label.title = d.description;
  label.textContent = `${d.label}${d.type === 'number' && d.unit ? ` (${d.unit})` : ''}`;
  const control = d.type === 'enum' ? document.createElement('select') : document.createElement('input');
  control.id = `param-${d.key}`;
  if (control instanceof HTMLSelectElement && d.type === 'enum') for (const value of d.options) control.add(new Option(value, value));
  if (control instanceof HTMLInputElement) {
    control.type = d.type === 'color' ? 'color' : 'number';
    if (d.type === 'number') { control.min = String(d.min); control.max = String(d.max); control.step = String(d.step); }
  }
  control.value = String(jellyParams(current)[d.key]);
  controls.set(d.key, control);
  label.append(control);
  document.getElementById('descriptor-controls')!.append(label);
  control.addEventListener('input', () => {
    const section = jellySectionOf(d.key);
    const result = parseExperimentalJelly({ ...current, [section]: { ...current[section], [d.key]: d.type === 'number' ? Number(control.value) : control.value } });
    document.getElementById('error')!.textContent = result.ok ? '' : result.errors.join('; ');
    if (!result.ok) return;
    current = result.doc;
    refresh();
  });
}
function refresh() {
  const geometry = select('geometry').value;
  primary.host.className = `test-button jelly-surface ${geometry}`;
  mainPreview.className = `sample ${select('background').value}`;
  const doc = { ...current, geometry: { ...current.geometry, shape: geometry === 'capsule' ? 'capsule' as const : current.geometry.shape } };
  primary.surface.update(doc, { opaque: check('opaque'), ...(check('transparency') ? { reducedTransparency: true } : {}), diagnosticPose: check('pose') ? 0.05 : 0 });
  const state = select('state').value;
  primary.host.disabled = state === 'disabled';
  primary.host.setAttribute('aria-pressed', String(state === 'active'));
  primary.surface.setState({ hover: state === 'hover', pressed: state === 'pressed', active: state === 'active', disabled: state === 'disabled' });
  primary.surface.resize();
  syncStatus();
}
for (const id of ['background', 'geometry', 'state', 'opaque', 'transparency', 'pose']) document.getElementById(id)!.addEventListener('change', refresh);
select('preset').addEventListener('change', () => {
  current = structuredClone(JELLY_CANDIDATE_PRESETS.find((p) => p.doc.id === select('preset').value)!.doc);
  for (const [key, control] of controls) control.value = String(jellyParams(current)[key as keyof ReturnType<typeof jellyParams>]);
  refresh();
});
primary.host.addEventListener('pointerenter', () => { if (select('state').value === 'default') primary.surface.setHovered(true); });
primary.host.addEventListener('pointerleave', () => { if (select('state').value === 'default') primary.surface.setState({ hover: false, pressed: false }); });
primary.host.addEventListener('pointerdown', () => { if (select('state').value === 'default') primary.surface.setPressed(true); });
window.addEventListener('pointerup', () => { if (select('state').value === 'default') primary.surface.setPressed(false); }, { signal: events.signal });
primary.host.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') primary.surface.setPressed(true); });
primary.host.addEventListener('keyup', () => primary.surface.setPressed(false));
primary.host.addEventListener('blur', () => primary.surface.setState({ hover: false, pressed: false }));

const surfaces: ExperimentalJellySurface[] = [primary.surface];
function sample(matrix: string, title: string, background: string, doc = soft, options: JellyRenderOptions = {}, geometry = 'main', state?: JellyOverrideState) {
  const card = document.createElement('article');
  card.className = `sample ${background}`;
  card.innerHTML = `<span class="caption"></span>`;
  card.querySelector('.caption')!.textContent = title;
  document.getElementById(matrix)!.append(card);
  const item = button(card, doc, options, geometry);
  if (state) { item.surface.setState({ [state]: true }); item.host.disabled = state === 'disabled'; item.host.setAttribute('aria-pressed', String(state === 'active')); }
  surfaces.push(item.surface);
  return item;
}
for (const { doc } of JELLY_CANDIDATE_PRESETS) for (const background of ['light', 'dark', 'gradient', 'checker']) sample('preset-matrix', `${doc.name} / ${background}`, background, doc);
for (const geometry of ['main', 'small', 'capsule']) sample('variant-matrix', `Soft / ${geometry}`, 'light', { ...soft, geometry: { ...soft.geometry, shape: geometry === 'capsule' ? 'capsule' : 'rounded' } }, {}, geometry);
sample('variant-matrix', 'Soft / bolle off', 'light', { ...soft, bubbles: { ...soft.bubbles, enabled: 'disabled' } });
sample('variant-matrix', 'Soft / CSS', 'light', { ...soft, target: { ...soft.target, backend: 'css' } });
sample('variant-matrix', 'Soft / opaco', 'light', soft, { opaque: true });
sample('variant-matrix', 'Soft / posa diagnostica', 'light', soft, { diagnosticPose: 0.05 });
sample('variant-matrix', 'Soft / SVG su checker', 'checker');
sample('variant-matrix', 'Soft / CSS su checker', 'checker', { ...soft, target: { ...soft.target, backend: 'css' } });
for (const state of ['default', 'hover', 'pressed', 'active', 'disabled', 'focus']) {
  const item = sample('state-matrix', `Soft / ${state}`, 'light', soft, {}, 'main', ['default', 'focus'].includes(state) ? undefined : state as JellyOverrideState);
  if (state === 'focus') { item.host.id = 'focus-sample'; }
}
let opticalCreated = false;
document.getElementById('optical-comparison')!.addEventListener('toggle', (event) => {
  if (!(event.currentTarget as HTMLDetailsElement).open || opticalCreated) return;
  opticalCreated = true;
  for (const d of JELLY_PARAMS.filter((d) => ['appearance', 'volume', 'shadow'].includes(d.group))) {
  const values = d.type === 'number' ? [d.min, d.max] : d.key === 'tint' ? ['#8d48ce', '#4cbeb2'] : d.key === 'shadowColor' ? ['#eb1460', '#085dff'] : ['#110d19', '#ffffff'];
  for (const value of values) {
    const section = jellySectionOf(d.key);
    // Higher elevation makes shadowColor/shadowOpacity differences visible; checker exposes compositing.
    const base = { ...soft, material: { ...soft.material,
      elevation: d.group === 'shadow' ? 4 : soft.material.elevation,
      highlightStrength: d.key === 'roughness' ? 0.85 : soft.material.highlightStrength,
      thickness: d.key === 'edgeFalloff' ? 0.8 : soft.material.thickness,
    } };
    const parsed = parseExperimentalJelly({ ...base, [section]: { ...base[section], [d.key]: value } });
    if (parsed.ok) sample('optical-matrix', `${d.key} = ${value}`, 'checker', parsed.doc);
  }
  }
});

/** Explicit fixture diagnostics for browser lifecycle tests. Never part of the renderer API. */
const api = { primary, surfaces, soft, attach: attachExperimentalJelly, get current() { return current; }, refresh };
declare global { interface Window { jellyFixture: typeof api } }
window.jellyFixture = api;
if (import.meta.hot) import.meta.hot.dispose(() => {
  events.abort();
  for (const surface of surfaces) surface.destroy();
  Reflect.deleteProperty(window, 'jellyFixture');
});
