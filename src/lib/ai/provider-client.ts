import type { LLMConfig } from '@/lib/llm-config'

/** 单次 LLM 请求默认上限（含首包与生成）；境外或 thinking 模型可能较慢 */
export const DEFAULT_LLM_REQUEST_TIMEOUT_MS = 90_000

export type ProviderKind = 'kimiCoding' | 'volcengineCodingPlan' | 'openaiCompatible'

export class ProviderAPIError extends Error {
  provider: ProviderKind
  status?: number
  body?: unknown

  constructor(message: string, provider: ProviderKind, status?: number, body?: unknown) {
    super(message)
    this.name = 'ProviderAPIError'
    this.provider = provider
    this.status = status
    this.body = body
  }
}

export function resolveProviderKind(baseUrl: string): ProviderKind {
  const url = (baseUrl ?? '').toLowerCase().trim()
  // Kimi Code 平台：支持多种 URL 变体（coding/v1, coding/, kimi.com/coding 等）
  if (url.includes('kimi.com/coding') || url.includes('kimi.com') && url.includes('coding')) {
    return 'kimiCoding'
  }
  // 火山方舟 CodingPlan：严格匹配 /api/coding/v3 路径
  if (url.includes('volces.com') && url.includes('coding')) {
    return 'volcengineCodingPlan'
  }
  return 'openaiCompatible'
}

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '')
}

function getAgentHeaders(provider: ProviderKind): Record<string, string> {
  if (provider === 'kimiCoding') {
    return { 'User-Agent': 'RooCode/3.46.1' }
  }
  return {}
}

function buildChatEndpoint(baseUrl: string): string {
  const normalized = trimTrailingSlash(baseUrl)
  if (normalized.endsWith('/chat/completions')) return normalized
  return `${normalized}/chat/completions`
}

type ChatMessage = Record<string, unknown>

function partToText(part: unknown): string {
  if (typeof part === 'string') return part
  if (!part || typeof part !== 'object') return ''
  const o = part as { text?: unknown; content?: unknown }
  if (typeof o.text === 'string') return o.text
  if (typeof o.content === 'string') return o.content
  return ''
}

/** 从 OpenAI 兼容的 message 字段解析文本（含多模态片段、reasoning 等） */
function textFromMessageField(field: unknown): string {
  if (field == null) return ''
  if (typeof field === 'string') return field.trim()
  if (Array.isArray(field)) {
    return field.map(partToText).join('').trim()
  }
  if (typeof field === 'object' && typeof (field as { text?: string }).text === 'string') {
    return (field as { text: string }).text.trim()
  }
  return ''
}

function extractContent(payload: unknown, provider: ProviderKind): string {
  if (!payload || typeof payload !== 'object') {
    throw new ProviderAPIError('模型返回为空', provider)
  }
  type Choice = { message?: ChatMessage; text?: string; delta?: ChatMessage }
  const choices = (payload as { choices?: Choice[] }).choices
  const firstChoice = choices?.[0]
  if (!firstChoice) {
    throw new ProviderAPIError('模型返回 choices 为空', provider)
  }

  const msg = firstChoice.message
  if (msg) {
    const fromContent = textFromMessageField(msg.content)
    if (fromContent) return fromContent
    // Kimi K2 / thinking 等：content 可能为 null，正文在 reasoning_content
    const fromReasoning = textFromMessageField(
      msg.reasoning_content ?? msg.reasoning ?? msg.thought
    )
    if (fromReasoning) return fromReasoning
  }

  const fromDelta = textFromMessageField(firstChoice.delta?.content)
  if (fromDelta) return fromDelta

  if (typeof firstChoice.text === 'string' && firstChoice.text.trim()) {
    return firstChoice.text.trim()
  }

  throw new ProviderAPIError('Empty response from provider', provider, undefined, payload)
}

