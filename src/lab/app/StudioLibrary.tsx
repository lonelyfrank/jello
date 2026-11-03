import { lazy, Suspense, useState } from 'react';
import { COMPONENTS } from '../../components';
import { availabilityLabel, catalogByFamily, entryMeta, familyLabel, type MaterialCatalogEntry } from '../../model/catalog';
import type { LabSession } from '../session';
import { setStudioPreferences, useStudioPreferences } from '../studio-preferences';
import { useLab, type ComponentItem, type LibraryItem } from '../store';
import { isDiagnosticId, originLabel, presentItem } from './catalog-ui';
import { MaterialThumbnail } from './Library';
import { RuntimeThumbnail } from './RuntimeThumbnail';
import { openStudio } from './StudioNav';
import { EmptyState, Ic, type IcName } from './ui';

/** The experimental Jello preview is a separate chunk: the Library links no Jelly module, it loads one only when asked to show it. */
const JellyCatalogPreview = lazy(() => import('../experimental/jelly/JellyCatalogPreview'));

type Category = 'all' | 'materials' | 'button' | 'navigation' | 'mine' | 'favorites' | 'diagnostic';
/** `experimental`: a catalog entry of the Jello family, not a stored material; it is opened in the Jello lab, never in the stable editor. */
type Entry = { kind: 'material'; item: LibraryItem } | { kind: 'component'; item: ComponentItem } | { kind: 'experimental'; entry: MaterialCatalogEntry };

const idOf = (e: Entry) => (e.kind === 'experimental' ? e.entry.presetId : e.item.id);
const nameOf = (e: Entry) => (e.kind === 'experimental' ? e.entry.displayName : e.item.name);
const familyOf = (e: Entry): string => (e.kind === 'experimental' ? e.entry.familyId : e.kind === 'material' ? e.item.doc.family : e.item.doc.material.family);

