import { BookText, Search, Sparkles } from 'lucide-react'
import { useMemo, useState } from 'react'
import { usePolicies, usePolicySearch } from '@/api/hooks'
import { DocChip } from '@/components/domain/badges'
import { PageHeader, Reveal } from '@/components/fx'
import { motion } from 'motion/react'
import { Button, Card, CardHeader, ErrorState, Pill, Segmented, Skeleton } from '@/components/ui/primitives'
import { cn } from '@/lib/cn'

type Juris = 'US-CA' | 'US-TX' | 'IN-KA'
const JURIS_LABEL: Record<Juris, string> = { 'US-CA': 'Fremont (CA)', 'US-TX': 'Austin (TX)', 'IN-KA': 'Bengaluru' }

export default function Policies() {
  const q = usePolicies()
  const search = usePolicySearch()
  const [doc, setDoc] = useState<string>('all')
  const [selected, setSelected] = useState<string | null>(null)
  const [query, setQuery] = useState('meal period was missed on a long shift')
  const [juris, setJuris] = useState<Juris>('US-CA')
  const clauses = useMemo(() => (q.data?.clauses ?? []).filter((c) => doc === 'all' || c.document_id === doc), [q.data, doc])
  const current = q.data?.clauses.find((c) => c.clause_id === (selected ?? clauses[0]?.clause_id))
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />
  return (
    <div className="mx-auto max-w-[1280px] space-y-5 p-6">
      <PageHeader
        icon={<BookText size={22} />}
        tone="teal"
        eyebrow="Approved knowledge"
        title="Policies and retrieval"
        description={`Fictional policy pack v${q.data?.version ?? '2026.2'} for Kestrel Logistics: a company handbook and two site addenda. Inspired by public rules; not legal advice.`}
        actions={
          <div className="flex gap-2">
            {[
              [q.data?.clauses.length ?? 0, 'clauses'],
              [q.data?.documents.length ?? 0, 'documents'],
              [3, 'jurisdictions'],
            ].map(([n, l]) => (
              <div key={String(l)} className="rounded-xl border border-line bg-surface px-3 py-2 text-center shadow-card">
                <div className="tabular font-mono text-[20px] leading-6 font-semibold text-ink">{n}</div>
                <div className="text-caption text-ink-3">{l}</div>
              </div>
            ))}
          </div>
        }
      />

      <Card className="relative overflow-hidden">
        <div aria-hidden className="bg-brand pointer-events-none absolute -top-24 right-10 size-56 rounded-full opacity-10 blur-3xl" />
        <CardHeader eyebrow="Same code path as the pipeline" title={<span className="flex items-center gap-2"><Sparkles size={15} className="text-accent" /> Retrieval playground</span>} />
        <form
          className="flex flex-wrap items-center gap-2 px-4"
          onSubmit={(e) => {
            e.preventDefault()
            search.mutate({ query, jurisdiction: juris, k: 6 })
          }}
        >
          <div className="flex h-10 min-w-[320px] flex-1 items-center gap-2 rounded-xl border border-line-strong bg-surface px-3 shadow-card transition-shadow focus-within:border-accent focus-within:shadow-glow">
            <Search size={14} className="text-ink-3" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} className="flex-1 bg-transparent text-body text-ink outline-none" aria-label="Search query" />
          </div>
          <Segmented value={juris} onChange={setJuris} options={(Object.keys(JURIS_LABEL) as Juris[]).map((j) => ({ value: j, label: JURIS_LABEL[j] }))} />
          <Button variant="primary" type="submit" disabled={search.isPending}>Retrieve</Button>
        </form>
        <div className="px-4 pt-3 pb-4">
          {search.data ? (
            <table className="w-full text-small">
              <thead>
                <tr className="text-caption text-ink-3">
                  <th className="py-1.5 text-left font-medium">Clause</th>
                  <th className="py-1.5 text-right font-medium">BM25</th>
                  <th className="py-1.5 text-right font-medium">Dense</th>
                  <th className="py-1.5 text-right font-medium">Fused (RRF)</th>
                </tr>
              </thead>
              <tbody>
                {search.data.map((r, i) => (
                  <tr key={r.clause_id} className="cursor-pointer border-t border-line/70 hover:bg-surface-2/60" onClick={() => setSelected(r.clause_id)}>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <span className="tabular w-4 font-mono text-[11px] text-ink-3">{i + 1}</span>
                        <DocChip id={r.clause_id} />
                        <span className="font-medium text-ink">{r.title}</span>
                        {r.precedence === 'override' && <Pill tone="warn">override</Pill>}
                      </div>
                    </td>
                    <td className="tabular py-2 text-right font-mono text-ink-2">{r.bm25_rank ? `#${r.bm25_rank}` : '–'}</td>
                    <td className="tabular py-2 text-right font-mono text-ink-2">{r.dense_rank ? `#${r.dense_rank}` : '–'}</td>
                    <td className="py-2 text-right">
                      <div className="ml-auto flex w-36 items-center gap-2">
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
                          <motion.span className="bg-brand block h-full rounded-full" initial={{ width: 0 }} animate={{ width: `${(r.fused_score / Math.max(...search.data!.map((x) => x.fused_score))) * 100}%` }} transition={{ duration: 0.6, delay: i * 0.05 }} />
                        </span>
                        <span className="tabular font-mono text-ink">{r.fused_score.toFixed(4)}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-small text-ink-3">Filters by jurisdiction, employee class, and effective date, then ranks with BM25 and bge-small embeddings fused by reciprocal rank fusion.</p>
          )}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        <Card className="overflow-hidden">
          <div className="border-b border-line p-3">
            <Segmented size="sm" value={doc} onChange={setDoc} options={[{ value: 'all', label: 'All' }, ...(q.data?.documents ?? []).map((d) => ({ value: d.id!, label: d.id! }))]} />
          </div>
          <ul className="max-h-[560px] overflow-y-auto scrollbar-thin">
            {q.isLoading && <li className="p-3"><Skeleton className="h-64" /></li>}
            {clauses.map((c) => (
              <li key={c.clause_id}>
                <button onClick={() => setSelected(c.clause_id)} className={cn('relative flex w-full items-start gap-2 border-b border-line/70 px-3 py-2.5 text-left transition-colors hover:bg-surface-2/60', current?.clause_id === c.clause_id && 'bg-gradient-to-r from-accent-soft to-transparent shadow-[inset_3px_0_0_var(--accent)]')}>
                  <span className="w-16 shrink-0 font-mono text-[11px] text-ink-3">{c.clause_id}</span>
                  <span className="text-small text-ink">{c.title}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="relative overflow-hidden p-6">
          <div aria-hidden className="bg-dots mask-fade-b pointer-events-none absolute inset-x-0 top-0 h-40 opacity-70" />
          {current && (
            <Reveal key={current.clause_id} y={8} className="relative">
              <div className="flex flex-wrap items-center gap-2">
                <DocChip id={current.clause_id} />
                <span className="text-small text-ink-3">{current.document_title} · {current.section}</span>
                {current.precedence === 'override' && <Pill tone="warn">Overrides handbook</Pill>}
              </div>
              <h2 className="font-display mt-4 text-[34px] leading-[1.1] text-ink">{current.title}</h2>
              <p className="mt-4 max-w-prose border-l-2 border-accent/40 pl-4 text-[15.5px] leading-relaxed text-ink-2">{current.text}</p>
              <dl className="mt-5 grid gap-x-6 gap-y-2 border-t border-line pt-4 text-small sm:grid-cols-2">
                <div><dt className="text-caption text-ink-3">Applies to</dt><dd className="text-ink">{current.jurisdictions.includes('*') ? 'All sites' : current.jurisdictions.join(', ')}</dd></div>
                <div><dt className="text-caption text-ink-3">Employee class</dt><dd className="text-ink">{current.employee_classes.length ? current.employee_classes.join(', ').replace('_', '-') : 'All'}</dd></div>
                <div><dt className="text-caption text-ink-3">Effective</dt><dd className="font-mono text-ink">{current.effective_from}{current.effective_to ? ` to ${current.effective_to}` : ' onward'}</dd></div>
                <div><dt className="text-caption text-ink-3">Rules that require it</dt><dd className="font-mono text-ink">{current.rule_ids.join(', ') || '–'}</dd></div>
              </dl>
            </Reveal>
          )}
        </Card>
      </div>
    </div>
  )
}
