import { JELLO_DEMO } from './demo-content';
/** Local test scenes for the GlassSource. Everything is generated or bundled; nothing is fetched. */

export type SceneId = 'app' | 'grid' | 'text' | 'blocks' | 'photo' | 'solid' | 'coords' | 'jelly-macro' | 'jelly-spectrum' | 'jello-dark' | 'jello-light' | 'gradient' | 'checkerboard' | 'contrast';

/** `short` names the scene under its thumbnail; `label` is the full description. */
export const SCENES: readonly { id: SceneId; label: string; short: string; diagnostic: boolean }[] = [
  { id: 'jelly-macro', label: 'Jelly Macro · asset Jello', short: 'Jelly Macro', diagnostic: false },
  { id: 'jelly-spectrum', label: 'Jelly Spectrum · asset Jello', short: 'Spectrum', diagnostic: false },
  { id: 'jello-dark', label: 'Jello Dark', short: 'Dark', diagnostic: false },
  { id: 'jello-light', label: 'Jello Light', short: 'Light', diagnostic: false },
  { id: 'gradient', label: 'Gradiente Jello', short: 'Gradient', diagnostic: true },
  { id: 'checkerboard', label: 'Checkerboard', short: 'Checker', diagnostic: true },
  { id: 'contrast', label: 'Contrasto elevato', short: 'Contrast', diagnostic: true },
  { id: 'app', label: 'Jello Creative Space (dati di esempio)', short: 'Jello UI', diagnostic: false },
  { id: 'grid', label: 'Griglia', short: 'Griglia', diagnostic: true },
  { id: 'text', label: 'Testo', short: 'Testo', diagnostic: true },
  { id: 'blocks', label: 'Blocchi colorati', short: 'Blocchi', diagnostic: true },
  { id: 'photo', label: 'Fotografia (CC0)', short: 'Foto', diagnostic: true },
  { id: 'solid', label: 'Tinta unita (controllo)', short: 'Tinta', diagnostic: true },
  { id: 'coords', label: 'Coordinate R=x G=y (diagnostica)', short: 'Coord.', diagnostic: true },
];

export const PHOTO = {
  src: `${import.meta.env.BASE_URL}assets/tulips-kuznietsov-cc0.jpg`,
  credit: 'Foto: John-Mark Kuznietsov (Unsplash), CC0 1.0 via Wikimedia Commons',
};

const TEXT = [
  'Un materiale glass deve lasciare passare il colore senza spegnerlo. Il blur ammorbidisce, la rifrazione piega: sono due cose diverse e qui si regolano separatamente.',
  'Vicino al bordo la superficie è curva. Il contenuto che si trova appena fuori dalla lente entra nella fascia compresso, come succede guardando attraverso il bordo di un bicchiere.',
  'Al centro la lente resta neutra: le righe di questo testo devono restare dritte quando la capsula ci passa sopra, e piegarsi solo sul perimetro.',
  'Testi e icone della capsula stanno sopra il materiale e non passano dal filtro. Se si deformano, è un errore del renderer, non una scelta estetica.',
  'Scorri questo contenuto: la lente resta ferma e la deviazione deve seguire il contenuto senza scarti, anche dopo un ridimensionamento della finestra.',
];

const BLOCK_COLORS = ['#ff453a', '#ff9f0a', '#ffd60a', '#30d158', '#64d2ff', '#0a84ff', '#5e5ce6', '#bf5af2', '#ff375f', '#1c1c1e', '#f2f2f7', '#8e8e93'];

