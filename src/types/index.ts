export type ProjectStatus = 'pending' | 'running' | 'done' | 'failed'
export type JobStatus = 'pending' | 'running' | 'done' | 'failed'
export type Trend = 'up' | 'down' | 'same'

/** 创意池附加文件（文档、图片等），AI 可参考其内容生成创意 */
export interface Attachment {
  name: string
  type: string
  /** 文本文件提取的内容（TXT/MD/JSON） */
  textContent?: string
  /** 图片文件的 base64 Data URL（用于预览） */
  dataUrl?: string
}

export interface Project {
  id: string
  keyword: string
  status: ProjectStatus
  iteration: number
  created_at: string
  updated_at: string
  pools?: Pool[]
}

export interface Pool {
  id: string
  project_id: string
  slot: number
  direction: string
  /** 创建时生成的 3 个可选方向，用户可在第 0 轮后、第 1 轮前切换 */
  directions?: string[]
  keyword: string
  status: ProjectStatus
  iteration: number
  created_at: string
  updated_at?: string
  /** 下一轮自动迭代时间（ISO 字符串），用户第 3 轮完成后清空 */
  next_iterate_at?: string
  /** 创建时上传的附加文件，AI 可参考其内容 */
  attachments?: Attachment[]
  /** 用户填写的项目细节描述，AI 生成时参考 */
  description?: string
  /** 种子阶段 Kimi 联网生成的「第一轮简报」Markdown，迭代时注入 prompt 以保持与首轮研究对齐 */
  research_brief?: string
  /** 迭代推进方式：auto=自动进入下一轮，manual=用户手动触发，confirm=每轮结束后需用户确认再进入下一轮 */
  iteration_mode?: 'auto' | 'manual' | 'confirm'
  /** 当前轮已结束，等待用户确认后进入下一轮（仅当 iteration_mode=confirm 时使用） */
  awaiting_round_confirm?: boolean
  /** 后台 seed / iterate 失败时的错误信息（status==='failed' 时存在），供前端展示 */
  error_message?: string
  /**
   * AI 在首轮生成前自动确定的「探索维度」列表（4-6 条），每条对应若干格子的创意切入角度。
   * 整个三轮用户流程中保持不变，确保同一格子始终沿同一维度演进。
   */
  lenses?: string[]
  /**
   * 第二轮（数据 iteration=1）结束后，用户勾选的额外格子编号（1–9），将与前三名一起在第三轮参与深度方案生成。
   * 第三轮完成后清空。
   */
  final_round_extra_slots?: number[]
  ideas?: Idea[]
}

/** 用户对某创意提交的一条指导记录 */
export interface FeedbackEntry {
  text: string
  /** 提交时池子已完成的迭代轮数（0=初始阶段，即在第N轮生成之前提交） */
  atIteration: number
  createdAt: string
}

export interface Idea {
  id: string
  pool_id: string
  slot: number
  current_version_id: string | null
  total_score: number
  rank: number | null
  trend: Trend
  created_at: string
  updated_at: string
  /** 当前待迭代的指导字符串（换行分隔），迭代后清空（供 AI 引擎读取） */
  user_feedback?: string
  /** 用户留下上述指导时，池子已完成的迭代轮数（0=初始阶段） */
  user_feedback_at_iteration?: number
  /** 按轮次永久保留的历史指导列表，迭代后不清空 */
  feedbackHistory?: FeedbackEntry[]
  /** 用户已在该 UI 轮次（1–3）点过赞的列表；每轮首次点赞为池内总分 +3，且后续 AI 更新分数时保留该加成 */
  liked_rounds?: number[]
  current_version?: IdeaVersion
  versions?: IdeaVersion[]
}

export interface IdeaVersion {
  id: string
  idea_id: string
  iteration: number
  content: string
  score_innovation: number
  score_feasibility: number
  score_impact: number
  total_score: number
  ai_changes: string | null
  created_at: string
}

export interface Job {
  id: string
  project_id: string
  iteration: number
  status: JobStatus
  error: string | null
  retry_count: number
  started_at: string | null
  finished_at: string | null
  created_at: string
}

export interface ProjectDetail extends Project {
  pools: PoolDetail[]
}

export interface PoolDetail extends Pool {
  ideas: IdeaDetail[]
}

export interface IdeaDetail extends Idea {
  current_version: IdeaVersion
  versions: IdeaVersion[]
}

// Score calculation helper type
export interface Scores {
  innovation: number
  feasibility: number
  impact: number
}

// API response shapes
export interface CreateProjectResponse {
  project: ProjectDetail
}

export interface RunIterationResponse {
  project: ProjectDetail
  job: Job
}

/** 超级AI推荐：从 Reddit / X / Facebook 等多条证据归纳的产品机会卡片 */
export interface RecommendCard {
  keyword: string       // 建议的池子名称（≤15字）
  description: string   // 项目描述/背景
  painPoint: string     // 核心痛点摘要（一句话）
  source?: string       // 信息来源，如 "r/entrepreneur"
  upvotes?: number      // 来源帖子的点赞数（近似值）
  hotScore?: number     // 热度分（1-10，AI 综合赞数/评论数/新鲜度评估）
  postUrl?: string      // 主证据帖链接（可校验的 Reddit / X / Facebook permalink）
  /** 多证据归纳时的其余可点开源链接（与 postUrl 同源校验） */
  supportingPostUrls?: string[]
  /** 检索结果中的原帖标题（主证据，逐字复制） */
  postTitle?: string
}

export interface ExportIdea {
  pool: string
  rank: number
  content: string
  total_score: number
  score_innovation: number
  score_feasibility: number
  score_impact: number
  iterations: number
}
