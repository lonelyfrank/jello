import { useMemo, useState } from 'react';
import { PARAM_INDEX, PARAMS, type ParamDescriptor, type ParamGroup } from '../../core/params';
import type { ContextStatus } from '../../core/context';
import {
  BACKEND_LABEL,
  DEFAULT_QUALITY,
  MATERIALS,
  inspectorModel,
  type GlassDocument,
  BUILTIN_MATERIALS,
  glassParams,
  QUALITY_IDS,
  QUALITY_PROFILES,
  resolveQuality,
  RUNTIME_VERSION,
  SECTION_KEYS,
  supportReport,
  type Backend,
  type BackendRequest,
  type QualityProfileId,
} from '../../model';
import { PATH_LABEL, REQUEST_LABEL } from '../../stage/controller';
import { applicability } from '../applicability';
import type { LabSession } from '../session';
import { useLab } from '../store';
import { ParamField } from './ParamField';
import { Switch } from './ui';

const OBJECT_LABEL = { capsule: 'Capsula', navbar: 'Navbar', button: 'Pulsante', card: 'Card', dialog: 'Pannello' } as const;
const LEVEL_LABEL = { supported: 'supportato', approximated: 'approssimato', ignored: 'ignorato' } as const;
const round = (v: number) => Math.round(v * 10) / 10;

function Section({ id, title, open = true, children }: { id: string; title: string; open?: boolean; children: React.ReactNode }) {
  return (
    <details className="panel-section" data-section={id} open={open}>
      <summary>{title}</summary>
      {children}
    </details>
  );
}

function describe(status: ContextStatus) {
  const e = status.engine;
  const engine = `${e.engine}${e.major ? ` ${e.major}` : ''}${e.android ? ' · Android' : ''}${e.webview ? ' · WebView' : ''}${e.mobile && !e.android ? ' · mobile' : ''}`;
  const v = status.verified;
  const verified = v
    ? `sì — ${v.engine} ${v.major}, ${v.environment}, ${v.date}, runtime ${v.runtime}${v.backend ? `, backend ${v.backend}` : ''}`
    : e.android
      ? 'no — le verifiche desktop/emulate non valgono per Android reale'
      : `no — nessun test raster per questo motore, versione e runtime ${RUNTIME_VERSION}`;
  return { engine, verified };
}

export function Properties({ session }: { session: LabSession }) {
  const doc = useLab((s) => s.doc);
  return doc.family === 'solid' ? <SolidProperties session={session} /> : <GlassProperties session={session} doc={doc} />;
}

function SolidProperties({ session }: { session: LabSession }) {
  const doc = useLab((s) => s.doc);
  const def = MATERIALS.get(doc.family)!;
  const model = inspectorModel(def, doc);
  const [previewState, setPreviewState] = useState('default');
  return <div className="panel-inner" id="panelInner" data-family={doc.family}>
    <div className="panel-head"><h2>{doc.name}</h2><span className="chip chip-accent">{def.name}</span></div>
    <div className="panel-body">
      {model.groups.map((g) => <Section key={g.id} id={g.id} title={g.label}>{g.controls.map((c) => <ParamField key={c.key} d={def.params.find((d) => d.key === c.key)!} value={c.value} applicability={undefined} support={undefined} onChange={(v) => session.setMaterialControl({ key: c.key }, v)} />)}</Section>)}
      <Section id="solid-states" title="Stati" open={false}>
        <label className="field" htmlFor="solid-preview-state"><span>Anteprima dello stato del materiale</span><select id="solid-preview-state" value={previewState} onChange={(e) => { setPreviewState(e.target.value); session.controller?.previewMaterialState(e.target.value as 'default' | 'hover' | 'pressed' | 'active' | 'disabled'); }}>{def.states.map((state) => <option key={state} value={state}>{state}</option>)}</select></label>
        <p className="hint">Simulazione sulla superficie. Default ripristina l’interazione reale; Focus e semantica appartengono alla componente.</p>
        {model.states.map((st) => <details key={st.state}><summary>{st.state}</summary>{st.controls.map((c) => <ParamField key={c.key} idKey={`${st.state}-${c.key}`} d={def.stateParams.find((d) => d.key === c.key)!} value={c.value} applicability={undefined} support={undefined} onChange={(v) => session.setMaterialControl({ key: c.key, state: st.state }, v)} />)}</details>)}
      </Section>
      <p className="hint">Solid usa il proprio renderer CSS: nessuna rifrazione, sorgente, backend ottico o qualità WebGL2.</p>
      <ImportExport session={session} />
      <Section id="solid-accessibility" title="Accessibilità"><p className="hint">Solid segue prefers-reduced-motion del sistema. È già opaco: la riduzione della trasparenza non cambia la superficie. Focus e semantica appartengono alla componente.</p></Section>
      <PhoneSection session={session} />
    </div>
  </div>;
}

