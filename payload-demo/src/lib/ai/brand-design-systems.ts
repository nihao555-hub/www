/**
 * Brand design-system reference library — distilled from VoltAgent/awesome-design-md
 * (MIT). The creative agent picks ONE real brand whose design language best fits
 * the brief, then "reads" that brand's DESIGN.md (tokens: colors, typography,
 * spacing, radius, components) and designs the site in that language.
 *
 * The picker index is lightweight (id + one-line summary). The full DESIGN.md is
 * only injected for the single chosen brand, to keep prompts bounded.
 */
import { BRAND_DESIGN_SYSTEMS, type BrandDesignSystem } from './brand-design-md.generated'

export { BRAND_DESIGN_SYSTEMS, type BrandDesignSystem }

export function getBrandDesignSystem(id?: string | null): BrandDesignSystem | undefined {
  if (!id) return undefined
  const want = id.toLowerCase()
  return (
    BRAND_DESIGN_SYSTEMS.find((b) => b.id.toLowerCase() === want) ||
    BRAND_DESIGN_SYSTEMS.find((b) => b.name.toLowerCase() === want)
  )
}

/** Compact catalogue for the picker prompt: `- id — Name: one-line summary`. */
export function brandDesignSystemsCatalog(): string {
  return BRAND_DESIGN_SYSTEMS.map((b) => `- ${b.id} — ${b.name}: ${b.summary}`).join('\n')
}

/** Parse the agent's chosen brand id out of its analysis output. */
export function pickBrandDesignSystemFromAnalysis(analysis: string): string | undefined {
  const match = analysis.match(/BRAND:\s*([a-zA-Z0-9_.-]+)/i)
  const id = match?.[1]?.toLowerCase()
  if (id && BRAND_DESIGN_SYSTEMS.some((b) => b.id.toLowerCase() === id)) return id
  for (const b of BRAND_DESIGN_SYSTEMS) {
    if (analysis.toLowerCase().includes(`brand: ${b.id.toLowerCase()}`)) return b.id
  }
  return undefined
}

/** The full DESIGN.md cue block injected once a brand is chosen. */
export function brandDesignMdCues(brand: BrandDesignSystem | undefined): string {
  if (!brand) return ''
  return [
    `Reference brand design system: ${brand.name} (do NOT copy its logo, name, or copy — adopt only its DESIGN LANGUAGE: color logic, type scale/weights, spacing, radius, component feel).`,
    `Here is its DESIGN.md — follow these tokens faithfully:`,
    '```yaml',
    brand.md,
    '```',
  ].join('\n')
}
