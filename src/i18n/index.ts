import i18n from "i18next"
import { initReactI18next } from "react-i18next"
import zhCN from "./locales/zh-CN.json"
import enUS from "./locales/en-US.json"
import frFR from "./locales/fr-FR.json"
import esES from "./locales/es-ES.json"
import jaJP from "./locales/ja-JP.json"
import koKR from "./locales/ko-KR.json"
import ruRU from "./locales/ru-RU.json"
import deDE from "./locales/de-DE.json"
import ptBR from "./locales/pt-BR.json"
import arSA from "./locales/ar-SA.json"

export const defaultNS = "translation"
export const resources = {
  "zh-CN": { translation: zhCN },
  "en-US": { translation: enUS },
  "fr-FR": { translation: frFR },
  "es-ES": { translation: esES },
  "ja-JP": { translation: jaJP },
  "ko-KR": { translation: koKR },
  "ru-RU": { translation: ruRU },
  "de-DE": { translation: deDE },
  "pt-BR": { translation: ptBR },
  "ar-SA": { translation: arSA },
} as const

export type AppLanguage =
  | "zh-CN"
  | "en-US"
  | "fr-FR"
  | "es-ES"
  | "ja-JP"
  | "ko-KR"
  | "ru-RU"
  | "de-DE"
  | "pt-BR"
  | "ar-SA"

export const languageNames: Record<AppLanguage, string> = {
  "zh-CN": "简体中文",
  "en-US": "English",
  "fr-FR": "Français",
  "es-ES": "Español",
  "ja-JP": "日本語",
  "ko-KR": "한국어",
  "ru-RU": "Русский",
  "de-DE": "Deutsch",
  "pt-BR": "Português",
  "ar-SA": "العربية",
}

export const languageOptions: { value: AppLanguage; label: string }[] = [
  { value: "zh-CN", label: "简体中文" },
  { value: "en-US", label: "English" },
  { value: "fr-FR", label: "Français" },
  { value: "es-ES", label: "Español" },
  { value: "ja-JP", label: "日本語" },
  { value: "ko-KR", label: "한국어" },
  { value: "ru-RU", label: "Русский" },
  { value: "de-DE", label: "Deutsch" },
  { value: "pt-BR", label: "Português" },
  { value: "ar-SA", label: "العربية" },
]

const savedLanguage = (() => {
  try {
    const stored = localStorage.getItem("secscore_language")
    if (stored && (stored === "zh-CN" || stored === "en-US")) {
      return stored
    }
  } catch {
    void 0
  }
  const browserLang = navigator.language || (navigator as any).userLanguage
  if (browserLang?.startsWith("zh")) return "zh-CN"
  return "en-US"
})()

i18n.use(initReactI18next).init({
  resources,
  lng: savedLanguage,
  fallbackLng: "zh-CN",
  defaultNS,
  interpolation: {
    escapeValue: false,
  },
  react: {
    useSuspense: false,
  },
})

export const changeLanguage = async (lang: AppLanguage): Promise<void> => {
  await i18n.changeLanguage(lang)
  try {
    localStorage.setItem("secscore_language", lang)
  } catch {
    void 0
  }
}

export const getCurrentLanguage = (): AppLanguage => {
  return (i18n.language as AppLanguage) || "zh-CN"
}

export { i18n }
export default i18n
