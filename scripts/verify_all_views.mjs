#!/usr/bin/env node
/**
 * Phase 5 Automated Headless Physics, Kinematics & Landmark Contract Verifier
 * Verifies all 28 Canonical Views (zf_01..zf_18, wm_01..wm_10),
 * 4-DOF Catheter Pose Orthonormality, Physical Bending & Clockwise Sweep Invariants,
 * and Watchman FLX PASS Criteria Calculator.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// If invoked with plain `node` without tsx loader active, re-invoke seamlessly under `npx tsx`
if (!process.env.__ICE_TSX_ACTIVE__) {
  const tsxBin = path.join(
    ROOT_DIR,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'tsx.cmd' : 'tsx'
  );
  const res = spawnSync(tsxBin, [__filename, ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: { ...process.env, __ICE_TSX_ACTIVE__: '1' },
  });
  process.exit(res.status ?? 1);
}

const {
  ANATOMICAL_STRUCTURES,
  DEFAULT_CATHETER_STATE,
  DEFAULT_PROCEDURAL_SIMULATION_STATE,
  DEFAULT_ULTRASOUND_SETTINGS,
} = await import('../src/types/sharedContracts.ts');

const { CANONICAL_ICE_VIEWS } = await import('../src/data/canonicalViews.ts');
const { computeCatheterPose, verifyCatheterPoseInvariants } = await import(
  '../src/kinematics/CatheterKinematicsEngine.ts'
);
const { HeartAnatomyEngine } = await import('../src/anatomy/HeartAnatomyEngine.ts');
const { ProceduralDevicesEngine, computeWatchmanPassCriteria } = await import(
  '../src/procedures/ProceduralDevicesEngine.ts'
);
const { scanSectorLandmarks } = await import('../src/ultrasound/UltrasoundSlicerEngine.ts');

function padRight(str, len) {
  const s = String(str);
  return s.length >= len ? s.slice(0, len) : s + ' '.repeat(len - s.length);
}

async function runVerification() {
  console.log('====================================================================================================');
  console.log(' ICE WORKSTATION — PHASE 5 HEADLESS KINEMATICS, SECTOR SLICER & CLINICAL CONTRACT VERIFICATION');
  console.log('====================================================================================================\n');

  // 1. Load Binary Heart Atlas & 128^3 Acoustic Volume from public/models
  const modelsDir = path.join(ROOT_DIR, 'public', 'models');
  const manifestPath = path.join(modelsDir, 'heart_manifest.json');
  const atlasPath = path.join(modelsDir, 'heart_atlas.bin');
  const volumePath = path.join(modelsDir, 'heart_acoustic_volume.bin');

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const atlasBuf = fs.readFileSync(atlasPath);
  const volumeBuf = fs.readFileSync(volumePath);

  const atlasArrayBuffer = atlasBuf.buffer.slice(
    atlasBuf.byteOffset,
    atlasBuf.byteOffset + atlasBuf.byteLength
  );
  const volumeUint8 = new Uint8Array(
    volumeBuf.buffer,
    volumeBuf.byteOffset,
    volumeBuf.byteLength
  );

  const anatomyEngine = new HeartAnatomyEngine();
  anatomyEngine.loadFromBuffers(atlasArrayBuffer, manifest, volumeUint8);
  const devicesEngine = new ProceduralDevicesEngine();

  console.log(
    `[ASSET CHECK] Loaded BodyParts3D Atlas: ${manifest.meshes.length} meshes, ${manifest.totalVertices} vertices, ${manifest.totalTriangles} triangles, Acoustic Volume: ${volumeUint8.byteLength} bytes (128^3).\n`
  );

  let failures = 0;

  // 2. Verify Physical Bending & Clockwise Sweep Invariants
  console.log('--- [1/3] 4-DOF CATHETER PHYSICAL BENDING & 8-STAGE CLOCKWISE SWEEP INVARIANTS ---');

  const homeState = { ...DEFAULT_CATHETER_STATE, station: 'ra_venous', torqueDeg: 45, apDeg: 0, lrDeg: 0 };
  const poseNeutral = computeCatheterPose(homeState);
  const poseAnterior = computeCatheterPose({ ...homeState, apDeg: 35 });
  const posePosterior = computeCatheterPose({ ...homeState, apDeg: -35 });

  // Displacement along +eA0 (neutral faceNormal) and tilt along t0 (neutral shaftTangent)
  const eA0 = poseNeutral.faceNormal;
  const t0 = poseNeutral.shaftTangent;
  const dispAnt =
    (poseAnterior.transducerPos[0] - poseNeutral.transducerPos[0]) * eA0[0] +
    (poseAnterior.transducerPos[1] - poseNeutral.transducerPos[1]) * eA0[1] +
    (poseAnterior.transducerPos[2] - poseNeutral.transducerPos[2]) * eA0[2];
  const dispPost =
    (posePosterior.transducerPos[0] - poseNeutral.transducerPos[0]) * eA0[0] +
    (posePosterior.transducerPos[1] - poseNeutral.transducerPos[1]) * eA0[1] +
    (posePosterior.transducerPos[2] - poseNeutral.transducerPos[2]) * eA0[2];
  const tiltAntDotT0 =
    poseAnterior.faceNormal[0] * t0[0] +
    poseAnterior.faceNormal[1] * t0[1] +
    poseAnterior.faceNormal[2] * t0[2];
  const tiltPostDotT0 =
    posePosterior.faceNormal[0] * t0[0] +
    posePosterior.faceNormal[1] * t0[1] +
    posePosterior.faceNormal[2] * t0[2];

  if (!(dispAnt > 2.0 && dispPost < -2.0 && tiltAntDotT0 < -0.05 && tiltPostDotT0 > 0.05)) {
    console.error(
      `[FAIL] AP Deflection Invariant failed: dispAnt=${dispAnt.toFixed(2)}, dispPost=${dispPost.toFixed(2)}, tiltAntDotT0=${tiltAntDotT0.toFixed(3)}, tiltPostDotT0=${tiltPostDotT0.toFixed(3)}`
    );
    failures++;
  } else {
    console.log(
      `[PASS] AP Bending Law: Anterior (+35°) advances tip +${dispAnt.toFixed(2)} mm along +eA0 (dot(nFace,t0)=${tiltAntDotT0.toFixed(3)}); Posterior (-35°) retracts tip ${dispPost.toFixed(2)} mm toward posterior RA/IAS (dot(nFace,t0)=+${tiltPostDotT0.toFixed(3)}).`
    );
  }

  // Verify 8-stage Clockwise (+torqueDeg) RA Sweep monotonicity in horizontal X-Z plane
  const clockwiseRaTorqueSequence = [45, 60, 78, 95, 115, 132, 148, 168];
  const sweepAzimuthsDeg = clockwiseRaTorqueSequence.map((torqueDeg) => {
    const p = computeCatheterPose({
      ...DEFAULT_CATHETER_STATE,
      station: 'ra_venous',
      sMm: 0,
      torqueDeg,
      apDeg: 0,
      lrDeg: 0,
    });
    // Angle in X-Z plane from +Z anterior toward +X left -> -Z posterior
    const angleRad = Math.atan2(p.faceNormal[0], p.faceNormal[2]);
    let angleDeg = (angleRad * 180) / Math.PI;
    if (angleDeg < 0) angleDeg += 360;
    return Number(angleDeg.toFixed(2));
  });

  let sweepMonotonic = true;
  for (let i = 1; i < sweepAzimuthsDeg.length; i++) {
    if (sweepAzimuthsDeg[i] <= sweepAzimuthsDeg[i - 1]) {
      sweepMonotonic = false;
      break;
    }
  }

  if (!sweepMonotonic) {
    console.error(`[FAIL] Clockwise RA Sweep non-monotonic: ${sweepAzimuthsDeg.join('° -> ')}°`);
    failures++;
  } else {
    console.log(
      `[PASS] 8-Stage Clockwise (+torqueDeg) RA Sweep Monotonicity: ${sweepAzimuthsDeg.join('° -> ')}°\n`
    );
  }

  // 3. Verify All 28 Canonical Views (Orthonormality + 100% Expected Landmark Intersection)
  console.log('--- [2/3] ALL 28 CANONICAL VIEWS (18 ZIPES/CARTOSOUND + 10 WATCHMAN FLX) VERIFICATION TABLE ---');
  console.log(
    `${padRight('ID', 7)} | ${padRight('Step', 4)} | ${padRight('Station', 14)} | ${padRight('View Name', 38)} | ${padRight('det(R)', 9)} | ${padRight('Expected Hit', 12)} | Status`
  );
  console.log('-'.repeat(104));

  let viewsPassed = 0;
  let totalExpectedLandmarks = 0;
  let totalMatchedLandmarks = 0;

  for (const view of CANONICAL_ICE_VIEWS) {
    const pose = computeCatheterPose(view.targetState);
    const inv = verifyCatheterPoseInvariants(pose);

    // Configure procedural simulation state appropriately for the view
    const isWatchmanDeployedView = view.id.startsWith('wm_') && Number(view.id.slice(3)) >= 6;
    const isTspView = view.id === 'zf_13' || view.id === 'zf_14' || view.id === 'wm_01' || view.id === 'wm_02';
    const isPericardialView = view.id === 'zf_18' || view.id === 'wm_10';
    const simState = {
      ...DEFAULT_PROCEDURAL_SIMULATION_STATE,
      tspTentingMm: isTspView ? 6.5 : 2.5,
      pericardialEffusionMl: isPericardialView ? 50 : 0,
      watchmanStage: isWatchmanDeployedView
        ? 'full_deployed'
        : view.id === 'wm_05'
          ? 'flx_ball'
          : 'sheath_in_laa',
      ablationCatheterActive: view.id === 'zf_04' || view.id === 'zf_15' || view.id === 'zf_16',
    };

    const settings = {
      ...DEFAULT_ULTRASOUND_SETTINGS,
      depthCm: view.recommendedDepthCm,
    };

    anatomyEngine.updateCardiacCycle(simState);
    devicesEngine.updateDevices(simState);

    const sectorMap = scanSectorLandmarks(pose, settings, simState, anatomyEngine, devicesEngine);
    const anatomyPoseSet = new Set(
      anatomyEngine.getIntersectedStructureIdsForPose(pose, view.recommendedDepthCm, simState)
    );

    const missingIds = [];
    for (const expectedId of view.expectedStructureIds) {
      totalExpectedLandmarks++;
      const hitInSlicer = sectorMap.has(expectedId) && sectorMap.get(expectedId).pixelCount > 0;
      const hitInAnatomy = anatomyPoseSet.has(expectedId) || expectedId >= 40; // >=40 are procedural devices evaluated by devicesEngine
      if (hitInSlicer && hitInAnatomy) {
        totalMatchedLandmarks++;
      } else {
        const meta = ANATOMICAL_STRUCTURES[expectedId];
        missingIds.push(
          `${expectedId}:${meta ? meta.shortLabel : 'Unknown'}(slicer=${hitInSlicer},anat=${hitInAnatomy})`
        );
      }
    }

    const viewPass = inv.valid && missingIds.length === 0;
    if (viewPass) {
      viewsPassed++;
    } else {
      failures++;
    }

    const hitRatioStr = `${view.expectedStructureIds.length - missingIds.length}/${view.expectedStructureIds.length}`;
    const statusStr = viewPass
      ? 'PASS'
      : `FAIL (missing: ${missingIds.join(', ')}; ortho=${inv.valid})`;

    console.log(
      `${padRight(view.id, 7)} | ${padRight(view.number, 4)} | ${padRight(view.targetState.station, 14)} | ${padRight(view.title, 38)} | ${padRight(inv.det.toFixed(6), 9)} | ${padRight(hitRatioStr, 12)} | ${statusStr}`
    );
  }

  console.log('-'.repeat(104));
  console.log(
    `[SUMMARY] Canonical Views Passed: ${viewsPassed}/${CANONICAL_ICE_VIEWS.length} | Landmark Intersections: ${totalMatchedLandmarks}/${totalExpectedLandmarks} (${((totalMatchedLandmarks / totalExpectedLandmarks) * 100).toFixed(1)}%)\n`
  );

  // 4. Verify Watchman FLX PASS Criteria Calculator
  console.log('--- [3/3] WATCHMAN FLX PASS CRITERIA CALCULATOR VERIFICATION ---');

  const pass27State = {
    ...DEFAULT_PROCEDURAL_SIMULATION_STATE,
    watchmanSizeMm: 27,
    watchmanStage: 'full_deployed',
    watchmanTugActive: true,
    laaThrombusPresent: false,
  };
  const pass27Result = computeWatchmanPassCriteria(pass27State);

  const pass24State = {
    ...DEFAULT_PROCEDURAL_SIMULATION_STATE,
    watchmanSizeMm: 24,
    watchmanStage: 'full_deployed',
    watchmanTugActive: true,
    laaThrombusPresent: false,
  };
  const pass24Result = computeWatchmanPassCriteria(pass24State);

  const fail20State = {
    ...DEFAULT_PROCEDURAL_SIMULATION_STATE,
    watchmanSizeMm: 20,
    watchmanStage: 'full_deployed',
    watchmanTugActive: false,
    laaThrombusPresent: false,
  };
  const fail20Result = computeWatchmanPassCriteria(fail20State);

  const pass27Ok =
    pass27Result.allPassed === true &&
    pass27Result.positionPass &&
    pass27Result.anchorPass &&
    pass27Result.sizePass &&
    pass27Result.sealPass;

  const pass24Ok =
    pass24Result.allPassed === true &&
    pass24Result.positionPass &&
    pass24Result.anchorPass &&
    pass24Result.sizePass &&
    pass24Result.sealPass;

  const fail20Ok =
    fail20Result.allPassed === false &&
    fail20Result.sizePass === false &&
    fail20Result.sealPass === false &&
    fail20Result.anchorPass === false;

  if (!pass27Ok || !pass24Ok || !fail20Ok) {
    console.error('[FAIL] Watchman FLX PASS Criteria Calculator check failed:', {
      pass27Result,
      pass24Result,
      fail20Result,
    });
    failures++;
  } else {
    console.log(
      `[PASS] Watchman FLX 27 mm (${pass27Result.compressionPct}% compression, ${pass27Result.maxLeakJetMm} mm leak, Tug PASS) -> allPassed=${pass27Result.allPassed}`
    );
    console.log(
      `[PASS] Watchman FLX 24 mm (${pass24Result.compressionPct}% compression, ${pass24Result.maxLeakJetMm} mm leak, Tug PASS) -> allPassed=${pass24Result.allPassed}`
    );
    console.log(
      `[PASS] Watchman FLX 20 mm Undersized (${fail20Result.compressionPct}% compression, ${fail20Result.maxLeakJetMm} mm leak) -> allPassed=${fail20Result.allPassed} (correctly rejected)`
    );
  }

  console.log('\n====================================================================================================');
  if (failures === 0 && viewsPassed === 28) {
    console.log(' ALL PHASE 5 VERIFICATION CHECKS PASSED (28/28 CANONICAL VIEWS, 100% LANDMARK & PHYSICS INVARIANTS)');
    console.log('====================================================================================================');
    process.exit(0);
  } else {
    console.error(` VERIFICATION FAILED WITH ${failures} ERROR(S).`);
    console.log('====================================================================================================');
    process.exit(1);
  }
}

runVerification().catch((err) => {
  console.error('Unhandled error in verify_all_views.mjs:', err);
  process.exit(1);
});
