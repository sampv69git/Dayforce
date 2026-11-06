import { motion } from 'motion/react'
import { ArrowRight, Bot, Cpu, ShieldCheck, UserCheck } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { usePersonas } from '@/api/hooks'
import { Hatch, Skeleton } from '@/components/ui/primitives'
import { cn } from '@/lib/cn'
import { initials } from '@/lib/format'
import { homeFor, useSession } from '@/lib/session'

const STEPS = [
  { icon: <Cpu size={16} />, title: 'Rules detect', body: '17 deterministic rules find missed punches, overtime risk, schedule conflicts, and policy breaches.', tone: 'text-rule' },
  { icon: <Bot size={16} />, title: 'Model drafts', body: 'An open-weight model explains and proposes a correction from retrieved policy and evidence.', tone: 'text-model' },
  { icon: <ShieldCheck size={16} />, title: 'Harness verifies', body: 'Ten gates check schema, citations, quotes, evidence, re-simulation, and guardrails.', tone: 'text-ok' },
  { icon: <UserCheck size={16} />, title: 'You countersign', body: 'Nothing changes a timecard until a named person approves, edits, or rejects it.', tone: 'text-accent' },
]

export function Personas() {
  const q = usePersonas()
  const { signIn } = useSession()
  const navigate = useNavigate()
  const [busy, setBusy] = useState<string | null>(null)
  const main = q.data?.filter((p) => ['u-maya', 'u-arjun', 'u-diego'].includes(p.user_id)) ?? []
  const other = q.data?.filter((p) => !['u-maya', 'u-arjun', 'u-diego'].includes(p.user_id)) ?? []
  const go = async (id: string) => {
    setBusy(id)
    try {
      const user = await signIn(id)
      navigate(homeFor(user))
    } finally {
      setBusy(null)
    }
  }
  return (
    <div className="relative min-h-dvh overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.55] [background-image:linear-gradient(var(--line)_1px,transparent_1px),linear-gradient(90deg,var(--line)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:radial-gradient(ellipse_at_top,black_20%,transparent_70%)]" />
      <div className="relative mx-auto max-w-5xl px-6 pt-16 pb-12">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden>
              <rect width="32" height="32" rx="8" className="fill-ink" />
              <path d="M9 17.5l4.2 4.2L23 11.5" fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M8 24.5h16" className="stroke-canvas" strokeWidth="1.6" strokeLinecap="round" opacity=".55" />
            </svg>
            <span className="text-[17px] font-semibold tracking-tight text-ink">Countersign</span>
          </div>
          <Hatch>Synthetic data · demo sign-in</Hatch>
        </div>
        <motion.h1
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="mt-14 max-w-3xl text-[44px] leading-[1.08] font-semibold tracking-[-0.025em] text-ink"
        >
          The model drafts. The rules verify.{' '}
          <span className="text-accent">A manager countersigns.</span>
        </motion.h1>
        <p className="mt-4 max-w-2xl text-[16px] leading-relaxed text-ink-2">
          Timecard exception resolution for line managers and payroll, before the cutoff. Every AI suggestion is grounded in policy, anchored to evidence, verified by a deterministic harness, and approved by a person.
        </p>

        <div className="mt-10 grid gap-3 sm:grid-cols-3">
          {q.isLoading && [0, 1, 2].map((i) => <Skeleton key={i} className="h-40" />)}
          {main.map((p, i) => (
            <motion.button
              key={p.user_id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 * i + 0.1 }}
              onClick={() => go(p.user_id)}
              disabled={!!busy}
              className={cn(
                'group relative flex flex-col items-start rounded-[14px] border border-line bg-surface p-5 text-left transition-all hover:-translate-y-0.5 hover:border-line-strong hover:shadow-overlay focus-visible:ring-2 focus-visible:ring-accent',
                busy === p.user_id && 'opacity-70',
              )}
            >
              <div className="flex w-full items-center justify-between">
                <span className="grid size-10 place-items-center rounded-full bg-ink text-small font-semibold text-canvas">{initials(p.display_name)}</span>
                <span className="eyebrow">{p.role.replace('_', ' ')}</span>
              </div>
              <div className="mt-4 text-heading font-semibold text-ink">{p.display_name}</div>
              <div className="text-small text-ink-3">{p.title}</div>
              <div className="mt-4 flex w-full items-center justify-between border-t border-line pt-3 text-small">
                <span className="font-medium text-ink-2">{p.summary}</span>
                <ArrowRight size={15} className="text-ink-3 transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
              </div>
            </motion.button>
          ))}
        </div>
        {other.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-small text-ink-3">
            Also:
            {other.map((p) => (
              <button key={p.user_id} onClick={() => go(p.user_id)} className="rounded-full border border-line bg-surface px-2.5 py-0.5 font-medium text-ink-2 hover:border-line-strong hover:text-ink">
                {p.display_name} · {p.title.split(',')[1]?.trim() ?? p.title}
              </button>
            ))}
          </div>
        )}

        <ol className="mt-16 grid gap-px overflow-hidden rounded-[14px] border border-line bg-line sm:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="bg-surface p-5">
              <div className={cn('flex items-center gap-2 text-small font-semibold', s.tone)}>
                <span className="grid size-6 place-items-center rounded-md border border-line bg-surface-2">{s.icon}</span>
                {i + 1}. {s.title}
              </div>
              <p className="mt-2 text-small leading-relaxed text-ink-2">{s.body}</p>
            </li>
          ))}
        </ol>
        <p className="mt-6 text-caption text-ink-3">
          Prototype for the Dayforce AI Innovation Challenge. Fictional company "Kestrel Logistics". All people and data are synthetic. Policy pack inspired by public rules; it is not legal advice.
        </p>
      </div>
    </div>
  )
}
