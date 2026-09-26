import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  PanelLeftClose,
  PanelLeftOpen,
  PanelTopClose,
  PanelTopOpen,
  Maximize2,
  Minimize2,
  Home,
  RotateCw,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Globe2,
  Languages,
  ArrowUpRight,
  SlidersHorizontal,
  X,
  type LucideIcon,
} from 'lucide-react'
import { ChatGPTIcon, ClaudeIcon, GeminiIcon } from '@/components/icons/AiBrandIcons'
import { PanelScaffold } from '@/components/panels/PanelScaffold'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import type { AiProxyReport } from '@/types/api'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/useAppStore'
import { useAiStore } from '@/store/useAiStore'
import { useAuthStore } from '@/store/useAuthStore'
import { useTranslationStore } from '@/store/useTranslationStore'
import type { AiKind } from '@/store/useAiStore'
import { isSenderRunning } from '@/components/panels/service/helpers'
import { api } from '@/lib/api'
import { canUseAdvancedAi, canUseTranslation } from '@/lib/aiAccess'
import { userFacingAiWorkspaceError } from '@/lib/aiWorkspaceError'
import { coalesceInFlight } from '@/lib/inFlightRequest'
import { toast } from 'sonner'
import { useAiHostSync } from '@/hooks/useAiWorkspace'
import { useAiEvents, applyAiTabsPayload } from './useAiEvents'
import { reportMissingDomains } from './reportGptUsage'
import { GptTabBar } from './GptTabBar'
import {
  GPT_PROXY_HOST,
  GPT_PROXY_PORT,
  embeddedUserAgent,
  homeUrlFor,
  partitionFor,
  normalizeGptUrl,
  normalizeGeminiUrl,
  normalizeClaudeUrl,
  normalizeHttpUrl,
} from './constants'
import type { AiEventPayload } from './types'
import { AiEnvironmentPanel } from './AiEnvironmentPanel'
import { TranslationPanel } from './TranslationPanel'
import { ProxyReportPanel } from './ProxyReportPanel'
import {
  availableAiRoutes,
  managedDefaultRouteForKind,
  normalizeAdvancedAiSettings,
  routeForEnvironment,
} from '@/lib/aiEnvironments'
import type { AdvancedAiSettings } from '@/types/settings'
import {
  TRANSLATION_PANEL_DEFAULT_WIDTH,
  TRANSLATION_PANEL_MIN_WIDTH,
  normalizeTranslationPanelWidth,
  resolveTranslationPanelLayout,
} from '@/lib/translationPanelLayout'
import { useI18n } from '@/hooks/useI18n'

const TRANSLATION_PANEL_WIDTH_KEY = 'sharegpt.translationPanelWidth'

function loadTranslationPanelWidth(): number {
  try {
    return normalizeTranslationPanelWidth(window.localStorage.getItem(TRANSLATION_PANEL_WIDTH_KEY))
  } catch {
    return TRANSLATION_PANEL_DEFAULT_WIDTH
  }
}

function safeText(value: unknown): string {
  if (value === undefined || value === null) return ''
  return String(value).trim()
}

// 旧 resolveGptProxyPort: 优先用代理的本地 socks 监听端口, 否则回落默认。
function resolveProxyPort(socksPort: unknown): string {
  const value = safeText(socksPort) || GPT_PROXY_PORT
  return /^\d+$/.test(value) ? value : GPT_PROXY_PORT
}

function normalizeUrlFor(kind: AiKind, url: string): string {
  if (kind === 'gpt') return normalizeGptUrl(url)
  if (kind === 'claude') return normalizeClaudeUrl(url)
  return normalizeGeminiUrl(url)
}

interface AiMeta {
  title: string
  hint: string
  hintEn: string
  icon: LucideIcon
}

const META: Record<AiKind, AiMeta> = {
  gpt: {
    title: 'ChatGPT',
    hint: '内嵌 ChatGPT 网页 · 经代理访问',
    hintEn: 'Embedded ChatGPT · through the proxy',
    icon: ChatGPTIcon,
  },
  gemini: {
    title: 'Gemini',
    hint: '内嵌 Gemini 网页 · 经代理访问',
    hintEn: 'Embedded Gemini · through the proxy',
    icon: GeminiIcon,
  },
  claude: {
    title: 'Claude',
    hint: '内嵌 Claude 网页 · 经代理访问',
    hintEn: 'Embedded Claude · through the proxy',
    icon: ClaudeIcon,
  },
}

