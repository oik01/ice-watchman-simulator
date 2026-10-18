import {
  ANATOMICAL_STRUCTURES,
  CanonicalICEView,
  CatheterModelId,
  CatheterState,
  ChamberStationId,
  ClinicalTrackId,
  DEFAULT_CATHETER_STATE,
  DEFAULT_PROCEDURAL_SIMULATION_STATE,
  DEFAULT_ULTRASOUND_SETTINGS,
  LAAMorphologyId,
  LabelOverlayMode,
  LearningModeId,
  PassCriteriaStatus,
  ProceduralSimulationState,
  StructureLayerCategory,
  UltrasoundSettings,
  WatchmanStageId,
} from '../types/sharedContracts';
import {
  CANONICAL_ICE_VIEWS,
  ChallengeAlignmentResult,
  evaluatePracticeChallengeAlignment,
  getCanonicalViewById,
  getCanonicalViewsByTrack,
} from '../data/canonicalViews';
import {
  LITERATURE_LIBRARY,
  WATCHMAN_FLX_SIZING_MATRIX,
} from '../data/literatureLibrary';

export type CameraPresetId =
  | 'anterior'
  | 'ra_cutaway'
  | 'la_watchman'
  | 'basal_valves'
  | 'follow_tip';

export type CutawayDisplayMode = 'surgical_glass' | 'anatomical_solid';

export type LayerVisibilityMap = Record<
  StructureLayerCategory | 'ultrasound_fan' | 'cartosound_contours',
  boolean
>;

export interface WorkstationUICallbacks {
  onCatheterStateChange?: (state: CatheterState, targetState: CatheterState) => void;
  onUltrasoundSettingsChange?: (settings: UltrasoundSettings) => void;
  onSimulationStateChange?: (simState: ProceduralSimulationState) => void;
  onViewSelect?: (view: CanonicalICEView) => void;
  onTrackChange?: (track: ClinicalTrackId) => void;
  onLearningModeChange?: (mode: LearningModeId) => void;
  onCameraPresetSelect?: (preset: CameraPresetId) => void;
  onCutawayModeChange?: (mode: CutawayDisplayMode) => void;
  onLayerVisibilityChange?: (visibility: LayerVisibilityMap) => void;
  onAcquireCartosoundContour?: (activeView: CanonicalICEView) => void;
  onClearCartosoundContours?: () => void;
  onToggleCaliperTool?: (active: boolean) => void;
  onAutoMeasureCurrentView?: (activeView: CanonicalICEView) => void;
  onTriggerWatchmanTugTest?: () => void;
  onHighlightStructure?: (structureId: number | null) => void;
}

interface ManeuverDemoAnimationState {
  active: boolean;
  viewId: string;
  elapsedSec: number;
  durationSec: number;
  startState: CatheterState;
  endState: CatheterState;
}

/**
 * 4-Zone Non-Scrolling Clinical Workstation UI Controller
 * Implements SPEC PATCH #9-#12:
 *   Zone 1: 44px Top Clinical Header
 *   Zone 2: 300px Collapsible Left Curriculum & Maneuver Drawer
 *   Zone 3: Dual 3D Heart + Sacred #030508 Ultrasound Sector Viewports
 *   Zone 4: 132px Bottom Tactile Catheter Handle & Contextual Procedural Deck
 */
export class WorkstationUI {
  private readonly root: HTMLElement;
  private readonly callbacks: WorkstationUICallbacks;

  private activeTrack: ClinicalTrackId = 'zero_fluoro_ablation';
  private activeMode: LearningModeId = 'atlas_demo';
  private activeView: CanonicalICEView = CANONICAL_ICE_VIEWS[1]; // Default: 02. Home View
  private challengeTargetView: CanonicalICEView = CANONICAL_ICE_VIEWS[12]; // Default challenge: 13. Fossa Ovalis

  private targetCatheterState: CatheterState = { ...DEFAULT_CATHETER_STATE };
  private displayCatheterState: CatheterState = { ...DEFAULT_CATHETER_STATE };
  private ultrasoundSettings: UltrasoundSettings = {
    ...DEFAULT_ULTRASOUND_SETTINGS,
    labelOverlayMode: 'hover',
    tgcOffsetsDb: [...DEFAULT_ULTRASOUND_SETTINGS.tgcOffsetsDb],
  };
  private simState: ProceduralSimulationState = {
    ...DEFAULT_PROCEDURAL_SIMULATION_STATE,
    cartosoundContours: [],
  };

  private activeCameraPreset: CameraPresetId = 'ra_cutaway';
  private cutawayMode: CutawayDisplayMode = 'surgical_glass';
  private caliperToolActive = false;
  private drawerCollapsed = false;
  private layersPopoverOpen = false;
  private tgcPopoverOpen = false;
  private literatureModalOpen = false;
  private highlightedCitationId: string | null = null;

  private intersectedStructureIds: number[] = [];
  private hoveredStructureId: number | null = null;
  private passStatus: PassCriteriaStatus = {
    positionPass: true,
    positionDetail: 'Proximal PET cap flush at LAA ostium (1.2 mm distal to Coumadin ridge)',
    anchorPass: true,
    anchorDetail: 'Dual-row 18 J-anchors engaged (< 1.0 mm tug recoil)',
    sizePass: true,
    compressionPct: 19.6,
    measuredDiametersMm: { deg0: 21.8, deg45: 21.5, deg90: 21.7, deg135: 22.0 },
    sizeDetail: '19.6% compression (target 10–30% for 27 mm Watchman FLX)',
    sealPass: true,
    maxLeakJetMm: 0.0,
    sealDetail: 'Complete Color Doppler ostial seal (0.0 mm peri-device leak)',
    allPassed: true,
  };

  private layerVisibility: LayerVisibilityMap = {
    right_heart_chamber: true,
    left_heart_chamber: true,
    cardiac_valve: true,
    interatrial_septum: true,
    intracardiac_landmark: true,
    conduction_system: true,
    coronary_or_esophagus: true,
    pericardium: true,
    procedural_device: true,
    ultrasound_fan: true,
    cartosound_contours: true,
  };

  private demoAnim: ManeuverDemoAnimationState = {
    active: false,
    viewId: 'zf_02',
    elapsedSec: 0,
    durationSec: 4.8,
    startState: { ...DEFAULT_CATHETER_STATE },
    endState: { ...DEFAULT_CATHETER_STATE },
  };

  private tugTestTimerSec = 0;

  // Key DOM references
  private gridContainer!: HTMLElement;
  private threeViewportMount!: HTMLElement;
  private ultrasoundViewportMount!: HTMLElement;
  private viewListContainer!: HTMLElement;
  private activeViewDetailContainer!: HTMLElement;
  private calloutStrip3D!: HTMLElement;
  private hoverReadout3D!: HTMLElement;
  private handleSvgBox!: HTMLElement;
  private layersPopoverEl!: HTMLElement;
  private tgcPopoverEl!: HTMLElement;
  private literatureModalBackdrop!: HTMLElement;

  // Damped DOF UI elements
  private dofElements: {
    sReadout?: HTMLElement;
    sInput?: HTMLInputElement;
    sDialIndicator?: SVGElement;
    torqueReadout?: HTMLElement;
    torqueInput?: HTMLInputElement;
    torqueDialIndicator?: SVGElement;
    apReadout?: HTMLElement;
    apInput?: HTMLInputElement;
    apDialIndicator?: SVGElement;
    lrReadout?: HTMLElement;
    lrInput?: HTMLInputElement;
    lrDialIndicator?: SVGElement;
    omniCard?: HTMLElement;
    omniReadout?: HTMLElement;
    omniInput?: HTMLInputElement;
    omniDialIndicator?: SVGElement;
    omniPresetBtns: HTMLButtonElement[];
  } = { omniPresetBtns: [] };

  // Contextual bottom deck elements
  private contextPanes: {
    watchman?: HTMLElement;
    challenge?: HTMLElement;
    zeroFluoro?: HTMLElement;
  } = {};

  private challengeElements: {
    titleBadge?: HTMLElement;
    scoreReadout?: HTMLElement;
    barFill?: HTMLElement;
    deltaS?: HTMLElement;
    deltaTorque?: HTMLElement;
    deltaAp?: HTMLElement;
    deltaLr?: HTMLElement;
    deltaOmni?: HTMLElement;
    coachingText?: HTMLElement;
  } = {};

  private passBadgeEls: {
    p?: HTMLElement;
    a?: HTMLElement;
    sSize?: HTMLElement;
    sSeal?: HTMLElement;
    summary?: HTMLElement;
  } = {};

  constructor(rootElement: HTMLElement, callbacks: WorkstationUICallbacks = {}) {
    this.root = rootElement;
    this.callbacks = callbacks;
    this.buildDOM();
    this.bindKeyboardShortcuts();
    this.selectView('zf_02', { animate: false, applyTargetState: true });
  }

  public getThreeViewportContainer(): HTMLElement {
    return this.threeViewportMount;
  }

  public getUltrasoundViewportContainer(): HTMLElement {
    return this.ultrasoundViewportMount;
  }

  public getCatheterState(): CatheterState {
    return { ...this.displayCatheterState };
  }

  public getTargetCatheterState(): CatheterState {
    return { ...this.targetCatheterState };
  }

  public getUltrasoundSettings(): UltrasoundSettings {
    return {
      ...this.ultrasoundSettings,
      tgcOffsetsDb: [...this.ultrasoundSettings.tgcOffsetsDb],
    };
  }

  public getSimulationState(): ProceduralSimulationState {
    return { ...this.simState };
  }

  public getActiveView(): CanonicalICEView {
    return this.activeView;
  }

  public getActiveTrack(): ClinicalTrackId {
    return this.activeTrack;
  }

  public getLearningMode(): LearningModeId {
    return this.activeMode;
  }

  public getLayerVisibility(): LayerVisibilityMap {
    return { ...this.layerVisibility };
  }

  public getCutawayMode(): CutawayDisplayMode {
    return this.cutawayMode;
  }

  public isDemoPlaying(): boolean {
    return this.demoAnim.active;
  }

  public setCatheterState(
    partial: Partial<CatheterState>,
    immediate = false,
    fromUserControl = false
  ): void {
    if (fromUserControl && this.demoAnim.active) {
      this.stopManeuverDemo();
    }

    const next: CatheterState = {
      ...this.targetCatheterState,
      ...partial,
    };

    // Clamp ranges per Frozen Architecture Contract
    next.sMm = Math.max(-60, Math.min(95, next.sMm));
    next.torqueDeg = Math.max(-180, Math.min(180, next.torqueDeg));
    next.apDeg = Math.max(-150, Math.min(150, next.apDeg));
    next.lrDeg = Math.max(-120, Math.min(120, next.lrDeg));

    if (next.model !== 'nuvision_10f') {
      next.omniDeg = 0;
      next.biplaneEnabled = false;
      next.volume4dEnabled = false;
    } else {
      next.omniDeg = Math.max(0, Math.min(180, next.omniDeg));
    }

    this.targetCatheterState = next;
    if (immediate) {
      this.displayCatheterState = { ...next };
    }

    this.syncHeaderButtons();
    this.syncBottomDeckControls();
    this.syncUltrasoundToolbar();
    this.callbacks.onCatheterStateChange?.(
      { ...this.displayCatheterState },
      { ...this.targetCatheterState }
    );
  }

  public setUltrasoundSettings(partial: Partial<UltrasoundSettings>): void {
    this.ultrasoundSettings = {
      ...this.ultrasoundSettings,
      ...partial,
      depthCm: Math.max(6, Math.min(16, partial.depthCm ?? this.ultrasoundSettings.depthCm)),
      gainDb: Math.max(20, Math.min(90, partial.gainDb ?? this.ultrasoundSettings.gainDb)),
      dynamicRangeDb: Math.max(
        40,
        Math.min(80, partial.dynamicRangeDb ?? this.ultrasoundSettings.dynamicRangeDb)
      ),
      frequencyMhz: Math.max(
        5.0,
        Math.min(10.0, partial.frequencyMhz ?? this.ultrasoundSettings.frequencyMhz)
      ),
      focusCm: Math.max(2.0, Math.min(14.0, partial.focusCm ?? this.ultrasoundSettings.focusCm)),
    };
    this.syncUltrasoundToolbar();
    this.callbacks.onUltrasoundSettingsChange?.(this.getUltrasoundSettings());
  }

  public setSimulationState(partial: Partial<ProceduralSimulationState>): void {
    this.simState = {
      ...this.simState,
      ...partial,
    };
    this.syncSimulationControls();
    this.callbacks.onSimulationStateChange?.(this.getSimulationState());
  }

  public selectView(
    viewId: string,
    options: { animate?: boolean; applyTargetState?: boolean } = {}
  ): void {
    const view = getCanonicalViewById(viewId);
    if (!view) return;

    const applyTargetState = options.applyTargetState ?? true;
    const animate = options.animate ?? false;

    this.activeView = view;
    if (this.activeMode === 'practice_challenge') {
      this.challengeTargetView = view;
    }
    if (this.activeTrack !== view.track) {
      this.activeTrack = view.track;
      this.renderViewList();
      this.callbacks.onTrackChange?.(this.activeTrack);
    }

    // Update recommended depth & procedural simulation state for the selected view
    this.setUltrasoundSettings({ depthCm: view.recommendedDepthCm });
    this.configureProceduralStateForView(view);

    if (animate) {
      this.playManeuverDemo(view.id);
    } else if (applyTargetState && this.activeMode !== 'practice_challenge') {
      this.stopManeuverDemo();
      this.setCatheterState(
        {
          ...view.targetState,
          model:
            view.recommendedCatheter === 'nuvision_10f'
              ? 'nuvision_10f'
              : this.targetCatheterState.model,
        },
        true,
        false
      );
    }

    this.highlightActiveViewInList();
    this.renderActiveViewDetail();
    this.render3DCalloutStrip();
    this.syncContextualDeckPane();
    this.callbacks.onViewSelect?.(view);
  }

