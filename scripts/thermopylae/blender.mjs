// Runs scripts/blender/run.py under Blender, whichever way it is installed:
//   $BLENDER          a Blender binary (e.g. the official tarball, or a GPU machine's install)
//   $BLENDER_PYTHON   a Python with the bpy module
//   .cache/blender-venv  the pinned bpy wheel, created by `npm run setup:blender`
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'

const args = process.argv.slice(2)
const venv = '.cache/blender-venv'
// a fixed hash seed keeps any set/dict ordering in the Python side stable run to run
const env = { ...process.env, PYTHONHASHSEED: '0' }
const run = (cmd, argv) => {
  const r = spawnSync(cmd, argv, { stdio: 'inherit', env })
  if (r.error) throw r.error
  return r.status ?? 1
}

if (args[0] === '--setup') {
  const python = process.env.PYTHON ?? 'python3.11'
  if (!existsSync(`${venv}/bin/python`) && run(python, ['-m', 'venv', venv])) process.exit(1)
  process.exit(run(`${venv}/bin/pip`, ['install', '-r', 'scripts/blender/requirements.txt']))
}

const script = 'scripts/blender/run.py'
let status
if (process.env.BLENDER) status = run(process.env.BLENDER, ['-b', '--factory-startup', '-P', script, '--', ...args])
else {
  const python = process.env.BLENDER_PYTHON ?? `${venv}/bin/python`
  if (!existsSync(python)) {
    console.error(`No Blender found. Run \`npm run setup:blender\`, or set $BLENDER or $BLENDER_PYTHON.`)
    process.exit(1)
  }
  status = run(python, [script, ...args])
}
process.exit(status)
