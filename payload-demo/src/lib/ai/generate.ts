import { ICON_KEYWORDS } from '@/components/AiSite/Icon'

import { extractJson, relayChat, relayChatStream, type ChatMessage } from './relay'
import { normalizeSiteSpec, type SiteSpec } from './site-spec'
import { THEMES, DEFAULT_THEME_ID, getTheme, themeCatalogForPrompt } from './themes'
import {
  searchComponents,
  searchIcons,
  isTwentyFirstConfigured,
  type ComponentInspiration,
  type IconResult,
} from './twentyfirst'

export type MerchantInput = {
  name: string
  industry?: string
  description?: string
  /** language the generated site copy should be written in (e.g. "en", "zh") */
  language?: string
  /** optional theme id to force; when omitted the AI chooses one */
  themeId?: string
}

/** Human label for each supported generation language. */
export const LANGUAGES: { code: string; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'zh', label: '简体中文' },
  { code: 'zh-TW', label: '繁體中文' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'pt', label: 'Português' },
  { code: 'ar', label: 'العربية' },
]

function languageLabel(code?: string): string {
  if (!code) return 'English'
  return LANGUAGES.find((l) => l.code === code)?.label || code
}

/** Events streamed to the client as the design agent works. */
export type GenEvent =
  | { type: 'step'; key: string; label: string; status: 'active' | 'done' }
  | { type: 'log'; message: string }
  | { type: 'analysis'; delta: string }
  | { type: 'theme'; id: string; name: string; reason?: string }
  | { type: 'inspiration'; components: ComponentInspiration[]; icons: IconResult[] }
  | { type: 'spec'; spec: SiteSpec }

const ANALYSIS_SYSTEM = `You are a senior brand & web designer working at the level of v0 / Lovable, specialized in professional B2B independent commerce websites (the kind a sales/export team sends to overseas buyers).
You are shown a merchant's product photos and a short brief. Think out loud, briefly, like a designer planning a MULTI-PAGE site:
1. What does this brand sell, who is the B2B audience, what is the industry?
2. What visual direction fits (mood, palette, typography feel) — it must feel trustworthy, premium and modern, NOT a generic template.
3. Pick exactly ONE theme id from the catalog below that best matches the brand.
4. Plan FOUR pages — Home, Products, About, Contact — and for each list the sections you will build (use rich sections: features-with-icons, stats, product showcase, gallery, process steps, FAQ, testimonials-as-features, strong CTA, contact details).

Theme catalog (id (mood): when to use):
{CATALOG}

Keep it concise (a short paragraph + a per-page bullet plan). End with a line exactly like:
THEME: <theme-id>
Write your analysis in {LANGUAGE}.`

const SPEC_SYSTEM = `You are an expert web designer and B2B brand copywriter. Output the final site as a SINGLE JSON object — no markdown, no commentary — matching this TypeScript type:

type SiteSpec = {
  siteName: string
  slug: string
  tagline: string            // short brand line for the header/footer (3-6 words)
  themeId: string            // MUST be one of the catalog ids below
  themeReason: string        // one short sentence on why this theme fits
  pages: Array<{
    path: string             // "" for Home, then "products", "about", "contact"
    navLabel: string         // nav text for this page
    hero?: {                 // REQUIRED on Home; optional compact banner elsewhere
      headline: string
      subheadline?: string
      badges?: string[]      // 2-4 short trust badges, e.g. "ISO 9001", "20+ yrs", "OEM/ODM"
      ctas?: { label: string; url: string }[]   // url like "/products" or "/contact"
      imageIndex?: number    // 0-based index into the uploaded product images
    }
    sections: Array<
      | { kind: "features"; title?: string; subtitle?: string; items: { icon?: string; title: string; body: string }[] }
      | { kind: "stats"; title?: string; items: { value: string; label: string }[] }
      | { kind: "showcase"; title?: string; body?: string; imageIndex: number; bullets?: string[]; cta?: { label: string; url: string }; layout?: "imageLeft" | "imageRight" }
      | { kind: "gallery"; title?: string; subtitle?: string; imageIndexes: number[] }
      | { kind: "steps"; title?: string; subtitle?: string; items: { title: string; body: string }[] }
      | { kind: "faq"; title?: string; items: { q: string; a: string }[] }
      | { kind: "richtext"; title?: string; paragraphs: string[] }
      | { kind: "cta"; heading: string; body?: string; cta: { label: string; url: string } }
      | { kind: "contact"; title?: string; body?: string; email?: string; phone?: string; address?: string; hours?: string }
    >
    meta: { title: string; description: string }
  }>
  meta: { title: string; description: string }
}

Theme catalog ids you may choose from:
{CATALOG}

Icon keywords you MUST pick from for every feature/step "icon" field (use the closest match):
{ICONS}

Rules:
- Produce EXACTLY four pages in this order: Home (path ""), Products (path "products"), About (path "about"), Contact (path "contact").
- Home: hero + at least 4 rich sections (e.g. stats, features-with-icons, a showcase, and a closing cta). Products: a compact hero + showcase/gallery/features describing the product range. About: company story (richtext + stats + steps/process). Contact: a contact section with email/phone/address + a short hero.
- EVERY "features" and "steps" item that can have an icon SHOULD set "icon" to one of the icon keywords above.
- imageIndex / imageIndexes MUST be valid 0-based indexes into the provided images (there are {IMAGE_COUNT} image(s)). Reuse images across pages as needed.
- CTA/nav urls should be in-site paths: "/", "/products", "/about", "/contact".
- Write compelling, specific B2B marketing copy (no lorem ipsum, no placeholders) referencing real details visible in the product photos. Quantify where possible.
- ALL human-readable copy MUST be written in {LANGUAGE}.
- Let the design inspiration notes below raise the quality bar, but still output ONLY the JSON.`

