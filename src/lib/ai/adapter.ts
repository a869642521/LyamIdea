import { getLLMConfig, getParticipatingConfigs } from '@/lib/llm-config'
import type { LLMConfig } from '@/lib/llm-config'
import { jsonrepair } from 'jsonrepair'
import {
  requestChatCompletion,
  requestChatCompletionStream,
  requestKimiResearchWithWebSearch,
  supportsKimiWebSearch,
} from './provider-client'
import type { RecommendCard } from '@/types'
import {
  parseIdeaScoresFromModel,
  SEED_BODY_LINE_PREFIX_EN,
  SEED_BODY_LINE_PREFIX_ZH,
  type SuperRecommendUserOptions,
  type SeedGridPlan,
  type SeedGridPlanSlot,
  type SeedMutexPriorEntry,
} from './prompts'
import { sanitizeSuperRecommendPostUrl } from './super-recommend-url'
import { collectSuperRecommendEvidence, type SuperRecommendEvidenceItem } from './super-recommend-evidence'
import type { SeedDirectEvidenceContext } from './seed-evidence-direct'

export type { SeedDirectEvidenceContext } from './seed-evidence-direct'
export { buildSeedDirectEvidenceContext } from './seed-evidence-direct'

export type GenerateSeedIdeasOptions = {
  /** SEED_DIRECT_EVIDENCE≠0 且证据非空时由 real-engine 注入 */
  directEvidence?: SeedDirectEvidenceContext | null
}

export type ComposeSeedResearchPackageResult = {
  researchBrief: string | undefined
  evidenceItems: SuperRecommendEvidenceItem[]
}

/**
 * 主配置无 Key 时，回退到「参与多模型池」的第一条有效配置。
 * 否则会出现 hasValidLLMConfig 为 true（多模型有 Key）但 directions/lenses 仍用空 Key 调用而 500。
 */
function resolveEffectiveLLMConfig(): LLMConfig {
  const cfg = getLLMConfig()
  const envKey = process.env.LLM_API_KEY?.trim() ?? ''
  const mainKey = (cfg.apiKey?.trim() || envKey).trim()
  if (mainKey) {
    return {
      ...cfg,
      apiKey: cfg.apiKey?.trim() ? cfg.apiKey : envKey,
    }
  }
  const participating = getParticipatingConfigs().filter((c) => c.apiKey?.trim())
  if (participating.length > 0) {
    const p = participating[0]
    return {
      ...cfg,
      apiKey: p.apiKey,
      baseUrl: (p.baseUrl?.trim() || cfg.baseUrl).trim(),
      model: (p.model?.trim() || cfg.model).trim(),
      useMock: false,
    }
  }
  return cfg
}

const MAX_TOKENS = parseInt(process.env.LLM_MAX_TOKENS ?? '8000', 10)
const LONGFORM_MAX_TOKENS = parseInt(process.env.LLM_LONGFORM_MAX_TOKENS ?? '16000', 10)
const MAX_RETRIES = 2

function maxTokensForIteration(iteration?: number): number {
  return iteration === 2 ? Math.max(MAX_TOKENS, LONGFORM_MAX_TOKENS) : MAX_TOKENS
}

function readEnvFloat(key: string, fallback: number): number {
  const v = Number.parseFloat(process.env[key] ?? '')
  return Number.isFinite(v) ? v : fallback
}

/** 启用 response_format JSON 时略降温度，减少格式漂移；可用 LLM_JSON_TEMPERATURE 覆盖 */
const JSON_MODE_TEMPERATURE = readEnvFloat('LLM_JSON_TEMPERATURE', 0.42)
/** 降级为纯文本模式时仍须输出可解析 JSON；可用 LLM_JSON_PLAIN_TEMPERATURE 覆盖 */
const JSON_PLAIN_TEMPERATURE = readEnvFloat('LLM_JSON_PLAIN_TEMPERATURE', 0.65)

/**
 * 修复 LLM 常见 JSON 格式问题：
 * - 尾随逗号（trailing commas）：`{"k":"v",}` / `[1,2,]`
 * - 字符串内的原始换行（替换为 \\n）
 */
function sanitizeJsonCandidate(s: string): string {
  // 1. 去除 } / ] 前的多余逗号
  const result = s.replace(/,(\s*[}\]])/g, '$1')
  // 2. 修复字符串内的原始换行（不在 JSON 转义序列里的裸 \n / \r）
  // 用状态机简单处理：在字符串内把裸换行替换为 \n 转义
  let fixed = ''
  let inStr = false
  let esc = false
  for (let i = 0; i < result.length; i++) {
    const c = result[i]
    if (esc) { fixed += c; esc = false; continue }
    if (inStr) {
      if (c === '\\') { fixed += c; esc = true; continue }
      if (c === '"') { inStr = false; fixed += c; continue }
      if (c === '\n') { fixed += '\\n'; continue }
      if (c === '\r') { fixed += '\\r'; continue }
    } else {
      if (c === '"') inStr = true
    }
    fixed += c
  }
  return fixed
}

/**
 * 尝试将候选字符串解析为 JSON；先原样尝试，再 sanitize，最后用 jsonrepair 修复常见 LLM 差错。
 * 成功则返回可被 JSON.parse 解析的字符串，否则返回 null。
 */
function tryParseJsonCandidate(candidate: string): string | null {
  const base = candidate.trim()
  if (!base) return null
  try {
    JSON.parse(base)
    return base
  } catch {
    /* fall through */
  }
  const sanitized = sanitizeJsonCandidate(base)
  if (sanitized !== base) {
    try {
      JSON.parse(sanitized)
      return sanitized
    } catch {
      /* fall through */
    }
  }
  try {
    const repaired = jsonrepair(sanitized)
    JSON.parse(repaired)
    return repaired
  } catch {
    return null
  }
}

/** 在字符串字面量外查找某字符首次出现位置（避免键名/值里的符号误判） */
function indexOfUnquotedChar(s: string, char: string): number {
  let inString = false
  let escape = false
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (escape) {
      escape = false
      continue
    }
    if (inString) {
      if (ch === '\\') escape = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === char) return i
  }
  return -1
}

/**
 * 从 s 中第一个 open 起截取与之平衡配对的片段（仅统计 open/close，忽略另一组括号与字符串内字符）。
 */
function extractBalancedSegment(
  s: string,
  open: '{' | '[',
  close: '}' | ']'
): string | null {
  let depth = 0
  let inString = false
  let escape = false
  let start = -1
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (escape) {
      escape = false
      continue
    }
    if (inString) {
      if (ch === '\\') escape = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === open) {
      if (depth === 0) start = i
      depth++
    } else if (ch === close) {
      depth--
      if (depth === 0 && start !== -1) return s.slice(start, i + 1)
    }
  }
  return null
}

/**
 * 从模型输出中提取可解析的 JSON：代码块 → 整段 → 数组/对象平衡截取（数组优先于「首个 {」误截）。
 * 结合 sanitize 与 jsonrepair 提高对尾逗号、截断、杂前缀的容忍度（无法替代「模型别瞎写」）。
 */
function extractJson(raw: string): string {
  const trim = raw.replace(/^\uFEFF/, '').trim()

  const codeBlock = /```(?:json)?\s*([\s\S]*?)```/s.exec(trim)
  if (codeBlock) {
    const candidate = codeBlock[1].trim()
    const result = tryParseJsonCandidate(candidate)
    if (result !== null) return result
  }

  const full = tryParseJsonCandidate(trim)
  if (full !== null) return full

  const iBracket = indexOfUnquotedChar(trim, '[')
  const iBrace = indexOfUnquotedChar(trim, '{')
  const preferArray = iBracket !== -1 && (iBrace === -1 || iBracket < iBrace)

  const segments: string[] = []
  if (preferArray) {
    const arr = extractBalancedSegment(trim, '[', ']')
    if (arr) segments.push(arr)
  }
  const obj = extractBalancedSegment(trim, '{', '}')
  if (obj) segments.push(obj)
  if (!preferArray) {
    const arr = extractBalancedSegment(trim, '[', ']')
    if (arr) segments.push(arr)
  }

  for (const seg of segments) {
    const result = tryParseJsonCandidate(seg)
    if (result !== null) return result
  }

  return segments[0] ?? trim
}

/** 验证字符串是否为可解析的 JSON，用于重试判断 */
function isValidJson(str: string): boolean {
  try { JSON.parse(str); return true } catch { return false }
}

/** 去掉种子模型可选的 <thought>...</thought>，再解析 JSON（多段时全部移除） */
function stripOptionalThoughtBlock(raw: string): string {
  const s = raw.replace(/^\uFEFF/, '').trim()
  return s.replace(/<thought>[\s\S]*?<\/thought>/gi, '').trim()
}

