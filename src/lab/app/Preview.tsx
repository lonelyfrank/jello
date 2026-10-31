import { COMPONENTS, navbarItems } from '../../components';
import { setStudioPreferences, useStudioPreferences } from '../studio-preferences';
import { useLayoutEffect, useRef, useState } from 'react';
import { SCENES } from '../../stage/scenes';
import { CUSTOM_LIMITS } from '../../stage/view';
import type { LabSession } from '../session';
import { useLab } from '../store';
import { Icon } from './icons';
import { Ic } from './ui';

const fmt = (s: { median: number; p95: number } | null, unit = 'ms') => (s ? `${s.median} ${unit} (p95 ${s.p95})` : '—');

export function Preview({ session }: { session: LabSession }) {
  const host = useRef<HTMLDivElement>(null);
  const options = useLab((s) => s.options);
  const report = useLab((s) => s.report);
  const builder = useLab((s) => s.workspace === 'builder');
  const solid = useLab((s) => (s.workspace === 'builder' ? s.builder.doc.material.family : s.doc.family) === 'solid');
  const solidLab = useLab((s) => s.workspace === 'material' && s.doc.family === 'solid');
  const { zoom, area } = useStudioPreferences();
  const setZoom = (zoom: number) => setStudioPreferences({ zoom });
  const b = useLab((s) => s.builder);
  const [desktopStatus, setDesktopStatus] = useState('');
  const pick = useLab((s) => s.builder.pick);

  // The controller owns everything inside this element; React never renders into it.
  useLayoutEffect(() => {
    if (host.current) session.mountPreview(host.current);
  }, [session]);

  useLayoutEffect(() => {
    if (!builder || b.doc.type !== 'desktop-navbar' || !host.current) { setDesktopStatus(''); return; }
    const refresh = () => {
      const nav = host.current?.querySelector('.jello-dnav');
      setDesktopStatus(nav ? `${nav.hasAttribute('data-overflowing') ? 'Overflow: scorri per raggiungere tutte le voci' : 'Tutte le voci nello spazio disponibile'} · Breakpoint: ${nav.getAttribute('data-breakpoint') || 'base'}` : '');
    };
    const observer = new MutationObserver(refresh);
    observer.observe(host.current, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-overflowing', 'data-breakpoint'] });
    refresh();
    return () => observer.disconnect();
  }, [builder, b.doc.type]);

  const scene = options.mode === 'scene';
  const loops = report?.loops ?? [];
  const sceneStatus = report?.scene ?? null;

  const simulateStates = b.doc.type !== 'desktop-navbar' || navbarItems(b.doc).some((item) => item.id === b.selection && item.visible);
  const forcedOpaque = !solid && !scene && report?.main.effective === 'opaque' && report.main.configured !== 'opaque';
  const manualTransparency = options.reduceTransparency;
  return (
    <section className="preview" aria-labelledby="previewTitle">
      {forcedOpaque && (
        <div className="opaque-banner" role="status" id="opaqueBanner">
          <Ic name="eye" />
          <span className="opaque-text">
            <strong>Trasparenza ridotta attiva.</strong> Il materiale usa il percorso Opaco: superficie piena e bordo, senza blur né rifrazione.
          </span>
          <span className="opaque-origin">{manualTransparency ? 'Origine: impostazione “Riduci trasparenza”' : (report?.main.reasons[0] ?? 'Origine: preferenza del sistema')}</span>
          {manualTransparency && (
            <button type="button" className="button small" id="opaqueOff" onClick={() => session.setOption('reduceTransparency', false)}>
              Disattiva
            </button>
          )}
        </div>
      )}
      <div className="preview-head">
        <h2 className="preview-title" id="previewTitle">
          {area === 'preview' ? 'Preview & Test' : builder ? 'Component Canvas' : 'Material Canvas'}
        </h2>
        <div className="toolbar" id="toolbar" role="toolbar" aria-label="Inquadratura dell’anteprima">
          {builder && (
            <>
              <div className="tb-segmented" role="group" aria-label="Uso dell’anteprima">
                <button type="button" className="tb-seg" id="tb-interact" aria-pressed={!pick} onClick={() => session.setPick(false)} title="Le tab rispondono come nell’app">
                  Interagisci
                </button>
                <button type="button" className="tb-seg" id="tb-pick" aria-pressed={pick} onClick={() => session.setPick(true)} title="Un clic seleziona l’elemento nell’inspector">
                  <Icon name="pick" /> Seleziona
                </button>
              </div>
              <label className="tb-select" htmlFor="tb-background">
                <span className="visually-hidden">Sfondo di prova</span>
                <select id="tb-background" value={options.scene} onChange={(e) => session.setOption('scene', e.target.value as never)} title="Sfondo di prova: trasparenza, rifrazione e contrasto">
                  {SCENES.map((s) => (
                    <option key={s.id} value={s.id}>
                      Sfondo: {s.short}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          {!builder && !scene && (
            <label className="tb-select tb-bg-lab" htmlFor="tb-background-lab">
              <span className="visually-hidden">Sfondo di prova</span>
              <select id="tb-background-lab" value={options.scene} onChange={(e) => session.setOption('scene', e.target.value as never)} title="Sfondo di prova: trasparenza, rifrazione e contrasto">
                {SCENES.map((s) => (
                  <option key={s.id} value={s.id}>
                    Sfondo: {s.short}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="tb-segmented" role="group" aria-label="Modalità di anteprima" hidden={builder || solidLab}>
            <button type="button" className="tb-seg" id="tb-mode-components" aria-pressed={!scene} onClick={() => session.setOption('mode', 'components')} title="Vere componenti HTML (backend CSS o SVG)">
              Componenti reali
            </button>
            <button type="button" className="tb-seg" id="tb-mode-scene" aria-pressed={scene} onClick={() => session.setOption('mode', 'scene')} title="Texture controllata (backend WebGL2)">
              Scena controllata
            </button>
          </div>
          <div className="tb-segmented" role="group" aria-label="Confronto" hidden={builder || solidLab}>
            <button type="button" className="tb-seg" id="tb-single" aria-pressed={!options.compare} onClick={() => session.setOption('compare', false)}>
              Singola
            </button>
            <button
              type="button"
              className="tb-seg"
              id="tb-compare"
              aria-pressed={options.compare}
              disabled={scene}
              title="Secondo riquadro sincronizzato con il percorso satinato"
              onClick={() => session.setOption('compare', !options.compare)}
            >
              A/B
            </button>
          </div>
          <div className="tb-devices" role="group" aria-label="Dimensioni anteprima">
            {(
              [
                ['desktop', 'Desktop'],
                ['tablet', 'Tablet (768 px)'],
                ['phone', 'Telefono (390 px)'],
                ['custom', 'Dimensioni personalizzate'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className="tb-icon-button"
                id={`tb-device-${value}`}
                aria-label={label}
                title={label}
                aria-pressed={options.device === value}
                onClick={() => session.setOption('device', value)}
              >
                <Icon name={value} />
              </button>
            ))}
          </div>
          {options.device === 'custom' && <CustomSize session={session} width={options.width} height={options.height} />}
          <button
            type="button"
            className="tb-icon-button"
            id="tb-pause"
            aria-label={options.animate ? 'Metti in pausa lo sfondo' : 'Riprendi l’animazione dello sfondo'}
            title={options.animate ? 'Pausa' : 'Riprendi'}
            aria-pressed={!options.animate}
            onClick={() => session.setOption('animate', !options.animate)}
          >
            <Icon name={options.animate ? 'pause' : 'play'} />
          </button>
          <label className="tb-select" htmlFor="previewZoom"><span className="visually-hidden">Zoom</span><select id="previewZoom" value={zoom} onChange={(e) => setZoom(Number(e.target.value))}>{[0.5, 0.75, 1, 1.25, 1.5].map((v) => <option key={v} value={v}>{Math.round(v * 100)}%</option>)}</select></label>
          <button type="button" className="tb-icon-button" id="tb-restore" aria-label="Ripristina scroll, posizione e tempo" title="Ripristina" onClick={() => { setZoom(1); session.controller?.restore(); }}>
            <Icon name="restore" />
          </button>
          <button type="button" className="tb-icon-button" id="tb-scrollTop" aria-label="Scroll in cima" title="Riporta il contenuto all’inizio in tutti i riquadri" onClick={() => session.controller?.resetScroll()}>
            <Icon name="top" />
          </button>
        </div>
      </div>
      {area === 'preview' && <div className="studio-test-note"><Ic name="shield" /><span>Stesso Stage, stesso runtime. Prova viewport, sfondi e stati; diagnostica e relay sono nei pannelli laterali.</span></div>}
      <div className="canvas-caption"><span>{builder ? b.doc.name : solid ? 'Solid / CSS' : scene ? 'Glass / Scena controllata' : 'Glass / Componenti reali'}</span><span>{options.device === 'custom' ? `${options.width} × ${options.height} px` : options.device === 'phone' ? '390 px · Mobile' : options.device === 'tablet' ? '768 px · Tablet' : 'Desktop · adattivo'}</span></div>
      {builder && b.doc.type === 'desktop-navbar' && <p className="hint navbar-layout-status" id="navbarLayoutStatus" role="status">{desktopStatus}</p>}
      <div className="preview-host" ref={host} style={{ zoom }} />
      {builder && <div className="canvas-states" role="group" aria-label="Stati della componente"><span>{simulateStates ? 'Stato' : 'Seleziona un brand, una voce o un’azione visibile per simulare gli stati.'}</span>{(simulateStates ? COMPONENTS.get(b.doc.type)?.states ?? [] : []).map((state) => <button key={state} type="button" aria-pressed={(b.previewState ?? 'default') === state} onClick={() => session.setPreviewState(state === 'default' ? null : state as typeof b.previewState)}>{state === 'default' ? 'Default' : state[0]!.toUpperCase() + state.slice(1)}</button>)}</div>}
      <dl className="metrics" id="metrics" aria-label="Misure disponibili">
        <div>
          <dt>Loop JavaScript</dt>
          <dd data-metric="loops">{loops.length ? loops.join(', ') : 'nessuno a riposo'}</dd>
        </div>
        {scene ? (
          <>
            <div>
              <dt>Intervallo tra frame</dt>
              <dd data-metric="interval">{fmt(sceneStatus?.metrics.frameInterval ?? null)}</dd>
            </div>
            <div>
              <dt>Lavoro CPU per frame</dt>
              <dd data-metric="cpu">{fmt(sceneStatus?.metrics.cpu ?? null)}</dd>
            </div>
            <div>
              <dt>Tempo GPU</dt>
              <dd data-metric="gpu" title={sceneStatus?.metrics.gpuNote}>
                {sceneStatus?.metrics.gpu ? fmt(sceneStatus.metrics.gpu) : 'non disponibile'}
              </dd>
            </div>
            <div>
              <dt>Risoluzione interna</dt>
              <dd data-metric="resolution">
                {sceneStatus ? `${sceneStatus.canvas.pixelWidth}×${sceneStatus.canvas.pixelHeight} px · DPR ${sceneStatus.canvas.dpr} (limite ${sceneStatus.quality.dprCap}) · scala ${sceneStatus.canvas.scale}` : '—'}
              </dd>
            </div>
          </>
        ) : (
          <div>
            <dt>{solid ? 'Solid · CSS' : 'CSS / SVG'}</dt>
            <dd data-metric="compositing">{solid ? 'Superficie e transizioni CSS, senza rifrazione o canvas.' : 'Il costo di filtro e compositing è del browser: non misurabile da JS. Usa «Misura frame».'}</dd>
          </div>
        )}
        {report?.suspended && (
          <div>
            <dt>Stato</dt>
            <dd>Sospesa (non visibile)</dd>
          </div>
        )}
      </dl>
    </section>
  );
}

function CustomSize({ session, width, height }: { session: LabSession; width: number; height: number }) {
  const [w, setW] = useState(String(width));
  const [h, setH] = useState(String(height));
  const commit = () => {
    const nw = Math.round(Number(w));
    const nh = Math.round(Number(h));
    const L = CUSTOM_LIMITS;
    if (Number.isFinite(nw) && nw >= L.minWidth && nw <= L.maxWidth) session.setOption('width', nw);
    else setW(String(width));
    if (Number.isFinite(nh) && nh >= L.minHeight && nh <= L.maxHeight) session.setOption('height', nh);
    else setH(String(height));
  };
  return (
    <form
      className="tb-size"
      onSubmit={(e) => {
        e.preventDefault();
        commit();
      }}
    >
      <label>
        <span className="visually-hidden">Larghezza in px</span>
        <input id="tb-width" inputMode="numeric" value={w} onChange={(e) => setW(e.target.value)} onBlur={commit} aria-describedby="tb-size-hint" />
      </label>
      <span aria-hidden="true">×</span>
      <label>
        <span className="visually-hidden">Altezza in px</span>
        <input id="tb-height" inputMode="numeric" value={h} onChange={(e) => setH(e.target.value)} onBlur={commit} aria-describedby="tb-size-hint" />
      </label>
      <span className="visually-hidden" id="tb-size-hint">
        {`Da ${CUSTOM_LIMITS.minWidth}×${CUSTOM_LIMITS.minHeight} a ${CUSTOM_LIMITS.maxWidth}×${CUSTOM_LIMITS.maxHeight} px`}
      </span>
    </form>
  );
}
