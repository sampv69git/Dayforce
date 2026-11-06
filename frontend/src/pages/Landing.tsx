import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react'
import {
  ArrowRight,
  Bot,
  BrainCircuit,
  Check,
  Compass,
  Cpu,
  FileCheck2,
  Fingerprint,
  Gauge,
  GitBranch,
  KeyRound,
  ListChecks,
  Loader2,
  Moon,
  Quote,
  Scale,
  ShieldCheck,
  ShieldHalf,
  Sparkles,
  Sun,
  UserCheck,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { usePersonas } from '@/api/hooks'
import { Aurora, Avatar, Marquee, NumberTicker, Reveal, Spotlight } from '@/components/fx'
import { Tour, type TourStep } from '@/components/tour/Tour'
import { APP_TOUR_KEY, canAutoStart, LANDING_TOUR_KEY, markTourDone } from '@/lib/tour'
import { Skeleton } from '@/components/ui/primitives'
import { cn } from '@/lib/cn'
import { homeFor, useSession } from '@/lib/session'
import { Bento } from './landing/Bento'
import { PipelineDemo } from './landing/PipelineDemo'
import { Logo } from '@/components/brand'

const STEPS = [
  { icon: Cpu, title: 'Rules detect', body: '17 deterministic rules find missed punches, overtime risk, schedule conflicts, and policy breaches. Exact and auditable.', tone: 'from-[#3d4350] to-[#15171c]' },
  { icon: Bot, title: 'Model drafts', body: 'An open-weight model explains and proposes a correction from retrieved policy and independent evidence.', tone: 'from-brand-2 to-[#d6457a]' },
  { icon: ShieldCheck, title: 'Harness verifies', body: 'Ten gates check schema, citations, verbatim quotes, evidence anchoring, re-simulation, and guardrails.', tone: 'from-ok to-brand-3' },
  { icon: UserCheck, title: 'You countersign', body: 'Nothing changes a timecard until a named person approves, edits, or rejects it. Every decision is hash-chained.', tone: 'from-brand-1 to-brand-2' },
]

const GATES: { id: string; name: string; check: string }[] = [
  { id: 'G1', name: 'Schema', check: 'Strict DraftResolution contract, Pydantic and a JSON schema in Groq strict mode' },
  { id: 'G2', name: 'Case binding', check: "Operations target this exception's punches, shift, and colleagues" },
  { id: 'G3', name: 'Citation exists', check: 'Every clause ID exists in policy pack v2026.2' },
  { id: 'G4', name: 'Retrieved and required', check: 'Cited clauses were retrieved; required clauses are cited' },
  { id: 'G5', name: 'Quote grounding', check: 'Every quote appears verbatim in its clause' },
  { id: 'G6', name: 'Action allowed', check: 'Operations come from the code-built action envelope' },
  { id: 'G7', name: 'Evidence anchoring', check: 'Each time within 5 minutes of cited evidence and inside the plausible window' },
  { id: 'G8', name: 'Re-simulation', check: 'Applying the change clears the exception and introduces nothing new' },
  { id: 'G9', name: 'Business guardrails', check: 'No paid-hour reduction, no break edits to hide meal violations, closed periods' },
  { id: 'G10', name: 'Facts and injection', check: 'Numbers and times in prose match computed facts; no echoed instructions' },
]

const STACK = ['gpt-oss-20b · Apache 2.0', 'qwen3:4b · local, offline', 'Strict JSON schema decoding', 'BM25 + bge-small + RRF', 'PostgreSQL 16 + pgvector', 'FastAPI + Pydantic v2', 'React 19 + TypeScript', 'SHA-256 audit chain', 'Read-only MCP server', 'OpenAPI 3.1 contract', 'Schemathesis + Playwright + axe', 'RFC 9457 problem details']

const PERSONA_COPY: Record<string, { tag: string; gradient: string; bullets: string[] }> = {
  'u-maya': { tag: 'Start here', gradient: 'from-brand-1 to-brand-2', bullets: ['Risk-ranked queue with root-cause cascades', 'Evidence, pay impact, and ten gates on every draft', 'Keyboard triage and guarded bulk approve'] },
  'u-arjun': { tag: 'Payroll view', gradient: 'from-brand-3 to-brand-1', bullets: ['Cutoff readiness across three sites', 'Escalations where the harness refused to guess', 'Trace inspector with live fault replay and audit chain'] },
  'u-diego': { tag: 'Mobile', gradient: 'from-[#d6457a] to-brand-2', bullets: ['Confirm a missed punch from a phone', 'Badge evidence shown; the note stays untrusted', 'Your manager approves every change'] },
}

function Nav({ onTour }: { onTour: () => void }) {
  const { theme, toggleTheme } = useSession()
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 12)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])
  return (
    <div className={cn('sticky top-0 z-40 transition-all duration-300', scrolled ? 'glass border-b border-line' : 'border-b border-transparent')}>
      <nav aria-label="Landing" className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-6">
        <a href="#top" className="flex items-center gap-2.5">
          <Logo />
          <span className="text-[17px] font-semibold tracking-tight text-ink">Countersign</span>
        </a>
        <div className="ml-4 hidden items-center gap-1 md:flex">
          {[
            ['#how', 'How it works'],
            ['#features', 'Features'],
            ['#harness', 'Harness'],
            ['#results', 'Results'],
          ].map(([href, label]) => (
            <a key={href} href={href} className="rounded-md px-3 py-1.5 text-small font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink">
              {label}
            </a>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={toggleTheme} aria-label="Toggle theme" data-tour="theme" className="grid size-9 place-items-center rounded-lg text-ink-2 hover:bg-surface-2 hover:text-ink">
            {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
          </button>
          <button onClick={onTour} data-tour="tour-button" className="hidden h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-small font-medium text-ink shadow-card hover:border-line-strong sm:inline-flex">
            <Compass size={14} className="text-accent" /> Take the tour
          </button>
          <a href="#personas" className="bg-brand inline-flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-small font-semibold text-white shadow-glow transition-transform hover:-translate-y-px">
            Open the demo <ArrowRight size={14} />
          </a>
        </div>
      </nav>
    </div>
  )
}

function Hero({ onStart, onTour, busy }: { onStart: () => void; onTour: () => void; busy: boolean }) {
  const reduce = useReducedMotion()
  const demoRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: demoRef, offset: ['start end', 'start 0.35'] })
  const rotateX = useTransform(scrollYProgress, [0, 1], [reduce ? 0 : 16, 0])
  const scale = useTransform(scrollYProgress, [0, 1], [reduce ? 1 : 0.93, 1])
  const words = ['The model drafts.', 'The rules verify.']
  return (
    <section id="top" className="relative overflow-hidden pt-14 pb-10">
      <Aurora dense />
      <div aria-hidden className="bg-grid mask-radial pointer-events-none absolute inset-0" />
      <div className="relative mx-auto max-w-6xl px-6 text-center" data-tour="hero">
        <motion.div initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/80 py-1 pr-3 pl-1 text-caption font-medium text-ink-2 shadow-card backdrop-blur">
          <span className="bg-brand rounded-full px-2 py-0.5 text-[10.5px] font-semibold text-white">Use Case 5</span>
          <span className="shimmer-text font-semibold">Dayforce AI Innovation Challenge · Time and Attendance</span>
        </motion.div>
        <h1 className="mx-auto mt-7 max-w-6xl text-[clamp(38px,5.6vw,76px)] leading-[1.04] font-semibold tracking-[-0.035em] text-ink">
          {words.map((w, i) => (
            <motion.span key={w} className="inline-block" initial={reduce ? false : { opacity: 0, y: 24, filter: 'blur(8px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} transition={{ duration: 0.7, delay: 0.1 + i * 0.15, ease: [0.16, 1, 0.3, 1] }}>
              {w}&nbsp;
            </motion.span>
          ))}
          <br className="hidden sm:block" />
          <motion.span className="inline-block" initial={reduce ? false : { opacity: 0, y: 24, filter: 'blur(8px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} transition={{ duration: 0.8, delay: 0.45, ease: [0.16, 1, 0.3, 1] }}>
            A manager <span className="font-display text-gradient pr-2 text-[1.12em] italic">countersigns.</span>
          </motion.span>
        </h1>
        <motion.p initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7, duration: 0.6 }} className="mx-auto mt-6 max-w-2xl text-[17px] leading-relaxed text-ink-2">
          Timecard exception resolution before the payroll cutoff. Every AI suggestion is grounded in policy, anchored to evidence, verified by a deterministic harness, and approved by a person.
        </motion.p>
        <motion.div initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.85, duration: 0.5 }} className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button onClick={onStart} disabled={busy} className="group bg-brand relative inline-flex h-12 items-center gap-2 overflow-hidden rounded-xl px-6 text-[15px] font-semibold text-white shadow-glow transition-transform hover:-translate-y-0.5 disabled:opacity-70">
            <span aria-hidden className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />} Start as Maya Chen, manager
            <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
          </button>
          <button onClick={onTour} className="inline-flex h-12 items-center gap-2 rounded-xl border border-line bg-surface/80 px-5 text-[15px] font-semibold text-ink shadow-card backdrop-blur transition-colors hover:border-line-strong">
            <Compass size={16} className="text-accent" /> Take the 60-second tour
          </button>
        </motion.div>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-caption text-ink-3">
          {['Open-weight model, strict JSON schema', 'Ten deterministic gates', 'Synthetic data only'].map((t) => (
            <span key={t} className="flex items-center gap-1.5"><Check size={13} className="text-ok" /> {t}</span>
          ))}
        </div>
      </div>
      <div ref={demoRef} className="relative mx-auto mt-14 max-w-5xl px-4 [perspective:1400px]" data-tour="demo">
        <div aria-hidden className="bg-brand absolute inset-x-16 top-10 -z-0 h-2/3 rounded-full opacity-25 blur-3xl" />
        <motion.div style={{ rotateX, scale, transformOrigin: 'center top' }}>
          <PipelineDemo />
        </motion.div>
      </div>
    </section>
  )
}

