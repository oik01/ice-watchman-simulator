#!/usr/bin/env python3
"""
Binary Asset & Acoustic Volume Compiler for the
ICE Zero-Fluoroscopy Ablation & LAA Watchman Implantation Simulator.

Reads staged BodyParts3D / FMA cardiac meshes (.obj and .stl) from:
  /Users/omarkreidieh/.gemini/antigravity/brain/07917312-46fb-4450-9336-1981cf501bda/scratch/heart_assets/
Transforms all vertices via:
  bodyPartsToWorld(xBp, yBp, zBp) = [xBp + 14.0, zBp - 1222.0, -(yBp + 120.0)]
Welds vertices, computes smooth area-weighted vertex normals, maps each mesh to its
StructureId (1..39) and surgical subsurface/Fresnel material palette, and outputs:
  1. public/models/heart_atlas.bin
  2. public/models/heart_manifest.json
  3. public/models/heart_acoustic_volume.bin (128 x 128 x 128 x 4 RGBA8 bytes)
"""

import os
import re
import glob
import json
import math
import struct
from array import array

HEART_ASSETS_DIR = (
    "/Users/omarkreidieh/.gemini/antigravity/brain/"
    "07917312-46fb-4450-9336-1981cf501bda/scratch/heart_assets"
)
WORKSPACE_DIR = "/Users/omarkreidieh/Documents/ICE App"
OUT_MODELS_DIR = os.path.join(WORKSPACE_DIR, "public", "models")


def body_parts_to_world(x_bp: float, y_bp: float, z_bp: float):
    return (
        x_bp + 14.0,        # +X = Patient Left
        z_bp - 1222.0,      # +Y = Superior
        -(y_bp + 120.0),    # +Z = Anterior
    )


