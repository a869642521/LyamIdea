/**
 * Brave / Google 网页搜索通用客户端。
 * 供聚焦轮证据与超级 AI 推荐等多处复用。
 */

import { getEffectiveBraveApiKey, getFocusProviderOverride } from '@/lib/web-search-config'

export interface WebSearchResultItem {
  title: string
  link: string
  displayLink: string
  snippet: string
}

export type WebSearchProvider = 'brave' | 'google'

export const DEFAULT_WEB_SEARCH_NUM = 5
export const DEFAULT_WEB_SEARCH_TIMEOUT_MS = 12_000

interface GoogleSearchResponse {
  items?: Array<{ title?: string; link?: string; displayLink?: string; snippet?: string }>
}

interface BraveWebSearchResponse {
  web?: {
    results?: Array<{
      title?: string
      url?: string
      description?: string
      meta_url?: { hostname?: string }
    }>
  }
}

const GOOGLE_SEARCH_URL = 'https://www.googleapis.com/customsearch/v1'
const BRAVE_SEARCH_URL = 'https://api.search.brave.com/res/v1/web/search'

/** FOCUS_EVIDENCE_PROVIDER 与聚焦轮、超级推荐共用（运行时覆盖见 web-search-config） */
export function resolveWebSearchProvider(): WebSearchProvider | null {
  const rt = getFocusProviderOverride()
  const envExplicit = process.env.FOCUS_EVIDENCE_PROVIDER?.trim().toLowerCase()
  const explicit = rt ?? (envExplicit === 'brave' || envExplicit === 'google' ? envExplicit : null)
  if (explicit === 'brave' || explicit === 'google') return explicit

  const braveKey = getEffectiveBraveApiKey()
  if (braveKey) return 'brave'

  const gKey = process.env.GOOGLE_CSE_API_KEY?.trim()
  const cx = process.env.GOOGLE_CSE_CX?.trim()
  if (gKey && cx) return 'google'

  return null
}

export function normalizeWebSearchItem(raw: {
  title?: string
  link?: string
  url?: string
  displayLink?: string
  snippet?: string
  description?: string
  hostname?: string
}): WebSearchResultItem {
  const link = (raw.link ?? raw.url ?? '').trim()
  let displayLink = (raw.displayLink ?? raw.hostname ?? '').trim()
  if (!displayLink && link) {
    try {
      displayLink = new URL(link).hostname
    } catch {
      displayLink = ''
    }
  }
  return {
    title: (raw.title ?? '').trim() || '(no title)',
    link,
    displayLink,
    snippet: (raw.snippet ?? raw.description ?? '').replace(/\n/g, ' ').trim(),
  }
}

function linkAbortSignals(outer?: AbortSignal): {
  signal: AbortSignal
  abortLocal: () => void
  cleanup: () => void
} {
  const inner = new AbortController()
  const onAbort = () => inner.abort()
  if (outer) {
    if (outer.aborted) inner.abort()
    else outer.addEventListener('abort', onAbort, { once: true })
  }
  return {
    signal: inner.signal,
    abortLocal: () => inner.abort(),
    cleanup: () => outer?.removeEventListener('abort', onAbort),
  }
}

export interface WebSearchFetchOptions {
  signal?: AbortSignal
  numResults?: number
  timeoutMs?: number
  logTag?: string
}

export async function fetchGoogleWebSearchItems(
  apiKey: string,
  cx: string,
  q: string,
  opts?: WebSearchFetchOptions
): Promise<WebSearchResultItem[]> {
  const num = opts?.numResults ?? DEFAULT_WEB_SEARCH_NUM
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_WEB_SEARCH_TIMEOUT_MS
  const tag = opts?.logTag ?? '[web-search]'

  const url = new URL(GOOGLE_SEARCH_URL)
  url.searchParams.set('key', apiKey)
  url.searchParams.set('cx', cx)
  url.searchParams.set('q', q)
  url.searchParams.set('num', String(num))
  url.searchParams.set('safe', 'off')

  const { signal: linked, abortLocal, cleanup } = linkAbortSignals(opts?.signal)
  const timeout = setTimeout(() => abortLocal(), timeoutMs)
  try {
    const res = await fetch(url.toString(), { signal: linked })
    if (!res.ok) {
      console.warn(`${tag} Google HTTP ${res.status} q=${q.slice(0, 40)}`)
      return []
    }
    const data = (await res.json()) as GoogleSearchResponse
    const items = data.items ?? []
    return items.map((it) =>
      normalizeWebSearchItem({
        title: it.title,
        link: it.link,
        displayLink: it.displayLink,
        snippet: it.snippet,
      })
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (!msg.toLowerCase().includes('abort')) {
      console.warn(`${tag} Google fetch failed:`, msg.slice(0, 120))
    }
    return []
  } finally {
    clearTimeout(timeout)
    cleanup()
  }
}

export async function fetchBraveWebSearchItems(
  token: string,
  q: string,
  opts?: WebSearchFetchOptions
): Promise<WebSearchResultItem[]> {
  const num = opts?.numResults ?? DEFAULT_WEB_SEARCH_NUM
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_WEB_SEARCH_TIMEOUT_MS
  const tag = opts?.logTag ?? '[web-search]'

  const url = new URL(BRAVE_SEARCH_URL)
  url.searchParams.set('q', q)
  url.searchParams.set('count', String(num))
  url.searchParams.set('text_decorations', 'false')

  const { signal: linked, abortLocal, cleanup } = linkAbortSignals(opts?.signal)
  const timeout = setTimeout(() => abortLocal(), timeoutMs)
  try {
    const res = await fetch(url.toString(), {
      signal: linked,
      headers: {
        Accept: 'application/json',
        'X-Subscription-Token': token,
      },
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.warn(`${tag} Brave HTTP ${res.status} q=${q.slice(0, 40)} ${body.slice(0, 80)}`)
      return []
    }
    const data = (await res.json()) as BraveWebSearchResponse
    const results = data.web?.results ?? []
    return results.map((r) =>
      normalizeWebSearchItem({
        title: r.title,
        url: r.url,
        snippet: r.description,
        hostname: r.meta_url?.hostname,
      })
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (!msg.toLowerCase().includes('abort')) {
      console.warn(`${tag} Brave fetch failed:`, msg.slice(0, 120))
    }
    return []
  } finally {
    clearTimeout(timeout)
    cleanup()
  }
}

/** 按当前环境变量对单条查询执行网页搜索 */
export async function fetchWebSearchItemsForQuery(
  q: string,
  opts?: WebSearchFetchOptions
): Promise<WebSearchResultItem[]> {
  const provider = resolveWebSearchProvider()
  if (!provider) return []

  const braveToken = getEffectiveBraveApiKey()
  const googleKey = process.env.GOOGLE_CSE_API_KEY?.trim()
  const googleCx = process.env.GOOGLE_CSE_CX?.trim()

  if (provider === 'brave' && braveToken) {
    return fetchBraveWebSearchItems(braveToken, q, opts)
  }
  if (provider === 'google' && googleKey && googleCx) {
    return fetchGoogleWebSearchItems(googleKey, googleCx, q, opts)
  }
  return []
}
