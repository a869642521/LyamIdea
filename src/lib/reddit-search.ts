/**
 * Reddit 公开 JSON 搜索（无需认证）。
 *
 * 拉取 reddit.com/search.json 的真实帖子列表，为「超级推荐」提供
 * 100% 真实的 permalink + 标题 + 摘要 + 点赞数，从根源杜绝链接幻觉。
 *
 * 增强功能：
 * - 双排序并发（relevance + top），去重后合并，覆盖「最相关」和「历史最热」帖
 * - enrichRedditPostsWithComments：对高价值帖子并发拉取顶部评论，
 *   让 snippet 包含真实用户原声（而非仅靠楼主 selftext），大幅提升证据质量。
 *
 * 注意：
 * - Reddit 对未认证请求有较宽松的限制（约 60 req/min），但仍需合理 User-Agent。
 * - 遇到 403/429 或超时时静默返回空数组，上层回退到纯 Kimi 联网。
 * - 不使用 redd.it 短链，所有 URL 由程序拼接，格式确定可靠。
 */

export interface RedditComment {
  body: string
  author: string
  ups: number
}

export interface RedditPost {
  /** Reddit 全站唯一 permalink，已补全 https://www.reddit.com */
  permalink: string
  title: string
  /** 楼主原文摘要（selftext），可能为空 */
  selftext: string
  subreddit: string
  /** 净赞数 */
  ups: number
  /** 评论数 */
  num_comments: number
  /** 发帖时间（Unix 秒） */
  created_utc: number
  /** 顶部评论（enrichRedditPostsWithComments 填充后可用） */
  topComments?: RedditComment[]
}

const REDDIT_SEARCH_TIMEOUT_MS = 12_000
const REDDIT_COMMENTS_TIMEOUT_MS = 8_000
const REDDIT_UA = 'idea-pool-app/1.0 (product research tool; contact: noreply@example.com)'

type RedditSort = 'relevance' | 'hot' | 'top' | 'new'

/**
 * 搜索 Reddit，返回最多 `limit` 条帖子（默认 10）。
 * 遇到任何错误（网络、403、解析失败）均静默返回空数组，由上层回退。
 *
 * @param query   搜索词（英文效果最佳；中文关键词也可尝试）
 * @param opts.sort    排序方式，默认 "relevance"
 * @param opts.t       时间范围，默认 "year"
 * @param opts.limit   最多返回条数，默认 8，最大 25
 * @param opts.signal  AbortSignal，用于上游取消
 */
export async function searchReddit(
  query: string,
  opts?: {
    sort?: RedditSort
    t?: 'hour' | 'day' | 'week' | 'month' | 'year' | 'all'
    limit?: number
    signal?: AbortSignal
  }
): Promise<RedditPost[]> {
  const sort = opts?.sort ?? 'relevance'
  const t = opts?.t ?? 'year'
  const limit = Math.min(opts?.limit ?? 8, 25)

  const url = new URL('https://www.reddit.com/search.json')
  url.searchParams.set('q', query)
  url.searchParams.set('sort', sort)
  url.searchParams.set('t', t)
  url.searchParams.set('limit', String(limit))
  url.searchParams.set('type', 'link')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REDDIT_SEARCH_TIMEOUT_MS)
  const signal = opts?.signal
    ? anySignal([opts.signal, controller.signal])
    : controller.signal

  try {
    const res = await fetch(url.toString(), {
      signal,
      headers: { 'User-Agent': REDDIT_UA, Accept: 'application/json' },
    })
    clearTimeout(timer)

    if (!res.ok) {
      console.warn(`[reddit-search] HTTP ${res.status} for "${query.slice(0, 60)}" sort=${sort}`)
      return []
    }

    const json = await res.json() as RedditSearchResponse
    const children = json?.data?.children ?? []

    return children
      .map((child) => child.data)
      .filter((d) => d && typeof d.permalink === 'string' && d.title)
      .map((d) => ({
        permalink: `https://www.reddit.com${d.permalink.replace(/\/$/, '')}`,
        title: String(d.title).trim().slice(0, 280),
        selftext: typeof d.selftext === 'string' ? d.selftext.trim().slice(0, 600) : '',
        subreddit: typeof d.subreddit === 'string' ? `r/${d.subreddit}` : 'Reddit',
        ups: typeof d.ups === 'number' ? d.ups : 0,
        num_comments: typeof d.num_comments === 'number' ? d.num_comments : 0,
        created_utc: typeof d.created_utc === 'number' ? d.created_utc : 0,
      }))
      .filter((p) => p.ups >= 0)
  } catch (e) {
    clearTimeout(timer)
    if (e instanceof Error && e.name !== 'AbortError') {
      console.warn('[reddit-search] fetch failed:', e.message.slice(0, 120))
    }
    return []
  }
}

/**
 * 并发以「relevance」和「top/all」两种排序搜索同一关键词，去重合并。
 * relevance 找最相关帖，top 找历史最热帖（两类覆盖互补）。
 *
 * @param query   搜索词
 * @param limit   每种排序最多取几条（默认 10），合并去重后总数约 limit～2*limit
 */
