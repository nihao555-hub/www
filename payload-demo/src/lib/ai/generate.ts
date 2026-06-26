import { ICON_KEYWORDS } from '@/components/AiSite/Icon'

import { compileJsx } from './jsx-sandbox'
import {
  generateImage,
  imageUrlToDataUrl,
  isImageGenConfigured,
} from './image-gen'
import { extractJson, relayChat, relayChatStream, type ChatMessage } from './relay'
import { normalizeSiteSpec, type SiteSpec } from './site-spec'
import { THEMES, DEFAULT_THEME_ID, getTheme, themeCatalogForPrompt } from './themes'
import {
  DESIGNS,
  DEFAULT_DESIGN_ID,
  getDesign,
  designCatalogForPrompt,
  pickDesignFromAnalysis,
} from './design-systems'
import {
  TEMPLATES,
  DEFAULT_TEMPLATE_ID,
  getTemplate,
  templateCatalogForPrompt,
  templateBlueprintForPrompt,
  pickTemplateFromAnalysis,
} from './templates'
import type { ComponentInspiration, IconResult } from './twentyfirst'
import { isMcpConfigured } from './twentyfirst-mcp'
import {
  runComponentAgent,
  componentRefsForPrompt,
  type McpToolCall,
} from './component-agent'

export type MerchantInput = {
  name: string
  industry?: string
  description?: string
  /** free-text brief the user typed in the single input box; the agent splits
   * this into name/industry/description automatically. */
  brief?: string
  /** language the generated site copy should be written in (e.g. "en", "zh") */
  language?: string
  /** optional theme id to force; when omitted the AI chooses one */
  themeId?: string
  /** optional template/archetype id to force; when omitted the AI chooses one */
  templateId?: string
  /** optional design family id to force; when omitted the AI chooses one */
  designId?: string
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

/** An AI-generated scene/decorative image, ready to be stored in Payload. */
export type GeneratedImage = {
  /** the generated image as a data URL (downloaded from the draw host) */
  dataUrl: string
  /** alt text describing the image */
  alt: string
  /** what role it plays on the site (hero background, section, decoration) */
  purpose: string
}

/** Result of a full generation run. */
export type GenerationResult = {
  spec: SiteSpec
  /** images the AI generated to fill gaps; the caller stores these in Payload
   * media. They are appended (in order) AFTER the merchant's uploaded images,
   * so the spec's imageIndex values line up with `uploaded ++ generated`. */
  generatedImages: GeneratedImage[]
}

/** Events streamed to the client as the design agent works. */
export type GenEvent =
  | { type: 'step'; key: string; label: string; status: 'active' | 'done' }
  | { type: 'log'; message: string }
  | { type: 'analysis'; delta: string }
  | { type: 'theme'; id: string; name: string; reason?: string }
  | { type: 'template'; id: string; name: string }
  | { type: 'inspiration'; components: ComponentInspiration[]; icons: IconResult[] }
  | { type: 'mcp'; toolNames: string[]; calls: McpToolCall[] }
  | { type: 'spec'; spec: SiteSpec }

const ANALYSIS_SYSTEM = `You are a senior brand & web designer working at the level of v0 / Lovable, specialized in professional B2B independent commerce websites (the kind a sales/export team sends to overseas buyers).
You are shown a merchant's product photos and a short brief. Think out loud, briefly, like a designer planning a MULTI-PAGE site:
1. What does this brand sell, who is the B2B audience, what is the industry?
2. What visual direction fits (mood, palette, typography feel) — it must feel trustworthy, premium and modern, NOT a generic template.
3. Pick exactly ONE theme id from the catalog below that best matches the brand.
4. Pick exactly ONE template archetype id from the template library below — this is the proven page/section blueprint you will start from instead of designing from scratch.
5. Pick exactly ONE design family id from the design library below — this is the visual LAYOUT DNA (hero composition, feature/stat layout, spacing, decoration). Choose the family whose vibe fits the brand so this site does NOT look like a generic template; vary it by industry/mood.
6. Following the chosen template's blueprint, plan the pages and for each list the sections you will build (use rich sections: features-with-icons, stats, product showcase, gallery, process steps, FAQ, strong CTA, contact details).

Theme catalog (id (mood): when to use):
{CATALOG}

Template library (id: name — when to use):
{TEMPLATES}

Design family library (id: name — when to use):
{DESIGNS}

Keep it concise (a short paragraph + a per-page bullet plan). End with THREE lines exactly like:
THEME: <theme-id>
TEMPLATE: <template-id>
DESIGN: <design-id>
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

Page/section blueprint to start from (the chosen reusable template — follow this structure, filling it with real copy; you may add/remove a single section per page only if it clearly improves the result):
{BLUEPRINT}

Rules:
- Build the pages following the blueprint above (same order, same per-page section kinds). Page 1 is the Home page (path "").
- Home: a full hero + the blueprint's rich sections (no placeholders). Inner pages: a compact hero + their blueprint sections.
- Every contact section should include email/phone/address where known.
- EVERY "features" and "steps" item that can have an icon SHOULD set "icon" to one of the icon keywords above.
- imageIndex / imageIndexes MUST be valid 0-based indexes into the provided images (there are {IMAGE_COUNT} image(s)). Reuse images across pages as needed.
- CTA/nav urls should be in-site paths: "/", "/products", "/about", "/contact".
- Write compelling, specific B2B marketing copy (no lorem ipsum, no placeholders) referencing real details visible in the product photos. Quantify where possible.
- ALL human-readable copy MUST be written in {LANGUAGE}.
- Let the design inspiration notes below raise the quality bar, but still output ONLY the JSON.`

// Route 2 — ask the model to author a real, self-contained JSX hero that we
// compile and render live (v0/lovable style), instead of only filling a fixed
// template. Output is raw JSX, no imports/exports needed.
const HERO_JSX_SYSTEM = `You are a senior front-end engineer + designer (v0 / Lovable level). Write ONE self-contained React function component for a website HERO section. This code is compiled and rendered LIVE, so it must be correct, safe, and visually striking.

Output rules (CRITICAL):
- Output ONLY the component code. No markdown fences, no prose, no imports, no exports.
- Define exactly: function Hero({ theme, images, headline, subheadline, badges, ctas }) { ... return ( ...jsx... ) }
- Plain JSX only (no TypeScript types/annotations).
- Do NOT import anything. These identifiers are already in scope: React hooks (useState, useEffect, useRef, useMemo), motion (from framer-motion, e.g. <motion.div>), AnimatePresence, all lucide-react icons by name (e.g. ArrowRight, CheckCircle2, ShieldCheck), and cn(). Do not use window/document/fetch/eval.
- Style with a mix of Tailwind utility classes AND inline style using the theme tokens. Available theme.colors keys: background, foreground, card, cardForeground, primary, primaryForeground, secondary, muted, mutedForeground, accent, border. Example: style={{ background: theme.colors.background, color: theme.colors.foreground }}.
- USE THE PROPS for all copy: render {headline}, {subheadline}, map {badges} and {ctas} (each cta = { label, url } -> an <a href={cta.url}>). Never hardcode placeholder/lorem text.
- If images?.length, use images[0] as a hero image or background (e.g. <img src={images[0]} .../> or backgroundImage). Always guard with optional chaining.
- Make it full-bleed (w-full), high-contrast, responsive, with generous spacing and a clear primary CTA button using theme.colors.primary / primaryForeground. Subtle motion is welcome but keep it tasteful and not blocking.
- The component must render without runtime errors for any subset of props.
- If a "REFERENCE COMPONENT" (real code pulled live from 21st.dev) is provided, treat it as the design blueprint: adapt its layout, composition, visual rhythm, decorative details and motion into your Hero. Strip its imports/exports/TypeScript, swap its hardcoded copy for the {headline}/{subheadline}/{badges}/{ctas} props, and recolor it with the theme tokens. Do not copy it verbatim — re-express the same structure cleanly within the constraints above.

Return the raw component code now.`

function stripCodeFence(s: string): string {
  const t = s.trim()
  const fence = t.match(/^```(?:[a-zA-Z]+)?\n([\s\S]*?)\n```$/)
  return (fence ? fence[1] : t).trim()
}

function briefText(merchant: MerchantInput, imageCount: number): string {
  return [
    `Merchant name: ${merchant.name || '(infer from images)'}`,
    merchant.industry ? `Industry: ${merchant.industry}` : null,
    merchant.description ? `Brief: ${merchant.description}` : null,
    merchant.brief ? `User's raw request: ${merchant.brief}` : null,
    `Number of product images: ${imageCount} (indexes 0..${Math.max(0, imageCount - 1)})`,
  ]
    .filter(Boolean)
    .join('\n')
}

/**
 * Splits the user's free-text brief into structured fields. The single input
 * box lets users type everything at once ("all info, agent auto-splits"); this
 * pulls out a clean brand name + industry + description so downstream theme
 * choice and 21st.dev searches are sharper. Best-effort: failures keep the
 * original merchant input untouched.
 */
async function splitBrief(merchant: MerchantInput): Promise<MerchantInput> {
  const brief = merchant.brief?.trim()
  // Nothing to split, or the structured fields are already provided.
  if (!brief || (merchant.name && merchant.industry && merchant.description)) {
    return merchant
  }
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `You extract structured fields from a merchant's free-text request for a B2B website. Output ONLY a JSON object: {"name": string, "industry": string, "description": string}. "name" is the brand/company name ("" if not stated), "industry" is a short category (e.g. "steel pipe manufacturing"), "description" is a one-paragraph summary of what they sell, audience and selling points. Do not invent a brand name; leave it "" if absent.`,
    },
    { role: 'user', content: brief },
  ]
  try {
    const reply = await relayChat(messages)
    const parsed = extractJson(reply) as Record<string, unknown>
    return {
      ...merchant,
      name: merchant.name || (typeof parsed.name === 'string' ? parsed.name.trim() : ''),
      industry:
        merchant.industry ||
        (typeof parsed.industry === 'string' ? parsed.industry.trim() : undefined) ||
        undefined,
      description:
        merchant.description ||
        (typeof parsed.description === 'string' ? parsed.description.trim() : undefined) ||
        brief,
    }
  } catch {
    // Fall back to using the raw brief as the description.
    return { ...merchant, description: merchant.description || brief }
  }
}

