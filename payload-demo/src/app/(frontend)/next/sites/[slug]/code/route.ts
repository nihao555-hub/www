import configPromise from '@payload-config'
import { getPayload } from 'payload'

import { buildSiteCodeBundle } from '@/lib/ai/export-code'
import { normalizeSiteSpec } from '@/lib/ai/site-spec'

type Args = { params: Promise<{ slug: string }> }

export async function GET(req: Request, { params }: Args): Promise<Response> {
  const { slug } = await params
  const decoded = decodeURIComponent(slug)
  const payload = await getPayload({ config: configPromise })
  const result = await payload.find({
    collection: 'ai-sites',
    where: { slug: { equals: decoded } },
    depth: 0,
    limit: 1,
    pagination: false,
    overrideAccess: true,
  })
  const doc = result.docs[0]
  if (!doc) return Response.json({ error: 'Site not found' }, { status: 404 })

  const spec = normalizeSiteSpec(doc.spec, doc.siteName)
  const code = buildSiteCodeBundle(spec)

  const url = new URL(req.url)
  const filename = `${spec.slug || 'site'}.tsx`
  if (url.searchParams.get('download') === '1') {
    return new Response(code, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  }
  return Response.json({ code, filename, siteName: spec.siteName })
}
