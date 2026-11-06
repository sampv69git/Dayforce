import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api, tokenStore, unwrap } from '@/api/client'
import type { User } from '@/api/types'

const USER_KEY = 'countersign.user'
const THEME_KEY = 'countersign.theme'

type Theme = 'light' | 'dark'

interface SessionValue {
  user: User | null
  signIn: (userId: string) => Promise<User>
  signOut: () => void
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
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem(THEME_KEY) as Theme) || 'light')

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    localStorage.setItem(THEME_KEY, theme)
  }, [theme])

  const signIn = useCallback(
    async (userId: string) => {
      const res = await unwrap(api.POST('/api/v1/auth/demo-login', { body: { user_id: userId } }))
      tokenStore.set(res.access_token)
      localStorage.setItem(USER_KEY, JSON.stringify(res.user))
      qc.clear()
      setUser(res.user)
      return res.user
    },
    [qc],
  )

  const signOut = useCallback(() => {
    tokenStore.clear()
    localStorage.removeItem(USER_KEY)
    qc.clear()
    setUser(null)
  }, [qc])

  const value = useMemo(
    () => ({ user, signIn, signOut, theme, toggleTheme: () => setTheme((t) => (t === 'light' ? 'dark' : 'light')) }),
    [user, signIn, signOut, theme],
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