# StructureId metadata matching src/types/sharedContracts.ts
STRUCTURE_META = {
    1:  ("right_heart_chamber",   "#3B6E8C", "#6497B1", 10, 1.68, 0.46), # RA_CAVITY
    2:  ("intracardiac_landmark", "#3B6E8C", "#6497B1", 10, 1.70, 0.62), # RAA_PECTINATES
    3:  ("intracardiac_landmark", "#C26D5E", "#D48472", 2,  1.76, 0.74), # CRISTA_TERMINALIS
    4:  ("right_heart_chamber",   "#3B6E8C", "#6497B1", 10, 1.69, 0.50), # SVC
    5:  ("right_heart_chamber",   "#3B6E8C", "#6497B1", 10, 1.69, 0.50), # IVC
    6:  ("intracardiac_landmark", "#C26D5E", "#D48472", 2,  1.78, 0.78), # EUSTACHIAN_RIDGE
    7:  ("intracardiac_landmark", "#C26D5E", "#D48472", 2,  1.72, 0.65), # CTI_FLOOR
    8:  ("right_heart_chamber",   "#3B6E8C", "#6497B1", 3,  1.70, 0.58), # CORONARY_SINUS_OSTIUM
    9:  ("intracardiac_landmark", "#DCE2EA", "#F8FAFC", 2,  1.76, 0.75), # THEBESIAN_VALVE
    10: ("conduction_system",     "#F59E0B", "#FBBF24", 2,  1.74, 0.70), # TRIANGLE_OF_KOCH_HIS
    11: ("interatrial_septum",    "#E8DFD1", "#F8FAFC", 2,  1.79, 0.80), # FOSSA_OVALIS
    12: ("interatrial_septum",    "#B85D5D", "#D48472", 2,  1.85, 0.84), # IAS_LIMBUS
    13: ("cardiac_valve",         "#DCE2EA", "#FFFFFF", 2,  1.75, 0.82), # TRICUSPID_VALVE_ANT
    14: ("cardiac_valve",         "#DCE2EA", "#FFFFFF", 2,  1.75, 0.82), # TRICUSPID_VALVE_SEPT
    15: ("cardiac_valve",         "#DCE2EA", "#FFFFFF", 2,  1.75, 0.82), # TRICUSPID_VALVE_POST
    16: ("right_heart_chamber",   "#3B6E8C", "#6497B1", 10, 1.68, 0.50), # RV_CAVITY
    17: ("intracardiac_landmark", "#C26D5E", "#D48472", 2,  1.76, 0.78), # MODERATOR_BAND
    18: ("intracardiac_landmark", "#C26D5E", "#D48472", 2,  1.74, 0.72), # RV_PAPILLARY_MUSCLES
    19: ("right_heart_chamber",   "#3B6E8C", "#6497B1", 10, 1.70, 0.56), # RVOT_INFUNDIBULUM
    20: ("cardiac_valve",         "#DCE2EA", "#FFFFFF", 2,  1.76, 0.84), # PULMONIC_VALVE
    21: ("right_heart_chamber",   "#3B6E8C", "#6497B1", 10, 1.70, 0.54), # MAIN_PA_LPA_RPA
    22: ("cardiac_valve",         "#DCE2EA", "#FFFFFF", 2,  1.78, 0.86), # AORTIC_VALVE_NCC
    23: ("cardiac_valve",         "#DCE2EA", "#FFFFFF", 2,  1.78, 0.86), # AORTIC_VALVE_RCC
    24: ("cardiac_valve",         "#DCE2EA", "#FFFFFF", 2,  1.78, 0.86), # AORTIC_VALVE_LCC
    25: ("left_heart_chamber",    "#9E4747", "#C96A6A", 10, 1.76, 0.70), # ASCENDING_AORTA_ROOT
    26: ("coronary_or_esophagus", "#DC2626", "#F87171", 3,  1.74, 0.68), # CORONARY_ARTERIES_LMCA_RCA_LCX
    27: ("left_heart_chamber",    "#9E4747", "#C96A6A", 10, 1.68, 0.48), # LA_CAVITY
    28: ("left_heart_chamber",    "#9E4747", "#C96A6A", 10, 1.72, 0.64), # LAA_OSTIUM_AND_LOBES
    29: ("intracardiac_landmark", "#C26D5E", "#D48472", 2,  1.78, 0.80), # COUMADIN_RIDGE
    30: ("left_heart_chamber",    "#9E4747", "#C96A6A", 10, 1.70, 0.58), # LSPV
    31: ("left_heart_chamber",    "#9E4747", "#C96A6A", 10, 1.70, 0.58), # LIPV
    32: ("left_heart_chamber",    "#9E4747", "#C96A6A", 10, 1.70, 0.58), # RSPV
    33: ("left_heart_chamber",    "#9E4747", "#C96A6A", 10, 1.70, 0.58), # RIPV
    34: ("cardiac_valve",         "#DCE2EA", "#FFFFFF", 2,  1.77, 0.85), # MITRAL_VALVE_AML_PML
    35: ("left_heart_chamber",    "#9E4747", "#C96A6A", 10, 1.71, 0.58), # LV_CAVITY_AND_IVS
    36: ("intracardiac_landmark", "#C26D5E", "#D48472", 2,  1.75, 0.76), # LV_PAPILLARY_AL_PM
    37: ("left_heart_chamber",    "#9E4747", "#C96A6A", 3,  1.76, 0.70), # DESCENDING_AORTA
    38: ("coronary_or_esophagus", "#8C5858", "#B87A7A", 3,  1.74, 0.72), # RETROCARDIAC_ESOPHAGUS
    39: ("pericardium",           "#64748B", "#94A3B8", 10, 1.88, 0.92), # PERICARDIAL_SPACE
}


