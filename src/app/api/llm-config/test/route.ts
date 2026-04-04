import { NextRequest, NextResponse } from 'next/server'
import {
  friendlyProviderError,
  ProviderAPIError,
  requestChatCompletion,
  resolveProviderKind,
} from '@/lib/ai/provider-client'

/** 允许较慢的境外 API 完成「测试连接」（Vercel 等平台需配合套餐上限） */
export const maxDuration = 120

export async function POST(req: NextRequest) {
  let body: { apiKey?: string; baseUrl?: string; model?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: '无效的请求体' }, { status: 400 })
  }

  const apiKey = body.apiKey?.trim() ?? ''
  const baseUrl = body.baseUrl?.trim() ?? 'https://api.openai.com/v1'
  const model = body.model?.trim() ?? 'gpt-4o-mini'

  if (!apiKey) {
    return NextResponse.json({ ok: false, error: '请先填写 API Key' }, { status: 400 })
  }

  try {
    const content = await requestChatCompletion(
      { apiKey, baseUrl, model },
      { prompt: 'Reply with exactly: ok', maxTokens: 32, temperature: 0, timeoutMs: 120_000 }
    )
    const replied = !!content
    return NextResponse.json({ ok: true, model, replied })
  } catch (err) {
    const provider = resolveProviderKind(baseUrl)
    if (err instanceof ProviderAPIError && err.status === 401) {
      return NextResponse.json(
        {
          ok: false,
          error:
            provider === 'kimiCoding'
              ? '认证失败（401）：请使用 kimi.com/code 控制台生成的 sk-kimi- Key，并确认 Base URL 为 https://api.kimi.com/coding/v1'
              : provider === 'volcengineCodingPlan'
                ? '认证失败（401）：请使用火山方舟 CodingPlan 专用 Key，并确认 Base URL 为 https://ark.cn-beijing.volces.com/api/coding/v3'
                : '认证失败（401）：Key 与当前 Base URL 不匹配或已失效',
        },
        { status: 200 }
      )
    }
    if (err instanceof ProviderAPIError && err.status === 403 && provider === 'kimiCoding') {
      return NextResponse.json(
        {
          ok: false,
          error: '权限不足（403）：Kimi Coding 仅允许受支持的 Coding Agent 接入，请确认会员状态与 Key 权限',
        },
        { status: 200 }
      )
    }
    return NextResponse.json({ ok: false, error: friendlyProviderError(err, provider) }, { status: 200 })
  }
}
