"""Soldiers for the Thermopylae walkthrough, modelled in Blender on a real body.

Every figure is Blender Studio's realistic male base mesh (CC0; see
common/body.py), posed with the right hand on the spear and the left forearm
under the shield, and dressed with clothing and armour cut from its own
surface (common/dress.py):
  hoplite  - Corinthian helmet with a crest, bronze cuirass with shoulder
             guards, chiton and pteruges, greaves, a bronze-faced aspis and a
             dory with a sauroter (Spartans, Thespians, Thebans, allies, Phocians)
  persian  - soft felt tiara, sleeved tunic and trousers, a bowed wicker spara,
             short spear with a counterweight, bow case (host, Medes)
  immortal - long robe with bordered hem and cuffs, fillet, spear with a golden
             pomegranate butt, quiver and bow case (Herodotus 7.41, 7.61, 7.83)

Dress follows the period rather than a uniform: undyed linen and madder, aged
bronze, dyed Persian wool. A formation shows in one muted accent (the shield's
blazon, the tiara, the robe's borders), which is also its colour in the
legend. The page varies each figure's tone a little on top.

The page animates figures with a vertex-shader rig (src/thermopylae/soldier.ts).
Each mesh carries, per vertex, `gait` (0 body, +-1 legs, +-2 arms with the
shield on -2, spear 3, sword 4), `metal` (0..1) and `weight` (how far a vertex
follows its limb), and each object the joints the rig pivots on (`rig`: hip
and shoulder (y, z), weapon hand (x, y, z), metres in the page's frame before
FIGURE_SIZE). Feet stand on the ground and +z (three.js) is the front.

  python scripts/blender/run.py models [--out public/thermopylae/models/soldiers.glb] [--preview file.png]
"""
import math
import os

import bpy  # noqa: I001 - bpy must load before bmesh when running as a module
import bmesh
import numpy as np
from mathutils import Matrix, Vector

from common.dress import Body, Part, decimate, from_bmesh, occlusion, smooth, srgb, to_blender, vertex_normals
from common.io import SceneData

SKIN_GREEK = 0xA07052
SKIN_PERSIAN = 0x946548
BRONZE = 0x86683F
BRONZE_DARK = 0x7C603F
LEATHER = 0x4A3727
LINEN = 0xC4B393
MADDER = 0x7E3226
HORSEHAIR = 0x2A221D
SPARTAN_CREST = 0x5E231C
IRON = 0x6F706A
WOOD = 0x6A4F33
GOLD = 0xA88A45
WICKER = 0x8C7447
HAIR = 0x221A15
PTERUGES = 0x8A6F4E
DRESS = {
    # Persian formations: tunic (or robe), trousers
    "host": (0x876646, 0x4F4032),
    "medes": (0x6E5A40, 0x5A4632),
    "immortals": (0xA88F63, 0x4F4032),
}
BUDGET = {"LOD0": 2400, "LOD1": 500}


def P(x, y, z):
    """three.js-local (x right, y up, z front) -> Blender (x, -z, y)"""
    return Vector((x, -z, y))


def muted(color):
    """A formation's accent: its legend colour, desaturated and darkened to a plausible dye."""
    c = srgb(color)
    grey = np.full(3, c @ np.array([0.2126, 0.7152, 0.0722]))
    return (grey + (c - grey) * 0.72) * 0.72


