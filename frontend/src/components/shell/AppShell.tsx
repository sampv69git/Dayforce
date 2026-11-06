import * as Dropdown from '@radix-ui/react-dropdown-menu'
import { Command } from 'cmdk'
import {
  Activity,
  BookText,
  CalendarClock,
  ChevronDown,
  CircleGauge,
  FlaskConical,
  Inbox,
  Link2,
  LogOut,
  Microscope,
  Moon,
  Search,
  ShieldAlert,
  Sun,
  Timer,
  Users,
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router'
import { usePayPeriod, useProvider, useQueue, useSwitchProvider } from '@/api/hooks'
import { Dot, Hatch, Kbd, Tip } from '@/components/ui/primitives'
import { cn } from '@/lib/cn'
import { initials, relativeDuration } from '@/lib/format'
import { useSession } from '@/lib/session'

function Wordmark() {
  return (
    <div className="flex items-center gap-2.5 px-1">
      <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden>
        <rect width="32" height="32" rx="8" className="fill-ink" />
        <path d="M9 17.5l4.2 4.2L23 11.5" fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M8 24.5h16" className="stroke-canvas" strokeWidth="1.6" strokeLinecap="round" opacity=".55" />
      </svg>
      <div className="leading-tight">
        <div className="text-[15px] font-semibold tracking-tight text-ink">Countersign</div>
        <div className="text-[10.5px] text-ink-3">Kestrel Logistics (fictional)</div>
      </div>
    </div>
  )
}

function NavItem({ to, icon, label, count }: { to: string; icon: ReactNode; label: string; count?: number }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'group flex h-8 items-center gap-2.5 rounded-md px-2.5 text-small font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink',
          isActive && 'bg-surface text-ink shadow-[0_1px_2px_rgb(16_24_40/0.06)] ring-1 ring-line',
        )
      }
    >
      <span className="text-ink-3 group-hover:text-ink-2 [.active_&]:text-accent">{icon}</span>
      <span className="flex-1">{label}</span>
      {count !== undefined && count > 0 && <span className="tabular rounded-full bg-surface-3 px-1.5 text-[11px] text-ink-2">{count}</span>}
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
    <button className="flex h-7 items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 text-caption font-medium text-ink-2 hover:border-line-strong">
      <span className="relative flex">
        <Dot className={tone} />
        {p?.available && p.provider !== 'rule_based' && <Dot className={cn(tone, 'absolute animate-ping opacity-60')} />}
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
        <Dropdown.Content align="end" sideOffset={6} className="z-50 w-72 rounded-card border border-line bg-surface p-1.5 shadow-overlay">
          <div className="eyebrow px-2 pt-1 pb-1.5">Drafting provider (admin)</div>
          {(
            [
              ['groq', 'gpt-oss-20b on Groq', 'Open weights, strict JSON schema'],
              ['ollama', 'qwen3:4b on Ollama', 'Local, offline, CPU'],
              ['rule_based', 'Rule-based mode', 'No LLM; deterministic templates'],
            ] as const
          ).map(([id, name, sub]) => (
            <Dropdown.Item
              key={id}
              onSelect={() => sw.mutate(id)}
              className={cn('flex cursor-pointer flex-col rounded-md px-2 py-1.5 outline-none data-[highlighted]:bg-surface-2', p?.provider === id && 'bg-accent-soft')}
            >
              <span className="text-small font-medium text-ink">{name}</span>
              <span className="text-caption text-ink-3">{sub}</span>
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
    <Tip content={`Payroll cutoff Mon 9 Nov, 12:00 PT. Measured from the simulated clock.`}>
      <div className="flex items-center gap-1.5 text-small">
        <Timer size={14} className="text-ink-3" />
        <span className="text-ink-3">Cutoff in</span>
        <span className={cn('tabular font-mono font-semibold', tone)}>{relativeDuration(ms)}</span>
      </div>
    </Tip>
  )
}

function PersonaMenu() {
  const { user, signOut, theme, toggleTheme } = useSession()
  const navigate = useNavigate()
  if (!user) return null
  return (
    <div className="flex items-center gap-1">
      <Tip content={theme === 'light' ? 'Dark theme' : 'Light theme'}>
        <button onClick={toggleTheme} aria-label="Toggle theme" className="grid size-7 place-items-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink">
          {theme === 'light' ? <Moon size={15} /> : <Sun size={15} />}
        </button>
      </Tip>
      <Dropdown.Root>
        <Dropdown.Trigger asChild>
          <button className="flex h-8 items-center gap-2 rounded-full border border-line bg-surface pr-2.5 pl-1 hover:border-line-strong">
            <span className="grid size-6 place-items-center rounded-full bg-ink text-[10.5px] font-semibold text-canvas">{initials(user.display_name)}</span>
            <span className="hidden text-small font-medium text-ink sm:block">{user.display_name}</span>
            <ChevronDown size={12} className="text-ink-3" />
          </button>
        </Dropdown.Trigger>
        <Dropdown.Portal>
          <Dropdown.Content align="end" sideOffset={6} className="z-50 w-56 rounded-card border border-line bg-surface p-1.5 shadow-overlay">
            <div className="px-2 py-1.5">
              <div className="text-small font-medium text-ink">{user.display_name}</div>
              <div className="text-caption text-ink-3 capitalize">{user.role.replace('_', ' ')} · demo sign-in</div>
            </div>
            <Dropdown.Separator className="my-1 h-px bg-line" />
            <Dropdown.Item onSelect={() => { signOut(); navigate('/') }} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-small text-ink-2 outline-none data-[highlighted]:bg-surface-2">
              <Users size={14} /> Switch persona
            </Dropdown.Item>
            <Dropdown.Item onSelect={() => { signOut(); navigate('/') }} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-small text-ink-2 outline-none data-[highlighted]:bg-surface-2">
              <LogOut size={14} /> Sign out
            </Dropdown.Item>
          </Dropdown.Content>
        </Dropdown.Portal>
      </Dropdown.Root>
    </div>
  )
}

function Palette({ open, setOpen }: { open: boolean; setOpen: (v: boolean) => void }) {
  const navigate = useNavigate()
  const queue = useQueue()
  const { user, toggleTheme } = useSession()
  const go = (to: string) => {
    navigate(to)
    setOpen(false)
  }
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 bg-ink/20 backdrop-blur-[2px]" onClick={() => setOpen(false)}>
      <Command
        label="Command palette"
        className="mx-auto mt-[14vh] w-[min(640px,92vw)] overflow-hidden rounded-dialog border border-line bg-surface shadow-overlay"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
      >
        <div className="flex items-center gap-2 border-b border-line px-3">
          <Search size={15} className="text-ink-3" />
          <Command.Input autoFocus placeholder="Jump to a page, employee, or exception" className="h-11 flex-1 bg-transparent text-body text-ink outline-none placeholder:text-ink-3" />
          <Kbd>Esc</Kbd>
        </div>
        <Command.List className="max-h-[50vh] overflow-y-auto p-1.5 scrollbar-thin">
          <Command.Empty className="p-6 text-center text-small text-ink-3">No results</Command.Empty>
          <Command.Group heading="Pages" className="[&_[cmdk-group-heading]]:eyebrow [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5">
            {[
              ['/queue', 'Exception queue'],
              ['/forecast', 'Overtime forecast'],
              ['/inspector', 'Harness inspector'],
              ['/outcomes', 'Outcomes'],
              ['/evaluation', 'Evaluation'],
              ['/policies', 'Policies and retrieval'],
              ...(user?.role === 'payroll_admin' ? [['/payroll', 'Cutoff readiness and escalations'], ['/audit', 'Audit log']] : []),
            ].map(([to, label]) => (
              <Command.Item key={to} onSelect={() => go(to!)} className="flex h-9 cursor-pointer items-center rounded-md px-2 text-small text-ink-2 data-[selected=true]:bg-surface-2 data-[selected=true]:text-ink">
                {label}
              </Command.Item>
            ))}
            <Command.Item onSelect={() => { toggleTheme(); setOpen(false) }} className="flex h-9 cursor-pointer items-center rounded-md px-2 text-small text-ink-2 data-[selected=true]:bg-surface-2">
              Toggle theme
            </Command.Item>
          </Command.Group>
          <Command.Group heading="Exceptions" className="[&_[cmdk-group-heading]]:eyebrow [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5">
            {queue.data?.items.slice(0, 60).map((i) => (
              <Command.Item
                key={i.id}
                value={`${i.id} ${i.employee_name} ${i.title}`}
                onSelect={() => go(`/queue?selected=${i.id}`)}
                className="flex h-9 cursor-pointer items-center gap-2 rounded-md px-2 text-small text-ink-2 data-[selected=true]:bg-surface-2 data-[selected=true]:text-ink"
              >
                <span className="font-mono text-[11px] text-ink-3">{i.id}</span>
                <span className="truncate">{i.employee_name} · {i.title}</span>
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  )
}

export function AppShell() {
  const { user } = useSession()
  const queue = useQueue()
  const period = usePayPeriod()
  const [palette, setPalette] = useState(false)
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
  const counts = queue.data?.counts
  const now = period.data?.now
  return (
    <div className="flex min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <aside className="sticky top-0 hidden h-dvh w-[232px] shrink-0 flex-col border-r border-line bg-canvas px-3 py-4 lg:flex">
        <Wordmark />
        <nav className="mt-6 flex flex-1 flex-col gap-0.5" aria-label="Main">
          <NavItem to="/queue" icon={<Inbox size={15} />} label="Queue" count={counts?.all} />
          <NavItem to="/forecast" icon={<CalendarClock size={15} />} label="Overtime forecast" />
          <NavItem to="/inspector" icon={<Microscope size={15} />} label="Harness inspector" />
          <NavItem to="/outcomes" icon={<CircleGauge size={15} />} label="Outcomes" />
          <NavItem to="/evaluation" icon={<FlaskConical size={15} />} label="Evaluation" />
          <NavItem to="/policies" icon={<BookText size={15} />} label="Policies" />
          {user?.role === 'payroll_admin' && (
            <>
              <div className="eyebrow mt-5 mb-1 px-2.5">Payroll</div>
              <NavItem to="/payroll" icon={<ShieldAlert size={15} />} label="Cutoff readiness" count={counts?.escalated} />
              <NavItem to="/audit" icon={<Link2 size={15} />} label="Audit chain" />
            </>
          )}
        </nav>
        <button onClick={() => setPalette(true)} className="flex h-8 items-center gap-2 rounded-md border border-line bg-surface px-2.5 text-small text-ink-3 hover:text-ink">
          <Search size={13} /> Search <span className="ml-auto flex gap-0.5"><Kbd>Ctrl</Kbd><Kbd>K</Kbd></span>
        </button>
        <p className="mt-3 px-1 text-[10.5px] leading-snug text-ink-3">Synthetic data. Fictional policy pack, not legal advice.</p>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-line bg-canvas/85 px-5 backdrop-blur-md">
          {now && (
            <Tip content="Simulated demo clock (not real time). All exceptions are evaluated as of this moment.">
              <div className="flex items-center gap-1.5 text-small text-ink-2">
                <Activity size={14} className="text-ink-3" />
                <span className="font-medium text-ink">Fri 6 Nov, 11:00 PT</span>
                <span className="text-ink-3">simulated</span>
              </div>
            </Tip>
          )}
          <span className="h-5 w-px bg-line" />
          <Cutoff />
          <div className="ml-auto flex items-center gap-2.5">
            <Hatch>Synthetic data</Hatch>
            <ProviderPill />
            <PersonaMenu />
          </div>
        </header>
        <main id="main" className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
      <Palette open={palette} setOpen={setPalette} />
    </div>
  )
}
