import { Link, useParams } from 'react-router'
import { useTimecard } from '@/api/hooks'
import { StatusPill } from '@/components/domain/badges'
import { ShiftRibbon } from '@/components/domain/ShiftRibbon'
import { Card, CardHeader, ErrorState, Skeleton } from '@/components/ui/primitives'
import { day, hours, money } from '@/lib/format'

export default function TimecardPage() {
  const { employeeId } = useParams()
  const q = useTimecard(employeeId)
  if (q.isLoading) return <div className="p-6"><Skeleton className="h-96" /></div>
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />
  const t = q.data
  if (!t) return null
  return (
    <div className="mx-auto max-w-[1180px] space-y-5 p-6">
      <div>
        <div className="eyebrow">Weekly timecard · week of {day(t.week_start)}</div>
        <h1 className="text-display font-semibold tracking-tight text-ink">{t.employee.name}</h1>
        <p className="mt-1 text-body text-ink-2">{t.employee.title}, {t.employee.site_name} · {t.employee.exempt ? 'Exempt' : 'Non-exempt'} · {money(t.employee.hourly_rate)}/h</p>
      </div>
      <Card>
        <CardHeader eyebrow="Recorded and corrected punches" title="Week" />
        <div className="px-4 pb-4"><ShiftRibbon days={t.timeline.days} /></div>
      </Card>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-4">
          <div className="eyebrow mb-2">Pay this week (computed)</div>
          <dl className="space-y-1.5 text-small">
            {([['Regular', t.pay.regular_hours], ['Overtime', t.pay.overtime_hours], ['Double time', t.pay.double_time_hours], ['Premiums', t.pay.premium_hours]] as const).map(([k, v]) => (
              <div key={k} className="flex justify-between"><dt className="text-ink-2">{k}</dt><dd className="tabular font-mono text-ink">{hours(v)}</dd></div>
            ))}
            <div className="flex justify-between border-t border-line pt-1.5"><dt className="font-medium text-ink">Cost</dt><dd className="tabular font-mono font-semibold text-ink">{money(t.pay.cost)}</dd></div>
            {t.pay.unpaid_shifts > 0 && <p className="text-caption text-crit">{t.pay.unpaid_shifts} shift(s) unpaid until a missing punch is resolved</p>}
          </dl>
        </Card>
        <Card className="p-4 lg:col-span-2">
          <div className="eyebrow mb-2">Exceptions</div>
          <ul className="divide-y divide-line/70">
            {t.exceptions.map((e) => (
              <li key={e.id} className="flex items-center gap-3 py-2 text-small">
                <span className="font-mono text-[11px] text-ink-3">{day(e.work_date)}</span>
                <Link to={`/queue?selected=${e.id}`} className="flex-1 text-ink hover:underline">{e.title}</Link>
                <StatusPill status={e.status} />
              </li>
            ))}
            {t.exceptions.length === 0 && <li className="py-2 text-small text-ink-3">No exceptions this week.</li>}
          </ul>
        </Card>
      </div>
      <Card>
        <CardHeader eyebrow="Append-only" title="Revision history" />
        <div className="px-4 pb-4">
          {t.revisions.length === 0 ? <p className="text-small text-ink-3">No corrections yet. Original punches are never changed; corrections are added as revisions.</p> : (
            <ul className="divide-y divide-line/70">
              {t.revisions.map((r) => (
                <li key={r.id} className="py-2 text-small">
                  <div className="flex items-center gap-2"><span className="font-mono text-[11px] text-ink-3">{r.id}</span><span className="font-medium text-ink">{r.actor_name}</span><span className="text-ink-3">{r.reason_code}</span><span className="ml-auto font-mono text-[11px] text-ink-3">{r.created_at.slice(0, 16).replace('T', ' ')} UTC</span></div>
                  <div className="mt-0.5 text-ink-2">{r.operations.map((o) => `${String(o.op).replace(/_/g, ' ')}${o.at ? ` ${String(o.punch_type)} ${String(o.at).slice(11)}` : ''}`).join('; ')}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  )
}
