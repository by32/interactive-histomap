"""Cycles stills of the walkthrough's steps, from exactly the page's cameras.

  python scripts/blender/run.py stills [--only wall] [--width 1920 --height 810]
      [--samples 256] [--out .cache/thermopylae/stills]

Each still shows the step's settled armies (as the page shows them a few
seconds after arriving), in the step's light, from the step's camera.
"""
import os
import time

import bpy
import numpy as np

import models as soldier_models
from common import build
from common.armies import ArmyBuilder, Model
from common.camera import make_camera, place
from common.io import SceneData
from common.materials import flat_material, flatten_ground, foliage_material, terrain_material, water_material
from common import world

OUT = ".cache/thermopylae/stills"


def arg(argv, name, default):
    return type(default)(argv[argv.index(f"--{name}") + 1]) if f"--{name}" in argv else default


class Scene:
    """The static world plus the soldier models, built once."""

    def __init__(self, data, flatten=False):
        """flatten: bake the procedural ground into textures (the film's speed-up)."""
        self.data = data
        bpy.ops.wm.read_factory_settings(use_empty=True)
        # soldier models, in-process: the same geometry the page loads
        self.models = {o.name: Model(o) for o in soldier_models.build_all(data)}
        for o in list(bpy.context.scene.objects):
            me = o.data
            bpy.data.objects.remove(o)
            bpy.data.meshes.remove(me)
        scene = bpy.context.scene
        self.scene = scene
        ground = build.terrain(data, "ancient")
        ground.data.materials.append(terrain_material())
        ring = build.ring(data)
        ring.data.materials.append(terrain_material())
        sk = build.skirt(data)
        sk.data.materials.append(terrain_material("TerrainFar"))
        if flatten:
            t = time.time()
            flatten_ground(ground, 4096)
            flatten_ground(build.planar_uv(ring), 2048)
            flatten_ground(build.planar_uv(sk), 1024)
            print(f"  ground baked in {time.time() - t:.0f}s")
        trees = build.forest(data)
        trees.data.materials.append(foliage_material())
        build.sea(data, water_material())
        build.tents(data, flat_material("Linen", (0.62, 0.55, 0.42), 0.9))
        stone = flat_material("Stone", (0.42, 0.38, 0.33), 0.95)
        build.generic_meshes(data, data["scenery"]["wall"], lambda e: stone)
        build.generic_meshes(data, data["scenery"]["springs"], lambda e: flat_material("Spring", (0.3, 0.55, 0.5), 0.1))
        trail = flat_material("Trail", (0.42, 0.34, 0.22), 1.0)
        build.generic_meshes(data, data["scenery"]["path"], lambda e: trail)
        fires = data.f32(data["scenery"]["fires"]["pos"])
        self.fire_mat = flat_material("Fire", (0.0, 0.0, 0.0), 1.0, emission=(1.0, 0.45, 0.12), strength=0.0)
        build.points_as_spheres("fires", fires, 1.4, self.fire_mat)
        self.torch_mat = flat_material("Torch", (0.0, 0.0, 0.0), 1.0, emission=(1.0, 0.5, 0.16), strength=0.0)
        self.torches = None
        self.armies = ArmyBuilder(data, self.models)
        self.camera = make_camera(data)

    def set_moment(self, rows, t, torches, light, grade, glow, eye, target):
        self.armies.build(rows, t, eye)
        if self.torches is not None:
            me = self.torches.data
            bpy.data.objects.remove(self.torches)
            bpy.data.meshes.remove(me)
            self.torches = None
        if glow > 0.01 and len(torches):
            self.torches = build.points_as_spheres("torches", torches, 0.35, self.torch_mat, subdiv=1)
        self.fire_mat.node_tree.nodes["Principled BSDF"].inputs["Emission Strength"].default_value = 40.0 * light["fires"]
        self.torch_mat.node_tree.nodes["Principled BSDF"].inputs["Emission Strength"].default_value = 60.0 * glow
        world.setup(self.scene, light, grade)
        place(self.camera, eye, target)


def configure(scene, width, height, samples, noise=0.01):
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.adaptive_threshold = noise
    scene.cycles.use_denoising = True
    scene.cycles.denoiser = "OPENIMAGEDENOISE"
    scene.cycles.denoising_input_passes = "RGB_ALBEDO_NORMAL"
    scene.cycles.max_bounces = 6
    scene.cycles.diffuse_bounces = 3
    scene.cycles.glossy_bounces = 2
    scene.cycles.transmission_bounces = 4
    scene.cycles.volume_bounces = 0
    scene.cycles.transparent_max_bounces = 4
    scene.cycles.sample_clamp_indirect = 10.0
    scene.cycles.caustics_reflective = False
    scene.cycles.caustics_refractive = False
    scene.render.resolution_x, scene.render.resolution_y = width, height
    scene.render.resolution_percentage = 100
    scene.render.use_persistent_data = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_depth = "16"
    scene.render.image_settings.color_mode = "RGB"


def main(argv):
    width = arg(argv, "width", 1920)
    height = arg(argv, "height", 810)
    samples = arg(argv, "samples", 64)
    only = arg(argv, "only", "")
    out = arg(argv, "out", OUT)
    os.makedirs(out, exist_ok=True)
    data = SceneData()
    t0 = time.time()
    world_scene = Scene(data)
    configure(world_scene.scene, width, height, samples)
    print(f"  scene built in {time.time() - t0:.0f}s")
    for stage in data["stages"]:
        if only and only not in (stage["id"], stage["stage"]):
            continue
        light = data["lights"][stage["light"]]
        grade = world.GRADE[stage["light"]]
        rows = data.army(data.f32(stage["armies"]))
        torches = data.f32(stage["torches"])
        eye, target = stage["camera"]["pos"], stage["camera"]["target"]
        t = time.time()
        world_scene.set_moment(rows, stage["marchTime"], torches, light, grade, light["fires"], eye, target)
        if stage["light"] == "night":
            world_scene.scene.cycles.samples = samples * 2
        else:
            world_scene.scene.cycles.samples = samples
        path = os.path.join(out, f"{stage['id']}.png")
        world_scene.scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        print(f"  {stage['id']}: {time.time() - t:.0f}s -> {path}")
    return 0
