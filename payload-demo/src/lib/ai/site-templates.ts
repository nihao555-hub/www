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
  /** Products / Services page content (multi-page template mode). */
  products?: {
    eyebrow?: string
    title?: string
    subtitle?: string
    cta?: string
    items?: { name: string; price?: string; blurb?: string }[]
  }
  /** About page content (multi-page template mode). */
  about?: {
    eyebrow?: string
    title?: string
    lead?: string
    story?: string[]
    valuesTitle?: string
    values?: { icon?: string; title: string; body: string }[]
    stats?: { value: string; label: string }[]
  }
  /** Contact page content (multi-page template mode). */
  contact?: {
    eyebrow?: string
    title?: string
    intro?: string
    email?: string
    phone?: string
    address?: string
    hours?: string
    emailLabel?: string
    phoneLabel?: string
    addressLabel?: string
    hoursLabel?: string
    namePlaceholder?: string
    emailPlaceholder?: string
    messagePlaceholder?: string
    submitLabel?: string
  }
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
  // ---- multi-page navigation (injected by the renderer as the `pageNav` prop) ----
  'var _pn = (typeof pageNav !== "undefined" && pageNav) ? pageNav : null;',
  'var curPath = _pn ? (_pn.path || "") : "";',
  'var navItems = (_pn && _pn.pages && _pn.pages.length)',
  '  ? _pn.pages.map(function(p){ return { label: p.navLabel, path: p.path, href: p.path ? "/" + p.path : "/" }; })',
  '  : nav.map(function(n){ return { label: n.label, path: null, href: t(n.href, "#") }; });',
  // round-robin into whatever resolved images exist (used by inner pages)
  'var imgAt = function(i){ return (images && images.length) ? images[((i % images.length) + images.length) % images.length] : ""; };',
].join('\n')

/** Wrap a template body (`return (...)`) into a sandbox-ready component string. */
function makeComponent(body: string): string {
  return (
    'function LandingPage({ theme, images, content, pageNav }) {\n' +
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

/** Strip slashes from a cta/nav url to a bare page path ('' for home). */
function normalizePath(url: string): string {
  return (url || '').trim().replace(/^\/+|\/+$/g, '')
}

/**
 * Build a complete, chromeless, MULTI-PAGE SiteSpec from a template + filled
 * content. Every template becomes a real independent site with four routed
 * pages — Home (the template's signature design), Products/Services, About, and
 * Contact — that share the template's nav/footer and theme. Page switching is
 * client-side (the renderer intercepts the chromeless nav's in-site links); each
 * page has a minimal themed fallback if its JSX ever fails to compile.
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

  const mkSection = (code: string): SpecSection => ({
    kind: 'jsx',
    code,
    source: `template:${template.id}`,
    content: content as Record<string, unknown>,
    fallback,
  })

  // Prefer the localized nav label the fill agent wrote for each route, falling
  // back to an English default.
  const navItems = Array.isArray(content.nav) ? content.nav : []
  const navLabel = (path: string, fb: string): string => {
    const match = navItems.find((n) => normalizePath(String(n?.href ?? '')) === path)
    const label = match && typeof match.label === 'string' ? match.label.trim() : ''
    return label || fb
  }

  const pages: SiteSpec['pages'] = [
    {
      path: '',
      navLabel: navLabel('', 'Home'),
      sections: [mkSection(template.code)],
      meta: { title, description },
    },
    {
      path: 'products',
      navLabel: navLabel('products', 'Products'),
      sections: [mkSection(PRODUCTS_PAGE)],
      meta: { title: `${content.products?.title || 'Products & Services'} — ${brand}`, description },
    },
    {
      path: 'about',
      navLabel: navLabel('about', 'About'),
      sections: [mkSection(ABOUT_PAGE)],
      meta: { title: `${content.about?.title || 'About'} — ${brand}`, description },
    },
    {
      path: 'contact',
      navLabel: navLabel('contact', 'Contact'),
      sections: [mkSection(CONTACT_PAGE)],
      meta: { title: `${content.contact?.title || 'Contact'} — ${brand}`, description },
    },
  ]

  return {
    siteName: brand,
    slug: `${slugify(brand)}-${Date.now().toString(36)}`,
    tagline: content.footer?.tagline || content.hero?.eyebrow,
    themeId: template.themeId,
    designId: template.designId || 'minimal-clean',
    chrome: 'none',
    templateRef: template.id,
    pages,
    meta: { title, description },
  }
}

/* -------------------------------------------------------------------------- */
/* Fill prompt helpers                                                         */
/* -------------------------------------------------------------------------- */

/** JSON shape (described in prose) the fill agent must return. */
export const TEMPLATE_CONTENT_SCHEMA = `You are filling a COMPLETE MULTI-PAGE independent website with four real pages: Home, Products/Services, About, and Contact. Write distinct, real copy for ALL of them.
Return ONLY a JSON object with this shape (omit fields the template doesn't need; keep arrays short and punchy):
{
  "brand": string,                         // brand / site name
  "nav": [                                 // EXACTLY these 4 site pages, labels localized, hrefs verbatim
    { "label": string, "href": "/" },
    { "label": string, "href": "/products" },
    { "label": string, "href": "/about" },
    { "label": string, "href": "/contact" }
  ],
  "hero": {
    "eyebrow": string,                     // tiny kicker above the title (optional)
    "title": string,                       // 4-9 words, the main headline
    "subtitle": string,                    // 1-2 sentences
    "primaryCta": { "label": string, "href": "/products" },   // CTA hrefs MUST be in-site paths: "/", "/products", "/about", "/contact"
    "secondaryCta": { "label": string, "href": "/contact" },
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
    "cta": { "label": string, "href": "/contact" }
  },
  "gallery": { "title": string, "subtitle": string },
  "testimonials": [{ "quote": string, "name": string, "role": string }],  // 1-3
  "faq": [{ "q": string, "a": string }],   // 3-5
  "pricing": [{ "name": string, "price": string, "period": string, "features": [string], "cta": { "label": string, "href": "/contact" }, "highlighted": boolean }],
  "cta": { "title": string, "body": string, "button": { "label": string, "href": "/contact" } },
  "footer": { "tagline": string, "copyright": string },

  // ---- PRODUCTS / SERVICES PAGE (required) ----
  "products": {
    "eyebrow": string, "title": string, "subtitle": string,
    "cta": string,                         // per-card link label, e.g. "Inquire"
    "items": [{ "name": string, "price": string, "blurb": string }]  // 4-9 real products/services; price optional
  },

  // ---- ABOUT PAGE (required) ----
  "about": {
    "eyebrow": string, "title": string, "lead": string,
    "story": [string],                     // 2-3 real paragraphs about the company
    "valuesTitle": string,
    "values": [{ "icon": string, "title": string, "body": string }],  // 3-6; icon = lucide-react name
    "stats": [{ "value": string, "label": string }]   // 3 credibility metrics
  },

  // ---- CONTACT PAGE (required) ----
  "contact": {
    "eyebrow": string, "title": string, "intro": string,
    "email": string, "phone": string, "address": string, "hours": string,
    "emailLabel": string, "phoneLabel": string, "addressLabel": string, "hoursLabel": string,
    "namePlaceholder": string, "emailPlaceholder": string, "messagePlaceholder": string, "submitLabel": string
  }
}
Write all human-readable copy in {LANGUAGE}. Use real, specific, on-brand copy — never lorem ipsum or placeholder text. Make Products, About and Contact each substantial and distinct (do not just repeat the home page). "icon" values must be valid lucide-react icon names (e.g. "Sparkles", "ShieldCheck", "Zap", "Leaf", "Truck"). All CTA/nav hrefs MUST be in-site paths ("/", "/products", "/about", "/contact").`

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
    <a href="/" className="text-lg font-extrabold tracking-tight" style={{ fontFamily: heading, color: c.foreground }}>{brand}</a>
    <nav className="hidden items-center gap-8 md:flex">
      {navItems.map(function(it, i){ return (<a key={i} href={it.href} className="text-sm font-medium transition-opacity hover:opacity-60" style={{ color: it.path === curPath ? c.primary : mix(c.foreground, 78) }}>{it.label}</a>); })}
    </nav>
    <a href="/contact" className="rounded-full px-5 py-2 text-sm font-semibold transition-transform hover:-translate-y-0.5" style={{ background: c.primary, color: c.primaryForeground }}>{t((hero.primaryCta||{}).label, "Get in touch")}</a>
  </div>
</header>`

const FOOTER = `
<footer className="px-6 py-12" style={{ borderTop: "1px solid " + mix(c.border, 70), background: mix(c.foreground, 3) }}>
  <div className="mx-auto flex max-w-6xl flex-col gap-6 md:flex-row md:items-start md:justify-between">
    <div className="max-w-xs">
      <span className="text-base font-bold" style={{ fontFamily: heading, color: c.foreground }}>{brand}</span>
      <p className="mt-2 text-sm" style={{ color: mix(c.foreground, 60) }}>{t((co.footer||{}).tagline, t(hero.subtitle, ""))}</p>
    </div>
    <nav className="flex flex-wrap gap-x-8 gap-y-2">
      {navItems.map(function(it, i){ return (<a key={i} href={it.href} className="text-sm font-medium transition-opacity hover:opacity-70" style={{ color: mix(c.foreground, 70) }}>{it.label}</a>); })}
    </nav>
  </div>
  <p className="mx-auto mt-8 max-w-6xl text-xs" style={{ color: mix(c.foreground, 50) }}>{t((co.footer||{}).copyright, "© " + brand)}</p>
</footer>`

/* -------------------------------------------------------------------------- */
/* Shared inner pages (Products / About / Contact) reused by EVERY template.   */
/* They share the template's NAV + FOOTER and theme tokens so the whole multi- */
/* page site stays visually consistent, and gracefully fall back to the home   */
/* template's content (features / showcase / stats) when page-specific copy is  */
/* missing.                                                                     */
/* -------------------------------------------------------------------------- */

/** Products / Services listing page. */
const PRODUCTS_PAGE = makeComponent(`
var prod = co.products || {};
var items = arr(prod.items);
if (!items.length) { items = arr(feat.items).map(function(f){ return { name: f.title, blurb: f.body }; }); }
return (
<div style={{ background: c.background, color: c.foreground, fontFamily: bodyFont }}>
  ${NAV}
  <section className="px-6 pt-16 pb-8">
    <div className="mx-auto max-w-6xl">
      <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: c.primary }}>{t(prod.eyebrow, "Our offering")}</span>
      <h1 className="mt-3 text-4xl font-extrabold tracking-tight sm:text-5xl" style={{ fontFamily: heading }}>{t(prod.title, "Products & services")}</h1>
      <p className="mt-4 max-w-2xl text-lg break-words" style={{ color: mix(c.foreground, 64) }}>{t(prod.subtitle, t(feat.subtitle))}</p>
    </div>
  </section>
  <section className="px-6 pb-20">
    <div className="mx-auto grid max-w-6xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {items.map(function(p, i){ return (
        <motion.div key={i} initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4, delay: (i % 3) * 0.05 }} className="group flex flex-col overflow-hidden rounded-2xl" style={{ background: mix(c.foreground, 4), border: "1px solid " + mix(c.border, 70) }}>
          <div className="overflow-hidden" style={{ aspectRatio: "4/3", background: mix(c.primary, 12) }}>
            {imgAt(i) ? (<img src={imgAt(i)} alt={t(p.name, "")} className="block h-full w-full transition-transform duration-500 group-hover:scale-105" style={{ objectFit: "cover" }} />) : null}
          </div>
          <div className="flex flex-1 flex-col p-5">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-lg font-semibold break-words" style={{ fontFamily: heading }}>{t(p.name, "Item " + (i + 1))}</h3>
              {t(p.price) ? (<span className="shrink-0 text-sm font-bold" style={{ color: c.primary }}>{p.price}</span>) : null}
            </div>
            <p className="mt-2 flex-1 text-sm leading-relaxed break-words" style={{ color: mix(c.foreground, 64) }}>{t(p.blurb)}</p>
            <a href="/contact" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold" style={{ color: c.primary }}>{t(prod.cta, "Inquire")} <Icon name="ArrowRight" className="h-4 w-4" /></a>
          </div>
        </motion.div>); })}
    </div>
  </section>
  ${FOOTER}
</div>);
`)

/** About / company-story page. */
const ABOUT_PAGE = makeComponent(`
var about = co.about || {};
var story = arr(about.story);
if (!story.length && t(show.body)) story = [show.body];
var values = arr(about.values);
if (!values.length) values = arr(feat.items);
var stats = arr(about.stats);
if (!stats.length) stats = arr(co.stats);
return (
<div style={{ background: c.background, color: c.foreground, fontFamily: bodyFont }}>
  ${NAV}
  <section className="px-6 pt-16 pb-10">
    <div className="mx-auto max-w-3xl text-center">
      <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: c.primary }}>{t(about.eyebrow, "About us")}</span>
      <h1 className="mt-3 text-4xl font-extrabold tracking-tight sm:text-5xl" style={{ fontFamily: heading }}>{t(about.title, "Our story")}</h1>
      <p className="mx-auto mt-5 max-w-2xl text-lg break-words" style={{ color: mix(c.foreground, 64) }}>{t(about.lead, t(hero.subtitle))}</p>
    </div>
  </section>
  <section className="px-6 pb-16">
    <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-2">
      <div className="overflow-hidden rounded-2xl" style={{ border: "1px solid " + mix(c.border, 70), aspectRatio: "4/3", background: mix(c.primary, 12) }}>
        {imgAt(0) ? (<img src={imgAt(0)} alt={t(about.title, brand)} className="block h-full w-full" style={{ objectFit: "cover" }} />) : null}
      </div>
      <div className="min-w-[18rem]">
        {story.length ? story.map(function(p, i){ return (<p key={i} className="mb-4 text-base leading-relaxed break-words" style={{ color: mix(c.foreground, 74) }}>{p}</p>); }) : null}
      </div>
    </div>
  </section>
  {values.length ? (
  <section className="px-6 py-16" style={{ background: mix(c.foreground, 3) }}>
    <h2 className="mx-auto mb-10 max-w-2xl text-center text-3xl font-bold tracking-tight" style={{ fontFamily: heading }}>{t(about.valuesTitle, "What we stand for")}</h2>
    <div className="mx-auto grid max-w-5xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {values.map(function(v, i){ return (<div key={i} className="rounded-2xl p-6" style={{ background: c.background, border: "1px solid " + mix(c.border, 70) }}><div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl" style={{ background: mix(c.primary, 16), color: c.primary }}><Icon name={t(v.icon, "Check")} className="h-5 w-5" /></div><h3 className="text-lg font-semibold break-words" style={{ fontFamily: heading }}>{t(v.title)}</h3><p className="mt-2 text-sm leading-relaxed break-words" style={{ color: mix(c.foreground, 64) }}>{t(v.body)}</p></div>); })}
    </div>
  </section>) : null}
  {stats.length ? (
  <section className="px-6 py-14">
    <div className="mx-auto grid max-w-4xl gap-8 text-center sm:grid-cols-3">
      {stats.map(function(s, i){ return (<div key={i}><div className="text-4xl font-extrabold" style={{ fontFamily: heading, color: c.primary }}>{s.value}</div><div className="mt-1 text-sm" style={{ color: mix(c.foreground, 60) }}>{s.label}</div></div>); })}
    </div>
  </section>) : null}
  ${FOOTER}
</div>);
`)

/** Contact page with company details + a (non-submitting) enquiry form. */
const CONTACT_PAGE = makeComponent(`
var contact = co.contact || {};
var rows = [
  { icon: "Mail", label: t(contact.emailLabel, "Email"), value: t(contact.email) },
  { icon: "Phone", label: t(contact.phoneLabel, "Phone"), value: t(contact.phone) },
  { icon: "MapPin", label: t(contact.addressLabel, "Address"), value: t(contact.address) },
  { icon: "Clock", label: t(contact.hoursLabel, "Hours"), value: t(contact.hours) },
].filter(function(r){ return r.value; });
return (
<div style={{ background: c.background, color: c.foreground, fontFamily: bodyFont }}>
  ${NAV}
  <section className="px-6 pt-16 pb-10">
    <div className="mx-auto max-w-3xl text-center">
      <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: c.primary }}>{t(contact.eyebrow, "Contact")}</span>
      <h1 className="mt-3 text-4xl font-extrabold tracking-tight sm:text-5xl" style={{ fontFamily: heading }}>{t(contact.title, "Get in touch")}</h1>
      <p className="mx-auto mt-5 max-w-2xl text-lg break-words" style={{ color: mix(c.foreground, 64) }}>{t(contact.intro, t(hero.subtitle))}</p>
    </div>
  </section>
  <section className="px-6 pb-20">
    <div className="mx-auto grid max-w-5xl gap-10 lg:grid-cols-2">
      <div className="space-y-4">
        {rows.length ? rows.map(function(r, i){ return (<div key={i} className="flex items-start gap-4 rounded-2xl p-5" style={{ background: mix(c.foreground, 4), border: "1px solid " + mix(c.border, 70) }}><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ background: mix(c.primary, 16), color: c.primary }}><Icon name={r.icon} className="h-5 w-5" /></div><div className="min-w-0"><div className="text-xs font-semibold uppercase tracking-wide" style={{ color: mix(c.foreground, 55) }}>{r.label}</div><div className="mt-1 break-words text-base font-medium">{r.value}</div></div></div>); }) : null}
      </div>
      <form onSubmit={function(e){ e.preventDefault(); }} className="rounded-2xl p-6" style={{ background: mix(c.foreground, 4), border: "1px solid " + mix(c.border, 70) }}>
        <div className="grid gap-4">
          <input type="text" placeholder={t(contact.namePlaceholder, "Your name")} className="w-full rounded-lg px-4 py-3 text-sm outline-none" style={{ background: c.background, border: "1px solid " + mix(c.border, 70), color: c.foreground }} />
          <input type="email" placeholder={t(contact.emailPlaceholder, "Your email")} className="w-full rounded-lg px-4 py-3 text-sm outline-none" style={{ background: c.background, border: "1px solid " + mix(c.border, 70), color: c.foreground }} />
          <textarea rows={5} placeholder={t(contact.messagePlaceholder, "How can we help?")} className="w-full rounded-lg px-4 py-3 text-sm outline-none" style={{ background: c.background, border: "1px solid " + mix(c.border, 70), color: c.foreground }} />
          <button type="submit" className="rounded-full px-6 py-3 text-sm font-semibold" style={{ background: c.primary, color: c.primaryForeground }}>{t(contact.submitLabel, "Send message")}</button>
        </div>
      </form>
    </div>
  </section>
  ${FOOTER}