/** JSON-only 系统提示（提升模型 JSON 输出合规率） */
const JSON_SYSTEM_PROMPT =
  'You are a helpful assistant. You MUST respond with valid JSON only — no extra text, no explanation, no markdown outside the JSON block. If asked to return JSON, return ONLY the JSON object, nothing else.'

/** 种子单格：允许先 <thought> 再 JSON；禁用 API json_mode */
const SEED_IDEA_JSON_SYSTEM_PROMPT =
  'You are a product ideation assistant. First output exactly one block <thought>...</thought> with short reasoning in plain text only — do NOT use curly brace characters { or } inside the thought block. After </thought>, output exactly one JSON object starting with { and ending with }; no markdown fences; no text after the closing }.'

/**
 * 判断错误是否由"模型不支持 response_format json_object"引起。
 * 出现此错误时应降级为不带 response_format 的调用，而非永久失败。
 */
function isJsonModeUnsupported(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase()
  return (
    (msg.includes('response_format') || msg.includes('json_object') || msg.includes('json mode')) &&
    (msg.includes('400') || msg.includes('not support') || msg.includes('unsupport') || msg.includes('invalid'))
  )
}

/**
 * 用指定 cfg 和共用选项调用 LLM，自动处理 jsonMode 降级：
 * - 先尝试 response_format json_object（API 层面强制 JSON）
 * - 若平台返回 400 / "not supported"，自动降级为纯文本模式重试
 */
async function requestWithJsonFallback(
  cfg: Pick<LLMConfig, 'apiKey' | 'baseUrl' | 'model'>,
  prompt: string,
  jsonModeAllowed: boolean,
  maxTokens = MAX_TOKENS
): Promise<string> {
  if (jsonModeAllowed) {
    try {
      return await requestChatCompletion(cfg, {
        systemPrompt: JSON_SYSTEM_PROMPT,
        prompt,
        maxTokens,
        temperature: JSON_MODE_TEMPERATURE,
        jsonMode: true,
      })
    } catch (err) {
      if (isJsonModeUnsupported(err)) {
        // 模型不支持 response_format，降级重试（此次不再使用 jsonMode）
        console.warn('[adapter] response_format not supported by model, falling back to plain mode')
        return requestChatCompletion(cfg, {
          systemPrompt: JSON_SYSTEM_PROMPT,
          prompt,
          maxTokens,
          temperature: JSON_PLAIN_TEMPERATURE,
          jsonMode: false,
        })
      }
      throw err
    }
  }
  return requestChatCompletion(cfg, {
    systemPrompt: JSON_SYSTEM_PROMPT,
    prompt,
    maxTokens,
    temperature: JSON_PLAIN_TEMPERATURE,
    jsonMode: false,
  })
}

export async function callLLM(prompt: string, options?: { maxTokens?: number }): Promise<string> {
  const cfg = resolveEffectiveLLMConfig()
  let lastError: Error | null = null
  // 首次尝试开启 jsonMode；若不支持则在 requestWithJsonFallback 内部降级
  let jsonModeAllowed = true

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const content = await requestWithJsonFallback(
        {
          apiKey: cfg.apiKey || process.env.LLM_API_KEY || '',
          baseUrl: cfg.baseUrl,
          model: cfg.model,
        },
        prompt,
        jsonModeAllowed,
        options?.maxTokens ?? MAX_TOKENS
      )
      const extracted = extractJson(content)
      if (!isValidJson(extracted)) {
        throw new Error(`模型返回了非 JSON 内容（前 80 字符：${content.slice(0, 80)}）`)
      }
      // 拒绝 JSON 字符串/数字/布尔等标量，以及顶层数组：须为 { ... }
      const top = JSON.parse(extracted) as unknown
      if (top === null || typeof top !== 'object' || Array.isArray(top)) {
        throw new Error(
          `模型须返回 JSON 对象 {{...}}，不得只返回标量、字符串或顶层数组（前 80 字符：${content.slice(0, 80)}）`
        )
      }
      return extracted
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      // 若本次因 jsonMode 不支持而降级后仍失败，后续重试直接跳过 jsonMode
      if (isJsonModeUnsupported(err)) jsonModeAllowed = false
      if (attempt < MAX_RETRIES) {
        // Exponential backoff: 1s, 2s
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)))
      }
    }
  }
  throw lastError ?? new Error('LLM call failed after retries')
}

/** 使用指定配置调用 LLM（多模型模式下每个 slot 可使用不同配置） */
export async function callLLMWithConfig(
  prompt: string,
  cfg: LLMConfig,
  options?: { maxTokens?: number }
): Promise<string> {
  let lastError: Error | null = null
  let jsonModeAllowed = true

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const content = await requestWithJsonFallback(
        {
          apiKey: cfg.apiKey || process.env.LLM_API_KEY || '',
          baseUrl: cfg.baseUrl,
          model: cfg.model,
        },
        prompt,
        jsonModeAllowed,
        options?.maxTokens ?? MAX_TOKENS
      )
      const extracted = extractJson(content)
      if (!isValidJson(extracted)) {
        throw new Error(`模型返回了非 JSON 内容（前 80 字符：${content.slice(0, 80)}）`)
      }
      const top = JSON.parse(extracted) as unknown
      if (top === null || typeof top !== 'object' || Array.isArray(top)) {
        throw new Error(
          `模型须返回 JSON 对象 {{...}}，不得只返回标量、字符串或顶层数组（前 80 字符：${content.slice(0, 80)}）`
        )
      }
      return extracted
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      if (isJsonModeUnsupported(err)) jsonModeAllowed = false
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)))
      }
    }
  }
  throw lastError ?? new Error(`LLM call failed after retries (model: ${cfg.model})`)
}

/**
 * 种子单格专用：不使用 json_mode；剥离 <thought> 后 extractJson。
 * 返回与 callLLM 相同：可 parse 的 JSON 对象字符串。
 */
async function callLLMForSeedIdea(prompt: string, options?: { maxTokens?: number }): Promise<string> {
  const cfg = resolveEffectiveLLMConfig()
  return callLLMForSeedIdeaWithConfig(prompt, cfg, options)
}

async function callLLMForSeedIdeaWithConfig(
  prompt: string,
  cfg: LLMConfig,
  options?: { maxTokens?: number }
): Promise<string> {
  let lastError: Error | null = null
  const creds = {
    apiKey: cfg.apiKey || process.env.LLM_API_KEY || '',
    baseUrl: cfg.baseUrl,
    model: cfg.model,
  }

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const raw = await requestChatCompletion(creds, {
        systemPrompt: SEED_IDEA_JSON_SYSTEM_PROMPT,
        prompt,
        maxTokens: options?.maxTokens ?? MAX_TOKENS,
        temperature: 0.45,
      })
      const stripped = stripOptionalThoughtBlock(raw)
      const extracted = extractJson(stripped)
      if (!isValidJson(extracted)) {
        throw new Error(`模型返回了非 JSON 内容（前 80 字符：${stripped.slice(0, 80)}）`)
      }
      const top = JSON.parse(extracted) as unknown
      if (top === null || typeof top !== 'object' || Array.isArray(top)) {
        throw new Error(
          `模型须返回 JSON 对象 {...}，不得只返回标量、字符串或顶层数组（前 80 字符：${stripped.slice(0, 80)}）`
        )
      }
      return extracted
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)))
      }
    }
  }
  throw lastError ?? new Error(`Seed slot LLM failed after retries (model: ${cfg.model})`)
}

/** 基于 poolId + slot + round 做确定性哈希，为 slot 分配参与配置中的某一个模型 */
function slotModelAssign(
  slot: number,
  round: number,
  poolId: string,
  configs: LLMConfig[]
): LLMConfig {
  if (configs.length === 0) return resolveEffectiveLLMConfig()
  if (configs.length === 1) return configs[0]
  let h = 0
  const key = `${poolId}|${slot}|${round}`
  for (let i = 0; i < key.length; i++) {
    h = ((h << 5) - h + key.charCodeAt(i)) | 0
  }
  return configs[Math.abs(h) % configs.length]
}

export async function generatePoolDirections(keyword: string): Promise<string[]> {
  const { buildPoolDirectionsPrompt } = await import('./prompts')
  const raw = await callLLM(buildPoolDirectionsPrompt(keyword))
  const parsed = parseLlmJsonObject(raw, '方向生成失败')
  if (!Array.isArray(parsed.directions) || parsed.directions.length < 3) {
    throw new Error(`方向生成失败：期望 3 条方向，实际返回 ${JSON.stringify(parsed.directions)?.slice(0, 100)}`)
  }
  return (parsed.directions as unknown[]).slice(0, 3).map(String)
}

