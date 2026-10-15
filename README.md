# Grayscale Video Transformer

Upload a short MP4, convert it to grayscale through an external transform service, preview both videos, and download the result.

**Stack:** React + Vite (`client/`) · Node.js + Express 5 (`server/`) · in-memory array for data (jobs are lost on restart)

## Run it

Requires Node.js 20+ and a transform service token.

```bash
cd server
npm install
cp .env.example .env
```

Set `TRANSFORM_SERVICE_TOKEN` in `server/.env`, then use two terminals:

```bash
cd server && npm run dev
```

```bash
cd client && npm install && npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`). Vite proxies `/api` to the backend on port 3001.

Sample video:

```bash
curl --fail --location "https://interview-studio-lime.vercel.app/samples/short.mp4" --output short.mp4
```

## How it works

Uploading creates a **job** and returns right away. A background queue sends the clip to the transform service, and the client polls the job for its status (`queued` → `processing` → `completed` or `failed`).

The queue keeps all users within the service limits: at most 4 requests in flight (6 is the service maximum) and starts spaced 100 ms apart (under 12 per second). Temporary failures (429, 5xx, timeouts) are retried up to 3 times; validation errors are not.

## API

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | Health check |
| `POST /api/jobs` | Upload (multipart field `clip`) → 202 with the job |
| `GET /api/jobs` | List jobs |
| `GET /api/jobs/:id` | Job status and error |
| `GET /api/jobs/:id/original` | Original video (for preview) |
| `GET /api/jobs/:id/result` | Grayscale video; add `?download=1` to download |
| `POST /api/jobs/:id/retry` | Retry a job that failed with a temporary error |
| `DELETE /api/jobs/:id` | Delete a job |

Errors always look like `{ "error": { "code": "...", "message": "..." } }`.

## Data model

```js
{
  id, status,                    // 'queued' | 'processing' | 'completed' | 'failed'
  originalName, originalSize, resultSize,
  attempts,
  error,                         // { code, message, retryable } or null
  createdAt, startedAt, completedAt,
  originalBuffer, resultBuffer   // kept in memory, never sent to the client
}
```

## Limits and edge cases

- Input: H.264 MP4, up to 3,000,000 bytes, 1920×1080, 10 seconds. Output: grayscale, no audio, up to 4 MB.
- Oversize files → 413. Non-MP4 files (checked by content type and file header) → 415.
- Duration, resolution and frame limits are checked by the service; its error message is shown to the user.
- A missing token → 503. A rejected token → generic error; the token never leaves the server.
- The number of stored jobs is capped at 50 to bound memory.
- Videos support Range requests so players can seek (needed for Safari).
- A 404 while polling means the job expired (the server restarted).
