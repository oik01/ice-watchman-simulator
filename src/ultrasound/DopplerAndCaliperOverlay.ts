/**
 * WORKSTREAM 2 — CLINICAL CONSOLE STAGE, EHRA TYPOGRAPHY & PIXEL-ACCURATE DOPPLER OVERLAY
 *
 * Implements:
 *   1. Unframed Clinical Phased-Array Sector Stage (`[SPEC PATCH #3 & #10]`):
 *      - Zero solid Amber/Cyan vector border lines or arc rings around the 2D/4D acoustic fan.
 *      - Angled centimeter depth tick marks (1..10 cm major, 0.5 cm minor) and chartreuse-yellow
 *        focal-zone caret (`▸`, `#D4E157`) directly along the left radial edge of the 90° sector cone.
 *      - Clinical chartreuse-yellow `V` orientation emblem at the upper sector apex (`markerSide`).
 *      - Continuous 256-step Right-Margin Grayscale Compression Bar (`M4` / dynamic range dB).
 *   2. Authentic Biplane (`xPlane`) White Dashed Cut-Line & 22px Circular Omniplane Angle Dials (`[SPEC PATCH #6]`):
 *      - Thin white dashed cut-line down the primary sector azimuth with yellow apex dot and
 *        distal cyan (`#38BDF8`) triangle caret, plus circular omniplane dial icons (`0°` / `90°`).
 *   3. EHRA / *Circulation* Direct-in-Lumen & Short-Arrow Clinical Typography (`[SPEC PATCH #8 & #11]`):
 *      - Zero dotted structure contour rings (`drawStructureContourDots` purged) and zero rectangular pill boxes.
 *      - Category A (Chambers & Vessels): Bold white sans-serif (`#FFFFFF` with `2.5px` `#000000` halo)
 *        placed directly inside the dark blood lumen.
 *      - Category B (Valves, Ridges, Septum & Devices): Clean white text offset into open space
 *        with a short, crisp `1.4px` straight white arrow (`→` with `5px` filled white arrowhead).
 *      - 2D force-directed repulsion solver preventing label overlaps and clamping inside pane bounds.
 *   4. Pixel-Accurate Polar Scan-Converted BART Color Doppler (`[SPEC PATCH #7]`):
 *      - Per-pixel bilinear polar interpolation (`getImageData` / `putImageData`) inside the dashed ROI cone,
 *        combining `dopplerGrid` with physiological multi-chamber inflow/outflow/PV/FO/Watchman plumes
 *        and Tissue-Priority Write Thresholding (`luma < 0.44`) so flow fills blood lumens organically.
 */

import {
  ANATOMICAL_STRUCTURES,
  AnatomicalStructureMeta,
  CanonicalICEView,
  CatheterPose3D,
  CatheterState,
  DEFAULT_CATHETER_STATE,
  DEFAULT_PROCEDURAL_SIMULATION_STATE,
  ProceduralSimulationState,
  StructureId,
  UltrasoundSettings,
} from '../types/sharedContracts';
import {
  CanvasHitResult,
  SectorGeometryLayout,
  SectorLandmarkStats,
  UltrasoundSlicerEngine,
} from './UltrasoundSlicerEngine';

export interface CaliperMeasurement {
  active: boolean;
  label: string;
  p1Polar: { depthMm: number; azimuthDeg: number; panel: 'primary' | 'secondary' };
  p2Polar: { depthMm: number; azimuthDeg: number; panel: 'primary' | 'secondary' };
  distanceMm: number;
  clinicalNote: string;
  compressionPct?: number;
}

export interface ColorDopplerRoiBox {
  minDepthNorm: number; // [0.1, 0.9]
  maxDepthNorm: number; // [0.2, 0.95]
  minAzimuthDeg: number; // [-42, +42]
  maxAzimuthDeg: number; // [-42, +42]
  nyquistCmPerSec: number; // Default 58 cm/s (or 35 cm/s for Watchman / LAA low-flow seal check)
}

export interface OverlayCallbacks {
  onStructureHover?: (structureId: number | null, hit: CanvasHitResult | null) => void;
  onStructureSelect?: (structureId: number | null, hit: CanvasHitResult | null) => void;
  onFocusDepthChange?: (newFocusCm: number) => void;
  onCaliperChange?: (measurement: CaliperMeasurement | null) => void;
  onMarkerSideToggle?: () => void;
}

const DEG2RAD = Math.PI / 180;

/**
 * EHRA / Circulation Typography Classification (`[SPEC PATCH #8 & #11]`):
 * - Category A ('lumen'): Chamber & great-vessel cavities rendered directly inside the dark lumen
 *   with bold white sans-serif and a 2.5px black halo (zero boxes, zero leader lines).
 * - Category B ('arrow'): Thin tissue landmarks, valve leaflets, ridges, and hardware rendered
 *   with clean white text + a short 1.4px straight white arrow (`→` with 5px arrowhead).
 */
interface ClinicalLabelSpec {
  text: string;
  category: 'lumen' | 'arrow';
  priority: number;
}

const EHRA_CLINICAL_LABELS: Record<number, ClinicalLabelSpec> = {
  [StructureId.RA_CAVITY]: { text: 'RA', category: 'lumen', priority: 10 },
  [StructureId.RAA_PECTINATES]: { text: 'RAA', category: 'lumen', priority: 8 },
  [StructureId.CRISTA_TERMINALIS]: { text: 'Crista', category: 'arrow', priority: 7 },
  [StructureId.SVC]: { text: 'SVC', category: 'lumen', priority: 9 },
  [StructureId.IVC]: { text: 'IVC', category: 'lumen', priority: 8 },
  [StructureId.EUSTACHIAN_RIDGE]: { text: 'Eustachian ridge', category: 'arrow', priority: 8 },
  [StructureId.CTI_FLOOR]: { text: 'CTI', category: 'arrow', priority: 8 },
  [StructureId.CORONARY_SINUS_OSTIUM]: { text: 'CS', category: 'lumen', priority: 9 },
  [StructureId.THEBESIAN_VALVE]: { text: 'Thebesian v.', category: 'arrow', priority: 6 },
  [StructureId.TRIANGLE_OF_KOCH_HIS]: { text: 'His / Koch', category: 'arrow', priority: 7 },
  [StructureId.FOSSA_OVALIS]: { text: 'Fossa Ovalis', category: 'arrow', priority: 10 },
  [StructureId.IAS_LIMBUS]: { text: 'Limbus', category: 'arrow', priority: 8 },
  [StructureId.TRICUSPID_VALVE_ANT]: { text: 'TV', category: 'arrow', priority: 9 },
  [StructureId.TRICUSPID_VALVE_SEPT]: { text: 'TV', category: 'arrow', priority: 9 },
  [StructureId.TRICUSPID_VALVE_POST]: { text: 'TV', category: 'arrow', priority: 8 },
  [StructureId.RV_CAVITY]: { text: 'RV', category: 'lumen', priority: 10 },
  [StructureId.MODERATOR_BAND]: { text: 'Moderator band', category: 'arrow', priority: 9 },
  [StructureId.RV_PAPILLARY_MUSCLES]: { text: 'RV papillary', category: 'arrow', priority: 7 },
  [StructureId.RVOT_INFUNDIBULUM]: { text: 'RVOT', category: 'lumen', priority: 10 },
  [StructureId.PULMONIC_VALVE]: { text: 'PV', category: 'arrow', priority: 9 },
  [StructureId.MAIN_PA_LPA_RPA]: { text: 'PA', category: 'lumen', priority: 9 },
  [StructureId.AORTIC_VALVE_NCC]: { text: 'NCC', category: 'lumen', priority: 9 },
  [StructureId.AORTIC_VALVE_RCC]: { text: 'RCC', category: 'lumen', priority: 9 },
  [StructureId.AORTIC_VALVE_LCC]: { text: 'LCC', category: 'lumen', priority: 9 },
  [StructureId.ASCENDING_AORTA_ROOT]: { text: 'Ao', category: 'lumen', priority: 10 },
  [StructureId.CORONARY_ARTERIES_LMCA_RCA_LCX]: { text: 'LCx', category: 'arrow', priority: 8 },
  [StructureId.LA_CAVITY]: { text: 'LA', category: 'lumen', priority: 10 },
  [StructureId.LAA_OSTIUM_AND_LOBES]: { text: 'LAA', category: 'lumen', priority: 10 },
  [StructureId.COUMADIN_RIDGE]: { text: 'Coumadin Ridge', category: 'arrow', priority: 9 },
  [StructureId.LSPV]: { text: 'LSPV', category: 'lumen', priority: 10 },
  [StructureId.LIPV]: { text: 'LIPV', category: 'lumen', priority: 10 },
  [StructureId.RSPV]: { text: 'RSPV', category: 'lumen', priority: 10 },
  [StructureId.RIPV]: { text: 'RIPV', category: 'lumen', priority: 10 },
  [StructureId.MITRAL_VALVE_AML_PML]: { text: 'MV', category: 'arrow', priority: 9 },
  [StructureId.LV_CAVITY_AND_IVS]: { text: 'LV', category: 'lumen', priority: 10 },
  [StructureId.LV_PAPILLARY_AL_PM]: { text: 'Papillary m.', category: 'arrow', priority: 8 },
  [StructureId.DESCENDING_AORTA]: { text: 'Desc Ao', category: 'lumen', priority: 8 },
  [StructureId.RETROCARDIAC_ESOPHAGUS]: { text: 'Oesophagus', category: 'arrow', priority: 8 },
  [StructureId.PERICARDIAL_SPACE]: { text: 'Pericardium', category: 'arrow', priority: 5 },
  [StructureId.WATCHMAN_FLX_DEVICE]: { text: 'Watchman FLX', category: 'arrow', priority: 12 },
  [StructureId.TRANSSEPTAL_NEEDLE_SHEATH]: { text: 'TSP Needle', category: 'arrow', priority: 12 },
  [StructureId.ABLATION_CATHETER_TIP]: { text: 'Abl', category: 'arrow', priority: 12 },
};

/**
 * Converts a 3D unit vector in World Coordinates (+X = Left, +Y = Superior, +Z = Anterior)
 * into a concise clinical anatomical compass string (e.g. "SUPERIOR", "ANT · LEFT", "POSTERIOR").
 */
export function vectorToAnatomicalCompassLabel(vec: [number, number, number]): string {
  const [vx, vy, vz] = vec;
  const ax = Math.abs(vx);
  const ay = Math.abs(vy);
  const az = Math.abs(vz);

  const termX = vx >= 0 ? 'LEFT' : 'RIGHT';
  const termY = vy >= 0 ? 'SUPERIOR' : 'INFERIOR';
  const termZ = vz >= 0 ? 'ANTERIOR' : 'POSTERIOR';

  const pairs: { val: number; label: string }[] = [
    { val: ay, label: termY },
    { val: az, label: termZ },
    { val: ax, label: termX },
  ].sort((a, b) => b.val - a.val);

  if (pairs[0].val >= 0.76 || pairs[1].val < 0.34) {
    return pairs[0].label;
  }
  const shortMap: Record<string, string> = {
    SUPERIOR: 'SUP',
    INFERIOR: 'INF',
    ANTERIOR: 'ANT',
    POSTERIOR: 'POST',
    LEFT: 'LEFT',
    RIGHT: 'RIGHT',
  };
  return `${shortMap[pairs[0].label]} · ${shortMap[pairs[1].label]}`;
}

/**
 * Evaluates a realistic physiological Lead II P-QRS-T ECG voltage in [-0.4, +1.0]
 * for normalized R-R cardiac phase in [0, 1).
 */
export function evaluateLeadIIEcgWaveform(phase: number): number {
  const p = ((phase % 1.0) + 1.0) % 1.0;
  const qWave = -0.16 * Math.exp(-Math.pow((p - 0.048) / 0.011, 2));
  const rWave = 0.96 * Math.exp(-Math.pow((p - 0.08) / 0.014, 2));
  const sWave = -0.26 * Math.exp(-Math.pow((p - 0.112) / 0.013, 2));
  const tWave = 0.31 * Math.exp(-Math.pow((p - 0.31) / 0.052, 2));
  const pWave = 0.18 * Math.exp(-Math.pow((p - 0.88) / 0.036, 2));
  return qWave + rWave + sWave + tWave + pWave;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / Math.max(1e-6, edge1 - edge0), 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}

function hash2D(ix: number, iy: number): number {
  let n = Math.imul(ix, 374761393) + Math.imul(iy, 668265263);
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295.0;
}

export class DopplerAndCaliperOverlay {
  private slicer: UltrasoundSlicerEngine;
  private callbacks: OverlayCallbacks = {};

  private pointerCanvasX = -1;
  private pointerCanvasY = -1;
  private pointerInside = false;
  private hoveredHit: CanvasHitResult | null = null;
  private externalHighlightStructureId: number | null = null;

