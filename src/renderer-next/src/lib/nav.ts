import {
  Cable,
  MessageCircle,
  BarChart3,
  UserRound,
  ScrollText,
  CalendarDays,
  Users,
  ListTodo,
  BookText,
  Timer,
  type LucideIcon,
} from 'lucide-react'
import { ChatGPTIcon, ClaudeIcon, GeminiIcon } from '@/components/icons/AiBrandIcons'
import type { Language } from '@/lib/i18n'

export type NavKey =
  | 'service'
  | 'chat'
  | 'calendar'
  | 'team'
  | 'todo'
  | 'notes'
  | 'focus'
  | 'gpt'
  | 'gemini'
  | 'claude'
  | 'stats'
  | 'account'
  | 'logs'

export interface NavItem {
  key: NavKey
  label: string
  icon: LucideIcon
  hint: string
  labelEn: string
  hintEn: string
}

export const NAV: NavItem[] = [
  {
    key: 'service',
    label: '网络 / 代理',
    icon: Cable,
    hint: '把指定流量转发到代理出口',
    labelEn: 'Network / Proxy',
    hintEn: 'Forward selected traffic to a proxy exit',
  },
  {
    key: 'chat',
    label: '协作聊天',
    icon: MessageCircle,
    hint: '团队消息与文件',
    labelEn: 'Team Chat',
    hintEn: 'Team messages and files',
  },
  {
    key: 'calendar',
    label: '个人日历',
    icon: CalendarDays,
    hint: '日程、事件与提醒',
    labelEn: 'Calendar',
    hintEn: 'Schedule, events and reminders',
  },
  {
    key: 'team',
    label: '组队日历',
    icon: Users,
    hint: '团队共享日程与协作',
    labelEn: 'Team Calendar',
    hintEn: 'Shared team schedule',
  },
  {
    key: 'todo',
    label: '备忘录 / 待办',
    icon: ListTodo,
    hint: '清单、任务与便签',
    labelEn: 'Memos / To-do',
    hintEn: 'Lists, tasks and notes',
  },
  {
    key: 'notes',
    label: '笔记 / 知识库',
    icon: BookText,
    hint: '双链笔记、图谱与全文检索',
    labelEn: 'Notes',
    hintEn: 'Linked notes, graph and full-text search',
  },
  {
    key: 'focus',
    label: '专注',
    icon: Timer,
    hint: '番茄钟、专注统计与团队排名',
    labelEn: 'Focus',
    hintEn: 'Pomodoro timer, focus stats and team ranking',
  },
  {
    key: 'gpt',
    label: 'ChatGPT',
    icon: ChatGPTIcon,
    hint: '内嵌 ChatGPT 网页',
    labelEn: 'ChatGPT',
    hintEn: 'Embedded ChatGPT',
  },
  {
    key: 'gemini',
    label: 'Gemini',
    icon: GeminiIcon,
    hint: '内嵌 Gemini 网页',
    labelEn: 'Gemini',
    hintEn: 'Embedded Gemini',
  },
  {
    key: 'claude',
    label: 'Claude',
    icon: ClaudeIcon,
    hint: '内嵌 Claude 网页',
    labelEn: 'Claude',
    hintEn: 'Embedded Claude',
  },
  {
    key: 'stats',
    label: '使用统计',
    icon: BarChart3,
    hint: '查询量与排行',
    labelEn: 'Usage',
    hintEn: 'Message counts and rankings',
  },
  {
    key: 'account',
    label: '账户',
    icon: UserRound,
    hint: '登录与协作服务',
    labelEn: 'Account',
    hintEn: 'Sign-in and settings',
  },
  {
    key: 'logs',
    label: '运行日志',
    icon: ScrollText,
    hint: '服务输出日志',
    labelEn: 'Logs',
    hintEn: 'Service output logs',
  },
]

// 按界面语言取导航文案 (中文为默认)。
export function localizeNav(item: NavItem, language: Language): NavItem {
  return language === 'en' ? { ...item, label: item.labelEn, hint: item.hintEn } : item
}
