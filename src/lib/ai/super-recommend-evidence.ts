/**
 * 超级 AI 推荐：查询扩充（含 AI 竞品向）→ Reddit + 网页（Brave/Google，含 Facebook）+ 可选 Kimi 并发 →
 * 水帖/软广过滤 → 打分、重排、来源多样性截断 → URL 规范化（Reddit / X / Facebook）。
 */

import type { LLMConfig } from '@/lib/llm-config'
import { jsonrepair } from 'jsonrepair'
import {
  requestChatCompletion,
  requestKimiResearchWithWebSearch,
  supportsKimiWebSearch,
} from './provider-client'
import {
  fetchWebSearchItemsForQuery,
  resolveWebSearchProvider,
} from './search/web-search-client'
import { searchRedditDual, enrichRedditPostsWithComments } from '@/lib/reddit-search'
import { normalizeSuperRecommendEvidenceItems } from './super-recommend-url'

export type SuperRecommendEvidenceChannel = 'reddit' | 'web' | 'facebook' | 'kimi'

export interface SuperRecommendEvidenceItem {
  id: string
  url: string
  title: string
  snippet: string
  source: string
  upvotes: number
  /** 采集通道；种子「证据直通车」分槽依赖此字段 */
  channel?: SuperRecommendEvidenceChannel
}

type EvidenceChannel = SuperRecommendEvidenceChannel

/** 明显水帖、软广、引流帖：不参与证据池，减少假机会 */
const WATER_OR_AD_RE =
  /推广|种草|私信我|加[微薇]|扫码|优惠码|折扣码|限时秒杀|点击购买|9\.9|包邮|带货|直播间|affiliate|discount code|promo code|use my code|link in bio|sponsored ad|giveaway|free trial.{0,20}card|DM me|私信领取|关注公众号|加群|代理招募/i

function isLikelyWaterOrAd(title: string, snippet: string): boolean {
  const t = `${title}\n${snippet}`
  if (WATER_OR_AD_RE.test(t)) return true
  const plain = t.replace(/\s+/g, ' ').trim()
  if (plain.length > 0 && plain.length < 18) return true
  return false
}

function webChannelForUrl(link: string): 'facebook' | 'web' {
  try {
    const h = new URL(link).hostname.toLowerCase()
    if (h === 'facebook.com' || h.endsWith('.facebook.com')) return 'facebook'
  } catch {
    /* ignore */
  }
  return 'web'
}

function mergeCompetitorAndPlatformQueries(
  original: string,
  expanded: string[],
  outputLang: 'zh' | 'en'
): string[] {
  const core = original.trim() || expanded[0] || ''
  const extra =
    outputLang === 'en'
      ? [
          `${core} hottest AI tools competitors comparison reddit OR site:x.com`,
          `site:facebook.com ${core} AI discussion complaints`,
        ]
      : [
          `${core} AI竞品 热度 讨论 site:reddit.com OR site:x.com`,
          `site:facebook.com ${core} 人工智能 吐槽 讨论`,
        ]
  const seen = new Set<string>()
  const out: string[] = []
  for (const q of [...expanded, ...extra]) {
    const k = q.toLowerCase().trim()
    if (!k || seen.has(k)) continue
    seen.add(k)
    out.push(q.trim())
  }
  return out.slice(0, 5)
}

type ScoredEvidence = SuperRecommendEvidenceItem & { channel: EvidenceChannel; score: number }

const LOG = '[super-recommend]'
const WEB_PER_QUERY = 5
const WEB_TOTAL_CAP = 20
const MAX_EVIDENCE = 15
const EXPANSION_MAX_TOKENS = 400

function isJsonModeUnsupported(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase()
  return (
    (msg.includes('response_format') || msg.includes('json_object') || msg.includes('json mode')) &&
    (msg.includes('400') || msg.includes('not support') || msg.includes('unsupport') || msg.includes('invalid'))
  )
}

function snippetQualityBonus(snippet: string): number {
  const s = snippet.toLowerCase()
  let b = 0
  if (/\d/.test(snippet)) b += 0.4
  if (snippet.includes('%') || snippet.includes('$')) b += 0.3
  if (snippet.includes('?') || snippet.includes('？')) b += 0.2
  if (/痛点|吐槽|难用|后悔|避雷|智商税|problem|pain|issue|complaint|alternative|vs|reddit/.test(s)) b += 0.5
  return Math.min(b, 2)
}

