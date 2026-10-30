import '../stage/theme.css';
import '../core/glass.css';
import '../stage/stage.css';
import './fonts.css';
import './lab.css';
import './design.css';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { installHook } from './hook';
import { LabSession } from './session';

const session = await LabSession.boot();
const root = createRoot(document.getElementById('app')!);
root.render(<App session={session} />);
session.onReady(() => {
  installHook(session);
  // Two frames: React committed and the preview measured its surfaces.
  requestAnimationFrame(() => requestAnimationFrame(() => (document.documentElement.dataset.ready = 'true')));
});
