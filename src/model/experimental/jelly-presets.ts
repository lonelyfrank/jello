/** Candidate values, not visually approved presets. Never registered in the production library. */
import { createExperimentalJellyDocument, defaultJellyParams, type JellyExperimentalDocument, type JellyParams } from './jelly';

export interface JellyCandidatePreset {
  doc: JellyExperimentalDocument;
  description: string;
  visuallyVerified: false;
}
const candidate = (id: string, name: string, description: string, params: Partial<JellyParams>): JellyCandidatePreset => {
  const p = { ...defaultJellyParams(), ...params };
  const shade = (factor: number) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(p.tint.slice(i, i+2), 16)*factor).toString(16).padStart(2, '0')).join('');
  return {
    doc: createExperimentalJellyDocument({ id, name, params, states: {
      hover: { highlightStrength: 0.65, bodyOpacity: 0.94 },
      pressed: { tint: shade(0.84), bodyOpacity: 0.98, highlightStrength: 0.12, shadowOpacity: 0.06 },
      active: { tint: shade(0.9), bodyOpacity: 0.98, highlightStrength: 0.5 },
      disabled: { tint: '#d4d0dd', foreground: '#534b62', bodyOpacity: 0.75, highlightStrength: 0.1, shadowOpacity: 0.04 },
    }, meta: { notes: `Candidato sperimentale M6.2; evidenza e limiti visivi in docs/jelly-m62-delivery.md. ${description}` } }),
    description, visuallyVerified: false,
  };
};

export const JELLY_CANDIDATE_PRESETS: readonly JellyCandidatePreset[] = [
  candidate('jelly-soft', 'Jelly Soft', 'Lilla, traslucenza moderata, inclusioni e ritorno morbido candidato.', { foreground: '#171022', seed: 10631, density: 8, radiusMin: 2.5, radiusMax: 6, opacity: 0.8 }),
  candidate('jelly-clear', 'Jelly Clear', 'Tinta tenue, maggiore trasmissione e riflessi controllati.', {
    tint: '#d2e9ee', foreground: '#101b22', bodyOpacity: 0.92, transmission: 0.7,
    absorption: 0.5, scattering: 0.12, highlightStrength: 0.4, roughness: 0.3, seed: 20631, density: 5, radiusMin: 2, radiusMax: 5, opacity: 0.8,
  }),
  candidate('jelly-candy', 'Jelly Candy', 'Colore saturo, bordi più densi e risposta più elastica.', {
    tint: '#d64b93', foreground: '#180912', bodyOpacity: 0.9, transmission: 0.4, absorption: 2.2,
    thickness: 0.55, edgeFalloff: 2, dampingRatio: 0.4, maxDeformation: 0.09, seed: 30631, density: 10, radiusMin: 2.5, radiusMax: 6, opacity: 0.8,
  }),
  candidate('jelly-dense', 'Jelly Dense', 'Diffusione interna maggiore, risposta più breve e smorzata.', {
    tint: '#a6c9b2', foreground: '#172e25', bodyOpacity: 0.95, transmission: 0.25,
    absorption: 1.8, scattering: 0.7, responseMs: 220, dampingRatio: 1.05,
    maxDeformation: 0.035, releaseImpulse: 0.05, seed: 40631, density: 7, radiusMin: 2, radiusMax: 5, opacity: 0.8,
  }),
];
