import type { Money } from '@/api/types'

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const EMPTY = '–'

/** "2026-11-03" -> "Tue 3 Nov" (site-local calendar dates; no time zone shift). */
export function day(iso: string): string {
  const y = Number(iso.slice(0, 4))
  const m = Number(iso.slice(5, 7))
  const d = Number(iso.slice(8, 10))
  const dt = new Date(Date.UTC(y, m - 1, d))
  return `${DOW[dt.getUTCDay()]} ${d} ${MON[m - 1]}`
}

export const weekday = (iso: string) => day(iso).split(' ')[0]

/** "2026-11-03T15:29" -> "15:29" */
export const hm = (local: string) => local.slice(11, 16)

/** "2026-11-03T15:29" -> "Tue 3 Nov, 15:29" */
export const dayTime = (local: string) => `${day(local)}, ${hm(local)}`

export function money(m: Money | null | undefined, opts: { sign?: boolean } = {}): string {
  if (!m) return EMPTY
  const f = new Intl.NumberFormat(m.currency === 'INR' ? 'en-IN' : 'en-US', {
    style: 'currency',
    currency: m.currency,
    maximumFractionDigits: m.currency === 'INR' ? 0 : 2,
    minimumFractionDigits: m.currency === 'INR' ? 0 : 2,
  })
  const s = f.format(Math.abs(m.amount))
  if (!opts.sign) return m.amount < 0 ? `-${s}` : s
  return m.amount > 0.004 ? `+${s}` : m.amount < -0.004 ? `-${s}` : s
}

export function hours(h: number | null | undefined, opts: { sign?: boolean } = {}): string {
  if (h === null || h === undefined) return EMPTY
  const v = Math.round(h * 100) / 100
  const abs = Math.abs(v)
  const s = `${Number.isInteger(abs) ? abs.toFixed(1) : abs.toFixed(2)} h`
  if (!opts.sign) return v < 0 ? `-${s}` : s
  return v > 0 ? `+${s}` : v < 0 ? `-${s}` : s
}

/** Minutes from local midnight of `dateIso` to the local timestamp (wall clock). */
export function minutesFrom(dateIso: string, local: string): number {
  const base = Date.UTC(+dateIso.slice(0, 4), +dateIso.slice(5, 7) - 1, +dateIso.slice(8, 10))
  const t = Date.UTC(
    +local.slice(0, 4),
    +local.slice(5, 7) - 1,
    +local.slice(8, 10),
    +local.slice(11, 13),
    +local.slice(14, 16),
  )
  return (t - base) / 60000
}

export function relativeDuration(ms: number): string {
  if (ms <= 0) return 'passed'
  const totalH = Math.floor(ms / 3_600_000)
  const d = Math.floor(totalH / 24)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  return d > 0 ? `${d}d ${String(totalH % 24).padStart(2, '0')}h` : `${totalH}h ${String(m).padStart(2, '0')}m`
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

export const OP_LABEL: Record<string, string> = {
  add_punch: 'Add punch',
  void_punch: 'Void punch',
  record_premium: 'Record premium',
  approve_overtime: 'Approve worked overtime',
  acknowledge: 'Acknowledge',
  approve_unscheduled: 'Approve unscheduled shift',
  reassign_shift: 'Reassign shift',
  escalate: 'Escalate to payroll',
}

export const EVIDENCE_LABEL: Record<string, string> = {
  badge_exit: 'Badge exit',
  badge_entry: 'Badge entry',
  scanner_activity: 'Scanner activity',
  scheduled_end: 'Scheduled end',
  scheduled_start: 'Scheduled start',
  attestation: 'Employee confirmation',
}

export const FAMILY_LABEL: Record<string, string> = {
  punch_integrity: 'Punches',
  schedule: 'Schedule',
  meal_rest: 'Meals and rest',
  overtime: 'Overtime',
  policy: 'Policy',
  forecast: 'Forecast',
}

export const REASONS: { code: string; label: string; for: ('edit' | 'reject')[] }[] = [
  { code: 'TIME_ADJUSTED', label: 'Time adjusted', for: ['edit'] },
  { code: 'EVIDENCE_PREFERRED', label: 'Different evidence preferred', for: ['edit'] },
  { code: 'EMPLOYEE_CONFIRMED', label: 'Employee confirmed', for: ['edit'] },
  { code: 'INCORRECT_TIME', label: 'Incorrect time', for: ['reject'] },
  { code: 'WRONG_ACTION', label: 'Wrong action', for: ['reject'] },
  { code: 'POLICY_MISAPPLIED', label: 'Policy misapplied', for: ['reject'] },
  { code: 'NEEDS_INVESTIGATION', label: 'Needs investigation', for: ['reject'] },
  { code: 'OTHER', label: 'Other', for: ['edit', 'reject'] },
]
