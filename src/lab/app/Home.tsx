import { useState, type ReactNode } from 'react';
import { COMPONENTS } from '../../components';
import { RuntimeThumbnail } from './RuntimeThumbnail';
import { GlobalSearch } from './Search';
import { openStudio } from './StudioNav';
import type { ProjectDoc } from '../../project/types';
import type { LabSession } from '../session';
import { useLab } from '../store';
import { MaterialThumbnail } from './Library';
import { Ic, type IcName } from './ui';

const BASE = import.meta.env.BASE_URL;

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
          <span className="project-pills" aria-hidden="true"><span className="pp-glass wide" /><span className="pp-row"><span className="pp-glass" /><span className="pp-solid" /></span></span>
        </span>
        <span className="project-meta">
          <span className="project-name">{p.name}</span>
          <span className="muted small">
            {counts.components} {counts.components === 1 ? 'componente' : 'componenti'} · {counts.materials} {counts.materials === 1 ? 'materiale' : 'materiali'}
          </span>
          <time className="project-date small muted" dateTime={p.updatedAt}>Modificato il {new Date(p.updatedAt).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })}</time>
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

type Mode = 'home' | 'tpl' | 'proj';
type Filter = 'all' | 'comp' | 'mat' | 'proj';

const MODES: { id: Mode; label: string; icon: IcName }[] = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'tpl', label: 'Template', icon: 'layers' },
  { id: 'proj', label: 'Progetti', icon: 'folder' },
];
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Tutti' },
  { id: 'comp', label: 'Componenti' },
  { id: 'mat', label: 'Materiali' },
  { id: 'proj', label: 'Progetti' },
];

interface Category {
  key: string;
  label: string;
  icon: IcName;
  bg: string;
  /** Needs an active project. */
  project: boolean;
  soon?: boolean;
  id?: string;
  run(): void;
}

/** Shortcuts of the Home, as in the design: each opens something that already exists in the Studio. */
function useCategories(session: LabSession): Category[] {
  const library = useLab((s) => s.library);
  const preset = (family: string) => library.find((m) => m.origin === 'builtin' && m.doc.family === family);
  const template = (id: string) => () => { session.openComponent(id); openStudio(session, 'builder'); };
  const material = (family: string) => () => {
    const m = preset(family);
    if (m) session.openMaterial(m.id);
    openStudio(session, 'material');
  };
  return [
    { key: 'new', label: 'Nuovo progetto', icon: 'file', bg: 'linear-gradient(135deg, #a78bfa, #6d2bf0)', project: false, run: () => session.openFlow('wizard') },
    { key: 'mnav', label: 'Mobile Navbar', icon: 'monitor', bg: 'linear-gradient(135deg, #7aa2ff, #3b5bf5)', project: true, run: template('mobile-navbar') },
    { key: 'dnav', label: 'Desktop Navbar', icon: 'monitor', bg: 'linear-gradient(135deg, #5ee6d0, #14a38b)', project: true, run: template('desktop-navbar') },
    { key: 'btn', label: 'Button', icon: 'box', bg: 'linear-gradient(135deg, #ff9bb8, #f0457e)', project: true, run: template('button') },
    { key: 'glass', label: 'Glass', icon: 'drop', bg: 'radial-gradient(circle at 34% 28%, #fff 0 10%, #9aa6e8 45%, #3a3a9a 100%)', project: true, run: material('glass') },
    { key: 'solid', label: 'Solid', icon: 'box', bg: 'linear-gradient(135deg, #b79bff, #5a3aa0)', project: true, run: material('solid') },
    { key: 'jelly', label: 'Jelly', icon: 'drop', bg: 'radial-gradient(circle at 34% 28%, #ffd0f6 0 8%, #f04fd8 40%, #8a22c8 100%)', project: true, soon: true, run: () => undefined },
    { key: 'asset', label: 'Asset', icon: 'palette', bg: 'conic-gradient(from 200deg, #ff4fd8, #6a5cff, #2ec5ff, #8cffc8, #ffb04f, #ff4fd8)', project: true, run: () => session.setPage('assets') },
    { key: 'test', label: 'Preview & Test', icon: 'eye', bg: 'linear-gradient(135deg, #8b5cf6, #4c1d95)', project: true, run: () => openStudio(session, 'preview') },
    { key: 'export', label: 'Export', icon: 'upload', bg: 'linear-gradient(135deg, #f472b6, #9d174d)', project: true, run: () => openStudio(session, 'export') },
    { key: 'import', label: 'Importa .jello', icon: 'download', bg: 'linear-gradient(135deg, #60a5fa, #1e40af)', project: false, id: 'headerImport', run: () => session.openFlow('import') },
    { key: 'lib', label: 'Library', icon: 'grid', bg: 'linear-gradient(135deg, #3a2e5e, #261c44)', project: true, run: () => openStudio(session, 'library') },
  ];
}

