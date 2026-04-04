import { getLLMConfig } from '@/lib/llm-config'
import { NextRequest, NextResponse } from 'next/server'
import * as mockStore from '@/lib/mock-store'
import { shouldSeedPool, startPoolSeedJob } from '@/lib/pool-seed-jobs'
import type { Attachment } from '@/types'
// real-engine imported inline where needed to avoid top-level import issues

export const maxDuration = 120

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

// GET /api/pools/[id] — 单池详情
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const useMock = getLLMConfig().useMock

  const list = mockStore.listAllPools()

  // 每次 GET 最多触发一个 seed 任务，防止并发 LLM 调用
  const needSeed = list.find((p) => shouldSeedPool(p.id))
  if (needSeed) {
    startPoolSeedJob({
      poolId: needSeed.id,
      keyword: needSeed.keyword,
      description: needSeed.description,
      useMock,
      logPrefix: '[pools/[id] GET]',
    })
  }

  const { id } = await params
  const pool = mockStore.getPoolDetail(id)
  if (!pool) {
    return NextResponse.json({ error: 'Pool not found' }, { status: 404 })
  }
  return NextResponse.json({ pool })
}

// PATCH /api/pools/[id] — 更新池子附件：remove 为要删除的附件名数组(JSON)，files 为新增文件；下一轮迭代作为题目资料
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const pool = mockStore.getPool(id)
  if (!pool) {
    return NextResponse.json({ error: 'Pool not found' }, { status: 404 })
  }
  const formData = await req.formData()
  const removeRaw = formData.get('remove')
  const toRemove: string[] =
    typeof removeRaw === 'string' ? (() => { try { return JSON.parse(removeRaw) } catch { return [] } })() : []
  const added = await parseAttachments(formData)
  const current = mockStore.getAttachmentsByPool(id) ?? []
  const next = current.filter((a) => !toRemove.includes(a.name)).concat(added)
  mockStore.updatePoolAttachments(id, next)

  // 更新项目细节描述（如果请求中包含）
  const descRaw = formData.get('description')
  if (typeof descRaw === 'string') {
    mockStore.updatePoolDescription(id, descRaw)
  }

  return NextResponse.json({ ok: true })
}

// DELETE /api/pools/[id] — 删除池子及其关联数据
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const pool = mockStore.getPool(id)
  if (!pool) {
    return NextResponse.json({ error: 'Pool not found' }, { status: 404 })
  }
  mockStore.deletePool(id)
  return NextResponse.json({ ok: true })
}
