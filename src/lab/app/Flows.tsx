/**
 * Guided flows over the pages: new project, import and project export. Each is
 * a short sequence of steps with a stepper, Back / Continue at the bottom and a
 * way out at every step. Nothing is applied until the last step is confirmed.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { BUILTIN_MATERIALS, parseMaterialText, serializeMaterial } from '../../model';
import { serializeDefinition } from '../../components';
import { importComponentText } from '../../migration';
import { CHOICE_LABEL, collect, findConflicts, inspectFile, inspectJsonText, ITEM_LABEL, summarize, type Choice, type Conflict, type ImportItem } from '../../project/importer';
import { buildProjectPackage, estimateBytes, formatBytes, usedIconNames, type PackageSelection } from '../../project/package';
import { countColors, countIcons, PLATFORM_LABEL, type Platform, type PreviewTheme } from '../../project/types';
import { KIT_PRESETS, type ImportOutcome, type StartKind } from '../projects';
import type { LabSession } from '../session';
import { useLab } from '../store';
import { Ic, Segmented, StateChip, Stepper, copyText } from './ui';

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

function Frame({ title, kicker, steps, current, done, onClose, children, footer }: { title: string; kicker: string; steps: readonly string[]; current: number; done?: boolean; onClose(): void; children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <div className="flow" role="region" aria-label={title} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="flow-card">
        <header className="flow-head">
          <div>
            <span className="eyebrow">{kicker}</span>
            <h1>{title}</h1>
          </div>
          <button type="button" className="icon-btn" aria-label="Esci dal flusso" onClick={onClose}>
            <Ic name="x" />
          </button>
        </header>
        <Stepper steps={steps} current={current} {...(done !== undefined ? { done } : {})} />
        <div className="flow-body">{children}</div>
        <footer className="flow-foot">{footer}</footer>
      </div>
    </div>
  );
}

export function FlowPage({ session }: { session: LabSession }) {
  const flow = useLab((s) => s.flow);
  if (flow === 'wizard') return <Wizard session={session} />;
  if (flow === 'import') return <ImportFlow session={session} />;
  if (flow === 'export') return <ExportFlow session={session} />;
  return null;
}

// ---------- new project ----------

const PLATFORMS: { id: Platform; label: string; hint: string }[] = [
  { id: 'web', label: 'Web', hint: 'Siti e web app' },
  { id: 'android', label: 'Android', hint: 'Browser e WebView' },
  { id: 'both', label: 'Entrambi', hint: 'Web + WebView' },
];

function Wizard({ session }: { session: LabSession }) {
  const projects = useLab((s) => s.projects);
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [platform, setPlatform] = useState<Platform>('web');
  const [theme, setTheme] = useState<PreviewTheme>('system');
  const [start, setStart] = useState<StartKind>('kit');
  const [presets, setPresets] = useState<string[]>([...KIT_PRESETS]);
  const [navbar, setNavbar] = useState(true);
  const [palettes, setPalettes] = useState(true);
  const [from, setFrom] = useState(projects[0]?.id ?? '');
  const [file, setFile] = useState<ImportItem | null>(null);
  const [fileNote, setFileNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const close = () => session.openFlow(null);
  const steps = ['Progetto', 'Partenza', 'Riepilogo'];
  const finalName = name.trim() || 'Nuovo progetto';

  const pickFile = async (f: File | undefined) => {
    if (!f) return;
    const item = await inspectFile(f.name, new Uint8Array(await f.arrayBuffer()));
    if (item.kind === 'project' || item.kind === 'material' || item.kind === 'component') {
      setFile(item);
      setFileNote(null);
      if (item.kind === 'project' && !name.trim()) setName(item.pkg.project.name);
    } else {
      setFile(null);
      setFileNote(item.kind === 'rejected' ? `${f.name}: ${item.errors[0] ?? 'non valido'}` : `${f.name}: serve un pacchetto .jello o un JSON di materiale`);
    }
  };

  const startOk = start !== 'file' || file !== null;
  const startOk2 = start !== 'duplicate' || from !== '';
  const create = async () => {
    setBusy(true);
    try {
      await session.projects.create({ name: finalName, platform, previewTheme: theme, start, presets, navbar, palettes, from, ...(file ? { items: [file] } : {}) });
      session.openFlow(null);
      session.setPage('lab', 'material');
      session.notify(`Progetto «${finalName}» creato. Il progetto viene salvato in questo browser: esportalo per spostarlo su un altro dispositivo.`);
    } finally {
      setBusy(false);
    }
  };

  const kitMaterials = presets.length;
  const summary: [string, string][] = [
    ['Nome', finalName],
    ['Destinazione', PLATFORM_LABEL[platform]],
    ['Percorso predefinito', 'Automatico'],
    ['Materiali', start === 'kit' ? `${kitMaterials} preset Jello` : start === 'empty' ? 'Glass (valori iniziali)' : start === 'duplicate' ? `Copia di ${projects.find((p) => p.id === from)?.name ?? '—'}` : start === 'file' ? (file ? file.file : '—') : 'Nessuno'],
    ['Componenti', start === 'kit' ? (navbar ? 'Navbar di esempio' : 'Nessuna') : start === 'duplicate' ? 'Copiate dal progetto' : 'Nessuna'],
    ['Asset', start === 'kit' ? (palettes ? '3 palette · icone Jello · 3 font' : 'Icone Jello · 3 font') : 'Brand Jello · icone Jello · 3 font'],
  ];

  return (
    <Frame
      title="Nuovo progetto"
      kicker={`0${step + 1} · ${['Nome e destinazione', 'Punto di partenza', 'Riepilogo'][step]}`}
      steps={steps}
      current={step}
      onClose={close}
      footer={
        <>
          <button type="button" className="button" onClick={step === 0 ? close : () => setStep(step - 1)}>
            {step === 0 ? 'Annulla' : 'Indietro'}
          </button>
          {step < 2 ? (
            <button type="button" className="button primary" disabled={step === 1 && !(startOk && startOk2)} onClick={() => setStep(step + 1)}>
              Continua
            </button>
          ) : (
            <button type="button" className="button primary" id="createProject" disabled={busy} onClick={() => void create()}>
              {busy ? 'Creazione…' : 'Crea progetto'}
            </button>
          )}
        </>
      }
    >
      {step === 0 && (
        <div className="stack">
          <label className="field">
            <span>Nome</span>
            <input id="projectName" autoFocus value={name} maxLength={80} placeholder="Es. Kit glass · sito personale" onChange={(e) => setName(e.target.value)} />
          </label>
          <fieldset className="choice-group">
            <legend>Dove userai i componenti?</legend>
            <div className="choice-cards">
              {PLATFORMS.map((p) => (
                <label key={p.id} className="choice-card" data-checked={platform === p.id}>
                  <input type="radio" name="platform" checked={platform === p.id} onChange={() => setPlatform(p.id)} />
                  <strong>{p.label}</strong>
                  <span className="muted small">{p.hint}</span>
                </label>
              ))}
            </div>
            <p className="muted small">Decide il percorso di rendering predefinito e quali verifiche mostrare.</p>
          </fieldset>
          <div className="field">
            <span>Tema dell’anteprima</span>
            <Segmented<PreviewTheme> label="Tema dell’anteprima" value={theme} onChange={setTheme} options={[{ id: 'system', label: 'Sistema' }, { id: 'light', label: 'Chiaro' }, { id: 'dark', label: 'Scuro' }]} />
          </div>
        </div>
      )}

      {step === 1 && (
        <fieldset className="choice-group">
          <legend>Da dove vuoi iniziare?</legend>
          <div className="start-options">
            <label className="choice-card wide" data-checked={start === 'kit'}>
              <input type="radio" name="start" checked={start === 'kit'} onChange={() => setStart('kit')} />
              <strong>Kit Jello</strong>
              <span className="muted small">I preset del laboratorio e una navbar di esempio.</span>
              {start === 'kit' && (
                <span className="chip-set" role="group" aria-label="Preset da includere">
                  {BUILTIN_MATERIALS.filter((b) => b.doc.id !== 'navbar').map((b) => (
                    <button key={b.doc.id} type="button" className="chip-toggle" aria-pressed={presets.includes(b.doc.id)} onClick={() => setPresets(presets.includes(b.doc.id) ? presets.filter((x) => x !== b.doc.id) : [...presets, b.doc.id])}>
                      {presets.includes(b.doc.id) && <Ic name="check" size={14} />}
                      {b.doc.name}
                    </button>
                  ))}
                  <button type="button" className="chip-toggle" aria-pressed={navbar} onClick={() => setNavbar(!navbar)}>
                    {navbar && <Ic name="check" size={14} />}
                    Navbar
                  </button>
                </span>
              )}
              {start === 'kit' && (
                <label className="check">
                  <input type="checkbox" checked={palettes} onChange={(e) => setPalettes(e.target.checked)} />
                  <span>Includi le palette Brand Jello e Stati</span>
                </label>
              )}
            </label>
            <label className="choice-card wide" data-checked={start === 'empty'}>
              <input type="radio" name="start" checked={start === 'empty'} onChange={() => setStart('empty')} />
              <strong>Progetto vuoto</strong>
              <span className="muted small">Solo il materiale Glass con i valori iniziali.</span>
            </label>
            <label className="choice-card wide" data-checked={start === 'file'}>
              <input type="radio" name="start" checked={start === 'file'} onChange={() => setStart('file')} />
              <strong>Da un file</strong>
              <span className="muted small">Un pacchetto .jello o un JSON di materiale esportato dal laboratorio.</span>
              {start === 'file' && (
                <span className="file-pick">
                  <input ref={fileInput} type="file" accept=".jello,.json,application/json" hidden id="wizardFile" onChange={(e) => void pickFile(e.target.files?.[0])} />
                  <button type="button" className="button small" onClick={() => fileInput.current?.click()}>
                    <Ic name="upload" size={14} />
                    Scegli file…
                  </button>
                  {file && <StateChip kind="ok" icon="check">{file.file}</StateChip>}
                  {fileNote && (
                    <span className="field-error" role="alert">
                      {fileNote}
                    </span>
                  )}
                </span>
              )}
            </label>
            <label className="choice-card wide" data-checked={start === 'duplicate'} data-disabled={projects.length === 0}>
              <input type="radio" name="start" disabled={projects.length === 0} checked={start === 'duplicate'} onChange={() => setStart('duplicate')} />
              <strong>Duplica un progetto</strong>
              <span className="muted small">{projects.length ? 'Copia materiali, componenti e asset.' : 'Non hai ancora progetti da duplicare.'}</span>
              {start === 'duplicate' && (
                <select aria-label="Progetto da duplicare" value={from} onChange={(e) => setFrom(e.target.value)}>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              )}
            </label>
          </div>
        </fieldset>
      )}

      {step === 2 && (
        <div className="stack">
          <h2 className="flow-h2">Riepilogo</h2>
          <dl className="summary">
            {summary.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          <p className="callout info">
            <Ic name="info" size={16} />
            Il progetto viene salvato in questo browser. Esportalo per spostarlo su un altro dispositivo.
          </p>
        </div>
      )}
    </Frame>
  );
}

// ---------- import ----------

type Stage = 'source' | 'check' | 'conflicts' | 'done';

function ImportFlow({ session }: { session: LabSession }) {
  const seed = useLab((s) => s.importSeed);
  const hasProject = useLab((s) => s.projectId !== null);
  const library = useLab((s) => s.library);
  const allComponents = useLab((s) => s.components);
  const materials = useMemo(() => library.filter((i) => i.origin === 'user'), [library]);
  const components = useMemo(() => allComponents.filter((i) => i.origin === 'user'), [allComponents]);
  const project = useLab((s) => s.projects.find((p) => p.id === s.projectId) ?? null);
  const [stage, setStage] = useState<Stage>('source');
  const [mode, setMode] = useState<'file' | 'paste'>('file');
  const [items, setItems] = useState<ImportItem[]>([]);
  const [loading, setLoading] = useState<{ file: string; state: 'wait' | 'read' | 'done' }[] | null>(null);
  const [text, setText] = useState('');
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [over, setOver] = useState(false);
  const [showJson, setShowJson] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const cancelled = useRef(false);
  const close = () => {
    cancelled.current = true;
    session.openFlow(null);
  };
  const steps = ['Sorgente', 'Verifica', 'Conflitti'];

  const read = async (files: File[]) => {
    cancelled.current = false;
    setLoading(files.map((f) => ({ file: f.name, state: 'wait' })));
    const out: ImportItem[] = [];
    for (const [i, f] of files.entries()) {
      if (cancelled.current) return;
      setLoading((l) => l?.map((x, n) => (n === i ? { ...x, state: 'read' } : x)) ?? null);
      await tick();
      out.push(await inspectFile(f.name, new Uint8Array(await f.arrayBuffer())));
      setLoading((l) => l?.map((x, n) => (n === i ? { ...x, state: 'done' } : x)) ?? null);
    }
    setItems(out);
    setLoading(null);
    setStage('check');
  };

  useEffect(() => {
    if (seed?.length) {
      void read(seed);
      session.openFlow('import');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const accepted = items.filter((i) => i.kind !== 'rejected' && i.kind !== 'unsupported');
  const rejected = items.filter((i): i is Extract<ImportItem, { kind: 'rejected' }> => i.kind === 'rejected');
  const incoming = useMemo(() => collect(accepted), [accepted.length, items]); // eslint-disable-line react-hooks/exhaustive-deps
  const conflicts: Conflict[] = useMemo(
    () => findConflicts(incoming, { materials: materials.map((m) => ({ id: m.id, name: m.name, doc: m.doc })), components: components.map((c) => ({ id: c.id, name: c.name, doc: c.doc })), assets: project?.assets ?? { palettes: [], iconSets: [], fonts: [], typeStyles: [] } }),
    [incoming, materials, components, project],
  );
  const total = incoming.materials.length + incoming.components.length + incoming.colors.length + incoming.icons.length + incoming.fonts.length;
  const apply = async () => {
    setBusy(true);
    try {
      if (!hasProject) await session.projects.create({ name: 'Il mio progetto', platform: 'web', previewTheme: 'system', start: 'blank' });
      const resolved = Object.fromEntries(conflicts.map((c) => [c.key, choices[c.key] ?? c.options[0]!]));
      const r = await session.projects.applyImport(accepted, resolved);
      setOutcome(r);
      setStage('done');
    } finally {
      setBusy(false);
    }
  };
  const stepIndex = stage === 'source' ? 0 : stage === 'check' ? 1 : stage === 'conflicts' ? 2 : 3;
  const warnings = accepted.flatMap((i) => ('warnings' in i ? i.warnings.map((w) => `${i.file}: ${w}`) : []));

  const footer =
    stage === 'source' ? (
      <>
        <button type="button" className="button" onClick={close}>
          Annulla
        </button>
        {mode === 'paste' && (
          <button
            type="button"
            className="button primary"
            disabled={!text.trim()}
            onClick={() => {
              setItems([inspectJsonText('testo incollato.json', text)]);
              setStage('check');
            }}
          >
            Verifica
          </button>
        )}
      </>
    ) : stage === 'check' ? (
      <>
        <button type="button" className="button" onClick={() => (setItems([]), setStage('source'))}>
          Indietro
        </button>
        <button type="button" className="button primary" disabled={accepted.length === 0} onClick={() => setStage('conflicts')}>
          Continua
        </button>
      </>
    ) : stage === 'conflicts' ? (
      <>
        <button type="button" className="button" onClick={() => setStage('check')}>
          Indietro
        </button>
        <button type="button" className="button primary" id="importApply" disabled={busy || total === 0} onClick={() => void apply()}>
          {busy ? 'Importazione…' : `Importa ${total} ${total === 1 ? 'elemento' : 'elementi'}`}
        </button>
      </>
    ) : (
      <>
        <button type="button" className="button" onClick={close}>
          Chiudi
        </button>
        {outcome?.firstMaterial && (
          <button
            type="button"
            className="button primary"
            onClick={() => {
              session.openFlow(null);
              session.openMaterial(outcome.firstMaterial!);
              session.setPage('lab', 'material');
            }}
          >
            Apri il materiale
          </button>
        )}
      </>
    );

  return (
    <Frame title="Importazione" kicker={`0${stepIndex + 1} · ${['Sorgente', 'Verifica', 'Conflitti', 'Completato'][stepIndex]}`} steps={steps} current={Math.min(stepIndex, 2)} done={stage === 'done'} onClose={close} footer={footer}>
      {stage === 'source' && !loading && (
        <div className="stack">
          <p className="muted">Materiali (JSON), componenti, progetti (.jello), icone SVG e font .woff2.</p>
          <Segmented<'file' | 'paste'> label="Sorgente" value={mode} onChange={setMode} options={[{ id: 'file', label: 'File' }, { id: 'paste', label: 'Incolla JSON' }]} />
          {mode === 'file' ? (
            <div
              className="drop-area big"
              data-over={over}
              onDragOver={(e) => (e.preventDefault(), setOver(true))}
              onDragLeave={() => setOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setOver(false);
                void read([...e.dataTransfer.files]);
              }}
            >
              <Ic name="upload" size={24} />
              <strong>Trascina qui i file</strong>
              <span className="muted">oppure</span>
              <input ref={input} type="file" id="importFiles" multiple hidden accept=".json,.jello,.svg,.woff2" onChange={(e) => (void read([...(e.target.files ?? [])]), (e.target.value = ''))} />
              <button type="button" className="button" onClick={() => input.current?.click()}>
                Scegli dal computer…
              </button>
            </div>
          ) : (
            <label className="field">
              <span>JSON del materiale o della componente</span>
              <textarea id="importPaste" rows={9} spellCheck={false} value={text} onChange={(e) => setText(e.target.value)} placeholder='{ "format": "jello-glass", … }' />
            </label>
          )}
          <div className="formats">
            <span className="eyebrow">Formati accettati</span>
            <ul>
              <li>
                <code>.json</code> materiale o componente
              </li>
              <li>
                <code>.jello</code> progetto completo
              </li>
              <li>
                <code>.svg</code> · <code>.woff2</code> icone e font
              </li>
            </ul>
          </div>
        </div>
      )}

      {loading && (
        <div className="stack" role="status" aria-live="polite">
          <h2 className="flow-h2">Importazione in corso</h2>
          <p className="muted">
            {loading.filter((l) => l.state === 'done').length} di {loading.length} completati
          </p>
          <ul className="load-list">
            {loading.map((l) => (
              <li key={l.file}>
                <span>{l.file}</span>
                <StateChip kind={l.state === 'done' ? 'ok' : l.state === 'read' ? 'accent' : 'neutral'} icon={l.state === 'done' ? 'check' : l.state === 'read' ? 'loader' : 'clock'}>
                  {l.state === 'done' ? 'Verificato' : l.state === 'read' ? 'Lettura…' : 'In attesa'}
                </StateChip>
              </li>
            ))}
          </ul>
          <p className="muted small">Nulla viene applicato al progetto finché non confermi nel passo Conflitti.</p>
          <button type="button" className="button" onClick={close}>
            Annulla importazione
          </button>
        </div>
      )}

      {stage === 'check' && (
        <div className="stack">
          {accepted.length === 0 && (
            <div className="callout danger" role="alert">
              <Ic name="alert" size={16} />
              <span>
                <strong>Import rifiutato: nessun parametro è stato modificato.</strong> Un file parziale non viene mai applicato.
              </span>
            </div>
          )}
          {items.map((it) => (
            <article key={it.file} className="check-card" data-kind={it.kind}>
              <header>
                <strong>{it.file}</strong>
                <StateChip kind={it.kind === 'rejected' ? 'danger' : it.kind === 'unsupported' ? 'neutral' : 'ok'} icon={it.kind === 'rejected' ? 'x' : it.kind === 'unsupported' ? 'info' : 'check'}>
                  {ITEM_LABEL[it.kind]}
                </StateChip>
              </header>
              {it.kind === 'rejected' && (
                <>
                  <ul className="error-list">
                    {it.errors.map((e) => (
                      <li key={e}>
                        <Ic name="x" size={14} />
                        {e}
                      </li>
                    ))}
                  </ul>
                  <p className="muted small">Correggi il file e riprova: gli errori si aggiornano mentre scrivi nella scheda Incolla JSON.</p>
                  <div className="row-actions">
                    <button type="button" className="button small" onClick={() => void copyText(it.errors.join('\n'))}>
                      <Ic name="copy" size={14} />
                      Copia errori
                    </button>
                    {it.file.endsWith('.json') && (
                      <button type="button" className="button small" onClick={() => (setMode('paste'), setStage('source'), setItems([]))}>
                        Correggi nel testo
                      </button>
                    )}
                  </div>
                </>
              )}
              {it.kind === 'unsupported' && <p className="muted small">Formato non supportato: il file viene saltato.</p>}
              {it.kind === 'material' && <p className="muted small">{it.doc.name} · jello-material</p>}
              {it.kind === 'component' && <p className="muted small">{it.doc.name} · {it.doc.type}</p>}
              {it.kind === 'project' && (
                <p className="muted small">
                  {it.pkg.project.name} · {summarize([...it.pkg.materials.map((m) => ({ kind: 'material' as const, file: m.path, size: 0, doc: m.doc, warnings: [] })), ...it.pkg.components.map((c) => ({ kind: 'component' as const, file: c.path, size: 0, doc: c.doc, warnings: [] }))])} · {countColors(it.pkg.project.assets)} colori · {countIcons(it.pkg.project.assets)} icone
                </p>
              )}
              {it.kind === 'icon' && <p className="muted small">{it.icon.name}{it.icon.warning ? ` · ${it.icon.warning}` : ''}</p>}
              {it.kind === 'font' && <p className="muted small">{it.font.name} · {formatBytes(it.size)}</p>}
              {it.kind === 'material' && (
                <button type="button" className="link" onClick={() => setShowJson(showJson === it.file ? null : it.file)}>
                  {showJson === it.file ? 'Nascondi JSON' : 'Mostra JSON'}
                </button>
              )}
              {it.kind === 'material' && showJson === it.file && <pre className="code-block">{serializeMaterial(it.doc)}</pre>}
            </article>
          ))}
          {warnings.length > 0 && (
            <div className="callout warn">
              <Ic name="alert" size={16} />
              <div>
                <strong>Avvisi · l’import può procedere</strong>
                <ul>
                  {warnings.slice(0, 12).map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
          {rejected.length > 0 && accepted.length > 0 && <p className="muted small">{rejected.length} file rifiutati: non verranno importati.</p>}
        </div>
      )}

      {stage === 'conflicts' && (
        <div className="stack">
          <h2 className="flow-h2">{conflicts.length ? `${conflicts.length} ${conflicts.length === 1 ? 'elemento esiste già' : 'elementi esistono già'}` : 'Nessun conflitto'}</h2>
          {conflicts.length === 0 ? <p className="muted">Tutto può essere importato: {summarize(accepted)}.</p> : <p className="muted">Scegli cosa fare per ognuno.</p>}
          {conflicts.map((c) => (
            <fieldset key={c.key} className="conflict">
              <legend>{c.label}</legend>
              <p className="muted small">{c.detail}</p>
              {c.options.map((o) => (
                <label key={o} className="radio">
                  <input type="radio" name={c.key} checked={(choices[c.key] ?? c.options[0]) === o} onChange={() => setChoices({ ...choices, [c.key]: o })} />
                  <span>{CHOICE_LABEL[c.kind][o]?.(c.label.replace(/^[^“]*“|”$/g, '')) ?? o}</span>
                </label>
              ))}
            </fieldset>
          ))}
          {conflicts.length > 1 && (
            <div className="row-actions">
              <span className="muted small">Applica la stessa scelta a tutti:</span>
              {(['both', 'replace', 'skip'] as Choice[]).map((o) => (
                <button key={o} type="button" className="button small" onClick={() => setChoices(Object.fromEntries(conflicts.map((c) => [c.key, c.options.includes(o) ? o : (choices[c.key] ?? c.options[0]!)])))}>
                  {o === 'both' ? 'Mantieni entrambi' : o === 'replace' ? 'Sostituisci' : 'Salta'}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {stage === 'done' && outcome && (
        <div className="stack" role="status">
          <h2 className="flow-h2">Importazione completata</h2>
          <dl className="summary">
            {[
              ['Materiali', outcome.materials],
              ['Componenti', outcome.components],
              ['Colori', outcome.colors],
              ['Icone', outcome.icons],
              ['Font', outcome.fonts],
              ['Saltati', outcome.skipped],
              ['Avvisi', outcome.warnings],
            ]
              .filter(([, n]) => (n as number) > 0)
              .map(([k, n]) => (
                <div key={k as string}>
                  <dt>{k as string}</dt>
                  <dd>{n as number}</dd>
                </div>
              ))}
          </dl>
        </div>
      )}
    </Frame>
  );
}

// ---------- export ----------

type Format = 'jello' | 'json' | 'css';

function ExportFlow({ session }: { session: LabSession }) {
  const project = useLab((s) => s.projects.find((p) => p.id === s.projectId) ?? null);
  const library = useLab((s) => s.library);
  const components = useLab((s) => s.components);
  const mine = useMemo(() => library.filter((i) => i.origin === 'user'), [library]);
  const mineC = useMemo(() => components.filter((i) => i.origin === 'user'), [components]);
  const [stage, setStage] = useState<'content' | 'format' | 'run' | 'ready'>('content');
  const [mats, setMats] = useState<Set<string>>(() => new Set(mine.map((m) => m.id)));
  const [cmps, setCmps] = useState<Set<string>>(() => new Set(mineC.map((m) => m.id)));
  const [colors, setColors] = useState(true);
  const [icons, setIcons] = useState(true);
  const [onlyUsed, setOnlyUsed] = useState(true);
  const [fonts, setFonts] = useState(true);
  const [format, setFormat] = useState<Format>('jello');
  const [fileName, setFileName] = useState(() => (project?.name ?? 'progetto').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'progetto');
  const [phases, setPhases] = useState<{ label: string; state: 'wait' | 'run' | 'done' | 'fail'; note?: string }[]>([]);
  const [result, setResult] = useState<{ name: string; data: Uint8Array | string; type: string; files: { path: string; size: number }[]; size: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const close = () => session.openFlow(null);
  const steps = ['Contenuto', 'Formato', 'Esporta'];

  if (!project) {
    return (
      <Frame title="Esporta progetto" kicker="Esportazione" steps={steps} current={0} onClose={close} footer={<button type="button" className="button" onClick={close}>Chiudi</button>}>
        <p className="muted">Non c’è ancora un progetto da esportare.</p>
      </Frame>
    );
  }

  const selection = (): PackageSelection => {
    const all = session.projects.contents();
    return {
      materials: all.materials.filter((m) => mats.has(m.id)),
      components: all.components.filter((c) => cmps.has(c.id)),
      colors,
      icons: !icons ? 'none' : onlyUsed ? 'used' : 'all',
      fonts,
    };
  };
  const estimate = useMemo(() => {
    try {
      return formatBytes(estimateBytes(buildProjectPackage(project, selection())));
    } catch {
      return '—';
    }
  }, [project, mats, cmps, colors, icons, onlyUsed, fonts]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (set: Set<string>, id: string, upd: (s: Set<string>) => void) => {
    const n = new Set(set);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    upd(n);
  };
  const empty = mats.size + cmps.size === 0 && !colors && !icons && !fonts;

  const run = async () => {
    setError(null);
    setStage('run');
    const sel = selection();
    const list: { label: string; work: () => string | undefined }[] = [
      {
        label: 'Verifica dei parametri',
        work: () => {
          for (const m of sel.materials) if (!parseMaterialText(serializeMaterial(m)).ok) throw new Error(`«${m.name}» non supera la verifica`);
          return `${sel.materials.length} ${sel.materials.length === 1 ? 'materiale valido' : 'materiali validi'}`;
        },
      },
      {
        label: 'Componenti e riferimenti',
        work: () => {
          for (const c of sel.components) if (!importComponentText(serializeDefinition(c)).ok) throw new Error(`«${c.name}» non supera la verifica`);
          return `${sel.components.length} ${sel.components.length === 1 ? 'componente' : 'componenti'}`;
        },
      },
      {
        label: 'Asset',
        work: () => {
          const used = usedIconNames(sel.components);
          return `icone ${sel.icons === 'used' ? used.size : sel.icons === 'all' ? countIcons(project.assets) : 0}`;
        },
      },
      {
        label: 'Creazione del pacchetto',
        work: () => {
          const out = session.projects.buildExport(format, fileName, sel);
          if (!out) throw new Error('Nessun progetto attivo');
          const files = format === 'jello' ? buildProjectPackage(project, sel).map((f) => ({ path: f.path, size: f.data.length })) : [{ path: out.name, size: typeof out.data === 'string' ? out.data.length : out.data.length }];
          setResult({ name: out.name, data: out.data, type: out.type, files, size: typeof out.data === 'string' ? new TextEncoder().encode(out.data).length : out.data.length });
          return formatBytes(typeof out.data === 'string' ? out.data.length : out.data.length);
        },
      },
    ];
    setPhases(list.map((p) => ({ label: p.label, state: 'wait' as const })));
    for (const [i, p] of list.entries()) {
      setPhases((ph) => ph.map((x, n) => (n === i ? { ...x, state: 'run' } : x)));
      await tick();
      try {
        const note = p.work();
        setPhases((ph) => ph.map((x, n) => (n === i ? { ...x, state: 'done', ...(note ? { note } : {}) } : x)));
      } catch (e) {
        setPhases((ph) => ph.map((x, n) => (n === i ? { ...x, state: 'fail', note: (e as Error).message } : x)));
        setError((e as Error).message);
        return;
      }
    }
    setStage('ready');
  };

  const download = () => {
    if (!result) return;
    session.download(result.name, result.data as BlobPart, result.type);
  };
  const idx = stage === 'content' ? 0 : stage === 'format' ? 1 : 2;

  return (
    <Frame
      title="Esporta progetto"
      kicker={`0${stage === 'ready' ? 4 : idx + 1} · ${{ content: 'Contenuto', format: 'Formato', run: 'In corso', ready: 'Pronto' }[stage]}`}
      steps={steps}
      current={idx}
      done={stage === 'ready'}
      onClose={close}
      footer={
        stage === 'content' ? (
          <>
            <span className="muted small grow">Stima: {estimate}</span>
            <button type="button" className="button" onClick={close}>
              Annulla
            </button>
            <button type="button" className="button primary" disabled={empty} onClick={() => setStage('format')}>
              Continua
            </button>
          </>
        ) : stage === 'format' ? (
          <>
            <button type="button" className="button" onClick={() => setStage('content')}>
              Indietro
            </button>
            <button type="button" className="button primary" id="exportRun" disabled={!fileName.trim()} onClick={() => void run()}>
              Esporta
            </button>
          </>
        ) : stage === 'run' ? (
          <>
            {error && (
              <button type="button" className="button" onClick={() => setStage('format')}>
                Indietro
              </button>
            )}
            <button type="button" className="button" onClick={close}>
              {error ? 'Chiudi' : 'Annulla'}
            </button>
          </>
        ) : (
          <>
            <button type="button" className="button" onClick={close}>
              Chiudi
            </button>
            <button type="button" className="button" onClick={() => void copyText(JSON.stringify({ name: project.name, platform: project.platform, materials: [...mats].length, components: [...cmps].length }, null, 2))}>
              <Ic name="copy" size={14} />
              Copia riepilogo
            </button>
            <button type="button" className="button primary" id="exportDownload" onClick={download}>
              <Ic name="download" size={14} />
              Scarica
            </button>
          </>
        )
      }
    >
      {stage === 'content' && (
        <div className="stack">
          <p className="muted">Per un solo materiale resta il percorso rapido: Esporta › JSON nell’editor Materiali.</p>
          <fieldset className="export-group">
            <legend>
              Materiali <span className="count">{mats.size} di {mine.length}</span>
            </legend>
            {mine.length === 0 && <p className="muted small">Nessun materiale personale nel progetto.</p>}
            {mine.map((m) => (
              <label key={m.id} className="check">
                <input type="checkbox" checked={mats.has(m.id)} onChange={() => toggle(mats, m.id, setMats)} />
                <span>{m.name}</span>
              </label>
            ))}
          </fieldset>
          <fieldset className="export-group">
            <legend>
              Componenti <span className="count">{cmps.size} di {mineC.length}</span>
            </legend>
            {mineC.length === 0 && <p className="muted small">Nessuna componente personale nel progetto.</p>}
            {mineC.map((c) => (
              <label key={c.id} className="check">
                <input type="checkbox" checked={cmps.has(c.id)} onChange={() => toggle(cmps, c.id, setCmps)} />
                <span>{c.name}</span>
              </label>
            ))}
          </fieldset>
          <fieldset className="export-group">
            <legend>Asset</legend>
            <label className="check">
              <input type="checkbox" checked={colors} onChange={(e) => setColors(e.target.checked)} />
              <span>Colori</span>
              <span className="count">{countColors(project.assets)}</span>
            </label>
            <label className="check">
              <input type="checkbox" checked={icons} onChange={(e) => setIcons(e.target.checked)} />
              <span>Icone{icons && onlyUsed ? ' · solo usate' : ''}</span>
              <span className="count">{icons && onlyUsed ? usedIconNames(session.projects.contents().components.filter((c) => cmps.has(c.id))).size : countIcons(project.assets)}</span>
            </label>
            <label className="check">
              <input type="checkbox" checked={fonts} onChange={(e) => setFonts(e.target.checked)} />
              <span>Font · link Google Fonts</span>
              <span className="count">{project.assets.fonts.length}</span>
            </label>
            <label className="check sub">
              <input type="checkbox" checked={onlyUsed} disabled={!icons} onChange={(e) => setOnlyUsed(e.target.checked)} />
              <span>Esporta solo gli asset usati dai componenti</span>
            </label>
          </fieldset>
        </div>
      )}

      {stage === 'format' && (
        <fieldset className="choice-group">
          <legend>Formato</legend>
          <div className="start-options">
            {(
              [
                { id: 'jello', label: 'Pacchetto Jello', ext: '.jello', hint: 'Tutto il progetto, da reimportare in Jello su un altro dispositivo.' },
                { id: 'json', label: 'JSON dei materiali', ext: '.json', hint: 'Un file jello-material per materiale, leggibile dal laboratorio.' },
                { id: 'css', label: 'Variabili CSS', ext: '.css', hint: 'Token di colori e tipografia per il tuo sito.' },
              ] as { id: Format; label: string; ext: string; hint: string }[]
            ).map((f) => (
              <label key={f.id} className="choice-card wide" data-checked={format === f.id}>
                <input type="radio" name="format" checked={format === f.id} onChange={() => setFormat(f.id)} />
                <strong>
                  {f.label} <code>{f.ext}</code>
                </strong>
                <span className="muted small">{f.hint}</span>
              </label>
            ))}
            <div className="choice-card wide" data-disabled="true">
              <strong>
                Componenti Vue <StateChip kind="soon">In arrivo</StateChip>
              </strong>
              <span className="muted small">File .vue che usano il core di Jello.</span>
            </div>
          </div>
          <label className="field">
            <span>Nome file</span>
            <span className="file-name">
              <input id="exportFileName" value={fileName} onChange={(e) => setFileName(e.target.value)} />
              <code>{format === 'jello' ? '.jello' : format === 'css' ? '.css' : '.zip'}</code>
            </span>
          </label>
        </fieldset>
      )}

      {stage === 'run' && (
        <div className="stack" role="status" aria-live="polite">
          <h2 className="flow-h2">{error ? 'Esportazione non riuscita' : 'Esportazione in corso'}</h2>
          <ol className="phase-list">
            {phases.map((p) => (
              <li key={p.label} data-state={p.state}>
                <StateChip kind={p.state === 'done' ? 'ok' : p.state === 'fail' ? 'danger' : p.state === 'run' ? 'accent' : 'neutral'} icon={p.state === 'done' ? 'check' : p.state === 'fail' ? 'x' : p.state === 'run' ? 'loader' : 'clock'}>
                  {p.label}
                </StateChip>
                {p.note && <span className="muted small">{p.note}</span>}
              </li>
            ))}
          </ol>
          {error && (
            <p className="callout danger" role="alert">
              <Ic name="alert" size={16} />
              {error}. Nessun file è stato creato.
            </p>
          )}
        </div>
      )}

      {stage === 'ready' && result && (
        <div className="stack" role="status">
          <h2 className="flow-h2">Esportazione pronta</h2>
          <div className="ready-card">
            <Ic name="package" size={28} />
            <div>
              <strong id="exportResultName">{result.name}</strong>
              <p className="muted small">
                {formatBytes(result.size)} · {mats.size} {mats.size === 1 ? 'materiale' : 'materiali'} · {cmps.size} {cmps.size === 1 ? 'componente' : 'componenti'}
              </p>
            </div>
          </div>
          <span className="eyebrow">Contenuto del pacchetto</span>
          <ul className="file-list">
            {result.files.slice(0, 40).map((f) => (
              <li key={f.path}>
                <code>{f.path}</code>
                <span className="muted small">{formatBytes(f.size)}</span>
              </li>
            ))}
          </ul>
          {fonts && project.assets.fonts.some((f) => f.source === 'google') && <p className="muted small">I font restano collegati a Google Fonts: non sono inclusi come file.</p>}
        </div>
      )}
    </Frame>
  );
}
