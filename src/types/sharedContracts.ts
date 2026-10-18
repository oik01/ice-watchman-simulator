/**
 * Frozen Shared Architecture Contract for the
 * ICE Zero-Fluoroscopy Ablation & LAA Watchman Implantation Simulator
 *
 * Coordinate Frame: Three.js Right-Handed Y-Up (millimeters, mm)
 * Origin (0, 0, 0) mm = Mid-Right Atrium Neutral ICE Transducer Reference Point
 *   +X = Patient Left      (-X = Patient Right)
 *   +Y = Superior/Cranial  (-Y = Inferior/Caudal along IVC -> SVC axis)
 *   +Z = Anterior/Sternum  (-Z = Posterior/Spine & Esophagus)
 */

export type CatheterModelId = 'soundstar_10f' | 'soundstar_8f' | 'nuvision_10f';
export type ClinicalTrackId = 'zero_fluoro_ablation' | 'watchman_laac';
export type LearningModeId = 'atlas_demo' | 'free_sandbox' | 'practice_challenge';
export type ChamberStationId = 'ra_venous' | 'rv_outflow' | 'la_transseptal';
export type LAAMorphologyId = 'chicken_wing' | 'windsock' | 'cactus' | 'cauliflower';
export type WatchmanStageId = 'none' | 'sheath_across' | 'flx_ball' | 'triangle' | 'full_deployed' | 'released';
export type LabelOverlayMode = 'off' | 'hover' | 'all';

/**
 * Exact rigid transformation from BodyParts3D (mm, Z-up) to Three.js World (mm, Y-up).
 * Preserves right-handedness (det(R) = +1) and outward surface normals.
 */
export function bodyPartsToWorld(xBp: number, yBp: number, zBp: number): [number, number, number] {
  return [
    xBp + 14.0,        // +X = Patient Left
    zBp - 1222.0,      // +Y = Superior
    -(yBp + 120.0),    // +Z = Anterior
  ];
}

/**
 * Inverse transformation from Three.js World (mm, Y-up) back to BodyParts3D (mm, Z-up).
 */
export function worldToBodyParts(xW: number, yW: number, zW: number): [number, number, number] {
  return [
    xW - 14.0,
    -zW - 120.0,
    yW + 1222.0,
  ];
}

/**
 * Enumerated anatomical & device Structure IDs (1..42).
 * Shared across the 3D Heart Anatomy Engine, Acoustic Volume / SDF Slicer,
 * Canonical 28-View Curriculum, and Headless Verification Suite.
 */
export enum StructureId {
  RA_CAVITY = 1,
  RAA_PECTINATES = 2,
  CRISTA_TERMINALIS = 3,
  SVC = 4,
  IVC = 5,
  EUSTACHIAN_RIDGE = 6,
  CTI_FLOOR = 7,
  CORONARY_SINUS_OSTIUM = 8,
  THEBESIAN_VALVE = 9,
  TRIANGLE_OF_KOCH_HIS = 10,
  FOSSA_OVALIS = 11,
  IAS_LIMBUS = 12,
  TRICUSPID_VALVE_ANT = 13,
  TRICUSPID_VALVE_SEPT = 14,
  TRICUSPID_VALVE_POST = 15,
  RV_CAVITY = 16,
  MODERATOR_BAND = 17,
  RV_PAPILLARY_MUSCLES = 18,
  RVOT_INFUNDIBULUM = 19,
  PULMONIC_VALVE = 20,
  MAIN_PA_LPA_RPA = 21,
  AORTIC_VALVE_NCC = 22,
  AORTIC_VALVE_RCC = 23,
  AORTIC_VALVE_LCC = 24,
  ASCENDING_AORTA_ROOT = 25,
  CORONARY_ARTERIES_LMCA_RCA_LCX = 26,
  LA_CAVITY = 27,
  LAA_OSTIUM_AND_LOBES = 28,
  COUMADIN_RIDGE = 29,
  LSPV = 30,
  LIPV = 31,
  RSPV = 32,
  RIPV = 33,
  MITRAL_VALVE_AML_PML = 34,
  LV_CAVITY_AND_IVS = 35,
  LV_PAPILLARY_AL_PM = 36,
  DESCENDING_AORTA = 37,
  RETROCARDIAC_ESOPHAGUS = 38,
  PERICARDIAL_SPACE = 39,
  WATCHMAN_FLX_DEVICE = 40,
  TRANSSEPTAL_NEEDLE_SHEATH = 41,
  ABLATION_CATHETER_TIP = 42,
}

export type StructureLayerCategory =
  | 'right_heart_chamber'
  | 'left_heart_chamber'
  | 'cardiac_valve'
  | 'interatrial_septum'
  | 'intracardiac_landmark'
  | 'conduction_system'
  | 'coronary_or_esophagus'
  | 'pericardium'
  | 'procedural_device';

export interface AnatomicalStructureMeta {
  id: StructureId;
  code: string;
  name: string;
  shortLabel: string;
  category: StructureLayerCategory;
  worldCentroidMm: [number, number, number];
  boundingRadiusMm: number;
  /** Surgical CARTO-style base hex color (#RRGGBB) per SPEC PATCH #9 */
  surgicalBaseHex: string;
  /** Grazing Fresnel rim hex color (#RRGGBB) per SPEC PATCH #9 */
  fresnelRimHex: string;
  /** Acoustic impedance Z in MRayl (Blood ~ 1.62, Myocardium ~ 1.68, Valve ~ 1.75, Fibrous/Limbus ~ 1.85, Metal ~ 6.50) */
  impedanceMRayl: number;
  /** Intrinsic acoustic backscatter [0..1] */
  backscatter: number;
  /** Acoustic attenuation in dB/(cm*MHz) */
  attenuationDbCmMhz: number;
  /** Three.js renderOrder per Frozen Contract */
  renderOrder: number;
  clinicalSignificance: string;
}

