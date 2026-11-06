export const LANDING_TOUR_KEY = 'countersign.tour.landing'
export const APP_TOUR_KEY = 'countersign.tour.app'

/** Tours never auto-start under automation, so end-to-end tests see the plain page. */
export function canAutoStart(key: string): boolean {
  if (typeof window === 'undefined') return false
  if ((navigator as Navigator & { webdriver?: boolean }).webdriver) return false
  return localStorage.getItem(key) !== 'done'
}

export function markTourDone(key: string) {
  localStorage.setItem(key, 'done')
}
