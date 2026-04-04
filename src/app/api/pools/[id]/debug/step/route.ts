import { NextRequest, NextResponse } from 'next/server'
import * as mockStore from '@/lib/mock-store'
import { applyDebugPoolStage1, isDebugPoolStepsEnabled } from '@/lib/debug-pool-steps'

/**
 * POST /api/pools/[id]/debug/step
 * Body: { "stage": 1 } — 仅阶段 1，后续再扩展 stage 2、3…
 * 需设置环境变量 DEBUG_POOL_STEPS=1（或 true），否则 403。
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isDebugPoolStepsEnabled()) {
    return NextResponse.json(
      { error: '未开启调试：请在 .env.local 设置 DEBUG_POOL_STEPS=1 后重启 dev' },
      { status: 403 }
    )
  }

  const { id } = await params
  const pool = mockStore.getPool(id)
  if (!pool) {
    return NextResponse.json({ error: 'Pool not found' }, { status: 404 })
  }

  let body: { stage?: number }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const stage = Number(body.stage)
  if (stage !== 1) {
    return NextResponse.json(
      { error: '当前仅实现 stage: 1，其它阶段后续再接入' },
      { status: 400 }
    )
  }

  const result = applyDebugPoolStage1(id)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  const updated = mockStore.getPoolDetail(id)
  return NextResponse.json({
    ok: true,
    stage: result.stage,
    message: result.message,
    pool: updated,
  })
}
