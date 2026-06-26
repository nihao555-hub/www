'use client'

import * as React from 'react'
import Image from 'next/image'

import { getTheme } from '@/lib/ai/themes'
import { getDesign, type DesignFamily } from '@/lib/ai/design-systems'
import type { SiteSpec, SpecPage, SpecSection } from '@/lib/ai/site-spec'

import { SpecIcon } from './Icon'

type Props = {
  spec: SiteSpec
  /** absolute or relative URLs for the uploaded product images, by index */
  images: string[]
}

/* -------------------------------------------------------------------------- */
/* Design-family runtime helpers                                               */
/* -------------------------------------------------------------------------- */

const DesignContext = React.createContext<DesignFamily>(getDesign())
const useDesign = () => React.useContext(DesignContext)

/** Max-width container class for the active design family. */
function containerClass(d: DesignFamily): string {
  switch (d.container) {
    case 'narrow':
      return 'max-w-4xl'
    case 'wide':
      return 'max-w-7xl'
    default:
      return 'max-w-6xl'
  }
}

/** Vertical section padding for the active design family. */
function sectionPadClass(d: DesignFamily): string {
  switch (d.spacing) {
    case 'tight':
      return 'py-12 sm:py-16'
    case 'roomy':
      return 'py-24 sm:py-32'
    default:
      return 'py-20 sm:py-24'
  }
}

/** Button corner radius for the active design family. */
function btnRadius(d: DesignFamily, theme: ReturnType<typeof getTheme>): string {
  switch (d.button) {
    case 'pill':
      return '9999px'
    case 'square':
      return '2px'
    default:
      return `calc(${theme.radius} * 1.4)`
  }
}

/** Base card style (fill / border / radius / shadow) for the active family. */
function cardStyle(
  d: DesignFamily,
  theme: ReturnType<typeof getTheme>,
): React.CSSProperties {
  const c = theme.colors
  switch (d.cardStyle) {
    case 'outline':
      return {
        background: 'transparent',
        border: `1.5px solid ${c.border}`,
        borderRadius: `calc(${theme.radius} * 0.6)`,
      }
    case 'flat':
      return {
        background: c.card,
        border: 'none',
        borderRadius: '2px',
      }
    case 'elevated':
      return {
        background: c.card,
        border: `1px solid ${c.border}`,
        borderRadius: `calc(${theme.radius} * 2)`,
        boxShadow: '0 24px 50px -24px rgba(0,0,0,0.30)',
      }
    default: // soft
      return {
        background: c.card,
        border: `1px solid ${c.border}`,
        borderRadius: `calc(${theme.radius} * 1.6)`,
        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
      }
  }
}

/** Decorative background layer (gradient blobs / grid / dots) for a section. */
const Decoration: React.FC<{ theme: ReturnType<typeof getTheme> }> = ({ theme }) => {
  const d = useDesign()
  const c = theme.colors
  if (d.decoration === 'none') return null
  if (d.decoration === 'blobs') {
    return (
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div
          className="absolute -left-24 -top-24 h-72 w-72 rounded-full blur-3xl"
          style={{ background: `color-mix(in oklab, ${c.primary} 22%, transparent)` }}
        />
        <div
          className="absolute -bottom-28 -right-16 h-80 w-80 rounded-full blur-3xl"
          style={{ background: `color-mix(in oklab, ${c.accent} 20%, transparent)` }}
        />
      </div>
    )
  }
  if (d.decoration === 'grid') {
    return (
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden
        style={{
          backgroundImage: `linear-gradient(${c.border} 1px, transparent 1px), linear-gradient(90deg, ${c.border} 1px, transparent 1px)`,
          backgroundSize: '44px 44px',
          opacity: 0.4,
          maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 80%)',
        }}
      />
    )
  }
  // dots
  return (
    <div
      className="pointer-events-none absolute inset-0"
      aria-hidden
      style={{
        backgroundImage: `radial-gradient(${c.border} 1.3px, transparent 1.3px)`,
        backgroundSize: '22px 22px',
        opacity: 0.5,
      }}
    />
  )
}

function img(images: string[], index?: number): string | undefined {
  if (typeof index !== 'number') return images[0]
  return images[index] ?? images[0]
}

