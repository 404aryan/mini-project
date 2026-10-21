'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import * as words from './animations/words'
import * as alphabets from './animations/alphabets'
import { NUMBER_ANIMATIONS } from './animations/numbers'
import { defaultPose } from './animations/defaultPose'
import { textToGloss } from './textToGloss'
import { createFaceLayer } from './humanLayer'
import { advanceFrame, appendSignFrames, stepForElapsed, type AvatarRequest, type SignRuntimeLike } from './signQueue'
import { looksPreTranslated } from '@/lib/islVocabulary'

export type { AvatarRequest } from './signQueue'
export type AvatarState = 'loading' | 'ready' | 'signing' | 'error'

/** One queued sign: its gloss token and how many of its frames are still to play. */
type SignSegment = { token: string; frames: number }
type SignRuntime = SignRuntimeLike & {
  /** Queued signs in play order, so live backlog can be trimmed by whole signs. */
  segments: SignSegment[]
  avatar?: THREE.Object3D
}
/** Tokens waiting for the avatar to load, in arrival order. */
type PendingTokens = { tokens: string[]; append: boolean }
type AvatarFailure = 'webgl' | 'load'

type BoneUserData = {
  restQuaternion?: THREE.Quaternion
  gestureRestQuaternion?: THREE.Quaternion
  restPosition?: THREE.Vector3
  restScale?: THREE.Vector3
  delta?: { x: number; y: number; z: number }
}

type AvatarPlayerProps = {
  /** Phrases in arrival order with increasing ids; each new id is played once. */
  requests: AvatarRequest[]
  model?: 'default' | 'human'
  stopId?: number
  resetId?: number
  speed?: number
  lowPower?: boolean
  onStateChange: (state: AvatarState) => void
}

const wordAnimations = words as unknown as Record<string, (runtime: SignRuntimeLike) => void>
const alphabetAnimations = alphabets as unknown as Record<string, (runtime: SignRuntimeLike) => void>
const numberAnimations = NUMBER_ANIMATIONS as unknown as Record<string, (runtime: SignRuntimeLike) => void>
// Live speech can arrive faster than signs play. Beyond this many queued signs
// the oldest waiting ones are dropped so the avatar stays close to the speaker.
const MAX_LIVE_BACKLOG = 8
const FAILURE_MESSAGES: Record<AvatarFailure, string> = {
  webgl: 'The 3D avatar needs WebGL, which this browser or device could not start.',
  load: 'The avatar model could not be loaded.',
}

