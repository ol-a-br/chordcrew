import { type ButtonHTMLAttributes } from 'react'
import { clsx } from 'clsx'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chord disabled:opacity-50 disabled:cursor-not-allowed',
        {
          'bg-chord text-surface-0 hover:bg-chord-light':          variant === 'primary',
          'bg-surface-2 text-ink hover:bg-surface-3':              variant === 'secondary',
          'text-ink hover:bg-surface-2':                           variant === 'ghost',
          'bg-red-700 text-white hover:bg-red-600':                variant === 'danger',
        },
        {
          'px-2.5 py-1.5 text-xs': size === 'sm',
          'px-4 py-2 text-sm':     size === 'md',
          'px-5 py-3 text-base':   size === 'lg',
        },
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
}
