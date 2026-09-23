// Splits the film's frames into contiguous ranges for the render-film
// workflow's matrix. Usage: node shards.mjs [first-last] [shards] -> "matrix=[...]"
import { readFileSync } from 'node:fs'

const scene = JSON.parse(readFileSync('.cache/thermopylae/scene/scene.json', 'utf8'))
const [range = '', shardsArg = '20'] = process.argv.slice(2)
const [first, last] = range ? range.split('-').map(Number) : [0, scene.film.frames - 1]
const total = last - first + 1
const shards = Math.max(1, Math.min(Number(shardsArg) || 20, total))
const size = Math.ceil(total / shards)
const matrix = []
for (let start = first, shard = 0; start <= last; start += size, shard++)
  matrix.push({ shard, start, end: Math.min(last, start + size - 1) })
console.log(`matrix=${JSON.stringify(matrix)}`)
console.log(`frames=${total}`)
