'use client'

import { useRef, useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { X, Paperclip, ArrowRight, Sparkles, Zap, Clock, Search, ChevronLeft, Globe, Square, ThumbsUp, Flame, ExternalLink, RefreshCw } from 'lucide-react'
import MentionTextarea from './MentionTextarea'
import type { RecommendCard } from '@/types'
import { useLanguage } from '@/contexts/LanguageContext'

const ACCEPT_FILES = '.txt,.md,.pdf,.doc,.docx,.png,.jpg,.jpeg,.webp'
const MAX_FILES = 5
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024

export type IterationMode = 'auto' | 'confirm'

interface CreatePoolModalProps {
  open: boolean
  value: string
  onChange: (v: string) => void
  description: string
  onDescriptionChange: (v: string) => void
  iterationMode: IterationMode
  onIterationModeChange: (mode: IterationMode) => void
  files: File[]
  onFilesChange: (files: File[]) => void
  loading: boolean
  error: string
  onSubmit: () => void
  onClose: () => void
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function CreatePoolModal({
  open,
  value,
  onChange,
  description,
  onDescriptionChange,
  iterationMode,
  onIterationModeChange,
  files,
  onFilesChange,
  loading,
  error,
  onSubmit,
  onClose,
}: CreatePoolModalProps) {
  const { t, lang } = useLanguage()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const superQueryRef = useRef<HTMLInputElement>(null)

  // 超级AI推荐面板内部状态
  const [superOpen, setSuperOpen] = useState(false)
  const [superQuery, setSuperQuery] = useState('')
  const [superLoading, setSuperLoading] = useState(false)
  const [superCards, setSuperCards] = useState<RecommendCard[]>([])
  const [superError, setSuperError] = useState('')
  const superAbortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => nameInputRef.current?.focus(), 80)
      return () => clearTimeout(t)
    }
  }, [open])

  // 弹窗关闭时重置超级推荐面板，并取消进行中的搜索
  useEffect(() => {
    if (!open) {
      superAbortRef.current?.abort()
      superAbortRef.current = null
      setSuperOpen(false)
      setSuperQuery('')
      setSuperCards([])
      setSuperError('')
      setSuperLoading(false)
    }
  }, [open])

  useEffect(() => {
    if (superOpen) {
      const t = setTimeout(() => superQueryRef.current?.focus(), 80)
      return () => clearTimeout(t)
    }
  }, [superOpen])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (superOpen) setSuperOpen(false)
        else onClose()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose, superOpen])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files
    if (!selected?.length) return
    const next: File[] = [...files]
    for (let i = 0; i < selected.length && next.length < MAX_FILES; i++) {
      const f = selected[i]
      if (f.size > MAX_FILE_SIZE_BYTES) continue
      next.push(f)
    }
    onFilesChange(next.slice(0, MAX_FILES))
    e.target.value = ''
  }

  const removeFile = (idx: number) => onFilesChange(files.filter((_, i) => i !== idx))

  const handlePasteFiles = (pasted: File[]) => {
    const next = [...files]
    for (const f of pasted) {
      if (next.length >= MAX_FILES) break
      if (f.size > MAX_FILE_SIZE_BYTES) continue
      next.push(f)
    }
    onFilesChange(next)
  }

  const handleSuperSearch = async (opts?: { refresh?: boolean }) => {
    const q = superQuery.trim()
    if (!q || superLoading) return
    const refresh = opts?.refresh === true
    if (refresh && superCards.length === 0) return
    // 取消上一次未完成的请求
    superAbortRef.current?.abort()
    const ctrl = new AbortController()
    superAbortRef.current = ctrl
    setSuperLoading(true)
    setSuperError('')
    setSuperCards([])
    const payload: {
      query: string
      lang: 'zh' | 'en'
      excludeKeywords?: string[]
      excludePostUrls?: string[]
    } = { query: q, lang }
    if (refresh) {
      payload.excludeKeywords = superCards.map((c) => c.keyword).filter(Boolean)
      payload.excludePostUrls = superCards
        .flatMap((c) => [c.postUrl, ...(c.supportingPostUrls ?? [])])
        .filter((u): u is string => !!u && u.startsWith('http'))
    }
    try {
      const res = await fetch('/api/ai-recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      })
      const data = (await res.json().catch(() => ({}))) as { cards?: RecommendCard[]; error?: string }
      if (!res.ok) {
        setSuperError(typeof data.error === 'string' ? data.error : t('searchFailed'))
      } else {
        setSuperCards(Array.isArray(data.cards) ? data.cards : [])
        if (!data.cards?.length) setSuperError(t('noResultsFound'))
      }
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        setSuperError('')
      } else {
        setSuperError(t('networkError'))
      }
    } finally {
      setSuperLoading(false)
      if (superAbortRef.current === ctrl) superAbortRef.current = null
    }
  }

  const handleSuperCancel = () => {
    superAbortRef.current?.abort()
    superAbortRef.current = null
    setSuperLoading(false)
    setSuperError('')
  }

  const handleApplyCard = (card: RecommendCard) => {
    onChange(card.keyword)
    onDescriptionChange(card.description)
    setSuperOpen(false)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* 遮罩：半透明磨砂 */}
      <div
        className="absolute inset-0 backdrop-blur-xl backdrop-saturate-150"
        style={{ background: 'rgba(9,9,11,0.55)' }}
        onClick={superOpen ? undefined : onClose}
        aria-hidden
      />

      {/* 弹窗卡片 */}
      <div
        className="relative z-10 w-full max-w-[520px] min-w-0 rounded-3xl border border-white/8 bg-zinc-950/80 backdrop-blur-2xl shadow-2xl shadow-black/70 animate-modal-in"
        role="dialog"
        aria-modal="true"
        aria-label="新建创意池"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT_FILES}
          multiple
          className="sr-only"
          onChange={handleFileChange}
        />

        {/* ── 超级AI推荐面板 ── */}
        {superOpen ? (
          <>
            {/* 面板顶栏 */}
            <div className="flex items-center gap-3 px-6 pt-5 pb-4 border-b border-zinc-800/60">
              <button
                type="button"
                onClick={() => setSuperOpen(false)}
                className="shrink-0 flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-100 transition-colors"
              >
                <ChevronLeft size={14} />
                {t('back')}
              </button>
              <div className="flex items-center gap-2 min-w-0">
                <Globe size={14} className="text-violet-400 shrink-0" />
                <span className="text-sm font-semibold text-zinc-100 truncate">{t('superAIRecommend')}</span>
                <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full border border-violet-500/40 bg-violet-500/10 text-violet-300 font-medium">Beta</span>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="ml-auto shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* 搜索框 */}
              <div className="space-y-2">
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  {t('superAIDesc')}<strong className="text-zinc-400 font-medium">{t('superAIDescBold')}</strong>{t('superAIDescSuffix')}
                </p>
                <div className="flex gap-2">
                  <input
                    ref={superQueryRef}
                    type="text"
                    value={superQuery}
                    onChange={(e) => setSuperQuery(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !superLoading) handleSuperSearch() }}
                    placeholder={t('searchPlaceholder')}
                    disabled={superLoading}
                    maxLength={200}
                    className="flex-1 min-w-0 rounded-xl px-3.5 py-2.5 text-sm text-zinc-100 bg-zinc-900 border border-zinc-700/60 focus:border-violet-500/60 focus:outline-none placeholder:text-zinc-600 disabled:opacity-60 transition-colors"
                  />
                  {superLoading ? (
                    <button
                      type="button"
                      onClick={handleSuperCancel}
                      className="shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium bg-zinc-700 hover:bg-zinc-600 text-zinc-200 transition-colors"
                    >
                      <Square size={12} className="fill-current" />
                      {t('pause')}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleSuperSearch()}
                      disabled={!superQuery.trim()}
                      className="shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <Search size={14} />
                      {t('searching')}
                    </button>
                  )}
                </div>
              </div>

              {/* 加载状态 */}
              {superLoading && (
                <div className="flex flex-col items-center gap-3 py-8 text-center">
                  <div className="relative w-10 h-10">
                    <div className="absolute inset-0 rounded-full border-2 border-violet-500/20" />
                    <div className="absolute inset-0 rounded-full border-2 border-t-violet-400 animate-spin" />
                    <Globe size={16} className="absolute inset-0 m-auto text-violet-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-zinc-300">{t('searchingStatus')}</p>
                    <p className="text-[11px] text-zinc-600 mt-0.5">{t('searchingSubtitle')}</p>
                    <p className="text-[10px] text-zinc-700 mt-1">{t('searchingHint')}</p>
                  </div>
                </div>
              )}

              {/* 错误提示 */}
              {!superLoading && superError && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
                  <p className="text-xs text-amber-400">{superError}</p>
                </div>
              )}

              {/* 结果卡片 */}
              {!superLoading && superCards.length > 0 && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[11px] text-zinc-500">
                      {t('foundOpportunities', superCards.length)}
                    </p>
                    <button
                      type="button"
                      onClick={() => void handleSuperSearch({ refresh: true })}
                      disabled={!superQuery.trim()}
                      className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium border border-zinc-600 bg-zinc-800/80 text-zinc-200 hover:border-violet-500/50 hover:bg-violet-500/10 hover:text-violet-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <RefreshCw size={12} />
                      {t('refreshBatch')}
                    </button>
                  </div>
                  <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-0.5">
                    {superCards.map((card, i) => (
                      <div
                        key={i}
                        className="rounded-2xl border border-zinc-700/60 bg-zinc-900/80 p-4 space-y-2.5 hover:border-zinc-600/80 transition-colors"
                      >
                        {/* 标题行 */}
                        <div className="flex items-start justify-between gap-3 min-w-0">
                          <div className="min-w-0 flex-1">
                            <h3 className="text-sm font-semibold text-zinc-100 truncate">{card.keyword}</h3>
                            {/* 来源 + 热度指标 */}
                            <div className="flex flex-wrap items-center gap-2 mt-1">
                              {card.source && (
                                <span className="inline-flex items-center gap-1 text-[10px] text-zinc-500">
                                  <Globe size={9} />
                                  {card.source}
                                </span>
                              )}
                              {card.upvotes != null && (
                                <span className="inline-flex items-center gap-1 text-[10px] text-amber-400/80">
                                  <ThumbsUp size={9} />
                                  {card.upvotes >= 1000
                                    ? `${(card.upvotes / 1000).toFixed(1)}k`
                                    : card.upvotes} {t('votes')}
                                </span>
                              )}
                              {card.hotScore != null && (
                                <span className="inline-flex items-center gap-1 text-[10px] text-orange-400/80">
                                  <Flame size={9} />
                                  {t('hotScore')} {card.hotScore}/10
                                </span>
                              )}
                              {card.postUrl ? (
                                <a
                                  href={card.postUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="inline-flex items-center gap-0.5 text-[10px] text-violet-400/80 hover:text-violet-300 transition-colors"
                                >
                                  <ExternalLink size={9} />
                                  {t('originalPost')}
                                </a>
                              ) : (
                                <span className="text-[10px] text-zinc-600">
                                  {t('noOriginalLink')}
                                </span>
                              )}
                              {card.supportingPostUrls && card.supportingPostUrls.length > 0 && (
                                <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-zinc-500">
                                  <span className="text-zinc-600">{t('supportingSources')}</span>
                                  {card.supportingPostUrls.map((u) => (
                                    <a
                                      key={u}
                                      href={u}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      className="text-sky-400/80 hover:text-sky-300 underline-offset-2 hover:underline"
                                    >
                                      ↗
                                    </a>
                                  ))}
                                </span>
                              )}
                            </div>
                            {card.postTitle && (
                              <p className="text-[10px] text-zinc-500 leading-snug mt-1.5 line-clamp-2" title={card.postTitle}>
                                <span className="text-zinc-600">{t('originalTitle')}</span>
                                {card.postTitle}
                              </p>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleApplyCard(card)}
                            className="shrink-0 flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1.5 rounded-lg bg-violet-600/90 hover:bg-violet-500 text-white transition-colors whitespace-nowrap"
                          >
                            {t('useThisIdea')}
                            <ArrowRight size={11} />
                          </button>
                        </div>
                        {/* 痛点 */}
                        <p className="text-[11px] text-rose-300/90 leading-relaxed font-medium">
                          {t('painPoint')}{card.painPoint}
                        </p>
                        {/* 描述 */}
                        <p className="text-[11px] text-zinc-400 leading-relaxed line-clamp-2">
                          {card.description}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 空态提示 */}
              {!superLoading && !superError && superCards.length === 0 && (
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-6 text-center">
                  <Globe size={24} className="mx-auto text-zinc-700 mb-2" />
                  <p className="text-xs text-zinc-500">{t('noResults')}</p>
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            {/* ── 正常建池表单 ── */}

            {/* 顶部标题栏 */}
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-zinc-800/60">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center">
                  <Sparkles size={15} className="text-violet-400" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-zinc-100">{t('createPoolTitle')}</h2>
                  <p className="text-[11px] text-zinc-500 mt-0.5">{t('createPoolSubtitle')}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                aria-label="关闭"
                className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* 表单主体 */}
            <form
              onSubmit={(e) => { e.preventDefault(); onSubmit() }}
              className="px-6 py-5 space-y-4 min-w-0 overflow-hidden"
            >
              {/* 名称 + 超级AI推荐入口 */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-medium text-zinc-400">
                    {t('projectName')} <span className="text-rose-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setSuperOpen(true)}
                    disabled={loading}
                    className="flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-lg text-violet-300 border border-violet-500/30 bg-violet-500/10 hover:bg-violet-500/20 hover:border-violet-500/50 transition-colors disabled:opacity-50"
                  >
                    <Globe size={11} />
                    {t('superAIRecommend')}
                  </button>
                </div>
                <input
                  ref={nameInputRef}
                  type="text"
                  value={value}
                  onChange={(e) => onChange(e.target.value)}
                  placeholder={t('projectNamePlaceholder')}
                  disabled={loading}
                  maxLength={60}
                  aria-label="项目名称"
                  className={cn(
                    'w-full rounded-xl px-4 py-3 text-sm text-zinc-100',
                    'bg-zinc-900 border transition-colors focus:outline-none',
                    'placeholder:text-zinc-600 disabled:opacity-60',
                    error
                      ? 'border-rose-500/60 focus:border-rose-500'
                      : 'border-zinc-700/60 focus:border-violet-500/60'
                  )}
                />
              </div>

              {/* 细节 */}
              <div className="space-y-1.5 min-w-0 overflow-hidden">
                <label className="block text-xs font-medium text-zinc-400">
                  {t('projectDetails')}
                  <span className="ml-1.5 text-zinc-600 font-normal">{t('optional')}</span>
                </label>
                <MentionTextarea
                  value={description}
                  onChange={onDescriptionChange}
                  mentionFiles={files.map((f) => ({ name: f.name }))}
                  placeholder={t('projectDetailsPlaceholder')}
                  disabled={loading}
                  rows={4}
                  maxLength={3000}
                  onPasteFiles={handlePasteFiles}
                  className="px-4 py-3 text-sm text-zinc-100 bg-zinc-900 border-zinc-700/60 focus:border-violet-500/60 placeholder:text-zinc-600"
                />
              </div>

              {/* 附件区 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-zinc-400">{t('references')}</label>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={loading || files.length >= MAX_FILES}
                    className={cn(
                      'flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors',
                      files.length >= MAX_FILES
                        ? 'text-zinc-600 cursor-not-allowed'
                        : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                    )}
                  >
                    <Paperclip size={12} />
                    {t('addFile')}
                    {files.length > 0 && (
                      <span className="ml-1 px-1.5 py-0.5 rounded-full bg-violet-500/20 text-violet-400 text-[10px] font-medium">
                        {files.length}/{MAX_FILES}
                      </span>
                    )}
                  </button>
                </div>
                {files.length > 0 && (
                  <ul className="space-y-1.5">
                    {files.map((f, i) => (
                      <li
                        key={`${f.name}-${i}`}
                        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-zinc-800/50 border border-zinc-700/30"
                      >
                        <Paperclip size={12} className="shrink-0 text-zinc-500" />
                        <span className="flex-1 text-xs text-zinc-300 truncate" title={f.name}>{f.name}</span>
                        <span className="shrink-0 text-[10px] text-zinc-600">{formatSize(f.size)}</span>
                        <button
                          type="button"
                          onClick={() => removeFile(i)}
                          disabled={loading}
                          className="shrink-0 w-5 h-5 flex items-center justify-center rounded-full text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700 transition-colors"
                        >
                          <X size={10} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                {/* 每轮确认 */}
                <button
                  type="button"
                  onClick={() => onIterationModeChange('confirm')}
                  className={cn(
                    'relative flex flex-col items-start gap-2 rounded-xl px-4 py-3.5 border text-left transition-all',
                    iterationMode === 'confirm'
                      ? 'border-amber-500/60 bg-amber-500/10'
                      : 'border-zinc-700/60 bg-zinc-900/60 hover:border-zinc-600 hover:bg-zinc-900'
                  )}
                >
                  <div className="flex items-center gap-2 w-full min-w-0">
                    <div className={cn(
                      'w-6 h-6 rounded-lg flex items-center justify-center shrink-0',
                      iterationMode === 'confirm' ? 'bg-amber-500/20 text-amber-400' : 'bg-zinc-800 text-zinc-500'
                    )}>
                      <Clock size={13} />
                    </div>
                    <span className={cn(
                      'text-xs font-semibold truncate',
                      iterationMode === 'confirm' ? 'text-zinc-100' : 'text-zinc-400'
                    )}>{t('confirmEachRound')}</span>
                    {iterationMode === 'confirm' && (
                      <span className="ml-auto w-3.5 h-3.5 rounded-full bg-amber-500 flex items-center justify-center shrink-0">
                        <svg viewBox="0 0 12 12" width="8" height="8" fill="white"><path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      </span>
                    )}
                  </div>
                  <p className={cn(
                    'text-[10px] leading-relaxed',
                    iterationMode === 'confirm' ? 'text-zinc-400' : 'text-zinc-600'
                  )}>
                    {t('confirmEachRoundDesc')}
                  </p>
                </button>

                {/* 自动推进 */}
                <button
                  type="button"
                  onClick={() => onIterationModeChange('auto')}
                  className={cn(
                    'relative flex flex-col items-start gap-2 rounded-xl px-4 py-3.5 border text-left transition-all',
                    iterationMode === 'auto'
                      ? 'border-violet-500/60 bg-violet-500/10'
                      : 'border-zinc-700/60 bg-zinc-900/60 hover:border-zinc-600 hover:bg-zinc-900'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      'w-6 h-6 rounded-lg flex items-center justify-center',
                      iterationMode === 'auto' ? 'bg-violet-500/20 text-violet-400' : 'bg-zinc-800 text-zinc-500'
                    )}>
                      <Zap size={13} />
                    </div>
                    <span className={cn(
                      'text-xs font-semibold',
                      iterationMode === 'auto' ? 'text-zinc-100' : 'text-zinc-400'
                    )}>{t('autoAdvance')}</span>
                    {iterationMode === 'auto' && (
                      <span className="ml-auto w-3.5 h-3.5 rounded-full bg-violet-500 flex items-center justify-center">
                        <svg viewBox="0 0 12 12" width="8" height="8" fill="white"><path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      </span>
                    )}
                  </div>
                  <p className={cn(
                    'text-[11px] leading-relaxed',
                    iterationMode === 'auto' ? 'text-zinc-400' : 'text-zinc-600'
                  )}>
                    {t('autoAdvanceDesc')}
                  </p>
                </button>
              </div>

              {/* 错误提示 */}
              {error && (
                <p className="text-xs text-rose-400 text-center py-1" role="alert">{error}</p>
              )}

              {/* 底部按钮 */}
              <div className="flex items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={loading}
                  className="flex-1 h-11 rounded-xl text-sm font-medium text-zinc-400 hover:text-zinc-200 bg-zinc-800/60 hover:bg-zinc-800 transition-colors disabled:opacity-50"
                >
                  {t('cancelLabel')}
                </button>
                <button
                  type="submit"
                  disabled={loading || !value.trim()}
                  aria-busy={loading}
                  className={cn(
                    'flex-[2] h-11 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all',
                    'bg-violet-600 hover:bg-violet-500 text-white',
                    'shadow-lg shadow-violet-900/30 hover:shadow-violet-900/50',
                    'disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none'
                  )}
                >
                  {loading ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      {t('creating')}
                    </>
                  ) : (
                    <>
                      {t('startCreate')}
                      <ArrowRight size={15} />
                    </>
                  )}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