/** Normalize an in-site cta/nav url to a page path ('' for home). */
function urlToPath(url: string): string | null {
  if (!url) return null
  const u = url.trim()
  if (/^(https?:|mailto:|tel:|#)/i.test(u)) return null
  return u.replace(/^\/+|\/+$/g, '')
}

export const SiteRenderer: React.FC<Props> = ({ spec, images }) => {
  const theme = getTheme(spec.themeId)
  const design = getDesign(spec.designId)
  const c = theme.colors
  const [active, setActive] = React.useState('')

  const page: SpecPage = React.useMemo(() => {
    return spec.pages.find((p) => p.path === active) || spec.pages[0]
  }, [spec.pages, active])

  const go = React.useCallback(
    (path: string) => {
      setActive(path)
      if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
    },
    [],
  )

  const onCta = React.useCallback(
    (e: React.MouseEvent, url: string) => {
      const path = urlToPath(url)
      if (path !== null) {
        e.preventDefault()
        const exists = spec.pages.some((p) => p.path === path)
        go(exists ? path : '')
      }
    },
    [go, spec.pages],
  )

  const wrapStyle: React.CSSProperties = {
    background: c.background,
    color: c.foreground,
    fontFamily: `'${theme.fonts.body}', system-ui, sans-serif`,
    ['--radius' as string]: theme.radius,
  }
  const headingFont = `'${theme.fonts.heading}', system-ui, sans-serif`

  return (
    <DesignContext.Provider value={design}>
      <div style={wrapStyle} className="min-h-screen w-full antialiased">
        <Header
          spec={spec}
          theme={theme}
          active={page.path}
          onNav={go}
          headingFont={headingFont}
        />

        <main>
          {page.hero ? (
            <Hero
              hero={page.hero}
              images={images}
              theme={theme}
              headingFont={headingFont}
              isHome={page.path === ''}
              onCta={onCta}
            />
          ) : null}

          {spec.brandIcons && spec.brandIcons.length && page.path === '' ? (
            <BrandStrip icons={spec.brandIcons} theme={theme} />
          ) : null}

          {page.sections.map((section, i) => (
            <SectionView
              key={i}
              section={section}
              images={images}
              theme={theme}
              headingFont={headingFont}
              onCta={onCta}
            />
          ))}
        </main>

        <Footer spec={spec} theme={theme} onNav={go} headingFont={headingFont} />
      </div>
    </DesignContext.Provider>
  )
}

/* -------------------------------------------------------------------------- */
/* Header                                                                      */
/* -------------------------------------------------------------------------- */

const Header: React.FC<{
  spec: SiteSpec
  theme: ReturnType<typeof getTheme>
  active: string
  onNav: (path: string) => void
  headingFont: string
}> = ({ spec, theme, active, onNav, headingFont }) => {
  const c = theme.colors
  const d = useDesign()
  return (
    <header
      className="sticky top-0 z-50 w-full backdrop-blur"
      style={{
        background: `color-mix(in oklab, ${c.background} 85%, transparent)`,
        borderBottom: `1px solid ${c.border}`,
      }}
    >
      <div className={`mx-auto flex h-16 ${containerClass(d)} items-center justify-between px-5`}>
        <button
          onClick={() => onNav('')}
          className="flex flex-col items-start leading-none"
          style={{ color: c.foreground }}
        >
          <span className="text-lg font-extrabold tracking-tight" style={{ fontFamily: headingFont }}>
            {spec.siteName}
          </span>
          {spec.tagline ? (
            <span className="text-[11px] font-medium" style={{ color: c.mutedForeground }}>
              {spec.tagline}
            </span>
          ) : null}
        </button>

        <nav className="hidden items-center gap-1 md:flex">
          {spec.pages.map((p) => {
            const on = p.path === active
            return (
              <button
                key={p.path || 'home'}
                onClick={() => onNav(p.path)}
                className="rounded-md px-3 py-2 text-sm font-semibold transition-colors"
                style={{
                  color: on ? c.primary : c.mutedForeground,
                  background: on ? `color-mix(in oklab, ${c.primary} 12%, transparent)` : 'transparent',
                }}
              >
                {p.navLabel}
              </button>
            )
          })}
        </nav>

        <button
          onClick={() => onNav('contact')}
          className="px-4 py-2 text-sm font-semibold shadow-sm transition-transform hover:scale-[1.03]"
          style={{ background: c.primary, color: c.primaryForeground, borderRadius: btnRadius(d, theme) }}
        >
          {contactLabel(spec)}
        </button>
      </div>

      {/* compact nav for small screens */}
      <nav
        className="flex items-center gap-1 overflow-x-auto px-3 pb-2 md:hidden"
        style={{ borderTop: `1px solid ${c.border}` }}
      >
        {spec.pages.map((p) => {
          const on = p.path === active
          return (
            <button
              key={p.path || 'home'}
              onClick={() => onNav(p.path)}
              className="whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold"
              style={{ color: on ? c.primary : c.mutedForeground }}
            >
              {p.navLabel}
            </button>
          )
        })}
      </nav>
    </header>
  )
}

function contactLabel(spec: SiteSpec): string {
  const contact = spec.pages.find((p) => p.path === 'contact')
  return contact?.navLabel || 'Contact'
}

/* -------------------------------------------------------------------------- */
/* Hero                                                                        */
/* -------------------------------------------------------------------------- */

type HeroData = NonNullable<SpecPage['hero']>

type HeroProps = {
  hero: HeroData
  images: string[]
  theme: ReturnType<typeof getTheme>
  headingFont: string
  isHome: boolean
  onCta: (e: React.MouseEvent, url: string) => void
}

const Hero: React.FC<HeroProps> = (props) => {
  const d = useDesign()
  switch (d.hero) {
    case 'split':
      return <HeroSplit {...props} />
    case 'centered':
      return <HeroCentered {...props} />
    case 'editorial':
      return <HeroEditorial {...props} />
    case 'card':
      return <HeroCard {...props} />
    default:
      return <HeroOverlay {...props} />
  }
}

/** Badges rendered for light backgrounds (used by non-overlay heroes). */
const HeroBadgesLight: React.FC<{ hero: HeroData; theme: ReturnType<typeof getTheme> }> = ({
  hero,
  theme,
}) => {
  const c = theme.colors
  if (!hero.badges || !hero.badges.length) return null
  return (
    <div className="mb-5 flex flex-wrap gap-2">
      {hero.badges.map((b, i) => (
        <span
          key={i}
          className="rounded-full px-3 py-1 text-xs font-semibold tracking-wide"
          style={{
            background: `color-mix(in oklab, ${c.primary} 12%, transparent)`,
            color: c.primary,
            border: `1px solid color-mix(in oklab, ${c.primary} 24%, transparent)`,
          }}
        >
          {b}
        </span>
      ))}
    </div>
  )
}

const HeroCtas: React.FC<{
  hero: HeroData
  theme: ReturnType<typeof getTheme>
  onCta: HeroProps['onCta']
  onImage?: boolean
}> = ({ hero, theme, onCta, onImage }) => {
  const c = theme.colors
  const d = useDesign()
  if (!hero.ctas || !hero.ctas.length) return null
  return (
    <div className="mt-8 flex flex-wrap gap-3">
      {hero.ctas.map((cta, i) => (
        <a
          key={i}
          href={cta.url || '#'}
          onClick={(e) => onCta(e, cta.url)}
          className="px-6 py-3 text-sm font-bold shadow-lg transition-transform hover:scale-[1.04]"
          style={{
            borderRadius: btnRadius(d, theme),
            ...(i === 0
              ? { background: c.primary, color: c.primaryForeground }
              : onImage
                ? {
                    background: 'rgba(255,255,255,0.10)',
                    color: '#fff',
                    border: '1.5px solid rgba(255,255,255,0.55)',
                  }
                : {
                    background: 'transparent',
                    color: c.foreground,
                    border: `1.5px solid ${c.border}`,
                  }),
          }}
        >
          {cta.label}
        </a>
      ))}
    </div>
  )
}

function headlineClass(d: DesignFamily, big?: boolean): string {
  const base = big
    ? 'text-5xl font-extrabold leading-[1.03] sm:text-6xl md:text-7xl'
    : 'text-4xl font-extrabold leading-[1.08] sm:text-5xl md:text-6xl'
  return d.uppercaseHeadings ? `${base} uppercase tracking-tight` : `${base} tracking-tight`
}

/* Variant: full-bleed image with dark overlay (classic, high-contrast). */
const HeroOverlay: React.FC<HeroProps> = ({ hero, images, theme, headingFont, isHome, onCta }) => {
  const c = theme.colors
  const d = useDesign()
  const bg = img(images, hero.imageIndex)
  return (
    <section
      className="relative flex w-full items-center overflow-hidden"
      style={{ minHeight: isHome ? '88vh' : '46vh' }}
    >
      {bg ? (
        <Image src={bg} alt={hero.headline} fill priority sizes="100vw" className="object-cover" />
      ) : (
        <div className="absolute inset-0" style={{ background: c.primary }} />
      )}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(105deg, rgba(8,10,18,0.86) 0%, rgba(8,10,18,0.66) 45%, rgba(8,10,18,0.32) 100%)',
        }}
      />
      <div className={`relative mx-auto w-full ${containerClass(d)} px-5 py-20`}>
        <div className="max-w-2xl">
          {hero.badges && hero.badges.length ? (
            <div className="mb-5 flex flex-wrap gap-2">
              {hero.badges.map((b, i) => (
                <span
                  key={i}
                  className="rounded-full px-3 py-1 text-xs font-semibold tracking-wide text-white"
                  style={{
                    background: 'rgba(255,255,255,0.12)',
                    border: '1px solid rgba(255,255,255,0.28)',
                    backdropFilter: 'blur(4px)',
                  }}
                >
                  {b}
                </span>
              ))}
            </div>
          ) : null}
          <h1
            className={`${headlineClass(d)} text-white`}
            style={{ fontFamily: headingFont, textShadow: '0 2px 24px rgba(0,0,0,0.45)' }}
          >
            {hero.headline}
          </h1>
          {hero.subheadline ? (
            <p
              className="mt-5 max-w-xl text-lg leading-relaxed text-white/85"
              style={{ textShadow: '0 1px 12px rgba(0,0,0,0.4)' }}
            >
              {hero.subheadline}
            </p>
          ) : null}
          <HeroCtas hero={hero} theme={theme} onCta={onCta} onImage />
        </div>
      </div>
    </section>
  )
}

