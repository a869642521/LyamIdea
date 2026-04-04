/**
 * Mock iteration engine: uses mock-store + mock-adapter. No Supabase/LLM.
 */
import * as store from './mock-store'
import { eligibleSlotsForFinalRound } from './final-round-eligible'
import type { VersionInput } from './db'
import {
  generatePoolDirections,
  generatePoolLenses,
  generateSeedIdeas,
  runIterationForPool,
} from './ai/mock-adapter'

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

/** Seed a single standalone pool: 1 direction + 9 ideas. 可选 override 用于切换方向时保留原 3 个候选。 */
export function seedPool(
  poolId: string,
  keyword: string,
  description?: string,
  options?: { direction?: string; directions?: string[] }
): void {
  const pool = store.getPool(poolId)
  if (!pool) throw new Error(`Pool ${poolId} not found`)
  const recovery = { status: pool.status, iteration: pool.iteration }
  store.updatePoolStatus(poolId, 'running')

  try {
    let direction: string
    if (options?.direction != null) {
      direction = options.direction
      store.updatePool(poolId, {
        direction,
        ...(options.directions != null && { directions: options.directions }),
      })
    } else {
      const directions = generatePoolDirections(keyword)
      direction = directions[0]
      store.updatePool(poolId, { direction, directions })
    }

    // 生成探索维度（3条），贯穿整个迭代周期
    const lenses = generatePoolLenses(keyword, direction, description ?? pool.description)
    store.updatePool(poolId, { lenses })

    const attachmentContext = buildAttachmentContext(poolId)
    const ideas = store.getIdeasByPool(poolId)
    const seedResults = generateSeedIdeas(keyword, direction, attachmentContext, description ?? pool.description, lenses)

    const versions: VersionInput[] = seedResults.map((r) => {
      const idea = ideas.find((i) => i.slot === r.slot)
      if (!idea) throw new Error(`Idea slot ${r.slot} not found in pool`)
      return {
        idea_id: idea.id,
        iteration: 0,
        content: r.content,
        score_innovation: r.score_innovation,
        score_feasibility: r.score_feasibility,
        score_impact: r.score_impact,
        total_score: r.total_score,
        ai_changes: null,
      }
    })

    const insertedVersions = store.insertIdeaVersions(versions)
    const updates = ideas.map((idea) => {
      const version = insertedVersions.find((v) => v.idea_id === idea.id)
      if (!version) throw new Error(`Version not found for idea ${idea.id}`)
      return {
        id: idea.id,
        current_version_id: version.id,
        total_score: version.total_score,
        trend: 'same' as const,
      }
    })
    store.updateIdeasAfterIteration(updates)
    store.recomputeRanksForPool(poolId)
    store.updatePoolStatus(poolId, 'done', 0)
    const poolAfter = store.getPool(poolId)
    if (poolAfter) {
      if (poolAfter.iteration_mode === 'confirm') {
        store.updatePool(poolId, { awaiting_round_confirm: true, next_iterate_at: undefined })
      } else if (poolAfter.iteration_mode === 'auto') {
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

/** Run one iteration for a single pool. */
export function iteratePool(poolId: string, keyword: string, iteration: number): void {
  const pool = store.getPool(poolId)
  if (!pool) throw new Error(`Pool ${poolId} not found`)
  const prevIteration = pool.iteration
  store.updatePoolStatus(poolId, 'running')

  try {
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
    const sortedByScore = [...currentIdeaState].sort((a, b) => b.total_score - a.total_score)
    const challengerSlots =
      iteration >= 2 ? sortedByScore.slice(-3).map((s) => s.slot) : undefined
    const top3Content =
      iteration >= 2 && challengerSlots?.length
        ? sortedByScore.slice(0, 3).map((s) => s.content)
        : undefined

    const results = runIterationForPool(
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
      feedbacks,
      challengerSlots,
      top3Content,
      pool.lenses,
      pool.research_brief,
      pool.description
    )

    const finalEligibleSet =
      iteration === 2
        ? new Set(eligibleSlotsForFinalRound(currentIdeaState, pool.final_round_extra_slots))
        : null

    const versions: VersionInput[] = results.map((r) => {
      const state = currentIdeaState.find((s) => s.slot === r.slot)
      if (!state) throw new Error(`Slot ${r.slot} not found`)
      if (finalEligibleSet && !finalEligibleSet.has(r.slot)) {
        return {
          idea_id: state.ideaId,
          iteration,
          content: state.content,
          score_innovation: state.score_innovation,
          score_feasibility: state.score_feasibility,
          score_impact: state.score_impact,
          total_score: state.total_score,
          ai_changes: '本轮未参与深度方案生成（保留第二轮内容）',
        }
      }
      return {
        idea_id: state.ideaId,
        iteration,
        content: r.content,
        score_innovation: r.score_innovation,
        score_feasibility: r.score_feasibility,
        score_impact: r.score_impact,
        total_score: r.total_score,
        ai_changes: r.ai_changes,
      }
    })
    const insertedVersions = store.insertIdeaVersions(versions)
    const updates = currentIdeaState.map((state) => {
      const newVersion = insertedVersions.find((v) => v.idea_id === state.ideaId)
      if (!newVersion) throw new Error(`Version not found for idea ${state.ideaId}`)
      const trend =
        newVersion.total_score > state.total_score
          ? 'up'
          : newVersion.total_score < state.total_score
          ? 'down'
          : 'same'
      return {
        id: state.ideaId,
        current_version_id: newVersion.id,
        total_score: newVersion.total_score,
        trend: trend as 'up' | 'down' | 'same',
      }
    })
    store.updateIdeasAfterIteration(updates)
    store.recomputeRanksForPool(poolId)
    store.clearFeedbacksByPool(poolId)
    store.updatePoolStatus(poolId, 'done', iteration)
    if (iteration < store.MAX_ITERATIONS) {
      const poolAfter = store.getPool(poolId)
      if (poolAfter?.iteration_mode === 'confirm') {
        store.updatePool(poolId, { awaiting_round_confirm: true, next_iterate_at: undefined })
      } else {
        const nextAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()
        store.updatePool(poolId, { next_iterate_at: nextAt })
      }
    } else {
      store.updatePool(poolId, {
        next_iterate_at: undefined,
        awaiting_round_confirm: false,
        final_round_extra_slots: undefined,
      })
    }
  } catch (err) {
    store.updatePoolStatus(poolId, 'done', prevIteration)
    throw err
  }
}

export function seedProject(projectId: string, keyword: string): void {
  store.updateProjectStatus(projectId, 'running')

  const directions = generatePoolDirections(keyword)
  const pools = store.createPools(projectId, directions)

  for (const pool of pools) {
    const ideas = store.createIdeas(pool.id, 9)
    const seedResults = generateSeedIdeas(keyword, pool.direction)

    const versions: VersionInput[] = seedResults.map((r) => {
      const idea = ideas.find((i) => i.slot === r.slot)
      if (!idea) throw new Error(`Idea slot ${r.slot} not found in pool`)
      return {
        idea_id: idea.id,
        iteration: 0,
        content: r.content,
        score_innovation: r.score_innovation,
        score_feasibility: r.score_feasibility,
        score_impact: r.score_impact,
        total_score: r.total_score,
        ai_changes: null,
      }
    })

    const insertedVersions = store.insertIdeaVersions(versions)

    const updates = ideas.map((idea) => {
      const version = insertedVersions.find((v) => v.idea_id === idea.id)
      if (!version) throw new Error(`Version not found for idea ${idea.id}`)
      return {
        id: idea.id,
        current_version_id: version.id,
        total_score: version.total_score,
        trend: 'same' as const,
      }
    })
    store.updateIdeasAfterIteration(updates)
  }

  store.recomputeRanks(projectId)
  store.updateProjectStatus(projectId, 'done', 0)
}

export function runIteration(projectId: string, keyword: string, iteration: number): void {
  const job = store.createJob(projectId, iteration)
  store.updateJob(job.id, { status: 'running', started_at: new Date().toISOString() })
  store.updateProjectStatus(projectId, 'running')

  try {
    const pools = store.getPoolsByProject(projectId)

    for (const pool of pools) {
      const ideas = store.getIdeasByPool(pool.id)

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

      const results = runIterationForPool(
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
        undefined,
        undefined,
        undefined,
        pool.lenses,
        pool.research_brief,
        pool.description
      )

      const versions: VersionInput[] = results.map((r) => {
        const state = currentIdeaState.find((s) => s.slot === r.slot)
        if (!state) throw new Error(`Slot ${r.slot} not found`)
        return {
          idea_id: state.ideaId,
          iteration,
          content: r.content,
          score_innovation: r.score_innovation,
          score_feasibility: r.score_feasibility,
          score_impact: r.score_impact,
          total_score: r.total_score,
          ai_changes: r.ai_changes,
        }
      })
      const insertedVersions = store.insertIdeaVersions(versions)

      const updates = currentIdeaState.map((state) => {
        const newVersion = insertedVersions.find((v) => v.idea_id === state.ideaId)
        if (!newVersion) throw new Error(`Version not found for idea ${state.ideaId}`)
        const trend =
          newVersion.total_score > state.total_score
            ? 'up'
            : newVersion.total_score < state.total_score
            ? 'down'
            : 'same'
        return {
          id: state.ideaId,
          current_version_id: newVersion.id,
          total_score: newVersion.total_score,
          trend: trend as 'up' | 'down' | 'same',
        }
      })
      store.updateIdeasAfterIteration(updates)
    }

    store.recomputeRanks(projectId)
    store.updateProjectStatus(projectId, 'done', iteration)
    store.updateJob(job.id, { status: 'done', finished_at: new Date().toISOString() })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    store.updateJob(job.id, {
      status: 'failed',
      error: errorMsg,
      finished_at: new Date().toISOString(),
      retry_count: job.retry_count + 1,
    })
    store.updateProjectStatus(projectId, 'failed')
    throw err
  }
}
