/** Left column of the Jelly lab: candidate presets, the project's personal experimental copies, save and export. */
import { useState } from 'react';
import type { JellyExperimentalDocument } from '../../../model/experimental/jelly';
import type { LabSession } from '../../session';
import { presetDisplayName } from '../../../model/catalog';
import { Ic } from '../../app/ui';
import { exportJellyPackage } from './export-client';
import { JellyConflictBanner, JellyIntegrityPanel } from './JellyIntegrity';
import type { JellyRepository } from './repository';
import { candidatePresets, presetLabel, type JellyWorkbench } from './workbench';
import { useWorkbench } from './studio';

type Pending = { kind: 'preset' | 'record'; id: string; name: string } | null;

const swatch = (doc: JellyExperimentalDocument) => ({ ['--swatch' as string]: doc.material.tint, ['--swatch-alpha' as string]: String(doc.material.bodyOpacity) });

function saveText(s: ReturnType<JellyWorkbench['get']>): { text: string; kind: string } {
  const save = s.save;
  switch (save.kind) {
    case 'saving': return { text: 'Salvataggio…', kind: 'pending' };
    case 'saved': return { text: `Salvato alle ${new Date(save.at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`, kind: 'saved' };
    case 'error': return { text: `Non salvato: ${save.message}`, kind: 'error' };
    case 'dirty': return { text: s.recordId ? 'Modifiche non salvate (la bozza è conservata)' : 'Modifiche non salvate: salva una copia personale', kind: 'dirty' };
    default: return { text: s.base.kind === 'preset' ? 'Preset candidato (sola lettura)' : 'Nessuna modifica', kind: 'idle' };
  }
}

