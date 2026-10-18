import * as THREE from 'three';
import {
  ANATOMICAL_STRUCTURES,
  AcousticSamplePoint,
  CatheterState,
  DEFAULT_PROCEDURAL_SIMULATION_STATE,
  PassCriteriaStatus,
  ProceduralSimulationState,
  StructureId,
  WatchmanStageId,
} from '../types/sharedContracts';

export type WatchmanDeviceSizeMm = 20 | 24 | 27 | 31 | 35 | 40;
export type WatchmanDeploymentStage = WatchmanStageId;

export interface WatchmanFlxSizingSpec {
  deviceSizeMm: WatchmanDeviceSizeMm;
  minOstiumMm: number;
  maxOstiumMm: number;
  minRequiredDepthMm: number;
  optimalCompressedMinMm: number;
  optimalCompressedMaxMm: number;
  nitinolStrutCount: number;
  generation: 'Watchman FLX' | 'Watchman FLX Pro';
}

/**
 * Official Boston Scientific Watchman FLX & Watchman FLX Pro Sizing Matrix
 * (`20, 24, 27, 31, 35 mm` FLX + `40 mm` FLX Pro) with `10%–30%` target compression.
 */
export const WATCHMAN_FLX_SIZING_CHART: Record<WatchmanDeviceSizeMm, WatchmanFlxSizingSpec> = {
  20: {
    deviceSizeMm: 20,
    minOstiumMm: 14.0,
    maxOstiumMm: 18.0,
    minRequiredDepthMm: 10.0,
    optimalCompressedMinMm: 14.0,
    optimalCompressedMaxMm: 18.0,
    nitinolStrutCount: 18,
    generation: 'Watchman FLX',
  },
  24: {
    deviceSizeMm: 24,
    minOstiumMm: 16.8,
    maxOstiumMm: 21.6,
    minRequiredDepthMm: 12.0,
    optimalCompressedMinMm: 16.8,
    optimalCompressedMaxMm: 21.6,
    nitinolStrutCount: 18,
    generation: 'Watchman FLX',
  },
  27: {
    deviceSizeMm: 27,
    minOstiumMm: 18.9,
    maxOstiumMm: 24.3,
    minRequiredDepthMm: 13.5,
    optimalCompressedMinMm: 18.9,
    optimalCompressedMaxMm: 24.3,
    nitinolStrutCount: 18,
    generation: 'Watchman FLX',
  },
  31: {
    deviceSizeMm: 31,
    minOstiumMm: 21.7,
    maxOstiumMm: 27.9,
    minRequiredDepthMm: 15.5,
    optimalCompressedMinMm: 21.7,
    optimalCompressedMaxMm: 27.9,
    nitinolStrutCount: 18,
    generation: 'Watchman FLX',
  },
  35: {
    deviceSizeMm: 35,
    minOstiumMm: 24.5,
    maxOstiumMm: 31.5,
    minRequiredDepthMm: 17.5,
    optimalCompressedMinMm: 24.5,
    optimalCompressedMaxMm: 31.5,
    nitinolStrutCount: 18,
    generation: 'Watchman FLX',
  },
  40: {
    deviceSizeMm: 40,
    minOstiumMm: 28.0,
    maxOstiumMm: 36.0,
    minRequiredDepthMm: 20.0,
    optimalCompressedMinMm: 28.0,
    optimalCompressedMaxMm: 36.0,
    nitinolStrutCount: 18,
    generation: 'Watchman FLX Pro',
  },
};

/**
 * Recommends the optimal Watchman FLX / FLX Pro device size (`20..40 mm`) for a measured
 * maximum LAA landing zone diameter (`mm` across `0°, 45°, 90°, 135°`).
 */
export function getRecommendedWatchmanSize(
  maxLandingZoneDiameterMm: number
): WatchmanFlxSizingSpec {
  const sizes: WatchmanDeviceSizeMm[] = [20, 24, 27, 31, 35, 40];
  for (const sz of sizes) {
    const spec = WATCHMAN_FLX_SIZING_CHART[sz];
    const nominalFor20PctCompression = maxLandingZoneDiameterMm / 0.81;
    if (sz >= nominalFor20PctCompression && maxLandingZoneDiameterMm >= spec.minOstiumMm) {
      return spec;
    }
  }
  return WATCHMAN_FLX_SIZING_CHART[40];
}

/**
 * Computes the effective Watchman FLX shoulder compression percentage (`%`) and residual
 * peri-device leak jet (`mm`) based on the patient's LAA landing zone (`21.6 mm` nominal)
 * and the selected `watchmanSizeMm` (or optional explicit overrides).
 */
