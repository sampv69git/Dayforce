import * as Dropdown from '@radix-ui/react-dropdown-menu'
import { Command } from 'cmdk'
import { motion, useReducedMotion } from 'motion/react'
import {
  Activity,
  ArrowRight,
  BookText,
  CalendarClock,
  ChevronDown,
  CircleGauge,
  Compass,
  CornerDownLeft,
  FlaskConical,
  Inbox,
  KeyRound,
  Link2,
  LogOut,
  Microscope,
  Moon,
  Palette as PaletteIcon,
  Search,
  ShieldAlert,
  Sun,
  Timer,
  Users,
} from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { usePayPeriod, useProvider, useQueue, useSwitchProvider } from '@/api/hooks'
import { Avatar } from '@/components/fx'
import { ChangePasswordDialog } from '@/components/shell/ChangePassword'
import { Tour, type TourStep } from '@/components/tour/Tour'
import { APP_TOUR_KEY, canAutoStart, markTourDone } from '@/lib/tour'
import { Dot, Hatch, Kbd, Tip } from '@/components/ui/primitives'
import { cn } from '@/lib/cn'
import { relativeDuration } from '@/lib/format'
import { useSession } from '@/lib/session'
import { Logo } from '@/components/brand'

function Wordmark() {
  return (
    <div className="flex items-center gap-2.5 px-1.5">
      <div className="relative">
        <span aria-hidden className="bg-brand absolute inset-0 rounded-[9px] opacity-60 blur-md" />
        <span className="relative block"><Logo size={30} /></span>
      </div>
      <div className="leading-tight">
        <div className="text-[15px] font-semibold tracking-tight text-ink">Countersign</div>
        <div className="text-[10.5px] text-ink-3">Kestrel Logistics (fictional)</div>
      </div>
    </div>
  )
}

function NavItem({ to, icon, label, count, tone = 'neutral', tour }: { to: string; icon: ReactNode; label: string; count?: number; tone?: 'neutral' | 'crit'; tour?: string }) {
  const reduce = useReducedMotion()
  return (
    <NavLink to={to} data-tour={tour} className="group relative flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-small font-medium outline-none">
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span
              layoutId="nav-active"
              className="absolute inset-0 rounded-lg border border-line bg-surface shadow-card"
              transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 36 }}
            >
              <span className="bg-brand absolute top-2 bottom-2 -left-px w-[3px] rounded-full" />
            </motion.span>
          )}
          <span className={cn('relative z-10 transition-colors', isActive ? 'text-accent' : 'text-ink-3 group-hover:text-ink-2')}>{icon}</span>
          <span className={cn('relative z-10 flex-1 transition-colors', isActive ? 'text-ink' : 'text-ink-2 group-hover:text-ink')}>{label}</span>
          {count !== undefined && count > 0 && (
            <span className={cn('tabular relative z-10 min-w-5 rounded-full px-1.5 text-center text-[11px] font-semibold', tone === 'crit' ? 'bg-crit-soft text-crit' : isActive ? 'bg-accent-soft text-accent' : 'bg-surface-3 text-ink-2')}>{count}</span>
          )}
        </>
      )}
    </NavLink>
  )
}

