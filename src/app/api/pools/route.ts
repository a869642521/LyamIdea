import { getLLMConfig, getParticipatingConfigs } from '@/lib/llm-config'
import { after } from 'next/server'
import { NextRequest, NextResponse } from 'next/server'
import * as mockStore from '@/lib/mock-store'
import { runPoolSeedJob, shouldSeedPool, startPoolSeedJob } from '@/lib/pool-seed-jobs'
import type { Attachment } from '@/types'

export const maxDuration = 120

function hasValidLLMConfig(): boolean {
  const cfg = getLLMConfig()
  if (cfg.apiKey?.trim()) return true
  const participating = getParticipatingConfigs()
  return participating.some((c) => c.apiKey?.trim())
}

function rawErrorText(err: unknown): string {
  if (err instanceof Error && err.message.trim()) return err.message
  if (err && typeof err === 'object') {
    const o = err as Record<string, unknown>
    if (typeof o.message === 'string' && o.message.trim()) return o.message
    const nested = o.error
    if (nested && typeof nested === 'object' && typeof (nested as { message?: string }).message === 'string') {
      const m = (nested as { message: string }).message
      if (m.trim()) return m
    }
    if (typeof o.status === 'number') {
      const body = typeof o.body === 'string' ? o.body : JSON.stringify(o.body ?? '')
      return `${o.status} ${body}`.slice(0, 400)
    }
  }
  const s = String(err)
  return s === '[object Object]' ? '未知错误（请查看运行 next dev 的终端日志）' : s
}

function extractErrorMessage(err: unknown): string {
  const msg = rawErrorText(err)
  if (/response_format.*json_object/i.test(msg)) {
    return '当前模型不支持 JSON 模式，请在设置中更换为支持该功能的模型（如 GPT-4、Claude 等）'
  }
  if (/403|Kimi For Coding/i.test(msg)) {
    return '部分模型（如 Kimi For Coding）仅限特定环境使用，请从多模型池中移除或更换模型'
  }
  if (/401|invalid_api_key|authentication/i.test(msg)) {
    return 'API Key 无效或已过期，请检查设置中的 Key 是否正确'
  }
  if (/429|rate.?limit|too.many.request/i.test(msg)) {
    return '请求频率超限（429），请稍后重试或降低并发'
  }
  if (/insufficient.quota|quota.exceeded|balance|欠费/i.test(msg)) {
    return 'API 额度不足，请检查账户余额后重试'
  }
  if (/model.not.found|does not exist|no such model/i.test(msg)) {
    return '模型不存在或无权限，请在设置中检查模型名是否正确'
  }
  if (/context.length.exceeded|maximum context/i.test(msg)) {
    return '输入内容超出模型上下文限制，请缩减描述或附件内容'
  }
  if (
    /connection error|fetch failed|failed to fetch|econnreset|socket hang up|network error|getaddrinfo|certificate|ssl|tls|UNABLE_TO_VERIFY/i.test(
      msg
    )
  ) {
    return '无法连接到大模型服务（Connection error 等）：请核对 Base URL 路径（如 …/v1）、本机网络与代理；打开设置点击「测试连接」可单独验证'
  }
  if (/^Request timeout$/i.test(msg) || /The operation was aborted/i.test(msg)) {
    return '大模型请求超时：在应用限制时间内未收到完整回复。可检查网络/代理、换线路或稍后再试；设置里「测试连接」使用更长等待时间'
  }
  if (/ETIMEDOUT|ECONNREFUSED|ENOTFOUND|timeout/i.test(msg)) {
    return `连接超时或无法访问 Base URL，请检查网络和接口地址（${msg.slice(0, 80)}）`
  }
  return msg
}


