/**
 * Material catalog: the vocabulary of the library, separate from the documents it describes.
 *
 * Five distinct concepts (docs/material-catalog.md):
 *   family      the engine that decides which properties exist (Glass, Solid, Jello)
 *   treatment   a visual treatment inside a family (Frosted, Refractive, Matte, Outlined…)
 *   preset      a concrete, validated combination of parameters (id + display name + variant)
 *   effect      a property the renderer really implements (backdrop blur, edge refraction…)
 *   diagnostic  a configuration made to measure or verify something, not a designer-facing material
 *
 * Identity and presentation are kept apart: `presetId` and `familyId` are the stable technical ids
 * persisted in documents (`jello`, `satin`, `solid-neutral`, `jelly`…); everything else here is
 * presentation and may change without touching a stored file. The display name of a preset is not
 * written here but in `./names.ts` (one source, also read by the presets themselves).
 *
 * This module is lab-only: it is not re-exported by `model/index` and the exportable runtime never
 * reaches it. It does not import the experimental Jelly model either; the Jello entries are plain data
 * and `tests/unit/catalog.test.ts` checks them against the experimental documents.
 */
import { PRESETS } from '../../core/presets';
import type { MaterialDocument } from '../document';
import { familyInfo, FAMILIES, type FamilyId, type FamilyInfo, type MaterialFeature } from '../families';
import { MATERIALS } from '../registry';
import { glassParams } from '../document';
import { solidParams } from '../solid';
import { isCatalogPresetId, presetName, type CatalogPresetId } from './names';

export { PRESET_DISPLAY_NAMES, presetDisplayName, presetName, type CatalogPresetId } from './names';

/** `diagnostic` entries exist for verification and compatibility; they are not designer-facing materials. */
export type CatalogEntryKind = 'material-preset' | 'diagnostic';
/**
 * Where the preset can be used today. `experimental` is NOT a production status: the family stays
 * `planned` in `FAMILIES` and its presets are reachable only from the lazy Jello lab.
 */
export type CatalogAvailability = 'available' | 'experimental';

/** Effects a renderer really implements, in the vocabulary of the inspector. A preset lists only the ones it USES. */
export type EffectId =
  | 'backdrop-blur'
  | 'edge-refraction'
  | 'tint'
  | 'highlight'
  | 'shadow'
  | 'elevation'
  | 'border'
  | 'state-styles'
  | 'press-feedback'
  | 'drag-motion'
  | 'elastic-deformation'
  | 'internal-bubbles';

export interface EffectInfo {
  id: EffectId;
  label: string;
  /** What it is, in the terms of the implementation; never more physical than the renderer. */
  definition: string;
  /** The family-level capabilities that must exist for a preset to use it (any of the families listed). */
  requires: { families: readonly FamilyId[]; feature?: MaterialFeature };
}

export const EFFECTS: readonly EffectInfo[] = [
  { id: 'backdrop-blur', label: 'Backdrop blur', definition: 'Sfocatura del contenuto retrostante.', requires: { families: ['glass'], feature: 'backdrop' } },
  { id: 'edge-refraction', label: 'Edge refraction', definition: 'Deviazione simulata del campionamento sul perimetro (filtro SVG); con il backend CSS non è disponibile.', requires: { families: ['glass'], feature: 'refraction' } },
  { id: 'tint', label: 'Tint', definition: 'Colorazione applicata alla superficie.', requires: { families: ['glass', 'jelly'] } },
  { id: 'highlight', label: 'Highlight', definition: 'Riflesso o zona di luce stilizzati, non un calcolo fisico della luce.', requires: { families: ['glass', 'jelly'] } },
  { id: 'shadow', label: 'Shadow', definition: 'Ombra generata dal renderer.', requires: { families: ['glass', 'solid', 'jelly'], feature: 'shadow' } },
  { id: 'elevation', label: 'Elevation', definition: 'Livello visuale di elevazione che decide scostamento e sfocatura dell’ombra; nessun effetto sul layout.', requires: { families: ['solid', 'jelly'], feature: 'elevation' } },
  { id: 'border', label: 'Border', definition: 'Bordo della superficie.', requires: { families: ['solid'], feature: 'border' } },
  { id: 'state-styles', label: 'State styles', definition: 'Aspetto per stato (hover, pressed, active, disabled).', requires: { families: ['solid', 'jelly'], feature: 'states' } },
  { id: 'press-feedback', label: 'Press feedback', definition: 'Risposta visiva alla pressione.', requires: { families: ['glass', 'solid', 'jelly'], feature: 'press' } },
  { id: 'drag-motion', label: 'Drag motion', definition: 'Movimento a molla durante il trascinamento.', requires: { families: ['glass'], feature: 'drag' } },
  { id: 'elastic-deformation', label: 'Elastic deformation', definition: 'Deformazione controllata della geometria, con risposta smorzata (oscillatore a un grado di libertà, non una simulazione di fluido).', requires: { families: ['jelly'], feature: 'deformation' } },
  { id: 'internal-bubbles', label: 'Internal bubbles', definition: 'Inclusioni interne decorative, statiche, disegnate solo con il backend SVG.', requires: { families: ['jelly'], feature: 'bubbles' } },
];
const EFFECT_INDEX = new Map(EFFECTS.map((e) => [e.id, e]));
export const effectInfo = (id: string): EffectInfo | undefined => EFFECT_INDEX.get(id as EffectId);

