'use client'

import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { AnimatePresence, LayoutGroup, motion, useMotionValue, useSpring, useTransform, type MotionValue } from 'motion/react'
import { usePrefersReducedMotion } from '@/lib/sign/use-reduced-motion'
import { AudioLines, Hand, Route, Users } from 'lucide-react'
import { warmSignModel, type PortalOrigin } from '@/lib/sign/use-sign-mode'
import { signPortalOrigin } from '@/lib/sign/portal'

const items = [
  // Speak → Sign controls the avatar demo but scrolls to the whole hero, so the
  // demo sits below the page header instead of against the top edge.
  { id: 'speak', label: 'Speak → Sign', icon: AudioLines, target: 'try-it', scrollTarget: 'top' },
  { id: 'sign', label: 'Sign → Text', icon: Hand, target: null },
  { id: 'how', label: 'How it works', icon: Route, target: 'how-it-works' },
  // Opens the About Us dialog; its section (#about) marks the item active while in view.
  { id: 'about', label: 'About us', icon: Users, target: 'about' },
] as const
type ItemId = typeof items[number]['id']

export function Dock({ signActive, cameraLive, onSign, onExit, onAbout }: {
  signActive: boolean; cameraLive: boolean; onSign: (origin: PortalOrigin) => void; onExit: () => void; onAbout: (from: HTMLElement | null) => void
}) {
  const [section, setSection] = useState<ItemId>('speak')
  const [finePointer, setFinePointer] = useState(false)
  const pointerX = useMotionValue(Infinity)
  const reduced = usePrefersReducedMotion()
  const buttons = useRef<(HTMLButtonElement | null)[]>([])

  useEffect(() => {
    const query = matchMedia('(hover: hover) and (pointer: fine)')
    const update = () => setFinePointer(query.matches)
    update(); query.addEventListener('change', update)
    const spy = () => {
      const story = document.getElementById('sign-story')?.getBoundingClientRect()
      const reached = (id: string) => (document.getElementById(id)?.getBoundingClientRect().top ?? Infinity) < innerHeight * .5
      if (story && story.top < innerHeight * .5 && story.bottom > innerHeight * .5) setSection('sign')
      else if (reached('about')) setSection('about')
      else if (reached('how-it-works')) setSection('how')
      else setSection('speak')
    }
    spy(); window.addEventListener('scroll', spy, { passive: true })
    return () => { query.removeEventListener('change', update); window.removeEventListener('scroll', spy) }
  }, [])

  const navigate = (item: typeof items[number]) => {
    if (item.id === 'sign') {
      onSign(signPortalOrigin())
      return
    }
    if (item.id === 'about') {
      // Leave sign mode first; the dialog opens after its focus return has run.
      // The card grows out of this dock item, measured once the dock has settled.
      const open = () => onAbout(buttons.current[items.indexOf(item)] ?? null)
      if (signActive) { onExit(); requestAnimationFrame(open) }
      else open()
      return
    }
    setSection(item.id)
    const scroll = () => document.getElementById(('scrollTarget' in item ? item.scrollTarget : item.target)!)?.scrollIntoView({ behavior: reduced ? 'instant' : 'smooth', block: 'start' })
    if (signActive) {
      onExit()
      // Scroll once the stage has left its fixed PiP and the page layout is back.
      requestAnimationFrame(() => {
        buttons.current[items.indexOf(item)]?.focus({ preventScroll: true })
        requestAnimationFrame(scroll)
      })
      return
    }
    scroll()
  }

  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const direction = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (!direction && event.key !== 'Home' && event.key !== 'End') return
    event.preventDefault()
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + direction + items.length) % items.length
    buttons.current[next]?.focus()
  }

  return <LayoutGroup id="mode-dock">
    <motion.nav aria-label="Translation modes" className={`mode-dock ${signActive ? 'is-compact' : ''}`}
      initial={{ y: reduced ? 0 : 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 170, damping: 19, delay: reduced ? 0 : .7 }}
      onPointerMove={(event) => pointerX.set(finePointer && !reduced ? event.clientX : Infinity)}
      onPointerLeave={() => pointerX.set(Infinity)}>
      {items.map((item, index) => <DockItem key={item.id} item={item} index={index}
        active={(signActive ? 'sign' : section) === item.id} compact={signActive} live={cameraLive}
        pointerX={pointerX} magnify={finePointer && !reduced} reduced={!!reduced}
        buttonRef={(element) => { buttons.current[index] = element }}
        onClick={() => navigate(item)} onKeyDown={(event) => onKeyDown(event, index)} />)}
    </motion.nav>
  </LayoutGroup>
}

