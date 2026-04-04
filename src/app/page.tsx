'use client'
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import type { IdeaDetail, PoolDetail } from '@/types'
import { cn } from '@/lib/utils'
import { POOL_THEMES } from '@/lib/color-themes'
import PoolColumn from '@/components/PoolColumn'
import CreatePoolModal from '@/components/CreatePoolModal'
import { getBubbleText } from '@/lib/bubble'
import IdeaDrawer from '@/components/IdeaDrawer'
import LightRays from '@/components/LightRays'
import Particles from '@/components/Particles'
import { Plus, Zap, Settings, Languages, Globe } from 'lucide-react'
import SettingsModal, { migrateFromLegacy } from '@/components/SettingsModal'
import BraveSearchConfigModal from '@/components/BraveSearchConfigModal'
import { useLanguage } from '@/contexts/LanguageContext'

const PARTICLES_COLORS = ['#007bff', '#a600ff']

type WebGLController = { pause: () => void; resume: () => void }
const ParticlesWithRef = Particles as React.ForwardRefExoticComponent<Record<string, unknown> & React.RefAttributes<WebGLController>>
const LightRaysWithRef = LightRays as React.ForwardRefExoticComponent<Record<string, unknown> & React.RefAttributes<WebGLController>>

type FilterType = 'all' | 'running' | 'done' | 'tracking'

type ActiveBubble = { key: number; poolId: string; ideaId: string; text: string }