export interface TreatmentInfo {
  label: string;
  /** What the word means in this family. Terms like Matte or Outlined need a definition, not just a name. */
  definition: string;
}

/** Treatments per family. A preset names exactly one; a word is never used for two things. */
export const TREATMENTS = {
  glass: {
    default: { label: 'Default', definition: 'Valori iniziali di Glass: rifrazione perimetrale simulata, centro neutro, blur leggero e riflessi.' },
    frosted: { label: 'Frosted', definition: 'Backdrop blur con saturazione e tinta, senza rifrazione. Non simula la microstruttura di un vetro smerigliato.' },
    refractive: { label: 'Refractive', definition: 'Rifrazione di bordo enfatizzata (fascia ampia, deviazione forte) con blur contenuto.' },
    subtle: { label: 'Subtle', definition: 'Rifrazione di bordo moderata su fascia stretta, centro neutro e leggibile: per superfici ampie e poco profonde.' },
    'isolated-refraction': { label: 'Isolated refraction', definition: 'Solo la deviazione geometrica del bordo; blur, tinta, luce e ombra a zero. Per verifiche, non per il design.' },
  },
  solid: {
    matte: { label: 'Matte', definition: 'Finitura piatta (tinta unita): nessun riflesso o sfumatura simulati.' },
    soft: { label: 'Soft', definition: 'Finitura con sfumatura verticale appena percettibile (finish «soft»).' },
    outlined: { label: 'Outlined', definition: 'Il bordo domina sul riempimento; ombra assente a riposo.' },
  },
  jelly: {
    gel: { label: 'Gel', definition: 'Corpo traslucido con inclusioni interne e deformazione elastica; le varianti differiscono per i parametri, non per il modello.' },
  },
} as const satisfies Record<FamilyId, Record<string, TreatmentInfo>>;

export type TreatmentId<F extends FamilyId = FamilyId> = keyof (typeof TREATMENTS)[F] & string;

export function treatmentInfo(familyId: string, treatment: string): TreatmentInfo | undefined {
  if (!Object.hasOwn(TREATMENTS, familyId)) return undefined;
  const table = TREATMENTS[familyId as FamilyId] as Record<string, TreatmentInfo>;
  return Object.hasOwn(table, treatment) ? table[treatment] : undefined;
}

export interface MaterialCatalogEntry {
  /** Stable technical id, equal to `material.preset` / the document id. Never derived from the display name. */
  presetId: CatalogPresetId;
  /** Stable technical family id (`jelly` for the gelatin family, whose display name is «Jello»). */
  familyId: FamilyId;
  displayName: string;
  /** Key of a treatment of `familyId` (see TREATMENTS). */
  treatment: string;
  /** Colour or size variant inside the treatment («Dark», «Accent Blue», «Soft»…). */
  variant?: string;
  description: string;
  kind: CatalogEntryKind;
  availability: CatalogAvailability;
  /** Effects this preset USES (not what the family could do). Validated against the preset's own parameters. */
  capabilities: readonly EffectId[];
  intendedUse: readonly string[];
  limitations?: readonly string[];
}

const CSS_NO_REFRACTION = 'Con il backend CSS la rifrazione non è disponibile (resa ridotta a blur e tinta).';
const SIMULATED = 'Effetti simulati con filtri SVG/CSS: non è una simulazione fisica del vetro.';

