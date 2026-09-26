import { cn } from '@/lib/utils'
import { LANGUAGE_OPTIONS } from '@/lib/i18n'
import { useAppStore } from '@/store/useAppStore'

// 首次设置页使用的紧凑语言切换 (中文在前, English 在后)。
export function LanguageSwitch({ className }: { className?: string }) {
  const language = useAppStore((s) => s.language)
  const setLanguage = useAppStore((s) => s.setLanguage)
  return (
    <div
      role="group"
      aria-label="Language / 语言"
      className={cn(
        'inline-flex items-center gap-0.5 rounded-lg border border-border bg-muted/40 p-1',
        className,
      )}
    >
      {LANGUAGE_OPTIONS.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          lang={value === 'en' ? 'en' : 'zh-CN'}
          aria-pressed={language === value}
          onClick={() => setLanguage(value)}
          className={cn(
            'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
            'outline-none focus-visible:ring-2 focus-visible:ring-ring',
            language === value
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
