import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { COMPONENTS } from '../../components';
import { CUSTOM_LIMITS } from '../../stage/view';
import type { LabSession } from '../session';
import { useLab } from '../store';
import { presentItem } from './catalog-ui';
import { MaterialThumbnail } from './Library';
import { RuntimeThumbnail } from './RuntimeThumbnail';
import { openStudio } from './StudioNav';
import { Ic, type IcName } from './ui';

type Cat = 'perte' | 'comp' | 'nav' | 'mat' | 'preset' | 'asset' | 'code' | 'custom' | 'import';

const CATS: { id: Cat; label: string; icon: IcName; color: string }[] = [
  { id: 'perte', label: 'Per te', icon: 'star', color: 'linear-gradient(135deg, #8b5cf6, #e64bd6)' },
  { id: 'comp', label: 'Componenti', icon: 'box', color: '#e0569b' },
  { id: 'nav', label: 'Navigazione', icon: 'layers', color: '#7c4deb' },
  { id: 'mat', label: 'Materiali', icon: 'drop', color: '#c2398f' },
  { id: 'preset', label: 'Preset inclusi', icon: 'star', color: '#b4780f' },
  { id: 'asset', label: 'Asset', icon: 'palette', color: '#2f8f6a' },
  { id: 'code', label: 'Da codice / JSON', icon: 'code', color: '#2f6ea8' },
  { id: 'custom', label: 'Dimensioni personalizzate', icon: 'monitor', color: '#5b4e7e' },
  { id: 'import', label: 'Importa', icon: 'upload', color: '#5b4e7e' },
];

const SIZE_PRESETS: [string, number, number][] = [['Telefono · 390 × 844', 390, 844], ['Tablet · 768 × 1024', 768, 1024], ['Desktop · 1280 × 800', 1280, 800], ['WebView Android · 412 × 915', 412, 915]];

interface Item {
  id: string;
  name: string;
  sub: string;
  kw: string;
  /** Needs an active project. */
  project: boolean;
  soon?: boolean;
  tag?: string;
  thumb: ReactNode;
  run(): void;
}

const swatch = (background: string, className = ''): ReactNode => <span className={`create-swatch ${className}`} style={{ background }} />;