function scoreRedditPost(p: {
  ups: number
  num_comments: number
  selftext: string
  topComments?: { body: string }[]
}): number {
  const snippetLen = (
    p.selftext +
    (p.topComments ?? []).map((c) => c.body).join(' ')
  ).length
  return (
    Math.log1p(Math.max(0, p.ups)) * 2 +
    Math.log1p(Math.max(0, p.num_comments)) * 1.2 +
    snippetLen / 250 +
    snippetQualityBonus(p.selftext)
  )
}

function scoreWebItem(snippet: string): number {
  return snippet.length / 180 + snippetQualityBonus(snippet)
}

function scoreKimiItem(snippet: string, upvotes: number): number {
  return Math.log1p(Math.max(0, upvotes)) + snippet.length / 200 + snippetQualityBonus(snippet)
}

function tier1Sufficient(items: ScoredEvidence[]): boolean {
  if (items.length === 0) return false
  const urls = new Set(items.map((i) => i.url.trim()).filter(Boolean))
  const avg = items.reduce((s, i) => s + i.score, 0) / items.length
  const r = items.filter((i) => i.channel === 'reddit').length
  const w = items.filter((i) => i.channel === 'web' || i.channel === 'facebook').length
  return (urls.size >= 8 && avg >= 2.5) || (r >= 5 && w >= 3)
}

function dedupeByUrlPreferScore(items: ScoredEvidence[]): ScoredEvidence[] {
  const sorted = [...items].sort((a, b) => b.score - a.score)
  const out: ScoredEvidence[] = []
  const seen = new Set<string>()
  for (const it of sorted) {
    const k = it.url.trim() || `__nourl__${it.id}`
    if (seen.has(k)) continue
    seen.add(k)
    out.push(it)
  }
  return out
}

function diversifySelect(items: ScoredEvidence[], max: number): SuperRecommendEvidenceItem[] {
  const byCh: Record<EvidenceChannel, ScoredEvidence[]> = {
    reddit: [],
    web: [],
    facebook: [],
    kimi: [],
  }
  for (const it of items) {
    byCh[it.channel].push(it)
  }
  for (const k of Object.keys(byCh) as EvidenceChannel[]) {
    byCh[k].sort((a, b) => b.score - a.score)
  }

  const cursors: Record<EvidenceChannel, number> = { reddit: 0, web: 0, facebook: 0, kimi: 0 }

  const out: ScoredEvidence[] = []
  const seenUrl = new Set<string>()
  const hostCount = new Map<string, number>()
  const subCount = new Map<string, number>()

  function hostTooMany(hostname: string, cap: number): boolean {
    return (hostCount.get(hostname) ?? 0) >= cap
  }

  function canAdd(it: ScoredEvidence): boolean {
    const u = it.url.trim()
    if (u && seenUrl.has(u)) return false
    if ((it.channel === 'web' || it.channel === 'facebook') && u) {
      try {
        const h = new URL(u).hostname.toLowerCase()
        const cap = it.channel === 'facebook' ? 2 : 2
        if (hostTooMany(h, cap)) return false
      } catch {
        /* ignore */
      }
    }
    if (it.channel === 'reddit') {
      const sub = it.source.startsWith('r/') ? it.source : `r/${it.source}`
      if ((subCount.get(sub) ?? 0) >= 3) return false
    }
    return true
  }

  function commit(it: ScoredEvidence) {
    out.push(it)
    const u = it.url.trim()
    if (u) seenUrl.add(u)
    if ((it.channel === 'web' || it.channel === 'facebook') && u) {
      try {
        const h = new URL(u).hostname.toLowerCase()
        hostCount.set(h, (hostCount.get(h) ?? 0) + 1)
      } catch {
        /* ignore */
      }
    }
    if (it.channel === 'reddit') {
      const sub = it.source.startsWith('r/') ? it.source : `r/${it.source}`
      subCount.set(sub, (subCount.get(sub) ?? 0) + 1)
    }
  }

  function tryTakeFrom(ch: EvidenceChannel): boolean {
    const q = byCh[ch]
    while (cursors[ch] < q.length) {
      const it = q[cursors[ch]++]
      if (out.some((x) => x.id === it.id)) continue
      if (canAdd(it)) {
        commit(it)
        return true
      }
    }
    return false
  }

  const channels: EvidenceChannel[] = ['reddit', 'web', 'facebook', 'kimi']
  for (let round = 0; round < 2 && out.length < max; round++) {
    for (const ch of channels) {
      if (out.length >= max) break
      tryTakeFrom(ch)
    }
  }

  const rest = [...items].sort((a, b) => b.score - a.score)
  for (const it of rest) {
    if (out.length >= max) break
    if (out.some((x) => x.id === it.id)) continue
    if (canAdd(it)) commit(it)
  }

  return out.slice(0, max).map(({ score: _s, ...row }) => row)
}

