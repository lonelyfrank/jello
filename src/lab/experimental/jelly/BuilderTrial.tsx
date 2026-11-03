/**
 * Experimental Jelly trial inside the Component Builder's Button inspector (M6.4.6).
 *
 * What it is: a side-by-side, interactive proof of the Button's own content (text, icon, size,
 * padding, radius, disabled) rendered with the real Jelly renderer.
 * What it is NOT: it never writes to the component definition, `material.family` or
 * `material.preset`, never touches the canvas, and is not exported with the component.
 * The experimental configuration is kept as a SNAPSHOT in the separate experimental database,
 * keyed by (project, component). Closing the section or switching component/project releases
 * the renderer; going back to the stable material needs nothing, because nothing was changed.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { resolveButton, BUTTON_SIZES, type ComponentDefinition } from '../../../components';
import { JELLY_INDEX, jellyParams, type JellyExperimentalDocument, type JellyParamKey } from '../../../model/experimental/jelly';
import type { LabSession } from '../../session';
import { ParamField } from '../../app/ParamField';
import { openStudio } from '../../app/StudioNav';
import { createJellyCoordinator } from '../../../runtime/experimental/jelly-scheduler';
import { JellyButton } from './JellyButton';
import { editJellyParam } from './inspector-model';
import { DEFAULT_ENV } from './preview-model';
import { loadJellyStudio, type JellyStudio } from './studio';
import { candidatePresets, presetDoc, presetLabel } from './workbench';
import { JellyConflictError, linkKey, type JellyComponentLink, type StoredJelly } from './repository';
import './jelly-lab.css';

const QUICK: readonly JellyParamKey[] = ['tint', 'bodyOpacity', 'transmission', 'density', 'dampingRatio', 'maxDeformation', 'pressStrength'];
const SAVE_DELAY = 400;

/** Radius and shape of the Button decide the Jelly silhouette; the saved snapshot keeps its own geometry. */
function withButtonGeometry(doc: JellyExperimentalDocument, radius: number | 'capsule'): JellyExperimentalDocument {
  return { ...doc, geometry: { shape: radius === 'capsule' ? 'capsule' : 'rounded', radius: radius === 'capsule' ? doc.geometry.radius : radius } };
}

