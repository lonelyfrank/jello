/**
 * Review Inspector: what the active comparison is made of, what to look for, and the reviewer's decision.
 * Base shows criteria and decisions; Advanced adds values and measurements. Nothing here edits a document.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { JELLY_INDEX, jellyParams, type JellyParamKey } from '../../../../model/experimental/jelly';
import type { JellyRenderStatus } from '../../../../runtime/experimental/jelly';
import type { JellyBridge } from '../bridge';
import {
  DECISION_LABEL, DECISION_STATES, deliveryState, editDecision, NOTE_FIELDS, NOTE_LABEL, NOTE_MAX, setDecisionStatus, type DecisionSet, type DecisionStatus, type NoteField,
} from './decisions';
import { motionMetrics, PRESET_CRITERIA, REVIEW_QUESTIONS, viewportOf, type ReviewView } from './review-model';
import { PRESET_TITLE, REVIEW_VARIANT_IDS, reviewVariant, VARIANT_INFO, type ReviewVariantId } from './variants';

type Level = 'base' | 'advanced';

const show = (v: unknown): string => (typeof v === 'number' ? String(Math.round(v * 1000) / 1000) : String(v));

function Section({ id, title, children, open }: { id: string; title: string; children: ReactNode; open?: boolean }) {
  return (
    <details className="rv-section" id={`rv-sec-${id}`} {...(open ? { open: true } : {})}>
      <summary>{title}</summary>
      <div className="rv-section-body">{children}</div>
    </details>
  );
}

function ParamTable({ keys, view, level }: { keys: readonly JellyParamKey[]; view: ReviewView; level: Level }) {
  const a = useMemo(() => jellyParams(reviewVariant(view.presetId, 'A').doc), [view.presetId]);
  const b = useMemo(() => jellyParams(reviewVariant(view.presetId, view.variantId).doc), [view.presetId, view.variantId]);
  const changed = keys.filter((k) => a[k] !== b[k]);
  if (level === 'base') {
    return (
      <p className="muted small" data-testid="rv-changed-summary">
        {view.variantId === 'A' ? 'Baseline: valori built-in invariati.' : changed.length ? `Rispetto ad A cambiano: ${changed.map((k) => JELLY_INDEX[k].label).join(', ')}.` : 'Nessun valore di questa sezione cambia rispetto ad A.'}
      </p>
    );
  }
  return (
    <table className="rv-table" data-testid="rv-params">
      <thead><tr><th scope="col">Parametro</th><th scope="col">A</th><th scope="col">{view.variantId}</th></tr></thead>
      <tbody>
        {keys.map((k) => (
          <tr key={k} data-changed={a[k] !== b[k]}>
            <th scope="row">{JELLY_INDEX[k].label}<small> {k}</small></th>
            <td>{show(a[k])}</td>
            <td>{show(b[k])}{a[k] !== b[k] && <span aria-label="diverso da A"> ●</span>}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export interface InspectorProps {
  view: ReviewView;
  level: Level;
  /** Bridge of the surface under discussion, when mounted. */
  focus: JellyBridge | null;
  surfaces: number;
  set: DecisionSet;
  storageProblem: string | null;
  persisted: boolean;
  onSet(next: DecisionSet): void;
  onReplaceStorage(): void;
  onExport(kind: 'json' | 'md'): void;
  exportMessage: string | null;
  now(): string;
}

