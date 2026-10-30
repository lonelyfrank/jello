import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { LabSession } from '../session';
import { useLab } from '../store';
import { Ic, type IcName } from './ui';

interface Hit {
  key: string;
  icon: IcName;
  kind: string;
  label: string;
  run(): void;
}

/** Search across projects, materials, components and assets; Ctrl/⌘ + K focuses it. */
export function GlobalSearch({ session }: { session: LabSession }) {
  const projects = useLab((s) => s.projects);
  const library = useLab((s) => s.library);
  const components = useLab((s) => s.components);
  const project = useLab((s) => s.projects.find((p) => p.id === s.projectId) ?? null);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        input.current?.focus();
      }
    };
    document.addEventListener('keydown', on);
    return () => document.removeEventListener('keydown', on);
  }, []);

  const hits = useMemo<Hit[]>(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    const has = (s: string) => s.toLowerCase().includes(t);
    const out: Hit[] = [];
    for (const p of projects) if (has(p.name)) out.push({ key: `p-${p.id}`, icon: 'folder', kind: 'Progetto', label: p.name, run: () => (session.switchProject(p.id), session.setPage('lab', 'material')) });
    for (const m of library) if (has(m.name)) out.push({ key: `m-${m.id}`, icon: 'drop', kind: m.origin === 'user' ? 'Materiale' : 'Materiale Jello', label: m.name, run: () => (session.openMaterial(m.id), session.setPage('lab', 'material')) });
    for (const c of components) if (has(c.name)) out.push({ key: `c-${c.id}`, icon: 'box', kind: 'Componente', label: c.name, run: () => (session.openComponent(c.id), session.setPage('lab', 'builder')) });
    for (const pal of project?.assets.palettes ?? []) for (const c of pal.colors) if (has(c.name) || has(c.hex) || has(c.token)) out.push({ key: `col-${c.id}`, icon: 'palette', kind: 'Colore', label: `${c.name} · ${c.hex.toUpperCase()}`, run: () => session.setAssetTab('colors') });
    for (const s of project?.assets.iconSets ?? []) for (const i of s.icons) if (has(i.name)) out.push({ key: `i-${i.id}`, icon: 'image', kind: 'Icona', label: i.name, run: () => session.setAssetTab('icons') });
    for (const f of project?.assets.fonts ?? []) if (has(f.name)) out.push({ key: `f-${f.id}`, icon: 'type', kind: 'Font', label: f.name, run: () => session.setAssetTab('fonts') });
    return out.slice(0, 12);
  }, [q, projects, library, components, project, session]);

  const go = (h: Hit) => {
    h.run();
    setQ('');
    setOpen(false);
  };

  return (
    <div className="gsearch" role="search">
      <label className="gsearch-field">
        <Ic name="search" />
        <span className="visually-hidden">Cerca</span>
        <input
          ref={input}
          type="search"
          role="combobox"
          aria-expanded={open && q.trim() !== ''}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={hits[active] ? `${listId}-${active}` : undefined}
          placeholder="Cerca progetti, materiali, asset…"
          value={q}
          autoComplete="off"
          onChange={(e) => (setQ(e.target.value), setOpen(true), setActive(0))}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') (e.preventDefault(), setActive(Math.min(hits.length - 1, active + 1)));
            else if (e.key === 'ArrowUp') (e.preventDefault(), setActive(Math.max(0, active - 1)));
            else if (e.key === 'Enter' && hits[active]) go(hits[active]!);
            else if (e.key === 'Escape') (setQ(''), setOpen(false));
          }}
        />
        <kbd aria-hidden="true">Ctrl K</kbd>
      </label>
      {open && q.trim() !== '' && (
        <ul className="gsearch-list" id={listId} role="listbox" aria-label="Risultati">
          {hits.length === 0 && (
            <li className="gsearch-empty" role="option" aria-selected="false">
              Nessun risultato per “{q}”
            </li>
          )}
          {hits.map((h, i) => (
            <li key={h.key} id={`${listId}-${i}`} role="option" aria-selected={i === active} className="gsearch-hit" onMouseDown={(e) => (e.preventDefault(), go(h))}>
              <Ic name={h.icon} />
              <span>{h.label}</span>
              <span className="muted small">{h.kind}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
