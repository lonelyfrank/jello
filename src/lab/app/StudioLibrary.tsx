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
  const entries: Entry[] = [...components.map((item): Entry => ({ kind: 'component', item })), ...materials.map((item): Entry => ({ kind: 'material', item }))];
  const matchCategory = (entry: Entry, id: Category) => id === 'all' || (id === 'materials' && entry.kind === 'material') || (id === 'button' && entry.kind === 'component' && entry.item.doc.type === 'button') || (id === 'navigation' && entry.kind === 'component' && entry.item.doc.type.includes('navbar')) || (id === 'mine' && entry.item.origin === 'user') || (id === 'favorites' && project?.favorites.includes(entry.item.id));
  const categories: { id: Category; label: string; icon: IcName }[] = [
    { id: 'all', label: 'Tutti gli elementi', icon: 'grid' }, { id: 'button', label: 'Buttons', icon: 'box' },
    { id: 'navigation', label: 'Navigation', icon: 'layers' }, { id: 'materials', label: 'Materials', icon: 'drop' },
    { id: 'mine', label: 'Le mie creazioni', icon: 'user' }, { id: 'favorites', label: 'Preferiti', icon: 'heart' },
  ];
  const shown = entries.filter((entry) => matchCategory(entry, category) && (family === 'all' || (entry.kind === 'material' ? entry.item.doc.family : entry.item.doc.material.family) === family) && `${entry.item.name} ${entry.kind === 'material' ? entry.item.doc.family : entry.item.doc.type}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const open = (entry: Entry) => {
    if (entry.kind === 'material') { session.openMaterial(entry.item.id); openStudio(session, 'material'); }
    else { session.openComponent(entry.item.id); openStudio(session, 'builder'); }
  };
  return <div className="studio-library-layout" id="studioLibrary">
    <aside className="catalog-sidebar" aria-label="Categorie della libreria">
      <p className="eyebrow">La tua collezione</p>
      {categories.map((c) => <button key={c.id} type="button" className="nav-i" aria-pressed={category === c.id} onClick={() => setCategory(c.id)}><Ic name={c.icon} />{c.label}<span className="count-badge">{entries.filter((e) => matchCategory(e, c.id)).length}</span></button>)}
      <div className="catalog-note"><Ic name="info" /><p>I template Jello sono separati dalle tue creazioni. Le anteprime usano il runtime CSS reale.</p></div>
    </aside>
    <main className="catalog-main">
      <div className="studio-page-heading"><div><p className="eyebrow">LIBRARY / {project?.name}</p><h1>Una forma per ogni idea.</h1><p className="muted">Materiali e componenti, pronti per il tuo prossimo progetto.</p></div><button type="button" className="button primary" onClick={() => session.openFlow('component')}><Ic name="plus" />Crea componente</button></div>
      <div className="catalog-toolbar"><label className="search"><Ic name="search" /><span className="visually-hidden">Cerca nella Library</span><input type="search" id="catalogSearch" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cerca materiali e componenti…" /></label><label className="catalog-family"><span>Materiale</span><select value={family} onChange={(e) => setFamily(e.target.value)}><option value="all">Tutti</option><option value="glass">Glass</option><option value="solid">Solid</option></select></label><span className="muted small" role="status">{shown.length} elementi</span></div>
      <div className="catalog-grid">{shown.map((entry) => {
        const item = entry.item;
        const favorite = project?.favorites.includes(item.id) ?? false;
        const materialFamily = entry.kind === 'material' ? entry.item.doc.family : entry.item.doc.material.family;
        return <article key={`${entry.kind}-${item.id}`} className="card catalog-card" data-catalog-kind={entry.kind}>
          {entry.kind === 'component' ? <RuntimeThumbnail doc={entry.item.doc} /> : <div className="catalog-material"><MaterialThumbnail runtime doc={entry.item.doc} /></div>}
          <button type="button" className="icon-btn catalog-favorite" aria-label={`${favorite ? 'Rimuovi' : 'Aggiungi'} ${item.name} ${favorite ? 'dai' : 'ai'} preferiti`} aria-pressed={favorite} onClick={() => session.projects.toggleFavorite(item.id)}><Ic name="heart" /></button>
          <div className="catalog-card-info"><h2>{item.name}</h2><p className="muted small">{entry.kind === 'component' ? COMPONENTS.get(entry.item.doc.type)?.name : 'Materiale'} · {materialFamily === 'glass' ? 'Glass' : 'Solid'} · {item.origin === 'user' ? 'Personale' : 'Jello'}</p><p className="catalog-compat small">{entry.kind === 'component' && entry.item.doc.type === 'desktop-navbar' ? 'Builder · React / Vanilla / JSON' : 'Runtime CSS · anteprima'}</p>
          <div className="button-row"><button type="button" className="button small" onClick={() => open(entry)}>Apri<Ic name="arrowRight" size={14} /></button><button type="button" className="icon-btn" aria-label={`Duplica ${item.name}`} onClick={async () => { open(entry); if (entry.kind === 'material') await session.duplicate(); else await session.duplicateComponent(); }}><Ic name="copy" size={16} /></button></div></div>
        </article>;
      })}</div>
      {!shown.length && <EmptyState icon="search" title="Nessun elemento trovato">Cambia categoria, materiale o termine di ricerca.</EmptyState>}
    </main>
  </div>;
}
