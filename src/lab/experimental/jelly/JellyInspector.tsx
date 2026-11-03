/**
 * Right column of the Jelly lab. Every control is generated from JELLY_PARAMS through the
 * same ParamField the Glass and Solid panels use: range, step, unit, default, description and
 * validation are never written here. This file only chooses grouping and the Base / Advanced
 * level, which hides controls but does not change the document.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { parseNumberInput, type Descriptor, type NumberDescriptor } from '../../../core/descriptors';
import {
  JELLY_INDEX, JELLY_OVERRIDE_STATES, JELLY_STATE_PARAMS, jellyParams,
  type JellyOverrideState, type JellyParamKey, type JellyStateOverride,
} from '../../../model/experimental/jelly';
import { ParamField } from '../../app/ParamField';
import { Ic, copyText } from '../../app/ui';
import { JellyDiagnostics } from './JellyDiagnostics';
import { JELLY_BASE_KEYS, JELLY_INSPECTOR, changedJellyKeys } from './inspector-model';
import { PREVIEW_STATE_LABEL, type PreviewEnv } from './preview-model';
import { setJellyView, useJellyView, useWorkbench } from './studio';
import { presetLabel, type JellyWorkbench } from './workbench';

const idKey = (k: string) => `jelly-${k}`;

function Section({ id, title, hint, count, children, open = true }: { id: string; title: string; hint: string; count: number; children: React.ReactNode; open?: boolean }) {
  return (
    <details className="panel-section jl-section" data-section={`jelly-${id}`} open={open}>
      <summary>{title}{count > 0 && <span className="jl-changed-count" title={`${count} modificat${count === 1 ? 'o' : 'i'} rispetto alla base`}>{count}</span>}</summary>
      <p className="hint jl-section-hint">{hint}</p>
      {children}
    </details>
  );
}

function Rejection({ message, id }: { message: string | undefined; id: string }) {
  return <p className="param-error jl-rejection" id={id} role="alert" hidden={!message}>{message ?? ''}</p>;
}

function JellyField({ wb, k }: { wb: JellyWorkbench; k: JellyParamKey }) {
  const doc = useWorkbench(wb, (s) => s.doc);
  const base = useWorkbench(wb, (s) => s.base.doc);
  const rejection = useWorkbench(wb, (s) => s.rejections[k]);
  const d = JELLY_INDEX[k];
  const value = jellyParams(doc)[k];
  const baseValue = jellyParams(base)[k];
  // The per-field reset goes back to the value of the base (preset or saved copy); Factory resets to the descriptor defaults.
  const descriptor = useMemo<Descriptor>(() => (baseValue === d.default ? d : ({ ...d, default: baseValue } as Descriptor)), [d, baseValue]);
  if (k === 'seed') return <SeedField wb={wb} d={d as NumberDescriptor} value={value as number} baseValue={baseValue as number} rejection={rejection} />;
  return (
    <div className="jl-field" data-changed={value !== baseValue} data-jelly-key={k}>
      <ParamField d={descriptor} value={value} applicability={undefined} support={undefined} idKey={idKey(k)} onChange={(v) => { wb.edit(k, v); }} />
      <Rejection id={`reject-${k}`} message={rejection} />
    </div>
  );
}

/** The seed changes only through an explicit action: typed value, reset, or "new seed". */
function SeedField({ wb, d, value, baseValue, rejection }: { wb: JellyWorkbench; d: NumberDescriptor; value: number; baseValue: number; rejection: string | undefined }) {
  const [text, setText] = useState(String(value));
  const [error, setError] = useState<string | null>(null);
  const sent = useRef<number | null>(null);
  useEffect(() => {
    if (sent.current === value) { sent.current = null; return; }
    setText(String(value));
    setError(null);
  }, [value]);
  const commit = (t: string) => {
    setText(t);
    const r = parseNumberInput(d, t);
    if (!r.ok) { setError(`${r.error}: non applicato.`); return; }
    setError(null);
    sent.current = r.value;
    wb.edit('seed', r.value);
  };
  return (
    <div className="field param jl-field" data-param-field={idKey('seed')} data-changed={value !== baseValue} data-jelly-key="seed">
      <div className="field-head">
        <span className="control-label">
          <label htmlFor="num-jelly-seed" id="label-jelly-seed">{d.label}</label>
          <button type="button" className="control-reset" aria-label={`Ripristina ${d.label}`} disabled={value === baseValue} onClick={() => { wb.resetParam('seed'); }}>↺</button>
        </span>
        <span className="num">
          <input id="num-jelly-seed" type="text" inputMode="numeric" autoComplete="off" spellCheck={false} className="num-input" data-param-number={idKey('seed')} aria-describedby="desc-jelly-seed err-jelly-seed" aria-invalid={error ? true : undefined} value={text} onChange={(e) => commit(e.target.value)} onBlur={() => { if (error) { setText(String(value)); setError(null); } }} />
          <span className="unit">{d.unit}</span>
        </span>
      </div>
      <button type="button" className="button small" id="jl-new-seed" onClick={() => { wb.newSeed(); }}>
        <Ic name="loader" size={14} /> Nuovo seed casuale
      </button>
      <p className="param-desc" id="desc-jelly-seed">{d.description} Le bolle restano le stesse cambiando scheda, Inspector o dimensioni.</p>
      <p className="param-error" id="err-jelly-seed" aria-live="polite" hidden={!error}>{error ?? ''}</p>
      <Rejection id="reject-seed" message={rejection} />
    </div>
  );
}

