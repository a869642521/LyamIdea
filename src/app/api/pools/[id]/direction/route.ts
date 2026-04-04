import { getLLMConfig } from '@/lib/llm-config'
import { NextRequest, NextResponse } from 'next/server'
import * as mockStore from '@/lib/mock-store'
import { seedPool } from '@/lib/mock-engine'

export const maxDuration = 120

// POST /api/pools/[id]/direction — 切换探索方向并重新生成（仅当 iteration === 0 时可用）
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const useMock = getLLMConfig().useMock

  const { id } = await params
  const pool = mockStore.getPool(id)
  if (!pool) {
    return NextResponse.json({ error: 'Pool not found' }, { status: 404 })
  }
  if ((pool.iteration ?? 0) > 0) {
    return NextResponse.json(
      { error: '仅在第 0 轮（未开始迭代）前可切换方向' },
      { status: 400 }
    )
  }
  const body = await req.json().catch(() => ({}))
  const directionIndex = typeof body.directionIndex === 'number' ? body.directionIndex : -1
  const directions = pool.directions ?? []
  if (directionIndex < 0 || directionIndex >= directions.length) {
    return NextResponse.json(
      { error: 'directionIndex 需为 0、1 或 2' },
      { status: 400 }
    )
  }
  const newDirection = directions[directionIndex]

  try {
    if (useMock) {
      seedPool(id, pool.keyword, pool.description, { direction: newDirection, directions })
    } else {
      const { seedPoolReal } = await import('@/lib/real-engine')
      await seedPoolReal(id, pool.keyword, pool.description, { direction: newDirection, directions })
    }
  } catch (err) {
    console.error('[direction] seedPool failed:', err)
    return NextResponse.json({ error: '方向切换失败，请重试' }, { status: 500 })
  }

  const updated = mockStore.getPoolDetail(id)
  return NextResponse.json({ pool: updated })
}