export async function searchRedditDual(
  query: string,
  opts?: { limit?: number; signal?: AbortSignal }
): Promise<RedditPost[]> {
  const limit = opts?.limit ?? 10

  const [byRelevance, byTop] = await Promise.all([
    searchReddit(query, { sort: 'relevance', t: 'year', limit, signal: opts?.signal }),
    searchReddit(query, { sort: 'top', t: 'all', limit, signal: opts?.signal }),
  ])

  // 按 permalink 去重，relevance 结果优先
  const seen = new Set<string>()
  const merged: RedditPost[] = []
  for (const p of [...byRelevance, ...byTop]) {
    if (!seen.has(p.permalink)) {
      seen.add(p.permalink)
      merged.push(p)
    }
  }

  // 按 ups 降序排列，把最有价值的帖子放前面
  return merged.sort((a, b) => b.ups - a.ups)
}

/**
 * 拉取单个帖子的顶部评论（最多 `limit` 条，默认 5 条）。
 * 失败时静默返回空数组。
 */
export async function fetchRedditPostComments(
  permalink: string,
  opts?: { limit?: number; signal?: AbortSignal }
): Promise<RedditComment[]> {
  const limit = Math.min(opts?.limit ?? 5, 10)

  const url = new URL(`${permalink}.json`)
  url.searchParams.set('limit', String(limit))
  url.searchParams.set('sort', 'top')
  url.searchParams.set('depth', '1') // 只取顶层评论，不递归

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REDDIT_COMMENTS_TIMEOUT_MS)
  const signal = opts?.signal
    ? anySignal([opts.signal, controller.signal])
    : controller.signal

  try {
    const res = await fetch(url.toString(), {
      signal,
      headers: { 'User-Agent': REDDIT_UA, Accept: 'application/json' },
    })
    clearTimeout(timer)

    if (!res.ok) return []

    // Reddit 返回 [帖子信息, 评论列表] 两个 Listing 对象
    const json = await res.json() as RedditCommentsResponse
    const commentListing = Array.isArray(json) ? json[1] : null
    const children = commentListing?.data?.children ?? []

    return children
      .filter((c) => c.kind === 't1' && c.data?.body && c.data.body !== '[deleted]' && c.data.body !== '[removed]')
      .map((c) => ({
        body: String(c.data.body).trim().slice(0, 300),
        author: String(c.data.author ?? 'unknown').trim(),
        ups: typeof c.data.ups === 'number' ? c.data.ups : 0,
      }))
      .filter((c) => c.body.length > 20 && c.ups >= 0)
      .sort((a, b) => b.ups - a.ups)
      .slice(0, limit)
  } catch (e) {
    clearTimeout(timer)
    if (e instanceof Error && e.name !== 'AbortError') {
      console.warn('[reddit-comments] fetch failed:', e.message.slice(0, 100))
    }
    return []
  }
}

/**
 * 对帖子列表中的高价值帖子（评论数 > 0）并发拉取顶部评论，
 * 就地填充 `topComments` 字段，返回增强后的帖子列表。
 *
 * @param posts       要增强的帖子列表
 * @param opts.topN   最多增强前 N 篇（按 ups 降序，默认 6）
 * @param opts.commentLimit  每篇最多取几条评论（默认 4）
 */
export async function enrichRedditPostsWithComments(
  posts: RedditPost[],
  opts?: { topN?: number; commentLimit?: number; signal?: AbortSignal }
): Promise<RedditPost[]> {
  const topN = opts?.topN ?? 6
  const commentLimit = opts?.commentLimit ?? 4

  // 按 ups 排序，只增强前 topN 篇（避免请求过多）
  const sorted = [...posts].sort((a, b) => b.ups - a.ups)
  const toEnrich = sorted.filter((p) => p.num_comments > 0).slice(0, topN)
  const toEnrichSet = new Set(toEnrich.map((p) => p.permalink))

  const results = await Promise.allSettled(
    toEnrich.map((p) =>
      fetchRedditPostComments(p.permalink, {
        limit: commentLimit,
        signal: opts?.signal,
      }).then((comments) => ({ permalink: p.permalink, comments }))
    )
  )

  const commentMap = new Map<string, RedditComment[]>()
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value.comments.length > 0) {
      commentMap.set(r.value.permalink, r.value.comments)
    }
  }

  console.log(`[reddit-enrich] fetched comments for ${commentMap.size}/${toEnrich.length} posts`)

  return posts.map((p) => {
    if (!toEnrichSet.has(p.permalink)) return p
    const comments = commentMap.get(p.permalink)
    return comments ? { ...p, topComments: comments } : p
  })
}

// ── 内部类型 ──

interface RedditSearchResponse {
  data?: {
    children?: Array<{
      data: {
        permalink: string
        title: string
        selftext?: string
        subreddit?: string
        ups?: number
        num_comments?: number
        created_utc?: number
      }
    }>
  }
}

type RedditCommentsResponse = Array<{
  data?: {
    children?: Array<{
      kind: string
      data: {
        body?: string
        author?: string
        ups?: number
      }
    }>
  }
}>

/** 合并多个 AbortSignal，任一触发即中止 */
function anySignal(signals: AbortSignal[]): AbortSignal {
  const ctrl = new AbortController()
  for (const s of signals) {
    if (s.aborted) { ctrl.abort(); break }
    s.addEventListener('abort', () => ctrl.abort(), { once: true })
  }
  return ctrl.signal
}
