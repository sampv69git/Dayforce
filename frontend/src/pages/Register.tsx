import { AlertCircle, ArrowRight, Check, Eye, EyeOff, Loader2, UserPlus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router'
import { api, unwrap } from '@/api/client'
import { useAuthConfig } from '@/api/hooks'
import { AuthLayout, authErrorMessage, fieldClass } from '@/components/auth/AuthLayout'
import { cn } from '@/lib/cn'
import { homeFor, useSession } from '@/lib/session'

type Site = 'FRE' | 'AUS' | 'BLR'
const SITES: { code: Site; name: string; rules: string }[] = [
  { code: 'FRE', name: 'Fremont DC', rules: 'California' },
  { code: 'AUS', name: 'Austin DC', rules: 'Texas' },
  { code: 'BLR', name: 'Bengaluru Hub', rules: 'Karnataka' },
]
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export default function Register() {
  const { user } = useSession()
  const config = useAuthConfig()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [site, setSite] = useState<Site>('FRE')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<{ text: string; exists: boolean } | null>(null)

  if (user) return <Navigate to={homeFor(user)} replace />

  const local = email.trim().split('@')[0]?.toLowerCase() ?? ''
  const rules = [
    { ok: password.length >= 10, label: 'At least 10 characters' },
    { ok: /[a-z]/i.test(password) && /\d/.test(password), label: 'A letter and a number' },
    { ok: password.length > 0 && (local.length < 4 || !password.toLowerCase().includes(local)), label: 'Not based on your email' },
  ]
  const strong = rules.every((r) => r.ok)
  const matches = confirm.length > 0 && confirm === password
  const valid = name.trim().length >= 2 && EMAIL_RE.test(email.trim()) && strong && matches

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!valid) {
      setError({ text: 'Complete every field: your name, a valid email, and a password that meets the rules and matches.', exists: false })
      return
    }
    setBusy(true)
    try {
      const created = await unwrap(api.POST('/api/v1/auth/register', { body: { display_name: name, email, password, site } }))
      navigate(`/login?registered=1&email=${encodeURIComponent(created.email)}`, { replace: true })
    } catch (err) {
      const exists = /already exists/i.test(err instanceof Error ? err.message : '')
      setError({ text: authErrorMessage(err, 'Could not create the account.'), exists })
    } finally {
      setBusy(false)
    }
  }

  if (config.data && !config.data.registration) {
    return (
      <AuthLayout title="Registration is closed" subtitle="Accounts on this server are created by an administrator.">
        <Link to="/login" className="bg-brand mt-6 inline-flex h-11 items-center gap-2 rounded-xl px-5 text-[15px] font-semibold text-white shadow-glow">Go to sign in <ArrowRight size={16} /></Link>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Create your account" subtitle="Register once, then sign in with your email and password.">
      {error && (
        <div id="register-error" role="alert" className="mt-5 flex items-start gap-2 rounded-xl border border-crit/30 bg-crit-soft px-3.5 py-2.5 text-small text-ink">
          <AlertCircle size={15} className="mt-0.5 shrink-0 text-crit" />
          <span>
            {error.text} {error.exists && <Link to={`/login?email=${encodeURIComponent(email.trim())}`} className="font-semibold text-accent hover:underline">Sign in</Link>}
          </span>
        </div>
      )}
      <form onSubmit={submit} noValidate className="mt-6 space-y-4" aria-label="Create account">
        <label className="block">
          <span className="text-small font-medium text-ink">Full name</span>
          <input name="name" autoComplete="name" autoFocus value={name} onChange={(e) => setName(e.target.value)} className={fieldClass} placeholder="Alex Morgan" />
        </label>
        <label className="block">
          <span className="text-small font-medium text-ink">Work email</span>
          <input type="email" name="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} className={fieldClass} placeholder="name@company.com" />
        </label>
        <fieldset>
          <legend className="text-small font-medium text-ink">Site you manage</legend>
          <div className="mt-1.5 grid grid-cols-3 gap-2">
            {SITES.map((s) => (
              <label
                key={s.code}
                className={cn(
                  'flex cursor-pointer flex-col rounded-xl border px-3 py-2 shadow-card transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent',
                  site === s.code ? 'border-accent bg-accent-soft' : 'border-line-strong bg-surface hover:border-ink-3',
                )}
              >
                <input type="radio" name="site" value={s.code} checked={site === s.code} onChange={() => setSite(s.code)} className="sr-only" />
                <span className={cn('text-small font-semibold', site === s.code ? 'text-accent' : 'text-ink')}>{s.name}</span>
                <span className="text-caption text-ink-3">{s.rules} rules</span>
              </label>
            ))}
          </div>
        </fieldset>
        <label className="block">
          <span className="text-small font-medium text-ink">Password</span>
          <span className="relative mt-1.5 block">
            <input
              type={show ? 'text' : 'password'}
              name="new-password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-describedby="register-rules"
              className={cn(fieldClass, 'mt-0 pr-11')}
            />
            <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show} className="absolute top-1/2 right-1.5 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-ink-3 hover:bg-surface-2 hover:text-ink">
              {show ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </span>
        </label>
        <ul id="register-rules" className="grid gap-1 text-caption">
          {rules.map((r) => (
            <li key={r.label} className={cn('flex items-center gap-1.5', r.ok ? 'text-ok' : 'text-ink-3')}>
              <Check size={12} className={r.ok ? 'opacity-100' : 'opacity-30'} /> {r.label}
            </li>
          ))}
        </ul>
        <label className="block">
          <span className="text-small font-medium text-ink">Confirm password</span>
          <input type={show ? 'text' : 'password'} name="confirm-password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={fieldClass} />
          {confirm.length > 0 && !matches && <span className="mt-1 block text-caption text-crit">Passwords do not match</span>}
        </label>
        <button type="submit" disabled={busy} className="group bg-brand relative flex h-11 w-full items-center justify-center gap-2 overflow-hidden rounded-xl text-[15px] font-semibold text-white shadow-glow transition-transform hover:-translate-y-px disabled:opacity-70">
          {busy ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />} Create account
          <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
        </button>
      </form>
      <p className="mt-5 text-center text-small text-ink-2">
        Already have an account? <Link to="/login" className="font-semibold text-accent hover:underline">Sign in</Link>
      </p>
      <p className="mt-6 text-caption text-ink-3">New accounts manage the exception queue for one site. Payroll and employee accounts are created by an administrator. All data in this prototype is synthetic.</p>
    </AuthLayout>
  )
}
