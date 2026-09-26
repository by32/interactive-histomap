"""Sky, sun, haze and grading for a light preset exported from the page.

The page's LIGHTS presets (day, dawn, dusk, night) give the sun direction,
colours and fog distances; GRADE holds only the art direction a physically
based render needs on top: how bright the sun and sky are, how much haze
hangs over the gulf, and the exposure.
"""
import math

import bpy
from mathutils import Vector

GRADE = {
    #          sun W/m2  sky   haze  air   dust  exposure
    "day": dict(sun=4.0, sky=0.42, haze=0.25, air=1.0, dust=1.2, exposure=-0.55),
    # dawn sits about half a stop under the day, not level with it
    "dawn": dict(sun=3.0, sky=0.3, haze=0.4, air=1.4, dust=2.4, exposure=-0.75),
    "dusk": dict(sun=2.8, sky=0.34, haze=0.38, air=1.4, dust=2.2, exposure=-0.2),
    "night": dict(sun=0.09, sky=0.0, haze=0.3, air=1.0, dust=1.0, exposure=1.2),
}


def sun_vector(light):
    """three.js sunDir -> Blender vector pointing toward the sun."""
    x, y, z = light["sunDir"]
    return Vector((x, -z, y)).normalized()


def blend_grade(a, b, k):
    return {key: GRADE[a][key] + (GRADE[b][key] - GRADE[a][key]) * k for key in GRADE[a]}


def setup(scene, light, grade):
    """light: a preset from scene.json (linear colours); grade: a GRADE entry (or a blend)."""
    d = sun_vector(light)
    # the sun lamp
    sun = bpy.data.objects.get("Sun")
    if sun is None:
        sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN"))
        scene.collection.objects.link(sun)
    sun.rotation_mode = "QUATERNION"
    sun.rotation_quaternion = (-d).to_track_quat("-Z", "Y")
    sun.data.energy = grade["sun"]
    sun.data.color = light["sunColor"]
    sun.data.angle = math.radians(1.2)

    world = scene.world or bpy.data.worlds.new("World")
    scene.world = world
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputWorld")
    bg = nt.nodes.new("ShaderNodeBackground")
    nt.links.new(bg.outputs["Background"], out.inputs["Surface"])
    if grade["sky"] > 0:
        sky = nt.nodes.new("ShaderNodeTexSky")
        sky.sky_type = "NISHITA"
        sky.sun_disc = False
        sky.sun_elevation = max(math.asin(max(-1.0, min(1.0, d.z))), math.radians(1.0))
        sky.sun_rotation = math.atan2(d.x, d.y)
        sky.air_density = grade["air"]
        sky.dust_density = grade["dust"]
        sky.ozone_density = 1.0
        sky.altitude = 200.0
        nt.links.new(sky.outputs["Color"], bg.inputs["Color"])
        bg.inputs["Strength"].default_value = grade["sky"]
    else:
        # night: the page's own sky gradient, moonlit
        coord = nt.nodes.new("ShaderNodeTexCoord")
        sep = nt.nodes.new("ShaderNodeSeparateXYZ")
        nt.links.new(coord.outputs["Generated"], sep.inputs["Vector"])
        grad = nt.nodes.new("ShaderNodeValToRGB")
        grad.color_ramp.elements[0].position = 0.5
        grad.color_ramp.elements[0].color = (*light["skyBottom"], 1)
        grad.color_ramp.elements[1].position = 0.75
        grad.color_ramp.elements[1].color = (*light["skyTop"], 1)
        nt.links.new(sep.outputs["Z"], grad.inputs["Fac"])
        nt.links.new(grad.outputs["Color"], bg.inputs["Color"])
        bg.inputs["Strength"].default_value = 0.9
    # haze: a mist pass mixed toward the page's fog colour in the compositor
    world.mist_settings.start = light["fogNear"] * 0.4
    world.mist_settings.depth = light["fogFar"] * 1.4
    world.mist_settings.falloff = "QUADRATIC"
    compositor(scene, light["fog"], grade["haze"])
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - High Contrast"
    scene.view_settings.exposure = grade["exposure"]


def compositor(scene, fog_rgb, haze):
    scene.render.film_transparent = True
    layer = scene.view_layers[0]
    layer.use_pass_mist = True
    layer.use_pass_environment = True
    scene.use_nodes = True
    nt = scene.node_tree
    nt.nodes.clear()
    rl = nt.nodes.new("CompositorNodeRLayers")
    fog = nt.nodes.new("CompositorNodeRGB")
    fog.outputs[0].default_value = (*fog_rgb, 1)
    strength = nt.nodes.new("CompositorNodeMath")
    strength.operation = "MULTIPLY"
    strength.inputs[1].default_value = haze
    nt.links.new(rl.outputs["Mist"], strength.inputs[0])
    # the fog colour is premultiplied by the image's alpha, so sky stays untouched
    fog_a = nt.nodes.new("CompositorNodeSetAlpha")
    fog_a.mode = "REPLACE_ALPHA"
    nt.links.new(fog.outputs[0], fog_a.inputs["Image"])
    nt.links.new(rl.outputs["Alpha"], fog_a.inputs["Alpha"])
    premul = nt.nodes.new("CompositorNodePremulKey")
    premul.mapping = "STRAIGHT_TO_PREMUL"
    nt.links.new(fog_a.outputs["Image"], premul.inputs["Image"])
    mix = nt.nodes.new("CompositorNodeMixRGB")
    nt.links.new(strength.outputs[0], mix.inputs["Fac"])
    nt.links.new(rl.outputs["Image"], mix.inputs[1])
    nt.links.new(premul.outputs["Image"], mix.inputs[2])
    over = nt.nodes.new("CompositorNodeAlphaOver")
    nt.links.new(rl.outputs["Env"], over.inputs[1])
    nt.links.new(mix.outputs["Image"], over.inputs[2])
    glare = nt.nodes.new("CompositorNodeGlare")
    glare.glare_type = "FOG_GLOW"
    glare.inputs["Threshold"].default_value = 1.5
    nt.links.new(over.outputs["Image"], glare.inputs["Image"])
    comp = nt.nodes.new("CompositorNodeComposite")
    comp.use_alpha = False
    nt.links.new(glare.outputs["Image"], comp.inputs["Image"])