export const ANATOMICAL_STRUCTURES: Record<number, AnatomicalStructureMeta> = {
  [StructureId.RA_CAVITY]: {
    id: StructureId.RA_CAVITY,
    code: 'RA_CAVITY',
    name: 'Right Atrium (RA) Cavity & Wall',
    shortLabel: 'RA',
    category: 'right_heart_chamber',
    worldCentroidMm: [-0.8, 10.7, 0.1],
    boundingRadiusMm: 28.0,
    surgicalBaseHex: '#3B6E8C',
    fresnelRimHex: '#6497B1',
    impedanceMRayl: 1.68,
    backscatter: 0.46,
    attenuationDbCmMhz: 0.50,
    renderOrder: 10,
    clinicalSignificance: 'Primary ICE catheter navigation chamber (Home View origin at [0,0,0]).',
  },
  [StructureId.RAA_PECTINATES]: {
    id: StructureId.RAA_PECTINATES,
    code: 'RAA_PECTINATES',
    name: 'Right Atrial Appendage (RAA) & Pectinate Muscles',
    shortLabel: 'RAA',
    category: 'intracardiac_landmark',
    worldCentroidMm: [1.8, 20.2, 25.2],
    boundingRadiusMm: 18.0,
    surgicalBaseHex: '#3B6E8C',
    fresnelRimHex: '#6497B1',
    impedanceMRayl: 1.70,
    backscatter: 0.62,
    attenuationDbCmMhz: 0.55,
    renderOrder: 10,
    clinicalSignificance: 'Trabeculated anterior-superior pouch; comb-like pectinate ridges visible on CCW rotation.',
  },
  [StructureId.CRISTA_TERMINALIS]: {
    id: StructureId.CRISTA_TERMINALIS,
    code: 'CRISTA_TERMINALIS',
    name: 'Crista Terminalis',
    shortLabel: 'Crista Term.',
    category: 'intracardiac_landmark',
    worldCentroidMm: [-2.9, 21.6, 13.8],
    boundingRadiusMm: 22.0,
    surgicalBaseHex: '#C26D5E',
    fresnelRimHex: '#D48472',
    impedanceMRayl: 1.76,
    backscatter: 0.74,
    attenuationDbCmMhz: 0.62,
    renderOrder: 2,
    clinicalSignificance: 'Prominent fibromuscular ridge separating smooth sinus venarum from trabeculated RAA; focal AT target.',
  },
  [StructureId.SVC]: {
    id: StructureId.SVC,
    code: 'SVC',
    name: 'Superior Vena Cava (SVC)',
    shortLabel: 'SVC',
    category: 'right_heart_chamber',
    worldCentroidMm: [-0.8, 69.3, -4.6],
    boundingRadiusMm: 24.0,
    surgicalBaseHex: '#3B6E8C',
    fresnelRimHex: '#6497B1',
    impedanceMRayl: 1.69,
    backscatter: 0.50,
    attenuationDbCmMhz: 0.50,
    renderOrder: 10,
    clinicalSignificance: 'Superior venous conduit entering RA roof; adjacent to RSPV posteriorly and SA node anterolaterally.',
  },
  [StructureId.IVC]: {
    id: StructureId.IVC,
    code: 'IVC',
    name: 'Inferior Vena Cava (IVC)',
    shortLabel: 'IVC',
    category: 'right_heart_chamber',
    worldCentroidMm: [-0.6, -65.0, -5.4],
    boundingRadiusMm: 28.0,
    surgicalBaseHex: '#3B6E8C',
    fresnelRimHex: '#6497B1',
    impedanceMRayl: 1.69,
    backscatter: 0.50,
    attenuationDbCmMhz: 0.50,
    renderOrder: 10,
    clinicalSignificance: 'Femoral venous entry conduit into the inferior RA; guarded anteriorly by the Eustachian ridge.',
  },
  [StructureId.EUSTACHIAN_RIDGE]: {
    id: StructureId.EUSTACHIAN_RIDGE,
    code: 'EUSTACHIAN_RIDGE',
    name: 'Eustachian Valve / Ridge (IVC Valve)',
    shortLabel: 'Eustachian R.',
    category: 'intracardiac_landmark',
    worldCentroidMm: [4.8, -18.8, -0.1],
    boundingRadiusMm: 14.0,
    surgicalBaseHex: '#C26D5E',
    fresnelRimHex: '#D48472',
    impedanceMRayl: 1.78,
    backscatter: 0.78,
    attenuationDbCmMhz: 0.65,
    renderOrder: 2,
    clinicalSignificance: 'Prominent crescentic fold at IVC-RA junction; posterior boundary of CTI; must not be confused with Fossa Ovalis.',
  },
  [StructureId.CTI_FLOOR]: {
    id: StructureId.CTI_FLOOR,
    code: 'CTI_FLOOR',
    name: 'Cavotricuspid Isthmus (CTI) Floor',
    shortLabel: 'CTI',
    category: 'intracardiac_landmark',
    worldCentroidMm: [8.0, -24.0, 10.0],
    boundingRadiusMm: 15.0,
    surgicalBaseHex: '#C26D5E',
    fresnelRimHex: '#D48472',
    impedanceMRayl: 1.72,
    backscatter: 0.65,
    attenuationDbCmMhz: 0.58,
    renderOrder: 2,
    clinicalSignificance: 'Inferior RA corridor between IVC/Eustachian ridge and Tricuspid annulus; ablation target for typical atrial flutter.',
  },
  [StructureId.CORONARY_SINUS_OSTIUM]: {
    id: StructureId.CORONARY_SINUS_OSTIUM,
    code: 'CORONARY_SINUS_OSTIUM',
    name: 'Coronary Sinus (CS) Ostium & Body',
    shortLabel: 'CS Ostium',
    category: 'right_heart_chamber',
    worldCentroidMm: [17.7, -12.7, -7.4],
    boundingRadiusMm: 14.0,
    surgicalBaseHex: '#3B6E8C',
    fresnelRimHex: '#6497B1',
    impedanceMRayl: 1.70,
    backscatter: 0.58,
    attenuationDbCmMhz: 0.52,
    renderOrder: 3,
    clinicalSignificance: 'Venous ostium in posteroinferior RA marking the base of the Triangle of Koch; reference catheter landmark.',
  },
  [StructureId.THEBESIAN_VALVE]: {
    id: StructureId.THEBESIAN_VALVE,
    code: 'THEBESIAN_VALVE',
    name: 'Thebesian Valve (Valve of Coronary Sinus)',
    shortLabel: 'Thebesian V.',
    category: 'intracardiac_landmark',
    worldCentroidMm: [16.5, -13.2, -5.8],
    boundingRadiusMm: 8.5,
    surgicalBaseHex: '#DCE2EA',
    fresnelRimHex: '#F8FAFC',
    impedanceMRayl: 1.76,
    backscatter: 0.75,
    attenuationDbCmMhz: 0.60,
    renderOrder: 2,
    clinicalSignificance: 'Semilunar endocardial fold guarding the posteroinferior rim of the Coronary Sinus ostium.',
  },
  [StructureId.TRIANGLE_OF_KOCH_HIS]: {
    id: StructureId.TRIANGLE_OF_KOCH_HIS,
    code: 'TRIANGLE_OF_KOCH_HIS',
    name: 'Triangle of Koch, AV Node & Bundle of His',
    shortLabel: 'Koch / His',
    category: 'conduction_system',
    worldCentroidMm: [21.9, -3.1, -2.0],
    boundingRadiusMm: 12.0,
    surgicalBaseHex: '#F59E0B',
    fresnelRimHex: '#FBBF24',
    impedanceMRayl: 1.74,
    backscatter: 0.70,
    attenuationDbCmMhz: 0.58,
    renderOrder: 2,
    clinicalSignificance: 'Bounded by Tendon of Todaro, TV septal leaflet, and CS ostium; apex houses compact AV node and penetrating His bundle.',
  },
  [StructureId.FOSSA_OVALIS]: {
    id: StructureId.FOSSA_OVALIS,
    code: 'FOSSA_OVALIS',
    name: 'Fossa Ovalis (Bilaminar Septum Primum Valve)',
    shortLabel: 'Fossa Ovalis',
    category: 'interatrial_septum',
    worldCentroidMm: [9.5, 6.5, -9.5],
    boundingRadiusMm: 12.5,
    surgicalBaseHex: '#E8DFD1',
    fresnelRimHex: '#F8FAFC',
    impedanceMRayl: 1.79,
    backscatter: 0.80,
    attenuationDbCmMhz: 0.65,
    renderOrder: 2,
    clinicalSignificance: 'Thin (1.1 mm) translucent central membrane of the IAS; target for safe transseptal puncture and needle tenting.',
  },
  [StructureId.IAS_LIMBUS]: {
    id: StructureId.IAS_LIMBUS,
    code: 'IAS_LIMBUS',
    name: 'Muscular Limbus of Fossa Ovalis (Septum Secundum)',
    shortLabel: 'IAS Limbus',
    category: 'interatrial_septum',
    worldCentroidMm: [9.3, 14.5, -8.6],
    boundingRadiusMm: 18.0,
    surgicalBaseHex: '#B85D5D',
    fresnelRimHex: '#D48472',
    impedanceMRayl: 1.85,
    backscatter: 0.84,
    attenuationDbCmMhz: 0.82,
    renderOrder: 2,
    clinicalSignificance: 'Thick (4.5-7.5 mm) muscular/lipomatous horseshoe rim framing the thin Fossa Ovalis membrane.',
  },
  [StructureId.TRICUSPID_VALVE_ANT]: {
    id: StructureId.TRICUSPID_VALVE_ANT,
    code: 'TRICUSPID_VALVE_ANT',
    name: 'Tricuspid Valve Anterior Leaflet',
    shortLabel: 'TV Ant.',
    category: 'cardiac_valve',
    worldCentroidMm: [22.0, -8.5, 26.5],
    boundingRadiusMm: 16.0,
    surgicalBaseHex: '#DCE2EA',
    fresnelRimHex: '#FFFFFF',
    impedanceMRayl: 1.75,
    backscatter: 0.82,
    attenuationDbCmMhz: 0.68,
    renderOrder: 2,
    clinicalSignificance: 'Largest, most mobile Tricuspid leaflet visible anteriorly in ICE Home View.',
  },
  [StructureId.TRICUSPID_VALVE_SEPT]: {
    id: StructureId.TRICUSPID_VALVE_SEPT,
    code: 'TRICUSPID_VALVE_SEPT',
    name: 'Tricuspid Valve Septal Leaflet',
    shortLabel: 'TV Septal',
    category: 'cardiac_valve',
    worldCentroidMm: [25.5, -9.5, 17.5],
    boundingRadiusMm: 15.0,
    surgicalBaseHex: '#DCE2EA',
    fresnelRimHex: '#FFFFFF',
    impedanceMRayl: 1.75,
    backscatter: 0.82,
    attenuationDbCmMhz: 0.68,
    renderOrder: 2,
    clinicalSignificance: 'Attaches to the membranous/muscular IVS 7 mm apical to MV; forms anterior border of Triangle of Koch.',
  },
  [StructureId.TRICUSPID_VALVE_POST]: {
    id: StructureId.TRICUSPID_VALVE_POST,
    code: 'TRICUSPID_VALVE_POST',
    name: 'Tricuspid Valve Posterior Leaflet',
    shortLabel: 'TV Post.',
    category: 'cardiac_valve',
    worldCentroidMm: [24.0, -14.5, 22.0],
    boundingRadiusMm: 15.0,
    surgicalBaseHex: '#DCE2EA',
    fresnelRimHex: '#FFFFFF',
    impedanceMRayl: 1.75,
    backscatter: 0.82,
    attenuationDbCmMhz: 0.68,
    renderOrder: 2,
    clinicalSignificance: 'Inferior/posterior leaflet bordering the anterior margin of the Cavotricuspid Isthmus (CTI).',
  },
  [StructureId.RV_CAVITY]: {
    id: StructureId.RV_CAVITY,
    code: 'RV_CAVITY',
    name: 'Right Ventricle (RV) Inflow & Body',
    shortLabel: 'RV',
    category: 'right_heart_chamber',
    worldCentroidMm: [33.1, 3.8, 25.0],
    boundingRadiusMm: 34.0,
    surgicalBaseHex: '#3B6E8C',
    fresnelRimHex: '#6497B1',
    impedanceMRayl: 1.68,
    backscatter: 0.50,
    attenuationDbCmMhz: 0.52,
    renderOrder: 10,
    clinicalSignificance: 'Crescentic anterior ventricular chamber visualized across the Tricuspid Valve in Home View and RV views.',
  },
  [StructureId.MODERATOR_BAND]: {
    id: StructureId.MODERATOR_BAND,
    code: 'MODERATOR_BAND',
    name: 'Moderator Band (Septomarginal Trabecula)',
    shortLabel: 'Mod. Band',
    category: 'intracardiac_landmark',
    worldCentroidMm: [40.9, -17.5, 38.9],
    boundingRadiusMm: 15.0,
    surgicalBaseHex: '#C26D5E',
    fresnelRimHex: '#D48472',
    impedanceMRayl: 1.76,
    backscatter: 0.78,
    attenuationDbCmMhz: 0.64,
    renderOrder: 2,
    clinicalSignificance: 'Prominent muscular bridge crossing lower RV from IVS to anterior papillary muscle base; carries Right Bundle Branch.',
  },
  [StructureId.RV_PAPILLARY_MUSCLES]: {
    id: StructureId.RV_PAPILLARY_MUSCLES,
    code: 'RV_PAPILLARY_MUSCLES',
    name: 'Right Ventricular Papillary Muscles (Ant / Post / Septal)',
    shortLabel: 'RV Pap.',
    category: 'intracardiac_landmark',
    worldCentroidMm: [44.7, -3.6, 29.7],
    boundingRadiusMm: 18.0,
    surgicalBaseHex: '#C26D5E',
    fresnelRimHex: '#D48472',
    impedanceMRayl: 1.74,
    backscatter: 0.72,
    attenuationDbCmMhz: 0.60,
    renderOrder: 2,
    clinicalSignificance: 'Muscular pillars tethering Tricuspid chordae tendineae; key targets for RV papillary PVC ablation.',
  },
  [StructureId.RVOT_INFUNDIBULUM]: {
    id: StructureId.RVOT_INFUNDIBULUM,
    code: 'RVOT_INFUNDIBULUM',
    name: 'Right Ventricular Outflow Tract (RVOT) & Crista Supraventricularis',
    shortLabel: 'RVOT',
    category: 'right_heart_chamber',
    worldCentroidMm: [42.0, 24.0, 26.0],
    boundingRadiusMm: 22.0,
    surgicalBaseHex: '#3B6E8C',
    fresnelRimHex: '#6497B1',
    impedanceMRayl: 1.70,
    backscatter: 0.56,
    attenuationDbCmMhz: 0.54,
    renderOrder: 10,
    clinicalSignificance: 'Smooth-walled muscular infundibulum wrapping anterior-superior to the Aortic Root; major idiopathic PVC/VT site.',
  },
  [StructureId.PULMONIC_VALVE]: {
    id: StructureId.PULMONIC_VALVE,
    code: 'PULMONIC_VALVE',
    name: 'Pulmonic Valve Cusps (AC / LC / RC)',
    shortLabel: 'Pulmonic V.',
    category: 'cardiac_valve',
    worldCentroidMm: [43.9, 28.9, 25.6],
    boundingRadiusMm: 15.0,
    surgicalBaseHex: '#DCE2EA',
    fresnelRimHex: '#FFFFFF',
    impedanceMRayl: 1.76,
    backscatter: 0.84,
    attenuationDbCmMhz: 0.68,
    renderOrder: 2,
    clinicalSignificance: 'Trileaflet semilunar valve at RVOT-MPA junction; pulmonary sinus cusps are key PVC ablation targets.',
  },
  [StructureId.MAIN_PA_LPA_RPA]: {
    id: StructureId.MAIN_PA_LPA_RPA,
    code: 'MAIN_PA_LPA_RPA',
    name: 'Main Pulmonary Artery (MPA), LPA & RPA',
    shortLabel: 'PA / RPA / LPA',
    category: 'right_heart_chamber',
    worldCentroidMm: [42.0, 42.0, 18.0],
    boundingRadiusMm: 32.0,
    surgicalBaseHex: '#3B6E8C',
    fresnelRimHex: '#6497B1',
    impedanceMRayl: 1.70,
    backscatter: 0.54,
    attenuationDbCmMhz: 0.52,
    renderOrder: 10,
    clinicalSignificance: 'MPA bifurcates into LPA (superior to LAA) and RPA (coursing directly superior to LA roof and RSPV).',
  },
  [StructureId.AORTIC_VALVE_NCC]: {
    id: StructureId.AORTIC_VALVE_NCC,
    code: 'AORTIC_VALVE_NCC',
    name: 'Aortic Valve Non-Coronary Cusp (NCC)',
    shortLabel: 'AoV NCC',
    category: 'cardiac_valve',
    worldCentroidMm: [26.0, 18.0, -2.0],
    boundingRadiusMm: 11.0,
    surgicalBaseHex: '#DCE2EA',
    fresnelRimHex: '#FFFFFF',
    impedanceMRayl: 1.78,
    backscatter: 0.86,
    attenuationDbCmMhz: 0.72,
    renderOrder: 2,
    clinicalSignificance: 'Posterior-right aortic cusp directly abutting the anterior Interatrial Septum and His bundle; critical TSP danger landmark.',
  },
  [StructureId.AORTIC_VALVE_RCC]: {
    id: StructureId.AORTIC_VALVE_RCC,
    code: 'AORTIC_VALVE_RCC',
    name: 'Aortic Valve Right Coronary Cusp (RCC)',
    shortLabel: 'AoV RCC',
    category: 'cardiac_valve',
    worldCentroidMm: [34.0, 21.0, 11.0],
    boundingRadiusMm: 11.0,
    surgicalBaseHex: '#DCE2EA',
    fresnelRimHex: '#FFFFFF',
    impedanceMRayl: 1.78,
    backscatter: 0.86,
    attenuationDbCmMhz: 0.72,
    renderOrder: 2,
    clinicalSignificance: 'Anterior aortic cusp abutting the posterior RVOT infundibulum; gives rise to the Right Coronary Artery (RCA).',
  },
  [StructureId.AORTIC_VALVE_LCC]: {
    id: StructureId.AORTIC_VALVE_LCC,
    code: 'AORTIC_VALVE_LCC',
    name: 'Aortic Valve Left Coronary Cusp (LCC)',
    shortLabel: 'AoV LCC',
    category: 'cardiac_valve',
    worldCentroidMm: [39.0, 21.0, -1.0],
    boundingRadiusMm: 11.0,
    surgicalBaseHex: '#DCE2EA',
    fresnelRimHex: '#FFFFFF',
    impedanceMRayl: 1.78,
    backscatter: 0.86,
    attenuationDbCmMhz: 0.72,
    renderOrder: 2,
    clinicalSignificance: 'Posterior-left aortic cusp facing the LAA medial border and aortomitral continuity; gives rise to Left Main Coronary Artery.',
  },
  [StructureId.ASCENDING_AORTA_ROOT]: {
    id: StructureId.ASCENDING_AORTA_ROOT,
    code: 'ASCENDING_AORTA_ROOT',
    name: 'Aortic Root (Sinuses of Valsalva) & Ascending Aorta',
    shortLabel: 'Ao Root',
    category: 'left_heart_chamber',
    worldCentroidMm: [32.8, 28.0, 2.6],
    boundingRadiusMm: 24.0,
    surgicalBaseHex: '#9E4747',
    fresnelRimHex: '#C96A6A',
    impedanceMRayl: 1.76,
    backscatter: 0.70,
    attenuationDbCmMhz: 0.65,
    renderOrder: 10,
    clinicalSignificance: 'Central fibrous wedge of the heart base; key anterior safety reference during transseptal puncture.',
  },
  [StructureId.CORONARY_ARTERIES_LMCA_RCA_LCX]: {
    id: StructureId.CORONARY_ARTERIES_LMCA_RCA_LCX,
    code: 'CORONARY_ARTERIES_LMCA_RCA_LCX',
    name: 'Coronary Arteries (LMCA, LAD, LCx & RCA)',
    shortLabel: 'LMCA / LCx / RCA',
    category: 'coronary_or_esophagus',
    worldCentroidMm: [43.0, 16.0, -2.0],
    boundingRadiusMm: 22.0,
    surgicalBaseHex: '#DC2626',
    fresnelRimHex: '#F87171',
    impedanceMRayl: 1.74,
    backscatter: 0.68,
    attenuationDbCmMhz: 0.60,
    renderOrder: 3,
    clinicalSignificance: 'LCx runs in the left AV groove immediately inferior to the LAA ostium/landing zone; must not be compressed by Watchman FLX.',
  },
  [StructureId.LA_CAVITY]: {
    id: StructureId.LA_CAVITY,
    code: 'LA_CAVITY',
    name: 'Left Atrium (LA) Body, Roof & Posterior Wall',
    shortLabel: 'LA',
    category: 'left_heart_chamber',
    worldCentroidMm: [33.5, 21.8, -26.5],
    boundingRadiusMm: 30.0,
    surgicalBaseHex: '#9E4747',
    fresnelRimHex: '#C96A6A',
    impedanceMRayl: 1.68,
    backscatter: 0.48,
    attenuationDbCmMhz: 0.52,
    renderOrder: 10,
    clinicalSignificance: 'Posterior systemic atrial chamber receiving the 4 pulmonary veins; accessed via transseptal puncture.',
  },
  [StructureId.LAA_OSTIUM_AND_LOBES]: {
    id: StructureId.LAA_OSTIUM_AND_LOBES,
    code: 'LAA_OSTIUM_AND_LOBES',
    name: 'Left Atrial Appendage (LAA) Ostium, Landing Zone & Trabeculated Lobes',
    shortLabel: 'LAA',
    category: 'left_heart_chamber',
    worldCentroidMm: [52.0, 29.0, 1.0],
    boundingRadiusMm: 20.0,
    surgicalBaseHex: '#9E4747',
    fresnelRimHex: '#C96A6A',
    impedanceMRayl: 1.72,
    backscatter: 0.64,
    attenuationDbCmMhz: 0.56,
    renderOrder: 10,
    clinicalSignificance: 'Anterolateral trabeculated LA diverticulum; primary thrombus site in AF and target for Watchman FLX occlusion.',
  },
  [StructureId.COUMADIN_RIDGE]: {
    id: StructureId.COUMADIN_RIDGE,
    code: 'COUMADIN_RIDGE',
    name: 'Coumadin Ridge (Left Lateral Ridge / Ligament of Marshall)',
    shortLabel: 'Coumadin Ridge',
    category: 'intracardiac_landmark',
    worldCentroidMm: [48.0, 31.0, -15.0],
    boundingRadiusMm: 12.0,
    surgicalBaseHex: '#C26D5E',
    fresnelRimHex: '#D48472',
    impedanceMRayl: 1.78,
    backscatter: 0.80,
    attenuationDbCmMhz: 0.65,
    renderOrder: 2,
    clinicalSignificance: 'Bulbous Q-tip fold separating the LAA ostium anteriorly from the LSPV posteriorly; defines superior LAA landing zone.',
  },
  [StructureId.LSPV]: {
    id: StructureId.LSPV,
    code: 'LSPV',
    name: 'Left Superior Pulmonary Vein (LSPV)',
    shortLabel: 'LSPV',
    category: 'left_heart_chamber',
    worldCentroidMm: [59.9, 38.5, -29.0],
    boundingRadiusMm: 16.0,
    surgicalBaseHex: '#9E4747',
    fresnelRimHex: '#C96A6A',
    impedanceMRayl: 1.70,
    backscatter: 0.58,
    attenuationDbCmMhz: 0.54,
    renderOrder: 10,
    clinicalSignificance: 'Enters posterosuperior left lateral LA immediately posterior to the Coumadin Ridge; primary AF triggers/PVI target.',
  },
  [StructureId.LIPV]: {
    id: StructureId.LIPV,
    code: 'LIPV',
    name: 'Left Inferior Pulmonary Vein (LIPV)',
    shortLabel: 'LIPV',
    category: 'left_heart_chamber',
    worldCentroidMm: [65.5, 4.1, -40.3],
    boundingRadiusMm: 16.0,
    surgicalBaseHex: '#9E4747',
    fresnelRimHex: '#C96A6A',
    impedanceMRayl: 1.70,
    backscatter: 0.58,
    attenuationDbCmMhz: 0.54,
    renderOrder: 10,
    clinicalSignificance: 'Enters posteroinferior left lateral LA directly anterior to the Descending Thoracic Aorta and Esophagus.',
  },
  [StructureId.RSPV]: {
    id: StructureId.RSPV,
    code: 'RSPV',
    name: 'Right Superior Pulmonary Vein (RSPV)',
    shortLabel: 'RSPV',
    category: 'left_heart_chamber',
    worldCentroidMm: [-8.0, 26.0, -29.0],
    boundingRadiusMm: 16.0,
    surgicalBaseHex: '#9E4747',
    fresnelRimHex: '#C96A6A',
    impedanceMRayl: 1.70,
    backscatter: 0.58,
    attenuationDbCmMhz: 0.54,
    renderOrder: 10,
    clinicalSignificance: 'Passes immediately posterior to the SVC-RA junction (phrenic nerve proximity) and inferior to the Right Pulmonary Artery.',
  },
  [StructureId.RIPV]: {
    id: StructureId.RIPV,
    code: 'RIPV',
    name: 'Right Inferior Pulmonary Vein (RIPV)',
    shortLabel: 'RIPV',
    category: 'left_heart_chamber',
    worldCentroidMm: [-10.5, 4.0, -32.0],
    boundingRadiusMm: 16.0,
    surgicalBaseHex: '#9E4747',
    fresnelRimHex: '#C96A6A',
    impedanceMRayl: 1.70,
    backscatter: 0.58,
    attenuationDbCmMhz: 0.54,
    renderOrder: 10,
    clinicalSignificance: 'Enters right posteroinferior LA corner; forms the classic "Owl Eyes" double-ring sign with RSPV on posterior CW sweep.',
  },
  [StructureId.MITRAL_VALVE_AML_PML]: {
    id: StructureId.MITRAL_VALVE_AML_PML,
    code: 'MITRAL_VALVE_AML_PML',
    name: 'Mitral Valve Annulus & Leaflets (AML / PML)',
    shortLabel: 'Mitral V.',
    category: 'cardiac_valve',
    worldCentroidMm: [48.1, -6.1, -12.0],
    boundingRadiusMm: 18.0,
    surgicalBaseHex: '#DCE2EA',
    fresnelRimHex: '#FFFFFF',
    impedanceMRayl: 1.77,
    backscatter: 0.85,
    attenuationDbCmMhz: 0.70,
    renderOrder: 2,
    clinicalSignificance: 'Bileaflet left AV valve; AML is in fibrous continuity with AoV; must remain unobstructed by Watchman FLX inferior edge.',
  },
  [StructureId.LV_CAVITY_AND_IVS]: {
    id: StructureId.LV_CAVITY_AND_IVS,
    code: 'LV_CAVITY_AND_IVS',
    name: 'Left Ventricle (LV) Myocardium, Cavity & Interventricular Septum',
    shortLabel: 'LV / IVS',
    category: 'left_heart_chamber',
    worldCentroidMm: [49.5, -0.5, -0.8],
    boundingRadiusMm: 36.0,
    surgicalBaseHex: '#9E4747',
    fresnelRimHex: '#C96A6A',
    impedanceMRayl: 1.71,
    backscatter: 0.58,
    attenuationDbCmMhz: 0.58,
    renderOrder: 10,
    clinicalSignificance: 'Thick-walled (10-11 mm) systemic ventricular pump; monitored on ICE for contractility and pericardial effusion.',
  },
  [StructureId.LV_PAPILLARY_AL_PM]: {
    id: StructureId.LV_PAPILLARY_AL_PM,
    code: 'LV_PAPILLARY_AL_PM',
    name: 'LV Papillary Muscles (Anterolateral & Posteromedial)',
    shortLabel: 'LV Pap. (AL/PM)',
    category: 'intracardiac_landmark',
    worldCentroidMm: [65.0, -12.0, -8.0],
    boundingRadiusMm: 22.0,
    surgicalBaseHex: '#C26D5E',
    fresnelRimHex: '#D48472',
    impedanceMRayl: 1.75,
    backscatter: 0.76,
    attenuationDbCmMhz: 0.64,
    renderOrder: 2,
    clinicalSignificance: 'Conical muscular pillars anchoring Mitral chordae tendineae; key targets for ICE-guided LV papillary PVC/VT ablation.',
  },
  [StructureId.DESCENDING_AORTA]: {
    id: StructureId.DESCENDING_AORTA,
    code: 'DESCENDING_AORTA',
    name: 'Descending Thoracic Aorta',
    shortLabel: 'Desc. Aorta',
    category: 'left_heart_chamber',
    worldCentroidMm: [52.0, 5.0, -56.0],
    boundingRadiusMm: 16.0,
    surgicalBaseHex: '#9E4747',
    fresnelRimHex: '#C96A6A',
    impedanceMRayl: 1.76,
    backscatter: 0.70,
    attenuationDbCmMhz: 0.65,
    renderOrder: 3,
    clinicalSignificance: 'Descends in left posterior mediastinum immediately posterior to LIPV and left lateral LA wall.',
  },
  [StructureId.RETROCARDIAC_ESOPHAGUS]: {
    id: StructureId.RETROCARDIAC_ESOPHAGUS,
    code: 'RETROCARDIAC_ESOPHAGUS',
    name: 'Retrocardiac Esophagus',
    shortLabel: 'Esophagus',
    category: 'coronary_or_esophagus',
    worldCentroidMm: [28.0, 10.0, -46.0],
    boundingRadiusMm: 14.0,
    surgicalBaseHex: '#8C5858',
    fresnelRimHex: '#B87A7A',
    impedanceMRayl: 1.74,
    backscatter: 0.72,
    attenuationDbCmMhz: 0.68,
    renderOrder: 3,
    clinicalSignificance: 'Runs directly behind posterior LA wall (within 3.5-5 mm); localized by ICE to prevent atrioesophageal fistula during PVI.',
  },
  [StructureId.PERICARDIAL_SPACE]: {
    id: StructureId.PERICARDIAL_SPACE,
    code: 'PERICARDIAL_SPACE',
    name: 'Pericardial Sac & Sinuses (Effusion Monitor)',
    shortLabel: 'Pericardium',
    category: 'pericardium',
    worldCentroidMm: [30.0, -15.0, 10.0],
    boundingRadiusMm: 65.0,
    surgicalBaseHex: '#64748B',
    fresnelRimHex: '#94A3B8',
    impedanceMRayl: 1.88,
    backscatter: 0.92,
    attenuationDbCmMhz: 0.75,
    renderOrder: 10,
    clinicalSignificance: 'Brightly echogenic fibrous envelope surrounding the heart; continuously surveyed for anechoic tamponade effusion.',
  },
  [StructureId.WATCHMAN_FLX_DEVICE]: {
    id: StructureId.WATCHMAN_FLX_DEVICE,
    code: 'WATCHMAN_FLX_DEVICE',
    name: 'Watchman FLX LAA Closure Device (18-Strut Nitinol & PET Cap)',
    shortLabel: 'Watchman FLX',
    category: 'procedural_device',
    worldCentroidMm: [52.0, 29.0, 1.0],
    boundingRadiusMm: 16.0,
    surgicalBaseHex: '#CBD5E1',
    fresnelRimHex: '#F8FAFC',
    impedanceMRayl: 6.50,
    backscatter: 0.96,
    attenuationDbCmMhz: 4.50,
    renderOrder: 1,
    clinicalSignificance: 'Self-expanding 18-strut nitinol frame with proximal threaded screw hub and PET fabric membrane deployed in LAA landing zone.',
  },
  [StructureId.TRANSSEPTAL_NEEDLE_SHEATH]: {
    id: StructureId.TRANSSEPTAL_NEEDLE_SHEATH,
    code: 'TRANSSEPTAL_NEEDLE_SHEATH',
    name: 'Transseptal Puncture Sheath & Brockenbrough Needle',
    shortLabel: 'TSP Sheath/Needle',
    category: 'procedural_device',
    worldCentroidMm: [9.5, 6.5, -9.5],
    boundingRadiusMm: 12.0,
    surgicalBaseHex: '#E2E8F0',
    fresnelRimHex: '#F59E0B',
    impedanceMRayl: 6.20,
    backscatter: 0.95,
    attenuationDbCmMhz: 3.80,
    renderOrder: 1,
    clinicalSignificance: 'Steerable transseptal sheath and needle assembly engaging and tenting the Fossa Ovalis toward the Left Atrium.',
  },
  [StructureId.ABLATION_CATHETER_TIP]: {
    id: StructureId.ABLATION_CATHETER_TIP,
    code: 'ABLATION_CATHETER_TIP',
    name: 'Irrigated RF Ablation Catheter Tip',
    shortLabel: 'Ablation Tip',
    category: 'procedural_device',
    worldCentroidMm: [24.0, -10.0, -5.0],
    boundingRadiusMm: 8.0,
    surgicalBaseHex: '#F59E0B',
    fresnelRimHex: '#FEF08A',
    impedanceMRayl: 6.50,
    backscatter: 0.98,
    attenuationDbCmMhz: 4.20,
    renderOrder: 1,
    clinicalSignificance: 'High-polish platinum-iridium electrode tip monitored under direct ICE visualization for tissue contact and lesion safety.',
  },
};

