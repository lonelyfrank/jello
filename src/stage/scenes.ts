/** Local test scenes for the GlassSource. Everything is generated or bundled; nothing is fetched. */

export type SceneId = 'app' | 'grid' | 'text' | 'blocks' | 'photo' | 'solid' | 'coords';

/** `short` names the scene under its thumbnail; `label` is the full description. */
export const SCENES: readonly { id: SceneId; label: string; short: string; diagnostic: boolean }[] = [
  { id: 'app', label: 'Dashboard (dati di esempio)', short: 'App', diagnostic: false },
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
const KPIS = [
  { label: 'Partite giocate', value: '128', delta: '+12 questa settimana', color: '#0a84ff' },
  { label: 'Punti medi', value: '74,6', delta: '+3,1 rispetto a ottobre', color: '#ff453a' },
  { label: 'Squadre attive', value: '24', delta: '2 nuove iscritte', color: '#30d158' },
  { label: 'Tempo medio', value: '41′', delta: '−2′ per partita', color: '#ff9f0a' },
];
const BARS = [38, 62, 47, 80, 55, 91, 70, 66, 84, 52, 73, 95];
const TEAMS = [
  ['Aironi', 18, 14, 4, '+96'],
  ['Basilischi', 18, 12, 6, '+51'],
  ['Cometa', 18, 11, 7, '+22'],
  ['Delfini', 18, 9, 9, '−4'],
  ['Estuario', 18, 7, 11, '−37'],
  ['Falchi', 18, 5, 13, '−68'],
  ['Gelsomini', 18, 4, 14, '−81'],
] as const;
const TILES = [
  ['Campo A', 'Libero', '#5e5ce6'],
  ['Campo B', 'In uso', '#bf5af2'],
  ['Campo C', 'In uso', '#ff375f'],
  ['Campo D', 'Libero', '#64d2ff'],
  ['Campo E', 'Chiuso', '#1c1c1e'],
  ['Campo F', 'Libero', '#ffd60a'],
] as const;

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
    el('h2', 'app-title', 'Torneo d’autunno'),
    el('p', 'app-sub', 'Schermata dimostrativa per valutare il materiale su una UI plausibile. Nessun dato proviene da un servizio.'),
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
  chart.append(el('h3', 'app-card-title', 'Punti per giornata'), bars, el('p', 'app-note', 'Giornate 1–12. Barre a spigoli vivi: utili per vedere la rifrazione sul bordo.'));
  const table = el('section', 'app-card');
  const t = el('table', 'app-table');
  const thead = el('thead', '');
  const hr = el('tr', '');
  for (const hcell of ['Squadra', 'G', 'V', 'P', 'Diff.']) hr.append(el('th', '', hcell));
  thead.append(hr);
  const tbody = el('tbody', '');
  for (const row of TEAMS) {
    const tr = el('tr', '');
    for (const c of row) tr.append(el('td', '', String(c)));
    tbody.append(tr);
  }
  t.append(thead, tbody);
  table.append(el('h3', 'app-card-title', 'Classifica (esempio)'), t);
  const tiles = el('div', 'app-tiles');
  for (const [name, state, color] of TILES) {
    const tile = el('article', 'app-tile');
    tile.style.setProperty('--tile', color);
    tile.append(el('strong', '', name), el('span', '', state));
    tiles.append(tile);
  }
  const text = el('section', 'app-card');
  text.append(
    el('h3', 'app-card-title', 'Note di giornata'),
    el('p', '', 'Il testo sotto la navbar deve restare riconoscibile: il centro della lente è neutro, solo il perimetro piega il contenuto.'),
    el('p', '', 'Scorri fino in fondo: l’ultima riga deve restare leggibile sopra la navbar, grazie al margine inferiore del contenuto.'),
  );
  root.append(head, kpis, chart, table, tiles, text, el('p', 'app-foot', 'Fine del contenuto · tutti i numeri sono di esempio.'));
}
