/**
 * The "site spec" is the structured, multi-page design the AI returns. It is
 * intentionally decoupled from Payload's internal data shapes: the model thinks
 * in terms of pages, a hero, and a list of rich content sections. The spec is
 * persisted as JSON on an `ai-sites` document and rendered by a self-contained
 * themed renderer (see `src/components/AiSite`).
 */

export type SpecCta = {
  label: string
  url: string
}

export type SpecHero = {
  headline: string
  subheadline?: string
  /** small trust badges, e.g. "ISO 9001", "20+ years", shown under the headline */
  badges?: string[]
  ctas?: SpecCta[]
  /** index into the uploaded images array, used as the hero background image */
  imageIndex?: number
}

export type SpecFeature = {
  /** icon keyword from the curated catalog (see icons.ts) */
  icon?: string
  title: string
  body: string
}

export type SpecStat = {
  value: string
  label: string
}

export type SpecStep = {
  title: string
  body: string
}

export type SpecFaq = {
  q: string
  a: string
}

export type SpecSection =
  | { kind: 'features'; title?: string; subtitle?: string; items: SpecFeature[] }
  | { kind: 'stats'; title?: string; items: SpecStat[] }
  | {
      kind: 'showcase'
      title?: string
      body?: string
      imageIndex: number
      bullets?: string[]
      cta?: SpecCta
      layout?: 'imageLeft' | 'imageRight'
    }
  | { kind: 'gallery'; title?: string; subtitle?: string; imageIndexes: number[] }
  | { kind: 'steps'; title?: string; subtitle?: string; items: SpecStep[] }
  | { kind: 'faq'; title?: string; items: SpecFaq[] }
  | { kind: 'richtext'; title?: string; paragraphs: string[] }
  | { kind: 'cta'; heading: string; body?: string; cta: SpecCta }
  | {
      kind: 'contact'
      title?: string
      body?: string
      email?: string
      phone?: string
      address?: string
      hours?: string
    }

export type SpecPage = {
  /** url path under the site; '' is the home page */
  path: string
  /** label shown in the top navigation */
  navLabel: string
  hero?: SpecHero
  sections: SpecSection[]
  meta: {
    title: string
    description: string
  }
}

export type BrandIcon = {
  title: string
  svgUrl: string
}

/** A real component pulled from 21st.dev via MCP, kept for transparency/debug. */
export type SpecComponentRef = {
  section: string
  componentName: string
  similarity?: number
  /** truncated real source code returned by the MCP server */
  code: string
}

export type SiteSpec = {
  siteName: string
  slug: string
  /** short brand tagline shown in the header/footer */
  tagline?: string
  /** id of a preset from the theme catalog, chosen by the AI for this brand */
  themeId: string
  /** short reason the AI picked this theme (shown in the generation log) */
  themeReason?: string
  pages: SpecPage[]
  /** brand/category icons fetched from 21st.dev, surfaced as a trust strip */
  brandIcons?: BrandIcon[]
  /** real component code pulled from 21st.dev via MCP that informed the design */
  componentRefs?: SpecComponentRef[]
  meta: {
    title: string
    description: string
  }
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value : fallback
}

function asStringArray(value: unknown, max = 8): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((v) => asString(v))
    .filter(Boolean)
    .slice(0, max)
}

function asIndex(value: unknown): number {
  return typeof value === 'number' && value >= 0 && Number.isFinite(value) ? Math.floor(value) : 0
}

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'site'
  )
}

function normalizeCta(value: unknown): SpecCta | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  const label = asString(v.label)
  if (!label) return null
  return { label, url: asString(v.url, '#') || '#' }
}

function normalizeHero(value: unknown, fallbackHeadline: string): SpecHero {
  const h = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
  const ctas = Array.isArray(h.ctas)
    ? (h.ctas.map(normalizeCta).filter(Boolean) as SpecCta[]).slice(0, 2)
    : []
  return {
    headline: asString(h.headline, fallbackHeadline) || fallbackHeadline,
    subheadline: asString(h.subheadline) || undefined,
    badges: asStringArray(h.badges, 4),
    ctas,
    imageIndex: asIndex(h.imageIndex),
  }
}

