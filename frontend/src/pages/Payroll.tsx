import { AlertOctagon, Building2, RotateCcw, ShieldAlert, ShieldCheck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { usePayPeriod, useQueue, useResetDemo } from '@/api/hooks'
import type { ExceptionSummary } from '@/api/types'
import { SeverityBar } from '@/components/domain/badges'
import { ExceptionPanel } from '@/components/domain/ExceptionPanel'
import { Avatar, PageHeader, Reveal, Ring, Spotlight } from '@/components/fx'
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
      <PageHeader
        icon={<ShieldAlert size={22} />}
        tone="crit"
        eyebrow="Payroll administrator"
        title="Cutoff readiness"
        description={`Payroll cutoff Mon 9 Nov, 12:00 PT. ${period.data ? `${period.data.resolved} of ${period.data.total} exceptions resolved across all sites.` : ''}`}
        actions={
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
        }
      />
      <div className="grid gap-4 md:grid-cols-3" data-tour="payroll-sites">
        {q.isLoading && [0, 1, 2].map((i) => <Skeleton key={i} className="h-44 rounded-card" />)}
        {!q.isLoading && bySite.map((s, i) => {
          const total = s.open + s.escalated + s.resolved
          const ready = s.open + s.escalated === 0
          return (
            <Reveal key={s.code} delay={i * 0.06}>
              <Spotlight className="lift h-full p-5">
                <div className="relative z-10 flex items-start gap-4">
                  <Ring value={total ? s.resolved / total : 1} size={68} stroke={6} tone={ready ? 'ok' : s.escalated ? 'crit' : 'brand'} label={`${s.name}: ${s.resolved} of ${total} resolved`}>
                    <span className="tabular font-mono text-[13px] font-bold text-ink">{total ? Math.round((s.resolved / total) * 100) : 100}%</span>
                  </Ring>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-heading font-semibold text-ink"><Building2 size={15} className="text-ink-3" /> {s.name}</div>
                    <div className="text-caption text-ink-3">{s.juris}</div>
                    <div className="mt-2">{ready ? <Pill tone="ok"><ShieldCheck size={11} /> Ready for payroll</Pill> : <Pill tone="outline">{s.open + s.escalated} to clear</Pill>}</div>
                  </div>
                </div>
                <div className="relative z-10 mt-4 grid grid-cols-3 gap-2 border-t border-line pt-3 text-center">
                  <div><div className="tabular font-mono text-[18px] font-semibold text-ink">{s.open}</div><div className="text-caption text-ink-3">open</div></div>
                  <div><div className={cn('tabular font-mono text-[18px] font-semibold', s.escalated ? 'text-crit' : 'text-ink-3')}>{s.escalated}</div><div className="text-caption text-ink-3">escalated</div></div>
                  <div><div className="tabular font-mono text-[18px] font-semibold text-ok">{s.resolved}</div><div className="text-caption text-ink-3">resolved</div></div>
                </div>
                <div className="relative z-10 mt-2 text-center text-caption text-ink-3">Unresolved pay impact <span className="font-mono text-ink-2">{Object.entries(s.exposure).map(([c, a]) => money({ amount: a, currency: c as 'USD' | 'INR' })).join(' + ') || '–'}</span></div>
              </Spotlight>
            </Reveal>
          )
        })}
      </div>
      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        <Card className="overflow-hidden self-start" data-tour="payroll-escalations">
          <div aria-hidden className="h-1 bg-gradient-to-r from-crit to-warn" />
          <CardHeader eyebrow="Needs payroll" title={`Escalations (${escalations.length})`} />
          {escalations.length === 0 && <EmptyState icon={<ShieldCheck size={18} />} title="No escalations" body="When evidence conflicts or no safe correction exists, the harness escalates here instead of guessing." />}
          <ul>
            {escalations.map((e: ExceptionSummary) => (
              <li key={e.id}>
                <button onClick={() => setSelected(e.id)} className={cn('flex w-full gap-3 border-t border-line/70 px-4 py-3 text-left transition-colors hover:bg-surface-2/60', selected === e.id && 'bg-gradient-to-r from-crit-soft to-transparent shadow-[inset_3px_0_0_var(--crit)]')}>
                  <div className="relative h-fit"><Avatar name={e.employee_name} size={32} /><SeverityBar severity={e.severity} className="absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full ring-2 ring-surface" /></div>
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
