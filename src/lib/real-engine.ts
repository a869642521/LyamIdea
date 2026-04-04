/**
 * 真实 LLM 引擎：使用 mock-store 持久化数据 + 真实 adapter 进行 AI 调用。
 * 当 useMock=false 时，pool API 路由调用此引擎以支持真实大模型（含多模型模式）。
 */
import * as store from './mock-store'
import type { VersionInput } from './db'
import {
  composeSeedResearchPackage,
  buildSeedDirectEvidenceContext,
  generatePoolLenses,
  generatePoolDirectionsAndLenses,
  generateAdversarialFocusQueries,
  generateSeedIdeas,
  runIterationForPool,
  runIterationPerSlotStream,
} from './ai/adapter'
import {
  initSlotStream,
  appendSlotDelta,
  markSlotDone,
  markSlotError,
  clearPoolStreamBuffer,
} from './iteration-stream-buffer'
import {
  buildInsightDigestForProposalFocus,
  fetchFocusRoundEvidence,
} from './ai/focus-round-evidence'
import { eligibleSlotsForFinalRound } from './final-round-eligible'

/** 每个 pool 的流缓冲清理定时器，防止同一 poolId 多次完成时定时器叠加 */
const cleanupTimers = new Map<string, ReturnType<typeof setTimeout>>()

function buildAttachmentContext(poolId: string): string | undefined {
  const attachments = store.getAttachmentsByPool(poolId)
  if (!attachments?.length) return undefined
  const parts = attachments.map((a) => {
    const header = `【${a.name}】`
    if (a.textContent?.trim()) return `${header}\n${a.textContent.trim().slice(0, 2000)}`
    return header
  })
  return parts.join('\n\n')
}

/** 真实 LLM 版种子生成：生成方向 + 维度 + 9 个种子创意 */
export async function seedPoolReal(
  poolId: string,
  keyword: string,
  description?: string,
  options?: { direction?: string; directions?: string[] }
): Promise<void> {
  const pool = store.getPool(poolId)
  if (!pool) throw new Error(`Pool ${poolId} not found`)
  const recovery = { status: pool.status, iteration: pool.iteration }
  store.updatePoolStatus(poolId, 'running')

  try {
    const attachmentContext = buildAttachmentContext(poolId)
    const desc = description ?? pool.description
    const pkg = await composeSeedResearchPackage(keyword, desc, attachmentContext)
    const researchBrief = pkg.researchBrief
    const directEvidence =
      process.env.SEED_DIRECT_EVIDENCE !== '0' && pkg.evidenceItems.length > 0
        ? buildSeedDirectEvidenceContext(pkg.evidenceItems, keyword)
        : null

    if (researchBrief) {
      console.log('[seed] research brief length:', researchBrief.length)
      store.updatePool(poolId, { research_brief: researchBrief })
    } else {
      store.updatePool(poolId, { research_brief: undefined })
    }

    let direction: string
    let lenses: string[]
    if (options?.direction != null) {
      direction = options.direction
      store.updatePool(poolId, {
        direction,
        ...(options.directions != null && { directions: options.directions }),
      })
      // 方向已指定，单独生成维度
      lenses = await generatePoolLenses(keyword, direction, desc, researchBrief)
    } else {
      // 合并调用：方向 + 维度一次 LLM 请求，减少 1 次 RTT
      const meta = await generatePoolDirectionsAndLenses(keyword, desc, researchBrief)
      direction = meta.directions[0]
      lenses = meta.lenses
      store.updatePool(poolId, { direction, directions: meta.directions })
    }
    store.updatePool(poolId, { lenses })

    const ideas = store.getIdeasByPool(poolId)

    // 逐 slot 回调：每生成一个创意立即写入 store，前端轮询可实时看到进度
    const handleSlotGenerated = (r: import('./ai/adapter').SeedIdeaResult) => {
      const idea = ideas.find((i) => i.slot === r.slot)
      if (!idea) return
      const [insertedVersion] = store.insertIdeaVersions([{
        idea_id: idea.id,
        iteration: 0,
        content: r.content,
        score_innovation: r.score_innovation,
        score_feasibility: r.score_feasibility,
        score_impact: r.score_impact,
        total_score: r.total_score,
        ai_changes: null,
      }])
      store.updateIdeasAfterIteration([{
        id: idea.id,
        current_version_id: insertedVersion.id,
        total_score: insertedVersion.total_score,
        trend: 'same' as const,
      }])
      store.recomputeRanksForPool(poolId)
    }

    // 传入 poolId 以支持多模型模式，同时传入附件上下文、描述和逐 slot 回调
    await generateSeedIdeas(
      keyword,
      direction,
      lenses,
      poolId,
      attachmentContext,
      desc,
      handleSlotGenerated,
      researchBrief,
      directEvidence ? { directEvidence } : undefined
    )

    store.recomputeRanksForPool(poolId)
    store.updatePoolStatus(poolId, 'done', 0)
    const poolAfter = store.getPool(poolId)
    if (poolAfter) {
      if (poolAfter.iteration_mode === 'confirm') {
        store.updatePool(poolId, { awaiting_round_confirm: true, next_iterate_at: undefined })
      } else if (poolAfter.iteration_mode === 'auto') {
        // 不设 5 分钟冷却：否则用户无法立刻点「进入第 1 轮迭代」（口语「第二轮」）。后续每轮迭代结束仍由 iteratePoolReal 写入 5 分钟间隔。
        store.updatePool(poolId, {
          awaiting_round_confirm: false,
          next_iterate_at: new Date(Date.now() - 1000).toISOString(),
        })
      } else {
        store.updatePool(poolId, { awaiting_round_confirm: false, next_iterate_at: undefined })
      }
    }
  } catch (err) {
    store.updatePoolStatus(poolId, recovery.status, recovery.iteration)
    throw err
  }
}

