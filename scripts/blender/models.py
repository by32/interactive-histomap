"""Procedural soldiers for the Thermopylae walkthrough, modelled in Blender.

Three archetypes, each in every formation's colourway and at two levels of
detail:
  hoplite  - Corinthian helmet with a low crest, bronze bell cuirass, chiton
             and pteruges, greaves, a convex aspis and a dory with a sauroter
             (Spartans, Thespians, Thebans, allies, Phocians)
  persian  - soft felt tiara, sleeved tunic and trousers, wicker spara,
             short spear with a counterweight, bow case (host, Medes)
  immortal - long robe, fillet, spear with a golden pomegranate butt,
             bow and quiver (Herodotus 7.41, 7.61, 7.83)

The page animates figures with a vertex-shader rig (src/thermopylae/soldier.ts),
so the models keep its contract, in metres before FIGURE_SIZE:
  - feet on the ground, +z (three.js) is the soldier's front
  - hips at 0.78 m, shoulders at 1.325 m, weapon hand at (0.36, 1.1125, 0.075)
  - `gait` per vertex: 0 body, legs -1/+1, arms -2/+2 (the shield moves
    with the left arm, -2), spear 3, sword 4
  - `metal` per vertex, 0..1
Coordinates below are written in that three.js-local frame and converted
once, by P(), to Blender's (x, -z, y).

  python scripts/blender/run.py models [--out public/thermopylae/models/soldiers.glb] [--preview file.png]
"""
import math
import os

import bpy  # noqa: I001 - bpy must load before bmesh when running as a module
import bmesh
import numpy as np
from mathutils import Matrix, Vector

from common.io import SceneData

BRONZE = 0xB59057
DARK_BRONZE = 0x78613E
SKIN = 0xB38463
LEATHER = 0x4B3426
LINEN = 0xD9CDB0
HAIR = 0x2E2620
IRON = 0x8E9089
WOOD = 0x6B4D2E
GOLD = 0xC9A24A
WICKER = 0xA78A50
FELT = 0x9C8964


def srgb(hex_or_rgb):
    """sRGB hex -> linear rgb (glTF COLOR_0 and three.js vertex colours are linear)."""
    if isinstance(hex_or_rgb, (list, tuple)):
        return tuple(hex_or_rgb[:3])
    c = [((hex_or_rgb >> s) & 255) / 255 for s in (16, 8, 0)]
    return tuple(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c)


def shade(rgb, k):
    return tuple(min(1.0, v * k) for v in rgb)


def P(x, y, z):
    """three.js-local (x right, y up, z front) -> Blender (x, -z, y)"""
    return Vector((x, -z, y))


class Figure:
    """Accumulates parts into one mesh with per-vertex colour, gait and metal."""

    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.colors, self.gait, self.metal = [], [], []

    def _extend(self, n_before, faces_before, color, gait, metal, smooth):
        n = len(self.bm.verts) - n_before
        self.colors += [color] * n
        self.gait += [gait] * n
        self.metal += [metal] * n
        self.bm.faces.ensure_lookup_table()
        for f in self.bm.faces[faces_before:]:
            f.smooth = smooth

    def add_bmesh(self, part, color, gait=0, metal=0.0, smooth=True):
        me = bpy.data.meshes.new("part")
        part.to_mesh(me)
        part.free()
        self.add_mesh(me, color, gait, metal, smooth)

    def add_mesh(self, me, color, gait=0, metal=0.0, smooth=True):
        n0, f0 = len(self.bm.verts), len(self.bm.faces)
        self.bm.from_mesh(me)
        bpy.data.meshes.remove(me)
        self._extend(n0, f0, srgb(color), gait, metal, smooth)

    def to_object(self):
        me = bpy.data.meshes.new(self.name)
        self.bm.to_mesh(me)
        self.bm.free()
        n = len(me.vertices)
        assert n == len(self.colors), (n, len(self.colors))
        col = me.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
        col.data.foreach_set("color", np.array([(*c, 1.0) for c in self.colors], dtype=np.float32).ravel())
        me.color_attributes.active_color = col
        me.attributes.new("_gait", "FLOAT", "POINT").data.foreach_set("value", np.array(self.gait, dtype=np.float32))
        me.attributes.new("_metal", "FLOAT", "POINT").data.foreach_set("value", np.array(self.metal, dtype=np.float32))
        obj = bpy.data.objects.new(self.name, me)
        bpy.context.scene.collection.objects.link(obj)
        return obj

    @property
    def tris(self):
        return sum(len(f.verts) - 2 for f in self.bm.faces)


