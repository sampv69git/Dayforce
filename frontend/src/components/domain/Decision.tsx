import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { AlertTriangle, Check, Loader2, MailQuestion, Pencil, ScanLine, Sparkles, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { Draft, EvidenceItem, ExceptionDetail, Operation, ReasonCode, ValidationReport } from '@/api/types'
import { useDecide, useRequestAttestation, useValidateEdit } from '@/api/hooks'
import { Button, Kbd, Pill } from '@/components/ui/primitives'
import { cn } from '@/lib/cn'
import { day, EVIDENCE_LABEL, hm, initials, REASONS } from '@/lib/format'
import { useSession } from '@/lib/session'
import { GateStrip } from './badges'

/* ------------------------------------------------------------ Pipeline progress */
const STAGES = ['Context', 'Retrieve', 'Sanitise', 'Generate', 'Validate', 'Route']

export function PipelineProgress({ provider }: { provider?: string }) {
  const [step, setStep] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STAGES.length - 1)), provider === 'rule_based' ? 150 : 650)
    return () => clearInterval(t)
  }, [provider])
  return (
    <div className="relative overflow-hidden rounded-card border border-model-line bg-gradient-to-br from-model-soft/80 to-surface p-5 shadow-card" aria-live="polite">
      <span aria-hidden className="animate-scan pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-transparent via-model/10 to-transparent" />
      <div className="relative flex items-center gap-2 text-small font-semibold text-model">
        <span className="relative grid size-6 place-items-center">
          <span className="animate-pulse-ring absolute inset-0 rounded-full bg-model/30" />
          <Sparkles size={14} className="relative" />
        </span>
        Running the governed pipeline
      </div>
      <div className="relative mt-3 h-1 overflow-hidden rounded-full bg-surface-3">
        <motion.div className="bg-brand h-full rounded-full" animate={{ width: `${((step + 1) / STAGES.length) * 100}%` }} transition={{ duration: 0.4 }} />
      </div>
      <ol className="relative mt-3 flex flex-wrap items-center gap-1.5">
        {STAGES.map((s, i) => (
          <li key={s} className="flex items-center gap-1.5">
            <span
              className={cn(
                'rounded-md border px-2 py-0.5 text-caption font-medium transition-colors',
                i < step && 'border-ok/25 bg-ok-soft text-ok',
                i === step && 'border-model bg-surface text-model',
                i > step && 'border-line bg-surface text-ink-3',
              )}
            >
              {s}
            </span>
            {i < STAGES.length - 1 && <span className="h-px w-3 bg-line-strong" />}
          </li>
        ))}
      </ol>
      <p className="relative mt-2 text-caption text-ink-3">Stage names show progress while the request runs; the trace records the real timings.</p>
    </div>
  )
}

/* ------------------------------------------------------------ Evidence and notes */
export function EvidenceList({ items, anchors }: { items: EvidenceItem[]; anchors: string[] }) {
  if (!items.length) return <p className="text-small text-ink-3">No time evidence applies to this exception. Facts come from recorded punches.</p>
  return (
    <ul className="divide-y divide-line/70">
      {items.map((e) => (
        <li
          key={e.id}
          className={cn(
            'grid grid-cols-[10px_minmax(0,1.1fr)_auto_minmax(0,1fr)_auto] items-center gap-x-2.5 py-1.5 text-small',
            anchors.includes(e.id) && 'font-medium',
          )}
        >
          <span
            className={cn(
              'size-2 rounded-full',
              e.strength === 'strong' ? 'bg-ok' : e.strength === 'medium' ? 'bg-warn' : 'bg-line-strong',
            )}
          />
          <span className="truncate text-ink">{EVIDENCE_LABEL[e.kind] ?? e.kind}</span>
          <span className="font-mono text-[12px] whitespace-nowrap text-ink-2">
            {day(e.at).split(' ')[0]} {hm(e.at)}
          </span>
          <span className="truncate text-caption text-ink-3">{e.source}</span>
          <span className="flex items-center justify-end gap-1.5">
            {anchors.includes(e.id) && <Pill tone="model">anchor</Pill>}
            <span className="w-12 text-right text-caption capitalize text-ink-3">{e.strength}</span>
            {e.simulated ? <span className="bg-hatch rounded px-1 text-[10px] text-ink-3">sim</span> : <span className="w-[22px]" />}
          </span>
        </li>
      ))}
    </ul>
  )
}