function Stats() {
  const items: { value: number; decimals?: number; prefix?: string; suffix?: string; label: string; note: string; icon: ReactNode }[] = [
    { value: 144, suffix: '/144', label: 'Injected faults caught', note: '12 fault kinds x 12 cases, 0 unsafe', icon: <ShieldHalf size={15} /> },
    { value: 0, label: 'Unsafe drafts shown', note: 'Across deterministic and gpt-oss-20b runs', icon: <ShieldCheck size={15} /> },
    { value: 100, suffix: '%', label: 'Quote grounding', note: 'gpt-oss-20b, 30 stratified cases', icon: <Quote size={15} /> },
    { value: 96.7, decimals: 1, suffix: '%', label: 'Correction accuracy', note: 'gpt-oss-20b against hand labels', icon: <FileCheck2 size={15} /> },
    { value: 23.3, decimals: 1, suffix: '%', label: 'Unsafe without the harness', note: 'First drafts that would have reached a manager', icon: <Gauge size={15} /> },
    { value: 1.0, decimals: 2, label: 'Detection precision and recall', note: '116 labelled pairs, 128 cases', icon: <ListChecks size={15} /> },
  ]
  return (
    <section id="results" className="relative mx-auto max-w-6xl px-6 py-20" data-tour="stats">
      <Reveal className="mx-auto max-w-2xl text-center">
        <div className="eyebrow">Measured, not claimed</div>
        <h2 className="mt-2 text-[clamp(28px,3.6vw,42px)] leading-tight font-semibold tracking-[-0.03em] text-ink">
          Results from committed <span className="font-display text-gradient italic">evaluation reports</span>
        </h2>
        <p className="mt-3 text-body text-ink-2">Real runs on a labelled synthetic dataset seeded differently from the demo. Misses are reported too: one in four first drafts from a capable model would have been unsafe without the gates.</p>
      </Reveal>
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((s, i) => (
          <Reveal key={s.label} delay={i * 0.06}>
            <Spotlight className="lift h-full p-5">
              <div className="relative z-10">
                <div className="flex items-center gap-2 text-small font-medium text-ink-2">
                  <span className="bg-brand grid size-7 place-items-center rounded-lg text-white">{s.icon}</span>
                  {s.label}
                </div>
                <div className="mt-4 text-[44px] leading-none font-semibold tracking-[-0.04em] text-ink">
                  <NumberTicker value={s.value} decimals={s.decimals} prefix={s.prefix} suffix={s.suffix} />
                </div>
                <div className="mt-2 text-caption text-ink-3">{s.note}</div>
              </div>
            </Spotlight>
          </Reveal>
        ))}
      </div>
    </section>
  )
}