function resolveWatchmanBiomechanics(simState: ProceduralSimulationState): {
  compressionPct: number;
  maxLeakJetMm: number;
  measuredDiametersMm: { deg0: number; deg45: number; deg90: number; deg135: number };
} {
  const extState = simState as ProceduralSimulationState & {
    watchmanCompressionPct?: number;
    watchmanPeriLeakMm?: number;
  };

  // Patient's native LAA landing zone spans ~20.4 x 21.8 mm (optimal for 27 mm Watchman FLX at ~20% compression)
  const nativeOstiumMm = 21.6;
  const rawCompPct =
    extState.watchmanCompressionPct ??
    Math.max(0.0, Math.min(42.0, ((simState.watchmanSizeMm - nativeOstiumMm) / simState.watchmanSizeMm) * 100.0));
  const compressionPct = Math.round(rawCompPct * 10.0) / 10.0;

  const meanCompressedMm = simState.watchmanSizeMm * (1.0 - compressionPct / 100.0);
  const measuredDiametersMm = {
    deg0: +(meanCompressedMm - 0.3).toFixed(1),
    deg45: +(meanCompressedMm - 0.1).toFixed(1),
    deg90: +(meanCompressedMm + 0.2).toFixed(1),
    deg135: +(meanCompressedMm + 0.4).toFixed(1),
  };

  // Undersized device (20 mm on a 21.6 mm ostium) leaves a 3.4 mm peri-device leak jet
  const defaultLeakMm =
    simState.watchmanSizeMm === 20 ? 3.4 : simState.watchmanSizeMm === 24 ? 0.8 : 0.0;
  const maxLeakJetMm = extState.watchmanPeriLeakMm ?? defaultLeakMm;

  return {
    compressionPct,
    maxLeakJetMm,
    measuredDiametersMm,
  };
}

/**
 * Evaluates the 4 Watchman FLX **PASS Release Criteria** (`Position`, `Anchor`, `Size`, `Seal`)
 * for the current `ProceduralSimulationState` and `CatheterState`.
 */
export function computeWatchmanPassCriteria(
  simState: ProceduralSimulationState,
  _catheterState?: CatheterState
): PassCriteriaStatus {
  const spec = WATCHMAN_FLX_SIZING_CHART[simState.watchmanSizeMm] ?? WATCHMAN_FLX_SIZING_CHART[27];
  const isDeployedOrReleased =
    simState.watchmanStage === 'full_deployed' || simState.watchmanStage === 'released';
  const isPartiallyDeployed =
    simState.watchmanStage === 'flx_ball' || simState.watchmanStage === 'triangle';

  const { compressionPct, maxLeakJetMm, measuredDiametersMm } =
    resolveWatchmanBiomechanics(simState);

  // 1. POSITION: Device shoulder at or slightly distal to the LAA ostial plane
  // (between Coumadin ridge superiorly and LCx artery inferiorly), protrusion <= 4.0 mm
  const shoulderProtrusionMm = isDeployedOrReleased ? 2.1 : isPartiallyDeployed ? 5.8 : 0.0;
  const positionPass =
    isDeployedOrReleased && !simState.laaThrombusPresent && shoulderProtrusionMm <= 4.5;
  const positionDetail = simState.laaThrombusPresent
    ? 'CONTRAINDICATED: LAA Thrombus present — abort Watchman deployment'
    : !isDeployedOrReleased
      ? `Stage: ${simState.watchmanStage.replace('_', ' ').toUpperCase()} — advance to Full Deployed to verify ostial plane`
      : `PASS: Device shoulder aligned at LAA ostial plane (${shoulderProtrusionMm.toFixed(1)} mm protrusion; LCx clear)`;

  // 2. ANCHOR: 18 J-shaped fixation anchors engaged + Tug Test elastic recoil verification
  const anchorPass =
    isDeployedOrReleased && compressionPct >= 10.0 && !simState.laaThrombusPresent;
  const anchorDetail = !isDeployedOrReleased
    ? 'Awaiting full 18-strut deployment prior to interactive Tug Test'
    : simState.watchmanTugActive
      ? 'PASS (TUG ACTIVE): 1.4 mm elastic LAA wall recoil confirmed — zero device migration'
      : 'PASS: 18 fixation rows engaged in LAA landing zone; stable on retraction tug';

  // 3. SIZE: Shoulder compression 10% - 30% of uncompressed device diameter across 0/45/90/135 deg
  const compressedMm = measuredDiametersMm.deg135;
  const sizePass = isDeployedOrReleased && compressionPct >= 10.0 && compressionPct <= 30.0;
  const sizeDetail = !isDeployedOrReleased
    ? `Selected ${spec.deviceSizeMm} mm ${spec.generation} (${spec.minOstiumMm}–${spec.maxOstiumMm} mm ostium)`
    : compressionPct < 10.0
      ? `FAIL (UNDERSIZED): ${compressionPct.toFixed(0)}% compression (${compressedMm.toFixed(1)} mm) < 10% minimum — risk of embolization`
      : compressionPct > 30.0
        ? `FAIL (OVERSIZED): ${compressionPct.toFixed(0)}% compression (${compressedMm.toFixed(1)} mm) > 30% maximum — shoulder crowning`
        : `PASS: ${compressionPct.toFixed(0)}% shoulder compression (${compressedMm.toFixed(1)} / ${spec.deviceSizeMm} mm within 10%–30% FLX target)`;

  // 4. SEAL: Color Doppler peri-device leak < 3.0 mm across 0, 45, 90, 135 deg
  const sealPass = isDeployedOrReleased && maxLeakJetMm < 3.0;
  const sealDetail = !isDeployedOrReleased
    ? 'Enable Color Doppler after full deployment to assess peri-device leak'
    : maxLeakJetMm <= 0.1
      ? 'PASS: Complete ostial seal (0.0 mm residual peri-device jet across 0°/45°/90°/135°)'
      : maxLeakJetMm < 3.0
        ? `PASS (MINOR JET): ${maxLeakJetMm.toFixed(1)} mm peri-device jet (< 3.0 mm clinical threshold)`
        : `FAIL (SIGNIFICANT LEAK): ${maxLeakJetMm.toFixed(1)} mm peri-device Color Doppler jet (>= 3.0 mm) — recapture & reposition`;

  const allPassed = positionPass && anchorPass && sizePass && sealPass;

  return {
    positionPass,
    positionDetail,
    anchorPass,
    anchorDetail,
    sizePass,
    compressionPct,
    measuredDiametersMm,
    sizeDetail,
    sealPass,
    maxLeakJetMm,
    sealDetail,
    allPassed,
  };
}

