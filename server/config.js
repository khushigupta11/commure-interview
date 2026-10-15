export const PORT = Number(process.env.PORT) || 3001
export const BASE_URL = (process.env.BASE_URL || 'https://interview-studio-lime.vercel.app').replace(/\/+$/, '')
export const TRANSFORM_SERVICE_TOKEN = process.env.TRANSFORM_SERVICE_TOKEN || ''

// Limits imposed by the transform service
export const MAX_CLIP_BYTES = 3_000_000
export const MAX_RESULT_BYTES = 4_000_000
export const MAX_CONCURRENCY = Math.min(Number(process.env.MAX_CONCURRENCY) || 4, 6)
export const MIN_START_INTERVAL_MS = 100 // ≤10 req/s, headroom under the 12 req/s limit for network jitter

// Our own policies
export const MAX_ATTEMPTS = 3
export const UPSTREAM_TIMEOUT_MS = 60_000
export const MAX_JOBS = 50