export function StudioLibrary({ session }: { session: LabSession }) {
  const materials = useLab((s) => s.library);
  const components = useLab((s) => s.components);
  const project = useLab((s) => s.projects.find((p) => p.id === s.projectId));
  const [category, setCategory] = useState<Category>('all');
  const [query, setQuery] = useState('');
  const [family, setFamily] = useState('all');
  const [pickedKey, setPickedKey] = useState<string | null>(null);
  const showDiagnostics = useStudioPreferences().diagnostics;
  // One source of data, several filtered views: stable materials and components, plus the experimental Jello catalog entries.
  // Experimental entries appear only when the Jello family is chosen; diagnostic configurations only in advanced mode.
  const experimental = catalogByFamily('jelly').map((entry): Entry => ({ kind: 'experimental', entry }));
  const stable: Entry[] = [...components.map((item): Entry => ({ kind: 'component', item })), ...materials.map((item): Entry => ({ kind: 'material', item }))];
  const entries: Entry[] = family === 'jelly' ? experimental : stable.filter((e) => e.kind !== 'material' || !isDiagnosticId(e.item.id) || e.item.origin !== 'builtin');
  const diagnostics: Entry[] = family === 'jelly' || !showDiagnostics ? [] : stable.filter((e) => e.kind === 'material' && e.item.origin === 'builtin' && isDiagnosticId(e.item.id));
  const matchCategory = (entry: Entry, id: Category) => {
    if (id === 'diagnostic') return diagnostics.includes(entry);
    if (entry.kind === 'experimental') return id === 'all' || id === 'materials';
    return id === 'all' || (id === 'materials' && entry.kind === 'material') || (id === 'button' && entry.kind === 'component' && entry.item.doc.type === 'button') || (id === 'navigation' && entry.kind === 'component' && entry.item.doc.type.includes('navbar')) || (id === 'mine' && entry.item.origin === 'user') || (id === 'favorites' && project?.favorites.includes(entry.item.id));
  };
  const categories: { id: Category; label: string; icon: IcName }[] = [
    { id: 'all', label: 'Tutti gli elementi', icon: 'grid' }, { id: 'button', label: 'Buttons', icon: 'box' },
    { id: 'navigation', label: 'Navigation', icon: 'layers' }, { id: 'materials', label: 'Materiali', icon: 'drop' },
    { id: 'mine', label: 'Le mie creazioni', icon: 'user' }, { id: 'favorites', label: 'Preferiti', icon: 'heart' },
    ...(showDiagnostics && family !== 'jelly' ? [{ id: 'diagnostic' as const, label: 'Diagnostica', icon: 'eye' as IcName }] : []),
  ];
  const visibleEntries = category === 'diagnostic' ? diagnostics : entries;
  const shown = visibleEntries.filter((entry) => matchCategory(entry, category) && (family === 'all' || familyOf(entry) === family) && `${nameOf(entry)} ${familyLabel(familyOf(entry))} ${entry.kind === 'component' ? entry.item.doc.type : entry.kind === 'experimental' ? entryMeta(entry.entry) : presentItem(entry.item).meta}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const keyOf = (entry: Entry) => `${entry.kind}-${idOf(entry)}`;
  const selected = shown.find((entry) => keyOf(entry) === pickedKey) ?? shown[0] ?? null;
  const metaOf = (entry: Entry): string => {
    if (entry.kind === 'experimental') return `Materiale sperimentale · ${entryMeta(entry.entry)}`;
    if (entry.kind === 'component') return `${COMPONENTS.get(entry.item.doc.type)?.name} · ${familyLabel(entry.item.doc.material.family)} · ${originLabel(entry.item.origin)}`;
    return `Materiale · ${presentItem(entry.item).meta} · ${originLabel(entry.item.origin)}`;
  };
  const open = (entry: Entry) => {
    if (entry.kind === 'experimental') { openStudio(session, 'jelly'); return; }
    if (entry.kind === 'material') { session.openMaterial(entry.item.id); openStudio(session, 'material'); }
    else { session.openComponent(entry.item.id); openStudio(session, 'builder'); }
  };
  /** The copy appears in the Library and becomes the selection; the page does not change. */
  const duplicate = async (entry: Entry) => {
    if (entry.kind === 'experimental') return;
    if (entry.kind === 'material') {
      session.openMaterial(entry.item.id);
      await session.duplicate();
      setPickedKey(`material-${session.state.materialId}`);
    } else {
      session.openComponent(entry.item.id);
      await session.duplicateComponent();
      setPickedKey(`component-${session.state.builder.componentId}`);
    }
  };
  const projects = useLab((s) => s.projects);
  const projectId = useLab((s) => s.projectId);
  const catColors: Record<Category, string> = {
    diagnostic: 'linear-gradient(135deg, #64748b, #334155)', all: 'linear-gradient(135deg, #3a2e5e, #261c44)', button: 'linear-gradient(135deg, #ff9bb8, #f0457e)', navigation: 'linear-gradient(135deg, #7aa2ff, #3b5bf5)',
    materials: 'radial-gradient(circle at 34% 28%, #fff 0 10%, #9aa6e8 45%, #3a3a9a 100%)', mine: 'linear-gradient(135deg, #a78bfa, #6d2bf0)', favorites: 'linear-gradient(135deg, #f472b6, #9d174d)',
  };
  const families: { id: string; label: string; dot: string }[] = [
    { id: 'all', label: 'Tutti', dot: 'conic-gradient(#9aa6e8, #b79bff, #9aa6e8)' }, { id: 'glass', label: familyLabel('glass'), dot: 'radial-gradient(circle at 34% 28%, #fff 0 12%, #9aa6e8 50%, #3a3a9a)' }, { id: 'solid', label: familyLabel('solid'), dot: 'linear-gradient(135deg, #b79bff, #5a3aa0)' },
    { id: 'jelly', label: `${familyLabel('jelly')} · sperimentale`, dot: 'radial-gradient(circle at 34% 28%, #ffd0f6 0 8%, #f04fd8 40%, #8a22c8 100%)' },
  ];
  return <div className="studio-library" id="studioLibrary">
    <section className="home-hero lib-hero" aria-label="Cerca nella Library">
      <span className="hero-bubble hb1" aria-hidden="true" />
      <p className="hero-eyebrow home-eyebrow">LA TUA COLLEZIONE</p>
      <h1 className="home-title lib-title">Una forma per ogni idea.</h1>
      <div className="home-modes">
        <div role="group" aria-label="Materiale" className="home-tabs">
          {families.map((f) => <button key={f.id} type="button" className="pill" aria-pressed={family === f.id} onClick={() => setFamily(f.id)}><span className="pill-dot" style={{ background: f.dot }} aria-hidden="true" />{f.label}</button>)}
        </div>
        <label className="pill diagnostics-toggle"><input type="checkbox" id="showDiagnostics" checked={showDiagnostics} onChange={(e) => { setStudioPreferences({ diagnostics: e.target.checked }); if (!e.target.checked && category === 'diagnostic') setCategory('all'); }} /><span>Avanzato: diagnostica</span></label>
        {projects.length > 0 && <label className="project-switch pill"><span className="visually-hidden">Progetto attivo</span><Ic name="folder" size={16} /><select id="projectSwitch" value={projectId ?? ''} onChange={(e) => session.switchProject(e.target.value)}>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
      </div>
      <label className="lib-search"><Ic name="search" size={22} /><span className="visually-hidden">Cerca nella Library</span><input type="search" id="catalogSearch" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cerca nella Library…" /></label>
    </section>
    <section className="home-cats lib-cats" aria-label="Categorie della libreria">
      {categories.map((c) => <button key={c.id} type="button" className="cat" aria-pressed={category === c.id} onClick={() => setCategory(c.id)}><span className="cat-ic" style={{ background: catColors[c.id] }}><Ic name={c.icon} size={22} /></span><span>{c.label} <span className="muted count-badge">{entries.filter((e) => matchCategory(e, c.id)).length}</span></span></button>)}
    </section>
    <div className="lib-cols">
    <main className="catalog-main" aria-label="Elementi">
      <div className="section-head"><h2>{categories.find((c) => c.id === category)?.label}</h2><div className="section-tools"><span className="muted small" role="status">{shown.length} elementi</span><button type="button" className="button small" onClick={() => session.openFlow('component')}><Ic name="plus" size={16} />Crea componente</button></div></div>
      <div className="catalog-grid">{shown.map((entry) => {
        const name = nameOf(entry);
        const id = idOf(entry);
        const favorite = entry.kind !== 'experimental' && (project?.favorites.includes(id) ?? false);
        // Selection is the name button (stretched over the card by CSS); the card itself has no handler,
        // so the favourite, «Apri» and «Duplica» buttons never also select or act twice.
        const pick = <button type="button" className="catalog-pick" aria-pressed={selected ? keyOf(entry) === keyOf(selected) : false} onClick={() => setPickedKey(keyOf(entry))}>{name}</button>;
        if (entry.kind === 'experimental') {
          return <article key={keyOf(entry)} className="card catalog-card" data-catalog-kind="experimental" data-preset={id} data-selected={selected ? keyOf(entry) === keyOf(selected) : undefined}>
            <div className="catalog-material"><Suspense fallback={<p className="hint" role="status">Caricamento…</p>}><JellyCatalogPreview presetId={id} /></Suspense></div>
            <div className="catalog-card-info"><h2>{pick}</h2>
              <p className="muted small">{entryMeta(entry.entry)} <span className="state-chip" data-kind="warn">{availabilityLabel(entry.entry.availability)}</span></p>
              <p className="catalog-compat small">{entry.entry.description}</p>
              <p className="catalog-compat small">Solo nel laboratorio Jello · pacchetto web sperimentale</p>
              <div className="button-row"><button type="button" className="button small" onClick={() => open(entry)}>Apri nel Jello Lab<Ic name="arrowRight" size={14} /></button></div></div>
          </article>;
        }
        const info = entry.kind === 'material' ? presentItem(entry.item) : null;
        return <article key={keyOf(entry)} className="card catalog-card" data-catalog-kind={entry.kind} {...(info?.diagnostic ? { 'data-diagnostic': 'true' } : {})} data-selected={selected ? keyOf(entry) === keyOf(selected) : undefined}>
          {entry.kind === 'component' ? <RuntimeThumbnail doc={entry.item.doc} /> : <div className="catalog-material"><MaterialThumbnail runtime doc={entry.item.doc} /></div>}
          <button type="button" className="icon-btn catalog-favorite" aria-label={`${favorite ? 'Rimuovi' : 'Aggiungi'} ${name} ${favorite ? 'dai' : 'ai'} preferiti`} aria-pressed={favorite} onClick={() => session.projects.toggleFavorite(id)}><Ic name="heart" /></button>
          <div className="catalog-card-info"><h2>{pick}</h2><p className="muted small">{metaOf(entry)}{info?.diagnostic && <> <span className="state-chip" data-kind="soon">Diagnostica</span></>}</p>
            {info?.description && <p className="catalog-compat small">{info.description}</p>}
            {info?.limitations[0] && <p className="catalog-compat small">Limite: {info.limitations[0]}</p>}
            <p className="catalog-compat small">{entry.kind === 'component' && entry.item.doc.type === 'desktop-navbar' ? 'Builder · React / Vanilla / JSON' : 'Runtime CSS · anteprima'}</p>
          <div className="button-row"><button type="button" className="button small" onClick={() => open(entry)}>Apri<Ic name="arrowRight" size={14} /></button><button type="button" className="icon-btn" aria-label={`Duplica ${name}`} onClick={() => void duplicate(entry)}><Ic name="copy" size={16} /></button></div></div>
        </article>;
      })}</div>
      {!shown.length && <EmptyState icon="search" title="Nessun elemento trovato">Cambia categoria, famiglia o termine di ricerca.</EmptyState>}
    </main>
    <aside className="catalog-preview" aria-label="Anteprima dell’elemento" id="catalogPreview">
      <h2>Anteprima</h2>
      {selected ? <>
        <div className="catalog-preview-stage">{selected.kind === 'experimental' ? <Suspense fallback={<p className="hint" role="status">Caricamento…</p>}><JellyCatalogPreview presetId={selected.entry.presetId} /></Suspense> : selected.kind === 'component' ? <RuntimeThumbnail doc={selected.item.doc} /> : <MaterialThumbnail runtime doc={selected.item.doc} />}</div>
        <div className="catalog-preview-meta"><strong>{nameOf(selected)}</strong><span className="muted small">{metaOf(selected)}</span></div>
        {selected.kind === 'experimental' && <ul className="catalog-limits small muted" aria-label="Limiti">{selected.entry.limitations?.map((l) => <li key={l}>{l}</li>)}</ul>}
        {selected.kind === 'material' && presentItem(selected.item).limitations.length > 0 && <ul className="catalog-limits small muted" aria-label="Limiti">{presentItem(selected.item).limitations.map((l) => <li key={l}>{l}</li>)}</ul>}
        <div className="catalog-preview-actions">
          <button type="button" className="button primary" onClick={() => open(selected)}><Ic name="arrowRight" />{selected.kind === 'experimental' ? 'Apri nel Jello Lab' : 'Apri nello Studio'}</button>
          {selected.kind !== 'experimental' && <button type="button" className="button" onClick={() => { open(selected); session.setExportOpen(true); }}><Ic name="upload" />Esporta…</button>}
        </div>
      </> : <p className="muted small">Seleziona un elemento per vederne l’anteprima.</p>}
    </aside>
    </div>
  </div>;
}
