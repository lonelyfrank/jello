/**
 * Jello Visual Review (M6.4.3.A): an experimental workspace for deciding, by eye and with evidence,
 * whether a candidate treatment of the four Jello presets is good enough to be proposed for approval.
 *
 * It is a view of the Jello Lab, not a material: it reads the built-in candidates, derives the A/B1/B2/B3
 * variants in memory, renders them with the one real renderer, and writes only its own versioned decision
 * record (separate localStorage key) and the reports the person downloads. Built-in presets, the material
 * schema, the library and every saved project are never touched.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './review.css';
import { createJellyCoordinator } from '../../../../runtime/experimental/jelly-scheduler';
import { Ic, Segmented, Switch } from '../../../app/ui';
import type { JellyBridge } from '../bridge';
import { JellyButton } from '../JellyButton';
import { DEFAULT_ENV } from '../preview-model';
import { setJellyView, useJellyView } from '../studio';
import {
  buildReport, loadDecisions, reportJson, reportMarkdown, saveDecisions, type DecisionSet, type SurfaceEvidence,
} from './decisions';
import { ReviewInspector } from './ReviewInspector';
import { LiveStage, MotionStage, type BridgeRegistry } from './ReviewStage';
import {
  cellsFor, CUSTOM_LIMITS, DEFAULT_REVIEW_VIEW, GRID_AXES, REVIEW_BACKGROUND_LABEL, REVIEW_BACKGROUNDS, REVIEW_CONTENT_LABEL, REVIEW_CONTENTS, REVIEW_MODE_LABEL, REVIEW_MODES,
  REVIEW_STATES, VIEWPORTS, viewportOf, clampCustom, type CellSpec, type ReviewView,
} from './review-model';
import { PRESET_TITLE, REVIEW_PRESET_IDS, REVIEW_VARIANT_IDS, reviewVariant, VARIANT_INFO, type ReviewPresetId } from './variants';

declare global { interface Window { __jelloReview?: { view(): ReviewView; report(): unknown } } }

const STATE_LABEL: Record<typeof REVIEW_STATES[number], string> = { live: 'Interattivo', hover: 'Hover', pressed: 'Premuto', active: 'Attivo', disabled: 'Disabilitato' };
const NARROW = '(max-width: 900px)';
const storage = (): Storage | null => { try { return localStorage; } catch { return null; } };

function PresetThumb({ presetId, coordinator }: { presetId: ReviewPresetId; coordinator: ReturnType<typeof createJellyCoordinator> }) {
  const variant = useMemo(() => reviewVariant(presetId, 'A'), [presetId]);
  return (
    <div className="rv-thumb" aria-hidden="true" data-testid={`rv-thumb-${presetId}`} {...{ inert: true }}>
      <JellyButton doc={variant.doc} env={DEFAULT_ENV} state="live" box={{ width: 72, height: 28, paddingX: 8 }} fontSize={11} label="Jello" icon={false} coordinator={coordinator} />
    </div>
  );
}

export default function ReviewWorkspace({ onClose }: { onClose(): void }) {
  const [view, setView] = useState<ReviewView>(DEFAULT_REVIEW_VIEW);
  const patch = (p: Partial<ReviewView>) => setView((v) => ({ ...v, ...p }));
  const level = useJellyView().level;
  const narrow = useRef(typeof matchMedia === 'function' && matchMedia(NARROW).matches);
  const [left, setLeft] = useState(true);
  const [right, setRight] = useState(!narrow.current);
  const [bounce, setBounce] = useState(0);

  // Decisions: loaded once, saved on every change to a record of their own; a record we cannot read is left alone.
  const initial = useMemo(() => loadDecisions(storage()), []);
  const [set, setSet] = useState<DecisionSet>(initial.set);
  const [problem, setProblem] = useState<string | null>(initial.problem);
  const [persisted, setPersisted] = useState(storage() !== null);
  const changed = useRef(false);
  const onSet = (next: DecisionSet) => { changed.current = true; setSet(next); };
  // An unreadable or newer record is never overwritten implicitly: the person replaces it explicitly or exports the report.
  useEffect(() => {
    if (!changed.current || problem) return;
    setPersisted(saveDecisions(storage(), set));
  }, [set, problem]);

  // Registry of the mounted surfaces (real bridges): the inspector and the report read from it.
  const registry = useRef(new Map<string, { spec: CellSpec; bridge: JellyBridge }>());
  const [, bump] = useState(0);
  const register = useCallback<BridgeRegistry>((spec, bridge) => {
    if (bridge) registry.current.set(spec.key, { spec, bridge }); else registry.current.delete(spec.key);
    bump((n) => n + 1);
  }, []);
  const focusKey = `${view.presetId}:${view.variantId}`;
  const focus = registry.current.get(focusKey)?.bridge ?? null;

  const thumbs = useMemo(() => createJellyCoordinator(), []);
  useEffect(() => () => thumbs.destroy(), [thumbs]);

  const vp = viewportOf(view);
  const cssFallback = [...registry.current.values()].some((r) => r.bridge.status?.backend === 'css');
  const dpr = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1;

  const conditions = () => ({
    mode: view.mode, gridAxis: view.axis, viewport: { width: vp.width, height: vp.height }, background: view.background, content: view.content, state: view.state,
    normalizedTint: view.normalized, reducedMotion: view.reducedMotion, syncInput: view.sync, devicePixelRatio: dpr,
  });
  const evidence = (): SurfaceEvidence[] => [...registry.current.values()].flatMap(({ spec, bridge }) => {
    const s = bridge.status;
    return s ? [{ presetId: spec.presetId, variant: spec.variantId, backend: s.backend, opaque: s.opaque, motion: s.motion, bubbles: s.bubbles, effectiveAlpha: Math.round(s.effectiveAlpha * 1000) / 1000, effectiveTransmission: Math.round(s.effectiveTransmission * 1000) / 1000, treatment: reviewVariant(spec.presetId, spec.variantId).treatment }] : [];
  });
  const makeReport = () => buildReport({
    set, conditions: conditions(), evidence: evidence(), now: new Date().toISOString(),
    source: { branch: null, commit: null, note: 'Non disponibile a runtime nel browser; il commit esaminato è registrato in docs/m643a/verification.json.' },
  });
  useEffect(() => {
    window.__jelloReview = { view: () => view, report: () => makeReport() };
    return () => { Reflect.deleteProperty(window, '__jelloReview'); };
  });

  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const onExport = (kind: 'json' | 'md') => {
    try {
      const report = makeReport();
      const text = kind === 'json' ? reportJson(report) : reportMarkdown(report);
      const blob = new Blob([text], { type: kind === 'json' ? 'application/json' : 'text/markdown' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `jello-visual-review.${kind === 'json' ? 'json' : 'md'}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 0);
      setExportMessage(`Report ${kind === 'json' ? 'JSON' : 'Markdown'} generato (${blob.size} byte, ${report.deliveryState}).`);
    } catch (e) {
      setExportMessage(`Impossibile generare il report: ${(e as Error).message}`);
    }
  };

  const reset = () => { for (const r of registry.current.values()) r.bridge.reset(); setView((v) => ({ ...DEFAULT_REVIEW_VIEW, presetId: v.presetId })); };
  const live = view.state === 'live';
  const cells = cellsFor(view);

  return (
    <main className="rv" id="jelly-review" aria-labelledby="rv-title" data-left={left ? 'open' : 'closed'} data-right={right ? 'open' : 'closed'}>
      <header className="rv-head">
        <div className="jl-title">
          <h2 className="preview-title" id="rv-title">Jello Visual Review</h2>
          <span className="chip chip-warn" title="Funzione sperimentale: nessun preset viene promosso da questa vista">Sperimentale</span>
          <span className="chip" data-kind="neutral" id="rv-readonly" title="Il confronto non modifica preset, materiali, progetti o libreria">Solo lettura sui materiali</span>
        </div>
        <div className="rv-head-actions">
          <Segmented label="Livello dell’Inspector" value={level} options={[{ id: 'base', label: 'Base' }, { id: 'advanced', label: 'Avanzata' }]} onChange={(l) => setJellyView({ level: l })} />
          <button type="button" className="button small" id="rv-toggle-left" aria-expanded={left} aria-controls="rv-left" onClick={() => setLeft((v) => !v)}>Preset</button>
          <button type="button" className="button small" id="rv-toggle-right" aria-expanded={right} aria-controls="rv-right" onClick={() => setRight((v) => !v)}>Inspector</button>
          <button type="button" className="button small" id="rv-back" onClick={onClose}><Ic name="arrowLeft" size={14} /> Torna al Lab</button>
        </div>
      </header>

      <aside className="rv-left" id="rv-left" aria-label="Preset e varianti" hidden={!left}>
        <h3 className="rv-h">Preset</h3>
        <ul className="jl-list" aria-label="Preset Jello">
          {REVIEW_PRESET_IDS.map((id) => (
            <li key={id} className="rv-preset">
              <button type="button" className="jl-item" id={`rv-preset-${id}`} aria-pressed={view.presetId === id} onClick={() => patch({ presetId: id })}>
                <span className="jl-item-text"><strong>{PRESET_TITLE[id].full}</strong><small>{PRESET_TITLE[id].identity} · {set.decisions[id].status === 'pending' ? 'Pending' : set.decisions[id].status.replace('-', ' ')}</small></span>
              </button>
              <PresetThumb presetId={id} coordinator={thumbs} />
            </li>
          ))}
        </ul>
        <h3 className="rv-h">Varianti di {PRESET_TITLE[view.presetId].short}</h3>
        <ul className="jl-list" aria-label="Varianti">
          {REVIEW_VARIANT_IDS.map((id) => {
            const v = reviewVariant(view.presetId, id);
            return (
              <li key={id}>
                <button type="button" className="jl-item rv-variant" id={`rv-variant-${id}`} aria-pressed={view.variantId === id} onClick={() => patch({ variantId: id })}>
                  <span className="jl-item-text">
                    <strong>{VARIANT_INFO[id].label}</strong>
                    <small>{VARIANT_INFO[id].kind}</small>
                    <small>Trattamento {v.treatment} · {id === 'A' ? 'valori built-in' : `${v.changes.length} parametri diversi da A`}{v.sameAs ? ` · identica a ${v.sameAs}` : ''}</small>
                    <small>Non approvata</small>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <p className="muted small">Le varianti sono derivate in memoria dai built-in; non vengono salvate né aggiunte alla libreria.</p>
      </aside>

      <section className="rv-center" aria-label="Comparison Stage">
        <div className="toolbar jl-toolbar rv-toolbar" role="toolbar" aria-label="Controlli del confronto">
          <Segmented label="Modalità di confronto" value={view.mode} options={REVIEW_MODES.map((m) => ({ id: m, label: REVIEW_MODE_LABEL[m] }))} onChange={(mode) => patch({ mode })} />
          {view.mode === 'grid' && (
            <Segmented label="Asse della griglia" value={view.axis} options={GRID_AXES.map((a) => ({ id: a, label: a === 'variants' ? 'Varianti del preset' : `Preset (${view.variantId})`, title: a === 'variants' ? 'A, B1, B2, B3 dello stesso preset' : 'I quattro preset con la stessa variante' }))} onChange={(axis) => patch({ axis })} />
          )}
          <label className="tb-select" htmlFor="rv-viewport"><span className="visually-hidden">Dimensione</span>
            <select id="rv-viewport" value={view.viewportId} onChange={(e) => patch({ viewportId: e.target.value })}>
              {VIEWPORTS.map((p) => <option key={p.id} value={p.id}>Dimensione: {p.label}</option>)}
              <option value="custom">Dimensione: personalizzata</option>
            </select>
          </label>
          {view.viewportId === 'custom' && (
            <span className="rv-custom">
              <label>L <input id="rv-custom-w" type="number" min={CUSTOM_LIMITS.minW} max={CUSTOM_LIMITS.maxW} value={view.custom.width} onChange={(e) => patch({ custom: clampCustom(Number(e.target.value), view.custom.height) })} /></label>
              <label>A <input id="rv-custom-h" type="number" min={CUSTOM_LIMITS.minH} max={CUSTOM_LIMITS.maxH} value={view.custom.height} onChange={(e) => patch({ custom: clampCustom(view.custom.width, Number(e.target.value)) })} /></label>
            </span>
          )}
          <label className="tb-select" htmlFor="rv-background"><span className="visually-hidden">Sfondo</span>
            <select id="rv-background" value={view.background} onChange={(e) => patch({ background: e.target.value as ReviewView['background'] })}>
              {REVIEW_BACKGROUNDS.map((b) => <option key={b} value={b}>Sfondo: {REVIEW_BACKGROUND_LABEL[b]}</option>)}
            </select>
          </label>
          <label className="tb-select" htmlFor="rv-content"><span className="visually-hidden">Contenuto</span>
            <select id="rv-content" value={view.content} onChange={(e) => patch({ content: e.target.value as ReviewView['content'] })}>
              {REVIEW_CONTENTS.map((c) => <option key={c} value={c}>Contenuto: {REVIEW_CONTENT_LABEL[c]}</option>)}
            </select>
          </label>
          {view.mode !== 'motion' && (
            <label className="tb-select" htmlFor="rv-state"><span className="visually-hidden">Stato</span>
              <select id="rv-state" value={view.state} onChange={(e) => patch({ state: e.target.value as ReviewView['state'] })}>
                {REVIEW_STATES.map((s) => <option key={s} value={s}>Stato: {STATE_LABEL[s]}</option>)}
              </select>
            </label>
          )}
          <label className="tb-select" htmlFor="rv-zoom"><span className="visually-hidden">Zoom</span>
            <select id="rv-zoom" value={view.zoom} title="Ingrandimento CSS: non cambia il DPR" onChange={(e) => patch({ zoom: Number(e.target.value) === 2 ? 2 : 1 })}>
              <option value={1}>Zoom CSS 100%</option><option value={2}>Zoom CSS 200%</option>
            </select>
          </label>
          <Segmented label="Movimento" value={view.reducedMotion ? 'reduced' : 'full'} options={[{ id: 'full', label: 'Movimento' }, { id: 'reduced', label: 'Ridotto', title: 'Simula movimento ridotto con il profilo static (non cambia i documenti)' }]} onChange={(v) => patch({ reducedMotion: v === 'reduced' })} />
          {view.mode !== 'motion' && <Switch id="rv-sync" checked={view.sync} onChange={(sync) => patch({ sync })} label="Input sincronizzato" />}
          <Switch id="rv-normalized" checked={view.normalized} onChange={(normalized) => patch({ normalized })} label="Tinta normalizzata" />
          {view.mode !== 'motion' && (
            <button type="button" className="button small" id="rv-bounce" disabled={!live} onClick={() => setBounce((n) => n + 1)} title="Pressione, tenuta e rilascio su tutte le superfici">
              <Ic name="arrowRight" size={14} /> Prova rimbalzo
            </button>
          )}
          <button type="button" className="button small" id="rv-reset" onClick={reset}>Ripristina</button>
        </div>

        {cssFallback && <p className="jl-banner" role="status" id="rv-css-fallback">Una o più superfici usano il fallback CSS (SVG non disponibile o opacità richiesta): niente bolle né deformazione. Il confronto di movimento non è significativo.</p>}

        <div className="rv-stage" id="rv-stage" data-mode={view.mode} data-background={view.background}>
          {view.mode === 'motion'
            ? <MotionStage view={view} register={register} />
            : <LiveStage view={view} register={register} bounceSignal={bounce} />}
        </div>

        <div className="jl-readout" aria-live="polite">
          <span className="chip" data-kind="neutral" id="rv-readout-size">{vp.width}×{vp.height} px · zoom CSS {view.zoom * 100}%</span>
          <span className="chip" data-kind="neutral" id="rv-readout-dpr" title="DPR reale del browser; questa vista non lo emula. Lo strumento di test lo imposta con deviceScaleFactor.">DPR del browser: {dpr}</span>
          <span className="chip" data-kind="neutral" id="rv-readout-count">{cells.length} {cells.length === 1 ? 'superficie' : 'superfici'}</span>
          <span className="jl-hint">{view.mode === 'motion' ? 'Usa Play, Step o il cursore; le fasi saltano a un istante preciso.' : live ? 'Premi, tieni e rilascia un Button, oppure usa Spazio / Invio.' : `Stato statico «${STATE_LABEL[view.state]}»: l’input è sospeso.`}</span>
        </div>
      </section>

      <aside className="rv-right" id="rv-right" aria-label="Review Inspector" hidden={!right} tabIndex={-1}>
        <div className="rv-right-bar">
          <h3 className="rv-h">Review Inspector</h3>
          <button type="button" className="button small rv-close" id="rv-close-inspector" onClick={() => setRight(false)}>Chiudi</button>
        </div>
        <ReviewInspector
          view={view} level={level} focus={focus} surfaces={registry.current.size} set={set} storageProblem={problem} persisted={persisted}
          onSet={onSet} onReplaceStorage={() => { changed.current = true; setProblem(null); }} onExport={onExport} exportMessage={exportMessage} now={() => new Date().toISOString()}
        />
      </aside>
    </main>
  );
}
