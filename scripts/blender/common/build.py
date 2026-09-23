"""Builds scene objects in Blender from the exported description."""
import math
import bpy
import numpy as np

from .coords import points_to_blender


def mesh_from_arrays(name, pos_blender, tris, uv=None, colors=None, smooth=True):
    me = bpy.data.meshes.new(name)
    n = len(pos_blender)
    me.vertices.add(n)
    me.vertices.foreach_set("co", np.ascontiguousarray(pos_blender, dtype=np.float32).ravel())
    m = len(tris)
    me.loops.add(m * 3)
    me.loops.foreach_set("vertex_index", np.ascontiguousarray(tris, dtype=np.int32).ravel())
    me.polygons.add(m)
    me.polygons.foreach_set("loop_start", np.arange(0, m * 3, 3, dtype=np.int32))
    me.update()
    if smooth:
        me.polygons.foreach_set("use_smooth", np.ones(m, dtype=bool))
    if uv is not None:
        layer = me.uv_layers.new(name="UVMap")
        layer.data.foreach_set("uv", np.ascontiguousarray(uv[np.asarray(tris).ravel()], dtype=np.float32).ravel())
    if colors is not None:
        rgba = np.concatenate([colors, np.ones((n, 1), dtype=np.float32)], axis=1)
        attr = me.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
        attr.data.foreach_set("color", rgba.astype(np.float32).ravel())
        me.color_attributes.active_color = attr
    me.validate()
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def terrain(data, key):
    """key: 'ancient' (480 BC) or 'modern' (today). The live mesh, with grid UVs."""
    t = data["terrain"][key]
    pos = points_to_blender(data.f32(t["pos"]))
    tris = data.u32(t["idx"]).reshape(-1, 3)
    uv = data.f32(t["uv"]).reshape(-1, 2)
    col = data.f32(t["col"]).reshape(-1, 3)
    return mesh_from_arrays(t["name"], pos, tris, uv=uv, colors=col)


def _icosphere(subdiv=1):
    import bmesh

    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=1.0)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    v = np.array([vv.co[:] for vv in bm.verts], dtype=np.float64)
    f = np.array([[vv.index for vv in face.verts] for face in bm.faces], dtype=np.int64)
    bm.free()
    return v, f


def forest(data, name="forest"):
    """One mesh of oak canopies (three overlapping crowns, as on the page) for every tree."""
    info = data["scenery"]["forest"]
    mats = data.f32(info["mat"]).reshape(-1, 4, 4).transpose(0, 2, 1)  # column-major -> row-major
    v, f = _icosphere(1)
    # crowns in three.js-local coordinates, as buildForest() draws them
    crowns = [
        (np.array([4.2, 4.2 * 0.72, 4.2]), np.array([0, 7.2, 0])),
        (np.array([4.2 * 0.75, 4.2 * 0.72 * 0.8, 4.2 * 0.7]), np.array([2.5, 7.2 * 0.8 - 0.5, 1.4])),
        (np.array([4.2 * 0.6, 4.2 * 0.72 * 0.65, 4.2 * 0.8]), np.array([-2, 7.2 * 0.65 - 0.4, -1.6])),
    ]
    local = np.concatenate([v * s + c for s, c in crowns])  # three.js-local (x, y, z)
    faces = np.concatenate([f + i * len(v) for i in range(len(crowns))])
    homo = np.concatenate([local, np.ones((len(local), 1))], axis=1)
    world = np.einsum("tij,vj->tvi", mats, homo)[:, :, :3].reshape(-1, 3)
    tris = (faces[None, :, :] + (np.arange(len(mats)) * len(local))[:, None, None]).reshape(-1, 3)
    return mesh_from_arrays(name, points_to_blender(world), tris)


def ring(data):
    """The terrain around the modelled extent, in the page's own palette."""
    r = data["ring"]
    pos = points_to_blender(data.f32(r["pos"]))
    tris = data.u32(r["idx"]).reshape(-1, 3)
    col = data.f32(r["col"]).reshape(-1, 3)
    return mesh_from_arrays("ring", pos, tris, colors=col)


def skirt(data):
    """The heightfield out to the horizon, coloured by height like the page's palette."""
    s = data["skirt"]
    pos3 = data.f32(s["pos"]).reshape(-1, 3)
    y = pos3[:, 1]
    sea = np.array([0.1, 0.16, 0.12])
    sand = np.array([0.55, 0.45, 0.28])
    grass = np.array([0.2, 0.24, 0.09])
    rock = np.array([0.33, 0.3, 0.25])
    t_sand = np.clip(y / 2.0, 0, 1)[:, None]
    t_rock = np.clip((y - 60) / 500, 0, 1)[:, None]
    col = np.where(y[:, None] < 0, sea, sand * (1 - t_sand) + grass * t_sand)
    col = col * (1 - t_rock) + rock * t_rock
    tris = data.u32(s["idx"]).reshape(-1, 3)
    return mesh_from_arrays("skirt", points_to_blender(pos3), tris, colors=col.astype(np.float32))


