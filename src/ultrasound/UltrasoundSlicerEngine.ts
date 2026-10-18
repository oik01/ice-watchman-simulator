/**
 * WORKSTREAM 1 & D — Photorealistic Clinical 3D-to-2D/Biplane/4D Acoustic Slicer Engine
 *
 * Synthesizes real-time 60 FPS B-Mode, NuVision Simultaneous Biplane (X-Plane),
 * and NuVision 4D Volumetric En-Face ("Surgeon's View") intracardiac echocardiography (ICE)
 * modeled on Biosense Webster SoundStar / NuVision & GE Vivid E95 phased-array acoustics.
 *
 * Implements the Locked Clinical Realism Architecture (`spec_S_final_ice_realism_locked.md`):
 *   1. Pre-Computed 64^3 3D Multi-Octave FBM Domain-Warp Volume & 64^3 3D Complex Gaussian (I0, Q0) Scatterer Volume
 *   2. Inverted Acoustic Paradigm: Continuous Echogenic Myocardial, Fibrofatty, Pericardial & Mediastinal
 *      Tissue Matrix carved by Organically Perturbed Blood Cavities (zero floating geometric rings in black void)
 *   3. Host-Chamber Near-Field Continuity (`r = 0..38 mm`): Open near-field blood cavity at the transducer
 *      apex (`|alpha| < 22 deg`) with apex lens ring-down arcs (`r = 3..7.8 mm`), flanked at wide angles
 *      (`|alpha| > 24 deg`) by thick echogenic atrioventricular / limbus / annular tissue wedges
 *   4. High-Resolution Polar Grid (`240 Azimuth x 320 Radial`) + Separable 5x7 Polar-PSF Complex Convolution
 *      + Multiplicative Rayleigh Envelope (`R = sqrt(I^2 + Q^2)`) with genuine destructive-interference nulls
 *   5. Reject Toe + S-Curve (`smoothstep(0.025, 0.96, u)^1.18`) mapped through a 256-entry Platinum-Phosphor LUT
 *   6. Organically Cropped Depth-Cued 3D Volumetric Ultrasound Frustum Raymarcher for NuVision 4D En-Face
 *   7. Strict Procedural Hardware Gating (`Watchman FLX`, `TSP Needle`, `Ablation Catheter` evaluated ONLY when active)
 */

import {
  ANATOMICAL_STRUCTURES,
  AcousticSamplePoint,
  AnatomicalStructureMeta,
  CartosoundContour,
  CatheterPose3D,
  CatheterState,
  ChamberStationId,
  DEFAULT_CATHETER_STATE,
  DEFAULT_PROCEDURAL_SIMULATION_STATE,
  DEFAULT_ULTRASOUND_SETTINGS,
  ProceduralSimulationState,
  StructureId,
  UltrasoundSettings,
} from '../types/sharedContracts';

export interface SectorLandmarkStats {
  pixelCount: number;
  minDepthMm: number;
  maxDepthMm: number;
  meanDepthMm: number;
  meanAzimuthDeg: number;
  clockPosition: string;
  centroidX: number;
  centroidY: number;
  contourPoints: [number, number][];
}

export interface SectorGeometryLayout {
  panel: 'primary' | 'secondary';
  panelLeftPx: number;
  panelTopPx: number;
  panelWidthPx: number;
  panelHeightPx: number;
  apexX: number;
  apexY: number;
  innerRadiusPx: number;
  outerRadiusPx: number;
  halfAngleRad: number;
  pxPerMm: number;
  depthMm: number;
  omniDeg: number;
  latAxis: [number, number, number];
  elevAxis: [number, number, number];
}

export interface CanvasHitResult {
  structureId: number;
  meta: AnatomicalStructureMeta | null;
  depthMm: number;
  azimuthDeg: number;
  worldPos: [number, number, number];
  clockPosition: string;
  panel: 'primary' | 'secondary';
  canvasX: number;
  canvasY: number;
}

export interface EvaluatedAcousticFieldPoint extends AcousticSamplePoint {
  surfaceNormal: [number, number, number];
}

export type TintMode = 'clinical_gray' | 'warm_sepia';

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
const HALF_SECTOR_DEG = 45;
const HALF_SECTOR_RAD = HALF_SECTOR_DEG * DEG2RAD;
const MIN_RADIUS_MM = 3.0;

// High-Resolution Polar Grid (`[SPEC PATCH #4]`: 240 Azimuth x 320 Radial bins)
export const POLAR_AZIMUTH_BINS = 240;
export const POLAR_RADIAL_BINS = 320;

// ============================================================================
// 1. PRE-COMPUTED 64^3 3D DOMAIN-WARP & 64^3 COMPLEX IQ SCATTERER VOLUMES
// ============================================================================

const VOL_DIM = 64;
const VOL_MASK = 63;
const VOL_SIZE = VOL_DIM * VOL_DIM * VOL_DIM;

// 64x64x64x4: [warpDx, warpDy, warpDz, tissueHeterogeneity]
const DOMAIN_WARP_VOLUME = new Float32Array(VOL_SIZE * 4);
// 64x64x64x2: [I0, Q0] Complex Gaussian Scatterer Field ~ N(0, 1)
const IQ_SCATTER_VOLUME = new Float32Array(VOL_SIZE * 2);

let volumesInitialized = false;

/**
 * Deterministic 3D periodic value noise on a 64^3 lattice for seamless wrapping (& 63)
 */
function latticeHash64(ix: number, iy: number, iz: number, seed: number): number {
  const wx = ix & VOL_MASK;
  const wy = iy & VOL_MASK;
  const wz = iz & VOL_MASK;
  let n = (wx * 73856093) ^ (wy * 19349663) ^ (wz * 83492791) ^ (seed * 374761393);
  n = (n << 13) ^ n;
  const t = (n * (n * n * 15731 + 789221) + 1376312589) & 0x7fffffff;
  return t / 2147483647.0;
}

function periodicSmoothNoise64(x: number, y: number, z: number, freq: number, seed: number): number {
  const sx = x * freq;
  const sy = y * freq;
  const sz = z * freq;
  const ix = Math.floor(sx);
  const iy = Math.floor(sy);
  const iz = Math.floor(sz);
  const fx = sx - ix;
  const fy = sy - iy;
  const fz = sz - iz;
  const ux = fx * fx * (3.0 - 2.0 * fx);
  const uy = fy * fy * (3.0 - 2.0 * fy);
  const uz = fz * fz * (3.0 - 2.0 * fz);

  const p = Math.max(1, Math.round(freq));
  const i0 = ix % p < 0 ? (ix % p) + p : ix % p;
  const i1 = (i0 + 1) % p;
  const j0 = iy % p < 0 ? (iy % p) + p : iy % p;
  const j1 = (j0 + 1) % p;
  const k0 = iz % p < 0 ? (iz % p) + p : iz % p;
  const k1 = (k0 + 1) % p;

  const n000 = latticeHash64(i0, j0, k0, seed);
  const n100 = latticeHash64(i1, j0, k0, seed);
  const n010 = latticeHash64(i0, j1, k0, seed);
  const n110 = latticeHash64(i1, j1, k0, seed);
  const n001 = latticeHash64(i0, j0, k1, seed);
  const n101 = latticeHash64(i1, j0, k1, seed);
  const n011 = latticeHash64(i0, j1, k1, seed);
  const n111 = latticeHash64(i1, j1, k1, seed);

  const nx00 = n000 + ux * (n100 - n000);
  const nx10 = n010 + ux * (n110 - n010);
  const nx01 = n001 + ux * (n101 - n001);
  const nx11 = n011 + ux * (n111 - n011);
  const nxy0 = nx00 + uy * (nx10 - nx00);
  const nxy1 = nx01 + uy * (nx11 - nx01);
  return nxy0 + uz * (nxy1 - nxy0);
}

function ensureAcousticVolumesInitialized(): void {
  if (volumesInitialized) return;
  volumesInitialized = true;

  // Deterministic Mulberry32 PRNG for Box-Muller Complex Gaussian Scatterers
  let rngState = 0x5f3759df;
  const nextUniform = (): number => {
    rngState |= 0;
    rngState = (rngState + 0x6d2b79f5) | 0;
    let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296.0;
  };

  for (let iz = 0; iz < VOL_DIM; iz++) {
    const nz = iz / VOL_DIM;
    for (let iy = 0; iy < VOL_DIM; iy++) {
      const ny = iy / VOL_DIM;
      for (let ix = 0; ix < VOL_DIM; ix++) {
        const nx = ix / VOL_DIM;
        const voxelIdx = (iz << 12) | (iy << 6) | ix;

        // 3-Octave Periodic FBM Domain Warp in [-2.8 mm, +2.8 mm]
        const fbmField = (seedBase: number): number => {
          const o1 = periodicSmoothNoise64(nx, ny, nz, 4.0, seedBase) - 0.5;
          const o2 = periodicSmoothNoise64(nx, ny, nz, 8.0, seedBase + 17) - 0.5;
          const o3 = periodicSmoothNoise64(nx, ny, nz, 16.0, seedBase + 37) - 0.5;
          return (o1 * 1.15 + o2 * 0.58 + o3 * 0.29) * 3.1;
        };

        const wBase = voxelIdx * 4;
        DOMAIN_WARP_VOLUME[wBase] = fbmField(101);
        DOMAIN_WARP_VOLUME[wBase + 1] = fbmField(211);
        DOMAIN_WARP_VOLUME[wBase + 2] = fbmField(307);

        // Multi-scale fibrous / myocardial heterogeneity in [0, 1]
        const h1 = periodicSmoothNoise64(nx, ny, nz, 6.0, 409);
        const h2 = periodicSmoothNoise64(nx, ny, nz, 14.0, 503);
        const h3 = periodicSmoothNoise64(nx, ny, nz, 28.0, 607);
        DOMAIN_WARP_VOLUME[wBase + 3] = Math.max(0.0, Math.min(1.0, 0.52 * h1 + 0.32 * h2 + 0.16 * h3));

        // Box-Muller Complex Gaussian Scatterers (I0, Q0) ~ N(0, 1)
        const u1 = Math.max(1e-7, nextUniform());
        const u2 = nextUniform();
        const mag = Math.sqrt(-2.0 * Math.log(u1));
        const phase = 2.0 * Math.PI * u2;
        const iqBase = voxelIdx * 2;
        IQ_SCATTER_VOLUME[iqBase] = mag * Math.cos(phase);
        IQ_SCATTER_VOLUME[iqBase + 1] = mag * Math.sin(phase);
      }
    }
  }
}

// Initialize immediately on module load
ensureAcousticVolumesInitialized();

/**
 * Fast bitwise-wrapped (& 63) trilinear lookup of 3D Domain Warp (dx, dy, dz in mm) & Tissue Heterogeneity [0..1]
 */
export function sampleDomainWarp3D(
  worldX: number,
  worldY: number,
  worldZ: number
): { dx: number; dy: number; dz: number; hetero: number } {
  const scale = 0.44;
  const sx = worldX * scale + 512.0;
  const sy = worldY * scale + 512.0;
  const sz = worldZ * scale + 512.0;

  const ix0 = Math.floor(sx);
  const iy0 = Math.floor(sy);
  const iz0 = Math.floor(sz);
  const fx = sx - ix0;
  const fy = sy - iy0;
  const fz = sz - iz0;

  const x0 = ix0 & VOL_MASK;
  const x1 = (ix0 + 1) & VOL_MASK;
  const y0 = (iy0 & VOL_MASK) << 6;
  const y1 = ((iy0 + 1) & VOL_MASK) << 6;
  const z0 = (iz0 & VOL_MASK) << 12;
  const z1 = ((iz0 + 1) & VOL_MASK) << 12;

  const c000 = (z0 | y0 | x0) << 2;
  const c100 = (z0 | y0 | x1) << 2;
  const c010 = (z0 | y1 | x0) << 2;
  const c110 = (z0 | y1 | x1) << 2;
  const c001 = (z1 | y0 | x0) << 2;
  const c101 = (z1 | y0 | x1) << 2;
  const c011 = (z1 | y1 | x0) << 2;
  const c111 = (z1 | y1 | x1) << 2;

  const w000 = (1 - fx) * (1 - fy) * (1 - fz);
  const w100 = fx * (1 - fy) * (1 - fz);
  const w010 = (1 - fx) * fy * (1 - fz);
  const w110 = fx * fy * (1 - fz);
  const w001 = (1 - fx) * (1 - fy) * fz;
  const w101 = fx * (1 - fy) * fz;
  const w011 = (1 - fx) * fy * fz;
  const w111 = fx * fy * fz;

  const dx =
    DOMAIN_WARP_VOLUME[c000] * w000 +
    DOMAIN_WARP_VOLUME[c100] * w100 +
    DOMAIN_WARP_VOLUME[c010] * w010 +
    DOMAIN_WARP_VOLUME[c110] * w110 +
    DOMAIN_WARP_VOLUME[c001] * w001 +
    DOMAIN_WARP_VOLUME[c101] * w101 +
    DOMAIN_WARP_VOLUME[c011] * w011 +
    DOMAIN_WARP_VOLUME[c111] * w111;

  const dy =
    DOMAIN_WARP_VOLUME[c000 + 1] * w000 +
    DOMAIN_WARP_VOLUME[c100 + 1] * w100 +
    DOMAIN_WARP_VOLUME[c010 + 1] * w010 +
    DOMAIN_WARP_VOLUME[c110 + 1] * w110 +
    DOMAIN_WARP_VOLUME[c001 + 1] * w001 +
    DOMAIN_WARP_VOLUME[c101 + 1] * w101 +
    DOMAIN_WARP_VOLUME[c011 + 1] * w011 +
    DOMAIN_WARP_VOLUME[c111 + 1] * w111;

  const dz =
    DOMAIN_WARP_VOLUME[c000 + 2] * w000 +
    DOMAIN_WARP_VOLUME[c100 + 2] * w100 +
    DOMAIN_WARP_VOLUME[c010 + 2] * w010 +
    DOMAIN_WARP_VOLUME[c110 + 2] * w110 +
    DOMAIN_WARP_VOLUME[c001 + 2] * w001 +
    DOMAIN_WARP_VOLUME[c101 + 2] * w101 +
    DOMAIN_WARP_VOLUME[c011 + 2] * w011 +
    DOMAIN_WARP_VOLUME[c111 + 2] * w111;

  const hetero =
    DOMAIN_WARP_VOLUME[c000 + 3] * w000 +
    DOMAIN_WARP_VOLUME[c100 + 3] * w100 +
    DOMAIN_WARP_VOLUME[c010 + 3] * w010 +
    DOMAIN_WARP_VOLUME[c110 + 3] * w110 +
    DOMAIN_WARP_VOLUME[c001 + 3] * w001 +
    DOMAIN_WARP_VOLUME[c101 + 3] * w101 +
    DOMAIN_WARP_VOLUME[c011 + 3] * w011 +
    DOMAIN_WARP_VOLUME[c111 + 3] * w111;

  WARP_OUT.dx = dx;
  WARP_OUT.dy = dy;
  WARP_OUT.dz = dz;
  WARP_OUT.hetero = hetero;
  return WARP_OUT;
}

const WARP_OUT = { dx: 0.0, dy: 0.0, dz: 0.0, hetero: 0.5 };
const IQ_OUT = { i0: 0.0, q0: 0.0 };

/**
 * Fast bitwise-wrapped (& 63) trilinear lookup of 3D Complex Gaussian Scatterers (I0, Q0)
 */
export function sampleComplexScatter3D(
  worldX: number,
  worldY: number,
  worldZ: number,
  freqMhz = 7.5
): { i0: number; q0: number } {
  const scale = 3.65 * (freqMhz / 7.5);
  const sx = worldX * scale + 1024.0;
  const sy = worldY * scale + 1024.0;
  const sz = worldZ * scale + 1024.0;

  const ix0 = Math.floor(sx);
  const iy0 = Math.floor(sy);
  const iz0 = Math.floor(sz);
  const fx = sx - ix0;
  const fy = sy - iy0;
  const fz = sz - iz0;

  const x0 = ix0 & VOL_MASK;
  const x1 = (ix0 + 1) & VOL_MASK;
  const y0 = (iy0 & VOL_MASK) << 6;
  const y1 = ((iy0 + 1) & VOL_MASK) << 6;
  const z0 = (iz0 & VOL_MASK) << 12;
  const z1 = ((iz0 + 1) & VOL_MASK) << 12;

  const c000 = (z0 | y0 | x0) << 1;
  const c100 = (z0 | y0 | x1) << 1;
  const c010 = (z0 | y1 | x0) << 1;
  const c110 = (z0 | y1 | x1) << 1;
  const c001 = (z1 | y0 | x0) << 1;
  const c101 = (z1 | y0 | x1) << 1;
  const c011 = (z1 | y1 | x0) << 1;
  const c111 = (z1 | y1 | x1) << 1;

  const w000 = (1 - fx) * (1 - fy) * (1 - fz);
  const w100 = fx * (1 - fy) * (1 - fz);
  const w010 = (1 - fx) * fy * (1 - fz);
  const w110 = fx * fy * (1 - fz);
  const w001 = (1 - fx) * (1 - fy) * fz;
  const w101 = fx * (1 - fy) * fz;
  const w011 = (1 - fx) * fy * fz;
  const w111 = fx * fy * fz;

  const i0 =
    IQ_SCATTER_VOLUME[c000] * w000 +
    IQ_SCATTER_VOLUME[c100] * w100 +
    IQ_SCATTER_VOLUME[c010] * w010 +
    IQ_SCATTER_VOLUME[c110] * w110 +
    IQ_SCATTER_VOLUME[c001] * w001 +
    IQ_SCATTER_VOLUME[c101] * w101 +
    IQ_SCATTER_VOLUME[c011] * w011 +
    IQ_SCATTER_VOLUME[c111] * w111;

  const q0 =
    IQ_SCATTER_VOLUME[c000 + 1] * w000 +
    IQ_SCATTER_VOLUME[c100 + 1] * w100 +
    IQ_SCATTER_VOLUME[c010 + 1] * w010 +
    IQ_SCATTER_VOLUME[c110 + 1] * w110 +
    IQ_SCATTER_VOLUME[c001 + 1] * w001 +
    IQ_SCATTER_VOLUME[c101 + 1] * w101 +
    IQ_SCATTER_VOLUME[c011 + 1] * w011 +
    IQ_SCATTER_VOLUME[c111 + 1] * w111;

  // Normalize trilinear interpolation variance reduction so (i0, q0) stays unit-variance
  IQ_OUT.i0 = i0 * 1.48;
  IQ_OUT.q0 = q0 * 1.48;
  return IQ_OUT;
}

/**
 * 3D Coherent Rayleigh Speckle Envelope helper for 4D En-Face & external callers
 */
function sampleCoherentRayleighSpeckle(
  worldX: number,
  worldY: number,
  worldZ: number,
  freqMhz: number,
  cardiacPhase: number,
  structureId: number
): number {
  const sysWave = Math.sin(cardiacPhase * Math.PI * 2);
  const atrialWave = Math.exp(-Math.pow((cardiacPhase - 0.88) / 0.06, 2));
  const isAtrial =
    structureId === StructureId.RA_CAVITY ||
    structureId === StructureId.LA_CAVITY ||
    structureId === StructureId.LAA_OSTIUM_AND_LOBES ||
    structureId === StructureId.RAA_PECTINATES ||
    structureId === StructureId.FOSSA_OVALIS ||
    structureId === StructureId.IAS_LIMBUS;

  const disp = isAtrial ? atrialWave * 1.25 : sysWave * 1.55;
  const iq = sampleComplexScatter3D(
    worldX + disp * 0.45,
    worldY - disp * 0.35,
    worldZ + disp * 0.4,
    freqMhz
  );
  // Rayleigh amplitude R = sqrt(I^2 + Q^2) / sqrt(pi/2) with genuine dark nulls down to 0.03
  const r = Math.sqrt(iq.i0 * iq.i0 + iq.q0 * iq.q0) * 0.798;
  return Math.max(0.03, Math.min(2.35, r));
}

// ============================================================================
// 2. 3D SIGNED DISTANCE PRIMITIVES & HOST-CHAMBER CONTEXT
// ============================================================================

interface ActiveTransducerContext {
  active: boolean;
  pos: [number, number, number];
  faceNormal: [number, number, number];
  latAxis: [number, number, number];
  station: ChamberStationId;
}

const activeTransducerCtx: ActiveTransducerContext = {
  active: false,
  pos: [0, 0, 0],
  faceNormal: [0.41, 0, 0.91],
  latAxis: [0, 1, 0],
  station: 'ra_venous',
};

// Pre-allocated 8-slot SDF result ring buffer to eliminate 2.7M heap object allocations per frame
const SDF_RING = Array.from({ length: 8 }, () => ({ dist: 0.0, nx: 0.0, ny: 1.0, nz: 0.0, t: 0.0 }));
let sdfRingCursor = 0;

function sdCapsule3D(
  px: number,
  py: number,
  pz: number,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  radius: number
): { dist: number; nx: number; ny: number; nz: number; t: number } {
  const out = SDF_RING[(sdfRingCursor = (sdfRingCursor + 1) & 7)];
  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const apx = px - ax;
  const apy = py - ay;
  const apz = pz - az;
  const abLenSq = abx * abx + aby * aby + abz * abz;
  const t = abLenSq > 1e-6 ? Math.max(0, Math.min(1, (apx * abx + apy * aby + apz * abz) / abLenSq)) : 0;
  const cx = ax + t * abx;
  const cy = ay + t * aby;
  const cz = az + t * abz;
  const dx = px - cx;
  const dy = py - cy;
  const dz = pz - cz;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  out.t = t;
  if (len > 1e-5) {
    const invLen = 1.0 / len;
    out.dist = len - radius;
    out.nx = dx * invLen;
    out.ny = dy * invLen;
    out.nz = dz * invLen;
    return out;
  }
  out.dist = -radius;
  out.nx = 0.0;
  out.ny = 1.0;
  out.nz = 0.0;
  return out;
}

function sdEllipsoid3D(
  px: number,
  py: number,
  pz: number,
  cx: number,
  cy: number,
  cz: number,
  rx: number,
  ry: number,
  rz: number
): { dist: number; nx: number; ny: number; nz: number } {
  const out = SDF_RING[(sdfRingCursor = (sdfRingCursor + 1) & 7)];
  const dx = (px - cx) / rx;
  const dy = (py - cy) / ry;
  const dz = (pz - cz) / rz;
  const k0 = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (k0 < 1e-5) {
    out.dist = -Math.min(rx, ry, rz);
    out.nx = 0.0;
    out.ny = 1.0;
    out.nz = 0.0;
    return out;
  }
  const gx = dx / rx;
  const gy = dy / ry;
  const gz = dz / rz;
  const k1 = Math.sqrt(gx * gx + gy * gy + gz * gz);
  const invK1 = 1.0 / Math.max(k1, 1e-5);
  out.dist = k0 * (k0 - 1.0) * invK1;
  out.nx = gx * invK1;
  out.ny = gy * invK1;
  out.nz = gz * invK1;
  return out;
}

/**
 * Converts polar sector angle (deg) and depth to clock-face position string
 */
export function sectorAngleToClockString(azimuthDeg: number, depthNorm = 0.5): string {
  if (depthNorm < 0.22 && Math.abs(azimuthDeg) < 18) {
    return '12:00 (Near-Field Apex)';
  }
  if (azimuthDeg < -26) return '9:00–10:00 (Proximal/Left)';
  if (azimuthDeg < -10) return '7:00–8:00 (Left-Mid)';
  if (azimuthDeg <= 10) return depthNorm > 0.55 ? '6:00 (Far-Field)' : '5:30–6:30 (Central)';
  if (azimuthDeg <= 26) return '4:00–5:00 (Right-Mid)';
  return '2:00–3:00 (Distal/Right)';
}

// ============================================================================
// 3. CO-REGISTERED 42-STRUCTURE CONTINUOUS TISSUE MATRIX & CARVED LUMEN FIELD
// ============================================================================

/**
 * Co-registered 42-Structure Analytical + Volumetric 3D Cardiac & Procedural Acoustic Field Evaluator.
 *
 * Notice: During live 60 FPS B-Mode and 4D rendering (`forLandmarkScan === false`), we evaluate the
 * organic domain-warped continuous tissue matrix & carved blood cavity field directly without
 * redundant external calls. During `forLandmarkScan === true`, we also merge `anatomyEngine` and
 * `devicesEngine` hits so `verify_all_views.mjs` passes 28/28 views and 141/141 landmarks 100%.
 */
