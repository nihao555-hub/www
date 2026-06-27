/**
 * Design-style palette — a curated catalogue of high-end aesthetic *families*
 * the creative agent can choose from (or tastefully blend) when it designs a
 * site from scratch ("free creative" mode).
 *
 * This is distinct from:
 *   - `themes.ts`        — concrete color/font tokens
 *   - `design-systems.ts`— layout DNA (hero/feature/stat composition)
 *   - `templates.ts`     — page/section blueprints
 *   - `site-templates.ts`— finished, content-driven page templates
 *
 * A "design style" is the overarching visual language / art direction. The list
 * is distilled from awwwards-grade open-source work (GSAP/Three.js scroll
 * sites, kinetic-type studios, brutalist portfolios) and the community
 * "awesome-design" resource lists, compressed into the few high-signal cues
 * that actually move output quality: when to use it, the typography, the
 * palette logic, the layout move, the motion, and the trap to avoid.
 *
 * A compact version (`DESIGN_STYLES_GUIDE`) is injected into the design prompts
 * so the agent picks a deliberate, named aesthetic instead of defaulting to
 * generic "centered hero over a purple mesh" slop.
 */

export type DesignStyle = {
  id: string
  /** display name */
  name: string
  /** one-line "reach for this when…" */
  whenToUse: string
  /** typographic signature */
  typography: string
  /** palette logic */
  palette: string
  /** the signature layout / composition move */
  layout: string
  /** the signature motion / interaction */
  motion: string
  /** the cliché to avoid so it doesn't look like a copy */
  avoid: string
}