  /**
   * Starts the 4-Phase (t0 -> t1 -> t2 -> t3) Animated Maneuver Choreography
   * from the prerequisite startingViewId to the target CanonicalICEView.
   */
  public playManeuverDemo(viewId?: string): void {
    const targetView = viewId ? getCanonicalViewById(viewId) ?? this.activeView : this.activeView;
    const startView =
      getCanonicalViewById(targetView.startingViewId) ??
      getCanonicalViewById('zf_02') ??
      targetView;

    // If starting view is identical to target view (e.g., zf_01), start from a retracted baseline
    const startState: CatheterState =
      startView.id === targetView.id
        ? {
            ...targetView.targetState,
            sMm: Math.max(-60, targetView.targetState.sMm - 25),
            torqueDeg: 0,
            apDeg: 0,
            lrDeg: 0,
            omniDeg: 0,
          }
        : {
            ...startView.targetState,
            model:
              targetView.recommendedCatheter === 'nuvision_10f'
                ? 'nuvision_10f'
                : this.targetCatheterState.model,
          };

    const endState: CatheterState = {
      ...targetView.targetState,
      model:
        targetView.recommendedCatheter === 'nuvision_10f'
          ? 'nuvision_10f'
          : startState.model,
    };

    this.demoAnim = {
      active: true,
      viewId: targetView.id,
      elapsedSec: 0,
      durationSec: 4.8,
      startState,
      endState,
    };

    this.setCatheterState(startState, true, false);
    this.syncDemoChoreographyUI();
  }

  public stopManeuverDemo(): void {
    if (!this.demoAnim.active) return;
    this.demoAnim.active = false;
    this.syncDemoChoreographyUI();
  }

  /**
   * Called every animation frame (60 FPS) by main.ts.
   * Advances:
   *   1. 4-phase (t0..t3) maneuver demo choreography (if active)
   *   2. Watchman FLX Tug Test recoil animation (if active)
   *   3. Critically damped handle smoothing (tau = 40 ms per SPEC PATCH #12)
   *   4. Fellow Practice Challenge live 6-DOF alignment scoring
   */
  public updateFrame(dtSeconds: number): CatheterState {
    const clampedDt = Math.max(0.001, Math.min(0.05, dtSeconds));

    // 1. Advance 4-stage maneuver choreography if playing
    if (this.demoAnim.active) {
      this.demoAnim.elapsedSec += clampedDt;
      const t = this.demoAnim.elapsedSec;
      const total = this.demoAnim.durationSec;

      if (t >= total) {
        this.demoAnim.active = false;
        this.setCatheterState(this.demoAnim.endState, true, false);
        this.syncDemoChoreographyUI();
      } else {
        const s0 = this.demoAnim.startState;
        const s1 = this.demoAnim.endState;

        // Phase windows from motion_manifest.json:
        // t0 [0.0, 0.8]: Anticipation at prerequisite station
        // t1 [0.8, 2.4]: Axial translation (sMm) & shaft torque (torqueDeg)
        // t2 [2.4, 3.8]: Constant-curvature deflection (apDeg, lrDeg) & NuVision omniDeg
        // t3 [3.8, 4.8]: Critically damped settle & contour lock
        const uDrive = this.smoothstep(Math.max(0, Math.min(1, (t - 0.8) / 1.6)));
        const uBend = this.smoothstep(Math.max(0, Math.min(1, (t - 2.2) / 1.6)));

        const currentStation = uDrive > 0.45 ? s1.station : s0.station;

        this.targetCatheterState = {
          model: s1.model,
          station: currentStation,
          sMm: s0.sMm + (s1.sMm - s0.sMm) * uDrive,
          torqueDeg: s0.torqueDeg + (s1.torqueDeg - s0.torqueDeg) * uDrive,
          apDeg: s0.apDeg + (s1.apDeg - s0.apDeg) * uBend,
          lrDeg: s0.lrDeg + (s1.lrDeg - s0.lrDeg) * uBend,
          omniDeg: s0.omniDeg + (s1.omniDeg - s0.omniDeg) * uBend,
          biplaneEnabled: uBend > 0.5 ? s1.biplaneEnabled : s0.biplaneEnabled,
          volume4dEnabled: uBend > 0.5 ? s1.volume4dEnabled : s0.volume4dEnabled,
        };
        this.syncDemoChoreographyUI();
      }
    }

    // 2. Advance Watchman Tug Test pulse if active
    if (this.simState.watchmanTugActive) {
      this.tugTestTimerSec += clampedDt;
      if (this.tugTestTimerSec >= 1.8) {
        this.tugTestTimerSec = 0;
        this.setSimulationState({ watchmanTugActive: false });
      }
    }

    // 3. Critically damped spring interpolation (tau = 40 ms = 0.040 s per SPEC PATCH #12)
    const tau = 0.04;
    const alpha = 1 - Math.exp(-clampedDt / tau);

    const prev = this.displayCatheterState;
    const targ = this.targetCatheterState;

    const moved =
      Math.abs(targ.sMm - prev.sMm) > 0.01 ||
      Math.abs(targ.torqueDeg - prev.torqueDeg) > 0.01 ||
      Math.abs(targ.apDeg - prev.apDeg) > 0.01 ||
      Math.abs(targ.lrDeg - prev.lrDeg) > 0.01 ||
      Math.abs(targ.omniDeg - prev.omniDeg) > 0.01 ||
      targ.station !== prev.station ||
      targ.model !== prev.model ||
      targ.biplaneEnabled !== prev.biplaneEnabled ||
      targ.volume4dEnabled !== prev.volume4dEnabled;

    if (moved) {
      this.displayCatheterState = {
        model: targ.model,
        station: targ.station,
        sMm: prev.sMm + (targ.sMm - prev.sMm) * alpha,
        torqueDeg: prev.torqueDeg + (targ.torqueDeg - prev.torqueDeg) * alpha,
        apDeg: prev.apDeg + (targ.apDeg - prev.apDeg) * alpha,
        lrDeg: prev.lrDeg + (targ.lrDeg - prev.lrDeg) * alpha,
        omniDeg: prev.omniDeg + (targ.omniDeg - prev.omniDeg) * alpha,
        biplaneEnabled: targ.biplaneEnabled,
        volume4dEnabled: targ.volume4dEnabled,
      };
      this.syncBottomDeckControls();
      this.callbacks.onCatheterStateChange?.(
        { ...this.displayCatheterState },
        { ...this.targetCatheterState }
      );
    }

    // 4. Update Fellow Practice Challenge HUD if in challenge mode
    if (this.activeMode === 'practice_challenge') {
      const result = evaluatePracticeChallengeAlignment(
        this.displayCatheterState,
        this.challengeTargetView,
        this.intersectedStructureIds
      );
      this.renderChallengeAlignmentHUD(result);
    }

    return { ...this.displayCatheterState };
  }

  public updatePassCriteriaStatus(status: PassCriteriaStatus): void {
    this.passStatus = status;
    this.syncPassCriteriaBadges();
  }

  public updateHoveredStructure(
    structureId: number | null,
    depthMm?: number,
    source: '2d' | '3d' = '2d'
  ): void {
    this.hoveredStructureId = structureId;
    if (!this.hoverReadout3D) return;

    if (structureId && ANATOMICAL_STRUCTURES[structureId]) {
      const meta = ANATOMICAL_STRUCTURES[structureId];
      const depthStr = depthMm !== undefined ? ` · ${(depthMm / 10).toFixed(1)} cm` : '';
      this.hoverReadout3D.innerHTML = `<span style="color:${meta.surgicalBaseHex};font-weight:700;">●</span> <strong>${meta.name}</strong> <span class="tabular-nums">(${meta.shortLabel}${depthStr})</span> — ${meta.clinicalSignificance}`;
    } else {
      this.hoverReadout3D.textContent =
        source === '2d'
          ? 'Hover structure on 2D Ultrasound or 3D Heart for FMA ID & depth telemetry'
          : 'Ready · 163 BodyParts3D FMA Meshes + Real-Time Acoustic Slicer';
    }
  }

  public updateIntersectedStructures(structureIds: number[]): void {
    this.intersectedStructureIds = structureIds;
    const chips = this.root.querySelectorAll<HTMLElement>('[data-landmark-chip-id]');
    chips.forEach((chip) => {
      const id = Number(chip.dataset.landmarkChipId);
      chip.classList.toggle('hit', structureIds.includes(id));
    });
  }

  // ============================================================================
  // PRIVATE DOM CONSTRUCTION & EVENT BINDING
  // ============================================================================

  private buildDOM(): void {
    this.root.innerHTML = '';
    this.gridContainer = document.createElement('div');
    this.gridContainer.className = 'ice-workstation-grid';

    this.gridContainer.appendChild(this.buildTopHeader());
    this.gridContainer.appendChild(this.buildLeftDrawer());
    this.gridContainer.appendChild(this.buildDualViewports());
    this.gridContainer.appendChild(this.buildBottomDeck());
    this.root.appendChild(this.gridContainer);
    this.root.appendChild(this.buildLiteratureModal());

    this.renderViewList();
    this.renderActiveViewDetail();
    this.syncHeaderButtons();
    this.syncBottomDeckControls();
    this.syncContextualDeckPane();
    this.syncPassCriteriaBadges();
  }

