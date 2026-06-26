/**
 * The "site spec" is the structured design the AI returns. It is intentionally
 * decoupled from Payload's internal data shapes: the model only needs to think
 * in terms of a hero + a list of content sections, and `specToPageData` maps
 * that onto Payload's block-based Pages collection.
 */

export type HeroImpact = 'highImpact' | 'mediumImpact' | 'lowImpact'

export type SpecCta = {
  label: string
  url: string
}

export type SpecHero = {
  impact: HeroImpact
  headline: string
  subheadline?: string
  ctas?: SpecCta[]
  /** index into the uploaded images array, used as the hero background image */
  imageIndex?: number
}

export type SpecContentColumn = {
  size: 'oneThird' | 'half' | 'twoThirds' | 'full'
  heading?: string
  body: string
}

export type SpecSection =
  | { kind: 'content'; columns: SpecContentColumn[] }
  | { kind: 'media'; imageIndex: number; caption?: string }
  | { kind: 'cta'; heading: string; body?: string; cta: SpecCta }

export type SiteSpec = {
  siteName: string
  slug: string
  /** id of a preset from the theme catalog, chosen by the AI for this brand */
  themeId: string
  /** short reason the AI picked this theme (shown in the generation log) */
  themeReason?: string
  hero: SpecHero
  sections: SpecSection[]
  meta: {
    title: string
    description: string
  }
}

const HERO_IMPACTS: HeroImpact[] = ['highImpact', 'mediumImpact', 'lowImpact']
const COLUMN_SIZES: SpecContentColumn['size'][] = ['oneThird', 'half', 'twoThirds', 'full']

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value : fallback
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

/**
 * Validates and normalizes raw JSON from the model into a safe SiteSpec.
 * Unknown/malformed pieces are dropped rather than throwing, so a slightly
 * imperfect model response still produces a usable page.
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

  const heroRaw = (obj.hero && typeof obj.hero === 'object' ? obj.hero : {}) as Record<
    string,
    unknown
  >
  const heroImpact = HERO_IMPACTS.includes(heroRaw.impact as HeroImpact)
    ? (heroRaw.impact as HeroImpact)
    : 'highImpact'
  const heroCtas = Array.isArray(heroRaw.ctas)
    ? (heroRaw.ctas.map(normalizeCta).filter(Boolean) as SpecCta[])
    : []
  const hero: SpecHero = {
    impact: heroImpact,
    headline: asString(heroRaw.headline, siteName) || siteName,
    subheadline: asString(heroRaw.subheadline) || undefined,
    ctas: heroCtas.slice(0, 2),
    imageIndex:
      typeof heroRaw.imageIndex === 'number' && heroRaw.imageIndex >= 0
        ? heroRaw.imageIndex
        : 0,
  }

  const sectionsRaw = Array.isArray(obj.sections) ? obj.sections : []
  const sections: SpecSection[] = []
  for (const s of sectionsRaw) {
    if (!s || typeof s !== 'object') continue
    const sec = s as Record<string, unknown>
    const kind = asString(sec.kind)

    if (kind === 'content') {
      const columnsRaw = Array.isArray(sec.columns) ? sec.columns : []
      const columns: SpecContentColumn[] = []
      for (const c of columnsRaw) {
        if (!c || typeof c !== 'object') continue
        const col = c as Record<string, unknown>
        const body = asString(col.body)
        if (!body && !asString(col.heading)) continue
        columns.push({
          size: COLUMN_SIZES.includes(col.size as SpecContentColumn['size'])
            ? (col.size as SpecContentColumn['size'])
            : 'full',
          heading: asString(col.heading) || undefined,
          body,
        })
      }
      if (columns.length) sections.push({ kind: 'content', columns })
    } else if (kind === 'media') {
      const imageIndex = typeof sec.imageIndex === 'number' ? sec.imageIndex : 0
      sections.push({
        kind: 'media',
        imageIndex: imageIndex >= 0 ? imageIndex : 0,
        caption: asString(sec.caption) || undefined,
      })
    } else if (kind === 'cta') {
      const cta = normalizeCta(sec.cta)
      const heading = asString(sec.heading)
      if (cta && heading) {
        sections.push({ kind: 'cta', heading, body: asString(sec.body) || undefined, cta })
      }
    }
  }

  return {
    siteName,
    slug,
    themeId,
    themeReason: asString(obj.themeReason) || undefined,
    hero,
    sections,
    meta: {
      title: asString((obj.meta as Record<string, unknown>)?.title, siteName) || siteName,
      description:
        asString((obj.meta as Record<string, unknown>)?.description) ||
        hero.subheadline ||
        siteName,
    },
  }
}