/* Variant: copy on the left, framed product image card on the right. */
const HeroSplit: React.FC<HeroProps> = ({ hero, images, theme, headingFont, isHome, onCta }) => {
  const c = theme.colors
  const d = useDesign()
  const bg = img(images, hero.imageIndex)
  return (
    <section
      className="relative w-full overflow-hidden"
      style={{ background: c.muted, minHeight: isHome ? '82vh' : '40vh' }}
    >
      <Decoration theme={theme} />
      <div
        className={`relative mx-auto grid w-full ${containerClass(d)} items-center gap-10 px-5 py-20 lg:grid-cols-2 lg:py-28`}
      >
        <div>
          <HeroBadgesLight hero={hero} theme={theme} />
          <h1
            className={headlineClass(d)}
            style={{ fontFamily: headingFont, color: c.foreground }}
          >
            {hero.headline}
          </h1>
          {hero.subheadline ? (
            <p className="mt-5 max-w-xl text-lg leading-relaxed" style={{ color: c.mutedForeground }}>
              {hero.subheadline}
            </p>
          ) : null}
          <HeroCtas hero={hero} theme={theme} onCta={onCta} />
        </div>
        {bg ? (
          <div
            className="relative aspect-[4/3] w-full overflow-hidden"
            style={{
              borderRadius: `calc(${theme.radius} * 1.4)`,
              border: `1px solid ${c.border}`,
              boxShadow: '0 30px 70px -28px rgba(0,0,0,0.4)',
            }}
          >
            <Image src={bg} alt={hero.headline} fill priority sizes="(max-width:1024px) 100vw, 50vw" className="object-cover" />
          </div>
        ) : null}
      </div>
    </section>
  )
}