// 共享 AI 网页工作区。GPT / Gemini 完全同构: 控制条 + 多标签 + 原生 view 宿主 + 遮罩。
// 真正的 WebContentsView 在主进程, 这里只渲染宿主 div 并同步其矩形定位。
export function AiWorkspace({ kind }: { kind: AiKind }) {
  const { t } = useI18n()
  const meta = META[kind]
  const ensureInFlightRef = useRef(new Map<string, Promise<void>>())
  const status = useAppStore((s) => s.status)
  const settings = useAppStore((s) => s.settings)
  const sidebarHidden = useAppStore((s) => s.sidebarHidden)
  const toggleSidebarHidden = useAppStore((s) => s.toggleSidebarHidden)
  const aiHeaderHidden = useAppStore((s) => s.aiHeaderHidden)
  const workspaceMode = useAppStore((s) => s.workspaceMode)
  const setAiHeaderHidden = useAppStore((s) => s.setAiHeaderHidden)
  const toggleAiHeaderHidden = useAppStore((s) => s.toggleAiHeaderHidden)
  const advancedAiAllowed = useAuthStore((s) => canUseAdvancedAi(workspaceMode, s.token, s.profile))
  const translationAllowed = useAuthStore((s) =>
    canUseTranslation(workspaceMode, s.token, s.profile),
  )
  const senderRunning = isSenderRunning(status)
  const advancedAi = useMemo(
    () => normalizeAdvancedAiSettings(settings?.advancedAi),
    [settings?.advancedAi],
  )
  const advancedMode = advancedAiAllowed && advancedAi.enabled
  const availableRoutes = useMemo(() => availableAiRoutes(settings?.sender), [settings?.sender])
  const managedDefaultRoute = useMemo(
    () => managedDefaultRouteForKind(availableRoutes, settings?.sender, kind),
    [availableRoutes, kind, settings?.sender],
  )
  const managedDefaultRouteId =
    workspaceMode === 'organization'
      ? safeText(settings?.sender?.managed_default_route_by_kind?.[kind])
      : ''
  const environments = advancedAi.environments.filter((environment) => environment.kind === kind)
  const activeEnvironment = advancedMode
    ? environments.find((environment) => environment.id === advancedAi.activeByKind[kind]) || null
    : null
  const environmentId = String(activeEnvironment?.id || '')
  const activeRoute = routeForEnvironment(availableRoutes, activeEnvironment)
  const activeRouteIds = new Set(
    Array.isArray(status.aiProxyRoutes) ? status.aiProxyRoutes.map((route) => route.id) : [],
  )
  const networkReady = advancedMode
    ? Boolean(activeEnvironment && activeRoute && activeRouteIds.has(activeRoute.id)) &&
      senderRunning
    : Boolean(
        senderRunning &&
        (!managedDefaultRouteId ||
          (managedDefaultRoute && activeRouteIds.has(managedDefaultRoute.id))),
      )
  const [environmentPanelOpen, setEnvironmentPanelOpen] = useState(false)

  const saveAdvancedAi = useCallback(async (next: AdvancedAiSettings) => {
    const normalized = normalizeAdvancedAiSettings(next)
    await useAppStore.getState().patchSection('advancedAi', normalized)
  }, [])

  const selectEnvironment = useCallback(
    async (nextEnvironmentId: string) => {
      await saveAdvancedAi({
        ...advancedAi,
        activeByKind: { ...advancedAi.activeByKind, [kind]: nextEnvironmentId },
      })
    },
    [advancedAi, kind, saveAdvancedAi],
  )

  // 隐藏侧栏/顶部信息栏时按 Esc 快速恢复；两种隐藏态都持久化。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      useAppStore.getState().setSidebarHidden(false)
      setAiHeaderHidden(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setAiHeaderHidden])

  const tabs = useAiStore((s) => s.tabsByKind[kind])
  const activeTabId = useAiStore((s) => s.activeTabIdByKind[kind])
  const translationOpen = useTranslationStore(
    (s) =>
      translationAllowed &&
      s.open &&
      s.kind === kind &&
      s.tabId === activeTabId &&
      s.environmentId === environmentId,
  )
  const toggleTranslation = useTranslationStore((s) => s.toggle)
  const translationBodyRef = useRef<HTMLDivElement | null>(null)
  const translationDragRef = useRef<{
    pointerId: number
    startX: number
    startWidth: number
  } | null>(null)
  const [translationBodyWidth, setTranslationBodyWidth] = useState(0)
  const [preferredTranslationWidth, setPreferredTranslationWidth] =
    useState(loadTranslationPanelWidth)
  const preferredTranslationWidthRef = useRef(preferredTranslationWidth)
  const translationLayout = useMemo(
    () => resolveTranslationPanelLayout(translationBodyWidth, preferredTranslationWidth),
    [preferredTranslationWidth, translationBodyWidth],
  )
  const translationReplacingHost = translationOpen && translationLayout.mode === 'replace'

  useEffect(() => {
    const body = translationBodyRef.current
    if (!body || typeof ResizeObserver === 'undefined') return
    const update = () => setTranslationBodyWidth(body.getBoundingClientRect().width)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(body)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    preferredTranslationWidthRef.current = preferredTranslationWidth
  }, [preferredTranslationWidth])

  const setTranslationWidth = useCallback((width: number, persist = false) => {
    const normalized = normalizeTranslationPanelWidth(width)
    preferredTranslationWidthRef.current = normalized
    setPreferredTranslationWidth(normalized)
    if (!persist) return
    try {
      window.localStorage.setItem(TRANSLATION_PANEL_WIDTH_KEY, String(normalized))
    } catch {
      // Device-local layout preference is best effort.
    }
  }, [])
  const pendingComposerConfirmation = useTranslationStore((s) => {
    const pending = s.pendingComposerConfirmation
    return pending?.kind === kind &&
      pending.tabId === activeTabId &&
      pending.environmentId === environmentId
      ? pending
      : null
  })
  const feedback = useAiStore((s) => s.feedbackByKind[kind])
  const setFeedback = useAiStore((s) => s.setFeedback)
  const reportWorkspaceError = useCallback(
    (error: unknown) => {
      const message = userFacingAiWorkspaceError(error)
      if (message) setFeedback(kind, message, 'error')
    },
    [kind, setFeedback],
  )

  const resolveComposerConfirmation = useCallback(
    async (confirmed: boolean, showStatus = true) => {
      const pending = useTranslationStore.getState().pendingComposerConfirmation
      if (
        !pending ||
        pending.kind !== kind ||
        pending.tabId !== activeTabId ||
        pending.environmentId !== environmentId
      )
        return
      useTranslationStore.getState().setPendingComposerConfirmation(null)
      try {
        await api.resolveAiComposerConfirmation({
          requestId: pending.requestId,
          confirmed,
        })
        if (showStatus)
          setFeedback(kind, confirmed ? t('已发送', 'Sent') : t('已取消发送', 'Send cancelled'))
      } catch (error) {
        const raw = error instanceof Error ? error.message : String(error)
        const message = raw
          .replace(/^Error invoking remote method '[^']+': Error:\s*/i, '')
          .replace(/^Error:\s*/i, '')
        if (!/网页或标签已经变化|发送确认已失效/.test(message)) {
          setFeedback(kind, message, 'error')
        }
      }
    },
    [activeTabId, environmentId, kind, setFeedback, t],
  )

  useEffect(() => {
    if (!pendingComposerConfirmation) return
    const delay = Math.max(0, pendingComposerConfirmation.expiresAt - Date.now())
    const timer = window.setTimeout(() => {
      const current = useTranslationStore.getState().pendingComposerConfirmation
      if (current?.requestId === pendingComposerConfirmation.requestId) {
        useTranslationStore.getState().setPendingComposerConfirmation(null)
      }
    }, delay)
    return () => window.clearTimeout(timer)
  }, [pendingComposerConfirmation])

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null
  const addressInputRef = useRef<HTMLInputElement>(null)
  const [addressValue, setAddressValue] = useState('')
  const [webAddressOpen, setWebAddressOpen] = useState(false)

  if (!networkReady && webAddressOpen) setWebAddressOpen(false)

  useEffect(() => {
    if (kind !== 'claude' || document.activeElement === addressInputRef.current) return
    setAddressValue(activeTab?.allowExternalBrowsing ? activeTab.url : '')
  }, [kind, activeTabId, activeTab?.allowExternalBrowsing, activeTab?.url])

  useEffect(() => {
    if (kind !== 'claude' || !networkReady) return
    const focusAddressBar = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'l') return
      event.preventDefault()
      setWebAddressOpen(true)
    }
    window.addEventListener('keydown', focusAddressBar)
    return () => window.removeEventListener('keydown', focusAddressBar)
  }, [kind, networkReady])

  useEffect(() => {
    if (!webAddressOpen) return
    const frame = window.requestAnimationFrame(() => {
      addressInputRef.current?.focus()
      addressInputRef.current?.select()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [webAddressOpen])

  // 代理检测面板 (展示该页面流量是否全部经代理)。作为宿主上方的可折叠块渲染,
  // 这样不会被原生 webview 盖住 (centered Dialog 会被原生 view 覆盖)。
  const [proxyOpen, setProxyOpen] = useState(false)
  const [proxyChecking, setProxyChecking] = useState(false)
  const [proxyReport, setProxyReport] = useState<AiProxyReport | null>(null)

  // 窗口全屏 (类似 F11): 工具栏按钮切换; 用 resize 事件同步图标状态。
  const [isFullscreen, setIsFullscreen] = useState(false)
  useEffect(() => {
    let alive = true
    const sync = () => {
      void api.isWindowFullScreen?.().then((v) => {
        if (alive) setIsFullscreen(Boolean(v))
      })
    }
    sync()
    window.addEventListener('resize', sync)
    return () => {
      alive = false
      window.removeEventListener('resize', sync)
    }
  }, [])
  const toggleFullscreen = useCallback(() => {
    void api.toggleWindowFullScreen?.().then((v) => setIsFullscreen(Boolean(v)))
  }, [])

  const runProxyCheck = useCallback(async () => {
    setProxyChecking(true)
    try {
      const report = await api.checkAiProxy(kind, activeTabId)
      setProxyReport(report)
    } catch (err) {
      setProxyReport({ ok: false, reason: err instanceof Error ? err.message : String(err) })
    } finally {
      setProxyChecking(false)
    }
  }, [kind, activeTabId])

  const toggleProxyPanel = useCallback(() => {
    const next = !proxyOpen
    setProxyOpen(next)
    if (next) void runProxyCheck()
  }, [proxyOpen, runProxyCheck, setProxyOpen])

  // 自动巡检: 代理运行 + 页面已初始化时, 周期性跑代理检测, 让"有域名没走代理"能自动爆红,
  // 不必每次手点。(检测只是被动读取已记录的主机, 开销很小。)
  // 注意: 不立即检测 —— 页面刚加载时流量尚未稳定, 马上检测容易误报爆红。前 20s 保持中性默认色,
  // 首次自动检测延后到 interval 第一次触发(约 20s)后, 之后每 20s 一次; 用户手点仍即时检测。
  useEffect(() => {
    if (!networkReady || !activeTab?.webviewInitialized || !activeTabId) return
    const id = window.setInterval(() => void runProxyCheck(), 20000)
    return () => window.clearInterval(id)
  }, [networkReady, activeTab?.webviewInitialized, activeTabId, runProxyCheck])

  // 代理检测发现"会用到但没走代理"的域名: 自动累积到本机额外清单(持久化) + 上报管理员。
  // 实际生效需重启 singbox —— 由代理面板的"一键加入并重启"按钮触发, 避免静默打断当前会话。
  const reportedDomainsRef = useRef<Set<string>>(new Set())
  const [restartingProxy, setRestartingProxy] = useState(false)
  const fallbackDomains = useMemo(
    () =>
      Array.from(
        new Set(
          (proxyReport?.hosts ?? [])
            .filter((h) => h.via === 'fallback')
            .map((h) => String(h.host || '').trim())
            .filter(Boolean),
        ),
      ),
    [proxyReport],
  )
  useEffect(() => {
    if (advancedMode) return
    if (!fallbackDomains.length) return
    const sender = useAppStore.getState().settings?.sender
    const existing = new Set(sender?.auto_domains ?? [])
    const fresh = fallbackDomains.filter((d) => !existing.has(d))
    if (fresh.length) {
      void useAppStore
        .getState()
        .patchSection('sender', { auto_domains: [...existing, ...fresh] })
        .catch(() => undefined)
    }
    const toReport = fallbackDomains.filter((d) => !reportedDomainsRef.current.has(d))
    if (toReport.length) {
      toReport.forEach((d) => reportedDomainsRef.current.add(d))
      void reportMissingDomains(toReport)
    }
  }, [advancedMode, fallbackDomains])

  // 一键加入并重启 singbox: 用已持久化(含 auto_domains)的发送端配置重启, 使新域名即时走代理。
  const applyMissingDomains = useCallback(async () => {
    const sender = useAppStore.getState().settings?.sender
    if (!sender) return
    setRestartingProxy(true)
    try {
      await api.startSender(sender)
      toast.success(
        t('已加入并重启代理，正在重新检测…', 'Added and restarted the proxy. Checking again…'),
      )
      window.setTimeout(() => void runProxyCheck(), 1500)
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t('重启代理失败', 'Could not restart the proxy'),
      )
    } finally {
      setRestartingProxy(false)
    }
  }, [runProxyCheck, t])

  // 代理检测状态色: 只要有任何域名没走代理(回落) 或会话未走代理/检测失败 -> 直接爆红;
  // 全部走代理才是绿。(按需求: 一旦发现有域名没走代理就红色告警, 提醒补进清单。)
  const fallbackCount = proxyReport?.fallbackCount ?? 0
  const expectsProxy = proxyReport?.expectedProxy !== false
  const proxyTone: 'ok' | 'bad' | 'idle' = !proxyReport
    ? 'idle'
    : !proxyReport.ok ||
        (expectsProxy && !proxyReport.sessionProxied) ||
        (proxyReport.proxyMode === 'sender' && fallbackCount > 0)
      ? 'bad'
      : 'ok'

  // 当前代理方式标识: 统一梯子 / 机场节点(下发)。
  const airportMode =
    settings?.sender?.proxy_mode === 'airport' && Boolean(settings?.sender?.airport_outbound)
  const personalMode = settings?.sender?.proxy_mode === 'personal'
  const proxyModeLabel = advancedMode
    ? activeEnvironment
      ? activeRoute?.name || t('无可用内置线路', 'No built-in route available')
      : t('未选择环境', 'No environment selected')
    : managedDefaultRouteId
      ? managedDefaultRoute?.name || t('等待管理员线路', 'Waiting for the admin route')
      : personalMode
        ? t('个人代理', 'Personal proxy')
        : airportMode
          ? `${t('机场', 'Airport')}${settings?.sender?.airport_name ? ' · ' + safeText(settings.sender.airport_name) : ''}`
          : t('统一代理', 'Shared proxy')

  // 视图运行态 (供遮罩/导航按钮判断)。
  const view = {
    initialized: Boolean(activeTab?.webviewInitialized),
    loading: Boolean(activeTab?.webviewLoading),
    canGoBack: Boolean(activeTab?.canGoBack),
    canGoForward: Boolean(activeTab?.canGoForward),
    lastUrl: activeTab?.url ?? '',
  }

  const proxyHost = GPT_PROXY_HOST
  const proxyPort = resolveProxyPort(status.senderSocksPort ?? settings?.sender?.socks_listen_port)

  // 宿主可见 = 代理运行中 (面板已激活由 Shell 的条件渲染保证)。
  const hostVisible = networkReady && !translationReplacingHost
  const { hostRef, schedule } = useAiHostSync(kind, hostVisible, activeTabId, environmentId)

  // 全局只绑定一次 onAiEvent。
  useAiEvents()

  // 旧 ensureGptWorkspace / ensureGeminiWorkspace (现已同构)。
  const ensureWorkspace = useCallback(
    async (targetTabId: string, forceReload = false) => {
      if (!networkReady) return
      const store = useAiStore.getState()
      const tab = store.tabsByKind[kind].find((item) => item.id === targetTabId)
      if (!tab) return
      const userAgent = embeddedUserAgent()
      const lastUrl = tab.allowExternalBrowsing
        ? normalizeHttpUrl(tab.url)
        : normalizeUrlFor(kind, tab.url || homeUrlFor(kind))
      const requestKey = JSON.stringify([
        kind,
        tab.id,
        environmentId,
        proxyHost,
        proxyPort,
        lastUrl,
        userAgent,
        forceReload,
        tab.allowExternalBrowsing,
      ])
      return coalesceInFlight(ensureInFlightRef.current, requestKey, async () => {
        const payload = (await api.ensureAiWorkspace({
          kind,
          tabId: tab.id,
          partition: advancedMode ? undefined : partitionFor(kind),
          environmentId,
          host: proxyHost,
          port: proxyPort,
          homeUrl: homeUrlFor(kind),
          lastUrl,
          userAgent,
          forceReload,
          allowExternalBrowsing: tab.allowExternalBrowsing,
        })) as AiEventPayload | null
        if (payload && safeText(payload.tabId)) {
          useAiStore.getState().patchTab(kind, safeText(payload.tabId), {
            webviewInitialized:
              typeof payload.initialized === 'boolean'
                ? payload.initialized
                : tab.webviewInitialized,
            webviewLoading:
              typeof payload.loading === 'boolean' ? payload.loading : tab.webviewLoading,
          })
        }
      })
    },
    [kind, networkReady, proxyHost, proxyPort, advancedMode, environmentId],
  )

  // 面板激活 / 代理就绪时: 拉取标签列表并 ensure 工作区。
  const environmentRuntimeKey = advancedMode
    ? `${environmentId}:${activeRoute?.id || 'unavailable'}`
    : `base:${managedDefaultRouteId || 'legacy'}`

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        await api.activateAiEnvironment({ kind, environmentId })
        useAiStore.getState().setTabs(kind, [], '')
        const payload = (await api.listAiViews(kind)) as AiEventPayload
        if (!cancelled) applyAiTabsPayload(kind, payload)
      } catch {
        /* ignore */
      }
      if (!cancelled && networkReady) {
        try {
          const store = useAiStore.getState()
          if (!store.tabsByKind[kind].length) {
            const created = (await api.createAiView(kind, {
              lastUrl: homeUrlFor(kind),
              environmentId,
            })) as AiEventPayload
            if (!cancelled) applyAiTabsPayload(kind, created)
            // activeTabId 更新会触发下面的 effect，再统一执行 ensure，避免并发初始化同一视图。
            return
          }
          const targetTabId = useAiStore.getState().activeTabIdByKind[kind]
          if (targetTabId) await ensureWorkspace(targetTabId)
        } catch (err) {
          if (!cancelled) {
            reportWorkspaceError(err)
          }
        }
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, networkReady, environmentRuntimeKey])

  // 激活标签变化时重新 ensure, 让主进程切换/定位正确的 view。
  useEffect(() => {
    if (networkReady && activeTabId) void ensureWorkspace(activeTabId).catch(reportWorkspaceError)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabId])

  // ---- 控制条动作 (旧 navigateAiWorkspace) ----
  const navigate = useCallback(
    async (action: 'back' | 'forward' | 'reload') => {
      try {
        await api.navigateAiWorkspace({ kind, tabId: activeTabId, action })
      } catch (err) {
        reportWorkspaceError(err)
      }
    },
    [kind, activeTabId, reportWorkspaceError],
  )

  const goHome = useCallback(async () => {
    try {
      await api.navigateAiWorkspace({
        kind,
        tabId: activeTabId,
        action: 'load',
        url: homeUrlFor(kind),
      })
    } catch (err) {
      reportWorkspaceError(err)
    }
  }, [kind, activeTabId, reportWorkspaceError])

  // ---- 多标签动作 (GPT / Gemini 通用) ----
  const createTab = useCallback(async () => {
    try {
      const payload = (await api.createAiView(kind, {
        lastUrl: homeUrlFor(kind),
        environmentId,
      })) as AiEventPayload
      applyAiTabsPayload(kind, payload)
      const targetTabId = safeText(payload.activeTabId)
      if (networkReady && targetTabId) await ensureWorkspace(targetTabId)
    } catch (err) {
      reportWorkspaceError(err)
    }
  }, [kind, environmentId, networkReady, ensureWorkspace, reportWorkspaceError])

  const openWebPage = useCallback(async () => {
    if (kind !== 'claude') return
    const url = normalizeHttpUrl(addressValue, { assumeHttps: true })
    if (!url) {
      setFeedback(
        kind,
        t('请输入有效的 HTTP 或 HTTPS 网址', 'Enter a valid HTTP or HTTPS address'),
        'error',
      )
      return
    }

    try {
      const payload = (await api.createAiView(kind, {
        lastUrl: url,
        title: new URL(url).hostname,
        allowExternalBrowsing: true,
        environmentId,
      })) as AiEventPayload
      applyAiTabsPayload(kind, payload)
      setAddressValue(url)
      setWebAddressOpen(false)
      setFeedback(kind, '')
    } catch (err) {
      reportWorkspaceError(err)
    }
  }, [
    kind,
    t,
    addressValue,
    environmentId,
    setFeedback,
    reportWorkspaceError,
    setAddressValue,
    setWebAddressOpen,
  ])

  const switchTab = useCallback(
    async (tabId: string) => {
      if (!tabId || tabId === useAiStore.getState().activeTabIdByKind[kind]) return
      try {
        const payload = (await api.switchAiView(kind, { tabId })) as AiEventPayload
        applyAiTabsPayload(kind, payload)
        if (networkReady && safeText(payload.activeTabId) === tabId) await ensureWorkspace(tabId)
      } catch (err) {
        reportWorkspaceError(err)
      }
    },
    [kind, networkReady, ensureWorkspace, reportWorkspaceError],
  )

  const closeTab = useCallback(
    async (tabId: string) => {
      if (!tabId) return
      try {
        const payload = (await api.closeAiView(kind, { tabId })) as AiEventPayload
        applyAiTabsPayload(kind, payload)
        const targetTabId = safeText(payload.activeTabId)
        if (networkReady && targetTabId) await ensureWorkspace(targetTabId)
      } catch (err) {
        reportWorkspaceError(err)
      }
    },
    [kind, networkReady, ensureWorkspace, reportWorkspaceError],
  )

  // 运行态 / 遮罩内容变化时, 重新同步宿主定位。
  const overlayKey = `${networkReady}|${environmentId}|${activeTabId}|${view.initialized}|${webAddressOpen}|${proxyOpen}|${environmentPanelOpen}|${aiHeaderHidden}|${translationOpen}|${proxyReport?.hosts?.length ?? 0}|${feedback.text ? 1 : 0}`
  const overlayRef = useRef(overlayKey)
  useEffect(() => {
    if (overlayRef.current !== overlayKey) {
      overlayRef.current = overlayKey
      schedule()
    }
  }, [overlayKey, schedule])

  const Icon = meta.icon
  const runtimeLabel =
    advancedMode && !activeEnvironment
      ? t('暂无环境', 'No environment')
      : !networkReady
        ? t('等待线路', 'Waiting for route')
        : !activeTabId
          ? t('暂无会话', 'No session')
          : view.loading
            ? t('正在加载', 'Loading')
            : view.initialized
              ? t('已打开', 'Open')
              : t('准备打开', 'Getting ready')

  const overlay = resolveOverlay(
    kind,
    {
      networkReady,
      advancedMode,
      hasEnvironment: !advancedMode || Boolean(activeEnvironment),
      hasRoute: !advancedMode || Boolean(activeRoute),
      routeLabel: proxyModeLabel,
      hasTab: Boolean(activeTabId),
      initialized: view.initialized,
      proxyHost,
      proxyPort,
    },
    t,
  )

  return (
    <PanelScaffold
      icon={Icon}
      title={meta.title}
      hint={
        advancedMode
          ? `${t('独立环境', 'Separate environment')} · ${proxyModeLabel}`
          : t(meta.hint, meta.hintEn)
      }
      hideHeader={aiHeaderHidden}
      scrollable={false}
      toolbar={
        <Badge variant="outline" className="gap-1.5">
          <span
            className={
              view.loading
                ? 'size-1.5 animate-pulse rounded-full bg-primary'
                : 'size-1.5 rounded-full bg-muted-foreground'
            }
          />
          {runtimeLabel}
        </Badge>
      }
    >
      <div className="flex h-full min-h-0 flex-col">
        {/* 控制条 */}
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              title={t('主页', 'Home')}
              disabled={!networkReady}
              onClick={() => void goHome()}
            >
              <Home className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              title={t('后退', 'Back')}
              disabled={!view.canGoBack}
              onClick={() => void navigate('back')}
            >
              <ArrowLeft className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              title={t('前进', 'Forward')}
              disabled={!view.canGoForward}
              onClick={() => void navigate('forward')}
            >
              <ArrowRight className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              title={t('刷新', 'Reload')}
              disabled={!networkReady}
              onClick={() => void navigate('reload')}
            >
              <RotateCw className="size-4" />
            </Button>
          </div>

          <div className="h-5 w-px shrink-0 bg-border" />
          <GptTabBar
            tabs={tabs}
            activeTabId={activeTabId}
            disabled={!networkReady}
            onSwitch={(id) => void switchTab(id)}
            onClose={(id) => void closeTab(id)}
            onCreate={() => void createTab()}
          />

          <div className="ml-auto flex shrink-0 items-center gap-1">
            {advancedMode && (
              <>
                {environments.length > 0 && (
                  <select
                    value={environmentId}
                    aria-label={t('当前 AI 环境', 'Current AI environment')}
                    title={t('当前 AI 环境', 'Current AI environment')}
                    className="h-8 max-w-36 rounded-md border border-input bg-background px-2 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onChange={(event) =>
                      void selectEnvironment(event.target.value).catch(() =>
                        toast.error(t('切换环境失败', 'Could not switch environment')),
                      )
                    }
                  >
                    {environments.map((environment) => (
                      <option key={environment.id} value={environment.id}>
                        {environment.name}
                      </option>
                    ))}
                  </select>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    'size-8',
                    environmentPanelOpen && 'bg-accent text-accent-foreground',
                  )}
                  title={
                    environments.length
                      ? t('管理环境与线路', 'Manage environments and routes')
                      : t('新建 AI 环境', 'New AI environment')
                  }
                  onClick={() => setEnvironmentPanelOpen((open) => !open)}
                >
                  <SlidersHorizontal className="size-4" />
                </Button>
              </>
            )}
            {kind === 'claude' && (
              <Button
                variant="ghost"
                size="icon"
                className={cn('size-8', webAddressOpen && 'bg-accent text-accent-foreground')}
                title={
                  webAddressOpen
                    ? t('收起网址输入', 'Hide address bar')
                    : t('打开网页', 'Open a web page')
                }
                aria-label={
                  webAddressOpen
                    ? t('收起网址输入', 'Hide address bar')
                    : t('打开网页', 'Open a web page')
                }
                aria-pressed={webAddressOpen}
                disabled={!networkReady}
                onClick={() => setWebAddressOpen((open) => !open)}
              >
                <Globe2 className="size-4" />
              </Button>
            )}
            <Badge
              variant="outline"
              title={t('当前网络线路', 'Current network route')}
              className={cn(
                'h-7 gap-1 px-2 font-normal',
                airportMode ? 'border-primary/50 text-primary' : 'text-muted-foreground',
              )}
            >
              {proxyModeLabel}
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'h-8 gap-1.5 px-2',
                // 有域名没走代理 -> 爆红: 红底红字, 醒目提示去看/补清单。
                proxyTone === 'bad' &&
                  'bg-destructive/15 text-destructive hover:bg-destructive/25 hover:text-destructive',
              )}
              title={
                proxyTone === 'bad'
                  ? t(
                      `警告: 有 ${fallbackCount} 个域名没走代理！点击查看`,
                      `Warning: ${fallbackCount} domains bypassed the proxy! Click to view`,
                    )
                  : t(
                      '检测此页面流量是否全部经代理',
                      "Check whether all of this page's traffic goes through the proxy",
                    )
              }
              disabled={!networkReady}
              onClick={toggleProxyPanel}
            >
              {proxyTone === 'ok' ? (
                <ShieldCheck className="size-4 text-emerald-500" />
              ) : proxyTone === 'bad' ? (
                <ShieldX className="size-4 text-destructive" />
              ) : (
                // 未检测(前 20s / 未点击): 中性默认色 (夜间白 / 白天黑)。
                <ShieldCheck className="size-4 text-foreground" />
              )}
              <span className="text-xs font-medium">{t('代理检测', 'Proxy check')}</span>
              {proxyTone === 'bad' && fallbackCount > 0 && (
                <span className="ml-0.5 grid min-w-4 animate-pulse place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                  {fallbackCount}
                </span>
              )}
            </Button>
            {translationAllowed && (
              <Button
                variant="ghost"
                size="icon"
                className={cn('size-8', translationOpen && 'bg-accent text-accent-foreground')}
                title={
                  translationOpen
                    ? t('关闭翻译侧栏', 'Close translation panel')
                    : t('打开翻译侧栏', 'Open translation panel')
                }
                aria-label={
                  translationOpen
                    ? t('关闭翻译侧栏', 'Close translation panel')
                    : t('打开翻译侧栏', 'Open translation panel')
                }
                aria-pressed={translationOpen}
                onClick={() => toggleTranslation(kind, activeTabId, environmentId)}
              >
                <Languages className="size-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              title={
                sidebarHidden
                  ? t('显示侧栏', 'Show sidebar')
                  : t(
                      '隐藏侧栏 (只看网页, 按 Esc 恢复)',
                      'Hide sidebar (page only, press Esc to restore)',
                    )
              }
              onClick={toggleSidebarHidden}
            >
              {sidebarHidden ? (
                <PanelLeftOpen className="size-4" />
              ) : (
                <PanelLeftClose className="size-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              title={
                aiHeaderHidden
                  ? t('显示顶部信息栏', 'Show header')
                  : t('隐藏顶部信息栏 (按 Esc 恢复)', 'Hide header (press Esc to restore)')
              }
              aria-label={
                aiHeaderHidden
                  ? t('显示顶部信息栏', 'Show header')
                  : t('隐藏顶部信息栏', 'Hide header')
              }
              onClick={toggleAiHeaderHidden}
            >
              {aiHeaderHidden ? (
                <PanelTopOpen className="size-4" />
              ) : (
                <PanelTopClose className="size-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              title={
                isFullscreen
                  ? t('退出全屏 (F11)', 'Exit full screen (F11)')
                  : t('全屏 (F11)', 'Full screen (F11)')
              }
              onClick={toggleFullscreen}
            >
              {isFullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
            </Button>
          </div>
        </div>

        {advancedMode && environmentPanelOpen && (
          <AiEnvironmentPanel
            kind={kind}
            settings={advancedAi}
            routes={availableRoutes}
            preferredRouteId={managedDefaultRoute?.id}
            onChange={saveAdvancedAi}
            onClose={() => setEnvironmentPanelOpen(false)}
          />
        )}

        {kind === 'claude' && webAddressOpen && (
          <form
            className="flex shrink-0 items-center gap-2 border-b border-border bg-muted/20 px-3 py-1.5"
            onSubmit={(event) => {
              event.preventDefault()
              void openWebPage()
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setWebAddressOpen(false)
            }}
          >
            <Globe2 className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <Input
              ref={addressInputRef}
              data-testid="claude-address-input"
              type="text"
              inputMode="url"
              value={addressValue}
              onChange={(event) => setAddressValue(event.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder={t('输入网址', 'Enter an address')}
              aria-label={t('网页地址', 'Web address')}
              disabled={!networkReady}
              className="h-8 min-w-0 flex-1 font-mono text-xs"
            />
            <Button
              type="submit"
              variant="ghost"
              size="icon"
              className="size-8 shrink-0"
              title={t('在新标签页打开', 'Open in new tab')}
              aria-label={t('在新标签页打开', 'Open in new tab')}
              disabled={!networkReady || !addressValue.trim()}
            >
              <ArrowUpRight className="size-4" />
            </Button>
          </form>
        )}

        {/* Claude 提示: 不用就别打开此页, 防止潜在网络问题。可关闭(持久化 ui.claude_notice_dismissed)。 */}
        {kind === 'claude' && !settings?.ui?.claude_notice_dismissed && (
          <div className="flex shrink-0 items-start gap-2 border-b border-amber-500/40 bg-amber-500/10 px-4 py-1.5 text-xs text-amber-700 dark:text-amber-300">
            <span className="min-w-0 flex-1">
              {t(
                '如果不使用 Claude，建议不要打开/停留在此页面，以免触发潜在的网络问题。需要时再打开即可。',
                'If you are not using Claude, avoid opening or staying on this page to prevent possible network issues. Open it only when needed.',
              )}
            </span>
            <button
              type="button"
              title={t('关闭提示', 'Dismiss')}
              onClick={() =>
                void useAppStore.getState().patchSection('ui', { claude_notice_dismissed: true })
              }
              className="shrink-0 rounded p-0.5 text-amber-700/70 transition-colors hover:text-amber-700 dark:text-amber-300/70 dark:hover:text-amber-300"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )}

        {feedback.text && (
          <div
            role={feedback.tone === 'error' ? 'alert' : 'status'}
            className={cn(
              'flex shrink-0 items-start gap-2 border-b border-border px-4 py-1.5 text-xs',
              feedback.tone === 'error'
                ? 'bg-destructive/10 text-destructive'
                : 'bg-muted/40 text-muted-foreground',
            )}
          >
            <span className="min-w-0 flex-1 break-words">{feedback.text}</span>
            <button
              type="button"
              title={t('关闭提示', 'Dismiss')}
              aria-label={t(`关闭 ${meta.title} 提示`, `Dismiss ${meta.title} notice`)}
              onClick={() => setFeedback(kind, '')}
              className={cn(
                'shrink-0 rounded p-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                feedback.tone === 'error'
                  ? 'text-destructive/70 hover:bg-destructive/10 hover:text-destructive'
                  : 'text-muted-foreground/70 hover:bg-muted hover:text-muted-foreground',
              )}
            >
              <X className="size-3.5" />
            </button>
          </div>
        )}

        {pendingComposerConfirmation && (
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-amber-500/45 bg-amber-500/10 px-4 py-2 text-xs text-amber-800 dark:text-amber-200">
            <ShieldAlert className="size-4 shrink-0" />
            <span className="min-w-48 flex-1">
              {t(
                `当前内容可能不是网页接收语言（${pendingComposerConfirmation.targetLanguage.toUpperCase()}），是否仍要发送？`,
                `This text may not be in the page's expected language (${pendingComposerConfirmation.targetLanguage.toUpperCase()}). Send anyway?`,
              )}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7"
              onClick={() => void resolveComposerConfirmation(false)}
            >
              {t('取消', 'Cancel')}
            </Button>
            <Button
              size="sm"
              className="h-7"
              onClick={() => void resolveComposerConfirmation(true)}
            >
              {t('发送', 'Send')}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              title={t('关闭发送提示', 'Dismiss send prompt')}
              aria-label={t('关闭发送提示', 'Dismiss send prompt')}
              onClick={() => void resolveComposerConfirmation(false, false)}
            >
              <X className="size-3.5" />
            </Button>
          </div>
        )}

        {proxyOpen && (
          <div className="shrink-0 border-b border-border bg-muted/30">
            <ProxyReportPanel
              report={proxyReport}
              checking={proxyChecking}
              tone={proxyTone}
              applying={restartingProxy}
              onApply={applyMissingDomains}
              onRefresh={() => void runProxyCheck()}
              onClose={() => setProxyOpen(false)}
            />
          </div>
        )}

        {/* 原生 view 宿主 + 遮罩 */}
        <div ref={translationBodyRef} className="flex min-h-0 flex-1">
          <div className={cn('relative min-w-0 flex-1', translationReplacingHost && 'hidden')}>
            <div
              ref={hostRef}
              className="absolute inset-0"
              data-testid={`ai-workspace-host-${kind}`}
            />
            {overlay && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/95 p-6">
                <div className="max-w-md text-center">
                  <Icon className="mx-auto mb-3 size-10 text-muted-foreground" />
                  <h2 className="mb-1.5 text-base font-semibold">{overlay.title}</h2>
                  <p className="text-sm text-muted-foreground">{overlay.text}</p>
                </div>
              </div>
            )}
          </div>
          {translationOpen && translationLayout.mode === 'split' && (
            <div
              role="separator"
              aria-label={t('调整翻译栏宽度', 'Resize translation panel')}
              aria-orientation="vertical"
              aria-valuemin={TRANSLATION_PANEL_MIN_WIDTH}
              aria-valuemax={translationLayout.maximumPanelWidth}
              aria-valuenow={translationLayout.panelWidth}
              tabIndex={0}
              className="group relative w-1.5 shrink-0 cursor-col-resize bg-border/35 outline-none after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 after:bg-border hover:after:w-0.5 hover:after:bg-primary focus-visible:after:w-0.5 focus-visible:after:bg-ring"
              title={t(
                t(
                  '拖动调整翻译栏宽度，双击恢复默认',
                  'Drag to resize the translation panel; double-click to reset',
                ),
                'Drag to resize the translation panel; double-click to reset',
              )}
              onDoubleClick={() => setTranslationWidth(TRANSLATION_PANEL_DEFAULT_WIDTH, true)}
              onKeyDown={(event) => {
                if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
                event.preventDefault()
                const step = event.shiftKey ? 48 : 16
                const direction = event.key === 'ArrowLeft' ? 1 : -1
                const next = Math.min(
                  translationLayout.maximumPanelWidth,
                  Math.max(
                    TRANSLATION_PANEL_MIN_WIDTH,
                    translationLayout.panelWidth + direction * step,
                  ),
                )
                setTranslationWidth(next, true)
              }}
              onPointerDown={(event) => {
                translationDragRef.current = {
                  pointerId: event.pointerId,
                  startX: event.clientX,
                  startWidth: translationLayout.panelWidth,
                }
                event.currentTarget.setPointerCapture(event.pointerId)
              }}
              onPointerMove={(event) => {
                const drag = translationDragRef.current
                if (!drag || drag.pointerId !== event.pointerId) return
                const next = Math.min(
                  translationLayout.maximumPanelWidth,
                  Math.max(
                    TRANSLATION_PANEL_MIN_WIDTH,
                    drag.startWidth + drag.startX - event.clientX,
                  ),
                )
                setTranslationWidth(next)
              }}
              onPointerUp={(event) => {
                if (translationDragRef.current?.pointerId !== event.pointerId) return
                translationDragRef.current = null
                event.currentTarget.releasePointerCapture(event.pointerId)
                setTranslationWidth(preferredTranslationWidthRef.current, true)
              }}
              onPointerCancel={() => {
                translationDragRef.current = null
              }}
            />
          )}
          {translationOpen && (
            <TranslationPanel
              key={`${kind}:${environmentId}:${activeTabId}`}
              kind={kind}
              tabId={activeTabId}
              environmentId={environmentId}
              width={translationLayout.panelWidth}
              replacement={translationLayout.mode === 'replace'}
            />
          )}
        </div>
      </div>
    </PanelScaffold>
  )
}

// 遮罩状态决策, 对齐旧 updateGptRuntimeState / updateGeminiRuntimeState 的 overlay 分支。
function resolveOverlay(
  kind: AiKind,
  args: {
    networkReady: boolean
    advancedMode: boolean
    hasEnvironment: boolean
    hasRoute: boolean
    routeLabel: string
    hasTab: boolean
    initialized: boolean
    proxyHost: string
    proxyPort: string
  },
  t: (zh: string, en: string) => string,
): { title: string; text: string } | null {
  const {
    networkReady,
    advancedMode,
    hasEnvironment,
    hasRoute,
    routeLabel,
    hasTab,
    initialized,
    proxyHost,
    proxyPort,
  } = args
  const label = kind === 'gpt' ? 'ChatGPT' : kind === 'claude' ? 'Claude' : 'Gemini'

  if (!hasEnvironment) {
    return {
      title: t(`新建 ${label} 环境`, `Create a ${label} environment`),
      text: t(
        '点击上方环境管理按钮，新建一个独立登录环境。',
        'Use the environment button above to create a separate sign-in environment.',
      ),
    }
  }

  if (!hasRoute) {
    return {
      title: t('没有可用的内置线路', 'No built-in route available'),
      text: t(
        '请先配置统一代理或由管理员下发节点，然后重新开启内置代理。',
        'Set up the shared proxy or get a node from your admin, then start the built-in proxy again.',
      ),
    }
  }

  if (!networkReady) {
    return {
      title: t('当前线路尚未就绪', 'The route is not ready yet'),
      text: advancedMode
        ? t(
            `${routeLabel} 由 ShareGPT 内置 sing-box 提供，请先在「网络 / 代理」中开启代理。`,
            `${routeLabel} is provided by ShareGPT's built-in sing-box. Start the proxy in "Network / Proxy" first.`,
          )
        : t(
            `${routeLabel} 使用 ${proxyHost}:${proxyPort}。请先启动对应的本机代理。`,
            `${routeLabel} uses ${proxyHost}:${proxyPort}. Start that local proxy first.`,
          ),
    }
  }

  if (!hasTab) {
    return {
      title: t('当前没有打开的网页标签', 'No page tab is open'),
      text: t(
        `请点击上方的 + 按钮，新建一个 ${label} 标签页。`,
        `Click the + button above to open a new ${label} tab.`,
      ),
    }
  }

  if (!initialized) {
    if (kind === 'gemini') {
      return {
        title: t('准备打开 Gemini', 'Opening Gemini'),
        text: t(
          '正在初始化内置页面并连接本地代理。Google 登录可能会跳转到账号验证页面。',
          'Starting the embedded page and connecting to the local proxy. Google sign-in may redirect to an account check page.',
        ),
      }
    }
    return {
      title: t(`准备打开 ${label}`, `Opening ${label}`),
      text: t(
        '正在初始化内置页面并连接本地代理。第一次进入可能稍慢。',
        'Starting the embedded page and connecting to the local proxy. The first time may be slower.',
      ),
    }
  }

  return null
}