type EntryInput = Omit<MaterialCatalogEntry, 'displayName' | 'kind' | 'availability'> & Partial<Pick<MaterialCatalogEntry, 'kind' | 'availability'>>;
const entry = (e: EntryInput): MaterialCatalogEntry => ({ kind: 'material-preset', availability: e.familyId === 'jelly' ? 'experimental' : 'available', ...e, displayName: presetName(e.presetId) });

export const CATALOG: readonly MaterialCatalogEntry[] = [
  entry({
    presetId: 'jello', familyId: 'glass', treatment: 'default',
    description: 'Configurazione iniziale della famiglia Glass: rifrazione perimetrale simulata, centro relativamente neutro, sfocatura leggera e riflessi.',
    capabilities: ['backdrop-blur', 'edge-refraction', 'tint', 'highlight', 'shadow', 'press-feedback', 'drag-motion'],
    intendedUse: ['general', 'button', 'panel'], limitations: [SIMULATED, CSS_NO_REFRACTION],
  }),
  entry({
    presetId: 'satin', familyId: 'glass', treatment: 'frosted',
    description: 'Superficie traslucida con backdrop blur, saturazione e tinta: diffusione visiva dello sfondo senza rifrazione. Non simula la microstruttura fisica di un vetro smerigliato.',
    capabilities: ['backdrop-blur', 'tint', 'highlight', 'shadow', 'press-feedback', 'drag-motion'],
    intendedUse: ['general', 'panel', 'overlay'], limitations: [SIMULATED],
  }),
  entry({
    presetId: 'deep', familyId: 'glass', treatment: 'refractive',
    description: 'Enfatizza la deviazione visiva sul perimetro: fascia ampia, rifrazione intensa e blur contenuto. Rende evidente il profilo della lente.',
    capabilities: ['backdrop-blur', 'edge-refraction', 'tint', 'highlight', 'shadow', 'press-feedback', 'drag-motion'],
    intendedUse: ['showcase', 'button'], limitations: [SIMULATED, CSS_NO_REFRACTION],
  }),
  entry({
    presetId: 'navbar', familyId: 'glass', treatment: 'subtle',
    description: 'Trattamento Glass a rifrazione moderata, adatto a superfici ampie e poco profonde: centro neutro e leggibile, blur medio.',
    capabilities: ['backdrop-blur', 'edge-refraction', 'tint', 'highlight', 'shadow', 'press-feedback', 'drag-motion'],
    intendedUse: ['navigation', 'toolbar', 'overlay'], limitations: [SIMULATED, CSS_NO_REFRACTION],
  }),
  entry({
    presetId: 'optics', familyId: 'glass', treatment: 'isolated-refraction', kind: 'diagnostic',
    description: 'Configurazione di verifica che isola la rifrazione: blur, tinta, luce e ombra a zero. Resta disponibile per le verifiche raster e per la compatibilità.',
    capabilities: ['edge-refraction', 'press-feedback', 'drag-motion'],
    intendedUse: ['verification', 'raster-tests'], limitations: ['Non è un materiale da usare nei componenti.', CSS_NO_REFRACTION],
  }),
  entry({
    presetId: 'solid-neutral', familyId: 'solid', treatment: 'matte', variant: 'Neutral',
    description: 'Superficie piena e neutra con finitura piatta (nessun riflesso simulato), bordo sottile e ombreggiatura contenuta.',
    capabilities: ['border', 'shadow', 'elevation', 'state-styles', 'press-feedback'],
    intendedUse: ['general', 'button', 'panel'],
  }),
  entry({
    presetId: 'solid-dark', familyId: 'solid', treatment: 'matte', variant: 'Dark',
    description: 'Variante cromatica scura con contenuto ad alto contrasto. Dark è un colore, non un materiale fisico diverso.',
    capabilities: ['border', 'shadow', 'elevation', 'state-styles', 'press-feedback'],
    intendedUse: ['general', 'button', 'navigation'],
  }),
  entry({
    presetId: 'solid-accent', familyId: 'solid', treatment: 'soft', variant: 'Accent Blue',
    description: 'Superficie piena blu con contenuto chiaro (contrasto ≥ 4,5:1), finitura soft e stati interattivi dedicati.',
    capabilities: ['border', 'shadow', 'elevation', 'state-styles', 'press-feedback'],
    intendedUse: ['button', 'call-to-action'],
  }),
  entry({
    presetId: 'solid-outline', familyId: 'solid', treatment: 'outlined', variant: 'Neutral',
    description: 'Superficie con bordo evidenziato, nessuna ombra a riposo e stati visuali dedicati.',
    capabilities: ['border', 'state-styles', 'press-feedback'],
    intendedUse: ['button', 'secondary-action'],
  }),
  entry({
    presetId: 'jelly-soft', familyId: 'jelly', treatment: 'gel', variant: 'Soft',
    description: 'Gelatina morbida: traslucenza moderata, inclusioni interne e risposta elastica delicata.',
    capabilities: ['tint', 'highlight', 'shadow', 'elevation', 'state-styles', 'press-feedback', 'elastic-deformation', 'internal-bubbles'],
    intendedUse: ['experiment', 'button'],
  }),
  entry({
    presetId: 'jelly-clear', familyId: 'jelly', treatment: 'gel', variant: 'Clear',
    description: 'Corpo più trasmissivo, con minore diffusione interna e riflessi contenuti.',
    capabilities: ['tint', 'highlight', 'shadow', 'elevation', 'state-styles', 'press-feedback', 'elastic-deformation', 'internal-bubbles'],
    intendedUse: ['experiment', 'button'],
  }),
  entry({
    presetId: 'jelly-candy', familyId: 'jelly', treatment: 'gel', variant: 'Candy',
    description: 'Colorazione più satura, assorbimento e spessore apparente maggiori, inclusioni visibili e risposta più oscillatoria.',
    capabilities: ['tint', 'highlight', 'shadow', 'elevation', 'state-styles', 'press-feedback', 'elastic-deformation', 'internal-bubbles'],
    intendedUse: ['experiment', 'button'],
  }),
  entry({
    presetId: 'jelly-dense', familyId: 'jelly', treatment: 'gel', variant: 'Dense',
    description: 'Minore trasmissione, maggiore diffusione visiva e movimento più smorzato.',
    capabilities: ['tint', 'highlight', 'shadow', 'elevation', 'state-styles', 'press-feedback', 'elastic-deformation', 'internal-bubbles'],
    intendedUse: ['experiment', 'button'],
  }),
].map((e) =>
  e.familyId === 'jelly'
    ? {
        ...e,
        limitations: [
          'Candidato sperimentale non approvato visivamente: Jello è «planned» nel catalogo produttivo.',
          'Nessuna rifrazione né backdrop; nessuna simulazione volumetrica o fluida. Inclusioni solo con il backend SVG.',
          'Non esportabile nel formato stabile: ha un pacchetto web sperimentale separato.',
        ],
      }
    : e,
);