async function expandSearchQueries(
  query: string,
  cfg: Pick<LLMConfig, 'apiKey' | 'baseUrl' | 'model'>,
  outputLang: 'zh' | 'en'
): Promise<string[]> {
  const system =
    outputLang === 'en'
      ? 'You expand search queries. Reply with ONLY one JSON object: {"queries":["..."]} with 3–4 English strings: pain points, alternatives, AND at least one aimed at "most discussed / hottest AI tools or competitors" (e.g. vs ChatGPT, Claude, vertical SaaS) when the topic is software or AI. No markdown.'
      : '你是搜索词扩充助手。只回复一个 JSON：{"queries":["..."]}，3～4 条子查询：痛点、替代方案、社区讨论，且至少 1 条明确面向「同类 AI 产品/竞品热度、对比」（如 ChatGPT、Claude、垂直工具）。禁止 Markdown。'

  const user =
    outputLang === 'en'
      ? `Topic: "${query}". Return 3–4 diverse web search queries as JSON (include competitor buzz for AI/tech topics).`
      : `用户主题：「${query}」。请输出 3～4 条网页检索子查询 JSON（若为科技/AI 类，须含竞品热度向查询）。`

  let raw = ''
  try {
    try {
      raw = await requestChatCompletion(
        { apiKey: cfg.apiKey!, baseUrl: cfg.baseUrl, model: cfg.model },
        {
          systemPrompt: system,
          prompt: user,
          maxTokens: EXPANSION_MAX_TOKENS,
          temperature: 0.25,
          jsonMode: true,
        }
      )
    } catch (e) {
      if (!isJsonModeUnsupported(e)) throw e
      raw = await requestChatCompletion(
        { apiKey: cfg.apiKey!, baseUrl: cfg.baseUrl, model: cfg.model },
        {
          systemPrompt: system,
          prompt: user,
          maxTokens: EXPANSION_MAX_TOKENS,
          temperature: 0.35,
          jsonMode: false,
        }
      )
    }
    const trimmed = raw.replace(/^\uFEFF/, '').trim()
    const parsed = JSON.parse(jsonrepair(trimmed)) as { queries?: unknown }
    const list = Array.isArray(parsed.queries) ? parsed.queries : []
    const qs = list
      .filter((x): x is string => typeof x === 'string')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 4)
    const merged = [query, ...qs]
    const seen = new Set<string>()
    const uniq: string[] = []
    for (const q of merged) {
      const k = q.toLowerCase()
      if (seen.has(k)) continue
      seen.add(k)
      uniq.push(q)
    }
    return uniq.slice(0, 4)
  } catch (e) {
    console.warn(`${LOG} query expansion failed, using templates:`, e instanceof Error ? e.message : e)
  }

  if (outputLang === 'en') {
    return [
      query,
      `${query} pain points reddit`,
      `${query} AI tools competitors comparison`,
      `${query} vs ChatGPT alternatives`,
    ].slice(0, 4)
  }
  return [query, `${query} 痛点 吐槽`, `${query} AI竞品 对比`, `${query} reddit 讨论`].slice(0, 4)
}

