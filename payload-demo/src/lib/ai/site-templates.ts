/**
 * Landing-template library ("template mode").
 *
 * Distinct from the abstract archetypes in `templates.ts` (which only describe a
 * page/section *kind* blueprint for the creative agent), this module ships
 * concrete, visually-finished landing-page templates adapted from high-star
 * open-source projects (Vercel Commerce, Cruip, shadcn landing, ScrewFast, …).
 *
 * Each template is a self-contained full-page React component authored as a JSX
 * string. It is rendered in the same runtime sandbox as creative-mode JSX
 * (`jsx-sandbox.ts`) and receives three props:
 *   - `theme`   — the resolved SiteTheme (colors / fonts / radius / dark)
 *   - `images`  — resolved image URLs by index
 *   - `content` — the structured copy the fill agent produced (see
 *                 `TEMPLATE_CONTENT_SCHEMA`), including an `_img` map of slot →
 *                 image index.
 *
 * Template mode flow: user picks a template → the fill agent maps the brief into
 * `content` (copy) and assigns images (user uploads first, gpt-image-2 for the
 * gaps) → `buildTemplateSpec` wraps it into a chromeless SiteSpec that renders
 * only this component.
 */

import type { SiteSpec, SpecSection } from './site-spec'

export type TemplateImageSlot = {
  /** key referenced inside the template JSX via content._img[key] */
  key: string
  /** human description used as the gpt-image-2 prompt seed for this slot */
  purpose: string
  /** decorative slots are always AI-generated even if the user uploaded images */
  decorative?: boolean
}

export type TemplateSource = {
  repo: string
  url: string
  stars: number
  author: string
}

export type LandingTemplate = {
  id: string
  name: string
  /** short category label shown in the picker */
  category: string
  /** one-line "what it's for", shown in the picker + fed to the agent */
  description: string
  source: TemplateSource
  /** default theme id that matches the template's original look */
  themeId: string
  /** design family id (mostly cosmetic here; templates own their layout) */
  designId?: string
  /** ordered image slots; index in this array maps to the resolved image index */
  imageSlots: TemplateImageSlot[]
  /** placeholder copy so the template previews before any fill */
  placeholder: TemplateContent
  /** the full-page component, authored as a JSX string */
  code: string
}

/** Loose structured copy the fill agent produces; templates read what they use. */
export type TemplateContent = {
  brand?: string
  nav?: { label: string; href: string }[]
  hero?: {
    eyebrow?: string
    title?: string
    subtitle?: string
    primaryCta?: { label: string; href: string }
    secondaryCta?: { label: string; href: string }
    badges?: string[]
  }
  logos?: string[]
  stats?: { value: string; label: string }[]
  features?: {
    title?: string
    subtitle?: string
    items?: { icon?: string; title: string; body: string }[]
  }
  showcase?: {
    title?: string
    body?: string
    bullets?: string[]
    cta?: { label: string; href: string }
  }
  gallery?: { title?: string; subtitle?: string }
  testimonials?: { quote: string; name: string; role?: string }[]
  faq?: { q: string; a: string }[]
  pricing?: {
    name: string
    price: string
    period?: string
    features: string[]
    cta?: { label: string; href: string }
    highlighted?: boolean
  }[]
  cta?: { title?: string; body?: string; button?: { label: string; href: string } }
  footer?: { tagline?: string; copyright?: string }
  /** slot key → index into the resolved images array; filled by the pipeline */
  _img?: Record<string, number>
  [k: string]: unknown
}

/* -------------------------------------------------------------------------- */
/* Shared authoring preamble injected at the top of every template component.  */
/* Keep this free of backticks/${} so the JSX strings stay simple.            */
/* -------------------------------------------------------------------------- */

const PREAMBLE = [
  'var c = theme.colors;',
  'var dark = theme.dark;',
  'var co = content || {};',
  'var _img = co._img || {};',
  "var pic = function(k){ return images[_img[k]] || images[0] || ''; };",
  "var mix = function(col, p){ return 'color-mix(in oklab, ' + col + ' ' + p + '%, transparent)'; };",
  'var heading = "\'" + theme.fonts.heading + "\', system-ui, sans-serif";',
  'var bodyFont = "\'" + theme.fonts.body + "\', system-ui, sans-serif";',
  'var arr = function(v){ return Array.isArray(v) ? v : []; };',
  "var t = function(v, d){ return (v === undefined || v === null || v === '') ? (d || '') : v; };",
  'var hero = co.hero || {};',
  'var feat = co.features || {};',
  'var show = co.showcase || {};',
  'var cta = co.cta || {};',
  'var nav = arr(co.nav);',
  'var brand = t(co.brand, theme.name);',
].join('\n')

/** Wrap a template body (`return (...)`) into a sandbox-ready component string. */
function makeComponent(body: string): string {
  return (
    'function LandingPage({ theme, images, content }) {\n' +
    PREAMBLE +
    '\n' +
    body +
    '\n}'
  )
}

/* -------------------------------------------------------------------------- */
/* Spec builder                                                                */
/* -------------------------------------------------------------------------- */

function slugify(input: string): string {
  return (
    (input || '')
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'site'
  )
}

/**
 * Round-robin assignment of available images to a template's slots. Non-
 * decorative slots take real images first; the pipeline overrides this with a
 * mix of user uploads + generated images, but this keeps previews sensible.
 */
export function defaultImageMap(t: LandingTemplate, imageCount: number): Record<string, number> {
  const map: Record<string, number> = {}
  const n = Math.max(imageCount, 1)
  t.imageSlots.forEach((slot, i) => {
    map[slot.key] = i % n
  })
  return map
}

/**
 * Build a complete, chromeless SiteSpec from a template + filled content. The
 * resulting spec renders ONLY the template component (it provides its own nav +
 * footer), with a minimal themed fallback if the JSX ever fails to compile.
 */
export function buildTemplateSpec(template: LandingTemplate, content: TemplateContent): SiteSpec {
  const brand = content.brand || template.placeholder.brand || template.name
  const title = `${brand}`
  const description =
    content.hero?.subtitle || content.footer?.tagline || template.description || brand

  const primary = content.hero?.primaryCta
  const fallback: SpecSection = {
    kind: 'cta',
    heading: brand,
    body: content.hero?.subtitle || template.description,
    cta: primary ? { label: primary.label, url: primary.href } : { label: 'Learn more', url: '#' },
  }

  const section: SpecSection = {
    kind: 'jsx',
    code: template.code,
    source: `template:${template.id}`,
    content: content as Record<string, unknown>,
    fallback,
  }

  return {
    siteName: brand,
    slug: `${slugify(brand)}-${Date.now().toString(36)}`,
    tagline: content.footer?.tagline || content.hero?.eyebrow,
    themeId: template.themeId,
    designId: template.designId || 'minimal-clean',
    chrome: 'none',
    templateRef: template.id,
    pages: [
      {
        path: '',
        navLabel: 'Home',
        sections: [section],
        meta: { title, description },
      },
    ],
    meta: { title, description },
  }
}

/* -------------------------------------------------------------------------- */
/* Fill prompt helpers                                                         */
/* -------------------------------------------------------------------------- */

/** JSON shape (described in prose) the fill agent must return. */
export const TEMPLATE_CONTENT_SCHEMA = `Return ONLY a JSON object with this shape (omit fields the template doesn't need; keep arrays short and punchy):
{
  "brand": string,                         // brand / site name
  "nav": [{ "label": string, "href": "#anchor" }],   // 3-5 nav links to in-page anchors
  "hero": {
    "eyebrow": string,                     // tiny kicker above the title (optional)
    "title": string,                       // 4-9 words, the main headline
    "subtitle": string,                    // 1-2 sentences
    "primaryCta": { "label": string, "href": "#" },
    "secondaryCta": { "label": string, "href": "#" },
    "badges": [string]                     // 2-4 short trust chips (optional)
  },
  "logos": [string],                       // 4-6 short partner/feature words (trust strip)
  "stats": [{ "value": string, "label": string }],   // 3-4 metrics
  "features": {
    "title": string, "subtitle": string,
    "items": [{ "icon": string, "title": string, "body": string }]  // 3-6; icon = a lucide-react icon name
  },
  "showcase": {
    "title": string, "body": string,
    "bullets": [string],                   // 3-4 short benefit lines
    "cta": { "label": string, "href": "#" }
  },
  "gallery": { "title": string, "subtitle": string },
  "testimonials": [{ "quote": string, "name": string, "role": string }],  // 1-3
  "faq": [{ "q": string, "a": string }],   // 3-5
  "pricing": [{ "name": string, "price": string, "period": string, "features": [string], "cta": { "label": string, "href": "#" }, "highlighted": boolean }],
  "cta": { "title": string, "body": string, "button": { "label": string, "href": "#" } },
  "footer": { "tagline": string, "copyright": string }
}
Write all human-readable copy in {LANGUAGE}. Use real, specific, on-brand copy — never lorem ipsum or placeholder text. "icon" values must be valid lucide-react icon names (e.g. "Sparkles", "ShieldCheck", "Zap", "Leaf", "Truck").`