export interface CatheterState {
  model: CatheterModelId;
  station: ChamberStationId;
  sMm: number;             // Axial advancement [-60, +95] mm
  torqueDeg: number;       // Handle CW (+) / CCW (-) rotation [-180, +180] deg
  apDeg: number;           // Anterior (+) / Posterior (-) deflection [-150, +150] deg
  lrDeg: number;           // Left (+) / Right (-) deflection [-120, +120] deg
  omniDeg: number;         // NuVision electronic multiplane [0, 180] deg (locked 0 on SoundStar)
  biplaneEnabled: boolean; // NuVision simultaneous 0/90 X-Plane
  volume4dEnabled: boolean;// NuVision 4D En-Face LAA / volumetric mode
}

export interface CatheterPose3D {
  shaftPoints: [number, number, number][]; // Centerline in World mm from IVC to bend start
  bendPoints: [number, number, number][];  // Constant-curvature neck points in World mm
  tipStart: [number, number, number];      // Proximal start of rigid transducer housing
  tipEnd: [number, number, number];        // Distal end of rigid transducer housing
  transducerPos: [number, number, number]; // Center of acoustic lens window (p0)
  faceNormal: [number, number, number];    // +n_face (central ultrasound beam depth axis, unit vector)
  shaftTangent: [number, number, number];  // +t_tip (distal tip axis, 0-deg lateral sector axis)
  elevNormal: [number, number, number];    // +e_L (orthogonal elevation axis)
  latAxis: [number, number, number];       // +u_lat(omniDeg) = cos(omni)*t_tip + sin(omni)*e_L
  biplaneLatAxis: [number, number, number];// +u_lat(omniDeg + 90 deg) for NuVision X-plane
}