def classify_mesh_to_structure_id(filename: str) -> int:
    """Maps a BodyParts3D / FMA filename to its canonical StructureId (1..37)."""
    low = filename.lower()
    if "fma9236" in low or "crista terminalis" in low:
        return 3
    if "fma49299" in low or "fma49298" in low or "right auricle" in low:
        return 2
    if "fma4720" in low or "superior_vena_cava" in low:
        return 4
    if "fma10951" in low or "inferior_vena_cava" in low:
        return 5
    if "fma9240" in low or "valve of inferior vena cava" in low:
        return 6
    if "fma85237" in low or "anulus proper of tricuspid" in low:
        return 7
    if "fma9242" in low or "valve of coronary sinus" in low:
        return 9
    if "fma4706" in low or "coronary sinus" in low or "cardiac vein" in low or "vein of left ventricle" in low:
        return 8
    if (
        "fma9277" in low or "tendon of todaro" in low
        or "fma77435" in low or "fma9484" in low
        or "fma9478" in low or "fma83331" in low
        or "internodal tract" in low or "atrioventricular" in low and "bundle" in low
    ):
        return 10
    if "fma7108" in low or "interatrial septum" in low:
        return 11
    if "fma84094" in low or "fma84095" in low or "septal wall of right atrium" in low or "septal wall of left atrium" in low:
        return 12
    if "fma7238" in low or "anterior leaflet of tricuspid" in low:
        return 13
    if "fma7240" in low or "septal leaflet of tricuspid" in low:
        return 14
    if "fma7239" in low or "posterior leaflet of tricuspid" in low:
        return 15
    if "fma7272" in low or "septomarginal trabecula" in low:
        return 17
    if "fma7260" in low or "fma7261" in low or "fma7262" in low or "papillary muscle of right ventricle" in low:
        return 18
    if "fma49208" in low or "supraventricular crest" in low or "outflow part of right ventricle" in low:
        return 19
    if "fma7247" in low or "fma7249" in low or "fma7250" in low or "pulmonary valve" in low:
        return 20
    if "fma15086" in low or "fma8612" in low or "fma50873" in low or "fma50872" in low or "pulmonary_trunk" in low or "pulmonary_artery" in low:
        return 21
    # Aortic cusps (BNA to Clinical mapping verified by 3D World centroids):
    # FMA7252 / FMA84617 ("Right posterior" at [+27.9, +20.6, -5.6]) -> NCC (22)
    if "fma7252" in low or "fma84617" in low:
        return 22
    # FMA7253 / FMA9502 ("Anterior cusp" at [+32.3, +21.0, +6.5]) -> RCC (23)
    if "fma7253" in low or "fma9502" in low:
        return 23
    # FMA7254 / FMA84616 ("Left posterior" at [+40.0, +26.2, -3.7]) -> LCC (24)
    if "fma7254" in low or "fma84616" in low:
        return 24
    if "fma23733" in low or "fma15098" in low or "fma3736" in low or "fma3768" in low or "ascending aorta" in low or "bulb of aorta" in low or "arch_of_aorta" in low:
        return 25
    if "fma3784" in low or "descending_aorta" in low:
        return 37
    if "coronary artery" in low or "interventricular artery" in low or "marginal artery" in low:
        return 26
    if "fma9547" in low or "left auricle" in low:
        return 28
    if "fma49916" in low or "left_superior_pulmonary_vein" in low:
        return 30
    if "fma49913" in low or "left_inferior_pulmonary_vein" in low:
        return 31
    if "fma49914" in low or "right_superior_pulmonary_vein" in low:
        return 32
    if "fma49911" in low or "right_inferior_pulmonary_vein" in low:
        return 33
    if "fma7242" in low or "fma7243" in low or "fma9498" in low or "fma9505" in low or "mitral valve" in low or "mitral_valve" in low or "fibrous trigone" in low:
        return 34
    if "fma7264" in low or "fma7266" in low or "papillary muscle of left ventricle" in low or "papillary_muscle_lv" in low:
        return 36
    if "left atrium" in low or "left_atrium" in low:
        return 27
    if "right atrium" in low or "right_atrium" in low:
        return 1
    if "right ventricle" in low or "right_ventricle" in low:
        return 16
    if "left ventricle" in low or "interventricular septum" in low or "atrioventricular septum" in low or "wall_of_ventricle" in low:
        return 35
    return 1


def parse_obj_file(filepath: str):
    """Parses an OBJ file, transforms vertices via body_parts_to_world, welds vertices, and computes normals."""
    raw_verts = []
    raw_faces = []
    with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            if line.startswith("v "):
                parts = line.split()
                if len(parts) >= 4:
                    xb, yb, zb = float(parts[1]), float(parts[2]), float(parts[3])
                    raw_verts.append(body_parts_to_world(xb, yb, zb))
            elif line.startswith("f "):
                parts = line.split()[1:]
                idx = []
                for p in parts:
                    v_str = p.split("/")[0]
                    if v_str:
                        vi = int(v_str)
                        idx.append(vi - 1 if vi > 0 else len(raw_verts) + vi)
                for i in range(1, len(idx) - 1):
                    raw_faces.append((idx[0], idx[i], idx[i + 1]))
    return weld_and_compute_normals(raw_verts, raw_faces)


def parse_stl_file(filepath: str):
    """Parses a binary STL file, transforms vertices via body_parts_to_world, welds vertices, and computes normals."""
    with open(filepath, "rb") as f:
        data = f.read()
    num_tris = struct.unpack("<I", data[80:84])[0]
    raw_verts = []
    raw_faces = []
    for i in range(num_tris):
        off = 84 + i * 50
        vals = struct.unpack("<12fH", data[off:off + 50])
        v0 = body_parts_to_world(vals[3], vals[4], vals[5])
        v1 = body_parts_to_world(vals[6], vals[7], vals[8])
        v2 = body_parts_to_world(vals[9], vals[10], vals[11])
        base_idx = len(raw_verts)
        raw_verts.extend([v0, v1, v2])
        raw_faces.append((base_idx, base_idx + 1, base_idx + 2))
    return weld_and_compute_normals(raw_verts, raw_faces)


