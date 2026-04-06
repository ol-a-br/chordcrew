import { useState } from 'react'
import { Star, X, Send } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { collection, addDoc } from 'firebase/firestore'
import { firestore, firebaseConfigured } from '@/firebase'
import { useAuth } from '@/auth/AuthContext'
import { Button } from '@/components/shared/Button'

type Category = 'general' | 'bug' | 'feature'

interface FeedbackModalProps {
  onClose: () => void
}

const APP_VERSION = '0.1.0'

export function FeedbackModal({ onClose }: FeedbackModalProps) {
  const { t, i18n } = useTranslation()
  const { user } = useAuth()

  const [stars, setStars] = useState(0)
  const [hoveredStar, setHoveredStar] = useState(0)
  const [category, setCategory] = useState<Category>('general')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  const canSubmit = stars > 0 && message.trim().length > 0 && !submitting

  const handleSubmit = async () => {
    if (!canSubmit) return
    if (!firebaseConfigured || !firestore) {
      setError(t('feedback.error'))
      return
    }
    setSubmitting(true)
    setError('')
    try {
      await addDoc(collection(firestore, 'feedback'), {
        stars,
        category,
        message: message.trim(),
        userId: user?.id ?? 'anonymous',
        userEmail: user?.email ?? '',
        displayName: user?.displayName ?? 'Unknown',
        appVersion: APP_VERSION,
        language: i18n.language,
        submittedAt: Date.now(),
      })
      setSubmitted(true)
      setTimeout(onClose, 2000)
    } catch {
      setError(t('feedback.error'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-x-4 bottom-4 md:inset-auto md:bottom-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-md z-50">
        <div className="bg-surface-1 border border-surface-3 rounded-2xl shadow-2xl overflow-hidden">

          {/* Header */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-surface-3">
            <div className="flex-1">
              <h2 className="font-semibold text-sm">{t('feedback.title')}</h2>
              <p className="text-xs text-ink-muted">{t('feedback.subtitle')}</p>
            </div>
            <button
              onClick={onClose}
              className="text-ink-faint hover:text-ink p-1 rounded transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          {submitted ? (
            <div className="px-5 py-8 text-center space-y-3">
              <div className="text-3xl">🙏</div>
              <p className="text-sm font-medium text-green-400">{t('feedback.submitted')}</p>
            </div>
          ) : (
            <div className="px-5 py-4 space-y-4">

              {/* Star rating */}
              <div className="space-y-1.5">
                <p className="text-xs text-ink-muted">{t('feedback.starsLabel')}</p>
                <div
                  className="flex gap-1"
                  onMouseLeave={() => setHoveredStar(0)}
                >
                  {[1, 2, 3, 4, 5].map(n => (
                    <button
                      key={n}
                      onClick={() => setStars(n)}
                      onMouseEnter={() => setHoveredStar(n)}
                      className="p-0.5 transition-transform hover:scale-110"
                    >
                      <Star
                        size={24}
                        className={
                          n <= (hoveredStar || stars)
                            ? 'text-chord fill-chord'
                            : 'text-ink-faint'
                        }
                      />
                    </button>
                  ))}
                </div>
              </div>

              {/* Category */}
              <div className="space-y-1.5">
                <p className="text-xs text-ink-muted">{t('feedback.categoryLabel')}</p>
                <div className="flex gap-2 flex-wrap">
                  {(['general', 'bug', 'feature'] as Category[]).map(c => (
                    <button
                      key={c}
                      onClick={() => setCategory(c)}
                      className={`px-3 py-1 rounded-full text-xs transition-colors ${
                        category === c
                          ? 'bg-chord/20 text-chord border border-chord/40'
                          : 'bg-surface-2 text-ink-muted border border-surface-3 hover:border-chord/30'
                      }`}
                    >
                      {t(`feedback.category${c.charAt(0).toUpperCase() + c.slice(1)}`)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Message */}
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder={t('feedback.messagePlaceholder')}
                rows={4}
                className="w-full bg-surface-2 border border-surface-3 rounded-xl px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-1 focus:ring-chord/50 resize-none"
              />

              {error && <p className="text-xs text-red-400">{error}</p>}

              {!firebaseConfigured && (
                <p className="text-xs text-amber-400">{t('feedback.requiresAuth')}</p>
              )}

              <Button
                variant="primary"
                className="w-full"
                onClick={handleSubmit}
                disabled={!canSubmit || !firebaseConfigured}
              >
                <Send size={14} />
                {submitting ? t('common.loading') : t('feedback.submit')}
              </Button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