function ProviderPill() {
  const { user } = useSession()
  const q = useProvider()
  const sw = useSwitchProvider()
  const p = q.data
  const tone = !p ? 'bg-line-strong' : !p.available ? 'bg-crit' : p.provider === 'rule_based' ? 'bg-warn' : p.provider === 'ollama' ? 'bg-model' : 'bg-ok'
  const label = !p ? 'Checking model' : p.provider === 'rule_based' ? 'Rule-based mode' : `${p.model_id.replace('openai/', '')} · ${p.provider === 'groq' ? 'Groq' : 'Ollama'}`
  const pill = (
    <button data-tour="provider" className="flex h-8 shrink-0 items-center gap-2 rounded-full border border-line bg-surface px-3 text-caption font-medium whitespace-nowrap text-ink-2 shadow-card hover:border-line-strong">
      <span className="relative flex">
        <Dot className={cn(tone, 'size-2')} />
        {p?.available && p.provider !== 'rule_based' && <Dot className={cn(tone, 'absolute size-2 animate-ping opacity-60')} />}
      </span>
      {label}
      {user?.role === 'payroll_admin' && <ChevronDown size={12} />}
    </button>
  )
  if (user?.role !== 'payroll_admin') return <Tip content={p?.detail ?? 'Open-weight model used for drafting'}>{pill}</Tip>
  return (
    <Dropdown.Root>
      <Dropdown.Trigger asChild>{pill}</Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content align="end" sideOffset={8} className="z-50 w-76 rounded-card border border-line bg-surface p-1.5 shadow-overlay">
          <div className="eyebrow px-2 pt-1 pb-1.5">Drafting provider (admin)</div>
          {(
            [
              ['groq', 'gpt-oss-20b on Groq', 'Open weights, strict JSON schema', 'bg-ok'],
              ['ollama', 'qwen3:4b on Ollama', 'Local, offline, CPU', 'bg-model'],
              ['rule_based', 'Rule-based', 'No LLM; deterministic templates', 'bg-warn'],
            ] as const
          ).map(([id, name, sub, dot]) => (
            <Dropdown.Item
              key={id}
              onSelect={() => sw.mutate(id)}
              className={cn('flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-2 outline-none data-[highlighted]:bg-surface-2', p?.provider === id && 'bg-accent-soft')}
            >
              <Dot className={cn(dot, 'mt-1.5 size-2')} />
              <span className="flex flex-col">
                <span className="text-small font-medium text-ink">{name}</span>
                <span className="text-caption text-ink-3">{sub}</span>
              </span>
            </Dropdown.Item>
          ))}
          {p?.detail && <div className="mt-1 border-t border-line px-2 pt-1.5 text-caption text-ink-3">{p.detail}</div>}
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  )
}

function Cutoff() {
  const q = usePayPeriod()
  if (!q.data) return null
  const ms = new Date(q.data.cutoff_at).getTime() - new Date(q.data.now).getTime()
  const tone = ms < 4 * 3600e3 ? 'text-crit' : ms < 24 * 3600e3 ? 'text-warn' : 'text-ink'
  return (
    <Tip content="Payroll cutoff Mon 9 Nov, 12:00 PT. Measured from the simulated clock.">
      <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-small whitespace-nowrap shadow-card">
        <Timer size={13} className="text-ink-3" />
        <span className="hidden text-ink-3 xl:inline">Cutoff in</span>
        <span className={cn('tabular font-mono font-semibold', tone)}>{relativeDuration(ms)}</span>
      </div>
    </Tip>
  )
}

function Readiness() {
  const q = usePayPeriod()
  if (!q.data) return null
  const { resolved, total, ready_to_countersign } = q.data
  const p = total ? resolved / total : 0
  return (
    <div className="relative overflow-hidden rounded-xl border border-line bg-surface p-3 shadow-card">
      <div aria-hidden className="bg-brand absolute -top-10 -right-10 size-24 rounded-full opacity-15 blur-2xl" />
      <div className="relative flex items-center justify-between">
        <span className="eyebrow">Cutoff readiness</span>
        <span className="tabular font-mono text-[11px] font-semibold text-ink">{Math.round(p * 100)}%</span>
      </div>
      <div className="relative mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
        <motion.div className="bg-brand h-full rounded-full" initial={false} animate={{ width: `${p * 100}%` }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }} />
      </div>
      <div className="relative mt-2 flex justify-between text-[11px] text-ink-3">
        <span><b className="tabular font-semibold text-ink">{resolved}</b>/{total} done</span>
        <span><b className="tabular font-semibold text-ok">{ready_to_countersign}</b> ready</span>
      </div>
    </div>
  )
}