def weld_and_compute_normals(raw_verts, raw_faces):
    """Welds vertices at 0.01 mm precision and computes smooth area-weighted vertex normals."""
    vert_map = {}
    welded_verts = []
    remap = [0] * len(raw_verts)

    for i, (vx, vy, vz) in enumerate(raw_verts):
        key = (round(vx * 100), round(vy * 100), round(vz * 100))
        idx = vert_map.get(key)
        if idx is None:
            idx = len(welded_verts)
            vert_map[key] = idx
            welded_verts.append((vx, vy, vz))
        remap[i] = idx

    welded_faces = []
    normals = [[0.0, 0.0, 0.0] for _ in range(len(welded_verts))]

    for i0, i1, i2 in raw_faces:
        a = remap[i0]
        b = remap[i1]
        c = remap[i2]
        if a == b or b == c or c == a:
            continue
        welded_faces.append((a, b, c))
        ax, ay, az = welded_verts[a]
        bx, by, bz = welded_verts[b]
        cx, cy, cz = welded_verts[c]
        ux, uy, uz = bx - ax, by - ay, bz - az
        vx, vy, vz = cx - ax, cy - ay, cz - az
        nx = uy * vz - uz * vy
        ny = uz * vx - ux * vz
        nz = ux * vy - uy * vx
        normals[a][0] += nx
        normals[a][1] += ny
        normals[a][2] += nz
        normals[b][0] += nx
        normals[b][1] += ny
        normals[b][2] += nz
        normals[c][0] += nx
        normals[c][1] += ny
        normals[c][2] += nz

    norm_tuples = []
    for nx, ny, nz in normals:
        length = math.sqrt(nx * nx + ny * ny + nz * nz)
        if length > 1e-8:
            norm_tuples.append((nx / length, ny / length, nz / length))
        else:
            norm_tuples.append((0.0, 1.0, 0.0))

    return welded_verts, norm_tuples, welded_faces


