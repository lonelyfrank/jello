import type { LabSession } from '../session';
import { useLab } from '../store';
import { setStudioPreferences, useStudioPreferences } from '../studio-preferences';
import { Ic, type IcName } from './ui';

export function openStudio(session: LabSession, area: 'workspace' | 'builder' | 'material' | 'library' | 'preview' | 'export') {
  if (area === 'workspace') { setStudioPreferences({ area: 'editor' }); session.setPage('home'); }
  else if (area === 'export') session.setExportOpen(true);
  else {
    setStudioPreferences({ area: area === 'library' || area === 'preview' ? area : 'editor' });
    session.setPage('lab', area === 'builder' ? 'builder' : area === 'material' ? 'material' : undefined);
  }
}

export function StudioNav({ session }: { session: LabSession }) {
  const page = useLab((s) => s.page);
  const flow = useLab((s) => s.flow);
  const workspace = useLab((s) => s.workspace);
  const hasProject = useLab((s) => s.projectId !== null);
  const { area } = useStudioPreferences();
  const active = flow === 'export' ? 'export' : page === 'home' && !flow ? 'workspace' : page === 'lab' && !flow ? area === 'editor' ? workspace : area : '';
  const items: { id: Parameters<typeof openStudio>[1]; label: string; icon: IcName; domId?: string }[] = [
    { id: 'workspace', label: 'Workspace', icon: 'folder', domId: 'ws-home' },
    { id: 'builder', label: 'Component Builder', icon: 'layers', domId: 'ws-builder' },
    { id: 'material', label: 'Material Lab', icon: 'drop', domId: 'ws-material' },
    { id: 'library', label: 'Library', icon: 'grid', domId: 'ws-library' },
    { id: 'preview', label: 'Preview & Test', icon: 'eye', domId: 'ws-preview' },
    { id: 'export', label: 'Export', icon: 'download', domId: 'ws-export' },
  ];
  return <nav className="studio-nav" aria-label="Navigazione principale">{items.map((item) =>
    <button key={item.id} type="button" id={item.domId} aria-current={active === item.id ? 'page' : undefined} aria-pressed={active === item.id} disabled={item.id !== 'workspace' && !hasProject} onClick={() => openStudio(session, item.id)}>
      <Ic name={item.icon} size={16} /><span>{item.label}</span>
    </button>
  )}</nav>;
}