function PersonaMenu() {
  const { user, signOut, theme, toggleTheme } = useSession()
  const navigate = useNavigate()
  const [pwOpen, setPwOpen] = useState(false)
  if (!user) return null
  return (
    <div className="flex items-center gap-1">
      <Tip content={theme === 'light' ? 'Dark theme' : 'Light theme'}>
        <button onClick={toggleTheme} aria-label="Toggle theme" className="grid size-8 place-items-center rounded-lg text-ink-3 hover:bg-surface-2 hover:text-ink">
          <motion.span key={theme} initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} transition={{ duration: 0.25 }}>
            {theme === 'light' ? <Moon size={15} /> : <Sun size={15} />}
          </motion.span>
        </button>
      </Tip>
      <Dropdown.Root>
        <Dropdown.Trigger asChild>
          <button aria-label={`Account menu for ${user.display_name}`} className="flex h-8 shrink-0 items-center gap-2 rounded-full border border-line bg-surface pr-2.5 pl-0.5 whitespace-nowrap shadow-card hover:border-line-strong">
            <Avatar name={user.display_name} size={26} />
            <span className="hidden text-small font-medium text-ink xl:block">{user.display_name}</span>
            <ChevronDown size={12} className="text-ink-3" />
          </button>
        </Dropdown.Trigger>
        <Dropdown.Portal>
          <Dropdown.Content align="end" sideOffset={8} className="z-50 w-60 rounded-card border border-line bg-surface p-1.5 shadow-overlay">
            <div className="flex items-center gap-2.5 px-2 py-2">
              <Avatar name={user.display_name} size={34} />
              <div>
                <div className="text-small font-medium text-ink">{user.display_name}</div>
                <div className="text-caption text-ink-3 capitalize">{user.role.replace('_', ' ')} · {user.auth_method === 'password' ? 'password sign-in' : 'demo sign-in'}</div>
                {user.email && <div className="truncate font-mono text-[11px] text-ink-3">{user.email}</div>}
              </div>
            </div>
            <Dropdown.Separator className="my-1 h-px bg-line" />
            {user.email && (
              <Dropdown.Item onSelect={() => setPwOpen(true)} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-small text-ink-2 outline-none data-[highlighted]:bg-surface-2">
                <KeyRound size={14} /> Change password
              </Dropdown.Item>
            )}
            <Dropdown.Item onSelect={() => { signOut(); navigate('/') }} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-small text-ink-2 outline-none data-[highlighted]:bg-surface-2">
              <Users size={14} /> Switch persona
            </Dropdown.Item>
            <Dropdown.Item onSelect={() => { signOut(); navigate('/') }} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-small text-ink-2 outline-none data-[highlighted]:bg-surface-2">
              <LogOut size={14} /> Sign out
            </Dropdown.Item>
          </Dropdown.Content>
        </Dropdown.Portal>
      </Dropdown.Root>
      <ChangePasswordDialog open={pwOpen} onOpenChange={setPwOpen} />
    </div>
  )
}

const PAGES = [
  ['/queue', 'Exception queue', Inbox],
  ['/forecast', 'Overtime forecast', CalendarClock],
  ['/inspector', 'Harness inspector', Microscope],
  ['/outcomes', 'Outcomes', CircleGauge],
  ['/evaluation', 'Evaluation', FlaskConical],
  ['/policies', 'Policies and retrieval', BookText],
] as const

