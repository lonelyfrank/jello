import { useMemo, useState } from 'react';
import { FAMILIES, glassParams, hexToRgbSafe } from './model-ui';
import { SCENES } from '../../stage/scenes';
import { NAV_ITEMS, OBJECTS, type ObjectKind } from '../../stage/view';
import { PHOTO } from '../../stage/scenes';
import type { LabSession } from '../session';
import { useLab, type LibraryItem } from '../store';
import { Icon } from './icons';

/** A sphere that hints at the material: tint and opacity in the body, light in the highlight, refraction in the rim. */
export function sphereStyle(item: LibraryItem['doc']): React.CSSProperties {
  const p = glassParams(item);
  const [r, g, b] = hexToRgbSafe(p.tint);
  const a = (v: number) => Math.max(0, Math.min(1, v)).toFixed(2);
  return {
    ['--sphere' as string]:
      `radial-gradient(circle at 32% 28%, rgb(255 255 255 / ${a(0.55 + p.light * 0.45)}) 0 6%, ` +
      `rgb(255 255 255 / ${a(0.12 + p.light * 0.3)}) 18%, rgb(${r} ${g} ${b} / ${a(0.18 + p.tintOpacity * 0.9)}) 55%, ` +
      `rgb(12 15 18 / ${a(0.95 - p.blur / 80)}) 100%)`,
    ['--rim' as string]: `${(1 + Math.abs(p.refraction) / 16).toFixed(1)}px`,
  };
}

const OBJECT_ICONS: Record<ObjectKind, string> = {
  capsule: 'M5 8.5h14a3.5 3.5 0 0 1 0 7H5a3.5 3.5 0 0 1 0-7Z',
  navbar: 'M3 9h18v6H3zM7 12h2M11 12h2M15 12h2',
  button: 'M6 8h12a4 4 0 0 1 0 8H6a4 4 0 0 1 0-8ZM9 12h6',
  card: 'M4 5h16v14H4zM7 9h8M7 12h10M7 15h6',
  dialog: 'M4 5h16v14H4zM4 9h16M16 7h1',
};

