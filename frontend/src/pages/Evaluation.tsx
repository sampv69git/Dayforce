import { FlaskConical } from 'lucide-react'
import type { ReactNode } from 'react'
import { useEvaluation } from '@/api/hooks'
import { Card, CardHeader, EmptyState, Hatch, Pill, Skeleton } from '@/components/ui/primitives'
import { cn } from '@/lib/cn'

type Dict = Record<string, unknown>
const num = (v: unknown) => (typeof v === 'number' ? v : null)
const pct = (v: unknown) => (num(v) === null ? '–' : `${(num(v)! * 100).toFixed(1)}%`)

function Metric({ label, value, note, good }: { label: string; value: ReactNode; note?: string; good?: boolean }) {
  return (
    <div className="rounded-md border border-line p-3">
      <div className="text-caption text-ink-3">{label}</div>
      <div className={cn('tabular mt-1 font-mono text-title font-semibold', good === false ? 'text-crit' : 'text-ink')}>{value}</div>
      {note && <div className="mt-0.5 text-caption text-ink-3">{note}</div>}
    </div>
  )
}

export default function Evaluation() {
  const q = useEvaluation()
  if (q.isLoading) return <div className="p-6"><Skeleton className="h-96" /></div>
  if (q.isError || !q.data)
    return (
      <div className="p-6">
        <EmptyState icon={<FlaskConical size={18} />} title="No evaluation report yet" body="Run the evaluation suite (make eval-ci, make eval-groq). Results appear here only from real runs." />
      </div>
    )
  const r = q.data as Dict
  const runs = (r.runs as Dict[]) ?? []
  const det = r.detection as Dict | undefined
  const ret = r.retrieval as Dict | undefined
  const faults = r.fault_matrix as Dict | undefined
  return (
    <div className="mx-auto max-w-[1280px] space-y-5 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow">Evidence</div>
          <h1 className="text-display font-semibold tracking-tight text-ink">Evaluation</h1>
          <p className="mt-1 max-w-2xl text-body text-ink-2">Results from a real run of the evaluation suite in this repository, on a labelled synthetic dataset generated with a different seed from the demo data.</p>
        </div>
        <div className="text-right text-small text-ink-3">
          <Hatch>Results from real runs only</Hatch>
          <div className="mt-1.5 font-mono text-[11px]">{String(r.run_at ?? '')} · commit {String(r.commit ?? '').slice(0, 7)} · {String(r.dataset_size ?? '')} cases</div>
        </div>
      </div>

      {det && (
        <Card>
          <CardHeader eyebrow="Rules engine" title="Detection" />
          <div className="grid gap-3 px-4 pb-4 sm:grid-cols-3">
            <Metric label="Precision" value={pct(det.precision)} />
            <Metric label="Recall" value={pct(det.recall)} />
            <Metric label="F1" value={pct(det.f1)} />
          </div>
        </Card>
      )}

      {ret && (
        <Card>
          <CardHeader eyebrow="Policy retrieval (unseeded)" title="Retrieval quality by method" />
          <div className="px-4 pb-4">
            <table className="w-full text-small">
              <thead><tr className="text-caption text-ink-3"><th className="py-1.5 text-left font-medium">Method</th><th className="py-1.5 text-right font-medium">Required hit@5</th><th className="py-1.5 text-right font-medium">Gold recall@5</th><th className="py-1.5 text-right font-medium">MRR</th></tr></thead>
              <tbody>
                {Object.entries(ret).map(([m, v]) => (
                  <tr key={m} className="border-t border-line/70">
                    <td className="py-1.5 font-medium text-ink">{m}</td>
                    <td className="tabular py-1.5 text-right font-mono">{pct((v as Dict).required_hit_at_5)}</td>
                    <td className="tabular py-1.5 text-right font-mono">{pct((v as Dict).gold_recall_at_5)}</td>
                    <td className="tabular py-1.5 text-right font-mono">{num((v as Dict).mrr)?.toFixed(3) ?? '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {runs.map((run) => {
        const m = run.metrics as Dict
        return (
          <Card key={String(run.provider)}>
            <CardHeader eyebrow={`Generation · ${String(run.provider)}`} title={String(run.model_id)} actions={<Pill tone="outline">{String(run.cases)} cases</Pill>} />
            <div className="grid gap-3 px-4 pb-4 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="Schema-valid first pass" value={pct(m.schema_valid_first_pass)} />
              <Metric label="Citation accuracy" value={pct(m.citation_accuracy)} />
              <Metric label="Quote grounding" value={pct(m.quote_grounding)} />
              <Metric label="Re-check pass" value={pct(m.recheck_pass)} />
              <Metric label="Correction accuracy" value={pct(m.correction_accuracy)} note="matches gold acceptable operations" />
              <Metric label="Verified (incl. repaired)" value={pct(m.verified_rate)} />
              <Metric label="Fallback / escalation" value={`${pct(m.fallback_rate)} / ${pct(m.escalation_rate)}`} />
              <Metric label="Unsafe drafts reaching a manager" value={String(m.unsafe_reached ?? 0)} good={(num(m.unsafe_reached) ?? 0) === 0} />
              <Metric label="Injection resistance" value={pct(m.injection_resistance)} />
              <Metric label="Raw unsafe rate (no harness)" value={pct(m.raw_unsafe_rate)} note="what a manager would have seen without the gates" />
              <Metric label="Latency p50" value={num(m.latency_p50_ms) !== null ? `${(num(m.latency_p50_ms)! / 1000).toFixed(2)} s` : '–'} />
              <Metric label="Latency p95" value={num(m.latency_p95_ms) !== null ? `${(num(m.latency_p95_ms)! / 1000).toFixed(2)} s` : '–'} />
            </div>
          </Card>
        )
      })}

      {faults && (
        <Card>
          <CardHeader eyebrow="Safety" title="Fault-injection matrix" />
          <div className="px-4 pb-4">
            <table className="w-full text-small">
              <thead><tr className="text-caption text-ink-3"><th className="py-1.5 text-left font-medium">Fault</th><th className="py-1.5 text-left font-medium">Expected gate</th><th className="py-1.5 text-right font-medium">Caught</th><th className="py-1.5 text-right font-medium">Unsafe</th></tr></thead>
              <tbody>
                {Object.entries(faults).map(([f, v]) => (
                  <tr key={f} className="border-t border-line/70">
                    <td className="py-1.5 text-ink">{f.replace(/_/g, ' ')}</td>
                    <td className="py-1.5 font-mono text-ink-2">{String((v as Dict).expected_gate)}</td>
                    <td className="tabular py-1.5 text-right font-mono">{String((v as Dict).caught)}/{String((v as Dict).cases)}</td>
                    <td className={cn('tabular py-1.5 text-right font-mono', (v as Dict).unsafe ? 'text-crit' : 'text-ok')}>{String((v as Dict).unsafe)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
