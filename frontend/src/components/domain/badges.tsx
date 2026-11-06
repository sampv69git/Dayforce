import { motion, useReducedMotion } from 'motion/react'
import { AlertOctagon, Bot, Check, CircleSlash, Cpu, FileText, Hourglass, ShieldAlert, ShieldCheck, UserCheck, X } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Draft, GateResult, PaySnapshot, Route, Severity } from '@/api/types'
import { Pill, Pop, Tip } from '@/components/ui/primitives'
import { cn } from '@/lib/cn'
import { hours, money } from '@/lib/format'

/* ------------------------------------------------------------ Severity */
const SEV: Record<Severity, { label: string; bar: string; text: string }> = {
  critical: { label: 'Critical', bar: 'bg-crit', text: 'text-crit' },
  high: { label: 'High', bar: 'bg-[color-mix(in_oklab,var(--crit)_70%,var(--warn))]', text: 'text-crit' },
  medium: { label: 'Medium', bar: 'bg-warn', text: 'text-warn' },
  low: { label: 'Low', bar: 'bg-line-strong', text: 'text-ink-3' },
}

export function SeverityBar({ severity, className }: { severity: Severity; className?: string }) {
  return <span aria-hidden className={cn('w-[3px] shrink-0 rounded-full', SEV[severity].bar, className)} />
}

export function SeverityLabel({ severity }: { severity: Severity }) {
  return <span className={cn('eyebrow !text-[10.5px]', SEV[severity].text)}>{SEV[severity].label}</span>
}

/* ------------------------------------------------------------ Route */
const ROUTE: Record<Route, { label: string; tone: 'ok' | 'warn' | 'crit' | 'neutral'; icon: ReactNode; tip: string }> = {
  suggest: { label: 'Verified draft', tone: 'ok', icon: <ShieldCheck size={12} />, tip: 'Model draft passed all ten harness gates' },
  fallback: { label: 'Rule-based fallback', tone: 'warn', icon: <ShieldAlert size={12} />, tip: 'The harness rejected the model draft and is showing the deterministic suggestion' },
  escalate: { label: 'Escalated', tone: 'crit', icon: <AlertOctagon size={12} />, tip: 'No safe correction can be supported; payroll must decide' },
  manual: { label: 'Rule-based', tone: 'neutral', icon: <Cpu size={12} />, tip: 'Rule-based mode: deterministic template, verified by every gate' },
}

export function RouteBadge({ route, repaired }: { route: Route | null | undefined; repaired?: boolean }) {
  if (!route) return <Pill tone="outline">Not drafted</Pill>
  const r = ROUTE[route]
  return (
    <Tip content={r.tip}>
      <Pill tone={r.tone}>
        {r.icon}
        {r.label}
        {repaired && <span className="opacity-70">· repaired</span>}
      </Pill>
    </Tip>
  )
}

export function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; tone: 'neutral' | 'ok' | 'warn' | 'crit' | 'accent' | 'outline' }> = {
    open: { label: 'Needs you', tone: 'accent' },
    suggested: { label: 'Ready', tone: 'ok' },
    awaiting_employee: { label: 'Awaiting employee', tone: 'outline' },
    escalated: { label: 'Escalated', tone: 'crit' },
    resolved: { label: 'Countersigned', tone: 'neutral' },
    superseded: { label: 'Cleared', tone: 'neutral' },
  }
  const s = map[status] ?? { label: status, tone: 'neutral' as const }
  return (
    <Pill tone={s.tone}>
      {status === 'awaiting_employee' && <Hourglass size={11} />}
      {status === 'resolved' && <UserCheck size={11} />}
      {s.label}
    </Pill>
  )
}