/** A single image the art-director agent decided the site needs. */
type ImagePlanItem = { purpose: string; prompt: string; aspectRatio: string; alt: string }

const VALID_ASPECTS = new Set(['1024x1024', '1536x1024', '1024x1536'])

/**
 * Ask the model to act as an art director and write `count` image-generation
 * prompts tailored to the brand, theme palette and design family. Returns [] on
 * any failure so the pipeline degrades gracefully.
 */
async function planImagePrompts(
  merchant: MerchantInput,
  theme: ReturnType<typeof getTheme>,
  design: ReturnType<typeof getDesign>,
  analysis: string,
  count: number,
  uploadedCount: number,
): Promise<ImagePlanItem[]> {
  if (count <= 0) return []
  const palette = Object.values(theme.colors).join(', ')
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `You are an art director choosing imagery for a brand website. Output ONLY a JSON array of exactly ${count} objects, each {"purpose": string, "prompt": string, "aspectRatio": string, "alt": string}.
Rules:
- "purpose" is one of: "hero" (full-bleed hero background), "section" (a product/feature/showcase photo), "decoration" (abstract texture/gradient/pattern backdrop).
- The FIRST image must be purpose "hero" with aspectRatio "1536x1024".
- "prompt" must be a vivid, specific, production-quality image prompt that matches the brand and these theme colors: ${palette}. Match the "${design.name}" design vibe (${design.description}).
- Images must contain NO text, words, letters, numbers, logos, watermarks or UI.
- "aspectRatio" must be one of "1024x1024", "1536x1024", "1024x1536".
- "alt" is a short factual alt-text in plain English.
- There are already ${uploadedCount} customer-uploaded image(s); generate complementary scene/decorative imagery, not duplicates.`,
    },
    {
      role: 'user',
      content: [
        briefText(merchant, uploadedCount),
        '',
        `Theme: ${theme.name} (${theme.mood}). Design family: ${design.name}.`,
        '',
        'Design analysis for context:',
        analysis.slice(0, 1500),
      ].join('\n'),
    },
  ]
  try {
    const reply = await relayChat(messages)
    const parsed = extractJson(reply)
    if (!Array.isArray(parsed)) return []
    const items: ImagePlanItem[] = []
    for (const raw of parsed) {
      if (!raw || typeof raw !== 'object') continue
      const o = raw as Record<string, unknown>
      const prompt = typeof o.prompt === 'string' ? o.prompt.trim() : ''
      if (!prompt) continue
      const aspectRatio =
        typeof o.aspectRatio === 'string' && VALID_ASPECTS.has(o.aspectRatio)
          ? o.aspectRatio
          : '1024x1024'
      items.push({
        purpose: typeof o.purpose === 'string' ? o.purpose : 'section',
        prompt,
        aspectRatio,
        alt: typeof o.alt === 'string' ? o.alt : prompt.slice(0, 80),
      })
    }
    return items.slice(0, count)
  } catch {
    return []
  }
}

