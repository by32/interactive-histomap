"""A small, deterministic glTF 2.0 binary writer for the soldier meshes.

Blender's own exporter reorders vertices from run to run, which would churn a
committed binary on every rebuild; this writes the same bytes for the same
meshes. Vertices are split only where shading needs it (per-corner normals),
colours are stored as normalised 8-bit RGBA, and the rig's attributes as the
application-specific `_GAIT`, `_METAL` and `_WEIGHT`; each node carries its
extras (the rig's joints), which three.js reads into `userData`.
"""
import json
import struct

import numpy as np

FLOAT, UBYTE, USHORT, UINT = 5126, 5121, 5123, 5125
ARRAY_BUFFER, ELEMENT_ARRAY_BUFFER = 34962, 34963


def mesh_arrays(obj):
    """Triangles with deterministic normals, in glTF space (y up; Blender
    (x, y, z) -> (x, z, -y)). Smooth faces share vertices and area-weighted
    normals; flat faces get their own vertices and face normals. Blender's
    corner normals are accumulated in parallel and differ in the last bits
    from run to run, so they are not used."""
    me = obj.data
    me.calc_loop_triangles()
    nv = len(me.vertices)
    loop_vert = np.empty(len(me.loops), dtype=np.int64)
    me.loops.foreach_get("vertex_index", loop_vert)
    tri_loops = np.empty(len(me.loop_triangles) * 3, dtype=np.int64)
    me.loop_triangles.foreach_get("loops", tri_loops)
    tri_poly = np.empty(len(me.loop_triangles), dtype=np.int64)
    me.loop_triangles.foreach_get("polygon_index", tri_poly)
    smooth = np.empty(len(me.polygons), dtype=bool)
    me.polygons.foreach_get("use_smooth", smooth)

    co = np.empty(nv * 3, dtype=np.float64)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    col = np.empty(nv * 4, dtype=np.float32)
    me.color_attributes["Col"].data.foreach_get("color", col)
    col = col.reshape(-1, 4)
    attrs = {}
    for name in ("_gait", "_metal", "_weight"):
        a = np.empty(nv, dtype=np.float32)
        me.attributes[name].data.foreach_get("value", a)
        attrs[name] = a

    tv = loop_vert[tri_loops].reshape(-1, 3)
    tri_smooth = smooth[tri_poly]

    # Canonical order: Blender's merge steps can number the same geometry
    # differently from run to run, so sort vertices by content and triangles by
    # their (rotated, winding-preserving) vertex triples before anything is summed.
    perm = np.lexsort((attrs["_weight"], attrs["_metal"], attrs["_gait"], col[:, 2], col[:, 1], col[:, 0], co[:, 2], co[:, 1], co[:, 0]))
    rank = np.empty(nv, dtype=np.int64)
    rank[perm] = np.arange(nv)
    co, col = co[perm], col[perm]
    attrs = {k: v[perm] for k, v in attrs.items()}
    tv = rank[tv]
    shift = np.argmin(tv, axis=1)
    tv = np.stack([tv[np.arange(len(tv)), (shift + k) % 3] for k in range(3)], axis=1)
    tri_order = np.lexsort((tri_smooth, tv[:, 2], tv[:, 1], tv[:, 0]))
    tv, tri_smooth = tv[tri_order], tri_smooth[tri_order]

    cross = np.cross(co[tv[:, 1]] - co[tv[:, 0]], co[tv[:, 2]] - co[tv[:, 0]])  # length = 2 x area
    tri_n = cross / np.maximum(np.linalg.norm(cross, axis=1, keepdims=True), 1e-12)
    vert_n = np.zeros((nv, 3))
    np.add.at(vert_n, tv[tri_smooth].ravel(), np.repeat(cross[tri_smooth], 3, axis=0))
    vert_n /= np.maximum(np.linalg.norm(vert_n, axis=1, keepdims=True), 1e-12)

    # corner keys: a smooth corner is its vertex; a flat corner is its vertex
    # plus its triangle's (quantised) facing, so a flat quad's two halves share
    corner_vert = tv.ravel()
    corner_smooth = np.repeat(tri_smooth, 3)
    facing = np.round(np.repeat(tri_n, 3, axis=0) * 1000).astype(np.int64) + 1000
    keys = np.stack([corner_vert, np.where(corner_smooth[:, None], -1, facing).reshape(-1, 3)[:, 0],
                     np.where(corner_smooth, -1, facing[:, 1]), np.where(corner_smooth, -1, facing[:, 2])], axis=1)
    _, first, inverse = np.unique(keys, axis=0, return_index=True, return_inverse=True)
    order = np.argsort(first, kind="stable")  # first-seen order
    remap = np.empty_like(order)
    remap[order] = np.arange(len(order))
    indices = remap[inverse.ravel()]
    rep = first[order]
    verts = corner_vert[rep]
    normals = np.where(corner_smooth[rep, None], vert_n[verts], np.repeat(tri_n, 3, axis=0)[rep])

    to_gltf = lambda v: np.stack([v[:, 0], v[:, 2], -v[:, 1]], axis=1)  # noqa: E731
    return {
        "position": to_gltf(co[verts]).astype(np.float32),
        "normal": to_gltf(normals).astype(np.float32),
        "color": np.clip(np.round(col[verts] * 255), 0, 255).astype(np.uint8),
        "_GAIT": attrs["_gait"][verts],
        "_METAL": attrs["_metal"][verts],
        "_WEIGHT": attrs["_weight"][verts],
        "indices": indices.astype(np.uint16 if len(order) < 65536 else np.uint32),
    }


