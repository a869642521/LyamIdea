import { NextResponse } from 'next/server'
import { resolveWebSearchProvider } from '@/lib/ai/search/web-search-client'
import {
  getEffectiveBraveApiKey,
  getFocusProviderModeForApi,
  hasBraveApiKeyOverride,
  maskEffectiveBraveKey,
  patchWebSearchRuntime,
  type FocusEvidenceProviderMode,
} from '@/lib/web-search-config'

export async function GET() {
  return NextResponse.json({
    hasBraveKey: !!getEffectiveBraveApiKey(),
    braveKeyMasked: maskEffectiveBraveKey(),
    braveOverrideActive: hasBraveApiKeyOverride(),
    focusProviderMode: getFocusProviderModeForApi(),
    effectiveProvider: resolveWebSearchProvider(),
  })
}

export async function POST(req: Request) {
  let body: {
    braveApiKey?: string
    clearBraveApiKey?: boolean
    focusEvidenceProvider?: FocusEvidenceProviderMode
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '无效的请求体' }, { status: 400 })
  }

  patchWebSearchRuntime({
    clearBraveApiKey: body.clearBraveApiKey === true,
    braveApiKey: typeof body.braveApiKey === 'string' ? body.braveApiKey : undefined,
    focusEvidenceProvider: body.focusEvidenceProvider,
  })

  return NextResponse.json({
    ok: true,
    hasBraveKey: !!getEffectiveBraveApiKey(),
    braveKeyMasked: maskEffectiveBraveKey(),
    braveOverrideActive: hasBraveApiKeyOverride(),
    focusProviderMode: getFocusProviderModeForApi(),
    effectiveProvider: resolveWebSearchProvider(),
  })
}
