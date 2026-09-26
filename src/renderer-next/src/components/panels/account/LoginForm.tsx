import { useEffect, useRef, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import {
  Loader2,
  LogIn,
  Download,
  Sparkles,
  X,
  Cable,
  Laptop,
  Building2,
  HardDrive,
  ShieldCheck,
  ArrowRight,
  ArrowLeft,
  Users,
  Settings2,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { api } from '@/lib/api'
import { useAppStore } from '@/store/useAppStore'
import { useAuth } from '@/hooks/useAuth'
import { autoLoginParams } from '@/lib/autoLogin'
import { isStaleAttemptError } from '@/lib/latestAttempt'
import { ImportActions } from './ImportActions'
import { BrowserPrivacySection } from './BrowserPrivacySection'
import { InterfaceSettings } from './InterfaceSettings'
import { compareVersions, checkGithubUpdate, type BootstrapUpdate } from './bootstrap'
import { LanguageSwitch } from '@/components/LanguageSwitch'
import { useI18n } from '@/hooks/useI18n'

// 登录页「发现新版本」提醒。自动更新源 = GitHub Releases (参考 cc-switch), 不再查询任何自建服务器,
// 与本机版本比较; 有新版且未被「不再提示」(按版本记忆) 时展示。GitHub 不可达 -> 静默不显示。
function LoginUpdateBanner() {
  const { t } = useI18n()
  const meta = useAppStore((s) => s.meta)
  const dismissed = useAppStore((s) => s.settings?.ui?.dismissed_update_versions)
  const patchSection = useAppStore((s) => s.patchSection)
  const [info, setInfo] = useState<BootstrapUpdate | null>(null)

  useEffect(() => {
    let alive = true
    void (async () => {
      const update = await checkGithubUpdate()
      if (alive) setInfo(update)
    })()
    return () => {
      alive = false
    }
  }, [])

  const current = String(meta.version || '')
  const latest = info?.version || ''
  const downloadUrl = info?.url || info?.htmlUrl || ''
  const hasNew = Boolean(latest && current && downloadUrl && compareVersions(latest, current) > 0)
  const isDismissed = Array.isArray(dismissed) && dismissed.includes(latest)
  if (!hasNew || isDismissed) return null

  async function dismiss() {
    const next = Array.from(new Set([...(dismissed ?? []), latest]))
    await patchSection('ui', { dismissed_update_versions: next }).catch(() => undefined)
  }

  return (
    <div className="w-full max-w-sm rounded-lg border border-primary/40 bg-primary/10 px-4 py-3">
      <div className="flex items-start gap-2">
        <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">
            {t('发现新版本', 'New version available')} <span className="selectable">v{latest}</span>
          </p>
          {info?.notes && (
            <p className="selectable mt-0.5 line-clamp-2 text-xs text-muted-foreground">
              {info.notes}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={dismiss}
          title={t('不再提示此版本', "Don't show this version again")}
          className="shrink-0 rounded p-0.5 text-muted-foreground/70 transition-colors hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Button size="sm" onClick={() => downloadUrl && void api.openExternal(downloadUrl)}>
          <Download />
          {t('下载新版本', 'Download')}
        </Button>
        <Button size="sm" variant="ghost" onClick={dismiss}>
          {t('不再提示', "Don't show again")}
        </Button>
      </div>
    </div>
  )
}

type ErrorField = 'server' | 'username' | 'password'
type WorkspaceEntryView = 'welcome' | 'choice' | 'organization' | 'personal'

// 未登录态: 居中登录表单。预填 store.settings.collab。
export function LoginForm() {
  const { t } = useI18n()
  const collab = useAppStore((s) => s.settings?.collab)
  const meta = useAppStore((s) => s.meta)
  const workspaceMode = useAppStore((s) => s.workspaceMode)
  const patchSection = useAppStore((s) => s.patchSection)
  const { login, enterPersonal } = useAuth()

  // 品牌名: 取 app 元信息 productName, 去掉「Sender/Receiver」后缀, 回退 ShareGPT。
  const brandName = String((meta?.productName as string) || 'ShareGPT').replace(
    /\s+(Sender|Receiver)$/i,
    '',
  )
  // 本表单既用于工作区入口，也用于个人工作区内登录组织账号。
  const showWorkspaceEntry = workspaceMode !== 'personal'
  const hasSeenWorkspaceIntro = Boolean(
    useAppStore.getState().settings?.ui?.workspace_entry_intro_done ||
    useAppStore.getState().settings?.ui?.onboarding_done,
  )

  const [serverUrl, setServerUrl] = useState(collab?.server_url ?? '')
  const [username, setUsername] = useState(collab?.last_username ?? '')
  const [rememberPassword, setRememberPassword] = useState(collab?.remember_password ?? false)
  const [password, setPassword] = useState(
    collab?.remember_password ? (collab?.saved_password ?? '') : '',
  )
  const [submitting, setSubmitting] = useState(false)
  const [enteringPersonal, setEnteringPersonal] = useState(false)
  const [showOrganizationLogin, setShowOrganizationLogin] = useState(false)
  const [entryView, setEntryView] = useState<WorkspaceEntryView>(() =>
    hasSeenWorkspaceIntro ? 'organization' : 'welcome',
  )
  // 内联错误条 + 出错字段 (用于 aria-invalid 触发红边)。
  const [error, setError] = useState('')
  const [errorField, setErrorField] = useState<ErrorField | null>(null)

  const serverRef = useRef<HTMLInputElement>(null)
  const usernameRef = useRef<HTMLInputElement>(null)
  // 登录失败时聚焦并选中密码框 (移植自旧 renderer.js focusCollabField("c_password", true) ~4688)。
  const passwordRef = useRef<HTMLInputElement>(null)
  const autoLoginAttempted = useRef(false)
  // React state does not synchronously guard two submit events in the same frame. Keep one
  // presentation owner so a duplicate click cannot start a second login transaction.
  const loginUiBusyRef = useRef(false)

  useEffect(() => {
    if (workspaceMode === 'personal') return
    const params = autoLoginParams(collab)
    if (!params || autoLoginAttempted.current || loginUiBusyRef.current) return
    autoLoginAttempted.current = true
    loginUiBusyRef.current = true
    setSubmitting(true)
    setError('')
    setErrorField(null)
    void login(params)
      .catch((err) => {
        if (isStaleAttemptError(err)) return
        const message =
          err instanceof Error
            ? err.message
            : t('自动登录失败，请重新登录', 'Automatic sign-in failed. Please sign in again')
        setError(t(`自动登录失败：${message}`, `Automatic sign-in failed: ${message}`))
        setErrorField('password')
      })
      .finally(() => {
        loginUiBusyRef.current = false
        setSubmitting(false)
      })
  }, [collab, login, workspaceMode, t])

  function focusField(field: ErrorField, select = false) {
    const ref = field === 'server' ? serverRef : field === 'username' ? usernameRef : passwordRef
    window.setTimeout(() => {
      ref.current?.focus()
      if (select) ref.current?.select()
    }, 0)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (loginUiBusyRef.current || submitting || enteringPersonal) return

    // 提交前必填校验: 聚焦首个空字段并显示内联错误 (旧 collabLogin -> performCollabLogin 校验)。
    const trimmedServer = serverUrl.trim()
    const trimmedUser = username.trim()
    if (!trimmedServer) {
      setError(t('请填写服务地址', 'Enter the server address'))
      setErrorField('server')
      focusField('server')
      return
    }
    if (!trimmedUser) {
      setError(t('请填写账号', 'Enter your username'))
      setErrorField('username')
      focusField('username')
      return
    }
    if (!password) {
      setError(t('请填写密码', 'Enter your password'))
      setErrorField('password')
      focusField('password')
      return
    }

    setError('')
    setErrorField(null)
    loginUiBusyRef.current = true
    setSubmitting(true)
    try {
      if (!hasSeenWorkspaceIntro) {
        await patchSection('ui', { workspace_entry_intro_done: true }).catch(() => undefined)
      }
      const profile = await login({ serverUrl, username, password, rememberPassword })
      toast.success(
        t(`登录成功，欢迎 ${profile.displayName}`, `Signed in. Welcome, ${profile.displayName}`),
      )
    } catch (err) {
      if (isStaleAttemptError(err)) return
      const message =
        err instanceof Error
          ? err.message
          : t('登录失败，请稍后重试', 'Sign-in failed. Please try again later')
      toast.error(message)
      // 内联持久错误条 + 红边密码框 + 聚焦选中 (对齐旧版失败聚焦密码语义)。
      setError(message)
      setErrorField('password')
      focusField('password', true)
    } finally {
      loginUiBusyRef.current = false
      setSubmitting(false)
    }
  }

  async function handleEnterPersonal() {
    if (enteringPersonal) return
    setEnteringPersonal(true)
    setError('')
    setErrorField(null)
    try {
      if (!hasSeenWorkspaceIntro) {
        await patchSection('ui', { workspace_entry_intro_done: true }).catch(() => undefined)
      }
      await enterPersonal()
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : t(
              '个人工作区初始化失败，请重试',
              'Could not set up the personal workspace. Please try again',
            )
      toast.error(message)
      setError(message)
    } finally {
      setEnteringPersonal(false)
    }
  }

  function chooseEntry(view: Extract<WorkspaceEntryView, 'organization' | 'personal'>) {
    setEntryView(view)
  }

  const showOrganizationEntry = showWorkspaceEntry && entryView === 'organization'

  if (showWorkspaceEntry && entryView === 'welcome') {
    return (
      <div className="h-full overflow-y-auto">
        <div className="grid min-h-full place-items-center p-6">
          <main
            className="workspace-entry-step mx-auto flex w-full max-w-lg flex-col items-center text-center"
            aria-labelledby="workspace-welcome-title"
          >
            <div className="workspace-entry-mark grid size-16 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
              <Cable className="size-8" />
            </div>
            <LanguageSwitch className="mt-6" />
            <p className="mt-4 text-sm font-medium text-primary">
              {t('首次设置', 'First-time setup')}
            </p>
            <h1 id="workspace-welcome-title" className="mt-2 text-3xl font-semibold">
              {t(`欢迎来到 ${brandName}`, `Welcome to ${brandName}`)}
            </h1>
            <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
              {t(
                '你可以连接团队一起协作，也可以只在这台电脑上独立使用。接下来选择本次启动要进入的工作区。',
                'Connect to a team to work together, or use it on this computer only. Next, choose which workspace to open.',
              )}
            </p>
            <Button size="lg" className="mt-8 min-w-40" onClick={() => setEntryView('choice')}>
              {t('开始设置', 'Get started')}
              <ArrowRight />
            </Button>
            <p className="mt-4 text-xs text-muted-foreground">
              {t(
                '稍后仍可切换，选择不会删除已有数据',
                'You can switch later. Choosing does not delete any data.',
              )}
            </p>
          </main>
        </div>
      </div>
    )
  }

  if (showWorkspaceEntry && entryView === 'choice') {
    return (
      <div className="h-full overflow-y-auto">
        <div className="grid min-h-full place-items-center p-6">
          <main
            className="workspace-entry-step mx-auto w-full max-w-xl"
            aria-labelledby="workspace-choice-title"
          >
            <div className="text-center">
              <p className="text-sm font-medium text-primary">
                {t('选择使用方式', 'Choose how to use it')}
              </p>
              <h1 id="workspace-choice-title" className="mt-2 text-2xl font-semibold">
                {t('这次要进入哪个工作区？', 'Which workspace do you want to open?')}
              </h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {t(
                  '两种方式可以随时切换，配置、账号和 AI 网页会话分别持久保存。',
                  'You can switch at any time. Settings, accounts and AI sessions are saved separately for each.',
                )}
              </p>
            </div>

            <div className="mt-7 grid gap-3">
              <button
                type="button"
                className="group flex w-full items-start gap-4 rounded-lg border border-border bg-card p-5 text-left shadow-xs transition-[border-color,background-color,box-shadow] hover:border-primary/50 hover:bg-accent/35 hover:shadow-sm focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                onClick={() => chooseEntry('organization')}
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                  <Users className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-3">
                    <span className="font-medium">{t('连接团队', 'Connect to a team')}</span>
                    <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none" />
                  </span>
                  <span className="mt-1 block text-sm leading-6 text-muted-foreground">
                    {t(
                      '登录团队服务器，使用协作聊天、在线成员、管理员分配的线路与组织用量服务。',
                      'Sign in to your team server for team chat, online members, admin-assigned routes and team usage.',
                    )}
                  </span>
                </span>
              </button>

              <button
                type="button"
                className="group flex w-full items-start gap-4 rounded-lg border border-border bg-card p-5 text-left shadow-xs transition-[border-color,background-color,box-shadow] hover:border-primary/50 hover:bg-accent/35 hover:shadow-sm focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                onClick={() => chooseEntry('personal')}
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-foreground">
                  <Laptop className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-3">
                    <span className="font-medium">
                      {t('仅在本机使用', 'Use on this computer only')}
                    </span>
                    <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none" />
                  </span>
                  <span className="mt-1 block text-sm leading-6 text-muted-foreground">
                    {t(
                      '无需团队账号。自行配置个人代理和翻译服务，不显示聊天、成员和团队管理功能。',
                      'No team account needed. Set up your own proxy and translation service; chat, members and team management are hidden.',
                    )}
                  </span>
                </span>
              </button>
            </div>

            <p className="mt-5 flex items-start justify-center gap-2 text-xs leading-5 text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-primary" />
              {t(
                '个人与团队数据互相隔离；切换不会迁移、覆盖或清除另一侧内容。',
                'Personal and team data are kept apart. Switching never moves, overwrites or clears the other side.',
              )}
            </p>
          </main>
        </div>
      </div>
    )
  }

  if (showWorkspaceEntry && entryView === 'personal') {
    return (
      <div className="h-full overflow-y-auto">
        <div className="grid min-h-full place-items-center p-6">
          <main
            className="workspace-entry-step mx-auto w-full max-w-lg"
            aria-labelledby="personal-entry-title"
          >
            <Button
              variant="ghost"
              size="sm"
              className="-ml-2"
              onClick={() => setEntryView('choice')}
            >
              <ArrowLeft />
              {t('返回选择使用方式', 'Back to choices')}
            </Button>
            <div className="mt-5">
              <div className="grid size-12 place-items-center rounded-xl bg-primary/10 text-primary">
                <Laptop className="size-6" />
              </div>
              <h1 id="personal-entry-title" className="mt-5 text-2xl font-semibold">
                {t('在本机独立使用', 'Use on this computer')}
              </h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {t(
                  '适合不需要团队协作、希望自行管理代理和翻译服务的使用场景。',
                  'For solo use with your own proxy and translation.',
                )}
              </p>
            </div>

            <div className="mt-6 divide-y divide-border rounded-lg border border-border bg-card px-4">
              <div className="flex gap-3 py-4">
                <Settings2 className="mt-0.5 size-4 shrink-0 text-primary" />
                <div>
                  <p className="text-sm font-medium">
                    {t('配置由你管理', 'You manage the settings')}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {t(
                      '个人代理、翻译接口和相关偏好只归当前本机工作区使用。',
                      'Proxy, translation and preferences stay in this workspace.',
                    )}
                  </p>
                </div>
              </div>
              <div className="flex gap-3 py-4">
                <HardDrive className="mt-0.5 size-4 shrink-0 text-primary" />
                <div>
                  <p className="text-sm font-medium">
                    {t('网页会话独立保存', 'Sessions saved separately')}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {t(
                      'ChatGPT、Claude 和 Gemini 使用个人专属分区，不读取任何团队账号的登录状态或历史会话。',
                      'ChatGPT, Claude and Gemini keep their own sign-ins, apart from any team account.',
                    )}
                  </p>
                </div>
              </div>
              <div className="flex gap-3 py-4">
                <Users className="mt-0.5 size-4 shrink-0 text-primary" />
                <div>
                  <p className="text-sm font-medium">
                    {t('以后仍可连接团队', 'You can join a team later')}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {t(
                      '进入后打开侧栏底部的“账户”，选择“登录组织工作区”即可切换；两侧数据都会继续保留。',
                      'Open "Account" in the sidebar, then "Sign in to team workspace". Both sides keep their data.',
                    )}
                  </p>
                </div>
              </div>
            </div>

            <Button
              size="lg"
              className="mt-6 w-full"
              onClick={() => void handleEnterPersonal()}
              disabled={enteringPersonal}
            >
              {enteringPersonal ? <Loader2 className="animate-spin" /> : <Laptop />}
              {enteringPersonal
                ? t('正在准备个人工作区…', 'Preparing the personal workspace…')
                : t('进入个人工作区', 'Open personal workspace')}
            </Button>
            {error && (
              <p
                role="alert"
                className="mt-3 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {error}
              </p>
            )}
          </main>
        </div>
      </div>
    )
  }

  return (
    // 外层只负责竖向滚动(窗口矮时), 内层 grid 居中一列 max-w-sm 内容,
    // 避免 flex + overflow 同时作用时出现的横向偏移。
    <div className="h-full overflow-y-auto">
      <div
        className={`grid min-h-full p-6 ${showWorkspaceEntry ? 'place-items-center' : 'items-start'}`}
      >
        <div
          className={`mx-auto flex w-full flex-col items-center gap-3 ${showWorkspaceEntry ? 'max-w-sm' : 'max-w-xl'}`}
        >
          <LoginUpdateBanner />

          {!showWorkspaceEntry && (
            <div className="flex w-full items-start gap-3 rounded-md border border-border bg-muted/35 px-4 py-3">
              <Laptop className="mt-0.5 size-4 shrink-0 text-primary" />
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {t('当前：个人工作区', 'Current: personal workspace')}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  {t(
                    '个人代理、翻译配置和 AI 网页会话使用独立本机分区。登录组织后会切换到该账号自己的配置与网页会话。',
                    "Your personal proxy, translation settings and AI sessions use separate local storage. Signing in to a team switches to that account's own settings and sessions.",
                  )}
                </p>
              </div>
            </div>
          )}

          {showWorkspaceEntry && (
            <Button
              variant="ghost"
              size="sm"
              className="self-start"
              onClick={() => setEntryView('choice')}
            >
              <ArrowLeft />
              {t('返回选择使用方式', 'Back to choices')}
            </Button>
          )}

          <div className="w-full">
            {showOrganizationEntry || showOrganizationLogin ? (
              <Card className="w-full">
                <CardHeader className="text-center">
                  <CardTitle className="flex items-center justify-center gap-2 text-xl">
                    <Building2 className="size-5 text-primary" />
                    {showWorkspaceEntry
                      ? t('连接团队', 'Connect to a team')
                      : t('登录组织工作区', 'Sign in to team workspace')}
                  </CardTitle>
                  <CardDescription>
                    {showWorkspaceEntry
                      ? t(
                          '使用团队提供的服务地址和账号登录',
                          'Sign in with the server address and account from your team',
                        )
                      : t(
                          '登录后切换到该账号的独立配置和网页会话',
                          "Signing in switches to that account's own settings and sessions",
                        )}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form className="grid gap-4" onSubmit={handleSubmit}>
                    <div className="grid gap-2">
                      <Label htmlFor="account-server">{t('服务地址', 'Server address')}</Label>
                      <Input
                        ref={serverRef}
                        id="account-server"
                        placeholder="http://example.com:8088"
                        autoComplete="off"
                        spellCheck={false}
                        value={serverUrl}
                        onChange={(e) => setServerUrl(e.target.value)}
                        disabled={submitting || enteringPersonal}
                        aria-invalid={errorField === 'server' || undefined}
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="account-username">{t('账号', 'Username')}</Label>
                      <Input
                        ref={usernameRef}
                        id="account-username"
                        placeholder={t('用户名', 'Username')}
                        autoComplete="username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        disabled={submitting || enteringPersonal}
                        aria-invalid={errorField === 'username' || undefined}
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="account-password">{t('密码', 'Password')}</Label>
                      <Input
                        ref={passwordRef}
                        id="account-password"
                        type="password"
                        placeholder={t('密码', 'Password')}
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        disabled={submitting || enteringPersonal}
                        aria-invalid={errorField === 'password' || undefined}
                      />
                    </div>

                    <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                      <Label
                        htmlFor="account-remember"
                        className="cursor-pointer text-sm font-normal"
                      >
                        {t('记住密码', 'Remember password')}
                      </Label>
                      <Switch
                        id="account-remember"
                        checked={rememberPassword}
                        onCheckedChange={setRememberPassword}
                        disabled={submitting || enteringPersonal}
                      />
                    </div>

                    {error && (
                      <p
                        role="alert"
                        className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                      >
                        {error}
                      </p>
                    )}

                    <Button
                      type="submit"
                      className="w-full"
                      disabled={submitting || enteringPersonal}
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="animate-spin" />
                          {t('登录中…', 'Signing in…')}
                        </>
                      ) : (
                        <>
                          <LogIn />
                          {t('登录', 'Sign in')}
                        </>
                      )}
                    </Button>
                  </form>

                  {showWorkspaceEntry && (
                    <>
                      <Separator className="my-4" />
                      <div className="grid gap-2">
                        <p className="text-xs text-muted-foreground">
                          {t(
                            '从备份文件恢复本机配置或资料包',
                            'Restore local settings or data from a backup file',
                          )}
                        </p>
                        <ImportActions />
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card className="w-full">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Building2 className="size-4 text-primary" />
                    {t('组织协作（可选）', 'Team collaboration (optional)')}
                  </CardTitle>
                  <CardDescription>
                    {t(
                      '需要协作聊天、在线成员、管理员线路或组织用量时，再登录组织工作区。',
                      'Sign in to a team workspace when you need team chat, online members, admin routes or team usage.',
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => setShowOrganizationLogin(true)}
                  >
                    <LogIn />
                    {t('登录组织工作区', 'Sign in to team workspace')}
                    <ArrowRight className="ml-auto" />
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>

          {!showWorkspaceEntry && (
            <>
              <InterfaceSettings />
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{t('本机资料', 'Local data')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <ImportActions />
                </CardContent>
              </Card>
              <BrowserPrivacySection />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
