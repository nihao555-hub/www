import { ICON_KEYWORDS } from '@/components/AiSite/Icon'

import { compileJsx } from './jsx-sandbox'
import {
  generateImage,
  imageUrlToDataUrl,
  isImageGenConfigured,
} from './image-gen'
import { extractJson, relayChat, relayChatStream, type ChatMessage } from './relay'
import { normalizeSiteSpec, type SiteSpec, type SpecSection } from './site-spec'
import { AGENT_ROLE, TASTE_SKILL_GUIDE, TASTE_SKILL_JSX_RULES } from './taste-skill'
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
  | { type: 'plan'; delta: string }
  | { type: 'theme'; id: string; name: string; reason?: string }
  | { type: 'template'; id: string; name: string }
  | { type: 'inspiration'; components: ComponentInspiration[]; icons: IconResult[] }
  | { type: 'mcp'; toolNames: string[]; calls: McpToolCall[] }
  | { type: 'spec'; spec: SiteSpec }

const ANALYSIS_SYSTEM = `${AGENT_ROLE}

You are a senior brand & web designer working at the level of v0 / Lovable, specialized in professional B2B independent commerce websites (the kind a sales/export team sends to overseas buyers).
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
Write your analysis in {LANGUAGE}.

${TASTE_SKILL_GUIDE}`

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
const HERO_JSX_SYSTEM = `${AGENT_ROLE}

Write ONE self-contained React function component for a website HERO section. This code is compiled and rendered LIVE, so it must be correct, safe, and visually striking.

Output rules (CRITICAL):
- Output ONLY the component code. No markdown fences, no prose, no imports, no exports.
- Define exactly: function Hero({ theme, images, headline, subheadline, badges, ctas }) { ... return ( ...jsx... ) }
- Plain JSX only (no TypeScript types/annotations).
- Do NOT import anything. These identifiers are already in scope: React hooks (useState, useEffect, useRef, useMemo), motion (from framer-motion, e.g. <motion.div>), AnimatePresence, all lucide-react icons by name (e.g. ArrowRight, CheckCircle2, ShieldCheck), and cn(). Do not use window/document/fetch/eval.
- Style with a mix of Tailwind utility classes AND inline style using the theme tokens. Available theme.colors keys: background, foreground, card, cardForeground, primary, primaryForeground, secondary, muted, mutedForeground, accent, border. Example: style={{ background: theme.colors.background, color: theme.colors.foreground }}.
- USE THE PROPS for all copy: render {headline}, {subheadline}, map {badges} and {ctas} (each cta = { label, url } -> an <a href={cta.url}>). Never hardcode placeholder/lorem text.
- If images?.length, use images[0] as a hero image or background (e.g. <img src={images[0]} .../> or backgroundImage). Always guard with optional chaining.
- Make it full-bleed (w-full), high-contrast, responsive, with generous spacing and a clear primary CTA button using theme.colors.primary / primaryForeground. Subtle motion is welcome but keep it tasteful and not blocking.
- LAYOUT SAFETY (CRITICAL — copy may be CJK/Chinese with no spaces, so a narrow text column collapses into an unreadable one-character-per-line vertical strip): for any text-beside-image split use a responsive grid with EXPLICIT fractions where the text side is at least half the width (stacked on mobile), give text children \`min-w-0\` and the text column \`min-w-[18rem]\`, never let the image column squeeze the text, use \`break-words\` (not \`break-all\`), and never use \`writing-mode\`/vertical-text/rotation on headings.
- The component must render without runtime errors for any subset of props.
- If a "REFERENCE COMPONENT" (real code pulled live from 21st.dev) is provided, treat it as the design blueprint: adapt its layout, composition, visual rhythm, decorative details and motion into your Hero. Strip its imports/exports/TypeScript, swap its hardcoded copy for the {headline}/{subheadline}/{badges}/{ctas} props, and recolor it with the theme tokens. Do not copy it verbatim - re-express the same structure cleanly within the constraints above.

${TASTE_SKILL_JSX_RULES}

Return the raw component code now.`