/** Describe a template's image slots for the fill/image step. */
export function imageSlotBrief(template: LandingTemplate): string {
  return template.imageSlots
    .map((s, i) => `  ${i}. ${s.key}${s.decorative ? ' (decorative)' : ''} — ${s.purpose}`)
    .join('\n')
}

/* -------------------------------------------------------------------------- */
/* Templates                                                                   */
/* -------------------------------------------------------------------------- */

/* ---- shared snippet bodies ---------------------------------------------- */

const NAV = `
<header className="sticky top-0 z-50 w-full backdrop-blur-md" style={{ background: mix(c.background, 82), borderBottom: "1px solid " + mix(c.border, 70) }}>
  <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
    <span className="text-lg font-extrabold tracking-tight" style={{ fontFamily: heading, color: c.foreground }}>{brand}</span>
    <nav className="hidden items-center gap-8 md:flex">
      {nav.map(function(n, i){ return (<a key={i} href={t(n.href, "#")} className="text-sm font-medium transition-opacity hover:opacity-60" style={{ color: mix(c.foreground, 78) }}>{n.label}</a>); })}
    </nav>
    <a href={t((hero.primaryCta||{}).href, "#")} className="rounded-full px-5 py-2 text-sm font-semibold transition-transform hover:-translate-y-0.5" style={{ background: c.primary, color: c.primaryForeground }}>{t((hero.primaryCta||{}).label, "Get started")}</a>
  </div>
</header>`

const FOOTER = `
<footer className="px-6 py-12" style={{ borderTop: "1px solid " + mix(c.border, 70), background: mix(c.foreground, 3) }}>
  <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 md:flex-row">
    <span className="text-base font-bold" style={{ fontFamily: heading, color: c.foreground }}>{brand}</span>
    <p className="text-sm" style={{ color: mix(c.foreground, 60) }}>{t((co.footer||{}).tagline, t(hero.subtitle, ""))}</p>
    <p className="text-xs" style={{ color: mix(c.foreground, 50) }}>{t((co.footer||{}).copyright, "© " + brand)}</p>
  </div>
</footer>`

/* ---- 1. Aurora SaaS (cruip/open-react-template) -------------------------- */

const AURORA_CODE = makeComponent(`
var feats = arr(feat.items);
var logos = arr(co.logos);
var stats = arr(co.stats);
var tess = arr(co.testimonials);
var pricing = arr(co.pricing);
return (
<div style={{ background: c.background, color: c.foreground, fontFamily: bodyFont }}>
  ${NAV}
  <section className="relative overflow-hidden px-6 pt-20 pb-16 text-center">
    <div className="pointer-events-none absolute left-1/2 top-[-12%] h-[480px] w-[820px] -translate-x-1/2 rounded-full blur-[120px]" style={{ background: mix(c.primary, 28) }} aria-hidden="true"></div>
    <div className="relative mx-auto max-w-3xl">
      {t(hero.eyebrow) ? (<span className="mb-5 inline-block rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-wider" style={{ background: mix(c.primary, 14), color: c.primary, border: "1px solid " + mix(c.primary, 30) }}>{hero.eyebrow}</span>) : null}
      <h1 className="text-balance text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl" style={{ fontFamily: heading }}>{t(hero.title, brand)}</h1>
      <p className="mx-auto mt-6 max-w-xl text-lg" style={{ color: mix(c.foreground, 68) }}>{t(hero.subtitle)}</p>
      <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
        <a href={t((hero.primaryCta||{}).href, "#")} className="rounded-full px-7 py-3 text-sm font-semibold shadow-lg transition-transform hover:-translate-y-0.5" style={{ background: c.primary, color: c.primaryForeground }}>{t((hero.primaryCta||{}).label, "Get started")}</a>
        <a href={t((hero.secondaryCta||{}).href, "#")} className="rounded-full px-7 py-3 text-sm font-semibold transition-colors" style={{ border: "1px solid " + mix(c.foreground, 22), color: c.foreground }}>{t((hero.secondaryCta||{}).label, "Learn more")}</a>
      </div>
    </div>
    <div className="relative mx-auto mt-14 max-w-5xl">
      <div className="overflow-hidden rounded-2xl shadow-2xl" style={{ border: "1px solid " + mix(c.border, 80) }}>
        <img src={pic("hero")} alt={t(hero.title, brand)} className="block w-full" style={{ aspectRatio: "16/9", objectFit: "cover" }} />
      </div>
    </div>
  </section>

  {logos.length ? (
  <section className="px-6 py-10">
    <p className="mb-6 text-center text-xs font-semibold uppercase tracking-widest" style={{ color: mix(c.foreground, 45) }}>{t((feat||{}).subtitle, "Trusted by teams everywhere")}</p>
    <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-x-10 gap-y-4">
      {logos.map(function(l, i){ return (<span key={i} className="text-lg font-bold" style={{ color: mix(c.foreground, 38), fontFamily: heading }}>{l}</span>); })}
    </div>
  </section>) : null}

  {feats.length ? (
  <section id="features" className="px-6 py-20">
    <div className="mx-auto max-w-2xl text-center">
      <h2 className="text-3xl font-bold tracking-tight sm:text-4xl" style={{ fontFamily: heading }}>{t(feat.title, "Everything you need")}</h2>
      <p className="mt-3 text-base" style={{ color: mix(c.foreground, 62) }}>{t(feat.subtitle)}</p>
    </div>
    <div className="mx-auto mt-12 grid max-w-5xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {feats.map(function(f, i){ return (
        <motion.div key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4, delay: i * 0.05 }} className="rounded-2xl p-6" style={{ background: mix(c.foreground, 4), border: "1px solid " + mix(c.border, 70) }}>
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl" style={{ background: mix(c.primary, 16), color: c.primary }}><Icon name={f.icon} className="h-5 w-5" /></div>
          <h3 className="text-lg font-semibold" style={{ fontFamily: heading }}>{f.title}</h3>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: mix(c.foreground, 62) }}>{f.body}</p>
        </motion.div>); })}
    </div>
  </section>) : null}

  {(t(show.title) || arr(show.bullets).length) ? (
  <section className="px-6 py-20" style={{ background: mix(c.foreground, 3) }}>
    <div className="mx-auto grid max-w-5xl items-center gap-12 lg:grid-cols-2">
      <div className="overflow-hidden rounded-2xl shadow-xl" style={{ border: "1px solid " + mix(c.border, 70) }}>
        <img src={pic("showcase")} alt={t(show.title, "")} className="block w-full" style={{ aspectRatio: "4/3", objectFit: "cover" }} />
      </div>
      <div>
        <h2 className="text-3xl font-bold tracking-tight" style={{ fontFamily: heading }}>{t(show.title)}</h2>
        <p className="mt-4 text-base" style={{ color: mix(c.foreground, 64) }}>{t(show.body)}</p>
        <ul className="mt-6 space-y-3">
          {arr(show.bullets).map(function(b, i){ return (<li key={i} className="flex items-start gap-3"><Icon name="Check" className="mt-0.5 h-5 w-5 shrink-0" style={{ color: c.primary }} /><span className="text-sm" style={{ color: mix(c.foreground, 78) }}>{b}</span></li>); })}
        </ul>
        {(show.cta && show.cta.label) ? (<a href={t(show.cta.href, "#")} className="mt-7 inline-block rounded-full px-6 py-2.5 text-sm font-semibold" style={{ background: c.primary, color: c.primaryForeground }}>{show.cta.label}</a>) : null}
      </div>
    </div>
  </section>) : null}

  {stats.length ? (
  <section className="px-6 py-16">
    <div className="mx-auto grid max-w-4xl gap-8 text-center sm:grid-cols-3">
      {stats.map(function(s, i){ return (<div key={i}><div className="text-4xl font-extrabold" style={{ fontFamily: heading, color: c.primary }}>{s.value}</div><div className="mt-1 text-sm" style={{ color: mix(c.foreground, 60) }}>{s.label}</div></div>); })}
    </div>
  </section>) : null}

  {tess.length ? (
  <section className="px-6 py-20" style={{ background: mix(c.foreground, 3) }}>
    <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-3">
      {tess.map(function(ts, i){ return (<figure key={i} className="rounded-2xl p-6" style={{ background: c.background, border: "1px solid " + mix(c.border, 70) }}><blockquote className="text-sm leading-relaxed" style={{ color: mix(c.foreground, 80) }}>“{ts.quote}”</blockquote><figcaption className="mt-4 text-sm font-semibold" style={{ fontFamily: heading }}>{ts.name}<span className="block text-xs font-normal" style={{ color: mix(c.foreground, 55) }}>{t(ts.role)}</span></figcaption></figure>); })}
    </div>
  </section>) : null}

  {pricing.length ? (
  <section id="pricing" className="px-6 py-20">
    <h2 className="mb-12 text-center text-3xl font-bold tracking-tight" style={{ fontFamily: heading }}>Pricing</h2>
    <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-3">
      {pricing.map(function(p, i){ return (<div key={i} className="rounded-2xl p-7" style={{ background: p.highlighted ? mix(c.primary, 10) : mix(c.foreground, 4), border: "1px solid " + (p.highlighted ? c.primary : mix(c.border, 70)) }}><div className="text-sm font-semibold uppercase tracking-wide" style={{ color: mix(c.foreground, 60) }}>{p.name}</div><div className="mt-2 text-4xl font-extrabold" style={{ fontFamily: heading }}>{p.price}<span className="text-sm font-normal" style={{ color: mix(c.foreground, 55) }}>{t(p.period)}</span></div><ul className="mt-5 space-y-2">{arr(p.features).map(function(ft, j){ return (<li key={j} className="flex items-center gap-2 text-sm" style={{ color: mix(c.foreground, 75) }}><Icon name="Check" className="h-4 w-4" style={{ color: c.primary }} />{ft}</li>); })}</ul><a href={t((p.cta||{}).href, "#")} className="mt-6 block rounded-full py-2.5 text-center text-sm font-semibold" style={{ background: p.highlighted ? c.primary : "transparent", color: p.highlighted ? c.primaryForeground : c.foreground, border: p.highlighted ? "none" : "1px solid " + mix(c.foreground, 22) }}>{t((p.cta||{}).label, "Choose")}</a></div>); })}
    </div>
  </section>) : null}

  <section className="px-6 py-20">
    <div className="relative mx-auto max-w-4xl overflow-hidden rounded-3xl px-8 py-16 text-center" style={{ background: c.primary, color: c.primaryForeground }}>
      <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl" style={{ fontFamily: heading }}>{t(cta.title, "Ready to get started?")}</h2>
      <p className="mx-auto mt-3 max-w-lg text-base" style={{ color: mix(c.primaryForeground, 82) }}>{t(cta.body)}</p>
      <a href={t((cta.button||{}).href, "#")} className="mt-7 inline-block rounded-full px-8 py-3 text-sm font-bold" style={{ background: c.primaryForeground, color: c.primary }}>{t((cta.button||{}).label, "Get started")}</a>
    </div>
  </section>
  ${FOOTER}
</div>);
`)

