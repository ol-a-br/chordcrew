import { forwardRef, type InputHTMLAttributes } from 'react'
import { Search, X } from 'lucide-react'
import { clsx } from 'clsx'

interface SearchInputProps extends Pick<InputHTMLAttributes<HTMLInputElement>, 'autoFocus' | 'onKeyDown'> {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  inputClassName?: string
  iconSize?: number
}

const DEFAULT_INPUT_CLASSES =
  'w-full bg-surface-2 rounded-lg pl-9 pr-8 py-2 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-1 focus:ring-chord/50'

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
  { value, onChange, placeholder, className, inputClassName, iconSize = 15, autoFocus, onKeyDown },
  ref
) {
  return (
    <div className={clsx('relative', className)}>
      <Search size={iconSize} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
      <input
        ref={ref}
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onKeyDown={onKeyDown}
        className={inputClassName ?? DEFAULT_INPUT_CLASSES}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-ink-faint hover:text-ink hover:bg-surface-3 rounded transition-colors"
        >
          <X size={13} />
        </button>
      )}
    </div>
  )
})