export async function generatePoolLenses(
  keyword: string,
  direction: string,
  description?: string,
  researchBrief?: string
): Promise<string[]> {
  const { buildPoolLensesPrompt } = await import('./prompts')
  const raw = await callLLM(buildPoolLensesPrompt(keyword, direction, description, researchBrief))
  const parsed = parseLlmJsonObject(raw, '维度生成失败')
  if (!Array.isArray(parsed.lenses) || parsed.lenses.length < 3) {
    throw new Error(`维度生成失败：期望 3 条维度，实际返回 ${JSON.stringify(parsed.lenses)?.slice(0, 100)}`)
  }
  return (parsed.lenses as unknown[]).slice(0, 3).map(String)
}

/**
 * Kimi 内置 `$web_search` 生成「第一轮联网简报」。
 * 适用于 **Kimi Coding 计划**（kimi.com/.../coding）与 Moonshot 官方域（api.moonshot.cn）；失败或未命中 URL 时返回 undefined，种子照常继续。
 */
export async function generateResearchBriefForSeed(
  keyword: string,
  description?: string,
  attachmentContext?: string
): Promise<string | undefined> {
  const cfg = resolveEffectiveLLMConfig()
  const apiKey = (cfg.apiKey || process.env.LLM_API_KEY || '').trim()
  const baseUrl = (cfg.baseUrl || '').trim()
  const model = (cfg.model || '').trim()
  if (!apiKey || !baseUrl || !model) return undefined
  if (!supportsKimiWebSearch(baseUrl)) return undefined
  try {
    const { buildResearchBriefSystemPrompt, buildResearchBriefUserPrompt } = await import('./prompts')
    const text = await requestKimiResearchWithWebSearch(
      { apiKey, baseUrl, model },
      {
        systemPrompt: buildResearchBriefSystemPrompt(),
        userPrompt: buildResearchBriefUserPrompt(keyword, description, attachmentContext),
        maxTokens: 8192,
        temperature: 0.45,
      }
    )
    const t = text.trim()
    return t ? t.slice(0, 6000) : undefined
  } catch (e) {
    console.warn('[research-brief] failed, continuing without:', e instanceof Error ? e.message : e)
    return undefined
  }
}

const SEED_MERGED_BRIEF_MAX_LEN = 6000

/** 证据简报为主体、Kimi 简报为附录；总长度封顶 */
export function mergeSeedResearchBriefs(
  evidenceBrief?: string | null,
  kimiBrief?: string | null
): string | undefined {
  const e = evidenceBrief?.trim()
  const k = kimiBrief?.trim()
  if (!e && !k) return undefined
  const cap = SEED_MERGED_BRIEF_MAX_LEN
  if (e && !k) return e.length <= cap ? e : e.slice(0, cap)
  if (!e && k) return k.length <= cap ? k : k.slice(0, cap)
  const head = '## 社区与检索证据摘要（Reddit / 网页）\n\n'
  const sep = '\n\n---\n\n## 联网检索补充（Kimi）\n\n'
  let merged = `${head}${e}${sep}${k}`
  if (merged.length <= cap) return merged
  const budget = cap - head.length - sep.length
  const eStr = e!
  const kStr = k!
  const ePart = eStr.slice(0, Math.min(eStr.length, Math.floor(budget * 0.55)))
  const kPart = kStr.slice(0, Math.max(0, budget - ePart.length))
  merged = `${head}${ePart}${sep}${kPart}`
  return merged.slice(0, cap)
}

/**
 * Reddit/网页证据 → LLM 压缩为锚点简报。设 SEED_EVIDENCE_BRIEF=0 可跳过（省延迟与费用）。
 * 传入 `prefetchedItems` 时不再抓取（与「单次 collect」共用同一份 items）。
 */
export async function buildEvidenceResearchBriefText(
  keyword: string,
  description?: string,
  attachmentContext?: string,
  prefetchedItems?: SuperRecommendEvidenceItem[] | null
): Promise<string | undefined> {
  if (process.env.SEED_EVIDENCE_BRIEF === '0') return undefined
  const cfg = resolveEffectiveLLMConfig()
  const apiKey = (cfg.apiKey || process.env.LLM_API_KEY || '').trim()
  const baseUrl = (cfg.baseUrl || '').trim()
  const model = (cfg.model || '').trim()
  if (!apiKey || !baseUrl || !model) return undefined
  const outputLang = /[\u4e00-\u9fff]/.test(keyword) ? 'zh' : 'en'
  let items: SuperRecommendEvidenceItem[]
  if (prefetchedItems != null) {
    items = prefetchedItems
  } else {
    try {
      items = await collectSuperRecommendEvidence(
        keyword,
        { apiKey, baseUrl, model },
        { outputLang }
      )
    } catch (err) {
      console.warn(
        '[seed-evidence-brief] collect failed:',
        err instanceof Error ? err.message : err
      )
      return undefined
    }
  }
  if (items.length === 0) {
    console.log('[seed-evidence-brief] no evidence items, skipping compress')
    return undefined
  }
  const lines = items.slice(0, 14).map((it, i) => {
    const snip = (it.snippet || '').replace(/\s+/g, ' ').trim().slice(0, 420)
    return `[${i + 1}] ${it.source || 'web'} | ${(it.title || '').slice(0, 120)}\n${snip}\n${(it.url || '').slice(0, 240)}`
  })
  const evidenceBlock = lines.join('\n\n').slice(0, 12000)
  try {
    const { buildEvidenceResearchBriefSystemPrompt, buildEvidenceResearchBriefUserPrompt } =
      await import('./prompts')
    const text = await requestChatCompletion(
      { apiKey, baseUrl, model },
      {
        systemPrompt: buildEvidenceResearchBriefSystemPrompt(),
        prompt: buildEvidenceResearchBriefUserPrompt(
          keyword,
          description,
          attachmentContext,
          evidenceBlock
        ),
        maxTokens: 4096,
        temperature: 0.35,
      }
    )
    const t = text.trim()
    if (!t) return undefined
    console.log('[seed-evidence-brief] compressed length:', t.length)
    return t.slice(0, 5000)
  } catch (err) {
    console.warn(
      '[seed-evidence-brief] compress failed:',
      err instanceof Error ? err.message : err
    )
    return undefined
  }
}

/**
 * 单次 collect + 并行 Kimi / 压缩简报；供种子方向、九格与证据直通车共用。
 * SEED_EVIDENCE_BRIEF=0 且 SEED_DIRECT_EVIDENCE=0 时不抓取证据 items。
 */
export async function composeSeedResearchPackage(
  keyword: string,
  description?: string,
  attachmentContext?: string
): Promise<ComposeSeedResearchPackageResult> {
  const wantEvidence =
    process.env.SEED_EVIDENCE_BRIEF !== '0' || process.env.SEED_DIRECT_EVIDENCE !== '0'

  let evidenceItems: SuperRecommendEvidenceItem[] = []
  if (wantEvidence) {
    const cfg = resolveEffectiveLLMConfig()
    const apiKey = (cfg.apiKey || process.env.LLM_API_KEY || '').trim()
    const baseUrl = (cfg.baseUrl || '').trim()
    const model = (cfg.model || '').trim()
    const outputLang = /[\u4e00-\u9fff]/.test(keyword) ? 'zh' : 'en'
    if (apiKey && baseUrl && model) {
      try {
        evidenceItems = await collectSuperRecommendEvidence(
          keyword,
          { apiKey, baseUrl, model },
          { outputLang }
        )
      } catch (err) {
        console.warn(
          '[seed-research-package] collect failed:',
          err instanceof Error ? err.message : err
        )
      }
    }
  }

  const [kimi, evidence] = await Promise.all([
    generateResearchBriefForSeed(keyword, description, attachmentContext),
    buildEvidenceResearchBriefText(keyword, description, attachmentContext, evidenceItems),
  ])
  const researchBrief = mergeSeedResearchBriefs(evidence, kimi)
  return { researchBrief, evidenceItems }
}

/** 并行拉取 Kimi 简报与证据简报并合并（内部单次 collect，与 composeSeedResearchPackage 一致） */
export async function composeSeedResearchBrief(
  keyword: string,
  description?: string,
  attachmentContext?: string
): Promise<string | undefined> {
  const p = await composeSeedResearchPackage(keyword, description, attachmentContext)
  return p.researchBrief
}

// ── 超级推荐证据：结构见 super-recommend-evidence.ts ──

/**
 * 从 LLM 原始输出中提取并清洗 JSON（容错）。
 * 优先提取 {} 对象，其次 [] 数组；使用平衡括号匹配，避免 lastIndexOf 误截。
 */
function extractJsonBlock(raw: string): unknown {
  // 先用已有的 extractJson（平衡括号 + jsonrepair）提取可解析字符串
  const candidate = (() => {
    try {
      return extractJson(raw)
    } catch {
      return null
    }
  })()
  if (!candidate) return null
  try {
    return JSON.parse(jsonrepair(candidate))
  } catch {
    return null
  }
}

