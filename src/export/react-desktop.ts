/** Desktop React integration only. DOM, materials, actions and lifecycle belong to DesktopNavigation. */
import { navbarActiveItem, navbarItems, resolveDefinitionMaterial, serializeDefinition, type ComponentDefinition } from '../components';
import { serializeMaterial } from '../model';
import type { ReactNames } from './react';

const ids = (doc: ComponentDefinition) => navbarItems(doc).map((n) => JSON.stringify(n.id)).join(' | ');

function props(n: ReactNames): string {
  return `export interface JelloDesktopNavigationProps<ItemId extends string = string> {
  config?: DesktopNavbarDefinition;
  activeItem?: ItemId;
  defaultActiveItem?: ItemId;
  onChange?: (id: ItemId, event: DesktopNavigationEvent) => void;
  onTabPress?: (id: ItemId, event: DesktopNavigationEvent) => void;
  onReselect?: (id: ItemId, event: DesktopNavigationEvent) => void;
  onAction?: (id: ItemId, event: DesktopNavigationActionEvent) => void;
  onHover?: (id: ItemId, event: DesktopNavigationEvent) => void;
  onFocus?: (id: ItemId, event: DesktopNavigationEvent) => void;
  sourceRef?: RefObject<HTMLElement | null>;
  scrollerRef?: RefObject<HTMLElement | null>;
  backend?: BackendRequest;
  className?: string;
  'aria-label'?: string;
}
export type ${n.component}Props = JelloDesktopNavigationProps<${n.tabType}>;
`;
}

/** Shared source generator keeps the shipped ESM and optional TSX wrapper equivalent. */
function source(doc: ComponentDefinition, n: ReactNames, ts: boolean): string {
  const rt = ts ? '../runtime/jello.js' : './runtime/jello.js';
  return `import { createElement, useEffect, useLayoutEffect, useRef${ts ? ", type ReactElement, type RefObject" : ''} } from 'react';
import { createComponent${ts ? ', type DesktopNavigation as DesktopNavigationInstance, type DesktopNavigationOptions, type DesktopNavbarDefinition, type DesktopNavigationEvent, type DesktopNavigationActionEvent, type MaterialDocument, type BackendRequest' : ''} } from '${rt}';
${ts ? "import exported from '../component.json';\nexport const config = exported as DesktopNavbarDefinition;" : `export const config = ${serializeDefinition(doc)};`}
export const material${ts ? ': MaterialDocument' : ''} = ${serializeMaterial(resolveDefinitionMaterial(doc))};
export const items = ${JSON.stringify(navbarItems(doc).map((item) => item.id))}${ts ? ' as const' : ''};
${ts ? `export type ${n.tabType} = ${ids(doc)};\n${props(n)}` : ''}
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export function JelloDesktopNavigation${ts ? '<ItemId extends string = string>' : ''}(props${ts ? ': JelloDesktopNavigationProps<ItemId>' : ''})${ts ? ': ReactElement' : ''} {
  const { config: doc = config, activeItem, defaultActiveItem, sourceRef, scrollerRef, backend, className } = props;
  const label = props['aria-label'];
  const slot = useRef${ts ? '<HTMLDivElement>' : ''}(null);
  const nav = useRef${ts ? '<DesktopNavigationInstance | null>' : ''}(null);
  const latest = useRef(props);
  latest.current = props;
  const controlled = activeItem !== undefined;

  useIsoLayoutEffect(() => {
    const options${ts ? ': DesktopNavigationOptions' : ''} = {
      container: slot.current${ts ? '!' : ''}, config: doc,
      source: sourceRef?.current ?? null,
      scroller: scrollerRef?.current ?? sourceRef?.current ?? null,
      activeItem: activeItem ?? defaultActiveItem ?? null, controlled,
      onChange: (id, e) => latest.current.onChange?.(id${ts ? ' as ItemId' : ''}, e),
      onTabPress: (id, e) => latest.current.onTabPress?.(id${ts ? ' as ItemId' : ''}, e),
      onReselect: (id, e) => latest.current.onReselect?.(id${ts ? ' as ItemId' : ''}, e),
      onAction: (id, e) => latest.current.onAction?.(id${ts ? ' as ItemId' : ''}, e),
      onHover: (id, e) => latest.current.onHover?.(id${ts ? ' as ItemId' : ''}, e),
      onFocus: (id, e) => latest.current.onFocus?.(id${ts ? ' as ItemId' : ''}, e),
      ...(backend ? { backend } : {}), ...(label ? { label } : {}),
    };
    const instance = createComponent(options);
    try { instance.mount(); }
    catch (error) { instance.destroy(); throw error; }
    if (className) instance.host.classList.add(...className.split(/\\s+/).filter(Boolean));
    nav.current = instance;
    return () => { instance.destroy(); nav.current = null; };
  }, [sourceRef, scrollerRef, backend, controlled, label, className]);

  useIsoLayoutEffect(() => {
    nav.current?.update(doc);
    if (controlled && activeItem != null) nav.current?.setActiveItem(activeItem);
  }, [doc, controlled, activeItem]);

  return createElement('div', { ref: slot, style: { display: 'contents' }, 'data-jello-component': doc.id });
}

export function ${n.component}(props${ts ? `: ${n.component}Props` : ''})${ts ? ': ReactElement' : ''} {
  return createElement(JelloDesktopNavigation${ts ? `<${n.tabType}>` : ''}, props);
}
export default ${n.component};
`;
}

