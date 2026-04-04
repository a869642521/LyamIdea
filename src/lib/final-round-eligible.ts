/**
 * 第三轮深度生成：按第二轮结束时的分数取前三名，并并入用户勾选的额外格子（1–9）。
 */
export function eligibleSlotsForFinalRound(
  currentIdeaState: Array<{ slot: number; total_score: number }>,
  extraSlots: number[] | undefined
): number[] {
  const sorted = [...currentIdeaState].sort((a, b) => b.total_score - a.total_score)
  const top3 = sorted.slice(0, 3).map((s) => s.slot)
  const extra = (extraSlots ?? []).filter((s) => s >= 1 && s <= 9)
  return Array.from(new Set([...top3, ...extra])).sort((a, b) => a - b)
}