/** «Crea» panel of the sidebar: what to start from, grouped like the design; every card opens something real. */
export function CreateDialog({ session, onClose }: { session: LabSession; onClose(): void }) {
  const library = useLab((s) => s.library);
  const components = useLab((s) => s.components);
  const hasProject = useLab((s) => s.projectId !== null);
  const options = useLab((s) => s.options);
  const [cat, setCat] = useState<Cat>('perte');
  const [q, setQ] = useState('');
  const [offsets, setOffsets] = useState<Record<string, number>>({});
  const [w, setW] = useState(options.width);
  const [h, setH] = useState(options.height);
  const [over, setOver] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('#createSearch')?.focus({ preventScroll: true });
    // Give focus back to the button that opened the panel, unless the action took it somewhere else (e.g. the wizard).
    return () => {
      const now = document.activeElement;
      if (!now || now === document.body || ref.current?.contains(now)) prev?.focus?.({ preventScroll: true });
    };
  }, []);

  const go = (run: () => void) => () => { onClose(); run(); };
  const items = useMemo(() => {
    const out: Record<string, Item> = {};
    const add = (i: Item) => { out[i.id] = i; };
    for (const c of components.filter((x) => x.origin === 'template')) {
      add({ id: c.id, name: COMPONENTS.get(c.doc.type)?.name ?? c.name, sub: c.description, kw: `${c.doc.type} ${c.name} template`, project: true, tag: c.doc.material.family === 'solid' ? 'Solid' : 'Glass',
        thumb: <RuntimeThumbnail doc={c.doc} />, run: go(() => { session.openComponent(c.id); openStudio(session, 'builder'); }) });
    }
    const preset = (family: string) => library.find((m) => m.origin === 'builtin' && m.doc.family === family);
    const newMaterial = (family: 'glass' | 'solid') => go(() => { void session.newMaterial(family); openStudio(session, 'material'); });
    const g = preset('glass'); const s = preset('solid');
    add({ id: 'glass', name: 'Materiale Glass', sub: 'Rifrazione, satinato, opaco', kw: 'vetro glass liquid materiale', project: true, thumb: g ? <MaterialThumbnail runtime doc={g.doc} /> : swatch('linear-gradient(180deg, rgba(255,150,225,.55), rgba(255,90,190,.28))'), run: newMaterial('glass') });
    add({ id: 'solid', name: 'Materiale Solid', sub: 'Superficie, bordo, elevazione', kw: 'solido css opaco materiale', project: true, thumb: s ? <MaterialThumbnail runtime doc={s.doc} /> : swatch('#5b3fc4'), run: newMaterial('solid') });
    add({ id: 'jelly', name: 'Materiale Jello', sub: 'Sperimentale', kw: 'gelatina jelly jello', project: true, soon: true, thumb: swatch('radial-gradient(circle at 32% 28%, rgba(255,255,255,.9) 0 6%, #e64bd6 40%, #6a1aa0 100%)', 'round'), run: () => undefined });
    add({ id: 'card', name: 'Card', sub: 'Contenitore con titolo e azioni', kw: 'card scheda', project: true, soon: true, thumb: swatch('#fff', 'card'), run: () => undefined });
    add({ id: 'input', name: 'Input', sub: 'Campo di testo con stati', kw: 'input campo form', project: true, soon: true, thumb: swatch('#fff', 'input'), run: () => undefined });
    for (const m of library.filter((x) => x.origin === 'builtin')) {
      add({ id: `p-${m.id}`, name: m.name, sub: `${presentItem(m).meta} · ${m.note || 'preset incluso'}`, kw: `preset ${m.doc.family}`, project: true, tag: m.approximation ? 'Approssimazione' : '',
        thumb: <MaterialThumbnail runtime doc={m.doc} />, run: go(() => { session.openMaterial(m.id); openStudio(session, 'material'); }) });
    }
    const assets = (tab: 'colors' | 'icons' | 'fonts') => go(() => { session.setAssetTab(tab); session.setPage('assets'); });
    add({ id: 'pal', name: 'Palette colori', sub: 'HEX, RGB, HSL, OKLCH', kw: 'colori palette asset', project: true, thumb: swatch('linear-gradient(90deg, #6d2bf0 0 20%, #e64bd6 20% 40%, #c9b2ff 40% 60%, #8fe3b8 60% 80%, #f5c77a 80%)', 'strip'), run: assets('colors') });
    add({ id: 'ico', name: 'Set di icone', sub: 'SVG in currentColor', kw: 'icone svg asset', project: true, thumb: swatch('radial-gradient(circle at 30% 30%, #c9b2ff 0 12%, transparent 13%), radial-gradient(circle at 70% 30%, #ff8fe0 0 12%, transparent 13%), radial-gradient(circle at 30% 70%, #8fe3b8 0 12%, transparent 13%), radial-gradient(circle at 70% 70%, #f5c77a 0 12%, transparent 13%), #241848', 'icons'), run: assets('icons') });
    add({ id: 'fnt', name: 'Coppia di font', sub: 'Google Fonts o di sistema', kw: 'font tipografia asset', project: true, thumb: swatch('linear-gradient(180deg, transparent 0 20%, #efe9ff 20% 34%, transparent 34% 52%, #a79cc8 52% 60%, transparent 60% 68%, #a79cc8 68% 76%, transparent 76%)', 'strip'), run: assets('fonts') });
    add({ id: 'json-c', name: 'Da definizione componente', sub: 'jello-component-definition v1', kw: 'json codice definizione componente', project: false, tag: '.json', thumb: swatch('repeating-linear-gradient(180deg, #2b1e57 0 8px, transparent 8px 18px)', 'code'), run: go(() => session.openFlow('import')) });
    add({ id: 'json-m', name: 'Da materiale JSON', sub: 'jello-material v2', kw: 'json codice materiale', project: false, tag: '.json', thumb: swatch('repeating-linear-gradient(180deg, #4a1e57 0 8px, transparent 8px 18px)', 'code'), run: go(() => session.openFlow('import')) });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [library, components, session]);

  const presetIds = Object.keys(items).filter((id) => id.startsWith('p-'));
  const templateIds = (...ids: string[]) => ids.filter((id) => items[id]);
  const rows: Record<string, { title: string; hint: string; ids: string[] }[]> = {
    perte: [{ title: 'Usati spesso', hint: 'I punti di partenza più comuni', ids: templateIds('mobile-navbar', 'desktop-navbar', 'button', 'glass', 'solid') }, { title: 'Preset inclusi', hint: 'Materiali pronti da provare', ids: presetIds }],
    comp: [{ title: 'Template ufficiali', hint: 'Parti da una componente reale', ids: templateIds('button', 'mobile-navbar', 'desktop-navbar', 'card', 'input') }],
    nav: [{ title: 'Navigazione', hint: 'Barre per app e siti', ids: templateIds('mobile-navbar', 'desktop-navbar') }],
    mat: [{ title: 'Famiglie di materiali', hint: 'Crea un materiale da applicare alle componenti', ids: ['glass', 'solid', 'jelly'] }],
    preset: [{ title: 'Preset inclusi', hint: 'Partono in sola lettura: modificandoli ne crei una copia', ids: presetIds }],
    asset: [{ title: 'Asset del progetto', hint: 'Gli ingredienti condivisi da tutte le componenti', ids: ['pal', 'ico', 'fnt'] }],
    code: [{ title: 'Da codice', hint: 'Carica una definizione esportata da Jello', ids: ['json-c', 'json-m'] }],
  };
  const quick: { label: string; icon: IcName; bg: string; id?: string; project: boolean; run(): void }[] = [
    { label: 'Nuovo progetto', icon: 'folder', bg: 'linear-gradient(135deg, #a78bfa, #6d2bf0)', id: 'createNewProject', project: false, run: go(() => session.openFlow('wizard')) },
    { label: 'Nuovo Glass', icon: 'drop', bg: 'linear-gradient(135deg, #ff8fe0, #8b3bea)', project: true, run: () => items.glass?.run() },
    { label: 'Nuovo Solid', icon: 'layers', bg: 'linear-gradient(135deg, #8b6cf0, #4a2bb0)', project: true, run: () => items.solid?.run() },
    { label: 'Importa .jello', icon: 'upload', bg: 'linear-gradient(135deg, #6fb6e8, #2f6ea8)', project: false, run: go(() => session.openFlow('import')) },
    { label: 'Da JSON', icon: 'code', bg: 'linear-gradient(135deg, #5fd3a5, #2f8f6a)', project: false, run: go(() => session.openFlow('import')) },
    { label: 'Carica SVG', icon: 'image', bg: 'linear-gradient(135deg, #f5c77a, #c27a14)', project: true, run: go(() => { session.setAssetTab('icons'); session.setPage('assets'); }) },
    { label: 'Nuova palette', icon: 'palette', bg: 'linear-gradient(135deg, #ff9fb8, #d0406e)', project: true, run: go(() => { session.setAssetTab('colors'); session.setPage('assets'); }) },
  ];

  const term = q.trim().toLowerCase();
  const results = term ? Object.values(items).filter((i) => `${i.name} ${i.sub} ${i.kw}`.toLowerCase().includes(term)) : [];

  const card = (it: Item) => {
    const off = it.soon || (it.project && !hasProject);
    return (
      <button key={it.id} type="button" className="create-card" aria-disabled={off || undefined} title={it.soon ? 'In arrivo' : it.project && !hasProject ? 'Serve un progetto: creane uno con «Nuovo progetto»' : undefined} onClick={() => !off && it.run()} style={off ? { opacity: it.soon ? 0.6 : 0.5 } : undefined}>
        <span className="create-th"><span className="create-th-in">{it.thumb}</span>{it.soon && <span className="create-soon">In arrivo</span>}{it.tag && <span className="create-tag">{it.tag}</span>}</span>
        <span className="create-nm">{it.name}</span>
        <span className="create-sub">{it.sub}</span>
      </button>
    );
  };

  const L = CUSTOM_LIMITS;
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const scale = Math.min(260 / w, 120 / h);
  const startStage = () => {
    session.setOption('device', 'custom');
    session.setOption('width', w);
    session.setOption('height', h);
    onClose();
    openStudio(session, 'builder');
  };
  const pickFile = (files: File[]) => { if (!files.length) return; onClose(); session.openFlow('import', files); };

  return (
    <div className="create-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="create-dialog"
        id="createDialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-title"
        ref={ref}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
          if (e.key !== 'Tab' || !ref.current) return;
          const f = [...ref.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter((x) => x.offsetParent !== null);
          if (!f.length) return;
          const first = f[0]!; const last = f[f.length - 1]!;
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }}
      >
        <button type="button" className="create-close" id="createClose" aria-label="Chiudi" onClick={onClose}><Ic name="x" /></button>
        <aside className="create-side">
          <h2 id="create-title">Inizia a creare</h2>
          {CATS.map((c) => (
            <button key={c.id} type="button" className="create-cat" aria-current={cat === c.id && !term ? 'true' : undefined} onClick={() => { setCat(c.id); setQ(''); }}>
              <span className="create-dot" style={{ background: c.color }}><Ic name={c.icon} size={16} /></span>{c.label}
            </button>
          ))}
        </aside>
        <section className="create-main">
          <label className="create-search">
            <Ic name="search" size={18} />
            <span className="visually-hidden">Cosa vuoi creare?</span>
            <input id="createSearch" type="search" placeholder="Cosa vuoi creare? Prova «navbar», «glass», «palette»…" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>

          {term ? (
            <div className="create-block">
              <h3>Risultati per «{q.trim()}»</h3>
              <div className="create-grid auto">{results.map(card)}</div>
              {results.length === 0 && <p className="muted small">Nessun risultato. Prova «button», «solid» o «importa».</p>}
            </div>
          ) : (
            <>
              {cat === 'perte' && (
                <div className="create-block">
                  <h3>Azioni rapide</h3>
                  <div className="create-quick">
                    {quick.map((a) => {
                      const off = a.project && !hasProject;
                      return <button key={a.label} type="button" id={a.id} className="create-qa" aria-disabled={off || undefined} title={off ? 'Serve un progetto' : undefined} onClick={() => !off && a.run()} style={off ? { opacity: 0.5 } : undefined}><span className="create-qi" style={{ background: a.bg }}><Ic name={a.icon} size={22} /></span>{a.label}</button>;
                    })}
                  </div>
                </div>
              )}
              {(rows[cat] ?? []).map((row, ri) => {
                const key = `${cat}${ri}`;
                const o = offsets[key] ?? 0;
                let vis = row.ids.slice(o, o + 4);
                if (vis.length < 4 && row.ids.length > 4) vis = vis.concat(row.ids.slice(0, 4 - vis.length));
                return (
                  <div className="create-block create-row" key={key}>
                    <div className="create-row-head"><h3>{row.title}</h3><span className="muted small">{row.hint}</span></div>
                    <div className="create-grid">{vis.map((id) => items[id]).filter((i): i is Item => !!i).map(card)}</div>
                    {row.ids.length > 4 && <button type="button" className="create-next" aria-label={`Altri in ${row.title}`} onClick={() => setOffsets({ ...offsets, [key]: (o + 1) % row.ids.length })}><Ic name="chevRight" /></button>}
                  </div>
                );
              })}
              {cat === 'custom' && (
                <div className="create-block create-custom">
                  <h3>Dimensioni personalizzate</h3>
                  <p className="muted small">Uno Stage libero per provare componenti e materiali alla misura che ti serve.</p>
                  <div className="create-presets">
                    {SIZE_PRESETS.map(([name, pw, ph]) => <button key={name} type="button" className="chip-filter" aria-pressed={w === pw && h === ph} onClick={() => { setW(pw); setH(ph); }}>{name}</button>)}
                  </div>
                  <div className="create-size">
                    <label className="create-field"><span className="muted small">Larghezza</span><input type="number" min={L.minWidth} max={L.maxWidth} value={w} aria-label="Larghezza in px" onChange={(e) => { const v = parseInt(e.target.value, 10); if (!isNaN(v)) setW(clamp(v, L.minWidth, L.maxWidth)); }} /><span className="muted small">px</span></label>
                    <span className="muted">×</span>
                    <label className="create-field"><span className="muted small">Altezza</span><input type="number" min={L.minHeight} max={L.maxHeight} value={h} aria-label="Altezza in px" onChange={(e) => { const v = parseInt(e.target.value, 10); if (!isNaN(v)) setH(clamp(v, L.minHeight, L.maxHeight)); }} /><span className="muted small">px</span></label>
                  </div>
                  <div className="create-stage"><span style={{ width: Math.round(w * scale), height: Math.round(h * scale) }}>{w} × {h}</span></div>
                  <button type="button" className="button primary" id="createStage" disabled={!hasProject} title={hasProject ? undefined : 'Serve un progetto'} onClick={startStage}>Crea Stage {w} × {h}</button>
                </div>
              )}
              {cat === 'import' && (
                <div className="create-block">
                  <h3>Importa</h3>
                  <label className="create-drop" data-over={over} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); pickFile([...e.dataTransfer.files]); }}>
                    <input type="file" className="visually-hidden" accept=".jello,.json" onChange={(e) => pickFile([...(e.target.files ?? [])])} />
                    <Ic name="upload" size={30} />
                    <strong>Trascina qui un file o sceglilo</strong>
                    <span className="muted small">Backup <code>.jello</code> · definizione JSON di componente o materiale</span>
                  </label>
                  <button type="button" className="link" onClick={go(() => session.openFlow('import'))}>Apri il flusso di importazione</button>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