export function UntrustedQuote({ text, flags }: { text: string; flags: string[] }) {
  return (
    <figure className="rounded-md border border-warn-line bg-warn-soft/60 p-3">
      <figcaption className="mb-1.5 flex flex-wrap items-center gap-1.5 text-caption font-semibold text-warn">
        <AlertTriangle size={12} /> Employee-written, untrusted
        {flags.length > 0 && (
          <Pill tone="crit">
            <ScanLine size={11} /> Injection attempt detected
          </Pill>
        )}
      </figcaption>
      <blockquote className="text-small leading-relaxed text-ink-2">{text}</blockquote>
      {flags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {flags.map((f) => (
            <span key={f} className="rounded bg-surface px-1.5 font-mono text-[10.5px] text-ink-3">{f}</span>
          ))}
        </div>
      )}
      <p className="mt-2 text-caption text-ink-3">Sent to the model as data inside a delimited block, never as instructions.</p>
    </figure>
  )
}

/* ------------------------------------------------------------ Countersign stamp */
const BURST = ['var(--brand-1)', 'var(--brand-2)', 'var(--ok)', 'var(--brand-3)', '#d6457a', 'var(--warn)']

function Burst() {
  const reduce = useReducedMotion()
  if (reduce) return null
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center">
      {Array.from({ length: 18 }).map((_, i) => {
        const a = (i / 18) * Math.PI * 2
        const d = 54 + (i % 3) * 16
        return (
          <motion.span
            key={i}
            className="absolute size-1.5 rounded-full"
            style={{ background: BURST[i % BURST.length] }}
            initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
            animate={{ x: Math.cos(a) * d, y: Math.sin(a) * d, opacity: 0, scale: 0.4 }}
            transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: 0.12 }}
          />
        )
      })}
    </span>
  )
}

export function CountersignStamp({ name, at, burst = false }: { name: string; at: string; burst?: boolean }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      initial={reduce ? false : { scale: 1.25, opacity: 0, rotate: -14 }}
      animate={{ scale: 1, opacity: 1, rotate: -6 }}
      transition={{ type: 'spring', stiffness: 260, damping: 18 }}
      className="relative grid size-[88px] shrink-0 place-items-center rounded-full border-2 border-accent bg-surface text-accent shadow-glow"
      aria-label={`Countersigned by ${name}`}
    >
      {burst && <Burst />}
      <span className="absolute inset-1.5 rounded-full border border-dashed border-accent/60" />
      <span className="flex flex-col items-center leading-none">
        <span className="text-[9px] font-semibold tracking-[0.18em] uppercase">Countersigned</span>
        <span className="my-1 font-mono text-[20px] font-bold">{initials(name)}</span>
        <span className="font-mono text-[9px]">{at}</span>
      </span>
    </motion.div>
  )
}

/* ------------------------------------------------------------ Decision bar */
type Mode = 'idle' | 'edit' | 'reject'

