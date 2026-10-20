'use client'

import { useId } from 'react'
import { motion, useTransform, type MotionValue } from 'motion/react'
import { STORY_OUTLINE as outline, STORY_SEGMENTS as segments, STORY_JOINTS, STORY_SENTENCE } from '@/lib/sign/story-data'


function Joint({ index, progress }: { index: number; progress: MotionValue<number> }) {
  const opacity = useTransform(progress, [.245 + index * .008, .285 + index * .008], [0, 1])
  const scale = useTransform(progress, [.245 + index * .008, .285 + index * .008], [.1, 1])
  const [cx, cy] = STORY_JOINTS[index]
  return <motion.circle className={`sign-story-joint finger-${Math.max(0, Math.floor((index - 1) / 4))}`} cx={cx} cy={cy} r={index === 0 ? 5 : 3.6} style={{ opacity, scale }} />
}

function Bone({ from, to, finger, index, progress }: { from: number; to: number; finger: number; index: number; progress: MotionValue<number> }) {
  const [x1, y1] = STORY_JOINTS[from], [x2, y2] = STORY_JOINTS[to]
  const length = Math.hypot(x2 - x1, y2 - y1)
  const strokeDashoffset = useTransform(progress, [.245 + index * .008, .29 + index * .008], [length, 0])
  const opacity = useTransform(progress, [.245 + index * .008, .27 + index * .008], [0, 1])
  return <motion.line className={`sign-story-bone finger-${finger}`} x1={x1} y1={y1} x2={x2} y2={y2} strokeDasharray={length} style={{ strokeDashoffset, opacity }} />
}

function FeatureParticle({ index, progress }: { index: number; progress: MotionValue<number> }) {
  const finger = index % 5
  const start = STORY_JOINTS[[4, 8, 12, 16, 20][finger]]
  const t = useTransform(progress, [.5 + index * .006, .67 + index * .006], [0, 1])
  const x = useTransform(t, (v) => (1 - v) ** 3 * start[0] + 3 * (1 - v) ** 2 * v * 350 + 3 * (1 - v) * v ** 2 * 375 + v ** 3 * 464 - start[0])
  const y = useTransform(t, (v) => (1 - v) ** 3 * start[1] + 3 * (1 - v) ** 2 * v * (100 + finger * 45) + 3 * (1 - v) * v ** 2 * 240 + v ** 3 * 240 - start[1])
  const opacity = useTransform(t, [0, .12, .83, 1], [0, .9, .9, 0])
  return <motion.circle className={`sign-story-particle finger-${finger}`} cx={start[0]} cy={start[1]} r={index < 5 ? 3.8 : 2.4} style={{ x, y, opacity }} />
}

function StoryLetter({ letter, index, progress }: { letter: string; index: number; progress: MotionValue<number> }) {
  const begin = .77 + index * .009
  const opacity = useTransform(progress, [begin, begin + .055], [0, 1])
  const y = useTransform(progress, [begin, begin + .07], [25 + index % 3 * 9, 0])
  const x = useTransform(progress, [begin, begin + .07], [(index - 6) * 5, 0])
  return <motion.text x={157 + index * 25} y="246" className="sign-story-sentence-letter" style={{ opacity, x, y }}>{letter === ' ' ? '\u00a0' : letter}</motion.text>
}

function WaveBar({ index, progress }: { index: number; progress: MotionValue<number> }) {
  const height = 12 + Math.abs(Math.sin(index * 1.31)) * 29
  const scaleY = useTransform(progress, (v) => .22 + .78 * Math.abs(Math.sin(Math.max(0, v - .83) * 42 - index * .65)))
  return <motion.rect x={225 + index * 9} y={301 - height / 2} width="4" height={height} rx="2" className="sign-story-wave-bar" style={{ scaleY, transformOrigin: '50% 50%' }} />
}

