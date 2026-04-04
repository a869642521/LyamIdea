'use client'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/contexts/LanguageContext'

interface ProgressBannerProps {
  iteration: number
  status: string
  keyword: string
  isRunning: boolean
  onRunIteration: (next: number) => void
  onExport: () => void
}

export default function ProgressBanner({
  iteration,
  status,
  keyword,
  isRunning,
  onRunIteration,
  onExport,
}: ProgressBannerProps) {
  const { t } = useLanguage()
  const PHASES = [
    { label: t('phase1'), phase: 0 },
    { label: t('phase2'), phase: 1 },
    { label: t('phase3'), phase: 2 },
  ]
  const isDone = iteration >= 2
  const canIterate = !isRunning && status !== 'running' && !isDone

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-4">
      <div className="flex items-center justify-between flex-wrap gap-4">
        {/* Left: keyword + phase steps */}
        <div className="flex items-center gap-4">
          <div>
            <div className="text-xs text-zinc-500 mb-0.5">{t('currentKeyword')}</div>
            <div className="text-sm font-semibold text-zinc-100">&ldquo;{keyword}&rdquo;</div>
          </div>

          <div className="flex items-center gap-1">
            {PHASES.map((p, i) => (
              <div key={p.phase} className="flex items-center gap-1">
                {i > 0 && (
                  <div
                    className={cn(
                      'w-6 h-px',
                      iteration >= p.phase ? 'bg-violet-500' : 'bg-zinc-700'
                    )}
                  />
                )}
                <div
                  className={cn(
                    'flex flex-col items-center gap-0.5',
                  )}
                >
                  <div
                    className={cn(
                      'w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border-2',
                      iteration > p.phase
                        ? 'bg-violet-600 border-violet-500 text-white'
                        : iteration === p.phase
                        ? isRunning
                          ? 'border-violet-400 text-violet-400 animate-pulse-slow bg-violet-500/10'
                          : 'border-violet-400 text-violet-400 bg-violet-500/10'
                        : 'border-zinc-700 text-zinc-600 bg-transparent'
                    )}
                  >
                    {iteration > p.phase ? '✓' : p.phase}
                  </div>
                  <span className="text-[9px] text-zinc-500 whitespace-nowrap">{p.label}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-2">
          {isDone ? (
            <>
              <span className="text-xs text-emerald-400 font-medium">{t('allDone')}</span>
              <button
                onClick={onExport}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors"
              >
                {t('exportReport')}
              </button>
            </>
          ) : (
            <button
              onClick={() => onRunIteration(iteration + 1)}
              disabled={!canIterate}
              className={cn(
                'px-4 py-2 rounded-lg text-sm font-medium transition-all',
                'border focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500',
                canIterate
                  ? 'bg-violet-600 hover:bg-violet-500 border-violet-500 text-white shadow-lg shadow-violet-900/30'
                  : 'bg-zinc-800 border-zinc-700 text-zinc-500 cursor-not-allowed'
              )}
            >
              {isRunning ? (
                <span className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  {t('running', iteration + 1)}
                </span>
              ) : (
                t('runIteration', iteration + 1)
              )}
            </button>
          )}

          {!isDone && (
            <button
              onClick={onExport}
              className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 text-xs font-medium transition-colors"
            >
              {t('exportCurrent')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
