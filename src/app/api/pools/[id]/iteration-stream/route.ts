import { NextRequest } from 'next/server'
import { getSlotStream } from '@/lib/iteration-stream-buffer'

export const maxDuration = 120

/**
 * GET /api/pools/[id]/iteration-stream?slot=N
 * Server-Sent Events：实时推送某 slot 正在生成的文本增量。
 *
 * 事件类型：
 *   delta  — { text: string }  新增文本片段
 *   done   — {}                该 slot 生成完毕
 *   error  — { message: string } 生成出错
 *
 * 客户端连接后，先推送当前已有的全量 visibleText（若非空），
 * 再以 listener 方式等待后续增量直到 done/error。
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: poolId } = await params
  const slotParam = _req.nextUrl.searchParams.get('slot')
  const slot = Number(slotParam)
  if (!slot || slot < 1 || slot > 9) {
    return new Response('slot must be 1-9', { status: 400 })
  }

  const encoder = new TextEncoder()

  function encode(event: string, data: Record<string, unknown>): Uint8Array {
    return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  }

  // notify 在 start 与 cancel 之间共享，需要在外部声明
  let sharedNotify: (() => void) | null = null

  const stream = new ReadableStream({
    start(controller) {
      const state = getSlotStream(poolId, slot)
      if (!state) {
        // 没有活跃的流：立即推送 done（可能已完成或尚未开始）
        controller.enqueue(encode('done', {}))
        controller.close()
        return
      }

      // 先推送已有的可见文本（补历史）
      if (state.visibleText.length > 0) {
        controller.enqueue(encode('delta', { text: state.visibleText }))
      }

      if (state.status !== 'running') {
        if (state.status === 'error') {
          controller.enqueue(encode('error', { message: state.errorMessage ?? 'unknown' }))
        } else {
          controller.enqueue(encode('done', {}))
        }
        controller.close()
        return
      }

      let lastLen = state.visibleText.length

      const notify = () => {
        const cur = getSlotStream(poolId, slot)
        if (!cur) {
          controller.enqueue(encode('done', {}))
          controller.close()
          return
        }
        // 推送新增部分
        if (cur.visibleText.length > lastLen) {
          const delta = cur.visibleText.slice(lastLen)
          lastLen = cur.visibleText.length
          controller.enqueue(encode('delta', { text: delta }))
        }
        if (cur.status === 'done') {
          controller.enqueue(encode('done', {}))
          cur.listeners.delete(notify)
          controller.close()
        } else if (cur.status === 'error') {
          controller.enqueue(encode('error', { message: cur.errorMessage ?? 'unknown' }))
          cur.listeners.delete(notify)
          controller.close()
        }
      }

      sharedNotify = notify
      state.listeners.add(notify)
    },
    // cancel() 是 Web Streams 规范中客户端断开连接时的正确清理入口
    // start() 的返回值会被规范忽略，不能用作清理函数
    cancel() {
      if (sharedNotify) {
        getSlotStream(poolId, slot)?.listeners.delete(sharedNotify)
        sharedNotify = null
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
