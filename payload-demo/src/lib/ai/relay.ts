/**
 * Client for an OpenAI-compatible *chat completions* relay (e.g. grsaiapi).
 *
 * The relay only implements the legacy `/v1/chat/completions` endpoint and does
 * NOT support the Responses API or tool/function calling. It does support
 * vision (base64 image inputs) in chat messages, which is all we need here: we
 * send the merchant's product images + a brief and ask the model to return a
 * structured JSON site spec.
 */

export type RelayConfig = {
  baseUrl: string
  apiKey: string
  model: string
}

export function getRelayConfig(): RelayConfig {
  const baseUrl = process.env.OPENAI_COMPAT_BASE_URL
  const apiKey = process.env.OPENAI_COMPAT_API_KEY
  const model = process.env.OPENAI_COMPAT_MODEL || 'gemini-3-flash'

  if (!baseUrl || !apiKey) {
    throw new Error(
      'Relay not configured. Set OPENAI_COMPAT_BASE_URL and OPENAI_COMPAT_API_KEY in your environment.',
    )
  }

  return { baseUrl, apiKey, model }
}

export function isRelayConfigured(): boolean {
  return Boolean(process.env.OPENAI_COMPAT_BASE_URL && process.env.OPENAI_COMPAT_API_KEY)
}

/** Transient relay failures worth retrying: rate limits, overload, gateway errors. */
function isRetryableStatus(status: number, body: string): boolean {
  if (status === 429 || status === 500 || status === 502 || status === 503 || status === 504 || status === 529) {
    return true
  }
  // grsai returns 400 with this message when the model is temporarily overloaded.
  if (status === 400 && /load is too high|try again later|overloaded|rate.?limit/i.test(body)) {
    return true
  }
  return false
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('aborted'))
    const t = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => { clearTimeout(t); reject(new Error('aborted')) }, { once: true })
  })
}

/** Backoff schedule (ms) between relay attempts; length + 1 = total attempts. */
const RELAY_BACKOFF_MS = [2000, 5000, 10000, 20000, 30000]

type TextPart = { type: 'text'; text: string }
type ImagePart = { type: 'image_url'; image_url: { url: string } }
type ContentPart = TextPart | ImagePart

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string | ContentPart[]
}

/**
 * Calls the relay chat completions endpoint (non-streaming) and returns the raw
 * assistant text.
 */
export async function relayChat(messages: ChatMessage[], signal?: AbortSignal): Promise<string> {
  const { baseUrl, apiKey, model } = getRelayConfig()
  let lastErr: unknown

  for (let attempt = 0; attempt <= RELAY_BACKOFF_MS.length; attempt++) {
    if (signal?.aborted) throw new Error('aborted')
    try {
      const res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          stream: false,
          messages,
          max_tokens: 16000,
        }),
        signal,
      })

      if (!res.ok) {
        const detail = await res.text().catch(() => '')
        if (isRetryableStatus(res.status, detail) && attempt < RELAY_BACKOFF_MS.length) {
          lastErr = new Error(`Relay request failed (${res.status}): ${detail.slice(0, 200)}`)
          await sleep(RELAY_BACKOFF_MS[attempt], signal)
          continue
        }
        throw new Error(`Relay request failed (${res.status}): ${detail.slice(0, 500)}`)
      }

      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>
      }

      const content = data.choices?.[0]?.message?.content
      if (!content) throw new Error('Relay returned an empty response.')
      return content
    } catch (err) {
      if (signal?.aborted) throw err
      // Network-level failure (timeout, reset): retry within budget.
      lastErr = err
      const retryable = !(err instanceof Error) || !err.message.startsWith('Relay request failed')
      if (retryable && attempt < RELAY_BACKOFF_MS.length) {
        await sleep(RELAY_BACKOFF_MS[attempt], signal)
        continue
      }
      throw err
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Relay request failed')
}