function summarizeErrorBody(body: unknown): string {
  if (typeof body === 'string') return body
  if (body && typeof body === 'object') {
    const error = (body as { error?: unknown }).error
    if (typeof error === 'string') return error
    if (error && typeof error === 'object' && typeof (error as { message?: string }).message === 'string') {
      return (error as { message: string }).message
    }
    if (typeof (body as { message?: string }).message === 'string') {
      return (body as { message: string }).message
    }
  }
  return JSON.stringify(body)
}

export function friendlyProviderError(err: unknown, provider?: ProviderKind): string {
  const msg = err instanceof Error ? err.message : String(err)

  // 根据 provider 类型给出特定提示
  if (provider === 'kimiCoding') {
    if (/Empty response from provider|choices 为空/i.test(msg)) {
      return 'Kimi 返回了成功响应但未解析到正文：若使用 thinking 系列模型，平台可能把回复放在 reasoning_content（已尝试读取）。请换用 kimi-for-coding 再测，或确认 Key/Base URL（含 /coding/v1）与会员状态'
    }
    if (/401|unauthorized|invalid.api.key|authentication/i.test(msg)) {
      return 'Kimi Code 认证失败：请确认 Key 来自 kimi.com/code（格式 sk-kimi- 开头），且 Base URL 包含 /coding/v1'
    }
    if (/403|forbidden|permission/i.test(msg)) {
      return 'Kimi Code 权限不足：请确认 Code 会员有效，且 Key 未过期'
    }
    if (/model.not.found|does not exist/i.test(msg)) {
      return 'Kimi Code 模型不存在：请使用 kimi-for-coding、kimi-k2 等 Coding 平台支持的模型'
    }
  }

  if (provider === 'volcengineCodingPlan') {
    if (/coding plan subscription|valid coding plan|does not have a valid coding plan|subscription has expired/i.test(msg)) {
      return '未开通或 CodingPlan 已过期：请到火山引擎方舟控制台订阅/续费 CodingPlan；若只需普通豆包推理，请改用 Base URL https://ark.cn-beijing.volces.com/api/v3（预设「豆包 · 火山方舟（在线推理）」）与普通在线推理 Key'
    }
    if (/401|unauthorized/i.test(msg)) {
      return '火山方舟认证失败：请确认使用 CodingPlan 专用 Key（不是普通在线推理 Key）'
    }
    if (/model.not.found/i.test(msg)) {
      return '火山方舟模型不存在：请使用 ark-code-latest、doubao-seed-2.0-code 等 CodingPlan 模型'
    }
  }

  // 通用错误提示
  if (/^Request timeout$/i.test(msg) || /The operation was aborted|aborted due to timeout/i.test(msg)) {
    return '请求超时：在限制时间内未收到完整响应。常见于网络慢、代理不稳定或模型首包延迟大；可检查 VPN/代理与防火墙，换网络或稍后再试'
  }
  if (/response_format.*json_object/i.test(msg)) return '当前模型不支持 JSON 模式'
  if (/429|rate.?limit|too.many.request/i.test(msg)) return '请求频率超限（429），请稍后重试'
  if (/insufficient.quota|quota.exceeded|balance|欠费/i.test(msg)) return 'API 额度不足，请检查账户余额'
  if (/model.not.found|does not exist|no such model/i.test(msg)) return '模型不存在，请检查模型名是否正确'
  if (/401|unauthorized|invalid.api.key|authentication/i.test(msg)) return 'API Key 无效、已过期，或与当前端点不匹配'
  if (/403|forbidden|permission/i.test(msg)) return '权限不足（403），请检查当前 Key 是否具备该模型或端点权限'
  if (/context.length.exceeded|maximum context/i.test(msg)) return '输入内容超出模型上下文限制'
  if (/connection error|fetch failed|failed to fetch|econnreset|socket hang up|network error|getaddrinfo|certificate|ssl|tls|UNABLE_TO_VERIFY/i.test(msg)) {
    return '无法连接到大模型服务，请检查 Base URL、网络与代理'
  }
  if (/ETIMEDOUT|timeout|ECONNREFUSED|ENOTFOUND/i.test(msg)) {
    return `连接失败，请检查 Base URL 是否可达（${msg.slice(0, 80)}）`
  }
  return msg.slice(0, 240)
}

