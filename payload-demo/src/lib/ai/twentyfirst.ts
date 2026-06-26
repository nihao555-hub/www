/**
 * Integration with 21st.dev's free agent features:
 *   1. Semantic component search (`/api/fetch-ui`) — finds real, high-quality
 *      React + Tailwind + shadcn component examples that match a design intent.
 *   2. SVG icon search (`/api/logo-search`) — finds brand / category icons.
 *
 * We use these during generation as *design inspiration*: the component patterns
 * are summarized into the AI's design prompt (so the structure & copy aim at the
 * same quality bar as v0/Lovable), and the matched icons are surfaced in the
 * live generation log as proof the catalog was consulted.
 */

const MAGIC_BASE_URL = process.env.TWENTY_FIRST_BASE_URL || 'https://magic.21st.dev'

export function getTwentyFirstKey(): string | undefined {
  return process.env.TWENTY_FIRST_API_KEY || undefined
}

export function isTwentyFirstConfigured(): boolean {
  return Boolean(getTwentyFirstKey())
}

export type ComponentInspiration = {
  name: string
  /** short description / why it matched */
  summary: string
}

export type IconResult = {
  title: string
  /** absolute URL to the SVG (light variant) */
  svgUrl: string
}

type FetchUiComponent = {
  componentName?: string
  name?: string
  demoName?: string
  description?: string
}

/**
 * Semantic component search. Returns a small list of matched component names so
 * the AI knows which proven UI patterns exist for the requested section.
 */
export async function searchComponents(
  query: string,
  signal?: AbortSignal,
): Promise<ComponentInspiration[]> {
  const apiKey = getTwentyFirstKey()
  if (!apiKey) return []

  try {
    const res = await fetch(`${MAGIC_BASE_URL}/api/fetch-ui`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({
        message: `Find UI components for: ${query}`,
        searchQuery: query,
      }),
      signal,
    })
    if (!res.ok) return []

    const data = (await res.json()) as { text?: string } | FetchUiComponent[]

    // The endpoint returns { text: "<json string>" }; parse defensively.
    let items: FetchUiComponent[] = []
    if (Array.isArray(data)) {
      items = data
    } else if (data && typeof data.text === 'string') {
      try {
        const parsed = JSON.parse(data.text) as unknown
        if (Array.isArray(parsed)) items = parsed as FetchUiComponent[]
        else if (parsed && typeof parsed === 'object') {
          const maybe = (parsed as { components?: FetchUiComponent[] }).components
          if (Array.isArray(maybe)) items = maybe
        }
      } catch {
        // Non-JSON text response: fall back to using the raw text as a single hint.
        return [{ name: query, summary: data.text.slice(0, 160) }]
      }
    }

    return items
      .slice(0, 4)
      .map((c) => ({
        name: c.componentName || c.name || c.demoName || query,
        summary: (c.description || '').slice(0, 160),
      }))
  } catch {
    return []
  }
}

type LogoSearchIcon = {
  icon?: string
  name?: string
  code?: string
}

/**
 * Brand / category icon search powered by 21st.dev's `/api/logo-search`
 * (svgl catalog under the hood). Returns inline SVG, which we expose as a
 * data URL so it can be rendered with a plain <img> tag.
 */
export async function searchIcons(query: string, signal?: AbortSignal): Promise<IconResult[]> {
  const apiKey = getTwentyFirstKey()
  if (!apiKey) return []

  try {
    const res = await fetch(`${MAGIC_BASE_URL}/api/logo-search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({ queries: [query], format: 'SVG' }),
      signal,
    })
    if (!res.ok) return []

    const data = (await res.json()) as { icons?: LogoSearchIcon[] }
    const icons = Array.isArray(data.icons) ? data.icons : []

    return icons
      .slice(0, 6)
      .map((d) => {
        const svg = d.code || ''
        const svgUrl = svg ? `data:image/svg+xml;utf8,${encodeURIComponent(svg)}` : ''
        return { title: d.icon || d.name || query, svgUrl }
      })
      .filter((i) => i.svgUrl)
  } catch {
    return []
  }
}
