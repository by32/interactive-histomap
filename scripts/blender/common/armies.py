"""The armies, posed exactly as the page poses them.

The page animates soldiers with a vertex-shader rig (rigShader in
src/thermopylae/soldier.ts). This is the same arithmetic in numpy, applied to
the Blender-modelled soldiers, then placed by each figure's exported
position, heading and visibility scale. Every figure becomes real geometry,
so Cycles sees exactly the formation the page shows.
"""
import bpy
import numpy as np

from .coords import points_to_blender
from .materials import soldier_material

FIGURE_SIZE = 1.6  # soldier.ts; the rig's pivots are in these scaled units
# the primitive figures' joints (soldier.ts RIG), metres before FIGURE_SIZE
PRIMITIVE_RIG = {"hip": (0.78, 0.0), "shoulder": (1.325, 0.0), "hand": (0.36, 1.1125, 0.075)}


def tint(motion_x):
    """Each soldier's dye and complexion, as soldier.ts varies them: a stable
    hash of his walking phase (float32, like the GPU)."""
    m = np.asarray(motion_x, dtype=np.float32)
    tone = 0.86 + 0.28 * np.mod(m * np.float32(0.7548777), 1.0)
    warm = (np.mod(m * np.float32(0.5698403), 1.0) - 0.5) * 0.12
    return tone[:, None] * np.stack([1.0 + warm, np.ones_like(warm), 1.0 - warm], axis=1)
NEAR_METRES = 160.0  # figures closer to the camera use the detailed model


def _smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def pose(pos, gait, battle, motion, t, rig=None, weight=None):
    """pos: (V,3) model vertices, already scaled by FIGURE_SIZE, three.js-local.
    gait: (V,). battle: (N,4), motion: (N,3) per figure: seed, walking weight and
    stride phase (radians, the ground covered). t: the rig's marchTime.
    rig: the model's joints (hip, shoulder (y, z); hand (x, y, z), metres
    before FIGURE_SIZE), the primitive figures' by default. weight: (V,), how
    far each vertex follows its limb. Returns (N,V,3) posed vertices, three.js-local."""
    n = len(battle)
    mx = motion[:, 0:1]
    my = motion[:, 1:2]
    phase = motion[:, 2:3] + mx
    bx, by, bz, bw = (battle[:, k : k + 1] for k in range(4))
    g = gait[None, :]
    stride = np.sin(phase)
    strike = 0.5 + 0.5 * np.sin(t * 3.8 + mx)
    angle = np.where(
        g > 2.5,
        -(1.35 + 0.20 * strike) * bx - 0.50 * bw,
        np.where(
            g == 2.0,
            -0.52 * bx - 0.2 * strike * bx + 1.7 * bz,
            np.where(
                g == -2.0,
                -0.16 * bx + 1.7 * bz,
                np.where(np.abs(g) < 1.5, stride * g * 0.42 * my, -stride * np.sign(g) * 0.12 * my),
            ),
        ),
    )
    x = np.broadcast_to(pos[None, :, 0], (n, len(pos))).copy()
    y = np.broadcast_to(pos[None, :, 1], (n, len(pos))).copy()
    z = np.broadcast_to(pos[None, :, 2], (n, len(pos))).copy()
    # weapons: spear (gait 3) shown until it breaks, sword (gait 4) after; both hidden in surrender
    weapon = g > 2.5
    rig = rig or PRIMITIVE_RIG
    hand = np.asarray(rig["hand"]) * FIGURE_SIZE
    hip = np.asarray(rig["hip"]) * FIGURE_SIZE
    shoulder = np.asarray(rig["shoulder"]) * FIGURE_SIZE
    if weapon.any():
        visible = np.where(g > 3.5, bw, 1.0 - bw) * (1.0 - bz)
        k = np.where(weapon, visible, 1.0)
        x = hand[0] + (x - hand[0]) * k
        y = np.where(weapon, hand[1] + (y - hand[1]) * k, y)
        z = np.where(weapon, hand[2] + (z - hand[2]) * k, z)
    # limbs turn about their joint; weight softens the turn near the body
    jointed = g != 0
    py = np.where(np.abs(g) < 1.5, hip[0], np.where(g > 2.5, hand[1], shoulder[0]))
    pz = np.where(np.abs(g) < 1.5, hip[1], np.where(g > 2.5, hand[2], shoulder[1]))
    if weight is not None:
        angle = angle * weight[None, :]
    c, s = np.cos(angle), np.sin(angle)
    yy, zz = y - py, z - pz
    y = np.where(jointed, c * yy + s * zz + py, y)
    z = np.where(jointed, -s * yy + c * zz + pz, z)
    # step bob, a little sway of the upper body, lunging when engaged
    y = y + (1 + np.cos(2.0 * phase)) * 0.035 * my  # lowest with the legs spread
    z = z + np.sin(t * 1.5 + mx) * 0.009 * _smoothstep(0.9, 2.4, pos[None, :, 1]) * (1 - by)
    z = z + np.sin(t * 3.8 + mx) * 0.10 * bx
    # falling: the whole figure tips forward about its feet
    fa = by * 1.50
    c, s = np.cos(fa), np.sin(fa)
    y, z = c * y + s * z, -s * y + c * z
    y = y + by * 0.3
    return np.stack([x, y, z], axis=2)