class Figure:
    """Parts gathered into one mesh with per-vertex colour, gait, metal and weight."""

    def __init__(self, name, rig):
        self.name = name
        self.rig = rig
        self.parts = []

    def add(self, part):
        self.parts.append(part)
        return part

    def add_bmesh(self, bm, color, gait=0.0, metal=0.0, weight=1.0, smooth=True):
        return self.add(from_bmesh(bm, color, gait, metal, weight, smooth))

    def fit(self, budget):
        """Decimate the body-drawn parts together to bring the figure within budget."""
        fixed = sum(p.tri_count for p in self.parts if not p.decimate)
        source = self.parts
        target = budget
        # collapse decimation lands near, not on, its ratio: tighten until within budget
        for _ in range(6):
            flexible = sum(p.tri_count for p in source if p.decimate)
            self.parts = [decimate(p, min(1.0, (target - fixed) / max(flexible, 1))) for p in source]
            if self.tris <= budget:
                return
            target -= self.tris - budget + 4
        raise AssertionError(f"{self.name}: cannot fit {budget} triangles")

    @property
    def tris(self):
        return sum(p.tri_count for p in self.parts)

    def to_object(self, shade=True):
        verts, tris, col, gait, metal, weight, smooth_flags = [], [], [], [], [], [], []
        base = 0
        for p in self.parts:
            verts.append(p.verts)
            tris.append(p.tris + base)
            col.append(p.color)
            gait.append(p.gait)
            metal.append(p.metal)
            weight.append(p.weight)
            smooth_flags.append(np.full(p.tri_count, p.smooth))
            base += len(p.verts)
        verts, tris = np.concatenate(verts), np.concatenate(tris)
        col = np.concatenate(col)
        if shade:
            # folds, armpits and the space under the helmet darken, as in the renders
            ao = occlusion(verts, tris, vertex_normals(verts, tris))
            col = col * (0.45 + 0.55 * ao)[:, None]
        me = bpy.data.meshes.new(self.name)
        me.from_pydata(verts.tolist(), [], tris.tolist())
        me.polygons.foreach_set("use_smooth", np.concatenate(smooth_flags))
        me.update()
        rgba = np.concatenate([col, np.ones((len(col), 1))], axis=1).astype(np.float32)
        attr = me.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
        attr.data.foreach_set("color", rgba.ravel())
        me.color_attributes.active_color = attr
        for name, values in (("_gait", gait), ("_metal", metal), ("_weight", weight)):
            me.attributes.new(name, "FLOAT", "POINT").data.foreach_set("value", np.concatenate(values).astype(np.float32))
        obj = bpy.data.objects.new(self.name, me)
        bpy.context.scene.collection.objects.link(obj)
        obj["rig"] = self.rig
        obj["tris"] = len(tris)
        return obj


# ---------- primitive builders (three.js-local coordinates) ----------

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

def _shoulders(b):
    sx, sy, sz = b.shoulder
    return np.minimum(np.linalg.norm(b.t - (sx, sy, sz), axis=1), np.linalg.norm(b.t - (-sx, sy, sz), axis=1))


HEAD_Z = 0.055  # the head's centre lies a little forward of the body's axis


def _crest_path(b):
    """The helmet's crown line, front to back, just above the head."""
    pts = []
    for z in np.linspace(0.12, -0.06, 7):
        pick = (np.abs(b.x) < 0.02) & (np.abs(b.z - z) < 0.02) & (b.y > b.top - 0.2)
        pts.append((0.0, float(b.y[pick].max()) + 0.03, float(z)))
    return pts


def _spear(fig, b, detail, length, below, tip, butt, butt_colour=BRONZE):
    """A shaft upright through the spear hand, its head leaning a touch forward."""
    gx, gy, gz = b.joints["grip"]
    tilt = 0.05

    def at(dy):
        return (gx, gy + dy * math.cos(tilt), gz + dy * math.sin(tilt))

    top = length - below
    fig.add_bmesh(rod(at(-below), at(top), 0.017, 0.014, 7 if detail else 4), WOOD, gait=3)
    fig.add_bmesh(rod(at(top - 0.02), at(top + tip), 0.03, 0.002, 6 if detail else 3), IRON, gait=3, metal=0.8)
    if butt == "spike" and detail:
        fig.add_bmesh(rod(at(-below - 0.16), at(-below + 0.01), 0.003, 0.02, 6), butt_colour, gait=3, metal=0.75)
    elif butt == "ball":
        fig.add_bmesh(sphere(0.04, at(-below), 8 if detail else 4, 5 if detail else 3), butt_colour, gait=3, metal=0.85)
    # the sword, shown only when the spears break (the rig hides it until then)
    fig.add_bmesh(rod((gx, gy, gz), (gx, gy + 0.52, gz), 0.026, 0.004, 4 if detail else 3), IRON, gait=4, metal=0.85)