# ---------- primitive builders (all in three.js-local coordinates) ----------

def lathe(profile, segments, center=(0, 0, 0), sx=1.0, sz=1.0, cap_bottom=True, cap_top=True, twist=0.0):
    """Rings of (y, r) about a vertical axis; elliptical with sx, sz."""
    bm = bmesh.new()
    rings = []
    for y, r in profile:
        ring = []
        for i in range(segments):
            a = 2 * math.pi * i / segments + twist
            ring.append(bm.verts.new(P(center[0] + math.sin(a) * r * sx, center[1] + y, center[2] + math.cos(a) * r * sz)))
        rings.append(ring)
    for r0, r1 in zip(rings, rings[1:]):
        for i in range(segments):
            j = (i + 1) % segments
            bm.faces.new((r0[i], r0[j], r1[j], r1[i]))
    if cap_bottom and profile[0][1] > 1e-4:
        bm.faces.new(list(reversed(rings[0])))
    if cap_top and profile[-1][1] > 1e-4:
        bm.faces.new(rings[-1])
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def box(size, center, rot=None):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    m = Matrix.Diagonal((size[0], size[2], size[1], 1.0))  # three (x, y, z) sizes -> Blender (x, z-depth, y-height)
    if rot is not None:
        m = rot @ m
    bmesh.ops.transform(bm, matrix=Matrix.Translation(P(*center)) @ m, verts=bm.verts)
    return bm


def sphere(radius, center, segments=10, rings=6, scale=(1, 1, 1)):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=rings, radius=radius)
    s = Matrix.Diagonal((scale[0], scale[2], scale[1], 1.0))
    bmesh.ops.transform(bm, matrix=Matrix.Translation(P(*center)) @ s, verts=bm.verts)
    return bm


def rod(a, b, r0, r1, segments=6):
    """A tapered cylinder between two three.js-local points."""
    bm = bmesh.new()
    pa, pb = P(*a), P(*b)
    d = pb - pa
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segments, radius1=r0, radius2=r1, depth=d.length)
    rot = d.to_track_quat("Z", "Y").to_matrix().to_4x4()
    bmesh.ops.transform(bm, matrix=Matrix.Translation((pa + pb) / 2) @ rot, verts=bm.verts)
    return bm


def tube(points, radii, segments=8, cap=True):
    """A round tube swept through three.js-local joints, with a rotation-minimising
    frame so it never twists; smooth-shaded it reads as a limb, not a prism."""
    bm = bmesh.new()
    pts = [P(*p) for p in points]
    n = len(pts)
    tangents = []
    for i in range(n):
        a = pts[max(0, i - 1)]
        b = pts[min(n - 1, i + 1)]
        tangents.append((b - a).normalized())
    ref = Vector((1, 0, 0)) if abs(tangents[0].x) < 0.9 else Vector((0, 1, 0))
    normal = tangents[0].cross(ref).normalized()
    rings = []
    for i, (p, t) in enumerate(zip(pts, tangents)):
        normal = (normal - t * normal.dot(t)).normalized()  # parallel transport
        binormal = t.cross(normal)
        r = radii[i] if isinstance(radii[i], (tuple, list)) else (radii[i], radii[i])
        ring = [bm.verts.new(p + normal * math.cos(a) * r[0] + binormal * math.sin(a) * r[1])
                for a in (2 * math.pi * k / segments for k in range(segments))]
        rings.append(ring)
    for r0, r1 in zip(rings, rings[1:]):
        for k in range(segments):
            j = (k + 1) % segments
            bm.faces.new((r0[k], r0[j], r1[j], r1[k]))
    if cap:
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


# ---------- the archetypes ----------

def legs(fig, detail, colour, shin=None, shoe=LEATHER, radii=(0.085, 0.058, 0.045)):
    seg = 10 if detail else 5
    for side in (-1, 1):
        x = side * 0.115
        # hip, mid-thigh, knee, calf, ankle: a slight bend and a calf that swells
        fig.add_bmesh(tube([(x, 0.80, 0.0), (x, 0.63, 0.015), (x, 0.46, 0.03), (x, 0.33, 0.0), (x, 0.11, 0.0)],
                           (radii[0], radii[0] * 0.88, radii[1], radii[1] * 1.08, radii[2]), seg), colour, gait=side)
        if shin is not None and detail:
            # greaves: a bronze shell over the shin, moving with the leg
            fig.add_bmesh(tube([(x, 0.47, 0.035), (x, 0.33, 0.006), (x, 0.13, 0.004)], (0.064, 0.07, 0.052), seg), shin, gait=side, metal=0.72)
        if detail:
            fig.add_bmesh(sphere(1.0, (x, 0.045, 0.055), 8, 5, scale=(0.055, 0.045, 0.12)), shoe, gait=side)
        else:
            fig.add_bmesh(box((0.09, 0.06, 0.21), (x, 0.03, 0.05)), shoe, gait=side, smooth=False)


