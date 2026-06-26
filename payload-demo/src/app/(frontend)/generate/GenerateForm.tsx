'use client'

import React, { useCallback, useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { THEMES } from '@/lib/ai/themes'

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

const STEP_ORDER = ['upload', 'read', 'plan', 'inspire', 'write']

export const GenerateForm: React.FC = () => {
  const [files, setFiles] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const [language, setLanguage] = useState('en')
  const [themeId, setThemeId] = useState('auto')

  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [steps, setSteps] = useState<Step[]>([])
  const [analysis, setAnalysis] = useState('')
  const [chosenTheme, setChosenTheme] = useState<{ id: string; name: string } | null>(null)
  const [inspiration, setInspiration] = useState<Inspiration | null>(null)
  const [logs, setLogs] = useState<string[]>([])
  const [result, setResult] = useState<DoneResult | null>(null)

  const analysisRef = useRef<HTMLDivElement>(null)

  const sortedThemes = useMemo(
    () => [...THEMES].sort((a, b) => a.name.localeCompare(b.name)),
    [],
  )

  const onFiles = (list: FileList | null) => {
    const arr = Array.from(list ?? [])
    setFiles(arr)
    setPreviews(arr.map((f) => URL.createObjectURL(f)))
  }

  const upsertStep = useCallback((s: Step) => {
    setSteps((prev) => {
      const idx = prev.findIndex((p) => p.key === s.key)
      if (idx === -1) return [...prev, s]
      const next = [...prev]
      next[idx] = s
      return next
    })
  }, [])

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (files.length === 0) {
      setError('请至少上传一张商品图。')
      return
    }

    setError(null)
    setResult(null)
    setSteps([])
    setAnalysis('')
    setChosenTheme(null)
    setInspiration(null)
    setLogs([])
    setRunning(true)

    const formEl = e.currentTarget
    const data = new FormData()
    data.set('name', (formEl.elements.namedItem('name') as HTMLInputElement).value)
    data.set('industry', (formEl.elements.namedItem('industry') as HTMLInputElement).value)
    data.set('description', (formEl.elements.namedItem('description') as HTMLTextAreaElement).value)
    data.set('language', language)
    if (themeId !== 'auto') data.set('themeId', themeId)
    files.forEach((f) => data.append('images', f))

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
          requestAnimationFrame(() => {
            analysisRef.current?.scrollTo({ top: analysisRef.current.scrollHeight })
          })
        } else if (event === 'theme') {
          setChosenTheme({ id: String(payload.id), name: String(payload.name) })
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
    <div className="grid gap-8 lg:grid-cols-[420px_1fr]">
      {/* ---- Control panel ---- */}
      <Card className="h-fit">
        <CardHeader>
          <CardTitle>生成设置</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">商家 / 品牌名称</Label>
              <Input id="name" name="name" placeholder="例如：晨光智能家居" />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="industry">行业（可选）</Label>
              <Input id="industry" name="industry" placeholder="智能家居 / 户外装备 / 美妆" />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="description">简介 / 卖点（可选）</Label>
              <Textarea
                id="description"
                name="description"
                rows={3}
                placeholder="一句话描述你卖什么、面向谁、有什么优势。"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-2">
                <Label>生成语言</Label>
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LANGUAGES.map((l) => (
                      <SelectItem key={l.code} value={l.code}>
                        {l.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-2">
                <Label>风格主题</Label>
                <Select value={themeId} onValueChange={setThemeId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">✨ AI 自动选择</SelectItem>
                    {sortedThemes.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name} — {t.mood}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="images">商品图（1-6 张，AI 看图设计）</Label>
              <Input
                id="images"
                name="images"
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => onFiles(e.target.files)}
              />
              {previews.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {previews.map((src, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={i}
                      src={src}
                      alt={`preview ${i + 1}`}
                      className="h-16 w-16 rounded-md object-cover border border-border"
                    />
                  ))}
                </div>
              )}
            </div>

            <Button type="submit" disabled={running} size="lg">
              {running ? 'AI 设计中…' : '一键生成独立站'}
            </Button>

            {error && (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
          </form>
        </CardContent>
      </Card>

      {/* ---- Live workspace ---- */}
      <div className="flex flex-col gap-6">
        {!showWorkspace && (
          <Card className="flex min-h-[420px] items-center justify-center">
            <CardContent className="py-16 text-center text-muted-foreground">
              <p className="text-lg font-medium">实时设计工作台</p>
              <p className="mt-2 text-sm">
                填好左侧信息并上传商品图后，这里会实时显示 AI 设计 agent 的工作过程与独立站预览。
              </p>
            </CardContent>
          </Card>
        )}

        {showWorkspace && (
          <>
            {/* Steps */}
            <Card>
              <CardHeader>
                <CardTitle>设计 Agent 实时状态</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="flex flex-col gap-2">
                  {STEP_ORDER.map((key) => {
                    const s = steps.find((x) => x.key === key)
                    const status = s?.status
                    return (
                      <li key={key} className="flex items-center gap-3 text-sm">
                        <span
                          className={
                            status === 'done'
                              ? 'flex h-5 w-5 items-center justify-center rounded-full bg-green-500 text-white text-xs'
                              : status === 'active'
                                ? 'flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs animate-pulse'
                                : 'flex h-5 w-5 items-center justify-center rounded-full bg-muted text-muted-foreground text-xs'
                          }
                        >
                          {status === 'done' ? '✓' : status === 'active' ? '●' : ''}
                        </span>
                        <span
                          className={
                            status ? 'text-foreground' : 'text-muted-foreground'
                          }
                        >
                          {s?.label ?? defaultStepLabel(key)}
                        </span>
                      </li>
                    )
                  })}
                </ol>

                {chosenTheme && (
                  <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-border bg-muted px-3 py-1 text-xs">
                    <span className="font-medium">选定主题：</span>
                    {chosenTheme.name}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Analysis stream */}
            {(analysis || running) && (
              <Card>
                <CardHeader>
                  <CardTitle>设计思路（实时）</CardTitle>
                </CardHeader>
                <CardContent>
                  <div
                    ref={analysisRef}
                    className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-md bg-muted/50 p-4 text-sm leading-relaxed"
                  >
                    {analysis || '正在读图…'}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Inspiration */}
            {inspiration && (inspiration.components.length > 0 || inspiration.icons.length > 0) && (
              <Card>
                <CardHeader>
                  <CardTitle>21st.dev 灵感与图标</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  {inspiration.components.length > 0 && (
                    <ul className="flex flex-col gap-1 text-sm">
                      {inspiration.components.map((c, i) => (
                        <li key={i}>
                          <span className="font-medium">{c.name}</span>
                          {c.summary ? (
                            <span className="text-muted-foreground"> — {c.summary}</span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                  {inspiration.icons.length > 0 && (
                    <div className="flex flex-wrap items-center gap-3">
                      {inspiration.icons.map((ic, i) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={i}
                          src={ic.svgUrl}
                          alt={ic.title}
                          title={ic.title}
                          className="h-7 w-7"
                        />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {logs.length > 0 && (
              <div className="rounded-md bg-muted/40 p-3 font-mono text-xs text-muted-foreground">
                {logs.map((l, i) => (
                  <div key={i}>› {l}</div>
                ))}
              </div>
            )}

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

function defaultStepLabel(key: string): string {
  switch (key) {
    case 'upload':
      return '上传图片'
    case 'read':
      return '读取商品图'
    case 'plan':
      return '规划版式与风格'
    case 'inspire':
      return '搜索 21st.dev 组件与图标'
    case 'write':
      return '撰写文案与组装版块'
    default:
      return key
  }
}
