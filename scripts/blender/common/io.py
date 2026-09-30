"""Reads the scene description written by scripts/thermopylae/export-scene.mts."""
import json
import os

import numpy as np

SCENE_DIR = os.environ.get("THERMO_SCENE", ".cache/thermopylae/scene")


class SceneData:
    def __init__(self, directory: str = SCENE_DIR):
        self.dir = directory
        with open(os.path.join(directory, "scene.json")) as f:
            self.json = json.load(f)

    def __getitem__(self, key):
        return self.json[key]

    def get(self, key, default=None):
        return self.json.get(key, default)

    def f32(self, name: str) -> np.ndarray:
        return np.fromfile(os.path.join(self.dir, name), dtype=np.float32)

    def u32(self, name: str) -> np.ndarray:
        return np.fromfile(os.path.join(self.dir, name), dtype=np.uint32)

    def stage(self, key: str) -> dict:
        for s in self.json["stages"]:
            if key in (s["id"], s["stage"]):
                return s
        raise KeyError(f"no stage {key!r}")

    def army(self, flat: np.ndarray) -> np.ndarray:
        """figures × 12: x, y, z, heading, scale, battle.xyzw, motion.xy, stride phase (three.js frame)"""
        return flat.reshape(-1, self.json["armyStride"])