export interface TransseptalSafetyStatus {
  safe: boolean;
  heightClassification: 'low_inferior' | 'optimal_watchman' | 'optimal_pvi' | 'high_superior_warning';
  apClassification: 'safe_posterior' | 'neutral_mid' | 'danger_aortic_root';
  tentingClassification: 'none' | 'light_contact' | 'optimal_tenting' | 'excessive_tenting_warning';
  headline: string;
  clinicalAdvisory: string;
}

/**
 * Evaluates Biplane Transseptal Puncture (TSP) safety metrics on the Fossa Ovalis:
 * - Long-axis height above Mitral Valve annulus (`tspHeightAboveMvMm`)
 * - Short-axis Anterior-Posterior offset (`tspApOffsetMm`) relative to the Aortic Root (`NCC`)
 * - Septal tenting depth (`tspTentingMm`) into the Left Atrium
 */
export function evaluateTransseptalSafety(
  simState: ProceduralSimulationState
): TransseptalSafetyStatus {
  const h = simState.tspHeightAboveMvMm;
  const ap = simState.tspApOffsetMm;
  const tent = simState.tspTentingMm;

  const heightClassification: TransseptalSafetyStatus['heightClassification'] =
    h < 32.0
      ? 'low_inferior'
      : h <= 43.0
        ? 'optimal_watchman'
        : h <= 50.0
          ? 'optimal_pvi'
          : 'high_superior_warning';

  const apClassification: TransseptalSafetyStatus['apClassification'] =
    ap > 2.0 ? 'danger_aortic_root' : ap <= -1.0 ? 'safe_posterior' : 'neutral_mid';

  const tentingClassification: TransseptalSafetyStatus['tentingClassification'] =
    tent <= 0.2
      ? 'none'
      : tent < 3.5
        ? 'light_contact'
        : tent <= 9.5
          ? 'optimal_tenting'
          : 'excessive_tenting_warning';

  const safe =
    apClassification !== 'danger_aortic_root' &&
    heightClassification !== 'high_superior_warning' &&
    tentingClassification !== 'excessive_tenting_warning';

  let headline = 'Optimal Inferoposterior Fossa Ovalis Trajectory';
  let clinicalAdvisory =
    `Height ${h.toFixed(0)} mm above MV annulus, AP offset ${ap.toFixed(1)} mm (posterior to Aortic NCC), ` +
    `tenting ${tent.toFixed(1)} mm into LA cavity.`;

  if (apClassification === 'danger_aortic_root') {
    headline = 'DANGER: Anterior Trajectory Toward Aortic Root (NCC)';
    clinicalAdvisory =
      `AP offset +${ap.toFixed(1)} mm points toward the Non-Coronary Cusp. Apply clockwise torque ` +
      `to redirect needle posteriorly into the muscular-free Fossa Ovalis.`;
  } else if (heightClassification === 'high_superior_warning') {
    headline = 'WARNING: High Superior Septal Position Near LA Roof';
    clinicalAdvisory =
      `Height ${h.toFixed(0)} mm above MV (> 50 mm) approaches the superior muscular limbus and RPA.`;
  } else if (tentingClassification === 'excessive_tenting_warning') {
    headline = 'WARNING: Deep Septal Tenting (> 9.5 mm) — Guard LA Free Wall';
    clinicalAdvisory =
      `Tenting ${tent.toFixed(1)} mm reduces clearance to the posterior/lateral LA wall upon needle pop-through.`;
  }

  return {
    safe,
    heightClassification,
    apClassification,
    tentingClassification,
    headline,
    clinicalAdvisory,
  };
}

/**
 * Computes the 3D World coordinates (`mm`) of the Transseptal Needle Tip on the Fossa Ovalis
 * given the current `ProceduralSimulationState`.
 */
export function computeTransseptalApexWorldMm(
  simState: ProceduralSimulationState
): [number, number, number] {
  const tent = simState.tspTentingMm;
  const x = 12.2 + tent * 0.78;
  const y = 5.5 + (simState.tspHeightAboveMvMm - 42.0) * 0.35;
  const z = -4.0 - tent * 0.62 + simState.tspApOffsetMm * 0.5;
  return [x, y, z];
}

/**
 * Signed distance from point `(wx, wy, wz)` to a 3D line segment `[ax,ay,az] -> [bx,by,bz]` with radius `r`.
 */