export const DESIGN_STYLES: DesignStyle[] = [
  {
    id: 'swiss-international',
    name: 'Swiss / International Typographic',
    whenToUse: 'Consultancies, studios, B2B, editorial brands that want rigor and authority.',
    typography: 'One neo-grotesque (Helvetica/Inter/Neue Haas) at extreme size contrast; flush-left, tight leading.',
    palette: 'Black + white + paper, exactly one signal color (often red); no decoration.',
    layout: 'Strict modular grid, asymmetric balance, generous margins, baseline-aligned text blocks.',
    motion: 'Restrained: precise fades, column reveals, a single bold scroll move.',
    avoid: 'Centered everything, gradients, rounded blobs, drop shadows.',
  },
  {
    id: 'editorial-magazine',
    name: 'Editorial / Magazine',
    whenToUse: 'Fashion, beauty, hospitality, heritage and luxury brands with a story to tell.',
    typography: 'A characterful display serif for headlines (Canela/Ogg-feel) + clean sans body; drop caps, pull quotes.',
    palette: 'Warm neutrals (cream/bone/ink) + one muted jewel accent; photography-led.',
    layout: 'Multi-column magazine grid, full-bleed imagery, large captions, intentional white space.',
    motion: 'Slow parallax on imagery, line-by-line text reveals, cursor-following captions.',
    avoid: 'Stock-photo grids, three equal cards, neon, heavy UI chrome.',
  },
  {
    id: 'neo-brutalist',
    name: 'Neo-Brutalist',
    whenToUse: 'Streetwear, music, creative agencies, bold youth brands that want attitude.',
    typography: 'Oversized uppercase grotesque, raw and loud; tight tracking, mixed weights.',
    palette: 'Off-white/paper base, hard black, one acid accent (lime/electric blue/hot pink).',
    layout: 'Hard 1-2px borders, exposed grid, blocky panels, intentional misalignment, marquees.',
    motion: 'Snappy hover state changes, color-inverting buttons, ticker/marquee scroll.',
    avoid: 'Soft shadows, smooth gradients, polite spacing, pastel.',
  },
  {
    id: 'kinetic-typography',
    name: 'Kinetic Typography',
    whenToUse: 'Studios, launches, manifestos, anything where the words ARE the visual.',
    typography: 'Type as hero — huge variable-weight display that animates, splits and scrolls.',
    palette: 'High-contrast mono (one dark, one light) + a single charged accent.',
    layout: 'Type-driven full-bleed sections, horizontal scroll bands, word-by-word stacking.',
    motion: 'Scroll-scrubbed text (split chars), horizontal pinning, velocity-skew on scroll.',
    avoid: 'Busy imagery competing with the type, more than one accent, decorative icons.',
  },
  {
    id: 'immersive-3d-scroll',
    name: 'Immersive / Cinematic Scroll',
    whenToUse: 'Hospitality, travel, real estate, premium products, brand experiences.',
    typography: 'Quiet, elegant sans/serif that defers to imagery; small confident labels.',
    palette: 'Derived from the photography; dark scrims for legibility; minimal UI.',
    layout: 'Full-bleed cinematic media, scroll-story chapters, pinned sections, layered depth.',
    motion: 'Parallax depth, scrubbed reveals, smooth (lenis-style) scrolling, scale-on-scroll.',
    avoid: 'Boxy cards, visible borders, dense text over photos, abrupt cuts.',
  },
  {
    id: 'glassmorphism',
    name: 'Glassmorphism',
    whenToUse: 'Modern SaaS, AI tools, fintech, dashboards that want a sleek tech feel.',
    typography: 'Clean geometric sans (Inter/Geist); medium weights, crisp hierarchy.',
    palette: 'Vibrant gradient backdrop behind frosted translucent panels; soft borders.',
    layout: 'Floating glass cards with backdrop-blur, bento arrangements, depth via layering.',
    motion: 'Gentle float/tilt on cards, light sweeps, spring hovers.',
    avoid: 'Overusing blur until text is unreadable; muddy low-contrast gradients.',
  },
  {
    id: 'dark-luxury',
    name: 'Dark Luxury',
    whenToUse: 'High-end brands, watches, spirits, jewelry, premium B2B, private services.',
    typography: 'Refined high-contrast serif or a thin elegant sans; wide tracking on labels.',
    palette: 'Near-black (zinc-950, never #000) + warm metallic accent (champagne/brass/gold).',
    layout: 'Lots of negative space, centered restraint, single hero product, thin dividers.',
    motion: 'Slow, expensive fades; subtle gold shimmer; minimal, deliberate.',
    avoid: 'Pure black, neon, clutter, more than one metallic, busy gradients.',
  },
  {
    id: 'minimal-monochrome',
    name: 'Minimal Monochrome',
    whenToUse: 'Portfolios, design tools, premium products that sell through restraint.',
    typography: 'One sans, two weights; size and space carry the hierarchy.',
    palette: 'Tonal grayscale + exactly one accent used sparingly.',
    layout: 'Airy, generous margins, few elements per screen, strong alignment.',
    motion: 'Barely-there: opacity fades, 1-2 hover micro-moves.',
    avoid: 'Decoration for its own sake, multiple accents, dense rows.',
  },
  {
    id: 'gradient-aurora',
    name: 'Aurora Gradient',
    whenToUse: 'Modern SaaS, developer tools, AI platforms, vibrant startups.',
    typography: 'Geometric sans; large tracking-tight headline, optional gradient-clipped text.',
    palette: 'Soft multi-stop aurora blobs (controlled, not neon) over a clean base.',
    layout: 'Centered launch hero allowed, product screenshot in a framed device, bento features.',
    motion: 'Slow drifting blobs, subtle glow pulse, scroll-reveal cards.',
    avoid: 'AI-purple cliché, oversaturated glows, rainbow everywhere — keep blobs subtle.',
  },
  {
    id: 'memphis-postmodern',
    name: 'Memphis / Postmodern',
    whenToUse: 'Playful consumer brands, events, kids/education, food, creative SaaS.',
    typography: 'Bold rounded or chunky sans; mixed sizes, playful emphasis.',
    palette: 'Bright primaries + black on cream; confetti shapes (squiggles, dots, zigzags).',
    layout: 'Scattered geometric props, overlapping blocks, energetic asymmetry.',
    motion: 'Bouncy springs, wobble hovers, parallax shapes.',
    avoid: 'Looking childish/cheap — keep one disciplined grid under the chaos.',
  },
  {
    id: 'organic-natural',
    name: 'Organic / Natural',
    whenToUse: 'Wellness, skincare, food, sustainability, botanical and craft brands.',
    typography: 'Humanist serif or soft sans; gentle, warm, readable.',
    palette: 'Earth tones (sage, clay, sand, stone) + cream; muted, sun-washed.',
    layout: 'Soft curves, blob masks, rounded imagery, relaxed flowing sections.',
    motion: 'Slow organic ease, gentle reveals, leaf/liquid micro-motion.',
    avoid: 'Hard tech edges, neon, rigid terminal grids, cold grays.',
  },
  {
    id: 'cyber-tech-hud',
    name: 'Cyber / Technical HUD',
    whenToUse: 'Web3, security, infra, data products, hardware, esports.',
    typography: 'Monospace or technical sans; labels, coordinates, version tags.',
    palette: 'Off-black + grid lines + one electric accent (cyan/lime/amber); terminal feel.',
    layout: 'Data-dense grids, ruler lines, corner ticks, dashboard panels, fine borders.',
    motion: 'Typewriter/decode text, scanline sweeps, count-up metrics, glitch on hover.',
    avoid: 'Over-glitching, illegible green-on-black, fake matrix rain everywhere.',
  },
  {
    id: 'retro-print',
    name: 'Retro / Print Revival',
    whenToUse: 'Coffee, breweries, vinyl, barbers, heritage and craft consumer brands.',
    typography: 'Vintage display (condensed gothic, slab, or groovy 70s); textured.',
    palette: 'Muted retro (mustard, rust, teal, cream) with paper grain/halftone.',
    layout: 'Poster-like compositions, badges/seals, framed blocks, sticker accents.',
    motion: 'Subtle grain, ticker, hover stamp/press; keep it tactile not gimmicky.',
    avoid: 'Modern flat gradients, glassy UI, cold blues.',
  },
  {
    id: 'bauhaus-geometric',
    name: 'Bauhaus / Geometric',
    whenToUse: 'Art, architecture, culture, education, confident design-forward brands.',
    typography: 'Geometric sans (Futura-feel); circular/triangular accents echoing shapes.',
    palette: 'Primary red/blue/yellow + black on off-white; flat, no shadows.',
    layout: 'Bold geometric blocks, circles/arcs/triangles as structure, strict grid.',
    motion: 'Shapes assembling on scroll, rotating arcs, crisp transitions.',
    avoid: 'Gradients, soft shadows, photographic clutter.',
  },
]