export const desktopIndexJs = (doc: ComponentDefinition, n: ReactNames) => source(doc, n, false);
export const desktopTsx = (doc: ComponentDefinition, n: ReactNames) => source(doc, n, true);
export function desktopIndexDts(doc: ComponentDefinition, n: ReactNames): string {
  return `import type { ReactElement, RefObject } from 'react';
import type { BackendRequest, DesktopNavbarDefinition, DesktopNavigationEvent, DesktopNavigationActionEvent, MaterialDocument } from './runtime/jello.js';
export type { DesktopNavbarDefinition, DesktopNavigationEvent, DesktopNavigationActionEvent } from './runtime/jello.js';
export type ${n.tabType} = ${ids(doc)};
${props(n)}
export declare const config: DesktopNavbarDefinition;
export declare const material: MaterialDocument;
export declare const items: readonly ${n.tabType}[];
export declare function JelloDesktopNavigation<ItemId extends string = string>(props: JelloDesktopNavigationProps<ItemId>): ReactElement;
export declare function ${n.component}(props: ${n.component}Props): ReactElement;
export default ${n.component};
`;
}

export function desktopExample(doc: ComponentDefinition, n: ReactNames): string {
  return `import { useRef, useState } from 'react';
import { ${n.component}, type ${n.tabType} } from '${n.packageName}';
import '${n.packageName}/style.css';

export function App() {
  const source = useRef<HTMLElement>(null);
  const [active, setActive] = useState<${n.tabType}>(${JSON.stringify(navbarActiveItem(doc))});
  return <div style={{ position: 'relative', minHeight: '100vh' }}>
    <main ref={source} style={{ position: 'absolute', inset: 0, background: '#eef2ff' }}><h1>{active}</h1></main>
    <header style={{ position: 'relative', padding: 16 }}>
      <${n.component} sourceRef={source} activeItem={active} onChange={setActive}
        onAction={(id, event) => { if (event.action.kind === 'consumer') console.log(event.action.name, id, event.value); }} />
    </header>
  </div>;
}
`;
}

export function desktopReadme(doc: ComponentDefinition, n: ReactNames, warnings: string[]): string {
  return `# ${doc.name} · React

Desktop Navbar: wrapper di DesktopNavigation, stesso runtime dello Studio incluso in runtime/. Nessuna dipendenza dallo Studio o da un router.

## Installazione e integrazione

\`npm install ./${n.root}\` (peer: react e react-dom >=18). Importa il componente da \`${n.packageName}\` e \`${n.packageName}/style.css\`. Vedi example/App.tsx e src/${n.component}.tsx (sorgente equivalente, resolveJsonModule richiesto).

Props: config (DesktopNavbarDefinition canonica, default esportato), activeItem/onChange per stato controllato, defaultActiveItem per stato non controllato; onTabPress, onReselect, onAction, onHover, onFocus. Ogni callback riceve (id, event): itemId, tabId, previous, value, index, trigger. onAction aggiunge event.action (select, navigate con href/target, consumer con name). Brand e azioni consumer non cambiano selezione. I link sono nativi; il router può marcare un link con activeItem. Gli eventi DOM personalizzabili sono dichiarati in component.json.

sourceRef: contenuto DOM opaco dietro la barra, separato dal contenitore e mai suo antenato. Glass con source usa SVG se disponibile, altrimenti CSS e opaco; senza source usa CSS senza rifrazione. Solid non richiede source. scrollerRef, backend, className, aria-label sono facoltativi. WebGL2 non rifrange i componenti DOM.

React gestisce solo lo slot. Il wrapper aggiorna in luogo config e selezione, legge sempre i callback più recenti e chiama destroy allo smontaggio; supporta StrictMode e rendering server senza accessi DOM durante render. Modificare sourceRef/scrollerRef/backend ricrea l’istanza.

## Struttura, responsive e accessibilità

Start/Main/End, brand, gruppi logici piatti, voci e azioni provengono da component.json. I gruppi non generano dropdown. I breakpoint canonici leggono la larghezza del contenitore, incluso uno slot display:contents. Nessuna conversione Mobile, hamburger o menu implicito. L’overflow resta scorribile. Semantica navigation; tabs senza pannelli non supportate. Tab/Shift+Tab, frecce, Home/End, Enter/Space e focus visibile usano il runtime comune. Hidden esclude dal DOM; disabled esclude dall’attivazione. Supportate le preferenze reduced-motion, reduced-transparency e forced-colors.

Il CSS ha namespace jello-* e --jbn-*. Geometria Desktop nel normale flusso. material.json contiene il materiale risolto; component.json mantiene il collegamento al preset e i suoi valori inclusi. jello-manifest.json elenca runtime, eventi, dipendenze e SHA-256 dei file.

${warnings.length ? '## Limiti\n\n' + warnings.map((w) => '- ' + w).join('\n') : 'Nessuna proprietà descritta ignorata con il materiale corrente.'}
`;
}
