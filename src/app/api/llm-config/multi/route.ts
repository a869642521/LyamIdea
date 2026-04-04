import { NextResponse } from 'next/server'
import {
  getParticipatingConfigs,
  setParticipatingConfigs,
  maskApiKey,
} from '@/lib/llm-config'
import type { LLMConfig } from '@/lib/llm-config'

/** GET /api/llm-config/multi — 返回当前参与多模型分配的配置列表（API Key 脱敏） */
export async function GET() {
  const cfgs = getParticipatingConfigs()
  return NextResponse.json({
    configs: cfgs.map((c) => ({ ...c, apiKey: maskApiKey(c.apiKey) })),
    count: cfgs.length,
    multiModelEnabled: cfgs.length >= 2,
  })
}

/** POST /api/llm-config/multi — 设置参与多模型分配的配置列表 */
export async function POST(req: Request) {
  let body: { configs: LLMConfig[] }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '无效的请求体' }, { status: 400 })
  }

  if (!Array.isArray(body.configs)) {
    return NextResponse.json({ error: 'configs 必须是数组' }, { status: 400 })
  }

  const valid = body.configs.filter(
    (c) =>
      typeof c === 'object' &&
      c !== null &&
      typeof c.apiKey === 'string' &&
      typeof c.baseUrl === 'string' &&
      typeof c.model === 'string'
  )

  setParticipatingConfigs(valid.map((c) => ({
    apiKey: c.apiKey,
    baseUrl: c.baseUrl,
    model: c.model,
    useMock: false,
  })))

  return NextResponse.json({
    ok: true,
    count: valid.length,
    multiModelEnabled: valid.length >= 2,
  })
}
