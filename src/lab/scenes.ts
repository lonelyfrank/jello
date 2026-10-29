/** Local test scenes for the GlassSource. Everything is generated or bundled; nothing is fetched. */

export type SceneId = 'grid' | 'text' | 'blocks' | 'photo' | 'solid' | 'coords';

export const SCENES: readonly { id: SceneId; label: string }[] = [
  { id: 'grid', label: 'Griglia' },
  { id: 'text', label: 'Testo' },
  { id: 'blocks', label: 'Blocchi colorati' },
  { id: 'photo', label: 'Fotografia (CC0)' },
  { id: 'solid', label: 'Tinta unita (controllo)' },
  { id: 'coords', label: 'Coordinate R=x G=y (diagnostica)' },
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
    case 'solid':
    case 'coords':
      break;
  }
  scroller.replaceChildren(scene);
}