export async function requestChatCompletion(
  cfg: Pick<LLMConfig, 'apiKey' | 'baseUrl' | 'model'>,
  options: {
    prompt: string
    maxTokens: number
    temperature: number
    timeoutMs?: number
    /** 可选系统提示词，用于明确角色与 JSON 输出要求 */
    systemPrompt?: string
    /**
     * 为 true 时在请求体中携带 `response_format: { type: "json_object" }`，
     * 利用 API 层面的约束强制模型只输出合法 JSON，比 prompt 文字约束更可靠。
     * 若模型/平台不支持该参数，调用方应捕获 400 错误并降级重试（不带此参数）。
     */
    jsonMode?: boolean
  }
): Promise<string> {
  const provider = resolveProviderKind(cfg.baseUrl)
  const apiKey = cfg.apiKey?.trim()
  const baseUrl = cfg.baseUrl?.trim()
  const model = cfg.model?.trim()

  if (!apiKey) throw new ProviderAPIError('Missing API key', provider, 401)
  if (!baseUrl) throw new ProviderAPIError('Missing base URL', provider)
  if (!model) throw new ProviderAPIError('Missing model', provider)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_LLM_REQUEST_TIMEOUT_MS)

  // 构建消息列表：若有 systemPrompt 则使用 system + user 双消息格式，提升 JSON 合规率
  const messages: Array<{ role: string; content: string }> = options.systemPrompt
    ? [
        { role: 'system', content: options.systemPrompt },
        { role: 'user', content: options.prompt },
      ]
    : [{ role: 'user', content: options.prompt }]

  try {
    const res = await fetch(buildChatEndpoint(baseUrl), {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...getAgentHeaders(provider),
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: options.maxTokens,
        temperature: options.temperature,
        stream: false,
        // response_format 使 API 层面强制 JSON 输出，优先于 prompt 约束
        ...(options.jsonMode && { response_format: { type: 'json_object' } }),
      }),
    })

    const rawText = await res.text()
    let payload: unknown = rawText
    try {
      payload = rawText ? JSON.parse(rawText) : {}
    } catch {
      payload = rawText
    }

    if (!res.ok) {
      const detail = summarizeErrorBody(payload)
      throw new ProviderAPIError(`${res.status} ${detail}`.trim(), provider, res.status, payload)
    }

    return extractContent(payload, provider)
  } catch (err) {
    if (err instanceof ProviderAPIError) throw err
    const isAbort =
      (err instanceof DOMException && err.name === 'AbortError') ||
      (err instanceof Error && err.name === 'AbortError')
    if (isAbort) {
      throw new ProviderAPIError('Request timeout', provider)
    }
    throw new ProviderAPIError(err instanceof Error ? err.message : String(err), provider)
  } finally {
    clearTimeout(timeout)
  }
}

/** Moonshot 官方文档：内置联网工具名 */
const MOONSHOT_WEB_SEARCH_TOOLS = [
  {
    type: 'builtin_function',
    function: { name: '$web_search' },
  },
] as const

function readKimiWebSearchEnv(): boolean | undefined {
  for (const k of [process.env.KIMI_WEB_SEARCH, process.env.MOONSHOT_WEB_SEARCH]) {
    const v = k?.trim().toLowerCase()
    if (v === '0' || v === 'false' || v === 'off') return false
    if (v === '1' || v === 'true' || v === 'on') return true
  }
  return undefined
}

/**
 * 是否尝试使用 Kimi 内置 `$web_search`（联网简报）。
 * - 默认：Base URL 为 **Moonshot 官方**（api.moonshot.cn）或 **Kimi Coding 计划**（kimi.com 且路径含 coding，如 /coding/v1）时开启。
 * - 与你在设置里填的「Kimi Code」端点一致，不要求必须是 moonshot.cn。
 * - `KIMI_WEB_SEARCH` 或 `MOONSHOT_WEB_SEARCH`：`true` 强制开启，`false` 强制关闭。
 */