export interface UltrasoundSettings {
  depthCm: number;              // [6, 16] cm, default 10 cm
  gainDb: number;               // [20, 90] dB, default 58 dB
  dynamicRangeDb: number;       // [40, 80] dB, default 60 dB
  frequencyMhz: number;         // [5.0, 10.0] MHz, default 7.5 MHz
  focusCm: number;              // [2.0, 14.0] cm, default 5.5 cm
  tgcOffsetsDb: number[];       // 6-band TGC offsets [-15, +15] dB
  markerSide: 'right' | 'left'; // Default 'right' (Right = Distal/Superior, Left = Proximal/Inferior)
  colorDopplerEnabled: boolean;
  labelOverlayMode: LabelOverlayMode;
  frozen: boolean;
}

export interface CartosoundContour {
  id: string;
  structureId: StructureId;
  structureName: string;
  colorHex: string;
  timestampMs: number;
  omniDeg: number;
  /** 3D polyline points in World mm */
  worldPointsMm: [number, number, number][];
}

export interface PassCriteriaStatus {
  /** Position: device at or slightly distal to LAA ostium, zero shoulder protrusion over Coumadin ridge or MV */
  positionPass: boolean;
  positionDetail: string;
  /** Anchor: stable engagement on tug test (< 2 mm recoil) */
  anchorPass: boolean;
  anchorDetail: string;
  /** Size: 10% to 30% device compression across 0/45/90/135 deg multiplane views */
  sizePass: boolean;
  compressionPct: number;
  measuredDiametersMm: {
    deg0: number;
    deg45: number;
    deg90: number;
    deg135: number;
  };
  sizeDetail: string;
  /** Seal: < 3 mm peri-device Color Doppler leak jet */
  sealPass: boolean;
  maxLeakJetMm: number;
  sealDetail: string;
  /** Overall PASS release readiness */
  allPassed: boolean;
}

