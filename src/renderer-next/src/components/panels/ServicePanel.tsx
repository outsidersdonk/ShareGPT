import { Cable } from 'lucide-react'
import { PanelScaffold } from './PanelScaffold'
import { Badge } from '@/components/ui/badge'
import { useAppStore } from '@/store/useAppStore'
import { SenderForm } from './service/SenderForm'
import { isSenderRunning } from './service/helpers'
import { useI18n } from '@/hooks/useI18n'

// 本客户端只做「发送端」: 内嵌 sing-box 把指定流量代理转发到用户另行部署的接收端。
// 接收端不在本客户端范围内, 故不提供接收服务 UI。
export function ServicePanel() {
  const { t } = useI18n()
  const status = useAppStore((s) => s.status)
  const running = isSenderRunning(status)

  return (
    <PanelScaffold
      icon={Cable}
      title={t('代理转发', 'Proxy')}
      hint={t(
        t(
          '内嵌 sing-box · 把指定流量转发到接收端',
          'Built-in sing-box · forwards selected traffic to the exit',
        ),
        'Built-in sing-box · forwards selected traffic to the exit',
      )}
      toolbar={
        <Badge variant={running ? 'default' : 'outline'} className="gap-1.5">
          <span
            className={
              running
                ? 'size-1.5 rounded-full bg-success'
                : 'size-1.5 rounded-full bg-muted-foreground'
            }
          />
          {running ? t('运行中', 'Running') : t('未开启', 'Stopped')}
        </Badge>
      }
    >
      <div className="mx-auto max-w-3xl px-6 py-6">
        <SenderForm />
      </div>
    </PanelScaffold>
  )
}