class Model:
    """A soldier model's arrays, three.js-local and scaled like the page's geometry."""

    def __init__(self, obj):
        me = obj.data
        me.calc_loop_triangles()
        nv = len(me.vertices)
        co = np.empty(nv * 3, dtype=np.float32)
        me.vertices.foreach_get("co", co)
        co = co.reshape(-1, 3)
        # Blender (x, y, z) -> three.js-local (x, z, -y)
        self.pos = np.stack([co[:, 0], co[:, 2], -co[:, 1]], axis=1) * FIGURE_SIZE
        self.gait = np.empty(nv, dtype=np.float32)
        me.attributes["_gait"].data.foreach_get("value", self.gait)
        self.metal = np.empty(nv, dtype=np.float32)
        me.attributes["_metal"].data.foreach_get("value", self.metal)
        self.weight = np.ones(nv, dtype=np.float32)
        if "_weight" in me.attributes:
            me.attributes["_weight"].data.foreach_get("value", self.weight)
        self.rig = obj["rig"].to_dict() if "rig" in obj else None
        self.col = np.empty(nv * 4, dtype=np.float32)
        me.color_attributes["Col"].data.foreach_get("color", self.col)
        self.col = self.col.reshape(-1, 4)
        self.tris = np.empty(len(me.loop_triangles) * 3, dtype=np.int64)
        me.loop_triangles.foreach_get("vertices", self.tris)
        self.tris = self.tris.reshape(-1, 3)
        smooth = np.empty(len(me.polygons), dtype=bool)
        me.polygons.foreach_get("use_smooth", smooth)
        poly = np.empty(len(me.loop_triangles), dtype=np.int64)
        me.loop_triangles.foreach_get("polygon_index", poly)
        self.smooth = smooth[poly]


def figures_mesh(name, model, figs, t):
    """figs: (N, 12) exported figure rows for the figures using this model."""
    heading = figs[:, 3]
    scale = figs[:, 4]
    posed = pose(model.pos, model.gait, figs[:, 5:9], figs[:, 9:12], t, model.rig, model.weight)  # (N,V,3)
    c, s = np.cos(heading)[:, None], np.sin(heading)[:, None]
    x = c * posed[:, :, 0] + s * posed[:, :, 2]  # rotation about +y by heading
    z = -s * posed[:, :, 0] + c * posed[:, :, 2]
    world = np.stack([x, posed[:, :, 1], z], axis=2) * scale[:, None, None] + figs[:, None, 0:3]
    n, v = world.shape[:2]
    tris = (model.tris[None] + (np.arange(n) * v)[:, None, None]).reshape(-1, 3)
    me = bpy.data.meshes.new(name)
    me.vertices.add(n * v)
    me.vertices.foreach_set("co", points_to_blender(world.reshape(-1, 3)).astype(np.float32).ravel())
    me.loops.add(len(tris) * 3)
    me.loops.foreach_set("vertex_index", tris.astype(np.int32).ravel())
    me.polygons.add(len(tris))
    me.polygons.foreach_set("loop_start", np.arange(0, len(tris) * 3, 3, dtype=np.int32))
    me.polygons.foreach_set("use_smooth", np.tile(model.smooth, n))
    me.update()
    col = me.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
    # the page's per-soldier variation: dyes and skin fully, bronze less
    k = tint(figs[:, 9])[:, None, :]
    strength = (1.0 - 0.7 * model.metal)[None, :, None]
    rgb = model.col[None, :, :3] * (1.0 + (k - 1.0) * strength)
    rgba = np.concatenate([rgb, np.broadcast_to(model.col[None, :, 3:], rgb.shape[:2] + (1,))], axis=2)
    col.data.foreach_set("color", rgba.astype(np.float32).ravel())
    me.attributes.new("_metal", "FLOAT", "POINT").data.foreach_set("value", np.tile(model.metal, n))
    obj = bpy.data.objects.new(name, me)
    obj.data.materials.append(soldier_material())
    bpy.context.scene.collection.objects.link(obj)
    return obj


class ArmyBuilder:
    """Builds every group's figures for one moment, detailed models near the camera."""

    def __init__(self, data, models):
        self.data = data
        self.models = models  # name -> Model, e.g. 'spartans_LOD0'
        self.objects = []

    def clear(self):
        for o in self.objects:
            me = o.data
            bpy.data.objects.remove(o)
            bpy.data.meshes.remove(me)
        self.objects = []

    def build(self, rows, t, camera_three):
        """rows: (figures, 12) for all groups in GROUPS order; camera in three.js space."""
        self.clear()
        start = 0
        cam = np.asarray(camera_three, dtype=np.float32)
        for g in self.data["groups"]:
            figs = rows[start : start + g["count"]]
            start += g["count"]
            figs = figs[figs[:, 4] > 1e-3]
            if not len(figs):
                continue
            near = np.linalg.norm(figs[:, 0:3] - cam, axis=1) < NEAR_METRES
            for lod, mask in (("LOD0", near), ("LOD1", ~near)):
                if mask.any():
                    self.objects.append(figures_mesh(f"{g['id']}-{lod}", self.models[f"{g['id']}_{lod}"], figs[mask], t))
        return self.objects
