import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './en.json'
import de from './de.json'

/**
 * UI languages. All UI text lives in one JSON file per language; nothing is
 * translated at runtime. To add a language: create <code>.json with every key
 * of en.json (src/i18n/i18n.test.ts checks this), import it above and add an
 * entry here — Settings and onboarding list it automatically.
 */
export const LANGUAGES = [
  { code: 'en', name: 'English', flag: '🇬🇧', translation: en },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪', translation: de },
] as const

export type LanguageCode = typeof LANGUAGES[number]['code']

i18n.use(initReactI18next).init({
  resources: Object.fromEntries(LANGUAGES.map(l => [l.code, { translation: l.translation }])),
  lng: localStorage.getItem('chordcrew-lang') ?? 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})

// Keep <html lang> in sync with the UI language. A page declared as English
// while showing German UI text makes browsers offer machine translation (which
// index.html disables via translate="no") and gives screen readers the wrong
// pronunciation.
const syncDocumentLang = (lng: string | undefined) => {
  if (lng) document.documentElement.lang = lng
}
syncDocumentLang(i18n.language)
i18n.on('languageChanged', syncDocumentLang)

export default i18n
