export interface OnboardingStep {
  // data-tour target; omitted for the centered welcome and completion cards.
  target?: string
  title: string
  body: string
}

import type { Language } from './i18n'

export function buildOnboardingSteps(brand: string, language: Language = 'zh'): OnboardingStep[] {
  if (language === 'en') return buildEnglishSteps(brand)
  return [
    {
      title: `欢迎使用 ${brand} 👋`,
      body: '花 30 秒带你认识主界面的几个核心功能，随时可以跳过。',
    },
    {
      target: 'nav-service',
      title: '网络 / 代理',
      body: '在这里配置代理出口。开启后，内嵌的 AI 网页会自动复用同一个代理。',
    },
    {
      target: 'nav-chat',
      title: '协作聊天',
      body: '和团队成员实时收发消息、互传文件，在线状态一目了然。输入框可插入表情；消息可加表情回应，纯表情消息会放大并动态显示。',
    },
    {
      target: 'nav-gpt',
      title: '内嵌 AI 网页',
      body: 'ChatGPT / Gemini / Claude 直接在客户端里打开，免去来回切换浏览器。空白处右键有浏览器式菜单；Ctrl + 鼠标滚轮（或 Ctrl 加 +/-/0）可缩放页面。',
    },
    {
      target: 'nav-stats',
      title: '使用统计',
      body: '查看用量与排行，了解团队的整体使用情况。',
    },
    {
      target: 'nav-account',
      title: '更多功能可以在这里发掘',
      body: '个人日历、组队日历、备忘录 / 待办、笔记 / 知识库和专注默认收起。需要时进入「账户 → 界面设置」按需显示；协作通知也在这里管理。本引导只告诉你位置，不会替你开启。',
    },
    {
      title: '准备就绪 🎉',
      body: '就这些！现在开始上手吧。左侧入口可长按拖动排序；需要时点标题栏右上角的「?」可再次查看本引导。',
    },
  ]
}

function buildEnglishSteps(brand: string): OnboardingStep[] {
  return [
    {
      title: `Welcome to ${brand} 👋`,
      body: 'A 30-second tour of the main screen. You can skip it at any time.',
    },
    {
      target: 'nav-service',
      title: 'Network / Proxy',
      body: 'Set up your proxy exit here. Once started, the embedded AI pages reuse the same proxy automatically.',
    },
    {
      target: 'nav-chat',
      title: 'Team Chat',
      body: 'Send messages and files to your team in real time and see who is online. Add emoji in the composer and react to messages; emoji-only messages are shown large and animated.',
    },
    {
      target: 'nav-gpt',
      title: 'Embedded AI pages',
      body: 'ChatGPT / Gemini / Claude open right inside the app, so you do not need to switch browsers. Right-click an empty area for a browser-style menu; Ctrl + mouse wheel (or Ctrl with +/-/0) zooms the page.',
    },
    {
      target: 'nav-stats',
      title: 'Usage',
      body: "See usage and rankings to understand your team's overall activity.",
    },
    {
      target: 'nav-account',
      title: 'Find more features here',
      body: 'Calendar, Team Calendar, Memos / To-do, Notes and Focus are hidden by default. Show the ones you need in "Account → Interface"; team notifications are managed here too. This tour only shows you where they are and does not turn them on.',
    },
    {
      title: 'All set 🎉',
      body: 'That is it. Enjoy! Long-press a sidebar entry to reorder it, and click "?" at the top right of the title bar to see this tour again.',
    },
  ]
}
