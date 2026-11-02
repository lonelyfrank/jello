import { useState } from 'react';
import { COMPONENTS } from '../../components';
import type { LabSession } from '../session';
import { useLab, type ComponentItem, type LibraryItem } from '../store';
import { MaterialThumbnail } from './Library';
import { RuntimeThumbnail } from './RuntimeThumbnail';
import { openStudio } from './StudioNav';
import { EmptyState, Ic, type IcName } from './ui';

type Category = 'all' | 'materials' | 'button' | 'navigation' | 'mine' | 'favorites';
type Entry = { kind: 'material'; item: LibraryItem } | { kind: 'component'; item: ComponentItem };

export function StudioLibrary({ session }: { session: LabSession }) {
  const materials = useLab((s) => s.library);
  const components = useLab((s) => s.components);
  const project = useLab((s) => s.projects.find((p) => p.id === s.projectId));
  const [category, setCategory] = useState<Category>('all');
  const [query, setQuery] = useState('');
  const [family, setFamily] = useState('all');
  const [pickedKey, setPickedKey] = useState<string | null>(null);
  const entries: Entry[] = [...components.map((item): Entry => ({ kind: 'component', item })), ...materials.map((item): Entry => ({ kind: 'material', item }))];
  const matchCategory = (entry: Entry, id: Category) => id === 'all' || (id === 'materials' && entry.kind === 'material') || (id === 'button' && entry.kind === 'component' && entry.item.doc.type === 'button') || (id === 'navigation' && entry.kind === 'component' && entry.item.doc.type.includes('navbar')) || (id === 'mine' && entry.item.origin === 'user') || (id === 'favorites' && project?.favorites.includes(entry.item.id));
  const categories: { id: Category; label: string; icon: IcName }[] = [
    { id: 'all', label: 'Tutti gli elementi', icon: 'grid' }, { id: 'button', label: 'Buttons', icon: 'box' },
    { id: 'navigation', label: 'Navigation', icon: 'layers' }, { id: 'materials', label: 'Materials', icon: 'drop' },
    { id: 'mine', label: 'Le mie creazioni', icon: 'user' }, { id: 'favorites', label: 'Preferiti', icon: 'heart' },
  ];
  const shown = entries.filter((entry) => matchCategory(entry, category) && (family === 'all' || (entry.kind === 'material' ? entry.item.doc.family : entry.item.doc.material.family) === family) && `${entry.item.name} ${entry.kind === 'material' ? entry.item.doc.family : entry.item.doc.type}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const keyOf = (entry: Entry) => `${entry.kind}-${entry.item.id}`;
  const selected = shown.find((entry) => keyOf(entry) === pickedKey) ?? shown[0] ?? null;
  const metaOf = (entry: Entry) => `${entry.kind === 'component' ? COMPONENTS.get(entry.item.doc.type)?.name : 'Materiale'} · ${(entry.kind === 'material' ? entry.item.doc.family : entry.item.doc.material.family) === 'glass' ? 'Glass' : 'Solid'} · ${entry.item.origin === 'user' ? 'Personale' : 'Jello'}`;
  const open = (entry: Entry) => {
    if (entry.kind === 'material') { session.openMaterial(entry.item.id); openStudio(session, 'material'); }
    else { session.openComponent(entry.item.id); openStudio(session, 'builder'); }
  };
  /** The copy appears in the Library and becomes the selection; the page does not change. */
  const duplicate = async (entry: Entry) => {
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
    all: 'linear-gradient(135deg, #3a2e5e, #261c44)', button: 'linear-gradient(135deg, #ff9bb8, #f0457e)', navigation: 'linear-gradient(135deg, #7aa2ff, #3b5bf5)',
    materials: 'radial-gradient(circle at 34% 28%, #fff 0 10%, #9aa6e8 45%, #3a3a9a 100%)', mine: 'linear-gradient(135deg, #a78bfa, #6d2bf0)', favorites: 'linear-gradient(135deg, #f472b6, #9d174d)',
  };
  const families: { id: string; label: string; dot: string }[] = [
    { id: 'all', label: 'Tutti', dot: 'conic-gradient(#9aa6e8, #b79bff, #9aa6e8)' }, { id: 'glass', label: 'Glass', dot: 'radial-gradient(circle at 34% 28%, #fff 0 12%, #9aa6e8 50%, #3a3a9a)' }, { id: 'solid', label: 'Solid', dot: 'linear-gradient(135deg, #b79bff, #5a3aa0)' },
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
        const item = entry.item;
        const favorite = project?.favorites.includes(item.id) ?? false;
        const materialFamily = entry.kind === 'material' ? entry.item.doc.family : entry.item.doc.material.family;
        // Selection is the name button (stretched over the card by CSS); the card itself has no handler,
        // so the favourite, «Apri» and «Duplica» buttons never also select or act twice.
        return <article key={keyOf(entry)} className="card catalog-card" data-catalog-kind={entry.kind} data-selected={selected ? keyOf(entry) === keyOf(selected) : undefined}>
          {entry.kind === 'component' ? <RuntimeThumbnail doc={entry.item.doc} /> : <div className="catalog-material"><MaterialThumbnail runtime doc={entry.item.doc} /></div>}
          <button type="button" className="icon-btn catalog-favorite" aria-label={`${favorite ? 'Rimuovi' : 'Aggiungi'} ${item.name} ${favorite ? 'dai' : 'ai'} preferiti`} aria-pressed={favorite} onClick={() => session.projects.toggleFavorite(item.id)}><Ic name="heart" /></button>
          <div className="catalog-card-info"><h2><button type="button" className="catalog-pick" aria-pressed={selected ? keyOf(entry) === keyOf(selected) : false} onClick={() => setPickedKey(keyOf(entry))}>{item.name}</button></h2><p className="muted small">{entry.kind === 'component' ? COMPONENTS.get(entry.item.doc.type)?.name : 'Materiale'} · {materialFamily === 'glass' ? 'Glass' : 'Solid'} · {item.origin === 'user' ? 'Personale' : 'Jello'}</p><p className="catalog-compat small">{entry.kind === 'component' && entry.item.doc.type === 'desktop-navbar' ? 'Builder · React / Vanilla / JSON' : 'Runtime CSS · anteprima'}</p>
          <div className="button-row"><button type="button" className="button small" onClick={() => open(entry)}>Apri<Ic name="arrowRight" size={14} /></button><button type="button" className="icon-btn" aria-label={`Duplica ${item.name}`} onClick={() => void duplicate(entry)}><Ic name="copy" size={16} /></button></div></div>
        </article>;
      })}</div>
      {!shown.length && <EmptyState icon="search" title="Nessun elemento trovato">Cambia categoria, materiale o termine di ricerca.</EmptyState>}
    </main>
    <aside className="catalog-preview" aria-label="Anteprima dell’elemento" id="catalogPreview">
      <h2>Anteprima</h2>
      {selected ? <>
        <div className="catalog-preview-stage">{selected.kind === 'component' ? <RuntimeThumbnail doc={selected.item.doc} /> : <MaterialThumbnail runtime doc={selected.item.doc} />}</div>
        <div className="catalog-preview-meta"><strong>{selected.item.name}</strong><span className="muted small">{metaOf(selected)}</span></div>
        <div className="catalog-preview-actions">
          <button type="button" className="button primary" onClick={() => open(selected)}><Ic name="arrowRight" />Apri nello Studio</button>
          <button type="button" className="button" onClick={() => { open(selected); session.setExportOpen(true); }}><Ic name="upload" />Esporta…</button>
        </div>
      </> : <p className="muted small">Seleziona un elemento per vederne l’anteprima.</p>}
    </aside>
    </div>
  </div>;
}