function GlassProperties({ session, doc }: { session: LabSession; doc: GlassDocument }) {
  const options = useLab((s) => s.options);
  const report = useLab((s) => s.report);
  const materialId = useLab((s) => s.materialId);
  const modified = useLab((s) => s.modified);
  const origin = useLab((s) => s.origin);
  const params = useMemo(() => glassParams(doc), [doc]);
  const scene = options.mode === 'scene';
  const path = report?.main.effective ?? 'refraction';
  const effective: Backend = scene ? (report?.scene?.effective === 'webgl2' ? 'webgl2' : 'css') : path === 'refraction' ? 'svg' : 'css';
  const support = useMemo(() => new Map(supportReport(effective).map((r) => [r.key, r])), [effective]);
  const appl = useMemo(
    () => applicability({ object: options.object, path, motionReduced: report?.main.motionReduced ?? false, params, mode: options.mode }),
    [options.object, options.mode, path, report?.main.motionReduced, params],
  );
  const tab = useLab((s) => s.panelTab);
  const preset = origin === 'builtin' && !modified ? materialId : '';
  const presetInfo = BUILTIN_MATERIALS.find((b) => b.doc.id === preset);

  const fields = (keys: readonly string[]) =>
    keys.map((k) => {
      const d = PARAM_INDEX[k as keyof typeof PARAM_INDEX] as ParamDescriptor;
      return (
        <ParamField
          key={d.key}
          d={d}
          value={params[d.key]}
          applicability={appl.get(d.key)}
          support={support.get(d.key)}
          onChange={(v) => session.setParam(d.key, v as never)}
        />
      );
    });
  const byGroup = (g: ParamGroup) => fields(PARAMS.filter((d) => d.group === g && SECTION_KEYS.material.includes(d.key)).map((d) => d.key));

  return (
    <div className="panel-inner" id="panelInner">
      <div className="panel-head">
        <div className="panel-heading">
          <h2>{doc.name}</h2>
          <span className="chip chip-accent">Glass</span>
        </div>
        <div className="preset-field">
          <label className="field row-field" htmlFor="preset">
            <span>Preset</span>
            <select id="preset" value={preset} onChange={(e) => e.target.value && session.openMaterial(e.target.value)}>
              {BUILTIN_MATERIALS.map((b) => (
                <option key={b.doc.id} value={b.doc.id}>
                  {b.doc.name}
                </option>
              ))}
              <option value="" disabled>
                {origin === 'user' ? 'Materiale personale' : 'Personalizzato'}
              </option>
            </select>
          </label>
          <p className="hint preset-note" id="presetNote" data-approximation={presetInfo?.approximation ? 'true' : 'false'}>
            {presetInfo ? presetInfo.note : origin === 'user' ? `Materiale personale «${doc.name}».` : 'Parametri personalizzati.'}
          </p>
        </div>
      </div>
      <div className="panel-tabs" role="tablist" aria-label="Pannello del materiale">
        {(
          [
            ['params', 'Parametri'],
            ['rendering', 'Rendering'],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" role="tab" className="panel-tab" id={`panelTab-${id}`} aria-selected={tab === id} aria-controls={`panelTabs-${id}`} onClick={() => session.setPanelTab(id)}>
            {label}
          </button>
        ))}
      </div>
      <div className="panel-body" role="tabpanel" id="panelTabs-params" aria-labelledby="panelTab-params" hidden={tab !== 'params'}>
        <Section id="material" title="Aspetto">
          {byGroup('material')}
        </Section>
        <Section id="optics" title="Ottica">
          {byGroup('optics')}
        </Section>
        <Section id="lighting" title="Luce e profondità">
          <h3 className="panel-sub">Luce</h3>
          {byGroup('light')}
          <h3 className="panel-sub">Ombra</h3>
          {byGroup('shadow')}
        </Section>
        <Section id="geometry" title="Geometria">
          {fields(SECTION_KEYS.geometry)}
          <p className="hint">Dimensioni e forma valgono per la lente libera (capsula, scena controllata). Navbar, pulsante, card e pannello seguono il proprio layout.</p>
        </Section>
        <Section id="behavior" title="Comportamento e interazione">
          {fields(SECTION_KEYS.behavior)}
        </Section>
        <ImportExport session={session} />
        <PhoneSection session={session} />
      </div>
      <div className="panel-body" role="tabpanel" id="panelTabs-rendering" aria-labelledby="panelTab-rendering" hidden={tab !== 'rendering'}>
        <RendererSection session={session} effective={effective} />
        <AccessibilitySection session={session} />
        <QualitySection session={session} />
        <Diagnostics session={session} />
      </div>
    </div>
  );
}

