/**
 * Core iteration engine: orchestrates AI calls + DB writes for each pipeline step.
 * Used by API Route Handlers (server-side only).
 */
import { SupabaseClient } from '@supabase/supabase-js'
import {
  createPools,
  createIdeas,
  insertIdeaVersions,
  updateIdeasAfterIteration,
  recomputeRanks,
  updateProjectStatus,
  createJob,
  updateJob,
  getPoolsByProject,
  getIdeasByPool,
  getVersionsByIdea,
  VersionInput,
} from './db'
import {
  generatePoolDirections,
  generatePoolLenses,
  generateSeedIdeas,
  runIterationForPool,
} from './ai/adapter'
import type { Idea } from '@/types'

// ─── Phase 0: Seed initial ideas ─────────────────────────────────────────

export async function seedProject(
  db: SupabaseClient,
  projectId: string,
  keyword: string
): Promise<void> {
  await updateProjectStatus(db, projectId, 'running')

  // Step 1: Generate 3 pool directions
  const directions = await generatePoolDirections(keyword)
  const pools = await createPools(db, projectId, directions)

  // Step 2: For each pool, generate lenses + create idea slots + generate seed ideas
  for (const pool of pools) {
    const lenses = await generatePoolLenses(keyword, pool.direction)
    const ideas = await createIdeas(db, pool.id, 12)
    const seedResults = await generateSeedIdeas(keyword, pool.direction, lenses)

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

    const insertedVersions = await insertIdeaVersions(db, versions)

    // Point each idea to its initial version
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
    await updateIdeasAfterIteration(db, updates)
  }

  await recomputeRanks(db, projectId)
  await updateProjectStatus(db, projectId, 'done', 0)
}

// ─── Phase 1-3: Run one iteration ────────────────────────────────────────

export async function runIteration(
  db: SupabaseClient,
  projectId: string,
  keyword: string,
  iteration: number
): Promise<void> {
  const job = await createJob(db, projectId, iteration)
  await updateJob(db, job.id, { status: 'running', started_at: new Date().toISOString() })
  await updateProjectStatus(db, projectId, 'running')

  try {
    const pools = await getPoolsByProject(db, projectId)

    for (const pool of pools) {
      const ideas: Idea[] = await getIdeasByPool(db, pool.id)

      // Build current state for each idea
      const currentIdeaState = await Promise.all(
        ideas.map(async (idea) => {
          const versions = await getVersionsByIdea(db, idea.id)
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
      )

      // AI iteration (userFeedbacks indexed by slot, fetched from DB if available)
      const results = await runIterationForPool(
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
        undefined, // TODO: wire up real DB feedback when Supabase mode is active
        pool.lenses,
        undefined,
        pool.research_brief,
        pool.description
      )

      // Insert new versions
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
      const insertedVersions = await insertIdeaVersions(db, versions)

      // Update ideas with new scores + trend
      const updates = currentIdeaState.map((state) => {
        const newVersion = insertedVersions.find((v) => v.idea_id === state.ideaId)
        if (!newVersion) throw new Error(`Version not found for idea ${state.ideaId}`)
        const oldScore = state.total_score
        const newScore = newVersion.total_score
        const trend = newScore > oldScore ? 'up' : newScore < oldScore ? 'down' : 'same'
        return {
          id: state.ideaId,
          current_version_id: newVersion.id,
          total_score: newScore,
          trend: trend as 'up' | 'down' | 'same',
        }
      })
      await updateIdeasAfterIteration(db, updates)
    }

    await recomputeRanks(db, projectId)
    await updateProjectStatus(db, projectId, 'done', iteration)
    await updateJob(db, job.id, {
      status: 'done',
      finished_at: new Date().toISOString(),
    })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    await updateJob(db, job.id, {
      status: 'failed',
      error: errorMsg,
      finished_at: new Date().toISOString(),
      retry_count: job.retry_count + 1,
    })
    await updateProjectStatus(db, projectId, 'failed')
    throw err
  }
}
