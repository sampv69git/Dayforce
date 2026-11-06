import { AnimatePresence, motion } from 'motion/react'
import { ArrowRight, CalendarX2, CheckCheck, CornerDownRight, Fingerprint, Loader2, Scale, ScanLine, Sparkles, TrendingUp, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { useBulkApprove, useCreateDraft, usePayPeriod, useQueue } from '@/api/hooks'
import type { ExceptionSummary } from '@/api/types'
import { RouteBadge, SeverityBar, StatusPill } from '@/components/domain/badges'
import { ExceptionPanel } from '@/components/domain/ExceptionPanel'
import { Avatar } from '@/components/fx'
import { Button, EmptyState, ErrorState, Kbd, Pill, Segmented, Skeleton, Tip } from '@/components/ui/primitives'
import { cn } from '@/lib/cn'
import { LENSES, lensOf, type LensKey } from '@/lib/brief'
import { day, money } from '@/lib/format'

type Tab = 'all' | 'ready' | 'needs_you' | 'awaiting_employee' | 'escalated' | 'resolved'

const OPEN = ['open', 'suggested', 'awaiting_employee', 'escalated']
const LENS_ICON: Record<LensKey, typeof Fingerprint> = { punches: Fingerprint, overtime: TrendingUp, schedule: CalendarX2, policy: Scale }

const inTab = (i: ExceptionSummary, tab: Tab) => {
  switch (tab) {
    case 'all':
      return ['open', 'suggested', 'awaiting_employee', 'escalated'].includes(i.status)
    case 'ready':
      return i.status === 'suggested' && i.route !== 'escalate'
    case 'needs_you':
      return i.status === 'open'
    case 'resolved':
      return i.status === 'resolved' || i.status === 'superseded'
    default:
      return i.status === tab
  }
}

function ProgressRing({ done, total }: { done: number; total: number }) {
  const r = 19
  const c = 2 * Math.PI * r
  const p = total ? done / total : 0
  return (
    <div className="relative grid size-12 shrink-0 place-items-center">
      <span aria-hidden className="bg-brand absolute inset-1 rounded-full opacity-20 blur-md" />
      <svg width="48" height="48" viewBox="0 0 48 48" aria-label={`${done} of ${total} resolved`} className="relative">
        <defs>
          <linearGradient id="q-ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--brand-1)" />
            <stop offset="100%" stopColor="var(--brand-2)" />
          </linearGradient>
        </defs>
        <circle cx="24" cy="24" r={r} fill="none" stroke="var(--surface-3)" strokeWidth="4.5" />
        <motion.circle
          cx="24" cy="24" r={r} fill="none" stroke="url(#q-ring)" strokeWidth="4.5" strokeLinecap="round"
          strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - p) }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }} transform="rotate(-90 24 24)"
        />
      </svg>
      <span className="tabular absolute font-mono text-[10.5px] font-semibold text-ink">{Math.round(p * 100)}%</span>
    </div>
  )
}

