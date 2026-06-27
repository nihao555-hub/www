import { openMcpSession } from '@/lib/ai/twentyfirst-mcp'
import { isTwentyFirstConfigured } from '@/lib/ai/twentyfirst'

export const maxDuration = 120

export async function GET(): Promise<Response> {
  const diag: Record<string, unknown> = {
    keyConfigured: isTwentyFirstConfigured(),
    cwd: process.cwd(),
    execPath: process.execPath,
  }
  try {
    const session = await openMcpSession()
    diag.toolNames = session.toolNames
    try {
      const refs = await session.inspire('hero', 'split hero grid', 'Find a modern split hero')
      diag.inspireCount = refs.length
      diag.inspireNames = refs.map((r) => r.componentName)
    } catch (e) {
      diag.inspireError = e instanceof Error ? `${e.name}: ${e.message}` : String(e)
      diag.inspireStack = e instanceof Error ? e.stack : undefined
    }
    await session.close()
  } catch (e) {
    diag.connectError = e instanceof Error ? `${e.name}: ${e.message}` : String(e)
    diag.connectStack = e instanceof Error ? e.stack : undefined
  }
  return Response.json(diag)
}