function sdCapsule(
  wx: number,
  wy: number,
  wz: number,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  r: number
): number {
  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const abLenSq = abx * abx + aby * aby + abz * abz;
  let t = 0.0;
  if (abLenSq > 1e-6) {
    t = ((wx - ax) * abx + (wy - ay) * aby + (wz - az) * abz) / abLenSq;
    if (t < 0.0) t = 0.0;
    else if (t > 1.0) t = 1.0;
  }
  const dx = wx - (ax + t * abx);
  const dy = wy - (ay + t * aby);
  const dz = wz - (az + t * abz);
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - r;
}

/**
 * Pure CPU Acoustic & Signed-Distance Evaluator for all 3 Procedural Devices:
 * - `StructureId.WATCHMAN_FLX_DEVICE` (`40`)
 * - `StructureId.TRANSSEPTAL_NEEDLE_SHEATH` (`41`)
 * - `StructureId.ABLATION_CATHETER_TIP` (`42`)
 *
 * Called directly by `UltrasoundSlicerEngine.evaluateCombinedAcousticPoint` and headless verification tests.
 */
export function evaluateProceduralDevicesAcousticPoint(
  worldX: number,
  worldY: number,
  worldZ: number,
  simState: ProceduralSimulationState = DEFAULT_PROCEDURAL_SIMULATION_STATE
): AcousticSamplePoint | null {
  // 1. Watchman FLX LAA Occlusion Device (StructureId 40)
  if (simState.watchmanStage !== 'none') {
    const { compressionPct, maxLeakJetMm } = resolveWatchmanBiomechanics(simState);
    const tugShift = simState.watchmanTugActive ? -1.8 : 0.0;
    const centerX = 52.0 + tugShift * 0.74;
    const centerY = 28.5 + tugShift * 0.52;
    const centerZ = 2.0 + tugShift * 0.42;

    const dx = worldX - centerX;
    const dy = worldY - centerY;
    const dz = worldZ - centerZ;
    const distCenter = Math.sqrt(dx * dx + dy * dy + dz * dz);

    let rOuter = simState.watchmanSizeMm * 0.38;
    if (simState.watchmanStage === 'sheath_across') {
      rOuter = 4.6;
    } else if (simState.watchmanStage === 'flx_ball') {
      rOuter = 6.2;
    } else if (simState.watchmanStage === 'triangle') {
      rOuter = simState.watchmanSizeMm * 0.28;
    } else {
      const compScale = 1.0 - (compressionPct - 20.0) * 0.004;
      rOuter = simState.watchmanSizeMm * 0.38 * compScale;
    }

    // Evaluate Nitinol hemispherical cage shell + proximal threaded screw hub + delivery sheath across LA
    const shellDist = Math.abs(distCenter - rOuter * 0.78) - 2.6;
    const hubDist = distCenter - 3.2;

    let sheathDist = 999.0;
    if (simState.watchmanStage !== 'released') {
      sheathDist = sdCapsule(
        worldX,
        worldY,
        worldZ,
        14.0,
        7.0,
        -4.0,
        centerX - 3.0,
        centerY - 2.0,
        centerZ - 1.0,
        2.3
      );
    }

    const minWatchmanSdf = Math.min(shellDist, hubDist, sheathDist);
    if (minWatchmanSdf <= 0.0) {
      const meta = ANATOMICAL_STRUCTURES[StructureId.WATCHMAN_FLX_DEVICE];
      let flowVec: [number, number, number] = [0, 0, 0];
      if (maxLeakJetMm > 0.2 && dy < -rOuter * 0.45) {
        flowVec = [-65.0, -35.0, 20.0];
      }
      return {
        impedanceMRayl: meta.impedanceMRayl,
        backscatter: meta.backscatter,
        attenuationDbCmMhz: meta.attenuationDbCmMhz,
        structureId: StructureId.WATCHMAN_FLX_DEVICE,
        borderGradient: 0.98,
        signedDistanceMm: minWatchmanSdf,
        flowVelocityCmPerSec: flowVec,
      };
    }
  }

  // 2. Transseptal Puncture Sheath & Brockenbrough Needle (StructureId 41)
  if (simState.tspTentingMm > 0) {
    const [ax, ay, az] = computeTransseptalApexWorldMm(simState);
    const needleSdf = sdCapsule(worldX, worldY, worldZ, 3.5, -18.0, -2.0, ax, ay, az, 2.6);
    if (needleSdf <= 0.0) {
      const meta = ANATOMICAL_STRUCTURES[StructureId.TRANSSEPTAL_NEEDLE_SHEATH];
      return {
        impedanceMRayl: meta.impedanceMRayl,
        backscatter: meta.backscatter,
        attenuationDbCmMhz: meta.attenuationDbCmMhz,
        structureId: StructureId.TRANSSEPTAL_NEEDLE_SHEATH,
        borderGradient: 0.97,
        signedDistanceMm: needleSdf,
        flowVelocityCmPerSec: [0, 0, 0],
      };
    }
  }

  // 3. Irrigated RF Ablation Catheter Tip (StructureId 42)
  if (simState.ablationCatheterActive) {
    const targetId = simState.ablationTargetStructureId ?? StructureId.CTI_FLOOR;
    const targetMeta =
      ANATOMICAL_STRUCTURES[targetId] ?? ANATOMICAL_STRUCTURES[StructureId.CTI_FLOOR];
    const [tx, ty, tz] = targetMeta.worldCentroidMm;
    const ablSdf = sdCapsule(
      worldX,
      worldY,
      worldZ,
      tx - 5.5,
      ty - 6.0,
      tz - 3.5,
      tx,
      ty,
      tz,
      4.2
    );
    if (ablSdf <= 0.0) {
      const meta = ANATOMICAL_STRUCTURES[StructureId.ABLATION_CATHETER_TIP];
      return {
        impedanceMRayl: meta.impedanceMRayl,
        backscatter: meta.backscatter,
        attenuationDbCmMhz: meta.attenuationDbCmMhz,
        structureId: StructureId.ABLATION_CATHETER_TIP,
        borderGradient: 0.99,
        signedDistanceMm: ablSdf,
        flowVelocityCmPerSec: [0, 0, 0],
      };
    }
  }

  return null;
}

