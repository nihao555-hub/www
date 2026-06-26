'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Loader2, Plus, Sparkles } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { PromptInputBox } from '@/components/ui/prompt-input-box'
import { THEMES } from '@/lib/ai/themes'
import { AgentWorkflow } from './AgentWorkflow'

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

export const GenerateForm: React.FC = () => {
  const [language, setLanguage] = useState('en')
  const [themeId, setThemeId] = useState('auto')
  const [brief, setBrief] = useState('')

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
    if (sentFiles.length === 0) {
      setError('请至少上传一张商品图（AI 看图设计）。')
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

  // ---- Idle: far-left nav (new task + history) + centered one-line brief ----
  if (!showWorkspace) {
    return (
      <div className="fixed inset-0 z-40 flex bg-background">
        {/* Far-left navigation: new task + history */}
        <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-muted/30 sm:flex">
          <div className="flex items-center gap-2 px-4 py-4">
            <Sparkles className="size-5 text-primary" />
            <span className="text-sm font-semibold tracking-tight">独立站生成器</span>
          </div>
          <div className="px-3">
            <Button onClick={handleNewTask} size="sm" className="w-full justify-start gap-2">
              <Plus className="size-4" />
              新建任务
            </Button>
          </div>
          <div className="px-4 pb-2 pt-5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            历史任务
          </div>
          <nav className="min-h-0 flex-1 space-y-0.5 overflow-auto px-2 pb-4">
            {history.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">暂无历史任务</p>
            ) : (
              history.map((h) => (
                <a
                  key={h.id}
                  href={`/s/${h.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-md px-3 py-2 text-sm text-foreground/80 transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  <span className="block truncate font-medium">{h.siteName || h.slug}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">/s/{h.slug}</span>
                </a>
              ))
            )}
          </nav>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- /admin is served by Payload, not a Next page route */}
          <a
            href="/admin"
            className="border-t border-border px-4 py-3 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            → 进入后台
          </a>
        </aside>

        {/* Centered one-line brief + example prompts (ChatGPT-style) */}
        <main className="flex min-w-0 flex-1 flex-col items-center justify-center gap-6 overflow-auto px-6 py-10">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 shadow-sm">
              <Sparkles className="size-7 text-primary" />
            </div>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              一句话生成你的独立站
            </h2>
            <p className="max-w-xl text-sm text-muted-foreground">
              描述你的品牌与产品并上传商品图，世界级设计 Agent 会自动调研 21st.dev
              组件、规划版式、撰写文案、批量配图并自我打磨，产出可直接发布的独立站。
            </p>
          </div>

          <div className="w-full max-w-2xl">
            {promptBox}
            {error && (
              <div className="mt-3 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
          </div>

          <div className="w-full max-w-2xl">
            <p className="mb-2 text-center text-xs text-muted-foreground">试试这些示例</p>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {EXAMPLE_PROMPTS.map((ex) => (
                <button
                  key={ex.title}
                  type="button"
                  onClick={() => setBrief(ex.brief)}
                  className="group flex items-start gap-3 rounded-xl border border-border bg-card p-3 text-left transition-all hover:border-primary/50 hover:bg-accent hover:shadow-sm"
                >
                  <span className="text-xl leading-none">{ex.emoji}</span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{ex.title}</span>
                    <span className="line-clamp-2 block text-xs text-muted-foreground">
                      {ex.brief}
                    </span>
                  </span>
                </button>
              ))}
            </div>
            <p className="mt-3 text-center text-[11px] text-muted-foreground">
              提示：点击示例会填入输入框，记得上传一张商品图再点发送。
            </p>
          </div>
        </main>
      </div>
    )
  }

  // ---- Working / done: full-bleed left 20% rail (status + input) + right 80% live preview ----
  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background lg:flex-row">
      {/* Left rail: agent status (top) + input (bottom) */}
      <div className="flex w-full shrink-0 flex-col gap-3 border-b border-border p-3 lg:h-full lg:w-1/5 lg:min-w-[280px] lg:border-b-0 lg:border-r">
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

        <div>
          {promptBox}
          {error && (
            <div className="mt-2 rounded-md border border-destructive/50 bg-destructive/10 p-2 text-xs text-destructive">
              {error}
            </div>
          )}
        </div>
      </div>

      {/* Right: full live independent-site preview */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <AnimatePresence mode="wait">
            {result ? (
              <motion.iframe
                key="preview"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4 }}
                src={result.previewUrl}
                title="preview"
                className="h-full w-full flex-1 bg-white"
              />
            ) : (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="relative flex h-full flex-1 flex-col items-center justify-center gap-5 overflow-hidden bg-gradient-to-br from-muted/40 via-background to-muted/30 text-center"
              >
                {/* animated ambient blobs, synced with the working state */}
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
                <motion.div
                  className="relative flex size-16 items-center justify-center rounded-2xl border border-primary/30 bg-background/70 shadow-lg backdrop-blur"
                  animate={{ rotate: [0, 8, -8, 0] }}
                  transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                >
                  <Sparkles className="size-7 text-primary" />
                </motion.div>
                <div className="relative flex flex-col items-center gap-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Loader2 className="size-4 animate-spin text-primary" />
                    正在生成你的独立站…
                  </div>
                  <AnimatePresence mode="wait">
                    <motion.p
                      key={currentStepLabel}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.25 }}
                      className="max-w-sm text-xs text-muted-foreground"
                    >
                      {currentStepLabel
                        ? `当前：${currentStepLabel}`
                        : 'AI 正在读图、规划版式并组装版块…'}
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
            </div>
          )}
      </div>
    </div>
  )
}
