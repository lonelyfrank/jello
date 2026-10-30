/**
 * Consumer example: a bottom navbar with Jello Glass over scrolling content.
 * It imports only the exported package in ./jello (built runtime + material):
 * no lab sources, no editor, no relay.
 *
 *   ?material=./other.json   load another exported material instead of ./jello/material.json
 *   ?backend=css             override the backend requested by the material
 */
import { createGlassGroup, parseMaterial } from './jello/runtime/jello.js';

const query = new URLSearchParams(location.search);
const materialUrl = new URL(query.get('material') ?? './jello/material.json', location.href);
const parsed = parseMaterial(await (await fetch(materialUrl)).json());
const status = document.getElementById('status');
if (!parsed.ok) {
  status.textContent = `Materiale non valido: ${parsed.errors.join('; ')}`;
  throw new Error(parsed.errors.join('\n'));
}

// ---- content (sample data, fixed) ----
const COLORS = ['#0a84ff', '#ff453a', '#30d158', '#ff9f0a', '#bf5af2', '#64d2ff'];
const list = document.getElementById('list');
for (let i = 0; i < 18; i++) {
  const row = document.createElement('article');
  row.className = 'match';
  row.style.setProperty('--team', COLORS[i % COLORS.length]);
  row.innerHTML = `<span class="time">${String(9 + (i % 10)).padStart(2, '0')}:${i % 2 ? '30' : '00'}</span><span class="teams">Elemento ${i + 1}</span><strong class="score">${40 + ((i * 7) % 35)}</strong>`;
  list.append(row);
}

// ---- glass: one surface for the whole bar ----
const content = document.getElementById('content');
const nav = document.getElementById('tabbar');
const backend = query.get('backend');
const group = createGlassGroup({ source: content, material: parsed.doc, ...(backend ? { backend } : {}) });
const surface = group.attach(nav, { sizing: 'element', radius: 'capsule', interaction: 'press' });

// ---- tabs: selection is persistent, press is transient ----
const tabs = [...nav.querySelectorAll('.tab')];
const indicator = nav.querySelector('.tab-indicator');
const title = document.getElementById('sectionTitle');
let selected = 'home';
const place = (animate) => {
  const t = tabs.find((x) => x.dataset.tab === selected);
  if (!animate) indicator.dataset.instant = '';
  indicator.style.setProperty('--x', `${t.offsetLeft}px`);
  indicator.style.setProperty('--w', `${t.offsetWidth}px`);
  if (!animate) {
    void indicator.offsetWidth;
    delete indicator.dataset.instant;
  }
};
const select = (id) => {
  selected = id;
  for (const t of tabs) {
    if (t.dataset.tab === id) t.setAttribute('aria-current', 'page');
    else t.removeAttribute('aria-current');
  }
  title.textContent = tabs.find((t) => t.dataset.tab === id).textContent.trim();
  content.scrollTo({ top: 0 });
  place(true);
};
nav.addEventListener('click', (e) => {
  const t = e.target.closest('.tab');
  if (t) select(t.dataset.tab);
});
nav.addEventListener('pointerdown', (e) => e.target.closest('.tab')?.setAttribute('data-pressed', ''));
for (const type of ['pointerup', 'pointercancel', 'pointerleave']) nav.addEventListener(type, () => tabs.forEach((t) => t.removeAttribute('data-pressed')));
nav.addEventListener('keydown', (e) => {
  const i = tabs.indexOf(document.activeElement);
  const next = { ArrowLeft: i - 1, ArrowRight: i + 1, Home: 0, End: tabs.length - 1 }[e.key];
  if (i < 0 || next === undefined) return;
  e.preventDefault();
  tabs[(next + tabs.length) % tabs.length].focus();
});
// Wheel over the bar scrolls the content underneath.
nav.addEventListener('wheel', (e) => {
  content.scrollBy(e.deltaX, e.deltaY);
  e.preventDefault();
}, { passive: false });
new ResizeObserver(() => place(false)).observe(nav);
place(false);

const show = (s) => {
  status.textContent = `Jello ${parsed.doc.name} · richiesto ${s.requested} → effettivo ${s.effective}${s.opaque ? ' (opaco)' : ''}${s.reasons.length ? ` · ${s.reasons.join('; ')}` : ''}`;
  status.dataset.effective = s.effective;
};
show(group.status);
group.onStatus(show);

window.__example = {
  group,
  surface,
  get selected() {
    return selected;
  },
  destroy: () => group.destroy(),
};
document.documentElement.dataset.ready = 'true';