/**
 * 3D Procedural Devices Engine (`renderOrder = 1`, `depthWrite = true`)
 *
 * Manages both the 3D WebGL surgical meshes and the real-time CPU acoustic SDF evaluation for:
 * 1. Transseptal Puncture (TSP) Sheath & Brockenbrough Needle (`StructureId = 41`)
 * 2. 18-Strut Watchman FLX & FLX Pro LAA Occlusion Device (`20..40 mm`, `StructureId = 40`)
 *    across all 6 deployment stages (`none`, `sheath_across`, `flx_ball`, `triangle`, `full_deployed`, `released`)
 *    with interactive Tug Test recoil
 * 3. Zero-Fluoro Irrigated RF Ablation Catheter (`ThermoCool SmartTouch SF`, `StructureId = 42`)
 */
export class ProceduralDevicesEngine {
  public readonly rootGroup: THREE.Group;
  public readonly tspGroup: THREE.Group;
  public readonly watchmanGroup: THREE.Group;
  public readonly ablationGroup: THREE.Group;

  private currentSimState: ProceduralSimulationState;

  // Reusable Three.js surgical device materials (`renderOrder = 1`, `depthWrite = true`)
  private readonly tspSheathMat: THREE.MeshPhysicalMaterial;
  private readonly needleMetalMat: THREE.MeshPhysicalMaterial;
  private readonly nitinolStrutMat: THREE.MeshPhysicalMaterial;
  private readonly eptfeFabricMat: THREE.MeshPhysicalMaterial;
  private readonly deliverySheathMat: THREE.MeshPhysicalMaterial;
  private readonly ablationShaftMat: THREE.MeshPhysicalMaterial;
  private readonly ablationGoldTipMat: THREE.MeshPhysicalMaterial;
  private readonly safeHaloMat: THREE.MeshBasicMaterial;
  private readonly dangerHaloMat: THREE.MeshBasicMaterial;

