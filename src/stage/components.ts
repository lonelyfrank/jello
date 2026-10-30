import { JELLO_DEMO } from './demo-content';
/**
 * Demo components for the preview: a button, a card and a panel (dialog).
 * Each one is a real HTML component with one glass surface attached to its
 * host; text, icons and controls stay in the foreground, never filtered.
 *
 * Same lifecycle as the navbar: mount() attaches the surface and binds its
 * listeners, unmount() destroys the surface (its lens leaves the filter),
 * releases every listener and hides the host.
 */

import { bindPress } from '../core/interaction';
import type { GlassContext } from '../core/context';
import type { GlassParams } from '../core/params';
import type { GlassSurface } from '../core/surface';

export interface StageObject {
  readonly host: HTMLElement;
  readonly surface: GlassSurface | null;
  mount(ctx: GlassContext, params: GlassParams): GlassSurface;
  unmount(): void;
  setParams(params: GlassParams): void;
  dispose(): void;
}

const ICON_CHECK = '<path d="M5 12.5 10 17.5 19 7"/>';
const ICON_CLOSE = '<path d="M6 6l12 12M18 6 6 18"/>';
const ICON_PANEL = '<rect x="4" y="5" width="16" height="14" rx="3"/><path d="M4 9.5h16"/>';

const icon = (paths: string) => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths}</svg>`;

abstract class Demo implements StageObject {
  readonly host: HTMLElement;
  protected current: GlassSurface | null = null;
  protected cleanups: (() => void)[] = [];

  constructor(
    protected readonly root: HTMLElement,
    host: HTMLElement,
  ) {
    this.host = host;
    this.host.hidden = true;
    this.root.append(this.wrapper());
  }

  get surface(): GlassSurface | null {
    return this.current;
  }

  /** Element appended to the overlay (the host, or a layout box around it). */
  protected wrapper(): HTMLElement {
    return this.host;
  }

  protected abstract radius(): number | 'capsule';
  protected bind(_surface: GlassSurface): (() => void)[] {
    return [];
  }

  mount(ctx: GlassContext, params: GlassParams): GlassSurface {
    if (this.current) return this.current;
    this.wrapper().hidden = false;
    this.host.hidden = false;
    this.current = ctx.attach(this.host, { params, sizing: 'element', radius: this.radius() });
    this.cleanups = this.bind(this.current);
    return this.current;
  }

  unmount(): void {
    if (!this.current) return;
    for (const c of this.cleanups.splice(0)) c();
    this.current.destroy();
    this.current = null;
    this.host.hidden = true;
    this.wrapper().hidden = true;
  }

  setParams(params: GlassParams): void {
    this.current?.setParams(params);
  }

  dispose(): void {
    this.unmount();
    this.wrapper().remove();
  }
}

/** One large pressable button; the count shows that clicks still work under the glass. */
export class ButtonDemo extends Demo {
  private count = 0;
  private readonly label: HTMLElement;
  private readonly box: HTMLElement;

  constructor(root: HTMLElement) {
    const doc = root.ownerDocument;
    const host = doc.createElement('button');
    host.type = 'button';
    host.className = 'demo-button';
    host.id = 'demoButton';
    host.innerHTML = `${icon(ICON_CHECK)}<span>${JELLO_DEMO.button}</span>`;
    const box = doc.createElement('div');
    box.className = 'demo-center';
    super(root, host);
    this.box = box;
    this.label = doc.createElement('p');
    this.label.className = 'demo-count';
    this.label.setAttribute('aria-live', 'polite');
    this.label.textContent = 'Non ancora premuto';
    box.append(host, this.label);
    root.append(box);
    box.hidden = true;
  }

  protected override wrapper(): HTMLElement {
    return this.box ?? this.host;
  }

  protected radius(): 'capsule' {
    return 'capsule';
  }

  protected override bind(surface: GlassSurface) {
    const click = () => {
      this.count++;
      this.label.textContent = `Premuto ${this.count} ${this.count === 1 ? 'volta' : 'volte'}`;
    };
    this.host.addEventListener('click', click);
    return [bindPress(surface), () => this.host.removeEventListener('click', click)];
  }

  get presses(): number {
    return this.count;
  }
}

/** A content card: not pressable as a whole, its own button is plain foreground. */
export class CardDemo extends Demo {
  private readonly box: HTMLElement;

  constructor(root: HTMLElement) {
    const doc = root.ownerDocument;
    const host = doc.createElement('article');
    host.className = 'demo-card';
    host.id = 'demoCard';
    host.setAttribute('aria-labelledby', 'demoCardTitle');
    host.innerHTML =
      '<p class="demo-kicker">Jello Collection · demo</p>' +
      `<h3 class="demo-title" id="demoCardTitle">${JELLO_DEMO.tagline}</h3>` +
      `<p class="demo-text">${JELLO_DEMO.card}</p>` +
      '<p class="demo-score" aria-label="Collezione 01 di 24"><strong>01</strong><span aria-hidden="true">/</span><strong>24</strong></p>' +
      '<button type="button" class="demo-link">Dettagli</button>';
    const box = doc.createElement('div');
    box.className = 'demo-center';
    super(root, host);
    this.box = box;
    box.append(host);
    root.append(box);
    box.hidden = true;
  }

  protected override wrapper(): HTMLElement {
    return this.box ?? this.host;
  }

  protected radius(): number {
    return 24;
  }
}

/**
 * A panel with dialog semantics inside the preview (non-modal: the rest of
 * the lab stays usable). Closing it leaves an "open" button that is itself
 * a glass component, so both states can be judged.
 */
export class DialogDemo extends Demo {
  private readonly box: HTMLElement;
  private readonly opener: HTMLButtonElement;
  private open = true;
  private ctx: GlassContext | null = null;
  private params: GlassParams | null = null;
  private openerSurface: GlassSurface | null = null;

  constructor(root: HTMLElement) {
    const doc = root.ownerDocument;
    const host = doc.createElement('section');
    host.className = 'demo-dialog';
    host.id = 'demoDialog';
    host.setAttribute('role', 'dialog');
    host.setAttribute('aria-modal', 'false');
    host.setAttribute('aria-labelledby', 'demoDialogTitle');
    host.innerHTML =
      '<header class="demo-dialog-head">' +
      '<h3 class="demo-title" id="demoDialogTitle">Impostazioni dello Studio</h3>' +
      `<button type="button" class="demo-icon-button" data-close aria-label="Chiudi il pannello">${icon(ICON_CLOSE)}</button>` +
      '</header>' +
      '<p class="demo-text">Un pannello sopra contenuti che scorrono: testi e controlli devono restare leggibili su ogni sfondo.</p>' +
      '<label class="demo-check"><input type="checkbox" checked /> <span>Notifiche delle creazioni</span></label>' +
      '<div class="demo-actions"><button type="button" class="demo-link" data-close>Annulla</button><button type="button" class="demo-primary" data-close>Salva</button></div>';
    const box = doc.createElement('div');
    box.className = 'demo-center';
    super(root, host);
    this.box = box;
    this.opener = doc.createElement('button');
    this.opener.type = 'button';
    this.opener.className = 'demo-button';
    this.opener.id = 'demoDialogOpen';
    this.opener.hidden = true;
    this.opener.innerHTML = `${icon(ICON_PANEL)}<span>Apri il pannello</span>`;
    box.append(host, this.opener);
    root.append(box);
    box.hidden = true;
  }

  protected override wrapper(): HTMLElement {
    return this.box ?? this.host;
  }

  protected radius(): number {
    return 28;
  }

  override mount(ctx: GlassContext, params: GlassParams): GlassSurface {
    this.ctx = ctx;
    this.params = params;
    const s = super.mount(ctx, params);
    if (!this.open) this.setOpen(false);
    return s;
  }

  protected override bind(surface: GlassSurface) {
    const onClick = (e: Event) => {
      if ((e.target as Element).closest('[data-close]')) this.setOpen(false, true);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        this.setOpen(false, true);
      }
    };
    const onOpen = () => this.setOpen(true, true);
    this.host.addEventListener('click', onClick);
    this.host.addEventListener('keydown', onKey);
    this.opener.addEventListener('click', onOpen);
    void surface;
    return [
      () => this.host.removeEventListener('click', onClick),
      () => this.host.removeEventListener('keydown', onKey),
      () => this.opener.removeEventListener('click', onOpen),
      () => this.detachOpener(),
    ];
  }

  override setParams(params: GlassParams): void {
    this.params = params;
    super.setParams(params);
    this.openerSurface?.setParams(params);
  }

  get isOpen(): boolean {
    return this.open;
  }

  /** The panel's lens is only in the filter while the panel is visible. */
  setOpen(open: boolean, focus = false): void {
    this.open = open;
    this.host.hidden = !open;
    this.opener.hidden = open;
    if (!this.current) return;
    if (open) {
      this.detachOpener();
      this.ctx?.requestMeasure(this.current);
      if (focus) this.host.querySelector<HTMLElement>('[data-close]')?.focus();
    } else {
      this.ctx?.requestMeasure(this.current);
      if (this.ctx && this.params && !this.openerSurface) {
        this.openerSurface = this.ctx.attach(this.opener, { params: this.params, sizing: 'element', radius: 'capsule' });
        this.cleanups.push(bindPress(this.openerSurface));
      }
      if (focus) this.opener.focus();
    }
  }

  private detachOpener() {
    this.openerSurface?.destroy();
    this.openerSurface = null;
  }
}
