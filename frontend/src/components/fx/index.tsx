import { animate, motion, useInView, useReducedMotion } from 'motion/react'
import { useEffect, useId, useRef, useState, type CSSProperties, type HTMLAttributes, type MouseEvent, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { initials } from '@/lib/format'

/* ------------------------------------------------------------ Aurora background */
export function Aurora({ className, dense = false }: { className?: string; dense?: boolean }) {
  return (
    <div aria-hidden className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}>
      <div className="aurora-blob" style={{ width: '46%', height: '60%', left: '-8%', top: '-22%', background: 'var(--aurora-1)' }} />
      <div className="aurora-blob" style={{ width: '40%', height: '55%', right: '-6%', top: '-10%', background: 'var(--aurora-2)', animationDelay: '-6s' }} />
      {dense && <div className="aurora-blob" style={{ width: '36%', height: '50%', left: '30%', top: '30%', background: 'var(--aurora-3)', animationDelay: '-12s' }} />}
    </div>
  )
}

/* ------------------------------------------------------------ Spotlight card: a glow follows the pointer */
export function Spotlight({ className, children, as = 'div', ...props }: HTMLAttributes<HTMLDivElement> & { as?: 'div' | 'li' }) {
  const ref = useRef<HTMLDivElement>(null)
  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    el.style.setProperty('--mx', `${e.clientX - r.left}px`)
    el.style.setProperty('--my', `${e.clientY - r.top}px`)
  }
  const Comp = as as 'div'
  return (
    <Comp
      ref={ref}
      onMouseMove={onMove}
      className={cn(
        'group/spot relative overflow-hidden rounded-card border border-line bg-surface shadow-card',
        'before:pointer-events-none before:absolute before:inset-0 before:z-0 before:opacity-0 before:transition-opacity before:duration-300 hover:before:opacity-100',
        'before:[background:radial-gradient(420px_circle_at_var(--mx,50%)_var(--my,0%),var(--spot),transparent_45%)]',
        className,
      )}
      {...props}
    >
      {children}
    </Comp>
  )
}

/* ------------------------------------------------------------ Number ticker */
export function NumberTicker({ value, decimals = 0, prefix = '', suffix = '', duration = 1.2, className }: { value: number; decimals?: number; prefix?: string; suffix?: string; duration?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, margin: '-40px' })
  const reduce = useReducedMotion()
  const [animated, setShown] = useState(0)
  const shown = reduce ? value : animated
  useEffect(() => {
    if (reduce || !inView) return
    const controls = animate(0, value, { duration, ease: [0.16, 1, 0.3, 1], onUpdate: (v) => setShown(v) })
    return () => controls.stop()
  }, [inView, value, duration, reduce])
  return (
    <span ref={ref} className={cn('tabular', className)}>
      {prefix}
      {shown.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
      {suffix}
    </span>
  )
}

/* ------------------------------------------------------------ Reveal on scroll */
export function Reveal({ children, delay = 0, y = 16, className, as = 'div' }: { children: ReactNode; delay?: number; y?: number; className?: string; as?: 'div' | 'section' | 'li' }) {
  const reduce = useReducedMotion()
  const Comp = motion[as]
  return (
    <Comp
      className={className}
      initial={reduce ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.55, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </Comp>
  )
}

/* ------------------------------------------------------------ Marquee */
export function Marquee({ children, duration = 40, className, reverse = false }: { children: ReactNode; duration?: number; className?: string; reverse?: boolean }) {
  return (
    <div className={cn('mask-fade-x flex overflow-hidden', className)}>
      <div className="animate-marquee flex w-max shrink-0 gap-3 pr-3" style={{ '--marquee-duration': `${duration}s`, animationDirection: reverse ? 'reverse' : 'normal' } as CSSProperties}>
        {children}
        <div aria-hidden className="flex gap-3">{children}</div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------ Avatar with a stable gradient per person */
const HUES = [
  ['#2849d6', '#6d3fd1'],
  ['#0e9f8a', '#2849d6'],
  ['#d6457a', '#8a3fd1'],
  ['#e07b16', '#d6457a'],
  ['#127a52', '#0e9f8a'],
  ['#6d3fd1', '#d6457a'],
  ['#1f8fd6', '#0e9f8a'],
]
function hash(s: string) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}
export function Avatar({ name, size = 32, className, ring = false }: { name: string; size?: number; className?: string; ring?: boolean }) {
  const [a, b] = HUES[hash(name) % HUES.length]!
  return (
    <span
      aria-hidden
      className={cn('relative inline-grid shrink-0 place-items-center rounded-full font-semibold text-white', ring && 'ring-2 ring-surface', className)}
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.36), backgroundImage: `linear-gradient(135deg, ${a}, ${b})` }}
    >
      {initials(name)}
    </span>
  )
}