</div>);
`)

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

/* ---- 9. Taxonomy Editorial SaaS (shadcn-ui/taxonomy ⭐25k) -------------- */

const TAXONOMY_CODE = makeComponent(`
var feats = arr(feat.items);
var logos = arr(co.logos);
var pricing = arr(co.pricing);
var faqs = arr(co.faq);
var tess = arr(co.testimonials);
return (
<div style={{ background: c.background, color: c.foreground, fontFamily: bodyFont }}>
  ${NAV}
  <section className="px-6 pt-24 pb-16 text-center">
    {t(hero.eyebrow) ? (<a href="#" className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-medium" style={{ background: mix(c.foreground, 5), border: "1px solid " + mix(c.border, 70), color: mix(c.foreground, 70) }}><Icon name="Sparkles" className="h-3.5 w-3.5" style={{ color: c.primary }} />{hero.eyebrow}</a>) : null}
    <h1 className="mx-auto max-w-4xl text-balance text-5xl font-extrabold leading-[1.03] tracking-tight sm:text-7xl" style={{ fontFamily: heading }}>{t(hero.title, brand)}</h1>
    <p className="mx-auto mt-6 max-w-2xl text-lg" style={{ color: mix(c.foreground, 60) }}>{t(hero.subtitle)}</p>
    <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
      <a href={t((hero.primaryCta||{}).href, "#")} className="rounded-full px-7 py-3 text-sm font-semibold transition-transform hover:-translate-y-0.5" style={{ background: c.primary, color: c.primaryForeground }}>{t((hero.primaryCta||{}).label, "Get started")}</a>
      <a href={t((hero.secondaryCta||{}).href, "#")} className="rounded-full px-7 py-3 text-sm font-semibold" style={{ border: "1px solid " + mix(c.foreground, 22), color: c.foreground }}>{t((hero.secondaryCta||{}).label, "Learn more")}</a>
    </div>
    <div className="mx-auto mt-14 max-w-5xl overflow-hidden rounded-2xl shadow-2xl" style={{ border: "1px solid " + mix(c.border, 70) }}><img src={pic("hero")} alt={t(hero.title, brand)} className="block w-full" style={{ aspectRatio: "16/9", objectFit: "cover" }} /></div>
  </section>

  {logos.length ? (<section className="px-6 pb-10"><p className="mb-6 text-center text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: mix(c.foreground, 45) }}>{t(feat.subtitle, "Trusted by modern teams")}</p><div className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-x-10 gap-y-4">{logos.map(function(l, i){ return (<span key={i} className="text-base font-bold tracking-tight" style={{ color: mix(c.foreground, 40) }}>{l}</span>); })}</div></section>) : null}

  {feats.length ? (
  <section id="features" className="px-6 py-20">
    <div className="mx-auto max-w-2xl text-center"><h2 className="text-3xl font-bold tracking-tight sm:text-4xl" style={{ fontFamily: heading }}>{t(feat.title, "Everything you need")}</h2></div>
    <div className="mx-auto mt-12 grid max-w-5xl gap-4 sm:grid-cols-2 lg:grid-cols-3">{feats.map(function(f, i){ return (<div key={i} className={"rounded-2xl p-7 " + (i === 0 ? "sm:col-span-2 lg:col-span-2" : "")} style={{ background: mix(c.foreground, 4), border: "1px solid " + mix(c.border, 60) }}><div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl" style={{ background: c.primary, color: c.primaryForeground }}><Icon name={f.icon} className="h-5 w-5" /></div><h3 className="text-lg font-semibold" style={{ fontFamily: heading }}>{f.title}</h3><p className="mt-2 text-sm leading-relaxed" style={{ color: mix(c.foreground, 60) }}>{f.body}</p></div>); })}</div>
  </section>) : null}

  {pricing.length ? (
  <section id="pricing" className="px-6 py-20" style={{ background: mix(c.foreground, 3) }}>
    <h2 className="mb-10 text-center text-3xl font-bold tracking-tight sm:text-4xl" style={{ fontFamily: heading }}>Simple, transparent pricing</h2>
    <div className="mx-auto grid max-w-3xl gap-6 md:grid-cols-2">{pricing.map(function(p, i){ return (<div key={i} className="rounded-3xl p-8" style={{ background: c.background, border: "1px solid " + (p.highlighted ? c.primary : mix(c.border, 65)), boxShadow: p.highlighted ? "0 24px 50px -24px " + mix(c.primary, 55) : "none" }}><div className="text-sm font-semibold" style={{ color: mix(c.foreground, 65) }}>{p.name}</div><div className="mt-2 text-5xl font-extrabold tracking-tight" style={{ fontFamily: heading }}>{p.price}<span className="text-base font-normal" style={{ color: mix(c.foreground, 50) }}>{t(p.period)}</span></div><ul className="mt-6 space-y-3">{arr(p.features).map(function(ft, j){ return (<li key={j} className="flex items-start gap-2 text-sm" style={{ color: mix(c.foreground, 76) }}><Icon name="Check" className="mt-0.5 h-4 w-4 shrink-0" style={{ color: c.primary }} />{ft}</li>); })}</ul><a href={t((p.cta||{}).href, "#")} className="mt-7 block rounded-full py-3 text-center text-sm font-bold" style={{ background: p.highlighted ? c.primary : "transparent", color: p.highlighted ? c.primaryForeground : c.foreground, border: p.highlighted ? "none" : "1px solid " + mix(c.foreground, 22) }}>{t((p.cta||{}).label, "Choose")}</a></div>); })}</div>
  </section>) : null}

  {tess.length ? (<section className="px-6 py-20 text-center"><div className="mx-auto max-w-3xl"><blockquote className="text-2xl font-medium leading-snug sm:text-3xl" style={{ fontFamily: heading }}>“{(tess[0]||{}).quote}”</blockquote><p className="mt-6 text-sm font-semibold">{(tess[0]||{}).name}<span className="block font-normal" style={{ color: mix(c.foreground, 55) }}>{t((tess[0]||{}).role)}</span></p></div></section>) : null}

  {faqs.length ? (<section id="faq" className="px-6 py-16"><h2 className="mb-8 text-center text-3xl font-bold tracking-tight" style={{ fontFamily: heading }}>FAQ</h2><div className="mx-auto max-w-2xl divide-y" style={{ borderColor: mix(c.border, 70) }}>{faqs.map(function(q, i){ return (<div key={i} className="py-5" style={{ borderColor: mix(c.border, 70) }}><h3 className="font-semibold" style={{ fontFamily: heading }}>{q.q}</h3><p className="mt-2 text-sm leading-relaxed" style={{ color: mix(c.foreground, 62) }}>{q.a}</p></div>); })}</div></section>) : null}

  <section className="px-6 py-20"><div className="mx-auto max-w-4xl rounded-3xl px-8 py-16 text-center" style={{ background: c.primary, color: c.primaryForeground }}><h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl" style={{ fontFamily: heading }}>{t(cta.title, "Start building today")}</h2><p className="mx-auto mt-3 max-w-lg" style={{ color: mix(c.primaryForeground, 82) }}>{t(cta.body)}</p><a href={t((cta.button||{}).href, "#")} className="mt-7 inline-block rounded-full px-8 py-3 text-sm font-bold" style={{ background: c.primaryForeground, color: c.primary }}>{t((cta.button||{}).label, "Get started")}</a></div></section>
  ${FOOTER}
</div>);
`)

/* ---- 10. Cal Booking (calcom/cal.com ⭐33k) ----------------------------- */

const CAL_CODE = makeComponent(`
var feats = arr(feat.items);
var logos = arr(co.logos);
var stats = arr(co.stats);
var tess = arr(co.testimonials);
var slots = ["9:00", "10:30", "13:00", "15:30"];
return (
<div style={{ background: c.background, color: c.foreground, fontFamily: bodyFont }}>
  ${NAV}
  <section className="px-6 pt-20 pb-14">
    <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2">
      <div>
        {t(hero.eyebrow) ? (<span className="mb-4 inline-block rounded-full px-3 py-1 text-xs font-semibold" style={{ background: mix(c.primary, 14), color: c.primary }}>{hero.eyebrow}</span>) : null}
        <h1 className="text-balance text-5xl font-extrabold leading-[1.04] tracking-tight sm:text-6xl" style={{ fontFamily: heading }}>{t(hero.title, brand)}</h1>
        <p className="mt-5 max-w-md text-lg" style={{ color: mix(c.foreground, 62) }}>{t(hero.subtitle)}</p>
        <div className="mt-8 flex flex-wrap gap-3"><a href={t((hero.primaryCta||{}).href, "#")} className="rounded-lg px-7 py-3 text-sm font-semibold shadow-md transition-transform hover:-translate-y-0.5" style={{ background: c.primary, color: c.primaryForeground }}>{t((hero.primaryCta||{}).label, "Get started")}</a><a href={t((hero.secondaryCta||{}).href, "#")} className="rounded-lg px-7 py-3 text-sm font-semibold" style={{ border: "1px solid " + mix(c.foreground, 20), color: c.foreground }}>{t((hero.secondaryCta||{}).label, "See how it works")}</a></div>
        {arr(hero.badges).length ? (<div className="mt-7 flex flex-wrap gap-x-5 gap-y-2">{arr(hero.badges).map(function(b, i){ return (<span key={i} className="flex items-center gap-1.5 text-xs font-medium" style={{ color: mix(c.foreground, 58) }}><Icon name="CircleCheck" className="h-4 w-4" style={{ color: c.primary }} />{b}</span>); })}</div>) : null}
      </div>
      <div className="rounded-3xl p-6 shadow-2xl" style={{ background: c.background, border: "1px solid " + mix(c.border, 60) }}>
        <div className="flex items-center justify-between"><span className="text-sm font-semibold" style={{ fontFamily: heading }}>{brand}</span><span className="rounded-full px-2.5 py-1 text-[10px] font-bold" style={{ background: mix(c.primary, 14), color: c.primary }}>30 min</span></div>
        <div className="mt-4 grid grid-cols-7 gap-1.5">{[1,2,3,4,5,6,7,8,9,10,11,12,13,14].map(function(d, i){ return (<div key={i} className="flex h-9 items-center justify-center rounded-lg text-xs font-medium" style={ i === 9 ? { background: c.primary, color: c.primaryForeground } : { background: mix(c.foreground, 4), color: mix(c.foreground, 60) }}>{d + 10}</div>); })}</div>
        <div className="mt-4 grid grid-cols-2 gap-2">{slots.map(function(s, i){ return (<div key={i} className="rounded-lg py-2.5 text-center text-sm font-semibold" style={ i === 1 ? { background: c.primary, color: c.primaryForeground } : { border: "1px solid " + mix(c.border, 60), color: c.foreground }}>{s}</div>); })}</div>
      </div>
    </div>
  </section>

  {logos.length ? (<section className="px-6 pb-12"><div className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-x-10 gap-y-3 opacity-70">{logos.map(function(l, i){ return (<span key={i} className="text-sm font-bold" style={{ color: mix(c.foreground, 45) }}>{l}</span>); })}</div></section>) : null}

  {feats.length ? (
  <section id="features" className="px-6 py-20" style={{ background: mix(c.foreground, 3) }}>
    <div className="mx-auto max-w-2xl text-center"><span className="text-sm font-bold uppercase tracking-wider" style={{ color: c.primary }}>{t(feat.subtitle, "Features")}</span><h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl" style={{ fontFamily: heading }}>{t(feat.title, "Scheduling, simplified")}</h2></div>
    <div className="mx-auto mt-12 grid max-w-5xl gap-6 sm:grid-cols-2 lg:grid-cols-3">{feats.map(function(f, i){ return (<div key={i} className="rounded-2xl bg-transparent p-6"><div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl" style={{ background: mix(c.primary, 14), color: c.primary }}><Icon name={f.icon} className="h-5 w-5" /></div><h3 className="font-semibold" style={{ fontFamily: heading }}>{f.title}</h3><p className="mt-2 text-sm leading-relaxed" style={{ color: mix(c.foreground, 62) }}>{f.body}</p></div>); })}</div>
  </section>) : null}

  {stats.length ? (<section className="px-6 py-16"><div className="mx-auto grid max-w-4xl gap-8 text-center sm:grid-cols-3">{stats.map(function(s, i){ return (<div key={i}><div className="text-4xl font-extrabold" style={{ fontFamily: heading, color: c.primary }}>{s.value}</div><div className="mt-1 text-sm" style={{ color: mix(c.foreground, 60) }}>{s.label}</div></div>); })}</div></section>) : null}

  {tess.length ? (<section className="px-6 pb-16"><div className="mx-auto max-w-3xl rounded-3xl p-10 text-center" style={{ background: mix(c.primary, 8) }}><Icon name="Quote" className="mx-auto h-8 w-8" style={{ color: c.primary }} /><blockquote className="mt-4 text-xl font-medium leading-snug" style={{ fontFamily: heading }}>“{(tess[0]||{}).quote}”</blockquote><p className="mt-4 text-sm font-semibold">{(tess[0]||{}).name}<span style={{ color: mix(c.foreground, 55) }}> · {t((tess[0]||{}).role)}</span></p></div></section>) : null}

  <section className="px-6 py-20 text-center" style={{ background: c.foreground, color: c.background }}><h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl" style={{ fontFamily: heading }}>{t(cta.title, "Ready when you are")}</h2><p className="mx-auto mt-3 max-w-lg" style={{ color: mix(c.background, 72) }}>{t(cta.body)}</p><a href={t((cta.button||{}).href, "#")} className="mt-7 inline-block rounded-lg px-8 py-3 text-sm font-bold" style={{ background: c.primary, color: c.primaryForeground }}>{t((cta.button||{}).label, "Book a demo")}</a></section>
  ${FOOTER}
</div>);
`)

/* ---- 11. Supabase Dev Platform (supabase/supabase ⭐73k) ---------------- */

const SUPABASE_CODE = makeComponent(`
var feats = arr(feat.items);
var stats = arr(co.stats);
var logos = arr(co.logos);
return (
<div style={{ background: c.background, color: c.foreground, fontFamily: bodyFont }}>
  ${NAV}
  <section className="relative overflow-hidden px-6 pt-20 pb-16 text-center">
    <div className="pointer-events-none absolute left-1/2 top-0 -z-10 h-72 w-[42rem] -translate-x-1/2 rounded-full blur-3xl" style={{ background: mix(c.primary, 28) }} aria-hidden="true"></div>
    {arr(hero.badges).length ? (<div className="mb-6 flex flex-wrap items-center justify-center gap-2">{arr(hero.badges).map(function(b, i){ return (<span key={i} className="rounded-full px-3 py-1 text-xs font-medium" style={{ background: mix(c.foreground, 6), border: "1px solid " + mix(c.border, 60), color: mix(c.foreground, 72) }}>{b}</span>); })}</div>) : null}
    <h1 className="mx-auto max-w-4xl text-balance text-5xl font-extrabold leading-[1.03] tracking-tight sm:text-6xl" style={{ fontFamily: heading }}>{t(hero.title, brand)}</h1>
    <p className="mx-auto mt-6 max-w-2xl text-lg" style={{ color: mix(c.foreground, 60) }}>{t(hero.subtitle)}</p>
    <div className="mt-9 flex flex-wrap items-center justify-center gap-3"><a href={t((hero.primaryCta||{}).href, "#")} className="rounded-lg px-7 py-3 text-sm font-bold" style={{ background: c.primary, color: c.primaryForeground }}>{t((hero.primaryCta||{}).label, "Start your project")}</a><a href={t((hero.secondaryCta||{}).href, "#")} className="rounded-lg px-7 py-3 text-sm font-semibold" style={{ border: "1px solid " + mix(c.foreground, 22), color: c.foreground }}>{t((hero.secondaryCta||{}).label, "Documentation")}</a></div>
    <div className="mx-auto mt-12 max-w-3xl overflow-hidden rounded-xl text-left shadow-2xl" style={{ border: "1px solid " + mix(c.border, 60), background: mix(c.foreground, 6) }}><div className="flex items-center gap-1.5 px-4 py-3" style={{ borderBottom: "1px solid " + mix(c.border, 50) }}><span className="h-3 w-3 rounded-full" style={{ background: mix(c.foreground, 22) }}></span><span className="h-3 w-3 rounded-full" style={{ background: mix(c.foreground, 22) }}></span><span className="h-3 w-3 rounded-full" style={{ background: mix(c.foreground, 22) }}></span></div><pre className="overflow-x-auto px-5 py-5 font-mono text-sm leading-relaxed" style={{ color: mix(c.foreground, 80) }}>{"const { data } = await " + brand.toLowerCase().replace(/\\s/g, "") + "\\n  .from('projects')\\n  .select('*')\\n  .limit(10)"}</pre></div>
  </section>

  {logos.length ? (<section className="px-6 pb-12"><div className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-x-10 gap-y-3 opacity-70">{logos.map(function(l, i){ return (<span key={i} className="font-mono text-sm font-semibold" style={{ color: mix(c.foreground, 45) }}>{l}</span>); })}</div></section>) : null}

  {feats.length ? (
  <section id="features" className="px-6 py-20">
    <div className="mx-auto max-w-2xl text-center"><h2 className="text-3xl font-bold tracking-tight sm:text-4xl" style={{ fontFamily: heading }}>{t(feat.title, "Build in a weekend, scale to millions")}</h2></div>
    <div className="mx-auto mt-12 grid max-w-6xl gap-px overflow-hidden rounded-2xl" style={{ background: mix(c.border, 55) }}><div className="grid gap-px sm:grid-cols-2 lg:grid-cols-3" style={{ background: mix(c.border, 55) }}>{feats.map(function(f, i){ return (<div key={i} className="p-7" style={{ background: c.background }}><div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg" style={{ background: mix(c.primary, 16), color: c.primary }}><Icon name={f.icon} className="h-5 w-5" /></div><h3 className="font-semibold" style={{ fontFamily: heading }}>{f.title}</h3><p className="mt-2 text-sm leading-relaxed" style={{ color: mix(c.foreground, 60) }}>{f.body}</p></div>); })}</div></div>
  </section>) : null}

  {stats.length ? (<section className="px-6 py-12" style={{ background: mix(c.primary, 8) }}><div className="mx-auto grid max-w-5xl gap-8 text-center sm:grid-cols-4">{stats.map(function(s, i){ return (<div key={i}><div className="text-4xl font-extrabold" style={{ fontFamily: heading, color: c.primary }}>{s.value}</div><div className="mt-1 text-xs font-semibold uppercase tracking-wide" style={{ color: mix(c.foreground, 60) }}>{s.label}</div></div>); })}</div></section>) : null}

  {(t(show.title) || arr(show.bullets).length) ? (
  <section className="px-6 py-20"><div className="mx-auto grid max-w-5xl items-center gap-12 lg:grid-cols-2"><div><h2 className="text-3xl font-bold tracking-tight sm:text-4xl" style={{ fontFamily: heading }}>{t(show.title)}</h2><p className="mt-4 text-base" style={{ color: mix(c.foreground, 62) }}>{t(show.body)}</p><ul className="mt-6 space-y-3">{arr(show.bullets).map(function(b, i){ return (<li key={i} className="flex items-start gap-3"><Icon name="Zap" className="mt-0.5 h-5 w-5 shrink-0" style={{ color: c.primary }} /><span className="text-sm" style={{ color: mix(c.foreground, 76) }}>{b}</span></li>); })}</ul></div><div className="overflow-hidden rounded-2xl shadow-xl" style={{ border: "1px solid " + mix(c.border, 60) }}><img src={pic("showcase")} alt={t(show.title, "")} className="block w-full" style={{ aspectRatio: "4/3", objectFit: "cover" }} /></div></div></section>) : null}

  <section className="px-6 py-20 text-center"><h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl" style={{ fontFamily: heading }}>{t(cta.title, "Start building in seconds")}</h2><p className="mx-auto mt-3 max-w-lg" style={{ color: mix(c.foreground, 60) }}>{t(cta.body)}</p><a href={t((cta.button||{}).href, "#")} className="mt-7 inline-block rounded-lg px-8 py-3 text-sm font-bold" style={{ background: c.primary, color: c.primaryForeground }}>{t((cta.button||{}).label, "Start your project")}</a></section>
  ${FOOTER}
</div>);
`)

/* ---- 12. Medusa Storefront (medusajs/medusa ⭐27k) ---------------------- */

const MEDUSA_CODE = makeComponent(`
var prods = arr(feat.items);
var gal = ["g0","g1","g2","g3"];
var stats = arr(co.stats);
return (
<div style={{ background: c.background, color: c.foreground, fontFamily: bodyFont }}>
  ${NAV}
  <section className="px-6 pt-10 pb-8">
    <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-3">
      <div className="relative overflow-hidden rounded-3xl lg:col-span-2" style={{ minHeight: "60vh" }}>
        <img src={pic("hero")} alt={t(hero.title, brand)} className="absolute inset-0 h-full w-full" style={{ objectFit: "cover" }} />
        <div className="absolute inset-0" style={{ background: "linear-gradient(to top right, " + mix(c.foreground, 65) + ", transparent)" }}></div>
        <div className="absolute bottom-0 left-0 p-8 sm:p-10" style={{ color: "#fff" }}>
          {t(hero.eyebrow) ? (<span className="mb-3 inline-block rounded-full px-3 py-1 text-xs font-semibold" style={{ background: "rgba(255,255,255,0.2)" }}>{hero.eyebrow}</span>) : null}
          <h1 className="max-w-xl text-balance text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl" style={{ fontFamily: heading }}>{t(hero.title, brand)}</h1>
          <a href={t((hero.primaryCta||{}).href, "#")} className="mt-5 inline-block rounded-full px-7 py-3 text-sm font-semibold" style={{ background: "#fff", color: c.foreground }}>{t((hero.primaryCta||{}).label, "Shop now")}</a>
        </div>
      </div>
      <div className="flex flex-col justify-end rounded-3xl p-8" style={{ background: c.primary, color: c.primaryForeground }}>
        <Icon name="Sparkles" className="h-7 w-7" />
        <h2 className="mt-4 text-2xl font-bold leading-tight" style={{ fontFamily: heading }}>{t(hero.subtitle, "New season, new essentials")}</h2>
        <a href={t((hero.secondaryCta||{}).href, "#")} className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold">{t((hero.secondaryCta||{}).label, "Explore the collection")} <Icon name="ArrowRight" className="h-4 w-4" /></a>
      </div>
    </div>
  </section>

  {prods.length ? (
  <section id="products" className="px-6 py-14">
    <div className="mx-auto mb-8 flex max-w-6xl items-end justify-between"><h2 className="text-2xl font-bold tracking-tight sm:text-3xl" style={{ fontFamily: heading }}>{t(feat.title, "Featured products")}</h2><a href="#" className="text-sm font-semibold" style={{ color: c.primary }}>View all</a></div>
    <div className="mx-auto grid max-w-6xl gap-4 sm:grid-cols-2 lg:grid-cols-4">{prods.map(function(p, i){ return (<div key={i} className="group"><div className="overflow-hidden rounded-2xl" style={{ background: mix(c.foreground, 5) }}><img src={images[_img[gal[i % 4]]] || images[_img["showcase"]] || images[0] || ""} alt={p.title} className="block w-full transition-transform duration-500 group-hover:scale-105" style={{ aspectRatio: "3/4", objectFit: "cover" }} /></div><div className="mt-3 flex items-start justify-between"><div><h3 className="text-sm font-semibold" style={{ fontFamily: heading }}>{p.title}</h3><p className="text-xs" style={{ color: mix(c.foreground, 55) }}>{p.body}</p></div><span className="text-sm font-bold" style={{ color: c.primary }}>{t(p.icon, "")}</span></div></div>); })}</div>
  </section>) : null}

  {(t(show.title) || arr(show.bullets).length) ? (
  <section className="px-6 py-16" style={{ background: mix(c.foreground, 4) }}><div className="mx-auto grid max-w-5xl items-center gap-10 lg:grid-cols-2"><div><h2 className="text-3xl font-bold tracking-tight sm:text-4xl" style={{ fontFamily: heading }}>{t(show.title)}</h2><p className="mt-4 text-base" style={{ color: mix(c.foreground, 64) }}>{t(show.body)}</p><ul className="mt-5 space-y-2">{arr(show.bullets).map(function(b, i){ return (<li key={i} className="flex items-center gap-2 text-sm" style={{ color: mix(c.foreground, 76) }}><Icon name="Check" className="h-4 w-4" style={{ color: c.primary }} />{b}</li>); })}</ul></div><div className="overflow-hidden rounded-3xl"><img src={pic("showcase")} alt={t(show.title, "")} className="block w-full" style={{ aspectRatio: "4/3", objectFit: "cover" }} /></div></div></section>) : null}

  {stats.length ? (<section className="px-6 py-12"><div className="mx-auto grid max-w-4xl gap-8 text-center sm:grid-cols-3">{stats.map(function(s, i){ return (<div key={i}><div className="text-4xl font-extrabold" style={{ fontFamily: heading, color: c.primary }}>{s.value}</div><div className="mt-1 text-sm" style={{ color: mix(c.foreground, 60) }}>{s.label}</div></div>); })}</div></section>) : null}

  <section className="px-6 py-20 text-center"><h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl" style={{ fontFamily: heading }}>{t(cta.title, "Join the collection")}</h2><p className="mx-auto mt-3 max-w-lg" style={{ color: mix(c.foreground, 60) }}>{t(cta.body)}</p><a href={t((cta.button||{}).href, "#")} className="mt-7 inline-block rounded-full px-8 py-3 text-sm font-bold" style={{ background: c.primary, color: c.primaryForeground }}>{t((cta.button||{}).label, "Shop the store")}</a></section>
  ${FOOTER}
</div>);
`)

/* ---- 13. Appwrite Cloud (appwrite/appwrite ⭐47k) ----------------------- */

const APPWRITE_CODE = makeComponent(`
var feats = arr(feat.items);
var pricing = arr(co.pricing);
var faqs = arr(co.faq);
var stats = arr(co.stats);
return (
<div style={{ background: c.background, color: c.foreground, fontFamily: bodyFont }}>
  ${NAV}
  <section className="relative overflow-hidden px-6 pt-20 pb-16">
    <div className="pointer-events-none absolute -right-32 top-0 -z-10 h-96 w-96 rounded-full blur-3xl" style={{ background: mix(c.primary, 30) }} aria-hidden="true"></div>
    <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2">
      <div>
        {arr(hero.badges).length ? (<div className="mb-5 flex flex-wrap gap-2">{arr(hero.badges).map(function(b, i){ return (<span key={i} className="rounded-full px-3 py-1 text-xs font-semibold" style={{ background: mix(c.primary, 14), color: c.primary, border: "1px solid " + mix(c.primary, 26) }}>{b}</span>); })}</div>) : null}
        <h1 className="text-balance text-5xl font-extrabold leading-[1.03] tracking-tight sm:text-6xl" style={{ fontFamily: heading }}>{t(hero.title, brand)}</h1>
        <p className="mt-5 max-w-md text-lg" style={{ color: mix(c.foreground, 62) }}>{t(hero.subtitle)}</p>
        <div className="mt-8 flex flex-wrap gap-3"><a href={t((hero.primaryCta||{}).href, "#")} className="rounded-xl px-7 py-3 text-sm font-bold" style={{ background: c.primary, color: c.primaryForeground }}>{t((hero.primaryCta||{}).label, "Get started")}</a><a href={t((hero.secondaryCta||{}).href, "#")} className="rounded-xl px-7 py-3 text-sm font-semibold" style={{ border: "1px solid " + mix(c.foreground, 22), color: c.foreground }}>{t((hero.secondaryCta||{}).label, "Read the docs")}</a></div>
      </div>
      <div className="relative"><div className="overflow-hidden rounded-3xl shadow-2xl" style={{ border: "1px solid " + mix(c.border, 60) }}><img src={pic("hero")} alt={t(hero.title, brand)} className="block w-full" style={{ aspectRatio: "4/3", objectFit: "cover" }} /></div></div>
    </div>
  </section>

  {feats.length ? (
  <section id="features" className="px-6 py-20">
    <div className="mx-auto max-w-2xl text-center"><span className="text-sm font-bold uppercase tracking-wider" style={{ color: c.primary }}>{t(feat.subtitle, "Platform")}</span><h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl" style={{ fontFamily: heading }}>{t(feat.title, "Your backend, fully managed")}</h2></div>
    <div className="mx-auto mt-12 grid max-w-5xl gap-5 sm:grid-cols-2 lg:grid-cols-3">{feats.map(function(f, i){ return (<div key={i} className="rounded-2xl p-6 transition-transform hover:-translate-y-1" style={{ background: mix(c.foreground, 4), border: "1px solid " + mix(c.border, 60) }}><div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl" style={{ background: c.primary, color: c.primaryForeground }}><Icon name={f.icon} className="h-5 w-5" /></div><h3 className="font-semibold" style={{ fontFamily: heading }}>{f.title}</h3><p className="mt-2 text-sm leading-relaxed" style={{ color: mix(c.foreground, 62) }}>{f.body}</p></div>); })}</div>
  </section>) : null}

  {stats.length ? (<section className="px-6 py-12"><div className="mx-auto grid max-w-5xl gap-8 rounded-3xl p-10 text-center sm:grid-cols-4" style={{ background: mix(c.primary, 10) }}>{stats.map(function(s, i){ return (<div key={i}><div className="text-4xl font-extrabold" style={{ fontFamily: heading, color: c.primary }}>{s.value}</div><div className="mt-1 text-xs font-semibold uppercase tracking-wide" style={{ color: mix(c.foreground, 60) }}>{s.label}</div></div>); })}</div></section>) : null}

  {pricing.length ? (
  <section id="pricing" className="px-6 py-20" style={{ background: mix(c.foreground, 3) }}>
    <h2 className="mb-10 text-center text-3xl font-bold tracking-tight sm:text-4xl" style={{ fontFamily: heading }}>Pricing that scales with you</h2>
    <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-3">{pricing.map(function(p, i){ return (<div key={i} className="rounded-3xl p-7" style={{ background: c.background, border: "1px solid " + (p.highlighted ? c.primary : mix(c.border, 65)), boxShadow: p.highlighted ? "0 24px 50px -24px " + mix(c.primary, 55) : "none" }}><div className="text-sm font-semibold">{p.name}</div><div className="mt-2 text-4xl font-extrabold" style={{ fontFamily: heading }}>{p.price}<span className="text-sm font-normal" style={{ color: mix(c.foreground, 50) }}>{t(p.period)}</span></div><ul className="mt-5 space-y-2">{arr(p.features).map(function(ft, j){ return (<li key={j} className="flex items-center gap-2 text-sm" style={{ color: mix(c.foreground, 75) }}><Icon name="Check" className="h-4 w-4" style={{ color: c.primary }} />{ft}</li>); })}</ul><a href={t((p.cta||{}).href, "#")} className="mt-6 block rounded-xl py-2.5 text-center text-sm font-bold" style={{ background: p.highlighted ? c.primary : "transparent", color: p.highlighted ? c.primaryForeground : c.foreground, border: p.highlighted ? "none" : "1px solid " + mix(c.foreground, 22) }}>{t((p.cta||{}).label, "Choose plan")}</a></div>); })}</div>
  </section>) : null}

  {faqs.length ? (<section id="faq" className="px-6 py-16"><h2 className="mb-8 text-center text-3xl font-bold tracking-tight" style={{ fontFamily: heading }}>Frequently asked questions</h2><div className="mx-auto max-w-2xl divide-y" style={{ borderColor: mix(c.border, 70) }}>{faqs.map(function(q, i){ return (<div key={i} className="py-5" style={{ borderColor: mix(c.border, 70) }}><h3 className="font-semibold" style={{ fontFamily: heading }}>{q.q}</h3><p className="mt-2 text-sm leading-relaxed" style={{ color: mix(c.foreground, 62) }}>{q.a}</p></div>); })}</div></section>) : null}

  <section className="px-6 py-20"><div className="mx-auto max-w-4xl rounded-3xl px-8 py-16 text-center" style={{ background: c.primary, color: c.primaryForeground }}><h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl" style={{ fontFamily: heading }}>{t(cta.title, "Build your next idea")}</h2><p className="mx-auto mt-3 max-w-lg" style={{ color: mix(c.primaryForeground, 82) }}>{t(cta.body)}</p><a href={t((cta.button||{}).href, "#")} className="mt-7 inline-block rounded-xl px-8 py-3 text-sm font-bold" style={{ background: c.primaryForeground, color: c.primary }}>{t((cta.button||{}).label, "Start free")}</a></div></section>
  ${FOOTER}
</div>);
`)

/* ---- 14. Documenso Trust (documenso/documenso ⭐11k) -------------------- */

const DOCUMENSO_CODE = makeComponent(`
var feats = arr(feat.items);
var steps = arr(show.bullets);
var stats = arr(co.stats);
var tess = arr(co.testimonials);
var logos = arr(co.logos);
return (
<div style={{ background: c.background, color: c.foreground, fontFamily: bodyFont }}>
  ${NAV}
  <section className="px-6 pt-24 pb-14 text-center">
    {t(hero.eyebrow) ? (<span className="mb-5 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold" style={{ background: mix(c.primary, 12), color: c.primary }}><Icon name="ShieldCheck" className="h-3.5 w-3.5" />{hero.eyebrow}</span>) : null}
    <h1 className="mx-auto max-w-3xl text-balance text-5xl font-extrabold leading-[1.04] tracking-tight sm:text-6xl" style={{ fontFamily: heading }}>{t(hero.title, brand)}</h1>
    <p className="mx-auto mt-6 max-w-xl text-lg" style={{ color: mix(c.foreground, 60) }}>{t(hero.subtitle)}</p>
    <div className="mt-8 flex flex-wrap items-center justify-center gap-3"><a href={t((hero.primaryCta||{}).href, "#")} className="rounded-lg px-7 py-3 text-sm font-bold" style={{ background: c.primary, color: c.primaryForeground }}>{t((hero.primaryCta||{}).label, "Get started")}</a><a href={t((hero.secondaryCta||{}).href, "#")} className="rounded-lg px-7 py-3 text-sm font-semibold" style={{ border: "1px solid " + mix(c.foreground, 20), color: c.foreground }}>{t((hero.secondaryCta||{}).label, "Contact sales")}</a></div>
    <div className="mx-auto mt-14 max-w-4xl overflow-hidden rounded-2xl shadow-2xl" style={{ border: "1px solid " + mix(c.border, 65) }}><img src={pic("hero")} alt={t(hero.title, brand)} className="block w-full" style={{ aspectRatio: "16/9", objectFit: "cover" }} /></div>
  </section>

  {logos.length ? (<section className="px-6 pb-10"><p className="mb-6 text-center text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: mix(c.foreground, 45) }}>Trusted by teams at</p><div className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-x-10 gap-y-3">{logos.map(function(l, i){ return (<span key={i} className="text-base font-bold" style={{ color: mix(c.foreground, 42) }}>{l}</span>); })}</div></section>) : null}

  {feats.length ? (
  <section id="features" className="px-6 py-20" style={{ background: mix(c.foreground, 3) }}>
    <div className="mx-auto max-w-2xl text-center"><h2 className="text-3xl font-bold tracking-tight sm:text-4xl" style={{ fontFamily: heading }}>{t(feat.title, "Built for trust")}</h2></div>
    <div className="mx-auto mt-12 grid max-w-5xl gap-6 sm:grid-cols-2 lg:grid-cols-3">{feats.map(function(f, i){ return (<div key={i} className="rounded-2xl p-6" style={{ background: c.background, border: "1px solid " + mix(c.border, 60) }}><div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl" style={{ background: mix(c.primary, 14), color: c.primary }}><Icon name={f.icon} className="h-5 w-5" /></div><h3 className="font-semibold" style={{ fontFamily: heading }}>{f.title}</h3><p className="mt-2 text-sm leading-relaxed" style={{ color: mix(c.foreground, 62) }}>{f.body}</p></div>); })}</div>
  </section>) : null}

  {steps.length ? (
  <section className="px-6 py-20"><div className="mx-auto max-w-4xl"><h2 className="mb-12 text-center text-3xl font-bold tracking-tight" style={{ fontFamily: heading }}>{t(show.title, "How it works")}</h2><div className="grid gap-8 sm:grid-cols-3">{steps.map(function(b, i){ return (<div key={i} className="text-center"><div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full text-lg font-extrabold" style={{ background: c.primary, color: c.primaryForeground, fontFamily: heading }}>{i + 1}</div><p className="text-sm leading-relaxed" style={{ color: mix(c.foreground, 72) }}>{b}</p></div>); })}</div></div></section>) : null}

  {stats.length ? (<section className="px-6 py-12" style={{ background: c.foreground, color: c.background }}><div className="mx-auto grid max-w-4xl gap-8 text-center sm:grid-cols-3">{stats.map(function(s, i){ return (<div key={i}><div className="text-4xl font-extrabold" style={{ fontFamily: heading }}>{s.value}</div><div className="mt-1 text-xs font-semibold uppercase tracking-wide" style={{ color: mix(c.background, 70) }}>{s.label}</div></div>); })}</div></section>) : null}

  {tess.length ? (<section className="px-6 py-20 text-center"><div className="mx-auto max-w-3xl"><blockquote className="text-2xl font-medium leading-snug" style={{ fontFamily: heading }}>“{(tess[0]||{}).quote}”</blockquote><p className="mt-5 text-sm font-semibold">{(tess[0]||{}).name}<span className="block font-normal" style={{ color: mix(c.foreground, 55) }}>{t((tess[0]||{}).role)}</span></p></div></section>) : null}

  <section className="px-6 py-20"><div className="mx-auto max-w-4xl rounded-3xl px-8 py-14 text-center" style={{ background: mix(c.primary, 10), border: "1px solid " + mix(c.primary, 24) }}><h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl" style={{ fontFamily: heading }}>{t(cta.title, "Ready to get started?")}</h2><p className="mx-auto mt-3 max-w-lg" style={{ color: mix(c.foreground, 64) }}>{t(cta.body)}</p><a href={t((cta.button||{}).href, "#")} className="mt-7 inline-block rounded-lg px-8 py-3 text-sm font-bold" style={{ background: c.primary, color: c.primaryForeground }}>{t((cta.button||{}).label, "Get started")}</a></div></section>
  ${FOOTER}
</div>);
`)

/* ---- 15. Twenty CRM (twentyhq/twenty ⭐27k) ----------------------------- */

const TWENTY_CODE = makeComponent(`
var feats = arr(feat.items);
var logos = arr(co.logos);
var stats = arr(co.stats);
return (
<div style={{ background: c.background, color: c.foreground, fontFamily: bodyFont }}>
  ${NAV}
  <section className="px-6 pt-20 pb-12 text-center">
    {arr(hero.badges).length ? (<div className="mb-6 flex flex-wrap items-center justify-center gap-2">{arr(hero.badges).map(function(b, i){ return (<span key={i} className="rounded-full px-3 py-1 text-xs font-semibold" style={{ background: mix(c.primary, 12), color: c.primary }}>{b}</span>); })}</div>) : null}
    <h1 className="mx-auto max-w-3xl text-balance text-5xl font-extrabold leading-[1.03] tracking-tight sm:text-6xl" style={{ fontFamily: heading }}>{t(hero.title, brand)}</h1>
    <p className="mx-auto mt-6 max-w-xl text-lg" style={{ color: mix(c.foreground, 60) }}>{t(hero.subtitle)}</p>
    <div className="mt-8 flex flex-wrap items-center justify-center gap-3"><a href={t((hero.primaryCta||{}).href, "#")} className="rounded-lg px-7 py-3 text-sm font-bold" style={{ background: c.primary, color: c.primaryForeground }}>{t((hero.primaryCta||{}).label, "Start for free")}</a><a href={t((hero.secondaryCta||{}).href, "#")} className="rounded-lg px-7 py-3 text-sm font-semibold" style={{ border: "1px solid " + mix(c.foreground, 20), color: c.foreground }}>{t((hero.secondaryCta||{}).label, "Live demo")}</a></div>
    <div className="mx-auto mt-12 max-w-5xl overflow-hidden rounded-2xl shadow-2xl" style={{ border: "1px solid " + mix(c.border, 65) }}><img src={pic("hero")} alt={t(hero.title, brand)} className="block w-full" style={{ aspectRatio: "16/9", objectFit: "cover" }} /></div>
  </section>

  {logos.length ? (<section className="px-6 pb-12"><div className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-x-10 gap-y-3 opacity-70">{logos.map(function(l, i){ return (<span key={i} className="text-sm font-bold" style={{ color: mix(c.foreground, 45) }}>{l}</span>); })}</div></section>) : null}

  {feats.length ? (
  <section id="features" className="px-6 py-20" style={{ background: mix(c.foreground, 3) }}>
    <div className="mx-auto max-w-2xl text-center"><h2 className="text-3xl font-bold tracking-tight sm:text-4xl" style={{ fontFamily: heading }}>{t(feat.title, "Everything your team needs")}</h2></div>
    <div className="mx-auto mt-12 grid max-w-5xl gap-5 sm:grid-cols-2">{feats.map(function(f, i){ return (<div key={i} className="flex items-start gap-4 rounded-2xl p-6" style={{ background: c.background, border: "1px solid " + mix(c.border, 60) }}><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ background: mix(c.primary, 14), color: c.primary }}><Icon name={f.icon} className="h-5 w-5" /></div><div><h3 className="font-semibold" style={{ fontFamily: heading }}>{f.title}</h3><p className="mt-1.5 text-sm leading-relaxed" style={{ color: mix(c.foreground, 62) }}>{f.body}</p></div></div>); })}</div>
  </section>) : null}

  {(t(show.title) || arr(show.bullets).length) ? (
  <section className="px-6 py-20"><div className="mx-auto grid max-w-5xl items-center gap-12 lg:grid-cols-2"><div className="overflow-hidden rounded-2xl shadow-xl" style={{ border: "1px solid " + mix(c.border, 60) }}><img src={pic("showcase")} alt={t(show.title, "")} className="block w-full" style={{ aspectRatio: "4/3", objectFit: "cover" }} /></div><div><h2 className="text-3xl font-bold tracking-tight sm:text-4xl" style={{ fontFamily: heading }}>{t(show.title)}</h2><p className="mt-4 text-base" style={{ color: mix(c.foreground, 62) }}>{t(show.body)}</p><ul className="mt-6 space-y-3">{arr(show.bullets).map(function(b, i){ return (<li key={i} className="flex items-start gap-3"><Icon name="CircleCheck" className="mt-0.5 h-5 w-5 shrink-0" style={{ color: c.primary }} /><span className="text-sm" style={{ color: mix(c.foreground, 76) }}>{b}</span></li>); })}</ul></div></div></section>) : null}

  {stats.length ? (<section className="px-6 py-12" style={{ background: mix(c.primary, 8) }}><div className="mx-auto grid max-w-5xl gap-8 text-center sm:grid-cols-4">{stats.map(function(s, i){ return (<div key={i}><div className="text-4xl font-extrabold" style={{ fontFamily: heading, color: c.primary }}>{s.value}</div><div className="mt-1 text-xs font-semibold uppercase tracking-wide" style={{ color: mix(c.foreground, 60) }}>{s.label}</div></div>); })}</div></section>) : null}

  <section className="px-6 py-20 text-center"><h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl" style={{ fontFamily: heading }}>{t(cta.title, "The CRM your team will love")}</h2><p className="mx-auto mt-3 max-w-lg" style={{ color: mix(c.foreground, 60) }}>{t(cta.body)}</p><a href={t((cta.button||{}).href, "#")} className="mt-7 inline-block rounded-lg px-8 py-3 text-sm font-bold" style={{ background: c.primary, color: c.primaryForeground }}>{t((cta.button||{}).label, "Get started")}</a></section>
  ${FOOTER}
</div>);
`)

/* ---- 16. Dub Marketing (dub/dub ⭐20k) ---------------------------------- */

const DUB_CODE = makeComponent(`
var feats = arr(feat.items);
var stats = arr(co.stats);
var tess = arr(co.testimonials);
return (
<div style={{ background: c.background, color: c.foreground, fontFamily: bodyFont }}>
  ${NAV}
  <section className="relative overflow-hidden px-6 pt-24 pb-20 text-center">
    <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-80" style={{ background: "radial-gradient(60% 100% at 50% 0%, " + mix(c.primary, 22) + ", transparent)" }} aria-hidden="true"></div>
    {t(hero.eyebrow) ? (<span className="mb-6 inline-block rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-wider" style={{ background: mix(c.primary, 14), color: c.primary }}>{hero.eyebrow}</span>) : null}
    <h1 className="mx-auto max-w-4xl text-balance text-6xl font-black leading-[0.98] tracking-tight sm:text-7xl" style={{ fontFamily: heading }}>{t(hero.title, brand)}</h1>
    <p className="mx-auto mt-6 max-w-2xl text-lg" style={{ color: mix(c.foreground, 60) }}>{t(hero.subtitle)}</p>
    <div className="mt-9 flex flex-wrap items-center justify-center gap-3"><a href={t((hero.primaryCta||{}).href, "#")} className="rounded-full px-8 py-3.5 text-sm font-bold transition-transform hover:-translate-y-0.5" style={{ background: c.primary, color: c.primaryForeground }}>{t((hero.primaryCta||{}).label, "Start free")}</a><a href={t((hero.secondaryCta||{}).href, "#")} className="rounded-full px-8 py-3.5 text-sm font-semibold" style={{ border: "1px solid " + mix(c.foreground, 22), color: c.foreground }}>{t((hero.secondaryCta||{}).label, "Talk to sales")}</a></div>
  </section>

  {stats.length ? (<section className="px-6 pb-16"><div className="mx-auto grid max-w-5xl gap-6 sm:grid-cols-3">{stats.map(function(s, i){ return (<div key={i} className="rounded-3xl p-8 text-center" style={{ background: mix(c.foreground, 4), border: "1px solid " + mix(c.border, 60) }}><div className="text-5xl font-black tracking-tight" style={{ fontFamily: heading, color: c.primary }}>{s.value}</div><div className="mt-2 text-sm font-medium" style={{ color: mix(c.foreground, 62) }}>{s.label}</div></div>); })}</div></section>) : null}

  {feats.length ? (
  <section id="features" className="px-6 py-20">
    <div className="mx-auto max-w-2xl text-center"><h2 className="text-4xl font-extrabold tracking-tight sm:text-5xl" style={{ fontFamily: heading }}>{t(feat.title, "Everything in one place")}</h2></div>
    <div className="mx-auto mt-12 grid max-w-5xl gap-5 sm:grid-cols-2 lg:grid-cols-3">{feats.map(function(f, i){ return (<div key={i} className="rounded-3xl p-7 transition-transform hover:-translate-y-1" style={{ background: mix(c.foreground, 4), border: "1px solid " + mix(c.border, 60) }}><div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: c.primary, color: c.primaryForeground }}><Icon name={f.icon} className="h-6 w-6" /></div><h3 className="text-lg font-bold" style={{ fontFamily: heading }}>{f.title}</h3><p className="mt-2 text-sm leading-relaxed" style={{ color: mix(c.foreground, 62) }}>{f.body}</p></div>); })}</div>
  </section>) : null}

  {tess.length ? (
  <section className="px-6 py-16" style={{ background: mix(c.foreground, 3) }}>
    <h2 className="mb-10 text-center text-3xl font-extrabold tracking-tight" style={{ fontFamily: heading }}>Loved by teams everywhere</h2>
    <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-3">{tess.map(function(ts, i){ return (<figure key={i} className="rounded-3xl p-7" style={{ background: c.background, border: "1px solid " + mix(c.border, 60) }}><div className="mb-3 flex gap-0.5">{[0,1,2,3,4].map(function(n){ return (<Icon key={n} name="Star" className="h-4 w-4" style={{ color: c.primary }} />); })}</div><blockquote className="text-sm leading-relaxed" style={{ color: mix(c.foreground, 78) }}>“{ts.quote}”</blockquote><figcaption className="mt-4 text-sm font-semibold">{ts.name}<span className="block font-normal" style={{ color: mix(c.foreground, 55) }}>{t(ts.role)}</span></figcaption></figure>); })}</div>
  </section>) : null}

  <section className="px-6 py-24 text-center" style={{ background: c.primary, color: c.primaryForeground }}><h2 className="text-4xl font-black tracking-tight sm:text-5xl" style={{ fontFamily: heading }}>{t(cta.title, "Get started for free")}</h2><p className="mx-auto mt-4 max-w-lg" style={{ color: mix(c.primaryForeground, 82) }}>{t(cta.body)}</p><a href={t((cta.button||{}).href, "#")} className="mt-8 inline-block rounded-full px-9 py-3.5 text-sm font-bold" style={{ background: c.primaryForeground, color: c.primary }}>{t((cta.button||{}).label, "Start free")}</a></section>
  ${FOOTER}
</div>);
`)

/* ---- 17. Maybe Fintech (maybe-finance/maybe ⭐41k) ---------------------- */

const MAYBE_CODE = makeComponent(`
var feats = arr(feat.items);
var stats = arr(co.stats);
var faqs = arr(co.faq);
var tess = arr(co.testimonials);
return (
<div style={{ background: c.background, color: c.foreground, fontFamily: bodyFont }}>
  ${NAV}
  <section className="px-6 pt-20 pb-14">
    <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2">
      <div>
        {t(hero.eyebrow) ? (<span className="mb-4 inline-block rounded-full px-3 py-1 text-xs font-semibold" style={{ background: mix(c.primary, 14), color: c.primary }}>{hero.eyebrow}</span>) : null}
        <h1 className="text-balance text-5xl font-extrabold leading-[1.03] tracking-tight sm:text-6xl" style={{ fontFamily: heading }}>{t(hero.title, brand)}</h1>
        <p className="mt-5 max-w-md text-lg" style={{ color: mix(c.foreground, 62) }}>{t(hero.subtitle)}</p>
        <div className="mt-8 flex flex-wrap gap-3"><a href={t((hero.primaryCta||{}).href, "#")} className="rounded-xl px-7 py-3 text-sm font-bold" style={{ background: c.primary, color: c.primaryForeground }}>{t((hero.primaryCta||{}).label, "Open account")}</a><a href={t((hero.secondaryCta||{}).href, "#")} className="rounded-xl px-7 py-3 text-sm font-semibold" style={{ border: "1px solid " + mix(c.foreground, 20), color: c.foreground }}>{t((hero.secondaryCta||{}).label, "See pricing")}</a></div>
        {arr(hero.badges).length ? (<div className="mt-7 flex flex-wrap gap-x-5 gap-y-2">{arr(hero.badges).map(function(b, i){ return (<span key={i} className="flex items-center gap-1.5 text-xs font-medium" style={{ color: mix(c.foreground, 58) }}><Icon name="ShieldCheck" className="h-4 w-4" style={{ color: c.primary }} />{b}</span>); })}</div>) : null}
      </div>
      <div className="relative"><div className="pointer-events-none absolute -inset-4 -z-10 rounded-[2.5rem] blur-3xl" style={{ background: mix(c.primary, 20) }} aria-hidden="true"></div><div className="overflow-hidden rounded-[2rem] shadow-2xl" style={{ border: "1px solid " + mix(c.border, 60) }}><img src={pic("hero")} alt={t(hero.title, brand)} className="block w-full" style={{ aspectRatio: "4/5", objectFit: "cover" }} /></div></div>
    </div>
  </section>

  {stats.length ? (<section className="px-6 py-10"><div className="mx-auto grid max-w-4xl gap-8 rounded-3xl p-10 text-center sm:grid-cols-3" style={{ background: c.foreground, color: c.background }}>{stats.map(function(s, i){ return (<div key={i}><div className="text-4xl font-extrabold" style={{ fontFamily: heading }}>{s.value}</div><div className="mt-1 text-xs font-semibold uppercase tracking-wide" style={{ color: mix(c.background, 70) }}>{s.label}</div></div>); })}</div></section>) : null}

  {feats.length ? (
  <section id="features" className="px-6 py-20">
    <div className="mx-auto max-w-2xl text-center"><span className="text-sm font-bold uppercase tracking-wider" style={{ color: c.primary }}>{t(feat.subtitle, "Why us")}</span><h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl" style={{ fontFamily: heading }}>{t(feat.title, "Money, made simple")}</h2></div>
    <div className="mx-auto mt-12 grid max-w-5xl gap-6 sm:grid-cols-2 lg:grid-cols-3">{feats.map(function(f, i){ return (<div key={i} className="rounded-2xl p-6" style={{ background: mix(c.foreground, 4), border: "1px solid " + mix(c.border, 60) }}><div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl" style={{ background: mix(c.primary, 14), color: c.primary }}><Icon name={f.icon} className="h-5 w-5" /></div><h3 className="font-semibold" style={{ fontFamily: heading }}>{f.title}</h3><p className="mt-2 text-sm leading-relaxed" style={{ color: mix(c.foreground, 62) }}>{f.body}</p></div>); })}</div>
  </section>) : null}

  {(t(show.title) || arr(show.bullets).length) ? (
  <section className="px-6 py-16" style={{ background: mix(c.primary, 6) }}><div className="mx-auto grid max-w-5xl items-center gap-12 lg:grid-cols-2"><div><h2 className="text-3xl font-bold tracking-tight sm:text-4xl" style={{ fontFamily: heading }}>{t(show.title)}</h2><p className="mt-4 text-base" style={{ color: mix(c.foreground, 62) }}>{t(show.body)}</p><ul className="mt-6 space-y-3">{arr(show.bullets).map(function(b, i){ return (<li key={i} className="flex items-start gap-3"><Icon name="TrendingUp" className="mt-0.5 h-5 w-5 shrink-0" style={{ color: c.primary }} /><span className="text-sm" style={{ color: mix(c.foreground, 76) }}>{b}</span></li>); })}</ul></div><div className="overflow-hidden rounded-2xl shadow-xl"><img src={pic("showcase")} alt={t(show.title, "")} className="block w-full" style={{ aspectRatio: "4/3", objectFit: "cover" }} /></div></div></section>) : null}

  {tess.length ? (<section className="px-6 py-20 text-center"><div className="mx-auto max-w-3xl"><blockquote className="text-2xl font-medium leading-snug" style={{ fontFamily: heading }}>“{(tess[0]||{}).quote}”</blockquote><p className="mt-5 text-sm font-semibold">{(tess[0]||{}).name}<span className="block font-normal" style={{ color: mix(c.foreground, 55) }}>{t((tess[0]||{}).role)}</span></p></div></section>) : null}

  {faqs.length ? (<section id="faq" className="px-6 pb-16"><h2 className="mb-8 text-center text-3xl font-bold tracking-tight" style={{ fontFamily: heading }}>FAQ</h2><div className="mx-auto max-w-2xl divide-y" style={{ borderColor: mix(c.border, 70) }}>{faqs.map(function(q, i){ return (<div key={i} className="py-5" style={{ borderColor: mix(c.border, 70) }}><h3 className="font-semibold" style={{ fontFamily: heading }}>{q.q}</h3><p className="mt-2 text-sm leading-relaxed" style={{ color: mix(c.foreground, 62) }}>{q.a}</p></div>); })}</div></section>) : null}

  <section className="px-6 py-20"><div className="mx-auto max-w-4xl rounded-3xl px-8 py-14 text-center" style={{ background: c.primary, color: c.primaryForeground }}><h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl" style={{ fontFamily: heading }}>{t(cta.title, "Take control of your money")}</h2><p className="mx-auto mt-3 max-w-lg" style={{ color: mix(c.primaryForeground, 82) }}>{t(cta.body)}</p><a href={t((cta.button||{}).href, "#")} className="mt-7 inline-block rounded-xl px-8 py-3 text-sm font-bold" style={{ background: c.primaryForeground, color: c.primary }}>{t((cta.button||{}).label, "Open account")}</a></div></section>
  ${FOOTER}
</div>);
`)

/* ---- 18. n8n Automation (n8n-io/n8n ⭐50k) ------------------------------ */

const N8N_CODE = makeComponent(`
var feats = arr(feat.items);
var logos = arr(co.logos);
var steps = arr(show.bullets);
var stats = arr(co.stats);
var pricing = arr(co.pricing);
return (
<div style={{ background: c.background, color: c.foreground, fontFamily: bodyFont }}>
  ${NAV}
  <section className="px-6 pt-20 pb-14 text-center">
    {t(hero.eyebrow) ? (<span className="mb-5 inline-block rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-wide" style={{ background: mix(c.primary, 14), color: c.primary }}>{hero.eyebrow}</span>) : null}
    <h1 className="mx-auto max-w-4xl text-balance text-5xl font-extrabold leading-[1.03] tracking-tight sm:text-6xl" style={{ fontFamily: heading }}>{t(hero.title, brand)}</h1>
    <p className="mx-auto mt-6 max-w-2xl text-lg" style={{ color: mix(c.foreground, 60) }}>{t(hero.subtitle)}</p>
    <div className="mt-8 flex flex-wrap items-center justify-center gap-3"><a href={t((hero.primaryCta||{}).href, "#")} className="rounded-lg px-7 py-3 text-sm font-bold" style={{ background: c.primary, color: c.primaryForeground }}>{t((hero.primaryCta||{}).label, "Get started")}</a><a href={t((hero.secondaryCta||{}).href, "#")} className="rounded-lg px-7 py-3 text-sm font-semibold" style={{ border: "1px solid " + mix(c.foreground, 20), color: c.foreground }}>{t((hero.secondaryCta||{}).label, "Book a demo")}</a></div>
    <div className="mx-auto mt-12 max-w-5xl overflow-hidden rounded-2xl shadow-2xl" style={{ border: "1px solid " + mix(c.border, 65) }}><img src={pic("hero")} alt={t(hero.title, brand)} className="block w-full" style={{ aspectRatio: "16/9", objectFit: "cover" }} /></div>
  </section>

  {logos.length ? (<section className="px-6 pb-12"><p className="mb-6 text-center text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: mix(c.foreground, 45) }}>Connects with your stack</p><div className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-3">{logos.map(function(l, i){ return (<span key={i} className="rounded-full px-4 py-2 text-sm font-semibold" style={{ background: mix(c.foreground, 5), border: "1px solid " + mix(c.border, 60), color: mix(c.foreground, 65) }}>{l}</span>); })}</div></section>) : null}

  {feats.length ? (
  <section id="features" className="px-6 py-20" style={{ background: mix(c.foreground, 3) }}>
    <div className="mx-auto max-w-2xl text-center"><h2 className="text-3xl font-bold tracking-tight sm:text-4xl" style={{ fontFamily: heading }}>{t(feat.title, "Automate anything")}</h2></div>
    <div className="mx-auto mt-12 grid max-w-5xl gap-5 sm:grid-cols-2 lg:grid-cols-3">{feats.map(function(f, i){ return (<div key={i} className="rounded-2xl p-6" style={{ background: c.background, border: "1px solid " + mix(c.border, 60) }}><div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl" style={{ background: c.primary, color: c.primaryForeground }}><Icon name={f.icon} className="h-5 w-5" /></div><h3 className="font-semibold" style={{ fontFamily: heading }}>{f.title}</h3><p className="mt-2 text-sm leading-relaxed" style={{ color: mix(c.foreground, 62) }}>{f.body}</p></div>); })}</div>
  </section>) : null}

  {steps.length ? (
  <section className="px-6 py-20"><div className="mx-auto max-w-4xl"><h2 className="mb-12 text-center text-3xl font-bold tracking-tight" style={{ fontFamily: heading }}>{t(show.title, "Up and running in minutes")}</h2><div className="grid gap-6 sm:grid-cols-3">{steps.map(function(b, i){ return (<div key={i} className="relative rounded-2xl p-6" style={{ background: mix(c.foreground, 4), border: "1px solid " + mix(c.border, 60) }}><div className="mb-3 text-3xl font-black" style={{ fontFamily: heading, color: mix(c.primary, 55) }}>{"0" + (i + 1)}</div><p className="text-sm leading-relaxed" style={{ color: mix(c.foreground, 72) }}>{b}</p></div>); })}</div></div></section>) : null}

  {stats.length ? (<section className="px-6 py-12" style={{ background: mix(c.primary, 8) }}><div className="mx-auto grid max-w-5xl gap-8 text-center sm:grid-cols-4">{stats.map(function(s, i){ return (<div key={i}><div className="text-4xl font-extrabold" style={{ fontFamily: heading, color: c.primary }}>{s.value}</div><div className="mt-1 text-xs font-semibold uppercase tracking-wide" style={{ color: mix(c.foreground, 60) }}>{s.label}</div></div>); })}</div></section>) : null}

  {pricing.length ? (
  <section id="pricing" className="px-6 py-20"><h2 className="mb-10 text-center text-3xl font-bold tracking-tight sm:text-4xl" style={{ fontFamily: heading }}>Pricing</h2><div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-3">{pricing.map(function(p, i){ return (<div key={i} className="rounded-3xl p-7" style={{ background: c.background, border: "1px solid " + (p.highlighted ? c.primary : mix(c.border, 65)), boxShadow: p.highlighted ? "0 24px 50px -24px " + mix(c.primary, 55) : "none" }}><div className="text-sm font-semibold">{p.name}</div><div className="mt-2 text-4xl font-extrabold" style={{ fontFamily: heading }}>{p.price}<span className="text-sm font-normal" style={{ color: mix(c.foreground, 50) }}>{t(p.period)}</span></div><ul className="mt-5 space-y-2">{arr(p.features).map(function(ft, j){ return (<li key={j} className="flex items-center gap-2 text-sm" style={{ color: mix(c.foreground, 75) }}><Icon name="Check" className="h-4 w-4" style={{ color: c.primary }} />{ft}</li>); })}</ul><a href={t((p.cta||{}).href, "#")} className="mt-6 block rounded-lg py-2.5 text-center text-sm font-bold" style={{ background: p.highlighted ? c.primary : "transparent", color: p.highlighted ? c.primaryForeground : c.foreground, border: p.highlighted ? "none" : "1px solid " + mix(c.foreground, 22) }}>{t((p.cta||{}).label, "Choose plan")}</a></div>); })}</div></section>) : null}

  <section className="px-6 py-20 text-center" style={{ background: c.foreground, color: c.background }}><h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl" style={{ fontFamily: heading }}>{t(cta.title, "Start automating today")}</h2><p className="mx-auto mt-3 max-w-lg" style={{ color: mix(c.background, 72) }}>{t(cta.body)}</p><a href={t((cta.button||{}).href, "#")} className="mt-7 inline-block rounded-lg px-8 py-3 text-sm font-bold" style={{ background: c.primary, color: c.primaryForeground }}>{t((cta.button||{}).label, "Get started")}</a></section>
  ${FOOTER}
</div>);
`)

/* ---- Premium / awwwards-grade originals (Studio Noir / Lumen / Atelier) -- */

/* Dark editorial studio — big type, marquee, asymmetric work grid.
   Design language adapted from awwwards-tier studio sites (Studio Freight,
   editorial agencies). */
const STUDIO_NOIR_CODE = makeComponent(`
var feats = arr(feat.items);
var logos = arr(co.logos);
var stats = arr(co.stats);
var marq = logos.length ? logos : ["Strategy","Identity","Web","Motion","Art Direction","Editorial"];
var gal = ["hero","showcase","work3","work4"];
return (
<div style={{ background: c.background, color: c.foreground, fontFamily: bodyFont }}>
  ${NAV}
  <section className="relative overflow-hidden px-6 pt-20 pb-16">
    <div className="pointer-events-none absolute -right-32 top-0 h-[520px] w-[520px] rounded-full blur-[140px]" style={{ background: mix(c.primary, 22) }} aria-hidden="true"></div>
    <div className="relative mx-auto max-w-6xl">
      <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.3em]" style={{ color: mix(c.foreground, 55) }}><span style={{ color: c.primary }}>●</span>{t(hero.eyebrow, "Independent studio")}</div>
      <h1 className="mt-8 text-6xl font-extrabold leading-[0.92] tracking-tight sm:text-8xl" style={{ fontFamily: heading }}>{t(hero.title, brand)}</h1>
      <div className="mt-10 grid gap-8 md:grid-cols-[1.2fr_1fr] md:items-end">
        <p className="max-w-xl text-lg leading-relaxed" style={{ color: mix(c.foreground, 70) }}>{t(hero.subtitle)}</p>
        <div className="flex flex-wrap gap-3 md:justify-end">
          <a href={t((hero.primaryCta||{}).href, "/products")} className="group inline-flex items-center gap-2 rounded-full px-7 py-3 text-sm font-semibold transition-transform hover:-translate-y-0.5" style={{ background: c.primary, color: c.primaryForeground }}>{t((hero.primaryCta||{}).label, "View work")}<Icon name="ArrowUpRight" className="h-4 w-4" /></a>
          <a href={t((hero.secondaryCta||{}).href, "/contact")} className="inline-flex items-center rounded-full px-7 py-3 text-sm font-semibold" style={{ border: "1px solid " + mix(c.foreground, 24), color: c.foreground }}>{t((hero.secondaryCta||{}).label, "Start a project")}</a>
        </div>
      </div>
    </div>
  </section>

  <section className="overflow-hidden border-y py-6" style={{ borderColor: mix(c.border, 60) }}>
    <motion.div className="flex gap-14 whitespace-nowrap pr-14" animate={{ x: ["0%", "-50%"] }} transition={{ duration: 22, repeat: Infinity, ease: "linear" }}>
      {marq.concat(marq).map(function(l, i){ return (<span key={i} className="text-2xl font-bold tracking-tight" style={{ fontFamily: heading, color: mix(c.foreground, 32) }}>{l}<span style={{ color: c.primary }}> ✦ </span></span>); })}
    </motion.div>
  </section>

  <section className="px-6 py-20">
    <div className="mx-auto max-w-6xl">
      <div className="mb-10 flex items-end justify-between">
        <h2 className="text-3xl font-bold tracking-tight sm:text-5xl" style={{ fontFamily: heading }}>{t(feat.title, "Selected work")}</h2>
        <span className="hidden text-sm sm:block" style={{ color: mix(c.foreground, 55) }}>{t(feat.subtitle)}</span>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        {gal.map(function(g, i){ return (
          <motion.a key={i} href="/products" initial={{ opacity: 0, y: 28 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: i * 0.06 }} className={"group relative overflow-hidden rounded-3xl " + (i % 3 === 0 ? "md:col-span-2" : "")} style={{ border: "1px solid " + mix(c.border, 60) }}>
            <img src={images[_img[g]] || imgAt(i)} alt={"work " + (i+1)} className="block w-full transition-transform duration-700 group-hover:scale-105" style={{ aspectRatio: i % 3 === 0 ? "21/9" : "4/3", objectFit: "cover" }} />
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between p-6" style={{ background: "linear-gradient(to top, " + mix(c.background, 88) + ", transparent)" }}>
              <span className="text-lg font-semibold" style={{ fontFamily: heading }}>{t((feats[i]||{}).title, "Project " + (i+1))}</span>
              <Icon name="ArrowUpRight" className="h-5 w-5 transition-transform group-hover:translate-x-1 group-hover:-translate-y-1" style={{ color: c.primary }} />
            </div>
          </motion.a>); })}
      </div>
    </div>
  </section>

  {feats.length ? (
  <section className="px-6 py-20" style={{ background: mix(c.foreground, 4) }}>
    <div className="mx-auto grid max-w-6xl gap-12 md:grid-cols-[1fr_1.3fr]">
      <h2 className="text-3xl font-bold tracking-tight sm:text-4xl" style={{ fontFamily: heading }}>{t(show.title, "What we do")}</h2>
      <div>
        {feats.map(function(f, i){ return (<div key={i} className="flex items-start gap-5 py-5" style={{ borderTop: i ? "1px solid " + mix(c.border, 50) : "none" }}><span className="text-sm" style={{ color: c.primary }}>{"0" + (i+1)}</span><div><h3 className="text-xl font-semibold" style={{ fontFamily: heading }}>{f.title}</h3><p className="mt-1 text-sm leading-relaxed" style={{ color: mix(c.foreground, 64) }}>{f.body}</p></div></div>); })}
      </div>
    </div>
  </section>) : null}

  {stats.length ? (
  <section className="px-6 py-16"><div className="mx-auto grid max-w-5xl gap-8 text-center sm:grid-cols-3">{stats.map(function(s, i){ return (<div key={i}><div className="text-5xl font-extrabold" style={{ fontFamily: heading, color: c.primary }}>{s.value}</div><div className="mt-2 text-xs font-semibold uppercase tracking-widest" style={{ color: mix(c.foreground, 55) }}>{s.label}</div></div>); })}</div></section>) : null}

  <section className="px-6 pb-24 pt-10">
    <div className="mx-auto max-w-6xl rounded-[2rem] px-8 py-20 text-center" style={{ background: c.primary, color: c.primaryForeground }}>
      <h2 className="mx-auto max-w-3xl text-4xl font-extrabold tracking-tight sm:text-6xl" style={{ fontFamily: heading }}>{t(cta.title, "Let's build something memorable")}</h2>
      <p className="mx-auto mt-5 max-w-lg text-base" style={{ color: mix(c.primaryForeground, 80) }}>{t(cta.body)}</p>
      <a href={t((cta.button||{}).href, "/contact")} className="mt-9 inline-flex items-center gap-2 rounded-full px-9 py-3.5 text-sm font-bold" style={{ background: c.primaryForeground, color: c.primary }}>{t((cta.button||{}).label, "Start a project")}<Icon name="ArrowRight" className="h-4 w-4" /></a>
    </div>
  </section>
  ${FOOTER}
</div>);
`)

/* Premium SaaS / tech — gradient glow hero + bento feature grid.
   Design language adapted from Linear / Vercel / Magic UI (animated). */
const LUMEN_CODE = makeComponent(`
var feats = arr(feat.items);
var logos = arr(co.logos);
var stats = arr(co.stats);
var pricing = arr(co.pricing);
return (
<div style={{ background: c.background, color: c.foreground, fontFamily: bodyFont }}>
  ${NAV}
  <section className="relative overflow-hidden px-6 pt-24 pb-20 text-center">
    <div className="pointer-events-none absolute left-1/2 top-[-20%] h-[640px] w-[1000px] -translate-x-1/2 rounded-full blur-[150px]" style={{ background: "radial-gradient(circle, " + mix(c.primary, 38) + ", transparent 60%)" }} aria-hidden="true"></div>
    <div className="relative mx-auto max-w-3xl">
      {t(hero.eyebrow) ? (<span className="mb-6 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold" style={{ background: mix(c.primary, 12), color: c.primary, border: "1px solid " + mix(c.primary, 26) }}><Icon name="Sparkles" className="h-3.5 w-3.5" />{hero.eyebrow}</span>) : null}
      <h1 className="text-balance text-5xl font-extrabold leading-[1.02] tracking-tight sm:text-7xl" style={{ fontFamily: heading }}>{t(hero.title, brand)}</h1>
      <p className="mx-auto mt-7 max-w-xl text-lg" style={{ color: mix(c.foreground, 66) }}>{t(hero.subtitle)}</p>
      <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
        <a href={t((hero.primaryCta||{}).href, "/products")} className="rounded-xl px-7 py-3 text-sm font-semibold transition-transform hover:-translate-y-0.5" style={{ background: c.primary, color: c.primaryForeground, boxShadow: "0 20px 50px -20px " + mix(c.primary, 70) }}>{t((hero.primaryCta||{}).label, "Get started")}</a>
        <a href={t((hero.secondaryCta||{}).href, "/contact")} className="rounded-xl px-7 py-3 text-sm font-semibold" style={{ border: "1px solid " + mix(c.foreground, 20), color: c.foreground }}>{t((hero.secondaryCta||{}).label, "Talk to us")}</a>
      </div>
    </div>
    <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.1 }} className="relative mx-auto mt-16 max-w-5xl">
      <div className="overflow-hidden rounded-2xl" style={{ border: "1px solid " + mix(c.border, 70), boxShadow: "0 40px 80px -30px " + mix(c.primary, 45) }}>
        <img src={pic("hero")} alt={t(hero.title, brand)} className="block w-full" style={{ aspectRatio: "16/9", objectFit: "cover" }} />
      </div>
    </motion.div>
  </section>

  {logos.length ? (
  <section className="px-6 pb-12"><div className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-x-10 gap-y-4 opacity-70">{logos.map(function(l, i){ return (<span key={i} className="text-base font-bold" style={{ color: mix(c.foreground, 42), fontFamily: heading }}>{l}</span>); })}</div></section>) : null}

  {feats.length ? (
  <section id="features" className="px-6 py-20">
    <div className="mx-auto max-w-2xl text-center"><h2 className="text-3xl font-bold tracking-tight sm:text-4xl" style={{ fontFamily: heading }}>{t(feat.title, "Built for scale")}</h2><p className="mt-3" style={{ color: mix(c.foreground, 62) }}>{t(feat.subtitle)}</p></div>
    <div className="mx-auto mt-12 grid max-w-5xl auto-rows-[180px] grid-cols-2 gap-4 md:grid-cols-3">
      {feats.map(function(f, i){ return (
        <motion.div key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4, delay: i * 0.05 }} className={"relative overflow-hidden rounded-3xl p-6 " + (i === 0 ? "col-span-2 row-span-2" : "")} style={{ background: i === 0 ? mix(c.primary, 12) : mix(c.foreground, 4), border: "1px solid " + mix(c.border, 60) }}>
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: mix(c.primary, 18), color: c.primary }}><Icon name={f.icon} className="h-5 w-5" /></div>
          <h3 className={"font-semibold " + (i === 0 ? "text-2xl" : "text-lg")} style={{ fontFamily: heading }}>{f.title}</h3>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: mix(c.foreground, 62) }}>{f.body}</p>
        </motion.div>); })}
    </div>
  </section>) : null}

  {stats.length ? (
  <section className="px-6 py-16" style={{ background: mix(c.foreground, 3) }}><div className="mx-auto grid max-w-4xl gap-8 text-center sm:grid-cols-4">{stats.map(function(s, i){ return (<div key={i}><div className="text-4xl font-extrabold" style={{ fontFamily: heading, color: c.primary }}>{s.value}</div><div className="mt-1 text-xs font-semibold uppercase tracking-wide" style={{ color: mix(c.foreground, 60) }}>{s.label}</div></div>); })}</div></section>) : null}

  {pricing.length ? (
  <section id="pricing" className="px-6 py-20"><h2 className="mb-10 text-center text-3xl font-bold tracking-tight sm:text-4xl" style={{ fontFamily: heading }}>Pricing</h2><div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-3">{pricing.map(function(p, i){ return (<div key={i} className="rounded-3xl p-7" style={{ background: p.highlighted ? mix(c.primary, 10) : mix(c.foreground, 4), border: "1px solid " + (p.highlighted ? c.primary : mix(c.border, 65)) }}><div className="text-sm font-semibold uppercase tracking-wide" style={{ color: mix(c.foreground, 60) }}>{p.name}</div><div className="mt-2 text-4xl font-extrabold" style={{ fontFamily: heading }}>{p.price}<span className="text-sm font-normal" style={{ color: mix(c.foreground, 55) }}>{t(p.period)}</span></div><ul className="mt-5 space-y-2">{arr(p.features).map(function(ft, j){ return (<li key={j} className="flex items-center gap-2 text-sm" style={{ color: mix(c.foreground, 75) }}><Icon name="Check" className="h-4 w-4" style={{ color: c.primary }} />{ft}</li>); })}</ul><a href={t((p.cta||{}).href, "/contact")} className="mt-6 block rounded-xl py-2.5 text-center text-sm font-bold" style={{ background: p.highlighted ? c.primary : "transparent", color: p.highlighted ? c.primaryForeground : c.foreground, border: p.highlighted ? "none" : "1px solid " + mix(c.foreground, 22) }}>{t((p.cta||{}).label, "Choose")}</a></div>); })}</div></section>) : null}

  <section className="px-6 py-20"><div className="relative mx-auto max-w-4xl overflow-hidden rounded-3xl px-8 py-16 text-center" style={{ background: c.primary, color: c.primaryForeground }}><div className="pointer-events-none absolute left-1/2 top-0 h-64 w-96 -translate-x-1/2 rounded-full blur-[100px]" style={{ background: mix(c.primaryForeground, 25) }}></div><h2 className="relative text-3xl font-extrabold tracking-tight sm:text-5xl" style={{ fontFamily: heading }}>{t(cta.title, "Ship faster today")}</h2><p className="relative mx-auto mt-4 max-w-lg" style={{ color: mix(c.primaryForeground, 82) }}>{t(cta.body)}</p><a href={t((cta.button||{}).href, "/contact")} className="relative mt-8 inline-block rounded-xl px-8 py-3 text-sm font-bold" style={{ background: c.primaryForeground, color: c.primary }}>{t((cta.button||{}).label, "Get started")}</a></div></section>
  ${FOOTER}
</div>);
`)

/* Luxe brand / lookbook — magazine editorial, serif display, asymmetric grid.
   Design language adapted from high-fashion editorial + bchiang v4 restraint. */
const ATELIER_CODE = makeComponent(`
var feats = arr(feat.items);
var stats = arr(co.stats);
var tess = arr(co.testimonials);
var defMarq = ["Handcrafted","Sustainable","Timeless","Limited","Atelier-made"];
var marq = arr(co.logos).length ? arr(co.logos) : defMarq;
var gal = ["hero","look2","look3","showcase"];
return (
<div style={{ background: c.background, color: c.foreground, fontFamily: bodyFont }}>
  ${NAV}
  <section className="px-6 pt-16 pb-12">
    <div className="mx-auto grid max-w-6xl items-center gap-10 md:grid-cols-2">
      <div>
        <span className="text-xs font-semibold uppercase tracking-[0.4em]" style={{ color: mix(c.foreground, 50) }}>{t(hero.eyebrow, "Maison")}</span>
        <h1 className="mt-6 text-5xl leading-[1.05] tracking-tight sm:text-7xl" style={{ fontFamily: heading, fontWeight: 500 }}>{t(hero.title, brand)}</h1>
        <p className="mt-7 max-w-md text-lg leading-relaxed" style={{ color: mix(c.foreground, 64) }}>{t(hero.subtitle)}</p>
        <div className="mt-9 flex flex-wrap items-center gap-6">
          <a href={t((hero.primaryCta||{}).href, "/products")} className="px-8 py-3.5 text-xs font-semibold uppercase tracking-widest transition-transform hover:-translate-y-0.5" style={{ background: c.foreground, color: c.background }}>{t((hero.primaryCta||{}).label, "Discover")}</a>
          <a href={t((hero.secondaryCta||{}).href, "/about")} className="border-b pb-1 text-xs font-semibold uppercase tracking-widest" style={{ borderColor: c.foreground }}>{t((hero.secondaryCta||{}).label, "Our story")}</a>
        </div>
      </div>
      <motion.div initial={{ opacity: 0, scale: 1.02 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.8 }} className="overflow-hidden">
        <img src={pic("hero")} alt={t(hero.title, brand)} className="block w-full" style={{ aspectRatio: "4/5", objectFit: "cover" }} />
      </motion.div>
    </div>
  </section>

  <section className="overflow-hidden border-y py-4" style={{ borderColor: mix(c.border, 50) }}>
    <motion.div className="flex gap-12 whitespace-nowrap pr-12" animate={{ x: ["0%", "-50%"] }} transition={{ duration: 26, repeat: Infinity, ease: "linear" }}>
      {marq.concat(marq).map(function(l, i){ return (<span key={i} className="text-sm font-semibold uppercase tracking-[0.3em]" style={{ color: mix(c.foreground, 45) }}>{l}<span style={{ color: c.primary }}> — </span></span>); })}
    </motion.div>
  </section>

  <section className="px-6 py-20">
    <div className="mx-auto max-w-6xl">
      <div className="mb-12 max-w-xl"><h2 className="text-3xl tracking-tight sm:text-5xl" style={{ fontFamily: heading, fontWeight: 500 }}>{t(feat.title, "The collection")}</h2><p className="mt-3" style={{ color: mix(c.foreground, 60) }}>{t(feat.subtitle)}</p></div>
      <div className="grid gap-6 md:grid-cols-12">
        {gal.map(function(g, i){ var spans = ["md:col-span-7","md:col-span-5","md:col-span-5","md:col-span-7"]; return (
          <motion.div key={i} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: i * 0.05 }} className={"group overflow-hidden " + spans[i % 4]}>
            <div className="overflow-hidden"><img src={images[_img[g]] || imgAt(i)} alt={"look " + (i+1)} className="block w-full transition-transform duration-700 group-hover:scale-105" style={{ aspectRatio: i % 4 < 2 ? "4/3" : "3/4", objectFit: "cover" }} /></div>
            <div className="mt-4 flex items-baseline justify-between"><span className="text-lg" style={{ fontFamily: heading }}>{t((feats[i]||{}).title, "Piece N°" + (i+1))}</span><span className="text-xs uppercase tracking-widest" style={{ color: mix(c.foreground, 50) }}>{t((feats[i]||{}).body, "")}</span></div>
          </motion.div>); })}
      </div>
    </div>
  </section>

  {tess.length ? (
  <section className="px-6 py-24 text-center" style={{ background: mix(c.foreground, 4) }}>
    <div className="mx-auto max-w-3xl"><blockquote className="text-2xl leading-snug sm:text-4xl" style={{ fontFamily: heading, fontWeight: 500 }}>“{(tess[0]||{}).quote}”</blockquote><p className="mt-7 text-xs font-semibold uppercase tracking-widest" style={{ color: mix(c.foreground, 55) }}>{(tess[0]||{}).name}{t((tess[0]||{}).role) ? " — " + (tess[0]||{}).role : ""}</p></div>
  </section>) : null}

  {stats.length ? (
  <section className="px-6 py-16"><div className="mx-auto grid max-w-4xl gap-8 text-center sm:grid-cols-3">{stats.map(function(s, i){ return (<div key={i}><div className="text-5xl" style={{ fontFamily: heading, color: c.primary, fontWeight: 500 }}>{s.value}</div><div className="mt-2 text-xs font-semibold uppercase tracking-widest" style={{ color: mix(c.foreground, 55) }}>{s.label}</div></div>); })}</div></section>) : null}

  <section className="px-6 pb-24 pt-8"><div className="mx-auto max-w-5xl px-8 py-20 text-center" style={{ background: c.foreground, color: c.background }}><h2 className="mx-auto max-w-2xl text-3xl tracking-tight sm:text-5xl" style={{ fontFamily: heading, fontWeight: 500 }}>{t(cta.title, "Visit the atelier")}</h2><p className="mx-auto mt-5 max-w-md" style={{ color: mix(c.background, 72) }}>{t(cta.body)}</p><a href={t((cta.button||{}).href, "/contact")} className="mt-9 inline-block px-9 py-3.5 text-xs font-semibold uppercase tracking-widest" style={{ background: c.background, color: c.foreground }}>{t((cta.button||{}).label, "Book an appointment")}</a></div></section>
  ${FOOTER}
</div>);
`)

/* Brutalist kinetic — oversized uppercase type, hard borders, marquee.
   Design language adapted from award-winning kinetic/brutalist sites. */
const KINETIC_CODE = makeComponent(`
var feats = arr(feat.items);
var logos = arr(co.logos);
var stats = arr(co.stats);
var marq = logos.length ? logos : ["Design","Build","Ship","Repeat"];
return (
<div style={{ background: c.background, color: c.foreground, fontFamily: bodyFont }}>
  ${NAV}
  <section className="px-6 pt-16 pb-10">
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-wrap items-center gap-3 text-xs font-bold uppercase tracking-widest">
        <span className="px-3 py-1" style={{ background: c.primary, color: c.primaryForeground }}>{t(hero.eyebrow, "New")}</span>
        <span style={{ color: mix(c.foreground, 55) }}>{t((co.footer||{}).tagline, "Independent · Worldwide")}</span>
      </div>
      <h1 className="text-6xl font-black uppercase leading-[0.85] tracking-tighter sm:text-9xl" style={{ fontFamily: heading }}>{t(hero.title, brand)}</h1>
      <div className="mt-8 grid gap-6 border-t-2 pt-8 md:grid-cols-[1fr_auto] md:items-center" style={{ borderColor: c.foreground }}>
        <p className="max-w-lg text-lg" style={{ color: mix(c.foreground, 72) }}>{t(hero.subtitle)}</p>
        <a href={t((hero.primaryCta||{}).href, "/products")} className="inline-flex w-fit items-center gap-2 px-8 py-4 text-sm font-bold uppercase tracking-widest" style={{ background: c.foreground, color: c.background }}>{t((hero.primaryCta||{}).label, "Enter")}<Icon name="ArrowRight" className="h-4 w-4" /></a>
      </div>
    </div>
  </section>

  <section className="overflow-hidden border-y-2 py-4" style={{ borderColor: c.foreground, background: c.primary }}>
    <motion.div className="flex gap-10 whitespace-nowrap pr-10" animate={{ x: ["0%", "-50%"] }} transition={{ duration: 18, repeat: Infinity, ease: "linear" }}>
      {marq.concat(marq).map(function(l, i){ return (<span key={i} className="text-3xl font-black uppercase tracking-tight" style={{ fontFamily: heading, color: c.primaryForeground }}>{l}<span> / </span></span>); })}
    </motion.div>
  </section>

  {feats.length ? (
  <section className="px-6 py-16">
    <div className="mx-auto grid max-w-6xl sm:grid-cols-2 lg:grid-cols-3" style={{ borderTop: "2px solid " + c.foreground, borderLeft: "2px solid " + c.foreground }}>
      {feats.map(function(f, i){ return (
        <motion.div key={i} initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.3, delay: i * 0.05 }} className="p-7" style={{ borderRight: "2px solid " + c.foreground, borderBottom: "2px solid " + c.foreground }}>
          <div className="mb-4 text-4xl font-black" style={{ fontFamily: heading, color: c.primary }}>{"0" + (i+1)}</div>
          <h3 className="text-xl font-bold uppercase" style={{ fontFamily: heading }}>{f.title}</h3>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: mix(c.foreground, 64) }}>{f.body}</p>
        </motion.div>); })}
    </div>
  </section>) : null}

  {(t(show.title) || arr(show.bullets).length) ? (
  <section className="px-6 py-16">
    <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-2">
      <div className="overflow-hidden" style={{ border: "2px solid " + c.foreground }}><img src={pic("hero")} alt={t(show.title, brand)} className="block w-full" style={{ aspectRatio: "4/3", objectFit: "cover" }} /></div>
      <div>
        <h2 className="text-4xl font-black uppercase tracking-tight sm:text-5xl" style={{ fontFamily: heading }}>{t(show.title)}</h2>
        <p className="mt-4 text-base" style={{ color: mix(c.foreground, 66) }}>{t(show.body)}</p>
        <ul className="mt-6 space-y-3">{arr(show.bullets).map(function(b, i){ return (<li key={i} className="flex items-start gap-3 border-b pb-3 text-sm font-medium" style={{ borderColor: mix(c.foreground, 25) }}><span style={{ color: c.primary }}>→</span>{b}</li>); })}</ul>
      </div>
    </div>
  </section>) : null}

  {stats.length ? (
  <section className="px-6 py-12"><div className="mx-auto grid max-w-6xl sm:grid-cols-3" style={{ borderTop: "2px solid " + c.foreground, borderLeft: "2px solid " + c.foreground }}>{stats.map(function(s, i){ return (<div key={i} className="p-8 text-center" style={{ borderRight: "2px solid " + c.foreground, borderBottom: "2px solid " + c.foreground }}><div className="text-5xl font-black" style={{ fontFamily: heading, color: c.primary }}>{s.value}</div><div className="mt-2 text-xs font-bold uppercase tracking-widest" style={{ color: mix(c.foreground, 60) }}>{s.label}</div></div>); })}</div></section>) : null}

  <section className="px-6 py-16"><div className="mx-auto max-w-6xl px-8 py-20 text-center" style={{ background: c.foreground, color: c.background }}><h2 className="text-4xl font-black uppercase tracking-tight sm:text-7xl" style={{ fontFamily: heading }}>{t(cta.title, "Let's go")}</h2><p className="mx-auto mt-5 max-w-md" style={{ color: mix(c.background, 70) }}>{t(cta.body)}</p><a href={t((cta.button||{}).href, "/contact")} className="mt-9 inline-block px-10 py-4 text-sm font-bold uppercase tracking-widest" style={{ background: c.primary, color: c.primaryForeground }}>{t((cta.button||{}).label, "Get in touch")}</a></div></section>
  ${FOOTER}
</div>);
`)

/* Immersive full-bleed — cinematic hero photo + alternating scroll story.
   Design language adapted from awwwards hospitality / travel / real-estate. */
const HORIZON_CODE = makeComponent(`
var feats = arr(feat.items);
var stats = arr(co.stats);
var tess = arr(co.testimonials);
return (
<div style={{ background: c.background, color: c.foreground, fontFamily: bodyFont }}>
  ${NAV}
  <section className="relative">
    <div className="relative h-[78vh] min-h-[520px] w-full overflow-hidden">
      <img src={pic("hero")} alt={t(hero.title, brand)} className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0" style={{ background: "linear-gradient(to top, " + mix(c.background, 90) + ", " + mix(c.background, 18) + ")" }}></div>
      <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }} className="absolute inset-x-0 bottom-0 px-6 pb-16">
        <div className="mx-auto max-w-6xl">
          <span className="text-xs font-semibold uppercase tracking-[0.4em]" style={{ color: mix(c.foreground, 78) }}>{t(hero.eyebrow, "Welcome")}</span>
          <h1 className="mt-4 max-w-3xl text-5xl font-bold leading-[1.05] tracking-tight sm:text-7xl" style={{ fontFamily: heading }}>{t(hero.title, brand)}</h1>
          <p className="mt-5 max-w-xl text-lg" style={{ color: mix(c.foreground, 82) }}>{t(hero.subtitle)}</p>
          <div className="mt-8 flex flex-wrap gap-4">
            <a href={t((hero.primaryCta||{}).href, "/products")} className="rounded-full px-8 py-3.5 text-sm font-semibold" style={{ background: c.primary, color: c.primaryForeground }}>{t((hero.primaryCta||{}).label, "Explore")}</a>
            <a href={t((hero.secondaryCta||{}).href, "/contact")} className="rounded-full px-8 py-3.5 text-sm font-semibold" style={{ border: "1px solid " + mix(c.foreground, 45), color: c.foreground }}>{t((hero.secondaryCta||{}).label, "Reserve")}</a>
          </div>
        </div>
      </motion.div>
    </div>
  </section>

  {feats.length ? (
  <section className="px-6 py-24">
    <div className="mx-auto max-w-3xl text-center"><h2 className="text-3xl font-bold tracking-tight sm:text-5xl" style={{ fontFamily: heading }}>{t(feat.title, "An experience apart")}</h2><p className="mt-4" style={{ color: mix(c.foreground, 64) }}>{t(feat.subtitle)}</p></div>
    <div className="mx-auto mt-16 max-w-5xl space-y-20">
      {feats.map(function(f, i){ var rev = i % 2 === 1; return (
        <motion.div key={i} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }} className="grid items-center gap-10 md:grid-cols-2">
          <div className={"overflow-hidden rounded-2xl " + (rev ? "md:order-2" : "")}><img src={imgAt(i + 1)} alt={f.title} className="block w-full" style={{ aspectRatio: "4/3", objectFit: "cover" }} /></div>
          <div className={rev ? "md:order-1" : ""}><div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full" style={{ background: mix(c.primary, 16), color: c.primary }}><Icon name={f.icon} className="h-5 w-5" /></div><h3 className="text-2xl font-bold" style={{ fontFamily: heading }}>{f.title}</h3><p className="mt-3 leading-relaxed" style={{ color: mix(c.foreground, 66) }}>{f.body}</p></div>
        </motion.div>); })}
    </div>
  </section>) : null}

  {stats.length ? (
  <section className="px-6 py-16" style={{ background: mix(c.foreground, 4) }}><div className="mx-auto grid max-w-4xl gap-8 text-center sm:grid-cols-3">{stats.map(function(s, i){ return (<div key={i}><div className="text-5xl font-bold" style={{ fontFamily: heading, color: c.primary }}>{s.value}</div><div className="mt-2 text-xs font-semibold uppercase tracking-widest" style={{ color: mix(c.foreground, 60) }}>{s.label}</div></div>); })}</div></section>) : null}

  {tess.length ? (
  <section className="px-6 py-24 text-center"><div className="mx-auto max-w-3xl"><Icon name="Quote" className="mx-auto h-8 w-8" style={{ color: mix(c.primary, 60) }} /><blockquote className="mt-6 text-2xl font-medium leading-snug sm:text-3xl" style={{ fontFamily: heading }}>“{(tess[0]||{}).quote}”</blockquote><p className="mt-6 text-sm font-semibold">{(tess[0]||{}).name}<span className="block font-normal" style={{ color: mix(c.foreground, 55) }}>{t((tess[0]||{}).role)}</span></p></div></section>) : null}

  <section className="relative overflow-hidden px-6 py-28 text-center">
    <img src={pic("showcase")} alt="" className="absolute inset-0 h-full w-full object-cover" aria-hidden="true" />
    <div className="absolute inset-0" style={{ background: mix(c.background, 80) }}></div>
    <div className="relative mx-auto max-w-2xl"><h2 className="text-4xl font-bold tracking-tight sm:text-5xl" style={{ fontFamily: heading }}>{t(cta.title, "Begin your journey")}</h2><p className="mx-auto mt-4 max-w-md" style={{ color: mix(c.foreground, 74) }}>{t(cta.body)}</p><a href={t((cta.button||{}).href, "/contact")} className="mt-8 inline-block rounded-full px-9 py-3.5 text-sm font-semibold" style={{ background: c.primary, color: c.primaryForeground }}>{t((cta.button||{}).label, "Reserve now")}</a></div>
  </section>
  ${FOOTER}
</div>);
`)

/* Vibrant gradient / glass — colorful creative startup with glassmorphism.
   Design language adapted from awwwards gradient/aurora creative sites. */
const PRISM_CODE = makeComponent(`
var feats = arr(feat.items);
var logos = arr(co.logos);
var stats = arr(co.stats);
var pricing = arr(co.pricing);
return (
<div style={{ background: c.background, color: c.foreground, fontFamily: bodyFont }}>
  ${NAV}
  <section className="relative overflow-hidden px-6 pt-24 pb-20 text-center">
    <div className="pointer-events-none absolute -left-24 top-0 h-80 w-80 rounded-full blur-[120px]" style={{ background: mix(c.primary, 45) }} aria-hidden="true"></div>
    <div className="pointer-events-none absolute -right-24 top-32 h-96 w-96 rounded-full blur-[130px]" style={{ background: mix(c.foreground, 12) }} aria-hidden="true"></div>
    <div className="relative mx-auto max-w-3xl">
      {t(hero.eyebrow) ? (<span className="mb-6 inline-block rounded-full px-4 py-1.5 text-xs font-semibold" style={{ background: mix(c.primary, 14), color: c.primary, border: "1px solid " + mix(c.primary, 30) }}>{hero.eyebrow}</span>) : null}
      <h1 className="text-balance text-5xl font-extrabold leading-[1.02] tracking-tight sm:text-7xl" style={{ fontFamily: heading, backgroundImage: "linear-gradient(120deg, " + c.foreground + ", " + c.primary + ")", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>{t(hero.title, brand)}</h1>
      <p className="mx-auto mt-7 max-w-xl text-lg" style={{ color: mix(c.foreground, 66) }}>{t(hero.subtitle)}</p>
      <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
        <a href={t((hero.primaryCta||{}).href, "/products")} className="rounded-full px-7 py-3 text-sm font-semibold transition-transform hover:-translate-y-0.5" style={{ background: c.primary, color: c.primaryForeground }}>{t((hero.primaryCta||{}).label, "Get started")}</a>
        <a href={t((hero.secondaryCta||{}).href, "/contact")} className="rounded-full px-7 py-3 text-sm font-semibold" style={{ border: "1px solid " + mix(c.foreground, 22), color: c.foreground }}>{t((hero.secondaryCta||{}).label, "Learn more")}</a>
      </div>
    </div>
    <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }} className="relative mx-auto mt-14 max-w-4xl overflow-hidden rounded-3xl" style={{ border: "1px solid " + mix(c.border, 70) }}><img src={pic("hero")} alt={t(hero.title, brand)} className="block w-full" style={{ aspectRatio: "16/9", objectFit: "cover" }} /></motion.div>
  </section>

  {feats.length ? (
  <section id="features" className="px-6 py-20">
    <div className="mx-auto max-w-2xl text-center"><h2 className="text-3xl font-bold tracking-tight sm:text-4xl" style={{ fontFamily: heading }}>{t(feat.title, "Everything in one place")}</h2><p className="mt-3" style={{ color: mix(c.foreground, 62) }}>{t(feat.subtitle)}</p></div>
    <div className="mx-auto mt-12 grid max-w-5xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {feats.map(function(f, i){ return (
        <motion.div key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4, delay: i * 0.05 }} className="rounded-3xl p-6 backdrop-blur" style={{ background: mix(c.foreground, 5), border: "1px solid " + mix(c.border, 60) }}>
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl" style={{ background: "linear-gradient(135deg, " + c.primary + ", " + mix(c.primary, 50) + ")", color: c.primaryForeground }}><Icon name={f.icon} className="h-5 w-5" /></div>
          <h3 className="text-lg font-semibold" style={{ fontFamily: heading }}>{f.title}</h3>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: mix(c.foreground, 62) }}>{f.body}</p>
        </motion.div>); })}
    </div>
  </section>) : null}

  {logos.length ? (<section className="px-6 pb-8"><div className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-x-10 gap-y-4 opacity-70">{logos.map(function(l, i){ return (<span key={i} className="text-base font-bold" style={{ color: mix(c.foreground, 42), fontFamily: heading }}>{l}</span>); })}</div></section>) : null}

  {stats.length ? (
  <section className="px-6 py-16"><div className="mx-auto grid max-w-4xl gap-8 text-center sm:grid-cols-4">{stats.map(function(s, i){ return (<div key={i}><div className="text-4xl font-extrabold" style={{ fontFamily: heading, color: c.primary }}>{s.value}</div><div className="mt-1 text-xs font-semibold uppercase tracking-wide" style={{ color: mix(c.foreground, 60) }}>{s.label}</div></div>); })}</div></section>) : null}

  {pricing.length ? (
  <section id="pricing" className="px-6 py-20"><h2 className="mb-10 text-center text-3xl font-bold tracking-tight sm:text-4xl" style={{ fontFamily: heading }}>Pricing</h2><div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-3">{pricing.map(function(p, i){ return (<div key={i} className="rounded-3xl p-7 backdrop-blur" style={{ background: p.highlighted ? "linear-gradient(160deg, " + mix(c.primary, 16) + ", " + mix(c.foreground, 4) + ")" : mix(c.foreground, 4), border: "1px solid " + (p.highlighted ? c.primary : mix(c.border, 65)) }}><div className="text-sm font-semibold uppercase tracking-wide" style={{ color: mix(c.foreground, 60) }}>{p.name}</div><div className="mt-2 text-4xl font-extrabold" style={{ fontFamily: heading }}>{p.price}<span className="text-sm font-normal" style={{ color: mix(c.foreground, 55) }}>{t(p.period)}</span></div><ul className="mt-5 space-y-2">{arr(p.features).map(function(ft, j){ return (<li key={j} className="flex items-center gap-2 text-sm" style={{ color: mix(c.foreground, 75) }}><Icon name="Check" className="h-4 w-4" style={{ color: c.primary }} />{ft}</li>); })}</ul><a href={t((p.cta||{}).href, "/contact")} className="mt-6 block rounded-full py-2.5 text-center text-sm font-bold" style={{ background: p.highlighted ? c.primary : "transparent", color: p.highlighted ? c.primaryForeground : c.foreground, border: p.highlighted ? "none" : "1px solid " + mix(c.foreground, 22) }}>{t((p.cta||{}).label, "Choose")}</a></div>); })}</div></section>) : null}

  <section className="px-6 py-20"><div className="relative mx-auto max-w-4xl overflow-hidden rounded-[2rem] px-8 py-16 text-center" style={{ background: "linear-gradient(135deg, " + c.primary + ", " + mix(c.primary, 55) + ")", color: c.primaryForeground }}><h2 className="text-3xl font-extrabold tracking-tight sm:text-5xl" style={{ fontFamily: heading }}>{t(cta.title, "Ready to create?")}</h2><p className="mx-auto mt-4 max-w-lg" style={{ color: mix(c.primaryForeground, 82) }}>{t(cta.body)}</p><a href={t((cta.button||{}).href, "/contact")} className="mt-8 inline-block rounded-full px-8 py-3 text-sm font-bold" style={{ background: c.primaryForeground, color: c.primary }}>{t((cta.button||{}).label, "Start now")}</a></div></section>
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
  {
    id: 'taxonomy-editorial',
    name: 'Taxonomy Editorial',
    category: 'SaaS / Content & Publishing',
    description:
      'Centered editorial SaaS landing with a big balanced headline, a product screenshot, a trust strip, a bento feature grid, two-tier pricing, a pull-quote and FAQ. For content tools, writing apps, knowledge products and modern subscription software.',
    source: {
      repo: 'shadcn-ui/taxonomy',
      url: 'https://github.com/shadcn-ui/taxonomy',
      stars: 19000,
      author: 'shadcn',
    },
    themeId: 'paper-mono',
    designId: 'editorial-luxury',
    imageSlots: [
      { key: 'hero', purpose: 'Wide product UI screenshot / dashboard shown under the headline' },
    ],
    placeholder: {
      brand: 'Taxonomy',
      hero: {
        eyebrow: 'Introducing',
        title: 'An open-source platform for modern teams',
        subtitle: 'Write, organize and publish your work in one beautifully simple workspace.',
        primaryCta: { label: 'Get started', href: '#' },
        secondaryCta: { label: 'Learn more', href: '#' },
      },
    },
    code: TAXONOMY_CODE,
  },
  {
    id: 'cal-booking',
    name: 'Cal Scheduling',
    category: 'SaaS / Scheduling & Productivity',
    description:
      'Split hero with a live-looking booking/calendar card, trust logos, a clean feature trio, a metrics row and a centered testimonial. For scheduling apps, booking tools, calendars, consultancies and any service that takes appointments.',
    source: {
      repo: 'calcom/cal.com',
      url: 'https://github.com/calcom/cal.com',
      stars: 33000,
      author: 'Cal.com',
    },
    themeId: 'teal-modern',
    designId: 'minimal-clean',
    imageSlots: [
      { key: 'hero', purpose: 'Optional brand/product image (a faux booking card is rendered, so decorative)', decorative: true },
    ],
    placeholder: {
      brand: 'Cal',
      hero: {
        eyebrow: 'Scheduling, open source',
        title: 'Easy scheduling ahead',
        subtitle: 'The booking page that adapts to your business — share a link and let people pick a time.',
        primaryCta: { label: 'Get started', href: '#' },
        secondaryCta: { label: 'See how it works', href: '#' },
        badges: ['Free forever plan', 'No credit card', 'Open source'],
      },
    },
    code: CAL_CODE,
  },
  {
    id: 'supabase-dev',
    name: 'Supabase Dev Platform',
    category: 'Developer / Platform & API',
    description:
      'Dark developer-platform landing with a glowing hero, a faux code snippet, a tech logo strip, a gapless mono feature grid, a metrics band and an alternating showcase. For databases, APIs, backends, infra and developer tools.',
    source: {
      repo: 'supabase/supabase',
      url: 'https://github.com/supabase/supabase',
      stars: 73000,
      author: 'Supabase',
    },
    themeId: 'cyber-night',
    designId: 'industrial-corporate',
    imageSlots: [
      { key: 'showcase', purpose: 'Product UI / dashboard screenshot for the alternating feature block' },
    ],
    placeholder: {
      brand: 'Supabase',
      hero: {
        title: 'Build in a weekend, scale to millions',
        subtitle: 'The open-source platform with a Postgres database, auth, storage and edge functions.',
        primaryCta: { label: 'Start your project', href: '#' },
        secondaryCta: { label: 'Documentation', href: '#' },
        badges: ['Postgres', 'Auth', 'Realtime', 'Edge Functions'],
      },
    },
    code: SUPABASE_CODE,
  },
  {
    id: 'medusa-store',
    name: 'Medusa Storefront',
    category: 'E-commerce / Storefront',
    description:
      'Editorial commerce storefront with an asymmetric image hero, a promo tile, a four-up product grid, a brand-story showcase and metrics. For fashion, lifestyle, home and curated D2C stores that lead with photography.',
    source: {
      repo: 'medusajs/medusa',
      url: 'https://github.com/medusajs/medusa',
      stars: 27000,
      author: 'Medusa',
    },
    themeId: 'noir-luxe',
    designId: 'commerce-vibrant',
    imageSlots: [
      { key: 'hero', purpose: 'Large editorial campaign / lifestyle hero photograph' },
      { key: 'g0', purpose: 'Product photo 1 (portrait packshot)' },
      { key: 'g1', purpose: 'Product photo 2 (portrait packshot)' },
      { key: 'g2', purpose: 'Product photo 3 (portrait packshot)' },
      { key: 'g3', purpose: 'Product photo 4 (portrait packshot)' },
      { key: 'showcase', purpose: 'Brand-story / craftsmanship close-up photograph' },
    ],
    placeholder: {
      brand: 'Medusa',
      hero: {
        eyebrow: 'New arrivals',
        title: 'Designed for everyday essentials',
        subtitle: 'New season, new essentials',
        primaryCta: { label: 'Shop now', href: '#' },
        secondaryCta: { label: 'Explore the collection', href: '#' },
      },
    },
    code: MEDUSA_CODE,
  },
  {
    id: 'appwrite-cloud',
    name: 'Appwrite Cloud',
    category: 'Developer / Cloud & Backend',
    description:
      'Split hero with a product screenshot, a hover-lift feature grid, a metrics panel, three-tier pricing and FAQ. For cloud platforms, BaaS, dev tools and technical products that need a clear pricing story.',
    source: {
      repo: 'appwrite/appwrite',
      url: 'https://github.com/appwrite/appwrite',
      stars: 47000,
      author: 'Appwrite',
    },
    themeId: 'magenta-pop',
    designId: 'minimal-clean',
    imageSlots: [
      { key: 'hero', purpose: 'Product console / dashboard screenshot beside the headline' },
    ],
    placeholder: {
      brand: 'Appwrite',
      hero: {
        title: 'Your backend, minus the hassle',
        subtitle: 'Add authentication, databases, storage and functions to any app in minutes.',
        primaryCta: { label: 'Get started', href: '#' },
        secondaryCta: { label: 'Read the docs', href: '#' },
        badges: ['Open source', 'Self-host or cloud', 'SOC 2'],
      },
    },
    code: APPWRITE_CODE,
  },
  {
    id: 'documenso-trust',
    name: 'Documenso Trust',
    category: 'SaaS / Trust & Compliance',
    description:
      'Trust-forward centered hero with a product screenshot, a customer logo strip, a feature trio, a numbered how-it-works, a dark metrics band and a testimonial. For e-signature, legal, security, fintech and compliance products.',
    source: {
      repo: 'documenso/documenso',
      url: 'https://github.com/documenso/documenso',
      stars: 11000,
      author: 'Documenso',
    },
    themeId: 'corporate-navy',
    designId: 'industrial-corporate',
    imageSlots: [
      { key: 'hero', purpose: 'Wide product UI screenshot under the headline' },
    ],
    placeholder: {
      brand: 'Documenso',
      hero: {
        eyebrow: 'Trusted & open source',
        title: 'The signing standard for everyone',
        subtitle: 'Sign, send and manage documents with confidence — secure, auditable and beautifully simple.',
        primaryCta: { label: 'Get started', href: '#' },
        secondaryCta: { label: 'Contact sales', href: '#' },
      },
    },
    code: DOCUMENSO_CODE,
  },
  {
    id: 'twenty-crm',
    name: 'Twenty CRM',
    category: 'SaaS / B2B & Operations',
    description:
      'B2B product landing with a centered hero screenshot, customer logos, a two-up icon feature list, an alternating showcase with checklist and a metrics band. For CRMs, sales tools, dashboards, analytics and operations software.',
    source: {
      repo: 'twentyhq/twenty',
      url: 'https://github.com/twentyhq/twenty',
      stars: 27000,
      author: 'Twenty',
    },
    themeId: 'electric-indigo',
    designId: 'minimal-clean',
    imageSlots: [
      { key: 'hero', purpose: 'Wide product UI / dashboard screenshot under the headline' },
      { key: 'showcase', purpose: 'Secondary product screenshot for the alternating block' },
    ],
    placeholder: {
      brand: 'Twenty',
      hero: {
        title: 'The CRM your team will actually love',
        subtitle: 'A powerful, open-source CRM that adapts to how your team really works.',
        primaryCta: { label: 'Start for free', href: '#' },
        secondaryCta: { label: 'Live demo', href: '#' },
        badges: ['Open source', 'Customizable', 'Self-host ready'],
      },
    },
    code: TWENTY_CODE,
  },
  {
    id: 'dub-marketing',
    name: 'Dub Marketing',
    category: 'SaaS / Growth & Marketing',
    description:
      'Bold high-impact marketing landing with an oversized gradient hero, a stat trio, a hover-lift feature grid and a three-column testimonial wall. For growth tools, marketing platforms, link/analytics products and confident modern startups.',
    source: {
      repo: 'dubinc/dub',
      url: 'https://github.com/dubinc/dub',
      stars: 20000,
      author: 'Dub',
    },
    themeId: 'cobalt-power',
    designId: 'aurora-saas',
    imageSlots: [
      { key: 'hero', purpose: 'Optional brand image (hero is type-led, so decorative)', decorative: true },
    ],
    placeholder: {
      brand: 'Dub',
      hero: {
        eyebrow: 'Link management for modern teams',
        title: 'The links infrastructure for growth',
        subtitle: 'Create, share and track short links with powerful analytics — built for scale.',
        primaryCta: { label: 'Start free', href: '#' },
        secondaryCta: { label: 'Talk to sales', href: '#' },
      },
    },
    code: DUB_CODE,
  },
  {
    id: 'maybe-fintech',
    name: 'Maybe Fintech',
    category: 'Fintech / Finance & Wealth',
    description:
      'Polished fintech landing with a split portrait hero, a dark metrics panel, a feature grid, an alternating benefit showcase, a testimonial and FAQ. For banking, wealth, finance, investing and money-management products.',
    source: {
      repo: 'maybe-finance/maybe',
      url: 'https://github.com/maybe-finance/maybe',
      stars: 41000,
      author: 'Maybe',
    },
    themeId: 'emerald-trust',
    designId: 'minimal-clean',
    imageSlots: [
      { key: 'hero', purpose: 'App screenshot or aspirational portrait (4:5) for the split hero' },
      { key: 'showcase', purpose: 'Secondary product / lifestyle image for the benefit block' },
    ],
    placeholder: {
      brand: 'Maybe',
      hero: {
        eyebrow: 'Personal finance, reimagined',
        title: 'The OS for your personal finances',
        subtitle: 'See your whole financial life in one place and make confident decisions about your money.',
        primaryCta: { label: 'Open account', href: '#' },
        secondaryCta: { label: 'See pricing', href: '#' },
        badges: ['Bank-grade security', 'No hidden fees', 'Cancel anytime'],
      },
    },
    code: MAYBE_CODE,
  },
  {
    id: 'n8n-automation',
    name: 'n8n Automation',
    category: 'SaaS / Automation & Workflow',
    description:
      'Enterprise automation landing with a centered hero screenshot, an integrations chip strip, a feature grid, a numbered steps row, a metrics band and three-tier pricing. For automation, integrations, no-code/workflow and infrastructure platforms.',
    source: {
      repo: 'n8n-io/n8n',
      url: 'https://github.com/n8n-io/n8n',
      stars: 50000,
      author: 'n8n',
    },
    themeId: 'graphite-slate',
    designId: 'industrial-corporate',
    imageSlots: [
      { key: 'hero', purpose: 'Wide workflow / product canvas screenshot under the headline' },
    ],
    placeholder: {
      brand: 'n8n',
      hero: {
        eyebrow: 'Workflow automation',
        title: 'Automate work across every app',
        subtitle: 'Connect your tools and build powerful automations — no glue code required.',
        primaryCta: { label: 'Get started', href: '#' },
        secondaryCta: { label: 'Book a demo', href: '#' },
      },
    },
    code: N8N_CODE,
  },
  {
    id: 'studio-noir',
    name: 'Studio Noir',
    category: 'Agency / Creative Studio',
    description:
      'Awwwards-grade dark editorial studio site: oversized display headline, an infinite marquee strip, an asymmetric "selected work" image grid with hover reveals, a numbered services list and a bold full-bleed CTA. For design studios, agencies, creative brands and high-end portfolios.',
    source: {
      repo: 'studio-freight/lenis',
      url: 'https://github.com/studio-freight/lenis',
      stars: 8000,
      author: 'Studio Freight',
    },
    themeId: 'noir-luxe',
    designId: 'editorial-luxury',
    imageSlots: [
      { key: 'hero', purpose: 'Hero / featured project — striking wide editorial photograph or art-directed render' },
      { key: 'showcase', purpose: 'Second featured project image, art-directed' },
      { key: 'work3', purpose: 'Third project thumbnail in the work grid' },
      { key: 'work4', purpose: 'Fourth project thumbnail in the work grid' },
    ],
    placeholder: {
      brand: 'Noir',
      hero: {
        eyebrow: 'Independent studio',
        title: 'We craft brands that move',
        subtitle: 'A design studio building identities, websites and motion for ambitious teams.',
        primaryCta: { label: 'View work', href: '/products' },
        secondaryCta: { label: 'Start a project', href: '/contact' },
      },
    },
    code: STUDIO_NOIR_CODE,
  },
  {
    id: 'lumen-tech',
    name: 'Lumen',
    category: 'SaaS / Tech (Premium)',
    description:
      'Awwwards-grade premium SaaS landing: a glowing gradient-mesh hero with an animated product shot, a varied bento feature grid, a logo strip, a metrics band, three-tier pricing and a luminous CTA. Linear/Vercel-class polish for software, AI tools and modern tech platforms.',
    source: {
      repo: 'magicuidesign/magicui',
      url: 'https://github.com/magicuidesign/magicui',
      stars: 18000,
      author: 'Magic UI',
    },
    themeId: 'midnight-aurora',
    designId: 'aurora-saas',
    imageSlots: [
      { key: 'hero', purpose: 'Hero product UI screenshot / dashboard mockup glowing on a dark gradient' },
    ],
    placeholder: {
      brand: 'Lumen',
      hero: {
        eyebrow: 'New · v2 is live',
        title: 'The platform that ships itself',
        subtitle: 'Plan, build and launch on one luminous, lightning-fast workspace.',
        primaryCta: { label: 'Get started', href: '/products' },
        secondaryCta: { label: 'Talk to us', href: '/contact' },
      },
    },
    code: LUMEN_CODE,
  },
  {
    id: 'atelier-lux',
    name: 'Atelier',
    category: 'Luxury Brand / Lookbook',
    description:
      'Awwwards-grade luxury brand / lookbook site: magazine editorial layout with a serif display headline, a split hero portrait, an infinite values marquee, an asymmetric collection grid, a single oversized quote and an elegant appointment CTA. For fashion, beauty, jewelry, hospitality and high-end boutiques.',
    source: {
      repo: 'bchiang7/v4',
      url: 'https://github.com/bchiang7/v4',
      stars: 8500,
      author: 'Brittany Chiang',
    },
    themeId: 'champagne-serif',
    designId: 'editorial-luxury',
    imageSlots: [
      { key: 'hero', purpose: 'Tall art-directed brand / fashion portrait, magazine cover quality' },
      { key: 'look2', purpose: 'Second lookbook / collection image' },
      { key: 'look3', purpose: 'Third lookbook / collection image' },
      { key: 'showcase', purpose: 'Fourth lookbook / detail image' },
    ],
    placeholder: {
      brand: 'Atelier',
      hero: {
        eyebrow: 'Maison',
        title: 'Quietly extraordinary',
        subtitle: 'A house of handcrafted pieces, made in limited series for those who notice the details.',
        primaryCta: { label: 'Discover', href: '/products' },
        secondaryCta: { label: 'Our story', href: '/about' },
      },
    },
    code: ATELIER_CODE,
  },
  {
    id: 'kinetic-brutalist',
    name: 'Kinetic',
    category: 'Agency / Bold Brutalist',
    description:
      'Awwwards-grade brutalist kinetic site: enormous uppercase display headline, hard 2px borders, a high-contrast running marquee band, a gridded numbered feature matrix and a blunt full-bleed CTA. For bold agencies, type-driven studios, music/streetwear and statement brands.',
    source: {
      repo: 'adrianhajdin/award-winning-website',
      url: 'https://github.com/adrianhajdin/award-winning-website',
      stars: 1000,
      author: 'JavaScript Mastery',
    },
    themeId: 'mono-brutalist',
    designId: 'brutalist-bold',
    imageSlots: [
      { key: 'hero', purpose: 'Bold art-directed image for the showcase block (high contrast)' },
    ],
    placeholder: {
      brand: 'KINETIC',
      hero: {
        eyebrow: 'New',
        title: 'Make it move',
        subtitle: 'A bold studio for brands that refuse to blend in.',
        primaryCta: { label: 'Enter', href: '/products' },
        secondaryCta: { label: 'Contact', href: '/contact' },
      },
    },
    code: KINETIC_CODE,
  },
  {
    id: 'horizon-immersive',
    name: 'Horizon',
    category: 'Hospitality / Travel & Real Estate',
    description:
      'Awwwards-grade immersive site: a cinematic full-bleed hero photograph with a gradient scrim, alternating image/text scroll-story sections, a metrics band, a single editorial testimonial and a full-bleed photo CTA. For hotels, resorts, travel, restaurants, real estate and experiences.',
    source: {
      repo: 'olivierlarose/awwwards-landing-page',
      url: 'https://github.com/olivierlarose/awwwards-landing-page',
      stars: 215,
      author: 'Olivier Larose',
    },
    themeId: 'forest-deep',
    designId: 'editorial-luxury',
    imageSlots: [
      { key: 'hero', purpose: 'Cinematic full-bleed hero photograph — destination / property / interior' },
      { key: 'scene2', purpose: 'Story image 1 (alternating section)' },
      { key: 'scene3', purpose: 'Story image 2 (alternating section)' },
      { key: 'showcase', purpose: 'Atmospheric full-bleed image behind the closing CTA' },
    ],
    placeholder: {
      brand: 'Horizon',
      hero: {
        eyebrow: 'Welcome',
        title: 'Where the world slows down',
        subtitle: 'A sanctuary of light, landscape and quiet luxury.',
        primaryCta: { label: 'Explore', href: '/products' },
        secondaryCta: { label: 'Reserve', href: '/contact' },
      },
    },
    code: HORIZON_CODE,
  },
  {
    id: 'prism-vibrant',
    name: 'Prism',
    category: 'Creative / Startup (Vibrant)',
    description:
      'Awwwards-grade vibrant gradient site: aurora blobs behind a gradient-clipped headline, a glassmorphism feature grid, a logo strip, a metrics band, three-tier pricing and a saturated gradient CTA. For creative startups, web3, design tools and playful modern brands.',
    source: {
      repo: 'aceternity/ui',
      url: 'https://github.com/aceternity/ui',
      stars: 5000,
      author: 'Manu Arora',
    },
    themeId: 'magenta-pop',
    designId: 'aurora-saas',
    imageSlots: [
      { key: 'hero', purpose: 'Colorful hero product / artwork screenshot on a vibrant gradient' },
    ],
    placeholder: {
      brand: 'Prism',
      hero: {
        eyebrow: 'Now in beta',
        title: 'Create in full color',
        subtitle: 'The vibrant workspace for teams that make beautiful things.',
        primaryCta: { label: 'Get started', href: '/products' },
        secondaryCta: { label: 'Learn more', href: '/contact' },
      },
    },
    code: PRISM_CODE,
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

/** Sentinel template id meaning "let the AI pick the best-fitting template". */
export const AUTO_LANDING_TEMPLATE_ID = 'auto'

/**
 * A compact, LLM-friendly catalog of every template (id + name + category +
 * one-line intent) used by the smart-match step to choose the best fit for a
 * brief. Kept terse so it fits comfortably in the prompt.
 */
export function landingTemplateCatalogForPrompt(): string {
  return LANDING_TEMPLATES.map(
    (t) => `- ${t.id} — "${t.name}" (${t.category}): ${t.description}`,
  ).join('\n')
}