/**
 * 从 LLM 输出解析顶层 JSON 对象（容忍前置说明、```json 围栏等）。
 * 用于迭代/种子等必须返回 {...} 的场景；失败时抛出带截断原文的错误。
 */
function parseLlmJsonObject(raw: string, label: string): Record<string, unknown> {
  const parsed = extractJsonBlock(raw)
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>
  }
  throw new Error(`${label}：模型未返回有效 JSON 对象（原始输出：${raw.slice(0, 120)}）`)
}

/** 清洗并验证 evidence 列表（宽容解析，适应模型输出的字段名变体） */
function parseEvidence(raw: string): SuperRecommendEvidenceItem[] {
  const parsed = extractJsonBlock(raw) as Record<string, unknown> | null
  if (!parsed) return []

  // 模型有时输出 evidence、items、results、posts 等不同键名
  const list =
    Array.isArray(parsed.evidence) ? parsed.evidence :
    Array.isArray(parsed.items)    ? parsed.items :
    Array.isArray(parsed.results)  ? parsed.results :
    Array.isArray(parsed.posts)    ? parsed.posts :
    []
  // 注意：extractJsonBlock 返回类型为 Record<string,unknown>|null，
  // 若模型直接输出顶层数组，已在 extractJsonBlock 内用 { _arr: [...] } 包装并不会到达此处

  if (list.length === 0) return []

  return (list as unknown[])
    .filter((e): e is Record<string, unknown> => e != null && typeof e === 'object')
    .filter((e) => {
      // 只要有「标题」或「链接」之一就接受（放宽最低要求）
      const hasTitle = typeof e.title === 'string' && (e.title as string).trim().length > 0
      const hasUrl = typeof e.url === 'string' && (e.url as string).trim().length > 0
      return hasTitle || hasUrl
    })
    .map((e, idx) => ({
      // id 可能缺失，自动生成
      id: (typeof e.id === 'string' && (e.id as string).trim()) || `e${idx + 1}`,
      url: typeof e.url === 'string' ? (e.url as string).trim() : '',
      title: (typeof e.title === 'string' ? (e.title as string).trim() : '').slice(0, 280),
      snippet: (typeof e.snippet === 'string' ? (e.snippet as string).trim() : '').slice(0, 400),
      source: typeof e.source === 'string' ? (e.source as string).trim() : '',
      upvotes: typeof e.upvotes === 'number' && e.upvotes >= 0 ? Math.round(e.upvotes) : 0,
    }))
    .slice(0, 15)
}

/** Kimi Step A 原始 JSON 解析（供 super-recommend-evidence 动态 import，避免顶层环依赖） */
export function parseKimiSuperRecommendEvidenceRaw(raw: string): SuperRecommendEvidenceItem[] {
  return parseEvidence(raw)
}

/** 将分析阶段原始输出映射为 RecommendCard[]；链接仅允许来自 evidenceIds → evidence.url */
function parseCardsFromAnalysis(raw: string, evidence: SuperRecommendEvidenceItem[]): RecommendCard[] {
  const parsed = extractJsonBlock(raw) as { cards?: unknown } | null
  if (!parsed || !Array.isArray(parsed.cards)) return []

  const evidenceById = new Map(evidence.map((e) => [e.id, e]))

  function resolveEvidenceIds(c: Record<string, unknown>): string[] {
    const rawIds = c.evidenceIds
    if (Array.isArray(rawIds)) {
      const out = rawIds
        .filter((x): x is string => typeof x === 'string')
        .map((s) => s.trim())
        .filter(Boolean)
      if (out.length > 0) return out.slice(0, 6)
    }
    const single = typeof c.evidenceId === 'string' ? c.evidenceId.trim() : ''
    return single ? [single] : []
  }

  const rows: RecommendCard[] = []
  for (const c of parsed.cards) {
    if (
      c == null ||
      typeof c !== 'object' ||
      typeof (c as Record<string, unknown>).keyword !== 'string' ||
      typeof (c as Record<string, unknown>).description !== 'string' ||
      typeof (c as Record<string, unknown>).painPoint !== 'string'
    ) {
      continue
    }
    const rec = c as Record<string, unknown>
    const ids = resolveEvidenceIds(rec)
    if (ids.length === 0) continue

    const items = ids.map((id) => evidenceById.get(id)).filter((x): x is SuperRecommendEvidenceItem => !!x)
    if (items.length === 0) continue

    const withUrl = items.filter((e) => (e.url || '').trim())
    const primary = withUrl[0] ?? items[0]
    const supportingUrls = withUrl
      .slice(1)
      .map((e) => sanitizeSuperRecommendPostUrl(e.url))
      .filter((u): u is string => !!u)

    const postUrl = primary.url ? sanitizeSuperRecommendPostUrl(primary.url) : undefined
    const postTitle =
      (primary.title || (typeof rec.postTitle === 'string' ? String(rec.postTitle).trim() : '')).slice(0, 280) ||
      undefined

    const maxUp = Math.max(0, ...items.map((e) => (typeof e.upvotes === 'number' ? e.upvotes : 0)))
    const src = typeof rec.source === 'string' ? String(rec.source).trim() : ''

    const card: RecommendCard = {
      keyword: String(rec.keyword).trim(),
      description: String(rec.description).trim(),
      painPoint: String(rec.painPoint).trim(),
      upvotes:
        maxUp > 0 ? maxUp : typeof rec.upvotes === 'number' && rec.upvotes > 0 ? Math.round(rec.upvotes) : undefined,
      hotScore:
        typeof rec.hotScore === 'number' ? Math.min(10, Math.max(1, Math.round(rec.hotScore))) : undefined,
      postUrl,
      postTitle,
    }
    if (src) card.source = src
    if (supportingUrls.length > 0) card.supportingPostUrls = supportingUrls
    rows.push(card)
    if (rows.length >= 8) break
  }
  return rows
}

/**
 * 超级 AI 推荐：collectSuperRecommendEvidence（Reddit + Brave/Google + 可选 Kimi）→ Step B 生成 cards。
 * postUrl 仅能通过 evidenceId 映射到证据 URL，与是否 Kimi 端点无关。
 */
