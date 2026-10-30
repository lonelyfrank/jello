/**
 * Files of the React package that are specific to a `button` definition:
 * the wrapper (compiled and as TSX), its types, the example and the README.
 * The wrapper mounts the runtime's `JelloButton` — the class the lab's preview
 * runs — and maps props to it; there is no second renderer for export.
 */

import { BUTTON_FIELDS, buttonNodes, getPath, resolveButton, unsupportedProperties, type ComponentDefinition } from '../components';
import { RUNTIME_VERSION } from './model-deps';
import type { ReactNames } from './react';

export function buttonIndexJs(doc: ComponentDefinition, n: ReactNames, materialName: string, config: string): string {
  return `/**
 * ${doc.name} — componente React esportato da Jello (Button, materiale ${materialName}).
 * Usa solo il runtime incluso in ./runtime: lo stesso renderer dell'anteprima del laboratorio.
 * Un'azione (<button>) riporta la pressione con onPress; un collegamento (<a href>) lo segue il browser.
 */
import { createElement, useEffect, useLayoutEffect, useRef } from 'react';
import { createButton } from './runtime/jello.js';

/** Documento jello-component-definition (materiale incluso), identico a component.json. */
export const config = ${config};

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export function JelloButton(props) {
  const { config: doc = config, sourceRef, backend, className, disabled, label, children } = props;
  const text = label ?? (typeof children === 'string' ? children : undefined);
  const slot = useRef(null);
  const button = useRef(null);
  const latest = useRef(props);
  latest.current = props;

  useIsoLayoutEffect(() => {
    const options = {
      container: slot.current,
      config: doc,
      source: sourceRef?.current ?? null,
      onPress: (e) => latest.current.onPress?.(e),
      onHover: (e) => latest.current.onHover?.(e),
      onFocus: (e) => latest.current.onFocus?.(e),
    };
    if (text !== undefined) options.label = text;
    if (disabled !== undefined) options.disabled = disabled;
    if (backend) options.backend = backend;
    if (className) options.className = className;
    const b = createButton(options);
    button.current = b;
    return () => {
      b.destroy();
      button.current = null;
    };
    // Re-created only when what the button is attached to changes; the rest is updated in place.
  }, [sourceRef, backend, className]);

  useEffect(() => {
    button.current?.update(doc);
  }, [doc]);
  useEffect(() => {
    button.current?.setLabel(text ?? null);
  }, [text]);
  useEffect(() => {
    button.current?.setDisabled(disabled ?? null);
  }, [disabled]);

  // React owns this box and never its content: the button lives inside, laid out by the parent (display: contents).
  return createElement('div', { ref: slot, style: { display: 'contents' }, 'data-jello-component': doc.id });
}

export function ${n.component}(props) {
  return createElement(JelloButton, { ...props, config });
}

export default ${n.component};
`;
}

export function buttonIndexDts(doc: ComponentDefinition, n: ReactNames): string {
  return `import type { ReactElement, RefObject } from 'react';
import type { BackendRequest, ButtonEvent, ComponentDefinition } from './runtime/jello.js';

export type { ButtonEvent, ComponentDefinition } from './runtime/jello.js';

/** Varianti del pulsante. La variante esportata è «${String(getPath(doc, 'style.variant'))}». */
export type ${n.tabType} = 'primary' | 'secondary' | 'ghost';

export interface JelloButtonProps {
  /** Documento jello-component-definition da mostrare (default: quello esportato). */
  config?: ComponentDefinition;
  /** Testo del pulsante (sostituisce quello della definizione). Anche come figlio: <Button>Salva</Button>. */
  label?: string;
  children?: string;
  /** Sostituisce \`content.root.disabled\`. */
  disabled?: boolean;
  /** Attivazione: clic, Invio o Spazio. Un'azione la riceve qui; un collegamento naviga da solo. */
  onPress?: (event: ButtonEvent) => void;
  /** Il puntatore entra (non da tocco). */
  onHover?: (event: ButtonEvent) => void;
  /** Il pulsante riceve il focus. */
  onFocus?: (event: ButtonEvent) => void;
  /** GlassSource: elemento opaco dietro il pulsante, il cui contenuto viene rifratto (solo Glass, backend SVG). */
  sourceRef?: RefObject<HTMLElement | null>;
  /** Sostituisce il backend richiesto dal materiale Glass. */
  backend?: BackendRequest;
  /** Classe aggiunta all'elemento del pulsante. */
  className?: string;
}

/** Documento jello-component-definition esportato (materiale incluso). */
export declare const config: ComponentDefinition;

export declare function JelloButton(props: JelloButtonProps): ReactElement;

export type ${n.component}Props = Omit<JelloButtonProps, 'config'>;
export declare function ${n.component}(props: ${n.component}Props): ReactElement;
export default ${n.component};
`;
}

