import { render, screen } from '@testing-library/react'
import { GateStrip, PayDelta } from '@/components/domain/badges'
import { ShiftRibbon } from '@/components/domain/ShiftRibbon'
import { TooltipProvider } from '@/components/ui/primitives'
import { draftSchema } from '@/api/zod'
import type { GateResult } from '@/api/types'

const gates: GateResult[] = Array.from({ length: 10 }, (_, i) => ({
  id: `G${i + 1}`,
  name: `Gate ${i + 1}`,
  status: i === 4 ? 'fail' : 'pass',
  detail: i === 4 ? 'quote not found verbatim in TA-3.2' : 'ok',
}))

const wrap = (ui: React.ReactNode) => render(<TooltipProvider>{ui}</TooltipProvider>)

describe('GateStrip', () => {
  it('renders every gate and announces failures', () => {
    wrap(<GateStrip gates={gates} animate={false} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(10)
    expect(screen.getByText('1 gate(s) failed')).toBeInTheDocument()
  })
})

describe('PayDelta', () => {
  it('shows signed deltas and recovered shifts', () => {
    const before = { regular_hours: 24, overtime_hours: 0, double_time_hours: 0, premium_hours: 0, cost: { amount: 640.8, currency: 'USD' as const }, unpaid_shifts: 1 }
    const after = { ...before, regular_hours: 31.95, cost: { amount: 855.45, currency: 'USD' as const }, unpaid_shifts: 0 }
    wrap(<PayDelta before={before} after={after} />)
    expect(screen.getByText('+7.95 h')).toBeInTheDocument()
    expect(screen.getByText('+$214.65')).toBeInTheDocument()
    expect(screen.getByText('1 unpaid shift(s) recovered')).toBeInTheDocument()
  })
})

describe('ShiftRibbon', () => {
  it('splits a span crossing midnight into two day rows', () => {
    const days = [
      { date: '2026-11-03', schedules: [], evidence: [], worked_hours: null, punches: [{ id: 'P1', type: 'IN', at: '2026-11-03T07:01', source: 'clock', voided: false }] },
      { date: '2026-11-04', schedules: [], evidence: [], worked_hours: null, punches: [{ id: 'P2', type: 'OUT', at: '2026-11-04T15:29', source: 'clock', voided: false }] },
    ]
    wrap(<ShiftRibbon days={days} />)
    expect(screen.getByRole('img', { name: /Timeline of 2 days/ })).toBeInTheDocument()
    expect(screen.getByText('continues')).toBeInTheDocument()
  })
})

describe('draftSchema (UI boundary validation)', () => {
  it('rejects a draft whose gate report is incomplete', () => {
    const bad = { id: 'R', exception_id: 'E', route: 'suggest', validation: { passed: true, attempt: 1, gates: gates.slice(0, 3) }, resolution: null, evidence_strength: { score: 1, level: 'high' } }
    expect(() => draftSchema.parse(bad)).toThrow()
  })
})
