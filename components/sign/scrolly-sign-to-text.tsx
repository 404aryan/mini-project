'use client'

import { useRef, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { motion, useInView, useMotionValueEvent, useScroll, useTransform, type MotionValue } from 'motion/react'
import { ArrowDown, ArrowRight, ArrowUpRight, ShieldCheck } from 'lucide-react'
import { warmSignModel, type PortalOrigin } from '@/lib/sign/use-sign-mode'
import { signPortalOrigin } from '@/lib/sign/portal'
import { STORY_BEATS, storyBeat } from '@/lib/sign/story-data'
import { StoryScene } from './story-scene'
import { StaticStoryScene } from './static-story-scene'

const PIN_QUERY = '(min-width: 900px) and (min-height: 620px) and (prefers-reduced-motion: no-preference)'
function subscribeLayout(callback: () => void) {
  const query = matchMedia(PIN_QUERY)
  query.addEventListener('change', callback)
  return () => query.removeEventListener('change', callback)
}
const getLayout = () => matchMedia(PIN_QUERY).matches

function CopyBeat({ index, progress }: { index: number; progress: MotionValue<number> }) {
  const beat = STORY_BEATS[index]
  const from = index / 4, to = (index + 1) / 4
  const inputPoints = index === 0 ? [0, to - .04, to] : index === 3 ? [from, from + .04, 1] : [from, from + .04, to - .04, to]
  const opacity = useTransform(progress, inputPoints, index === 0 ? [1, 1, 0] : index === 3 ? [0, 1, 1] : [0, 1, 1, 0])
  const y = useTransform(progress, inputPoints, index === 0 ? [0, 0, -20] : index === 3 ? [20, 0, 0] : [20, 0, 0, -20])
  return <motion.li style={{ opacity, y }} className="sign-story-beat"><span className="sign-story-beat-number">{beat.number} / A new way to connect</span><h3>{beat.title}</h3><p>{beat.text}</p><span className="sign-story-beat-tag">{beat.tag}</span></motion.li>
}

function Chapter({ index, active, progress, onClick }: { index: number; active: boolean; progress: MotionValue<number>; onClick: () => void }) {
  const scaleX = useTransform(progress, [index / 4, (index + 1) / 4], [0, 1])
  return <button type="button" onClick={onClick} aria-label={`Story ${STORY_BEATS[index].number}: ${STORY_BEATS[index].title}`} aria-current={active ? 'step' : undefined}><span className="sign-story-chapter-track"><motion.i style={{ scaleX }} /></span><span>{STORY_BEATS[index].number}</span></button>
}

function PinnedStory() {
  const track = useRef<HTMLDivElement | null>(null)
  const nearViewport = useInView(track, { once: true, margin: '300px' })
  const { scrollYProgress } = useScroll({ target: track, offset: ['start start', 'end end'] })
  const [chapter, setChapter] = useState(0)
  const chapterRef = useRef(0)
  useMotionValueEvent(scrollYProgress, 'change', (value) => {
    const next = storyBeat(value)
    if (chapterRef.current !== next) { chapterRef.current = next; setChapter(next) }
  })
  const seek = (index: number) => {
    const rect = track.current?.getBoundingClientRect()
    if (rect) window.scrollTo({ top: window.scrollY + rect.top + (rect.height - innerHeight) * (index / 4 + .12), behavior: 'smooth' })
  }
  return <div className="sign-story-track" ref={track} data-story-layout="pinned">
    <div className="sign-story-sticky section-pad">
      <div className="sign-story-copy"><p className="eyebrow"><span className="eyebrow-dot" /> From movement to meaning</p><ol className="sign-story-beats">{STORY_BEATS.map((_, index) => <CopyBeat key={index} index={index} progress={scrollYProgress} />)}</ol><nav className="sign-story-chapters" aria-label="Sign to Text story chapters">{STORY_BEATS.map((_, index) => <Chapter key={index} index={index} active={chapter === index} progress={scrollYProgress} onClick={() => seek(index)} />)}</nav><p className="sign-story-scroll-hint"><ArrowDown size={13} /> Keep scrolling. Follow the thought.</p></div>
      <figure className="sign-story-artboard"><div className="sign-story-artboard-label"><span>Yap / Render</span><span>Sign → Text</span></div>{nearViewport ? <StoryScene progress={scrollYProgress} /> : <StaticStoryScene beat={0} />}<figcaption><span>Concept illustration · example text</span><ShieldCheck size={13} /> On-device tracking</figcaption></figure>
    </div>
  </div>
}

function StaticBeat({ index }: { index: number }) {
  const beat = STORY_BEATS[index]
  return <li className="sign-story-static-beat"><div className="sign-story-static-copy"><span className="sign-story-beat-number">{beat.number} / A new way to connect</span><h3>{beat.title}</h3><p>{beat.text}</p><span className="sign-story-beat-tag">{beat.tag}</span></div><figure className="sign-story-artboard"><StaticStoryScene beat={index} /><figcaption>Concept illustration · example text</figcaption></figure></li>
}

export function ScrollySignToText({ onTry }: { onTry: (origin: PortalOrigin) => void }) {
  const pinned = useSyncExternalStore(subscribeLayout, getLayout, () => false)
  return <section id="sign-story" className="sign-story" aria-labelledby="sign-story-title">
    <div className="sign-story-intro section-pad"><div className="reveal-group"><p className="eyebrow"><span className="eyebrow-dot" /> The other side of the conversation</p><h2 id="sign-story-title" className="split-lines"><span><span>You Sign.</span></span><span><span><em>We Speak.</em></span></span></h2></div><div className="sign-story-intro-copy reveal-group"><p>A familiar thought.<br />A different way to let it out.</p><a href="#sign-story-end" className="text-link">Skip to trying it <ArrowRight size={14} /></a></div></div>
    {pinned ? <PinnedStory /> : <ol className="sign-story-static section-pad" data-story-layout="static">{STORY_BEATS.map((_, index) => <StaticBeat key={index} index={index} />)}</ol>}
    <div id="sign-story-end" tabIndex={-1} className="sign-story-finish section-pad"><div className="reveal-group"><p className="eyebrow">A little movement. A little more connection.</p><h3>Your turn to be heard.</h3><p>Record your own vocabulary, or bring your saved signs to the camera.</p></div><div className="sign-story-finish-actions reveal-group"><button type="button" className="button button-dark sign-story-try" onPointerEnter={warmSignModel} onFocus={warmSignModel} onTouchStart={warmSignModel} onClick={() => onTry(signPortalOrigin())}>Try it live <ArrowUpRight size={17} /></button><Link className="text-link" href="/sign/train">Train your signs <ArrowRight size={14} /></Link></div></div>
  </section>
}