function normalizeSection(value: unknown): SpecSection | null {
  if (!value || typeof value !== 'object') return null
  const s = value as Record<string, unknown>
  const kind = asString(s.kind)
  const title = asString(s.title) || undefined
  const subtitle = asString(s.subtitle) || undefined

  switch (kind) {
    case 'features': {
      const items: SpecFeature[] = (Array.isArray(s.items) ? s.items : [])
        .map((it) => {
          if (!it || typeof it !== 'object') return null
          const f = it as Record<string, unknown>
          const fTitle = asString(f.title)
          const body = asString(f.body)
          if (!fTitle && !body) return null
          return { icon: asString(f.icon) || undefined, title: fTitle || body, body }
        })
        .filter(Boolean)
        .slice(0, 8) as SpecFeature[]
      return items.length ? { kind: 'features', title, subtitle, items } : null
    }
    case 'stats': {
      const items: SpecStat[] = (Array.isArray(s.items) ? s.items : [])
        .map((it) => {
          if (!it || typeof it !== 'object') return null
          const st = it as Record<string, unknown>
          const v = asString(st.value)
          const label = asString(st.label)
          if (!v || !label) return null
          return { value: v, label }
        })
        .filter(Boolean)
        .slice(0, 4) as SpecStat[]
      return items.length ? { kind: 'stats', title, items } : null
    }
    case 'showcase': {
      return {
        kind: 'showcase',
        title,
        body: asString(s.body) || undefined,
        imageIndex: asIndex(s.imageIndex),
        bullets: asStringArray(s.bullets, 6),
        cta: normalizeCta(s.cta) || undefined,
        layout: s.layout === 'imageRight' ? 'imageRight' : 'imageLeft',
      }
    }
    case 'gallery': {
      const idxs = Array.isArray(s.imageIndexes)
        ? s.imageIndexes.map(asIndex).slice(0, 9)
        : []
      return idxs.length ? { kind: 'gallery', title, subtitle, imageIndexes: idxs } : null
    }
    case 'steps': {
      const items: SpecStep[] = (Array.isArray(s.items) ? s.items : [])
        .map((it) => {
          if (!it || typeof it !== 'object') return null
          const sp = it as Record<string, unknown>
          const t = asString(sp.title)
          const body = asString(sp.body)
          if (!t && !body) return null
          return { title: t || body, body }
        })
        .filter(Boolean)
        .slice(0, 6) as SpecStep[]
      return items.length ? { kind: 'steps', title, subtitle, items } : null
    }
    case 'faq': {
      const items: SpecFaq[] = (Array.isArray(s.items) ? s.items : [])
        .map((it) => {
          if (!it || typeof it !== 'object') return null
          const fq = it as Record<string, unknown>
          const q = asString(fq.q)
          const a = asString(fq.a)
          if (!q || !a) return null
          return { q, a }
        })
        .filter(Boolean)
        .slice(0, 8) as SpecFaq[]
      return items.length ? { kind: 'faq', title, items } : null
    }
    case 'richtext': {
      const paragraphs = asStringArray(s.paragraphs, 6)
      return paragraphs.length ? { kind: 'richtext', title, paragraphs } : null
    }
    case 'cta': {
      const cta = normalizeCta(s.cta)
      const heading = asString(s.heading)
      if (cta && heading) return { kind: 'cta', heading, body: asString(s.body) || undefined, cta }
      return null
    }
    case 'contact': {
      return {
        kind: 'contact',
        title,
        body: asString(s.body) || undefined,
        email: asString(s.email) || undefined,
        phone: asString(s.phone) || undefined,
        address: asString(s.address) || undefined,
        hours: asString(s.hours) || undefined,
      }
    }
    default:
      return null
  }
}

