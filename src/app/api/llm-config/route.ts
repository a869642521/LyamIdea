import { NextResponse } from 'next/server'
import { getLLMConfig, setLLMConfig, maskApiKey } from '@/lib/llm-config'
import type { LLMConfig } from '@/lib/llm-config'

export async function GET() {
  const cfg = getLLMConfig()
  return NextResponse.json({
    apiKey: maskApiKey(cfg.apiKey),
    baseUrl: cfg.baseUrl,
    model: cfg.model,
    useMock: cfg.useMock,
    hasKey: !!cfg.apiKey,
  })
}

export async function POST(req: Request) {
  let body: Partial<LLMConfig>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '无效的请求体' }, { status: 400 })
  }

  const current = getLLMConfig()
  // 允许显式传空字符串清空 Key（否则删除全部本地配置后服务端仍保留旧 Key）
  const apiKey =
    'apiKey' in body && typeof body.apiKey === 'string' ? body.apiKey : current.apiKey
  const baseUrl =
    'baseUrl' in body && typeof body.baseUrl === 'string'
      ? body.baseUrl.trim() || current.baseUrl
      : current.baseUrl
  const model =
    'model' in body && typeof body.model === 'string'
      ? body.model.trim() || current.model
      : current.model

  const next: LLMConfig = {
    apiKey,
    baseUrl,
    model,
    useMock: typeof body.useMock === 'boolean' ? body.useMock : current.useMock,
  }

  setLLMConfig(next)
  return NextResponse.json({
    ok: true,
    useMock: next.useMock,
    model: next.model,
    hasKey: !!next.apiKey,
  })
}
