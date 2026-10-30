import { useEffect, useRef } from 'react';
import { COMPONENTS } from '../../components';
import { PATH_LABEL } from '../../stage/controller';
import type { SaveState } from '../storage/autosave';
import type { LabSession } from '../session';
import { useLab } from '../store';
import { BuilderSidebar, Inspector } from './Builder';
import { ExportDialog } from './ExportDialog';
import { AssetsPage } from './Assets';
import { Home } from './Home';
import { FlowPage } from './Flows';
import { GlobalSearch } from './Search';
import { SettingsPage } from './Settings';
import { ConfirmHost, DropOverlay } from './Overlays';
import { Icon } from './icons';
import { Ic } from './ui';
import { Library } from './Library';
import { Preview } from './Preview';
import { Properties } from './Properties';

const BASE = import.meta.env.BASE_URL;

function saveLabel(s: SaveState, origin: 'builtin' | 'user', modified: boolean): string {
  switch (s.kind) {
    case 'idle':
      return origin === 'builtin' && !modified ? 'Preset incluso' : 'Nessuna modifica';
    case 'pending':
      return 'Modifiche in attesa…';
    case 'saving':
      return 'Salvataggio…';
    case 'saved':
      return `Salvato alle ${new Date(s.at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
    case 'memory':
      return 'Non persistente: solo questa scheda';
    case 'error':
      return s.error === 'quota' ? 'Non salvato: spazio esaurito' : 'Non salvato';
  }
}

export function App({ session }: { session: LabSession }) {
  const doc = useLab((s) => s.doc);
  const save = useLab((s) => s.save);
  const origin = useLab((s) => s.origin);
  const modified = useLab((s) => s.modified);
  const layout = useLab((s) => s.layout);
  const notice = useLab((s) => s.notice);
  const report = useLab((s) => s.report);
  const workspace = useLab((s) => s.workspace);
  const builder = useLab((s) => s.builder);
  const page = useLab((s) => s.page);
  const flow = useLab((s) => s.flow);
  const projects = useLab((s) => s.projects);
  const projectId = useLab((s) => s.projectId);
  const drawer = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    document.documentElement.toggleAttribute('data-panel-open', layout.drawer);
    if (layout.drawer) drawer.current?.focus({ preventScroll: true });
  }, [layout.drawer]);

  const closeDrawer = () => {
    session.setDrawer(false);
    toggle.current?.focus();
  };

  const verified = report?.main.verified ?? null;
  const e = report?.main.engine;
  const scene = report?.options.mode === 'scene';
  const isBuilder = workspace === 'builder';
  const inLab = page === 'lab' && !flow;
  const hasProject = projectId !== null;
  const project = projects.find((p) => p.id === projectId) ?? null;
  const pageSave = saveLabel(save, 'user', false);
  return (
    <>
      <a className="skip" href={inLab ? '#panel' : '#main'}>
        {inLab ? (isBuilder ? 'Vai all’inspector' : 'Vai alle proprietà') : 'Vai al contenuto'}
      </a>
      <header className="lab-header" data-page={flow ? 'flow' : page}>
        <button type="button" className="brand" id="brandHome" aria-label="Jello: vai alla Home" onClick={() => session.setPage('home')}>
          <img className="brand-mark" src={`${BASE}brand/jello-mark-96.png`} srcSet={`${BASE}brand/jello-mark-96.png 1x, ${BASE}brand/jello-mark-192.png 2x`} alt="" width="40" height="33" />
          <h1>
            <span className="brand-name">Jello</span> <span className="brand-sub">Material Lab</span>
          </h1>
        </button>
        <div className="tb-segmented workspace-switch" role="group" aria-label="Sezioni">
          <button type="button" className="tb-seg" id="ws-material" aria-pressed={inLab && !isBuilder} aria-current={inLab && !isBuilder ? 'page' : undefined} aria-label="Materiali" disabled={!hasProject} onClick={() => session.setPage('lab', 'material')}>
            Materiali
          </button>
          <button type="button" className="tb-seg" id="ws-builder" aria-pressed={inLab && isBuilder} aria-current={inLab && isBuilder ? 'page' : undefined} aria-label="Componenti" disabled={!hasProject} onClick={() => session.setPage('lab', 'builder')}>
            Componenti
          </button>
          <button type="button" className="tb-seg" id="nav-assets" aria-pressed={page === 'assets' && !flow} aria-current={page === 'assets' && !flow ? 'page' : undefined} aria-label="Asset" disabled={!hasProject} onClick={() => session.setPage('assets')}>
            Asset
          </button>
        </div>

        {page === 'home' && !flow && (
          <>
            <GlobalSearch session={session} />
            <div className="header-actions">
              <button className="header-button" id="headerImport" type="button" onClick={() => session.openFlow('import')}>
                <Ic name="download" />
                Importa
              </button>
              <button className="header-button primary" id="headerNewProject" type="button" onClick={() => session.openFlow('wizard')}>
                <Ic name="plus" />
                Nuovo progetto
              </button>
            </div>
          </>
        )}

        {(page === 'assets' || page === 'settings' || flow) && (
          <>
            <div className="page-title">
              {projects.length > 1 || flow ? <ProjectSwitch session={session} /> : <span>{project?.name ?? 'Jello'}</span>}
              <span aria-hidden="true">·</span>
              <span className="crumb-current">{flow === 'wizard' ? 'Nuovo progetto' : flow === 'import' ? 'Importazione' : flow === 'export' ? 'Esportazione' : page === 'assets' ? 'Asset' : 'Impostazioni'}</span>
            </div>
            <p className="save-status" id="saveStatus" role="status" data-kind={save.kind} title={save.kind === 'error' || save.kind === 'memory' ? save.message : undefined}>
              {pageSave}
            </p>
            <div className="header-actions">
              <button className="header-button primary" id="exportOpen" type="button" disabled={!hasProject} onClick={() => session.openFlow('export')}>
                <Ic name="upload" />
                Esporta
              </button>
            </div>
          </>
        )}

        {inLab && (
          <>
            <nav className="crumbs" aria-label="Percorso">
              {projects.length > 1 ? <ProjectSwitch session={session} /> : null}
              {isBuilder ? (
                <>
                  <span className="visually-hidden" id="crumbType">{COMPONENTS.get(builder.doc.type)?.name ?? builder.doc.type}</span>
                  <span className="crumb-current" id="crumbComponent" aria-current="page">
                    {builder.doc.name}
                  </span>
                </>
              ) : (
                <>
                  <span className="crumb-current" id="crumbPreset" aria-current="page">
                    {doc.name}
                  </span>
                </>
              )}
            </nav>
            <p className="save-status" id="saveStatus" role="status" data-kind={save.kind} title={save.kind === 'error' || save.kind === 'memory' ? save.message : undefined}>
              {isBuilder ? saveLabel(save, builder.origin === 'template' ? 'builtin' : 'user', builder.modified).replace('Preset incluso', 'Template incluso') : saveLabel(save, origin, modified)}
            </p>
            <div className="header-actions">
              <button className="tb-icon-button column-toggle" id="toggleLeft" type="button" aria-pressed={layout.left} aria-label="Mostra la libreria" title="Libreria" onClick={() => session.toggleColumn('left')}>
                <Icon name="left" />
              </button>
              <button className="tb-icon-button column-toggle" id="toggleRight" type="button" aria-pressed={layout.right} aria-label="Mostra le proprietà" title="Proprietà" onClick={() => session.toggleColumn('right')}>
                <Icon name="right" />
              </button>
              {isBuilder ? (
                <button className="header-button" id="saveNow" type="button" onClick={() => void session.saveComponent()} title={builder.origin === 'template' ? 'I template non si sovrascrivono: salva una copia nella libreria' : 'Salva ora (il salvataggio è anche automatico)'}>
                  <Icon name="save" />
                  {builder.origin === 'template' ? 'Salva nella libreria' : 'Salva'}
                </button>
              ) : (
                <button
                  className="header-button"
                  id="saveNow"
                  type="button"
                  onClick={() => (origin === 'builtin' ? void session.saveAsCopy() : void session.saveNow())}
                  title={origin === 'builtin' ? 'I preset inclusi non si sovrascrivono: crea una copia personale' : 'Salva ora (il salvataggio è anche automatico)'}
                >
                  <Icon name="save" />
                  {origin === 'builtin' ? 'Salva come copia' : 'Salva'}
                </button>
              )}
              <button className="header-button primary" id="exportOpen" type="button" aria-haspopup="dialog" aria-label="Esporta…" onClick={() => session.setExportOpen(true)}>
                <Icon name="download" />
                <span className="ws-long">Esporta…</span>
              </button>
              <button
                hidden={isBuilder}
                className="header-button"
                id="exportJson"
                type="button"
                title="Esporta JSON"
                onClick={() => {
                  if (toggle.current && toggle.current.offsetParent !== null && !layout.drawer) session.setDrawer(true);
                  session.exportJson();
                  session.setPanelTab('params');
                  const open = () => {
                    const io = document.querySelector<HTMLDetailsElement>('[data-section=io]');
                    if (!io) return;
                    io.open = true;
                    const ta = io.querySelector<HTMLTextAreaElement>('#paramsJson');
                    requestAnimationFrame(() => {
                      ta?.focus({ preventScroll: true });
                      ta?.select();
                      io.scrollIntoView({ block: 'nearest' });
                    });
                  };
                  requestAnimationFrame(open);
                }}
              >
                <Icon name="download" />
                Esporta JSON
              </button>
              <button className="header-button panel-toggle" id="panelToggle" type="button" ref={toggle} aria-label="Regolazioni" aria-expanded={layout.drawer} aria-controls="controls" onClick={() => session.setDrawer(!layout.drawer)}>
                <Ic name="gear" />
                <span className="panel-toggle-label">Regolazioni</span>
              </button>
            </div>
          </>
        )}
      </header>

      {flow && (
        <main className="flow-page" id="main" tabIndex={-1}>
          <FlowPage session={session} />
        </main>
      )}
      {!flow && page === 'home' && (
        <div className="page-scroll" id="main" tabIndex={-1}>
          <Home session={session} />
        </div>
      )}
      {!flow && page === 'assets' && (
        <div className="page-scroll" id="main" tabIndex={-1}>
          <AssetsPage session={session} />
        </div>
      )}
      {!flow && page === 'settings' && (
        <div className="page-scroll" id="main" tabIndex={-1}>
          <SettingsPage session={session} />
        </div>
      )}

      <main className="lab" id="lab" hidden={!inLab} data-left={layout.left ? 'open' : 'closed'} data-right={layout.right ? 'open' : 'closed'}>
        <Preview session={session} />
        <div
          className={`controls${layout.drawer ? ' is-open' : ''}`}
          id="controls"
          tabIndex={-1}
          ref={drawer}
          onKeyDown={(ev) => {
            if (ev.key === 'Escape' && layout.drawer) closeDrawer();
          }}
        >
          <div className="controls-bar">
            <span className="controls-title">Regolazioni</span>
            <nav className="controls-jump" aria-label="Sezioni">
              <a href="#sidebar">{isBuilder ? 'Libreria e struttura' : 'Libreria'}</a>
              <a href="#panel">{isBuilder ? 'Inspector' : 'Proprietà'}</a>
            </nav>
            <button className="button" id="panelClose" type="button" onClick={closeDrawer}>
              Chiudi
            </button>
          </div>
          <aside className="sidebar" id="sidebar" aria-label={isBuilder ? 'Libreria e struttura' : 'Libreria, componente e sorgente'} hidden={!layout.left}>
            {isBuilder ? <BuilderSidebar session={session} /> : <Library session={session} />}
          </aside>
          <aside className="panel" id="panel" aria-label={isBuilder ? 'Inspector della componente' : 'Proprietà del materiale'} tabIndex={-1} hidden={!layout.right}>
            {isBuilder ? <Inspector session={session} /> : <Properties session={session} />}
          </aside>
        </div>
      </main>

      <footer className="lab-footer" hidden={!inLab}>
        <p className="status-chips" id="statusChips" aria-live="polite">
          {report && (
            <>
              <span className="chip" data-kind={scene ? 'webgl2' : report.main.effective}>
                {scene ? `Backend: ${report.scene?.effective === 'webgl2' ? 'WebGL2' : 'CSS su texture'}` : `Percorso: ${PATH_LABEL[report.main.effective]}`}
              </span>
              {scene ? (
                <span className="chip" data-kind="warn" title="I record raster riguardano il backend SVG; WebGL2 non ha ancora una verifica visiva">
                  WebGL2: nessuna verifica raster
                </span>
              ) : (
                <span className="chip" data-kind={verified ? 'ok' : 'warn'}>
                  {verified ? `Verificato (raster ${verified.backend ?? 'svg'}, runtime ${verified.runtime})` : 'Non verificato su questo motore e runtime'}
                </span>
              )}
            </>
          )}
        </p>
        <p className="footer-engine" id="footerEngine">
          {e
            ? scene && report!.scene
              ? `${e.engine}${e.major ? ` ${e.major}` : ''} · WebGL2 · ${report!.scene.counters.frames} frame · ${report!.scene.counters.mapUploads} mappe caricate`
              : `${e.engine}${e.major ? ` ${e.major}` : ''} · ${report!.stats.surfaces} superfici · ${report!.stats.mapRegenerations} mappe generate`
            : ''}
        </p>
      </footer>
      <ExportDialog session={session} />
      <ConfirmHost session={session} />
      <DropOverlay session={session} />
      {notice && (
        <div className="notice" id="notice" role="status">
          <Ic name="info" />
          <span>{notice.text}</span>
          {notice.undo && (
            <button type="button" className="button small" id="noticeUndo" onClick={() => session.undoDiscard()}>
              Annulla
            </button>
          )}
          {notice.action && (
            <button type="button" className="button small" id="noticeAction" onClick={notice.action.run}>
              {notice.action.label}
            </button>
          )}
        </div>
      )}
    </>
  );
}

/** Active project, switchable from every page. */
function ProjectSwitch({ session }: { session: LabSession }) {
  const projects = useLab((s) => s.projects);
  const projectId = useLab((s) => s.projectId);
  if (projects.length === 0) return null;
  return (
    <label className="project-switch">
      <span className="visually-hidden">Progetto attivo</span>
      <select id="projectSwitch" value={projectId ?? ''} onChange={(e) => session.switchProject(e.target.value)}>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </label>
  );
}
