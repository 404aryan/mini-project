// Rig-independent playback rules for the procedural sign tables. AvatarPlayer
// applies these to three.js bones; the tests run the same code against every
// exported animation without a browser.
import { defaultPose } from './animations/defaultPose'

export type Axis = 'x' | 'y' | 'z'
/** [bone, 'rotation', axis, target radians, authored direction] — the direction is informational only. */
export type SignInstruction = [string, 'rotation', Axis, number, '+' | '-']
export type SignFrame = SignInstruction[]
export type BoneDelta = Record<Axis, number>
export type SignRuntimeLike = { animations: SignFrame[]; characters: string[]; pending: boolean }

/** One phrase handed to the avatar. `append` queues it behind what is playing. */
export type AvatarRequest = { id: number; phrase: string; append: boolean }

/** Table names are compact Mixamo names; YBot also uses the `mixamorig:` form. */
export const canonicalBone = (bone: string) => bone.replace(/^mixamorig:?/, '')
const axisKey = (bone: string, axis: Axis) => `${canonicalBone(bone)}|${axis}`

/** Every sign starts from and returns to defaultPose's values (zero elsewhere). */
export const REST_POSE: ReadonlyMap<string, number> = (() => {
  const runtime: SignRuntimeLike = { animations: [], characters: [], pending: true }
  defaultPose(runtime)
  const rest = new Map<string, number>()
  for (const frame of runtime.animations) for (const [bone, , axis, target] of frame) rest.set(axisKey(bone, axis), target)
  return rest
})()

export function restValue(bone: string, axis: Axis) {
  return REST_POSE.get(axisKey(bone, axis)) ?? 0
}

/**
 * One instruction per bone axis in a frame; a later instruction replaces an
 * earlier one. Two different targets for the same axis in one frame can never
 * both be reached (CONFUSED used to freeze the queue this way).
 */
export function normalizeFrame(frame: SignFrame): SignFrame {
  const byAxis = new Map<string, SignInstruction>()
  for (const instruction of frame) {
    const key = axisKey(instruction[0], instruction[2])
    byAxis.delete(key)
    byAxis.set(key, instruction)
  }
  return [...byAxis.values()]
}

/**
 * Plays one sign's table into `runtime`, normalizes its frames and, when the
 * sign ends with any joint away from rest, adds a closing frame that returns
 * those joints so the next sign starts from the authored neutral pose.
 * Returns the number of frames queued.
 */
export function appendSignFrames(runtime: SignRuntimeLike, play: (runtime: SignRuntimeLike) => void): number {
  const before = runtime.animations.length
  play(runtime)
  const frames = runtime.animations.splice(before).map(normalizeFrame).filter((frame) => frame.length > 0)
  if (!frames.length) return 0
  const finalTargets = new Map<string, SignInstruction>()
  for (const frame of frames) for (const instruction of frame) finalTargets.set(axisKey(instruction[0], instruction[2]), instruction)
  const closing: SignFrame = []
  for (const [bone, , axis, target] of finalTargets.values()) {
    const rest = restValue(bone, axis)
    if (Math.abs(target - rest) > 1e-9) closing.push([bone, 'rotation', axis, rest, rest > target ? '+' : '-'])
  }
  if (closing.length) frames.push(closing)
  runtime.animations.push(...frames)
  return frames.length
}

/**
 * Moves every instruction of a frame up to `step` radians toward its target,
 * in whichever direction reaches it. (The authored '+'/'-' flags were wrong in
 * several tables and used to make the player skip movements.) Instructions
 * for bones the rig lacks are dropped. Returns true when the frame is done.
 */
export function advanceFrame(frame: SignFrame, deltaFor: (bone: string) => BoneDelta | undefined, step: number, moved?: Set<string>): boolean {
  for (let index = 0; index < frame.length;) {
    const [bone, , axis, target] = frame[index]
    const delta = deltaFor(bone)
    if (!delta) {
      frame.splice(index, 1)
      continue
    }
    const value = delta[axis]
    const next = value < target ? Math.min(value + step, target) : Math.max(value - step, target)
    if (next !== value) {
      delta[axis] = next
      moved?.add(bone)
    }
    if (next === target) frame.splice(index, 1)
    else index += 1
  }
  return frame.length === 0
}

/** Per-frame step that keeps signing speed independent of the display refresh rate. */
export function stepForElapsed(elapsedMs: number, speed: number) {
  const nominalFrame = 1000 / 60
  return 0.05 * speed * (Math.min(Math.max(elapsedMs, 0), 100) / nominalFrame)
}
