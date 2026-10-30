/**
 * Component Builder panels: the left column (library and structure) and the
 * contextual inspector on the right. Everything here edits the builder's
 * canonical definition through LabSession; the preview is the same
 * controller and material renderer as the Material Lab.
 */

import { useMemo, useState } from 'react';
import { PARAM_INDEX, type ParamKey } from '../../core/params';
import { INSPECTOR_SECTIONS, type FieldDescriptor, type InspectorSection } from '../../components/fields';
import {
  BN_FIELDS,
  BN_FIELD_INDEX,
  BUTTON_FIELDS,
  BUTTON_FIELD_INDEX,
  BUTTON_OVERRIDE_PATHS,
  BUTTON_STATES,
  COMPONENTS,
  NAVBAR_FIELDS,
  definitionFields,
  navbarGroups,
  navbarItems,
  OVERRIDE_PATHS,
  TAB_STYLE_FIELDS,
  MAX_TABS,
  bindingState,
  buttonBreakpoints,
  buttonNodes,
  getPath,
  hasMaterialOverrides,
  navbarView,
  resolveButton,
  resolveDefinitionMaterial,
  rootField,
  toCanonicalPath,
  unsupportedProperties,
  type BnRoot,
  type BnTab,
  type BnTabStyle,
  type BindingState,
  type ComponentDefinition,
  type NavbarAction,
  type NavbarIconPosition,
} from '../../components';
import { BUILTIN_ICONS, BUILTIN_ICON_NAMES, iconTree, type IconRef, type SvgNode } from '../../components/icons';
import { FAMILIES, MATERIALS, glassParams, inspectorModel, supportReport, type Backend, type InspectorControl } from '../../model';
import { applicability } from '../applicability';
import type { LabSession } from '../session';
import { useLab } from '../store';
import { FieldControl, TextControl } from './FieldControl';
import { Icon } from './icons';
import { ParamField } from './ParamField';
import { InspectorLevel, useAdvanced, BASIC_FIELDS, BASIC_MATERIAL } from './InspectorLevel';

const LEVEL_LABEL = { supported: 'supportato', approximated: 'approssimato', ignored: 'ignorato' } as const;

// ---------- left column ----------

