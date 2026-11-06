import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useMemo } from 'react'
import type { EvidenceItem, Operation, TimelineDay } from '@/api/types'
import { Tip } from '@/components/ui/primitives'
import { cn } from '@/lib/cn'
import { day, EVIDENCE_LABEL, hm, hours, minutesFrom } from '@/lib/format'

type Kind = 'work' | 'meal' | 'open-end' | 'open-start'
interface Seg {
  key: string
  date: string
  from: number // minutes within the row's day
  to: number
  kind: Kind
  continuesLeft: boolean
  continuesRight: boolean
}
interface Mark {
  id: string
  type: string
  at: string
  source: string
  proposed?: boolean
  voided?: boolean
}

const DAY = 1440
const pct = (m: number) => `${(Math.max(0, Math.min(DAY, m)) / DAY) * 100}%`

function abs(local: string): number {
  return minutesFrom('1970-01-01', local)
}

/** Pair punches into work and meal intervals in absolute minutes, then split them into day rows. */
function buildSegments(marks: Mark[], dates: string[]): Seg[] {
  const ordered = [...marks].filter((m) => !m.voided).sort((a, b) => abs(a.at) - abs(b.at))
  const intervals: { from: number; to: number; kind: Kind }[] = []
  let state: 'off' | 'work' | 'meal' = 'off'
  let since = 0
  for (const m of ordered) {
    const t = abs(m.at)
    if (m.type === 'IN') {
      if (state !== 'off') intervals.push({ from: since, to: since + 150, kind: 'open-end' })
      state = 'work'
      since = t
    } else if (m.type === 'MEAL_START' && state === 'work') {
      intervals.push({ from: since, to: t, kind: 'work' })
      state = 'meal'
      since = t
    } else if (m.type === 'MEAL_END' && state === 'meal') {
      intervals.push({ from: since, to: t, kind: 'meal' })
      state = 'work'
      since = t
    } else if (m.type === 'OUT') {
      if (state === 'off') intervals.push({ from: t - 150, to: t, kind: 'open-start' })
      else intervals.push({ from: since, to: t, kind: state === 'meal' ? 'meal' : 'work' })
      state = 'off'
    }
  }
  if (state !== 'off') intervals.push({ from: since, to: since + 150, kind: 'open-end' })
  const out: Seg[] = []
  for (const iv of intervals) {
    for (const d of dates) {
      const start = abs(`${d}T00:00`)
      const from = Math.max(iv.from, start)
      const to = Math.min(iv.to, start + DAY)
      if (to > from) {
        out.push({
          key: `${iv.kind}-${iv.from}-${d}`,
          date: d,
          from: from - start,
          to: to - start,
          kind: iv.kind,
          continuesLeft: iv.from < start,
          continuesRight: iv.to > start + DAY,
        })
      }
    }
  }
  return out
}

export interface RibbonProps {
  days: TimelineDay[]
  proposed?: Operation[]
  mode?: 'before' | 'after'
  anchors?: string[]
  compact?: boolean
  className?: string
}

