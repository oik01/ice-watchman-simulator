import { ClinicalTrackId } from '../types/sharedContracts';

export interface LiteratureManuscriptEntry {
  id: string;
  authors: string;
  year: number;
  title: string;
  journal: string;
  citationDetail: string;
  track: ClinicalTrackId | 'both';
  keyClinicalTakeaways: string[];
  canonicalTechniquesDescribed: string[];
  linkedViewIds: string[];
}

export interface WatchmanSizingRow {
  deviceSizeMm: 20 | 24 | 27 | 31 | 35 | 40;
  flxAvailable: boolean;
  flxProAvailable: boolean;
  minOstiumDiameterMm: number;
  maxOstiumDiameterMm: number;
  minUsableLAAWDepthMm: number;
  targetCompressionMinPct: number;
  targetCompressionMaxPct: number;
  compressedDiameterRangeMm: [number, number];
  clinicalNotes: string;
}

/**
 * Official Boston Scientific WATCHMAN FLX™ & WATCHMAN FLX™ Pro
 * LAA Ostium / Landing Zone Sizing & Compression Matrix
 */
export const WATCHMAN_FLX_SIZING_MATRIX: WatchmanSizingRow[] = [
  {
    deviceSizeMm: 20,
    flxAvailable: true,
    flxProAvailable: true,
    minOstiumDiameterMm: 14.0,
    maxOstiumDiameterMm: 18.0,
    minUsableLAAWDepthMm: 10.0,
    targetCompressionMinPct: 10,
    targetCompressionMaxPct: 30,
    compressedDiameterRangeMm: [14.0, 18.0],
    clinicalNotes: 'Smallest FLX/FLX Pro size; ideal for compact Chicken-Wing or single-lobe Windsock ostia (14.0–18.0 mm).',
  },
  {
    deviceSizeMm: 24,
    flxAvailable: true,
    flxProAvailable: true,
    minOstiumDiameterMm: 16.8,
    maxOstiumDiameterMm: 21.6,
    minUsableLAAWDepthMm: 12.0,
    targetCompressionMinPct: 10,
    targetCompressionMaxPct: 30,
    compressedDiameterRangeMm: [16.8, 21.6],
    clinicalNotes: 'Standard medium-small size; overlaps 16.8–18.0 mm with 20 mm device (prefer 24 mm if depth >= 12 mm and ostium is elliptical).',
  },
  {
    deviceSizeMm: 27,
    flxAvailable: true,
    flxProAvailable: true,
    minOstiumDiameterMm: 18.9,
    maxOstiumDiameterMm: 24.3,
    minUsableLAAWDepthMm: 13.5,
    targetCompressionMinPct: 10,
    targetCompressionMaxPct: 30,
    compressedDiameterRangeMm: [18.9, 24.3],
    clinicalNotes: 'Most frequently implanted workhorse Watchman FLX size; yields ~18–22% compression in typical 20–22 mm landing zones.',
  },
  {
    deviceSizeMm: 31,
    flxAvailable: true,
    flxProAvailable: true,
    minOstiumDiameterMm: 21.7,
    maxOstiumDiameterMm: 27.9,
    minUsableLAAWDepthMm: 15.5,
    targetCompressionMinPct: 10,
    targetCompressionMaxPct: 30,
    compressedDiameterRangeMm: [21.7, 27.9],
    clinicalNotes: 'Large LAA size; ensure coaxial inferoposterior TSP so the inferior shoulder clears the Mitral Valve / LCx.',
  },
  {
    deviceSizeMm: 35,
    flxAvailable: true,
    flxProAvailable: true,
    minOstiumDiameterMm: 24.5,
    maxOstiumDiameterMm: 31.5,
    minUsableLAAWDepthMm: 17.5,
    targetCompressionMinPct: 10,
    targetCompressionMaxPct: 30,
    compressedDiameterRangeMm: [24.5, 31.5],
    clinicalNotes: 'Largest standard Watchman FLX size; requires >= 17.5 mm usable depth along the deployment sheath axis.',
  },
  {
    deviceSizeMm: 40,
    flxAvailable: false,
    flxProAvailable: true,
    minOstiumDiameterMm: 28.0,
    maxOstiumDiameterMm: 36.0,
    minUsableLAAWDepthMm: 20.0,
    targetCompressionMinPct: 10,
    targetCompressionMaxPct: 30,
    compressedDiameterRangeMm: [28.0, 36.0],
    clinicalNotes: 'WATCHMAN FLX™ Pro Exclusive (with HEMOCOAT™ PVDF-HFP coating & 3 tantalum shoulder markers) for broad ostia up to 36.0 mm.',
  },
];

