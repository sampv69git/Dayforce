import { AnimatePresence, motion } from 'motion/react'
import { BadgeCheck, CheckCircle2, Clock, LogOut, Moon, Sun } from 'lucide-react'
import { Aurora, Ring } from '@/components/fx'
import { Logo } from '@/components/brand'
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
  const pending = h?.actions.filter((a) => !a.submitted).length ?? 0
  const maxDay = Math.max(1, ...(h?.days.map((d) => Math.max(d.worked_hours, d.scheduled_hours)) ?? [1]))
  return (
    <div className="relative min-h-dvh overflow-hidden bg-canvas">
      <Aurora className="bottom-auto h-56" />
      <div className="relative mx-auto max-w-[420px] px-4 pt-5 pb-10">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-small font-semibold text-ink"><Logo size={24} /> Countersign</span>
          <div className="flex items-center gap-1">
            <Hatch>Synthetic data</Hatch>
            <button onClick={toggleTheme} aria-label="Toggle theme" className="grid size-9 place-items-center rounded-lg text-ink-3 hover:bg-surface-2">{theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}</button>
            <button onClick={() => { signOut(); navigate('/') }} aria-label="Sign out" className="grid size-9 place-items-center rounded-lg text-ink-3 hover:bg-surface-2"><LogOut size={16} /></button>
          </div>
        </div>

        <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="noise relative mt-5 overflow-hidden rounded-[24px] border border-line bg-surface p-5 shadow-lift">
          <div aria-hidden className="bg-brand absolute -top-16 -right-16 size-48 rounded-full opacity-20 blur-3xl" />
          <div className="relative flex items-center gap-4">
            <Ring value={h ? Math.min(1, h.week_hours / 40) : 0} size={78} stroke={7} label={h ? `${h.week_hours.toFixed(1)} hours recorded this week` : undefined}>
              <div className="text-center leading-none">
                <div className="tabular font-mono text-[17px] font-bold text-ink">{h ? h.week_hours.toFixed(1) : '–'}</div>
                <div className="mt-0.5 text-[9.5px] text-ink-3">of 40 h</div>
              </div>
            </Ring>
            <div className="min-w-0">
              <h1 className="text-[28px] leading-8 font-semibold tracking-tight text-ink">Hi {user?.display_name.split(' ')[0]}</h1>
              {h && <p className="text-small text-ink-2">Week of 2 Nov · <span className="tabular font-medium text-ink">{h.week_hours.toFixed(1)} h</span> recorded so far</p>}
              {h && (
                <span className={cn('mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', pending ? 'bg-accent-soft text-accent' : 'bg-ok-soft text-ok')}>
                  {pending ? <Clock size={11} /> : <CheckCircle2 size={11} />} {pending ? `${pending} to confirm` : 'All confirmed'}
                </span>
              )}
            </div>
          </div>
        </motion.section>

        {q.isLoading && <Skeleton className="mt-6 h-64" />}
        {q.isError && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
        {h && (
          <>
            <div className="eyebrow mt-7 mb-2 !text-ink-2">Action needed ({pending})</div>
            <div className="space-y-3">
              {h.actions.length === 0 && <p className="rounded-card border border-line bg-surface p-4 text-small text-ink-3">Nothing to confirm. Your timecard is complete.</p>}
              {h.actions.map((a) => <ActionCard key={a.exception_id} action={a} />)}
            </div>
            <div className="eyebrow mt-8 mb-2 !text-ink-2">This week</div>
            <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface shadow-card">
              {h.days.map((d, i) => {
                const needs = h.actions.some((a) => a.work_date === d.date && !a.submitted)
                const val = d.worked_hours > 0 ? d.worked_hours : d.scheduled_hours
                return (
                  <li key={d.date} className={cn('relative px-4 py-3 text-body', needs && 'bg-gradient-to-r from-accent-soft to-transparent')}>
                    <div className="flex items-center justify-between">
                      <span className="text-ink">{weekday(d.date)} <span className="text-ink-3">{d.date.slice(8)} Nov</span></span>
                      {needs ? (
                        <span className="text-small font-medium text-accent">needs your confirmation</span>
                      ) : (
                        <span className="tabular font-mono text-small text-ink-2">{d.worked_hours > 0 ? `${d.worked_hours.toFixed(2)} h` : d.scheduled_hours > 0 ? `${d.scheduled_hours.toFixed(1)} h scheduled` : 'off'}</span>
                      )}
                    </div>
                    {val > 0 && (
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
                        <motion.div
                          className={cn('h-full rounded-full', d.worked_hours > 0 ? 'bg-brand' : 'border border-dashed border-accent/60 bg-accent-soft')}
                          initial={{ width: 0 }}
                          animate={{ width: `${(val / maxDay) * 100}%` }}
                          transition={{ duration: 0.7, delay: i * 0.05 }}
                        />
                      </div>
                    )}
                  </li>
                )
              })}
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
      <motion.div initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex items-start gap-3 rounded-card border border-ok/25 bg-gradient-to-r from-ok-soft to-surface p-4 shadow-card">
        <CheckCircle2 size={20} className="mt-0.5 text-ok" />
        <div className="text-small"><div className="font-medium text-ink">{day(action.work_date)} · {action.title}</div><div className="text-ink-3">Confirmation sent. Waiting for your manager.</div></div>
      </motion.div>
    )
  return (
    <motion.div layout className="beam-border relative rounded-[18px] bg-surface p-4 shadow-lift">
      <div className="relative z-10">
      <div className="flex items-center gap-2 text-small font-semibold text-accent"><span className="grid size-6 place-items-center rounded-lg bg-accent-soft"><Clock size={13} /></span> {day(action.work_date)} · {action.title}</div>
      {anchor && action.suggested_time ? (
        <>
          <p className="mt-2 text-[15px] leading-snug text-ink">
            We found a <b>{(EVIDENCE_LABEL[anchor.kind] ?? anchor.kind).toLowerCase()} at {hm(anchor.at)}</b>{anchor.source ? ` (${anchor.source})` : ''}. Is <b>{hm(action.suggested_time)}</b> when you {action.title.toLowerCase().includes('in') && !action.title.toLowerCase().includes('out') ? 'started' : 'left'}?
          </p>
          {anchor && (
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-ok/25 bg-ok-soft px-2 py-1 text-[11.5px] font-medium text-ok">
              <BadgeCheck size={13} /> {EVIDENCE_LABEL[anchor.kind] ?? anchor.kind} {hm(anchor.at)} · strong evidence
            </div>
          )}
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
      </div>
    </motion.div>
  )
}