/** Lookup by id. */
export function getDesignStyle(id?: string | null): DesignStyle | undefined {
  if (!id) return undefined
  return DESIGN_STYLES.find((s) => s.id === id)
}

/** One-line-per-style summary for the picker / catalog prompt. */
export function designStylesCatalog(): string {
  return DESIGN_STYLES.map((s) => `- ${s.id} — ${s.name}: ${s.whenToUse}`).join('\n')
}

/**
 * Compact, high-signal guide injected into the design prompts so the agent can
 * deliberately pick (or blend two) named aesthetics in free creative mode.
 */
export const DESIGN_STYLES_GUIDE = `DESIGN-STYLE PALETTE — pick ONE primary aesthetic family that fits the brief (you may blend in a SECOND for accents, never more). Commit to it fully across type, color, layout and motion. Do not default to generic "centered hero over a purple mesh".

${DESIGN_STYLES.map(
  (s) =>
    `### ${s.name} (${s.id})\n- Use when: ${s.whenToUse}\n- Type: ${s.typography}\n- Palette: ${s.palette}\n- Layout: ${s.layout}\n- Motion: ${s.motion}\n- Avoid: ${s.avoid}`,
).join('\n\n')}

HOW TO USE: from the brief, name the aesthetic in one line, then let every type/color/layout/motion decision follow from it. The audience picks the style, not your reflex. Honor the brief's vibe words. Whatever you pick, obey the anti-slop "AI tell" bans.`