  constructor(
    sceneOrParent?: THREE.Object3D,
    initialState: ProceduralSimulationState = DEFAULT_PROCEDURAL_SIMULATION_STATE
  ) {
    this.rootGroup = new THREE.Group();
    this.rootGroup.name = 'ProceduralDevicesRoot';

    this.tspGroup = new THREE.Group();
    this.tspGroup.name = 'TransseptalNeedleSheathGroup';

    this.watchmanGroup = new THREE.Group();
    this.watchmanGroup.name = 'WatchmanFlxDeviceGroup';

    this.ablationGroup = new THREE.Group();
    this.ablationGroup.name = 'AblationCatheterGroup';

    this.rootGroup.add(this.tspGroup);
    this.rootGroup.add(this.watchmanGroup);
    this.rootGroup.add(this.ablationGroup);

    if (sceneOrParent) {
      sceneOrParent.add(this.rootGroup);
    }

    this.currentSimState = { ...initialState };

    this.tspSheathMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#0284C7'),
      roughness: 0.28,
      metalness: 0.22,
      clearcoat: 0.65,
    });

    this.needleMetalMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#F8FAFC'),
      emissive: new THREE.Color('#38BDF8'),
      emissiveIntensity: 0.16,
      roughness: 0.14,
      metalness: 0.94,
    });

    this.nitinolStrutMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#E2E8F0'),
      emissive: new THREE.Color('#94A3B8'),
      emissiveIntensity: 0.15,
      roughness: 0.18,
      metalness: 0.90,
      clearcoat: 0.5,
    });

    this.eptfeFabricMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#F8FAFC'),
      emissive: new THREE.Color('#E2E8F0'),
      emissiveIntensity: 0.1,
      roughness: 0.55,
      metalness: 0.05,
      transparent: true,
      opacity: 0.82,
      depthWrite: true,
      side: THREE.DoubleSide,
    });

    this.deliverySheathMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#0F172A'),
      roughness: 0.32,
      metalness: 0.25,
      clearcoat: 0.6,
    });

    this.ablationShaftMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#1E3A8A'),
      roughness: 0.3,
      metalness: 0.2,
      clearcoat: 0.65,
    });

    this.ablationGoldTipMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#F59E0B'),
      emissive: new THREE.Color('#D97706'),
      emissiveIntensity: 0.28,
      roughness: 0.16,
      metalness: 0.92,
    });

    this.safeHaloMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#10B981'),
      transparent: true,
      opacity: 0.75,
      side: THREE.DoubleSide,
    });

    this.dangerHaloMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#EF4444'),
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
    });

    this.syncState(this.currentSimState);
  }

  /**
   * Primary acoustic SDF query method invoked by `UltrasoundSlicerEngine`.
   */
  public evaluateAcousticPoint(
    worldX: number,
    worldY: number,
    worldZ: number,
    simState: ProceduralSimulationState = this.currentSimState
  ): AcousticSamplePoint | null {
    return evaluateProceduralDevicesAcousticPoint(worldX, worldY, worldZ, simState);
  }

  /**
   * Alias for `evaluateAcousticPoint` supported by `UltrasoundSlicerEngine` duck-typing.
   */
  public evaluateDeviceAcousticPoint(
    worldX: number,
    worldY: number,
    worldZ: number,
    simState: ProceduralSimulationState = this.currentSimState
  ): AcousticSamplePoint | null {
    return evaluateProceduralDevicesAcousticPoint(worldX, worldY, worldZ, simState);
  }

  /**
   * Alias for `evaluateAcousticPoint` supported by `UltrasoundSlicerEngine` duck-typing.
   */
  public sampleAcousticPoint(
    worldX: number,
    worldY: number,
    worldZ: number,
    simState: ProceduralSimulationState = this.currentSimState
  ): AcousticSamplePoint | null {
    return evaluateProceduralDevicesAcousticPoint(worldX, worldY, worldZ, simState);
  }

  public getPassCriteria(catheterState?: CatheterState): PassCriteriaStatus {
    return computeWatchmanPassCriteria(this.currentSimState, catheterState);
  }

  public getTransseptalSafety(): TransseptalSafetyStatus {
    return evaluateTransseptalSafety(this.currentSimState);
  }

  /**
   * Synchronizes all 3D procedural device meshes (`renderOrder = 1`) with `simState`.
   */
  public syncState(simState: ProceduralSimulationState): void {
    this.currentSimState = { ...simState };
    this.rebuildTspMeshes(simState);
    this.rebuildWatchmanMeshes(simState);
    this.rebuildAblationMeshes(simState);
  }

  /**
   * Alias for `syncState` so caller modules can invoke either `syncState` or `updateDevices`.
   */
  public updateDevices(simState: ProceduralSimulationState): void {
    this.syncState(simState);
  }

  // ==========================================================================
  // 1. Transseptal Puncture (TSP) Sheath & Brockenbrough Needle Meshes
  // ==========================================================================
  private rebuildTspMeshes(simState: ProceduralSimulationState): void {
    this.clearGroupGeometry(this.tspGroup);

    if (simState.tspTentingMm <= 0.05 && simState.watchmanStage === 'none') {
      return;
    }

    const [ax, ay, az] = computeTransseptalApexWorldMm(simState);
    const safety = evaluateTransseptalSafety(simState);

    const curvePts = [
      new THREE.Vector3(-1.5, -95.0, -5.0),
      new THREE.Vector3(1.5, -42.0, -3.5),
      new THREE.Vector3(5.5, -10.0, -3.5),
      new THREE.Vector3(ax - 2.2, ay - 1.2, az + 1.0),
    ];
    const sheathCurve = new THREE.CatmullRomCurve3(curvePts);
    const sheathGeo = new THREE.TubeGeometry(sheathCurve, 28, 1.45, 14, false);
    const sheathMesh = new THREE.Mesh(sheathGeo, this.tspSheathMat);
    sheathMesh.renderOrder = 1;
    sheathMesh.name = 'TSP_SteerableSheath';
    sheathMesh.userData = { structureId: StructureId.TRANSSEPTAL_NEEDLE_SHEATH };
    this.tspGroup.add(sheathMesh);

    // Exposed Brushed Stainless Steel Brockenbrough Needle Tip at the Fossa Ovalis tenting apex
    const tipStart = curvePts[curvePts.length - 1];
    const tipEnd = new THREE.Vector3(ax, ay, az);
    const needleDir = new THREE.Vector3().subVectors(tipEnd, tipStart).normalize();
    const needleLen = Math.max(3.5, tipStart.distanceTo(tipEnd));

    const needleGeo = new THREE.ConeGeometry(0.85, needleLen, 16);
    const needleMesh = new THREE.Mesh(needleGeo, this.needleMetalMat);
    needleMesh.position.copy(tipStart).addScaledVector(needleDir, needleLen * 0.5);
    needleMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), needleDir);
    needleMesh.renderOrder = 1;
    needleMesh.name = 'TSP_BrockenbroughNeedleTip';
    needleMesh.userData = { structureId: StructureId.TRANSSEPTAL_NEEDLE_SHEATH };
    this.tspGroup.add(needleMesh);

    // Safety Target Ring on Fossa Ovalis (Emerald if safe posterior, Red if anterior toward AoV NCC)
    const ringGeo = new THREE.RingGeometry(2.4, 3.4, 24);
    const ringMesh = new THREE.Mesh(
      ringGeo,
      safety.safe ? this.safeHaloMat : this.dangerHaloMat
    );
    ringMesh.position.copy(tipEnd);
    ringMesh.lookAt(tipEnd.clone().add(needleDir));
    ringMesh.renderOrder = 2;
    ringMesh.name = 'TSP_TrajectorySafetyHalo';
    this.tspGroup.add(ringMesh);
  }

  // ==========================================================================
  // 2. 18-Strut Watchman FLX & FLX Pro LAA Occlusion Device Meshes
  // ==========================================================================
  private rebuildWatchmanMeshes(simState: ProceduralSimulationState): void {
    this.clearGroupGeometry(this.watchmanGroup);

    const stage: WatchmanStageId = simState.watchmanStage;
    if (stage === 'none') {
      return;
    }

    const { compressionPct } = resolveWatchmanBiomechanics(simState);
    const tugOffset = simState.watchmanTugActive ? -1.8 : 0.0;
    const uAxis = new THREE.Vector3(0.74, 0.52, 0.42).normalize();
    const ostiumCenter = new THREE.Vector3(52.0, 28.5, 2.0).addScaledVector(uAxis, tugOffset);

    // 14F FXD Double-Curve TruSteer Delivery Sheath (present until 'released')
    if (stage !== 'released') {
      const sheathPts = [
        new THREE.Vector3(12.5, 5.8, -4.2), // Across Fossa Ovalis
        new THREE.Vector3(28.0, 16.5, -5.0), // Mid-LA curve
        new THREE.Vector3(43.5, 24.5, -1.0), // Approaching LAA Ostium
        stage === 'sheath_across'
          ? ostiumCenter.clone().addScaledVector(uAxis, 4.0)
          : ostiumCenter.clone().addScaledVector(uAxis, -6.5),
      ];
      const deliveryCurve = new THREE.CatmullRomCurve3(sheathPts);
      const deliveryGeo = new THREE.TubeGeometry(deliveryCurve, 32, 2.2, 16, false);
      const deliveryMesh = new THREE.Mesh(deliveryGeo, this.deliverySheathMat);
      deliveryMesh.renderOrder = 1;
      deliveryMesh.name = 'Watchman_14F_TruSteerDeliverySheath';
      deliveryMesh.userData = { structureId: StructureId.WATCHMAN_FLX_DEVICE };
      this.watchmanGroup.add(deliveryMesh);

      // Distal Radiopaque Marker Bands on the 14F Delivery Sheath
      const distalSheathPt = sheathPts[sheathPts.length - 1];
      const markerGeo = new THREE.CylinderGeometry(2.35, 2.35, 1.2, 18);
      const markerMesh = new THREE.Mesh(markerGeo, this.needleMetalMat);
      markerMesh.position.copy(distalSheathPt);
      markerMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), uAxis);
      markerMesh.renderOrder = 1;
      this.watchmanGroup.add(markerMesh);
    }

    if (stage === 'sheath_across') {
      return;
    }

    // Compute radial & axial dimensions for the 18-strut Nitinol frame based on stage & compression
    const compScale = 1.0 - (compressionPct - 20.0) * 0.004;
    const fullRadiusMm = simState.watchmanSizeMm * 0.36 * compScale;
    const radiusMm =
      stage === 'flx_ball'
        ? 4.8
        : stage === 'triangle'
          ? fullRadiusMm * 0.65
          : fullRadiusMm;
    const lengthMm =
      stage === 'flx_ball'
        ? 8.5
        : stage === 'triangle'
          ? fullRadiusMm * 1.15
          : fullRadiusMm * 1.35;

    // Orthonormal basis for LAA Landing Zone (`uAxis` = into LAA depth, `vAxis, wAxis` = ostial plane)
    const upRef = new THREE.Vector3(0, 1, 0);
    const vAxis = new THREE.Vector3().crossVectors(uAxis, upRef).normalize();
    const wAxis = new THREE.Vector3().crossVectors(vAxis, uAxis).normalize();

    const proximalHubPos = ostiumCenter.clone().addScaledVector(uAxis, -lengthMm * 0.45);
    const distalApexPos = ostiumCenter.clone().addScaledVector(uAxis, lengthMm * 0.55);

    // Proximal Threaded Screw Hub (`renderOrder = 1`)
    const hubGeo = new THREE.CylinderGeometry(1.6, 1.6, 2.4, 16);
    const hubMesh = new THREE.Mesh(hubGeo, this.needleMetalMat);
    hubMesh.position.copy(proximalHubPos);
    hubMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), uAxis);
    hubMesh.renderOrder = 1;
    hubMesh.name = 'Watchman_ProximalThreadedHub';
    hubMesh.userData = { structureId: StructureId.WATCHMAN_FLX_DEVICE };
    this.watchmanGroup.add(hubMesh);

    // 18 Self-Expanding Nitinol Struts with Distal Closed-Loop Atraumatic FLX Ball Roll
    const NUM_STRUTS = 18;
    for (let i = 0; i < NUM_STRUTS; i++) {
      const phi = (i / NUM_STRUTS) * Math.PI * 2.0;
      const radialDir = new THREE.Vector3()
        .addScaledVector(vAxis, Math.cos(phi))
        .addScaledVector(wAxis, Math.sin(phi));

      const strutPts = [
        proximalHubPos.clone(),
        ostiumCenter
          .clone()
          .addScaledVector(uAxis, -lengthMm * 0.30)
          .addScaledVector(radialDir, radiusMm * 0.92),
        ostiumCenter
          .clone()
          .addScaledVector(uAxis, 0.0)
          .addScaledVector(radialDir, radiusMm),
        ostiumCenter
          .clone()
          .addScaledVector(uAxis, lengthMm * 0.38)
          .addScaledVector(radialDir, radiusMm * 0.78),
        distalApexPos.clone().addScaledVector(radialDir, radiusMm * 0.22),
      ];

      const strutCurve = new THREE.CatmullRomCurve3(strutPts);
      const strutGeo = new THREE.TubeGeometry(strutCurve, 14, 0.28, 6, false);
      const strutMesh = new THREE.Mesh(strutGeo, this.nitinolStrutMat);
      strutMesh.renderOrder = 1;
      strutMesh.userData = { structureId: StructureId.WATCHMAN_FLX_DEVICE };
      this.watchmanGroup.add(strutMesh);
    }

    // Proximal ePTFE Permeable Fabric Cap covering the LAA ostial shoulder face
    if (stage === 'triangle' || stage === 'full_deployed' || stage === 'released') {
      const capGeo = new THREE.SphereGeometry(
        radiusMm * 0.98,
        24,
        16,
        0,
        Math.PI * 2,
        0,
        Math.PI * 0.58
      );
      const capMesh = new THREE.Mesh(capGeo, this.eptfeFabricMat);
      capMesh.position.copy(ostiumCenter);
      capMesh.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        uAxis.clone().negate()
      );
      capMesh.renderOrder = 1;
      capMesh.name = 'Watchman_ePTFE_ProximalFabricCap';
      capMesh.userData = { structureId: StructureId.WATCHMAN_FLX_DEVICE };
      this.watchmanGroup.add(capMesh);
    }
  }

  // ==========================================================================
  // 3. Zero-Fluoro Irrigated RF Ablation Catheter (`ThermoCool SmartTouch SF`)
  // ==========================================================================
  private rebuildAblationMeshes(simState: ProceduralSimulationState): void {
    this.clearGroupGeometry(this.ablationGroup);

    if (!simState.ablationCatheterActive) {
      return;
    }

    const targetId = simState.ablationTargetStructureId ?? StructureId.CTI_FLOOR;
    const targetMeta =
      ANATOMICAL_STRUCTURES[targetId] ?? ANATOMICAL_STRUCTURES[StructureId.CTI_FLOOR];
    const [tx, ty, tz] = targetMeta.worldCentroidMm;
    const tipPos = new THREE.Vector3(tx, ty, tz);

    const isLeftHeart =
      targetMeta.category === 'left_heart_chamber' ||
      targetId === StructureId.MITRAL_VALVE_AML_PML ||
      targetId === StructureId.LV_PAPILLARY_AL_PM;

    const approachPts = isLeftHeart
      ? [
          new THREE.Vector3(0.0, -85.0, -4.0),
          new THREE.Vector3(5.0, -20.0, -3.0),
          new THREE.Vector3(12.5, 5.5, -4.0),
          new THREE.Vector3((12.5 + tx) * 0.5, (5.5 + ty) * 0.5 + 6.0, (-4.0 + tz) * 0.5),
          tipPos,
        ]
      : [
          new THREE.Vector3(1.5, -90.0, -3.0),
          new THREE.Vector3(3.0, -38.0, 2.0),
          new THREE.Vector3(tx * 0.55, ty - 6.0, tz * 0.65),
          tipPos,
        ];

    const ablCurve = new THREE.CatmullRomCurve3(approachPts);
    const shaftGeo = new THREE.TubeGeometry(ablCurve, 32, 1.35, 14, false);
    const shaftMesh = new THREE.Mesh(shaftGeo, this.ablationShaftMat);
    shaftMesh.renderOrder = 1;
    shaftMesh.name = 'Ablation_SmartTouchShaft';
    shaftMesh.userData = { structureId: StructureId.ABLATION_CATHETER_TIP };
    this.ablationGroup.add(shaftMesh);

    const prevPt = ablCurve.getPoint(0.92);
    const tipTangent = new THREE.Vector3().subVectors(tipPos, prevPt).normalize();
    const tipElecGeo = new THREE.CylinderGeometry(1.42, 1.42, 3.8, 18);
    const tipElecMesh = new THREE.Mesh(tipElecGeo, this.ablationGoldTipMat);
    tipElecMesh.position.copy(tipPos).addScaledVector(tipTangent, -1.6);
    tipElecMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tipTangent);
    tipElecMesh.renderOrder = 1;
    tipElecMesh.name = 'Ablation_3_5mm_IrrigatedTipElectrode';
    tipElecMesh.userData = { structureId: StructureId.ABLATION_CATHETER_TIP };
    this.ablationGroup.add(tipElecMesh);

    const cfRingGeo = new THREE.RingGeometry(2.2, 3.2, 24);
    const cfRingMesh = new THREE.Mesh(cfRingGeo, this.safeHaloMat);
    cfRingMesh.position.copy(tipPos);
    cfRingMesh.lookAt(tipPos.clone().add(tipTangent));
    cfRingMesh.renderOrder = 2;
    cfRingMesh.name = 'Ablation_ContactForceHalo';
    this.ablationGroup.add(cfRingMesh);
  }

  private clearGroupGeometry(group: THREE.Group): void {
    while (group.children.length > 0) {
      const child = group.children[0] as THREE.Mesh;
      group.remove(child);
      if (child.geometry) {
        child.geometry.dispose();
      }
    }
  }
}
