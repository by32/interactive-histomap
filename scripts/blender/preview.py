"""A Cycles lineup of the soldier models, for eyeballing them."""
import math

import bpy
from mathutils import Vector

from common.materials import soldier_material


def lineup(objects, out, width=1600, height=900, samples=64):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = width, height
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    mat = soldier_material()
    lod0 = [o for o in objects if o.name.endswith("LOD0")]
    lod1 = [o for o in objects if o.name.endswith("LOD1")]
    for o in objects:
        # the sword (gait 4) is hidden until spears break, as the page's rig does
        gait = o.data.attributes["_gait"].data
        for v, g in zip(o.data.vertices, gait):
            if g.value > 3.5:
                v.co = (0.36, -0.075, 1.1125)
    for row, group in enumerate((lod0, lod1)):
        for i, o in enumerate(group):
            o.data.materials.clear()
            o.data.materials.append(mat)
            o.location = ((i - (len(group) - 1) / 2) * 1.0, row * 1.6, 0)
            o.rotation_euler = (0, 0, math.radians(-25))
    bpy.ops.mesh.primitive_plane_add(size=40)
    ground = bpy.context.active_object
    gm = bpy.data.materials.new("Ground")
    gm.use_nodes = True
    gm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.35, 0.3, 0.22, 1)
    ground.data.materials.append(gm)
    sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN"))
    sun.data.energy = 4.0
    sun.data.angle = math.radians(2)
    sun.rotation_euler = (math.radians(50), 0, math.radians(35))
    scene.collection.objects.link(sun)
    world = bpy.data.worlds.new("World")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.55, 0.62, 0.7, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.8
    scene.world = world
    cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
    cam.data.lens = 50
    cam.location = (0.4, -6.2, 1.9)
    cam.rotation_mode = "QUATERNION"
    cam.rotation_quaternion = (Vector((0, 0.8, 1.0)) - cam.location).to_track_quat("-Z", "Y")
    scene.collection.objects.link(cam)
    scene.camera = cam
    scene.render.filepath = out
    bpy.ops.render.render(write_still=True)
    print(f"  preview {out}")
