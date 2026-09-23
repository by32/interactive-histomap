"""Cycles materials shared by previews, stills and the film."""
import bpy


def soldier_material():
    """Colour from the model's vertex colours; bronze and iron by the `_metal` attribute."""
    mat = bpy.data.materials.get("Soldier")
    if mat:
        return mat
    mat = bpy.data.materials.new("Soldier")
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    col = nt.nodes.new("ShaderNodeAttribute")
    col.attribute_name = "Col"
    metal = nt.nodes.new("ShaderNodeAttribute")
    metal.attribute_name = "_metal"
    rough = nt.nodes.new("ShaderNodeMapRange")
    rough.inputs["To Min"].default_value = 0.88
    rough.inputs["To Max"].default_value = 0.34
    nt.links.new(col.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(metal.outputs["Fac"], bsdf.inputs["Metallic"])
    nt.links.new(metal.outputs["Fac"], rough.inputs["Value"])
    nt.links.new(rough.outputs["Result"], bsdf.inputs["Roughness"])
    # cloth and skin scatter a little light; keeps close-ups from looking plastic
    bsdf.inputs["Sheen Weight"].default_value = 0.25
    return mat


def _node(nt, kind, **inputs):
    n = nt.nodes.new(kind)
    for k, v in inputs.items():
        n.inputs[k].default_value = v
    return n


def terrain_colour(nt):
    """The ground's colour: the page's terrain colours (the `Col` attribute) with
    ground detail they cannot carry: patches of bare earth and greener grass,
    and dark maquis clumps on the lower slopes. Returns the colour socket."""
    col = nt.nodes.new("ShaderNodeAttribute")
    col.attribute_name = "Col"
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    sep_pos = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(geo.outputs["Position"], sep_pos.inputs["Vector"])
    sep_n = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(geo.outputs["Normal"], sep_n.inputs["Vector"])

    def math(op, a, b=None, clamp=False):
        m = nt.nodes.new("ShaderNodeMath")
        m.operation = op
        m.use_clamp = clamp
        for i, v in enumerate((a, b)):
            if v is None:
                continue
            if isinstance(v, (int, float)):
                m.inputs[i].default_value = v
            else:
                nt.links.new(v, m.inputs[i])
        return m.outputs[0]

    def ramp(value, lo, hi):
        mr = _node(nt, "ShaderNodeMapRange", **{"From Min": lo, "From Max": hi})
        mr.clamp = True
        mr.interpolation_type = "SMOOTHSTEP"
        nt.links.new(value, mr.inputs["Value"])
        return mr.outputs["Result"]

    height = sep_pos.outputs["Z"]
    flat = sep_n.outputs["Z"]  # 1 on level ground
    # ground variation: patches of bare earth and greener grass, a few tens of metres across
    broad = _node(nt, "ShaderNodeTexNoise", Scale=0.012, Detail=5.0, Roughness=0.6)
    nt.links.new(geo.outputs["Position"], broad.inputs["Vector"])
    fine = _node(nt, "ShaderNodeTexNoise", Scale=0.25, Detail=3.0, Roughness=0.5)
    nt.links.new(geo.outputs["Position"], fine.inputs["Vector"])
    variation = math("ADD", math("MULTIPLY", broad.outputs["Fac"], 0.34), 0.83)
    variation = math("MULTIPLY", variation, math("ADD", math("MULTIPLY", fine.outputs["Fac"], 0.16), 0.92))
    # maquis: dark shrub clumps a few metres wide on the lower slopes, thinning with height and steepness
    warp = _node(nt, "ShaderNodeTexNoise", Scale=0.05, Detail=2.0)
    nt.links.new(geo.outputs["Position"], warp.inputs["Vector"])
    warped = nt.nodes.new("ShaderNodeVectorMath")
    warped.operation = "MULTIPLY_ADD"
    nt.links.new(warp.outputs["Color"], warped.inputs[0])
    warped.inputs[1].default_value = (9.0, 9.0, 9.0)
    nt.links.new(geo.outputs["Position"], warped.inputs[2])
    vor = _node(nt, "ShaderNodeTexVoronoi", Scale=0.1, Randomness=1.0)
    nt.links.new(warped.outputs["Vector"], vor.inputs["Vector"])
    size = _node(nt, "ShaderNodeTexNoise", Scale=0.4, Detail=2.0)
    nt.links.new(geo.outputs["Position"], size.inputs["Vector"])
    clump = math("SUBTRACT", 1.0, ramp(math("SUBTRACT", vor.outputs["Distance"], math("MULTIPLY", size.outputs["Fac"], 0.25)), 0.02, 0.3))
    density = ramp(_node_output(nt, "ShaderNodeTexNoise", geo, Scale=0.004, Detail=3.0), 0.35, 0.65)
    habitat = math("MULTIPLY", ramp(height, 4.0, 18.0), math("SUBTRACT", 1.0, ramp(height, 700.0, 1150.0)))
    habitat = math("MULTIPLY", habitat, ramp(flat, 0.45, 0.8))
    scrub = math("MULTIPLY", math("MULTIPLY", clump, density), habitat)
    shrub = _node(nt, "ShaderNodeRGB")
    shrub.outputs[0].default_value = (0.052, 0.066, 0.03, 1)
    varied = nt.nodes.new("ShaderNodeMix")
    varied.data_type = "RGBA"
    varied.blend_type = "MULTIPLY"
    varied.inputs["Factor"].default_value = 1.0
    nt.links.new(col.outputs["Color"], varied.inputs["A"])
    grey = nt.nodes.new("ShaderNodeCombineColor")
    for ch in ("Red", "Green", "Blue"):
        nt.links.new(variation, grey.inputs[ch])
    nt.links.new(grey.outputs["Color"], varied.inputs["B"])
    final = nt.nodes.new("ShaderNodeMix")
    final.data_type = "RGBA"
    nt.links.new(math("MULTIPLY", scrub, 0.5), final.inputs["Factor"])
    nt.links.new(varied.outputs["Result"], final.inputs["A"])
    nt.links.new(shrub.outputs[0], final.inputs["B"])
    return final.outputs["Result"]


def _node_output(nt, kind, geo, **inputs):
    n = _node(nt, kind, **inputs)
    nt.links.new(geo.outputs["Position"], n.inputs["Vector"])
    return n.outputs["Fac"]




def terrain_material(name="Terrain"):
    """For renders: the shared ground colour on a rough, slightly bumpy surface."""
    mat = bpy.data.materials.get(name)
    if mat:
        return mat
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    # the page's palette is tuned for WebGL's softer light; under a physical sun it runs hot
    darker = nt.nodes.new("ShaderNodeMix")
    darker.data_type = "RGBA"
    darker.blend_type = "MULTIPLY"
    darker.inputs["Factor"].default_value = 1.0
    nt.links.new(terrain_colour(nt), darker.inputs["A"])
    darker.inputs["B"].default_value = (0.78, 0.78, 0.76, 1)
    nt.links.new(darker.outputs["Result"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.95
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    sep_n = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(geo.outputs["Normal"], sep_n.inputs["Vector"])
    sep_p = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(geo.outputs["Position"], sep_p.inputs["Vector"])

    def m(op, a, b=None):
        n = nt.nodes.new("ShaderNodeMath")
        n.operation = op
        for i, v in enumerate((a, b)):
            if v is None:
                continue
            if isinstance(v, (int, float)):
                n.inputs[i].default_value = v
            else:
                nt.links.new(v, n.inputs[i])
        return n.outputs[0]

    # limestone strata on cliffs, as the page's limestone shader draws them
    coarse = _node(nt, "ShaderNodeTexNoise", Scale=0.055, Detail=2.0)
    nt.links.new(geo.outputs["Position"], coarse.inputs["Vector"])
    band = m("POWER", m("ADD", m("MULTIPLY", m("SINE", m("ADD", m("MULTIPLY", sep_p.outputs["Z"], 0.62), m("MULTIPLY", coarse.outputs["Fac"], 9.0))), 0.5), 0.5), 7.0)
    cliff = nt.nodes.new("ShaderNodeMapRange")
    cliff.clamp = True
    cliff.inputs["From Min"].default_value = 0.93
    cliff.inputs["From Max"].default_value = 0.55
    nt.links.new(sep_n.outputs["Z"], cliff.inputs["Value"])
    patchy = _node(nt, "ShaderNodeTexNoise", Scale=0.02, Detail=3.0)
    nt.links.new(geo.outputs["Position"], patchy.inputs["Vector"])
    shade = m("SUBTRACT", 1.0, m("MULTIPLY", m("MULTIPLY", m("MULTIPLY", band, cliff.outputs["Result"]), patchy.outputs["Fac"]), 0.22))
    strata = nt.nodes.new("ShaderNodeMix")
    strata.data_type = "RGBA"
    strata.blend_type = "MULTIPLY"
    strata.inputs["Factor"].default_value = 1.0
    nt.links.new(darker.outputs["Result"], strata.inputs["A"])
    grey = nt.nodes.new("ShaderNodeCombineColor")
    for ch in ("Red", "Green", "Blue"):
        nt.links.new(shade, grey.inputs[ch])
    nt.links.new(grey.outputs["Color"], strata.inputs["B"])
    nt.links.new(strata.outputs["Result"], bsdf.inputs["Base Color"])
    # rough, broken ground: a coarse relief on the rock and fine grain everywhere
    relief = _node(nt, "ShaderNodeTexNoise", Scale=0.31, Detail=8.0, Roughness=0.65)
    nt.links.new(geo.outputs["Position"], relief.inputs["Vector"])
    bump = _node(nt, "ShaderNodeBump", Strength=0.55, Distance=1.5)
    nt.links.new(m("ADD", m("MULTIPLY", relief.outputs["Fac"], cliff.outputs["Result"]), m("MULTIPLY", band, 0.12)), bump.inputs["Height"])
    grain = _node(nt, "ShaderNodeTexNoise", Scale=1.3, Detail=6.0, Roughness=0.7)
    nt.links.new(geo.outputs["Position"], grain.inputs["Vector"])
    bump2 = _node(nt, "ShaderNodeBump", Strength=0.3, Distance=0.3)
    nt.links.new(grain.outputs["Fac"], bump2.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bump2.inputs["Normal"])
    nt.links.new(bump2.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def flat_material(name, rgb, roughness=0.8, emission=None, strength=0.0):
    mat = bpy.data.materials.get(name)
    if mat:
        return mat
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*rgb[:3], 1)
    bsdf.inputs["Roughness"].default_value = roughness
    if emission is not None:
        bsdf.inputs["Emission Color"].default_value = (*emission[:3], 1)
        bsdf.inputs["Emission Strength"].default_value = strength
    return mat


def foliage_material():
    """Oak and kermes-oak crowns: dark, varied greens with a little translucency."""
    mat = bpy.data.materials.get("Foliage")
    if mat:
        return mat
    mat = bpy.data.materials.new("Foliage")
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    noise = _node(nt, "ShaderNodeTexNoise", Scale=0.35, Detail=4.0)
    nt.links.new(geo.outputs["Position"], noise.inputs["Vector"])
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (0.018, 0.03, 0.012, 1)
    ramp.color_ramp.elements[1].color = (0.05, 0.068, 0.024, 1)
    nt.links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.8
    bsdf.inputs["Subsurface Weight"].default_value = 0.08
    leaf = _node(nt, "ShaderNodeTexVoronoi", Scale=1.6)
    nt.links.new(geo.outputs["Position"], leaf.inputs["Vector"])
    bump = _node(nt, "ShaderNodeBump", Strength=0.8, Distance=0.6)
    nt.links.new(leaf.outputs["Distance"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def water_material():
    """The Malian Gulf, opaque and glossy (refraction through a volume is too slow
    to render on CPUs): its colour runs from turquoise over the sand of the shallows
    to deep blue, by the `depth` attribute the sea surface carries (metres of water
    beneath, from the terrain)."""
    mat = bpy.data.materials.get("Water")
    if mat:
        return mat
    mat = bpy.data.materials.new("Water")
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    depth = nt.nodes.new("ShaderNodeAttribute")
    depth.attribute_name = "depth"
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    els = ramp.color_ramp.elements
    els[0].position, els[0].color = 0.0, (0.2, 0.24, 0.18, 1)  # sand seen through a hand's depth of water
    els[1].position, els[1].color = 1.0, (0.004, 0.018, 0.028, 1)  # the open gulf
    mid = els.new(0.15)
    mid.color = (0.016, 0.07, 0.07, 1)
    scale = nt.nodes.new("ShaderNodeMath")
    scale.operation = "DIVIDE"
    scale.inputs[1].default_value = 40.0
    scale.use_clamp = True
    nt.links.new(depth.outputs["Fac"], scale.inputs[0])
    nt.links.new(scale.outputs[0], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.06
    bsdf.inputs["IOR"].default_value = 1.333
    bsdf.inputs["Specular IOR Level"].default_value = 0.5
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    # long swells and fine ripples, so the gulf breaks up reflections as real water does
    swell = _node(nt, "ShaderNodeTexNoise", Scale=0.035, Detail=4.0, Roughness=0.5)
    nt.links.new(geo.outputs["Position"], swell.inputs["Vector"])
    ripple = _node(nt, "ShaderNodeTexNoise", Scale=0.9, Detail=6.0, Roughness=0.6)
    nt.links.new(geo.outputs["Position"], ripple.inputs["Vector"])
    bump = _node(nt, "ShaderNodeBump", Strength=0.35, Distance=1.2)
    nt.links.new(swell.outputs["Fac"], bump.inputs["Height"])
    bump2 = _node(nt, "ShaderNodeBump", Strength=0.25, Distance=0.08)
    nt.links.new(ripple.outputs["Fac"], bump2.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bump2.inputs["Normal"])
    nt.links.new(bump2.outputs["Normal"], bsdf.inputs["Normal"])
    return mat
