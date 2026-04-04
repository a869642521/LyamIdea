'use client'
import { memo } from 'react'
import { Loader2 } from 'lucide-react'
import { cn, scoreColor, trendIcon, trendColor, ideaCellTitle } from '@/lib/utils'
import { POOL_THEMES } from '@/lib/color-themes'
import type { IdeaDetail } from '@/types'
import { useLanguage } from '@/contexts/LanguageContext'

interface IdeaCardProps {
  idea: IdeaDetail
  onClick: (idea: IdeaDetail) => void
  /** 有值时在卡片上方显示聊天气泡 */
  bubbleText?: string
  /** 用户已对该创意留过指导时在右下角显示橙点 */
  hasFeedback?: boolean
  /** 点击「留指导」时触发（若未传则与 onClick 相同） */
  onFeedback?: (idea: IdeaDetail) => void
  /** 查看详情页：隐藏装饰 emoji，信息放顶部 */
  detailView?: boolean
  /** detailView 下强制使用指定主题颜色（0-4），覆盖 idea.id hash */
  colorIndex?: number
  /** 第 1～3 轮迭代进行中：格子覆层提示（与种子阶段「生成中」区分） */
  iterating?: boolean
  /** 覆层副文案，如「第 2 轮优化中」 */
  iteratingLabel?: string
  /** 第二轮结束后：可选「带入第三轮」（前三名自动入选，仅非前三显示按钮） */
  finalRoundPickMode?: boolean
  finalRoundPickSelected?: boolean
  finalRoundPickBusy?: boolean
  onToggleFinalRoundPick?: () => void
}

// 角色 / 人物相关 emoji（单码点，避免 ZWJ 拆分渲染为两个图标）
const ICONS = [
  '🧙', '🦸', '🦹', '🧝', '🧛', '🧟',
  '🧜', '🧚', '👷', '💂', '🕵', '🥷',
  '🤠', '🤴', '👸', '🤵', '🎅', '🤶',
  '🧞', '🧑', '🎭', '👑', '🧔', '👼',
]

const GRADIENTS = [
  'bg-gradient-to-br from-violet-500 to-indigo-600',
  'bg-gradient-to-br from-rose-500 to-pink-600',
  'bg-gradient-to-br from-amber-400 to-orange-500',
  'bg-gradient-to-br from-emerald-400 to-teal-600',
  'bg-gradient-to-br from-sky-400 to-blue-600',
  'bg-gradient-to-br from-fuchsia-500 to-purple-600',
  'bg-gradient-to-br from-lime-400 to-green-600',
  'bg-gradient-to-br from-cyan-400 to-sky-600',
]

const ICON_GLOW_SHADOWS = [
  'shadow-[0_8px_18px_4px_rgba(139,92,246,0.65)]',
  'shadow-[0_8px_18px_4px_rgba(244,63,94,0.65)]',
  'shadow-[0_8px_18px_4px_rgba(251,146,60,0.65)]',
  'shadow-[0_8px_18px_4px_rgba(52,211,153,0.65)]',
  'shadow-[0_8px_18px_4px_rgba(56,189,248,0.65)]',
  'shadow-[0_8px_18px_4px_rgba(217,70,239,0.65)]',
  'shadow-[0_8px_18px_4px_rgba(163,230,53,0.65)]',
  'shadow-[0_8px_18px_4px_rgba(34,211,238,0.65)]',
]

function pickIcon(id: string): string {
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0
  return ICONS[Math.abs(h) % ICONS.length]
}

function iconGradient(id: string): string {
  let h = 0
  for (const c of id) h = (h * 17 + c.charCodeAt(0)) | 0
  return GRADIENTS[Math.abs(h) % GRADIENTS.length]
}

function iconBottomGlow(id: string): string {
  let h = 0
  for (const c of id) h = (h * 17 + c.charCodeAt(0)) | 0
  return ICON_GLOW_SHADOWS[Math.abs(h) % ICON_GLOW_SHADOWS.length]
}