export function DecisionBar({
  detail,
  draft,
  onDecided,
}: {
  detail: ExceptionDetail
  draft: Draft
  onDecided?: (resolved: string[]) => void
}) {
  const { user } = useSession()
  const decide = useDecide()
  const ask = useRequestAttestation()
  const [mode, setMode] = useState<Mode>('idle')
  const [confirming, setConfirming] = useState(false)
  const [stamp, setStamp] = useState<{ name: string; at: string } | null>(null)
  const canApprove = draft.route !== 'escalate' && draft.validation.passed && !draft.decision
  const decided = draft.decision
  const askable = ['R-PUNCH-MISSING-OUT', 'R-PUNCH-MISSING-IN', 'R-BREAK-UNPAIRED', 'R-PUNCH-SPAN'].includes(detail.rule_id)

  const approve = async () => {
    if (!canApprove) return
    if (detail.severity === 'critical' && !confirming) {
      setConfirming(true)
      return
    }
    setConfirming(false)
    try {
      const res = await decide.mutateAsync({ draftId: draft.id, body: { action: 'approve', reason_code: 'AGREE' } })
      const now = new Date()
      setStamp({ name: user?.display_name ?? 'You', at: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}` })
      const extra = res.resolved_exception_ids.length - 1
      toast.success(`Countersigned. ${extra > 0 ? `${extra} related exception${extra > 1 ? 's' : ''} resolved too.` : 'Timecard revision recorded.'}`)
      setTimeout(() => onDecided?.(res.resolved_exception_ids), 900)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const t = ev.target as HTMLElement
      if (t.closest('input, textarea, select, [contenteditable]') || ev.metaKey || ev.ctrlKey || ev.altKey) return
      if (mode !== 'idle' || decided) return
      if (ev.key === 'a' || (ev.key === 'Enter' && confirming)) {
        ev.preventDefault()
        void approve()
      } else if (ev.key === 'e' && draft.route !== 'escalate' || (ev.key === 'e' && user?.role === 'payroll_admin')) {
        ev.preventDefault()
        setMode('edit')
      } else if (ev.key === 'r') {
        ev.preventDefault()
        setMode('reject')
      } else if (ev.key === 'Escape') setConfirming(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (stamp || decided) {
    const d = decided
    return (
      <div data-tour="detail-decision" className="relative flex items-center gap-4 overflow-hidden rounded-card border border-accent/25 bg-gradient-to-r from-accent-soft to-surface p-4 shadow-card">
        <div aria-hidden className="bg-dots pointer-events-none absolute inset-0 opacity-60" />
        <CountersignStamp burst={!!stamp} name={stamp?.name ?? d?.actor_name ?? ''} at={stamp?.at ?? (d ? new Date(d.decided_at).toISOString().slice(11, 16) : '')} />
        <div className="relative min-w-0 text-small">
          <div className="text-[15px] font-semibold text-ink">
            {d ? `${d.action === 'approve' ? 'Approved' : d.action === 'edit' ? 'Edited and approved' : 'Rejected'} by ${d.actor_name}` : 'Countersigned'}
          </div>
          <div className="text-ink-2">{d?.note ?? 'Recorded as an append-only revision in the audit chain.'}</div>
          {d && <div className="mt-1 font-mono text-[11px] text-ink-3">{d.id} · {d.reason_code}{d.bulk ? ' · bulk' : ''}</div>}
        </div>
      </div>
    )
  }

  return (
    <div data-tour="detail-decision" className="glass sticky bottom-3 z-20 rounded-card border border-line p-3 shadow-lift">
      <AnimatePresence mode="wait" initial={false}>
        {mode === 'idle' && (
          <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-wrap items-center gap-2">
            {confirming ? (
              <div className="flex flex-1 flex-wrap items-center gap-2 text-small">
                <span className="text-ink">Approve {draft.resolution?.operations.length} change(s) for {detail.employee_name}?</span>
                <Button variant="primary" size="sm" onClick={approve} disabled={decide.isPending}>
                  Confirm <Kbd className="border-white/30 bg-white/10 text-white">Enter</Kbd>
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>Cancel</Button>
              </div>
            ) : (
              <>
                <Button variant="primary" onClick={approve} disabled={!canApprove || decide.isPending} title={!canApprove ? 'Only verified drafts can be approved' : undefined}>
                  {decide.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Approve
                  <Kbd className="ml-1 border-white/30 bg-white/10 text-white/90">A</Kbd>
                </Button>
                <Button onClick={() => setMode('edit')} disabled={draft.route === 'escalate' && user?.role !== 'payroll_admin'}>
                  <Pencil size={13} /> Edit <Kbd className="ml-1">E</Kbd>
                </Button>
                <Button variant="danger" onClick={() => setMode('reject')}>
                  <X size={13} /> Reject <Kbd className="ml-1">R</Kbd>
                </Button>
                {askable && detail.status !== 'awaiting_employee' && (
                  <Button
                    variant="ghost"
                    className="ml-auto"
                    disabled={ask.isPending}
                    onClick={async () => {
                      await ask.mutateAsync(detail.id)
                      toast(`Confirmation requested from ${detail.employee_name} (simulated notification)`)
                    }}
                  >
                    <MailQuestion size={14} /> Ask {detail.employee_name.split(' ')[0]} to confirm
                  </Button>
                )}
                {draft.route === 'escalate' && (
                  <span className="text-small text-ink-3">{user?.role === 'payroll_admin' ? 'Choose a supported correction with Edit, or reject.' : 'Escalated to payroll. A payroll administrator resolves it.'}</span>
                )}
              </>
            )}
          </motion.div>
        )}
        {mode === 'edit' && <EditOps key="edit" detail={detail} draft={draft} onCancel={() => setMode('idle')} onDone={(ids) => onDecided?.(ids)} />}
        {mode === 'reject' && <RejectForm key="reject" draft={draft} onCancel={() => setMode('idle')} onDone={(ids) => onDecided?.(ids)} />}
      </AnimatePresence>
    </div>
  )
}

function ReasonSelect({ kind, value, onChange }: { kind: 'edit' | 'reject'; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1 text-caption font-medium text-ink-2">
      Reason (required)
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8.5 rounded-control border border-line-strong bg-surface px-2 text-body text-ink outline-none focus:border-accent"
      >
        <option value="">Choose a reason</option>
        {REASONS.filter((r) => r.for.includes(kind)).map((r) => (
          <option key={r.code} value={r.code}>{r.label}</option>
        ))}
      </select>
    </label>
  )
}

function RejectForm({ draft, onCancel, onDone }: { draft: Draft; onCancel: () => void; onDone: (ids: string[]) => void }) {
  const decide = useDecide()
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  return (
    <motion.form
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="grid gap-3 sm:grid-cols-[220px_1fr_auto]"
      onSubmit={async (e) => {
        e.preventDefault()
        try {
          await decide.mutateAsync({ draftId: draft.id, body: { action: 'reject', reason_code: reason as ReasonCode, note: note || null } })
          toast('Draft rejected. The exception returns to your queue.')
          onDone([])
        } catch (err) {
          toast.error((err as Error).message)
        }
      }}
    >
      <ReasonSelect kind="reject" value={reason} onChange={setReason} />
      <label className="flex flex-col gap-1 text-caption font-medium text-ink-2">
        Note (optional)
        <input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} className="h-8.5 rounded-control border border-line-strong bg-surface px-2 text-body text-ink outline-none focus:border-accent" />
      </label>
      <div className="flex items-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit" variant="danger" disabled={!reason || decide.isPending}>Reject draft</Button>
      </div>
    </motion.form>
  )
}

function EditOps({ detail, draft, onCancel, onDone }: { detail: ExceptionDetail; draft: Draft; onCancel: () => void; onDone: (ids: string[]) => void }) {
  const decide = useDecide()
  const validate = useValidateEdit()
  const base = draft.resolution?.operations ?? []
  const initial: Operation[] = base.some((o) => o.op === 'escalate')
    ? detail.windows.map((w) => ({ op: 'add_punch', punch_type: w.punch_type as Operation['punch_type'], at: null, punch_id: null, premium_kind: null, hours: null, shift_id: null, to_employee_id: null, evidence_ids: [] }))
    : base
  const [ops, setOps] = useState<Operation[]>(initial)
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [report, setReport] = useState<ValidationReport | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const key = JSON.stringify(ops)

  useEffect(() => {
    window.clearTimeout(timer.current)
    if (ops.some((o) => o.op === 'add_punch' && !o.at)) {
      setReport(null)
      return
    }
    timer.current = window.setTimeout(async () => {
      try {
        setReport(await validate.mutateAsync({ draftId: draft.id, operations: ops }))
      } catch {
        setReport(null)
      }
    }, 300)
    return () => window.clearTimeout(timer.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const relevantGates = useMemo(() => report?.gates.filter((g) => g.status !== 'skip') ?? [], [report])
  const update = (i: number, patch: Partial<Operation>) => setOps((cur) => cur.map((o, j) => (j === i ? { ...o, ...patch } : o)))

  return (
    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-3">
      <div className="eyebrow">Edit the correction. Every change is re-checked live by gates G2 and G6 to G9.</div>
      {ops.map((o, i) =>
        o.op === 'add_punch' ? (
          <div key={i} className="grid items-end gap-2 sm:grid-cols-[90px_1fr_1.4fr]">
            <div className="text-small font-semibold text-ink">{o.punch_type}</div>
            <label className="flex flex-col gap-1 text-caption font-medium text-ink-2">
              Time ({detail.windows.find((w) => w.punch_type === o.punch_type)?.earliest.slice(11)} to {detail.windows.find((w) => w.punch_type === o.punch_type)?.latest.slice(11)})
              <input
                type="datetime-local"
                value={o.at ?? ''}
                min={detail.windows.find((w) => w.punch_type === o.punch_type)?.earliest}
                max={detail.windows.find((w) => w.punch_type === o.punch_type)?.latest}
                onChange={(e) => update(i, { at: e.target.value })}
                className="h-8.5 rounded-control border border-line-strong bg-surface px-2 font-mono text-small text-ink outline-none focus:border-accent"
              />
            </label>
            <label className="flex flex-col gap-1 text-caption font-medium text-ink-2">
              Anchor evidence
              <select
                value={o.evidence_ids[0] ?? ''}
                onChange={(e) => {
                  const ev = detail.evidence.find((x) => x.id === e.target.value)
                  update(i, { evidence_ids: ev ? [ev.id] : [], at: ev ? ev.at : o.at })
                }}
                className="h-8.5 rounded-control border border-line-strong bg-surface px-2 text-small text-ink outline-none focus:border-accent"
              >
                <option value="">Choose evidence</option>
                {detail.evidence.map((e) => (
                  <option key={e.id} value={e.id}>{EVIDENCE_LABEL[e.kind] ?? e.kind} {hm(e.at)} ({e.strength})</option>
                ))}
              </select>
            </label>
          </div>
        ) : (
          <div key={i} className="text-small text-ink-2">{o.op.replace(/_/g, ' ')} {o.hours ? `(${o.hours} h)` : ''} (not editable here)</div>
        ),
      )}
      <div className="min-h-7">
        {validate.isPending && <span className="text-caption text-ink-3">Checking...</span>}
        {report && <GateStrip gates={relevantGates} animate={false} />}
      </div>
      <div className="grid gap-3 sm:grid-cols-[220px_1fr_auto]">
        <ReasonSelect kind="edit" value={reason} onChange={setReason} />
        <label className="flex flex-col gap-1 text-caption font-medium text-ink-2">
          Note (optional)
          <input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} className="h-8.5 rounded-control border border-line-strong bg-surface px-2 text-body text-ink outline-none focus:border-accent" />
        </label>
        <div className="flex items-end gap-2">
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!reason || !report?.passed || decide.isPending}
            onClick={async () => {
              try {
                const res = await decide.mutateAsync({ draftId: draft.id, body: { action: 'edit', reason_code: reason as ReasonCode, note: note || null, operations: ops } })
                toast.success('Edited correction countersigned.')
                onDone(res.resolved_exception_ids)
              } catch (err) {
                toast.error((err as Error).message)
              }
            }}
          >
            Save and countersign
          </Button>
        </div>
      </div>
    </motion.div>
  )
}
