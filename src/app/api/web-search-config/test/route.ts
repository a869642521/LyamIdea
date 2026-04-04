import { NextResponse } from 'next/server'
import { fetchBraveWebSearchItems } from '@/lib/ai/search/web-search-client'
import { getEffectiveBraveApiKey } from '@/lib/web-search-config'

/** 使用请求体中的临时 Key 或当前 effective Key 试检索 1 条 */
export async function POST(req: Request) {
  let ephemeral: string | undefined
  try {
    const b = await req.json()
    if (typeof b?.braveApiKey === 'string' && b.braveApiKey.trim()) ephemeral = b.braveApiKey.trim()
  } catch {
    /* 无 body */
  }
  const token = ephemeral ?? getEffectiveBraveApiKey()
  if (!token) {
    return NextResponse.json({ ok: false, error: '未配置 Brave Search API Key（环境变量或本面板保存）' }, { status: 400 })
  }
  try {
    const items = await fetchBraveWebSearchItems(token, 'Brave Search API', {
      numResults: 1,
      timeoutMs: 12_000,
      logTag: '[brave-config-test]',
    })
    if (!items.length) {
      return NextResponse.json({
        ok: false,
        error: '请求成功但未返回结果，请检查套餐或配额',
      })
    }
    return NextResponse.json({ ok: true, sampleTitle: items[0]!.title })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg.slice(0, 200) }, { status: 502 })
  }
}
