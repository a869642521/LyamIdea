import { NextResponse } from 'next/server'
import * as mockStore from '@/lib/mock-store'


/**
 * GET /api/pools/[id]/summary
 * 当前：基于池子数据生成结构化占位总结，便于后续替换为大模型输出。
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {

  const { id: poolId } = await params
  const pool = mockStore.getPoolDetail(poolId)
  if (!pool) {
    return NextResponse.json({ error: 'Pool not found' }, { status: 404 })
  }

  const iter = pool.iteration ?? 0
  const ideas = [...pool.ideas]
    .filter((i) => i.current_version?.content)
    .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999))
  const top = ideas.slice(0, 5).map((i, idx) => {
    const raw = (i.current_version?.content ?? '').replace(/^【.*?】/, '').trim()
    const oneLine = raw.split('\n')[0].slice(0, 120)
    return `${idx + 1}.（#${i.slot}，${formatScore(i.total_score)}）${oneLine}${oneLine.length >= 120 ? '…' : ''}`
  })

  const lines: string[] = [
    `【主题】${pool.keyword || '未命名'}`,
    pool.direction ? `【方向】${pool.direction}` : '',
    `【进度】已完成 ${Math.min(iter + 1, 3)}/3 轮${iter >= 2 ? '，已收官' : ''}`,
    pool.description ? `【项目细节】${pool.description.slice(0, 200)}${pool.description.length > 200 ? '…' : ''}` : '',
    '',
    '【头部方案摘录】',
    top.length ? top.join('\n') : '（暂无有效方案内容）',
    '',
    '——',
    '接入大模型后，可在此接口中调用 LLM，基于上述上下文输出：整体评价、共性与差异、下一轮优化建议等。',
  ]

  const summary = lines.filter(Boolean).join('\n')

  return NextResponse.json({
    summary,
    source: 'structured_placeholder' as const,
  })
}

function formatScore(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}
