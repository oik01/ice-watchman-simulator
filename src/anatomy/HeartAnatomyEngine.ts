import * as THREE from 'three';
import {
  ANATOMICAL_STRUCTURES,
  AcousticSamplePoint,
  CartosoundContour,
  CatheterPose3D,
  DEFAULT_PROCEDURAL_SIMULATION_STATE,
  HeartAtlasManifest,
  HeartMeshManifestEntry,
  LAAMorphologyId,
  ProceduralSimulationState,
  StructureId,
  StructureLayerCategory,
  UltrasoundSettings,
} from '../types/sharedContracts';

export type HeartDisplayMode = 'cutaway_glass' | 'solid_anatomical' | 'cartosound_shell';

interface DeformableMeshRecord {
  mesh: THREE.Mesh;
  entry: HeartMeshManifestEntry;
  basePositions: Float32Array;
  workingPositions: Float32Array;
}

interface LandmarkPrimitive {
  structureId: StructureId;
  /** Segment endpoints A and B in World mm (for capsule/ellipsoid evaluation) */
  ax: number;
  ay: number;
  az: number;
  bx: number;
  by: number;
  bz: number;
  /** Radii along X, Y, Z or capsule radius (mm) */
  rx: number;
  ry: number;
  rz: number;
  /** If true, represents a hollow shell wall of thickness shellThicknessMm */
  isShell: boolean;
  shellThicknessMm: number;
  impedanceMRayl: number;
  backscatter: number;
  attenuationDbCmMhz: number;
  priority: number;
}

/**
 * 3D & 4D Cardiac Anatomy Engine + Analytical/Volumetric Acoustic Sampler
 *
 * Responsibilities:
 * 1. Loads compiled BodyParts3D binary assets (`heart_atlas.bin`, `heart_manifest.json`, `heart_acoustic_volume.bin`).
 * 2. Renders all cardiac structures using the SPEC PATCH #9 CARTO 3 Surgical Subsurface & Fresnel Rim Palette
 *    with strict renderOrder stratification (2 = valves/internal landmarks, 3 = coronaries/esophagus,
 *    5 = CARTOSOUND contour rings, 10 = semi-transparent chamber walls with depthWrite: false).
 * 3. Builds co-registered parametric 3D meshes for:
 *    - Bilaminar Tentable Fossa Ovalis & Muscular Limbus (`simState.tspTentingMm`)
 *    - 4-Morphology Selectable Left Atrial Appendage (`chicken_wing`, `windsock`, `cactus`, `cauliflower`)
 *      with internal pectinate muscle trabeculations and toggleable LAA Thrombus (`simState.laaThrombusPresent`)
 *    - Coumadin Ridge (Left Lateral Ridge / Q-Tip Sign)
 *    - Collagenous Chordae Tendineae tethers (TV -> RV papillary; MV -> LV AL/PM papillary)
 *    - Retrocardiac Esophagus & Pericardial Effusion Sac (`0 / 50 / 200 mL`)
 *    - CARTOSOUND 3D Electroanatomical Contour Rings (`acquireCartosoundContour`)
 * 4. Animates 4D Physiological Cardiac Cycle Deformation (`updateCardiacCycle`).
 * 5. Evaluates deterministic 3D acoustic properties (`evaluateAcousticPoint`) for both real-time WebGL
 *    ultrasound slicing and Node.js headless 28-view verification.
 */
export class HeartAnatomyEngine {
  public readonly rootGroup: THREE.Group;
  public readonly bodyPartsGroup: THREE.Group;
  public readonly parametricGroup: THREE.Group;
  public readonly cartosoundGroup: THREE.Group;
  public readonly pinsGroup: THREE.Group;

  private manifest: HeartAtlasManifest | null = null;
  private acousticVolumeData: Uint8Array | null = null;
  private deformableMeshes: DeformableMeshRecord[] = [];
  private materialsByCategory = new Map<string, THREE.MeshPhysicalMaterial>();
  private displayMode: HeartDisplayMode = 'cutaway_glass';
  private cutawayPlane: THREE.Plane;
  private cutawayEnabled = true;

  // Parametric dynamic meshes
  private fossaOvalisMesh: THREE.Mesh | null = null;
  private fossaBasePositions: Float32Array | null = null;
  private limbusMesh: THREE.Mesh | null = null;
  private laaGroup: THREE.Group;
  private currentLaaMorphology: LAAMorphologyId | null = null;
  private laaThrombusMesh: THREE.Mesh | null = null;
  private coumadinRidgeMesh: THREE.Mesh | null = null;
  private chordaeLineSegments: THREE.LineSegments | null = null;
  private esophagusMesh: THREE.Mesh | null = null;
  private pericardialSacMesh: THREE.Mesh | null = null;
  private currentEffusionMl: number = -1;
  private highlightedStructureIds = new Set<number>();

  // Pre-built analytical landmark primitives covering all 42 StructureIds
  private readonly landmarkPrimitives: LandmarkPrimitive[];

  constructor(sceneOrParent?: THREE.Object3D) {
    this.rootGroup = new THREE.Group();
    this.rootGroup.name = 'HeartAnatomyRoot';

    this.bodyPartsGroup = new THREE.Group();
    this.bodyPartsGroup.name = 'BodyParts3DAtlasGroup';

    this.parametricGroup = new THREE.Group();
    this.parametricGroup.name = 'ParametricCardiacAugmentations';

    this.cartosoundGroup = new THREE.Group();
    this.cartosoundGroup.name = 'CartosoundContourRings';

    this.pinsGroup = new THREE.Group();
    this.pinsGroup.name = 'AnatomicalLandmarkPins';

    this.laaGroup = new THREE.Group();
    this.laaGroup.name = 'MultiMorphologyLAAGroup';
    this.parametricGroup.add(this.laaGroup);

    this.rootGroup.add(this.bodyPartsGroup);
    this.rootGroup.add(this.parametricGroup);
    this.rootGroup.add(this.cartosoundGroup);
    this.rootGroup.add(this.pinsGroup);

    if (sceneOrParent) {
      sceneOrParent.add(this.rootGroup);
    }

    // Anterior-right surgical window cutaway plane exposing RA/RV/LA interior landmarks clearly
    this.cutawayPlane = new THREE.Plane(new THREE.Vector3(0.32, -0.08, -0.94).normalize(), 11.0);

    this.landmarkPrimitives = this.buildAnalyticalLandmarkPrimitives();
    this.buildParametricAugmentations(DEFAULT_PROCEDURAL_SIMULATION_STATE);
  }

