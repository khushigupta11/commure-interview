import { Router } from 'express'
import multer from 'multer'
import path from 'node:path'
import { MAX_CLIP_BYTES, TRANSFORM_SERVICE_TOKEN } from '../config.js'
import { sendVideo } from '../lib/sendVideo.js'
import { enqueue } from '../queue.js'
import { createJob, deleteJob, getJob, listJobs, toPublic, updateJob } from '../store.js'

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message)
    this.status = status
    this.code = code
  }
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_CLIP_BYTES, files: 1 },
})

const router = Router()

function findJobOr404(id) {
  const job = getJob(id)
  if (!job) throw new ApiError(404, 'JOB_NOT_FOUND', 'Job not found. It may have expired or the server restarted.')
  return job
}

// MP4 files carry an "ftyp" box at byte offset 4.
function looksLikeMp4(buffer) {
  return buffer.length >= 12 && buffer.toString('ascii', 4, 8) === 'ftyp'
}

router.post('/', (req, res, next) => {
  if (!TRANSFORM_SERVICE_TOKEN) {
    return next(new ApiError(503, 'SERVICE_NOT_CONFIGURED', 'The transform service is not configured on the server.'))
  }
  next()
}, upload.single('clip'), (req, res) => {
  if (!req.file) {
    throw new ApiError(400, 'NO_FILE', 'Attach a video in the "clip" field.')
  }
  if (req.file.mimetype !== 'video/mp4' || !looksLikeMp4(req.file.buffer)) {
    throw new ApiError(415, 'UNSUPPORTED_TYPE', 'Only MP4 videos are supported.')
  }

  const job = createJob({
    originalName: req.file.originalname || 'clip.mp4',
    originalBuffer: req.file.buffer,
  })
  enqueue(job.id)
  res.status(202).json({ job: toPublic(job) })
})

router.get('/', (req, res) => {
  res.json({ jobs: listJobs().map(toPublic) })
})

router.get('/:id', (req, res) => {
  res.json({ job: toPublic(findJobOr404(req.params.id)) })
})

router.get('/:id/original', (req, res) => {
  const job = findJobOr404(req.params.id)
  sendVideo(req, res, job.originalBuffer)
})

router.get('/:id/result', (req, res) => {
  const job = findJobOr404(req.params.id)
  if (job.status !== 'completed') {
    throw new ApiError(409, 'RESULT_NOT_READY', `The transformed video is not ready (status: ${job.status}).`)
  }
  const downloadName = req.query.download
    ? `${path.parse(job.originalName).name}-grayscale.mp4`
    : undefined
  sendVideo(req, res, job.resultBuffer, { downloadName })
})

router.post('/:id/retry', (req, res) => {
  const job = findJobOr404(req.params.id)
  if (job.status !== 'failed' || !job.error?.retryable) {
    throw new ApiError(409, 'NOT_RETRYABLE', 'Only jobs that failed with a temporary error can be retried.')
  }
  updateJob(job.id, { status: 'queued', attempts: 0, error: null, completedAt: null })
  enqueue(job.id)
  res.status(202).json({ job: toPublic(job) })
})

router.delete('/:id', (req, res) => {
  if (!deleteJob(req.params.id)) {
    throw new ApiError(404, 'JOB_NOT_FOUND', 'Job not found.')
  }
  res.status(204).end()
})

export default router
