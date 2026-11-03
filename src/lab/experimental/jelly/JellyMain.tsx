/**
 * Lazy entry of the experimental Jelly area. Loaded with a dynamic import the first time the
 * area is opened, so no Jelly module, renderer or stylesheet is part of the Studio's startup.
 * Uses the Studio's own columns, drawer and resize handles: same layout, same responsive rules.
 */
import { useEffect, useRef, useState } from 'react';
import type { LabSession } from '../../session';
import { useLab } from '../../store';
import { useStudioPreferences } from '../../studio-preferences';
import { PanelResize } from '../../app/PanelResize';
import { JellyInspector } from './JellyInspector';
import { JellyLibrary } from './JellyLibrary';
import { JellyPreview } from './JellyPreview';
import { loadJellyStudio, primaryBridge, type JellyStudio } from './studio';
import './jelly-lab.css';

declare global { interface Window { __jelloJelly?: { bridge(): ReturnType<typeof primaryBridge>; state(): unknown } } }

export default function JellyMain({ session, active }: { session: LabSession; active: boolean }) {
  const [studio, setStudio] = useState<JellyStudio | null>(null);
  const projectId = useLab((s) => s.projectId);
  const layout = useLab((s) => s.layout);
  const prefs = useStudioPreferences();
  const drawer = useRef<HTMLDivElement>(null);

  useEffect(() => { void loadJellyStudio().then(setStudio); }, []);
  useEffect(() => { void studio?.workbench.open(projectId); }, [studio, projectId]);
  useEffect(() => {
    if (!studio) return;
    // Inspection hook for tests, like window.__jello: read-only views of the live objects.
    window.__jelloJelly = { bridge: primaryBridge, state: () => studio.workbench.get() };
    return () => { Reflect.deleteProperty(window, '__jelloJelly'); };
  }, [studio]);
  useEffect(() => { if (active && layout.drawer) drawer.current?.focus({ preventScroll: true }); }, [active, layout.drawer]);

  const closeDrawer = () => session.setDrawer(false);
  return (
    <main className="lab jl-lab" id="jelly-lab" hidden={!active} data-studio-area="jelly" data-left={layout.left ? 'open' : 'closed'} data-right={layout.right ? 'open' : 'closed'} style={{ ['--side-w' as string]: `${layout.left ? prefs.leftWidth : 0}px`, ['--panel-w' as string]: `${layout.right ? prefs.rightWidth : 0}px` }}>
      {studio ? <JellyPreview wb={studio.workbench} /> : <section className="preview"><p className="hint" role="status">Caricamento di Jello…</p></section>}
      <PanelResize side="left" visible={layout.left} /><PanelResize side="right" visible={layout.right} />
      <div className={`controls${layout.drawer ? ' is-open' : ''}`} id="jl-controls" tabIndex={-1} ref={drawer} onKeyDown={(ev) => { if (ev.key === 'Escape' && layout.drawer) closeDrawer(); }}>
        <div className="controls-bar">
          <span className="controls-title">Regolazioni Jello</span>
          <nav className="controls-jump" aria-label="Sezioni">
            <a href="#jl-sidebar">Preset e documento</a>
            <a href="#jl-panel">Inspector</a>
          </nav>
          <button className="button" id="jl-panelClose" type="button" onClick={closeDrawer}>Chiudi</button>
        </div>
        <aside className="sidebar" id="jl-sidebar" aria-label="Preset Jello e documento" hidden={!layout.left}>
          {studio && <JellyLibrary wb={studio.workbench} session={session} repo={studio.repo} />}
        </aside>
        <aside className="panel" id="jl-panel" aria-label="Inspector Jello sperimentale" tabIndex={-1} hidden={!layout.right}>
          {studio && <JellyInspector wb={studio.workbench} />}
        </aside>
      </div>
    </main>
  );
}