export function supportsKimiWebSearch(baseUrl: string): boolean {
  const forced = readKimiWebSearchEnv()
  if (forced === false) return false
  if (forced === true) return true
  const u = (baseUrl ?? '').toLowerCase()
  if (u.includes('moonshot.cn')) return true
  if (u.includes('kimi.com') && u.includes('coding')) return true
  return false
}

/** @deprecated 使用 supportsKimiWebSearch */
export const supportsMoonshotWebSearch = supportsKimiWebSearch

function choiceMessageToAssistantPayload(msg: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {
    role: 'assistant',
    content: msg.content ?? null,
  }
  if (msg.tool_calls != null) out.tool_calls = msg.tool_calls
  if (msg.reasoning_content != null) out.reasoning_content = msg.reasoning_content
  if (msg.reasoning != null) out.reasoning = msg.reasoning
  return out
}

/** 任一 signal abort 时合并后的 signal 也会 abort（用于超时 + 外部 Early Exit 取消） */
function mergeAbortSignals(a: AbortSignal, b: AbortSignal): AbortSignal {
  const merged = new AbortController()
  const forward = () => merged.abort()
  if (a.aborted || b.aborted) {
    merged.abort()
  } else {
    a.addEventListener('abort', forward, { once: true })
    b.addEventListener('abort', forward, { once: true })
  }
  return merged.signal
}

function textFromStopChoice(choice: Record<string, unknown>, provider: ProviderKind): string {
  const msg = choice.message as Record<string, unknown> | undefined
  if (!msg) throw new ProviderAPIError('模型返回 message 为空', provider)
  const fromContent = textFromMessageField(msg.content)
  if (fromContent) return fromContent
  const fromReasoning = textFromMessageField(
    msg.reasoning_content ?? msg.reasoning ?? msg.thought
  )
  if (fromReasoning) return fromReasoning
  return ''
}

/**
 * Kimi 官方联网：声明 `$web_search`，处理 tool_calls 循环；强制关闭 thinking。
 * 固定「至多一轮」工具提交：若模型再次返回 tool_calls，则去掉 tools 并追加用户提示，要求直接输出简报。
 * 文档：https://platform.moonshot.cn/docs/guide/use-web-search
 */