function Palette({ open, setOpen, onTour }: { open: boolean; setOpen: (v: boolean) => void; onTour: () => void }) {
  const navigate = useNavigate()
  const queue = useQueue()
  const { user, toggleTheme } = useSession()
  const go = (to: string) => {
    navigate(to)
    setOpen(false)
  }
  if (!open) return null
  const pages = [...PAGES, ...(user?.role === 'payroll_admin' ? ([['/payroll', 'Cutoff readiness and escalations', ShieldAlert], ['/audit', 'Audit log', Link2]] as const) : [])]
  const item = 'flex h-10 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 text-small text-ink-2 data-[selected=true]:bg-surface-2 data-[selected=true]:text-ink'
  const group = '[&_[cmdk-group-heading]]:eyebrow [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1'
  return (
    <div className="fixed inset-0 z-50 bg-ink/25 backdrop-blur-[3px]" onClick={() => setOpen(false)}>
      <motion.div initial={{ opacity: 0, y: -8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.16 }} className="mx-auto mt-[13vh] w-[min(660px,92vw)]" onClick={(e) => e.stopPropagation()}>
        <Command label="Command palette" className="overflow-hidden rounded-dialog border border-line bg-surface shadow-[0_40px_100px_-30px_rgb(0_0_0/0.5)]" onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}>
          <div className="flex items-center gap-2.5 border-b border-line px-4">
            <Search size={16} className="text-accent" />
            <Command.Input autoFocus placeholder="Jump to a page, employee, or exception" className="h-13 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-3" />
            <Kbd>Esc</Kbd>
          </div>
          <Command.List className="max-h-[52vh] overflow-y-auto p-1.5 scrollbar-thin">
            <Command.Empty className="p-8 text-center text-small text-ink-3">No results</Command.Empty>
            <Command.Group heading="Pages" className={group}>
              {pages.map(([to, label, Icon]) => (
                <Command.Item key={to} onSelect={() => go(to)} className={item}>
                  <span className="grid size-6 place-items-center rounded-md border border-line bg-surface-2 text-ink-2"><Icon size={13} /></span>
                  {label}
                  <CornerDownLeft size={12} className="ml-auto text-ink-3 opacity-0 [[data-selected=true]_&]:opacity-100" />
                </Command.Item>
              ))}
            </Command.Group>
            <Command.Group heading="Actions" className={group}>
              <Command.Item onSelect={() => { toggleTheme(); setOpen(false) }} className={item}>
                <span className="grid size-6 place-items-center rounded-md border border-line bg-surface-2 text-ink-2"><PaletteIcon size={13} /></span>
                Toggle theme
              </Command.Item>
              <Command.Item onSelect={() => { setOpen(false); onTour() }} className={item}>
                <span className="grid size-6 place-items-center rounded-md border border-line bg-surface-2 text-ink-2"><Compass size={13} /></span>
                Start the guided tour
              </Command.Item>
            </Command.Group>
            <Command.Group heading="Exceptions" className={group}>
              {queue.data?.items.slice(0, 60).map((i) => (
                <Command.Item key={i.id} value={`${i.id} ${i.employee_name} ${i.title}`} onSelect={() => go(`/queue?selected=${i.id}`)} className={item}>
                  <Avatar name={i.employee_name} size={22} />
                  <span className="truncate">{i.employee_name} · {i.title}</span>
                  <span className="ml-auto font-mono text-[11px] text-ink-3">{i.id}</span>
                </Command.Item>
              ))}
            </Command.Group>
          </Command.List>
          <div className="flex items-center gap-3 border-t border-line bg-surface-2/60 px-4 py-2 text-[11px] text-ink-3">
            <span className="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> navigate</span>
            <span className="flex items-center gap-1"><Kbd>Enter</Kbd> open</span>
          </div>
        </Command>
      </motion.div>
    </div>
  )
}

