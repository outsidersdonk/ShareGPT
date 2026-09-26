import { useState } from 'react'
import { Plus, Trash2, X, CalendarPlus } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { syncTaskToCalendar } from '@/lib/integrations'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { PRIORITY_META, PRIORITY_OPTIONS } from './helpers'
import type { Priority, RepeatFreq, Subtask, Task, TaskList } from '@/store/useTasksStore'
import { useTasksStore } from '@/store/useTasksStore'
import { useI18n } from '@/hooks/useI18n'

const REPEAT_OPTIONS: { value: RepeatFreq | 'none'; label: string; labelEn: string }[] = [
  { value: 'none', label: '不重复', labelEn: 'Does not repeat' },
  { value: 'daily', label: '每天', labelEn: 'Daily' },
  { value: 'weekly', label: '每周', labelEn: 'Weekly' },
  { value: 'monthly', label: '每月', labelEn: 'Monthly' },
  { value: 'yearly', label: '每年', labelEn: 'Yearly' },
]

// 任务编辑器 (Dialog): 标题/备注/清单/优先级/到期(日期+时间+全天)/标签/子任务/重复/删除。
export function TaskEditor({
  task,
  lists,
  open,
  onOpenChange,
}: {
  task: Task | null
  lists: TaskList[]
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const { t } = useI18n()
  const updateTask = useTasksStore((s) => s.updateTask)
  const removeTask = useTasksStore((s) => s.removeTask)
  const addSubtask = useTasksStore((s) => s.addSubtask)
  const toggleSubtask = useTasksStore((s) => s.toggleSubtask)
  const removeSubtask = useTasksStore((s) => s.removeSubtask)

  // 本地草稿 (受控字段), 打开/切换任务时同步。
  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [listId, setListId] = useState('')
  const [priority, setPriority] = useState<Priority>(0)
  const [dueDate, setDueDate] = useState('')
  const [dueTime, setDueTime] = useState('')
  const [isAllDay, setIsAllDay] = useState(true)
  const [repeat, setRepeat] = useState<RepeatFreq | 'none'>('none')
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [subInput, setSubInput] = useState('')

  const [previousTask, setPreviousTask] = useState<Task | null>(null)
  if (task !== previousTask) {
    setPreviousTask(task)
    if (task) {
      setTitle(task.title)
      setNotes(task.notes ?? '')
      setListId(task.listId)
      setPriority(task.priority)
      setDueDate(task.dueDate ?? '')
      setDueTime(task.dueTime ?? '')
      setIsAllDay(task.isAllDay)
      setRepeat(task.repeat?.freq ?? 'none')
      setTags(task.tags)
      setTagInput('')
      setSubInput('')
    }
  }

  if (!task) return null

  // 持久化当前草稿 (保存即写, 关闭也保存)。
  const persist = () => {
    updateTask(task.id, {
      title: title.trim() || t('未命名任务', 'Untitled task'),
      notes: notes.trim() || undefined,
      listId,
      priority,
      dueDate: dueDate || undefined,
      dueTime: !isAllDay && dueDate ? dueTime || undefined : undefined,
      isAllDay: dueDate ? isAllDay : true,
      repeat: repeat === 'none' ? null : { freq: repeat, interval: 1 },
      tags,
    })
  }

  const handleOpenChange = (v: boolean) => {
    if (!v) persist()
    onOpenChange(v)
  }

  const addTag = () => {
    const t = tagInput.trim().replace(/^#/, '')
    if (t && !tags.includes(t)) setTags([...tags, t])
    setTagInput('')
  }

  const subtasks: Subtask[] = task.subtasks

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[85vh] gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle className="text-lg">{t('编辑任务', 'Edit task')}</DialogTitle>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto px-6 py-4">
          {/* 标题 */}
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('任务标题', 'Task title')}
            className="h-11 text-lg font-medium md:text-lg"
          />

          {/* 备注 */}
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t('备注…', 'Notes…')}
            rows={3}
            className="w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-[15px] leading-relaxed outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
          />

          {/* 清单 + 优先级 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm text-muted-foreground">{t('清单', 'List')}</Label>
              <div className="flex flex-wrap gap-1.5">
                {lists.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => setListId(l.id)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm transition-colors',
                      listId === l.id
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-border text-muted-foreground hover:bg-accent',
                    )}
                  >
                    <span className="size-2 rounded-full" style={{ backgroundColor: l.color }} />
                    {l.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm text-muted-foreground">{t('优先级', 'Priority')}</Label>
              <div className="flex gap-1.5">
                {PRIORITY_OPTIONS.map((p) => {
                  const m = PRIORITY_META[p]
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPriority(p)}
                      title={
                        p === 0 ? t('无', 'None') : t(`${m.label}优先级`, `${m.labelEn} priority`)
                      }
                      className={cn(
                        'grid size-8 place-items-center rounded-md border transition-colors',
                        priority === p
                          ? 'border-primary bg-primary/10'
                          : 'border-border hover:bg-accent',
                      )}
                    >
                      <span className={cn('size-3 rounded-full', m.dot)} />
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* 到期 日期 + 时间 + 全天 */}
          <div className="space-y-2 rounded-lg border border-border p-3">
            <div className="flex items-center gap-3">
              <Label className="w-12 shrink-0 text-sm text-muted-foreground">
                {t('日期', 'Date')}
              </Label>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="h-9 flex-1 text-sm md:text-sm"
              />
              {dueDate && (
                <button
                  type="button"
                  onClick={() => {
                    setDueDate('')
                    setDueTime('')
                  }}
                  className="text-muted-foreground hover:text-destructive"
                  title={t('清除日期', 'Clear date')}
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
            {dueDate && (
              <>
                <div className="flex items-center justify-between">
                  <Label className="text-sm text-muted-foreground">{t('全天', 'All day')}</Label>
                  <Switch
                    checked={isAllDay}
                    onCheckedChange={(v) => {
                      setIsAllDay(v)
                      if (v) setDueTime('')
                    }}
                  />
                </div>
                {!isAllDay && (
                  <div className="flex items-center gap-3">
                    <Label className="w-12 shrink-0 text-sm text-muted-foreground">
                      {t('时间', 'Time')}
                    </Label>
                    <Input
                      type="time"
                      value={dueTime}
                      onChange={(e) => setDueTime(e.target.value)}
                      className="h-9 flex-1 text-sm md:text-sm"
                    />
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <Label className="w-12 shrink-0 text-sm text-muted-foreground">
                    {t('重复', 'Repeat')}
                  </Label>
                  <div className="flex flex-wrap gap-1.5">
                    {REPEAT_OPTIONS.map((o) => (
                      <button
                        key={o.value}
                        type="button"
                        onClick={() => setRepeat(o.value)}
                        className={cn(
                          'rounded-md border px-2.5 py-1.5 text-sm transition-colors',
                          repeat === o.value
                            ? 'border-primary bg-primary/10 text-foreground'
                            : 'border-border text-muted-foreground hover:bg-accent',
                        )}
                      >
                        {t(o.label, o.labelEn)}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* 标签 */}
          <div className="space-y-1.5">
            <Label className="text-sm text-muted-foreground">{t('标签', 'Tags')}</Label>
            <div className="flex flex-wrap items-center gap-1.5">
              {tags.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-sm text-primary"
                >
                  #{t}
                  <button type="button" onClick={() => setTags(tags.filter((x) => x !== t))}>
                    <X className="size-3" />
                  </button>
                </span>
              ))}
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addTag()
                  }
                }}
                placeholder={t('添加标签…', 'Add tag…')}
                className="h-8 w-32 text-sm md:text-sm"
              />
            </div>
          </div>

          {/* 子任务 */}
          <div className="space-y-1.5">
            <Label className="text-sm text-muted-foreground">{t('子任务', 'Subtasks')}</Label>
            <div className="space-y-1">
              {subtasks.map((s) => (
                <div key={s.id} className="group flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleSubtask(task.id, s.id)}
                    className={cn(
                      'grid size-5 shrink-0 place-items-center rounded-full border-2 transition-colors',
                      s.completed
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-muted-foreground/40 hover:border-primary',
                    )}
                  >
                    {s.completed && <span className="size-2 rounded-full bg-primary-foreground" />}
                  </button>
                  <span
                    className={cn(
                      'flex-1 text-base',
                      s.completed && 'text-muted-foreground line-through',
                    )}
                  >
                    {s.title}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeSubtask(task.id, s.id)}
                    className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Plus className="size-4 text-muted-foreground" />
              <Input
                value={subInput}
                onChange={(e) => setSubInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && subInput.trim()) {
                    e.preventDefault()
                    addSubtask(task.id, subInput.trim())
                    setSubInput('')
                  }
                }}
                placeholder={t('添加子任务…', 'Add subtask…')}
                className="h-9 text-base md:text-base"
              />
            </div>
          </div>
        </div>

        <DialogFooter className="flex-row items-center justify-between border-t border-border px-6 py-3">
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => {
              removeTask(task.id)
              onOpenChange(false)
            }}
          >
            <Trash2 className="size-4" />
            {t('删除', 'Delete')}
          </Button>
          <div className="flex items-center gap-2">
            {/* 加入个人日历: 先保存草稿再同步 (需有到期日) */}
            <Button
              variant="outline"
              size="sm"
              title={t(
                '把此任务加入个人日历(需设置到期日期)',
                'Add this task to your calendar (needs a due date)',
              )}
              onClick={() => {
                persist()
                const r = syncTaskToCalendar(task.id)
                if (r === 'no-date')
                  toast.error(
                    t(
                      '请先设置到期日期，再加入日历',
                      'Set a due date before adding it to the calendar',
                    ),
                  )
                else if (r === 'updated')
                  toast.success(t('已更新到个人日历', 'Updated in your calendar'))
                else if (r === 'synced')
                  toast.success(t('已加入个人日历', 'Added to your calendar'))
                else toast.error(t('加入失败', 'Could not add it'))
              }}
            >
              <CalendarPlus className="size-4" />
              {t('加入日历', 'Add to calendar')}
            </Button>
            <Button
              size="sm"
              onClick={() => {
                persist()
                onOpenChange(false)
              }}
            >
              {t('完成', 'Done')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