export default function BuilderTrial({ session, def, projectId, componentId }: { session: LabSession; def: ComponentDefinition; projectId: string; componentId: string }) {
  const [studio, setStudio] = useState<JellyStudio | null>(null);
  const [doc, setDoc] = useState<JellyExperimentalDocument>(() => presetDoc('jelly-soft')!);
  const [sourceId, setSourceId] = useState<string | null>('jelly-soft');
  const [records, setRecords] = useState<StoredJelly[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [rejection, setRejection] = useState<Record<string, string>>({});
  const coordinator = useMemo(() => createJellyCoordinator(), []);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<{ projectId: string; componentId: string; doc: JellyExperimentalDocument; sourceId: string | null } | null>(null);
  const live = useRef({ studio });
  live.current = { studio };
  // Revision of this component's trial row as last seen (null = none). A write is refused if another tab changed it since.
  const rev = useRef<number | null>(null);
  const held = useRef<NonNullable<typeof pending.current> | null>(null);
  const [conflict, setConflict] = useState(false);
  // An answer about the component we just left must not touch the one shown now.
  const shown = useRef('');
  shown.current = linkKey(projectId, componentId);

  useEffect(() => () => coordinator.destroy(), [coordinator]);
  useEffect(() => { void loadJellyStudio().then(setStudio); }, []);

  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const p = pending.current;
    pending.current = null;
    const repo = live.current.studio?.repo;
    if (!p || !repo) return;
    write(repo, p, rev.current);
  };
  const write = (repo: JellyStudio['repo'], p: NonNullable<typeof pending.current>, expected: number | null) => {
    const key = linkKey(p.projectId, p.componentId);
    const link: JellyComponentLink = { projectId: p.projectId, componentId: p.componentId, enabled: true, sourceId: p.sourceId, doc: p.doc, updatedAt: new Date().toISOString() };
    return repo.commit({ links: { put: [link], expect: { [key]: expected } } }).then(
      (r) => {
        if (key !== shown.current) return;
        held.current = null; rev.current = r.links[key] ?? rev.current; setConflict(false); setMessage('Configurazione di prova salvata separatamente.');
      },
      (e: Error) => {
        if (key !== shown.current) return;
        if (e instanceof JellyConflictError) { held.current = p; setConflict(true); setMessage('Un’altra scheda ha cambiato la prova di questo componente: la tua versione non è stata salvata e nulla è stato sovrascritto.'); }
        else setMessage(`Non salvata: ${e.message}`);
      },
    );
  };
  const keepMine = async () => {
    const p = held.current;
    if (!studio || !p) return;
    rev.current = await studio.repo.revisionOf('links', linkKey(p.projectId, p.componentId));
    await write(studio.repo, p, rev.current);
  };
  const takeTheirs = async () => {
    if (!studio) return;
    const l = await studio.repo.getLink(projectId, componentId);
    held.current = null; setConflict(false);
    rev.current = l?.rev ?? null;
    if (l) { setDoc(l.doc); setSourceId(l.sourceId); setMessage('Caricata la configurazione salvata dall’altra scheda.'); }
  };
  const persist = (next: JellyExperimentalDocument, source: string | null) => {
    pending.current = { projectId, componentId, doc: next, sourceId: source };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, SAVE_DELAY);
  };

  // Project or component changed (or the section closed): write what is pending for the OLD pair first, then load the new one.
  useEffect(() => {
    if (!studio) return;
    let stale = false;
    const { repo } = studio;
    void Promise.all([repo.getLink(projectId, componentId), repo.list(projectId)]).then(([link, list]) => {
      if (stale) return;
      setRecords(list.items);
      setRejection({});
      rev.current = link?.rev ?? null;
      held.current = null;
      setConflict(false);
      if (link) { setDoc(link.doc); setSourceId(link.sourceId); setMessage('Ripristinata la configurazione di prova di questo componente.'); }
      else { setDoc(presetDoc('jelly-soft')!); setSourceId('jelly-soft'); setMessage(null); }
    });
    return () => { stale = true; flush(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studio, projectId, componentId]);

  const p = useMemo(() => resolveButton(def, Number.POSITIVE_INFINITY), [def]);
  const effective = useMemo(() => withButtonGeometry(doc, p.layout.radius), [doc, p.layout.radius]);
  const height = BUTTON_SIZES[p.layout.size];
  const box = { height, width: p.layout.widthMode === 'fixed' ? p.layout.width : ('auto' as const), paddingX: p.layout.paddingX, fontWeight: p.style.typography.fontWeight };

  const choose = (value: string) => {
    const next = presetDoc(value) ?? records.find((r) => r.id === value)?.doc;
    if (!next) return;
    const copy = structuredClone(next);
    setDoc(copy); setSourceId(value); setRejection({});
    persist(copy, value);
  };
  const edit = (key: JellyParamKey, value: unknown) => {
    const r = editJellyParam(doc, key, value);
    if (!r.ok) { setRejection((x) => ({ ...x, [key]: r.error })); return; }
    setRejection(({ [key]: _gone, ...rest }) => rest);
    setDoc(r.doc);
    persist(r.doc, sourceId);
  };
  const remove = async () => {
    if (!studio) return;
    pending.current = null;
    if (timer.current) clearTimeout(timer.current);
    await studio.repo.commit({ links: { delete: [linkKey(projectId, componentId)] } }).then(() => { rev.current = null; held.current = null; setConflict(false); }, (e: Error) => setMessage(e.message));
    setDoc(presetDoc('jelly-soft')!); setSourceId('jelly-soft'); setMessage('Configurazione di prova rimossa. Il componente non è stato modificato.');
  };
  const values = jellyParams(doc);

  return (
    <div className="jl-trial" id="jl-trial" data-jelly-trial>
      <p className="hint jl-experimental-note"><strong>Sperimentale.</strong> Prova affiancata: il documento del componente e il suo materiale (<code>{def.material.family}</code>{def.material.preset ? ` · ${def.material.preset}` : ''}) non cambiano e la canvas resta com’è.</p>
      <div className="jl-stage jl-trial-stage" data-background="light">
        <div className="jl-scale">
          <JellyButton
            id="jl-trial-button" testId="jelly-trial-button"
            doc={effective} env={DEFAULT_ENV} state={p.disabled ? 'disabled' : 'live'}
            label={p.text || 'Pulsante'} icon={p.icon !== null && p.icon.kind !== 'none'} box={box} fontSize={p.style.typography.fontSize} coordinator={coordinator}
          />
        </div>
      </div>
      <label className="field row-field" htmlFor="jl-trial-source">
        <span>Preset</span>
        <select id="jl-trial-source" value={sourceId ?? ''} onChange={(e) => choose(e.target.value)}>
          <optgroup label="Preset candidati">{candidatePresets().map((c) => <option key={c.doc.id} value={c.doc.id}>{presetLabel(c.doc)}</option>)}</optgroup>
          {records.length > 0 && <optgroup label="Copie del progetto">{records.map((r) => <option key={r.id} value={r.id}>{r.doc.name}</option>)}</optgroup>}
          {sourceId && !candidatePresets().some((c) => c.doc.id === sourceId) && !records.some((r) => r.id === sourceId) && <option value={sourceId}>Snapshot di prova</option>}
        </select>
      </label>
      {QUICK.map((k) => (
        <div key={k} data-jelly-key={k}>
          <ParamField d={JELLY_INDEX[k]} value={values[k]} applicability={undefined} support={undefined} idKey={`trial-${k}`} onChange={(v) => edit(k, v)} />
          {rejection[k] && <p className="param-error" role="alert">{rejection[k]}</p>}
        </div>
      ))}
      <div className="library-actions" role="group" aria-label="Prova Jello">
        <button type="button" className="button small" id="jl-trial-open-lab" onClick={() => openStudio(session, 'jelly')}>Apri il Jello Lab</button>
        <button type="button" className="button small" id="jl-trial-remove" onClick={() => void remove()}>Rimuovi la prova</button>
      </div>
      {conflict && (
        <div className="library-actions" role="group" aria-label="Conflitto con un’altra scheda" id="jl-trial-conflict">
          <button type="button" className="button small" id="jl-trial-theirs" onClick={() => void takeTheirs()}>Usa quella dell’altra scheda</button>
          <button type="button" className="button small" id="jl-trial-mine" onClick={() => void keepMine()}>Sovrascrivi con la mia</button>
        </div>
      )}
      {message && <p className="param-note" id="jl-trial-message" role="status">{message}</p>}
    </div>
  );
}