export async function generateProductRecommendations(
  query: string,
  userOptions?: SuperRecommendUserOptions
): Promise<RecommendCard[]> {
  const cfg = resolveEffectiveLLMConfig()
  const apiKey = (cfg.apiKey || process.env.LLM_API_KEY || '').trim()
  const baseUrl = (cfg.baseUrl || '').trim()
  const model = (cfg.model || '').trim()
  if (!apiKey || !baseUrl || !model) return []

  const outputLang = userOptions?.outputLang === 'en' ? 'en' : 'zh'

  const {
    buildSuperRecommendAnalysisSystemPrompt,
    buildSuperRecommendAnalysisUserPrompt,
    buildSuperRecommendSystemPrompt,
    buildSuperRecommendWebSearchSystemPrompt,
    buildSuperRecommendUserPrompt,
  } = await import('./prompts')

  let evidence: SuperRecommendEvidenceItem[] = []
  try {
    evidence = await collectSuperRecommendEvidence(query, { apiKey, baseUrl, model }, {
      outputLang,
      excludePostUrls: userOptions?.excludePostUrls,
    })
  } catch (e) {
    console.warn('[super-recommend] evidence pipeline failed:', e instanceof Error ? e.message : e)
    evidence = []
  }

  if (evidence.length > 0) {
    let cardsRaw = ''
    try {
      try {
        cardsRaw = await requestChatCompletion(
          { apiKey, baseUrl, model },
          {
            systemPrompt: buildSuperRecommendAnalysisSystemPrompt(outputLang),
            prompt: buildSuperRecommendAnalysisUserPrompt(query, evidence, {
              excludeKeywords: userOptions?.excludeKeywords,
              outputLang,
            }),
            maxTokens: 2500,
            temperature: JSON_MODE_TEMPERATURE,
            jsonMode: true,
          }
        )
      } catch (e) {
        if (!isJsonModeUnsupported(e)) throw e
        console.warn('[super-recommend] Step B json_object not supported, retrying without jsonMode')
        cardsRaw = await requestChatCompletion(
          { apiKey, baseUrl, model },
          {
            systemPrompt: buildSuperRecommendAnalysisSystemPrompt(outputLang),
            prompt: buildSuperRecommendAnalysisUserPrompt(query, evidence, {
              excludeKeywords: userOptions?.excludeKeywords,
              outputLang,
            }),
            maxTokens: 2500,
            temperature: JSON_PLAIN_TEMPERATURE,
            jsonMode: false,
          }
        )
      }
    } catch (e) {
      console.warn('[super-recommend] Step B (analysis) failed:', e instanceof Error ? e.message : e)
      cardsRaw = ''
    }

    const cards = cardsRaw ? parseCardsFromAnalysis(cardsRaw, evidence) : []
    if (cards.length > 0) return cards

    console.warn('[super-recommend] Step B returned 0 cards, falling back to single-step')
  } else {
    console.warn('[super-recommend] no evidence, falling back to single-step or plain LLM')
  }

  const isKimi = supportsKimiWebSearch(baseUrl)

  let raw: string
  try {
    if (isKimi) {
      // 降级但仍有联网能力 → 用旧版单步 prompt，更简单、更可靠
      raw = await requestKimiResearchWithWebSearch(
        { apiKey, baseUrl, model },
        {
          systemPrompt: buildSuperRecommendWebSearchSystemPrompt(outputLang),
          userPrompt: buildSuperRecommendUserPrompt(query, { ...userOptions, webSearchSingleStep: true }),
          maxTokens: 3000,
          temperature: 0.4,
        }
      )
    } else {
      // 无联网 → 纯推理
      raw = await requestChatCompletion(
        { apiKey, baseUrl, model },
        {
          systemPrompt: buildSuperRecommendSystemPrompt(outputLang),
          prompt: buildSuperRecommendUserPrompt(query, userOptions),
          maxTokens: 2000,
          temperature: 0.45,
        }
      )
    }
  } catch (e) {
    console.warn('[super-recommend] fallback failed:', e instanceof Error ? e.message : e)
    return []
  }

  const parsed = extractJsonBlock(raw) as Record<string, unknown> | null
  if (!parsed) return []
  const cardList = Array.isArray(parsed.cards) ? parsed.cards : []
  return cardList
    .filter(
      (c): c is Record<string, unknown> =>
        c != null &&
        typeof c === 'object' &&
        typeof (c as Record<string, unknown>).keyword === 'string' &&
        typeof (c as Record<string, unknown>).description === 'string' &&
        typeof (c as Record<string, unknown>).painPoint === 'string'
    )
    .map((c) => {
      const rawUrl = typeof c.postUrl === 'string' ? (c.postUrl as string).trim() : ''
      const safeUrl = rawUrl ? sanitizeSuperRecommendPostUrl(rawUrl) : undefined
      return {
        keyword: String(c.keyword).trim(),
        description: String(c.description).trim(),
        painPoint: String(c.painPoint).trim(),
        source: typeof c.source === 'string' ? String(c.source).trim() : undefined,
        upvotes: typeof c.upvotes === 'number' && c.upvotes > 0 ? Math.round(c.upvotes) : undefined,
        hotScore: typeof c.hotScore === 'number' ? Math.min(10, Math.max(1, Math.round(c.hotScore))) : undefined,
        postUrl: isKimi ? safeUrl : undefined,
        postTitle: typeof c.postTitle === 'string' ? String(c.postTitle).trim().slice(0, 280) || undefined : undefined,
      } satisfies RecommendCard
    })
    .slice(0, 8)
}

/**
 * 将「生成探索方向」与「生成产品维度」合并为单次 LLM 调用，节省 1 次 RTT。
 * 返回 { directions, lenses }，directions[0] 作为主方向，lenses 已基于该方向生成。
 */
export async function generatePoolDirectionsAndLenses(
  keyword: string,
  description?: string,
  researchBrief?: string
): Promise<{ directions: string[]; lenses: string[] }> {
  const { buildPoolDirectionsAndLensesPrompt } = await import('./prompts')
  const raw = await callLLM(buildPoolDirectionsAndLensesPrompt(keyword, description, researchBrief))
  const parsed = parseLlmJsonObject(raw, '方向+维度合并生成失败')
  if (!Array.isArray(parsed.directions) || parsed.directions.length < 3) {
    throw new Error(`方向生成失败：期望 3 条方向，实际返回 ${JSON.stringify(parsed.directions)?.slice(0, 100)}`)
  }
  if (!Array.isArray(parsed.lenses) || parsed.lenses.length < 3) {
    throw new Error(`维度生成失败：期望 3 条维度，实际返回 ${JSON.stringify(parsed.lenses)?.slice(0, 100)}`)
  }
  return {
    directions: (parsed.directions as unknown[]).slice(0, 3).map(String),
    lenses: (parsed.lenses as unknown[]).slice(0, 3).map(String),
  }
}

export interface SeedIdeaResult {
  slot: number
  content: string
  score_innovation: number
  score_feasibility: number
  score_impact: number
  total_score: number
}

function pickStrField(o: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = o[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return ''
}

/** Iteration 0：Strict JSON content 压平为六行（兼容旧键名与旧 Slot 模板） */
function seedContentObjectToSixLines(o: Record<string, unknown>): string {
  const keyHasCjk = Object.keys(o).some((k) => /[\u4e00-\u9fff]/.test(k))
  const useZh =
    keyHasCjk ||
    (
      [
        '核心直觉',
        '痛点现场 [Anchor]',
        '痛点现场',
        '交互感知 [UI]',
        '交互感知',
        '底层机制 [Logic]',
        '底层机制',
        '差异化壁垒 [Edge]',
        '差异化壁垒',
        '专注边界',
        '交互原型',
        '定位',
        '痛点',
        '功能',
        '依据',
        '指标',
        '风险',
        '机制',
      ] as const
    ).some((k) => typeof o[k] === 'string' && (o[k] as string).trim())

  const essence = pickStrField(
    o,
    '核心直觉',
    'essence',
    'Essence',
    '定位',
    'Positioning'
  )
  const scene = pickStrField(
    o,
    '痛点现场 [Anchor]',
    '痛点现场',
    'Pain scene [Anchor]',
    'scene',
    'The Scene',
    '痛点',
    'Pain'
  )
  let visual = pickStrField(
    o,
    '交互感知 [UI]',
    '交互感知',
    'Interaction [UI]',
    '交互原型',
    'visual_ui',
    'Visual/UI',
    'VisualUI',
    '功能',
    'Features'
  )
  let mechanism = pickStrField(
    o,
    '底层机制 [Logic]',
    '底层机制',
    'Mechanism [Logic]',
    'mechanism',
    'Mechanism',
    '依据',
    'Rationale'
  )
  const legacyMechanism = pickStrField(o, '机制')
  if (!visual && legacyMechanism) visual = legacyMechanism
  else if (visual && !mechanism && legacyMechanism) mechanism = legacyMechanism
  else if (!visual && !mechanism && legacyMechanism) visual = legacyMechanism

  const edge = pickStrField(
    o,
    '差异化壁垒 [Edge]',
    '差异化壁垒',
    'Differentiation [Edge]',
    'edge',
    'Edge',
    '指标',
    'Metric'
  )
  const focus = pickStrField(
    o,
    '专注边界',
    'Focus boundary',
    'focus',
    'Focus',
    '风险',
    'Risk'
  )

  if (useZh) {
    const [L0, L1, L2, L3, L4, L5] = SEED_BODY_LINE_PREFIX_ZH
    return [
      essence && `${L0}：${essence}`,
      scene && `${L1}：${scene}`,
      visual && `${L2}：${visual}`,
      mechanism && `${L3}：${mechanism}`,
      edge && `${L4}：${edge}`,
      focus && `${L5}：${focus}`,
    ]
      .filter(Boolean)
      .join('\n')
  }

  const [E0, E1, E2, E3, E4, E5] = SEED_BODY_LINE_PREFIX_EN
  return [
    essence && `${E0}: ${essence}`,
    scene && `${E1}: ${scene}`,
    visual && `${E2}: ${visual}`,
    mechanism && `${E3}: ${mechanism}`,
    edge && `${E4}: ${edge}`,
    focus && `${E5}: ${focus}`,
  ]
    .filter(Boolean)
    .join('\n')
}

const SEED_MUTEX_FIELD_MAX = 240

function clipSeedMutexField(s: string, max = SEED_MUTEX_FIELD_MAX): string {
  const t = s.replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  return `${t.slice(0, max - 1)}…`
}

/** 从种子展示正文抽取 UI / Logic，供下一格「互斥进化」prompt 注入 */
function extractSeedMutexFieldsFromDisplayContent(content: string): {
  interactionUi: string
  mechanismLogic: string
} {
  let interactionUi = ''
  let mechanismLogic = ''
  for (const line of content.split('\n')) {
    const t = line.trim()
    if (!t) continue
    let m = t.match(/^交互感知 \[UI\][：:]\s*(.+)$/)
    if (!m) m = t.match(/^Interaction \[UI\][：:]\s*(.+)$/i)
    if (m) interactionUi = m[1]
    let m2 = t.match(/^底层机制 \[Logic\][：:]\s*(.+)$/)
    if (!m2) m2 = t.match(/^Mechanism \[Logic\][：:]\s*(.+)$/i)
    if (m2) mechanismLogic = m2[1]
  }
  return {
    interactionUi: clipSeedMutexField(interactionUi),
    mechanismLogic: clipSeedMutexField(mechanismLogic),
  }
}

function buildSeedIdeaDisplayContent(idea: Record<string, unknown>, requestSlot: number): string {
  const modelSlot = idea.slot != null ? Number(idea.slot) : undefined
  if (modelSlot !== undefined && modelSlot !== requestSlot) {
    console.warn(
      `[seed] slot ${requestSlot}: model returned slot=${modelSlot}, ignoring — using request slot to avoid duplicate writes`
    )
  }
  const title =
    typeof idea.title === 'string' && idea.title.trim() ? idea.title.trim() : ''
  const oneLiner =
    typeof idea.one_liner === 'string' && idea.one_liner.trim()
      ? idea.one_liner.trim()
      : ''

  let body: string
  const raw = idea.content
  if (raw != null && typeof raw === 'object' && !Array.isArray(raw)) {
    body = seedContentObjectToSixLines(raw as Record<string, unknown>)
  } else {
    body = String(raw ?? '')
  }

  if (
    oneLiner &&
    body &&
    !/^一段：/u.test(body) &&
    !/^One-liner:/im.test(body.trim())
  ) {
    const enFirst = /^(Essence|Positioning):/im.test(body)
    body = enFirst ? `One-liner: ${oneLiner}\n${body}` : `一段：${oneLiner}\n${body}`
  }

  if (title) return `「${title}」\n${body}`
  return body
}

function parseSeedIdeaFromLlmJson(raw: string, requestSlot: number): SeedIdeaResult {
  const root = parseLlmJsonObject(raw, `slot ${requestSlot} 种子`)
  const ideaRaw = root.idea
  const idea =
    ideaRaw != null && typeof ideaRaw === 'object' && !Array.isArray(ideaRaw)
      ? (ideaRaw as Record<string, unknown>)
      : (root as Record<string, unknown>)
  const content = buildSeedIdeaDisplayContent(idea, requestSlot)
  const scores = parseIdeaScoresFromModel(idea)
  return {
    slot: requestSlot,
    content,
    ...scores,
  }
}

function parseSeedGridPlanFromLlm(raw: string): SeedGridPlan | null {
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>
    const arr = Array.isArray(obj.plans)
      ? obj.plans
      : Array.isArray(obj.slots)
        ? obj.slots
        : null
    if (!arr || arr.length === 0) return null
    const bySlot = new Map<number, SeedGridPlanSlot>()
    for (const it of arr) {
      if (!it || typeof it !== 'object') continue
      const s = it as Record<string, unknown>
      const slot = Number(s.slot)
      const brief = String(s.execution_brief ?? s.brief ?? s.mandate ?? '').trim()
      if (slot >= 1 && slot <= 9 && brief.length >= 6) {
        bySlot.set(slot, {
          slot,
          execution_brief: brief.slice(0, 900),
          pain_anchor:
            typeof s.pain_anchor === 'string' ? s.pain_anchor.trim().slice(0, 240) : undefined,
          anti_overlap:
            typeof s.anti_overlap === 'string' ? s.anti_overlap.trim().slice(0, 360) : undefined,
        })
      }
    }
    if (bySlot.size !== 9) return null
    const slots: SeedGridPlanSlot[] = []
    for (let n = 1; n <= 9; n++) {
      const x = bySlot.get(n)
      if (!x) return null
      slots.push(x)
    }
    const ang = String(obj.pool_angle ?? obj.poolAngle ?? '').trim()
    return {
      pool_angle: ang.length > 0 ? ang.slice(0, 500) : '—',
      slots,
    }
  } catch {
    return null
  }
}

