import { AnimatePresence, motion } from 'motion/react'
import { ArrowLeft, Bug, Check, ChevronRight, Copy, Loader2, Microscope, Play, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { useReplay, useTrace, useTraces } from '@/api/hooks'
import type { Fault, Span, Trace } from '@/api/types'
import { GateStrip, RouteBadge } from '@/components/domain/badges'
import { Button, Card, CardHeader, EmptyState, ErrorState, Pill, Segmented, Skeleton } from '@/components/ui/primitives'
import { cn } from '@/lib/cn'
import { useSession } from '@/lib/session'

const FAULTS: { id: Fault; label: string; gate: string }[] = [
  { id: 'hallucinated_clause', label: 'Hallucinated clause', gate: 'G3' },
  { id: 'fabricated_quote', label: 'Fabricated quote', gate: 'G5' },
  { id: 'unanchored_time', label: 'Invented punch time', gate: 'G7' },
  { id: 'reduces_paid_hours', label: 'Removes worked time', gate: 'G9' },
  { id: 'injection_echo', label: 'Echoes an injection', gate: 'G10' },
  { id: 'wrong_numbers', label: 'Wrong numbers', gate: 'G10' },
  { id: 'disallowed_action', label: 'Disallowed action', gate: 'G6' },
  { id: 'does_not_fix', label: 'Does not fix the problem', gate: 'G8' },
  { id: 'unretrieved_clause', label: 'Cites unretrieved clause', gate: 'G4' },
  { id: 'malformed_json', label: 'Malformed JSON', gate: 'G1' },
  { id: 'timeout', label: 'Provider timeout', gate: 'provider' },
  { id: 'bad_then_good', label: 'Bad, then repaired', gate: 'repair' },
]

export default function Inspector() {
  const { runId } = useParams()
  return runId ? <RunView runId={runId} /> : <RunIndex />
}

function RunIndex() {
  const q = useTraces()
  const [route, setRoute] = useState<'all' | 'suggest' | 'fallback' | 'escalate' | 'manual'>('all')
  const rows = (q.data ?? []).filter((r) => route === 'all' || r.route === route)
  return (
    <div className="mx-auto max-w-[1180px] space-y-5 p-6">
      <div>
        <div className="eyebrow">Observability</div>
        <h1 className="text-display font-semibold tracking-tight text-ink">Harness inspector</h1>
        <p className="mt-1 max-w-2xl text-body text-ink-2">Every pipeline run, step by step: context, retrieval, prompt, raw model output, gate results, route, and decision. Fault replays show the harness catching injected failures.</p>
      </div>
      <Segmented
        value={route}
        onChange={setRoute}
        options={[
          { value: 'all', label: 'All', count: q.data?.length },
          { value: 'suggest', label: 'Verified' },
          { value: 'fallback', label: 'Fallback' },
          { value: 'escalate', label: 'Escalated' },
          { value: 'manual', label: 'Rule-based' },
        ]}
      />
      <Card className="overflow-hidden">
        {q.isLoading && <div className="p-4"><Skeleton className="h-64" /></div>}
        {q.isError && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
        {!q.isLoading && rows.length === 0 && <EmptyState icon={<Microscope size={18} />} title="No runs yet" body="Open an exception in the queue to run the pipeline." />}
        {rows.length > 0 && (
          <table className="w-full text-small">
            <thead>
              <tr className="border-b border-line bg-surface-2/60 text-caption text-ink-3">
                <th className="px-4 py-2 text-left font-medium">Run</th>
                <th className="px-3 py-2 text-left font-medium">Exception</th>
                <th className="px-3 py-2 text-left font-medium">Route</th>
                <th className="px-3 py-2 text-left font-medium">Failed gates</th>
                <th className="px-3 py-2 text-left font-medium">Provider</th>
                <th className="px-3 py-2 text-right font-medium">Latency</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.run_id} className="group border-b border-line/70 last:border-0 hover:bg-surface-2/50">
                  <td className="px-4 py-2 font-mono text-[12px] text-ink">
                    <Link to={`/inspector/${r.run_id}`} className="hover:underline">{r.run_id}</Link>
                    {r.fault && <Pill tone="warn" className="ml-2"><Bug size={10} /> {r.fault.replace(/_/g, ' ')}</Pill>}
                  </td>
                  <td className="px-3 py-2 font-mono text-[12px] text-ink-2">{r.exception_id}</td>
                  <td className="px-3 py-2"><RouteBadge route={r.route} /></td>
                  <td className="px-3 py-2 font-mono text-[12px] text-crit">{r.failed_gates.join(' ') || <span className="text-ink-3">none</span>}</td>
                  <td className="px-3 py-2 text-ink-2">{r.provider} <span className="font-mono text-[11px] text-ink-3">{r.model_id.replace('openai/', '')}</span></td>
                  <td className="tabular px-3 py-2 text-right font-mono text-ink-2">{(r.latency_ms / 1000).toFixed(2)} s</td>
                  <td className="px-3 py-2 text-right"><ChevronRight size={14} className="inline text-ink-3 group-hover:text-ink" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}

const SPAN_LABEL: Record<string, string> = {
  context: 'Context', retrieve: 'Retrieve', sanitise: 'Sanitise', generate: 'Generate', validate: 'Validate', repair: 'Repair', route: 'Route',
}

function RunView({ runId }: { runId: string }) {
  const q = useTrace(runId)
  const { user } = useSession()
  const replay = useReplay()
  const navigate = useNavigate()
  const [selected, setSelected] = useState<string | null>(null)
  const [faultOpen, setFaultOpen] = useState(false)
  const t = q.data
  const span = useMemo(() => t?.spans.find((s) => s.span_id === selected) ?? t?.spans.find((s) => s.name === 'generate') ?? t?.spans[0], [t, selected])

  if (q.isLoading) return <div className="p-6"><Skeleton className="h-[480px]" /></div>
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />
  if (!t) return null

  const modelAttempts = t.spans.filter((s) => s.name === 'generate').length
  const t0 = Math.min(...t.spans.map((s) => new Date(s.start).getTime()))
  const t1 = Math.max(...t.spans.map((s) => new Date(s.end).getTime()))
  const total = Math.max(1, t1 - t0)

  const runFault = async (fault: Fault) => {
    setFaultOpen(false)
    const d = await replay.mutateAsync({ exception_id: t.run.exception_id, fault })
    toast(`Fault replay finished: route ${d.route}. The original draft is unchanged.`)
    navigate(`/inspector/${d.id}`)
  }

  return (
    <div className="mx-auto max-w-[1280px] space-y-4 p-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild size="sm" variant="ghost"><Link to="/inspector"><ArrowLeft size={13} /> All runs</Link></Button>
        <h1 className="font-mono text-title font-semibold text-ink">{t.run.run_id}</h1>
        <RouteBadge route={t.run.route} />
        {t.run.fault && <Pill tone="warn"><Bug size={11} /> Fault replay: {t.run.fault.replace(/_/g, ' ')}</Pill>}
        <span className="text-small text-ink-3">
          <Link to={`/queue?selected=${t.run.exception_id}`} className="font-mono hover:underline">{t.run.exception_id}</Link> · {t.run.provider} · <span className="font-mono">{t.run.model_id}</span> · {(t.run.latency_ms / 1000).toFixed(2)} s
        </span>
        {user?.role === 'payroll_admin' && (
          <div className="relative ml-auto">
            <Button variant="model" onClick={() => setFaultOpen((v) => !v)} disabled={replay.isPending}>
              {replay.isPending ? <Loader2 size={14} className="animate-spin" /> : <Play size={13} />} Replay with fault
            </Button>
            <AnimatePresence>
              {faultOpen && (
                <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="absolute right-0 z-40 mt-1.5 w-80 rounded-card border border-line bg-surface p-1.5 shadow-overlay">
                  <div className="eyebrow px-2 pt-1 pb-1.5">Inject a failure; the harness must catch it</div>
                  {FAULTS.map((f) => (
                    <button key={f.id} onClick={() => runFault(f.id)} className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-small text-ink-2 hover:bg-surface-2 hover:text-ink">
                      {f.label}
                      <span className="font-mono text-[11px] text-ink-3">{f.gate}</span>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <Card>
          <CardHeader eyebrow="Trace" title="Pipeline waterfall" />
          <ol className="px-2 pb-3">
            {t.spans.map((s) => (
              <WaterfallRow key={s.span_id} s={s} t0={t0} total={total} active={span?.span_id === s.span_id} onClick={() => setSelected(s.span_id)} />
            ))}
            <li className="mt-1 flex items-center gap-2 rounded-md px-2 py-1.5 text-small text-ink-3">
              <span className={cn('size-2.5 rounded-full border-2', t.run.decided ? 'border-accent bg-accent' : 'border-line-strong')} />
              Decide · {t.run.decided ? 'countersigned' : t.run.fault ? 'inspection only (fault replay)' : 'waiting for a manager'}
            </li>
          </ol>
        </Card>
        <Card className="min-w-0">
          <SpanDetail span={span} trace={t} />
        </Card>
      </div>

      <Card>
        <CardHeader eyebrow="Validation" title={`Gate results across ${t.validations.length} check(s)`} />
        <div className="space-y-3 px-4 pb-4">
          {t.validations.map((v, i) => (
            <div key={i} className="rounded-md border border-line p-3">
              <div className="mb-2 flex items-center gap-2 text-small">
                <span className="font-medium text-ink">{modelAttempts === 0 ? 'Rule-based template' : i < modelAttempts ? `Model attempt ${i + 1}` : 'Rule-based fallback'}</span>
                {v.passed ? <Pill tone="ok"><Check size={11} /> passed</Pill> : <Pill tone="crit"><X size={11} /> rejected</Pill>}
              </div>
              <GateStrip gates={v.gates} animate={false} />
              {v.gates.filter((g) => g.status === 'fail').map((g) => (
                <div key={g.id} className="mt-1.5 text-small text-crit"><span className="font-mono">{g.id}</span> {g.detail}</div>
              ))}
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

function WaterfallRow({ s, t0, total, active, onClick }: { s: Span; t0: number; total: number; active: boolean; onClick: () => void }) {
  const start = new Date(s.start).getTime() - t0
  const dur = Math.max(new Date(s.end).getTime() - new Date(s.start).getTime(), 0)
  const failed = s.status === 'error' || (s.name === 'validate' && (s.attributes as { passed?: boolean }).passed === false)
  const attempt = (s.attributes as { attempt?: number; mode?: string }).attempt
  const mode = (s.attributes as { mode?: string }).mode
  return (
    <li>
      <button onClick={onClick} className={cn('grid w-full grid-cols-[110px_1fr_64px] items-center gap-2 rounded-md px-2 py-1.5 text-left text-small hover:bg-surface-2', active && 'bg-accent-soft/70 hover:bg-accent-soft')}>
        <span className="flex items-center gap-1.5 truncate font-medium text-ink">
          <span className={cn('size-2 rounded-full', failed ? 'bg-crit' : s.name === 'generate' ? 'bg-model' : 'bg-ok')} />
          {SPAN_LABEL[s.name] ?? s.name}
          {attempt ? <span className="font-mono text-[10px] text-ink-3">{mode === 'rule_based' ? 'template' : mode ?? `#${attempt}`}</span> : null}
        </span>
        <span className="relative h-2.5 rounded-full bg-surface-3">
          <motion.span
            initial={{ width: 0 }}
            animate={{ width: `${Math.max((dur / total) * 100, 1.2)}%` }}
            className={cn('absolute inset-y-0 rounded-full', failed ? 'bg-crit' : s.name === 'generate' ? 'bg-model' : 'bg-ink/60')}
            style={{ left: `${(start / total) * 100}%` }}
          />
        </span>
        <span className="tabular text-right font-mono text-[11px] text-ink-3">{dur < 1000 ? `${dur} ms` : `${(dur / 1000).toFixed(2)} s`}</span>
      </button>
    </li>
  )
}

function SpanDetail({ span, trace }: { span: Span | undefined; trace: Trace }) {
  const [tab, setTab] = useState<'attributes' | 'prompt' | 'raw' | 'validated' | 'context'>('attributes')
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <div className="text-heading font-semibold text-ink">{span ? SPAN_LABEL[span.name] ?? span.name : 'Span'}</div>
        <Segmented
          size="sm"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'attributes', label: 'Attributes' },
            { value: 'prompt', label: 'Prompt' },
            { value: 'raw', label: 'Raw output' },
            { value: 'validated', label: 'Validated' },
            { value: 'context', label: 'Context' },
          ]}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4 scrollbar-thin">
        {tab === 'attributes' && span && <Json value={span.attributes} />}
        {tab === 'prompt' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-caption text-ink-3">Prompt hash <span className="font-mono text-ink-2">{trace.prompt_hash?.slice(0, 16)}</span></div>
            <Block title="System prompt (draft.v1)" text={trace.system_prompt} />
            <Block title="User message (case context and untrusted block)" text={trace.user_prompt} />
          </div>
        )}
        {tab === 'raw' && (trace.raw_outputs.length ? trace.raw_outputs.map((r, i) => <Block key={i} title={`Output ${i + 1}`} text={pretty(r)} />) : <p className="text-small text-ink-3">No raw output (provider error).</p>)}
        {tab === 'validated' && (trace.resolution ? <Json value={trace.resolution} /> : <p className="text-small text-ink-3">No validated resolution.</p>)}
        {tab === 'context' && <Json value={trace.context} />}
      </div>
    </div>
  )
}

function pretty(s: string) {
  try {
    return JSON.stringify(JSON.parse(s), null, 2)
  } catch {
    return s
  }
}

function Block({ title, text }: { title: string; text: string }) {
  return (
    <div className="mb-3">
      <div className="mb-1 flex items-center justify-between">
        <span className="eyebrow">{title}</span>
        <button onClick={() => { void navigator.clipboard.writeText(text); toast('Copied') }} className="text-ink-3 hover:text-ink" aria-label="Copy"><Copy size={13} /></button>
      </div>
      <pre className="max-h-[420px] overflow-auto rounded-md border border-line bg-surface-2/60 p-3 font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap text-ink-2 scrollbar-thin">{text}</pre>
    </div>
  )
}

function Json({ value }: { value: unknown }) {
  return <Block title="JSON" text={JSON.stringify(value, null, 2)} />
}