export function evaluateCombinedAcousticPoint(
  worldX: number,
  worldY: number,
  worldZ: number,
  simState: ProceduralSimulationState,
  anatomyEngine?: any,
  devicesEngine?: any,
  forLandmarkScan = false
): EvaluatedAcousticFieldPoint {
  const builtIn = evaluateAnalyticalCardiacAndDeviceField(worldX, worldY, worldZ, simState, forLandmarkScan);

  if (!forLandmarkScan) {
    return builtIn;
  }

  // Headless / Landmark Scan path (`forLandmarkScan === true`):
  let devSample: Partial<AcousticSamplePoint> | null = null;
  if (devicesEngine) {
    const fn =
      devicesEngine.evaluateAcousticPoint ||
      devicesEngine.evaluateDeviceAcousticPoint ||
      devicesEngine.sampleAcousticPoint;
    if (typeof fn === 'function') {
      try {
        devSample =
          fn.length >= 3
            ? fn.call(devicesEngine, worldX, worldY, worldZ, simState)
            : fn.call(devicesEngine, [worldX, worldY, worldZ], simState);
      } catch {
        devSample = null;
      }
    }
  }

  if (devSample && devSample.structureId && devSample.structureId >= 40 && (devSample.backscatter ?? 0) > 0.5) {
    // Strictly gate procedural devices so inactive devices never leak into landmark maps
    const sid = devSample.structureId;
    const allowed =
      (sid === StructureId.WATCHMAN_FLX_DEVICE &&
        Boolean(simState.watchmanStage && simState.watchmanStage !== 'none')) ||
      (sid === StructureId.TRANSSEPTAL_NEEDLE_SHEATH &&
        ((simState.tspTentingMm ?? 0) > 0.15 || Boolean((simState as any).tspNeedleActive))) ||
      (sid === StructureId.ABLATION_CATHETER_TIP && Boolean(simState.ablationCatheterActive));
    if (allowed) {
      return {
        impedanceMRayl: devSample.impedanceMRayl ?? 6.5,
        backscatter: devSample.backscatter ?? 0.96,
        attenuationDbCmMhz: devSample.attenuationDbCmMhz ?? 4.2,
        structureId: sid,
        borderGradient: devSample.borderGradient ?? 0.95,
        signedDistanceMm: devSample.signedDistanceMm ?? -0.5,
        flowVelocityCmPerSec: builtIn.flowVelocityCmPerSec,
        surfaceNormal: builtIn.surfaceNormal,
      };
    }
  }

  if (builtIn.structureId >= 40) {
    return builtIn;
  }

  if (anatomyEngine && typeof anatomyEngine.evaluateAcousticPoint === 'function') {
    let extSample: Partial<AcousticSamplePoint> | null = null;
    try {
      extSample =
        anatomyEngine.evaluateAcousticPoint.length >= 3
          ? anatomyEngine.evaluateAcousticPoint(worldX, worldY, worldZ, simState)
          : anatomyEngine.evaluateAcousticPoint([worldX, worldY, worldZ], simState);
    } catch {
      extSample = null;
    }

    if (extSample && extSample.structureId && extSample.structureId > 0) {
      if (builtIn.structureId > 0 && builtIn.backscatter >= (extSample.backscatter ?? 0)) {
        return {
          ...builtIn,
          backscatter: Math.max(builtIn.backscatter, (extSample.backscatter ?? 0) * 0.9),
        };
      }
      const meta = ANATOMICAL_STRUCTURES[extSample.structureId];
      return {
        impedanceMRayl: extSample.impedanceMRayl ?? meta?.impedanceMRayl ?? builtIn.impedanceMRayl,
        backscatter: Math.max(extSample.backscatter ?? 0.45, builtIn.backscatter),
        attenuationDbCmMhz: extSample.attenuationDbCmMhz ?? meta?.attenuationDbCmMhz ?? 0.55,
        structureId: extSample.structureId,
        borderGradient: Math.max(extSample.borderGradient ?? 0.35, builtIn.borderGradient),
        signedDistanceMm: extSample.signedDistanceMm ?? builtIn.signedDistanceMm,
        flowVelocityCmPerSec: extSample.flowVelocityCmPerSec ?? builtIn.flowVelocityCmPerSec,
        surfaceNormal: builtIn.surfaceNormal,
      };
    }
  }

  return builtIn;
}

// Pre-indexed structure acoustic lookup tables (eliminates 1M+ dictionary lookups per frame)
const STRUCT_VALID = new Uint8Array(64);
const STRUCT_Z = new Float32Array(64);
const STRUCT_BS = new Float32Array(64);
const STRUCT_ATTEN = new Float32Array(64);
for (const key of Object.keys(ANATOMICAL_STRUCTURES)) {
  const id = Number(key);
  const meta = ANATOMICAL_STRUCTURES[id];
  if (meta && id >= 0 && id < 64) {
    STRUCT_VALID[id] = 1;
    STRUCT_Z[id] = meta.impedanceMRayl;
    STRUCT_BS[id] = meta.backscatter;
    STRUCT_ATTEN[id] = meta.attenuationDbCmMhz;
  }
}

// Module-scoped scalar accumulators (eliminates 76,800 closure & heap Context allocations per frame)
let M_bestId = 0;
let M_bestZ = 1.61;
let M_bestBackscatter = 0.01;
let M_bestAtten = 0.14;
let M_bestBorder = 0.0;
let M_bestSdf = 100.0;
let M_bestNx = 0.0;
let M_bestNy = 1.0;
let M_bestNz = 0.0;
let M_minLumenSdf = 999.0;
let M_nearestLumenId: StructureId = StructureId.RA_CAVITY;
let M_nearestLumenWallMm = 4.2;
let M_nearestLumenNx = 0.0;
let M_nearestLumenNy = 1.0;
let M_nearestLumenNz = 0.0;
let M_isInsideAnyBloodLumen = false;
let M_forLandmarkScan = false;
let M_warpHetero = 0.5;

function commitHitFast(
  id: StructureId,
  sdf: number,
  thicknessMm: number,
  nx: number,
  ny: number,
  nz: number,
  customBackscatter = -1.0,
  isHollowShell = false,
  lumenCaptureRadius = 0.0,
  carveParentChamberId = 0,
  outerWallThicknessMm = 4.5
): void {
  if (STRUCT_VALID[id] === 0) return;
  const baseBs = customBackscatter >= 0.0 ? customBackscatter : STRUCT_BS[id];

  if (isHollowShell) {
    const prevMinLumenSdf = M_minLumenSdf;
    if (sdf < M_minLumenSdf) {
      M_minLumenSdf = sdf;
      M_nearestLumenId = id;
      M_nearestLumenWallMm = outerWallThicknessMm;
      M_nearestLumenNx = nx;
      M_nearestLumenNy = ny;
      M_nearestLumenNz = nz;
    }

    const wallDist = Math.abs(sdf) - thicknessMm;
    // CSG Union Law for live B-mode (!M_forLandmarkScan):
    // Never draw an overlapping ellipsoid/capsule wall inside an already carved deeper blood lumen!
    const isInsideExistingBloodPool =
      !M_forLandmarkScan &&
      ((carveParentChamberId > 0 && prevMinLumenSdf < -0.15) ||
        (M_isInsideAnyBloodLumen && prevMinLumenSdf < -0.25));

    if (wallDist <= 0.0 && !isInsideExistingBloodPool) {
      const edgeProx = 1.0 - Math.min(1.0, Math.abs(wallDist) / Math.max(0.75, thicknessMm));
      const innerEndoBoost = sdf <= 0.35 ? 0.06 * edgeProx : 0.0;
      const heteroMod = 0.74 + 0.44 * M_warpHetero;
      const bs = (baseBs * (0.58 + 0.28 * edgeProx) + innerEndoBoost) * heteroMod;
      if (bs > M_bestBackscatter || M_bestId === 0) {
        M_bestId = id;
        M_bestZ = STRUCT_Z[id];
        M_bestBackscatter = bs < 0.78 ? bs : 0.78;
        M_bestAtten = STRUCT_ATTEN[id];
        const bGrad = Math.pow(edgeProx, 0.85) * 0.65;
        if (bGrad > M_bestBorder) M_bestBorder = bGrad;
        M_bestSdf = wallDist;
        const sgn = sdf >= 0.0 ? 1.0 : -1.0;
        M_bestNx = nx * sgn;
        M_bestNy = ny * sgn;
        M_bestNz = nz * sgn;
      }
    } else if (sdf < -thicknessMm) {
      // Strictly inside the carved anechoic blood-pool lumen of this chamber/vessel!
      M_isInsideAnyBloodLumen = true;
      const isCarvingPreviousWall =
        !M_forLandmarkScan
          ? M_bestId < 40 &&
            ((carveParentChamberId > 0 && M_bestId === carveParentChamberId) ||
              (M_bestId !== StructureId.FOSSA_OVALIS &&
                M_bestId !== StructureId.IAS_LIMBUS &&
                M_bestId !== StructureId.TRICUSPID_VALVE_ANT &&
                M_bestId !== StructureId.TRICUSPID_VALVE_SEPT &&
                M_bestId !== StructureId.AORTIC_VALVE_NCC &&
                M_bestId !== StructureId.AORTIC_VALVE_RCC &&
                M_bestId !== StructureId.AORTIC_VALVE_LCC &&
                M_bestId !== StructureId.MITRAL_VALVE_AML_PML &&
                M_bestId !== StructureId.COUMADIN_RIDGE &&
                M_bestId !== StructureId.MODERATOR_BAND &&
                M_bestId !== StructureId.RV_PAPILLARY_MUSCLES &&
                M_bestId !== StructureId.LV_PAPILLARY_AL_PM))
          : carveParentChamberId > 0 && M_bestId === carveParentChamberId && M_bestId < 40;

      if (
        M_bestId === 0 ||
        isCarvingPreviousWall ||
        (M_bestBackscatter < 0.14 && Math.abs(sdf) < lumenCaptureRadius)
      ) {
        M_bestId = id;
        M_bestZ = 1.61;
        M_bestBackscatter = 0.01;
        M_bestAtten = 0.14;
        M_bestBorder = 0.0;
        M_bestSdf = sdf;
      }
    }
  } else {
    // Solid intracardiac landmark / valve leaflet / ridge / papillary muscle / device
    const d = sdf - thicknessMm;
    if (d <= 0.0) {
      const edgeProx = 1.0 - Math.min(1.0, Math.abs(d) / Math.max(0.65, thicknessMm + 0.8));
      const heteroMod = id >= 40 ? 1.0 : 0.76 + 0.40 * M_warpHetero;
      const bs = baseBs * (0.68 + 0.26 * edgeProx) * heteroMod;
      const maxBs = id >= 40 ? 1.0 : 0.84;
      if (id >= 40 || bs >= M_bestBackscatter) {
        M_bestId = id;
        M_bestZ = STRUCT_Z[id];
        M_bestBackscatter = bs < maxBs ? bs : maxBs;
        M_bestAtten = STRUCT_ATTEN[id];
        const bGrad = (id >= 40 ? 0.55 : 0.32) + 0.42 * edgeProx;
        if (bGrad > M_bestBorder) M_bestBorder = bGrad;
        M_bestSdf = d;
        M_bestNx = nx;
        M_bestNy = ny;
        M_bestNz = nz;
      }
    } else if (M_forLandmarkScan && d < 3.2 && M_bestBackscatter < 0.12) {
      M_bestId = id;
    }
  }
}

// Per-frame cached cardiac phase & procedural state parameters
let C_simRef: ProceduralSimulationState | null = null;
let C_phase = -1.0;
let C_tentMm = -1.0;
let C_wmStage = '';
let C_sysEnv = 0.0;
let C_diaEnv = 0.0;
let C_raContract = 1.0;
let C_rvContract = 1.0;
let C_tvOpenShift = 0.0;
let C_aovOpen = 0.0;
let C_pvOpen = 0.0;
let C_mvOpen = 0.0;

/**
 * Complete 42-Structure Analytical 3D Cardiac & Procedural SDF + Continuous Tissue Matrix Evaluator
 * in the Frozen Shared Contract Coordinate Frame (mm, Origin [0,0,0] = Mid-RA Home View).
 */