export interface ProceduralSimulationState {
  heartRateBpm: number;          // [40, 140] BPM, default 72 BPM
  cardiacPhase: number;          // [0, 1) normalized R-R cycle
  laaMorphology: LAAMorphologyId;
  laaThrombusPresent: boolean;
  pericardialEffusionMl: 0 | 50 | 200;
  tspTentingMm: number;          // [0, 14] mm Fossa Ovalis tenting toward LA
  tspHeightAboveMvMm: number;    // [25, 55] mm (optimal Watchman target: 40-45 mm)
  tspApOffsetMm: number;         // [-12, +12] mm (- = posterior optimal, + = anterior near Ao)
  ablationCatheterActive: boolean;
  ablationTargetStructureId: number | null;
  watchmanSizeMm: 20 | 24 | 27 | 31 | 35 | 40;
  watchmanStage: WatchmanStageId;
  watchmanTugActive: boolean;
  cartosoundContours: CartosoundContour[];
}

export interface CanonicalICEView {
  id: string;
  number: number;
  track: ClinicalTrackId;
  title: string;
  shortTitle: string;
  recommendedCatheter: CatheterModelId | 'either';
  startingViewId: string;
  targetState: CatheterState;
  recommendedDepthCm: number;
  maneuverBullets: string[];
  sectorAnatomy: {
    nearFieldApex: string;
    midField: string;
    farField: string;
    distalRightEdge: string;
    proximalLeftEdge: string;
  };
  expectedStructureIds: number[]; // Must be intersected in headless verification!
  clinicalPurpose: string;
  fellowPearlsAndPitfalls: string[];
  literatureCitations: string[];
}