/* Variant: centered copy over soft gradient blobs, image panel below. */
const HeroCentered: React.FC<HeroProps> = ({ hero, images, theme, headingFont, isHome, onCta }) => {
  const c = theme.colors
  const d = useDesign()
  const bg = img(images, hero.imageIndex)
  return (
    <section
      className="relative w-full overflow-hidden"
      style={{
        background: `linear-gradient(180deg, ${c.muted} 0%, ${c.background} 100%)`,
      }}
    >
      <Decoration theme={theme} />
      <div className={`relative mx-auto w-full ${containerClass(d)} px-5 pt-24 ${isHome ? 'pb-12' : 'pb-12'} text-center`}>
        <div className="mx-auto max-w-3xl">
          {hero.badges && hero.badges.length ? (
            <div className="mb-5 flex flex-wrap justify-center gap-2">
              {hero.badges.map((b, i) => (
                <span
                  key={i}
                  className="rounded-full px-3 py-1 text-xs font-semibold tracking-wide"
                  style={{
                    background: `color-mix(in oklab, ${c.primary} 12%, transparent)`,
                    color: c.primary,
                    border: `1px solid color-mix(in oklab, ${c.primary} 24%, transparent)`,
                  }}
                >
                  {b}
                </span>
              ))}
            </div>
          ) : null}
          <h1
            className={`${headlineClass(d, true)} mx-auto`}
            style={{ fontFamily: headingFont, color: c.foreground }}
          >
            {hero.headline}
          </h1>
          {hero.subheadline ? (
            <p
              className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed sm:text-xl"
              style={{ color: c.mutedForeground }}
            >
              {hero.subheadline}
            </p>
          ) : null}
          <div className="flex justify-center">
            <HeroCtas hero={hero} theme={theme} onCta={onCta} />
          </div>
        </div>
        {bg && isHome ? (
          <div
            className="relative mx-auto mt-14 aspect-[16/8] w-full max-w-5xl overflow-hidden"
            style={{
              borderRadius: `calc(${theme.radius} * 1.8)`,
              border: `1px solid ${c.border}`,
              boxShadow: '0 40px 90px -40px rgba(0,0,0,0.45)',
            }}
          >
            <Image src={bg} alt={hero.headline} fill priority sizes="100vw" className="object-cover" />
          </div>
        ) : null}
      </div>
    </section>
  )
}

/* Variant: oversized editorial headline, image as a wide band below. */
const HeroEditorial: React.FC<HeroProps> = ({ hero, images, theme, headingFont, isHome, onCta }) => {
  const c = theme.colors
  const d = useDesign()
  const bg = img(images, hero.imageIndex)
  return (
    <section className="relative w-full" style={{ background: c.background }}>
      <div className={`relative mx-auto w-full ${containerClass(d)} px-5 pt-24 pb-12`}>
        <div className="max-w-4xl">
          <HeroBadgesLight hero={hero} theme={theme} />
          <h1
            className={`${d.uppercaseHeadings ? 'uppercase ' : ''}text-5xl font-light leading-[1.02] tracking-tight sm:text-6xl md:text-7xl`}
            style={{ fontFamily: headingFont, color: c.foreground }}
          >
            {hero.headline}
          </h1>
          {hero.subheadline ? (
            <p className="mt-8 max-w-2xl text-lg leading-relaxed" style={{ color: c.mutedForeground }}>
              {hero.subheadline}
            </p>
          ) : null}
          <HeroCtas hero={hero} theme={theme} onCta={onCta} />
        </div>
      </div>
      {bg ? (
        <div
          className="relative w-full overflow-hidden"
          style={{ height: isHome ? '52vh' : '32vh' }}
        >
          <Image src={bg} alt={hero.headline} fill priority sizes="100vw" className="object-cover" />
        </div>
      ) : null}
    </section>
  )
}

