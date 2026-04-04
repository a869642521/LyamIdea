/**
 * 种子轮「证据直通车」：全局 E-ID、按槽分区、格式化投喂（与压缩简报解耦）。
 */

import type { SuperRecommendEvidenceItem, SuperRecommendEvidenceChannel } from './super-recommend-evidence'

export type SeedEvidenceRow = {
  eid: string
  item: SuperRecommendEvidenceItem
  channel: SuperRecommendEvidenceChannel
}

const COMPETITOR_HINT =
  /vs\.|versus|alternative to|compared to|comparison|review:|reddit.*or|chatgpt|claude|gemini|copilot|对比|竞品|替代|哪个好|更好|评测|横向/i

const TECH_BODY_HINT =
  /implementation|stack overflow|github|api key|sdk|library|npm|pip install|how to build|architecture|latency|token limit|报错|部署|开源|代码|repo|pull request|issue #/i

const REDDIT_EXCERPT_MAX = 1600
const DEFAULT_EXCERPT_MAX = 700
const MAX_ITEMS_PER_SLOT = 5
const MAX_BLOCK_CHARS = 3800

export function inferEvidenceChannel(it: SuperRecommendEvidenceItem): SuperRecommendEvidenceChannel {
  if (it.channel) return it.channel
  const u = (it.url || '').toLowerCase()
  if (u.includes('reddit.com')) return 'reddit'
  return 'web'
}

/** 稳定 E1..En（与单次 collect 顺序一致） */
export function assignGlobalEvidenceIds(items: SuperRecommendEvidenceItem[]): SeedEvidenceRow[] {
  return items.map((item, i) => ({
    eid: `E${i + 1}`,
    item,
    channel: inferEvidenceChannel(item),
  }))
}

function techHostOrHint(row: SeedEvidenceRow): boolean {
  const { url, title, snippet, source } = row.item
  const blob = `${url} ${source} ${title} ${snippet}`
  if (TECH_BODY_HINT.test(blob)) return true
  if (!url.startsWith('http')) return false
  try {
    const h = new URL(url).hostname.toLowerCase()
    return (
      /stackoverflow\.com|github\.com|news\.ycombinator\.com|medium\.com|dev\.to|hashnode\.|discuss\.|forum\.|^gist\.github\.com$/i.test(
        h
      ) || /reddit\.com\/r\/(programming|webdev|javascript|learnprogramming|coding)/i.test(url)
    )
  } catch {
    return false
  }
}

function competitorHint(row: SeedEvidenceRow): boolean {
  return COMPETITOR_HINT.test(`${row.item.title} ${row.item.snippet}`)
}

function redditScore(row: SeedEvidenceRow): number {
  return row.item.upvotes * 10 + row.item.snippet.length
}

/**
 * 将证据行映射到 Slot 1–9；不足时用剩余池回填。
 */
export function partitionEvidenceForSeed(allRows: SeedEvidenceRow[]): Map<number, SeedEvidenceRow[]> {
  const bySlot = new Map<number, SeedEvidenceRow[]>()
  const used = new Set<string>()

  const pick = (
    predicate: (r: SeedEvidenceRow) => boolean,
    n: number,
    sortFn?: (a: SeedEvidenceRow, b: SeedEvidenceRow) => number
  ): SeedEvidenceRow[] => {
    const cand = allRows.filter((r) => predicate(r) && !used.has(r.eid))
    if (sortFn) cand.sort(sortFn)
    const out = cand.slice(0, n)
    for (const r of out) used.add(r.eid)
    return out
  }

  const redditSort = (a: SeedEvidenceRow, b: SeedEvidenceRow) => redditScore(b) - redditScore(a)

  bySlot.set(1, pick((r) => r.channel === 'reddit', MAX_ITEMS_PER_SLOT, redditSort))
  bySlot.set(2, pick((r) => r.channel === 'reddit', MAX_ITEMS_PER_SLOT, redditSort))

  const compPick = (n: number) =>
    pick((r) => r.channel !== 'reddit' && competitorHint(r), n)
  let s3 = compPick(MAX_ITEMS_PER_SLOT)
  let s4 = compPick(MAX_ITEMS_PER_SLOT)
  if (s3.length === 0)
    s3 = pick((r) => r.channel !== 'reddit', MAX_ITEMS_PER_SLOT, redditSort)
  if (s4.length === 0)
    s4 = pick((r) => r.channel !== 'reddit', MAX_ITEMS_PER_SLOT, redditSort)
  bySlot.set(3, s3)
  bySlot.set(4, s4)

  const techPick = (n: number) =>
    pick((r) => r.channel !== 'reddit' && techHostOrHint(r), n)
  let s5 = techPick(MAX_ITEMS_PER_SLOT)
  let s6 = techPick(MAX_ITEMS_PER_SLOT)
  if (s5.length === 0) s5 = pick((r) => r.channel !== 'reddit', MAX_ITEMS_PER_SLOT, redditSort)
  if (s6.length === 0) s6 = pick((r) => r.channel !== 'reddit', MAX_ITEMS_PER_SLOT, redditSort)
  bySlot.set(5, s5)
  bySlot.set(6, s6)

  bySlot.set(7, pick(() => true, MAX_ITEMS_PER_SLOT, redditSort))
  bySlot.set(8, pick(() => true, MAX_ITEMS_PER_SLOT, (a, b) => redditScore(b) - redditScore(a)))

  const fringeSort = (a: SeedEvidenceRow, b: SeedEvidenceRow) => redditScore(a) - redditScore(b)
  bySlot.set(9, pick(() => true, MAX_ITEMS_PER_SLOT, fringeSort))

  for (let slot = 1; slot <= 9; slot++) {
    let rows = bySlot.get(slot) ?? []
    if (rows.length === 0) {
      const rem = allRows.filter((r) => !used.has(r.eid))
      const filler = rem.slice(0, MAX_ITEMS_PER_SLOT)
      for (const r of filler) used.add(r.eid)
      if (filler.length > 0) {
        rows = filler
      } else {
        rows = allRows.slice(0, Math.min(MAX_ITEMS_PER_SLOT, allRows.length))
      }
      bySlot.set(slot, rows)
    }
  }

  return bySlot
}

