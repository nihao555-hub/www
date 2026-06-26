'use client'

import React, { useCallback, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  const [chosenTheme, setChosenTheme] = useState<{ id: string; name: string } | null>(null)
  const [chosenTemplate, setChosenTemplate] = useState<{ id: string; name: string } | null>(null)
  const [inspiration, setInspiration] = useState<Inspiration | null>(null)
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
    setChosenTheme(null)
    setChosenTemplate(null)
    setInspiration(null)
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
        } else if (event === 'theme') {
          setChosenTheme({ id: String(payload.id), name: String(payload.name) })
        } else if (event === 'template') {
          setChosenTemplate({ id: String(payload.id), name: String(payload.name) })
        } else if (event === 'inspiration') {
          setInspiration(payload as unknown as Inspiration)
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

  const showWorkspace = running || result || steps.length > 0

  return (
    <div className="flex flex-col gap-8">
      {/* ---- Single-box brief ---- */}
      <div className="mx-auto w-full max-w-3xl">
        <h2 className="text-center text-2xl font-semibold tracking-tight">
          一句话生成你的独立站
        </h2>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          把所有需求写进一个输入框（品牌、行业、卖点、目标客户…），上传商品图，AI 自动拆解并生成多页独立站。
        </p>

        <div className="mt-5">
          <PromptInputBox
            isLoading={running}
            placeholder="例如：我们是恒泰钢管厂，做无缝钢管和镀锌管，面向海外工程采购商，主打 ISO 认证、20 年出口经验、OEM/ODM。整体走工业风、专业可信。"
            languages={LANGUAGES}
            language={language}
            onLanguageChange={setLanguage}
            themes={themeOptions}
            themeId={themeId}
            onThemeChange={setThemeId}
            onSend={handleSend}
            maxImages={6}
          />
        </div>

        {error && (
          <div className="mt-3 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
      </div>

      {/* ---- Live workspace ---- */}
      <div className="flex flex-col gap-6">
        {!showWorkspace && (
          <Card className="flex min-h-[280px] items-center justify-center">
            <CardContent className="py-16 text-center text-muted-foreground">
              <p className="text-lg font-medium">实时设计工作台</p>
              <p className="mt-2 text-sm">
                在上方输入框描述业务并上传商品图后，这里会实时显示 AI 设计 agent 的工作过程与独立站预览。
              </p>
            </CardContent>
          </Card>
        )}

        {showWorkspace && (
          <>
            {/* Real-time agent workflow (ai-elements) */}
            <Card>
              <CardHeader>
                <CardTitle>设计 Agent 实时工作流</CardTitle>
              </CardHeader>
              <CardContent>
                <AgentWorkflow
                  steps={steps}
                  analysis={analysis}
                  inspiration={inspiration}
                  logs={logs}
                  running={running}
                  chosenTheme={chosenTheme}
                  chosenTemplate={chosenTemplate}
                />
              </CardContent>
            </Card>

            {/* Live preview */}
            {result && (
              <Card>
                <CardHeader>
                  <CardTitle>独立站实时预览 — {result.siteName}</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <div className="overflow-hidden rounded-lg border border-border">
                    <iframe
                      src={result.previewUrl}
                      title="preview"
                      className="h-[640px] w-full bg-white"
                    />
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Button asChild>
                      <a href={result.previewUrl} target="_blank" rel="noreferrer">
                        新标签页打开
                      </a>
                    </Button>
                    <Button asChild variant="outline">
                      <a href={result.adminUrl} target="_blank" rel="noreferrer">
                        在后台编辑
                      </a>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  )
}
