import './styles/workstation.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import {
  ANATOMICAL_STRUCTURES,
  CatheterPose3D,
  CatheterState,
  CanonicalICEView,
  CartosoundContour,
  ClinicalTrackId,
  LearningModeId,
  ProceduralSimulationState,
  StructureId,
  StructureLayerCategory,
  UltrasoundSettings,
} from './types/sharedContracts';
import { CANONICAL_ICE_VIEWS, getCanonicalViewById } from './data/canonicalViews';
import { HeartAnatomyEngine } from './anatomy/HeartAnatomyEngine';
import {
  CatheterKinematicsEngine,
  checkOrganicStationCrossing,
  computeCatheterPose,
  verifyCatheterPoseInvariants,
} from './kinematics/CatheterKinematicsEngine';
import {
  ProceduralDevicesEngine,
  computeWatchmanPassCriteria,
} from './procedures/ProceduralDevicesEngine';
import {
  CanvasHitResult,
  UltrasoundSlicerEngine,
  scanSectorLandmarks,
} from './ultrasound/UltrasoundSlicerEngine';
import { DopplerAndCaliperOverlay } from './ultrasound/DopplerAndCaliperOverlay';
import {
  CameraPresetId,
  CutawayDisplayMode,
  LayerVisibilityMap,
  WorkstationUI,
} from './ui/WorkstationUI';

declare global {
  interface Window {
    __ICE_SIM__?: Record<string, unknown>;
  }
}

