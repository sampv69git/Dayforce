import { day, dayTime, hours, minutesFrom, money, relativeDuration } from '@/lib/format'

describe('format', () => {
  it('formats site-local dates without time zone drift', () => {
    expect(day('2026-11-03')).toBe('Tue 3 Nov')
    expect(dayTime('2026-11-04T07:02')).toBe('Wed 4 Nov, 07:02')
  })
  it('formats money with sign and currency', () => {
    expect(money({ amount: -906.91, currency: 'USD' }, { sign: true })).toBe('-$906.91')
    expect(money({ amount: 18600, currency: 'INR' })).toBe('₹18,600')
  })
  it('formats hours', () => {
    expect(hours(8)).toBe('8.0 h')
    expect(hours(-23.47, { sign: true })).toBe('-23.47 h')
  })
  it('computes minutes across midnight for spans', () => {
    expect(minutesFrom('2026-11-03', '2026-11-04T07:02')).toBe(24 * 60 + 7 * 60 + 2)
  })
  it('renders countdowns', () => {
    expect(relativeDuration(73 * 3600e3)).toBe('3d 01h')
    expect(relativeDuration(-1)).toBe('passed')
  })
})