/**
 * 真实 LLM 版迭代：流式 per-slot 并行，每个 slot 完成后立即写库更新九宫格。
 * 由 iterate/route 通过 after() 在后台调用，不阻塞 HTTP 响应。
 */
export async function iteratePoolReal(
  poolId: string,
  keyword: string,
  iteration: number
): Promise<void> {
  const pool = store.getPool(poolId)
  if (!pool) throw new Error(`Pool ${poolId} not found`)
  const prevIteration = pool.iteration

  const ideas = store.getIdeasByPool(poolId)
  const currentIdeaState = ideas.map((idea) => {
    const versions = store.getVersionsByIdea(idea.id)
    const latest = versions[versions.length - 1]
    return {
      slot: idea.slot,
      ideaId: idea.id,
      content: latest?.content ?? '',
      total_score: latest?.total_score ?? 0,
      score_innovation: latest?.score_innovation ?? 0,
      score_feasibility: latest?.score_feasibility ?? 0,
      score_impact: latest?.score_impact ?? 0,
    }
  })

  const feedbacks = store.getFeedbacksByPool(poolId)

  const finalEligible =
    iteration === 2
      ? eligibleSlotsForFinalRound(currentIdeaState, pool.final_round_extra_slots)
      : null
  const finalEligibleSet = finalEligible ? new Set(finalEligible) : null

  // 第三轮：非入选格子直接沿用第二轮版本，不调用大模型、不建流
  if (iteration === 2 && finalEligibleSet) {
    const skipped = currentIdeaState.filter((s) => !finalEligibleSet.has(s.slot))
    for (const state of skipped) {
      const [insertedVersion] = store.insertIdeaVersions([{
        idea_id: state.ideaId,
        iteration,
        content: state.content,
        score_innovation: state.score_innovation,
        score_feasibility: state.score_feasibility,
        score_impact: state.score_impact,
        total_score: state.total_score,
        ai_changes: '本轮未参与深度方案生成（保留第二轮内容）',
      }])
      store.updateIdeasAfterIteration([{
        id: state.ideaId,
        current_version_id: insertedVersion.id,
        total_score: insertedVersion.total_score,
        trend: 'same' as const,
      }])
    }
    if (skipped.length) store.recomputeRanksForPool(poolId)
  }

  // 初始化流缓冲（仅本轮会实际调用 LLM 的格子）
  for (const s of currentIdeaState) {
    if (iteration === 2 && finalEligibleSet && !finalEligibleSet.has(s.slot)) continue
    initSlotStream(poolId, s.slot)
  }

  // 第2轮（Focus）：可选对抗检索词 + 并行网页搜索，失败不阻塞迭代
  let focusRoundEvidence: string | undefined
  if (iteration === 2) {
    try {
      const digest = buildInsightDigestForProposalFocus(
        currentIdeaState.map((s) => ({
          slot: s.slot,
          content: s.content,
          total_score: s.total_score,
        }))
      )
      let adversarial: string[] = []
      try {
        adversarial = await generateAdversarialFocusQueries({
          keyword,
          direction: pool.direction,
          insightDigest: digest,
        })
        if (adversarial.length) {
          console.log(`[iteratePoolReal] adversarial focus queries: ${adversarial.join(' | ')}`)
        }
      } catch (e) {
        console.warn('[iteratePoolReal] adversarial queries skipped:', e)
      }
      focusRoundEvidence =
        (await fetchFocusRoundEvidence(keyword, pool.direction, adversarial)) || undefined
      if (focusRoundEvidence) {
        console.log(`[iteratePoolReal] focus evidence fetched, length=${focusRoundEvidence.length}`)
      }
    } catch (e) {
      console.warn('[iteratePoolReal] focus evidence fetch failed (ignored):', e)
    }
  }

  try {
    const runSlotsOnly =
      iteration === 2 && finalEligible?.length ? finalEligible : undefined

    await runIterationPerSlotStream(
      keyword,
      pool.direction,
      iteration,
      currentIdeaState.map((s) => ({
        slot: s.slot,
        content: s.content,
        total_score: s.total_score,
        score_innovation: s.score_innovation,
        score_feasibility: s.score_feasibility,
        score_impact: s.score_impact,
      })),
      poolId,
      // onSlotDelta：写入流缓冲，SSE 订阅端会自动推送
      (slot, delta) => {
        appendSlotDelta(poolId, slot, delta)
      },
      // onSlotDone：解析完成，立即单格写库
      async (result) => {
        const state = currentIdeaState.find((s) => s.slot === result.slot)
        if (!state) {
          markSlotError(poolId, result.slot, `Slot ${result.slot} not found in pool`)
          return
        }
        const [insertedVersion] = store.insertIdeaVersions([{
          idea_id: state.ideaId,
          iteration,
          content: result.content,
          score_innovation: result.score_innovation,
          score_feasibility: result.score_feasibility,
          score_impact: result.score_impact,
          total_score: result.total_score,
          ai_changes: result.ai_changes,
        }])
        const oldScore = state.total_score
        const trend =
          insertedVersion.total_score > oldScore ? 'up' :
          insertedVersion.total_score < oldScore ? 'down' : 'same'
        store.updateIdeasAfterIteration([{
          id: state.ideaId,
          current_version_id: insertedVersion.id,
          total_score: insertedVersion.total_score,
          trend: trend as 'up' | 'down' | 'same',
        }])
        store.recomputeRanksForPool(poolId)
        markSlotDone(poolId, result.slot)
      },
      // onSlotError：标记该 slot 出错，保留旧内容（不写库）
      (slot, reason) => {
        console.error(`[iteratePoolReal] slot ${slot} failed:`, reason)
        markSlotError(poolId, slot, reason)
      },
      {
        userFeedbacks: feedbacks,
        lenses: pool.lenses,
        researchBrief: pool.research_brief,
        description: pool.description,
        focusRoundEvidence,
        runSlotsOnly,
      }
    )

    store.clearFeedbacksByPool(poolId)
    store.updatePoolStatus(poolId, 'done', iteration)
    if (iteration === 2) {
      store.updatePool(poolId, { final_round_extra_slots: undefined })
    }

    if (iteration < store.MAX_ITERATIONS) {
      const poolAfter = store.getPool(poolId)
      if (poolAfter?.iteration_mode === 'confirm') {
        store.updatePool(poolId, { awaiting_round_confirm: true, next_iterate_at: undefined })
      } else {
        const nextAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()
        store.updatePool(poolId, { next_iterate_at: nextAt })
      }
    } else {
      store.updatePool(poolId, { next_iterate_at: undefined, awaiting_round_confirm: false })
    }
  } catch (err) {
    store.updatePoolStatus(poolId, 'done', prevIteration)
    throw err
  } finally {
    // 延迟清理缓冲，给 SSE 订阅者一点时间读到 done 事件
    // 先清除该 pool 上一轮遗留的定时器，防止短时间内多次迭代导致定时器叠加
    const prev = cleanupTimers.get(poolId)
    if (prev != null) clearTimeout(prev)
    const t = setTimeout(() => {
      clearPoolStreamBuffer(poolId)
      cleanupTimers.delete(poolId)
    }, 30_000)
    cleanupTimers.set(poolId, t)
  }
}

/** 真实 LLM 版方向切换：切换到新方向并重新生成种子创意 */
export async function changeDirectionReal(
  poolId: string,
  keyword: string,
  direction: string,
  directions: string[],
  description?: string
): Promise<void> {
  await seedPoolReal(poolId, keyword, description, { direction, directions })
}