const CARD_BG_STYLES = [
  'bg-violet-500/10 border-violet-500/30',
  'bg-rose-500/10 border-rose-500/30',
  'bg-amber-500/10 border-amber-500/30',
  'bg-emerald-500/10 border-emerald-500/30',
  'bg-sky-500/10 border-sky-500/30',
  'bg-fuchsia-500/10 border-fuchsia-500/30',
  'bg-lime-500/10 border-lime-500/30',
  'bg-cyan-500/10 border-cyan-500/30',
]

function cardBgStyle(id: string): string {
  let h = 0
  for (const c of id) h = (h * 17 + c.charCodeAt(0)) | 0
  return CARD_BG_STYLES[Math.abs(h) % CARD_BG_STYLES.length]
}

const CARD_HOVER_GLOWS = [
  'hover:shadow-[0_0_20px_6px_rgba(139,92,246,0.45)] hover:border-violet-400/50',
  'hover:shadow-[0_0_20px_6px_rgba(244,63,94,0.45)] hover:border-rose-400/50',
  'hover:shadow-[0_0_20px_6px_rgba(251,146,60,0.45)] hover:border-amber-400/50',
  'hover:shadow-[0_0_20px_6px_rgba(52,211,153,0.45)] hover:border-emerald-400/50',
  'hover:shadow-[0_0_20px_6px_rgba(56,189,248,0.45)] hover:border-sky-400/50',
  'hover:shadow-[0_0_20px_6px_rgba(217,70,239,0.45)] hover:border-fuchsia-400/50',
  'hover:shadow-[0_0_20px_6px_rgba(163,230,53,0.45)] hover:border-lime-400/50',
  'hover:shadow-[0_0_20px_6px_rgba(34,211,238,0.45)] hover:border-cyan-400/50',
]

function hoverGlowStyle(id: string): string {
  let h = 0
  for (const c of id) h = (h * 17 + c.charCodeAt(0)) | 0
  return CARD_HOVER_GLOWS[Math.abs(h) % CARD_HOVER_GLOWS.length]
}

const BUBBLE_STYLES = [
  'bg-violet-500/95 border-violet-400 text-white after:!border-t-violet-500',
  'bg-rose-500/95 border-rose-400 text-white after:!border-t-rose-500',
  'bg-amber-500/95 border-amber-400 text-zinc-900 after:!border-t-amber-500',
  'bg-emerald-500/95 border-emerald-400 text-white after:!border-t-emerald-500',
  'bg-sky-500/95 border-sky-400 text-white after:!border-t-sky-500',
  'bg-fuchsia-500/95 border-fuchsia-400 text-white after:!border-t-fuchsia-500',
  'bg-lime-500/95 border-lime-400 text-zinc-900 after:!border-t-lime-500',
  'bg-cyan-500/95 border-cyan-400 text-white after:!border-t-cyan-500',
]

function bubbleStyle(id: string): string {
  let h = 0
  for (const c of id) h = (h * 17 + c.charCodeAt(0)) | 0
  return BUBBLE_STYLES[Math.abs(h) % BUBBLE_STYLES.length]
}

function rankStyle(rank: number | null): string {
  if (rank === 1) return 'bg-yellow-400 text-zinc-900 font-black'
  if (rank === 2) return 'bg-zinc-300 text-zinc-900 font-bold'
  if (rank === 3) return 'bg-amber-600 text-white font-bold'
  return 'bg-black/30 text-white/80 font-medium'
}

