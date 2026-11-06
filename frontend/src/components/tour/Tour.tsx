import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ArrowLeft, ArrowRight, Compass, X } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Kbd } from '@/components/ui/primitives'
import { cn } from '@/lib/cn'

export interface TourStep {
  /** Value of a `data-tour` attribute to highlight. Omit for a centred step. */
  target?: string
  title: string
  body: ReactNode
  /** Optional final call to action shown instead of "Next" on this step. */
  action?: { label: string; onClick: () => void }
  /** Runs when the step becomes active, before the target is measured. */
  onEnter?: () => void
}

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

const PAD = 8
const CARD_W = 360

function measure(target?: string): Rect | null {
  if (!target) return null
  const el = document.querySelector<HTMLElement>(`[data-tour="${target}"]`)
  if (!el) return null
  const r = el.getBoundingClientRect()
  if (r.width === 0 && r.height === 0) return null
  return { x: r.left - PAD, y: r.top - PAD, w: r.width + PAD * 2, h: r.height + PAD * 2 }
}

export function Tour({ steps, open, onClose, label = 'Guided tour' }: { steps: TourStep[]; open: boolean; onClose: (completed: boolean) => void; label?: string }) {
  const [i, setI] = useState(0)
  const [rect, setRect] = useState<Rect | null>(null)
  const [vw, setVw] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1280))
  const [vh, setVh] = useState(() => (typeof window !== 'undefined' ? window.innerHeight : 800))
  const cardRef = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()
  const step = steps[i]
  const stepsRef = useRef(steps)
  const target = step?.target

  useLayoutEffect(() => {
    stepsRef.current = steps
  })

  // Scroll the target into view when the step changes, then keep measuring while it settles.
  useLayoutEffect(() => {
    const step = stepsRef.current[i]
    if (!open || !step) return
    step.onEnter?.()
    let raf = 0
    let frames = 0
    const scrollTimer = window.setTimeout(() => {
      const el = step.target ? document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`) : null
      if (el) {
        const r = el.getBoundingClientRect()
        const fits = r.top >= 72 && r.bottom <= window.innerHeight - 24
        if (!fits) el.scrollIntoView({ block: r.height > window.innerHeight * 0.6 ? 'start' : 'center', behavior: reduce ? 'auto' : 'smooth' })
      }
    }, step.onEnter ? 120 : 0)
    const tick = () => {
      setRect((prev) => {
        const next = measure(step.target)
        if (!prev || !next) return next
        return Math.abs(prev.x - next.x) + Math.abs(prev.y - next.y) + Math.abs(prev.w - next.w) + Math.abs(prev.h - next.h) > 0.5 ? next : prev
      })
      frames++
      if (frames < 90) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(scrollTimer)
    }
  }, [open, i, reduce])

  useEffect(() => {
    if (!open) return
    const onResize = () => {
      setVw(window.innerWidth)
      setVh(window.innerHeight)
      setRect(measure(target))
    }
    const onScroll = () => setRect(measure(target))
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open, target])

  useEffect(() => {
    if (open) cardRef.current?.focus({ preventScroll: true })
  }, [open, i])

  const close = useCallback(
    (completed: boolean) => {
      setI(0)
      onClose(completed)
    },
    [onClose],
  )
  const next = useCallback(() => {
    if (i >= steps.length - 1) close(true)
    else setI(i + 1)
  }, [i, steps.length, close])
  const back = useCallback(() => setI((v) => Math.max(0, v - 1)), [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        close(false)
      } else if (e.key === 'ArrowRight' || (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'BUTTON')) {
        e.preventDefault()
        next()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        back()
      }
      e.stopPropagation()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, next, back, close])

  if (typeof document === 'undefined') return null

  // Card placement: below the target if there is room, otherwise above, otherwise centred.
  let cardStyle: { left: number; top: number }
  const cardH = 230
  if (rect) {
    const left = Math.min(Math.max(16, rect.x + rect.w / 2 - CARD_W / 2), vw - CARD_W - 16)
    if (rect.y + rect.h + cardH + 16 < vh) cardStyle = { left, top: rect.y + rect.h + 12 }
    else if (rect.y - cardH - 12 > 0) cardStyle = { left, top: rect.y - cardH - 12 }
    else cardStyle = { left: Math.min(vw - CARD_W - 16, Math.max(16, rect.x + rect.w + 16)), top: Math.max(16, Math.min(vh - cardH - 16, rect.y + 16)) }
  } else {
    cardStyle = { left: vw / 2 - CARD_W / 2, top: vh / 2 - cardH / 2 }
  }

  const spring = reduce ? { duration: 0 } : { type: 'spring' as const, stiffness: 260, damping: 30 }

  return createPortal(
    <AnimatePresence>
      {open && step && (
        <motion.div key="tour" className="fixed inset-0 z-[100]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
          <svg className="absolute inset-0 size-full" aria-hidden>
            <defs>
              <mask id="tour-mask">
                <rect width="100%" height="100%" fill="white" />
                {rect && <motion.rect initial={false} animate={{ x: rect.x, y: rect.y, width: rect.w, height: rect.h }} transition={spring} rx={14} fill="black" />}
              </mask>
            </defs>
            <rect width="100%" height="100%" fill="rgb(8 10 16 / 0.62)" mask="url(#tour-mask)" />
          </svg>
          {rect && (
            <motion.div
              aria-hidden
              className="pointer-events-none absolute rounded-[14px] ring-2 ring-accent shadow-[0_0_0_4px_rgb(125_150_255/0.25),0_0_40px_6px_rgb(125_150_255/0.35)]"
              initial={false}
              animate={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
              transition={spring}
            />
          )}
          <motion.div
            ref={cardRef}
            role="dialog"
            aria-modal="true"
            aria-label={`${label}: ${step.title}`}
            tabIndex={-1}
            className="absolute w-[360px] max-w-[calc(100vw-32px)] overflow-hidden rounded-[18px] border border-line bg-surface text-left shadow-[0_30px_80px_-20px_rgb(0_0_0/0.55)] outline-none"
            initial={false}
            animate={cardStyle}
            transition={spring}
          >
            <div className="h-1 bg-surface-3">
              <motion.div className="bg-brand h-full" animate={{ width: `${((i + 1) / steps.length) * 100}%` }} transition={{ duration: 0.4 }} />
            </div>
            <div className="p-5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-caption font-semibold text-accent">
                  <Compass size={13} /> {label} · {i + 1} of {steps.length}
                </span>
                <button onClick={() => close(false)} aria-label="Close tour" className="grid size-7 place-items-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink">
                  <X size={14} />
                </button>
              </div>
              <AnimatePresence mode="wait" initial={false}>
                <motion.div key={i} initial={reduce ? false : { opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.18 }}>
                  <h2 className="mt-2 text-[17px] leading-6 font-semibold tracking-tight text-ink">{step.title}</h2>
                  <div className="mt-1.5 text-small leading-relaxed text-ink-2">{step.body}</div>
                </motion.div>
              </AnimatePresence>
              <div className="mt-4 flex items-center gap-2">
                <div className="flex gap-1" aria-hidden>
                  {steps.map((_, j) => (
                    <span key={j} className={cn('h-1.5 rounded-full transition-all', j === i ? 'bg-brand w-4' : j < i ? 'w-1.5 bg-accent/50' : 'w-1.5 bg-surface-3')} />
                  ))}
                </div>
                <div className="ml-auto flex items-center gap-1.5">
                  {i > 0 && (
                    <button onClick={back} className="inline-flex h-8 items-center gap-1 rounded-control px-2.5 text-small font-medium text-ink-2 hover:bg-surface-2 hover:text-ink">
                      <ArrowLeft size={13} /> Back
                    </button>
                  )}
                  {step.action ? (
                    <button onClick={() => { setI(0); step.action!.onClick() }} className="bg-brand inline-flex h-8 items-center gap-1.5 rounded-control px-3 text-small font-semibold text-white shadow-glow">
                      {step.action.label} <ArrowRight size={13} />
                    </button>
                  ) : (
                    <button onClick={next} className="bg-brand inline-flex h-8 items-center gap-1.5 rounded-control px-3 text-small font-semibold text-white shadow-glow">
                      {i === steps.length - 1 ? 'Finish' : 'Next'} <ArrowRight size={13} />
                    </button>
                  )}
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2 border-t border-line pt-2.5 text-[11px] text-ink-3">
                <Kbd>←</Kbd>
                <Kbd>→</Kbd> to move · <Kbd>Esc</Kbd> to close
                {step.action && (
                  <button onClick={next} className="ml-auto font-medium hover:text-ink">
                    Finish without signing in
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