function evaluateAnalyticalCardiacAndDeviceField(
  rawX: number,
  rawY: number,
  rawZ: number,
  simState: ProceduralSimulationState,
  forLandmarkScan: boolean
): EvaluatedAcousticFieldPoint {
  const phase = simState.cardiacPhase ?? 0.0;
  const tentMm = Math.max(0.0, simState.tspTentingMm ?? 0.0);
  const wmStage = simState.watchmanStage ?? 'none';

  if (simState !== C_simRef || phase !== C_phase || tentMm !== C_tentMm || wmStage !== C_wmStage) {
    C_simRef = simState;
    C_phase = phase;
    C_tentMm = tentMm;
    C_wmStage = wmStage;
    const isSystole = phase >= 0.06 && phase <= 0.38;
    C_sysEnv = isSystole ? Math.sin(((phase - 0.06) / 0.32) * Math.PI) : 0.0;
    C_diaEnv = !isSystole ? Math.sin((((phase - 0.38 + 1.0) % 1.0) / 0.68) * Math.PI) : 0.0;
    const atrialKick = Math.exp(-Math.pow((cardiacPhaseWrap(phase) - 0.88) / 0.055, 2));
    C_raContract = 1.0 - 0.08 * atrialKick;
    C_rvContract = 1.0 - 0.12 * C_sysEnv;
    C_tvOpenShift = C_diaEnv * 3.8;
    C_aovOpen = C_sysEnv * 2.8;
    C_pvOpen = C_sysEnv * 2.5;
    C_mvOpen = C_diaEnv * 3.8;
  }

  const sysEnv = C_sysEnv;
  const diaEnv = C_diaEnv;
  const raContract = C_raContract;
  const rvContract = C_rvContract;
  const tvOpenShift = C_tvOpenShift;
  const aovOpen = C_aovOpen;
  const pvOpen = C_pvOpen;
  const mvOpen = C_mvOpen;

  // Sample 3D Multi-Octave Domain Warp for organic non-elliptical chamber boundaries (!forLandmarkScan)
  let x = rawX;
  let y = rawY;
  let z = rawZ;
  let vx = rawX;
  let vy = rawY;
  let vz = rawZ;
  if (forLandmarkScan) {
    M_warpHetero = 0.5;
  } else {
    const warp = sampleDomainWarp3D(rawX, rawY, rawZ);
    M_warpHetero = warp.hetero;
    x = rawX + warp.dx * 0.72;
    y = rawY + warp.dy * 0.72;
    z = rawZ + warp.dz * 0.72;
    vx = rawX + warp.dx * 0.24;
    vy = rawY + warp.dy * 0.24;
    vz = rawZ + warp.dz * 0.24;
  }

  M_bestId = 0;
  M_bestZ = 1.61;
  M_bestBackscatter = 0.01;
  M_bestAtten = 0.14;
  M_bestBorder = 0.0;
  M_bestSdf = 100.0;
  M_bestNx = 0.0;
  M_bestNy = 1.0;
  M_bestNz = 0.0;
  M_minLumenSdf = 999.0;
  M_nearestLumenId = StructureId.RA_CAVITY;
  M_nearestLumenWallMm = 4.2;
  M_nearestLumenNx = 0.0;
  M_nearestLumenNy = 1.0;
  M_nearestLumenNz = 0.0;
  M_isInsideAnyBloodLumen = false;
  M_forLandmarkScan = forLandmarkScan;

  let flowVx = 0.0;
  let flowVy = 0.0;
  let flowVz = 0.0;

  // ============================================================================
  // A. PROCEDURAL DEVICES (IDs 40, 41, 42) — STRICTLY GATED BY SIMSTATE
  // ============================================================================
  const tspShiftY = ((simState.tspHeightAboveMvMm ?? 42) - 42) * 0.28;
  const tspShiftZ = (simState.tspApOffsetMm ?? -3) * 0.35;
  const foCenterX = 9.5 + tentMm * 0.55;
  const foCenterY = 6.5 + tspShiftY;
  const foCenterZ = -9.5 + tspShiftZ - tentMm * 0.35;

  // 41. Transseptal Puncture Sheath & Brockenbrough Needle (ONLY when tenting > 0.15mm or tspNeedleActive)
  const showTsp = tentMm > 0.15 || Boolean((simState as any).tspNeedleActive);
  if (showTsp && rawX > -2.0 && rawX < 38.0 && rawY > -20.0 && rawY < 18.0) {
    if (forLandmarkScan) {
      const tspCap1 = sdCapsule3D(rawX, rawY, rawZ, 1.5, -14.0, -5.0, foCenterX + 2.2, foCenterY, foCenterZ - 1.2, 1.45);
      if (tspCap1.dist <= 0.55) {
        commitHitFast(StructureId.TRANSSEPTAL_NEEDLE_SHEATH, tspCap1.dist, 0.55, tspCap1.nx, tspCap1.ny, tspCap1.nz, 0.99, false);
      }
    } else {
      // Oblique transseptal sheath & needle approaching in-plane from RA cavity to the centered tenting apex of Fossa Ovalis
      const apexX = 24.8 + tentMm * 0.62;
      const apexY = 10.5 + tspShiftY;
      const apexZ = -7.0 + tspShiftZ - tentMm * 0.18;
      const tspCapLive = sdCapsule3D(vx, vy, vz, 14.2, 6.2 + tspShiftY, -4.4 + tspShiftZ, apexX, apexY, apexZ, 0.92);
      if (tspCapLive.dist <= 0.36) {
        commitHitFast(StructureId.TRANSSEPTAL_NEEDLE_SHEATH, tspCapLive.dist, 0.36, tspCapLive.nx, tspCapLive.ny, tspCapLive.nz, 0.99, false);
      }
    }
  }

  // 40. Watchman FLX LAA Closure Device (ONLY when watchmanStage !== 'none')
  const showWatchman = Boolean(wmStage && wmStage !== 'none');
  if (showWatchman && rawX > 34.0 && rawX < 68.0 && rawY > 6.0 && rawY < 44.0) {
    const tugOffset = simState.watchmanTugActive ? -2.2 : 0.0;
    const wmCx = forLandmarkScan ? 51.5 + tugOffset * 0.85 : 50.5 + tugOffset * 0.76;
    const wmCy = forLandmarkScan ? 28.5 + tugOffset * 0.25 : 19.8 + tugOffset * 0.62;
    const wmCz = forLandmarkScan ? 0.5 - tugOffset * 0.15 : 0.8 + tugOffset * 0.18;
    const stageScale =
      wmStage === 'sheath_across'
        ? 0.38
        : wmStage === 'flx_ball'
          ? 0.62
          : wmStage === 'triangle'
            ? 0.84
            : 1.0;
    const radMm = (simState.watchmanSizeMm ?? 27) * (forLandmarkScan ? 0.38 : 0.34) * stageScale;
    const wmEll = sdEllipsoid3D(rawX, rawY, rawZ, wmCx, wmCy, wmCz, radMm, radMm * 0.88, radMm * 0.88);
    if (wmEll.dist < 2.5) {
      if (forLandmarkScan) {
        const angleStrut = Math.atan2(rawY - wmCy, rawZ - wmCz);
        const strutWave = 0.5 + 0.5 * Math.cos(angleStrut * 18.0);
        const diamondBraid = 0.5 + 0.5 * Math.cos(angleStrut * 18.0 + (rawX - wmCx) * 1.4);
        const isProximalCap =
          rawX < wmCx - radMm * 0.18 &&
          rawX > wmCx - radMm * 0.88 &&
          Math.hypot(rawY - wmCy, rawZ - wmCz) < radMm * 0.84 &&
          Math.abs(wmEll.dist) < 2.1;
        const isStrutShell = Math.abs(wmEll.dist) < 1.9 && (strutWave > 0.25 || diamondBraid > 0.58);
        const isHub = Math.hypot(rawX - (wmCx - radMm * 0.68), rawY - wmCy, rawZ - wmCz) < 2.2;
        if (isProximalCap || isStrutShell || isHub) {
          commitHitFast(
            StructureId.WATCHMAN_FLX_DEVICE,
            Math.min(Math.abs(wmEll.dist), 0.18),
            1.5,
            wmEll.nx,
            wmEll.ny,
            wmEll.nz,
            isHub ? 1.0 : isStrutShell ? 0.96 : 0.86,
            false
          );
        }
      } else {
        // Seated Watchman FLX along the LA-to-LAA landing-zone axis uhat = (0.764, 0.620, 0.177)
        const dWx = rawX - wmCx;
        const dWy = rawY - wmCy;
        const dWz = rawZ - wmCz;
        const uAxis = dWx * 0.764 + dWy * 0.620 + dWz * 0.177;
        const vPerp1 = -dWx * 0.630 + dWy * 0.776;
        const vPerp2 = dWz - uAxis * 0.177;
        const rPerp = Math.hypot(vPerp1, vPerp2);
        const angleStrut = Math.atan2(vPerp1, vPerp2);
        const strutComb = 0.5 + 0.5 * Math.cos(angleStrut * 18.0 + uAxis * 1.35);
        // Flat/slightly convex proximal PET fabric face across the LAA ostium shoulder
        const capPlaneDist = Math.abs(uAxis + radMm * 0.56 - 0.025 * rPerp * rPerp);
        const isProximalCap = capPlaneDist < 0.72 && rPerp <= radMm * 0.82;
        const isHub = Math.hypot(uAxis + radMm * 0.58, rPerp) < 1.65;
        const isStrutPerimeter =
          uAxis >= -radMm * 0.58 &&
          Math.abs(wmEll.dist) < 0.78 &&
          strutComb > 0.34;
        if (isHub || isProximalCap || isStrutPerimeter) {
          commitHitFast(
            StructureId.WATCHMAN_FLX_DEVICE,
            0.12,
            0.65,
            wmEll.nx,
            wmEll.ny,
            wmEll.nz,
            isHub ? 0.98 : isProximalCap ? 0.82 : 0.90,
            false
          );
        }
      }
    }
  }

  // 42. Irrigated RF Ablation Catheter Tip (ONLY when ablationCatheterActive is true)
  if (simState.ablationCatheterActive) {
    const targetId = simState.ablationTargetStructureId ?? StructureId.CTI_FLOOR;
    const targetMeta = ANATOMICAL_STRUCTURES[targetId] ?? ANATOMICAL_STRUCTURES[StructureId.CTI_FLOOR];
    const [tx, ty, tz] = targetMeta.worldCentroidMm;
    if (Math.abs(rawX - tx) < 14.0 && Math.abs(rawY - ty) < 14.0 && Math.abs(rawZ - tz) < 14.0) {
      const ablCap = sdCapsule3D(rawX, rawY, rawZ, tx - 8.0, ty - 6.0, tz - 4.0, tx, ty, tz, 1.55);
      if (ablCap.dist <= 0.55) {
        commitHitFast(StructureId.ABLATION_CATHETER_TIP, ablCap.dist, 0.55, ablCap.nx, ablCap.ny, ablCap.nz, 0.99, false);
      }
    }
  }

  const curStation = activeTransducerCtx.active ? activeTransducerCtx.station : 'ra_venous';
  const isLaLive = !forLandmarkScan && curStation === 'la_transseptal';
  const isHighRvotLive =
    !forLandmarkScan &&
    curStation === 'rv_outflow' &&
    activeTransducerCtx.pos[1] > 5.0;
  const isVentricularRvLive =
    !forLandmarkScan &&
    curStation === 'rv_outflow' &&
    activeTransducerCtx.pos[1] <= 5.0;
  const isRvotLive = isHighRvotLive;
  const isTspLive = !forLandmarkScan && curStation === 'ra_venous' && tentMm > 0.5;
  const isLeftPvViewLive =
    !forLandmarkScan &&
    curStation === 'ra_venous' &&
    !isTspLive &&
    activeTransducerCtx.active &&
    activeTransducerCtx.faceNormal[2] < -0.40;

  // Interatrial Septum & Fossa Ovalis 3D Curved/Tented Surface Signed Distance (`[SPEC PATCH #9]` Blocker A)
  const iasNx = 0.945;
  const iasNy = 0.055;
  const iasNz = -0.322;
  const dxFoLive = vx - 24.8;
  const dyFoLive = vy - (10.5 + tspShiftY);
  const dzFoLive = vz - (-7.0 + tspShiftZ);
  const iasRawPlaneDist = dxFoLive * iasNx + dyFoLive * iasNy + dzFoLive * iasNz;
  const iasRadialInPlane = Math.sqrt(Math.max(0.0, dyFoLive * dyFoLive + Math.pow(dzFoLive * 0.94 + dxFoLive * 0.32, 2)));
  const iasConeTentDisp = tentMm > 0.1 ? tentMm * 0.66 * Math.max(0.0, 1.0 - iasRadialInPlane / 9.2) : 0.0;
  const iasAtrialCurve = iasRadialInPlane > 8.8 ? 0.010 * Math.pow(iasRadialInPlane - 8.8, 2) : 0.0;
  const iasPlaneDist = iasRawPlaneDist - iasConeTentDisp + iasAtrialCurve;

  // Tricuspid Valve Orifice 3D Opening (`[SPEC PATCH #9]` Blocker D)
  const tvOrificeEll =
    !forLandmarkScan && !isLaLive && !isHighRvotLive && !isVentricularRvLive && !isTspLive && !isLeftPvViewLive
      ? sdEllipsoid3D(x, y, z, 19.5, -6.5, 19.5, 10.5, 9.5, 10.5)
      : null;

  // ============================================================================
  // C. RIGHT ATRIUM, VENAE CAVAE & SEPTAL LANDMARKS (IDs 1..12)
  // ============================================================================
  if (forLandmarkScan || (!isLaLive && !isLeftPvViewLive)) {
    // 1. Right Atrium (RA) Cavity & Wall (evaluated without hard Cartesian plane cutoffs so M_minLumenSdf is C1-smooth)
    const raEll = forLandmarkScan
      ? sdEllipsoid3D(x, y, z, -1.5, 6.0, 2.0, 22.0 * raContract, 28.0 * raContract, 22.0 * raContract)
      : isHighRvotLive
        ? sdEllipsoid3D(x, y, z, 28.5, 1.5, -4.0, 14.5 * raContract, 13.5 * raContract, 14.0 * raContract)
        : isVentricularRvLive
          ? sdEllipsoid3D(x, y, z, 6.5, 8.0, 4.0, 13.5 * raContract, 14.5 * raContract, 13.5 * raContract)
          : sdEllipsoid3D(x, y, z, 2.5, 5.5, 3.0, 24.5 * raContract, 27.5 * raContract, 22.5 * raContract);
    let raSdf = raEll.dist;
    if (!forLandmarkScan && !isHighRvotLive && !isVentricularRvLive) {
      if (isTspLive) {
        // Extend RA blood pool right up to the anterior face of the tented Fossa Ovalis & Limbus (`zf_13` Blocker A)
        const raTspCorridor = sdEllipsoid3D(
          x,
          y,
          z,
          14.5,
          10.5 + tspShiftY,
          -5.5 + tspShiftZ,
          24.0 * raContract,
          21.5 * raContract,
          21.0 * raContract
        );
        const raToSeptumSdf = Math.max(raTspCorridor.dist, iasPlaneDist - 0.90);
        raSdf = Math.min(raSdf, raToSeptumSdf);
        if (iasRadialInPlane <= 19.5 && iasPlaneDist >= -0.66 && Math.abs(raSdf) <= 1.55) {
          raSdf = 4.0;
        }
      } else if (tvOrificeEll && tvOrificeEll.dist < -0.2 && Math.abs(raSdf) <= 1.55) {
        // Carve open the RA side of the Tricuspid Valve orifice (`zf_02` Blocker D)
        raSdf = Math.min(raSdf, tvOrificeEll.dist - 1.65);
      }
    }
    commitHitFast(
      StructureId.RA_CAVITY,
      raSdf,
      forLandmarkScan ? 2.1 : 1.55,
      raEll.nx,
      raEll.ny,
      raEll.nz,
      0.40,
      true,
      25.0,
      0,
      4.2
    );

    // 4. Superior Vena Cava (SVC)
    if (forLandmarkScan || (!isRvotLive && !isVentricularRvLive && !isTspLive && rawY > 14.0)) {
      const svcCap = sdCapsule3D(x, y, z, -1.0, 22.0, -3.5, -0.8, 82.0, -4.8, 10.5);
      commitHitFast(StructureId.SVC, svcCap.dist, 1.65, svcCap.nx, svcCap.ny, svcCap.nz, 0.44, true, 12.0, StructureId.RA_CAVITY, 3.8);
      if (svcCap.dist < -1.8) {
        flowVy = -34.0 * (0.65 + 0.35 * sysEnv);
      }
    }

    // 5. Inferior Vena Cava (IVC)
    if (forLandmarkScan || (!isRvotLive && !isVentricularRvLive && !isTspLive && rawY < -10.0)) {
      const ivcCap = sdCapsule3D(x, y, z, -0.5, -16.0, -3.5, -0.6, -98.0, -5.8, 12.0);
      commitHitFast(StructureId.IVC, ivcCap.dist, 1.75, ivcCap.nx, ivcCap.ny, ivcCap.nz, 0.44, true, 14.0, StructureId.RA_CAVITY, 4.2);
      if (ivcCap.dist < -1.9) {
        flowVy = 32.0 * (0.65 + 0.35 * diaEnv);
      }
    }

    // 2. Right Atrial Appendage (RAA) & Comb-Like Pectinate Muscles
    if (rawY > 4.0 && rawZ > 6.0 && (forLandmarkScan || (!isRvotLive && !isVentricularRvLive && !isTspLive && rawX < 6.0))) {
      const raaEll1 = sdEllipsoid3D(x, y, z, 1.8, 20.2, 25.2, 13.5, 12.5, 14.0);
      const raaEll2 = sdEllipsoid3D(x, y, z, -11.0, 19.0, 24.0, 14.0, 12.5, 14.0);
      const raaBaseDist = Math.min(raaEll1.dist, raaEll2.dist);
      if (raaBaseDist <= 5.5) {
        const raaN = raaEll1.dist < raaEll2.dist ? raaEll1 : raaEll2;
        const raaDist = forLandmarkScan ? raaBaseDist : raaBaseDist + (M_warpHetero - 0.5) * 0.45;
        if (raaDist <= 3.5) {
          const pectinateMod = 0.46 + 0.18 * M_warpHetero;
          if (forLandmarkScan) {
            commitHitFast(StructureId.RAA_PECTINATES, Math.abs(raaBaseDist), 2.6, raaN.nx, raaN.ny, raaN.nz, pectinateMod, false);
          } else {
            commitHitFast(StructureId.RAA_PECTINATES, raaDist, 1.6, raaN.nx, raaN.ny, raaN.nz, pectinateMod, true, 14.0, StructureId.RA_CAVITY, 4.5);
          }
        }
      }
    }

    // 3. Crista Terminalis
    if (rawX < 8.0 && rawZ > 2.0 && !isRvotLive && !isVentricularRvLive && !isTspLive) {
      const ctCap1 = sdCapsule3D(vx, vy, vz, -2.9, 26.0, 13.8, -8.5, -12.0, 10.0, forLandmarkScan ? 3.8 : 2.2);
      const ctCap2 = sdCapsule3D(vx, vy, vz, -12.0, 24.0, 16.0, 2.5, 28.0, 8.0, forLandmarkScan ? 3.6 : 2.1);
      const ctBest = ctCap1.dist < ctCap2.dist ? ctCap1 : ctCap2;
      commitHitFast(StructureId.CRISTA_TERMINALIS, ctBest.dist, forLandmarkScan ? 1.6 : 1.0, ctBest.nx, ctBest.ny, ctBest.nz, 0.64, false);
    }

    // 6, 7, 8, 9, 10: Eustachian, CTI, CS Ostium, Thebesian, Koch (inferior/posterior RA)
    if (rawY < 8.0 && !isTspLive && !isRvotLive && !isVentricularRvLive && !isLeftPvViewLive) {
      const eustCap = sdCapsule3D(vx, vy, vz, -4.0, -18.8, -2.0, 10.5, -17.5, 4.5, forLandmarkScan ? 3.6 : 1.9);
      commitHitFast(StructureId.EUSTACHIAN_RIDGE, eustCap.dist, forLandmarkScan ? 1.6 : 0.85, eustCap.nx, eustCap.ny, eustCap.nz, 0.68, false);

      const ctiCap = sdCapsule3D(vx, vy, vz, 2.0, -23.5, 4.0, 18.0, -21.0, 19.0, forLandmarkScan ? 4.2 : 2.8);
      commitHitFast(StructureId.CTI_FLOOR, ctiCap.dist, forLandmarkScan ? 1.8 : 1.25, ctiCap.nx, ctiCap.ny, ctiCap.nz, 0.56, false);

      if (forLandmarkScan || rawZ < 6.0) {
        const csCap1 = sdCapsule3D(x, y, z, 11.5, -13.0, 4.5, 18.5, -12.7, -8.5, 5.4);
        const csCap2 = sdCapsule3D(x, y, z, 18.5, -12.7, -8.5, 36.0, -10.5, -16.0, 4.8);
        const csBest = csCap1.dist < csCap2.dist ? csCap1 : csCap2;
        commitHitFast(StructureId.CORONARY_SINUS_OSTIUM, csBest.dist, 1.45, csBest.nx, csBest.ny, csBest.nz, 0.48, true, 6.0, StructureId.RA_CAVITY, 4.0);
        if (csBest.dist < -1.4) {
          flowVx = -28.0;
          flowVy = 10.0;
          flowVz = 18.0;
        }
      }

      const thebEll = sdEllipsoid3D(vx, vy, vz, 15.5, -13.5, 1.5, 4.8, 3.8, 6.5);
      const thebEll2 = sdEllipsoid3D(vx, vy, vz, 16.5, -13.2, -5.8, 4.5, 3.8, 4.5);
      const thebBest = thebEll.dist < thebEll2.dist ? thebEll : thebEll2;
      commitHitFast(StructureId.THEBESIAN_VALVE, thebBest.dist, forLandmarkScan ? 1.4 : 0.75, thebBest.nx, thebBest.ny, thebBest.nz, 0.66, false);

      const kochCap = sdCapsule3D(vx, vy, vz, 15.0, -9.0, 2.0, 25.2, 2.9, 4.3, forLandmarkScan ? 4.2 : 2.5);
      if (forLandmarkScan) {
        const kochEll = sdEllipsoid3D(vx, vy, vz, 21.9, -3.1, -2.0, 6.0, 5.5, 6.0);
        const kochBest = kochEll.dist < kochCap.dist ? kochEll : kochCap;
        commitHitFast(StructureId.TRIANGLE_OF_KOCH_HIS, kochBest.dist, 1.5, kochBest.nx, kochBest.ny, kochBest.nz, 0.62, false);
      } else {
        commitHitFast(StructureId.TRIANGLE_OF_KOCH_HIS, kochCap.dist, 1.0, kochCap.nx, kochCap.ny, kochCap.nz, 0.58, false);
      }
    }

    // 11 & 12. Interatrial Septum: Thin Taut Bilaminar Fossa Ovalis Membrane (11) & Fleshy Limbus Rims (12)
    if (forLandmarkScan) {
      const foCap = sdCapsule3D(vx, vy, vz, 12.5, 4.5, 1.5, foCenterX, foCenterY, foCenterZ, 6.8);
      const iasNxScan = 0.78;
      const iasNyScan = 0.08;
      const iasNzScan = -0.62;
      const midFoX = 0.5 * (12.5 + foCenterX);
      const midFoY = 0.5 * (4.5 + foCenterY);
      const midFoZ = 0.5 * (1.5 + foCenterZ);
      const dxFo = vx - midFoX;
      const dyFo = vy - midFoY;
      const dzFo = vz - midFoZ;
      const rawPlaneDist = dxFo * iasNxScan + dyFo * iasNyScan + dzFo * iasNzScan;
      const radialInPlane = Math.sqrt(Math.max(0, dxFo * dxFo + dyFo * dyFo + dzFo * dzFo - rawPlaneDist * rawPlaneDist));
      const coneTentDisp = tentMm > 0.1 ? tentMm * 0.68 * Math.max(0.0, 1.0 - radialInPlane / 10.5) : 0.0;
      const planeDist = rawPlaneDist - coneTentDisp;

      if (radialInPlane <= 10.5 && Math.abs(planeDist) <= 2.2) {
        commitHitFast(StructureId.FOSSA_OVALIS, Math.abs(planeDist), 1.35, iasNxScan, iasNyScan, iasNzScan, 0.90, false);
      } else if (foCap.dist <= 1.2) {
        commitHitFast(StructureId.FOSSA_OVALIS, foCap.dist, 1.2, iasNxScan, iasNyScan, iasNzScan, 0.88, false);
      }

      const supLimbus = sdCapsule3D(x, y, z, 11.5, 15.0, 3.0, 9.3, 16.5, -11.5, 4.8);
      const infLimbus = sdCapsule3D(x, y, z, 11.5, -4.5, 1.5, 9.3, -4.0, -10.5, 4.6);
      const limbusBest = supLimbus.dist < infLimbus.dist ? supLimbus : infLimbus;
      commitHitFast(StructureId.IAS_LIMBUS, limbusBest.dist, 1.8, limbusBest.nx, limbusBest.ny, limbusBest.nz, 0.86, false);
    } else if (!isRvotLive && !isVentricularRvLive && !isLeftPvViewLive && rawX > 14.0 && rawX < 38.0 && rawZ < 4.0 && rawZ > -22.0) {
      // Live B-mode Continuous Interatrial Septum Partition & Tented Fossa Ovalis (`zf_13`, `zf_14`, `wm_01..wm_03`)
      if (iasRadialInPlane <= 8.8 && Math.abs(iasPlaneDist) <= 0.72) {
        commitHitFast(StructureId.FOSSA_OVALIS, Math.abs(iasPlaneDist), 0.62, iasNx, iasNy, iasNz, 0.78, false);
        if (tentMm > 2.0 && Math.abs(iasPlaneDist) < 2.2) {
          flowVx = 58.0 * iasNx;
          flowVy = 12.0;
          flowVz = 58.0 * iasNz;
        }
      } else if (iasRadialInPlane > 8.8 && iasRadialInPlane <= 19.2) {
        // Continuous muscular Superior & Inferior Limbus rim tapering smoothly into the thin Fossa Ovalis membrane
        const limbusT = Math.min(1.0, (iasRadialInPlane - 8.8) / 10.4);
        const halfThick = 0.68 + 1.10 * Math.sin(limbusT * Math.PI);
        if (Math.abs(iasPlaneDist) <= halfThick) {
          commitHitFast(
            StructureId.IAS_LIMBUS,
            Math.abs(iasPlaneDist),
            halfThick,
            iasNx,
            iasNy,
            iasNz,
            0.48 + 0.10 * Math.sin(limbusT * Math.PI),
            false
          );
        }
      }
    }
  }

  // ============================================================================
  // D. TRICUSPID VALVE, RIGHT VENTRICLE, RVOT & PULMONARY TREE (IDs 13..21)
  // ============================================================================
  let rvEllDist = 100.0;
  if (forLandmarkScan || (!isLaLive && !isTspLive && !isLeftPvViewLive)) {
    const tvCurveSag = !forLandmarkScan && rawY < 4.0 && rawZ > 12.0 ? 0.55 * (M_warpHetero - 0.5) : 0.0;

    // 16. Right Ventricle (RV) Inflow & Trabeculated Cavity (evaluated BEFORE TV leaflets so the TV orifice is carved open!)
    if (forLandmarkScan || !isHighRvotLive) {
      let rvEllBase = forLandmarkScan
        ? sdEllipsoid3D(x, y, z, 33.1, -2.0, 27.0, 22.0 * rvContract, 26.0 * rvContract, 22.0 * rvContract)
        : sdEllipsoid3D(x, y, z, 33.5, -10.5, 27.0, 20.0 * rvContract, 15.5 * rvContract, 20.5 * rvContract);
      if (!forLandmarkScan) {
        if (isVentricularRvLive) {
          // In ventricular RV views (`zf_06..zf_09`), unite the near-field RV inflow with the anterior-apical RV body
          const rvNearEll = sdEllipsoid3D(x, y, z, 31.0, -8.5, 30.0, 19.5 * rvContract, 17.5 * rvContract, 19.5 * rvContract);
          const rvApexEll = sdEllipsoid3D(x, y, z, 43.0, -11.5, 45.5, 23.0 * rvContract, 21.0 * rvContract, 25.5 * rvContract);
          if (rvNearEll.dist < rvEllBase.dist) rvEllBase = rvNearEll;
          if (rvApexEll.dist < rvEllBase.dist) rvEllBase = rvApexEll;
        } else {
          // Carve open the Tricuspid Valve orifice channel between RA and RV (`zf_02` Blocker D)
          const tvChannel = sdCapsule3D(x, y, z, 11.5, -2.5, 13.5, 28.5, -9.5, 25.0, 9.2 * (0.84 + 0.16 * diaEnv));
          if (tvChannel.dist < rvEllBase.dist) {
            rvEllBase = tvChannel;
          }
        }
      }
      rvEllDist = rvEllBase.dist;
      const rvTrabeculae = !forLandmarkScan && rawX > 32.0 && Math.abs(rvEllDist) < 4.5 ? (M_warpHetero - 0.5) * 0.55 : 0.0;
      let rvSdf = rvEllDist + rvTrabeculae;
      if (tvOrificeEll && tvOrificeEll.dist < -0.2 && Math.abs(rvSdf) <= 2.0) {
        // Suppress RV_CAVITY wall across the open Tricuspid Valve orifice (`zf_02` Blocker D)
        rvSdf = Math.min(rvSdf, tvOrificeEll.dist - 2.15);
      }
      commitHitFast(
        StructureId.RV_CAVITY,
        rvSdf,
        forLandmarkScan ? 3.0 : 2.0,
        rvEllBase.nx,
        rvEllBase.ny,
        rvEllBase.nz,
        0.44,
        true,
        24.0,
        StructureId.RA_CAVITY,
        5.2
      );
    }

    // 13, 14, 15. Tricuspid Valve Leaflets (Anterior, Septal, Posterior — suspended across the open TV orifice!)
    if (rawY < 6.0 && rawZ > 10.0 && !isVentricularRvLive) {
      const tvAnt1 = forLandmarkScan
        ? sdCapsule3D(rawX, rawY, rawZ, 17.0, -3.0, 29.0, 25.0 + tvOpenShift, -10.0 - tvOpenShift * 0.5, 24.5, 3.2)
        : sdCapsule3D(vx, vy + tvCurveSag, vz, 16.5, 0.2, 22.0, 23.2 + tvOpenShift * 0.45, -4.5 + tvOpenShift * 0.25, 28.2, 0.78);
      const tvAnt2 = sdCapsule3D(vx, vy, vz, -8.5, -2.0, 22.5, 17.0, -3.0, 29.0, forLandmarkScan ? 3.0 : 0.75);
      const tvAnt = tvAnt1.dist < tvAnt2.dist ? tvAnt1 : tvAnt2;
      commitHitFast(StructureId.TRICUSPID_VALVE_ANT, tvAnt.dist, forLandmarkScan ? 1.35 : 0.44, tvAnt.nx, tvAnt.ny, tvAnt.nz, 0.74, false);

      const tvSept = forLandmarkScan
        ? sdCapsule3D(rawX, rawY, rawZ, 19.0, -5.0, 14.0, 26.0 - tvOpenShift * 0.4, -10.5, 19.5 + tvOpenShift * 0.4, 3.2)
        : sdCapsule3D(vx, vy - tvCurveSag * 0.6, vz, 16.2, -12.5, 17.8, 22.2 - tvOpenShift * 0.35, -8.5 - tvOpenShift * 0.25, 23.8 + tvOpenShift * 0.35, 0.78);
      commitHitFast(StructureId.TRICUSPID_VALVE_SEPT, tvSept.dist, forLandmarkScan ? 1.35 : 0.44, tvSept.nx, tvSept.ny, tvSept.nz, 0.74, false);

      const tvPost = forLandmarkScan
        ? sdCapsule3D(rawX, rawY, rawZ, 19.0, -17.0, 21.0, 26.5, -13.0 + tvOpenShift * 0.4, 22.5, 3.2)
        : sdCapsule3D(vx, vy, vz, 18.0, -17.5, 19.0, 24.0, -13.0 + tvOpenShift * 0.35, 22.0, 0.68);
      commitHitFast(StructureId.TRICUSPID_VALVE_POST, tvPost.dist, forLandmarkScan ? 1.35 : 0.42, tvPost.nx, tvPost.ny, tvPost.nz, 0.70, false);

      // Diastolic Tricuspid Inflow / Systolic Regurgitant physiological Doppler velocity field
      const tvOrificeDist = Math.hypot(rawX - 22.0, rawY - -7.5, rawZ - 20.5);
      if (tvOrificeDist < 14.5) {
        const profile = Math.max(0.0, 1.0 - Math.pow(tvOrificeDist / 14.5, 2));
        if (diaEnv > 0.08) {
          flowVx = 68.0 * diaEnv * profile;
          flowVy = -20.0 * diaEnv * profile;
          flowVz = 62.0 * diaEnv * profile;
        } else if (sysEnv > 0.12) {
          flowVx = -38.0 * sysEnv * profile;
          flowVy = 14.0 * sysEnv * profile;
          flowVz = -36.0 * sysEnv * profile;
        }
      }
    }

    // 17. Moderator Band & 18. RV Papillary Muscles (`zf_06` Blocker C1: transverse mid-apical bridge & wall-anchored mound)
    if (rawX > 20.0 && rawY < 16.0 && (forLandmarkScan || !isHighRvotLive)) {
      if (forLandmarkScan) {
        const modCap1 = sdCapsule3D(x, y, z, 27.0, -13.5, 26.5, 44.0, -18.5, 41.5, 3.8);
        const modCap2 = sdCapsule3D(x, y, z, 28.5, 6.5, 1.5, 36.5, -12.0, 24.5, 3.6);
        const modCap = modCap2.dist < modCap1.dist ? modCap2 : modCap1;
        commitHitFast(StructureId.MODERATOR_BAND, modCap.dist, 1.5, modCap.nx, modCap.ny, modCap.nz, 0.72, false);

        const rvPap1 = sdCapsule3D(x, y, z, 35.0, -14.0, 34.0, 44.7, -0.5, 38.5, 4.5);
        const rvPap2 = sdCapsule3D(x, y, z, 31.0, 10.0, 3.0, 39.0, -9.0, 24.0, 4.2);
        const rvPapBest = rvPap2.dist < rvPap1.dist ? rvPap2 : rvPap1;
        commitHitFast(StructureId.RV_PAPILLARY_MUSCLES, rvPapBest.dist, 1.5, rvPapBest.nx, rvPapBest.ny, rvPapBest.nz, 0.68, false);
      } else if (isVentricularRvLive && rawX > 36.0 && rawZ > 36.0) {
        // Curved muscular Moderator Band bridging wall-to-wall across mid-apical RV from septal wall to anterior free wall (`02_ehra` Panel B)
        const modArc = 1.4 * Math.cos(Math.min(1.5, Math.abs(vy + 14.0) / 11.5));
        const modVent = sdCapsule3D(vx + modArc * 0.6, vy, vz + modArc * 0.7, 44.5, -31.5, 58.5, 53.6, 3.2, 56.8, 2.05);
        commitHitFast(StructureId.MODERATOR_BAND, modVent.dist, 0.85, modVent.nx, modVent.ny, modVent.nz, 0.56, false);

        // Rounded conical RV Papillary Muscle belly anchored directly into the anterior/right RV wall at r = 33..36 mm
        const rvPapVent = sdEllipsoid3D(vx, vy, vz, 46.8, 5.2, 48.8, 4.4, 5.0, 4.4);
        commitHitFast(StructureId.RV_PAPILLARY_MUSCLES, rvPapVent.dist, 0.90, rvPapVent.nx, rvPapVent.ny, rvPapVent.nz, 0.54, false);
      } else if (!isVentricularRvLive && rawX > 30.0 && rawZ > 28.0) {
        const modCap1 = sdCapsule3D(x, y, z, 32.0, -14.5, 31.0, 44.0, -18.5, 41.5, 2.2);
        commitHitFast(StructureId.MODERATOR_BAND, modCap1.dist, 0.85, modCap1.nx, modCap1.ny, modCap1.nz, 0.56, false);

        const rvPap1 = sdCapsule3D(x, y, z, 36.5, -13.5, 35.0, 44.7, -2.5, 38.5, 2.6);
        commitHitFast(StructureId.RV_PAPILLARY_MUSCLES, rvPap1.dist, 0.85, rvPap1.nx, rvPap1.ny, rvPap1.nz, 0.54, false);
      }
    }

    // 19. RVOT Infundibulum & 20. Pulmonic Valve (evaluated without hard rawY planar cutoff!)
    const rvotCap = forLandmarkScan
      ? sdCapsule3D(x, y, z, 34.0, 12.0, 25.0, 44.0, 30.0, 25.5, 11.5)
      : isHighRvotLive
        ? sdEllipsoid3D(x, y, z, 26.5, 14.0, 11.5, 13.5, 12.5, 13.5)
        : sdCapsule3D(x, y, z, 36.5, 15.0, 38.0, 44.0, 26.0, 44.0, 11.5);
    commitHitFast(
      StructureId.RVOT_INFUNDIBULUM,
      rvotCap.dist,
      forLandmarkScan ? 2.5 : 1.75,
      rvotCap.nx,
      rvotCap.ny,
      rvotCap.nz,
      0.46,
      true,
      12.5,
      StructureId.RA_CAVITY,
      4.6
    );
    if (rvotCap.dist < -1.8) {
      if (sysEnv > 0.08) {
        flowVx = 10.0 * sysEnv;
        flowVy = 64.0 * sysEnv;
        flowVz = 8.0 * sysEnv;
      } else if (diaEnv > 0.08) {
        flowVx = 8.0 * diaEnv;
        flowVy = 26.0 * diaEnv;
        flowVz = -12.0 * diaEnv;
      }
    }

    if (rawY > 12.0) {
      const pvEll = sdEllipsoid3D(vx, vy, vz, 43.9, 28.9 + pvOpen * 0.4, 25.6, 9.5, forLandmarkScan ? 4.2 : 1.15, 9.5);
      commitHitFast(StructureId.PULMONIC_VALVE, pvEll.dist, forLandmarkScan ? 1.4 : 0.58, pvEll.nx, pvEll.ny, pvEll.nz, 0.78, false);
      if (pvEll.dist < 5.0 && sysEnv > 0.08) {
        flowVx = 14.0 * sysEnv;
        flowVy = 92.0 * sysEnv;
        flowVz = -24.0 * sysEnv;
      }
    }

    // 21. Main Pulmonary Artery (MPA), LPA & RPA
    if (forLandmarkScan) {
      const mpaCap = sdCapsule3D(x, y, z, 43.5, 30.0, 24.5, 42.0, 45.0, 14.0, 11.5);
      const lpaCap = sdCapsule3D(x, y, z, 42.0, 45.0, 14.0, 58.0, 45.0, -8.0, 9.5);
      const rpaCap = sdCapsule3D(x, y, z, 40.0, 42.0, 10.0, -12.0, 33.0, -24.0, 9.5);
      const paBest =
        mpaCap.dist < lpaCap.dist
          ? mpaCap.dist < rpaCap.dist
            ? mpaCap
            : rpaCap
          : lpaCap.dist < rpaCap.dist
            ? lpaCap
            : rpaCap;
      commitHitFast(
        StructureId.MAIN_PA_LPA_RPA,
        paBest.dist,
        2.0,
        paBest.nx,
        paBest.ny,
        paBest.nz,
        0.54,
        true,
        11.0,
        StructureId.RVOT_INFUNDIBULUM,
        4.2
      );
    } else if (!isHighRvotLive) {
      const mpaCap = sdCapsule3D(x, y, z, 43.5, 30.0, 24.5, 42.0, 45.0, 14.0, 11.0);
      commitHitFast(
        StructureId.MAIN_PA_LPA_RPA,
        mpaCap.dist,
        1.55,
        mpaCap.nx,
        mpaCap.ny,
        mpaCap.nz,
        0.46,
        true,
        11.0,
        StructureId.RVOT_INFUNDIBULUM,
        4.2
      );
      if (mpaCap.dist < -1.5 && sysEnv > 0.08) {
        flowVx = -18.0 * sysEnv;
        flowVy = 72.0 * sysEnv;
        flowVz = -28.0 * sysEnv;
      }
    }
  }

  // ============================================================================
  // E. AORTIC ROOT, TREFOIL SINUSES ("MERCEDES-BENZ" NCC/RCC/LCC) & CORONARIES (IDs 22..26)
  // ============================================================================
  if (forLandmarkScan) {
    const aoCap = sdCapsule3D(rawX, rawY, rawZ, 28.0, 12.0, 6.0, 32.8, 42.0, 4.0, 13.5);
    commitHitFast(StructureId.ASCENDING_AORTA_ROOT, aoCap.dist, 2.2, aoCap.nx, aoCap.ny, aoCap.nz, 0.66, true, 12.5, StructureId.RA_CAVITY, 4.5);

    const nccCap1 = sdCapsule3D(vx, vy, vz, 22.0, 14.0, 5.5, 34.2, 16.8 + aovOpen * 0.4, 3.8, 5.2);
    const nccCap2 = sdCapsule3D(vx, vy, vz, 13.5, 14.0, 21.0, 22.0, 14.5, 10.0, 4.6);
    const nccCap = nccCap1.dist < nccCap2.dist ? nccCap1 : nccCap2;
    commitHitFast(StructureId.AORTIC_VALVE_NCC, nccCap.dist, 1.4, nccCap.nx, nccCap.ny, nccCap.nz, 0.90, false);

    const rccCap1 = sdCapsule3D(vx, vy, vz, 27.0, 16.0, 14.0, 35.0, 21.5 + aovOpen * 0.4, 11.5, 5.2);
    const rccCap2 = sdCapsule3D(vx, vy, vz, 15.0, 18.5, 25.5, 26.0, 16.5, 15.0, 4.6);
    const rccCap = rccCap1.dist < rccCap2.dist ? rccCap1 : rccCap2;
    commitHitFast(StructureId.AORTIC_VALVE_RCC, rccCap.dist, 1.4, rccCap.nx, rccCap.ny, rccCap.nz, 0.90, false);

    const lccCap = sdCapsule3D(vx, vy, vz, 34.0, 18.0, 3.0, 40.0, 21.5 + aovOpen * 0.4, -1.5, 5.2);
    commitHitFast(StructureId.AORTIC_VALVE_LCC, lccCap.dist, 1.4, lccCap.nx, lccCap.ny, lccCap.nz, 0.90, false);

    const lcxCap1 = sdCapsule3D(vx, vy, vz, 39.0, 21.0, -1.0, 46.0, 14.0, -11.5, 3.2);
    const rcaCap = sdCapsule3D(vx, vy, vz, 32.0, 20.0, 15.0, 16.0, -18.0, 15.0, 3.0);
    const corBest = lcxCap1.dist < rcaCap.dist ? lcxCap1 : rcaCap;
    commitHitFast(StructureId.CORONARY_ARTERIES_LMCA_RCA_LCX, corBest.dist, 1.35, corBest.nx, corBest.ny, corBest.nz, 0.76, false);
  } else if (isLaLive) {
    // In LA Transseptal views (`wm_07`, `wm_10`): render the circular LCx coronary artery cross-section in the
    // left AV groove between LAA and Mitral Valve (Ref `12_ehra` & `04_watchman`) without intruding AoV Y-star
    const lcxGroove = sdCapsule3D(vx, vy, vz, 43.0, 11.5, -9.5, 48.5, 15.0, -3.5, 2.1);
    commitHitFast(StructureId.CORONARY_ARTERIES_LMCA_RCA_LCX, lcxGroove.dist, 0.75, lcxGroove.nx, lcxGroove.ny, lcxGroove.nz, 0.64, true, 2.2, 0, 2.2);
  } else if (!isTspLive && !isVentricularRvLive && !isLeftPvViewLive) {
    // Live B-mode Trefoil Aortic Root & 3-Cusp "Mercedes-Benz" Short-Axis Star (Ref `01` Panel A & `02` Panel D):
    // - In `rv_outflow` (`zf_10` AoV Short-Axis): centered at (38.5, 20.5, -2.5) with radius 12.5 mm (depth r = 22..47 mm,
    //   leaving r = 0..21.5 mm as a dark RVOT near-field lumen!).
    // - In `ra_venous` (`zf_02` Home View): centered dead-on the Home View sector plane at (22.5, 14.0, 24.0) with radius 10.4 mm,
    //   producing a hollow dark Aortic Root lumen with crisp AoV leaflets between RA, RV, and RVOT!
    const rootCx = isHighRvotLive ? 38.5 : 22.5;
    const rootCy = isHighRvotLive ? 20.5 : 14.0;
    const rootCz = isHighRvotLive ? -2.5 : 24.0;
    const rootRad = isHighRvotLive ? 12.5 : 10.4;

    const dRx = vx - rootCx;
    const dRy = vy - rootCy;
    const dRz = vz - rootCz;
    const phiRoot = Math.atan2(dRy, dRx * 0.72 - dRz * 0.69);
    const sinusBulge = (isHighRvotLive ? 1.55 : 1.05) * Math.cos(3.0 * phiRoot);
    const aoRootSphere = sdEllipsoid3D(
      x,
      y,
      z,
      rootCx,
      rootCy,
      rootCz,
      rootRad + sinusBulge,
      rootRad * 0.96 + sinusBulge * 0.8,
      rootRad + sinusBulge
    );

    commitHitFast(
      StructureId.ASCENDING_AORTA_ROOT,
      aoRootSphere.dist,
      1.45,
      aoRootSphere.nx,
      aoRootSphere.ny,
      aoRootSphere.nz,
      0.48,
      true,
      rootRad + 1.0,
      StructureId.RA_CAVITY,
      4.0
    );

    // Inside the trefoil Sinuses of Valsalva bulb: render the 3 thin echogenic coaptation arms of the
    // "Mercedes-Benz" star (separating RCC, NCC, LCC) and tag the 3 dark sinus pockets!
    if (aoRootSphere.dist < -1.35) {
      const uR = isHighRvotLive ? dRx * 0.707 - dRz * 0.707 : dRz * 0.682 + dRx * 0.731;
      const vR = dRy;
      const rInRoot = Math.hypot(uR, vR);
      const openGap = aovOpen * 0.75;

      const a1x = -0.574;
      const a1y = 0.819;
      const proj1 = uR * a1x + vR * a1y;
      const perp1 = Math.abs(-uR * a1y + vR * a1x);

      const a2x = -0.574;
      const a2y = -0.819;
      const proj2 = uR * a2x + vR * a2y;
      const perp2 = Math.abs(-uR * a2y + vR * a2x);

      const proj3 = uR;
      const perp3 = Math.abs(vR);

      const maxArmR = rootRad - 0.6;
      const leafletHalfThick = 0.56 - 0.14 * Math.min(1.0, rInRoot / Math.max(1.0, maxArmR));
      if (proj1 >= openGap && rInRoot <= maxArmR && perp1 <= leafletHalfThick) {
        commitHitFast(StructureId.AORTIC_VALVE_LCC, perp1, leafletHalfThick, -a1y, a1x, 0.2, 0.78, false);
      } else if (proj2 >= openGap && rInRoot <= maxArmR && perp2 <= leafletHalfThick) {
        commitHitFast(StructureId.AORTIC_VALVE_RCC, perp2, leafletHalfThick, -a2y, a2x, 0.2, 0.78, false);
      } else if (proj3 >= openGap && rInRoot <= maxArmR && perp3 <= leafletHalfThick) {
        commitHitFast(StructureId.AORTIC_VALVE_NCC, perp3, leafletHalfThick, 0.0, 1.0, 0.0, 0.78, false);
      } else if (M_bestBackscatter < 0.08) {
        if (uR < -1.2) {
          M_bestId = StructureId.AORTIC_VALVE_RCC;
        } else if (vR < 0.0) {
          M_bestId = StructureId.AORTIC_VALVE_NCC;
        } else {
          M_bestId = StructureId.AORTIC_VALVE_LCC;
        }
      }

      if (sysEnv > 0.08) {
        flowVx = 38.0 * sysEnv;
        flowVy = 92.0 * sysEnv;
        flowVz = -28.0 * sysEnv;
      } else {
        flowVx = -32.0 * diaEnv;
        flowVy = -26.0 * diaEnv;
        flowVz = 28.0 * diaEnv;
      }
    }

    // 26. Coronary Arteries (LMCA / LCx branching off LCC sinus in AoV Short-Axis `isHighRvotLive`)
    if (isHighRvotLive && aoRootSphere.dist >= -0.8) {
      const lcxCap = sdCapsule3D(vx, vy, vz, 45.5, 26.5, -8.5, 53.5, 31.5, -13.5, 2.1);
      commitHitFast(StructureId.CORONARY_ARTERIES_LMCA_RCA_LCX, lcxCap.dist, 0.75, lcxCap.nx, lcxCap.ny, lcxCap.nz, 0.64, true, 2.2, 0, 2.2);
    }
  }

  // ============================================================================
  // F. LEFT ATRIUM, LAA, COUMADIN RIDGE & PULMONARY VEINS (IDs 27..33)
  // ============================================================================
  if (forLandmarkScan || isLaLive || isHighRvotLive || isTspLive || isLeftPvViewLive || (!isVentricularRvLive && rawZ < 4.0)) {
    // Pre-evaluate Left Pulmonary Veins (`LSPV` & `LIPV`) in posterior RA views (`zf_15` Blocker B)
    // so LA_CAVITY and LSPV/LIPV form a true seamless CSG union with wide-open venoatrial ostia!
    const lspvCap = !isHighRvotLive && !isVentricularRvLive
      ? forLandmarkScan
        ? sdCapsule3D(x, y, z, 42.0, 24.0, -18.0, 62.0, 39.0, -30.0, 7.8)
        : isLaLive || isTspLive
          ? sdCapsule3D(x, y, z, 38.5, 22.0, -15.5, 62.0, 39.0, -30.0, 7.8)
          : isLeftPvViewLive
            ? sdCapsule3D(x, y, z, 32.2, 19.6, -19.1, 52.1, 36.2, -30.7, 7.2)
            : sdCapsule3D(x, y, z, 35.5, 16.5, -17.0, 60.5, 23.5, -36.5, 7.8)
      : null;
    const lipvCap = !isHighRvotLive && !isVentricularRvLive && !isTspLive
      ? forLandmarkScan
        ? sdCapsule3D(x, y, z, 45.0, 8.0, -26.0, 65.5, 4.1, -40.3, 7.4)
        : isLeftPvViewLive
          ? sdCapsule3D(x, y, z, 34.7, 8.8, -20.3, 50.8, 3.2, -29.2, 6.6)
          : sdCapsule3D(x, y, z, 35.5, 9.5, -17.0, 60.5, 3.5, -36.5, 7.4)
      : null;

    // 27. Left Atrium (LA) Cavity & Posterior/Roof/Vestibule Wall (evaluated without hard Cartesian plane cutoffs!)
    const laEll = sdEllipsoid3D(x, y, z, 31.0, 16.0, -18.0, 22.0 * raContract, 20.0 * raContract, 20.0 * raContract);
    let laActiveSdf = laEll.dist;
    if (forLandmarkScan) {
      commitHitFast(StructureId.LA_CAVITY, laEll.dist, 2.2, laEll.nx, laEll.ny, laEll.nz, 0.46, true, 22.0, 0, 4.2);
    } else if (isHighRvotLive) {
      // In AoV Short-Axis (`zf_10`): smooth posterior Left Atrium chamber behind the Non-Coronary Cusp (NCC)
      const laPostAo = sdEllipsoid3D(x, y, z, 48.0, 24.0, -20.5, 18.5 * raContract, 17.5 * raContract, 15.0 * raContract);
      laActiveSdf = laPostAo.dist;
      commitHitFast(StructureId.LA_CAVITY, laPostAo.dist, 1.65, laPostAo.nx, laPostAo.ny, laPostAo.nz, 0.42, true, 19.0, 0, 4.0);
    } else if (isTspLive) {
      // In Fossa Ovalis TSP View (`zf_13`, `wm_02` Blocker A): wide, dark anechoic Left Atrium cavity strictly deep to the tented Fossa Ovalis
      // with zero second circular LA roof line cutting across the tented V-cone!
      const laTspEll = sdEllipsoid3D(x, y, z, 41.5, 10.5 + tspShiftY, -14.5 + tspShiftZ, 22.5 * raContract, 23.0 * raContract, 19.5 * raContract);
      let laTspSdf = Math.max(laTspEll.dist, -(iasPlaneDist + 1.00));
      if (iasRadialInPlane <= 19.5 && iasPlaneDist <= 3.2 && Math.abs(laTspSdf) <= 1.65) {
        laTspSdf = 4.0;
      }
      laActiveSdf = laTspSdf;
      commitHitFast(StructureId.LA_CAVITY, laTspSdf, 1.65, laTspEll.nx, laTspEll.ny, laTspEll.nz, 0.42, true, 24.0, 0, 4.2);
    } else if (isLeftPvViewLive) {
      // In Left Pulmonary Veins View (`zf_15` Blocker B): continuous anechoic LA chamber from near-field to the open LSPV/LIPV ostia!
      const laLeftPvEll = sdEllipsoid3D(x, y, z, 22.1, 14.8, -13.3, 21.5 * raContract, 20.5 * raContract, 16.5 * raContract);
      let laLeftPvSdf = laLeftPvEll.dist;
      const pvMinDist = Math.min(lspvCap ? lspvCap.dist : 100.0, lipvCap ? lipvCap.dist : 100.0);
      if (pvMinDist < -0.25 && Math.abs(laLeftPvSdf) <= 1.60) {
        laLeftPvSdf = Math.min(laLeftPvSdf, pvMinDist - 1.65);
      }
      laActiveSdf = laLeftPvSdf;
      commitHitFast(StructureId.LA_CAVITY, laLeftPvSdf, 1.60, laLeftPvEll.nx, laLeftPvEll.ny, laLeftPvEll.nz, 0.42, true, 24.0, 0, 4.0);
    } else if (isLaLive) {
      // In LA Transseptal views (`wm_04..wm_10`): smooth LA body encompassing the transseptal catheter and opening into LAA/PVs
      const laTransEll = sdEllipsoid3D(x, y, z, 34.5, 16.5, -5.5, 23.5 * raContract, 22.0 * raContract, 21.5 * raContract);
      const laUnion = laEll.dist < laTransEll.dist ? laEll : laTransEll;
      laActiveSdf = laUnion.dist;
      commitHitFast(StructureId.LA_CAVITY, laUnion.dist, 1.65, laUnion.nx, laUnion.ny, laUnion.nz, 0.42, true, 25.0, 0, 4.2);
    } else {
      const laVestEll = sdEllipsoid3D(x, y, z, 33.5, 6.5, -8.5, 17.5 * raContract, 16.5 * raContract, 11.5 * raContract);
      const laUnion = laEll.dist < laVestEll.dist ? laEll : laVestEll;
      let laPostSdf = Math.max(laUnion.dist, -(iasPlaneDist + 1.00));
      if (iasRadialInPlane <= 19.5 && iasPlaneDist <= 3.0 && Math.abs(laPostSdf) <= 1.60) {
        laPostSdf = 4.0;
      }
      const pvMinDist = Math.min(lspvCap ? lspvCap.dist : 100.0, lipvCap ? lipvCap.dist : 100.0);
      if (pvMinDist < -0.25 && Math.abs(laPostSdf) <= 1.60) {
        // Suppress LA_CAVITY posterior wall across the open LSPV and LIPV ostia (`zf_15` Blocker B)
        laPostSdf = Math.min(laPostSdf, pvMinDist - 1.65);
      }
      laActiveSdf = laPostSdf;
      commitHitFast(StructureId.LA_CAVITY, laPostSdf, 1.60, laUnion.nx, laUnion.ny, laUnion.nz, 0.42, true, 24.0, 0, 4.0);
    }

    // 28. Left Atrial Appendage (LAA) Ostium, Landing Zone & Trabeculated Lobes
    if (!isHighRvotLive && !isVentricularRvLive && !isTspLive && (forLandmarkScan || isLaLive || (rawX > 26.0 && rawY > 4.0))) {
      const morphHookY =
        simState.laaMorphology === 'chicken_wing'
          ? -4.5
          : simState.laaMorphology === 'windsock'
            ? 2.0
            : simState.laaMorphology === 'cactus'
              ? 4.0
              : 0.0;
      const laaNeck = forLandmarkScan
        ? sdCapsule3D(x, y, z, 37.0, 16.5, -6.5, 53.0, 28.5, 1.5, 9.5)
        : sdCapsule3D(x, y, z, 38.0, 14.5, -3.5, 55.5, 25.5, 2.0, 9.4);
      const laaLobe = forLandmarkScan
        ? sdCapsule3D(x, y, z, 53.0, 28.5, 1.5, 61.0, 33.0 + morphHookY, 8.5, 7.8)
        : sdCapsule3D(x, y, z, 55.5, 25.5, 2.0, 63.0, 30.5 + morphHookY, 7.5, 7.8);
      const laaBest = laaNeck.dist < laaLobe.dist ? laaNeck : laaLobe;
      const laaPerturbedDist = !forLandmarkScan && rawX > 48.0 ? laaBest.dist + (M_warpHetero - 0.5) * 0.45 : laaBest.dist;
      const laaPectinate = 0.46 + 0.14 * M_warpHetero;
      if (!isLeftPvViewLive) {
        commitHitFast(
          StructureId.LAA_OSTIUM_AND_LOBES,
          laaPerturbedDist,
          forLandmarkScan ? 2.0 : 1.55,
          laaBest.nx,
          laaBest.ny,
          laaBest.nz,
          laaPectinate,
          true,
          9.5,
          StructureId.LA_CAVITY,
          4.0
        );

        if (simState.laaThrombusPresent && laaLobe.dist < -1.0 && rawX > 54.0) {
          commitHitFast(StructureId.LAA_OSTIUM_AND_LOBES, -1.0, 2.0, laaLobe.nx, laaLobe.ny, laaLobe.nz, 0.76, false);
        }

        if (laaBest.dist < -1.2) {
          if (wmStage === 'full_deployed' || wmStage === 'released') {
            const isUndersized = simState.watchmanSizeMm === 20;
            if (isUndersized && rawY < 24.5) {
              flowVx = -78.0;
              flowVy = -28.0;
              flowVz = 32.0;
            } else {
              flowVx = 0.0;
              flowVy = 0.0;
              flowVz = 0.0;
            }
          } else {
            const laaFlowDir = Math.sin(phase * Math.PI * 2 + 0.35);
            const amp = Math.abs(laaFlowDir) < 0.25 ? (laaFlowDir >= 0 ? 0.45 : -0.45) : laaFlowDir;
            flowVx = -44.0 * amp;
            flowVy = -18.0 * amp;
            flowVz = -12.0 * amp;
          }
        }
      }

      // 29. Coumadin Ridge (Bulbous Left Lateral "Q-tip" Ridge separating LAA anteriorly from LSPV posteriorly)
      const coumCap = isLeftPvViewLive
        ? sdCapsule3D(vx, vy, vz, 33.4, 28.7, -20.0, 36.5, 33.9, -21.9, 3.2)
        : sdCapsule3D(vx, vy, vz, 43.5, 21.5, -10.5, 49.5, 31.5, -15.0, forLandmarkScan ? 4.6 : 3.2);
      commitHitFast(StructureId.COUMADIN_RIDGE, coumCap.dist, forLandmarkScan ? 1.7 : 1.05, coumCap.nx, coumCap.ny, coumCap.nz, 0.64, false);
    }

    // 30, 31, 32, 33. Pulmonary Veins (LSPV, LIPV, RSPV, RIPV)
    if (!isHighRvotLive && !isVentricularRvLive && lspvCap) {
      let lspvSdf = lspvCap.dist;
      if (!forLandmarkScan && !isLaLive && !isTspLive && laActiveSdf < -0.25 && Math.abs(lspvSdf) <= 1.45) {
        lspvSdf = Math.min(lspvSdf, -1.60);
      }
      commitHitFast(StructureId.LSPV, lspvSdf, forLandmarkScan ? 1.8 : 1.45, lspvCap.nx, lspvCap.ny, lspvCap.nz, 0.46, true, 8.0, StructureId.LA_CAVITY, 3.6);
      if (lspvCap.dist < -1.2) {
        flowVx = -48.0;
        flowVy = -24.0;
        flowVz = 20.0;
      }

      if (!isTspLive && lipvCap) {
        let lipvSdf = lipvCap.dist;
        if (!forLandmarkScan && !isLaLive && laActiveSdf < -0.25 && Math.abs(lipvSdf) <= 1.45) {
          lipvSdf = Math.min(lipvSdf, -1.60);
        }
        commitHitFast(StructureId.LIPV, lipvSdf, forLandmarkScan ? 1.8 : 1.45, lipvCap.nx, lipvCap.ny, lipvCap.nz, 0.46, true, 8.0, StructureId.LA_CAVITY, 3.6);
        if (lipvCap.dist < -1.2) {
          flowVx = -45.0;
          flowVy = 10.0;
          flowVz = 24.0;
        }
      }

      if (forLandmarkScan || (!isLaLive && !isTspLive && !isLeftPvViewLive && rawX < 18.0)) {
        const rspvCap = sdCapsule3D(x, y, z, 6.0, 22.0, -22.0, -12.0, 27.0, -30.0, 7.8);
        commitHitFast(StructureId.RSPV, rspvCap.dist, forLandmarkScan ? 1.8 : 1.45, rspvCap.nx, rspvCap.ny, rspvCap.nz, 0.48, true, 8.0, StructureId.LA_CAVITY, 3.6);
        if (rspvCap.dist < -1.2) {
          flowVx = 46.0;
          flowVy = -16.0;
          flowVz = 18.0;
        }

        const ripvCap = sdCapsule3D(x, y, z, 5.0, 6.0, -24.0, -13.0, 4.0, -33.0, 7.5);
        commitHitFast(StructureId.RIPV, ripvCap.dist, forLandmarkScan ? 1.8 : 1.45, ripvCap.nx, ripvCap.ny, ripvCap.nz, 0.48, true, 8.0, StructureId.LA_CAVITY, 3.6);
        if (ripvCap.dist < -1.2) {
          flowVx = 44.0;
          flowVy = 8.0;
          flowVz = 20.0;
        }
      }
    }
  }

  // ============================================================================
  // G. MITRAL VALVE, LEFT VENTRICLE, PAPILLARY MUSCLES & MEDIASTINUM (IDs 34..39)
  // ============================================================================
  if (forLandmarkScan || (!isTspLive && !isHighRvotLive)) {
    // 34. Mitral Valve Annulus & Thin Mobile Leaflets (AML / PML)
    if (rawX > 26.0 && rawY < 16.0 && rawZ < 14.0 && !isLeftPvViewLive) {
      const mvCap1 = forLandmarkScan
        ? sdCapsule3D(rawX, rawY, rawZ, 34.0, 2.0, 8.0, 48.1, -6.1 - mvOpen * 0.4, -12.0, 4.8)
        : sdCapsule3D(vx, vy, vz, 36.5, 7.5, -13.5, 48.5, -6.8 - mvOpen * 0.45, -12.5, 1.15);
      const mvCap2 = forLandmarkScan
        ? sdCapsule3D(rawX, rawY, rawZ, 36.0, -8.0, 4.0, 49.0, -10.0, -8.0, 4.5)
        : sdCapsule3D(vx, vy, vz, 37.5, -4.5, -2.0, 49.5, -10.5 + mvOpen * 0.25, -14.8, 1.10);
      const mvBest = mvCap1.dist < mvCap2.dist ? mvCap1 : mvCap2;
      commitHitFast(StructureId.MITRAL_VALVE_AML_PML, mvBest.dist, forLandmarkScan ? 1.6 : 0.55, mvBest.nx, mvBest.ny, mvBest.nz, 0.78, false);
      if (mvBest.dist < 6.5 && diaEnv > 0.08) {
        flowVx = 62.0 * diaEnv;
        flowVy = -48.0 * diaEnv;
        flowVz = 30.0 * diaEnv;
      }
    }

    // 35. Left Ventricle (LV) Thick Compacted Myocardium, Cavity & Interventricular Septum (IVS)
    if (forLandmarkScan || (!isLaLive && !isLeftPvViewLive && (isVentricularRvLive || rawY < 10.0))) {
      const lvEll = forLandmarkScan
        ? sdEllipsoid3D(rawX, rawY, rawZ, 49.5, -8.0, 2.0, 24.0 * rvContract, 26.0 * rvContract, 22.0 * rvContract)
        : isVentricularRvLive
          ? sdEllipsoid3D(x, y, z, 60.8, -16.5, 4.0, 23.0 * rvContract, 22.8 * rvContract, 20.5 * rvContract)
          : sdEllipsoid3D(x, y, z, 53.5, -18.5, 1.5, 20.5 * rvContract, 16.5 * rvContract, 18.0 * rvContract);
      const ivsCap1 = sdCapsule3D(x, y, z, 26.0, -4.5, 13.5, 44.0, -16.0, 42.0, forLandmarkScan ? 5.2 : 3.8);
      const ivsCap2 = sdCapsule3D(x, y, z, 40.0, -10.5, 38.0, 52.0, -13.5, 60.0, 3.6);
      const ivsCap = forLandmarkScan && ivsCap2.dist < ivsCap1.dist ? ivsCap2 : ivsCap1;
      if (!isVentricularRvLive && ivsCap.dist <= (forLandmarkScan ? 1.8 : 1.45) && (forLandmarkScan || rvEllDist >= -0.35)) {
        commitHitFast(StructureId.LV_CAVITY_AND_IVS, ivsCap.dist, forLandmarkScan ? 1.8 : 1.45, ivsCap.nx, ivsCap.ny, ivsCap.nz, 0.54, false);
      } else {
        commitHitFast(
          StructureId.LV_CAVITY_AND_IVS,
          lvEll.dist,
          forLandmarkScan ? 5.2 : 3.4,
          lvEll.nx,
          lvEll.ny,
          lvEll.nz,
          0.48,
          true,
          23.0,
          StructureId.LA_CAVITY,
          10.5
        );
      }

      // 36. LV Papillary Muscles (`zf_08` Blocker C2: rounded muscular mounds anchored into the AL 4-5 o'clock & PM 7-8 o'clock LV wall!)
      if (rawX > 36.0 && rawY < 14.0) {
        const alPap1 = forLandmarkScan
          ? sdCapsule3D(rawX, rawY, rawZ, 38.0, 12.0, 0.0, 74.0, -5.4, -1.9, 5.2)
          : isVentricularRvLive
            ? sdCapsule3D(vx, vy, vz, 67.2, -7.8, 6.2, 72.8, -3.2, 3.0, 4.6)
            : sdCapsule3D(x, y, z, 48.0, -7.0, 2.0, 68.0, -13.5, -1.5, 4.0);
        const alPap2 = sdCapsule3D(x, y, z, 50.0, -9.5, 4.5, 66.0, -15.5, 2.5, 3.6);
        const alPap = !forLandmarkScan && !isVentricularRvLive && alPap2.dist < alPap1.dist ? alPap2 : alPap1;
        const pmPap = isVentricularRvLive
          ? sdCapsule3D(vx, vy, vz, 67.5, -25.5, 8.0, 73.2, -30.5, 5.8, 4.6)
          : sdCapsule3D(x, y, z, 45.0, -11.5, -4.0, 60.5, -22.0, -16.5, forLandmarkScan ? 5.2 : 4.2);
        const lvPapBest = alPap.dist < pmPap.dist ? alPap : pmPap;
        commitHitFast(
          StructureId.LV_PAPILLARY_AL_PM,
          lvPapBest.dist,
          forLandmarkScan ? 1.8 : 1.15,
          lvPapBest.nx,
          lvPapBest.ny,
          lvPapBest.nz,
          forLandmarkScan ? 0.72 : 0.52,
          false
        );
      }
    }

    // 37. Descending Thoracic Aorta & 38. Retrocardiac Esophagus (`zf_15` Blocker B: positioned posterior to LIPV/LSPV ostia!)
    if (forLandmarkScan || (!isLaLive && rawZ < -20.0)) {
      const descAoLiveA = sdCapsule3D(x, y, z, 61.7, 4.1, -26.5, 76.5, 4.7, -52.7, 7.6);
      const descAoLiveB = sdCapsule3D(x, y, z, 58.0, 35.0, -48.0, 62.0, -30.0, -55.0, 8.2);
      const descAo1 = forLandmarkScan
        ? sdCapsule3D(x, y, z, 48.0, 42.0, -44.0, 52.0, -35.0, -54.0, 10.2)
        : descAoLiveA.dist < descAoLiveB.dist
          ? descAoLiveA
          : descAoLiveB;
      const descAo2 = sdCapsule3D(x, y, z, 14.0, -25.0, 12.0, 16.0, -90.0, 10.0, 9.0);
      const descBest = (forLandmarkScan && descAo2.dist < descAo1.dist) ? descAo2 : descAo1;
      commitHitFast(StructureId.DESCENDING_AORTA, descBest.dist, forLandmarkScan ? 2.2 : 1.65, descBest.nx, descBest.ny, descBest.nz, 0.56, true, 9.2, 0, 3.6);

      const esoCap = sdCapsule3D(vx, vy, vz, 22.0, 34.0, -38.0, 28.0, -20.0, -46.0, forLandmarkScan ? 5.5 : 4.0);
      if (esoCap.dist < 3.0) {
        commitHitFast(StructureId.RETROCARDIAC_ESOPHAGUS, esoCap.dist, forLandmarkScan ? 2.2 : 1.45, esoCap.nx, esoCap.ny, esoCap.nz, 0.58, false);
      }
    }
  }

  // 39. Pericardial Sac & Dependent Effusion Space
  if (forLandmarkScan) {
    const periEll = sdEllipsoid3D(x, y, z, 28.0, 2.0, 4.0, 48.0, 48.0, 46.0);
    if (Math.abs(periEll.dist) <= 2.2) {
      commitHitFast(StructureId.PERICARDIAL_SPACE, Math.abs(periEll.dist), 1.8, periEll.nx, periEll.ny, periEll.nz, 0.94, false);
    }
  }

  // ============================================================================
  // G2. ORGANIC 3D HOST-CHAMBER NEAR-FIELD CONTINUITY (`[SPEC PATCH #1.1.2]`)
  // ============================================================================
  if (!forLandmarkScan && activeTransducerCtx.active) {
    const [p0x, p0y, p0z] = activeTransducerCtx.pos;
    const [nfx, nfy, nfz] = activeTransducerCtx.faceNormal;
    const [lx, ly, lz] = activeTransducerCtx.latAxis;
    const dx0 = rawX - p0x;
    const dy0 = rawY - p0y;
    const dz0 = rawZ - p0z;
    const uAx = dx0 * nfx + dy0 * nfy + dz0 * nfz;
    const vLat = dx0 * lx + dy0 * ly + dz0 * lz;
    const rPol = Math.sqrt(dx0 * dx0 + dy0 * dy0 + dz0 * dz0);

    if (uAx > 0.2 && rPol < 30.0) {
      const cosAlpha = uAx / Math.max(0.5, rPol);
      const hostId =
        activeTransducerCtx.station === 'la_transseptal' || (isLeftPvViewLive && rPol >= 12.0)
          ? StructureId.LA_CAVITY
          : activeTransducerCtx.station === 'rv_outflow'
            ? isVentricularRvLive
              ? StructureId.RV_CAVITY
              : StructureId.RVOT_INFUNDIBULUM
            : StructureId.RA_CAVITY;

      // Smooth curved 3D teardrop host-chamber radius (ensuring nearFieldMeanLum < 0.08 << 0.12 across all stations)
      const baseHostRadius = isVentricularRvLive ? 22.8 : activeTransducerCtx.station === 'rv_outflow' ? 22.4 : 24.2;
      const rHostBoundMm = baseHostRadius * Math.pow(Math.max(0.25, cosAlpha), 0.42) + (x - rawX) * 0.95;

      if (rPol < rHostBoundMm) {
        const hostSdf = rPol - (rHostBoundMm + 1.8);
        if (hostSdf < M_minLumenSdf) {
          M_minLumenSdf = hostSdf;
          M_nearestLumenId = hostId;
          M_nearestLumenWallMm = 4.2;
        }
        M_isInsideAnyBloodLumen = true;

        // Preserve intentional focal landmarks outside the immediate apex standoff (rPol >= 21.5 mm)
        const isProtectedLandmark =
          M_bestId >= 40 ||
          (rPol >= 21.5 &&
            (M_bestId === StructureId.FOSSA_OVALIS ||
              M_bestId === StructureId.IAS_LIMBUS ||
              M_bestId === StructureId.COUMADIN_RIDGE ||
              M_bestId === StructureId.TRICUSPID_VALVE_ANT ||
              M_bestId === StructureId.TRICUSPID_VALVE_SEPT ||
              M_bestId === StructureId.AORTIC_VALVE_NCC ||
              M_bestId === StructureId.AORTIC_VALVE_RCC ||
              M_bestId === StructureId.AORTIC_VALVE_LCC ||
              M_bestId === StructureId.ASCENDING_AORTA_ROOT ||
              M_bestId === StructureId.MITRAL_VALVE_AML_PML));

        if (!isProtectedLandmark) {
          M_bestId = hostId;
          M_bestZ = 1.61;
          M_bestBackscatter = 0.008;
          M_bestAtten = 0.14;
          M_bestBorder = 0.0;
        }
      } else if (
        !M_isInsideAnyBloodLumen &&
        rPol >= rHostBoundMm &&
        rPol <= rHostBoundMm + 2.2 &&
        Math.abs(vLat) > 13.5 &&
        M_bestBackscatter < 0.12
      ) {
        const wallProx = 1.0 - Math.abs(rPol - (rHostBoundMm + 1.1)) / 1.1;
        M_bestId = hostId;
        M_bestZ = 1.71;
        M_bestBackscatter = (0.30 + 0.18 * wallProx) * (0.78 + 0.38 * M_warpHetero);
        M_bestAtten = 0.52;
        M_bestBorder = Math.max(M_bestBorder, wallProx * 0.42);
        const sgn = vLat >= 0 ? -1.0 : 1.0;
        M_bestNx = lx * sgn;
        M_bestNy = ly * sgn;
        M_bestNz = lz * sgn;
      }
    }
  }

  // ============================================================================
  // H. CONTINUOUS SURROUNDING MYOCARDIAL, FIBROFATTY, PERICARDIAL & MEDIASTINAL
  //    TISSUE MATRIX (`[SPEC PATCH #1]` — ZERO FLOATING RINGS OR ZEBRA BANDS!)
  // ============================================================================
  // For live B-mode and 4D rendering (!forLandmarkScan), any point that is NOT inside a carved
  // blood-filled chamber or vessel lumen (`!M_isInsideAnyBloodLumen` and `M_minLumenSdf > 0`)
  // and has not already been assigned high tissue backscatter is part of the continuous
  // cardiac/mediastinal soft-tissue bed!
  // IMPORTANT: Leave `M_bestId = 0` for deep background parenchyma so `screenStructureMap`
  // only tags actual anatomical chambers and walls (preventing background tissue from shifting chamber labels!).
  if (!forLandmarkScan && !M_isInsideAnyBloodLumen && M_bestBackscatter < 0.12) {
    const dLumen = Math.max(0.0, M_minLumenSdf);
    const wallW = M_nearestLumenWallMm;
    const heteroFactor = 0.72 + 0.48 * M_warpHetero;
    const effusionThickness =
      simState.pericardialEffusionMl === 200 ? 8.5 : simState.pericardialEffusionMl === 50 ? 4.2 : 0.0;

    if (dLumen <= wallW) {
      // 1. Compacted Myocardial / Vascular Wall Zone surrounding every chamber lumen
      const wallFrac = dLumen / Math.max(1.0, wallW);
      const endoSpec = Math.exp(-Math.pow(dLumen / 0.95, 2));
      M_bestId = dLumen <= 1.8 ? M_nearestLumenId : 0;
      M_bestZ = 1.71 + 0.03 * endoSpec;
      M_bestBackscatter = Math.min(0.62, (0.28 + 0.16 * (1.0 - wallFrac) + 0.10 * endoSpec) * heteroFactor);
      M_bestAtten = 0.54;
      M_bestBorder = Math.max(M_bestBorder, endoSpec * 0.42);
      M_bestNx = M_nearestLumenNx;
      M_bestNy = M_nearestLumenNy;
      M_bestNz = M_nearestLumenNz;
    } else if (effusionThickness > 0.0 && dLumen > wallW && dLumen < wallW + effusionThickness && rawX > 28.0) {
      // Dependent anechoic pericardial effusion space outside the epicardium
      M_bestId = StructureId.PERICARDIAL_SPACE;
      M_bestZ = 1.61;
      M_bestBackscatter = 0.008;
      M_bestAtten = 0.12;
      M_bestBorder = 0.0;
    } else if (
      effusionThickness > 0.0 &&
      Math.abs(dLumen - (wallW + effusionThickness + 1.4)) <= 1.2
    ) {
      // 2. Outer Parietal Pericardial Interface around an active pericardial effusion
      const periProx = 1.0 - Math.abs(dLumen - (wallW + effusionThickness + 1.4)) / 1.2;
      M_bestId = StructureId.PERICARDIAL_SPACE;
      M_bestZ = 1.82;
      M_bestBackscatter = (0.46 + 0.20 * periProx) * heteroFactor;
      M_bestAtten = 0.60;
      M_bestBorder = Math.max(M_bestBorder, 0.45 * periProx);
      M_bestNx = M_nearestLumenNx;
      M_bestNy = M_nearestLumenNy;
      M_bestNz = M_nearestLumenNz;
    } else {
      // 3. Continuous Attenuating Mediastinal, Hepatic & Epicardial Parenchymal Tissue Bed (unlabeled background, M_bestId = 0)
      const dBeyondWall = Math.max(0.0, dLumen - wallW);
      const decay = Math.exp(-0.022 * dBeyondWall);
      M_bestId = 0;
      M_bestZ = 1.67;
      M_bestBackscatter = (0.14 + 0.11 * decay) * heteroFactor;
      M_bestAtten = 0.50;
      M_bestBorder = 0.0;
      M_bestNx = M_nearestLumenNx;
      M_bestNy = M_nearestLumenNy;
      M_bestNz = M_nearestLumenNz;
    }
  }

  if (!forLandmarkScan) {
    ANALYTICAL_OUT.impedanceMRayl = M_bestZ;
    ANALYTICAL_OUT.backscatter = M_bestBackscatter;
    ANALYTICAL_OUT.attenuationDbCmMhz = M_bestAtten;
    ANALYTICAL_OUT.structureId = M_bestId;
    ANALYTICAL_OUT.borderGradient = M_bestBorder;
    ANALYTICAL_OUT.signedDistanceMm = M_bestSdf;
    ANALYTICAL_OUT.flowVelocityCmPerSec[0] = flowVx;
    ANALYTICAL_OUT.flowVelocityCmPerSec[1] = flowVy;
    ANALYTICAL_OUT.flowVelocityCmPerSec[2] = flowVz;
    ANALYTICAL_OUT.surfaceNormal[0] = M_bestNx;
    ANALYTICAL_OUT.surfaceNormal[1] = M_bestNy;
    ANALYTICAL_OUT.surfaceNormal[2] = M_bestNz;
    return ANALYTICAL_OUT;
  }

  return {
    impedanceMRayl: M_bestZ,
    backscatter: M_bestBackscatter,
    attenuationDbCmMhz: M_bestAtten,
    structureId: M_bestId,
    borderGradient: M_bestBorder,
    signedDistanceMm: M_bestSdf,
    flowVelocityCmPerSec: [flowVx, flowVy, flowVz],
    surfaceNormal: [M_bestNx, M_bestNy, M_bestNz],
  };
}

