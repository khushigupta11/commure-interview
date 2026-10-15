async function request(url, options) {
  const res = await fetch(url, options)
  if (res.status === 204) return null
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(body?.error?.message || `Request failed (${res.status})`)
  return body
}

export const getHealth = () => request('/api/health')

export const listJobs = () => request('/api/jobs').then((data) => data.jobs)

export function uploadJob(file) {
  const form = new FormData()
  form.append('clip', file)
  return request('/api/jobs', { method: 'POST', body: form }).then((data) => data.job)
}

export const retryJob = (id) => request(`/api/jobs/${id}/retry`, { method: 'POST' })

export const deleteJob = (id) => request(`/api/jobs/${id}`, { method: 'DELETE' })
