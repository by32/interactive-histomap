"""Checks the Blender install before anything expensive runs.

- Cycles renders on the CPU with the OpenImageDenoise denoiser
- the glTF exporter is available
- Blender cameras frame the scene exactly as three.js does (probe points
  exported by export-scene.mts must land within half a pixel at 2560x1080)
"""
import os
import sys
import tempfile
import time

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

from common.camera import make_camera, place
from common.coords import to_blender
from common.io import SceneData


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def check_render():
    reset()
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 8
    scene.cycles.use_denoising = True
    scene.cycles.denoiser = "OPENIMAGEDENOISE"
    scene.render.resolution_x, scene.render.resolution_y = 64, 36
    bpy.ops.mesh.primitive_uv_sphere_add(location=(0, 0, 0))
    sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN"))
    scene.collection.objects.link(sun)
    cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
    cam.location = (0, -6, 0)
    cam.rotation_euler = (1.5708, 0, 0)
    scene.collection.objects.link(cam)
    scene.camera = cam
    out = os.path.join(tempfile.mkdtemp(), "render.png")
    scene.render.filepath = out
    t = time.time()
    bpy.ops.render.render(write_still=True)
    ok = os.path.getsize(out) > 0
    print(f"  cycles + OIDN render: {'ok' if ok else 'FAILED'} ({time.time() - t:.1f}s)")
    return ok


def check_gltf():
    reset()
    bpy.ops.mesh.primitive_cube_add()
    out = os.path.join(tempfile.mkdtemp(), "cube.glb")
    bpy.ops.export_scene.gltf(filepath=out, export_format="GLB")
    ok = os.path.getsize(out) > 0
    print(f"  glTF export: {'ok' if ok else 'FAILED'}")
    return ok


def check_camera(data, width=2560, height=1080):
    reset()
    scene = bpy.context.scene
    scene.render.resolution_x, scene.render.resolution_y = width, height
    cam = make_camera(data)
    worst = 0.0
    for stage in data["stages"]:
        place(cam, stage["camera"]["pos"], stage["camera"]["target"])
        bpy.context.view_layer.update()
        for probe in stage["probes"]:
            v = world_to_camera_view(scene, cam, Vector(to_blender(probe["world"])))
            px = abs((v.x * 2 - 1) - probe["ndc"][0]) * width / 2
            py = abs((v.y * 2 - 1) - probe["ndc"][1]) * height / 2
            worst = max(worst, px, py)
    ok = worst < 0.5
    print(f"  camera alignment vs three.js: worst {worst:.3f}px over {len(data['stages'])} stages -> {'ok' if ok else 'FAILED'}")
    return ok


def main(argv):
    print(f"Blender {bpy.app.version_string}, python {sys.version.split()[0]}")
    results = [check_render(), check_gltf()]
    try:
        results.append(check_camera(SceneData()))
    except FileNotFoundError:
        print("  camera alignment: skipped (run `npm run export:scene` first)")
    print("selftest", "passed" if all(results) else "FAILED")
    return 0 if all(results) else 1