export async function requestKimiResearchWithWebSearch(
  cfg: Pick<LLMConfig, 'apiKey' | 'baseUrl' | 'model'>,
  options: {
    systemPrompt: string
    userPrompt: string
    maxTokens?: number
    temperature?: number
    timeoutMs?: number
    /** 上游取消（如超级推荐 Early Exit），与内部超时合并 */
    signal?: AbortSignal
  }
): Promise<string> {
  const provider = resolveProviderKind(cfg.baseUrl)
  const apiKey = cfg.apiKey?.trim()
  const baseUrl = cfg.baseUrl?.trim()
  const model = cfg.model?.trim()

  if (!apiKey) throw new ProviderAPIError('Missing API key', provider, 401)
  if (!baseUrl) throw new ProviderAPIError('Missing base URL', provider)
  if (!model) throw new ProviderAPIError('Missing model', provider)
  if (!supportsKimiWebSearch(baseUrl)) {
    throw new ProviderAPIError('当前 Base URL 未启用 Kimi 联网简报（需 moonshot.cn 或 kimi.com/.../coding）', provider)
  }

  const messages: unknown[] = [
    { role: 'system', content: options.systemPrompt },
    { role: 'user', content: options.userPrompt },
  ]

  let allowTools = true
  let toolSubmitCount = 0
  const maxSteps = 12
  const timeoutMs = options.timeoutMs ?? Math.max(DEFAULT_LLM_REQUEST_TIMEOUT_MS, 180_000)

  for (let step = 0; step < maxSteps; step++) {
    const timeoutController = new AbortController()
    const timeout = setTimeout(() => timeoutController.abort(), timeoutMs)
    const fetchSignal = options.signal
      ? mergeAbortSignals(timeoutController.signal, options.signal)
      : timeoutController.signal

    const body: Record<string, unknown> = {
      model,
      messages,
      max_tokens: options.maxTokens ?? 8192,
      temperature: options.temperature ?? 0.45,
      stream: false,
      thinking: { type: 'disabled' },
    }
    if (allowTools) {
      body.tools = [...MOONSHOT_WEB_SEARCH_TOOLS]
    }

    try {
      const res = await fetch(buildChatEndpoint(baseUrl), {
        method: 'POST',
        signal: fetchSignal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          ...getAgentHeaders(provider),
        },
        body: JSON.stringify(body),
      })

      const rawText = await res.text()
      let payload: unknown = rawText
      try {
        payload = rawText ? JSON.parse(rawText) : {}
      } catch {
        payload = rawText
      }

      if (!res.ok) {
        const detail = summarizeErrorBody(payload)
        throw new ProviderAPIError(`${res.status} ${detail}`.trim(), provider, res.status, payload)
      }

      const choices = (payload as { choices?: Record<string, unknown>[] }).choices
      const choice = choices?.[0]
      if (!choice) {
        throw new ProviderAPIError('模型返回 choices 为空', provider, undefined, payload)
      }

      const finishReason = String(choice.finish_reason ?? '')

      if (finishReason === 'tool_calls') {
        const msg = choice.message as Record<string, unknown> | undefined
        if (!msg?.tool_calls || !Array.isArray(msg.tool_calls)) {
          throw new ProviderAPIError('finish_reason=tool_calls 但缺少 tool_calls', provider, undefined, payload)
        }

        messages.push(choiceMessageToAssistantPayload(msg))

        // 已提交过一轮 $web_search 回显：不再原样回传（避免第二次真实联网），用占位 tool 结果闭合对话
        if (toolSubmitCount >= 1) {
          for (const tc of msg.tool_calls as Record<string, unknown>[]) {
            const id = typeof tc.id === 'string' ? tc.id : ''
            const fn = tc.function as Record<string, unknown> | undefined
            const name = typeof fn?.name === 'string' ? fn.name : 'unknown'
            messages.push({
              role: 'tool',
              tool_call_id: id,
              name,
              content: JSON.stringify({
                aborted: true,
                reason: 'single_search_limit',
                instruction: '请仅根据上一轮检索结果输出简报，不要再次搜索。',
              }),
            })
          }
          messages.push({
            role: 'user',
            content:
              '请根据此前检索结果，直接输出最终「第一轮简报」正文（Markdown），不要再调用任何工具。',
          })
          allowTools = false
          continue
        }

        for (const tc of msg.tool_calls as Record<string, unknown>[]) {
          const id = typeof tc.id === 'string' ? tc.id : ''
          const fn = tc.function as Record<string, unknown> | undefined
          const name = typeof fn?.name === 'string' ? fn.name : ''
          let argStr = fn?.arguments
          if (typeof argStr !== 'string') argStr = JSON.stringify(argStr ?? {})
          let parsedArgs: unknown = argStr
          try {
            parsedArgs = JSON.parse(argStr as string)
          } catch {
            parsedArgs = { raw: argStr }
          }

          if (name === '$web_search') {
            messages.push({
              role: 'tool',
              tool_call_id: id,
              name,
              content: typeof parsedArgs === 'string' ? parsedArgs : JSON.stringify(parsedArgs),
            })
          } else {
            messages.push({
              role: 'tool',
              tool_call_id: id,
              name: name || 'unknown',
              content: JSON.stringify({ error: `unsupported tool ${name}` }),
            })
          }
        }
        toolSubmitCount++
        continue
      }

      const text = textFromStopChoice(choice, provider).trim()
      if (text) return text
      throw new ProviderAPIError('联网简报：模型未返回正文', provider, undefined, payload)
    } catch (err) {
      if (err instanceof ProviderAPIError) throw err
      const isAbort =
        (err instanceof DOMException && err.name === 'AbortError') ||
        (err instanceof Error && err.name === 'AbortError')
      if (isAbort) {
        throw new ProviderAPIError('Request timeout', provider)
      }
      throw new ProviderAPIError(err instanceof Error ? err.message : String(err), provider)
    } finally {
      clearTimeout(timeout)
    }
  }

  throw new ProviderAPIError('联网简报：超过最大对话步数', provider)
}