/** Reduced motion and transparency: what the material does when the person (or the system) asks for less. */
function AccessibilitySection({ session }: { session: LabSession }) {
  const options = useLab((s) => s.options);
  return (
    <Section id="accessibility" title="Accessibilità">
      <Switch id="opt-reduceMotion" checked={options.reduceMotion} onChange={(v) => session.setOption('reduceMotion', v)} label="Riduci effetti e movimento" hint="Ferma molla, elasticità, scala e sfondo animato" />
      <Switch id="opt-reduceTransparency" checked={options.reduceTransparency} onChange={(v) => session.setOption('reduceTransparency', v)} label="Riduci trasparenza" hint="Forza il percorso opaco, come prefers-reduced-transparency" />
    </Section>
  );
}

function QualitySection({ session }: { session: LabSession }) {
  const q = useLab((s) => s.doc.family === 'glass' ? s.doc.quality : DEFAULT_QUALITY);
  const scene = useLab((s) => s.report?.scene ?? null);
  const r = resolveQuality(q);
  return (
    <Section id="quality" title="Profilo qualità">
      <label className="field row-field" htmlFor="quality-profile">
        <span>Profilo</span>
        <select id="quality-profile" value={q.profile} onChange={(e) => session.setQuality({ profile: e.target.value as QualityProfileId })}>
          {QUALITY_IDS.map((id) => (
            <option key={id} value={id}>
              {QUALITY_PROFILES[id].label}
            </option>
          ))}
        </select>
      </label>
      <table className="kv" id="qualityTable">
        <tbody>
          <tr>
            <th scope="row">DPR massimo</th>
            <td>{r.dprCap}</td>
          </tr>
          <tr>
            <th scope="row">Risoluzione interna (WebGL2)</th>
            <td>{Math.round(r.internalScale * 100)}%</td>
          </tr>
          <tr>
            <th scope="row">Mappa (SVG, WebGL2)</th>
            <td>{r.mapResolution} px per px CSS</td>
          </tr>
          <tr>
            <th scope="row">Campioni blur per passata</th>
            <td>{r.blurTaps}</td>
          </tr>
          <tr>
            <th scope="row">Budget sorgenti dinamiche</th>
            <td>{r.maxFps} fps (obiettivo, non garanzia)</td>
          </tr>
          <tr>
            <th scope="row">Aberrazione cromatica</th>
            <td>{r.chroma ? 'consentita' : 'disattivata'}</td>
          </tr>
          <tr>
            <th scope="row">Cache mappe</th>
            <td>{r.mapCache}</td>
          </tr>
        </tbody>
      </table>
      <div className="option">
        <label className="check" htmlFor="quality-adaptive">
          <input id="quality-adaptive" type="checkbox" checked={q.adaptive} onChange={(e) => session.setQuality({ adaptive: e.target.checked })} />
          <span>Riduzione automatica della risoluzione (WebGL2)</span>
        </label>
        <p className="hint" id="adaptiveState">
          {q.adaptive
            ? scene
              ? `Attiva: scala ${scene.adaptive.scale} · riduzioni ${scene.adaptive.reductions}. Disattivala per una resa fissa.`
              : 'Attiva: agisce solo in Scena controllata, se i frame superano il budget.'
            : 'Spenta: la risoluzione resta quella del profilo.'}
        </p>
      </div>
    </Section>
  );
}

