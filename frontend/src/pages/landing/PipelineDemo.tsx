import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { BookText, Bot, Check, Cpu, Fingerprint, Pause, Play, RotateCcw, ShieldCheck, UserCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Avatar } from '@/components/fx'
import { cn } from '@/lib/cn'

const STAGES = [
  { label: 'Rules detect', sub: 'R-PUNCH-SPAN fires', icon: Cpu, ms: 2600 },
  { label: 'Policy retrieved', sub: 'BM25 + embeddings, RRF', icon: BookText, ms: 2200 },
  { label: 'Model drafts', sub: 'gpt-oss-20b, strict schema', icon: Bot, ms: 3000 },
  { label: 'Ten gates verify', sub: 'Deterministic harness', icon: ShieldCheck, ms: 3000 },
  { label: 'Manager countersigns', sub: 'One decision, three fixes', icon: UserCheck, ms: 3600 },
]

const GATES = ['Schema', 'Binding', 'Exists', 'Retrieved', 'Quote', 'Allowed', 'Anchored', 'Re-sim', 'Guardrails', 'Facts']
const DRAFT = 'Split the 32.5 h span into two shifts: add OUT Tue 15:29 and IN Wed 07:02, each anchored to a badge event.'

/** Minutes past Tue 00:00 mapped to a percentage of a 2-day track. */
const at = (dayIdx: number, h: number, m: number) => `${((dayIdx * 1440 + h * 60 + m) / 2880) * 100}%`
const span = (a: [number, number, number], b: [number, number, number]) => {
  const s = a[0] * 1440 + a[1] * 60 + a[2]
  const e = b[0] * 1440 + b[1] * 60 + b[2]
  return { left: `${(s / 2880) * 100}%`, width: `${((e - s) / 2880) * 100}%` }
}

function Typewriter({ text, run }: { text: string; run: boolean }) {
  const reduce = useReducedMotion()
  const [n, setN] = useState(reduce ? text.length : 0)
  useEffect(() => {
    if (reduce) return setN(text.length)
    if (!run) return setN(0)
    setN(0)
    const t = setInterval(() => setN((v) => (v >= text.length ? v : v + 2)), 22)
    return () => clearInterval(t)
  }, [run, text, reduce])
  return (
    <span>
      {text.slice(0, n)}
      {run && n < text.length && <span className="ml-px inline-block h-4 w-[2px] translate-y-0.5 animate-blink bg-model" />}
    </span>
  )
}

