import { motion } from 'motion/react'
import { CircleGauge, Clock, GitBranch, ShieldCheck, Table2, TrendingDown, Wallet } from 'lucide-react'
import { useState } from 'react'
import { useOutcomes } from '@/api/hooks'
import type { Money } from '@/api/types'
import { Kpi, NumberTicker, PageHeader } from '@/components/fx'
import { Card, CardHeader, ErrorState, Hatch, Skeleton, Tip } from '@/components/ui/primitives'
import { cn } from '@/lib/cn'
import { hours, money } from '@/lib/format'

const moneys = (list: Money[]) => (list.length ? list.map((m) => money(m)).join(' + ') : 'None yet')

const ROUTES: { key: string; label: string; cls: string }[] = [
  { key: 'suggest', label: 'Verified model draft', cls: 'bg-ok' },
  { key: 'manual', label: 'Rule-based mode', cls: 'bg-rule' },
  { key: 'fallback', label: 'Visible fallback', cls: 'bg-warn' },
  { key: 'escalate', label: 'Escalated', cls: 'bg-crit' },
]

export default function Outcomes() {
  const q = useOutcomes()
  const [table, setTable] = useState(false)
  const o = q.data
  if (q.isLoading) return <div className="grid grid-cols-4 gap-4 p-6">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-32" />)}</div>
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />
  if (!o) return null
  const h = o.harness as {
    runs: number; model_runs: number; fault_replays: number; by_route: Record<string, number>; first_pass_verified: number; repaired: number
    failing_gates: Record<string, number>; unsafe_reached_manager: number; providers: Record<string, number>; latency_p50_ms: number | null; latency_p95_ms: number | null; injection_flagged: number
  }
  const routeTotal = Object.values(h.by_route).reduce((a, b) => a + b, 0) || 1
  const gates = Object.entries(h.failing_gates)
  const gateMax = Math.max(1, ...gates.map(([, v]) => v))
  return (
    <div className="mx-auto max-w-[1280px] space-y-5 p-6">
      <PageHeader icon={<CircleGauge size={22} />} tone="ok" eyebrow="Measured outcomes" title="Outcomes" description="Computed live from stored decisions, runs, and audit timestamps in this environment." actions={<Hatch>{o.source_label}</Hatch>} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi tone="ok" progress={o.resolved_before_cutoff_pct / 100} icon={<ShieldCheck size={14} />} label="Resolved before cutoff" value={<><NumberTicker value={o.resolved_before_cutoff_pct} /><span className="text-title text-ink-3">%</span></>} caption={`${o.resolved} of ${o.total} exceptions, ${o.open} still open`} />
        <Kpi delay={0.05} icon={<Clock size={14} />} label="Median time to decision" value={o.median_time_to_decision_s === null ? '–' : o.median_time_to_decision_s < 120 ? <>{Math.round(o.median_time_to_decision_s)}<span className="text-title text-ink-3"> s</span></> : <>{(o.median_time_to_decision_s / 60).toFixed(1)}<span className="text-title text-ink-3"> min</span></>} caption={`From draft shown to countersignature, ${o.decisions} decision(s)`} />
        <Kpi delay={0.1} tone="teal" icon={<GitBranch size={14} />} label="Cleared by root-cause fixes" value={<NumberTicker value={o.cleared_by_cascade} />} caption={o.largest_cascade ? `Largest: one decision cleared ${o.largest_cascade + 1} exceptions` : 'No cascades resolved yet'} />
        <Kpi delay={0.15} tone="model" icon={<Wallet size={14} />} label="Unpaid time recovered" value={hours(o.paid_hours_recovered)} caption={`Value ${moneys(o.paid_value_recovered)} from missing-punch fixes`} />
        <Kpi tone="warn" icon={<TrendingDown size={14} />} label="Overtime cost flagged" value={<span className="text-[22px]">{moneys(o.overtime_cost_flagged)}</span>} caption="Projected before it is worked" />
        <Kpi delay={0.05} tone="ok" icon={<TrendingDown size={14} />} label="Overtime cost avoided" value={<span className="text-[22px]">{moneys(o.overtime_cost_avoided)}</span>} caption="Through approved, rule-checked shift swaps" />
        <Kpi delay={0.1} tone="teal" icon={<Wallet size={14} />} label="Premiums recorded" value={hours(o.premium_hours_recorded)} caption="Meal and holiday premiums owed to employees" />
        <Kpi delay={0.15} tone={h.unsafe_reached_manager ? 'crit' : 'ok'} icon={<ShieldCheck size={14} />} label="Unsafe drafts shown to a manager" value={<span className={h.unsafe_reached_manager ? 'text-crit' : 'text-ok'}>{h.unsafe_reached_manager}</span>} caption={`Across ${h.runs} runs and ${h.fault_replays} fault replays`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            eyebrow="Harness"
            title="How drafts were routed"
            actions={<button onClick={() => setTable((v) => !v)} className="flex items-center gap-1 text-caption text-ink-3 hover:text-ink"><Table2 size={13} /> {table ? 'Chart' : 'Table'}</button>}
          />
          <div className="px-4 pb-4">
            {table ? (
              <table className="w-full text-small">
                <tbody>
                  {ROUTES.map((r) => (
                    <tr key={r.key} className="border-t border-line/70"><td className="py-1.5 text-ink-2">{r.label}</td><td className="tabular py-1.5 text-right font-mono text-ink">{h.by_route[r.key] ?? 0}</td></tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <>
                <div className="flex h-9 gap-[2px] overflow-hidden rounded-lg shadow-card">
                  {ROUTES.filter((r) => (h.by_route[r.key] ?? 0) > 0).map((r) => (
                    <Tip key={r.key} content={`${r.label}: ${h.by_route[r.key]} run(s)`}>
                      <motion.div initial={{ flexGrow: 0 }} animate={{ flexGrow: h.by_route[r.key] ?? 0 }} transition={{ duration: 0.5 }} className={cn('h-full min-w-1 first:rounded-l-md last:rounded-r-md', r.cls)} style={{ flexBasis: 0 }} />
                    </Tip>
                  ))}
                </div>
                <ul className="mt-3 grid grid-cols-2 gap-2">
                  {ROUTES.map((r) => (
                    <li key={r.key} className="flex items-center gap-2 text-small">
                      <span className={cn('size-2.5 rounded-sm', r.cls)} />
                      <span className="text-ink-2">{r.label}</span>
                      <span className="tabular ml-auto font-mono text-ink">{h.by_route[r.key] ?? 0}</span>
                      <span className="tabular w-10 text-right font-mono text-caption text-ink-3">{Math.round(((h.by_route[r.key] ?? 0) / routeTotal) * 100)}%</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <div className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-3 text-small">
              <div><div className="text-caption text-ink-3">Model runs</div><div className="tabular font-mono text-ink">{h.model_runs}</div></div>
              <div><div className="text-caption text-ink-3">Verified first pass</div><div className="tabular font-mono text-ink">{h.first_pass_verified}</div></div>
              <div><div className="text-caption text-ink-3">Repaired on retry</div><div className="tabular font-mono text-ink">{h.repaired}</div></div>
              <div><div className="text-caption text-ink-3">Latency p50</div><div className="tabular font-mono text-ink">{h.latency_p50_ms ? `${(h.latency_p50_ms / 1000).toFixed(2)} s` : '–'}</div></div>
              <div><div className="text-caption text-ink-3">Latency p95</div><div className="tabular font-mono text-ink">{h.latency_p95_ms ? `${(h.latency_p95_ms / 1000).toFixed(2)} s` : '–'}</div></div>
              <div><div className="text-caption text-ink-3">Injection notes flagged</div><div className="tabular font-mono text-ink">{h.injection_flagged}</div></div>
            </div>
          </div>
        </Card>
        <Card>
          <CardHeader eyebrow="Harness" title="Which gates caught problems" />
          <div className="px-4 pb-4">
            {gates.length === 0 ? (
              <p className="py-8 text-center text-small text-ink-3">No gate has failed yet. Replay a fault in the inspector to see the harness catch one.</p>
            ) : (
              <ul className="space-y-2">
                {gates.map(([g, v]) => (
                  <li key={g} className="grid grid-cols-[44px_1fr_32px] items-center gap-3 text-small">
                    <span className="font-mono text-ink-2">{g}</span>
                    <Tip content={`${g} failed ${v} time(s) across all attempts`}>
                      <span className="relative h-4 rounded-r-[4px] bg-surface-2">
                        <motion.span initial={{ width: 0 }} animate={{ width: `${(v / gateMax) * 100}%` }} transition={{ duration: 0.5 }} className="absolute inset-y-0 left-0 rounded-r-[4px] bg-gradient-to-r from-warn to-crit" />
                      </span>
                    </Tip>
                    <span className="tabular text-right font-mono text-ink">{v}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-4 border-t border-line pt-3 text-caption text-ink-3">Counts include deliberate fault replays. Each failure ended in a visible fallback or escalation.</p>
          </div>
        </Card>
      </div>
    </div>
  )
}