/**
 * Calls the relay chat completions endpoint with `stream: true` and invokes
 * `onToken` for each text delta as it arrives. Returns the full concatenated
 * text once the stream completes. Used to surface the design agent's live
 * "thinking" in the generator UI.
 */
export async function relayChatStream(
  messages: ChatMessage[],
  onToken: (delta: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const { baseUrl, apiKey, model } = getRelayConfig()

  let res: Response | undefined
  for (let attempt = 0; attempt <= RELAY_BACKOFF_MS.length; attempt++) {
    if (signal?.aborted) throw new Error('aborted')
    let candidate: Response
    try {
      candidate = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          stream: true,
          messages,
          max_tokens: 16000,
        }),
        signal,
      })
    } catch (err) {
      if (signal?.aborted) throw err
      if (attempt < RELAY_BACKOFF_MS.length) {
        await sleep(RELAY_BACKOFF_MS[attempt], signal)
        continue
      }
      throw err
    }

    if (!candidate.ok || !candidate.body) {
      const detail = await candidate.text().catch(() => '')
      if (isRetryableStatus(candidate.status, detail) && attempt < RELAY_BACKOFF_MS.length) {
        await sleep(RELAY_BACKOFF_MS[attempt], signal)
        continue
      }
      throw new Error(`Relay stream failed (${candidate.status}): ${detail.slice(0, 500)}`)
    }
    res = candidate
    break
  }
  if (!res || !res.body) throw new Error('Relay stream failed: no response')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let full = ''

  // Parse Server-Sent Events: lines beginning with "data: " carry JSON chunks.
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const data = trimmed.slice(5).trim()
      if (!data || data === '[DONE]') continue
      try {
        const json = JSON.parse(data) as {
          choices?: Array<{ delta?: { content?: string } }>
        }
        const delta = json.choices?.[0]?.delta?.content
        if (delta) {
          full += delta
          onToken(delta)
        }
      } catch {
        // Ignore keep-alive / non-JSON lines.
      }
    }
  }

  return full
}

/**
 * Calls the relay and parses the reply as JSON, retrying when the model returns
 * malformed JSON (flaky models occasionally emit broken JSON). On each retry we
 * append a corrective instruction asking for valid JSON only.
 */
export async function relayChatJson(
  messages: ChatMessage[],
  signal?: AbortSignal,
  attempts = 3,
): Promise<unknown> {
  let lastErr: unknown
  for (let attempt = 0; attempt < attempts; attempt++) {
    const msgs: ChatMessage[] =
      attempt === 0
        ? messages
        : [
            ...messages,
            {
              role: 'user',
              content:
                'Your previous reply was not valid JSON. Output ONLY the corrected, complete JSON value: no markdown fences, no commentary, properly quoted keys and strings.',
            },
          ]
    const reply = await relayChat(msgs, signal)
    try {
      return extractJson(reply)
    } catch (err) {
      lastErr = err
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Relay returned unparseable JSON')
}

/**
 * Extracts the first JSON value (object OR array) from a model reply, tolerating
 * markdown code fences and any prose before/after the JSON. Whichever of `{` or
 * `[` appears first determines the structure, so array replies (e.g. an image
 * plan) parse correctly instead of being mangled into invalid JSON.
 */
export function extractJson(text: string): unknown {
  let candidate = text.trim()

  const fenceMatch = candidate.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenceMatch) {
    candidate = fenceMatch[1].trim()
  }

  const objStart = candidate.indexOf('{')
  const arrStart = candidate.indexOf('[')
  const useArray = arrStart !== -1 && (objStart === -1 || arrStart < objStart)

  if (useArray) {
    const end = candidate.lastIndexOf(']')
    if (end > arrStart) {
      candidate = candidate.slice(arrStart, end + 1)
    }
  } else if (objStart !== -1) {
    const end = candidate.lastIndexOf('}')
    if (end > objStart) {
      candidate = candidate.slice(objStart, end + 1)
    }
  }

  return JSON.parse(candidate)
}