/** 从 FormData 中的文件构建 Attachment[]，文本类型提取内容，图片类型转 base64 Data URL */
async function parseAttachments(formData: FormData): Promise<Attachment[]> {
  const files = formData.getAll('files').filter((v): v is File => v instanceof File)
  const attachments: Attachment[] = []
  const textMimes = ['text/plain', 'text/markdown', 'text/html', 'application/json']
  const imageMimes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml']
  for (const file of files) {
    const name = file.name
    const type = file.type || 'application/octet-stream'
    const isText = textMimes.some((m) => type.startsWith(m)) || /\.(md|txt|json)$/i.test(name)
    const isImage = imageMimes.some((m) => type.startsWith(m)) || /\.(png|jpe?g|gif|webp|svg)$/i.test(name)
    let textContent: string | undefined
    let dataUrl: string | undefined
    if (isText) {
      try { textContent = await file.text() } catch { /* ignore */ }
    } else if (isImage) {
      try {
        const buf = await file.arrayBuffer()
        const b64 = Buffer.from(buf).toString('base64')
        dataUrl = `data:${type};base64,${b64}`
      } catch { /* ignore */ }
    }
    attachments.push({ name, type, ...(textContent != null && { textContent }), ...(dataUrl != null && { dataUrl }) })
  }
  return attachments
}

// GET /api/pools — list all pools (pool-centric). Hydrate pending pools when needed.
export async function GET() {
  const useMock = getLLMConfig().useMock

  const list = mockStore.listAllPools()

  // 每次 GET 最多触发一个 seed 任务，避免并发 LLM 调用打爆服务
  const needSeed = list.find((p) => shouldSeedPool(p.id))
  if (needSeed) {
    startPoolSeedJob({
      poolId: needSeed.id,
      keyword: needSeed.keyword,
      description: needSeed.description,
      useMock,
      logPrefix: '[pools GET]',
    })
  }

  const pools = mockStore.listAllPools()
  return NextResponse.json({ pools })
}

// POST /api/pools — create a new standalone pool (multipart/form-data: keyword + files)
export async function POST(req: NextRequest) {
  try {
    const useMock = getLLMConfig().useMock

    if (!useMock && !hasValidLLMConfig()) {
      return NextResponse.json(
        { error: '未配置 API Key，请在右上角设置中切换为「真实 AI」并填写有效的 Key' },
        { status: 400 }
      )
    }

    const formData = await req.formData()
    const keywordRaw = formData.get('keyword')
    const keyword: string = (typeof keywordRaw === 'string' ? keywordRaw : '').trim()
    if (!keyword) {
      return NextResponse.json({ error: '关键词不能为空' }, { status: 400 })
    }
    const descRaw = formData.get('description')
    const description: string | undefined = typeof descRaw === 'string' && descRaw.trim() ? descRaw.trim() : undefined

    const modeRaw = formData.get('iteration_mode')
    const iterationMode: 'auto' | 'manual' | 'confirm' =
      modeRaw === 'auto' ? 'auto' : modeRaw === 'manual' ? 'manual' : 'confirm'

    const attachments = await parseAttachments(formData)
    const pool = mockStore.createStandalonePool(keyword, attachments, description, iterationMode)

    if (useMock) {
      try {
        await runPoolSeedJob({
          poolId: pool.id,
          keyword,
          description,
          useMock: true,
          deleteOnFailure: true,
        })
      } catch (seedErr) {
        throw seedErr
      }
    } else {
      // 真实 LLM 需多次串行/并行调用，总时长易超过单次 HTTP 等待；先标记 running，用 after() 在响应结束后继续执行（Serverless 上避免被提前冻结）
      mockStore.updatePoolStatus(pool.id, 'running')
      after(async () => {
        try {
          await runPoolSeedJob({
            poolId: pool.id,
            keyword,
            description,
            useMock: false,
            deleteOnFailure: false, // 失败时不删除，改为标记 failed 供前端展示错误
          })
        } catch (seedErr) {
          console.error('[pools POST] seedPoolReal failed:', seedErr)
          // 将错误信息写回 store，让前端轮询时能展示错误提示与重试入口
          mockStore.updatePoolStatusWithError(pool.id, extractErrorMessage(seedErr))
        }
      })
    }

    return NextResponse.json({ poolId: pool.id, pool: { id: pool.id } }, { status: 201 })
  } catch (err) {
    const msg = extractErrorMessage(err)
    console.error('[pools POST] failed:', err)
    return NextResponse.json(
      { error: msg || '初始创意生成失败，请重试' },
      { status: 500 }
    )
  }
}