function IdeaCardInner({
  idea,
  onClick,
  bubbleText,
  hasFeedback,
  onFeedback,
  detailView,
  colorIndex,
  iterating = false,
  iteratingLabel,
  finalRoundPickMode = false,
  finalRoundPickSelected = false,
  finalRoundPickBusy = false,
  onToggleFinalRoundPick,
}: IdeaCardProps) {
  const { t } = useLanguage()
  const rankLabel = (rank: number | null, slot: number): string => {
    if (rank != null) return t('rankOrdinal', rank)
    return t('slotLabel', slot)
  }
  const version = idea.current_version
  const hasContent = !!version?.content
  const emoji = pickIcon(idea.id)
  const body = version?.content ?? ''
  const title = hasContent ? ideaCellTitle(body, idea.slot) : ''
  const isChallenger =
    hasContent && (body.includes('【重新挑战】') || version?.ai_changes?.includes('末位淘汰'))

  const theme = colorIndex != null ? POOL_THEMES[colorIndex % POOL_THEMES.length] : null
  const resolvedGradient    = theme ? theme.gradient    : iconGradient(idea.id)
  const resolvedGlow        = theme ? theme.glowShadow  : iconBottomGlow(idea.id)
  const resolvedCardBg      = theme ? theme.cardBg      : cardBgStyle(idea.id)
  const resolvedHoverGlow   = theme ? theme.hoverGlow   : hoverGlowStyle(idea.id)
  const resolvedBubbleStyle = theme ? theme.bubbleStyle : bubbleStyle(idea.id)

  if (!hasContent) {
    return (
      <div className="relative aspect-square rounded-2xl border border-zinc-800 bg-zinc-900/40 flex items-center justify-center overflow-hidden">
        <span className="text-zinc-700 text-xs font-mono">#{idea.slot}</span>
        {iterating && (
          <div className="absolute inset-0 z-[5] bg-zinc-950/60 backdrop-blur-[2px] flex flex-col items-center justify-center gap-1.5 pointer-events-none border border-violet-500/15">
            <Loader2
              size={detailView ? 16 : 13}
              className="animate-spin text-violet-400/80 shrink-0"
              aria-hidden
            />
            <span className="text-[9px] font-medium text-violet-200/85 text-center px-1 leading-tight">
              {iteratingLabel ?? t('iterating')}
            </span>
          </div>
        )}
      </div>
    )
  }

  // ── 详情页：背景已是机器人 SVG，卡片仅提供透明点击层 + 顶部信息 overlay ──
  if (detailView) {
    return (
      <div className="relative group aspect-square">
        {/* 全格透明点击按钮 */}
        <button
          onClick={() => onClick(idea)}
          className="absolute inset-0 rounded-2xl cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60"
          aria-label={title}
        />

        {/* 顶部信息条：名次（左绝对）| 标题（居中）| 分数（右绝对） */}
        <div className="pointer-events-none absolute inset-x-1.5 top-1.5 z-20 flex flex-col gap-0.5">
          {isChallenger && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-amber-500/20 border border-amber-500/40 text-amber-400 font-medium self-center leading-none">
              {t('retryChallenge')}
            </span>
          )}
          <div className="relative flex items-center justify-center min-h-[1.5rem]">
            <span
              className={cn(
                'absolute left-0 top-1/2 -translate-y-1/2',
                'text-[10px] px-1.5 rounded-full leading-none h-5 flex items-center',
                rankStyle(idea.rank)
              )}
            >
              {rankLabel(idea.rank, idea.slot)}
            </span>
            <span className="w-full px-10 box-border text-center text-[10px] font-semibold text-zinc-100 leading-snug line-clamp-2 drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]">
              {title}
            </span>
            <span
              className={cn(
                'absolute right-0 top-1/2 -translate-y-1/2',
                'text-[11px] font-bold tabular-nums drop-shadow-[0_1px_3px_rgba(0,0,0,0.7)]',
                scoreColor(idea.total_score)
              )}
            >
              {idea.total_score}
            </span>
          </div>
        </div>

        {/* 机器人「脸」中央：渐变 emoji 方块，与背景 SVG 的头部对齐 */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2 translate-y-[38px]">
          {bubbleText && (
            <div
              className={cn(
                'absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2',
                'animate-bubble-in border text-[11px] px-2.5 py-1.5 rounded-xl whitespace-nowrap shadow-lg',
                'after:content-[""] after:absolute after:top-full after:left-1/2 after:-translate-x-1/2',
                'after:border-4 after:border-transparent',
                resolvedBubbleStyle
              )}
            >
              {bubbleText}
            </div>
          )}
          <div
            className={cn(
              'w-10 h-10 rounded-xl flex items-center justify-center',
              resolvedGradient,
              resolvedGlow
            )}
          >
            <span className="text-2xl select-none leading-none">{emoji}</span>
          </div>
        </div>

        {/* 用户已留指导：右下角橙点 */}
        {hasFeedback && (
          <span
            className="pointer-events-none absolute bottom-1.5 right-1.5 z-20 w-2 h-2 rounded-full bg-amber-500 shadow-sm"
            title={t('leftGuidance')}
          />
        )}

        {/* 迭代覆层 */}
        {iterating && (
          <div
            className="absolute inset-0 z-[5] rounded-2xl bg-zinc-950/50 backdrop-blur-[2px] flex flex-col items-center justify-center gap-1 pointer-events-none border border-violet-500/20 shadow-[inset_0_0_0_1px_rgba(139,92,246,0.12)]"
            aria-hidden
          >
            <Loader2 size={18} className="animate-spin text-violet-400 shrink-0" />
            <span className="text-[9px] font-semibold text-violet-100/90 text-center px-1.5 leading-tight max-w-[90%]">
              {iteratingLabel ?? t('iteratingOpt')}
            </span>
          </div>
        )}

        {/* 第三轮勾选 */}
        {finalRoundPickMode && !iterating && (
          <div className="absolute bottom-1 left-1 right-1 z-[6] flex justify-center pointer-events-none">
            <div className="pointer-events-auto max-w-full">
              {(idea.rank ?? 999) <= 3 ? (
                <span className="inline-flex items-center rounded-md bg-emerald-500/20 border border-emerald-500/35 px-2 py-0.5 text-[9px] font-medium text-emerald-300">
                  {t('alreadyInRound3')}
                </span>
              ) : (
                <button
                  type="button"
                  disabled={finalRoundPickBusy}
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggleFinalRoundPick?.()
                  }}
                  className={cn(
                    'rounded-md px-2 py-0.5 text-[9px] font-medium border transition-colors max-w-full truncate',
                    finalRoundPickSelected
                      ? 'bg-violet-500/25 border-violet-400/50 text-violet-200'
                      : 'bg-zinc-800/90 border-zinc-600/60 text-zinc-300 hover:border-amber-400/50 hover:text-amber-200'
                  )}
                >
                  {finalRoundPickBusy ? '…' : finalRoundPickSelected ? t('alreadyAddedRound3') : t('addToRound3')}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Hover tooltip */}
        <div
          className={cn(
            'absolute bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2',
            'w-[min(18rem,92vw)] max-w-[20rem] p-3 rounded-xl z-50 pointer-events-none',
            'bg-zinc-900 border border-zinc-700 shadow-xl shadow-black/40',
            'opacity-0 scale-95 group-hover:opacity-100 group-hover:scale-100',
            'transition-all duration-150 origin-bottom'
          )}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <span className={cn('text-xs px-1.5 py-0.5 rounded-full', rankStyle(idea.rank))}>
                {rankLabel(idea.rank, idea.slot)}
              </span>
              <span className={cn('text-xs font-bold', trendColor(idea.trend))}>
                {trendIcon(idea.trend)}
              </span>
            </div>
            <span className={cn('text-sm font-black', scoreColor(idea.total_score))}>
              {idea.total_score}
            </span>
          </div>
          <div className="flex items-center gap-1.5 mb-2 pb-2 border-b border-zinc-800">
            {[
              { label: t('scoreInnovation'), val: version.score_innovation },
              { label: t('scoreFeasibility'), val: version.score_feasibility },
              { label: t('scoreImpact'), val: version.score_impact },
            ].map((s) => (
              <div key={s.label} className="flex-1 text-center bg-zinc-800 rounded-lg py-1.5">
                <div className={cn('text-sm font-bold', scoreColor(s.val))}>{s.val}</div>
                <div className="text-[9px] text-zinc-500">{s.label}</div>
              </div>
            ))}
          </div>
          {version.ai_changes && (
            <div className="mb-2 pb-2 border-b border-zinc-800">
              <div className="text-[9px] font-semibold text-zinc-500 uppercase tracking-wider mb-1">{t('roundChangeSummary')}</div>
              <p className="text-[11px] text-zinc-400 leading-relaxed line-clamp-2">
                {version.ai_changes}
              </p>
            </div>
          )}
          <p className="text-xs text-zinc-300 leading-relaxed line-clamp-6">{body}</p>
          <div className="flex items-center justify-between mt-2">
            <p className="text-[10px] text-zinc-600">{t('clickForHistory')}</p>
            <button
              type="button"
              onMouseDown={(e) => {
                e.stopPropagation()
                ;(onFeedback ?? onClick)(idea)
              }}
              className="pointer-events-auto text-[10px] px-2 py-0.5 rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 hover:border-violet-400/50 transition-colors"
            >
              {t('leaveGuidance')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── 首页列表卡片（非详情页）：保留原始三层 flex 布局 ──
  return (
    <div className="relative group aspect-square">
      <button
        onClick={() => onClick(idea)}
        className={cn(
          'relative w-full h-full rounded-2xl flex flex-col items-center justify-between',
          'px-1.5 pt-1.5 pb-2 overflow-visible cursor-pointer border',
          resolvedHoverGlow,
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400',
          resolvedCardBg
        )}
      >
        {/* Top row: 排名 + 分数 */}
        <div className="w-full flex items-center justify-between gap-1 min-h-5">
          <span className={cn('text-[10px] px-1.5 rounded-full leading-none h-5 flex items-center flex-shrink-0', rankStyle(idea.rank))}>
            {rankLabel(idea.rank, idea.slot)}
          </span>
          <span className={cn('text-[11px] font-bold tabular-nums flex-shrink-0', scoreColor(idea.total_score))}>
            {idea.total_score}
          </span>
        </div>

        {/* 中间：emoji 图标 + 气泡 */}
        <div className="relative flex-shrink-0">
          {bubbleText && (
            <div
              className={cn(
                'absolute bottom-full left-1/2 mb-1.5 z-10 pointer-events-none',
                'animate-bubble-in border text-[11px] px-2.5 py-1.5 rounded-xl whitespace-nowrap shadow-lg',
                'after:content-[""] after:absolute after:top-full after:left-1/2 after:-translate-x-1/2',
                'after:border-4 after:border-transparent',
                resolvedBubbleStyle
              )}
            >
              {bubbleText}
            </div>
          )}
          <div
            className={cn(
              'relative w-10 h-10 rounded-xl flex items-center justify-center',
              resolvedGradient,
              resolvedGlow
            )}
          >
            <span className="text-2xl select-none leading-none">{emoji}</span>
          </div>
        </div>

        {/* 底部：标题 */}
        <div className="w-full flex flex-col items-center gap-0.5 min-h-[2rem] justify-center">
          {isChallenger && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-amber-500/20 border border-amber-500/40 text-amber-400 font-medium">
              {t('retryChallenge')}
            </span>
          )}
          <span className="text-[10px] font-semibold text-zinc-200 leading-tight text-center line-clamp-2 w-full px-1">
            {title}
          </span>
        </div>

        {hasFeedback && (
          <span
            className="absolute bottom-1.5 right-1.5 w-2 h-2 rounded-full bg-amber-500 shadow-sm"
            title={t('leftGuidance')}
          />
        )}
      </button>

      {iterating && (
        <div
          className="absolute inset-0 z-[5] rounded-2xl bg-zinc-950/50 backdrop-blur-[2px] flex flex-col items-center justify-center gap-1 pointer-events-none border border-violet-500/20 shadow-[inset_0_0_0_1px_rgba(139,92,246,0.12)]"
          aria-hidden
        >
          <Loader2
            size={14}
            className="animate-spin text-violet-400 shrink-0"
          />
          <span className="text-[9px] font-semibold text-violet-100/90 text-center px-1.5 leading-tight max-w-[90%]">
            {iteratingLabel ?? t('iteratingOpt')}
          </span>
        </div>
      )}

      {finalRoundPickMode && !iterating && (
        <div className="absolute bottom-1 left-1 right-1 z-[6] flex justify-center pointer-events-none">
          <div className="pointer-events-auto max-w-full">
            {(idea.rank ?? 999) <= 3 ? (
              <span className="inline-flex items-center rounded-md bg-emerald-500/20 border border-emerald-500/35 px-2 py-0.5 text-[9px] font-medium text-emerald-300">
                {t('alreadyInRound3')}
              </span>
            ) : (
              <button
                type="button"
                disabled={finalRoundPickBusy}
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleFinalRoundPick?.()
                }}
                className={cn(
                  'rounded-md px-2 py-0.5 text-[9px] font-medium border transition-colors max-w-full truncate',
                  finalRoundPickSelected
                    ? 'bg-violet-500/25 border-violet-400/50 text-violet-200'
                    : 'bg-zinc-800/90 border-zinc-600/60 text-zinc-300 hover:border-amber-400/50 hover:text-amber-200'
                )}
              >
                {finalRoundPickBusy ? '…' : finalRoundPickSelected ? t('alreadyAddedRound3') : t('addToRound3')}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Hover tooltip */}
      <div
        className={cn(
          'absolute bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2',
          'w-[min(18rem,92vw)] max-w-[20rem] p-3 rounded-xl z-50 pointer-events-none',
          'bg-zinc-900 border border-zinc-700 shadow-xl shadow-black/40',
          'opacity-0 scale-95 group-hover:opacity-100 group-hover:scale-100',
          'transition-all duration-150 origin-bottom'
        )}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <span className={cn('text-xs px-1.5 py-0.5 rounded-full', rankStyle(idea.rank))}>
              {rankLabel(idea.rank, idea.slot)}
            </span>
            <span className={cn('text-xs font-bold', trendColor(idea.trend))}>
              {trendIcon(idea.trend)}
            </span>
          </div>
          <span className={cn('text-sm font-black', scoreColor(idea.total_score))}>
            {idea.total_score}
          </span>
        </div>
        <div className="flex items-center gap-1.5 mb-2 pb-2 border-b border-zinc-800">
          {[
            { label: t('scoreInnovation'), val: version.score_innovation },
            { label: t('scoreFeasibility'), val: version.score_feasibility },
            { label: t('scoreImpact'), val: version.score_impact },
          ].map((s) => (
            <div key={s.label} className="flex-1 text-center bg-zinc-800 rounded-lg py-1.5">
              <div className={cn('text-sm font-bold', scoreColor(s.val))}>{s.val}</div>
              <div className="text-[9px] text-zinc-500">{s.label}</div>
            </div>
          ))}
        </div>
        {version.ai_changes && (
          <div className="mb-2 pb-2 border-b border-zinc-800">
            <div className="text-[9px] font-semibold text-zinc-500 uppercase tracking-wider mb-1">{t('roundChangeSummary')}</div>
            <p className="text-[11px] text-zinc-400 leading-relaxed line-clamp-2">
              {version.ai_changes}
            </p>
          </div>
        )}
        <p className="text-xs text-zinc-300 leading-relaxed line-clamp-6">
          {body}
        </p>
        <div className="flex items-center justify-between mt-2">
          <p className="text-[10px] text-zinc-600">{t('clickForHistory')}</p>
          <button
            type="button"
            onMouseDown={(e) => {
              e.stopPropagation()
              ;(onFeedback ?? onClick)(idea)
            }}
            className="pointer-events-auto text-[10px] px-2 py-0.5 rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 hover:border-violet-400/50 transition-colors"
          >
            {t('leaveGuidance')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default memo(IdeaCardInner)
