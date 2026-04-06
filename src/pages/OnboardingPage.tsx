import { useState } from 'react'
import { Music2, Globe, LogIn, BookOpen, ListMusic, Zap, ChevronRight, Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/auth/AuthContext'
import { saveSettings } from '@/db'
import i18n from '@/i18n'
import { Button } from '@/components/shared/Button'

type Step = 'language' | 'login' | 'tutorial'

const TUTORIAL_SLIDES = [
  {
    icon: <BookOpen size={32} className="text-chord" />,
    titleKey: 'onboarding.slide1Title',
    descKey: 'onboarding.slide1Desc',
  },
  {
    icon: <Music2 size={32} className="text-chord" />,
    titleKey: 'onboarding.slide2Title',
    descKey: 'onboarding.slide2Desc',
  },
  {
    icon: <ListMusic size={32} className="text-chord" />,
    titleKey: 'onboarding.slide3Title',
    descKey: 'onboarding.slide3Desc',
  },
  {
    icon: <Zap size={32} className="text-chord" />,
    titleKey: 'onboarding.slide4Title',
    descKey: 'onboarding.slide4Desc',
  },
]

export default function OnboardingPage() {
  const { t } = useTranslation()
  const { signInWithGoogle, user, configured } = useAuth()
  const [step, setStep] = useState<Step>('language')
  const [slideIndex, setSlideIndex] = useState(0)
  const [signingIn, setSigningIn] = useState(false)
  const [signInError, setSignInError] = useState('')

  const selectLanguage = async (lang: 'en' | 'de') => {
    await i18n.changeLanguage(lang)
    localStorage.setItem('chordcrew-lang', lang)
    await saveSettings({ language: lang })
    setStep('login')
  }

  const handleSignIn = async () => {
    setSigningIn(true)
    setSignInError('')
    try {
      await signInWithGoogle()
      setStep('tutorial')
    } catch {
      setSignInError(t('onboarding.signInError'))
    } finally {
      setSigningIn(false)
    }
  }

  const skipToApp = async () => {
    await saveSettings({ onboardingDone: true })
  }

  const nextSlide = async () => {
    if (slideIndex < TUTORIAL_SLIDES.length - 1) {
      setSlideIndex(i => i + 1)
    } else {
      await saveSettings({ onboardingDone: true })
    }
  }

  // If Firebase not configured, skip login step
  const goToTutorial = async () => {
    setStep('tutorial')
  }

  return (
    <div className="min-h-screen bg-surface-0 flex items-center justify-center p-6">
      <div className="w-full max-w-sm">

        {/* ── Step: Language ── */}
        {step === 'language' && (
          <div className="text-center space-y-8">
            <div className="flex flex-col items-center gap-3">
              <div className="w-16 h-16 rounded-2xl bg-chord/10 border border-chord/20 flex items-center justify-center">
                <Music2 size={32} className="text-chord" />
              </div>
              <h1 className="text-3xl font-bold tracking-tight">{t('app.name')}</h1>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-ink-muted justify-center">
                <Globe size={15} />
                <span>Choose your language / Sprache wählen</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => selectLanguage('en')}
                  className="flex flex-col items-center gap-2 p-4 bg-surface-1 border border-surface-3 hover:border-chord/40 hover:bg-chord/5 rounded-xl transition-colors"
                >
                  <span className="text-2xl">🇬🇧</span>
                  <span className="text-sm font-medium">English</span>
                </button>
                <button
                  onClick={() => selectLanguage('de')}
                  className="flex flex-col items-center gap-2 p-4 bg-surface-1 border border-surface-3 hover:border-chord/40 hover:bg-chord/5 rounded-xl transition-colors"
                >
                  <span className="text-2xl">🇩🇪</span>
                  <span className="text-sm font-medium">Deutsch</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Step: Login ── */}
        {step === 'login' && (
          <div className="text-center space-y-6">
            <div className="flex flex-col items-center gap-3">
              <div className="w-14 h-14 rounded-2xl bg-chord/10 border border-chord/20 flex items-center justify-center">
                <LogIn size={26} className="text-chord" />
              </div>
              <h2 className="text-xl font-bold">{t('onboarding.signInTitle')}</h2>
            </div>

            <div className="bg-surface-1 rounded-xl p-4 text-left space-y-3 text-sm text-ink-muted">
              <div className="flex gap-3">
                <Check size={16} className="text-chord shrink-0 mt-0.5" />
                <span>{t('onboarding.benefit1')}</span>
              </div>
              <div className="flex gap-3">
                <Check size={16} className="text-chord shrink-0 mt-0.5" />
                <span>{t('onboarding.benefit2')}</span>
              </div>
              <div className="flex gap-3">
                <Check size={16} className="text-chord shrink-0 mt-0.5" />
                <span>{t('onboarding.benefit3')}</span>
              </div>
            </div>

            <p className="text-xs text-ink-faint">{t('onboarding.privacyNote')}</p>

            {configured ? (
              <div className="space-y-3">
                <Button
                  variant="primary"
                  size="lg"
                  className="w-full"
                  onClick={handleSignIn}
                  disabled={signingIn}
                >
                  <GoogleIcon />
                  {signingIn ? t('common.loading') : t('auth.signIn')}
                </Button>
                {signInError && <p className="text-xs text-red-400">{signInError}</p>}
                <button
                  onClick={goToTutorial}
                  className="text-xs text-ink-faint hover:text-ink-muted transition-colors w-full py-1"
                >
                  {t('onboarding.skipLogin')}
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-ink-faint">{t('auth.localMode')}</p>
                <Button variant="primary" size="lg" className="w-full" onClick={goToTutorial}>
                  {t('onboarding.continueLocal')}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ── Step: Tutorial ── */}
        {step === 'tutorial' && (
          <div className="space-y-6">
            {/* Slide */}
            <div className="bg-surface-1 rounded-2xl p-6 text-center space-y-4 min-h-[200px] flex flex-col items-center justify-center">
              {TUTORIAL_SLIDES[slideIndex].icon}
              <h3 className="text-lg font-semibold">{t(TUTORIAL_SLIDES[slideIndex].titleKey)}</h3>
              <p className="text-sm text-ink-muted leading-relaxed">{t(TUTORIAL_SLIDES[slideIndex].descKey)}</p>
            </div>

            {/* Dots */}
            <div className="flex justify-center gap-1.5">
              {TUTORIAL_SLIDES.map((_, i) => (
                <div
                  key={i}
                  className={`w-2 h-2 rounded-full transition-colors ${
                    i === slideIndex ? 'bg-chord' : 'bg-surface-3'
                  }`}
                />
              ))}
            </div>

            {/* Navigation */}
            <div className="flex gap-3">
              <button
                onClick={skipToApp}
                className="flex-1 text-sm text-ink-faint hover:text-ink-muted transition-colors py-2"
              >
                {t('onboarding.skip')}
              </button>
              <Button variant="primary" onClick={nextSlide} className="flex-1">
                {slideIndex < TUTORIAL_SLIDES.length - 1 ? (
                  <>
                    {t('onboarding.next')}
                    <ChevronRight size={16} />
                  </>
                ) : (
                  <>
                    <Check size={16} />
                    {t('onboarding.getStarted')}
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
      <path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"/>
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z"/>
    </svg>
  )
}