/* ------------------------------------------------------------ Radial gauge */
export function Ring({ value, size = 64, stroke = 6, children, tone = 'brand', label }: { value: number; size?: number; stroke?: number; children?: ReactNode; tone?: 'brand' | 'ok' | 'crit' | 'warn'; label?: string }) {
  const id = useId().replace(/:/g, '')
  const reduce = useReducedMotion()
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const p = Math.max(0, Math.min(1, value))
  const stops = {
    brand: ['var(--brand-1)', 'var(--brand-2)'],
    ok: ['var(--ok)', 'var(--brand-3)'],
    crit: ['var(--crit)', 'var(--warn)'],
    warn: ['var(--warn)', 'var(--crit)'],
  }[tone]
  return (
    <div className="relative inline-grid shrink-0 place-items-center" style={{ width: size, height: size }} role={label ? 'img' : undefined} aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <defs>
          <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={stops[0]} />
            <stop offset="100%" stopColor={stops[1]} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#g${id})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={reduce ? false : { strokeDashoffset: c }}
          whileInView={{ strokeDashoffset: c * (1 - p) }}
          viewport={{ once: true }}
          transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
          style={reduce ? { strokeDashoffset: c * (1 - p) } : undefined}
        />
      </svg>
      {children && <div className="absolute inset-0 grid place-items-center">{children}</div>}
    </div>
  )
}

/* ------------------------------------------------------------ Page header */
const TONES = {
  brand: 'from-brand-1 to-brand-2',
  ok: 'from-ok to-brand-3',
  model: 'from-brand-2 to-[#d6457a]',
  warn: 'from-warn to-[#d6457a]',
  crit: 'from-crit to-warn',
  teal: 'from-brand-3 to-brand-1',
}
export function PageHeader({
  icon,
  eyebrow,
  title,
  description,
  actions,
  tone = 'brand',
  children,
}: {
  icon: ReactNode
  eyebrow: ReactNode
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  tone?: keyof typeof TONES
  children?: ReactNode
}) {
  const reduce = useReducedMotion()
  return (
    <motion.header
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className="noise relative overflow-hidden rounded-[20px] border border-line bg-surface p-6 shadow-card"
    >
      <div aria-hidden className="bg-grid mask-radial pointer-events-none absolute inset-0 opacity-80" />
      <div aria-hidden className={cn('pointer-events-none absolute -top-24 -right-16 size-72 rounded-full bg-gradient-to-br opacity-[0.16] blur-3xl', TONES[tone])} />
      <div className="relative flex flex-wrap items-end justify-between gap-5">
        <div className="flex min-w-0 items-start gap-4">
          <div className={cn('relative grid size-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br text-white shadow-glow', TONES[tone])}>
            {icon}
            <span aria-hidden className="absolute inset-0 rounded-2xl ring-1 ring-white/25 ring-inset" />
          </div>
          <div className="min-w-0">
            <div className="eyebrow">{eyebrow}</div>
            <h1 className="mt-0.5 text-display font-semibold tracking-[-0.02em] text-ink">{title}</h1>
            {description && <p className="mt-1.5 max-w-2xl text-body text-ink-2">{description}</p>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
      </div>
      {children && <div className="relative mt-5">{children}</div>}
    </motion.header>
  )
}

/* ------------------------------------------------------------ KPI tile */
export function Kpi({
  icon,
  label,
  value,
  caption,
  tone = 'brand',
  delay = 0,
  progress,
}: {
  icon: ReactNode
  label: string
  value: ReactNode
  caption?: ReactNode
  tone?: keyof typeof TONES
  delay?: number
  progress?: number
}) {
  return (
    <Reveal delay={delay}>
      <Spotlight className="lift h-full p-4">
        <div className="relative z-10">
          <div className="flex items-center gap-2.5 text-small font-medium text-ink-2">
            <span className={cn('grid size-7 place-items-center rounded-lg bg-gradient-to-br text-white', TONES[tone])}>{icon}</span>
            {label}
          </div>
          <div className="mt-3 text-[32px] leading-none font-semibold tracking-[-0.03em] text-ink">{value}</div>
          {progress !== undefined && (
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-3">
              <motion.div className={cn('h-full rounded-full bg-gradient-to-r', TONES[tone])} initial={{ width: 0 }} whileInView={{ width: `${Math.round(progress * 100)}%` }} viewport={{ once: true }} transition={{ duration: 1, delay: delay + 0.2, ease: [0.16, 1, 0.3, 1] }} />
            </div>
          )}
          {caption && <div className="mt-2 text-caption text-ink-3">{caption}</div>}
        </div>
      </Spotlight>
    </Reveal>
  )
}

/* ------------------------------------------------------------ Section title inside pages */
export function SectionTitle({ eyebrow, title, actions }: { eyebrow?: ReactNode; title: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h2 className="text-heading font-semibold text-ink">{title}</h2>
      </div>
      {actions}
    </div>
  )
}