export function ReviewInspector(p: InspectorProps) {
  const { view, level, focus } = p;
  const variant = useMemo(() => reviewVariant(view.presetId, view.variantId), [view.presetId, view.variantId]);
  const criteria = PRESET_CRITERIA[view.presetId];
  const title = PRESET_TITLE[view.presetId];
  const vp = viewportOf(view);

  const [status, setStatus] = useState<JellyRenderStatus | null>(null);
  useEffect(() => {
    setStatus(focus?.status ?? null);
    return focus?.onStatus(setStatus);
  }, [focus]);
  const nodes = focus ? focus.host.querySelectorAll('.jelly-decoration *').length : null;
  const motion = focus?.motion ?? null;

  const decision = p.set.decisions[view.presetId];
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => { setMessage(null); }, [view.presetId]);
  const shortSide = Math.min(vp.width, vp.height);
  const px = (fraction: number) => `${(fraction * shortSide).toFixed(2)} px`;

  const record = (status: DecisionStatus) => {
    const r = setDecisionStatus(p.set, view.presetId, status, p.now());
    if (r.ok) { p.onSet(r.value); setMessage(null); } else setMessage(r.errors[0] ?? 'Decisione non valida.');
  };

  return (
    <div className="rv-inspector-body" data-level={level}>
      <Section id="identity" title="1 · Optical Identity" open>
        <p><strong>{title.full}</strong> — {title.identity}</p>
        <p><strong>{VARIANT_INFO[view.variantId].label}</strong> · {VARIANT_INFO[view.variantId].kind}</p>
        <p className="muted small">{VARIANT_INFO[view.variantId].summary}</p>
        <p className="small"><span className="chip" data-kind="warn" data-testid="rv-approval">Non approvata · visuallyVerified = false</span></p>
        <h4 className="rv-h">Direzione del materiale</h4>
        <ul className="rv-list">{criteria.direction.map((d) => <li key={d}>{d}</li>)}</ul>
        <h4 className="rv-h">Da controllare</h4>
        <ul className="rv-list">{criteria.watch.map((d) => <li key={d}>{d}</li>)}</ul>
        {level === 'advanced' && (
          <dl className="rv-dl">
            <dt>Trattamento di rendering</dt><dd data-testid="rv-treatment">{variant.treatment}</dd>
            <dt>Provenienza dei parametri</dt><dd>Derivata dal built-in <code>{view.presetId}</code>{variant.changes.length ? `; ${variant.changes.length} parametri sostituiti con i candidati M6.4.3` : '; nessuna sostituzione'}</dd>
            <dt>Identità tecnica</dt><dd><code>{variant.doc.id}</code> · seed {variant.doc.bubbles.seed}</dd>
            {variant.sameAs && (<><dt>Equivalenza</dt><dd>Identica a {variant.sameAs}</dd></>)}
          </dl>
        )}
        {variant.limitations.length > 0 && (<><h4 className="rv-h">Limitazioni note</h4><ul className="rv-list">{variant.limitations.map((l) => <li key={l}>{l}</li>)}</ul></>)}
      </Section>

      <Section id="body" title="2 · Material Body">
        <ParamTable keys={['tint', 'bodyOpacity', 'transmission', 'absorption', 'scattering', 'thickness']} view={view} level={level} />
        {level === 'advanced' && status && <p className="muted small">Effettivo sulla superficie: alpha {show(status.effectiveAlpha)} · trasmissione {show(status.effectiveTransmission)}</p>}
        {view.normalized && <p className="muted small">Vista a tinta normalizzata: stessa tinta e stesso colore del contenuto per tutti i preset (non salvata).</p>}
      </Section>

      <Section id="edge" title="3 · Edge & Surface">
        <ParamTable keys={['edgeFalloff', 'highlightStrength', 'roughness', 'elevation', 'shadowOpacity']} view={view} level={level} />
      </Section>

      <Section id="bubbles" title="4 · Internal Bubbles">
        <ParamTable keys={['density', 'radiusMin', 'radiusMax', 'opacity', 'seed']} view={view} level={level} />
        <p className="muted small">{variant.treatment === 'm643' ? 'Trattamento m643: gradiente tinto, arco di luce e mezzaluna speculare.' : 'Trattamento storico m642.'} {vp.width < 100 ? 'A questa dimensione le bolle sono sotto la soglia di leggibilità in ogni variante (docs/m643/visual-anatomy.md).' : ''}</p>
        {status && <p className="small" data-testid="rv-bubbles">Bolle disegnate ora: {status.bubbles}</p>}
      </Section>

      <Section id="motion" title="5 · Motion & Elasticity">
        <ParamTable keys={['responseMs', 'dampingRatio', 'maxDeformation', 'pressStrength', 'releaseImpulse']} view={view} level={level} />
        <MotionSummary view={view} level={level} px={px} />
        {level === 'advanced' && motion && (
          <p className="jl-live" data-testid="rv-motion-live">x {motion.x.toFixed(4)} · v {motion.v.toFixed(3)} · target {motion.target.toFixed(4)} · {motion.pressed ? 'premuto' : 'rilasciato'}</p>
        )}
      </Section>

      <Section id="a11y" title="6 · Accessibility">
        <ul className="rv-list" data-testid="rv-a11y">
          <li><strong>Tastiera, Invio/Spazio, focus visibile</strong> — il Button è nativo; coperto da test E2E automatici (non sostituiscono la prova manuale).</li>
          <li><strong>Movimento ridotto</strong> — simulabile qui (profilo static); la preferenza di sistema è gestita dal renderer. Ora: {view.reducedMotion ? 'simulato' : 'non simulato'}.</li>
          <li><strong>Trasparenza ridotta e forced colors</strong> — coperti dalla suite esistente <code>jelly-studio.spec</code>; non riesaminati qui.</li>
          <li><strong>Contrasto etichetta, stato idle</strong> — misurato in M6.4.3 (≥ 4,81 sulle varianti B3), non in questa vista.</li>
          <li><strong>Contrasto in hover, premuto, disabilitato, sfondi testo/strutturato</strong> — <span className="chip" data-kind="warn">NOT TESTED</span></li>
          <li><strong>Lettore di schermo</strong> — <span className="chip" data-kind="warn">NOT TESTED</span></li>
          <li><strong>Area di interazione</strong> — {vp.width}×{vp.height} px; l’hitbox è quella del Button e non cambia durante la deformazione.</li>
        </ul>
        <p className="muted small">Nessuna conformità WCAG è dichiarata sulla base dei test raster.</p>
      </Section>

      <Section id="perf" title="7 · Performance">
        <p className="muted small">Costo del renderer, non dell’interfaccia di revisione. Misure riproducibili con <code>docs/m643/tools/perf.mjs</code>; riepilogo in <code>docs/m643a/performance.md</code>.</p>
        {level === 'advanced' ? (
          <dl className="rv-dl" data-testid="rv-perf">
            <dt>Superfici montate</dt><dd>{p.surfaces}</dd>
            <dt>Nodi SVG della superficie in discussione</dt><dd>{nodes ?? '—'}</dd>
            <dt>Aggiornamenti / distribuzioni bolle</dt><dd>{status ? `${status.updates} / ${status.distributions}` : '—'}</dd>
            <dt>Frame / aggiornamenti dello scheduler</dt><dd>{motion ? `${motion.scheduler.frames} / ${motion.scheduler.updates}` : '—'}</dd>
            <dt>RAF in attesa</dt><dd>{motion ? (motion.scheduler.pending ? 'sì' : 'no') : '—'}</dd>
            <dt>Backend effettivo</dt><dd>{status ? `${status.backend}${status.opaque ? ' · opaco' : ''}` : '—'}</dd>
          </dl>
        ) : <p className="small">A → B3: ≈ +5 % per frame a 12 superfici, entro il rumore a 1 e 24 (M6.4.3). Dettagli in modalità Avanzata.</p>}
        {status?.backend === 'css' && <p className="jl-banner" role="status">Questo browser o questa impostazione usa il fallback CSS: niente bolle né deformazione. Le differenze di movimento non sono visibili.</p>}
      </Section>

      <Section id="decision" title="8 · Review Decision" open>
        <p className="small">Stato di consegna: <span className="chip" data-kind="neutral" data-testid="rv-delivery">{deliveryState(p.set)}</span></p>
        <p className="muted small">I test e le metriche non assegnano mai uno stato: lo scrive il reviewer. Una review automatica non è un’approvazione visiva.</p>
        {p.storageProblem && (
          <div className="jl-banner" role="status" data-testid="rv-storage-problem">
            <p>{p.storageProblem} Le decisioni di questa sessione non vengono salvate finché non lo decidi.</p>
            <button type="button" className="button small" id="rv-replace-storage" onClick={p.onReplaceStorage}>Sostituisci il registro locale</button>
          </div>
        )}
        {!p.persisted && !p.storageProblem && <p className="muted small">Registro locale non disponibile in questo browser: le decisioni restano in memoria; esporta il report per conservarle.</p>}
        <fieldset className="rv-fieldset">
          <legend>Decisione per {title.short}</legend>
          <div className="rv-status" role="group" aria-label="Stato della decisione">
            {DECISION_STATES.map((s) => (
              <button key={s} type="button" className="button small" id={`rv-status-${s}`} aria-pressed={decision.status === s} onClick={() => record(s)}>{DECISION_LABEL[s]}</button>
            ))}
          </div>
          {message && <p className="jl-banner" role="alert" id="rv-decision-error">{message}</p>}
          <label className="rv-field" htmlFor="rv-decision-variant">
            <span>Variante scelta</span>
            <select id="rv-decision-variant" value={decision.variant ?? ''} onChange={(e) => p.onSet(editDecision(p.set, view.presetId, { variant: (e.target.value || null) as ReviewVariantId | null }))}>
              <option value="">— nessuna —</option>
              {REVIEW_VARIANT_IDS.map((v: ReviewVariantId) => <option key={v} value={v}>{VARIANT_INFO[v].label}</option>)}
            </select>
          </label>
          {NOTE_FIELDS.map((f: NoteField) => (
            <label key={f} className="rv-field" htmlFor={`rv-note-${f}`}>
              <span>{NOTE_LABEL[f]}</span>
              <textarea id={`rv-note-${f}`} rows={f === 'rationale' ? 3 : 2} maxLength={NOTE_MAX} value={decision[f]} onChange={(e) => p.onSet(editDecision(p.set, view.presetId, { [f]: e.target.value }))} />
            </label>
          ))}
          <p className="muted small" data-testid="rv-decided-at">{decision.decidedAt ? `Decisione registrata: ${decision.decidedAt}` : 'Nessuna decisione registrata (Pending).'}</p>
        </fieldset>
        <div className="rv-export">
          <button type="button" className="button small" id="rv-export-json" onClick={() => p.onExport('json')}>Scarica report JSON</button>
          <button type="button" className="button small" id="rv-export-md" onClick={() => p.onExport('md')}>Scarica report Markdown</button>
        </div>
        {p.exportMessage && <p className="small" role="status" id="rv-export-status">{p.exportMessage}</p>}
        <details className="rv-questions">
          <summary>Le dieci domande della review</summary>
          <ol className="rv-list">{REVIEW_QUESTIONS.map((q) => <li key={q}>{q}</li>)}</ol>
        </details>
      </Section>
    </div>
  );
}