/**
 * Acoustic sample returned at any 3D World coordinate (mm) by HeartAnatomyEngine.evaluateAcousticPoint
 */
export interface AcousticSamplePoint {
  /** Acoustic impedance Z in MRayl (1.62 = blood pool, 1.68..1.88 = tissue, 6.50 = catheter/Watchman) */
  impedanceMRayl: number;
  /** Intrinsic tissue backscatter [0..1] */
  backscatter: number;
  /** Acoustic attenuation in dB/(cm*MHz) */
  attenuationDbCmMhz: number;
  /** Dominant anatomical or procedural StructureId (0 = blood pool / background) */
  structureId: number;
  /** Normalized tissue border gradient magnitude [0..1] for specular boundary highlights */
  borderGradient: number;
  /** Signed distance (mm) to nearest endocardial/tissue boundary (negative inside tissue wall) */
  signedDistanceMm: number;
  /** Physiological blood flow velocity vector (cm/s) in World coordinates for Color Doppler */
  flowVelocityCmPerSec: [number, number, number];
}

export interface HeartMeshManifestEntry {
  index: number;
  id: string;
  fmaId: string;
  name: string;
  structureId: number;
  category: StructureLayerCategory;
  surgicalBaseHex: string;
  fresnelRimHex: string;
  renderOrder: number;
  vertexOffset: number;
  vertexCount: number;
  indexOffset: number;
  indexCount: number;
  centroidMm: [number, number, number];
  boundsMinMm: [number, number, number];
  boundsMaxMm: [number, number, number];
}

