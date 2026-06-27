import type { File as PayloadFile } from 'payload'

import config from '@payload-config'
import { headers as getHeaders } from 'next/headers'
import { getPayload } from 'payload'

import {
  runGeneration,
  runTemplateGeneration,
  type GenEvent,
  type MerchantInput,
} from '@/lib/ai/generate'
import { isRelayConfigured } from '@/lib/ai/relay'

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

  const mode = String(form.get('mode') ?? '').trim() === 'template' ? 'template' : 'creative'
  const merchant: MerchantInput = {
    name: String(form.get('name') ?? '').trim(),
    industry: String(form.get('industry') ?? '').trim() || undefined,
    description: String(form.get('description') ?? '').trim() || undefined,
    brief: String(form.get('brief') ?? '').trim() || undefined,
    language: String(form.get('language') ?? '').trim() || undefined,
    themeId: String(form.get('themeId') ?? '').trim() || undefined,
    mode,
    landingTemplateId: String(form.get('landingTemplateId') ?? '').trim() || undefined,
  }

  const files = form.getAll('images').filter((f): f is File => f instanceof File && f.size > 0)
  // Creative mode needs at least one product image to design from; template mode
  // can fill image slots with gpt-image-2, so uploads are optional there.
  if (mode !== 'template' && files.length === 0) {
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
        const run = merchant.mode === 'template' ? runTemplateGeneration : runGeneration
        const { spec, generatedImages } = await run(merchant, imageDataUrls, emit, req.signal)

        // 2b) Store any AI-generated images in the media library, preserving the
        // order the pipeline appended them (uploaded images first, then
        // generated) so the spec's imageIndex values stay valid.
        for (const gen of generatedImages) {
          const match = /^data:([^;]+);base64,(.+)$/.exec(gen.dataUrl)
          if (!match) continue
          const mimetype = match[1] || 'image/png'
          const buffer = Buffer.from(match[2], 'base64')
          const ext = mimetype.split('/')[1] || 'png'
          const mediaDoc = await payload.create({
            collection: 'media',
            data: { alt: gen.alt || `${merchant.name || 'Generated'} image` },
            file: {
              name: `ai-${gen.purpose}-${Date.now()}-${mediaIds.length}.${ext}`,
              data: buffer,
              mimetype,
              size: buffer.byteLength,
            },
          })
          mediaIds.push(mediaDoc.id)
        }

        // 3) Persist the generated multi-page site.
        const site = await payload.create({
          collection: 'ai-sites',
          data: {
            siteName: spec.siteName,
            slug: spec.slug,
            themeId: spec.themeId,
            images: mediaIds.map((id) => ({ image: id })),
            spec,
          },
        })

        const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || ''
        const pageCount = spec.pages.length
        const sectionCount = spec.pages.reduce((n, p) => n + p.sections.length, 0)
        send('done', {
          success: true,
          pageId: site.id,
          slug: site.slug,
          siteName: spec.siteName,
          themeId: spec.themeId,
          previewUrl: `${serverUrl}/s/${site.slug}`,
          adminUrl: `${serverUrl}/admin/collections/ai-sites/${site.id}`,
          pages: pageCount,
          sections: sectionCount,
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