/* ------------------------------------------------------------ Gate strip */
export function GateStrip({ gates, animate = true, compact = false }: { gates: GateResult[]; animate?: boolean; compact?: boolean }) {
  const reduce = useReducedMotion()
  const failed = gates.filter((g) => g.status === 'fail').length
  return (
    <div>
      <ol className="flex flex-wrap items-center gap-1.5" aria-label="Harness gates">
        {gates.map((g, i) => (
          <motion.li
            key={`${g.id}-${g.status}`}
            initial={animate && !reduce ? { opacity: 0, y: 4, scale: 0.92 } : false}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: animate ? i * 0.06 : 0, duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <Tip
              content={
                <div>
                  <div className="font-semibold text-ink">
                    {g.id} {g.name} · {g.status}
                  </div>
                  <div className="mt-0.5">{g.detail}</div>
                </div>
              }
            >
              <span
                tabIndex={0}
                className={cn(
                  'inline-flex h-7 items-center gap-1 rounded-lg border px-2 font-mono text-[11px] font-medium outline-none transition-transform hover:-translate-y-px focus-visible:ring-2 focus-visible:ring-accent',
                  g.status === 'pass' && 'border-ok/25 bg-ok-soft text-ok shadow-[0_2px_10px_-4px_var(--ok)]',
                  g.status === 'fail' && 'border-crit/40 bg-crit-soft text-crit shadow-[0_2px_12px_-3px_var(--crit)]',
                  g.status === 'skip' && 'border-line bg-surface-2 text-ink-3',
                )}
              >
                {g.status === 'pass' ? <Check size={11} strokeWidth={2.5} /> : g.status === 'fail' ? <X size={11} strokeWidth={2.5} /> : <CircleSlash size={10} />}
                {g.id}
                {!compact && <span className="font-sans font-normal">{g.name.split(' ')[0]}</span>}
              </span>
            </Tip>
          </motion.li>
        ))}
      </ol>
      <span className="sr-only" aria-live="polite">
        {failed === 0 ? 'All gates passed' : `${failed} gate(s) failed`}
      </span>
    </div>
  )
}

/* ------------------------------------------------------------ Evidence strength */
const FACTOR_LABEL: Record<string, string> = {
  badge_match: 'Badge event within 5 min',
  scanner_match: 'Scanner activity within 20 min',
  schedule_alignment: 'Matches the schedule',
  attestation_match: 'Employee confirmation',
  pattern_consistency: 'Matches usual punch time',
  conflict: 'Conflicting strong evidence',
  deterministic_facts: 'Computed from recorded punches',
}