export function StoryScene({ progress, staticBeat }: { progress: MotionValue<number>; staticBeat?: number }) {
  const id = useId().replace(/:/g, '')
  const y = useTransform(progress, [0, .19], [100, 0])
  const x = useTransform(progress, [0, .19], [-30, 0])
  const rotate = useTransform(progress, [0, .19], [-8, 0])
  const handOpacity = useTransform(progress, [0, .1, .68, .79], [0, 1, 1, 0])
  const outlineOpacity = useTransform(progress, [.2, .45, .7], [1, .22, .12])
  const guideOpacity = useTransform(progress, [.23, .3, .72, .78], [0, 1, 1, 0])
  const flowOpacity = useTransform(progress, [.48, .54, .74, .81], [0, 1, 1, 0])
  const nodeScale = useTransform(progress, [.49, .61, .71], [.88, 1.05, 1])
  const outputOpacity = useTransform(progress, [.74, .81], [0, 1])
  return <svg className="sign-story-scene" viewBox="0 0 640 480" fill="none" aria-hidden="true">
    <defs><linearGradient id={`hand-${id}`} x1="170" y1="100" x2="310" y2="410" gradientUnits="userSpaceOnUse"><stop stopColor="var(--background)" /><stop offset="1" stopColor="var(--surface)" /></linearGradient></defs>
    <circle cx="317" cy="240" r="177" className="sign-story-orbit" /><circle cx="317" cy="240" r="204" className="sign-story-orbit is-outer" />
    <path d="M 64 64 H 85 M 64 64 V 85 M 555 64 H 576 M 576 64 V 85 M 64 395 V 416 H 85 M 555 416 H 576 V 395" className="sign-story-canvas-corners" />
    {(staticBeat === undefined || staticBeat < 3) && <motion.g style={{ x, y, rotate, opacity: handOpacity }}>
      <motion.g style={{ opacity: outlineOpacity }}><path d={outline} fill={`url(#hand-${id})`} className="sign-story-hand-outline" /><path d="M 202 317 Q 234 293 279 305 M 210 345 Q 235 326 260 336" className="sign-story-palm-fold" /></motion.g>
      {segments.map((bone, index) => <Bone key={`${bone.from}-${bone.to}`} {...bone} index={index} progress={progress} />)}
      <motion.path d="M 230 362 L 202 262 L 233 253 L 264 265 L 289 283 L 230 362" className="sign-story-palm-map" style={{ opacity: guideOpacity }} />
      {STORY_JOINTS.map((_, index) => <Joint key={index} index={index} progress={progress} />)}
      <motion.g style={{ opacity: guideOpacity }}><path d="M 150 128 H 105 V 101" className="sign-story-guide" /><text x="82" y="91" className="sign-story-svg-note">21 POINTS</text><circle cx="230" cy="362" r="13" className="sign-story-wrist-ring" /><path d="M 247 366 H 319" className="sign-story-guide" /><text x="326" y="370" className="sign-story-svg-note">WRIST ORIGIN</text></motion.g>
    </motion.g>}
    {(staticBeat === undefined || staticBeat === 2) && <motion.g style={{ opacity: flowOpacity }}>
      {[4, 8, 12, 16, 20].map((joint, finger) => <path key={joint} d={`M ${STORY_JOINTS[joint][0]} ${STORY_JOINTS[joint][1]} C 350 ${100 + finger * 45}, 375 240, 464 240`} className="sign-story-feature-path" />)}
      {Array.from({ length: 15 }, (_, index) => <FeatureParticle key={index} index={index} progress={progress} />)}
      <motion.g style={{ scale: nodeScale, transformOrigin: '489px 240px' }}><circle cx="489" cy="240" r="56" className="sign-story-node-halo" /><rect x="451" y="202" width="76" height="76" rx="21" className="sign-story-classifier" />{[0, 1, 2, 3].map((n) => <rect key={n} x={469 + n % 2 * 24} y={220 + Math.floor(n / 2) * 24} width="16" height="16" rx="4" className={`sign-story-node-cell cell-${n}`} />)}</motion.g>
      <text x="489" y="169" textAnchor="middle" className="sign-story-svg-note">YOUR SAMPLES</text><text x="489" y="315" textAnchor="middle" className="sign-story-node-caption">A familiar shape.</text><text x="489" y="338" textAnchor="middle" className="sign-story-svg-note">CENTRE · SCALE · MATCH</text>
    </motion.g>}
    {(staticBeat === undefined || staticBeat === 3) && <motion.g style={{ opacity: outputOpacity }}>
      <rect x="66" y="153" width="508" height="191" rx="18" className="sign-story-output-card" />
      <circle cx="93" cy="179" r="3" className="sign-story-output-dot" /><text x="105" y="183" className="sign-story-svg-note">A LITTLE MOVEMENT. YOUR OWN WORDS.</text>
      {Array.from(STORY_SENTENCE).map((letter, index) => <StoryLetter key={index} letter={letter} index={index} progress={progress} />)}
      {Array.from({ length: 22 }, (_, index) => <WaveBar key={index} index={index} progress={progress} />)}
    </motion.g>}
  </svg>
}