function DockItem({ item, index, active, compact, live, pointerX, magnify, reduced, buttonRef, onClick, onKeyDown }: {
  item: typeof items[number]; index: number; active: boolean; compact: boolean; live: boolean
  pointerX: MotionValue<number>; magnify: boolean; reduced: boolean
  buttonRef: (element: HTMLButtonElement | null) => void; onClick: () => void; onKeyDown: (event: KeyboardEvent) => void
}) {
  const iconRef = useRef<HTMLSpanElement>(null)
  const [hovered, setHovered] = useState(false)
  const [pressed, setPressed] = useState(0)
  const [ripple, setRipple] = useState<{ x: number; y: number; key: number } | null>(null)
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])
  const distanceScale = useTransform(pointerX, (x) => {
    if (!magnify || !Number.isFinite(x)) return 1
    const rect = iconRef.current?.getBoundingClientRect()
    if (!rect) return 1
    const distance = Math.abs(x - rect.left - rect.width / 2)
    return 1 + .5 * Math.max(0, 1 - distance / 130) ** 2
  })
  const scale = useSpring(distanceScale, { stiffness: 170, damping: 14 })
  const Icon = item.icon
  const warm = () => { if (item.id === 'sign') warmSignModel() }

  return <motion.button layout={!reduced} type="button" ref={buttonRef} className={`dock-item dock-${item.id}`}
    aria-label={item.label} aria-current={active ? 'page' : undefined} aria-controls={item.id === 'sign' ? 'sign-stage' : item.id === 'about' ? undefined : item.target!}
    aria-haspopup={item.id === 'about' ? 'dialog' : undefined}
    onClick={() => { setPressed((value) => value + 1); onClick() }} onKeyDown={onKeyDown}
    onPointerEnter={() => { setHovered(true); warm() }} onPointerLeave={() => setHovered(false)}
    onFocus={() => { setHovered(true); warm() }} onBlur={() => setHovered(false)} onTouchStart={warm}
    onPointerDown={(event) => {
      const rect = event.currentTarget.getBoundingClientRect()
      setRipple({ x: event.clientX - rect.left, y: event.clientY - rect.top, key: performance.now() })
    }} transition={{ type: 'spring', stiffness: 170, damping: 18 }}>
    {active && <motion.span className="dock-active" layoutId={reduced ? undefined : 'active-mode'} aria-hidden="true"
      animate={{ backgroundColor: item.id === 'sign' ? 'var(--lime)' : 'var(--coral)' }}
      transition={reduced ? { duration: .15 } : { type: 'spring', stiffness: 170, damping: 20 }} />}
    <motion.span className="dock-icon-wrap" style={{ scale: reduced ? 1 : scale }} initial={{ opacity: 0, y: reduced ? 0 : 12 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 170, damping: 14, delay: reduced ? 0 : .75 + index * .07 }}>
      <motion.span key={pressed} className="dock-icon" ref={iconRef} data-sign-portal-origin={item.id === 'sign' ? '' : undefined}
        initial={false} animate={pressed && !reduced ? { scaleX: [1, .9, 1.08, 1], scaleY: [1, 1.08, .9, 1] } : { scale: 1 }}
        transition={{ duration: .4 }}><Icon size={21} strokeWidth={1.65} /></motion.span>
      {item.id === 'sign' && live && <span className="dock-live-dot" aria-label="Camera live" />}
    </motion.span>
    {!compact && <motion.span className="dock-label" initial={{ opacity: 0, y: reduced ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reduced ? 0 : .85 + index * .07 }}>{item.label}</motion.span>}
    <AnimatePresence>{hovered && <motion.span className="dock-tooltip" aria-hidden="true" initial={{ opacity: 0, y: reduced ? 0 : 8, x: '-50%' }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduced ? 0 : 4 }} transition={{ type: 'spring', stiffness: 300, damping: 22 }}>{item.label}</motion.span>}</AnimatePresence>
    <span className="dock-ripple-bound" aria-hidden="true"><AnimatePresence>{ripple && <motion.span key={ripple.key} className="dock-ripple" style={{ left: ripple.x, top: ripple.y }} initial={{ scale: 0, opacity: .35 }} animate={{ scale: reduced ? 1 : 7, opacity: 0 }} transition={{ duration: .5 }} onAnimationComplete={() => { if (mountedRef.current) setRipple((current) => current?.key === ripple.key ? null : current) }} />}</AnimatePresence></span>
  </motion.button>
}
