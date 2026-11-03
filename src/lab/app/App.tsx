import { lazy, Suspense, useEffect, useRef, useState } from 'react';
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
import { SettingsPage } from './Settings';
import { ConfirmHost, DropOverlay } from './Overlays';
import { CreateDialog } from './CreateDialog';
import { Icon } from './icons';
import { Ic } from './ui';
import { Library } from './Library';
import { Preview } from './Preview';
import { Properties } from './Properties';
import { TestInspector } from './TestInspector';
import { StudioRail } from './StudioNav';
import { StudioLibrary } from './StudioLibrary';
import { PanelResize } from './PanelResize';
import { useStudioPreferences } from '../studio-preferences';

// Experimental Jelly: a separate chunk, fetched the first time the area is opened. Never imported statically.
const JellyMain = lazy(() => import('../experimental/jelly/JellyMain'));

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
  const studio = useStudioPreferences();
  const doc = useLab((s) => s.doc);
  const save = useLab((s) => s.save);
  const origin = useLab((s) => s.origin);
  const modified = useLab((s) => s.modified);
  const layout = useLab((s) => s.layout);
  const notice = useLab((s) => s.notice);
  const report = useLab((s) => s.report);
  const workspace = useLab((s) => s.workspace);
  const builder = useLab((s) => s.builder);
  const solid = (workspace === 'builder' ? builder.doc.material.family : doc.family) === 'solid';
  const page = useLab((s) => s.page);
  const flow = useLab((s) => s.flow);
  const projects = useLab((s) => s.projects);
  const projectId = useLab((s) => s.projectId);
  const [createOpen, setCreateOpen] = useState(false);
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
  const inJelly = page === 'lab' && !flow && studio.area === 'jelly';
  const inLab = page === 'lab' && !flow && studio.area !== 'library' && studio.area !== 'jelly';
  const [jellyOpened, setJellyOpened] = useState(false);
  useEffect(() => { if (inJelly) setJellyOpened(true); }, [inJelly]);
  const inLibrary = page === 'lab' && !flow && studio.area === 'library';
  const hasProject = projectId !== null;
  const project = projects.find((p) => p.id === projectId) ?? null;
  const pageSave = saveLabel(save, 'user', false);
  const railSave = inLab ? (isBuilder ? saveLabel(save, builder.origin === 'template' ? 'builtin' : 'user', builder.modified).replace('Preset incluso', 'Template incluso') : saveLabel(save, origin, modified)) : pageSave;
  const saveShort = save.kind === 'saved' ? 'Salvato' : save.kind === 'error' ? 'Non salvato' : save.kind === 'memory' ? 'Solo scheda' : save.kind === 'saving' || save.kind === 'pending' ? 'In attesa' : 'Locale';
  const showHero = !(page === 'home' && !flow) && !inLibrary;
  const flowTitle = flow === 'component' ? 'Nuova componente' : flow === 'wizard' ? 'Nuovo progetto' : flow === 'import' ? 'Importazione' : flow === 'export' ? 'Esportazione' : '';
  const hero: { eyebrow?: string | undefined; title: string; sub?: string | undefined } = flow
    ? { eyebrow: project?.name ?? 'JELLO STUDIO', title: flowTitle }
    : page === 'assets' ? { eyebrow: 'GLI INGREDIENTI DEL PROGETTO', title: 'Colori, icone e font' }
    : page === 'settings' ? { eyebrow: 'JELLO STUDIO', title: 'Impostazioni' }
    : inJelly ? { eyebrow: project?.name ?? 'JELLO STUDIO', title: 'Jello Lab' }
    : isBuilder && studio.area !== 'preview' ? { title: 'Component Builder' }
    : studio.area === 'preview' ? { title: 'Preview & Test' }
    : { title: 'Material Lab' };
  return (
    <>
      <a className="skip" href={inJelly ? '#jl-panel' : inLab ? '#panel' : '#main'}>
        {inJelly ? 'Vai all’inspector Jello' : inLab ? (isBuilder ? 'Vai all’inspector' : 'Vai alle proprietà') : 'Vai al contenuto'}
      </a>
      <div className="studio-shell">
      <StudioRail session={session} saveShort={saveShort} saveFull={railSave} saveKind={save.kind} onCreate={() => setCreateOpen(true)} createOpen={createOpen} />
      <div className="studio-body">
      {showHero && (
      <header className="lab-header hero" data-page={flow ? 'flow' : page}>
        <span className="hero-bubble" aria-hidden="true" />
        <div className="hero-title">
          {hero.eyebrow && <p className="hero-eyebrow">{hero.eyebrow}</p>}
          <h1 className="hero-h1" id="pageTitle">{hero.title}</h1>
          {inJelly ? (
            <p className="hero-sub" id="jellyHeroSub">Materiale sperimentale · non ufficiale · il Button resta nativo</p>
          ) : inLab && studio.area === 'preview' ? (
            <p className="hero-sub">Lo stesso Stage del Builder: verifica prima di esportare</p>
          ) : inLab ? (
            <nav className="crumbs hero-sub" aria-label="Percorso">
              {isBuilder ? (
                <>
                  <span className="visually-hidden" id="crumbType">{COMPONENTS.get(builder.doc.type)?.name ?? builder.doc.type}</span>
                  <span className="crumb-current" id="crumbComponent" aria-current="page">{builder.doc.name}</span>
                </>
              ) : (
                <span className="crumb-current" id="crumbPreset" aria-current="page">{doc.name}</span>
              )}
              <span aria-hidden="true">·</span>
              <span className="hero-status" data-kind={save.kind}>{railSave}</span>
            </nav>
          ) : hero.sub ? <p className="hero-sub">{hero.sub}</p> : null}
        </div>
        <div className="studio-contextbar">
          <ProjectSwitch session={session} />
        {(page === 'assets' || page === 'settings' || flow) && (
          <>
            <div className="header-actions">
              <button className="header-button primary" id="exportOpen" type="button" disabled={!hasProject} onClick={() => session.openFlow('export')}>
                <Ic name="upload" />
                Esporta
              </button>
            </div>
          </>
        )}

        {inJelly && (
          <div className="header-actions">
            <button className="tb-icon-button column-toggle" id="toggleLeft" type="button" aria-pressed={layout.left} aria-label="Mostra i preset" title="Preset e documento" onClick={() => session.toggleColumn('left')}>
              <Icon name="left" />
            </button>
            <button className="tb-icon-button column-toggle" id="toggleRight" type="button" aria-pressed={layout.right} aria-label="Mostra l’inspector" title="Inspector" onClick={() => session.toggleColumn('right')}>
              <Icon name="right" />
            </button>
            <button className="header-button panel-toggle" id="panelToggle" type="button" ref={toggle} aria-label="Regolazioni" aria-expanded={layout.drawer} aria-controls="jl-controls" onClick={() => session.setDrawer(!layout.drawer)}>
              <Ic name="gear" />
              <span className="panel-toggle-label">Regolazioni</span>
            </button>
          </div>
        )}
        {inLab && (
          <>
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
        </div>
      </header>
      )}

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
      {inLibrary && <div className="page-scroll" id="main" tabIndex={-1}><StudioLibrary session={session} /></div>}
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

      <main className="lab" id="lab" hidden={!inLab} data-studio-area={studio.area} style={{ ['--side-w' as string]: `${layout.left ? studio.leftWidth : 0}px`, ['--panel-w' as string]: `${layout.right ? studio.rightWidth : 0}px` }} data-left={layout.left ? 'open' : 'closed'} data-right={layout.right ? 'open' : 'closed'}>
        <Preview session={session} />
        <PanelResize side="left" visible={layout.left} /><PanelResize side="right" visible={layout.right} />
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
            {studio.area === 'preview' ? <TestInspector session={session} /> : isBuilder ? <Inspector session={session} /> : <Properties session={session} />}
          </aside>
        </div>
      </main>

      {jellyOpened && (
        <Suspense fallback={<main className="lab" id="jelly-lab" hidden={!inJelly}><section className="preview"><p className="hint" role="status">Caricamento di Jello…</p></section></main>}>
          <JellyMain session={session} active={inJelly} />
        </Suspense>
      )}

      <footer className="lab-footer" hidden={!inLab && !inJelly}>
        <p className="status-chips" id="statusChips" aria-live="polite">
          {inJelly && <span className="chip" data-kind="warn">Jello · sperimentale · SVG / CSS</span>}
          {!inJelly && report && (
            <>
              <span className="chip" data-kind={scene ? 'webgl2' : report.main.effective}>
                {solid ? 'Solid · renderer CSS' : scene ? `Backend: ${report.scene?.effective === 'webgl2' ? 'WebGL2' : 'CSS su texture'}` : `Percorso: ${PATH_LABEL[report.main.effective]}`}
              </span>
              {solid ? null : scene ? (
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
          {inJelly ? 'Renderer M6.3 · archivio separato' : e
            ? scene && report!.scene
              ? `${e.engine}${e.major ? ` ${e.major}` : ''} · WebGL2 · ${report!.scene.counters.frames} frame · ${report!.scene.counters.mapUploads} mappe caricate`
              : `${e.engine}${e.major ? ` ${e.major}` : ''} · ${report!.stats.surfaces} superfici · ${report!.stats.mapRegenerations} mappe generate`
            : ''}
        </p>
      </footer>
      </div>
      </div>
      {createOpen && <CreateDialog session={session} onClose={() => setCreateOpen(false)} />}
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
