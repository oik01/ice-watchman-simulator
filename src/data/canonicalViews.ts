import {
  CanonicalICEView,
  CatheterState,
  ClinicalTrackId,
  StructureId,
} from '../types/sharedContracts';

/**
 * Complete 28-View Clinical Intracardiac Echocardiography (ICE) Curriculum
 * across Track A (Zero-Fluoroscopy Cardiac Ablation: 18 Views, zf_01..zf_18)
 * and Track B (LAA Watchman FLX & FLX Pro Implantation: 10 Views & Stages, wm_01..wm_10).
 *
 * Calibrated to the Frozen Shared Architecture Contract (Three.js Right-Handed Y-Up, mm,
 * Origin (0,0,0) at Mid-RA Neutral ICE Transducer Reference Point).
 */
export const CANONICAL_ICE_VIEWS: CanonicalICEView[] = [
  // ============================================================================
  // TRACK A: ZERO-FLUOROSCOPY CARDIAC ABLATION (18 VIEWS: zf_01 .. zf_18)
  // ============================================================================
  {
    id: 'zf_01',
    number: 1,
    track: 'zero_fluoro_ablation',
    title: 'Femoral → Iliac → Suprahepatic IVC Vascular Advancement View',
    shortTitle: '01. IVC Vascular Advancement',
    recommendedCatheter: 'either',
    startingViewId: 'zf_01',
    targetState: {
      model: 'soundstar_10f',
      station: 'ra_venous',
      sMm: -45,
      torqueDeg: 0,
      apDeg: 18,
      lrDeg: 0,
      omniDeg: 0,
      biplaneEnabled: false,
      volume4dEnabled: false,
    },
    recommendedDepthCm: 9,
    maneuverBullets: [
      'Insert the 8F/10F ICE catheter through the femoral venous introducer sheath with both A/P and L/R deflection knobs in Neutral (0°).',
      'Rotate the handle gently CW or CCW until the anechoic (black) venous lumen opens continuously toward 3 o\'clock (distal catheter tip direction).',
      'Obey the Golden Rule of Zero-Fluoro Vascular Advancement: advance only when an open echo-free blood pool is visible at 3 o\'clock; never push against an echogenic wall.',
      'At the suprahepatic IVC level (where hepatic veins join at 4–6 o\'clock), apply +15° to +20° Anterior (A) deflection to steer anteriorly across the IVC-RA junction rather than diving into the right or middle hepatic vein.',
      'Once the wide anechoic Right Atrial cavity opens at 2–3 o\'clock past the Eustachian valve, advance 3–4 cm into the mid-RA and release Anterior deflection to Neutral (0°).',
    ],
    sectorAnatomy: {
      nearFieldApex: 'Suprahepatic IVC lumen and anterior venous wall abutting the transducer face (12 o\'clock).',
      midField: 'Hepatic vein confluence draining obliquely at 4–6 o\'clock; prominent Eustachian valve/ridge guarding the IVC-RA junction at 2–3 o\'clock.',
      farField: 'Homogeneous speckled hepatic parenchyma (liver dome) and retroperitoneal pulsatile Abdominal Aorta when rotated leftward (5–7 o\'clock).',
      distalRightEdge: 'Cranial/Superior path into the inferior Right Atrium (3 o\'clock — must remain echo-free during advancement).',
      proximalLeftEdge: 'Caudal/Inferior abdominal IVC segment already traversed by the catheter shaft (9 o\'clock).',
    },
    expectedStructureIds: [
      StructureId.IVC,
      StructureId.EUSTACHIAN_RIDGE,
      StructureId.RA_CAVITY,
    ],
    clinicalPurpose:
      'Eliminates fluoroscopy during initial femoral-to-RA catheter and long-sheath advancement, navigates pelvic venous tortuosity, and prevents inadvertent hepatic or renal vein cannulation.',
    fellowPearlsAndPitfalls: [
      'Pitfall — Subcapsular Hepatic Hematoma: A neutral catheter ascending the IVC naturally points into the hepatic veins. Recognizing speckled liver parenchyma ("starry sky" texture) and applying +18° Anterior tilt is mandatory to enter the RA safely.',
      'Pearl — Guiding Difficult Long Sheaths: Park the ICE transducer 1–2 cm below a tortuous iliac vein or prominent Eustachian valve to watch J-wires and transseptal sheaths pass under direct real-time ultrasound visualization.',
      'Pearl — Pelvic Tortuosity: If the iliac wall closes across 3 o\'clock at 12–18 cm insertion depth, withdraw 1 cm, apply slight A/P + rotational torque to re-open the 3 o\'clock lumen, and advance smoothly.',
    ],
    literatureCitations: ['enriquez_2018', 'razminia_2022', 'razminia_2017'],
  },
  {
    id: 'zf_02',
    number: 2,
    track: 'zero_fluoro_ablation',
    title: 'Home View (Mid-RA Neutral Reference)',
    shortTitle: '02. Home View (Mid-RA Neutral)',
    recommendedCatheter: 'either',
    startingViewId: 'zf_01',
    targetState: {
      model: 'soundstar_10f',
      station: 'ra_venous',
      sMm: 0,
      torqueDeg: 0,
      apDeg: 0,
      lrDeg: 0,
      omniDeg: 0,
      biplaneEnabled: false,
      volume4dEnabled: false,
    },
    recommendedDepthCm: 10,
    maneuverBullets: [
      'Advance the ICE catheter 3–4 cm superior to the IVC-RA Eustachian ridge into the central Mid-Right Atrium (s = 0 mm).',
      'Return both Anterior/Posterior (A/P = 0°) and Left/Right (L/R = 0°) deflection thumbwheels to strict mechanical Neutral.',
      'Rotate the catheter handle to the 0° baseline azimuth so the side-firing transducer points anteriorly and slightly leftward across the Tricuspid Valve orifice.',
      'Verify that the Tricuspid Valve Anterior and Septal leaflets coapt in the mid-field (9–3 o\'clock) with the Aortic Root (NCC/RCC) in oblique axis superiorly at 1–3 o\'clock.',
    ],
    sectorAnatomy: {
      nearFieldApex: 'Mid-Right Atrial blood pool (0–2.5 cm depth at 12 o\'clock).',
      midField: 'Tricuspid Valve Anterior (8–10 o\'clock) and Septal (1–2 o\'clock) leaflets; Aortic Valve Non-Coronary Cusp (NCC at 1–2 o\'clock) and Right Coronary Cusp (RCC at 2–3 o\'clock).',
      farField: 'Trabeculated Right Ventricular (RV) inflow cavity (5–8 o\'clock), Moderator Band, and RV Outflow Tract (RVOT) anteriorly at 3–5 o\'clock.',
      distalRightEdge: 'Superior RA wall, Aortic Root ascending wedge, and supraventricular crest / RVOT (3 o\'clock).',
      proximalLeftEdge: 'Inferior RA floor, Cavotricuspid Isthmus (CTI), and Eustachian ridge (9 o\'clock).',
    },
    expectedStructureIds: [
      StructureId.RA_CAVITY,
      StructureId.TRICUSPID_VALVE_ANT,
      StructureId.TRICUSPID_VALVE_SEPT,
      StructureId.RV_CAVITY,
      StructureId.AORTIC_VALVE_NCC,
      StructureId.AORTIC_VALVE_RCC,
    ],
    clinicalPurpose:
      'Universal spatial anchor and reset position for all intracardiac echocardiography maneuvers; evaluates baseline tricuspid valve competence, RV inflow contractility, and anterior pericardial space.',
    fellowPearlsAndPitfalls: [
      'Pearl — Universal Reset Rule: Whenever 3D spatial orientation becomes ambiguous during complex LA or RV mapping, neutralize both deflection knobs (A/P = 0°, L/R = 0°) and return to Home View before initiating the next maneuver.',
      'Pearl — The Aortic Root Rosetta Stone: Note how the Non-Coronary Cusp (NCC) sits directly adjacent to the anterior interatrial septum at 1–2 o\'clock—this landmark anchors both His bundle localization and safe transseptal puncture.',
      'Pitfall — Excessive Cranial Advancement: If only the Aortic Root and RAA appear at 9–12 o\'clock and the Tricuspid Valve shifts off-screen toward 8 o\'clock, the catheter is too high in the RA; withdraw 10–15 mm.',
    ],
    literatureCitations: ['enriquez_2018', 'razminia_2022', 'haloot_2026'],
  },
  {
    id: 'zf_03',
    number: 3,
    track: 'zero_fluoro_ablation',
    title: 'Anterior / His Bundle, Membranous Septum & Triangle of Koch View',
    shortTitle: '03. His Bundle & Triangle of Koch',
    recommendedCatheter: 'either',
    startingViewId: 'zf_02',
    targetState: {
      model: 'soundstar_10f',
      station: 'ra_venous',
      sMm: -4,
      torqueDeg: 16,
      apDeg: 10,
      lrDeg: 0,
      omniDeg: 0,
      biplaneEnabled: false,
      volume4dEnabled: false,
    },
    recommendedDepthCm: 9,
    maneuverBullets: [
      'Start from the Mid-RA Home View (zf_02) with the Tricuspid Valve and Aortic Root visible.',
      'Withdraw the catheter shaft slightly (-4 mm) toward the low-to-mid septal Right Atrium.',
      'Apply +16° Clockwise (CW) torque to rotate the imaging plane medially toward the apex of the Triangle of Koch and the central fibrous body.',
      'Add +10° gentle Anterior (A) deflection to profile the Septal Tricuspid Leaflet hinge point inserting onto the Membranous Septum directly beneath the Aortic Non-Coronary Cusp (NCC).',
    ],
    sectorAnatomy: {
      nearFieldApex: 'Low-to-mid septal Right Atrium and Triangle of Koch endocardium (12 o\'clock).',
      midField: 'Penetrating His Bundle and Atrioventricular Membranous Septum (center, 1–3 o\'clock); Septal Tricuspid Leaflet hinge (7–10 o\'clock); Aortic Valve NCC (1–2 o\'clock) and RCC (2–3 o\'clock).',
      farField: 'Crest of the muscular Interventricular Septum (5–7 o\'clock) and Left Ventricular Outflow Tract (LVOT) beneath the Aortic Valve (3–5 o\'clock).',
      distalRightEdge: 'Aortic Root (NCC/RCC) and ascending aortic sinotubular junction (3 o\'clock).',
      proximalLeftEdge: 'Posterior Triangle of Koch sloping inferiorly toward the Coronary Sinus ostium (9 o\'clock).',
    },
    expectedStructureIds: [
      StructureId.RA_CAVITY,
      StructureId.TRIANGLE_OF_KOCH_HIS,
      StructureId.TRICUSPID_VALVE_SEPT,
      StructureId.AORTIC_VALVE_NCC,
      StructureId.AORTIC_VALVE_RCC,
      StructureId.LV_CAVITY_AND_IVS,
    ],
    clinicalPurpose:
      'Enables zero-fluoroscopy 3D CARTOSOUND tagging of the compact AV node and penetrating His bundle prior to catheter manipulation, and guides parahisian PVC/VT/AT and slow-pathway AVNRT ablation.',
    fellowPearlsAndPitfalls: [
      'Pearl — Anatomical His Tagging Before Mapping: Tagging the junction of the NCC nadir and Membranous Septum on CARTOSOUND defines the exact His bundle hazard zone before advancing any mapping or ablation catheter into the heart.',
      'Pearl — Sub-Leaflet Parahisian Shielding: Because the Septal Tricuspid Leaflet inserts 7 mm apical to the Mitral Valve, tucking a retroflexed ablation catheter underneath the Septal TV leaflet shields the compact AV node during parahisian PVC ablation.',
      'Pitfall — NCC Ablation Proximity: When ablating atrial tachycardias or PVCs inside the Non-Coronary Cusp (1–2 o\'clock), the penetrating His bundle lies immediately inferior on the membranous septum; monitor junctional rhythm continuously.',
    ],
    literatureCitations: ['enriquez_2018', 'razminia_2022', 'kautzner_2021'],
  },
  {
    id: 'zf_04',
    number: 4,
    track: 'zero_fluoro_ablation',
    title: 'Anterior Flexion / Cavotricuspid Isthmus (CTI) & Eustachian Ridge View',
    shortTitle: '04. CTI & Eustachian Ridge',
    recommendedCatheter: 'either',
    startingViewId: 'zf_02',
    targetState: {
      model: 'soundstar_10f',
      station: 'ra_venous',
      sMm: -14,
      torqueDeg: -5,
      apDeg: 28,
      lrDeg: 0,
      omniDeg: 0,
      biplaneEnabled: false,
      volume4dEnabled: false,
    },
    recommendedDepthCm: 8,
    maneuverBullets: [
      'From the Mid-RA Home View (zf_02), withdraw the ICE catheter 1.4 cm (-14 mm) into the lower Right Atrium just above the IVC orifice.',
      'Apply +28° Anterior (A) deflection so the distal tip curls forward toward the transducer face, aiming the ultrasound sector inferiorly and anteriorly at the floor of the Right Atrium.',
      'Maintain near-neutral to slight Counterclockwise torque (-5°) to align with the central 6 o\'clock Cavotricuspid Isthmus (CTI) ablation line.',
      'Sweep +/-15° CW (septal isthmus near CS) and CCW (lateral trabeculated isthmus) to evaluate Sub-Eustachian pouches (Pouch of Keith), Eustachian ridge height, and Right Coronary Artery proximity.',
    ],
    sectorAnatomy: {
      nearFieldApex: 'Low Right Atrial blood pool immediately above the IVC-RA junction (12 o\'clock).',
      midField: 'Eustachian Valve/Ridge at 8–10 o\'clock; Sub-Eustachian Pouch of Keith at 6–8 o\'clock; central Cavotricuspid Isthmus (CTI) floor at 5–7 o\'clock; Inferior/Posterior Tricuspid Valve hinge at 2–4 o\'clock.',
      farField: 'Right Coronary Artery (RCA) in circular cross-section within the echogenic right AV groove fat pad (2–4 o\'clock) and inferior RV wall / diaphragmatic pericardium (5–7 o\'clock).',
      distalRightEdge: 'Inferior Tricuspid Valve annulus, Anterior/Posterior TV leaflets, and RV inflow cavity (3 o\'clock).',
      proximalLeftEdge: 'Prominent Eustachian Ridge and anterior suprahepatic IVC rim (9 o\'clock).',
    },
    expectedStructureIds: [
      StructureId.RA_CAVITY,
      StructureId.EUSTACHIAN_RIDGE,
      StructureId.CTI_FLOOR,
      StructureId.TRICUSPID_VALVE_ANT,
      StructureId.TRICUSPID_VALVE_POST,
      StructureId.CORONARY_ARTERIES_LMCA_RCA_LCX,
    ],
    clinicalPurpose:
      'Provides continuous real-time lesion-by-lesion visualization for Zero-Fluoroscopy Typical Cavotricuspid Isthmus (CTI) Atrial Flutter Ablation, unmasking anatomical pouches and ridges invisible on 3D electroanatomical maps.',
    fellowPearlsAndPitfalls: [
      'Pearl — Overcoming the Pouch of Keith: Over 65% of persistent CTI conduction gaps occur inside a deep Sub-Eustachian Pouch (6–8 o\'clock) where a straight catheter drag bridges over the recess without touching the floor.',
      'Pearl — Hooking a Tall Eustachian Ridge: When a prominent fibromuscular Eustachian Ridge (> 6 mm tall at 8–9 o\'clock) blocks proximal catheter pullback, ICE guides a retroflexed "hook" curve over the ridge crest to complete bidirectional block at the IVC edge.',
      'Pitfall — Right Coronary Artery Thermal Injury: On lateral CTI lines (CCW rotation), the RCA (visible in cross-section at 3 o\'clock) can run within 2.5 mm of the endocardium; ICE measures exact tissue thickness before RF delivery.',
    ],
    literatureCitations: ['enriquez_2018', 'razminia_2017', 'razminia_2022'],
  },
  {
    id: 'zf_05',
    number: 5,
    track: 'zero_fluoro_ablation',
    title: 'Right Atrial Appendage (RAA), Lateral RA & Crista Terminalis View',
    shortTitle: '05. RAA & Crista Terminalis',
    recommendedCatheter: 'either',
    startingViewId: 'zf_02',
    targetState: {
      model: 'soundstar_10f',
      station: 'ra_venous',
      sMm: 8,
      torqueDeg: -45,
      apDeg: 5,
      lrDeg: 0,
      omniDeg: 0,
      biplaneEnabled: false,
      volume4dEnabled: false,
    },
    recommendedDepthCm: 9,
    maneuverBullets: [
      'Start from the Mid-RA Home View (zf_02) and advance the catheter shaft +8 mm into the mid-to-upper Right Atrium.',
      'Apply -45° Counterclockwise (CCW) torque to sweep the ultrasound beam anteriorly and rightward toward the lateral RA wall and Right Atrial Appendage (RAA).',
      'Apply +5° slight Anterior deflection to open the triangular RAA ear, comb-like pectinate muscle bundles, and the C-shaped Crista Terminalis ridge.',
      'Observe the prominent nodular Crista Terminalis at 1–2 o\'clock separating the smooth posterior sinus venarum from the heavily trabeculated RAA anteriorly.',
    ],
    sectorAnatomy: {
      nearFieldApex: 'Smooth-walled posterior Right Atrium / sinus venarum (12 o\'clock).',
      midField: 'Crista Terminalis fibromuscular ridge (1–2 o\'clock superiorly and 8–9 o\'clock inferiorly); Right Atrial Appendage (RAA) cavity packed with comb-like pectinate muscles (2–5 o\'clock).',
      farField: 'Lateral Tricuspid Valve annulus (6–8 o\'clock), Right Coronary Artery in the lateral AV groove, and anterior pericardial space.',
      distalRightEdge: 'Superior RAA apex and upper Crista Terminalis near the Sinoatrial (SA) Node region (3 o\'clock).',
      proximalLeftEdge: 'Inferolateral RA wall and lateral Cavotricuspid Isthmus (9 o\'clock).',
    },
    expectedStructureIds: [
      StructureId.RA_CAVITY,
      StructureId.RAA_PECTINATES,
      StructureId.CRISTA_TERMINALIS,
      StructureId.TRICUSPID_VALVE_ANT,
    ],
    clinicalPurpose:
      'Guides zero-fluoroscopy ablation of Focal Atrial Tachycardias (AT) along the Crista Terminalis and RAA pectinate muscles, as well as Right Free-Wall Accessory Pathways along the lateral Tricuspid annulus.',
    fellowPearlsAndPitfalls: [
      'Pitfall — Paper-Thin Inter-Pectinate Crevices: While RAA pectinate ridges are 2–3 mm thick, the myocardial wall in the recesses between pectinates is < 0.8 mm thick. ICE prevents catheter tip entrapment and steam-pop perforation inside deep RAA crevices.',
      'Pearl — Stabilizing Lateral Tricuspid Accessory Pathways: Lateral TV pathways are notoriously unstable; parking ICE in this CCW view visualizes the exact lateral TV leaflet hinge at 6–7 o\'clock and guides steerable sheath contact above or below the valve.',
      'Pearl — Distinguishing Crista Terminalis from RAA Thrombus: The prominent nodular cross-section of the Crista Terminalis at 1–2 o\'clock is a normal anatomical landmark that should never be mistaken for an atrial mass.',
    ],
    literatureCitations: ['enriquez_2018', 'razminia_2022', 'haloot_2026'],
  },
  {
    id: 'zf_06',
    number: 6,
    track: 'zero_fluoro_ablation',
    title: 'RV Inflow, Moderator Band & RV Papillary Muscles View',
    shortTitle: '06. RV Inflow & Moderator Band',
    recommendedCatheter: 'either',
    startingViewId: 'zf_02',
    targetState: {
      model: 'soundstar_10f',
      station: 'rv_outflow',
      sMm: 18,
      torqueDeg: -15,
      apDeg: 10,
      lrDeg: 0,
      omniDeg: 0,
      biplaneEnabled: false,
      volume4dEnabled: false,
    },
    recommendedDepthCm: 10,
    maneuverBullets: [
      'From the Mid-RA Home View (zf_02), confirm a clear corridor across the Tricuspid Valve free of pacing/ICD leads.',
      'Apply +30° to +40° Anterior (A) deflection so the catheter tip bends forward toward the Tricuspid orifice (placing the RV inflow cavity at 3 o\'clock).',
      'Advance the catheter shaft +18 mm across the Tricuspid Valve into the basal-to-mid Right Ventricle (rv_outflow station).',
      'Partially release Anterior deflection back to +10° and apply -15° slight Counterclockwise (CCW) torque to profile the RV cavity, Moderator Band (septomarginal trabecula), and Anterior/Septal RV Papillary Muscles.',
    ],
    sectorAnatomy: {
      nearFieldApex: 'Basal-to-mid Right Ventricular inflow blood pool (12 o\'clock).',
      midField: 'Moderator Band (Septomarginal Trabecula) bridging from the lower Interventricular Septum (2–4 o\'clock) to the Anterior RV Papillary Muscle base (6–8 o\'clock); Septal & Posterior RV papillary muscles.',
      farField: 'Coarse apical RV trabeculae carneae, anterior RV free wall, and anterior/diaphragmatic pericardial space (5–7 o\'clock).',
      distalRightEdge: 'Apical-septal RV cavity and muscular Interventricular Septum (3 o\'clock).',
      proximalLeftEdge: 'Tricuspid Valve chordae tendineae and inferior RV inflow floor behind the transducer (9 o\'clock).',
    },
    expectedStructureIds: [
      StructureId.RV_CAVITY,
      StructureId.MODERATOR_BAND,
      StructureId.RV_PAPILLARY_MUSCLES,
      StructureId.LV_CAVITY_AND_IVS,
    ],
    clinicalPurpose:
      'Essential for Zero-Fluoroscopy Moderator Band PVC / Purkinje-Triggered VF Ablation and Right Ventricular Papillary Muscle PVC/VT Ablation.',
    fellowPearlsAndPitfalls: [
      'Pearl — Why 3D Fast Anatomical Mapping Needs ICE in the RV: The Moderator Band is a free-standing cylindrical muscular bridge surrounded by blood on all sides; only ICE / CARTOSOUND can distinguish whether the ablation tip is on the septal insertion, mid-span body, or anterior papillary insertion.',
      'Pitfall — Tricuspid Chordal Entrapment on Withdrawal: Never pull a heavily flexed or torqued ICE catheter straight back from the RV into the RA; always return A/P and L/R knobs to Neutral (0°) before gentle withdrawal across the Tricuspid Valve.',
      'Pearl — Right Bundle Branch Block Monitoring: Because the Right Bundle Branch courses directly through the Moderator Band from the IVS to the anterior papillary muscle, ICE helps titrate lesion depth cleanly along the arrhythmogenic Purkinje arborization.',
    ],
    literatureCitations: ['enriquez_2018', 'kautzner_2021', 'razminia_2022'],
  },
  {
    id: 'zf_07',
    number: 7,
    track: 'zero_fluoro_ablation',
    title: 'Interventricular Septum (IVS), LV Cavity & Pericardial Effusion Screening View',
    shortTitle: '07. IVS, LV & Pericardial Sweep',
    recommendedCatheter: 'either',
    startingViewId: 'zf_06',
    targetState: {
      model: 'soundstar_10f',
      station: 'rv_outflow',
      sMm: 22,
      torqueDeg: 38,
      apDeg: 0,
      lrDeg: 0,
      omniDeg: 0,
      biplaneEnabled: false,
      volume4dEnabled: false,
    },
    recommendedDepthCm: 14,
    maneuverBullets: [
      'With the ICE catheter positioned in the mid-Right Ventricle (zf_06), release A/P and L/R deflection knobs completely to Neutral (0°).',
      'Advance slightly (+22 mm) and apply +38° Clockwise (CW) torque to rotate the side-firing transducer medially and posteriorly toward the Interventricular Septum (IVS).',
      'Increase console Penetration Depth to 14 cm so the ultrasound sector encompasses the RV near-field, the thick Muscular IVS, the entire Left Ventricular (LV) cavity, and the dependent posterolateral pericardial space in the far-field.',
    ],
    sectorAnatomy: {
      nearFieldApex: 'Right Ventricular cavity and right-sided endocardium of the Interventricular Septum (12 o\'clock).',
      midField: 'Thick Muscular & Membranous Interventricular Septum (IVS, 10–11 mm thick) spanning from 9–10 o\'clock to 2–3 o\'clock; circular-to-oval Left Ventricular (LV) cavity in the center (3–9 o\'clock).',
      farField: 'Inferolateral and anterolateral LV myocardium (6–8 o\'clock) bordered by the bright echogenic parietal Pericardial Sac (dependent posterolateral pericardial recess).',
      distalRightEdge: 'Apical/anterior LV septum and transition toward the LV outflow tract (3 o\'clock).',
      proximalLeftEdge: 'Basal IVS and inferoposterior LV wall (9 o\'clock).',
    },
    expectedStructureIds: [
      StructureId.RV_CAVITY,
      StructureId.LV_CAVITY_AND_IVS,
      StructureId.LV_PAPILLARY_AL_PM,
      StructureId.PERICARDIAL_SPACE,
    ],
    clinicalPurpose:
      'Gold-standard baseline and intraprocedural Pericardial Effusion / Tamponade Screening view, and primary cross-sectional monitor for Intramural Septal VT Ablation and global LV systolic function.',
    fellowPearlsAndPitfalls: [
      'Pearl — #1 Most Sensitive Pericardial Effusion Station: In a supine patient, gravity pools free pericardial fluid posteriorly behind the inferolateral LV wall (5–8 o\'clock far-field). This view detects as little as 10–20 mL of effusion long before arterial hypotension occurs.',
      'Pearl — Steam-Pop Prevention During Septal VT Ablation: When ablating deep intramural septal VT (unipolar or bipolar RF), watch the mid-myocardial IVS at 12–2 o\'clock continuously; sudden explosive tissue hyperechogenicity (microbubble clouds) mandates immediate RF termination before a steam pop occurs.',
      'Pitfall — Inadequate Depth Setting: Leaving console depth at 8–9 cm clips off the posterior LV wall and misses early posterolateral pericardial fluid; always expand depth to 13–15 cm during the baseline pericardial check.',
    ],
    literatureCitations: ['enriquez_2018', 'kautzner_2021', 'zei_2020'],
  },
  {
    id: 'zf_08',
    number: 8,
    track: 'zero_fluoro_ablation',
    title: 'LV Papillary Muscles (Posteromedial & Anterolateral) Short-Axis View',
    shortTitle: '08. LV Papillary Muscles (PM/AL)',
    recommendedCatheter: 'either',
    startingViewId: 'zf_07',
    targetState: {
      model: 'soundstar_10f',
      station: 'rv_outflow',
      sMm: 24,
      torqueDeg: 48,
      apDeg: -8,
      lrDeg: 10,
      omniDeg: 0,
      biplaneEnabled: false,
      volume4dEnabled: false,
    },
    recommendedDepthCm: 13,
    maneuverBullets: [
      'Start from the RV-to-LV Interventricular Septal View (zf_07) with console depth set to 13 cm.',
      'Apply +48° Clockwise (CW) torque combined with -8° slight Posterior (P) tilt and +10° Left (L) deflection to slice the mid-Left Ventricle in short-axis across both papillary muscle bellies.',
      'Rotate slightly CCW (~+38° CW total) to bring the Posteromedial (PM) Papillary Muscle into sharp profile along the inferoseptal wall at 7–8 o\'clock.',
      'Rotate slightly more CW (~+55° CW total) to profile the Anterolateral (AL) Papillary Muscle along the anterolateral LV wall at 4–5 o\'clock, using L/R tilt to trace each muscle from base to chordal tip.',
    ],
    sectorAnatomy: {
      nearFieldApex: 'Mid-RV cavity and right ventricular surface of the muscular Interventricular Septum (12 o\'clock).',
      midField: 'Mid-Left Ventricular cavity, mitral chordae tendineae, and LV false tendons.',
      farField: 'Posteromedial (PM) LV Papillary Muscle at 7–8 o\'clock (inferoposterior wall, often bifid) and Anterolateral (AL) LV Papillary Muscle at 4–5 o\'clock (anterolateral wall).',
      distalRightEdge: 'Anterolateral LV free wall and anterior papillary muscle head (3–5 o\'clock).',
      proximalLeftEdge: 'Inferoseptal/inferior LV wall and posteromedial papillary muscle base (7–9 o\'clock).',
    },
    expectedStructureIds: [
      StructureId.RV_CAVITY,
      StructureId.LV_CAVITY_AND_IVS,
      StructureId.LV_PAPILLARY_AL_PM,
    ],
    clinicalPurpose:
      'Indispensable for Zero-Fluoroscopy LV Papillary Muscle PVC and VT Ablation, providing 3D CARTOSOUND shell segmentation of both papillary heads and real-time verification of catheter-tissue contact.',
    fellowPearlsAndPitfalls: [
      'Pearl — Why Papillary Muscle Ablation Fails Without ICE: Vigorous systolic contraction causes ablation catheters to slide off the papillary muscle body into the LV cavity. ICE confirms whether the catheter tip remains wedged against the specific arrhythmogenic head throughout systole.',
      'Pitfall — Chordal Rupture & Acute Mitral Regurgitation: Avoid high-power RF delivery directly on the fibrous papillary apex (tip) where primary chordae tendineae insert; use ICE to target the muscular body or base/trough of the papillary muscle.',
      'Pearl — Route Selection (Transseptal vs. Retrograde Aortic): The Posteromedial (PM) papillary muscle (7–8 o\'clock) is typically stabilized best via a transseptal steerable sheath, whereas the Anterolateral (AL) papillary muscle (4–5 o\'clock) often favors a retrograde aortic loop.',
    ],
    literatureCitations: ['enriquez_2018', 'kautzner_2021', 'razminia_2022'],
  },
  {
    id: 'zf_09',
    number: 9,
    track: 'zero_fluoro_ablation',
    title: 'Mitral Valve Short-Axis ("Fish-Mouth") View from Basal RV',
    shortTitle: '09. Mitral Valve "Fish-Mouth"',
    recommendedCatheter: 'either',
    startingViewId: 'zf_08',
    targetState: {
      model: 'soundstar_10f',
      station: 'rv_outflow',
      sMm: 14,
      torqueDeg: 58,
      apDeg: -10,
      lrDeg: 12,
      omniDeg: 0,
      biplaneEnabled: false,
      volume4dEnabled: false,
    },
    recommendedDepthCm: 12,
    maneuverBullets: [
      'From the Mid-RV LV Papillary Muscle View (zf_08), withdraw the ICE catheter 1.0 cm (to s = +14 mm) toward the basal Right Ventricle.',
      'Increase Clockwise torque to +58° while maintaining -10° Posterior (P) deflection and +12° Left (L) deflection.',
      'This sweeps the short-axis imaging plane basally from the papillary muscle bellies up to the Mitral Valve orifice, revealing the classic diastolic "Fish-Mouth" view of the Anterior (A1–A3) and Posterior (P1–P3) mitral scallops.',
    ],
    sectorAnatomy: {
      nearFieldApex: 'Basal Right Ventricular cavity and basal Interventricular Septum (12 o\'clock).',
      midField: 'Anterior Mitral Valve Leaflet (AML scallops A1, A2, A3) spanning 2–5 o\'clock closest to the septum/LVOT; Posterior Mitral Valve Leaflet (PML scallops P1 at 4–5 o\'clock, P2 at 6–7 o\'clock, P3 at 7–9 o\'clock).',
      farField: 'Posterior/lateral Mitral Annulus, Coronary Sinus / Great Cardiac Vein in the posterior AV groove, and basal posterolateral pericardium (6–8 o\'clock).',
      distalRightEdge: 'Anterolateral Mitral Commissure (A1/P1) and Aortomitral Continuity (3–4 o\'clock).',
      proximalLeftEdge: 'Posteromedial Mitral Commissure (A3/P3) and inferoseptal LV base (8–9 o\'clock).',
    },
    expectedStructureIds: [
      StructureId.RV_CAVITY,
      StructureId.MITRAL_VALVE_AML_PML,
      StructureId.LV_CAVITY_AND_IVS,
    ],
    clinicalPurpose:
      'Guides Left Free-Wall Accessory Pathway (WPW) Ablation, Mitral Annular PVC/VT Ablation (including Aortomitral Continuity), and Lateral Mitral Isthmus Line ablation.',
    fellowPearlsAndPitfalls: [
      'Pearl — Sub-Valvular vs. Supra-Valvular Accessory Pathway Contact: Instantly differentiates whether an ablation catheter targeting a left lateral accessory pathway is tucked underneath the PML on the ventricular aspect or perched on the atrial side of the mitral annulus.',
      'Pearl — Aortomitral Continuity (AMC) PVC Mapping: At 2–3 o\'clock, the fibrous continuity between the Anterior Mitral Leaflet (A1/A2) and the Left/Non-Coronary Aortic Cusps is clearly delineated for AMC arrhythmia ablation.',
      'Pitfall — Circumflex Artery Proximity at P1/A1: During lateral mitral isthmus ablation near the anterolateral commissure (4–5 o\'clock), the Left Circumflex Artery and Great Cardiac Vein lie immediately epicardial to the annulus.',
    ],
    literatureCitations: ['enriquez_2018', 'razminia_2022', 'kautzner_2021'],
  },
  {
    id: 'zf_10',
    number: 10,
    track: 'zero_fluoro_ablation',
    title: 'LVOT, Aortic Valve Short-Axis ("Mercedes-Benz") & Coronary Ostia View',
    shortTitle: '10. Aortic Cusps & Coronary Ostia',
    recommendedCatheter: 'either',
    startingViewId: 'zf_09',
    targetState: {
      model: 'soundstar_10f',
      station: 'rv_outflow',
      sMm: 34,
      torqueDeg: 68,
      apDeg: -12,
      lrDeg: 15,
      omniDeg: 0,
      biplaneEnabled: false,
      volume4dEnabled: false,
    },
    recommendedDepthCm: 10,
    maneuverBullets: [
      'From the Basal RV Mitral View (zf_09), advance the catheter +20 mm (to s = +34 mm) into the sub-infundibular RVOT transition zone.',
      'Apply +68° Clockwise (CW) torque with -12° Posterior (P) deflection and +15° Left (L) deflection so the beam cuts orthogonally through the Aortic Root (Sinuses of Valsalva).',
      'Identify all three semilunar cusps forming the diastolic "Mercedes-Benz" star: Right Coronary Cusp (RCC) at 12–3 o\'clock, Left Coronary Cusp (LCC) at 4–6 o\'clock, and Non-Coronary Cusp (NCC) at 7–11 o\'clock.',
      'Tilt slightly superiorly (5–8 mm above the cusp nadirs) and activate Color Doppler to visualize the Left Main Coronary Artery (LMCA) ostium exiting the LCC at 4–5 o\'clock and the Right Coronary Artery (RCA) ostium exiting the RCC at 1–2 o\'clock.',
    ],
    sectorAnatomy: {
      nearFieldApex: 'Posterior RVOT wall / crista supraventricularis directly abutting the anterior Aortic Root (12 o\'clock).',
      midField: 'Trileaflet Aortic Valve ("Mercedes-Benz" sign): RCC (12–3 o\'clock near-field), LCC (4–6 o\'clock distal-far field), NCC (7–11 o\'clock proximal-septal field), and RCC–LCC interleaflet commissure (3–4 o\'clock).',
      farField: 'Left Main Coronary Artery (LMCA) ostium at 4–5 o\'clock bifurcating into LAD and LCx; Left Atrium and LAA medial border behind the LCC/NCC (6–8 o\'clock).',
      distalRightEdge: 'RCC–LCC commissure, LV Summit epicardial fat triangle, and proximal LAD course (3–4 o\'clock).',
      proximalLeftEdge: 'Non-Coronary Cusp (NCC) abutting the anterior Interatrial Septum and Right Atrium (8–10 o\'clock).',
    },
    expectedStructureIds: [
      StructureId.RVOT_INFUNDIBULUM,
      StructureId.AORTIC_VALVE_NCC,
      StructureId.AORTIC_VALVE_RCC,
      StructureId.AORTIC_VALVE_LCC,
      StructureId.ASCENDING_AORTA_ROOT,
      StructureId.CORONARY_ARTERIES_LMCA_RCA_LCX,
    ],
    clinicalPurpose:
      'Completely replaces invasive X-ray coronary angiography during Zero-Fluoroscopy Aortic Sinus Cusp (LCC, RCC, NCC, RCC-LCC Commissure) and LV Summit PVC/VT Ablation.',
    fellowPearlsAndPitfalls: [
      'Pearl — Zero-Contrast Coronary Ostia Safety Verification (>= 5–10 mm Rule): Before delivering RF in the LCC or RCC, ICE visualizes both the ablation catheter tip inside the cusp AND the LMCA ostium (4–5 o\'clock) or RCA ostium (1–2 o\'clock) in the same real-time frame.',
      'Pearl — Targeting the RCC–LCC Commissure: Many outflow tract PVCs arise at the RCC–LCC interleaflet triangle (3–4 o\'clock); ICE confirms whether the catheter tip is seated above the leaflet hinge inside the sinus or below the valve in the LVOT.',
      'Pitfall — Coronary Thermal Occlusion: Never ablate inside the Left Coronary Cusp without first confirming on 2D + Color Doppler that the ablation electrode is at least 5–10 mm inferior/posterior to the LMCA ostium.',
    ],
    literatureCitations: ['enriquez_2018', 'razminia_2022', 'kautzner_2021'],
  },
  {
    id: 'zf_11',
    number: 11,
    track: 'zero_fluoro_ablation',
    title: 'RVOT Infundibulum & Pulmonic Valve Cusps View',
    shortTitle: '11. RVOT & Pulmonic Valve Cusps',
    recommendedCatheter: 'either',
    startingViewId: 'zf_10',
    targetState: {
      model: 'soundstar_10f',
      station: 'rv_outflow',
      sMm: 48,
      torqueDeg: 82,
      apDeg: -15,
      lrDeg: 20,
      omniDeg: 0,
      biplaneEnabled: false,
      volume4dEnabled: false,
    },
    recommendedDepthCm: 10,
    maneuverBullets: [
      'From the Basal RV Aortic Short-Axis View (zf_10), advance the catheter +14 mm higher (to s = +48 mm) into the muscular RVOT infundibulum.',
      'Increase Clockwise torque to +82° with -15° Posterior (P) deflection and +20° Left (L) deflection to align the ultrasound fan longitudinally along the RVOT-to-Main Pulmonary Artery axis.',
      'Identify the muscular infundibular conus septum (7–10 o\'clock), the three Pulmonic Valve cusps (Anterior, Left, and Right Cusps at 3–5 o\'clock), and the Main Pulmonary Artery bifurcation.',
      'Locate the Left Anterior Descending (LAD) coronary artery in cross-section immediately posterior to the Left Pulmonic Cusp at 5–6 o\'clock.',
    ],
    sectorAnatomy: {
      nearFieldApex: 'Anterior RVOT lumen and free-wall infundibular myocardium (12 o\'clock).',
      midField: 'Posterior/Septal RVOT muscular conus (7–10 o\'clock); Pulmonic Valve leaflets and supravalvular pulmonary sinuses (AC, LC, RC at 3–5 o\'clock).',
      farField: 'Main Pulmonary Artery (MPA) bifurcating into LPA and RPA (2–4 o\'clock); Aortic Root and Left Anterior Descending (LAD) artery immediately behind the Left Pulmonic Cusp (5–7 o\'clock).',
      distalRightEdge: 'Supravalvular Main Pulmonary Artery trunk and LPA/RPA bifurcation (3 o\'clock).',
      proximalLeftEdge: 'Sub-valvular muscular RVOT and crista supraventricularis (9 o\'clock).',
    },
    expectedStructureIds: [
      StructureId.RVOT_INFUNDIBULUM,
      StructureId.PULMONIC_VALVE,
      StructureId.MAIN_PA_LPA_RPA,
      StructureId.ASCENDING_AORTA_ROOT,
      StructureId.CORONARY_ARTERIES_LMCA_RCA_LCX,
    ],
    clinicalPurpose:
      'Guides Zero-Fluoroscopy Idiopathic RVOT and Supravalvular Pulmonary Sinus Cusp (AC, LC, RC) PVC/VT Ablation while protecting the Left Main and LAD coronary arteries.',
    fellowPearlsAndPitfalls: [
      'Pearl — Supravalvular Pulmonary Cusp Myocardial Sleeves: Up to 25% of "RVOT" PVCs originate from myocardial extensions above the pulmonic valve inside the pulmonary cusps. ICE is the only real-time tool that defines the pulmonic leaflet hinge line and guides a reversed-U ("hooked") catheter into the target cusp.',
      'Pitfall — LAD Coronary Injury Behind the Left Pulmonic Cusp: The LAD runs in the anterior interventricular groove just 2–5 mm posterior to the Left Pulmonic Cusp (5–6 o\'clock); always verify LAD standoff on ICE before ablating.',
      'Pearl — Free-Wall vs. Septal RVOT Differentiation: In the RVOT, 3D mapping orientation can be deceptive; ICE immediately confirms whether the ablation tip is contacting the thick posterior conus septum (safe) or the thin anterior RVOT free wall (perforation risk).',
    ],
    literatureCitations: ['enriquez_2018', 'kautzner_2021', 'razminia_2022'],
  },
  {
    id: 'zf_12',
    number: 12,
    track: 'zero_fluoro_ablation',
    title: 'Coronary Sinus (CS) Ostium & Thebesian Valve View',
    shortTitle: '12. CS Ostium & Thebesian Valve',
    recommendedCatheter: 'either',
    startingViewId: 'zf_02',
    targetState: {
      model: 'soundstar_10f',
      station: 'ra_venous',
      sMm: -8,
      torqueDeg: 45,
      apDeg: 8,
      lrDeg: 0,
      omniDeg: 0,
      biplaneEnabled: false,
      volume4dEnabled: false,
    },
    recommendedDepthCm: 9,
    maneuverBullets: [
      'Return the ICE catheter to the Mid-RA Home View (zf_02) and withdraw slightly (-8 mm) toward the posteroinferior Right Atrium.',
      'Apply +45° Clockwise (CW) torque from Home View, sweeping the beam posteriorly past the Tricuspid septal leaflet and His bundle.',
      'Add +8° gentle Anterior (A) tilt so the circular Coronary Sinus (CS) Ostium opens clearly at 6–7 o\'clock at the base of the Triangle of Koch, guarded posteriorly by the thin Thebesian Valve.',
    ],
    sectorAnatomy: {
      nearFieldApex: 'Low-to-mid Right Atrial blood pool (12 o\'clock).',
      midField: 'Coronary Sinus (CS) Ostium (10–12 mm teardrop opening at 6–7 o\'clock); fenestrated Thebesian Valve at 7–8 o\'clock; Eustachian Ridge / Tendon of Todaro at 8–9 o\'clock; Slow Pathway isthmus at 4–6 o\'clock.',
      farField: 'Proximal Coronary Sinus body coursing in the posterior left AV groove, Anterior Mitral Valve leaflet, and inferior Left Atrium (5–7 o\'clock).',
      distalRightEdge: 'Anterior/Inferior Fossa Ovalis and superior Triangle of Koch (2–3 o\'clock).',
      proximalLeftEdge: 'Eustachian Ridge and IVC-RA junction (8–9 o\'clock).',
    },
    expectedStructureIds: [
      StructureId.RA_CAVITY,
      StructureId.EUSTACHIAN_RIDGE,
      StructureId.CORONARY_SINUS_OSTIUM,
      StructureId.THEBESIAN_VALVE,
      StructureId.TRIANGLE_OF_KOCH_HIS,
      StructureId.MITRAL_VALVE_AML_PML,
    ],
    clinicalPurpose:
      'Guides Zero-Fluoroscopy Coronary Sinus decapolar catheter cannulation (bypassing obstructive Thebesian valves) and defines the exact anatomical boundaries for AVNRT Slow Pathway Ablation.',
    fellowPearlsAndPitfalls: [
      'Pearl — Overcoming an Obstructive Thebesian Valve: Present in >75% of hearts (and obstructive in ~10%), a prominent Thebesian valve fold at 7–8 o\'clock blocks inferior CS entry. ICE guides a superior-to-inferior catheter prolapse over the roof of the CS ostium.',
      'Pearl — Zero-Fluoro AVNRT Slow Pathway Zone: This view frames the exact slow pathway ablation corridor between the anterior roof of the CS ostium (6–7 o\'clock) and the Septal Tricuspid Annulus (4–5 o\'clock), well away from the compact AV node superiorly.',
      'Pitfall — Confusing CS Ostium with Sub-Eustachian Pouch: The CS ostium lies medial/superior to the Eustachian ridge and continues as a tubular vessel in the posterior AV groove, whereas the Sub-Eustachian pouch is a blind recess anterior/lateral to the ridge.',
    ],
    literatureCitations: ['enriquez_2018', 'razminia_2022', 'haloot_2026'],
  },
  {
    id: 'zf_13',
    number: 13,
    track: 'zero_fluoro_ablation',
    title: 'Interatrial Septum (IAS) & Fossa Ovalis (Transseptal Puncture) View',
    shortTitle: '13. Fossa Ovalis & IAS (TSP)',
    recommendedCatheter: 'either',
    startingViewId: 'zf_12',
    targetState: {
      model: 'soundstar_10f',
      station: 'ra_venous',
      sMm: 4,
      torqueDeg: 68,
      apDeg: -22,
      lrDeg: 0,
      omniDeg: 0,
      biplaneEnabled: false,
      volume4dEnabled: false,
    },
    recommendedDepthCm: 10,
    maneuverBullets: [
      'From the CS Ostium View (zf_12) or Home View (zf_02), position the catheter in the mid-Right Atrium (s = +4 mm) and apply +68° Clockwise (CW) torque.',
      'Apply -22° Posterior (P) deflection (bending the catheter tip backward away from the transducer face toward the posterolateral RA wall) and lock the tension brake.',
      'Observe how Posterior deflection tilts the ultrasound beam superiorly and creates a 2–3 cm RA standoff, centering the thin bilaminar Fossa Ovalis membrane horizontally between the thick Superior Limbus (2–3 o\'clock) and Inferior Limbus (8–9 o\'clock).',
      'Sweep +/-10° CCW (anterior check toward the Aortic Root) and CW (posterior check toward the Left PVs) to localize the transseptal needle tenting apex in both S-I and A-P axes.',
    ],
    sectorAnatomy: {
      nearFieldApex: 'Right Atrial cavity standoff created by Posterior catheter deflection (12 o\'clock).',
      midField: 'Thin (1.1 mm) translucent Fossa Ovalis membrane (septum primum) spanning 10–2 o\'clock; thick teardrop-shaped Superior Limbus (septum secundum) at 2–3 o\'clock; muscular Inferior Limbus at 8–9 o\'clock.',
      farField: 'Anechoic Left Atrial (LA) central body (4–8 cm depth) providing safe post-puncture needle/sheath run-out space.',
      distalRightEdge: 'Superior Limbus (septum secundum) and transition to the Superior Vena Cava (2–3 o\'clock).',
      proximalLeftEdge: 'Inferior muscular interatrial rim and Coronary Sinus / IVC transition (8–9 o\'clock).',
    },
    expectedStructureIds: [
      StructureId.RA_CAVITY,
      StructureId.FOSSA_OVALIS,
      StructureId.IAS_LIMBUS,
      StructureId.LA_CAVITY,
    ],
    clinicalPurpose:
      'Cornerstone view for 100% Zero-Fluoroscopy Transseptal Puncture (TSP), visualizing the double-jump pull-down from the SVC, Fossa Ovalis V-tenting, needle/RF wire crossing, and LA saline microbubbles.',
    fellowPearlsAndPitfalls: [
      'Pearl — Why Posterior (P) Tilt is Essential for TSP: Because the Fossa Ovalis slopes obliquely, an unbent catheter views the septum tangentially and crowds the transseptal sheath. Applying -22° Posterior deflection backs the ICE tip away from the septum and aims the acoustic beam perpendicular to the Fossa Ovalis.',
      'Pitfall — The Anterior "Aorta-Hugger" Puncture: Always perform a slight CCW check before advancing the needle; if the Aortic Root (NCC) appears directly behind the tented septum, the assembly is too anterior and risks aortic root perforation.',
      'Pitfall — Lipomatous Hypertrophy ("Dumbbell Septum"): Never puncture through the thick (>10–15 mm) echogenic Superior Limbus at 2–3 o\'clock; always drop into the paper-thin central membranous Fossa Ovalis.',
    ],
    literatureCitations: ['baykaner_2020', 'enriquez_2018', 'gianni_2021'],
  },
  {
    id: 'zf_14',
    number: 14,
    track: 'zero_fluoro_ablation',
    title: 'Left Atrial Appendage (LAA), Mitral Valve & Coumadin Ridge View from RA',
    shortTitle: '14. LAA, MV & Coumadin Ridge',
    recommendedCatheter: 'either',
    startingViewId: 'zf_13',
    targetState: {
      model: 'soundstar_10f',
      station: 'ra_venous',
      sMm: 6,
      torqueDeg: 78,
      apDeg: -16,
      lrDeg: 10,
      omniDeg: 0,
      biplaneEnabled: false,
      volume4dEnabled: false,
    },
    recommendedDepthCm: 11,
    maneuverBullets: [
      'Start from the Fossa Ovalis View (zf_13) in the mid-Right Atrium.',
      'Apply an additional +10° Clockwise torque (to +78° CW total from Home View) so the far-field beam sweeps across the Left Atrium toward its anterolateral wall.',
      'Adjust deflection to -16° Posterior (P) tilt and +10° Left (L) tilt to bring the Left Atrial Appendage (LAA) ostium, the bulbous Coumadin Ridge ("Q-tip sign"), the Left Circumflex Artery (LCx), and the Mitral Valve into the same plane.',
    ],
    sectorAnatomy: {
      nearFieldApex: 'Right Atrium and Interatrial Septum / Fossa Ovalis (12 o\'clock).',
      midField: 'Central Left Atrial cavity (3–7 cm depth).',
      farField: 'Left Atrial Appendage (LAA) ostium and trabeculated neck (3–5 o\'clock); bulbous Coumadin Ridge / Ligament of Marshall ("Q-tip sign" at 2–3 o\'clock); Left Circumflex Artery (LCx) in cross-section at 5 o\'clock; Mitral Valve leaflets at 6–8 o\'clock.',
      distalRightEdge: 'Coumadin Ridge tip (2–3 o\'clock) separating the LAA anteriorly from the LSPV ostium posteriorly (1–2 o\'clock).',
      proximalLeftEdge: 'Mitral Valve annulus, posterior AV groove, and LV inflow (7–9 o\'clock).',
    },
    expectedStructureIds: [
      StructureId.RA_CAVITY,
      StructureId.FOSSA_OVALIS,
      StructureId.LA_CAVITY,
      StructureId.LAA_OSTIUM_AND_LOBES,
      StructureId.COUMADIN_RIDGE,
      StructureId.MITRAL_VALVE_AML_PML,
      StructureId.CORONARY_ARTERIES_LMCA_RCA_LCX,
    ],
    clinicalPurpose:
      'Guides Anterior Left Wide-Area Circumferential Ablation (WACA) along the narrow Coumadin Ridge / Ligament of Marshall during AF ablation, and prevents inadvertent transseptal sheath advancement into the thin-walled LAA.',
    fellowPearlsAndPitfalls: [
      'Pearl — Stabilizing the Anterior Left WACA Line: The Coumadin Ridge (2–3 o\'clock) is only 3–6 mm wide; catheters frequently slip anteriorly into the LAA or posteriorly into the LSPV. Tracing the Coumadin Ridge in CARTOSOUND allows precise crest or PV-side lesion placement.',
      'Pitfall — Transseptal Wire Entering the LAA Instead of LSPV: After transseptal puncture, watch this view to confirm the guidewire passes posterior to the Coumadin Ridge into the LSPV (1–2 o\'clock) rather than anterior to the ridge into the fragile LAA (3–5 o\'clock).',
      'Pitfall — The "Q-Tip" Pseudo-Mass: The bulbous tip of the Coumadin Ridge (housing the Vein of Marshall and autonomic ganglia) is a normal structure that must not be confused with an LAA ostial thrombus.',
    ],
    literatureCitations: ['enriquez_2018', 'gianni_2021', 'zei_2020'],
  },
  {
    id: 'zf_15',
    number: 15,
    track: 'zero_fluoro_ablation',
    title: 'Left Pulmonary Veins (LSPV & LIPV) & Descending Thoracic Aorta View',
    shortTitle: '15. Left PVs (LSPV/LIPV) & Desc Ao',
    recommendedCatheter: 'either',
    startingViewId: 'zf_14',
    targetState: {
      model: 'soundstar_10f',
      station: 'ra_venous',
      sMm: 10,
      torqueDeg: 96,
      apDeg: -24,
      lrDeg: 8,
      omniDeg: 0,
      biplaneEnabled: false,
      volume4dEnabled: false,
    },
    recommendedDepthCm: 12,
    maneuverBullets: [
      'From the LAA / Coumadin Ridge View (zf_14), advance slightly (+10 mm) and apply +18° additional Clockwise torque (to +96° CW total from Home View).',
      'Maintain -24° Posterior (P) deflection with +8° Left (L) tilt and set console depth to 12 cm.',
      'As the ultrasound fan sweeps posteriorly past the Coumadin Ridge, both the Left Superior Pulmonary Vein (LSPV at 2–3:30) and Left Inferior Pulmonary Vein (LIPV at 4–5:30) open longitudinally, separated by the Left Intervenous Carina (3:30).',
      'Note the circular cross-section of the Descending Thoracic Aorta directly posterior to the LIPV ostium at 5:30–7 o\'clock.',
    ],
    sectorAnatomy: {
      nearFieldApex: 'Right Atrium and posterior Interatrial Septum (12 o\'clock).',
      midField: 'Left Atrial body and posterolateral left pulmonary venous antrum (4–8 cm depth).',
      farField: 'Left Superior Pulmonary Vein (LSPV) windsocking superiorly at 2–3:30; Left Intervenous Carina spur at 3:30–4 o\'clock; Left Inferior Pulmonary Vein (LIPV) at 4–5:30; circular Descending Thoracic Aorta posteriorly at 5:30–7 o\'clock.',
      distalRightEdge: 'Left Atrial roof and superior wall of the LSPV / Coumadin Ridge junction (2–3 o\'clock).',
      proximalLeftEdge: 'Inferior posterior LA wall and Coronary Sinus below the LIPV (8–9 o\'clock).',
    },
    expectedStructureIds: [
      StructureId.RA_CAVITY,
      StructureId.LA_CAVITY,
      StructureId.COUMADIN_RIDGE,
      StructureId.LSPV,
      StructureId.LIPV,
      StructureId.DESCENDING_AORTA,
    ],
    clinicalPurpose:
      'Guides Zero-Fluoroscopy Left Pulmonary Vein Isolation (WACA RF, Cryoballoon, or Pulsed-Field Ablation), identifies Left Common PV trunk variants, and measures pre/post-ablation PV Doppler flow velocities.',
    fellowPearlsAndPitfalls: [
      'Pearl — Preventing Pulmonary Vein Stenosis: Because the LSPV and LIPV align coaxially with the ICE beam from the RA, ICE clearly demarcates the wide funnel-shaped LA antrum from the tubular venous ostium so lesions remain strictly antral.',
      'Pearl — Zero-Contrast Cryoballoon & PFA Occlusion Check: Color Doppler in this view verifies complete hemodynamic balloon occlusion of the LSPV/LIPV without iodinated contrast or fluoroscopic venography.',
      'Pitfall — Descending Aorta Proximity to LIPV: The Descending Thoracic Aorta (6 o\'clock) directly abuts the posterior wall of the LIPV; avoid excessive contact force inside the posterior LIPV ostium.',
    ],
    literatureCitations: ['enriquez_2018', 'gianni_2021', 'zei_2020'],
  },
  {
    id: 'zf_16',
    number: 16,
    track: 'zero_fluoro_ablation',
    title: 'Posterior Left Atrial Wall & Retrocardiac Esophagus View',
    shortTitle: '16. Posterior LA Wall & Esophagus',
    recommendedCatheter: 'either',
    startingViewId: 'zf_15',
    targetState: {
      model: 'soundstar_10f',
      station: 'ra_venous',
      sMm: 8,
      torqueDeg: 125,
      apDeg: -22,
      lrDeg: 0,
      omniDeg: 0,
      biplaneEnabled: false,
      volume4dEnabled: false,
    },
    recommendedDepthCm: 11,
    maneuverBullets: [
      'From the Left Pulmonary Veins View (zf_15), release Left deflection to 0° while maintaining -22° Posterior (P) deflection.',
      'Apply gradual Clockwise torque to +125° CW total from Home View, sweeping the beam from left to right across the posterior Left Atrial wall.',
      'Identify the smooth fibromuscular Posterior LA Wall in the mid-field (3–9 o\'clock) and the multi-layered tubular Retrocardiac Esophagus immediately behind the oblique pericardial sinus at 5–7 o\'clock.',
      'Sweep +/-15° CW/CCW to trace the entire longitudinal esophageal course (left-sided vs. midline vs. right-sided) for 3D CARTOSOUND contouring.',
    ],
    sectorAnatomy: {
      nearFieldApex: 'Posterior Right Atrium and posterior Interatrial Groove (12 o\'clock).',
      midField: 'Central-posterior Left Atrial cavity and smooth Posterior LA Wall spanning from 9 o\'clock (inferior LA floor) to 3 o\'clock (LA roof).',
      farField: 'Oblique Pericardial Sinus and the flattened, multi-layered Retrocardiac Esophagus (5–7 o\'clock, separated from the LA endocardium by only 3.5–5.0 mm of tissue and fat).',
      distalRightEdge: 'Superior Posterior LA Roof approaching the Right Pulmonary Artery (2–3 o\'clock).',
      proximalLeftEdge: 'Inferior Posterior LA Floor approaching the Coronary Sinus (8–9 o\'clock).',
    },
    expectedStructureIds: [
      StructureId.RA_CAVITY,
      StructureId.LA_CAVITY,
      StructureId.RETROCARDIAC_ESOPHAGUS,
      StructureId.PERICARDIAL_SPACE,
    ],
    clinicalPurpose:
      'Replaces fluoroscopic barium swallows or radiopaque temperature probes by mapping the exact 3D Retrocardiac Esophageal trajectory on CARTOSOUND and monitoring posterior LA wall edema to prevent atrioesophageal fistula.',
    fellowPearlsAndPitfalls: [
      'Pearl — Real-Time Esophageal Mobility Tracking: The esophagus can shift laterally by >10–15 mm during an AF ablation case; re-sweeping this view immediately before posterior wall or inferior WACA ablation updates the live esophageal position.',
      'Pearl — Zero-Fluoro Esophageal Temperature Probe Placement: If a luminal esophageal temperature (LET) probe is used, its metallic thermistor appears as a bright acoustic reflector with posterior shadowing inside the esophageal lumen at 6 o\'clock, allowing exact cranial-caudal alignment with the ablation tip.',
      'Pitfall — Atrioesophageal Fistula Hazard: The posterior LA wall + oblique pericardial fat is often < 4 mm thick directly over the anterior esophageal wall; use ICE to verify reduced power/duration or PFA delivery over the contoured esophageal footprint.',
    ],
    literatureCitations: ['enriquez_2018', 'gianni_2021', 'razminia_2022'],
  },
  {
    id: 'zf_17',
    number: 17,
    track: 'zero_fluoro_ablation',
    title: 'Right Pulmonary Veins (RSPV & RIPV "Owl Eyes") & Right Pulmonary Artery View',
    shortTitle: '17. Right PVs ("Owl Eyes") & RPA',
    recommendedCatheter: 'either',
    startingViewId: 'zf_16',
    targetState: {
      model: 'soundstar_10f',
      station: 'ra_venous',
      sMm: 12,
      torqueDeg: 155,
      apDeg: -24,
      lrDeg: 22,
      omniDeg: 0,
      biplaneEnabled: false,
      volume4dEnabled: false,
    },
    recommendedDepthCm: 10,
    maneuverBullets: [
      'From the Posterior LA / Esophagus View (zf_16), advance slightly to s = +12 mm in the mid-to-upper Right Atrium.',
      'Apply further Clockwise torque to +155° CW total from Home View while maintaining -24° Posterior (P) deflection.',
      'Add +22° Left (L) deflection to tilt the elevation plane across the right pulmonary venous antrum, slicing the Right Inferior Pulmonary Vein (RIPV) and Right Superior Pulmonary Vein (RSPV) in short-axis cross-section ("Owl Eyes" sign).',
      'Observe the three stacked circular lumens: RIPV at 6–7 o\'clock, RSPV at 4–5 o\'clock, and the pulsatile Right Pulmonary Artery (RPA) directly superior to the RSPV at 2–3 o\'clock.',
    ],
    sectorAnatomy: {
      nearFieldApex: 'Posterior/Septal Right Atrium and Waterston\'s Interatrial Groove (12 o\'clock).',
      midField: 'Classic "Owl Eyes" double venous rings: Right Inferior Pulmonary Vein (RIPV) ostium at 6–7 o\'clock and Right Superior Pulmonary Vein (RSPV) ostium at 4–5 o\'clock separated by the Right Intervenous Carina.',
      farField: 'Circular Right Pulmonary Artery (RPA) superiorly at 2–3 o\'clock and distal right pulmonary venous branches entering the right lung hilum (5–7 o\'clock).',
      distalRightEdge: 'Right Pulmonary Artery (RPA) roof and posterior SVC-RA junction (2–3 o\'clock).',
      proximalLeftEdge: 'Inferior Right Atrial / Left Atrial antral floor (8–9 o\'clock).',
    },
    expectedStructureIds: [
      StructureId.RA_CAVITY,
      StructureId.LA_CAVITY,
      StructureId.RSPV,
      StructureId.RIPV,
      StructureId.MAIN_PA_LPA_RPA,
    ],
    clinicalPurpose:
      'Guides Right Wide-Area Circumferential Ablation (WACA), detects accessory Right Middle Pulmonary Vein (RMPV) ostia, and protects the Right Phrenic Nerve along the anterior RSPV-SVC border.',
    fellowPearlsAndPitfalls: [
      'Pearl — Converting "Owl Eyes" to Longitudinal RPV View: Releasing Left deflection (+22° -> 0°) while adding +10° CW torque elongates the circular "Owl Eyes" into longitudinal trunks for PW Doppler flow velocity measurement.',
      'Pearl — Detecting a Right Middle Pulmonary Vein (RMPV): Present in 15–20% of patients, an accessory RMPV is immediately visible as a third circular lumen nestled between the RSPV and RIPV "Owl Eyes."',
      'Pitfall — Right Phrenic Nerve Palsy: The Right Phrenic Nerve descends in the narrow 2–3 mm fat plane between the posterolateral SVC and the anterior wall of the RSPV (3–4 o\'clock); ICE ensures anterior right WACA lesions stay on the atrial antrum.',
    ],
    literatureCitations: ['enriquez_2018', 'gianni_2021', 'razminia_2022'],
  },
  {
    id: 'zf_18',
    number: 18,
    track: 'zero_fluoro_ablation',
    title: 'Superior Vena Cava (SVC), Crista Terminalis & Sinus Node View',
    shortTitle: '18. SVC, Crista & Sinus Node',
    recommendedCatheter: 'either',
    startingViewId: 'zf_13',
    targetState: {
      model: 'soundstar_10f',
      station: 'ra_venous',
      sMm: 22,
      torqueDeg: 52,
      apDeg: -32,
      lrDeg: -22,
      omniDeg: 0,
      biplaneEnabled: false,
      volume4dEnabled: false,
    },
    recommendedDepthCm: 9,
    maneuverBullets: [
      'Start from the Fossa Ovalis View (zf_13) in the mid-Right Atrium and advance the catheter +18 mm (to s = +22 mm) into the upper Right Atrium.',
      'Increase Posterior (P) deflection to -32° (angling the ultrasound sector steeply superiorly toward the RA roof).',
      'Apply -22° Right (R) deflection with +52° CW torque to align the imaging plane longitudinally with the Superior Vena Cava (SVC) conduit.',
      'Verify the wide longitudinal SVC lumen extending toward 1–4 o\'clock, the superior Crista Terminalis / Sinus Node ridge at 1–2 o\'clock, the Superior Limbus at 7–8 o\'clock, and the circular Right Pulmonary Artery (RPA) passing behind the SVC at 4–5 o\'clock.',
    ],
    sectorAnatomy: {
      nearFieldApex: 'Upper Right Atrial cavity approaching the SVC-RA junction (12 o\'clock).',
      midField: 'Superior Vena Cava (SVC) longitudinal lumen extending cranially at 1–4 o\'clock; superior Crista Terminalis / Sinoatrial (SA) Node prominence at 1–2 o\'clock; Superior Limbus of Fossa Ovalis at 7–8 o\'clock.',
      farField: 'Right Pulmonary Artery (RPA) in circular cross-section at 4–5 o\'clock directly posterior to the SVC-RA junction and superior to the LA roof.',
      distalRightEdge: 'High Superior Vena Cava lumen ascending toward the brachiocephalic confluence (2–3 o\'clock).',
      proximalLeftEdge: 'Mid-RA cavity and Superior Limbus of the Interatrial Septum (7–9 o\'clock).',
    },
    expectedStructureIds: [
      StructureId.RA_CAVITY,
      StructureId.CRISTA_TERMINALIS,
      StructureId.SVC,
      StructureId.IAS_LIMBUS,
      StructureId.MAIN_PA_LPA_RPA,
    ],
    clinicalPurpose:
      'Step 1 of Zero-Fluoroscopy Transseptal Puncture (visualizing the J-wire and transseptal sheath parking safely high in the SVC before pull-down) and anatomical guide for SVC Isolation and Sinus Node Modification.',
    fellowPearlsAndPitfalls: [
      'Pearl — Zero-Fluoro Transseptal J-Wire Verification: Always park ICE in this view first to watch the 0.032" J-wire and transseptal dilator ascend cleanly into the SVC at 2–3 o\'clock, preventing inadvertent RAA perforation prior to the septal pull-down.',
      'Pearl — Defining the Electrical SVC-RA Junction for SVC Isolation: The lower border of the circular Right Pulmonary Artery (4–5 o\'clock) opposite the Crista Terminalis shoulder (1–2 o\'clock) marks the true anatomical SVC-RA junction; isolate 5–10 mm superior to this line to avoid Sinus Node injury.',
      'Pitfall — Mistaking the RAA for the SVC: Without -22° Right deflection and -32° Posterior tilt, an anteriorly directed beam images the blind trabeculated RAA pouch instead of the smooth vertical SVC lumen.',
    ],
    literatureCitations: ['baykaner_2020', 'enriquez_2018', 'razminia_2022'],
  },

  // ============================================================================
  // TRACK B: LAA WATCHMAN (FLX & FLX PRO) IMPLANTATION (10 VIEWS: wm_01 .. wm_10)
  // ============================================================================
  {
    id: 'wm_01',
    number: 19,
    track: 'watchman_laac',
    title: 'Step 1 — Pre-TSP Pericardial Baseline & Right-Sided PA/RVOT LAA Thrombus Exclusion',
    shortTitle: '19. Step 1: PA/RVOT LAA Thrombus Check',
    recommendedCatheter: 'either',
    startingViewId: 'zf_02',
    targetState: {
      model: 'soundstar_10f',
      station: 'rv_outflow',
      sMm: 56,
      torqueDeg: 75,
      apDeg: -10,
      lrDeg: 15,
      omniDeg: 0,
      biplaneEnabled: false,
      volume4dEnabled: false,
    },
    recommendedDepthCm: 9,
    maneuverBullets: [
      'Before transseptal puncture or Left Atrial instrumentation, advance the ICE catheter across the Tricuspid Valve into the Right Ventricle and up into the high RVOT / Main Pulmonary Artery (s = +56 mm).',
      'Apply +75° Clockwise (CW) torque with -10° Posterior (P) deflection and +15° Left (L) deflection so the transducer faces posteriorly and inferiorly across the pulmonary artery wall directly into the distal LAA apex.',
      'Because the Main/Left Pulmonary Artery lies immediately anterosuperior to the LAA, inspect the trabeculated distal LAA lobes in the high-resolution near-to-mid field (2–4 cm depth) to exclude pre-existing LAA thrombus or dense sludge.',
      'Simultaneously verify zero baseline pericardial effusion in the transverse and posterolateral pericardial recesses prior to systemic heparinization.',
    ],
    sectorAnatomy: {
      nearFieldApex: 'High RVOT / Main Pulmonary Artery lumen and Pulmonic Valve cusps (12 o\'clock, 1–2.5 cm depth).',
      midField: 'Distal Left Atrial Appendage (LAA) apex and pectinate muscle trabeculations (3–6 o\'clock, immediately posterior-inferior to the PA wall without intervening septal shadowing).',
      farField: 'Proximal LAA neck, Left Atrial body, and posterolateral Pericardial Space (6–8 o\'clock).',
      distalRightEdge: 'Left Pulmonary Artery (LPA) bifurcation and superior LAA roof (2–3 o\'clock).',
      proximalLeftEdge: 'Sub-pulmonic RVOT conus and Aortic Root wedge (8–9 o\'clock).',
    },
    expectedStructureIds: [
      StructureId.RVOT_INFUNDIBULUM,
      StructureId.PULMONIC_VALVE,
      StructureId.MAIN_PA_LPA_RPA,
      StructureId.LAA_OSTIUM_AND_LOBES,
      StructureId.PERICARDIAL_SPACE,
    ],
    clinicalPurpose:
      'Gold-standard right-sided pre-transseptal screening station to exclude distal LAA apex thrombus and record baseline pericardial effusion loops before crossing the interatrial septum for Watchman LAAC.',
    fellowPearlsAndPitfalls: [
      'Pearl — Why Right Atrial ICE Alone Misses Distal LAA Thrombi: From the RA, the distal LAA apex is 8–11 cm away and shadowed by the Aortic Root and IAS. Advancing into the RVOT/PA places the transducer within 1.5–3 cm of the LAA apex for crisp near-field thrombus exclusion.',
      'Pitfall — Differentiating Pectinate Muscles from Thrombus: Normal comb-like pectinate ridges move synchronously with LAA wall contraction and show brisk inter-pectinate flow on low-Nyquist Color Doppler, whereas an apical thrombus appears as a rounded, fixed or oscillating echogenic mass.',
      'Pearl — Mandatory Pre-TSP Baseline Loop: Always store a baseline pericardial sweep before transseptal puncture so any intraprocedural effusion can be immediately quantified against baseline.',
    ],
    literatureCitations: ['gianni_2021_watchman', 'korsholm_2022', 'alkhouli_2023'],
  },
  {
    id: 'wm_02',
    number: 20,
    track: 'watchman_laac',
    title: 'Step 2 — Inferoposterior Transseptal Puncture (TSP) Biplane Alignment (4.0–4.5 cm above MV)',
    shortTitle: '20. Step 2: Inferoposterior TSP Biplane',
    recommendedCatheter: 'nuvision_10f',
    startingViewId: 'zf_13',
    targetState: {
      model: 'nuvision_10f',
      station: 'ra_venous',
      sMm: 4,
      torqueDeg: 68,
      apDeg: -22,
      lrDeg: 0,
      omniDeg: 0,
      biplaneEnabled: true,
      volume4dEnabled: false,
    },
    recommendedDepthCm: 10,
    maneuverBullets: [
      'Position the ICE catheter in the Mid-RA Fossa Ovalis station (s = +4 mm, torque = +68° CW, Posterior deflection = -22°).',
      'Activate NuVision Simultaneous Biplane (X-Plane: 0° Longitudinal S-I Plane on Left + 90° Orthogonal A-P Plane on Right) or perform sequential CW/CCW 2D rotational sweeps.',
      'Pull down the transseptal sheath/needle from the SVC into the Fossa Ovalis and adjust sheath rotation so tenting occurs in the INFERIOR third of the Fossa on the 0° S-I plane and the POSTERIOR half (well clear of the Aortic Root NCC) on the 90° A-P plane.',
      'Use digital calipers to verify that the tenting apex sits 4.0 to 4.5 cm (40–45 mm) superior to the Mitral Valve annular plane along a coaxial vector pointing directly into the LAA ostium.',
    ],
    sectorAnatomy: {
      nearFieldApex: 'Right Atrial cavity and transseptal sheath/needle shaft approaching the Fossa Ovalis (12 o\'clock).',
      midField: '0° Plane: Tenting apex of the bilaminar Fossa Ovalis in the inferior third above the Inferior Limbus; 90° X-Plane: Posterior tenting well behind the anterior Aortic Root (NCC).',
      farField: 'Left Atrial cavity, Mitral Valve annulus (4.2 cm inferior to tenting apex), and target LAA ostium along the puncture vector.',
      distalRightEdge: '0° Plane: Superior Limbus (septum secundum) toward SVC; 90° Plane: Posterior LA free wall (>= 2.0 cm clearance).',
      proximalLeftEdge: '0° Plane: Inferior Limbus toward IVC/CS; 90° Plane: Anterior Aortic Root (NCC danger zone).',
    },
    expectedStructureIds: [
      StructureId.RA_CAVITY,
      StructureId.FOSSA_OVALIS,
      StructureId.IAS_LIMBUS,
      StructureId.AORTIC_VALVE_NCC,
      StructureId.LA_CAVITY,
      StructureId.MITRAL_VALVE_AML_PML,
      StructureId.TRANSSEPTAL_NEEDLE_SHEATH,
    ],
    clinicalPurpose:
      'Establishes a straight, coaxial 3D trajectory from the femoral vein across the inferoposterior Fossa Ovalis directly into the anterosuperiorly directed LAA neck for Watchman FLX implantation.',
    fellowPearlsAndPitfalls: [
      'Pearl — Why Watchman Demands an Inferoposterior Puncture: Because the LAA projects anterolaterally and superiorly, an inferoposterior puncture (~4.0–4.5 cm above the MV) allows the 14F Watchman access sheath to enter the LAA neck coaxially without canting.',
      'Pitfall — Consequence of an Anterior or Superior Puncture: Puncturing anteriorly ("aorta-hugger") aims the sheath posteriorly into the LSPV/Coumadin ridge, causing severe Watchman shoulder protrusion; puncturing too superiorly forces the sheath steeply downward into the LCx/Mitral annulus.',
      'Pearl — NuVision Biplane Advantage: Simultaneous 0°/90° X-Plane displays both Superior-Inferior and Anterior-Posterior tenting in a single frame without rotating the ICE handle.',
    ],
    literatureCitations: ['korsholm_2022', 'alkhouli_2023', 'masson_2023'],
  },
  {
    id: 'wm_03',
    number: 21,
    track: 'watchman_laac',
    title: 'Step 3 — Single-Transseptal ICE Catheter Advancement Across Fossa Ovalis into LA',
    shortTitle: '21. Step 3: Single-TSP ICE Crossing to LA',
    recommendedCatheter: 'either',
    startingViewId: 'wm_02',
    targetState: {
      model: 'soundstar_10f',
      station: 'ra_venous',
      sMm: 10,
      torqueDeg: 66,
      apDeg: 20,
      lrDeg: 0,
      omniDeg: 0,
      biplaneEnabled: false,
      volume4dEnabled: false,
    },
    recommendedDepthCm: 9,
    maneuverBullets: [
      'After crossing the inferoposterior Fossa Ovalis and parking a stiff exchange wire (e.g., Amplatz Super Stiff or VersaCross pigtail wire) in the LSPV, advance the 14F Watchman access sheath & dilator across the septum to predilate the puncture, then withdraw the sheath tip slightly into the RA.',
      'From the RA septal ICE view, release Posterior (-22°) deflection past neutral to +20° Anterior (A) deflection while maintaining +66° Clockwise torque.',
      'Align the ICE ultrasound beam longitudinally ("in-plane") with the stiff transseptal guidewire so the wire is seen entering the dilated Fossa Ovalis orifice at the 12–2 o\'clock near-field apex.',
      'Gently advance the ICE catheter forward (+10 mm -> LA crossing gate) along the exact trajectory of the wire into the Left Atrium, followed by re-advancing the 14F Watchman access sheath alongside it.',
    ],
    sectorAnatomy: {
      nearFieldApex: 'Dilated Fossa Ovalis opening and stiff transseptal guidewire in the immediate 12 o\'clock near-field.',
      midField: 'Superior and Inferior Limbus rims parting as the ICE tip tracks along the guidewire across the Interatrial Septum into the Left Atrium.',
      farField: 'Left Atrial cavity and Left Superior Pulmonary Vein (LSPV) housing the distal pigtail/stiff guidewire.',
      distalRightEdge: 'Transseptal wire trajectory extending into the Left Atrium toward the LSPV (2–3 o\'clock).',
      proximalLeftEdge: 'Right Atrial cavity and Inferior Limbus behind the advancing catheter tip (8–9 o\'clock).',
    },
    expectedStructureIds: [
      StructureId.RA_CAVITY,
      StructureId.FOSSA_OVALIS,
      StructureId.IAS_LIMBUS,
      StructureId.LA_CAVITY,
      StructureId.TRANSSEPTAL_NEEDLE_SHEATH,
    ],
    clinicalPurpose:
      'Executes the consensus Single-Transseptal Wire-Tracking Technique to advance the ICE transducer into the Left Atrium for unobstructed, high-resolution near-field LAA imaging without performing a second septal puncture.',
    fellowPearlsAndPitfalls: [
      'Pearl — Why Transseptal Left Atrial ICE is Mandatory for Watchman: Placing the ICE transducer inside the LA eliminates interatrial septal and aortic acoustic shadowing, achieving 99% equivalence to multiplane TEE without general anesthesia.',
      'Pearl — The "Shoehorn / Buddy-Dilator" Maneuver: If a thick or fibrotic septum resists ICE crossing, advance the 14F Watchman dilator halfway across the Fossa Ovalis to tent the orifice open, tuck the ICE tip flush against the dilator shaft, and advance both together smoothly.',
      'Pitfall — Pushing Against the Muscular Limbus: Never advance the ICE catheter if the bright echogenic Superior Limbus blocks 12–2 o\'clock; always keep the transseptal guidewire centered at the sector apex.',
    ],
    literatureCitations: ['korsholm_2022', 'alkhouli_2023', 'gianni_2021_watchman'],
  },
  {
    id: 'wm_04',
    number: 22,
    track: 'watchman_laac',
    title: 'Step 4A — LA Position A: Mid-LA Home View (~45°–90° TEE Equivalent)',
    shortTitle: '22. Step 4A: Mid-LA Home (45°–90° Eq)',
    recommendedCatheter: 'either',
    startingViewId: 'wm_03',
    targetState: {
      model: 'soundstar_10f',
      station: 'la_transseptal',
      sMm: 0,
      torqueDeg: 10,
      apDeg: -10,
      lrDeg: 0,
      omniDeg: 45,
      biplaneEnabled: false,
      volume4dEnabled: false,
    },
    recommendedDepthCm: 8,
    maneuverBullets: [
      'Once the ICE catheter crosses the Fossa Ovalis into the Left Atrium (la_transseptal station, s = 0 mm), release Anterior deflection immediately.',
      'Apply -10° mild Posterior (P) retroflexion and +10° Clockwise torque so the transducer floats freely in the central Mid-LA cavity facing the anterolateral LA wall.',
      'Set ultrasound depth to 8 cm to frame the entire Left Atrial Appendage (LAA) ostium, neck, and primary lobe at the center of the sector (3–4 cm standoff).',
      'Use slight Right tilt + CCW rotation for the ~45° TEE equivalent (Aortic Root + Coumadin Ridge + LCx) or pure Posterior retroflexion for the ~90° TEE equivalent (Coumadin Ridge to Mitral Valve/LCx).',
    ],
    sectorAnatomy: {
      nearFieldApex: 'Unobstructed central Left Atrial blood pool (12 o\'clock, 0–3 cm standoff from LAA ostium).',
      midField: 'Left Atrial Appendage (LAA) ostium and landing zone spanned superiorly by the Coumadin Ridge (2–3 o\'clock) and inferiorly by the Left Circumflex Coronary Artery (LCx) in cross-section (6–7 o\'clock).',
      farField: 'Trabeculated primary LAA lobe and apex (4–6 o\'clock) and lateral Left Ventricular base (7–8 o\'clock).',
      distalRightEdge: 'Bulbous Coumadin Ridge tip and Left Superior Pulmonary Vein (LSPV) entrance (1–3 o\'clock).',
      proximalLeftEdge: 'Mitral Valve Anterior/Posterior leaflets and Left Circumflex Artery in the AV groove (7–9 o\'clock).',
    },
    expectedStructureIds: [
      StructureId.LA_CAVITY,
      StructureId.LAA_OSTIUM_AND_LOBES,
      StructureId.COUMADIN_RIDGE,
      StructureId.MITRAL_VALVE_AML_PML,
      StructureId.CORONARY_ARTERIES_LMCA_RCA_LCX,
    ],
    clinicalPurpose:
      'Primary "Workhorse" Left Atrial ICE station (~45°–90° TEE equivalent) for definitive post-TSP LAA thrombus confirmation, pigtail/sheath coaxial cannulation, Watchman FLX deployment, and Tug Test monitoring.',
    fellowPearlsAndPitfalls: [
      'Pearl — Zero Mechanical Interference During Deployment: Because the Mid-LA Home station sits 3–4 cm back from the LAA ostium in the central LA, the ICE catheter never collides with the 14F Watchman access sheath during device unsheathing or tug testing.',
      'Pearl — Definitive Low-Nyquist LAA Thrombus & Flow Check: Before advancing the pigtail or Watchman sheath into the LAA, use this unobstructed near-field view with Color Doppler (Nyquist 25–35 cm/s) to confirm brisk LAA emptying and 100% absence of apical sludge.',
      'Pitfall — Excessive Anterior Flexion in the LA: Releasing Anterior flexion immediately after septal crossing prevents the ICE tip from poking the anterior LA roof or entering the LAA orifice.',
    ],
    literatureCitations: ['korsholm_2022', 'alkhouli_2023', 'della_rocca_2023'],
  },
  {
    id: 'wm_05',
    number: 23,
    track: 'watchman_laac',
    title: 'Step 4B — LA Position B: Left Superior Pulmonary Vein (LSPV) / Coumadin Ridge View (~0°–45° & 135° TEE Equivalent)',
    shortTitle: '23. Step 4B: LSPV / Ridge (0°–45° Eq)',
    recommendedCatheter: 'soundstar_10f',
    startingViewId: 'wm_04',
    targetState: {
      model: 'soundstar_10f',
      station: 'la_transseptal',
      sMm: 32,
      torqueDeg: 25,
      apDeg: 18,
      lrDeg: -12,
      omniDeg: 0,
      biplaneEnabled: false,
      volume4dEnabled: false,
    },
    recommendedDepthCm: 8,
    maneuverBullets: [
      'From the Mid-LA Home View (wm_04), advance the 2D ICE catheter +32 mm along the posterosuperior lateral LA wall until the tip seats gently at the ostium/antrum of the Left Superior Pulmonary Vein (LSPV).',
      'Apply +25° torque with +18° Anterior (A) deflection and -12° Right (R) tilt so the transducer crystal faces anteroinferiorly down across the Coumadin Ridge into the LAA.',
      'Observe the Coumadin Ridge in the immediate near-field (12–2 o\'clock), the LAA landing zone and anterior/superior lobes in the mid-field, and the Left Circumflex Artery (LCx) and Mitral Annulus in the far-field (6–7 o\'clock).',
      'Sweep L/R deflection at the LSPV ostium to transition between the ~0°–45° TEE equivalent and the deep ~135° long-axis LAA lobe view.',
    ],
    sectorAnatomy: {
      nearFieldApex: 'LSPV ostial lumen and the bulbous Coumadin (Left Lateral) Ridge in the immediate 12–2 o\'clock near-field.',
      midField: 'Full LAA ostium, landing zone neck, and anterior/superior hooked lobe ("Chicken Wing" bend) profiled axially along the ultrasound beam.',
      farField: 'Inferior LAA wall, Left Circumflex Coronary Artery (LCx) in cross-section, and Mitral Valve annulus (5–7 o\'clock).',
      distalRightEdge: 'Anterior/Superior LAA lobe apex and epicardial pericardial border (3–4 o\'clock).',
      proximalLeftEdge: 'Left Atrial cavity and Mitral annular inflow (8–9 o\'clock).',
    },
    expectedStructureIds: [
      StructureId.LA_CAVITY,
      StructureId.LAA_OSTIUM_AND_LOBES,
      StructureId.COUMADIN_RIDGE,
      StructureId.LSPV,
      StructureId.CORONARY_ARTERIES_LMCA_RCA_LCX,
    ],
    clinicalPurpose:
      'Second canonical 2D Left Atrial ICE station (Korsholm 3-Position Protocol), placing the Coumadin Ridge in the immediate near-field for ultra-high-resolution superior shoulder assessment and coaxial Color Doppler peri-device leak detection.',
    fellowPearlsAndPitfalls: [
      'Pearl — Superior Resolution of the Coumadin Ridge Shoulder: Because the ultrasound beam enters directly through the Coumadin Ridge at 12 o\'clock, this view provides the sharpest delineation of whether the Watchman FLX superior shoulder sits flush 1–2 cm below the ridge tip.',
      'Pitfall — Deep Pulmonary Vein Cannulation Trauma: Seat the ICE transducer at the wide LSPV ostium/antrum; never force the rigid 18.5 mm transducer tip deep into smaller distal pulmonary vein branches.',
      'Pearl — Unmasking Chicken-Wing Hook Depth: Adding slight Left/Posterior tilt from the LSPV ostium aligns the sector with the 135° TEE long axis, revealing the exact angle and usable depth of an anterior Chicken-Wing fold.',
    ],
    literatureCitations: ['korsholm_2022', 'gianni_2021_watchman', 'velagapudi_2022'],
  },
  {
    id: 'wm_06',
    number: 24,
    track: 'watchman_laac',
    title: 'Step 4C — LA Position C: Supramitral Retroflexed View (~90°–135° TEE Equivalent)',
    shortTitle: '24. Step 4C: Supramitral (90°–135° Eq)',
    recommendedCatheter: 'soundstar_10f',
    startingViewId: 'wm_04',
    targetState: {
      model: 'soundstar_10f',
      station: 'la_transseptal',
      sMm: -4,
      torqueDeg: 18,
      apDeg: -38,
      lrDeg: 24,
      omniDeg: 135,
      biplaneEnabled: false,
      volume4dEnabled: false,
    },
    recommendedDepthCm: 8,
    maneuverBullets: [
      'Return from the LSPV ostium to the lower/mid Left Atrium (s = -4 mm) just above the posterior Mitral Valve annulus.',
      'Apply strong -38° Posterior (P) retroflexion combined with +24° Left (L) deflection and +18° CW torque so the catheter sits in the Supramitral position looking superiorly and anteriorly upward into the LAA.',
      'Verify the inverted/complementary perspective: the Mitral Valve annulus and LCx now appear in the near-field (8–11 o\'clock), while the LAA landing zone, trabeculated lobes, Coumadin Ridge, and Left Pulmonary Artery (LPA) roof extend into the mid-to-far field.',
    ],
    sectorAnatomy: {
      nearFieldApex: 'Inferior Left Atrial floor, Posterior/Lateral Mitral Valve annulus, and Left Circumflex Artery (LCx) at 9–12 o\'clock.',
      midField: 'LAA ostium, landing zone, and separated anterior vs. posterior pectinate lobes (~90°–135° TEE long-axis equivalent).',
      farField: 'Superior LAA roof, Coumadin Ridge (2–4 o\'clock), and Left Pulmonary Artery (LPA) directly above the LAA roof (4–6 o\'clock).',
      distalRightEdge: 'Coumadin Ridge and superior LAA lobe (2–4 o\'clock).',
      proximalLeftEdge: 'Mitral Valve Anterior/Posterior leaflets and LCx coronary artery (8–10 o\'clock).',
    },
    expectedStructureIds: [
      StructureId.LA_CAVITY,
      StructureId.LAA_OSTIUM_AND_LOBES,
      StructureId.COUMADIN_RIDGE,
      StructureId.MITRAL_VALVE_AML_PML,
      StructureId.MAIN_PA_LPA_RPA,
      StructureId.CORONARY_ARTERIES_LMCA_RCA_LCX,
    ],
    clinicalPurpose:
      'Third canonical 2D Left Atrial ICE station (~90°–135° TEE equivalent), providing an inferior-to-superior perspective ideal for separating multi-lobed LAA anatomies, checking inferior Watchman shoulder clearance from the Mitral Valve, and detecting inferior LCx edge leaks.',
    fellowPearlsAndPitfalls: [
      'Pearl — Complementary Perspective to the LSPV View: Whereas the LSPV view looks top-down from the Coumadin Ridge, the Supramitral view looks bottom-up from the Mitral Annulus, guaranteeing that neither the superior nor inferior LAA margin is shadowed by the Watchman hub.',
      'Pearl — Verifying Zero Mitral Leaflet Impingement: Places the anterior/lateral Mitral Valve leaflet and LCx in the immediate near-field (8–11 o\'clock) to prove the deployed Watchman FLX inferior shoulder does not overhang the mitral orifice.',
      'Pitfall — Left Pulmonary Artery (LPA) Proximity: In superiorly directed LAA anatomies, the LPA (4–6 o\'clock far-field) lies within 2 mm of the superior LAA wall; watch this interface closely during device deployment.',
    ],
    literatureCitations: ['korsholm_2022', 'alkhouli_2023', 'gianni_2021_watchman'],
  },
  {
    id: 'wm_07',
    number: 25,
    track: 'watchman_laac',
    title: 'Step 4D — NuVision 4D Single-Station Electronic Multiplane Sweep (0°, 45°, 90°, 135° & 3D En-Face)',
    shortTitle: '25. Step 4D: NuVision 4D Multiplane & En-Face',
    recommendedCatheter: 'nuvision_10f',
    startingViewId: 'wm_04',
    targetState: {
      model: 'nuvision_10f',
      station: 'la_transseptal',
      sMm: 4,
      torqueDeg: 12,
      apDeg: -8,
      lrDeg: 0,
      omniDeg: 90,
      biplaneEnabled: true,
      volume4dEnabled: true,
    },
    recommendedDepthCm: 8,
    maneuverBullets: [
      'Select the Biosense Webster NuVision 10F 4D Matrix ICE Catheter and park it in a single stable Mid-LA station (s = +4 mm, torque = +12°, apDeg = -8°, lrDeg = 0°).',
      'Without physically advancing into the LSPV or flexing into the supramitral floor, rotate the Electronic Multiplane Omni-Angle dial digitally through 0° -> 45° -> 90° -> 135° to capture all four standard TEE multiplane equivalents from one fixed catheter position.',
      'Enable Simultaneous Biplane (X-Plane) and 4D En-Face ("Surgeon\'s View") mode to inspect the 3D ovality of the LAA ostium, Coumadin Ridge, and Mitral/LCx border in real time.',
    ],
    sectorAnatomy: {
      nearFieldApex: 'Stable Mid-LA blood pool (2.5–3.5 cm standoff) across both primary and orthogonal electronic planes.',
      midField: 'Primary 2D Plane (0°/45°/90°/135° electronic sweep) + Simultaneous 90°-offset Biplane X-Plane + 3D En-Face Surgeon\'s View looking directly down the barrel of the LAA ostium.',
      farField: 'Full 3D LAA landing zone circumference, trabeculated lobes, Coumadin Ridge superiorly, and LCx / Mitral Valve inferiorly.',
      distalRightEdge: 'Superior/Posterior Coumadin Ridge and LSPV margin.',
      proximalLeftEdge: 'Inferior/Anterior Left Circumflex Artery (LCx) and Mitral Annulus.',
    },
    expectedStructureIds: [
      StructureId.LA_CAVITY,
      StructureId.LAA_OSTIUM_AND_LOBES,
      StructureId.COUMADIN_RIDGE,
      StructureId.MITRAL_VALVE_AML_PML,
      StructureId.CORONARY_ARTERIES_LMCA_RCA_LCX,
    ],
    clinicalPurpose:
      'Demonstrates the next-generation 4D Matrix ICE LAAC workflow: decoupling multi-angle (0°/45°/90°/135°) LAA sizing and 3D En-Face ostial visualization from physical catheter manipulation inside the Left Atrium.',
    fellowPearlsAndPitfalls: [
      'Pearl — Eliminating Left Atrial Catheter Gymnastics: With 840 matrix elements steering the beam electronically from 0° to 180°, NuVision captures all four Watchman sizing and PASS angles from a single parked Mid-LA position—eliminating LSPV cannulation and reducing LA dwell time.',
      'Pearl — 3D Multiplanar Reconstruction (MPR) & En-Face Sizing: Because the LAA ostium is frequently elliptical rather than circular, 4D En-Face and Biplane imaging prevent 2D foreshortening and match pre-procedural cardiac CT maximal diameter within < 1 mm.',
      'Pitfall — Acoustic Frame Rate Optimization: Use 2D Biplane X-Plane (~30–40 FPS) during dynamic tug testing and 4D En-Face Volume mode for morphological ostial seal inspection.',
    ],
    literatureCitations: ['della_rocca_2023', 'masson_2023', 'alkhouli_2023'],
  },
  {
    id: 'wm_08',
    number: 26,
    track: 'watchman_laac',
    title: 'Step 5A — LAA Landing Zone Ostium & Depth Caliper Sizing (LCx to Coumadin Ridge)',
    shortTitle: '26. Step 5A: LAA Ostium & Depth Sizing',
    recommendedCatheter: 'either',
    startingViewId: 'wm_04',
    targetState: {
      model: 'nuvision_10f',
      station: 'la_transseptal',
      sMm: 2,
      torqueDeg: 14,
      apDeg: -10,
      lrDeg: 0,
      omniDeg: 45,
      biplaneEnabled: false,
      volume4dEnabled: false,
    },
    recommendedDepthCm: 8,
    maneuverBullets: [
      'Confirm mean Left Atrial Pressure (LAP) >= 12 mmHg and freeze the ultrasound frame at ventricular end-systole (just prior to Mitral Valve opening, when the LAA is maximally distended).',
      'Activate the 2-Point Digital Caliper Tool (or click "Auto-Measure") to measure the LAA Landing Zone Diameter across 0°, 45°, 90°, and 135°.',
      'Place Caliper Point 1 at the inferior border of the Left Circumflex Coronary Artery (LCx) in cross-section (6–7 o\'clock) and Caliper Point 2 on the superior LAA wall 1.0 to 2.0 cm distal (internal) to the tip of the Coumadin Ridge (2–3 o\'clock).',
      'Measure usable LAA depth from the landing zone midpoint to the distal lobe apex, and consult the Boston Scientific Watchman FLX / FLX Pro Sizing Matrix (e.g., maximal landing zone D_max = 19.5–21.5 mm -> select 27 mm Watchman FLX for target 10–30% compression).',
    ],
    sectorAnatomy: {
      nearFieldApex: 'Mid-LA cavity at ventricular end-systole (12 o\'clock).',
      midField: 'Calibrated LAA Landing Zone Axis spanning from the Left Circumflex Artery (LCx inferior marker at 6–7 o\'clock) to 10–15 mm inside the Coumadin Ridge tip (superior marker at 2–3 o\'clock).',
      farField: 'Usable LAA depth trajectory extending to the distal dominant lobe apex (required minimum depth = 50% of nominal Watchman FLX size).',
      distalRightEdge: 'Coumadin Ridge tip and superior LAA neck wall (2–3 o\'clock).',
      proximalLeftEdge: 'Left Circumflex Coronary Artery (LCx) and anterior Mitral Annulus (6–8 o\'clock).',
    },
    expectedStructureIds: [
      StructureId.LA_CAVITY,
      StructureId.LAA_OSTIUM_AND_LOBES,
      StructureId.COUMADIN_RIDGE,
      StructureId.CORONARY_ARTERIES_LMCA_RCA_LCX,
      StructureId.MITRAL_VALVE_AML_PML,
    ],
    clinicalPurpose:
      'Executes quantitative multi-angle LAA Landing Zone and Depth measurement to select the exact Watchman FLX (20–35 mm) or Watchman FLX Pro (20–40 mm) device size that achieves 10–30% radial compression.',
    fellowPearlsAndPitfalls: [
      'Pearl — Why We Size by the Largest Diameter (D_max) at End-Systole: The LAA is compliant and oval; measuring in diastole or at low LA pressure (< 10 mmHg) undersizes the ostium by 2–4 mm, predisposing to peri-device leak or embolization.',
      'Pearl — Watchman FLX Depth Advantage: Because Watchman FLX has a closed distal end and a shorter height (~50% of diameter vs. 100% in legacy Watchman 2.5), a 27 mm Watchman FLX requires only >= 13.5 mm of usable LAA depth.',
      'Pitfall — Measuring at the Tip of the Coumadin Ridge: Placing the superior caliper at the extreme atrial tip of the Coumadin Ridge rather than 1–2 cm inside the LAA neck overestimates the landing zone and causes proximal shoulder protrusion.',
    ],
    literatureCitations: ['korsholm_2022', 'alkhouli_2023', 'boston_scientific_flx_ifus'],
  },
  {
    id: 'wm_09',
    number: 27,
    track: 'watchman_laac',
    title: 'Step 5B — Controlled Watchman FLX Deployment (FLX Ball → Triangle → Full Deployment)',
    shortTitle: '27. Step 5B: Watchman FLX Ball-to-Full',
    recommendedCatheter: 'either',
    startingViewId: 'wm_08',
    targetState: {
      model: 'nuvision_10f',
      station: 'la_transseptal',
      sMm: 2,
      torqueDeg: 14,
      apDeg: -10,
      lrDeg: 0,
      omniDeg: 90,
      biplaneEnabled: false,
      volume4dEnabled: false,
    },
    recommendedDepthCm: 8,
    maneuverBullets: [
      'In the Bottom Watchman Procedural Deck, advance through Stage 1 ("Sheath Across" -> "FLX Ball"): retract the 14F access sheath halfway to unsheathe the distal Watchman FLX into its closed, atraumatic nitinol "FLX Ball" configuration inside the LAA neck.',
      'Verify coaxial alignment on the 90° LA ICE sector; because the 18 J-anchors remain tucked inside the rounded FLX Ball, the operator can safely advance ("roll the ball") distally or retract slightly to optimize depth.',
      'Advance to Stage 2 ("Triangle"): maintain gentle forward tension or fold back the sheath as the mid-struts widen into a conical Triangle and the dual rows of 18 J-anchors engage the LAA pectinate wall.',
      'Advance to Stage 3 ("Full Deployed"): fully retract the access sheath off the proximal shoulder so the 18-strut nitinol frame and white ePTFE/PET fabric cap expand flush across the LAA ostium between the Coumadin Ridge and LCx.',
    ],
    sectorAnatomy: {
      nearFieldApex: 'Mid-LA cavity and 14F Watchman access sheath + core delivery wire attached to the central threaded hub (12 o\'clock).',
      midField: 'Watchman FLX proximal PET fabric cap and 18-strut shoulder spanning the LAA landing zone from the Coumadin Ridge (2–3 o\'clock) to the LCx border (6–7 o\'clock).',
      farField: 'Dual-row J-anchors engaged in the LAA pectinate trabeculations and closed atraumatic distal nitinol ball apex inside the dominant lobe (4–6 o\'clock).',
      distalRightEdge: 'Superior Watchman FLX shoulder seated 1–2 cm internal to the Coumadin Ridge tip (2–3 o\'clock).',
      proximalLeftEdge: 'Inferior Watchman FLX shoulder seated flush opposite the Left Circumflex Artery without encroaching on the Mitral Valve (6–8 o\'clock).',
    },
    expectedStructureIds: [
      StructureId.LA_CAVITY,
      StructureId.LAA_OSTIUM_AND_LOBES,
      StructureId.COUMADIN_RIDGE,
      StructureId.CORONARY_ARTERIES_LMCA_RCA_LCX,
      StructureId.WATCHMAN_FLX_DEVICE,
    ],
    clinicalPurpose:
      'Provides continuous real-time ICE visualization of the 3-stage Watchman FLX / FLX Pro deployment mechanics (FLX Ball -> Triangle -> Full Deployment) and partial/full recapture maneuvers.',
    fellowPearlsAndPitfalls: [
      'Pearl — The "FLX Ball" Safety Revolution: Unlike legacy open-tined devices that could perforate the thin LAA apex during advancement, the closed distal FLX Ball can be safely advanced ("rolled") into the target lobe under live ICE guidance.',
      'Pearl — Tantalum Shoulder Markers on Watchman FLX Pro: Watchman FLX Pro adds three 3D radiopaque/echogenic tantalum markers spaced 120° apart on the proximal shoulder, producing bright specular reflectors on ICE at the exact landing zone plane.',
      'Pitfall — Asymmetric Shoulder Protrusion ("Canted Device"): If one shoulder protrudes > 1/3 of device height into the LA while the opposite shoulder dives deep, partially recapture back to the FLX Ball, adjust sheath torque/curve for coaxiality, and redeploy.',
    ],
    literatureCitations: ['korsholm_2022', 'gianni_2021_watchman', 'boston_scientific_flx_ifus'],
  },
  {
    id: 'wm_10',
    number: 28,
    track: 'watchman_laac',
    title: 'Step 5C — Watchman FLX PASS Criteria & Color Doppler Seal Verification',
    shortTitle: '28. Step 5C: PASS Criteria & Doppler Seal',
    recommendedCatheter: 'nuvision_10f',
    startingViewId: 'wm_09',
    targetState: {
      model: 'nuvision_10f',
      station: 'la_transseptal',
      sMm: 2,
      torqueDeg: 14,
      apDeg: -10,
      lrDeg: 0,
      omniDeg: 135,
      biplaneEnabled: false,
      volume4dEnabled: false,
    },
    recommendedDepthCm: 8,
    maneuverBullets: [
      'Before releasing the threaded core wire, verify all four P-A-S-S Criteria across 0°, 45°, 90°, and 135° (via the 3 canonical 2D LA stations or NuVision electronic multiplane sweep).',
      'P — Position: Confirm the proximal PET fabric plane sits at or 1–2 mm distal to the LAA ostium with zero uncovered proximal lobes and zero Mitral/LSPV overhang.',
      'A — Anchor: Click "Trigger Tug Test" in the Watchman Deck to pull the deployment cable backward; verify on live ICE that the LAA wall and Coumadin Ridge deflect synchronously inward with < 2 mm recoil and zero device slippage.',
      'S — Size & S — Seal: Measure outer shoulder-to-shoulder deployed diameter to confirm 10% to 30% compression across all 4 angles, and activate Color Doppler (Nyquist 30–40 cm/s) to confirm complete LAA flow exclusion (zero peri-device leak >= 3 mm) before switching stage to "Released".',
    ],
    sectorAnatomy: {
      nearFieldApex: 'Left Atrial blood pool, proximal PET fabric cap, and central threaded hub (detached after CCW core-wire release).',
      midField: 'Compressed 18-strut Watchman FLX frame (10–30% radial compression) anchored between the Coumadin Ridge (2–3 o\'clock) and LCx (6–7 o\'clock) with BART Color Doppler confirming laminar LA flow outside the cap and zero flow inside the LAA.',
      farField: 'Thrombosing/excluded distal LAA lobes behind the nitinol frame and intact posterolateral pericardial space (4–7 o\'clock).',
      distalRightEdge: 'Superior Coumadin Ridge margin inspected on Color Doppler for superior peri-device leak jets (2–3 o\'clock).',
      proximalLeftEdge: 'Inferior LCx / Mitral margin inspected on Color Doppler for inferior peri-device leak jets and unobstructed MV inflow (6–8 o\'clock).',
    },
    expectedStructureIds: [
      StructureId.LA_CAVITY,
      StructureId.LAA_OSTIUM_AND_LOBES,
      StructureId.COUMADIN_RIDGE,
      StructureId.CORONARY_ARTERIES_LMCA_RCA_LCX,
      StructureId.MITRAL_VALVE_AML_PML,
      StructureId.WATCHMAN_FLX_DEVICE,
    ],
    clinicalPurpose:
      'Executes the mandatory pre-release and post-release P-A-S-S (Position, Anchor, Size 10–30%, Seal) audit on Left Atrial ICE prior to uncoupling the Watchman FLX / FLX Pro core wire.',
    fellowPearlsAndPitfalls: [
      'Pearl — The 10% to 30% Compression Law (FLX & FLX Pro): Compression % = (1 - D_deployed / D_nominal) x 100%. Under-compression (< 10%) risks device embolization; over-compression (> 30%) causes fabric folding ("strawberry deformity").',
      'Pearl — Low-Nyquist Color Doppler Seal Audit: Always lower the Color Doppler Nyquist scale to 30–40 cm/s when sweeping the superior Coumadin Ridge and inferior LCx margins so low-velocity peri-device jets (< 3 mm vs >= 5 mm) are never missed.',
      'Pitfall — Premature Release Without Post-Tug Multi-Angle Check: Always re-sweep 0°, 45°, 90°, and 135° after the Tug Test and again after core-wire release, then withdraw to the RA/RV to document the final post-procedural pericardial check.',
    ],
    literatureCitations: ['korsholm_2022', 'alkhouli_2023', 'masson_2023', 'boston_scientific_flx_ifus'],
  },
];

