/** Center column of the Jelly lab: the live preview, its controls and the effective-backend readout. */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { JellyRenderStatus } from '../../../runtime/experimental/jelly';
import { createJellyCoordinator, type JellyCoordinator } from '../../../runtime/experimental/jelly-scheduler';
import { Ic, Segmented } from '../../app/ui';
import type { JellyBridge } from './bridge';
import { JellyButton } from './JellyButton';
import {
  COMPARE_ORDER, PREVIEW_BACKGROUNDS, PREVIEW_BACKGROUND_LABEL, PREVIEW_SCALES, PREVIEW_SIZES, PREVIEW_SIZE_LABEL, PREVIEW_STATES, PREVIEW_STATE_LABEL,
  type PreviewBackground, type PreviewSize, type PreviewState,
} from './preview-model';
import { setJellyView, setPrimaryBridge, useJellyView, useWorkbench } from './studio';
import { presetDoc, presetLabel, type JellyWorkbench } from './workbench';

const BACKEND_NAME = { svg: 'SVG', css: 'CSS' } as const;

export function backendSummary(s: JellyRenderStatus | null): string {
  if (!s) return 'Non montato';
  const requested = s.requestedBackend === 'auto' ? 'auto' : s.requestedBackend.toUpperCase();
  return `${BACKEND_NAME[s.backend]}${s.opaque ? ' · opaco' : ''} (richiesto: ${requested})`;
}