/* ---- 2. Simple Light (cruip/tailwind-landing-page-template) -------------- */

const SIMPLE_LIGHT_CODE = makeComponent(`
var feats = arr(feat.items);
var stats = arr(co.stats);
var tess = arr(co.testimonials);
return (
<div style={{ background: c.background, color: c.foreground, fontFamily: bodyFont }}>
  ${NAV}
  <section className="px-6 pt-24 pb-12 text-center">
    <div className="mx-auto max-w-3xl">
      <h1 className="text-balance text-5xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl" style={{ fontFamily: heading }}>{t(hero.title, brand)}</h1>
      <p className="mx-auto mt-6 max-w-xl text-lg" style={{ color: mix(c.foreground, 60) }}>{t(hero.subtitle)}</p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <a href={t((hero.primaryCta||{}).href, "#")} className="rounded-lg px-7 py-3 text-sm font-semibold shadow-md transition-transform hover:-translate-y-0.5" style={{ background: c.primary, color: c.primaryForeground }}>{t((hero.primaryCta||{}).label, "Start free trial")}</a>
        <a href={t((hero.secondaryCta||{}).href, "#")} className="rounded-lg px-7 py-3 text-sm font-semibold" style={{ border: "1px solid " + mix(c.foreground, 18), color: c.foreground }}>{t((hero.secondaryCta||{}).label, "Learn more")}</a>
      </div>
    </div>
    <div className="mx-auto mt-14 max-w-4xl overflow-hidden rounded-xl shadow-2xl" style={{ border: "1px solid " + mix(c.border, 70) }}>
      <img src={pic("hero")} alt={t(hero.title, brand)} className="block w-full" style={{ aspectRatio: "16/9", objectFit: "cover" }} />
    </div>
  </section>

  {feats.length ? (
  <section id="features" className="px-6 py-20">
    <div className="mx-auto max-w-2xl text-center">
      <span className="text-sm font-semibold uppercase tracking-wider" style={{ color: c.primary }}>{t(feat.subtitle, "Features")}</span>
      <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl" style={{ fontFamily: heading }}>{t(feat.title, "Built to help you grow")}</h2>
    </div>
    <div className="mx-auto mt-12 grid max-w-5xl gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
      {feats.map(function(f, i){ return (<div key={i} className="text-center"><div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full" style={{ background: mix(c.primary, 12), color: c.primary }}><Icon name={f.icon} className="h-5 w-5" /></div><h3 className="text-base font-semibold" style={{ fontFamily: heading }}>{f.title}</h3><p className="mt-2 text-sm leading-relaxed" style={{ color: mix(c.foreground, 60) }}>{f.body}</p></div>); })}
    </div>
  </section>) : null}

  {(t(show.title) || arr(show.bullets).length) ? (
  <section className="px-6 py-20" style={{ background: mix(c.primary, 6) }}>
    <div className="mx-auto grid max-w-5xl items-center gap-12 lg:grid-cols-2">
      <div>
        <h2 className="text-3xl font-bold tracking-tight" style={{ fontFamily: heading }}>{t(show.title)}</h2>
        <p className="mt-4 text-base" style={{ color: mix(c.foreground, 62) }}>{t(show.body)}</p>
        <ul className="mt-6 space-y-3">{arr(show.bullets).map(function(b, i){ return (<li key={i} className="flex items-start gap-3"><Icon name="CircleCheck" className="mt-0.5 h-5 w-5 shrink-0" style={{ color: c.primary }} /><span className="text-sm" style={{ color: mix(c.foreground, 76) }}>{b}</span></li>); })}</ul>
      </div>
      <div className="overflow-hidden rounded-2xl shadow-xl" style={{ border: "1px solid " + mix(c.border, 70) }}><img src={pic("showcase")} alt={t(show.title, "")} className="block w-full" style={{ aspectRatio: "4/3", objectFit: "cover" }} /></div>
    </div>
  </section>) : null}

  {tess.length ? (
  <section className="px-6 py-20 text-center">
    <div className="mx-auto max-w-2xl">
      <Icon name="Quote" className="mx-auto h-8 w-8" style={{ color: mix(c.primary, 60) }} />
      <blockquote className="mt-5 text-2xl font-medium leading-snug" style={{ fontFamily: heading }}>“{(tess[0]||{}).quote}”</blockquote>
      <p className="mt-5 text-sm font-semibold">{(tess[0]||{}).name}<span className="block font-normal" style={{ color: mix(c.foreground, 55) }}>{t((tess[0]||{}).role)}</span></p>
    </div>
  </section>) : null}

  {stats.length ? (
  <section className="px-6 pb-16"><div className="mx-auto grid max-w-4xl gap-8 text-center sm:grid-cols-3">{stats.map(function(s, i){ return (<div key={i}><div className="text-4xl font-extrabold" style={{ fontFamily: heading, color: c.primary }}>{s.value}</div><div className="mt-1 text-sm" style={{ color: mix(c.foreground, 60) }}>{s.label}</div></div>); })}</div></section>) : null}

  <section className="px-6 py-20 text-center" style={{ background: c.foreground, color: c.background }}>
    <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl" style={{ fontFamily: heading }}>{t(cta.title, "Start building today")}</h2>
    <p className="mx-auto mt-3 max-w-lg" style={{ color: mix(c.background, 75) }}>{t(cta.body)}</p>
    <a href={t((cta.button||{}).href, "#")} className="mt-7 inline-block rounded-lg px-8 py-3 text-sm font-bold" style={{ background: c.primary, color: c.primaryForeground }}>{t((cta.button||{}).label, "Get started")}</a>
  </section>
  ${FOOTER}
</div>);
`)