export function AvatarPlayer({ requests, model = 'default', stopId = 0, resetId = 0, speed = 1, lowPower = false, onStateChange }: AvatarPlayerProps) {
  const mountRef = useRef<HTMLDivElement>(null)
  const runtimeRef = useRef<SignRuntime>({ animations: [], segments: [], characters: [], pending: true })
  const readyRef = useRef(false)
  const statusRef = useRef<AvatarState>('loading')
  // Requests that arrive before the GLB is ready wait here in order, so live
  // fragments are not overwritten while the avatar loads.
  const pendingRef = useRef<PendingTokens[]>([])
  const playedIdRef = useRef(0)
  const lastTokensRef = useRef<string[]>([])
  // Set by Reset so the reload does not replay what was on screen.
  const skipReplayRef = useRef(false)
  const stopSeenRef = useRef(stopId)
  const resetSeenRef = useRef(resetId)
  const speedRef = useRef(speed)
  const lowPowerRef = useRef(lowPower)
  const needsRenderRef = useRef(true)
  const [failure, setFailure] = useState<AvatarFailure | null>(null)
  const [loadAttempt, setLoadAttempt] = useState(0)
  useEffect(() => { lowPowerRef.current = lowPower }, [lowPower])

  useEffect(() => {
    speedRef.current = speed
  }, [speed])

  const report = useCallback((state: AvatarState) => {
    statusRef.current = state
    onStateChange(state)
  }, [onStateChange])

  useEffect(() => {
    const fresh = requests.filter((request) => request.id > playedIdRef.current)
    if (!fresh.length) return
    playedIdRef.current = fresh[fresh.length - 1].id
    const runtime = runtimeRef.current
    for (const request of fresh) {
      const tokens = phraseTokens(request.phrase)
      lastTokensRef.current = tokens
      if (readyRef.current) enqueueTokens(tokens, runtime, request.append)
      else if (!request.append) pendingRef.current = [{ tokens, append: false }]
      else {
        const pending = pendingRef.current
        pending.push({ tokens, append: true })
        // Keep a leading replacement phrase; drop the oldest live fragments.
        while (pending.length > MAX_LIVE_BACKLOG) pending.splice(pending[0].append ? 0 : 1, 1)
      }
    }
    if (readyRef.current) {
      needsRenderRef.current = true
      // Input with no playable sign must not leave the status on "signing".
      report(runtime.animations.length ? 'signing' : 'ready')
    } else if (statusRef.current !== 'error') {
      report('loading')
    }
  }, [requests, report])

  useEffect(() => {
    if (stopId === stopSeenRef.current) return
    stopSeenRef.current = stopId
    pendingRef.current = []
    runtimeRef.current.animations = []
    runtimeRef.current.segments = []
    if (statusRef.current === 'signing') report('ready')
  }, [stopId, report])

  useEffect(() => {
    if (resetId === resetSeenRef.current) return
    resetSeenRef.current = resetId
    // Reset reloads the whole avatar (renderer, model and pose) and plays
    // nothing that was waiting or unfinished.
    pendingRef.current = []
    lastTokensRef.current = []
    skipReplayRef.current = true
    playedIdRef.current = 0
    setFailure(null)
    setLoadAttempt((attempt) => attempt + 1)
  }, [resetId])

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const runtime = runtimeRef.current
    // The previous run's cleanup has already honoured a Reset.
    skipReplayRef.current = false
    runtime.animations = []
    runtime.segments = []
    runtime.characters = []
    runtime.pending = true
    runtime.avatar = undefined
    readyRef.current = false
    needsRenderRef.current = true
    report('loading')

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    } catch (error) {
      // No usable WebGL context: show a recoverable notice instead of throwing
      // out of the effect and taking the page down with it.
      console.warn('[ISL] WebGL unavailable:', error)
      setFailure('webgl')
      report('error')
      return
    }
    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#efede7')
    // Keep the avatar framed from head through the hips, including when the
    // canvas becomes wider on desktop. The old close-up was centered on the
    // chest, which cropped the lower body out of the stage.
    const camera = new THREE.PerspectiveCamera(31, 1, 0.1, 1000)
    camera.position.set(0, 0.62, 3)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFShadowMap
    renderer.outputColorSpace = THREE.SRGBColorSpace
    mount.appendChild(renderer.domElement)

    scene.add(new THREE.HemisphereLight('#fff9ed', '#8f9e82', 2.4))
    const keyLight = new THREE.DirectionalLight('#ffffff', 3.6)
    keyLight.position.set(3, 5, 4)
    keyLight.castShadow = true
    scene.add(keyLight)
    const rimLight = new THREE.PointLight('#ef714f', 15, 8)
    rimLight.position.set(-2.8, 2, 2)
    scene.add(rimLight)

    const resize = () => {
      // Layout size, not getBoundingClientRect(): the stage animates between the
      // sign-mode PiP and full size with transforms, and a transformed rect left
      // the drawing buffer at a squashed aspect after returning from sign mode.
      const width = mount.clientWidth, height = mount.clientHeight
      if (!width || !height) return
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height, false)
      needsRenderRef.current = true
    }
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(mount)
    resize()

    let disposed = false
    const loader = new GLTFLoader()
    // Both avatars are the same ybot rig. "Human" layers a procedural face and
    // warm-toned armour on top at runtime; the model file is untouched.
    const modelPath = '/models/ybot.glb'
    loader.load(modelPath, (gltf) => {
      const avatar = gltf.scene
      // A load that finishes after a switch or unmount still owns GPU buffers.
      if (disposed) {
        disposeObject(avatar)
        return
      }
      avatar.traverse((child) => {
        child.castShadow = true
        child.frustumCulled = false
      })
      runtime.avatar = avatar
      // Preserve the requested close framing, while placing the face just
      // above the canvas centre instead of against the top edge.
      avatar.position.y = -0.85
      scene.add(avatar)
      if (model === 'human') {
        applyWarmArmorColors(avatar)
        const headBone = getAvatarBone(avatar, 'mixamorig:Head')
        if (headBone) {
          const faceLayer = createFaceLayer()
          // Compensate for ybot's 0.01 rig scale and sit the head on the neck.
          faceLayer.scale.set(13.5, 13.5, 13.5)
          faceLayer.position.set(0, 2, 1)
          headBone.add(faceLayer)
        }
      }
      // Animation tables author each gesture as a delta rotation from rest.
      // YBot's rig ships in a pure identity T-pose, so composing the delta onto
      // each bone's captured rest quaternion reproduces the authored pose.
      captureRestQuaternions(avatar)
      // Apply the existing default-pose instructions immediately so every new
      // instance starts clean. Keeping those instructions in the frame queue
      // allowed a switch or reset to display an intermediate bone position.
      resetAvatar(runtime)
      needsRenderRef.current = true
      readyRef.current = true
      const waiting = pendingRef.current
      pendingRef.current = []
      for (const { tokens, append } of waiting) enqueueTokens(tokens, runtime, append)
      report(runtime.animations.length ? 'signing' : 'ready')
    }, undefined, (error) => {
      if (disposed) return
      console.warn('[ISL] avatar model failed to load:', error)
      setFailure('load')
      report('error')
    })

    const bones = new Map<string, THREE.Object3D | undefined>()
    const boneFor = (boneName: string) => {
      if (!bones.has(boneName)) bones.set(boneName, runtime.avatar && getAvatarBone(runtime.avatar, boneName))
      return bones.get(boneName)
    }
    const deltaFor = (boneName: string) => {
      const bone = boneFor(boneName)
      if (!bone) return undefined
      const userData = bone.userData as BoneUserData
      return userData.delta ?? (userData.delta = { x: 0, y: 0, z: 0 })
    }

    let animationFrame = 0
    let nextFrameAt = 0
    let lastStepAt = performance.now()
    let wasSigning = false
    let lastRender = 0
    let powerSaving = false
    const animate = (now: number) => {
      animationFrame = requestAnimationFrame(animate)
      if (document.hidden) return
      if (powerSaving !== lowPowerRef.current) {
        powerSaving = lowPowerRef.current
        renderer.setPixelRatio(powerSaving ? 1 : Math.min(window.devicePixelRatio, 2))
        renderer.shadowMap.enabled = !powerSaving
        resize()
      }
      // A resting rig needs no repeated WebGL draws. Resize, loading, reset,
      // and queued signs invalidate it without unmounting or reloading the GLB.
      if (!runtime.animations.length && !wasSigning && !needsRenderRef.current) {
        lastStepAt = now
        return
      }
      // Keep the rig and GLB alive, but give camera inference the GPU budget.
      if (powerSaving && now - lastRender < 1000 / 12) return
      lastRender = now
      // Movement scales with elapsed time, so signing speed is the same at
      // 60 Hz, 144 Hz and the 12 FPS power-saving rate.
      const elapsed = now - lastStepAt
      lastStepAt = now
      const queue = runtime.animations
      if (runtime.avatar && queue.length && now >= nextFrameAt) {
        wasSigning = true
        const moved = new Set<string>()
        const done = advanceFrame(queue[0], deltaFor, stepForElapsed(elapsed, speedRef.current), moved)
        for (const boneName of moved) {
          const bone = boneFor(boneName)
          if (bone) applyBoneDelta(bone)
        }
        if (done) {
          queue.shift()
          const segment = runtime.segments[0]
          if (segment && --segment.frames <= 0) runtime.segments.shift()
          // Brief hold on each authored key pose so the movement still reads,
          // without the dead air that made every sign feel sluggish (was 360).
          nextFrameAt = now + 170 / speedRef.current
        }
      }
      if (wasSigning && !queue.length) {
        wasSigning = false
        report('ready')
      }
      renderer.render(scene, camera)
      needsRenderRef.current = false
    }
    animationFrame = requestAnimationFrame(animate)

    return () => {
      disposed = true
      readyRef.current = false
      cancelAnimationFrame(animationFrame)
      resizeObserver.disconnect()
      const avatar = runtime.avatar
      if (avatar) {
        // A model switch replays what had not finished (or else the latest
        // phrase) on the new avatar, ahead of anything that arrives meanwhile.
        const remaining = runtime.segments.map((segment) => segment.token)
        const replay = remaining.length ? remaining : lastTokensRef.current
        if (replay.length && !skipReplayRef.current) pendingRef.current = [{ tokens: replay, append: false }, ...pendingRef.current]
        scene.remove(avatar)
        disposeObject(avatar)
      }
      runtime.avatar = undefined
      runtime.animations = []
      runtime.segments = []
      renderer.dispose()
      renderer.forceContextLoss()
      mount.replaceChildren()
    }
  }, [model, loadAttempt, report])

  const retry = () => {
    setFailure(null)
    setLoadAttempt((attempt) => attempt + 1)
  }

  return (
    <>
      <div ref={mountRef} className="avatar-canvas" role="img" aria-label="Animated Indian Sign Language avatar" />
      {failure ? (
        <div className="avatar-load-placeholder" role="alert">
          <div style={{ display: 'grid', justifyItems: 'center', gap: '.7rem', maxWidth: '18rem', padding: '0 1rem', textAlign: 'center' }}>
            <span>{FAILURE_MESSAGES[failure]}</span>
            <button type="button" className="voice-input" style={{ minHeight: 34, background: 'var(--lime)', color: 'var(--primary)' }} onClick={retry}>Retry</button>
          </div>
        </div>
      ) : null}
    </>
  )
}