export function buttonTsx(doc: ComponentDefinition, n: ReactNames): string {
  return `/**
 * ${doc.name} — sorgente TSX equivalente a index.js, per chi preferisce copiare il componente nel progetto.
 * Richiede "resolveJsonModule" (per component.json) e il runtime in ../runtime.
 */
import { useEffect, useLayoutEffect, useRef, type ReactElement, type RefObject } from 'react';
import { createButton, type BackendRequest, type ButtonEvent, type ComponentDefinition, type JelloButton, type JelloButtonOptions } from '../runtime/jello.js';
import exported from '../component.json';

export const config = exported as ComponentDefinition;

export type ${n.tabType} = 'primary' | 'secondary' | 'ghost';

export interface ${n.component}Props {
  label?: string;
  children?: string;
  disabled?: boolean;
  onPress?: (event: ButtonEvent) => void;
  onHover?: (event: ButtonEvent) => void;
  onFocus?: (event: ButtonEvent) => void;
  sourceRef?: RefObject<HTMLElement | null>;
  backend?: BackendRequest;
  className?: string;
}

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export function ${n.component}(props: ${n.component}Props): ReactElement {
  const { sourceRef, backend, className, disabled, label, children } = props;
  const text = label ?? (typeof children === 'string' ? children : undefined);
  const slot = useRef<HTMLDivElement>(null);
  const button = useRef<JelloButton | null>(null);
  const latest = useRef(props);
  latest.current = props;

  useIsoLayoutEffect(() => {
    const options: JelloButtonOptions = {
      container: slot.current!,
      config,
      source: sourceRef?.current ?? null,
      onPress: (e) => latest.current.onPress?.(e),
      onHover: (e) => latest.current.onHover?.(e),
      onFocus: (e) => latest.current.onFocus?.(e),
    };
    if (text !== undefined) options.label = text;
    if (disabled !== undefined) options.disabled = disabled;
    if (backend) options.backend = backend;
    if (className) options.className = className;
    const created = createButton(options);
    button.current = created;
    return () => {
      created.destroy();
      button.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceRef, backend, className]);

  useEffect(() => {
    button.current?.setLabel(text ?? null);
  }, [text]);
  useEffect(() => {
    button.current?.setDisabled(disabled ?? null);
  }, [disabled]);

  // React owns this box and never its content (display: contents: the parent lays the button out).
  return <div ref={slot} style={{ display: 'contents' }} data-jello-component={config.id} />;
}

export default ${n.component};
`;
}

export function buttonExample(doc: ComponentDefinition, n: ReactNames): string {
  const link = getPath(doc, 'interactions.behavior.semantics') === 'link';
  return `/**
 * Integrazione minima di ${doc.name} in un'app React (Vite, Next, CRA…).
 *
 *   npm install ./${n.root}
 *   import '${n.packageName}/style.css';
 */
import { useRef, useState } from 'react';
import { ${n.component} } from '${n.packageName}';
import '${n.packageName}/style.css';

export function App() {
  // GlassSource: ciò che scorre dietro il pulsante (serve solo al materiale Glass). Il pulsante sta fuori da questo elemento.
  const content = useRef<HTMLElement>(null);
  const [count, setCount] = useState(0);
  return (
    <>
      <main ref={content} style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f4f4f6' }}>
        <p>${link ? 'Il pulsante è un collegamento: lo segue il browser.' : 'Premuto {count} volte'}</p>
      </main>
      <div style={{ position: 'fixed', inset: 'auto 0 24px', display: 'flex', justifyContent: 'center' }}>
        <${n.component} sourceRef={content} onPress={() => setCount((c) => c + 1)} />
      </div>
    </>
  );
}
`;
}