/* ---- 3. shadcn Launch (leoMirandaa/shadcn-landing-page) ------------------ */

const SHADCN_CODE = makeComponent(`
var feats = arr(feat.items);
var faqs = arr(co.faq);
var pricing = arr(co.pricing);
var stats = arr(co.stats);
return (
<div style={{ background: c.background, color: c.foreground, fontFamily: bodyFont }}>
  ${NAV}
  <section className="px-6 pt-20 pb-16">
    <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2">
      <div>
        {arr(hero.badges).length ? (<div className="mb-5 flex flex-wrap gap-2">{arr(hero.badges).map(function(b, i){ return (<span key={i} className="rounded-full px-3 py-1 text-xs font-semibold" style={{ background: mix(c.primary, 12), color: c.primary, border: "1px solid " + mix(c.primary, 26) }}>{b}</span>); })}</div>) : null}
        <h1 className="text-balance text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl" style={{ fontFamily: heading }}>{t(hero.title, brand)}</h1>
        <p className="mt-5 max-w-md text-lg" style={{ color: mix(c.foreground, 62) }}>{t(hero.subtitle)}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <a href={t((hero.primaryCta||{}).href, "#")} className="rounded-md px-6 py-3 text-sm font-semibold shadow" style={{ background: c.primary, color: c.primaryForeground }}>{t((hero.primaryCta||{}).label, "Get started")}</a>
          <a href={t((hero.secondaryCta||{}).href, "#")} className="rounded-md px-6 py-3 text-sm font-semibold" style={{ border: "1px solid " + mix(c.foreground, 20), color: c.foreground }}>{t((hero.secondaryCta||{}).label, "GitHub")}</a>
        </div>
      </div>
      <div className="relative">
        <div className="pointer-events-none absolute inset-0 -z-10 rounded-3xl blur-3xl" style={{ background: mix(c.primary, 22) }} aria-hidden="true"></div>
        <div className="overflow-hidden rounded-2xl shadow-2xl" style={{ border: "1px solid " + mix(c.border, 70) }}><img src={pic("hero")} alt={t(hero.title, brand)} className="block w-full" style={{ aspectRatio: "4/3", objectFit: "cover" }} /></div>
      </div>
    </div>
  </section>

  {stats.length ? (<section className="px-6 py-8"><div className="mx-auto grid max-w-4xl gap-6 text-center sm:grid-cols-3">{stats.map(function(s, i){ return (<div key={i} className="rounded-xl py-6" style={{ background: mix(c.foreground, 4), border: "1px solid " + mix(c.border, 60) }}><div className="text-3xl font-extrabold" style={{ fontFamily: heading, color: c.primary }}>{s.value}</div><div className="mt-1 text-xs" style={{ color: mix(c.foreground, 60) }}>{s.label}</div></div>); })}</div></section>) : null}

  {feats.length ? (
  <section id="features" className="px-6 py-20">
    <div className="mx-auto max-w-2xl text-center"><span className="text-sm font-bold uppercase tracking-wider" style={{ color: c.primary }}>{t(feat.subtitle, "Features")}</span><h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl" style={{ fontFamily: heading }}>{t(feat.title, "What makes us different")}</h2></div>
    <div className="mx-auto mt-12 grid max-w-5xl gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {feats.map(function(f, i){ return (<div key={i} className="rounded-xl p-6 transition-transform hover:-translate-y-1" style={{ background: mix(c.foreground, 4), border: "1px solid " + mix(c.border, 65) }}><div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg" style={{ background: mix(c.primary, 14), color: c.primary }}><Icon name={f.icon} className="h-5 w-5" /></div><h3 className="font-semibold" style={{ fontFamily: heading }}>{f.title}</h3><p className="mt-2 text-sm leading-relaxed" style={{ color: mix(c.foreground, 62) }}>{f.body}</p></div>); })}
    </div>
  </section>) : null}

  {pricing.length ? (
  <section id="pricing" className="px-6 py-20" style={{ background: mix(c.foreground, 3) }}>
    <h2 className="mb-3 text-center text-3xl font-bold tracking-tight" style={{ fontFamily: heading }}>Pricing</h2>
    <div className="mx-auto mt-10 grid max-w-4xl gap-6 md:grid-cols-3">{pricing.map(function(p, i){ return (<div key={i} className="rounded-2xl p-7" style={{ background: c.background, border: "1px solid " + (p.highlighted ? c.primary : mix(c.border, 70)), boxShadow: p.highlighted ? "0 20px 40px -20px " + mix(c.primary, 60) : "none" }}><div className="text-sm font-semibold">{p.name}</div><div className="mt-2 text-4xl font-extrabold" style={{ fontFamily: heading }}>{p.price}<span className="text-sm font-normal" style={{ color: mix(c.foreground, 55) }}>{t(p.period)}</span></div><ul className="mt-5 space-y-2">{arr(p.features).map(function(ft, j){ return (<li key={j} className="flex items-center gap-2 text-sm" style={{ color: mix(c.foreground, 75) }}><Icon name="Check" className="h-4 w-4" style={{ color: c.primary }} />{ft}</li>); })}</ul><a href={t((p.cta||{}).href, "#")} className="mt-6 block rounded-md py-2.5 text-center text-sm font-semibold" style={{ background: p.highlighted ? c.primary : "transparent", color: p.highlighted ? c.primaryForeground : c.foreground, border: p.highlighted ? "none" : "1px solid " + mix(c.foreground, 20) }}>{t((p.cta||{}).label, "Choose plan")}</a></div>); })}</div>
  </section>) : null}

  {faqs.length ? (
  <section id="faq" className="px-6 py-20">
    <h2 className="mb-10 text-center text-3xl font-bold tracking-tight" style={{ fontFamily: heading }}>Frequently asked questions</h2>
    <div className="mx-auto max-w-2xl divide-y" style={{ borderColor: mix(c.border, 70) }}>{faqs.map(function(q, i){ return (<div key={i} className="py-5" style={{ borderColor: mix(c.border, 70) }}><h3 className="flex items-start gap-2 font-semibold" style={{ fontFamily: heading }}><Icon name="HelpCircle" className="mt-0.5 h-5 w-5 shrink-0" style={{ color: c.primary }} />{q.q}</h3><p className="mt-2 pl-7 text-sm leading-relaxed" style={{ color: mix(c.foreground, 62) }}>{q.a}</p></div>); })}</div>
  </section>) : null}

  <section className="px-6 py-20">
    <div className="mx-auto max-w-4xl rounded-3xl px-8 py-14 text-center" style={{ background: mix(c.primary, 10), border: "1px solid " + mix(c.primary, 26) }}>
      <h2 className="text-3xl font-extrabold tracking-tight" style={{ fontFamily: heading }}>{t(cta.title, "Try it today")}</h2>
      <p className="mx-auto mt-3 max-w-lg" style={{ color: mix(c.foreground, 65) }}>{t(cta.body)}</p>
      <a href={t((cta.button||{}).href, "#")} className="mt-7 inline-block rounded-md px-8 py-3 text-sm font-bold" style={{ background: c.primary, color: c.primaryForeground }}>{t((cta.button||{}).label, "Get started")}</a>
    </div>
  </section>
  ${FOOTER}
</div>);
`)

/* ---- 4. Minimal Store (vercel/commerce) --------------------------------- */

