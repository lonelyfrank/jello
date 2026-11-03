import { Suspense, useState } from 'react';
import { resolveButton } from '../../components';
import type { LabSession } from '../session';
import { useLab } from '../store';
import { ExperimentalBoundary, retryableLazy } from './ExperimentalBoundary';

// The only Builder door to experimental Jelly: a dynamic import, fetched when the person turns the trial on.
const trial = retryableLazy(() => import('../experimental/jelly/BuilderTrial'));

/** Off by default and not persisted as a flag: opening a component never loads Jelly by itself. */
export function BuilderJellyTrial({ session }: { session: LabSession }) {
  const def = useLab((s) => s.builder.doc);
  const componentId = useLab((s) => s.builder.componentId);
  const projectId = useLab((s) => s.projectId);
  const [on, setOn] = useState(false);
  const button = def.type === 'button' ? resolveButton(def, Number.POSITIVE_INFINITY) : null;
  if (!button) return null;
  return (
    <>
      <label className="check" htmlFor="jl-trial-toggle">
        <input id="jl-trial-toggle" type="checkbox" checked={on} disabled={!projectId} onChange={(e) => setOn(e.target.checked)} />
        <span>Prova con Jello (sperimentale)</span>
      </label>
      <p className="hint">Mostra questo Button con il materiale Jello sperimentale, senza cambiare il componente.</p>
      {on && projectId && (
        <ExperimentalBoundary what="La prova Jello" onRetry={() => trial.retry()}>
          <Suspense fallback={<p className="hint" role="status">Caricamento di Jello…</p>}>
            <trial.Component key={`${projectId}::${componentId}`} session={session} def={def} projectId={projectId} componentId={componentId} />
          </Suspense>
        </ExperimentalBoundary>
      )}
    </>
  );
}
