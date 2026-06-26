/**
 * Theme presets ("styles") for AI-generated sites.
 *
 * The Payload website template renders everything with shadcn-style CSS
 * variables (`--primary`, `--background`, `--radius`, ...). Instead of writing a
 * brand-new template per merchant, the AI picks one of these presets and we
 * inject its values as CSS variables on the page wrapper, so the SAME blocks
 * render with a completely different look (palette, neutrals, corner radius,
 * font pairing). This gives dozens of distinct visual identities while keeping
 * the content editable in the Payload admin.
 */

export type ThemeMood =
  | 'minimal'
  | 'bold'
  | 'elegant'
  | 'playful'
  | 'corporate'
  | 'organic'
  | 'tech'
  | 'luxury'

export type FontPair = {
  /** Google Font family loaded for headings */
  heading: string
  /** Google Font family loaded for body text */
  body: string
}

export type SiteTheme = {
  id: string
  name: string
  /** short description fed to the AI so it can choose a fitting style */
  description: string
  mood: ThemeMood
  /** true if the palette is designed for a dark background */
  dark: boolean
  fonts: FontPair
  /** corner radius, e.g. "0.25rem" | "0.75rem" | "1.25rem" */
  radius: string
  /** core color tokens as CSS color strings (oklch/hex/hsl all valid) */
  colors: {
    background: string
    foreground: string
    card: string
    cardForeground: string
    primary: string
    primaryForeground: string
    secondary: string
    secondaryForeground: string
    muted: string
    mutedForeground: string
    accent: string
    accentForeground: string
    border: string
    ring: string
  }
}

/**
 * Compact palette definition -> expanded SiteTheme. Keeps the catalog readable
 * while still producing the full token set the template consumes.
 */
type Def = {
  id: string
  name: string
  description: string
  mood: ThemeMood
  dark?: boolean
  radius: string
  fonts: FontPair
  bg: string
  fg: string
  card: string
  primary: string
  primaryFg: string
  accent: string
  accentFg: string
  muted: string
  mutedFg: string
  border: string
}

function expand(d: Def): SiteTheme {
  return {
    id: d.id,
    name: d.name,
    description: d.description,
    mood: d.mood,
    dark: Boolean(d.dark),
    fonts: d.fonts,
    radius: d.radius,
    colors: {
      background: d.bg,
      foreground: d.fg,
      card: d.card,
      cardForeground: d.fg,
      primary: d.primary,
      primaryForeground: d.primaryFg,
      secondary: d.muted,
      secondaryForeground: d.fg,
      muted: d.muted,
      mutedForeground: d.mutedFg,
      accent: d.accent,
      accentForeground: d.accentFg,
      border: d.border,
      ring: d.primary,
    },
  }
}

const SANS = (h: string, b = h): FontPair => ({ heading: h, body: b })

