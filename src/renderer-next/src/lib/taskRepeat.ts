// 重复任务推进: 完成时把到期日推到下一周期。
// 按月/按年重复时记住「原始日」(anchorDay): 1/31 的月度任务在 2 月落到 28 日后,
// 3 月仍回到 31 日, 而不是永久停在 28 日。编辑器保存时会重建 repeat, 锚点随之重置。
import { addDays, addMonths, addWeeks, format, getDaysInMonth, parseISO, setDate } from 'date-fns'
import type { Repeat } from '@/store/useTasksStore'

export function advanceRepeat(
  dateStr: string,
  repeat: Repeat,
): { dueDate: string; repeat: Repeat } {
  const d = parseISO(dateStr)
  const n = repeat.interval
  if (repeat.freq === 'daily' || repeat.freq === 'weekly') {
    const next = repeat.freq === 'daily' ? addDays(d, n) : addWeeks(d, n)
    return { dueDate: format(next, 'yyyy-MM-dd'), repeat }
  }
  const anchorDay = repeat.anchorDay ?? d.getDate()
  const shifted = addMonths(d, repeat.freq === 'monthly' ? n : n * 12)
  const next = setDate(shifted, Math.min(anchorDay, getDaysInMonth(shifted)))
  return { dueDate: format(next, 'yyyy-MM-dd'), repeat: { ...repeat, anchorDay } }
}
