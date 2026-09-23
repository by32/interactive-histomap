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