function normalizePage(value: unknown, index: number, siteName: string): SpecPage | null {
  if (!value || typeof value !== 'object') return null
  const p = value as Record<string, unknown>
  const sections = (Array.isArray(p.sections) ? p.sections : [])
    .map(normalizeSection)
    .filter(Boolean) as SpecSection[]

  const rawPath = asString(p.path)
  const path = index === 0 ? '' : slugify(rawPath || `page-${index}`)
  const navLabel = asString(p.navLabel) || asString(p.path) || (index === 0 ? 'Home' : `Page ${index}`)

  const heroProvided = p.hero && typeof p.hero === 'object'
  const hero = heroProvided || index === 0 ? normalizeHero(p.hero, navLabel) : undefined

  const metaRaw = (p.meta && typeof p.meta === 'object' ? p.meta : {}) as Record<string, unknown>
  const meta = {
    title: asString(metaRaw.title, `${navLabel} · ${siteName}`) || `${navLabel} · ${siteName}`,
    description: asString(metaRaw.description, hero?.subheadline || siteName) || siteName,
  }

  if (!sections.length && !hero) return null
  return { path, navLabel, hero, sections, meta }
}

/**
 * Validates and normalizes raw JSON from the model into a safe multi-page
 * SiteSpec. Tolerates both the new `pages` shape and a legacy single-page shape
 * (`hero` + `sections`), and guarantees at least one home page exists.
 */
export function normalizeSiteSpec(
  raw: unknown,
  fallbackName: string,
  validThemeIds: string[] = [],
  fallbackThemeId = 'electric-indigo',
): SiteSpec {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>

  const siteName = asString(obj.siteName, fallbackName) || fallbackName
  const slugBase = asString(obj.slug) || siteName
  const slug = `${slugify(slugBase)}-${Date.now().toString(36)}`

  const requestedTheme = asString(obj.themeId)
  const themeId =
    requestedTheme && (validThemeIds.length === 0 || validThemeIds.includes(requestedTheme))
      ? requestedTheme
      : fallbackThemeId

  // Build pages: prefer the new `pages` array, else wrap legacy single-page.
  let pages: SpecPage[] = []
  if (Array.isArray(obj.pages) && obj.pages.length) {
    pages = obj.pages
      .map((p, i) => normalizePage(p, i, siteName))
      .filter(Boolean) as SpecPage[]
  }
  if (!pages.length) {
    const legacy = normalizePage(
      { path: '', navLabel: 'Home', hero: obj.hero, sections: obj.sections, meta: obj.meta },
      0,
      siteName,
    )
    if (legacy) pages = [legacy]
  }

  // Guarantee a usable home page.
  if (!pages.length) {
    pages = [
      {
        path: '',
        navLabel: 'Home',
        hero: normalizeHero(undefined, siteName),
        sections: [],
        meta: { title: siteName, description: siteName },
      },
    ]
  }
  // Force first page to be the home page and ensure it has a hero.
  pages[0].path = ''
  if (!pages[0].hero) pages[0].hero = normalizeHero(undefined, siteName)

  // Deduplicate paths/labels for safe routing & nav.
  const seenPaths = new Set<string>()
  for (let i = 0; i < pages.length; i++) {
    let path = pages[i].path
    if (i === 0) path = ''
    if (path && seenPaths.has(path)) path = `${path}-${i}`
    seenPaths.add(path)
    pages[i].path = path
  }

  const metaRaw = (obj.meta && typeof obj.meta === 'object' ? obj.meta : {}) as Record<
    string,
    unknown
  >

  return {
    siteName,
    slug,
    tagline: asString(obj.tagline) || undefined,
    themeId,
    themeReason: asString(obj.themeReason) || undefined,
    pages,
    meta: {
      title: asString(metaRaw.title, siteName) || siteName,
      description:
        asString(metaRaw.description) || pages[0].hero?.subheadline || siteName,
    },
  }
}
