import { useMemo, useState } from 'react';
import { VERIFICATION } from '../../stage/verification';
import { countColors, countIcons, PLATFORM_LABEL, type ProjectDoc } from '../../project/types';
import type { LabSession } from '../session';
import { useLab } from '../store';
import { MaterialThumbnail } from './Library';
import { Ic, StateChip, type IcName } from './ui';

const BASE = import.meta.env.BASE_URL;

type NavTarget = 'home' | 'projects' | 'materials' | 'components' | 'assets' | 'export' | 'compat' | 'settings';

/** Left rail of the start pages (Home and Impostazioni). */
export function SideNav({ session, current }: { session: LabSession; current: NavTarget }) {
  const hasProject = useLab((s) => s.projectId !== null);
  const go = (t: NavTarget) => {
    if (t === 'home' || t === 'projects') session.setPage('home');
    else if (t === 'materials') session.setPage('lab', 'material');
    else if (t === 'components') session.setPage('lab', 'builder');
    else if (t === 'assets') session.setPage('assets');
    else if (t === 'export') session.openFlow('export');
    else if (t === 'compat') {
      session.setPanelTab('rendering');
      session.setPage('lab', 'material');
    } else session.setPage('settings');
  };
  const item = (t: NavTarget, icon: IcName, label: string, needsProject = false) => (
    <button key={t + label} type="button" className="nav-i" aria-current={current === t && t !== 'export' ? 'page' : undefined} disabled={needsProject && !hasProject} onClick={() => go(t)}>
      <Ic name={icon} />
      {label}
    </button>
  );
  return (
    <aside className="home-left" aria-label="Navigazione">
      {item('home', 'home', 'Home')}
      {item('projects', 'folder', 'Progetti')}
      {item('materials', 'drop', 'Materiali', true)}
      {item('components', 'box', 'Componenti', true)}
      {item('assets', 'palette', 'Asset', true)}
      {item('export', 'upload', 'Esportazioni', true)}
      <span className="grow" />
      {item('compat', 'shield', 'Compatibilità', true)}
      {item('settings', 'gear', 'Impostazioni')}
    </aside>
  );
}

function gradientOf(p: ProjectDoc, i: number): string {
  const brand = p.assets.palettes[0]?.colors ?? [];
  const pick = (n: number, fb: string) => brand[(i + n) % Math.max(1, brand.length)]?.hex ?? fb;
  const a = pick(0, '#7c4deb');
  const b = pick(1, '#e246c8');
  const c = pick(2, '#a78bfa');
  return `radial-gradient(70% 90% at 15% 20%, ${c} 0, transparent 60%), linear-gradient(120deg, ${a}, ${b})`;
}

