/**
 * Mock AI adapter: returns deterministic fake data. No network/LLM.
 */
export interface SeedIdeaResult {
  slot: number
  content: string
  score_innovation: number
  score_feasibility: number
  score_impact: number
  total_score: number
}

export interface IterationIdeaResult {
  slot: number
  content: string
  score_innovation: number
  score_feasibility: number
  score_impact: number
  total_score: number
  ai_changes: string | null
}

function hash(str: string): number {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h)
}

function seededScore(seed: number, min: number, max: number): number {
  const x = Math.sin(seed) * 10000
  const t = x - Math.floor(x)
  return Math.floor(min + t * (max - min + 1))
}

export function generatePoolDirections(keyword: string): string[] {
  return [
    `${keyword} 核心主路径优化`,
    `${keyword} 关键场景延伸`,
    `${keyword} 配套能力与闭环`,
  ]
}

/**
 * 生成 3 个探索维度（固定产品导向维度，与关键词/方向无关）。
 * 每个维度对应 3 个 slot，共 9 个 slot。
 */
export function generatePoolLenses(_keyword: string, _direction: string, _description?: string, _researchBrief?: string): string[] {
  return [
    '产品立项',   // slots 1-3：问题界定、定位、为何做、范围与成功标准等立项要素
    '产品创新',   // slots 4-6：颠覆性功能或机制
    '落地可行性', // slots 7-9：实施路径、成本与资源约束
  ]
}

export function generateSeedIdeas(
  keyword: string,
  direction: string,
  attachmentContext?: string,
  description?: string,
  lenses?: string[]
): SeedIdeaResult[] {
  const baseSeed = hash(keyword + direction + (attachmentContext ?? '') + (description ?? ''))
  const results: SeedIdeaResult[] = []
  const hasAttachments = Boolean(attachmentContext?.trim())
  const hasDescription = Boolean(description?.trim())

  for (let slot = 1; slot <= 9; slot++) {
    const seed = baseSeed + slot * 31
    let innovation = Math.min(100, 50 + seededScore(seed, 0, 35))
    let feasibility = Math.min(100, 50 + seededScore(seed + 1, 0, 35))
    const impact = Math.min(100, 50 + seededScore(seed + 2, 0, 30))
    if (hasAttachments) innovation = Math.min(100, innovation + 5)
    if (hasDescription) feasibility = Math.min(100, feasibility + 4)
    const total_score = Math.round(innovation * 0.4 + feasibility * 0.4 + impact * 0.2)

    // 每个 slot 对应一个维度（slot 1-3 → lenses[0], slot 4-6 → lenses[1], slot 7-9 → lenses[2]）
    const lensIndex = Math.floor((slot - 1) / 3)
    const lensLabel = lenses?.[lensIndex] ? `【${lenses[lensIndex]}】` : `【${direction}】`

    const refAttachment = hasAttachments ? '，参考上传资料' : ''
    const refDesc = hasDescription ? `，结合「${description!.slice(0, 15)}」` : ''
    results.push({
      slot,
      content: `${lensLabel}视角：针对「${keyword}」${direction}方向的初步创意${refAttachment}${refDesc}，待发散探索。`,
      score_innovation: innovation,
      score_feasibility: feasibility,
      score_impact: impact,
      total_score,
    })
  }

  return results
}

export function runIterationForPool(
  keyword: string,
  direction: string,
  iteration: number,
  currentIdeas: Array<{
    slot: number
    content: string
    total_score: number
    score_innovation: number
    score_feasibility: number
    score_impact: number
  }>,
  feedbacks?: Record<number, string>,
  challengerSlots?: number[],
  top3Content?: string[],
  lenses?: string[],
  _researchBrief?: string,
  _description?: string
): IterationIdeaResult[] {
  const isChallenger = (slot: number) => challengerSlots?.includes(slot) && iteration >= 2

  return currentIdeas.map((idea) => {
    if (isChallenger(idea.slot)) {
      const geneHint = top3Content?.length
        ? `借鉴前三名方向（${top3Content[0]?.slice(0, 15)}…等），`
        : ''
      const innovation = Math.min(100, 60 + seededScore(hash(String(idea.slot + iteration)), 0, 25))
      const feasibility = Math.min(100, 58 + seededScore(hash(String(idea.slot + iteration + 1)), 0, 28))
      const impact = Math.min(100, 55 + seededScore(hash(String(idea.slot + iteration + 2)), 0, 25))
      const total_score = Math.round(innovation * 0.4 + feasibility * 0.4 + impact * 0.2)
      return {
        slot: idea.slot,
        content: `【重新挑战】${geneHint}针对 ${keyword} 的突围方案（第${iteration + 1}轮挑战版）。`,
        score_innovation: innovation,
        score_feasibility: feasibility,
        score_impact: impact,
        total_score,
        ai_changes: '末位淘汰机制触发，借鉴前三名方向重新生成并参与本轮竞争',
      }
    }

    const bump = 5 + (idea.slot % 11)
    let innovation = Math.min(100, idea.score_innovation + (idea.slot % 3 === 0 ? bump : Math.floor(bump / 2)))
    const feasibility = Math.min(100, idea.score_feasibility + (idea.slot % 2 === 0 ? Math.floor(bump / 2) : bump))
    const impact = Math.min(100, idea.score_impact + (idea.slot % 4 === 0 ? bump : 0))
    const userFb = feedbacks?.[idea.slot]
    if (userFb) {
      innovation = Math.min(100, innovation + 3)
    }
    const total_score = Math.round(innovation * 0.4 + feasibility * 0.4 + impact * 0.2)

    const aiChanges = userFb
      ? `【用户指导已采纳】${userFb.slice(0, 50)}${userFb.length > 50 ? '…' : ''}；强化表达与可行性，微调影响力维度`
      : '强化表达与可行性，微调影响力维度'

    // 剥离旧的「第N轮优化版」后缀，保留维度标签，追加新轮次标注
    const baseContent = (idea.content ?? '').replace(/（第\d+轮优化版）$/, '')
    const lensIndex = Math.floor((idea.slot - 1) / 3)
    const lensLabel = lenses?.[lensIndex]
    const iterLabel = userFb ? `（第${iteration + 1}轮·已纳入指导）` : `（第${iteration + 1}轮优化版）`
    const content = lensLabel && !baseContent.startsWith(`【${lensLabel}】`)
      ? `【${lensLabel}】${baseContent}${iterLabel}`
      : `${baseContent}${iterLabel}`

    return {
      slot: idea.slot,
      content,
      score_innovation: innovation,
      score_feasibility: feasibility,
      score_impact: impact,
      total_score,
      ai_changes: aiChanges,
    }
  })
}