/* Variant: full image with an offset floating glass card holding the copy. */
const HeroCard: React.FC<HeroProps> = ({ hero, images, theme, headingFont, isHome, onCta }) => {
  const c = theme.colors
  const d = useDesign()
  const bg = img(images, hero.imageIndex)
  return (
    <section
      className="relative flex w-full items-center overflow-hidden"
      style={{ minHeight: isHome ? '86vh' : '44vh' }}
    >
      {bg ? (
        <Image src={bg} alt={hero.headline} fill priority sizes="100vw" className="object-cover" />
      ) : (
        <div className="absolute inset-0" style={{ background: c.primary }} />
      )}
      <div
        className="absolute inset-0"
        style={{ background: 'linear-gradient(90deg, rgba(8,10,18,0.5), rgba(8,10,18,0.1))' }}
      />
      <div className={`relative mx-auto w-full ${containerClass(d)} px-5 py-16`}>
        <div
          className="max-w-xl p-8 sm:p-10"
          style={{
            background: `color-mix(in oklab, ${c.background} 88%, transparent)`,
            border: `1px solid ${c.border}`,
            borderRadius: `calc(${theme.radius} * 2)`,
            backdropFilter: 'blur(10px)',
            boxShadow: '0 30px 70px -30px rgba(0,0,0,0.5)',
          }}
        >
          <HeroBadgesLight hero={hero} theme={theme} />
          <h1
            className={headlineClass(d)}
            style={{ fontFamily: headingFont, color: c.foreground }}
          >
            {hero.headline}
          </h1>
          {hero.subheadline ? (
            <p className="mt-5 text-lg leading-relaxed" style={{ color: c.mutedForeground }}>
              {hero.subheadline}
            </p>
          ) : null}
          <HeroCtas hero={hero} theme={theme} onCta={onCta} />
        </div>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/* Brand / trust strip (21st.dev icons)                                        */
/* -------------------------------------------------------------------------- */

const BrandStrip: React.FC<{
  icons: NonNullable<SiteSpec['brandIcons']>
  theme: ReturnType<typeof getTheme>
}> = ({ icons, theme }) => {
  const c = theme.colors
  return (
    <section style={{ background: c.muted, borderBottom: `1px solid ${c.border}` }}>
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-10 gap-y-6 px-5 py-8">
        {icons.map((ic, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={i}
            src={ic.svgUrl}
            alt={ic.title}
            title={ic.title}
            className="h-8 w-auto opacity-60 grayscale transition hover:opacity-100 hover:grayscale-0"
          />
        ))}
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/* Sections                                                                    */
/* -------------------------------------------------------------------------- */

const SectionView: React.FC<{
  section: SpecSection
  images: string[]
  theme: ReturnType<typeof getTheme>
  headingFont: string
  onCta: (e: React.MouseEvent, url: string) => void
}> = ({ section, images, theme, headingFont, onCta }) => {
  switch (section.kind) {
    case 'features':
      return <Features section={section} theme={theme} headingFont={headingFont} />
    case 'stats':
      return <Stats section={section} theme={theme} headingFont={headingFont} />
    case 'showcase':
      return (
        <Showcase
          section={section}
          images={images}
          theme={theme}
          headingFont={headingFont}
          onCta={onCta}
        />
      )
    case 'gallery':
      return <Gallery section={section} images={images} theme={theme} headingFont={headingFont} />
    case 'steps':
      return <Steps section={section} theme={theme} headingFont={headingFont} />
    case 'faq':
      return <Faq section={section} theme={theme} headingFont={headingFont} />
    case 'richtext':
      return <RichText section={section} theme={theme} headingFont={headingFont} />
    case 'cta':
      return <CtaBand section={section} theme={theme} headingFont={headingFont} onCta={onCta} />
    case 'contact':
      return <Contact section={section} theme={theme} headingFont={headingFont} />
    default:
      return null
  }
}

const SectionHeading: React.FC<{
  title?: string
  subtitle?: string
  theme: ReturnType<typeof getTheme>
  headingFont: string
  center?: boolean
}> = ({ title, subtitle, theme, headingFont, center }) => {
  const c = theme.colors
  const d = useDesign()
  if (!title && !subtitle) return null
  return (
    <div className={`mb-12 max-w-2xl ${center ? 'mx-auto text-center' : ''}`}>
      {title ? (
        <h2
          className={`text-3xl font-bold sm:text-4xl ${d.uppercaseHeadings ? 'uppercase tracking-wide' : 'tracking-tight'}`}
          style={{ fontFamily: headingFont, color: c.foreground }}
        >
          {title}
        </h2>
      ) : null}
      {subtitle ? (
        <p className="mt-4 text-lg leading-relaxed" style={{ color: c.mutedForeground }}>
          {subtitle}
        </p>
      ) : null}
    </div>
  )
}

const Shell: React.FC<{
  children: React.ReactNode
  muted?: boolean
  theme: ReturnType<typeof getTheme>
  /** show the design family's decorative background layer */
  decorate?: boolean
}> = ({ children, muted, theme, decorate }) => {
  const d = useDesign()
  return (
    <section
      className={`relative w-full overflow-hidden px-5 ${sectionPadClass(d)}`}
      style={muted ? { background: theme.colors.muted } : undefined}
    >
      {decorate ? <Decoration theme={theme} /> : null}
      <div className={`relative mx-auto ${containerClass(d)}`}>{children}</div>
    </section>
  )
}

const Features: React.FC<{
  section: Extract<SpecSection, { kind: 'features' }>
  theme: ReturnType<typeof getTheme>
  headingFont: string
}> = ({ section, theme, headingFont }) => {
  const c = theme.colors
  const d = useDesign()
  const variant = d.feature
  const card = cardStyle(d, theme)

  // minimalList: single column, large type, hairline separators, no cards.
  if (variant === 'minimalList') {
    return (
      <Shell theme={theme} decorate>
        <SectionHeading title={section.title} subtitle={section.subtitle} theme={theme} headingFont={headingFont} />
        <div className="divide-y" style={{ borderColor: c.border }}>
          {section.items.map((f, i) => (
            <div key={i} className="grid gap-2 py-8 sm:grid-cols-[1fr_2fr] sm:gap-10">
              <h3
                className={`text-xl font-semibold ${d.uppercaseHeadings ? 'uppercase tracking-wide' : ''}`}
                style={{ fontFamily: headingFont, color: c.foreground }}
              >
                {f.title}
              </h3>
              <p className="text-base leading-relaxed" style={{ color: c.mutedForeground }}>
                {f.body}
              </p>
            </div>
          ))}
        </div>
      </Shell>
    )
  }

  // iconLeft: 2-up rows with the icon beside the copy.
  if (variant === 'iconLeft') {
    return (
      <Shell theme={theme} decorate>
        <SectionHeading title={section.title} subtitle={section.subtitle} theme={theme} headingFont={headingFont} />
        <div className="grid gap-8 sm:grid-cols-2">
          {section.items.map((f, i) => (
            <div key={i} className="flex items-start gap-4">
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
                style={{ background: `color-mix(in oklab, ${c.primary} 14%, transparent)`, color: c.primary }}
              >
                <SpecIcon name={f.icon} className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold" style={{ fontFamily: headingFont, color: c.foreground }}>
                  {f.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed" style={{ color: c.mutedForeground }}>
                  {f.body}
                </p>
              </div>
            </div>
          ))}
        </div>
      </Shell>
    )
  }

  // numbered / bordered / iconTopCard: 3-up grid, differing chrome.
  return (
    <Shell theme={theme} decorate>
      <SectionHeading title={section.title} subtitle={section.subtitle} theme={theme} headingFont={headingFont} center />
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {section.items.map((f, i) => (
          <div
            key={i}
            className="group p-7 transition-all hover:-translate-y-1"
            style={card}
          >
            {variant === 'numbered' ? (
              <div
                className="mb-5 text-4xl font-black tabular-nums"
                style={{ fontFamily: headingFont, color: c.primary, opacity: 0.9 }}
              >
                {String(i + 1).padStart(2, '0')}
              </div>
            ) : (
              <div
                className={`mb-5 flex items-center justify-center ${variant === 'bordered' ? 'h-12 w-12' : 'h-14 w-14'}`}
                style={{
                  background:
                    variant === 'bordered'
                      ? 'transparent'
                      : `color-mix(in oklab, ${c.primary} 14%, transparent)`,
                  color: c.primary,
                  border: variant === 'bordered' ? `1.5px solid ${c.primary}` : 'none',
                  borderRadius: variant === 'bordered' ? '2px' : `calc(${theme.radius} * 1.2)`,
                }}
              >
                <SpecIcon name={f.icon} className={variant === 'bordered' ? 'h-6 w-6' : 'h-7 w-7'} />
              </div>
            )}
            <h3
              className={`text-lg font-bold ${d.uppercaseHeadings ? 'uppercase tracking-wide' : ''}`}
              style={{ fontFamily: headingFont, color: c.cardForeground }}
            >
              {f.title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed" style={{ color: c.mutedForeground }}>
              {f.body}
            </p>
          </div>
        ))}
      </div>
    </Shell>
  )
}

const Stats: React.FC<{
  section: Extract<SpecSection, { kind: 'stats' }>
  theme: ReturnType<typeof getTheme>
  headingFont: string
}> = ({ section, theme, headingFont }) => {
  const c = theme.colors
  const d = useDesign()

  // band: full-width colored band with large numbers.
  if (d.stat === 'band') {
    return (
      <section className="w-full px-5" style={{ background: c.primary }}>
        <div className={`mx-auto ${containerClass(d)} ${sectionPadClass(d)}`}>
          {section.title ? (
            <h2
              className={`mb-10 text-center text-2xl font-bold sm:text-3xl ${d.uppercaseHeadings ? 'uppercase tracking-wide' : ''}`}
              style={{ fontFamily: headingFont, color: c.primaryForeground }}
            >
              {section.title}
            </h2>
          ) : null}
          <div className="grid grid-cols-2 gap-8 lg:grid-cols-4">
            {section.items.map((s, i) => (
              <div key={i} className="text-center">
                <div
                  className="text-4xl font-extrabold tracking-tight sm:text-5xl"
                  style={{ fontFamily: headingFont, color: c.primaryForeground }}
                >
                  {s.value}
                </div>
                <div
                  className="mt-2 text-sm font-medium"
                  style={{ color: `color-mix(in oklab, ${c.primaryForeground} 80%, transparent)` }}
                >
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    )
  }

  // inline: a single row of numbers separated by dividers.
  if (d.stat === 'inline') {
    return (
      <Shell theme={theme}>
        <SectionHeading title={section.title} theme={theme} headingFont={headingFont} center />
        <div
          className="flex flex-wrap items-center justify-center divide-x"
          style={{ borderColor: c.border }}
        >
          {section.items.map((s, i) => (
            <div key={i} className="px-8 py-4 text-center">
              <div
                className="text-4xl font-extrabold tracking-tight sm:text-5xl"
                style={{ fontFamily: headingFont, color: c.primary }}
              >
                {s.value}
              </div>
              <div className="mt-2 text-sm font-medium" style={{ color: c.mutedForeground }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </Shell>
    )
  }

  // cards: each stat in its own card.
  return (
    <Shell theme={theme} muted>
      <SectionHeading title={section.title} theme={theme} headingFont={headingFont} center />
      <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
        {section.items.map((s, i) => (
          <div key={i} className="px-4 py-8 text-center" style={cardStyle(d, theme)}>
            <div
              className="text-4xl font-extrabold tracking-tight sm:text-5xl"
              style={{ fontFamily: headingFont, color: c.primary }}
            >
              {s.value}
            </div>
            <div className="mt-2 text-sm font-medium" style={{ color: c.mutedForeground }}>
              {s.label}
            </div>
          </div>
        ))}
      </div>
    </Shell>
  )
}

const Showcase: React.FC<{
  section: Extract<SpecSection, { kind: 'showcase' }>
  images: string[]
  theme: ReturnType<typeof getTheme>
  headingFont: string
  onCta: (e: React.MouseEvent, url: string) => void
}> = ({ section, images, theme, headingFont, onCta }) => {
  const c = theme.colors
  const d = useDesign()
  const src = img(images, section.imageIndex)
  const imageRight = section.layout === 'imageRight'
  return (
    <Shell theme={theme}>
      <div className="grid items-center gap-10 lg:grid-cols-2">
        <div className={imageRight ? 'lg:order-2' : ''}>
          {src ? (
            <div
              className="relative aspect-[4/3] w-full overflow-hidden"
              style={{
                borderRadius: `calc(${theme.radius} * 2)`,
                boxShadow: '0 24px 60px -20px rgba(0,0,0,0.35)',
              }}
            >
              <Image src={src} alt={section.title || 'showcase'} fill sizes="(max-width:1024px) 100vw, 50vw" className="object-cover" />
            </div>
          ) : null}
        </div>
        <div className={imageRight ? 'lg:order-1' : ''}>
          {section.title ? (
            <h2
              className="text-3xl font-bold tracking-tight sm:text-4xl"
              style={{ fontFamily: headingFont, color: c.foreground }}
            >
              {section.title}
            </h2>
          ) : null}
          {section.body ? (
            <p className="mt-4 text-lg leading-relaxed" style={{ color: c.mutedForeground }}>
              {section.body}
            </p>
          ) : null}
          {section.bullets && section.bullets.length ? (
            <ul className="mt-6 space-y-3">
              {section.bullets.map((b, i) => (
                <li key={i} className="flex items-start gap-3">
                  <SpecIcon
                    name="check"
                    className="mt-0.5 h-5 w-5 shrink-0"
                    strokeWidth={2.25}
                  />
                  <span style={{ color: c.foreground }}>{b}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {section.cta ? (
            <a
              href={section.cta.url || '#'}
              onClick={(e) => onCta(e, section.cta!.url)}
              className="mt-8 inline-block px-6 py-3 text-sm font-bold shadow-md transition-transform hover:scale-[1.04]"
              style={{ background: c.primary, color: c.primaryForeground, borderRadius: btnRadius(d, theme) }}
            >
              {section.cta.label}
            </a>
          ) : null}
        </div>
      </div>
    </Shell>
  )
}

const Gallery: React.FC<{
  section: Extract<SpecSection, { kind: 'gallery' }>
  images: string[]
  theme: ReturnType<typeof getTheme>
  headingFont: string
}> = ({ section, images, theme, headingFont }) => {
  return (
    <Shell theme={theme} muted>
      <SectionHeading
        title={section.title}
        subtitle={section.subtitle}
        theme={theme}
        headingFont={headingFont}
        center
      />
      <div className="grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-3">
        {section.imageIndexes.map((idx, i) => {
          const src = img(images, idx)
          if (!src) return null
          return (
            <div
              key={i}
              className="relative aspect-square w-full overflow-hidden"
              style={{ borderRadius: `calc(${theme.radius} * 1.5)` }}
            >
              <Image src={src} alt={`gallery-${i}`} fill sizes="(max-width:1024px) 50vw, 33vw" className="object-cover transition-transform duration-500 hover:scale-105" />
            </div>
          )
        })}
      </div>
    </Shell>
  )
}

const Steps: React.FC<{
  section: Extract<SpecSection, { kind: 'steps' }>
  theme: ReturnType<typeof getTheme>
  headingFont: string
}> = ({ section, theme, headingFont }) => {
  const c = theme.colors
  const d = useDesign()
  return (
    <Shell theme={theme} decorate>
      <SectionHeading
        title={section.title}
        subtitle={section.subtitle}
        theme={theme}
        headingFont={headingFont}
        center
      />
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {section.items.map((s, i) => (
          <div
            key={i}
            className="relative p-7"
            style={cardStyle(d, theme)}
          >
            <div
              className="mb-4 flex h-10 w-10 items-center justify-center rounded-full text-sm font-extrabold"
              style={{ background: c.primary, color: c.primaryForeground }}
            >
              {i + 1}
            </div>
            <h3 className="font-bold" style={{ fontFamily: headingFont, color: c.cardForeground }}>
              {s.title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed" style={{ color: c.mutedForeground }}>
              {s.body}
            </p>
          </div>
        ))}
      </div>
    </Shell>
  )
}

const Faq: React.FC<{
  section: Extract<SpecSection, { kind: 'faq' }>
  theme: ReturnType<typeof getTheme>
  headingFont: string
}> = ({ section, theme, headingFont }) => {
  const c = theme.colors
  const d = useDesign()
  return (
    <Shell theme={theme} muted>
      <SectionHeading title={section.title} theme={theme} headingFont={headingFont} center />
      <div className="mx-auto max-w-3xl space-y-4">
        {section.items.map((f, i) => (
          <details
            key={i}
            className="group p-5"
            style={cardStyle(d, theme)}
          >
            <summary
              className="cursor-pointer list-none text-base font-semibold"
              style={{ fontFamily: headingFont, color: c.cardForeground }}
            >
              {f.q}
            </summary>
            <p className="mt-3 text-sm leading-relaxed" style={{ color: c.mutedForeground }}>
              {f.a}
            </p>
          </details>
        ))}
      </div>
    </Shell>
  )
}

const RichText: React.FC<{
  section: Extract<SpecSection, { kind: 'richtext' }>
  theme: ReturnType<typeof getTheme>
  headingFont: string
}> = ({ section, theme, headingFont }) => {
  const c = theme.colors
  return (
    <Shell theme={theme}>
      <div className="mx-auto max-w-3xl">
        {section.title ? (
          <h2
            className="mb-6 text-3xl font-bold tracking-tight sm:text-4xl"
            style={{ fontFamily: headingFont, color: c.foreground }}
          >
            {section.title}
          </h2>
        ) : null}
        <div className="space-y-5">
          {section.paragraphs.map((p, i) => (
            <p key={i} className="text-lg leading-relaxed" style={{ color: c.mutedForeground }}>
              {p}
            </p>
          ))}
        </div>
      </div>
    </Shell>
  )
}

const CtaBand: React.FC<{
  section: Extract<SpecSection, { kind: 'cta' }>
  theme: ReturnType<typeof getTheme>
  headingFont: string
  onCta: (e: React.MouseEvent, url: string) => void
}> = ({ section, theme, headingFont, onCta }) => {
  const c = theme.colors
  const d = useDesign()
  return (
    <section className={`w-full px-5 ${sectionPadClass(d)}`}>
      <div
        className="mx-auto max-w-5xl overflow-hidden rounded-3xl px-8 py-16 text-center"
        style={{
          background: `linear-gradient(135deg, ${c.primary} 0%, ${c.accent} 130%)`,
          borderRadius: `calc(${theme.radius} * 2.5)`,
        }}
      >
        <h2
          className="text-3xl font-extrabold tracking-tight sm:text-4xl"
          style={{ fontFamily: headingFont, color: c.primaryForeground }}
        >
          {section.heading}
        </h2>
        {section.body ? (
          <p
            className="mx-auto mt-4 max-w-2xl text-lg"
            style={{ color: `color-mix(in oklab, ${c.primaryForeground} 88%, transparent)` }}
          >
            {section.body}
          </p>
        ) : null}
        <a
          href={section.cta.url || '#'}
          onClick={(e) => onCta(e, section.cta.url)}
          className="mt-8 inline-block bg-white px-8 py-3.5 text-sm font-bold shadow-xl transition-transform hover:scale-[1.05]"
          style={{ color: c.primary, borderRadius: btnRadius(d, theme) }}
        >
          {section.cta.label}
        </a>
      </div>
    </section>
  )
}

const Contact: React.FC<{
  section: Extract<SpecSection, { kind: 'contact' }>
  theme: ReturnType<typeof getTheme>
  headingFont: string
}> = ({ section, theme, headingFont }) => {
  const c = theme.colors
  const rows: { icon: string; label: string; value?: string; href?: string }[] = [
    { icon: 'email', label: 'Email', value: section.email, href: section.email ? `mailto:${section.email}` : undefined },
    { icon: 'phone', label: 'Phone', value: section.phone, href: section.phone ? `tel:${section.phone}` : undefined },
    { icon: 'location', label: 'Address', value: section.address },
    { icon: 'clock', label: 'Hours', value: section.hours },
  ].filter((r) => r.value)
  const d = useDesign()

  return (
    <Shell theme={theme}>
      <SectionHeading
        title={section.title}
        subtitle={section.body}
        theme={theme}
        headingFont={headingFont}
      />
      <div className="grid gap-5 sm:grid-cols-2">
        {rows.map((r, i) => (
          <div
            key={i}
            className="flex items-start gap-4 p-6"
            style={cardStyle(d, theme)}
          >
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
              style={{ background: `color-mix(in oklab, ${c.primary} 14%, transparent)`, color: c.primary }}
            >
              <SpecIcon name={r.icon} className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: c.mutedForeground }}>
                {r.label}
              </div>
              {r.href ? (
                <a href={r.href} className="font-semibold" style={{ color: c.foreground }}>
                  {r.value}
                </a>
              ) : (
                <div className="font-semibold" style={{ color: c.foreground }}>
                  {r.value}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </Shell>
  )
}

/* -------------------------------------------------------------------------- */
/* Footer                                                                       */
/* -------------------------------------------------------------------------- */

const Footer: React.FC<{
  spec: SiteSpec
  theme: ReturnType<typeof getTheme>
  onNav: (path: string) => void
  headingFont: string
}> = ({ spec, theme, onNav, headingFont }) => {
  const c = theme.colors
  const d = useDesign()
  return (
    <footer style={{ background: c.card, borderTop: `1px solid ${c.border}` }}>
      <div className={`mx-auto flex ${containerClass(d)} flex-col items-start justify-between gap-6 px-5 py-12 sm:flex-row sm:items-center`}>
        <div>
          <div className="text-lg font-extrabold tracking-tight" style={{ fontFamily: headingFont, color: c.foreground }}>
            {spec.siteName}
          </div>
          {spec.tagline ? (
            <div className="mt-1 text-sm" style={{ color: c.mutedForeground }}>
              {spec.tagline}
            </div>
          ) : null}
        </div>
        <nav className="flex flex-wrap gap-4">
          {spec.pages.map((p) => (
            <button
              key={p.path || 'home'}
              onClick={() => onNav(p.path)}
              className="text-sm font-medium transition-colors hover:opacity-100"
              style={{ color: c.mutedForeground }}
            >
              {p.navLabel}
            </button>
          ))}
        </nav>
      </div>
      <div className="px-5 pb-8 text-center text-xs" style={{ color: c.mutedForeground }}>
        © {new Date().getFullYear()} {spec.siteName}. All rights reserved.
      </div>
    </footer>
  )
}

export default SiteRenderer