def arm(fig, side, detail, sleeve, hand_at, elbow, radii=(0.058, 0.048, 0.04)):
    shoulder = (side * 0.235, 1.36, 0.0)
    mid = tuple((a + b) / 2 for a, b in zip(shoulder, elbow))
    fig.add_bmesh(tube([shoulder, mid, elbow, hand_at], (radii[0], radii[0] * 0.95, radii[1], radii[2]), 10 if detail else 5), sleeve, gait=2 * side)
    if detail:
        fig.add_bmesh(sphere(0.043, hand_at, 8, 5), SKIN, gait=2 * side)


def head(fig, detail, beard=False, helmeted=False):
    if helmeted and not detail:
        return
    seg = 10 if detail else 6
    if detail:
        fig.add_bmesh(rod((0, 1.39, 0), (0, 1.52, 0.01), 0.055, 0.05, 8), SKIN)
    fig.add_bmesh(sphere(0.112, (0, 1.61, 0.012), seg, 7 if detail else 4, scale=(0.92, 1.1, 1.0)), SKIN)
    if beard and detail:
        fig.add_bmesh(sphere(0.07, (0, 1.53, 0.08), seg, 5 if detail else 3, scale=(1.0, 1.1, 0.7)), HAIR)


def hoplite(group_colour, detail):
    fig = Figure("hoplite")
    seg = 12 if detail else 6
    legs(fig, detail, SKIN, shin=BRONZE)
    # chiton skirt in the formation's colour, pteruges over it
    fig.add_bmesh(lathe([(0.60, 0.215), (0.74, 0.205), (0.90, 0.19)], seg, sx=1.0, sz=0.8), group_colour)
    if detail:
        for i in range(10):
            a = 2 * math.pi * (i + 0.5) / 10
            rot = Matrix.Rotation(a, 4, "Z")
            fig.add_bmesh(box((0.075, 0.19, 0.015), (math.sin(a) * 0.212, 0.79, math.cos(a) * 0.175), rot), 0xA8956C, smooth=False)
    # bronze bell cuirass: flared hem, swelling chest, sloping shoulders
    cuirass = [(0.86, 0.215), (0.92, 0.2), (1.05, 0.215), (1.2, 0.24), (1.33, 0.225), (1.40, 0.12)] if detail else [(0.86, 0.21), (1.2, 0.24), (1.40, 0.12)]
    fig.add_bmesh(lathe(cuirass, seg, sx=1.0, sz=0.72), BRONZE, metal=0.78)
    head(fig, detail, helmeted=True)
    # Corinthian helmet: an elongated dome with cheek pieces and a T-shaped face opening
    helm = sphere(0.138, (0, 1.63, 0.0), 12 if detail else 6, 9 if detail else 4, scale=(0.96, 1.2, 1.1))
    doomed = []
    for f in helm.faces:
        c = f.calc_center_median()
        x, y, z = c.x, c.z, -c.y  # back to three-local
        if y < 1.47:
            doomed.append(f)
        elif detail and z > 0.06 and ((abs(x) < 0.03 and y < 1.60) or (0.025 < abs(x) < 0.1 and 1.59 < y < 1.65)):
            doomed.append(f)
    bmesh.ops.delete(helm, geom=doomed, context="FACES")
    fig.add_bmesh(helm, BRONZE, metal=0.8)
    # a low longitudinal horsehair crest
    if detail:
        # horsehair on a curved holder: tall and thin, following the dome front to back
        fig.add_bmesh(tube([(0, 1.77, 0.15), (0, 1.84, 0.09), (0, 1.87, 0.0), (0, 1.84, -0.1), (0, 1.74, -0.19)],
                           ((0.02, 0.008), (0.05, 0.016), (0.06, 0.018), (0.055, 0.016), (0.03, 0.01)), 8), HAIR)
    else:
        fig.add_bmesh(box((0.035, 0.09, 0.28), (0, 1.83, -0.01)), HAIR, smooth=False)
    # arms: the right carries the spear, the left holds the aspis by its porpax
    arm(fig, 1, detail, SKIN, (0.36, 1.1125, 0.075), (0.31, 1.15, -0.04))
    arm(fig, -1, detail, SKIN, (-0.30, 1.14, 0.22), (-0.33, 1.13, 0.08))
    # aspis: a convex bronze-faced dish, rim, and the formation's colour as a blazon ring
    dish = lathe([(0.0, 0.46), (0.05, 0.40), (0.085, 0.24), (0.095, 0.0)] if detail else [(0.0, 0.46), (0.07, 0.3), (0.095, 0.0)], 16 if detail else 8, cap_bottom=False)
    fig.add_bmesh(_face_forward(dish, (-0.34, 1.14, 0.25)), DARK_BRONZE, gait=-2, metal=0.55)
    if detail:
        ring = lathe([(0.012, 0.475), (0.012, 0.43)], 16, cap_bottom=False, cap_top=False)
        fig.add_bmesh(_face_forward(ring, (-0.34, 1.14, 0.25)), BRONZE, gait=-2, metal=0.85)
        blazon = lathe([(0.0, 0.30), (0.0, 0.22)], 16, cap_bottom=False, cap_top=False)
        fig.add_bmesh(_face_forward(blazon, (-0.34, 1.14, 0.335)), shade(srgb(group_colour), 0.9), gait=-2, metal=0.1)
    else:
        blazon = lathe([(0.0, 0.3), (0.01, 0.0)], 10, cap_bottom=True, cap_top=False)
        fig.add_bmesh(_face_forward(blazon, (-0.34, 1.14, 0.345)), group_colour, gait=-2)
    # dory: ash shaft tilted back, leaf head, bronze sauroter at the butt
    tilt = -0.15
    def spear_pt(y):  # the page's rotateX(-0.15) about the grip at (0.36, 1.55, 0.08)
        dy = y - 1.55
        return (0.36, 1.55 + dy * math.cos(tilt), 0.08 + dy * math.sin(tilt))
    fig.add_bmesh(rod(spear_pt(0.36), spear_pt(2.74), 0.022, 0.018, 7 if detail else 4), WOOD, gait=3)
    fig.add_bmesh(rod(spear_pt(2.72), spear_pt(2.98), 0.042, 0.002, 6 if detail else 3), IRON, gait=3, metal=0.8)
    if detail:
        fig.add_bmesh(rod(spear_pt(0.20), spear_pt(0.37), 0.004, 0.024, 6), BRONZE, gait=3, metal=0.75)
    # xiphos, drawn only when spears break (the rig hides it until then)
    fig.add_bmesh(rod((0.36, 1.20, 0.10), (0.36, 1.74, 0.10), 0.03, 0.005, 4 if detail else 3), IRON, gait=4, metal=0.85)
    if detail:
        fig.add_bmesh(box((0.13, 0.04, 0.05), (0.36, 1.19, 0.10)), BRONZE, gait=4, metal=0.7, smooth=False)
        fig.add_bmesh(rod((0.20, 1.0, -0.02), (0.26, 0.60, 0.02), 0.03, 0.025, 5), LEATHER)  # scabbard on the hip
    return fig