export function ShiftRibbon({ days, proposed = [], mode = 'before', anchors = [], compact = false, className }: RibbonProps) {
  const reduce = useReducedMotion()
  const dates = days.map((d) => d.date)
  const recorded: Mark[] = useMemo(() => days.flatMap((d) => d.punches.map((p) => ({ ...p }))), [days])
  const proposedMarks: Mark[] = useMemo(
    () =>
      proposed
        .filter((o) => o.op === 'add_punch' && o.at && o.punch_type)
        .map((o, i) => ({ id: `proposed-${i}`, type: o.punch_type!, at: o.at!, source: 'proposed', proposed: true })),
    [proposed],
  )
  const voidIds = useMemo(() => new Set(proposed.filter((o) => o.op === 'void_punch').map((o) => o.punch_id)), [proposed])
  const effective = useMemo(() => {
    if (mode === 'before') return recorded
    return [...recorded.map((m) => (voidIds.has(m.id) ? { ...m, voided: true } : m)), ...proposedMarks]
  }, [mode, recorded, proposedMarks, voidIds])
  const segs = useMemo(() => buildSegments(effective, dates), [effective, dates])
  const allEvidence = days.flatMap((d) => d.evidence)
  const rowH = compact ? 'h-10' : 'h-14'

  const workedFor = (date: string) => {
    const mins = segs.filter((s) => s.date === date && s.kind === 'work').reduce((a, s) => a + (s.to - s.from), 0)
    return mins > 0 ? mins / 60 : null
  }

  return (
    <div className={cn('select-none', className)} role="img" aria-label={`Timeline of ${days.length} days, ${mode === 'after' ? 'with the proposed correction' : 'as recorded'}`}>
      <div className="flex">
        <div className="w-[108px] shrink-0" />
        <div className="relative mb-1 h-4 flex-1">
          {[0, 3, 6, 9, 12, 15, 18, 21, 24].map((h) => (
            <span
              key={h}
              className="absolute -translate-x-1/2 font-mono text-[10px] text-ink-3 first:translate-x-0 last:-translate-x-full"
              style={{ left: pct(h * 60) }}
            >
              {String(h).padStart(2, '0')}
            </span>
          ))}
        </div>
      </div>
      <div className="divide-y divide-line/70 rounded-md border border-line">
        {days.map((d) => {
          const worked = mode === 'before' ? (d.worked_hours ?? workedFor(d.date)) : workedFor(d.date)
          const rowSegs = segs.filter((s) => s.date === d.date)
          const marks = effective.filter((m) => m.at.slice(0, 10) === d.date && !(m.voided && mode === 'after' && !m.proposed))
          const voided = mode === 'after' ? effective.filter((m) => m.voided && m.at.slice(0, 10) === d.date) : recorded.filter((m) => m.voided && m.at.slice(0, 10) === d.date)
          return (
            <div key={d.date} className="flex items-stretch">
              <div className="flex w-[108px] shrink-0 flex-col justify-center border-r border-line/70 bg-surface-2/50 px-2.5">
                <span className="whitespace-nowrap text-small font-medium text-ink">{day(d.date)}</span>
                <span className="tabular font-mono text-[11px] text-ink-3">{worked ? hours(worked) : 'no shift'}</span>
              </div>
              <div className={cn('relative flex-1 overflow-hidden', rowH)}>
                {[3, 6, 9, 12, 15, 18, 21].map((h) => (
                  <span key={h} aria-hidden className="absolute inset-y-0 w-px bg-line/60" style={{ left: pct(h * 60) }} />
                ))}
                {d.schedules.map((s) => {
                  const from = minutesFrom(d.date, s.start)
                  const to = minutesFrom(d.date, s.end)
                  return (
                    <Tip key={s.id} content={`Scheduled ${hm(s.start)} to ${hm(s.end)}${s.future ? ' (future)' : ''}`}>
                      <span
                        className={cn(
                          'absolute top-1.5 bottom-1.5 rounded-[5px] border border-dashed',
                          s.future ? 'border-accent/50 bg-accent-soft/40' : 'border-ink-3/45 bg-surface-2/60',
                        )}
                        style={{ left: pct(from), width: `calc(${pct(Math.min(to, DAY))} - ${pct(from)})` }}
                      />
                    </Tip>
                  )
                })}
                <AnimatePresence initial={false}>
                  {rowSegs.map((s) => (
                    <motion.span
                      key={s.key}
                      layout={!reduce}
                      initial={reduce ? false : { opacity: 0, scaleY: 0.6 }}
                      animate={{ opacity: 1, scaleY: 1 }}
                      exit={reduce ? { opacity: 0 } : { opacity: 0, scaleY: 0.6 }}
                      transition={{ duration: 0.24, ease: [0.2, 0.8, 0.2, 1] }}
                      className={cn(
                        'absolute',
                        compact ? 'top-3.5 h-3' : 'top-[19px] h-[18px]',
                        s.kind === 'work' && 'bg-ink/85 dark:bg-ink/75',
                        s.kind === 'meal' && 'bg-hatch border-y border-line-strong bg-surface',
                        (s.kind === 'open-end' || s.kind === 'open-start') && 'bg-gradient-to-r from-crit/70 to-transparent',
                        s.kind === 'open-start' && 'bg-gradient-to-l',
                        !s.continuesLeft && 'rounded-l-[4px]',
                        !s.continuesRight && 'rounded-r-[4px]',
                      )}
                      style={{ left: pct(s.from), width: `calc(${pct(s.to)} - ${pct(s.from)})` }}
                    />
                  ))}
                </AnimatePresence>
                {rowSegs.some((s) => s.continuesRight && s.kind === 'work') && (
                  <span className="absolute top-1/2 right-1 -translate-y-1/2 font-mono text-[10px] text-ink-3">continues</span>
                )}
                {marks.map((m) => (
                  <PunchPin key={m.id + mode} mark={m} date={d.date} reduce={!!reduce} />
                ))}
                {voided.map((m) => (
                  <Tip key={`v-${m.id}`} content={`${m.type} ${hm(m.at)} voided`}>
                    <span className="absolute top-2 h-3 w-px -translate-x-1/2 bg-crit/60" style={{ left: pct(minutesFrom(d.date, m.at)) }} />
                  </Tip>
                ))}
                {!compact &&
                  d.evidence.map((e) => <EvidenceTick key={e.id} e={e} date={d.date} highlighted={anchors.includes(e.id)} />)}
              </div>
            </div>
          )
        })}
      </div>
      {!compact && <RibbonLegend hasEvidence={allEvidence.length > 0} hasProposed={proposedMarks.length > 0} />}
    </div>
  )
}

