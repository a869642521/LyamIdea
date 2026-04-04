/**
 * 进程内「流缓冲」：存储迭代过程中每个 poolId+slot 的实时文本。
 * 与 mock-store 同理挂在 globalThis，防止 Next.js HMR 热重载丢失。
 *
 * 限制：与 mock-store 一样，多实例 Serverless 环境下 SSE 订阅者与写入者
 * 可能不在同一实例。本地开发和单实例部署不受影响。
 */

export interface SlotStreamState {
  /** 当前已生成的可见文本（分隔符 <<<IDEA_JSON>>> 之前的部分） */
  visibleText: string
  /** 完整原始缓冲（含分隔符及后面的 JSON，供解析用） */
  fullBuffer: string
  status: 'running' | 'done' | 'error'
  errorMessage?: string
  /** 用于唤醒等待中的 SSE 长轮询 */
  listeners: Set<() => void>
}

const STREAM_SEPARATOR = '<<<IDEA_JSON>>>'

declare global {
  // eslint-disable-next-line no-var
  var __iteration_stream_buf: Map<string, SlotStreamState> | undefined
}

if (!globalThis.__iteration_stream_buf) {
  globalThis.__iteration_stream_buf = new Map()
}

const buf = globalThis.__iteration_stream_buf

function key(poolId: string, slot: number): string {
  return `${poolId}:${slot}`
}

export function initSlotStream(poolId: string, slot: number): void {
  const state: SlotStreamState = {
    visibleText: '',
    fullBuffer: '',
    status: 'running',
    listeners: new Set(),
  }
  buf.set(key(poolId, slot), state)
}

export function appendSlotDelta(poolId: string, slot: number, delta: string): void {
  const state = buf.get(key(poolId, slot))
  if (!state) return
  state.fullBuffer += delta
  // 分隔符之前的内容才推送给前端展示
  const sepIdx = state.fullBuffer.indexOf(STREAM_SEPARATOR)
  state.visibleText = sepIdx >= 0 ? state.fullBuffer.slice(0, sepIdx) : state.fullBuffer
  state.listeners.forEach((cb) => cb())
}

export function markSlotDone(poolId: string, slot: number): void {
  const state = buf.get(key(poolId, slot))
  if (!state) return
  state.status = 'done'
  state.listeners.forEach((cb) => cb())
}

export function markSlotError(poolId: string, slot: number, message: string): void {
  const state = buf.get(key(poolId, slot))
  if (!state) return
  state.status = 'error'
  state.errorMessage = message
  state.listeners.forEach((cb) => cb())
}

export function getSlotStream(poolId: string, slot: number): SlotStreamState | undefined {
  return buf.get(key(poolId, slot))
}

/** 从完整缓冲中截取分隔符后的 JSON 字符串（流结束后调用） */
export function extractJsonFromBuffer(poolId: string, slot: number): string | null {
  const state = buf.get(key(poolId, slot))
  if (!state) return null
  const sepIdx = state.fullBuffer.indexOf(STREAM_SEPARATOR)
  if (sepIdx < 0) return null
  return state.fullBuffer.slice(sepIdx + STREAM_SEPARATOR.length).trim()
}

/** 清除某 pool 所有 slot 的流缓冲（整轮结束后调用，释放内存） */
export function clearPoolStreamBuffer(poolId: string): void {
  for (const k of [...buf.keys()]) {
    if (k.startsWith(`${poolId}:`)) {
      buf.delete(k)
    }
  }
}
