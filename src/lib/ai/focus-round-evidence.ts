/**
 * 第二轮（iteration === 2）「聚焦轮外部证据」检索。
 * 网页搜索实现见 `search/web-search-client.ts`（Brave / Google 共用）。
 *
 * 环境变量与选择逻辑与 `resolveWebSearchProvider()` 一致。
 * 无可用配置或失败时静默返回空字符串，不阻塞迭代。
 */

import { getEffectiveBraveApiKey } from '@/lib/web-search-config'
import type { WebSearchResultItem } from './search/web-search-client'
import {
  fetchBraveWebSearchItems,
  fetchGoogleWebSearchItems,
  resolveWebSearchProvider,
} from './search/web-search-client'

/** 合并检索后的总长度上限（含对抗检索时略增） */
const MAX_CAP_CHARS = 3600

/** 方案报告轮前：取高分格洞察正文摘要，供生成对抗性检索词 */
export function buildInsightDigestForProposalFocus(
  ideas: Array<{ slot: number; content: string; total_score: number }>,
  topN = 4,
  maxCharsPerSlot = 450
): string {
  if (!ideas.length) return ''
  const sorted = [...ideas].sort((a, b) => b.total_score - a.total_score)
  const parts: string[] = []
  for (const s of sorted.slice(0, topN)) {
    const c = (s.content ?? '').replace(/\s+/g, ' ').trim()
    if (!c) continue
    const snip = c.length > maxCharsPerSlot ? `${c.slice(0, maxCharsPerSlot)}…` : c
    parts.push(`[Slot ${s.slot}]\n${snip}`)
  }
  return parts.join('\n\n')
}

function formatEvidenceBlock(titleLine: string, items: WebSearchResultItem[]): string {
  if (!items.length) return ''
  const lines: string[] = [titleLine, '']
  for (const item of items) {
    const t = item.title.trim() || '(no title)'
    const snippet = item.snippet.slice(0, 200)
    const link = item.link.trim()
    const domain = item.displayLink.trim()
    lines.push(`- **${t}** (${domain})`)
    if (snippet) lines.push(`  ${snippet}`)
    if (link) lines.push(`  ${link}`)
  }
  return lines.join('\n')
}

/**
 * 并行检索：① 主题+方向 ② 竞品/替代 ③ 可选对抗性检索词（各最多 3 条），合并去重后返回 Markdown。
 * @returns Markdown 字符串（最多约 MAX_CAP_CHARS 字符），无证据时返回 ''
 */
export async function fetchFocusRoundEvidence(
  keyword: string,
  direction: string,
  adversarialQueries?: string[]
): Promise<string> {
  const provider = resolveWebSearchProvider()
  if (!provider) return ''

  const braveToken = getEffectiveBraveApiKey()
  const googleKey = process.env.GOOGLE_CSE_API_KEY?.trim()
  const googleCx = process.env.GOOGLE_CSE_CX?.trim()

  if (provider === 'brave' && !braveToken) {
    console.warn('[focus-evidence] FOCUS_EVIDENCE_PROVIDER=brave but BRAVE_SEARCH_API_KEY missing')
    return ''
  }
  if (provider === 'google' && (!googleKey || !googleCx)) {
    console.warn('[focus-evidence] FOCUS_EVIDENCE_PROVIDER=google but Google CSE env incomplete')
    return ''
  }

  const q1 = `${keyword} ${direction}`.slice(0, 200)
  const q2 = `${keyword} 竞品 对比 alternative vs`.slice(0, 200)
  const extra = (adversarialQueries ?? [])
    .map((q) => q.trim().slice(0, 200))
    .filter(Boolean)
    .slice(0, 3)

  const allQueries = [q1, q2, ...extra]

  const fetchOne = (q: string) =>
    provider === 'brave'
      ? fetchBraveWebSearchItems(braveToken!, q, { logTag: '[focus-evidence]' })
      : fetchGoogleWebSearchItems(googleKey!, googleCx!, q, { logTag: '[focus-evidence]' })

  const batchResults = await Promise.all(allQueries.map((q) => fetchOne(q)))

  const seen = new Set<string>()
  const merged: WebSearchResultItem[] = []
  for (const items of batchResults) {
    for (const it of items) {
      const link = it.link?.trim() || ''
      const key = link || `${it.title}@${it.displayLink}`
      if (seen.has(key)) continue
      seen.add(key)
      merged.push(it)
      if (merged.length >= 14) break
    }
    if (merged.length >= 14) break
  }

  if (!merged.length) return ''

  const sourceLabel = provider === 'brave' ? 'Brave Search' : 'Google 搜索'
  const advNote = extra.length ? '；含对抗性检索' : ''
  const header = `**${sourceLabel} 证据（${keyword} · ${direction}；主题+竞品/替代合并去重${advNote}）**`
  const raw = formatEvidenceBlock(header, merged)
  return raw.length > MAX_CAP_CHARS ? raw.slice(0, MAX_CAP_CHARS) + '\n…（已截断）' : raw
}
