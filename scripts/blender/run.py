"""Entry point for the Blender side of the Thermopylae pipeline.

  .cache/blender-venv/bin/python scripts/blender/run.py <command> [options]
  blender -b --factory-startup -P scripts/blender/run.py -- <command> [options]

Commands: selftest, models
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)


def main(argv):
    if "--" in argv:
        argv = argv[argv.index("--") + 1 :]
    if not argv:
        print(__doc__)
        return 2
    command, rest = argv[0], argv[1:]
    if command == "selftest":
        import selftest

        return selftest.main(rest)
    if command == "models":
        import models

        return models.main(rest)
    print(f"unknown command {command!r}\n{__doc__}")
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]) or 0)
