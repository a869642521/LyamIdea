/**
 * 服务端网页搜索（Brave / Google）运行时覆盖：内存 + 本地 JSON 持久化。
 * POST /api/web-search-config 写入；聚焦证据与超级推荐等读取 effective key。
 *
 * 持久化目录：默认 `项目根/.data/web-search-runtime.json`（已 gitignore），
 * 可通过环境变量 WEB_SEARCH_CONFIG_DIR 指向可写卷（如 Docker）。
 * Serverless 只读文件系统下写入会失败，仅保留内存；生产建议仍用 BRAVE_SEARCH_API_KEY。
 */

import fs from 'fs'
import path from 'path'
import { maskApiKey } from '@/lib/llm-config'

export type FocusEvidenceProviderMode = 'auto' | 'brave' | 'google'

type Runtime = {
  /** 若存在该字段（含空字符串），则优先于环境变量 BRAVE_SEARCH_API_KEY */
  braveApiKey?: string
  /** 若存在，优先于环境变量 FOCUS_EVIDENCE_PROVIDER（仅 brave | google） */
  focusProvider?: 'brave' | 'google'
}

const g = globalThis as typeof globalThis & {
  __web_search_runtime?: Runtime
  __web_search_runtime_hydrated?: boolean
}

function dataFilePath(): string {
  const dir = process.env.WEB_SEARCH_CONFIG_DIR?.trim() || path.join(process.cwd(), '.data')
  return path.join(dir, 'web-search-runtime.json')
}

function hydrateFromDiskOnce(): void {
  if (g.__web_search_runtime_hydrated) return
  g.__web_search_runtime_hydrated = true
  try {
    const file = dataFilePath()
    if (!fs.existsSync(file)) return
    const raw = fs.readFileSync(file, 'utf8')
    const data = JSON.parse(raw) as Record<string, unknown>
    if (!data || typeof data !== 'object') return
    const rt: Runtime = {}
    if (typeof data.braveApiKey === 'string') rt.braveApiKey = data.braveApiKey
    if (data.focusProvider === 'brave' || data.focusProvider === 'google') {
      rt.focusProvider = data.focusProvider
    }
    if (Object.keys(rt).length > 0) g.__web_search_runtime = rt
  } catch (e) {
    console.warn('[web-search-config] load disk failed:', e)
  }
}

function persistToDisk(next: Runtime | undefined): void {
  try {
    const file = dataFilePath()
    const dir = path.dirname(file)
    if (!next || Object.keys(next).length === 0) {
      if (fs.existsSync(file)) fs.unlinkSync(file)
      return
    }
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(file, JSON.stringify(next, null, 0), { encoding: 'utf8', mode: 0o600 })
  } catch (e) {
    console.warn('[web-search-config] persist disk failed (memory still updated):', e)
  }
}

function getRuntime(): Runtime {
  hydrateFromDiskOnce()
  return g.__web_search_runtime ?? {}
}

function setRuntime(next: Runtime | undefined): void {
  if (!next || Object.keys(next).length === 0) {
    g.__web_search_runtime = undefined
    persistToDisk(undefined)
    return
  }
  g.__web_search_runtime = next
  persistToDisk(next)
}

/** 当前是否使用本地覆盖的 Brave Key（非环境变量） */
export function hasBraveApiKeyOverride(): boolean {
  return 'braveApiKey' in getRuntime()
}

/** 合并后的 Brave Subscription Token（覆盖优先，否则 env） */
export function getEffectiveBraveApiKey(): string {
  const r = getRuntime()
  if ('braveApiKey' in r) return (r.braveApiKey ?? '').trim()
  return process.env.BRAVE_SEARCH_API_KEY?.trim() ?? ''
}

export function getFocusProviderOverride(): 'brave' | 'google' | undefined {
  const p = getRuntime().focusProvider
  return p === 'brave' || p === 'google' ? p : undefined
}

export function maskEffectiveBraveKey(): string {
  return maskApiKey(getEffectiveBraveApiKey())
}

export function getFocusProviderModeForApi(): FocusEvidenceProviderMode {
  const p = getRuntime().focusProvider
  return p === 'brave' || p === 'google' ? p : 'auto'
}

/** PATCH 式更新：仅传入的字段会生效 */
export function patchWebSearchRuntime(patch: {
  braveApiKey?: string
  clearBraveApiKey?: boolean
  focusEvidenceProvider?: FocusEvidenceProviderMode
}): void {
  const cur = { ...getRuntime() }

  if (patch.clearBraveApiKey) {
    delete cur.braveApiKey
  } else if (typeof patch.braveApiKey === 'string') {
    cur.braveApiKey = patch.braveApiKey
  }

  if (patch.focusEvidenceProvider === 'auto') {
    delete cur.focusProvider
  } else if (patch.focusEvidenceProvider === 'brave' || patch.focusEvidenceProvider === 'google') {
    cur.focusProvider = patch.focusEvidenceProvider
  }

  setRuntime(Object.keys(cur).length ? cur : undefined)
}
