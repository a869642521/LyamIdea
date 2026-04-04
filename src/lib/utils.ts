import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** 根据池子 ID 哈希出稳定的颜色索引（跨页面、跨渲染顺序保持一致） */
export function poolColorIndex(poolId: string, numColors = 5): number {
  let h = 0
  for (const c of poolId) h = (h * 17 + c.charCodeAt(0)) | 0
  return Math.abs(h) % numColors
}

export function scoreColor(score: number): string {
  if (score >= 75) return 'text-emerald-400'
  if (score >= 50) return 'text-amber-400'
  return 'text-rose-400'
}

export function scoreBg(score: number): string {
  if (score >= 75) return 'bg-emerald-500/10 border-emerald-500/30'
  if (score >= 50) return 'bg-amber-500/10 border-amber-500/30'
  return 'bg-rose-500/10 border-rose-500/30'
}

export function scoreDot(score: number): string {
  if (score >= 75) return 'bg-emerald-500'
  if (score >= 50) return 'bg-amber-500'
  return 'bg-rose-500'
}

export function formatScore(score: number | null | undefined): string {
  if (score == null || !Number.isFinite(Number(score))) return '—'
  return Number(score).toFixed(0)
}

export function iterationLabel(iter: number): string {
  if (iter === 0) return '初始'
  return `第${iter}轮`
}

export function statusLabel(status: string): string {
  const map: Record<string, string> = {
    pending: '待开始',
    running: '进行中',
    done: '已完成',
    failed: '失败',
  }
  return map[status] ?? status
}

export function trendIcon(trend: string): string {
  if (trend === 'up') return '↑'
  if (trend === 'down') return '↓'
  return '—'
}

export function trendColor(trend: string): string {
  if (trend === 'up') return 'text-emerald-400'
  if (trend === 'down') return 'text-rose-400'
  return 'text-zinc-500'
}

/** 池子格子标题：仅取中文，长度限制在 3～7 字；不足时用格子序号或字库补足 */
const IDEA_CELL_SLOT_LABELS = [
  '第一格',
  '第二格',
  '第三格',
  '第四格',
  '第五格',
  '第六格',
  '第七格',
  '第八格',
  '第九格',
  '第十格',
  '第十一',
  '第十二',
] as const

const IDEA_CELL_PAD_POOL = '微巧新轻快灵变智创深浅宽窄远近虚实案型略点子路向'

/** 稳定正整数哈希（用于打字机节奏、格子种子等） */
export function hashSeed(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

export function ideaCellTitle(content: string, slot: number): string {
  const mdTitle = /^(?:#|##)\s+(.+)$/m.exec(content.trim())
  if (mdTitle) {
    const t = mdTitle[1].replace(/[*_`#]/g, '').trim()
    if (t.length >= 2) return t.slice(0, 10)
  }

  // 优先提取「书名号」内的显式标题（格式：「标题」正文）
  const bookTitle = /^「([^」]{1,12})」/.exec(content.trim())
  if (bookTitle) {
    const t = bookTitle[1].trim()
    if (t.length >= 2) return t.slice(0, 10)
  }

  const afterColon = content.split(/[：:]/)[1] ?? content
  const clean = afterColon.replace(/^[\s【】\d#·]+/, '').trim()
  const parts = clean.match(/[\u4e00-\u9fff]+/g)
  let chinese = parts ? parts.join('') : ''

  const slotSafe = Math.min(Math.max(slot, 1), 12)
  const fallback = IDEA_CELL_SLOT_LABELS[slotSafe - 1] ?? '创意格'

  if (chinese.length > 7) chinese = chinese.slice(0, 7)

  if (chinese.length >= 3) return chinese

  if (chinese.length === 0) return fallback

  const seed = hashSeed(`${clean}|${slot}`)
  let h = seed
  let i = 0
  while (chinese.length < 3 && i < 16) {
    chinese += IDEA_CELL_PAD_POOL[h % IDEA_CELL_PAD_POOL.length]!
    h = Math.floor(h / 5) + i
    i++
  }

  if (chinese.length > 7) chinese = chinese.slice(0, 7)
  return chinese
}

/**
 * 机器人打字机用：优先展示「定位」行内容（三段结构时），其次回退到正文第一句。
 */
export function ideaTypewriterBodyText(content: string, slot: number): string {
  const slotSafe = Math.min(Math.max(slot, 1), 12)
  const fallback = IDEA_CELL_SLOT_LABELS[slotSafe - 1] ?? '创意方案'

  if (!content) return fallback

  const summaryHeading = /^##?\s*(执行摘要|Executive Summary)[：:]?\s*$/im.exec(content)
  if (summaryHeading) {
    const after = content.slice(summaryHeading.index! + summaryHeading[0].length).trim()
    const firstLine = after.split('\n').find((line) => line.trim())?.trim()
    if (firstLine && firstLine.length >= 4) return firstLine.replace(/^[-*]\s*/, '')
  }

  // 去掉「标题」前缀，拿到正文部分
  let body = content.trim()
  const book = /^「[^」]+」\n?/u.exec(body)
  if (book) body = body.slice(book[0].length).trim()

  // 新三段结构：优先展示「定位：」行的内容（去掉"定位："标签本身）
  const posLine = /^定位[：:]\s*(.+)/m.exec(body)
  if (posLine && posLine[1].trim().length >= 4) {
    return posLine[1].trim()
  }

  // 洞察轮：产品原型断言（Assertion）
  const assertLine = /^产品原型断言（Assertion）[：:]\s*(.+)/m.exec(body)
  if (assertLine && assertLine[1].trim().length >= 4) {
    return assertLine[1].trim()
  }

  // 英文结构：Positioning: ...
  const posEn = /^Positioning[：:]\s*(.+)/im.exec(body)
  if (posEn && posEn[1].trim().length >= 4) {
    return posEn[1].trim()
  }

  const assertEn = /^Product Assertion[：:]\s*(.+)/im.exec(body)
  if (assertEn && assertEn[1].trim().length >= 4) {
    return assertEn[1].trim()
  }

  // 旧格式回退：取第一行或第一句
  const firstLine = body.split('\n')[0]?.trim() ?? ''
  const shortLabel = /^[^：:]{1,24}[：:]\s*(.+)$/u.exec(firstLine)
  if (shortLabel && shortLabel[1].trim().length >= 4) {
    return shortLabel[1].trim()
  }

  return (firstLine || body).replace(/\s+/g, ' ').trim() || fallback
}
