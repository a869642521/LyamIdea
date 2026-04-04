import { NextRequest, NextResponse } from 'next/server'
import * as mockStore from '@/lib/mock-store'

/**
 * POST /api/pools/[id]/final-round-slots
 * Body: { slots: number[] } — 第二轮结束后，除前三名外希望带入第三轮的格子编号（1–9）。
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: poolId } = await params
  const pool = mockStore.getPool(poolId)
  if (!pool) {
    return NextResponse.json({ error: 'Pool not found' }, { status: 404 })
  }
  if ((pool.iteration ?? 0) !== 1) {
    return NextResponse.json(
      { error: '仅在第二轮（已完成首次优化）时可设置带入第三轮的格子' },
      { status: 400 }
    )
  }
  if (pool.status === 'running') {
    return NextResponse.json({ error: '迭代进行中，请稍后再试' }, { status: 409 })
  }

  const body = await req.json().catch(() => ({}))
  const raw = body?.slots
  if (!Array.isArray(raw)) {
    return NextResponse.json({ error: 'slots 须为数字数组' }, { status: 400 })
  }

  mockStore.setFinalRoundExtraSlots(poolId, raw as number[])
  const detail = mockStore.getPoolDetail(poolId)
  if (!detail) {
    return NextResponse.json({ error: 'Pool not found' }, { status: 404 })
  }
  return NextResponse.json({ pool: detail })
}
