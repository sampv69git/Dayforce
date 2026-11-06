import { motion, useReducedMotion } from 'motion/react'
import { CalendarX2, Check, Fingerprint, Scale, ShieldCheck, TrendingUp } from 'lucide-react'
import { Reveal, Spotlight } from '@/components/fx'
import { cn } from '@/lib/cn'

const ITEMS = [
  {
    phrase: 'missed punches',
    icon: Fingerprint,
    tone: 'from-brand-1 to-brand-2',
    detects: '5 rules: missing in or out, two shifts joined into one span, duplicate taps, open meal breaks',
    corrects: 'Adds the punch at a time anchored to a badge, scanner, or employee confirmation; escalates when evidence conflicts',
    where: "Maya's queue",
  },
  {
    phrase: 'overtime risks',
    icon: TrendingUp,
    tone: 'from-warn to-[#d6457a]',
    detects: 'Daily, weekly, and seventh-day overtime, plus a forecast from the remaining schedule before it is worked',
    corrects: 'Reassigns the shift to a colleague who passes eight checks, or pre-approves worked overtime',
    where: 'Overtime forecast',
  },
  {
    phrase: 'schedule conflicts',
    icon: CalendarX2,
    tone: 'from-brand-3 to-brand-1',
    detects: 'Published shifts that overlap or break minimum rest, plus late, early, and unscheduled work',
    corrects: 'Moves the conflicting shift before anyone works it; approves unscheduled time so it is paid',
    where: 'Queue and forecast',
  },
  {
    phrase: 'policy breaches',
    icon: Scale,
    tone: 'from-brand-2 to-[#d6457a]',
    detects: 'Meal periods, rest between shifts, holiday work, under the California, Texas, and Bengaluru rules',
    corrects: 'Records the premium owed instead of editing breaks to hide the breach',
    where: 'Queue, payroll',
  },
]

export function BriefAnswered() {
  const reduce = useReducedMotion()
  return (
    <section id="brief" className="relative mx-auto max-w-6xl scroll-mt-16 px-6 pt-20" data-tour="brief">
      <Reveal className="mx-auto max-w-3xl text-center">
        <div className="eyebrow">Use Case 5 · Time and Attendance</div>
        <h2 className="mt-2 text-[clamp(28px,3.6vw,42px)] leading-tight font-semibold tracking-[-0.03em] text-ink">
          The brief, <span className="font-display text-gradient italic">answered line by line</span>
        </h2>
        <blockquote className="mx-auto mt-5 max-w-3xl rounded-2xl border border-line bg-surface px-6 py-4 text-[17px] leading-relaxed text-ink-2 shadow-card">
          "Create a timecard exception resolution agent that detects{' '}
          {ITEMS.map((it, i) => (
            <span key={it.phrase}>
              <motion.mark
                initial={reduce ? false : { backgroundSize: '0% 100%' }}
                whileInView={{ backgroundSize: '100% 100%' }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: 0.2 + i * 0.25 }}
                className="rounded bg-gradient-to-r from-accent-soft to-accent-soft bg-no-repeat px-0.5 font-semibold text-ink"
              >
                {it.phrase}
              </motion.mark>
              {i < ITEMS.length - 2 ? ', ' : i === ITEMS.length - 2 ? ', and ' : ''}
            </span>
          ))}
          , then proposes{' '}
          <motion.mark
            initial={reduce ? false : { backgroundSize: '0% 100%' }}
            whileInView={{ backgroundSize: '100% 100%' }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 1.3 }}
            className="rounded bg-gradient-to-r from-ok-soft to-ok-soft bg-no-repeat px-0.5 font-semibold text-ink"
          >
            compliant corrections
          </motion.mark>
          ."
        </blockquote>
      </Reveal>
      <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {ITEMS.map((it, i) => {
          const Icon = it.icon
          return (
            <Reveal key={it.phrase} delay={i * 0.08}>
              <Spotlight className="lift flex h-full flex-col p-5">
                <div className="relative z-10 flex h-full flex-col">
                  <span className={cn('grid size-10 place-items-center rounded-xl bg-gradient-to-br text-white shadow-lift', it.tone)}><Icon size={18} /></span>
                  <h3 className="mt-3 text-heading font-semibold text-ink capitalize">{it.phrase}</h3>
                  <div className="mt-3 text-caption font-semibold tracking-wide text-ink-3 uppercase">Detects</div>
                  <p className="mt-0.5 text-small leading-relaxed text-ink-2">{it.detects}</p>
                  <div className="mt-3 text-caption font-semibold tracking-wide text-ink-3 uppercase">Proposes</div>
                  <p className="mt-0.5 flex-1 text-small leading-relaxed text-ink-2">{it.corrects}</p>
                  <div className="mt-4 flex items-center gap-1.5 border-t border-line pt-3 text-caption text-ink-3">
                    <Check size={12} className="text-ok" /> See it in <span className="font-medium text-ink-2">{it.where}</span>
                  </div>
                </div>
              </Spotlight>
            </Reveal>
          )
        })}
      </div>
      <Reveal delay={0.2}>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 rounded-2xl border border-ok/25 bg-ok-soft/60 px-5 py-3 text-small text-ink-2">
          <span className="flex items-center gap-1.5 font-semibold text-ok"><ShieldCheck size={15} /> Compliant, and proven so</span>
          <span>Every correction cites retrieved policy verbatim</span>
          <span>Re-simulated so it fixes the problem and creates no new one</span>
          <span>Approved by a person before anything changes</span>
        </div>
      </Reveal>
    </section>
  )
}
