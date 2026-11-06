import * as PopoverPrimitive from '@radix-ui/react-popover'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { AlertTriangle, Inbox, RotateCw } from 'lucide-react'
import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

/* ---------------------------------------------------------------- Button */
const buttonStyles = cva(
  'inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-control font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out-soft disabled:pointer-events-none disabled:opacity-45 active:translate-y-px',
  {
    variants: {
      variant: {
        primary: 'bg-accent text-accent-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.18)] hover:bg-accent-hover',
        secondary: 'border border-line-strong bg-surface text-ink hover:border-ink-3 hover:bg-surface-2',
        ghost: 'text-ink-2 hover:bg-surface-2 hover:text-ink',
        danger: 'border border-crit/40 bg-surface text-crit hover:bg-crit-soft',
        model: 'border border-model-line bg-model-soft text-model hover:border-model',
      },
      size: { sm: 'h-7 px-2.5 text-small', md: 'h-8.5 px-3 text-body', lg: 'h-10 px-4 text-body' },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
)

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonStyles> {
  asChild?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild, ...props }, ref) => {
  const Comp = asChild ? Slot : 'button'
  return <Comp ref={ref} className={cn(buttonStyles({ variant, size }), className)} {...props} />
})
Button.displayName = 'Button'

/* ---------------------------------------------------------------- Pill */
const pillStyles = cva('inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-px text-caption font-medium', {
  variants: {
    tone: {
      neutral: 'border-line bg-surface-2 text-ink-2',
      ok: 'border-ok/25 bg-ok-soft text-ok',
      warn: 'border-warn-line bg-warn-soft text-warn',
      crit: 'border-crit/25 bg-crit-soft text-crit',
      accent: 'border-accent/25 bg-accent-soft text-accent',
      model: 'border-model-line bg-model-soft text-model',
      outline: 'border-line-strong bg-transparent text-ink-2',
    },
  },
  defaultVariants: { tone: 'neutral' },
})

export function Pill({ tone, className, ...props }: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof pillStyles>) {
  return <span className={cn(pillStyles({ tone }), className)} {...props} />
}

/* ---------------------------------------------------------------- Card */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-card border border-line bg-surface', className)} {...props} />
}

export function CardHeader({ title, eyebrow, actions, className }: { title?: ReactNode; eyebrow?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-start justify-between gap-3 px-4 pt-3.5 pb-2', className)}>
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-0.5">{eyebrow}</div>}
        {title && <h3 className="text-heading font-semibold text-ink">{title}</h3>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
    </div>
  )
}

/* ---------------------------------------------------------------- Kbd */
export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-[4px] border border-line-strong border-b-2 bg-surface px-1 font-mono text-[10.5px] leading-none text-ink-3',
        className,
      )}
    >
      {children}
    </kbd>
  )
}

/* ---------------------------------------------------------------- Tooltip */
export const TooltipProvider = TooltipPrimitive.Provider

export function Tip({ content, children, side = 'top' }: { content: ReactNode; children: ReactNode; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  if (!content) return <>{children}</>
  return (
    <TooltipPrimitive.Root delayDuration={120}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className="z-50 max-w-80 rounded-md border border-line bg-surface px-2.5 py-1.5 text-small text-ink-2 shadow-overlay data-[state=delayed-open]:animate-in"
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}

/* ---------------------------------------------------------------- Popover */
export function Pop({ trigger, children, align = 'start', className }: { trigger: ReactNode; children: ReactNode; align?: 'start' | 'center' | 'end'; className?: string }) {
  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger asChild>{trigger}</PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align={align}
          sideOffset={6}
          className={cn('z-50 w-96 rounded-card border border-line bg-surface p-4 text-body shadow-overlay outline-none', className)}
        >
          {children}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}

/* ---------------------------------------------------------------- Segmented */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = 'md',
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: ReactNode; count?: number }[]
  className?: string
  size?: 'sm' | 'md'
}) {
  return (
    <div role="tablist" className={cn('inline-flex items-center gap-0.5 rounded-[8px] border border-line bg-surface-2 p-0.5', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'inline-flex items-center gap-1.5 whitespace-nowrap rounded-[6px] font-medium text-ink-3 transition-colors hover:text-ink',
            size === 'sm' ? 'h-6 px-2 text-caption' : 'h-7 px-2.5 text-small',
            value === o.value && 'bg-surface text-ink shadow-[0_1px_2px_rgb(16_24_40/0.08)] ring-1 ring-line',
          )}
        >
          {o.label}
          {o.count !== undefined && <span className="tabular text-ink-3">{o.count}</span>}
        </button>
      ))}
    </div>
  )
}

/* ---------------------------------------------------------------- Skeleton, states */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-surface-3/70', className)} />
}

export function EmptyState({ title, body, icon, action }: { title: string; body?: ReactNode; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <div className="mb-1 grid size-10 place-items-center rounded-full border border-line bg-surface-2 text-ink-3">{icon ?? <Inbox size={18} />}</div>
      <div className="text-heading font-semibold text-ink">{title}</div>
      {body && <div className="max-w-sm text-small text-ink-3">{body}</div>}
      {action}
    </div>
  )
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : 'Something went wrong'
  const requestId = (error as { requestId?: string })?.requestId
  return (
    <div role="alert" className="m-4 flex items-start gap-3 rounded-card border border-crit/25 bg-crit-soft p-4 text-small">
      <AlertTriangle size={16} className="mt-0.5 shrink-0 text-crit" />
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-crit">Could not load this view</div>
        <div className="mt-0.5 text-ink-2">{message}</div>
        {requestId && <div className="mt-1 font-mono text-caption text-ink-3">Request {requestId}</div>}
      </div>
      {onRetry && (
        <Button size="sm" variant="secondary" onClick={onRetry}>
          <RotateCw size={13} /> Retry
        </Button>
      )}
    </div>
  )
}

export function Dot({ className }: { className?: string }) {
  return <span aria-hidden className={cn('inline-block size-1.5 rounded-full', className)} />
}

export function Hatch({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span className={cn('bg-hatch inline-flex items-center gap-1 rounded-full border border-line-strong px-2 py-px text-caption font-medium text-ink-2', className)}>
      {children}
    </span>
  )
}