const DEFS: Def[] = [
  // ---- Minimal / neutral -------------------------------------------------
  {
    id: 'nordic-minimal',
    name: 'Nordic Minimal',
    description: 'Clean, airy, lots of whitespace, muted neutrals — Scandinavian/SaaS feel.',
    mood: 'minimal',
    radius: '0.5rem',
    fonts: SANS('Inter'),
    bg: 'oklch(99% 0 0deg)',
    fg: 'oklch(20% 0.01 250deg)',
    card: 'oklch(97.5% 0.003 250deg)',
    primary: 'oklch(45% 0.02 250deg)',
    primaryFg: 'oklch(99% 0 0deg)',
    accent: 'oklch(93% 0.02 250deg)',
    accentFg: 'oklch(25% 0.02 250deg)',
    muted: 'oklch(96% 0.004 250deg)',
    mutedFg: 'oklch(50% 0.01 250deg)',
    border: 'oklch(90% 0.005 250deg)',
  },
  {
    id: 'paper-mono',
    name: 'Paper Mono',
    description: 'Editorial black-on-paper, monospace accents, magazine/portfolio vibe.',
    mood: 'minimal',
    radius: '0.25rem',
    fonts: { heading: 'Space Grotesk', body: 'Inter' },
    bg: 'oklch(98.5% 0.005 90deg)',
    fg: 'oklch(18% 0.01 60deg)',
    card: 'oklch(96% 0.008 90deg)',
    primary: 'oklch(22% 0.01 60deg)',
    primaryFg: 'oklch(98% 0.005 90deg)',
    accent: 'oklch(90% 0.03 90deg)',
    accentFg: 'oklch(25% 0.02 60deg)',
    muted: 'oklch(95% 0.008 90deg)',
    mutedFg: 'oklch(45% 0.01 60deg)',
    border: 'oklch(88% 0.01 80deg)',
  },
  // ---- Tech / SaaS -------------------------------------------------------
  {
    id: 'electric-indigo',
    name: 'Electric Indigo',
    description: 'Vibrant indigo/violet, modern SaaS & AI product look, energetic.',
    mood: 'tech',
    radius: '0.75rem',
    fonts: { heading: 'Sora', body: 'Inter' },
    bg: 'oklch(99% 0.003 280deg)',
    fg: 'oklch(20% 0.03 280deg)',
    card: 'oklch(97% 0.01 280deg)',
    primary: 'oklch(54% 0.24 280deg)',
    primaryFg: 'oklch(99% 0 0deg)',
    accent: 'oklch(92% 0.06 280deg)',
    accentFg: 'oklch(35% 0.18 280deg)',
    muted: 'oklch(96% 0.015 280deg)',
    mutedFg: 'oklch(50% 0.04 280deg)',
    border: 'oklch(90% 0.02 280deg)',
  },
  {
    id: 'cyber-night',
    name: 'Cyber Night',
    description: 'Dark UI with neon cyan/green accents, developer-tool / fintech energy.',
    mood: 'tech',
    dark: true,
    radius: '0.5rem',
    fonts: { heading: 'Space Grotesk', body: 'Inter' },
    bg: 'oklch(16% 0.02 260deg)',
    fg: 'oklch(96% 0.01 200deg)',
    card: 'oklch(20% 0.025 260deg)',
    primary: 'oklch(80% 0.18 175deg)',
    primaryFg: 'oklch(16% 0.02 260deg)',
    accent: 'oklch(28% 0.06 200deg)',
    accentFg: 'oklch(90% 0.1 190deg)',
    muted: 'oklch(24% 0.03 260deg)',
    mutedFg: 'oklch(70% 0.02 220deg)',
    border: 'oklch(30% 0.03 260deg)',
  },
  {
    id: 'ocean-breeze',
    name: 'Ocean Breeze',
    description: 'Fresh teal/sky blues, trustworthy & calm, great for health/SaaS/travel.',
    mood: 'corporate',
    radius: '0.75rem',
    fonts: SANS('Manrope'),
    bg: 'oklch(99% 0.005 220deg)',
    fg: 'oklch(22% 0.03 230deg)',
    card: 'oklch(97% 0.012 215deg)',
    primary: 'oklch(58% 0.13 215deg)',
    primaryFg: 'oklch(99% 0 0deg)',
    accent: 'oklch(92% 0.05 200deg)',
    accentFg: 'oklch(35% 0.1 215deg)',
    muted: 'oklch(96% 0.015 210deg)',
    mutedFg: 'oklch(50% 0.03 220deg)',
    border: 'oklch(90% 0.02 210deg)',
  },
  // ---- Corporate / trust -------------------------------------------------
  {
    id: 'corporate-navy',
    name: 'Corporate Navy',
    description: 'Deep navy + steel, dependable B2B / consulting / finance.',
    mood: 'corporate',
    radius: '0.375rem',
    fonts: { heading: 'Libre Franklin', body: 'Inter' },
    bg: 'oklch(99% 0.002 250deg)',
    fg: 'oklch(22% 0.04 255deg)',
    card: 'oklch(97% 0.008 250deg)',
    primary: 'oklch(38% 0.09 255deg)',
    primaryFg: 'oklch(99% 0 0deg)',
    accent: 'oklch(90% 0.04 250deg)',
    accentFg: 'oklch(30% 0.08 255deg)',
    muted: 'oklch(96% 0.01 250deg)',
    mutedFg: 'oklch(48% 0.03 255deg)',
    border: 'oklch(89% 0.015 250deg)',
  },
  {
    id: 'emerald-trust',
    name: 'Emerald Trust',
    description: 'Confident emerald greens, finance/sustainability/agritech.',
    mood: 'corporate',
    radius: '0.5rem',
    fonts: SANS('Plus Jakarta Sans'),
    bg: 'oklch(99% 0.004 150deg)',
    fg: 'oklch(20% 0.03 160deg)',
    card: 'oklch(97% 0.012 150deg)',
    primary: 'oklch(52% 0.13 160deg)',
    primaryFg: 'oklch(99% 0 0deg)',
    accent: 'oklch(92% 0.06 150deg)',
    accentFg: 'oklch(33% 0.1 160deg)',
    muted: 'oklch(96% 0.015 150deg)',
    mutedFg: 'oklch(48% 0.03 160deg)',
    border: 'oklch(90% 0.02 150deg)',
  },
  // ---- Bold / energetic --------------------------------------------------
  {
    id: 'sunset-coral',
    name: 'Sunset Coral',
    description: 'Warm coral-to-orange, lively D2C lifestyle & food brands.',
    mood: 'bold',
    radius: '1rem',
    fonts: { heading: 'Poppins', body: 'Inter' },
    bg: 'oklch(99% 0.008 40deg)',
    fg: 'oklch(24% 0.04 30deg)',
    card: 'oklch(97% 0.02 40deg)',
    primary: 'oklch(65% 0.2 35deg)',
    primaryFg: 'oklch(99% 0 0deg)',
    accent: 'oklch(93% 0.07 50deg)',
    accentFg: 'oklch(40% 0.15 35deg)',
    muted: 'oklch(96% 0.02 45deg)',
    mutedFg: 'oklch(52% 0.05 35deg)',
    border: 'oklch(90% 0.03 45deg)',
  },
  {
    id: 'magenta-pop',
    name: 'Magenta Pop',
    description: 'Punchy magenta/pink, creative agencies, beauty, events.',
    mood: 'playful',
    radius: '1.25rem',
    fonts: { heading: 'Clash Display', body: 'Inter' },
    bg: 'oklch(99% 0.006 330deg)',
    fg: 'oklch(22% 0.04 330deg)',
    card: 'oklch(97% 0.02 330deg)',
    primary: 'oklch(60% 0.24 350deg)',
    primaryFg: 'oklch(99% 0 0deg)',
    accent: 'oklch(93% 0.08 330deg)',
    accentFg: 'oklch(40% 0.18 350deg)',
    muted: 'oklch(96% 0.02 330deg)',
    mutedFg: 'oklch(52% 0.06 340deg)',
    border: 'oklch(90% 0.03 330deg)',
  },
  {
    id: 'citrus-punch',
    name: 'Citrus Punch',
    description: 'Bright lime/yellow energy, sports, youth, fitness, snacks.',
    mood: 'playful',
    radius: '1rem',
    fonts: { heading: 'Outfit', body: 'Inter' },
    bg: 'oklch(99% 0.01 110deg)',
    fg: 'oklch(22% 0.04 120deg)',
    card: 'oklch(97% 0.03 110deg)',
    primary: 'oklch(72% 0.18 130deg)',
    primaryFg: 'oklch(18% 0.03 130deg)',
    accent: 'oklch(93% 0.1 110deg)',
    accentFg: 'oklch(35% 0.12 130deg)',
    muted: 'oklch(96% 0.03 110deg)',
    mutedFg: 'oklch(48% 0.05 125deg)',
    border: 'oklch(90% 0.04 115deg)',
  },
  // ---- Elegant / luxury --------------------------------------------------
  {
    id: 'noir-luxe',
    name: 'Noir Luxe',
    description: 'Black & gold luxury, premium fashion, jewelry, hospitality.',
    mood: 'luxury',
    dark: true,
    radius: '0.25rem',
    fonts: { heading: 'Playfair Display', body: 'Inter' },
    bg: 'oklch(16% 0.005 60deg)',
    fg: 'oklch(95% 0.01 80deg)',
    card: 'oklch(20% 0.008 60deg)',
    primary: 'oklch(80% 0.12 85deg)',
    primaryFg: 'oklch(16% 0.005 60deg)',
    accent: 'oklch(28% 0.02 70deg)',
    accentFg: 'oklch(85% 0.1 85deg)',
    muted: 'oklch(24% 0.008 60deg)',
    mutedFg: 'oklch(72% 0.02 75deg)',
    border: 'oklch(32% 0.01 65deg)',
  },
  {
    id: 'champagne-serif',
    name: 'Champagne Serif',
    description: 'Soft champagne neutrals + serif headings, refined beauty/wellness.',
    mood: 'elegant',
    radius: '0.5rem',
    fonts: { heading: 'Cormorant Garamond', body: 'Inter' },
    bg: 'oklch(98% 0.01 70deg)',
    fg: 'oklch(25% 0.02 50deg)',
    card: 'oklch(95.5% 0.02 70deg)',
    primary: 'oklch(55% 0.06 50deg)',
    primaryFg: 'oklch(98% 0.01 70deg)',
    accent: 'oklch(91% 0.04 70deg)',
    accentFg: 'oklch(35% 0.05 50deg)',
    muted: 'oklch(94% 0.02 70deg)',
    mutedFg: 'oklch(50% 0.03 55deg)',
    border: 'oklch(88% 0.02 65deg)',
  },
  {
    id: 'royal-plum',
    name: 'Royal Plum',
    description: 'Rich plum/purple with serif, premium services, spa, boutique.',
    mood: 'luxury',
    radius: '0.625rem',
    fonts: { heading: 'Fraunces', body: 'Inter' },
    bg: 'oklch(99% 0.004 320deg)',
    fg: 'oklch(22% 0.05 320deg)',
    card: 'oklch(97% 0.012 320deg)',
    primary: 'oklch(42% 0.13 320deg)',
    primaryFg: 'oklch(99% 0 0deg)',
    accent: 'oklch(92% 0.05 320deg)',
    accentFg: 'oklch(35% 0.1 320deg)',
    muted: 'oklch(96% 0.015 320deg)',
    mutedFg: 'oklch(50% 0.04 320deg)',
    border: 'oklch(90% 0.02 320deg)',
  },
  // ---- Organic / earthy --------------------------------------------------
  {
    id: 'terracotta-earth',
    name: 'Terracotta Earth',
    description: 'Warm terracotta & clay, artisanal, ceramics, home goods, coffee.',
    mood: 'organic',
    radius: '0.875rem',
    fonts: { heading: 'Fraunces', body: 'Inter' },
    bg: 'oklch(98% 0.012 50deg)',
    fg: 'oklch(28% 0.04 40deg)',
    card: 'oklch(95% 0.025 50deg)',
    primary: 'oklch(55% 0.13 40deg)',
    primaryFg: 'oklch(98% 0.01 50deg)',
    accent: 'oklch(90% 0.05 55deg)',
    accentFg: 'oklch(38% 0.1 40deg)',
    muted: 'oklch(94% 0.02 52deg)',
    mutedFg: 'oklch(50% 0.04 45deg)',
    border: 'oklch(88% 0.03 50deg)',
  },
  {
    id: 'sage-botanical',
    name: 'Sage Botanical',
    description: 'Soft sage greens, natural cosmetics, tea, plants, sustainability.',
    mood: 'organic',
    radius: '1rem',
    fonts: SANS('Nunito Sans'),
    bg: 'oklch(98.5% 0.01 140deg)',
    fg: 'oklch(26% 0.03 150deg)',
    card: 'oklch(96% 0.02 140deg)',
    primary: 'oklch(56% 0.08 150deg)',
    primaryFg: 'oklch(99% 0 0deg)',
    accent: 'oklch(91% 0.05 140deg)',
    accentFg: 'oklch(36% 0.07 150deg)',
    muted: 'oklch(95% 0.02 140deg)',
    mutedFg: 'oklch(50% 0.03 150deg)',
    border: 'oklch(89% 0.025 140deg)',
  },
  {
    id: 'desert-sand',
    name: 'Desert Sand',
    description: 'Sandy beige + warm brown, travel, hospitality, leather, outdoors.',
    mood: 'organic',
    radius: '0.625rem',
    fonts: { heading: 'Bricolage Grotesque', body: 'Inter' },
    bg: 'oklch(97.5% 0.012 80deg)',
    fg: 'oklch(27% 0.03 60deg)',
    card: 'oklch(95% 0.02 80deg)',
    primary: 'oklch(50% 0.07 60deg)',
    primaryFg: 'oklch(98% 0.01 80deg)',
    accent: 'oklch(90% 0.05 80deg)',
    accentFg: 'oklch(37% 0.06 60deg)',
    muted: 'oklch(94% 0.02 80deg)',
    mutedFg: 'oklch(50% 0.03 65deg)',
    border: 'oklch(88% 0.025 75deg)',
  },
  // ---- More tech / modern ------------------------------------------------
  {
    id: 'graphite-slate',
    name: 'Graphite Slate',
    description: 'Cool graphite neutrals with a blue spark, modern hardware/industrial.',
    mood: 'tech',
    radius: '0.5rem',
    fonts: SANS('Geist'),
    bg: 'oklch(99% 0 0deg)',
    fg: 'oklch(20% 0.01 250deg)',
    card: 'oklch(97% 0.004 250deg)',
    primary: 'oklch(48% 0.16 255deg)',
    primaryFg: 'oklch(99% 0 0deg)',
    accent: 'oklch(92% 0.03 250deg)',
    accentFg: 'oklch(33% 0.12 255deg)',
    muted: 'oklch(96% 0.006 250deg)',
    mutedFg: 'oklch(50% 0.015 250deg)',
    border: 'oklch(90% 0.008 250deg)',
  },
  {
    id: 'midnight-aurora',
    name: 'Midnight Aurora',
    description: 'Dark indigo background with aurora purple/pink, premium AI/SaaS.',
    mood: 'tech',
    dark: true,
    radius: '1rem',
    fonts: { heading: 'Sora', body: 'Inter' },
    bg: 'oklch(17% 0.03 280deg)',
    fg: 'oklch(96% 0.01 300deg)',
    card: 'oklch(21% 0.04 285deg)',
    primary: 'oklch(70% 0.2 310deg)',
    primaryFg: 'oklch(17% 0.03 280deg)',
    accent: 'oklch(30% 0.08 290deg)',
    accentFg: 'oklch(90% 0.08 310deg)',
    muted: 'oklch(25% 0.04 285deg)',
    mutedFg: 'oklch(74% 0.03 300deg)',
    border: 'oklch(32% 0.05 285deg)',
  },
  {
    id: 'crimson-edge',
    name: 'Crimson Edge',
    description: 'Bold red/crimson on white, automotive, gaming, sports gear.',
    mood: 'bold',
    radius: '0.375rem',
    fonts: { heading: 'Archivo', body: 'Inter' },
    bg: 'oklch(99% 0.003 20deg)',
    fg: 'oklch(20% 0.02 20deg)',
    card: 'oklch(97% 0.008 20deg)',
    primary: 'oklch(55% 0.22 25deg)',
    primaryFg: 'oklch(99% 0 0deg)',
    accent: 'oklch(92% 0.05 25deg)',
    accentFg: 'oklch(38% 0.16 25deg)',
    muted: 'oklch(96% 0.01 20deg)',
    mutedFg: 'oklch(48% 0.03 20deg)',
    border: 'oklch(90% 0.015 20deg)',
  },
  {
    id: 'arctic-frost',
    name: 'Arctic Frost',
    description: 'Icy blue-white, ultra-clean, medical, dental, lab, devices.',
    mood: 'minimal',
    radius: '0.75rem',
    fonts: SANS('Inter'),
    bg: 'oklch(99.5% 0.003 230deg)',
    fg: 'oklch(24% 0.02 235deg)',
    card: 'oklch(98% 0.008 225deg)',
    primary: 'oklch(60% 0.1 235deg)',
    primaryFg: 'oklch(99% 0 0deg)',
    accent: 'oklch(94% 0.03 225deg)',
    accentFg: 'oklch(38% 0.08 235deg)',
    muted: 'oklch(97% 0.008 228deg)',
    mutedFg: 'oklch(52% 0.02 235deg)',
    border: 'oklch(92% 0.01 228deg)',
  },
  {
    id: 'honey-amber',
    name: 'Honey Amber',
    description: 'Golden amber warmth, bakeries, honey, craft beer, woodwork.',
    mood: 'organic',
    radius: '0.875rem',
    fonts: { heading: 'Bricolage Grotesque', body: 'Inter' },
    bg: 'oklch(98.5% 0.012 85deg)',
    fg: 'oklch(26% 0.04 70deg)',
    card: 'oklch(96% 0.025 85deg)',
    primary: 'oklch(68% 0.15 75deg)',
    primaryFg: 'oklch(20% 0.04 70deg)',
    accent: 'oklch(92% 0.06 85deg)',
    accentFg: 'oklch(38% 0.1 75deg)',
    muted: 'oklch(95% 0.02 85deg)',
    mutedFg: 'oklch(50% 0.04 75deg)',
    border: 'oklch(89% 0.03 82deg)',
  },
  {
    id: 'rose-quartz',
    name: 'Rose Quartz',
    description: 'Gentle blush pinks, soft & feminine, beauty, baby, lifestyle.',
    mood: 'elegant',
    radius: '1.25rem',
    fonts: { heading: 'Fraunces', body: 'Inter' },
    bg: 'oklch(99% 0.006 10deg)',
    fg: 'oklch(28% 0.03 10deg)',
    card: 'oklch(97.5% 0.015 10deg)',
    primary: 'oklch(70% 0.12 10deg)',
    primaryFg: 'oklch(99% 0 0deg)',
    accent: 'oklch(94% 0.04 10deg)',
    accentFg: 'oklch(42% 0.1 10deg)',
    muted: 'oklch(97% 0.012 10deg)',
    mutedFg: 'oklch(54% 0.03 10deg)',
    border: 'oklch(92% 0.02 10deg)',
  },
  {
    id: 'forest-deep',
    name: 'Forest Deep',
    description: 'Deep forest green, dark and premium, whisky, outdoor, heritage.',
    mood: 'luxury',
    dark: true,
    radius: '0.5rem',
    fonts: { heading: 'Playfair Display', body: 'Inter' },
    bg: 'oklch(20% 0.03 155deg)',
    fg: 'oklch(95% 0.01 130deg)',
    card: 'oklch(24% 0.035 155deg)',
    primary: 'oklch(75% 0.12 130deg)',
    primaryFg: 'oklch(20% 0.03 155deg)',
    accent: 'oklch(30% 0.05 150deg)',
    accentFg: 'oklch(88% 0.08 130deg)',
    muted: 'oklch(27% 0.03 155deg)',
    mutedFg: 'oklch(74% 0.02 140deg)',
    border: 'oklch(34% 0.03 152deg)',
  },
  {
    id: 'mono-brutalist',
    name: 'Mono Brutalist',
    description: 'High-contrast black/white, sharp corners, bold type — design studios.',
    mood: 'bold',
    radius: '0rem',
    fonts: { heading: 'Space Grotesk', body: 'Space Grotesk' },
    bg: 'oklch(99% 0 0deg)',
    fg: 'oklch(12% 0 0deg)',
    card: 'oklch(96% 0 0deg)',
    primary: 'oklch(12% 0 0deg)',
    primaryFg: 'oklch(99% 0 0deg)',
    accent: 'oklch(90% 0 0deg)',
    accentFg: 'oklch(12% 0 0deg)',
    muted: 'oklch(95% 0 0deg)',
    mutedFg: 'oklch(40% 0 0deg)',
    border: 'oklch(12% 0 0deg)',
  },
  {
    id: 'pastel-soft',
    name: 'Pastel Soft',
    description: 'Multi-pastel, friendly and approachable, kids, edtech, stationery.',
    mood: 'playful',
    radius: '1.5rem',
    fonts: { heading: 'Quicksand', body: 'Nunito Sans' },
    bg: 'oklch(99% 0.006 250deg)',
    fg: 'oklch(30% 0.03 260deg)',
    card: 'oklch(97% 0.02 270deg)',
    primary: 'oklch(70% 0.12 270deg)',
    primaryFg: 'oklch(99% 0 0deg)',
    accent: 'oklch(93% 0.05 200deg)',
    accentFg: 'oklch(40% 0.08 270deg)',
    muted: 'oklch(96% 0.02 280deg)',
    mutedFg: 'oklch(54% 0.03 270deg)',
    border: 'oklch(92% 0.02 270deg)',
  },
  {
    id: 'steel-industrial',
    name: 'Steel Industrial',
    description: 'Cool steel grey + safety orange, manufacturing, logistics, B2B.',
    mood: 'corporate',
    radius: '0.25rem',
    fonts: { heading: 'Archivo', body: 'Inter' },
    bg: 'oklch(98% 0.003 230deg)',
    fg: 'oklch(24% 0.01 240deg)',
    card: 'oklch(95.5% 0.006 230deg)',
    primary: 'oklch(38% 0.02 240deg)',
    primaryFg: 'oklch(99% 0 0deg)',
    accent: 'oklch(70% 0.18 55deg)',
    accentFg: 'oklch(20% 0.04 50deg)',
    muted: 'oklch(95% 0.006 230deg)',
    mutedFg: 'oklch(48% 0.012 240deg)',
    border: 'oklch(88% 0.008 235deg)',
  },
  {
    id: 'lavender-calm',
    name: 'Lavender Calm',
    description: 'Soothing lavender/lilac, wellness, meditation, therapy, SaaS.',
    mood: 'elegant',
    radius: '1rem',
    fonts: SANS('Plus Jakarta Sans'),
    bg: 'oklch(99% 0.005 300deg)',
    fg: 'oklch(26% 0.03 300deg)',
    card: 'oklch(97% 0.015 300deg)',
    primary: 'oklch(58% 0.12 300deg)',
    primaryFg: 'oklch(99% 0 0deg)',
    accent: 'oklch(93% 0.04 300deg)',
    accentFg: 'oklch(38% 0.09 300deg)',
    muted: 'oklch(96% 0.015 300deg)',
    mutedFg: 'oklch(52% 0.03 300deg)',
    border: 'oklch(91% 0.02 300deg)',
  },
  {
    id: 'teal-modern',
    name: 'Teal Modern',
    description: 'Confident teal + charcoal, modern professional services, agencies.',
    mood: 'corporate',
    radius: '0.625rem',
    fonts: SANS('Manrope'),
    bg: 'oklch(99% 0.004 190deg)',
    fg: 'oklch(22% 0.03 200deg)',
    card: 'oklch(97% 0.012 190deg)',
    primary: 'oklch(52% 0.11 195deg)',
    primaryFg: 'oklch(99% 0 0deg)',
    accent: 'oklch(92% 0.05 190deg)',
    accentFg: 'oklch(34% 0.09 195deg)',
    muted: 'oklch(96% 0.015 190deg)',
    mutedFg: 'oklch(50% 0.03 195deg)',
    border: 'oklch(90% 0.02 190deg)',
  },
  {
    id: 'obsidian-mono',
    name: 'Obsidian Mono',
    description: 'Pure dark, white text, minimal accents — sleek premium electronics.',
    mood: 'minimal',
    dark: true,
    radius: '0.5rem',
    fonts: SANS('Geist'),
    bg: 'oklch(15% 0 0deg)',
    fg: 'oklch(97% 0 0deg)',
    card: 'oklch(19% 0 0deg)',
    primary: 'oklch(97% 0 0deg)',
    primaryFg: 'oklch(15% 0 0deg)',
    accent: 'oklch(26% 0 0deg)',
    accentFg: 'oklch(95% 0 0deg)',
    muted: 'oklch(23% 0 0deg)',
    mutedFg: 'oklch(70% 0 0deg)',
    border: 'oklch(28% 0 0deg)',
  },
  {
    id: 'mint-fresh',
    name: 'Mint Fresh',
    description: 'Crisp mint green + white, clean food, dental, eco, fintech.',
    mood: 'minimal',
    radius: '0.875rem',
    fonts: SANS('Outfit'),
    bg: 'oklch(99.5% 0.006 165deg)',
    fg: 'oklch(24% 0.03 170deg)',
    card: 'oklch(97.5% 0.015 165deg)',
    primary: 'oklch(64% 0.13 165deg)',
    primaryFg: 'oklch(99% 0 0deg)',
    accent: 'oklch(93% 0.06 165deg)',
    accentFg: 'oklch(36% 0.1 165deg)',
    muted: 'oklch(97% 0.015 165deg)',
    mutedFg: 'oklch(52% 0.03 165deg)',
    border: 'oklch(92% 0.02 165deg)',
  },
  {
    id: 'cobalt-power',
    name: 'Cobalt Power',
    description: 'Strong cobalt blue, enterprise software, security, cloud, telecom.',
    mood: 'corporate',
    radius: '0.5rem',
    fonts: SANS('Inter'),
    bg: 'oklch(99% 0.003 255deg)',
    fg: 'oklch(20% 0.03 260deg)',
    card: 'oklch(97% 0.01 255deg)',
    primary: 'oklch(50% 0.2 260deg)',
    primaryFg: 'oklch(99% 0 0deg)',
    accent: 'oklch(92% 0.05 255deg)',
    accentFg: 'oklch(34% 0.14 260deg)',
    muted: 'oklch(96% 0.012 255deg)',
    mutedFg: 'oklch(50% 0.03 260deg)',
    border: 'oklch(90% 0.015 255deg)',
  },
]

