import { openMcpSession } from '../src/lib/ai/twentyfirst-mcp'

async function main() {
  console.log('opening MCP session...')
  const session = await openMcpSession()
  console.log('toolNames:', session.toolNames)
  const refs = await session.inspire('hero', 'split hero grid', 'Find a modern split hero')
  console.log('inspire results:', refs.length, refs.map((r) => r.componentName))
  await session.close()
}

main().catch((e) => {
  console.error('FAILED:', e)
  process.exit(1)
})
