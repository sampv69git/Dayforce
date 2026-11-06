import { Bug, FlaskConical, Radar, Sparkles } from 'lucide-react'
import { motion } from 'motion/react'
import { PageHeader, Reveal, Ring } from '@/components/fx'
import type { ReactNode } from 'react'
import { useEvaluation } from '@/api/hooks'
import { Card, CardHeader, EmptyState, Hatch, Pill, Skeleton } from '@/components/ui/primitives'
import { cn } from '@/lib/cn'

type Dict = Record<string, unknown>
const num = (v: unknown) => (typeof v === 'number' ? v : null)
const pct = (v: unknown) => (num(v) === null ? '–' : `${(num(v)! * 100).toFixed(1)}%`)

function Metric({ label, value, note, good, ratio }: { label: string; value: ReactNode; note?: string; good?: boolean; ratio?: number | null }) {
  return (
    <div className="lift flex items-center gap-3 rounded-xl border border-line bg-surface p-3 shadow-card">
      {ratio !== undefined && ratio !== null && (
        <Ring value={ratio} size={46} stroke={5} tone={ratio >= 0.9 ? 'ok' : ratio >= 0.75 ? 'brand' : 'warn'} />
      )}
      <div className="min-w-0">
        <div className="text-caption text-ink-3">{label}</div>
        <div className={cn('tabular mt-0.5 font-mono text-[20px] leading-7 font-semibold', good === false ? 'text-crit' : 'text-ink')}>{value}</div>
        {note && <div className="text-caption text-ink-3">{note}</div>}
      </div>
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
      <PageHeader
        icon={<FlaskConical size={22} />}
        tone="model"
        eyebrow="Evidence"
        title="Evaluation"
        description="Results from a real run of the evaluation suite in this repository, on a labelled synthetic dataset generated with a different seed from the demo data."
        actions={
          <div className="text-right text-small text-ink-3">
            <Hatch>Results from real runs only</Hatch>
            <div className="mt-1.5 font-mono text-[11px]">{String(r.run_at ?? '')} · commit {String(r.commit ?? '').slice(0, 7)} · {String(r.dataset_size ?? '')} cases</div>
          </div>
        }
      />

      {det && (
        <Card>
          <CardHeader eyebrow="Rules engine" title={<span className="flex items-center gap-2"><Radar size={15} className="text-accent" /> Detection</span>} />
          <div className="grid gap-3 px-4 pb-4 sm:grid-cols-3">
            <Metric label="Precision" value={pct(det.precision)} ratio={num(det.precision)} />
            <Metric label="Recall" value={pct(det.recall)} ratio={num(det.recall)} />
            <Metric label="F1" value={pct(det.f1)} ratio={num(det.f1)} />
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
                    <td className="py-1.5 text-right">
                      <div className="ml-auto flex w-40 items-center gap-2">
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3"><motion.span className="bg-brand block h-full rounded-full" initial={{ width: 0 }} whileInView={{ width: `${(num((v as Dict).required_hit_at_5) ?? 0) * 100}%` }} viewport={{ once: true }} transition={{ duration: 0.8 }} /></span>
                        <span className="tabular font-mono">{pct((v as Dict).required_hit_at_5)}</span>
                      </div>
                    </td>
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
          <Card key={String(run.provider)} className={cn('relative overflow-hidden', String(run.provider) === 'groq' && 'beam-border')}>
            <div aria-hidden className="bg-brand pointer-events-none absolute -top-20 -right-10 size-52 rounded-full opacity-10 blur-3xl" />
            <CardHeader className="relative z-10" eyebrow={`Generation · ${String(run.provider)}`} title={<span className="flex items-center gap-2"><Sparkles size={15} className="text-model" /> {String(run.model_id)}</span>} actions={<Pill tone="outline">{String(run.cases)} cases</Pill>} />
            <div className="relative z-10 grid gap-3 px-4 pb-4 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="Schema-valid first pass" value={pct(m.schema_valid_first_pass)} ratio={num(m.schema_valid_first_pass)} />
              <Metric label="Citation accuracy" value={pct(m.citation_accuracy)} ratio={num(m.citation_accuracy)} />
              <Metric label="Quote grounding" value={pct(m.quote_grounding)} ratio={num(m.quote_grounding)} />
              <Metric label="Re-check pass" value={pct(m.recheck_pass)} ratio={num(m.recheck_pass)} />
              <Metric label="Correction accuracy" value={pct(m.correction_accuracy)} note="matches gold acceptable operations" ratio={num(m.correction_accuracy)} />
              <Metric label="Verified (incl. repaired)" value={pct(m.verified_rate)} ratio={num(m.verified_rate)} />
              <Metric label="Fallback / escalation" value={`${pct(m.fallback_rate)} / ${pct(m.escalation_rate)}`} />
              <Metric label="Unsafe drafts reaching a manager" value={String(m.unsafe_reached ?? 0)} good={(num(m.unsafe_reached) ?? 0) === 0} />
              <Metric label="Injection resistance" value={pct(m.injection_resistance)} ratio={num(m.injection_resistance)} />
              <Metric label="Raw unsafe rate (no harness)" value={pct(m.raw_unsafe_rate)} note="what a manager would have seen without the gates" />
              <Metric label="Latency p50" value={num(m.latency_p50_ms) !== null ? `${(num(m.latency_p50_ms)! / 1000).toFixed(2)} s` : '–'} />
              <Metric label="Latency p95" value={num(m.latency_p95_ms) !== null ? `${(num(m.latency_p95_ms)! / 1000).toFixed(2)} s` : '–'} />
            </div>
          </Card>
        )
      })}

      {faults && (
        <Card className="overflow-hidden">
          <CardHeader
            eyebrow="Safety"
            title={<span className="flex items-center gap-2"><Bug size={15} className="text-crit" /> Fault-injection matrix</span>}
            actions={
              <Pill tone="ok">
                {Object.values(faults).reduce<number>((a, v) => a + Number((v as Dict).caught ?? 0), 0)}/{Object.values(faults).reduce<number>((a, v) => a + Number((v as Dict).cases ?? 0), 0)} caught
              </Pill>
            }
          />
          <div className="grid gap-3 px-4 pb-4 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(faults).map(([f, v], k) => {
              const d = v as Dict
              const cases = Number(d.cases ?? 0)
              const caught = Number(d.caught ?? 0)
              const unsafe = Number(d.unsafe ?? 0)
              return (
                <Reveal key={f} delay={(k % 6) * 0.04}>
                  <div className="lift h-full rounded-xl border border-line bg-surface p-3 shadow-card">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-small font-semibold text-ink capitalize">{f.replace(/_/g, ' ')}</span>
                      <span className="shrink-0 rounded-md border border-line bg-surface-2 px-1.5 font-mono text-[11px] text-ink-2">{String(d.expected_gate)}</span>
                    </div>
                    <div className="mt-2.5 flex flex-wrap gap-1" role="img" aria-label={`${caught} of ${cases} caught`}>
                      {Array.from({ length: cases }).map((_, n) => (
                        <motion.span
                          key={n}
                          initial={{ scale: 0 }}
                          whileInView={{ scale: 1 }}
                          viewport={{ once: true }}
                          transition={{ delay: n * 0.03, type: 'spring', stiffness: 400, damping: 18 }}
                          className={cn('size-3 rounded-[4px]', n < caught ? 'bg-gradient-to-br from-ok to-brand-3' : 'bg-crit')}
                        />
                      ))}
                    </div>
                    <div className="mt-2 flex justify-between font-mono text-[11px]">
                      <span className="text-ink-2">{caught}/{cases} caught</span>
                      <span className={unsafe ? 'text-crit' : 'text-ok'}>{unsafe} unsafe</span>
                    </div>
                  </div>
                </Reveal>
              )
            })}
          </div>
        </Card>
      )}
    </div>
  )
}
