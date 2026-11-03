/**
 * Export dialog: choose what to export (material only, component + material,
 * JSON configuration), see the files and dependencies before downloading.
 * It lists adapters (src/export/adapters.ts); it never builds a format itself.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { adaptersFor, type ExportTarget } from '../../export/adapters';
import type { LabSession } from '../session';
import { useLab } from '../store';
import { resolveDefinitionMaterial } from '../../components';
import { Icon } from './icons';

const TARGETS: { id: ExportTarget; label: string; hint: string }[] = [
  { id: 'material', label: 'Solo materiale', hint: 'Il materiale configurato, senza componenti: da applicare a elementi del tuo progetto.' },
  { id: 'component', label: 'Componente + materiale', hint: 'La componente completa, con il suo materiale e il runtime, pronta per React oppure Vanilla (HTML/CSS/JS).' },
  { id: 'configuration', label: 'Configurazione JSON', hint: 'Il documento che il laboratorio salva: si riapre senza perdite, lo leggono strumenti e agenti.' },
];

const STEPS = ['Elemento', 'Formato', 'Dipendenze', 'Contenuto', 'Export'] as const;

export function ExportDialog({ session }: { session: LabSession }) {
  const open = useLab((s) => s.exportOpen);
  const workspace = useLab((s) => s.workspace);
  const doc = useLab((s) => s.doc);
  const builderDoc = useLab((s) => s.builder.doc);
  const material = useMemo(() => (workspace === 'builder' ? resolveDefinitionMaterial(builderDoc) : doc), [workspace, builderDoc, doc]);
  const component = useLab((s) => (s.workspace === 'builder' ? s.builder.doc : null));
  const ref = useRef<HTMLDialogElement>(null);
  const [target, setTarget] = useState<ExportTarget>(workspace === 'builder' ? 'component' : 'material');
  const [adapterId, setAdapterId] = useState<string>('');
  const [step, setStep] = useState<number | null>(null);
  /** A section of step `i` is shown in the summary and on its own step. */
  const shows = (i: number) => step === null || step === i;
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; messages: string[] } | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setTarget(workspace === 'builder' ? 'component' : 'material');
      setResult(null);
      setStep(null);
      d.showModal();
    } else if (!open && d.open) d.close();
  }, [open, workspace]);

  const req = useMemo(() => ({ material, ...(component ? { component } : {}) }), [material, component]);
  const adapters = useMemo(() => adaptersFor(target, req), [target, req]);
  const adapter = adapters.find((a) => a.id === adapterId) ?? adapters[0];
  const plan = adapter ? adapter.describe(req) : null;

  return (
    <dialog className="export-dialog" id="exportDialog" ref={ref} aria-labelledby="exportTitle" onClose={() => session.setExportOpen(false)}>
      <form method="dialog" className="export-inner" onSubmit={(e) => e.preventDefault()}>
        <div className="hero export-hero">
        <header className="export-head">
          <div className="hero-title">
            <p className="hero-eyebrow">PORTA FUORI IL TUO LAVORO</p>
            <h2 id="exportTitle" className="hero-h1">Esporta</h2>
          </div>
          <button type="button" className="tb-icon-button" id="exportClose" aria-label="Chiudi" onClick={() => session.setExportOpen(false)}>
            ×
          </button>
        </header>
        <ol className="export-steps" aria-label="Passi dell’esportazione">{STEPS.map((label, i) => <li key={label}><button type="button" aria-current={step === i ? 'step' : undefined} onClick={() => setStep(i)}><span className="export-step-number">{i + 1}</span>{label}</button></li>)}</ol>
        </div>
        {step !== null && <p className="export-handoff" role="status">Passo {step + 1} di 5 · <button type="button" className="link export-overview" onClick={() => setStep(null)}>Mostra riepilogo completo</button></p>}
        {/* Summary (step null): every section. Guided: only what the step is about. Hidden sections stay
            mounted, so choices survive switching between the two. Nothing refers to a column's position:
            the columns stack on narrow screens. */}
        <div className="export-cols" data-step={step ?? undefined}>
          <section className="export-col" aria-label="Contenuto" hidden={step === 1}>
            <h3 className="export-col-title">{step === null ? 'Contenuto' : STEPS[step]}</h3>
            <fieldset className="export-targets" hidden={!shows(0)}>
              <legend className="field-legend">Cosa esportare</legend>
              {TARGETS.map((t) => {
                const disabled = t.id === 'component' && !component;
                return (
                  <label key={t.id} className="export-target" htmlFor={`export-target-${t.id}`} data-disabled={disabled || undefined}>
                    <input
                      type="radio"
                      name="exportTarget"
                      id={`export-target-${t.id}`}
                      checked={target === t.id}
                      disabled={disabled}
                      onChange={() => {
                        setTarget(t.id);
                        setAdapterId('');
                        setResult(null);
                      }}
                    />
                    <span>
                      <strong>{t.label}</strong>
                      <span className="hint">{disabled ? 'Apri il Component Builder per esportare una componente.' : t.hint}</span>
                    </span>
                  </label>
                );
              })}
            </fieldset>
            {!adapter && (
              <p className="hint" id="exportNone">
                Nessun formato disponibile per questa selezione.
              </p>
            )}
            {plan && adapter && (
              <section className="export-plan" id="exportPlan" aria-label="Contenuto dell’export" hidden={step === 0}>
                <p>
                  <strong>{adapter.label}</strong> → <code id="exportName">{plan.name}</code>
                </p>
                <h3 className="panel-sub" hidden={!shows(3)}>Verrà esportato</h3>
                <ul className="export-files" hidden={!shows(3)}>
                  {plan.files.map((f) => (
                    <li key={f.path}>
                      <code>{f.path}</code> — {f.description}
                    </li>
                  ))}
                </ul>
                <div hidden={!shows(2)}><h3 className="panel-sub">Dipendenze</h3>
                {plan.dependencies.length ? (
                  <ul className="export-files" id="exportDeps">
                    {plan.dependencies.map((d) => (
                      <li key={d.name} data-kind={d.kind}>
                        <code>
                          {d.name} {d.version}
                        </code>{' '}
                        · {d.kind === 'bundled' ? 'inclusa' : 'da installare nel progetto'} — {d.note}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="hint" id="exportDeps">
                    Nessuna.
                  </p>
                )}
                </div>
                {plan.notes.map((n) => (
                  <p key={n} className="hint">
                    {n}
                  </p>
                ))}
              </section>
            )}
            {result && (
              <ul className="messages" id="exportMessages" role="status" data-ok={String(result.ok)}>
                {result.messages.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            )}
          </section>
          <section className="export-col" aria-label="Anteprima pacchetto" hidden={!shows(4)}>
            <h3 className="export-col-title">Anteprima pacchetto</h3>
            <div className="export-package">
              <strong>{component && target !== 'material' ? component.name : material.name}</strong>
              <span className="hint">{target === 'material' ? 'Materiale' : target === 'component' ? 'Componente + materiale' : 'Configurazione JSON'}</span>
              <span className="hint">{adapter ? adapter.label : 'Nessun formato'}</span>
            </div>
            <dl className="export-summary">
              <div><dt>Contenuto</dt><dd>{TARGETS.find((t) => t.id === target)?.label}</dd></div>
              <div><dt>Formato</dt><dd>{adapter?.label ?? '—'}</dd></div>
              <div><dt>File</dt><dd>{plan ? <code>{plan.name}</code> : '—'}</dd></div>
              <div><dt>File inclusi</dt><dd>{plan ? plan.files.length : 0}</dd></div>
            </dl>
          </section>
          <section className="export-col" aria-label="Formato" hidden={!shows(1)}>
            <h3 className="export-col-title">Formato</h3>
            {adapters.length > 1 && (
              <fieldset className="export-formats">
                <legend className="field-legend">Formato</legend>
                {adapters.map((a) => (
                  <label key={a.id} className="check" htmlFor={`export-adapter-${a.id}`}>
                    <input type="radio" name="exportAdapter" id={`export-adapter-${a.id}`} checked={adapter?.id === a.id} onChange={() => setAdapterId(a.id)} />
                    <span>{a.label}</span>
                  </label>
                ))}
              </fieldset>
            )}
            {adapters.length === 1 && <p className="hint">Formato disponibile: {adapter?.label}.</p>}
          </section>
        </div>
        <p className="export-project">
          <button
            type="button"
            className="link"
            id="exportProjectLink"
            onClick={() => {
              session.setExportOpen(false);
              session.openFlow('export');
            }}
          >
            Backup progetto (.jello) e asset →
          </button>
        </p>
        <p className="export-handoff">Il backup .jello recupera il lavoro nello Studio. I pacchetti React e Vanilla integrano il runtime nel tuo progetto.</p>
        <div className="button-row export-actions">
          {step !== null && <button type="button" className="button" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, (s ?? 0) - 1))}>Indietro</button>}
          {step !== null && step < 4 && <button type="button" className="button primary" disabled={!adapter} onClick={() => setStep((s) => Math.min(4, (s ?? 0) + 1))}>Continua</button>}
          <button type="button" className="button" onClick={() => session.setExportOpen(false)}>
            Chiudi
          </button>
          <button
            type="button"
            className="button primary"
            id="exportGo"
            hidden={step !== null && step !== 4}
            disabled={!adapter || busy}
            onClick={async () => {
              if (!adapter) return;
              setBusy(true);
              setResult(await session.exportWith(adapter.id));
              setBusy(false);
            }}
          >
            <Icon name="download" /> {busy ? 'Esportazione…' : 'Scarica'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