function bootstrapWorkstation(): void {
  const appRoot = document.getElementById('app') ?? document.body;

  let isEngineReady = false;
  let hovered3DStructureId: number | null = null;
  let hovered2DStructureId: number | null = null;
  let followTipCameraMode = false;

  // Forward declarations for engines referenced inside UI callbacks
  let anatomyEngine!: HeartAnatomyEngine;
  let kinematicsEngine!: CatheterKinematicsEngine;
  let devicesEngine!: ProceduralDevicesEngine;
  let slicerEngine!: UltrasoundSlicerEngine;
  let overlayEngine!: DopplerAndCaliperOverlay;
  let ui!: WorkstationUI;
  let camera!: THREE.PerspectiveCamera;
  let controls!: OrbitControls;

  const syncHighlightedStructures = (): void => {
    if (!isEngineReady) return;
    const activeView = ui.getActiveView();
    const highlightSet = new Set<number>(activeView.expectedStructureIds);
    if (hovered3DStructureId !== null) highlightSet.add(hovered3DStructureId);
    if (hovered2DStructureId !== null) highlightSet.add(hovered2DStructureId);
    anatomyEngine.setHighlightedStructures(Array.from(highlightSet));
  };

  const applyLayerVisibility = (visibility: LayerVisibilityMap): void => {
    if (!isEngineReady) return;
    const categoryVisible = (cat: StructureLayerCategory): boolean => {
      return visibility[cat] ?? true;
    };

    const updateGroupVisibility = (group: THREE.Object3D): void => {
      group.traverse((obj) => {
        if (obj === group) return;
        if (obj.name === 'Parametric_Chordae_Tendineae') {
          obj.visible = visibility.cardiac_valve ?? true;
          return;
        }
        if (obj.name === 'Parametric_LAA_Thrombus') {
          obj.visible =
            (visibility.left_heart_chamber ?? true) &&
            ui.getSimulationState().laaThrombusPresent;
          return;
        }
        const sid = obj.userData?.structureId as StructureId | undefined;
        if (sid && ANATOMICAL_STRUCTURES[sid]) {
          const meta = ANATOMICAL_STRUCTURES[sid];
          obj.visible = categoryVisible(meta.category);
        }
      });
    };

    updateGroupVisibility(anatomyEngine.bodyPartsGroup);
    updateGroupVisibility(anatomyEngine.parametricGroup);
    anatomyEngine.cartosoundGroup.visible = visibility.cartosound_contours ?? true;
    kinematicsEngine.frustumGroup.visible = visibility.ultrasound_fan ?? true;
  };

  const applyCameraPreset = (preset: CameraPresetId | string): void => {
    if (!camera || !controls) return;
    followTipCameraMode = false;

    const normalized = preset.trim().toLowerCase();
    let canonicalPreset: CameraPresetId = 'ra_cutaway';

    if (normalized === 'anterior' || normalized === 'ap') {
      canonicalPreset = 'anterior';
      camera.position.set(16, 18, 205);
      controls.target.set(16, 4, 2);
    } else if (normalized === 'ra_cutaway' || normalized === 'rao 30°' || normalized === 'rao_30') {
      canonicalPreset = 'ra_cutaway';
      camera.position.set(-82, 24, 152);
      controls.target.set(14, 2, 2);
    } else if (
      normalized === 'la_watchman' ||
      normalized === 'lao 45°' ||
      normalized === 'lao_45' ||
      normalized === 'left lateral'
    ) {
      canonicalPreset = 'la_watchman';
      camera.position.set(142, 34, 126);
      controls.target.set(36, 16, -4);
    } else if (normalized === 'basal_valves') {
      canonicalPreset = 'basal_valves';
      camera.position.set(24, 174, 88);
      controls.target.set(22, 12, 6);
    } else if (
      normalized === 'follow_tip' ||
      normalized === 'catheter_eye' ||
      normalized === 'catheter pov'
    ) {
      canonicalPreset = 'follow_tip';
      followTipCameraMode = true;
      const pose = kinematicsEngine.getPose();
      const [tx, ty, tz] = pose.transducerPos;
      const [nx, ny, nz] = pose.faceNormal;
      const [ux, uy, uz] = pose.shaftTangent;
      camera.position.set(
        tx - nx * 68 - ux * 24,
        ty - ny * 68 - uy * 24 + 18,
        tz - nz * 68 - uz * 24 + 42
      );
      controls.target.set(tx + nx * 38, ty + ny * 38, tz + nz * 38);
    }
    controls.update();

    appRoot.querySelectorAll<HTMLElement>('[data-cam-preset]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.camPreset === canonicalPreset);
    });
  };

  const syncPassCriteriaAndSafety = (): void => {
    if (!isEngineReady) return;
    const simState = ui.getSimulationState();
    const cathState = ui.getCatheterState();
    devicesEngine.syncState(simState);
    const passStatus = devicesEngine.getPassCriteria(cathState);
    ui.updatePassCriteriaStatus(passStatus);
  };

  // Instantiate WorkstationUI and attach callbacks
  ui = new WorkstationUI(appRoot, {
    onCatheterStateChange: (state: CatheterState, targetState: CatheterState) => {
      if (!isEngineReady) return;

      // Check organic station crossing when user steers across Fossa Ovalis / Tricuspid / LAA ostium
      const crossing = checkOrganicStationCrossing(targetState, ui.getSimulationState());
      if (crossing && crossing.targetStation !== targetState.station && !ui.isDemoPlaying()) {
        ui.setCatheterState(crossing.suggestedState, false, false);
        kinematicsEngine.setTargetState(crossing.suggestedState);
      } else {
        kinematicsEngine.setTargetState(targetState);
      }

      // If immediate snap occurred (state equals targetState), snap kinematics engine immediately
      const isImmediate =
        Math.abs(state.sMm - targetState.sMm) < 1e-4 &&
        Math.abs(state.torqueDeg - targetState.torqueDeg) < 1e-4 &&
        Math.abs(state.apDeg - targetState.apDeg) < 1e-4 &&
        Math.abs(state.lrDeg - targetState.lrDeg) < 1e-4;
      if (isImmediate) {
        kinematicsEngine.snapToState(state, ui.getUltrasoundSettings());
      }
      syncPassCriteriaAndSafety();
    },

    onUltrasoundSettingsChange: (settings: UltrasoundSettings) => {
      if (!isEngineReady) return;
      kinematicsEngine.updateVisuals(
        kinematicsEngine.getPose(),
        settings,
        kinematicsEngine.getState()
      );
    },

    onSimulationStateChange: (simState: ProceduralSimulationState) => {
      if (!isEngineReady) return;
      anatomyEngine.updateCardiacCycle(simState);
      devicesEngine.updateDevices(simState);
      applyLayerVisibility(ui.getLayerVisibility());
      syncPassCriteriaAndSafety();
    },

    onViewSelect: (view: CanonicalICEView) => {
      if (!isEngineReady) return;
      overlayEngine.setActiveViewId(view.id);
      overlayEngine.clearCalipers();
      syncHighlightedStructures();
      syncPassCriteriaAndSafety();
    },

    onTrackChange: (_track: ClinicalTrackId) => {
      if (!isEngineReady) return;
      syncHighlightedStructures();
      syncPassCriteriaAndSafety();
    },

    onLearningModeChange: (_mode: LearningModeId) => {
      if (!isEngineReady) return;
      syncHighlightedStructures();
    },

    onCameraPresetSelect: (preset: CameraPresetId) => {
      applyCameraPreset(preset);
    },

    onCutawayModeChange: (mode: CutawayDisplayMode) => {
      if (!isEngineReady) return;
      anatomyEngine.setDisplayMode(
        mode === 'surgical_glass' ? 'cutaway_glass' : 'solid_anatomical'
      );
    },

    onLayerVisibilityChange: (visibility: LayerVisibilityMap) => {
      applyLayerVisibility(visibility);
    },

    onAcquireCartosoundContour: (activeView: CanonicalICEView) => {
      if (!isEngineReady) return;
      const pose = kinematicsEngine.getPose();
      const settings = ui.getUltrasoundSettings();
      const simState = ui.getSimulationState();
      const preferredStructure = activeView.expectedStructureIds[0];
      const contour = anatomyEngine.acquireCartosoundContour(
        pose,
        settings,
        simState,
        preferredStructure
      );
      const currentContours = simState.cartosoundContours ?? [];
      ui.setSimulationState({
        cartosoundContours: [...currentContours, contour],
      });
    },

    onClearCartosoundContours: () => {
      if (!isEngineReady) return;
      anatomyEngine.clearCartosoundContours();
    },

    onToggleCaliperTool: (active: boolean) => {
      if (!isEngineReady) return;
      overlayEngine.setCaliperMode(active);
    },

    onAutoMeasureCurrentView: (activeView: CanonicalICEView) => {
      if (!isEngineReady) return;
      overlayEngine.autoMeasureCurrentView(
        kinematicsEngine.getPose(),
        ui.getUltrasoundSettings(),
        ui.getSimulationState(),
        kinematicsEngine.getState(),
        activeView
      );
    },

    onTriggerWatchmanTugTest: () => {
      if (!isEngineReady) return;
      syncPassCriteriaAndSafety();
    },

    onHighlightStructure: (structureId: number | null) => {
      if (!isEngineReady) return;
      hovered3DStructureId = structureId;
      overlayEngine.setExternalHighlightedStructureId(structureId);
      syncHighlightedStructures();
    },
  });

  // 1. Initialize Three.js Scene, Camera, Renderer, and Studio Surgical Lighting
  const threeContainer = ui.getThreeViewportContainer();
  const scene = new THREE.Scene();

  const initWidth = Math.max(320, threeContainer.clientWidth || 720);
  const initHeight = Math.max(240, threeContainer.clientHeight || 540);

  camera = new THREE.PerspectiveCamera(36, initWidth / initHeight, 1.0, 1200.0);
  camera.position.set(-82, 24, 152);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(initWidth, initHeight);
  renderer.localClippingEnabled = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.style.display = 'block';
  threeContainer.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 42;
  controls.maxDistance = 420;
  controls.target.set(14, 2, 2);
  controls.update();

  // Calibrated 3-point surgical studio lighting + intracardiac transducer beacon
  const hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x1e1b4b, 0.88);
  scene.add(hemiLight);

  const keyLight = new THREE.DirectionalLight(0xfff7ed, 1.48);
  keyLight.position.set(115, 145, 165);
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.82);
  rimLight.position.set(-135, 85, -125);
  scene.add(rimLight);

  const fillLight = new THREE.DirectionalLight(0xfda4af, 0.54);
  fillLight.position.set(95, -115, 85);
  scene.add(fillLight);

  const transducerPointLight = new THREE.PointLight(0x38bdf8, 0.55, 145);
  scene.add(transducerPointLight);

  // 2. Instantiate Core Simulation Engines
  anatomyEngine = new HeartAnatomyEngine(scene);
  kinematicsEngine = new CatheterKinematicsEngine(scene, ui.getCatheterState());

  devicesEngine = new ProceduralDevicesEngine(scene);

  const usContainer = ui.getUltrasoundViewportContainer();
  slicerEngine = new UltrasoundSlicerEngine(usContainer);

  overlayEngine = new DopplerAndCaliperOverlay(slicerEngine, {
    onStructureHover: (structureId: number | null, hit: CanvasHitResult | null) => {
      hovered2DStructureId = structureId;
      ui.updateHoveredStructure(structureId, hit?.depthMm, '2d');
      syncHighlightedStructures();
    },
    onStructureSelect: (structureId: number | null, hit: CanvasHitResult | null) => {
      hovered2DStructureId = structureId;
      ui.updateHoveredStructure(structureId, hit?.depthMm, '2d');
      syncHighlightedStructures();
    },
    onFocusDepthChange: (newFocusCm: number) => {
      ui.setUltrasoundSettings({ focusCm: newFocusCm });
    },
    onMarkerSideToggle: () => {
      const cur = ui.getUltrasoundSettings().markerSide;
      ui.setUltrasoundSettings({ markerSide: cur === 'right' ? 'left' : 'right' });
    },
  });

  // Mark engine graph ready and perform initial synchronization
  isEngineReady = true;
  const initialView = ui.getActiveView();
  overlayEngine.setActiveViewId(initialView.id);
  kinematicsEngine.snapToState(ui.getCatheterState(), ui.getUltrasoundSettings());
  anatomyEngine.updateCardiacCycle(ui.getSimulationState());
  devicesEngine.updateDevices(ui.getSimulationState());
  applyLayerVisibility(ui.getLayerVisibility());
  syncHighlightedStructures();
  syncPassCriteriaAndSafety();

  // Load binary BodyParts3D mesh atlas and 128^3 acoustic volume asynchronously
  const readyPromise = anatomyEngine
    .loadAssets('/models')
    .then(() => {
      anatomyEngine.setDisplayMode(
        ui.getCutawayMode() === 'surgical_glass' ? 'cutaway_glass' : 'solid_anatomical'
      );
      anatomyEngine.updateCardiacCycle(ui.getSimulationState());
      applyLayerVisibility(ui.getLayerVisibility());
      syncHighlightedStructures();
    })
    .catch((err) => {
      console.warn('HeartAnatomyEngine binary asset fallback active:', err);
    });

  // 3. 3D Viewport Raycaster for Hover-to-Identify & Bidirectional 3D <-> 2D Cross-Highlighting
  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();
  let pointerDownPos = { x: 0, y: 0 };

  const pick3DStructureAtEvent = (
    evt: MouseEvent
  ): { structureId: number | null; distanceMm?: number } => {
    const rect = renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return { structureId: null };
    pointerNdc.x = ((evt.clientX - rect.left) / rect.width) * 2 - 1;
    pointerNdc.y = -((evt.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(pointerNdc, camera);
    const hits = raycaster.intersectObjects(
      [anatomyEngine.bodyPartsGroup, anatomyEngine.parametricGroup],
      true
    );

    for (const hit of hits) {
      let obj: THREE.Object3D | null = hit.object;
      if (!obj.visible) continue;
      while (obj && !obj.userData?.structureId) {
        obj = obj.parent;
      }
      const sid = obj?.userData?.structureId as number | undefined;
      if (sid && ANATOMICAL_STRUCTURES[sid as StructureId]) {
        const tx = kinematicsEngine.getPose().transducerPos;
        const dx = hit.point.x - tx[0];
        const dy = hit.point.y - tx[1];
        const dz = hit.point.z - tx[2];
        const distFromTipMm = Math.sqrt(dx * dx + dy * dy + dz * dz);
        return { structureId: sid, distanceMm: distFromTipMm };
      }
    }
    return { structureId: null };
  };

  renderer.domElement.addEventListener('mousemove', (evt: MouseEvent) => {
    if (evt.buttons !== 0) return; // Ignore while orbiting camera
    const { structureId, distanceMm } = pick3DStructureAtEvent(evt);
    if (structureId !== hovered3DStructureId) {
      hovered3DStructureId = structureId;
      overlayEngine.setExternalHighlightedStructureId(structureId);
      ui.updateHoveredStructure(structureId, distanceMm, '3d');
      syncHighlightedStructures();
      renderer.domElement.style.cursor = structureId !== null ? 'pointer' : 'grab';
    }
  });

  renderer.domElement.addEventListener('mousedown', (evt: MouseEvent) => {
    pointerDownPos = { x: evt.clientX, y: evt.clientY };
  });

  renderer.domElement.addEventListener('mouseup', (evt: MouseEvent) => {
    const moveDist = Math.hypot(evt.clientX - pointerDownPos.x, evt.clientY - pointerDownPos.y);
    if (moveDist < 5) {
      const { structureId, distanceMm } = pick3DStructureAtEvent(evt);
      hovered3DStructureId = structureId;
      overlayEngine.setExternalHighlightedStructureId(structureId);
      ui.updateHoveredStructure(structureId, distanceMm, '3d');
      syncHighlightedStructures();
    }
  });

  renderer.domElement.addEventListener('mouseleave', () => {
    if (hovered3DStructureId !== null) {
      hovered3DStructureId = null;
      overlayEngine.setExternalHighlightedStructureId(null);
      ui.updateHoveredStructure(null, undefined, '3d');
      syncHighlightedStructures();
      renderer.domElement.style.cursor = 'grab';
    }
  });

  // 4. Responsive Viewport Resize Observer
  const handleResize = (): void => {
    const w = Math.max(280, threeContainer.clientWidth);
    const h = Math.max(220, threeContainer.clientHeight);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  };

  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => handleResize());
    ro.observe(threeContainer);
  }
  window.addEventListener('resize', handleResize);

  // 5. Real-Time 60 FPS Render & Physics Synchronization Loop
  let lastFrameTimeMs = performance.now();

  const renderSingleFrame = (dtSec: number): void => {
    // Advance WorkstationUI (cardiac phase, demo player, spring-damped catheter state)
    const uiCathState = ui.updateFrame(dtSec);
    const settings = ui.getUltrasoundSettings();
    const simState = ui.getSimulationState();

    // Sync CatheterKinematicsEngine with UI state and compute exact 3D pose & frustum
    const pose: CatheterPose3D = kinematicsEngine.snapToState(uiCathState, settings);

    // Move intracardiac point light to catheter transducer position
    transducerPointLight.position.set(
      pose.transducerPos[0],
      pose.transducerPos[1],
      pose.transducerPos[2]
    );

    // If Follow-Tip camera preset is active, track transducer smoothly
    if (followTipCameraMode) {
      const [tx, ty, tz] = pose.transducerPos;
      const [nx, ny, nz] = pose.faceNormal;
      controls.target.lerp(new THREE.Vector3(tx + nx * 36, ty + ny * 36, tz + nz * 36), 0.12);
    }

    // Update 4D cardiac cycle deformation & procedural devices
    anatomyEngine.updateCardiacCycle(simState);
    devicesEngine.updateDevices(simState);

    // Render 2D / Biplane / 4D En-Face Ultrasound Sector & Doppler/Caliper Overlay
    slicerEngine.renderFrame(pose, settings, simState, uiCathState, anatomyEngine, devicesEngine);
    overlayEngine.renderOverlay(pose, settings, simState, uiCathState, ui.getActiveView());

    // Feed live intersected structures from the ultrasound sector back to WorkstationUI
    const landmarkMap = slicerEngine.getLatestLandmarkMap();
    const intersectedIds = Array.from(landmarkMap.keys());
    ui.updateIntersectedStructures(intersectedIds);

    // Render 3D WebGL scene
    controls.update();
    renderer.render(scene, camera);
  };

  const animateLoop = (nowMs: number): void => {
    const dtSec = Math.min(0.1, Math.max(0.001, (nowMs - lastFrameTimeMs) / 1000.0));
    lastFrameTimeMs = nowMs;
    renderSingleFrame(dtSec);
    requestAnimationFrame(animateLoop);
  };

  // Default console view starts with clean unannotated clinical B-mode (hover-only labels)
  ui.setUltrasoundSettings({ labelOverlayMode: 'hover' });

  // Render an immediate initial frame before starting RAF loop
  renderSingleFrame(1 / 60);
  requestAnimationFrame(animateLoop);

  // 6. Expose Comprehensive Global Verification & Automation API (`window.__ICE_SIM__`)
  window.__ICE_SIM__ = {
    ui,
    anatomyEngine,
    kinematicsEngine,
    devicesEngine,
    slicerEngine,
    overlayEngine,
    scene,
    camera,
    renderer,
    controls,
    readyPromise,

    // Direct programmatic helpers for Phase 6 Playwright & Verification Suites
    selectView: (viewId: string, animate = false): CanonicalICEView | undefined => {
      ui.selectView(viewId, { animate, applyTargetState: true });
      if (!animate) {
        renderSingleFrame(1 / 60);
      }
      return getCanonicalViewById(viewId);
    },
    getCatheterState: (): CatheterState => ui.getCatheterState(),
    setCatheterState: (partial: Partial<CatheterState>, immediate = true): CatheterState => {
      ui.setCatheterState(partial, immediate, true);
      if (immediate) {
        renderSingleFrame(1 / 60);
      }
      return ui.getCatheterState();
    },
    getCatheterPose: (): CatheterPose3D => kinematicsEngine.getPose(),
    computeCatheterPose,
    verifyPoseInvariants: () => verifyCatheterPoseInvariants(kinematicsEngine.getPose()),
    getUltrasoundSettings: (): UltrasoundSettings => ui.getUltrasoundSettings(),
    setUltrasoundSettings: (partial: Partial<UltrasoundSettings>): UltrasoundSettings => {
      ui.setUltrasoundSettings(partial);
      renderSingleFrame(1 / 60);
      return ui.getUltrasoundSettings();
    },
    getSimulationState: (): ProceduralSimulationState => ui.getSimulationState(),
    setSimulationState: (
      partial: Partial<ProceduralSimulationState>
    ): ProceduralSimulationState => {
      ui.setSimulationState(partial);
      renderSingleFrame(1 / 60);
      return ui.getSimulationState();
    },
    getActiveView: (): CanonicalICEView => ui.getActiveView(),
    getAllViews: (): CanonicalICEView[] => CANONICAL_ICE_VIEWS,
    getIntersectedStructures: (): number[] =>
      Array.from(slicerEngine.getLatestLandmarkMap().keys()),
    scanSectorLandmarks: (pose?: CatheterPose3D) =>
      scanSectorLandmarks(
        pose ?? kinematicsEngine.getPose(),
        ui.getUltrasoundSettings(),
        ui.getSimulationState(),
        anatomyEngine,
        devicesEngine
      ),
    getWatchmanPassCriteria: () =>
      computeWatchmanPassCriteria(ui.getSimulationState(), ui.getCatheterState()),
    acquireCartosoundContour: (): CartosoundContour => {
      const pose = kinematicsEngine.getPose();
      const settings = ui.getUltrasoundSettings();
      const simState = ui.getSimulationState();
      const contour = anatomyEngine.acquireCartosoundContour(
        pose,
        settings,
        simState,
        ui.getActiveView().expectedStructureIds[0]
      );
      const currentContours = simState.cartosoundContours ?? [];
      ui.setSimulationState({ cartosoundContours: [...currentContours, contour] });
      renderSingleFrame(1 / 60);
      return contour;
    },
    clearCartosoundContours: (): void => {
      anatomyEngine.clearCartosoundContours();
      ui.setSimulationState({ cartosoundContours: [] });
      renderSingleFrame(1 / 60);
    },
    autoMeasureCurrentView: () => {
      const res = overlayEngine.autoMeasureCurrentView(
        kinematicsEngine.getPose(),
        ui.getUltrasoundSettings(),
        ui.getSimulationState(),
        kinematicsEngine.getState(),
        ui.getActiveView()
      );
      renderSingleFrame(1 / 60);
      return res;
    },
    setCameraPreset: (preset: string): void => {
      applyCameraPreset(preset);
      renderSingleFrame(1 / 60);
    },
    playManeuverDemo: (viewId?: string): void => ui.playManeuverDemo(viewId),
    stopManeuverDemo: (): void => ui.stopManeuverDemo(),
    renderFrameNow: (): void => renderSingleFrame(1 / 60),
  };
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrapWorkstation);
} else {
  bootstrapWorkstation();
}
