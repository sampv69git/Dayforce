import { CheckCircle2, ChevronRight, Link2, ShieldCheck, XCircle } from 'lucide-react'
import { motion } from 'motion/react'
import { PageHeader } from '@/components/fx'
import { Fragment, useState } from 'react'
import { useAudit, useVerifyAudit } from '@/api/hooks'
import { Button, Card, ErrorState, Skeleton } from '@/components/ui/primitives'
import { cn } from '@/lib/cn'

export default function Audit() {
  const q = useAudit()
  const verify = useVerifyAudit()
  const [open, setOpen] = useState<number | null>(null)
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />
  return (
    <div className="mx-auto max-w-[1280px] space-y-5 p-6">
      <PageHeader
        icon={<Link2 size={22} />}
        eyebrow="Integrity"
        title="Audit chain"
        description="Every detection run, draft, decision, attestation, and setting change, appended in the same transaction. Each event hashes the previous one (SHA-256), so any edit breaks the chain."
        actions={<Button variant="primary" size="lg" onClick={() => verify.mutate()} disabled={verify.isPending}><Link2 size={14} className={verify.isPending ? 'animate-spin' : ''} /> Verify chain</Button>}
      >
        {verify.data && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={cn('flex items-center gap-3 rounded-xl border px-4 py-3 text-small font-medium', verify.data.intact ? 'border-ok/25 bg-ok-soft text-ok' : 'border-crit/25 bg-crit-soft text-crit')}>
            <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 14 }}>{verify.data.intact ? <CheckCircle2 size={20} /> : <XCircle size={20} />}</motion.span>
            {verify.data.intact ? `Chain intact: ${verify.data.events_checked} events verified, every hash recomputed from its predecessor.` : `Broken at event ${verify.data.first_broken_seq}`}
          </motion.div>
        )}
        {q.data && q.data.length > 0 && (
          <div className="mt-4 flex items-center gap-1.5 overflow-x-auto rounded-lg pb-1 scrollbar-thin" role="region" tabIndex={0} aria-label="Most recent chain links">
            {q.data.slice(0, 7).map((e, i, arr) => (
              <div key={e.seq} className="flex shrink-0 items-center gap-1.5">
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="w-[132px] rounded-xl border border-line bg-surface p-2.5 shadow-card">
                  <div className="flex items-center justify-between font-mono text-[11px]"><span className="font-semibold text-ink">#{e.seq}</span>{verify.data?.intact && <ShieldCheck size={12} className="text-ok" />}</div>
                  <div className="mt-0.5 truncate font-mono text-[10.5px] text-ink-2">{e.event_type}</div>
                  <div className="mt-1.5 truncate rounded-md bg-model-soft px-1.5 font-mono text-[10.5px] text-model">{e.hash.slice(0, 10)}</div>
                </motion.div>
                {i < arr.length - 1 && <span className="flex items-center text-ink-3"><span className="h-px w-3 bg-line-strong" /><Link2 size={11} /><span className="h-px w-3 bg-line-strong" /></span>}
              </div>
            ))}
          </div>
        )}
      </PageHeader>
      <Card className="overflow-hidden">
        {q.isLoading ? <div className="p-4"><Skeleton className="h-96" /></div> : (
          <table className="w-full text-small">
            <thead>
              <tr className="border-b border-line bg-surface-2/60 text-caption text-ink-3">
                <th className="w-8" />
                <th className="px-3 py-2 text-left font-medium">Seq</th>
                <th className="px-3 py-2 text-left font-medium">Time (UTC)</th>
                <th className="px-3 py-2 text-left font-medium">Actor</th>
                <th className="px-3 py-2 text-left font-medium">Event</th>
                <th className="px-3 py-2 text-left font-medium">Entity</th>
                <th className="px-3 py-2 text-left font-medium">Hash</th>
              </tr>
            </thead>
            <tbody>
              {q.data?.map((e) => (
                <Fragment key={e.seq}>
                  <tr className="cursor-pointer border-b border-line/70 hover:bg-surface-2/60" onClick={() => setOpen(open === e.seq ? null : e.seq)}>
                    <td className="pl-3"><ChevronRight size={13} className={cn('text-ink-3 transition-transform', open === e.seq && 'rotate-90')} /></td>
                    <td className="tabular px-3 py-2 font-mono text-ink-2">{e.seq}</td>
                    <td className="px-3 py-2 font-mono text-[12px] text-ink-2">{e.occurred_at.slice(0, 19).replace('T', ' ')}</td>
                    <td className="px-3 py-2 text-ink">{e.actor_id} <span className="text-caption text-ink-3">{e.actor_role}</span></td>
                    <td className="px-3 py-2 font-mono text-[12px] text-ink">{e.event_type}</td>
                    <td className="px-3 py-2 font-mono text-[12px] text-ink-2">{e.entity_id}</td>
                    <td className="px-3 py-2 font-mono text-[11px] text-ink-3">{e.hash.slice(0, 12)}… <span className="text-ink-3">← {e.prev_hash.slice(0, 6)}</span></td>
                  </tr>
                  {open === e.seq && (
                    <tr className="border-b border-line/70 bg-surface-2/40">
                      <td colSpan={7} className="px-6 py-3"><pre className="max-h-80 overflow-auto font-mono text-[11.5px] whitespace-pre-wrap text-ink-2 scrollbar-thin">{JSON.stringify(e.payload, null, 2)}</pre></td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
