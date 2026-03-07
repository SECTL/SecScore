import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import zhCN from './locales/zh-CN.json'
import enUS from './locales/en-US.json'

export const defaultNS = 'translation'
export const resources = {
  'zh-CN': { translation: zhCN },
  'en-US': { translation: enUS }
} as const

export type AppLanguage = 'zh-CN' | 'en-US'

export const languageNames: Record<AppLanguage, string> = {
  'zh-CN': '简体中文',
  'en-US': 'English'
}

export const languageOptions: { value: AppLanguage; label: string }[] = [
  { value: 'zh-CN', label: '简体中文' },
  { value: 'en-US', label: 'English' }
]

const savedLanguage = (() => {
  try {
    const stored = localStorage.getItem('secscore_language')
    if (stored && (stored === 'zh-CN' || stored === 'en-US')) {
      return stored
    }
  } catch {
    void 0
  }
  const browserLang = navigator.language || (navigator as any).userLanguage
  if (browserLang?.startsWith('zh')) return 'zh-CN'
  return 'en-US'
})()

i18n.use(initReactI18next).init({
  resources,
  lng: savedLanguage,
  fallbackLng: 'zh-CN',
  defaultNS,
  interpolation: {
    escapeValue: false
  },
  react: {
    useSuspense: false
  }
})

export const changeLanguage = async (lang: AppLanguage): Promise<void> => {
  await i18n.changeLanguage(lang)
  try {
    localStorage.setItem('secscore_language', lang)
  } catch {
    void 0
  }
}

export const getCurrentLanguage = (): AppLanguage => {
  return (i18n.language as AppLanguage) || 'zh-CN'
}

export { i18n }
export default i18n
