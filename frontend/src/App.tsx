import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router'
import { Toaster } from 'sonner'
import { ExceptionPanel } from '@/components/domain/ExceptionPanel'
import { AppShell } from '@/components/shell/AppShell'
import { Skeleton, TooltipProvider } from '@/components/ui/primitives'
import { homeFor, SessionProvider, useSession } from '@/lib/session'
import { Queue } from '@/pages/Queue'

const Landing = lazy(() => import('@/pages/Landing').then((m) => ({ default: m.Landing })))
const Forecast = lazy(() => import('@/pages/Forecast'))
const Inspector = lazy(() => import('@/pages/Inspector'))
const Outcomes = lazy(() => import('@/pages/Outcomes'))
const Evaluation = lazy(() => import('@/pages/Evaluation'))
const Policies = lazy(() => import('@/pages/Policies'))
const Payroll = lazy(() => import('@/pages/Payroll'))
const Audit = lazy(() => import('@/pages/Audit'))
const TimecardPage = lazy(() => import('@/pages/TimecardPage'))
const Me = lazy(() => import('@/pages/Me'))

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 15_000, refetchOnWindowFocus: false, retry: 1 } },
})

function Guard({ roles, children }: { roles?: string[]; children: ReactNode }) {
  const { user } = useSession()
  if (!user) return <Navigate to="/" replace />
  if (roles && !roles.includes(user.role)) return <Navigate to={homeFor(user)} replace />
  return <>{children}</>
}

function Home() {
  const { user } = useSession()
  return user ? <Navigate to={homeFor(user)} replace /> : <Landing />
}

function ExceptionPage() {
  const { id } = useParams()
  return (
    <div className="mx-auto max-w-5xl">
      <ExceptionPanel id={id!} full />
    </div>
  )
}

const Fallback = () => (
  <div className="space-y-3 p-6">
    <Skeleton className="h-7 w-64" />
    <Skeleton className="h-64 w-full" />
  </div>
)

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <TooltipProvider>
          <BrowserRouter>
            <Suspense fallback={<Fallback />}>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/me" element={<Guard roles={['employee']}><Me /></Guard>} />
                <Route element={<Guard roles={['manager', 'payroll_admin']}><AppShell /></Guard>}>
                  <Route path="/queue" element={<Queue />} />
                  <Route path="/exceptions/:id" element={<ExceptionPage />} />
                  <Route path="/forecast" element={<Forecast />} />
                  <Route path="/timecards/:employeeId" element={<TimecardPage />} />
                  <Route path="/inspector" element={<Inspector />} />
                  <Route path="/inspector/:runId" element={<Inspector />} />
                  <Route path="/outcomes" element={<Outcomes />} />
                  <Route path="/evaluation" element={<Evaluation />} />
                  <Route path="/policies" element={<Policies />} />
                  <Route path="/payroll" element={<Guard roles={['payroll_admin']}><Payroll /></Guard>} />
                  <Route path="/audit" element={<Guard roles={['payroll_admin']}><Audit /></Guard>} />
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
          <Toaster position="bottom-right" toastOptions={{ className: '!rounded-card !border-line !bg-surface !text-ink !text-small' }} />
        </TooltipProvider>
      </SessionProvider>
    </QueryClientProvider>
  )
}