  private caliperModeEnabled = false;
  private draggingHandle: 'p1' | 'p2' | 'focus' | null = null;
  private caliperMeasurement: CaliperMeasurement = {
    active: false,
    label: 'Digital Caliper',
    p1Polar: { depthMm: 36, azimuthDeg: -16, panel: 'primary' },
    p2Polar: { depthMm: 54, azimuthDeg: 18, panel: 'primary' },
    distanceMm: 27.4,
    clinicalNote: 'Drag [+] endpoints on sector to measure anatomical distance in mm',
  };

  private dopplerRoi: ColorDopplerRoiBox = {
    minDepthNorm: 0.10,
    maxDepthNorm: 0.85,
    minAzimuthDeg: -28,
    maxAzimuthDeg: 28,
    nyquistCmPerSec: 58,
  };

  private renderCornerTelemetry = true;
  private renderBottomEcgStrip = true;
  private activeViewId: string | null = null;
  private activeView: CanonicalICEView | null = null;
  private listenersBound = false;

  // Reusable polar velocity & turbulence scratch buffers for pixel-accurate BART scan conversion
  private smoothedVelGrid = new Float32Array(96 * 128);
  private smoothedTurbGrid = new Float32Array(96 * 128);
  private tempGrid = new Float32Array(96 * 128);

  constructor(slicer: UltrasoundSlicerEngine, callbacks?: OverlayCallbacks) {
    this.slicer = slicer;
    if (callbacks) {
      this.callbacks = callbacks;
    }
    this.bindCanvasPointerEvents();
  }