/** Optional appearance overrides per state. Off means "follow the material"; on edits just that key. */
function StateOverrides({ wb }: { wb: JellyWorkbench }) {
  const doc = useWorkbench(wb, (s) => s.doc);
  return (
    <div className="jl-states">
      {JELLY_OVERRIDE_STATES.map((state) => (
        <details key={state} className="jl-state" data-state={state}>
          <summary>{PREVIEW_STATE_LABEL[state === 'pressed' ? 'pressed' : state]}{Object.keys(doc.states[state]).length > 0 && <span className="jl-changed-count">{Object.keys(doc.states[state]).length}</span>}</summary>
          {JELLY_STATE_PARAMS.map((d) => {
            const key = d.key as keyof JellyStateOverride;
            const override = doc.states[state][key];
            const fallback = doc.material[key as keyof typeof doc.material];
            const on = override !== undefined;
            const fid = `${state}-${key}`;
            return (
              <div key={fid} className="jl-override" data-on={on}>
                <label className="check" htmlFor={`override-${fid}`}>
                  <input id={`override-${fid}`} type="checkbox" checked={on} onChange={(e) => { wb.editState(state as JellyOverrideState, key, e.target.checked ? (fallback as string | number) : undefined); }} />
                  <span>Personalizza {d.label.toLowerCase()}</span>
                </label>
                {on && <ParamField d={d} value={override as string | number} applicability={undefined} support={undefined} idKey={idKey(fid)} onChange={(v) => { wb.editState(state as JellyOverrideState, key, v); }} />}
              </div>
            );
          })}
        </details>
      ))}
    </div>
  );
}

const ENV_FLAGS: readonly { key: keyof PreviewEnv; label: string; hint: string }[] = [
  { key: 'svgUnavailable', label: 'SVG non disponibile', hint: 'Prova il fallback CSS / opaco' },
  { key: 'opaque', label: 'Forza opaco', hint: 'Corpo pieno, stessa semantica' },
  { key: 'reducedTransparency', label: 'Trasparenza ridotta', hint: 'Come prefers-reduced-transparency' },
  { key: 'reducedMotion', label: 'Movimento ridotto', hint: 'Simulato con il profilo static; non cambia il documento' },
];

function DocumentIo({ wb }: { wb: JellyWorkbench }) {
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const download = () => {
    const blob = new Blob([wb.exportText()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${wb.get().doc.id}.jelly.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    setMessage({ ok: true, text: 'Documento sperimentale scaricato.' });
  };
  return (
    <div className="jl-io">
      <div className="library-actions" role="group" aria-label="Documento Jello">
        <button type="button" className="button small" id="jl-copy-json" onClick={() => { void copyText(wb.exportText()).then((ok) => setMessage({ ok, text: ok ? 'JSON copiato.' : 'Copia non riuscita.' })); }}><Ic name="copy" size={14} /> Copia JSON</button>
        <button type="button" className="button small" id="jl-download-json" onClick={download}><Ic name="download" size={14} /> Scarica</button>
        <button type="button" className="button small" id="jl-import-json" onClick={() => file.current?.click()}><Ic name="upload" size={14} /> Importa…</button>
        <input ref={file} id="jl-import-file" type="file" accept=".json,application/json" hidden onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          const r = await wb.importText(await f.text());
          setMessage(r.ok ? { ok: true, text: `Importato «${wb.get().doc.name}» come nuovo documento sperimentale (non ancora salvato).` } : { ok: false, text: `File rifiutato, nulla è cambiato: ${r.errors[0]}` });
        }} />
      </div>
      <p className="hint">Il formato è <code>jello-material</code> con <code>family: "jelly"</code>: l’importatore dei materiali ufficiali lo rifiuta, e questo è voluto. Contiene solo parametri e metadati.</p>
      {message && <p className={message.ok ? 'param-note' : 'param-error'} role="status" id="jl-io-message">{message.text}</p>}
    </div>
  );
}

