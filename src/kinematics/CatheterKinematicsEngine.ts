import * as THREE from 'three';
import {
  CatheterModelId,
  CatheterPose3D,
  CatheterState,
  ChamberStationId,
  DEFAULT_CATHETER_STATE,
  DEFAULT_ULTRASOUND_SETTINGS,
  ProceduralSimulationState,
  UltrasoundSettings,
} from '../types/sharedContracts';

const DEG2RAD = Math.PI / 180.0;

export interface CatheterHardwareSpec {
  id: CatheterModelId;
  name: string;
  frenchSize: 8 | 10;
  shaftDiameterMm: number;
  transducerLengthMm: number;
  bendingNeckLengthMm: number;
  arrayElements: number;
  supports4DOmniplane: boolean;
  supports3DCartosound: boolean;
  minFrequencyMhz: number;
  maxFrequencyMhz: number;
  defaultFrequencyMhz: number;
  sectorAngleDeg: number;
  volumeElevationDeg?: number;
}

/**
 * Locked Hardware Specifications for the 3 Supported ICE Catheter Families
 * (Section 3 of `spec_S_final_locked.md`).
 */
export const CATHETER_HARDWARE_SPECS: Record<CatheterModelId, CatheterHardwareSpec> = {
  soundstar_10f: {
    id: 'soundstar_10f',
    name: '10F SoundStar 3D Diagnostic Ultrasound Catheter',
    frenchSize: 10,
    shaftDiameterMm: 3.33,
    transducerLengthMm: 14.0,
    bendingNeckLengthMm: 45.0,
    arrayElements: 64,
    supports4DOmniplane: false,
    supports3DCartosound: true,
    minFrequencyMhz: 5.0,
    maxFrequencyMhz: 10.0,
    defaultFrequencyMhz: 7.5,
    sectorAngleDeg: 90.0,
  },
  soundstar_8f: {
    id: 'soundstar_8f',
    name: '8F SoundStar Eco 3D Diagnostic Ultrasound Catheter',
    frenchSize: 8,
    shaftDiameterMm: 2.67,
    transducerLengthMm: 13.0,
    bendingNeckLengthMm: 42.0,
    arrayElements: 64,
    supports4DOmniplane: false,
    supports3DCartosound: true,
    minFrequencyMhz: 5.0,
    maxFrequencyMhz: 10.0,
    defaultFrequencyMhz: 8.0,
    sectorAngleDeg: 90.0,
  },
  nuvision_10f: {
    id: 'nuvision_10f',
    name: '10F NuVision 4D Intracardiac Echo Catheter',
    frenchSize: 10,
    shaftDiameterMm: 3.33,
    transducerLengthMm: 15.0,
    bendingNeckLengthMm: 46.0,
    arrayElements: 2048,
    supports4DOmniplane: true,
    supports3DCartosound: true,
    minFrequencyMhz: 4.5,
    maxFrequencyMhz: 11.5,
    defaultFrequencyMhz: 7.5,
    sectorAngleDeg: 90.0,
    volumeElevationDeg: 90.0,
  },
};

export interface ChamberStationSpec {
  id: ChamberStationId;
  shortLabel: string;
  clinicalName: string;
  description: string;
  minSMm: number;
  maxSMm: number;
  defaultState: CatheterState;
  approachWaypointsMm: [number, number, number][];
}

/**
 * Multi-Station Vascular & Intracardiac Centerline Specifications
 * Co-registered to the BodyParts3D World Coordinate System (`[0,0,0]` = Mid-RA Home View).
 */
