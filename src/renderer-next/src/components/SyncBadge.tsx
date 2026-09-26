import { Cloud, CloudOff, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSyncStatus, type SyncKind } from '@/lib/cloudSync'
import { useI18n } from '@/hooks/useI18n'

// 云端同步状态小指示器 (放在个人日历 / 待办面板顶部)。
//  synced=已同步, syncing=同步中, local=仅本地(未登录/服务器不支持), error=同步出错, off=未启用。
export function SyncBadge({ kind, className }: { kind: SyncKind; className?: string }) {
  const state = useSyncStatus((s) => s[kind])
  const { t } = useI18n()

  const meta = {
    synced: { Icon: Cloud, text: t('云端已同步', 'Synced'), cls: 'text-emerald-500' },
    syncing: { Icon: RefreshCw, text: t('同步中…', 'Syncing…'), cls: 'text-primary' },
    local: { Icon: CloudOff, text: t('仅本地', 'Local only'), cls: 'text-muted-foreground' },
    error: { Icon: CloudOff, text: t('同步出错', 'Sync error'), cls: 'text-destructive' },
    off: { Icon: Cloud, text: t('未同步', 'Not synced'), cls: 'text-muted-foreground' },
  }[state]

  const Icon = meta.Icon
  return (
    <span
      title={
        state === 'local'
          ? t(
              '未登录或服务器暂不支持，数据仅保存在本机',
              'Not signed in or not supported by the server; data stays on this computer',
            )
          : state === 'synced'
            ? t('已与云端同步，可多端实时共享', 'Synced to the cloud and shared across devices')
            : meta.text
      }
      className={cn('inline-flex items-center gap-1.5 text-sm', meta.cls, className)}
    >
      <Icon className={cn('size-4', state === 'syncing' && 'animate-spin')} />
      <span className="hidden sm:inline">{meta.text}</span>
    </span>
  )
}
