import { useMemo } from 'react'
import { toast } from 'sonner'
import { PanelLeft, PanelRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/useAppStore'
import { useAuthStore } from '@/store/useAuthStore'
import { normalizeAdvancedAiSettings } from '@/lib/aiEnvironments'
import type { NavKey } from '@/lib/nav'
import { LANGUAGE_OPTIONS } from '@/lib/i18n'
import { useI18n } from '@/hooks/useI18n'

// 可在设置里隐藏的内容导航入口 (Gemini/Claude 另有独立开关)。
const HIDEABLE_NAV: { key: NavKey; label: string; labelEn: string }[] = [
  { key: 'gpt', label: 'ChatGPT', labelEn: 'ChatGPT' },
  { key: 'calendar', label: '个人日历', labelEn: 'Calendar' },
  { key: 'team', label: '组队日历', labelEn: 'Team Calendar' },
  { key: 'todo', label: '备忘录 / 待办', labelEn: 'Memos / To-do' },
  { key: 'notes', label: '笔记 / 知识库', labelEn: 'Notes / Knowledge Base' },
  { key: 'focus', label: '专注', labelEn: 'Focus' },
]

export function InterfaceSettings() {
  const { t } = useI18n()
  const language = useAppStore((s) => s.language)
  const setLanguage = useAppStore((s) => s.setLanguage)
  const patchSection = useAppStore((s) => s.patchSection)
  const workspaceMode = useAppStore((s) => s.workspaceMode)
  const sidebarSide = useAppStore((s) => s.sidebarSide)
  const setSidebarSide = useAppStore((s) => s.setSidebarSide)
  const showGemini = useAppStore((s) => s.showGemini)
  const setShowGemini = useAppStore((s) => s.setShowGemini)
  const showClaude = useAppStore((s) => s.showClaude)
  const setShowClaude = useAppStore((s) => s.setShowClaude)
  const hiddenNav = useAppStore((s) => s.hiddenNav)
  const setNavHidden = useAppStore((s) => s.setNavHidden)
  const advancedAiRaw = useAppStore((s) => s.settings?.advancedAi)
  const advancedAi = useMemo(() => normalizeAdvancedAiSettings(advancedAiRaw), [advancedAiRaw])
  const profile = useAuthStore((s) => s.profile)
  const advancedAiAllowed =
    workspaceMode === 'organization' && Boolean(profile?.isAdmin || profile?.advancedAiAllowed)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('界面设置', 'Interface')}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-1">
        {/* 界面语言: 中文 (默认) / English, 即时生效并持久化 (settings.ui.language)。 */}
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-1.5">
          <div className="min-w-0 flex-1">
            <Label className="cursor-default">{t('界面语言', 'Language')}</Label>
            <p className="truncate text-xs text-muted-foreground">
              {t(
                '主要界面的显示语言，日历格式随之切换。',
                'Display language for the main screens. The calendar format follows it.',
              )}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-0.5 rounded-lg border border-border bg-muted/40 p-1">
            {LANGUAGE_OPTIONS.map(({ value, label }) => {
              const on = language === value
              return (
                <button
                  key={value}
                  type="button"
                  lang={value === 'en' ? 'en' : 'zh-CN'}
                  onClick={() => setLanguage(value)}
                  aria-pressed={on}
                  className={cn(
                    'whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                    'outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    on
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>

        <Separator className="my-1" />

        {/* flex-wrap: 窄窗或高 DPI 缩放下分段控件自动换到下一行, 不溢出卡片。 */}
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-1.5">
          <div className="min-w-0 flex-1">
            <Label className="cursor-default">{t('侧栏位置', 'Sidebar position')}</Label>
            <p className="truncate text-xs text-muted-foreground">
              {t('导航栏显示在窗口左侧或右侧。', 'Show the navigation on the left or right.')}
            </p>
          </div>
          {/* 左/右分段选择: 即时生效并持久化 (settings.ui.sidebarSide)。 */}
          <div className="flex shrink-0 items-center gap-0.5 rounded-lg border border-border bg-muted/40 p-1">
            {(
              [
                { side: 'left', label: t('左侧', 'Left'), icon: PanelLeft },
                { side: 'right', label: t('右侧', 'Right'), icon: PanelRight },
              ] as const
            ).map(({ side, label, icon: Icon }) => {
              const on = sidebarSide === side
              return (
                <button
                  key={side}
                  type="button"
                  onClick={() => setSidebarSide(side)}
                  aria-pressed={on}
                  className={cn(
                    'flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                    'outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    on
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  {label}
                </button>
              )
            })}
          </div>
        </div>

        <Separator className="my-1" />

        {/* 是否展示 Gemini: 关闭后导航栏不再显示 Gemini 入口 (settings.ui.showGemini)。 */}
        <div className="flex items-center justify-between gap-3 py-1.5">
          <div className="min-w-0">
            <Label htmlFor="ui-show-gemini" className="cursor-pointer">
              {t('显示 Gemini', 'Show Gemini')}
            </Label>
            <p className="text-xs text-muted-foreground">
              {t(
                '默认隐藏。Gemini 需要 Google 登录，而内嵌客户端无法完成 Google 登录——我们尝试集成过，但实际用不了。如仍需要可在此开启。',
                'Hidden by default. Gemini needs a Google sign-in, which the embedded browser cannot complete. Turn it on here if you still want it.',
              )}
            </p>
          </div>
          <Switch id="ui-show-gemini" checked={showGemini} onCheckedChange={setShowGemini} />
        </div>

        <Separator className="my-1" />

        {/* 是否展示 Claude: 关闭后导航栏不再显示 Claude 入口 (settings.ui.showClaude)。 */}
        <div className="flex items-center justify-between gap-3 py-1.5">
          <div className="min-w-0">
            <Label htmlFor="ui-show-claude" className="cursor-pointer">
              {t('显示 Claude', 'Show Claude')}
            </Label>
            <p className="truncate text-xs text-muted-foreground">
              {t(
                '控制主页导航栏是否显示 Claude 切换按钮。',
                'Show the Claude button in the navigation.',
              )}
            </p>
          </div>
          <Switch id="ui-show-claude" checked={showClaude} onCheckedChange={setShowClaude} />
        </div>

        <Separator className="my-1" />

        {advancedAiAllowed && (
          <>
            <div className="flex items-center justify-between gap-3 py-1.5">
              <div className="min-w-0">
                <Label htmlFor="advanced-ai-environments" className="cursor-pointer">
                  {t('高级 AI 环境', 'Advanced AI environments')}
                </Label>
                <p className="truncate text-xs text-muted-foreground">
                  {t(
                    '多账号隔离与内置 sing-box 线路分配',
                    'Separate accounts and built-in sing-box routes',
                  )}
                </p>
              </div>
              <Switch
                id="advanced-ai-environments"
                checked={advancedAi.enabled}
                onCheckedChange={(enabled) =>
                  void patchSection('advancedAi', { ...advancedAi, enabled }).catch(() =>
                    toast.error(t('保存高级功能设置失败', 'Could not save advanced settings')),
                  )
                }
              />
            </div>

            <Separator className="my-1" />
          </>
        )}

        {/* 隐藏其它内容入口 (ChatGPT / 日历 / 待办 / 笔记 / 专注): 关闭对应开关即从导航栏隐藏。 */}
        {HIDEABLE_NAV.filter((n) => workspaceMode !== 'personal' || n.key !== 'team').map((n) => (
          <div key={n.key} className="flex items-center justify-between gap-3 py-1.5">
            <div className="min-w-0">
              <Label htmlFor={`ui-show-${n.key}`} className="cursor-pointer">
                {t(`显示 ${n.label}`, `Show ${n.labelEn}`)}
              </Label>
              <p className="truncate text-xs text-muted-foreground">
                {t(
                  `控制主页导航栏是否显示「${n.label}」入口。`,
                  `Show "${n.labelEn}" in the navigation.`,
                )}
              </p>
            </div>
            <Switch
              id={`ui-show-${n.key}`}
              checked={!hiddenNav.includes(n.key)}
              onCheckedChange={(v) => setNavHidden(n.key, !v)}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
