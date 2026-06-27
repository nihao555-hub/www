import { describe, it, expect } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { compileJsx } from '@/lib/ai/jsx-sandbox'
import {
  LANDING_TEMPLATES,
  buildTemplateSpec,
  defaultImageMap,
} from '@/lib/ai/site-templates'
import { getTheme } from '@/lib/ai/themes'
import { normalizeSiteSpec } from '@/lib/ai/site-spec'

const IMAGES = [
  'https://example.com/0.jpg',
  'https://example.com/1.jpg',
  'https://example.com/2.jpg',
  'https://example.com/3.jpg',
]

describe('landing templates', () => {
  it('exposes a non-empty catalog with unique ids', () => {
    expect(LANDING_TEMPLATES.length).toBeGreaterThanOrEqual(8)
    const ids = LANDING_TEMPLATES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  for (const template of LANDING_TEMPLATES) {
    it(`compiles + renders "${template.id}" with placeholder content`, () => {
      const theme = getTheme(template.themeId)
      const content = {
        ...template.placeholder,
        _img: defaultImageMap(template, IMAGES.length),
        // exercise every optional block so missing-data guards are covered:
        nav: [{ label: 'Home', href: '#' }],
        logos: ['Acme', 'Globex', 'Initech'],
        stats: [{ value: '99%', label: 'Uptime' }],
        features: {
          title: 'Features',
          subtitle: 'Why us',
          items: [
            { icon: 'Zap', title: 'Fast', body: 'Very fast.' },
            { icon: 'ShieldCheck', title: 'Secure', body: 'Locked down.' },
            { icon: 'Sparkles', title: 'Polished', body: 'Looks great.' },
            { icon: 'Truck', title: 'Free shipping', body: 'On all orders.' },
          ],
        },
        showcase: {
          title: 'Showcase',
          body: 'A closer look.',
          bullets: ['One', 'Two', 'Three'],
          cta: { label: 'Learn more', href: '#' },
        },
        gallery: { title: 'Work', subtitle: 'Selected' },
        testimonials: [{ quote: 'Amazing.', name: 'Jane', role: 'CEO' }],
        faq: [{ q: 'Is it good?', a: 'Yes.' }],
        pricing: [
          { name: 'Pro', price: '$9', period: '/mo', features: ['A', 'B'], highlighted: true },
        ],
        cta: { title: 'Go', body: 'Now.', button: { label: 'Start', href: '#' } },
        footer: { tagline: 'Made with care', copyright: '© 2026' },
      }

      const Comp = compileJsx(template.code, { theme, images: IMAGES, content })
      expect(Comp, `template ${template.id} produced no component`).toBeTruthy()
      const html = renderToStaticMarkup(
        React.createElement(Comp!, { theme, images: IMAGES, content }),
      )
      expect(html.length).toBeGreaterThan(200)
    })
  }

  it('buildTemplateSpec produces a chromeless single-page spec that survives normalize', () => {
    const template = LANDING_TEMPLATES[0]
    const content = { ...template.placeholder, _img: defaultImageMap(template, IMAGES.length) }
    const spec = buildTemplateSpec(template, content)
    expect(spec.chrome).toBe('none')
    expect(spec.templateRef).toBe(template.id)
    expect(spec.pages).toHaveLength(1)
    expect(spec.pages[0].sections[0].kind).toBe('jsx')

    const normalized = normalizeSiteSpec(spec, spec.siteName)
    expect(normalized.chrome).toBe('none')
    expect(normalized.templateRef).toBe(template.id)
    // chromeless home page must NOT get a synthesized hero
    expect(normalized.pages[0].hero).toBeUndefined()
    const sec = normalized.pages[0].sections[0]
    expect(sec.kind).toBe('jsx')
    if (sec.kind === 'jsx') expect(sec.content).toBeTruthy()
  })
})
