import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './en.json'
import de from './de.json'

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, de: { translation: de } },
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
