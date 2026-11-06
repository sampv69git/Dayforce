import { motion, useReducedMotion } from 'motion/react'
import { AlertCircle, ArrowLeft, ArrowRight, Eye, EyeOff, Fingerprint, KeyRound, Loader2, Lock, ShieldCheck, UserCheck } from 'lucide-react'
import { useState, type FormEvent, type KeyboardEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router'
import { ApiError } from '@/api/client'
import { useAuthConfig } from '@/api/hooks'
import { Logo } from '@/components/brand'
import { Avatar } from '@/components/fx'
import { cn } from '@/lib/cn'
import { homeFor, useSession } from '@/lib/session'

const DEMO_PASSWORD = 'Countersign2026'
const DEMO_ACCOUNTS = [
  { name: 'Maya Chen', email: 'maya.chen@kestrel.example', role: 'Manager, Fremont' },
  { name: 'Arjun Rao', email: 'arjun.rao@kestrel.example', role: 'Payroll admin' },
  { name: 'Diego Alvarez', email: 'diego.alvarez@kestrel.example', role: 'Employee' },
]

/** Only same-site paths are allowed as a post-login destination. */
function safeNext(next: string | null): string | null {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : null
}

export default function Login() {
  const { user, signInWithPassword, sessionEnded } = useSession()
  const config = useAuthConfig()
  const navigate = useNavigate()
  const reduce = useReducedMotion()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [caps, setCaps] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<{ text: string; locked: boolean } | null>(null)

  if (user && !busy) return <Navigate to={next ?? homeFor(user)} replace />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!email.trim() || !password) {
      setError({ text: 'Enter your email and password.', locked: false })
      return
    }
    setBusy(true)
    try {
      const u = await signInWithPassword(email, password)
      navigate(next ?? homeFor(u), { replace: true })
    } catch (err) {
      const api = err instanceof ApiError ? err : null
      const detail = err instanceof Error ? err.message.replace(/^[^:]+:\s*/, '') : 'Sign-in failed'
      setError({ text: api?.status === 422 ? 'Enter a valid email and password.' : detail, locked: api?.status === 429 })
      setPassword('')
    } finally {
      setBusy(false)
    }
  }

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => setCaps(e.getModifierState?.('CapsLock') ?? false)
  const demo = config.data?.demo_login ?? true

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      {/* Brand panel */}
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
            {[
              [Fingerprint, 'Every correction is anchored to evidence and cited policy'],
              [ShieldCheck, 'Ten deterministic gates check each draft before you see it'],
              [UserCheck, 'Nothing changes a timecard without your countersignature'],
            ].map(([Icon, t], i) => {
              const I = Icon as typeof Fingerprint
              return (
                <motion.li key={String(t)} initial={reduce ? false : { opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 + i * 0.1 }} className="flex items-center gap-3">
                  <span className="grid size-8 place-items-center rounded-lg border border-white/15 bg-white/5 text-[#aab4ff]"><I size={15} /></span>
                  {String(t)}
                </motion.li>
              )
            })}
          </ul>
        </div>
        <p className="relative mt-10 text-[12px] text-[#9aa3b5]">Kestrel Logistics is fictional. All people and data are synthetic.</p>
      </aside>

      {/* Form */}
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
          <h1 className="mt-4 text-[28px] leading-9 font-semibold tracking-[-0.02em] text-ink">Sign in</h1>
          <p className="mt-1 text-body text-ink-2">Use your work email and password.</p>

          {sessionEnded && !error && (
            <div role="status" className="mt-5 flex items-start gap-2 rounded-xl border border-warn-line bg-warn-soft px-3.5 py-2.5 text-small text-ink">
              <Lock size={15} className="mt-0.5 shrink-0 text-warn" /> Your session ended. Sign in again to continue.
            </div>
          )}
          {error && (
            <div id="login-error" role="alert" className={cn('mt-5 flex items-start gap-2 rounded-xl border px-3.5 py-2.5 text-small text-ink', error.locked ? 'border-warn-line bg-warn-soft' : 'border-crit/30 bg-crit-soft')}>
              {error.locked ? <Lock size={15} className="mt-0.5 shrink-0 text-warn" /> : <AlertCircle size={15} className="mt-0.5 shrink-0 text-crit" />}
              {error.text}
            </div>
          )}

          <form onSubmit={submit} noValidate className="mt-6 space-y-4" aria-label="Sign in">
            <label className="block">
              <span className="text-small font-medium text-ink">Email</span>
              <input
                type="email"
                name="email"
                autoComplete="username"
                inputMode="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={!!error && !error.locked}
                aria-describedby={error ? 'login-error' : undefined}
                className="mt-1.5 h-11 w-full rounded-xl border border-line-strong bg-surface px-3.5 text-body text-ink shadow-card outline-none transition-shadow placeholder:text-ink-3 focus:border-accent focus:shadow-glow"
                placeholder="name@company.com"
              />
            </label>
            <label className="block">
              <span className="text-small font-medium text-ink">Password</span>
              <span className="relative mt-1.5 block">
                <input
                  type={show ? 'text' : 'password'}
                  name="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyUp={onKey}
                  onKeyDown={onKey}
                  aria-invalid={!!error && !error.locked}
                  aria-describedby={error ? 'login-error' : undefined}
                  className="h-11 w-full rounded-xl border border-line-strong bg-surface pr-11 pl-3.5 text-body text-ink shadow-card outline-none transition-shadow focus:border-accent focus:shadow-glow"
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  aria-label={show ? 'Hide password' : 'Show password'}
                  aria-pressed={show}
                  className="absolute top-1/2 right-1.5 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-ink-3 hover:bg-surface-2 hover:text-ink"
                >
                  {show ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </span>
              {caps && <span className="mt-1.5 block text-caption font-medium text-warn">Caps Lock is on</span>}
            </label>
            <button
              type="submit"
              disabled={busy}
              className="group bg-brand relative flex h-11 w-full items-center justify-center gap-2 overflow-hidden rounded-xl text-[15px] font-semibold text-white shadow-glow transition-transform hover:-translate-y-px disabled:opacity-70"
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />} Sign in
              <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
            </button>
          </form>

          {demo && (
            <section aria-label="Demo accounts" className="mt-8 rounded-2xl border border-line bg-surface p-4 shadow-card">
              <div className="flex items-center justify-between">
                <span className="eyebrow">Synthetic demo accounts</span>
                <span className="rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-[11.5px] text-ink-2">{DEMO_PASSWORD}</span>
              </div>
              <ul className="mt-2.5 space-y-1.5">
                {DEMO_ACCOUNTS.map((a) => (
                  <li key={a.email}>
                    <button
                      type="button"
                      onClick={() => {
                        setEmail(a.email)
                        setPassword(DEMO_PASSWORD)
                        setError(null)
                      }}
                      className="flex w-full items-center gap-3 rounded-xl border border-transparent px-2 py-1.5 text-left transition-colors hover:border-line hover:bg-surface-2"
                    >
                      <Avatar name={a.name} size={30} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-small font-semibold text-ink">Fill in {a.name.split(' ')[0]}'s account</span>
                        <span className="block truncate font-mono text-[11.5px] text-ink-3">{a.email}</span>
                      </span>
                      <span className="text-caption text-ink-3">{a.role}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="mt-3 border-t border-line pt-3 text-caption text-ink-3">
                Prefer one click? <Link to="/#personas" className="font-medium text-accent hover:underline">Choose a persona without a password</Link>.
              </p>
            </section>
          )}
          <p className="mt-6 text-caption text-ink-3">
            Sessions expire automatically and end on sign-out. After {config.data?.lockout_after_attempts ?? 5} failed attempts the account is locked for a few minutes.
          </p>
        </motion.div>
      </main>
    </div>
  )
}
