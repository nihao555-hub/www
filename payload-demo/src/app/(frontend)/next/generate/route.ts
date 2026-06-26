import type { File as PayloadFile } from 'payload'

import config from '@payload-config'
import { headers as getHeaders } from 'next/headers'
import { getPayload } from 'payload'

import { runGeneration, type GenEvent, type MerchantInput } from '@/lib/ai/generate'
import { isRelayConfigured } from '@/lib/ai/relay'
import { specToPageData } from '@/lib/ai/to-payload'

export const maxDuration = 300

const MAX_IMAGES = 6

export async function POST(req: Request): Promise<Response> {
  if (!isRelayConfigured()) {
    return Response.json(
      {
        error:
          'AI relay not configured. Set OPENAI_COMPAT_BASE_URL and OPENAI_COMPAT_API_KEY in the environment.',
      },
      { status: 503 },
    )
  }

  const payload = await getPayload({ config })

  // Only authenticated admin users may generate sites.
  const { user } = await payload.auth({ headers: await getHeaders() })
  if (!user) {
    return Response.json(
      { error: 'Unauthorized. Please log into the admin panel first.' },
      { status: 401 },
    )
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return Response.json({ error: 'Expected multipart/form-data.' }, { status: 400 })
  }

  const merchant: MerchantInput = {
    name: String(form.get('name') ?? '').trim(),
    industry: String(form.get('industry') ?? '').trim() || undefined,
    description: String(form.get('description') ?? '').trim() || undefined,
    language: String(form.get('language') ?? '').trim() || undefined,
    themeId: String(form.get('themeId') ?? '').trim() || undefined,
  }

  const files = form.getAll('images').filter((f): f is File => f instanceof File && f.size > 0)
  if (files.length === 0) {
    return Response.json({ error: 'At least one product image is required.' }, { status: 400 })
  }
  if (files.length > MAX_IMAGES) {
    return Response.json({ error: `At most ${MAX_IMAGES} images are allowed.` }, { status: 400 })
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        )
      }
      const emit = (ev: GenEvent) => send(ev.type, ev)

      try {
        // 1) Upload images to the media library + build vision data URLs.
        send('step', { type: 'step', key: 'upload', label: 'Uploading images', status: 'active' })
        const mediaIds: number[] = []
        const imageDataUrls: string[] = []

        for (const file of files) {
          const buffer = Buffer.from(await file.arrayBuffer())
          const mimetype = file.type || 'image/png'

          const payloadFile: PayloadFile = {
            name: file.name || `upload-${Date.now()}.png`,
            data: buffer,
            mimetype,
            size: buffer.byteLength,
          }

          const mediaDoc = await payload.create({
            collection: 'media',
            data: { alt: `${merchant.name || 'Product'} image` },
            file: payloadFile,
          })

          mediaIds.push(mediaDoc.id)
          imageDataUrls.push(`data:${mimetype};base64,${buffer.toString('base64')}`)
        }
        send('step', { type: 'step', key: 'upload', label: 'Uploading images', status: 'done' })

        // 2) Run the AI design pipeline, streaming progress to the client.
        const spec = await runGeneration(merchant, imageDataUrls, emit, req.signal)

        // 3) Persist the generated page.
        const pageData = specToPageData(spec, mediaIds)
        const page = await payload.create({ collection: 'pages', data: pageData })

        const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || ''
        send('done', {
          success: true,
          pageId: page.id,
          slug: page.slug,
          siteName: spec.siteName,
          themeId: spec.themeId,
          previewUrl: `${serverUrl}/${page.slug}`,
          adminUrl: `${serverUrl}/admin/collections/pages/${page.id}`,
          sections: spec.sections.length,
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        payload.logger.error({ err, msg: 'AI site generation failed' })
        send('error', { message })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