def write_glb(path, named_meshes):
    """named_meshes: list of (name, mesh_arrays(...), extras)"""
    blob = bytearray()
    views, accessors, meshes, nodes = [], [], [], []

    def add(array, component, kind, target, normalized=False, bounds=False):
        while len(blob) % 4:
            blob.append(0)
        data = np.ascontiguousarray(array).tobytes()
        views.append({"buffer": 0, "byteOffset": len(blob), "byteLength": len(data), "target": target})
        blob.extend(data)
        acc = {"bufferView": len(views) - 1, "componentType": component, "count": int(array.shape[0]), "type": kind}
        if normalized:
            acc["normalized"] = True
        if bounds:
            acc["min"] = [float(v) for v in array.min(axis=0)]
            acc["max"] = [float(v) for v in array.max(axis=0)]
        accessors.append(acc)
        return len(accessors) - 1

    for name, m, extras in named_meshes:
        attributes = {
            "POSITION": add(m["position"], FLOAT, "VEC3", ARRAY_BUFFER, bounds=True),
            "NORMAL": add(m["normal"], FLOAT, "VEC3", ARRAY_BUFFER),
            "COLOR_0": add(m["color"], UBYTE, "VEC4", ARRAY_BUFFER, normalized=True),
            "_GAIT": add(m["_GAIT"], FLOAT, "SCALAR", ARRAY_BUFFER),
            "_METAL": add(m["_METAL"], FLOAT, "SCALAR", ARRAY_BUFFER),
            "_WEIGHT": add(m["_WEIGHT"], FLOAT, "SCALAR", ARRAY_BUFFER),
        }
        idx = m["indices"]
        indices = add(idx, USHORT if idx.dtype == np.uint16 else UINT, "SCALAR", ELEMENT_ARRAY_BUFFER)
        meshes.append({"name": name, "primitives": [{"attributes": attributes, "indices": indices}]})
        nodes.append({"name": name, "mesh": len(meshes) - 1, "extras": extras})
    while len(blob) % 4:
        blob.append(0)
    gltf = {
        "asset": {"version": "2.0", "generator": "thermopylae scripts/blender/common/glb.py"},
        "scene": 0,
        "scenes": [{"nodes": list(range(len(nodes)))}],
        "nodes": nodes,
        "meshes": meshes,
        "accessors": accessors,
        "bufferViews": views,
        "buffers": [{"byteLength": len(blob)}],
    }
    js = json.dumps(gltf, separators=(",", ":")).encode()
    js += b" " * (-len(js) % 4)
    total = 12 + 8 + len(js) + 8 + len(blob)
    with open(path, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, total))
        f.write(struct.pack("<II", len(js), 0x4E4F534A) + js)
        f.write(struct.pack("<II", len(blob), 0x004E4942) + bytes(blob))
