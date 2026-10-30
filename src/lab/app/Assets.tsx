/**
 * Asset page of the project: colours (palettes, tokens, contrast), icons
 * (collections, SVG upload, style) and fonts (families, type scale). Left rail
 * picks the kind and the collection, the middle shows the items, the right
 * panel edits the selected one. Everything saves with the project.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { colorUsage, iconUsage, addColor, addFont, addIconSet, addPalette, addTypeStyle, removeColor, removeFont, removeIcon, removeIconSet, removePalette, removeTypeStyle, renamePalette, tokenProblem, toCurrentColor, updateColor, updateFont, updateIcon, updateTypeStyle, warningFor } from '../../project/assets';
import { contrast, decimal, formatHsl, formatOklch, formatRgb, grade, GRADE_LABEL, hexToRgb, over } from '../../project/color';
import { cssColor, googleFontsUrl, iconSvg, typeShorthand } from '../../project/package';
import { inspectFile, MAX_FONT_BYTES } from '../../project/importer';
import type { ColorAsset, FontFamilyAsset, IconAsset, Palette, ProjectAssets, TypeStyle } from '../../project/types';
import type { LabSession } from '../session';
import { useLab, type AssetTab } from '../store';
import { ColorField } from './ColorPicker';
import { copyText, EmptyState, Ic, StateChip } from './ui';

const TABS: { id: AssetTab; label: string }[] = [
  { id: 'colors', label: 'Colori' },
  { id: 'icons', label: 'Icone' },
  { id: 'fonts', label: 'Font' },
];

export function AssetsPage({ session }: { session: LabSession }) {
  const project = useLab((s) => s.projects.find((p) => p.id === s.projectId) ?? null);
  const tab = useLab((s) => s.assetTab);
  if (!project) {
    return (
      <div className="assets-page">
        <EmptyState icon="folder" title="Nessun progetto attivo" action={<button type="button" className="button primary" onClick={() => session.openFlow('wizard')}>Nuovo progetto</button>}>
          Gli asset appartengono a un progetto: creane uno per iniziare.
        </EmptyState>
      </div>
    );
  }
  const a = project.assets;
  const counts: Record<AssetTab, number> = { colors: a.palettes.reduce((n, p) => n + p.colors.length, 0), icons: a.iconSets.reduce((n, s) => n + s.icons.length, 0), fonts: a.fonts.length };
  return (
    <div className="assets-page" id="assetsPage">
      <aside className="as-left" aria-label="Asset del progetto">
        <span className="eyebrow">Asset del progetto</span>
        <nav className="as-kinds" aria-label="Tipo di asset">
          {TABS.map((t) => (
            <button key={t.id} type="button" className="nav-i" id={`asset-tab-${t.id}`} aria-current={tab === t.id ? 'page' : undefined} onClick={() => session.setAssetTab(t.id)}>
              {t.label}
              <span className="count">{counts[t.id]}</span>
            </button>
          ))}
        </nav>
      </aside>
      {tab === 'colors' && <Colors session={session} assets={a} />}
      {tab === 'icons' && <Icons session={session} assets={a} />}
      {tab === 'fonts' && <Fonts session={session} assets={a} />}
    </div>
  );
}

function Copy({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="button small"
      onClick={async () => {
        setDone(await copyText(text));
        setTimeout(() => setDone(false), 1500);
      }}
    >
      <Ic name={done ? 'check' : 'copy'} size={14} />
      {done ? 'Copiato' : label}
    </button>
  );
}

// ---------- colours ----------

function Colors({ session, assets }: { session: LabSession; assets: ProjectAssets }) {
  const [palette, setPalette] = useState<string>('all');
  const [selected, setSelected] = useState<string | null>(assets.palettes[0]?.colors[0]?.id ?? null);
  const [query, setQuery] = useState('');
  const [newPalette, setNewPalette] = useState<string | null>(null);
  const edit = (fn: (a: ProjectAssets) => ProjectAssets) => session.projects.updateAssets(fn);
  const q = query.trim().toLowerCase();
  const shown: Palette[] = (palette === 'all' ? assets.palettes : assets.palettes.filter((p) => p.id === palette)).map((p) => ({ ...p, colors: p.colors.filter((c) => !q || c.name.toLowerCase().includes(q) || c.hex.includes(q) || c.token.includes(q)) }));
  const all = assets.palettes.flatMap((p) => p.colors);
  const color = all.find((c) => c.id === selected) ?? null;
  const target = assets.palettes.find((p) => p.id === palette) ?? assets.palettes[0];

  return (
    <>
      <aside className="as-left as-sub" aria-label="Palette">
        <span className="eyebrow">Palette</span>
        <button type="button" className="nav-i" aria-current={palette === 'all' ? 'true' : undefined} onClick={() => setPalette('all')}>
          Tutte
          <span className="count">{all.length}</span>
        </button>
        {assets.palettes.map((p) => (
          <button key={p.id} type="button" className="nav-i" aria-current={palette === p.id ? 'true' : undefined} onClick={() => setPalette(p.id)}>
            {p.name}
            <span className="count">{p.colors.length}</span>
          </button>
        ))}
        {newPalette === null ? (
          <button type="button" className="nav-i dashed" onClick={() => setNewPalette('')}>
            <Ic name="plus" />
            Nuova palette
          </button>
        ) : (
          <form
            className="inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (!newPalette.trim()) return setNewPalette(null);
              const r = addPalette(assets, newPalette);
              edit(() => r.assets);
              setPalette(r.id);
              setNewPalette(null);
            }}
          >
            <input aria-label="Nome della palette" autoFocus value={newPalette} onChange={(e) => setNewPalette(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setNewPalette(null)} placeholder="Nome palette" />
            <button type="submit" className="button small primary">
              Crea
            </button>
          </form>
        )}
        {palette !== 'all' && assets.palettes.some((p) => p.id === palette) && (
          <div className="pal-actions">
            <button
              type="button"
              className="button small"
              onClick={() => {
                const n = window.prompt('Nome della palette', assets.palettes.find((p) => p.id === palette)?.name);
                if (n) edit((a) => renamePalette(a, palette, n));
              }}
            >
              Rinomina
            </button>
            <button
              type="button"
              className="button small danger"
              onClick={() => {
                edit((a) => removePalette(a, palette));
                setPalette('all');
              }}
            >
              Elimina palette
            </button>
          </div>
        )}
      </aside>

      <main className="as-main" aria-label="Colori">
        <div className="as-toolbar">
          <label className="search-field">
            <span className="visually-hidden">Cerca colore</span>
            <Ic name="search" />
            <input type="search" placeholder="Cerca colore" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <span className="grow" />
          <button type="button" className="button" onClick={() => session.openFlow('import')}>
            <Ic name="download" />
            Importa
          </button>
          <button
            type="button"
            className="button primary"
            disabled={!target}
            onClick={() => {
              if (!target) return;
              const r = addColor(assets, target.id);
              edit(() => r.assets);
              setSelected(r.id);
            }}
          >
            <Ic name="plus" />
            Nuovo colore
          </button>
        </div>
        {all.length === 0 && (
          <EmptyState icon="palette" title="Nessun colore">
            Crea una palette e aggiungi i colori del progetto: ognuno diventa un token CSS.
          </EmptyState>
        )}
        {shown.map((p) =>
          p.colors.length === 0 && q ? null : (
            <section key={p.id} className="palette-block" aria-label={p.name}>
              <h2 className="group-title">
                {p.name} <span className="count">{p.colors.length}</span>
              </h2>
              <div className="swatch-grid">
                {p.colors.map((c) => (
                  <button key={c.id} type="button" className="swatch-card" aria-pressed={selected === c.id} onClick={() => setSelected(c.id)}>
                    <span className="swatch-big" style={{ background: cssColor(c.hex, c.alpha), color: contrast(c.hex, '#ffffff') >= contrast(c.hex, '#000000') ? '#fff' : '#000' }}>
                      Aa
                    </span>
                    <span className="swatch-name">{c.name}</span>
                    <span className="muted small mono">{c.hex.toUpperCase()}</span>
                  </button>
                ))}
              </div>
            </section>
          ),
        )}
      </main>

      <aside className="as-right" aria-label="Dettaglio colore">
        {color ? <ColorDetail key={color.id} color={color} assets={assets} session={session} onDelete={() => (edit((a) => removeColor(a, color.id)), setSelected(null))} /> : <p className="muted pad">Scegli un colore per modificarlo.</p>}
      </aside>
    </>
  );
}

function ColorDetail({ color, assets, session, onDelete }: { color: ColorAsset; assets: ProjectAssets; session: LabSession; onDelete(): void }) {
  const edit = (patch: Partial<Pick<ColorAsset, 'name' | 'token' | 'hex' | 'alpha'>>) => session.projects.updateAssets((a) => updateColor(a, color.id, patch));
  const [token, setToken] = useState(color.token);
  const problem = tokenProblem(assets, token, color.id);
  const all = useLab((s) => s.components);
  const comps = useMemo(() => all.filter((c) => c.origin === 'user').map((c) => c.doc), [all]);
  const usage = useMemo(() => colorUsage(comps, color.hex), [comps, color.hex]);
  const onWhite = contrast(over(color.hex, color.alpha, '#ffffff'), '#ffffff');
  const onDark = contrast(over(color.hex, color.alpha, '#121218'), '#121218');
  const rgb = hexToRgb(color.hex);
  const css = `${color.token}: ${cssColor(color.hex, color.alpha)};`;
  return (
    <div className="detail">
      <h2 className="detail-title">{color.name}</h2>
      <label className="field">
        <span>Nome</span>
        <input value={color.name} maxLength={80} onChange={(e) => edit({ name: e.target.value })} />
      </label>
      <div className="field">
        <label htmlFor="color-token">Token</label>
        <input
          id="color-token"
          value={token}
          className="mono"
          spellCheck={false}
          aria-invalid={problem !== null}
          aria-describedby={problem ? 'tokenProblem' : undefined}
          onChange={(e) => {
            setToken(e.target.value);
            if (!tokenProblem(assets, e.target.value, color.id)) edit({ token: e.target.value });
          }}
          onBlur={() => problem && setToken(color.token)}
        />
        {problem && (
          <span id="tokenProblem" className="field-error" role="alert">
            {problem}
          </span>
        )}
      </div>
      <div className="color-edit">
        <ColorField label={`Colore di ${color.name}`} hex={color.hex} alpha={color.alpha} onChange={(hex, alpha) => edit({ hex, alpha })} />
        <dl className="values">
          <div>
            <dt>HEX</dt>
            <dd className="mono">{color.hex.toUpperCase()}</dd>
          </div>
          <div>
            <dt>Opacità</dt>
            <dd>{Math.round(color.alpha * 100)} %</dd>
          </div>
          <div>
            <dt>RGB</dt>
            <dd className="mono">{formatRgb(color.hex)}</dd>
          </div>
          <div>
            <dt>HSL</dt>
            <dd className="mono">{formatHsl(color.hex)}</dd>
          </div>
          <div>
            <dt>OKLCH</dt>
            <dd className="mono">{formatOklch(color.hex)}</dd>
          </div>
        </dl>
      </div>
      <h3 className="detail-sub">Contrasto</h3>
      <div className="contrast-row">
        {[
          { label: 'su bianco', bg: '#ffffff', ratio: onWhite, fg: over(color.hex, color.alpha, '#ffffff') },
          { label: 'su grafite', bg: '#121218', ratio: onDark, fg: over(color.hex, color.alpha, '#121218') },
        ].map((c) => (
          <div key={c.label} className="contrast-card" style={{ background: c.bg }}>
            <span className="contrast-aa" style={{ color: c.fg }}>
              Aa
            </span>
            <span className="contrast-meta">
              <span style={{ color: c.bg === '#ffffff' ? '#333' : '#ddd' }}>{c.label}</span>
              <strong style={{ color: c.bg === '#ffffff' ? '#111' : '#fff' }}>{decimal(Math.round(c.ratio * 10) / 10)} : 1</strong>
            </span>
            <StateChip kind={grade(c.ratio) === 'fail' ? 'danger' : grade(c.ratio) === 'large' ? 'warn' : 'ok'}>{GRADE_LABEL[grade(c.ratio)]}</StateChip>
          </div>
        ))}
      </div>
      <h3 className="detail-sub">Usato in</h3>
      {usage.length ? (
        <ul className="usage">
          {usage.map((u) => (
            <li key={u}>{u}</li>
          ))}
        </ul>
      ) : (
        <p className="muted small">Nessuna componente del progetto usa questo colore.</p>
      )}
      <div className="detail-actions">
        <Copy text={css} label="Copia CSS" />
        <Copy text={JSON.stringify({ name: color.name, token: color.token, hex: color.hex, alpha: color.alpha, rgb: `rgb(${rgb.r} ${rgb.g} ${rgb.b})` }, null, 2)} label="Copia JSON" />
        <button type="button" className="button small danger" onClick={onDelete}>
          <Ic name="trash" size={14} />
          Elimina
        </button>
      </div>
    </div>
  );
}

// ---------- icons ----------

function IconSvg({ icon, size = 24, filled }: { icon: IconAsset; size?: number; filled?: boolean }) {
  const paint = (filled ?? icon.paint === 'fill') ? { fill: 'currentColor', stroke: 'none' } : { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return <svg viewBox={icon.viewBox} width={size} height={size} aria-hidden="true" focusable="false" {...paint} dangerouslySetInnerHTML={{ __html: icon.body }} />;
}

function Icons({ session, assets }: { session: LabSession; assets: ProjectAssets }) {
  const [setId, setSetId] = useState<string>(assets.iconSets[0]?.id ?? '');
  const [selected, setSelected] = useState<string | null>(assets.iconSets[0]?.icons[0]?.id ?? null);
  const [query, setQuery] = useState('');
  const [size, setSize] = useState<16 | 24 | 32>(24);
  const [notes, setNotes] = useState<string[]>([]);
  const [newSet, setNewSet] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const edit = (fn: (a: ProjectAssets) => ProjectAssets) => session.projects.updateAssets(fn);
  const set = assets.iconSets.find((s) => s.id === setId) ?? assets.iconSets[0];
  const q = query.trim().toLowerCase();
  const icons = (set?.icons ?? []).filter((i) => !q || i.name.toLowerCase().includes(q));
  const icon = assets.iconSets.flatMap((s) => s.icons).find((i) => i.id === selected) ?? null;
  const uploaded = assets.iconSets.find((s) => !s.builtin && s.name === 'Caricate');

  const upload = async (files: File[]) => {
    const msgs: string[] = [];
    const added: IconAsset[] = [];
    for (const f of files) {
      const r = await inspectFile(f.name, new Uint8Array(await f.arrayBuffer()));
      if (r.kind === 'icon') {
        added.push(r.icon);
        if (r.icon.warning) msgs.push(`${r.icon.name}: ${r.icon.warning}`);
      } else if (r.kind === 'rejected') msgs.push(`${f.name}: rifiutato (${r.errors[0] ?? 'non valido'})`);
      else msgs.push(`${f.name}: non è un SVG`);
    }
    if (added.length) {
      let target = uploaded?.id;
      let next = assets;
      if (!target) {
        const r = addIconSet(assets, 'Caricate');
        next = r.assets;
        target = r.id;
      }
      const names = new Set(next.iconSets.flatMap((s) => s.icons.map((i) => i.name)));
      const fresh = added.map((i, n) => {
        let name = i.name;
        for (let k = 2; names.has(name); k++) name = `${i.name} ${k}`;
        names.add(name);
        return { ...i, name, id: `${i.id}-${Date.now().toString(36)}${n}` };
      });
      edit(() => ({ ...next, iconSets: next.iconSets.map((s) => (s.id === target ? { ...s, icons: [...s.icons, ...fresh] } : s)) }));
      setSetId(target);
      setSelected(fresh[0]!.id);
    }
    setNotes(msgs);
  };

  return (
    <>
      <aside className="as-left as-sub" aria-label="Raccolte">
        <span className="eyebrow">Raccolte</span>
        {assets.iconSets.map((s) => (
          <button key={s.id} type="button" className="nav-i" aria-current={set?.id === s.id ? 'true' : undefined} onClick={() => setSetId(s.id)}>
            {s.name}
            <span className="count">{s.icons.length}</span>
          </button>
        ))}
        {newSet === null ? (
          <button type="button" className="nav-i dashed" onClick={() => setNewSet('')}>
            <Ic name="plus" />
            Nuova raccolta
          </button>
        ) : (
          <form
            className="inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (!newSet.trim()) return setNewSet(null);
              const r = addIconSet(assets, newSet);
              edit(() => r.assets);
              setSetId(r.id);
              setNewSet(null);
            }}
          >
            <input aria-label="Nome della raccolta" autoFocus value={newSet} onChange={(e) => setNewSet(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setNewSet(null)} placeholder="Nome raccolta" />
            <button type="submit" className="button small primary">
              Crea
            </button>
          </form>
        )}
        {set && !set.builtin && (
          <button type="button" className="button small danger" onClick={() => edit((a) => removeIconSet(a, set.id))}>
            Elimina raccolta
          </button>
        )}
      </aside>

      <main className="as-main" aria-label="Icone">
        <div className="as-toolbar">
          <label className="search-field">
            <span className="visually-hidden">Cerca icona</span>
            <Ic name="search" />
            <input type="search" placeholder="Cerca icona" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <div className="seg" role="group" aria-label="Dimensione">
            {([16, 24, 32] as const).map((n) => (
              <button key={n} type="button" className="seg-b" aria-pressed={size === n} onClick={() => setSize(n)}>
                {n}
              </button>
            ))}
          </div>
          <span className="grow" />
          <input ref={file} type="file" accept=".svg,image/svg+xml" multiple hidden id="iconFiles" onChange={(e) => (void upload([...(e.target.files ?? [])]), (e.target.value = ''))} />
          <button type="button" className="button primary" onClick={() => file.current?.click()}>
            <Ic name="upload" />
            Carica SVG
          </button>
        </div>
        <div
          className="drop-area slim"
          data-over={over}
          onDragOver={(e) => (e.preventDefault(), setOver(true))}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            void upload([...e.dataTransfer.files]);
          }}
        >
          <Ic name="upload" size={18} />
          <span>Trascina qui i file SVG</span>
          <span className="muted small">Stili, script ed effetti rimossi · massimo 200 KB per file · i colori fissi vengono segnalati</span>
        </div>
        {notes.length > 0 && (
          <ul className="messages" role="status" data-ok="false">
            {notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}
        {set && (
          <section aria-label={set.name}>
            <h2 className="group-title">
              {set.name}
              <span className="muted small">{set.builtin ? ` · 24 × 24 · tratto 1,8` : ''}</span>
            </h2>
            {icons.length === 0 ? (
              <EmptyState icon="image" title={q ? `Nessun risultato per “${query}”` : 'Raccolta vuota'}>
                {q ? 'Prova un altro nome.' : 'Carica uno o più file SVG per riempirla.'}
              </EmptyState>
            ) : (
              <div className="icon-grid">
                {icons.map((i) => (
                  <button key={i.id} type="button" className="icon-cell" aria-pressed={selected === i.id} onClick={() => setSelected(i.id)}>
                    <IconSvg icon={i} size={size} />
                    <span className="icon-name">{i.name}</span>
                    {i.warning && <span className="warn-dot" title={i.warning} aria-label="Avviso" />}
                  </button>
                ))}
              </div>
            )}
          </section>
        )}
      </main>

      <aside className="as-right" aria-label="Dettaglio icona">
        {icon ? <IconDetail key={icon.id} icon={icon} setName={assets.iconSets.find((s) => s.icons.some((i) => i.id === icon.id))?.name ?? ''} builtin={assets.iconSets.find((s) => s.icons.some((i) => i.id === icon.id))?.builtin ?? false} session={session} onDeleted={() => setSelected(null)} /> : <p className="muted pad">Scegli un’icona per vederla nei vari usi.</p>}
      </aside>
    </>
  );
}

function IconDetail({ icon, setName, builtin, session, onDeleted }: { icon: IconAsset; setName: string; builtin: boolean; session: LabSession; onDeleted(): void }) {
  const all = useLab((s) => s.components);
  const comps = useMemo(() => all.filter((c) => c.origin === 'user').map((c) => c.doc), [all]);
  const usage = useMemo(() => iconUsage(comps, icon.name), [comps, icon.name]);
  const edit = (fn: (i: IconAsset) => IconAsset) => session.projects.updateAssets((a) => updateIcon(a, icon.id, fn));
  const svg = iconSvg(icon);
  return (
    <div className="detail">
      <h2 className="detail-title">{icon.name}</h2>
      <p className="muted small">{setName}</p>
      <div className="icon-previews">
        {[16, 24, 48].map((n) => (
          <span key={n} className="icon-prev">
            <IconSvg icon={icon} size={n} />
            <span className="muted small">{n}</span>
          </span>
        ))}
        <span className="icon-prev on-glass">
          <span className="glass-chip">
            <IconSvg icon={icon} size={24} />
          </span>
          <span className="muted small">su glass</span>
        </span>
      </div>
      {icon.warning && (
        <div className="callout warn" role="status">
          <Ic name="alert" size={16} />
          <span>
            «{icon.name}» {icon.warning}.
          </span>
          {!builtin && (
            <button type="button" className="button small" onClick={() => edit((i) => ({ ...i, body: toCurrentColor(i.body), warning: warningFor(toCurrentColor(i.body)) }))}>
              Converti in currentColor
            </button>
          )}
        </div>
      )}
      <h3 className="detail-sub">Stile</h3>
      <div className="field">
        <span>Riempimento</span>
        <div className="seg" role="group" aria-label="Riempimento">
          <button type="button" className="seg-b" aria-pressed={icon.paint === 'stroke'} disabled={builtin} onClick={() => edit((i) => ({ ...i, paint: 'stroke' }))}>
            Contorno
          </button>
          <button type="button" className="seg-b" aria-pressed={icon.paint === 'fill'} disabled={builtin} onClick={() => edit((i) => ({ ...i, paint: 'fill' }))}>
            Pieno (stato attivo)
          </button>
        </div>
      </div>
      <div className="field">
        <span>Colore</span>
        <span className="muted small">
          <code>currentColor</code> · eredita dal testo
        </span>
      </div>
      <h3 className="detail-sub">Codice</h3>
      <pre className="code-block">{svg}</pre>
      <div className="detail-actions">
        <Copy text={svg} label="Copia SVG" />
        {!builtin && (
          <button
            type="button"
            className="button small danger"
            onClick={() => {
              session.projects.updateAssets((a) => removeIcon(a, icon.id));
              onDeleted();
            }}
          >
            <Ic name="trash" size={14} />
            Elimina
          </button>
        )}
      </div>
      <h3 className="detail-sub">Usata in</h3>
      {usage.length ? (
        <ul className="usage">
          {usage.map((u) => (
            <li key={u}>{u}</li>
          ))}
        </ul>
      ) : (
        <p className="muted small">Nessuna componente del progetto usa questa icona.</p>
      )}
    </div>
  );
}

// ---------- fonts ----------

const WEIGHT_NAMES: Record<number, string> = { 300: 'Light', 400: 'Regolare', 500: 'Medio', 600: 'Semibold', 700: 'Bold' };
const ALL_WEIGHTS = [300, 400, 500, 600, 700];
const SOURCE_LABEL = { google: 'Google Fonts', upload: 'File caricato', system: 'Font di sistema' } as const;

/** Makes uploaded .woff2 files usable in the previews of this page. */
function useUploadedFonts(session: LabSession, fonts: readonly FontFamilyAsset[]) {
  useEffect(() => {
    const faces: FontFace[] = [];
    let live = true;
    void (async () => {
      for (const f of fonts) {
        if (f.source !== 'upload' || !f.fileHash || typeof FontFace === 'undefined') continue;
        const a = await session.repo.getAsset(f.fileHash).catch(() => null);
        if (!a || !live) continue;
        try {
          const face = new FontFace(f.name, await a.blob.arrayBuffer());
          await face.load();
          document.fonts.add(face);
          faces.push(face);
        } catch {
          /* an unreadable font keeps the fallback */
        }
      }
    })();
    return () => {
      live = false;
      for (const f of faces) document.fonts.delete(f);
    };
  }, [session, fonts]);
}

