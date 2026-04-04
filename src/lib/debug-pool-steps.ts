/**
 * 分阶段调试池子状态（仅写 mock-store，不调用大模型）。
 * 启用：环境变量 DEBUG_POOL_STEPS=1 或 true。
 *
 * 当前已实现：
 * - 阶段 1：写入假方向 / directions / lenses，status=running、iteration=0，创意格子仍为空（UI：0/9）。
 *
 * 后续可在此文件追加阶段 2（逐格填充）、阶段 3（结束种子 + 确认闸）等。
 */
import * as store from '@/lib/mock-store'

export function isDebugPoolStepsEnabled(): boolean {
  const v = process.env.DEBUG_POOL_STEPS?.trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes'
}

export type DebugStepResult =
  | { ok: true; stage: number; message: string }
  | { ok: false; error: string }

/**
 * 阶段 1：假「方向 + 三选一 + 三维度」，不生成任何 idea 版本。
 */
export function applyDebugPoolStage1(poolId: string): DebugStepResult {
  const pool = store.getPool(poolId)
  if (!pool) return { ok: false, error: '池子不存在' }
  if (pool.iteration !== 0) {
    return { ok: false, error: '仅可在第 0 轮（种子阶段）执行阶段 1' }
  }

  const kw = pool.keyword?.trim() || '测试主题'
  store.updatePool(poolId, {
    direction: `[调试·阶段1] ${kw} · 主方向`,
    directions: [
      `[调试·阶段1] ${kw} · 主方向`,
      `[调试·阶段1] ${kw} · 备选 B`,
      `[调试·阶段1] ${kw} · 备选 C`,
    ],
    lenses: ['[调试] 产品立项', '[调试] 产品创新', '[调试] 落地可行性'],
  })
  store.updatePoolStatus(poolId, 'running', 0)
  store.updatePool(poolId, {
    awaiting_round_confirm: false,
    next_iterate_at: undefined,
  })

  return {
    ok: true,
    stage: 1,
    message:
      '阶段 1 完成：已写入方向与维度；池子为 running、iteration=0，创意仍为 0/9。下一步可在本模块增加「阶段 2：逐格填充假创意」。',
  }
}
