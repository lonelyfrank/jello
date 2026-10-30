/** Jello-owned example copy. These values are never applied to user documents. */
export const JELLO_DEMO = {
  tagline: 'Shape the Interface.',
  description: 'Beautiful materials. Endless possibilities.',
  card: 'A little softness. A lot of possibilities.',
  button: 'Create with Jello',
  empty: 'Your canvas is waiting for its first shape.',
  notification: 'Your creation is ready to shine.',
  search: 'Cerca materiali e componenti…',
  dashboard: {
    title: 'Jello Creative Space',
    subtitle: 'Una collezione di forme, materiali e idee. Dati dimostrativi Jello per valutare contrasto e rifrazione.',
    kpis: [
      { label: 'Forme esplorate', value: '128', delta: 'Ogni idea inizia da una forma', color: '#792ce8' },
      { label: 'Materiali', value: '24', delta: 'Luce, colore e possibilità', color: '#cc39e9' },
      { label: 'Collezioni', value: '12', delta: 'Uno spazio per le tue idee', color: '#387edb' },
      { label: 'Palette', value: '08', delta: 'Trova il tuo prossimo colore', color: '#d44991' },
    ],
    rows: [
      ['Soft Glass', 18, 14, 4, 'Glass'], ['Candy Studio', 18, 12, 6, 'Solid'],
      ['Violet Forms', 18, 11, 7, 'Glass'], ['Gentle Light', 18, 9, 9, 'Glass'],
      ['Color Stories', 18, 7, 11, 'Solid'], ['Quiet Shapes', 18, 5, 13, 'Solid'],
      ['Little Details', 18, 4, 14, 'Glass'],
    ],
    tiles: [
      ['Violet', 'Esplora il colore', '#792ce8'], ['Jelly', 'Ispirazione visiva', '#cc39e9'],
      ['Candy', 'Forme morbide', '#ff52af'], ['Ocean', 'Nuove prospettive', '#387edb'],
      ['Midnight', 'Luce nel buio', '#25243b'], ['Sunrise', 'Idee luminose', '#e2a445'],
    ],
  },
} as const;
