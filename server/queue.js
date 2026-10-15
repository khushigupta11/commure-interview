import { MAX_ATTEMPTS, MAX_CONCURRENCY, MIN_START_INTERVAL_MS } from './config.js'
import { getJob, updateJob } from './store.js'
import { TransformError, transformClip } from './transformClient.js'

// In-process queue that keeps upstream calls within the service's limits:
// at most MAX_CONCURRENCY in flight and at least MIN_START_INTERVAL_MS between starts.
const waiting = []
let inFlight = 0
let lastStartAt = 0
let timer = null

export function enqueue(jobId) {
  waiting.push(jobId)
  pump()
}

function pump() {
  if (timer) return
  while (inFlight < MAX_CONCURRENCY && waiting.length > 0) {
    const wait = lastStartAt + MIN_START_INTERVAL_MS - Date.now()
    if (wait > 0) {
      timer = setTimeout(() => {
        timer = null
        pump()
      }, wait)
      return
    }
    lastStartAt = Date.now()
    inFlight++
    runAttempt(waiting.shift()).finally(() => {
      inFlight--
      pump()
    })
  }
}

async function runAttempt(jobId) {
  const job = getJob(jobId)
  if (!job) return // deleted or evicted while waiting

  const attempts = job.attempts + 1
  updateJob(jobId, {
    status: 'processing',
    attempts,
    startedAt: job.startedAt ?? new Date().toISOString(),
  })
  console.log(`[queue] job ${jobId} attempt ${attempts} (in flight: ${inFlight}, waiting: ${waiting.length})`)

  try {
    const result = await transformClip(job.originalBuffer, job.originalName)
    updateJob(jobId, {
      status: 'completed',
      resultBuffer: result,
      resultSize: result.length,
      error: null,
      completedAt: new Date().toISOString(),
    })
    console.log(`[queue] job ${jobId} completed (${result.length} bytes)`)
  } catch (err) {
    const error = err instanceof TransformError
      ? err
      : new TransformError('INTERNAL_ERROR', 'Unexpected error while transforming the video.')
    if (!(err instanceof TransformError)) console.error(`[queue] job ${jobId} crashed`, err)

    if (error.retryable && attempts < MAX_ATTEMPTS) {
      const delay = error.retryAfterMs ?? 1000 * 2 ** (attempts - 1)
      console.warn(`[queue] job ${jobId} ${error.code}; retrying in ${delay}ms`)
      updateJob(jobId, {
        status: 'queued',
        error: { code: error.code, message: error.message, retryable: true },
      })
      setTimeout(() => {
        if (getJob(jobId)) enqueue(jobId)
      }, delay)
      return
    }

    console.warn(`[queue] job ${jobId} failed: ${error.code} ${error.message}`)
    updateJob(jobId, {
      status: 'failed',
      error: { code: error.code, message: error.message, retryable: error.retryable },
      completedAt: new Date().toISOString(),
    })
  }
}
