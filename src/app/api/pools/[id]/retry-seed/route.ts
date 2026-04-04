import { getLLMConfig } from '@/lib/llm-config'
import { NextResponse } from 'next/server'
import { after } from 'next/server'
import * as mockStore from '@/lib/mock-store'
import { runPoolSeedJob } from '@/lib/pool-seed-jobs'

export const maxDuration = 120

function rawErrorText(err: unknown): string {
  if (err instanceof Error && err.message.trim()) return err.message
  const s = String(err)
  return s === '[object Object]' ? '未知错误' : s
}

// POST /api/pools/[id]/retry-seed — 重新触发失败池子的种子生成
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const pool = mockStore.getPool(id)
  if (!pool) {
    return NextResponse.json({ error: 'Pool not found' }, { status: 404 })
  }
  if (pool.status !== 'failed') {
    return NextResponse.json({ error: '只有状态为 failed 的池子才能重试' }, { status: 400 })
  }

  const { useMock } = getLLMConfig()

  if (useMock) {
    // Mock 模式：同步完成，直接返回结果
    try {
      await runPoolSeedJob({
        poolId: id,
        keyword: pool.keyword,
        description: pool.description,
        useMock: true,
        deleteOnFailure: false,
      })
    } catch (err) {
      mockStore.updatePoolStatusWithError(id, rawErrorText(err))
    }
    const updated = mockStore.getPoolDetail(id)
    return NextResponse.json({ pool: updated })
  }

  // 真实 LLM：重置为 running，after() 后台重新 seed
  // updatePoolStatus 会自动清除 error_message（非 failed 状态时）
  mockStore.updatePoolStatus(id, 'running')

  after(async () => {
    try {
      await runPoolSeedJob({
        poolId: id,
        keyword: pool.keyword,
        description: pool.description,
        useMock: false,
        deleteOnFailure: false,
      })
    } catch (seedErr) {
      console.error('[retry-seed] seedPoolReal failed:', seedErr)
      mockStore.updatePoolStatusWithError(id, rawErrorText(seedErr))
    }
  })

  const updated = mockStore.getPoolDetail(id)
  return NextResponse.json({ pool: updated })
}
