const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createHash } = require('node:crypto')
const { loadModule } = require('./load-module.cjs')

// One module cache so the tables and the queue share the same defaultPose.
const cache = new Map()
const load = (file) => loadModule(file, {}, cache)
const { advanceFrame, appendSignFrames, canonicalBone, normalizeFrame, restValue, stepForElapsed } = load('components/avatar/signQueue.ts')
const words = load('components/avatar/animations/words.js')
const alphabets = load('components/avatar/animations/alphabets.js')
const { NUMBER_ANIMATIONS } = load('components/avatar/animations/numbers.js')

const signs = [
  ...Object.entries(words).filter(([, play]) => typeof play === 'function').map(([name, play]) => [`word ${name}`, play]),
  ...Object.entries(alphabets).filter(([, play]) => typeof play === 'function').map(([name, play]) => [`letter ${name}`, play]),
  ...Object.entries(NUMBER_ANIMATIONS).map(([name, play]) => [`digit ${name}`, play]),
]

const newRuntime = () => ({ animations: [], characters: [], pending: true })

// A rig of plain per-bone deltas that starts in the authored rest pose.
function createRig() {
  const deltas = new Map()
  const deltaFor = (bone) => {
    const key = canonicalBone(bone)
    if (!deltas.has(key)) deltas.set(key, { x: restValue(bone, 'x'), y: restValue(bone, 'y'), z: restValue(bone, 'z') })
    return deltas.get(key)
  }
  return { deltas, deltaFor }
}

// Plays one sign the way AvatarPlayer does and checks every authored target is reached.
function playSign(rig, name, play) {
  const runtime = newRuntime()
  const count = appendSignFrames(runtime, play)
  assert.ok(count > 0, `${name} queues frames`)
  for (const frame of runtime.animations) {
    const targets = frame.map(([bone, , axis, target]) => [bone, axis, target])
    let ticks = 0
    while (!advanceFrame(frame, rig.deltaFor, 0.05)) assert.ok(++ticks < 2000, `${name} frame finishes`)
    for (const [bone, axis, target] of targets) assert.equal(rig.deltaFor(bone)[axis], target, `${name} reaches ${bone}.${axis}`)
  }
}

test('every sign finishes, reaches each target and returns to rest', () => {
  assert.ok(signs.length > 100, 'all exported signs are covered')
  const rig = createRig()
  for (const [name, play] of signs) {
    playSign(rig, name, play)
    for (const [bone, delta] of rig.deltas) {
      for (const axis of ['x', 'y', 'z']) {
        assert.ok(Math.abs(delta[axis] - restValue(bone, axis)) < 1e-9, `${name} leaves ${bone}.${axis} at ${delta[axis]}`)
      }
    }
  }
})

test('imported CONFUSED frames resolve conflicting joint targets before playback', () => {
  const runtime = newRuntime()
  appendSignFrames(runtime, words.CONFUSED)
  for (const frame of runtime.animations) {
    const seen = new Map()
    for (const [bone, , axis, target] of frame) {
      const key = `${canonicalBone(bone)}.${axis}`
      if (seen.has(key)) assert.equal(seen.get(key), target, `CONFUSED ${key}`)
      seen.set(key, target)
    }
  }
  // Arrays from the module context are compared as plain copies.
  const normalized = Array.from(normalizeFrame([['B', 'rotation', 'z', 0, '-'], ['B', 'rotation', 'z', 1, '+']]), (instruction) => [...instruction])
  assert.deepEqual(normalized, [['B', 'rotation', 'z', 1, '+']])
})

test('movement ignores a wrong authored direction flag', () => {
  const delta = { x: 0, y: 0, z: 0 }
  const frame = [['Thumb', 'rotation', 'y', 0.3, '-']]
  let ticks = 0
  while (!advanceFrame(frame, () => delta, 0.05)) ticks += 1
  assert.equal(delta.y, 0.3)
  assert.ok(ticks >= 5, 'the movement is animated, not skipped')
})

test('letter A uses the restored repository gesture', () => {
  const runtime = newRuntime()
  alphabets.A(runtime)
  const bones = runtime.animations.flat().map(([bone]) => bone)
  assert.ok(bones.some((bone) => /RightHand(Index|Middle|Ring|Pinky|Thumb)/.test(bone)), 'right hand shapes A')
  assert.ok(!bones.some((bone) => /LeftHand/.test(bone)), 'repository A uses the right hand')
})

test('all imported animation tables and model assets match the pinned repository source', () => {
  const source = require('../components/avatar/animation-source.json')
  assert.equal(Object.keys(source.files).length, 51)
  for (const [file, expected] of Object.entries(source.files)) {
    const absolute = path.join(__dirname, '..', file)
    const content = file.endsWith('.glb') ? fs.readFileSync(absolute) : fs.readFileSync(absolute, 'utf8').replace(/^\uFEFF/, '').replaceAll('\r\n', '\n')
    assert.equal(createHash('sha256').update(content).digest('hex'), expected, file)
  }
})

test('every word, letter and number targets existing bones in the restored YBot rig', () => {
  const glb = fs.readFileSync(path.join(__dirname, '../public/models/ybot.glb'))
  const jsonLength = glb.readUInt32LE(12)
  const model = JSON.parse(glb.subarray(20, 20 + jsonLength).toString('utf8'))
  const names = new Set(model.nodes.map((node) => canonicalBone(node.name || '')))
  assert.equal(Object.keys(alphabets).filter((name) => /^[A-Z]$/.test(name)).length, 26)
  assert.equal(Object.keys(NUMBER_ANIMATIONS).length, 10)
  for (const [name, play] of signs) {
    const runtime = newRuntime()
    appendSignFrames(runtime, play)
    for (const frame of runtime.animations) for (const [bone, , axis, target] of frame) {
      assert.ok(names.has(canonicalBone(bone)), `${name}: ${bone} exists`)
      assert.ok(['x', 'y', 'z'].includes(axis) && Number.isFinite(target), `${name}: valid rotation`)
    }
  }
})

test('signing speed follows elapsed time, not the display refresh rate', () => {
  const at60 = stepForElapsed(1000 / 60, 1)
  assert.ok(Math.abs(at60 - 0.05) < 1e-12)
  assert.ok(Math.abs(stepForElapsed(1000 / 144, 1) * 144 - at60 * 60) < 1e-9)
  assert.ok(Math.abs(stepForElapsed(1000 / 12, 1) * 12 - at60 * 60) < 1e-9)
  assert.ok(Math.abs(stepForElapsed(1000 / 60, 2) - 0.1) < 1e-12)
  assert.equal(stepForElapsed(5000, 1), stepForElapsed(100, 1), 'a long pause does not jump the pose')
})
