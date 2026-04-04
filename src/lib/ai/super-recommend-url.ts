/**
 * 超级推荐：仅保留 Reddit / X / Facebook 的可解析帖子级链接，过滤其它域名与明显编造 URL，
 * 减少用户点开 404 或跳错页。
 */

function stripTrackingParams(url: URL): void {
  const drop = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'context']
  for (const k of drop) url.searchParams.delete(k)
}

/**
 * 若为合法 Reddit 帖子链接则规范化后返回；否则返回 undefined。
 * 要求路径含 /r/{sub}/comments/{postId}/（postId 为 Reddit 帖子 ID，字母数字）。
 */
export function sanitizeRedditPostUrl(raw: string): string | undefined {
  const t = raw.trim()
  if (!t.startsWith('http')) return undefined
  let url: URL
  try {
    url = new URL(t)
  } catch {
    return undefined
  }
  const h = url.hostname.toLowerCase()
  if (!(h === 'reddit.com' || h.endsWith('.reddit.com'))) return undefined
  const segs = url.pathname.split('/').filter(Boolean)
  if (segs[0] !== 'r' || segs.length < 4 || segs[2] !== 'comments') return undefined
  const postId = segs[3]
  if (!postId || !/^[a-z0-9]{3,12}$/i.test(postId)) return undefined
  const sub = segs[1]
  if (!sub || !/^[A-Za-z0-9_]{2,50}$/.test(sub)) return undefined
  url.hash = ''
  stripTrackingParams(url)
  url.hostname = 'www.reddit.com'
  url.protocol = 'https:'
  return url.toString()
}

/**
 * X（原 Twitter）单帖链接：/…/status/{numericId} 或 /i/web/status/{id} / /i/status/{id}
 */
export function sanitizeTwitterXUrl(raw: string): string | undefined {
  const t = raw.trim()
  if (!t.startsWith('http')) return undefined
  let url: URL
  try {
    url = new URL(t)
  } catch {
    return undefined
  }
  const h = url.hostname.toLowerCase()
  const okHost =
    h === 'twitter.com' ||
    h === 'www.twitter.com' ||
    h === 'mobile.twitter.com' ||
    h === 'x.com' ||
    h === 'www.x.com'
  if (!okHost) return undefined
  const segs = url.pathname.split('/').filter(Boolean)
  const statusIdx = segs.lastIndexOf('status')
  if (statusIdx < 0 || statusIdx >= segs.length - 1) return undefined
  const tid = segs[statusIdx + 1]
  if (!tid || !/^[0-9]{4,22}$/.test(tid)) return undefined
  const pathPrefix = segs.slice(0, statusIdx + 2).join('/')
  return `https://x.com/${pathPrefix}`
}

/**
 * Facebook 公开帖文 permalink：/.../posts/{id}、群组帖、或 permalink.php?story_fbid=
 */
export function sanitizeFacebookPostUrl(raw: string): string | undefined {
  const t = raw.trim()
  if (!t.startsWith('http')) return undefined
  let url: URL
  try {
    url = new URL(t)
  } catch {
    return undefined
  }
  const h = url.hostname.toLowerCase()
  if (!/^([a-z0-9-]+\.)?facebook\.com$/.test(h)) return undefined
  const path = url.pathname
  const hasPostPath = /\/posts\/[^/?#]+/i.test(path) || /\/groups\/[^/]+\/posts\//i.test(path)
  const storyFbid = url.searchParams.get('story_fbid')
  const okPermalink =
    path === '/permalink.php' && storyFbid && /^\d+$/.test(storyFbid)
  if (!hasPostPath && !okPermalink) return undefined
  url.hash = ''
  stripTrackingParams(url)
  url.hostname = 'www.facebook.com'
  url.protocol = 'https:'
  return url.toString()
}

export function sanitizeSuperRecommendPostUrl(raw: string): string | undefined {
  return (
    sanitizeRedditPostUrl(raw) ??
    sanitizeTwitterXUrl(raw) ??
    sanitizeFacebookPostUrl(raw)
  )
}

/** 超级推荐证据：仅保留 Reddit / X / Facebook 的可解析链接，其它域名清空 url */
export function normalizeSuperRecommendEvidenceItems<T extends { url: string }>(items: T[]): T[] {
  return items.map((e) => {
    const u = (e.url || '').trim()
    if (!u) return e
    const safe = sanitizeSuperRecommendPostUrl(u)
    return safe ? { ...e, url: safe } : { ...e, url: '' }
  })
}
