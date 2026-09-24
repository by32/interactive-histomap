"""The soldiers' anatomy: Blender Studio's realistic male base mesh (CC0), posed.

The Human Base Meshes bundle (https://www.blender.org/download/demo/asset-bundles/,
CC0, Blender Studio) gives a realistic body in an A-pose. Here it is skinned
here with weights drawn from its anatomy and posed, in numpy, as a soldier
stands in the page: arms down, the right hand forward on the spear shaft, the
left forearm forward under the shield. The pose is applied, and each vertex
keeps what the page's vertex-shader rig needs:

  gait   0 torso and head, +-1 legs (fractional near the hip, so the hip
         blends as the leg swings), +-2 arms
  weight how much a vertex follows its limb's joint, 0..1 (a soft shoulder)

Blender coordinates throughout: front is -Y, up is +Z, the spear side is +X.
"""
import hashlib
import math
import os
import shutil
import urllib.request
import zipfile

import bpy
import numpy as np
from mathutils import Vector

URL = "https://mirror.blender.org/demo/asset-bundles/human-base-meshes/human-base-meshes-bundle-v1.4.1.zip"
USER_AGENT = "interactive-histomap-render (+https://github.com/by32/interactive-histomap)"
SHA256 = "811f43accbb31a88266d932f8f5563b2d13586fca0ba2693aad1f5fe582b3515"
CACHE = ".cache/assets"
BLEND = "human-base-meshes-bundle-v1.4.1/human_base_meshes_bundle.blend"
OBJECT = "GEO-body_male_realistic"
HEIGHT = 1.72  # metres, before the page's FIGURE_SIZE

# joints of the base mesh at rest (A-pose), metres; y is refined from the mesh
JOINTS = {
    "pelvis": (0.0, 0.93),
    "chest": (0.0, 1.25),
    "neck": (0.0, 1.45),
    "head": (0.0, 1.68),
    "clavicle": (0.03, 1.40),
    "shoulder": (0.175, 1.375),
    "elbow": (0.305, 1.075),
    "wrist": (0.385, 0.835),
    "fingers": (0.43, 0.70),
    "hip": (0.095, 0.90),
    "knee": (0.125, 0.49),
    "ankle": (0.16, 0.09),
}


