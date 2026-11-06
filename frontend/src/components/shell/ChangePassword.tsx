import * as Dialog from '@radix-ui/react-dialog'
import { Check, KeyRound, Loader2, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/primitives'
import { cn } from '@/lib/cn'
import { useSession } from '@/lib/session'

const MIN = 10

function checks(pw: string, email?: string | null) {
  return [
    { ok: pw.length >= MIN, label: `At least ${MIN} characters` },
    { ok: /[a-z]/i.test(pw) && /\d/.test(pw), label: 'A letter and a number' },
    { ok: !email || !pw.toLowerCase().includes(email.split('@')[0]!.toLowerCase()), label: 'Not based on your email' },
  ]
}

export function ChangePasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { user, changePassword } = useSession()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const list = checks(next, user?.email)
  const strong = list.every((c) => c.ok)
  const matches = next.length > 0 && next === confirm

  const reset = () => {
    setCurrent('')
    setNext('')
    setConfirm('')
    setError(null)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!strong || !matches) return
    setBusy(true)
    setError(null)
    try {
      await changePassword(current, next)
      toast.success('Password changed. Other sessions were signed out.')
      reset()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/^[^:]+:\s*/, '') : 'Could not change the password')
    } finally {
      setBusy(false)
    }
  }

  const field = 'mt-1.5 h-10 w-full rounded-xl border border-line-strong bg-surface px-3 text-body text-ink outline-none focus:border-accent focus:shadow-glow'
  return (
    <Dialog.Root open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v) }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/30 backdrop-blur-[3px]" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-[min(440px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-dialog border border-line bg-surface p-6 shadow-overlay outline-none">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <span className="bg-brand grid size-10 place-items-center rounded-xl text-white shadow-glow"><KeyRound size={18} /></span>
              <div>
                <Dialog.Title className="text-heading font-semibold text-ink">Change password</Dialog.Title>
                <Dialog.Description className="text-small text-ink-3">{user?.email}</Dialog.Description>
              </div>
            </div>
            <Dialog.Close aria-label="Close" className="grid size-8 place-items-center rounded-lg text-ink-3 hover:bg-surface-2 hover:text-ink"><X size={15} /></Dialog.Close>
          </div>
          <form onSubmit={submit} className="mt-5 space-y-3.5">
            <label className="block text-small font-medium text-ink">
              Current password
              <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className={field} />
            </label>
            <label className="block text-small font-medium text-ink">
              New password
              <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} className={field} aria-describedby="pw-rules" />
            </label>
            <ul id="pw-rules" className="grid gap-1 text-caption">
              {list.map((c) => (
                <li key={c.label} className={cn('flex items-center gap-1.5', c.ok ? 'text-ok' : 'text-ink-3')}>
                  <Check size={12} className={c.ok ? 'opacity-100' : 'opacity-30'} /> {c.label}
                </li>
              ))}
            </ul>
            <label className="block text-small font-medium text-ink">
              Confirm new password
              <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={field} />
              {confirm.length > 0 && !matches && <span className="mt-1 block text-caption text-crit">Passwords do not match</span>}
            </label>
            {error && <p role="alert" className="rounded-lg border border-crit/30 bg-crit-soft px-3 py-2 text-small text-ink">{error}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <Dialog.Close asChild><Button type="button" variant="ghost">Cancel</Button></Dialog.Close>
              <Button type="submit" variant="primary" disabled={!current || !strong || !matches || busy}>
                {busy && <Loader2 size={14} className="animate-spin" />} Update password
              </Button>
            </div>
            <p className="text-caption text-ink-3">Every other session is signed out when the password changes.</p>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
