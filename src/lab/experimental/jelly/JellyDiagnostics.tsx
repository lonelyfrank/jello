/**
 * Effective-capability readout of the primary preview. The rows come from the renderer's own
 * status (re-sent after renders, never per frame). The moving numbers (x, v, scheduler) are
 * pulled at 10 Hz straight into one <output>, with no React state: the physics loop never
 * causes a React render, and nothing is polled unless this panel is mounted and visible.
 */
import { useEffect, useRef, useState } from 'react';
import type { JellyRenderStatus } from '../../../runtime/experimental/jelly';
import { usePrimaryBridge } from './studio';

export const DIAGNOSTICS_INTERVAL_MS = 100;

function useStatus(): JellyRenderStatus | null {
  const bridge = usePrimaryBridge();
  const [status, setStatus] = useState<JellyRenderStatus | null>(bridge?.status ?? null);
  useEffect(() => {
    setStatus(bridge?.status ?? null);
    return bridge?.onStatus(setStatus);
  }, [bridge]);
  return status;
}

export function JellyDiagnostics() {
  const bridge = usePrimaryBridge();
  const status = useStatus();
  const live = useRef<HTMLOutputElement>(null);

  useEffect(() => {
    if (!bridge) return;
    const write = () => {
      const m = bridge.motion;
      if (!m || !live.current) return;
      live.current.textContent = `x ${m.x.toFixed(4)} · v ${m.v.toFixed(3)} · target ${m.target.toFixed(4)} · RAF attivi ${m.scheduler.active}${m.scheduler.pending ? ' (in attesa)' : ''} · frame ${m.scheduler.frames}`;
    };
    write();
    const timer = setInterval(() => { if (!document.hidden) write(); }, DIAGNOSTICS_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [bridge]);

  if (!status) return <p className="hint" id="jl-diag-empty">Nessuna superficie Jelly montata (confronto aperto o documento non valido).</p>;
  const rows: [string, string][] = [
    ['Backend richiesto', status.requestedBackend],
    ['Backend effettivo', `${status.backend}${status.opaque ? ' (opaco)' : ''}`],
    ['Profilo richiesto', status.requestedProfile],
    ['Profilo ottico effettivo', status.opticalProfile],
    ['Movimento', `${status.motion === 'dynamic' ? 'dinamico' : 'statico'}${status.motionReduced ? ' · ridotto dal sistema' : ''}`],
    ['Trasparenza ridotta', status.transparencyReduced ? 'sì' : 'no'],
    ['Colori forzati', status.forcedColors ? 'sì' : 'no'],
    ['Sospeso', status.suspended ? 'sì (fuori viewport o nascosto)' : 'no'],
    ['Bolle', String(status.bubbles)],
    ['Alpha / trasmissione effettive', `${status.effectiveAlpha.toFixed(2)} / ${status.effectiveTransmission.toFixed(2)}`],
    ['Fallback applicato', status.backend === 'css' ? (status.opaque ? 'opaco' : 'CSS statico') : 'nessuno'],
    ['Aggiornamenti · distribuzioni bolle', `${status.updates} · ${status.distributions}`],
  ];
  return (
    <div className="jl-diag" id="jl-diagnostics">
      <table className="kv" aria-label="Capacità effettive del renderer">
        <tbody>{rows.map(([k, v]) => <tr key={k}><th scope="row">{k}</th><td>{v}</td></tr>)}</tbody>
      </table>
      <output ref={live} className="jl-live" id="jl-live" aria-live="off" />
      {status.reasons.length > 0 && (
        <>
          <h3 className="panel-sub">Motivi</h3>
          <ul className="jl-reasons" id="jl-reasons">{status.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
        </>
      )}
      {status.unsupported.length > 0 && <p className="hint">Non supportato in M6.3: {status.unsupported.join(', ')}.</p>}
    </div>
  );
}
