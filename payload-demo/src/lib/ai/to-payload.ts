import type { Page } from '@/payload-types'

import type { SiteSpec, SpecCta } from './site-spec'

/**
 * Minimal Lexical (richText) node builders. The Payload Lexical editor stores a
 * serialized editor state; these helpers produce the subset of nodes we need
 * (headings + paragraphs) in the exact shape the editor expects.
 */

type LexicalText = {
  type: 'text'
  detail: number
  format: number
  mode: 'normal'
  style: string
  text: string
  version: number
}

type LexicalHeading = {
  type: 'heading'
  tag: 'h1' | 'h2' | 'h3' | 'h4'
  children: LexicalText[]
  direction: 'ltr'
  format: ''
  indent: number
  version: number
}

type LexicalParagraph = {
  type: 'paragraph'
  children: LexicalText[]
  direction: 'ltr'
  format: ''
  indent: number
  textFormat: number
  version: number
}

type LexicalRoot = {
  root: {
    type: 'root'
    children: (LexicalHeading | LexicalParagraph)[]
    direction: 'ltr'
    format: ''
    indent: number
    version: number
  }
}

function textNode(text: string): LexicalText {
  return { type: 'text', detail: 0, format: 0, mode: 'normal', style: '', text, version: 1 }
}

function heading(text: string, tag: LexicalHeading['tag']): LexicalHeading {
  return {
    type: 'heading',
    tag,
    children: [textNode(text)],
    direction: 'ltr',
    format: '',
    indent: 0,
    version: 1,
  }
}

function paragraph(text: string): LexicalParagraph {
  return {
    type: 'paragraph',
    children: [textNode(text)],
    direction: 'ltr',
    format: '',
    indent: 0,
    textFormat: 0,
    version: 1,
  }
}

function richText(nodes: (LexicalHeading | LexicalParagraph)[]): LexicalRoot {
  return {
    root: {
      type: 'root',
      children: nodes,
      direction: 'ltr',
      format: '',
      indent: 0,
      version: 1,
    },
  }
}

function ctaLink(cta: SpecCta, appearance: 'default' | 'outline') {
  return {
    link: {
      type: 'custom' as const,
      appearance,
      label: cta.label,
      url: cta.url || '#',
      newTab: /^https?:\/\//.test(cta.url),
    },
  }
}

type PageData = Omit<Page, 'id' | 'createdAt' | 'updatedAt' | 'sizes'>

/**
 * Converts a normalized SiteSpec into the data payload for creating a Page.
 *
 * @param spec       The AI-designed site spec.
 * @param mediaIds   Payload Media document IDs, in the same order as the images
 *                   the merchant uploaded. `imageIndex` values in the spec index
 *                   into this array.
 */
export function specToPageData(spec: SiteSpec, mediaIds: number[]): PageData {
  const pickImage = (index?: number): number | undefined => {
    if (mediaIds.length === 0) return undefined
    const i = typeof index === 'number' && index >= 0 && index < mediaIds.length ? index : 0
    return mediaIds[i]
  }

  const heroImpact = mediaIds.length === 0 ? 'lowImpact' : spec.hero.impact
  const heroNodes: (LexicalHeading | LexicalParagraph)[] = [heading(spec.hero.headline, 'h1')]
  if (spec.hero.subheadline) heroNodes.push(paragraph(spec.hero.subheadline))

  const heroMedia = heroImpact === 'lowImpact' ? undefined : pickImage(spec.hero.imageIndex)

  const layout: PageData['layout'] = []

  for (const section of spec.sections) {
    if (section.kind === 'content') {
      layout.push({
        blockType: 'content',
        columns: section.columns.map((col) => {
          const nodes: (LexicalHeading | LexicalParagraph)[] = []
          if (col.heading) nodes.push(heading(col.heading, 'h3'))
          if (col.body) nodes.push(paragraph(col.body))
          return {
            size: col.size,
            richText: richText(nodes),
            enableLink: false,
          }
        }),
      })
    } else if (section.kind === 'media') {
      const media = pickImage(section.imageIndex)
      if (media !== undefined) {
        layout.push({ blockType: 'mediaBlock', media })
      }
    } else if (section.kind === 'cta') {
      const nodes: (LexicalHeading | LexicalParagraph)[] = [heading(section.heading, 'h2')]
      if (section.body) nodes.push(paragraph(section.body))
      layout.push({
        blockType: 'cta',
        richText: richText(nodes),
        links: [ctaLink(section.cta, 'default')],
      })
    }
  }

  return {
    title: spec.siteName,
    slug: spec.slug,
    theme: spec.themeId,
    _status: 'published',
    publishedAt: new Date().toISOString(),
    hero: {
      type: heroImpact,
      richText: richText(heroNodes),
      links: (spec.hero.ctas ?? []).map((cta, i) =>
        ctaLink(cta, i === 0 ? 'default' : 'outline'),
      ),
      ...(heroMedia !== undefined ? { media: heroMedia } : {}),
    },
    layout,
    meta: {
      title: spec.meta.title,
      description: spec.meta.description,
      ...(heroMedia !== undefined ? { image: heroMedia } : {}),
    },
  } as PageData
}