  public setCallbacks(callbacks: OverlayCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  public setActiveViewId(viewId: string | null): void {
    this.activeViewId = viewId;
  }

  public setRenderCornerTelemetry(enabled: boolean): void {
    this.renderCornerTelemetry = enabled;
  }

  public setRenderBottomEcgStrip(enabled: boolean): void {
    this.renderBottomEcgStrip = enabled;
  }

  public setExternalHighlightedStructureId(structureId: number | null): void {
    this.externalHighlightStructureId = structureId;
  }

  public getHoveredHit(): CanvasHitResult | null {
    return this.hoveredHit;
  }

  public isCaliperModeEnabled(): boolean {
    return this.caliperModeEnabled;
  }

  public setCaliperMode(enabled: boolean): void {
    this.caliperModeEnabled = enabled;
    if (enabled && !this.caliperMeasurement.active) {
      this.caliperMeasurement.active = true;
      this.recomputeCaliperDistance();
      this.callbacks.onCaliperChange?.(this.caliperMeasurement);
    }
  }

  public toggleCaliperMode(): boolean {
    this.setCaliperMode(!this.caliperModeEnabled);
    return this.caliperModeEnabled;
  }

  public clearCalipers(): void {
    this.caliperModeEnabled = false;
    this.caliperMeasurement.active = false;
    this.callbacks.onCaliperChange?.(null);
  }

  public getActiveMeasurement(): CaliperMeasurement | null {
    return this.caliperMeasurement.active ? this.caliperMeasurement : null;
  }

  public setDopplerRoi(roi: Partial<ColorDopplerRoiBox>): void {
    this.dopplerRoi = { ...this.dopplerRoi, ...roi };
  }

  public getDopplerRoi(): ColorDopplerRoiBox {
    return this.dopplerRoi;
  }

  /**
   * Binds interactive pointer events (hover structure inspect, caliper dragging, focal caret dragging)
   * directly to the Ultrasound Slicer canvas.
   */
  public bindCanvasPointerEvents(canvas?: HTMLCanvasElement | null): void {
    const targetCanvas = canvas ?? this.slicer.getCanvas();
    if (!targetCanvas || this.listenersBound) return;
    this.listenersBound = true;

    const getCanvasCoords = (ev: MouseEvent | PointerEvent): [number, number] => {
      const rect = targetCanvas.getBoundingClientRect();
      const scaleX = targetCanvas.width / Math.max(1, rect.width);
      const scaleY = targetCanvas.height / Math.max(1, rect.height);
      return [(ev.clientX - rect.left) * scaleX, (ev.clientY - rect.top) * scaleY];
    };

    targetCanvas.addEventListener('pointermove', (ev: PointerEvent) => {
      const [cx, cy] = getCanvasCoords(ev);
      this.pointerCanvasX = cx;
      this.pointerCanvasY = cy;
      this.pointerInside = true;

      // Handle active drag of caliper endpoint or focal-zone caret
      if (this.draggingHandle === 'p1' || this.draggingHandle === 'p2') {
        const worldHit = this.slicer.canvasXYToWorld(cx, cy);
        if (worldHit) {
          const targetPolar =
            this.draggingHandle === 'p1' ? this.caliperMeasurement.p1Polar : this.caliperMeasurement.p2Polar;
          targetPolar.depthMm = Number(worldHit.depthMm.toFixed(1));
          targetPolar.azimuthDeg = Number(worldHit.azimuthDeg.toFixed(1));
          targetPolar.panel = worldHit.panel;
          this.caliperMeasurement.label = 'Manual 2-Point Caliper';
          this.recomputeCaliperDistance();
          this.callbacks.onCaliperChange?.(this.caliperMeasurement);
        }
        return;
      }

      if (this.draggingHandle === 'focus') {
        const layout = this.slicer.getSectorGeometry('primary');
        if (layout) {
          const dx = cx - layout.apexX;
          const dy = cy - layout.apexY;
          const tx = -Math.sin(layout.halfAngleRad);
          const ty = Math.cos(layout.halfAngleRad);
          const rProj = dx * tx + dy * ty;
          const radialSpan = Math.max(1, layout.outerRadiusPx - layout.innerRadiusPx);
          const normR =
            cx < 38
              ? (cy - layout.apexY - layout.innerRadiusPx) / radialSpan
              : (rProj - layout.innerRadiusPx) / radialSpan;
          const clampedNorm = clamp(normR, 0.15, 0.92);
          const newFocusCm = Number(((clampedNorm * layout.depthMm) / 10).toFixed(1));
          this.callbacks.onFocusDepthChange?.(newFocusCm);
        }
        return;
      }

      // Live Hover-to-Identify structure lookup (SPEC PATCH #8)
      const hit = this.slicer.getStructureAtCanvasXY(cx, cy);
      const prevSid = this.hoveredHit?.structureId ?? null;
      const nextSid = hit && hit.structureId > 0 ? hit.structureId : null;
      this.hoveredHit = hit && hit.structureId > 0 ? hit : null;
      if (prevSid !== nextSid) {
        this.callbacks.onStructureHover?.(nextSid, this.hoveredHit);
      }
    });

    targetCanvas.addEventListener('pointerdown', (ev: PointerEvent) => {
      const [cx, cy] = getCanvasCoords(ev);
      this.pointerCanvasX = cx;
      this.pointerCanvasY = cy;

      // 1. Check if clicking near caliper handles when caliper is active
      if (this.caliperMeasurement.active) {
        const p1Screen = this.slicer.polarToCanvasXY(
          this.caliperMeasurement.p1Polar.depthMm,
          this.caliperMeasurement.p1Polar.azimuthDeg,
          this.caliperMeasurement.p1Polar.panel
        );
        const p2Screen = this.slicer.polarToCanvasXY(
          this.caliperMeasurement.p2Polar.depthMm,
          this.caliperMeasurement.p2Polar.azimuthDeg,
          this.caliperMeasurement.p2Polar.panel
        );
        if (p1Screen && Math.hypot(cx - p1Screen[0], cy - p1Screen[1]) < 18) {
          this.draggingHandle = 'p1';
          targetCanvas.setPointerCapture(ev.pointerId);
          return;
        }
        if (p2Screen && Math.hypot(cx - p2Screen[0], cy - p2Screen[1]) < 18) {
          this.draggingHandle = 'p2';
          targetCanvas.setPointerCapture(ev.pointerId);
          return;
        }
      }

      // 2. Check if clicking near the chartreuse focal-zone caret along the angled left radial edge
      const layout = this.slicer.getSectorGeometry('primary');
      if (layout) {
        const dx = cx - layout.apexX;
        const dy = cy - layout.apexY;
        const tx = -Math.sin(layout.halfAngleRad);
        const ty = Math.cos(layout.halfAngleRad);
        const nx = -Math.cos(layout.halfAngleRad);
        const ny = -Math.sin(layout.halfAngleRad);
        const rProj = dx * tx + dy * ty;
        const nDist = dx * nx + dy * ny;
        const onAngledLeftEdge =
          rProj >= layout.innerRadiusPx - 8 &&
          rProj <= layout.outerRadiusPx + 8 &&
          nDist >= -8 &&
          nDist <= 24;
        const legacyRulerX = Math.max(18, layout.apexX - layout.outerRadiusPx * Math.sin(layout.halfAngleRad) - 18);
        const onLegacyLeftRuler =
          Math.abs(cx - legacyRulerX) < 16 && cy >= layout.apexY && cy <= layout.apexY + layout.outerRadiusPx;

        if (onAngledLeftEdge || onLegacyLeftRuler) {
          this.draggingHandle = 'focus';
          targetCanvas.setPointerCapture(ev.pointerId);
          return;
        }
      }

      // 3. If in caliper mode, clicking inside the sector places P1 then P2
      if (this.caliperModeEnabled) {
        const worldHit = this.slicer.canvasXYToWorld(cx, cy);
        if (worldHit) {
          if (!this.caliperMeasurement.active) {
            this.caliperMeasurement.active = true;
            this.caliperMeasurement.p1Polar = {
              depthMm: Number(worldHit.depthMm.toFixed(1)),
              azimuthDeg: Number(worldHit.azimuthDeg.toFixed(1)),
              panel: worldHit.panel,
            };
            this.caliperMeasurement.p2Polar = {
              depthMm: Number(Math.min(layout?.depthMm ?? 90, worldHit.depthMm + 16).toFixed(1)),
              azimuthDeg: Number(Math.min(35, worldHit.azimuthDeg + 14).toFixed(1)),
              panel: worldHit.panel,
            };
          } else {
            this.caliperMeasurement.p2Polar = {
              depthMm: Number(worldHit.depthMm.toFixed(1)),
              azimuthDeg: Number(worldHit.azimuthDeg.toFixed(1)),
              panel: worldHit.panel,
            };
          }
          this.caliperMeasurement.label = 'Manual 2-Point Caliper';
          this.recomputeCaliperDistance();
          this.draggingHandle = 'p2';
          targetCanvas.setPointerCapture(ev.pointerId);
          this.callbacks.onCaliperChange?.(this.caliperMeasurement);
          return;
        }
      }

      // 4. Otherwise fire structure click callback
      const hit = this.slicer.getStructureAtCanvasXY(cx, cy);
      if (hit && hit.structureId > 0) {
        this.callbacks.onStructureSelect?.(hit.structureId, hit);
      }
    });

    const stopDrag = (ev: PointerEvent) => {
      if (this.draggingHandle) {
        try {
          targetCanvas.releasePointerCapture(ev.pointerId);
        } catch {
          // ignore
        }
        this.draggingHandle = null;
      }
    };

    targetCanvas.addEventListener('pointerup', stopDrag);
    targetCanvas.addEventListener('pointercancel', stopDrag);
    targetCanvas.addEventListener('pointerleave', () => {
      this.pointerInside = false;
      if (this.hoveredHit !== null) {
        this.hoveredHit = null;
        this.callbacks.onStructureHover?.(null, null);
      }
    });
  }

  /**
   * Recomputes the exact 3D/2D Euclidean distance (mm) between Caliper P1 and P2.
   */
  private recomputeCaliperDistance(): void {
    const p1 = this.caliperMeasurement.p1Polar;
    const p2 = this.caliperMeasurement.p2Polar;
    const r1 = p1.depthMm;
    const r2 = p2.depthMm;
    const dTheta = (p2.azimuthDeg - p1.azimuthDeg) * DEG2RAD;
    const distMm = Math.sqrt(Math.max(0.1, r1 * r1 + r2 * r2 - 2 * r1 * r2 * Math.cos(dTheta)));
    this.caliperMeasurement.distanceMm = Number(distMm.toFixed(1));
  }

  /**
   * "Auto-Measure Current View" Preset Helper.
   * Automatically positions the 2-point digital calipers on the primary clinical landmark
   * of the current view (e.g., Fossa Ovalis Tenting Height above MV, LAA Landing Zone Ostium,
   * Watchman FLX Compressed Diameter + % Compression, Aortic Root Diameter, or CTI Length).
   */
  public autoMeasureCurrentView(
    _pose?: CatheterPose3D,
    _settings?: UltrasoundSettings,
    simState?: ProceduralSimulationState,
    catheterState?: CatheterState,
    activeView?: CanonicalICEView | string | null
  ): CaliperMeasurement {
    const viewId =
      typeof activeView === 'string'
        ? activeView
        : activeView && typeof activeView === 'object'
          ? activeView.id
          : this.activeViewId;
    const proc = simState ?? DEFAULT_PROCEDURAL_SIMULATION_STATE;
    const cath = catheterState ?? DEFAULT_CATHETER_STATE;
    const landmarks = this.slicer.getLatestLandmarkMap();

    this.caliperModeEnabled = true;
    this.caliperMeasurement.active = true;
    this.caliperMeasurement.compressionPct = undefined;

    // Case 1: Watchman FLX Deployed / PASS Verification (wm_09, wm_10 or watchmanStage deployed)
    if (
      viewId === 'wm_09' ||
      viewId === 'wm_10' ||
      proc.watchmanStage === 'full_deployed' ||
      proc.watchmanStage === 'released' ||
      proc.watchmanStage === 'triangle'
    ) {
      const nominalMm = proc.watchmanSizeMm ?? 27;
      const compressedMm = Number((nominalMm * 0.818).toFixed(1));
      const compPct = Number(((1.0 - compressedMm / nominalMm) * 100).toFixed(1));
      const wmHit =
        landmarks.get(StructureId.WATCHMAN_FLX_DEVICE) ??
        landmarks.get(StructureId.LAA_OSTIUM_AND_LOBES);
      const centerDepth = wmHit ? wmHit.meanDepthMm : 36.0;
      const centerAz = wmHit ? wmHit.meanAzimuthDeg : 2.0;
      const halfSpanDeg = Math.min(
        26,
        Math.max(10, ((compressedMm * 0.5) / Math.max(20, centerDepth)) * (180 / Math.PI))
      );

      this.caliperMeasurement = {
        active: true,
        label: `Watchman FLX (${nominalMm}mm) Compressed Ø`,
        p1Polar: {
          depthMm: centerDepth,
          azimuthDeg: Number((centerAz - halfSpanDeg).toFixed(1)),
          panel: 'primary',
        },
        p2Polar: {
          depthMm: centerDepth,
          azimuthDeg: Number((centerAz + halfSpanDeg).toFixed(1)),
          panel: 'primary',
        },
        distanceMm: compressedMm,
        compressionPct: compPct,
        clinicalNote: `${compressedMm} mm [${compPct}% compression — PASS Target: 10–30%]`,
      };
      this.callbacks.onCaliperChange?.(this.caliperMeasurement);
      return this.caliperMeasurement;
    }

    // Case 2: LAA Ostium / Landing Zone Sizing (wm_04, wm_05, wm_06, wm_07, wm_08, zf_14)
    if (
      viewId === 'wm_04' ||
      viewId === 'wm_05' ||
      viewId === 'wm_06' ||
      viewId === 'wm_07' ||
      viewId === 'wm_08' ||
      viewId === 'zf_14' ||
      cath.station === 'la_transseptal'
    ) {
      const laaHit = landmarks.get(StructureId.LAA_OSTIUM_AND_LOBES);
      const ridgeHit = landmarks.get(StructureId.COUMADIN_RIDGE);
      const lcxHit = landmarks.get(StructureId.CORONARY_ARTERIES_LMCA_RCA_LCX);

      const d1 = ridgeHit ? ridgeHit.meanDepthMm : laaHit ? laaHit.meanDepthMm - 3 : 34.0;
      const a1 = ridgeHit ? ridgeHit.meanAzimuthDeg : 15.0;
      const d2 = lcxHit ? lcxHit.meanDepthMm : laaHit ? laaHit.meanDepthMm + 3 : 38.0;
      const a2 = lcxHit ? lcxHit.meanAzimuthDeg : -16.0;

      this.caliperMeasurement = {
        active: true,
        label: 'LAA Landing Zone Ostium (LCx ↔ Ridge)',
        p1Polar: { depthMm: d1, azimuthDeg: a1, panel: 'primary' },
        p2Polar: { depthMm: d2, azimuthDeg: a2, panel: 'primary' },
        distanceMm: 21.4,
        clinicalNote: 'LAA Landing Zone: 21.4 mm (Recommended: 27 mm Watchman FLX)',
      };
      this.recomputeCaliperDistance();
      if (this.caliperMeasurement.distanceMm < 16 || this.caliperMeasurement.distanceMm > 28) {
        this.caliperMeasurement.distanceMm = 21.4;
      }
      this.caliperMeasurement.clinicalNote = `LAA Landing Zone: ${this.caliperMeasurement.distanceMm.toFixed(1)} mm → Select 27 mm Watchman FLX`;
      this.callbacks.onCaliperChange?.(this.caliperMeasurement);
      return this.caliperMeasurement;
    }

    // Case 3: Fossa Ovalis Transseptal Puncture Tenting Height above Mitral Valve (zf_13, wm_02, wm_03)
    if (viewId === 'zf_13' || viewId === 'wm_02' || viewId === 'wm_03' || proc.tspTentingMm > 0) {
      const foHit = landmarks.get(StructureId.FOSSA_OVALIS);
      const mvHit = landmarks.get(StructureId.MITRAL_VALVE_AML_PML);
      const heightMm = Number((proc.tspHeightAboveMvMm ?? 42.5).toFixed(1));
      this.caliperMeasurement = {
        active: true,
        label: 'Fossa Ovalis TSP Height Above MV',
        p1Polar: {
          depthMm: foHit ? foHit.meanDepthMm : 22.0,
          azimuthDeg: foHit ? foHit.meanAzimuthDeg : 4.0,
          panel: 'primary',
        },
        p2Polar: {
          depthMm: mvHit ? mvHit.meanDepthMm : 58.0,
          azimuthDeg: mvHit ? mvHit.meanAzimuthDeg : -18.0,
          panel: 'primary',
        },
        distanceMm: heightMm,
        clinicalNote: `TSP Tenting Height: ${heightMm} mm above MV [Optimal LAAC: 40–45 mm]`,
      };
      this.callbacks.onCaliperChange?.(this.caliperMeasurement);
      return this.caliperMeasurement;
    }

    // Case 4: Default anatomical landmark span in current view
    const hitArray = Array.from(landmarks.entries());
    if (hitArray.length >= 2) {
      const first = hitArray[0][1];
      const second = hitArray[Math.min(2, hitArray.length - 1)][1];
      this.caliperMeasurement = {
        active: true,
        label: 'Anatomical Landmark Span',
        p1Polar: { depthMm: first.meanDepthMm, azimuthDeg: first.meanAzimuthDeg, panel: 'primary' },
        p2Polar: {
          depthMm: second.meanDepthMm,
          azimuthDeg: second.meanAzimuthDeg,
          panel: 'primary',
        },
        distanceMm: 24.0,
        clinicalNote: 'Real-time 3D sector caliper measurement (mm)',
      };
      this.recomputeCaliperDistance();
      this.caliperMeasurement.clinicalNote = `Measured Sector Span: ${this.caliperMeasurement.distanceMm.toFixed(1)} mm`;
    } else {
      this.caliperMeasurement.active = true;
      this.recomputeCaliperDistance();
    }

    this.callbacks.onCaliperChange?.(this.caliperMeasurement);
    return this.caliperMeasurement;
  }

  public triggerAutoMeasure(
    pose?: CatheterPose3D,
    settings?: UltrasoundSettings,
    simState?: ProceduralSimulationState,
    catheterState?: CatheterState,
    activeView?: CanonicalICEView | string | null
  ): CaliperMeasurement {
    return this.autoMeasureCurrentView(pose, settings, simState, catheterState, activeView);
  }

  /**
   * Master 2D Canvas Overlay Render Pass.
   * Call immediately after `slicerEngine.renderFrame(...)` on every animation frame.
   */
  public renderOverlay(
    pose: CatheterPose3D,
    settings: UltrasoundSettings,
    simState: ProceduralSimulationState,
    catheterState?: CatheterState,
    activeView?: CanonicalICEView | string | null
  ): void {
    if (activeView) {
      if (typeof activeView === 'string') {
        this.activeViewId = activeView;
      } else {
        this.activeViewId = activeView.id;
        this.activeView = activeView;
      }
    }
    const ctx = this.slicer.getContext();
    const canvas = this.slicer.getCanvas();
    if (!ctx || !canvas) return;

    const cath = catheterState ?? DEFAULT_CATHETER_STATE;
    const primaryLayout = this.slicer.getSectorGeometry('primary');
    const secondaryLayout = this.slicer.getSectorGeometry('secondary');
    if (!primaryLayout) return;

    ctx.save();

    // 1. Pixel-Accurate Polar Scan-Converted BART Color Doppler Overlay (must run BEFORE text/lines
    //    so ctx.getImageData reads pure B-mode luminance for Tissue-Priority Write Thresholding!)
    if (settings.colorDopplerEnabled) {
      this.renderColorDopplerSector(ctx, primaryLayout, settings, simState, 'primary');
      if (secondaryLayout && cath.biplaneEnabled) {
        this.renderColorDopplerSector(ctx, secondaryLayout, settings, simState, 'secondary');
      }
      this.renderBartColorScaleBar(ctx, canvas.width, canvas.height, simState);
    }

    // 2. Right-Margin 256-Step Grayscale Compression Bar (`[SPEC PATCH #3 & #10]`)
    this.renderGrayscaleCompressionBar(ctx, canvas.width, canvas.height, settings);

    // 3. Unframed Clinical Sector Stage: V Orientation Marker, Biplane xPlane Dashed Cut-Line,
    //    22px Omniplane Dials & Outer-Margin Muted Compass (`[SPEC PATCH #3, #6, #10]`)
    this.renderSectorBordersAndCompass(ctx, primaryLayout, pose, settings, cath, false);
    if (secondaryLayout) {
      if (cath.volume4dEnabled) {
        this.render4dEnFaceBorderAndHeader(ctx, secondaryLayout, simState);
      } else if (cath.biplaneEnabled) {
        this.renderSectorBordersAndCompass(ctx, secondaryLayout, pose, settings, cath, true);
      }
    }

    // 4. Angled Centimeter Depth Scale Ticks & Chartreuse Focal-Zone Caret (`▸`) along Left Radial Edge
    this.renderDepthScaleAndFocalCaret(ctx, primaryLayout, settings, false);
    if (secondaryLayout && cath.biplaneEnabled) {
      this.renderDepthScaleAndFocalCaret(ctx, secondaryLayout, settings, true);
    }

    // 5. EHRA / Circulation Direct-in-Lumen & Short-Arrow Clinical Typography (`[SPEC PATCH #8 & #11]`)
    this.renderAnatomicalLabelsAndContours(ctx, primaryLayout, settings, cath);

    // 6. 2-Point Digital Caliper Tool (+ ... +) with live mm & Watchman compression readout
    if (this.caliperMeasurement.active) {
      this.renderDigitalCalipers(ctx);
    }

    // 7. Corner-Pinned Tabular Telemetry & Bottom Synchronized #10B981 Lead II ECG Strip
    if (this.renderCornerTelemetry) {
      this.renderCornerPinnedTelemetry(ctx, canvas.width, canvas.height, settings, simState, cath);
    }
    if (this.renderBottomEcgStrip) {
      this.renderLeadIIEcgStrip(ctx, canvas.width, canvas.height, simState, settings.frozen);
    }

    // 8. Interactive Hover-to-Identify Tooltip Card (when hovering a structure)
    if (this.pointerInside && this.hoveredHit && settings.labelOverlayMode !== 'off') {
      this.renderHoverTooltip(ctx, canvas.width, canvas.height, this.hoveredHit);
    }

    ctx.restore();
  }

  /**
   * Pixel-Accurate Polar Scan-Converted BART Color Doppler Renderer (`[SPEC PATCH #7]`):
   * - Synthesizes a continuous polar velocity & turbulence field (`smoothedVelGrid`, `smoothedTurbGrid`)
   *   combining the slicer's `dopplerGrid` with physiological chamber/valve inflow & outflow jets.
   * - Performs per-pixel bilinear polar interpolation across the screen-space ROI bounding box.
   * - Applies **Tissue-Priority Write Thresholding** against the underlying B-mode pixel luminance
   *   (`luma < 0.44`) so Color Doppler naturally fills dark blood cavities and flows between bright
   *   valve leaflets / around the Watchman FLX without painting over bright myocardial walls.
   */
  private renderColorDopplerSector(
    ctx: CanvasRenderingContext2D,
    layout: SectorGeometryLayout,
    _settings: UltrasoundSettings,
    simState: ProceduralSimulationState,
    panel: 'primary' | 'secondary'
  ): void {
    const { dopplerGrid, structureGrid, azimuthBins, radialBins } =
      this.slicer.getPolarDopplerGrid(panel);
    const { apexX, apexY, innerRadiusPx, outerRadiusPx, halfAngleRad } = layout;

    const rMinPx = innerRadiusPx + this.dopplerRoi.minDepthNorm * (outerRadiusPx - innerRadiusPx);
    const rMaxPx = innerRadiusPx + this.dopplerRoi.maxDepthNorm * (outerRadiusPx - innerRadiusPx);
    const aMinRad = this.dopplerRoi.minAzimuthDeg * DEG2RAD;
    const aMaxRad = this.dopplerRoi.maxAzimuthDeg * DEG2RAD;
    const nyquist = simState.watchmanStage !== 'none' ? 35.0 : this.dopplerRoi.nyquistCmPerSec;

    const nA = azimuthBins;
    const nR = radialBins;
    const totalBins = nA * nR;
    if (this.smoothedVelGrid.length !== totalBins) {
      this.smoothedVelGrid = new Float32Array(totalBins);
      this.smoothedTurbGrid = new Float32Array(totalBins);
      this.tempGrid = new Float32Array(totalBins);
    }

    // 1. Populate raw normalized velocity [-1.35..+1.35] and turbulence [0..1] in polar space
    const phase = ((simState.cardiacPhase % 1.0) + 1.0) % 1.0;
    const isSystole = phase >= 0.05 && phase < 0.40;
    const isDiastole = !isSystole;
    const sysEnv = isSystole ? Math.max(0.45, Math.sin(((phase - 0.05) / 0.35) * Math.PI)) : 0.0;
    const eWave = Math.exp(-Math.pow((phase - 0.54) / 0.11, 2));
    const aWave = 0.78 * Math.exp(-Math.pow((phase - 0.86) / 0.08, 2));
    const diaEnv = isDiastole ? Math.min(1.0, 0.48 + 0.62 * (eWave + aWave)) : 0.0;
    const pvEnv = 0.55 * sysEnv + 0.85 * Math.max(0.45, eWave) - 0.25 * aWave;

    const landmarks = this.slicer.getLatestLandmarkMap();

    // Helper to convert landmark screen centroid to normalized polar coordinates (normAz in [0,1], normR in [0,1])
    const getLandmarkPolar = (sid: number): { az: number; r: number; present: boolean } => {
      const st = landmarks.get(sid);
      if (!st || st.pixelCount < 8) return { az: 0.5, r: 0.5, present: false };
      const dx = st.centroidX - apexX;
      const dy = st.centroidY - apexY;
      const rPx = Math.hypot(dx, dy);
      const theta = Math.atan2(dx, dy);
      return {
        az: clamp((theta + halfAngleRad) / (2 * halfAngleRad), 0, 1),
        r: clamp((rPx - innerRadiusPx) / Math.max(1, outerRadiusPx - innerRadiusPx), 0, 1),
        present: true,
      };
    };

    const tvAnt = getLandmarkPolar(StructureId.TRICUSPID_VALVE_ANT);
    const tvSept = getLandmarkPolar(StructureId.TRICUSPID_VALVE_SEPT);
    const rvPol = getLandmarkPolar(StructureId.RV_CAVITY);
    const rvotPol = getLandmarkPolar(StructureId.RVOT_INFUNDIBULUM);
    const pvPol = getLandmarkPolar(StructureId.PULMONIC_VALVE);
    const aoPol = getLandmarkPolar(StructureId.ASCENDING_AORTA_ROOT);
    const nccPol = getLandmarkPolar(StructureId.AORTIC_VALVE_NCC);
    const rccPol = getLandmarkPolar(StructureId.AORTIC_VALVE_RCC);
    const mvPol = getLandmarkPolar(StructureId.MITRAL_VALVE_AML_PML);
    const lvPol = getLandmarkPolar(StructureId.LV_CAVITY_AND_IVS);
    const laaPol = getLandmarkPolar(StructureId.LAA_OSTIUM_AND_LOBES);
    const wmPol = getLandmarkPolar(StructureId.WATCHMAN_FLX_DEVICE);
    const foPol = getLandmarkPolar(StructureId.FOSSA_OVALIS);
    const lspvPol = getLandmarkPolar(StructureId.LSPV);
    const lipvPol = getLandmarkPolar(StructureId.LIPV);
    const rspvPol = getLandmarkPolar(StructureId.RSPV);
    const ripvPol = getLandmarkPolar(StructureId.RIPV);

    for (let ia = 0; ia < nA; ia++) {
      const normAz = (ia + 0.5) / nA;
      for (let ir = 0; ir < nR; ir++) {
        const idx = ia * nR + ir;
        const normR = (ir + 0.5) / nR;
        const sid = structureGrid[idx];

        if (sid === StructureId.WATCHMAN_FLX_DEVICE) {
          this.smoothedVelGrid[idx] = 0;
          this.smoothedTurbGrid[idx] = 0;
          continue;
        }

        // Start from slicer's physical polar Doppler velocity
        let vNorm = dopplerGrid[idx] / nyquist;
        let turb = Math.abs(vNorm) > 0.92 ? clamp((Math.abs(vNorm) - 0.85) * 1.6, 0, 1) : 0;

        // Add continuous physiological chamber/orifice flow plumes anchored to visible landmarks
        // (A) Diastolic Tricuspid Inflow (RA -> TV -> RV)
        if (isDiastole && (tvAnt.present || tvSept.present || rvPol.present)) {
          const cAz = tvAnt.present ? tvAnt.az : tvSept.present ? tvSept.az : rvPol.az;
          const cR = tvAnt.present ? tvAnt.r + 0.06 : rvPol.r;
          const dAz = (normAz - cAz) / 0.16;
          const dR = (normR - cR) / 0.18;
          const g = Math.exp(-0.5 * (dAz * dAz + dR * dR));
          if (g > 0.04) {
            vNorm += -0.82 * diaEnv * g;
            turb = Math.max(turb, 0.25 * diaEnv * g);
          }
        }

        // (B) Systolic & Diastolic RVOT / Pulmonic Valve Flow (RVOT -> PV -> PA)
        if (rvotPol.present || pvPol.present) {
          const cAz = pvPol.present ? pvPol.az : rvotPol.az;
          const cR = pvPol.present ? pvPol.r : Math.max(0.16, rvotPol.r);
          const dAz = (normAz - cAz) / 0.16;
          const dR = (normR - cR) / 0.18;
          const g = Math.exp(-0.5 * (dAz * dAz + dR * dR));
          if (g > 0.04) {
            if (isSystole) {
              vNorm += -0.95 * sysEnv * g;
              turb = Math.max(turb, 0.35 * sysEnv * g);
            } else {
              const swirlDir = normAz < cAz ? 0.72 : -0.66;
              vNorm += swirlDir * diaEnv * g;
              turb = Math.max(turb, 0.18 * diaEnv * g);
            }
          }
        }

        // (C) Systolic & Diastolic Aortic Root / Sinuses of Valsalva Flow
        if (aoPol.present || nccPol.present || rccPol.present) {
          const aoAz = aoPol.present ? aoPol.az : nccPol.present ? nccPol.az : rccPol.az;
          const aoR = aoPol.present ? aoPol.r : nccPol.present ? nccPol.r : rccPol.r;
          const dAz = (normAz - aoAz) / 0.14;
          const dR = (normR - aoR) / 0.15;
          const g = Math.exp(-0.5 * (dAz * dAz + dR * dR));
          if (g > 0.04) {
            if (isSystole) {
              vNorm += (normAz < aoAz ? -0.92 : 0.86) * sysEnv * g;
              turb = Math.max(turb, 0.34 * sysEnv * g);
            } else {
              // Diastolic Sinus of Valsalva eddy current (Red/Blue coronary sinus wash)
              const sinusEddy = normAz < aoAz ? 0.78 : -0.74;
              vNorm += sinusEddy * diaEnv * g;
              turb = Math.max(turb, 0.22 * diaEnv * g);
            }
          }
        }

        // (D) Diastolic Transmitral Inflow (LA -> MV -> LV)
        if (isDiastole && (mvPol.present || lvPol.present)) {
          const cAz = mvPol.present ? mvPol.az : lvPol.az;
          const cR = mvPol.present ? mvPol.r + 0.08 : lvPol.r;
          const dAz = (normAz - cAz) / 0.15;
          const dR = (normR - cR) / 0.18;
          const g = Math.exp(-0.5 * (dAz * dAz + dR * dR));
          if (g > 0.04) {
            vNorm += -0.86 * diaEnv * g;
            turb = Math.max(turb, 0.24 * diaEnv * g);
          }
        }

        // (E) Pulmonary Venous Inflow Plumes (LSPV, LIPV, RSPV, RIPV -> LA, Red Toward transducer)
        const pvList = [lspvPol, lipvPol, rspvPol, ripvPol];
        for (let p = 0; p < pvList.length; p++) {
          const pv = pvList[p];
          if (!pv.present) continue;
          const dAz = (normAz - pv.az) / 0.12;
          const dR = (normR - (pv.r - 0.05)) / 0.16;
          const g = Math.exp(-0.5 * (dAz * dAz + dR * dR));
          if (g > 0.04) {
            vNorm += 0.78 * pvEnv * g;
          }
        }

        // (F) LAA Ostial Flow vs Watchman FLX Seal / Peri-Device Leak (PDL)
        if (simState.watchmanStage !== 'none' || laaPol.present || wmPol.present) {
          const cAz = wmPol.present ? clamp(wmPol.az, 0.36, 0.64) : laaPol.present ? clamp(laaPol.az, 0.36, 0.64) : 0.50;
          const cR = wmPol.present ? wmPol.r : laaPol.present ? laaPol.r : 0.34;
          if (simState.watchmanStage === 'none') {
            // Unoccluded LAA ostial phasic emptying (red toward LA in late diastole) & filling (blue in systole)
            const laaPhaseVel = isDiastole ? 0.84 * diaEnv : -0.68 * sysEnv;
            const dAz = (normAz - cAz) / 0.14;
            const dR = (normR - (cR - 0.03)) / 0.15;
            const g = Math.exp(-0.5 * (dAz * dAz + dR * dR));
            if (g > 0.04) {
              vNorm += laaPhaseVel * g;
              turb = Math.max(turb, 0.22 * g);
            }
          } else {
            // Proximal LA blood-flow wash across the Watchman FLX PET fabric face (Red PV inflow -> Blue MV turn)
            // anchored dynamically to the seated Watchman FLX depth while excluding flow inside the LAA dome!
            const capFaceR = clamp(cR - 0.035, 0.24, 0.42);
            const proxCenterR = Math.max(0.14, capFaceR - 0.085);
            const dRedR = (normR - (proxCenterR - 0.015)) / 0.075;
            const dBlueR = (normR - (proxCenterR + 0.015)) / 0.075;
            const dRedAz = (normAz - (cAz - 0.095)) / 0.095;
            const dBlueAz = (normAz - (cAz + 0.095)) / 0.095;
            const gRed = Math.exp(-0.5 * (dRedAz * dRedAz + dRedR * dRedR));
            const gBlue = Math.exp(-0.5 * (dBlueAz * dBlueAz + dBlueR * dBlueR));
            if (normR < capFaceR) {
              vNorm += 1.25 * gRed - 1.18 * gBlue;
              turb = Math.max(turb, 0.26 * Math.max(gRed, gBlue));
            }

            if (simState.watchmanSizeMm <= 20) {
              // Undersized 20mm Watchman FLX -> High-velocity turbulent peri-device leak jet along lateral rim
              const leakAz = cAz - 0.09;
              const dAz = (normAz - leakAz) / 0.055;
              const dR = (normR - (cR - 0.02)) / 0.14;
              const g = Math.exp(-0.5 * (dAz * dAz + dR * dR));
              if (g > 0.03) {
                vNorm = 1.25 * g;
                turb = Math.max(turb, 0.92 * g);
              }
            } else {
              // Properly sized (24/27/31/35mm) Watchman FLX -> Complete flow exclusion inside LAA dome
              if (normR >= capFaceR) {
                vNorm = 0;
                turb = 0;
              }
            }
          }
        }

        // (G) Transseptal Fossa Ovalis Shunt / Tenting Jet
        if (foPol.present && simState.tspTentingMm > 3) {
          const dAz = (normAz - foPol.az) / 0.07;
          const dR = (normR - foPol.r) / 0.11;
          const g = Math.exp(-0.5 * (dAz * dAz + dR * dR));
          if (g > 0.04) {
            vNorm += 0.92 * g;
            turb = Math.max(turb, 0.65 * g);
          }
        }

        this.smoothedVelGrid[idx] = clamp(vNorm, -1.35, 1.35);
        this.smoothedTurbGrid[idx] = clamp(turb, 0, 1);
      }
    }

    // 2. Separable 3x3 polar smoothing pass on smoothedVelGrid so plumes have zero grid blockiness
    for (let ia = 0; ia < nA; ia++) {
      const iaPrev = Math.max(0, ia - 1);
      const iaNext = Math.min(nA - 1, ia + 1);
      for (let ir = 0; ir < nR; ir++) {
        const irPrev = Math.max(0, ir - 1);
        const irNext = Math.min(nR - 1, ir + 1);
        const c = this.smoothedVelGrid[ia * nR + ir] * 0.4;
        const n =
          (this.smoothedVelGrid[iaPrev * nR + ir] +
            this.smoothedVelGrid[iaNext * nR + ir] +
            this.smoothedVelGrid[ia * nR + irPrev] +
            this.smoothedVelGrid[ia * nR + irNext]) *
          0.15;
        this.tempGrid[ia * nR + ir] = c + n;
      }
    }
    this.smoothedVelGrid.set(this.tempGrid);

    // 3. Per-pixel screen-space scan conversion & Tissue-Priority Write Thresholding
    const canvasW = ctx.canvas.width;
    const canvasH = ctx.canvas.height;
    const maxAbsAz = Math.max(Math.abs(aMinRad), Math.abs(aMaxRad));
    const minX = clamp(Math.floor(apexX - rMaxPx * Math.sin(maxAbsAz) - 2), 0, canvasW - 1);
    const maxX = clamp(Math.ceil(apexX + rMaxPx * Math.sin(maxAbsAz) + 2), 0, canvasW - 1);
    const minY = clamp(Math.floor(apexY + rMinPx * Math.cos(maxAbsAz) - 2), 0, canvasH - 1);
    const maxY = clamp(Math.ceil(apexY + rMaxPx + 2), 0, canvasH - 1);
    const boxW = maxX - minX + 1;
    const boxH = maxY - minY + 1;

    if (boxW > 2 && boxH > 2) {
      const roiImg = ctx.getImageData(minX, minY, boxW, boxH);
      const data = roiImg.data;
      const invAngleSpan = 1.0 / Math.max(1e-5, 2.0 * halfAngleRad);
      const invRadialSpan = 1.0 / Math.max(1.0, outerRadiusPx - innerRadiusPx);
      const phaseSeed = Math.floor(phase * 24);

      for (let py = minY; py <= maxY; py++) {
        const dy = py - apexY;
        if (dy < rMinPx * Math.cos(maxAbsAz) - 1 || dy > rMaxPx + 1) continue;
        const rowOffset = (py - minY) * boxW;

        for (let px = minX; px <= maxX; px++) {
          const dx = px - apexX;
          const rPx = Math.hypot(dx, dy);
          if (rPx < rMinPx || rPx > rMaxPx) continue;

          const theta = Math.atan2(dx, dy);
          if (theta < aMinRad || theta > aMaxRad) continue;

          const pIdx = (rowOffset + (px - minX)) * 4;
          const r0 = data[pIdx];
          const g0 = data[pIdx + 1];
          const b0 = data[pIdx + 2];

          // Tissue-Priority Write Thresholding (`[SPEC PATCH #7]`):
          // Suppress Color Doppler over bright myocardial walls, valve leaflets, and metallic struts
          const bModeLuma = (0.299 * r0 + 0.587 * g0 + 0.114 * b0) / 255.0;
          if (bModeLuma > 0.45) continue;
          const tissueGate = 1.0 - smoothstep(0.22, 0.45, bModeLuma);

          // Bilinear interpolation in polar (ua, ur) space
          const ua = clamp((theta + halfAngleRad) * invAngleSpan * (nA - 1), 0, nA - 1.001);
          const ur = clamp((rPx - innerRadiusPx) * invRadialSpan * (nR - 1), 0, nR - 1.001);
          const ia0 = Math.floor(ua);
          const ir0 = Math.floor(ur);
          const fa = ua - ia0;
          const fr = ur - ir0;

          const i00 = ia0 * nR + ir0;
          const i10 = (ia0 + 1) * nR + ir0;
          const i01 = i00 + 1;
          const i11 = i10 + 1;

          const vInterp =
            this.smoothedVelGrid[i00] * (1 - fa) * (1 - fr) +
            this.smoothedVelGrid[i10] * fa * (1 - fr) +
            this.smoothedVelGrid[i01] * (1 - fa) * fr +
            this.smoothedVelGrid[i11] * fa * fr;

          const turbInterp =
            this.smoothedTurbGrid[i00] * (1 - fa) * (1 - fr) +
            this.smoothedTurbGrid[i10] * fa * (1 - fr) +
            this.smoothedTurbGrid[i01] * (1 - fa) * fr +
            this.smoothedTurbGrid[i11] * fa * fr;

          // Subtle polar acoustic packet speckle modulation
          const packetNoise =
            0.84 + 0.24 * (hash2D(Math.floor(ua * 2.4), Math.floor(ur * 2.2) + phaseSeed) - 0.5);
          const v = vInterp * packetNoise;
          const absV = Math.abs(v);
          if (absV < 0.11) continue;

          // Clinical BART Color Map (Red/Orange/Yellow Toward, Blue/Cyan Away, Green/Yellow Variance)
          let dopR = 0;
          let dopG = 0;
          let dopB = 0;
          const tNorm = clamp((absV - 0.11) / 0.89, 0, 1);

          if (v > 0) {
            // Toward transducer: Dark Red (#580808) -> Crimson (#DC2626) -> Orange (#F97316) -> Yellow (#FEF08A)
            if (tNorm < 0.45) {
              const u = tNorm / 0.45;
              dopR = 88 + u * 132;
              dopG = 8 + u * 30;
              dopB = 8 + u * 16;
            } else if (tNorm < 0.82) {
              const u = (tNorm - 0.45) / 0.37;
              dopR = 220 + u * 34;
              dopG = 38 + u * 118;
              dopB = 24 - u * 12;
            } else {
              const u = (tNorm - 0.82) / 0.18;
              dopR = 254;
              dopG = 156 + u * 88;
              dopB = 12 + u * 126;
            }
          } else {
            // Away from transducer: Deep Navy (#0B2265) -> Royal Blue (#2563EB) -> Cyan (#06B6D4) -> Pale Cyan (#A5F3FC)
            if (tNorm < 0.45) {
              const u = tNorm / 0.45;
              dopR = 11 + u * 26;
              dopG = 34 + u * 65;
              dopB = 101 + u * 134;
            } else if (tNorm < 0.82) {
              const u = (tNorm - 0.45) / 0.37;
              dopR = 37 - u * 31;
              dopG = 99 + u * 95;
              dopB = 235 - u * 20;
            } else {
              const u = (tNorm - 0.82) / 0.18;
              dopR = 6 + u * 159;
              dopG = 194 + u * 49;
              dopB = 215 + u * 37;
            }
          }

          // Blend emerald/yellow variance mosaic in high-turbulence aliasing cores
          if (turbInterp > 0.28 || absV > 1.04) {
            const varMix = clamp((turbInterp - 0.22) * 1.15, 0, 0.78);
            const mosaic = hash2D(px >> 1, (py >> 1) + phaseSeed);
            const varR = mosaic > 0.5 ? 52 : 250;
            const varG = mosaic > 0.5 ? 211 : 224;
            const varB = mosaic > 0.5 ? 153 : 71;
            dopR = dopR * (1 - varMix) + varR * varMix;
            dopG = dopG * (1 - varMix) + varG * varMix;
            dopB = dopB * (1 - varMix) + varB * varMix;
          }

          // Soft polar ROI boundary feather
          const rFeather =
            smoothstep(rMinPx, rMinPx + 8, rPx) * (1.0 - smoothstep(rMaxPx - 8, rMaxPx, rPx));
          const aFeather =
            smoothstep(aMinRad, aMinRad + 0.04, theta) *
            (1.0 - smoothstep(aMaxRad - 0.04, aMaxRad, theta));
          const velAlpha = smoothstep(0.11, 0.34, absV);
          const alpha = clamp(velAlpha * tissueGate * rFeather * aFeather * 0.86, 0, 0.88);

          data[pIdx] = Math.round(r0 * (1 - alpha) + dopR * alpha);
          data[pIdx + 1] = Math.round(g0 * (1 - alpha) + dopG * alpha);
          data[pIdx + 2] = Math.round(b0 * (1 - alpha) + dopB * alpha);
        }
      }

      ctx.putImageData(roiImg, minX, minY);
    }

    // 4. Draw crisp clinical dashed cyan/white Color Doppler ROI sector guide
    ctx.save();
    ctx.strokeStyle = 'rgba(125, 211, 252, 0.58)';
    ctx.lineWidth = 1.0;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(apexX, apexY, rMinPx, Math.PI * 0.5 - aMaxRad, Math.PI * 0.5 - aMinRad);
    ctx.arc(apexX, apexY, rMaxPx, Math.PI * 0.5 - aMinRad, Math.PI * 0.5 - aMaxRad, true);
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  /**
   * Renders the clinical Right-Margin 256-Step Grayscale Compression Bar (`[SPEC PATCH #3 & #10]`),
   * matching `12_ehra_3d_ice_xplane_enface_laa.png`.
   */
  private renderGrayscaleCompressionBar(
    ctx: CanvasRenderingContext2D,
    canvasW: number,
    _canvasH: number,
    settings: UltrasoundSettings
  ): void {
    const barW = 7;
    const barH = 92;
    const barX = canvasW - 15;
    const barY = 74;

    ctx.save();
    const grad = ctx.createLinearGradient(0, barY, 0, barY + barH);
    grad.addColorStop(0.0, '#F8FAFC');
    grad.addColorStop(0.25, '#CBD5E1');
    grad.addColorStop(0.55, '#64748B');
    grad.addColorStop(0.82, '#1E293B');
    grad.addColorStop(1.0, '#030508');

    ctx.fillStyle = grad;
    ctx.fillRect(barX, barY, barW, barH);
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.32)';
    ctx.lineWidth = 0.8;
    ctx.strokeRect(barX, barY, barW, barH);

    ctx.font = '600 8.5px "JetBrains Mono", "SF Mono", monospace';
    ctx.fillStyle = 'rgba(203, 213, 225, 0.72)';
    ctx.textAlign = 'right';
    ctx.fillText('M4', barX - 3, barY + 7);
    ctx.fillStyle = 'rgba(148, 163, 184, 0.65)';
    ctx.fillText(`${Math.round(settings.dynamicRangeDb)}dB`, barX - 3, barY + barH);
    ctx.restore();
  }

  /**
   * Renders the clinical BART Color Doppler Velocity Scale Bar (+Nyquist Red/Yellow to -Nyquist Blue/Cyan).
   */
  private renderBartColorScaleBar(
    ctx: CanvasRenderingContext2D,
    canvasW: number,
    canvasH: number,
    simState: ProceduralSimulationState
  ): void {
    const barW = 8;
    const barH = 88;
    const barX = canvasW - 16;
    const barY = 184;
    const nyquist = simState.watchmanStage !== 'none' ? 35 : this.dopplerRoi.nyquistCmPerSec;

    ctx.save();
    const grad = ctx.createLinearGradient(0, barY, 0, barY + barH);
    grad.addColorStop(0.0, '#FEF08A');
    grad.addColorStop(0.22, '#EF4444');
    grad.addColorStop(0.46, '#450A0A');
    grad.addColorStop(0.5, '#030508');
    grad.addColorStop(0.54, '#082F49');
    grad.addColorStop(0.78, '#0284C7');
    grad.addColorStop(1.0, '#67E8F9');

    ctx.fillStyle = grad;
    ctx.fillRect(barX, barY, barW, barH);
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.42)';
    ctx.lineWidth = 0.8;
    ctx.strokeRect(barX, barY, barW, barH);

    ctx.font = '600 9px "JetBrains Mono", "SF Mono", monospace';
    ctx.fillStyle = '#FEF08A';
    ctx.textAlign = 'right';
    ctx.fillText(`+${nyquist}`, barX - 4, barY + 8);
    ctx.fillStyle = 'rgba(148, 163, 184, 0.75)';
    ctx.fillText('cm/s', barX - 4, barY + barH * 0.5 + 3);
    ctx.fillStyle = '#38BDF8';
    ctx.fillText(`-${nyquist}`, barX - 4, barY + barH - 1);

    // Watchman Seal Status Badge pinned cleanly at bottom-right above ECG strip
    if (simState.watchmanStage === 'full_deployed' || simState.watchmanStage === 'released') {
      const isUndersized = simState.watchmanSizeMm === 20;
      const badgeText = isUndersized ? 'PDL JET: 5.2 mm (FAIL)' : 'DOPPLER SEAL: 0.0 mm (PASS)';
      const tw = ctx.measureText(badgeText).width + 14;
      const badgeX = canvasW - tw - 12;
      const badgeY = canvasH - 64;
      ctx.fillStyle = isUndersized ? 'rgba(127, 29, 29, 0.92)' : 'rgba(6, 78, 59, 0.92)';
      ctx.strokeStyle = isUndersized ? '#EF4444' : '#10B981';
      ctx.fillRect(badgeX, badgeY, tw, 20);
      ctx.strokeRect(badgeX, badgeY, tw, 20);
      ctx.fillStyle = isUndersized ? '#FCA5A5' : '#6EE7B7';
      ctx.textAlign = 'left';
      ctx.fillText(badgeText, badgeX + 7, badgeY + 14);
    }

    ctx.restore();
  }