export function HomeCategories({ session }: { session: LabSession }) {
  const hasProject = useLab((s) => s.projectId !== null);
  const cats = useCategories(session);
  return (
    <section className="home-cats" aria-label="Crea qualcosa">
      {cats.map((c) => {
        const off = c.soon || (c.project && !hasProject);
        return (
          <button key={c.key} type="button" className="cat" id={c.id} aria-disabled={off || undefined} title={c.soon ? 'In sviluppo: non ancora disponibile' : c.project && !hasProject ? 'Serve un progetto' : undefined} onClick={() => !off && c.run()} style={off ? { opacity: c.soon ? 0.6 : 0.5 } : undefined}>
            <span className="cat-ic" style={{ background: c.bg }}>
              <Ic name={c.icon} size={24} />
              {c.soon && <span className="cat-soon">presto</span>}
            </span>
            {c.label}
          </button>
        );
      })}
    </section>
  );
}

/** Big opening banner of the Home: title, view tabs, project switch and the global search. */
export function HomeHero({ session, mode, setMode }: { session: LabSession; mode?: Mode; setMode?: (m: Mode) => void }) {
  const projects = useLab((s) => s.projects);
  const projectId = useLab((s) => s.projectId);
  return (
    <section className="home-hero" aria-label="Crea">
      <span className="hero-bubble hb1" aria-hidden="true" />
      <span className="hero-bubble hb2" aria-hidden="true" />
      <img className="home-hero-jelly" src={`${BASE}brand/jello-mark-192.png`} alt="" aria-hidden="true" />
      <p className="hero-eyebrow home-eyebrow">BENVENUTO NEL TUO SPAZIO CREATIVO</p>
      <h1 className="home-title" id="homeTitle">Che cosa vuoi creare oggi?</h1>
      <div className="home-modes">
        {mode && setMode && (
          <div role="tablist" aria-label="Vista" className="home-tabs">
            {MODES.map((m) => (
              <button key={m.id} type="button" role="tab" className="pill" aria-selected={mode === m.id} onClick={() => setMode(m.id)}>
                <Ic name={m.icon} size={16} />{m.label}
              </button>
            ))}
          </div>
        )}
        {projects.length > 0 && (
          <label className="project-switch pill">
            <span className="visually-hidden">Progetto attivo</span>
            <Ic name="folder" size={16} />
            <select id="projectSwitch" value={projectId ?? ''} onChange={(e) => session.switchProject(e.target.value)}>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        )}
      </div>
      <GlobalSearch session={session} />
    </section>
  );
}

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

/** One element of the Home grid: runtime thumbnail, name, family chip, line of context. */
function ElementCard({ thumb, name, family, meta, onOpen }: { thumb: ReactNode; name: string; family: 'glass' | 'solid'; meta: string; onOpen(): void }) {
  return (
    <button type="button" className="home-card" onClick={onOpen} aria-label={`${name}, ${meta}`}>
      <span className="home-thumb">{thumb}</span>
      <span className="home-card-name">{name}</span>
      <span className="home-card-meta"><span className="fam" data-family={family}>{family === 'glass' ? 'Glass' : 'Solid'}</span><span>{meta}</span></span>
    </button>
  );
}