def build_acoustic_volume(visual_meshes, cavity_meshes):
    """
    Generates a 128 x 128 x 128 x 4 RGBA8 acoustic volume covering [-90, +90] mm in X, Y, Z.
    Channels:
      R: Acoustic Impedance byte (48 = blood pool 1.62 MRayl; 72..215 = soft tissue/valves/pericardium)
      G: Backscatter byte (5 = blood pool; 115..235 = myocardium/landmarks/valves/pericardium)
      B: StructureId (0 = blood pool / background, 1..39 = anatomical StructureId)
      A: Border gradient byte (0..255 specular tissue boundary indicator)
    """
    N = 128
    MIN_MM = -90.0
    MAX_MM = 90.0
    SPAN_MM = MAX_MM - MIN_MM
    VOXEL_MM = SPAN_MM / N  # 1.40625 mm

    total_voxels = N * N * N
    vol = bytearray(total_voxels * 4)

    # Initialize background/blood-pool baseline: R=48 (1.62 MRayl), G=5 (0.02), B=0, A=0
    pattern = bytes((48, 5, 0, 0))
    vol[:] = pattern * total_voxels

    def mm_to_idx(val: float) -> int:
        i = int((val - MIN_MM) / VOXEL_MM)
        if i < 0:
            return 0
        if i >= N:
            return N - 1
        return i

    def stamp_sphere(cx: float, cy: float, cz: float, radius_mm: float, struct_id: int, is_shell: bool = False, shell_thick_mm: float = 2.4):
        meta = STRUCTURE_META.get(struct_id, STRUCTURE_META[1])
        imp_z = meta[4]
        back = meta[5]
        r_byte = min(255, max(55, int(round((imp_z - 1.50) * 400.0))))
        g_byte = min(255, max(15, int(round(back * 255.0))))

        ix0 = mm_to_idx(cx - radius_mm - 1.5)
        ix1 = mm_to_idx(cx + radius_mm + 1.5)
        iy0 = mm_to_idx(cy - radius_mm - 1.5)
        iy1 = mm_to_idx(cy + radius_mm + 1.5)
        iz0 = mm_to_idx(cz - radius_mm - 1.5)
        iz1 = mm_to_idx(cz + radius_mm + 1.5)

        r_outer_sq = radius_mm * radius_mm
        r_inner = max(0.0, radius_mm - shell_thick_mm) if is_shell else 0.0
        r_inner_sq = r_inner * r_inner
        border_band = max(1.6, shell_thick_mm * 0.45)

        for iz in range(iz0, iz1 + 1):
            wz = MIN_MM + (iz + 0.5) * VOXEL_MM
            dz = wz - cz
            dz2 = dz * dz
            z_base = iz * N * N
            for iy in range(iy0, iy1 + 1):
                wy = MIN_MM + (iy + 0.5) * VOXEL_MM
                dy = wy - cy
                dyz2 = dz2 + dy * dy
                if dyz2 > r_outer_sq:
                    continue
                yz_base = (z_base + iy * N)
                for ix in range(ix0, ix1 + 1):
                    wx = MIN_MM + (ix + 0.5) * VOXEL_MM
                    dx = wx - cx
                    d2 = dyz2 + dx * dx
                    if d2 <= r_outer_sq and d2 >= r_inner_sq:
                        dist = math.sqrt(d2)
                        edge_dist = min(abs(radius_mm - dist), abs(dist - r_inner) if is_shell else 99.0)
                        grad_byte = 235 if edge_dist <= border_band else 120
                        off = (yz_base + ix) * 4
                        # Higher priority structures (landmarks, valves, septa, coronaries) override generic chamber walls
                        existing_id = vol[off + 2]
                        if existing_id == 0 or existing_id in (1, 16, 27, 35, 39) or g_byte >= vol[off + 1]:
                            vol[off] = r_byte
                            vol[off + 1] = g_byte
                            vol[off + 2] = struct_id
                            vol[off + 3] = grad_byte

    # 1. Stamp analytical hollow chamber shells & key landmarks so every canonical structure (1..39)
    # has guaranteed 3D volumetric presence and realistic wall thicknesses.
    # Outer Pericardial sac shell (39)
    stamp_sphere(24.0, 2.0, 2.0, 66.0, 39, is_shell=True, shell_thick_mm=2.2)

    # Chamber shells: RA (1), RV (16), LA (27), LV (35), RVOT (19), AoRoot (25), MPA (21)
    stamp_sphere(-0.8, 10.7, 0.1, 26.0, 1, is_shell=True, shell_thick_mm=2.8)
    stamp_sphere(33.1, 3.8, 25.0, 30.0, 16, is_shell=True, shell_thick_mm=4.0)
    stamp_sphere(33.5, 21.8, -26.5, 26.0, 27, is_shell=True, shell_thick_mm=3.0)
    stamp_sphere(49.5, -0.5, -0.8, 32.0, 35, is_shell=True, shell_thick_mm=9.5)
    stamp_sphere(42.0, 24.0, 26.0, 16.0, 19, is_shell=True, shell_thick_mm=3.5)
    stamp_sphere(32.8, 24.0, 2.6, 15.5, 25, is_shell=True, shell_thick_mm=2.8)
    stamp_sphere(42.0, 42.0, 18.0, 14.5, 21, is_shell=True, shell_thick_mm=2.4)
    stamp_sphere(4.5, 36.0, -18.0, 11.0, 21, is_shell=True, shell_thick_mm=2.2)   # RPA
    stamp_sphere(56.0, 46.0, -5.0, 10.5, 21, is_shell=True, shell_thick_mm=2.2)   # LPA

    # Venous & arterial conduits: SVC (4), IVC (5), LSPV (30), LIPV (31), RSPV (32), RIPV (33), Desc Ao (37), Esophagus (38)
    for y_step in range(32, 78, 6):
        stamp_sphere(-0.8, float(y_step), -4.6, 10.5, 4, is_shell=True, shell_thick_mm=2.2)
    for y_step in range(-85, -18, 6):
        stamp_sphere(-0.6, float(y_step), -5.4, 11.5, 5, is_shell=True, shell_thick_mm=2.2)
    for y_step in range(-35, 40, 6):
        stamp_sphere(52.0, float(y_step), -56.0, 12.0, 37, is_shell=True, shell_thick_mm=2.5)
        stamp_sphere(28.0, float(y_step), -46.0, 7.5, 38, is_shell=False)

    stamp_sphere(59.9, 38.5, -29.0, 10.0, 30, is_shell=True, shell_thick_mm=2.2)
    stamp_sphere(65.5, 4.1, -40.3, 9.5, 31, is_shell=True, shell_thick_mm=2.2)
    stamp_sphere(-8.0, 26.0, -29.0, 10.0, 32, is_shell=True, shell_thick_mm=2.2)
    stamp_sphere(-10.5, 4.0, -32.0, 9.5, 33, is_shell=True, shell_thick_mm=2.2)

    # Specific high-contrast intracardiac landmarks & valves
    stamp_sphere(1.8, 20.2, 25.2, 11.0, 2, is_shell=True, shell_thick_mm=3.2)   # RAA_PECTINATES
    stamp_sphere(-2.9, 21.6, 13.8, 6.0, 3, is_shell=False)                      # CRISTA_TERMINALIS
    stamp_sphere(4.8, -18.8, -0.1, 5.5, 6, is_shell=False)                      # EUSTACHIAN_RIDGE
    stamp_sphere(8.0, -24.0, 10.0, 7.5, 7, is_shell=False)                      # CTI_FLOOR
    stamp_sphere(17.7, -12.7, -7.4, 6.5, 8, is_shell=True, shell_thick_mm=2.2)  # CORONARY_SINUS_OSTIUM
    stamp_sphere(16.5, -13.2, -5.8, 4.0, 9, is_shell=False)                     # THEBESIAN_VALVE
    stamp_sphere(21.9, -3.1, -2.0, 6.0, 10, is_shell=False)                     # TRIANGLE_OF_KOCH_HIS
    stamp_sphere(9.5, 6.5, -9.5, 6.5, 11, is_shell=False)                       # FOSSA_OVALIS
    stamp_sphere(9.3, 14.5, -8.6, 6.0, 12, is_shell=False)                      # IAS_LIMBUS (superior)
    stamp_sphere(9.3, -2.5, -8.6, 5.5, 12, is_shell=False)                      # IAS_LIMBUS (inferior)
    stamp_sphere(22.0, -8.5, 26.5, 6.5, 13, is_shell=False)                     # TRICUSPID_VALVE_ANT
    stamp_sphere(25.5, -9.5, 17.5, 6.5, 14, is_shell=False)                     # TRICUSPID_VALVE_SEPT
    stamp_sphere(24.0, -14.5, 22.0, 6.0, 15, is_shell=False)                    # TRICUSPID_VALVE_POST
    stamp_sphere(40.9, -17.5, 38.9, 6.5, 17, is_shell=False)                    # MODERATOR_BAND
    stamp_sphere(44.7, -3.6, 29.7, 7.0, 18, is_shell=False)                     # RV_PAPILLARY_MUSCLES
    stamp_sphere(43.9, 28.9, 25.6, 7.0, 20, is_shell=False)                     # PULMONIC_VALVE
    stamp_sphere(26.0, 18.0, -2.0, 5.5, 22, is_shell=False)                     # AORTIC_VALVE_NCC
    stamp_sphere(34.0, 21.0, 11.0, 5.5, 23, is_shell=False)                     # AORTIC_VALVE_RCC
    stamp_sphere(39.0, 21.0, -1.0, 5.5, 24, is_shell=False)                     # AORTIC_VALVE_LCC
    stamp_sphere(43.0, 16.0, -2.0, 4.5, 26, is_shell=False)                     # CORONARY_ARTERIES_LMCA_RCA_LCX
    stamp_sphere(52.0, 29.0, 1.0, 11.5, 28, is_shell=True, shell_thick_mm=2.8)  # LAA_OSTIUM_AND_LOBES
    stamp_sphere(48.0, 31.0, -15.0, 6.0, 29, is_shell=False)                    # COUMADIN_RIDGE
    stamp_sphere(48.1, -6.1, -12.0, 8.5, 34, is_shell=False)                    # MITRAL_VALVE_AML_PML
    stamp_sphere(77.3, -5.4, -1.9, 7.5, 36, is_shell=False)                     # LV_PAPILLARY_AL_PM (AL)
    stamp_sphere(58.0, -22.0, -18.0, 7.5, 36, is_shell=False)                   # LV_PAPILLARY_AL_PM (PM)

    # 2. Rasterize all actual BodyParts3D mesh vertices & triangle centroids into the 128^3 grid
    for mesh in visual_meshes:
        struct_id = mesh["structureId"]
        meta = STRUCTURE_META.get(struct_id, STRUCTURE_META[1])
        imp_z = meta[4]
        back = meta[5]
        r_byte = min(255, max(55, int(round((imp_z - 1.50) * 400.0))))
        g_byte = min(255, max(15, int(round(back * 255.0))))
        verts = mesh["verts"]
        faces = mesh["faces"]

        # Stamp vertices and a 1-voxel neighborhood
        for vx, vy, vz in verts:
            ix = mm_to_idx(vx)
            iy = mm_to_idx(vy)
            iz = mm_to_idx(vz)
            for dz in (-1, 0, 1):
                jz = iz + dz
                if jz < 0 or jz >= N:
                    continue
                z_off = jz * N * N
                for dy in (-1, 0, 1):
                    jy = iy + dy
                    if jy < 0 or jy >= N:
                        continue
                    yz_off = z_off + jy * N
                    for dx in (-1, 0, 1):
                        jx = ix + dx
                        if jx < 0 or jx >= N:
                            continue
                        off = (yz_off + jx) * 4
                        is_center = (dx == 0 and dy == 0 and dz == 0)
                        if is_center or vol[off + 2] == 0:
                            vol[off] = r_byte
                            vol[off + 1] = g_byte
                            vol[off + 2] = struct_id
                            vol[off + 3] = 240 if is_center else 150

        # Stamp triangle centroids
        for i0, i1, i2 in faces:
            ax, ay, az = verts[i0]
            bx, by, bz = verts[i1]
            cx, cy, cz = verts[i2]
            mx = (ax + bx + cx) / 3.0
            my = (ay + by + cy) / 3.0
            mz = (az + bz + cz) / 3.0
            ix = mm_to_idx(mx)
            iy = mm_to_idx(my)
            iz = mm_to_idx(mz)
            off = ((iz * N + iy) * N + ix) * 4
            vol[off] = r_byte
            vol[off + 1] = g_byte
            vol[off + 2] = struct_id
            vol[off + 3] = 245

    return vol