export interface HeartAtlasManifest {
  version: string;
  coordinateFrame: string;
  originDescription: string;
  totalVertices: number;
  totalTriangles: number;
  vertexByteOffset: number;
  normalByteOffset: number;
  indexByteOffset: number;
  meshes: HeartMeshManifestEntry[];
  acousticVolume: {
    dimensions: [number, number, number];
    boundsMinMm: [number, number, number];
    boundsMaxMm: [number, number, number];
    channels: string[];
  };
}

export const DEFAULT_CATHETER_STATE: CatheterState = {
  model: 'soundstar_10f',
  station: 'ra_venous',
  sMm: 0,
  torqueDeg: 0,
  apDeg: 0,
  lrDeg: 0,
  omniDeg: 0,
  biplaneEnabled: false,
  volume4dEnabled: false,
};

export const DEFAULT_ULTRASOUND_SETTINGS: UltrasoundSettings = {
  depthCm: 10.0,
  gainDb: 58,
  dynamicRangeDb: 60,
  frequencyMhz: 7.5,
  focusCm: 5.5,
  tgcOffsetsDb: [0, 0, 0, 0, 0, 0],
  markerSide: 'right',
  colorDopplerEnabled: false,
  labelOverlayMode: 'all',
  frozen: false,
};

export const DEFAULT_PROCEDURAL_SIMULATION_STATE: ProceduralSimulationState = {
  heartRateBpm: 72,
  cardiacPhase: 0.0,
  laaMorphology: 'chicken_wing',
  laaThrombusPresent: false,
  pericardialEffusionMl: 0,
  tspTentingMm: 0.0,
  tspHeightAboveMvMm: 42.0,
  tspApOffsetMm: -3.0,
  ablationCatheterActive: false,
  ablationTargetStructureId: null,
  watchmanSizeMm: 27,
  watchmanStage: 'none',
  watchmanTugActive: false,
  cartosoundContours: [],
};