function RendererSection({ session, effective }: { session: LabSession; effective: Backend }) {
  const doc = useLab((s) => s.doc);
  const options = useLab((s) => s.options);
  const report = useLab((s) => s.report);
  if (doc.family !== 'glass') return null;
  const scene = options.mode === 'scene';
  const rows = supportReport(effective).filter((r) => r.level !== 'supported');
  const reasons = scene ? (report?.scene?.reasons ?? []) : (report?.group.reasons ?? []);
  return (
    <Section id="renderer" title="Renderer">
      <label className="field row-field" htmlFor="opt-backend">
        <span>Richiesto (materiale)</span>
        <select id="opt-backend" value={doc.target.backend} onChange={(e) => session.setBackend(e.target.value as BackendRequest)}>
          <option value="auto">Automatico</option>
          <option value="svg">SVG · rifrazione della sorgente DOM</option>
          <option value="css">CSS · backdrop-filter</option>
          <option value="webgl2">WebGL2 · texture controllata</option>
        </select>
      </label>
      <label className="field row-field" htmlFor="opt-fallback">
        <span>Fallback finale</span>
        <select id="opt-fallback" value={doc.target.fallback} onChange={(e) => session.setFallback(e.target.value as 'css' | 'opaque')}>
          <option value="css">CSS satinato, poi opaco</option>
          <option value="opaque">Opaco</option>
        </select>
      </label>
      <div className="rendering">
        <label className="field" htmlFor="opt-path">
          <span>Percorso DOM nell’anteprima</span>
          <select id="opt-path" value={options.path} disabled={scene} onChange={(e) => session.setOption('path', e.target.value as never)}>
            <option value="auto">Automatico</option>
            <option value="refraction">Rifrazione (filtro SVG sulla sorgente)</option>
            <option value="satin">Satinato (backdrop-filter CSS)</option>
            <option value="opaque">Opaco (verifica del fallback, non salvato)</option>
          </select>
        </label>
        <p className="hint" id="pathNote">
          {scene
            ? `Effettivo: ${report?.scene?.effective === 'webgl2' ? BACKEND_LABEL.webgl2 : 'CSS su texture (WebGL2 non usabile)'}`
            : `Percorso effettivo: ${report ? PATH_LABEL[report.main.effective] : '…'}`}
        </p>
        {doc.target.backend === 'webgl2' && !scene && <p className="param-note">Il materiale chiede WebGL2: sui componenti reali l’anteprima usa il percorso automatico. Apri «Scena controllata».</p>}
        {reasons.length > 0 && (
          <ul className="messages" id="fallbackReasons" data-ok="true">
            {reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        )}
      </div>
      <h3 className="panel-sub">Cosa fa {BACKEND_LABEL[effective]}</h3>
      {rows.length ? (
        <ul className="support-list" id="supportList">
          {rows.map((r) => (
            <li key={r.key} data-level={r.level}>
              <strong>{PARAM_INDEX[r.key].label}</strong> · {LEVEL_LABEL[r.level]}
              {r.note ? ` — ${r.note}` : ''}
            </li>
          ))}
        </ul>
      ) : (
        <p className="hint" id="supportList">
          Tutti i parametri supportati.
        </p>
      )}
      <p className="hint">Lo stesso JSON può avere rese diverse tra backend: questo elenco dice quali parametri cambiano significato.</p>
    </Section>
  );
}

function Diagnostics({ session }: { session: LabSession }) {
  const report = useLab((s) => s.report);
  const options = useLab((s) => s.options);
  const doc = useLab((s) => s.doc);
  const [measure, setMeasure] = useState<string>('');
  const [busy, setBusy] = useState(false);
  if (!report || doc.family !== 'glass') return null;
  const status = report.main;
  const { engine, verified } = describe(status);
  const g = report.geometry;
  const cs = report.compare;
  const stats = report.stats;
  const sc = report.scene;
  const rows: [string, string, string][] = [
    ['configured', 'Percorso richiesto', REQUEST_LABEL[status.configured]],
    ['detected', 'Supporto rilevato', `filtro SVG su HTML: ${status.detected.svgFilter ? 'sì' : 'no'} · backdrop-filter: ${status.detected.backdropFilter ? 'sì' : 'no'}`],
    ['effective', 'Percorso effettivo', PATH_LABEL[status.effective]],
    ['reasons', 'Motivi', status.reasons.join('; ') || '—'],
    ['backend', 'Backend del materiale', `richiesto ${doc.target.backend} → effettivo ${report.group.effective}${report.group.opaque ? ' (opaco)' : ''}`],
    ['verified', 'Verifica raster', verified],
    ['checks', 'Verifiche disponibili', status.verified ? `${status.verified.checks.length} superate: ${status.verified.checks.join('; ')}` : 'nessuna su questo motore'],
    ['engine', 'Motore', engine],
    ['runtime', 'Runtime', `${RUNTIME_VERSION} · schema materiale ${doc.schemaVersion}`],
    ['surface', 'Superficie', `${OBJECT_LABEL[options.object]} · ${g ? `${round(g.width)}×${round(g.height)} px, raggio ${round(g.radius)} px` : 'non ancora misurata'}`],
    ['maps', 'Mappe generate', `${stats.mapRegenerations} generate · ${stats.mapCacheHits} dalla cache · ${stats.surfaces} superfici`],
    [
      'compare',
      'Riquadro di confronto',
      cs ? `richiesto ${REQUEST_LABEL[cs.configured]} → effettivo ${PATH_LABEL[cs.effective]}${cs.reasons.length ? ` (${cs.reasons.join('; ')})` : ''}` : 'spento',
    ],
  ];
  if (sc) {
    rows.push(
      ['scene', 'Scena WebGL2', `${sc.effective}${sc.reasons.length ? ` · ${sc.reasons.join('; ')}` : ''}`],
      ['sceneSource', 'Sorgente della scena', `${sc.source.kind}${sc.source.dynamic ? ' (dinamica)' : ''} · ${sc.source.ready ? 'pronta' : sc.source.error ?? 'in caricamento'}`],
      [
        'sceneCounters',
        'Risorse WebGL2',
        `programmi compilati ${sc.counters.programBuilds} · aggiornamenti uniform ${sc.counters.uniformUpdates} · mappe caricate ${sc.counters.mapUploads} (cache ${sc.counters.mapCacheHits}) · texture vive ${sc.counters.texturesAlive} · frame ${sc.counters.frames} · contesto perso ${sc.counters.contextLosses}/ripristinato ${sc.counters.contextRestores}`,
      ],
    );
  }
  const view = session.controller?.scene?.sceneView ?? null;
  return (
    <Section id="diagnostics" title="Compatibilità e diagnostica" open={false}>
      <dl className="status-list" id="statusList">
        {rows.map(([k, label, value]) => (
          <div key={k} className="status-row">
            <dt>{label}</dt>
            <dd data-status={k}>{value}</dd>
          </div>
        ))}
      </dl>
      <p className="hint">
        CSS.supports() indica solo il supporto dichiarato. «Verifica raster» richiede un test superato su questo motore, versione e runtime; non vale mai per un telefono reale, e l’emulazione mobile non certifica un dispositivo.
      </p>
      <h3 className="panel-sub">Mappa di displacement</h3>
      <label className="check" htmlFor="opt-showMap">
        <input id="opt-showMap" type="checkbox" checked={options.showMap} onChange={(e) => session.setOption('showMap', e.target.checked)} />
        <span>Sovrapponi la mappa alla superficie</span>
      </label>
      <img className="map-preview" id="mapPreview" alt="Mappa di displacement della superficie selezionata" src={report.map?.url} hidden={!report.map} />
      <p className="hint">Rosso = deviazione orizzontale, verde = verticale (128 = nessuna), blu = copertura della forma.</p>
      <p className="hint" id="mapNote">
        {report.map?.note ?? 'Superficie non ancora misurata.'}
      </p>
      <h3 className="panel-sub">Frame</h3>
      <button
        type="button"
        className="button"
        id="measureFrames"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setMeasure('Misura in corso…');
          setMeasure((await session.controller?.measure()) ?? '');
          setBusy(false);
        }}
      >
        Misura frame (5 s)
      </button>
      <p className="hint" aria-live="polite" id="measureOut">
        {measure}
      </p>
      {view && (
        <div className="button-row">
          <button type="button" className="button" id="sceneLose" onClick={() => view.debugLoseContext()}>
            Simula perdita del contesto
          </button>
          <button type="button" className="button" id="sceneRestore" onClick={() => view.debugRestoreContext()}>
            Ripristina contesto
          </button>
        </div>
      )}
    </Section>
  );
}

