import {
  BASE_URL,
  MAX_RESULT_BYTES,
  TRANSFORM_SERVICE_TOKEN,
  UPSTREAM_TIMEOUT_MS,
} from './config.js'

export class TransformError extends Error {
  constructor(code, message, { retryable = false, retryAfterMs = null, status = null } = {}) {
    super(message)
    this.code = code
    this.retryable = retryable
    this.retryAfterMs = retryAfterMs
    this.status = status
  }
}

// Sends one clip to the transform service and resolves with the grayscale MP4 as a Buffer.
// Throws TransformError with `retryable` set for transient failures.
export async function transformClip(buffer, filename) {
  const form = new FormData()
  form.append('clip', new Blob([buffer], { type: 'video/mp4' }), filename)

  let res
  try {
    res = await fetch(`${BASE_URL}/api/transform`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TRANSFORM_SERVICE_TOKEN}` },
      body: form,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    })
  } catch (err) {
    if (err.name === 'TimeoutError') {
      throw new TransformError('UPSTREAM_TIMEOUT', 'The transform service took too long to respond.', { retryable: true })
    }
    throw new TransformError('UPSTREAM_UNREACHABLE', 'Could not reach the transform service.', { retryable: true })
  }

  if (!res.ok) throw await errorFromResponse(res)

  const contentType = res.headers.get('content-type') || ''
  if (!contentType.startsWith('video/mp4')) {
    await res.body?.cancel()
    throw new TransformError('INVALID_UPSTREAM_RESPONSE', `Transform service returned unexpected content type "${contentType}".`)
  }

  const declaredLength = Number(res.headers.get('content-length'))
  if (declaredLength > MAX_RESULT_BYTES) {
    await res.body?.cancel()
    throw new TransformError('INVALID_UPSTREAM_RESPONSE', 'Transformed video exceeds the 4 MB output limit.')
  }

  const result = Buffer.from(await res.arrayBuffer())
  if (result.length === 0 || result.length > MAX_RESULT_BYTES) {
    throw new TransformError('INVALID_UPSTREAM_RESPONSE', 'Transform service returned an empty or oversized video.')
  }
  return result
}

async function errorFromResponse(res) {
  let body = {}
  try {
    body = await res.json()
  } catch {
    // Non-JSON error body; fall back to status-based messages below.
  }
  const upstreamCode = body.code || `HTTP_${res.status}`
  const upstreamMessage = body.error || res.statusText || 'Transform failed.'

  if (res.status === 401 || res.status === 403) {
    // Details stay in server logs; the client only gets a generic message.
    console.error(`[transform] auth failed (${res.status} ${upstreamCode}): ${upstreamMessage}`)
    return new TransformError('UPSTREAM_AUTH_FAILED', 'Transform service authentication failed.', { status: res.status })
  }
  if (res.status === 429) {
    return new TransformError('UPSTREAM_RATE_LIMITED', 'Transform service is busy. Retrying…', {
      retryable: true,
      retryAfterMs: parseRetryAfter(res.headers.get('retry-after')),
      status: res.status,
    })
  }
  if (res.status >= 500) {
    return new TransformError(upstreamCode, upstreamMessage, { retryable: true, status: res.status })
  }
  // Other 4xx: the clip itself was rejected (too long, too many frames, bad codec, …).
  return new TransformError(upstreamCode, upstreamMessage, { status: res.status })
}

function parseRetryAfter(value) {
  if (!value) return null
  const seconds = Number(value)
  if (Number.isFinite(seconds)) return seconds * 1000
  const date = Date.parse(value)
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now())
}
