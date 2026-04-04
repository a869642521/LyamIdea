import { SupabaseClient } from '@supabase/supabase-js'
import type {
  Project,
  Pool,
  Idea,
  IdeaVersion,
  Job,
  ProjectDetail,
  PoolDetail,
  IdeaDetail,
} from '@/types'

// ─── Project ───────────────────────────────────────────────────────────────

export async function createProject(
  db: SupabaseClient,
  keyword: string
): Promise<Project> {
  const { data, error } = await db
    .from('projects')
    .insert({ keyword, status: 'pending', iteration: 0 })
    .select()
    .single()
  if (error) throw new Error(`createProject: ${error.message}`)
  return data
}

export async function updateProjectStatus(
  db: SupabaseClient,
  id: string,
  status: Project['status'],
  iteration?: number
) {
  const patch: Partial<Project> = { status }
  if (iteration !== undefined) patch.iteration = iteration
  const { error } = await db.from('projects').update(patch).eq('id', id)
  if (error) throw new Error(`updateProjectStatus: ${error.message}`)
}

export async function getProject(
  db: SupabaseClient,
  id: string
): Promise<Project | null> {
  const { data, error } = await db
    .from('projects')
    .select('*')
    .eq('id', id)
    .single()
  if (error) return null
  return data
}

export async function listProjects(db: SupabaseClient): Promise<Project[]> {
  const { data, error } = await db
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20)
  if (error) throw new Error(`listProjects: ${error.message}`)
  return data ?? []
}

// ─── Pool ──────────────────────────────────────────────────────────────────

export async function createPools(
  db: SupabaseClient,
  projectId: string,
  directions: string[]
): Promise<Pool[]> {
  const rows = directions.map((direction, i) => ({
    project_id: projectId,
    slot: i + 1,
    direction,
  }))
  const { data, error } = await db
    .from('pools')
    .insert(rows)
    .select()
  if (error) throw new Error(`createPools: ${error.message}`)
  return data ?? []
}

export async function getPoolsByProject(
  db: SupabaseClient,
  projectId: string
): Promise<Pool[]> {
  const { data, error } = await db
    .from('pools')
    .select('*')
    .eq('project_id', projectId)
    .order('slot')
  if (error) throw new Error(`getPoolsByProject: ${error.message}`)
  return data ?? []
}

// ─── Idea ──────────────────────────────────────────────────────────────────

export async function createIdeas(
  db: SupabaseClient,
  poolId: string,
  count = 12
): Promise<Idea[]> {
  const rows = Array.from({ length: count }, (_, i) => ({
    pool_id: poolId,
    slot: i + 1,
    total_score: 0,
    trend: 'same',
  }))
  const { data, error } = await db.from('ideas').insert(rows).select()
  if (error) throw new Error(`createIdeas: ${error.message}`)
  return data ?? []
}

export async function getIdeasByPool(
  db: SupabaseClient,
  poolId: string
): Promise<Idea[]> {
  const { data, error } = await db
    .from('ideas')
    .select('*')
    .eq('pool_id', poolId)
    .order('slot')
  if (error) throw new Error(`getIdeasByPool: ${error.message}`)
  return data ?? []
}

// ─── IdeaVersion ──────────────────────────────────────────────────────────

export interface VersionInput {
  idea_id: string
  iteration: number
  content: string
  score_innovation: number
  score_feasibility: number
  score_impact: number
  total_score: number
  ai_changes?: string | null
}

export async function insertIdeaVersions(
  db: SupabaseClient,
  versions: VersionInput[]
): Promise<IdeaVersion[]> {
  const { data, error } = await db
    .from('idea_versions')
    .insert(versions)
    .select()
  if (error) throw new Error(`insertIdeaVersions: ${error.message}`)
  return data ?? []
}

export async function getVersionsByIdea(
  db: SupabaseClient,
  ideaId: string
): Promise<IdeaVersion[]> {
  const { data, error } = await db
    .from('idea_versions')
    .select('*')
    .eq('idea_id', ideaId)
    .order('iteration')
  if (error) throw new Error(`getVersionsByIdea: ${error.message}`)
  return data ?? []
}

export async function getVersionsByPool(
  db: SupabaseClient,
  poolId: string
): Promise<IdeaVersion[]> {
  const { data, error } = await db
    .from('idea_versions')
    .select('*, ideas!inner(pool_id)')
    .eq('ideas.pool_id', poolId)
    .order('iteration')
  if (error) throw new Error(`getVersionsByPool: ${error.message}`)
  return data ?? []
}

// Update ideas after a version batch is inserted
export async function updateIdeasAfterIteration(
  db: SupabaseClient,
  updates: Array<{
    id: string
    current_version_id: string
    total_score: number
    trend: 'up' | 'down' | 'same'
  }>
) {
  // Supabase doesn't support bulk update with different values per row,
  // so we use individual upserts or a transaction-like approach via RPC.
  // For MVP, loop updates (36 ideas = 3 pools × 12 ideas, acceptable latency).
  for (const u of updates) {
    const { error } = await db
      .from('ideas')
      .update({
        current_version_id: u.current_version_id,
        total_score: u.total_score,
        trend: u.trend,
      })
      .eq('id', u.id)
    if (error) throw new Error(`updateIdea ${u.id}: ${error.message}`)
  }
}

// Recompute global ranks within a project across all pools
export async function recomputeRanks(
  db: SupabaseClient,
  projectId: string
) {
  const pools = await getPoolsByProject(db, projectId)
  const allIdeas: Array<{ id: string; total_score: number }> = []
  for (const pool of pools) {
    const ideas = await getIdeasByPool(db, pool.id)
    allIdeas.push(...ideas.map((i) => ({ id: i.id, total_score: i.total_score })))
  }
  allIdeas.sort((a, b) => b.total_score - a.total_score)
  for (let i = 0; i < allIdeas.length; i++) {
    await db.from('ideas').update({ rank: i + 1 }).eq('id', allIdeas[i].id)
  }
}

// ─── Job ──────────────────────────────────────────────────────────────────

export async function createJob(
  db: SupabaseClient,
  projectId: string,
  iteration: number
): Promise<Job> {
  const { data, error } = await db
    .from('jobs')
    .insert({ project_id: projectId, iteration, status: 'pending' })
    .select()
    .single()
  if (error) throw new Error(`createJob: ${error.message}`)
  return data
}

export async function updateJob(
  db: SupabaseClient,
  id: string,
  patch: Partial<Job>
) {
  const { error } = await db.from('jobs').update(patch).eq('id', id)
  if (error) throw new Error(`updateJob: ${error.message}`)
}

// ─── Full project read ────────────────────────────────────────────────────

export async function getProjectDetail(
  db: SupabaseClient,
  id: string
): Promise<ProjectDetail | null> {
  const project = await getProject(db, id)
  if (!project) return null

  const pools = await getPoolsByProject(db, id)
  const poolDetails: PoolDetail[] = []

  for (const pool of pools) {
    const ideas = await getIdeasByPool(db, pool.id)
    const ideaDetails: IdeaDetail[] = []

    for (const idea of ideas) {
      const versions = await getVersionsByIdea(db, idea.id)
      const currentVersion =
        versions.find((v) => v.id === idea.current_version_id) ??
        versions[versions.length - 1]
      ideaDetails.push({
        ...idea,
        current_version: currentVersion,
        versions,
      } as IdeaDetail)
    }

    poolDetails.push({ ...pool, ideas: ideaDetails })
  }

  return { ...project, pools: poolDetails }
}
