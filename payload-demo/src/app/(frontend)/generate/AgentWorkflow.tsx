'use client'

import React from 'react'
import { CheckCircle2, Circle, Loader2, Sparkles } from 'lucide-react'

import {
  Task,
  TaskContent,
  TaskItem,
  TaskItemFile,
  TaskTrigger,
} from '@/components/ai-elements/task'
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
}

type StepState = 'pending' | 'active' | 'done'

const STEP_ORDER = ['upload', 'parse', 'read', 'plan', 'inspire', 'write'] as const

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
      return '搜索 21st.dev 组件与图标'
    case 'write':
      return '撰写文案与组装版块'
    default:
      return key
  }
}

function StepIcon({ state }: { state: StepState }) {
  if (state === 'done') return <CheckCircle2 className="size-4 text-green-600" />
  if (state === 'active') return <Loader2 className="size-4 animate-spin text-primary" />
  return <Circle className="size-4 text-muted-foreground/50" />
}

export const AgentWorkflow: React.FC<{
  steps: WorkflowStep[]
  analysis: string
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
  const labelOf = (key: string) =>
    steps.find((x) => x.key === key)?.label ?? fallbackLabel(key)

  const doneCount = STEP_ORDER.filter((k) => stateOf(k) === 'done').length
  const planTitle = running
    ? `设计 Agent 工作中… (${doneCount}/${STEP_ORDER.length})`
    : `设计 Agent 工作流 (${doneCount}/${STEP_ORDER.length})`

  // 21st.dev tool call state
  const inspireState = stateOf('inspire')
  const hasInspiration =
    !!inspiration && (inspiration.components.length > 0 || inspiration.icons.length > 0)
  const toolState =
    inspireState === 'done' || hasInspiration
      ? 'output-available'
      : inspireState === 'active'
        ? 'input-available'
        : 'input-streaming'

  const analysisStreaming = running && stateOf('write') !== 'done' && analysis.length > 0

  return (
    <div className="flex flex-col gap-2">
      {/* Plan / task list */}
      <Task defaultOpen className="rounded-lg border bg-card p-4">
        <TaskTrigger title={planTitle}>
          <div className="flex w-full cursor-pointer items-center gap-2 text-sm font-medium">
            <Sparkles className="size-4 text-primary" />
            <span>{planTitle}</span>
          </div>
        </TaskTrigger>
        <TaskContent>
          {STEP_ORDER.map((key) => {
            const state = stateOf(key)
            return (
              <TaskItem key={key} className="flex items-center gap-2">
                <StepIcon state={state} />
                <span className={state === 'pending' ? 'text-muted-foreground/60' : 'text-foreground'}>
                  {labelOf(key)}
                </span>
              </TaskItem>
            )
          })}
          {chosenTemplate && (
            <TaskItem className="flex items-center gap-2 pt-1">
              <span className="text-muted-foreground">选定模板</span>
              <TaskItemFile>{chosenTemplate.name}</TaskItemFile>
            </TaskItem>
          )}
          {chosenTheme && (
            <TaskItem className="flex items-center gap-2 pt-1">
              <span className="text-muted-foreground">选定主题</span>
              <TaskItemFile>{chosenTheme.name}</TaskItemFile>
            </TaskItem>
          )}
        </TaskContent>
      </Task>

      {/* Streaming reasoning (design thinking) */}
      {(analysis || running) && (
        <div className="rounded-lg border bg-card p-4">
          <Reasoning isStreaming={analysisStreaming} defaultOpen>
            <ReasoningTrigger />
            <ReasoningContent>{analysis || '正在读图分析设计方向…'}</ReasoningContent>
          </Reasoning>
        </div>
      )}

      {/* 21st.dev Magic MCP — live multi-round tool calls */}
      {(mcpCalls.length > 0 || mcpToolNames.length > 0) && (
        <div className="flex flex-col gap-2 rounded-lg border bg-card p-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Sparkles className="size-4 text-primary" />
            <span>21st.dev Magic MCP · 多轮 tool-call</span>
          </div>
          {mcpToolNames.length > 0 && (
            <p className="text-xs text-muted-foreground">
              MCP server 工具：{mcpToolNames.map((t) => `\`${t}\``).join('、')}
            </p>
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
                : `component_inspiration · ${call.section ?? ''} · "${call.query}"`
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
        </div>
      )}

      {/* 21st.dev inspiration summary (icons + component names) */}
      {(inspireState !== 'pending' || hasInspiration) && (
        <Tool defaultOpen={hasInspiration}>
          <ToolHeader type="dynamic-tool" toolName="21st.dev_search" state={toolState} title="21st.dev 组件与图标汇总" />
          <ToolContent>
            <ToolInput
              input={{
                source: 'magic.21st.dev (MCP)',
                tools: mcpToolNames.length ? mcpToolNames : ['component_inspiration', 'logo_search'],
              }}
            />
            {hasInspiration && (
              <ToolOutput
                errorText={undefined}
                output={
                  <div className="flex flex-col gap-3 p-3">
                    {inspiration!.components.length > 0 && (
                      <div>
                        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          组件灵感 ({inspiration!.components.length})
                        </p>
                        <ul className="flex flex-col gap-1 text-sm">
                          {inspiration!.components.map((c, i) => (
                            <li key={i}>
                              <span className="font-medium">{c.name}</span>
                              {c.summary ? (
                                <span className="text-muted-foreground"> — {c.summary}</span>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {inspiration!.icons.length > 0 && (
                      <div>
                        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          图标 ({inspiration!.icons.length})
                        </p>
                        <div className="flex flex-wrap items-center gap-3">
                          {inspiration!.icons.map((ic, i) => (
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
                      </div>
                    )}
                  </div>
                }
              />
            )}
          </ToolContent>
        </Tool>
      )}

      {/* Raw log stream */}
      {logs.length > 0 && (
        <div className="rounded-md bg-muted/40 p-3 font-mono text-xs text-muted-foreground">
          {logs.map((l, i) => (
            <div key={i}>› {l}</div>
          ))}
        </div>
      )}
    </div>
  )
}