export function Home({ session }: { session: LabSession }) {
  const projects = useLab((s) => s.projects);
  const projectId = useLab((s) => s.projectId);
  const library = useLab((s) => s.library);
  const components = useLab((s) => s.components);
  const [mode, setMode] = useState<Mode>('home');
  const [filter, setFilter] = useState<Filter>('all');
  const active = projects.find((p) => p.id === projectId) ?? null;

  if (!active) return <HomeEmpty session={session} />;

  const pick = (m: Mode) => { setMode(m); setFilter(m === 'proj' ? 'proj' : 'all'); };
  const sortedProjects = [...projects].sort((x, y) => y.updatedAt.localeCompare(x.updatedAt));
  const componentCard = (c: (typeof components)[number], meta: string) => (
    <ElementCard key={`c-${c.id}`} name={c.name} family={c.doc.material.family === 'solid' ? 'solid' : 'glass'} meta={meta}
      thumb={<RuntimeThumbnail doc={c.doc} />} onOpen={() => { session.openComponent(c.id); openStudio(session, 'builder'); }} />
  );
  const materialCard = (m: (typeof library)[number], meta: string) => (
    <ElementCard key={`m-${m.id}`} name={m.name} family={m.doc.family === 'solid' ? 'solid' : 'glass'} meta={meta}
      thumb={<MaterialThumbnail runtime doc={m.doc} />} onOpen={() => { session.openMaterial(m.id); openStudio(session, 'material'); }} />
  );

  let heading = 'Continua a creare';
  let cards: ReactNode[] = [];
  if (mode === 'tpl') {
    heading = 'Template e preset Jello';
    cards = [
      ...components.filter((c) => c.origin === 'template').map((c) => componentCard(c, `Template ufficiale · ${COMPONENTS.get(c.doc.type)?.name ?? c.doc.type}`)),
      ...library.filter((m) => m.origin === 'builtin').map((m) => materialCard(m, 'Preset Jello')),
    ];
  } else {
    const mineC = components.filter((c) => c.origin === 'user').sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
    const mineM = library.filter((m) => m.origin === 'user').sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
    if (mode === 'proj') heading = 'I tuoi progetti';
    if (filter === 'all' || filter === 'proj') cards.push(...sortedProjects.map((p, i) => <ProjectCard key={`p-${p.id}`} p={p} i={i} session={session} active={p.id === projectId} />));
    if (filter === 'all' || filter === 'comp') cards.push(...mineC.map((c) => componentCard(c, `Componente · ${fmtDate(c.updatedAt)}`)));
    if (filter === 'all' || filter === 'mat') cards.push(...mineM.map((m) => materialCard(m, `Materiale · ${fmtDate(m.updatedAt)}`)));
  }

  return (
    <div className="home studio-home" id="homePage">
      <main className="home-main" aria-label="Home">
        <HomeHero session={session} mode={mode} setMode={pick} />
        <HomeCategories session={session} />
        <section className="home-section" aria-labelledby="h-recent">
          <div className="section-head">
            <h2 id="h-recent">{heading}</h2>
            <div className="section-tools">
              {mode !== 'tpl' && (
                <div role="group" aria-label="Filtro" className="home-filters">
                  {FILTERS.map((f) => <button key={f.id} type="button" className="chip-filter" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>{f.label}</button>)}
                </div>
              )}
              <button type="button" className="link" onClick={() => openStudio(session, 'library')}>Mostra tutto</button>
            </div>
          </div>
          <div className="home-grid">
            {cards}
            {mode !== 'tpl' && (filter === 'all' || filter === 'proj') && (
              <button type="button" className="project-new" onClick={() => session.openFlow('wizard')}>
                <span className="plus-disc"><Ic name="plus" /></span>
                Nuovo progetto
              </button>
            )}
          </div>
          {cards.length === 0 && <p className="muted home-empty-note">Ancora niente qui. Crea un componente o un materiale dalle scorciatoie.</p>}
        </section>
      </main>
    </div>
  );
}

/** A project from the Jello kit; on failure nothing was stored and the notice says why. */
async function createKit(session: LabSession): Promise<boolean> {
  try {
    await session.projects.create({ name: 'Il mio progetto', platform: 'web', previewTheme: 'system', start: 'kit' });
    return true;
  } catch (e) {
    session.notify(`Progetto non creato: ${(e as Error).message}`);
    return false;
  }
}

/** First launch: three ways to start, and the file drop area. */
export function HomeEmpty({ session }: { session: LabSession }) {
  const [over, setOver] = useState(false);
  const start = async () => {
    if (!(await createKit(session))) return;
    session.setOption('scene', 'jelly-macro');
    session.setPage('lab', 'material');
  };
  return (
    <div className="home studio-home" id="homePage" data-empty="true">
      <main className="home-main empty-main" aria-label="Primo avvio">
        <HomeHero session={session} />
        <HomeCategories session={session} />
        <h1>Crea la tua prima componente</h1>
        <button type="button" className="button primary" id="homeComponentWizard" onClick={() => session.openFlow('component')}>Crea componente guidata</button>
        <p className="muted lead">Il tuo Workspace è vuoto. Crea un progetto o esplora il kit Jello: nessun progetto dimostrativo viene aggiunto senza la tua scelta.</p>
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
        <DemoGallery session={session} />
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


function DemoGallery({ session }: { session: LabSession }) {
  const materials = useLab((s) => s.library);
  const create = async (id: string) => {
    if (!(await createKit(session))) return;
    session.openMaterial(id);
    openStudio(session, 'material');
  };
  return <section className="home-section demo-gallery"><div className="section-head"><h2>Material Gallery</h2><span className="state-chip" data-kind="accent">Demo Jello · runtime CSS</span></div><p className="muted small">Preset inclusi. Selezionane uno per iniziare un progetto con il kit Jello. Jelly è un’ispirazione visiva del brand, il suo renderer è in sviluppo.</p><div className="tile-grid">{materials.filter((m) => m.origin === 'builtin').slice(0, 6).map((m) => <button key={m.id} type="button" className="card mat-tile" onClick={() => void create(m.id)}><MaterialThumbnail runtime doc={m.doc} /><span className="mat-tile-meta"><strong>{m.name}</strong><span className="muted small">{m.doc.family} · preset Jello</span></span></button>)}</div></section>;
}
