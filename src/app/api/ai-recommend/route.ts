import { NextRequest, NextResponse } from 'next/server'
import { getLLMConfig, getParticipatingConfigs } from '@/lib/llm-config'
import { generateProductRecommendations } from '@/lib/ai/adapter'
import type { Lang } from '@/lib/i18n'

export const maxDuration = 120

function hasValidLLMConfig(): boolean {
  const cfg = getLLMConfig()
  if (cfg.apiKey?.trim()) return true
  const participating = getParticipatingConfigs()
  return participating.some((c) => c.apiKey?.trim())
}

// POST /api/ai-recommend — 超级AI推荐：联网搜索社区痛点，返回产品机会卡片
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const query = typeof body.query === 'string' ? body.query.trim() : ''
  const excludeKeywords = Array.isArray(body.excludeKeywords)
    ? body.excludeKeywords.filter((x: unknown) => typeof x === 'string').map((s: string) => s.trim()).filter(Boolean).slice(0, 20)
    : []
  const excludePostUrls = Array.isArray(body.excludePostUrls)
    ? body.excludePostUrls.filter((x: unknown) => typeof x === 'string').map((s: string) => s.trim()).filter(Boolean).slice(0, 20)
    : []
  const outputLang: Lang = body.lang === 'en' || body.outputLang === 'en' ? 'en' : 'zh'

  if (!query) {
    return NextResponse.json(
      { error: outputLang === 'en' ? 'Please enter a keyword' : '请输入关键词' },
      { status: 400 }
    )
  }
  if (query.length > 200) {
    return NextResponse.json(
      {
        error:
          outputLang === 'en'
            ? 'Keyword too long (max 200 characters)'
            : '关键词过长（最多200字符）',
      },
      { status: 400 }
    )
  }
  if (!hasValidLLMConfig()) {
    return NextResponse.json(
      {
        error:
          outputLang === 'en'
            ? 'No LLM API key configured. Add one in Settings first.'
            : '未配置 LLM Key，请先在设置中填写 API 密钥',
      },
      { status: 400 }
    )
  }

  try {
    const userOpts =
      excludeKeywords.length > 0 || excludePostUrls.length > 0
        ? { excludeKeywords, excludePostUrls, outputLang }
        : { outputLang }
    const cards = await generateProductRecommendations(query, userOpts)
    return NextResponse.json({ cards })
  } catch (e) {
    const msg = e instanceof Error ? e.message : outputLang === 'en' ? 'Unknown error' : '未知错误'
    return NextResponse.json(
      {
        error:
          outputLang === 'en' ? `Search failed: ${msg}` : `搜索失败：${msg}`,
      },
      { status: 500 }
    )
  }
}