const STORE_CODE = makeComponent(`
var prods = arr(feat.items);
var gal = ["g0","g1","g2","g3"];
return (
<div style={{ background: c.background, color: c.foreground, fontFamily: bodyFont }}>
  ${NAV}
  <section className="px-6 pt-8 pb-6">
    <div className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl" style={{ minHeight: "70vh", background: mix(c.foreground, 6) }}>
      <img src={pic("hero")} alt={t(hero.title, brand)} className="absolute inset-0 h-full w-full" style={{ objectFit: "cover" }} />
      <div className="absolute inset-0" style={{ background: "linear-gradient(to top, " + mix(c.foreground, 70) + ", transparent)" }}></div>
      <div className="absolute bottom-0 left-0 p-8 sm:p-12" style={{ color: "#fff" }}>
        <h1 className="max-w-xl text-balance text-4xl font-extrabold leading-tight tracking-tight sm:text-6xl" style={{ fontFamily: heading }}>{t(hero.title, brand)}</h1>
        <p className="mt-4 max-w-lg text-base" style={{ color: "rgba(255,255,255,0.85)" }}>{t(hero.subtitle)}</p>
        <a href={t((hero.primaryCta||{}).href, "#")} className="mt-6 inline-block rounded-full px-7 py-3 text-sm font-semibold" style={{ background: "#fff", color: c.foreground }}>{t((hero.primaryCta||{}).label, "Shop now")}</a>
      </div>
    </div>
  </section>

  {prods.length ? (
  <section id="products" className="px-6 py-16">
    <h2 className="mb-8 text-2xl font-bold tracking-tight sm:text-3xl" style={{ fontFamily: heading }}>{t(feat.title, "Featured")}</h2>
    <div className="mx-auto grid max-w-6xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {prods.map(function(p, i){ return (<div key={i} className="group overflow-hidden rounded-2xl" style={{ border: "1px solid " + mix(c.border, 65) }}><div className="overflow-hidden" style={{ background: mix(c.foreground, 5) }}><img src={images[_img[gal[i % 4]]] || images[_img["showcase"]] || images[0] || ""} alt={p.title} className="block w-full transition-transform duration-500 group-hover:scale-105" style={{ aspectRatio: "1/1", objectFit: "cover" }} /></div><div className="flex items-center justify-between p-4"><div><h3 className="text-sm font-semibold" style={{ fontFamily: heading }}>{p.title}</h3><p className="text-xs" style={{ color: mix(c.foreground, 55) }}>{p.body}</p></div><span className="rounded-full px-3 py-1 text-xs font-bold" style={{ background: c.primary, color: c.primaryForeground }}>{t(p.icon, "View")}</span></div></div>); })}
    </div>
  </section>) : null}

  {(t(show.title) || arr(show.bullets).length) ? (
  <section className="px-6 py-16" style={{ background: mix(c.foreground, 4) }}>
    <div className="mx-auto grid max-w-5xl items-center gap-10 lg:grid-cols-2">
      <div className="overflow-hidden rounded-3xl"><img src={pic("showcase")} alt={t(show.title, "")} className="block w-full" style={{ aspectRatio: "4/3", objectFit: "cover" }} /></div>
      <div><h2 className="text-3xl font-bold tracking-tight" style={{ fontFamily: heading }}>{t(show.title)}</h2><p className="mt-4 text-base" style={{ color: mix(c.foreground, 64) }}>{t(show.body)}</p><ul className="mt-5 space-y-2">{arr(show.bullets).map(function(b, i){ return (<li key={i} className="flex items-center gap-2 text-sm" style={{ color: mix(c.foreground, 76) }}><Icon name="Sparkles" className="h-4 w-4" style={{ color: c.primary }} />{b}</li>); })}</ul></div>
    </div>
  </section>) : null}

  <section className="px-6 py-20 text-center">
    <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl" style={{ fontFamily: heading }}>{t(cta.title, "Join the collection")}</h2>
    <p className="mx-auto mt-3 max-w-lg" style={{ color: mix(c.foreground, 60) }}>{t(cta.body)}</p>
    <a href={t((cta.button||{}).href, "#")} className="mt-7 inline-block rounded-full px-8 py-3 text-sm font-bold" style={{ background: c.primary, color: c.primaryForeground }}>{t((cta.button||{}).label, "Shop the store")}</a>
  </section>
  ${FOOTER}
</div>);
`)

/* ---- 5. ScrewFast Industrial (mearashadowfax/ScrewFast) ------------------ */

const INDUSTRIAL_CODE = makeComponent(`
var feats = arr(feat.items);
var stats = arr(co.stats);
var steps = arr(show.bullets);
return (
<div style={{ background: c.background, color: c.foreground, fontFamily: bodyFont }}>
  ${NAV}
  <section className="px-6 pt-16 pb-12">
    <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-12">
      <div className="lg:col-span-7">
        {t(hero.eyebrow) ? (<span className="mb-4 inline-block text-xs font-black uppercase tracking-[0.2em]" style={{ color: c.primary }}>{hero.eyebrow}</span>) : null}
        <h1 className="text-balance text-5xl font-black uppercase leading-[0.95] tracking-tight sm:text-7xl" style={{ fontFamily: heading }}>{t(hero.title, brand)}</h1>
        <p className="mt-6 max-w-lg text-lg" style={{ color: mix(c.foreground, 64) }}>{t(hero.subtitle)}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <a href={t((hero.primaryCta||{}).href, "#")} className="px-7 py-3.5 text-sm font-bold uppercase tracking-wide" style={{ background: c.primary, color: c.primaryForeground }}>{t((hero.primaryCta||{}).label, "Request a quote")}</a>
          <a href={t((hero.secondaryCta||{}).href, "#")} className="px-7 py-3.5 text-sm font-bold uppercase tracking-wide" style={{ border: "2px solid " + c.foreground, color: c.foreground }}>{t((hero.secondaryCta||{}).label, "Our services")}</a>
        </div>
      </div>
      <div className="lg:col-span-5"><div className="overflow-hidden" style={{ border: "3px solid " + c.foreground }}><img src={pic("hero")} alt={t(hero.title, brand)} className="block w-full" style={{ aspectRatio: "3/4", objectFit: "cover" }} /></div></div>
    </div>
  </section>

  {stats.length ? (<section className="px-6 py-10" style={{ background: c.foreground, color: c.background }}><div className="mx-auto grid max-w-5xl gap-8 text-center sm:grid-cols-4">{stats.map(function(s, i){ return (<div key={i}><div className="text-4xl font-black" style={{ fontFamily: heading }}>{s.value}</div><div className="mt-1 text-xs font-semibold uppercase tracking-wide" style={{ color: mix(c.background, 70) }}>{s.label}</div></div>); })}</div></section>) : null}

  {feats.length ? (
  <section id="services" className="px-6 py-20">
    <h2 className="mb-12 text-4xl font-black uppercase tracking-tight" style={{ fontFamily: heading }}>{t(feat.title, "Our services")}</h2>
    <div className="mx-auto grid max-w-6xl gap-px" style={{ background: mix(c.border, 60) }}>
      <div className="grid gap-px sm:grid-cols-3" style={{ background: mix(c.border, 60) }}>{feats.map(function(f, i){ return (<div key={i} className="p-8" style={{ background: c.background }}><div className="mb-4 flex h-12 w-12 items-center justify-center" style={{ background: c.primary, color: c.primaryForeground }}><Icon name={f.icon} className="h-6 w-6" /></div><h3 className="text-xl font-bold uppercase" style={{ fontFamily: heading }}>{f.title}</h3><p className="mt-2 text-sm leading-relaxed" style={{ color: mix(c.foreground, 62) }}>{f.body}</p></div>); })}</div>
    </div>
  </section>) : null}

  {steps.length ? (
  <section className="px-6 py-20" style={{ background: mix(c.foreground, 5) }}>
    <div className="mx-auto grid max-w-5xl items-center gap-10 lg:grid-cols-2">
      <div><h2 className="text-4xl font-black uppercase tracking-tight" style={{ fontFamily: heading }}>{t(show.title, "How it works")}</h2><p className="mt-4" style={{ color: mix(c.foreground, 64) }}>{t(show.body)}</p><ol className="mt-6 space-y-4">{steps.map(function(b, i){ return (<li key={i} className="flex gap-4"><span className="flex h-8 w-8 shrink-0 items-center justify-center text-sm font-black" style={{ background: c.primary, color: c.primaryForeground }}>{i + 1}</span><span className="pt-1 text-sm" style={{ color: mix(c.foreground, 78) }}>{b}</span></li>); })}</ol></div>
      <div className="overflow-hidden" style={{ border: "3px solid " + c.foreground }}><img src={pic("showcase")} alt={t(show.title, "")} className="block w-full" style={{ aspectRatio: "1/1", objectFit: "cover" }} /></div>
    </div>
  </section>) : null}

  <section className="px-6 py-20" style={{ background: c.primary, color: c.primaryForeground }}>
    <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-6 text-center md:flex-row md:text-left">
      <h2 className="text-3xl font-black uppercase tracking-tight sm:text-4xl" style={{ fontFamily: heading }}>{t(cta.title, "Let's build it")}</h2>
      <a href={t((cta.button||{}).href, "#")} className="shrink-0 px-8 py-3.5 text-sm font-bold uppercase tracking-wide" style={{ background: c.primaryForeground, color: c.primary }}>{t((cta.button||{}).label, "Get in touch")}</a>
    </div>
  </section>
  ${FOOTER}
</div>);
`)