  private buildTopHeader(): HTMLElement {
    const header = document.createElement('header');
    header.className = 'zone-top-header';

    header.innerHTML = `
      <div class="header-brand">
        <div class="header-brand-mark">ICE</div>
        <div class="header-brand-text">
          <span class="header-brand-title">ICE &amp; WATCHMAN FLX™ SIMULATOR</span>
          <span class="header-brand-subtitle">3D BodyParts3D FMA · 60 FPS Acoustic Slicer</span>
        </div>
      </div>

      <div class="header-control-groups">
        <!-- Clinical Track Switcher -->
        <div class="segmented-group" role="group" aria-label="Clinical Track">
          <span class="segmented-group-label">Track</span>
          <button type="button" class="seg-btn" data-track-btn="zero_fluoro_ablation" title="Zero-Fluoroscopy ICE Ablation Curriculum (18 Standard Views)">
            Zero-Fluoro <span class="seg-count-badge">18</span>
          </button>
          <button type="button" class="seg-btn" data-track-btn="watchman_laac" title="LAA Watchman FLX Implantation Curriculum (10 Views &amp; Stages)">
            Watchman LAAC <span class="seg-count-badge">10</span>
          </button>
        </div>

        <!-- Catheter Hardware Switcher -->
        <div class="segmented-group" role="group" aria-label="ICE Catheter Hardware">
          <span class="segmented-group-label">Probe</span>
          <button type="button" class="seg-btn" data-catheter-btn="soundstar_10f" title="Biosense Webster SoundStar 10F 2D Phased-Array">
            SoundStar 10F
          </button>
          <button type="button" class="seg-btn" data-catheter-btn="soundstar_8f" title="Biosense Webster SoundStar Eco 8F 2D Phased-Array">
            SoundStar 8F
          </button>
          <button type="button" class="seg-btn" data-catheter-btn="nuvision_10f" title="Biosense Webster NuVision 10F 4D Matrix Array (0°–180° Electronic Multiplane + Biplane + 4D En-Face)">
            NuVision 4D
          </button>
        </div>

        <!-- Learning Mode Switcher -->
        <div class="segmented-group" role="group" aria-label="Learning Mode">
          <span class="segmented-group-label">Mode</span>
          <button type="button" class="seg-btn" data-mode-btn="atlas_demo">
            Atlas &amp; Demo
          </button>
          <button type="button" class="seg-btn" data-mode-btn="free_sandbox">
            Free Sandbox
          </button>
          <button type="button" class="seg-btn" data-mode-btn="practice_challenge">
            Fellow Challenge
          </button>
        </div>

        <!-- Literature & Sizing Matrix Modal Trigger -->
        <button type="button" class="header-action-btn" id="btn-open-literature-modal" title="Open Official Boston Scientific Watchman FLX / FLX Pro Sizing Matrix &amp; Clinical Literature">
          <span class="tabular-nums">[Lit]</span> Refs
        </button>
      </div>
    `;

    // Track switcher listeners
    header.querySelectorAll<HTMLButtonElement>('[data-track-btn]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const track = btn.dataset.trackBtn as ClinicalTrackId;
        this.switchTrack(track);
      });
    });

    // Catheter model switcher listeners
    header.querySelectorAll<HTMLButtonElement>('[data-catheter-btn]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const model = btn.dataset.catheterBtn as CatheterModelId;
        this.setCatheterState({ model }, false, true);
      });
    });

    // Learning mode switcher listeners
    header.querySelectorAll<HTMLButtonElement>('[data-mode-btn]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.modeBtn as LearningModeId;
        this.switchLearningMode(mode);
      });
    });

    header
      .querySelector('#btn-open-literature-modal')
      ?.addEventListener('click', () => this.openLiteratureModal());

    return header;
  }

  private buildLeftDrawer(): HTMLElement {
    const drawer = document.createElement('aside');
    drawer.className = 'zone-left-drawer';

    const headerBar = document.createElement('div');
    headerBar.className = 'drawer-header-bar';
    headerBar.innerHTML = `
      <span class="drawer-header-title" id="drawer-track-heading">STANDARD ICE VIEWS (18)</span>
      <button type="button" class="drawer-collapse-btn" id="btn-toggle-drawer" title="Collapse/Expand Curriculum Drawer">«</button>
    `;

    const innerContent = document.createElement('div');
    innerContent.className = 'drawer-inner-content';

    const listWrapper = document.createElement('div');
    listWrapper.className = 'drawer-view-list-container';
    this.viewListContainer = document.createElement('div');
    this.viewListContainer.className = 'drawer-view-list';
    listWrapper.appendChild(this.viewListContainer);

    this.activeViewDetailContainer = document.createElement('div');
    this.activeViewDetailContainer.className = 'drawer-active-view-detail';

    innerContent.appendChild(listWrapper);
    innerContent.appendChild(this.activeViewDetailContainer);

    drawer.appendChild(headerBar);
    drawer.appendChild(innerContent);

    headerBar.querySelector('#btn-toggle-drawer')?.addEventListener('click', (e) => {
      const btn = e.currentTarget as HTMLButtonElement;
      this.drawerCollapsed = !this.drawerCollapsed;
      this.gridContainer.classList.toggle('drawer-collapsed', this.drawerCollapsed);
      btn.textContent = this.drawerCollapsed ? '»' : '«';
      window.dispatchEvent(new Event('resize'));
    });

    return drawer;
  }

  private buildDualViewports(): HTMLElement {
    const dual = document.createElement('main');
    dual.className = 'zone-dual-viewports';

    // ------------------------------------------------------------------------
    // LEFT VIEWPORT: 3D ANATOMICAL HEART & CARTOSOUND STAGE
    // ------------------------------------------------------------------------
    const stage3D = document.createElement('section');
    stage3D.className = 'viewport-3d-stage';

    this.threeViewportMount = document.createElement('div');
    this.threeViewportMount.className = 'viewport-canvas-mount';
    this.threeViewportMount.id = 'viewport-3d-container';

    const topBar3D = document.createElement('div');
    topBar3D.className = 'stage-3d-top-bar';
    topBar3D.innerHTML = `
      <div class="floating-pill-group" role="group" aria-label="3D Camera Presets">
        <button type="button" class="floating-pill-btn" data-cam-preset="anterior">Anterior</button>
        <button type="button" class="floating-pill-btn active" data-cam-preset="ra_cutaway">RA Cutaway</button>
        <button type="button" class="floating-pill-btn" data-cam-preset="la_watchman">LA / Watchman</button>
        <button type="button" class="floating-pill-btn" data-cam-preset="basal_valves">Basal Valves</button>
        <button type="button" class="floating-pill-btn" data-cam-preset="follow_tip">Follow Tip</button>
        <button type="button" class="floating-pill-btn active" id="btn-cutaway-glass" title="Toggle Surgical Subsurface Glass vs Solid Myocardium">Glass Cutaway</button>
      </div>

      <div class="floating-pill-group">
        <select class="floating-select" id="select-laa-morphology" aria-label="LAA Morphology">
          <option value="chicken_wing">LAA: Chicken Wing</option>
          <option value="windsock">LAA: Windsock</option>
          <option value="cactus">LAA: Cactus</option>
          <option value="cauliflower">LAA: Cauliflower</option>
        </select>
        <button type="button" class="floating-pill-btn" id="btn-toggle-layers-popover">
          Layers &amp; Pathology ▾
        </button>
      </div>
    `;

    // Layers & Pathology Popover
    this.layersPopoverEl = document.createElement('div');
    this.layersPopoverEl.className = 'layers-pathology-popover';
    this.layersPopoverEl.innerHTML = `
      <div class="popover-section-heading">3D Anatomical Layer Visibility</div>
      <label class="layer-toggle-row">
        <span>Right Heart (RA / RV / Venae Cavae / PA)</span>
        <input type="checkbox" data-layer-key="right_heart_chamber" checked />
      </label>
      <label class="layer-toggle-row">
        <span>Left Heart (LA / LAA / LV / PVs / Aorta)</span>
        <input type="checkbox" data-layer-key="left_heart_chamber" checked />
      </label>
      <label class="layer-toggle-row">
        <span>Cardiac Valves (TV / MV / AoV / PV)</span>
        <input type="checkbox" data-layer-key="cardiac_valve" checked />
      </label>
      <label class="layer-toggle-row">
        <span>Interatrial Septum &amp; Fossa Ovalis</span>
        <input type="checkbox" data-layer-key="interatrial_septum" checked />
      </label>
      <label class="layer-toggle-row">
        <span>Intracardiac Landmarks (Crista /Papillary)</span>
        <input type="checkbox" data-layer-key="intracardiac_landmark" checked />
      </label>
      <label class="layer-toggle-row">
        <span>Conduction System (His / AV Node)</span>
        <input type="checkbox" data-layer-key="conduction_system" checked />
      </label>
      <label class="layer-toggle-row">
        <span>Coronary Arteries &amp; Retrocardiac Esophagus</span>
        <input type="checkbox" data-layer-key="coronary_or_esophagus" checked />
      </label>
      <label class="layer-toggle-row">
        <span>3D Ultrasound Sector Fan Frustum</span>
        <input type="checkbox" data-layer-key="ultrasound_fan" checked />
      </label>
      <label class="layer-toggle-row">
        <span>CARTOSOUND™ 3D Acquired Contours</span>
        <input type="checkbox" data-layer-key="cartosound_contours" checked />
      </label>

      <div class="popover-section-heading" style="margin-top:4px;">Pathology &amp; Procedural Sim</div>
      <div class="layer-toggle-row">
        <span>Pericardial Effusion</span>
        <select class="floating-select" id="select-pericardial-effusion">
          <option value="0">0 mL (Normal)</option>
          <option value="50">50 mL (Early Posterior)</option>
          <option value="200">200 mL (Tamponade)</option>
        </select>
      </div>
      <label class="layer-toggle-row">
        <span>LAA Apical Thrombus Present</span>
        <input type="checkbox" id="chk-laa-thrombus" />
      </label>
      <label class="layer-toggle-row">
        <span>Irrigated RF Ablation Catheter Active</span>
        <input type="checkbox" id="chk-ablation-catheter" />
      </label>
    `;

    const bottomBar3D = document.createElement('div');
    bottomBar3D.className = 'stage-3d-bottom-bar';
    this.calloutStrip3D = document.createElement('div');
    this.calloutStrip3D.className = 'stage-3d-callout-strip';
    this.hoverReadout3D = document.createElement('div');
    this.hoverReadout3D.className = 'stage-3d-hover-readout';
    this.hoverReadout3D.textContent =
      'Hover structure on 2D Ultrasound or 3D Heart for FMA ID & depth telemetry';

    bottomBar3D.appendChild(this.calloutStrip3D);
    bottomBar3D.appendChild(this.hoverReadout3D);

    stage3D.appendChild(this.threeViewportMount);
    stage3D.appendChild(topBar3D);
    stage3D.appendChild(this.layersPopoverEl);
    stage3D.appendChild(bottomBar3D);

    // 3D Top Bar Listeners
    topBar3D.querySelectorAll<HTMLButtonElement>('[data-cam-preset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        topBar3D
          .querySelectorAll('[data-cam-preset]')
          .forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.activeCameraPreset = btn.dataset.camPreset as CameraPresetId;
        this.callbacks.onCameraPresetSelect?.(this.activeCameraPreset);
      });
    });

    topBar3D.querySelector('#btn-cutaway-glass')?.addEventListener('click', (e) => {
      const btn = e.currentTarget as HTMLButtonElement;
      this.cutawayMode =
        this.cutawayMode === 'surgical_glass' ? 'anatomical_solid' : 'surgical_glass';
      btn.classList.toggle('active', this.cutawayMode === 'surgical_glass');
      btn.textContent =
        this.cutawayMode === 'surgical_glass' ? 'Glass Cutaway' : 'Solid Myocardium';
      this.callbacks.onCutawayModeChange?.(this.cutawayMode);
    });

    topBar3D.querySelector('#select-laa-morphology')?.addEventListener('change', (e) => {
      const val = (e.currentTarget as HTMLSelectElement).value as LAAMorphologyId;
      this.setSimulationState({ laaMorphology: val });
    });

    topBar3D.querySelector('#btn-toggle-layers-popover')?.addEventListener('click', () => {
      this.layersPopoverOpen = !this.layersPopoverOpen;
      this.layersPopoverEl.classList.toggle('open', this.layersPopoverOpen);
    });

    this.layersPopoverEl
      .querySelectorAll<HTMLInputElement>('[data-layer-key]')
      .forEach((chk) => {
        chk.addEventListener('change', () => {
          const key = chk.dataset.layerKey as keyof LayerVisibilityMap;
          this.layerVisibility[key] = chk.checked;
          this.callbacks.onLayerVisibilityChange?.(this.getLayerVisibility());
        });
      });

    this.layersPopoverEl
      .querySelector('#select-pericardial-effusion')
      ?.addEventListener('change', (e) => {
        const ml = Number((e.currentTarget as HTMLSelectElement).value) as 0 | 50 | 200;
        this.setSimulationState({ pericardialEffusionMl: ml });
      });

    this.layersPopoverEl.querySelector('#chk-laa-thrombus')?.addEventListener('change', (e) => {
      const checked = (e.currentTarget as HTMLInputElement).checked;
      this.setSimulationState({ laaThrombusPresent: checked });
    });

    this.layersPopoverEl
      .querySelector('#chk-ablation-catheter')
      ?.addEventListener('change', (e) => {
        const checked = (e.currentTarget as HTMLInputElement).checked;
        this.setSimulationState({ ablationCatheterActive: checked });
      });

    // ------------------------------------------------------------------------
    // RIGHT VIEWPORT: SACRED #030508 LIVE ULTRASOUND SECTOR CONSOLE
    // ------------------------------------------------------------------------
    const consoleEcho = document.createElement('section');
    consoleEcho.className = 'viewport-ultrasound-console';

    const sacredStage = document.createElement('div');
    sacredStage.className = 'ultrasound-sacred-stage';

    this.ultrasoundViewportMount = document.createElement('div');
    this.ultrasoundViewportMount.className = 'viewport-canvas-mount';
    this.ultrasoundViewportMount.id = 'viewport-ultrasound-container';
    sacredStage.appendChild(this.ultrasoundViewportMount);

    // TGC 6-band Curve Popover
    this.tgcPopoverEl = document.createElement('div');
    this.tgcPopoverEl.className = 'tgc-curve-popover';
    const bandLabels = ['1–2 cm', '3–4 cm', '5–6 cm', '7–8 cm', '9–11 cm', '12–16 cm'];
    this.tgcPopoverEl.innerHTML = `
      <div class="popover-section-heading" style="display:flex;justify-content:space-between;align-items:center;">
        <span>6-Band Time Gain Comp (TGC)</span>
        <button type="button" class="echo-softkey-btn" id="btn-reset-tgc">0 dB Flat</button>
      </div>
      ${bandLabels
        .map(
          (lbl, idx) => `
        <div class="tgc-band-row">
          <span>${lbl}</span>
          <input type="range" min="-15" max="15" step="1" value="0" data-tgc-band="${idx}" />
          <span class="tabular-nums" data-tgc-val="${idx}">+0 dB</span>
        </div>
      `
        )
        .join('')}
    `;
    sacredStage.appendChild(this.tgcPopoverEl);

    const echoToolbar = document.createElement('div');
    echoToolbar.className = 'ultrasound-console-toolbar';
    echoToolbar.innerHTML = `
      <div class="echo-softkey-group">
        <button type="button" class="echo-softkey-btn" id="btn-echo-freeze" title="Freeze Ultrasound Frame [Space]">Freeze</button>
        <button type="button" class="echo-softkey-btn" id="btn-echo-caliper" title="2-Point Digital Caliper [M]">Caliper</button>
        <button type="button" class="echo-softkey-btn" id="btn-echo-automeasure" title="Auto-Measure Current View Landmarks">Auto</button>
        <button type="button" class="echo-softkey-btn" id="btn-echo-doppler" title="BART Color Doppler [D]">Doppler</button>
        <button type="button" class="echo-softkey-btn active" id="btn-echo-labels" title="Cycle Structure Labels: Off / Hover / All [L]">Lbl:HOVER</button>
      </div>

      <div class="echo-softkey-group">
        <button type="button" class="echo-softkey-btn" id="btn-echo-biplane" title="NuVision Simultaneous 0°/90° Biplane (X-Plane)">Biplane</button>
        <button type="button" class="echo-softkey-btn" id="btn-echo-4d" title="NuVision 4D En-Face Surgeon's View">4D</button>
        <button type="button" class="echo-softkey-btn active-amber" id="btn-echo-cartosound" title="Acquire 3D CARTOSOUND Contour Ring [C]">+CARTO</button>
      </div>

      <div class="echo-softkey-group">
        <button type="button" class="echo-softkey-btn" id="btn-depth-dec" title="Decrease Penetration Depth">D-</button>
        <span class="echo-softkey-btn echo-softkey-label tabular-nums" id="readout-echo-depth" style="pointer-events:none;">10cm</span>
        <button type="button" class="echo-softkey-btn" id="btn-depth-inc" title="Increase Penetration Depth">D+</button>
        <button type="button" class="echo-softkey-btn" id="btn-gain-dec" title="Decrease B-Mode Gain">G-</button>
        <span class="echo-softkey-btn echo-softkey-label tabular-nums" id="readout-echo-gain" style="pointer-events:none;">58dB</span>
        <button type="button" class="echo-softkey-btn" id="btn-gain-inc" title="Increase B-Mode Gain">G+</button>
        <button type="button" class="echo-softkey-btn" id="btn-echo-marker" title="Flip Sector Orientation Marker (Right = Distal/Superior vs Left = Proximal/Inferior)">Mkr:R</button>
        <button type="button" class="echo-softkey-btn" id="btn-echo-tgc" title="Open 6-Band Time Gain Compensation Popover">TGC</button>
      </div>
    `;

    consoleEcho.appendChild(sacredStage);
    consoleEcho.appendChild(echoToolbar);

    // Bind Ultrasound Softkey Listeners
    echoToolbar.querySelector('#btn-echo-freeze')?.addEventListener('click', () => {
      this.setUltrasoundSettings({ frozen: !this.ultrasoundSettings.frozen });
    });

    echoToolbar.querySelector('#btn-echo-caliper')?.addEventListener('click', () => {
      this.caliperToolActive = !this.caliperToolActive;
      this.syncUltrasoundToolbar();
      this.callbacks.onToggleCaliperTool?.(this.caliperToolActive);
    });

    echoToolbar.querySelector('#btn-echo-automeasure')?.addEventListener('click', () => {
      this.caliperToolActive = true;
      this.syncUltrasoundToolbar();
      this.callbacks.onAutoMeasureCurrentView?.(this.activeView);
    });

    echoToolbar.querySelector('#btn-echo-doppler')?.addEventListener('click', () => {
      this.setUltrasoundSettings({
        colorDopplerEnabled: !this.ultrasoundSettings.colorDopplerEnabled,
      });
    });

    echoToolbar.querySelector('#btn-echo-labels')?.addEventListener('click', () => {
      const order: LabelOverlayMode[] = ['all', 'hover', 'off'];
      const nextIdx = (order.indexOf(this.ultrasoundSettings.labelOverlayMode) + 1) % order.length;
      this.setUltrasoundSettings({ labelOverlayMode: order[nextIdx] });
    });

    echoToolbar.querySelector('#btn-echo-biplane')?.addEventListener('click', () => {
      if (this.targetCatheterState.model !== 'nuvision_10f') {
        this.setCatheterState({ model: 'nuvision_10f', biplaneEnabled: true }, false, true);
      } else {
        this.setCatheterState(
          { biplaneEnabled: !this.targetCatheterState.biplaneEnabled },
          false,
          true
        );
      }
    });

    echoToolbar.querySelector('#btn-echo-4d')?.addEventListener('click', () => {
      if (this.targetCatheterState.model !== 'nuvision_10f') {
        this.setCatheterState({ model: 'nuvision_10f', volume4dEnabled: true }, false, true);
      } else {
        this.setCatheterState(
          { volume4dEnabled: !this.targetCatheterState.volume4dEnabled },
          false,
          true
        );
      }
    });

    echoToolbar.querySelector('#btn-echo-cartosound')?.addEventListener('click', () => {
      this.callbacks.onAcquireCartosoundContour?.(this.activeView);
      this.render3DCalloutStrip();
    });

    echoToolbar.querySelector('#btn-depth-dec')?.addEventListener('click', () => {
      this.setUltrasoundSettings({ depthCm: this.ultrasoundSettings.depthCm - 1 });
    });

    echoToolbar.querySelector('#btn-depth-inc')?.addEventListener('click', () => {
      this.setUltrasoundSettings({ depthCm: this.ultrasoundSettings.depthCm + 1 });
    });

    echoToolbar.querySelector('#btn-gain-dec')?.addEventListener('click', () => {
      this.setUltrasoundSettings({ gainDb: this.ultrasoundSettings.gainDb - 2 });
    });

    echoToolbar.querySelector('#btn-gain-inc')?.addEventListener('click', () => {
      this.setUltrasoundSettings({ gainDb: this.ultrasoundSettings.gainDb + 2 });
    });

    echoToolbar.querySelector('#btn-echo-marker')?.addEventListener('click', () => {
      this.setUltrasoundSettings({
        markerSide: this.ultrasoundSettings.markerSide === 'right' ? 'left' : 'right',
      });
    });

    echoToolbar.querySelector('#btn-echo-tgc')?.addEventListener('click', () => {
      this.tgcPopoverOpen = !this.tgcPopoverOpen;
      this.tgcPopoverEl.classList.toggle('open', this.tgcPopoverOpen);
    });

    this.tgcPopoverEl.querySelectorAll<HTMLInputElement>('[data-tgc-band]').forEach((inp) => {
      inp.addEventListener('input', () => {
        const idx = Number(inp.dataset.tgcBand);
        const val = Number(inp.value);
        const nextTgc = [...this.ultrasoundSettings.tgcOffsetsDb];
        nextTgc[idx] = val;
        const readout = this.tgcPopoverEl.querySelector(`[data-tgc-val="${idx}"]`);
        if (readout) {
          readout.textContent = `${val >= 0 ? '+' : ''}${val} dB`;
        }
        this.setUltrasoundSettings({ tgcOffsetsDb: nextTgc });
      });
    });

    this.tgcPopoverEl.querySelector('#btn-reset-tgc')?.addEventListener('click', () => {
      this.tgcPopoverEl.querySelectorAll<HTMLInputElement>('[data-tgc-band]').forEach((inp) => {
        inp.value = '0';
        const idx = Number(inp.dataset.tgcBand);
        const readout = this.tgcPopoverEl.querySelector(`[data-tgc-val="${idx}"]`);
        if (readout) readout.textContent = '+0 dB';
      });
      this.setUltrasoundSettings({ tgcOffsetsDb: [0, 0, 0, 0, 0, 0] });
    });

    dual.appendChild(stage3D);
    dual.appendChild(consoleEcho);
    return dual;
  }

  private buildBottomDeck(): HTMLElement {
    const deck = document.createElement('footer');
    deck.className = 'zone-bottom-deck';

    // ------------------------------------------------------------------------
    // COLUMN 1: CHAMBER STATION PILLS & INTERACTIVE HANDLE SILHOUETTE
    // ------------------------------------------------------------------------
    const colStationHandle = document.createElement('div');
    colStationHandle.className = 'deck-col-station-handle';
    colStationHandle.innerHTML = `
      <div class="station-pills-row" role="group" aria-label="Anatomical Chamber Station">
        <button type="button" class="station-pill-btn active" data-station-btn="ra_venous" title="IVC / Right Atrium / SVC Venous Axis">IVC / RA</button>
        <button type="button" class="station-pill-btn" data-station-btn="rv_outflow" title="Right Ventricle / RVOT / PA Trajectory">RV / RVOT</button>
        <button type="button" class="station-pill-btn" data-station-btn="la_transseptal" title="Transseptal Left Atrium Trajectory">LA Septal</button>
      </div>
      <div class="handle-silhouette-row">
        <div class="handle-svg-box" id="handle-silhouette-svg-box"></div>
      </div>
      <button type="button" class="btn-reset-home" id="btn-reset-home-view" title="Neutralize All Deflection Knobs and Return to Mid-RA Home View (0°)">
        ↺ Reset to Home View (0° Neutral)
      </button>
    `;

    this.handleSvgBox = colStationHandle.querySelector('#handle-silhouette-svg-box') as HTMLElement;

    colStationHandle.querySelectorAll<HTMLButtonElement>('[data-station-btn]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const station = btn.dataset.stationBtn as ChamberStationId;
        this.setCatheterState({ station }, false, true);
      });
    });

    colStationHandle.querySelector('#btn-reset-home-view')?.addEventListener('click', () => {
      this.setCatheterState(
        {
          station: 'ra_venous',
          sMm: 0,
          torqueDeg: 0,
          apDeg: 0,
          lrDeg: 0,
          omniDeg: 0,
        },
        false,
        true
      );
    });

    // ------------------------------------------------------------------------
    // COLUMN 2: 5-DOF TACTILE ROTARY THUMB-WHEELS & SLIDERS
    // ------------------------------------------------------------------------
    const colWheels = document.createElement('div');
    colWheels.className = 'deck-col-dof-wheels';

    // 1. Advance / Withdraw (sMm)
    const cardS = this.createDofWheelCard({
      title: '1. Adv (s)',
      unit: ' mm',
      min: -60,
      max: 95,
      step: 1,
      initial: 0,
      leftHint: 'IVC -60',
      rightHint: 'SVC +95',
      accent: 'cyan',
      onInput: (val) => this.setCatheterState({ sMm: val }, false, true),
      onReset: () => this.setCatheterState({ sMm: 0 }, false, true),
    });
    this.dofElements.sReadout = cardS.readoutEl;
    this.dofElements.sInput = cardS.inputEl;
    this.dofElements.sDialIndicator = cardS.indicatorEl;

    // 2. Torque CW / CCW (torqueDeg)
    const cardTorque = this.createDofWheelCard({
      title: '2. Torque (θ)',
      unit: '°',
      min: -180,
      max: 180,
      step: 1,
      initial: 0,
      leftHint: 'CCW -180°',
      rightHint: 'CW +180°',
      accent: 'cyan',
      onInput: (val) => this.setCatheterState({ torqueDeg: val }, false, true),
      onReset: () => this.setCatheterState({ torqueDeg: 0 }, false, true),
    });
    this.dofElements.torqueReadout = cardTorque.readoutEl;
    this.dofElements.torqueInput = cardTorque.inputEl;
    this.dofElements.torqueDialIndicator = cardTorque.indicatorEl;

    // 3. Anterior / Posterior Deflection (apDeg)
    const cardAp = this.createDofWheelCard({
      title: '3. A/P Tilt',
      unit: '°',
      min: -150,
      max: 150,
      step: 1,
      initial: 0,
      leftHint: 'P (Away)',
      rightHint: 'A (Beam)',
      accent: 'cyan',
      onInput: (val) => this.setCatheterState({ apDeg: val }, false, true),
      onReset: () => this.setCatheterState({ apDeg: 0 }, false, true),
    });
    this.dofElements.apReadout = cardAp.readoutEl;
    this.dofElements.apInput = cardAp.inputEl;
    this.dofElements.apDialIndicator = cardAp.indicatorEl;

    // 4. Left / Right Deflection (lrDeg)
    const cardLr = this.createDofWheelCard({
      title: '4. L/R Tilt',
      unit: '°',
      min: -120,
      max: 120,
      step: 1,
      initial: 0,
      leftHint: 'R -120°',
      rightHint: 'L +120°',
      accent: 'cyan',
      onInput: (val) => this.setCatheterState({ lrDeg: val }, false, true),
      onReset: () => this.setCatheterState({ lrDeg: 0 }, false, true),
    });
    this.dofElements.lrReadout = cardLr.readoutEl;
    this.dofElements.lrInput = cardLr.inputEl;
    this.dofElements.lrDialIndicator = cardLr.indicatorEl;

    // 5. NuVision Electronic Multiplane (omniDeg 0..180)
    const cardOmni = this.createDofWheelCard({
      title: '5. Omni (ψ)',
      unit: '°',
      min: 0,
      max: 180,
      step: 1,
      initial: 0,
      leftHint: '0°',
      rightHint: '180°',
      accent: 'amber',
      includeOmniPresets: true,
      onInput: (val) => {
        if (this.targetCatheterState.model !== 'nuvision_10f') {
          this.setCatheterState({ model: 'nuvision_10f', omniDeg: val }, false, true);
        } else {
          this.setCatheterState({ omniDeg: val }, false, true);
        }
      },
      onReset: () => this.setCatheterState({ omniDeg: 0 }, false, true),
    });
    this.dofElements.omniCard = cardOmni.cardEl;
    this.dofElements.omniReadout = cardOmni.readoutEl;
    this.dofElements.omniInput = cardOmni.inputEl;
    this.dofElements.omniDialIndicator = cardOmni.indicatorEl;
    this.dofElements.omniPresetBtns = cardOmni.presetBtns;

    colWheels.appendChild(cardS.cardEl);
    colWheels.appendChild(cardTorque.cardEl);
    colWheels.appendChild(cardAp.cardEl);
    colWheels.appendChild(cardLr.cardEl);
    colWheels.appendChild(cardOmni.cardEl);

    // ------------------------------------------------------------------------
    // COLUMN 3: CONTEXTUAL PROCEDURAL DECK (WATCHMAN / CHALLENGE / QUICK SWEEP)
    // ------------------------------------------------------------------------
    const colContext = document.createElement('div');
    colContext.className = 'deck-col-contextual';

    // Pane A: Watchman FLX / FLX Pro Deployment, Tug Test & PASS Worksheet
    const paneWatchman = document.createElement('div');
    paneWatchman.className = 'contextual-deck-pane';
    paneWatchman.innerHTML = `
      <div class="context-pane-header">
        <span class="context-pane-title">WATCHMAN FLX™ LAAC &amp; PASS DECK</span>
        <span class="meta-badge amber tabular-nums" id="wm-pass-overall-pill">PASS READY</span>
      </div>

      <div class="watchman-row-controls">
        <div class="watchman-mini-group" role="group" aria-label="Watchman Device Nominal Size">
          <span style="font-size:9.5px;color:var(--text-muted);font-family:var(--font-mono);margin-right:2px;">Size:</span>
          ${([20, 24, 27, 31, 35, 40] as const)
            .map(
              (sz) =>
                `<button type="button" class="wm-size-btn ${sz === 27 ? 'active' : ''}" data-wm-size="${sz}">${sz}</button>`
            )
            .join('')}
        </div>
        <div style="display:flex;align-items:center;gap:4px;">
          <span style="font-size:9.5px;color:var(--text-muted);font-family:var(--font-mono);">TSP Tent:</span>
          <input type="range" min="0" max="14" step="0.5" value="0" id="slider-tsp-tenting" style="width:52px;height:4px;accent-color:var(--accent-amber);" title="Fossa Ovalis Transseptal Needle Tenting (0–14 mm)" />
        </div>
      </div>

      <div class="watchman-row-controls">
        <div class="watchman-mini-group" role="group" aria-label="Watchman Deployment Stage">
          ${(
            [
              ['none', 'None'],
              ['sheath_across', 'Sheath'],
              ['flx_ball', 'Ball'],
              ['triangle', 'Tri'],
              ['full_deployed', 'Full'],
              ['released', 'Rel'],
            ] as const
          )
            .map(
              ([st, label]) =>
                `<button type="button" class="wm-stage-btn ${st === 'none' ? 'active' : ''}" data-wm-stage="${st}">${label}</button>`
            )
            .join('')}
        </div>
        <button type="button" class="wm-tug-btn" id="btn-wm-tug-test" title="Perform Interactive Mechanical Tug Test on Deployment Core Wire">
          ⇄ Tug Test
        </button>
      </div>

      <div class="pass-badges-grid">
        <div class="pass-criterion-badge passed" id="pass-badge-p" title="Position: Flush at LAA ostium">
          <span>P:Pos</span><span>✓</span>
        </div>
        <div class="pass-criterion-badge passed" id="pass-badge-a" title="Anchor: Stable on Tug Test (<2 mm recoil)">
          <span>A:Anc</span><span>✓</span>
        </div>
        <div class="pass-criterion-badge passed" id="pass-badge-s-size" title="Size: 10–30% Compression across 0°/45°/90°/135°">
          <span>S:19%</span><span>✓</span>
        </div>
        <div class="pass-criterion-badge passed" id="pass-badge-s-seal" title="Seal: <3 mm Color Doppler Peri-Device Leak">
          <span>S:Seal</span><span>✓</span>
        </div>
      </div>
    `;

    this.passBadgeEls = {
      p: paneWatchman.querySelector('#pass-badge-p') as HTMLElement,
      a: paneWatchman.querySelector('#pass-badge-a') as HTMLElement,
      sSize: paneWatchman.querySelector('#pass-badge-s-size') as HTMLElement,
      sSeal: paneWatchman.querySelector('#pass-badge-s-seal') as HTMLElement,
      summary: paneWatchman.querySelector('#wm-pass-overall-pill') as HTMLElement,
    };

    paneWatchman.querySelectorAll<HTMLButtonElement>('[data-wm-size]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const sz = Number(btn.dataset.wmSize) as 20 | 24 | 27 | 31 | 35 | 40;
        this.setSimulationState({ watchmanSizeMm: sz });
      });
    });

    paneWatchman.querySelectorAll<HTMLButtonElement>('[data-wm-stage]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const st = btn.dataset.wmStage as WatchmanStageId;
        this.setSimulationState({ watchmanStage: st });
      });
    });

    paneWatchman.querySelector('#slider-tsp-tenting')?.addEventListener('input', (e) => {
      const val = Number((e.currentTarget as HTMLInputElement).value);
      this.setSimulationState({ tspTentingMm: val });
    });

    paneWatchman.querySelector('#btn-wm-tug-test')?.addEventListener('click', () => {
      if (
        this.simState.watchmanStage === 'none' ||
        this.simState.watchmanStage === 'sheath_across'
      ) {
        this.setSimulationState({
          watchmanStage: 'full_deployed',
          watchmanTugActive: true,
        });
      } else {
        this.setSimulationState({ watchmanTugActive: true });
      }
      this.tugTestTimerSec = 0;
      this.callbacks.onTriggerWatchmanTugTest?.();
    });

    // Pane B: Fellow Practice Challenge Alignment HUD
    const paneChallenge = document.createElement('div');
    paneChallenge.className = 'contextual-deck-pane';
    paneChallenge.innerHTML = `
      <div class="context-pane-header">
        <span class="context-pane-title emerald" id="challenge-target-badge">TARGET: 13. FOSSA OVALIS</span>
        <div style="display:flex;gap:4px;">
          <button type="button" class="wm-size-btn" id="btn-challenge-random" title="Select Random Canonical View to Reproduce">🎲 Random Target</button>
          <button type="button" class="wm-size-btn" id="btn-challenge-reveal" title="Snap Catheter to Target View Solution">Snap Solution</button>
        </div>
      </div>

      <div class="challenge-match-row">
        <span style="font-size:10px;color:var(--text-secondary);font-family:var(--font-mono);">Match:</span>
        <div class="challenge-bar-track">
          <div class="challenge-bar-fill" id="challenge-bar-fill"></div>
        </div>
        <span class="tabular-nums" id="challenge-score-readout" style="font-size:11px;font-weight:700;color:var(--accent-cyan);min-width:34px;text-align:right;">0%</span>
      </div>

      <div class="challenge-deltas-grid">
        <div class="challenge-delta-pill" id="chal-delta-s">Δs: 0mm</div>
        <div class="challenge-delta-pill" id="chal-delta-torque">Δθ: 0°</div>
        <div class="challenge-delta-pill" id="chal-delta-ap">ΔAP: 0°</div>
        <div class="challenge-delta-pill" id="chal-delta-lr">ΔLR: 0°</div>
        <div class="challenge-delta-pill" id="chal-delta-omni">Δψ: 0°</div>
      </div>

      <div class="challenge-coaching-text" id="challenge-coaching-prompt">
        Maneuver catheter knobs to reproduce the target view.
      </div>
    `;

    this.challengeElements = {
      titleBadge: paneChallenge.querySelector('#challenge-target-badge') as HTMLElement,
      scoreReadout: paneChallenge.querySelector('#challenge-score-readout') as HTMLElement,
      barFill: paneChallenge.querySelector('#challenge-bar-fill') as HTMLElement,
      deltaS: paneChallenge.querySelector('#chal-delta-s') as HTMLElement,
      deltaTorque: paneChallenge.querySelector('#chal-delta-torque') as HTMLElement,
      deltaAp: paneChallenge.querySelector('#chal-delta-ap') as HTMLElement,
      deltaLr: paneChallenge.querySelector('#chal-delta-lr') as HTMLElement,
      deltaOmni: paneChallenge.querySelector('#chal-delta-omni') as HTMLElement,
      coachingText: paneChallenge.querySelector('#challenge-coaching-prompt') as HTMLElement,
    };

    paneChallenge.querySelector('#btn-challenge-random')?.addEventListener('click', () => {
      this.pickRandomChallengeView();
    });

    paneChallenge.querySelector('#btn-challenge-reveal')?.addEventListener('click', () => {
      this.setCatheterState(this.challengeTargetView.targetState, false, true);
    });

    // Pane C: Zero-Fluoro Clockwise RA Sweep & CARTOSOUND Quick Deck
    const paneZeroFluoro = document.createElement('div');
    paneZeroFluoro.className = 'contextual-deck-pane active';
    paneZeroFluoro.innerHTML = `
      <div class="context-pane-header">
        <span class="context-pane-title cyan">8-STAGE CLOCKWISE RA SWEEP &amp; CARTOSOUND</span>
        <span class="meta-badge cyan tabular-nums" id="cartosound-count-badge">0 Contours</span>
      </div>

      <div class="quick-sweep-grid" role="group" aria-label="8-Stage Clockwise RA Sweep">
        <button type="button" class="quick-sweep-btn" data-quick-view="zf_02" title="Home View (0° Neutral — TV & RV Inflow)">1.Home 0°</button>
        <button type="button" class="quick-sweep-btn" data-quick-view="zf_03" title="His Bundle & AoV NCC/RCC (+16° CW)">2.His +16°</button>
        <button type="button" class="quick-sweep-btn" data-quick-view="zf_12" title="Coronary Sinus Ostium & Thebesian Valve (+45° CW)">3.CS +45°</button>
        <button type="button" class="quick-sweep-btn" data-quick-view="zf_13" title="Fossa Ovalis & IAS Transseptal (+68° CW, -22° P)">4.FO +68°</button>
        <button type="button" class="quick-sweep-btn" data-quick-view="zf_14" title="LAA, Mitral Valve & Coumadin Ridge (+78° CW)">5.LAA +78°</button>
        <button type="button" class="quick-sweep-btn" data-quick-view="zf_15" title="Left PVs (LSPV/LIPV) & Desc Aorta (+96° CW)">6.LPV +96°</button>
        <button type="button" class="quick-sweep-btn" data-quick-view="zf_16" title="Posterior LA Wall & Esophagus (+125° CW)">7.Eso +125°</button>
        <button type="button" class="quick-sweep-btn" data-quick-view="zf_17" title="Right PVs Owl Eyes & RPA (+155° CW)">8.RPV +155°</button>
      </div>

      <div class="watchman-row-controls">
        <button type="button" class="wm-tug-btn" id="btn-zf-acquire-contour" style="flex:1;">
          + CARTOSOUND [C]
        </button>
        <button type="button" class="wm-size-btn" id="btn-zf-toggle-ablation" title="Toggle Irrigated RF Ablation Catheter in Active View">
          RF Tip: Off
        </button>
        <button type="button" class="wm-size-btn" id="btn-zf-clear-contours" title="Clear Acquired 3D CARTOSOUND Contours">
          Clear
        </button>
      </div>
    `;

    paneZeroFluoro.querySelectorAll<HTMLButtonElement>('[data-quick-view]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const vId = btn.dataset.quickView;
        if (vId) this.selectView(vId, { animate: false, applyTargetState: true });
      });
    });

    paneZeroFluoro.querySelector('#btn-zf-acquire-contour')?.addEventListener('click', () => {
      this.callbacks.onAcquireCartosoundContour?.(this.activeView);
      this.render3DCalloutStrip();
    });

    paneZeroFluoro.querySelector('#btn-zf-toggle-ablation')?.addEventListener('click', () => {
      this.setSimulationState({
        ablationCatheterActive: !this.simState.ablationCatheterActive,
      });
    });

    paneZeroFluoro.querySelector('#btn-zf-clear-contours')?.addEventListener('click', () => {
      this.simState.cartosoundContours = [];
      this.callbacks.onClearCartosoundContours?.();
      this.render3DCalloutStrip();
      this.syncSimulationControls();
    });

    this.contextPanes = {
      watchman: paneWatchman,
      challenge: paneChallenge,
      zeroFluoro: paneZeroFluoro,
    };

    colContext.appendChild(paneWatchman);
    colContext.appendChild(paneChallenge);
    colContext.appendChild(paneZeroFluoro);

    deck.appendChild(colStationHandle);
    deck.appendChild(colWheels);
    deck.appendChild(colContext);

    return deck;
  }

  private createDofWheelCard(config: {
    title: string;
    unit: string;
    min: number;
    max: number;
    step: number;
    initial: number;
    leftHint: string;
    rightHint: string;
    accent: 'cyan' | 'amber';
    includeOmniPresets?: boolean;
    onInput: (val: number) => void;
    onReset: () => void;
  }): {
    cardEl: HTMLElement;
    readoutEl: HTMLElement;
    inputEl: HTMLInputElement;
    indicatorEl: SVGElement;
    presetBtns: HTMLButtonElement[];
  } {
    const cardEl = document.createElement('div');
    cardEl.className = 'dof-wheel-card';
    cardEl.title = 'Drag rotary wheel or slider · Double-click to reset to 0 Neutral';

    const strokeColor = config.accent === 'amber' ? '#F59E0B' : '#38BDF8';

    cardEl.innerHTML = `
      <div class="dof-card-top">
        <span class="dof-card-title">${config.title}</span>
        <span class="dof-card-readout ${config.accent === 'amber' ? 'amber' : ''} tabular-nums">0${config.unit}</span>
      </div>
      <div class="dof-wheel-body">
        <svg class="rotary-dial-svg" viewBox="0 0 48 48">
          <circle cx="24" cy="24" r="20" fill="#070B12" stroke="#1E293B" stroke-width="2.5" />
          <circle cx="24" cy="24" r="15" fill="none" stroke="#334155" stroke-width="1" stroke-dasharray="2 3" />
          <line x1="24" y1="4" x2="24" y2="8" stroke="#64748B" stroke-width="1.5" />
          <g class="dial-needle-group" transform="rotate(0 24 24)">
            <line x1="24" y1="24" x2="24" y2="7" stroke="${strokeColor}" stroke-width="2.5" stroke-linecap="round" />
            <circle cx="24" cy="9" r="2.3" fill="${strokeColor}" />
          </g>
          <circle cx="24" cy="24" r="3.5" fill="#1E293B" stroke="${strokeColor}" stroke-width="1.2" />
        </svg>
        <div class="dof-slider-stack">
          <input type="range" class="dof-range-input ${config.accent === 'amber' ? 'amber' : ''}" min="${config.min}" max="${config.max}" step="${config.step}" value="${config.initial}" />
          ${
            config.includeOmniPresets
              ? `<div class="omni-preset-pills">
                  <button type="button" class="omni-preset-btn" data-omni-preset="0">0°</button>
                  <button type="button" class="omni-preset-btn" data-omni-preset="45">45°</button>
                  <button type="button" class="omni-preset-btn" data-omni-preset="90">90°</button>
                  <button type="button" class="omni-preset-btn" data-omni-preset="135">135°</button>
                </div>`
              : `<div class="dof-sub-hint">
                  <span>${config.leftHint}</span>
                  <span>${config.rightHint}</span>
                </div>`
          }
        </div>
      </div>
    `;

    const readoutEl = cardEl.querySelector('.dof-card-readout') as HTMLElement;
    const inputEl = cardEl.querySelector('.dof-range-input') as HTMLInputElement;
    const indicatorEl = cardEl.querySelector('.dial-needle-group') as SVGElement;
    const svgDial = cardEl.querySelector('.rotary-dial-svg') as SVGElement;
    const presetBtns = Array.from(
      cardEl.querySelectorAll<HTMLButtonElement>('[data-omni-preset]')
    );

    inputEl.addEventListener('input', () => {
      config.onInput(Number(inputEl.value));
    });

    // Double-click anywhere on the knob or slider resets to 0 Neutral (SPEC PATCH #12)
    cardEl.addEventListener('dblclick', () => {
      config.onReset();
    });

    // Rotary dial vertical/horizontal drag interaction
    let dragging = false;
    let dragStartY = 0;
    let dragStartVal = 0;

    svgDial.addEventListener('pointerdown', (e: PointerEvent) => {
      dragging = true;
      dragStartY = e.clientY;
      dragStartVal = Number(inputEl.value);
      svgDial.setPointerCapture(e.pointerId);
    });

    svgDial.addEventListener('pointermove', (e: PointerEvent) => {
      if (!dragging) return;
      const dy = dragStartY - e.clientY;
      const span = config.max - config.min;
      const delta = (dy / 110) * span;
      const nextVal = Math.round(
        Math.max(config.min, Math.min(config.max, dragStartVal + delta))
      );
      config.onInput(nextVal);
    });

    const endDrag = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      if (svgDial.hasPointerCapture(e.pointerId)) {
        svgDial.releasePointerCapture(e.pointerId);
      }
    };
    svgDial.addEventListener('pointerup', endDrag);
    svgDial.addEventListener('pointercancel', endDrag);

    // Mouse wheel fine-tuning on the rotary dial
    svgDial.addEventListener(
      'wheel',
      (e: WheelEvent) => {
        e.preventDefault();
        const stepDelta = e.deltaY < 0 ? 2 : -2;
        const nextVal = Math.max(
          config.min,
          Math.min(config.max, Number(inputEl.value) + stepDelta)
        );
        config.onInput(nextVal);
      },
      { passive: false }
    );

    presetBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const angle = Number(btn.dataset.omniPreset);
        config.onInput(angle);
      });
    });

    return { cardEl, readoutEl, inputEl, indicatorEl, presetBtns };
  }

  private buildLiteratureModal(): HTMLElement {
    this.literatureModalBackdrop = document.createElement('div');
    this.literatureModalBackdrop.className = 'literature-modal-backdrop';

    this.literatureModalBackdrop.innerHTML = `
      <div class="literature-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="lit-modal-title">
        <div class="literature-modal-header">
          <span class="literature-modal-title" id="lit-modal-title">
            Clinical Literature Synthesis &amp; Official Boston Scientific WATCHMAN FLX™ / FLX™ Pro Sizing Matrix
          </span>
          <button type="button" class="literature-modal-close" id="btn-close-lit-modal">✕ Close [Esc]</button>
        </div>
        <div class="literature-modal-body">
          <!-- Watchman FLX & FLX Pro Sizing Matrix Table -->
          <div>
            <div class="curriculum-section-title" style="margin-bottom:8px;">
              BOSTON SCIENTIFIC WATCHMAN FLX™ &amp; WATCHMAN FLX™ PRO SIZING &amp; COMPRESSION MATRIX
            </div>
            <table class="sizing-matrix-table tabular-nums">
              <thead>
                <tr>
                  <th>Nominal Device Size</th>
                  <th>Watchman FLX</th>
                  <th>Watchman FLX Pro</th>
                  <th>Required Max LAA Ostium (D_max)</th>
                  <th>Min Usable LAA Depth</th>
                  <th>Target Compression</th>
                  <th>Compressed Shoulder Range</th>
                  <th>Clinical Sizing Notes</th>
                </tr>
              </thead>
              <tbody>
                ${WATCHMAN_FLX_SIZING_MATRIX.map(
                  (row) => `
                  <tr>
                    <td style="font-weight:700;color:var(--accent-amber);">${row.deviceSizeMm} mm</td>
                    <td>${row.flxAvailable ? '✓ Yes' : '—'}</td>
                    <td>${row.flxProAvailable ? '✓ Yes' : '—'}</td>
                    <td style="font-weight:600;color:var(--accent-cyan);">${row.minOstiumDiameterMm.toFixed(1)} – ${row.maxOstiumDiameterMm.toFixed(1)} mm</td>
                    <td>&ge; ${row.minUsableLAAWDepthMm.toFixed(1)} mm</td>
                    <td style="color:var(--accent-emerald);font-weight:600;">${row.targetCompressionMinPct}% – ${row.targetCompressionMaxPct}%</td>
                    <td>${row.compressedDiameterRangeMm[0].toFixed(1)} – ${row.compressedDiameterRangeMm[1].toFixed(1)} mm</td>
                    <td style="font-family:var(--font-sans);color:var(--text-secondary);">${row.clinicalNotes}</td>
                  </tr>
                `
                ).join('')}
              </tbody>
            </table>
          </div>

          <!-- Peer-Reviewed Manuscripts & Textbooks -->
          <div>
            <div class="curriculum-section-title" style="margin-bottom:8px;">
              FOUNDATIONAL PEER-REVIEWED MANUSCRIPTS &amp; CONSENSUS STATEMENTS (${LITERATURE_LIBRARY.length} REFERENCES)
            </div>
            <div class="manuscript-cards-grid">
              ${LITERATURE_LIBRARY.map(
                (paper) => `
                <article class="manuscript-card" data-manuscript-card-id="${paper.id}">
                  <div class="manuscript-card-title">${paper.title}</div>
                  <div class="manuscript-card-citation">${paper.authors} · ${paper.journal} (${paper.year}) — ${paper.citationDetail}</div>
                  <ul class="pearls-bullet-list" style="margin-top:4px;">
                    ${paper.keyClinicalTakeaways
                      .map(
                        (pt) => `
                      <li class="pearl-bullet-item">
                        <span class="bullet-step-index">•</span>
                        <span>${pt}</span>
                      </li>
                    `
                      )
                      .join('')}
                  </ul>
                  <div class="citation-links-row" style="margin-top:4px;">
                    ${paper.linkedViewIds
                      .slice(0, 8)
                      .map(
                        (vId) =>
                          `<button type="button" class="citation-pill-btn" data-jump-view-id="${vId}">View ${vId.toUpperCase()}</button>`
                      )
                      .join('')}
                  </div>
                </article>
              `
              ).join('')}
            </div>
          </div>
        </div>
      </div>
    `;

    this.literatureModalBackdrop
      .querySelector('#btn-close-lit-modal')
      ?.addEventListener('click', () => this.closeLiteratureModal());

    this.literatureModalBackdrop.addEventListener('click', (e) => {
      if (e.target === this.literatureModalBackdrop) {
        this.closeLiteratureModal();
      }
    });

    this.literatureModalBackdrop
      .querySelectorAll<HTMLButtonElement>('[data-jump-view-id]')
      .forEach((btn) => {
        btn.addEventListener('click', () => {
          const vId = btn.dataset.jumpViewId;
          this.closeLiteratureModal();
          if (vId) {
            this.selectView(vId, { animate: false, applyTargetState: true });
          }
        });
      });

    return this.literatureModalBackdrop;
  }

  // ============================================================================
  // VIEW LIST & ACTIVE VIEW CURRICULUM RENDERING
  // ============================================================================

  private renderViewList(): void {
    const views = getCanonicalViewsByTrack(this.activeTrack);
    const headingEl = this.root.querySelector('#drawer-track-heading');
    if (headingEl) {
      headingEl.textContent =
        this.activeTrack === 'zero_fluoro_ablation'
          ? `ZERO-FLUORO ABLATION VIEWS (${views.length})`
          : `WATCHMAN LAAC VIEWS & STAGES (${views.length})`;
    }

    const stationShortLabel: Record<ChamberStationId, string> = {
      ra_venous: 'RA',
      rv_outflow: 'RV',
      la_transseptal: 'LA',
    };

    this.viewListContainer.innerHTML = views
      .map((v) => {
        const numStr = String(v.number).padStart(2, '0');
        const stTag = stationShortLabel[v.targetState.station];
        const isActive = v.id === this.activeView.id;
        return `
          <button type="button" class="view-list-item ${isActive ? 'active' : ''}" data-view-item-id="${v.id}">
            <div class="view-list-item-left">
              <span class="view-num-pill">${numStr}</span>
              <span class="view-short-title">${v.shortTitle.replace(/^\d+\.\s*/, '')}</span>
            </div>
            <span class="view-station-tag">${stTag}</span>
          </button>
        `;
      })
      .join('');

    this.viewListContainer
      .querySelectorAll<HTMLButtonElement>('[data-view-item-id]')
      .forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.viewItemId;
          if (!id) return;
          if (this.activeMode === 'practice_challenge') {
            const target = getCanonicalViewById(id);
            if (target) {
              this.challengeTargetView = target;
              this.activeView = target;
              this.highlightActiveViewInList();
              this.renderActiveViewDetail();
            }
          } else {
            this.selectView(id, { animate: false, applyTargetState: true });
          }
        });
      });
  }

  private highlightActiveViewInList(): void {
    this.viewListContainer
      .querySelectorAll<HTMLButtonElement>('[data-view-item-id]')
      .forEach((btn) => {
        const active = btn.dataset.viewItemId === this.activeView.id;
        btn.classList.toggle('active', active);
        if (active) {
          btn.scrollIntoView({ block: 'nearest' });
        }
      });
  }

  private renderActiveViewDetail(): void {
    const v = this.activeView;
    const t = v.targetState;
    const stationMap: Record<ChamberStationId, string> = {
      ra_venous: 'IVC / Right Atrium',
      rv_outflow: 'RV / RVOT',
      la_transseptal: 'Transseptal LA',
    };
    const startView = getCanonicalViewById(v.startingViewId);

    this.activeViewDetailContainer.innerHTML = `
      <div class="active-view-header-card">
        <div class="active-view-meta-row">
          <span class="meta-badge cyan">VIEW #${String(v.number).padStart(2, '0')}</span>
          <span class="meta-badge">${stationMap[t.station]}</span>
          <span class="meta-badge amber">${v.recommendedDepthCm} cm Depth</span>
        </div>
        <div class="active-view-full-title">${v.title}</div>
        <div style="font-size:10px;color:var(--text-secondary);">
          <strong>Prerequisite Station:</strong> ${startView ? startView.shortTitle : 'Mid-RA Home View'}
        </div>

        <div class="active-view-dof-summary">
          <div class="dof-mini-cell">
            <span class="dof-mini-label">Adv (s)</span>
            <span class="dof-mini-val">${t.sMm >= 0 ? '+' : ''}${t.sMm}mm</span>
          </div>
          <div class="dof-mini-cell">
            <span class="dof-mini-label">Torque</span>
            <span class="dof-mini-val">${t.torqueDeg >= 0 ? '+' : ''}${t.torqueDeg}°</span>
          </div>
          <div class="dof-mini-cell">
            <span class="dof-mini-label">A/P</span>
            <span class="dof-mini-val">${t.apDeg >= 0 ? '+' : ''}${t.apDeg}°</span>
          </div>
          <div class="dof-mini-cell">
            <span class="dof-mini-label">L/R</span>
            <span class="dof-mini-val">${t.lrDeg >= 0 ? '+' : ''}${t.lrDeg}°</span>
          </div>
          <div class="dof-mini-cell">
            <span class="dof-mini-label">Omni</span>
            <span class="dof-mini-val">${t.omniDeg}°</span>
          </div>
        </div>

        <button type="button" class="btn-play-maneuver-demo" id="btn-drawer-play-demo">
          ▶ Play Animated Maneuver Demo (4.8s)
        </button>

        <div class="demo-choreography-box" id="drawer-demo-choreo-box">
          <div class="demo-phase-header">
            <span id="demo-phase-name">t0: Anticipation</span>
            <span id="demo-phase-timer">0.0s / 4.8s</span>
          </div>
          <div class="demo-progress-track">
            <div class="demo-progress-fill" id="demo-progress-fill"></div>
          </div>
          <div class="demo-phase-caption" id="demo-phase-caption">
            Highlighting starting station and aligning catheter axis...
          </div>
        </div>
      </div>

      <!-- Step-by-Step 4-DOF/5-DOF Maneuver Instructions -->
      <div class="curriculum-section">
        <div class="curriculum-section-title">Step-by-Step Catheter Maneuver</div>
        <ol class="maneuver-bullet-list">
          ${v.maneuverBullets
            .map(
              (b, idx) => `
            <li class="maneuver-bullet-item">
              <span class="bullet-step-index">${idx + 1}</span>
              <span>${b}</span>
            </li>
          `
            )
            .join('')}
        </ol>
      </div>

      <!-- Clock-Face Ultrasound Sector Anatomy -->
      <div class="curriculum-section">
        <div class="curriculum-section-title">Clock-Face Ultrasound Sector Anatomy</div>
        <div class="clock-anatomy-grid">
          <div class="clock-anatomy-row">
            <span class="clock-zone-label">12:00 Apex</span>
            <span class="clock-zone-desc">${v.sectorAnatomy.nearFieldApex}</span>
          </div>
          <div class="clock-anatomy-row">
            <span class="clock-zone-label cyan">Mid-Field</span>
            <span class="clock-zone-desc">${v.sectorAnatomy.midField}</span>
          </div>
          <div class="clock-anatomy-row">
            <span class="clock-zone-label">6:00 Far</span>
            <span class="clock-zone-desc">${v.sectorAnatomy.farField}</span>
          </div>
          <div class="clock-anatomy-row">
            <span class="clock-zone-label cyan">3:00 Distal</span>
            <span class="clock-zone-desc">${v.sectorAnatomy.distalRightEdge}</span>
          </div>
          <div class="clock-anatomy-row">
            <span class="clock-zone-label">9:00 Prox</span>
            <span class="clock-zone-desc">${v.sectorAnatomy.proximalLeftEdge}</span>
          </div>
        </div>
        <div class="expected-landmarks-chips">
          ${v.expectedStructureIds
            .map((id) => {
              const meta = ANATOMICAL_STRUCTURES[id];
              if (!meta) return '';
              const hit = this.intersectedStructureIds.includes(id);
              return `
                <button type="button" class="landmark-chip ${hit ? 'hit' : ''}" data-landmark-chip-id="${id}" title="${meta.name} — ${meta.clinicalSignificance}">
                  <span class="landmark-color-dot" style="background-color:${meta.surgicalBaseHex};"></span>
                  <span>${meta.shortLabel}</span>
                </button>
              `;
            })
            .join('')}
        </div>
      </div>

      <!-- Clinical Purpose & Fellowship Pearls / Pitfalls -->
      <div class="curriculum-section">
        <div class="curriculum-section-title">Clinical Purpose &amp; Fellow Pearls</div>
        <div style="font-size:11px;color:var(--text-secondary);margin-bottom:4px;">
          ${v.clinicalPurpose}
        </div>
        <ul class="pearls-bullet-list">
          ${v.fellowPearlsAndPitfalls
            .map(
              (p) => `
            <li class="pearl-bullet-item">
              <span class="bullet-step-index">★</span>
              <span>${p}</span>
            </li>
          `
            )
            .join('')}
        </ul>
      </div>

      <!-- Literature References -->
      <div class="curriculum-section">
        <div class="curriculum-section-title">Primary Literature Citations</div>
        <div class="citation-links-row">
          ${v.literatureCitations
            .map((citId) => {
              const paper = LITERATURE_LIBRARY.find((p) => p.id === citId);
              const label = paper
                ? `${paper.authors.split(',')[0]} (${paper.year})`
                : citId;
              return `<button type="button" class="citation-pill-btn" data-open-citation="${citId}">${label}</button>`;
            })
            .join('')}
        </div>
      </div>
    `;

    this.activeViewDetailContainer
      .querySelector('#btn-drawer-play-demo')
      ?.addEventListener('click', () => {
        if (this.demoAnim.active) {
          this.stopManeuverDemo();
        } else {
          this.playManeuverDemo(v.id);
        }
      });

    this.activeViewDetailContainer
      .querySelectorAll<HTMLButtonElement>('[data-landmark-chip-id]')
      .forEach((chip) => {
        const id = Number(chip.dataset.landmarkChipId);
        chip.addEventListener('mouseenter', () => {
          this.callbacks.onHighlightStructure?.(id);
          this.updateHoveredStructure(id, undefined, '3d');
        });
        chip.addEventListener('mouseleave', () => {
          this.callbacks.onHighlightStructure?.(null);
        });
        chip.addEventListener('click', () => {
          this.callbacks.onHighlightStructure?.(id);
        });
      });

    this.activeViewDetailContainer
      .querySelectorAll<HTMLButtonElement>('[data-open-citation]')
      .forEach((btn) => {
        btn.addEventListener('click', () => {
          const citId = btn.dataset.openCitation ?? null;
          this.openLiteratureModal(citId);
        });
      });

    this.syncDemoChoreographyUI();
  }

  private render3DCalloutStrip(): void {
    if (!this.calloutStrip3D) return;
    const v = this.activeView;
    const contoursCount = this.simState.cartosoundContours.length;

    const chipsHtml = v.expectedStructureIds
      .slice(0, 6)
      .map((id) => {
        const meta = ANATOMICAL_STRUCTURES[id];
        if (!meta) return '';
        const hit = this.intersectedStructureIds.includes(id);
        return `
          <button type="button" class="landmark-chip ${hit ? 'hit' : ''}" data-landmark-chip-id="${id}" title="${meta.name}">
            <span class="landmark-color-dot" style="background-color:${meta.surgicalBaseHex};"></span>
            <span>${meta.shortLabel}</span>
          </button>
        `;
      })
      .join('');

    this.calloutStrip3D.innerHTML = `
      <span style="font-family:var(--font-mono);font-size:10px;color:var(--accent-cyan);font-weight:600;margin-right:2px;">
        ${v.shortTitle}:
      </span>
      ${chipsHtml}
      <span class="meta-badge cyan tabular-nums" style="margin-left:4px;">
        CARTOSOUND: ${contoursCount}
      </span>
    `;

    this.calloutStrip3D
      .querySelectorAll<HTMLButtonElement>('[data-landmark-chip-id]')
      .forEach((chip) => {
        const id = Number(chip.dataset.landmarkChipId);
        chip.addEventListener('mouseenter', () => {
          this.callbacks.onHighlightStructure?.(id);
          this.updateHoveredStructure(id, undefined, '3d');
        });
        chip.addEventListener('mouseleave', () => {
          this.callbacks.onHighlightStructure?.(null);
        });
      });
  }

  // ============================================================================
  // SYNCHRONIZATION OF CONTROLS & TELEMETRY
  // ============================================================================

  private syncHeaderButtons(): void {
    this.root.querySelectorAll<HTMLButtonElement>('[data-track-btn]').forEach((btn) => {
      const active = btn.dataset.trackBtn === this.activeTrack;
      btn.classList.toggle('active', active && this.activeTrack === 'zero_fluoro_ablation');
      btn.classList.toggle('active-amber', active && this.activeTrack === 'watchman_laac');
    });

    this.root.querySelectorAll<HTMLButtonElement>('[data-catheter-btn]').forEach((btn) => {
      const active = btn.dataset.catheterBtn === this.targetCatheterState.model;
      btn.classList.toggle(
        'active',
        active && this.targetCatheterState.model !== 'nuvision_10f'
      );
      btn.classList.toggle(
        'active-amber',
        active && this.targetCatheterState.model === 'nuvision_10f'
      );
    });

    this.root.querySelectorAll<HTMLButtonElement>('[data-mode-btn]').forEach((btn) => {
      const active = btn.dataset.modeBtn === this.activeMode;
      btn.classList.toggle('active', active && this.activeMode !== 'practice_challenge');
      btn.classList.toggle(
        'active-emerald',
        active && this.activeMode === 'practice_challenge'
      );
    });
  }

  private syncBottomDeckControls(): void {
    const s = this.displayCatheterState;
    const targ = this.targetCatheterState;

    // Station pills
    this.root.querySelectorAll<HTMLButtonElement>('[data-station-btn]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.stationBtn === targ.station);
    });

    // 1. Advance (sMm)
    const sVal = Math.round(s.sMm);
    if (this.dofElements.sReadout) {
      this.dofElements.sReadout.textContent = `${sVal >= 0 ? '+' : ''}${sVal} mm`;
    }
    if (this.dofElements.sInput) {
      this.dofElements.sInput.value = String(Math.round(targ.sMm));
    }
    if (this.dofElements.sDialIndicator) {
      const rot = ((s.sMm - 17.5) / 77.5) * 135;
      this.dofElements.sDialIndicator.setAttribute('transform', `rotate(${rot.toFixed(1)} 24 24)`);
    }

    // 2. Torque (torqueDeg)
    const tVal = Math.round(s.torqueDeg);
    if (this.dofElements.torqueReadout) {
      const dir = tVal > 0 ? 'CW ' : tVal < 0 ? 'CCW ' : '';
      this.dofElements.torqueReadout.textContent = `${dir}${tVal >= 0 ? '+' : ''}${tVal}°`;
    }
    if (this.dofElements.torqueInput) {
      this.dofElements.torqueInput.value = String(Math.round(targ.torqueDeg));
    }
    if (this.dofElements.torqueDialIndicator) {
      this.dofElements.torqueDialIndicator.setAttribute(
        'transform',
        `rotate(${s.torqueDeg.toFixed(1)} 24 24)`
      );
    }

    // 3. A/P Deflection (apDeg)
    const apVal = Math.round(s.apDeg);
    if (this.dofElements.apReadout) {
      const tag = apVal > 0 ? 'A ' : apVal < 0 ? 'P ' : '';
      this.dofElements.apReadout.textContent = `${tag}${apVal >= 0 ? '+' : ''}${apVal}°`;
    }
    if (this.dofElements.apInput) {
      this.dofElements.apInput.value = String(Math.round(targ.apDeg));
    }
    if (this.dofElements.apDialIndicator) {
      const rot = (s.apDeg / 150) * 135;
      this.dofElements.apDialIndicator.setAttribute('transform', `rotate(${rot.toFixed(1)} 24 24)`);
    }

    // 4. L/R Deflection (lrDeg)
    const lrVal = Math.round(s.lrDeg);
    if (this.dofElements.lrReadout) {
      const tag = lrVal > 0 ? 'L ' : lrVal < 0 ? 'R ' : '';
      this.dofElements.lrReadout.textContent = `${tag}${lrVal >= 0 ? '+' : ''}${lrVal}°`;
    }
    if (this.dofElements.lrInput) {
      this.dofElements.lrInput.value = String(Math.round(targ.lrDeg));
    }
    if (this.dofElements.lrDialIndicator) {
      const rot = (s.lrDeg / 120) * 135;
      this.dofElements.lrDialIndicator.setAttribute('transform', `rotate(${rot.toFixed(1)} 24 24)`);
    }

    // 5. NuVision Multiplane (omniDeg)
    const isNuVision = targ.model === 'nuvision_10f';
    const omniVal = Math.round(s.omniDeg);
    if (this.dofElements.omniCard) {
      this.dofElements.omniCard.classList.toggle('disabled', !isNuVision);
    }
    if (this.dofElements.omniReadout) {
      this.dofElements.omniReadout.textContent = isNuVision ? `${omniVal}°` : '0°';
    }
    if (this.dofElements.omniInput) {
      this.dofElements.omniInput.value = String(Math.round(targ.omniDeg));
    }
    if (this.dofElements.omniDialIndicator) {
      const rot = ((s.omniDeg - 90) / 90) * 135;
      this.dofElements.omniDialIndicator.setAttribute(
        'transform',
        `rotate(${rot.toFixed(1)} 24 24)`
      );
    }
    this.dofElements.omniPresetBtns.forEach((btn) => {
      const presetAngle = Number(btn.dataset.omniPreset);
      btn.classList.toggle(
        'active',
        isNuVision && Math.abs(targ.omniDeg - presetAngle) <= 3
      );
    });

    // Render Interactive Handle Silhouette SVG
    this.renderHandleSilhouetteSVG();
  }

  private renderHandleSilhouetteSVG(): void {
    if (!this.handleSvgBox) return;
    const s = this.displayCatheterState;
    const isNuVision = s.model === 'nuvision_10f';
    const bodyFill = isNuVision ? '#1E293B' : '#172554';
    const accentStroke = isNuVision ? '#F59E0B' : '#38BDF8';
    const modelTag =
      s.model === 'nuvision_10f'
        ? 'NUVISION 10F 4D'
        : s.model === 'soundstar_8f'
          ? 'SOUNDSTAR 8F'
          : 'SOUNDSTAR 10F';

    // Visualize distal bending neck curve in mini-SVG
    const bendY = -Math.max(-14, Math.min(14, (s.apDeg / 150) * 14));
    const tipX = 186;
    const tipY = 22 + bendY;

    this.handleSvgBox.innerHTML = `
      <svg width="100%" height="42" viewBox="0 0 206 42">
        <!-- Ergonomic Catheter Handle Body -->
        <rect x="6" y="10" width="76" height="22" rx="5" fill="${bodyFill}" stroke="${accentStroke}" stroke-width="1.3" />
        <!-- Rotary Thumbwheels on Handle -->
        <rect x="62" y="7" width="10" height="28" rx="2" fill="#334155" stroke="#94A3B8" stroke-width="1" />
        <rect x="74" y="9" width="8" height="24" rx="2" fill="#475569" stroke="${accentStroke}" stroke-width="1" />
        <text x="12" y="24" fill="#F1F5F9" font-family="JetBrains Mono, monospace" font-size="7.5" font-weight="700">${modelTag}</text>
        <!-- Braided Shaft + Bending Neck -->
        <path d="M 82 21 L 142 21 Q 165 21 ${tipX} ${tipY}" fill="none" stroke="#94A3B8" stroke-width="3" stroke-linecap="round" />
        <!-- Pt/Ir Marker & Amber Transducer Lens on +e_A Face -->
        <circle cx="${tipX}" cy="${tipY}" r="3.2" fill="#F59E0B" />
      </svg>
    `;
  }

  private syncUltrasoundToolbar(): void {
    const u = this.ultrasoundSettings;
    const c = this.targetCatheterState;

    this.root
      .querySelector('#btn-echo-freeze')
      ?.classList.toggle('active-crimson', u.frozen);
    this.root
      .querySelector('#btn-echo-caliper')
      ?.classList.toggle('active', this.caliperToolActive);
    this.root
      .querySelector('#btn-echo-doppler')
      ?.classList.toggle('active-crimson', u.colorDopplerEnabled);

    const lblBtn = this.root.querySelector('#btn-echo-labels');
    if (lblBtn) {
      lblBtn.textContent = `Lbl:${u.labelOverlayMode.toUpperCase()}`;
      lblBtn.classList.toggle('active', u.labelOverlayMode !== 'off');
    }

    this.root
      .querySelector('#btn-echo-biplane')
      ?.classList.toggle('active-amber', c.biplaneEnabled);
    this.root
      .querySelector('#btn-echo-4d')
      ?.classList.toggle('active-amber', c.volume4dEnabled);

    const depthEl = this.root.querySelector('#readout-echo-depth');
    if (depthEl) depthEl.textContent = `${u.depthCm.toFixed(0)}cm`;

    const gainEl = this.root.querySelector('#readout-echo-gain');
    if (gainEl) gainEl.textContent = `${u.gainDb.toFixed(0)}dB`;

    const mkrBtn = this.root.querySelector('#btn-echo-marker');
    if (mkrBtn) mkrBtn.textContent = `Mkr:${u.markerSide === 'right' ? 'R' : 'L'}`;
  }

  private syncSimulationControls(): void {
    const morphSelect = this.root.querySelector(
      '#select-laa-morphology'
    ) as HTMLSelectElement | null;
    if (morphSelect) morphSelect.value = this.simState.laaMorphology;

    const effSelect = this.root.querySelector(
      '#select-pericardial-effusion'
    ) as HTMLSelectElement | null;
    if (effSelect) effSelect.value = String(this.simState.pericardialEffusionMl);

    const thromChk = this.root.querySelector('#chk-laa-thrombus') as HTMLInputElement | null;
    if (thromChk) thromChk.checked = this.simState.laaThrombusPresent;

    const ablChk = this.root.querySelector('#chk-ablation-catheter') as HTMLInputElement | null;
    if (ablChk) ablChk.checked = this.simState.ablationCatheterActive;

    const zfAblBtn = this.root.querySelector('#btn-zf-toggle-ablation');
    if (zfAblBtn) {
      zfAblBtn.textContent = `RF Tip: ${this.simState.ablationCatheterActive ? 'On' : 'Off'}`;
      zfAblBtn.classList.toggle('active', this.simState.ablationCatheterActive);
    }

    // Watchman size & stage buttons
    this.root.querySelectorAll<HTMLButtonElement>('[data-wm-size]').forEach((btn) => {
      btn.classList.toggle(
        'active',
        Number(btn.dataset.wmSize) === this.simState.watchmanSizeMm
      );
    });

    this.root.querySelectorAll<HTMLButtonElement>('[data-wm-stage]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.wmStage === this.simState.watchmanStage);
    });

    const tspSlider = this.root.querySelector('#slider-tsp-tenting') as HTMLInputElement | null;
    if (tspSlider) tspSlider.value = String(this.simState.tspTentingMm);

    this.root
      .querySelector('#btn-wm-tug-test')
      ?.classList.toggle('active', this.simState.watchmanTugActive);

    const countBadge = this.root.querySelector('#cartosound-count-badge');
    if (countBadge) {
      countBadge.textContent = `${this.simState.cartosoundContours.length} Contours`;
    }
  }

  private syncContextualDeckPane(): void {
    const isChallenge = this.activeMode === 'practice_challenge';
    const isWatchman = !isChallenge && this.activeTrack === 'watchman_laac';
    const isZeroFluoro = !isChallenge && this.activeTrack === 'zero_fluoro_ablation';

    this.contextPanes.challenge?.classList.toggle('active', isChallenge);
    this.contextPanes.watchman?.classList.toggle('active', isWatchman);
    this.contextPanes.zeroFluoro?.classList.toggle('active', isZeroFluoro);

    // Highlight active quick-sweep button if in Zero-Fluoro mode
    this.contextPanes.zeroFluoro
      ?.querySelectorAll<HTMLButtonElement>('[data-quick-view]')
      .forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.quickView === this.activeView.id);
      });
  }

  private syncPassCriteriaBadges(): void {
    const p = this.passStatus;
    const setBadge = (
      el: HTMLElement | undefined,
      label: string,
      passed: boolean,
      tooltip: string
    ) => {
      if (!el) return;
      el.classList.toggle('passed', passed);
      el.classList.toggle('failed', !passed);
      el.title = tooltip;
      el.innerHTML = `<span>${label}</span><span>${passed ? '✓' : '!'}</span>`;
    };

    setBadge(this.passBadgeEls.p, 'P:Pos', p.positionPass, p.positionDetail);
    setBadge(this.passBadgeEls.a, 'A:Anc', p.anchorPass, p.anchorDetail);
    setBadge(
      this.passBadgeEls.sSize,
      `S:${Math.round(p.compressionPct)}%`,
      p.sizePass,
      p.sizeDetail
    );
    setBadge(this.passBadgeEls.sSeal, 'S:Seal', p.sealPass, p.sealDetail);

    if (this.passBadgeEls.summary) {
      this.passBadgeEls.summary.textContent = p.allPassed
        ? `PASS VERIFIED (${p.compressionPct.toFixed(0)}%)`
        : 'CHECK PASS CRITERIA';
    }
  }

  private syncDemoChoreographyUI(): void {
    const btn = this.activeViewDetailContainer?.querySelector(
      '#btn-drawer-play-demo'
    ) as HTMLButtonElement | null;
    const box = this.activeViewDetailContainer?.querySelector(
      '#drawer-demo-choreo-box'
    ) as HTMLElement | null;

    if (!btn || !box) return;

    if (!this.demoAnim.active) {
      btn.classList.remove('playing');
      btn.textContent = '▶ Play Animated Maneuver Demo (4.8s)';
      box.classList.remove('visible');
      return;
    }

    btn.classList.add('playing');
    btn.textContent = '■ Stop Animated Maneuver Demo';
    box.classList.add('visible');

    const t = this.demoAnim.elapsedSec;
    const total = this.demoAnim.durationSec;
    const pct = Math.min(100, Math.round((t / total) * 100));

    const phaseNameEl = box.querySelector('#demo-phase-name');
    const timerEl = box.querySelector('#demo-phase-timer');
    const fillEl = box.querySelector('#demo-progress-fill') as HTMLElement | null;
    const captionEl = box.querySelector('#demo-phase-caption');

    if (timerEl) timerEl.textContent = `${t.toFixed(1)}s / ${total.toFixed(1)}s`;
    if (fillEl) fillEl.style.width = `${pct}%`;

    const bullets = this.activeView.maneuverBullets;
    if (t < 0.8) {
      if (phaseNameEl) phaseNameEl.textContent = 't0: Starting Station Anchor';
      if (captionEl) captionEl.textContent = bullets[0] ?? 'Establishing starting station...';
    } else if (t < 2.4) {
      if (phaseNameEl) phaseNameEl.textContent = 't1: Axial & Torque Drive';
      if (captionEl) captionEl.textContent = bullets[1] ?? 'Advancing and torquing shaft...';
    } else if (t < 3.8) {
      if (phaseNameEl) phaseNameEl.textContent = 't2: Constant-Curvature Deflection';
      if (captionEl)
        captionEl.textContent = bullets[2] ?? 'Applying A/P & L/R deflection curve...';
    } else {
      if (phaseNameEl) phaseNameEl.textContent = 't3: Critically Damped Settle & Lock';
      if (captionEl)
        captionEl.textContent =
          bullets[bullets.length - 1] ?? 'Locking onto target anatomical landmarks...';
    }
  }

  private renderChallengeAlignmentHUD(res: ChallengeAlignmentResult): void {
    const els = this.challengeElements;
    if (els.titleBadge) {
      els.titleBadge.textContent = `TARGET: ${this.challengeTargetView.shortTitle.toUpperCase()}`;
    }
    if (els.scoreReadout) {
      els.scoreReadout.textContent = `${res.overallScorePct}%`;
      els.scoreReadout.style.color = res.passed
        ? 'var(--accent-emerald)'
        : 'var(--accent-cyan)';
    }
    if (els.barFill) {
      els.barFill.style.width = `${res.overallScorePct}%`;
      els.barFill.classList.toggle('passed', res.passed);
    }

    const fmtDelta = (el: HTMLElement | undefined, label: string, val: number, tol: number, unit: string) => {
      if (!el) return;
      const rounded = Math.round(val);
      const ok = Math.abs(val) <= tol && res.stationMatch;
      el.classList.toggle('ok', ok);
      el.textContent = `${label}:${rounded >= 0 ? '+' : ''}${rounded}${unit}`;
    };

    fmtDelta(els.deltaS, 'Δs', res.deltaSMm, 10, 'mm');
    fmtDelta(els.deltaTorque, 'Δθ', res.deltaTorqueDeg, 12, '°');
    fmtDelta(els.deltaAp, 'ΔAP', res.deltaApDeg, 10, '°');
    fmtDelta(els.deltaLr, 'ΔLR', res.deltaLrDeg, 10, '°');
    fmtDelta(els.deltaOmni, 'Δψ', res.deltaOmniDeg, 12, '°');

    if (els.coachingText) {
      els.coachingText.textContent = res.coachingPrompt;
    }
  }

  // ============================================================================
  // TRACK, MODE & PROCEDURAL STATE SWITCHING
  // ============================================================================

  private switchTrack(track: ClinicalTrackId): void {
    if (this.activeTrack === track) return;
    this.activeTrack = track;
    this.renderViewList();
    const firstView = getCanonicalViewsByTrack(track)[0];
    if (firstView) {
      this.selectView(firstView.id, { animate: false, applyTargetState: true });
    }
    this.syncHeaderButtons();
    this.syncContextualDeckPane();
    this.callbacks.onTrackChange?.(track);
  }

  private switchLearningMode(mode: LearningModeId): void {
    this.activeMode = mode;
    if (mode === 'practice_challenge') {
      this.stopManeuverDemo();
      this.challengeTargetView = this.activeView;
      // Place fellow in neutral starting position (Home View or Mid-LA) to practice reproducing the view organically
      const startStation: ChamberStationId =
        this.challengeTargetView.targetState.station === 'la_transseptal'
          ? 'la_transseptal'
          : 'ra_venous';
      this.setCatheterState(
        {
          station: startStation,
          sMm: 0,
          torqueDeg: 0,
          apDeg: 0,
          lrDeg: 0,
          omniDeg: 0,
        },
        false,
        false
      );
    }
    this.syncHeaderButtons();
    this.syncContextualDeckPane();
    this.callbacks.onLearningModeChange?.(mode);
  }

  private pickRandomChallengeView(): void {
    const pool = getCanonicalViewsByTrack(this.activeTrack);
    const candidates = pool.filter((v) => v.id !== this.challengeTargetView.id);
    const chosen =
      candidates[Math.floor(Math.random() * candidates.length)] ?? pool[0];
    if (!chosen) return;
    this.challengeTargetView = chosen;
    this.activeView = chosen;
    this.highlightActiveViewInList();
    this.renderActiveViewDetail();
    // Reset catheter to neutral so the fellow maneuvers to the new target
    const startStation: ChamberStationId =
      chosen.targetState.station === 'la_transseptal' ? 'la_transseptal' : 'ra_venous';
    this.setCatheterState(
      {
        station: startStation,
        sMm: 0,
        torqueDeg: 0,
        apDeg: 0,
        lrDeg: 0,
        omniDeg: 0,
      },
      false,
      false
    );
  }

  private configureProceduralStateForView(view: CanonicalICEView): void {
    if (view.track === 'watchman_laac') {
      if (view.id === 'wm_02') {
        this.setSimulationState({
          tspTentingMm: 9.5,
          tspHeightAboveMvMm: 42.5,
          tspApOffsetMm: -3.5,
          watchmanStage: 'none',
        });
        this.setUltrasoundSettings({ colorDopplerEnabled: false });
      } else if (view.id === 'wm_03') {
        this.setSimulationState({
          tspTentingMm: 3.0,
          watchmanStage: 'sheath_across',
        });
        this.setUltrasoundSettings({ colorDopplerEnabled: false });
      } else if (view.id === 'wm_09') {
        this.setSimulationState({
          tspTentingMm: 0.0,
          watchmanStage: 'full_deployed',
        });
        this.setUltrasoundSettings({ colorDopplerEnabled: false });
      } else if (view.id === 'wm_10') {
        this.setSimulationState({
          tspTentingMm: 0.0,
          watchmanStage: 'full_deployed',
        });
        this.setUltrasoundSettings({ colorDopplerEnabled: true });
      } else {
        this.setSimulationState({
          tspTentingMm: 0.0,
          watchmanStage: 'none',
        });
        this.setUltrasoundSettings({ colorDopplerEnabled: false });
      }
    } else {
      // Zero-Fluoro Ablation Track
      if (view.id === 'zf_13') {
        this.setSimulationState({
          tspTentingMm: 8.5,
          watchmanStage: 'none',
        });
      } else {
        this.setSimulationState({
          tspTentingMm: 0.0,
          watchmanStage: 'none',
        });
      }
      this.setUltrasoundSettings({ colorDopplerEnabled: false });
    }
  }

  public openLiteratureModal(highlightCitationId: string | null = null): void {
    this.literatureModalOpen = true;
    this.highlightedCitationId = highlightCitationId;
    this.literatureModalBackdrop.classList.add('open');

    this.literatureModalBackdrop
      .querySelectorAll<HTMLElement>('[data-manuscript-card-id]')
      .forEach((card) => {
        const match = card.dataset.manuscriptCardId === this.highlightedCitationId;
        card.classList.toggle('highlighted', match);
        if (match) {
          setTimeout(() => card.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
        }
      });
  }

  public closeLiteratureModal(): void {
    this.literatureModalOpen = false;
    this.literatureModalBackdrop.classList.remove('open');
  }

  private bindKeyboardShortcuts(): void {
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLSelectElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (e.key === 'Escape') {
        if (this.literatureModalOpen) this.closeLiteratureModal();
        if (this.layersPopoverOpen) {
          this.layersPopoverOpen = false;
          this.layersPopoverEl.classList.remove('open');
        }
        if (this.tgcPopoverOpen) {
          this.tgcPopoverOpen = false;
          this.tgcPopoverEl.classList.remove('open');
        }
        return;
      }

      const t = this.targetCatheterState;
      switch (e.key.toLowerCase()) {
        case 'w':
          this.setCatheterState({ sMm: t.sMm + 3 }, false, true);
          break;
        case 's':
          this.setCatheterState({ sMm: t.sMm - 3 }, false, true);
          break;
        case 'd':
          this.setCatheterState({ torqueDeg: t.torqueDeg + 4 }, false, true);
          break;
        case 'a':
          this.setCatheterState({ torqueDeg: t.torqueDeg - 4 }, false, true);
          break;
        case 'arrowup':
          e.preventDefault();
          this.setCatheterState({ apDeg: t.apDeg + 4 }, false, true);
          break;
        case 'arrowdown':
          e.preventDefault();
          this.setCatheterState({ apDeg: t.apDeg - 4 }, false, true);
          break;
        case 'arrowleft':
          e.preventDefault();
          this.setCatheterState({ lrDeg: t.lrDeg + 4 }, false, true);
          break;
        case 'arrowright':
          e.preventDefault();
          this.setCatheterState({ lrDeg: t.lrDeg - 4 }, false, true);
          break;
        case 'e':
          if (t.model === 'nuvision_10f') {
            this.setCatheterState({ omniDeg: t.omniDeg + 5 }, false, true);
          }
          break;
        case 'q':
          if (t.model === 'nuvision_10f') {
            this.setCatheterState({ omniDeg: t.omniDeg - 5 }, false, true);
          }
          break;
        case ' ':
          e.preventDefault();
          this.setUltrasoundSettings({ frozen: !this.ultrasoundSettings.frozen });
          break;
        case 'c':
          this.callbacks.onAcquireCartosoundContour?.(this.activeView);
          this.render3DCalloutStrip();
          break;
        case 'm':
          this.caliperToolActive = !this.caliperToolActive;
          this.syncUltrasoundToolbar();
          this.callbacks.onToggleCaliperTool?.(this.caliperToolActive);
          break;
        case 'l': {
          const order: LabelOverlayMode[] = ['all', 'hover', 'off'];
          const nextIdx =
            (order.indexOf(this.ultrasoundSettings.labelOverlayMode) + 1) % order.length;
          this.setUltrasoundSettings({ labelOverlayMode: order[nextIdx] });
          break;
        }
      }
    });
  }

  private smoothstep(x: number): number {
    const c = Math.max(0, Math.min(1, x));
    return c * c * (3 - 2 * c);
  }
}
