import { AnimatePresence, motion } from 'motion/react'
import { CheckCircle2, Clock, LogOut, Moon, Sun } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { useAttest, useMyActions } from '@/api/hooks'
import type { EmployeeAction } from '@/api/types'
import { Button, ErrorState, Hatch, Skeleton } from '@/components/ui/primitives'
import { cn } from '@/lib/cn'
import { day, EVIDENCE_LABEL, hm, weekday } from '@/lib/format'
import { useSession } from '@/lib/session'

export default function Me() {
  const q = useMyActions()
  const { user, signOut, theme, toggleTheme } = useSession()
  const navigate = useNavigate()
  const h = q.data
  return (
    <div className="min-h-dvh bg-canvas">
      <div className="mx-auto max-w-[420px] px-4 pt-5 pb-10">
        <div className="flex items-center justify-between">
          <Hatch>Synthetic data</Hatch>
          <div className="flex items-center gap-1">
            <button onClick={toggleTheme} aria-label="Toggle theme" className="grid size-9 place-items-center rounded-md text-ink-3 hover:bg-surface-2">{theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}</button>
            <button onClick={() => { signOut(); navigate('/') }} aria-label="Sign out" className="grid size-9 place-items-center rounded-md text-ink-3 hover:bg-surface-2"><LogOut size={16} /></button>
          </div>
        </div>
        <h1 className="mt-6 text-[26px] font-semibold tracking-tight text-ink">Hi {user?.display_name.split(' ')[0]}</h1>
        {h && <p className="text-body text-ink-2">Week of 2 Nov · <span className="tabular font-medium text-ink">{h.week_hours.toFixed(1)} h</span> recorded so far</p>}
        {q.isLoading && <Skeleton className="mt-6 h-64" />}
        {q.isError && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
        {h && (
          <>
            <div className="eyebrow mt-7 mb-2">Action needed ({h.actions.filter((a) => !a.submitted).length})</div>
            <div className="space-y-3">
              {h.actions.length === 0 && <p className="rounded-card border border-line bg-surface p-4 text-small text-ink-3">Nothing to confirm. Your timecard is complete.</p>}
              {h.actions.map((a) => <ActionCard key={a.exception_id} action={a} />)}
            </div>
            <div className="eyebrow mt-8 mb-2">This week</div>
            <ul className="divide-y divide-line rounded-card border border-line bg-surface">
              {h.days.map((d) => (
                <li key={d.date} className="flex items-center justify-between px-4 py-2.5 text-body">
                  <span className="text-ink">{weekday(d.date)} <span className="text-ink-3">{d.date.slice(8)} Nov</span></span>
                  {h.actions.some((a) => a.work_date === d.date && !a.submitted) ? (
                    <span className="text-small font-medium text-accent">needs your confirmation</span>
                  ) : (
                    <span className="tabular font-mono text-small text-ink-2">{d.worked_hours > 0 ? `${d.worked_hours.toFixed(2)} h` : d.scheduled_hours > 0 ? `${d.scheduled_hours.toFixed(1)} h scheduled` : 'off'}</span>
                  )}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-caption text-ink-3">Your manager approves every change to your timecard. Notes you write are shared with your manager as written.</p>
          </>
        )}
      </div>
    </div>
  )
}

function ActionCard({ action }: { action: EmployeeAction }) {
  const attest = useAttest()
  const [custom, setCustom] = useState(false)
  const [time, setTime] = useState(action.suggested_time ?? '')
  const [note, setNote] = useState('')
  const anchor = action.evidence.find((e) => e.kind.startsWith('badge')) ?? action.evidence[0]
  const submit = async (confirmed: string) => {
    try {
      const res = await attest.mutateAsync({ exception_id: action.exception_id, confirmed_at: confirmed, note: note || null })
      toast.success(res.flags.length ? 'Sent to your manager. Your note was flagged for review.' : 'Sent to your manager for approval.')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }
  if (action.submitted)
    return (
      <div className="flex items-start gap-3 rounded-card border border-line bg-surface p-4">
        <CheckCircle2 size={18} className="mt-0.5 text-ok" />
        <div className="text-small"><div className="font-medium text-ink">{day(action.work_date)} · {action.title}</div><div className="text-ink-3">Confirmation sent. Waiting for your manager.</div></div>
      </div>
    )
  return (
    <motion.div layout className="rounded-card border border-accent/30 bg-surface p-4 shadow-[0_1px_0_var(--line)]">
      <div className="flex items-center gap-2 text-small font-semibold text-accent"><Clock size={14} /> {day(action.work_date)} · {action.title}</div>
      {anchor && action.suggested_time ? (
        <>
          <p className="mt-2 text-[15px] leading-snug text-ink">
            We found a <b>{(EVIDENCE_LABEL[anchor.kind] ?? anchor.kind).toLowerCase()} at {hm(anchor.at)}</b>{anchor.source ? ` (${anchor.source})` : ''}. Is <b>{hm(action.suggested_time)}</b> when you {action.title.toLowerCase().includes('in') && !action.title.toLowerCase().includes('out') ? 'started' : 'left'}?
          </p>
          <p className="mt-1 text-caption text-ink-3">Badge and scanner data are simulated in this prototype.</p>
        </>
      ) : (
        <p className="mt-2 text-[15px] text-ink">{action.summary}</p>
      )}
      <AnimatePresence initial={false}>
        {custom && (
          <motion.label initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="mt-3 flex flex-col gap-1 overflow-hidden text-caption font-medium text-ink-2">
            Time you {action.title.toLowerCase().includes('out') ? 'left' : 'started'}
            <input type="datetime-local" value={time} onChange={(e) => setTime(e.target.value)} className="h-11 rounded-control border border-line-strong bg-surface px-3 font-mono text-body text-ink outline-none focus:border-accent" />
          </motion.label>
        )}
      </AnimatePresence>
      <label className="mt-3 flex flex-col gap-1 text-caption font-medium text-ink-2">
        Add a note (optional)
        <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={2} className="rounded-control border border-line-strong bg-surface p-2.5 text-body text-ink outline-none focus:border-accent" />
        <span className="self-end font-mono text-[10.5px] text-ink-3">{note.length}/500</span>
      </label>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {!custom ? (
          <>
            <Button size="lg" variant="primary" disabled={!action.suggested_time || attest.isPending} onClick={() => submit(action.suggested_time!)}>Yes, {action.suggested_time ? hm(action.suggested_time) : ''}</Button>
            <Button size="lg" onClick={() => setCustom(true)}>Different time</Button>
          </>
        ) : (
          <>
            <Button size="lg" variant="primary" disabled={!time || attest.isPending} onClick={() => submit(time)}>Send {time ? hm(time) : ''}</Button>
            <Button size="lg" variant="ghost" onClick={() => setCustom(false)}>Back</Button>
          </>
        )}
      </div>
      <p className={cn('mt-3 text-caption text-ink-3')}>Your manager approves every change.</p>
    </motion.div>
  )
}
