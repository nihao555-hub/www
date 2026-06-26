'use client'

import React, { useCallback, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Loader2, Sparkles } from 'lucide-react'

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

export const GenerateForm: React.FC = () => {
  const [language, setLanguage] = useState('en')
  const [themeId, setThemeId] = useState('auto')

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

  const themeOptions = useMemo(
    () => [
      { id: 'auto', label: '✨ AI 自动选择主题' },
      ...[...THEMES]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((t) => ({ id: t.id, label: `${t.name} — ${t.mood}` })),
    ],
    [],
  )

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
  const currentStepLabel = useMemo(() => {
    const active = [...steps].reverse().find((s) => s.status === 'active')
    if (active) return active.label
    const lastDone = [...steps].reverse().find((s) => s.status === 'done')
    return lastDone?.label ?? ''
  }, [steps])

  const promptBox = (
    <PromptInputBox
      isLoading={running}
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

  // ---- Idle: minimal one-line brief, centered ----
  if (!showWorkspace) {
    return (
      <div className="mx-auto flex min-h-[60vh] w-full max-w-2xl flex-col justify-center gap-5">
        <h2 className="text-center text-3xl font-semibold tracking-tight">
          一句话生成你的独立站
        </h2>
        {promptBox}
        {error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
      </div>
    )
  }

  // ---- Working / done: left 20% rail (status + input), right 80% live preview ----
  return (
    <div className="flex h-[calc(100vh-7rem)] min-h-[560px] flex-col gap-4 lg:flex-row">
      {/* Left rail: agent status (top) + input (bottom) */}
      <div className="flex w-full flex-col gap-3 lg:w-1/5 lg:min-w-[260px]">
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
      <Card className="flex min-h-0 w-full flex-col overflow-hidden lg:w-4/5 lg:flex-1">
        <CardContent className="flex min-h-0 flex-1 flex-col p-0">
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
        </CardContent>
      </Card>
    </div>
  )
}