function Fonts({ session, assets }: { session: LabSession; assets: ProjectAssets }) {
  useUploadedFonts(session, assets.fonts);
  const [selected, setSelected] = useState<{ kind: 'font' | 'style'; id: string } | null>(assets.fonts[0] ? { kind: 'font', id: assets.fonts[0].id } : null);
  const [sample, setSample] = useState('');
  const [adding, setAdding] = useState(false);
  const [notes, setNotes] = useState<string[]>([]);
  const file = useRef<HTMLInputElement>(null);
  const edit = (fn: (a: ProjectAssets) => ProjectAssets) => session.projects.updateAssets(fn);
  const stack = (id: string) => {
    const f = assets.fonts.find((x) => x.id === id);
    return f ? `"${f.name}", ${f.fallback === 'system-ui' ? 'system-ui, sans-serif' : f.fallback}` : 'system-ui, sans-serif';
  };
  const font = selected?.kind === 'font' ? assets.fonts.find((f) => f.id === selected.id) : undefined;
  const style = selected?.kind === 'style' ? assets.typeStyles.find((t) => t.id === selected.id) : undefined;

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    const r = await inspectFile(f.name, new Uint8Array(await f.arrayBuffer()));
    if (r.kind !== 'font') return setNotes([r.kind === 'rejected' ? `${f.name}: ${r.errors[0] ?? 'non valido'}` : `${f.name}: usa un file .woff2 (massimo ${MAX_FONT_BYTES / 1024 / 1024} MB)`]);
    await session.projects.addUploadedFont(r.font, r.bytes);
    setNotes(r.warnings.map((w) => `${r.font.name}: ${w}`));
  };

  return (
    <>
      <aside className="as-left as-sub" aria-label="Tipografia">
        <span className="eyebrow">Tipografia</span>
        <span className="nav-i static">
          Famiglie <span className="count">{assets.fonts.length}</span>
        </span>
        <span className="nav-i static">
          Scala tipografica <span className="count">{assets.typeStyles.length}</span>
        </span>
      </aside>
      <main className="as-main" aria-label="Font">
        <div className="as-toolbar">
          <label className="search-field wide">
            <span className="visually-hidden">Testo di anteprima</span>
            <Ic name="type" />
            <input value={sample} placeholder="Testo di anteprima" onChange={(e) => setSample(e.target.value)} />
          </label>
          <span className="grow" />
          <input ref={file} type="file" accept=".woff2,font/woff2" hidden id="fontFile" onChange={(e) => (void onFile(e.target.files?.[0]), (e.target.value = ''))} />
          <button type="button" className="button" onClick={() => file.current?.click()}>
            <Ic name="upload" />
            Carica .woff2
          </button>
          <button type="button" className="button primary" onClick={() => setAdding(!adding)} aria-expanded={adding}>
            <Ic name="plus" />
            Aggiungi font
          </button>
        </div>
        {adding && <AddFont assets={assets} onDone={(id) => (setAdding(false), id && setSelected({ kind: 'font', id }))} edit={edit} />}
        {notes.length > 0 && (
          <ul className="messages" role="status" data-ok="false">
            {notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}
        <section aria-label="Famiglie">
          <h2 className="group-title">
            Famiglie <span className="count">{assets.fonts.length}</span>
          </h2>
          {assets.fonts.length === 0 && (
            <EmptyState icon="type" title="Nessun font">
              Aggiungi un font di Google Fonts o carica un file .woff2.
            </EmptyState>
          )}
          <div className="font-grid">
            {assets.fonts.map((f) => (
              <button key={f.id} type="button" className="card font-card" aria-pressed={selected?.kind === 'font' && selected.id === f.id} onClick={() => setSelected({ kind: 'font', id: f.id })}>
                <span className="font-card-head">
                  <strong>{f.name}</strong>
                  <span className="muted small">{f.role}</span>
                </span>
                <span className="font-sample" style={{ fontFamily: stack(f.id), fontWeight: f.weights.includes(600) ? 600 : f.weights[0] }}>
                  {sample || 'Aa Gg 123'}
                </span>
                <span className="muted small">
                  {SOURCE_LABEL[f.source]} · {f.weights.length} {f.weights.length === 1 ? 'peso' : 'pesi'} · {f.license.includes('Open Font') ? 'OFL' : f.license}
                </span>
              </button>
            ))}
          </div>
        </section>
        <section aria-label="Scala tipografica">
          <div className="section-head">
            <h2 className="group-title">
              Scala tipografica <span className="count">{assets.typeStyles.length}</span>
            </h2>
            <button
              type="button"
              className="button small"
              onClick={() => {
                const r = addTypeStyle(assets, 'Nuovo stile');
                edit(() => r.assets);
                setSelected({ kind: 'style', id: r.id });
              }}
            >
              <Ic name="plus" size={14} />
              Nuovo stile
            </button>
          </div>
          <table className="type-table">
            <thead>
              <tr>
                <th scope="col">Token</th>
                <th scope="col">Anteprima</th>
                <th scope="col">Valori</th>
              </tr>
            </thead>
            <tbody>
              {assets.typeStyles.map((t) => (
                <tr key={t.id} aria-selected={selected?.kind === 'style' && selected.id === t.id}>
                  <td>
                    <button type="button" className="link mono" onClick={() => setSelected({ kind: 'style', id: t.id })}>
                      {t.token}
                    </button>
                  </td>
                  <td>
                    <span style={{ font: typeShorthand(t, assets) }} className="type-preview">
                      {sample || t.sample}
                    </span>
                  </td>
                  <td className="muted small mono">
                    {assets.fonts.find((f) => f.id === t.family)?.name ?? '—'} {t.weight} · {t.size}/{t.lineHeight}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </main>
      <aside className="as-right" aria-label="Dettaglio font">
        {font ? <FontDetail key={font.id} font={font} assets={assets} session={session} onDeleted={() => setSelected(null)} /> : style ? <StyleDetail key={style.id} style={style} assets={assets} session={session} onDeleted={() => setSelected(null)} /> : <p className="muted pad">Scegli una famiglia o uno stile.</p>}
      </aside>
    </>
  );
}

function AddFont({ assets, edit, onDone }: { assets: ProjectAssets; edit(fn: (a: ProjectAssets) => ProjectAssets): void; onDone(id?: string): void }) {
  const [name, setName] = useState('');
  const [source, setSource] = useState<FontFamilyAsset['source']>('google');
  return (
    <form
      className="inline-card"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        const r = addFont(assets, { name: name.trim().slice(0, 80), role: 'Aggiunto', source, weights: [400, 700], license: source === 'google' ? 'SIL Open Font License' : 'Da verificare', fallback: 'sans-serif', fileHash: null });
        edit(() => r.assets);
        onDone(r.id);
      }}
    >
      <label className="field">
        <span>Nome della famiglia</span>
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Es. Nunito" />
      </label>
      <label className="field">
        <span>Origine</span>
        <select value={source} onChange={(e) => setSource(e.target.value as FontFamilyAsset['source'])}>
          <option value="google">Google Fonts (collegato)</option>
          <option value="system">Font di sistema (fallback)</option>
        </select>
      </label>
      <div className="row-actions">
        <button type="button" className="button" onClick={() => onDone()}>
          Annulla
        </button>
        <button type="submit" className="button primary" disabled={!name.trim()}>
          Aggiungi
        </button>
      </div>
    </form>
  );
}

function FontDetail({ font, assets, session, onDeleted }: { font: FontFamilyAsset; assets: ProjectAssets; session: LabSession; onDeleted(): void }) {
  const edit = (patch: Partial<Omit<FontFamilyAsset, 'id'>>) => session.projects.updateAssets((a) => updateFont(a, font.id, patch));
  const used = assets.typeStyles.filter((t) => t.family === font.id);
  const css = `--jello-font-${font.role.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'ui'}: "${font.name}", ${font.fallback};`;
  return (
    <div className="detail">
      <h2 className="detail-title">{font.name}</h2>
      <p className="muted small">{font.role}</p>
      <label className="field">
        <span>Ruolo</span>
        <input value={font.role} maxLength={60} onChange={(e) => edit({ role: e.target.value })} />
      </label>
      <h3 className="detail-sub">Pesi inclusi</h3>
      <div className="weights">
        {ALL_WEIGHTS.map((w) => (
          <label key={w} className="check">
            <input type="checkbox" checked={font.weights.includes(w)} onChange={(e) => edit({ weights: (e.target.checked ? [...font.weights, w] : font.weights.filter((x) => x !== w)).sort() })} />
            <span style={{ fontFamily: `"${font.name}", system-ui`, fontWeight: w }}>
              {w} {WEIGHT_NAMES[w]}
            </span>
          </label>
        ))}
      </div>
      <p className="muted small">Ogni peso in più aumenta il peso del pacchetto esportato.</p>
      <h3 className="detail-sub">Origine</h3>
      <div className="field">
        <select aria-label="Origine" value={font.source} onChange={(e) => edit({ source: e.target.value as FontFamilyAsset['source'] })}>
          <option value="google">Google Fonts · collegato</option>
          <option value="upload" disabled={!font.fileHash}>
            File caricato (.woff2)
          </option>
          <option value="system">Font di sistema · fallback</option>
        </select>
        {font.source === 'google' && <span className="muted small mono">{googleFontsUrl([font])}</span>}
      </div>
      <h3 className="detail-sub">CSS</h3>
      <pre className="code-block">{css}</pre>
      <label className="field">
        <span>Licenza</span>
        <input value={font.license} maxLength={120} onChange={(e) => edit({ license: e.target.value })} />
      </label>
      {used.length > 0 && <p className="muted small">Usato da: {used.map((t) => t.label).join(', ')}.</p>}
      <div className="detail-actions">
        <Copy text={css} label="Copia" />
        <button
          type="button"
          className="button small danger"
          onClick={() => {
            session.projects.updateAssets((a) => removeFont(a, font.id));
            onDeleted();
          }}
        >
          <Ic name="trash" size={14} />
          Elimina
        </button>
      </div>
    </div>
  );
}

function StyleDetail({ style, assets, session, onDeleted }: { style: TypeStyle; assets: ProjectAssets; session: LabSession; onDeleted(): void }) {
  const edit = (patch: Partial<Omit<TypeStyle, 'id'>>) => session.projects.updateAssets((a) => updateTypeStyle(a, style.id, patch));
  const [token, setToken] = useState(style.token);
  const problem = tokenProblem(assets, token, style.id);
  const css = `${style.token}: ${typeShorthand(style, assets)};`;
  return (
    <div className="detail">
      <h2 className="detail-title">{style.label}</h2>
      <label className="field">
        <span>Nome</span>
        <input value={style.label} maxLength={60} onChange={(e) => edit({ label: e.target.value })} />
      </label>
      <div className="field">
        <label htmlFor="style-token">Token</label>
        <input
          id="style-token"
          className="mono"
          value={token}
          aria-invalid={problem !== null}
          aria-describedby={problem ? 'styleTokenProblem' : undefined}
          onChange={(e) => {
            setToken(e.target.value);
            if (!tokenProblem(assets, e.target.value, style.id)) edit({ token: e.target.value });
          }}
          onBlur={() => problem && setToken(style.token)}
        />
        {problem && (
          <span id="styleTokenProblem" className="field-error" role="alert">
            {problem}
          </span>
        )}
      </div>
      <label className="field">
        <span>Famiglia</span>
        <select value={style.family} onChange={(e) => edit({ family: e.target.value })}>
          {assets.fonts.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </label>
      <div className="grid-3">
        <label className="field">
          <span>Peso</span>
          <select value={style.weight} onChange={(e) => edit({ weight: Number(e.target.value) })}>
            {[300, 400, 500, 600, 700, 800].map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Corpo (px)</span>
          <input type="number" min={8} max={160} value={style.size} onChange={(e) => edit({ size: Math.min(160, Math.max(8, Number(e.target.value) || 8)) })} />
        </label>
        <label className="field">
          <span>Interlinea (px)</span>
          <input type="number" min={8} max={200} value={style.lineHeight} onChange={(e) => edit({ lineHeight: Math.min(200, Math.max(8, Number(e.target.value) || 8)) })} />
        </label>
      </div>
      <label className="field">
        <span>Testo di esempio</span>
        <input value={style.sample} maxLength={200} onChange={(e) => edit({ sample: e.target.value })} />
      </label>
      <h3 className="detail-sub">CSS</h3>
      <pre className="code-block">{css}</pre>
      <div className="detail-actions">
        <Copy text={css} label="Copia" />
        <button
          type="button"
          className="button small danger"
          onClick={() => {
            session.projects.updateAssets((a) => removeTypeStyle(a, style.id));
            onDeleted();
          }}
        >
          <Ic name="trash" size={14} />
          Elimina
        </button>
      </div>
    </div>
  );
}