function PunchPin({ mark, date, reduce }: { mark: Mark; date: string; reduce: boolean }) {
  const left = pct(minutesFrom(date, mark.at))
  const isIn = mark.type === 'IN' || mark.type === 'MEAL_END'
  const isMeal = mark.type.startsWith('MEAL')
  const label = mark.proposed ? `Proposed ${mark.type} at ${hm(mark.at)}` : `${mark.type} ${hm(mark.at)} (${mark.source === 'correction' ? 'approved correction' : 'clock'})`
  return (
    <Tip content={label}>
      <motion.span
        initial={mark.proposed && !reduce ? { opacity: 0, y: -6 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: mark.proposed ? 0.15 : 0 }}
        className={cn('absolute z-10 -translate-x-1/2', isIn ? 'top-[7px]' : 'bottom-[7px]')}
        style={{ left }}
        tabIndex={0}
      >
        {mark.proposed ? (
          <span className="flex flex-col items-center">
            <span className="grid size-3 place-items-center rounded-full border-[1.5px] border-dashed border-model bg-model-soft" />
            <span className="mt-px rounded-[3px] bg-model px-1 font-mono text-[9.5px] leading-[13px] font-semibold text-white dark:text-[#0d0f12]">{hm(mark.at)}</span>
          </span>
        ) : (
          <span
            className={cn(
              'block size-2 rotate-45 border',
              isMeal ? 'border-ink-3 bg-surface' : mark.source === 'correction' ? 'border-accent bg-accent' : 'border-ink bg-ink',
            )}
          />
        )}
      </motion.span>
    </Tip>
  )
}

function EvidenceTick({ e, date, highlighted }: { e: EvidenceItem; date: string; highlighted: boolean }) {
  const left = pct(minutesFrom(date, e.at))
  const badge = e.kind.startsWith('badge')
  return (
    <Tip content={`${EVIDENCE_LABEL[e.kind] ?? e.kind} ${hm(e.at)}${e.source ? ` · ${e.source}` : ''} (simulated feed)`}>
      <span
        tabIndex={0}
        className={cn('absolute bottom-0 -translate-x-1/2', badge ? 'h-2.5 w-[3px] rounded-t-sm' : 'mb-0.5 size-1.5 rounded-full', highlighted ? 'bg-model' : badge ? 'bg-accent/70' : 'bg-ink-3/60')}
        style={{ left }}
      />
    </Tip>
  )
}

function RibbonLegend({ hasEvidence, hasProposed }: { hasEvidence: boolean; hasProposed: boolean }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-ink-3">
      <span className="flex items-center gap-1.5"><span className="h-2.5 w-5 rounded-[3px] border border-dashed border-ink-3/50" />Scheduled</span>
      <span className="flex items-center gap-1.5"><span className="h-2.5 w-5 rounded-[3px] bg-ink/85" />Worked</span>
      <span className="flex items-center gap-1.5"><span className="bg-hatch h-2.5 w-5 rounded-[3px] border border-line-strong" />Meal</span>
      <span className="flex items-center gap-1.5"><span className="h-2.5 w-5 rounded-[3px] bg-gradient-to-r from-crit/70 to-transparent" />Missing punch</span>
      <span className="flex items-center gap-1.5"><span className="block size-2 rotate-45 bg-ink" />Punch</span>
      {hasProposed && <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full border-[1.5px] border-dashed border-model" />Proposed</span>}
      {hasEvidence && <span className="flex items-center gap-1.5"><span className="h-2.5 w-[3px] rounded-t-sm bg-accent/70" />Badge (simulated)</span>}
      {hasEvidence && <span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-ink-3/60" />Scanner (simulated)</span>}
    </div>
  )
}

