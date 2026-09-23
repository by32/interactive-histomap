"""The one place three.js space meets Blender space.

three.js: x east, y up, z south.  Blender: X east, Y north, Z up.
So (x, y, z)_three -> (x, -z, y)_blender. A three.js heading h about +y
(0 faces +z, i.e. south) is a rotation of h about Blender +Z for a model
whose front faces Blender -Y.
"""
import numpy as np
from mathutils import Matrix, Vector


def to_blender(p):
    return (p[0], -p[2], p[1])


def points_to_blender(a: np.ndarray) -> np.ndarray:
    a = a.reshape(-1, 3)
    return np.stack([a[:, 0], -a[:, 2], a[:, 1]], axis=1)


AXIS = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))


def matrix_to_blender(m16) -> Matrix:
    """three.js column-major world matrix -> Blender matrix (same object, new frame)"""
    m = Matrix([m16[0:4], m16[4:8], m16[8:12], m16[12:16]]).transposed()
    return AXIS @ m @ AXIS.inverted()


def look_rotation(eye, target):
    """Rotation for a camera at eye looking at target with world-up +Z (three's lookAt with up +y)."""
    d = Vector(to_blender(target)) - Vector(to_blender(eye))
    return d.to_track_quat("-Z", "Y")