/**
 * 方向与 lens 就绪后，单次 LLM 生成九格执行规划；后续 9 次 slot 请求会注入对应片段。
 * 设 SEED_GRID_PLAN=0 可跳过（省 1 次调用）。
 */
export async function generateSeedGridPlan(
  keyword: string,
  direction: string,
  lenses?: string[],
  researchBrief?: string,
  description?: string
): Promise<SeedGridPlan | null> {
  if (process.env.SEED_GRID_PLAN === '0') return null
  const cfg = resolveEffectiveLLMConfig()
  const apiKey = (cfg.apiKey || process.env.LLM_API_KEY || '').trim()
  if (!apiKey) return null
  try {
    const { buildSeedGridPlanPrompt } = await import('./prompts')
    const raw = await callLLM(
      buildSeedGridPlanPrompt(keyword, direction, lenses, researchBrief, description),
      { maxTokens: 6144 }
    )
    const plan = parseSeedGridPlanFromLlm(raw)
    if (plan) console.log('[seed] nine-slot grid plan OK')
    else console.warn('[seed] nine-slot grid plan missing or invalid; continuing without')
    return plan
  } catch (e) {
    console.warn('[seed] grid plan LLM error:', e instanceof Error ? e.message : e)
    return null
  }
}

/**
 * 多模型模式：按 Slot 1→9 **顺序**生成，使每格 prompt 可携带已生成格的 UI/Logic 摘要（互斥进化）。
 * 每格仍按 slotModelAssign 选用不同模型；失败则回退主配置一次，再失败写占位。
 */
async function generateSeedIdeasMultiModel(
  keyword: string,
  direction: string,
  lenses: string[] | undefined,
  configs: LLMConfig[],
  poolId: string,
  onSlotGenerated?: (result: SeedIdeaResult) => void,
  attachmentContext?: string,
  description?: string,
  researchBrief?: string,
  gridPlan?: SeedGridPlan | null,
  seedOptions?: GenerateSeedIdeasOptions
): Promise<SeedIdeaResult[]> {
  const { buildSeedIdeaForSlotPrompt } = await import('./prompts')

  const results: SeedIdeaResult[] = new Array(9)
  const priorMutex: SeedMutexPriorEntry[] = []

  for (let slot = 1; slot <= 9; slot++) {
    const lens = lenses ? lenses[Math.floor((slot - 1) / 3)] : undefined
    const cfg = slotModelAssign(slot, 0, poolId, configs)
    const directBlock = seedOptions?.directEvidence?.blockBySlot.get(slot)
    const prompt = buildSeedIdeaForSlotPrompt(
      slot,
      keyword,
      direction,
      lens,
      lenses,
      attachmentContext,
      description,
      researchBrief,
      gridPlan ?? null,
      priorMutex,
      directBlock
    )

    let result: SeedIdeaResult
    try {
      const raw = await callLLMForSeedIdeaWithConfig(prompt, cfg)
      result = parseSeedIdeaFromLlmJson(raw, slot)
    } catch (e) {
      const reasonMsg = e instanceof Error ? e.message : String(e)
      console.warn(
        `[multi-model seed] slot ${slot} failed (${reasonMsg.slice(0, 80)}), retrying with main model`
      )
      try {
        const raw = await callLLMForSeedIdea(prompt)
        result = parseSeedIdeaFromLlmJson(raw, slot)
      } catch (e2) {
        const fbErr = e2 instanceof Error ? e2.message : String(e2)
        console.error(`[multi-model seed] slot ${slot} fallback also failed:`, fbErr)
        result = {
          slot,
          content: `【待补充】格子 ${slot} 生成失败，下一轮迭代时将自动重试`,
          score_innovation: 50,
          score_feasibility: 50,
          score_impact: 50,
          total_score: 50,
        }
      }
    }

    results[slot - 1] = result
    const ex = extractSeedMutexFieldsFromDisplayContent(result.content)
    priorMutex.push({
      slot,
      interactionUi: ex.interactionUi,
      mechanismLogic: ex.mechanismLogic,
    })
    onSlotGenerated?.(result)
  }

  return results
}

/**
 * 生成 9 个种子创意。
 * 若有 ≥2 个参与配置且传入 poolId，则启用多模型模式（按 Slot 1→9 顺序，每格可不同模型）。
 * 否则使用单模型按 Slot 1→9 顺序调用；互斥进化依赖顺序，故不再对种子轮做批量并行。
 * 每完成一个 slot 立即触发 onSlotGenerated 回调。
 */
