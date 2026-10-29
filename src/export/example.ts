/**
 * Minimal examples written into export packages. The same fixture (markup
 * and CSS) is rendered by the phone preview page in `?fixture=dom` and
 * `?fixture=scene` mode, so a package can be compared with the preview at
 * equal backend, source, size, DPR and animation time (tests/e2e/export.spec.ts).
 *
 * Plain HTML and JavaScript: a consumer opens them with any static server,
 * no build step.
 */

export const FIXTURE = { width: 480, height: 320 } as const;

/** Deterministic background: CSS gradients and text only, no images, no animation. */
export const FIXTURE_CSS = `
.fx-stage, .fx-stage *, .fx-scene, .fx-scene * { box-sizing: border-box; }
.fx-stage { position: relative; width: ${FIXTURE.width}px; height: ${FIXTURE.height}px; overflow: hidden; border-radius: 16px; font: 15px/1.4 system-ui, sans-serif; }
.fx-source { position: absolute; inset: 0; overflow: hidden; background-color: #f4f4f2;
  background-image:
    repeating-linear-gradient(135deg, rgb(255 69 58 / 0.9) 0 18px, transparent 18px 54px),
    repeating-linear-gradient(45deg, rgb(10 132 255 / 0.85) 0 12px, transparent 12px 48px),
    linear-gradient(#16161a 2px, transparent 2px),
    linear-gradient(90deg, #16161a 2px, transparent 2px);
  background-size: auto, auto, 40px 40px, 40px 40px; }
.fx-source p { position: absolute; left: 24px; right: 24px; margin: 0; color: #111; font-weight: 700; font-size: 22px; }
.fx-source .fx-t1 { top: 30px; } .fx-source .fx-t2 { top: 132px; } .fx-source .fx-t3 { bottom: 30px; }
.fx-overlay { position: absolute; inset: 0; display: grid; place-items: center; pointer-events: none; }
.fx-card { pointer-events: auto; width: 300px; padding: 18px 22px; border-radius: 24px; color: #0c0c10; text-shadow: 0 0 6px rgb(255 255 255 / 0.75); }
.fx-card h2 { margin: 0 0 6px; font-size: 20px; }
.fx-card p { margin: 0; }
.fx-scene { position: relative; width: ${FIXTURE.width}px; height: ${FIXTURE.height}px; border-radius: 16px; overflow: hidden; }
.fx-scene canvas { display: block; width: 100%; height: 100%; }
.fx-label { position: absolute; left: 0; top: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; font: 600 17px system-ui, sans-serif; color: #0c0c10; text-shadow: 0 0 6px rgb(255 255 255 / 0.75); }
`;

export const DOM_FIXTURE_HTML = `<div class="fx-stage" id="fixture">
  <div class="fx-source" id="jelloSource">
    <p class="fx-t1">Contenuto sotto il materiale</p>
    <p class="fx-t2">Righe dritte al centro, piegate sul bordo</p>
    <p class="fx-t3">Jello · esempio minimo</p>
  </div>
  <div class="fx-overlay">
    <article class="fx-card" id="jelloCard"><h2>Card glass</h2><p>Testo in primo piano, mai filtrato.</p></article>
  </div>
</div>`;

export const SCENE_FIXTURE_HTML = `<div class="fx-scene" id="fixture">
  <canvas id="jelloCanvas" aria-label="Scena controllata con lente glass"></canvas>
  <div class="fx-label" id="jelloLabel" aria-hidden="true">Jello</div>
</div>`;

const DOM_SCRIPT = `import { createGlassGroup, parseMaterial } from '../runtime/jello.js';

const res = await fetch('../material.json');
const parsed = parseMaterial(await res.json());
if (!parsed.ok) throw new Error(parsed.errors.join('\\n'));

// The source is the element whose content may be refracted (SVG backend).
// Text and controls of the card stay outside it, in the foreground.
const group = createGlassGroup({ source: document.getElementById('jelloSource'), material: parsed.doc });
group.attach(document.getElementById('jelloCard'), { sizing: 'element', radius: 24 });

const status = document.getElementById('status');
const show = (s) => (status.textContent = \`backend richiesto \${s.requested} → effettivo \${s.effective}\${s.opaque ? ' (opaco)' : ''}\${s.reasons.length ? ' · ' + s.reasons.join('; ') : ''}\`);
show(group.status);
group.onStatus(show);
window.__jelloExample = { group, ready: true };
// group.destroy() removes filters, layers, observers and listeners.
`;

const SCENE_SCRIPT = `import { createSceneView, parseMaterial, textureFromDocument } from '../runtime/jello.js';

const materialUrl = new URL('../material.json', location.href);
const parsed = parseMaterial(await (await fetch(materialUrl)).json());
if (!parsed.ok) throw new Error(parsed.errors.join('\\n'));

// WebGL2 samples a controlled texture, never the page. URLs in material.json
// are relative to material.json.
const source = textureFromDocument(parsed.doc, (u) => new URL(u, materialUrl).href);
const view = await createSceneView({
  canvas: document.getElementById('jelloCanvas'),
  material: parsed.doc,
  source,
  foreground: document.getElementById('jelloLabel'),
  time: 0,
});

const status = document.getElementById('status');
const show = (s) => (status.textContent = \`WebGL2: \${s.effective}\${s.reasons.length ? ' · ' + s.reasons.join('; ') : ''}\`);
show(view.status);
view.onStatus(show);
window.__jelloExample = { view, ready: true };
// view.destroy() releases programs, textures, framebuffers and listeners.
`;

export function exampleHtml(kind: 'dom' | 'scene', title: string): string {
  return `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)} · esempio Jello</title>
<link rel="stylesheet" href="../runtime/jello.css" />
<style>
body { margin: 24px; font: 15px/1.45 system-ui, sans-serif; background: #fff; color: #111; }
${FIXTURE_CSS}
#status { margin-top: 12px; color: #444; font-size: 13px; }
</style>
</head>
<body>
${kind === 'dom' ? DOM_FIXTURE_HTML : SCENE_FIXTURE_HTML}
<p id="status" role="status">Caricamento…</p>
<script type="module" src="./main.js"></script>
</body>
</html>
`;
}

export function exampleScript(kind: 'dom' | 'scene'): string {
  return kind === 'dom' ? DOM_SCRIPT : SCENE_SCRIPT;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
