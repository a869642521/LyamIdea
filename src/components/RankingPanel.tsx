'use client'
import { useState } from 'react'
import { cn, scoreColor, formatScore, trendIcon, trendColor } from '@/lib/utils'
import type { IdeaDetail, PoolDetail } from '@/types'

type SortKey = 'total' | 'innovation' | 'feasibility' | 'impact'

interface RankingPanelProps {
  pools: PoolDetail[]
  onIdeaClick: (idea: IdeaDetail, pool: PoolDetail) => void
}

export default function RankingPanel({ pools, onIdeaClick }: RankingPanelProps) {
  const [sortKey, setSortKey] = useState<SortKey>('total')

  const allIdeas = pools.flatMap((pool) =>
    pool.ideas
      .filter((i) => i.current_version?.content)
      .map((idea) => ({ idea, pool }))
  )

  const sorted = [...allIdeas].sort((a, b) => {
    const av = a.idea.current_version!
    const bv = b.idea.current_version!
    if (sortKey === 'total') return (b.idea.total_score ?? 0) - (a.idea.total_score ?? 0)
    if (sortKey === 'innovation') return (bv.score_innovation ?? 0) - (av.score_innovation ?? 0)
    if (sortKey === 'feasibility') return (bv.score_feasibility ?? 0) - (av.score_feasibility ?? 0)
    if (sortKey === 'impact') return (bv.score_impact ?? 0) - (av.score_impact ?? 0)
    return 0
  })

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-zinc-100">全局排名</h3>
        <span className="text-xs text-zinc-500">{sorted.length} 条</span>
      </div>

      {/* Sort controls */}
      <div className="flex gap-1 mb-4 flex-wrap">
        {(
          [
            { key: 'total', label: '总分' },
            { key: 'innovation', label: '创新' },
            { key: 'feasibility', label: '可行' },
            { key: 'impact', label: '影响' },
          ] as { key: SortKey; label: string }[]
        ).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setSortKey(key)}
            className={cn(
              'px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
              sortKey === key
                ? 'bg-violet-600 text-white'
                : 'bg-zinc-800 text-zinc-400 hover:text-zinc-100'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Rankings */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {sorted.map(({ idea, pool }, idx) => {
          const version = idea.current_version!
          return (
            <button
              key={idea.id}
              onClick={() => onIdeaClick(idea, pool)}
              className="w-full text-left rounded-lg border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800/80 p-3 group"
            >
              <div className="flex items-start gap-3">
                {/* Rank badge */}
                <div
                  className={cn(
                    'shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold',
                    idx === 0
                      ? 'bg-amber-500/20 text-amber-400'
                      : idx === 1
                      ? 'bg-zinc-400/20 text-zinc-300'
                      : idx === 2
                      ? 'bg-orange-600/20 text-orange-400'
                      : 'bg-zinc-800 text-zinc-500'
                  )}
                >
                  {idx + 1}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-xs text-zinc-200 leading-relaxed line-clamp-2 group-hover:text-white">
                    {version?.content ?? ''}
                  </p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-[10px] text-zinc-500 truncate max-w-[80px]">
                      {pool.direction}
                    </span>
                    <span className={cn('text-[10px] font-bold', trendColor(idea.trend))}>
                      {trendIcon(idea.trend)}
                    </span>
                  </div>
                </div>

                <div className="shrink-0 text-right">
                  <div className={cn('text-sm font-bold', scoreColor(idea.total_score ?? 0))}>
                    {formatScore(idea.total_score)}
                  </div>
                  <div className="flex gap-1 mt-1">
                    <span className="text-[9px] text-zinc-600">{version.score_innovation}</span>
                    <span className="text-[9px] text-zinc-700">/</span>
                    <span className="text-[9px] text-zinc-600">{version.score_feasibility}</span>
                    <span className="text-[9px] text-zinc-700">/</span>
                    <span className="text-[9px] text-zinc-600">{version.score_impact}</span>
                  </div>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