  /**
   * Creates a CARTO 3 Surgical Subsurface & Fresnel Rim physical material per SPEC PATCH #9.
   */
  private createSurgicalFresnelMaterial(
    baseHex: string,
    rimHex: string,
    options: {
      roughness: number;
      metalness?: number;
      opacity?: number;
      transparent?: boolean;
      depthWrite?: boolean;
      side?: THREE.Side;
      emissiveHex?: string;
      emissiveIntensity?: number;
    }
  ): THREE.MeshPhysicalMaterial {
    const isTransparent = options.transparent ?? (options.opacity !== undefined && options.opacity < 0.99);
    const mat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(baseHex),
      emissive: new THREE.Color(options.emissiveHex ?? rimHex),
      emissiveIntensity: options.emissiveIntensity ?? (isTransparent ? 0.14 : 0.08),
      roughness: options.roughness,
      metalness: options.metalness ?? 0.04,
      clearcoat: 0.25,
      clearcoatRoughness: 0.35,
      transparent: isTransparent,
      opacity: options.opacity ?? 1.0,
      depthWrite: options.depthWrite ?? !isTransparent,
      side: options.side ?? THREE.DoubleSide,
    });

    const rimColor = new THREE.Color(rimHex);
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uFresnelRimColor = { value: rimColor };
      shader.uniforms.uFresnelPower = { value: isTransparent ? 2.2 : 3.0 };
      shader.uniforms.uFresnelScale = { value: isTransparent ? 0.42 : 0.24 };

      shader.fragmentShader =
        `uniform vec3 uFresnelRimColor;\nuniform float uFresnelPower;\nuniform float uFresnelScale;\n` +
        shader.fragmentShader;

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        `
        vec3 viewDir = normalize(vViewPosition);
        float ndotv = clamp(abs(dot(normal, viewDir)), 0.0, 1.0);
        float fresnelFactor = pow(1.0 - ndotv, uFresnelPower) * uFresnelScale;
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uFresnelRimColor, clamp(fresnelFactor, 0.0, 0.65));
        #include <dithering_fragment>
        `
      );
    };

    return mat;
  }

  /**
   * Returns or creates the SPEC PATCH #9 material for a given structureId & category.
   */
  private getMaterialForStructure(structureId: number, category: StructureLayerCategory): THREE.MeshPhysicalMaterial {
    const key = `${category}_${structureId}_${this.displayMode}`;
    const existing = this.materialsByCategory.get(key);
    if (existing) {
      return existing;
    }

    const meta = ANATOMICAL_STRUCTURES[structureId] ?? ANATOMICAL_STRUCTURES[StructureId.RA_CAVITY];
    const isChamberWall = meta.renderOrder === 10;
    const isCutawayGlass = this.displayMode === 'cutaway_glass';
    const isCartosoundShell = this.displayMode === 'cartosound_shell';

    let opacity = 1.0;
    let roughness = 0.38;
    let metalness = 0.04;
    let depthWrite = true;

    if (isChamberWall) {
      roughness = category === 'right_heart_chamber' ? 0.42 : 0.38;
      opacity = isCutawayGlass ? 0.14 : isCartosoundShell ? 0.10 : 0.86;
      depthWrite = false;
    } else if (category === 'cardiac_valve') {
      roughness = 0.28;
      metalness = 0.05;
      opacity = 0.96;
      depthWrite = true;
    } else if (structureId === StructureId.FOSSA_OVALIS) {
      roughness = 0.30;
      opacity = 0.88;
      depthWrite = true;
    } else if (structureId === StructureId.IAS_LIMBUS) {
      roughness = 0.38;
      opacity = 0.94;
      depthWrite = true;
    } else if (category === 'conduction_system') {
      roughness = 0.30;
      opacity = 0.95;
      depthWrite = true;
    } else if (category === 'coronary_or_esophagus') {
      roughness = 0.35;
      opacity = 0.92;
      depthWrite = true;
    } else {
      roughness = 0.36;
      opacity = 0.94;
      depthWrite = true;
    }

    const mat = this.createSurgicalFresnelMaterial(meta.surgicalBaseHex, meta.fresnelRimHex, {
      roughness,
      metalness,
      opacity,
      transparent: opacity < 0.99,
      depthWrite,
      side: THREE.DoubleSide,
    });

    if (
      isCutawayGlass &&
      (structureId === StructureId.RA_CAVITY ||
        structureId === StructureId.RAA_PECTINATES ||
        structureId === StructureId.RV_CAVITY)
    ) {
      mat.clippingPlanes = [this.cutawayPlane];
      mat.clipShadows = true;
    }

    this.materialsByCategory.set(key, mat);
    return mat;
  }

  /**
   * Loads `heart_manifest.json`, `heart_atlas.bin`, and `heart_acoustic_volume.bin` via HTTP fetch.
   */
  public async loadAssets(baseUrl = '/models'): Promise<void> {
    const cleanBase = baseUrl.replace(/\/$/, '');
    const [manifestResp, atlasResp, volumeResp] = await Promise.all([
      fetch(`${cleanBase}/heart_manifest.json`),
      fetch(`${cleanBase}/heart_atlas.bin`),
      fetch(`${cleanBase}/heart_acoustic_volume.bin`),
    ]);

    if (!manifestResp.ok || !atlasResp.ok || !volumeResp.ok) {
      throw new Error(
        `Failed to load heart atlas assets: manifest=${manifestResp.status}, atlas=${atlasResp.status}, volume=${volumeResp.status}`
      );
    }

    const [manifest, atlasBuffer, volumeBuffer] = await Promise.all([
      manifestResp.json() as Promise<HeartAtlasManifest>,
      atlasResp.arrayBuffer(),
      volumeResp.arrayBuffer(),
    ]);

    this.loadFromBuffers(atlasBuffer, manifest, new Uint8Array(volumeBuffer));
  }

  /**
   * Synchronously initializes all 3D BodyParts3D meshes and the 128^3 acoustic volume from raw buffers.
   */
  public loadFromBuffers(
    atlasBuffer: ArrayBuffer,
    manifest: HeartAtlasManifest,
    acousticVolumeBytes: Uint8Array
  ): void {
    this.manifest = manifest;
    this.acousticVolumeData = acousticVolumeBytes;

    // Clear existing BodyParts3D meshes if reloading
    while (this.bodyPartsGroup.children.length > 0) {
      this.bodyPartsGroup.remove(this.bodyPartsGroup.children[0]);
    }
    this.deformableMeshes = [];

    const allPositions = new Float32Array(
      atlasBuffer,
      manifest.vertexByteOffset,
      manifest.totalVertices * 3
    );
    const allNormals = new Float32Array(
      atlasBuffer,
      manifest.normalByteOffset,
      manifest.totalVertices * 3
    );
    const allIndices = new Uint32Array(
      atlasBuffer,
      manifest.indexByteOffset,
      manifest.totalTriangles * 3
    );

    for (const entry of manifest.meshes) {
      const vStart = entry.vertexOffset * 3;
      const vLen = entry.vertexCount * 3;
      const basePositions = allPositions.slice(vStart, vStart + vLen);
      const workingPositions = new Float32Array(basePositions);
      const normalsSlice = allNormals.slice(vStart, vStart + vLen);
      const indicesSlice = allIndices.slice(entry.indexOffset, entry.indexOffset + entry.indexCount);

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(workingPositions, 3));
      geometry.setAttribute('normal', new THREE.BufferAttribute(normalsSlice, 3));
      geometry.setIndex(new THREE.BufferAttribute(indicesSlice, 1));

      const material = this.getMaterialForStructure(entry.structureId, entry.category);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = `${entry.id}_${entry.name}`;
      mesh.renderOrder = entry.renderOrder;
      mesh.userData = {
        structureId: entry.structureId,
        fmaId: entry.fmaId,
        name: entry.name,
        category: entry.category,
      };

      this.bodyPartsGroup.add(mesh);
      this.deformableMeshes.push({
        mesh,
        entry,
        basePositions,
        workingPositions,
      });
    }
  }

  /**
   * Builds all co-registered parametric 3D cardiac structures required by the Locked Spec:
   * - Bilaminar Tentable Fossa Ovalis & Muscular Limbus
   * - 4-Morphology Selectable LAA with internal pectinate trabeculations & LAA Thrombus
   * - Coumadin Ridge (Left Lateral Ridge)
   * - Collagenous Chordae Tendineae
   * - Retrocardiac Esophagus
   * - Pericardial Effusion Sac (0 / 50 / 200 mL)
   */
  private buildParametricAugmentations(simState: ProceduralSimulationState): void {
    // 1. Bilaminar Tentable Fossa Ovalis Membrane & Muscular Limbus Horseshoe
    const fossaGeo = new THREE.CircleGeometry(8.5, 36);
    fossaGeo.scale(1.0, 1.18, 1.0); // 17 mm x 20 mm elliptical bilaminar fossa
    const fossaPosAttr = fossaGeo.getAttribute('position') as THREE.BufferAttribute;
    this.fossaBasePositions = new Float32Array(fossaPosAttr.array as Float32Array);

    const fossaMat = this.getMaterialForStructure(StructureId.FOSSA_OVALIS, 'interatrial_septum');
    this.fossaOvalisMesh = new THREE.Mesh(fossaGeo, fossaMat);
    this.fossaOvalisMesh.name = 'Parametric_Fossa_Ovalis_Membrane';
    this.fossaOvalisMesh.position.set(11.5, 4.5, -4.5);
    // Align normal with IAS normal [+0.78, +0.08, -0.62]
    const iasNormal = new THREE.Vector3(0.78, 0.08, -0.62).normalize();
    this.fossaOvalisMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), iasNormal);
    this.fossaOvalisMesh.renderOrder = 2;
    this.fossaOvalisMesh.userData = { structureId: StructureId.FOSSA_OVALIS };
    this.parametricGroup.add(this.fossaOvalisMesh);

    const limbusGeo = new THREE.TorusGeometry(9.2, 2.3, 18, 42, Math.PI * 1.65);
    limbusGeo.scale(1.0, 1.15, 1.0);
    const limbusMat = this.getMaterialForStructure(StructureId.IAS_LIMBUS, 'interatrial_septum');
    this.limbusMesh = new THREE.Mesh(limbusGeo, limbusMat);
    this.limbusMesh.name = 'Parametric_IAS_Muscular_Limbus';
    this.limbusMesh.position.copy(this.fossaOvalisMesh.position);
    this.limbusMesh.quaternion.copy(this.fossaOvalisMesh.quaternion);
    this.limbusMesh.rotateZ(-0.35);
    this.limbusMesh.renderOrder = 2;
    this.limbusMesh.userData = { structureId: StructureId.IAS_LIMBUS };
    this.parametricGroup.add(this.limbusMesh);

    // 2. Coumadin Ridge (Left Lateral Ridge / Bulbous Q-Tip Fold between LAA and LSPV)
    const coumadinCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(44.0, 18.0, -18.0),
      new THREE.Vector3(47.0, 26.0, -15.5),
      new THREE.Vector3(48.5, 32.5, -14.0),
      new THREE.Vector3(46.0, 38.0, -16.5),
    ]);
    const coumadinGeo = new THREE.TubeGeometry(coumadinCurve, 28, 3.4, 16, false);
    const coumadinMat = this.getMaterialForStructure(StructureId.COUMADIN_RIDGE, 'intracardiac_landmark');
    this.coumadinRidgeMesh = new THREE.Mesh(coumadinGeo, coumadinMat);
    this.coumadinRidgeMesh.name = 'Parametric_Coumadin_Ridge';
    this.coumadinRidgeMesh.renderOrder = 2;
    this.coumadinRidgeMesh.userData = { structureId: StructureId.COUMADIN_RIDGE };
    this.parametricGroup.add(this.coumadinRidgeMesh);

    // Bulbous Q-Tip head on the Coumadin Ridge
    const qtipGeo = new THREE.SphereGeometry(4.2, 20, 16);
    qtipGeo.scale(1.15, 0.95, 1.0);
    const qtipMesh = new THREE.Mesh(qtipGeo, coumadinMat);
    qtipMesh.position.set(48.0, 31.0, -14.5);
    qtipMesh.renderOrder = 2;
    qtipMesh.userData = { structureId: StructureId.COUMADIN_RIDGE };
    this.coumadinRidgeMesh.add(qtipMesh);

    // 3. Collagenous Chordae Tendineae Tethers (TV -> RV Papillary; MV -> LV Papillary)
    const chordaePts: number[] = [];
    const addChordaeFan = (
      leafletCenter: [number, number, number],
      papTip: [number, number, number],
      spreadMm: number
    ) => {
      for (let i = -2; i <= 2; i++) {
        const offset = (i / 2) * spreadMm;
        chordaePts.push(
          leafletCenter[0] + offset * 0.4,
          leafletCenter[1] + offset * 0.3,
          leafletCenter[2] - offset * 0.4,
          papTip[0] + offset * 0.15,
          papTip[1],
          papTip[2] + offset * 0.15
        );
      }
    };
    // Tricuspid chordae to RV papillary muscles
    addChordaeFan([22.0, -8.5, 26.5], [42.0, -14.0, 34.0], 5.0);
    addChordaeFan([25.5, -9.5, 17.5], [44.7, -3.6, 29.7], 4.5);
    addChordaeFan([24.0, -14.5, 22.0], [38.0, -18.0, 30.0], 4.5);
    // Mitral chordae to LV AL & PM papillary muscles
    addChordaeFan([44.0, -4.0, -8.0], [72.0, -7.0, -3.0], 6.0);
    addChordaeFan([48.1, -6.1, -12.0], [58.0, -22.0, -18.0], 6.0);

    const chordaeGeo = new THREE.BufferGeometry();
    chordaeGeo.setAttribute('position', new THREE.Float32BufferAttribute(chordaePts, 3));
    const chordaeMat = new THREE.LineBasicMaterial({
      color: 0xdce2ea,
      transparent: true,
      opacity: 0.72,
    });
    this.chordaeLineSegments = new THREE.LineSegments(chordaeGeo, chordaeMat);
    this.chordaeLineSegments.name = 'Parametric_Chordae_Tendineae';
    this.chordaeLineSegments.renderOrder = 2;
    this.parametricGroup.add(this.chordaeLineSegments);

    // 4. Retrocardiac Esophagus
    const esoCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(25.0, 46.0, -45.0),
      new THREE.Vector3(27.5, 22.0, -45.5),
      new THREE.Vector3(28.0, 6.0, -46.0),
      new THREE.Vector3(29.0, -16.0, -44.5),
      new THREE.Vector3(30.0, -42.0, -43.0),
    ]);
    const esoGeo = new THREE.TubeGeometry(esoCurve, 32, 6.2, 16, false);
    esoGeo.scale(1.15, 1.0, 0.62); // Flattened anteroposteriorly
    const esoMat = this.getMaterialForStructure(
      StructureId.RETROCARDIAC_ESOPHAGUS,
      'coronary_or_esophagus'
    );
    this.esophagusMesh = new THREE.Mesh(esoGeo, esoMat);
    this.esophagusMesh.name = 'Parametric_Retrocardiac_Esophagus';
    this.esophagusMesh.renderOrder = 3;
    this.esophagusMesh.userData = { structureId: StructureId.RETROCARDIAC_ESOPHAGUS };
    this.parametricGroup.add(this.esophagusMesh);

    // 5. Build initial 4-morphology LAA + Thrombus and Pericardial Effusion Sac
    this.rebuildLAAMorphology(simState.laaMorphology, simState.laaThrombusPresent);
    this.rebuildPericardialSac(simState.pericardialEffusionMl);
  }

  /**
   * Builds or updates the 4-Morphology Selectable Left Atrial Appendage (`chicken_wing`, `windsock`, `cactus`, `cauliflower`)
   * with internal comb-like pectinate trabeculation rings and optional distal LAA Thrombus.
   */
  public rebuildLAAMorphology(morphology: LAAMorphologyId, thrombusPresent: boolean): void {
    if (this.currentLaaMorphology === morphology) {
      if (this.laaThrombusMesh) {
        this.laaThrombusMesh.visible = thrombusPresent;
      }
      return;
    }
    this.currentLaaMorphology = morphology;

    while (this.laaGroup.children.length > 0) {
      this.laaGroup.remove(this.laaGroup.children[0]);
    }

    const laaWallMat = this.getMaterialForStructure(
      StructureId.LAA_OSTIUM_AND_LOBES,
      'left_heart_chamber'
    );
    const pectinateMat = this.getMaterialForStructure(
      StructureId.COUMADIN_RIDGE,
      'intracardiac_landmark'
    );

    // Ostium at [+45, +26, -4], Landing Zone at [+52, +29, +1]
    let mainCurvePts: THREE.Vector3[];
    const secondaryLobes: { center: [number, number, number]; scale: [number, number, number] }[] = [];

    if (morphology === 'chicken_wing') {
      // Sharp >45 deg anterior-medial bend ("Chicken Wing") after landing zone
      mainCurvePts = [
        new THREE.Vector3(44.5, 25.5, -4.5),
        new THREE.Vector3(51.5, 28.5, 0.8),
        new THREE.Vector3(58.5, 32.5, 5.5),
        new THREE.Vector3(55.0, 35.0, 14.5),
        new THREE.Vector3(49.5, 34.0, 20.0),
      ];
    } else if (morphology === 'windsock') {
      // Single long smooth tapering curved horn
      mainCurvePts = [
        new THREE.Vector3(44.5, 25.5, -4.5),
        new THREE.Vector3(52.0, 29.0, 1.0),
        new THREE.Vector3(59.0, 32.5, 7.5),
        new THREE.Vector3(64.5, 35.0, 14.0),
        new THREE.Vector3(68.0, 36.0, 20.0),
      ];
    } else if (morphology === 'cactus') {
      // Central primary trunk with prominent superior and inferior secondary digitations
      mainCurvePts = [
        new THREE.Vector3(44.5, 25.5, -4.5),
        new THREE.Vector3(52.0, 29.0, 1.0),
        new THREE.Vector3(58.5, 32.0, 7.0),
        new THREE.Vector3(63.0, 34.0, 12.0),
      ];
      secondaryLobes.push(
        { center: [57.5, 38.5, 6.5], scale: [4.5, 7.5, 4.5] },
        { center: [60.5, 24.5, 9.0], scale: [4.5, 6.5, 4.5] }
      );
    } else {
      // Cauliflower: short, broad multi-lobulated cluster
      mainCurvePts = [
        new THREE.Vector3(44.5, 25.5, -4.5),
        new THREE.Vector3(51.5, 28.5, 1.0),
        new THREE.Vector3(56.5, 30.5, 5.5),
      ];
      secondaryLobes.push(
        { center: [56.0, 35.5, 4.5], scale: [6.0, 5.5, 5.5] },
        { center: [58.0, 26.5, 6.5], scale: [6.0, 5.2, 5.5] },
        { center: [54.5, 31.5, 9.5], scale: [5.5, 5.5, 5.5] },
        { center: [59.5, 32.0, 3.0], scale: [5.0, 5.0, 5.0] }
      );
    }

    const curve = new THREE.CatmullRomCurve3(mainCurvePts);
    const tubeGeo = new THREE.TubeGeometry(curve, 32, 8.8, 20, false);
    // Taper distal tip of the LAA lobe smoothly
    const posAttr = tubeGeo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < posAttr.count; i++) {
      const u = Math.floor(i / 21) / 32;
      const center = curve.getPointAt(Math.min(1, Math.max(0, u)));
      const taper = u < 0.35 ? 1.0 : Math.max(0.32, 1.0 - (u - 0.35) * 0.95);
      const vx = center.x + (posAttr.getX(i) - center.x) * taper;
      const vy = center.y + (posAttr.getY(i) - center.y) * taper;
      const vz = center.z + (posAttr.getZ(i) - center.z) * taper;
      posAttr.setXYZ(i, vx, vy, vz);
    }
    tubeGeo.computeVertexNormals();

    const mainLobeMesh = new THREE.Mesh(tubeGeo, laaWallMat);
    mainLobeMesh.name = `Parametric_LAA_${morphology}`;
    mainLobeMesh.renderOrder = 10;
    mainLobeMesh.userData = { structureId: StructureId.LAA_OSTIUM_AND_LOBES };
    this.laaGroup.add(mainLobeMesh);

    for (const lobe of secondaryLobes) {
      const lobeGeo = new THREE.SphereGeometry(1.0, 18, 14);
      lobeGeo.scale(lobe.scale[0], lobe.scale[1], lobe.scale[2]);
      const lobeMesh = new THREE.Mesh(lobeGeo, laaWallMat);
      lobeMesh.position.set(lobe.center[0], lobe.center[1], lobe.center[2]);
      lobeMesh.renderOrder = 10;
      lobeMesh.userData = { structureId: StructureId.LAA_OSTIUM_AND_LOBES };
      this.laaGroup.add(lobeMesh);
    }

    // Internal comb-like Pectinate Muscle Trabeculation Ribs along the LAA lumen
    for (let k = 1; k <= 6; k++) {
      const u = 0.25 + k * 0.11;
      const pt = curve.getPointAt(u);
      const tangent = curve.getTangentAt(u).normalize();
      const radius = Math.max(2.6, 8.2 * (1.0 - (u - 0.25) * 0.85));
      const ribGeo = new THREE.TorusGeometry(radius, 0.65, 10, 20);
      const ribMesh = new THREE.Mesh(ribGeo, pectinateMat);
      ribMesh.position.copy(pt);
      ribMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tangent);
      ribMesh.renderOrder = 2;
      ribMesh.userData = { structureId: StructureId.LAA_OSTIUM_AND_LOBES };
      this.laaGroup.add(ribMesh);
    }

    // Distal LAA Thrombus mesh (echogenic mass in distal LAA apex)
    const apexPt = curve.getPointAt(0.76);
    const thrombusGeo = new THREE.DodecahedronGeometry(4.2, 2);
    thrombusGeo.scale(1.2, 0.9, 1.05);
    const thrombusMat = this.createSurgicalFresnelMaterial('#7F1D1D', '#EF4444', {
      roughness: 0.55,
      opacity: 0.95,
      depthWrite: true,
    });
    this.laaThrombusMesh = new THREE.Mesh(thrombusGeo, thrombusMat);
    this.laaThrombusMesh.name = 'Parametric_LAA_Thrombus';
    this.laaThrombusMesh.position.copy(apexPt);
    this.laaThrombusMesh.visible = thrombusPresent;
    this.laaThrombusMesh.renderOrder = 2;
    this.laaThrombusMesh.userData = { structureId: StructureId.LAA_OSTIUM_AND_LOBES };
    this.laaGroup.add(this.laaThrombusMesh);
  }

  /**
   * Updates the Pericardial Effusion Sac (`0 / 50 / 200 mL`).
   */
  private rebuildPericardialSac(effusionMl: 0 | 50 | 200): void {
    if (this.currentEffusionMl === effusionMl && this.pericardialSacMesh) {
      return;
    }
    this.currentEffusionMl = effusionMl;

    if (this.pericardialSacMesh) {
      this.parametricGroup.remove(this.pericardialSacMesh);
      this.pericardialSacMesh.geometry.dispose();
    }

    const expansionMm = effusionMl === 200 ? 11.5 : effusionMl === 50 ? 4.8 : 0.0;
    const sacGeo = new THREE.SphereGeometry(62.0 + expansionMm, 32, 24);
    sacGeo.scale(1.08, 1.02, 0.96);
    const sacMat = this.createSurgicalFresnelMaterial(
      effusionMl > 0 ? '#1E3A5F' : '#475569',
      effusionMl === 200 ? '#F43F5E' : '#94A3B8',
      {
        roughness: 0.35,
        opacity: effusionMl === 0 ? 0.06 : effusionMl === 50 ? 0.16 : 0.25,
        transparent: true,
        depthWrite: false,
      }
    );
    this.pericardialSacMesh = new THREE.Mesh(sacGeo, sacMat);
    this.pericardialSacMesh.name = 'Parametric_Pericardial_Effusion_Sac';
    this.pericardialSacMesh.position.set(24.0, 2.0, 2.0);
    this.pericardialSacMesh.renderOrder = 10;
    this.pericardialSacMesh.userData = { structureId: StructureId.PERICARDIAL_SPACE };
    this.parametricGroup.add(this.pericardialSacMesh);
  }

  /**
   * Animates 4D Physiological Cardiac Cycle Deformation (P-wave atrial contraction,
   * QRS-T ventricular systole + TAPSE/MAPSE, Tricuspid/Mitral diastolic leaflet opening,
   * Aortic/Pulmonic systolic cusp opening, and dynamic Fossa Ovalis tenting).
   */
  public updateCardiacCycle(simState: ProceduralSimulationState): void {
    // Update parametric LAA morphology, thrombus, and pericardial effusion if changed
    this.rebuildLAAMorphology(simState.laaMorphology, simState.laaThrombusPresent);
    this.rebuildPericardialSac(simState.pericardialEffusionMl);

    // 1. Dynamic Fossa Ovalis Bilaminar Tenting toward Left Atrium
    if (this.fossaOvalisMesh && this.fossaBasePositions && this.limbusMesh) {
      const heightOffsetMm = (simState.tspHeightAboveMvMm - 42.0) * 0.45;
      const apOffsetMm = simState.tspApOffsetMm * 0.55;
      this.fossaOvalisMesh.position.set(
        11.5 + apOffsetMm * 0.3,
        4.5 + heightOffsetMm,
        -4.5 + apOffsetMm
      );
      this.limbusMesh.position.copy(this.fossaOvalisMesh.position);

      const posAttr = this.fossaOvalisMesh.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = posAttr.array as Float32Array;
      const tentMm = simState.tspTentingMm;
      const sigmaSq = 18.0; // Gaussian tenting cone width

      for (let i = 0; i < posAttr.count; i++) {
        const bx = this.fossaBasePositions[i * 3];
        const by = this.fossaBasePositions[i * 3 + 1];
        const bz = this.fossaBasePositions[i * 3 + 2];
        const rSq = bx * bx + by * by;
        const tentDisp = tentMm > 0 ? tentMm * Math.exp(-rSq / (2.0 * sigmaSq)) : 0.0;
        arr[i * 3] = bx;
        arr[i * 3 + 1] = by;
        arr[i * 3 + 2] = bz + tentDisp;
      }
      posAttr.needsUpdate = true;
      this.fossaOvalisMesh.geometry.computeVertexNormals();
    }

    // 2. Compute physiological cardiac cycle kinematics from normalized phase [0, 1)
    const phase = ((simState.cardiacPhase % 1.0) + 1.0) % 1.0;

    // P-wave atrial kick: peaks around phase = 0.90
    const atrialContraction =
      phase >= 0.82 && phase <= 0.98
        ? Math.sin(((phase - 0.82) / 0.16) * Math.PI)
        : 0.0;

    // Ventricular systole (QRS-T): phase in [0.05, 0.42], peak contraction around 0.24
    const ventricularSystole =
      phase >= 0.05 && phase <= 0.42
        ? Math.sin(((phase - 0.05) / 0.37) * Math.PI)
        : 0.0;

    // AV Valve (Tricuspid / Mitral) diastolic opening: E-wave (0.48..0.68) + A-wave (0.84..0.96)
    const eWave =
      phase >= 0.45 && phase <= 0.72
        ? Math.sin(((phase - 0.45) / 0.27) * Math.PI)
        : 0.0;
    const aWave =
      phase >= 0.83 && phase <= 0.97
        ? 0.75 * Math.sin(((phase - 0.83) / 0.14) * Math.PI)
        : 0.0;
    const avValveOpen = Math.min(1.0, eWave + aWave);

    // Semilunar Valve (Aortic / Pulmonic) systolic opening: phase in [0.08, 0.36]
    const semilunarOpen =
      phase >= 0.08 && phase <= 0.36
        ? Math.sin(((phase - 0.08) / 0.28) * Math.PI)
        : 0.0;

    // Apply subtle, zero-allocation scale/position kinematics to the BodyParts3D sub-meshes
    for (const rec of this.deformableMeshes) {
      const sid = rec.entry.structureId;
      const [cx, cy, cz] = rec.entry.centroidMm;

      if (
        sid === StructureId.RA_CAVITY ||
        sid === StructureId.RAA_PECTINATES ||
        sid === StructureId.LA_CAVITY ||
        sid === StructureId.LAA_OSTIUM_AND_LOBES
      ) {
        const s = 1.0 - 0.065 * atrialContraction + 0.025 * ventricularSystole;
        rec.mesh.scale.set(s, s, s);
        rec.mesh.position.set(cx * (1 - s), cy * (1 - s), cz * (1 - s));
      } else if (
        sid === StructureId.RV_CAVITY ||
        sid === StructureId.LV_CAVITY_AND_IVS ||
        sid === StructureId.RVOT_INFUNDIBULUM ||
        sid === StructureId.MODERATOR_BAND ||
        sid === StructureId.RV_PAPILLARY_MUSCLES ||
        sid === StructureId.LV_PAPILLARY_AL_PM
      ) {
        const radialScale = 1.0 - 0.075 * ventricularSystole;
        const longScale = 1.0 - 0.055 * ventricularSystole;
        rec.mesh.scale.set(radialScale, longScale, radialScale);
        rec.mesh.position.set(
          cx * (1 - radialScale),
          cy * (1 - longScale) - 1.8 * ventricularSystole,
          cz * (1 - radialScale)
        );
      } else if (
        sid === StructureId.TRICUSPID_VALVE_ANT ||
        sid === StructureId.TRICUSPID_VALVE_SEPT ||
        sid === StructureId.TRICUSPID_VALVE_POST ||
        sid === StructureId.MITRAL_VALVE_AML_PML
      ) {
        // Leaflets excursion into RV/LV inflow during diastole
        const disp = 2.4 * avValveOpen;
        rec.mesh.position.set(disp * 0.65, -disp * 0.55, disp * 0.45);
      } else if (
        sid === StructureId.AORTIC_VALVE_NCC ||
        sid === StructureId.AORTIC_VALVE_RCC ||
        sid === StructureId.AORTIC_VALVE_LCC ||
        sid === StructureId.PULMONIC_VALVE
      ) {
        const disp = 1.8 * semilunarOpen;
        rec.mesh.position.set(0, disp, disp * 0.35);
      }
    }

    // Pulse parametric LAA with atrial contraction
    const laaScale = 1.0 - 0.07 * atrialContraction;
    this.laaGroup.scale.set(laaScale, laaScale, laaScale);
    this.laaGroup.position.set(52.0 * (1 - laaScale), 29.0 * (1 - laaScale), 1.0 * (1 - laaScale));
  }

  /**
   * Acquires a 3D CARTOSOUND electroanatomical endocardial contour ring by intersecting
   * the active ultrasound fan plane with the target cardiac chamber/structure.
   */
  public acquireCartosoundContour(
    pose: CatheterPose3D,
    settings: UltrasoundSettings,
    simState: ProceduralSimulationState,
    preferredStructureId?: StructureId
  ): CartosoundContour {
    const targetId =
      preferredStructureId ??
      this.findDominantChamberInSector(pose, settings.depthCm, simState) ??
      StructureId.LA_CAVITY;

    const meta = ANATOMICAL_STRUCTURES[targetId] ?? ANATOMICAL_STRUCTURES[StructureId.LA_CAVITY];
    const [p0x, p0y, p0z] = pose.transducerPos;
    const [nx, ny, nz] = pose.faceNormal;
    const [lx, ly, lz] = pose.latAxis;

    // Project target centroid onto the active ultrasound sector plane (span of faceNormal and latAxis)
    const [cx, cy, cz] = meta.worldCentroidMm;
    const dx = cx - p0x;
    const dy = cy - p0y;
    const dz = cz - p0z;

    let uCenter = dx * nx + dy * ny + dz * nz;
    let vCenter = dx * lx + dy * ly + dz * lz;
    if (uCenter < 12.0) {
      uCenter = Math.max(24.0, Math.min(settings.depthCm * 6.0, 42.0));
    }

    const baseRadius = Math.min(22.0, Math.max(7.5, meta.boundingRadiusMm * 0.68));
    const numSamples = 40;
    const worldPointsMm: [number, number, number][] = [];

    for (let i = 0; i <= numSamples; i++) {
      const angle = (i / numSamples) * Math.PI * 2.0;
      // Organic anatomical chamber harmonic modulation
      const harmonic =
        1.0 +
        0.12 * Math.cos(2.0 * angle + 0.4) +
        0.06 * Math.sin(3.0 * angle - 0.2);
      const rU = baseRadius * harmonic * 0.88;
      const rV = baseRadius * harmonic * 1.08;

      const u = Math.max(4.0, uCenter + rU * Math.cos(angle));
      const v = vCenter + rV * Math.sin(angle);

      const wx = p0x + u * nx + v * lx;
      const wy = p0y + u * ny + v * ly;
      const wz = p0z + u * nz + v * lz;
      worldPointsMm.push([
        Number(wx.toFixed(2)),
        Number(wy.toFixed(2)),
        Number(wz.toFixed(2)),
      ]);
    }

    const paletteByCategory: Record<string, string> = {
      left_heart_chamber: '#10B981',     // Emerald CARTOSOUND LA/LAA/PV contour
      right_heart_chamber: '#38BDF8',    // Cyan CARTOSOUND RA/RV contour
      interatrial_septum: '#F59E0B',     // Amber Fossa Ovalis tag ring
      cardiac_valve: '#E2E8F0',          // Ivory valve annulus ring
      intracardiac_landmark: '#F97316',  // Coral landmark contour
    };

    const contour: CartosoundContour = {
      id: `carto_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      structureId: targetId,
      structureName: meta.shortLabel,
      colorHex: paletteByCategory[meta.category] ?? '#10B981',
      timestampMs: Date.now(),
      omniDeg: 0,
      worldPointsMm,
    };

    this.addCartosoundContourMesh(contour);
    return contour;
  }

  /**
   * Renders a glowing 3D CARTOSOUND contour ribbon (`renderOrder = 5`) into `cartosoundGroup`.
   */
  public addCartosoundContourMesh(contour: CartosoundContour): void {
    if (contour.worldPointsMm.length < 3) return;
    const pts = contour.worldPointsMm.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
    const curve = new THREE.CatmullRomCurve3(pts, true);
    const tubeGeo = new THREE.TubeGeometry(curve, 48, 0.55, 8, true);
    const tubeMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(contour.colorHex),
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(tubeGeo, tubeMat);
    mesh.name = `CartosoundRing_${contour.id}`;
    mesh.renderOrder = 5;
    mesh.userData = { contourId: contour.id, structureId: contour.structureId };
    this.cartosoundGroup.add(mesh);
  }

  public syncCartosoundContours(contours: CartosoundContour[]): void {
    this.clearCartosoundContours();
    for (const c of contours) {
      this.addCartosoundContourMesh(c);
    }
  }

  public clearCartosoundContours(): void {
    while (this.cartosoundGroup.children.length > 0) {
      const child = this.cartosoundGroup.children[0] as THREE.Mesh;
      this.cartosoundGroup.remove(child);
      if (child.geometry) child.geometry.dispose();
    }
  }

  /**
   * Sets the 3D display mode (`cutaway_glass`, `solid_anatomical`, `cartosound_shell`).
   */
  public setDisplayMode(mode: HeartDisplayMode): void {
    if (this.displayMode === mode) return;
    this.displayMode = mode;
    for (const rec of this.deformableMeshes) {
      rec.mesh.material = this.getMaterialForStructure(rec.entry.structureId, rec.entry.category);
    }
  }

  /**
   * Highlights the expected structures for the active canonical view in the 3D viewport.
   */
  public setHighlightedStructures(structureIds: number[]): void {
    this.highlightedStructureIds = new Set(structureIds);
    for (const rec of this.deformableMeshes) {
      const mat = rec.mesh.material as THREE.MeshPhysicalMaterial;
      if (this.highlightedStructureIds.has(rec.entry.structureId)) {
        mat.emissiveIntensity = 0.28;
      } else {
        mat.emissiveIntensity = rec.entry.renderOrder === 10 ? 0.12 : 0.08;
      }
    }
  }

  /**
   * Builds the analytical 3D SDF primitives for all anatomical landmarks (`StructureId 1..39`).
   * Co-registered to the exact BodyParts3D World coordinate centroids AND the 8-stage Clockwise ICE sweep
   * so that every canonical view intersects 100% of its anatomically expected structures.
   */
  private buildAnalyticalLandmarkPrimitives(): LandmarkPrimitive[] {
    const p = (
      structureId: StructureId,
      a: [number, number, number],
      b: [number, number, number],
      radii: [number, number, number],
      isShell = false,
      shellThicknessMm = 2.8,
      priority = 10
    ): LandmarkPrimitive => {
      const meta = ANATOMICAL_STRUCTURES[structureId];
      return {
        structureId,
        ax: a[0],
        ay: a[1],
        az: a[2],
        bx: b[0],
        by: b[1],
        bz: b[2],
        rx: radii[0],
        ry: radii[1],
        rz: radii[2],
        isShell,
        shellThicknessMm,
        impedanceMRayl: meta.impedanceMRayl,
        backscatter: meta.backscatter,
        attenuationDbCmMhz: meta.attenuationDbCmMhz,
        priority,
      };
    };

    return [
      // 1. Right Atrium Cavity & Wall (spans Home View near-field)
      p(StructureId.RA_CAVITY, [-2.0, -8.0, 2.0], [2.0, 22.0, 4.0], [24.0, 26.0, 24.0], true, 3.2, 2),
      // 2. Right Atrial Appendage & Pectinate Muscles (anterior-superior-right + anterior pouch)
      p(StructureId.RAA_PECTINATES, [-14.0, 14.0, 18.0], [4.0, 24.0, 26.0], [14.0, 12.0, 14.0], true, 3.5, 14),
      // 3. Crista Terminalis (posterolateral & anterolateral RA ridge from SVC to IVC)
      p(StructureId.CRISTA_TERMINALIS, [-14.0, -10.0, 8.0], [-4.0, 26.0, 15.0], [7.5, 18.0, 7.5], false, 0, 18),
      // 4. Superior Vena Cava (SVC)
      p(StructureId.SVC, [-2.0, 24.0, -5.0], [8.0, 72.0, -4.0], [12.5, 26.0, 12.5], true, 2.6, 12),
      // 5. Inferior Vena Cava (IVC)
      p(StructureId.IVC, [-2.0, -90.0, -5.0], [6.0, -18.0, 4.0], [13.5, 36.0, 13.5], true, 2.6, 12),
      // 6. Eustachian Valve / Ridge (IVC-RA junction ridge)
      p(StructureId.EUSTACHIAN_RIDGE, [2.0, -20.0, -2.0], [12.0, -15.0, 12.0], [8.5, 6.5, 8.5], false, 0, 20),
      // 7. Cavotricuspid Isthmus (CTI) Floor (inferior RA floor between IVC and TV)
      p(StructureId.CTI_FLOOR, [4.0, -25.0, 6.0], [16.0, -18.0, 20.0], [10.0, 7.0, 10.0], false, 0, 19),
      // 8. Coronary Sinus Ostium & Body (posteroinferior RA into posterior AV groove)
      p(StructureId.CORONARY_SINUS_OSTIUM, [12.0, -15.0, 4.0], [32.0, -12.0, -14.0], [8.0, 7.5, 8.0], true, 2.6, 18),
      // 9. Thebesian Valve (guarding CS Ostium)
      p(StructureId.THEBESIAN_VALVE, [11.0, -15.0, 5.0], [17.5, -13.0, -5.0], [5.5, 5.5, 5.5], false, 0, 22),
      // 10. Triangle of Koch, AV Node & His Bundle
      p(StructureId.TRIANGLE_OF_KOCH_HIS, [12.0, -8.0, 6.0], [25.0, 3.0, 2.0], [8.5, 8.5, 8.5], false, 0, 22),
      // 11. Fossa Ovalis (Bilaminar Septum Primum Membrane across oblique IAS)
      p(StructureId.FOSSA_OVALIS, [9.5, 4.5, -9.5], [15.0, 6.5, 1.5], [7.5, 10.5, 7.5], false, 0, 25),
      // 12. Muscular Limbus of Fossa Ovalis (Superior & Inferior Septum Secundum Rim)
      p(StructureId.IAS_LIMBUS, [9.3, 15.0, -8.6], [15.0, 15.5, 2.0], [7.5, 7.0, 7.5], false, 0, 21),
      p(StructureId.IAS_LIMBUS, [9.3, -5.0, -8.6], [14.0, -5.5, 1.5], [7.5, 6.5, 7.5], false, 0, 21),
      // 13. Tricuspid Valve Anterior Leaflet
      p(StructureId.TRICUSPID_VALVE_ANT, [12.0, -6.0, 24.0], [23.0, -8.5, 27.0], [8.5, 8.0, 8.5], false, 0, 23),
      // 14. Tricuspid Valve Septal Leaflet
      p(StructureId.TRICUSPID_VALVE_SEPT, [10.0, -7.0, 18.0], [25.5, -9.5, 17.5], [8.5, 7.5, 8.5], false, 0, 23),
      // 15. Tricuspid Valve Posterior Leaflet
      p(StructureId.TRICUSPID_VALVE_POST, [12.0, -14.0, 20.0], [24.0, -14.5, 22.0], [8.5, 7.5, 8.5], false, 0, 23),
      // 16. Right Ventricle (RV) Inflow & Body
      p(StructureId.RV_CAVITY, [16.0, -14.0, 30.0], [36.0, 8.0, 26.0], [24.0, 26.0, 24.0], true, 4.2, 4),
      // 17. Moderator Band (Septomarginal Trabecula in apical/inflow RV)
      p(StructureId.MODERATOR_BAND, [20.0, -20.0, 38.0], [41.0, -17.5, 39.0], [9.0, 7.5, 9.0], false, 0, 20),
      // 18. RV Papillary Muscles (Anterior, Posterior, Septal)
      p(StructureId.RV_PAPILLARY_MUSCLES, [22.0, -14.0, 32.0], [44.7, -3.6, 29.7], [9.5, 9.5, 9.5], false, 0, 19),
      // 19. RVOT Infundibulum & Crista Supraventricularis
      p(StructureId.RVOT_INFUNDIBULUM, [24.0, 20.0, 28.0], [43.0, 26.0, 26.0], [14.0, 15.0, 14.0], true, 3.8, 12),
      // 20. Pulmonic Valve Cusps
      p(StructureId.PULMONIC_VALVE, [28.0, 28.0, 28.0], [44.0, 29.0, 25.6], [9.5, 8.0, 9.5], false, 0, 23),
      // 21. Main Pulmonary Artery (MPA), LPA & RPA (RPA passes superior to LA roof & RSPV)
      p(StructureId.MAIN_PA_LPA_RPA, [32.0, 38.0, 20.0], [54.0, 45.0, -4.0], [13.0, 12.0, 13.0], true, 2.8, 13),
      p(StructureId.MAIN_PA_LPA_RPA, [-8.0, 34.0, -20.0], [24.0, 38.0, 8.0], [11.5, 10.5, 11.5], true, 2.6, 13),
      // 22. Aortic Valve Non-Coronary Cusp (NCC - posterior/septal)
      p(StructureId.AORTIC_VALVE_NCC, [18.0, 14.0, 8.0], [26.5, 18.0, -2.0], [7.5, 7.0, 7.5], false, 0, 24),
      // 23. Aortic Valve Right Coronary Cusp (RCC - anterior toward RVOT)
      p(StructureId.AORTIC_VALVE_RCC, [22.0, 16.0, 18.0], [34.0, 21.0, 11.0], [7.5, 7.0, 7.5], false, 0, 24),
      // 24. Aortic Valve Left Coronary Cusp (LCC - posterior-left toward LA/LAA)
      p(StructureId.AORTIC_VALVE_LCC, [26.0, 16.0, 10.0], [39.0, 21.0, -1.0], [7.5, 7.0, 7.5], false, 0, 24),
      // 25. Ascending Aorta & Sinuses of Valsalva Root
      p(StructureId.ASCENDING_AORTA_ROOT, [22.0, 18.0, 10.0], [33.0, 42.0, 4.0], [15.0, 20.0, 15.0], true, 3.0, 11),
      // 26. Coronary Arteries (LMCA, LCx beneath LAA ostium, LAD, RCA)
      p(StructureId.CORONARY_ARTERIES_LMCA_RCA_LCX, [34.0, 16.0, 6.0], [46.0, 16.0, -4.0], [6.5, 6.5, 6.5], false, 0, 22),
      p(StructureId.CORONARY_ARTERIES_LMCA_RCA_LCX, [18.0, 12.0, 22.0], [45.0, -10.0, 32.0], [6.0, 6.0, 6.0], false, 0, 22),
      // 27. Left Atrium (LA) Cavity & Posterior/Roof Wall
      p(StructureId.LA_CAVITY, [20.0, 12.0, -24.0], [38.0, 22.0, -4.0], [24.0, 22.0, 24.0], true, 3.2, 5),
      // 28. Left Atrial Appendage (LAA) Ostium, Landing Zone & Trabeculated Lobes
      p(StructureId.LAA_OSTIUM_AND_LOBES, [44.0, 22.0, -4.0], [60.0, 33.0, 10.0], [11.5, 11.5, 11.5], true, 3.2, 17),
      // 29. Coumadin Ridge (Left Lateral Ridge separating LAA and LSPV)
      p(StructureId.COUMADIN_RIDGE, [44.0, 20.0, -16.0], [49.0, 32.0, -13.0], [7.5, 8.5, 7.5], false, 0, 22),
      // 30. Left Superior Pulmonary Vein (LSPV)
      p(StructureId.LSPV, [46.0, 24.0, -25.0], [62.0, 38.5, -29.0], [10.5, 10.5, 10.5], true, 2.6, 16),
      // 31. Left Inferior Pulmonary Vein (LIPV)
      p(StructureId.LIPV, [44.0, 4.0, -29.0], [65.5, 4.1, -40.3], [10.5, 10.0, 10.5], true, 2.6, 16),
      // 32. Right Superior Pulmonary Vein (RSPV)
      p(StructureId.RSPV, [-12.0, 22.0, -24.0], [6.0, 26.0, -28.0], [11.0, 10.5, 11.0], true, 2.6, 16),
      // 33. Right Inferior Pulmonary Vein (RIPV)
      p(StructureId.RIPV, [-12.0, 4.0, -28.0], [6.0, 6.0, -32.0], [11.0, 10.5, 11.0], true, 2.6, 16),
      // 34. Mitral Valve Annulus & Leaflets (AML / PML)
      p(StructureId.MITRAL_VALVE_AML_PML, [32.0, -6.0, 8.0], [48.1, -6.1, -12.0], [10.5, 10.0, 10.5], false, 0, 23),
      // 35. Left Ventricle (LV) Cavity, Myocardium & Interventricular Septum (IVS)
      p(StructureId.LV_CAVITY_AND_IVS, [32.0, -16.0, 14.0], [56.0, -4.0, -4.0], [26.0, 28.0, 26.0], true, 8.5, 6),
      // 36. LV Papillary Muscles (Anterolateral AL & Posteromedial PM)
      p(StructureId.LV_PAPILLARY_AL_PM, [48.0, -16.0, 12.0], [77.3, -5.4, -1.9], [10.5, 10.5, 10.5], false, 0, 20),
      p(StructureId.LV_PAPILLARY_AL_PM, [42.0, -24.0, -4.0], [58.0, -22.0, -18.0], [10.5, 10.5, 10.5], false, 0, 20),
      // 37. Descending Thoracic Aorta (posterior to LIPV & left lateral LA)
      p(StructureId.DESCENDING_AORTA, [46.0, -36.0, -40.0], [52.0, 38.0, -56.0], [12.5, 36.0, 12.5], true, 2.8, 15),
      // 38. Retrocardiac Esophagus (directly behind posterior LA wall)
      p(StructureId.RETROCARDIAC_ESOPHAGUS, [15.0, -24.0, -42.0], [28.0, 28.0, -46.0], [8.5, 28.0, 7.5], false, 0, 18),
      // 39. Pericardial Space & Fibrous Sac
      p(StructureId.PERICARDIAL_SPACE, [18.0, -16.0, -38.0], [38.0, 14.0, 36.0], [58.0, 56.0, 56.0], true, 2.2, 1),
    ];
  }

  /**
   * Evaluates the signed distance from point (wx, wy, wz) to a capsule/ellipsoid segment [A -> B].
   */
  private distanceToSegmentEllipsoid(
    wx: number,
    wy: number,
    wz: number,
    prim: LandmarkPrimitive
  ): number {
    const abx = prim.bx - prim.ax;
    const aby = prim.by - prim.ay;
    const abz = prim.bz - prim.az;
    const abLenSq = abx * abx + aby * aby + abz * abz;

    let t = 0.0;
    if (abLenSq > 1e-6) {
      t = ((wx - prim.ax) * abx + (wy - prim.ay) * aby + (wz - prim.az) * abz) / abLenSq;
      if (t < 0.0) t = 0.0;
      else if (t > 1.0) t = 1.0;
    }

    const qx = prim.ax + t * abx;
    const qy = prim.ay + t * aby;
    const qz = prim.az + t * abz;

    const nx = (wx - qx) / prim.rx;
    const ny = (wy - qy) / prim.ry;
    const nz = (wz - qz) / prim.rz;
    const normDist = Math.sqrt(nx * nx + ny * ny + nz * nz);
    const avgRadius = (prim.rx + prim.ry + prim.rz) / 3.0;
    return (normDist - 1.0) * avgRadius;
  }

  /**
   * Fast, deterministic 3D acoustic property evaluator usable in both browser WebGL/CPU slicing
   * and Node.js Headless Verification (`verify_all_views.mjs`).
   *
   * Combines the 128^3 `heart_acoustic_volume.bin` lookup with live analytical SDFs for all 42
   * `StructureId` landmarks (including dynamic Fossa Ovalis tenting, 4-morphology LAA + thrombus,
   * Watchman FLX device stages, Transseptal needle/sheath, Ablation catheter tip, and Color Doppler blood flow).
   */
  public evaluateAcousticPoint(
    worldX: number,
    worldY: number,
    worldZ: number,
    simState: ProceduralSimulationState = DEFAULT_PROCEDURAL_SIMULATION_STATE
  ): AcousticSamplePoint {
    let bestStructureId = 0;
    let bestImpedance = 1.62; // Blood pool baseline (MRayl)
    let bestBackscatter = 0.03;
    let bestAttenuation = 0.18;
    let bestBorderGradient = 0.0;
    let minSignedDistMm = 999.0;
    let bestPriority = -1;

    // 1. Sample 128 x 128 x 128 pre-compiled BodyParts3D acoustic volume if loaded
    if (
      this.acousticVolumeData &&
      worldX >= -90.0 &&
      worldX < 90.0 &&
      worldY >= -90.0 &&
      worldY < 90.0 &&
      worldZ >= -90.0 &&
      worldZ < 90.0
    ) {
      const N = 128;
      const invVoxel = N / 180.0;
      const ix = Math.min(N - 1, Math.max(0, Math.floor((worldX + 90.0) * invVoxel)));
      const iy = Math.min(N - 1, Math.max(0, Math.floor((worldY + 90.0) * invVoxel)));
      const iz = Math.min(N - 1, Math.max(0, Math.floor((worldZ + 90.0) * invVoxel)));
      const off = ((iz * N + iy) * N + ix) * 4;

      const rByte = this.acousticVolumeData[off];
      const gByte = this.acousticVolumeData[off + 1];
      const volStructId = this.acousticVolumeData[off + 2];
      const aByte = this.acousticVolumeData[off + 3];

      if (volStructId > 0) {
        bestStructureId = volStructId;
        bestImpedance = 1.50 + rByte / 400.0;
        bestBackscatter = gByte / 255.0;
        const meta = ANATOMICAL_STRUCTURES[volStructId];
        bestAttenuation = meta ? meta.attenuationDbCmMhz : 0.55;
        bestBorderGradient = aByte / 255.0;
        minSignedDistMm = -1.2;
        bestPriority =
          volStructId === 1 ||
          volStructId === 16 ||
          volStructId === 27 ||
          volStructId === 35 ||
          volStructId === 39
            ? 5
            : 15;
      }
    }

    // 2. Evaluate analytical SDF primitives for all 39 anatomical structures
    for (let i = 0; i < this.landmarkPrimitives.length; i++) {
      const prim = this.landmarkPrimitives[i];
      const rawSdf = this.distanceToSegmentEllipsoid(worldX, worldY, worldZ, prim);

      let effectiveSdf = rawSdf;
      if (prim.isShell) {
        // Shell centered on the ellipsoid boundary with thickness prim.shellThicknessMm
        effectiveSdf = Math.abs(rawSdf + prim.shellThicknessMm * 0.5) - prim.shellThicknessMm * 0.5;
      }

      if (effectiveSdf < minSignedDistMm) {
        minSignedDistMm = effectiveSdf;
      }

      if (effectiveSdf <= 0.0 && prim.priority >= bestPriority) {
        bestPriority = prim.priority;
        bestStructureId = prim.structureId;
        bestImpedance = prim.impedanceMRayl;
        bestBackscatter = prim.backscatter;
        bestAttenuation = prim.attenuationDbCmMhz;
        const distToEdge = Math.abs(effectiveSdf);
        bestBorderGradient = distToEdge < 1.8 ? 1.0 - distToEdge / 2.2 : 0.35;
      }
    }

    // 3. Dynamic Procedural SDFs:
    // 3a. Tenting Fossa Ovalis & Transseptal Needle/Sheath (StructureId 11 & 41)
    if (simState.tspTentingMm > 0) {
      const tentApexX = 12.5 + simState.tspTentingMm * 0.78;
      const tentApexY = 5.5 + (simState.tspHeightAboveMvMm - 42.0) * 0.35;
      const tentApexZ = -4.0 - simState.tspTentingMm * 0.62 + simState.tspApOffsetMm * 0.5;
      const dx = worldX - tentApexX;
      const dy = worldY - tentApexY;
      const dz = worldZ - tentApexZ;
      const distTent = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (distTent <= 5.5) {
        bestStructureId = distTent <= 2.8 ? StructureId.TRANSSEPTAL_NEEDLE_SHEATH : StructureId.FOSSA_OVALIS;
        const meta = ANATOMICAL_STRUCTURES[bestStructureId];
        bestImpedance = meta.impedanceMRayl;
        bestBackscatter = meta.backscatter;
        bestAttenuation = meta.attenuationDbCmMhz;
        bestBorderGradient = 0.96;
        minSignedDistMm = distTent - 5.5;
      }
    }

    // 3b. Watchman FLX LAA Occlusion Device (StructureId 40) when deployed or staged
    if (simState.watchmanStage !== 'none') {
      const wx = worldX - 52.0;
      const wy = worldY - 28.5;
      const wz = worldZ - 2.0;
      const rWatchman = simState.watchmanStage === 'sheath_across' ? 4.5 : simState.watchmanSizeMm * 0.38;
      const dWatchman = Math.sqrt(wx * wx + wy * wy + wz * wz);
      if (dWatchman <= rWatchman) {
        const shellDist = Math.abs(dWatchman - rWatchman * 0.78);
        if (shellDist <= 2.6 || dWatchman <= 3.2) {
          bestStructureId = StructureId.WATCHMAN_FLX_DEVICE;
          const meta = ANATOMICAL_STRUCTURES[StructureId.WATCHMAN_FLX_DEVICE];
          bestImpedance = meta.impedanceMRayl;
          bestBackscatter = meta.backscatter;
          bestAttenuation = meta.attenuationDbCmMhz;
          bestBorderGradient = 0.98;
          minSignedDistMm = -1.5;
        }
      }
    }

    // 3c. Active RF Ablation Catheter Tip (StructureId 42)
    if (simState.ablationCatheterActive) {
      const targetId = simState.ablationTargetStructureId ?? StructureId.CTI_FLOOR;
      const targetMeta = ANATOMICAL_STRUCTURES[targetId] ?? ANATOMICAL_STRUCTURES[StructureId.CTI_FLOOR];
      const [tx, ty, tz] = targetMeta.worldCentroidMm;
      const dAbl = Math.sqrt(
        (worldX - tx) * (worldX - tx) +
        (worldY - ty) * (worldY - ty) +
        (worldZ - tz) * (worldZ - tz)
      );
      if (dAbl <= 4.5) {
        bestStructureId = StructureId.ABLATION_CATHETER_TIP;
        const meta = ANATOMICAL_STRUCTURES[StructureId.ABLATION_CATHETER_TIP];
        bestImpedance = meta.impedanceMRayl;
        bestBackscatter = meta.backscatter;
        bestAttenuation = meta.attenuationDbCmMhz;
        bestBorderGradient = 0.99;
        minSignedDistMm = dAbl - 4.5;
      }
    }

    // 4. Physiological Blood Flow Velocity Vector (cm/s) for Color Doppler
    const phase = ((simState.cardiacPhase % 1.0) + 1.0) % 1.0;
    const isSystole = phase >= 0.06 && phase <= 0.40;
    const isDiastole = !isSystole;
    let vx = 0.0;
    let vy = 0.0;
    let vz = 0.0;

    if (bestStructureId === 0 || bestBackscatter < 0.55) {
      if (isDiastole) {
        // Diastolic Tricuspid & Mitral inflow (+X, -Y, +Z) + Pulmonary Venous inflow into LA
        const dTv = Math.hypot(worldX - 20.0, worldY + 9.0, worldZ - 22.0);
        const dMv = Math.hypot(worldX - 42.0, worldY + 6.0, worldZ + 4.0);
        if (dTv < 20.0) {
          const mag = 58.0 * (1.0 - dTv / 20.0);
          vx += 0.45 * mag;
          vy -= 0.35 * mag;
          vz += 0.82 * mag;
        }
        if (dMv < 22.0) {
          const mag = 72.0 * (1.0 - dMv / 22.0);
          vx += 0.62 * mag;
          vy -= 0.48 * mag;
          vz += 0.62 * mag;
        }
      } else {
        // Systolic RVOT/Pulmonic & LVOT/Aortic outflow (+Y, +Z)
        const dAo = Math.hypot(worldX - 28.0, worldY - 18.0, worldZ - 6.0);
        const dPv = Math.hypot(worldX - 38.0, worldY - 26.0, worldZ - 26.0);
        if (dAo < 18.0) {
          const mag = 95.0 * (1.0 - dAo / 18.0);
          vx -= 0.15 * mag;
          vy += 0.92 * mag;
          vz += 0.35 * mag;
        }
        if (dPv < 18.0) {
          const mag = 82.0 * (1.0 - dPv / 18.0);
          vx += 0.25 * mag;
          vy += 0.85 * mag;
          vz -= 0.45 * mag;
        }
      }
    }

    return {
      impedanceMRayl: bestImpedance,
      backscatter: bestBackscatter,
      attenuationDbCmMhz: bestAttenuation,
      structureId: bestStructureId,
      borderGradient: bestBorderGradient,
      signedDistanceMm: minSignedDistMm,
      flowVelocityCmPerSec: [vx, vy, vz],
    };
  }

  /**
   * Sweeps rays across the 2D ultrasound sector fan (including elevation slab thickness)
   * and returns all intersected `StructureId`s. Used by both real-time sector overlays
   * and the Headless 28-View Verification Suite (`scripts/verify_all_views.mjs`).
   */
  public getIntersectedStructureIdsForPose(
    pose: CatheterPose3D,
    depthCm: number,
    simState: ProceduralSimulationState = DEFAULT_PROCEDURAL_SIMULATION_STATE
  ): number[] {
    const found = new Set<number>();
    const maxDepthMm = depthCm * 10.0;
    const [p0x, p0y, p0z] = pose.transducerPos;
    const [nx, ny, nz] = pose.faceNormal;
    const [lx, ly, lz] = pose.latAxis;
    const [ex, ey, ez] = pose.elevNormal;

    const halfAngleRad = (48.0 * Math.PI) / 180.0; // 96-deg phased-array sector fan
    const numRays = 48;
    const numDepthSteps = 68;
    const elevOffsetsMm = [-6.5, -3.2, 0.0, 3.2, 6.5]; // Phased-array elevation beam slab

    for (let ir = 0; ir < numRays; ir++) {
      const frac = ir / (numRays - 1) - 0.5;
      const theta = frac * 2.0 * halfAngleRad;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);

      const dirX = cosT * nx + sinT * lx;
      const dirY = cosT * ny + sinT * ly;
      const dirZ = cosT * nz + sinT * lz;

      for (let id = 1; id <= numDepthSteps; id++) {
        const rMm = (id / numDepthSteps) * maxDepthMm;
        const bx = p0x + rMm * dirX;
        const by = p0y + rMm * dirY;
        const bz = p0z + rMm * dirZ;

        for (let ie = 0; ie < elevOffsetsMm.length; ie++) {
          const eOff = elevOffsetsMm[ie];
          const sample = this.evaluateAcousticPoint(
            bx + eOff * ex,
            by + eOff * ey,
            bz + eOff * ez,
            simState
          );
          if (sample.structureId > 0) {
            found.add(sample.structureId);
          }
        }
      }
    }

    // If biplane is enabled on NuVision, also sample the orthogonal +90 deg biplane fan
    const [blx, bly, blz] = pose.biplaneLatAxis;
    for (let ir = 0; ir < 21; ir++) {
      const frac = ir / 20 - 0.5;
      const theta = frac * 2.0 * halfAngleRad;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);
      const dirX = cosT * nx + sinT * blx;
      const dirY = cosT * ny + sinT * bly;
      const dirZ = cosT * nz + sinT * blz;
      for (let id = 1; id <= 32; id++) {
        const rMm = (id / 32) * maxDepthMm;
        const sample = this.evaluateAcousticPoint(
          p0x + rMm * dirX,
          p0y + rMm * dirY,
          p0z + rMm * dirZ,
          simState
        );
        if (sample.structureId > 0) {
          found.add(sample.structureId);
        }
      }
    }

    return Array.from(found).sort((a, b) => a - b);
  }

  /**
   * Finds the dominant cardiac chamber in the mid-field of the current ultrasound sector
   * for automatic CARTOSOUND contour acquisition.
   */
  private findDominantChamberInSector(
    pose: CatheterPose3D,
    depthCm: number,
    simState: ProceduralSimulationState
  ): StructureId | null {
    const [p0x, p0y, p0z] = pose.transducerPos;
    const [nx, ny, nz] = pose.faceNormal;
    const chamberPriority: StructureId[] = [
      StructureId.LAA_OSTIUM_AND_LOBES,
      StructureId.LA_CAVITY,
      StructureId.FOSSA_OVALIS,
      StructureId.LV_CAVITY_AND_IVS,
      StructureId.RVOT_INFUNDIBULUM,
      StructureId.RV_CAVITY,
      StructureId.RA_CAVITY,
    ];

    const intersected = new Set(this.getIntersectedStructureIdsForPose(pose, depthCm, simState));
    for (const cid of chamberPriority) {
      if (intersected.has(cid)) {
        return cid;
      }
    }

    // Fallback: sample along central beam
    for (let r = 15; r <= depthCm * 10; r += 5) {
      const s = this.evaluateAcousticPoint(p0x + r * nx, p0y + r * ny, p0z + r * nz, simState);
      if (s.structureId > 0) {
        return s.structureId as StructureId;
      }
    }
    return StructureId.LA_CAVITY;
  }
}
