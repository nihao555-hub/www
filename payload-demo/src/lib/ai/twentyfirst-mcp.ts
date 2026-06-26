/**
 * 21st.dev Magic MCP integration (the real Model Context Protocol, not the REST
 * wrapper in `twentyfirst.ts`).
 *
 * We spawn the `@21st-dev/magic` server as a child process over stdio and talk
 * to it with the official MCP SDK client. The design agent then does multiple
 * rounds of tool calls (`21st_magic_component_inspiration`, `logo_search`) and
 * we pull the REAL component source code (`componentCode` / `demoCode`) out of
 * the responses to drive a much higher-fidelity site generation.
 *
 * Both the MCP SDK and the Magic server rely on Node built-ins / dynamic
 * requires and spawn a subprocess, so they are kept out of the webpack bundle
 * via `serverExternalPackages` in `next.config.ts`.
 */

import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

import type { Client } from '@modelcontextprotocol/sdk/client/index.js'

import { getTwentyFirstKey, isTwentyFirstConfigured, type IconResult } from './twentyfirst'

export const COMPONENT_INSPIRATION_TOOL = '21st_magic_component_inspiration'
export const LOGO_SEARCH_TOOL = 'logo_search'

/** A real component pulled from 21st.dev via MCP for a given site section. */
export type ComponentRef = {
  /** which site section this inspired (hero / features / cta / …) */
  section: string
  componentName: string
  demoName?: string
  /** real component source (truncated for safe persistence / prompting) */
  code: string
  /** real demo/usage source (truncated) */
  demoCode?: string
  /** match score reported by 21st.dev (0..1) */
  similarity?: number
}

export function isMcpConfigured(): boolean {
  return isTwentyFirstConfigured()
}

/** Hard cap on persisted/prompted component source to keep payloads sane. */
const MAX_CODE_CHARS = 6000

function truncate(code: string, max = MAX_CODE_CHARS): string {
  if (code.length <= max) return code
  return `${code.slice(0, max)}\n/* …truncated (${code.length - max} more chars) … */`
}

type RawComponent = {
  demoName?: string
  demoCode?: string
  componentName?: string
  componentCode?: string
  similarity?: number
}

function readToolText(result: unknown): string {
  const content = (result as { content?: Array<{ type?: string; text?: string }> })?.content
  if (!Array.isArray(content)) return ''
  return content
    .map((c) => (typeof c?.text === 'string' ? c.text : ''))
    .filter(Boolean)
    .join('\n')
}

const MAGIC_SERVER_SUBPATH = '@21st-dev/magic/dist/index.js'

/**
 * Resolves the on-disk path to the Magic MCP server entry. Under Turbopack/
 * webpack, `require.resolve` is rewritten to a bundler-virtual path (e.g.
 * `.../[project]/...[app-route] (ecmascript)`) which is NOT a real file, so
 * spawning `node <that path>` fails with "Connection closed". We therefore
 * resolve against the real filesystem first and only fall back to
 * `require.resolve` when nothing is found on disk.
 */
function resolveMagicServerPath(): string {
  const candidates = [
    join(process.cwd(), 'node_modules', '@21st-dev', 'magic', 'dist', 'index.js'),
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  return createRequire(import.meta.url).resolve(MAGIC_SERVER_SUBPATH)
}

/** Connect to a freshly spawned Magic MCP server over stdio. */
async function connect(): Promise<{ client: Client; close: () => Promise<void> }> {
  const apiKey = getTwentyFirstKey()
  if (!apiKey) throw new Error('21st.dev API key not configured')

  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js')
  const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js')

  const serverPath = resolveMagicServerPath()

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
    env: {
      ...(process.env as Record<string, string>),
      API_KEY: apiKey,
      TWENTY_FIRST_API_KEY: apiKey,
    },
    stderr: 'ignore',
  })

  const client = new Client({ name: 'payload-ai-site-generator', version: '1.0.0' }, { capabilities: {} })
  await client.connect(transport)

  return {
    client,
    close: async () => {
      try {
        await client.close()
      } catch {
        // best-effort
      }
    },
  }
}

/** A live MCP session that exposes the two tools the design agent uses. */
export type McpSession = {
  /** tool names advertised by the server (proof we're really on MCP) */
  toolNames: string[]
  /** multi-round component search; returns the top real component for a section */
  inspire: (section: string, searchQuery: string, message: string) => Promise<ComponentRef[]>
  /** brand/category icon (SVG) search */
  logos: (queries: string[]) => Promise<IconResult[]>
  close: () => Promise<void>
}

/**
 * Opens an MCP session, lists tools, and returns typed helpers. The caller is
 * responsible for `close()`ing it (use `withMcpSession` for automatic cleanup).
 */
export async function openMcpSession(): Promise<McpSession> {
  const { client, close } = await connect()

  let toolNames: string[] = []
  try {
    const listed = await client.listTools()
    toolNames = listed.tools.map((t) => t.name)
  } catch {
    toolNames = []
  }

  const inspire = async (
    section: string,
    searchQuery: string,
    message: string,
  ): Promise<ComponentRef[]> => {
    const result = await client.callTool({
      name: COMPONENT_INSPIRATION_TOOL,
      arguments: { message, searchQuery },
    })
    const text = readToolText(result)
    if (!text) return []
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      return []
    }
    const items: RawComponent[] = Array.isArray(parsed)
      ? (parsed as RawComponent[])
      : Array.isArray((parsed as { components?: RawComponent[] })?.components)
        ? ((parsed as { components: RawComponent[] }).components)
        : []

    return items
      .filter((c) => c.componentCode || c.demoCode)
      .slice(0, 2)
      .map((c) => ({
        section,
        componentName: c.componentName || c.demoName || searchQuery,
        demoName: c.demoName,
        code: truncate(c.componentCode || c.demoCode || ''),
        demoCode: c.demoCode ? truncate(c.demoCode, 2500) : undefined,
        similarity: typeof c.similarity === 'number' ? c.similarity : undefined,
      }))
  }

  const logos = async (queries: string[]): Promise<IconResult[]> => {
    const clean = queries.map((q) => q.trim()).filter(Boolean).slice(0, 8)
    if (!clean.length) return []
    const result = await client.callTool({
      name: LOGO_SEARCH_TOOL,
      arguments: { queries: clean, format: 'SVG' },
    })
    const text = readToolText(result)
    if (!text) return []
    let parsed: { icons?: Array<{ icon?: string; code?: string }> }
    try {
      parsed = JSON.parse(text)
    } catch {
      return []
    }
    const icons = Array.isArray(parsed.icons) ? parsed.icons : []
    return icons
      .map((d) => {
        const svg = (d.code || '').trim()
        const svgUrl = svg.startsWith('<svg')
          ? `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
          : ''
        return { title: (d.icon || '').replace(/Icon$/, '') || 'icon', svgUrl }
      })
      .filter((i) => i.svgUrl)
      .slice(0, 6)
  }

  return { toolNames, inspire, logos, close }
}

/** Runs `fn` against a fresh MCP session and always closes it afterwards. */
export async function withMcpSession<T>(fn: (session: McpSession) => Promise<T>): Promise<T> {
  const session = await openMcpSession()
  try {
    return await fn(session)
  } finally {
    await session.close()
  }
}
