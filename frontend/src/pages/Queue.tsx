import { AnimatePresence, motion } from 'motion/react'
import { CheckCheck, CornerDownRight, Loader2, ScanLine, Sparkles } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { useBulkApprove, useCreateDraft, usePayPeriod, useQueue } from '@/api/hooks'
import type { ExceptionSummary } from '@/api/types'
import { RouteBadge, SeverityBar, StatusPill } from '@/components/domain/badges'
import { ExceptionPanel } from '@/components/domain/ExceptionPanel'
import { Button, EmptyState, ErrorState, Kbd, Pill, Segmented, Skeleton, Tip } from '@/components/ui/primitives'
import { cn } from '@/lib/cn'
import { day, money } from '@/lib/format'

type Tab = 'all' | 'ready' | 'needs_you' | 'awaiting_employee' | 'escalated' | 'resolved'

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
  const r = 15
  const c = 2 * Math.PI * r
  const p = total ? done / total : 0
  return (
    <svg width="38" height="38" viewBox="0 0 38 38" aria-label={`${done} of ${total} resolved`}>
      <circle cx="19" cy="19" r={r} fill="none" stroke="var(--line)" strokeWidth="3.5" />
      <motion.circle
        cx="19" cy="19" r={r} fill="none" stroke="var(--accent)" strokeWidth="3.5" strokeLinecap="round"
        strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - p) }}
        transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }} transform="rotate(-90 19 19)"
      />
    </svg>
  )
}

export function Queue({ site }: { site?: 'FRE' | 'AUS' | 'BLR' }) {
  const q = useQueue(site)
  const period = usePayPeriod(site)
  const bulk = useBulkApprove()
  const create = useCreateDraft()
  const [params, setParams] = useSearchParams()
  const [tab, setTab] = useState<Tab>('all')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [preparing, setPreparing] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const items = useMemo(() => q.data?.items ?? [], [q.data])
  const selected = params.get('selected')

  // Root causes first, with their symptoms nested underneath.
  const rows = useMemo(() => {
    const visible = items.filter((i) => inTab(i, tab))
    const byId = new Map(items.map((i) => [i.id, i]))
    const out: { item: ExceptionSummary; symptom: boolean }[] = []
    const seen = new Set<string>()
    for (const i of visible) {
      if (seen.has(i.id)) continue
      if (i.root_id && byId.get(i.root_id) && inTab(byId.get(i.root_id)!, tab) && tab !== 'resolved') continue
      out.push({ item: i, symptom: false })
      seen.add(i.id)
      for (const sid of i.symptom_ids) {
        const s = byId.get(sid)
        if (s && !seen.has(sid) && (inTab(s, tab) || tab === 'all')) {
          out.push({ item: s, symptom: true })
          seen.add(sid)
        }
      }
    }
    return out
  }, [items, tab])

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
      <section className="flex w-[440px] shrink-0 flex-col border-r border-line max-xl:w-[380px]" aria-label="Exception queue">
        <div className="border-b border-line px-4 pt-4 pb-3">
          <div className="flex items-center gap-3">
            {period.data && <ProgressRing done={period.data.resolved} total={period.data.total} />}
            <div className="min-w-0 flex-1">
              <h1 className="text-title font-semibold tracking-tight text-ink">Exceptions</h1>
              <p className="text-small text-ink-3">
                {period.data ? <><span className="tabular font-medium text-ink">{period.data.resolved}</span> of {period.data.total} resolved · <span className="tabular font-medium text-ok">{period.data.ready_to_countersign}</span> ready to countersign</> : 'Loading period'}
              </p>
            </div>
            <Tip content="Run the governed pipeline for up to 12 undrafted exceptions">
              <Button size="sm" variant="model" onClick={prepareDrafts} disabled={preparing}>
                {preparing ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} Prepare drafts
              </Button>
            </Tip>
          </div>
          <div className="mt-3 overflow-x-auto scrollbar-thin">
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
        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
          {q.isLoading && (
            <div className="space-y-2 p-3">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-[74px]" />)}</div>
          )}
          {q.isError && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
          {!q.isLoading && rows.length === 0 && (
            <EmptyState title={tab === 'all' ? 'All clear for this period' : 'Nothing here'} body={tab === 'all' ? `${counts?.resolved ?? 0} exceptions resolved. See Outcomes for the measured results.` : 'Try another filter.'} />
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
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line px-4 py-2 text-caption text-ink-3">
          <span><Kbd>J</Kbd> <Kbd>K</Kbd> move</span>
          <span><Kbd>A</Kbd> approve</span>
          <span><Kbd>E</Kbd> edit</span>
          <span><Kbd>R</Kbd> reject</span>
          <span><Kbd>X</Kbd> select</span>
          <span><Kbd>Ctrl</Kbd><Kbd>K</Kbd> search</span>
        </div>
      </section>
      <section className="min-w-0 flex-1 overflow-y-auto scrollbar-thin" aria-label="Exception detail">
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
      role={symptom ? undefined : 'button'}
      tabIndex={symptom ? -1 : 0}
      onClick={onSelect}
      onKeyDown={(e) => e.key === 'Enter' && onSelect()}
      className={cn(
        'group relative flex gap-3 border-b border-line/70 px-4 py-3 outline-none transition-colors',
        symptom ? 'cursor-default bg-surface-2/40 py-2 pl-9' : 'cursor-pointer hover:bg-surface-2/70 focus-visible:bg-surface-2',
        active && 'bg-surface shadow-[inset_3px_0_0_var(--accent)] hover:bg-surface',
      )}
    >
      {symptom ? <CornerDownRight size={13} className="absolute top-2.5 left-4 text-ink-3" /> : <SeverityBar severity={item.severity} />}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={cn('truncate font-medium', symptom ? 'text-small text-ink-2' : 'text-body text-ink')}>{symptom ? item.title : item.employee_name}</span>
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
                <span className="ml-auto font-mono text-[11px] text-ink-3">{money(item.pay_impact, { sign: true })}</span>
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
          className="mt-1 size-4 shrink-0 accent-[var(--accent)]"
        />
      )}
    </div>
  )
}