export function Library({ session }: { session: LabSession }) {
  const library = useLab((s) => s.library);
  const materialId = useLab((s) => s.materialId);
  const origin = useLab((s) => s.origin);
  const modified = useLab((s) => s.modified);
  const doc = useLab((s) => s.doc);
  const options = useLab((s) => s.options);
  const skipped = useLab((s) => s.librarySkipped);
  const [query, setQuery] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const q = query.trim().toLowerCase();
  const visible = useMemo(() => library.filter((i) => !q || i.name.toLowerCase().includes(q) || 'glass'.includes(q)), [library, q]);
  const builtins = visible.filter((i) => i.origin === 'builtin');
  const personal = visible.filter((i) => i.origin === 'user');
  const reducedMotion = useLab((s) => s.report?.main.motionReduced ?? false);
  const scene = options.mode === 'scene';

  const card = (i: LibraryItem) => {
    const active = i.id === materialId;
    const name = i.approximation ? `≈ ${i.name.replace(/\s*\(approssimazione\)$/, '')}` : i.name;
    return (
      <button
        key={i.id}
        type="button"
        className="preset-card"
        aria-pressed={active}
        aria-label={`${i.name}${i.origin === 'user' ? ' (personale)' : ''}`}
        title={i.note}
        data-preset={i.id}
        data-origin={i.origin}
        onClick={() => session.openMaterial(i.id)}
      >
        <span className="sphere" aria-hidden="true" style={sphereStyle(active ? doc : i.doc)} />
        <span className="preset-name" aria-hidden="true">
          {active && i.origin === 'user' ? doc.name : name}
        </span>
      </button>
    );
  };

  return (
    <>
      <section className="side-section" aria-labelledby="side-library">
        <h2 className="side-title" id="side-library">
          Libreria materiali
        </h2>
        <label className="search">
          <span className="visually-hidden">Cerca materiale</span>
          <input type="search" id="librarySearch" placeholder="Cerca materiale…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <div className="active-material">
          <span className="sphere sphere-lg" aria-hidden="true" style={sphereStyle(doc)} />
          <span className="active-text">
            {renaming !== null ? (
              <form
                className="rename-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  session.rename(renaming);
                  setRenaming(null);
                }}
              >
                <label className="visually-hidden" htmlFor="renameInput">
                  Nome del materiale
                </label>
                <input id="renameInput" value={renaming} maxLength={80} autoFocus onChange={(e) => setRenaming(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setRenaming(null)} />
                <button type="submit" className="button small">
                  OK
                </button>
              </form>
            ) : (
              <strong id="activeName">{doc.name}</strong>
            )}
            <span className="active-name" id="activeOrigin" data-origin={origin}>
              {origin === 'builtin' ? (modified ? 'Preset incluso · modificato, non nella libreria' : 'Preset incluso · sola lettura') : 'Personale · salvataggio automatico'}
            </span>
          </span>
        </div>
        <div className="library-actions" role="group" aria-label="Azioni sul materiale">
          <button type="button" className="button small" id="libNew" onClick={() => void session.newMaterial()}>
            <Icon name="plus" /> Nuovo
          </button>
          <button type="button" className="button small" id="libDuplicate" onClick={() => void session.duplicate()}>
            <Icon name="copy" /> {origin === 'builtin' && modified ? 'Salva come copia' : 'Duplica'}
          </button>
          <button
            type="button"
            className="button small"
            id="libRename"
            disabled={origin !== 'user'}
            title={origin !== 'user' ? 'I preset inclusi non si rinominano: duplica per una copia personale' : undefined}
            onClick={() => setRenaming(doc.name)}
          >
            <Icon name="pencil" /> Rinomina
          </button>
          {origin === 'user' &&
            (confirmDelete === materialId ? (
              <span className="confirm">
                <button
                  type="button"
                  className="button small danger"
                  id="libDeleteConfirm"
                  onClick={() => {
                    setConfirmDelete(null);
                    void session.deleteMaterial(materialId);
                  }}
                >
                  Elimina davvero
                </button>
                <button type="button" className="button small" onClick={() => setConfirmDelete(null)}>
                  Annulla
                </button>
              </span>
            ) : (
              <button type="button" className="button small" id="libDelete" onClick={() => setConfirmDelete(materialId)}>
                <Icon name="trash" /> Elimina
              </button>
            ))}
        </div>
        <h3 className="side-sub">Preset inclusi</h3>
        <div className="preset-grid" role="group" aria-label="Preset inclusi Glass">
          {builtins.map(card)}
        </div>
        <h3 className="side-sub">Personali</h3>
        {personal.length ? (
          <div className="preset-grid" role="group" aria-label="Materiali personali" id="personalGrid">
            {personal.map(card)}
          </div>
        ) : (
          <p className="hint">{q ? 'Nessun materiale personale trovato.' : 'Nessuno ancora: duplica un preset o creane uno nuovo.'}</p>
        )}
        {!builtins.length && !personal.length && <p className="hint">Nessun materiale trovato.</p>}
        {skipped.length > 0 && <p className="param-note">Non leggibili: {skipped.join('; ')}</p>}
        <p className="side-caption">Altre famiglie · in sviluppo, non utilizzabili</p>
        <ul className="soon-grid" aria-label="Famiglie in sviluppo">
          {FAMILIES.filter((f) => f.status !== 'available').map((f) => (
            <li key={f.id} className="soon-card" title={f.description}>
              <span className="sphere sphere-soon" data-material={f.id} aria-hidden="true" />
              {f.label}
              <span className="visually-hidden">: {f.description}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="side-section" aria-labelledby="side-component">
        <h2 className="side-title" id="side-component">
          Componente
        </h2>
        <fieldset className="object-grid" id="tbObject" disabled={scene}>
          <legend className="visually-hidden">Componente in anteprima</legend>
          {OBJECTS.map((o) => (
            <label key={o.id} htmlFor={`tb-object-${o.id}`} className="object-card">
              <input type="radio" name="tbObject" value={o.id} id={`tb-object-${o.id}`} checked={options.object === o.id} onChange={() => session.setOption('object', o.id)} />
              <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d={OBJECT_ICONS[o.id]} />
              </svg>
              <span>{o.label}</span>
            </label>
          ))}
        </fieldset>
        {scene && <p className="param-note">In Scena controllata la lente è libera sulla texture: i componenti DOM tornano in Componenti reali.</p>}
        <div className="option">
          <label className="field side-field" htmlFor="opt-nav">
            <span>Voce navbar</span>
            <select id="opt-nav" value={options.nav} disabled={options.object !== 'navbar' || scene} onChange={(e) => session.setOption('nav', e.target.value as never)}>
              {NAV_ITEMS.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.label}
                </option>
              ))}
            </select>
          </label>
          <p className="param-note" hidden={options.object === 'navbar'}>
            Attivo in modalità Navbar.
          </p>
        </div>
        <div className="option">
          <label className="check" htmlFor="opt-components">
            <input id="opt-components" type="checkbox" checked={options.components} disabled={options.object !== 'capsule' || scene} onChange={(e) => session.setOption('components', e.target.checked)} />
            <span>Pulsante, selettore e slider di prova</span>
          </label>
          <p className="param-note" hidden={options.object === 'capsule'}>
            Solo con la capsula: gli altri componenti occupano il fondo dell’anteprima.
          </p>
        </div>
      </section>

      <section className="side-section" aria-labelledby="side-scenario">
        <h2 className="side-title" id="side-scenario">
          Sorgente e sfondo
        </h2>
        {scene ? (
          <fieldset className="texture-grid">
            <legend className="field-legend">Texture della scena (WebGL2)</legend>
            {(
              [
                ['pattern', 'Pattern deterministico'],
                ['image', 'Immagine di esempio'],
              ] as const
            ).map(([id, label]) => (
              <label key={id} className="check" htmlFor={`tb-texture-${id}`}>
                <input type="radio" name="tbTexture" id={`tb-texture-${id}`} checked={options.texture === id} onChange={() => session.setOption('texture', id)} />
                <span>{label}</span>
              </label>
            ))}
            <p className="hint">WebGL2 campiona solo questa texture: non legge il DOM della pagina.</p>
          </fieldset>
        ) : (
          <fieldset className="scene-grid" id="tbScene">
            <legend className="visually-hidden">Sfondo dietro il materiale</legend>
            {SCENES.map((s) => (
              <label key={s.id} htmlFor={`tb-scene-${s.id}`} className="scene-card" title={s.label}>
                <input type="radio" name="tbScene" value={s.id} id={`tb-scene-${s.id}`} checked={options.scene === s.id} onChange={() => session.setOption('scene', s.id)} />
                <span className="scene-thumb" data-thumb={s.id} aria-hidden="true" style={s.id === 'photo' ? { backgroundImage: `url("${PHOTO.src}")` } : undefined} />
                <span className="scene-name">{s.short}</span>
              </label>
            ))}
          </fieldset>
        )}
        <label className="button side-button" htmlFor="localImage">
          Usa un’immagine locale…
        </label>
        <input
          type="file"
          accept="image/*"
          id="localImage"
          className="visually-hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void session.setLocalImage(f);
            e.target.value = '';
          }}
        />
        <p className="hint">L’immagine resta in questo browser (IndexedDB); verso il telefono passa solo tramite il relay locale.</p>
        <div className="option">
          <label className="check" htmlFor="opt-animate">
            <input id="opt-animate" type="checkbox" checked={options.animate} onChange={(e) => session.setOption('animate', e.target.checked)} />
            <span>Anima sfondo</span>
          </label>
          <p className="param-note" hidden={!reducedMotion}>
            Movimento ridotto attivo: lo sfondo resta fermo.
          </p>
        </div>
      </section>

      <section className="side-section" aria-labelledby="side-environment">
        <h2 className="side-title" id="side-environment">
          Ambiente
        </h2>
        <div className="option">
          <label className="field side-field" htmlFor="opt-theme">
            <span>Tema</span>
            <select id="opt-theme" value={options.theme} onChange={(e) => session.setOption('theme', e.target.value as never)}>
              <option value="system">Sistema</option>
              <option value="light">Chiaro</option>
              <option value="dark">Scuro</option>
            </select>
          </label>
        </div>
        <div className="option">
          <label className="check" htmlFor="opt-reduceMotion">
            <input id="opt-reduceMotion" type="checkbox" checked={options.reduceMotion} onChange={(e) => session.setOption('reduceMotion', e.target.checked)} />
            <span>Riduci effetti e movimento</span>
          </label>
          <p className="hint">Disattiva molla, elasticità, scala e animazione dello sfondo.</p>
        </div>
        <div className="option">
          <label className="check" htmlFor="opt-reduceTransparency">
            <input id="opt-reduceTransparency" type="checkbox" checked={options.reduceTransparency} onChange={(e) => session.setOption('reduceTransparency', e.target.checked)} />
            <span>Riduci trasparenza</span>
          </label>
          <p className="hint">Forza il materiale opaco, come prefers-reduced-transparency.</p>
        </div>
      </section>
    </>
  );
}
