import { motion, useReducedMotion } from 'motion/react'
import { ArrowLeft, Fingerprint, ShieldCheck, UserCheck } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { ApiError } from '@/api/client'
import { Logo } from '@/components/brand'

/** A readable message for sign-in and registration errors, including an unreachable server. */
export function authErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    if (err.status >= 500) return 'Cannot reach the Countersign server. Make sure the API is running on port 8000, then try again.'
    return err.message.replace(/^[^:]+:\s*/, '') || fallback
  }
  if (err instanceof TypeError) return 'Cannot reach the Countersign server. Make sure the API is running on port 8000, then try again.'
  return fallback
}

const POINTS = [
  [Fingerprint, 'Every correction is anchored to evidence and cited policy'],
  [ShieldCheck, 'Ten deterministic gates check each draft before you see it'],
  [UserCheck, 'Nothing changes a timecard without your countersignature'],
] as const

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  const reduce = useReducedMotion()
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="noise relative hidden overflow-hidden bg-[#0b0d14] p-10 text-white lg:flex lg:flex-col">
        <div aria-hidden className="aurora-blob" style={{ width: '70%', height: '60%', left: '-20%', top: '-20%', background: 'rgb(109 139 255 / 0.32)' }} />
        <div aria-hidden className="aurora-blob" style={{ width: '60%', height: '55%', right: '-20%', bottom: '-15%', background: 'rgb(196 139 255 / 0.25)', animationDelay: '-8s' }} />
        <div aria-hidden className="pointer-events-none absolute inset-0 [background-image:linear-gradient(rgb(255_255_255/0.05)_1px,transparent_1px),linear-gradient(90deg,rgb(255_255_255/0.05)_1px,transparent_1px)] [background-size:44px_44px] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_75%)]" />
        <Link to="/" className="relative flex items-center gap-2.5">
          <Logo size={32} />
          <span className="text-[18px] font-semibold tracking-tight">Countersign</span>
        </Link>
        <div className="relative mt-auto max-w-md">
          <h2 className="text-[38px] leading-[1.1] font-semibold tracking-[-0.03em]">
            The model drafts. The rules verify.{' '}
            <span className="font-display bg-gradient-to-r from-[#9fb0ff] to-[#d7b4ff] bg-clip-text text-transparent italic">You countersign.</span>
          </h2>
          <ul className="mt-8 space-y-3 text-[14.5px] text-[#d5d9e3]">
            {POINTS.map(([Icon, text], i) => (
              <motion.li key={text} initial={reduce ? false : { opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 + i * 0.1 }} className="flex items-center gap-3">
                <span className="grid size-8 place-items-center rounded-lg border border-white/15 bg-white/5 text-[#aab4ff]"><Icon size={15} /></span>
                {text}
              </motion.li>
            ))}
          </ul>
        </div>
        <p className="relative mt-10 text-[12px] text-[#9aa3b5]">Kestrel Logistics is fictional. All people and data are synthetic.</p>
      </aside>
      <main className="relative flex items-center justify-center px-5 py-10">
        <div aria-hidden className="bg-dots mask-radial pointer-events-none absolute inset-0 opacity-70" />
        <motion.div initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="relative w-full max-w-[420px]">
          <Link to="/" className="mb-8 inline-flex items-center gap-1.5 text-small font-medium text-ink-2 hover:text-ink">
            <ArrowLeft size={14} /> Back to overview
          </Link>
          <div className="flex items-center gap-2.5 lg:hidden">
            <Logo size={28} />
            <span className="text-[17px] font-semibold tracking-tight text-ink">Countersign</span>
          </div>
          <h1 className="mt-4 text-[28px] leading-9 font-semibold tracking-[-0.02em] text-ink">{title}</h1>
          <p className="mt-1 text-body text-ink-2">{subtitle}</p>
          {children}
        </motion.div>
      </main>
    </div>
  )
}

export const fieldClass =
  'mt-1.5 h-11 w-full rounded-xl border border-line-strong bg-surface px-3.5 text-body text-ink shadow-card outline-none transition-shadow placeholder:text-ink-3 focus:border-accent focus:shadow-glow'
