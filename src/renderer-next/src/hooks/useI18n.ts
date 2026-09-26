import { useMemo } from 'react'
import { useAppStore } from '@/store/useAppStore'
import { pick, type Language } from '@/lib/i18n'

export function useI18n(): { language: Language; t: (zh: string, en: string) => string } {
  const language = useAppStore((s) => s.language)
  return useMemo(
    () => ({ language, t: (zh: string, en: string) => pick(language, zh, en) }),
    [language],
  )
}
