/**
 * Phone preview: the shared preview controller and runtime, without the
 * editor (no React, no storage, no panels).
 *
 *   preview.html?material=navbar&object=navbar&scene=app     a scenario from the URL
 *   preview.html?relay=http://192.168.1.20:5174&token=…       live state from the lab (tools/relay)
 *   preview.html?fixture=dom&builtin=navbar                    comparison fixture of export packages
 *
 * Received messages are validated (protocol version, view options, the
 * material document); an invalid one is reported and nothing is applied.
 */

import '../stage/theme.css';
import '../core/glass.css';
import '../stage/stage.css';
import './preview.css';
import { builtinMaterial, type GlassDocument } from '../model';
import { DOM_FIXTURE_HTML, FIXTURE_CSS, SCENE_FIXTURE_HTML } from '../export/example';
import { createGlassGroup } from '../runtime/glass-group';
import { createSceneView, textureFromDocument } from '../runtime/scene';
import { PreviewController } from '../stage/controller';
import { PHOTO } from '../stage/scenes';
import { optionsFromQuery } from '../stage/url';
import type { ViewOptions } from '../stage/view';
import { decodeState, PROTOCOL, TOKEN_PATTERN } from '../sync/protocol';

const query = new URLSearchParams(location.search);
const root = document.getElementById('pv')!;
const statusEl = document.getElementById('pvStatus')!;
const setStatus = (text: string, kind: string) => {
  statusEl.textContent = text;
  statusEl.dataset.kind = kind;
};

declare global {
  interface Window {
    __jelloPreview: unknown;
  }
}

const fixture = query.get('fixture');
if (fixture === 'dom' || fixture === 'scene') await mountFixture(fixture);
else mountPreview();

function mountPreview() {
  const boot = optionsFromQuery(query, matchMedia('(prefers-reduced-motion: reduce)').matches);
  const material = builtinMaterial(boot.material ?? boot.preset)?.doc ?? builtinMaterial('jello')!.doc;
  let options: ViewOptions = boot.options;
  const controller = new PreviewController({
    root,
    material,
    options,
    // Interactions inside the preview change only the preview (the lab stays the source of truth).
    onRequest: (r) => {
      if (r.type === 'option') {
        options = { ...options, [r.key]: r.value };
        controller.setOption(r.key, r.value as never);
      } else controller.setMaterial({ ...controller.material, material: { ...controller.material.material, refraction: r.value } });
    },
    resolveAsset: (url) => (url === 'example:tulips' ? PHOTO.src : url),
    photo: PHOTO.src,
  });
  const info = { received: 0, rejected: 0, lastSeq: -1, errors: [] as string[], connected: false };
  window.__jelloPreview = { controller, info, get options() { return options; } };
  document.documentElement.dataset.ready = 'true';

  const relay = query.get('relay');
  const token = query.get('token') ?? '';
  if (!relay) {
    setStatus('Anteprima locale · nessuna sincronizzazione', 'local');
    connectForm();
    return;
  }
  if (!TOKEN_PATTERN.test(token)) {
    setStatus('Token di sessione mancante o non valido: apri il link mostrato nel laboratorio.', 'error');
    return;
  }
  const url = `${relay.replace(/\/$/, '')}/events?token=${encodeURIComponent(token)}`;
  setStatus('Connessione al laboratorio…', 'connecting');
  const es = new EventSource(url);
  es.addEventListener('open', () => {
    info.connected = true;
    setStatus(`Collegato al laboratorio (protocollo ${PROTOCOL}) · in attesa dello stato`, 'live');
  });
  // EventSource reconnects by itself; the relay sends the full last state on every (re)connection.
  es.addEventListener('error', () => {
    info.connected = false;
    setStatus('Connessione persa: nuovo tentativo in corso…', 'reconnecting');
  });
  es.addEventListener('state', (ev) => {
    const r = decodeState((ev as MessageEvent<string>).data);
    if (!r.ok) {
      info.rejected++;
      info.errors = r.errors;
      setStatus(`Stato rifiutato, nulla applicato: ${r.errors[0]}`, 'error');
      return;
    }
    const m = r.message;
    // Full state every time: applying it again (reconnection, restarted lab) is harmless.
    info.lastSeq = m.seq;
    info.received++;
    apply(controller, m.material, m.view, m.image);
    options = m.view;
    setStatus(`Sincronizzato · stato n. ${m.seq}${r.warnings.length ? ` · ${r.warnings.length} avvisi` : ''}`, 'live');
  });
}

let appliedImage: string | null = null;

function apply(controller: PreviewController, material: GlassDocument, view: ViewOptions, image: string | null) {
  controller.setMaterial(material);
  for (const key of Object.keys(view) as (keyof ViewOptions)[]) controller.setOption(key, view[key] as never);
  if (image !== appliedImage) {
    appliedImage = image;
    controller.setLocalImage(image);
  }
}

/** Same markup, CSS and calls as example/ in an export package. */
async function mountFixture(kind: 'dom' | 'scene') {
  document.body.classList.add('fixture-page');
  const style = document.createElement('style');
  style.textContent = FIXTURE_CSS;
  document.head.append(style);
  const material = builtinMaterial(query.get('builtin') ?? 'jello')?.doc ?? builtinMaterial('jello')!.doc;
  root.innerHTML = kind === 'dom' ? DOM_FIXTURE_HTML : SCENE_FIXTURE_HTML;
  if (kind === 'dom') {
    const group = createGlassGroup({ source: document.getElementById('jelloSource')!, material });
    group.attach(document.getElementById('jelloCard')!, { sizing: 'element', radius: 24 });
    window.__jelloPreview = { group, ready: true };
    setStatus(`fixture DOM · ${group.status.effective}`, 'local');
  } else {
    const view = await createSceneView({
      canvas: document.getElementById('jelloCanvas') as HTMLCanvasElement,
      material,
      source: textureFromDocument(material, (u) => u),
      foreground: document.getElementById('jelloLabel')!,
      time: 0,
    });
    window.__jelloPreview = { view, ready: true };
    setStatus(`fixture WebGL2 · ${view.status.effective}`, 'local');
  }
  document.documentElement.dataset.ready = 'true';
}

/** Without relay parameters (e.g. inside the Android test app): paste the link shown by the lab. */
function connectForm() {
  const form = document.createElement('form');
  form.className = 'pv-connect';
  form.innerHTML =
    '<label for="pvLink">Collega al laboratorio: incolla il link dell’anteprima</label>' +
    '<input id="pvLink" type="url" inputmode="url" autocomplete="off" placeholder="http://192.168.…:5173/preview.html?relay=…&amp;token=…" />' +
    '<button type="submit">Collega</button>';
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const raw = (form.querySelector('input') as HTMLInputElement).value.trim();
    let params: URLSearchParams;
    try {
      params = new URL(raw).searchParams;
    } catch {
      setStatus('Link non valido.', 'error');
      return;
    }
    const relay = params.get('relay');
    const token = params.get('token');
    if (!relay || !token || !TOKEN_PATTERN.test(token)) {
      setStatus('Nel link mancano relay o token.', 'error');
      return;
    }
    location.search = `?relay=${encodeURIComponent(relay)}&token=${encodeURIComponent(token)}`;
  });
  document.body.append(form);
}