export function JellyInspector({ wb }: { wb: JellyWorkbench }) {
  const doc = useWorkbench(wb, (s) => s.doc);
  const base = useWorkbench(wb, (s) => s.base);
  const nameError = useWorkbench(wb, (s) => s.rejections.name);
  const view = useJellyView();
  const advanced = view.level === 'advanced';
  const changed = useMemo(() => new Set(changedJellyKeys(doc, base.doc)), [doc, base.doc]);
  const [name, setName] = useState(doc.name);
  useEffect(() => setName(doc.name), [doc.name]);

  return (
    <div className="panel-inner jl-inspector" id="jl-inspector" data-level={view.level}>
      <div className="panel-head">
        <div className="panel-heading">
          <h2>Jello</h2>
          <span className="chip chip-warn" title="Non è un materiale ufficiale: stato «planned», nessuna garanzia di compatibilità">Sperimentale</span>
        </div>
        <label className="field row-field" htmlFor="jl-name">
          <span>Nome</span>
          <input id="jl-name" type="text" maxLength={80} value={name} aria-invalid={nameError ? true : undefined} aria-describedby="reject-name" onChange={(e) => { setName(e.target.value); wb.rename(e.target.value); }} onBlur={() => { setName(wb.get().doc.name); wb.clearRejection('name'); }} />
        </label>
        <Rejection id="reject-name" message={nameError} />
        <p className="hint jl-base" id="jl-base-note">
          Base: <strong>{presetLabel(base.doc)}</strong> · {changed.size === 0 ? 'nessuna modifica' : `${changed.size} parametr${changed.size === 1 ? 'o modificato' : 'i modificati'}`}
        </p>
        <div className="inspector-level" role="group" aria-label="Livello dei controlli">
          <button type="button" className="button small" id="jl-level-base" aria-pressed={!advanced} onClick={() => setJellyView({ level: 'base' })}>Base</button>
          <button type="button" className="button small" id="jl-level-advanced" aria-pressed={advanced} onClick={() => setJellyView({ level: 'advanced' })}>Avanzato</button>
          <p className="hint">{advanced ? 'Tutti i parametri, gli stati, la diagnostica e il documento.' : 'Colore, trasparenza, morbidezza, bolle, elasticità e intensità. Avanzato mostra il resto senza cambiare il documento.'}</p>
        </div>
        <div className="library-actions" role="group" aria-label="Ripristino">
          <button type="button" className="button small" id="jl-reset-all" disabled={changed.size === 0 && Object.keys(doc.states).every((s) => JSON.stringify(doc.states[s as JellyOverrideState]) === JSON.stringify(base.doc.states[s as JellyOverrideState]))} onClick={() => wb.resetAll()}>Ripristina «{presetLabel(base.doc)}»</button>
          <button type="button" className="button small" id="jl-reset-factory" onClick={() => wb.resetFactory()} title="Valori predefiniti dei descrittori Jello, non di un preset">Valori Jello di base</button>
        </div>
      </div>
      <div className="panel-body">
        {JELLY_INSPECTOR.map((section) => {
          const keys = section.keys.filter((k) => advanced || JELLY_BASE_KEYS.has(k));
          const showStates = section.id === 'interaction' && advanced;
          if (!keys.length && !showStates) return null;
          return (
            <Section key={section.id} id={section.id} title={section.title} hint={section.hint} count={section.keys.filter((k) => changed.has(k)).length}>
              {keys.map((k) => <JellyField key={k} wb={wb} k={k} />)}
              {showStates && <><h3 className="panel-sub">Aspetto per stato</h3><StateOverrides wb={wb} /></>}
            </Section>
          );
        })}
        {advanced && (
          <>
            <details className="panel-section jl-section" data-section="jelly-env" open>
              <summary>Prova dei fallback</summary>
              <p className="hint jl-section-hint">Simulazioni della sola anteprima: non entrano nel documento.</p>
              <EnvSwitches />
            </details>
            <details className="panel-section jl-section" data-section="jelly-diagnostics" open>
              <summary>Diagnostica</summary>
              <JellyDiagnostics />
            </details>
            <details className="panel-section jl-section" data-section="jelly-document">
              <summary>Documento</summary>
              <DocumentIo wb={wb} />
            </details>
          </>
        )}
      </div>
    </div>
  );
}

function EnvSwitches() {
  const view = useJellyView();
  return (
    <div className="jl-env">
      {ENV_FLAGS.map((f) => (
        <label key={f.key} className="switch-row" htmlFor={`jl-env-${f.key}`}>
          <span className="switch-text"><span>{f.label}</span><span className="muted small">{f.hint}</span></span>
          <input id={`jl-env-${f.key}`} type="checkbox" role="switch" className="switch" checked={view.env[f.key]} onChange={(e) => setJellyView({ env: { ...view.env, [f.key]: e.target.checked } })} />
        </label>
      ))}
    </div>
  );
}
