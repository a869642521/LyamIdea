'use client'

import { createContext, useContext, useState } from 'react'
import type { Lang } from '@/lib/i18n'
import { t as translate, type TranslationKeys } from '@/lib/i18n'

interface LanguageContextValue {
  lang: Lang
  setLang: (lang: Lang) => void
  t: (key: TranslationKeys, ...args: (number | string)[]) => string
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: 'zh',
  setLang: () => {},
  t: (key) => key as string,
})

const LS_KEY = 'idea-bazaar-lang'

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    if (typeof window === 'undefined') return 'zh'
    try {
      const saved = localStorage.getItem(LS_KEY)
      if (saved === 'en' || saved === 'zh') return saved
    } catch {}
    return 'zh'
  })

  const setLang = (next: Lang) => {
    setLangState(next)
    try { localStorage.setItem(LS_KEY, next) } catch {}
  }

  const tFn = (key: TranslationKeys, ...args: (number | string)[]) => translate(lang, key, ...args)

  return (
    <LanguageContext.Provider value={{ lang, setLang, t: tFn }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  return useContext(LanguageContext)
}