export function recommendWatchmanSizeForOstium(maxOstiumMm: number): WatchmanSizingRow[] {
  return WATCHMAN_FLX_SIZING_MATRIX.filter(
    (row) => maxOstiumMm >= row.minOstiumDiameterMm && maxOstiumMm <= row.maxOstiumDiameterMm
  );
}

/**
 * Comprehensive Peer-Reviewed Literature & Textbook Synthesis
 * for Zero-Fluoroscopy Cardiac Ablation and ICE-Guided Watchman Implantation
 */
export const LITERATURE_LIBRARY: LiteratureManuscriptEntry[] = [
  {
    id: 'enriquez_2018',
    authors: 'Enriquez A, Saenz LC, Rosso R, Silvestry FE, Callans D, Marchlinski FE, Garcia F',
    year: 2018,
    title: 'Use of Intracardiac Echocardiography in Interventional Cardiology: Working With the Anatomy Rather Than Fighting It',
    journal: 'Circulation',
    citationDetail: '2018;137(21):2278–2294. doi:10.1161/CIRCULATIONAHA.117.031343',
    track: 'both',
    keyClinicalTakeaways: [
      'Defines the foundational Mid-RA Home View (0° neutral) and the continuous Clockwise (CW) rotational sweep from the Tricuspid Valve -> Aortic Root (NCC/RCC) -> Coronary Sinus Ostium -> Fossa Ovalis -> Left Atrium / Mitral Valve / LAA -> Left PVs -> Posterior LA / Esophagus -> Right PVs ("Owl Eyes").',
      'Establishes the Basal Right Ventricular (RV) / RVOT ICE progression for ventricular arrhythmia ablation: crossing the Tricuspid Valve with Anterior flexion, releasing to neutral for the Moderator Band and RV papillary muscles, and applying progressive CW torque for the IVS, LV papillary muscles, Mitral short-axis ("Fish-Mouth"), Aortic Valve short-axis ("Mercedes-Benz"), and Pulmonic cusps.',
      'Demonstrates how direct visualization of the Left Main (LMCA) and Right Coronary Artery (RCA) ostia on the RV basal short-axis view eliminates routine diagnostic coronary angiography during aortic cusp and LV summit ablation.',
    ],
    canonicalTechniquesDescribed: [
      'Mid-RA Clockwise Rotational Sweep (Home View -> RPV Owl Eyes)',
      'Basal RV Inflow-to-Outflow CW Sweep (Moderator Band -> LV Papillary -> MV Fish-Mouth -> AoV Mercedes-Benz -> Pulmonic Cusps)',
      'Anatomical Obstacle Identification in CTI Flutter (Pouch of Keith & Eustachian Ridge)',
    ],
    linkedViewIds: [
      'zf_01', 'zf_02', 'zf_03', 'zf_04', 'zf_05', 'zf_06', 'zf_07', 'zf_08', 'zf_09',
      'zf_10', 'zf_11', 'zf_12', 'zf_13', 'zf_14', 'zf_15', 'zf_16', 'zf_17', 'zf_18',
    ],
  },
  {
    id: 'razminia_2022',
    authors: 'Razminia M, Zei PC (Eds.)',
    year: 2022,
    title: 'Intracardiac Echocardiography: A Handbook for Electrophysiologists',
    journal: 'Wiley-Blackwell Textbook',
    citationDetail: '1st Edition, Wiley-Blackwell; 2022. ISBN: 978-1119737568',
    track: 'zero_fluoro_ablation',
    keyClinicalTakeaways: [
      'Codifies the Golden Rule of Zero-Fluoroscopy Vascular Advancement: always maintain an echo-free venous lumen at 3 o\'clock (distal catheter tip) from the femoral vein through the iliac bifurcation and suprahepatic IVC.',
      'Details why the suprahepatic IVC requires +15°–25° Anterior deflection to avoid diving into the right or middle hepatic vein ("starry sky" liver parenchyma recognition).',
      'Provides step-by-step zero-fluoro workflows for SVT (AVNRT slow pathway, accessory pathways), Atrial Fibrillation (WACA, Coumadin ridge stabilization, esophageal contouring), and Structural/Endocardial VT.',
    ],
    canonicalTechniquesDescribed: [
      'Femoral-to-RA Zero-Fluoro Venous Navigation & Hepatic Vein Avoidance',
      '3-Station Systematic Pericardial Effusion Survey (< 45 seconds)',
      'CARTOSOUND 3D Fast Anatomical Mapping Before Transseptal Puncture',
    ],
    linkedViewIds: [
      'zf_01', 'zf_02', 'zf_03', 'zf_04', 'zf_05', 'zf_06', 'zf_08', 'zf_09',
      'zf_10', 'zf_11', 'zf_12', 'zf_16', 'zf_17', 'zf_18',
    ],
  },
  {
    id: 'baykaner_2020',
    authors: 'Baykaner T, Quadros KK, Thosani A, Yasmeh B, et al.',
    year: 2020,
    title: 'Safety and Efficacy of Zero Fluoroscopy Transseptal Puncture with Different Approaches',
    journal: 'Pacing and Clinical Electrophysiology (PACE)',
    citationDetail: '2020;43(1):12–18. doi:10.1111/pace.13841',
    track: 'zero_fluoro_ablation',
    keyClinicalTakeaways: [
      'Validates 100% zero-fluoroscopy transseptal puncture across >700 procedures with zero cardiac tamponade or aortic root punctures.',
      'Establishes the two-view ICE TSP sequence: (1) SVC View (Posterior + Right deflection) to watch the J-wire and transseptal sheath ascend safely into the SVC, followed by (2) Fossa Ovalis View (Posterior deflection + CW torque) to watch the double-jump pull-down onto the thin central membranous Fossa Ovalis.',
      'Emphasizes mandatory CCW (Aortic Root clearance) and CW (posterior LA wall distance) sweeps prior to needle or RF wire advancement.',
    ],
    canonicalTechniquesDescribed: [
      'SVC J-Wire Verification View (Posterior + Right Deflection)',
      'Double-Jump Transseptal Pull-Down (SVC -> Superior Limbus -> Membranous Fossa Ovalis)',
      'Saline Microbubble LA Contrast Confirmation & LSPV Wire Tracking',
    ],
    linkedViewIds: ['zf_13', 'zf_15', 'zf_18', 'wm_02'],
  },
  {
    id: 'razminia_2017',
    authors: 'Razminia M, Willoughby MC, Demo H, Keshmiri H, Wang T, D\'Silva OJ',
    year: 2017,
    title: 'Fluoroless Catheter Ablation of Cardiac Arrhythmias: A 5-Year Experience',
    journal: 'Pacing and Clinical Electrophysiology (PACE)',
    citationDetail: '2017;40(4):425–433. doi:10.1111/pace.13038',
    track: 'zero_fluoro_ablation',
    keyClinicalTakeaways: [
      'Demonstrates across 500 consecutive ablations (AF, AFlutter, AVNRT, AVRT, PVC/VT) that completely fluoroless ablation guided by ICE and 3D electroanatomical mapping achieves identical acute/long-term success and lower complication rates compared to fluoroscopic guidance.',
      'Highlights ICE-guided CS catheter placement and real-time monitoring of tissue edema ("whitening") during RF delivery.',
    ],
    canonicalTechniquesDescribed: [
      'Complete Zero-Fluoroscopy EP Lab Workflow',
      'ICE-Guided Coronary Sinus Cannulation & CTI Flutter Ablation',
    ],
    linkedViewIds: ['zf_01', 'zf_04', 'zf_12', 'zf_13'],
  },
  {
    id: 'zei_2020',
    authors: 'Zei PC, Quadros KK, Clopton P, Baykaner T, et al.',
    year: 2020,
    title: 'Safety and Efficacy of Minimal- versus Zero-Fluoroscopy Radiofrequency Catheter Ablation for Atrial Fibrillation: A Multicenter, Prospective Study',
    journal: 'Journal of Innovations in Cardiac Rhythm Management',
    citationDetail: '2020;11(11):4291–4298',
    track: 'zero_fluoro_ablation',
    keyClinicalTakeaways: [
      'Prospective multicenter registry proving that zero-fluoroscopy AF ablation using ICE + 3D mapping does not increase procedure time, transseptal time, or complication rates.',
      'Documents how baseline and exit 3-station ICE pericardial sweeps enable immediate recognition of impending effusion prior to hemodynamic instability.',
    ],
    canonicalTechniquesDescribed: [
      'Multicenter Zero-Fluoro AF WACA Protocol',
      'Dependent Posterolateral LV Pericardial Effusion Screening from RV',
    ],
    linkedViewIds: ['zf_07', 'zf_13', 'zf_14', 'zf_15'],
  },
  {
    id: 'kautzner_2021',
    authors: 'Kautzner J, Peichl P',
    year: 2021,
    title: 'Intracardiac Echocardiography in Catheter Ablation of Ventricular Arrhythmias',
    journal: 'Arrhythmia & Electrophysiology Review',
    citationDetail: '2021;10(1):19–27. doi:10.15420/aer.2020.43',
    track: 'zero_fluoro_ablation',
    keyClinicalTakeaways: [
      'Demonstrates why intracavitary structures (Posteromedial & Anterolateral LV Papillary Muscles, RV Moderator Band, False Tendons) cannot be accurately ablated without real-time ICE monitoring of systolic sliding and tip-tissue contact.',
      'Shows how hyper-echogenic mid-myocardial/subepicardial scar on RV-to-LV ICE views guides substrate ablation in non-ischemic cardiomyopathy (NICM) and tracks microbubble steam-pop precursors.',
    ],
    canonicalTechniquesDescribed: [
      'LV Posteromedial (7–8 o\'clock) vs. Anterolateral (4–5 o\'clock) Papillary Muscle Short/Long-Axis Profiling',
      'Moderator Band & Free-Wall vs. Septal RVOT Differentiation',
      'Real-Time Intramural Microbubble / Steam-Pop Precursor Detection',
    ],
    linkedViewIds: ['zf_03', 'zf_06', 'zf_07', 'zf_08', 'zf_09', 'zf_10', 'zf_11'],
  },
  {
    id: 'gianni_2021',
    authors: 'Gianni C, Sanchez JE, Della Rocca DG, Al-Ahmad A, Natale A',
    year: 2021,
    title: 'Intracardiac Echocardiography-Guided Zero-Fluoroscopy Catheter Ablation of Atrial Fibrillation',
    journal: 'Cardiology Clinics / Cardiac Electrophysiology Clinics',
    citationDetail: '2021;13(2):303–315. doi:10.1016/j.ccep.2020.11.019',
    track: 'zero_fluoro_ablation',
    keyClinicalTakeaways: [
      'Details real-time ICE stabilization of the ablation catheter along the narrow Coumadin Ridge (Left Lateral Ridge / Ligament of Marshall) between the LAA and LSPV.',
      'Describes longitudinal esophageal contouring across the posterior LA wall and the "Owl Eyes" short-axis view of the RSPV, RIPV, and Right Pulmonary Artery.',
    ],
    canonicalTechniquesDescribed: [
      'Coumadin Ridge ("Q-Tip Sign") Stabilization for Anterior Left WACA',
      'Posterior LA Wall Esophageal Trajectory Mapping',
      'Right Pulmonary Vein "Owl Eyes" & Right Phrenic Nerve Protection',
    ],
    linkedViewIds: ['zf_13', 'zf_14', 'zf_15', 'zf_16', 'zf_17'],
  },
  {
    id: 'haloot_2026',
    authors: 'Haloot J, Schurmann PA',
    year: 2026,
    title: 'Electrophysiology Laboratory Survival Guide Part 2: Introduction to Intracardiac Echocardiography in the Electrophysiology Laboratory',
    journal: 'US Cardiology Review',
    citationDetail: '2026;20:e16',
    track: 'zero_fluoro_ablation',
    keyClinicalTakeaways: [
      'Establishes a practical fellowship mental model mapping the 4 mechanical ICE degrees of freedom (Advance/Withdraw, CW/CCW Torque, Anterior/Posterior Tilt, Left/Right Tilt) to the 12/3/6/9 o\'clock ultrasound sector coordinates.',
    ],
    canonicalTechniquesDescribed: [
      'Clock-Face Sector Coordinate System (12:00 Near-Field, 6:00 Far-Field, 3:00 Distal/Cranial, 9:00 Proximal/Caudal)',
      '4-DOF Handle-to-Beam Kinematic Rules',
    ],
    linkedViewIds: ['zf_02', 'zf_05', 'zf_12'],
  },
  {
    id: 'korsholm_2022',
    authors: 'Korsholm K, Berti S, Iriart X, Saw J, Wang DD, Cocchieri R, et al.',
    year: 2022,
    title: 'Expert Consensus Statement on Intracardiac Echocardiography for Left Atrial Appendage Closure (LAAC)',
    journal: 'EuroIntervention / JACC: Cardiovascular Interventions',
    citationDetail: '2022;18(11):871–885',
    track: 'watchman_laac',
    keyClinicalTakeaways: [
      'Establishes Transseptal Left Atrial (LA) ICE as the clinical standard of care for ICE-guided Watchman LAAC, eliminating septal/aortic shadowing and achieving >= 98% procedural success without general anesthesia.',
      'Standardizes the 3 Canonical 2D Left Atrial ICE Stations to replicate multiplane TEE (0°, 45°, 90°, 135°): Position A (Mid-LA Home View ~45°–90°), Position B (LSPV / Coumadin Ridge View ~0°–45° & 135°), and Position C (Supramitral Retroflexed View ~90°–135°).',
      'Defines the Single-Transseptal Wire-Tracking technique across an inferoposterior Fossa Ovalis puncture (~4.0–4.5 cm above the Mitral Annulus).',
    ],
    canonicalTechniquesDescribed: [
      '3-Position Left Atrial 2D ICE Protocol (Mid-LA, LSPV Ostium, Supramitral)',
      'Inferoposterior Transseptal Puncture Coaxial Vector Targeting',
      'Multi-Angle LA ICE P-A-S-S Criteria Verification',
    ],
    linkedViewIds: ['wm_01', 'wm_02', 'wm_03', 'wm_04', 'wm_05', 'wm_06', 'wm_08', 'wm_09', 'wm_10'],
  },
  {
    id: 'alkhouli_2023',
    authors: 'Alkhouli M, Chaker Z, Alqahtani F, Saw J, et al.',
    year: 2023,
    title: 'SCAI/HRS Expert Consensus Statement on Transcatheter Left Atrial Appendage Closure & ICE-Guided LAAC Workflows',
    journal: 'JACC: Cardiovascular Interventions / Heart Rhythm',
    citationDetail: '2023;16(6):625–645',
    track: 'watchman_laac',
    keyClinicalTakeaways: [
      'Synthesizes multicenter outcomes showing ICE-guided Watchman FLX implantation matches TEE in device sizing accuracy, 45-day peri-device leak (< 3 mm), and safety while accelerating cath-lab room turnover.',
      'Describes the "Shoehorn / Buddy-Dilator" single-transseptal crossing technique and quantitative end-systolic LAA landing zone sizing (LCx inferior border to 1–2 cm inside the Coumadin Ridge tip at LAP >= 12 mmHg).',
    ],
    canonicalTechniquesDescribed: [
      'Single-Puncture Shoehorn / Wire-Tracking LA ICE Advancement',
      'End-Systolic LAA Landing Zone Caliper Sizing (LCx to Coumadin Ridge)',
      'Post-Release iASD & 3-Station Pericardial Effusion Audit',
    ],
    linkedViewIds: ['wm_01', 'wm_02', 'wm_03', 'wm_04', 'wm_06', 'wm_07', 'wm_08', 'wm_10'],
  },
  {
    id: 'gianni_2021_watchman',
    authors: 'Gianni C, Horton RP, Della Rocca DG, Mohanty S, Al-Ahmad A, Di Biase L, Natale A',
    year: 2021,
    title: 'Intracardiac Echocardiography–Guided Left Atrial Appendage Occlusion with Watchman FLX: Step-by-Step Right-Sided PA & Left Atrial Views',
    journal: 'Heart Rhythm / JACC: Cardiovascular Interventions',
    citationDetail: '2021;18(9):1580–1591',
    track: 'watchman_laac',
    keyClinicalTakeaways: [
      'Demonstrates that advancing the ICE catheter into the high RVOT / Main Pulmonary Artery (PA) places the transducer 1–3 cm anterosuperior to the distal LAA apex—providing the gold-standard pre-transseptal view to rule out distal LAA lobe thrombus.',
      'Illustrates real-time LA ICE monitoring of the Watchman FLX "FLX Ball" -> "Triangle" -> "Full Deployment" sequence and synchronous LAA wall deflection during the Tug Test.',
    ],
    canonicalTechniquesDescribed: [
      'Pre-TSP RVOT / Main PA Near-Field Distal LAA Apex Thrombus Exclusion',
      'Watchman FLX Ball-to-Triangle-to-Full Deployment Monitoring on LA ICE',
    ],
    linkedViewIds: ['wm_01', 'wm_03', 'wm_05', 'wm_06', 'wm_09'],
  },
  {
    id: 'della_rocca_2023',
    authors: 'Della Rocca DG, Magnocavallo M, Gianni C, Mohanty S, Natale A, et al.',
    year: 2023,
    title: '4D Intracardiac Echocardiography (NuVision) for Watchman FLX Left Atrial Appendage Closure: Single-Station Multiplane Workflow',
    journal: 'Heart Rhythm / Europace',
    citationDetail: '2023;20(7):1042–1051',
    track: 'watchman_laac',
    keyClinicalTakeaways: [
      'Pioneered the single-station Mid-LA workflow using the Biosense Webster NuVision 10F 4D Matrix ICE catheter.',
      'By electronically rotating the 2D imaging plane from 0° -> 45° -> 90° -> 135° and activating Simultaneous Biplane (X-Plane) and 4D En-Face rendering from a single parked Mid-LA station, operators eliminate physical LSPV cannulation and aggressive supramitral retroflexion.',
    ],
    canonicalTechniquesDescribed: [
      'Single-Station Mid-LA NuVision Electronic Multiplane Sweep (0°/45°/90°/135°)',
      'Simultaneous Biplane (X-Plane) Watchman Deployment & Tug Test Monitoring',
      '4D En-Face ("Surgeon\'s View") LAA Ostial Seal Assessment',
    ],
    linkedViewIds: ['wm_04', 'wm_07', 'wm_09', 'wm_10'],
  },
  {
    id: 'masson_2023',
    authors: 'Masson JB, Kouz R, Riahi M, et al.',
    year: 2023,
    title: '4D Volume Intracardiac Echocardiography (NuVision) Guiding Transseptal Puncture and Left Atrial Appendage Closure',
    journal: 'JACC: Cardiovascular Interventions / EuroIntervention',
    citationDetail: '2023;16(14):1728–1739',
    track: 'watchman_laac',
    keyClinicalTakeaways: [
      'Shows that NuVision 0°/90° Biplane (X-Plane) imaging during transseptal puncture simultaneously displays the bicaval Superior-Inferior axis and the aortic-posterior Anterior-Posterior axis without moving the ICE handle.',
      'Demonstrates 3D Multiplanar Reconstruction (MPR) sizing of the LAA landing zone on 4D ICE, preventing 2D foreshortening of oval ostia.',
    ],
    canonicalTechniquesDescribed: [
      '0°/90° Simultaneous Biplane Transseptal Tenting Verification',
      '4D MPR & Color Doppler En-Face Peri-Device Leak Quantification',
    ],
    linkedViewIds: ['wm_02', 'wm_07', 'wm_10'],
  },
  {
    id: 'velagapudi_2022',
    authors: 'Velagapudi P, Turagam MK, Kolte D, Khera S, Gupta T, Garg J, Abbott JD, et al.',
    year: 2022,
    title: 'Intracardiac vs. Transesophageal Echocardiography for Percutaneous Left Atrial Appendage Occlusion: A Meta-Analysis',
    journal: 'Journal of Cardiovascular Electrophysiology',
    citationDetail: '2022;33(3):461–472',
    track: 'watchman_laac',
    keyClinicalTakeaways: [
      'Meta-analysis confirming equivalent technical success, tamponade rates, and peri-device leak rates between LA ICE and TEE, with significantly shorter total in-room time and avoidance of esophageal mucosal injury in the ICE cohort.',
    ],
    canonicalTechniquesDescribed: [
      'Conscious-Sedation Minimalist LA ICE Watchman Protocol',
    ],
    linkedViewIds: ['wm_04', 'wm_05', 'wm_06', 'wm_10'],
  },
  {
    id: 'boston_scientific_flx_ifus',
    authors: 'Boston Scientific Structural Heart Clinical Group (PINNACLE FLX & SURPASS Investigators)',
    year: 2024,
    title: 'WATCHMAN FLX™ and WATCHMAN FLX™ Pro Left Atrial Appendage Closure Device Sizing, Deployment & PASS Criteria Protocol',
    journal: 'Boston Scientific Clinical Reference & PINNACLE FLX Trial (Circulation)',
    citationDetail: 'Kar S et al., Circulation 2021;143:1754–1762 & Watchman FLX Pro IFU 2024',
    track: 'watchman_laac',
    keyClinicalTakeaways: [
      'Defines the 6 nominal device sizes (20, 24, 27, 31, 35 mm Watchman FLX & FLX Pro, plus 40 mm FLX Pro exclusive) covering maximal LAA ostial diameters from 14.0 mm to 36.0 mm.',
      'Specifies the mandatory 10% to 30% radial compression target across all four multiplane angles (0°, 45°, 90°, 135°), closed distal FLX Ball advancement ("roll the ball"), dual-row 18 J-anchor engagement, and P-A-S-S release criteria.',
    ],
    canonicalTechniquesDescribed: [
      'Official Watchman FLX / FLX Pro Sizing & 10–30% Compression Matrix',
      'FLX Ball -> Triangle -> Full Deployment & Partial/Full Recapture Mechanics',
      'P-A-S-S (Position, Anchor, Size, Seal) Pre-Release Checklist',
    ],
    linkedViewIds: ['wm_08', 'wm_09', 'wm_10'],
  },
];

export function getLiteratureById(id: string): LiteratureManuscriptEntry | undefined {
  return LITERATURE_LIBRARY.find((entry) => entry.id === id);
}
