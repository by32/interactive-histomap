"""Renders frames of the page's battle film in Cycles.

The film is the page's own: its seekable clock, directed camera, unit
keyframes, lighting keys, combat poses and arrows, exported frame by frame
by export-scene.mts --film a-b. Frames render independently, so ranges can
be split across machines (the render-film workflow) and a stopped run
resumes where it left off.

  npm run export:scene -- --film 0-107
  python scripts/blender/run.py film --start 0 --end 107 [--width 1280 --height 720]
      [--samples 20] [--out .cache/thermopylae/film/frames] [--device CPU|OPTIX|CUDA|HIP|METAL]
"""
import os
import time

import bpy
import numpy as np

from common import build, world
from stills import Scene, arg, configure

OUT = ".cache/thermopylae/film/frames"


def arrows_mesh(name, matrices, material):
    """The page's arrows: 1.7 m shafts along their local +y, placed by three.js matrices."""
    if not len(matrices):
        return None
    seg = 4
    ring = [(0.03 * np.cos(2 * np.pi * k / seg), 0.0, 0.03 * np.sin(2 * np.pi * k / seg)) for k in range(seg)]
    local = np.array([(x, y - 0.85, z) for x, y, z in ring] + [(x, y + 0.85, z) for x, y, z in ring])
    faces = np.array([[k, (k + 1) % seg, seg + (k + 1) % seg] for k in range(seg)] + [[k, seg + (k + 1) % seg, seg + k] for k in range(seg)])
    mats = matrices.reshape(-1, 4, 4).transpose(0, 2, 1)
    homo = np.concatenate([local, np.ones((len(local), 1))], axis=1)
    pts = np.einsum("tij,vj->tvi", mats, homo)[:, :, :3].reshape(-1, 3)
    tris = (faces[None] + (np.arange(len(mats)) * len(local))[:, None, None]).reshape(-1, 3)
    from common.coords import points_to_blender

    obj = build.mesh_from_arrays(name, points_to_blender(pts), tris, smooth=False)
    obj.data.materials.append(material)
    return obj


def main(argv):
    width = arg(argv, "width", 1280)
    height = arg(argv, "height", 720)
    samples = arg(argv, "samples", 20)
    device = arg(argv, "device", "CPU")
    out = arg(argv, "out", OUT)
    first = arg(argv, "start", 0)
    last = arg(argv, "end", 0)
    os.makedirs(out, exist_ok=True)
    from common.io import SceneData
    from common.materials import flat_material

    data = SceneData()
    fr = data.get("filmRange")
    if not fr or fr["first"] > first or fr["last"] < last:
        raise SystemExit(f"export frames {first}-{last} first: npm run export:scene -- --film {first}-{last}")
    todo = [f for f in range(first, last + 1) if not os.path.exists(os.path.join(out, f"{f:05d}.png"))]
    if not todo:
        print("  all frames already rendered")
        return 0
    t0 = time.time()
    sc = Scene(data, flatten=True)
    configure(sc.scene, width, height, samples, noise=0.06)
    # a lighter path budget than the stills: indistinguishable at 720p in
    # motion, and half the time per frame (4,608 frames must fit the farm)
    c = sc.scene.cycles
    c.max_bounces, c.diffuse_bounces, c.glossy_bounces = 3, 2, 1
    c.transmission_bounces, c.transparent_max_bounces = 1, 2
    sc.scene.render.image_settings.color_depth = "8"
    # a fixed seed keeps the denoiser's residue from crawling frame to frame
    sc.scene.cycles.seed = 7
    sc.scene.cycles.use_animated_seed = False
    if device != "CPU":
        prefs = bpy.context.preferences.addons["cycles"].preferences
        prefs.compute_device_type = device
        prefs.get_devices()
        for d in prefs.devices:
            d.use = d.type == device
        sc.scene.cycles.device = "GPU"
    print(f"  scene built in {time.time() - t0:.0f}s; {len(todo)} frames to render")
    stride = data["armyStride"]
    figures = data["figures"]
    army = data.f32(fr["armies"]).reshape(-1, figures, stride)
    cams = data.f32(fr["camera"]).reshape(-1, 6)
    arrows = data.f32(fr["arrows"]).reshape(-1, 180 * 16)
    arrow_counts = data.u32(fr["arrowCounts"])
    torches = data.f32(fr["torches"]).reshape(-1, 3)
    torch_off = data.u32(fr["torchOffsets"])
    shaft = flat_material("ArrowShaft", (0.55, 0.48, 0.34), 0.7)
    arrow_obj = None
    for f in todo:
        k = f - fr["first"]
        info = fr["frames"][k]
        t = time.time()
        eye, target = cams[k, :3].tolist(), cams[k, 3:].tolist()
        grade = world.blend_grade(info["from"], info["to"], info["blend"])
        sc.set_moment(army[k], info["time"], torches[torch_off[k] : torch_off[k + 1]], info["light"], grade, info["torchGlow"], eye, target)
        if arrow_obj is not None:
            me = arrow_obj.data
            bpy.data.objects.remove(arrow_obj)
            bpy.data.meshes.remove(me)
        arrow_obj = arrows_mesh("arrows", arrows[k, : arrow_counts[k] * 16], shaft)
        sc.scene.render.filepath = os.path.join(out, f"{f:05d}.png")
        bpy.ops.render.render(write_still=True)
        print(f"  frame {f}: {time.time() - t:.1f}s", flush=True)
    return 0
