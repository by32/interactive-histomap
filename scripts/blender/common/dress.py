"""Clothing and armour fitted to the posed body, as plain arrays.

A soldier is a list of Parts: vertices (Blender coordinates), triangles and,
per vertex, a linear colour and the rig's gait, metal and weight. Garments are
drawn from the body itself: a shell is a region of the body pushed out along
its normals, so a sleeve, greave or cuirass follows the anatomy and inherits
the rig attributes of the skin beneath it (it swings with the arm or leg). A
skirt is lofted from the body's cross-sections, so it hangs from the hips.

Masks and heights are written in the three.js-local frame the page uses
(x to the soldier's spear side, y up, z to the front), `Body.t`.
"""
import math

import bpy
import numpy as np
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree

from . import body as anatomy


def srgb(hex_or_rgb):
    """sRGB hex -> linear rgb (glTF COLOR_0 and three.js vertex colours are linear)."""
    if isinstance(hex_or_rgb, (list, tuple, np.ndarray)):
        return np.asarray(hex_or_rgb[:3], dtype=np.float64)
    c = [((hex_or_rgb >> s) & 255) / 255 for s in (16, 8, 0)]
    return np.array([v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c])


def _colour(color, used=None):
    """A hex colour, a linear rgb triple, or per body vertex (N, 3), picked at `used`."""
    if np.ndim(color) == 0:
        return srgb(color)
    color = np.asarray(color, dtype=np.float64)
    return color if color.ndim == 1 or used is None else color[used]


def to_three(p):
    p = np.asarray(p, dtype=np.float64)
    return np.stack([p[..., 0], p[..., 2], -p[..., 1]], axis=-1)


def to_blender(p):
    p = np.asarray(p, dtype=np.float64)
    return np.stack([p[..., 0], -p[..., 2], p[..., 1]], axis=-1)


