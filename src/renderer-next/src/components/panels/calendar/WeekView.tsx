import { eachDayOfInterval, endOfWeek, startOfWeek } from 'date-fns'
import { weekStartsOn } from '@/lib/i18n'
import { useI18n } from '@/hooks/useI18n'
import { TimeGridView } from './TimeGridView'

// 周视图: 以 cursor 所在周 (周一~周日) 喂给共用时间网格。
export function WeekView({
  cursor,
  onPickSlot,
  onPickEvent,
}: {
  cursor: Date
  onPickSlot: (slotStart: Date) => void
  onPickEvent: (eventId: string) => void
}) {
  const { language } = useI18n()
  // 周首随界面语言: 中文周一, English 周日。
  const WEEK_OPTS = { weekStartsOn: weekStartsOn(language) }
  const start = startOfWeek(cursor, WEEK_OPTS)
  const end = endOfWeek(cursor, WEEK_OPTS)
  const days = eachDayOfInterval({ start, end })
  return <TimeGridView days={days} onPickSlot={onPickSlot} onPickEvent={onPickEvent} />
}