// Section authoring (Route 2, beyond hero). The same live-JSX sandbox is used to
// render bespoke sections (features/stats/showcase/steps/cta/faq/…) so the real
// 21st.dev component pulled for that section actually shapes the final design,
// not just the hero. Copy is baked into the JSX verbatim (already written in the
// target language) so the only runtime scope needed is { theme, images }.
const SECTION_JSX_SYSTEM = `${AGENT_ROLE}

Write ONE self-contained React function component for a single website SECTION (NOT the hero). This code is compiled and rendered LIVE, so it must be correct, safe, and visually striking.

Output rules (CRITICAL):
- Output ONLY the component code. No markdown fences, no prose, no imports, no exports.
- Define exactly: function Section({ theme, images }) { ... return ( ...jsx... ) }
- Plain JSX only (no TypeScript types/annotations).
- Do NOT import anything. These identifiers are already in scope: React hooks (useState, useEffect, useRef, useMemo), motion (from framer-motion, e.g. <motion.div>), AnimatePresence, all lucide-react icons by name (e.g. ArrowRight, CheckCircle2, ShieldCheck), and cn(). Do not use window/document/fetch/eval.
- Style with a mix of Tailwind utility classes AND inline style using the theme tokens. Available theme.colors keys: background, foreground, card, cardForeground, primary, primaryForeground, secondary, muted, mutedForeground, accent, border. Example: style={{ background: theme.colors.background, color: theme.colors.foreground }}.
- BAKE IN the provided section copy VERBATIM (it is already written in the target language — do not translate, summarize, or invent new copy). Render every item/title/stat exactly as given.
- The section is rendered inside the page flow, so use a <section> wrapper with generous vertical padding (e.g. py-16 md:py-24) and a centered max-w container. Do NOT make it full-screen.
- If images?.length, you may use them for cards/showcase/decoration; always guard with optional chaining and only reference indexes that exist.
- The component must render without runtime errors for any subset of props.
- LAYOUT SAFETY (CRITICAL — the copy may be CJK/Chinese, which has no spaces and breaks per-character, so a too-narrow text column collapses into an unreadable one-character-per-line vertical strip): NEVER let a text column become narrow. For any two-column / text-beside-image layout use a responsive grid with EXPLICIT fractions where the text side is at least half the width (e.g. \`grid md:grid-cols-2\` or \`md:grid-cols-[1.1fr_0.9fr]\`, stacked to one column on mobile), give every flex/grid text child \`min-w-0\` and the text column a sane \`min-w-[18rem]\` (or \`basis-1/2\`), and NEVER give an image/decoration column a fixed or grow width that squeezes the text. Headings and paragraphs must use \`break-words\` (not \`break-all\`) and must NOT use \`writing-mode\`, \`[writing-mode:vertical-*]\`, rotation, or any vertical-text styling. If unsure, prefer a single full-width centered column over a cramped split.
- A "REFERENCE COMPONENT" (real code pulled live from 21st.dev) is the design blueprint: adapt its layout, composition, visual rhythm, decorative details and motion into THIS section. Strip its imports/exports/TypeScript and recolor it with the theme tokens. Re-express its structure cleanly - do not copy it verbatim and do not keep its placeholder copy.

${TASTE_SKILL_JSX_RULES}

Return the raw component code now.`

const PLAN_SYSTEM = `${AGENT_ROLE}

You are the lead design agent for an AI independent-site builder, working PLAN-FIRST: like a senior designer, you decide your approach before building anything. You have already studied the merchant's photos and brief.
Output a SHORT, concrete BUILD PLAN for THIS specific site as a numbered list (5-8 lines, no preamble, no closing remarks):
1. Design Read — one line: page kind, audience, vibe + the aesthetic family you'll commit to.
2. Dials — state DESIGN_VARIANCE, MOTION_INTENSITY and VISUAL_DENSITY with the values (1-10) you choose and why, in a few words.
3. Sections — which sections you'll build and in what order (you are free, not bound to a fixed template; innovate where it helps).
4. 21st.dev — which sections you'll pull real components for, and the ONE distinctive "signature" standout (animated bento / aurora / marquee / spotlight / 3D tilt / scroll reveal / animated counter …) that becomes the site's wow moment.
5. Imagery — what scene/decorative images you'll batch-generate at the very end.
Be specific to THIS brand, never generic. Keep each line tight. Write the plan in {LANGUAGE}.

${TASTE_SKILL_GUIDE}`

