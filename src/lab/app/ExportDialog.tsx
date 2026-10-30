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
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; messages: string[] } | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setTarget(workspace === 'builder' ? 'component' : 'material');
      setResult(null);
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
        <header className="export-head">
          <h2 id="exportTitle">Esporta</h2>
          <button type="button" className="tb-icon-button" id="exportClose" aria-label="Chiudi" onClick={() => session.setExportOpen(false)}>
            ×
          </button>
        </header>
        <fieldset className="export-targets">
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
        {!adapter && (
          <p className="hint" id="exportNone">
            Nessun formato disponibile per questa selezione.
          </p>
        )}
        {plan && adapter && (
          <section className="export-plan" id="exportPlan" aria-label="Contenuto dell’export">
            <p>
              <strong>{adapter.label}</strong> → <code id="exportName">{plan.name}</code>
            </p>
            <h3 className="panel-sub">Verrà esportato</h3>
            <ul className="export-files">
              {plan.files.map((f) => (
                <li key={f.path}>
                  <code>{f.path}</code> — {f.description}
                </li>
              ))}
            </ul>
            <h3 className="panel-sub">Dipendenze</h3>
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
            Esportazione guidata del progetto →
          </button>
        </p>
        <div className="button-row export-actions">
          <button type="button" className="button" onClick={() => session.setExportOpen(false)}>
            Chiudi
          </button>
          <button
            type="button"
            className="button primary"
            id="exportGo"
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