// Applies colour only to the existing skinned robot mesh. No vertices, bones,
// weights, or animation instructions are changed, so the ISL movements remain
// exactly the same while the body adopts the requested warm armour palette.
function applyWarmArmorColors(avatar: THREE.Object3D) {
  const chestCream = new THREE.Color('#e2d3bc')
  const warmBeige = new THREE.Color('#d4bea1')
  const limbBeige = new THREE.Color('#c8b093')
  const lowerBeige = new THREE.Color('#bfa88c')
  const neckCream = new THREE.Color('#d9c7ae')
  const jointCharcoal = new THREE.Color('#4a4641')

  avatar.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) return
    const mesh = child as THREE.Mesh
    const positions = mesh.geometry?.attributes.position
    if (!positions) return

    if (mesh.name === 'Alpha_Surface') {
      const colors = new Float32Array(positions.count * 3)
      for (let index = 0; index < positions.count; index += 1) {
        const x = positions.getX(index)
        const y = positions.getY(index)
        const z = positions.getZ(index)
        const isNeck = y > 1.48 && Math.abs(x) < 0.12 && z > -0.1
        const isChest = y >= 1.18 && Math.abs(x) <= 0.38
        const isWaistOrHip = y >= 0.78 && y < 1.18 && Math.abs(x) <= 0.36
        const isArm = Math.abs(x) > 0.34 && y > 0.82
        const isCalfOrFoot = y < 0.42
        const color = isNeck
          ? neckCream
          : isChest
            ? chestCream
            : isWaistOrHip
              ? warmBeige
              : isArm
                ? limbBeige
                : isCalfOrFoot
                  ? lowerBeige
                  : warmBeige
        colors[index * 3] = color.r
        colors[index * 3 + 1] = color.g
        colors[index * 3 + 2] = color.b
      }
      mesh.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
      disposeMaterials(mesh.material)
      mesh.material = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.63,
        metalness: 0.04,
      })
    }

    if (mesh.name === 'Alpha_Joints') {
      const colors = new Float32Array(positions.count * 3)
      for (let index = 0; index < positions.count; index += 1) {
        colors[index * 3] = jointCharcoal.r
        colors[index * 3 + 1] = jointCharcoal.g
        colors[index * 3 + 2] = jointCharcoal.b
      }
      mesh.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
      disposeMaterials(mesh.material)
      mesh.material = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.72,
        metalness: 0.07,
      })
    }
  })
}