export function PipelineDemo() {
  const reduce = useReducedMotion()
  const [stage, setStage] = useState(reduce ? 4 : 0)
  const [playing, setPlaying] = useState(!reduce)

  useEffect(() => {
    if (!playing) return
    const t = setTimeout(() => setStage((s) => (s + 1) % STAGES.length), STAGES[stage]!.ms)
    return () => clearTimeout(t)
  }, [stage, playing])

  const on = (n: number) => stage >= n
  const fade = (n: number) => ({ opacity: on(n) ? 1 : 0.18, filter: on(n) ? 'blur(0px)' : 'blur(1.5px)', y: on(n) ? 0 : 6 })
  const fixed = on(4)

  return (
    <div className="relative overflow-hidden rounded-[22px] border border-line bg-surface text-left shadow-[0_40px_100px_-30px_rgb(40_73_214/0.45)]">
      {/* Window chrome */}
      <div className="flex items-center gap-3 border-b border-line bg-surface-2/70 px-4 py-2.5">
        <div className="flex gap-1.5" aria-hidden>
          <span className="size-2.5 rounded-full bg-[#ff5f57]" />
          <span className="size-2.5 rounded-full bg-[#febc2e]" />
          <span className="size-2.5 rounded-full bg-[#28c840]" />
        </div>
        <div className="mx-auto flex items-center gap-2 rounded-md border border-line bg-surface px-3 py-0.5 font-mono text-[11px] text-ink-3">
          <span className="size-1.5 rounded-full bg-ok" /> countersign · exception EX-0007 · live walkthrough
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Pause walkthrough' : 'Play walkthrough'} className="grid size-7 place-items-center rounded-md text-ink-3 hover:bg-surface hover:text-ink">
            {playing ? <Pause size={13} /> : <Play size={13} />}
          </button>
          <button onClick={() => { setStage(0); setPlaying(true) }} aria-label="Restart walkthrough" className="grid size-7 place-items-center rounded-md text-ink-3 hover:bg-surface hover:text-ink">
            <RotateCcw size={13} />
          </button>
        </div>
      </div>

      <div className="grid md:grid-cols-[230px_1fr]">
        {/* Stage rail */}
        <ol className="relative hidden border-r border-line bg-surface-2/40 p-3 md:block" aria-label="Pipeline stages">
          <span aria-hidden className="absolute top-8 bottom-8 left-[27px] w-px bg-line" />
          <motion.span aria-hidden className="bg-brand absolute top-8 bottom-8 left-[27px] w-px origin-top" initial={false} animate={{ scaleY: stage / (STAGES.length - 1) }} transition={{ duration: 0.5 }} />
          {STAGES.map((s, i) => {
            const Icon = s.icon
            const active = i === stage
            const done = i < stage
            return (
              <li key={s.label}>
                <button onClick={() => { setStage(i); setPlaying(false) }} className="relative flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left">
                  {active && <motion.span layoutId="rail-active" className="absolute inset-0 rounded-xl border border-line bg-surface shadow-card" transition={{ type: 'spring', stiffness: 400, damping: 34 }} />}
                  <span className={cn('relative z-10 grid size-8 shrink-0 place-items-center rounded-lg border transition-colors', done ? 'border-ok/30 bg-ok-soft text-ok' : active ? 'bg-brand border-transparent text-white shadow-glow' : 'border-line bg-surface text-ink-3')}>
                    {done ? <Check size={14} strokeWidth={2.5} /> : <Icon size={14} />}
                  </span>
                  <span className="relative z-10 min-w-0">
                    <span className={cn('block text-small font-semibold', active || done ? 'text-ink' : 'text-ink-3')}>{s.label}</span>
                    <span className="block truncate text-[11px] text-ink-3">{s.sub}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ol>

        {/* Canvas */}
        <div className="relative space-y-3 p-4 sm:p-5">
          {/* Exception */}
          <div className="rounded-2xl border border-line bg-surface p-4 shadow-card">
            <div className="flex flex-wrap items-center gap-2">
              <Avatar name="Diego Alvarez" size={30} />
              <div className="min-w-0">
                <div className="text-small font-semibold text-ink">Diego Alvarez</div>
                <div className="text-[11px] text-ink-3">Warehouse associate, Fremont DC</div>
              </div>
              <span className="ml-auto inline-flex items-center gap-1 rounded-md border border-line bg-surface-2 px-1.5 py-px font-mono text-[11px] text-rule">
                <span className="size-1.5 bg-rule" /> R-PUNCH-SPAN
              </span>
              <AnimatePresence mode="wait" initial={false}>
                {fixed ? (
                  <motion.span key="ok" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="rounded-full border border-ok/25 bg-ok-soft px-2 py-px text-[11px] font-semibold text-ok">Countersigned</motion.span>
                ) : (
                  <motion.span key="crit" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="rounded-full border border-crit/25 bg-crit-soft px-2 py-px text-[11px] font-semibold text-crit">Critical</motion.span>
                )}
              </AnimatePresence>
            </div>
            <div className="mt-2.5 text-[15px] font-semibold text-ink">Two shifts joined by missed punches</div>

            {/* Two-day ribbon */}
            <div className="mt-3 space-y-1.5" aria-hidden>
              <div className="flex justify-between font-mono text-[10px] text-ink-3">
                <span>Tue 3 Nov</span>
                <span>Wed 4 Nov</span>
              </div>
              <div className="relative h-7 rounded-lg bg-surface-2">
                <span className="absolute inset-y-0 left-1/2 w-px bg-line-strong" />
                <motion.span
                  className="absolute inset-y-1 rounded-md"
                  style={span([0, 7, 1], [1, 15, 29])}
                  animate={{ opacity: fixed ? 0 : 1, backgroundColor: 'var(--crit-soft)' }}
                >
                  <span className="absolute inset-0 rounded-md border border-crit/40 bg-hatch" />
                  <span className="absolute inset-0 grid place-items-center font-mono text-[10px] font-semibold text-crit">32.5 h recorded span</span>
                </motion.span>
                <motion.span className="absolute inset-y-1 rounded-md bg-ink/80" style={span([0, 7, 1], [0, 15, 29])} animate={{ opacity: fixed ? 1 : 0 }} />
                <motion.span className="absolute inset-y-1 rounded-md bg-ink/80" style={span([1, 7, 2], [1, 15, 29])} animate={{ opacity: fixed ? 1 : 0 }} />
                {[[0, 15, 29], [1, 7, 2]].map(([d, h, m]) => (
                  <motion.span key={`${d}`} className="absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2" style={{ left: at(d!, h!, m!) }} animate={{ scale: on(1) ? 1 : 0.6, opacity: on(1) ? 1 : 0.4 }}>
                    <span className="block size-3 rotate-45 border-2 border-surface bg-ok shadow" />
                    {on(1) && !fixed && <span className="animate-pulse-ring absolute inset-0 rounded-full bg-ok/50" />}
                  </motion.span>
                ))}
                {[[0, 15, 29, 'OUT'], [1, 7, 2, 'IN']].map(([d, h, m, t]) => (
                  <motion.span key={String(t)} className="absolute -top-1 -bottom-1 z-20 w-0.5 -translate-x-1/2 rounded-full" style={{ left: at(d as number, h as number, m as number) }} animate={{ opacity: on(2) ? 1 : 0, backgroundColor: fixed ? 'var(--ink)' : 'var(--model)' }} />
                ))}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10.5px] text-ink-3">
                <span className="flex items-center gap-1"><span className="size-2 rotate-45 bg-ok" /> Badge 15:29, 07:02 (simulated feed)</span>
                <span className="flex items-center gap-1"><span className="h-2.5 w-0.5 bg-model" /> Proposed punch</span>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {['Daily overtime', 'Late meal'].map((s) => (
                <motion.span key={s} className={cn('rounded-full border px-2 py-px text-[11px] font-medium', fixed ? 'border-line text-ink-3 line-through' : 'border-accent/25 bg-accent-soft text-accent')}>
                  {s} · symptom
                </motion.span>
              ))}
            </div>
          </div>

          {/* Retrieval */}
          <motion.div animate={fade(1)} transition={{ duration: 0.4 }} className="grid gap-2 sm:grid-cols-2">
            {[
              ['TA-3.4', 'Implausible spans', 0.92],
              ['TA-3.2', 'Missing punches', 0.78],
            ].map(([id, title, w], k) => (
              <div key={String(id)} className="rounded-xl border border-line bg-surface p-2.5">
                <div className="flex items-center gap-2">
                  <span className="rounded-md border border-model-line px-1.5 font-mono text-[11px] font-semibold text-model">{id}</span>
                  <span className="truncate text-small font-medium text-ink">{title}</span>
                  {k === 0 && <span className="ml-auto text-[10px] font-semibold text-accent">required</span>}
                </div>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-3">
                  <motion.div className="bg-brand h-full rounded-full" animate={{ width: on(1) ? `${(w as number) * 100}%` : '0%' }} transition={{ duration: 0.8, delay: k * 0.15 }} />
                </div>
              </div>
            ))}
          </motion.div>

          {/* Draft */}
          <motion.div animate={fade(2)} transition={{ duration: 0.4 }} className="rounded-xl border border-model-line border-l-[3px] border-l-model bg-model-soft/50 p-3 [border-left-style:dotted]">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-model uppercase">
              <Bot size={12} /> Model draft
            </div>
            <p className="mt-1 min-h-[44px] text-small leading-relaxed text-ink">
              <Typewriter text={DRAFT} run={stage === 2 || on(3)} />
            </p>
            <div className="mt-1 flex items-center gap-1 text-[11px] text-ink-3">
              <Fingerprint size={11} /> cites <span className="font-mono text-model">TA-3.4</span> and <span className="font-mono text-model">TA-3.2</span> with verbatim quotes
            </div>
          </motion.div>

          {/* Gates */}
          <motion.div animate={fade(3)} transition={{ duration: 0.4 }} className="flex flex-wrap gap-1">
            {GATES.map((g, k) => (
              <motion.span
                key={g}
                animate={on(3) ? { backgroundColor: 'var(--ok-soft)', color: 'var(--ok)', borderColor: 'color-mix(in oklab, var(--ok) 30%, transparent)', scale: [0.9, 1.06, 1] } : { backgroundColor: 'var(--surface-2)', color: 'var(--ink-3)', borderColor: 'var(--line)', scale: 1 }}
                transition={{ delay: on(3) && stage === 3 ? k * 0.2 : 0, duration: 0.3 }}
                className="inline-flex h-6 items-center gap-1 rounded-md border px-1.5 font-mono text-[10.5px] font-medium"
              >
                {on(3) ? <Check size={10} strokeWidth={3} /> : null}G{k + 1} <span className="font-sans font-normal">{g}</span>
              </motion.span>
            ))}
          </motion.div>

          {/* Countersign overlay */}
          <AnimatePresence>
            {fixed && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="pointer-events-none absolute right-5 bottom-5 flex items-end gap-3"
              >
                <motion.div initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.5 }} className="glass hidden rounded-xl border border-line px-3 py-2 text-small shadow-overlay sm:block">
                  <div className="font-semibold text-ink">3 exceptions resolved</div>
                  <div className="text-[11px] text-ink-3">23.47 h phantom overtime removed</div>
                </motion.div>
                <motion.div
                  initial={{ scale: 2.2, opacity: 0, rotate: -24 }}
                  animate={{ scale: 1, opacity: 1, rotate: -8 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 16 }}
                  className="relative grid size-[92px] place-items-center rounded-full border-[2.5px] border-accent bg-surface/90 text-accent shadow-glow"
                >
                  <span className="absolute inset-1.5 rounded-full border border-dashed border-accent/60" />
                  <span className="flex flex-col items-center leading-none">
                    <span className="text-[8.5px] font-bold tracking-[0.2em] uppercase">Countersigned</span>
                    <span className="my-1 font-mono text-[20px] font-bold">MC</span>
                    <span className="font-mono text-[9px]">Maya Chen</span>
                  </span>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      <div className="flex items-center gap-2 border-t border-line bg-surface-2/50 px-4 py-2 text-[11px] text-ink-3">
        <span className="font-semibold text-ink-2">{STAGES[stage]!.label}</span>
        <span className="h-3 w-px bg-line-strong" />
        Illustrative walkthrough of a seeded demo case. Sign in below to run the real pipeline.
      </div>
    </div>
  )
}