export default function HomePage() {
  const lightRaysParams = {
    raysOrigin: 'top-center',
    raysColor: '#8120cb',
    raysSpeed: 0.4,
    lightSpread: 2.5,
    rayLength: 1.8,
    pulsating: false,
    fadeDistance: 1.9,
    saturation: 0.9,
    followMouse: true,
    mouseInfluence: 0.2,
    noiseAmount: 0,
    distortion: 0,
    blendMode: 'screen',
  }

  /** Banner 底部渐变（原 Leva 调试项默认值，已关闭调试面板） */
  const overlayParams = {
    fadeStart: 60,
    fadeMid: 90,
    fadeMidOpacity: 0.7,
    fadeEnd: 100,
  } as const

  const [keyword, setKeyword] = useState('')
  const [description, setDescription] = useState('')
  const [iterationMode, setIterationMode] = useState<'auto' | 'confirm'>('confirm')
  const [createPoolFiles, setCreatePoolFiles] = useState<File[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [pools, setPools] = useState<PoolDetail[]>([])
  const [poolsLoading, setPoolsLoading] = useState(true)
  const [iteratingPoolId, setIteratingPoolId] = useState<string | null>(null)
  const [selectedIdea, setSelectedIdea] = useState<IdeaDetail | null>(null)
  const [selectedPool, setSelectedPool] = useState<PoolDetail | null>(null)
  const [drawerFocusFeedback, setDrawerFocusFeedback] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [braveConfigOpen, setBraveConfigOpen] = useState(false)
  const [useMockMode, setUseMockMode] = useState(true)
  const [filter, setFilter] = useState<FilterType>('all')
  const [trackedIds, setTrackedIds] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set()
    try {
      const raw = localStorage.getItem('idea-bazaar-tracked-ids')
      return raw ? new Set<string>(JSON.parse(raw)) : new Set<string>()
    } catch {
      return new Set<string>()
    }
  })
  const [viewingRoundByPool, setViewingRoundByPool] = useState<Record<string, number>>({})
  const [activeBubbles, setActiveBubbles] = useState<ActiveBubble[]>([])
  const { lang, setLang, t } = useLanguage()
  const bubbleKeyRef = useRef(0)
  /** 创建池子后延迟触发气泡，卸载时清除避免 setState */
  const postCreateBubbleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const removeTimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())
  const bubbleCooldownByPoolRef = useRef<Record<string, number>>({})
  const nextGlobalBubbleAtRef = useRef(0)
  const allPoolsRef = useRef(pools)
  allPoolsRef.current = pools
  const iteratingPoolIdRef = useRef<string | null>(null)
  iteratingPoolIdRef.current = iteratingPoolId
  const selectedPoolRef = useRef<PoolDetail | null>(null)
  const selectedIdeaRef = useRef<IdeaDetail | null>(null)
  selectedPoolRef.current = selectedPool
  selectedIdeaRef.current = selectedIdea

  const heroRef = useRef<HTMLElement>(null)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const descRef = useRef<HTMLParagraphElement>(null)
  const titleEnRef = useRef<HTMLSpanElement>(null)
  const heroHeightRef = useRef(680)
  const svgBgRef = useRef<HTMLDivElement>(null)
  const particlesRef = useRef<{ pause: () => void; resume: () => void }>(null)
  const lightRaysRef = useRef<{ pause: () => void; resume: () => void }>(null)
  const wasHeroPausedRef = useRef(false)
  const [heroHeight, setHeroHeight] = useState(680)

  // Restore active LLM config + participating configs from localStorage on mount
  useEffect(() => {
    const run = async () => {
      try {
        const migrated = migrateFromLegacy()
        const stored = migrated ?? (() => {
          try {
            const raw = localStorage.getItem('idea_llm_configs')
            if (!raw) return { configs: [], activeId: '' }
            const p = JSON.parse(raw)
            return { configs: p?.configs ?? [], activeId: p?.activeId ?? '' }
          } catch { return { configs: [], activeId: '' } }
        })()
        const { configs, activeId } = stored

        // 恢复活跃配置到服务端
        const active = configs.find((c: { id: string }) => c.id === activeId)
        if (active) {
          const res = await fetch('/api/llm-config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(active),
          })
          const d = await res.json().catch(() => ({}))
          if (res.ok && d.useMock !== undefined) {
            setUseMockMode(d.useMock)
          }
        }

        // 恢复多模型参与配置到服务端
        const participating = configs.filter(
          (c: { participating?: boolean; useMock?: boolean; apiKey?: string; baseUrl?: string; model?: string }) =>
            c.participating && !c.useMock && c.apiKey && c.baseUrl && c.model
        )
        if (participating.length > 0) {
          fetch('/api/llm-config/multi', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              configs: participating.map((c: { apiKey: string; baseUrl: string; model: string }) => ({
                apiKey: c.apiKey,
                baseUrl: c.baseUrl,
                model: c.model,
                useMock: false,
              })),
            }),
          }).catch(() => {})
        }

        if (active) return
      } catch {}
      fetch('/api/llm-config')
        .then((r) => r.json())
        .then((d) => setUseMockMode(d.useMock ?? true))
        .catch(() => {})
    }
    run()
  }, [])

  const computeHeroHeight = () =>
    Math.round(Math.min(680, Math.max(280, typeof window !== 'undefined' ? window.innerHeight * 0.65 : 680)))

  useEffect(() => {
    const update = () => {
      const h = computeHeroHeight()
      heroHeightRef.current = h
      setHeroHeight(h)
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  useEffect(() => {
    let rafId: number
    const HERO_MIN = 250

    const onScroll = () => {
      cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        const hero = heroRef.current
        const toolbar = toolbarRef.current
        const svgBg = svgBgRef.current
        if (!hero) return

        // 无池子：全屏固定 banner，不参与滚动收缩
        if (allPoolsRef.current.length === 0) {
          const vh = typeof window !== 'undefined' ? window.innerHeight : 680
          hero.style.height = `${vh}px`
          if (svgBg) {
            svgBg.style.backgroundSize = `auto ${vh}px, auto ${vh}px`
          }
          const titleEn = titleEnRef.current
          if (titleEn) {
            titleEn.style.opacity = '1'
            titleEn.style.transform = ''
            titleEn.style.removeProperty('maxHeight')
            titleEn.style.overflow = 'visible'
          }
          const desc = descRef.current
          if (desc) {
            desc.style.opacity = '1'
            desc.style.transform = ''
            desc.style.removeProperty('maxHeight')
            desc.style.marginBottom = '40px'
            desc.style.overflow = 'visible'
          }
          if (wasHeroPausedRef.current) {
            wasHeroPausedRef.current = false
            particlesRef.current?.resume()
            lightRaysRef.current?.resume()
          }
          return
        }

        const HERO_MAX = heroHeightRef.current
        const HERO_RANGE = HERO_MAX - HERO_MIN
        const y = window.scrollY
        // progress: 0→1 从页面顶部开始，滚动 300px 完成收缩
        const progress = Math.min(1, Math.max(0, y / 300))

        // 单次 height 写入（不读 DOM，无强制 reflow）
        const heroH = Math.round(HERO_MAX - HERO_RANGE * progress)
        hero.style.height = `${heroH}px`

        // SVG 从 100% 缩小到 80%
        const svgScale = 1 - 0.2 * progress
        if (svgBg) {
          const svgH = Math.round(heroHeightRef.current * svgScale)
          svgBg.style.backgroundSize = `auto ${svgH}px, auto ${svgH}px`
        }

        // 有筛选栏时：toolbar 跟随占位底部；无池子时不渲染 toolbar，仍允许 Hero 收缩
        if (toolbar) {
          const toolbarTop = Math.max(HERO_MIN, HERO_MAX - y)
          toolbar.style.top = `${toolbarTop}px`
        }

        // 第二行英文标题：opacity + 向上位移 + maxHeight 收缩布局空间，overflow:visible 不裁切
        const titleEn = titleEnRef.current
        if (titleEn) {
          titleEn.style.opacity = String(1 - progress)
          titleEn.style.transform = `translateY(${-12 * progress}px)`
          titleEn.style.maxHeight = `${Math.round(60 * (1 - progress))}px`
          titleEn.style.overflow = 'visible'
        }

        // 描述文字：opacity 从 progress=0.5 才开始衰减（与英文标题视觉消失速度对齐）
        const desc = descRef.current
        if (desc) {
          const descOpacity = Math.max(0, 1 - progress * 2)
          desc.style.opacity = String(descOpacity)
          desc.style.transform = `translateY(${-8 * progress}px)`
          desc.style.maxHeight = `${Math.round(100 * (1 - progress))}px`
          desc.style.marginBottom = `${Math.round(40 * (1 - progress))}px`
          desc.style.overflow = 'visible'
        }

        // banner 收缩至最小时暂停 WebGL 动画，减轻 GPU 负载
        const shouldPause = progress >= 1
        if (shouldPause !== wasHeroPausedRef.current) {
          wasHeroPausedRef.current = shouldPause
          if (shouldPause) {
            particlesRef.current?.pause()
            lightRaysRef.current?.pause()
          } else {
            particlesRef.current?.resume()
            lightRaysRef.current?.resume()
          }
        }
      })
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    // 初始化一次，确保刷新页面时值正确
    onScroll()
    return () => {
      window.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(rafId)
    }
  }, [])

  // 无池子时禁止页面滚动，避免触发 banner 收缩
  useEffect(() => {
    if (poolsLoading) return
    if (pools.length === 0) {
      document.documentElement.style.overflow = 'hidden'
      window.scrollTo(0, 0)
      return () => {
        document.documentElement.style.overflow = ''
      }
    }
  }, [poolsLoading, pools.length])

  // 列表加载完成或池子数量变化时同步一次 Hero（含从加载态进入空首页）
  useEffect(() => {
    if (poolsLoading) return
    const id = requestAnimationFrame(() => window.dispatchEvent(new Event('scroll')))
    return () => cancelAnimationFrame(id)
  }, [poolsLoading, pools.length])

  // 闲置 10 秒后自动暂停 WebGL，用户有任何操作立刻恢复
  useEffect(() => {
    const IDLE_MS = 10_000
    let idleTimer: ReturnType<typeof setTimeout> | null = null
    let isIdlePaused = false

    const onActivity = () => {
      if (idleTimer) clearTimeout(idleTimer)
      // 若之前因闲置暂停，恢复 WebGL（需确认 banner 未完全收缩）
      if (isIdlePaused) {
        isIdlePaused = false
        const y = typeof window !== 'undefined' ? window.scrollY : 0
        const progress = Math.min(1, Math.max(0, y / 300))
        if (progress < 1) {
          particlesRef.current?.resume()
          lightRaysRef.current?.resume()
        }
      }
      idleTimer = setTimeout(() => {
        isIdlePaused = true
        particlesRef.current?.pause()
        lightRaysRef.current?.pause()
      }, IDLE_MS)
    }

    const EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'] as const
    EVENTS.forEach(e => window.addEventListener(e, onActivity, { passive: true }))
    onActivity() // 初始化计时器

    return () => {
      EVENTS.forEach(e => window.removeEventListener(e, onActivity))
      if (idleTimer) clearTimeout(idleTimer)
    }
  }, [])

  // Tab 隐藏时暂停 WebGL，恢复时根据当前滚动位置决定是否恢复
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        particlesRef.current?.pause()
        lightRaysRef.current?.pause()
      } else {
        const y = typeof window !== 'undefined' ? window.scrollY : 0
        const progress = Math.min(1, Math.max(0, y / 300))
        if (progress >= 1) {
          wasHeroPausedRef.current = true
        } else {
          wasHeroPausedRef.current = false
          particlesRef.current?.resume()
          lightRaysRef.current?.resume()
        }
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [])

  const handleViewRound = useCallback((poolId: string, round: number | undefined) => {
    setViewingRoundByPool((prev) => {
      const next = { ...prev }
      if (round == null) delete next[poolId]
      else next[poolId] = round
      return next
    })
  }, [])

  const handleIdeaOpen = useCallback((idea: IdeaDetail, poolId: string) => {
    setDrawerFocusFeedback(false)
    setSelectedIdea(idea)
    const p = allPoolsRef.current.find((x) => x.id === poolId)
    if (p) setSelectedPool(p)
  }, [])

  const handleIdeaOpenForFeedback = useCallback((idea: IdeaDetail, poolId: string) => {
    setDrawerFocusFeedback(true)
    setSelectedIdea(idea)
    const p = allPoolsRef.current.find((x) => x.id === poolId)
    if (p) setSelectedPool(p)
  }, [])

  const fetchPools = useCallback(async () => {
    const res = await fetch('/api/pools')
    const data = await res.json()
    setPools(data.pools ?? [])
  }, [])

  useEffect(() => {
    const ac = new AbortController()
    fetch('/api/pools', { signal: ac.signal })
      .then((r) => r.json())
      .then((d) => setPools(d.pools ?? []))
      .catch((e) => {
        if (e instanceof DOMException && e.name === 'AbortError') return
        if (e?.name === 'AbortError') return
        setPools([])
      })
      .finally(() => setPoolsLoading(false))
    return () => ac.abort()
  }, [])

  useEffect(() => {
    return () => {
      if (postCreateBubbleTimerRef.current) {
        clearTimeout(postCreateBubbleTimerRef.current)
        postCreateBubbleTimerRef.current = null
      }
      removeTimersRef.current.forEach(clearTimeout)
      removeTimersRef.current.clear()
    }
  }, [])

  const triggerPoolBubble = useCallback((poolId: string) => {
    const MAX_ACTIVE_BUBBLES = 3
    const BUBBLE_DURATION_MS = 3200
    const POOL_COOLDOWN_MS = 4500
    const GLOBAL_GAP_MS = 900
    const now = Date.now()
    if (now < nextGlobalBubbleAtRef.current) return
    if (now < (bubbleCooldownByPoolRef.current[poolId] ?? 0)) return

    const pool = allPoolsRef.current.find((item) => item.id === poolId)
    if (!pool) return

    const candidates = [...pool.ideas]
      .filter((idea) => idea.current_version?.content)
      .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999))
      .slice(0, 9)
    if (candidates.length === 0) return

    setActiveBubbles((prev) => {
      if (prev.length >= MAX_ACTIVE_BUBBLES) return prev
      if (prev.some((bubble) => bubble.poolId === poolId)) return prev

      const activeIdeaIds = new Set(prev.map((bubble) => bubble.ideaId))
      const available = candidates.filter((idea) => !activeIdeaIds.has(idea.id))
      const picked = available[Math.floor(Math.random() * available.length)] ?? candidates[0]
      if (!picked) return prev

      const key = ++bubbleKeyRef.current
      const tid = setTimeout(() => {
        setActiveBubbles((current) => current.filter((bubble) => bubble.key !== key))
        removeTimersRef.current.delete(key)
      }, BUBBLE_DURATION_MS)

      removeTimersRef.current.set(key, tid)
      bubbleCooldownByPoolRef.current[poolId] = now + POOL_COOLDOWN_MS
      nextGlobalBubbleAtRef.current = now + GLOBAL_GAP_MS

      return [...prev, { key, poolId, ideaId: picked.id, text: getBubbleText(picked.rank) }]
    })
  }, [])

  const handleToggleTrack = useCallback((poolId: string) => {
    setTrackedIds((prev) => {
      const next = new Set(prev)
      if (next.has(poolId)) next.delete(poolId)
      else next.add(poolId)
      try { localStorage.setItem('idea-bazaar-tracked-ids', JSON.stringify([...next])) } catch { /* ignore */ }
      return next
    })
    triggerPoolBubble(poolId)
  }, [triggerPoolBubble])

  const handleCreatePool = async () => {
    const trimmed = keyword.trim()
    if (!trimmed) return

    setLoading(true)
    setError('')

    try {
      const formData = new FormData()
      formData.append('keyword', trimmed)
      if (description.trim()) formData.append('description', description.trim())
      formData.append('iteration_mode', iterationMode)
      createPoolFiles.forEach((f) => formData.append('files', f))

      const res = await fetch('/api/pools', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? '创建失败，请重试')
        return
      }
      await fetchPools()
      setShowCreateForm(false)
      setKeyword('')
      setDescription('')
      setCreatePoolFiles([])
      setFilter('all')
      if (data.pool?.id) {
        if (postCreateBubbleTimerRef.current) clearTimeout(postCreateBubbleTimerRef.current)
        postCreateBubbleTimerRef.current = setTimeout(() => {
          postCreateBubbleTimerRef.current = null
          triggerPoolBubble(data.pool.id)
        }, 300)
      }
    } catch {
      setError('网络错误，请检查配置后重试')
    } finally {
      setLoading(false)
    }
  }

  const handleRunIteration = useCallback(async (poolId: string, nextIteration: number) => {
    if (iteratingPoolIdRef.current) return
    setIteratingPoolId(poolId)
    setError('')

    try {
      const res = await fetch(`/api/pools/${poolId}/iterate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ iteration: nextIteration }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? `第${nextIteration + 1}轮迭代失败`)
        await fetchPools()
        return
      }
      const updatedPool = data.pool as PoolDetail
      setPools((prev) => prev.map((p) => (p.id === poolId ? updatedPool : p)))
      const sp = selectedPoolRef.current
      const si = selectedIdeaRef.current
      if (sp?.id === poolId && si) {
        const freshIdea = updatedPool.ideas.find((i) => i.id === si.id)
        if (freshIdea) setSelectedIdea(freshIdea)
      }
      triggerPoolBubble(poolId)
    } catch {
      setError('迭代请求失败，请重试')
    } finally {
      setIteratingPoolId(null)
    }
  }, [fetchPools, triggerPoolBubble])

  const handleExport = (poolId: string) => {
    window.open(`/api/pools/${poolId}/export?format=markdown&topN=9`, '_blank')
  }

  /** 调试：自动完成当前选中池子的后续全部轮次（用户共 3 轮） */
  const handleDebugComplete4 = async () => {
    const target = selectedPool ?? pools.find((p) => (p.iteration ?? 0) < 2)
    if (!target || (target.iteration ?? 0) >= 2) {
      setError(selectedPool ? '该池子已完成 3 轮' : '没有可完成的池子')
      return
    }
    setIteratingPoolId(target.id)
    setError('')
    let currentPool = target
    try {
      for (let next = (currentPool.iteration ?? 0) + 1; next <= 2; next++) {
        const res = await fetch(`/api/pools/${currentPool.id}/iterate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ iteration: next }),
        })
        const data = await res.json()
        if (!res.ok) {
          setError(data.error ?? `第${next}轮失败`)
          await fetchPools()
          return
        }
        currentPool = data.pool as PoolDetail
        setPools((prev) => prev.map((p) => (p.id === currentPool.id ? currentPool : p)))
      }
      triggerPoolBubble(target.id)
    } catch {
      setError('调试完成失败')
    } finally {
      setIteratingPoolId(null)
    }
  }

  const handleEditPool = useCallback(async (
    poolId: string,
    payload: { remove: string[]; files: File[]; description?: string }
  ): Promise<boolean> => {
    setError('')
    const formData = new FormData()
    formData.append('remove', JSON.stringify(payload.remove))
    payload.files.forEach((f) => formData.append('files', f))
    if (payload.description !== undefined) formData.append('description', payload.description)
    const res = await fetch(`/api/pools/${poolId}`, {
      method: 'PATCH',
      body: formData,
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error ?? '更新附件失败')
      return false
    }
    await fetchPools()
    return true
  }, [fetchPools])

  const handleDeletePool = useCallback(async (poolId: string) => {
    setError('')
    const res = await fetch(`/api/pools/${poolId}`, { method: 'DELETE' })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error ?? '删除失败')
      return
    }
    setPools((prev) => prev.filter((p) => p.id !== poolId))
    setActiveBubbles((prev) => prev.filter((bubble) => bubble.poolId !== poolId))
    setSelectedIdea((cur) => {
      const sp = selectedPoolRef.current
      return cur && sp?.id === poolId ? null : cur
    })
    setSelectedPool((cur) => (cur?.id === poolId ? null : cur))
    setViewingRoundByPool((prev) => { const n = { ...prev }; delete n[poolId]; return n })
  }, [])

  const handlePoolPatchInList = useCallback((updated: PoolDetail) => {
    setPools((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
  }, [])

  const filteredPools = useMemo(() => pools.filter((p) => {
    if (filter === 'running') return (p.iteration ?? 0) < 2
    if (filter === 'done') return (p.iteration ?? 0) >= 2
    if (filter === 'tracking') return trackedIds.has(p.id)
    return true
  }), [pools, filter, trackedIds])

  // 预计算每个 pool 的气泡 map，避免在 JSX 渲染时对每个 pool 重复 filter+map
  const bubbleMapByPool = useMemo(() => {
    const map: Record<string, Record<string, string>> = {}
    for (const b of activeBubbles) {
      if (!map[b.poolId]) map[b.poolId] = {}
      map[b.poolId][b.ideaId] = b.text
    }
    return map
  }, [activeBubbles])

  // 自动迭代轮询：每 30s 检查 next_iterate_at，到点且未完成则触发下一轮
  // 使用 ref 读取最新状态，依赖数组为 []，避免每次 pools/iteratingPoolId 变化都重置 30s 计时器
  const handleRunIterationRef = useRef(handleRunIteration)
  handleRunIterationRef.current = handleRunIteration

  useEffect(() => {
    const checkNow = () => {
      if (iteratingPoolIdRef.current) return
      const now = Date.now()
      for (const pool of allPoolsRef.current) {
        // manual 模式的池子跳过自动轮询，由用户手动触发
        if (pool.iteration_mode === 'manual' || pool.awaiting_round_confirm) continue
        if (!pool.next_iterate_at || (pool.iteration ?? 0) >= 2 || pool.status === 'running') continue
        if (new Date(pool.next_iterate_at).getTime() <= now) {
          handleRunIterationRef.current(pool.id, (pool.iteration ?? 0) + 1)
          break
        }
      }
    }
    // 挂载后立即检查一次，避免已过期的池子等待最长 30s
    checkNow()
    const timer = setInterval(checkNow, 30_000)
    return () => clearInterval(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // 所有读取都通过 ref，timer 永久稳定，不随 state 重建

  // 后台种子生成中：定时拉列表，避免创建池子后长时间看不到创意
  const hasRunningPool = pools.some((p) => p.status === 'running')
  useEffect(() => {
    if (!hasRunningPool) return
    const id = setInterval(() => {
      void fetchPools()
    }, 2500)
    return () => clearInterval(id)
  }, [hasRunningPool, fetchPools])

  // ── 初始加载中 ──────────────────────────────────────────────────────────────
  if (poolsLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-zinc-500 text-sm">加载中…</p>
        </div>
      </main>
    )
  }

  const handleCloseModal = () => {
    setShowCreateForm(false)
    setKeyword('')
    setDescription('')
    setIterationMode('confirm')
    setCreatePoolFiles([])
    setError('')
  }

  // ── Hero + 可选筛选栏 + 内容区（无池子时仍显示完整 banner） ─────────────────
  return (
    <main
      className={cn(
        'flex flex-col',
        pools.length === 0 ? 'h-screen min-h-0 overflow-hidden' : 'min-h-screen'
      )}
    >

      {/* 占位 div：保证内容不被 fixed hero 遮盖；无池子时全屏，有池子时为 heroHeight */}
      <div style={{ height: pools.length === 0 ? '100vh' : heroHeight, flexShrink: 0 }} aria-hidden />

      {/* ① Hero 区：fixed 脱离文档流，height 由 RAF 写入，无 reflow */}
      <section
        ref={heroRef}
        className="fixed top-0 left-0 right-0 z-20 px-[clamp(1rem,5vw,6rem)] text-center flex flex-col items-center justify-center overflow-hidden bg-center"
        style={{
          height: pools.length === 0 ? '100vh' : heroHeight,
          backgroundColor: '#000000',
        }}
      >
        {/* LightRays 顶部背光 */}
        <div className="absolute inset-0 z-[1]">
          <LightRaysWithRef ref={lightRaysRef} {...lightRaysParams} />
        </div>
        {/* Particles 粒子背景层 */}
        <div className="absolute inset-0 z-[2]">
          <ParticlesWithRef
            ref={particlesRef}
            particleCount={80}
            particleSpread={10}
            speed={0.2}
            particleColors={PARTICLES_COLORS}
            moveParticlesOnHover={false}
            particleHoverFactor={1.5}
            alphaParticles={false}
            particleBaseSize={100}
            sizeRandomness={0.8}
            cameraDistance={50}
            disableRotation={true}
          />
        </div>
        {/* ideablue.svg、ideazi.svg 最上层，中心对称，随 banner 收缩 */}
        <div
          ref={svgBgRef}
          className="absolute inset-0 z-[30] pointer-events-none bg-no-repeat"
          style={{
            backgroundImage: 'url(/ideablue.svg), url(/ideazi.svg)',
            backgroundSize:
              pools.length === 0
                ? 'auto 100vh, auto 100vh'
                : `auto ${heroHeight}px, auto ${heroHeight}px`,
            backgroundPosition: 'calc(50% + 500px) 20%, calc(50% - 500px) 20%',
            backgroundRepeat: 'no-repeat, no-repeat',
          }}
        />
        {/* 底部黑色渐变蒙层 */}
        <div
          className="absolute inset-0 z-[35] pointer-events-none"
          style={{
            background: `linear-gradient(to bottom, transparent ${overlayParams.fadeStart}%, rgba(0,0,0,${overlayParams.fadeMidOpacity}) ${overlayParams.fadeMid}%, #000 ${overlayParams.fadeEnd}%)`,
          }}
        />
        <div className="relative z-10 flex flex-col items-center w-full transition-[gap,margin] duration-150 ease-out">
        <h1 className="font-bold tracking-tight text-zinc-100 text-[56px] leading-tight mb-[30px] shrink-0 text-center">
          <span className="block">{t('heroTitle')}</span>
          <span ref={titleEnRef} className="block mt-1" style={{ willChange: 'opacity, transform' }}>{t('heroSubtitle')}</span>
        </h1>
        <p
          ref={descRef}
          className="text-zinc-400 text-base md:text-lg max-w-xl mx-auto leading-relaxed shrink-0"
          style={{ willChange: 'opacity, transform', marginBottom: 40 }}
        >
          {t('heroDesc')}
        </p>

        <button
          onClick={() => setShowCreateForm(true)}
          className="inline-flex items-center justify-center gap-2 rounded-2xl text-base font-semibold px-6 w-[240px] h-[60px] bg-violet-600 hover:bg-violet-500 text-white transition-all shadow-lg shadow-violet-900/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 shrink-0"
        >
          <svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="currentColor">
            <path d="M700.562286 387.657143q-47.469714-16.091429-63.780572-63.341714l-69.485714-201.728q-17.554286-51.273143-56.685714-51.2-39.058286 0.073143-56.466286 51.419428l-67.876571 200.045714q-16.091429 47.323429-63.488 63.414858L124.342857 453.778286q-51.2 17.481143-51.419428 56.539428-0.146286 39.131429 50.980571 56.905143l197.412571 68.754286q47.469714 16.530286 63.780572 64l68.900571 200.265143q17.627429 51.2 56.685715 51.2 39.058286-0.146286 56.393142-51.565715l67.291429-199.314285q15.945143-47.396571 63.268571-63.634286l201.654858-69.046857q51.346286-17.554286 51.2-56.612572 0-39.058286-51.419429-56.466285L700.562286 387.657143zM567.588571 348.16q27.940571 81.188571 109.421715 108.836571l161.133714 54.491429-164.352 56.32q-81.408 27.794286-108.909714 109.348571l-54.637715 162.084572-56.100571-163.035429Q426.276571 595.090286 345.234286 566.857143l-161.206857-56.100572 162.377142-55.222857q81.408-27.721143 109.129143-109.202285l55.369143-163.108572 56.758857 164.864z" />
            <path d="M883.638857 111.542857c-3.510857-10.093714-9.142857-10.093714-12.580571 0l-19.382857 57.197714a44.617143 44.617143 0 0 1-24.649143 24.649143l-56.758857 19.309715c-10.093714 3.437714-10.093714 9.142857 0 12.653714l56.32 19.602286c10.166857 3.510857 21.211429 14.628571 24.722285 24.868571l19.675429 57.124571c3.510857 10.093714 9.142857 10.093714 12.507428 0l19.236572-57.051428a44.617143 44.617143 0 0 1 24.576-24.649143l57.636571-19.748571c10.093714-3.437714 10.093714-9.069714 0-12.507429l-56.685714-19.163429a44.836571 44.836571 0 0 1-24.795429-24.649142l-19.821714-57.636572z" />
          </svg>
          {t('newPool')}
        </button>
        </div>

        {/* 右上角：语言切换 + AI 状态徽标 + 设置按钮 */}
        <div className="absolute top-4 right-5 z-[40] flex items-center gap-2">
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full border font-medium transition-colors ${
              useMockMode
                ? 'bg-zinc-800/80 border-zinc-600/50 text-zinc-400'
                : 'bg-emerald-900/60 border-emerald-500/40 text-emerald-300'
            }`}
          >
            {useMockMode ? t('mockMode') : t('realAI')}
          </span>
          {/* Language toggle */}
          <button
            onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
            className="h-8 px-2.5 rounded-lg flex items-center gap-1.5 bg-zinc-900/80 border border-zinc-700/50 text-zinc-400 hover:text-zinc-200 hover:border-violet-500/50 hover:bg-zinc-800 transition-all text-[11px] font-medium"
            title={lang === 'zh' ? 'Switch to English' : '切换为中文'}
          >
            <Languages size={13} />
            {lang === 'zh' ? 'EN' : '中'}
          </button>
          <button
            type="button"
            onClick={() => setBraveConfigOpen(true)}
            className="w-8 h-8 rounded-lg flex items-center justify-center bg-zinc-900/80 border border-zinc-700/50 text-zinc-400 hover:text-orange-300 hover:border-orange-500/40 hover:bg-zinc-800 transition-all"
            title={t('braveSearchConfigTitle')}
          >
            <Globe size={15} />
          </button>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="w-8 h-8 rounded-lg flex items-center justify-center bg-zinc-900/80 border border-zinc-700/50 text-zinc-400 hover:text-zinc-200 hover:border-violet-500/50 hover:bg-zinc-800 transition-all"
            title={t('settingsTitle')}
          >
            <Settings size={15} />
          </button>
        </div>
      </section>

      {/* 新建创意池弹窗：全局唯一，挂在 main 根节点 */}
      <CreatePoolModal
        open={showCreateForm}
        value={keyword}
        onChange={setKeyword}
        description={description}
        onDescriptionChange={setDescription}
        iterationMode={iterationMode}
        onIterationModeChange={setIterationMode}
        files={createPoolFiles}
        onFilesChange={setCreatePoolFiles}
        loading={loading}
        error={error}
        onSubmit={handleCreatePool}
        onClose={handleCloseModal}
      />

      {/* 大模型设置面板 */}
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onModeChange={(useMock) => setUseMockMode(useMock)}
      />

      <BraveSearchConfigModal open={braveConfigOpen} onClose={() => setBraveConfigOpen(false)} />

      {/* ② Fixed 工具栏：有池子时显示，top 由 RAF 更新 */}
      {pools.length > 0 && (
        <div
          ref={toolbarRef}
          className="fixed left-0 right-0 z-20 bg-black"
          style={{ top: heroHeight }}
        >
          <div className="max-w-[1600px] mx-auto px-[clamp(1rem,5vw,6rem)] py-3 flex items-center justify-center gap-2">
            {(['all', 'running', 'done', 'tracking'] as FilterType[]).map((f) => {
              const labels: Record<FilterType, string> = {
                all: t('filterAll'),
                running: t('filterRunning'),
                done: t('filterDone'),
                tracking: t('filterTracking'),
              }
              const counts: Record<FilterType, number> = {
                all: pools.length,
                running: pools.filter((p) => (p.iteration ?? 0) < 2).length,
                done: pools.filter((p) => (p.iteration ?? 0) >= 2).length,
                tracking: trackedIds.size,
              }
              const isActive = filter === f
              return (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    'px-4 py-2 rounded-full text-sm font-medium flex items-center gap-2',
                    'transition-all duration-200 ease-out',
                    isActive
                      ? 'bg-zinc-800 text-zinc-100'
                      : 'bg-zinc-900 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
                  )}
                >
                  {labels[f]}
                  <span className={cn(
                    'text-xs px-2 py-0.5 rounded-full font-medium',
                    isActive ? 'bg-zinc-700 text-zinc-300' : 'bg-zinc-800 text-zinc-500'
                  )}>
                    {counts[f]}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ③ 卡片网格 */}
      <div
        className={cn(
          'flex-1 max-w-[1600px] mx-auto w-full px-[clamp(1rem,5vw,6rem)] pb-8 min-h-[min(50vh,480px)]',
          pools.length > 0 ? 'pt-[84px]' : 'pt-8'
        )}
      >
        {error && (
          <p className="text-xs text-rose-400 mb-4 text-center">{error}</p>
        )}

        {pools.length === 0 ? null : filteredPools.length === 0 ? (
          <div className="py-24 text-center">
            <p className="text-zinc-500 text-sm">该分类下暂无池子</p>
          </div>
        ) : (
          <div className="flex flex-wrap justify-center items-start gap-6">
            {filteredPools.map((pool) => (
              <div
                key={pool.id}
                className="w-full min-w-[280px] max-w-[420px] self-start"
                onMouseEnter={() => triggerPoolBubble(pool.id)}
              >
                <PoolColumn
                  pool={pool}
                  poolIndex={(() => {
                    const i = pools.findIndex((p) => p.id === pool.id)
                    return (i >= 0 ? i : 0) % POOL_THEMES.length
                  })()}
                  onIdeaClick={handleIdeaOpen}
                  onIdeaFeedback={handleIdeaOpenForFeedback}
                  isRunning={iteratingPoolId === pool.id}
                  isTracked={trackedIds.has(pool.id)}
                  onTrack={handleToggleTrack}
                  onRunIteration={handleRunIteration}
                  onViewRound={handleViewRound}
                  viewRound={viewingRoundByPool[pool.id]}
                  bubbleTextMap={bubbleMapByPool[pool.id]}
                  onEdit={handleEditPool}
                  onDelete={handleDeletePool}
                  onDirectionSwitch={handlePoolPatchInList}
                  onConfirmRound={handlePoolPatchInList}
                  onPoolUpdated={handlePoolPatchInList}
                />
              </div>
            ))}
          </div>
        )}

        {/* 调试：自动完成 3 轮 */}
        {pools.length > 0 && (
          <button
            type="button"
            onClick={handleDebugComplete4}
            disabled={!!iteratingPoolId}
            title="自动完成当前池子 3 轮迭代"
            className="fixed bottom-6 right-6 z-30 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-400 text-xs font-medium hover:bg-amber-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Zap size={14} />
            调试完成3轮
          </button>
        )}

        {/* 创意详情抽屉 */}
        {selectedIdea && selectedPool && (
          <IdeaDrawer
            idea={selectedIdea}
            poolId={selectedPool.id}
            poolDirection={selectedPool.direction ?? ''}
            onClose={() => {
              setSelectedIdea(null)
              setSelectedPool(null)
              setDrawerFocusFeedback(false)
            }}
            onFeedbackSaved={fetchPools}
            initialViewRound={viewingRoundByPool[selectedPool.id]}
            poolIteration={selectedPool.iteration}
            pool={selectedPool}
            autoFocusFeedback={drawerFocusFeedback}
            colorIndex={(() => {
              const listIdx = pools.findIndex((p) => p.id === selectedPool.id)
              const base = (listIdx >= 0 ? listIdx : 0) % POOL_THEMES.length
              // 用 slot（固定，1-9）而非 rank，保证颜色与格子稳定一致
              const cellIndex = (selectedIdea.slot ?? 1) - 1
              return (base + cellIndex) % POOL_THEMES.length
            })()}
          />
        )}
      </div>
    </main>
  )
}
