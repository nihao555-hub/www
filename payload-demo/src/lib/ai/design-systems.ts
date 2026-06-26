/**
 * Design families ("layout DNA").
 *
 * A theme controls *color/typography tokens* and a template controls *which
 * pages/sections* exist — but on their own they still render every site with
 * the exact same structural layout (same hero composition, same feature cards,
 * same spacing). That is the "千站一面" (one-look-for-all) problem.
 *
 * A design family adds the missing axis: the *visual layout DNA*. Each family
 * is distilled from a well-known open-source landing/template style (SaaS,
 * enterprise B2B, editorial luxury, vibrant commerce, brutalist agency, clean
 * minimal) and parametrises how the renderer composes the hero, feature cards,
 * stats, cards, buttons, spacing and decoration. The AI picks one family per
 * site, so two sites with the same theme + template can still look completely
 * different.
 */

export type HeroVariant =
  | 'overlay' // full-bleed image with dark overlay + left-aligned copy (classic)
  | 'split' // copy on one side, framed image card on the other
  | 'centered' // centered copy over a soft gradient, image as a panel below
  | 'editorial' // huge serif headline, minimal chrome, image as a wide band
  | 'card' // copy in a floating glass card offset over the image

export type FeatureVariant =
  | 'iconTopCard' // icon chip on top of a card, 3-up grid
  | 'iconLeft' // icon to the left of title/body, 2-up rows
  | 'numbered' // big numbers instead of icons
  | 'bordered' // flat, divider-separated, no card fill
  | 'minimalList' // single column, large type, hairline separators

export type StatVariant =
  | 'cards' // each stat in its own card
  | 'inline' // a single row of numbers separated by dividers
  | 'band' // full-width colored band with large numbers

export type CardStyle = 'soft' | 'outline' | 'flat' | 'elevated'
export type ButtonShape = 'pill' | 'rounded' | 'square'
export type Decoration = 'none' | 'blobs' | 'grid' | 'dots'
export type Container = 'narrow' | 'standard' | 'wide'
export type HeaderStyle = 'classic' | 'centered' | 'split'
export type SectionSpacing = 'tight' | 'normal' | 'roomy'

export type DesignFamily = {
  id: string
  name: string
  /** short "when to use" line fed to the model so it can choose a fit */
  description: string
  /** theme ids that pair especially well (hints, not enforced) */
  recommendedThemes: string[]
  hero: HeroVariant
  feature: FeatureVariant
  stat: StatVariant
  cardStyle: CardStyle
  button: ButtonShape
  decoration: Decoration
  container: Container
  header: HeaderStyle
  spacing: SectionSpacing
  /** render section/hero headings in uppercase with wide tracking */
  uppercaseHeadings: boolean
}

export const DESIGNS: DesignFamily[] = [
  {
    id: 'aurora-saas',
    name: 'Aurora SaaS',
    description:
      'Modern SaaS / AI product landing: centered hero over soft aurora gradients, airy spacing, big-icon feature cards. Energetic and friendly.',
    recommendedThemes: ['electric-indigo', 'midnight-aurora', 'ocean-breeze', 'cyber-night'],
    hero: 'centered',
    feature: 'iconTopCard',
    stat: 'inline',
    cardStyle: 'soft',
    button: 'pill',
    decoration: 'blobs',
    container: 'wide',
    header: 'centered',
    spacing: 'roomy',
    uppercaseHeadings: false,
  },
  {
    id: 'industrial-corporate',
    name: 'Industrial Corporate',
    description:
      'Enterprise B2B / manufacturer / exporter: split hero (copy + framed product image), structured numbered/bordered features, dependable and dense.',
    recommendedThemes: ['steel-industrial', 'corporate-navy', 'graphite-slate', 'emerald-trust'],
    hero: 'split',
    feature: 'numbered',
    stat: 'band',
    cardStyle: 'outline',
    button: 'square',
    decoration: 'grid',
    container: 'standard',
    header: 'split',
    spacing: 'normal',
    uppercaseHeadings: true,
  },
  {
    id: 'editorial-luxury',
    name: 'Editorial Luxury',
    description:
      'Premium fashion / jewelry / hospitality: editorial hero with oversized serif headline, generous whitespace, minimal list features, narrow column.',
    recommendedThemes: ['noir-luxe', 'champagne-serif', 'royal-plum', 'forest-deep', 'rose-quartz'],
    hero: 'editorial',
    feature: 'minimalList',
    stat: 'inline',
    cardStyle: 'flat',
    button: 'square',
    decoration: 'none',
    container: 'narrow',
    header: 'centered',
    spacing: 'roomy',
    uppercaseHeadings: true,
  },
  {
    id: 'commerce-vibrant',
    name: 'Commerce Vibrant',
    description:
      'Cross-border e-commerce / D2C consumer brand: hero with an offset floating glass card, gallery-forward, elevated cards, lively rounded buttons.',
    recommendedThemes: ['sunset-coral', 'magenta-pop', 'citrus-punch', 'honey-amber', 'rose-quartz'],
    hero: 'card',
    feature: 'iconTopCard',
    stat: 'cards',
    cardStyle: 'elevated',
    button: 'rounded',
    decoration: 'dots',
    container: 'wide',
    header: 'classic',
    spacing: 'normal',
    uppercaseHeadings: false,
  },
  {
    id: 'brutalist-bold',
    name: 'Brutalist Bold',
    description:
      'Creative agency / studio / portfolio: high-contrast brutalist layout, sharp corners, grid lines, flat bordered features, oversized uppercase type.',
    recommendedThemes: ['mono-brutalist', 'crimson-edge', 'paper-mono', 'citrus-punch'],
    hero: 'overlay',
    feature: 'bordered',
    stat: 'band',
    cardStyle: 'flat',
    button: 'square',
    decoration: 'grid',
    container: 'wide',
    header: 'split',
    spacing: 'tight',
    uppercaseHeadings: true,
  },
  {
    id: 'minimal-clean',
    name: 'Minimal Clean',
    description:
      'Clean professional services / clinics / SaaS docs: restrained overlay hero, icon-left feature rows, lots of whitespace, soft neutral cards.',
    recommendedThemes: ['nordic-minimal', 'arctic-frost', 'lavender-calm', 'teal-modern', 'sage-botanical'],
    hero: 'overlay',
    feature: 'iconLeft',
    stat: 'cards',
    cardStyle: 'soft',
    button: 'rounded',
    decoration: 'none',
    container: 'standard',
    header: 'classic',
    spacing: 'normal',
    uppercaseHeadings: false,
  },
]

export const DEFAULT_DESIGN_ID = 'minimal-clean'

export function getDesign(id?: string): DesignFamily {
  return DESIGNS.find((d) => d.id === id) || DESIGNS.find((d) => d.id === DEFAULT_DESIGN_ID)!
}

/** Catalog string injected into the analysis prompt so the model can choose. */
export function designCatalogForPrompt(): string {
  return DESIGNS.map(
    (d) =>
      `- ${d.id}: ${d.name} — ${d.description} (pairs well with themes: ${d.recommendedThemes.join(', ')})`,
  ).join('\n')
}

/** Parse the `DESIGN: <id>` line (or any mentioned id) from the analysis. */
export function pickDesignFromAnalysis(analysis: string): string | undefined {
  const match = analysis.match(/DESIGN:\s*([a-z0-9-]+)/i)
  const id = match?.[1]?.toLowerCase()
  if (id && DESIGNS.some((d) => d.id === id)) return id
  for (const d of DESIGNS) {
    if (analysis.toLowerCase().includes(d.id)) return d.id
  }
  return undefined
}
