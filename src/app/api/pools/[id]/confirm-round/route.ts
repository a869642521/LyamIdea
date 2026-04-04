import { NextResponse } from 'next/server'
import * as mockStore from '@/lib/mock-store'


// POST /api/pools/[id]/confirm-round — 用户确认后进入下一轮（清除 awaiting_round_confirm，设置 next_iterate_at）
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const pool = mockStore.getPool(id)
  if (!pool) {
    return NextResponse.json({ error: 'Pool not found' }, { status: 404 })
  }
  if (!pool.awaiting_round_confirm) {
    return NextResponse.json(
      { error: '当前无需确认' },
      { status: 400 }
    )
  }
  const nextAt = new Date(Date.now() + 1000).toISOString()
  mockStore.updatePool(id, { awaiting_round_confirm: false, next_iterate_at: nextAt })
  const updated = mockStore.getPoolDetail(id)
  return NextResponse.json({ pool: updated })
}