export function JellyPreview({ wb }: { wb: JellyWorkbench }) {
  const doc = useWorkbench(wb, (s) => s.doc);
  const errors = useWorkbench(wb, (s) => s.rejections);
  const view = useJellyView();
  const [bridge, setBridge] = useState<JellyBridge | null>(null);
  const [status, setStatus] = useState<JellyRenderStatus | null>(null);
  const [clicks, setClicks] = useState(0);
  // One coordinator for every Jelly surface of this view: a single RAF loop, idle when nothing moves.
  const coordinator = useMemo<JellyCoordinator>(() => createJellyCoordinator(), []);
  useEffect(() => () => coordinator.destroy(), [coordinator]);

  const onBridge = useRef((b: JellyBridge | null) => { setBridge(b); setPrimaryBridge(b); });
  useEffect(() => {
    if (!bridge) { setStatus(null); return; }
    setStatus(bridge.status);
    return bridge.onStatus(setStatus);
  }, [bridge]);

  const anyRejected = Object.values(errors).some(Boolean);
  const live = view.state === 'live';
  return (
    <section className="preview jl-preview" aria-labelledby="jlPreviewTitle" data-jelly-preview>
      <div className="preview-head">
        <div className="jl-title">
          <h2 className="preview-title" id="jlPreviewTitle">Jello Canvas</h2>
          <span className="chip chip-warn" title="Funzione sperimentale: non è un materiale ufficiale">Sperimentale</span>
        </div>
        <div className="toolbar jl-toolbar" role="toolbar" aria-label="Controlli dell’anteprima Jello">
          <label className="tb-select" htmlFor="jl-background">
            <span className="visually-hidden">Sfondo di prova</span>
            <select id="jl-background" value={view.background} onChange={(e) => setJellyView({ background: e.target.value as PreviewBackground })}>
              {PREVIEW_BACKGROUNDS.map((b) => <option key={b} value={b}>Sfondo: {PREVIEW_BACKGROUND_LABEL[b]}</option>)}
            </select>
          </label>
          <label className="tb-select" htmlFor="jl-size">
            <span className="visually-hidden">Dimensione del Button</span>
            <select id="jl-size" value={view.size} onChange={(e) => setJellyView({ size: e.target.value as PreviewSize })}>
              {PREVIEW_SIZES.map((s) => <option key={s} value={s}>Button: {PREVIEW_SIZE_LABEL[s]}</option>)}
            </select>
          </label>
          <label className="tb-select" htmlFor="jl-scale">
            <span className="visually-hidden">Zoom</span>
            <select id="jl-scale" value={String(view.compare ? 1 : view.scale)} disabled={view.compare} title={view.compare ? 'Lo zoom vale per il Button singolo' : undefined} onChange={(e) => setJellyView({ scale: Number(e.target.value) })}>
              {PREVIEW_SCALES.map((s) => <option key={s} value={s}>Zoom {s * 100}%</option>)}
            </select>
          </label>
          <label className="tb-select" htmlFor="jl-state">
            <span className="visually-hidden">Stato del Button</span>
            <select id="jl-state" value={view.state} onChange={(e) => setJellyView({ state: e.target.value as PreviewState })}>
              {PREVIEW_STATES.map((s) => <option key={s} value={s}>Stato: {PREVIEW_STATE_LABEL[s]}</option>)}
            </select>
          </label>
          <Segmented
            label="Movimento"
            value={view.env.reducedMotion ? 'reduced' : 'full'}
            options={[{ id: 'full', label: 'Movimento', title: 'Movimento elastico abilitato' }, { id: 'reduced', label: 'Ridotto', title: 'Simula movimento ridotto con il profilo static (non cambia il documento)' }]}
            onChange={(v) => setJellyView({ env: { ...view.env, reducedMotion: v === 'reduced' } })}
          />
          <button type="button" className="button small" id="jl-bounce" disabled={!live || !bridge} onClick={() => bridge?.playBounce()} title="Pressione, tenuta e rilascio, come nelle prove M6.3">
            <Ic name="arrowRight" size={14} /> Prova rimbalzo
          </button>
          <button type="button" className="button small" id="jl-reset-preview" onClick={() => { bridge?.reset(); setClicks(0); setJellyView({ state: 'live', scale: 1, size: 'md', background: 'light', compare: false, env: { reducedMotion: false, svgUnavailable: false, opaque: false, reducedTransparency: false } }); }}>
            Ripristina preview
          </button>
          <button type="button" className="button small" id="jl-compare" aria-pressed={view.compare} onClick={() => setJellyView({ compare: !view.compare })} title="Soft, Candy, Clear e Dense affiancati con i parametri originali dei preset">
            <Ic name="split" size={14} /> Confronta preset
          </button>
        </div>
      </div>

      {anyRejected && <p className="jl-banner" role="status" id="jl-rejected">Una modifica non valida è stata rifiutata: il Button mostra l’ultimo valore valido. Vedi il messaggio accanto al parametro.</p>}
      {bridge?.errors && <p className="jl-banner" data-kind="danger" role="alert" id="jl-invalid">Documento Jello non valido: {bridge.errors[0]}. Il Button resta un pulsante nativo senza decorazione.</p>}

      <div className="jl-stage" data-background={view.background} data-compare={view.compare} id="jl-stage">
        {!view.compare ? (
          <div className="jl-scale" style={{ transform: `scale(${view.scale})` }}>
            <JellyButton
              id="jl-primary"
              testId="jelly-primary"
              doc={doc}
              env={view.env}
              state={view.state}
              size={view.size}
              coordinator={coordinator}
              onBridge={onBridge.current}
              onClick={() => setClicks((n) => n + 1)}
            />
          </div>
        ) : (
          <Compare wb={wb} coordinator={coordinator} />
        )}
      </div>

      <div className="jl-readout" aria-live="polite">
        {view.compare
          ? <span className="chip" data-kind="neutral" id="jl-backend">Confronto: 4 preset con i loro valori originali · backend effettivo per superficie</span>
          : <span className="chip" data-kind="neutral" id="jl-backend">Backend effettivo: {backendSummary(status)}</span>}
        {status && !view.compare && <span className="chip" data-kind="neutral" id="jl-motion">{status.motion === 'dynamic' ? 'Moto: dinamico' : 'Moto: statico'}</span>}
        {status?.suspended && <span className="chip" data-kind="warn">Sospeso</span>}
        <span className="chip" data-kind="neutral" id="jl-clicks" title="Click nativi del Button: il renderer non ne genera">Click nativi: {clicks}</span>
        <span className="jl-hint">{live ? 'Premi, tieni e rilascia il Button, oppure usa Spazio / Invio da tastiera.' : `Stato statico «${PREVIEW_STATE_LABEL[view.state]}»: l’input è sospeso.`}</span>
      </div>
    </section>
  );
}

/** The four candidates side by side with their original values; the working document is not part of it. */
function Compare({ wb, coordinator }: { wb: JellyWorkbench; coordinator: JellyCoordinator }) {
  const view = useJellyView();
  const docs = useMemo(() => COMPARE_ORDER.map((id) => presetDoc(id)!), []);
  const current = useWorkbench(wb, (s) => s.base.id);
  return (
    <div className="jl-compare" role="group" aria-label="Confronto dei preset candidati">
      {docs.map((d) => (
        <figure key={d.id} className="jl-compare-cell" data-selected={d.id === current}>
          <div className="jl-scale">
            <JellyButton testId={`compare-${d.id}`} doc={d} env={view.env} state={view.state} size={view.size} coordinator={coordinator} label={d.name.replace('Jelly ', '')} />
          </div>
          <figcaption>{presetLabel(d)}</figcaption>
        </figure>
      ))}
    </div>
  );
}
