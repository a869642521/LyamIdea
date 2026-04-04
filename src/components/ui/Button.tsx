'use client'
import { cn } from '@/lib/utils'
import { ButtonHTMLAttributes, forwardRef } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          'inline-flex items-center justify-center gap-2 font-medium rounded-lg border transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:opacity-50 disabled:cursor-not-allowed',
          {
            'bg-violet-600 hover:bg-violet-500 border-violet-500 text-white shadow-lg shadow-violet-900/30':
              variant === 'primary',
            'bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-zinc-100':
              variant === 'secondary',
            'bg-transparent hover:bg-zinc-800 border-transparent text-zinc-400 hover:text-zinc-100':
              variant === 'ghost',
            'bg-rose-600/20 hover:bg-rose-600/30 border-rose-600/40 text-rose-400':
              variant === 'danger',
          },
          {
            'text-xs px-3 py-1.5': size === 'sm',
            'text-sm px-4 py-2': size === 'md',
            'text-base px-6 py-3': size === 'lg',
          },
          className
        )}
        {...props}
      >
        {loading && (
          <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
        )}
        {children}
      </button>
    )
  }
)
Button.displayName = 'Button'
export default Button