/* ---- 6. Dev Portfolio (RyanFitzgerald/devportfolio) --------------------- */

const DEVFOLIO_CODE = makeComponent(`
var feats = arr(feat.items);
var stats = arr(co.stats);
var gal = ["g0","g1","g2","g3"];
return (
<div style={{ background: c.background, color: c.foreground, fontFamily: bodyFont }}>
  ${NAV}
  <section className="px-6 pt-24 pb-16">
    <div className="mx-auto flex max-w-4xl flex-col items-center gap-8 text-center">
      <div className="h-32 w-32 overflow-hidden rounded-full" style={{ border: "3px solid " + c.primary }}><img src={pic("hero")} alt={t(hero.title, brand)} className="h-full w-full" style={{ objectFit: "cover" }} /></div>
      <div>
        <p className="text-sm font-semibold uppercase tracking-widest" style={{ color: c.primary }}>{t(hero.eyebrow, "Hello, I'm")}</p>
        <h1 className="mt-2 text-5xl font-extrabold tracking-tight sm:text-6xl" style={{ fontFamily: heading }}>{t(hero.title, brand)}</h1>
        <p className="mx-auto mt-5 max-w-xl text-lg" style={{ color: mix(c.foreground, 64) }}>{t(hero.subtitle)}</p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <a href={t((hero.primaryCta||{}).href, "#")} className="rounded-full px-7 py-3 text-sm font-semibold" style={{ background: c.primary, color: c.primaryForeground }}>{t((hero.primaryCta||{}).label, "View work")}</a>
          <a href={t((hero.secondaryCta||{}).href, "#")} className="rounded-full px-7 py-3 text-sm font-semibold" style={{ border: "1px solid " + mix(c.foreground, 22), color: c.foreground }}>{t((hero.secondaryCta||{}).label, "Contact")}</a>
        </div>
      </div>
    </div>
  </section>

  {stats.length ? (<section className="px-6 pb-8"><div className="mx-auto grid max-w-3xl gap-6 text-center sm:grid-cols-3">{stats.map(function(s, i){ return (<div key={i}><div className="text-3xl font-extrabold" style={{ fontFamily: heading, color: c.primary }}>{s.value}</div><div className="mt-1 text-xs uppercase tracking-wide" style={{ color: mix(c.foreground, 55) }}>{s.label}</div></div>); })}</div></section>) : null}

  {feats.length ? (
  <section id="skills" className="px-6 py-16">
    <h2 className="mb-10 text-center text-3xl font-bold tracking-tight" style={{ fontFamily: heading }}>{t(feat.title, "What I do")}</h2>
    <div className="mx-auto grid max-w-4xl gap-5 sm:grid-cols-2 lg:grid-cols-3">{feats.map(function(f, i){ return (<div key={i} className="rounded-2xl p-6" style={{ background: mix(c.foreground, 4), border: "1px solid " + mix(c.border, 65) }}><Icon name={f.icon} className="mb-3 h-7 w-7" style={{ color: c.primary }} /><h3 className="font-semibold" style={{ fontFamily: heading }}>{f.title}</h3><p className="mt-2 text-sm leading-relaxed" style={{ color: mix(c.foreground, 62) }}>{f.body}</p></div>); })}</div>
  </section>) : null}

  <section id="work" className="px-6 py-16" style={{ background: mix(c.foreground, 4) }}>
    <h2 className="mb-10 text-center text-3xl font-bold tracking-tight" style={{ fontFamily: heading }}>{t((co.gallery||{}).title, "Selected work")}</h2>
    <div className="mx-auto grid max-w-5xl gap-4 sm:grid-cols-2">{gal.map(function(g, i){ return (<div key={i} className="overflow-hidden rounded-2xl" style={{ border: "1px solid " + mix(c.border, 60) }}><img src={images[_img[g]] || images[_img["showcase"]] || images[0] || ""} alt={"work " + (i + 1)} className="block w-full transition-transform duration-500 hover:scale-105" style={{ aspectRatio: "16/10", objectFit: "cover" }} /></div>); })}</div>
  </section>

  <section className="px-6 py-20 text-center">
    <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl" style={{ fontFamily: heading }}>{t(cta.title, "Let's work together")}</h2>
    <p className="mx-auto mt-3 max-w-lg" style={{ color: mix(c.foreground, 60) }}>{t(cta.body)}</p>
    <a href={t((cta.button||{}).href, "#")} className="mt-7 inline-block rounded-full px-8 py-3 text-sm font-bold" style={{ background: c.primary, color: c.primaryForeground }}>{t((cta.button||{}).label, "Say hello")}</a>
  </section>
  ${FOOTER}
</div>);
`)

/* ---- 7. Creative Folio (chetanverma16/react-portfolio-template) ---------- */

const CREATIVE_CODE = makeComponent(`
var feats = arr(feat.items);
var gal = ["g0","g1","g2","g3"];
return (
<div style={{ background: c.background, color: c.foreground, fontFamily: bodyFont }}>
  ${NAV}
  <section className="px-6 pt-24 pb-16">
    <div className="mx-auto max-w-5xl">
      {t(hero.eyebrow) ? (<p className="mb-4 text-sm font-semibold uppercase tracking-[0.25em]" style={{ color: mix(c.foreground, 50) }}>{hero.eyebrow}</p>) : null}
      <h1 className="max-w-4xl text-balance text-6xl font-extrabold leading-[0.98] tracking-tight sm:text-8xl" style={{ fontFamily: heading }}>{t(hero.title, brand)}</h1>
      <p className="mt-8 max-w-xl text-xl" style={{ color: mix(c.foreground, 60) }}>{t(hero.subtitle)}</p>
      <a href={t((hero.primaryCta||{}).href, "#")} className="mt-8 inline-flex items-center gap-2 text-lg font-semibold" style={{ color: c.primary }}>{t((hero.primaryCta||{}).label, "See my work")} <Icon name="ArrowRight" className="h-5 w-5" /></a>
    </div>
  </section>

  <section className="px-6 pb-8"><div className="mx-auto max-w-6xl overflow-hidden rounded-3xl"><img src={pic("hero")} alt={t(hero.title, brand)} className="block w-full" style={{ aspectRatio: "21/9", objectFit: "cover" }} /></div></section>

  {feats.length ? (
  <section id="services" className="px-6 py-20">
    <div className="mx-auto grid max-w-5xl gap-x-12 gap-y-10 md:grid-cols-2">
      <h2 className="text-4xl font-extrabold tracking-tight" style={{ fontFamily: heading }}>{t(feat.title, "What I do")}</h2>
      <div className="space-y-8">{feats.map(function(f, i){ return (<div key={i} className="flex gap-4"><Icon name={f.icon} className="mt-1 h-7 w-7 shrink-0" style={{ color: c.primary }} /><div><h3 className="text-xl font-bold" style={{ fontFamily: heading }}>{f.title}</h3><p className="mt-1 text-sm leading-relaxed" style={{ color: mix(c.foreground, 62) }}>{f.body}</p></div></div>); })}</div>
    </div>
  </section>) : null}

  <section id="work" className="px-6 py-12">
    <h2 className="mb-10 text-4xl font-extrabold tracking-tight" style={{ fontFamily: heading }}>{t((co.gallery||{}).title, "Selected projects")}</h2>
    <div className="mx-auto grid max-w-6xl gap-6 md:grid-cols-2">{gal.map(function(g, i){ return (<motion.div key={i} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }} className="group overflow-hidden rounded-3xl" style={{ background: mix(c.foreground, 5) }}><img src={images[_img[g]] || images[_img["showcase"]] || images[0] || ""} alt={"project " + (i + 1)} className="block w-full transition-transform duration-700 group-hover:scale-105" style={{ aspectRatio: "4/3", objectFit: "cover" }} /></motion.div>); })}</div>
  </section>

  <section className="px-6 py-24 text-center">
    <h2 className="mx-auto max-w-3xl text-balance text-5xl font-extrabold tracking-tight" style={{ fontFamily: heading }}>{t(cta.title, "Have a project in mind?")}</h2>
    <a href={t((cta.button||{}).href, "#")} className="mt-8 inline-block rounded-full px-9 py-4 text-base font-bold" style={{ background: c.primary, color: c.primaryForeground }}>{t((cta.button||{}).label, "Let's talk")}</a>
  </section>
  ${FOOTER}
</div>);
`)