def persian(group_colour, detail, immortal=False):
    fig = Figure("immortal" if immortal else "persian")
    seg = 12 if detail else 6
    dark = shade(srgb(group_colour), 0.72)
    legs(fig, detail, dark, radii=(0.092, 0.066, 0.052))
    if immortal:
        # a long pleated robe to the ankles, with broad sleeves
        fig.add_bmesh(lathe([(0.12, 0.30), (0.45, 0.26), (0.80, 0.215), (1.0, 0.205), (1.22, 0.235), (1.36, 0.22), (1.41, 0.11)], seg, sx=1.0, sz=0.78), group_colour)
        sleeve_r = (0.075, 0.07, 0.06)
    else:
        fig.add_bmesh(lathe([(0.55, 0.245), (0.78, 0.215), (1.0, 0.205), (1.22, 0.235), (1.36, 0.22), (1.41, 0.11)], seg, sx=1.0, sz=0.78), group_colour)
        sleeve_r = (0.062, 0.052, 0.044)
    fig.add_bmesh(lathe([(0.93, 0.212), (0.99, 0.212)], seg, sx=1.0, sz=0.8), LEATHER)  # belt
    head(fig, detail, beard=True)
    if immortal:
        # a twisted fillet over dressed hair
        fig.add_bmesh(sphere(0.12, (0, 1.64, -0.02), seg, 6 if detail else 4, scale=(0.95, 0.8, 1.0)), HAIR)
        fig.add_bmesh(lathe([(1.66, 0.121), (1.70, 0.121)], seg, sx=0.95, sz=1.0, cap_bottom=False, cap_top=False), GOLD, metal=0.8)
    else:
        # soft felt tiara with its chin and neck flaps
        fig.add_bmesh(sphere(0.135, (0.0, 1.66, -0.01), seg, 7 if detail else 4, scale=(1.0, 1.35, 1.05)), FELT)
        fig.add_bmesh(box((0.30, 0.16, 0.05), (0, 1.53, -0.09)), FELT, smooth=False)
    arm(fig, 1, detail, group_colour, (0.35, 1.10, 0.06), (0.31, 1.14, -0.04), sleeve_r)
    arm(fig, -1, detail, group_colour, (-0.28, 1.12, 0.22), (-0.32, 1.12, 0.08), sleeve_r)
    if not immortal:
        # spara: a tall wicker shield, ribbed when seen close
        fig.add_bmesh(box((0.50, 0.96, 0.04), (-0.30, 0.93, 0.32)), WICKER, gait=-2, smooth=False)
        if detail:
            for row in range(9):
                fig.add_bmesh(box((0.51, 0.025, 0.02), (-0.30, 0.52 + row * 0.1, 0.345)), shade(srgb(WICKER), 1.25), gait=-2, smooth=False)
    # short spear with a counterweight: golden "apple" for the Immortals
    fig.add_bmesh(rod((0.35, 0.45, 0.055), (0.35, 2.27, 0.055), 0.021, 0.017, 7 if detail else 4), WOOD, gait=3)
    fig.add_bmesh(rod((0.35, 2.25, 0.055), (0.35, 2.44, 0.055), 0.038, 0.002, 6 if detail else 3), IRON, gait=3, metal=0.75)
    fig.add_bmesh(sphere(0.045 if immortal else 0.035, (0.35, 0.45, 0.055), 8 if detail else 4, 5 if detail else 3), GOLD if immortal else BRONZE, gait=3, metal=0.85)
    # bow case (gorytos) on the left hip, quiver on the back
    fig.add_bmesh(rod((-0.18, 1.05, -0.2), (-0.26, 0.55, -0.12), 0.07, 0.05, 6 if detail else 4), LEATHER)
    if immortal or detail:
        fig.add_bmesh(rod((0.10, 1.45, -0.21), (0.16, 0.95, -0.2), 0.055, 0.05, 6 if detail else 4), shade(srgb(LEATHER), 1.3))
    return fig


