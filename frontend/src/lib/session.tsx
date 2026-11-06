import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api, tokenStore, UNAUTHORIZED_EVENT, unwrap } from '@/api/client'
import type { TokenResponse, User } from '@/api/types'

const USER_KEY = 'countersign.user'
const THEME_KEY = 'countersign.theme'

type Theme = 'light' | 'dark'

interface SessionValue {
  user: User | null
  /** Demo persona sign-in (when enabled on the server). */
  signIn: (userId: string) => Promise<User>
  /** Email and password sign-in. */
  signInWithPassword: (email: string, password: string) => Promise<User>
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>
  /** Ends the session on the server (the token is revoked) and clears it locally. */
  signOut: () => void
  /** Set when the server rejected the session (expired, revoked, or password changed). */
  sessionEnded: boolean
  /** Set when the user signed out on purpose, so protected routes send them home, not to sign-in. */
  signedOut: boolean
  theme: Theme
  toggleTheme: () => void
}

const SessionContext = createContext<SessionValue | null>(null)

function readUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw && tokenStore.get() ? (JSON.parse(raw) as User) : null
  } catch {
    return null
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const [user, setUser] = useState<User | null>(readUser)
  const [sessionEnded, setSessionEnded] = useState(false)
  const [signedOut, setSignedOut] = useState(false)
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem(THEME_KEY) as Theme) || 'light')

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    localStorage.setItem(THEME_KEY, theme)
  }, [theme])

  const accept = useCallback(
    (res: TokenResponse) => {
      tokenStore.set(res.access_token)
      localStorage.setItem(USER_KEY, JSON.stringify(res.user))
      qc.clear()
      setSessionEnded(false)
      setSignedOut(false)
      setUser(res.user)
      return res.user
    },
    [qc],
  )

  const clearLocal = useCallback(() => {
    tokenStore.clear()
    localStorage.removeItem(USER_KEY)
    qc.clear()
    setUser(null)
  }, [qc])

  // A 401 from any request means the server no longer accepts this session.
  useEffect(() => {
    const onUnauthorized = () => {
      if (!localStorage.getItem(USER_KEY)) return
      clearLocal()
      setSessionEnded(true)
    }
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
  }, [clearLocal])

  const signIn = useCallback(
    async (userId: string) => accept(await unwrap(api.POST('/api/v1/auth/demo-login', { body: { user_id: userId } }))),
    [accept],
  )

  const signInWithPassword = useCallback(
    async (email: string, password: string) => accept(await unwrap(api.POST('/api/v1/auth/login', { body: { email, password } }))),
    [accept],
  )

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      accept(await unwrap(api.POST('/api/v1/auth/password', { body: { current_password: currentPassword, new_password: newPassword } })))
    },
    [accept],
  )

  const signOut = useCallback(() => {
    const token = tokenStore.get()
    if (token) void api.POST('/api/v1/auth/logout', { headers: { Authorization: `Bearer ${token}` } }).catch(() => undefined)
    setSignedOut(true)
    clearLocal()
  }, [clearLocal])

  const value = useMemo(
    () => ({
      user,
      signIn,
      signInWithPassword,
      changePassword,
      signOut,
      sessionEnded,
      signedOut,
      theme,
      toggleTheme: () => setTheme((t) => (t === 'light' ? 'dark' : 'light')),
    }),
    [user, signIn, signInWithPassword, changePassword, signOut, sessionEnded, signedOut, theme],
  )
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession() {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used inside SessionProvider')
  return ctx
}

export function homeFor(user: User): string {
  if (user.role === 'employee') return '/me'
  if (user.role === 'payroll_admin') return '/payroll'
  return '/queue'
}
