/**
 * 主流大模型预设，选择后自动填充 Base URL 和 Model
 */
export interface LLMPreset {
  name: string
  baseUrl: string
  model: string
  /** 提供模型列表时，以下拉框代替文本输入 */
  models?: string[]
  /** 模型字段的额外说明，显示在输入框下方 */
  modelNote?: string
}

/** 火山方舟标准版可用模型 */
const VOLCES_MODELS = [
  'doubao-seed-2-0-flash',
  'doubao-seed-2-0-lite',
  'doubao-pro-256k',
  'doubao-pro-32k',
  'doubao-pro-4k',
  'doubao-lite-32k',
  'doubao-lite-4k',
  'deepseek-r1-250528',
  'deepseek-v3-250324',
  'moonshot-v1-8k',
  'moonshot-v1-128k',
]

/** 火山方舟 CodingPlan 可用模型 */
const CODING_PLAN_MODELS = [
  'ark-code-latest',
  'doubao-seed-2.0-code',
  'doubao-seed-2.0-pro',
  'doubao-seed-2.0-lite',
  'deepseek-v3.2',
  'glm-4.7',
  'kimi-k2.5',
  'minimax-m2.5',
]

export const LLM_PRESETS: LLMPreset[] = [
  // OpenAI
  { name: 'OpenAI GPT-4o', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o' },
  { name: 'OpenAI GPT-4o-mini', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { name: 'OpenAI GPT-4-turbo', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4-turbo' },
  // Kimi
  { name: 'Kimi K2', baseUrl: 'https://kimi-k2.ai/api/v1', model: 'kimi-k2-0905' },
  { name: 'Kimi K2 快速版', baseUrl: 'https://kimi-k2.ai/api/v1', model: 'kimi-k2' },
  { name: 'Kimi K2 Thinking', baseUrl: 'https://kimi-k2.ai/api/v1', model: 'kimi-k2-thinking' },
  {
    name: 'Kimi Code (官方 Coding 平台)',
    baseUrl: 'https://api.kimi.com/coding/v1',
    model: 'kimi-for-coding',
    models: ['kimi-for-coding', 'kimi-k2', 'kimi-k2-0905', 'kimi-k2-thinking'],
    modelNote: '🔑 Key 来源：kimi.com/code 控制台（格式 sk-kimi-xxxxxxxx）。⚠️ 注意：Base URL 必须包含 /coding/v1 路径，普通 api.moonshot.cn 不适用于 Coding 专用 Key',
  },
  // 月之暗面 Moonshot（平台直连，含 K2.5）
  { name: 'Moonshot Kimi', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
  { name: 'Moonshot Kimi-128K', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-128k' },
  { name: 'Moonshot Kimi K2.5', baseUrl: 'https://api.moonshot.cn/v1', model: 'kimi-k2.5' },
  // DeepSeek
  { name: 'DeepSeek Chat', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { name: 'DeepSeek Coder', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-coder' },
  // 通义千问
  { name: '通义千问 Qwen-Plus', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  { name: '通义千问 Qwen-Turbo', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-turbo' },
  { name: '通义千问 Qwen-Max', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-max' },
  // 智谱 GLM
  { name: '智谱 GLM-4', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
  { name: '智谱 GLM-4 Pro', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-plus' },
  // Claude (Anthropic)
  { name: 'Claude Sonnet', baseUrl: 'https://api.anthropic.com', model: 'claude-3-5-sonnet-20241022' },
  { name: 'Claude Haiku', baseUrl: 'https://api.anthropic.com', model: 'claude-3-5-haiku-20241022' },
  // 豆包 = 字节火山方舟 OpenAPI（模型名多为 doubao-*）
  {
    name: '豆包 · 火山方舟（在线推理）',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    model: 'doubao-pro-32k',
    models: VOLCES_MODELS,
    modelNote: '在火山引擎控制台创建推理接入点，API Key 与 Endpoint ID 按方舟文档配置；下方模型列表为常用名，若控制台显示为 ep-xxx 请改用「自定义」填写',
  },
  {
    name: '豆包 · 火山方舟（CodingPlan）',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/coding/v3',
    model: 'ark-code-latest',
    models: CODING_PLAN_MODELS,
    modelNote: '⚠️ Base URL 必须用 /api/coding/v3，勿填 /api/v3；同时应使用 CodingPlan 专用模型名（如 ark-code-latest / doubao-seed-2.0-code），不要填写在线推理 Model ID',
  },
  // OpenClaw Gateway（自托管 AI Agent，默认端口 18789）
  {
    name: 'OpenClaw Gateway',
    baseUrl: 'http://127.0.0.1:18789/v1',
    model: 'openclaw:main',
    models: ['openclaw:main', 'openclaw:beta', 'openclaw'],
    modelNote: '需先在 openclaw.json 中开启：gateway.http.endpoints.chatCompletions.enabled = true。model 格式为 openclaw:<agent-id>，默认 agent id 为 main',
  },
  // 自定义（用户可手动填写）
  { name: '自定义', baseUrl: '', model: '' },
]