def _shield_centre(b, forward):
    """In front of the left forearm's middle, where the arm passes behind the shield."""
    elbow, wrist = b.joints["forearm.L"]
    mid = (np.asarray(elbow) + np.asarray(wrist)) / 2
    return (float(mid[0]) - 0.1, float(mid[1]), float(max(mid[2], np.asarray(wrist)[2])) + forward)


def _rig(b):
    hip, sh, grip = b.joints["hip"], b.shoulder, b.joints["grip"]
    return {"hip": [float(hip[1]), float(hip[2])], "shoulder": [float(sh[1]), float(sh[2])], "hand": [float(v) for v in grip]}


def hoplite(b, group, detail):
    fig = Figure("hoplite", _rig(b))
    x, y, z, arms, legs = b.x, b.y, b.z, b.arms, b.legs
    accent = muted(group["color"])
    spartan = group["id"] == "spartans"
    chiton = MADDER if spartan else LINEN
    shoulders = _shoulders(b)
    neck = b.joints["shoulder"][1] + 0.06
    trunk = ~arms & (y > 0.97) & (y < neck)
    head = ~arms & (y > 1.465)
    eyes = (np.abs(x) < 0.075) & (y > 1.595) & (y < 1.645)
    mouth = (np.abs(x) < 0.028) & (y > 1.48) & (y < 1.595)
    nose_guard = (np.abs(x) < 0.013) & (y > 1.56)
    face = (z > HEAD_Z + 0.04) & (eyes | mouth) & ~nose_guard
    helmet = head & ~face | (~arms & (z < HEAD_Z - 0.02) & (y > 1.43))
    inside = (z > HEAD_Z + 0.02) & (np.abs(x) < 0.085) & (y > 1.47) & (y < 1.665)
    sleeve = arms & (shoulders < 0.2)
    greave = legs & (y > 0.12) & (y < 0.52)

    covered = (trunk & (y < neck - 0.03)) | (~arms & (y > 0.62) & (y < 0.98)) | (arms & (shoulders < 0.17)) | (legs & (y > 0.15) & (y < 0.49)) | (helmet & ~inside)
    fig.add(b.skin(covered, SKIN_GREEK))
    fig.add(b.shell(sleeve, 0.012, chiton))
    fig.add(b.skirt(0.99, 0.62 if detail else 0.64, chiton, pad=0.03, flare=0.05, rings=6 if detail else 3, segments=20 if detail else 10))
    # pteruges: stiff strips of linen and leather hanging below the cuirass
    fig.add(b.skirt(0.99, 0.80, PTERUGES, pad=0.05, flare=0.035, rings=3 if detail else 2, segments=24 if detail else 10,
                    colour_at=lambda v: srgb(PTERUGES) * (1.25 if int((math.atan2(v[0], v[2]) + math.pi) / (2 * math.pi) * 24) % 2 else 0.85)))
    fig.add(b.shell(trunk, 0.03, BRONZE, metal=0.72))
    fig.add(b.shell(arms & (shoulders < 0.13), 0.036, BRONZE, metal=0.72))
    fig.add(b.shell(greave, 0.014, BRONZE, metal=0.7))
    fig.add(b.shell(legs & (y < 0.05), 0.006, LEATHER))
    # Corinthian helmet: the head's shell with a T-shaped face opening, its
    # cheek pieces and neck guard flaring out below
    radial = np.stack([x, np.zeros_like(x), z - HEAD_Z], axis=1)
    radial /= np.maximum(np.linalg.norm(radial, axis=1, keepdims=True), 1e-6)
    flare = smooth(1.56, 1.45, y)[:, None] * 0.05 * radial
    dome = np.stack([np.zeros_like(y), np.maximum(y - 1.63, 0) * 0.25, np.zeros_like(y)], axis=1)
    fig.add(b.shell(helmet, 0.022, BRONZE, metal=0.8, grow=flare + dome))
    crest = _crest_path(b)
    if detail:
        heights = (0.03, 0.07, 0.085, 0.08, 0.06, 0.045, 0.025)
        fig.add_bmesh(tube([(0, py + h * 0.55, pz) for (_, py, pz), h in zip(crest, heights)],
                           [(h * 0.55, 0.018) for h in heights], 8), SPARTAN_CREST if spartan else HORSEHAIR)
    else:
        fig.add_bmesh(box((0.035, 0.08, 0.3), (0, crest[3][1] + 0.04, crest[3][2])), SPARTAN_CREST if spartan else HORSEHAIR, smooth=False)
    # aspis: a convex bronze-faced dish with a rim and the formation's blazon
    centre = _shield_centre(b, 0.11)
    dish = lathe([(0.0, 0.45), (0.05, 0.40), (0.085, 0.24), (0.095, 0.0)] if detail else [(0.0, 0.46), (0.07, 0.3), (0.095, 0.0)], 20 if detail else 8, cap_bottom=False)
    fig.add_bmesh(_face_forward(dish, centre), BRONZE_DARK, gait=-2, metal=0.3)
    front = (centre[0], centre[1], centre[2] + 0.097)
    if detail:
        ring = lathe([(0.012, 0.47), (0.012, 0.43)], 20, cap_bottom=False, cap_top=False)
        fig.add_bmesh(_face_forward(ring, centre), BRONZE, gait=-2, metal=0.85)
        blazon = lathe([(0.0, 0.22), (0.0, 0.0)], 16, cap_bottom=False, cap_top=False)
        fig.add_bmesh(_face_forward(blazon, front), accent, gait=-2)
    else:
        blazon = lathe([(0.0, 0.24), (0.005, 0.0)], 8, cap_bottom=True, cap_top=False)
        fig.add_bmesh(_face_forward(blazon, front), accent, gait=-2)
    _spear(fig, b, detail, 2.5, 0.95, 0.24, "spike")
    return fig


