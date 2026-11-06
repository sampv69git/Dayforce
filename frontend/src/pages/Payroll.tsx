import { AlertOctagon, RotateCcw, ShieldCheck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { usePayPeriod, useQueue, useResetDemo } from '@/api/hooks'
import type { ExceptionSummary } from '@/api/types'
import { SeverityBar } from '@/components/domain/badges'
import { ExceptionPanel } from '@/components/domain/ExceptionPanel'
import { Button, Card, CardHeader, EmptyState, ErrorState, Pill, Skeleton } from '@/components/ui/primitives'
import { cn } from '@/lib/cn'
import { day, money } from '@/lib/format'

const SITES = [
  { code: 'FRE', name: 'Fremont DC', juris: 'California addendum' },
  { code: 'AUS', name: 'Austin DC', juris: 'Handbook only' },
  { code: 'BLR', name: 'Bengaluru Hub', juris: 'Bengaluru addendum' },
] as const

export default function Payroll() {
  const q = useQueue()
  const period = usePayPeriod()
  const reset = useResetDemo()
  const [selected, setSelected] = useState<string | null>(null)
  const items = useMemo(() => q.data?.items ?? [], [q.data])
  const escalations = items.filter((i) => i.status === 'escalated')
  const bySite = useMemo(
    () =>
      SITES.map((s) => {
        const rows = items.filter((i) => i.site === s.code)
        const open = rows.filter((i) => ['open', 'suggested', 'awaiting_employee'].includes(i.status))
        const exposure = open.reduce<Record<string, number>>((acc, i) => {
          if (i.pay_impact) acc[i.pay_impact.currency] = (acc[i.pay_impact.currency] ?? 0) + Math.abs(i.pay_impact.amount)
          return acc
        }, {})
        return {
          ...s,
          open: open.length,
          escalated: rows.filter((i) => i.status === 'escalated').length,
          resolved: rows.filter((i) => i.status === 'resolved' || i.status === 'superseded').length,
          exposure,
        }
      }),
    [items],
  )
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />
  return (
    <div className="mx-auto max-w-[1280px] space-y-5 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow">Payroll administrator</div>
          <h1 className="text-display font-semibold tracking-tight text-ink">Cutoff readiness</h1>
          <p className="mt-1 text-body text-ink-2">Payroll cutoff Mon 9 Nov, 12:00 PT. {period.data ? `${period.data.resolved} of ${period.data.total} exceptions resolved across all sites.` : ''}</p>
        </div>
        <Button
          variant="ghost"
          onClick={async () => {
            if (!window.confirm('Reset all demo data to the seeded synthetic state?')) return
            await reset.mutateAsync()
            toast('Demo data reset to the seeded synthetic state.')
          }}
          disabled={reset.isPending}
        >
          <RotateCcw size={13} className={reset.isPending ? 'animate-spin' : ''} /> Reset demo data
        </Button>
      </div>
      <Card className="overflow-hidden">
        {q.isLoading ? <div className="p-4"><Skeleton className="h-40" /></div> : (
          <table className="w-full text-small">
            <thead>
              <tr className="border-b border-line bg-surface-2/60 text-caption text-ink-3">
                <th className="px-4 py-2 text-left font-medium">Site</th>
                <th className="px-3 py-2 text-right font-medium">Open</th>
                <th className="px-3 py-2 text-right font-medium">Escalated</th>
                <th className="px-3 py-2 text-right font-medium">Resolved</th>
                <th className="px-3 py-2 text-right font-medium">Unresolved pay impact</th>
                <th className="px-4 py-2 text-left font-medium">Ready</th>
              </tr>
            </thead>
            <tbody>
              {bySite.map((s) => (
                <tr key={s.code} className="border-b border-line/70 last:border-0">
                  <td className="px-4 py-3"><div className="font-medium text-ink">{s.name}</div><div className="text-caption text-ink-3">{s.juris}</div></td>
                  <td className="tabular px-3 py-3 text-right font-mono text-ink">{s.open}</td>
                  <td className={cn('tabular px-3 py-3 text-right font-mono', s.escalated ? 'font-semibold text-crit' : 'text-ink-3')}>{s.escalated}</td>
                  <td className="tabular px-3 py-3 text-right font-mono text-ink-2">{s.resolved}</td>
                  <td className="tabular px-3 py-3 text-right font-mono text-ink-2">{Object.entries(s.exposure).map(([c, a]) => money({ amount: a, currency: c as 'USD' | 'INR' })).join(' + ') || '–'}</td>
                  <td className="px-4 py-3">{s.open + s.escalated === 0 ? <Pill tone="ok"><ShieldCheck size={11} /> Ready</Pill> : <Pill tone="outline">{s.open + s.escalated} to clear</Pill>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        <Card className="overflow-hidden self-start">
          <CardHeader eyebrow="Needs payroll" title={`Escalations (${escalations.length})`} />
          {escalations.length === 0 && <EmptyState icon={<ShieldCheck size={18} />} title="No escalations" body="When evidence conflicts or no safe correction exists, the harness escalates here instead of guessing." />}
          <ul>
            {escalations.map((e: ExceptionSummary) => (
              <li key={e.id}>
                <button onClick={() => setSelected(e.id)} className={cn('flex w-full gap-3 border-t border-line/70 px-4 py-3 text-left hover:bg-surface-2/60', selected === e.id && 'bg-surface shadow-[inset_3px_0_0_var(--accent)]')}>
                  <SeverityBar severity={e.severity} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-body font-medium text-ink"><AlertOctagon size={13} className="text-crit" />{e.employee_name}<span className="font-mono text-[11px] text-ink-3">{e.site} · {day(e.work_date)}</span></div>
                    <div className="mt-0.5 truncate text-small text-ink-2">{e.title}</div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="min-w-0">
          {selected ? <ExceptionPanel key={selected} id={selected} onDecided={() => setSelected(null)} /> : <EmptyState title="Select an escalation" body="Each escalation shows why the harness refused to resolve it automatically." />}
        </Card>
      </div>
    </div>
  )
}