def fetch():
    """The bundle, downloaded once into .cache/assets and checked."""
    path = os.path.join(CACHE, BLEND)
    if os.path.exists(path):
        return path
    os.makedirs(CACHE, exist_ok=True)
    archive = os.path.join(CACHE, os.path.basename(URL))
    if not os.path.exists(archive):
        print(f"  downloading {URL}")
        # the mirror refuses Python's default user agent (HTTP 403)
        request = urllib.request.Request(URL, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(request, timeout=120) as response, open(archive + ".part", "wb") as out:
            shutil.copyfileobj(response, out, 1 << 20)
        os.replace(archive + ".part", archive)  # a cut-off download never passes for a whole one
    digest = hashlib.sha256(open(archive, "rb").read()).hexdigest()
    if digest != SHA256:
        raise SystemExit(f"{archive}: sha256 {digest}, expected {SHA256}")
    with zipfile.ZipFile(archive) as z:
        z.extractall(CACHE)
    return path


def load():
    """The base body, linked into the scene at its base (unsubdivided) level."""
    with bpy.data.libraries.load(fetch()) as (src, dst):
        dst.objects = [OBJECT]
    obj = dst.objects[0]
    obj = obj.copy()
    obj.data = obj.data.copy()
    for m in list(obj.modifiers):
        obj.modifiers.remove(m)
    bpy.context.scene.collection.objects.link(obj)
    obj.name = "body"
    return obj


def _vertices(obj):
    co = np.empty(len(obj.data.vertices) * 3, dtype=np.float64)
    obj.data.vertices.foreach_get("co", co)
    return co.reshape(-1, 3)


def _joints(co):
    """Joint centres from JOINTS; a joint's depth (y) is the middle of the body around it."""
    J = {}
    for name, (x, z) in JOINTS.items():
        for side, sx in (("R", 1), ("L", -1)) if x else (("", 1),):
            px = sx * x
            near = co[np.hypot(co[:, 0] - px, co[:, 2] - z) < 0.06]
            y = 0.5 * (near[:, 1].min() + near[:, 1].max()) if len(near) else 0.0
            J[name + side] = np.array((px, y, z))
    return J


def _smooth(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def _segment_distance(p, a, b):
    ab = b - a
    t = np.clip(((p - a) @ ab) / (ab @ ab), 0, 1)
    return np.linalg.norm(p - (a + np.outer(t, ab)), axis=1)


def _arm_weights(co, J, s, sx):
    """Weights of the upper arm, forearm and hand on one side, drawn from anatomy:
    the arm is a tube around its bones that starts at a soft boundary across the
    shoulder, and splits into forearm and hand at the elbow and wrist."""
    sh, el, wr, fi = (J[k + s] for k in ("shoulder", "elbow", "wrist", "fingers"))
    up = (el - sh) / np.linalg.norm(el - sh)
    fore = (wr - el) / np.linalg.norm(wr - el)
    rel = co - sh
    along = rel @ up
    radial = np.linalg.norm(rel - np.outer(along, up), axis=1)
    side = co[:, 0] * sx > 0.05
    upper_tube = np.where(along < np.linalg.norm(el - sh), 1 - _smooth(0.068, 0.088, radial), 0.0)
    tips = fi + 0.12 * (fi - wr) / np.linalg.norm(fi - wr)  # past the fingertips
    lower_tube = 1 - _smooth(0.1, 0.13, _segment_distance(co, el, tips))
    arm = side * _smooth(-0.025, 0.045, along) * np.maximum(upper_tube, lower_tube)
    f = _smooth(-0.03, 0.03, (co - el) @ up)
    h = _smooth(-0.015, 0.015, (co - wr) @ fore)
    return arm * (1 - f), arm * f * (1 - h), arm * f * h


def _rotation(a, b):
    """The smallest rotation taking direction a to direction b, as a 3x3 matrix."""
    q = Vector(a).normalized().rotation_difference(Vector(b).normalized())
    return np.array(q.to_matrix())


def _about(R, pivot, M):
    """Rotate by R about pivot, after the affine map M (3x4)."""
    lin = R @ M[:, :3]
    return np.concatenate([lin, (R @ (M[:, 3] - pivot) + pivot)[:, None]], axis=1)


def _apply(M, p):
    return p @ M[:, :3].T + M[:, 3]


def _curl(co, weight, J, s, sx, angle=1.9):
    """Close the hand: past the knuckles, fingers bend toward the palm (which
    faces the thigh in the A-pose), each vertex by an angle growing along the
    finger, so the hand grips a shaft instead of hanging open."""
    wr, fi = J["wrist" + s], J["fingers" + s]
    d = (fi - wr) / np.linalg.norm(fi - wr)
    knuckles = wr + 0.5 * (fi - wr)
    palm = np.array((-sx, 0.0, 0.0))
    palm = palm - (palm @ d) * d
    palm /= np.linalg.norm(palm)
    axis = np.cross(d, palm)
    t = (co - knuckles) @ d
    a = angle * _smooth(0.0, 0.085, t) * (weight > 0.5)
    rel = co - knuckles
    c, sn = np.cos(a)[:, None], np.sin(a)[:, None]
    # Rodrigues' rotation of each vertex about the knuckle line
    rot = rel * c + np.cross(axis, rel) * sn + np.outer(rel @ axis, axis) * (1 - c)
    return np.where((a > 0)[:, None], knuckles + rot, co)


# where the limbs point once posed (front -Y, up +Z, spear side +X)
POSE = {
    # the spear arm: upper arm down and a little out, forearm forward and out to
    # a grip beside the shield's rim
    "R": ((0.22, -0.18, -1.0), (0.42, -1.0, 0.32), (0.3, -1.0, 0.1)),
    # the shield arm: the forearm across the body behind the shield, as through
    # the aspis' porpax, the hand at the grip near its rim
    "L": ((-0.05, -0.55, -1.0), (1.0, -0.3, 0.06), (1.0, -0.15, -0.05)),
}


def prepare(obj=None):
    """Load and pose the body at the soldiers' height. Returns the object,
    per-vertex gait and weight, the joints the page's rig pivots on (metres,
    Blender coordinates): hip, shoulder, grip (spear hand), shield (left hand)
    and the left forearm (elbow, wrist), and which vertices are hands."""
    obj = obj or load()
    co = _vertices(obj)
    J = _joints(co)
    posed = co.copy()
    rest_w = np.ones(len(co))
    arm_w = {}
    hands = np.zeros(len(co), dtype=bool)
    joints = {}
    for s, sx in (("R", 1), ("L", -1)):
        wu, wf, wh = _arm_weights(co, J, s, sx)
        hands |= wh > 0.5
        co = _curl(co, wh, J, s, sx)
        posed = np.where((wh > 0.5)[:, None], co, posed)
        arm_w[s] = wu + wf + wh
        rest_w -= arm_w[s]
        sh, el, wr, fi = (J[k + s] for k in ("shoulder", "elbow", "wrist", "fingers"))
        d_up, d_fore, d_hand = POSE[s]
        eye = np.concatenate([np.eye(3), np.zeros((3, 1))], axis=1)
        Mu = _about(_rotation(el - sh, d_up), sh, eye)
        el2 = _apply(Mu, el)
        Mf = _about(_rotation(_apply(Mu, wr) - el2, d_fore), el2, Mu)
        wr2 = _apply(Mf, wr)
        Mh = _about(_rotation(_apply(Mf, fi) - wr2, d_hand), wr2, Mf)
        fi2 = _apply(Mh, fi)
        # linear blend skinning: the rest of the body stays where it is
        posed += (wu[:, None] * (_apply(Mu, co) - co) + wf[:, None] * (_apply(Mf, co) - co) + wh[:, None] * (_apply(Mh, co) - co))
        joints[s] = dict(shoulder=sh, elbow=el2, wrist=wr2, fingers=fi2)
    # scale to the soldiers' height, feet on the ground
    base = posed[:, 2].min()
    k = HEIGHT / (posed[:, 2].max() - base)

    def fit(p):
        return (np.asarray(p) - (0, 0, base)) * k

    posed = fit(posed)
    obj.data.vertices.foreach_set("co", posed.ravel())
    obj.data.update()
    R, L = joints["R"], joints["L"]
    out = {
        "hip": fit(J["hipR"]),
        "shoulder": fit(R["shoulder"]),
        "grip": fit(R["wrist"] + 0.45 * (R["fingers"] - R["wrist"])),
        "shield": fit(L["wrist"] + 0.3 * (L["fingers"] - L["wrist"])),
        "forearm.L": (fit(L["elbow"]), fit(L["wrist"])),
    }
    # legs: the page's leg swing is linear in gait, so easing gait in over the
    # top of the thigh bends the hip instead of shearing it
    hip_z = out["hip"][2]
    legs = np.sign(posed[:, 0]) * _smooth(hip_z + 0.03, hip_z - 0.14, posed[:, 2]) * _smooth(0.0, 0.045, np.abs(posed[:, 0]))
    arm = np.maximum(arm_w["R"], arm_w["L"])
    gait = np.where(arm > 0.5, np.where(arm_w["R"] > arm_w["L"], 2.0, -2.0), legs)
    weight = np.where(arm > 0.5, _smooth(0.5, 0.95, arm), 1.0)
    gait = np.where(np.abs(gait) < 0.02, 0.0, gait)
    return obj, gait.astype(np.float32), weight.astype(np.float32), out, hands