const BY_ID = new Map<string, MaterialCatalogEntry>(CATALOG.map((e) => [e.presetId, e]));

/** Catalog entry of a preset id; undefined for anything else (a personal material, a stale reference). */
export function catalogEntry(presetId: string | null | undefined): MaterialCatalogEntry | undefined {
  return presetId ? BY_ID.get(presetId) : undefined;
}

export const catalogByFamily = (familyId: FamilyId): MaterialCatalogEntry[] => CATALOG.filter((e) => e.familyId === familyId);
export const catalogByKind = (kind: CatalogEntryKind): MaterialCatalogEntry[] => CATALOG.filter((e) => e.kind === kind);

/**
 * Explicit family label. No «anything that is not Glass is Solid»: an unknown family is reported as such,
 * never dressed up as a known one.
 */
export function familyLabel(familyId: string): string {
  return familyInfo(familyId)?.label ?? 'Famiglia sconosciuta';
}

/** Short «Glass · Frosted» line of an entry, for cards and badges (family and treatment, never the preset name twice). */
export function entryMeta(e: MaterialCatalogEntry): string {
  return [familyLabel(e.familyId), treatmentInfo(e.familyId, e.treatment)?.label ?? e.treatment, ...(e.variant ? [e.variant] : [])].join(' · ');
}

export function availabilityLabel(a: CatalogAvailability): string {
  return a === 'experimental' ? 'Sperimentale' : 'Disponibile';
}

// ---------------------------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------------------------

/**
 * The effects a Glass or Solid document actually uses, read from its parameters. The catalog declares
 * the same list by hand; `validateCatalog` compares the two so a label can never promise more (or less)
 * than the document does.
 */