def main():
    os.makedirs(OUT_MODELS_DIR, exist_ok=True)

    mm_dir = os.path.join(
        HEART_ASSETS_DIR,
        "Interactive-3D-Human-Heart-Visualization",
        "data",
        "Postnatal_anatomical_structure",
    )
    fj_dir = os.path.join(HEART_ASSETS_DIR, "bodyparts3d_4_0_complementary_objs")
    stl_dir = os.path.join(HEART_ASSETS_DIR, "papillary_stls")

    mm_files = sorted(glob.glob(os.path.join(mm_dir, "*.obj")))
    fj_files = sorted(glob.glob(os.path.join(fj_dir, "*.obj")))
    stl_files = sorted(glob.glob(os.path.join(stl_dir, "*.stl")))

    # Filter FJ files: keep complementary structures not duplicated in MM (mitral leaflets, aortic cusps,
    # pulmonary veins, venae cavae, ascending/arch/descending aorta, pulmonary trunk/LPA/RPA)
    # and keep cavity meshes separately for acoustic volume generation.
    skip_fj_prefixes = {
        "FJ2417", "FJ2427", "FJ2434",  # Pulmonary valve cusps already in MM604..606
        "FJ2421", "FJ2433", "FJ2436",  # Tricuspid leaflets already in MM569..575
        "FJ2428", "FJ2438", "FJ2439",  # Coarse outer walls already segmented in MM
    }
    cavity_fj_prefixes = {"FJ2422", "FJ2423", "FJ2424", "FJ2425"}

    visual_sources = []
    cavity_sources = []

    for p in mm_files:
        visual_sources.append(("obj", p))
    for p in fj_files:
        base = os.path.basename(p)
        prefix = base.split("_")[0]
        if prefix in cavity_fj_prefixes:
            cavity_sources.append(("obj", p))
        elif prefix not in skip_fj_prefixes:
            visual_sources.append(("obj", p))
    for p in stl_files:
        visual_sources.append(("stl", p))

    positions_f32 = array("f")
    normals_f32 = array("f")
    indices_u32 = array("I")

    manifest_meshes = []
    visual_meshes_for_volume = []

    total_verts = 0
    total_tris = 0

    for mesh_idx, (kind, filepath) in enumerate(visual_sources):
        fname = os.path.basename(filepath)
        stem = os.path.splitext(fname)[0]
        fma_match = re.search(r"(FMA\d+)", stem)
        fma_id = fma_match.group(1) if fma_match else "FMA0000"
        parts = stem.split("_")
        mesh_id = "_".join(parts[:2]) if len(parts) >= 2 else stem
        readable_name = " ".join(parts[3:]) if len(parts) >= 4 else stem.replace("_", " ")

        if kind == "obj":
            verts, norms, faces = parse_obj_file(filepath)
        else:
            verts, norms, faces = parse_stl_file(filepath)

        if not verts or not faces:
            continue

        struct_id = classify_mesh_to_structure_id(fname)
        category, base_hex, rim_hex, render_order, _, _ = STRUCTURE_META.get(
            struct_id, STRUCTURE_META[1]
        )

        v_offset = total_verts
        v_count = len(verts)
        i_offset = total_tris * 3
        i_count = len(faces) * 3

        xs = [v[0] for v in verts]
        ys = [v[1] for v in verts]
        zs = [v[2] for v in verts]
        cx = sum(xs) / v_count
        cy = sum(ys) / v_count
        cz = sum(zs) / v_count
        bmin = [round(min(xs), 2), round(min(ys), 2), round(min(zs), 2)]
        bmax = [round(max(xs), 2), round(max(ys), 2), round(max(zs), 2)]

        for vx, vy, vz in verts:
            positions_f32.extend((vx, vy, vz))
        for nx, ny, nz in norms:
            normals_f32.extend((nx, ny, nz))
        for i0, i1, i2 in faces:
            indices_u32.extend((i0, i1, i2))

        manifest_meshes.append({
            "index": len(manifest_meshes),
            "id": mesh_id,
            "fmaId": fma_id,
            "name": readable_name,
            "structureId": struct_id,
            "category": category,
            "surgicalBaseHex": base_hex,
            "fresnelRimHex": rim_hex,
            "renderOrder": render_order,
            "vertexOffset": v_offset,
            "vertexCount": v_count,
            "indexOffset": i_offset,
            "indexCount": i_count,
            "centroidMm": [round(cx, 2), round(cy, 2), round(cz, 2)],
            "boundsMinMm": bmin,
            "boundsMaxMm": bmax,
        })

        visual_meshes_for_volume.append({
            "structureId": struct_id,
            "verts": verts,
            "faces": faces,
        })

        total_verts += v_count
        total_tris += len(faces)

    # Write heart_atlas.bin
    pos_bytes = positions_f32.tobytes()
    norm_bytes = normals_f32.tobytes()
    idx_bytes = indices_u32.tobytes()

    atlas_bin_path = os.path.join(OUT_MODELS_DIR, "heart_atlas.bin")
    with open(atlas_bin_path, "wb") as f:
        f.write(pos_bytes)
        f.write(norm_bytes)
        f.write(idx_bytes)

    # Write heart_manifest.json
    manifest_data = {
        "version": "1.0.0",
        "coordinateFrame": "Three.js Right-Handed Y-Up (mm), Origin (0,0,0) at Mid-RA Home View",
        "originDescription": "bodyPartsToWorld(xBp, yBp, zBp) = [xBp + 14.0, zBp - 1222.0, -(yBp + 120.0)]",
        "totalVertices": total_verts,
        "totalTriangles": total_tris,
        "vertexByteOffset": 0,
        "normalByteOffset": len(pos_bytes),
        "indexByteOffset": len(pos_bytes) + len(norm_bytes),
        "meshes": manifest_meshes,
        "acousticVolume": {
            "dimensions": [128, 128, 128],
            "boundsMinMm": [-90.0, -90.0, -90.0],
            "boundsMaxMm": [90.0, 90.0, 90.0],
            "channels": ["impedanceZ", "backscatter", "structureId", "borderGradient"],
        },
    }

    manifest_path = os.path.join(OUT_MODELS_DIR, "heart_manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest_data, f, indent=2)

    # Build and write heart_acoustic_volume.bin
    vol_bytes = build_acoustic_volume(visual_meshes_for_volume, cavity_sources)
    vol_path = os.path.join(OUT_MODELS_DIR, "heart_acoustic_volume.bin")
    with open(vol_path, "wb") as f:
        f.write(vol_bytes)

    print(f"Compiled {len(manifest_meshes)} cardiac meshes: {total_verts} vertices, {total_tris} triangles.")
    print(f"  -> {atlas_bin_path} ({os.path.getsize(atlas_bin_path):,} bytes)")
    print(f"  -> {manifest_path} ({os.path.getsize(manifest_path):,} bytes)")
    print(f"  -> {vol_path} ({os.path.getsize(vol_path):,} bytes)")


if __name__ == "__main__":
    main()
