import { NextRequest, NextResponse } from 'next/server'
import * as mockStore from '@/lib/mock-store'


// POST /api/pools/[id]/ideas/[ideaId]/feedback — 保存用户对某创意的评论/指导
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; ideaId: string }> }
) {

  const { id: poolId, ideaId } = await params
  const pool = mockStore.getPool(poolId)
  if (!pool) {
    return NextResponse.json({ error: 'Pool not found' }, { status: 404 })
  }

  const ideas = mockStore.getIdeasByPool(poolId)
  const idea = ideas.find((i) => i.id === ideaId)
  if (!idea) {
    return NextResponse.json({ error: 'Idea not found' }, { status: 404 })
  }

  const body = await req.json().catch(() => ({}))
  const feedback = typeof body.feedback === 'string' ? body.feedback : ''
  const append = body.append !== false // 默认追加；传 false 时覆盖（用于编辑/删除）
  const atIteration = pool.iteration ?? 0

  if (append) {
    mockStore.appendIdeaFeedback(ideaId, feedback, atIteration)
  } else {
    mockStore.setIdeaFeedback(ideaId, feedback, atIteration)
  }

  const preview = feedback.trim().slice(0, 20)
  const ack =
    preview.length >= 2
      ? `已记录：「${preview}${feedback.trim().length > 20 ? '…' : ''}」，下轮将参考优化`
      : '已记录你的指导，下一轮会参考优化'

  return NextResponse.json({ ok: true, ack })
}