export async function generateSeedIdeas(
  keyword: string,
  direction: string,
  lenses?: string[],
  poolId?: string,
  attachmentContext?: string,
  description?: string,
  onSlotGenerated?: (result: SeedIdeaResult) => void,
  researchBrief?: string,
  seedOptions?: GenerateSeedIdeasOptions
): Promise<SeedIdeaResult[]> {
  const gridPlan = await generateSeedGridPlan(
    keyword,
    direction,
    lenses,
    researchBrief,
    description
  )

  const participatingConfigs = getParticipatingConfigs()
  if (participatingConfigs.length >= 2 && poolId) {
    console.log(
      `[multi-model] seed: pool=${poolId}, models=${participatingConfigs.map((c) => c.model).join(', ')}`
    )
    return generateSeedIdeasMultiModel(
      keyword,
      direction,
      lenses,
      participatingConfigs,
      poolId,
      onSlotGenerated,
      attachmentContext,
      description,
      researchBrief,
      gridPlan,
      seedOptions
    )
  }

  const { buildSeedIdeaForSlotPrompt } = await import('./prompts')

  const results: SeedIdeaResult[] = new Array(9)
  const priorMutex: SeedMutexPriorEntry[] = []

  for (let slot = 1; slot <= 9; slot++) {
    const lens = lenses ? lenses[Math.floor((slot - 1) / 3)] : undefined
    const directBlock = seedOptions?.directEvidence?.blockBySlot.get(slot)
    const prompt = buildSeedIdeaForSlotPrompt(
      slot,
      keyword,
      direction,
      lens,
      lenses,
      attachmentContext,
      description,
      researchBrief,
      gridPlan ?? null,
      priorMutex,
      directBlock
    )
    let result: SeedIdeaResult
    try {
      const raw = await callLLMForSeedIdea(prompt)
      result = parseSeedIdeaFromLlmJson(raw, slot)
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      console.warn(`[seed] slot ${slot} 生成失败 (${reason.slice(0, 80)}), 使用占位`)
      result = {
        slot,
        content: `【待补充】slot ${slot} 生成失败，下一轮迭代时将自动重试`,
        score_innovation: 50,
        score_feasibility: 50,
        score_impact: 50,
        total_score: 50,
      }
    }
    results[slot - 1] = result
    const ex = extractSeedMutexFieldsFromDisplayContent(result.content)
    priorMutex.push({
      slot,
      interactionUi: ex.interactionUi,
      mechanismLogic: ex.mechanismLogic,
    })
    onSlotGenerated?.(result)
  }
  return results
}

export interface IterationIdeaResult {
  slot: number
  content: string
  score_innovation: number
  score_feasibility: number
  score_impact: number
  total_score: number
  ai_changes: string | null
}

/**
 * 多模型模式下并行迭代所有 slot，每个 slot 由不同模型负责。
 * 失败的 slot 回退到单模型（主配置）重试，如仍失败则保持原内容和分数不变。
 */
async function runIterationMultiModel(
  keyword: string,
  direction: string,
  iteration: number,
  currentIdeas: Array<{
    slot: number
    content: string
    total_score: number
    score_innovation: number
    score_feasibility: number
    score_impact: number
  }>,
  configs: LLMConfig[],
  poolId: string,
  userFeedbacks?: Record<number, string>,
  lenses?: string[],
  researchBrief?: string,
  description?: string
): Promise<IterationIdeaResult[]> {
  const { buildIterationForSlotPrompt } = await import('./prompts')

  const parseIterationIdea = (raw: string, slot: number): IterationIdeaResult => {
    const root = parseLlmJsonObject(raw, `slot ${slot} 迭代`)
    const ideaRaw = root.idea
    const idea =
      ideaRaw != null && typeof ideaRaw === 'object' && !Array.isArray(ideaRaw)
        ? (ideaRaw as Record<string, unknown>)
        : root
    const modelSlot = idea.slot != null ? Number(idea.slot) : undefined
    if (modelSlot !== undefined && modelSlot !== slot) {
      console.warn(
        `[multi-model iterate] slot ${slot}: model returned slot=${modelSlot}, ignoring — using request slot`
      )
    }
    const scores = parseIdeaScoresFromModel(idea)
    return {
      slot,
      content: String(idea.content ?? ''),
      ...scores,
      ai_changes: idea.ai_changes ? String(idea.ai_changes) : null,
    }
  }

  const tasks = currentIdeas.map((idea) => {
    const cfg = slotModelAssign(idea.slot, iteration, poolId, configs)
    const lens = lenses ? lenses[Math.floor((idea.slot - 1) / 3)] : undefined
    const feedback = userFeedbacks?.[idea.slot]
    const prompt = buildIterationForSlotPrompt(
      idea.slot,
      keyword,
      direction,
      iteration,
      currentIdeas,
      feedback,
      lens,
      researchBrief,
      description
    )
    return { slot: idea.slot, cfg, prompt, originalIdea: idea }
  })

  const results = await Promise.allSettled(
    tasks.map(async ({ slot, cfg, prompt }) => {
      const raw = await callLLMWithConfig(prompt, cfg)
      return parseIterationIdea(raw, slot)
    })
  )

  // 失败的 slot 回退到单模型（主配置）重试一次，再失败则保留原内容
  const fallbackPromises = results.map(async (r, i) => {
    if (r.status === 'fulfilled') return r.value
    const { slot, prompt, originalIdea } = tasks[i]
    const reason = r.reason instanceof Error ? r.reason.message : String(r.reason)
    console.warn(`[multi-model iterate] slot ${slot} failed (${reason.slice(0, 80)}), retrying with main model`)
    try {
      const raw = await callLLM(prompt)
      return parseIterationIdea(raw, slot)
    } catch (fallbackErr) {
      const errMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)
      console.error(`[multi-model iterate] slot ${slot} fallback also failed:`, errMsg)
      return {
        slot: originalIdea.slot,
        content: originalIdea.content,
        score_innovation: originalIdea.score_innovation,
        score_feasibility: originalIdea.score_feasibility,
        score_impact: originalIdea.score_impact,
        total_score: originalIdea.total_score,
        ai_changes: null,
      } satisfies IterationIdeaResult
    }
  })

  return Promise.all(fallbackPromises)
}

/**
 * 运行一轮迭代。
 * 若有 ≥2 个参与配置且传入 poolId，则启用多模型模式（每 slot 独立调用）。
 * 否则退化为单模型一次处理所有 9 个创意。
 */
export async function runIterationForPool(
  keyword: string,
  direction: string,
  iteration: number,
  currentIdeas: Array<{
    slot: number
    content: string
    total_score: number
    score_innovation: number
    score_feasibility: number
    score_impact: number
  }>,
  userFeedbacks?: Record<number, string>,
  lenses?: string[],
  poolId?: string,
  researchBrief?: string,
  description?: string
): Promise<IterationIdeaResult[]> {
  const participatingConfigs = getParticipatingConfigs()
  const maxTokens = maxTokensForIteration(iteration)
  if (participatingConfigs.length >= 2 && poolId) {
    console.log(
      `[multi-model] iterate round=${iteration}, pool=${poolId}, models=${participatingConfigs.map((c) => c.model).join(', ')}`
    )
    return runIterationMultiModel(
      keyword,
      direction,
      iteration,
      currentIdeas,
      participatingConfigs,
      poolId,
      userFeedbacks,
      lenses,
      researchBrief,
      description
    )
  }

  // 单模型路径（原有逻辑）
  const { buildIterationPrompt } = await import('./prompts')
  const raw = await callLLM(
    buildIterationPrompt(
      keyword,
      direction,
      iteration,
      currentIdeas,
      userFeedbacks,
      lenses,
      researchBrief,
      description
    ),
    { maxTokens }
  )
  const parsed = parseLlmJsonObject(raw, '迭代生成失败')
  if (!Array.isArray(parsed.ideas)) {
    throw new Error(`迭代生成失败：模型未返回 ideas 数组（原始输出：${raw.slice(0, 100)}）`)
  }

  return parsed.ideas.slice(0, 9).map((idea: Record<string, unknown>) => {
    const scores = parseIdeaScoresFromModel(idea)
    return {
      slot: Number(idea.slot),
      content: String(idea.content ?? ''),
      ...scores,
      ai_changes: idea.ai_changes ? String(idea.ai_changes) : null,
    }
  })
}

/**
 * 流式单次 LLM 调用（使用主配置）。
 * onDelta 每收到增量 token 时调用，Promise resolve 时返回完整文本（含分隔符与 JSON）。
 */
export async function callLLMStream(
  prompt: string,
  onDelta: (delta: string) => void,
  options?: { maxTokens?: number }
): Promise<string> {
  const cfg = resolveEffectiveLLMConfig()
  return requestChatCompletionStream(
    {
      apiKey: cfg.apiKey || process.env.LLM_API_KEY || '',
      baseUrl: cfg.baseUrl,
      model: cfg.model,
    },
    {
      prompt,
      maxTokens: options?.maxTokens ?? MAX_TOKENS,
      temperature: JSON_PLAIN_TEMPERATURE,
      onDelta,
    }
  )
}