export function JellyLibrary({ wb, session, repo }: { wb: JellyWorkbench; session: LabSession; repo: JellyRepository }) {
  const state = useWorkbench(wb, (s) => s);
  const [pending, setPending] = useState<Pending>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [exportMsg, setExportMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [exporting, setExporting] = useState(false);
  const status = saveText(state);
  const noProject = state.projectId === null;

  const go = (kind: 'preset' | 'record', id: string, name: string) => {
    if (state.dirty && !(kind === state.base.kind && id === state.base.id)) { setPending({ kind, id, name }); return; }
    kind === 'preset' ? wb.selectPreset(id) : wb.openRecord(id);
  };
  const apply = () => {
    if (!pending) return;
    pending.kind === 'preset' ? wb.selectPreset(pending.id) : wb.openRecord(pending.id);
    setPending(null);
  };

  const runExport = async () => {
    setExporting(true);
    setExportMsg(null);
    const out = await exportJellyPackage(state.doc);
    setExporting(false);
    if (out.ok && out.zip && out.result) {
      session.download(`${out.result.root}.zip`, out.zip as Uint8Array<ArrayBuffer>, 'application/zip');
      setExportMsg({ ok: true, text: out.messages.join(' ') });
    } else setExportMsg({ ok: false, text: out.messages.join(' ') });
  };

  return (
    <div className="jl-library" id="jl-library">
      <section className="side-section" aria-labelledby="jl-side-presets">
        <h2 className="side-title" id="jl-side-presets">Preset Jello</h2>
        <p className="hint jl-experimental-note" id="jl-experimental-note">
          <Ic name="alert" size={14} /> <strong>Sperimentale.</strong> Candidati non approvati: Jello è «planned» nel catalogo produttivo, non è un materiale ufficiale né è usato dai componenti.
        </p>
        <ul className="jl-list" aria-label="Preset candidati">
          {candidatePresets().map((p) => (
            <li key={p.doc.id}>
              <button type="button" className="jl-item" id={`jl-preset-${p.doc.id}`} data-preset={p.doc.id} aria-pressed={state.base.kind === 'preset' && state.base.id === p.doc.id && state.recordId === null} onClick={() => go('preset', p.doc.id, presetLabel(p.doc))} title={p.description}>
                <span className="jl-swatch" aria-hidden="true" style={swatch(p.doc)} />
                <span className="jl-item-text"><strong>{presetLabel(p.doc)}</strong><small>{p.description}</small></span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {pending && (
        <div className="jl-banner" role="alertdialog" aria-labelledby="jl-pending-title" id="jl-pending">
          <p id="jl-pending-title"><strong>Modifiche non salvate.</strong> Aprire «{pending.name}» le scarta (la bozza attuale verrà sostituita).</p>
          <div className="library-actions">
            <button type="button" className="button small" id="jl-pending-discard" onClick={apply}>Scarta e apri</button>
            <button type="button" className="button small" id="jl-pending-save" onClick={async () => { if (await wb.saveAsCopy()) apply(); }}>Salva copia e apri</button>
            <button type="button" className="button small" id="jl-pending-cancel" onClick={() => setPending(null)}>Annulla</button>
          </div>
        </div>
      )}

      <section className="side-section" aria-labelledby="jl-side-mine">
        <h2 className="side-title" id="jl-side-mine">Le mie copie sperimentali</h2>
        {noProject ? <p className="hint">Crea o apri un progetto per salvare copie Jello.</p> : state.loading ? <p className="hint">Caricamento…</p> : state.records.length === 0 ? (
          <p className="hint" id="jl-empty">Nessuna copia salvata in questo progetto. Modifica un preset e usa «Salva copia».</p>
        ) : (
          <ul className="jl-list" aria-label="Copie personali del progetto">
            {state.records.map((r) => (
              <li key={r.id} className="jl-record" data-record={r.id}>
                <button type="button" className="jl-item" aria-pressed={state.recordId === r.id} onClick={() => go('record', r.id, r.doc.name)}>
                  <span className="jl-swatch" aria-hidden="true" style={swatch(r.doc)} />
                  <span className="jl-item-text"><strong>{r.doc.name}</strong><small>{r.basePreset ? `da ${presetDisplayName(r.basePreset) ?? r.basePreset}` : 'personale'}</small></span>
                </button>
                {confirmDelete === r.id ? (
                  <button type="button" className="button small danger" aria-label={`Conferma eliminazione di ${r.doc.name}`} onClick={() => { setConfirmDelete(null); void wb.deleteRecord(r.id); }}>Elimina</button>
                ) : (
                  <button type="button" className="tb-icon-button" aria-label={`Elimina ${r.doc.name}`} title="Elimina" onClick={() => setConfirmDelete(r.id)}><Ic name="trash" size={16} /></button>
                )}
              </li>
            ))}
          </ul>
        )}
        {state.skipped.length > 0 && <p className="param-note" id="jl-skipped">Non leggibili (conservati, non modificati): {state.skipped.join('; ')}</p>}
      </section>

      <section className="side-section" aria-labelledby="jl-side-actions">
        <h2 className="side-title" id="jl-side-actions">Documento</h2>
        <p className="jl-save" id="jl-save-status" role="status" data-kind={status.kind}>{status.text}</p>
        <JellyConflictBanner wb={wb} session={session} />
        {!state.persistent && <p className="param-note" id="jl-volatile">{state.note ?? 'Archiviazione non disponibile.'}</p>}
        <div className="library-actions" role="group" aria-label="Salvataggio">
          <button type="button" className="button small primary" id="jl-save" disabled={noProject || !state.recordId} onClick={() => void wb.save()} title={state.recordId ? 'Aggiorna la copia personale' : 'Un preset non si sovrascrive: salva una copia'}><Ic name="save" size={14} /> Salva</button>
          <button type="button" className="button small" id="jl-save-copy" disabled={noProject} onClick={() => void wb.saveAsCopy()}><Ic name="copy" size={14} /> Salva copia</button>
        </div>
        <div className="library-actions" role="group" aria-label="Esportazione sperimentale">
          <button type="button" className="button small" id="jl-export" disabled={exporting} onClick={() => void runExport()} title="Pacchetto web sperimentale: documento, runtime Jelly, stili, manifest, istruzioni ed esempio">
            <Ic name="package" size={14} /> {exporting ? 'Preparazione…' : 'Esporta pacchetto web'}
          </button>
        </div>
        <p className="hint">Il pacchetto contiene lo stesso runtime dell’anteprima. SVG e CSS nei browser; niente WebGL2 né Android nativo.</p>
        {exportMsg && <p className={exportMsg.ok ? 'param-note' : 'param-error'} id="jl-export-message" role="status">{exportMsg.text}</p>}
        <JellyIntegrityPanel repo={repo} session={session} />
      </section>
    </div>
  );
}
