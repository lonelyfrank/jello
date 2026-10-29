import { useLayoutEffect, useRef, useState } from 'react';
import { SCENES } from '../../stage/scenes';
import { CUSTOM_LIMITS } from '../../stage/view';
import type { LabSession } from '../session';
import { useLab } from '../store';
import { Icon } from './icons';

const fmt = (s: { median: number; p95: number } | null, unit = 'ms') => (s ? `${s.median} ${unit} (p95 ${s.p95})` : '—');

export function Preview({ session }: { session: LabSession }) {
  const host = useRef<HTMLDivElement>(null);
  const options = useLab((s) => s.options);
  const report = useLab((s) => s.report);
  const builder = useLab((s) => s.workspace === 'builder');
  const pick = useLab((s) => s.builder.pick);

  // The controller owns everything inside this element; React never renders into it.
  useLayoutEffect(() => {
    if (host.current) session.mountPreview(host.current);
  }, [session]);

  const scene = options.mode === 'scene';
  const loops = report?.loops ?? [];
  const sceneStatus = report?.scene ?? null;

  return (
    <section className="preview" aria-labelledby="previewTitle">
      <div className="preview-head">
        <h2 className="preview-title" id="previewTitle">
          {builder ? 'Anteprima della componente' : 'Anteprima'}
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
          <div className="tb-segmented" role="group" aria-label="Modalità di anteprima" hidden={builder}>
            <button type="button" className="tb-seg" id="tb-mode-components" aria-pressed={!scene} onClick={() => session.setOption('mode', 'components')} title="Vere componenti HTML (backend CSS o SVG)">
              Componenti reali
            </button>
            <button type="button" className="tb-seg" id="tb-mode-scene" aria-pressed={scene} onClick={() => session.setOption('mode', 'scene')} title="Texture controllata (backend WebGL2)">
              Scena controllata
            </button>
          </div>
          <div className="tb-segmented" role="group" aria-label="Confronto" hidden={builder}>
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
          <button type="button" className="tb-icon-button" id="tb-restore" aria-label="Ripristina scroll, posizione e tempo" title="Ripristina" onClick={() => session.controller?.restore()}>
            <Icon name="restore" />
          </button>
          <button type="button" className="tb-icon-button" id="tb-scrollTop" aria-label="Scroll in cima" title="Riporta il contenuto all’inizio in tutti i riquadri" onClick={() => session.controller?.resetScroll()}>
            <Icon name="top" />
          </button>
        </div>
      </div>
      <div className="preview-host" ref={host} />
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
            <dt>CSS / SVG</dt>
            <dd data-metric="compositing">Il costo di filtro e compositing è del browser: non misurabile da JS. Usa «Misura frame».</dd>
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