def planar_uv(obj):
    """Top-down UVs over the object's footprint, for baking a heightfield's colour."""
    me = obj.data
    co = np.empty(len(me.vertices) * 3, dtype=np.float32)
    me.vertices.foreach_get("co", co)
    xy = co.reshape(-1, 3)[:, :2]
    lo, hi = xy.min(axis=0), xy.max(axis=0)
    uv = (xy - lo) / np.maximum(hi - lo, 1e-6)
    idx = np.empty(len(me.loops), dtype=np.int32)
    me.loops.foreach_get("vertex_index", idx)
    layer = me.uv_layers.new(name="UVMap")
    layer.data.foreach_set("uv", np.ascontiguousarray(uv[idx], dtype=np.float32).ravel())
    return obj


def generic_meshes(data, entries, material_for):
    objs = []
    for e in entries:
        pos = points_to_blender(data.f32(e["pos"]))
        tris = data.u32(e["idx"]).reshape(-1, 3) if e.get("idx") else np.arange(len(pos)).reshape(-1, 3)
        obj = mesh_from_arrays(e["name"], pos, tris, smooth=False)
        obj.data.materials.append(material_for(e))
        objs.append(obj)
    return objs


def tents(data, material):
    info = data["scenery"]["tents"]
    mats = data.f32(info["mat"]).reshape(-1, 4, 4).transpose(0, 2, 1)
    # the page's tent: a five-sided cone, 4.2 m across and 4 m tall, apex up
    seg = 5
    ring = np.array([[4.2 * math.cos(2 * math.pi * k / seg), 0.0, 4.2 * math.sin(2 * math.pi * k / seg)] for k in range(seg)])
    local = np.concatenate([ring, [[0, 4.0, 0]]])
    faces = np.array([[k, (k + 1) % seg, seg] for k in range(seg)])
    homo = np.concatenate([local, np.ones((len(local), 1))], axis=1)
    world = np.einsum("tij,vj->tvi", mats, homo)[:, :, :3].reshape(-1, 3)
    tris = (faces[None] + (np.arange(len(mats)) * len(local))[:, None, None]).reshape(-1, 3)
    obj = mesh_from_arrays("tents", points_to_blender(world), tris, smooth=False)
    obj.data.materials.append(material)
    return obj


def points_as_spheres(name, pts_three, radius, material, subdiv=1):
    """Small emissive spheres (camp fires, torches) at three.js positions."""
    v, f = _icosphere(subdiv)
    pts = np.asarray(pts_three, dtype=np.float64).reshape(-1, 3)
    if not len(pts):
        return None
    world = (v[None] * radius + points_to_blender(pts)[:, None, :]).reshape(-1, 3)
    tris = (f[None] + (np.arange(len(pts)) * len(v))[:, None, None]).reshape(-1, 3)
    obj = mesh_from_arrays(name, world, tris)
    obj.data.materials.append(material)
    return obj


def sea(data, material, size=80000.0):
    """The sea surface: over the modelled extent, the terrain grid flattened to sea
    level with the water's depth beneath each vertex; beyond it, open water."""
    t = data["terrain"]["ancient"]
    pos3 = data.f32(t["pos"]).reshape(-1, 3)
    tris = data.u32(t["idx"]).reshape(-1, 3)
    depth = np.clip(-pos3[:, 1], 0, None)
    # keep only triangles with water over them (or touching it)
    wet = (depth[tris] > 0).any(axis=1)
    tris = tris[wet]
    used, inverse = np.unique(tris, return_inverse=True)
    flat = pos3[used].copy()
    flat[:, 1] = 0.0
    inner = mesh_from_arrays("sea-near", points_to_blender(flat), inverse.reshape(-1, 3), smooth=True)
    inner.data.attributes.new("depth", "FLOAT", "POINT").data.foreach_set("value", depth[used].astype(np.float32))
    inner.data.materials.append(material)
    # open water beyond, a little lower so it never shows through the near sea
    e = data["extent"]
    h = size / 2
    verts = [(-h, -h, -0.02), (h, -h, -0.02), (h, h, -0.02), (-h, h, -0.02)]
    me = bpy.data.meshes.new("sea-far")
    me.from_pydata(verts, [], [(0, 1, 2, 3)])
    me.attributes.new("depth", "FLOAT", "POINT").data.foreach_set("value", np.full(4, 200.0, dtype=np.float32))
    far = bpy.data.objects.new("sea-far", me)
    bpy.context.scene.collection.objects.link(far)
    far.data.materials.append(material)
    _ = e
    return inner, far