/** 使用指定配置进行流式调用 */
export async function callLLMStreamWithConfig(
  prompt: string,
  cfg: LLMConfig,
  onDelta: (delta: string) => void,
  options?: { maxTokens?: number }
): Promise<string> {
  return requestChatCompletionStream(
    {
      apiKey: cfg.apiKey || process.env.LLM_API_KEY || '',
      baseUrl: cfg.baseUrl,
      model: cfg.model,
    },
    {
      prompt,
      maxTokens: options?.maxTokens ?? MAX_TOKENS,
      temperature: JSON_PLAIN_TEMPERATURE,
      onDelta,
    }
  )
}

/**
 * 流式 per-slot 迭代，供 real-engine 调用。
 * 9 个 slot 并行（受 concurrencyLimit 约束，默认 4），每个 slot 流式生成并实时写入缓冲。
 * 每个 slot 完成后立即解析 JSON 并调用 onSlotDone 回调（由调用方负责写库）。
 * 失败的 slot 回退到非流式调用一次；仍失败则调用 onSlotError。
 */
export async function runIterationPerSlotStream(
  keyword: string,
  direction: string,
  iteration: number,
  currentIdeas: Array<{
    slot: number
    content: string
    total_score: number
    score_innovation: number
    score_feasibility: number
    score_impact: number
  }>,
  poolId: string,
  onSlotDelta: (slot: number, delta: string) => void,
  onSlotDone: (result: IterationIdeaResult) => Promise<void>,
  onSlotError: (slot: number, reason: string) => void,
  options?: {
    userFeedbacks?: Record<number, string>
    lenses?: string[]
    researchBrief?: string
    description?: string
    concurrencyLimit?: number
    focusRoundEvidence?: string
    /** 仅对这些 slot 调用 LLM；未列出的 slot 由调用方处理（如沿用上一轮） */
    runSlotsOnly?: number[]
  }
): Promise<void> {
  const {
    userFeedbacks,
    lenses,
    researchBrief,
    description,
    concurrencyLimit = 4,
    focusRoundEvidence,
    runSlotsOnly,
  } = options ?? {}

  const { buildIterationForSlotStreamPrompt, buildIterationForSlotPrompt } =
    await import('./prompts')

  const participatingConfigs = getParticipatingConfigs()

  const parseFromFullBuffer = (full: string, slot: number): IterationIdeaResult => {
    const SEP = '<<<IDEA_JSON>>>'
    const sepIdx = full.indexOf(SEP)
    const jsonPart = sepIdx >= 0 ? full.slice(sepIdx + SEP.length).trim() : full.trim()
    const root = parseLlmJsonObject(jsonPart, `slot ${slot} 流式迭代`)
    const ideaRaw = root.idea
    const idea =
      ideaRaw != null && typeof ideaRaw === 'object' && !Array.isArray(ideaRaw)
        ? (ideaRaw as Record<string, unknown>)
        : root
    const scores = parseIdeaScoresFromModel(idea)
    return {
      slot,
      content: String(idea.content ?? ''),
      ...scores,
      ai_changes: idea.ai_changes ? String(idea.ai_changes) : null,
    }
  }

  const runSlot = async (idea: typeof currentIdeas[0]): Promise<void> => {
    const lens = lenses ? lenses[Math.floor((idea.slot - 1) / 3)] : undefined
    const feedback = userFeedbacks?.[idea.slot]
    const cfg = participatingConfigs.length >= 1
      ? slotModelAssign(idea.slot, iteration, poolId, participatingConfigs)
      : resolveEffectiveLLMConfig()
    const maxTokens = maxTokensForIteration(iteration)

    const streamPrompt = buildIterationForSlotStreamPrompt(
      idea.slot, keyword, direction, iteration,
      currentIdeas, feedback, lens, researchBrief, description, focusRoundEvidence
    )

    try {
      let fullText = ''
      const streamCall =
        participatingConfigs.length >= 1
          ? callLLMStreamWithConfig(streamPrompt, cfg, (d) => {
              fullText += d
              onSlotDelta(idea.slot, d)
            }, { maxTokens })
          : callLLMStream(streamPrompt, (d) => {
              fullText += d
              onSlotDelta(idea.slot, d)
            }, { maxTokens })

      await streamCall

      const result = parseFromFullBuffer(fullText, idea.slot)
      await onSlotDone(result)
    } catch (streamErr) {
      // 流式失败 → 降级到非流式单 slot 调用
      console.warn(
        `[runIterationPerSlotStream] slot ${idea.slot} stream failed, falling back to non-stream`,
        streamErr instanceof Error ? streamErr.message : streamErr
      )
      try {
        const fallbackPrompt = buildIterationForSlotPrompt(
          idea.slot, keyword, direction, iteration,
          currentIdeas, feedback, lens, researchBrief, description, focusRoundEvidence
        )
        const raw = participatingConfigs.length >= 1
          ? await callLLMWithConfig(fallbackPrompt, cfg, { maxTokens })
          : await callLLM(fallbackPrompt, { maxTokens })
        const result = parseIterationIdea(raw, idea.slot)
        await onSlotDone(result)
      } catch (fallbackErr) {
        const errMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)
        onSlotError(idea.slot, errMsg)
      }
    }
  }

  // 限并发执行（可仅跑部分 slot，prompt 仍用完整 currentIdeas 作排名上下文）
  const slotFilter =
    runSlotsOnly && runSlotsOnly.length > 0
      ? new Set(runSlotsOnly.map((s) => Math.floor(s)))
      : null
  const queue = slotFilter
    ? currentIdeas.filter((i) => slotFilter.has(i.slot))
    : [...currentIdeas]
  const totalRun = queue.length
  if (totalRun === 0) return

  let running = 0
  await new Promise<void>((resolve, reject) => {
    const errors: Error[] = []
    let completed = 0

    const tryNext = () => {
      while (running < concurrencyLimit && queue.length > 0) {
        const idea = queue.shift()!
        running++
        runSlot(idea)
          .catch((e) => { errors.push(e instanceof Error ? e : new Error(String(e))) })
          .finally(() => {
            running--
            completed++
            if (completed === totalRun) {
              errors.length > 0 ? reject(errors[0]) : resolve()
            } else {
              tryNext()
            }
          })
      }
    }
    tryNext()
  })
}

/** 解析单个 slot 的迭代结果（从非流式 JSON 字符串），内部工具函数 */
function parseIterationIdea(raw: string, slot: number): IterationIdeaResult {
  const root = parseLlmJsonObject(raw, `slot ${slot} 迭代`)
  const ideaRaw = root.idea
  const idea =
    ideaRaw != null && typeof ideaRaw === 'object' && !Array.isArray(ideaRaw)
      ? (ideaRaw as Record<string, unknown>)
      : root
  const scores = parseIdeaScoresFromModel(idea)
  return {
    slot,
    content: String(idea.content ?? ''),
    ...scores,
    ai_changes: idea.ai_changes ? String(idea.ai_changes) : null,
  }
}

/**
 * 方案报告轮前：根据洞察摘要生成 3 条对抗性网页检索词（池级一次调用）。
 * 设 PROPOSAL_ADVERSARIAL_QUERIES=0 可跳过。失败返回 []，不抛错。
 */
export async function generateAdversarialFocusQueries(input: {
  keyword: string
  direction: string
  insightDigest: string
}): Promise<string[]> {
  if (process.env.PROPOSAL_ADVERSARIAL_QUERIES === '0') return []
  const digest = (input.insightDigest ?? '').trim()
  if (!digest) return []

  const kw = (input.keyword ?? '').trim().slice(0, 120)
  const dir = (input.direction ?? '').trim().slice(0, 120)
  const digestClip = digest.slice(0, 3500)

  const prompt = `你是检索策略顾问。根据主题与洞察摘要，生成 3 条用于网页搜索的「对抗性检索词」，用于挖掘：替代品缺陷、行业技术天花板、ROI/采纳失败案例、安全与合规争议、大厂同类产品的负面评价等。每条应具体、可独立检索，中文或英文均可。

CRITICAL: 仅输出一个 JSON 对象，键为 queries，值为恰好 3 个字符串。禁止 Markdown、禁止解释、禁止多余键。
格式：{"queries":["...","...","..."]}

主题关键词："""${kw}"""
探索方向："""${dir}"""
洞察摘要（高分格节选）：
"""
${digestClip}
"""`

  try {
    const raw = await callLLM(prompt, { maxTokens: 220 })
    const top = JSON.parse(raw) as { queries?: unknown }
    if (!Array.isArray(top.queries)) return []
    const out = top.queries
      .filter((x): x is string => typeof x === 'string')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 3)
    return out
  } catch (e) {
    console.warn('[adversarial-focus-queries] LLM failed, skipping:', e instanceof Error ? e.message : e)
    return []
  }
}