function ImportExport({ session }: { session: LabSession }) {
  const glass = useLab((s) => s.doc.family === 'glass');
  const messages = useLab((s) => s.importMessages);
  const exportText = useLab((s) => s.exportText);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const shown = text || exportText;
  return (
    <Section id="io" title="Importa ed esporta" open={false}>
      <div className="button-row">
        <button type="button" className="button" id="resetParams" onClick={() => session.resetParams()}>
          Ripristina iniziali
        </button>
      </div>
      <h3 className="panel-sub">Preset JSON (jello-material v2)</h3>
      <div className="button-row">
        <button
          type="button"
          className="button"
          id="exportParams"
          onClick={() => {
            setText('');
            session.exportJson();
          }}
        >
          Mostra JSON
        </button>
        <button type="button" className="button" id="downloadParams" onClick={() => session.download(`${session.state.doc.id}.jello.json`, session.exportJson(), 'application/json')}>
          Scarica preset
        </button>
        <button
          type="button"
          className="button"
          id="exportLegacy"
          disabled={!glass}
          title="Formato jello-glass v1: solo i parametri"
          onClick={() => {
            setText('');
            session.exportLegacy();
          }}
        >
          v1 (precedente)
        </button>
      </div>
      <textarea id="paramsJson" rows={8} spellCheck={false} aria-label="Materiale in JSON" value={shown} onChange={(e) => setText(e.target.value)} />
      <div className="button-row">
        <button type="button" className="button" id="importParams" onClick={() => session.importText(text || exportText)}>
          Importa dal testo
        </button>
        <label className="button" htmlFor="importFile">
          Importa file…
        </label>
        <input
          type="file"
          accept="application/json,.json"
          id="importFile"
          className="visually-hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const t = await f.text();
            setText(t);
            session.importText(t);
            e.target.value = '';
          }}
        />
      </div>
      <ul className="messages" id="importMessages" role="status" data-ok={messages ? String(messages.ok) : undefined}>
        {messages && (
          <>
            <li>{messages.ok ? 'Operazione riuscita.' : 'Import rifiutato: nessun parametro è stato modificato.'}</li>
            {messages.messages.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </>
        )}
      </ul>
      <p className="hint">Importa jello-material v2 e il precedente jello-glass v1 (migrato senza perdere parametri). Un documento non valido non applica nulla.</p>
      <h3 className="panel-sub">Pacchetto per un altro progetto</h3>
      <div className="button-row">
        <button
          type="button"
          className="button primary"
          id="exportPackage"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await session.exportPackage('runtime');
            setBusy(false);
          }}
        >
          Pacchetto con runtime (.zip)
        </button>
        <button
          type="button"
          className="button"
          id="exportCssOnly"
          disabled={busy || !glass}
          onClick={async () => {
            setBusy(true);
            await session.exportPackage('css-only');
            setBusy(false);
          }}
        >
          Solo CSS (resa ridotta)
        </button>
      </div>
      <p className="hint">
        Il pacchetto contiene materiale, runtime costruito (JS, CSS, backend WebGL2, tipi), asset, manifest dei requisiti ed esempio minimo. «Solo CSS» non ha rifrazione né pressione.
      </p>
    </Section>
  );
}

