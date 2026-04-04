/**
 * In-memory store for Mock mode. No Supabase/network. Sync API.
 */
import type {
  Project,
  Pool,
  Idea,
  IdeaVersion,
  Job,
  ProjectDetail,
  PoolDetail,
  IdeaDetail,
  Attachment,
  FeedbackEntry,
} from '@/types'
import type { VersionInput } from './db'

function uid(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `mock-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
}

function now(): string {
  return new Date().toISOString()
}

// 挂载到 globalThis，防止 Next.js HMR 热重载时清空内存数据
declare global {
  // eslint-disable-next-line no-var
  var __mock_store: {
    projects: Project[]
    pools: Pool[]
    ideas: Idea[]
    ideaVersions: IdeaVersion[]
    jobs: Job[]
    feedbacks: Map<string, string>
    /** ideaId -> 提交反馈时池子的 iteration（已完成轮数） */
    feedbackIterations: Map<string, number>
    /** ideaId -> 按轮次永久保留的历史指导列表（不随迭代清空） */
    feedbackHistories: Map<string, FeedbackEntry[]>
    attachments: Map<string, Attachment[]>
    /** ideaId -> 已点赞的 UI 轮次（1–3），每轮 +3 分叠加在 idea.total_score 上 */
    ideaRoundLikes: Map<string, Set<number>>
  } | undefined
}

if (!globalThis.__mock_store) {
  globalThis.__mock_store = {
    projects: [],
    pools: [],
    ideas: [],
    ideaVersions: [],
    jobs: [],
    feedbacks: new Map(),
    feedbackIterations: new Map(),
    feedbackHistories: new Map(),
    attachments: new Map(),
    ideaRoundLikes: new Map(),
  }
}

const store = globalThis.__mock_store
if (!store.feedbackIterations) {
  store.feedbackIterations = new Map()
}
if (!store.feedbackHistories) {
  store.feedbackHistories = new Map()
}
if (!store.ideaRoundLikes) {
  store.ideaRoundLikes = new Map()
}
const projects = store.projects
const pools = store.pools
const ideas = store.ideas
const ideaVersions = store.ideaVersions
const jobs = store.jobs
const feedbacks = store.feedbacks
const feedbackIterations = store.feedbackIterations
const feedbackHistories: Map<string, FeedbackEntry[]> = store.feedbackHistories
const ideaRoundLikes: Map<string, Set<number>> = store.ideaRoundLikes
const attachmentsByPool: Map<string, Attachment[]> = store.attachments ?? (store.attachments = new Map())

export const MAX_ITERATIONS = 2

// ─── Project ───────────────────────────────────────────────────────────────

export function createProject(keyword: string): Project {
  const project: Project = {
    id: uid(),
    keyword,
    status: 'pending',
    iteration: 0,
    created_at: now(),
    updated_at: now(),
  }
  projects.push(project)
  return project
}

export function updateProjectStatus(
  id: string,
  status: Project['status'],
  iteration?: number
): void {
  const p = projects.find((x) => x.id === id)
  if (p) {
    p.status = status
    if (iteration !== undefined) p.iteration = iteration
    p.updated_at = now()
  }
}

export function getProject(id: string): Project | null {
  return projects.find((x) => x.id === id) ?? null
}

export function listProjects(): Project[] {
  return [...projects].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  ).slice(0, 20)
}

// ─── Pool ──────────────────────────────────────────────────────────────────

export function createPools(projectId: string, directions: string[]): Pool[] {
  const created: Pool[] = directions.map((direction, i) => ({
    id: uid(),
    project_id: projectId,
    slot: i + 1,
    direction,
    keyword: '',
    status: 'done' as const,
    iteration: 0,
    created_at: now(),
    updated_at: now(),
  }))
  pools.push(...created)
  return created
}

/** Create a single standalone pool (no project). Pool is top-level entity. */
export function createStandalonePool(keyword: string, poolAttachments?: Attachment[], description?: string, iterationMode?: 'auto' | 'manual' | 'confirm'): Pool {
  const id = uid()
  const mode = iterationMode ?? 'confirm'
  const nextIterateAt =
    mode === 'auto' ? new Date(Date.now() + 5 * 60 * 1000).toISOString() : undefined
  const pool: Pool = {
    id,
    project_id: id,
    slot: 1,
    direction: '',
    keyword,
    status: 'pending',
    iteration: 0,
    created_at: now(),
    updated_at: now(),
    next_iterate_at: nextIterateAt,
    ...(poolAttachments?.length ? { attachments: poolAttachments } : {}),
    ...(description ? { description } : {}),
    iteration_mode: mode,
  }
  pools.push(pool)
  if (poolAttachments?.length) {
    attachmentsByPool.set(pool.id, poolAttachments)
  }
  createIdeas(pool.id, 9)
  return pool
}

export function getAttachmentsByPool(poolId: string): Attachment[] | undefined {
  return attachmentsByPool.get(poolId)
}

/** 更新池子附件（覆盖），下一轮迭代时作为题目资料 */
export function updatePoolAttachments(poolId: string, nextAttachments: Attachment[]): void {
  const p = pools.find((x) => x.id === poolId)
  if (p) {
    p.attachments = nextAttachments.length ? nextAttachments : undefined
    if (nextAttachments.length) attachmentsByPool.set(poolId, nextAttachments)
    else attachmentsByPool.delete(poolId)
    p.updated_at = now()
  }
}

/** 更新池子的项目细节描述 */
export function updatePoolDescription(poolId: string, description: string): void {
  const p = pools.find((x) => x.id === poolId)
  if (p) {
    p.description = description.trim() || undefined
    p.updated_at = now()
  }
}

/** 删除池子及其关联的 ideas、versions、feedbacks、attachments */
export function deletePool(poolId: string): void {
  const ideaIds = new Set(ideas.filter((i) => i.pool_id === poolId).map((i) => i.id))
  for (const id of ideaIds) {
    feedbacks.delete(id)
    feedbackHistories.delete(id)
    ideaRoundLikes.delete(id)
  }
  const newIdeas = ideas.filter((i) => i.pool_id !== poolId)
  const newVersions = ideaVersions.filter((v) => !ideaIds.has(v.idea_id))
  ideas.length = 0
  ideas.push(...newIdeas)
  ideaVersions.length = 0
  ideaVersions.push(...newVersions)
  attachmentsByPool.delete(poolId)
  const idx = pools.findIndex((p) => p.id === poolId)
  if (idx !== -1) pools.splice(idx, 1)
}

export function getPool(id: string): Pool | null {
  return pools.find((x) => x.id === id) ?? null
}

export function updatePool(
  id: string,
  patch: Partial<
    Pick<
      Pool,
      | 'direction'
      | 'directions'
      | 'lenses'
      | 'status'
      | 'iteration'
      | 'updated_at'
      | 'next_iterate_at'
      | 'awaiting_round_confirm'
      | 'research_brief'
      | 'description'
      | 'final_round_extra_slots'
    >
  >
): void {
  const p = pools.find((x) => x.id === id)
  if (p) {
    if (patch.direction !== undefined) p.direction = patch.direction
    if (patch.directions !== undefined) p.directions = patch.directions
    if (patch.lenses !== undefined) p.lenses = patch.lenses
    if (patch.status !== undefined) p.status = patch.status
    if (patch.iteration !== undefined) p.iteration = patch.iteration
    if (patch.next_iterate_at !== undefined) p.next_iterate_at = patch.next_iterate_at
    if (patch.awaiting_round_confirm !== undefined) p.awaiting_round_confirm = patch.awaiting_round_confirm
    if ('research_brief' in patch) p.research_brief = patch.research_brief
    if (patch.description !== undefined) p.description = patch.description
    if ('final_round_extra_slots' in patch) p.final_round_extra_slots = patch.final_round_extra_slots
    p.updated_at = now()
  }
}

/** 第二轮结束后用户勾选「带入第三轮」的额外格子；自动去重、限制 1–9 */
export function setFinalRoundExtraSlots(poolId: string, slots: number[]): void {
  const p = pools.find((x) => x.id === poolId)
  if (!p) return
  const seen = new Set<number>()
  const out: number[] = []
  for (const raw of slots) {
    const s = Math.floor(Number(raw))
    if (!Number.isFinite(s) || s < 1 || s > 9 || seen.has(s)) continue
    seen.add(s)
    out.push(s)
  }
  out.sort((a, b) => a - b)
  p.final_round_extra_slots = out.length ? out : undefined
  p.updated_at = now()
}

export function updatePoolStatus(
  id: string,
  status: Pool['status'],
  iteration?: number
): void {
  const p = pools.find((x) => x.id === id)
  if (p) {
    p.status = status
    if (iteration !== undefined) p.iteration = iteration
    // 非 failed 状态时清除之前记录的错误信息
    if (status !== 'failed') p.error_message = undefined
    p.updated_at = now()
  }
}

/** 将池子标记为 failed 并存储错误信息，供前端展示错误提示与重试入口 */
export function updatePoolStatusWithError(id: string, errorMessage: string): void {
  const p = pools.find((x) => x.id === id)
  if (p) {
    p.status = 'failed'
    p.error_message = errorMessage
    p.updated_at = now()
  }
}

/** List all pools as PoolDetail[], newest first. For pool-centric homepage. */
export function listAllPools(): PoolDetail[] {
  const sorted = [...pools].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )
  return sorted.map((pool) => getPoolDetail(pool.id)!).filter(Boolean)
}

const emptyVersionPlaceholder: IdeaVersion = {
  id: '',
  idea_id: '',
  iteration: 0,
  content: '',
  score_innovation: 0,
  score_feasibility: 0,
  score_impact: 0,
  total_score: 0,
  ai_changes: null,
  created_at: now(),
}

export function getPoolDetail(id: string): PoolDetail | null {
  const pool = pools.find((x) => x.id === id)
  if (!pool) return null
  const poolIdeas = getIdeasByPool(pool.id)
  const ideaDetails: IdeaDetail[] = poolIdeas.map((idea) => {
    const versions = getVersionsByIdea(idea.id)
    const currentVersion =
      versions.find((v) => v.id === idea.current_version_id) ?? versions[versions.length - 1] ?? emptyVersionPlaceholder
    const user_feedback = feedbacks.get(idea.id) ?? undefined
    const user_feedback_at_iteration = feedbackIterations.get(idea.id)
    const feedbackHistory = feedbackHistories.get(idea.id) ?? []
    return {
      ...idea,
      liked_rounds: [...(ideaRoundLikes.get(idea.id) ?? [])].sort((a, b) => a - b),
      user_feedback,
      ...(user_feedback_at_iteration !== undefined && { user_feedback_at_iteration }),
      feedbackHistory,
      current_version: currentVersion,
      versions,
    } as IdeaDetail
  })
  return { ...pool, ideas: ideaDetails }
}

export function getPoolsByProject(projectId: string): Pool[] {
  return [...pools].filter((x) => x.project_id === projectId).sort((a, b) => a.slot - b.slot)
}

// ─── Idea ──────────────────────────────────────────────────────────────────

export function createIdeas(poolId: string, count = 9): Idea[] {
  const created: Idea[] = Array.from({ length: count }, (_, i) => ({
    id: uid(),
    pool_id: poolId,
    slot: i + 1,
    current_version_id: null,
    total_score: 0,
    rank: null,
    trend: 'same',
    created_at: now(),
    updated_at: now(),
  }))
  ideas.push(...created)
  return created
}

export function getIdeasByPool(poolId: string): Idea[] {
  return [...ideas].filter((x) => x.pool_id === poolId).sort((a, b) => a.slot - b.slot)
}

// ─── User feedback (per idea) ───────────────────────────────────────────────

/** 覆盖整条指导字符串（用于编辑/删除操作），同步重建当前轮次的历史条目 */
export function setIdeaFeedback(ideaId: string, feedback: string, atPoolIteration: number): void {
  const trimmed = feedback.trim()
  if (trimmed) {
    feedbacks.set(ideaId, trimmed)
    feedbackIterations.set(ideaId, atPoolIteration)
  } else {
    feedbacks.delete(ideaId)
    feedbackIterations.delete(ideaId)
  }
  // 重建 feedbackHistories 中当前轮次的条目
  const history = feedbackHistories.get(ideaId) ?? []
  const otherRounds = history.filter((e) => e.atIteration !== atPoolIteration)
  if (trimmed) {
    const lines = trimmed.split('\n').filter(Boolean)
    const newEntries: FeedbackEntry[] = lines.map((text) => ({
      text,
      atIteration: atPoolIteration,
      createdAt: new Date().toISOString(),
    }))
    feedbackHistories.set(ideaId, [...otherRounds, ...newEntries])
  } else {
    feedbackHistories.set(ideaId, otherRounds)
  }
}

/** 追加一条指导（换行分隔），同时写入历史记录 */
export function appendIdeaFeedback(ideaId: string, feedback: string, atPoolIteration: number): void {
  const trimmed = feedback.trim()
  if (!trimmed) return
  const existing = feedbacks.get(ideaId)
  feedbacks.set(ideaId, existing ? `${existing}\n${trimmed}` : trimmed)
  feedbackIterations.set(ideaId, atPoolIteration)
  // 追加到历史记录
  const history = feedbackHistories.get(ideaId) ?? []
  history.push({ text: trimmed, atIteration: atPoolIteration, createdAt: new Date().toISOString() })
  feedbackHistories.set(ideaId, history)
}

export function getIdeaFeedback(ideaId: string): string | undefined {
  return feedbacks.get(ideaId)
}

/** 按 slot 返回该池子下所有有反馈的创意的反馈，供迭代时传入 adapter */
export function getFeedbacksByPool(poolId: string): Record<number, string> {
  const poolIdeas = getIdeasByPool(poolId)
  const out: Record<number, string> = {}
  for (const idea of poolIdeas) {
    const fb = feedbacks.get(idea.id)
    if (fb) out[idea.slot] = fb
  }
  return out
}

/** 只清空当前待迭代的 feedbacks 字符串，feedbackHistories 永不清空 */
export function clearFeedbacksByPool(poolId: string): void {
  const poolIdeas = getIdeasByPool(poolId)
  for (const idea of poolIdeas) {
    feedbacks.delete(idea.id)
    feedbackIterations.delete(idea.id)
    // feedbackHistories 不清空，永久保留
  }
}

const LIKE_BONUS_PER_ROUND = 3

export function getRoundLikeBonusPoints(ideaId: string): number {
  return (ideaRoundLikes.get(ideaId)?.size ?? 0) * LIKE_BONUS_PER_ROUND
}

/**
 * 某 UI 轮次（1–3）结束后用户点赞：该方案池内总分 +3，且之后每次 AI 更新分数时仍会叠加已有点赞加成。
 */
export function tryLikeIdeaRound(
  poolId: string,
  ideaId: string,
  uiRound: number
): { ok: true } | { ok: false; error: string } {
  const pool = getPool(poolId)
  if (!pool) return { ok: false, error: '未找到池子' }
  if (pool.status === 'running') return { ok: false, error: '池子生成中，请稍后再试' }
  if (!Number.isInteger(uiRound) || uiRound < 1 || uiRound > 3) return { ok: false, error: '无效的轮次' }

  const poolIdeas = getIdeasByPool(poolId)
  const idea = poolIdeas.find((i) => i.id === ideaId)
  if (!idea) return { ok: false, error: '未找到创意' }

  const needVerIter = uiRound - 1
  const vers = getVersionsByIdea(ideaId)
  if (!vers.some((v) => v.iteration === needVerIter)) return { ok: false, error: '该轮尚无方案内容' }

  const doneIter = pool.iteration ?? 0
  if (doneIter < uiRound - 1) return { ok: false, error: '该轮尚未结束，暂不可点赞' }

  let set = ideaRoundLikes.get(ideaId)
  if (!set) {
    set = new Set<number>()
    ideaRoundLikes.set(ideaId, set)
  }
  if (set.has(uiRound)) return { ok: false, error: '本辑已点过赞' }

  set.add(uiRound)
  idea.total_score += LIKE_BONUS_PER_ROUND
  idea.updated_at = now()
  recomputeRanksForPool(poolId)
  return { ok: true }
}

// ─── IdeaVersion ───────────────────────────────────────────────────────────

export function insertIdeaVersions(versions: VersionInput[]): IdeaVersion[] {
  const created: IdeaVersion[] = versions.map((v) => ({
    id: uid(),
    idea_id: v.idea_id,
    iteration: v.iteration,
    content: v.content,
    score_innovation: v.score_innovation,
    score_feasibility: v.score_feasibility,
    score_impact: v.score_impact,
    total_score: v.total_score,
    ai_changes: v.ai_changes ?? null,
    created_at: now(),
  }))
  ideaVersions.push(...created)
  return created
}

export function getVersionsByIdea(ideaId: string): IdeaVersion[] {
  return [...ideaVersions]
    .filter((x) => x.idea_id === ideaId)
    .sort((a, b) => a.iteration - b.iteration)
}

export function updateIdeasAfterIteration(
  updates: Array<{
    id: string
    current_version_id: string
    total_score: number
    trend: 'up' | 'down' | 'same'
  }>
): void {
  for (const u of updates) {
    const idea = ideas.find((x) => x.id === u.id)
    if (idea) {
      idea.current_version_id = u.current_version_id
      // u.total_score 为 AI 给出的版本总分；点赞加成永久叠加在池内排序用的 total_score 上
      idea.total_score = u.total_score + getRoundLikeBonusPoints(u.id)
      idea.trend = u.trend
      idea.updated_at = now()
    }
  }
}

export function recomputeRanks(projectId: string): void {
  const projectPools = getPoolsByProject(projectId)
  const allIdeas: Idea[] = []
  for (const pool of projectPools) {
    allIdeas.push(...getIdeasByPool(pool.id))
  }
  allIdeas.sort((a, b) => b.total_score - a.total_score)
  allIdeas.forEach((idea, i) => {
    idea.rank = i + 1
  })
}

/** Recompute ranks for ideas within a single pool (1–12). */
export function recomputeRanksForPool(poolId: string): void {
  const poolIdeas = getIdeasByPool(poolId)
  poolIdeas.sort((a, b) => b.total_score - a.total_score)
  poolIdeas.forEach((idea, i) => {
    idea.rank = i + 1
  })
}

// ─── Job ───────────────────────────────────────────────────────────────────

export function createJob(projectId: string, iteration: number): Job {
  const job: Job = {
    id: uid(),
    project_id: projectId,
    iteration,
    status: 'pending',
    error: null,
    retry_count: 0,
    started_at: null,
    finished_at: null,
    created_at: now(),
  }
  jobs.push(job)
  return job
}

export function updateJob(id: string, patch: Partial<Job>): void {
  const j = jobs.find((x) => x.id === id)
  if (j) Object.assign(j, patch)
}

// ─── Full project read ────────────────────────────────────────────────────

export function getProjectDetail(id: string): ProjectDetail | null {
  const project = getProject(id)
  if (!project) return null

  const projectPools = getPoolsByProject(id)
  const poolDetails: PoolDetail[] = projectPools.map((pool) => {
    const poolIdeas = getIdeasByPool(pool.id)
    const ideaDetails: IdeaDetail[] = poolIdeas.map((idea) => {
      const versions = getVersionsByIdea(idea.id)
      const currentVersion =
        versions.find((v) => v.id === idea.current_version_id) ?? versions[versions.length - 1] ?? emptyVersionPlaceholder
      return {
        ...idea,
        liked_rounds: [...(ideaRoundLikes.get(idea.id) ?? [])].sort((a, b) => a - b),
        current_version: currentVersion,
        versions,
      } as IdeaDetail
    })
    return { ...pool, ideas: ideaDetails }
  })

  return { ...project, pools: poolDetails }
}

// ─── Demo seed（不再由 API 自动调用；若需要本地灌演示数据可手动在控制台等场景调用） ─

export function seedDemoProject(): void {
  if (projects.length > 0) return
  seedDemoPools()
}

/** 写入 3 个独立演示池（仅 pools 为空时）。应用已改为不自动执行，需显式调用。 */
export function seedDemoPools(): void {
  if (pools.length > 0) return

  const keywords = ['可持续包装', '远程协作工具', '健康饮食']
  for (const kw of keywords) {
    createStandalonePool(kw)
  }
}

