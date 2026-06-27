/**
 * Image generation helper for the grsai "gpt-image-2" draw API.
 *
 * The same relay key used for chat completions also authorizes image draws.
 * The draw endpoint (`POST {BASE}/draw/completions`) can answer two ways:
 *   1. Streaming (Server-Sent-Events-ish): a sequence of JSON status frames
 *      ending in `status: "succeeded"` carrying the final image url(s). This is
 *      the primary path.
 *   2. Webhook/async: when a `webHook` is supplied, the call returns a task id
 *      immediately and the result is fetched later. We use the documented
 *      `webHook: "-1"` convention (no real callback) and then poll
 *      `POST {BASE}/draw/result` with the task id until it settles. This is the
 *      fallback used when streaming fails.
 *
 * Both shapes share the same response schema:
 *   { id, status: 'running'|'violation'|'succeeded'|'failed', results:[{url}],
 *     progress: 0-100, error }
 */

export type ImageGenConfig = {
  baseUrl: string
  apiKey: string
  model: string
}

/** Resolve image-gen config, falling back to the chat relay key/host. */
export function getImageGenConfig(): ImageGenConfig | null {
  const apiKey = process.env.GPT_IMAGE_API_KEY || process.env.OPENAI_COMPAT_API_KEY
  if (!apiKey) return null
  const baseUrl = (
    process.env.GPT_IMAGE_BASE_URL ||
    process.env.OPENAI_COMPAT_BASE_URL ||
    'https://grsaiapi.com/v1'
  ).replace(/\/$/, '')
  const model = process.env.GPT_IMAGE_MODEL || 'gpt-image-2'
  return { baseUrl, apiKey, model }
}

export function isImageGenConfigured(): boolean {
  return Boolean(process.env.GPT_IMAGE_API_KEY || process.env.OPENAI_COMPAT_API_KEY)
}

type DrawFrame = {
  id?: string
  status?: 'running' | 'violation' | 'succeeded' | 'failed' | string
  results?: { url?: string }[]
  progress?: number
  error?: string
}

export type GenerateImageOptions = {
  prompt: string
  /** e.g. "1024x1024", "1536x1024", "16:9". Defaults to "1024x1024". */
  aspectRatio?: string
  /** Reference image urls/base64 to condition the generation on. */
  refImages?: string[]
  signal?: AbortSignal
  onProgress?: (progress: number) => void
}

function firstUrl(frame: DrawFrame): string | undefined {
  return frame.results?.find((r) => r?.url)?.url
}

function isTerminalError(frame: DrawFrame): boolean {
  return frame.status === 'failed' || frame.status === 'violation'
}

/**
 * Generate a single image and return its hosted URL. Tries streaming first and
 * falls back to async webhook polling. Throws if both paths fail.
 */
export async function generateImage(opts: GenerateImageOptions): Promise<string> {
  const cfg = getImageGenConfig()
  if (!cfg) throw new Error('gpt-image not configured (set OPENAI_COMPAT_API_KEY)')

  // Primary path: stream status frames. The relay often stalls the stream at a
  // low progress and finishes the job asynchronously, so streamGenerate returns
  // the task id even when it never sees a final url.
  let taskId: string | undefined
  try {
    const { url, id } = await streamGenerate(cfg, opts)
    if (url) return url
    taskId = id
  } catch (err) {
    if (opts.signal?.aborted) throw err
    if (err instanceof StreamStalled) taskId = err.id
  }

  // The job is running server-side; poll its result by id (generous budget,
  // image draws routinely take 3-4 minutes on this relay).
  if (taskId) {
    const url = await pollResultById(cfg, taskId, opts)
    if (url) return url
  }

  // Last resort: submit a fresh job via the documented webHook="-1" + poll path.
  return await pollGenerate(cfg, opts)
}

/** Carries the task id when a stream stalls so we can poll it instead of resubmitting. */
class StreamStalled extends Error {
  id?: string
  constructor(id?: string) {
    super('image stream stalled without a result')
    this.id = id
  }
}

/** Primary path: stream status frames from /draw/completions. */
async function streamGenerate(
  cfg: ImageGenConfig,
  opts: GenerateImageOptions,
): Promise<{ url?: string; id?: string }> {
  const res = await fetch(`${cfg.baseUrl}/draw/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      prompt: opts.prompt,
      aspectRatio: opts.aspectRatio || '1024x1024',
      urls: opts.refImages?.length ? opts.refImages : undefined,
      shutProgress: false,
    }),
    signal: opts.signal,
  })

  if (!res.ok || !res.body) {
    throw new Error(`draw/completions stream failed: HTTP ${res.status}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let last: DrawFrame = {}
  let lastId: string | undefined

  const handleFrame = (frame: DrawFrame): string | undefined => {
    last = frame
    if (frame.id) lastId = frame.id
    if (typeof frame.progress === 'number') opts.onProgress?.(frame.progress)
    if (frame.status === 'succeeded') {
      const url = firstUrl(frame)
      if (url) return url
    }
    if (isTerminalError(frame)) {
      throw new Error(`image generation ${frame.status}: ${frame.error || 'unknown'}`)
    }
    return undefined
  }

  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      const payload = trimmed.startsWith('data:') ? trimmed.slice(5).trim() : trimmed
      if (!payload || payload === '[DONE]') continue
      let frame: DrawFrame
      try {
        frame = JSON.parse(payload) as DrawFrame
      } catch {
        continue
      }
      const url = handleFrame(frame)
      if (url) return { url, id: lastId }
    }
  }

  // Flush any trailing buffered frame.
  const tail = buffer.trim()
  if (tail) {
    const payload = tail.startsWith('data:') ? tail.slice(5).trim() : tail
    try {
      const url = handleFrame(JSON.parse(payload) as DrawFrame)
      if (url) return { url, id: lastId }
    } catch {
      /* ignore */
    }
  }

  const url = firstUrl(last)
  if (url) return { url, id: lastId }
  // Stream ended without a final url; the job is usually still running
  // server-side, so surface the id for the caller to poll.
  throw new StreamStalled(lastId)
}