export function usedEffects(doc: MaterialDocument): EffectId[] {
  const out: EffectId[] = [];
  if (doc.family === 'glass') {
    const p = glassParams(doc);
    if (p.blur > 0 || p.saturation !== 100) out.push('backdrop-blur');
    if (p.refraction !== 0 && p.band > 0) out.push('edge-refraction');
    if (p.tintOpacity > 0) out.push('tint');
    if (p.light > 0) out.push('highlight');
    if (p.shadow > 0) out.push('shadow');
    out.push('press-feedback', 'drag-motion');
  } else if (doc.family === 'solid') {
    const p = solidParams(doc);
    if (p.borderWidth > 0) out.push('border');
    if (p.elevation > 0 && p.shadowOpacity > 0) out.push('shadow', 'elevation');
    if (Object.values(doc.states).some((s) => Object.keys(s).length > 0)) out.push('state-styles');
    out.push('press-feedback');
  }
  return out;
}

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

/**
 * Everything wrong with the catalog, as readable sentences (empty when consistent). Checks identity
 * (unique ids, a registered family and preset per entry), presentation (a display name, a defined
 * treatment, no duplicated label) and honesty (every capability exists in the family and is used by the
 * preset's own parameters). Jello entries are checked in `tests/unit/catalog.test.ts`, against the experimental
 * documents, because this module must not import them.
 */
export function validateCatalog(entries: readonly MaterialCatalogEntry[] = CATALOG): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const e of entries) {
    const at = `${e.presetId}`;
    if (ids.has(e.presetId)) problems.push(`${at}: id duplicato`);
    ids.add(e.presetId);
    if (!isCatalogPresetId(e.presetId)) problems.push(`${at}: manca il nome in names.ts`);
    if (!e.displayName.trim()) problems.push(`${at}: nome vuoto`);
    else if (e.displayName !== presetName(e.presetId)) problems.push(`${at}: il nome non coincide con names.ts`);
    if (names.has(e.displayName)) problems.push(`${at}: nome «${e.displayName}» duplicato`);
    names.add(e.displayName);
    const family: FamilyInfo | undefined = FAMILIES.find((f) => f.id === e.familyId);
    if (!family) { problems.push(`${at}: famiglia ${e.familyId} sconosciuta`); continue; }
    if (!treatmentInfo(e.familyId, e.treatment)) problems.push(`${at}: trattamento «${e.treatment}» non definito per ${e.familyId}`);
    if (!e.description.trim()) problems.push(`${at}: descrizione vuota`);
    if (!e.intendedUse.length) problems.push(`${at}: destinazione d’uso mancante`);
    if (e.availability === 'available' && family.status !== 'available') problems.push(`${at}: «available» in una famiglia ${family.status}`);
    if (e.availability === 'experimental' && family.status === 'available') problems.push(`${at}: «experimental» in una famiglia già disponibile`);
    if (new Set(e.capabilities).size !== e.capabilities.length) problems.push(`${at}: capacità duplicate`);
    const def = MATERIALS.get(e.familyId);
    for (const c of e.capabilities) {
      const info = effectInfo(c);
      if (!info) { problems.push(`${at}: effetto «${c}» sconosciuto`); continue; }
      if (!info.requires.families.includes(e.familyId)) problems.push(`${at}: «${c}» non esiste nella famiglia ${e.familyId}`);
      else if (def && info.requires.feature && !def.features.includes(info.requires.feature)) problems.push(`${at}: «${c}» richiede la capacità «${info.requires.feature}», che ${e.familyId} non dichiara`);
    }
    if (def) {
      const doc = def.presets.find((p) => p.doc.id === e.presetId)?.doc;
      if (!doc) problems.push(`${at}: nessun preset ${e.familyId} con questo id`);
      else {
        if (doc.name !== e.displayName) problems.push(`${at}: il documento si chiama «${doc.name}», il catalogo «${e.displayName}»`);
        const used = usedEffects(doc);
        if (!sameSet(used, e.capabilities)) problems.push(`${at}: capacità dichiarate [${[...e.capabilities].sort().join(', ')}] ≠ effetti usati dai parametri [${[...used].sort().join(', ')}]`);
      }
    }
  }
  // Every registered built-in preset is in the catalog: a preset cannot appear in the library unnamed.
  for (const d of MATERIALS.list()) for (const p of d.presets) if (!ids.has(p.doc.id)) problems.push(`${p.doc.id}: preset ${d.id} senza voce di catalogo`);
  for (const p of PRESETS) if (!ids.has(p.id)) problems.push(`${p.id}: preset Glass senza voce di catalogo`);
  return problems;
}
