/**
 * Reusable site templates ("tech-stack template library").
 *
 * Instead of asking the model to invent a whole multi-page structure from
 * scratch every time, we ship a small library of proven page/section
 * blueprints (one per common business archetype). During generation the agent
 * picks the template that best fits the brand, and the spec writer starts from
 * that blueprint — the structure (which pages, which sections in what order) is
 * given, and the model only fills in real copy + image indexes on top of it.
 *
 * This keeps every site grounded in a battle-tested layout while still letting
 * the AI tailor theme, copy and imagery to the specific merchant.
 */

import type { SpecSection } from './site-spec'

/** The section kinds the renderer understands (mirrors SpecSection['kind']). */
export type SectionKind = SpecSection['kind']

export type TemplatePage = {
  /** url path under the site; '' is the home page */
  path: string
  navLabel: string
  /** whether a full hero (Home) or a compact banner hero is expected */
  hero: 'full' | 'compact' | 'none'
  /** ordered list of section kinds that make up this page */
  sections: SectionKind[]
}

export type SiteTemplate = {
  id: string
  name: string
  /** short "when to use" line fed to the model so it can choose a fit */
  description: string
  /** theme ids that pair well with this archetype (hints, not enforced) */
  recommendedThemes: string[]
  /** the page/section blueprint the spec writer starts from */
  pages: TemplatePage[]
}

export const TEMPLATES: SiteTemplate[] = [
  {
    id: 'b2b-manufacturer',
    name: 'B2B Manufacturer / Exporter',
    description:
      'Factories, industrial suppliers, OEM/ODM exporters selling to overseas buyers (steel, machinery, components, materials).',
    recommendedThemes: ['steel-industrial', 'corporate-navy', 'graphite-slate', 'emerald-trust'],
    pages: [
      {
        path: '',
        navLabel: 'Home',
        hero: 'full',
        sections: ['stats', 'features', 'showcase', 'steps', 'cta'],
      },
      {
        path: 'products',
        navLabel: 'Products',
        hero: 'compact',
        sections: ['gallery', 'features', 'showcase', 'faq'],
      },
      {
        path: 'about',
        navLabel: 'About',
        hero: 'compact',
        sections: ['richtext', 'stats', 'steps'],
      },
      {
        path: 'contact',
        navLabel: 'Contact',
        hero: 'compact',
        sections: ['contact', 'faq'],
      },
    ],
  },
  {
    id: 'modern-saas',
    name: 'Modern SaaS / Software Product',
    description:
      'Software, apps, AI tools and digital platforms with feature-led marketing and conversion CTAs.',
    recommendedThemes: ['electric-indigo', 'midnight-aurora', 'cyber-night', 'ocean-breeze'],
    pages: [
      {
        path: '',
        navLabel: 'Home',
        hero: 'full',
        sections: ['features', 'showcase', 'stats', 'steps', 'faq', 'cta'],
      },
      {
        path: 'features',
        navLabel: 'Features',
        hero: 'compact',
        sections: ['features', 'showcase', 'gallery'],
      },
      {
        path: 'about',
        navLabel: 'About',
        hero: 'compact',
        sections: ['richtext', 'stats'],
      },
      {
        path: 'contact',
        navLabel: 'Contact',
        hero: 'compact',
        sections: ['contact'],
      },
    ],
  },
  {
    id: 'ecommerce-brand',
    name: 'Consumer / D2C Product Brand',
    description:
      'Lifestyle, food, beauty, fashion and consumer goods brands that sell directly with a strong visual identity.',
    recommendedThemes: ['sunset-coral', 'rose-quartz', 'honey-amber', 'sage-botanical'],
    pages: [
      {
        path: '',
        navLabel: 'Home',
        hero: 'full',
        sections: ['gallery', 'features', 'showcase', 'stats', 'cta'],
      },
      {
        path: 'shop',
        navLabel: 'Shop',
        hero: 'compact',
        sections: ['gallery', 'showcase', 'features'],
      },
      {
        path: 'about',
        navLabel: 'Our Story',
        hero: 'compact',
        sections: ['richtext', 'steps', 'stats'],
      },
      {
        path: 'contact',
        navLabel: 'Contact',
        hero: 'compact',
        sections: ['contact', 'faq'],
      },
    ],
  },
  {
    id: 'agency-portfolio',
    name: 'Agency / Studio / Portfolio',
    description:
      'Creative agencies, design/dev studios and consultancies showcasing services and past work.',
    recommendedThemes: ['mono-brutalist', 'paper-mono', 'noir-luxe', 'teal-modern'],
    pages: [
      {
        path: '',
        navLabel: 'Home',
        hero: 'full',
        sections: ['features', 'gallery', 'stats', 'steps', 'cta'],
      },
      {
        path: 'work',
        navLabel: 'Work',
        hero: 'compact',
        sections: ['gallery', 'showcase'],
      },
      {
        path: 'services',
        navLabel: 'Services',
        hero: 'compact',
        sections: ['features', 'steps', 'faq'],
      },
      {
        path: 'contact',
        navLabel: 'Contact',
        hero: 'compact',
        sections: ['contact'],
      },
    ],
  },
  {
    id: 'local-service',
    name: 'Local Service / Professional Practice',
    description:
      'Clinics, law/accounting firms, contractors, restaurants and other local or appointment-based services.',
    recommendedThemes: ['arctic-frost', 'emerald-trust', 'lavender-calm', 'desert-sand'],
    pages: [
      {
        path: '',
        navLabel: 'Home',
        hero: 'full',
        sections: ['features', 'stats', 'steps', 'showcase', 'faq', 'cta'],
      },
      {
        path: 'services',
        navLabel: 'Services',
        hero: 'compact',
        sections: ['features', 'showcase', 'faq'],
      },
      {
        path: 'about',
        navLabel: 'About',
        hero: 'compact',
        sections: ['richtext', 'stats', 'steps'],
      },
      {
        path: 'contact',
        navLabel: 'Contact',
        hero: 'compact',
        sections: ['contact'],
      },
    ],
  },
]

