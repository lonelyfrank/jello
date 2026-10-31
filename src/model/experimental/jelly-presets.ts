/** Candidate values, not visually approved presets. Never registered in the production library. */
import { createExperimentalJellyDocument, type JellyExperimentalDocument, type JellyParams } from './jelly';

export interface JellyCandidatePreset {
  doc: JellyExperimentalDocument;
  description: string;
  visuallyVerified: false;
}
const candidate = (id: string, name: string, description: string, params: Partial<JellyParams>): JellyCandidatePreset => ({
  doc: createExperimentalJellyDocument({ id, name, params, meta: { notes: `Candidato M6.1, non verificato visivamente. ${description}` } }),
  description,
  visuallyVerified: false,
});

export const JELLY_CANDIDATE_PRESETS: readonly JellyCandidatePreset[] = [
  candidate('jelly-soft', 'Jelly Soft', 'Lilla, traslucenza moderata, poche inclusioni e ritorno morbido.', { seed: 10631 }),
  candidate('jelly-clear', 'Jelly Clear', 'Tinta tenue, maggiore trasmissione e riflessi controllati.', {
    tint: '#d2e9ee', foreground: '#172b35', bodyOpacity: 0.65, transmission: 0.85,
    absorption: 0.35, scattering: 0.08, highlightStrength: 0.25, roughness: 0.3, seed: 20631, density: 1,
  }),
  candidate('jelly-candy', 'Jelly Candy', 'Colore saturo, bordi più densi e risposta più elastica.', {
    tint: '#d64b93', foreground: '#301329', transmission: 0.4, absorption: 2.2,
    thickness: 0.55, edgeFalloff: 2, dampingRatio: 0.4, maxDeformation: 0.09, seed: 30631,
  }),
  candidate('jelly-dense', 'Jelly Dense', 'Diffusione interna maggiore, risposta più breve e smorzata.', {
    tint: '#a6c9b2', foreground: '#172e25', bodyOpacity: 0.95, transmission: 0.25,
    absorption: 1.8, scattering: 0.7, responseMs: 220, dampingRatio: 1.05,
    maxDeformation: 0.035, releaseImpulse: 0.05, seed: 40631, density: 1.5,
  }),
];