export function EvidenceMeter({ strength }: { strength: Draft['evidence_strength'] }) {
  const pct = Math.round(strength.score * 100)
  const tone = strength.level === 'high' ? 'bg-ok' : strength.level === 'medium' ? 'bg-warn' : 'bg-crit'
  return (
    <Pop
      trigger={
        <button className="group flex items-center gap-2 rounded-md text-left outline-none" aria-label={`Evidence strength ${pct} percent, ${strength.level}`}>
          <span className="relative h-2 w-24 overflow-hidden rounded-full bg-surface-3">
            <motion.span
              className={cn('absolute inset-y-0 left-0 rounded-full', tone)}
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
            />
          </span>
          <span className="tabular text-small font-semibold text-ink">{strength.score.toFixed(2)}</span>
          <span className="text-small capitalize text-ink-3 group-hover:text-ink-2">{strength.level}</span>
        </button>
      }
      className="w-80"
    >
      <div className="eyebrow mb-2">Evidence strength (computed by the harness)</div>
      <ul className="space-y-1.5">
        {Object.entries(strength.factors).map(([k, v]) => (
          <li key={k} className="flex items-center justify-between gap-3 text-small">
            <span className="text-ink-2">{FACTOR_LABEL[k] ?? k}</span>
            <span className={cn('tabular font-mono', k === 'conflict' && v > 0 ? 'text-crit' : v > 0 ? 'text-ink' : 'text-ink-3')}>{v.toFixed(2)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 border-t border-line pt-2 text-caption text-ink-3">
        The model's own confidence is never used for routing. This score is computed from independent evidence.
      </p>
    </Pop>
  )
}

/* ------------------------------------------------------------ Pay delta */
export function PayDelta({ before, after }: { before: PaySnapshot; after: PaySnapshot }) {
  const rows: [string, number, number][] = [
    ['Regular', before.regular_hours, after.regular_hours],
    ['Overtime', before.overtime_hours, after.overtime_hours],
    ['Double time', before.double_time_hours, after.double_time_hours],
    ['Premiums', before.premium_hours, after.premium_hours],
  ]
  const cost = after.cost.amount - before.cost.amount
  return (
    <div>
      <table className="w-full text-small">
        <thead>
          <tr className="text-caption text-ink-3">
            <th className="pb-1.5 text-left font-medium">Week</th>
            <th className="pb-1.5 text-right font-medium">Before</th>
            <th className="pb-1.5 text-right font-medium">After</th>
            <th className="pb-1.5 text-right font-medium">Change</th>
          </tr>
        </thead>
        <tbody className="tabular">
          {rows.map(([label, b, a]) => (
            <tr key={label} className="border-t border-line/70">
              <td className="py-1.5 text-ink-2">{label}</td>
              <td className="py-1.5 text-right font-mono text-ink-3">{hours(b)}</td>
              <td className="py-1.5 text-right font-mono text-ink">{hours(a)}</td>
              <td className={cn('py-1.5 text-right font-mono', Math.abs(a - b) < 0.005 ? 'text-ink-3' : 'font-semibold text-ink')}>
                {Math.abs(a - b) < 0.005 ? '·' : hours(a - b, { sign: true })}
              </td>
            </tr>
          ))}
          <tr className="border-t border-line-strong">
            <td className="pt-2 font-medium text-ink">Cost</td>
            <td className="pt-2 text-right font-mono text-ink-3">{money(before.cost)}</td>
            <td className="pt-2 text-right font-mono text-ink">{money(after.cost)}</td>
            <td className="pt-2 text-right font-mono font-semibold text-ink">{money({ ...after.cost, amount: cost }, { sign: true })}</td>
          </tr>
        </tbody>
      </table>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {before.unpaid_shifts > after.unpaid_shifts && (
          <Pill tone="accent">{before.unpaid_shifts - after.unpaid_shifts} unpaid shift(s) recovered</Pill>
        )}
        {before.overtime_hours + before.double_time_hours - (after.overtime_hours + after.double_time_hours) > 1 && (
          <Pill tone="neutral">{hours(before.overtime_hours + before.double_time_hours - after.overtime_hours - after.double_time_hours)} phantom overtime removed</Pill>
        )}
        {after.premium_hours > before.premium_hours && <Pill tone="neutral">{hours(after.premium_hours - before.premium_hours)} premium owed to employee</Pill>}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------ Provenance label */
export function Provenance({ kind, children }: { kind: 'model' | 'rule' | 'fallback' | 'escalate' | 'human'; children?: ReactNode }) {
  const map = {
    model: { cls: 'text-model', icon: <Bot size={12} />, label: 'Model draft' },
    rule: { cls: 'text-rule', icon: <Cpu size={12} />, label: 'Rule-based' },
    fallback: { cls: 'text-warn', icon: <ShieldAlert size={12} />, label: 'Rule-based fallback' },
    escalate: { cls: 'text-crit', icon: <AlertOctagon size={12} />, label: 'Escalation' },
    human: { cls: 'text-accent', icon: <UserCheck size={12} />, label: 'Countersigned' },
  }[kind]
  return (
    <span className={cn('inline-flex items-center gap-1 text-caption font-semibold uppercase tracking-wide', map.cls)}>
      {map.icon}
      {children ?? map.label}
    </span>
  )
}

export function DocChip({ id }: { id: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-line bg-surface-2 px-1.5 py-px font-mono text-[11px] text-ink-2">
      <FileText size={10} />
      {id}
    </span>
  )
}
