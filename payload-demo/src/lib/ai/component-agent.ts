/**
 * The 21st.dev component agent — a small ReAct loop that drives the Magic MCP
 * server over multiple rounds of tool calls.
 *
 * The relay model does NOT support native function/tool calling, so we run a
 * text-protocol ReAct loop: each round the model emits a single JSON action
 * (which MCP tool to call, with which arguments), we execute it against the live
 * MCP session, summarize the result back into the transcript, and let the model
 * decide the next call. This produces genuine multi-round MCP tool calls and
 * pulls REAL component source code for each section of the site.
 */

import { extractJson, relayChat, type ChatMessage } from './relay'
import type { SiteTemplate } from './templates'
import type { IconResult } from './twentyfirst'
import {
  isMcpConfigured,
  withMcpSession,
  type ComponentRef,
  type McpSession,
} from './twentyfirst-mcp'

/** A single MCP tool call, surfaced live to the generation UI as proof. */
export type McpToolCall = {
  id: number
  round: number
  tool: 'component_inspiration' | 'logo_search'
  section?: string
  query: string
  status: 'running' | 'done' | 'error'
  resultCount?: number
  componentName?: string
  similarity?: number
  /** short snippet of the real code returned (for the live tool card) */
  codePreview?: string
}

export type ComponentAgentResult = {
  /** tool names advertised by the MCP server */
  toolNames: string[]
  /** real components pulled per section */
  refs: ComponentRef[]
  /** brand/category icons pulled via logo_search */
  icons: IconResult[]
  /** the full ordered list of tool calls made */
  calls: McpToolCall[]
}

type AgentContext = {
  name: string
  industry?: string
  description?: string
  themeName: string
  template: SiteTemplate
}

const MAX_ROUNDS = 7
/** Core sections we guarantee a real component for, even if the model stops early. */
const REQUIRED_SECTIONS = ['hero', 'features', 'cta'] as const

type AgentAction =
  | { tool: 'component_inspiration'; section: string; searchQuery: string; message: string }
  | { tool: 'logo_search'; queries: string[] }
  | { done: true }

function parseAction(reply: string): AgentAction | null {
  let obj: Record<string, unknown>
  try {
    obj = extractJson(reply) as Record<string, unknown>
  } catch {
    return null
  }
  if (obj.done === true) return { done: true }
  const tool = typeof obj.tool === 'string' ? obj.tool : ''
  if (tool === 'logo_search') {
    const queries = Array.isArray(obj.queries)
      ? obj.queries.map((q) => String(q)).filter(Boolean)
      : []
    return queries.length ? { tool: 'logo_search', queries } : { done: true }
  }
  if (tool === 'component_inspiration' || tool === 'inspire') {
    const searchQuery = typeof obj.searchQuery === 'string' ? obj.searchQuery.trim() : ''
    if (!searchQuery) return null
    return {
      tool: 'component_inspiration',
      section: (typeof obj.section === 'string' && obj.section.trim()) || 'section',
      searchQuery,
      message:
        typeof obj.message === 'string' && obj.message.trim()
          ? obj.message.trim()
          : `Find a high-quality ${searchQuery} component`,
    }
  }
  return null
}

function sectionPlan(template: SiteTemplate): string[] {
  const kinds = new Set<string>(['hero'])
  for (const page of template.pages) {
    for (const s of page.sections) kinds.add(s)
  }
  return [...kinds]
}

const SYSTEM = `You are a senior UI engineer with live access to the 21st.dev Magic MCP server. You are assembling a multi-page B2B website and must pull REAL, production-grade component source code for each major section, plus relevant brand/trust icons.

Available MCP tools:
1. component_inspiration — searches 21st.dev and returns the actual source code of a matching UI component.
   args: { "section": "<which site section: hero|stats|features|showcase|steps|faq|cta|contact|gallery>", "searchQuery": "<2-4 words>", "message": "<one sentence on what you want and why>" }
2. logo_search — searches brand/company SVG logos (e.g. certifications, partners, payment, recognizable tech brands).
   args: { "queries": ["brand a", "brand b"] }

Respond EVERY round with ONLY one JSON object, no prose, exactly one of:
{"thought":"...","tool":"component_inspiration","section":"hero","searchQuery":"...","message":"..."}
{"thought":"...","tool":"logo_search","queries":["...","..."]}
{"thought":"...","done":true}

Rules:
- Make ONE tool call per round. Pull real components for the key sections of THIS site — at minimum hero, features and a strong CTA, plus any of {stats, showcase, steps, faq} that suit the brand.
- Do NOT search the same section twice. Pick precise, modern searchQuery phrases (e.g. "industrial hero section", "feature grid cards", "stats counter band", "cta banner").
- Use logo_search at most once, only for logos a real buyer would recognize for this brand/industry; skip it if none apply.
- Once you have real components for the key sections, reply {"done":true}. You have at most ${MAX_ROUNDS} rounds.`

/**
 * Runs the multi-round MCP component agent. Best-effort: any failure returns
 * whatever was gathered so far (generation never blocks on inspiration).
 */
