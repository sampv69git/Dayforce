import { AlertCircle, ArrowRight, CheckCircle2, Eye, EyeOff, KeyRound, Loader2, Lock, UserPlus } from 'lucide-react'
import { useState, type FormEvent, type KeyboardEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router'
import { ApiError } from '@/api/client'
import { useAuthConfig } from '@/api/hooks'
import { AuthLayout, authErrorMessage, fieldClass } from '@/components/auth/AuthLayout'
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
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const registered = params.get('registered') === '1'
  const [email, setEmail] = useState(params.get('email') ?? '')
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
      const status = err instanceof ApiError ? err.status : 0
      setError({ text: status === 422 ? 'Enter a valid email and password.' : authErrorMessage(err, 'Sign-in failed.'), locked: status === 429 })
      setPassword('')
    } finally {
      setBusy(false)
    }
  }

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => setCaps(e.getModifierState?.('CapsLock') ?? false)
  const demo = config.data?.demo_login ?? true
  const canRegister = config.data?.registration ?? true

  return (
    <AuthLayout title="Sign in" subtitle="Use the email and password you registered with.">
      {registered && !error && (
        <div role="status" className="mt-5 flex items-start gap-2 rounded-xl border border-ok/30 bg-ok-soft px-3.5 py-2.5 text-small text-ink">
          <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-ok" /> Account created. Sign in with your password to continue.
        </div>
      )}
      {sessionEnded && !error && !registered && (
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
            autoFocus={!registered}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={!!error && !error.locked}
            aria-describedby={error ? 'login-error' : undefined}
            className={fieldClass}
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
              autoFocus={registered}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyUp={onKey}
              onKeyDown={onKey}
              aria-invalid={!!error && !error.locked}
              aria-describedby={error ? 'login-error' : undefined}
              className={cn(fieldClass, 'mt-0 pr-11')}
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

      {canRegister && (
        <Link
          to="/register"
          className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-line-strong bg-surface text-[15px] font-semibold text-ink shadow-card transition-colors hover:border-ink-3"
        >
          <UserPlus size={16} className="text-accent" /> New here? Create an account
        </Link>
      )}

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
    </AuthLayout>
  )
}