export function Queue({ site }: { site?: 'FRE' | 'AUS' | 'BLR' }) {
  const q = useQueue(site)
  const period = usePayPeriod(site)
  const bulk = useBulkApprove()
  const create = useCreateDraft()
  const [params, setParams] = useSearchParams()
  const [tab, setTab] = useState<Tab>('all')
  const [lens, setLens] = useState<LensKey | null>(null)
  const [briefOpen, setBriefOpen] = useState(() => sessionStorage.getItem('countersign.brief') !== 'closed')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [preparing, setPreparing] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const items = useMemo(() => q.data?.items ?? [], [q.data])
  const selected = params.get('selected')

  // Root causes first, with their symptoms nested underneath.
  const rows = useMemo(() => {
    const match = (i: ExceptionSummary) => inTab(i, tab) && (!lens || lensOf(i.family) === lens)
    const visible = items.filter(match)
    const byId = new Map(items.map((i) => [i.id, i]))
    const out: { item: ExceptionSummary; symptom: boolean }[] = []
    const seen = new Set<string>()
    for (const i of visible) {
      if (seen.has(i.id)) continue
      if (i.root_id && byId.get(i.root_id) && match(byId.get(i.root_id)!) && tab !== 'resolved') continue
      out.push({ item: i, symptom: false })
      seen.add(i.id)
      for (const sid of i.symptom_ids) {
        const s = byId.get(sid)
        if (s && !seen.has(sid) && (match(s) || (tab === 'all' && !lens))) {
          out.push({ item: s, symptom: true })
          seen.add(sid)
        }
      }
    }
    return out
  }, [items, tab, lens])

  const lensCounts = useMemo(() => {
    const c: Record<LensKey, number> = { punches: 0, overtime: 0, schedule: 0, policy: 0 }
    for (const i of items) {
      const k = lensOf(i.family)
      if (k && OPEN.includes(i.status)) c[k]++
    }
    return c
  }, [items])

  const brief = useMemo(() => {
    const open = items.filter((i) => OPEN.includes(i.status))
    const ready = open.filter((i) => i.status === 'suggested' && i.route !== 'escalate')
    const escalated = open.filter((i) => i.status === 'escalated').length
    const otRisk = open.filter((i) => i.rule_id === 'F-OT-RISK').length
    const conflicts = open.filter((i) => i.rule_id === 'F-SCHED-CONFLICT').length
    const root = [...open].filter((i) => !i.root_id && i.status !== 'escalated').sort((a, b) => b.symptom_ids.length - a.symptom_ids.length || b.risk_score - a.risk_score)[0]
    return { open: open.length, ready: ready.length, escalated, otRisk, conflicts, root }
  }, [items])

  const actionable = rows.filter((r) => !r.symptom)
  const select = useCallback((id: string | null) => {
    setParams((p) => {
      const n = new URLSearchParams(p)
      if (id) n.set('selected', id)
      else n.delete('selected')
      return n
    }, { replace: true })
  }, [setParams])

  useEffect(() => {
    if (!selected && actionable[0]) select(actionable[0].item.id)
  }, [selected, actionable, select])

  useEffect(() => {
    listRef.current?.querySelector(`[data-id="${selected}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  const toggle = (id: string) =>
    setSelectedIds((cur) => {
      const n = new Set(cur)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const eligible = items.filter((i) => i.bulk_eligible && inTab(i, tab))
  const approveSelected = async () => {
    const ids = items.filter((i) => selectedIds.has(i.id) && i.draft_id).map((i) => i.draft_id!)
    if (!ids.length) return
    const res = await bulk.mutateAsync(ids)
    setSelectedIds(new Set())
    toast.success(`Countersigned ${res.approved.length} verified low-risk item(s).${res.skipped.length ? ` ${res.skipped.length} skipped by the guard.` : ''}`)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.closest('input, textarea, select, [contenteditable], [cmdk-root]') || e.metaKey || e.ctrlKey || e.altKey) return
      const idx = actionable.findIndex((r) => r.item.id === selected)
      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault()
        const n = actionable[Math.min(idx + 1, actionable.length - 1)]
        if (n) select(n.item.id)
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault()
        const n = actionable[Math.max(idx - 1, 0)]
        if (n) select(n.item.id)
      } else if (e.key === 'x' && selected) {
        const it = items.find((i) => i.id === selected)
        if (it?.bulk_eligible) toggle(it.id)
      } else if (e.key === 'A' && e.shiftKey) {
        e.preventDefault()
        void approveSelected()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const prepareDrafts = async () => {
    setPreparing(true)
    const todo = items.filter((i) => !i.draft_id && ['open', 'suggested', 'escalated'].includes(i.status)).slice(0, 12)
    for (const i of todo) {
      try {
        await create.mutateAsync({ id: i.id })
      } catch {
        /* the panel shows errors per item */
      }
    }
    setPreparing(false)
    toast(`Prepared ${todo.length} draft(s) through the harness.`)
  }

  const nextAfter = (resolved: string[]) => {
    const idx = actionable.findIndex((r) => r.item.id === selected)
    const next = actionable.slice(idx + 1).find((r) => !resolved.includes(r.item.id)) ?? actionable.find((r) => !resolved.includes(r.item.id))
    select(next?.item.id ?? null)
  }

  const counts = q.data?.counts
  return (
    <div className="flex h-[calc(100dvh-56px)] min-h-0">
      <section className="relative flex w-[440px] shrink-0 flex-col border-r border-line bg-canvas max-xl:w-[380px]" aria-label="Exception queue">
        <div className="relative overflow-hidden border-b border-line px-4 pt-4 pb-3">
          <div aria-hidden className="bg-brand pointer-events-none absolute -top-16 -left-10 size-40 rounded-full opacity-[0.12] blur-3xl" />
          <div className="relative flex items-center gap-3" data-tour="queue-progress">
            {period.data && <ProgressRing done={period.data.resolved} total={period.data.total} />}
            <div className="min-w-0 flex-1">
              <h1 className="text-title font-semibold tracking-tight text-ink">Exceptions</h1>
              <p className="text-small text-ink-3">
                {period.data ? <><span className="tabular font-medium text-ink">{period.data.resolved}</span> of {period.data.total} resolved · <span className="tabular font-medium text-ok">{period.data.ready_to_countersign}</span> ready to countersign</> : 'Loading period'}
              </p>
            </div>
            <Tip content="Run the governed pipeline for up to 12 undrafted exceptions">
              <Button size="sm" variant="model" onClick={prepareDrafts} disabled={preparing} data-tour="prepare">
                {preparing ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} Prepare drafts
              </Button>
            </Tip>
          </div>
          <div className="relative mt-3 overflow-x-auto scrollbar-thin" data-tour="queue-tabs">
            <Segmented
              size="sm"
              value={tab}
              onChange={(t) => setTab(t)}
              options={[
                { value: 'all', label: 'Open', count: counts?.all },
                { value: 'ready', label: 'Ready', count: counts?.ready },
                { value: 'needs_you', label: 'Needs you', count: counts?.needs_you },
                { value: 'awaiting_employee', label: 'Employee', count: counts?.awaiting_employee },
                { value: 'escalated', label: 'Escalated', count: counts?.escalated },
                { value: 'resolved', label: 'Done', count: counts?.resolved },
              ]}
            />
          </div>
        </div>
        <div className="grid grid-cols-4 gap-1.5 border-b border-line px-4 py-2.5" role="group" aria-label="Problem areas from the brief" data-tour="queue-lenses">
          {LENSES.map((l) => {
            const Icon = LENS_ICON[l.key]
            const on = lens === l.key
            return (
              <Tip key={l.key} content={`${l.label}: ${l.rules}`}>
                <button
                  onClick={() => setLens(on ? null : l.key)}
                  aria-pressed={on}
                  className={cn(
                    'group relative flex flex-col items-start gap-1 overflow-hidden rounded-lg border px-2 py-1.5 text-left transition-all',
                    on ? 'border-accent bg-accent-soft shadow-glow' : 'border-line bg-surface hover:border-line-strong',
                  )}
                >
                  <span className="flex w-full items-center justify-between">
                    <span className={cn('grid size-5 place-items-center rounded-md bg-gradient-to-br text-white', l.tone)}><Icon size={11} /></span>
                    <span className="tabular font-mono text-[13px] font-semibold text-ink">{lensCounts[l.key]}</span>
                  </span>
                  <span className={cn('text-[10.5px] leading-tight font-medium', on ? 'text-accent' : 'text-ink-2')}>{l.label}</span>
                </button>
              </Tip>
            )
          })}
        </div>
        <AnimatePresence initial={false}>
          {briefOpen && brief.open > 0 && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-b border-line">
              <div className="relative bg-gradient-to-br from-accent-soft/70 via-surface to-surface px-4 py-3" data-tour="briefing">
                <button onClick={() => { setBriefOpen(false); sessionStorage.setItem('countersign.brief', 'closed') }} aria-label="Hide briefing" className="absolute top-2 right-2 grid size-6 place-items-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink"><X size={12} /></button>
                <div className="flex items-center gap-1.5 text-caption font-semibold text-accent"><Sparkles size={12} /> Cutoff briefing <span className="font-normal text-ink-3">computed from your queue</span></div>
                <p className="mt-1 pr-5 text-small leading-relaxed text-ink-2">
                  <b className="tabular font-semibold text-ink">{brief.ready}</b> verified draft{brief.ready === 1 ? '' : 's'} ready to countersign
                  {brief.escalated > 0 && <>, <b className="tabular font-semibold text-crit">{brief.escalated}</b> escalated to payroll</>}
                  {brief.otRisk > 0 && <>, <b className="tabular font-semibold text-ink">{brief.otRisk}</b> overtime risk{brief.otRisk === 1 ? '' : 's'}</>}
                  {brief.conflicts > 0 && <>, <b className="tabular font-semibold text-ink">{brief.conflicts}</b> schedule conflict{brief.conflicts === 1 ? '' : 's'} to fix before the shift</>}.
                  {brief.root && brief.root.symptom_ids.length > 0 && <> Start with {brief.root.employee_name.split(' ')[0]}: one fix clears {brief.root.symptom_ids.length + 1}.</>}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {brief.root && (
                    <Button size="sm" variant="primary" onClick={() => select(brief.root!.id)}>
                      Start with {brief.root.employee_name.split(' ')[0]} <ArrowRight size={12} />
                    </Button>
                  )}
                  {brief.ready > 0 && <Button size="sm" variant="secondary" onClick={() => { setLens(null); setTab('ready') }}>Show ready</Button>}
                  {brief.conflicts > 0 && <Button size="sm" variant="ghost" onClick={() => { setTab('all'); setLens('schedule') }}>Schedule conflicts</Button>}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {selectedIds.size > 0 && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-b border-line bg-accent-soft/60">
              <div className="flex items-center gap-2 px-4 py-2 text-small">
                <span className="font-medium text-ink">{selectedIds.size} selected</span>
                <span className="text-ink-3">verified, low risk, no punch changes</span>
                <Button size="sm" variant="primary" className="ml-auto" onClick={approveSelected} disabled={bulk.isPending}>
                  <CheckCheck size={13} /> Countersign all <Kbd className="border-white/30 bg-white/10 text-white">Shift A</Kbd>
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto scrollbar-thin" data-tour="queue-list">
          {q.isLoading && (
            <div className="space-y-2 p-3">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-[74px]" />)}</div>
          )}
          {q.isError && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
          {!q.isLoading && rows.length === 0 && (
            <EmptyState title={tab === 'all' && !lens ? 'All clear for this period' : 'Nothing here'} body={tab === 'all' && !lens ? `${counts?.resolved ?? 0} exceptions resolved. See Outcomes for the measured results.` : 'Try another filter.'} />
          )}
          <ul>
            <AnimatePresence initial={false}>
              {rows.map(({ item, symptom }) => (
                <motion.li key={item.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.18 }}>
                  <Row item={item} symptom={symptom} active={item.id === selected} checked={selectedIds.has(item.id)} onSelect={() => !symptom && select(item.id)} onToggle={() => toggle(item.id)} />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
          {eligible.length > 0 && selectedIds.size === 0 && (
            <div className="p-3">
              <Button size="sm" variant="ghost" className="w-full" onClick={() => setSelectedIds(new Set(eligible.map((i) => i.id)))}>
                <CheckCheck size={13} /> Select all {eligible.length} bulk-eligible items
              </Button>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line bg-surface/60 px-4 py-2 text-caption text-ink-3" data-tour="shortcuts">
          <span><Kbd>J</Kbd> <Kbd>K</Kbd> move</span>
          <span><Kbd>A</Kbd> approve</span>
          <span><Kbd>E</Kbd> edit</span>
          <span><Kbd>R</Kbd> reject</span>
          <span><Kbd>X</Kbd> select</span>
          <span><Kbd>Ctrl</Kbd><Kbd>K</Kbd> search</span>
        </div>
      </section>
      <section className="relative min-w-0 flex-1 overflow-y-auto scrollbar-thin" aria-label="Exception detail">
        <div aria-hidden className="bg-dots mask-fade-b pointer-events-none absolute inset-x-0 top-0 h-80" />
        {selected ? (
          <ExceptionPanel key={selected} id={selected} onDecided={nextAfter} />
        ) : (
          !q.isLoading && <EmptyState title="Select an exception" body="Choose an item on the left to see its evidence, the drafted correction, and the harness checks." />
        )}
      </section>
    </div>
  )
}

function Row({ item, symptom, active, checked, onSelect, onToggle }: { item: ExceptionSummary; symptom: boolean; active: boolean; checked: boolean; onSelect: () => void; onToggle: () => void }) {
  return (
    <div
      data-id={item.id}
      className={cn(
        'group relative flex gap-3 border-b border-line/70 px-4 py-3 transition-colors',
        symptom ? 'cursor-default bg-surface-2/40 py-2 pl-12' : 'cursor-pointer hover:bg-surface/80 has-[button:focus-visible]:bg-surface',
        active && 'bg-surface hover:bg-surface',
      )}
    >
      {active && !symptom && <span aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-r from-accent-soft to-transparent opacity-80" />}
      {active && !symptom && (
        <motion.span layoutId="queue-active" className="bg-brand absolute inset-y-2 left-0 w-[3px] rounded-r-full" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />
      )}
      {!symptom && (
        <button
          type="button"
          onClick={onSelect}
          aria-current={active ? 'true' : undefined}
          aria-label={`${item.employee_name}, ${item.title}, ${day(item.work_date)}`}
          className="absolute inset-0 z-0 outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
        />
      )}
      {symptom ? (
        <CornerDownRight size={13} className="absolute top-2.5 left-6 text-ink-3" />
      ) : (
        <div className="pointer-events-none relative h-fit">
          <Avatar name={item.employee_name} size={34} />
          <SeverityBar severity={item.severity} className="absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full ring-2 ring-surface" />
        </div>
      )}
      <div className="pointer-events-none relative min-w-0 flex-1 [&_[data-state]]:pointer-events-auto">
        <div className="flex items-center gap-2">
          <span className={cn('truncate', symptom ? 'text-small font-medium text-ink-2' : 'text-body font-semibold text-ink')}>{symptom ? item.title : item.employee_name}</span>
          <span className="shrink-0 font-mono text-[11px] text-ink-3">{day(item.work_date)}</span>
          <span className="ml-auto shrink-0">{symptom ? <span className="text-caption text-ink-3">symptom</span> : <StatusPill status={item.status} />}</span>
        </div>
        {!symptom && (
          <>
            <div className="mt-0.5 truncate text-small text-ink-2">{item.title}</div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <RouteBadge route={item.route} />
              {item.symptom_ids.length > 0 && <Pill tone="accent">Fixes {item.symptom_ids.length} related</Pill>}
              {item.has_untrusted_note && (
                <Tip content="Employee-written note attached (untrusted input)">
                  <Pill tone="warn"><ScanLine size={11} /> Note</Pill>
                </Tip>
              )}
              {item.pay_impact && Math.abs(item.pay_impact.amount) > 0.004 && (
                <span className={cn('ml-auto rounded-md px-1.5 font-mono text-[11px] font-medium', item.pay_impact.amount > 0 ? 'bg-ok-soft text-ok' : 'bg-surface-2 text-ink-2')}>{money(item.pay_impact, { sign: true })}</span>
              )}
            </div>
          </>
        )}
      </div>
      {!symptom && item.bulk_eligible && (
        <input
          type="checkbox"
          aria-label={`Select ${item.employee_name} for bulk approval`}
          checked={checked}
          onClick={(e) => e.stopPropagation()}
          onChange={onToggle}
          className="relative z-10 mt-1 size-4 shrink-0 accent-[var(--accent)]"
        />
      )}
    </div>
  )
}
