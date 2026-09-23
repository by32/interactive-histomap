"""Cameras that match the page's THREE.PerspectiveCamera exactly."""
import math

import bpy

from .coords import look_rotation, to_blender


def make_camera(data, name="Camera"):
    cam_data = bpy.data.cameras.new(name)
    cam_data.sensor_fit = "VERTICAL"
    cam_data.sensor_height = 24.0
    cam_data.clip_start = data["camera"]["near"]
    cam_data.clip_end = data["camera"]["far"]
    set_fov(cam_data, data["camera"]["fovV"])
    cam = bpy.data.objects.new(name, cam_data)
    bpy.context.scene.collection.objects.link(cam)
    bpy.context.scene.camera = cam
    return cam


def set_fov(cam_data, fov_v_degrees):
    # three.js fov is vertical; with a vertical sensor fit Blender's lens maps the same way
    cam_data.lens = (cam_data.sensor_height / 2) / math.tan(math.radians(fov_v_degrees) / 2)


def place(cam, eye, target):
    cam.location = to_blender(eye)
    cam.rotation_mode = "QUATERNION"
    cam.rotation_quaternion = look_rotation(eye, target)
