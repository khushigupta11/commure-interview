import { randomUUID } from 'node:crypto'
import { MAX_JOBS } from './config.js'

// In-memory job store. Newest jobs are at the end of the array.
const jobs = []

export function createJob({ originalName, originalBuffer }) {
  const job = {
    id: randomUUID(),
    status: 'queued',
    originalName,
    mimeType: 'video/mp4',
    originalSize: originalBuffer.length,
    originalBuffer,
    resultSize: null,
    resultBuffer: null,
    attempts: 0,
    error: null,
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
  }
  jobs.push(job)
  evictOldJobs()
  return job
}

export function getJob(id) {
  return jobs.find((job) => job.id === id)
}

export function listJobs() {
  return [...jobs].reverse()
}

export function updateJob(id, changes) {
  const job = getJob(id)
  if (job) Object.assign(job, changes)
  return job
}

export function deleteJob(id) {
  const index = jobs.findIndex((job) => job.id === id)
  if (index === -1) return false
  jobs.splice(index, 1)
  return true
}

// Drop the oldest finished jobs once we exceed MAX_JOBS so memory stays bounded.
// Jobs that are still queued/processing are never evicted.
function evictOldJobs() {
  let index = 0
  while (jobs.length > MAX_JOBS && index < jobs.length) {
    const { status } = jobs[index]
    if (status === 'completed' || status === 'failed') {
      jobs.splice(index, 1)
    } else {
      index++
    }
  }
}

// Shape returned by the API: no buffers, plus URLs for the client.
export function toPublic(job) {
  const { originalBuffer, resultBuffer, ...rest } = job
  return {
    ...rest,
    originalUrl: `/api/jobs/${job.id}/original`,
    resultUrl: job.status === 'completed' ? `/api/jobs/${job.id}/result` : null,
    downloadUrl: job.status === 'completed' ? `/api/jobs/${job.id}/result?download=1` : null,
  }
}
