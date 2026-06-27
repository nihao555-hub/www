'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  ArrowRight,
  Bell,
  Check,
  ChevronDown,
  Code2,
  Download,
  Eye,
  FolderPlus,
  ImageIcon,
  LayoutDashboard,
  LayoutTemplate,
  Loader2,
  PanelLeftClose,
  PencilRuler,
  Plus,
  Search,
  Sparkles,
  Star,
  Wand2,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { CodeBlock } from '@/components/ai-elements/code-block'
import { PromptInputBox } from '@/components/ui/prompt-input-box'
import { THEMES } from '@/lib/ai/themes'
import type { LandingTemplateMeta } from '@/lib/ai/site-templates'
import { AgentWorkflow } from './AgentWorkflow'

type GenMode = 'creative' | 'template'

const LANGUAGES: { code: string; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'zh', label: '简体中文' },
  { code: 'zh-TW', label: '繁體中文' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'pt', label: 'Português' },
  { code: 'ar', label: 'العربية' },
]

type Step = { key: string; label: string; status: 'active' | 'done' }
type Inspiration = {
  components: { name: string; summary?: string }[]
  icons: { title: string; svgUrl: string }[]
}
type McpCall = {
  id: number
  round: number
  tool: 'component_inspiration' | 'logo_search'
  section?: string
  query: string
  status: 'running' | 'done' | 'error'
  resultCount?: number
  componentName?: string
  similarity?: number
  codePreview?: string
  featured?: boolean
}
type DoneResult = {
  pageId: number
  slug: string
  siteName: string
  themeId: string
  previewUrl: string
  adminUrl: string
  sections: number
  pages?: number
}

const EXAMPLE_PROMPTS: { emoji: string; title: string; brief: string }[] = [
  {
    emoji: '🌿',
    title: '高端国货护肤',
    brief:
      '高端国货护肤品牌「参源」，主打野山参精华抗老精华液，面向 25-40 岁都市女性，要高级、有东方质感、有创新的视觉记忆点。',
  },
  {
    emoji: '☕',
    title: '精品咖啡品牌',
    brief:
      '精品手冲咖啡豆品牌「晨雾」，强调单一产地与浅烘风味，面向咖啡爱好者，风格要温暖、克制、有质感。',
  },
  {
    emoji: '🎧',
    title: '科技数码新品',
    brief:
      '主动降噪无线耳机新品发布站，主打通透音质与超长续航，面向年轻科技人群，要未来感、暗色、强动效。',
  },
  {
    emoji: '🏡',
    title: '极简家居电商',
    brief:
      '北欧极简风家居品牌，主打原木家具与收纳，面向都市小家庭，风格要干净、留白、温润自然。',
  },
]

// Build-type chips shown under the prompt (Manus-style suggestions).
const BUILD_TYPES: { emoji: string; label: string; brief: string }[] = [
  {
    emoji: '🛍️',
    label: '品牌电商',
    brief: '一个高级感的 DTC 品牌电商独立站，主打精选好物，面向都市年轻消费者，要干净、有质感、转化导向。',
  },
  {
    emoji: '🚀',
    label: '产品落地页',
    brief: '一个 SaaS 新品发布落地页，突出核心卖点与定价，面向 B 端决策者，风格现代、专业、有信任感。',
  },
  {
    emoji: '🎨',
    label: '个人作品集',
    brief: '一个设计师个人作品集网站，展示项目案例与履历，风格极简、留白充足、排版精致。',
  },
  {
    emoji: '🏢',
    label: '企业官网',
    brief: '一个科技公司企业官网，介绍业务、团队与联系方式，要稳重、专业、有国际化质感。',
  },
  {
    emoji: '🍽️',
    label: '餐饮门店',
    brief: '一个精品咖啡馆门店官网，展示菜单、环境与到店预订，风格温暖、生活化、有食欲感。',
  },
]

// Built-in capability chips for the "强大的内置能力" card.
const INTEGRATIONS: string[] = [
  'LLM 文案',
  'GPT-Image 配图',
  '21st.dev 组件',
  '多语言',
  '主题系统',
  '模板库',
  '代码导出',
  '一键部署',
]

