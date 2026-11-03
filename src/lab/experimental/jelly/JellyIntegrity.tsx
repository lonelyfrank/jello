/**
 * Conflict resolution and data integrity of the experimental store (M6.4.1).
 * Everything here is an explicit user action: nothing runs at startup and nothing is deleted.
 */
import { useCallback, useEffect, useState } from 'react';
import type { LabSession } from '../../session';
import { Ic } from '../../app/ui';
import { quarantineOrphans, readLiveSnapshot, recoveryBundle, rowId, scanJelly, type ReconcileReport } from './reconcile';
import type { JellyQuarantineRow, JellyRepository } from './repository';
import { useWorkbench } from './studio';
import type { JellyWorkbench } from './workbench';

/** A button that must be pressed twice for an action that discards something. */
function Armed({ id, label, confirm, onConfirm }: { id: string; label: string; confirm: string; onConfirm(): void }) {
  const [armed, setArmed] = useState(false);
  return armed
    ? <button type="button" className="button small danger" id={id} onClick={() => { setArmed(false); onConfirm(); }} onBlur={() => setArmed(false)} autoFocus>{confirm}</button>
    : <button type="button" className="button small" id={id} onClick={() => setArmed(true)}>{label}</button>;
}

/** Another tab changed what this tab was about to overwrite. Shows what happened and the ways out; picks none by itself. */
export function JellyConflictBanner({ wb, session }: { wb: JellyWorkbench; session: LabSession }) {
  const conflict = useWorkbench(wb, (s) => s.conflict);
  const draftNote = useWorkbench(wb, (s) => s.draftNote);
  if (!conflict && !draftNote) return null;
  const exportMine = () => session.download(`${wb.get().doc.id}.jelly.json`, wb.exportText(), 'application/json');
  return (
    <>
      {draftNote && <p className="param-note" id="jl-draft-note" role="status">{draftNote}</p>}
      {conflict && (
        <div className="jl-banner" role="alert" id="jl-conflict" data-kind="danger" data-conflict={conflict.kind}>
          <p><strong>Conflitto con un’altra scheda.</strong> {conflict.message}</p>
          <div className="library-actions">
            {conflict.kind === 'record' && <>
              <button type="button" className="button small primary" id="jl-conflict-copy" onClick={() => void wb.saveAsCopy()}>Salva la mia come nuova copia</button>
              {conflict.reason === 'changed' && <Armed id="jl-conflict-theirs" label="Usa la loro versione" confirm="Conferma: scarta le mie modifiche" onConfirm={() => void wb.takeTheirs()} />}
              <Armed id="jl-conflict-overwrite" label={conflict.reason === 'deleted' ? 'Ricrea la copia' : 'Sovrascrivi la loro'} confirm={conflict.reason === 'deleted' ? 'Conferma: ricrea' : 'Conferma: sovrascrivi'} onConfirm={() => void wb.overwriteRecord()} />
            </>}
            {conflict.kind === 'draft' && <>
              <Armed id="jl-conflict-theirs" label="Usa la bozza dell’altra scheda" confirm="Conferma: scarta le mie modifiche" onConfirm={() => void wb.adoptDraft()} />
              <Armed id="jl-conflict-overwrite" label="Sovrascrivi la bozza" confirm="Conferma: sovrascrivi" onConfirm={() => void wb.overwriteDraft()} />
            </>}
            {conflict.kind === 'delete' && <button type="button" className="button small" id="jl-conflict-refresh" onClick={() => void wb.refresh()}>Ricarica l’elenco</button>}
            <button type="button" className="button small" id="jl-conflict-export" onClick={exportMine}>Esporta la mia versione (JSON)</button>
          </div>
        </div>
      )}
    </>
  );
}

const CLASS_LABEL: Record<string, string> = { valid: 'validi', orphan: 'orfani', unverifiable: 'non verificabili', corrupt: 'non leggibili', newer: 'di versione più recente' };

/**
 * Detect → classify → recover. The scan reads both databases and changes nothing. «Sposta in quarantena» is the only
 * cleanup and it is reversible; there is no permanent deletion (see reconcile.ts for why).
 */
