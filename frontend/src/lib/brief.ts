/**
 * The four problem areas named in the challenge brief (Use Case 5), mapped to rule families.
 * "Create a timecard exception resolution agent that detects missed punches, overtime risks,
 * schedule conflicts, and policy breaches, then proposes compliant corrections."
 */
export type LensKey = 'punches' | 'overtime' | 'schedule' | 'policy'

export const LENSES: { key: LensKey; label: string; families: string[]; rules: string; tone: string }[] = [
  { key: 'punches', label: 'Missed punches', families: ['punch_integrity'], rules: 'Missing in or out, joined shifts, duplicates, open meals', tone: 'from-brand-1 to-brand-2' },
  { key: 'overtime', label: 'Overtime risks', families: ['overtime', 'forecast'], rules: 'Daily, weekly, seventh day, and a forecast before it is worked', tone: 'from-warn to-[#d6457a]' },
  { key: 'schedule', label: 'Schedule conflicts', families: ['schedule'], rules: 'Overlaps and rest shortfalls in the published schedule, late, early, unscheduled', tone: 'from-brand-3 to-brand-1' },
  { key: 'policy', label: 'Policy breaches', families: ['meal_rest', 'policy'], rules: 'Meal periods, rest between shifts, holiday work, by jurisdiction', tone: 'from-brand-2 to-[#d6457a]' },
]

export function lensOf(family: string): LensKey | null {
  return LENSES.find((l) => l.families.includes(family))?.key ?? null
}