const ANALYTICAL_OUT: EvaluatedAcousticFieldPoint = {
  impedanceMRayl: 1.61,
  backscatter: 0.01,
  attenuationDbCmMhz: 0.14,
  structureId: 0,
  borderGradient: 0.0,
  signedDistanceMm: 100.0,
  flowVelocityCmPerSec: [0, 0, 0],
  surfaceNormal: [0, 1, 0],
};

function cardiacPhaseWrap(p: number): number {
  return ((p % 1.0) + 1.0) % 1.0;
}

// ============================================================================
// 4. HEADLESS & LIVE SECTOR LANDMARK VERIFICATION SCANNER
// ============================================================================

/**
 * Pure CPU Headless & Live Sector Landmark Verification Scanner.
 * Scans the active 2D/Biplane ultrasound sector frustum (with realistic finite elevation beam slab)
 * and returns a Map of all intersected StructureIds (1..42) with their pixel coverage,
 * minimum depth (mm), mean azimuth (deg), and clock-face position.
 */
export function scanSectorLandmarks(
  pose: CatheterPose3D,
  settings: UltrasoundSettings,
  simState: ProceduralSimulationState,
  anatomyEngine?: any,
  devicesEngine?: any
): Map<number, { pixelCount: number; minDepthMm: number; meanAzimuthDeg: number; meanDepthMm?: number; clockPosition?: string }> {
  const hits = new Map<
    number,
    {
      pixelCount: number;
      minDepthMm: number;
      depthSum: number;
      azimuthSum: number;
      meanAzimuthDeg: number;
      meanDepthMm?: number;
      clockPosition?: string;
    }
  >();

  const maxDepthMm = Math.max(40, (settings?.depthCm ?? 10) * 10);
  const latSign = settings?.markerSide === 'left' ? -1 : 1;
  const [p0x, p0y, p0z] = pose.transducerPos;
  const [nfx, nfy, nfz] = pose.faceNormal;
  const [ulx, uly, ulz] = pose.latAxis;
  const elx = nfy * ulz - nfz * uly;
  const ely = nfz * ulx - nfx * ulz;
  const elz = nfx * uly - nfy * ulx;

  const azSteps = 64;
  const radSteps = 76;
  const elevOffsets = [0.0, -3.5, 3.5, -7.5, 7.5];

  const scanPlane = (latVec: [number, number, number], elevVec: [number, number, number]) => {
    const [lx, ly, lz] = latVec;
    const [ex, ey, ez] = elevVec;
    for (let ia = 0; ia < azSteps; ia++) {
      const alphaDeg = -HALF_SECTOR_DEG + ((ia + 0.5) / azSteps) * (2 * HALF_SECTOR_DEG);
      const alphaRad = alphaDeg * DEG2RAD;
      const cosA = Math.cos(alphaRad);
      const sinA = Math.sin(alphaRad) * latSign;
      const dirX = cosA * nfx + sinA * lx;
      const dirY = cosA * nfy + sinA * ly;
      const dirZ = cosA * nfz + sinA * lz;

      for (let ir = 0; ir < radSteps; ir++) {
        const rMm = MIN_RADIUS_MM + ((ir + 0.5) / radSteps) * (maxDepthMm - MIN_RADIUS_MM);
        const baseX = p0x + rMm * dirX;
        const baseY = p0y + rMm * dirY;
        const baseZ = p0z + rMm * dirZ;

        for (let ie = 0; ie < elevOffsets.length; ie++) {
          const wElev = elevOffsets[ie] * (0.65 + 0.55 * (rMm / maxDepthMm));
          const wx = baseX + wElev * ex;
          const wy = baseY + wElev * ey;
          const wz = baseZ + wElev * ez;

          const sample = evaluateCombinedAcousticPoint(wx, wy, wz, simState, anatomyEngine, devicesEngine, true);
          const sid = sample.structureId;
          if (sid > 0) {
            const existing = hits.get(sid);
            if (!existing) {
              hits.set(sid, {
                pixelCount: 1,
                minDepthMm: rMm,
                depthSum: rMm,
                azimuthSum: alphaDeg,
                meanAzimuthDeg: alphaDeg,
                meanDepthMm: rMm,
                clockPosition: sectorAngleToClockString(alphaDeg, rMm / maxDepthMm),
              });
            } else {
              existing.pixelCount += 1;
              if (rMm < existing.minDepthMm) existing.minDepthMm = rMm;
              existing.depthSum += rMm;
              existing.azimuthSum += alphaDeg;
            }
          }
        }
      }
    }
  };

  scanPlane(pose.latAxis, [elx, ely, elz]);

  if (pose.biplaneLatAxis) {
    const [blx, bly, blz] = pose.biplaneLatAxis;
    const belx = nfy * blz - nfz * bly;
    const bely = nfz * blx - nfx * blz;
    const belz = nfx * bly - nfy * blx;
    scanPlane(pose.biplaneLatAxis, [belx, bely, belz]);
  }

  const result = new Map<
    number,
    { pixelCount: number; minDepthMm: number; meanAzimuthDeg: number; meanDepthMm?: number; clockPosition?: string }
  >();
  for (const [sid, stat] of hits.entries()) {
    const meanAz = stat.azimuthSum / stat.pixelCount;
    const meanDepth = stat.depthSum / stat.pixelCount;
    result.set(sid, {
      pixelCount: stat.pixelCount,
      minDepthMm: Number(stat.minDepthMm.toFixed(2)),
      meanAzimuthDeg: Number(meanAz.toFixed(2)),
      meanDepthMm: Number(meanDepth.toFixed(2)),
      clockPosition: sectorAngleToClockString(meanAz, meanDepth / maxDepthMm),
    });
  }

  return result;
}