function briefText(merchant: MerchantInput, imageCount: number): string {
  return [
    `Merchant name: ${merchant.name || '(infer from images)'}`,
    merchant.industry ? `Industry: ${merchant.industry}` : null,
    merchant.description ? `Brief: ${merchant.description}` : null,
    `Number of product images: ${imageCount} (indexes 0..${Math.max(0, imageCount - 1)})`,
  ]
    .filter(Boolean)
    .join('\n')
}

function imageParts(imageDataUrls: string[]): Exclude<ChatMessage['content'], string> {
  return imageDataUrls.map((url) => ({ type: 'image_url', image_url: { url } }) as const)
}

function pickThemeFromAnalysis(analysis: string): string | undefined {
  const match = analysis.match(/THEME:\s*([a-z0-9-]+)/i)
  const id = match?.[1]?.toLowerCase()
  if (id && THEMES.some((t) => t.id === id)) return id
  // Fallback: scan for any known id mentioned in the text.
  for (const t of THEMES) {
    if (analysis.toLowerCase().includes(t.id)) return t.id
  }
  return undefined
}

function inspirationQueries(merchant: MerchantInput, _analysis: string): string[] {
  const base = [merchant.industry, merchant.name].filter(Boolean).join(' ').trim()
  const queries = [
    `${base} landing page hero section`.trim(),
    `${base} feature grid cards`.trim(),
    `${base} call to action section`.trim(),
  ]
  // Pull a noun-ish keyword from the analysis for icon search.
  if (merchant.industry) queries.push(merchant.industry)
  return queries.filter((q) => q.length > 3)
}

export type EmitFn = (event: GenEvent) => void

/**
 * Runs the full generation pipeline, emitting progress events in real time via
 * `emit`: (1) analyze the images and pick a theme (token-streamed), (2) pull
 * design inspiration from 21st.dev + svgl, (3) write the final SiteSpec.
 * Returns the final SiteSpec.
 */