export const THEMES: SiteTheme[] = DEFS.map(expand)

export const DEFAULT_THEME_ID = 'electric-indigo'

export function getTheme(id?: string | null): SiteTheme {
  return THEMES.find((t) => t.id === id) || THEMES.find((t) => t.id === DEFAULT_THEME_ID) || THEMES[0]
}

/** Theme catalog summarized for the AI prompt (id + when to use it). */
export function themeCatalogForPrompt(): string {
  return THEMES.map((t) => `- ${t.id} (${t.mood}): ${t.description}`).join('\n')
}

/**
 * Builds the CSS variable overrides for a theme, applied on a wrapper element so
 * the standard blocks inherit the new look. Returns a React style object.
 */
export function themeCssVars(theme: SiteTheme): Record<string, string> {
  const c = theme.colors
  return {
    '--background': c.background,
    '--foreground': c.foreground,
    '--card': c.card,
    '--card-foreground': c.cardForeground,
    '--popover': c.card,
    '--popover-foreground': c.cardForeground,
    '--primary': c.primary,
    '--primary-foreground': c.primaryForeground,
    '--secondary': c.secondary,
    '--secondary-foreground': c.secondaryForeground,
    '--muted': c.muted,
    '--muted-foreground': c.mutedForeground,
    '--accent': c.accent,
    '--accent-foreground': c.accentForeground,
    '--border': c.border,
    '--input': c.border,
    '--ring': c.ring,
    '--radius': theme.radius,
    'backgroundColor': 'var(--background)',
    'color': 'var(--foreground)',
  }
}

/** Unique Google font families used across all themes (for font loading). */
export function allFontFamilies(): string[] {
  const set = new Set<string>()
  for (const t of THEMES) {
    set.add(t.fonts.heading)
    set.add(t.fonts.body)
  }
  return Array.from(set)
}
