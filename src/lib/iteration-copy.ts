/**
 * 用户侧固定三轮：第1轮=初始生成（iter0），第2轮=第一次优化（iter1），第3轮=第二次优化（iter2）。
 */
export const ITERATION_PROGRESS_PHASES = [
  { phase: 1, label: '第1轮', theme: '初始创意' },
  { phase: 2, label: '第2轮', theme: '洞察定型' },
  { phase: 3, label: '第3轮', theme: '方案报告' },
] as const

/**
 * 已完成轮次 pool.iteration = n 后、进入下一轮前，用于 UI 说明「下一轮会做什么」。
 * n=0 表示种子/初始生成刚结束。
 */
export function describeUpcomingRound(iterationJustCompleted: number): string {
  switch (iterationJustCompleted) {
    case 0:
      return '下一步：第 2 轮——基于第一轮候选创意做筛选、定型与证据补强。'
    case 1:
      return '下一步：第 3 轮——先总结第二轮，再深度思考并输出完整产品方案报告。'
    default:
      return '确认后将按设定进入下一轮迭代。'
  }
}
