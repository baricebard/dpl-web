export function rpcFailure(error: unknown) {
  let current = error
  let timeout = false
  let rateLimited = false
  let retryAfter = 0
  for (let depth = 0; current && typeof current === 'object' && depth < 12; depth++) {
    const item = current as { name?: string; status?: number; code?: number; message?: string; cause?: unknown; headers?: Headers }
    timeout ||= /timeout/i.test(item.name ?? '')
    rateLimited ||= item.status === 429 || item.code === 429 || item.code === -32005 || /rate limit|too many requests/i.test(item.message ?? '')
    const header = item.headers?.get('retry-after')
    if (header) {
      const seconds = Number(header)
      retryAfter = Math.max(retryAfter, Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - Date.now())
    }
    current = item.cause
  }
  return { timeout, rateLimited, retryAfter }
}