export const ZERO_FLUORO_VIEWS: CanonicalICEView[] = CANONICAL_ICE_VIEWS.filter(
  (v) => v.track === 'zero_fluoro_ablation'
);

export const WATCHMAN_LAAC_VIEWS: CanonicalICEView[] = CANONICAL_ICE_VIEWS.filter(
  (v) => v.track === 'watchman_laac'
);

export function getCanonicalViewById(id: string): CanonicalICEView | undefined {
  return CANONICAL_ICE_VIEWS.find((v) => v.id === id);
}

export function getCanonicalViewsByTrack(track: ClinicalTrackId): CanonicalICEView[] {
  return CANONICAL_ICE_VIEWS.filter((v) => v.track === track);
}

/**
 * Computes the quantitative 6-DOF Fellow Practice Challenge alignment score (0..100%)
 * and actionable directional coaching prompt comparing the fellow's live CatheterState
 * against a target CanonicalICEView.
 */
export interface ChallengeAlignmentResult {
  overallScorePct: number;
  stationMatch: boolean;
  deltaSMm: number;
  deltaTorqueDeg: number;
  deltaApDeg: number;
  deltaLrDeg: number;
  deltaOmniDeg: number;
  passed: boolean;
  coachingPrompt: string;
}

export function evaluatePracticeChallengeAlignment(
  live: CatheterState,
  targetView: CanonicalICEView,
  intersectedStructureIds: number[] = []
): ChallengeAlignmentResult {
  const target = targetView.targetState;
  const stationMatch = live.station === target.station;

  const deltaSMm = target.sMm - live.sMm;
  // Shortest signed angular difference in [-180, +180]
  let deltaTorqueDeg = ((target.torqueDeg - live.torqueDeg + 540) % 360) - 180;
  if (deltaTorqueDeg === -180 && target.torqueDeg > live.torqueDeg) {
    deltaTorqueDeg = 180;
  }
  const deltaApDeg = target.apDeg - live.apDeg;
  const deltaLrDeg = target.lrDeg - live.lrDeg;
  const deltaOmniDeg =
    live.model === 'nuvision_10f' || targetView.recommendedCatheter === 'nuvision_10f'
      ? target.omniDeg - live.omniDeg
      : 0;

  if (!stationMatch) {
    const stationNames: Record<string, string> = {
      ra_venous: 'IVC / Right Atrium (RA)',
      rv_outflow: 'Right Ventricle / RVOT',
      la_transseptal: 'Left Atrium (Transseptal LA)',
    };
    return {
      overallScorePct: 12,
      stationMatch: false,
      deltaSMm,
      deltaTorqueDeg,
      deltaApDeg,
      deltaLrDeg,
      deltaOmniDeg,
      passed: false,
      coachingPrompt: `Transition catheter to the ${stationNames[target.station] ?? target.station} station (via organic valve/septal crossing or the Bottom Deck Station Pill) to acquire ${targetView.shortTitle}.`,
    };
  }

  // Normalized DOF accuracy components
  const sScore = Math.max(0, 1 - Math.abs(deltaSMm) / 38);
  const torqueScore = Math.max(0, 1 - Math.abs(deltaTorqueDeg) / 55);
  const apScore = Math.max(0, 1 - Math.abs(deltaApDeg) / 42);
  const lrScore = Math.max(0, 1 - Math.abs(deltaLrDeg) / 36);
  const omniScore =
    live.model === 'nuvision_10f' && target.station === 'la_transseptal'
      ? Math.max(0, 1 - Math.abs(deltaOmniDeg) / 60)
      : 1.0;

  let landmarkBonus = 1.0;
  if (intersectedStructureIds.length > 0 && targetView.expectedStructureIds.length > 0) {
    const hitCount = targetView.expectedStructureIds.filter((id) =>
      intersectedStructureIds.includes(id)
    ).length;
    landmarkBonus = hitCount / targetView.expectedStructureIds.length;
  }

  const kinematicBlend =
    0.20 * sScore +
    0.34 * torqueScore +
    0.26 * apScore +
    0.12 * lrScore +
    0.08 * omniScore;

  const rawPct = Math.round((0.82 * kinematicBlend + 0.18 * landmarkBonus) * 100);
  const overallScorePct = Math.max(0, Math.min(100, rawPct));
  const passed =
    overallScorePct >= 88 &&
    Math.abs(deltaSMm) <= 10 &&
    Math.abs(deltaTorqueDeg) <= 12 &&
    Math.abs(deltaApDeg) <= 10 &&
    Math.abs(deltaLrDeg) <= 10;

  // Build prioritized clinical coaching hint
  const hints: string[] = [];
  if (Math.abs(deltaTorqueDeg) > 6) {
    const dir = deltaTorqueDeg > 0 ? 'Clockwise (CW)' : 'Counterclockwise (CCW)';
    hints.push(`rotate ${dir} by ${Math.abs(Math.round(deltaTorqueDeg))}°`);
  }
  if (Math.abs(deltaApDeg) > 5) {
    const dir = deltaApDeg > 0 ? 'Anterior (A)' : 'Posterior (P)';
    hints.push(`apply ${Math.abs(Math.round(deltaApDeg))}° more ${dir} deflection`);
  }
  if (Math.abs(deltaSMm) > 6) {
    const dir = deltaSMm > 0 ? 'advance' : 'withdraw';
    hints.push(`${dir} shaft by ${Math.abs(Math.round(deltaSMm))} mm`);
  }
  if (Math.abs(deltaLrDeg) > 5) {
    const dir = deltaLrDeg > 0 ? 'Left (L)' : 'Right (R)';
    hints.push(`add ${Math.abs(Math.round(deltaLrDeg))}° ${dir} tilt`);
  }
  if (live.model === 'nuvision_10f' && Math.abs(deltaOmniDeg) > 8) {
    hints.push(`set NuVision Omniplane toward ${target.omniDeg}°`);
  }

  const coachingPrompt = passed
    ? `Locked on ${targetView.shortTitle} (${overallScorePct}% match) — all target landmarks are centered in the sector.`
    : hints.length > 0
      ? `Coaching: Please ${hints.slice(0, 2).join(' and ')} to center ${targetView.shortTitle}.`
      : `Fine-tune knob alignment by 1–3° to lock onto ${targetView.shortTitle}.`;

  return {
    overallScorePct,
    stationMatch: true,
    deltaSMm,
    deltaTorqueDeg,
    deltaApDeg,
    deltaLrDeg,
    deltaOmniDeg,
    passed,
    coachingPrompt,
  };
}