const LOADING_TIPS: string[] = [
  '正在读懂你的品牌调性与目标人群…',
  'AI 正在 21st.dev 翻找最契合的组件灵感…',
  '在为每个版块撰写有记忆点的文案…',
  '调色板、字体与留白都在按品牌气质微调…',
  '正在批量生成场景图与装饰插画…',
  '自我打磨：修复变形 / 溢出 / 排版细节…',
  '好设计值得等待，马上就好 ✨',
]

export const GenerateForm: React.FC<{ templates?: LandingTemplateMeta[] }> = ({
  templates = [],
}) => {
  const [language, setLanguage] = useState('en')
  const [themeId, setThemeId] = useState('auto')
  const [brief, setBrief] = useState('')
  const [mode, setMode] = useState<GenMode>('creative')
  // 'auto' = let the AI smart-match the best template from the brief.
  const [templateId, setTemplateId] = useState<string | null>('auto')
  // Manual template picker stays collapsed by default — default flow is AI auto-match.
  const [showTemplatePicker, setShowTemplatePicker] = useState(false)

  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [steps, setSteps] = useState<Step[]>([])
  const [analysis, setAnalysis] = useState('')
  const [plan, setPlan] = useState('')
  const [chosenTheme, setChosenTheme] = useState<{ id: string; name: string } | null>(null)
  const [chosenTemplate, setChosenTemplate] = useState<{ id: string; name: string } | null>(null)
  const [inspiration, setInspiration] = useState<Inspiration | null>(null)
  const [mcpCalls, setMcpCalls] = useState<McpCall[]>([])
  const [mcpToolNames, setMcpToolNames] = useState<string[]>([])
  const [logs, setLogs] = useState<string[]>([])
  const [result, setResult] = useState<DoneResult | null>(null)
  // Right panel view: rendered preview vs. generated source code.
  const [rightView, setRightView] = useState<'preview' | 'code'>('preview')
  const [code, setCode] = useState<string | null>(null)
  const [codeLoading, setCodeLoading] = useState(false)
  const [tipIndex, setTipIndex] = useState(0)
  const [history, setHistory] = useState<
    { id: number; siteName: string; slug: string; themeId?: string; updatedAt?: string }[]
  >([])

  const themeOptions = useMemo(
    () => [
      { id: 'auto', label: '✨ AI 自动选择主题' },
      ...[...THEMES]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((t) => ({ id: t.id, label: `${t.name} — ${t.mood}` })),
    ],
    [],
  )

  const handleNewTask = useCallback(() => {
    setRunning(false)
    setError(null)
    setResult(null)
    setRightView('preview')
    setCode(null)
    setSteps([])
    setAnalysis('')
    setPlan('')
    setChosenTheme(null)
    setChosenTemplate(null)
    setInspiration(null)
    setMcpCalls([])
    setMcpToolNames([])
    setLogs([])
    setBrief('')
  }, [])

  const upsertStep = useCallback((s: Step) => {
    setSteps((prev) => {
      const idx = prev.findIndex((p) => p.key === s.key)
      if (idx === -1) return [...prev, s]
      const next = [...prev]
      next[idx] = s
      return next
    })
  }, [])

  const handleSend = async (message: string, sentFiles: File[]) => {
    if (running) return
    // Creative mode designs from product photos, so an image is required.
    // Template mode can fill image slots with gpt-image-2, so uploads are optional.
    if (mode === 'creative' && sentFiles.length === 0) {
      setError('请至少上传一张商品图（AI 看图设计）。')
      return
    }
    if (mode === 'template' && !templateId) {
      setError('请先选择一个模板。')
      return
    }
    if (!message.trim()) {
      setError('请用一段话描述你的业务。')
      return
    }

    setError(null)
    setResult(null)
    setSteps([])
    setAnalysis('')
    setPlan('')
    setChosenTheme(null)
    setChosenTemplate(null)
    setInspiration(null)
    setMcpCalls([])
    setMcpToolNames([])
    setLogs([])
    setRunning(true)

    const data = new FormData()
    data.set('brief', message)
    data.set('language', language)
    data.set('mode', mode)
    if (mode === 'template' && templateId) data.set('landingTemplateId', templateId)
    if (themeId !== 'auto') data.set('themeId', themeId)
    sentFiles.forEach((f) => data.append('images', f))

    try {
      const res = await fetch('/next/generate', { method: 'POST', body: data })
      if (!res.ok || !res.body) {
        const json = await res.json().catch(() => null)
        setError(json?.error || `生成失败（${res.status}）`)
        setRunning(false)
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      const handle = (event: string, payload: Record<string, unknown>) => {
        if (event === 'step') {
          upsertStep(payload as unknown as Step)
        } else if (event === 'analysis') {
          setAnalysis((prev) => prev + String(payload.delta ?? ''))
        } else if (event === 'plan') {
          setPlan((prev) => prev + String(payload.delta ?? ''))
        } else if (event === 'theme') {
          setChosenTheme({ id: String(payload.id), name: String(payload.name) })
        } else if (event === 'template') {
          setChosenTemplate({ id: String(payload.id), name: String(payload.name) })
        } else if (event === 'inspiration') {
          setInspiration(payload as unknown as Inspiration)
        } else if (event === 'mcp') {
          const calls = Array.isArray(payload.calls) ? (payload.calls as McpCall[]) : []
          setMcpCalls(calls)
          if (Array.isArray(payload.toolNames) && payload.toolNames.length) {
            setMcpToolNames(payload.toolNames as string[])
          }
        } else if (event === 'log') {
          setLogs((prev) => [...prev, String(payload.message ?? '')])
        } else if (event === 'done') {
          setResult(payload as unknown as DoneResult)
          setRunning(false)
        } else if (event === 'error') {
          setError(String(payload.message ?? '生成失败'))
          setRunning(false)
        }
      }

      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const chunks = buffer.split('\n\n')
        buffer = chunks.pop() ?? ''
        for (const chunk of chunks) {
          const lines = chunk.split('\n')
          let event = 'message'
          let dataStr = ''
          for (const line of lines) {
            if (line.startsWith('event:')) event = line.slice(6).trim()
            else if (line.startsWith('data:')) dataStr += line.slice(5).trim()
          }
          if (!dataStr) continue
          try {
            handle(event, JSON.parse(dataStr))
          } catch {
            // ignore malformed chunk
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '网络错误')
    } finally {
      setRunning(false)
    }
  }

  const showWorkspace = running || !!result || steps.length > 0

  // The generator is a full-viewport app shell; lock background scroll.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  // Load recent generated sites for the idle-state history rail.
  useEffect(() => {
    if (showWorkspace) return
    let cancelled = false
    fetch('/api/ai-sites?sort=-updatedAt&limit=30&depth=0')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d?.docs) setHistory(d.docs)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [showWorkspace])
  const currentStepLabel = useMemo(() => {
    const active = [...steps].reverse().find((s) => s.status === 'active')
    if (active) return active.label
    const lastDone = [...steps].reverse().find((s) => s.status === 'done')
    return lastDone?.label ?? ''
  }, [steps])

  // Lazily fetch the generated source the first time the user opens the code
  // view for a finished site.
  useEffect(() => {
    if (rightView !== 'code' || !result || code != null || codeLoading) return
    let cancelled = false
    setCodeLoading(true)
    fetch(`/next/sites/${encodeURIComponent(result.slug)}/code`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: { code?: string }) => {
        if (!cancelled) setCode(d.code ?? '// 暂无可导出的代码')
      })
      .catch(() => {
        if (!cancelled) setCode('// 拉取代码失败，请稍后重试')
      })
      .finally(() => {
        if (!cancelled) setCodeLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [rightView, result, code, codeLoading])

  // Rotate the encouraging tips while the site is being built.
  useEffect(() => {
    if (result || !running) return
    const id = setInterval(() => setTipIndex((i) => (i + 1) % LOADING_TIPS.length), 2800)
    return () => clearInterval(id)
  }, [result, running])

  const downloadCode = useCallback(() => {
    if (!result) return
    const a = document.createElement('a')
    a.href = `/next/sites/${encodeURIComponent(result.slug)}/code?download=1`
    a.download = `${result.slug}.tsx`
    document.body.appendChild(a)
    a.click()
    a.remove()
  }, [result])

  const promptBox = (
    <PromptInputBox
      isLoading={running}
      value={brief}
      onValueChange={setBrief}
      placeholder="一句话描述你的业务，并上传商品图，AI 自动生成独立站…"
      languages={LANGUAGES}
      language={language}
      onLanguageChange={setLanguage}
      themes={themeOptions}
      themeId={themeId}
      onThemeChange={setThemeId}
      onSend={handleSend}
      maxImages={6}
    />
  )

  // ---- Idle: Manus-style app shell — left sidebar + centered hero composer ----
  if (!showWorkspace) {
    const navItems: {
      key: string
      label: string
      Icon: typeof Plus
      onClick: () => void
      active: boolean
    }[] = [
      { key: 'new', label: '新建任务', Icon: Plus, onClick: handleNewTask, active: false },
      {
        key: 'creative',
        label: '自由创意',
        Icon: Wand2,
        onClick: () => setMode('creative'),
        active: mode === 'creative',
      },
      {
        key: 'template',
        label: '套用模板',
        Icon: Star,
        onClick: () => setMode('template'),
        active: mode === 'template',
      },
      {
        key: 'library',
        label: '模板库',
        Icon: LayoutTemplate,
        onClick: () => {
          setMode('template')
          setShowTemplatePicker(true)
        },
        active: false,
      },
    ]

    return (
      <div className="fixed inset-0 z-40 flex bg-background text-foreground">
        {/* Left sidebar */}
        <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-muted/30 md:flex">
          {/* brand row */}
          <div className="flex items-center justify-between px-4 py-3.5">
            <div className="flex items-center gap-2">
              <span className="flex size-6 items-center justify-center rounded-md bg-primary/15 text-primary">
                <Sparkles className="size-4" />
              </span>
              <span className="text-sm font-semibold tracking-tight">独立站生成器</span>
            </div>
            <div className="flex items-center gap-0.5 text-muted-foreground">
              <span className="rounded p-1 hover:bg-accent">
                <Search className="size-4" />
              </span>
              <span className="rounded p-1 hover:bg-accent">
                <PanelLeftClose className="size-4" />
              </span>
            </div>
          </div>

          {/* primary nav */}
          <nav className="space-y-0.5 px-2">
            {navItems.map(({ key, label, Icon, onClick, active }) => (
              <button
                key={key}
                type="button"
                onClick={onClick}
                className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
                  active
                    ? 'bg-accent font-medium text-accent-foreground'
                    : 'text-foreground/75 hover:bg-accent hover:text-accent-foreground'
                }`}
              >
                <Icon className="size-4 shrink-0" />
                {label}
              </button>
            ))}
          </nav>

          {/* Projects */}
          <div className="flex items-center justify-between px-4 pb-1 pt-5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            <span>我的站点</span>
            <button
              type="button"
              onClick={handleNewTask}
              className="rounded p-0.5 hover:bg-accent hover:text-foreground"
              aria-label="新建站点"
            >
              <FolderPlus className="size-3.5" />
            </button>
          </div>
          <div className="px-2">
            <button
              type="button"
              onClick={handleNewTask}
              className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-foreground/75 transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <LayoutDashboard className="size-4 shrink-0" />
              新建站点
            </button>
          </div>

          {/* Tasks (recent history) */}
          <div className="px-4 pb-1 pt-5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            最近任务
          </div>
          <nav className="min-h-0 flex-1 space-y-0.5 overflow-auto px-2 pb-2">
            {history.length === 0 ? (
              <p className="px-3 py-4 text-xs text-muted-foreground">暂无历史任务</p>
            ) : (
              history.map((h) => (
                <a
                  key={h.id}
                  href={`/s/${h.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm text-foreground/75 transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  <LayoutTemplate className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{h.siteName || h.slug}</span>
                </a>
              ))
            )}
          </nav>

          {/* bottom: tip card + account */}
          <div className="mt-auto space-y-2 border-t border-border p-3">
            <div className="rounded-xl border border-border bg-card p-3">
              <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium">
                <Bell className="size-3.5 text-primary" />
                小提示
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                上传商品图，AI 看图设计会更贴合你的品牌质感。
              </p>
            </div>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- /admin is served by Payload, not a Next page route */}
            <a
              href="/admin"
              className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-accent"
            >
              <span className="flex size-7 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                站
              </span>
              <span className="text-sm">进入后台</span>
            </a>
          </div>
        </aside>

        {/* Main */}
        <main className="relative flex min-w-0 flex-1 flex-col overflow-auto">
          {/* top bar */}
          <div className="flex items-center justify-between px-5 py-3">
            <span className="flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium">
              AI 独立站生成器
              <ChevronDown className="size-4 text-muted-foreground" />
            </span>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- /admin is served by Payload, not a Next page route */}
            <a
              href="/admin"
              className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <Sparkles className="size-3.5 text-primary" />
              后台
            </a>
          </div>

          {/* centered hero composer */}
          <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-6 py-8">
            <div className="mb-5 flex justify-center">
              <span className="rounded-full border border-border bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">免费体验</span> · 一句话生成独立站
              </span>
            </div>
            <h1 className="text-center font-serif text-4xl font-medium tracking-tight sm:text-5xl">
              想做一个什么样的独立站？
            </h1>

            <div className="mt-8">
              {promptBox}
              {error && (
                <div className="mt-3 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}
            </div>

            {/* meta row: type label (left) + mode toggle (right) */}
            <div className="mt-3 flex items-center justify-between px-1">
              <span className="text-sm text-muted-foreground">想生成哪种类型？</span>
              <div className="inline-flex items-center gap-0.5 rounded-full border border-border bg-muted/40 p-0.5">
                {(
                  [
                    { key: 'creative' as const, label: '自由创意', Icon: Wand2 },
                    { key: 'template' as const, label: '套用模板', Icon: Star },
                  ]
                ).map(({ key, label, Icon }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setMode(key)}
                    className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      mode === key
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Icon className="size-3.5" />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* build-type chips (creative) / smart-match + picker (template) */}
            {mode === 'creative' ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {BUILD_TYPES.map((b) => (
                  <button
                    key={b.label}
                    type="button"
                    onClick={() => setBrief(b.brief)}
                    className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm text-foreground/85 transition-all hover:border-primary/50 hover:bg-accent hover:shadow-sm"
                  >
                    <span className="text-base leading-none">{b.emoji}</span>
                    {b.label}
                  </button>
                ))}
              </div>
            ) : (
              <div className="mt-4 flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary">
                    <Sparkles className="size-3.5" />
                    AI 智能匹配 · 自动从 {templates.length} 个高 star 模板里挑最契合的
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowTemplatePicker((v) => !v)}
                    className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    {showTemplatePicker ? '收起手动选择' : '手动选择模板'}
                  </button>
                </div>

                {showTemplatePicker && (
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                    <button
                      type="button"
                      onClick={() => setTemplateId('auto')}
                      className={`group relative flex flex-col gap-1.5 rounded-xl border p-3 text-left transition-all hover:shadow-sm ${
                        templateId === 'auto'
                          ? 'border-primary bg-primary/5 shadow-sm'
                          : 'border-dashed border-primary/40 bg-card hover:border-primary/60 hover:bg-accent'
                      }`}
                    >
                      {templateId === 'auto' && (
                        <span className="absolute right-2 top-2 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                          <Check className="size-3" />
                        </span>
                      )}
                      <span className="flex items-center gap-1.5">
                        <Sparkles className="size-4 text-primary" />
                        <span className="block text-sm font-semibold">AI 智能匹配</span>
                      </span>
                      <span className="block text-[11px] font-medium text-primary/80">推荐 · 自动选模板</span>
                      <span className="line-clamp-2 block text-xs text-muted-foreground">
                        只写一句话，AI 读懂你的行业与调性，从模板库里自动挑最契合的那一个。
                      </span>
                    </button>
                    {templates.map((tpl) => {
                      const selected = templateId === tpl.id
                      return (
                        <button
                          key={tpl.id}
                          type="button"
                          onClick={() => setTemplateId(tpl.id)}
                          className={`group relative flex flex-col gap-1.5 rounded-xl border p-3 text-left transition-all hover:shadow-sm ${
                            selected
                              ? 'border-primary bg-primary/5 shadow-sm'
                              : 'border-border bg-card hover:border-primary/50 hover:bg-accent'
                          }`}
                        >
                          {selected && (
                            <span className="absolute right-2 top-2 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                              <Check className="size-3" />
                            </span>
                          )}
                          <span className="flex items-center gap-1.5">
                            <span className="block text-sm font-semibold">{tpl.name}</span>
                          </span>
                          <span className="block text-[11px] font-medium text-primary/80">
                            {tpl.category}
                          </span>
                          <span className="line-clamp-2 block text-xs text-muted-foreground">
                            {tpl.description}
                          </span>
                          <span className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Star className="size-3 fill-amber-400 text-amber-400" />
                            {(tpl.source.stars / 1000).toFixed(1)}k · {tpl.source.repo}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Built-in capabilities card */}
            <div className="mt-8 rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
                强大的内置能力
                <ArrowRight className="size-3.5 text-muted-foreground" />
              </div>
              <div className="flex flex-wrap gap-2">
                {INTEGRATIONS.map((name) => (
                  <span
                    key={name}
                    className="rounded-lg border border-border bg-muted/40 px-2.5 py-1 text-xs text-foreground/80"
                  >
                    {name}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </main>
      </div>
    )
  }

  // ---- Working / done: full-bleed left rail (status + input) + right live preview ----
  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background lg:flex-row">
      {/* Left rail: agent status (top) + input (bottom) */}
      <div className="flex w-full shrink-0 flex-col gap-3 border-b border-border p-3 lg:h-full lg:w-[40%] lg:min-w-[420px] xl:w-[36%] 2xl:w-[32%] lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="size-4 text-primary" />
            工作台
          </div>
          <Button onClick={handleNewTask} variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs">
            <Plus className="size-3.5" />
            新建任务
          </Button>
        </div>
        <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <CardContent className="min-h-0 flex-1 overflow-auto p-4">
            <AgentWorkflow
              steps={steps}
              analysis={analysis}
              plan={plan}
              inspiration={inspiration}
              mcpCalls={mcpCalls}
              mcpToolNames={mcpToolNames}
              logs={logs}
              running={running}
              chosenTheme={chosenTheme}
              chosenTemplate={chosenTemplate}
            />
          </CardContent>
        </Card>

        {error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-2 text-xs text-destructive">
            {error}
          </div>
        )}
      </div>

      {/* Right: live preview / generated code, with a top view switcher */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {result && (
            <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/20 px-3 py-2">
              <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-background p-0.5">
                {(
                  [
                    { key: 'preview' as const, label: '界面', Icon: Eye },
                    { key: 'code' as const, label: '代码', Icon: Code2 },
                  ]
                ).map(({ key, label, Icon }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setRightView(key)}
                    className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                      rightView === key
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Icon className="size-3.5" />
                    {label}
                  </button>
                ))}
              </div>
              <Button onClick={downloadCode} size="sm" variant="outline" className="h-7 gap-1.5 px-2.5 text-xs">
                <Download className="size-3.5" />
                下载代码
              </Button>
            </div>
          )}

          <AnimatePresence mode="wait">
            {result && rightView === 'preview' ? (
              <motion.iframe
                key="preview"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4 }}
                src={result.previewUrl}
                title="preview"
                className="h-full w-full flex-1 bg-white"
              />
            ) : result && rightView === 'code' ? (
              <motion.div
                key="code"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="min-h-0 flex-1 overflow-auto bg-[#0d1117] p-3"
              >
                {codeLoading || code == null ? (
                  <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    正在整理源码…
                  </div>
                ) : (
                  <CodeBlock code={code} language="tsx" />
                )}
              </motion.div>
            ) : (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="relative flex h-full flex-1 flex-col items-center justify-center gap-6 overflow-hidden bg-gradient-to-br from-muted/40 via-background to-muted/30 text-center"
              >
                {/* animated ambient blobs */}
                <motion.div
                  aria-hidden
                  className="pointer-events-none absolute -left-24 -top-24 size-72 rounded-full bg-primary/20 blur-3xl"
                  animate={{ x: [0, 40, 0], y: [0, 30, 0], scale: [1, 1.15, 1] }}
                  transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
                />
                <motion.div
                  aria-hidden
                  className="pointer-events-none absolute -bottom-24 -right-24 size-80 rounded-full bg-fuchsia-500/15 blur-3xl"
                  animate={{ x: [0, -30, 0], y: [0, -40, 0], scale: [1, 1.2, 1] }}
                  transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
                />

                {/* a mock site skeleton whose blocks assemble on a loop */}
                <div className="relative w-72 max-w-[80%] rounded-xl border border-border bg-background/70 p-3 shadow-xl backdrop-blur">
                  <div className="mb-3 flex items-center gap-1.5">
                    <span className="size-2 rounded-full bg-red-400/70" />
                    <span className="size-2 rounded-full bg-amber-400/70" />
                    <span className="size-2 rounded-full bg-emerald-400/70" />
                    <motion.div
                      className="ml-2 h-3 flex-1 rounded bg-muted"
                      animate={{ opacity: [0.4, 0.9, 0.4] }}
                      transition={{ duration: 1.8, repeat: Infinity }}
                    />
                  </div>
                  {[
                    'h-10 w-3/4',
                    'h-4 w-full',
                    'h-4 w-5/6',
                  ].map((cls, i) => (
                    <motion.div
                      key={i}
                      className={`mb-2 rounded bg-gradient-to-r from-primary/30 to-fuchsia-400/20 ${cls}`}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: [0, 1, 1, 0], x: [-8, 0, 0, -8] }}
                      transition={{
                        duration: 4,
                        repeat: Infinity,
                        delay: i * 0.5,
                        ease: 'easeInOut',
                      }}
                    />
                  ))}
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {[0, 1, 2].map((i) => (
                      <motion.div
                        key={i}
                        className="aspect-square rounded-lg bg-muted"
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: [0, 1, 1, 0], scale: [0.8, 1, 1, 0.8] }}
                        transition={{
                          duration: 4,
                          repeat: Infinity,
                          delay: 1.5 + i * 0.4,
                          ease: 'easeInOut',
                        }}
                      />
                    ))}
                  </div>
                </div>

                {/* phase icons that pulse in sequence */}
                <div className="relative flex items-center gap-3">
                  {[ImageIcon, LayoutTemplate, Sparkles, PencilRuler, Wand2].map((Icon, i) => (
                    <motion.div
                      key={i}
                      className="flex size-9 items-center justify-center rounded-xl border border-primary/30 bg-background/70 text-primary shadow-sm backdrop-blur"
                      animate={{ scale: [1, 1.18, 1], opacity: [0.45, 1, 0.45] }}
                      transition={{
                        duration: 1.6,
                        repeat: Infinity,
                        delay: i * 0.32,
                        ease: 'easeInOut',
                      }}
                    >
                      <Icon className="size-4" />
                    </motion.div>
                  ))}
                </div>

                <div className="relative flex flex-col items-center gap-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Loader2 className="size-4 animate-spin text-primary" />
                    {currentStepLabel ? `当前：${currentStepLabel}` : '正在生成你的独立站…'}
                  </div>
                  <AnimatePresence mode="wait">
                    <motion.p
                      key={tipIndex}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.3 }}
                      className="max-w-sm text-xs text-muted-foreground"
                    >
                      {LOADING_TIPS[tipIndex]}
                    </motion.p>
                  </AnimatePresence>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {result && (
            <div className="flex flex-wrap gap-3 border-t border-border p-3">
              <Button asChild size="sm">
                <a href={result.previewUrl} target="_blank" rel="noreferrer">
                  新标签页打开
                </a>
              </Button>
              <Button asChild size="sm" variant="outline">
                <a href={result.adminUrl} target="_blank" rel="noreferrer">
                  在后台编辑
                </a>
              </Button>
              <Button onClick={downloadCode} size="sm" variant="ghost" className="gap-1.5">
                <Download className="size-4" />
                下载代码
              </Button>
            </div>
          )}
      </div>
    </div>
  )
}