/* ---- 8. D2C Brand (consumer product storefront) ------------------------- */

const D2C_CODE = makeComponent(`
var feats = arr(feat.items);
var tess = arr(co.testimonials);
var stats = arr(co.stats);
return (
<div style={{ background: c.background, color: c.foreground, fontFamily: bodyFont }}>
  ${NAV}
  <section className="px-6 pt-12 pb-10">
    <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-2">
      <div>
        {t(hero.eyebrow) ? (<span className="mb-4 inline-block rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-wide" style={{ background: mix(c.primary, 14), color: c.primary }}>{hero.eyebrow}</span>) : null}
        <h1 className="text-balance text-5xl font-extrabold leading-[1.02] tracking-tight sm:text-6xl" style={{ fontFamily: heading }}>{t(hero.title, brand)}</h1>
        <p className="mt-5 max-w-md text-lg" style={{ color: mix(c.foreground, 62) }}>{t(hero.subtitle)}</p>
        <div className="mt-8 flex flex-wrap gap-3"><a href={t((hero.primaryCta||{}).href, "#")} className="rounded-full px-7 py-3 text-sm font-semibold" style={{ background: c.primary, color: c.primaryForeground }}>{t((hero.primaryCta||{}).label, "Shop now")}</a><a href={t((hero.secondaryCta||{}).href, "#")} className="rounded-full px-7 py-3 text-sm font-semibold" style={{ border: "1px solid " + mix(c.foreground, 20), color: c.foreground }}>{t((hero.secondaryCta||{}).label, "Our story")}</a></div>
        {arr(hero.badges).length ? (<div className="mt-7 flex flex-wrap gap-4">{arr(hero.badges).map(function(b, i){ return (<span key={i} className="flex items-center gap-1.5 text-xs font-medium" style={{ color: mix(c.foreground, 60) }}><Icon name="BadgeCheck" className="h-4 w-4" style={{ color: c.primary }} />{b}</span>); })}</div>) : null}
      </div>
      <div className="relative"><div className="overflow-hidden rounded-[2rem]" style={{ background: mix(c.primary, 10) }}><img src={pic("hero")} alt={t(hero.title, brand)} className="block w-full" style={{ aspectRatio: "4/5", objectFit: "cover" }} /></div></div>
    </div>
  </section>

  {feats.length ? (
  <section id="benefits" className="px-6 py-16" style={{ background: mix(c.primary, 6) }}>
    <div className="mx-auto grid max-w-5xl gap-6 sm:grid-cols-2 lg:grid-cols-4">{feats.map(function(f, i){ return (<div key={i} className="rounded-2xl bg-transparent p-5 text-center"><div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full" style={{ background: c.background, color: c.primary }}><Icon name={f.icon} className="h-5 w-5" /></div><h3 className="text-sm font-bold" style={{ fontFamily: heading }}>{f.title}</h3><p className="mt-1 text-xs leading-relaxed" style={{ color: mix(c.foreground, 60) }}>{f.body}</p></div>); })}</div>
  </section>) : null}

  {(t(show.title) || arr(show.bullets).length) ? (
  <section className="px-6 py-20">
    <div className="mx-auto grid max-w-5xl items-center gap-12 lg:grid-cols-2">
      <div className="overflow-hidden rounded-[2rem]"><img src={pic("showcase")} alt={t(show.title, "")} className="block w-full" style={{ aspectRatio: "1/1", objectFit: "cover" }} /></div>
      <div><h2 className="text-4xl font-bold tracking-tight" style={{ fontFamily: heading }}>{t(show.title)}</h2><p className="mt-4 text-base" style={{ color: mix(c.foreground, 64) }}>{t(show.body)}</p><ul className="mt-6 space-y-3">{arr(show.bullets).map(function(b, i){ return (<li key={i} className="flex items-start gap-3"><Icon name="Leaf" className="mt-0.5 h-5 w-5 shrink-0" style={{ color: c.primary }} /><span className="text-sm" style={{ color: mix(c.foreground, 76) }}>{b}</span></li>); })}</ul></div>
    </div>
  </section>) : null}

  {stats.length ? (<section className="px-6 pb-12"><div className="mx-auto grid max-w-4xl gap-8 text-center sm:grid-cols-3">{stats.map(function(s, i){ return (<div key={i}><div className="text-4xl font-extrabold" style={{ fontFamily: heading, color: c.primary }}>{s.value}</div><div className="mt-1 text-sm" style={{ color: mix(c.foreground, 60) }}>{s.label}</div></div>); })}</div></section>) : null}

  {tess.length ? (
  <section className="px-6 py-16" style={{ background: mix(c.foreground, 4) }}>
    <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-3">{tess.map(function(ts, i){ return (<figure key={i} className="rounded-2xl p-6" style={{ background: c.background, border: "1px solid " + mix(c.border, 65) }}><div className="mb-3 flex gap-0.5">{[0,1,2,3,4].map(function(n){ return (<Icon key={n} name="Star" className="h-4 w-4" style={{ color: c.primary }} />); })}</div><blockquote className="text-sm leading-relaxed" style={{ color: mix(c.foreground, 78) }}>“{ts.quote}”</blockquote><figcaption className="mt-4 text-sm font-semibold">{ts.name}</figcaption></figure>); })}</div>
  </section>) : null}

  <section className="px-6 py-20 text-center" style={{ background: c.primary, color: c.primaryForeground }}>
    <h2 className="text-4xl font-extrabold tracking-tight" style={{ fontFamily: heading }}>{t(cta.title, "Feel the difference")}</h2>
    <p className="mx-auto mt-3 max-w-lg" style={{ color: mix(c.primaryForeground, 82) }}>{t(cta.body)}</p>
    <a href={t((cta.button||{}).href, "#")} className="mt-7 inline-block rounded-full px-8 py-3 text-sm font-bold" style={{ background: c.primaryForeground, color: c.primary }}>{t((cta.button||{}).label, "Shop the collection")}</a>
  </section>
  ${FOOTER}
</div>);
`)