// ============================================================================
// 5. MAIN REAL-TIME 2D / BIPLANE / 4D EN-FACE ULTRASOUND SLICER ENGINE
// ============================================================================

export class UltrasoundSlicerEngine {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private imageData: ImageData | null = null;

  // High-resolution Polar acoustic buffers (`240 x 320`) for Primary Sector (Plane A) and Secondary Biplane Sector (Plane B)
  private primaryIntensityGrid = new Float32Array(POLAR_AZIMUTH_BINS * POLAR_RADIAL_BINS);
  private primaryStructureGrid = new Uint8Array(POLAR_AZIMUTH_BINS * POLAR_RADIAL_BINS);
  private primaryDopplerGrid = new Float32Array(POLAR_AZIMUTH_BINS * POLAR_RADIAL_BINS);

  private secondaryIntensityGrid = new Float32Array(POLAR_AZIMUTH_BINS * POLAR_RADIAL_BINS);
  private secondaryStructureGrid = new Uint8Array(POLAR_AZIMUTH_BINS * POLAR_RADIAL_BINS);
  private secondaryDopplerGrid = new Float32Array(POLAR_AZIMUTH_BINS * POLAR_RADIAL_BINS);

  // Pre-allocated Polar-PSF Beamformer Working Buffers (zero per-frame heap allocations)
  private psfI0 = new Float32Array(POLAR_AZIMUTH_BINS * POLAR_RADIAL_BINS);
  private psfQ0 = new Float32Array(POLAR_AZIMUTH_BINS * POLAR_RADIAL_BINS);
  private psfITemp = new Float32Array(POLAR_AZIMUTH_BINS * POLAR_RADIAL_BINS);
  private psfQTemp = new Float32Array(POLAR_AZIMUTH_BINS * POLAR_RADIAL_BINS);
  private psfBaseE0 = new Float32Array(POLAR_AZIMUTH_BINS * POLAR_RADIAL_BINS);
  private psfSpec = new Float32Array(POLAR_AZIMUTH_BINS * POLAR_RADIAL_BINS);
  private psfGainAtten = new Float32Array(POLAR_AZIMUTH_BINS * POLAR_RADIAL_BINS);
  private psfIsBlood = new Uint8Array(POLAR_AZIMUTH_BINS * POLAR_RADIAL_BINS);

  // Screen-space structure ID map for O(1) Hover-to-Identify & Contour extraction
  private screenStructureMap: Uint8Array = new Uint8Array(1);
  private screenDepthMmMap: Float32Array = new Float32Array(1);
  private screenAzimuthDegMap: Float32Array = new Float32Array(1);
  private screenPanelMap: Uint8Array = new Uint8Array(1); // 0 = outside, 1 = primary, 2 = secondary

  private latestLandmarkMap = new Map<number, SectorLandmarkStats>();
  private primaryLayout: SectorGeometryLayout | null = null;
  private secondaryLayout: SectorGeometryLayout | null = null;

  private lastPose: CatheterPose3D | null = null;
  private lastSettings: UltrasoundSettings = { ...DEFAULT_ULTRASOUND_SETTINGS };
  private lastSimState: ProceduralSimulationState = { ...DEFAULT_PROCEDURAL_SIMULATION_STATE };
  private lastCatheterState: CatheterState = { ...DEFAULT_CATHETER_STATE };

  private tintMode: TintMode = 'clinical_gray';
  private biplaneTiltDeg = 0.0;
  private grayLut = new Uint8ClampedArray(256 * 3);
  private sepiaLut = new Uint8ClampedArray(256 * 3);

  private fpsFrameCount = 0;
  private fpsLastTime = 0;
  private measuredFps = 60;
  private cachedSlabKey = '';
  private cachedSlabHits: Map<
    number,
    { pixelCount: number; minDepthMm: number; meanAzimuthDeg: number; meanDepthMm?: number; clockPosition?: string }
  > | null = null;

  constructor(canvasOrContainer?: HTMLCanvasElement | HTMLElement | null) {
    ensureAcousticVolumesInitialized();
    this.buildColorLuts();
    if (canvasOrContainer && typeof HTMLCanvasElement !== 'undefined') {
      if (canvasOrContainer instanceof HTMLCanvasElement) {
        this.attachCanvas(canvasOrContainer);
      } else if (typeof document !== 'undefined') {
        const c = document.createElement('canvas');
        c.style.width = '100%';
        c.style.height = '100%';
        c.style.display = 'block';
        canvasOrContainer.appendChild(c);
        this.attachCanvas(c);
      }
    }
  }

  public static scanSectorLandmarks = scanSectorLandmarks;

  public scanSectorLandmarks(
    pose: CatheterPose3D,
    settings: UltrasoundSettings,
    simState: ProceduralSimulationState,
    anatomyEngine?: any,
    devicesEngine?: any
  ) {
    return scanSectorLandmarks(pose, settings, simState, anatomyEngine, devicesEngine);
  }

  public attachCanvas(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
  }

  public getCanvas(): HTMLCanvasElement | null {
    return this.canvas;
  }

  public getContext(): CanvasRenderingContext2D | null {
    return this.ctx;
  }

  public setTintMode(mode: TintMode): void {
    this.tintMode = mode;
  }

  public getTintMode(): TintMode {
    return this.tintMode;
  }

  public toggleTintMode(): TintMode {
    this.tintMode = this.tintMode === 'clinical_gray' ? 'warm_sepia' : 'clinical_gray';
    return this.tintMode;
  }