/** Poll /draw/result for an already-submitted task id until it settles. */
async function pollResultById(
  cfg: ImageGenConfig,
  id: string,
  opts: GenerateImageOptions,
): Promise<string | undefined> {
  const deadline = Date.now() + 360_000 // 6 min budget; draws take 3-4 min
  while (Date.now() < deadline) {
    if (opts.signal?.aborted) throw new Error('aborted')
    await sleep(3000, opts.signal)
    const poll = await fetch(`${cfg.baseUrl}/draw/result`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({ id }),
      signal: opts.signal,
    })
    if (!poll.ok) continue
    let body: { data?: DrawFrame } & DrawFrame
    try {
      body = (await poll.json()) as { data?: DrawFrame } & DrawFrame
    } catch {
      continue
    }
    // /draw/result wraps the frame in { code, data, msg }.
    const frame: DrawFrame = body.data ?? body
    if (typeof frame.progress === 'number') opts.onProgress?.(frame.progress)
    if (frame.status === 'succeeded') {
      const url = firstUrl(frame)
      if (url) return url
    }
    if (isTerminalError(frame)) {
      throw new Error(`image generation ${frame.status}: ${frame.error || 'unknown'}`)
    }
  }
  return undefined
}

/** Fallback path: submit with webHook="-1", then poll /draw/result by id. */
async function pollGenerate(cfg: ImageGenConfig, opts: GenerateImageOptions): Promise<string> {
  const submit = await fetch(`${cfg.baseUrl}/draw/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      prompt: opts.prompt,
      aspectRatio: opts.aspectRatio || '1024x1024',
      urls: opts.refImages?.length ? opts.refImages : undefined,
      webHook: '-1',
      shutProgress: true,
    }),
    signal: opts.signal,
  })

  const submitText = await submit.text()
  if (!submit.ok) {
    throw new Error(`draw/completions submit failed: HTTP ${submit.status} ${submitText.slice(0, 200)}`)
  }
  let submitted: DrawFrame
  try {
    const body = JSON.parse(submitText) as { data?: DrawFrame } & DrawFrame
    submitted = body.data ?? body
  } catch {
    throw new Error('draw/completions submit returned non-JSON')
  }
  // The submit response may already carry the result (fast generations).
  if (submitted.status === 'succeeded') {
    const url = firstUrl(submitted)
    if (url) return url
  }
  if (isTerminalError(submitted)) {
    throw new Error(`image generation ${submitted.status}: ${submitted.error || 'unknown'}`)
  }
  const id = submitted.id
  if (!id) throw new Error('draw/completions submit returned no task id')

  const deadline = Date.now() + 360_000 // 6 min budget; draws take 3-4 min
  while (Date.now() < deadline) {
    if (opts.signal?.aborted) throw new Error('aborted')
    await sleep(2500, opts.signal)

    const poll = await fetch(`${cfg.baseUrl}/draw/result`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({ id }),
      signal: opts.signal,
    })
    if (!poll.ok) continue
    let frame: DrawFrame
    try {
      const body = (await poll.json()) as { data?: DrawFrame } & DrawFrame
      frame = body.data ?? body
    } catch {
      continue
    }
    if (typeof frame.progress === 'number') opts.onProgress?.(frame.progress)
    if (frame.status === 'succeeded') {
      const url = firstUrl(frame)
      if (url) return url
    }
    if (isTerminalError(frame)) {
      throw new Error(`image generation ${frame.status}: ${frame.error || 'unknown'}`)
    }
  }
  throw new Error('image generation timed out')
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('aborted'))
    const t = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t)
        reject(new Error('aborted'))
      },
      { once: true },
    )
  })
}

/**
 * Fetch a generated image URL and return it as a data URL so it can be stored
 * in Payload media (and reused as a vision reference) without depending on the
 * remote host staying up.
 */
export async function imageUrlToDataUrl(url: string, signal?: AbortSignal): Promise<string> {
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`failed to download generated image: HTTP ${res.status}`)
  const contentType = res.headers.get('content-type') || 'image/png'
  const buf = Buffer.from(await res.arrayBuffer())
  return `data:${contentType};base64,${buf.toString('base64')}`
}
