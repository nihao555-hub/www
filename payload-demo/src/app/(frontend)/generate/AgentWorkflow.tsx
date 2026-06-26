'use client'

import React from 'react'
import {
  Brain,
  FileText,
  ImageIcon,
  Images,
  LayoutTemplate,
  type LucideIcon,
  PencilRuler,
  Send,
  Sparkles,
  Wand2,
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

const STEP_ORDER = ['upload', 'parse', 'read', 'plan', 'inspire', 'image', 'write', 'jsx', 'sections'] as const
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
    case 'image':
      return '用 gpt-image-2 生成场景与装饰图'
    case 'write':
      return '撰写文案与组装版块'
    case 'jsx':
      return '编写实时渲染的 Hero 组件'
    case 'sections':
      return '用 21st 组件编写各版块（实时渲染）'
    default:
      return key
  }
}

/** Map the streaming step status to the chain-of-thought visual status. */
function cotStatus(state: StepState): 'complete' | 'active' | 'pending' {
  if (state === 'done') return 'complete'
  if (state === 'active') return 'active'
  return 'pending'
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
  const labelOf = (key: string) => steps.find((x) => x.key === key)?.label ?? fallbackLabel(key)

  const doneCount = STEP_ORDER.filter((k) => stateOf(k) === 'done').length
  const headerTitle = running
    ? `设计 Agent 思考中… (${doneCount}/${STEP_ORDER.length})`
    : `设计 Agent 思维链 (${doneCount}/${STEP_ORDER.length})`

  const hasInspiration =
    !!inspiration && (inspiration.components.length > 0 || inspiration.icons.length > 0)
  const analysisStreaming = running && stateOf('write') !== 'done' && analysis.length > 0

  return (
    <ChainOfThought className="max-w-none" defaultOpen>
      <ChainOfThoughtHeader>
        <span className="flex items-center gap-2">
          <Brain className="size-4 text-primary" />
          {headerTitle}
        </span>
      </ChainOfThoughtHeader>

      <ChainOfThoughtContent>
        {STEP_ORDER.map((key) => {
          const state = stateOf(key)
          const status = cotStatus(state)

          // The "read"/"plan" steps surface the streaming design reasoning.
          const showReasoning = key === 'read' && (analysis || running)
          // The "plan" step surfaces the chosen template + theme chips.
          const showPlanChips = key === 'plan' && (chosenTemplate || chosenTheme)
          // The "inspire" step nests the live 21st.dev MCP tool calls.
          const showMcp =
            key === 'inspire' && (mcpCalls.length > 0 || mcpToolNames.length > 0 || hasInspiration)

          return (
            <ChainOfThoughtStep
              key={key}
              icon={STEP_ICONS[key]}
              label={labelOf(key)}
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
            </ChainOfThoughtStep>
          )
        })}
      </ChainOfThoughtContent>

      {/* Raw log stream */}
      {logs.length > 0 && (
        <div className="rounded-md bg-muted/40 p-3 font-mono text-xs text-muted-foreground">
          {logs.map((l, i) => (
            <div key={i}>› {l}</div>
          ))}
        </div>
      )}
    </ChainOfThought>
  )
}