function PhoneSection({ session }: { session: LabSession }) {
  const sync = useLab((s) => s.sync);
  const [relay, setRelay] = useState(() => `${location.protocol}//${location.hostname}:5174`);
  const previewUrl =
    sync.kind === 'off'
      ? null
      : `${location.origin}${location.pathname.replace(/[^/]*$/, '')}preview.html?relay=${encodeURIComponent(sync.relay)}&token=${sync.token}`;
  return (
    <Section id="phone" title="Anteprima sul telefono" open={false}>
      <p className="hint">
        Facoltativo. Avvia il relay locale (<code>npm run relay</code>), poi apri sul telefono, nella stessa rete, l’indirizzo mostrato qui sotto con l’IP LAN di questo computer al posto di localhost.
      </p>
      <label className="field" htmlFor="relayUrl">
        <span>Relay</span>
        <input id="relayUrl" value={relay} onChange={(e) => setRelay(e.target.value)} disabled={sync.kind !== 'off'} />
      </label>
      <div className="button-row">
        {sync.kind === 'off' ? (
          <button type="button" className="button" id="syncStart" onClick={() => session.startSync(relay)}>
            Avvia sincronizzazione
          </button>
        ) : (
          <button type="button" className="button" id="syncStop" onClick={() => session.stopSync()}>
            Ferma
          </button>
        )}
      </div>
      <p className="hint" id="syncStatus" role="status" data-kind={sync.kind}>
        {sync.kind === 'off' && 'Spenta.'}
        {sync.kind === 'connecting' && 'Connessione al relay…'}
        {sync.kind === 'live' && `Inviato lo stato n. ${sync.seq} · anteprime collegate: ${sync.previews}.`}
        {sync.kind === 'error' && `Relay non raggiungibile: ${sync.message}. Nuovo tentativo tra ${Math.round(sync.retryIn / 1000)} s.`}
      </p>
      {previewUrl && (
        <p className="hint">
          Anteprima: <code id="syncPreviewUrl">{previewUrl}</code>
        </p>
      )}
    </Section>
  );
}