function excerptForRow(row: SeedEvidenceRow): string {
  const raw = (row.item.snippet || '').replace(/\s+/g, ' ').trim()
  const max = row.channel === 'reddit' ? REDDIT_EXCERPT_MAX : DEFAULT_EXCERPT_MAX
  if (raw.length <= max) return raw
  return `${raw.slice(0, max - 1)}…`
}

export function formatDirectEvidenceBlockForSlot(
  slot: number,
  rows: SeedEvidenceRow[],
  lang: 'zh' | 'en'
): string {
  if (rows.length === 0) return ''

  const head =
    lang === 'zh'
      ? `## 本分槽直连证据（Raw Evidence — 须优先据此构思，不得以简报替代）\n**允许引用的证据 ID（必须使用其一）：** ${rows.map((r) => `[${r.eid}]`).join('、')}\n`
      : `## Direct evidence for this slot (raw — prioritize over the brief)\n**Allowed evidence IDs (you MUST anchor to one):** ${rows.map((r) => `[${r.eid}]`).join(', ')}\n`

  const lines: string[] = [head]
  let total = head.length

  for (const row of rows) {
    const { eid, item } = row
    const urlLine = item.url?.trim()
      ? lang === 'zh'
        ? `链接：${item.url}`
        : `URL: ${item.url}`
      : lang === 'zh'
        ? '链接：（摘录无可用 R/X/FB permalink）'
        : 'URL: (no allowed permalink for this excerpt)'

    const chunk =
      lang === 'zh'
        ? `### [${eid}] ${item.title.slice(0, 200)}\n来源：${item.source || 'unknown'}｜赞：${item.upvotes}\n${urlLine}\n摘录：\n${excerptForRow(row)}\n`
        : `### [${eid}] ${item.title.slice(0, 200)}\nSource: ${item.source || 'unknown'} · ups: ${item.upvotes}\n${urlLine}\nExcerpt:\n${excerptForRow(row)}\n`

    if (total + chunk.length > MAX_BLOCK_CHARS) break
    lines.push(chunk)
    total += chunk.length
  }

  return lines.join('\n')
}

export type SeedDirectEvidenceContext = {
  blockBySlot: ReadonlyMap<number, string>
}

export function buildSeedDirectEvidenceContext(
  items: SuperRecommendEvidenceItem[],
  keyword: string
): SeedDirectEvidenceContext | null {
  if (items.length === 0) return null
  const lang = /[\u4e00-\u9fff]/.test(keyword) ? 'zh' : 'en'
  const rows = assignGlobalEvidenceIds(items)
  const bySlot = partitionEvidenceForSeed(rows)
  const blockBySlot = new Map<number, string>()
  for (let s = 1; s <= 9; s++) {
    const list = bySlot.get(s) ?? []
    blockBySlot.set(s, formatDirectEvidenceBlockForSlot(s, list, lang))
  }
  return { blockBySlot }
}