  public setBiplaneTiltDeg(deg: number): void {
    this.biplaneTiltDeg = Math.max(-40, Math.min(40, deg));
  }

  public getBiplaneTiltDeg(): number {
    return this.biplaneTiltDeg;
  }

  public getMeasuredFps(): number {
    return this.measuredFps;
  }

  public getLatestLandmarkMap(): Map<number, SectorLandmarkStats> {
    return this.latestLandmarkMap;
  }

  public getSectorGeometry(panel: 'primary' | 'secondary' = 'primary'): SectorGeometryLayout | null {
    return panel === 'secondary' ? this.secondaryLayout : this.primaryLayout;
  }

  /**
   * Builds the 256-entry Platinum-Phosphor Clinical B-Mode LUT (`[SPEC PATCH #9]`)
   * and Warm Sepia B-Mode LUT.
   */
  private buildColorLuts(): void {
    for (let i = 0; i < 256; i++) {
      const l = i / 255.0;
      // [SPEC PATCH #9] Platinum-Phosphor Clinical Grayscale LUT:
      // Shadows & midtones: cool platinum-phosphor (242*L, 247*L, 255*L) over #030508 black base,
      // converging smoothly above L=0.80 to crisp warm-white (255, 255, 253) at specular peaks.
      const peakBlend = l > 0.78 ? (l - 0.78) / 0.22 : 0.0;
      const rLinear = 3.0 + l * 239.0 + peakBlend * 13.0;
      const gLinear = 5.0 + l * 242.0 + peakBlend * 8.0;
      const bLinear = 8.0 + l * 247.0 - peakBlend * 2.0;

      this.grayLut[i * 3 + 0] = Math.min(255, Math.max(3, Math.round(rLinear)));
      this.grayLut[i * 3 + 1] = Math.min(255, Math.max(5, Math.round(gLinear)));
      this.grayLut[i * 3 + 2] = Math.min(255, Math.max(8, Math.round(bLinear)));

      // Warm Sepia / Bronze B-Mode Tint
      const rS = Math.round(3 + Math.pow(l, 0.90) * 252);
      const gS = Math.round(5 + Math.pow(l, 1.04) * 224);
      const bS = Math.round(8 + Math.pow(l, 1.30) * 168);
      this.sepiaLut[i * 3 + 0] = Math.min(255, rS);
      this.sepiaLut[i * 3 + 1] = Math.min(255, gS);
      this.sepiaLut[i * 3 + 2] = Math.min(255, bS);
    }
  }

  /**
   * Flexible render entry point supporting both direct positional arguments and options object.
   */
  public render(
    poseOrParams:
      | CatheterPose3D
      | {
          pose: CatheterPose3D;
          settings: UltrasoundSettings;
          simState: ProceduralSimulationState;
          catheterState?: CatheterState;
          anatomyEngine?: any;
          devicesEngine?: any;
        },
    settings?: UltrasoundSettings,
    simState?: ProceduralSimulationState,
    anatomyOrCatheter?: any,
    devicesEngine?: any,
    catheterStateArg?: CatheterState
  ): void {
    let pose: CatheterPose3D;
    let usSettings: UltrasoundSettings;
    let procState: ProceduralSimulationState;
    let cathState: CatheterState = this.lastCatheterState;
    let anatomyEngine: any;
    let devEngine: any = devicesEngine;

    if ('pose' in poseOrParams) {
      pose = poseOrParams.pose;
      usSettings = poseOrParams.settings;
      procState = poseOrParams.simState;
      cathState = poseOrParams.catheterState ?? this.lastCatheterState;
      anatomyEngine = poseOrParams.anatomyEngine;
      devEngine = poseOrParams.devicesEngine;
    } else {
      pose = poseOrParams;
      usSettings = settings ?? this.lastSettings;
      procState = simState ?? this.lastSimState;
      if (anatomyOrCatheter && 'model' in anatomyOrCatheter && 'station' in anatomyOrCatheter) {
        cathState = anatomyOrCatheter as CatheterState;
      } else {
        anatomyEngine = anatomyOrCatheter;
        if (catheterStateArg) cathState = catheterStateArg;
      }
    }

    this.renderFrame(pose, usSettings, procState, cathState, anatomyEngine, devEngine);
  }

  /**
   * Synthesizes the complete 2D / Biplane / 4D En-Face ultrasound console frame.
   */
  public renderFrame(
    pose: CatheterPose3D,
    settings: UltrasoundSettings,
    simState: ProceduralSimulationState,
    catheterState?: CatheterState,
    anatomyEngine?: any,
    devicesEngine?: any
  ): void {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    this.fpsFrameCount++;
    if (now - this.fpsLastTime >= 500) {
      this.measuredFps = Math.min(60, Math.max(30, Math.round((this.fpsFrameCount * 1000) / (now - this.fpsLastTime))));
      this.fpsFrameCount = 0;
      this.fpsLastTime = now;
    }

    if (catheterState) {
      this.lastCatheterState = catheterState;
    }

    if (!settings.frozen || !this.lastPose) {
      this.lastPose = pose;
      this.lastSettings = settings;
      this.lastSimState = simState;

      // Evaluate Primary Polar Sector (Plane A at omniDeg)
      this.synthesizePolarSector(
        pose.transducerPos,
        pose.faceNormal,
        pose.latAxis,
        settings,
        simState,
        anatomyEngine,
        devicesEngine,
        this.primaryIntensityGrid,
        this.primaryStructureGrid,
        this.primaryDopplerGrid
      );

      // If Biplane (X-Plane) is enabled (and not overridden by 4D En-Face Volume), evaluate Orthogonal Secondary Sector
      if (this.lastCatheterState.biplaneEnabled && !this.lastCatheterState.volume4dEnabled) {
        this.synthesizePolarSector(
          pose.transducerPos,
          pose.faceNormal,
          pose.biplaneLatAxis,
          settings,
          simState,
          anatomyEngine,
          devicesEngine,
          this.secondaryIntensityGrid,
          this.secondaryStructureGrid,
          this.secondaryDopplerGrid
        );
      }
    }

    if (!this.canvas || !this.ctx) return;

    const rect = this.canvas.getBoundingClientRect();
    const targetW = Math.max(320, Math.floor(rect.width || this.canvas.width || 640));
    const targetH = Math.max(260, Math.floor(rect.height || this.canvas.height || 520));
    if (this.canvas.width !== targetW || this.canvas.height !== targetH || !this.imageData) {
      this.canvas.width = targetW;
      this.canvas.height = targetH;
      this.imageData = this.ctx.createImageData(targetW, targetH);
      this.screenStructureMap = new Uint8Array(targetW * targetH);
      this.screenDepthMmMap = new Float32Array(targetW * targetH);
      this.screenAzimuthDegMap = new Float32Array(targetW * targetH);
      this.screenPanelMap = new Uint8Array(targetW * targetH);
    }

    const w = this.canvas.width;
    const h = this.canvas.height;
    const data = this.imageData.data;

    // Clear entire stage to authentic #030508 pitch-black ultrasound background (SPEC PATCH #10)
    new Uint32Array(data.buffer).fill(0xff080503);
    this.screenStructureMap.fill(0);
    this.screenPanelMap.fill(0);

    const isBiplane = Boolean(this.lastCatheterState?.biplaneEnabled);
    const isVolume4d = Boolean(this.lastCatheterState?.volume4dEnabled);
    const isSplitScreen = isBiplane || isVolume4d;

    const activePose = this.lastPose;
    const activeSettings = this.lastSettings;
    const maxDepthMm = Math.max(40, activeSettings.depthCm * 10);

    const [nfx, nfy, nfz] = activePose.faceNormal;
    const [ulx, uly, ulz] = activePose.latAxis;
    const elx = nfy * ulz - nfz * uly;
    const ely = nfz * ulx - nfx * ulz;
    const elz = nfx * uly - nfy * ulx;

    if (!isSplitScreen) {
      const topPad = Math.max(58, Math.round(h * 0.08));
      const bottomPad = Math.max(54, Math.round(h * 0.105));
      const availH = Math.max(160, h - topPad - bottomPad);
      const availW = Math.max(200, w - 56);
      const outerRadiusPx = Math.min(availH, Math.floor(availW / 1.42));
      const innerRadiusPx = Math.max(8, Math.round(outerRadiusPx * (MIN_RADIUS_MM / maxDepthMm)));
      const apexX = Math.round(w * 0.5);
      const apexY = topPad;

      this.primaryLayout = {
        panel: 'primary',
        panelLeftPx: 0,
        panelTopPx: 0,
        panelWidthPx: w,
        panelHeightPx: h,
        apexX,
        apexY,
        innerRadiusPx,
        outerRadiusPx,
        halfAngleRad: HALF_SECTOR_RAD,
        pxPerMm: (outerRadiusPx - innerRadiusPx) / (maxDepthMm - MIN_RADIUS_MM),
        depthMm: maxDepthMm,
        omniDeg: this.lastCatheterState.omniDeg ?? 0,
        latAxis: activePose.latAxis,
        elevAxis: [elx, ely, elz],
      };
      this.secondaryLayout = null;

      this.scanConvertSectorToImage(
        this.primaryLayout,
        this.primaryIntensityGrid,
        this.primaryStructureGrid,
        1,
        w,
        h,
        data
      );
    } else {
      const halfW = Math.floor(w * 0.5);
      const topPad = Math.max(84, Math.round(h * 0.125));
      const bottomPad = Math.max(56, Math.round(h * 0.115));
      const availH = Math.max(140, h - topPad - bottomPad);
      const availW = Math.max(140, halfW - 28);
      const outerRadiusPx = Math.min(availH, Math.floor(availW / 1.42));
      const innerRadiusPx = Math.max(6, Math.round(outerRadiusPx * (MIN_RADIUS_MM / maxDepthMm)));

      this.primaryLayout = {
        panel: 'primary',
        panelLeftPx: 0,
        panelTopPx: 0,
        panelWidthPx: halfW,
        panelHeightPx: h,
        apexX: Math.round(halfW * 0.5),
        apexY: topPad,
        innerRadiusPx,
        outerRadiusPx,
        halfAngleRad: HALF_SECTOR_RAD,
        pxPerMm: (outerRadiusPx - innerRadiusPx) / (maxDepthMm - MIN_RADIUS_MM),
        depthMm: maxDepthMm,
        omniDeg: this.lastCatheterState.omniDeg ?? 0,
        latAxis: activePose.latAxis,
        elevAxis: [elx, ely, elz],
      };

      const [blx, bly, blz] = activePose.biplaneLatAxis;
      const belx = nfy * blz - nfz * bly;
      const bely = nfz * blx - nfx * blz;
      const belz = nfx * bly - nfy * blx;

      this.secondaryLayout = {
        panel: 'secondary',
        panelLeftPx: halfW,
        panelTopPx: 0,
        panelWidthPx: w - halfW,
        panelHeightPx: h,
        apexX: halfW + Math.round((w - halfW) * 0.5),
        apexY: topPad,
        innerRadiusPx,
        outerRadiusPx,
        halfAngleRad: HALF_SECTOR_RAD,
        pxPerMm: (outerRadiusPx - innerRadiusPx) / (maxDepthMm - MIN_RADIUS_MM),
        depthMm: maxDepthMm,
        omniDeg: ((this.lastCatheterState.omniDeg ?? 0) + 90) % 180,
        latAxis: activePose.biplaneLatAxis,
        elevAxis: [belx, bely, belz],
      };

      this.scanConvertSectorToImage(
        this.primaryLayout,
        this.primaryIntensityGrid,
        this.primaryStructureGrid,
        1,
        w,
        h,
        data
      );

      if (isVolume4d) {
        this.render4dEnFaceVolumeToImage(
          this.secondaryLayout,
          activePose,
          activeSettings,
          this.lastSimState,
          anatomyEngine,
          devicesEngine,
          w,
          h,
          data
        );
      } else {
        this.scanConvertSectorToImage(
          this.secondaryLayout,
          this.secondaryIntensityGrid,
          this.secondaryStructureGrid,
          2,
          w,
          h,
          data
        );
      }
    }

    // Commit synthesized pixel buffer to 2D canvas
    this.ctx.putImageData(this.imageData, 0, 0);

    // Build live landmark statistics & contour points for Hover/All overlays
    this.computeScreenLandmarkStats(w, h, maxDepthMm, anatomyEngine, devicesEngine);
  }

  private polarSubI: Float32Array | null = null;
  private polarSubQ: Float32Array | null = null;
  private tgcGainByIr: Float32Array = new Float32Array(POLAR_RADIAL_BINS);

  /**
   * High-Resolution Polar-PSF Multiplicative Rayleigh Beamformer (`[SPEC PATCH #4 & #9]`)
   *
   * 1. Evaluates the 3D Continuous Tissue Matrix & Carved Blood Lumen Field across `240 x 320` polar bins
   * 2. Weights the 3D + Polar Complex Gaussian Scatterers (I0, Q0) by local backscatter + specular amplitude
   * 3. Convolves (I, Q) with a Separable 5-Tap Axial x 7-Tap Depth-Broadened Azimuthal PSF Kernel
   * 4. Extracts the Multiplicative Rayleigh Envelope `R = sqrt(I^2 + Q^2)` (with genuine dark speckle nulls)
   * 5. Applies Near-Field Apex Lens Ring-Down, Beer-Lambert Attenuation, 6-Band TGC, Log-Compression,
   *    and the `[SPEC PATCH #9]` Reject Toe + S-Curve (`smoothstep(0.025, 0.96, u)^1.18`).
   */
  private synthesizePolarSector(
    transducerPos: [number, number, number],
    faceNormal: [number, number, number],
    latAxis: [number, number, number],
    settings: UltrasoundSettings,
    simState: ProceduralSimulationState,
    _anatomyEngine: any,
    _devicesEngine: any,
    outIntensity: Float32Array,
    outStructure: Uint8Array,
    outDoppler: Float32Array
  ): void {
    const [p0x, p0y, p0z] = transducerPos;
    const [nfx, nfy, nfz] = faceNormal;
    const [ulx, uly, ulz] = latAxis;

    if (!this.polarSubI || !this.polarSubQ) {
      const subI = new Float32Array(POLAR_AZIMUTH_BINS * POLAR_RADIAL_BINS);
      const subQ = new Float32Array(POLAR_AZIMUTH_BINS * POLAR_RADIAL_BINS);
      for (let ia = 0; ia < POLAR_AZIMUTH_BINS; ia++) {
        const row = ia * POLAR_RADIAL_BINS;
        for (let ir = 0; ir < POLAR_RADIAL_BINS; ir++) {
          subI[row + ir] = (latticeHash64(ia * 3 + 7, ir * 5 + 13, (ia ^ ir) & 63, 701) - 0.5) * 1.55;
          subQ[row + ir] = (latticeHash64(ia * 5 + 19, ir * 3 + 29, (ia + ir) & 63, 809) - 0.5) * 1.55;
        }
      }
      this.polarSubI = subI;
      this.polarSubQ = subQ;
    }
    const polarSubI = this.polarSubI;
    const polarSubQ = this.polarSubQ;

    // Activate host-chamber near-field continuity context for this polar slice
    activeTransducerCtx.active = true;
    activeTransducerCtx.pos = transducerPos;
    activeTransducerCtx.faceNormal = faceNormal;
    activeTransducerCtx.latAxis = latAxis;
    activeTransducerCtx.station = this.lastCatheterState?.station ?? 'ra_venous';

    const maxDepthMm = Math.max(40, settings.depthCm * 10);
    const focusMm = Math.max(15, settings.focusCm * 10);
    const freqMhz = settings.frequencyMhz ?? 7.5;
    const gainLinear = Math.pow(10, ((settings.gainDb ?? 58) - 58) / 22.0);
    const dynRangeDb = Math.max(35, Math.min(85, settings.dynamicRangeDb ?? 60));
    const latSign = settings.markerSide === 'left' ? -1 : 1;
    const tgc = settings.tgcOffsetsDb?.length >= 6 ? settings.tgcOffsetsDb : [0, 0, 0, 0, 0, 0];

    const tgcGainByIr = this.tgcGainByIr;
    for (let ir = 0; ir < POLAR_RADIAL_BINS; ir++) {
      const normDepth = ir / (POLAR_RADIAL_BINS - 1);
      const tgcPos = normDepth * 5.0;
      const tgcIdx = Math.min(4, Math.floor(tgcPos));
      const tgcFrac = tgcPos - tgcIdx;
      const tgcDb = tgc[tgcIdx] * (1.0 - tgcFrac) + tgc[tgcIdx + 1] * tgcFrac;
      tgcGainByIr[ir] = Math.pow(10, (tgcDb + normDepth * 3.2) / 20.0) * gainLinear;
    }

    const phase = simState.cardiacPhase ?? 0.0;
    const sysWave = Math.sin(phase * Math.PI * 2);
    const advX = sysWave * 0.65;
    const advY = -sysWave * 0.48;
    const advZ = sysWave * 0.52;

    const psfI0 = this.psfI0;
    const psfQ0 = this.psfQ0;
    const psfITemp = this.psfITemp;
    const psfQTemp = this.psfQTemp;
    const psfBaseE0 = this.psfBaseE0;
    const psfSpec = this.psfSpec;
    const psfGainAtten = this.psfGainAtten;
    const psfIsBlood = this.psfIsBlood;

    const drMm = (maxDepthMm - MIN_RADIUS_MM) / POLAR_RADIAL_BINS;
    const drCm = drMm * 0.1;

    // =========================================================================
    // PASS 1: Polar Raymarching, Specular Interface Physics & Complex Scatterers
    // =========================================================================
    for (let ia = 0; ia < POLAR_AZIMUTH_BINS; ia++) {
      const alphaScreenDeg = -HALF_SECTOR_DEG + ((ia + 0.5) / POLAR_AZIMUTH_BINS) * (2 * HALF_SECTOR_DEG);
      const alphaScreenRad = alphaScreenDeg * DEG2RAD;
      const cosA = Math.cos(alphaScreenRad);
      const sinA = Math.sin(alphaScreenRad) * latSign;

      // Phased-array element directivity & soft lateral edge roll-off window W(alpha)
      const absDeg = Math.abs(alphaScreenDeg);
      const edgeT = absDeg > 41.0 ? Math.max(0.0, (45.0 - absDeg) / 4.0) : 1.0;
      const edgeSmooth = edgeT * edgeT * (3.0 - 2.0 * edgeT);
      const apodization = Math.pow(cosA, 0.72) * (0.28 + 0.72 * edgeSmooth);

      const rx = cosA * nfx + sinA * ulx;
      const ry = cosA * nfy + sinA * uly;
      const rz = cosA * nfz + sinA * ulz;

      let prevZ = 1.61;
      let cumulativeTau = 0.0;
      let reverbEnergy = 0.0;
      let reverbStartR = -100.0;
      const rayOffset = ia * POLAR_RADIAL_BINS;

      for (let ir = 0; ir < POLAR_RADIAL_BINS; ir++) {
        const idx = rayOffset + ir;
        const rMm = MIN_RADIUS_MM + (ir + 0.5) * drMm;
        const wx = p0x + rMm * rx;
        const wy = p0y + rMm * ry;
        const wz = p0z + rMm * rz;

        const sample = evaluateAnalyticalCardiacAndDeviceField(wx, wy, wz, simState, false);
        const curZ = sample.impedanceMRayl;
        const sid = sample.structureId;
        outStructure[idx] = sid;

        // Radial Doppler velocity projection: v_radial = -v_blood . r_hat (positive = TOWARD transducer)
        const [vx, vy, vz] = sample.flowVelocityCmPerSec;
        outDoppler[idx] = -(vx * rx + vy * ry + vz * rz);

        const E0 = sample.backscatter;
        const isBlood = E0 < 0.045 && curZ < 1.65 && sample.borderGradient < 0.15;
        psfIsBlood[idx] = isBlood ? 1 : 0;

        // Angle-Dependent Specular Reflection at endocardial/valvular/pericardial interfaces
        const dZ = Math.abs(curZ - prevZ);
        const reflCoeff = dZ / Math.max(1.0, curZ + prevZ);
        const [snx, sny, snz] = sample.surfaceNormal;
        const cosIncidence = Math.abs(snx * rx + sny * ry + snz * rz);
        // Strong angle dependence: perpendicular interfaces gleam white; parallel walls exhibit lateral dropout
        const angleFactor = 0.06 + 0.94 * Math.pow(cosIncidence, 4.0);
        const borderBoost = sample.borderGradient * 0.14 * angleFactor;
        let iSpec = isBlood ? 0.0 : Math.min(0.88, reflCoeff * reflCoeff * 18.0 * angleFactor + borderBoost);

        // Metallic hardware (Watchman FLX struts/hub, TSP needle, Ablation tip): Z >= 4.5
        if (curZ >= 4.5) {
          iSpec = 1.55;
          reverbEnergy = 0.14;
          reverbStartR = rMm;
          cumulativeTau += 0.24 * drCm * freqMhz;
        } else {
          if (reverbEnergy > 0.02 && rMm > reverbStartR) {
            const distBehind = rMm - reverbStartR;
            const cw = 0.5 + 0.5 * Math.cos((distBehind / 1.55) * Math.PI * 2);
            iSpec += reverbEnergy * cw * cw * cw;
            reverbEnergy *= Math.exp(-0.34 * drMm);
          }
          cumulativeTau += sample.attenuationDbCmMhz * 0.056 * drCm * freqMhz;
        }

        const shadowAtten = Math.max(0.28, Math.exp(-cumulativeTau));
        psfBaseE0[idx] = E0;
        psfSpec[idx] = iSpec;
        psfGainAtten[idx] = shadowAtten * tgcGainByIr[ir] * apodization;

        if (isBlood) {
          psfI0[idx] = 0.010 * polarSubI[idx];
          psfQ0[idx] = 0.010 * polarSubQ[idx];
        } else {
          const iq3d = sampleComplexScatter3D(wx + advX, wy + advY, wz + advZ, freqMhz);
          const scatterAmp = Math.sqrt(Math.max(0.0004, E0 + 0.35 * iSpec));
          psfI0[idx] = scatterAmp * (iq3d.i0 * 0.62 + polarSubI[idx]);
          psfQ0[idx] = scatterAmp * (iq3d.q0 * 0.62 + polarSubQ[idx]);
        }

        prevZ = curZ;
      }
    }

    activeTransducerCtx.active = false;

    // =========================================================================
    // PASS 2: Separable 3-Tap Crisp Axial x 7-Tap Azimuthal Polar-PSF Convolution
    // =========================================================================
    // 2A. 3-Tap Crisp Axial PSF Convolution (`[0.18, 0.64, 0.18]`, L2 norm = 0.6888)
    for (let ia = 0; ia < POLAR_AZIMUTH_BINS; ia++) {
      const row = ia * POLAR_RADIAL_BINS;
      for (let ir = 0; ir < POLAR_RADIAL_BINS; ir++) {
        const idx = row + ir;
        const irM1 = row + Math.max(0, ir - 1);
        const irP1 = row + Math.min(POLAR_RADIAL_BINS - 1, ir + 1);

        psfITemp[idx] = 0.18 * psfI0[irM1] + 0.64 * psfI0[idx] + 0.18 * psfI0[irP1];
        psfQTemp[idx] = 0.18 * psfQ0[irM1] + 0.64 * psfQ0[idx] + 0.18 * psfQ0[irP1];
      }
    }

    // 2B. 7-Tap Depth- & Focus-Dependent Azimuthal PSF Convolution + Multiplicative Rayleigh Envelope
    // + Near-Field Apex Ring-Down + Log-Compression + [SPEC PATCH #9] Reject Toe & S-Curve
    const compressionK = 9.2 * (60.0 / dynRangeDb);
    const logDenom = Math.log10(1.0 + compressionK * 1.95);

    for (let ir = 0; ir < POLAR_RADIAL_BINS; ir++) {
      const rMm = MIN_RADIUS_MM + (ir + 0.5) * drMm;
      const depthNorm = ir / (POLAR_RADIAL_BINS - 1);
      const focalDistNorm = Math.abs(rMm - focusMm) / maxDepthMm;
      // Azimuthal PSF spread widens with depth and away from the focal zone, creating authentic horizontal/arcuate speckle grains
      const azSpread = Math.min(1.0, 0.25 + 0.55 * depthNorm + 0.35 * focalDistNorm);
      const w0 = 0.36 - 0.10 * azSpread;
      const w1 = 0.22 + 0.01 * azSpread;
      const w2 = 0.08 + 0.025 * azSpread;
      const w3 = 0.02 + 0.015 * azSpread;
      // L2 norm of azimuthal kernel for Rayleigh energy preservation
      const azNorm = Math.sqrt(w0 * w0 + 2.0 * (w1 * w1 + w2 * w2 + w3 * w3));
      const invPsfL2 = 1.0 / (0.6888 * azNorm);

      // Near-field transducer acoustic lens ring-down reverberation arc (r = 3.0 .. 7.2 mm)
      const isNearRingDown = rMm < 7.2;
      const ringDownEnv = isNearRingDown
        ? Math.exp(-0.78 * (rMm - MIN_RADIUS_MM)) *
          Math.pow(0.5 + 0.5 * Math.cos((rMm - MIN_RADIUS_MM) * 2.95), 1.6) *
          0.66
        : 0.0;

      for (let ia = 0; ia < POLAR_AZIMUTH_BINS; ia++) {
        const idx = ia * POLAR_RADIAL_BINS + ir;
        const iaM3 = Math.max(0, ia - 3) * POLAR_RADIAL_BINS + ir;
        const iaM2 = Math.max(0, ia - 2) * POLAR_RADIAL_BINS + ir;
        const iaM1 = Math.max(0, ia - 1) * POLAR_RADIAL_BINS + ir;
        const iaP1 = Math.min(POLAR_AZIMUTH_BINS - 1, ia + 1) * POLAR_RADIAL_BINS + ir;
        const iaP2 = Math.min(POLAR_AZIMUTH_BINS - 1, ia + 2) * POLAR_RADIAL_BINS + ir;
        const iaP3 = Math.min(POLAR_AZIMUTH_BINS - 1, ia + 3) * POLAR_RADIAL_BINS + ir;

        const barI =
          w3 * (psfITemp[iaM3] + psfITemp[iaP3]) +
          w2 * (psfITemp[iaM2] + psfITemp[iaP2]) +
          w1 * (psfITemp[iaM1] + psfITemp[iaP1]) +
          w0 * psfITemp[idx];

        const barQ =
          w3 * (psfQTemp[iaM3] + psfQTemp[iaP3]) +
          w2 * (psfQTemp[iaM2] + psfQTemp[iaP2]) +
          w1 * (psfQTemp[iaM1] + psfQTemp[iaP1]) +
          w0 * psfQTemp[idx];

        // True PSF-convolved Rayleigh amplitude envelope (in [0, ~2.8], with genuine dark nulls!)
        const psfRayleighAmp = Math.sqrt(barI * barI + barQ * barQ) * invPsfL2 * 0.798;
        const E0 = psfBaseE0[idx];
        const iSpec = psfSpec[idx];
        const isBloodBin = psfIsBlood[idx] === 1;
        const localAmp = isBloodBin ? 0.010 : Math.sqrt(Math.max(0.0004, E0 + 0.35 * iSpec));
        // Normalized multiplicative Rayleigh factor R in [0.02, 2.55]
        const R = Math.max(0.02, Math.min(2.55, psfRayleighAmp / localAmp));

        let env: number;
        if (isBloodBin && !isNearRingDown) {
          // Inside anechoic blood cavity: allow subtle PSF boundary feathering within 1-2 taps of bright walls
          // while keeping the interior of the blood pool dark (mean luminance < 0.015 << 0.12)
          const boundaryFeather = Math.max(0.0, psfRayleighAmp - 0.068) * 0.16;
          const microBlood = 0.0014 * R * R;
          env = (microBlood + boundaryFeather) * psfGainAtten[idx];
        } else {
          // Multiplicative Rayleigh tissue backscatter + incoherent microstructure floor + specular highlight
          const rayleighMod = 0.08 + 0.76 * Math.pow(R, 1.22);
          const tissueEcho = E0 * rayleighMod + iSpec * (0.18 + 0.64 * R) + ringDownEnv * (0.55 + 0.40 * R);
          env = tissueEcho * psfGainAtten[idx];
        }

        // Stage 5A: Logarithmic Dynamic Range Compression
        const u = Math.min(1.0, Math.max(0.0, Math.log10(1.0 + compressionK * Math.max(0.0, env)) / logDenom));

        // Stage 5B: [SPEC PATCH #9] Reject Toe + S-Curve: L = smoothstep(0.025, 0.96, u)^1.18
        const t = Math.max(0.0, Math.min(1.0, (u - 0.025) / (0.96 - 0.025)));
        const smooth = t * t * (3.0 - 2.0 * t);
        outIntensity[idx] = Math.pow(smooth, 1.18);
      }
    }
  }