export async function collectSuperRecommendEvidence(
  query: string,
  cfg: Pick<LLMConfig, 'apiKey' | 'baseUrl' | 'model'>,
  options?: { outputLang?: 'zh' | 'en'; excludePostUrls?: string[] }
): Promise<SuperRecommendEvidenceItem[]> {
  const outputLang = options?.outputLang === 'en' ? 'en' : 'zh'
  const exclude = new Set((options?.excludePostUrls ?? []).map((u) => u.trim()).filter(Boolean))

  const expandedCore = await expandSearchQueries(query, cfg, outputLang)
  const subQueries = mergeCompetitorAndPlatformQueries(query, expandedCore, outputLang)
  console.log(`${LOG} search queries: ${subQueries.join(' | ')}`)

  const hasWeb = resolveWebSearchProvider() !== null
  const kimiAbort = new AbortController()
  const useKimi = supportsKimiWebSearch(cfg.baseUrl)

  const { buildSuperRecommendEvidenceSystemPrompt, buildSuperRecommendEvidenceUserPrompt } =
    await import('./prompts')

  const kimiPromise = useKimi
    ? requestKimiResearchWithWebSearch(
        { apiKey: cfg.apiKey!, baseUrl: cfg.baseUrl, model: cfg.model },
        {
          systemPrompt: buildSuperRecommendEvidenceSystemPrompt(),
          userPrompt: buildSuperRecommendEvidenceUserPrompt(query, {
            excludePostUrls: options?.excludePostUrls,
            outputLang,
          }),
          maxTokens: 3000,
          temperature: 0.2,
          signal: kimiAbort.signal,
        }
      ).catch((e) => {
        const msg = e instanceof Error ? e.message : String(e)
        if (msg.toLowerCase().includes('abort') || msg.includes('timeout')) return null
        console.warn(`${LOG} Kimi Step A failed:`, msg)
        return null
      })
    : Promise.resolve(null)

  const redditPromise = (async () => {
    try {
      const results = await searchRedditDual(query, { limit: 10 })
      if (results.length === 0) return []
      const enriched = await enrichRedditPostsWithComments(results, {
        topN: 6,
        commentLimit: 4,
      })
      console.log(`${LOG} Reddit dual-search: ${enriched.length} posts`)
      return enriched
    } catch (e) {
      console.warn(`${LOG} Reddit fetch skipped:`, e instanceof Error ? e.message : e)
      return []
    }
  })()

  const webQueries = hasWeb ? subQueries.slice(0, 5) : []
  const webPromise = Promise.all(
    webQueries.map((q) =>
      fetchWebSearchItemsForQuery(q, {
        numResults: WEB_PER_QUERY,
        logTag: LOG,
      })
    )
  )

  const [redditSeeds, webChunks] = await Promise.all([redditPromise, webPromise])

  let webFlat = webChunks.flat()
  const webSeen = new Set<string>()
  webFlat = webFlat.filter((w) => {
    const L = w.link.trim()
    if (!L || webSeen.has(L)) return false
    webSeen.add(L)
    return true
  })
  webFlat = webFlat
    .map((w) => ({ w, s: scoreWebItem(w.snippet) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, WEB_TOTAL_CAP)
    .map((x) => x.w)

  const tier1Scored: ScoredEvidence[] = []

  for (let i = 0; i < redditSeeds.length; i++) {
    const p = redditSeeds[i]
    if (exclude.has(p.permalink.trim())) continue
    const commentSnippets = (p.topComments ?? [])
      .slice(0, 3)
      .map((c) => `↩ ${c.body.slice(0, 150)}`)
      .join(' | ')
    const snippet = [p.selftext.slice(0, 350), commentSnippets].filter(Boolean).join('\n').slice(0, 700)
    if (isLikelyWaterOrAd(p.title, snippet)) continue
    tier1Scored.push({
      id: `r${i + 1}`,
      url: p.permalink,
      title: p.title,
      snippet,
      source: p.subreddit,
      upvotes: p.ups,
      channel: 'reddit',
      score: scoreRedditPost(p),
    })
  }

  for (let i = 0; i < webFlat.length; i++) {
    const w = webFlat[i]
    const sn = w.snippet.slice(0, 400)
    if (isLikelyWaterOrAd(w.title, sn)) continue
    const ch = webChannelForUrl(w.link)
    tier1Scored.push({
      id: `w${i + 1}`,
      url: w.link,
      title: w.title,
      snippet: sn,
      source: w.displayLink || 'web',
      upvotes: 0,
      channel: ch,
      score: scoreWebItem(w.snippet),
    })
  }

  if (useKimi && tier1Sufficient(tier1Scored)) {
    console.log(`${LOG} Early exit: tier1 sufficient, aborting Kimi Step A`)
    kimiAbort.abort()
  }

  const evidenceRaw = await kimiPromise
  let kimiScored: ScoredEvidence[] = []
  if (evidenceRaw && evidenceRaw.trim()) {
    const { parseKimiSuperRecommendEvidenceRaw } = await import('./adapter')
    const parsed = parseKimiSuperRecommendEvidenceRaw(evidenceRaw)
    kimiScored = parsed
      .filter((e) => !exclude.has((e.url || '').trim()))
      .filter((e) => !isLikelyWaterOrAd(e.title, e.snippet))
      .map((e, idx) => ({
        ...e,
        id: e.id || `k${idx + 1}`,
        channel: 'kimi' as const,
        score: scoreKimiItem(e.snippet, e.upvotes),
      }))
  }

  const merged = dedupeByUrlPreferScore([...kimiScored, ...tier1Scored])
  merged.sort((a, b) => b.score - a.score)

  const picked = diversifySelect(merged, MAX_EVIDENCE)
  const normalized = normalizeSuperRecommendEvidenceItems(picked)
  console.log(`${LOG} evidence pipeline: ${normalized.length} items (kimi tier optional)`)
  return normalized
}