export function JellyIntegrityPanel({ repo, session }: { repo: JellyRepository; session: LabSession }) {
  const [report, setReport] = useState<ReconcileReport | null>(null);
  const [quarantine, setQuarantine] = useState<JellyQuarantineRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const liveOf = useCallback(() => readLiveSnapshot(session.repo), [session]);
  const loadQuarantine = useCallback(() => repo.listQuarantine().then(setQuarantine, () => setQuarantine([])), [repo]);
  useEffect(() => { void loadQuarantine(); }, [loadQuarantine]);

  const run = async (job: () => Promise<void>) => {
    setBusy(true); setMessage(null);
    try { await job(); } catch (e) { setMessage({ ok: false, text: (e as Error).message }); } finally { setBusy(false); }
  };
  const scan = () => run(async () => { setReport(await scanJelly(repo, liveOf)); });
  const orphans = report?.rows.filter((r) => r.class === 'orphan' && r.recoverable) ?? [];
  const exportOrphans = () => {
    session.download('jello-sperimentale-orfani.json', JSON.stringify(recoveryBundle(orphans), null, 2), 'application/json');
    setMessage({ ok: true, text: `Copia di sicurezza di ${orphans.length} record scaricata.` });
  };
  const move = () => run(async () => {
    const out = await quarantineOrphans(repo, liveOf, orphans.map(rowId));
    setMessage({ ok: out.skipped.length === 0, text: `${out.moved} record spostati in quarantena${out.skipped.length ? `; ${out.skipped.length} lasciati dov’erano (${out.skipped[0]})` : ''}. Nessun record è stato eliminato.` });
    setReport(await scanJelly(repo, liveOf));
    await loadQuarantine();
  });
  const restore = (qkeys: string[]) => run(async () => {
    const out = await repo.restoreFromQuarantine(qkeys);
    setMessage({ ok: out.skipped.length === 0, text: `${out.moved} record ripristinati${out.skipped.length ? `; ${out.skipped.join('; ')}` : ''}.` });
    await loadQuarantine();
    if (report) setReport(await scanJelly(repo, liveOf));
  });

  return (
    <details className="jl-integrity" id="jl-integrity">
      <summary>Integrità dei dati sperimentali{quarantine.length ? ` · ${quarantine.length} in quarantena` : ''}</summary>
      <p className="hint">Confronta i dati Jello con i progetti e i componenti esistenti. La verifica non modifica nulla; nessun dato viene eliminato.</p>
      <div className="library-actions" role="group" aria-label="Verifica dei dati">
        <button type="button" className="button small" id="jl-scan" disabled={busy} onClick={() => void scan()}>Verifica</button>
      </div>
      {report && (
        <div id="jl-scan-report" role="status">
          <p className="param-note">
            {Object.entries(report.counts).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${CLASS_LABEL[k]}`).join(' · ') || 'Nessun record.'}
            {report.live.reason ? ` — ${report.live.reason}` : ''}
          </p>
          {report.rows.filter((r) => r.class !== 'valid').length > 0 && (
            <ul className="jl-list" aria-label="Record da controllare">
              {report.rows.filter((r) => r.class !== 'valid').map((r) => (
                <li key={rowId(r)} data-class={r.class}><div className="jl-item-text"><strong>{r.name ?? r.key}</strong><small>{r.store === 'links' ? 'Prova nel Builder' : r.store === 'drafts' ? 'Bozza' : 'Copia'} · {r.why}</small></div></li>
              ))}
            </ul>
          )}
          {orphans.length > 0 && (
            <div className="library-actions" role="group" aria-label="Recupero">
              <button type="button" className="button small" id="jl-orphans-export" onClick={exportOrphans}><Ic name="download" size={14} /> Esporta copia di sicurezza</button>
              <Armed id="jl-orphans-move" label={`Sposta ${orphans.length} in quarantena`} confirm="Conferma: sposta in quarantena" onConfirm={() => void move()} />
            </div>
          )}
        </div>
      )}
      {quarantine.length > 0 && (
        <div id="jl-quarantine">
          <p className="side-caption">In quarantena (ripristinabili)</p>
          <ul className="jl-list" aria-label="Record in quarantena">
            {quarantine.map((q) => (
              <li key={q.qkey} className="jl-record"><div className="jl-item-text"><strong>{q.name ?? q.key}</strong><small>{q.store === 'links' ? 'Prova nel Builder' : q.store === 'drafts' ? 'Bozza' : 'Copia'} · {q.reason}</small></div>
                <button type="button" className="button small" aria-label={`Ripristina ${q.name ?? q.key}`} disabled={busy} onClick={() => void restore([q.qkey])}>Ripristina</button></li>
            ))}
          </ul>
          <button type="button" className="button small" id="jl-restore-all" disabled={busy} onClick={() => void restore(quarantine.map((q) => q.qkey))}>Ripristina tutto</button>
        </div>
      )}
      {message && <p className={message.ok ? 'param-note' : 'param-error'} id="jl-integrity-message" role="status">{message.text}</p>}
    </details>
  );
}
