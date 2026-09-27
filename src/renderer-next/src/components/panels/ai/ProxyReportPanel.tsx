import { ShieldCheck, ShieldAlert, ShieldX, Loader2, RotateCw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { AiProxyReport } from '@/types/api'
import { useI18n } from '@/hooks/useI18n'

// 代理检测结果面板 (宿主上方的可折叠块)。逐域展示页面流量去向:
// 走代理(梯子) vs 回落(本机代理/直连)。回落域名即未走代理, 可补进路由清单。
export function ProxyReportPanel({
  report,
  checking,
  tone,
  applying,
  onApply,
  onRefresh,
  onClose,
}: {
  report: AiProxyReport | null
  checking: boolean
  tone: 'ok' | 'warn' | 'bad' | 'idle'
  applying: boolean
  onApply: () => void
  onRefresh: () => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const hosts = report?.hosts ?? []
  const proxyHosts = hosts.filter((h) => h.via === 'proxy')
  const fallbackHosts = hosts.filter((h) => h.via === 'fallback')
  const dedicatedProxy = report?.expectedProxy !== false
  const senderRoute = report?.proxyMode === 'sender'

  const summary =
    !report || !report.ok
      ? checking
        ? t('正在检测页面流量去向…', "Checking where this page's traffic goes…")
        : report?.reason === 'no-workspace'
          ? t('请先打开一个网页标签，再进行检测。', 'Open a page tab first, then run the check.')
          : t(
              '暂时无法检测，请刷新页面后重试。',
              'Cannot check right now. Reload the page and try again.',
            )
      : !dedicatedProxy
        ? t(
            `当前使用${report.proxyLabel || '直连/系统'}线路，共访问 ${hosts.length} 个域名。`,
            `Using the ${report.proxyLabel || 'direct/system'} route; ${hosts.length} domains visited.`,
          )
        : !report.sessionProxied
          ? t(
              `线路绑定错误：预期 SOCKS ${report.expectedSessionProxy || '未确定'}，实际 ${report.sessionProxy || 'DIRECT'}。页面访问已被阻止。`,
              `Route binding error: expected SOCKS ${report.expectedSessionProxy || 'unknown'}, got ${report.sessionProxy || 'DIRECT'}. The page was blocked.`,
            )
          : fallbackHosts.length > 0
            ? t(
                `共 ${hosts.length} 个域名：${proxyHosts.length} 个经代理（梯子），${fallbackHosts.length} 个回落（本机代理/直连，未走代理）。`,
                `${hosts.length} domains: ${proxyHosts.length} through the proxy, ${fallbackHosts.length} fell back (local proxy/direct, not through the proxy).`,
              )
            : t(
                `此页面流量已全部经代理（梯子）访问，共 ${hosts.length} 个域名。`,
                `All of this page's traffic went through the proxy (${hosts.length} domains).`,
              )

  const SummaryIcon =
    tone === 'ok'
      ? ShieldCheck
      : tone === 'warn'
        ? ShieldAlert
        : tone === 'bad'
          ? ShieldX
          : ShieldCheck
  const summaryColor =
    tone === 'ok'
      ? 'text-emerald-600 dark:text-emerald-400'
      : tone === 'warn'
        ? 'text-amber-600 dark:text-amber-400'
        : tone === 'bad'
          ? 'text-destructive'
          : 'text-muted-foreground'

  return (
    <div className="px-4 py-3">
      <div className="mb-2 flex items-center gap-2">
        <SummaryIcon className={`size-4 shrink-0 ${summaryColor}`} />
        <span className="text-sm font-medium">{t('代理检测', 'Proxy check')}</span>
        {report?.socksEndpoint && senderRoute && (
          <Badge variant="outline" className="font-mono text-[11px]">
            {t('出口', 'Exit')} socks5://{report.socksEndpoint}
          </Badge>
        )}
        {report?.expectedSessionProxy && !senderRoute && (
          <Badge variant="outline" className="font-mono text-[11px]">
            {t('预期', 'Expected')} socks5://{report.expectedSessionProxy}
          </Badge>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            title={t('重新检测', 'Check again')}
            disabled={checking}
            onClick={onRefresh}
          >
            {checking ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RotateCw className="size-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            title={t('收起', 'Close')}
            onClick={onClose}
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>

      <p className={`mb-2 text-xs ${summaryColor}`}>{summary}</p>

      {report?.ok && senderRoute && fallbackHosts.length > 0 && (
        <div className="mb-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <div className="flex items-start gap-2">
            <ShieldX className="mt-0.5 size-4 shrink-0" />
            <span>
              <b>
                {t(
                  `有 ${fallbackHosts.length} 个域名没走代理！`,
                  `${fallbackHosts.length} domains bypassed the proxy!`,
                )}
              </b>
              {t(
                '这些流量从你的真实 IP 出网（未经梯子）。已自动加入本机代理清单并上报管理员，点下方按钮重启代理即可生效。',
                'This traffic left from your real IP (not through the proxy). The domains were added to the local proxy list and reported to your admin; restart the proxy below to apply.',
              )}
            </span>
          </div>
          <Button size="sm" className="mt-2 h-7 gap-1.5" disabled={applying} onClick={onApply}>
            {applying ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <ShieldCheck className="size-3.5" />
            )}
            {applying
              ? t('重启中…', 'Restarting…')
              : t(
                  `一键加入并重启 singbox（${fallbackHosts.length}）`,
                  `Add and restart sing-box (${fallbackHosts.length})`,
                )}
          </Button>
        </div>
      )}

      {hosts.length > 0 && (
        <ScrollArea className="max-h-44 rounded-md border border-border bg-background/60">
          <div className="selectable space-y-2 p-2">
            {!dedicatedProxy && (
              <div>
                <div className="mb-1 px-1 text-[11px] font-medium text-muted-foreground">
                  {report?.proxyLabel || t('直连/系统线路', 'Direct/system route')} ({hosts.length})
                </div>
                <div className="flex flex-wrap gap-1">
                  {hosts.map((host) => (
                    <span
                      key={host.host}
                      className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
                    >
                      {host.host}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {dedicatedProxy && fallbackHosts.length > 0 && (
              <div>
                <div className="mb-1 px-1 text-[11px] font-bold text-destructive">
                  {t('未走代理 · 回落本机代理/直连', 'Not proxied · local proxy/direct')} (
                  {fallbackHosts.length})
                </div>
                <div className="flex flex-wrap gap-1">
                  {fallbackHosts.map((h) => (
                    <span
                      key={h.host}
                      className="rounded bg-destructive/15 px-1.5 py-0.5 font-mono text-[11px] font-medium text-destructive"
                    >
                      {h.host}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {proxyHosts.length > 0 && (
              <div>
                <div className="mb-1 px-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                  {t('走代理 · 梯子', 'Through the proxy')} ({proxyHosts.length})
                </div>
                <div className="flex flex-wrap gap-1">
                  {proxyHosts.map((h) => (
                    <span
                      key={h.host}
                      className="rounded bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[11px] text-emerald-700 dark:text-emerald-300"
                    >
                      {h.host}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      )}

      {report?.ok && senderRoute && fallbackHosts.length > 0 && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          {t(
            '提示：回落域名未经代理（梯子）出网。若希望它们也走梯子，需要把对应域名加入发送路由清单。',
            'Tip: fallback domains did not go through the proxy. To send them through it, add them to the routing list.',
          )}
        </p>
      )}
    </div>
  )
}