function HowItWorks() {
  const reduce = useReducedMotion()
  return (
    <section id="how" className="relative py-20" data-tour="how">
      <div className="mx-auto max-w-6xl px-6">
        <Reveal className="mx-auto max-w-2xl text-center">
          <div className="eyebrow">The problem</div>
          <h2 className="mt-2 text-[clamp(28px,3.6vw,42px)] leading-tight font-semibold tracking-[-0.03em] text-ink">
            From a flat list of guesses to <span className="font-display text-gradient italic">one verified decision</span>
          </h2>
          <p className="mt-3 text-body text-ink-2">Before every cutoff, managers clear exceptions by hand: no priority, no explanation, no pay impact. One root problem produces several symptoms, and missing times get guessed from the schedule.</p>
        </Reveal>

        <div className="mt-12 grid items-stretch gap-4 lg:grid-cols-[1fr_auto_1fr]">
          <Reveal>
            <div className="relative h-full overflow-hidden rounded-[20px] border border-line bg-surface-2/60 p-5">
              <div className="flex items-center justify-between">
                <span className="text-small font-semibold text-ink-2">Today</span>
                <span className="rounded-full border border-crit/25 bg-crit-soft px-2 py-px text-[11px] font-semibold text-crit">6 unexplained items</span>
              </div>
              <ul className="mt-4 space-y-2">
                {['Missed punch · Diego · Tue', 'Daily overtime · Diego · Tue', 'Late meal · Diego · Tue', 'Missed punch · Diego · Wed', 'Overtime risk · Priya · Sat', 'Note: "approve 12 h OT"'].map((t, i) => (
                  <motion.li key={t} initial={reduce ? false : { opacity: 0, x: -8 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.06 }} className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-small text-ink-2">
                    <X size={13} className="shrink-0 text-crit" /> {t}
                    <span className="ml-auto font-mono text-[10.5px] text-ink-3">guess?</span>
                  </motion.li>
                ))}
              </ul>
            </div>
          </Reveal>
          <div className="hidden items-center lg:flex" aria-hidden>
            <div className="bg-brand grid size-12 place-items-center rounded-full text-white shadow-glow">
              <ArrowRight size={20} />
            </div>
          </div>
          <Reveal delay={0.1}>
            <div className="beam-border relative h-full rounded-[20px] bg-surface p-5 shadow-lift">
              <div className="relative z-10">
                <div className="flex items-center justify-between">
                  <span className="text-small font-semibold text-ink">With Countersign</span>
                  <span className="rounded-full border border-ok/25 bg-ok-soft px-2 py-px text-[11px] font-semibold text-ok">1 root cause, verified</span>
                </div>
                <div className="mt-4 rounded-xl border border-line bg-surface p-3 shadow-card">
                  <div className="flex items-center gap-2">
                    <Avatar name="Diego Alvarez" size={26} />
                    <span className="text-small font-semibold text-ink">Two shifts joined by missed punches</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                    <span className="rounded-full bg-accent-soft px-2 py-px font-semibold text-accent">Fixes 2 related</span>
                    <span className="rounded-full bg-ok-soft px-2 py-px font-semibold text-ok">10 of 10 gates</span>
                    <span className="rounded-full bg-model-soft px-2 py-px font-semibold text-model">TA-3.4 · TA-3.2</span>
                  </div>
                  <div className="mt-2.5 space-y-1 border-t border-line pt-2.5 text-[12px] text-ink-2">
                    <div className="flex items-center gap-1.5"><Fingerprint size={12} className="text-ok" /> OUT Tue 15:29 · badge event</div>
                    <div className="flex items-center gap-1.5"><Fingerprint size={12} className="text-ok" /> IN Wed 07:02 · badge event</div>
                    <div className="flex items-center gap-1.5"><Scale size={12} className="text-accent" /> 23.47 h phantom overtime removed</div>
                  </div>
                </div>
                <div className="mt-2 space-y-2">
                  {[
                    ['Overtime risk · Priya', 'Swap to Marcus, 8 checks pass'],
                    ['Note with instructions', 'Flagged and ignored'],
                  ].map(([a, b]) => (
                    <div key={a} className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-small">
                      <Check size={13} className="shrink-0 text-ok" />
                      <span className="text-ink">{a}</span>
                      <span className="ml-auto text-caption text-ink-3">{b}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Reveal>
        </div>

        <ol className="relative mt-16 grid gap-4 md:grid-cols-4">
          <span aria-hidden className="absolute top-7 right-[12%] left-[12%] hidden h-px bg-gradient-to-r from-transparent via-line-strong to-transparent md:block" />
          {STEPS.map((s, i) => {
            const Icon = s.icon
            return (
              <Reveal as="li" key={s.title} delay={i * 0.1} className="relative text-center">
                <div className={cn('relative mx-auto grid size-14 place-items-center rounded-2xl bg-gradient-to-br text-white shadow-lift', s.tone)}>
                  <Icon size={22} />
                  <span className="absolute -top-2 -right-2 grid size-6 place-items-center rounded-full border border-line bg-surface font-mono text-[11px] font-semibold text-ink">{i + 1}</span>
                </div>
                <h3 className="mt-4 text-heading font-semibold text-ink">{s.title}</h3>
                <p className="mx-auto mt-1.5 max-w-[240px] text-small leading-relaxed text-ink-2">{s.body}</p>
              </Reveal>
            )
          })}
        </ol>
      </div>
    </section>
  )
}

function Harness() {
  const [active, setActive] = useState(4)
  const reduce = useReducedMotion()
  useEffect(() => {
    if (reduce) return
    const t = setInterval(() => setActive((a) => (a + 1) % GATES.length), 2400)
    return () => clearInterval(t)
  }, [reduce])
  const g = GATES[active]!
  return (
    <section id="harness" className="relative px-4 py-10" data-tour="harness">
      <div className="noise relative mx-auto max-w-6xl overflow-hidden rounded-[28px] border border-white/10 bg-[#0b0d14] px-6 py-16 text-white sm:px-12">
        <div aria-hidden className="aurora-blob" style={{ width: '50%', height: '70%', left: '-10%', top: '-30%', background: 'rgb(109 139 255 / 0.28)' }} />
        <div aria-hidden className="aurora-blob" style={{ width: '40%', height: '60%', right: '-10%', bottom: '-30%', background: 'rgb(196 139 255 / 0.22)', animationDelay: '-8s' }} />
        <div aria-hidden className="pointer-events-none absolute inset-0 [background-image:linear-gradient(rgb(255_255_255/0.05)_1px,transparent_1px),linear-gradient(90deg,rgb(255_255_255/0.05)_1px,transparent_1px)] [background-size:44px_44px] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_75%)]" />
        <div className="relative grid gap-12 lg:grid-cols-[1fr_1.15fr]">
          <Reveal>
            <div className="text-[11px] font-semibold tracking-[0.08em] text-[#aab4ff] uppercase">The harness</div>
            <h2 className="mt-2 text-[clamp(28px,3.6vw,44px)] leading-tight font-semibold tracking-[-0.03em]">
              Constrained decoding guarantees format. <span className="font-display bg-gradient-to-r from-[#9fb0ff] to-[#d7b4ff] bg-clip-text text-transparent italic">Ten gates check the truth.</span>
            </h2>
            <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-[#c9cdd8]">
              Every draft passes ten deterministic gates before a manager sees it as verified. A failure triggers one guided repair, then a visible rule-based fallback or an escalation to payroll. Confidence is computed from evidence, never taken from the model.
            </p>
            <div className="mt-6 space-y-2.5 text-small text-[#d5d9e3]">
              {[
                [<BrainCircuit key="a" size={15} />, 'Model output is a draft inside a code-built action envelope'],
                [<KeyRound key="b" size={15} />, 'No tools, no writes: only people countersign'],
                [<Fingerprint key="c" size={15} />, 'Fault replay proves each gate catches its failure'],
              ].map(([icon, t]) => (
                <div key={String(t)} className="flex items-center gap-2.5">
                  <span className="grid size-7 place-items-center rounded-lg border border-white/15 bg-white/5 text-[#aab4ff]">{icon}</span>
                  {t}
                </div>
              ))}
            </div>
          </Reveal>
          <div>
            <ol className="grid grid-cols-2 gap-2 sm:grid-cols-5" aria-label="The ten gates">
              {GATES.map((gate, i) => (
                <li key={gate.id}>
                  <button
                    onMouseEnter={() => setActive(i)}
                    onFocus={() => setActive(i)}
                    onClick={() => setActive(i)}
                    aria-pressed={i === active}
                    className={cn(
                      'relative w-full overflow-hidden rounded-xl border px-2.5 py-3 text-left transition-all duration-300',
                      i === active ? 'border-[#8ea2ff] bg-white/10 shadow-[0_0_30px_-6px_rgb(125_150_255/0.7)]' : 'border-white/10 bg-white/[0.03] hover:border-white/25',
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[12px] font-semibold text-white">{gate.id}</span>
                      <span className={cn('grid size-4 place-items-center rounded-full', i <= active ? 'bg-[#4cc38a] text-[#0b0d14]' : 'bg-white/10 text-transparent')}>
                        <Check size={10} strokeWidth={3.5} />
                      </span>
                    </div>
                    <div className="mt-1.5 text-[11.5px] leading-tight text-[#c9cdd8]">{gate.name}</div>
                  </button>
                </li>
              ))}
            </ol>
            <motion.div key={g.id} initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-5" aria-live="polite">
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-[#4cc38a]/15 px-2 py-0.5 font-mono text-[12px] font-semibold text-[#7be0ae]">{g.id} pass</span>
                <span className="text-[15px] font-semibold text-white">{g.name}</span>
              </div>
              <p className="mt-2 text-small leading-relaxed text-[#c9cdd8]">{g.check}</p>
            </motion.div>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {[
                ['Attempt 1', 'Hallucinated TA-99.9', 'G3 fail', 'text-[#ff9b93]'],
                ['Attempt 2', 'Guided repair', 'G3 fail', 'text-[#ff9b93]'],
                ['Route', 'Visible rule-based fallback', 'Shown, labelled', 'text-[#ffd27a]'],
              ].map(([a, b, c, tone]) => (
                <div key={a} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <div className="text-[10.5px] font-semibold tracking-wide text-[#9aa3b5] uppercase">{a}</div>
                  <div className="mt-1 text-[12.5px] text-white">{b}</div>
                  <div className={cn('mt-0.5 font-mono text-[11px] font-semibold', tone)}>{c}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function Personas({ go, busy }: { go: (id: string) => void; busy: string | null }) {
  const q = usePersonas()
  const main = useMemo(() => q.data?.filter((p) => ['u-maya', 'u-arjun', 'u-diego'].includes(p.user_id)) ?? [], [q.data])
  const other = q.data?.filter((p) => !['u-maya', 'u-arjun', 'u-diego'].includes(p.user_id)) ?? []
  return (
    <section id="personas" className="relative mx-auto max-w-6xl scroll-mt-16 px-6 py-20" data-tour="personas">
      <Reveal className="mx-auto max-w-2xl text-center">
        <div className="eyebrow">Step inside</div>
        <h2 className="mt-2 text-[clamp(28px,3.6vw,42px)] leading-tight font-semibold tracking-[-0.03em] text-ink">
          Pick a seat at <span className="font-display text-gradient italic">Kestrel Logistics</span>
        </h2>
        <p className="mt-3 text-body text-ink-2">A fictional company with three sites. Demo sign-in, no password. Every person and number is synthetic.</p>
      </Reveal>
      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {q.isLoading && [0, 1, 2].map((i) => <Skeleton key={i} className="h-80 rounded-[20px]" />)}
        {main.map((p, i) => {
          const copy = PERSONA_COPY[p.user_id]!
          return (
            <Reveal key={p.user_id} delay={i * 0.08}>
              <button onClick={() => go(p.user_id)} disabled={!!busy} className="group block h-full w-full text-left disabled:opacity-70">
                <Spotlight className={cn('lift flex h-full flex-col rounded-[20px] transition-colors group-hover:border-line-strong group-focus-visible:ring-2 group-focus-visible:ring-accent', i === 0 && 'beam-border')}>
                  <div className={cn('relative z-10 h-20 bg-gradient-to-br opacity-90', copy.gradient)}>
                    <div aria-hidden className="absolute inset-0 [background-image:radial-gradient(rgb(255_255_255/0.25)_1px,transparent_1px)] [background-size:12px_12px]" />
                    <span className="absolute top-3 right-3 rounded-full bg-black/25 px-2 py-0.5 text-[10.5px] font-semibold text-white backdrop-blur">{copy.tag}</span>
                  </div>
                  <div className="relative z-10 -mt-7 flex flex-1 flex-col px-5 pb-5">
                    <Avatar name={p.display_name} size={56} ring className="shadow-lift" />
                    <div className="mt-3 flex items-baseline justify-between gap-2">
                      <span className="text-[18px] font-semibold tracking-tight text-ink">{p.display_name}</span>
                      <span className="eyebrow">{p.role.replace('_', ' ')}</span>
                    </div>
                    <div className="text-small text-ink-3">{p.title}</div>
                    <ul className="mt-4 flex-1 space-y-2">
                      {copy.bullets.map((b) => (
                        <li key={b} className="flex items-start gap-2 text-small text-ink-2">
                          <Check size={14} className="mt-0.5 shrink-0 text-ok" /> {b}
                        </li>
                      ))}
                    </ul>
                    <div className="mt-5 flex items-center justify-between border-t border-line pt-3.5 text-small">
                      <span className="font-medium text-ink-2">{p.summary}</span>
                      <span className="grid size-8 place-items-center rounded-full bg-surface-2 text-ink-2 transition-all group-hover:bg-accent group-hover:text-accent-ink">
                        {busy === p.user_id ? <Loader2 size={15} className="animate-spin" /> : <ArrowRight size={15} />}
                      </span>
                    </div>
                  </div>
                </Spotlight>
              </button>
            </Reveal>
          )
        })}
      </div>
      {other.length > 0 && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-small text-ink-3">
          Also sign in as
          {other.map((p) => (
            <button key={p.user_id} onClick={() => go(p.user_id)} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface py-0.5 pr-2.5 pl-0.5 font-medium text-ink-2 shadow-card hover:border-line-strong hover:text-ink">
              <Avatar name={p.display_name} size={20} /> {p.display_name} · {p.title.split(',')[1]?.trim() ?? p.title}
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

export function Landing() {
  const { signIn } = useSession()
  const navigate = useNavigate()
  const [busy, setBusy] = useState<string | null>(null)
  const [tour, setTour] = useState(false)

  useEffect(() => {
    if (!canAutoStart(LANDING_TOUR_KEY)) return
    const t = setTimeout(() => setTour(true), 1400)
    return () => clearTimeout(t)
  }, [])

  const go = async (id: string) => {
    setBusy(id)
    try {
      const user = await signIn(id)
      navigate(homeFor(user))
    } finally {
      setBusy(null)
    }
  }

  const steps: TourStep[] = [
    { title: 'Welcome to Countersign', body: <>A timecard exception agent where <b className="text-ink">the model drafts, the rules verify, and a manager countersigns</b>. This tour takes about a minute.</> },
    { target: 'hero', title: 'The promise', body: 'Every AI suggestion is grounded in retrieved policy, anchored to independent evidence, checked by ten deterministic gates, and approved by a named person.' },
    { target: 'demo', title: 'Watch one exception flow through', body: 'A live walkthrough of a seeded case: two missed punches joined two shifts into a 32.5-hour span. Click any stage on the left to jump to it.' },
    { target: 'how', title: 'From guesses to one decision', body: 'Root-cause grouping turns six unexplained items into one verified fix. Pay impact is computed by code before you approve.' },
    { target: 'features', title: 'What makes it different', body: 'Cascades, evidence anchoring, pay deltas, overtime forecasts with compliant swaps, employee confirmation, injection defence, and a hash-chained audit.' },
    { target: 'harness', title: 'The harness, made visible', body: 'Hover any gate to see what it checks. Fault replays in the app prove each gate catches the failure it was built for.' },
    { target: 'stats', title: 'Measured, not claimed', body: 'Numbers come from committed evaluation reports, including the targets the model missed.' },
    { target: 'personas', title: 'Pick who you are', body: 'Maya is a manager in Fremont, Arjun runs payroll across three sites, and Diego is an employee on his phone.' },
    {
      target: 'personas',
      title: 'Ready? Start as Maya',
      body: 'Sign in as Maya and the tour continues inside the app, starting at her exception queue.',
      action: {
        label: 'Start as Maya',
        onClick: () => {
          markTourDone(LANDING_TOUR_KEY)
          localStorage.removeItem(APP_TOUR_KEY)
          setTour(false)
          void go('u-maya')
        },
      },
    },
  ]

  return (
    <div className="relative min-h-dvh overflow-x-clip">
      <Nav onTour={() => setTour(true)} />
      <main>
        <Hero onStart={() => go('u-maya')} onTour={() => setTour(true)} busy={busy === 'u-maya'} />
        <section className="border-y border-line bg-surface/60 py-5" aria-label="Technology">
          <Marquee duration={45}>
            {STACK.map((s) => (
              <span key={s} className="flex shrink-0 items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-1.5 text-small font-medium whitespace-nowrap text-ink-2 shadow-card">
                <span className="bg-brand size-1.5 rounded-full" /> {s}
              </span>
            ))}
          </Marquee>
        </section>
        <HowItWorks />
        <section id="features" className="relative mx-auto max-w-6xl px-6 py-20" data-tour="features">
          <Reveal className="mx-auto max-w-2xl text-center">
            <div className="eyebrow">Features</div>
            <h2 className="mt-2 text-[clamp(28px,3.6vw,42px)] leading-tight font-semibold tracking-[-0.03em] text-ink">
              Built for the <span className="font-display text-gradient italic">hour before cutoff</span>
            </h2>
            <p className="mt-3 text-body text-ink-2">Each capability exists to make the right decision fast and the wrong one impossible to approve by accident.</p>
          </Reveal>
          <div className="mt-10">
            <Bento />
          </div>
        </section>
        <Harness />
        <Stats />
        <Personas go={go} busy={busy} />
        <section className="relative mx-auto max-w-6xl px-6 pb-20">
          <Reveal>
            <div className="noise bg-brand relative overflow-hidden rounded-[28px] px-8 py-14 text-center text-white shadow-lift">
              <div aria-hidden className="absolute inset-0 [background-image:radial-gradient(rgb(255_255_255/0.18)_1px,transparent_1px)] [background-size:16px_16px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
              <div className="relative">
                <h2 className="text-[clamp(26px,3.4vw,40px)] leading-tight font-semibold tracking-[-0.03em]">
                  Nothing changes a timecard <span className="font-display italic">without a countersignature.</span>
                </h2>
                <p className="mx-auto mt-3 max-w-xl text-[15px] text-white/85">Walk the queue as Maya, clear an escalation as Arjun, or confirm a punch as Diego.</p>
                <div className="mt-7 flex flex-wrap justify-center gap-3">
                  <button onClick={() => go('u-maya')} disabled={!!busy} className="inline-flex h-11 items-center gap-2 rounded-xl bg-white px-5 text-[15px] font-semibold text-[#1f2b8f] shadow-lg transition-transform hover:-translate-y-0.5">
                    Open Maya's queue <ArrowRight size={16} />
                  </button>
                  <button onClick={() => setTour(true)} className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/40 bg-white/10 px-5 text-[15px] font-semibold text-white backdrop-blur hover:bg-white/20">
                    <Compass size={16} /> Replay the tour
                  </button>
                </div>
              </div>
            </div>
          </Reveal>
        </section>
      </main>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-6 py-8 text-caption text-ink-3">
          <span className="flex items-center gap-2 font-semibold text-ink-2"><Logo size={20} /> Countersign</span>
          <span>Prototype for the Dayforce AI Innovation Challenge. Fictional company "Kestrel Logistics". All people and data are synthetic. Policy pack inspired by public rules; it is not legal advice.</span>
          <a href="https://github.com/sampv69git/Dayforce" className="ml-auto inline-flex items-center gap-1.5 font-medium text-ink-2 hover:text-ink">
            <GitBranch size={14} /> Source
          </a>
        </div>
      </footer>
      <Tour
        steps={steps}
        open={tour}
        label="Landing tour"
        onClose={() => {
          markTourDone(LANDING_TOUR_KEY)
          setTour(false)
        }}
      />
    </div>
  )
}