def persian(b, group, detail, immortal=False):
    fig = Figure("immortal" if immortal else "persian", _rig(b))
    x, y, z, arms, legs, hands = b.x, b.y, b.z, b.arms, b.legs, b.hands
    accent = muted(group["color"])
    tunic, trousers = (srgb(c) for c in DRESS[group["id"]])
    head = ~arms & (y > 1.47)
    face = (z > HEAD_Z + 0.02) & (y < 1.665) & (np.abs(x) < 0.07)
    trunk = ~arms & (y > 0.96) & (y < b.shoulder[1] + 0.06)
    sleeve = arms & ~hands
    hem = 0.12 if immortal else 0.5

    covered = (trunk & (y < b.shoulder[1] + 0.03)) | (arms & ~hands) | (legs & (y > 0.09)) | (~arms & (y > hem + 0.02) & (y < 0.98)) | (head & ~face)
    fig.add(b.skin(covered, SKIN_PERSIAN))
    if immortal:
        # robe: bordered in the formation's colour at the cuffs and hem
        at_hands = np.minimum(np.linalg.norm(b.t - b.joints["grip"], axis=1), np.linalg.norm(b.t - b.joints["shield"], axis=1)) < 0.16
        fig.add(b.shell(trunk, 0.024, tunic))
        fig.add(b.shell(sleeve, 0.03, np.where(at_hands[:, None], accent, tunic)))
        fig.add(b.skirt(0.99, hem, tunic, pad=0.035, flare=0.13, rings=8 if detail else 4, segments=22 if detail else 10,
                        colour_at=lambda v: accent if v[1] < 0.24 else tunic))
        fig.add(b.shell(head & ~face & ((y > 1.64) | (z < HEAD_Z)), 0.012, HAIR))
        fig.add(b.shell(head & (y > 1.655) & (y < 1.69), 0.02, GOLD, metal=0.7))
    else:
        fig.add(b.shell(trunk, 0.022, tunic))
        fig.add(b.shell(sleeve, 0.02, tunic))
        fig.add(b.skirt(0.99, hem, tunic, pad=0.035, flare=0.07, rings=5 if detail else 3, segments=20 if detail else 10))
        fig.add(b.shell(legs & (y > 0.06), 0.017, trousers))
        # a soft felt tiara in the formation's colour, with flaps over the chin and neck
        cap = head & ~face & ((y > 1.64) | (np.abs(x) > 0.055) | (z < HEAD_Z))
        peak = np.stack([np.zeros_like(y), np.maximum(y - 1.68, 0) * 1.2, -np.maximum(y - 1.68, 0) * 0.4], axis=1)
        fig.add(b.shell(cap, 0.02, accent * 0.62, grow=peak))  # felt, dyed deeper than skin
    if detail:
        fig.add(b.skirt(1.005, 0.965, LEATHER, pad=0.045, flare=0.0, rings=2, segments=20))  # belt
        fig.add(b.shell(head & (z > HEAD_Z) & (y > 1.47) & (y < 1.57) & (np.abs(x) < 0.075), 0.012, HAIR))  # beard
    fig.add(b.shell(legs & (y < 0.08), 0.01, LEATHER))
    if not immortal:
        # spara: a tall wicker shield, gently bowed, its rows of withies in the colour
        cx, cy, cz = _shield_centre(b, 0.1)
        cols, rows = (6, 12) if detail else (3, 4)
        w, h = 0.56, 1.1
        verts, tris, colours = [], [], []
        for r in range(rows + 1):
            for c in range(cols + 1):
                u, v = c / cols, r / rows
                verts.append((cx + (u - 0.5) * w, cy - 0.45 + v * h, cz + 0.05 * (1 - (2 * u - 1) ** 2)))
                colours.append(srgb(WICKER) * (0.8 if (r % 2 or c in (0, cols)) else 1.05))
        for r in range(rows):
            for c in range(cols):
                a = r * (cols + 1) + c
                tris += [(a, a + 1, a + cols + 2), (a, a + cols + 2, a + cols + 1)]
        fig.add(Part(to_blender(np.array(verts)), tris, np.array(colours), gait=-2, smooth=False, decimate=False))
    _spear(fig, b, detail, 2.0, 0.72, 0.19, "ball", GOLD if immortal else BRONZE)
    # bow case on the left hip, quiver on the back
    fig.add_bmesh(rod((-0.2, 1.02, -0.06), (-0.27, 0.6, 0.02), 0.065, 0.045, 6 if detail else 4), LEATHER)
    if immortal or detail:
        fig.add_bmesh(rod((0.08, 1.45, -0.19), (0.14, 0.95, -0.18), 0.05, 0.045, 6 if detail else 4), srgb(LEATHER) * 1.3)
    return fig


