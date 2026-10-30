import { useMemo } from 'react';
import { COMPONENTS, resolveDefinitionMaterial } from '../../components';
import { RUNTIME_VERSION } from '../../model';
import { PATH_LABEL } from '../../stage/controller';
import type { LabSession } from '../session';
import { useLab } from '../store';
import { AccessibilitySection, Diagnostics, PhoneSection } from './Properties';

/** A contextual composition of existing diagnostics; it does not own another preview. */
export function TestInspector({ session }: { session: LabSession }) {
  const workspace = useLab((s) => s.workspace);
  const b = useLab((s) => s.builder);
  const material = useLab((s) => s.doc);
  const doc = useMemo(() => workspace === 'builder' ? resolveDefinitionMaterial(b.doc) : material, [workspace, b.doc, material]);
  const options = useLab((s) => s.options);
  const report = useLab((s) => s.report);
  const solid = doc.family === 'solid';
  return <div className="panel-inner" id="testInspector">
    <div className="panel-head"><h2>Preview & Test</h2><p className="hint">{workspace === 'builder' ? b.doc.name : doc.name} · runtime {RUNTIME_VERSION}</p></div>
    <div className="panel-body">
      <section className="panel-section"><h3 className="panel-sub">Rendering effettivo</h3><dl className="status-list">
        <div className="status-row"><dt>Materiale</dt><dd>{solid ? 'Solid · CSS' : 'Glass'}</dd></div>
        <div className="status-row"><dt>Renderer</dt><dd data-test-renderer>{solid ? 'CSS · nessun filtro ottico' : options.mode === 'scene' ? report?.scene?.effective ?? 'Inizializzazione' : report ? PATH_LABEL[report.main.effective] : 'Inizializzazione'}</dd></div>
        <div className="status-row"><dt>Fallback</dt><dd>{solid ? 'Nessuno richiesto' : report?.scene?.reasons.join('; ') || report?.main.reasons.join('; ') || 'Nessuno segnalato'}</dd></div>
        <div className="status-row"><dt>Qualità</dt><dd>{doc.family === 'glass' ? doc.quality.profile : 'Non applicabile a Solid'}</dd></div>
        <div className="status-row"><dt>WebGL2</dt><dd>{report?.scene ? report.scene.effective === 'webgl2' ? 'Attivo' : 'Fallback CSS' : 'Non in uso: test disponibile nella Scena controllata Glass'}</dd></div>
        <div className="status-row"><dt>Movimento ridotto</dt><dd>{report?.main.motionReduced || options.reduceMotion ? 'Attivo' : 'Disattivo'}</dd></div>
        <div className="status-row"><dt>Trasparenza ridotta</dt><dd>{solid ? 'Superficie già opaca' : report?.main.effective === 'opaque' ? 'Percorso opaco attivo' : 'Disattiva'}</dd></div>
      </dl></section>
      {workspace === 'builder' && <section className="panel-section"><h3 className="panel-sub">Stati da verificare</h3><p className="hint">Usa la barra sotto al canvas per gli stati di {COMPONENTS.get(b.doc.type)?.name}. La simulazione non cambia la definizione salvata.</p><p className="hint">La modalità Interagisci verifica input e tastiera; Seleziona individua gli elementi nell’inspector.</p></section>}
      <AccessibilitySection session={session} />
      {!solid && <Diagnostics session={session} />}
      <PhoneSection session={session} />
    </div>
  </div>;
}
