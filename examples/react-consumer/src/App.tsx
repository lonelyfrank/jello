/**
 * An application that knows nothing about Jello Studio: it installs the
 * exported package, renders its content (the GlassSource) and lets the bar
 * report which tab was chosen. Navigation is the app's own state.
 */
import { useRef, useState } from 'react';
import { BtDartsNavigation, config, tabs, type BtDartsTabId, type BottomNavigationEvent } from '@jello-export/bt-darts';

declare global {
  interface Window {
    __consumer: { selected: BtDartsTabId; events: string[] };
  }
}

const LABEL = Object.fromEntries(config.root.children.map((t) => [t.id, t.label])) as Record<BtDartsTabId, string>;
window.__consumer = { selected: config.root.defaultTab as BtDartsTabId, events: [] };

export function App() {
  const content = useRef<HTMLElement>(null);
  const [tab, setTab] = useState<BtDartsTabId>(config.root.defaultTab as BtDartsTabId);
  const log = (name: string) => (id: BtDartsTabId, e: BottomNavigationEvent) => window.__consumer.events.push(`${name}:${id}:${e.value ?? ''}`);
  return (
    <>
      <main ref={content} className="content" id="content" tabIndex={0} aria-labelledby="title">
        <p className="badge">App esterna · pacchetto esportato</p>
        <h1 id="title">{LABEL[tab]}</h1>
        <p>Tab disponibili: {tabs.join(', ')}.</p>
        <ol className="rows">
          {Array.from({ length: 24 }, (_, i) => (
            <li key={i} style={{ background: ['#0a84ff', '#ff453a', '#30d158', '#ff9f0a'][i % 4] }}>
              {LABEL[tab]} · riga {i + 1}
            </li>
          ))}
        </ol>
      </main>
      <BtDartsNavigation
        sourceRef={content}
        activeTab={tab}
        onChange={(id, e) => {
          log('change')(id, e);
          window.__consumer.selected = id;
          setTab(id);
        }}
        onTabPress={log('press')}
        onReselect={(id, e) => {
          log('reselect')(id, e);
          content.current?.scrollTo({ top: 0 });
        }}
      />
    </>
  );
}