function useAppTourSteps(role: string | undefined): TourStep[] {
  return useMemo(() => {
    const common: TourStep[] = [
      { target: 'provider', title: 'Which model is drafting', body: 'gpt-oss-20b on Groq, qwen3:4b locally, or rule-based mode when no model is available. The workflow keeps working in every mode.' },
      { target: 'nav', title: 'Everything else', body: 'Overtime forecast with compliant swaps, the harness inspector with fault replay, measured outcomes, evaluation results, and the policy pack.' },
      { target: 'search', title: 'Jump anywhere', body: <>Press <Kbd>Ctrl</Kbd> <Kbd>K</Kbd> for the command palette: pages, employees, exceptions, and this tour.</> },
    ]
    if (role === 'payroll_admin') {
      return [
        { title: 'Welcome, Arjun', body: 'You run payroll across Fremont, Austin, and Bengaluru. Your job before the cutoff: clear what the harness refused to guess.' },
        { target: 'cutoff', title: 'The clock that matters', body: 'A simulated clock and the payroll cutoff countdown. Every exception is evaluated as of this moment.' },
        { target: 'payroll-sites', title: 'Readiness by site', body: 'Open items, escalations, and unresolved pay impact for each site, with its jurisdiction.' },
        { target: 'payroll-escalations', title: 'Escalations', body: 'When evidence conflicts or no safe correction exists, the harness escalates here instead of guessing. Pick one to see why.' },
        ...common,
      ]
    }
    return [
      { title: "Welcome to Maya's queue", body: 'Maya manages the Fremont distribution centre. This tour walks through clearing exceptions before the payroll cutoff.' },
      { target: 'cutoff', title: 'The clock that matters', body: 'A simulated clock and the payroll cutoff countdown. Every exception is evaluated as of this moment.' },
      { target: 'queue-progress', title: 'Progress to cutoff', body: 'Resolved so far, and how many verified drafts are ready to countersign.' },
      { target: 'queue-lenses', title: 'The four problems from the brief', body: 'Missed punches, overtime risks, schedule conflicts, and policy breaches. Click one to filter the queue to it.' },
      { target: 'briefing', title: 'Your cutoff briefing', body: 'What is ready, what is escalated, and which fix clears the most. Every number is computed from the queue, not written by the model.' },
      { target: 'queue-list', title: 'A queue ranked by risk', body: 'Root causes come first with their symptoms nested underneath. Badges show the route, the related fixes, untrusted notes, and pay impact.' },
      { target: 'prepare', title: 'Prepare drafts in bulk', body: 'Runs the governed pipeline for up to 12 undrafted exceptions: context, retrieval, sanitising, generation, ten gates, and routing.' },
      { target: 'detail-timeline', title: 'The shift ribbon', body: 'Recorded punches across the days involved, with badge and scanner evidence. Toggle between as recorded and with correction.' },
      { target: 'detail-evidence', title: 'Evidence and pay impact', body: 'Independent evidence with its strength, any employee note quarantined as untrusted, and pay before and after, computed by code.' },
      { target: 'detail-draft', title: 'The drafted correction', body: 'Written by the model inside an allowed action envelope. Every time is anchored to evidence and every citation quotes the policy verbatim. Click a clause chip to read it.' },
      { target: 'detail-gates', title: 'Ten gates, one route', body: 'Hover a gate to see what it checked. Evidence strength is computed by the harness, never taken from the model. Cascade fixes are listed here.' },
      { target: 'detail-decision', title: 'You countersign', body: <>Approve with <Kbd>A</Kbd>, edit with <Kbd>E</Kbd> (re-checked live), or reject with <Kbd>R</Kbd>. Move through the queue with <Kbd>J</Kbd> and <Kbd>K</Kbd>.</> },
      ...common,
    ]
  }, [role])
}

