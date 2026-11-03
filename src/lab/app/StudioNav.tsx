import type { LabSession } from '../session';
import { useLab } from '../store';
import { setStudioPreferences, useStudioPreferences } from '../studio-preferences';
import { Ic, type IcName } from './ui';

const BASE = import.meta.env.BASE_URL;

export function openStudio(session: LabSession, area: 'workspace' | 'builder' | 'material' | 'library' | 'preview' | 'jelly' | 'export') {
  if (area === 'workspace') { setStudioPreferences({ area: 'editor' }); session.setPage('home'); }
  else if (area === 'export') session.setExportOpen(true);
  else {
    setStudioPreferences({ area: area === 'library' || area === 'preview' || area === 'jelly' ? area : 'editor' });
    session.setPage('lab', area === 'builder' ? 'builder' : area === 'material' ? 'material' : undefined);
  }
}

type RailId = Parameters<typeof openStudio>[1] | 'assets';

/** Persistent left rail of «Jello Studio»: brand, quick create, the six areas, assets, save state and settings. */
export function StudioRail({ session, saveShort, saveFull, saveKind, onCreate, createOpen }: { session: LabSession; saveShort: string; saveFull: string; saveKind: string | null; onCreate(): void; createOpen: boolean }) {
  const page = useLab((s) => s.page);
  const flow = useLab((s) => s.flow);
  const workspace = useLab((s) => s.workspace);
  const hasProject = useLab((s) => s.projectId !== null);
  const { area } = useStudioPreferences();
  const active: RailId | '' = flow === 'export' ? 'export'
    : flow ? ''
    : page === 'home' ? 'workspace'
    : page === 'assets' ? 'assets'
    : page === 'lab' ? (area === 'editor' ? workspace : area)
    : '';
  const items: { id: RailId; label: string; full: string; icon: IcName; domId: string }[] = [
    { id: 'workspace', label: 'Home', full: 'Workspace', icon: 'home', domId: 'ws-home' },
    { id: 'builder', label: 'Builder', full: 'Component Builder', icon: 'layers', domId: 'ws-builder' },
    { id: 'material', label: 'Materiali', full: 'Material Lab', icon: 'drop', domId: 'ws-material' },
    { id: 'library', label: 'Library', full: 'Library', icon: 'grid', domId: 'ws-library' },
    { id: 'preview', label: 'Test', full: 'Preview & Test', icon: 'eye', domId: 'ws-preview' },
    { id: 'export', label: 'Export', full: 'Export', icon: 'download', domId: 'ws-export' },
    { id: 'assets', label: 'Asset', full: 'Asset del progetto', icon: 'palette', domId: 'nav-assets' },
    { id: 'jelly', label: 'Jello β', full: 'Jello Lab · sperimentale', icon: 'jelly', domId: 'ws-jelly' },
  ];
  const go = (id: RailId) => (id === 'assets' ? session.setPage('assets') : openStudio(session, id));
  // Without a project every area but the Workspace waits for one. `aria-disabled` (not `disabled`) keeps the button
  // focusable, so keyboard and screen-reader users reach the reason instead of a dead control.
  const item = (it: (typeof items)[number]) => {
    const locked = it.id !== 'workspace' && !hasProject;
    return (
      <button key={it.id} type="button" className="rail-i" id={it.domId} title={locked ? `${it.full}: serve un progetto` : it.full} aria-label={it.full} aria-current={active === it.id ? 'page' : undefined} aria-disabled={locked || undefined} aria-describedby={locked ? 'railNeedsProject' : undefined} onClick={() => !locked && go(it.id)}>
        <span className="rail-ic"><Ic name={it.icon} size={20} /></span>
        <span className="rail-label">{it.label}</span>
      </button>
    );
  };
  return (
    <nav className="studio-rail" aria-label="Navigazione principale">
      <button type="button" className="rail-brand" id="brandHome" aria-label="Jello: vai alla Home" title="Jello Studio · Home" onClick={() => openStudio(session, 'workspace')}>
        <img className="brand-mark" src={`${BASE}brand/jello-mark-96.png`} srcSet={`${BASE}brand/jello-mark-96.png 1x, ${BASE}brand/jello-mark-192.png 2x`} alt="" width="40" height="33" />
        <span className="visually-hidden">Jello Studio</span>
      </button>
      <button type="button" className="rail-i rail-create" id="headerNewProject" aria-label="Crea" title="Crea" aria-haspopup="dialog" aria-expanded={createOpen} onClick={onCreate}>
        <span className="rail-ic"><Ic name="plus" size={20} /></span>
        <span className="rail-label">Crea</span>
      </button>
      <span className="rail-div" aria-hidden="true" />
      {!hasProject && <span className="visually-hidden" id="railNeedsProject">Serve un progetto: crealo o importalo dalla Home.</span>}
      {items.slice(0, 6).map(item)}
      <span className="rail-div" aria-hidden="true" />
      {item(items[6]!)}
      <span className="rail-div" aria-hidden="true" />
      {item(items[7]!)}
      <span className="rail-grow" />
      {hasProject && saveKind !== null && (
        <p className="rail-save" id="saveStatus" role="status" data-kind={saveKind} title={saveFull}>
          <Ic name={saveKind === 'error' || saveKind === 'memory' ? 'alert' : saveKind === 'saved' ? 'check' : 'clock'} size={16} />
          <span aria-hidden="true">{saveShort}</span>
          <span className="visually-hidden">{saveFull}</span>
        </p>
      )}
      <button type="button" className="rail-i rail-settings" id="studioSettings" aria-label="Impostazioni" title="Impostazioni" aria-current={page === 'settings' && !flow ? 'page' : undefined} onClick={() => session.setPage('settings')}>
        <span className="rail-ic"><Ic name="gear" size={20} /></span>
      </button>
    </nav>
  );
}