/** @deprecated 使用 requestKimiResearchWithWebSearch */
export const requestMoonshotResearchWithWebSearch = requestKimiResearchWithWebSearch

/**
 * 流式 chat 请求（OpenAI 兼容 SSE）。
 * - 与 requestChatCompletion 参数一致，但使用 stream: true，不支持 jsonMode。
 * - onDelta：每收到一个增量 token 时调用；Promise resolve 时返回完整拼接文本。
 * - 若 provider 不支持流式（非 OpenAI 兼容）或网络出错，reject with ProviderAPIError。
 */
export async function requestChatCompletionStream(
  cfg: Pick<LLMConfig, 'apiKey' | 'baseUrl' | 'model'>,
  options: {
    prompt: string
    systemPrompt?: string
    maxTokens: number
    temperature: number
    timeoutMs?: number
    onDelta: (delta: string) => void
  }
): Promise<string> {
  const provider = resolveProviderKind(cfg.baseUrl)
  const apiKey = cfg.apiKey?.trim()
  const baseUrl = cfg.baseUrl?.trim()
  const model = cfg.model?.trim()

  if (!apiKey) throw new ProviderAPIError('Missing API key', provider, 401)
  if (!baseUrl) throw new ProviderAPIError('Missing base URL', provider)
  if (!model) throw new ProviderAPIError('Missing model', provider)

  const controller = new AbortController()
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? DEFAULT_LLM_REQUEST_TIMEOUT_MS
  )

  const messages: Array<{ role: string; content: string }> = options.systemPrompt
    ? [
        { role: 'system', content: options.systemPrompt },
        { role: 'user', content: options.prompt },
      ]
    : [{ role: 'user', content: options.prompt }]

  try {
    const res = await fetch(buildChatEndpoint(baseUrl), {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...getAgentHeaders(provider),
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: options.maxTokens,
        temperature: options.temperature,
        stream: true,
      }),
    })

    if (!res.ok) {
      const rawText = await res.text()
      let payload: unknown = rawText
      try { payload = rawText ? JSON.parse(rawText) : {} } catch { /* ignore */ }
      const detail = summarizeErrorBody(payload)
      throw new ProviderAPIError(`${res.status} ${detail}`.trim(), provider, res.status, payload)
    }

    if (!res.body) {
      throw new ProviderAPIError('No response body (stream)', provider)
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let full = ''
    let leftover = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      leftover += decoder.decode(value, { stream: true })
      const lines = leftover.split('\n')
      leftover = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data:')) continue
        const dataStr = trimmed.slice(5).trim()
        if (dataStr === '[DONE]') continue
        let chunk: unknown
        try { chunk = JSON.parse(dataStr) } catch { continue }

        const choices = (chunk as { choices?: Array<{ delta?: { content?: string } }> }).choices
        const delta = choices?.[0]?.delta?.content
        if (typeof delta === 'string' && delta.length > 0) {
          full += delta
          options.onDelta(delta)
        }
      }
    }

    return full
  } catch (err) {
    if (err instanceof ProviderAPIError) throw err
    const isAbort =
      (err instanceof DOMException && err.name === 'AbortError') ||
      (err instanceof Error && err.name === 'AbortError')
    if (isAbort) throw new ProviderAPIError('Request timeout', provider)
    throw new ProviderAPIError(err instanceof Error ? err.message : String(err), provider)
  } finally {
    clearTimeout(timeout)
  }
}
