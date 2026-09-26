import { useMemo } from 'react'
import { ClipboardList, CalendarPlus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { syncAllTasksToCalendar } from '@/lib/integrations'
import { QuickAddBar } from './QuickAddBar'
import { TaskItem } from './TaskItem'
import {
  DUE_GROUP_LABELS,
  DUE_GROUP_LABELS_EN,
  groupByDue,
  selectByList,
  selectByView,
  sortCompleted,
} from '@/store/useTasksStore'
import type { Task, TaskList } from '@/store/useTasksStore'
import { useTasksStore } from '@/store/useTasksStore'
import type { TodoSelection } from './TodoSidebar'
import type { ParsedQuickAdd } from '@/lib/quickadd'
import { useI18n } from '@/hooks/useI18n'

// 右侧任务列表区: 顶部快速添加 + 带语义分组头的任务列表。
//  - 智能视图「今天/最近7天/全部」按到期分组; 「已完成」按完成时间倒序; 清单视图按到期分组。
export function TaskListView({
  selection,
  lists,
  tasks,
  inboxId,
  onOpenTask,
}: {
  selection: TodoSelection
  lists: TaskList[]
  tasks: Task[]
  inboxId: string
  onOpenTask: (id: string) => void
}) {
  const { t } = useI18n()
  const addTask = useTasksStore((s) => s.addTask)
  const toggleTask = useTasksStore((s) => s.toggleTask)

  const listById = useMemo(() => new Map(lists.map((l) => [l.id, l])), [lists])

  // 当前视图标题 + 该视图下任务集合。
  const { title, isCompleted, defaultListId } = useMemo(() => {
    if (selection.kind === 'list') {
      const l = listById.get(selection.id)
      return {
        title: l?.name ?? t('清单', 'List'),
        isCompleted: false,
        defaultListId: selection.id,
      }
    }
    const labels: Record<string, string> = {
      today: t('今天', 'Today'),
      next7: t('最近7天', 'Next 7 days'),
      inbox: t('收件箱', 'Inbox'),
      all: t('全部', 'All'),
      completed: t('已完成', 'Completed'),
    }
    return {
      title: labels[selection.view],
      isCompleted: selection.view === 'completed',
      defaultListId: selection.view === 'inbox' ? inboxId : inboxId,
    }
  }, [selection, listById, inboxId, t])

  const viewTasks = useMemo(() => {
    if (selection.kind === 'list') return selectByList(tasks, selection.id)
    return selectByView(tasks, selection.view, inboxId)
  }, [selection, tasks, inboxId])

  // 分组: 已完成不分组(倒序); 收件箱按到期分组但通常无日期; 其余按到期分组。
  const groups = useMemo(() => {
    if (isCompleted)
      return [
        {
          group: 'completed' as const,
          label: t('已完成', 'Completed'),
          tasks: sortCompleted(viewTasks),
        },
      ]
    const byDue = groupByDue(viewTasks)
    // 收件箱视图里若全部无日期, groupByDue 会只产出 none 组, 体验依然合理。
    return byDue.map((g) => ({
      group: g.group,
      label: t(DUE_GROUP_LABELS[g.group], DUE_GROUP_LABELS_EN[g.group]),
      tasks: g.tasks,
    }))
  }, [viewTasks, isCompleted, t])

  const total = viewTasks.length

  const handleAdd = (parsed: ParsedQuickAdd) => {
    addTask({
      title: parsed.title,
      listId: selection.kind === 'list' ? selection.id : defaultListId,
      priority: parsed.priority,
      tags: parsed.tags,
      dueDate: parsed.dueDate,
      dueTime: parsed.dueTime,
      isAllDay: !parsed.dueTime,
    })
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {/* 标题条 */}
      <div className="flex shrink-0 items-center justify-between gap-2 px-5 pt-4">
        <div className="flex items-baseline gap-2">
          <h2 className="text-xl font-semibold text-foreground">{title}</h2>
          <span className="text-base text-muted-foreground">{total}</span>
        </div>
        {/* 一键把当前所有「未完成且有到期日」的任务同步到个人日历 */}
        {!isCompleted && (
          <Button
            variant="outline"
            size="sm"
            title={t(
              '把有到期日的待办一键同步到个人日历',
              'Sync all tasks with a due date to your calendar',
            )}
            onClick={() => {
              const n = syncAllTasksToCalendar()
              toast.success(
                n > 0
                  ? t(`已同步 ${n} 个任务到个人日历`, `Synced ${n} tasks to your calendar`)
                  : t('没有可同步的任务(需有到期日)', 'No tasks to sync (they need a due date)'),
              )
            }}
          >
            <CalendarPlus className="size-4" />
            {t('同步到日历', 'Sync to calendar')}
          </Button>
        )}
      </div>

      {/* 快速添加 (已完成视图不显示) */}
      {!isCompleted && <QuickAddBar onAdd={handleAdd} />}

      {/* 列表 */}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-6">
        {total === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-20 text-center">
            <div className="grid size-14 place-items-center rounded-full bg-muted">
              <ClipboardList className="size-7 text-muted-foreground" />
            </div>
            <p className="text-base text-muted-foreground">
              {isCompleted
                ? t('还没有已完成的任务', 'No completed tasks yet')
                : t('这里很清爽，添加一个任务吧', 'All clear. Add a task!')}
            </p>
          </div>
        ) : (
          <div className="space-y-4 px-2 pt-2">
            {groups.map((g) => (
              <section key={g.group}>
                <h3 className="px-3 pb-1.5 text-sm font-semibold text-muted-foreground">
                  {g.label}
                  <span className="ml-1.5 font-normal">{g.tasks.length}</span>
                </h3>
                <div className="space-y-0.5">
                  {g.tasks.map((t) => (
                    <TaskItem
                      key={t.id}
                      task={t}
                      list={listById.get(t.listId)}
                      onToggle={toggleTask}
                      onOpen={onOpenTask}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