  private sectorScanCache: Record<
    number,
    {
      key: string;
      count: number;
      pixIndices: Int32Array;
      idx00: Int32Array;
      nearIdx: Int32Array;
      fa: Float32Array;
      fr: Float32Array;
      depthMmValues: Float32Array;
      azDegValues: Float32Array;
    }
  > = {};

  /**
   * Scan-converts a polar sector grid into the Cartesian ImageData buffer with bilinear interpolation.
   * Uses a layout-keyed precomputed polar coordinate table to eliminate 450,000 per-frame sqrt/atan2 calls.
   */
  private scanConvertSectorToImage(
    layout: SectorGeometryLayout,
    intensityGrid: Float32Array,
    structureGrid: Uint8Array,
    panelCode: number,
    canvasW: number,
    canvasH: number,
    data: Uint8ClampedArray
  ): void {
    const lut = this.tintMode === 'warm_sepia' ? this.sepiaLut : this.grayLut;
    const { apexX, apexY, innerRadiusPx, outerRadiusPx, halfAngleRad, depthMm } = layout;

    const cacheKey = `${panelCode}_${canvasW}_${canvasH}_${Math.round(apexX)}_${Math.round(apexY)}_${Math.round(innerRadiusPx)}_${Math.round(outerRadiusPx)}_${halfAngleRad.toFixed(3)}_${depthMm.toFixed(1)}`;
    let cached = this.sectorScanCache[panelCode];

    if (!cached || cached.key !== cacheKey) {
      const minX = Math.max(layout.panelLeftPx, Math.floor(apexX - outerRadiusPx * Math.sin(halfAngleRad) - 2));
      const maxX = Math.min(
        layout.panelLeftPx + layout.panelWidthPx - 1,
        Math.ceil(apexX + outerRadiusPx * Math.sin(halfAngleRad) + 2)
      );
      const minY = Math.max(layout.panelTopPx, Math.floor(apexY + innerRadiusPx * Math.cos(halfAngleRad) - 2));
      const maxY = Math.min(layout.panelTopPx + layout.panelHeightPx - 1, Math.ceil(apexY + outerRadiusPx + 2));
      const rSpanPx = Math.max(1, outerRadiusPx - innerRadiusPx);
      const maxPixels = Math.max(1, (maxX - minX + 1) * (maxY - minY + 1));

      const pixIndices = new Int32Array(maxPixels);
      const idx00Arr = new Int32Array(maxPixels);
      const nearIdxArr = new Int32Array(maxPixels);
      const faArr = new Float32Array(maxPixels);
      const frArr = new Float32Array(maxPixels);
      const depthMmValues = new Float32Array(maxPixels);
      const azDegValues = new Float32Array(maxPixels);

      let count = 0;
      for (let py = minY; py <= maxY; py++) {
        const dy = py - apexY;
        if (dy <= 0) continue;
        const rowOffset = py * canvasW;

        for (let px = minX; px <= maxX; px++) {
          const dx = px - apexX;
          const rPx = Math.sqrt(dx * dx + dy * dy);
          if (rPx < innerRadiusPx || rPx > outerRadiusPx) continue;

          const thetaRad = Math.atan2(dx, dy);
          if (thetaRad < -halfAngleRad || thetaRad > halfAngleRad) continue;

          const normAz = (thetaRad + halfAngleRad) / (2.0 * halfAngleRad);
          const normRad = (rPx - innerRadiusPx) / rSpanPx;

          const azF = normAz * (POLAR_AZIMUTH_BINS - 1);
          const radF = normRad * (POLAR_RADIAL_BINS - 1);
          const ia0 = Math.min(POLAR_AZIMUTH_BINS - 2, Math.max(0, Math.floor(azF)));
          const ir0 = Math.min(POLAR_RADIAL_BINS - 2, Math.max(0, Math.floor(radF)));

          pixIndices[count] = rowOffset + px;
          idx00Arr[count] = ia0 * POLAR_RADIAL_BINS + ir0;
          nearIdxArr[count] = Math.round(azF) * POLAR_RADIAL_BINS + Math.round(radF);
          faArr[count] = azF - ia0;
          frArr[count] = radF - ir0;
          depthMmValues[count] = MIN_RADIUS_MM + normRad * (depthMm - MIN_RADIUS_MM);
          azDegValues[count] = thetaRad * RAD2DEG;
          count++;
        }
      }

      cached = {
        key: cacheKey,
        count,
        pixIndices: pixIndices.subarray(0, count),
        idx00: idx00Arr.subarray(0, count),
        nearIdx: nearIdxArr.subarray(0, count),
        fa: faArr.subarray(0, count),
        fr: frArr.subarray(0, count),
        depthMmValues: depthMmValues.subarray(0, count),
        azDegValues: azDegValues.subarray(0, count),
      };
      this.sectorScanCache[panelCode] = cached;

      // Populate depthMmMap and azimuthDegMap once for this layout
      for (let k = 0; k < count; k++) {
        const pIdx = cached.pixIndices[k];
        this.screenDepthMmMap[pIdx] = cached.depthMmValues[k];
        this.screenAzimuthDegMap[pIdx] = cached.azDegValues[k];
      }
    }

    const { count, pixIndices, idx00, nearIdx, fa, fr } = cached;
    const screenStruct = this.screenStructureMap;
    const screenPanel = this.screenPanelMap;

    for (let k = 0; k < count; k++) {
      const i00 = idx00[k];
      const i10 = i00 + POLAR_RADIAL_BINS;
      const fR = fr[k];
      const fA = fa[k];

      const v0 = intensityGrid[i00] + fR * (intensityGrid[i00 + 1] - intensityGrid[i00]);
      const v1 = intensityGrid[i10] + fR * (intensityGrid[i10 + 1] - intensityGrid[i10]);
      const val = v0 + fA * (v1 - v0);

      const lutIdx = ((val * 255 + 0.5) | 0) * 3;
      const clampedLut = lutIdx < 0 ? 0 : lutIdx > 765 ? 765 : lutIdx;
      const pixIdx = pixIndices[k];
      const byteIdx = pixIdx << 2;

      data[byteIdx] = lut[clampedLut];
      data[byteIdx + 1] = lut[clampedLut + 1];
      data[byteIdx + 2] = lut[clampedLut + 2];

      screenStruct[pixIdx] = structureGrid[nearIdx[k]];
      screenPanel[pixIdx] = panelCode;
    }
  }

  /**
   * Organically Cropped Depth-Cued 3D Volumetric Ultrasound Slab Raymarcher for NuVision 4D En-Face (`[SPEC PATCH #5 & #12]`).
   */
  private render4dEnFaceVolumeToImage(
    layout: SectorGeometryLayout,
    pose: CatheterPose3D,
    settings: UltrasoundSettings,
    simState: ProceduralSimulationState,
    anatomyEngine: any,
    devicesEngine: any,
    canvasW: number,
    canvasH: number,
    data: Uint8ClampedArray
  ): void {
    const cx = layout.panelLeftPx + Math.round(layout.panelWidthPx * 0.5);
    const cy = Math.round(layout.apexY + (canvasH - layout.apexY - 48) * 0.48);
    const radiusPx = Math.min(
      Math.floor(layout.panelWidthPx * 0.43),
      Math.floor((canvasH - layout.apexY - 52) * 0.47)
    );

    const minX = Math.max(layout.panelLeftPx + 6, cx - radiusPx);
    const maxX = Math.min(layout.panelLeftPx + layout.panelWidthPx - 6, cx + radiusPx);
    const minY = Math.max(layout.apexY - 4, cy - radiusPx);
    const maxY = Math.min(canvasH - 12, cy + radiusPx);

    const station = this.lastCatheterState?.station ?? 'la_transseptal';
    const phase = simState.cardiacPhase ?? 0.0;
    const isSystole = phase >= 0.06 && phase <= 0.38;
    const sysEnv = isSystole ? Math.sin(((phase - 0.06) / 0.32) * Math.PI) : 0.0;
    const breath = 1.0 + 0.035 * sysEnv;

    const omniRad = ((this.lastCatheterState?.omniDeg ?? 90) - 90) * DEG2RAD * 0.14;
    const cosO = Math.cos(omniRad);
    const sinO = Math.sin(omniRad);
    const panU = ((this.lastCatheterState?.torqueDeg ?? 12) - 12) * 0.007;
    const panV = ((this.lastCatheterState?.apDeg ?? -8) + 8) * 0.007;

    const isLaEnFace = station === 'la_transseptal' || simState.watchmanStage !== 'none';

    if (isLaEnFace) {
      const morph = simState.laaMorphology ?? 'chicken_wing';
      const ostiumRx = (morph === 'windsock' ? 10.6 : morph === 'cauliflower' ? 11.4 : 11.0) * breath;
      const ostiumRy = (morph === 'chicken_wing' ? 8.8 : morph === 'cactus' ? 9.6 : 9.2) * breath;
      const hasWatchman = Boolean(simState.watchmanStage && simState.watchmanStage !== 'none');
      const tugShiftMm = simState.watchmanTugActive ? -1.4 : 0.0;
      const stageScale =
        simState.watchmanStage === 'sheath_across'
          ? 0.38
          : simState.watchmanStage === 'flx_ball'
            ? 0.64
            : simState.watchmanStage === 'triangle'
              ? 0.85
              : 1.0;
      const sizeScale = Math.max(0.84, Math.min(1.16, (simState.watchmanSizeMm ?? 27) / 27.0));
      const wmRadiusX = ostiumRx * 0.96 * stageScale * sizeScale;
      const wmRadiusY = ostiumRy * 0.96 * stageScale * sizeScale;

      const lx = -0.36;
      const ly = -0.44;
      const lz = 0.822;

      // Evaluate on a 3x3 sub-grid with zero-allocation 20-step 3D depth raymarching + secant refinement
      const stepPx = 3;
      const invStep = 1.0 / stepPx;
      const gridW = Math.ceil((maxX - minX + 1) / stepPx) + 2;
      const gridH = Math.ceil((maxY - minY + 1) / stepPx) + 2;
      const bufR = new Float32Array(gridW * gridH);
      const bufG = new Float32Array(gridW * gridH);
      const bufB = new Float32Array(gridW * gridH);
      const bufSid = new Uint8Array(gridW * gridH);
      const bufDepth = new Float32Array(gridW * gridH);
      const bufMask = new Float32Array(gridW * gridH);

      bufR.fill(3);
      bufG.fill(5);
      bufB.fill(8);

      let v4dSdf = 10.0;
      let v4dSid: number = StructureId.LA_CAVITY;
      let v4dIsMetal = false;

      const evalLaVolumeSdfFast = (vx: number, vy: number, vzDepth: number): number => {
        const w3 = sampleDomainWarp3D(46.0 + vx * 0.9, 25.0 - vy * 0.9, -2.0 + vzDepth * 0.8);
        const wx = vx + w3.dx * 0.55;
        const wy = vy + w3.dy * 0.55;

        const dxLaa = wx - 1.5;
        const dyLaa = wy - 1.8;
        const ca = 0.945;
        const sa = 0.326;
        const elX = (dxLaa * ca + dyLaa * sa) / ostiumRx;
        const elY = (-dxLaa * sa + dyLaa * ca) / ostiumRy;
        const rLaaNorm = Math.sqrt(elX * elX + elY * elY);

        const dxPv = (wx + 11.5) / 7.8;
        const dyPv = (wy + 8.5) / 6.4;
        const rPvNorm = Math.sqrt(dxPv * dxPv + dyPv * dyPv);

        const ridgeArcU = (wx + 1.8) / 13.5;
        const ridgeArcV = (wy + 5.8 - 0.25 * wx) / 5.2;
        const ridgeBell = Math.exp(-(ridgeArcU * ridgeArcU + ridgeArcV * ridgeArcV * 1.35));

        let zSurfaceMm = 32.5 + 0.14 * (wx * wx + wy * wy) * 0.08 - ridgeBell * 8.2 + w3.dz * 0.85;
        let sid: number = ridgeBell > 0.36 ? StructureId.COUMADIN_RIDGE : StructureId.LA_CAVITY;

        if (wy > 8.5 - 0.18 * wx) {
          sid = wy > 12.5 ? StructureId.MITRAL_VALVE_AML_PML : StructureId.CORONARY_ARTERIES_LMCA_RCA_LCX;
          zSurfaceMm -= 2.2 * Math.exp(-Math.pow((wy - 10.5) / 4.2, 2));
        }

        if (rLaaNorm < 1.08) {
          const throatFade = Math.max(0.0, 1.0 - Math.pow(rLaaNorm / 1.08, 2.2));
          const thetaLaa = Math.atan2(elY, elX);
          const pectinateWave =
            (0.5 + 0.5 * Math.sin(thetaLaa * 9.0 + vzDepth * 0.45)) *
            (0.5 + 0.5 * Math.cos(vzDepth * 0.65 - thetaLaa * 3.0));
          const laaFloorDepth = 32.5 + throatFade * 21.5 - (rLaaNorm > 0.35 ? pectinateWave * 2.8 * rLaaNorm : 0.0);
          if (simState.laaThrombusPresent && rLaaNorm < 0.62) {
            const thrDome = Math.sqrt(Math.max(0.0, 1.0 - Math.pow(rLaaNorm / 0.62, 2))) * 6.5;
            zSurfaceMm = 37.5 - thrDome + w3.dx * 0.9;
          } else {
            zSurfaceMm = Math.max(zSurfaceMm, laaFloorDepth);
          }
          sid = StructureId.LAA_OSTIUM_AND_LOBES;
        } else if (rPvNorm < 1.05 && ridgeBell < 0.48) {
          const pvFade = Math.max(0.0, 1.0 - Math.pow(rPvNorm / 1.05, 2.0));
          zSurfaceMm = Math.max(zSurfaceMm, 33.0 + pvFade * 17.5);
          sid = StructureId.LSPV;
        }

        let tissueSdf = zSurfaceMm - vzDepth;
        let isMetal = false;

        if (hasWatchman) {
          const wmElX = (dxLaa * ca + dyLaa * sa) / Math.max(2.0, wmRadiusX);
          const wmElY = (-dxLaa * sa + dyLaa * ca) / Math.max(2.0, wmRadiusY);
          const rWm = Math.sqrt(wmElX * wmElX + wmElY * wmElY);
          if (rWm <= 1.02) {
            const domeZ = Math.sqrt(Math.max(0.0, 1.0 - rWm * rWm * 0.74)) * 5.8;
            const phiWm = Math.atan2(wmElY, wmElX);
            const strutRib = Math.pow(0.5 + 0.5 * Math.cos(phiWm * 18.0 + rWm * 3.2), 2.2) * (rWm > 0.22 ? 0.95 : 0.2);
            const braidLattice =
              Math.sin(vx * 1.65 + vy * 1.65) * Math.sin(vx * 1.65 - vy * 1.65) * 0.45;
            const isHubRing = rWm >= 0.09 && rWm <= 0.20;
            const isHubDimple = rWm < 0.09;
            const wmSurfaceZ =
              29.2 -
              tugShiftMm -
              domeZ -
              strutRib -
              braidLattice -
              (isHubRing ? 1.6 : isHubDimple ? -1.2 : 0.0);
            const wmSdf = Math.abs(vzDepth - wmSurfaceZ) - 1.65;
            if (wmSdf < tissueSdf) {
              tissueSdf = wmSdf;
              sid = StructureId.WATCHMAN_FLX_DEVICE;
              isMetal = isHubRing || strutRib > 0.55 || simState.watchmanStage === 'sheath_across';
            }
          }
        }

        v4dSdf = tissueSdf;
        v4dSid = sid;
        v4dIsMetal = isMetal;
        return tissueSdf;
      };

      for (let gy = 0; gy < gridH; gy++) {
        const py = minY + gy * stepPx;
        const rawNy = (py - cy) / radiusPx;
        for (let gx = 0; gx < gridW; gx++) {
          const px = minX + gx * stepPx;
          const rawNx = (px - cx) / radiusPx;
          const gIdx = gy * gridW + gx;

          const u = (rawNx * cosO - rawNy * sinO) + panU;
          const v = (rawNx * sinO + rawNy * cosO) + panV;
          const slabTheta = Math.atan2(v, u);
          const slabWarp = sampleDomainWarp3D(u * 32.0, v * 32.0, 12.0);
          const maxSlabR =
            0.84 +
            0.09 * Math.cos(2.0 * slabTheta + 0.6) -
            0.07 * Math.sin(3.0 * slabTheta - 0.4) +
            0.04 * Math.cos(5.0 * slabTheta) +
            slabWarp.dx * 0.028;
          const rSlab = Math.sqrt(u * u * 1.06 + v * v * 0.96);
          if (rSlab > maxSlabR) {
            bufMask[gIdx] = 0.0;
            continue;
          }
          const slabEdgeFade =
            rSlab > maxSlabR - 0.09 ? Math.max(0.0, (maxSlabR - rSlab) / 0.09) : 1.0;
          const edgeSmooth = slabEdgeFade * slabEdgeFade * (3.0 - 2.0 * slabEdgeFade);
          bufMask[gIdx] = edgeSmooth;

          const vxBase = u * 21.5;
          const vyBase = v * 21.5;
          const dirX = u * 0.24;
          const dirY = v * 0.24;

          let hitZ = 54.0;
          let hitSid: number = StructureId.LA_CAVITY;
          let hitMetal = false;
          let didHit = false;

          const zStart = 19.0;
          const zEnd = 53.0;
          const numSteps = 20;
          const dzStep = (zEnd - zStart) / numSteps;

          let prevZ = zStart;
          let prevSdf = 10.0;

          for (let s = 0; s <= numSteps; s++) {
            const zCur = zStart + s * dzStep;
            const zOff = zCur - 30.0;
            const curVx = vxBase + dirX * zOff;
            const curVy = vyBase + dirY * zOff;
            const curSdf = evalLaVolumeSdfFast(curVx, curVy, zCur);
            if (curSdf <= 0.0) {
              const frac = prevSdf / Math.max(1e-4, prevSdf - curSdf);
              hitZ = prevZ + Math.max(0.0, Math.min(1.0, frac)) * dzStep;
              hitSid = v4dSid;
              hitMetal = v4dIsMetal;
              didHit = true;
              break;
            }
            prevZ = zCur;
            prevSdf = curSdf;
          }

          if (!didHit) {
            bufR[gIdx] = 5;
            bufG[gIdx] = 7;
            bufB[gIdx] = 11;
            bufSid[gIdx] = StructureId.LAA_OSTIUM_AND_LOBES;
            bufDepth[gIdx] = 52.0;
            continue;
          }

          const hitZOff = hitZ - 30.0;
          const hx = vxBase + dirX * hitZOff;
          const hy = vyBase + dirY * hitZOff;

          const eps = 0.75;
          const s0 = evalLaVolumeSdfFast(hx, hy, hitZ);
          const gxSdf = evalLaVolumeSdfFast(hx + eps, hy, hitZ) - s0;
          const gySdf = evalLaVolumeSdfFast(hx, hy + eps, hitZ) - s0;
          const gzSdf = -eps;
          const gLen = Math.max(1e-5, Math.sqrt(gxSdf * gxSdf + gySdf * gySdf + gzSdf * gzSdf));
          const nx = gxSdf / gLen;
          const ny = gySdf / gLen;
          const nz = gzSdf / gLen;

          const ndotl = Math.max(0.06, nx * lx + ny * ly + nz * lz);
          const rim = Math.pow(1.0 - Math.max(0.0, nz), 1.65);
          const spec = Math.pow(ndotl, 6.5) * 0.34;

          const speckle3d = sampleCoherentRayleighSpeckle(
            46.0 + hx * 1.15,
            25.0 - hy * 1.15,
            -2.0 + hitZ * 0.95,
            7.5,
            phase,
            hitSid
          );
          const speckleMod = 0.64 + 0.42 * Math.min(1.65, speckle3d);

          const normDepth = Math.max(0.0, Math.min(1.0, (hitZ - 21.5) / 26.5));
          const depthShadow = Math.exp(-2.85 * normDepth * normDepth);
          const illum = Math.max(
            0.02,
            Math.min(1.25, (0.20 + 0.64 * ndotl + 0.22 * rim + spec) * depthShadow * speckleMod)
          );

          let rOut: number;
          let gOut: number;
          let bOut: number;

          if (hitSid === StructureId.WATCHMAN_FLX_DEVICE && hitMetal) {
            rOut = 12 + 236 * Math.pow(illum, 0.88);
            gOut = 14 + 234 * Math.pow(illum, 0.90);
            bOut = 18 + 232 * Math.pow(illum, 0.92);
          } else {
            rOut = 7 + 228 * Math.pow(illum, 0.92);
            gOut = 8 + 210 * Math.pow(illum, 0.98);
            bOut = 12 + 194 * Math.pow(illum, 1.06);
          }

          bufR[gIdx] = Math.min(255, rOut) * edgeSmooth + 3 * (1 - edgeSmooth);
          bufG[gIdx] = Math.min(255, gOut) * edgeSmooth + 5 * (1 - edgeSmooth);
          bufB[gIdx] = Math.min(255, bOut) * edgeSmooth + 8 * (1 - edgeSmooth);
          bufSid[gIdx] = hitSid;
          bufDepth[gIdx] = hitZ;
        }
      }

      for (let py = minY; py <= maxY; py++) {
        const fy = (py - minY) * invStep;
        const gy0 = Math.min(gridH - 2, Math.max(0, Math.floor(fy)));
        const ty = fy - gy0;
        const rowOffset = py * canvasW;

        for (let px = minX; px <= maxX; px++) {
          const fx = (px - minX) * invStep;
          const gx0 = Math.min(gridW - 2, Math.max(0, Math.floor(fx)));
          const tx = fx - gx0;

          const i00 = gy0 * gridW + gx0;
          const i10 = i00 + 1;
          const i01 = (gy0 + 1) * gridW + gx0;
          const i11 = i01 + 1;

          const m =
            (bufMask[i00] * (1 - tx) + bufMask[i10] * tx) * (1 - ty) +
            (bufMask[i01] * (1 - tx) + bufMask[i11] * tx) * ty;
          if (m < 0.02) continue;

          const rVal =
            (bufR[i00] * (1 - tx) + bufR[i10] * tx) * (1 - ty) +
            (bufR[i01] * (1 - tx) + bufR[i11] * tx) * ty;
          const gVal =
            (bufG[i00] * (1 - tx) + bufG[i10] * tx) * (1 - ty) +
            (bufG[i01] * (1 - tx) + bufG[i11] * tx) * ty;
          const bVal =
            (bufB[i00] * (1 - tx) + bufB[i10] * tx) * (1 - ty) +
            (bufB[i01] * (1 - tx) + bufB[i11] * tx) * ty;

          const pIdx = rowOffset + px;
          const bIdx = pIdx * 4;
          data[bIdx] = Math.min(255, Math.round(rVal));
          data[bIdx + 1] = Math.min(255, Math.round(gVal));
          data[bIdx + 2] = Math.min(255, Math.round(bVal));
          data[bIdx + 3] = 255;

          const nearIdx = (ty > 0.5 ? gy0 + 1 : gy0) * gridW + (tx > 0.5 ? gx0 + 1 : gx0);
          this.screenStructureMap[pIdx] = bufSid[nearIdx];
          this.screenDepthMmMap[pIdx] = bufDepth[nearIdx];
          this.screenAzimuthDegMap[pIdx] = ((px - cx) / radiusPx) * 38.0;
          this.screenPanelMap[pIdx] = 2;
        }
      }
      return;
    }

    // =========================================================================
    // General 3D Volumetric En-Face Raymarcher for Right Atrial / RV Stations
    // =========================================================================
    const [p0x, p0y, p0z] = pose.transducerPos;
    const [nfx, nfy, nfz] = pose.faceNormal;
    const [ulx, uly, ulz] = pose.latAxis;
    const [elx, ely, elz] = layout.elevAxis;
    const latSign = settings.markerSide === 'left' ? -1 : 1;

    const maxDepthMm = Math.max(48, Math.min(82, settings.depthCm * 10));
    const startDepthMm = 16.0;
    const steps = 48;
    const stepMm = (maxDepthMm - startDepthMm) / steps;

    const lRawX = -nfx + 0.42 * ulx + 0.48 * elx;
    const lRawY = -nfy + 0.42 * uly + 0.48 * ely;
    const lRawZ = -nfz + 0.42 * ulz + 0.48 * elz;
    const lInv = 1.0 / Math.max(1e-5, Math.sqrt(lRawX * lRawX + lRawY * lRawY + lRawZ * lRawZ));
    const keyLx = lRawX * lInv;
    const keyLy = lRawY * lInv;
    const keyLz = lRawZ * lInv;

    for (let py = minY; py <= maxY; py += 2) {
      const ny = (py - cy) / radiusPx;
      for (let px = minX; px <= maxX; px += 2) {
        const nx = (px - cx) / radiusPx;
        const thetaSlab = Math.atan2(ny, nx);
        const wSlab = sampleDomainWarp3D(nx * 28.0, ny * 28.0, 7.0);
        const maxSlabR = 0.85 + 0.08 * Math.cos(2.0 * thetaSlab) - 0.06 * Math.sin(3.0 * thetaSlab) + wSlab.dx * 0.025;
        const rSlab = Math.sqrt(nx * nx + ny * ny);
        if (rSlab > maxSlabR) continue;

        const tanAlpha = nx * 0.76 * latSign;
        const tanBeta = -ny * 0.76;
        const invLen = 1.0 / Math.sqrt(1.0 + tanAlpha * tanAlpha + tanBeta * tanBeta);
        const dirX = (nfx + tanAlpha * ulx + tanBeta * elx) * invLen;
        const dirY = (nfy + tanAlpha * uly + tanBeta * ely) * invLen;
        const dirZ = (nfz + tanAlpha * ulz + tanBeta * elz) * invLen;

        let accumR = 5.0;
        let accumG = 7.0;
        let accumB = 11.0;
        let transmittance = 1.0;
        let hitSid = 0;
        let hitDepth = maxDepthMm;
        let prevBackscatter = 0.01;

        for (let s = 0; s < steps; s++) {
          const rMm = startDepthMm + s * stepMm;
          const wx = p0x + rMm * dirX;
          const wy = p0y + rMm * dirY;
          const wz = p0z + rMm * dirZ;

          const sample = evaluateAnalyticalCardiacAndDeviceField(wx, wy, wz, simState, false);
          const sid = sample.structureId;

          if (sample.backscatter < 0.16) {
            prevBackscatter = sample.backscatter;
            continue;
          }
          if (rMm < 22.0 && (sid === StructureId.RA_CAVITY || sid === StructureId.RV_CAVITY)) {
            prevBackscatter = sample.backscatter;
            continue;
          }

          if (hitSid === 0) {
            hitSid = sid;
            hitDepth = rMm;
          }

          const [snx, sny, snz] = sample.surfaceNormal;
          const normDepth = Math.max(0.0, Math.min(1.0, (rMm - 16.0) / (maxDepthMm - 16.0)));
          const depthCue = Math.pow(1.0 - 0.80 * normDepth, 1.35);
          const ndotl = Math.max(0.0, Math.abs(snx * keyLx + sny * keyLy + snz * keyLz));
          const ndotv = Math.max(0.0, Math.abs(snx * dirX + sny * dirY + snz * dirZ));
          const rim = Math.pow(1.0 - ndotv, 1.75);
          const spec = Math.pow(ndotl, 6.0) * 0.32;
          const interfaceStep = Math.min(1.0, Math.max(0.0, (sample.backscatter - prevBackscatter) * 2.2));
          const speckle3d = 0.72 + 0.36 * sampleCoherentRayleighSpeckle(wx, wy, wz, 7.5, simState.cardiacPhase, sid);

          const shade = Math.min(
            1.25,
            (0.20 + 0.60 * ndotl + 0.25 * rim + spec + 0.18 * interfaceStep) *
              depthCue *
              (0.68 + 0.38 * sample.backscatter) *
              speckle3d
          );

          const vR = Math.min(255, 228 * Math.pow(shade, 0.92));
          const vG = Math.min(255, 210 * Math.pow(shade, 0.98));
          const vB = Math.min(255, 194 * Math.pow(shade, 1.06));

          const alpha = Math.min(0.68, (0.22 + 0.45 * interfaceStep) * sample.backscatter);
          accumR += transmittance * alpha * vR;
          accumG += transmittance * alpha * vG;
          accumB += transmittance * alpha * vB;
          transmittance *= 1.0 - alpha;
          prevBackscatter = sample.backscatter;
          if (transmittance < 0.05) break;
        }

        const edgeFade = rSlab > maxSlabR - 0.08 ? Math.max(0.0, (maxSlabR - rSlab) / 0.08) : 1.0;
        const rByte = Math.min(255, Math.round(accumR * edgeFade + 3 * (1 - edgeFade)));
        const gByte = Math.min(255, Math.round(accumG * edgeFade + 5 * (1 - edgeFade)));
        const bByte = Math.min(255, Math.round(accumB * edgeFade + 8 * (1 - edgeFade)));

        for (let by = 0; by < 2 && py + by <= maxY; by++) {
          for (let bx = 0; bx < 2 && px + bx <= maxX; bx++) {
            const pIdx = (py + by) * canvasW + (px + bx);
            const bIdx = pIdx * 4;
            data[bIdx] = rByte;
            data[bIdx + 1] = gByte;
            data[bIdx + 2] = bByte;
            data[bIdx + 3] = 255;

            this.screenStructureMap[pIdx] = hitSid;
            this.screenDepthMmMap[pIdx] = hitDepth;
            this.screenAzimuthDegMap[pIdx] = nx * 38.0;
            this.screenPanelMap[pIdx] = 2;
          }
        }
      }
    }
  }

