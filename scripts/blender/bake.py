"""Bakes the terrain's colour texture for the page, for 480 BC and today.

The texture is the live terrain's own colours (exported from buildTerrain)
enriched in Blender with ground detail the page's vertex colours cannot
carry — maquis scrub, bare earth and grass variation — multiplied by
ambient occlusion baked in Cycles with the oak forest as an occluder. Rock
strata are left to the page's limestone shader, which draws them at runtime.

  python scripts/blender/run.py bake [--size 4096] [--samples 32] [--only ancient|modern]

Writes public/thermopylae/terrain/{480bc,today}-{size,size/2}.webp and a
manifest recording the terrain fingerprint each texture was baked from.
"""
import json
import os
import time

import bpy
import numpy as np

from common import build
from common.materials import terrain_colour
from common.io import SceneData

OUT = "public/thermopylae/terrain"
AO_STRENGTH = 0.55
FILES = {"ancient": "480bc", "modern": "today"}


def albedo_material():
    """Emission = albedo, so an EMIT bake records colour without any lighting."""
    mat = bpy.data.materials.new("TerrainAlbedo")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    emit = nt.nodes.new("ShaderNodeEmission")
    nt.links.new(emit.outputs["Emission"], out.inputs["Surface"])
    nt.links.new(terrain_colour(nt), emit.inputs["Color"])
    return mat


def bake(obj, kind, size, samples):
    scene = bpy.context.scene
    img = bpy.data.images.new(f"{obj.name}-{kind}", size, size, float_buffer=True)
    for mat in obj.data.materials:
        node = mat.node_tree.nodes.new("ShaderNodeTexImage")
        node.image = img
        mat.node_tree.nodes.active = node
    scene.cycles.samples = samples
    for o in scene.objects:
        o.select_set(o == obj)
    bpy.context.view_layer.objects.active = obj
    t = time.time()
    bpy.ops.object.bake(type=kind, margin=6, use_clear=True)
    print(f"    {kind} bake {size}px: {time.time() - t:.0f}s")
    px = np.empty(size * size * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    return px.reshape(size, size, 4)[:, :, :3]


def srgb(linear):
    linear = np.clip(linear, 0, 1)
    return np.where(linear <= 0.0031308, linear * 12.92, 1.055 * np.power(linear, 1 / 2.4) - 0.055)


def save_webp(rgb_srgb, path, size, quality):
    img = bpy.data.images.new(os.path.basename(path), rgb_srgb.shape[1], rgb_srgb.shape[0], float_buffer=False)
    img.colorspace_settings.name = "sRGB"
    rgba = np.concatenate([rgb_srgb, np.ones(rgb_srgb.shape[:2] + (1,), dtype=np.float32)], axis=2)
    img.pixels.foreach_set(rgba.astype(np.float32).ravel())
    if size != rgb_srgb.shape[0]:
        img.scale(size, size)
    img.file_format = "WEBP"
    img.filepath_raw = path
    img.save(filepath=path, quality=quality)
    print(f"    wrote {path} ({os.path.getsize(path) / 1024:.0f} KB)")


def main(argv):
    size = int(argv[argv.index("--size") + 1]) if "--size" in argv else 4096
    samples = int(argv[argv.index("--samples") + 1]) if "--samples" in argv else 32
    only = argv[argv.index("--only") + 1] if "--only" in argv else None
    data = SceneData()
    os.makedirs(OUT, exist_ok=True)
    manifest_path = os.path.join(OUT, "manifest.json")
    manifest = json.load(open(manifest_path)) if os.path.exists(manifest_path) else {}
    for key, tag in FILES.items():
        if only and only != key:
            continue
        print(f"  {tag}:")
        bpy.ops.wm.read_factory_settings(use_empty=True)
        scene = bpy.context.scene
        scene.render.engine = "CYCLES"
        scene.cycles.device = "CPU"
        scene.render.bake.margin = 6
        world = bpy.data.worlds.new("World")
        scene.world = world
        world.light_settings.distance = 40.0  # AO reach, metres
        ground = build.terrain(data, key)
        build.forest(data)
        ground.data.materials.append(albedo_material())
        albedo = bake(ground, "EMIT", size, 1)
        ao = bake(ground, "AO", size, samples)
        ao = ao.mean(axis=2, keepdims=True)
        # soften the AO's sampling noise; it is a low-frequency signal
        k = np.array([1, 4, 6, 4, 1], dtype=np.float32) / 16
        for axis in (0, 1):
            ao = sum(np.roll(ao, s, axis=axis) * w for s, w in zip(range(-2, 3), k))
        out = srgb(albedo * (1 - AO_STRENGTH * (1 - ao)))
        files = {}
        for s, q in ((size, 80), (size // 2, 82)):
            name = f"{tag}-{s}.webp"
            save_webp(out, os.path.join(OUT, name), s, q)
            files[str(s)] = name
        manifest[tag] = {"fingerprint": data["terrain"][key]["fingerprint"], "files": files}
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=1, sort_keys=True)
        f.write("\n")
    return 0
