import { NextRequest, NextResponse } from 'next/server'
import * as mockStore from '@/lib/mock-store'

// POST — 某轮结束后为方案点赞，池内总分 +3（每轮仅一次）
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
  if (!ideas.some((i) => i.id === ideaId)) {
    return NextResponse.json({ error: 'Idea not found' }, { status: 404 })
  }

  const body = await req.json().catch(() => ({}))
  const uiRound = Number(body.uiRound)
  const result = mockStore.tryLikeIdeaRound(poolId, ideaId, uiRound)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  return NextResponse.json({
    ok: true,
    ack: '已点赞，本方案池内总分 +3，后续迭代会保留该加成',
  })
}