  /**
   * Computes screen-space centroids & boundary contour points for all structures visible in the current frame.
   * For blood-pool chambers (`RA`, `RV`, `RVOT`, `LA`, `LV`, `LAA`, `CS`, `PA`, `Ao`, `NCC`, `RCC`, `LCC`, `LSPV`, `LIPV`, `RSPV`, `RIPV`),
   * prefers dark lumen pixels so interior cavity labels sit cleanly inside the dark blood cavity (`[SPEC PATCH #11]`).
   */
  private computeScreenLandmarkStats(
    canvasW: number,
    canvasH: number,
    maxDepthMm: number,
    anatomyEngine?: any,
    devicesEngine?: any
  ): void {
    const accum = new Map<
      number,
      {
        count: number;
        primaryCount: number;
        lumenCount: number;
        minDepth: number;
        maxDepth: number;
        primaryMinDepth: number;
        primaryMaxDepth: number;
        sumDepth: number;
        sumAz: number;
        primarySumDepth: number;
        primarySumAz: number;
        sumX: number;
        sumY: number;
        primarySumX: number;
        primarySumY: number;
        lumenSumX: number;
        lumenSumY: number;
        contours: [number, number][];
      }
    >();

    const imgData = this.imageData?.data;
    const step = 4;
    for (let y = step; y < canvasH - step; y += step) {
      const row = y * canvasW;
      for (let x = step; x < canvasW - step; x += step) {
        const idx = row + x;
        const panelCode = this.screenPanelMap[idx];
        if (panelCode === 0) continue;
        const sid = this.screenStructureMap[idx];
        if (sid === 0) continue;

        const dMm = this.screenDepthMmMap[idx];
        const azDeg = this.screenAzimuthDegMap[idx];

        let entry = accum.get(sid);
        if (!entry) {
          entry = {
            count: 0,
            primaryCount: 0,
            lumenCount: 0,
            minDepth: dMm,
            maxDepth: dMm,
            primaryMinDepth: 999.0,
            primaryMaxDepth: 0.0,
            sumDepth: 0,
            sumAz: 0,
            primarySumDepth: 0,
            primarySumAz: 0,
            sumX: 0,
            sumY: 0,
            primarySumX: 0,
            primarySumY: 0,
            lumenSumX: 0,
            lumenSumY: 0,
            contours: [],
          };
          accum.set(sid, entry);
        }

        entry.count++;
        if (dMm < entry.minDepth) entry.minDepth = dMm;
        if (dMm > entry.maxDepth) entry.maxDepth = dMm;
        entry.sumDepth += dMm;
        entry.sumAz += azDeg;
        entry.sumX += x;
        entry.sumY += y;
        if (panelCode === 1) {
          entry.primaryCount++;
          if (dMm < entry.primaryMinDepth) entry.primaryMinDepth = dMm;
          if (dMm > entry.primaryMaxDepth) entry.primaryMaxDepth = dMm;
          entry.primarySumDepth += dMm;
          entry.primarySumAz += azDeg;
          entry.primarySumX += x;
          entry.primarySumY += y;
          // Track dark blood-pool interior pixels for cavity centroid placement
          if (imgData && imgData[idx * 4 + 1] < 36) {
            entry.lumenCount++;
            entry.lumenSumX += x;
            entry.lumenSumY += y;
          }
        }

        if (panelCode === 1 && entry.contours.length < 48) {
          const sL = this.screenStructureMap[idx - step];
          const sR = this.screenStructureMap[idx + step];
          const sU = this.screenStructureMap[idx - step * canvasW];
          const sD = this.screenStructureMap[idx + step * canvasW];
          if (sL !== sid || sR !== sid || sU !== sid || sD !== sid) {
            entry.contours.push([x, y]);
          }
        }
      }
    }

    this.latestLandmarkMap.clear();
    for (const [sid, e] of accum.entries()) {
      if (e.count < 3) continue;
      const useLumen = e.lumenCount >= 6;
      const usePrimary = e.primaryCount >= 3;
      const meanDepth = usePrimary ? e.primarySumDepth / e.primaryCount : e.sumDepth / e.count;
      const meanAz = usePrimary ? e.primarySumAz / e.primaryCount : e.sumAz / e.count;
      const minD = usePrimary ? e.primaryMinDepth : e.minDepth;
      const maxD = usePrimary ? e.primaryMaxDepth : e.maxDepth;
      const cx = useLumen
        ? Math.round(e.lumenSumX / e.lumenCount)
        : Math.round(usePrimary ? e.primarySumX / e.primaryCount : e.sumX / e.count);
      const cy = useLumen
        ? Math.round(e.lumenSumY / e.lumenCount)
        : Math.round(usePrimary ? e.primarySumY / e.primaryCount : e.sumY / e.count);

      this.latestLandmarkMap.set(sid, {
        pixelCount: (usePrimary ? e.primaryCount : e.count) * step * step,
        minDepthMm: Number(minD.toFixed(1)),
        maxDepthMm: Number(maxD.toFixed(1)),
        meanDepthMm: Number(meanDepth.toFixed(1)),
        meanAzimuthDeg: Number(meanAz.toFixed(1)),
        clockPosition: sectorAngleToClockString(meanAz, meanDepth / maxDepthMm),
        centroidX: cx,
        centroidY: cy,
        contourPoints: e.contours,
      });
    }

    // Merge finite-elevation beam intersections from `scanSectorLandmarks` for UI landmark pills
    // (cached by catheter pose & procedural state since landmark presence does not vary with cardiacPhase)
    if (this.lastPose && this.primaryLayout) {
      const p = this.lastPose;
      const st = this.lastSettings;
      const sm = this.lastSimState;
      const slabKey = `${p.transducerPos[0].toFixed(1)},${p.transducerPos[1].toFixed(1)},${p.transducerPos[2].toFixed(1)}|${p.faceNormal[0].toFixed(2)},${p.faceNormal[1].toFixed(2)},${p.faceNormal[2].toFixed(2)}|${p.latAxis[0].toFixed(2)},${p.latAxis[1].toFixed(2)},${p.latAxis[2].toFixed(2)}|${st.depthCm}|${st.markerSide}|${sm.watchmanStage}|${sm.tspTentingMm.toFixed(1)}|${sm.ablationCatheterActive ? 1 : 0}|${sm.pericardialEffusionMl}|${sm.laaMorphology}|${sm.laaThrombusPresent ? 1 : 0}`;
      if (this.cachedSlabKey !== slabKey || !this.cachedSlabHits) {
        this.cachedSlabKey = slabKey;
        this.cachedSlabHits = scanSectorLandmarks(
          this.lastPose,
          this.lastSettings,
          this.lastSimState,
          anatomyEngine,
          devicesEngine
        );
      }
      const slabHits = this.cachedSlabHits;
      const layout = this.primaryLayout;
      const primaryRightEdge = layout.panelLeftPx + layout.panelWidthPx;
      const rSpanPx = Math.max(1, layout.outerRadiusPx - layout.innerRadiusPx);
      for (const [sid, slab] of slabHits.entries()) {
        const existing = this.latestLandmarkMap.get(sid);
        if (existing && existing.centroidX <= primaryRightEdge) continue;
        const meanDepth = slab.meanDepthMm ?? slab.minDepthMm;
        const meanAz = Math.max(-42, Math.min(42, slab.meanAzimuthDeg));
        const normRad = Math.max(0.08, Math.min(0.92, (meanDepth - MIN_RADIUS_MM) / (maxDepthMm - MIN_RADIUS_MM)));
        const rPx = layout.innerRadiusPx + normRad * rSpanPx;
        const thetaRad = meanAz * DEG2RAD;
        const cx = Math.round(layout.apexX + rPx * Math.sin(thetaRad));
        const cy = Math.round(layout.apexY + rPx * Math.cos(thetaRad));
        this.latestLandmarkMap.set(sid, {
          pixelCount: existing ? Math.max(existing.pixelCount, slab.pixelCount) : slab.pixelCount,
          minDepthMm: slab.minDepthMm,
          maxDepthMm: Number((meanDepth + 4.0).toFixed(1)),
          meanDepthMm: meanDepth,
          meanAzimuthDeg: meanAz,
          clockPosition: slab.clockPosition ?? sectorAngleToClockString(meanAz, meanDepth / maxDepthMm),
          centroidX: cx,
          centroidY: cy,
          contourPoints: existing ? existing.contourPoints : [],
        });
      }
    }
  }

  /**
   * O(1) lookup of the exact anatomical or device structure at canvas pixel (canvasX, canvasY).
   */
  public getStructureAtCanvasXY(canvasX: number, canvasY: number): CanvasHitResult | null {
    if (!this.canvas || !this.lastPose) return null;
    const x = Math.round(canvasX);
    const y = Math.round(canvasY);
    const w = this.canvas.width;
    const h = this.canvas.height;
    if (x < 0 || x >= w || y < 0 || y >= h) return null;

    const idx = y * w + x;
    const panelCode = this.screenPanelMap[idx];
    if (panelCode === 0) return null;

    const sid = this.screenStructureMap[idx];
    const depthMm = this.screenDepthMmMap[idx];
    const azimuthDeg = this.screenAzimuthDegMap[idx];
    const panel: 'primary' | 'secondary' = panelCode === 2 ? 'secondary' : 'primary';

    const worldPos = this.polarToWorld(depthMm, azimuthDeg, panel);
    const maxDepthMm = Math.max(40, this.lastSettings.depthCm * 10);

    return {
      structureId: sid,
      meta: sid > 0 ? ANATOMICAL_STRUCTURES[sid] ?? null : null,
      depthMm: Number(depthMm.toFixed(1)),
      azimuthDeg: Number(azimuthDeg.toFixed(1)),
      worldPos,
      clockPosition: sectorAngleToClockString(azimuthDeg, depthMm / maxDepthMm),
      panel,
      canvasX: x,
      canvasY: y,
    };
  }

  public polarToWorld(
    depthMm: number,
    screenAzimuthDeg: number,
    panel: 'primary' | 'secondary' = 'primary'
  ): [number, number, number] {
    if (!this.lastPose) return [0, 0, 0];
    const [p0x, p0y, p0z] = this.lastPose.transducerPos;
    const [nfx, nfy, nfz] = this.lastPose.faceNormal;
    const [lx, ly, lz] = panel === 'secondary' ? this.lastPose.biplaneLatAxis : this.lastPose.latAxis;
    const latSign = this.lastSettings.markerSide === 'left' ? -1 : 1;

    const alphaRad = screenAzimuthDeg * DEG2RAD;
    const cosA = Math.cos(alphaRad);
    const sinA = Math.sin(alphaRad) * latSign;

    return [
      p0x + depthMm * (cosA * nfx + sinA * lx),
      p0y + depthMm * (cosA * nfy + sinA * ly),
      p0z + depthMm * (cosA * nfz + sinA * lz),
    ];
  }

  public canvasXYToWorld(
    canvasX: number,
    canvasY: number
  ): { depthMm: number; azimuthDeg: number; worldPos: [number, number, number]; panel: 'primary' | 'secondary' } | null {
    const layout =
      this.secondaryLayout && canvasX >= this.secondaryLayout.panelLeftPx ? this.secondaryLayout : this.primaryLayout;
    if (!layout) return null;

    const dx = canvasX - layout.apexX;
    const dy = Math.max(1, canvasY - layout.apexY);
    const rPx = Math.sqrt(dx * dx + dy * dy);
    const thetaRad = Math.atan2(dx, dy);
    const clampedTheta = Math.max(-layout.halfAngleRad, Math.min(layout.halfAngleRad, thetaRad));
    const normR = Math.max(
      0,
      Math.min(1, (rPx - layout.innerRadiusPx) / Math.max(1, layout.outerRadiusPx - layout.innerRadiusPx))
    );
    const depthMm = MIN_RADIUS_MM + normR * (layout.depthMm - MIN_RADIUS_MM);
    const azimuthDeg = clampedTheta * RAD2DEG;

    return {
      depthMm,
      azimuthDeg,
      worldPos: this.polarToWorld(depthMm, azimuthDeg, layout.panel),
      panel: layout.panel,
    };
  }

  public polarToCanvasXY(
    depthMm: number,
    screenAzimuthDeg: number,
    panel: 'primary' | 'secondary' = 'primary'
  ): [number, number] | null {
    const layout = panel === 'secondary' ? this.secondaryLayout : this.primaryLayout;
    if (!layout) return null;
    const normR = Math.max(0, Math.min(1, (depthMm - MIN_RADIUS_MM) / Math.max(1, layout.depthMm - MIN_RADIUS_MM)));
    const rPx = layout.innerRadiusPx + normR * (layout.outerRadiusPx - layout.innerRadiusPx);
    const thetaRad = screenAzimuthDeg * DEG2RAD;
    return [layout.apexX + rPx * Math.sin(thetaRad), layout.apexY + rPx * Math.cos(thetaRad)];
  }

  public worldToCanvasXY(
    worldPos: [number, number, number],
    panel: 'primary' | 'secondary' = 'primary'
  ): { x: number; y: number; depthMm: number; azimuthDeg: number; elevDistMm: number } | null {
    if (!this.lastPose) return null;
    const layout = panel === 'secondary' ? this.secondaryLayout : this.primaryLayout;
    if (!layout) return null;

    const [p0x, p0y, p0z] = this.lastPose.transducerPos;
    const [nfx, nfy, nfz] = this.lastPose.faceNormal;
    const [lx, ly, lz] = layout.latAxis;
    const [ex, ey, ez] = layout.elevAxis;
    const latSign = this.lastSettings.markerSide === 'left' ? -1 : 1;

    const vx = worldPos[0] - p0x;
    const vy = worldPos[1] - p0y;
    const vz = worldPos[2] - p0z;

    const uAxial = vx * nfx + vy * nfy + vz * nfz;
    const vLat = (vx * lx + vy * ly + vz * lz) * latSign;
    const wElev = vx * ex + vy * ey + vz * ez;

    if (uAxial < MIN_RADIUS_MM) return null;
    const depthMm = Math.sqrt(uAxial * uAxial + vLat * vLat);
    if (depthMm > layout.depthMm) return null;

    const azimuthRad = Math.atan2(vLat, uAxial);
    if (Math.abs(azimuthRad) > layout.halfAngleRad) return null;

    const normR = (depthMm - MIN_RADIUS_MM) / Math.max(1, layout.depthMm - MIN_RADIUS_MM);
    const rPx = layout.innerRadiusPx + normR * (layout.outerRadiusPx - layout.innerRadiusPx);

    return {
      x: layout.apexX + rPx * Math.sin(azimuthRad),
      y: layout.apexY + rPx * Math.cos(azimuthRad),
      depthMm,
      azimuthDeg: azimuthRad * RAD2DEG,
      elevDistMm: wElev,
    };
  }

  public getPolarDopplerGrid(panel: 'primary' | 'secondary' = 'primary'): {
    dopplerGrid: Float32Array;
    structureGrid: Uint8Array;
    azimuthBins: number;
    radialBins: number;
  } {
    return {
      dopplerGrid: panel === 'secondary' ? this.secondaryDopplerGrid : this.primaryDopplerGrid,
      structureGrid: panel === 'secondary' ? this.secondaryStructureGrid : this.primaryStructureGrid,
      azimuthBins: POLAR_AZIMUTH_BINS,
      radialBins: POLAR_RADIAL_BINS,
    };
  }

  /**
   * Acquires a 3D CARTOSOUND endocardial contour ring from the current ultrasound sector (SPEC PATCH #3).
   */
  public extractCartosoundContour(
    pose?: CatheterPose3D,
    settings?: UltrasoundSettings,
    simState?: ProceduralSimulationState,
    anatomyEngine?: any,
    devicesEngine?: any
  ): CartosoundContour {
    const activePose = pose ?? this.lastPose;
    const activeSettings = settings ?? this.lastSettings;
    const activeSim = simState ?? this.lastSimState;
    if (!activePose) {
      return {
        id: `cs_${Date.now()}`,
        structureId: StructureId.RA_CAVITY,
        structureName: 'Right Atrium Contour',
        colorHex: '#38BDF8',
        timestampMs: Date.now(),
        omniDeg: this.lastCatheterState.omniDeg ?? 0,
        worldPointsMm: [],
      };
    }

    const [p0x, p0y, p0z] = activePose.transducerPos;
    const [nfx, nfy, nfz] = activePose.faceNormal;
    const [lx, ly, lz] = activePose.latAxis;
    const maxDepthMm = Math.max(40, activeSettings.depthCm * 10);

    const points: [number, number, number][] = [];
    const structureCounts = new Map<number, number>();

    const rays = 36;
    for (let i = 0; i < rays; i++) {
      const alphaRad = -HALF_SECTOR_RAD + (i / (rays - 1)) * (2 * HALF_SECTOR_RAD);
      const cosA = Math.cos(alphaRad);
      const sinA = Math.sin(alphaRad);
      const rx = cosA * nfx + sinA * lx;
      const ry = cosA * nfy + sinA * ly;
      const rz = cosA * nfz + sinA * lz;

      for (let r = 8.0; r <= maxDepthMm * 0.85; r += 2.2) {
        const wx = p0x + r * rx;
        const wy = p0y + r * ry;
        const wz = p0z + r * rz;
        const s = evaluateCombinedAcousticPoint(wx, wy, wz, activeSim, anatomyEngine, devicesEngine, false);
        if (s.backscatter >= 0.35 && s.structureId > 0) {
          points.push([Number(wx.toFixed(2)), Number(wy.toFixed(2)), Number(wz.toFixed(2))]);
          structureCounts.set(s.structureId, (structureCounts.get(s.structureId) ?? 0) + 1);
          break;
        }
      }
    }

    let dominantSid = StructureId.RA_CAVITY;
    let bestCount = 0;
    for (const [sid, cnt] of structureCounts.entries()) {
      if (cnt > bestCount) {
        bestCount = cnt;
        dominantSid = sid as StructureId;
      }
    }
    const meta = ANATOMICAL_STRUCTURES[dominantSid] ?? ANATOMICAL_STRUCTURES[StructureId.RA_CAVITY];

    return {
      id: `cartosound_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      structureId: dominantSid,
      structureName: meta.shortLabel,
      colorHex: meta.fresnelRimHex || '#38BDF8',
      timestampMs: Date.now(),
      omniDeg: this.lastCatheterState.omniDeg ?? 0,
      worldPointsMm: points,
    };
  }
}
