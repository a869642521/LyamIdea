'use client'
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import type { PoolDetail, IdeaDetail } from '@/types'
import { cn, scoreColor, formatScore, trendIcon, trendColor } from '@/lib/utils'
import { POOL_THEMES } from '@/lib/color-themes'
import PoolColumn from '@/components/PoolColumn'
import IdeaDrawer from '@/components/IdeaDrawer'
import {
  ArrowLeft, ChevronRight, Layers, Zap, Hand, Paperclip,
  MessageSquare, Award, Sparkles, Play, Loader2, Check,
  Clock, RefreshCw,
  ChevronDown,
  X,
} from 'lucide-react'

// ─── Ranking Panel (inline, detail-page specific) ─────────────────────────
type SortKey = 'total' | 'innovation' | 'feasibility' | 'impact'

function DetailRankingPanel({
  pool,
  onIdeaClick,
}: {
  pool: PoolDetail
  onIdeaClick: (idea: IdeaDetail) => void
}) {
  const [sortKey, setSortKey] = useState<SortKey>('total')

  const sorted = useMemo(() => {
    const ideas = pool.ideas.filter((i) => i.current_version?.content)
    return [...ideas].sort((a, b) => {
      const av = a.current_version!
      const bv = b.current_version!
      if (sortKey === 'total') return (b.total_score ?? 0) - (a.total_score ?? 0)
      if (sortKey === 'innovation') return (bv.score_innovation ?? 0) - (av.score_innovation ?? 0)
      if (sortKey === 'feasibility') return (bv.score_feasibility ?? 0) - (av.score_feasibility ?? 0)
      if (sortKey === 'impact') return (bv.score_impact ?? 0) - (av.score_impact ?? 0)
      return 0
    })
  }, [pool.ideas, sortKey])

  const MEDAL: Record<number, string> = { 0: '🥇', 1: '🥈', 2: '🥉' }

  const SORT_TABS = [
    { key: 'total' as SortKey, label: '综合' },
    { key: 'innovation' as SortKey, label: '创新' },
    { key: 'feasibility' as SortKey, label: '可行' },
    { key: 'impact' as SortKey, label: '影响' },
  ]

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* 顶部：标题 + 排序合一区，减少纵向占用 */}
      <div className="shrink-0 space-y-2 mb-2 pb-2 border-b border-zinc-800/50">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <Award size={12} className="text-amber-400 shrink-0" />
            <h3 className="text-xs font-semibold text-zinc-100 truncate">排名榜</h3>
          </div>
          <span className="text-[10px] text-zinc-600 tabular-nums shrink-0">{sorted.length} 条</span>
        </div>
        <div className="grid grid-cols-4 gap-0.5 p-0.5 rounded-lg bg-zinc-900/70 border border-zinc-800/50">
          {SORT_TABS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setSortKey(key)}
              className={cn(
                'py-1 rounded-md text-[10px] font-medium transition-all',
                sortKey === key
                  ? 'bg-violet-600 text-white'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/80'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 榜单列表 */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-0.5">
        {sorted.length === 0 ? (
          <div className="py-8 text-center text-xs text-zinc-600">暂无数据</div>
        ) : sorted.map((ideaDetail, idx) => {
          const v = ideaDetail.current_version!
          const hasFeedback = !!ideaDetail.user_feedback?.trim()
          return (
            <button
              key={ideaDetail.id}
              onClick={() => onIdeaClick(ideaDetail)}
              className={cn(
                'w-full text-left rounded-xl border transition-all group',
                'px-3 py-2.5',
                idx < 3
                  ? 'border-amber-500/20 bg-amber-500/5 hover:bg-amber-500/10'
                  : 'border-zinc-800/60 bg-zinc-900/30 hover:bg-zinc-800/50'
              )}
            >
              <div className="flex items-start gap-2.5">
                {/* 排名 */}
                <div className={cn(
                  'shrink-0 w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-bold',
                  idx === 0 ? 'bg-amber-500/20 text-amber-400'
                  : idx === 1 ? 'bg-zinc-400/20 text-zinc-300'
                  : idx === 2 ? 'bg-orange-600/20 text-orange-400'
                  : 'bg-zinc-800/60 text-zinc-500'
                )}>
                  {idx < 3 ? MEDAL[idx] : idx + 1}
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <p className="text-[11px] text-zinc-200 leading-relaxed line-clamp-2 group-hover:text-white">
                    {(v.content ?? '')
                      .replace(/^【.*?】/, '')
                      .replace(/^创意\s*#\d+：/, '')
                      .trim() || v.content}
                  </p>
                  {/* 分数条 */}
                  <div className="flex items-center gap-1.5">
                    <span className={cn('text-[11px] font-bold tabular-nums', scoreColor(ideaDetail.total_score ?? 0))}>
                      {formatScore(ideaDetail.total_score)}
                    </span>
                    <div className="flex-1 flex gap-0.5">
                      {[v.score_innovation, v.score_feasibility, v.score_impact].map((s, i) => (
                        <div key={i} className="flex-1 h-1 rounded-full bg-zinc-800 overflow-hidden">
                          <div
                            className={cn(
                              'h-full rounded-full',
                              i === 0 ? 'bg-violet-500' : i === 1 ? 'bg-cyan-500' : 'bg-emerald-500'
                            )}
                            style={{ width: `${Math.min(100, Math.max(0, Number(s ?? 0)))}%` }}
                          />
                        </div>
                      ))}
                    </div>
                    <span className={cn('text-[10px]', trendColor(ideaDetail.trend))}>
                      {trendIcon(ideaDetail.trend)}
                    </span>
                    {hasFeedback && (
                      <MessageSquare size={9} className="text-violet-400 shrink-0" />
                    )}
                  </div>
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* 迷你图例：单行 */}
      <div className="shrink-0 pt-2 mt-1 border-t border-zinc-800/40 text-[9px] text-zinc-600 leading-none">
        条形色带：紫·创新 / 青·可行 / 绿·影响
      </div>
    </div>
  )
}

// ─── Pool Info Card (left sidebar) ────────────────────────────────────────
function PoolInfoCard({ pool, iterating }: { pool: PoolDetail; iterating: boolean }) {
  const iteration = pool.iteration ?? 0
  const isDone = iteration >= 2
  const displayRound = Math.min(iteration + 1, 3)
  const isManual = pool.iteration_mode === 'manual'

  const ideasWithContent = pool.ideas.filter((i) => i.current_version?.content)
  const avgScore = ideasWithContent.length
    ? Math.round(
        ideasWithContent.reduce((s, i) => s + (i.total_score ?? 0), 0) / ideasWithContent.length
      )
    : 0
  const maxScore = ideasWithContent.length
    ? Math.max(...ideasWithContent.map((i) => i.total_score ?? 0))
    : 0
  const feedbackCount = pool.ideas.filter((i) => i.user_feedback?.trim()).length

  return (
    <div className="w-full min-w-0 rounded-2xl border border-zinc-800/60 bg-zinc-900/30 p-3 space-y-3">
      {/* 标题 + 状态一行 */}
      <div className="space-y-1.5 w-full min-w-0">
        <h2 className="text-sm font-semibold text-zinc-100 leading-snug line-clamp-2 min-w-0">
          {pool.keyword || '未命名'}
        </h2>
        <div className="grid w-full min-w-0 grid-cols-2 gap-1">
          <span
            className={cn(
              'flex w-full min-w-0 items-center justify-center gap-0.5 text-[9px] px-1.5 py-1 rounded-md border tabular-nums',
              isManual
                ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                : 'bg-violet-500/10 border-violet-500/20 text-violet-400'
            )}
          >
            <span className="inline-flex shrink-0 items-center justify-center min-w-[10px] min-h-[10px]">
              {isManual ? <Hand size={8} className="shrink-0" /> : <Zap size={8} className="shrink-0" />}
            </span>
            <span className="truncate">{isManual ? '手动' : '自动'}</span>
          </span>
          <span
            className={cn(
              'flex w-full min-w-0 items-center justify-center gap-0.5 text-[9px] px-1.5 py-1 rounded-md border tabular-nums',
              isDone
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                : iterating
                  ? 'bg-violet-500/10 border-violet-500/20 text-violet-300'
                  : 'bg-zinc-800 border-zinc-700/40 text-zinc-400'
            )}
          >
            <span className="inline-flex shrink-0 items-center justify-center min-w-[10px] min-h-[10px]">
              {isDone ? (
                <Check size={8} className="shrink-0" />
              ) : iterating ? (
                <Loader2 size={8} className="animate-spin shrink-0" />
              ) : (
                <Clock size={8} className="shrink-0" />
              )}
            </span>
            <span className="truncate">{isDone ? '已完成' : iterating ? '迭代中' : `${displayRound}/3 轮`}</span>
          </span>
        </div>
      </div>

      {/* 统计：单行紧凑 + title 说明 */}
      <div className="flex items-center justify-between gap-1 rounded-lg bg-zinc-800/35 border border-zinc-800/60 px-2.5 py-2 text-[10px]">
        <div className="text-center flex-1 min-w-0" title="池内方案综合分算术平均">
          <div className={cn('text-sm font-bold tabular-nums leading-none', scoreColor(avgScore))}>{avgScore}</div>
          <div className="text-sm text-zinc-600 mt-1">均分</div>
        </div>
        <div className="w-px h-8 bg-zinc-800 shrink-0" />
        <div className="text-center flex-1 min-w-0" title="池内单方案最高综合分">
          <div className={cn('text-sm font-bold tabular-nums leading-none', scoreColor(maxScore))}>{maxScore}</div>
          <div className="text-sm text-zinc-600 mt-1">最高</div>
        </div>
        <div className="w-px h-8 bg-zinc-800 shrink-0" />
        <div className="text-center flex-1 min-w-0" title="已留指导的方案数">
          <div className={cn('text-sm font-bold tabular-nums leading-none', feedbackCount > 0 ? 'text-violet-400' : 'text-zinc-500')}>
            {feedbackCount}
          </div>
          <div className="text-sm text-zinc-600 mt-1">反馈</div>
        </div>
      </div>

      {pool.description && (
        <p className="text-[10px] text-zinc-500 leading-relaxed line-clamp-2 border-t border-zinc-800/40 pt-2">
          {pool.description}
        </p>
      )}

      {(pool.attachments?.length ?? 0) > 0 && (
        <div className="flex items-center gap-1 text-[10px] text-zinc-600 border-t border-zinc-800/40 pt-2">
          <Paperclip size={10} />
          <span>{pool.attachments!.length} 个参考文件</span>
        </div>
      )}
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────
export default function PoolDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const id = params?.id

  const [allPools, setAllPools] = useState<PoolDetail[]>([])
  const [pool, setPool] = useState<PoolDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [iterating, setIterating] = useState(false)
  const [selectedIdea, setSelectedIdea] = useState<IdeaDetail | null>(null)
  const [viewRound, setViewRound] = useState<number | undefined>(undefined)
  const [drawerFocusFeedback, setDrawerFocusFeedback] = useState(false)
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryText, setSummaryText] = useState('')
  const [summaryError, setSummaryError] = useState('')
  const [debugStepBusy, setDebugStepBusy] = useState(false)
  const [debugStepNotice, setDebugStepNotice] = useState('')

  // 用于自动迭代轮询的稳定 ref，避免 pool state 变化时 timer 重建
  const poolRef = useRef<PoolDetail | null>(null)
  const iteratingRef = useRef(false)
  poolRef.current = pool
  iteratingRef.current = iterating


  const fetchAllPools = useCallback(async () => {
    try {
      const res = await fetch('/api/pools')
      const data = await res.json()
      const list: PoolDetail[] = data.pools ?? []
      setAllPools(list)
      return list
    } catch {
      setAllPools([])
      return []
    }
  }, [])

  const fetchPool = useCallback(async (opts?: { silent?: boolean }) => {
    if (!id) return
    if (!opts?.silent) setLoading(true)
    try {
      const res = await fetch(`/api/pools/${id}`)
      if (!res.ok) {
        if (!opts?.silent) {
          const data = await res.json().catch(() => ({}))
          setError(data.error ?? '池子不存在或加载失败')
          setPool(null)
        }
        return
      }
      const data = await res.json()
      setPool(data.pool)
      if (!opts?.silent) setError('')
    } catch {
      if (!opts?.silent) {
        setError('网络错误')
        setPool(null)
      }
    } finally {
      if (!opts?.silent) setLoading(false)
    }
  }, [id])

  useEffect(() => {
    fetchAllPools().then(() => { if (id) fetchPool() })
  }, [id, fetchAllPools, fetchPool])

  // 种子生成 / 迭代在服务端后台进行时，静默刷新当前池直至完成
  // 迭代期间加快至 1s 轮询，让九宫格逐格实时更新
  const selectedIdeaRef = useRef<IdeaDetail | null>(null)
  selectedIdeaRef.current = selectedIdea

  useEffect(() => {
    if (!id || pool?.status !== 'running') return
    const isIterating = (pool?.iteration ?? 0) > 0 || pool?.status === 'running'
    const interval = isIterating ? 1000 : 2500
    const intervalId = setInterval(async () => {
      try {
        const res = await fetch(`/api/pools/${id}`)
        if (!res.ok) return
        const data = await res.json()
        if (data.pool) {
          setPool(data.pool as PoolDetail)
          // 若抽屉已打开，同步最新 idea 数据（逐格落库后分数/内容已更新）
          const cur = selectedIdeaRef.current
          if (cur) {
            const fresh = (data.pool as PoolDetail).ideas.find((i: IdeaDetail) => i.id === cur.id)
            if (fresh) setSelectedIdea(fresh as IdeaDetail)
          }
        }
      } catch {
        /* ignore */
      }
    }, interval)
    return () => clearInterval(intervalId)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, pool?.status])

  const handleRunIterationRef = useRef<(n: number) => void>(() => {})

  // 自动迭代轮询（仅 auto 模式）——使用 ref 读取最新状态，timer 仅在 pool.id 变化时重建
  useEffect(() => {
    if (!id) return
    const checkNow = () => {
      const p = poolRef.current
      if (!p || iteratingRef.current) return
      if (p.iteration_mode === 'manual' || p.awaiting_round_confirm) return
      const iteration = p.iteration ?? 0
      if (iteration >= 2 || !p.next_iterate_at || p.status === 'running') return
      if (new Date(p.next_iterate_at).getTime() <= Date.now()) {
        handleRunIterationRef.current(iteration + 1)
      }
    }
    checkNow()
    const timer = setInterval(checkNow, 30_000)
    return () => clearInterval(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]) // 仅 id 变化时重建，内部状态通过 ref 访问

  const handleRunIteration = async (nextIteration: number) => {
    if (!id || iteratingRef.current) return
    setIterating(true)
    setError('')
    try {
      const res = await fetch(`/api/pools/${id}/iterate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ iteration: nextIteration }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? `第${nextIteration + 1}轮迭代失败`)
        await fetchPool({ silent: true })
        await fetchAllPools()
        return
      }
      // 接口立即返回（后台流式执行），pool.status 已为 running；
      // 轮询 useEffect 会在 status===running 时每 1s 刷新九宫格
      const updatedPool = data.pool as PoolDetail
      setPool(updatedPool)
      const cur = selectedIdeaRef.current
      if (cur) {
        const fresh = updatedPool.ideas.find((i) => i.id === cur.id)
        if (fresh) setSelectedIdea(fresh as IdeaDetail)
      }
      await fetchAllPools()
    } catch {
      setError('迭代请求失败，请重试')
    } finally {
      // 真实模式：接口立即返回，可尽早解锁按钮；状态靠轮询感知
      setIterating(false)
    }
  }
  handleRunIterationRef.current = handleRunIteration

  const showDebugPoolSteps =
    typeof process.env.NEXT_PUBLIC_DEBUG_POOL_STEPS === 'string' &&
    ['1', 'true', 'yes'].includes(process.env.NEXT_PUBLIC_DEBUG_POOL_STEPS.trim().toLowerCase())

  const runDebugStage1 = async () => {
    if (!id) return
    setDebugStepBusy(true)
    setDebugStepNotice('')
    try {
      const res = await fetch(`/api/pools/${id}/debug/step`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: 1 }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setDebugStepNotice(typeof data.error === 'string' ? data.error : `请求失败 ${res.status}`)
        return
      }
      if (data.pool) setPool(data.pool as PoolDetail)
      setDebugStepNotice(typeof data.message === 'string' ? data.message : '阶段 1 已应用')
      await fetchAllPools()
    } finally {
      setDebugStepBusy(false)
    }
  }

  const handleEditPool = async (poolId: string, payload: { remove: string[]; files: File[]; description?: string }): Promise<boolean> => {
    const formData = new FormData()
    formData.append('remove', JSON.stringify(payload.remove))
    payload.files.forEach((f) => formData.append('files', f))
    if (payload.description !== undefined) formData.append('description', payload.description)
    const res = await fetch(`/api/pools/${poolId}`, { method: 'PATCH', body: formData })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      console.error('[handleEditPool] PATCH failed:', data.error ?? res.statusText)
      return false
    }
    await fetchPool()
    await fetchAllPools()
    return true
  }

  const handleDeletePool = async (poolId: string) => {
    await fetch(`/api/pools/${poolId}`, { method: 'DELETE' })
    router.push('/')
  }

  const fetchPoolSummary = useCallback(async () => {
    if (!id) return
    setSummaryLoading(true)
    setSummaryError('')
    try {
      const res = await fetch(`/api/pools/${id}/summary`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setSummaryError(typeof data.error === 'string' ? data.error : '总结加载失败')
        setSummaryText('')
        return
      }
      setSummaryText(typeof data.summary === 'string' ? data.summary : '')
    } catch {
      setSummaryError('网络错误')
      setSummaryText('')
    } finally {
      setSummaryLoading(false)
    }
  }, [id])

  /** 与首页一致：按 /api/pools 列表顺序取池子下标再模主题数（池子外沿 + 九宫格格子/机器人同色体系） */
  const homeListPoolColorBase = useMemo(() => {
    const pid = pool?.id
    if (!pid) return 0
    const i = allPools.findIndex((p) => p.id === pid)
    return (i >= 0 ? i : 0) % POOL_THEMES.length
  }, [allPools, pool?.id])

  // ── Loading / Error states ───────────────────────────────────────────────
  if (loading && !pool) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-t from-[#1a0a2e] via-zinc-950 to-black">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-zinc-500 text-sm">加载中…</p>
        </div>
      </div>
    )
  }

  if (error && !pool) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-t from-[#1a0a2e] via-zinc-950 to-black">
        <div className="text-center space-y-3">
          <p className="text-rose-400 text-sm">{error}</p>
          <Link href="/" className="text-sm text-violet-400 hover:text-violet-300 flex items-center justify-center gap-1">
            <ArrowLeft size={14} /> 返回首页
          </Link>
        </div>
      </div>
    )
  }

  if (!pool) return null

  const iteration = pool.iteration ?? 0
  const isDone = iteration >= 2
  const isRunning = iterating || pool.status === 'running'
  const isManual = pool.iteration_mode === 'manual'
  const ideasWithFeedback = pool.ideas.filter((i) => i.user_feedback?.trim())

  // Manual 等待触发：含「初始生成完成后 → 第 1 轮」；确认模式下须先点确认条
  const isManualPlay =
    isManual &&
    !isDone &&
    !isRunning &&
    !pool.awaiting_round_confirm &&
    (iteration > 0 || (iteration === 0 && pool.status === 'done')) &&
    (!pool.next_iterate_at || new Date(pool.next_iterate_at).getTime() <= Date.now())

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-t from-[#1a0a2e] via-zinc-950 to-black text-zinc-100">

      {/* ── 顶部导航栏 ─────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 bg-black/80 backdrop-blur-md border-b border-zinc-800/40">
        <div className="max-w-[1600px] mx-auto px-[clamp(1rem,4vw,5rem)] h-14 flex items-center gap-4">
          {/* 返回 */}
          <Link
            href="/"
            className="shrink-0 w-8 h-8 flex items-center justify-center rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors"
            aria-label="返回首页"
          >
            <ArrowLeft size={16} />
          </Link>

          {/* 面包屑 */}
          <div className="flex items-center gap-1.5 text-xs text-zinc-500 min-w-0">
            <Link href="/" className="hover:text-zinc-300 transition-colors shrink-0">创意集市</Link>
            <ChevronRight size={12} className="shrink-0" />
            <span className="text-zinc-200 font-medium truncate">{pool.keyword || '未命名'}</span>
          </div>

          {/* 右侧操作 */}
          <div className="flex items-center gap-2 ml-auto shrink-0">
            {/* 状态 + 触发按钮 */}
            {isRunning ? (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-300 text-xs">
                <Loader2 size={12} className="animate-spin" />
                迭代中…
              </div>
            ) : isDone ? (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs">
                <Check size={12} />
                已完成
              </div>
            ) : pool.awaiting_round_confirm ? (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/35 text-amber-300 text-xs font-medium">
                <Play size={12} className="fill-current shrink-0 opacity-90" />
                点进度条播放查看说明
              </div>
            ) : isManualPlay ? (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-300/90 text-xs">
                <Play size={11} className="fill-current shrink-0 opacity-90" />
                在下方进度条当前轮次点击播放
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                <RefreshCw size={11} className="text-zinc-600" />
                {isManual ? '等待手动触发' : '自动推进中'}
              </div>
            )}

            {/* 总结（后续可在此接入大模型） */}
            <button
              type="button"
              onClick={() => {
                setSummaryOpen(true)
                void fetchPoolSummary()
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-violet-500/30 text-zinc-400 hover:text-violet-200 text-xs font-medium transition-all"
            >
              <Sparkles size={13} className="text-violet-400/90" />
              总结
            </button>
          </div>
        </div>
      </header>

      {/* ── 三栏主体 ──────────────────────────────────────────────────── */}
      <div className="flex-1 max-w-[1600px] mx-auto w-full px-[clamp(1rem,4vw,5rem)] py-6 flex gap-5">

        {/* ── 左侧栏 ────────────────────────────────────────────── */}
        <aside className="hidden lg:flex flex-col w-56 shrink-0 gap-4">
          <div className="sticky top-20 space-y-4">
            {/* 当前池子信息卡 */}
            <PoolInfoCard pool={pool} iterating={iterating} />

            {/* 池子切换 */}
            {allPools.length > 1 && (
              <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900/30 overflow-hidden">
                <div className="px-4 py-2.5 border-b border-zinc-800/40 flex items-center gap-2">
                  <Layers size={12} className="text-zinc-500" />
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">切换池子</span>
                </div>
                <nav className="p-2 max-h-64 overflow-y-auto">
                  <ul className="space-y-0.5">
                    {allPools.map((p) => {
                      const pIter = p.iteration ?? 0
                      const pDone = pIter >= 2
                      return (
                        <li key={p.id}>
                          <Link
                            href={`/pools/${p.id}`}
                            className={cn(
                              'flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-colors',
                              p.id === pool.id
                                ? 'bg-violet-600/15 text-violet-300 border border-violet-500/20'
                                : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-100 border border-transparent'
                            )}
                          >
                            <span className="truncate flex-1 leading-snug">{p.keyword || '未命名'}</span>
                            <span className={cn(
                              'shrink-0 ml-2 text-[10px] tabular-nums',
                              pDone ? 'text-emerald-500' : 'text-zinc-600'
                            )}>
                              {pDone ? '✓' : `${Math.min(pIter + 1, 3)}/3`}
                            </span>
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                </nav>
              </div>
            )}
          </div>
        </aside>

        {/* ── 中间主区 ──────────────────────────────────────────── */}
        <main className="flex-1 min-w-0 flex flex-col gap-5">
          {error && (
            <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 px-4 py-3 text-xs text-rose-400">
              {error}
            </div>
          )}

          {showDebugPoolSteps && (
            <div className="rounded-xl border border-dashed border-amber-500/45 bg-amber-500/[0.07] px-4 py-3 space-y-2">
              <p className="text-[11px] font-semibold text-amber-200">分阶段调试（不写大模型）</p>
              <p className="text-[10px] text-amber-200/65 leading-relaxed">
                需在 .env.local 设置 DEBUG_POOL_STEPS=1 并重启 dev。当前仅开放阶段 1：假方向 + 假维度，池子保持「生成中」与 0/9。
              </p>
              <button
                type="button"
                disabled={debugStepBusy}
                onClick={() => void runDebugStage1()}
                className="px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-amber-500/20 border border-amber-500/40 text-amber-100 hover:bg-amber-500/30 disabled:opacity-50"
              >
                {debugStepBusy ? '执行中…' : '执行阶段 1'}
              </button>
              {debugStepNotice && (
                <p className="text-[10px] text-amber-200/80 leading-relaxed border-t border-amber-500/20 pt-2">
                  {debugStepNotice}
                </p>
              )}
            </div>
          )}

          {/* 创意方案九宫格（复用 PoolColumn） */}
          <PoolColumn
            pool={pool}
            poolIndex={homeListPoolColorBase}
            onIdeaClick={(idea) => { setDrawerFocusFeedback(false); setSelectedIdea(idea) }}
            onIdeaFeedback={(idea) => { setDrawerFocusFeedback(true); setSelectedIdea(idea) }}
            isRunning={iterating}
            detailView
            onRunIteration={(_, next) => handleRunIteration(next)}
            onViewRound={(_poolId, round) => setViewRound(round)}
            viewRound={viewRound}
            onEdit={handleEditPool}
            onDelete={handleDeletePool}
            onDirectionSwitch={setPool}
            onConfirmRound={setPool}
            onPoolUpdated={setPool}
          />

          {/* 用户反馈汇总 */}
          <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900/20 overflow-hidden">
            {/* 标题栏 */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800/40">
              <div className="flex items-center gap-2">
                <MessageSquare size={14} className="text-zinc-500" />
                <h2 className="text-sm font-semibold text-zinc-200">方案反馈</h2>
                {ideasWithFeedback.length > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-violet-500/15 border border-violet-500/20 text-[10px] text-violet-400 font-medium tabular-nums">
                    {ideasWithFeedback.length}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-zinc-600">点击方案卡片可在详情中添加指导</p>
            </div>

            {/* 反馈列表 */}
            <div className="p-4">
              {ideasWithFeedback.length === 0 ? (
                <div className="py-6 text-center">
                  <MessageSquare size={24} className="text-zinc-800 mx-auto mb-2" />
                  <p className="text-sm text-zinc-600">暂无反馈</p>
                  <p className="text-[11px] text-zinc-700 mt-1">点击上方创意卡片 → 底部「用户指导」填写，下一轮将参考优化</p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {ideasWithFeedback.map((idea) => (
                    <li
                      key={idea.id}
                      className="flex items-start gap-3 p-3 rounded-xl bg-zinc-800/30 border border-zinc-700/30 hover:border-zinc-600/50 hover:bg-zinc-800/50 transition-colors group"
                    >
                      {/* slot 标记 */}
                      <div className="shrink-0 w-6 h-6 rounded-lg bg-violet-500/15 border border-violet-500/20 flex items-center justify-center">
                        <span className="text-[10px] font-bold text-violet-400">
                          {idea.rank ?? idea.slot}
                        </span>
                      </div>
                      <p className="flex-1 min-w-0 text-xs text-zinc-300 leading-relaxed">
                        {idea.user_feedback}
                      </p>
                      <button
                        type="button"
                        onClick={() => setSelectedIdea(idea as IdeaDetail)}
                        className="shrink-0 text-[11px] text-zinc-600 hover:text-violet-400 group-hover:text-violet-400 transition-colors"
                      >
                        查看方案
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </main>

        {/* ── 右侧排名栏 ────────────────────────────────────────── */}
        <aside className="hidden xl:flex flex-col w-[17rem] shrink-0">
          <div className="sticky top-20 rounded-2xl border border-zinc-800/60 bg-zinc-900/20 p-3 max-h-[calc(100vh-6rem)] overflow-hidden flex flex-col">
            <DetailRankingPanel pool={pool} onIdeaClick={setSelectedIdea} />
          </div>
        </aside>
      </div>

      {/* ── 移动端底部展开区 ────────────────────────────────────── */}
      <div className="lg:hidden px-4 pb-6 space-y-3">
        {/* 池子信息 */}
        <details className="rounded-2xl border border-zinc-800 overflow-hidden">
          <summary className="flex items-center justify-between p-4 text-sm font-semibold text-zinc-100 cursor-pointer select-none bg-zinc-900/40">
            <span>池子详情</span>
            <ChevronDown size={14} className="text-zinc-500" />
          </summary>
          <div className="p-4 border-t border-zinc-800">
            <PoolInfoCard pool={pool} iterating={iterating} />
          </div>
        </details>

        {/* 排名 */}
        <details className="rounded-2xl border border-zinc-800 overflow-hidden">
          <summary className="flex items-center justify-between p-4 text-sm font-semibold text-zinc-100 cursor-pointer select-none bg-zinc-900/40">
            <span>排名榜</span>
            <ChevronDown size={14} className="text-zinc-500" />
          </summary>
          <div className="px-4 pb-4 pt-3 max-h-96 overflow-y-auto">
            <DetailRankingPanel pool={pool} onIdeaClick={setSelectedIdea} />
          </div>
        </details>

        {/* 切换池子 */}
        {allPools.length > 1 && (
          <div className="space-y-1.5">
            <label className="text-[11px] text-zinc-500 font-medium">切换池子</label>
            <select
              value={pool.id}
              onChange={(e) => router.push(`/pools/${e.target.value}`)}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-800 text-zinc-100 text-sm px-3 py-2.5 focus:outline-none focus:border-violet-500/60"
            >
              {allPools.map((p) => (
                <option key={p.id} value={p.id}>
                {p.keyword || '未命名'} — {Math.min((p.iteration ?? 0) + 1, 3)}/3 轮
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* ── 池子总结弹层 ───────────────────────────────────────── */}
      {summaryOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            aria-label="关闭总结"
            onClick={() => setSummaryOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="pool-summary-title"
            className="relative w-full max-w-lg max-h-[min(80vh,560px)] flex flex-col rounded-2xl border border-zinc-800 bg-zinc-900 shadow-xl shadow-black/50"
          >
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-zinc-800 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <Sparkles size={18} className="text-violet-400 shrink-0" />
                <h2 id="pool-summary-title" className="text-sm font-semibold text-zinc-100 truncate">
                  池子总结
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSummaryOpen(false)}
                className="shrink-0 p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100"
                aria-label="关闭"
              >
                <X size={18} />
              </button>
            </div>
            <div className="px-5 py-4 overflow-y-auto flex-1 min-h-0">
              {summaryLoading ? (
                <div className="flex flex-col items-center gap-3 py-12">
                  <Loader2 size={24} className="animate-spin text-violet-400" />
                  <p className="text-xs text-zinc-500">正在生成总结…</p>
                </div>
              ) : summaryError ? (
                <p className="text-sm text-rose-400">{summaryError}</p>
              ) : (
                <div className="space-y-3">
                  <p className="text-[10px] text-zinc-600 leading-relaxed">
                    当前为结构化摘要占位；接入大模型后，可在接口中替换为 LLM 生成的结论与建议。
                  </p>
                  <div className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap rounded-xl bg-zinc-800/40 border border-zinc-800/60 p-4">
                    {summaryText || '（暂无内容）'}
                  </div>
                </div>
              )}
            </div>
            <div className="px-5 py-3 border-t border-zinc-800 shrink-0 flex justify-end">
              <button
                type="button"
                onClick={() => { void fetchPoolSummary() }}
                disabled={summaryLoading}
                className="text-xs px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
              >
                刷新
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── IdeaDrawer ─────────────────────────────────────────── */}
      {selectedIdea && (
        <IdeaDrawer
          idea={selectedIdea}
          poolId={pool.id}
          poolDirection={pool.direction || pool.keyword || ''}
          onClose={() => { setSelectedIdea(null); setDrawerFocusFeedback(false) }}
          onFeedbackSaved={fetchPool}
          initialViewRound={viewRound}
          poolIteration={pool.iteration}
          pool={pool}
          autoFocusFeedback={drawerFocusFeedback}
          colorIndex={(() => {
            // 用 slot（固定，1-9）而非 rank，保证颜色与格子稳定一致
            const cellIndex = (selectedIdea.slot ?? 1) - 1
            return (homeListPoolColorBase + cellIndex) % POOL_THEMES.length
          })()}
        />
      )}
    </div>
  )
}
