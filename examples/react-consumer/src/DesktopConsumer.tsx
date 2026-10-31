/** Independent app: only installed exports, no Studio sources. StrictMode exercises cleanup. */
import { useRef, useState } from 'react';
import { DesktopGlassNavigation, config as glassConfig, type DesktopGlassItemId } from '@jello-export/desktop-glass';
import { DesktopSolidNavigation, config as solidConfig } from '@jello-export/desktop-solid';
import '@jello-export/desktop-glass/style.css';
import '@jello-export/desktop-solid/style.css';

export function DesktopConsumer() {
  const solid = new URLSearchParams(location.search).get('desktop') === 'solid';
  const Component = solid ? DesktopSolidNavigation : DesktopGlassNavigation;
  const config = solid ? solidConfig : glassConfig;
  const [active, setActive] = useState<DesktopGlassItemId>('home');
  const [mounted, setMounted] = useState(true);
  const [log, setLog] = useState<string[]>([]);
  const [alternate, setAlternate] = useState(false);
  const [changed, setChanged] = useState(false);
  const source = useRef<HTMLElement>(null);
  const current = changed ? { ...config, content: { ...config.content, 'brand-label': { text: 'Updated studio' } } } : config;
  return <div style={{ position: 'relative', minHeight: '100vh' }}>
    <main ref={source} id="desktop-source" style={{ position: 'absolute', inset: 0, background: '#eef2ff', color: '#111' }}><h1>Independent Desktop consumer</h1></main>
    <header id="desktop-slot" style={{ position: 'relative', padding: 12, width: '100%', boxSizing: 'border-box' }}>
      {mounted && <Component config={current} {...(solid ? {} : { sourceRef: source })} activeItem={active}
        onChange={setActive}
        onAction={(id, e) => setLog((list) => [...list, `${alternate ? 'new' : 'action'}:${id}:${e.action.kind}:${e.action.kind === 'consumer' ? e.action.name : e.value}`])}
        onFocus={(id) => setLog((list) => [...list, `focus:${id}`])}
      />}
    </header>
    <section style={{ position: 'relative', marginTop: 140, padding: 16, background: '#fff', color: '#111' }}>
      <output id="desktop-active">{active}</output>
      <button id="desktop-toggle" onClick={() => setMounted(!mounted)}>Mount / destroy</button>
      <button id="desktop-active-api" onClick={() => setActive('settings')}>Set active link</button>
      <button id="desktop-callback" onClick={() => setAlternate(!alternate)}>Replace callback</button>
      <button id="desktop-update" onClick={() => setChanged(!changed)}>Update config</button>
      <pre id="desktop-events">{log.join('\n')}</pre>
    </section>
  </div>;
}