export async function runComponentAgent(
  ctx: AgentContext,
  onCall: (calls: McpToolCall[]) => void,
  signal?: AbortSignal,
): Promise<ComponentAgentResult> {
  const empty: ComponentAgentResult = { toolNames: [], refs: [], icons: [], calls: [] }
  if (!isMcpConfigured()) return empty

  try {
    return await withMcpSession(async (session) => {
      const calls: McpToolCall[] = []
      const refs: ComponentRef[] = []
      let icons: IconResult[] = []
      let usedLogoSearch = false
      let callId = 0

      const emit = () => onCall(calls.map((c) => ({ ...c })))

      const recommended = sectionPlan(ctx.template)
      const transcript: ChatMessage[] = [
        { role: 'system', content: SYSTEM },
        {
          role: 'user',
          content: [
            `Brand: ${ctx.name}`,
            ctx.industry ? `Industry: ${ctx.industry}` : null,
            ctx.description ? `About: ${ctx.description}` : null,
            `Theme: ${ctx.themeName}`,
            `Template: ${ctx.template.name} (${ctx.template.id})`,
            `Sections you should aim to cover: ${recommended.join(', ')}`,
            '',
            'Begin. Respond with your first JSON action.',
          ]
            .filter(Boolean)
            .join('\n'),
        },
      ]

      const runInspire = async (action: {
        section: string
        searchQuery: string
        message: string
      }): Promise<McpToolCall> => {
        const call: McpToolCall = {
          id: ++callId,
          round: calls.length + 1,
          tool: 'component_inspiration',
          section: action.section,
          query: action.searchQuery,
          status: 'running',
        }
        calls.push(call)
        emit()
        try {
          const found = await session.inspire(action.section, action.searchQuery, action.message)
          if (found.length) {
            refs.push(...found)
            const top = found[0]
            call.status = 'done'
            call.resultCount = found.length
            call.componentName = top.componentName
            call.similarity = top.similarity
            call.codePreview = (top.demoCode || top.code).slice(0, 1400)
          } else {
            call.status = 'done'
            call.resultCount = 0
          }
        } catch {
          call.status = 'error'
        }
        emit()
        return call
      }

      // ---- ReAct loop --------------------------------------------------------
      const coveredSections = () => new Set(refs.map((r) => r.section.toLowerCase()))
      for (let round = 0; round < MAX_ROUNDS; round++) {
        if (signal?.aborted) break
        let reply: string
        try {
          reply = await relayChat(transcript)
        } catch {
          break
        }
        const action = parseAction(reply)
        transcript.push({ role: 'assistant', content: reply })
        if (!action || 'done' in action) break

        if (action.tool === 'logo_search') {
          const call: McpToolCall = {
            id: ++callId,
            round: calls.length + 1,
            tool: 'logo_search',
            query: action.queries.join(', '),
            status: 'running',
          }
          calls.push(call)
          emit()
          try {
            const found = await session.logos(action.queries)
            icons = found
            usedLogoSearch = true
            call.status = 'done'
            call.resultCount = found.length
          } catch {
            call.status = 'error'
          }
          emit()
          transcript.push({
            role: 'user',
            content: `logo_search returned ${call.resultCount ?? 0} icon(s). Continue with the next section or reply {"done":true}.`,
          })
          continue
        }

        const call = await runInspire(action)
        transcript.push({
          role: 'user',
          content:
            call.status === 'done' && call.resultCount
              ? `component_inspiration for "${action.section}" returned "${call.componentName}"${
                  typeof call.similarity === 'number'
                    ? ` (similarity ${call.similarity.toFixed(2)})`
                    : ''
                }. Real code captured. Covered sections: ${[...coveredSections()].join(', ')}. Pick the next uncovered key section, or reply {"done":true}.`
              : `component_inspiration for "${action.section}" returned no usable code. Try a different searchQuery or move on.`,
        })
      }

      // ---- Fallback: guarantee real components for the core sections ----------
      for (const section of REQUIRED_SECTIONS) {
        if (signal?.aborted) break
        if (coveredSections().has(section)) continue
        const queryBySection: Record<string, string> = {
          hero: 'hero section',
          features: 'feature grid cards',
          cta: 'cta banner section',
        }
        await runInspire({
          section,
          searchQuery: queryBySection[section] || `${section} section`,
          message: `Find a high-quality ${section} component for ${ctx.industry || ctx.name}`,
        })
      }

      // ---- Fallback: surface a brand/trust icon strip if none was searched ----
      if (!usedLogoSearch && !signal?.aborted) {
        const queries = [ctx.industry, ctx.name].filter((q): q is string => Boolean(q))
        if (queries.length) {
          const call: McpToolCall = {
            id: ++callId,
            round: calls.length + 1,
            tool: 'logo_search',
            query: queries.join(', '),
            status: 'running',
          }
          calls.push(call)
          emit()
          try {
            icons = await session.logos(queries)
            call.status = 'done'
            call.resultCount = icons.length
          } catch {
            call.status = 'error'
          }
          emit()
        }
      }

      return { toolNames: session.toolNames, refs, icons, calls }
    })
  } catch {
    return empty
  }
}

/** Compact, real-code design reference injected into the spec-writing prompt. */
export function componentRefsForPrompt(refs: ComponentRef[]): string {
  if (!refs.length) return ''
  const blocks = refs.slice(0, 6).map((r) => {
    const code = (r.demoCode || r.code).slice(0, 1800)
    return `### ${r.section} — ${r.componentName}${
      typeof r.similarity === 'number' ? ` (match ${r.similarity.toFixed(2)})` : ''
    }\n\`\`\`tsx\n${code}\n\`\`\``
  })
  return [
    'REAL component code pulled live from 21st.dev via MCP for this site. Mirror the structure, layout density, spacing rhythm, sub-element composition and copy patterns of these proven components when you design each section (translate their intent into the SiteSpec schema — do NOT copy import paths or invent new section kinds):',
    '',
    ...blocks,
  ].join('\n')
}