export function BuilderSidebar({ session }: { session: LabSession }) {
  const b = useLab((s) => s.builder);
  const components = useLab((s) => s.components);
  const library = useLab((s) => s.library);
  const skipped = useLab((s) => s.componentsSkipped);
  const [renaming, setRenaming] = useState<string | null>(null);
  const templates = components.filter((c) => c.origin === 'template');
  const saved = components.filter((c) => c.origin === 'user');
  const personal = library.filter((i) => i.origin === 'user' && i.doc.family === b.doc.material.family);
  const navbar = b.doc.type === 'mobile-navbar';
  const root = navbar ? navbarView(b.doc) : null;
  const selectedTab = root?.children.find((t) => t.id === b.selection);
  const itemContainer = selectedTab?.groupId ? b.doc.structure.children?.find((n) => n.id === selectedTab.groupId) : b.doc.structure;
  const index = selectedTab ? itemContainer?.children?.findIndex((n) => n.id === selectedTab.id) ?? -1 : -1;
  const material = resolveDefinitionMaterial(b.doc);

  return (
    <>
      <section className="side-section" aria-labelledby="bl-components">
        <h2 className="side-title" id="bl-components">
          Componenti
        </h2>
        <button type="button" className="button small primary" id="newComponentWizard" onClick={() => session.openFlow('component')}>Crea componente guidata</button>
        <div className="bl-group">
          <h3 className="side-sub">Template ufficiali Jello</h3>
          <div className="bl-list" role="group" aria-label="Template ufficiali Jello">
            {templates.map((c) => (
              <button key={c.id} type="button" className="bl-item" data-template={c.id} data-type={c.doc.type} aria-pressed={b.componentId === c.id} title={c.description} onClick={() => session.openComponent(c.id)}>
                <TemplateGlyph type={c.doc.type} />
                <span>
                  <strong>{c.name}</strong>
                  <span className="bl-sub">{c.description}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
        <p className="side-caption">In arrivo · non ancora disponibili</p>
        <ul className="soon-grid" aria-label="Componenti in arrivo">
          {COMPONENTS.planned().map((t) => (
            <li key={t.id} className="soon-card" title={t.description} data-planned={t.id}>
              {t.name}
              <span className="visually-hidden">: {t.description} {t.reason}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="side-section" aria-labelledby="bl-materials">
        <h2 className="side-title" id="bl-materials">
          Materiali
        </h2>
        <ul className="bl-list" aria-label="Famiglie di materiali">
          {FAMILIES.map((f) => {
            const usable = f.status === 'available' && MATERIALS.has(f.id) && COMPONENTS.supports(b.doc.type, f.id);
            const current = b.doc.material.family === f.id;
            return (
              <li key={f.id}>
                {usable ? (
                  <button
                    type="button"
                    className="bl-item"
                    id={`bl-material-${f.id}`}
                    data-family={f.id}
                    aria-pressed={current && b.selection === 'material'}
                    aria-current={current ? 'true' : undefined}
                    title={current ? undefined : `Disegna la componente con ${f.label}: contenuto, layout e stati restano`}
                    onClick={() => {
                      if (!current) session.setComponentFamily(f.id);
                      session.selectElement('material');
                    }}
                  >
                    <span className="sphere" aria-hidden="true" />
                    <span>
                      <strong>{f.label}</strong>
                      <span className="bl-sub">{current ? `In uso: ${material.name}` : f.description}</span>
                    </span>
                  </button>
                ) : (
                  <span className="bl-item" aria-disabled="true" title={f.description}>
                    <span className="sphere sphere-soon" data-material={f.id} aria-hidden="true" />
                    <span>
                      <strong>{f.label}</strong>
                      <span className="bl-sub">{f.status === 'available' ? 'Non disponibile per questa componente' : 'In sviluppo · non utilizzabile'}</span>
                    </span>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="side-section" aria-labelledby="bl-structure">
        <h2 className="side-title" id="bl-structure">
          Struttura
        </h2>
        <ul className="tree" id="structureTree" aria-label="Elementi della componente">
          <li>
            <button type="button" className="tree-node" data-node="root" aria-pressed={b.selection === 'root'} onClick={() => session.selectElement('root')}>
              <Icon name="left" />
              <span>{b.doc.name}</span>
              <span className="tree-kind">{navbar || b.doc.type === 'desktop-navbar' ? 'navigazione' : 'pulsante'}</span>
            </button>
            {root ? (
              <ul>
                {root.children.map((t) => (
                  <li key={t.id}>
                    <button type="button" className="tree-node" data-node={t.id} aria-pressed={b.selection === t.id} onClick={() => session.selectElement(t.id)}>
                      <TabIcon icon={t.icon} />
                      <span>{t.label}</span>
                      <span className="tree-kind">
                        {t.id === root.defaultTab ? 'iniziale · ' : ''}
                        {t.disabled ? 'disabilitata · ' : ''}
                        {t.visible === false ? 'nascosta · ' : ''}
                        {t.groupId ? `${b.doc.content[t.groupId]?.text ?? t.groupId} · ` : ''}
                        {t.id}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <ul>
                {b.doc.structure.children?.map((n) => (
                  <li key={n.id}>
                    <span className="tree-node" data-node={n.id} aria-disabled="true">
                      {n.role === 'icon' ? <TabIcon icon={b.doc.content[n.id]?.icon ?? { kind: 'none' }} /> : <Icon name="left" />}
                      <span>{b.doc.type === 'desktop-navbar' ? `${n.id} · ${(b.doc.layout.regions as Record<string, string>)[n.id] ?? 'main'}` : n.role === 'label' ? (b.doc.content[n.id]?.text ?? '') : 'Icona'}</span>
                      <span className="tree-kind">{n.role === 'label' ? 'etichetta' : 'icona'} · {n.id}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        </ul>
        {root ? (
          <>
            <div className="library-actions" role="group" aria-label="Azioni sulle tab">
              <button type="button" className="button small" id="tabAdd" disabled={root.children.length >= MAX_TABS} onClick={() => session.addTab()}>
                <Icon name="plus" /> Tab
              </button>
              <button type="button" className="button small" id="tabUp" aria-label="Sposta la tab prima" disabled={index <= 0} onClick={() => selectedTab && session.moveTab(selectedTab.id, -1)}>
                ←
              </button>
              <button type="button" className="button small" id="tabDown" aria-label="Sposta la tab dopo" disabled={index < 0 || index >= (itemContainer?.children?.length ?? 0) - 1} onClick={() => selectedTab && session.moveTab(selectedTab.id, 1)}>
                →
              </button>
              <button type="button" className="button small" id="tabDuplicate" disabled={!selectedTab || root.children.length >= MAX_TABS} onClick={() => selectedTab && session.duplicateTab(selectedTab.id)}>
                <Icon name="copy" /> Duplica
              </button>
              <button type="button" className="button small" id="tabRemove" disabled={!selectedTab || root.children.length <= 1} onClick={() => selectedTab && session.removeTab(selectedTab.id)}>
                <Icon name="trash" /> Elimina
              </button>
            </div>
            <p className="hint">{root.children.length} / {MAX_TABS} tab · quando non stanno nella barra decide «Responsive → Troppe tab».</p>
          </>
        ) : (
          <p className="hint">{b.doc.type === 'desktop-navbar' ? 'Anteprima tecnica Desktop: regioni Start / Main / End. Editor strutturale completo previsto per M5.3.' : 'Un pulsante ha un’etichetta e, se vuoi, un’icona: si modificano dal pannello a destra.'}</p>
        )}
      </section>      <section className="side-section" aria-labelledby="bl-library">
        <h2 className="side-title" id="bl-library">
          La mia libreria
        </h2>
        <div className="active-material">
          <span className="active-text">
            {renaming !== null ? (
              <form
                className="rename-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  session.renameComponent(renaming);
                  setRenaming(null);
                }}
              >
                <label className="visually-hidden" htmlFor="cmpRenameInput">
                  Nome della componente
                </label>
                <input id="cmpRenameInput" value={renaming} maxLength={80} autoFocus onChange={(e) => setRenaming(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setRenaming(null)} />
                <button type="submit" className="button small">
                  OK
                </button>
              </form>
            ) : (
              <strong id="cmpName">{b.doc.name}</strong>
            )}
            <span className="active-name" id="cmpOrigin" data-origin={b.origin}>
              {b.origin === 'template' ? (b.modified ? 'Template · modificato, non nella libreria' : 'Template · sola lettura') : 'Componente salvata · salvataggio automatico'}
            </span>
          </span>
        </div>
        <div className="library-actions" role="group" aria-label="Azioni sulla componente">
          <button type="button" className="button small" id="cmpSave" onClick={() => void session.saveComponent()}>
            <Icon name="save" /> {b.origin === 'template' ? 'Salva nella libreria' : 'Salva'}
          </button>
          <button type="button" className="button small" id="cmpDuplicate" onClick={() => void session.duplicateComponent()}>
            <Icon name="copy" /> Duplica
          </button>
          <button type="button" className="button small" id="cmpRename" disabled={b.origin !== 'user'} title={b.origin !== 'user' ? 'I template non si rinominano: salvali nella libreria' : undefined} onClick={() => setRenaming(b.doc.name)}>
            <Icon name="pencil" /> Rinomina
          </button>
          {b.origin === 'user' && (
            <button type="button" className="button small" id="cmpDelete" onClick={() => session.openConfirm({ kind: 'delete-component', id: b.componentId })}>
              <Icon name="trash" /> Elimina
            </button>
          )}
        </div>
        <h3 className="side-sub">Componenti salvate (personali)</h3>
        {saved.length ? (
          <div className="bl-list" role="group" aria-label="Componenti salvate" id="savedComponents">
            {saved.map((c) => (
              <button key={c.id} type="button" className="bl-item" data-component={c.id} aria-pressed={b.componentId === c.id} onClick={() => session.openComponent(c.id)}>
                <TemplateGlyph type={c.doc.type} />
                <span>
                  <strong>{b.componentId === c.id ? b.doc.name : c.name}</strong>
                  <span className="bl-sub">
                    {summary(b.componentId === c.id ? b.doc : c.doc)} · {resolveDefinitionMaterial(b.componentId === c.id ? b.doc : c.doc).name}
                  </span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="hint">Nessuna ancora: modifica un template e «Salva nella libreria».</p>
        )}
        {skipped.length > 0 && <p className="param-note">Non leggibili: {skipped.join('; ')}</p>}
        <div className="button-row">
          <label className="button small" htmlFor="cmpImportFile">
            Importa JSON…
          </label>
          <input
            type="file"
            accept="application/json,.json"
            id="cmpImportFile"
            className="visually-hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) session.importComponentText(await f.text());
              e.target.value = '';
            }}
          />
          <button type="button" className="button small" id="cmpExportJson" onClick={() => session.download(`${b.doc.id}.jello-component.json`, session.componentJson(), 'application/json')}>
            <Icon name="download" /> JSON
          </button>
        </div>
        <h3 className="side-sub">Preset materiali personali</h3>
        {personal.length ? (
          <div className="bl-list" role="group" aria-label="Preset materiali personali" id="savedPresets">
            {personal.map((m) => (
              <button key={m.id} type="button" className="bl-item" data-preset-apply={m.id} aria-pressed={b.doc.material.preset === m.id} title="Applica alla componente" onClick={() => session.applyMaterialPreset(m.id)}>
                <span className="sphere" aria-hidden="true" />
                <span>
                  <strong>{m.name}</strong>
                  <span className="bl-sub">{m.doc.family} · applica alla componente</span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="hint">Nessun materiale personale: crealo nel Material Lab o salvalo da Materiale nell’inspector.</p>
        )}
        <Messages />
      </section>


    </>
  );
}

/** One line about what a component contains, for the library list. */
function summary(doc: ComponentDefinition): string {
  if (doc.type === 'desktop-navbar') return `${navbarItems(doc).length} elementi · Start / Main / End`;
  if (doc.type === 'mobile-navbar') return `${navbarView(doc).children.length} tab`;
  const p = resolveButton(doc, Number.POSITIVE_INFINITY);
  return `«${p.text}» · ${p.style.variant}`;
}

function Messages() {
  const m = useLab((s) => s.builder.messages);
  if (!m) return null;
  return (
    <ul className="messages" id="builderMessages" role="status" data-ok={String(m.ok)}>
      {m.messages.map((x, i) => (
        <li key={i}>{x}</li>
      ))}
    </ul>
  );
}

function TemplateGlyph({ type }: { type: string }) {
  return (
    <svg className="icon bl-glyph" viewBox="0 0 24 24" aria-hidden="true">
      {type === 'button' ? <path d="M4 8.5h16a1.5 1.5 0 0 1 1.5 1.5v4a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 14v-4A1.5 1.5 0 0 1 4 8.5zM8.5 12h7" /> : <path d="M3 15h18v5H3zM6 17.5h2M11 17.5h2M16 17.5h2" />}
    </svg>
  );
}

function SvgNodes({ nodes }: { nodes: readonly SvgNode[] }) {
  return (
    <>
      {nodes.map((n, i) => {
        const Tag = n.tag as 'path';
        const attrs = Object.fromEntries(n.attrs.map(([k, v]) => [k.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase()), v]));
        return (
          <Tag key={i} {...attrs}>
            {n.children.length ? <SvgNodes nodes={n.children} /> : null}
          </Tag>
        );
      })}
    </>
  );
}

/** Icon preview in the editor: the same allowlisted tree the component renders. */
export function TabIcon({ icon }: { icon: IconRef }) {
  const tree = iconTree(icon);
  if (!tree) return <span className="icon tab-icon-none" aria-hidden="true" />;
  return (
    <svg className="icon" viewBox={tree.viewBox} aria-hidden="true" data-paint={tree.paint}>
      <SvgNodes nodes={tree.nodes} />
    </svg>
  );
}

// ---------- inspector ----------

function Section({ id, title, open = true, children }: { id: InspectorSection | string; title: string; open?: boolean; children: React.ReactNode }) {
  const advanced = useAdvanced();
  if (!advanced && ['typography', 'interactions'].includes(id)) return null;
  return (
    <details className="panel-section" data-section={`b-${id}`} open={open}>
      <summary>{title}</summary>
      {children}
    </details>
  );
}

const SECTION_LABEL = Object.fromEntries(INSPECTOR_SECTIONS.map((s) => [s.id, s.label])) as Record<InspectorSection, string>;

/** Controls that would have no effect with the current configuration are not shown. */
function relevant(f: FieldDescriptor, root: BnRoot): boolean {
  const L = root.layout;
  const docked = L.placement === 'docked';
  switch (f.path) {
    case 'layout.width':
      return L.widthMode === 'fixed' && !docked;
    case 'layout.maxWidth':
      return L.widthMode === 'fill' && !docked;
    case 'layout.widthMode':
    case 'layout.align':
    case 'layout.offset':
    case 'layout.radius':
      return !docked;
    case 'appearance.indicator.color':
    case 'appearance.indicator.inset':
      return root.appearance.indicator.style !== 'none';
    case 'motion.duration':
      return root.motion.indicator !== 'none';
    default:
      return true;
  }
}

/** A property control plus, when the component's material cannot render it, the reason (explicit and findable: `data-unsupported`). */
function PropertyField({ f, path, value, unsupported, onChange }: { f: FieldDescriptor; path: string; value: unknown; unsupported: ReadonlyMap<string, string>; onChange(v: unknown): void }) {
  const advanced = useAdvanced();
  const why = unsupported.get(path);
  const level = f.level ?? NAVBAR_FIELDS.find((d) => d.path === path)?.level;
  if (!advanced && (level ? level !== 'base' : !BASIC_FIELDS.has(f.path)) && !why) return null;
  return (
    <>
      <FieldControl f={f} value={value} onChange={onChange} />
      <button type="button" className="control-reset" aria-label={`Ripristina ${f.label}`} onClick={() => onChange(f.default)}>↺ Ripristina</button>
      {why && (
        <p className="param-support" data-level="ignored" data-unsupported={path}>
          Senza effetto con questo materiale: {why}
        </p>
      )}
    </>
  );
}

const unsupportedMap = (def: ComponentDefinition): ReadonlyMap<string, string> => new Map(unsupportedProperties(def).map((u) => [u.path, u.reason]));

export function Inspector({ session }: { session: LabSession }) {
  const b = useLab((s) => s.builder);
  const spec = COMPONENTS.get(b.doc.type)!;
  const root = b.doc.type === 'mobile-navbar' ? navbarView(b.doc) : null;
  const tab = root?.children.find((t) => t.id === b.selection);
  return (
    <div className="panel-inner" id="inspector" data-component-type={b.doc.type}>
      <div className="panel-head">
        <div className="panel-heading">
          <h2>{b.selection === 'material' ? 'Materiale' : tab ? 'Tab' : root ? 'Navigazione' : spec.name}</h2>
          <span className="chip chip-accent">{tab ? tab.label : b.selection === 'material' ? resolveDefinitionMaterial(b.doc).name : spec.name}</span>
        </div>
        <p className="hint" id="inspectorSubject">
          {tab ? `Tab «${tab.label}» · id ${tab.id}` : b.selection === 'material' ? 'Materiale applicato alla componente' : root ? `${b.doc.name} · ${root.children.length} tab` : `${b.doc.name} · ${summary(b.doc)}`}
        </p>
      </div>
      <div className="panel-body"><InspectorLevel>
        {b.selection === 'material' ? <MaterialPanel session={session} /> : b.doc.type === 'desktop-navbar' ? <Section id="desktop-preview" title="Anteprima tecnica Desktop">
          <p className="hint">Renderer M5.2 · Glass / Solid · Start / Main / End. Struttura, layout e breakpoint si aggiornano importando la definizione JSON. Editor completo e pacchetti React/Vanilla previsti per M5.3.</p>
          <label htmlFor="desktop-preview-item">Elemento da verificare</label>
          <select id="desktop-preview-item" value={b.selection} onChange={(e) => session.selectElement(e.target.value)}>
            <option value="root">Navbar</option>
            {navbarItems(b.doc).map((item) => <option key={item.id} value={item.id}>{item.label || item.id}</option>)}
          </select>
          <label htmlFor="desktop-preview-state">Stato visivo</label>
          <select id="desktop-preview-state" disabled={b.selection === 'root'} value={b.previewState ?? ''} onChange={(e) => session.setPreviewState((e.target.value || null) as typeof b.previewState)}>
            <option value="">Default</option>
            {(['hover', 'pressed', 'focus', 'active', 'disabled'] as const).map((state) => <option key={state} value={state}>{state}</option>)}
          </select>
        </Section> : tab && root ? <TabInspector key={tab.id} session={session} tab={tab} root={root} /> : root ? <RootInspector session={session} root={root} /> : <ButtonInspector session={session} />}
      </InspectorLevel></div>
    </div>
  );
}

function RootInspector({ session, root }: { session: LabSession; root: BnRoot }) {
  const [groupName, setGroupName] = useState('');
  const name = useLab((s) => s.builder.doc.name);
  const definition = useLab((s) => s.builder.doc);
  const unsupported = useMemo(() => unsupportedMap(definition), [definition]);
  const fields = (section: InspectorSection) =>
    BN_FIELDS.filter((f) => f.section === section && relevant(f, root)).map((f) => (
      <PropertyField key={f.path} f={f} path={toCanonicalPath(f.path)} value={rootField(root, f.path) ?? f.default} unsupported={unsupported} onChange={(v) => session.setComponentField(f.path, v)} />
    ));
  return (
    <>
      <Section id="structure" title="Contenuto">
        <TextControl id="cmp-name" label={<label htmlFor="cmp-name">Nome della componente</label>} value={name} maxLength={80} description="Nome nella libreria e nell’export (diventa il nome del componente React)." onChange={(v) => session.setComponentName(v)} />
        <TextControl id="cmp-label" label={<label htmlFor="cmp-label">Nome accessibile</label>} value={root.label} maxLength={80} description="aria-label della navigazione, letto dagli screen reader." onChange={(v) => session.setComponentRoot({ label: v })} />
        <div className="field param">
          <div className="field-head">
            <label htmlFor="cmp-semantics">Semantica</label>
          </div>
          <select id="cmp-semantics" value={root.semantics} onChange={(e) => session.setComponentRoot({ semantics: e.target.value as BnRoot['semantics'] })}>
            <option value="navigation">Navigazione (nav, aria-current)</option>
            <option value="tabs">Schede (tablist, aria-selected)</option>
          </select>
          <p className="param-desc">Navigazione: le tab portano a sezioni. Schede: cambiano un pannello nella stessa vista.</p>
        </div>
        <div className="field param">
          <div className="field-head">
            <label htmlFor="cmp-defaultTab">Tab attiva iniziale</label>
          </div>
          <select id="cmp-defaultTab" value={root.defaultTab} onChange={(e) => session.setComponentRoot({ defaultTab: e.target.value })}>
            {root.children.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </Section>
      <Section id="groups" title="Struttura · gruppi" open={false}>
        {navbarGroups(definition).map((g) => <div key={g.id} className="button-row"><span>{g.label ?? g.id} · {g.itemIds.length} voci</span><button type="button" className="button small" onClick={() => session.removeNavbarGroup(g.id)}>Sciogli gruppo {g.label ?? g.id}</button></div>)}
        <form onSubmit={(e) => { e.preventDefault(); if (groupName.trim()) { session.addNavbarGroup(groupName.trim()); setGroupName(''); } }}>
          <label htmlFor="navbar-group-name">Nome del gruppo</label>
          <input id="navbar-group-name" value={groupName} maxLength={120} onChange={(e) => setGroupName(e.target.value)} />
          <button type="submit" className="button small" disabled={!groupName.trim()}>Aggiungi gruppo</button>
        </form>
      </Section>
      <Section id="layout" title={SECTION_LABEL.layout}>
        {fields('layout')}
      </Section>
      <Section id="appearance" title={SECTION_LABEL.appearance}>
        {fields('appearance')}
        <Section id="typography" title="Tipografia" open={false}>{fields('typography')}</Section>
      </Section>
      <Section id="material" title={SECTION_LABEL.material} open={false}>
        <MaterialPanel session={session} />
      </Section>
      <Section id="states" title="Stati e interazioni" open={false}>
        {fields('states')}
        <p className="hint">Per vedere hover, pressione e focus senza interagire seleziona una tab e usa «Anteprima stato».</p>
        <Section id="interactions" title="Interazioni" open={false}>
        {fields('interactions')}
        <p className="hint">
          La componente esportata espone <code>onChange</code>, <code>onTabPress</code> e <code>onReselect</code> (React) e gli eventi DOM qui sopra: la navigazione resta all’applicazione, nessun router richiesto.
        </p>
        </Section>
      </Section>
      <Section id="responsive" title={SECTION_LABEL.responsive} open={false}>
        {fields('responsive')}
        <Breakpoints session={session} root={root} />
      </Section>
    </>
  );
}

function Breakpoints({ session, root }: { session: LabSession; root: BnRoot }) {
  const width = useLab((s) => s.report?.options.device);
  return (
    <div className="breakpoints" id="breakpoints">
      <h3 className="panel-sub">Breakpoint (larghezza del contenitore)</h3>
      {root.responsive.breakpoints.length === 0 && <p className="hint">Nessuno: le stesse proprietà a ogni larghezza.</p>}
      {root.responsive.breakpoints.map((bp) => (
        <fieldset key={bp.id} className="bp" data-breakpoint={bp.id}>
          <legend>
            ≤ {bp.maxWidth} px <code>{bp.id}</code>
          </legend>
          <FieldControl
            f={{ type: 'number', path: 'maxWidth', section: 'responsive', label: 'Fino a', unit: 'px', min: 200, max: 2000, step: 1, default: bp.maxWidth, description: 'Vale finché il contenitore è largo al massimo così.' }}
            id={`bp-${bp.id}-max`}
            value={bp.maxWidth}
            onChange={(v) => session.updateBreakpoint(bp.id, { maxWidth: v as number })}
          />
          {OVERRIDE_PATHS.map((path) => {
            const f = BN_FIELD_INDEX[path]!;
            const on = path in bp.overrides;
            const id = `bp-${bp.id}-${path.replace(/\./g, '-')}`;
            return (
              <div key={path} className="bp-override">
                <label className="check" htmlFor={`${id}-on`}>
                  <input id={`${id}-on`} type="checkbox" checked={on} onChange={(e) => session.updateBreakpoint(bp.id, { set: [path, e.target.checked ? (rootField(root, path) ?? f.default) as number | string | boolean : null] })} />
                  <span>{f.label}</span>
                </label>
                {on && <FieldControl f={f} id={id} value={bp.overrides[path]} onChange={(v) => session.updateBreakpoint(bp.id, { set: [path, v as number | string | boolean] })} />}
              </div>
            );
          })}
          <button type="button" className="button small" onClick={() => session.removeBreakpoint(bp.id)}>
            <Icon name="trash" /> Rimuovi breakpoint
          </button>
        </fieldset>
      ))}
      <button type="button" className="button small" id="bpAdd" onClick={() => session.addBreakpoint(480)}>
        <Icon name="plus" /> Breakpoint
      </button>
      <p className="hint">Prova i breakpoint con i formati Desktop, Tablet (768 px) e Telefono (390 px) dell’anteprima{width ? ` · ora: ${width}` : ''}.</p>
    </div>
  );
}

function TabInspector({ session, tab, root }: { session: LabSession; tab: BnTab; root: BnRoot }) {
  const b = useLab((s) => s.builder);
  const advanced = useAdvanced();
  const fields = definitionFields(b.doc.type, 'item');
  const field = (name: string) => fields.find((f) => f.path === `content.$item.${name}`)!;
  const index = root.children.indexOf(tab);
  return (
    <>
      <Section id="structure" title="Contenuto">
        <TextControl id="tab-label" label={<label htmlFor="tab-label">Etichetta</label>} value={tab.label} maxLength={40} description="Testo visibile e nome accessibile. L’id non cambia." onChange={(v) => session.updateTab(tab.id, { label: v })} />
        <div className="field param">
          <div className="field-head">
            <label htmlFor="tab-id">Id stabile</label>
          </div>
          <input id="tab-id" className="text-input" value={tab.id} readOnly aria-describedby="tab-id-desc" />
          <p className="param-desc" id="tab-id-desc">
            Lo riceve <code>onChange</code>. Generato alla creazione, indipendente dall’etichetta.
          </p>
        </div>
        <div className="field param">
          <div className="field-head">
            <label htmlFor="tab-value">Valore (facoltativo)</label>
          </div>
          <input id="tab-value" className="text-input" value={tab.value ?? ''} maxLength={200} placeholder="es. /risultati" aria-describedby="tab-value-desc" onChange={(e) => session.updateTab(tab.id, { value: e.target.value || null })} />
          <p className="param-desc" id="tab-value-desc">
            Dato libero inviato con gli eventi (una route, una chiave): la componente non naviga da sola.
          </p>
        </div>
        <p className="hint">
          Posizione {index + 1} di {root.children.length}. Sposta, duplica o elimina dalla Struttura a sinistra.
        </p>
        <FieldControl id="tab-visible" f={field('visible')} value={tab.visible ?? true} onChange={(v) => session.updateTab(tab.id, { visible: v as boolean })} />
        <label htmlFor="tab-group">Gruppo</label>
        <select id="tab-group" value={tab.groupId ?? ''} onChange={(e) => session.moveTabToGroup(tab.id, e.target.value || null)}>
          <option value="">Nessun gruppo</option>
          {navbarGroups(b.doc).map((g) => <option key={g.id} value={g.id}>{g.label ?? g.id}</option>)}
        </select>
      </Section>
      <Section id="appearance" title="Icona">
        <IconPicker prefix="tab" icon={tab.icon} onPick={(icon) => session.setTabIcon(tab.id, icon)} onUpload={(f) => session.uploadTabIcon(tab.id, f)} />
        <p className="hint">Solo forme e attributi di presentazione: script, eventi, link, stili, immagini e riferimenti esterni vengono rifiutati. Massimo 16 KB.</p>
        <Messages />
      </Section>
      <Section id="typography" title="Dimensioni e tipografia">
        {(Object.keys(TAB_STYLE_FIELDS) as (keyof BnTabStyle)[]).map((k) => {
          const f = TAB_STYLE_FIELDS[k];
          const own = tab.style[k] !== null;
          const inherited = rootField(root, f.path) as number;
          const id = `tab-style-${k}`;
          return (
            <div key={k} className="bp-override">
              <label className="check" htmlFor={`${id}-own`}>
                <input id={`${id}-own`} type="checkbox" checked={own} onChange={(e) => session.setTabStyle(tab.id, k, e.target.checked ? inherited : null)} />
                <span>
                  {f.label} {own ? '' : `· eredita ${inherited}${f.unit ? ` ${f.unit}` : ''}`}
                </span>
              </label>
              {own && <FieldControl f={f} id={id} value={tab.style[k]} onChange={(v) => session.setTabStyle(tab.id, k, v as number)} />}
            </div>
          );
        })}
      </Section>
      <Section id="states" title="Stati e interazioni">
        <label className="check" htmlFor="tab-disabled">
          <input id="tab-disabled" type="checkbox" checked={tab.disabled} onChange={(e) => session.updateTab(tab.id, { disabled: e.target.checked })} />
          <span>Disabilitata</span>
        </label>
        <NavbarActionEditor key={`${tab.id}-${JSON.stringify(tab.action)}`} session={session} tab={tab} />
        <div className="button-row">
          <button type="button" className="button small" id="tab-default" disabled={root.defaultTab === tab.id} onClick={() => session.setComponentRoot({ defaultTab: tab.id })}>
            {root.defaultTab === tab.id ? 'Tab attiva iniziale' : 'Rendi attiva all’avvio'}
          </button>
          <button type="button" className="button small" id="tab-preview-active" disabled={b.previewTab === tab.id} onClick={() => session.setPreviewTab(tab.id)}>
            Attiva nell’anteprima
          </button>
        </div>
        <div className="field param">
          <div className="field-head">
            <label htmlFor="tab-preview-state">Anteprima stato</label>
          </div>
          <select id="tab-preview-state" value={b.previewState ?? ''} onChange={(e) => session.setPreviewState((e.target.value || null) as never)}>
            <option value="">Normale</option>
            <option value="hover">Hover</option>
            <option value="pressed">Premuta</option>
            <option value="active">Active</option>
            <option value="focus">Focus</option>
            <option value="disabled">Disabled</option>
          </select>
          <p className="param-desc">Mostra lo stato su questa tab senza interagire. Gli stili degli stati sono della navigazione (seleziona la radice).</p>
        </div>
      </Section>
      {advanced && <Section id="accessibility" title="Accessibilità" open={false}>
        <FieldControl id="tab-accessible-label" f={field('accessibleLabel')} value={tab.accessibleLabel ?? ''} onChange={(v) => session.updateTab(tab.id, { accessibleLabel: String(v) || null })} />
        <FieldControl id="tab-description" f={field('description')} value={tab.description ?? ''} onChange={(v) => session.updateTab(tab.id, { description: String(v) || null })} />
        <label htmlFor="tab-icon-position">Posizione icona</label>
        <select id="tab-icon-position" value={tab.iconPosition ?? ''} onChange={(e) => session.updateTab(tab.id, { iconPosition: (e.target.value || null) as NavbarIconPosition | null })}>
          <option value="">Eredita dal layout</option>
          {field('iconPosition').type === 'enum' && (field('iconPosition') as Extract<FieldDescriptor, { type: 'enum' }>).options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </Section>}
      <Section id="interactions" title={SECTION_LABEL.interactions} open={false}>
        <p className="hint">
          Premere questa tab emette <code>{root.interactions.events.press}</code>; sceglierla emette <code>{root.interactions.events.change}</code> con <code>{`{ tabId: "${tab.id}", value: ${tab.value === null ? 'null' : JSON.stringify(tab.value)} }`}</code>.
        </p>
      </Section>
    </>
  );
}

function NavbarActionEditor({ session, tab }: { session: LabSession; tab: BnTab }) {
  const action = tab.action ?? { kind: 'select' };
  const [kind, setKind] = useState<NavbarAction['kind']>(action.kind);
  const [destination, setDestination] = useState(action.kind === 'navigate' ? action.href : action.kind === 'consumer' ? action.name : '');
  const [target, setTarget] = useState<'_self' | '_blank'>(action.kind === 'navigate' ? action.target ?? '_self' : '_self');
  // The form keeps incomplete destinations local; only an explicit, validated action is persisted.
  const f = definitionFields('mobile-navbar', 'item').find((f) => f.path === 'content.$item.action.kind')!;
  return <form onSubmit={(e) => {
    e.preventDefault();
    session.setTabAction(tab.id, kind === 'select' ? { kind } : kind === 'navigate' ? { kind, href: destination, target } : { kind, name: destination });
  }}>
    <FieldControl id="tab-action-kind" f={f} value={kind} onChange={(v) => { setKind(v as NavbarAction['kind']); setDestination(''); }} />
    {kind !== 'select' && <><label htmlFor="tab-action-destination">{kind === 'navigate' ? 'Destinazione URL' : 'Nome azione'}</label><input id="tab-action-destination" value={destination} maxLength={kind === 'navigate' ? 2048 : 64} onChange={(e) => setDestination(e.target.value)} required /></>}
    {kind === 'navigate' && <><label htmlFor="tab-action-target">Apri in</label><select id="tab-action-target" value={target} onChange={(e) => setTarget(e.target.value as '_self' | '_blank')}><option value="_self">Stessa scheda</option><option value="_blank">Nuova scheda</option></select></>}
    <button id="tab-action-apply" type="submit" className="button small">Applica azione</button>
    <Messages />
  </form>;
}

/** Icon of a tab or of a button: the built-in set, none, or a custom SVG (sanitized by the session). Ids keep the prefix. */
function IconPicker({ prefix, icon, onPick, onUpload }: { prefix: string; icon: IconRef; onPick(icon: IconRef): void; onUpload(file: File): Promise<boolean> }) {
  return (
    <>
      <fieldset className="icon-grid" id={`${prefix}-icons`}>
        <legend className="visually-hidden">Icona</legend>
        {BUILTIN_ICON_NAMES.map((name) => (
          <label key={name} className="icon-choice" htmlFor={`${prefix}-icon-${name}`} title={BUILTIN_ICONS[name]!.label}>
            <input type="radio" name={`${prefix}Icon`} id={`${prefix}-icon-${name}`} checked={icon.kind === 'builtin' && icon.name === name} onChange={() => onPick({ kind: 'builtin', name })} />
            <TabIcon icon={{ kind: 'builtin', name }} />
            <span className="visually-hidden">{BUILTIN_ICONS[name]!.label}</span>
          </label>
        ))}
        <label className="icon-choice" htmlFor={`${prefix}-icon-none`} title="Nessuna icona">
          <input type="radio" name={`${prefix}Icon`} id={`${prefix}-icon-none`} checked={icon.kind === 'none'} onChange={() => onPick({ kind: 'none' })} />
          <span className="tab-icon-none" aria-hidden="true">∅</span>
          <span className="visually-hidden">Nessuna icona</span>
        </label>
        {icon.kind === 'svg' && (
          <label className="icon-choice" htmlFor={`${prefix}-icon-custom`} title={`SVG «${icon.name}»`}>
            <input type="radio" name={`${prefix}Icon`} id={`${prefix}-icon-custom`} checked readOnly />
            <TabIcon icon={icon} />
            <span className="visually-hidden">SVG {icon.name}</span>
          </label>
        )}
      </fieldset>
      <label className="button small side-button" htmlFor={`${prefix}-icon-upload`}>
        Carica SVG…
      </label>
      <input
        type="file"
        accept="image/svg+xml,.svg"
        id={`${prefix}-icon-upload`}
        className="visually-hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) await onUpload(f);
          e.target.value = '';
        }}
      />
    </>
  );
}

// ---------- button ----------

function ButtonInspector({ session }: { session: LabSession }) {
  const def = useLab((s) => s.builder.doc);
  const b = useLab((s) => s.builder);
  const unsupported = useMemo(() => unsupportedMap(def), [def]);
  const p = resolveButton(def, Number.POSITIVE_INFINITY);
  const nodes = buttonNodes(def);
  const [href, setHref] = useState(def.content.root?.href ?? '');
  const fields = (section: InspectorSection, skip: readonly string[] = []) =>
    BUTTON_FIELDS.filter((f) => f.section === section && !skip.includes(f.path) && relevantButton(f, p)).map((f) => (
      <PropertyField key={f.path} f={f} path={f.path} value={getPath(def, f.path)} unsupported={unsupported} onChange={(v) => session.setComponentField(f.path, v)} />
    ));
  return (
    <>
      <Section id="structure" title="Contenuto">
        <TextControl id="cmp-name" label={<label htmlFor="cmp-name">Nome della componente</label>} value={def.name} maxLength={80} description="Nome nella libreria e nell’export (diventa il nome del componente React)." onChange={(v) => session.setComponentName(v)} />
        <TextControl id="btn-text" label={<label htmlFor="btn-text">Testo</label>} value={def.content[nodes.labelId]?.text ?? ''} maxLength={60} description="Testo visibile e nome accessibile del pulsante." onChange={(v) => session.setButtonText(v)} />
        <div className="field param">
          <div className="field-head">
            <label htmlFor="btn-semantics">Elemento</label>
          </div>
          <select
            id="btn-semantics"
            value={p.semantics}
            aria-describedby="btn-semantics-desc"
            onChange={(e) => {
              const v = e.target.value as 'action' | 'link';
              if (v === 'link' && !def.content.root?.href) session.setButtonSemantics('link', href || '/');
              else session.setButtonSemantics(v, href);
            }}
          >
            <option value="action">Azione · &lt;button&gt;</option>
            <option value="link">Navigazione · &lt;a href&gt;</option>
          </select>
          <p className="param-desc" id="btn-semantics-desc">
            Azione: riporta la pressione all’applicazione. Navigazione: un collegamento vero, lo segue il browser (nell’anteprima non naviga).
          </p>
        </div>
        {p.semantics === 'link' && (
          <div className="field param">
            <div className="field-head">
              <label htmlFor="btn-href">Indirizzo</label>
            </div>
            <input
              id="btn-href"
              className="text-input"
              value={href}
              maxLength={200}
              placeholder="/pagina, #sezione o https://…"
              onChange={(e) => {
                setHref(e.target.value);
                session.setButtonSemantics('link', e.target.value);
              }}
            />
            <p className="param-desc">Un percorso (/…), un’ancora (#…) o un URL http(s). Senza indirizzo valido la modifica non si applica.</p>
          </div>
        )}
        <div className="field param">
          <div className="field-head">
            <label htmlFor="btn-value">Valore (facoltativo)</label>
          </div>
          <input id="btn-value" className="text-input" value={p.value ?? ''} maxLength={200} placeholder="es. conferma" onChange={(e) => session.setButtonValue(e.target.value || null)} />
          <p className="param-desc">Dato libero inviato con l’evento di pressione: il pulsante non fa altro da solo.</p>
        </div>
        <label className="check" htmlFor="btn-disabled">
          <input id="btn-disabled" type="checkbox" checked={p.disabled} onChange={(e) => session.setButtonDisabled(e.target.checked)} />
          <span>Disabilitato</span>
        </label>
        <h3 className="panel-sub">Icona</h3>
        <IconPicker prefix="btn" icon={p.icon ?? { kind: 'none' }} onPick={(icon) => session.setButtonIcon(icon)} onUpload={(f) => session.uploadButtonIcon(f)} />
        <p className="hint">Solo forme e attributi di presentazione: script, eventi, link, stili, immagini e riferimenti esterni vengono rifiutati. Massimo 16 KB. La posizione (prima o dopo il testo) è nel Layout.</p>
        <Messages />
      </Section>
      <Section id="layout" title={SECTION_LABEL.layout}>
        {fields('layout')}
      </Section>
      <Section id="appearance" title={SECTION_LABEL.appearance}>
        {fields('appearance')}
        <Section id="typography" title="Tipografia" open={false}>{fields('typography')}</Section>
      </Section>
      <Section id="material" title={SECTION_LABEL.material} open={false}>
        <MaterialPanel session={session} />
      </Section>
      <Section id="states" title="Stati e interazioni" open={false}>
        <div className="field param">
          <div className="field-head">
            <label htmlFor="btn-preview-state">Anteprima stato</label>
          </div>
          <select id="btn-preview-state" value={b.previewState ?? ''} onChange={(e) => session.setPreviewState((e.target.value || null) as never)}>
            <option value="">Normale</option>
            <option value="hover">Hover</option>
            <option value="pressed">Premuto</option>
            <option value="focus">Focus</option>
            <option value="disabled">Disabled</option>
          </select>
          <p className="param-desc">Mostra lo stato sul pulsante senza interagire. Stati del tipo: {BUTTON_STATES.join(', ')}.</p>
        </div>
        {fields('states')}
        <Section id="interactions" title="Interazioni" open={false}>
        {fields('interactions')}
        <p className="hint">
          La componente esportata espone <code>onPress</code>, <code>onHover</code> e <code>onFocus</code> (React) e gli eventi DOM qui sopra. Un collegamento non ha bisogno di <code>onPress</code>: lo segue il browser.
        </p>
        </Section>
      </Section>
      <Section id="responsive" title={SECTION_LABEL.responsive} open={false}>
        <ButtonBreakpoints session={session} def={def} />
      </Section>
    </>
  );
}

/** Controls that would have no effect with the current configuration are not shown. */
function relevantButton(f: FieldDescriptor, p: ReturnType<typeof resolveButton>): boolean {
  switch (f.path) {
    case 'layout.width':
      return p.layout.widthMode === 'fixed';
    case 'layout.align':
      return p.layout.widthMode !== 'hug';
    case 'layout.iconPosition':
    case 'layout.gap':
    case 'style.icon.size':
    case 'style.icon.strokeWidth':
      return p.icon !== null && p.icon.kind !== 'none';
    default:
      return true;
  }
}

function ButtonBreakpoints({ session, def }: { session: LabSession; def: ComponentDefinition }) {
  const width = useLab((s) => s.report?.options.device);
  const list = buttonBreakpoints(def);
  return (
    <div className="breakpoints" id="breakpoints">
      <h3 className="panel-sub">Breakpoint (larghezza del contenitore)</h3>
      {list.length === 0 && <p className="hint">Nessuno: le stesse proprietà a ogni larghezza.</p>}
      {list.map((bp) => (
        <fieldset key={bp.id} className="bp" data-breakpoint={bp.id}>
          <legend>
            ≤ {bp.maxWidth} px <code>{bp.id}</code>
          </legend>
          <FieldControl
            f={{ type: 'number', path: 'maxWidth', section: 'responsive', label: 'Fino a', unit: 'px', min: 100, max: 2000, step: 1, default: bp.maxWidth, description: 'Vale finché il contenitore del pulsante è largo al massimo così.' }}
            id={`bp-${bp.id}-max`}
            value={bp.maxWidth}
            onChange={(v) => session.updateButtonBreakpoint(bp.id, { maxWidth: v as number })}
          />
          {BUTTON_OVERRIDE_PATHS.map((path) => {
            const f = BUTTON_FIELD_INDEX[path]!;
            const on = path in bp.overrides;
            const id = `bp-${bp.id}-${path.replace(/\./g, '-')}`;
            return (
              <div key={path} className="bp-override">
                <label className="check" htmlFor={`${id}-on`}>
                  <input id={`${id}-on`} type="checkbox" checked={on} onChange={(e) => session.updateButtonBreakpoint(bp.id, { set: [path, e.target.checked ? (getPath(def, path) as number | string) : null] })} />
                  <span>{f.label}</span>
                </label>
                {on && <FieldControl f={f} id={id} value={bp.overrides[path]} onChange={(v) => session.updateButtonBreakpoint(bp.id, { set: [path, v as number | string] })} />}
              </div>
            );
          })}
          <button type="button" className="button small" onClick={() => session.removeButtonBreakpoint(bp.id)}>
            <Icon name="trash" /> Rimuovi breakpoint
          </button>
        </fieldset>
      ))}
      <button type="button" className="button small" id="bpAdd" onClick={() => session.addButtonBreakpoint(360)}>
        <Icon name="plus" /> Breakpoint
      </button>
      <p className="hint">Il pulsante legge la larghezza del proprio contenitore. Provali con i formati Desktop, Tablet (768 px) e Telefono (390 px) dell’anteprima{width ? ` · ora: ${width}` : ''}.</p>
    </div>
  );
}

// ---------- material ----------

function linkNote(link: BindingState, name: string | null, personal: boolean): string {
  switch (link) {
    case 'linked':
      return personal ? `Collegato a «${name}»: le modifiche fatte nel Material Lab arrivano anche qui.` : `Preset incluso «${name}».`;
    case 'modified':
      return `Basato su «${name}» · modificato in questa componente: non segue più il preset.`;
    case 'outdated':
      return `«${name}» è cambiato: aggiorna per riceverne le modifiche.`;
    case 'diverged':
      return `«${name}» è cambiato e anche questa componente: «Aggiorna dal preset» sostituisce i valori locali.`;
    case 'embedded':
      return name ? 'Materiale incluso nella componente (il preset non esiste più).' : 'Materiale incluso nella componente.';
  }
}

/** Glass's press behaviour is the only part of the `motion` group a component uses (springs and stretch are for dragged lenses). */
const GLASS_PRESS: readonly string[] = ['pressScale', 'pressRefraction', 'pressLight'] satisfies ParamKey[];

/**
 * Which controls of the family apply to a component: its size, shape and radius come from the layout
 * (the `shape` group), and a dragged lens's physics are not used.
 */
function usedByComponent(family: string, group: string, key: string): boolean {
  if (group === 'shape') return false;
  if (family === 'glass' && group === 'motion') return GLASS_PRESS.includes(key);
  return true;
}

const GROUP_LABEL: Record<string, string> = { motion: 'Pressione' };

/**
 * The material of the open component, for any family: the same panel, built from the registry's
 * inspector model (`inspectorModel` / `applyControl`). Glass adds what only it has (the rendering
 * limits of the running backend); nothing else differs.
 */
function MaterialPanel({ session }: { session: LabSession }) {
  const advanced = useAdvanced();
  const definition = useLab((s) => s.builder.doc);
  const binding = definition.material;
  const library = useLab((s) => s.library);
  const report = useLab((s) => s.report);
  const [name, setName] = useState('');
  const def = MATERIALS.get(binding.family)!;
  const glass = binding.family === 'glass';
  const doc = useMemo(() => resolveDefinitionMaterial(definition), [definition]);
  const model = useMemo(() => inspectorModel(def, doc), [def, doc]);
  const spec = COMPONENTS.get(definition.type)!;
  const personal = library.filter((i) => i.origin === 'user' && i.doc.family === binding.family);
  const builtin = def.presets.map((p) => ({ id: p.doc.id, name: p.doc.name }));
  const presetItem = library.find((i) => i.id === binding.preset);
  const presetDoc = presetItem?.doc ?? (binding.preset ? MATERIALS.preset(binding.preset)?.doc : undefined);
  const presetName = presetItem?.name ?? presetDoc?.name ?? null;
  const link = bindingState(binding, presetDoc, hasMaterialOverrides(definition));
  const params = useMemo(() => (doc.family === 'glass' ? glassParams(doc) : null), [doc]);
  const path = report?.main.effective ?? 'refraction';
  const effective: Backend = path === 'refraction' ? 'svg' : 'css';
  const support = useMemo(() => new Map(supportReport(effective).map((r) => [r.key as string, r])), [effective]);
  const appl = useMemo(() => (params ? applicability({ object: 'navbar', path, motionReduced: report?.main.motionReduced ?? false, params }) : null), [params, path, report?.main.motionReduced]);
  const control = (c: InspectorControl, state?: 'hover' | 'pressed' | 'active' | 'disabled') => {
    const d = (state ? def.stateParams : def.params).find((x) => x.key === c.key)!;
    const key = c.key as ParamKey;
    return (
      <ParamField
        key={state ? `${state}-${c.key}` : c.key}
        d={d}
        value={c.value}
        applicability={!state && appl ? appl.get(key) : undefined}
        support={!state && glass ? support.get(c.key) : undefined}
        {...(state ? { idKey: `${state}-${c.key}` } : {})}
        onChange={(v) => session.setComponentControl({ key: c.key, ...(state ? { state } : {}) }, v)}
      />
    );
  };
  const limits = glass ? supportReport(effective).filter((r) => r.level !== 'supported') : [];
  const off = unsupportedProperties(definition);
  return (
    <div className="material-panel" id="cmpMaterialPanel" data-family={binding.family}>
      <label className="field row-field" htmlFor="cmpFamily">
        <span>Famiglia</span>
        <select id="cmpFamily" value={binding.family} onChange={(e) => session.setComponentFamily(e.target.value)}>
          {FAMILIES.filter((f) => f.status === 'available' && COMPONENTS.supports(definition.type, f.id)).map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
      </label>
      <p className="hint" id="cmpFamilyNote">
        Cambiare famiglia non tocca contenuto, struttura, layout, stati e interazioni di «{definition.name}»{spec.id === 'button' ? ' (né la variante)' : ''}.
      </p>
      <label className="field row-field" htmlFor="cmpMaterial">
        <span>Materiale</span>
        <select id="cmpMaterial" value={binding.preset ?? ''} onChange={(e) => e.target.value && session.applyMaterialPreset(e.target.value)}>
          <optgroup label={`Preset inclusi · ${def.name}`}>
            {builtin.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </optgroup>
          {personal.length > 0 && (
            <optgroup label="Preset personali">
              {personal.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </optgroup>
          )}
          {!presetDoc && <option value="">{doc.name} (incluso nella componente)</option>}
        </select>
      </label>
      <p className="hint" id="cmpMaterialNote" data-link={link}>
        {linkNote(link, presetName, presetItem?.origin === 'user')}
      </p>
      {(link === 'modified' || link === 'diverged' || link === 'outdated') && (
        <div className="button-row">
          <button type="button" className="button small" id="cmpUpdateFromPreset" onClick={() => session.resetComponentMaterial()}>
            <Icon name="restore" /> Aggiorna dal preset
          </button>
        </div>
      )}
      {definition.style.variant === 'primary' && (
        <p className="hint" id="cmpAccentNote">
          Variante Primary: {def.name} applica il suo accento ({def.accent.note}) sotto le tue modifiche.
        </p>
      )}
      {model.groups.map((g) => {
        const controls = g.controls.filter((c) => usedByComponent(binding.family, g.id, c.key) && (advanced || BASIC_MATERIAL.has(c.key)));
        if (!controls.length) return null;
        return (
          <div key={g.id} data-group={g.id}>
            <h3 className="panel-sub">{GROUP_LABEL[g.id] ?? g.label}</h3>
            {controls.map((c) => control(c))}
          </div>
        );
      })}
      {advanced && definition.type === 'button' && !glass && <p className="hint">Button non dispone di Active: questo stato del materiale resta nel preset e si prova nel Material Lab.</p>}
      {advanced && (definition.type === 'mobile-navbar' || definition.type === 'desktop-navbar') && !glass && <p className="hint">Pressed, Active e Disabled appartengono alle singole tab: si personalizzano in «Stati e interazioni». Gli override pressed/active/disabled del materiale sono conservati nel preset e si provano nel Material Lab, ma non modificano la superficie dell’intera navbar.</p>}
      {advanced && model.states.filter((st) => spec.states.includes(st.state) && ((definition.type !== 'mobile-navbar' && definition.type !== 'desktop-navbar') || !['pressed', 'active', 'disabled'].includes(st.state))).map((st) => (
        <div key={st.state} data-state={st.state}>
          <h3 className="panel-sub">Stato · {st.state}</h3>
          {st.controls.map((c) => control(c, st.state as 'hover' | 'pressed' | 'active' | 'disabled'))}
        </div>
      ))}
      <p className="hint">Dimensioni e forma della superficie vengono dal layout della componente{glass ? '; molla ed elasticità valgono solo per lenti trascinabili' : ''}.</p>
      <div className="button-row">
        <button type="button" className="button small" id="cmpResetMaterial" disabled={link === 'linked'} onClick={() => session.resetComponentMaterial()}>
          {presetDoc ? 'Ripristina valori del preset' : 'Ripristina valori iniziali'}
        </button>
      </div>
      <form
          className="save-preset"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await session.saveComponentMaterialAsPreset(name)) setName('');
          }}
        >
          <label htmlFor="cmpPresetName">Salva come preset personale</label>
          <div className="button-row">
            <input id="cmpPresetName" className="text-input" value={name} maxLength={80} placeholder="es. My Soft Glass" onChange={(e) => setName(e.target.value)} />
            <button type="submit" className="button small primary" id="cmpSavePreset" disabled={!name.trim()}>
              <Icon name="save" /> Salva preset
            </button>
          </div>
        </form>
      {glass && (
        <>
          <h3 className="panel-sub">Limiti del rendering ({effective === 'svg' ? 'SVG' : 'CSS'})</h3>
          {limits.length ? (
            <ul className="support-list" id="cmpSupportList">
              {limits.map((r) => (
                <li key={r.key} data-level={r.level}>
                  <strong>{PARAM_INDEX[r.key].label}</strong> · {LEVEL_LABEL[r.level]}
                  {r.note ? ` — ${r.note}` : ''}
                </li>
              ))}
            </ul>
          ) : (
            <p className="hint" id="cmpSupportList">
              Tutti i parametri supportati dal percorso in uso.
            </p>
          )}
        </>
      )}
      <h3 className="panel-sub">Proprietà della componente con {def.name}</h3>
      {off.length ? (
        <ul className="support-list" id="cmpUnsupportedList">
          {off.map((u) => (
            <li key={u.path} data-level="ignored" data-unsupported={u.path}>
              <code>{u.path}</code> · senza effetto — {u.reason}
            </li>
          ))}
        </ul>
      ) : (
        <p className="hint" id="cmpUnsupportedList">
          Ogni proprietà descritta ha effetto con {def.name}.
        </p>
      )}
      {(report?.group.reasons.length ?? 0) > 0 && glass && (
        <ul className="messages" data-ok="true">
          {report!.group.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
