import { ArrowUpRight, GitBranch, Microscope, RefreshCw } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useCreateDraft, useException, useProvider } from '@/api/hooks'
import type { Draft } from '@/api/types'
import { Button, Card, CardHeader, ErrorState, Pill, Segmented, Skeleton, Tip } from '@/components/ui/primitives'
import { cn } from '@/lib/cn'
import { day, FAMILY_LABEL, money } from '@/lib/format'
import { EvidenceMeter, GateStrip, PayDelta, RouteBadge, SeverityLabel, StatusPill } from './badges'
import { DecisionBar, EvidenceList, PipelineProgress, UntrustedQuote } from './Decision'
import { DraftCard } from './DraftCard'
import { ShiftRibbon } from './ShiftRibbon'

export function ExceptionPanel({ id, onDecided, full = false, names: nameMap }: { id: string; onDecided?: (resolved: string[]) => void; full?: boolean; names?: Record<string, string> }) {
  const q = useException(id)
  const provider = useProvider()
  const create = useCreateDraft()
  const [mode, setMode] = useState<'before' | 'after'>('before')
  const requested = useRef<string | null>(null)
  const detail = q.data
  const draft: Draft | null | undefined = detail?.latest_draft

  useEffect(() => {
    if (!detail || draft || create.isPending) return
    if (!['open', 'suggested', 'escalated', 'awaiting_employee'].includes(detail.status)) return
    if (requested.current === detail.id) return
    requested.current = detail.id
    create.mutate({ id: detail.id })
  }, [detail, draft, create])

  useEffect(() => {
    if (draft && draft.resolution?.operations.some((o) => o.op === 'add_punch' || o.op === 'void_punch')) {
      const t = setTimeout(() => setMode('after'), 900)
      return () => clearTimeout(t)
    }
  }, [draft?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const anchors = useMemo(() => draft?.resolution?.operations.flatMap((o) => o.evidence_ids) ?? [], [draft])
  const names = useMemo(() => nameMap ?? ({} as Record<string, string>), [nameMap])

  if (q.isLoading) return <PanelSkeleton />
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />
  if (!detail) return null

  const hasTimeChange = !!draft?.resolution?.operations.some((o) => o.op === 'add_punch' || o.op === 'void_punch')
  return (
    <div className={cn('space-y-4', full ? 'p-6' : 'p-5')}>
      {/* Header */}
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <SeverityLabel severity={detail.severity} />
          <span className="font-mono text-[11px] text-ink-3">{detail.id}</span>
          <Tip content="Detected by the deterministic rules engine">
            <span className="inline-flex items-center gap-1 rounded-md border border-line bg-surface-2 px-1.5 py-px font-mono text-[11px] text-rule">
              <span className="size-1.5 bg-rule" /> {detail.rule_id}
            </span>
          </Tip>
          <Pill tone="outline">{FAMILY_LABEL[detail.family]}</Pill>
          <StatusPill status={detail.status} />
          <div className="ml-auto flex items-center gap-1.5">
            {draft && (
              <Button asChild size="sm" variant="ghost">
                <Link to={`/inspector/${draft.id}`}>
                  <Microscope size={13} /> Inspect trace
                </Link>
              </Button>
            )}
            {!full && (
              <Button asChild size="sm" variant="ghost">
                <Link to={`/exceptions/${detail.id}`} aria-label="Open full page">
                  <ArrowUpRight size={13} />
                </Link>
              </Button>
            )}
          </div>
        </div>
        <h2 className="mt-2 text-title font-semibold tracking-tight text-ink">{detail.title}</h2>
        <p className="mt-0.5 text-body text-ink-2">{detail.summary}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-ink-3">
          <Link to={`/timecards/${detail.employee.id}`} className="font-medium text-ink hover:underline">{detail.employee.name}</Link>
          <span>{detail.employee.title}, {detail.employee.site_name}</span>
          <span>{detail.employee.exempt ? 'Exempt' : 'Non-exempt'}</span>
          <span className="font-mono">{money(detail.employee.hourly_rate)}/h</span>
          <span>{day(detail.work_date)}</span>
        </div>
      </header>

      {/* Facts: timeline */}
      <Card>
        <CardHeader
          eyebrow="Recorded facts"
          title="Timeline"
          actions={
            hasTimeChange ? (
              <Segmented
                size="sm"
                value={mode}
                onChange={setMode}
                options={[
                  { value: 'before', label: 'As recorded' },
                  { value: 'after', label: 'With correction' },
                ]}
              />
            ) : undefined
          }
        />
        <div className="px-4 pb-4">
          <ShiftRibbon days={detail.timeline.days} proposed={draft?.resolution?.operations ?? []} mode={hasTimeChange ? mode : 'before'} anchors={anchors} />
        </div>
      </Card>

      <div className="grid gap-4 min-[1680px]:grid-cols-2">
        <Card>
          <CardHeader eyebrow="Independent evidence" title="Evidence" />
          <div className="px-4 pb-3">
            <EvidenceList items={detail.evidence} anchors={anchors} />
            {detail.untrusted_note && (
              <div className="mt-3">
                <UntrustedQuote text={detail.untrusted_note.text} flags={detail.untrusted_note.flags} />
              </div>
            )}
          </div>
        </Card>
        <Card>
          <CardHeader eyebrow="Computed by code" title="Pay impact this week" />
          <div className="px-4 pb-4">
            {draft ? <PayDelta before={draft.pay_before} after={draft.pay_after} /> : <Skeleton className="h-36" />}
          </div>
        </Card>
      </div>

      {/* Model draft */}
      {!draft && (create.isPending || !create.isError) && <PipelineProgress provider={provider.data?.provider} />}
      {create.isError && <ErrorState error={create.error} onRetry={() => create.mutate({ id: detail.id })} />}
      {draft && (
        <>
          <DraftCard draft={draft} evidence={detail.evidence} names={names} />
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-3.5">
              <div className="flex items-center gap-2">
                <span className="eyebrow">Harness</span>
                <RouteBadge route={draft.route} repaired={draft.repaired} />
              </div>
              <div className="flex items-center gap-3">
                <span className="text-caption text-ink-3">Evidence strength</span>
                <EvidenceMeter strength={draft.evidence_strength} />
              </div>
            </div>
            <div className="px-4 pt-2.5 pb-3.5">
              <GateStrip key={draft.id} gates={draft.validation.gates} />
              {draft.clears.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-1.5 rounded-md border border-accent/20 bg-accent-soft/50 px-3 py-2 text-small">
                  <GitBranch size={14} className="text-accent" />
                  <span className="font-medium text-ink">This correction also resolves</span>
                  {draft.clears.map((c) => (
                    <Pill key={c.id} tone="accent">{c.title} · {day(c.work_date)}</Pill>
                  ))}
                </div>
              )}
              {draft.introduces.length > 0 && (
                <div className="mt-2 rounded-md border border-crit/25 bg-crit-soft px-3 py-2 text-small text-crit">Would introduce: {draft.introduces.join(', ')}</div>
              )}
            </div>
          </Card>
          <DecisionBar detail={detail} draft={draft} onDecided={onDecided} />
          {!draft.decision && (
            <div className="flex justify-end">
              <Button size="sm" variant="ghost" onClick={() => create.mutate({ id: detail.id, force: true })} disabled={create.isPending}>
                <RefreshCw size={12} className={create.isPending ? 'animate-spin' : ''} /> Re-run pipeline
              </Button>
            </div>
          )}
        </>
      )}
      {detail.attestations.length > 0 && (
        <p className="text-caption text-ink-3">
          Employee confirmation received: {detail.attestations.map((a) => String(a.confirmed_at).slice(11)).join(', ')}
        </p>
      )}
    </div>
  )
}

function PanelSkeleton() {
  return (
    <div className="space-y-4 p-5">
      <Skeleton className="h-4 w-48" />
      <Skeleton className="h-7 w-3/4" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-48 w-full" />
      <div className="grid grid-cols-2 gap-4">
        <Skeleton className="h-36" />
        <Skeleton className="h-36" />
      </div>
      <Skeleton className="h-40 w-full" />
    </div>
  )
}