function MotionSummary({ view, level, px }: { view: ReviewView; level: Level; px(f: number): string }) {
  const rows = useMemo(() => REVIEW_VARIANT_IDS.map((id) => ({ id, m: motionMetrics(reviewVariant(view.presetId, id).doc.behavior) })), [view.presetId]);
  const focus = rows.find((r) => r.id === view.variantId)!.m;
  if (level === 'base') {
    return (
      <p className="small" data-testid="rv-motion-summary">
        {view.variantId}: ritorno a riposo in circa {focus.restMs ?? '—'} ms; {focus.releaseSwing > 1e-4 ? `rimbalzo oltre il riposo di ${px(focus.releaseSwing)}` : 'nessun rimbalzo'} (a questa altezza).
      </p>
    );
  }
  return (
    <table className="rv-table" data-testid="rv-motion-table">
      <thead><tr><th scope="col">Variante</th><th scope="col">Picco press</th><th scope="col">90 % a</th><th scope="col">Swing rilascio</th><th scope="col">Riposo</th></tr></thead>
      <tbody>
        {rows.map(({ id, m }) => (
          <tr key={id} data-focus={id === view.variantId}>
            <th scope="row">{id}</th><td>{m.pressPeak} ({px(m.pressPeak)})</td><td>{m.pressT90Ms ?? '—'} ms</td><td>{m.releaseSwing} ({px(m.releaseSwing)})</td><td>{m.restMs ?? '—'} ms</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