def _face_forward(bm, center):
    """Lathed discs are built about three-local +y (Blender +Z); turn them to face
    the soldier's front, three-local +z (Blender -Y), and move them to center."""
    rot = Matrix.Rotation(math.pi / 2, 4, "X")
    bmesh.ops.transform(bm, matrix=Matrix.Translation(P(*center)) @ rot, verts=bm.verts)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


# ---------- build, export, preview ----------

ARCHETYPE = {"greek": "hoplite", "persian": "persian"}


def build_all(data):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    objects = []
    for g in data["groups"]:
        colour = tuple(g["color"])
        for lod, detail in (("LOD0", 1), ("LOD1", 0)):
            if g["side"] == "greek":
                fig = hoplite(colour, detail)
            else:
                fig = persian(colour, detail, immortal=g["id"] == "immortals")
            fig.name = f"{g['id']}_{lod}"
            tris = fig.tris
            obj = fig.to_object()
            obj["tris"] = tris
            objects.append(obj)
            print(f"  {obj.name:18s} {tris:5d} tris")
    return objects


def export(objects, out):
    from common.glb import mesh_arrays, write_glb

    os.makedirs(os.path.dirname(out), exist_ok=True)
    write_glb(out, [(o.name, mesh_arrays(o)) for o in objects])
    print(f"  wrote {out} ({os.path.getsize(out) / 1024:.0f} KB)")


def main(argv):
    out = "public/thermopylae/models/soldiers.glb"
    preview = None
    if "--out" in argv:
        out = argv[argv.index("--out") + 1]
    if "--preview" in argv:
        preview = argv[argv.index("--preview") + 1]
    data = SceneData()
    objects = build_all(data)
    for o in objects:
        assert o["tris"] <= (2000 if o.name.endswith("LOD0") else 480), f"{o.name} is over its triangle budget"
    export(objects, out)
    if preview:
        import preview as pv

        pv.lineup(objects, preview)
    return 0