export const DEFAULT_TEMPLATE_ID = 'b2b-manufacturer'

export function getTemplate(id?: string): SiteTemplate {
  return TEMPLATES.find((t) => t.id === id) || TEMPLATES.find((t) => t.id === DEFAULT_TEMPLATE_ID)!
}

/** Catalog string injected into the analysis prompt so the model can choose. */
export function templateCatalogForPrompt(): string {
  return TEMPLATES.map(
    (t) =>
      `- ${t.id}: ${t.name} — ${t.description} (suggested themes: ${t.recommendedThemes.join(', ')})`,
  ).join('\n')
}

/** Parse the `TEMPLATE: <id>` line (or any mentioned id) from the analysis. */
export function pickTemplateFromAnalysis(analysis: string): string | undefined {
  const match = analysis.match(/TEMPLATE:\s*([a-z0-9-]+)/i)
  const id = match?.[1]?.toLowerCase()
  if (id && TEMPLATES.some((t) => t.id === id)) return id
  for (const t of TEMPLATES) {
    if (analysis.toLowerCase().includes(t.id)) return t.id
  }
  return undefined
}

/**
 * Renders the chosen template's page/section blueprint as a concrete scaffold
 * for the spec-writing prompt. The model is told to start from this structure
 * and fill it with real copy rather than designing pages from scratch.
 */
export function templateBlueprintForPrompt(template: SiteTemplate): string {
  const pages = template.pages
    .map((p, i) => {
      const label = i === 0 ? `${p.navLabel} (path "")` : `${p.navLabel} (path "${p.path}")`
      const hero =
        p.hero === 'full'
          ? 'full hero'
          : p.hero === 'compact'
            ? 'compact banner hero'
            : 'no hero'
      return `  ${i + 1}. ${label} — ${hero}; sections in order: [${p.sections.join(', ')}]`
    })
    .join('\n')
  return `Template "${template.name}" (${template.id}) blueprint — start from this proven structure:\n${pages}`
}