def smooth(a, b, x):
    t = np.clip((np.asarray(x) - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


class Part:
    def __init__(self, verts, tris, color, gait=0.0, metal=0.0, weight=1.0, smooth=True, decimate=True):
        self.verts = np.asarray(verts, dtype=np.float64).reshape(-1, 3)
        self.tris = np.asarray(tris, dtype=np.int64).reshape(-1, 3)
        n = len(self.verts)

        def per_vertex(v, width=None):
            v = np.asarray(v, dtype=np.float64)
            if width:
                return np.broadcast_to(v, (n, width)).copy() if v.ndim == 1 else v.reshape(n, width).copy()
            return np.broadcast_to(v, (n,)).copy()

        self.color = per_vertex(_colour(color), 3)
        self.gait = per_vertex(gait)
        self.metal = per_vertex(metal)
        self.weight = per_vertex(weight)
        self.smooth = smooth
        self.decimate = decimate

    @property
    def tri_count(self):
        return len(self.tris)


def from_bmesh(bm, color, gait=0.0, metal=0.0, weight=1.0, smooth=True):
    """A Part from a bmesh primitive (Blender coordinates); the bmesh is freed."""
    import bmesh

    bmesh.ops.triangulate(bm, faces=bm.faces)
    verts = np.array([v.co[:] for v in bm.verts])
    index = {v: i for i, v in enumerate(bm.verts)}
    tris = np.array([[index[v] for v in f.verts] for f in bm.faces])
    bm.free()
    return Part(verts, tris, color, gait, metal, weight, smooth, decimate=False)


def vertex_normals(verts, tris):
    cross = np.cross(verts[tris[:, 1]] - verts[tris[:, 0]], verts[tris[:, 2]] - verts[tris[:, 0]])
    n = np.zeros_like(verts)
    for k in range(3):
        np.add.at(n, tris[:, k], cross)
    return n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)


class Body:
    """The posed anatomy, with helpers that cut garments from it."""

    def __init__(self):
        obj, gait, weight, joints, hands = anatomy.prepare()
        me = obj.data
        me.calc_loop_triangles()
        co = np.empty(len(me.vertices) * 3)
        me.vertices.foreach_get("co", co)
        self.co = co.reshape(-1, 3)
        tris = np.empty(len(me.loop_triangles) * 3, dtype=np.int64)
        me.loop_triangles.foreach_get("vertices", tris)
        self.tris = tris.reshape(-1, 3)
        bpy.data.objects.remove(obj)
        bpy.data.meshes.remove(me)
        self.normals = vertex_normals(self.co, self.tris)
        self.gait, self.weight, self.hands = gait.astype(np.float64), weight.astype(np.float64), hands
        self.t = to_three(self.co)
        self.joints = {k: (tuple(to_three(p) for p in v) if isinstance(v, tuple) else to_three(v)) for k, v in joints.items()}
        # landmarks, three-local
        self.top = self.t[:, 1].max()
        self.hip = self.joints["hip"][1]
        self.shoulder = self.joints["shoulder"]

    # --- masks ---
    @property
    def x(self):
        return self.t[:, 0]

    @property
    def y(self):
        return self.t[:, 1]

    @property
    def z(self):
        return self.t[:, 2]

    @property
    def arms(self):
        return np.abs(self.gait) > 1.5

    @property
    def legs(self):
        return (np.abs(self.gait) > 0.0) & (np.abs(self.gait) < 1.5) & (self.y < self.hip)

    def near(self, point, radius):
        return np.linalg.norm(self.t - np.asarray(point), axis=1) < radius

    def faces(self, mask):
        return self.tris[np.asarray(mask)[self.tris].all(axis=1)]

    # --- parts ---
    def shell(self, mask, offset, color, metal=0.0, gait=None, weight=None, grow=None):
        """The body region under `mask`, pushed out along its normals by `offset`
        (metres, or per body vertex). `grow` optionally moves vertices further
        (per body vertex, three-local vectors), for flares and caps."""
        faces = self.faces(mask)
        used, inverse = np.unique(faces, return_inverse=True)
        off = np.broadcast_to(np.asarray(offset, dtype=np.float64), (len(self.co),))[used]
        verts = self.co[used] + self.normals[used] * off[:, None]
        if grow is not None:
            verts = verts + to_blender(np.asarray(grow)[used])
        color = _colour(color, used)
        return Part(
            verts,
            inverse.reshape(-1, 3),
            color,
            self.gait[used] if gait is None else gait,
            metal,
            self.weight[used] if weight is None else weight,
        )

    def skin(self, covered, color):
        """The body where it shows: every triangle not wholly under clothing."""
        faces = self.tris[~np.asarray(covered)[self.tris].all(axis=1)]
        used, inverse = np.unique(faces, return_inverse=True)
        color = _colour(color, used)
        return Part(self.co[used], inverse.reshape(-1, 3), color, self.gait[used], 0.0, self.weight[used])

    def section(self, y, band=0.02):
        """Centre and half-extents (x, z) of the torso and legs at height y."""
        pick = (np.abs(self.y - y) < band) & ~self.arms
        if not pick.any():
            return None
        t = self.t[pick]
        lo, hi = t.min(axis=0), t.max(axis=0)
        return (lo + hi) / 2, (hi - lo) / 2

    def skirt(self, top, hem, color, pad=0.03, flare=0.05, rings=7, segments=20, sway=0.65, colour_at=None):
        """A skirt lofted from the body's sections, from `top` down to `hem`
        (three-local heights), `pad` clear of the body and flaring by `flare`
        at the hem. Its lower sides follow the legs a little as they swing."""
        heights = np.linspace(top, hem, rings)
        verts, gaits = [], []
        for i, y in enumerate(heights):
            f = i / (rings - 1)
            sec = self.section(y) or self.section(heights[max(0, i - 1)])
            (cx, _, cz), (rx, _, rz) = sec
            rx, rz = rx + pad + flare * f * f, rz + pad + flare * f * f
            for k in range(segments):
                a = 2 * math.pi * k / segments
                x, z = cx + math.sin(a) * rx, cz + math.cos(a) * rz
                verts.append((x, y, z))
                side = np.clip(x / max(rx, 1e-3) * 1.4, -1, 1)
                gaits.append(side * sway * smooth(self.hip, self.hip - 0.25, y))
        tris = []
        for i in range(rings - 1):
            for k in range(segments):
                j = (k + 1) % segments
                a, b, c, d = i * segments + k, i * segments + j, (i + 1) * segments + j, (i + 1) * segments + k
                tris += [(a, d, c), (a, c, b)]
        verts = np.array(verts)
        color = _colour(color) if colour_at is None else np.array([_colour(colour_at(v)) for v in verts])
        return Part(to_blender(verts), tris, color, np.array(gaits), 0.0, 1.0)


def decimate(part, ratio):
    """Collapse-decimate a body-drawn part (symmetric about x), carrying each
    new vertex's attributes over from the nearest original vertex."""
    if not part.decimate or ratio >= 0.999 or part.tri_count < 24:
        return part
    me = bpy.data.meshes.new("decimate")
    me.from_pydata(part.verts.tolist(), [], part.tris.tolist())
    obj = bpy.data.objects.new("decimate", me)
    bpy.context.scene.collection.objects.link(obj)
    mod = obj.modifiers.new("d", "DECIMATE")
    mod.ratio = ratio
    mod.use_symmetry = True
    mod.symmetry_axis = "X"
    dg = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(dg).to_mesh()
    ev.calc_loop_triangles()
    co = np.array([v.co[:] for v in ev.vertices])
    tris = np.array([t.vertices[:] for t in ev.loop_triangles])
    obj.evaluated_get(dg).to_mesh_clear()
    bpy.data.objects.remove(obj)
    bpy.data.meshes.remove(me)
    kd = KDTree(len(part.verts))
    for i, v in enumerate(part.verts):
        kd.insert(v, i)
    kd.balance()
    near = np.array([kd.find(v)[1] for v in co])
    out = Part(co, tris, part.color[near], part.gait[near], part.metal[near], part.weight[near], part.smooth)
    return out


def occlusion(verts, tris, normals, reach=0.22, rays=24):
    """Ambient occlusion per vertex, ray-cast against the figure itself: the
    same answer on every run, unlike a sampled bake. 1 open, 0 enclosed."""
    bvh = BVHTree.FromPolygons(verts.tolist(), tris.tolist(), epsilon=0.0)
    # a fixed Fibonacci hemisphere, turned onto each normal
    k = np.arange(rays) + 0.5
    z = 1 - k / rays
    r = np.sqrt(1 - z * z)
    phi = k * math.pi * (3 - math.sqrt(5))
    dirs = np.stack([r * np.cos(phi), r * np.sin(phi), z], axis=1)
    out = np.empty(len(verts))
    for i, (p, n) in enumerate(zip(verts, normals)):
        t = np.cross(n, (1.0, 0.0, 0.0) if abs(n[0]) < 0.9 else (0.0, 1.0, 0.0))
        t /= np.linalg.norm(t)
        b = np.cross(n, t)
        world = dirs @ np.stack([t, b, n])
        start = p + n * 0.002
        hits = 0.0
        for d in world:
            hit = bvh.ray_cast(start, d, reach)
            if hit[0] is not None:
                hits += 1.0 - hit[3] / reach  # near walls occlude more
        out[i] = 1.0 - hits / rays
    return out