export function buttonReadme(doc: ComponentDefinition, n: ReactNames, warnings: string[], materialName: string, family: string): string {
  const p = resolveButton(doc, Number.POSITIVE_INFINITY);
  const off = unsupportedProperties(doc);
  const nodes = buttonNodes(doc);
  const lines = [
    `# ${doc.name} · React`,
    '',
    `Button esportato da Jello Material Lab (runtime ${RUNTIME_VERSION}), con materiale **${materialName}** (${family}).`,
    'Il pacchetto non dipende da Jello Studio: il runtime è incluso in `runtime/`.',
    '',
    '## Installazione',
    '',
    '```sh',
    `npm install ./${n.root}        # dipendenze peer: react, react-dom ≥ 18`,
    '```',
    '',
    '## Uso',
    '',
    '```tsx',
    `import { ${n.component} } from '${n.packageName}';`,
    `import '${n.packageName}/style.css';`,
    '',
    ...(family === 'glass' ? ['<main ref={content}>…</main>                       {/* GlassSource: dietro il pulsante, non lo contiene */}', `<${n.component} sourceRef={content} onPress={() => …} />`] : [`<${n.component} onPress={() => …} />`]),
    '```',
    '',
    'Esempio completo: `example/App.tsx`. Sorgente TSX equivalente (da copiare nel progetto): `src/' + n.component + '.tsx`.',
    '',
    '## Props',
    '',
    '| Prop | Significato |',
    '| --- | --- |',
    `| \`label\` · figlio | testo del pulsante (default «${p.text}») |`,
    '| `disabled` | sostituisce `content.root.disabled` |',
    '| `onPress` | attivazione: clic, Invio o Spazio. Riceve `{ value, href, trigger }` |',
    '| `onHover`, `onFocus` | il puntatore entra (non da tocco); il pulsante riceve il focus |',
    '| `sourceRef` | GlassSource: senza, il materiale Glass usa backdrop-filter (CSS), senza rifrazione. Con Solid non serve |',
    '| `backend` | sostituisce il backend del materiale Glass (`auto`, `svg`, `css`) |',
    '| `className` | classe aggiunta all’elemento del pulsante |',
    '',
    `Eventi DOM (CustomEvent, bubbles) sull’elemento del pulsante: \`${p.events.press}\`, \`${p.events.hover}\`, \`${p.events.focus}\`.`,
    '',
    '## Elemento e accessibilità',
    '',
    p.semantics === 'link'
      ? `- Navigazione: un \`<a href="${p.href}">\`. Lo segue il browser; il componente non naviga e non intercetta il clic. Disabilitato: senza \`href\`, \`role="link"\` e \`aria-disabled="true"\`.`
      : '- Azione: un `<button type="button">`. Riporta la pressione all’applicazione; non naviga. Disabilitato: attributo `disabled`.',
    `- Nome accessibile: il testo («${p.text}»); l’icona è decorativa (\`aria-hidden\`).`,
    '- Tastiera: Invio e Spazio attivano (il collegamento solo con Invio, come nel browser). Il focus è visibile con l’anello della definizione.',
    '- `prefers-reduced-motion`: nessuna animazione di scala né dissolvenza. `forced-colors`: colori di sistema e bordo visibile.',
    '',
    '## Contenuto e struttura',
    '',
    `- Etichetta: «${p.text}» (nodo \`${nodes.labelId}\`). Icona: ${p.icon === null ? 'nessuna' : p.icon.kind === 'builtin' ? p.icon.name : `SVG «${p.icon.kind === 'svg' ? p.icon.name : ''}»`} (${p.layout.iconPosition === 'start' ? 'prima' : 'dopo'} del testo).`,
    `- Variante: **${p.style.variant}**. Primary chiede al materiale il suo accento; Secondary lo mostra com’è; Ghost mostra la superficie solo con hover, pressione e focus.`,
    `- Responsive: ${(doc.responsive.breakpoints as { id: string; maxWidth: number }[] | undefined)?.length ? (doc.responsive.breakpoints as { id: string; maxWidth: number }[]).map((b) => `${b.id} ≤ ${b.maxWidth} px`).join(', ') : 'nessun breakpoint'} (larghezza del contenitore del pulsante).`,
    '',
    '## Materiale',
    '',
    `- \`material.json\` è il materiale (jello-material); \`component.json\` lo contiene, insieme a struttura, stati, interazioni e breakpoint.`,
    family === 'glass'
      ? '- Glass: una superficie sotto il pulsante; testo e icona restano in primo piano, mai filtrati. Backend SVG (rifrazione della GlassSource) dove il browser lo permette, altrimenti CSS (backdrop-filter), poi opaco.'
      : '- Solid: una superficie CSS (colore, bordo, ombra); hover, premuto e disabilitato li rende il materiale. Nessun filtro, nessun canvas.',
    '',
    '## Proprietà non applicate a questo materiale',
    '',
    ...(off.length ? ['Descritte nella definizione ma senza effetto con questo materiale (non vengono disegnate):', '', ...off.map((u) => `- \`${u.path}\` — ${u.reason}`)] : ['Nessuna: ogni proprietà descritta ha effetto con questo materiale.']),
    '',
    '## Proprietà del componente',
    '',
    '| Proprietà | Valore |',
    '| --- | --- |',
    ...BUTTON_FIELDS.map((f) => `| ${f.label} (\`${f.path}\`) | ${String(getPath(doc, f.path))}${f.type === 'number' && f.unit ? ' ' + f.unit : ''} |`),
    ...(warnings.length ? ['', '## Avvisi', '', ...warnings.map((w) => `- ${w}`)] : []),
    '',
  ];
  return lines.join('\n');
}