// Frees the GPU buffers, programs and textures an object tree holds. Renderer
// disposal alone leaves these behind, so every avatar switch used to leak them.
function disposeMaterials(material: THREE.Material | THREE.Material[] | undefined) {
  for (const entry of Array.isArray(material) ? material : material ? [material] : []) {
    for (const value of Object.values(entry)) if (value instanceof THREE.Texture) value.dispose()
    entry.dispose()
  }
}

function disposeObject(root: THREE.Object3D) {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.geometry?.dispose()
    disposeMaterials(mesh.material)
  })
}

// Scratch objects reused every frame to avoid per-frame GC pressure.
const _scratchEuler = new THREE.Euler()
const _scratchDeltaQ = new THREE.Quaternion()
const _scratchResult = new THREE.Quaternion()

function applyBoneDelta(bone: THREE.Object3D) {
  const userData = bone.userData as BoneUserData
  const delta = userData.delta ?? (userData.delta = { x: 0, y: 0, z: 0 })
  _scratchEuler.set(delta.x, delta.y, delta.z)
  _scratchDeltaQ.setFromEuler(_scratchEuler)
  const gestureRest = userData.gestureRestQuaternion || userData.restQuaternion
  if (gestureRest) {
    _scratchResult.copy(gestureRest).multiply(_scratchDeltaQ)
    bone.quaternion.copy(_scratchResult)
  } else {
    bone.quaternion.copy(_scratchDeltaQ)
  }
}

