/** Adjustment panel, generated from the parameter table. Updates only on input events, never per frame. */

import {
  PARAMS,
  PRESETS,
  type GlassParams,
  type NumberDescriptor,
  type ParamDescriptor,
  type ParamGroup,
  type ParamKey,
} from '../core';
import { SCENES, type SceneId } from './scenes';

const GROUPS: Record<ParamGroup, string> = {
  shape: 'Forma',
  optics: 'Ottica',
  material: 'Materiale',
  light: 'Luce',
  shadow: 'Ombra',
  motion: 'Movimento',
};

export interface LabOptions {
  scene: SceneId;
  animate: boolean;
  theme: 'system' | 'light' | 'dark';
  path: 'auto' | 'refraction' | 'satin' | 'opaque';
  compare: boolean;
  showMap: boolean;
  components: boolean;
  reduceMotion: boolean;
  reduceTransparency: boolean;
}

export interface PanelHandlers {
  onParam(key: ParamKey, value: GlassParams[ParamKey]): void;
  onPreset(id: string): void;
  onOption<K extends keyof LabOptions>(key: K, value: LabOptions[K]): void;
  onReset(): void;
  onExport(): string;
  onImport(text: string): { ok: boolean; messages: string[] };
  onLocalImage(file: File): void;
  onMeasure(): Promise<string>;
}

export interface StatusView {
  configured: string;
  detected: string;
  verified: string;
  effective: string;
  reasons: string;
  engine: string;
  maps: string;
}

const h = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<Record<string, string>> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) if (v !== undefined) el.setAttribute(k, v);
  el.append(...children);
  return el;
};

const format = (d: NumberDescriptor, v: number) => {
  const digits = d.step < 0.01 ? 3 : d.step < 1 ? 2 : 0;
  return `${v.toFixed(digits)}${d.unit ? ` ${d.unit}` : ''}`;
};

export class Panel {
  private readonly inputs = new Map<ParamKey, HTMLInputElement | HTMLSelectElement>();
  private readonly outputs = new Map<ParamKey, HTMLOutputElement>();
  private readonly status = new Map<keyof StatusView, HTMLElement>();
  private readonly options = new Map<keyof LabOptions, HTMLInputElement | HTMLSelectElement>();
  private presetSelect!: HTMLSelectElement;
  private presetNote!: HTMLElement;
  private importBox!: HTMLTextAreaElement;
  private importMessages!: HTMLElement;
  private mapImage!: HTMLImageElement;
  private mapNote!: HTMLElement;
  private measureOut!: HTMLElement;

  constructor(root: HTMLElement, private readonly handlers: PanelHandlers, opts: LabOptions) {
    root.append(
      this.statusSection(),
      this.presetSection(),
      ...this.paramSections(),
      this.sceneSection(opts),
      this.renderingSection(opts),
      this.mapSection(opts),
      this.ioSection(),
    );
  }

  setParams(p: GlassParams): void {
    for (const d of PARAMS) {
      const input = this.inputs.get(d.key);
      if (!input) continue;
      const v = p[d.key];
      if (input.value !== String(v)) input.value = String(v);
      const out = this.outputs.get(d.key);
      if (out && d.type === 'number') out.value = format(d, v as number);
    }
  }

  setPreset(id: string | null): void {
    this.presetSelect.value = id ?? '';
    const preset = PRESETS.find((p) => p.id === id);
    this.presetNote.textContent = preset ? preset.note : 'Parametri personalizzati.';
    this.presetNote.dataset.approximation = preset?.approximation ? 'true' : 'false';
  }

  setOption<K extends keyof LabOptions>(key: K, value: LabOptions[K]): void {
    const el = this.options.get(key);
    if (!el) return;
    if (el instanceof HTMLInputElement && el.type === 'checkbox') el.checked = Boolean(value);
    else el.value = String(value);
  }

  setStatus(view: StatusView): void {
    for (const [k, el] of this.status) el.textContent = view[k];
  }

  setMap(url: string | null, note: string): void {
    if (url) this.mapImage.src = url;
    this.mapImage.hidden = !url;
    this.mapNote.textContent = note;
  }

  private section(title: string, ...children: Node[]) {
    const d = h('details', { class: 'panel-section', open: '' }, h('summary', {}, title), ...children);
    return d;
  }

