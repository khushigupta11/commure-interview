import { useCallback, useEffect, useRef, useState } from 'react'
import { deleteJob, getHealth, listJobs, retryJob, uploadJob } from './api.js'

const MAX_BYTES = 3_000_000

function formatSize(bytes) {
  return bytes == null ? '' : `${(bytes / 1_000_000).toFixed(2)} MB`
}

function JobCard({ job, onRetry, onDelete }) {
  const canRetry = job.status === 'failed' && job.error?.retryable
  return (
    <li className="card">
      <div className="card-head">
        <strong>{job.originalName}</strong>
        <span className={`badge ${job.status}`}>{job.status}</span>
      </div>
      <div className="muted">
        {formatSize(job.originalSize)} · {new Date(job.createdAt).toLocaleString()}
      </div>
      {job.error && <p className="error">{job.error.message}</p>}
      <div className="videos">
        <figure>
          <figcaption>Original</figcaption>
          <video src={job.originalUrl} controls preload="metadata" />
        </figure>
        {job.resultUrl && (
          <figure>
            <figcaption>Grayscale ({formatSize(job.resultSize)})</figcaption>
            <video src={job.resultUrl} controls preload="metadata" />
          </figure>
        )}
      </div>
      <div className="actions">
        {job.downloadUrl && <a className="button" href={job.downloadUrl}>Download</a>}
        {canRetry && <button onClick={() => onRetry(job.id)}>Retry</button>}
        <button onClick={() => onDelete(job.id)}>Delete</button>
      </div>
    </li>
  )
}

function App() {
  const [jobs, setJobs] = useState([])
  const [health, setHealth] = useState(null)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileInput = useRef(null)

  const refresh = useCallback(() => {
    return listJobs().then(setJobs).catch((err) => setError(err.message))
  }, [])

  useEffect(() => {
    getHealth().then(setHealth).catch(() => setHealth({ ok: false }))
    refresh()
  }, [refresh])

  const active = jobs.some((j) => j.status === 'queued' || j.status === 'processing')
  useEffect(() => {
    if (!active) return
    const timer = setInterval(refresh, 2000)
    return () => clearInterval(timer)
  }, [active, refresh])

  async function handleUpload(e) {
    e.preventDefault()
    const file = fileInput.current.files[0]
    if (!file) return setError('Choose an MP4 video first.')
    if (file.size > MAX_BYTES) return setError('Video must be 3 MB (3,000,000 bytes) or smaller.')
    setError('')
    setUploading(true)
    try {
      await uploadJob(file)
      fileInput.current.value = ''
      await refresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
    }
  }

  async function act(fn, id) {
    setError('')
    try {
      await fn(id)
      await refresh()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="App">
      <h1>Grayscale Video Converter</h1>

      {health && !health.ok && <p className="error">Cannot reach the backend.</p>}
      {health?.ok && !health.tokenConfigured && (
        <p className="error">The transform service token is not configured on the server; uploads will fail.</p>
      )}

      <form onSubmit={handleUpload} className="upload">
        <input type="file" accept="video/mp4" ref={fileInput} />
        <button type="submit" disabled={uploading}>{uploading ? 'Uploading…' : 'Upload'}</button>
      </form>
      <p className="muted">MP4 only, up to 3 MB.</p>
      {error && <p className="error">{error}</p>}

      <ul className="jobs">
        {jobs.map((job) => (
          <JobCard
            key={job.id}
            job={job}
            onRetry={(id) => act(retryJob, id)}
            onDelete={(id) => act(deleteJob, id)}
          />
        ))}
      </ul>
      {jobs.length === 0 && <p className="muted">No jobs yet.</p>}
    </div>
  )
}

export default App