function ProjectCard({ p, i, session, active }: { p: ProjectDoc; i: number; session: LabSession; active: boolean }) {
  const [menu, setMenu] = useState(false);
  const counts = session.projects.counts(p.id);
  const open = () => {
    session.switchProject(p.id);
    session.setPage('lab', counts.components > 0 && counts.materials === 0 ? 'builder' : 'material');
  };
  return (
    <article className="card project-card" data-active={active} aria-label={p.name}>
      <button type="button" className="project-open" onClick={open} aria-label={`Apri ${p.name}`}>
        <span className="project-thumb" style={{ background: gradientOf(p, i) }}>
          <span className="glass-pill" aria-hidden="true" />
        </span>
        <span className="project-meta">
          <span className="project-name">{p.name}</span>
          <span className="muted small">
            {counts.components} {counts.components === 1 ? 'componente' : 'componenti'} · {counts.materials} {counts.materials === 1 ? 'materiale' : 'materiali'}
          </span>
        </span>
      </button>
      <div className="project-more">
        <button type="button" className="icon-btn" aria-label={`Azioni di ${p.name}`} aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(!menu)}>
          <Ic name="dots" />
        </button>
        {menu && (
          <div className="menu" role="menu" onKeyDown={(e) => e.key === 'Escape' && setMenu(false)}>
            <button type="button" role="menuitem" onClick={() => (setMenu(false), session.setPage('lab', 'material'), session.switchProject(p.id))}>
              Apri nei Materiali
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenu(false);
                const n = window.prompt('Nome del progetto', p.name);
                if (n) session.projects.rename(p.id, n);
              }}
            >
              Rinomina…
            </button>
            <button type="button" role="menuitem" onClick={() => (setMenu(false), void session.projects.duplicate(p.id))}>
              Duplica
            </button>
            <button type="button" role="menuitem" className="danger" onClick={() => (setMenu(false), session.openConfirm({ kind: 'delete-project', id: p.id }))}>
              Elimina…
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

function ProjectRow({ p, session, active }: { p: ProjectDoc; session: LabSession; active: boolean }) {
  const counts = session.projects.counts(p.id);
  return (
    <button type="button" className="card project-row" data-active={active} onClick={() => (session.switchProject(p.id), session.setPage('lab', 'material'))}>
      <span className="project-name">{p.name}</span>
      <span className="muted small">{PLATFORM_LABEL[p.platform]}</span>
      <span className="muted small">
        {counts.components} componenti · {counts.materials} materiali
      </span>
    </button>
  );
}

export function Home({ session }: { session: LabSession }) {
  const projects = useLab((s) => s.projects);
  const projectId = useLab((s) => s.projectId);
  const library = useLab((s) => s.library);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const active = projects.find((p) => p.id === projectId) ?? null;

  if (!active) return <HomeEmpty session={session} />;

  const mine = library.filter((i) => i.origin === 'user');
  const tiles = [...mine, ...library.filter((i) => i.origin === 'builtin')].slice(0, 6);
  const a = active.assets;
  const swatches = a.palettes.flatMap((p) => p.colors).slice(0, 5);
  const icons = a.iconSets.flatMap((s) => s.icons).slice(0, 5);

  return (
    <div className="home" id="homePage">
      <SideNav session={session} current="home" />
      <main className="home-main" aria-label="Progetti">
        <section className="home-section" aria-labelledby="h-projects">
          <div className="section-head">
            <h1 id="h-projects">Progetti recenti</h1>
            <button type="button" className="button primary" onClick={() => session.openFlow('component')}>Crea componente</button>
            <div className="seg" role="group" aria-label="Vista">
              <button type="button" className="seg-b icon" aria-label="Griglia" aria-pressed={view === 'grid'} onClick={() => setView('grid')}>
                <Ic name="grid" />
              </button>
              <button type="button" className="seg-b icon" aria-label="Elenco" aria-pressed={view === 'list'} onClick={() => setView('list')}>
                <Ic name="list" />
              </button>
            </div>
          </div>
          {view === 'grid' ? (
            <div className="project-grid">
              {[...projects]
                .sort((x, y) => y.updatedAt.localeCompare(x.updatedAt))
                .map((p, i) => (
                  <ProjectCard key={p.id} p={p} i={i} session={session} active={p.id === projectId} />
                ))}
              <button type="button" className="project-new" onClick={() => session.openFlow('wizard')}>
                <span className="plus-disc">
                  <Ic name="plus" />
                </span>
                Nuovo progetto
              </button>
            </div>
          ) : (
            <div className="project-list">
              {projects.map((p) => (
                <ProjectRow key={p.id} p={p} session={session} active={p.id === projectId} />
              ))}
            </div>
          )}
        </section>

        <section className="home-section" aria-labelledby="h-mat">
          <div className="section-head">
            <h2 id="h-mat">Materiali · {active.name}</h2>
            <button type="button" className="link" onClick={() => session.setPage('lab', 'material')}>
              Apri libreria →
            </button>
          </div>
          <div className="tile-grid">
            {tiles.map((m) => (
              <button
                key={m.id}
                type="button"
                className="card mat-tile"
                onClick={() => {
                  session.openMaterial(m.id);
                  session.setPage('lab', 'material');
                }}
              >
                <MaterialThumbnail doc={m.doc} />
                <span className="mat-tile-meta">
                  <span className="mat-tile-name">{m.name}</span>
                  <span className="muted small">{m.origin === 'user' ? 'I miei' : 'Jello'}</span>
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="home-section" aria-labelledby="h-assets">
          <div className="section-head">
            <h2 id="h-assets">Asset del progetto</h2>
            <button type="button" className="link" onClick={() => session.setAssetTab('colors')}>
              Gestisci asset →
            </button>
          </div>
          <div className="asset-cards">
            <button type="button" className="card asset-card" onClick={() => session.setAssetTab('colors')}>
              <span className="asset-card-head">
                <strong>Colori</strong>
                <span className="muted">{countColors(a)}</span>
              </span>
              <span className="swatch-row" aria-hidden="true">
                {swatches.map((c) => (
                  <span key={c.id} style={{ background: c.hex }} />
                ))}
              </span>
            </button>
            <button type="button" className="card asset-card" onClick={() => session.setAssetTab('icons')}>
              <span className="asset-card-head">
                <strong>Icone</strong>
                <span className="muted">{countIcons(a)}</span>
              </span>
              <span className="icon-row" aria-hidden="true">
                {icons.map((i) => (
                  <svg key={i.id} viewBox={i.viewBox} width="22" height="22" className="asset-ic" dangerouslySetInnerHTML={{ __html: i.body }} />
                ))}
              </span>
            </button>
            <button type="button" className="card asset-card" onClick={() => session.setAssetTab('fonts')}>
              <span className="asset-card-head">
                <strong>Font</strong>
                <span className="muted">{a.fonts.length}</span>
              </span>
              <span className="font-row" aria-hidden="true">
                {a.fonts.slice(0, 3).map((f) => (
                  <span key={f.id} style={{ fontFamily: `"${f.name}", system-ui, sans-serif` }}>
                    Aa
                  </span>
                ))}
              </span>
            </button>
          </div>
        </section>
      </main>

      <aside className="home-right" aria-label="Riepilogo">
        <CompatCard session={session} />
        <section className="card quick">
          <h2>Azioni rapide</h2>
          <button type="button" className="nav-i filled" onClick={() => session.openFlow('wizard')}>
            <Ic name="plus" />
            Nuovo progetto
          </button>
          <button
            type="button"
            className="nav-i filled"
            onClick={() => {
              void session.newMaterial();
              session.setPage('lab', 'material');
            }}
          >
            <Ic name="drop" />
            Nuovo materiale
          </button>
          <button type="button" className="nav-i filled" onClick={() => session.setPage('lab', 'builder')}>
            <Ic name="box" />
            Nuova componente
          </button>
          <button type="button" className="nav-i filled" onClick={() => session.openFlow('import')}>
            <Ic name="download" />
            Importa file
          </button>
          <button type="button" className="nav-i filled" onClick={() => session.openFlow('export')}>
            <Ic name="upload" />
            Esporta progetto
          </button>
        </section>
      </aside>
    </div>
  );
}

/** The compatibility card: the committed raster records, plus what could not be run (said as such). */
export function CompatCard({ session }: { session: LabSession }) {
  const records = useMemo(() => [...VERIFICATION].sort((a, b) => a.engine.localeCompare(b.engine)), []);
  const date = records.map((r) => r.date).sort().at(-1);
  const label = (engine: string) => (engine === 'chromium' ? 'Chromium' : engine === 'firefox' ? 'Firefox' : engine === 'webkit' ? 'WebKit' : engine);
  return (
    <section className="card compat">
      <div className="section-head">
        <h2>Compatibilità</h2>
        <button
          type="button"
          className="link"
          onClick={() => {
            session.setPanelTab('rendering');
            session.setPage('lab', 'material');
          }}
        >
          Dettagli
        </button>
      </div>
      <p className="muted small">Verifiche raster del laboratorio{date ? ` (${new Date(date).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })})` : ''}.</p>
      <ul className="kv-list">
        {records.map((r) => (
          <li key={`${r.engine}-${r.mobileEmulated}`}>
            <span>
              {r.mobileEmulated ? 'Pixel 7 emulato' : `${label(r.engine)} ${r.major}`}
            </span>
            {r.mobileEmulated ? <StateChip kind="neutral">Solo emulato</StateChip> : <StateChip kind="ok">Superata</StateChip>}
          </li>
        ))}
        <li>
          <span>WebKit</span>
          <StateChip kind="warn">Non eseguibile</StateChip>
        </li>
        <li>
          <span>Safari macOS / iOS</span>
          <StateChip kind="neutral">Non verificato</StateChip>
        </li>
      </ul>
    </section>
  );
}

/** First launch: three ways to start, and the file drop area. */
export function HomeEmpty({ session }: { session: LabSession }) {
  const [over, setOver] = useState(false);
  const start = async () => {
    await session.projects.create({ name: 'Il mio progetto', platform: 'web', previewTheme: 'system', start: 'kit' });
    session.setPage('lab', 'material');
  };
  return (
    <div className="home" id="homePage" data-empty="true">
      <SideNav session={session} current="home" />
      <main className="home-main empty-main" aria-label="Primo avvio">
        <img className="empty-mark" src={`${BASE}brand/jello-mark-192.png`} alt="" width="96" height="80" />
        <h1>Crea la tua prima componente</h1>
        <button type="button" className="button primary" id="homeComponentWizard" onClick={() => session.openFlow('component')}>Crea componente guidata</button>
        <p className="muted lead">In Jello costruisci materiali, li applichi alle componenti e poi esporti componenti React o Vanilla per i tuoi progetti web e app.</p>
        <div className="start-grid">
          <button type="button" className="card start-card" onClick={() => session.openFlow('wizard')} id="startEmpty">
            <span className="plus-disc">
              <Ic name="folder" />
            </span>
            <strong>Progetto vuoto</strong>
            <span className="muted">Scegli piattaforma e asset iniziali, poi crei i materiali.</span>
          </button>
          <button type="button" className="card start-card" onClick={() => void start()} id="startKit">
            <span className="plus-disc">
              <Ic name="drop" />
            </span>
            <strong>Parti da un preset Jello</strong>
            <span className="muted">Glass, Satinato o Lente: valori equilibrati da modificare.</span>
          </button>
          <button type="button" className="card start-card" onClick={() => session.openFlow('import')} id="startImport">
            <span className="plus-disc">
              <Ic name="download" />
            </span>
            <strong>Importa un file</strong>
            <span className="muted">Un JSON jello-glass o un pacchetto .jello esportato dal laboratorio.</span>
          </button>
        </div>
        <div
          className="drop-area"
          data-over={over}
          onDragOver={(e) => (e.preventDefault(), setOver(true))}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            session.openFlow('import', [...e.dataTransfer.files]);
          }}
        >
          <Ic name="upload" size={20} />
          <span>Oppure trascina qui un file .json o .jello</span>
          <span className="muted small">Formati accettati: jello-material v2 (Glass/Solid), jello-glass v1, jello-component-definition, jello-project</span>
        </div>
        <ol className="how-steps">
          <li>
            <span className="step-n">1</span>Crea un materiale
          </li>
          <li>
            <span className="step-n">2</span>Applicalo a una componente
          </li>
          <li>
            <span className="step-n">3</span>Esporta il progetto
          </li>
        </ol>
      </main>
    </div>
  );
}