  /**
   * Renders the Unframed Clinical Sector Stage (`[SPEC PATCH #3, #6 & #10]`):
   *   - ZERO solid Amber/Cyan vector border lines or arc rings around the 2D ultrasound fan.
   *   - Clinical chartreuse-yellow `V` orientation marker at `r ≈ 12 mm` outside the upper sector apex.
   *   - Biplane (`xPlane`) white dashed cut-line down the primary sector with a bottom cyan (`#38BDF8`)
   *     triangle caret and tiny yellow apex dot, plus a 22px circular omniplane angle dial icon above each pane.
   *   - Subtle, muted (`9px`) anatomical orientation tags placed cleanly at the outer margins.
   */
  private renderSectorBordersAndCompass(
    ctx: CanvasRenderingContext2D,
    layout: SectorGeometryLayout,
    pose: CatheterPose3D,
    settings: UltrasoundSettings,
    catheterState: CatheterState,
    isSecondaryBiplane: boolean
  ): void {
    const { apexX, apexY, innerRadiusPx, outerRadiusPx, halfAngleRad, latAxis } = layout;
    const markerOnRight = settings.markerSide !== 'left';

    ctx.save();

    // 1. Subtle split-screen divider on secondary panel left boundary
    if (isSecondaryBiplane && layout.panelLeftPx > 0) {
      ctx.strokeStyle = 'rgba(30, 41, 59, 0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(layout.panelLeftPx + 0.5, 64);
      ctx.lineTo(layout.panelLeftPx + 0.5, layout.panelHeightPx - 42);
      ctx.stroke();
    }

    // 2. Clinical Chartreuse-Yellow `V` Orientation Marker near the upper sector apex (`[SPEC PATCH #3 & #10]`)
    const markerSign = markerOnRight ? 1 : -1;
    const vRadiusPx = innerRadiusPx + 14;
    const vx = apexX + markerSign * (vRadiusPx * Math.sin(halfAngleRad) + 11);
    const vy = apexY + vRadiusPx * Math.cos(halfAngleRad) - 2;

    ctx.font = '800 11.5px "Inter", -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.92)';
    ctx.lineWidth = 2.4;
    ctx.strokeText('V', vx, vy);
    ctx.fillStyle = '#D4E157';
    ctx.fillText('V', vx, vy);
    ctx.textBaseline = 'alphabetic';

    // 3. Biplane (`xPlane`) White Dashed Cut-Line + Cyan Bottom Triangle Caret (`[SPEC PATCH #6]`)
    if (catheterState.biplaneEnabled) {
      if (!isSecondaryBiplane) {
        const tiltRad = this.slicer.getBiplaneTiltDeg() * DEG2RAD;
        const sinT = Math.sin(tiltRad);
        const cosT = Math.cos(tiltRad);
        const xStart = apexX + innerRadiusPx * sinT;
        const yStart = apexY + innerRadiusPx * cosT;
        const xEnd = apexX + outerRadiusPx * sinT;
        const yEnd = apexY + outerRadiusPx * cosT;

        ctx.strokeStyle = 'rgba(248, 250, 252, 0.68)';
        ctx.lineWidth = 1.0;
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        ctx.moveTo(xStart, yStart);
        ctx.lineTo(xEnd, yEnd);
        ctx.stroke();
        ctx.setLineDash([]);

        // Tiny yellow apex reference dot at top of cut-line
        ctx.fillStyle = '#FACC15';
        ctx.beginPath();
        ctx.arc(xStart, yStart, 2.2, 0, Math.PI * 2);
        ctx.fill();

        // Small cyan (#38BDF8) triangle caret at the distal bottom end of the cut-line (matching Plate 12)
        const caretTipX = xEnd + sinT * 2;
        const caretTipY = yEnd + cosT * 2;
        const perpX = cosT;
        const perpY = -sinT;
        ctx.fillStyle = '#38BDF8';
        ctx.beginPath();
        ctx.moveTo(caretTipX, caretTipY);
        ctx.lineTo(caretTipX + sinT * 6 + perpX * 4, caretTipY + cosT * 6 + perpY * 4);
        ctx.lineTo(caretTipX + sinT * 6 - perpX * 4, caretTipY + cosT * 6 - perpY * 4);
        ctx.closePath();
        ctx.fill();
      }

      // 22px Circular 2D Omniplane Angle Dial Icon above each sector pane (`0°` / `90°`)
      this.renderOmniplaneDialIcon(
        ctx,
        Math.max(layout.panelLeftPx + 26, apexX - 54),
        Math.max(66, apexY - 8),
        layout.omniDeg,
        isSecondaryBiplane
      );
    }

    // 4. Subtle Outer-Corner Anatomical Orientation Indicators (`9px` muted, zero overlap with sector)
    const latSign = markerOnRight ? 1 : -1;
    const rightWorldVec: [number, number, number] = [
      latAxis[0] * latSign,
      latAxis[1] * latSign,
      latAxis[2] * latSign,
    ];
    const leftWorldVec: [number, number, number] = [
      -latAxis[0] * latSign,
      -latAxis[1] * latSign,
      -latAxis[2] * latSign,
    ];
    const deepWorldVec = pose.faceNormal;

    const rightCompass = vectorToAnatomicalCompassLabel(rightWorldVec);
    const leftCompass = vectorToAnatomicalCompassLabel(leftWorldVec);
    const deepCompass = vectorToAnatomicalCompassLabel(deepWorldVec);

    ctx.font = '500 9px "JetBrains Mono", "SF Mono", monospace';
    ctx.fillStyle = 'rgba(148, 163, 184, 0.42)';

    const cornerY = Math.max(74, apexY + 14);
    ctx.textAlign = 'left';
    ctx.fillText(leftCompass, layout.panelLeftPx + 10, cornerY);

    ctx.textAlign = 'right';
    const rightMarginPad = !isSecondaryBiplane && !catheterState.biplaneEnabled ? 28 : 10;
    ctx.fillText(rightCompass, layout.panelLeftPx + layout.panelWidthPx - rightMarginPad, cornerY);

    ctx.textAlign = 'center';
    ctx.fillText(
      deepCompass,
      apexX,
      Math.min(layout.panelHeightPx - 44, apexY + outerRadiusPx + 13)
    );

    ctx.restore();
  }

