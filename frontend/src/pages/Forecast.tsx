import { motion } from 'motion/react'
import { CalendarClock, Check, ChevronDown, TrendingUp, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useForecast } from '@/api/hooks'
import type { ForecastRisk, OvertimeForecast } from '@/api/types'
import { StatusPill } from '@/components/domain/badges'
import { ExceptionPanel } from '@/components/domain/ExceptionPanel'
import { Avatar, PageHeader } from '@/components/fx'
import { Button, Card, CardHeader, EmptyState, ErrorState, Pill, Segmented, Skeleton, Tip } from '@/components/ui/primitives'
import { cn } from '@/lib/cn'
import { dayTime, hours, money, weekday } from '@/lib/format'
import { useSession } from '@/lib/session'

type Site = 'FRE' | 'AUS' | 'BLR'

const CHECK_LABEL: Record<string, string> = {
  same_role: 'Same role',
  same_site: 'Same site',
  non_exempt: 'Non-exempt',
  available: 'Available',
  rest_before: 'Rest before',
  rest_after: 'Rest after',
  stays_under_threshold: 'Stays under threshold',
  no_seventh_day: 'No 7th day',
}

export default function Forecast() {
  const { user } = useSession()
  const [site, setSite] = useState<Site>((user?.site_scope[0] as Site) ?? 'FRE')
  const q = useForecast(site)
  const f = q.data
  const names = useMemo(() => Object.fromEntries(f?.rows.map((r) => [r.employee.id, r.employee.name]) ?? []), [f])
  const totalRisk = f?.risks.filter((r) => r.status !== 'resolved').reduce((a, r) => a + r.projected_cost.amount, 0) ?? 0
  return (
    <div className="mx-auto max-w-[1280px] space-y-5 p-6">
      <PageHeader
        icon={<CalendarClock size={22} />}
        tone="warn"
        eyebrow="Prevent, do not pay"
        title="Overtime forecast"
        description="Worked hours plus the remaining published schedule, projected against the weekly threshold. Swap candidates are checked against every rule for both employees before they are suggested."
        actions={
          <>
            {user?.role === 'payroll_admin' && (
              <Segmented value={site} onChange={setSite} options={[{ value: 'FRE', label: 'Fremont' }, { value: 'AUS', label: 'Austin' }, { value: 'BLR', label: 'Bengaluru' }]} />
            )}
            {f && (
              <div className="relative overflow-hidden rounded-xl border border-crit/25 bg-crit-soft px-4 py-2.5 text-right">
                <div className="eyebrow !text-crit">Projected overtime cost</div>
                <div className="tabular font-mono text-[24px] leading-8 font-semibold text-ink">{money({ amount: totalRisk, currency: f.risks[0]?.projected_cost.currency ?? (site === 'BLR' ? 'INR' : 'USD') })}</div>
                <div className="text-caption text-ink-2">{f.risks.filter((r) => r.status !== 'resolved').length} employee(s) at risk</div>
              </div>
            )}
          </>
        }
      />
      {q.isLoading && <Skeleton className="h-96" />}
      {q.isError && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      {f && <WeekGrid f={f} />}
      {f && f.risks.length === 0 && <EmptyState icon={<TrendingUp size={18} />} title="No projected overtime" body="Every employee's worked and scheduled hours stay within the threshold." />}
      <div className="space-y-4">
        {f?.risks.map((r) => <RiskCard key={r.exception_id} risk={r} names={names} threshold={f.threshold_hours} />)}
      </div>
    </div>
  )
}

function WeekGrid({ f }: { f: OvertimeForecast }) {
  const days = f.rows[0]?.days.map((d) => d.date) ?? []
  const max = Math.max(f.threshold_hours + 12, ...f.rows.map((r) => r.projected_hours))
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full min-w-[900px] text-small">
          <thead>
            <tr className="border-b border-line bg-surface-2/60 text-caption text-ink-3">
              <th className="px-4 py-2 text-left font-medium">Employee</th>
              {days.map((d) => <th key={d} className="px-1 py-2 text-center font-medium">{weekday(d)} {d.slice(8)}</th>)}
              <th className="px-3 py-2 text-right font-medium">Worked</th>
              <th className="px-3 py-2 text-right font-medium">Scheduled</th>
              <th className="w-[260px] px-4 py-2 text-left font-medium">Projected vs {f.threshold_hours} h</th>
            </tr>
          </thead>
          <tbody>
            {f.rows.map((r) => {
              const over = r.projected_hours > r.threshold_hours
              return (
                <tr key={r.employee.id} className="border-b border-line/70 last:border-0">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={r.employee.name} size={30} />
                      <div>
                        <div className="font-semibold text-ink">{r.employee.name}</div>
                        <div className="text-caption text-ink-3">{r.employee.role}</div>
                      </div>
                    </div>
                  </td>
                  {r.days.map((d) => (
                    <td key={d.date} className="px-1 py-2 text-center">
                      {d.worked_hours > 0 ? (
                        <span className="inline-block min-w-11 rounded-md bg-gradient-to-b from-ink/80 to-ink px-1.5 py-1 font-mono text-[11px] text-canvas shadow-card">{d.worked_hours.toFixed(1)}</span>
                      ) : d.scheduled_hours > 0 ? (
                        <span className="inline-block min-w-11 rounded-md border border-dashed border-accent/60 bg-accent-soft/60 px-1.5 py-1 font-mono text-[11px] text-accent">{d.scheduled_hours.toFixed(1)}</span>
                      ) : (
                        <span className="text-ink-3">·</span>
                      )}
                    </td>
                  ))}
                  <td className="tabular px-3 py-2 text-right font-mono text-ink-2">{r.worked_hours.toFixed(1)}</td>
                  <td className="tabular px-3 py-2 text-right font-mono text-ink-2">{r.scheduled_remaining_hours.toFixed(1)}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <div className="relative h-2.5 flex-1 rounded-full bg-surface-3">
                        <motion.div
                          className={cn('absolute inset-y-0 left-0 rounded-full', over ? 'bg-gradient-to-r from-warn to-crit shadow-[0_0_14px_-2px_var(--crit)]' : 'bg-brand')}
                          initial={{ width: 0 }}
                          animate={{ width: `${(r.projected_hours / max) * 100}%` }}
                          transition={{ duration: 0.5 }}
                        />
                        <span className="absolute -top-1 -bottom-1 w-px bg-ink" style={{ left: `${(r.threshold_hours / max) * 100}%` }} />
                      </div>
                      <span className={cn('tabular w-12 text-right font-mono text-[12px]', over ? 'font-semibold text-crit' : 'text-ink-2')}>{r.projected_hours.toFixed(1)}</span>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="flex gap-4 border-t border-line px-4 py-2 text-caption text-ink-3">
        <span className="flex items-center gap-1.5"><span className="h-3 w-5 rounded bg-ink/85" /> Worked</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-5 rounded border border-dashed border-accent/60 bg-accent-soft/50" /> Scheduled (future)</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-px bg-ink" /> Threshold</span>
      </div>
    </Card>
  )
}

function RiskCard({ risk, names, threshold }: { risk: ForecastRisk; names: Record<string, string>; threshold: number }) {
  const [open, setOpen] = useState(false)
  const resolved = risk.status === 'resolved'
  return (
    <Card className={cn('overflow-hidden', resolved && 'opacity-80')}>
      <div aria-hidden className="h-1 bg-gradient-to-r from-warn via-crit to-brand-2" />
      <CardHeader
        eyebrow={`Risk · ${risk.exception_id}`}
        title={
          <span className="flex items-center gap-2.5">
            <Avatar name={risk.employee_name} size={30} />
            <span>
              {risk.employee_name}: <span className="text-crit">+{hours(risk.projected_overtime_hours)}</span> projected ({risk.projected_hours.toFixed(1)} h of {threshold} h)
            </span>
          </span>
        }
        actions={
          <>
            <StatusPill status={risk.status} />
            <Pill tone="crit">{money(risk.projected_cost)} projected</Pill>
          </>
        }
      />
      <div className="px-4 pb-4">
        <p className="text-small text-ink-2">
          Shift at risk: <span className="font-mono">{dayTime(risk.shift_start)}</span> to <span className="font-mono">{risk.shift_end.slice(11)}</span>
        </p>
        <div className="mt-3 overflow-x-auto rounded-md border border-line scrollbar-thin">
          <table className="w-full min-w-[760px] text-small">
            <thead>
              <tr className="bg-surface-2/60 text-caption text-ink-3">
                <th className="px-3 py-1.5 text-left font-medium">Candidate</th>
                <th className="px-3 py-1.5 text-right font-medium">Hours after</th>
                <th className="px-3 py-1.5 text-right font-medium">Rest before / after</th>
                <th className="px-3 py-1.5 text-left font-medium">Checks</th>
              </tr>
            </thead>
            <tbody>
              {risk.candidates.map((c, i) => (
                <tr key={c.employee_id} className={cn('border-t border-line/70 transition-colors hover:bg-surface-2/50', c.eligible && i === 0 && 'bg-gradient-to-r from-ok-soft to-transparent')}>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      {c.eligible ? <Check size={14} className="text-ok" /> : <X size={14} className="text-ink-3" />}
                      <span className={cn('font-medium', c.eligible ? 'text-ink' : 'text-ink-3')}>{c.name}</span>
                      {c.eligible && i === 0 && <Pill tone="ok">Best fit</Pill>}
                    </div>
                    {c.reason && <div className="mt-0.5 pl-6 text-caption text-ink-3">{c.reason}</div>}
                  </td>
                  <td className={cn('tabular px-3 py-2 text-right font-mono', c.projected_hours_after > threshold ? 'text-crit' : 'text-ink-2')}>{c.projected_hours_after.toFixed(1)} h</td>
                  <td className="tabular px-3 py-2 text-right font-mono text-ink-2">{c.rest_before_hours ?? '–'} / {c.rest_after_hours ?? '–'} h</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(c.checks).map(([k, ok]) => (
                        <Tip key={k} content={CHECK_LABEL[k] ?? k}>
                          <span className={cn('grid size-5 place-items-center rounded border', ok ? 'border-ok/25 bg-ok-soft text-ok' : 'border-crit/25 bg-crit-soft text-crit')}>
                            {ok ? <Check size={11} /> : <X size={11} />}
                          </span>
                        </Tip>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
              {risk.candidates.length === 0 && (
                <tr><td colSpan={4} className="px-3 py-3 text-ink-3">No colleague in the same role at this site.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Button variant={open ? 'secondary' : 'model'} onClick={() => setOpen((v) => !v)}>
            <ChevronDown size={14} className={cn('transition-transform', open && 'rotate-180')} /> {open ? 'Hide review' : resolved ? 'View decision' : 'Review drafted resolution'}
          </Button>
        </div>
      </div>
      {open && (
        <div className="border-t border-line bg-canvas/60">
          <ExceptionPanel id={risk.exception_id} names={names} />
        </div>
      )}
    </Card>
  )
}
