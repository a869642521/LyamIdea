/**
 * 服务端 LLM 配置全局单例
 * 存储在 globalThis 上，热重载安全，优先级高于环境变量。
 * 由 POST /api/llm-config 写入，adapter.ts 读取。
 */

export interface LLMConfig {
  apiKey: string
  baseUrl: string
  model: string
  /** true = 使用本地 mock 引擎；false = 调用真实 LLM */
  useMock: boolean
}

const g = globalThis as typeof globalThis & {
  __llm_config?: LLMConfig
  /** 参与多模型随机分配的 LLM 配置列表（至少 2 个时启用多模型模式） */
  __participating_configs?: LLMConfig[]
}

export function getLLMConfig(): LLMConfig {
  return (
    g.__llm_config ?? {
      apiKey: process.env.LLM_API_KEY ?? '',
      baseUrl: process.env.LLM_BASE_URL ?? 'https://api.openai.com/v1',
      model: process.env.LLM_MODEL ?? 'gpt-4o-mini',
      useMock: process.env.USE_MOCK_DATA !== 'false',
    }
  )
}

export function setLLMConfig(cfg: LLMConfig): void {
  g.__llm_config = cfg
}

/** 获取参与多模型随机分配的配置列表 */
export function getParticipatingConfigs(): LLMConfig[] {
  return g.__participating_configs ?? []
}

/** 设置参与多模型随机分配的配置列表 */
export function setParticipatingConfigs(cfgs: LLMConfig[]): void {
  g.__participating_configs = cfgs
}

/** 返回脱敏后的 apiKey（前 8 位 + ***） */
export function maskApiKey(key: string): string {
  if (!key) return ''
  if (key.length <= 8) return '***'
  return key.slice(0, 8) + '***'
}
