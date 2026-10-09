import { GitCompare, Link2Off } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { LinkStatus } from '@/utils/linkedSongs'

interface Props {
  status: LinkStatus
  bookNames?: string[]   // names of diverged/broken books for tooltip
  onClick?: () => void
  size?: 'sm' | 'md'
}

export function LinkStatusBadge({ status, bookNames = [], onClick, size = 'md' }: Props) {
  const { t } = useTranslation()
  if (status === 'none' || status === 'in-sync') return null

  const iconSize = size === 'sm' ? 13 : 15
  const tooltip = status === 'broken'
    ? t('linkStatus.notFound')
    : t('linkStatus.divergedFrom', { books: bookNames.join(', ') })

  if (status === 'broken') {
    return (
      <button
        onClick={e => { e.stopPropagation(); e.preventDefault(); onClick?.() }}
        title={tooltip}
        aria-label={t('linkStatus.broken')}
        className="shrink-0 p-1 rounded text-ink-faint hover:text-ink transition-colors"
      >
        <Link2Off size={iconSize} />
      </button>
    )
  }

  return (
    <button
      onClick={e => { e.stopPropagation(); e.preventDefault(); onClick?.() }}
      title={tooltip}
      aria-label={t('linkStatus.diverged')}
      data-testid="link-diverged-badge"
      className="shrink-0 p-1 rounded text-amber-500 hover:text-amber-400 transition-colors animate-pulse hover:animate-none"
    >
      <GitCompare size={iconSize} />
    </button>
  )
}