function getAvatarBone(avatar: THREE.Object3D, boneName: string) {
  // Animation tables use compact Mixamo names. YBot stores
  // `mixamorig:RightArm`; the Ready Player Me human stores `RightArm`.
  // Resolve both forms (and armature-prefixed exporter variants) so the same
  // proven animation files work for both avatars.
  const compact = boneName.replace(/^mixamorig:?/, '')
  const candidates = [boneName, `mixamorig:${compact}`, compact]
  for (const candidate of candidates) {
    const bone = avatar.getObjectByName(candidate)
    if (bone) return bone
  }
  let resolved: THREE.Object3D | undefined
  avatar.traverse((child) => {
    if (resolved || child.type !== 'Bone') return
    const normalized = child.name.split('|').pop()?.replace(/^mixamorig:?/, '')
    if (normalized === compact) resolved = child
  })
  if (resolved) return resolved
  return undefined
}

function captureRestQuaternions(avatar: THREE.Object3D) {
  avatar.traverse((child) => {
    if (child.type !== 'Bone') return
    const userData = child.userData as BoneUserData
    userData.restQuaternion = child.quaternion.clone()
    userData.gestureRestQuaternion = userData.restQuaternion.clone()
    userData.restPosition = child.position.clone()
    userData.restScale = child.scale.clone()
  })
}

function resetAvatar(runtime: SignRuntime) {
  const avatar = runtime.avatar
  if (!avatar) return

  runtime.animations = []
  runtime.segments = []
  runtime.characters = []
  avatar.traverse((child) => {
    if (child.type !== 'Bone') return
    const userData = child.userData as BoneUserData
    if (userData.gestureRestQuaternion) child.quaternion.copy(userData.gestureRestQuaternion)
    if (userData.restPosition) child.position.copy(userData.restPosition)
    if (userData.restScale) child.scale.copy(userData.restScale)
    userData.delta = { x: 0, y: 0, z: 0 }
  })

  // Every word table is authored from defaultPose(). Apply that same proven
  // starting pose to both rigs, then snap it before playback begins. The
  // human rig has the same bones without the `mixamorig:` prefix, which
  // getAvatarBone() resolves above.
  defaultPose(runtime)
  for (const frame of runtime.animations) {
    for (const [boneName, , axis, target] of frame) {
      const bone = getAvatarBone(avatar, boneName)
      if (!bone) continue
      const userData = bone.userData as BoneUserData
      const delta = userData.delta ?? (userData.delta = { x: 0, y: 0, z: 0 })
      delta[axis] = target
      applyBoneDelta(bone)
    }
  }
  runtime.animations = []
  runtime.characters = []
}

// The page resolves every phrase to canonical ISL gloss (Gemini online,
// rule-based offline) before it reaches here. When the input is already made
// of playable tokens, skip re-translation and play it verbatim — this keeps
// the 3D player dumb and fast. Raw English still falls through to textToGloss
// so direct callers and legacy paths keep working.
function phraseTokens(input: string): string[] {
  return looksPreTranslated(input)
    ? input.trim().toUpperCase().split(/\s+/).filter(Boolean)
    : [...(textToGloss(input) as { tokens: string[] }).tokens]
}

function enqueueTokens(tokens: string[], runtime: SignRuntime, append = false) {
  if (!append) {
    // Snap the rig back to the neutral pose first. A sign the user interrupted
    // mid-movement leaves bones partway through a gesture, and every sign is
    // authored as deltas from rest.
    if (runtime.avatar) resetAvatar(runtime)
    runtime.animations = []
    runtime.segments = []
  }

  for (const token of tokens) {
    const word = token.toUpperCase()
    // Hyphenated tokens are always spelled (A-M-I-T keeps its letter I); a
    // plain token plays its word sign when one exists, otherwise it is spelled.
    // Each sign ends back at rest, so residual joints never leak into the next.
    const wordAnimation = word.includes('-') ? undefined : wordAnimations[word]
    let added = 0
    if (wordAnimation) added = appendSignFrames(runtime, wordAnimation)
    else for (const character of word.replace(/-/g, '')) {
      const play = alphabetAnimations[character] ?? numberAnimations[character]
      if (play) added += appendSignFrames(runtime, play)
    }
    if (added > 0) runtime.segments.push({ token: word, frames: added })
  }
  // The tables log each played character; nothing reads them, so a long live
  // session must not keep growing that list.
  runtime.characters = []

  // Keep the sign in progress and the newest speech; drop the oldest waiting signs.
  if (append) {
    while (runtime.segments.length > MAX_LIVE_BACKLOG) {
      runtime.animations.splice(runtime.segments[0].frames, runtime.segments[1].frames)
      runtime.segments.splice(1, 1)
    }
  }
}