export const LANDING_TEMPLATES: LandingTemplate[] = [
  {
    id: 'aurora-saas',
    name: 'Aurora SaaS',
    category: 'SaaS / Product',
    description:
      'Dark, premium SaaS landing with a glowing gradient hero, product screenshot, feature cards, pricing and testimonials. Great for software, AI tools and digital platforms.',
    source: {
      repo: 'cruip/open-react-template',
      url: 'https://github.com/cruip/open-react-template',
      stars: 4700,
      author: 'Cruip',
    },
    themeId: 'midnight-aurora',
    designId: 'aurora-saas',
    imageSlots: [
      { key: 'hero', purpose: 'Hero product screenshot / dashboard UI mockup on a dark gradient' },
      { key: 'showcase', purpose: 'Secondary feature screenshot or product detail' },
    ],
    placeholder: {
      brand: 'Aurora',
      hero: {
        eyebrow: 'Now in public beta',
        title: 'Ship products your customers love',
        subtitle: 'The all-in-one platform to plan, build and launch — faster than ever.',
        primaryCta: { label: 'Start free', href: '#' },
        secondaryCta: { label: 'Book a demo', href: '#' },
      },
    },
    code: AURORA_CODE,
  },
  {
    id: 'simple-light',
    name: 'Simple Light',
    category: 'SaaS / Startup',
    description:
      'Clean, bright minimalist SaaS landing with a centered hero, soft feature grid, alternating showcase and a single bold testimonial. Friendly and conversion-focused.',
    source: {
      repo: 'cruip/tailwind-landing-page-template',
      url: 'https://github.com/cruip/tailwind-landing-page-template',
      stars: 4500,
      author: 'Cruip',
    },
    themeId: 'ocean-breeze',
    designId: 'commerce-vibrant',
    imageSlots: [
      { key: 'hero', purpose: 'Bright hero product mockup / app screenshot on a light background' },
      { key: 'showcase', purpose: 'Feature illustration or product detail screenshot' },
    ],
    placeholder: {
      brand: 'Simple',
      hero: {
        title: 'The fastest way to launch your idea',
        subtitle: 'Beautiful, accessible building blocks to take your product from zero to live.',
        primaryCta: { label: 'Start free trial', href: '#' },
        secondaryCta: { label: 'Learn more', href: '#' },
      },
    },
    code: SIMPLE_LIGHT_CODE,
  },
  {
    id: 'shadcn-launch',
    name: 'shadcn Launch',
    category: 'SaaS / Open Source',
    description:
      'Modern split hero with badge chips, a bento feature grid, pricing tiers and an FAQ — the popular shadcn/ui landing look. Ideal for dev tools and open-source products.',
    source: {
      repo: 'leoMirandaa/shadcn-landing-page',
      url: 'https://github.com/leoMirandaa/shadcn-landing-page',
      stars: 1900,
      author: 'leoMirandaa',
    },
    themeId: 'electric-indigo',
    designId: 'minimal-clean',
    imageSlots: [
      { key: 'hero', purpose: 'Hero product UI screenshot with a soft glow behind it' },
    ],
    placeholder: {
      brand: 'Launch',
      hero: {
        badges: ['Open source', 'Free forever'],
        title: 'Build your landing page in minutes',
        subtitle: 'A production-ready starter with everything you need to ship fast.',
        primaryCta: { label: 'Get started', href: '#' },
        secondaryCta: { label: 'GitHub', href: '#' },
      },
    },
    code: SHADCN_CODE,
  },
  {
    id: 'minimal-store',
    name: 'Minimal Store',
    category: 'E-commerce / D2C',
    description:
      'High-end minimalist storefront in the Vercel Commerce style: a full-bleed editorial hero, a clean product grid and a lifestyle showcase. For premium product brands.',
    source: {
      repo: 'vercel/commerce',
      url: 'https://github.com/vercel/commerce',
      stars: 12000,
      author: 'Vercel',
    },
    themeId: 'obsidian-mono',
    designId: 'editorial-luxury',
    imageSlots: [
      { key: 'hero', purpose: 'Full-bleed editorial product / lifestyle hero photograph' },
      { key: 'showcase', purpose: 'Lifestyle or brand-story photograph' },
      { key: 'g0', purpose: 'Product photo on a clean neutral background', decorative: true },
      { key: 'g1', purpose: 'Product photo on a clean neutral background', decorative: true },
      { key: 'g2', purpose: 'Product photo on a clean neutral background', decorative: true },
      { key: 'g3', purpose: 'Product photo on a clean neutral background', decorative: true },
    ],
    placeholder: {
      brand: 'Maison',
      hero: {
        title: 'Considered goods for modern living',
        subtitle: 'Thoughtfully designed essentials, built to last.',
        primaryCta: { label: 'Shop now', href: '#' },
      },
    },
    code: STORE_CODE,
  },
  {
    id: 'industrial-bold',
    name: 'Industrial Bold',
    category: 'Industrial / Services',
    description:
      'Heavy, confident industrial layout (ScrewFast style) with uppercase display type, a hard-edged service grid, a numbered process and a stats band. For manufacturers, trades and B2B services.',
    source: {
      repo: 'mearashadowfax/ScrewFast',
      url: 'https://github.com/mearashadowfax/ScrewFast',
      stars: 1400,
      author: 'mearashadowfax',
    },
    themeId: 'steel-industrial',
    designId: 'industrial-corporate',
    imageSlots: [
      { key: 'hero', purpose: 'Strong industrial / workshop / product hero photograph' },
      { key: 'showcase', purpose: 'Process, team or facility photograph' },
    ],
    placeholder: {
      brand: 'ScrewFast',
      hero: {
        eyebrow: 'Hardware & tools',
        title: 'Built tough. Delivered fast.',
        subtitle: 'Industrial-grade hardware and expert service teams ready for any job.',
        primaryCta: { label: 'Request a quote', href: '#' },
        secondaryCta: { label: 'Our services', href: '#' },
      },
    },
    code: INDUSTRIAL_CODE,
  },
  {
    id: 'dev-portfolio',
    name: 'Dev Portfolio',
    category: 'Portfolio / Personal',
    description:
      'Personal developer portfolio with an avatar hero, skills grid, a project gallery and a contact CTA. For engineers, freelancers and individual makers.',
    source: {
      repo: 'RyanFitzgerald/devportfolio',
      url: 'https://github.com/RyanFitzgerald/devportfolio',
      stars: 4900,
      author: 'RyanFitzgerald',
    },
    themeId: 'graphite-slate',
    designId: 'minimal-clean',
    imageSlots: [
      { key: 'hero', purpose: 'Professional headshot / avatar portrait' },
      { key: 'g0', purpose: 'Project screenshot or work sample', decorative: true },
      { key: 'g1', purpose: 'Project screenshot or work sample', decorative: true },
      { key: 'g2', purpose: 'Project screenshot or work sample', decorative: true },
      { key: 'g3', purpose: 'Project screenshot or work sample', decorative: true },
    ],
    placeholder: {
      brand: 'Alex Doe',
      hero: {
        eyebrow: "Hi, I'm",
        title: 'Alex Doe',
        subtitle: 'Full-stack engineer crafting fast, accessible products for the web.',
        primaryCta: { label: 'View work', href: '#' },
        secondaryCta: { label: 'Contact', href: '#' },
      },
    },
    code: DEVFOLIO_CODE,
  },
  {
    id: 'creative-folio',
    name: 'Creative Folio',
    category: 'Portfolio / Studio',
    description:
      'Editorial creative portfolio with oversized display typography, a wide showcase image and a two-column project grid. For designers, studios and creative agencies.',
    source: {
      repo: 'chetanverma16/react-portfolio-template',
      url: 'https://github.com/chetanverma16/react-portfolio-template',
      stars: 1700,
      author: 'chetanverma16',
    },
    themeId: 'noir-luxe',
    designId: 'editorial-luxury',
    imageSlots: [
      { key: 'hero', purpose: 'Wide cinematic brand / studio cover image' },
      { key: 'g0', purpose: 'Creative project showcase image', decorative: true },
      { key: 'g1', purpose: 'Creative project showcase image', decorative: true },
      { key: 'g2', purpose: 'Creative project showcase image', decorative: true },
      { key: 'g3', purpose: 'Creative project showcase image', decorative: true },
    ],
    placeholder: {
      brand: 'Studio',
      hero: {
        eyebrow: 'Design studio',
        title: 'We craft brands that move people',
        subtitle: 'Strategy, identity and digital experiences for ambitious teams.',
        primaryCta: { label: 'See my work', href: '#' },
      },
    },
    code: CREATIVE_CODE,
  },
  {
    id: 'd2c-brand',
    name: 'D2C Brand',
    category: 'E-commerce / Consumer',
    description:
      'Warm consumer product landing with a portrait hero, benefit icons, an ingredient/story showcase, star reviews and a bold buy CTA. For beauty, food, wellness and lifestyle brands.',
    source: {
      repo: 'NextMerce/nextjs-ecommerce-template',
      url: 'https://github.com/NextMerce/nextjs-ecommerce-template',
      stars: 1000,
      author: 'NextMerce',
    },
    themeId: 'sage-botanical',
    designId: 'commerce-vibrant',
    imageSlots: [
      { key: 'hero', purpose: 'Hero product packshot or lifestyle portrait of the product in use' },
      { key: 'showcase', purpose: 'Ingredient / texture / brand-story close-up photograph' },
    ],
    placeholder: {
      brand: 'Botany',
      hero: {
        eyebrow: 'New collection',
        title: 'Skincare rooted in nature',
        subtitle: 'Clean, effective formulas made with responsibly sourced botanicals.',
        primaryCta: { label: 'Shop now', href: '#' },
        secondaryCta: { label: 'Our story', href: '#' },
        badges: ['Cruelty-free', 'Vegan', 'Dermatologist tested'],
      },
    },
    code: D2C_CODE,
  },
]

export const DEFAULT_LANDING_TEMPLATE_ID = 'aurora-saas'

export function getLandingTemplate(id?: string): LandingTemplate | undefined {
  return LANDING_TEMPLATES.find((t) => t.id === id)
}

/** Lightweight metadata for the client-side template picker (no JSX code). */
export type LandingTemplateMeta = Omit<LandingTemplate, 'code' | 'placeholder'> & {
  placeholder: Pick<TemplateContent, 'brand' | 'hero'>
}

export function landingTemplateCatalog(): LandingTemplateMeta[] {
  return LANDING_TEMPLATES.map((t) => ({
    id: t.id,
    name: t.name,
    category: t.category,
    description: t.description,
    source: t.source,
    themeId: t.themeId,
    designId: t.designId,
    imageSlots: t.imageSlots,
    placeholder: { brand: t.placeholder.brand, hero: t.placeholder.hero },
  }))
}
