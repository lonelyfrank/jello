/**
 * An application that knows nothing about Jello Studio: it installs the
 * exported package, renders its content (the GlassSource) and lets the bar
 * report which tab was chosen. Navigation is the app's own state.
 */
import { useRef, useState } from 'react';
import { MobileNavbar, config, tabs, type MobileNavbarTabId, type BottomNavigationEvent } from '@jello-export/mobile-navbar';
import { CallToActionButton, type ButtonEvent } from '@jello-export/call-to-action';
import { SolidLinkButton } from '@jello-export/solid-link';

declare global {
  interface Window {
    __consumer: { selected: MobileNavbarTabId; events: string[]; buttons: string[] };
  }
}

// The exported definition: items are the children of the root, their label is the text of their label slot.
const DEFAULT_TAB = config.interactions.behavior.defaultItem as MobileNavbarTabId;
const LABEL = Object.fromEntries(config.structure.children!.map((n) => [n.id, config.content[n.children!.find((c) => c.role === 'label')!.id]!.text])) as Record<MobileNavbarTabId, string>;
window.__consumer = { selected: DEFAULT_TAB, events: [], buttons: [] };

export function App() {
  const content = useRef<HTMLElement>(null);
  const [tab, setTab] = useState<MobileNavbarTabId>(DEFAULT_TAB);
  const [off, setOff] = useState(false);
  const [label, setLabel] = useState<string | undefined>(undefined);
  const button = (name: string) => (e: ButtonEvent) => window.__consumer.buttons.push(`${name}:${e.trigger}:${e.value ?? ''}:${e.href ?? ''}`);
  const log = (name: string) => (id: MobileNavbarTabId, e: BottomNavigationEvent) => window.__consumer.events.push(`${name}:${id}:${e.value ?? ''}`);
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
      {/* The exported buttons: one Glass action over the content, one Solid link that needs no source. */}
      <div className="actions">
        <CallToActionButton sourceRef={content} disabled={off} {...(label ? { label } : {})} onPress={button('press')} onHover={button('hover')} onFocus={button('focus')} />
        <SolidLinkButton>Documentazione</SolidLinkButton>
        <label className="toggle">
          <input id="off" type="checkbox" checked={off} onChange={(e) => setOff(e.target.checked)} /> Disabilita
        </label>
        <button id="relabel" type="button" onClick={() => setLabel('Vai')}>
          Cambia testo
        </button>
      </div>
      <MobileNavbar
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