const POLISH_SYSTEM = `${AGENT_ROLE}

You are doing a FINAL QA POLISH pass on a single live-rendered React component (it is compiled and rendered live in a sandbox). Audit it for REAL defects and fix them; if it is already good, return it unchanged.

OUTPUT RULES (strict):
- Output ONLY the component code. No markdown fences, no prose, no imports, no exports, no TypeScript annotations.
- Keep the EXACT same function name and signature as the input (e.g. \`function Hero({ ... })\` or \`function Section({ theme, images })\`). Do not rename it or change its props.
- Plain JSX only. You may use the same in-scope identifiers already available: React hooks, \`motion\`, \`AnimatePresence\`, lucide-react icons, and \`cn()\`. Do not introduce new imports.
- Keep ALL provided copy verbatim. Do NOT translate, rewrite, shorten or invent copy, and do NOT change the language.

FIX THESE DEFECTS IF PRESENT (and ONLY these — do not redesign):
1. CJK/Chinese text collapsing into a narrow one-character-per-line vertical strip. Widen the text column: responsive grid with the text side at least half width, \`min-w-0\` on flex/grid text children, \`min-w-[18rem]\` (or \`basis-1/2\`) on the text column, \`break-words\` (never \`break-all\`), and NEVER \`writing-mode\`/vertical-text/rotation. Prefer a single full-width column over a cramped split.
2. Content overflow, clipping, squished/deformed layout, or elements escaping their container.
3. Low-contrast text or buttons — ensure foreground/background meet WCAG AA against the theme tokens.
4. Any em-dash or en-dash that is visible to the user — replace with a regular hyphen or restructure the sentence.
5. Broken or empty image references.

${TASTE_SKILL_JSX_RULES}

Return the corrected component code now (or the original code unchanged if nothing needs fixing).`

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

  // Plan-first: the agent commits to a concrete, brand-specific build plan
  // (design read + the three dials + section order + signature + imagery)
  // BEFORE it pulls any components or writes any code, and streams it live.
  let buildPlan = ''
  try {
    buildPlan = await relayChatStream(
      [
        { role: 'system', content: PLAN_SYSTEM.replaceAll('{LANGUAGE}', lang) },
        {
          role: 'user',
          content: [
            briefText(merchant, imageDataUrls.length),
            '',
            `Chosen theme: ${theme.name} (${theme.id}) — ${theme.mood}`,
            `Chosen design family: ${design.name} — ${design.description}`,
            `Starting template archetype: ${template.name} (${template.id})`,
            '',
            'Your earlier design analysis:',
            analysis.slice(0, 1600),
            '',
            `Now output the BUILD PLAN only, in ${lang}.`,
          ].join('\n'),
        },
      ],
      (delta) => emit({ type: 'plan', delta }),
      signal,
    )
  } catch {
    buildPlan = ''
  }
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
        plan: buildPlan || undefined,
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

  // ---- Image reservation (generation happens at the very end) ------------
  // `allImages` = uploaded images followed by AI-generated ones, so the spec's
  // imageIndex values stay valid across the combined set. Image generation is
  // now the FINAL batch step (after all JSX is authored), but we reserve the
  // slots now so the spec writer + JSX authors can already lay out around the
  // full set of images they will get. `reservedTotal` is what every prompt is
  // told is available; actual generated images are appended in Phase 6 and any
  // index that didn't materialize is clamped afterwards.
  const allImages = [...imageDataUrls]
  const generatedImages: GeneratedImage[] = []
  // Aim for a small library of imagery so every site has a hero backdrop and a
  // few section/decoration shots even when the customer uploads little or
  // nothing. Cap generation so a run stays within the request budget.
  const TARGET_IMAGE_TOTAL = 4
  const plannedImageCount =
    isImageGenConfigured()
      ? Math.min(3, Math.max(0, TARGET_IMAGE_TOTAL - imageDataUrls.length))
      : 0
  const reservedTotal = imageDataUrls.length + plannedImageCount

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
    .replaceAll('{IMAGE_COUNT}', String(reservedTotal))
  const specMessages: ChatMessage[] = [
    { role: 'system', content: specSystem },
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: [
            briefText(merchant, reservedTotal),
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
        briefText(merchant, reservedTotal),
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
        `There are ${reservedTotal} image(s) available as the \`images\` prop (array of URLs).`,
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

  // ---- Phase 5: author bespoke, live-rendered JSX for the other sections ---
  // (Route 2 beyond the hero). Each section that has a matching real component
  // pulled from 21st.dev via MCP gets bespoke JSX authored with that component
  // as its design blueprint, then replaces the templated section in-place (with
  // the original templated section kept as a compile/runtime fallback).
  emit({ type: 'step', key: 'sections', label: 'Coding bespoke sections (live JSX)', status: 'active' })
  try {
    const refs = agentResult?.refs ?? []
    // Section kinds we can re-express as live JSX (skip gallery/contact/richtext
    // which are data/form driven, and skip already-jsx sections).
    const JSXABLE = new Set(['features', 'stats', 'showcase', 'steps', 'cta', 'faq'])
    const findRef = (kind: string) => {
      const k = kind.toLowerCase()
      return (
        refs.find((r) => r.section.toLowerCase() === k) ??
        refs.find((r) => r.section.toLowerCase().includes(k) || k.includes(r.section.toLowerCase())) ??
        null
      )
    }
    const MAX_SECTIONS = 6
    let authored = 0
    // The agent always pulls one distinctive, popular "signature" standout
    // component (animated bento / aurora bg / marquee / spotlight / 3D tilt …).
    // It maps to no fixed section kind, so capture it now and inject it as an
    // extra bespoke band on the home page after the main loop — this is the
    // site's "wow" moment that lifts it above a generic template.
    const featuredRef = refs.find((r) => r.featured)
    const homePage = spec.pages.find((p) => p.path === '') ?? spec.pages[0]
    // Reuse real, language-correct copy from an existing rich home section so the
    // signature band never invents (possibly wrong-language) text.
    const signatureCopy: SpecSection | null = (() => {
      if (!featuredRef || !homePage) return null
      const donor =
        homePage.sections.find((s) => s.kind === 'features' && s.items?.length >= 3) ??
        homePage.sections.find((s) => s.kind === 'stats' && s.items?.length >= 3) ??
        homePage.sections.find((s) => s.kind === 'features' || s.kind === 'stats')
      return donor ?? null
    })()
    for (const page of spec.pages) {
      for (let i = 0; i < page.sections.length; i++) {
        if (authored >= MAX_SECTIONS) break
        const section = page.sections[i]
        if (section.kind === 'jsx' || !JSXABLE.has(section.kind)) continue
        const ref = findRef(section.kind)
        if (!ref) continue // only convert sections we actually have a 21st blueprint for
        const refBlock = [
          '',
          `REFERENCE COMPONENT — real "${ref.componentName}" code pulled live from 21st.dev via MCP${
            typeof ref.similarity === 'number' ? ` (match ${ref.similarity.toFixed(2)})` : ''
          }. Adapt its structure/composition/motion (see system rules):`,
          '```tsx',
          (ref.demoCode || ref.code).slice(0, 3500),
          '```',
        ].join('\n')
        const sectionUser = [
          `This is the "${section.kind}" section of a ${
            merchant.industry || merchant.name || 'business'
          } website.`,
          '',
          `Theme tokens (use via theme.colors.*): ${JSON.stringify(theme.colors)}`,
          `Design family vibe: ${design.name} — ${design.description}`,
          '',
          'Section copy to render (already written in the target language — bake it in verbatim, do not translate or invent new copy):',
          JSON.stringify(section, null, 2),
          refBlock,
          '',
          `There are ${reservedTotal} image(s) available as the \`images\` prop (array of URLs).`,
          'Output ONLY the Section component code now.',
        ].join('\n')
        try {
          const reply = await relayChat([
            { role: 'system', content: SECTION_JSX_SYSTEM },
            { role: 'user', content: sectionUser },
          ])
          const sectionCode = stripCodeFence(reply)
          if (compileJsx(sectionCode)) {
            page.sections[i] = {
              kind: 'jsx',
              code: sectionCode,
              source: `21st:${ref.componentName}`,
              fallback: section,
            }
            authored++
            emit({
              type: 'log',
              message: `Live JSX "${section.kind}" compiled OK (blueprint: ${ref.componentName}) — rendering real component`,
            })
          } else {
            emit({
              type: 'log',
              message: `Live JSX "${section.kind}" invalid; keeping templated section`,
            })
          }
        } catch (err) {
          emit({
            type: 'log',
            message: `Live JSX "${section.kind}" failed (${
              err instanceof Error ? err.message : 'error'
            }); keeping templated section`,
          })
        }
      }
      if (authored >= MAX_SECTIONS) break
    }

    // ---- Signature band: render the distinctive standout component ----------
    let signatureAuthored = false
    if (featuredRef && signatureCopy && homePage) {
      const refBlock = [
        '',
        `REFERENCE COMPONENT — a distinctive, popular "${featuredRef.componentName}" standout pulled live from 21st.dev via MCP${
          typeof featuredRef.similarity === 'number' ? ` (match ${featuredRef.similarity.toFixed(2)})` : ''
        }. This is the SIGNATURE / wow component — preserve its animation, interactivity and visual flair (see system rules):`,
        '```tsx',
        (featuredRef.demoCode || featuredRef.code).slice(0, 3500),
        '```',
      ].join('\n')
      const signatureUser = [
        `This is a SIGNATURE showcase band for a ${
          merchant.industry || merchant.name || 'business'
        } website — the visual highlight of the page.`,
        '',
        `Theme tokens (use via theme.colors.*): ${JSON.stringify(theme.colors)}`,
        `Design family vibe: ${design.name} — ${design.description}`,
        '',
        'Section copy to render (already written in the target language — bake it in verbatim, do not translate or invent new copy):',
        JSON.stringify(signatureCopy, null, 2),
        refBlock,
        '',
        `There are ${reservedTotal} image(s) available as the \`images\` prop (array of URLs).`,
        'Faithfully reproduce the reference component\'s motion/interaction. Output ONLY the Section component code now.',
      ].join('\n')
      try {
        const reply = await relayChat([
          { role: 'system', content: SECTION_JSX_SYSTEM },
          { role: 'user', content: signatureUser },
        ])
        const sigCode = stripCodeFence(reply)
        if (compileJsx(sigCode)) {
          const heroIdx = homePage.hero ? 1 : 0
          const insertAt = Math.min(heroIdx, homePage.sections.length)
          homePage.sections.splice(insertAt, 0, {
            kind: 'jsx',
            code: sigCode,
            source: `21st-signature:${featuredRef.componentName}`,
          })
          signatureAuthored = true
          emit({
            type: 'log',
            message: `Signature standout "${featuredRef.componentName}" compiled OK — injected as the home page's wow band`,
          })
        } else {
          emit({
            type: 'log',
            message: `Signature standout "${featuredRef.componentName}" invalid; skipping wow band`,
          })
        }
      } catch (err) {
        emit({
          type: 'log',
          message: `Signature standout failed (${
            err instanceof Error ? err.message : 'error'
          }); skipping wow band`,
        })
      }
    }

    emit({
      type: 'log',
      message: `Authored ${authored} bespoke section(s) from 21st.dev blueprints${
        signatureAuthored ? ' + 1 signature standout component' : ''
      }`,
    })
  } catch (err) {
    emit({
      type: 'log',
      message: `Section JSX authoring skipped (${err instanceof Error ? err.message : 'error'})`,
    })
  }
  emit({ type: 'step', key: 'sections', label: 'Coding bespoke sections (live JSX)', status: 'done' })

  // ---- Phase 6: batch-generate all missing imagery (FINAL step) -----------
  // Image generation is deliberately last: now that the full spec + bespoke JSX
  // exist, we generate every missing scene/decoration image in one batch and
  // append them after the uploaded images so the reserved imageIndex values
  // resolve. Anything that fails to materialize is clamped right after.
  if (plannedImageCount > 0) {
    emit({
      type: 'step',
      key: 'image',
      label: 'Generating scene & decorative images (gpt-image-2)',
      status: 'active',
    })
    emit({
      type: 'log',
      message: `Batch-generating ${plannedImageCount} image(s) with gpt-image-2 (final step)…`,
    })
    try {
      const plan = await planImagePrompts(
        merchant,
        theme,
        design,
        analysis,
        plannedImageCount,
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

  // Clamp any image indexes the spec writer reserved but that never
  // materialized (e.g. a generation failed), so templated sections never point
  // past the real media set.
  clampImageIndexes(spec, imageDataUrls.length + generatedImages.length)

  // ---- Phase 7: agent self-polish — fix deformed / broken sections --------
  await polishSpec(spec, theme, emit, signal)

  emit({ type: 'spec', spec })
  return { spec, generatedImages }
}

/**
 * Clamps every `imageIndex` / `imageIndexes` in the spec to a valid range so no
 * section references an image slot that doesn't exist in the final media set.
 */
function clampImageIndexes(spec: SiteSpec, total: number): void {
  const fix = (idx: number): number => {
    if (total <= 0) return 0
    return idx >= 0 && idx < total ? idx : 0
  }
  const fixSection = (section: SpecSection): void => {
    if (section.kind === 'showcase' && typeof section.imageIndex === 'number') {
      section.imageIndex = fix(section.imageIndex)
    } else if (section.kind === 'gallery' && Array.isArray(section.imageIndexes)) {
      const valid = section.imageIndexes.filter((i) => i >= 0 && i < total)
      section.imageIndexes = valid.length ? valid : total > 0 ? [0] : []
    } else if (section.kind === 'jsx' && section.fallback) {
      fixSection(section.fallback)
    }
  }
  for (const page of spec.pages) {
    if (page.hero && typeof page.hero.imageIndex === 'number') {
      page.hero.imageIndex = fix(page.hero.imageIndex)
    }
    for (const section of page.sections) fixSection(section)
  }
}

/**
 * Final self-polish pass: the agent re-reviews every live-rendered JSX
 * component (hero + bespoke sections) for real visual defects — CJK vertical
 * collapse, overflow/deformation, low contrast, em-dashes, broken images — and
 * rewrites only the ones that need fixing. Best-effort and compile-gated: a
 * polished component replaces the original only if it still compiles.
 */
async function polishSpec(
  spec: SiteSpec,
  theme: ReturnType<typeof getTheme>,
  emit: EmitFn,
  signal?: AbortSignal,
): Promise<void> {
  type JsxSection = Extract<SpecSection, { kind: 'jsx' }>
  type Target = { kind: 'hero' } | { kind: 'section'; section: JsxSection }
  const targets: Target[] = []
  if (spec.heroJsx) targets.push({ kind: 'hero' })
  for (const page of spec.pages) {
    for (const section of page.sections) {
      if (section.kind === 'jsx' && section.code) targets.push({ kind: 'section', section })
    }
  }
  if (!targets.length) return

  const MAX_POLISH = 8
  const slice = targets.slice(0, MAX_POLISH)
  emit({ type: 'step', key: 'polish', label: 'Polishing sections', status: 'active' })
  emit({ type: 'log', message: `Polishing ${slice.length} live component(s) for defects…` })

  let fixed = 0
  for (const target of slice) {
    if (signal?.aborted) break
    const original =
      target.kind === 'hero' ? (spec.heroJsx as string) : (target.section.code as string)
    try {
      const reply = await relayChat([
        { role: 'system', content: POLISH_SYSTEM },
        {
          role: 'user',
          content: [
            `Theme tokens (used via theme.colors.*): ${JSON.stringify(theme.colors)}`,
            '',
            'Component code to QA-polish:',
            '```',
            original,
            '```',
            '',
            'Return the corrected component code only (or the original unchanged if it has no defects).',
          ].join('\n'),
        },
      ])
      const polished = stripCodeFence(reply)
      if (!polished || polished.trim() === original.trim()) continue
      if (!compileJsx(polished)) {
        emit({ type: 'log', message: 'Polished component did not compile; keeping original' })
        continue
      }
      if (target.kind === 'hero') spec.heroJsx = polished
      else target.section.code = polished
      fixed++
    } catch (err) {
      emit({
        type: 'log',
        message: `Polish skipped for one component (${
          err instanceof Error ? err.message : 'error'
        })`,
      })
    }
  }

  emit({ type: 'log', message: `Self-polish complete; fixed ${fixed} section(s)` })
  emit({ type: 'step', key: 'polish', label: 'Polishing sections', status: 'done' })
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
