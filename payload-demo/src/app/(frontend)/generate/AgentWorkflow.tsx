'use client'

import React, { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  Brain,
  Clock,
  FileText,
  ImageIcon,
  Images,
  LayoutTemplate,
  type LucideIcon,
  PencilRuler,
  Send,
  Sparkles,
  Wand2,
  Wrench,
} from 'lucide-react'

import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  ChainOfThoughtSearchResult,
  ChainOfThoughtSearchResults,
  ChainOfThoughtStep,
} from '@/components/ai-elements/chain-of-thought'
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from '@/components/ai-elements/reasoning'
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from '@/components/ai-elements/tool'
import { Task, TaskContent, TaskItem, TaskTrigger } from '@/components/ai-elements/task'
import { CodeBlock } from '@/components/ai-elements/code-block'

export type WorkflowStep = { key: string; label: string; status: 'active' | 'done' }
export type WorkflowInspiration = {
  components: { name: string; summary?: string }[]
  icons: { title: string; svgUrl: string }[]
}
export type WorkflowMcpCall = {
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

type StepState = 'pending' | 'active' | 'done'

const STEP_ORDER = [
  'upload',
  'parse',
  'read',
  'plan',
  'inspire',
  'write',
  'jsx',
  'sections',
  'image',
  'polish',
] as const
type StepKey = (typeof STEP_ORDER)[number]

const STEP_ICONS: Record<StepKey, LucideIcon> = {
  upload: Images,
  parse: FileText,
  read: ImageIcon,
  plan: LayoutTemplate,
  inspire: Sparkles,
  image: Wand2,
  write: PencilRuler,
  jsx: Send,
  sections: Sparkles,
  polish: Wrench,
}

function fallbackLabel(key: string): string {
  switch (key) {
    case 'upload':
      return '上传图片'
    case 'parse':
      return '理解你的需求'
    case 'read':
      return '读取商品图'
    case 'plan':
      return '规划版式与风格'
    case 'inspire':
      return '通过 21st.dev MCP 搜索组件与图标'
    case 'write':
      return '撰写文案与组装版块'
    case 'jsx':
      return '编写实时渲染的 Hero 组件'
    case 'sections':
      return '用 21st 组件编写各版块（实时渲染）'
    case 'image':
      return '最后批量生成场景与装饰图'
    case 'polish':
      return '自我打磨：修复变形 / 中文竖排 / 溢出等问题'
    default:
      return key
  }
}

/** Human-readable elapsed time for a step (e.g. `3.2s`, `1m05s`). */
function formatDuration(ms: number): string {
  const secs = Math.max(0, ms / 1000)
  if (secs < 60) return `${secs.toFixed(1)}s`
  const m = Math.floor(secs / 60)
  const r = Math.round(secs % 60)
  return `${m}m${r.toString().padStart(2, '0')}s`
}

const StepTimer: React.FC<{ ms: number; active: boolean }> = ({ ms, active }) => (
  <span
    className={
      'inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[10px] tabular-nums ' +
      (active
        ? 'animate-pulse border-primary/40 bg-primary/10 text-primary'
        : 'border-border bg-muted/50 text-muted-foreground')
    }
  >
    <Clock className="size-3" />
    {formatDuration(ms)}
  </span>
)

/** Map the streaming step status to the chain-of-thought visual status. */
function cotStatus(state: StepState): 'complete' | 'active' | 'pending' {
  if (state === 'done') return 'complete'
  if (state === 'active') return 'active'
  return 'pending'
}

/**
 * Route a raw progress log line to the chain step it belongs under, so each
 * step shows its own detail instead of dumping everything into one raw block.
 */
function logStepKey(log: string): StepKey | null {
  const l = log.toLowerCase().trim()
  if (l.startsWith('brand:') || l.startsWith('industry:')) return 'parse'
  if (l.includes('analyzing') && l.includes('image')) return 'read'
  if (
    l.startsWith('starting from template') ||
    l.startsWith('selected theme') ||
    l.startsWith('selected design family')
  )
    return 'plan'
  if (l.startsWith('mcp server tools') || (l.startsWith('made ') && l.includes('mcp tool call')))
    return 'inspire'
  if (l.startsWith('live jsx hero')) return 'jsx'
  if (l.startsWith('live jsx') || l.startsWith('signature standout') || l.startsWith('authored '))
    return 'sections'
  if (
    l.startsWith('batch-generating') ||
    l.startsWith('generated ') ||
    (l.startsWith('added ') && l.includes('image'))
  )
    return 'image'
  if (l.startsWith('polishing') || l.startsWith('self-polish')) return 'polish'
  return null
}

export const AgentWorkflow: React.FC<{
  steps: WorkflowStep[]
  analysis: string
  plan?: string
  inspiration: WorkflowInspiration | null
  mcpCalls?: WorkflowMcpCall[]
  mcpToolNames?: string[]
  logs: string[]
  running: boolean
  chosenTheme: { id: string; name: string } | null
  chosenTemplate: { id: string; name: string } | null
}> = ({
  steps,
  analysis,
  plan = '',
  inspiration,
  mcpCalls = [],
  mcpToolNames = [],
  logs,
  running,
  chosenTheme,
  chosenTemplate,
}) => {
  const stateOf = (key: string): StepState => {
    const s = steps.find((x) => x.key === key)
    return (s?.status as StepState) ?? 'pending'
  }
  const labelOf = (key: string) => steps.find((x) => x.key === key)?.label ?? fallbackLabel(key)

  // Per-step timing: record when each step first appears and when it finishes,
  // then surface a live-ticking (active) / frozen (done) elapsed badge. Both the
  // recorded timings and the "now" clock live in state (not a ref / Date.now()
  // in render) so the badges re-render purely and update predictably.
  const [timings, setTimings] = useState<Record<string, { start: number; end?: number }>>({})
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    setTimings((prev) => {
      const next = { ...prev }
      const ts = Date.now()
      let changed = false
      for (const s of steps) {
        if (!next[s.key]) {
          next[s.key] = { start: ts }
          changed = true
        }
        if (s.status === 'done' && next[s.key].end == null) {
          next[s.key] = { ...next[s.key], end: ts }
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [steps])
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [running])
  const elapsedOf = (key: string): number | null => {
    const t = timings[key]
    if (!t) return null
    return (t.end ?? now) - t.start
  }

  // Step-by-step reveal: only render steps the agent has actually reached
  // (emitted at least once), so the chain unfolds live instead of showing the
  // whole pipeline up front.
  const revealed = STEP_ORDER.filter((key) => steps.some((s) => s.key === key))

  const doneCount = revealed.filter((k) => stateOf(k) === 'done').length
  const headerTitle = running
    ? `设计 Agent 思考中… (${doneCount}/${revealed.length || STEP_ORDER.length})`
    : `设计 Agent 思维链 (${doneCount}/${revealed.length || STEP_ORDER.length})`

  const hasInspiration =
    !!inspiration && (inspiration.components.length > 0 || inspiration.icons.length > 0)
  const analysisStreaming = running && stateOf('write') !== 'done' && analysis.length > 0
  const planStreaming = running && stateOf('inspire') === 'pending' && plan.length > 0

  // Bucket each progress log under the step it belongs to. Anything that does
  // not map cleanly is attached to the currently-active step so nothing is lost.
  const activeKey = [...revealed].reverse().find((k) => stateOf(k) === 'active') ?? revealed.at(-1)
  const logBuckets: Partial<Record<StepKey, string[]>> = {}
  for (const line of logs) {
    const key = (logStepKey(line) ?? activeKey) as StepKey | undefined
    if (!key) continue
    ;(logBuckets[key] ??= []).push(line)
  }

  return (
    <ChainOfThought className="max-w-none" defaultOpen>
      <ChainOfThoughtHeader>
        <span className="flex items-center gap-2">
          <Brain className="size-4 text-primary" />
          {headerTitle}
        </span>
      </ChainOfThoughtHeader>

      <ChainOfThoughtContent>
        <AnimatePresence initial={false}>
        {revealed.map((key) => {
          const state = stateOf(key)
          const status = cotStatus(state)
          const elapsed = elapsedOf(key)

          // The "read" step surfaces the streaming design reasoning.
          const showReasoning = key === 'read' && (analysis || running)
          // The "plan" step surfaces the chosen template + theme chips and the
          // streaming BUILD PLAN the agent commits to before building.
          const showPlanChips = key === 'plan' && (chosenTemplate || chosenTheme)
          const showPlan = key === 'plan' && (plan || running)
          // The "inspire" step nests the live 21st.dev MCP tool calls.
          const showMcp =
            key === 'inspire' && (mcpCalls.length > 0 || mcpToolNames.length > 0 || hasInspiration)
          const stepLogs = logBuckets[key] ?? []

          return (
            <motion.div
              key={key}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.28, ease: 'easeOut' }}
            >
            <ChainOfThoughtStep
              icon={STEP_ICONS[key]}
              label={
                <span className="flex items-center justify-between gap-2">
                  <span>{labelOf(key)}</span>
                  {elapsed != null && (
                    <StepTimer ms={elapsed} active={state === 'active'} />
                  )}
                </span>
              }
              status={status}
            >
              {showPlanChips && (
                <ChainOfThoughtSearchResults>
                  {chosenTemplate && (
                    <ChainOfThoughtSearchResult>
                      <LayoutTemplate className="size-3" /> 模板 · {chosenTemplate.name}
                    </ChainOfThoughtSearchResult>
                  )}
                  {chosenTheme && (
                    <ChainOfThoughtSearchResult>
                      <Sparkles className="size-3" /> 主题 · {chosenTheme.name}
                    </ChainOfThoughtSearchResult>
                  )}
                </ChainOfThoughtSearchResults>
              )}

              {showPlan && (
                <div className="rounded-lg border bg-card p-3">
                  <Reasoning isStreaming={planStreaming} defaultOpen>
                    <ReasoningTrigger>
                      <LayoutTemplate className="size-4" /> 设计方案 (BUILD PLAN)
                    </ReasoningTrigger>
                    <ReasoningContent>{plan || '正在制定建站方案…'}</ReasoningContent>
                  </Reasoning>
                </div>
              )}

              {showReasoning && (
                <div className="rounded-lg border bg-card p-3">
                  <Reasoning isStreaming={analysisStreaming} defaultOpen>
                    <ReasoningTrigger />
                    <ReasoningContent>{analysis || '正在读图分析设计方向…'}</ReasoningContent>
                  </Reasoning>
                </div>
              )}

              {showMcp && (
                <div className="flex flex-col gap-2">
                  {mcpToolNames.length > 0 && (
                    <ChainOfThoughtSearchResults>
                      {mcpToolNames.map((t) => (
                        <ChainOfThoughtSearchResult key={t}>
                          <Wrench className="size-3" /> {t}
                        </ChainOfThoughtSearchResult>
                      ))}
                    </ChainOfThoughtSearchResults>
                  )}
                  {mcpCalls.map((call) => {
                    const callState =
                      call.status === 'done'
                        ? 'output-available'
                        : call.status === 'error'
                          ? 'output-error'
                          : 'input-available'
                    const title =
                      call.tool === 'logo_search'
                        ? `logo_search · ${call.query}`
                        : `${call.featured ? '✦ 特色 · ' : ''}component_inspiration · ${call.section ?? ''} · "${call.query}"`
                    return (
                      <Tool key={call.id} defaultOpen={!!call.codePreview}>
                        <ToolHeader
                          type="dynamic-tool"
                          toolName={call.tool}
                          state={callState}
                          title={`#${call.round} ${title}`}
                        />
                        <ToolContent>
                          <ToolInput
                            input={{
                              tool:
                                call.tool === 'logo_search'
                                  ? 'logo_search'
                                  : '21st_magic_component_inspiration',
                              section: call.section,
                              searchQuery: call.query,
                            }}
                          />
                          {call.status !== 'running' && (
                            <ToolOutput
                              errorText={call.status === 'error' ? 'MCP 调用失败' : undefined}
                              output={
                                <div className="flex flex-col gap-2 p-3">
                                  <div className="text-sm">
                                    {call.componentName ? (
                                      <span className="font-medium">{call.componentName}</span>
                                    ) : (
                                      <span className="text-muted-foreground">
                                        {call.resultCount ?? 0} 个结果
                                      </span>
                                    )}
                                    {typeof call.similarity === 'number' && (
                                      <span className="text-muted-foreground">
                                        {' '}
                                        （匹配度 {call.similarity.toFixed(2)}）
                                      </span>
                                    )}
                                  </div>
                                  {call.codePreview && (
                                    <CodeBlock
                                      code={call.codePreview}
                                      language="tsx"
                                      className="max-h-72 overflow-auto"
                                    />
                                  )}
                                </div>
                              }
                            />
                          )}
                        </ToolContent>
                      </Tool>
                    )
                  })}

                  {hasInspiration && inspiration!.icons.length > 0 && (
                    <div className="flex flex-wrap items-center gap-3 pt-1">
                      {inspiration!.icons.map((ic, i) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={i}
                          src={ic.svgUrl}
                          alt={ic.title}
                          title={ic.title}
                          className="h-6 w-6"
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {stepLogs.length > 0 && (
                <Task defaultOpen>
                  <TaskTrigger title={`执行记录 · ${stepLogs.length}`} />
                  <TaskContent>
                    {stepLogs.map((l, i) => (
                      <TaskItem key={`${key}-log-${i}`}>
                        <motion.span
                          initial={{ opacity: 0, x: -4 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.2 }}
                          className="block text-xs leading-relaxed"
                        >
                          {l}
                        </motion.span>
                      </TaskItem>
                    ))}
                  </TaskContent>
                </Task>
              )}
            </ChainOfThoughtStep>
            </motion.div>
          )
        })}
        </AnimatePresence>
      </ChainOfThoughtContent>
    </ChainOfThought>
  )
}