/**
 * Generate the planned images via gpt-image-2 (in parallel) and download each
 * to a data URL. Failed generations are skipped. Returns the images in plan
 * order so the caller can append them to the uploaded set deterministically.
 */
async function generateSiteImages(
  plan: ImagePlanItem[],
  emit: EmitFn,
  signal?: AbortSignal,
): Promise<GeneratedImage[]> {
  const results = await Promise.allSettled(
    plan.map(async (item) => {
      const url = await generateImage({
        prompt: item.prompt,
        aspectRatio: item.aspectRatio,
        signal,
      })
      const dataUrl = await imageUrlToDataUrl(url)
      return { dataUrl, alt: item.alt, purpose: item.purpose } satisfies GeneratedImage
    }),
  )
  const out: GeneratedImage[] = []
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      out.push(r.value)
      emit({ type: 'log', message: `Generated ${plan[i].purpose} image (${plan[i].aspectRatio})` })
    } else {
      emit({
        type: 'log',
        message: `Image generation failed for ${plan[i].purpose}: ${
          r.reason instanceof Error ? r.reason.message : 'error'
        }`,
      })
    }
  })
  return out
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
): Promise<GenerationResult> {
  const lang = languageLabel(merchant.language)
  const catalog = themeCatalogForPrompt()
  const validIds = THEMES.map((t) => t.id)

  // ---- Phase 0: split the free-text brief into structured fields ---------
  if (merchant.brief?.trim() && !(merchant.name && merchant.industry && merchant.description)) {
    emit({ type: 'step', key: 'parse', label: 'Understanding your brief', status: 'active' })
    merchant = await splitBrief(merchant)
    if (merchant.name) emit({ type: 'log', message: `Brand: ${merchant.name}` })
    if (merchant.industry) emit({ type: 'log', message: `Industry: ${merchant.industry}` })
    emit({ type: 'step', key: 'parse', label: 'Understanding your brief', status: 'done' })
  }

  // ---- Phase 1: analyze images + choose theme (streamed) -----------------
  emit({ type: 'step', key: 'read', label: 'Reading product images', status: 'active' })
  emit({ type: 'log', message: `Analyzing ${imageDataUrls.length} image(s) with vision…` })

  const analysisSystem = ANALYSIS_SYSTEM.replace('{CATALOG}', catalog)
    .replace('{TEMPLATES}', templateCatalogForPrompt())
    .replace('{DESIGNS}', designCatalogForPrompt())
    .replace('{LANGUAGE}', lang)
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
  const chosenTemplate =
    merchant.templateId || pickTemplateFromAnalysis(analysis) || DEFAULT_TEMPLATE_ID
  const template = getTemplate(chosenTemplate)
  emit({ type: 'template', id: template.id, name: template.name })
  emit({ type: 'log', message: `Starting from template: ${template.name}` })
  emit({ type: 'log', message: `Selected theme: ${theme.name} (${theme.mood})` })
  const chosenDesign =
    merchant.designId || pickDesignFromAnalysis(analysis) || DEFAULT_DESIGN_ID
  const design = getDesign(chosenDesign)
  emit({ type: 'log', message: `Selected design family: ${design.name} (${design.id})` })
  emit({ type: 'step', key: 'plan', label: 'Planning layout & style', status: 'done' })

  // ---- Phase 2: 21st.dev Magic MCP — multi-round component + icon search --
  emit({
    type: 'step',
    key: 'inspire',
    label: 'Searching 21st.dev via MCP (multi-round tool calls)',
    status: 'active',
  })
  let components: ComponentInspiration[] = []
  let icons: IconResult[] = []
  let componentRefs: { section: string; componentName: string; similarity?: number; code: string }[] = []
  let agentResult: Awaited<ReturnType<typeof runComponentAgent>> | null = null
  if (isMcpConfigured()) {
    agentResult = await runComponentAgent(
      {
        name: merchant.name || 'New brand',
        industry: merchant.industry,
        description: merchant.description,
        themeName: theme.name,
        template,
      },
      (calls) => emit({ type: 'mcp', toolNames: agentResult?.toolNames ?? [], calls }),
      signal,
    )
    icons = agentResult.icons
    componentRefs = agentResult.refs.map((r) => ({
      section: r.section,
      componentName: r.componentName,
      similarity: r.similarity,
      code: r.code,
    }))
    components = agentResult.refs.map((r) => ({
      name: r.componentName,
      summary: r.section,
    }))
    emit({ type: 'mcp', toolNames: agentResult.toolNames, calls: agentResult.calls })
  }
  if (agentResult?.toolNames.length) {
    emit({
      type: 'log',
      message: `MCP server tools: ${agentResult.toolNames.join(', ')}`,
    })
  }
  if (agentResult?.calls.length) {
    emit({
      type: 'log',
      message: `Made ${agentResult.calls.length} MCP tool call(s); pulled ${componentRefs.length} real component(s) + ${icons.length} icon(s)`,
    })
  }
  emit({ type: 'inspiration', components, icons })
  emit({
    type: 'step',
    key: 'inspire',
    label: 'Searching 21st.dev via MCP (multi-round tool calls)',
    status: 'done',
  })

  // ---- Phase 2.5: generate missing scene/decorative images via gpt-image-2 -
  // `allImages` = uploaded images followed by AI-generated ones, so the spec
  // writer's imageIndex values stay valid across the combined set.
  const allImages = [...imageDataUrls]
  const generatedImages: GeneratedImage[] = []
  // Aim for a small library of imagery so every site has a hero backdrop and a
  // few section/decoration shots even when the customer uploads little or
  // nothing. Cap generation so a run stays within the request budget.
  const TARGET_IMAGE_TOTAL = 4
  const needed = Math.min(3, Math.max(0, TARGET_IMAGE_TOTAL - imageDataUrls.length))
  if (needed > 0 && isImageGenConfigured()) {
    emit({
      type: 'step',
      key: 'image',
      label: 'Generating scene & decorative images (gpt-image-2)',
      status: 'active',
    })
    emit({
      type: 'log',
      message: `Only ${imageDataUrls.length} image(s) uploaded; generating ${needed} more with gpt-image-2…`,
    })
    try {
      const plan = await planImagePrompts(
        merchant,
        theme,
        design,
        analysis,
        needed,
        imageDataUrls.length,
      )
      const made = await generateSiteImages(plan, emit, signal)
      for (const img of made) {
        generatedImages.push(img)
        allImages.push(img.dataUrl)
      }
      emit({
        type: 'log',
        message: `Added ${made.length} AI-generated image(s); ${allImages.length} image(s) available total`,
      })
    } catch (err) {
      emit({
        type: 'log',
        message: `Image generation skipped (${
          err instanceof Error ? err.message : 'error'
        })`,
      })
    }
    emit({
      type: 'step',
      key: 'image',
      label: 'Generating scene & decorative images (gpt-image-2)',
      status: 'done',
    })
  }

  // ---- Phase 3: write the final structured site spec ---------------------
  emit({ type: 'step', key: 'write', label: 'Writing copy & assembling sections', status: 'active' })

  const inspirationNote =
    agentResult && agentResult.refs.length
      ? componentRefsForPrompt(agentResult.refs)
      : components.length
        ? `Design inspiration (proven component patterns to match in quality):\n${components
            .map((c) => `- ${c.name}${c.summary ? `: ${c.summary}` : ''}`)
            .join('\n')}`
        : 'No external component inspiration available; rely on your own taste.'

  const specSystem = SPEC_SYSTEM.replace('{CATALOG}', catalog)
    .replace('{BLUEPRINT}', templateBlueprintForPrompt(template))
    .replace('{ICONS}', ICON_KEYWORDS.join(', '))
    .replaceAll('{LANGUAGE}', lang)
    .replaceAll('{IMAGE_COUNT}', String(allImages.length))
  const specMessages: ChatMessage[] = [
    { role: 'system', content: specSystem },
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: [
            briefText(merchant, allImages.length),
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
        ...imageParts(allImages),
      ],
    },
  ]

  const reply = await relayChat(specMessages)
  const raw = extractJson(reply)
  const validDesignIds = DESIGNS.map((d) => d.id)
  const spec = normalizeSiteSpec(
    raw,
    merchant.name || 'New Site',
    validIds,
    theme.id,
    validDesignIds,
    design.id,
  )
  // The analysis-selected theme wins if the spec omitted/changed it unexpectedly.
  if (!merchant.themeId && pickThemeFromAnalysis(analysis)) {
    spec.themeId = theme.id
  }
  // The analysis-selected design family is authoritative.
  spec.designId = design.id
  // Surface the real 21st.dev icons as a brand/trust strip on the rendered site.
  if (icons.length) {
    spec.brandIcons = icons
      .filter((i) => i.svgUrl)
      .slice(0, 6)
      .map((i) => ({ title: i.title, svgUrl: i.svgUrl }))
  }
  // Persist the real MCP-pulled component code that informed the design.
  if (componentRefs.length) {
    spec.componentRefs = componentRefs
  }
  emit({ type: 'step', key: 'write', label: 'Writing copy & assembling sections', status: 'done' })

  // ---- Phase 4: author a bespoke, live-rendered JSX hero (Route 2) --------
  emit({ type: 'step', key: 'jsx', label: 'Coding a bespoke hero (live JSX)', status: 'active' })
  try {
    const homeHero = spec.pages[0]?.hero
    if (homeHero) {
      // Feed the real hero component pulled live from 21st.dev as the design
      // blueprint so the MCP inspiration actually shapes the rendered hero
      // (not just the JSON spec writer's "quality bar").
      const heroRef =
        agentResult?.refs.find((r) => /hero/i.test(r.section)) ?? agentResult?.refs[0] ?? null
      const heroRefBlock = heroRef
        ? [
            '',
            `REFERENCE COMPONENT — real "${heroRef.componentName}" code pulled live from 21st.dev via MCP${
              typeof heroRef.similarity === 'number' ? ` (match ${heroRef.similarity.toFixed(2)})` : ''
            }. Adapt its structure/composition/motion (see system rules):`,
            '```tsx',
            (heroRef.demoCode || heroRef.code).slice(0, 3500),
            '```',
          ].join('\n')
        : ''
      const heroUser = [
        briefText(merchant, allImages.length),
        '',
        `Theme tokens (use via theme.colors.*): ${JSON.stringify(theme.colors)}`,
        `Design family vibe: ${design.name} — ${design.description}`,
        '',
        'Hero copy to render (already written in the target language — do not translate or invent new copy):',
        JSON.stringify(
          {
            headline: homeHero.headline,
            subheadline: homeHero.subheadline,
            badges: homeHero.badges,
            ctas: homeHero.ctas,
          },
          null,
          2,
        ),
        heroRefBlock,
        '',
        `There are ${allImages.length} image(s) available as the \`images\` prop (array of URLs).`,
        'Output ONLY the Hero component code now.',
      ].join('\n')
      const heroReply = await relayChat([
        { role: 'system', content: HERO_JSX_SYSTEM },
        { role: 'user', content: heroUser },
      ])
      const code = stripCodeFence(heroReply)
      // Validate server-side: compile must succeed and yield a component.
      const compiled = compileJsx(code)
      if (compiled) {
        spec.heroJsx = code
        emit({ type: 'log', message: 'Live JSX hero compiled OK — rendering real component' })
      } else {
        emit({ type: 'log', message: 'Live JSX hero invalid; falling back to templated hero' })
      }
    }
  } catch (err) {
    emit({
      type: 'log',
      message: `Live JSX hero failed to compile (${
        err instanceof Error ? err.message : 'error'
      }); using templated hero`,
    })
  }
  emit({ type: 'step', key: 'jsx', label: 'Coding a bespoke hero (live JSX)', status: 'done' })

  emit({ type: 'spec', spec })
  return { spec, generatedImages }
}

/**
 * Non-streaming convenience wrapper that runs the full pipeline and returns the
 * final SiteSpec (events are discarded).
 */
export async function generateSiteSpec(
  merchant: MerchantInput,
  imageDataUrls: string[],
): Promise<SiteSpec> {
  const { spec } = await runGeneration(merchant, imageDataUrls, () => {})
  return spec
}