def _face_forward(bm, center):
    """Lathed discs are built about three-local +y (Blender +Z); turn them to face
    the soldier's front, three-local +z (Blender -Y), and move them to center."""
    rot = Matrix.Rotation(math.pi / 2, 4, "X")
    bmesh.ops.transform(bm, matrix=Matrix.Translation(P(*center)) @ rot, verts=bm.verts)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


# ---------- build, export, preview ----------

def build_all(data):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    b = Body()
    objects = []
    for g in data["groups"]:
        for lod, detail in (("LOD0", 1), ("LOD1", 0)):
            if g["side"] == "greek":
                fig = hoplite(b, g, detail)
            else:
                fig = persian(b, g, detail, immortal=g["id"] == "immortals")
            fig.name = f"{g['id']}_{lod}"
            fig.fit(BUDGET[lod])
            obj = fig.to_object()
            objects.append(obj)
            print(f"  {obj.name:18s} {obj['tris']:5d} tris")
    return objects


def export(objects, out):
    from common.glb import mesh_arrays, write_glb

    os.makedirs(os.path.dirname(out), exist_ok=True)
    write_glb(out, [(o.name, mesh_arrays(o), {"rig": o["rig"].to_dict()}) for o in objects])
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
        lod = o.name.rsplit("_", 1)[1]
        assert o["tris"] <= BUDGET[lod], f"{o.name} is over its triangle budget"
    export(objects, out)
    if preview:
        import preview as pv

        pv.lineup(objects, preview)
    return 0