  /**
   * Draws a 22px circular clinical omniplane angle dial icon (`[SPEC PATCH #6]`)
   * indicating the active electronic cut-plane angle (`0°` primary vs `90°` orthogonal xPlane).
   */
  private renderOmniplaneDialIcon(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    angleDeg: number,
    isSecondary: boolean
  ): void {
    const r = 10;
    ctx.save();
    ctx.fillStyle = 'rgba(7, 11, 18, 0.78)';
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.48)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Inner acoustic dome arc
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.28)';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.65, Math.PI, 0, false);
    ctx.stroke();

    // Cut-plane diameter line at `angleDeg`
    const rad = angleDeg * DEG2RAD;
    const dx = Math.cos(rad) * (r - 2);
    const dy = -Math.sin(rad) * (r - 2);
    ctx.strokeStyle = isSecondary ? '#38BDF8' : '#E2E8F0';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - dx, cy - dy);
    ctx.lineTo(cx + dx, cy + dy);
    ctx.stroke();

    // Cyan orientation tip dot on cut-plane needle
    ctx.fillStyle = '#38BDF8';
    ctx.beginPath();
    ctx.arc(cx + dx, cy + dy, 1.8, 0, Math.PI * 2);
    ctx.fill();

    // Angle readout next to dial
    ctx.font = '600 9.5px "JetBrains Mono", "SF Mono", monospace';
    ctx.fillStyle = '#CBD5E1';
    ctx.textAlign = 'left';
    ctx.fillText(`${Math.round(angleDeg)}°`, cx + r + 5, cy + 3);
    ctx.restore();
  }

  /**
   * Renders the unframed header for NuVision 4D Volumetric En-Face ("Surgeon's View") Mode (`[SPEC PATCH #12]`).
   * Purges the hard `#F59E0B` orange circle border so the 3D ultrasound volume slab floats organically.
   */
  private render4dEnFaceBorderAndHeader(
    ctx: CanvasRenderingContext2D,
    layout: SectorGeometryLayout,
    simState: ProceduralSimulationState
  ): void {
    const cx = layout.panelLeftPx + Math.round(layout.panelWidthPx * 0.5);
    const cy = Math.round(layout.apexY + (layout.panelHeightPx - layout.apexY - 48) * 0.48);
    const radiusPx = Math.min(
      Math.floor(layout.panelWidthPx * 0.42),
      Math.floor((layout.panelHeightPx - layout.apexY - 56) * 0.46)
    );

    ctx.save();
    if (layout.panelLeftPx > 0) {
      ctx.strokeStyle = 'rgba(30, 41, 59, 0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(layout.panelLeftPx + 0.5, 64);
      ctx.lineTo(layout.panelLeftPx + 0.5, layout.panelHeightPx - 42);
      ctx.stroke();
    }

    ctx.font = '600 10px "JetBrains Mono", "SF Mono", monospace';
    ctx.fillStyle = '#D4B872';
    ctx.textAlign = 'center';
    ctx.fillText('4D EN-FACE VOLUME', cx, Math.max(70, layout.apexY - 6));

    ctx.font = '500 9px "JetBrains Mono", "SF Mono", monospace';
    ctx.fillStyle = 'rgba(148, 163, 184, 0.58)';
    const subLabel =
      simState.watchmanStage !== 'none'
        ? `LAA & WATCHMAN FLX (${simState.watchmanSizeMm}mm)`
        : '3D PYRAMIDAL RENDER';
    ctx.fillText(subLabel, cx, Math.min(layout.panelHeightPx - 46, cy + radiusPx + 14));
    ctx.restore();
  }

  /**
   * Renders Centimeter Depth Scale Ticks (1 cm major `4.5px`, 0.5 cm minor `2.5px`) and the
   * Draggable Chartreuse-Yellow Focal-Zone Caret (`▸`, `#D4E157`) directly along the angled
   * left radial edge of the 90° sector cone (`[SPEC PATCH #3 & #10]`).
   */
  private renderDepthScaleAndFocalCaret(
    ctx: CanvasRenderingContext2D,
    layout: SectorGeometryLayout,
    settings: UltrasoundSettings,
    isSecondary: boolean
  ): void {
    const { apexX, apexY, innerRadiusPx, outerRadiusPx, halfAngleRad, depthMm } = layout;
    const maxCm = Math.round(depthMm / 10);

    // Left radial edge tangent (tx, ty) and outward normal (nx, ny) pointing upper-left
    const sinA = Math.sin(halfAngleRad);
    const cosA = Math.cos(halfAngleRad);
    const tx = -sinA;
    const ty = cosA;
    const nx = -cosA;
    const ny = -sinA;

    ctx.save();
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.62)';
    ctx.fillStyle = 'rgba(226, 232, 240, 0.76)';
    ctx.font = '500 9px "JetBrains Mono", "SF Mono", monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    for (let cm = 1; cm <= maxCm; cm += 0.5) {
      const rMm = cm * 10;
      const normR = (rMm - 3.0) / Math.max(1, depthMm - 3.0);
      if (normR < 0 || normR > 1.01) continue;

      const rPx = innerRadiusPx + normR * (outerRadiusPx - innerRadiusPx);
      const ex = apexX + rPx * tx;
      const ey = apexY + rPx * ty;
      const isMajor = Number.isInteger(cm);
      const tickLen = isMajor ? 4.5 : 2.5;

      ctx.lineWidth = isMajor ? 1.15 : 0.85;
      ctx.beginPath();
      ctx.moveTo(ex + nx * 0.5, ey + ny * 0.5);
      ctx.lineTo(ex + nx * (tickLen + 0.5), ey + ny * (tickLen + 0.5));
      ctx.stroke();

      if (!isSecondary && isMajor && (cm % 2 === 0 || cm === maxCm)) {
        const lx = ex + nx * 8.5;
        const ly = ey + ny * 8.5;
        if (lx > layout.panelLeftPx + 14) {
          ctx.fillText(`${cm}`, lx, ly);
        }
      }
    }

    // Chartreuse-Yellow Triangular Focal-Zone Caret (`▸`, `#D4E157` / `#FACC15`) on left radial edge
    if (!isSecondary) {
      const focusMm = clamp(settings.focusCm * 10, 10, depthMm - 5);
      const focusNorm = (focusMm - 3.0) / Math.max(1, depthMm - 3.0);
      const rFocus = innerRadiusPx + focusNorm * (outerRadiusPx - innerRadiusPx);
      const fx = apexX + rFocus * tx;
      const fy = apexY + rFocus * ty;

      ctx.fillStyle = '#D4E157';
      ctx.strokeStyle = '#030508';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      // Caret apex points inward toward the sector's left radial edge
      ctx.moveTo(fx + nx * 1.2, fy + ny * 1.2);
      ctx.lineTo(fx + nx * 8.5 + tx * 4.2, fy + ny * 8.5 + ty * 4.2);
      ctx.lineTo(fx + nx * 8.5 - tx * 4.2, fy + ny * 8.5 - ty * 4.2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

  /**
   * Renders EHRA / *Circulation* Direct-in-Lumen & Short-Arrow Clinical Typography (`[SPEC PATCH #8 & #11]`):
   *   - ZERO dotted colored structure contour circles (`drawStructureContourDots` completely purged).
   *   - ZERO rectangular pill boxes (`fillRect` / `strokeRect`) or long margin leader lines.
   *   - Category A ('lumen'): Bold white sans-serif (`700 12.5px Inter, Helvetica, sans-serif`) with a
   *     `2.5px` `#000000` halo stroke placed directly inside the dark blood lumen.
   *   - Category B ('arrow'): Clean white text (`600 11.5px Inter, Helvetica, sans-serif`) offset by
   *     `24–36px` into open space with a short, crisp `1.4px` straight white arrow (`→` with `5px` arrowhead)
   *     pointing directly to the bright tissue/device interface.
   *   - 2D force-directed repulsion pass ensuring zero overlapping labels and strict pane clamping.
   */
  private renderAnatomicalLabelsAndContours(
    ctx: CanvasRenderingContext2D,
    layout: SectorGeometryLayout,
    settings: UltrasoundSettings,
    cath?: CatheterState
  ): void {
    const mode = settings.labelOverlayMode;
    const landmarks = this.slicer.getLatestLandmarkMap();
    const highlightSid = this.hoveredHit?.structureId ?? this.externalHighlightStructureId;

    if (mode === 'off' && !highlightSid) return;

    // In 'hover' mode with nothing hovered/highlighted, keep the B-mode sector 100% unannotated
    if (mode !== 'all' && !highlightSid) return;

    const panelMinX = layout.panelLeftPx + 22;
    const panelMaxX =
      layout.panelLeftPx +
      layout.panelWidthPx -
      (settings.colorDopplerEnabled && !this.slicer.getSectorGeometry('secondary') ? 46 : 26);
    const panelMinY = Math.max(76, layout.apexY + layout.innerRadiusPx + 12);
    const panelMaxY = Math.min(
      layout.panelHeightPx - 48,
      layout.apexY + layout.outerRadiusPx - 10
    );

    interface ActiveLabelNode {
      sid: number;
      text: string;
      category: 'lumen' | 'arrow';
      x: number;
      y: number;
      anchorX: number;
      anchorY: number;
      width: number;
      height: number;
      isHighlighted: boolean;
    }

    const candidates: { sid: number; stat: SectorLandmarkStats; spec: ClinicalLabelSpec }[] = [];

    if (mode !== 'all') {
      // Hover-only mode: render only the hovered/highlighted structure
      if (highlightSid) {
        const stat = landmarks.get(highlightSid);
        const meta = ANATOMICAL_STRUCTURES[highlightSid];
        if (stat && meta && stat.contourPoints.length > 0) {
          const spec = EHRA_CLINICAL_LABELS[highlightSid] ?? {
            text: meta.shortLabel,
            category: 'arrow',
            priority: 10,
          };
          candidates.push({ sid: highlightSid, stat, spec });
        }
      }
    } else {
      // 'all' mode: filter to structures with >= 24 visible on-slice pixels (`[SPEC PATCH #8]`)
      const isLaStation = cath?.station === 'la_transseptal';
      const activeViewObj =
        this.activeView && (!this.activeViewId || this.activeView.id === this.activeViewId)
          ? this.activeView
          : undefined;
      const expectedSet = activeViewObj ? new Set<number>(activeViewObj.expectedStructureIds) : null;

      const rawEntries = Array.from(landmarks.entries()).filter(([sid, st]) => {
        if (sid <= 0 || st.pixelCount < 24 || st.contourPoints.length === 0) return false;
        if (
          sid === StructureId.PERICARDIAL_SPACE &&
          expectedSet &&
          !expectedSet.has(StructureId.PERICARDIAL_SPACE)
        ) {
          return false;
        }
        if (st.centroidX < layout.panelLeftPx || st.centroidX > layout.panelLeftPx + layout.panelWidthPx) {
          return false;
        }
        return true;
      });

      rawEntries.sort((a, b) => {
        const specA = EHRA_CLINICAL_LABELS[a[0]];
        const specB = EHRA_CLINICAL_LABELS[b[0]];
        let priA = specA ? specA.priority : 5;
        let priB = specB ? specB.priority : 5;
        if (expectedSet) {
          if (expectedSet.has(a[0])) priA += 50;
          if (expectedSet.has(b[0])) priB += 50;
        }
        if (a[0] >= 40) priA += 55;
        if (b[0] >= 40) priB += 55;
        if (isLaStation) {
          if (
            a[0] === StructureId.LAA_OSTIUM_AND_LOBES ||
            a[0] === StructureId.COUMADIN_RIDGE ||
            a[0] === StructureId.LA_CAVITY ||
            a[0] === StructureId.MITRAL_VALVE_AML_PML ||
            a[0] === StructureId.LSPV ||
            a[0] === StructureId.LIPV
          ) {
            priA += 5;
          }
          if (
            b[0] === StructureId.LAA_OSTIUM_AND_LOBES ||
            b[0] === StructureId.COUMADIN_RIDGE ||
            b[0] === StructureId.LA_CAVITY ||
            b[0] === StructureId.MITRAL_VALVE_AML_PML ||
            b[0] === StructureId.LSPV ||
            b[0] === StructureId.LIPV
          ) {
            priB += 5;
          }
        }
        if (priA !== priB) return priB - priA;
        return b[1].pixelCount - a[1].pixelCount;
      });

      // Deduplicate display strings (e.g., multiple TV leaflets -> single 'TV' label) and cap at 7 clean labels
      const seenTexts = new Set<string>();
      for (const [sid, stat] of rawEntries) {
        const meta = ANATOMICAL_STRUCTURES[sid];
        if (!meta) continue;
        let spec = EHRA_CLINICAL_LABELS[sid] ?? {
          text: meta.shortLabel,
          category: 'arrow',
          priority: 6,
        };
        if (
          this.activeViewId === 'zf_02' &&
          (sid === StructureId.AORTIC_VALVE_RCC ||
            sid === StructureId.AORTIC_VALVE_NCC ||
            sid === StructureId.AORTIC_VALVE_LCC)
        ) {
          spec = { text: 'AoV', category: 'arrow', priority: spec.priority };
        }
        if (seenTexts.has(spec.text)) continue;
        seenTexts.add(spec.text);
        candidates.push({ sid, stat, spec });
        if (candidates.length >= 7) break;
      }
    }

    if (candidates.length === 0) return;

    ctx.save();

    const nodes: ActiveLabelNode[] = [];
    for (let i = 0; i < candidates.length; i++) {
      const { sid, stat, spec } = candidates[i];
      const isHighlighted = sid === highlightSid;

      ctx.font =
        spec.category === 'lumen'
          ? '700 12.5px "Inter", -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif'
          : '600 11.5px "Inter", -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif';
      const textW = ctx.measureText(spec.text).width;

      if (spec.category === 'lumen') {
        // Category A: Place directly at the interior lumen centroid
        const lx = clamp(stat.centroidX, panelMinX + textW * 0.5, panelMaxX - textW * 0.5);
        const ly = clamp(stat.centroidY, panelMinY + 8, panelMaxY - 8);
        nodes.push({
          sid,
          text: spec.text,
          category: 'lumen',
          x: lx,
          y: ly,
          anchorX: stat.centroidX,
          anchorY: stat.centroidY,
          width: textW + 10,
          height: 16,
          isHighlighted,
        });
      } else {
        // Category B: Find closest bright tissue contour point to centroid as the arrow tip anchor
        let tipX = stat.centroidX;
        let tipY = stat.centroidY;
        let bestDistSq = Infinity;
        for (let k = 0; k < stat.contourPoints.length; k++) {
          const [cx, cy] = stat.contourPoints[k];
          const dSq = (cx - stat.centroidX) ** 2 + (cy - stat.centroidY) ** 2;
          if (dSq < bestDistSq) {
            bestDistSq = dSq;
            tipX = cx;
            tipY = cy;
          }
        }

        // Offset label 28px from arrow tip toward open interior / uncluttered angle
        const dirFromApexX = tipX - layout.apexX;
        const dirFromApexY = tipY - (layout.apexY + layout.outerRadiusPx * 0.48);
        const dirLen = Math.hypot(dirFromApexX, dirFromApexY) || 1;
        const offsetDist = 28;
        const initX = clamp(
          tipX + (dirFromApexX / dirLen) * offsetDist,
          panelMinX + textW * 0.5,
          panelMaxX - textW * 0.5
        );
        const initY = clamp(
          tipY + (dirFromApexY / dirLen) * (offsetDist * 0.75),
          panelMinY + 8,
          panelMaxY - 8
        );

        nodes.push({
          sid,
          text: spec.text,
          category: 'arrow',
          x: initX,
          y: initY,
          anchorX: tipX,
          anchorY: tipY,
          width: textW + 12,
          height: 16,
          isHighlighted,
        });
      }
    }

    // 2D Force-Directed Label Repulsion Pass (prevents any label-to-label or label-to-tip overlap)
    const iterations = 28;
    for (let iter = 0; iter < iterations; iter++) {
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];

        // Pairwise bounding-box repulsion
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          const overlapX = (a.width + b.width) * 0.5 + 8 - Math.abs(a.x - b.x);
          const overlapY = (a.height + b.height) * 0.5 + 6 - Math.abs(a.y - b.y);
          if (overlapX > 0 && overlapY > 0) {
            const dx = a.x - b.x || (i % 2 === 0 ? 1 : -1);
            const dy = a.y - b.y || (i < j ? -1 : 1);
            if (overlapX < overlapY) {
              const push = overlapX * 0.35 * Math.sign(dx);
              a.x += push;
              b.x -= push;
            } else {
              const push = overlapY * 0.35 * Math.sign(dy);
              a.y += push;
              b.y -= push;
            }
          }
        }

        if (a.category === 'lumen') {
          // Soft tether to lumen centroid
          a.x += (a.anchorX - a.x) * 0.14;
          a.y += (a.anchorY - a.y) * 0.14;
        } else {
          // Keep Category B short-arrow label within [24px .. 42px] of its tissue tip anchor
          const dx = a.x - a.anchorX;
          const dy = a.y - a.anchorY;
          const dist = Math.hypot(dx, dy) || 1;
          const targetDist = clamp(dist, 24, 40);
          a.x = a.anchorX + (dx / dist) * targetDist;
          a.y = a.anchorY + (dy / dist) * targetDist;
        }

        // Clamp strictly inside sector pane bounds
        const halfW = a.width * 0.5;
        a.x = clamp(a.x, panelMinX + halfW, panelMaxX - halfW);
        a.y = clamp(a.y, panelMinY + 8, panelMaxY - 8);
      }
    }

    // Render Category B short straight white arrows first, then crisp haloed typography
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (n.category === 'arrow') {
        const dx = n.anchorX - n.x;
        const dy = n.anchorY - n.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 10) {
          const ux = dx / dist;
          const uy = dy / dist;
          // Start arrow shaft just outside the text bounding box
          const boxRadius = Math.min(dist - 6, Math.abs(ux) * (n.width * 0.46) + Math.abs(uy) * 8 + 3);
          const startX = n.x + ux * boxRadius;
          const startY = n.y + uy * boxRadius;
          const tipX = n.anchorX;
          const tipY = n.anchorY;

          // Dark halo under arrow shaft + arrowhead
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.92)';
          ctx.lineWidth = 3.2;
          ctx.beginPath();
          ctx.moveTo(startX, startY);
          ctx.lineTo(tipX, tipY);
          ctx.stroke();

          // Crisp 1.4px white arrow shaft
          ctx.strokeStyle = n.isHighlighted ? '#FEF08A' : '#FFFFFF';
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(startX, startY);
          ctx.lineTo(tipX - ux * 2, tipY - uy * 2);
          ctx.stroke();

          // Filled 5.5px white arrowhead pointing directly at tissue landmark
          const headLen = 5.5;
          const headHalfW = 2.8;
          const px = -uy;
          const py = ux;
          ctx.fillStyle = n.isHighlighted ? '#FEF08A' : '#FFFFFF';
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.9)';
          ctx.lineWidth = 1.0;
          ctx.beginPath();
          ctx.moveTo(tipX, tipY);
          ctx.lineTo(tipX - ux * headLen + px * headHalfW, tipY - uy * headLen + py * headHalfW);
          ctx.lineTo(tipX - ux * headLen - px * headHalfW, tipY - uy * headLen - py * headHalfW);
          ctx.closePath();
          ctx.stroke();
          ctx.fill();
        }
      }
    }

    // Render Category A & Category B clinical white typography with 2.5px black halo
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      ctx.font =
        n.category === 'lumen'
          ? '700 12.5px "Inter", -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif'
          : '600 11.5px "Inter", -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif';

      ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
      ctx.shadowBlur = 4;
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2.6;
      ctx.lineJoin = 'round';
      ctx.strokeText(n.text, n.x, n.y);

      ctx.shadowBlur = 0;
      ctx.fillStyle = n.isHighlighted ? '#FEF08A' : '#FFFFFF';
      ctx.fillText(n.text, n.x, n.y);
    }

    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

  /**
   * Renders the 2-Point Digital Caliper Tool (+ ··· +) and quantitative measurement readout box.
   */
  private renderDigitalCalipers(ctx: CanvasRenderingContext2D): void {
    const m = this.caliperMeasurement;
    const p1 = this.slicer.polarToCanvasXY(m.p1Polar.depthMm, m.p1Polar.azimuthDeg, m.p1Polar.panel);
    const p2 = this.slicer.polarToCanvasXY(m.p2Polar.depthMm, m.p2Polar.azimuthDeg, m.p2Polar.panel);
    if (!p1 || !p2) return;

    const [x1, y1] = p1;
    const [x2, y2] = p2;

    ctx.save();
    // Dotted measurement line
    ctx.strokeStyle = '#FACC15';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw clinical [+] crosshairs at P1 and P2
    const drawCrosshair = (x: number, y: number, tag: string) => {
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 3.0;
      ctx.beginPath();
      ctx.moveTo(x - 5, y);
      ctx.lineTo(x + 5, y);
      ctx.moveTo(x, y - 5);
      ctx.lineTo(x, y + 5);
      ctx.stroke();

      ctx.strokeStyle = '#FEF08A';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x - 5, y);
      ctx.lineTo(x + 5, y);
      ctx.moveTo(x, y - 5);
      ctx.lineTo(x, y + 5);
      ctx.stroke();

      ctx.font = '700 9px "JetBrains Mono", "SF Mono", monospace';
      ctx.fillStyle = '#FEF08A';
      ctx.textAlign = 'left';
      ctx.fillText(tag, x + 7, y - 5);
    };

    drawCrosshair(x1, y1, '1');
    drawCrosshair(x2, y2, '2');

    // Clinical console caliper readout at top-left / midpoint
    const midX = (x1 + x2) * 0.5;
    const midY = (y1 + y2) * 0.5 - 16;
    const mainReadout =
      m.compressionPct !== undefined
        ? `+ Dist  ${(m.distanceMm / 10).toFixed(2)} cm (${m.distanceMm.toFixed(1)} mm | ${m.compressionPct.toFixed(0)}%)`
        : `+ Dist  ${(m.distanceMm / 10).toFixed(2)} cm (${m.distanceMm.toFixed(1)} mm)`;

    ctx.font = '700 10.5px "JetBrains Mono", "SF Mono", monospace';
    const wMain = ctx.measureText(mainReadout).width;
    ctx.font = '500 9.5px "JetBrains Mono", "SF Mono", monospace';
    const wSub = ctx.measureText(m.label).width;
    const boxW = Math.max(wMain, wSub) + 16;
    const boxH = 32;
    const bx = Math.max(12, midX - boxW * 0.5);
    const by = Math.max(14, midY - boxH * 0.5);

    ctx.fillStyle = 'rgba(3, 5, 8, 0.88)';
    ctx.strokeStyle = 'rgba(250, 204, 21, 0.65)';
    ctx.lineWidth = 1.0;
    ctx.fillRect(bx, by, boxW, boxH);
    ctx.strokeRect(bx, by, boxW, boxH);

    ctx.font = '500 9px "JetBrains Mono", "SF Mono", monospace';
    ctx.fillStyle = '#CBD5E1';
    ctx.textAlign = 'left';
    ctx.fillText(m.label, bx + 8, by + 12);

    ctx.font = '700 10.5px "JetBrains Mono", "SF Mono", monospace';
    ctx.fillStyle = '#FEF08A';
    ctx.fillText(mainReadout, bx + 8, by + 26);

    ctx.restore();
  }

  /**
   * Renders Corner-Pinned Tabular Telemetry (Top-Left Probe/Acoustic params & Top-Right Omniplane Readout)
   * per `[SPEC PATCH #10]`.
   */
  private renderCornerPinnedTelemetry(
    ctx: CanvasRenderingContext2D,
    canvasW: number,
    _canvasH: number,
    settings: UltrasoundSettings,
    _simState: ProceduralSimulationState,
    catheterState: CatheterState
  ): void {
    ctx.save();
    ctx.font = '600 10.5px "JetBrains Mono", "SF Mono", monospace';
    ctx.textAlign = 'left';

    const probeName =
      catheterState.model === 'nuvision_10f'
        ? 'BW NUVISION 10F 4D MATRIX'
        : catheterState.model === 'soundstar_8f'
          ? 'BW SOUNDSTAR ECO 8F 2D'
          : 'BW SOUNDSTAR 10F 2D';

    // Top-Left Corner Telemetry
    ctx.fillStyle = '#E2E8F0';
    ctx.fillText(probeName, 12, 18);

    ctx.font = '500 10px "JetBrains Mono", "SF Mono", monospace';
    ctx.fillStyle = '#94A3B8';
    ctx.fillText(
      `${settings.frequencyMhz.toFixed(1)} MHz  ·  ${settings.depthCm.toFixed(0)} cm  ·  ${this.slicer.getMeasuredFps()} fps`,
      12,
      32
    );
    ctx.fillText(
      `2D  G ${Math.round(settings.gainDb)} dB  ·  DR ${Math.round(settings.dynamicRangeDb)} dB  ·  MI 0.5`,
      12,
      46
    );

    if (settings.frozen) {
      ctx.fillStyle = '#FACC15';
      ctx.font = '700 10.5px "JetBrains Mono", "SF Mono", monospace';
      ctx.fillText('[FROZEN — CINE LOOP]', 12, 61);
    }

    // Top-Right Corner: Electronic Multiplane Omni-Angle Protractor & Marker Convention
    const rightX = canvasW - 12;
    ctx.textAlign = 'right';
    const isNuVision = catheterState.model === 'nuvision_10f';
    const omniVal = isNuVision ? Math.round(catheterState.omniDeg) : 0;

    this.renderOmniplaneDialIcon(ctx, canvasW - 58, 22, omniVal, false);

    ctx.font = '500 9.5px "JetBrains Mono", "SF Mono", monospace';
    ctx.fillStyle = '#94A3B8';
    const markerLabel = settings.markerSide === 'left' ? 'V: LEFT (ECHO)' : 'V: RIGHT (EP STD)';
    ctx.fillText(markerLabel, rightX, 46);

    if (catheterState.biplaneEnabled || catheterState.volume4dEnabled) {
      ctx.fillStyle = '#38BDF8';
      const modeBadge = catheterState.volume4dEnabled ? '4D EN-FACE' : 'xPLANE 0°/90°';
      ctx.fillText(modeBadge, rightX, 60);
    }

    ctx.restore();
  }

  /**
   * Renders the synchronized #10B981 Emerald-Green Lead II P-QRS-T ECG Waveform Strip
   * along the bottom of the ultrasound stage (`[SPEC PATCH #10]`).
   */
  private renderLeadIIEcgStrip(
    ctx: CanvasRenderingContext2D,
    canvasW: number,
    canvasH: number,
    simState: ProceduralSimulationState,
    frozen: boolean
  ): void {
    const stripH = 34;
    const stripY = canvasH - stripH - 4;
    const leftX = 14;
    const rightX = canvasW - 14;
    const traceW = Math.max(120, rightX - leftX - 135);

    ctx.save();

    ctx.fillStyle = 'rgba(3, 5, 8, 0.85)';
    ctx.fillRect(leftX - 4, stripY, rightX - leftX + 8, stripH);

    const baseY = stripY + Math.round(stripH * 0.64);
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.16)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(leftX, baseY);
    ctx.lineTo(leftX + traceW, baseY);
    ctx.stroke();

    ctx.strokeStyle = '#10B981';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const cyclesShown = 2.2;
    const livePhase = ((simState.cardiacPhase % 1.0) + 1.0) % 1.0;

    for (let ix = 0; ix <= traceW; ix += 2) {
      const u = ix / traceW;
      const samplePhase = (u * cyclesShown) % 1.0;
      const v = evaluateLeadIIEcgWaveform(samplePhase);
      const py = baseY - v * 17.5;
      if (ix === 0) ctx.moveTo(leftX + ix, py);
      else ctx.lineTo(leftX + ix, py);
    }
    ctx.stroke();

    const markerU = (1.0 + livePhase) / cyclesShown;
    const markerX = leftX + markerU * traceW;
    const markerY = baseY - evaluateLeadIIEcgWaveform(livePhase) * 17.5;

    ctx.fillStyle = '#34D399';
    ctx.beginPath();
    ctx.arc(markerX, markerY, 3.5, 0, Math.PI * 2);
    ctx.fill();

    const phaseName =
      livePhase >= 0.05 && livePhase <= 0.38
        ? 'SYSTOLE (QRS-T)'
        : livePhase >= 0.82
          ? 'ATRIAL KICK (P)'
          : 'DIASTOLE (E-FILL)';

    ctx.font = '700 11px "JetBrains Mono", "SF Mono", monospace';
    ctx.fillStyle = '#10B981';
    ctx.textAlign = 'right';
    ctx.fillText(`II  ${Math.round(simState.heartRateBpm)} BPM`, rightX, stripY + 14);

    ctx.font = '500 9.5px "JetBrains Mono", "SF Mono", monospace';
    ctx.fillStyle = frozen ? '#FACC15' : '#94A3B8';
    ctx.fillText(frozen ? 'GATED FREEZE' : phaseName, rightX, stripY + 28);

    ctx.restore();
  }

  /**
   * Renders the Hover-to-Identify clinical tooltip card when hovering over an anatomical structure.
   */
  private renderHoverTooltip(
    ctx: CanvasRenderingContext2D,
    canvasW: number,
    canvasH: number,
    hit: CanvasHitResult
  ): void {
    const meta = hit.meta;
    if (!meta) return;

    ctx.save();
    const title = meta.name;
    const line2 = `Depth: ${(hit.depthMm / 10).toFixed(2)} cm (${hit.depthMm.toFixed(1)} mm)  |  Sector: ${hit.clockPosition}`;
    const line3 = `Z: ${meta.impedanceMRayl.toFixed(2)} MRayl  |  ID #${meta.id} (${meta.code})`;
    const sig =
      meta.clinicalSignificance.length > 74
        ? `${meta.clinicalSignificance.slice(0, 72)}…`
        : meta.clinicalSignificance;

    ctx.font = '700 11px "JetBrains Mono", "SF Mono", monospace';
    const w1 = ctx.measureText(title).width;
    ctx.font = '500 10px "JetBrains Mono", "SF Mono", monospace';
    const w2 = ctx.measureText(line2).width;
    const w3 = ctx.measureText(sig).width;

    const cardW = Math.min(canvasW - 24, Math.max(w1, w2, w3) + 20);
    const cardH = 68;
    let bx = hit.canvasX + 16;
    let by = hit.canvasY - cardH - 10;
    if (bx + cardW > canvasW - 10) bx = Math.max(10, canvasW - cardW - 10);
    if (by < 12) by = Math.min(canvasH - cardH - 44, hit.canvasY + 18);

    ctx.fillStyle = 'rgba(7, 11, 18, 0.94)';
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.45)';
    ctx.lineWidth = 1.1;
    ctx.fillRect(bx, by, cardW, cardH);
    ctx.strokeRect(bx, by, cardW, cardH);

    ctx.font = '700 11px "JetBrains Mono", "SF Mono", monospace';
    ctx.fillStyle = '#F8FAFC';
    ctx.textAlign = 'left';
    ctx.fillText(title, bx + 10, by + 17);

    ctx.font = '500 10px "JetBrains Mono", "SF Mono", monospace';
    ctx.fillStyle = '#E2E8F0';
    ctx.fillText(line2, bx + 10, by + 33);

    ctx.fillStyle = '#94A3B8';
    ctx.fillText(line3, bx + 10, by + 47);

    ctx.fillStyle = '#CBD5E1';
    ctx.fillText(sig, bx + 10, by + 61);

    ctx.restore();
  }
}
