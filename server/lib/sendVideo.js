// Sends an in-memory MP4 with HTTP Range support so <video> elements can seek
// (Safari refuses to play media without it).
export function sendVideo(req, res, buffer, { downloadName } = {}) {
  const total = buffer.length
  res.set('Content-Type', 'video/mp4')
  res.set('Accept-Ranges', 'bytes')
  res.set('Cache-Control', 'no-store')
  if (downloadName) res.attachment(downloadName)

  const range = req.headers.range
  if (!range) {
    res.set('Content-Length', String(total))
    return res.end(buffer)
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(range)
  let start = match?.[1] ? Number(match[1]) : NaN
  let end = match?.[2] ? Number(match[2]) : NaN
  if (match && !match[1] && match[2]) {
    // Suffix range: last N bytes
    start = Math.max(0, total - Number(match[2]))
    end = total - 1
  } else if (match) {
    end = Number.isNaN(end) ? total - 1 : Math.min(end, total - 1)
  }

  if (!match || Number.isNaN(start) || start > end || start >= total) {
    res.set('Content-Range', `bytes */${total}`)
    return res.status(416).end()
  }

  res.status(206)
  res.set('Content-Range', `bytes ${start}-${end}/${total}`)
  res.set('Content-Length', String(end - start + 1))
  return res.end(buffer.subarray(start, end + 1))
}
