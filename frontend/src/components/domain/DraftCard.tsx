import { motion, useReducedMotion } from 'motion/react'
import { ArrowLeftRight, BadgeCheck, CalendarClock, Clock, Coins, Fingerprint, ScanLine, ShieldAlert, Trash2, UserRoundCheck } from 'lucide-react'
import type { ReactNode } from 'react'
import { useState } from 'react'
import type { Draft, EvidenceItem, Operation, RetrievedClause } from '@/api/types'
import { Pill, Pop } from '@/components/ui/primitives'
import { cn } from '@/lib/cn'
import { dayTime, EVIDENCE_LABEL, hm, hours, OP_LABEL } from '@/lib/format'
import { DocChip, Provenance } from './badges'

const ICONS: Record<string, ReactNode> = {
  add_punch: <Clock size={13} />,
  void_punch: <Trash2 size={13} />,
  record_premium: <Coins size={13} />,
  approve_overtime: <BadgeCheck size={13} />,
  acknowledge: <UserRoundCheck size={13} />,
  approve_unscheduled: <CalendarClock size={13} />,
  reassign_shift: <ArrowLeftRight size={13} />,
  escalate: <ShieldAlert size={13} />,
}

export function OperationLine({ op, evidence, names }: { op: Operation; evidence: EvidenceItem[]; names?: Record<string, string> }) {
  const ev = op.evidence_ids.map((id) => evidence.find((e) => e.id === id)).filter(Boolean) as EvidenceItem[]
  let main: ReactNode = OP_LABEL[op.op]
  if (op.op === 'add_punch' && op.at) main = <>Add <b className="font-semibold">{op.punch_type}</b> at <span className="font-mono">{dayTime(op.at)}</span></>
  if (op.op === 'void_punch') main = <>Void duplicate punch <span className="font-mono">{op.punch_id}</span></>
  if (op.op === 'record_premium') main = <>Record <b className="font-semibold">{hours(op.hours)}</b> {op.premium_kind} premium</>
  if (op.op === 'approve_overtime') main = <>Approve <b className="font-semibold">{hours(op.hours)}</b> of worked overtime</>
  if (op.op === 'reassign_shift') main = <>Reassign shift to <b className="font-semibold">{names?.[op.to_employee_id ?? ''] ?? op.to_employee_id}</b></>
  return (
    <li className="flex items-start gap-2.5 py-1.5">
      <span className={cn('mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border', op.op === 'escalate' ? 'border-crit/30 bg-crit-soft text-crit' : 'border-line bg-surface text-ink-2')}>
        {ICONS[op.op]}
      </span>
      <div className="min-w-0 text-body text-ink">
        {main}
        {ev.length > 0 && (
          <div className="mt-0.5 flex flex-wrap items-center gap-1 text-small text-ink-3">
            <Fingerprint size={11} />
            anchored to
            {ev.map((e) => (
              <span key={e.id} className={cn('rounded px-1 font-mono text-[11px]', e.kind === 'attestation' ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-ink-2')}>
                {EVIDENCE_LABEL[e.kind] ?? e.kind} {hm(e.at)}
              </span>
            ))}
          </div>
        )}
      </div>
    </li>
  )
}

function highlight(text: string, quote: string): ReactNode {
  const i = text.toLowerCase().indexOf(quote.toLowerCase().replace(/\s+/g, ' ').trim().replace(/[."']+$/, ''))
  if (i < 0) return text
  const q = quote.replace(/[."']+$/, '')
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded-[3px] bg-model-soft px-0.5 text-ink ring-1 ring-model-line">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  )
}

export function CitationChip({ clauseId, quote, clause }: { clauseId: string; quote: string; clause?: RetrievedClause }) {
  return (
    <Pop
      className="w-[26rem]"
      trigger={
        <button className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md border border-model-line bg-surface px-1.5 py-px font-mono text-[11px] font-medium text-model outline-none hover:bg-model-soft focus-visible:ring-2 focus-visible:ring-accent">
          {clauseId}
        </button>
      }
    >
      <div className="flex items-center justify-between gap-2">
        <DocChip id={clauseId} />
        {clause && (
          <span className="flex gap-1">
            {clause.required && <Pill tone="accent">Required</Pill>}
            {clause.precedence === 'override' && <Pill tone="warn">Overrides handbook</Pill>}
          </span>
        )}
      </div>
      {clause ? (
        <>
          <div className="mt-2 text-heading font-semibold text-ink">{clause.title}</div>
          <div className="text-caption text-ink-3">{clause.document_title}</div>
          <p className="mt-2 text-small leading-relaxed text-ink-2">{highlight(clause.text, quote)}</p>
          <div className="mt-3 flex gap-3 border-t border-line pt-2 font-mono text-[11px] text-ink-3">
            <span>BM25 #{clause.bm25_rank ?? '–'}</span>
            <span>Dense #{clause.dense_rank ?? '–'}</span>
            <span>RRF {clause.fused_score.toFixed(4)}</span>
          </div>
        </>
      ) : (
        <p className="mt-2 text-small text-ink-2">"{quote}"</p>
      )}
      <p className="mt-2 text-caption text-ink-3">Fictional policy pack v2026.2. Not legal advice.</p>
    </Pop>
  )
}

export function DraftCard({ draft, evidence, names }: { draft: Draft; evidence: EvidenceItem[]; names?: Record<string, string> }) {
  const reduce = useReducedMotion()
  const [showWhy, setShowWhy] = useState(false)
  const r = draft.resolution
  if (!r) return null
  const kind = draft.route === 'suggest' ? 'model' : draft.route === 'fallback' ? 'fallback' : draft.route === 'escalate' ? 'escalate' : 'rule'
  const shell = {
    model: 'border-model-line bg-model-soft/45 [border-left-style:dotted] border-l-[3px] border-l-model',
    fallback: 'border-warn-line bg-warn-soft/50 border-l-[3px] border-l-warn',
    escalate: 'border-crit/25 bg-crit-soft/50 border-l-[3px] border-l-crit',
    rule: 'border-line bg-surface-2/60 border-l-[3px] border-l-rule',
  }[kind]
  const clauseById = Object.fromEntries(draft.retrieved.map((c) => [c.clause_id, c]))
  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className={cn('rounded-card border p-4', shell)}
      aria-label="Proposed resolution"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Provenance kind={kind === 'model' ? 'model' : kind} />
        <span className="font-mono text-[11px] text-ink-3">
          {draft.provider === 'rule_based' ? 'deterministic-templates-v1' : draft.model_id} · {draft.prompt_version} · {draft.attempts} attempt{draft.attempts > 1 ? 's' : ''} · {(draft.latency_ms / 1000).toFixed(2)} s
        </span>
      </div>
      {draft.fallback_reason && (
        <div className="mt-2.5 flex items-start gap-2 rounded-md border border-warn-line bg-surface px-3 py-2 text-small text-ink-2">
          <ShieldAlert size={14} className="mt-0.5 shrink-0 text-warn" />
          <span>{draft.fallback_reason}</span>
        </div>
      )}
      {draft.route === 'escalate' && draft.escalation_reason && (
        <div className="mt-2.5 rounded-md border border-crit/25 bg-surface px-3 py-2 text-small text-ink-2">
          <span className="font-semibold text-crit">Why escalated: </span>
          {draft.escalation_reason}
        </div>
      )}
      <h3 className="mt-3 text-[15px] leading-6 font-semibold text-ink">{r.summary}</h3>
      <p className="mt-1 text-body leading-relaxed text-ink-2">{r.explanation}</p>
      <ul className="mt-2.5 divide-y divide-line/70 border-y border-line/70">
        {r.operations.map((op, i) => (
          <OperationLine key={i} op={op} evidence={evidence} names={names} />
        ))}
      </ul>
      <div className="mt-3 space-y-2">
        {r.citations.map((c) => (
          <blockquote key={c.clause_id + c.quote} className="flex items-start gap-2 text-small">
            <CitationChip clauseId={c.clause_id} quote={c.quote} clause={clauseById[c.clause_id]} />
            <span className="text-ink-2 italic">"{c.quote}"</span>
          </blockquote>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-ink-3">
        {(r as { employee_note_assessment?: { contains_instructions: boolean } }).employee_note_assessment?.contains_instructions && (
          <span className="flex items-center gap-1 text-warn"><ScanLine size={12} /> {kind === 'model' ? 'Model flagged' : 'Harness flagged'} instructions in the employee note; they were ignored</span>
        )}
        <span>Model's own estimate: {(r as { self_confidence?: string }).self_confidence ?? 'n/a'} (not used for routing)</span>
        <button className="underline-offset-2 hover:text-ink-2 hover:underline" onClick={() => setShowWhy((v) => !v)}>
          {showWhy ? 'Hide' : 'What the model did and did not do'}
        </button>
      </div>
      {showWhy && (
        <div className="mt-2 grid gap-2 rounded-md border border-line bg-surface p-3 text-small text-ink-2 sm:grid-cols-2">
          <div>
            <div className="eyebrow mb-1">The model</div>
            <ul className="list-disc space-y-0.5 pl-4">
              <li>Read verified case facts and {draft.retrieved.length} retrieved clauses</li>
              <li>Chose operations from the allowed set</li>
              <li>Wrote the explanation and quoted the policy</li>
            </ul>
          </div>
          <div>
            <div className="eyebrow mb-1">Code and people</div>
            <ul className="list-disc space-y-0.5 pl-4">
              <li>Detected the exception and computed all hours and pay</li>
              <li>Checked every claim through ten gates</li>
              <li>Nothing changes until a manager countersigns</li>
            </ul>
          </div>
        </div>
      )}
    </motion.section>
  )
}
