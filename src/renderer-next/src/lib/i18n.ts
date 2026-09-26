// 界面语言: 中文为默认与首选, English 为第二语言。
// 只覆盖主要界面 (导航、设置、网络、AI 提示、日历、待办、工作区选择); 其余文案仍为中文。
// 用法: 组件内 `const { t } = useI18n()` 后写 `t('中文', 'English')`, 中文原文留在代码里便于维护。
import { enUS, zhCN } from 'date-fns/locale'

export type Language = 'zh' | 'en'

export const LANGUAGE_OPTIONS: { value: Language; label: string }[] = [
  { value: 'zh', label: '中文' },
  { value: 'en', label: 'English' },
]

export function normalizeLanguage(value: unknown): Language {
  return value === 'en' ? 'en' : 'zh'
}

export function pick(language: Language, zh: string, en: string): string {
  return language === 'en' ? en : zh
}

// 日历随语言: 中文周一为首 + 中文日期格式; English 周日为首 + 美式日期格式。
export function dateLocale(language: Language) {
  return language === 'en' ? enUS : zhCN
}

export function weekStartsOn(language: Language): 0 | 1 {
  return language === 'en' ? 0 : 1
}

// 事件时间: 中文 24 小时制, English 12 小时制 (9:00 AM)。
export function timeFormat(language: Language): string {
  return language === 'en' ? 'h:mm a' : 'HH:mm'
}

// 时间轴整点标签。
export function hourLabel(hour: number, language: Language): string {
  if (language !== 'en') return `${String(hour).padStart(2, '0')}:00`
  const h12 = hour % 12 === 0 ? 12 : hour % 12
  return `${h12} ${hour < 12 ? 'AM' : 'PM'}`
}

// 应用自动创建的默认名称 (默认日历「个人」、收件箱「收件箱」) 在 English 下显示译名;
// 用户自己命名或改过名的日历/清单保持原样。
const BUILTIN_NAMES_EN: Record<string, string> = { 个人: 'Personal', 收件箱: 'Inbox' }

export function builtinName(
  name: string,
  isBuiltin: boolean | undefined,
  language: Language,
): string {
  if (language !== 'en' || !isBuiltin) return name
  return BUILTIN_NAMES_EN[name] ?? name
}

export function htmlLang(language: Language): string {
  return language === 'en' ? 'en' : 'zh-CN'
}