  private statusSection() {
    const rows: [keyof StatusView, string][] = [
      ['configured', 'Configurato'],
      ['detected', 'Supporto rilevato'],
      ['verified', 'Verificato visivamente'],
      ['effective', 'Percorso in uso'],
      ['reasons', 'Motivi'],
      ['engine', 'Motore'],
      ['maps', 'Mappe generate'],
    ];
    const dl = h('dl', { class: 'status-list', id: 'statusList' });
    for (const [k, label] of rows) {
      const dd = h('dd', { 'data-status': k });
      this.status.set(k, dd);
      dl.append(h('dt', {}, label), dd);
    }
    const measure = h('button', { type: 'button', class: 'button' }, 'Misura frame (5 s)');
    this.measureOut = h('p', { class: 'hint', 'aria-live': 'polite', id: 'measureOut' });
    measure.addEventListener('click', async () => {
      measure.disabled = true;
      this.measureOut.textContent = 'Misura in corso…';
      this.measureOut.textContent = await this.handlers.onMeasure();
      measure.disabled = false;
    });
    return this.section(
      'Stato del renderer',
      dl,
      h('p', { class: 'hint' }, 'CSS.supports() indica solo il supporto dichiarato. "Verificato" richiede un test raster superato su questo motore e versione; non vale mai per un telefono reale.'),
      measure,
      this.measureOut,
    );
  }

  private presetSection() {
    this.presetSelect = h('select', { id: 'preset' });
    for (const p of PRESETS) this.presetSelect.append(h('option', { value: p.id }, p.label));
    this.presetSelect.append(h('option', { value: '', disabled: '' }, 'Personalizzato'));
    this.presetSelect.addEventListener('change', () => this.handlers.onPreset(this.presetSelect.value));
    this.presetNote = h('p', { class: 'hint preset-note', id: 'presetNote' });
    return this.section('Preset', h('label', { class: 'field' }, h('span', {}, 'Preset'), this.presetSelect), this.presetNote);
  }

  private paramSections() {
    const byGroup = new Map<ParamGroup, ParamDescriptor[]>();
    for (const d of PARAMS) byGroup.set(d.group, [...(byGroup.get(d.group) ?? []), d]);
    return [...byGroup].map(([group, list]) => this.section(GROUPS[group], ...list.map((d) => this.control(d))));
  }

  private control(d: ParamDescriptor) {
    const id = `param-${d.key}`;
    const label = h('label', { for: id }, d.label);
    const field = h('div', { class: 'field', title: d.description });
    if (d.type === 'number') {
      const input = h('input', {
        id,
        type: 'range',
        min: String(d.min),
        max: String(d.max),
        step: String(d.step),
        'data-param': d.key,
      });
      const out = h('output', { for: id });
      input.addEventListener('input', () => {
        out.value = format(d, input.valueAsNumber);
        this.handlers.onParam(d.key, input.valueAsNumber as never);
      });
      this.inputs.set(d.key, input);
      this.outputs.set(d.key, out);
      field.append(h('span', { class: 'field-head' }, label, out), input);
    } else if (d.type === 'enum') {
      const select = h('select', { id, 'data-param': d.key });
      for (const o of d.options) select.append(h('option', { value: o }, o));
      select.addEventListener('change', () => this.handlers.onParam(d.key, select.value as never));
      this.inputs.set(d.key, select);
      field.append(h('span', { class: 'field-head' }, label), select);
    } else {
      const input = h('input', { id, type: 'color', 'data-param': d.key });
      input.addEventListener('input', () => this.handlers.onParam(d.key, input.value as never));
      this.inputs.set(d.key, input);
      field.append(h('span', { class: 'field-head' }, label), input);
    }
    return field;
  }

  private checkbox<K extends keyof LabOptions>(key: K, label: string, value: boolean, hint?: string) {
    const id = `opt-${key}`;
    const input = h('input', { id, type: 'checkbox' });
    input.checked = value;
    input.addEventListener('change', () => this.handlers.onOption(key, input.checked as LabOptions[K]));
    this.options.set(key, input);
    const row = h('label', { class: 'check', for: id }, input, h('span', {}, label));
    return hint ? h('div', {}, row, h('p', { class: 'hint' }, hint)) : row;
  }

  private select<K extends keyof LabOptions>(key: K, label: string, options: [string, string][], value: string) {
    const id = `opt-${key}`;
    const select = h('select', { id });
    for (const [v, l] of options) select.append(h('option', { value: v }, l));
    select.value = value;
    select.addEventListener('change', () => this.handlers.onOption(key, select.value as LabOptions[K]));
    this.options.set(key, select);
    return h('label', { class: 'field', for: id }, h('span', {}, label), select);
  }

