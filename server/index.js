import express from 'express'
import multer from 'multer'
import { PORT, TRANSFORM_SERVICE_TOKEN } from './config.js'
import jobsRouter, { ApiError } from './routes/jobs.js'

const app = express()

app.use(express.json())

app.get('/api/health', (req, res) => {
  res.json({ ok: true, tokenConfigured: Boolean(TRANSFORM_SERVICE_TOKEN) })
})

app.use('/api/jobs', jobsRouter)

app.use('/api', (req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found.' } })
})

// Central error handler: every error leaves as { error: { code, message } }.
app.use((err, req, res, next) => {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message } })
  }
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: { code: 'FILE_TOO_LARGE', message: 'Video must be 3 MB (3,000,000 bytes) or smaller.' } })
    }
    const message = err.code === 'LIMIT_UNEXPECTED_FILE'
      ? 'Upload exactly one video in the "clip" field.'
      : err.message
    return res.status(400).json({ error: { code: 'INVALID_UPLOAD', message } })
  }
  console.error(err)
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong on the server.' } })
})

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
  if (!TRANSFORM_SERVICE_TOKEN) {
    console.warn('TRANSFORM_SERVICE_TOKEN is not set; uploads will be rejected until it is configured in server/.env')
  }
})