export function AppShell() {
  const { user } = useSession()
  const queue = useQueue()
  const period = usePayPeriod()
  const location = useLocation()
  const reduce = useReducedMotion()
  const [palette, setPalette] = useState(false)
  const [tour, setTour] = useState(false)
  const steps = useAppTourSteps(user?.role)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPalette((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    const home = user?.role === 'payroll_admin' ? '/payroll' : '/queue'
    if (location.pathname !== home || !canAutoStart(APP_TOUR_KEY)) return
    const t = setTimeout(() => setTour(true), 1600)
    return () => clearTimeout(t)
  }, [location.pathname, user?.role])

  const counts = queue.data?.counts
  const now = period.data?.now
  return (
    <div className="flex min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col border-r border-line bg-canvas px-3 py-4 lg:flex">
        <div aria-hidden className="bg-dots mask-fade-b pointer-events-none absolute inset-x-0 top-0 h-48 opacity-70" />
        <div className="relative"><Wordmark /></div>
        <nav className="relative mt-6 flex flex-1 flex-col gap-0.5 overflow-y-auto scrollbar-thin" aria-label="Main" data-tour="nav">
          <div className="eyebrow mb-1 px-2.5">Workspace</div>
          <NavItem to="/queue" icon={<Inbox size={15} />} label="Queue" count={counts?.all} />
          <NavItem to="/forecast" icon={<CalendarClock size={15} />} label="Overtime forecast" />
          <div className="eyebrow mt-4 mb-1 px-2.5">Trust</div>
          <NavItem to="/inspector" icon={<Microscope size={15} />} label="Harness inspector" />
          <NavItem to="/outcomes" icon={<CircleGauge size={15} />} label="Outcomes" />
          <NavItem to="/evaluation" icon={<FlaskConical size={15} />} label="Evaluation" />
          <NavItem to="/policies" icon={<BookText size={15} />} label="Policies" />
          {user?.role === 'payroll_admin' && (
            <>
              <div className="eyebrow mt-4 mb-1 px-2.5">Payroll</div>
              <NavItem to="/payroll" icon={<ShieldAlert size={15} />} label="Cutoff readiness" count={counts?.escalated} tone="crit" />
              <NavItem to="/audit" icon={<Link2 size={15} />} label="Audit chain" />
            </>
          )}
        </nav>
        <div className="relative space-y-2.5">
          <Readiness />
          <button data-tour="search" onClick={() => setPalette(true)} className="flex h-9 w-full items-center gap-2 rounded-lg border border-line bg-surface px-2.5 text-small text-ink-3 shadow-card hover:border-line-strong hover:text-ink">
            <Search size={14} /> Search <span className="ml-auto flex gap-0.5"><Kbd>Ctrl</Kbd><Kbd>K</Kbd></span>
          </button>
          <button onClick={() => setTour(true)} className="group flex h-9 w-full items-center gap-2 rounded-lg px-2.5 text-small font-medium text-ink-2 hover:bg-surface-2 hover:text-ink">
            <Compass size={14} className="text-accent" /> Guided tour
            <ArrowRight size={13} className="ml-auto opacity-0 transition-opacity group-hover:opacity-100" />
          </button>
          <p className="px-1 text-[10.5px] leading-snug text-ink-3">Synthetic data. Fictional policy pack, not legal advice.</p>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="glass sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line px-5 whitespace-nowrap">
          <div className="flex min-w-0 shrink-0 items-center gap-3" data-tour="cutoff">
            {now && (
              <Tip content="Simulated demo clock (not real time). All exceptions are evaluated as of this moment.">
                <div className="flex items-center gap-1.5 text-small text-ink-2">
                  <span className="relative grid size-5 place-items-center">
                    <span className="animate-pulse-ring absolute inset-0 rounded-full bg-ok/30" />
                    <Activity size={13} className="relative text-ok" />
                  </span>
                  <span className="font-medium text-ink">Fri 6 Nov, 11:00 PT</span>
                  <span className="hidden text-ink-3 2xl:inline">simulated</span>
                </div>
              </Tip>
            )}
            <Cutoff />
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <button onClick={() => setTour(true)} className="hidden h-8 shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-caption font-medium text-ink-2 shadow-card hover:border-line-strong hover:text-ink xl:inline-flex">
              <Compass size={13} className="text-accent" /> Tour
            </button>
            <Hatch className="hidden shrink-0 2xl:inline-flex">Synthetic data</Hatch>
            <ProviderPill />
            <PersonaMenu />
          </div>
        </header>
        <main id="main" className="relative min-w-0 flex-1">
          <motion.div key={location.pathname} initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }} className="h-full">
            <Outlet />
          </motion.div>
        </main>
      </div>
      <Palette open={palette} setOpen={setPalette} onTour={() => setTour(true)} />
      <Tour
        steps={steps}
        open={tour}
        label="App tour"
        onClose={() => {
          markTourDone(APP_TOUR_KEY)
          setTour(false)
        }}
      />
    </div>
  )
}