  private sceneSection(o: LabOptions) {
    const file = h('input', { type: 'file', accept: 'image/*', id: 'localImage', class: 'visually-hidden' });
    file.addEventListener('change', () => {
      const f = file.files?.[0];
      if (f) this.handlers.onLocalImage(f);
    });
    return this.section(
      'Scena',
      this.select('scene', 'Sfondo', SCENES.map((s) => [s.id, s.label]), o.scene),
      h('label', { class: 'button', for: 'localImage' }, 'Usa un’immagine locale…'),
      file,
      h('p', { class: 'hint' }, 'L’immagine resta nel browser (object URL), non viene caricata altrove.'),
      this.checkbox('animate', 'Anima lo sfondo', o.animate),
      this.select('theme', 'Tema', [['system', 'Sistema'], ['light', 'Chiaro'], ['dark', 'Scuro']], o.theme),
    );
  }

  private renderingSection(o: LabOptions) {
    return this.section(
      'Rendering',
      this.select(
        'path',
        'Percorso richiesto',
        [
          ['auto', 'Automatico'],
          ['refraction', 'Rifrazione (filtro SVG sulla sorgente)'],
          ['satin', 'Satinato (backdrop-filter CSS)'],
          ['opaque', 'Opaco (fallback)'],
        ],
        o.path,
      ),
      this.checkbox('compare', 'Confronto sincronizzato con il satinato', o.compare),
      this.checkbox('components', 'Mostra pulsante, selettore e slider (4 superfici)', o.components),
      this.checkbox('reduceMotion', 'Riduci effetti e movimento', o.reduceMotion, 'Disattiva molla, elasticità, scala e animazione dello sfondo.'),
      this.checkbox('reduceTransparency', 'Riduci trasparenza', o.reduceTransparency, 'Forza il materiale opaco, come prefers-reduced-transparency.'),
    );
  }

  private mapSection(o: LabOptions) {
    this.mapImage = h('img', { class: 'map-preview', alt: 'Mappa di displacement della capsula', id: 'mapPreview' });
    this.mapImage.hidden = true;
    this.mapNote = h('p', { class: 'hint', id: 'mapNote' });
    return this.section(
      'Mappa di displacement',
      this.checkbox('showMap', 'Sovrapponi la mappa alla capsula', o.showMap),
      this.mapImage,
      h('p', { class: 'hint' }, 'Rosso = deviazione orizzontale, verde = verticale (128 = nessuna), blu = copertura della forma.'),
      this.mapNote,
    );
  }

  private ioSection() {
    const reset = h('button', { type: 'button', class: 'button', id: 'resetParams' }, 'Ripristina iniziali');
    reset.addEventListener('click', () => this.handlers.onReset());
    const exportButton = h('button', { type: 'button', class: 'button', id: 'exportParams' }, 'Esporta JSON');
    const download = h('button', { type: 'button', class: 'button', id: 'downloadParams' }, 'Scarica file');
    this.importBox = h('textarea', { id: 'paramsJson', rows: '8', spellcheck: 'false', 'aria-label': 'Parametri in JSON' });
    exportButton.addEventListener('click', () => {
      this.importBox.value = this.handlers.onExport();
      this.importBox.select();
    });
    download.addEventListener('click', () => {
      const blob = new Blob([this.handlers.onExport()], { type: 'application/json' });
      const a = h('a', { href: URL.createObjectURL(blob), download: 'jello-glass.json' });
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
    const apply = h('button', { type: 'button', class: 'button', id: 'importParams' }, 'Importa dal testo');
    this.importMessages = h('ul', { class: 'messages', id: 'importMessages', role: 'status' });
    const show = (r: { ok: boolean; messages: string[] }) => {
      this.importMessages.dataset.ok = String(r.ok);
      this.importMessages.replaceChildren(
        h('li', {}, r.ok ? 'Parametri importati.' : 'Import rifiutato: nessun parametro è stato modificato.'),
        ...r.messages.map((m) => h('li', {}, m)),
      );
    };
    apply.addEventListener('click', () => show(this.handlers.onImport(this.importBox.value)));
    const file = h('input', { type: 'file', accept: 'application/json,.json', id: 'importFile', class: 'visually-hidden' });
    file.addEventListener('change', async () => {
      const f = file.files?.[0];
      if (!f) return;
      const text = await f.text();
      this.importBox.value = text;
      show(this.handlers.onImport(text));
      file.value = '';
    });
    return this.section(
      'Parametri JSON',
      h('div', { class: 'button-row' }, reset, exportButton, download),
      this.importBox,
      h('div', { class: 'button-row' }, apply, h('label', { class: 'button', for: 'importFile' }, 'Importa file…'), file),
      this.importMessages,
    );
  }
}