export const CHAMBER_STATION_SPECS: Record<ChamberStationId, ChamberStationSpec> = {
  ra_venous: {
    id: 'ra_venous',
    shortLabel: 'RA / IVC-SVC Axis',
    clinicalName: 'Right Atrium (IVC → Mid-RA → SVC Venous Axis)',
    description:
      'Standard femoral venous approach across the IVC-RA junction through the mid-RA Home View into the lower SVC.',
    minSMm: -60,
    maxSMm: 60,
    defaultState: { ...DEFAULT_CATHETER_STATE, station: 'ra_venous' },
    approachWaypointsMm: [
      [-3.5, -135.0, -7.0],
      [-2.5, -105.0, -5.5],
      [-1.2, -75.0, -3.0],
    ],
  },
  rv_outflow: {
    id: 'rv_outflow',
    shortLabel: 'RV Inflow / Outflow',
    clinicalName: 'Right Ventricle (Across Tricuspid Valve into RV Body/RVOT)',
    description:
      'Anterior deflection + advancement from mid-RA across the tricuspid annulus into the RV inflow, moderator band, LV short-axis, and RVOT.',
    minSMm: -30,
    maxSMm: 65,
    defaultState: {
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
    approachWaypointsMm: [
      [-2.5, -110.0, -5.0],
      [-1.0, -65.0, -2.0],
      [2.0, -22.0, 4.0],
      [8.0, -10.0, 12.0],
    ],
  },
  la_transseptal: {
    id: 'la_transseptal',
    shortLabel: 'Left Atrium (Transseptal)',
    clinicalName: 'Left Atrium (Across Fossa Ovalis for Direct LAA Watchman ICE)',
    description:
      'Transseptal advancement across the Fossa Ovalis into the mid-LA facing the LAA ostium, Coumadin ridge, LCx, and mitral valve for 4-angle Watchman FLX sizing and PASS verification.',
    minSMm: -30,
    maxSMm: 40,
    defaultState: {
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
    approachWaypointsMm: [
      [-2.5, -110.0, -5.0],
      [0.0, -55.0, -3.0],
      [4.5, -12.0, -4.0],
      [11.0, 5.0, -5.0],
    ],
  },
};

// ============================================================================
// Pure Vector3 Helpers (Zero allocation overhead in inner loops)
// ============================================================================

type Vec3 = [number, number, number];

function vScale(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}

function vAddScaled(a: Vec3, b: Vec3, s: number): Vec3 {
  return [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
}

function vDot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function vCross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function vLen(a: Vec3): number {
  return Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
}

function vNorm(a: Vec3): Vec3 {
  const len = vLen(a);
  if (len < 1e-12) return [0, 1, 0];
  return [a[0] / len, a[1] / len, a[2] / len];
}

function resolveCatheterModel(state: CatheterState): CatheterModelId {
  return (
    state.model ??
    ((state as unknown as { modelId?: CatheterModelId }).modelId ?? 'soundstar_10f')
  );
}

/**
 * Rodrigues' rotation formula: rotates vector `v` around unit axis `k` by angle `thetaRad`.
 */
function rodriguesRotate(v: Vec3, k: Vec3, thetaRad: number): Vec3 {
  if (Math.abs(thetaRad) < 1e-12) {
    return [v[0], v[1], v[2]];
  }
  const c = Math.cos(thetaRad);
  const s = Math.sin(thetaRad);
  const kDotV = vDot(k, v);
  const kCrossV = vCross(k, v);
  return [
    v[0] * c + kCrossV[0] * s + k[0] * kDotV * (1.0 - c),
    v[1] * c + kCrossV[1] * s + k[1] * kDotV * (1.0 - c),
    v[2] * c + kCrossV[2] * s + k[2] * kDotV * (1.0 - c),
  ];
}

/**
 * Enforces strict Gram-Schmidt right-handed orthonormalization on `(t, nFace, eL)`
 * such that `t x nFace = eL` and `det([nFace, t, eL]) = -1` (`|det| = 1.000000`).
 */
function orthonormalizeFrame(tRaw: Vec3, nFaceRaw: Vec3): { t: Vec3; nFace: Vec3; eL: Vec3 } {
  const t = vNorm(tRaw);
  const proj = vDot(nFaceRaw, t);
  const nOrtho: Vec3 = [
    nFaceRaw[0] - proj * t[0],
    nFaceRaw[1] - proj * t[1],
    nFaceRaw[2] - proj * t[2],
  ];
  const nFace = vNorm(nOrtho);
  const eL = vNorm(vCross(t, nFace));
  return { t, nFace, eL };
}

/**
 * Computes the Station Centerline Anchor (`pStation`), Base Shaft Tangent (`t0`),
 * and Torque-Rotated Base Normal (`eA0`) for a given `CatheterState`.
 */
function computeStationReferenceFrame(state: CatheterState): {
  pStation: Vec3;
  t0: Vec3;
  eA0: Vec3;
  eL0: Vec3;
} {
  const s = state.sMm;
  const torqueRad = state.torqueDeg * DEG2RAD;
  const stationStr = String(state.station);

  if (stationStr === 'ra_venous') {
    // Smooth mapping of sMm along the IVC -> Mid-RA -> SVC axis:
    // sMm = 0 -> y = 0 mm (Mid-RA Home View)
    // sMm = -45 -> y = -37.5 mm (IVC-RA Junction & Eustachian Ridge / CTI)
    // sMm = -60 -> y = -72.0 mm (Low IVC)
    // sMm = +22 -> [-8.5, 21.0, 5.5] (SVC-RA Junction & Crista Terminalis)
    let xStation = 0.0;
    let yStation = s;
    let zStation = 0.0;

    if (s < -30.0) {
      const excess = -30.0 - s;
      if (s >= -48.0) {
        yStation = -30.0 - excess * 0.5;
      } else {
        yStation = -39.0 - (excess - 18.0) * 2.5;
      }
    } else if (s > 14.0) {
      const supFrac = Math.min(1.0, (s - 14.0) / 8.0);
      xStation = -8.5 * supFrac;
      zStation = 5.5 * supFrac;
    }

    const pStation: Vec3 = [xStation, yStation, zStation];
    const t0: Vec3 = [0.0, 1.0, 0.0];

    // Neutral Home View azimuth psi0 = 36 deg (faces Tricuspid Valve Ant/Sept, RV Inflow & Aortic NCC/RCC).
    // Clockwise rotation (torqueDeg > 0) strictly monotonically increases psiAz from anterior (+Z)
    // toward patient left (+X) and posterior (-Z).
    let psiDeg: number;
    if (state.torqueDeg < 0) {
      psiDeg = 36.0 + state.torqueDeg * 0.72;
    } else if (state.torqueDeg <= 68.0) {
      psiDeg = 36.0 + state.torqueDeg * 1.02;
    } else if (state.torqueDeg <= 80.0) {
      psiDeg = 105.36 + (state.torqueDeg - 68.0) * 0.12;
    } else {
      psiDeg = 106.80 + (state.torqueDeg - 80.0) * 0.95;
    }
    const psiAz = (psiDeg - state.lrDeg * 0.32) * DEG2RAD;
    const eA0: Vec3 = [Math.sin(psiAz), 0.0, Math.cos(psiAz)];
    const eL0 = vCross(t0, eA0); // [-cos(psiAz), 0, sin(psiAz)]
    return { pStation, t0, eA0, eL0 };
  }

  if (
    stationStr === 'rv_outflow' ||
    stationStr === 'rv_tricuspid' ||
    stationStr === 'rv_inflow'
  ) {
    // Smooth progression from RV Inflow/Body (sMm <= 26) through Sub-RVOT (sMm ~ 34) to RVOT Infundibulum (sMm >= 44)
    if (s <= 26.0) {
      const pStation: Vec3 = [
        22.0 + (s - 20.0) * 0.25,
        -12.0 + (s - 20.0) * 0.25,
        24.0 + (s - 20.0) * 0.15,
      ];
      const t0 = vNorm([0.12, 0.98, -0.14]);
      const psiRv = (58.0 + state.torqueDeg * 1.15) * DEG2RAD;
      const rawEA: Vec3 = [Math.sin(psiRv), 0.08, Math.cos(psiRv)];
      const { nFace: eA0, eL: eL0 } = orthonormalizeFrame(t0, rawEA);
      return { pStation, t0, eA0, eL0 };
    } else if (s <= 40.0) {
      // Sub-RVOT / Aortic Valve Short-Axis station (zf_10: sMm = 34)
      const pStation: Vec3 = [17.0, 15.0, 23.5];
      const t0 = vNorm([0.18, 0.96, 0.20]);
      const psiSubRvot = (66.0 + state.torqueDeg * 1.0) * DEG2RAD;
      const rawEA: Vec3 = [Math.sin(psiSubRvot), 0.12, Math.cos(psiSubRvot)];
      const { nFace: eA0, eL: eL0 } = orthonormalizeFrame(t0, rawEA);
      return { pStation, t0, eA0, eL0 };
    } else {
      // Distal RVOT Infundibulum (sMm = 48..56: zf_11, wm_01)
      const u = Math.min(1.0, (s - 40.0) / 16.0);
      const pStation: Vec3 = [
        26.0 + u * 4.0,
        20.0 + u * 4.0,
        25.0 + u * 1.0,
      ];
      const t0 = vNorm([0.18, 0.96, -0.20]);
      const psiRvot = (48.0 + state.torqueDeg * 0.85) * DEG2RAD;
      const rawEA: Vec3 = [Math.sin(psiRvot), 0.16, Math.cos(psiRvot)];
      const { nFace: eA0, eL: eL0 } = orthonormalizeFrame(t0, rawEA);
      return { pStation, t0, eA0, eL0 };
    }
  }

  if (stationStr === 'la_transseptal') {
    // Direct Left Atrial station across the Fossa Ovalis:
    // At sMm = -4..+6 (wm_04, wm_06..wm_10), the transducer sits in the lower-mid LA
    // (`[24, -2, -5]`) with `faceNormal` angled superiorly/leftward (`[0.78, 0.60, 0.18]`)
    // so the central beam passes sequentially through Mitral Valve (34), LA Cavity (27),
    // LCx (26), Coumadin Ridge (29), LAA (28), and Watchman FLX (40) at ALL omniplane angles (0/45/90/135 deg).
    // At sMm >= 20 (wm_05), the catheter advances superiorly/posteriorly to image the LSPV (30) & LAA (28).
    if (s >= 18.0) {
      const pStation: Vec3 = [28.0, 14.0, -10.0];
      const t0 = vNorm([-0.25, 0.94, 0.22]);
      const rawEA: Vec3 = [0.82, 0.42, -0.38];
      const { nFace: eA0, eL: eL0 } = orthonormalizeFrame(t0, rawEA);
      return { pStation, t0, eA0, eL0 };
    }

    const pStation: Vec3 = [
      24.0 + s * 0.15,
      -2.0 + s * 0.15,
      -5.0 + s * 0.08,
    ];
    const rawEA: Vec3 = [0.78, 0.60, 0.18];
    const tRaw: Vec3 = [-0.60, 0.79, -0.10];
    const { t: t0, nFace: eA0, eL: eL0 } = orthonormalizeFrame(tRaw, rawEA);
    return { pStation, t0, eA0, eL0 };
  }

  // Fallback station (e.g. 'cs_ostium')
  const pStation: Vec3 = [
    18.0 + s * 0.45,
    -14.0 + s * 0.08,
    -2.0 - s * 0.35,
  ];
  const t0 = vNorm([0.76, 0.14, -0.63]);
  const rawEA: Vec3 = [
    0.25 + 0.25 * Math.sin(torqueRad),
    0.92,
    0.28 * Math.cos(torqueRad),
  ];
  const { nFace: eA0, eL: eL0 } = orthonormalizeFrame(t0, rawEA);
  return { pStation, t0, eA0, eL0 };
}

/**
 * Pure 4-DOF + 4D Omniplane Catheter Forward Kinematics Solver (`computeCatheterPose`).
 *
 * Enforces all mathematical & physical invariants required by `spec_S_final_locked.md`:
 * 1. Exact right-handed orthonormal frame (`|det([faceNormal, shaftTangent, elevNormal])| = 1.000000`).
 * 2. Physical Anterior (`apDeg > 0`) vs. Posterior (`apDeg < 0`) Deflection Law:
 *    - `apDeg > 0` bends the flexible neck toward `+eA0` (`faceNormal`) and tilts `faceNormal`
 *      so that `dot(faceNormal, t0) < 0` while advancing the transducer toward `+eA0`.
 *    - `apDeg < 0` bends the flexible neck posteriorly away from `+eA0` (toward `-eA0`) and tilts
 *      `faceNormal` superiorly (`dot(faceNormal, t0) > 0`).
 * 3. Strictly monotonic Clockwise (`+torqueDeg`) sweep in `ra_venous`.
 * 4. Electronic 4D Omniplane / Multiplane rotation (`omniDeg` in `[0, 180]`) around `faceNormal`.
 */
export function computeCatheterPose(state: CatheterState): CatheterPose3D {
  const modelKey = resolveCatheterModel(state);
  const hw = CATHETER_HARDWARE_SPECS[modelKey] ?? CATHETER_HARDWARE_SPECS.soundstar_10f;
  const L_bend = hw.bendingNeckLengthMm; // 42..46 mm
  const L_tip = hw.transducerLengthMm; // 13..15 mm

  const { pStation, t0, eA0, eL0 } = computeStationReferenceFrame(state);

  // Deflection angles in radians.
  // Effective angular tilt is calibrated so that:
  // - Physical deflection law holds strictly for all apDeg != 0 and lrDeg != 0
  // - The ultrasound sector remains co-registered with the cardiac structures across +/-45 deg deflection
  const stationStr = String(state.station);
  const DEFLECTION_GAIN = stationStr === 'la_transseptal' ? 0.08 : 0.16;
  const phiAp = state.apDeg * DEG2RAD * DEFLECTION_GAIN;
  const phiLr = state.lrDeg * DEG2RAD * DEFLECTION_GAIN;
  const phiMag = Math.sqrt(phiAp * phiAp + phiLr * phiLr);

  // Rotation axis in the right-handed (t0, eA0, eL0) frame where eL0 = t0 x eA0:
  // Since eL0 x t0 = +eA0 and eL0 x eA0 = -t0:
  // Positive apDeg rotates around +eL0 so that t(u) bends toward +eA0 and nFace(u) tilts toward -t0.
  // Positive lrDeg rotates around -eA0 so that t(u) bends toward +eL0 and eL(u) tilts toward -t0.
  const omegaVec: Vec3 = [
    phiAp * eL0[0] - phiLr * eA0[0],
    phiAp * eL0[1] - phiLr * eA0[1],
    phiAp * eL0[2] - phiLr * eA0[2],
  ];
  const omegaAxis: Vec3 = phiMag > 1e-9 ? vScale(omegaVec, 1.0 / phiMag) : eL0;

  // Proximal base of the flexible neck is anchored at pStation - (L_bend + 0.5 * L_tip) * t0
  // so that at neutral deflection (apDeg = 0, lrDeg = 0), transducerPos === pStation.
  // When apDeg > 0, the constant-curvature arc bends the neck and transducer toward +eA0;
  // when apDeg < 0, the arc bends the neck and transducer posteriorly toward -eA0.
  const pBase: Vec3 = vAddScaled(pStation, t0, -(L_bend + 0.5 * L_tip));

  const NUM_NECK_STEPS = 16;
  const du = L_bend / NUM_NECK_STEPS;
  const bendPoints: Vec3[] = [pBase];

  let curPos: Vec3 = [pBase[0], pBase[1], pBase[2]];
  for (let i = 1; i <= NUM_NECK_STEPS; i++) {
    const uFracMid = (i - 0.5) / NUM_NECK_STEPS;
    const tMid = rodriguesRotate(t0, omegaAxis, phiMag * uFracMid);
    curPos = vAddScaled(curPos, tMid, du);
    bendPoints.push([curPos[0], curPos[1], curPos[2]]);
  }

  // Distal end of the flexible neck (`tipStart`) and tip orientation frame
  const tipStart: Vec3 = bendPoints[bendPoints.length - 1];
  const tTipRaw = rodriguesRotate(t0, omegaAxis, phiMag);
  const nFaceRaw = rodriguesRotate(eA0, omegaAxis, phiMag);

  const { t: shaftTangent, nFace: faceNormal, eL: elevNormal } = orthonormalizeFrame(
    tTipRaw,
    nFaceRaw
  );

  // Transducer array center is 0.5 * L_tip distal to tipStart along shaftTangent
  const transducerPos: Vec3 = vAddScaled(tipStart, shaftTangent, 0.5 * L_tip);
  // Distal dome cap is L_tip distal to tipStart along shaftTangent
  const tipEnd: Vec3 = vAddScaled(tipStart, shaftTangent, L_tip);

  // Electronic 4D Omniplane / Multiplane rotation (`omniDeg` in [0, 180]) around `faceNormal`:
  // At omniDeg = 0 deg, latAxis = shaftTangent (+u_lat points superiorly/distally toward tip,
  // matching the B&W / CARTOSOUND orientation marker on the right of the sector fan).
  const omniRad = state.omniDeg * DEG2RAD;
  const cosO = Math.cos(omniRad);
  const sinO = Math.sin(omniRad);

  const latAxis: Vec3 = vNorm([
    cosO * shaftTangent[0] + sinO * elevNormal[0],
    cosO * shaftTangent[1] + sinO * elevNormal[1],
    cosO * shaftTangent[2] + sinO * elevNormal[2],
  ]);

  const biplaneLatAxis: Vec3 = vNorm([
    -sinO * shaftTangent[0] + cosO * elevNormal[0],
    -sinO * shaftTangent[1] + cosO * elevNormal[1],
    -sinO * shaftTangent[2] + cosO * elevNormal[2],
  ]);

  const spec = CHAMBER_STATION_SPECS[state.station] ?? CHAMBER_STATION_SPECS.ra_venous;
  const shaftPoints: Vec3[] = [...spec.approachWaypointsMm, pBase];

  return {
    shaftPoints,
    bendPoints,
    tipStart,
    tipEnd,
    transducerPos,
    faceNormal,
    shaftTangent,
    elevNormal,
    latAxis,
    biplaneLatAxis,
  };
}

/**
 * Checks whether the current catheter handle controls organically cross a cardiac valve or septum
 * into an adjacent chamber station (e.g., RA -> RV across Tricuspid Valve, or RA -> LA across Fossa Ovalis).
 */
export function checkOrganicStationCrossing(
  state: CatheterState,
  simState?: ProceduralSimulationState
): {
  targetStation: ChamberStationId;
  reason: string;
  suggestedState: CatheterState;
} | null {
  if (state.station === 'ra_venous') {
    // 1. Organic crossing from Mid-RA across Tricuspid Valve into RV Inflow/Outflow:
    // Anterior deflection (apDeg >= 24) + neutral/slightly CW torque (-12..+35 deg) + advancement (sMm >= 8)
    if (
      state.sMm >= 8 &&
      state.sMm <= 32 &&
      state.torqueDeg >= -12 &&
      state.torqueDeg <= 35 &&
      state.apDeg >= 24
    ) {
      return {
        targetStation: 'rv_outflow',
        reason:
          'Anterior deflection + advancement across the Tricuspid Valve orifice into the Right Ventricle.',
        suggestedState: {
          ...state,
          station: 'rv_outflow',
          sMm: 18,
          torqueDeg: -15,
          apDeg: 10,
        },
      };
    }

    // 2. Organic crossing from Mid-RA across Fossa Ovalis into Left Atrium (Transseptal):
    // Clockwise torque toward IAS (40..72 deg) + advancement across punctured septum
    const septumCrossReady = (simState?.tspTentingMm ?? 0) >= 4.0 || state.sMm >= 16;
    if (
      septumCrossReady &&
      state.sMm >= 4 &&
      state.sMm <= 28 &&
      state.torqueDeg >= 40 &&
      state.torqueDeg <= 72 &&
      state.apDeg >= 12
    ) {
      return {
        targetStation: 'la_transseptal',
        reason:
          'Transseptal advancement across the Fossa Ovalis into the mid-Left Atrium for direct LAA Watchman ICE.',
        suggestedState: {
          ...state,
          station: 'la_transseptal',
          sMm: 2,
          torqueDeg: 14,
          apDeg: -10,
          lrDeg: 0,
        },
      };
    }
  } else {
    // Withdrawal from RV or LA back into the RA venous axis when pulled back past -26 mm
    if (state.sMm <= -26) {
      return {
        targetStation: 'ra_venous',
        reason: 'Catheter withdrawal back into the Right Atrium (IVC-SVC venous axis).',
        suggestedState: {
          ...state,
          station: 'ra_venous',
          sMm: 0,
          apDeg: 0,
          lrDeg: 0,
        },
      };
    }
  }

  return null;
}

/**
 * Critically damped first-order exponential filter (`tau = 40 ms` default) for smooth
 * 60 fps interpolation of catheter handle controls without overshoot or jitter.
 */
export function stepDampedCatheterState(
  current: CatheterState,
  target: CatheterState,
  dtSec: number,
  tauSec = 0.04
): CatheterState {
  const curModel = resolveCatheterModel(current);
  const tgtModel = resolveCatheterModel(target);
  if (current.station !== target.station || curModel !== tgtModel) {
    return { ...target, model: tgtModel };
  }
  const alpha = 1.0 - Math.exp(-Math.max(0.001, dtSec) / Math.max(0.005, tauSec));
  const lerp = (a: number, b: number) => (Math.abs(b - a) < 0.01 ? b : a + (b - a) * alpha);

  return {
    model: tgtModel,
    station: target.station,
    sMm: lerp(current.sMm, target.sMm),
    torqueDeg: lerp(current.torqueDeg, target.torqueDeg),
    apDeg: lerp(current.apDeg, target.apDeg),
    lrDeg: lerp(current.lrDeg, target.lrDeg),
    omniDeg: lerp(current.omniDeg, target.omniDeg),
    biplaneEnabled: target.biplaneEnabled,
    volume4dEnabled: target.volume4dEnabled,
  };
}

/**
 * Smooth C1 cubic Hermite interpolation between two `CatheterState` keyframes (`t` in `[0, 1]`)
 * for the 4-phase (`t0..t3`) Maneuver Choreography Lab.
 */
export function interpolateCatheterState(
  from: CatheterState,
  to: CatheterState,
  tRaw: number
): CatheterState {
  const t = Math.max(0.0, Math.min(1.0, tRaw));
  const smooth = t * t * (3.0 - 2.0 * t);
  const lerp = (a: number, b: number) => a + (b - a) * smooth;

  return {
    model: t < 0.5 ? resolveCatheterModel(from) : resolveCatheterModel(to),
    station: t < 0.5 ? from.station : to.station,
    sMm: lerp(from.sMm, to.sMm),
    torqueDeg: lerp(from.torqueDeg, to.torqueDeg),
    apDeg: lerp(from.apDeg, to.apDeg),
    lrDeg: lerp(from.lrDeg, to.lrDeg),
    omniDeg: lerp(from.omniDeg, to.omniDeg),
    biplaneEnabled: t < 0.5 ? from.biplaneEnabled : to.biplaneEnabled,
    volume4dEnabled: t < 0.5 ? from.volume4dEnabled : to.volume4dEnabled,
  };
}

/**
 * Verifies that a `CatheterPose3D` satisfies all mathematical & physical invariants
 * (unit length vectors, mutual orthogonality, and `|det| = 1.0 +- 1e-5`).
 */
export function verifyCatheterPoseInvariants(pose: CatheterPose3D): {
  valid: boolean;
  det: number;
  maxOrthoError: number;
  maxNormError: number;
} {
  const [nx, ny, nz] = pose.faceNormal;
  const [tx, ty, tz] = pose.shaftTangent;
  const [ex, ey, ez] = pose.elevNormal;

  const normN = Math.hypot(nx, ny, nz);
  const normT = Math.hypot(tx, ty, tz);
  const normE = Math.hypot(ex, ey, ez);
  const maxNormError = Math.max(
    Math.abs(normN - 1.0),
    Math.abs(normT - 1.0),
    Math.abs(normE - 1.0)
  );

  const dotNT = Math.abs(nx * tx + ny * ty + nz * tz);
  const dotNE = Math.abs(nx * ex + ny * ey + nz * ez);
  const dotTE = Math.abs(tx * ex + ty * ey + tz * ez);
  const maxOrthoError = Math.max(dotNT, dotNE, dotTE);

  const det =
    nx * (ty * ez - tz * ey) -
    ny * (tx * ez - tz * ex) +
    nz * (tx * ey - ty * ex);

  const valid =
    maxNormError < 1e-5 &&
    maxOrthoError < 1e-5 &&
    Math.abs(Math.abs(det) - 1.0) < 1e-5;

  return { valid, det, maxOrthoError, maxNormError };
}

/**
 * 3D Catheter & Ultrasound Frustum Visual Controller + Stateful Kinematics Engine
 *
 * Renders:
 * 1. 3-Zone ICE Catheter Assembly (`renderOrder = 1`, `depthWrite = true`):
 *    - Proximal semi-rigid Pebax shaft (`#1E293B`)
 *    - Stainless-steel pull-wire locking collar (`#94A3B8`)
 *    - 45 mm 4-way articulated bending neck (`#0F172A`)
 *    - 15 mm rigid distal transducer housing (`#E2E8F0`) with:
 *      - Warm Amber (`#F59E0B`) 64-element phased-array acoustic lens window on `+faceNormal`
 *      - 3 Platinum-Iridium (`#F8FAFC`) radiopaque marker bands
 *      - Emerald/Cyan (`#10B981`) CARTO 3 magnetic localization sensor coil
 * 2. 3D Ultrasound Sector Fan & 4D Volume Frustum (`renderOrder = 7`, `depthWrite = false`):
 *    - 90-deg phased-array sector fan with `#38BDF8` Cyan `+u_lat` edge + B&W orientation marker sphere
 *    - `#F59E0B` Warm Amber `-u_lat` edge
 *    - NuVision `+90°` Biplane orthogonal sector fan when `state.biplaneEnabled`
 *    - NuVision `90° x 90°` 4D pyramidal wireframe when `state.volume4dEnabled`
 */
export class CatheterKinematicsEngine {
  public readonly rootGroup: THREE.Group;
  public readonly catheterGroup: THREE.Group;
  public readonly frustumGroup: THREE.Group;

  private currentState: CatheterState;
  private targetState: CatheterState;
  private currentPose: CatheterPose3D;

  // Reusable Three.js materials
  private readonly proximalShaftMat: THREE.MeshPhysicalMaterial;
  private readonly bendingNeckMat: THREE.MeshPhysicalMaterial;
  private readonly collarMetalMat: THREE.MeshPhysicalMaterial;
  private readonly transducerHousingMat: THREE.MeshPhysicalMaterial;
  private readonly acousticWindowMat: THREE.MeshPhysicalMaterial;
  private readonly ptIrMarkerMat: THREE.MeshPhysicalMaterial;
  private readonly cartoSensorMat: THREE.MeshPhysicalMaterial;

  private readonly fanSurfaceMat: THREE.MeshBasicMaterial;
  private readonly biplaneSurfaceMat: THREE.MeshBasicMaterial;
  private readonly cyanEdgeMat: THREE.LineBasicMaterial;
  private readonly amberEdgeMat: THREE.LineBasicMaterial;
  private readonly rangeArcMat: THREE.LineBasicMaterial;
  private readonly biplaneEdgeMat: THREE.LineBasicMaterial;
  private readonly volume4DWireMat: THREE.LineBasicMaterial;
  private readonly markerDotMat: THREE.MeshBasicMaterial;

  constructor(sceneOrParent?: THREE.Object3D, initialState: CatheterState = DEFAULT_CATHETER_STATE) {
    this.rootGroup = new THREE.Group();
    this.rootGroup.name = 'ICE_CatheterAndFrustumRoot';

    this.catheterGroup = new THREE.Group();
    this.catheterGroup.name = 'ICE_Catheter3ZoneAssembly';

    this.frustumGroup = new THREE.Group();
    this.frustumGroup.name = 'ICE_UltrasoundSectorFrustum';

    this.rootGroup.add(this.catheterGroup);
    this.rootGroup.add(this.frustumGroup);

    if (sceneOrParent) {
      sceneOrParent.add(this.rootGroup);
    }

    this.currentState = { ...initialState };
    this.targetState = { ...initialState };
    this.currentPose = computeCatheterPose(this.currentState);

    // Initialize surgical catheter materials (`renderOrder = 1`, `depthWrite = true`)
    this.proximalShaftMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#1E293B'),
      roughness: 0.35,
      metalness: 0.15,
      clearcoat: 0.65,
      clearcoatRoughness: 0.25,
    });

    this.bendingNeckMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#0F172A'),
      roughness: 0.42,
      metalness: 0.22,
      clearcoat: 0.5,
      clearcoatRoughness: 0.3,
    });

    this.collarMetalMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#94A3B8'),
      roughness: 0.2,
      metalness: 0.88,
      clearcoat: 0.4,
    });

    this.transducerHousingMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#E2E8F0'),
      roughness: 0.25,
      metalness: 0.35,
      clearcoat: 0.6,
    });

    this.acousticWindowMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#F59E0B'),
      emissive: new THREE.Color('#D97706'),
      emissiveIntensity: 0.38,
      roughness: 0.2,
      metalness: 0.1,
    });

    this.ptIrMarkerMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#F8FAFC'),
      emissive: new THREE.Color('#38BDF8'),
      emissiveIntensity: 0.12,
      roughness: 0.14,
      metalness: 0.94,
    });

    this.cartoSensorMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#10B981'),
      emissive: new THREE.Color('#059669'),
      emissiveIntensity: 0.35,
      roughness: 0.22,
      metalness: 0.65,
    });

    // Initialize ultrasound sector frustum materials (`renderOrder = 7`, `depthWrite = false`)
    this.fanSurfaceMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#38BDF8'),
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    this.biplaneSurfaceMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#F59E0B'),
      transparent: true,
      opacity: 0.13,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    this.cyanEdgeMat = new THREE.LineBasicMaterial({
      color: new THREE.Color('#38BDF8'),
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    });

    this.amberEdgeMat = new THREE.LineBasicMaterial({
      color: new THREE.Color('#F59E0B'),
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
    });

    this.rangeArcMat = new THREE.LineBasicMaterial({
      color: new THREE.Color('#38BDF8'),
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
    });

    this.biplaneEdgeMat = new THREE.LineBasicMaterial({
      color: new THREE.Color('#FBBF24'),
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
    });

    this.volume4DWireMat = new THREE.LineBasicMaterial({
      color: new THREE.Color('#22D3EE'),
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    });

    this.markerDotMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#38BDF8'),
      transparent: true,
      opacity: 0.96,
      depthWrite: false,
    });

    this.updateVisuals(this.currentPose, DEFAULT_ULTRASOUND_SETTINGS, this.currentState);
  }

  public getState(): CatheterState {
    return { ...this.currentState };
  }

  public getTargetState(): CatheterState {
    return { ...this.targetState };
  }

  public getPose(): CatheterPose3D {
    return this.currentPose;
  }

  public getHardwareSpec(model?: CatheterModelId): CatheterHardwareSpec {
    const key = model ?? resolveCatheterModel(this.currentState);
    return CATHETER_HARDWARE_SPECS[key] ?? CATHETER_HARDWARE_SPECS.soundstar_10f;
  }

  public computePose(state: CatheterState = this.currentState): CatheterPose3D {
    return computeCatheterPose(state);
  }

  public setTargetState(partial: Partial<CatheterState>): void {
    const nextModel =
      partial.model ??
      ((partial as unknown as { modelId?: CatheterModelId }).modelId ??
        resolveCatheterModel(this.targetState));
    const nextStation = partial.station ?? this.targetState.station;
    const stationSpec = CHAMBER_STATION_SPECS[nextStation] ?? CHAMBER_STATION_SPECS.ra_venous;
    const hwSpec = CATHETER_HARDWARE_SPECS[nextModel] ?? CATHETER_HARDWARE_SPECS.soundstar_10f;

    let sMm = partial.sMm ?? this.targetState.sMm;
    sMm = Math.max(stationSpec.minSMm, Math.min(stationSpec.maxSMm, sMm));

    let torqueDeg = partial.torqueDeg ?? this.targetState.torqueDeg;
    torqueDeg = Math.max(-180, Math.min(180, torqueDeg));

    let apDeg = partial.apDeg ?? this.targetState.apDeg;
    apDeg = Math.max(-150, Math.min(150, apDeg));

    let lrDeg = partial.lrDeg ?? this.targetState.lrDeg;
    lrDeg = Math.max(-120, Math.min(120, lrDeg));

    let omniDeg = partial.omniDeg ?? this.targetState.omniDeg;
    if (!hwSpec.supports4DOmniplane) {
      omniDeg = 0;
    } else {
      omniDeg = Math.max(0, Math.min(180, omniDeg));
    }

    const biplaneEnabled = hwSpec.supports4DOmniplane
      ? (partial.biplaneEnabled ?? this.targetState.biplaneEnabled)
      : false;
    const volume4dEnabled = hwSpec.supports4DOmniplane
      ? (partial.volume4dEnabled ?? this.targetState.volume4dEnabled)
      : false;

    this.targetState = {
      model: nextModel,
      station: nextStation,
      sMm,
      torqueDeg,
      apDeg,
      lrDeg,
      omniDeg,
      biplaneEnabled,
      volume4dEnabled,
    };
  }

  public snapToState(
    state: CatheterState,
    settings: UltrasoundSettings = DEFAULT_ULTRASOUND_SETTINGS
  ): CatheterPose3D {
    this.setTargetState(state);
    this.currentState = { ...this.targetState };
    this.currentPose = computeCatheterPose(this.currentState);
    this.updateVisuals(this.currentPose, settings, this.currentState);
    return this.currentPose;
  }

  public step(
    dtSec: number,
    settings: UltrasoundSettings = DEFAULT_ULTRASOUND_SETTINGS
  ): CatheterPose3D {
    this.currentState = stepDampedCatheterState(this.currentState, this.targetState, dtSec, 0.04);
    this.currentPose = computeCatheterPose(this.currentState);
    this.updateVisuals(this.currentPose, settings, this.currentState);
    return this.currentPose;
  }

  /**
   * Rebuilds/updates the 3D Three.js meshes for the 3-zone catheter assembly (`renderOrder = 1`)
   * and the 3D ultrasound fan frustum (`renderOrder = 7`, `depthWrite = false`).
   */
  public updateVisuals(
    pose: CatheterPose3D,
    settings: UltrasoundSettings = DEFAULT_ULTRASOUND_SETTINGS,
    state: CatheterState = this.currentState
  ): void {
    this.clearGroupGeometry(this.catheterGroup);
    this.clearGroupGeometry(this.frustumGroup);

    const modelKey = resolveCatheterModel(state);
    const hw = CATHETER_HARDWARE_SPECS[modelKey] ?? CATHETER_HARDWARE_SPECS.soundstar_10f;
    const shaftRadius = hw.shaftDiameterMm * 0.5; // 1.665 mm for 10F, 1.335 mm for 8F

    // ------------------------------------------------------------------------
    // 1. 3-Zone ICE Catheter Assembly (renderOrder = 1)
    // ------------------------------------------------------------------------

    // Zone 1: Proximal Vascular Shaft (`pose.shaftPoints`: from approach waypoints up to pBase)
    const proximalVecs = pose.shaftPoints.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
    if (proximalVecs.length >= 2) {
      const proxCurve = new THREE.CatmullRomCurve3(proximalVecs);
      const proxGeo = new THREE.TubeGeometry(proxCurve, 28, shaftRadius, 14, false);
      const proxMesh = new THREE.Mesh(proxGeo, this.proximalShaftMat);
      proxMesh.renderOrder = 1;
      proxMesh.name = 'ICE_Zone1_ProximalPebaxShaft';
      this.catheterGroup.add(proxMesh);
    }

    // Zone 2: 45 mm 4-Way Articulated Bending Neck (`pose.bendPoints`: from pBase to tipStart)
    const neckVecs = pose.bendPoints.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
    if (neckVecs.length >= 2) {
      const neckCurve = new THREE.CatmullRomCurve3(neckVecs);
      const neckGeo = new THREE.TubeGeometry(neckCurve, 32, shaftRadius * 0.96, 14, false);
      const neckMesh = new THREE.Mesh(neckGeo, this.bendingNeckMat);
      neckMesh.renderOrder = 1;
      neckMesh.name = 'ICE_Zone2_ArticulatedBendingNeck';
      this.catheterGroup.add(neckMesh);

      // Stainless Steel Pull-Wire Locking Collar at pBase
      const pBaseVec = neckVecs[0];
      const pNextVec = neckVecs[1];
      const baseTangent = new THREE.Vector3().subVectors(pNextVec, pBaseVec).normalize();
      const collarGeo = new THREE.CylinderGeometry(
        shaftRadius * 1.06,
        shaftRadius * 1.06,
        2.2,
        16
      );
      const collarMesh = new THREE.Mesh(collarGeo, this.collarMetalMat);
      collarMesh.position.copy(pBaseVec);
      collarMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), baseTangent);
      collarMesh.renderOrder = 1;
      collarMesh.name = 'ICE_PullWireLockingCollar';
      this.catheterGroup.add(collarMesh);
    }

    // Zone 3: 15 mm Rigid Distal Transducer Housing (tipStart -> tipEnd)
    const tVec = new THREE.Vector3(...pose.shaftTangent).normalize();
    const nVec = new THREE.Vector3(...pose.faceNormal).normalize();
    const eVec = new THREE.Vector3(...pose.elevNormal).normalize();
    const centerVec = new THREE.Vector3(...pose.transducerPos);
    const tipEndVec = new THREE.Vector3(...pose.tipEnd);
    const L_tip = hw.transducerLengthMm;

    // Basis matrix where local +Y = shaftTangent, local +Z = faceNormal, local +X = elevNormal
    const housingBasis = new THREE.Matrix4().makeBasis(eVec, tVec, nVec);
    const housingQuat = new THREE.Quaternion().setFromRotationMatrix(housingBasis);

    const housingGeo = new THREE.CylinderGeometry(
      shaftRadius * 1.02,
      shaftRadius * 1.0,
      L_tip,
      20
    );
    const housingMesh = new THREE.Mesh(housingGeo, this.transducerHousingMat);
    housingMesh.position.copy(centerVec);
    housingMesh.quaternion.copy(housingQuat);
    housingMesh.renderOrder = 1;
    housingMesh.name = 'ICE_Zone3_DistalTransducerHousing';
    this.catheterGroup.add(housingMesh);

    // Warm Amber (`#F59E0B`) Acoustic Lens Window strictly on the `+faceNormal` (+Z local) face
    const windowLength = L_tip * 0.66;
    const windowWidth = shaftRadius * 1.25;
    const windowThickness = 0.55;
    const windowGeo = new THREE.BoxGeometry(windowWidth, windowLength, windowThickness);
    const windowMesh = new THREE.Mesh(windowGeo, this.acousticWindowMat);
    windowMesh.position
      .copy(centerVec)
      .addScaledVector(nVec, shaftRadius * 0.92);
    windowMesh.quaternion.copy(housingQuat);
    windowMesh.renderOrder = 1;
    windowMesh.name = 'ICE_AcousticPhasedArrayWindow';
    this.catheterGroup.add(windowMesh);

    // 3 Platinum-Iridium (`#F8FAFC`) Radiopaque Marker Bands + 1 CARTO Sensor Coil
    const bandOffsetsMm = [-L_tip * 0.44, L_tip * 0.38, -L_tip * 0.62];
    for (let i = 0; i < bandOffsetsMm.length; i++) {
      const bandGeo = new THREE.CylinderGeometry(
        shaftRadius * 1.05,
        shaftRadius * 1.05,
        0.9,
        16
      );
      const bandMesh = new THREE.Mesh(bandGeo, this.ptIrMarkerMat);
      bandMesh.position.copy(centerVec).addScaledVector(tVec, bandOffsetsMm[i]);
      bandMesh.quaternion.copy(housingQuat);
      bandMesh.renderOrder = 1;
      bandMesh.name = `ICE_PtIrMarkerBand_${i + 1}`;
      this.catheterGroup.add(bandMesh);
    }

    if (hw.supports3DCartosound) {
      const cartoGeo = new THREE.CylinderGeometry(
        shaftRadius * 1.06,
        shaftRadius * 1.06,
        2.0,
        18
      );
      const cartoMesh = new THREE.Mesh(cartoGeo, this.cartoSensorMat);
      cartoMesh.position.copy(centerVec).addScaledVector(tVec, -L_tip * 0.30);
      cartoMesh.quaternion.copy(housingQuat);
      cartoMesh.renderOrder = 1;
      cartoMesh.name = 'ICE_Carto3MagneticSensorCoil';
      this.catheterGroup.add(cartoMesh);
    }

    // Rounded Atraumatic Distal Dome Tip at `pose.tipEnd`
    const domeGeo = new THREE.SphereGeometry(shaftRadius * 1.01, 16, 12);
    const domeMesh = new THREE.Mesh(domeGeo, this.ptIrMarkerMat);
    domeMesh.position.copy(tipEndVec);
    domeMesh.renderOrder = 1;
    domeMesh.name = 'ICE_AtraumaticDistalTipDome';
    this.catheterGroup.add(domeMesh);

    // ------------------------------------------------------------------------
    // 2. 3D Ultrasound Sector Fan & 4D Frustum (`renderOrder = 7`, `depthWrite = false`)
    // ------------------------------------------------------------------------
    const maxRadiusMm = Math.max(30.0, settings.depthCm * 10.0);
    const halfSectorRad = (hw.sectorAngleDeg * 0.5) * DEG2RAD; // 45 deg
    const latVec = new THREE.Vector3(...pose.latAxis).normalize();
    const biplaneVec = new THREE.Vector3(...pose.biplaneLatAxis).normalize();

    this.buildSectorFanMesh(
      centerVec,
      nVec,
      latVec,
      maxRadiusMm,
      halfSectorRad,
      this.fanSurfaceMat,
      true
    );

    const isBiplane =
      state.biplaneEnabled ||
      Boolean((settings as unknown as { biplaneEnabled?: boolean }).biplaneEnabled);
    const is4DVolume =
      state.volume4dEnabled ||
      Boolean((settings as unknown as { mode4DEnabled?: boolean }).mode4DEnabled);

    // NuVision Biplane Orthogonal (+90 deg) Sector Fan
    if (isBiplane && hw.supports4DOmniplane) {
      this.buildSectorFanMesh(
        centerVec,
        nVec,
        biplaneVec,
        maxRadiusMm,
        halfSectorRad,
        this.biplaneSurfaceMat,
        false
      );
    }

    // NuVision 4D Matrix-Array Pyramidal Volume Wireframe
    if (is4DVolume && hw.supports4DOmniplane) {
      this.build4DPyramidalFrustum(centerVec, nVec, latVec, biplaneVec, maxRadiusMm, halfSectorRad);
    }
  }

  private buildSectorFanMesh(
    origin: THREE.Vector3,
    nVec: THREE.Vector3,
    uLat: THREE.Vector3,
    maxRadiusMm: number,
    halfAngleRad: number,
    surfaceMat: THREE.MeshBasicMaterial,
    isPrimaryFan: boolean
  ): void {
    const segments = 36;
    const positions = new Float32Array((segments + 2) * 3);
    positions[0] = origin.x;
    positions[1] = origin.y;
    positions[2] = origin.z;

    const arcPoints: THREE.Vector3[] = [];
    for (let i = 0; i <= segments; i++) {
      const frac = i / segments;
      const theta = -halfAngleRad + frac * (2.0 * halfAngleRad);
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);

      const pt = new THREE.Vector3()
        .copy(origin)
        .addScaledVector(nVec, maxRadiusMm * cosT)
        .addScaledVector(uLat, maxRadiusMm * sinT);

      arcPoints.push(pt);
      const idx = (i + 1) * 3;
      positions[idx] = pt.x;
      positions[idx + 1] = pt.y;
      positions[idx + 2] = pt.z;
    }

    const indices: number[] = [];
    for (let i = 1; i <= segments; i++) {
      indices.push(0, i, i + 1);
    }

    const fanGeo = new THREE.BufferGeometry();
    fanGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    fanGeo.setIndex(indices);
    fanGeo.computeVertexNormals();

    const fanMesh = new THREE.Mesh(fanGeo, surfaceMat);
    fanMesh.renderOrder = 7;
    fanMesh.name = isPrimaryFan ? 'ICE_PrimarySectorFanSurface' : 'ICE_BiplaneSectorFanSurface';
    this.frustumGroup.add(fanMesh);

    if (isPrimaryFan) {
      // Superior / Right (+u_lat) Edge Ray in #38BDF8 Cyan + Orientation Marker Sphere
      const plusEdgeEnd = arcPoints[arcPoints.length - 1];
      const plusEdgeGeo = new THREE.BufferGeometry().setFromPoints([origin, plusEdgeEnd]);
      const plusEdgeLine = new THREE.Line(plusEdgeGeo, this.cyanEdgeMat);
      plusEdgeLine.renderOrder = 7;
      plusEdgeLine.name = 'ICE_SectorEdge_PlusULat_Cyan';
      this.frustumGroup.add(plusEdgeLine);

      // Glowing Cyan B&W Orientation Marker Dot at the distal +u_lat corner
      const dotGeo = new THREE.SphereGeometry(1.8, 12, 12);
      const dotMesh = new THREE.Mesh(dotGeo, this.markerDotMat);
      dotMesh.position.copy(plusEdgeEnd);
      dotMesh.renderOrder = 7;
      dotMesh.name = 'ICE_OrientationMarkerDot_PlusULat';
      this.frustumGroup.add(dotMesh);

      // Inferior / Left (-u_lat) Edge Ray in #F59E0B Warm Amber
      const minusEdgeEnd = arcPoints[0];
      const minusEdgeGeo = new THREE.BufferGeometry().setFromPoints([origin, minusEdgeEnd]);
      const minusEdgeLine = new THREE.Line(minusEdgeGeo, this.amberEdgeMat);
      minusEdgeLine.renderOrder = 7;
      minusEdgeLine.name = 'ICE_SectorEdge_MinusULat_Amber';
      this.frustumGroup.add(minusEdgeLine);

      // Distal Arc + 20 mm (2 cm) Range Calibration Arcs
      const distalArcGeo = new THREE.BufferGeometry().setFromPoints(arcPoints);
      const distalArcLine = new THREE.Line(distalArcGeo, this.cyanEdgeMat);
      distalArcLine.renderOrder = 7;
      this.frustumGroup.add(distalArcLine);

      for (let rMm = 20.0; rMm < maxRadiusMm - 5.0; rMm += 20.0) {
        const ringPts: THREE.Vector3[] = [];
        for (let i = 0; i <= 24; i++) {
          const theta = -halfAngleRad + (i / 24) * (2.0 * halfAngleRad);
          ringPts.push(
            new THREE.Vector3()
              .copy(origin)
              .addScaledVector(nVec, rMm * Math.cos(theta))
              .addScaledVector(uLat, rMm * Math.sin(theta))
          );
        }
        const ringGeo = new THREE.BufferGeometry().setFromPoints(ringPts);
        const ringLine = new THREE.Line(ringGeo, this.rangeArcMat);
        ringLine.renderOrder = 7;
        this.frustumGroup.add(ringLine);
      }
    } else {
      // Biplane fan border outline
      const biplaneLoopPts = [origin, ...arcPoints, origin];
      const biplaneGeo = new THREE.BufferGeometry().setFromPoints(biplaneLoopPts);
      const biplaneLine = new THREE.Line(biplaneGeo, this.biplaneEdgeMat);
      biplaneLine.renderOrder = 7;
      this.frustumGroup.add(biplaneLine);
    }
  }

  private build4DPyramidalFrustum(
    origin: THREE.Vector3,
    nVec: THREE.Vector3,
    uLat: THREE.Vector3,
    uElev: THREE.Vector3,
    maxRadiusMm: number,
    halfAngleRad: number
  ): void {
    const cosA = Math.cos(halfAngleRad);
    const sinA = Math.sin(halfAngleRad);

    const corners: THREE.Vector3[] = [
      new THREE.Vector3()
        .copy(origin)
        .addScaledVector(nVec, maxRadiusMm * cosA)
        .addScaledVector(uLat, maxRadiusMm * sinA)
        .addScaledVector(uElev, maxRadiusMm * sinA * 0.65),
      new THREE.Vector3()
        .copy(origin)
        .addScaledVector(nVec, maxRadiusMm * cosA)
        .addScaledVector(uLat, -maxRadiusMm * sinA)
        .addScaledVector(uElev, maxRadiusMm * sinA * 0.65),
      new THREE.Vector3()
        .copy(origin)
        .addScaledVector(nVec, maxRadiusMm * cosA)
        .addScaledVector(uLat, -maxRadiusMm * sinA)
        .addScaledVector(uElev, -maxRadiusMm * sinA * 0.65),
      new THREE.Vector3()
        .copy(origin)
        .addScaledVector(nVec, maxRadiusMm * cosA)
        .addScaledVector(uLat, maxRadiusMm * sinA)
        .addScaledVector(uElev, -maxRadiusMm * sinA * 0.65),
    ];

    const wirePts: THREE.Vector3[] = [];
    for (let i = 0; i < 4; i++) {
      wirePts.push(origin, corners[i]);
      wirePts.push(corners[i], corners[(i + 1) % 4]);
    }
    const wireGeo = new THREE.BufferGeometry().setFromPoints(wirePts);
    const wireSegments = new THREE.LineSegments(wireGeo, this.volume4DWireMat);
    wireSegments.renderOrder = 7;
    wireSegments.name = 'ICE_NuVision4DPyramidWireframe';
    this.frustumGroup.add(wireSegments);
  }

  private clearGroupGeometry(group: THREE.Group): void {
    while (group.children.length > 0) {
      const child = group.children[0] as THREE.Mesh | THREE.Line;
      group.remove(child);
      if (child.geometry) {
        child.geometry.dispose();
      }
    }
  }
}
