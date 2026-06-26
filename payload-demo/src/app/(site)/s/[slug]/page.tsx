import type { Metadata } from 'next'

import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { notFound } from 'next/navigation'
import React, { cache } from 'react'

import { SiteRenderer } from '@/components/AiSite/SiteRenderer'
import { getTheme } from '@/lib/ai/themes'
import { normalizeSiteSpec, type SiteSpec } from '@/lib/ai/site-spec'
import { getMediaUrl } from '@/utilities/getMediaUrl'

type Args = {
  params: Promise<{ slug: string }>
}

const querySiteBySlug = cache(async (slug: string) => {
  const payload = await getPayload({ config: configPromise })
  const result = await payload.find({
    collection: 'ai-sites',
    where: { slug: { equals: slug } },
    depth: 2,
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })
  return result.docs[0] || null
})

function imageUrls(doc: { images?: unknown }): string[] {
  const images = Array.isArray(doc.images) ? doc.images : []
  const urls: string[] = []
  for (const row of images) {
    const image = (row as { image?: unknown })?.image
    const url = image && typeof image === 'object' ? (image as { url?: string }).url : undefined
    if (url) urls.push(getMediaUrl(url))
  }
  return urls
}

function googleFontsHref(spec: SiteSpec): string {
  const theme = getTheme(spec.themeId)
  const families = Array.from(new Set([theme.fonts.heading, theme.fonts.body]))
  const params = families
    .map((f) => `family=${encodeURIComponent(f)}:wght@400;500;600;700;800`)
    .join('&')
  return `https://fonts.googleapis.com/css2?${params}&display=swap`
}

export async function generateMetadata({ params }: Args): Promise<Metadata> {
  const { slug } = await params
  const doc = await querySiteBySlug(decodeURIComponent(slug))
  if (!doc) return { title: 'Site not found' }
  const spec = normalizeSiteSpec(doc.spec, doc.siteName)
  return {
    title: spec.meta.title,
    description: spec.meta.description,
  }
}

export default async function GeneratedSitePage({ params }: Args) {
  const { slug } = await params
  const doc = await querySiteBySlug(decodeURIComponent(slug))
  if (!doc) notFound()

  const spec = normalizeSiteSpec(doc.spec, doc.siteName)
  const images = imageUrls(doc)

  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="stylesheet" href={googleFontsHref(spec)} />
      <SiteRenderer spec={spec} images={images} />
    </>
  )
}