export function renderScene(scroller: HTMLElement, id: SceneId, photoSrc: string = PHOTO.src): void {
  const doc = scroller.ownerDocument;
  const scene = doc.createElement('div');
  scene.className = `scene scene-${id}`;
  scene.dataset.scene = id;
  const motion = doc.createElement('div');
  motion.className = 'scene-motion';
  scene.appendChild(motion);

  switch (id) {
    case 'grid': {
      const label = doc.createElement('div');
      label.className = 'scene-grid-labels';
      for (let i = 0; i < 12; i++) {
        const s = doc.createElement('span');
        s.textContent = String.fromCharCode(65 + i);
        label.appendChild(s);
      }
      motion.appendChild(label);
      break;
    }
    case 'text': {
      for (let i = 0; i < 4; i++) {
        for (const [j, t] of TEXT.entries()) {
          const el = doc.createElement(j === 0 ? 'h2' : 'p');
          el.textContent = j === 0 ? `Sezione ${i + 1} · Passare il colore` : t;
          motion.appendChild(el);
          if (j === 0) {
            const p = doc.createElement('p');
            p.textContent = t;
            motion.appendChild(p);
          }
        }
      }
      break;
    }
    case 'blocks': {
      for (let i = 0; i < 48; i++) {
        const b = doc.createElement('span');
        b.className = 'block';
        b.style.background = BLOCK_COLORS[(i * 5) % BLOCK_COLORS.length]!;
        motion.appendChild(b);
      }
      break;
    }
    case 'photo': {
      for (let i = 0; i < 2; i++) {
        const img = doc.createElement('img');
        img.src = photoSrc;
        img.alt = i === 0 ? 'Mazzi di tulipani colorati in un mercato' : '';
        img.decoding = 'async';
        img.draggable = false;
        motion.appendChild(img);
      }
      const credit = doc.createElement('p');
      credit.className = 'scene-credit';
      credit.textContent = photoSrc === PHOTO.src ? PHOTO.credit : 'Immagine locale caricata dall’utente (non inviata altrove)';
      motion.appendChild(credit);
      break;
    }
    case 'jelly-macro':
    case 'jelly-spectrum': {
      for (let i = 0; i < (id === 'jelly-macro' ? 2 : 6); i++) {
        const img = doc.createElement('img');
        img.src = `${import.meta.env.BASE_URL}assets/backgrounds/jelly-macro.png`;
        img.alt = i === 0 ? 'Gelatina luminosa viola e magenta, asset Jello' : '';
        img.draggable = false;
        motion.appendChild(img);
      }
      break;
    }
    case 'jello-dark':
    case 'jello-light': {
      const title = doc.createElement('h2');
      title.textContent = JELLO_DEMO.tagline;
      const text = doc.createElement('p');
      text.textContent = JELLO_DEMO.description;
      motion.append(title, text);
      break;
    }
    case 'gradient':
    case 'checkerboard':
    case 'contrast':
      break;
    case 'app':
      renderDashboard(motion);
      break;
    case 'solid':
    case 'coords':
      break;
  }
  scroller.replaceChildren(scene);
}

/**
 * A plausible application screen to judge the material in context: coloured
 * cards, big numbers, hard edges, text. All values are invented and fixed.
 */
const KPIS = JELLO_DEMO.dashboard.kpis;
const BARS = [38, 62, 47, 80, 55, 91, 70, 66, 84, 52, 73, 95];
const COLLECTIONS = JELLO_DEMO.dashboard.rows;
const TILES = JELLO_DEMO.dashboard.tiles;

function renderDashboard(root: HTMLElement) {
  const doc = root.ownerDocument;
  const el = (tag: string, cls: string, text?: string) => {
    const e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const head = el('header', 'app-head');
  head.append(
    el('span', 'app-badge', 'Dati di esempio · non reali'),
    el('h2', 'app-title', JELLO_DEMO.dashboard.title),
    el('p', 'app-sub', JELLO_DEMO.dashboard.subtitle),
  );
  const kpis = el('div', 'app-kpis');
  for (const k of KPIS) {
    const card = el('article', 'app-kpi');
    card.style.background = k.color;
    card.append(el('span', 'app-kpi-label', k.label), el('strong', 'app-kpi-value', k.value), el('span', 'app-kpi-delta', k.delta));
    kpis.append(card);
  }
  const chart = el('section', 'app-card');
  const bars = el('div', 'app-bars');
  BARS.forEach((v, i) => {
    const b = el('span', 'app-bar');
    b.style.height = `${v}%`;
    b.style.background = i % 4 === 3 ? '#ff453a' : 'var(--scene-ink)';
    bars.append(b);
  });
  chart.append(el('h3', 'app-card-title', 'Idee in movimento'), bars, el('p', 'app-note', 'Studio 01–12 · dati Jello dimostrativi. I bordi netti permettono di valutare la rifrazione.'));
  const table = el('section', 'app-card');
  const t = el('table', 'app-table');
  const thead = el('thead', '');
  const hr = el('tr', '');
  for (const hcell of ['Collezione', 'Forme', 'Colori', 'Stati', 'Materiale']) hr.append(el('th', '', hcell));
  thead.append(hr);
  const tbody = el('tbody', '');
  for (const row of COLLECTIONS) {
    const tr = el('tr', '');
    for (const c of row) tr.append(el('td', '', String(c)));
    tbody.append(tr);
  }
  t.append(thead, tbody);
  table.append(el('h3', 'app-card-title', 'Collezioni Jello (esempio)'), t);
  const tiles = el('div', 'app-tiles');
  for (const [name, state, color] of TILES) {
    const tile = el('article', 'app-tile');
    tile.style.setProperty('--tile', color);
    tile.append(el('strong', '', name), el('span', '', state));
    tiles.append(tile);
  }
  const text = el('section', 'app-card');
  text.append(
    el('h3', 'app-card-title', 'Note dallo Studio'),
    el('p', '', 'Il testo sotto la navbar deve restare riconoscibile: il centro della lente è neutro, solo il perimetro piega il contenuto.'),
    el('p', '', 'Scorri fino in fondo: l’ultima riga deve restare leggibile sopra la navbar, grazie al margine inferiore del contenuto.'),
  );
  root.append(head, kpis, chart, table, tiles, text, el('p', 'app-foot', 'Fine del contenuto · tutti i numeri sono di esempio.'));
}
