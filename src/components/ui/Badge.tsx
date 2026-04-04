import { cn } from '@/lib/utils'

interface BadgeProps {
  children: React.ReactNode
  variant?: 'default' | 'green' | 'yellow' | 'red' | 'purple'
  className?: string
}

export default function Badge({ children, variant = 'default', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
        {
          'bg-zinc-800 text-zinc-300': variant === 'default',
          'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30': variant === 'green',
          'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30': variant === 'yellow',
          'bg-rose-500/15 text-rose-400 ring-1 ring-rose-500/30': variant === 'red',
          'bg-violet-500/15 text-violet-400 ring-1 ring-violet-500/30': variant === 'purple',
        },
        className
      )}
    >
      {children}
    </span>
  )
}