export async function runGeneration(
  merchant: MerchantInput,
  imageDataUrls: string[],
  emit: EmitFn,
  signal?: AbortSignal,
): Promise<SiteSpec> {
  const lang = languageLabel(merchant.language)
  const catalog = themeCatalogForPrompt()
  const validIds = THEMES.map((t) => t.id)

  // ---- Phase 1: analyze images + choose theme (streamed) -----------------
  emit({ type: 'step', key: 'read', label: 'Reading product images', status: 'active' })
  emit({ type: 'log', message: `Analyzing ${imageDataUrls.length} image(s) with vision…` })

  const analysisSystem = ANALYSIS_SYSTEM.replace('{CATALOG}', catalog).replace('{LANGUAGE}', lang)
  const analysisMessages: ChatMessage[] = [
    { role: 'system', content: analysisSystem },
    {
      role: 'user',
      content: [
        { type: 'text', text: briefText(merchant, imageDataUrls.length) },
        ...imageParts(imageDataUrls),
      ],
    },
  ]

  const analysis = await relayChatStream(
    analysisMessages,
    (delta) => emit({ type: 'analysis', delta }),
    signal,
  )

  emit({ type: 'step', key: 'read', label: 'Reading product images', status: 'done' })

  emit({ type: 'step', key: 'plan', label: 'Planning layout & style', status: 'active' })
  const chosenTheme = merchant.themeId || pickThemeFromAnalysis(analysis) || DEFAULT_THEME_ID
  const theme = getTheme(chosenTheme)
  emit({ type: 'theme', id: theme.id, name: theme.name })
  emit({ type: 'log', message: `Selected theme: ${theme.name} (${theme.mood})` })
  emit({ type: 'step', key: 'plan', label: 'Planning layout & style', status: 'done' })

  // ---- Phase 2: design inspiration from 21st.dev (components + icons) -----
  emit({
    type: 'step',
    key: 'inspire',
    label: 'Searching 21st.dev components & icons',
    status: 'active',
  })
  let components: ComponentInspiration[] = []
  let icons: IconResult[] = []
  try {
    const queries = inspirationQueries(merchant, analysis)
    if (isTwentyFirstConfigured()) {
      const results = await Promise.all(queries.slice(0, 3).map((q) => searchComponents(q, signal)))
      components = results.flat().slice(0, 6)
    }
    if (isTwentyFirstConfigured()) {
      icons = await searchIcons(merchant.industry || merchant.name || 'business', signal)
    }
  } catch {
    // Inspiration is best-effort; never block generation on it.
  }
  if (components.length) {
    emit({
      type: 'log',
      message: `Found ${components.length} matching component pattern(s) on 21st.dev`,
    })
  }
  if (icons.length) {
    emit({ type: 'log', message: `Found ${icons.length} brand icon(s) on 21st.dev` })
  }
  emit({ type: 'inspiration', components, icons })
  emit({
    type: 'step',
    key: 'inspire',
    label: 'Searching 21st.dev components & icons',
    status: 'done',
  })

  // ---- Phase 3: write the final structured site spec ---------------------
  emit({ type: 'step', key: 'write', label: 'Writing copy & assembling sections', status: 'active' })

  const inspirationNote = components.length
    ? `Design inspiration (proven component patterns to match in quality):\n${components
        .map((c) => `- ${c.name}${c.summary ? `: ${c.summary}` : ''}`)
        .join('\n')}`
    : 'No external component inspiration available; rely on your own taste.'

  const specSystem = SPEC_SYSTEM.replace('{CATALOG}', catalog)
    .replace('{ICONS}', ICON_KEYWORDS.join(', '))
    .replaceAll('{LANGUAGE}', lang)
    .replaceAll('{IMAGE_COUNT}', String(imageDataUrls.length))
  const specMessages: ChatMessage[] = [
    { role: 'system', content: specSystem },
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: [
            briefText(merchant, imageDataUrls.length),
            '',
            `Chosen theme id: ${theme.id} (${theme.name})`,
            '',
            'Your earlier design analysis:',
            analysis,
            '',
            inspirationNote,
            '',
            `Now output the final SiteSpec JSON only. Use themeId "${theme.id}". All copy in ${lang}.`,
          ].join('\n'),
        },
        ...imageParts(imageDataUrls),
      ],
    },
  ]

  const reply = await relayChat(specMessages)
  const raw = extractJson(reply)
  const spec = normalizeSiteSpec(raw, merchant.name || 'New Site', validIds, theme.id)
  // The analysis-selected theme wins if the spec omitted/changed it unexpectedly.
  if (!merchant.themeId && pickThemeFromAnalysis(analysis)) {
    spec.themeId = theme.id
  }
  // Surface the real 21st.dev icons as a brand/trust strip on the rendered site.
  if (icons.length) {
    spec.brandIcons = icons
      .filter((i) => i.svgUrl)
      .slice(0, 6)
      .map((i) => ({ title: i.title, svgUrl: i.svgUrl }))
  }

  emit({ type: 'step', key: 'write', label: 'Writing copy & assembling sections', status: 'done' })
  emit({ type: 'spec', spec })
  return spec
}

/**
 * Non-streaming convenience wrapper that runs the full pipeline and returns the
 * final SiteSpec (events are discarded).
 */
export async function generateSiteSpec(
  merchant: MerchantInput,
  imageDataUrls: string[],
): Promise<SiteSpec> {
  return runGeneration(merchant, imageDataUrls, () => {})
}
