import { STORY_JOINTS, STORY_OUTLINE, STORY_SEGMENTS, STORY_SENTENCE } from '@/lib/sign/story-data'

/** Native SVG for mobile and reduced motion: no animation subscriptions or frame work. */
export function StaticStoryScene({ beat }: { beat: number }) {
  return <svg className="sign-story-scene" viewBox="0 0 640 480" fill="none" aria-hidden="true">
    <circle cx="317" cy="240" r="177" className="sign-story-orbit" /><circle cx="317" cy="240" r="204" className="sign-story-orbit is-outer" />
    <path d="M 64 64 H 85 M 64 64 V 85 M 555 64 H 576 M 576 64 V 85 M 64 395 V 416 H 85 M 555 416 H 576 V 395" className="sign-story-canvas-corners" />
    {beat < 3 && <g>
      <path d={STORY_OUTLINE} fill="var(--background)" className="sign-story-hand-outline" opacity={beat === 0 ? 1 : .22} />
      {beat === 0 && <path d="M 202 317 Q 234 293 279 305 M 210 345 Q 235 326 260 336" className="sign-story-palm-fold" />}
      {beat > 0 && <>
        {STORY_SEGMENTS.map(({ from, to, finger }) => <line key={`${from}-${to}`} x1={STORY_JOINTS[from][0]} y1={STORY_JOINTS[from][1]} x2={STORY_JOINTS[to][0]} y2={STORY_JOINTS[to][1]} className={`sign-story-bone finger-${finger}`} />)}
        <path d="M 230 362 L 202 262 L 233 253 L 264 265 L 289 283 L 230 362" className="sign-story-palm-map" />
        {STORY_JOINTS.map(([cx, cy], index) => <circle key={index} cx={cx} cy={cy} r={index === 0 ? 5 : 3.6} className={`sign-story-joint finger-${Math.max(0, Math.floor((index - 1) / 4))}`} />)}
        <path d="M 150 128 H 105 V 101" className="sign-story-guide" /><text x="82" y="91" className="sign-story-svg-note">21 POINTS</text>
        <circle cx="230" cy="362" r="13" className="sign-story-wrist-ring" /><path d="M 247 366 H 319" className="sign-story-guide" /><text x="326" y="370" className="sign-story-svg-note">WRIST ORIGIN</text>
      </>}
    </g>}
    {beat === 2 && <g>
      {[4, 8, 12, 16, 20].map((joint, finger) => <path key={joint} d={`M ${STORY_JOINTS[joint][0]} ${STORY_JOINTS[joint][1]} C 350 ${100 + finger * 45}, 375 240, 464 240`} className="sign-story-feature-path" />)}
      {Array.from({ length: 15 }, (_, index) => {
        const finger = index % 5, start = STORY_JOINTS[[4, 8, 12, 16, 20][finger]], t = .3 + Math.floor(index / 5) * .22
        const cx = (1 - t) ** 3 * start[0] + 3 * (1 - t) ** 2 * t * 350 + 3 * (1 - t) * t ** 2 * 375 + t ** 3 * 464
        const cy = (1 - t) ** 3 * start[1] + 3 * (1 - t) ** 2 * t * (100 + finger * 45) + 3 * (1 - t) * t ** 2 * 240 + t ** 3 * 240
        return <circle key={index} cx={cx} cy={cy} r={index < 5 ? 3.8 : 2.4} className={`sign-story-particle finger-${finger}`} />
      })}
      <circle cx="489" cy="240" r="56" className="sign-story-node-halo" /><rect x="451" y="202" width="76" height="76" rx="21" className="sign-story-classifier" />
      {[0, 1, 2, 3].map((n) => <rect key={n} x={469 + n % 2 * 24} y={220 + Math.floor(n / 2) * 24} width="16" height="16" rx="4" className={`sign-story-node-cell cell-${n}`} />)}
      <text x="489" y="169" textAnchor="middle" className="sign-story-svg-note">YOUR SAMPLES</text><text x="489" y="315" textAnchor="middle" className="sign-story-node-caption">A familiar shape.</text><text x="489" y="338" textAnchor="middle" className="sign-story-svg-note">CENTRE · SCALE · MATCH</text>
    </g>}
    {beat === 3 && <g>
      <rect x="66" y="153" width="508" height="191" rx="18" className="sign-story-output-card" /><circle cx="93" cy="179" r="3" className="sign-story-output-dot" /><text x="105" y="183" className="sign-story-svg-note">A LITTLE MOVEMENT. YOUR OWN WORDS.</text>
      {Array.from(STORY_SENTENCE).map((letter, index) => <text key={index} x={157 + index * 25} y="246" className="sign-story-sentence-letter">{letter === ' ' ? '\u00a0' : letter}</text>)}
      {Array.from({ length: 22 }, (_, index) => { const height = 12 + Math.abs(Math.sin(index * 1.31)) * 29; return <rect key={index} x={225 + index * 9} y={301 - height / 2} width="4" height={height} rx="2" className="sign-story-wave-bar" /> })}
    </g>}
  </svg>
}
