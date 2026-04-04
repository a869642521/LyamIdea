import { getLLMConfig } from '@/lib/llm-config'
import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import * as mockStore from '@/lib/mock-store'
import { iteratePool } from '@/lib/mock-engine'
import { iteratePoolReal } from '@/lib/real-engine'

export const maxDuration = 120

/** 超过此时间仍停留在 running，视为上次请求超时/崩溃未执行 finally，自动解锁避免永久 409 */
const STALE_RUNNING_MS = maxDuration * 1000 + 60_000

function extractErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  if (/response_format.*json_object/i.test(msg)) {
    return '当前模型不支持 JSON 模式，请在设置中更换模型'
  }
  if (/迭代生成失败：模型未返回有效 JSON|模型未返回有效 JSON 对象|须返回 JSON 对象/i.test(msg)) {
    return '迭代失败：模型输出格式不符合要求。建议：① 在设置中更换模型（如 GPT-4o、DeepSeek Chat）；② 检查 Base URL 是否指向正确平台'
  }
  if (/403|Kimi For Coding/i.test(msg)) {
    return '部分模型（如 Kimi For Coding）仅限特定环境使用，请从多模型池中移除该模型'
  }
  if (/401|invalid_api_key|authentication/i.test(msg)) {
    return 'API Key 无效或已过期，请在设置中检查 Key'
  }
  if (/429|rate.?limit|too.many.request/i.test(msg)) {
    return '请求频率超限（429），请稍后重试'
  }
  if (/insufficient.quota|quota.exceeded|balance|欠费/i.test(msg)) {
    return 'API 额度不足，请检查账户余额'
  }
  if (/model.not.found|does not exist|no such model/i.test(msg)) {
    return '模型不存在或无权限，请检查模型名称'
  }
  if (/context.length.exceeded|maximum context/i.test(msg)) {
    return '输入内容超出模型上下文限制'
  }
  if (
    /connection error|fetch failed|failed to fetch|econnreset|socket hang up|network error|getaddrinfo|certificate|ssl|tls|UNABLE_TO_VERIFY/i.test(
      msg
    )
  ) {
    return '无法连接大模型服务，请检查 Base URL 与网络；可在设置中「测试连接」排查'
  }
  if (/^Request timeout$/i.test(msg) || /The operation was aborted/i.test(msg)) {
    return '大模型请求超时：在应用限制时间内未收到完整回复。可检查网络/代理或稍后再试'
  }
  if (/ETIMEDOUT|ECONNREFUSED|ENOTFOUND|timeout/i.test(msg)) {
    return `连接超时或无法访问 Base URL（${msg.slice(0, 80)}）`
  }
  return msg
}

// POST /api/pools/[id]/iterate — run one iteration for a single pool
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const useMock = getLLMConfig().useMock

  const { id: poolId } = await params
  const pool = mockStore.getPool(poolId)
  if (!pool) {
    return NextResponse.json({ error: 'Pool not found' }, { status: 404 })
  }

  const body = await _req.json().catch(() => ({}))
  const iteration = Number(body.iteration)
  if (![1, 2].includes(iteration)) {
    return NextResponse.json(
      { error: 'iteration must be 1 or 2' },
      { status: 400 }
    )
  }
  if (iteration !== pool.iteration + 1) {
    return NextResponse.json(
      { error: `Expected iteration ${pool.iteration + 1}, got ${iteration}` },
      { status: 400 }
    )
  }
  if (pool.status === 'running') {
    const updatedAt = pool.updated_at ? new Date(pool.updated_at).getTime() : 0
    const ageMs = updatedAt ? Date.now() - updatedAt : STALE_RUNNING_MS + 1
    if (ageMs > STALE_RUNNING_MS) {
      console.warn(
        '[pools iterate] clearing stale running lock (pool=%s, ageMs=%d)',
        poolId,
        ageMs
      )
      mockStore.updatePoolStatus(poolId, 'done', pool.iteration)
    } else {
      return NextResponse.json(
        {
          error: '已有迭代正在进行中，请等待当前请求结束后再试',
          code: 'ALREADY_RUNNING',
        },
        { status: 409 }
      )
    }
  }
  if (pool.awaiting_round_confirm) {
    return NextResponse.json(
      {
        error:
          '当前轮次结束后需先点击「确认进入下一轮」，或等待确认完成后再开始迭代',
        code: 'AWAITING_CONFIRM',
      },
      { status: 409 }
    )
  }

  if (useMock) {
    // Mock 模式：同步执行，直接返回结果
    try {
      iteratePool(poolId, pool.keyword, iteration)
    } catch (err) {
      console.error('[pools iterate] mock failed:', err)
      const msg = extractErrorMessage(err)
      return NextResponse.json(
        { error: msg || `第${iteration + 1}轮迭代失败，请重试` },
        { status: 500 }
      )
    }
    const updated = mockStore.getPoolDetail(poolId)
    return NextResponse.json({ pool: updated })
  }

  // 真实 LLM：立即标记 running + 返回，after() 后台流式执行
  mockStore.updatePoolStatus(poolId, 'running')
  after(async () => {
    try {
      await iteratePoolReal(poolId, pool.keyword, iteration)
    } catch (err) {
      console.error('[pools iterate] real failed:', err)
      const msg = extractErrorMessage(err)
      mockStore.updatePoolStatusWithError(poolId, msg)
    }
  })

  const updatedPool = mockStore.getPoolDetail(poolId)
  return NextResponse.json({ pool: updatedPool })
}
