// Prompt templates for Idea Bazaar AI engine

/**
 * 注入种子 / 迭代 prompt，统一标尺、减少「全员 72 分」与虚高。
 */
export const SCORE_RUBRIC_PROMPT_SNIPPET = `
评分标尺（0–100 整数）：
- 20–39：明显短板（论证弱、同质化、难落地或影响面窄）
- 40–59：及格但平庸，有重大未解决风险或缺少差异化
- 60–74：良好，有清晰价值与可执行路径，仍有可改进处
- 75–89：优秀，论证与落地性兼具，差异化明显
- 90–100：极少数「全场顶尖」，须确有强差异化或极强的可执行+影响组合；禁止滥用

综合分不要自造：只输出三维整数；系统按 创新×40% + 可行×40% + 影响×20% 计算总分。

诚实与分差：
- 套话多、依据空泛、指标不可验收时，对应维度须明显偏低。
- 禁止无理由把三个维度都压在 68–78 的「安全分」区间。
- 相对更弱的方案总分须低于相对更强的方案；分数变化须与文案实质增量匹配。
`

/** 批量迭代（单响应 9 格）专用：要求池内排序层次 */
const SCORE_SPREAD_BATCH_SNIPPET = `
一次性输出 9 格时：按质量拉开排名——9 个方案加权总分在池内应覆盖至少约 15 分的极差（除非九格确实极其接近）；禁止 9 个总分挤在同一 6 分带宽内。
`

/** 单项 0–100；缺失或非数用 neutral，避免默认虚高 */
export function parseScoreDimension(value: unknown, neutral = 50): number {
  if (value == null) return neutral
  const n = Number(value)
  if (!Number.isFinite(n)) return neutral
  return Math.min(100, Math.max(0, Math.round(n)))
}

/** 加权综合分：各维先做 0–100 规整，缺失/非数为 50 */
export function calcTotalScore(
  innovation: unknown,
  feasibility: unknown,
  impact: unknown
): number {
  const i = parseScoreDimension(innovation)
  const f = parseScoreDimension(feasibility)
  const imp = parseScoreDimension(impact)
  return Math.round(i * 0.4 + f * 0.4 + imp * 0.2)
}

/**
 * 从模型返回的对象解析三维分数与总分（总分恒由权重公式重算，忽略模型自报 total）。
 */
export function parseIdeaScoresFromModel(idea: Record<string, unknown>): {
  score_innovation: number
  score_feasibility: number
  score_impact: number
  total_score: number
} {
  const score_innovation = parseScoreDimension(idea.score_innovation)
  const score_feasibility = parseScoreDimension(idea.score_feasibility)
  const score_impact = parseScoreDimension(idea.score_impact)
  return {
    score_innovation,
    score_feasibility,
    score_impact,
    total_score: calcTotalScore(score_innovation, score_feasibility, score_impact),
  }
}

/** Kimi 联网简报（Coding / Moonshot API）：系统侧约束（固定 1 次综合检索、市场扫描式简报） */
export function buildResearchBriefSystemPrompt(): string {
  return `你是资深产品策略研究员，可使用联网搜索工具。

硬性规则：
1. 只允许触发「一次」综合联网检索：请把与主题相关的子问题合并成一次搜索意图，不要为细枝末节反复搜索。
2. 检索完成后，输出一份「第一轮简报」，总篇幅约 **600～1000 字**（中文），精炼、可扫读、可执行。
3. 简报偏「市场 + 痛点 + 可落地方向」：少堆百科事实，多写**谁在用啥、痛在哪、机会在哪**。
4. 关键判断尽量带一句依据（括号内「检索摘要」「品类惯例」等即可），不要罗列长引用或 URL。

简报请严格使用以下 Markdown 结构（## 小标题原样保留，便于下游对齐）：

## 核心发现总结
（3～5 句执行摘要：结论先行——机会窗口、竞争态势、最大风险或约束中的 1～2 条；忌空话）

## 市场现状
- **主流产品**：（列举 4～8 个代表性产品/工具/品牌，用顿号或短列表，可含国内外）
- **市场成熟度**：（一句定性，如「成熟红海 / 有品类无头部 / 中等、工具多但差异化不足」等，并括号附一句依据）

## 用户痛点（按优先级）
（**5～7 条**，按严重度或需求频次从高到低排序；每条格式：**短标题（4～10 字） - 一句具体说明**（≤35 字），类似「画质损失 - 压缩后出现模糊、色带、蚊噪」；须能落到真实使用场景）

## 推荐产品方向
（**2～3 套**可落地方案；第一套必须写 **方案A（推荐）**，其余为 **方案B**、可选 **方案C**。每套：**一行定位名**（像产品名或品类切入）+ 下方 **3～6 条**「-」子要点，写**可验收的能力/架构/差异化**（如「AI 内容感知压缩」「本地优先保护隐私」「批量工作流」），避免口号式形容词堆砌；可注明与上文哪类痛点对应。）

## 本轮不做
（1～2 条：明确本轮不展开的方向及简短理由，防止发散）

若用户主题为英文，则整份简报用英文写，结构标题对应为：## Core findings / ## Market landscape / ## User pain points (prioritized) / ## Recommended directions / ## Out of scope`
}

export function buildResearchBriefUserPrompt(
  keyword: string,
  description?: string,
  attachmentContext?: string
): string {
  const parts = [`主题关键词：「${keyword}」`]
  if (description?.trim()) {
    parts.push(`项目细节：\n${description.trim().slice(0, 500)}`)
  }
  if (attachmentContext?.trim()) {
    parts.push(`用户已上传的参考资料（节选）：\n${attachmentContext.trim().slice(0, 1200)}`)
  }
  parts.push(
    '请先完成一次综合联网检索，再按系统说明输出「第一轮简报」：要有市场现状、痛点优先级与推荐方案（方案A 标注推荐），不要输出与简报无关的寒暄。'
  )
  return parts.join('\n\n')
}

/** 将 Reddit/网页证据压缩为种子锚点简报（纯文本 Markdown，非 JSON） */
export function buildEvidenceResearchBriefSystemPrompt(): string {
  return `你是资深产品研究员，只根据用户提供的「检索证据摘录」写一份锚点简报，不得编造未出现在摘录中的链接或帖子。

硬性规则：
1. 输出语言与主题关键词一致：关键词含中文则全文中文，否则英文。
2. 总篇幅约 **700～1200 字**，精炼、可扫读；用 Markdown ## / ### 小标题。
3. 必须包含 **恰好 5 条**「核心痛点证据」编号为 **P1～P5**。每条：1～2 句复述证据中的具体抱怨/现象，并在括号内标注来源类型（Reddit / 网页 / 等，来自摘录即可）。
4. **强制约束**：对 P1～P5 **每一条**，必须在紧接其下写出 **至少 1 条**「反向提案 / 解决方向」（一句话即可，要求可映射到具体产品能力，禁止空泛口号）。
5. 增加一小节「共识与分歧」或「长尾信号」（3～5 句）：指出证据中少数但值得注意的声音、未被满足的边缘场景，供下游创意差异化使用。
6. 不要输出 JSON；不要代码块包裹全文；不要寒暄。`
}

export function buildEvidenceResearchBriefUserPrompt(
  keyword: string,
  description: string | undefined,
  attachmentContext: string | undefined,
  evidenceBlock: string
): string {
  const parts = [`主题关键词：「${keyword}」`]
  if (description?.trim()) parts.push(`项目细节：\n${description.trim().slice(0, 500)}`)
  if (attachmentContext?.trim()) {
    parts.push(`用户已上传的参考资料（节选）：\n${attachmentContext.trim().slice(0, 800)}`)
  }
  parts.push(`以下为检索到的证据摘录（可能含标题、摘要、链接），请严格据此写锚点简报：\n\n${evidenceBlock}`)
  return parts.join('\n\n')
}

/**
 * 让 AI 根据主题关键词和方向，在 3 个产品维度框架内生成具体子角度。
 * 3 个维度固定顺序不变，每个维度分配 3 个 slot（共 9 个 slot）。
 * 维度框架：产品立项 / 产品创新 / 落地可行性
 */
export function buildPoolLensesPrompt(
  keyword: string,
  direction: string,
  description?: string,
  researchBrief?: string
): string {
  const descLine = description ? `\nProject context: ${description.slice(0, 200)}` : ''
  const briefLine = researchBrief?.trim()
    ? `\n\n联网检索简报（须优先对齐其中「用户痛点」「推荐产品方向」与「市场现状」，勿脱离简报空想）：\n${researchBrief.trim().slice(0, 3500)}`
    : ''
  return `CRITICAL: Begin your response with \`{\` immediately. Do NOT write any preamble, introduction, or description of the task. Execute directly.
OUTPUT: Return ONLY valid JSON. No prose, no explanation, no markdown outside the JSON block.

TASK: Given the theme keyword and creative direction below, produce exactly 3 product lens sub-angle labels. Sub-angles must stay on **concrete product surface** (features, flows, constraints) implied by the keyword + direction — extensions of core capability, not abstract slogans.

Inputs:
- Theme keyword: "${keyword}"
- Creative direction: "${direction}"${descLine}${briefLine}

For each of the 3 fixed product lenses below, write a SHORT, specific sub-angle label (max 8 words) that fits this keyword and direction. The lens order and categories are FIXED — only customize the sub-angle label.

Fixed lens framework:
1. 产品立项 (Product Charter) — problem framing, positioning, target users & jobs-to-be-done, why build now, MVP scope, success criteria
2. 产品创新 (Product Innovation) — novel features, creative mechanisms, disruptive angles
3. 落地可行性 (Feasibility) — implementation path, tech stack, resource constraints, go-to-market

Return ONLY valid JSON where each lens label is tailored to the keyword+direction:
{
  "lenses": [
    "产品立项 sub-angle (max 8 words)",
    "产品创新 sub-angle (max 8 words)",
    "落地可行性 sub-angle (max 8 words)"
  ]
}

Respond in the same language as the keyword.`
}

export function buildPoolDirectionsPrompt(keyword: string): string {
  return `CRITICAL: Begin your response with \`{\` immediately. Do NOT write any preamble, introduction, or description of the task. Execute directly.
OUTPUT: Return ONLY valid JSON. No prose, no explanation, no markdown outside the JSON block.

TASK: Given the theme keyword "${keyword}", generate exactly 3 distinct thematic sub-directions for creative idea exploration.

Anchor rule (first round): All three directions MUST grow from the **core product capability or primary user job** implied by the keyword — not unrelated themes. Differentiate by **distinct facets or natural extensions** of that core (e.g. key workflow stages, critical user segments, enabling features, integrations, quality/performance of the main loop). Avoid directions that are only loosely tied (generic brand story, vague "social impact", or industry commentary without a concrete product hook).

Return ONLY valid JSON in this exact format:
{
  "directions": [
    "Direction 1 label (max 15 words)",
    "Direction 2 label (max 15 words)",
    "Direction 3 label (max 15 words)"
  ]
}

Rules:
- Each direction must be genuinely distinct from the others while still orbiting the same core functionality
- Labels should be concise, inspiring, and actionable (readable as product exploration axes, not essay titles)
- Respond in the same language as the keyword`
}

// ── 种子轮 · 槽位考古学（Slot Archetypes）：强制九格基因分化，降低同质化 ──

export type SeedArchetypeLang = 'zh' | 'en'

function detectSeedPromptLang(keyword: string): SeedArchetypeLang {
  return /[\u4e00-\u9fff]/.test(keyword) ? 'zh' : 'en'
}

/** 每格一条，供单格调用时看见全池领土 */
const SEED_ARCHETYPE_POOL_LINES_ZH = [
  'Slot1 极简/降维｜Slot2 极简/降维（与1不同切口）',
  'Slot3 极致体验/社交货币｜Slot4 极致体验/社交货币（与3不同切口）',
  'Slot5 技术原住民（Agent/多模态/API 护城河）｜Slot6 同上（与5不同技术或场景切口）',
  'Slot7 商业重构（利益链/模式）｜Slot8 商业重构（与7不同重构假设）',
  'Slot9 黑天鹅/狂想（边缘但启发，仍弱相关主题）',
] as const

const SEED_ARCHETYPE_POOL_LINES_EN = [
  'Slot1 Minimalist/dedupe | Slot2 same gene, distinct cut (no narrative overlap with 1)',
  'Slot3 Peak UX / social currency | Slot4 same gene, distinct cut (no overlap with 3)',
  'Slot5 Tech-native moat (AI agent / multimodal / API) | Slot6 same gene, distinct tech or segment',
  'Slot7 Business-model reinvention | Slot8 same gene, distinct reinvention thesis vs 7',
  'Slot9 Black-swan / wild (absurd yet insightful; stay weakly tied to theme)',
] as const

const SEED_SLOT_MANDATE_ZH: Record<number, string> = {
  1: '【极简主义/降维】砍掉约 80% 行业惯用冗余，只保留解决核心痛点的最小闭环；最土、最快、最低成本路径；明确「不做什么」。',
  2: '【极简主义/降维】与 Slot1 同基因但必须不同人群/场景/交付形态；禁止同一产品故事换皮；仍坚持少功能、快验证。',
  3: '【极致体验/社交货币】可刻意忽略成本与工程难度；追求让用户「尖叫」的交互、仪式感或可分享的身份认同。',
  4: '【极致体验/社交货币】与 Slot3 同基因但必须不同体验杠杆（如社交展示 vs 沉浸流程）；禁止与 3 语义重合。',
  5: '【技术原住民】必须以 AI Agent、多模态链路或特定 API/数据飞轮等构建**逻辑护城河**；技术选择是产品定义的一部分。',
  6: '【技术原住民】与 Slot5 同基因但必须不同技术支点或场景（如编排型 Agent vs 端侧多模态）；禁止重复 5 的主叙事。',
  7: '【商业重构】改变行业利益分配：如软件变服务、订阅重塑、B 端能力 C 端化、抽成/分账结构创新等；写清「钱与权」怎么动。',
  8: '【商业重构】与 Slot7 同基因但必须不同重构假设（如平台化 vs 垂直一体化）；禁止与 7 同一套商业模式复述。',
  9: '【黑天鹅/狂想】允许看似荒谬、边缘、非常规，但必须**一眼可辨**且对决策者有启发；仍须与关键词/方向弱相关，禁止完全无关幻想。',
}

const SEED_SLOT_MANDATE_EN: Record<number, string> = {
  1: '[Minimalist / dedupe] Cut ~80% of conventional feature bloat; smallest loop that kills the core pain; crudest, fastest, cheapest path; state what you will NOT build.',
  2: '[Minimalist / dedupe] Same gene as Slot1 but a different segment, scenario, or delivery shape; no copy-paste narrative; still few features, fast validation.',
  3: '[Peak UX / social currency] Ignore cost/engineering pain if needed; aim for delight, ritual, or identity/signal value users want to show off.',
  4: '[Peak UX / social currency] Same gene as Slot3 but a different experience lever (e.g. shareable status vs deep flow); no semantic overlap with 3.',
  5: '[Tech-native] Must hinge on AI agents, multimodal pipelines, or a specific API/data flywheel as the **logical moat**; tech choice defines the product.',
  6: '[Tech-native] Same gene as Slot5 but a different technical anchor or scenario (e.g. orchestration agent vs on-device multimodal); do not repeat 5’s core story.',
  7: '[Business reinvention] Reshape who captures value: SaaS→outcome, B→C, marketplace take-rate, rev-share, etc.; say how money/power moves.',
  8: '[Business reinvention] Same gene as Slot7 but a different thesis (e.g. platform vs vertical integration); no restating 7’s same model.',
  9: '[Black swan / wild] Edgy or absurd yet **clearly distinct** and thought-provoking; stay weakly tied to the theme/keyword—no random sci-fi.',
}

/** 本格强制基因（1–9）；越界返回空串 */
export function getSeedSlotArchetypeMandate(slot: number, lang: SeedArchetypeLang): string {
  if (slot < 1 || slot > 9) return ''
  return lang === 'zh' ? SEED_SLOT_MANDATE_ZH[slot]! : SEED_SLOT_MANDATE_EN[slot]!
}

/** 九格固定「叙事滤镜」：与考古学基因对齐，用于强制差异化脑暴 */
const SEED_NARRATIVE_LENS_ZH: Record<number, string> = {
  1: '极致平替/奥卡姆剃刀：只保留核心功能、去掉花哨包装，成本目标约降九成，专打最刚需、最基础的痛点闭环。',
  2: '极简第二切口：与 Slot1 同基因（少即是多），但必须不同人群/场景/交付形态，禁止换皮复述。',
  3: '情绪价值型：仪式感、身份认同、可分享的「爽点」，可刻意忽略部分成本与工程难度。',
  4: '情绪价值第二切口：与 Slot3 同基因，不同体验杠杆（如展示型 vs 沉浸流程），禁止语义撞车。',
  5: 'AI 原生型：产品定义以 Agent、多模态链路或 API/数据飞轮为护城河，技术是产品叙事主轴。',
  6: 'AI 原生第二切口：与 Slot5 同基因，不同技术支点或场景（如编排型 vs 端侧多模态）。',
  7: '流程颠覆型：重写交付链、协作链或利益分配（谁干活、谁付钱、谁掌控数据），写清流程与权力如何变化。',
  8: '流程颠覆第二切口：与 Slot7 同基因，不同重构假设（如平台化 vs 垂直一体化）。',
  9: '黑天鹅/边缘启发：非常规、边缘但一眼可辨、对决策有启发；与主题弱相关，禁止无关幻想。',
}

const SEED_NARRATIVE_LENS_EN: Record<number, string> = {
  1: 'Extreme value / Occam: core utility only, strip packaging bloat, target ~90% cost down; nail the most essential pain loop.',
  2: 'Minimal second cut: same gene as Slot1 but different segment, scenario, or delivery—no narrative copy-paste.',
  3: 'Emotional value: ritual, identity, shareable delight; cost/engineering may be secondary.',
  4: 'Emotional second cut: same gene as Slot3, different lever (status vs deep flow)—no overlap.',
  5: 'AI-native: agents, multimodal stack, or API/data flywheel as the moat; tech defines the product story.',
  6: 'AI-native second cut: same gene as Slot5, different anchor (orchestration vs on-device, etc.).',
  7: 'Process disruption: who does the work, who pays, who owns data—rewrite the chain; be explicit.',
  8: 'Process disruption second cut: same gene as Slot7, different thesis (platform vs vertical integration, etc.).',
  9: 'Black swan / edge: unconventional yet insightful; weakly tied to theme—no random sci-fi.',
}

export function getSeedNarrativeLens(slot: number, lang: SeedArchetypeLang): string {
  if (slot < 1 || slot > 9) return ''
  return lang === 'zh' ? SEED_NARRATIVE_LENS_ZH[slot]! : SEED_NARRATIVE_LENS_EN[slot]!
}

export function buildSeedNarrativeLensSection(slot: number, keyword: string): string {
  const lang = detectSeedPromptLang(keyword)
  const text = getSeedNarrativeLens(slot, lang)
  if (!text) return ''
  if (lang === 'zh') {
    return `
## 本格叙事滤镜（强制）
**Slot ${slot}：** ${text}

**优先级说明：** 本格须 **同时满足** 上列叙事滤镜与下文「槽位考古学」；二者冲突时以 **考古学细节** 为准。下方「本格子负责的产品视角」来自团队粗粒度维度（每 3 格一组），仅作语气与防撞车补充，**不得压过**叙事滤镜与考古学所要求的差异化。
`
  }
  return `
## Mandatory narrative lens (this slot)
**Slot ${slot}:** ${text}

**Priority:** Satisfy **both** this lens and the Slot Archeology below; if they clash, follow **Archeology** for specifics. The "product lens" line is a coarse team-wide label (3 slots each)—use it for tone and de-overlap only, not to collapse ideas into generic PRD.
`
}

export function buildSeedNarrativeMatrixForBatchPrompt(keyword: string): string {
  const lang = detectSeedPromptLang(keyword)
  if (lang === 'zh') {
    return `
### 叙事滤镜矩阵（九格强制，与 slot 一一对应）
除下述 Archetype 约束外，每个 slot 还须满足对应叙事滤镜（title/正文须可被识别）：
- Slot1 极致平替/奥卡姆剃刀｜Slot2 极简第二切口｜Slot3–4 情绪价值型及第二切口｜Slot5–6 AI 原生型及第二切口｜Slot7–8 流程颠覆型及第二切口｜Slot9 黑天鹅/边缘启发。
`
  }
  return `
### Narrative lens matrix (mandatory per slot)
Besides Archetypes, each slot must match: Slot1 extreme value/Occam | Slot2 minimal second cut | Slots3–4 emotional | Slots5–6 AI-native | Slots7–8 process disruption | Slot9 black swan.
`
}

export function buildSeedSlotArcheologySection(slot: number, keyword: string): string {
  const lang = detectSeedPromptLang(keyword)
  const poolLines = lang === 'zh' ? SEED_ARCHETYPE_POOL_LINES_ZH : SEED_ARCHETYPE_POOL_LINES_EN
  const mandate = getSeedSlotArchetypeMandate(slot, lang)
  if (!mandate) return ''

  const scoringHint =
    lang === 'zh'
      ? slot <= 2
        ? '评分提示：本格可行性与成本/落地速度须诚实；勿为「极简」虚抬可行分。'
        : slot === 9
          ? '评分提示：创新可偏高；若方案刻意荒谬，可行分应诚实偏低，勿虚高。'
          : '评分提示：保持三维诚实；本格叙事须与所属基因一致。'
      : slot <= 2
        ? 'Scoring: feasibility must reflect cheap/fast truth; do not inflate for “minimal” ideas.'
        : slot === 9
          ? 'Scoring: innovation may be high; if deliberately wild, keep feasibility honestly lower.'
          : 'Scoring: stay honest on all dimensions; scores must match this slot’s gene.'

  if (lang === 'zh') {
    return `
## 槽位考古学（Slot Archetypes）— 强制基因突变
全池九格领土一览（其它格已占位，禁止向其它基因漂移或语义撞车）：
${poolLines.map((l) => `- ${l}`).join('\n')}

**本格 Slot ${slot} 强制基因（最高优先级，须贯穿 title 与六行正文）：**
${mandate}

**与叙事滤镜、团队 lens：** 上文「本格叙事滤镜」与本段 Archetype 为硬约束；下方「本格子负责的产品视角」仅为团队粗粒度分组语气。你必须 **先满足叙事滤镜 + Archetype**，再兼容团队 lens。禁止写成与其它格可互换的泛化 PRD；title/定位/功能须让人一眼看出属于本格基因。

**反同质化：** 禁止与同基因另一格（如 1vs2、3vs4）共用同一产品主张或仅换同义词；禁止与其它基因格在「核心解法叙事」上雷同。

${scoringHint}
`
  }

  return `
## Slot Archeology (Slot Archetypes) — forced divergence
Full pool map (other slots already claim these territories—do not drift or collide):
${poolLines.map((l) => `- ${l}`).join('\n')}

**This slot ${slot} — mandatory gene (highest priority; must run through title and all six lines):**
${mandate}

**vs narrative lens & team lens:** The mandatory narrative lens above plus this Archetype are hard constraints; the “product lens” line below is only a coarse team label. **Satisfy narrative lens + Archetype first**, then align with the team lens. No interchangeable generic PRD; Positioning/Features must visibly belong to this gene.

**Anti-homogeneity:** No duplicate thesis with the paired slot in the same band (e.g. 1 vs 2, 3 vs 4); no narrative collision across genes.

${scoringHint}
`
}

/** 批量种子 prompt 用：与单格逻辑一致的矩阵正文（中英由关键词决定） */
export function buildSeedArchetypeMatrixForBatchPrompt(keyword: string): string {
  const lang = detectSeedPromptLang(keyword)
  if (lang === 'zh') {
    return `
### 策略矩阵约束（Strict Slot Constraints）
九格必须呈现截然不同的演进方向，禁止语义重合；JSON 中 slot 1..9 须严格对应：
- **Slot 1–2** 极简主义/降维：砍掉约 80% 冗余功能，最土、最快、最低成本闭环；两格须不同切口。
- **Slot 3–4** 极致体验/社交货币：可忽略成本，追求尖叫级交互或身份认同；两格须不同体验杠杆。
- **Slot 5–6** 技术原住民：须基于 AI Agent、多模态或特定 API/数据飞轮等构建逻辑护城河；两格须不同技术或场景支点。
- **Slot 7–8** 商业重构：改变行业利益分配（软件变服务、B/C 重构、分账等）；两格须不同重构假设。
- **Slot 9** 黑天鹅/狂想：边缘、非常规但必须启发性强，且与主题弱相关。

每条 ideas[] 的 content 必须让读者能识别其 slot 所属基因；禁止九格共用同一套功能列表换序。`
  }
  return `
### Strict slot constraints (Slot Archetypes)
Slots 1–9 must diverge semantically; each idea’s slot must match:
- **Slots 1–2** Minimalist/dedupe: ~80% feature cut; fastest/cheapest path; two distinct cuts.
- **Slots 3–4** Peak UX / social currency: cost-agnostic delight or identity; two distinct levers.
- **Slots 5–6** Tech-native: moat from agents / multimodal / API or data flywheel; two distinct anchors.
- **Slots 7–8** Business reinvention: who captures value changes; two distinct theses.
- **Slot 9** Black swan: wild yet insightful; weakly tied to theme.

Each idea’s content must be recognizably of its gene; no nine-fold copy-paste feature lists.`
}

export function buildSeedIdeasPrompt(
  keyword: string,
  direction: string,
  lenses?: string[],
  attachmentContext?: string,
  description?: string
): string {
  const lensAssignments = lenses && lenses.length === 3
    ? `\nPRODUCT LENS ASSIGNMENTS — PHASE: DIVERGE (发散) — explore broadly, quantity over perfection:
${lenses.map((lens, i) => {
  const slots = [i * 3 + 1, i * 3 + 2, i * 3 + 3]
  return `- Lens ${i + 1} 「${lens}」→ slots ${slots.join(', ')}: generate 3 distinct ideas firmly rooted in this product angle`
}).join('\n')}

DIVERGE PHASE RULES:
- Each idea must clearly belong to its assigned lens — ideas across different lenses must approach the problem from fundamentally different product angles
- Within the same lens: 3 ideas must explore 3 different sub-approaches (e.g., different mechanisms, user segments, or implementation paths)
- In this diverge phase: be bold and varied. Quantity > polish. Surface as many distinct approaches as possible
- Do NOT let ideas from different lenses overlap conceptually`
    : '\nGenerate ideas from 9 genuinely different product angles. Avoid repetition. Be bold.'

  const contextSection = [
    description ? `Project description: ${description.slice(0, 300)}` : '',
    attachmentContext ? `Reference materials:\n${attachmentContext.slice(0, 1500)}` : '',
  ].filter(Boolean).join('\n\n')

  return `CRITICAL: Begin your response with \`{\` immediately. Do NOT write any preamble, introduction, or description of the task. Execute directly.
OUTPUT: Return ONLY valid JSON. No prose, no explanation, no markdown outside the JSON block.

TASK: Generate exactly 9 distinct, concise product ideas for theme "${keyword}", direction "${direction}".${contextSection ? `\n\nCONTEXT:\n${contextSection}` : ''}

ROUND: Initial Seed — DIVERGE phase (第0轮·发散)
Goal: Cast a wide net across all product dimensions, but **stay tethered to core product value**: each idea should be a concrete feature, flow, or capability (or a direct extension of one), not a tangent.

Core-first rule: Prefer ideas that a user could recognize as "part of this product" — extensions may go deeper on scenarios, segments, or supporting mechanics, but must still clearly serve the keyword's main problem space.

${buildSeedArchetypeMatrixForBatchPrompt(keyword)}
${buildSeedNarrativeMatrixForBatchPrompt(keyword)}

Each idea must:
1. Express ONE core concept in max 40 words
2. Be relevant to both the direction and the keyword, and traceable to core functionality or its natural extension
3. Be genuinely different from all other ideas — **and** match its slot’s Archetype **and** narrative lens from the matrices above (slot field 1..9)
${lensAssignments}

Return ONLY valid JSON:
{
  "ideas": [
    {
      "slot": 1,
      "content": "Concise idea description (max 40 words)",
      "score_innovation": 70,
      "score_feasibility": 75,
      "score_impact": 65
    }
  ]
}

Scoring rules (0-100 each):
- score_innovation: novelty and originality vs existing solutions
- score_feasibility: technical and resource feasibility (40% weight in total)
- score_impact: potential positive effect on users/society (20% weight in total)

Be bold. Each idea should make someone say "I haven't seen this angle before."`
}

/** 迭代阶段：注入首轮简报与项目背景，与种子阶段对齐 */
export function buildIterationAnchorContext(researchBrief?: string, description?: string): string {
  const d = description?.trim()
  const r = researchBrief?.trim()
  if (!d && !r) return ''
  const parts: string[] = []
  if (d) parts.push(`项目背景（创建池时填写，本轮改进须与之一致）：\n${d.slice(0, 450)}`)
  if (r) {
    parts.push(
      `首轮联网检索简报（须呼应「用户痛点」「推荐产品方向」「市场现状」；禁止脱离简报另起一套无关主张）：\n${r.slice(0, 2600)}`
    )
  }
  return `\n\nANCHOR CONTEXT（全格适用）:\n${parts.join('\n\n')}\n`
}
/**
 * 方案报告轮（iteration===2）：注入检索证据，或无证据时的写作纪律。
 */
export function buildFocusRoundEvidencePromptSection(focusRoundEvidence?: string): string {
  const trimmed = focusRoundEvidence?.trim()
  if (trimmed) {
    return `\nFOCUS ROUND EVIDENCE（网页检索合并结果；**参考文献仅可使用下文中已出现的 URL**，禁止编造链接）:
每条结果以 \`- **标题**\` 形式列出 —— **证据名 = 该行加粗标题全文**（正文引用须用「根据 [证据名] …」且与之一致，勿擅自改写标题）。
**禁止**编造未出现在下列列表中的 URL、精确百分比或「某报告」而无对应条目。
${trimmed}
`
  }
  return `
NO_EXTERNAL_EVIDENCE（本轮无检索结果或未配置密钥）：你必须在报告开篇用 1～2 句声明「外部检索链接未提供」或「本轮无联网证据」。
正文仅可基于 ANCHOR CONTEXT、用户描述与合理常识推演。**禁止编造精确数字、市场份额、未经证实的竞品名当作事实**；禁止捏造任何 URL。
「竞品与替代方案」若无检索支撑，只写典型替代形态或行业惯例并标注为**推演**，或明确写「待调研」。
「参考文献与链接」须说明「本轮无外部检索链接」，且不得列出任何虚假 URL。
`
}

/** API iteration===2 方案报告：GFM 白皮书版式 + 生死线 + 红蓝对垒 + 引用（batch / slot / stream 共用） */
const PROPOSAL_REPORT_V2_CONTENT_RULES = `
ROLE — 你是**硅谷顶级产品合伙人**：产出**可扫描、可辩护的商业提案**（GFM 白皮书排版），**不是**长段落草稿、**不是**公关稿。**禁止**空话堆砌；**每一主节**须有**可证伪结论**或**显式「待验证 / 待测算」**。
最忌 **字数通胀**；优先用 **表格、块引用、任务列表** 承载信息，段落只做必要衔接。

强制 Markdown 结构与顺序（须使用 # / ## / ###；英文关键词可同级替换但语义须一致）：
1) # 产品名称：[最终命名] — **工具感**命名，忌泛化品类名。
2) ## 决策仪表盘 (Executive Dashboard) — **紧接标题下第一项正文**：**必须**一张 **GFM 表格**，至少 **5 行数据行**（不含表头）。建议列：| 维度 | 结论摘要 | 依据（证据/假设） |。行须覆盖：**核心差异点**、**首月验证指标与口径**、**成本/资源量级**、**生死线（关停句，可与 [生存 KPI 线] 呼应但表中为一句话摘要）**、**当前最大风险**。无依据的单元格写 **待验证 / 待测算 / 团队假设**；**严禁**无口径的虚假数字。
3) ## Executive Summary — **仅 2～4 句**短总述（决策叙事）；**禁止**重复粘贴仪表盘表中已有数字/指标全文，只可指向性概括。
4) ## [洞察轮审计] — **必须**一张 **Before/After 对比表**：| v1 洞察（Before） | v2 方案（After：推翻/收紧/深化） |，至少 **3 行**实质对比（论断、机制链、边界择要）；**禁止**纯赞美式「延续上一轮」。
5) ## 决策者四问 (Decision Matrix) — 为什么要做 / 为什么是现在 / 为什么是我们 / 风险是什么；每问 **1～2 句可证伪表述**（可用小表或列表，但须清晰四问）。
6) ## [生存 KPI 线] — **至少一条完整生死线句**：时间窗 + 指标名 + 阈值 + **若不满足则关停或 pivot**；示例级严肃度：「若上线后 30 日内活跃留存低于 15%，本项目应立即关停。」无外部证据支撑阈值须标 **团队假设**。
7) ## [反方质疑与回应]（红蓝对垒） — **必须**使用 **GFM 块引用**，**每段质疑或回应单独一块**；首行**必须**用下列前缀之一（便于渲染）：中文：**CFO：** / **我方（商业）：** / **CTO：** / **我方（技术）：**；英文可用 **CFO:** / **Response (Commercial):** / **CTO:** / **Response (Technical):**。CFO 与 CTO **各至少一轮**「质疑块 + 回应块」；对冲须**可执行**，禁止口号。
8) ## 核心机制与架构 (The Core) — **必须**含 **ASCII 数据流或模块图**（fenced code block），标明模块边界与信任边界。
9) ## 12 周执行路线图 (Roadmap) — 用 **### 小标题**按周次分组（如 ### 第 1–2 周）；每组下用 **GFM 任务列表**：- [ ] 具体验证或交付物（可用 - [x] 表示已设定假设或已验证项，勿滥用）。**禁止**「研发-测试-上线」空话。
10) ## 对抗性防御 (Defense) — 大厂（如 Microsoft）下场如何存活；须**可检验**。
11) ## 竞品与替代方案
12) ## 参考文献与链接 — **仅**行首：- [完整标题](https://真实URL) ，**每行一条**；URL **仅**来自 FOCUS 证据块；**禁止**伪造。**禁止**在本节使用任务列表语法（勿写 "- [ ]" / "- [x]"），以免与路线图混淆。

**正文引用 Focus 证据（当存在 FOCUS 块时）**：至少一处：**根据 [证据名] …**，**证据名** 与 FOCUS 列表标题**逐字一致**。
`

const PROPOSAL_REPORT_V2_QUALITY_BAR = `
DEFENSIBLE PROPOSAL BAR（方案报告轮必须满足）:
- **决策仪表盘**：须有 **5 行级** GFM 表；**Executive Summary** 不得重复填表内同一组数字。
- **[洞察轮审计]**：须有 **Before/After 表**（≥3 行对比），非复述洞察轮。
- **[生存 KPI 线]**：须有 **关停/pivot 级**完整条件句。
- **[反方质疑与回应]**：**块引用**格式 + **CFO/CTO 各至少一轮**质疑与回应；前缀符合 CONTENT FORMAT。
- The Core 须有 **ASCII 图**；Roadmap 须以 **任务列表 + 周次 ###** 组织。
- **白皮书版式**：表格、块引用、task list 与参考文献纪律并存；无 FOCUS 时遵守 NO_EXTERNAL_EVIDENCE。
`

/**
 * 洞察轮（iteration 1）：种子六键 → 商业六行 的显式语义映射。
 * 强调从「观感/硬核直觉」剥皮为「商业骨架」，避免 v1 仅同义润色。
 */
const INSIGHT_ROUND_V0_TO_V1_TAG_EVOLUTION = `
STRUCTURED EVOLUTION — Seed v0 → Insight v1（从「视觉观感 / 硬核直觉」到 **可审计的原子机制 + 辩论式进化**）:
若各格当前 content 仍是 Iteration 0 的 **Product Hacker 六键**（核心直觉、痛点现场 [Anchor]、交互感知 [UI]、底层机制 [Logic]、差异化壁垒 [Edge]、专注边界），本轮六行 **必须使用下列信息层级标签（中文须逐字一致，含全角括号）**，并完成下表 **语义升级**，禁止仅在 v0 上换词或缩句。

| v0 种子（观感向） | v1 行（洞察轮专用标签） | 演进目标 |
| 核心直觉 (Essence) | **产品原型断言（Assertion）** | 写成 **可证伪的产品主张**：谁、在什么约束下、承诺何种可观察行为；禁止口号式「我们要做 XX 平台」。 |
| 痛点现场 [Anchor] | **业务摩擦解构（Deconstruction）** | 从现象下沉为 **流程/权责/数据 handoff/合规** 等摩擦点；写清 **触发链与代价**，可量化则量化。 |
| 交互感知 [UI] | **硬核机制链路（Technical Chain）** | **原子化拆解**：必须写 **具体数据/控制流**（例：本地文件特征哈希 → 索引键 → 如何匹配 Skill 路径 → 失败语义落点），至少 **3 个可命名环节**；禁止只罗列界面想象而无链路因果。 |
| 底层机制 [Logic] | **进化审计报告（Evolution Audit）** | 见 INSIGHT LEAP：**辩论式审计**，非总结文。 |
| 差异化壁垒 [Edge] | 指标 | 落成 **约上线后 3 个月内可核对** 的指标或里程碑（忌空洞「提效」无口径）。 |
| 专注边界 (Focus) | 风险 | **主风险 + 具体对冲/预案**（含承认真实短板）；须锚定 **链路环节** 而非泛泛「竞争多」。 |

English-keyword pools: use **exactly** these labels (ASCII, then colon + space): \`Product Assertion:\` / \`Business Friction Deconstruction:\` / \`Technical Chain:\` / \`Evolution Audit:\` / \`Metric:\` / \`Risk:\` — same semantic duties as the Chinese row above.
`

/** 洞察轮：从种子到「专业洞察方案」的 Leap — 禁数量充数、原子链路、辩论式审计 */
const INSIGHT_LEAP_V0_TO_V1_HARD_RULES = `
INSIGHT LEAP — Iteration 0 → 1（种子 → 专业洞察方案）:

STRATEGY（必须执行）:
0) **禁止数量级扩写充数**：不得以「支持更多工具/插件」「集成更多平台」「覆盖更多场景」「一站式」「大幅提升效率/体验」「更全面/更智能」等 **多即是好** 的话术替代机制深度。每多写一条能力，必须说清其在 **Technical Chain / 硬核机制链路** 中的 **位置、输入输出与必要因果**；否则删除该句。
1) **拒绝平庸扩写**：禁止把 v0 短句仅改写成更长同义句；读完后须是「在种子上做了可审计的推演」，不是「又一版摘要」。
2) **硬核机制链路（Technical Chain）硬性要求**：必须出现 **至少一条可跟随的数据或控制流路径**（例如：如何通过 **本地文件特征哈希** 匹配 **Skill 路径**、状态在何处持久化、失败重试边界）；**禁止**用功能清单代替链路；**禁止**「接入 XX 即可」而无中间表示与握手步骤。
3) **进化审计报告（Evolution Audit）硬性要求** — **禁止写成 v1 成就总结或摘要**：
   - 必须以 **辩论 / 红色战队** 姿态：先写 **v0 的两个潜在死穴**（各 1～3 句；须是 **可被挑战的硬伤** — 逻辑断裂、不可实现、证据链缺失、与竞品无差异、数据流单点等，**禁止**泛泛「不够细」「可再优化」）。
   - 对 **每一个死穴**，必须写明 **v1 如何通过改变底层逻辑**（数据流、状态机、信任边界、失败语义、索引/匹配策略等 **至少点明一类**）来修复；**禁止**仅写「加强了、更完善、更具体」而无 **机制层面** 的变化叙述。
   - 仍须含 **Evidence 锚定**：\`基于 Evidence ID [P# 或 E#]\`（须与 ANCHOR/种子已出现编号一致；无编号则逐句引用并注明出处）+ 在 **具名现有方案/范式** 中 **无法闭环** 的 **逻辑盲区**；**禁止编造**编号。
4) **竞争对抗**：针对 **至少 1～2 款** 相关主流工具或范式（Raycast、Dify、Alfred、Coze、低代码/自动化等）做 **差异化论证**；论证须落在 **链路或审计中已写清的机制**，忌口号。

CONTENT 底线:
- **产品原型断言（Assertion）**：须 **具体到职能岗位或使用频次/强度**；禁止「广大用户」「泛人群」。
- **风险**：**禁止**仅写「竞争风险」「对手多」。须写 **具体链路/机制环节** 的风险 + **可操作的缓解**（技术或流程级）。

English output: same rigor — Evolution Audit = two v0 fatal flaws + per-flaw v1 underlying-logic fix + P#/E# or ANCHOR; Technical Chain = named data/control steps; ban quantity-only padding.
`

export function buildIterationPrompt(
  keyword: string,
  direction: string,
  iteration: number,
  ideas: Array<{
    slot: number
    content: string
    total_score: number
    score_innovation: number
    score_feasibility: number
    score_impact: number
  }>,
  userFeedbacks?: Record<number, string>,
  lenses?: string[],
  researchBrief?: string,
  description?: string,
  focusRoundEvidence?: string
): string {
  const sorted = [...ideas].sort((a, b) => b.total_score - a.total_score)
  const n = ideas.length

  // Round 1 分层：top 33% / mid 33% / bot 33%
  const top33Cutoff = Math.ceil(n * 0.33)
  const bot33Cutoff = Math.ceil(n * 0.67)

  // Round 2 分层：top 55% / bot 45%
  const top55Cutoff = Math.ceil(n * 0.55)

  let strategyNote: string
  if (iteration === 1) {
    // 第1轮：种子后的首轮迭代（产品 UI 常称「第二轮」）— 基于种子向下展开，禁止换皮复述
    strategyNote = `ROUND 1 — INSIGHT PHASE (第1轮·洞察 / 相对种子的深化轮)
Goal: **在保留同一 lens 与同一产品主张的前提下**，完成 **可审计的结构分化**：v0 偏「观感与硬核直觉」，v1 必须使用 **产品原型断言 / 业务摩擦解构 / 硬核机制链路 / 进化审计报告**（+ 指标 / 风险）六行标签，把种子每一键按「标签演化表」升级为 **原子链路 + 辩论式审计**，**禁止**与种子仅换同义词或缩句。
- **自我修正（写六行前必做）**：自问——v0 哪两环最像 **死穴**？哪段 **数据流** 在种子里最含糊？**严禁**把 v0 的 mechanism 改写到 **硬核机制链路** 里当同义复述；链路须是 **可逐步执行** 的因果链，不是功能名堆叠。
- **进化审计报告行**：**禁止总结体**；必须 **两个 v0 死穴 + 各附 v1 底层逻辑修复**（详见 INSIGHT LEAP），并保留 Evidence/ANCHOR 锚定与竞品盲区，不得用「更完善」敷衍。
- **反同质化（全格）**：九格禁止共用同一段套话；若与其它 slot 在 **断言/链路** 上雷同，须改写为该格独有子角度。可对照下方各 slot 的 content 自查。
- **论证纪律**：若与首轮联网检索简报（ANCHOR）冲突，须在 **进化审计报告** 或链路中说明取舍，不得无视简报静默自洽。
- **逐格展开**：对应当前 content 的 **断言/摩擦/链路** 各点，分别写出 **可落地的下一跳设计取舍**（写在链路或审计中），并说明理由；**禁止**用「支持更多工具」「提升更多效率」充数。
- Slots in TOP 33% (${sorted.slice(0, top33Cutoff).map(i => i.slot).join(', ')}): 在种子骨架上 **大幅加厚** — 补 **链路环节、失败语义、边界条件、成功判据**，而非只加一句花絮。
- Slots in MIDDLE 33% (${sorted.slice(top33Cutoff, bot33Cutoff).map(i => i.slot).join(', ')}): 针对创新/可行/影响中最弱的一维做 **结构性补强**，写进 **进化审计报告/指标** 且可核验。
- Slots in BOTTOM 33% (${sorted.slice(bot33Cutoff).map(i => i.slot).join(', ')}): ROOT CAUSE REWRITE — 在 ai_changes 写明根因；在同 lens 内重做，新版须含 **合格链路 + 双死穴审计**，不得比种子更空。
- **Insight Leap**：禁数量充数、须 **双死穴辩论式审计**、须 **命名数据流**、须与 Raycast/Dify/Alfred 等 **机制级正面对比**（详见 INSIGHT LEAP）。
- **本轮六行不限字数**（见下方 CONTENT FORMAT）；以写透为准，勿为短而删论证。
Insight principle: 读者应感觉「v0 被真正挑战过、链路走得通」，而不是「又多了一堆形容词和工具列表」。`
  } else if (iteration === 2) {
    // API iteration 2：可辩护方案报告；上一完成轮为 iteration 1（洞察）
    strategyNote = `ROUND 2 — DEFENSIBLE PROPOSAL（方案报告轮；上一完成轮为 **iteration 1 洞察轮**）
Goal: 产出 **可辩护的商业提案**（GFM **白皮书版式**：顶部**决策仪表盘表**、审计 **Before/After 表**、红蓝 **块引用**、路线图 **任务列表**），非长段落草稿、非公关稿。须严格执行 **CONTENT FORMAT** 顺序与深度；**最忌字数通胀**。
- **决策仪表盘** 与 **Executive Summary** 分工：表内放可扫描事实，Summary 仅 2～4 句总述，禁止重复填同一组数字。
- **[洞察轮审计]** 必须用 **对比表** 写清相对洞察轮在**具体逻辑**上的推翻/深化，禁止复述式「小结」。
- **[生存 KPI 线]** 必须含 **关停或 pivot 级**条件句（见 CONTENT FORMAT 示例级严肃度）。
- **[反方质疑与回应]**：**块引用** + **CFO / CTO 各至少一轮**完整质疑与回应；前缀格式见 CONTENT FORMAT。
- **Focus 证据**：若存在 FOCUS 块，正文须至少一处 **「根据 [证据名] …」** 且证据名与列表标题一致；**禁止**编造 URL 与无来源精确数字。
- Slots in TOP 55% (${sorted.slice(0, top55Cutoff).map(i => i.slot).join(', ')}): 强化主命题与论证链，报告须可直接用于评审。
- Slots in BOTTOM 45% (${sorted.slice(top55Cutoff).map(i => i.slot).join(', ')}): 可在同 lens 内调整机制，须在 [洞察轮审计] 中解释相对原路径的转折。
PRINCIPLE: 读者应能据此做 **投/不投、做/不做** 的决策，而非仅「读完觉得不错」。`
  } else {
    // 第3轮：完稿 — 输出视同可递交的「一页纸产品提案」
    strategyNote = `ROUND 3 — FINALIZE PHASE (第3轮·完稿) — DELIVERABLE = **完整、专业、具前瞻性的迷你产品提案**（one-pager 级）
Goal: 每一格读起来像可放进 **IC / 孵化评审 / 高管双周** 的正式材料：克制、可论证、有战略纵深，不是口号堆叠或功能碎碎念。
- ALL slots: DIFFERENTIATION CHECK — 与池内其他创意对比；若与高分格同质化，在**同一 lens** 内收束到独到子角度（差异化表达 ≠ 换到无关品类）。
- 前瞻性：在 依据/功能 中至少一处点明 **12～24 个月** 内可兑现的演进支点（技术、监管、分发、数据、生态择一），忌空喊「AI/元宇宙」而无机制。
- 专业度：删除套话形容词；用「决策者 3 分钟内能判断做不做」为标杆；数字与名词优先于形容词。
- 评分诚实、禁止虚高；九格整体应像 **互补的产品组合**，而非同一主张复印九份。
Finalize principle: 本轮结束后，每格六行合在一起应是一份 **standalone 产品提案** — 单独摘出仍可自洽说服。`
  }

  const feedbackEntries = userFeedbacks ? Object.entries(userFeedbacks) : []
  const feedbackSection = feedbackEntries.length > 0
    ? `\nUSER GUIDANCE (HIGHEST PRIORITY — must be reflected in content and scores for the specified slots):\n${
        // 用 JSON.stringify 序列化反馈内容，防止双引号/反斜杠/换行等字符破坏 prompt 结构
        feedbackEntries.map(([slot, fb]) => `- Slot ${slot}: ${JSON.stringify(fb)}`).join('\n')
      }\nFor slots with user guidance: prioritize addressing the feedback in your improvement. Boost relevant score dimensions accordingly and mention the adoption in ai_changes.\n`
    : ''

  const phaseLabel =
    iteration === 1 ? '洞察 (Insight)' :
    iteration === 2 ? '方案报告 (Proposal)' :
    '完稿 (Finalize)'

  const lensContext = lenses && lenses.length === 3
    ? `\nPRODUCT LENS ASSIGNMENTS — current phase: ${phaseLabel}
Each slot is permanently bound to its product lens. NEVER cross lens boundaries when rewriting.
${lenses.map((lens, i) => {
  const slots = [i * 3 + 1, i * 3 + 2, i * 3 + 3]
  return `- 「${lens}」→ slots ${slots.join(', ')}`
}).join('\n')}
When improving ideas: deepen within the lens (more specific, more concrete, more differentiated) — do NOT drift to another lens's territory.`
    : ''

  const anchorSection = buildIterationAnchorContext(researchBrief, description)
  const continuityBlock =
    iteration === 1
      ? `CONTINUITY / 演进纪律（第1轮）:
- 必须沿当前 content 中的 **产品主张主线**（v0 核心直觉/机制）展开，禁止整格换无关产品；允许子场景、子人群、子机制写细，使相对种子信息增量显著。
- **严禁** v1 把 v0 mechanism **同义改写**进 **硬核机制链路**；链路须为 **原子化数据/控制步骤**，非功能概述。
- **进化审计报告**须含 **两个 v0 潜在死穴** + **各死穴的 v1 底层逻辑修复** + **Evidence [P#/E#] 或 ANCHOR** + **具名方案的无法闭环盲区**；**禁止**总结体与「市场有需求」式空话。
- **硬核机制链路**须支撑 **相对巨头的机制级选型理由**；**禁止**「更多工具/更高效率」式数量充数。
- 风险须为 **具体链路环节 + 技术/流程级缓解**，禁止仅写「竞争风险」。
- 九格拉开差异：同 lens 三格也须子问题分工，避免复制粘贴。
`
      : `CONTINUITY / 演进纪律（方案报告轮）:
- 默认保留洞察轮**核心主张**，除非在 [洞察轮审计] 中明确论证**为何**推翻或收窄。
- **禁止**把洞察轮正文改写成长文复述；[洞察轮审计] 必须是**批判性**对照，再接各主节展开。
- 终稿须能回答：首月验什么、何时关停、CFO/CTO 最大攻击点是什么、大厂下场怎么活。
`

  const round3ProposalBar = iteration === 2 ? PROPOSAL_REPORT_V2_QUALITY_BAR : ''

  const focusEvidenceSection =
    iteration === 2 ? buildFocusRoundEvidencePromptSection(focusRoundEvidence) : ''

  return `CRITICAL: Begin your response with \`{\` immediately. Do NOT write any preamble, introduction, or description of the task. Execute directly.
OUTPUT: Return ONLY valid JSON. No prose, no explanation, no markdown outside the JSON block.

TASK: Optimize the following 9 product ideas for direction "${direction}" about theme "${keyword}".
${anchorSection}${focusEvidenceSection}
Current ideas with scores:
${JSON.stringify(ideas.map(i => ({
  slot: i.slot,
  content: i.content,
  total_score: i.total_score,
  score_innovation: i.score_innovation,
  score_feasibility: i.score_feasibility,
  score_impact: i.score_impact,
})), null, 2)}
${lensContext}
${feedbackSection}
${strategyNote}
${iteration === 1 ? INSIGHT_ROUND_V0_TO_V1_TAG_EVOLUTION : ''}
${iteration === 1 ? INSIGHT_LEAP_V0_TO_V1_HARD_RULES : ''}
${round3ProposalBar}
${continuityBlock}
CONTENT FORMAT RULE (CRITICAL — applies to ALL 9 ideas):
${
  iteration === 2
    ? `For this round (API iteration 2 / 方案报告轮), each content field MUST be a **full Markdown** report following ALL rules below (not a six-line card).
${PROPOSAL_REPORT_V2_CONTENT_RULES}
Hard rules:
- **禁止**单独用「## 上一迭代（洞察轮）小结」替代 [洞察轮审计]；审计节必须**批判性**对照洞察轮正文。
- Markdown：标题、列表、表格、代码块均可；语言与关键词一致。
- 无外部证据时遵守上文 NO_EXTERNAL_EVIDENCE 纪律。
- **参考文献与链接** 中每条必须单独一行：- [标题](url) ，禁止合并成段落；**禁止**在本节使用 "- [ ]" / "- [x]" 任务列表语法。`
    : `Every content field MUST follow this exact **6-line** PM-to-CEO report format（与种子阶段一致，便于对比各轮演化）:`
}
${
  iteration === 1
    ? `**第1轮 — 洞察专用六行（须逐字使用下列中文标签，含全角括号与中文冒号「：」）**：对齐上文「v0→v1 标签演化表」与 **INSIGHT LEAP**；**各行不限字数**，禁止因短删链；**禁止**数量级扩写充数。
产品原型断言（Assertion）：[由 v0「核心直觉」升为 **可证伪主张** — 须含 **具体职能岗位或使用频次/强度**；谁拍板、谁每天用、与方向关系及采用动机；可写多句；禁止泛人群口号]
业务摩擦解构（Deconstruction）：[由 v0「痛点现场」下沉为 **业务摩擦** — 流程/权责/数据 handoff/合规/成本；触发链与后果尽量量化或举例；禁止停留表层形容词]
硬核机制链路（Technical Chain）：[由 v0「交互感知 [UI]」落实为 **原子化链路** — 必须写清 **具体数据/控制流**（例：本地文件特征哈希 → 匹配键 → Skill 路径解析 → 失败落点），**至少 3 个可命名环节**；**禁止**仅列「支持更多工具」或「提升效率」而无因果步骤；须能支撑 **相对 Raycast/Dify/Alfred 等（择相关者）** 的 **机制级** 选型理由]
进化审计报告（Evolution Audit）：[**禁止写 v1 总结**；必须以 **辩论/红色战队** 结构：**(1)** 列出 **v0 的两个潜在死穴**（各 1～3 句，须为硬伤）；**(2)** 对 **每一死穴** 写明 **v1 如何通过改变底层逻辑**（数据流/状态机/信任边界/失败语义/索引策略等）修复；**(3)** 须含 **「基于 Evidence ID [P# 或 E#] …」或逐句引用 ANCHOR/种子** + 在 **[具名现有方案]** 中 **无法闭环** 的 **逻辑盲区**；**严禁**「市场有需求」与空泛「更完善」；与 ANCHOR 冲突须说明取舍]
指标：[由 v0「差异化壁垒」转写为 **约上线后 3 个月内可核对** 的指标或里程碑；须可度量或可对账，忌空洞「提效」无口径]
风险：[**禁止**泛写「竞争风险」；须写 **具体链路/机制环节** 的风险 + **缓解思路（可含技术手段）**；可由 v0「专注边界」延伸为真实短板与预案]`
    : iteration === 2
    ? `本轮输出完整 Markdown 方案报告（六行卡片无效）。章节与深度须完全符合上文 PROPOSAL 规则块。`
    : `定位：[目标用户群 + 产品核心定位；每行不超过100字（含标点）]
痛点：[具体触发场景 + 真实痛苦（尽量量化）；每行不超过100字]
功能：[2～3个核心功能点，动词开头、顿号分隔，须可验收；每行不超过100字]
依据：[相对竞品/常见方案差异或时机，说清价值；每行不超过100字]
指标：[1条可量化或可观察的成功验证指标；每行不超过100字]
风险：[最大单一风险 + 缓解思路；每行不超过100字]`
}
${iteration === 2 ? '\n本 API 轮次为方案报告：勿再使用六行卡片格式，输出完整 Markdown。\n' : ''}
${iteration === 2 ? '' : iteration === 1 ? 'If the current content uses **legacy** labels (定位/痛点/功能/依据), restructure into the **insight-round labels** above (产品原型断言… 等).\nIf keyword is in English, use **exactly**: Product Assertion: / Business Friction Deconstruction: / Technical Chain: / Evolution Audit: / Metric: / Risk: (ASCII labels, colon + space, then body).\n' : 'If the current content already uses this format (including old 3-line legacy), expand missing 依据/指标/风险 and refine all lines per strategy above.\nIf the current content does NOT use this format, restructure into this 6-line format while keeping core concept.\nIf keyword is in English, use: Positioning / Pain / Features / Rationale / Metric / Risk as labels.'}

For EACH idea, return an improved version with:
1. Updated content using the required format above
2. New scores that MUST reflect genuine improvement
3. A brief note about what changed (ai_changes, max 28 words, or null if minimal change)

Return ONLY valid JSON:
{
  "ideas": [
    {
      "slot": 1,
      "content": ${iteration === 2 ? '"# 产品名称：…\\n\\n## 决策仪表盘\\n\\n| 维度 | 结论摘要 | 依据 |\\n| … | … | … |\\n\\n## Executive Summary\\n…\\n\\n## [洞察轮审计]\\n\\n| v1 Before | v2 After |\\n| … | … |\\n\\n## [生存 KPI 线]\\n…\\n\\n## [反方质疑与回应]\\n> **CFO：** …\\n\\n## 核心机制与架构 (The Core)\\n\\n\`\`\`\\nASCII…\\n\`\`\`\\n\\n## 12 周执行路线图\\n### 第 1–2 周\\n- [ ] …\\n\\n## 参考文献与链接\\n- [标题](url)"' : iteration === 1 ? '"产品原型断言（Assertion）：…\\n业务摩擦解构（Deconstruction）：…\\n硬核机制链路（Technical Chain）：…\\n进化审计报告（Evolution Audit）：…\\n指标：…\\n风险：…"' : '"定位：…\\n痛点：…\\n功能：…\\n依据：…\\n指标：…\\n风险：…"'},
      "score_innovation": 80,
      "score_feasibility": 75,
      "score_impact": 70,
      "ai_changes": "Expanded rationale + metric; tightened risk" 
    }
  ]
}

Rules:
- Maintain all 9 slots
- Scores must be integers 0-100
- Each improved idea must genuinely be better or equal to the previous version
- Keep ideas distinct from each other
${iteration === 1 ? '- **Insight round (iteration 1)**: **INSIGHT LEAP** — ban quantity-only padding; **Technical Chain** = named data/control steps (≥3); **Evolution Audit** = **two v0 fatal flaws** + **per-flaw v1 underlying-logic fix** (no summary prose); cite **P#/E#** or ANCHOR + incumbent blind spot; **Risk** = pipeline-specific; **Assertion** = role/frequency.\n' : ''}${iteration === 2 ? '- **Proposal round (iteration 2)**: **GFM white-paper memo** — Executive Dashboard **table** (5+ rows), [洞察轮审计] **Before/After table** (3+ rows), short Executive Summary, [生存 KPI 线], [反方质疑与回应] as **blockquotes** with CFO/CTO/Response prefixes, The Core **ASCII**, 12-week **task lists** under ### week headings; refs section **- [title](url)** only (no task-list syntax in refs); in-body **根据 [证据名]** when FOCUS exists.\n' : ''}
${SCORE_RUBRIC_PROMPT_SNIPPET}
${SCORE_SPREAD_BATCH_SNIPPET}`
}

/** Iteration 0 存库六行行首（与 Strict JSON content 键名对齐，含 [Anchor]/[UI] 等后缀） */
export const SEED_BODY_LINE_PREFIX_ZH = [
  '核心直觉',
  '痛点现场 [Anchor]',
  '交互感知 [UI]',
  '底层机制 [Logic]',
  '差异化壁垒 [Edge]',
  '专注边界',
] as const

export const SEED_BODY_LINE_PREFIX_EN = [
  'Essence',
  'Pain scene [Anchor]',
  'Interaction [UI]',
  'Mechanism [Logic]',
  'Differentiation [Edge]',
  'Focus boundary',
] as const

/** 九格原型矩阵（Iteration 0 每格唯一物种） */
export const SEED_PROTOTYPE_MATRIX_ZH: Record<number, string> = {
  1: '[核心粉碎机] — 针对 Evidence 第一痛点的最快工具',
  2: '[视觉图谱] — Skill 之间逻辑连线与依赖可视化',
  3: '[无感自动化] — 监听系统事件，自动唤起，零操作',
  4: '[极简平替] — 砍掉约 90% 功能，仅保留一个核心交互',
  5: '[AI 编排台] — Agent / 工具链可观测编排与失败重试',
  6: '[多模态管道] — 截图、语音、文件拖入同源触发与统一出口',
  7: '[价值链手术] — 谁付费、谁控数据、交付链与分账重排',
  8: '[协作切口] — 最少同步点：异步交接、权限切片、手松手紧',
  9: '[黑天鹅沙盒] — 弱相关主题的 provocative 边缘切口，仍须可辨识',
}

export const SEED_PROTOTYPE_MATRIX_EN: Record<number, string> = {
  1: '[Core crusher] — Fastest tool for Evidence pain #1',
  2: '[Skill graph] — Dependency edges & logic wiring visualized',
  3: '[Ambient auto] — OS/event hooks, zero-click invoke',
  4: '[Occam replace] — ~90% cut, one core interaction only',
  5: '[AI console] — Observable agent/tool orchestration',
  6: '[Multimodal pipe] — Screenshot/voice/file-in one pipeline',
  7: '[Value surgery] — Who pays, who owns data, chain reshuffle',
  8: '[Collab cut] — Async handoff, permission slices, minimal sync',
  9: '[Black-sandbox] — Edgy yet legible; weakly tied to theme',
}

/** 种子九格前置规划：单次 LLM 产出，再分发给各 slot 执行请求 */
export type SeedGridPlanSlot = {
  slot: number
  /** 本格须落实的差异化指令（2～5 句为宜） */
  execution_brief: string
  /** 可选：锚点简报证据编号或短引 */
  pain_anchor?: string
  /** 可选：明确不可与其它格雷同的叙事/产品主张 */
  anti_overlap?: string
}

export type SeedGridPlan = {
  /** 全池如何在 9 格内切分问题空间（1～3 句） */
  pool_angle: string
  slots: SeedGridPlanSlot[]
}

/**
 * 方向与维度已定后，**一次**生成九格执行规划（纯 JSON），供后续 9 次 slot 调用注入。
 */
export function buildSeedGridPlanPrompt(
  keyword: string,
  direction: string,
  lenses?: string[],
  researchBrief?: string,
  description?: string
): string {
  const lensBlock =
    lenses && lenses.length === 3
      ? lenses
          .map((l, i) => `Lens${i + 1}（格子 ${i * 3 + 1}～${i * 3 + 3}）：「${l}」`)
          .join('\n')
      : '（无三维度文案：仍须按 Slot 1–9 考古学基因切分）'

  const briefExcerpt = researchBrief?.trim()
    ? researchBrief.trim().slice(0, 2600)
    : '（无锚点简报：按关键词与方向推断共识痛点与机会）'

  const descExcerpt = description?.trim() ? description.trim().slice(0, 400) : ''

  const lang = detectSeedPromptLang(keyword)
  if (lang === 'zh') {
    return `CRITICAL: Begin your response with \`{\` immediately. Return ONLY valid JSON, no markdown.

任务：在已有「探索方向」与「三维度 lens」前提下，为九宫格种子轮写 **唯一一份** 前置执行规划。后续会有 9 次独立调用按你写的每一格指令去生成创意；因此你必须 **预先消除语义撞车**，让每格的 execution_brief 在「产品主张、核心机制、目标用户切口」上可区分。

主题关键词：「${keyword}」
探索方向：「${direction}」
三维度分配：
${lensBlock}
${descExcerpt ? `项目背景（节选）：\n${descExcerpt}\n` : ''}
锚点简报（节选）：
${briefExcerpt}

九格须对齐 Iteration 0【原型矩阵】物种分工（规划时不得 9 格同题）：
- Slot 1 核心粉碎机 / 2 视觉图谱 / 3 无感自动化 / 4 极简平替
- Slot 5 AI 编排台 / 6 多模态管道 / 7 价值链手术 / 8 协作切口 / 9 黑天鹅沙盒

输出 JSON 结构（字段名固定）：
{
  "pool_angle": "一句话说明九格如何共同覆盖该方向下的探索面",
  "plans": [
    {
      "slot": 1,
      "execution_brief": "本格必须交付的独特价值与切口；可写清禁止与其它格重复的叙事",
      "pain_anchor": "可选：P1～P5 或简报中的短引",
      "anti_overlap": "可选：明确不要写成什么样（尤其相对相邻 slot）"
    }
  ]
}

要求：
- plans 必须 **恰好 9 条**，slot 为 1～9 各出现一次。
- execution_brief 每条 80～320 字为宜，要具体可执行，禁止空泛「做好产品」。
- 整体语言与关键词一致（中文）。`
  }

  return `CRITICAL: Begin your response with \`{\` immediately. Return ONLY valid JSON, no markdown.

Task: Given direction and three product lenses, produce a **single upfront execution plan** for a 3×3 seed grid. Nine later calls will execute one slot each using your per-slot briefs—**pre-remove collisions** so each execution_brief differs in thesis, mechanism, and segment.

Keyword: "${keyword}"
Direction: "${direction}"
Lens assignments:
${lensBlock}
${descExcerpt ? `Context:\n${descExcerpt}\n` : ''}
Research brief (excerpt):
${briefExcerpt}

Prototype matrix (plan must respect nine species):
- Slots 1–4: core crusher / skill graph / ambient auto / Occam replace
- Slots 5–9: AI console / multimodal pipe / value surgery / collab cut / black sandbox

Return JSON:
{
  "pool_angle": "One line: how the nine slots partition the exploration space",
  "plans": [
    {
      "slot": 1,
      "execution_brief": "What this slot must uniquely deliver; avoid overlap with others",
      "pain_anchor": "optional: P1–P5 or brief quote",
      "anti_overlap": "optional: what not to duplicate vs neighbors"
    }
  ]
}

Rules:
- Exactly 9 objects in plans, slots 1..9 each once.
- execution_brief ~60–220 words each, concrete and actionable.
- Same language as the keyword (English here).`
}

/** 注入单格种子 prompt：本格要点 + 全池鸟瞰（防抄其它格） */
export function buildSeedGridPlanContextSection(
  gridPlan: SeedGridPlan,
  slot: number,
  keyword: string
): string {
  if (slot < 1 || slot > 9) return ''
  const row = gridPlan.slots[slot - 1]
  if (!row || row.slot !== slot) return ''

  const digest = gridPlan.slots
    .map((s) => {
      const one = s.execution_brief.replace(/\s+/g, ' ').trim().slice(0, 130)
      return `- Slot ${s.slot}：${one}${s.execution_brief.length > 130 ? '…' : ''}`
    })
    .join('\n')
    .slice(0, 1900)

  const lang = detectSeedPromptLang(keyword)
  if (lang === 'zh') {
    return `
## 九格总体规划（前置单次规划产出，须严格对齐）
**全池切角：** ${gridPlan.pool_angle}

**本格 Slot ${slot} 执行要点：**
${row.execution_brief}
${row.pain_anchor ? `**证据/痛点锚点：** ${row.pain_anchor}\n` : ''}${row.anti_overlap ? `**与其它格防重叠：** ${row.anti_overlap}\n` : ''}
**全池鸟瞰（只读，禁止复述其它格主张）：**
${digest}
`
  }

  return `
## Nine-slot master plan (from one upfront planning call — follow strictly)
**Pool angle:** ${gridPlan.pool_angle}

**This slot ${slot} — execution brief:**
${row.execution_brief}
${row.pain_anchor ? `**Pain / evidence anchor:** ${row.pain_anchor}\n` : ''}${row.anti_overlap ? `**Anti-overlap:** ${row.anti_overlap}\n` : ''}
**All slots (read-only, do not copy another slot’s thesis):**
${digest}
`
}

/**
 * Iteration 0 统一模板：Product Hacker + 原型矩阵 + Strict JSON（所有 Slot 共用，仅矩阵条目随 slot 变）。
 * @param directEvidenceAnchors 为 true 时强制 [E#] 直连证据溯源（见本分槽直连证据块）
 */
export function buildSeedIterationZeroHackerSpec(
  slot: number,
  keyword: string,
  directEvidenceAnchors = false
): string {
  const lang = detectSeedPromptLang(keyword)
  const matrix = lang === 'zh' ? SEED_PROTOTYPE_MATRIX_ZH : SEED_PROTOTYPE_MATRIX_EN
  const lines = Array.from({ length: 9 }, (_, i) => {
    const n = i + 1
    const tag = n === slot ? (lang === 'zh' ? '**→ 本格**' : '**→ THIS SLOT**') : ' '
    return `- Slot ${n} ${tag}: ${matrix[n]}`
  }).join('\n')

  const anchorZh = directEvidenceAnchors
    ? '- 痛点现场 [Anchor]：**全文第一行**必须以 **[E#]** 开头（# 只能是上方「本分槽直连证据」中列出的 ID，如 [E2]），紧接着用一句话复述该条证据里的 **具体动作或原话**，再写你的解法；禁止泛泛而谈、禁止用 P1～P5 代替 E-ID。'
    : '- 痛点现场 [Anchor]：写清 Evidence ID（如 P1）；用户在 **何种具体操作** 中挫败'
  const anchorEn = directEvidenceAnchors
    ? '- Pain scene [Anchor]: **The entire first line** MUST start with **[E#]** (# must be one of the IDs listed in **Direct evidence for this slot** above, e.g. [E2]), then quote the **concrete action or verbatim pain** from that item, then your fix; no fluff; do not use P1–P5 instead of E-IDs.'
    : '- Pain scene [Anchor]: cite Evidence ID (e.g. P1); **which concrete action** fails'

  const exampleAnchorZh = directEvidenceAnchors
    ? '"[E3] 摘录：「每次导出要手选 12 个字段」—— 用户在手选导出字段时反复遗漏，本工具用 …"'
    : '"P2。用户在 [具体操作] 时 …"'
  const exampleAnchorEn = directEvidenceAnchors
    ? '"[E3] Quote: \\"I have to pick 12 fields manually every export\\" — when users …"'
    : '"P2. When user [action] …"'

  if (lang === 'zh') {
    return `
### ROLE: Product Hacker & Design Engineer
你是一名极致的「产品黑客」。拒绝平庸商业辞令，只关注 **可感知的交互逻辑** 与 **可落地的技术实现**。

### SEED GEN LOGIC (Iteration 0)
你将生成 9 个截然不同的「产品物种」。**本请求为 Slot ${slot}**，必须严格贴合下列【原型矩阵】中 **对应一条**（不得抄其它 Slot 的物种定义）：
${lines}

### CONTENT STRUCTURE (Strict JSON)
\`content\` 必须为对象，**键名逐字一致**（含空格与方括号）：
- \`核心直觉\`：仅「XX工具 / XX插件」式名词短语，零形容词堆叠
${anchorZh}
- \`交互感知 [UI]\`：1～2 个 **物理可想象** 的 UI 细节（半透明侧栏、3D 节点、Dock 常驻图标等）
- \`底层机制 [Logic]\`：数据流向 **触发方式 -> 逻辑处理 -> 输出结果**（各一句）
- \`差异化壁垒 [Edge]\`：相对 Raycast / Dify / Copilot 等 **逻辑盲区** 的补位
- \`专注边界\`：本工具 **明确不做** 什么以保持轻量

### CONSTRAINT
- 正文必须出现 **具体物理交互词**（如：拖拽、连线、浮窗、快捷键、滚轮、双击、吸附）至少 2 处（可分布在 UI 或 Logic 字段）。
- **禁止**虚幻成功指标：不许写「效率提升 50%」「显著降本」等；只许写 **具体动作如何变少/变短**（如：从 7 次点击变为 1 次快捷键）。

### OUTPUT（紧跟在 </thought> 之后，单个 JSON）
字段 \`slot\` 必须为 **${slot}**。须含 \`title\`、\`one_liner\`、\`content\`（上列六键）、\`score_innovation\` / \`score_feasibility\` / \`score_impact\`。
\`one_liner\` 禁止：赋能、协同、一站式、生态、数字化转型 等空话。

示例形状（键名勿改）：
{
  "slot": ${slot},
  "title": "硬核且具辨识度的产品名",
  "one_liner": "一句话杀手锏",
  "content": {
    "核心直觉": "…",
    "痛点现场 [Anchor]": ${exampleAnchorZh},
    "交互感知 [UI]": "…",
    "底层机制 [Logic]": "… -> … -> …",
    "差异化壁垒 [Edge]": "…",
    "专注边界": "不做 …"
  },
  "score_innovation": 70,
  "score_feasibility": 75,
  "score_impact": 65
}
`
  }

  return `
### ROLE: Product Hacker & Design Engineer
You reject corporate fluff. You care about **interaction logic** and **implementable tech**.

### SEED GEN LOGIC (Iteration 0)
Nine distinct **product species**. **This request is Slot ${slot}** — you MUST match exactly **one** row below (never copy another slot’s species):
${lines}

### CONTENT STRUCTURE (Strict JSON)
\`content\` object; **keys exactly** (spaces/brackets matter):
- \`Essence\`: only "X tool" / "X plugin", no adjective pile
${anchorEn}
- \`Interaction [UI]\`: 1–2 **physical** UI details (frosted sidebar, 3D nodes, dock icon, etc.)
- \`Mechanism [Logic]\`: flow **Trigger -> Logic -> Output** (one clause each)
- \`Differentiation [Edge]\`: vs Raycast / Dify / Copilot **blind spots**
- \`Focus boundary\`: what this tool **will not do**

### CONSTRAINT
- Use **physical interaction words** at least twice (drag, connect, floating panel, hotkey, scroll, double-click, snap, …).
- **No** fake metrics ("50% faster"). Only **concrete action deltas** (e.g. seven clicks → one hotkey).

### OUTPUT (single JSON after </thought>)
\`slot\` must be **${slot}**. Include \`title\`, \`one_liner\`, \`content\` (six keys above), three scores.
Ban in one_liner: empower, synergy, one-stop, ecosystem, digital transformation, etc.

Shape:
{
  "slot": ${slot},
  "title": "…",
  "one_liner": "…",
  "content": {
    "Essence": "…",
    "Pain scene [Anchor]": ${exampleAnchorEn},
    "Interaction [UI]": "…",
    "Mechanism [Logic]": "… -> … -> …",
    "Differentiation [Edge]": "…",
    "Focus boundary": "We do not …"
  },
  "score_innovation": 70,
  "score_feasibility": 75,
  "score_impact": 65
}
`
}

/** 已生成格子的 UI / Logic 摘要，供后续 Slot 互斥进化注入 */
export type SeedMutexPriorEntry = {
  slot: number
  interactionUi: string
  mechanismLogic: string
}

/**
 * 互斥进化：要求当前格与已生成格在交互逻辑 + 技术路径上显著分化（约 70%+ 语义差异）。
 */
export function buildSeedMutexEvolutionBlock(
  slot: number,
  keyword: string,
  prior: ReadonlyArray<SeedMutexPriorEntry>
): string {
  if (slot <= 1 || prior.length === 0) return ''
  const lang = detectSeedPromptLang(keyword)
  const lines = prior.map((p) => {
    const ui = p.interactionUi.trim() || '（空）'
    const lo = p.mechanismLogic.trim() || '（空）'
    return lang === 'zh'
      ? `- Slot ${p.slot}｜交互 [UI]：${ui}｜机制 [Logic]：${lo}`
      : `- Slot ${p.slot} | Interaction [UI]: ${ui} | Mechanism [Logic]: ${lo}`
  })

  if (lang === 'zh') {
    return `
## 互斥进化（已生成格子摘要 — 只读）
以下为 **Slot 1～${slot - 1}** 已落定的 **交互感知 [UI]** 与 **底层机制 [Logic]** 压缩摘要；**禁止**复述、换皮或仅微调措辞冒充差异。

**硬性规则（高于「写得顺」的惯性）：**
- 当前 **Slot ${slot}** 在 **交互逻辑**（操作链、界面形态、反馈时机）与 **技术路径**（数据/模型/API、自动化编排、触发→处理→输出骨架）上，须与 **每一条** 下列摘要保持 **至少约 70% 的语义差异**（同义词替换不算）。
- 在 <thought> 中先 **自查**：若与任一已生成格 **主用户旅程同构** 或 **技术骨架雷同**，则判定 **基因冲突**，必须执行 **基因突变** —— 改选不同人群/场景切口、不同交互杠杆、或不同技术锚点，直至满足互斥，再输出 JSON。

${lines.join('\n')}
`
  }

  return `
## Mutex evolution (prior slots — read-only)
Compressed **Interaction [UI]** and **Mechanism [Logic]** for **Slots 1–${slot - 1}**. **Do not** paraphrase or lightly tweak to fake divergence.

**Hard rules:**
- **Slot ${slot}** must differ from **each** row below by **~70%+ semantic distance** in **interaction logic** (action chain, UI shape, feedback timing) **and** **technical path** (data/model/API, orchestration, trigger→process→output skeleton). Synonym swaps do not count.
- In <thought>, **self-check**: if any prior slot shares the **same core journey** or **same technical skeleton**, that is a **gene conflict** — perform a **gene mutation** (different segment, different interaction lever, or different tech anchor) until mutex is satisfied, then emit JSON.

${lines.join('\n')}
`
}

/**
 * 单 slot 种子创意 prompt（单模型与多模型共用）。
 * 每个 slot 由独立调用负责，生成 1 个带标题的创意。
 */
export function buildSeedIdeaForSlotPrompt(
  slot: number,
  keyword: string,
  direction: string,
  lens?: string,
  allLenses?: string[],
  attachmentContext?: string,
  description?: string,
  researchBrief?: string,
  /** 前置「一次规划」结果；缺省时退化为原 9 次独立脑暴 */
  gridPlan?: SeedGridPlan | null,
  /** Slot 1..slot-1 的 UI/Logic 摘要；有则注入互斥进化段 */
  priorMutexSummaries?: ReadonlyArray<SeedMutexPriorEntry>,
  /** 本分槽直连原始证据（证据直通车）；有则强制 [E#] 锚点 */
  directEvidenceBlock?: string
): string {
  const lensLabel = lens ?? direction
  const hasDirect = Boolean(directEvidenceBlock?.trim())
  const briefCap = hasDirect ? 2000 : 2800
  const otherLenses =
    allLenses && allLenses.length === 3
      ? `\n其他格子已被分配的视角（你的创意不得与它们重叠）：\n${allLenses.map((l, i) => `- 格子 ${i * 3 + 1}~${i * 3 + 3}：「${l}」`).join('\n')}`
      : ''

  const briefHeadZh = hasDirect
    ? `首轮锚点简报（**辅助上下文**；**痛点锚定与 [E#] 规则以「本分槽直连证据」为最高优先级**；简报内 P1～P5 仅作补充，不可替代 E-ID）：`
    : `首轮锚点简报（含社区/检索证据摘要与联网补充时，须优先呼应其中 **P1～P5 痛点证据** 及每条下的反向提案；创意须能点名对应某条证据或长尾信号，禁止脱离简报空想）：`
  const briefHeadEn = hasDirect
    ? `Seed brief (**secondary**; **anchoring and [E#] rules follow "Direct evidence for this slot" above**; P1–P5 in the brief are supplemental only):`
    : `Seed brief (when present, tie to **P1–P5** pain lines and counter-proposals; stay evidence-grounded):`

  const contextSection = [
    researchBrief?.trim()
      ? detectSeedPromptLang(keyword) === 'zh'
        ? `${briefHeadZh}\n${researchBrief.trim().slice(0, briefCap)}`
        : `${briefHeadEn}\n${researchBrief.trim().slice(0, briefCap)}`
      : '',
    description ? `项目背景：${description.slice(0, 300)}` : '',
    attachmentContext ? `参考资料：\n${attachmentContext.slice(0, 1500)}` : '',
  ].filter(Boolean).join('\n\n')

  const thoughtPreamble =
    detectSeedPromptLang(keyword) === 'zh'
      ? hasDirect
        ? `输出分两步（顺序不可颠倒）：
1) 先输出 <thought>...</thought>：**首句**必须写出你选定的 **[E#]**（须为上方「本分槽直连证据」所列 ID 之一）及该条中的 **具体动作或原话**；再说明如何落实【原型矩阵】Slot ${slot}、互斥与交互 hack。若直连块证据不足，仍须择一最近似的 E# 并在 thought 中声明局限。**禁止使用花括号字符 { 与 }**。
2) </thought> 后单独输出 **一个** JSON 对象（以 { 开头），不要 markdown 代码围栏，JSON 后不要任何文字。
`
        : `输出分两步（顺序不可颠倒）：
1) 先输出 <thought>...</thought>：说明本格如何落实【原型矩阵】Slot ${slot}、证据锚点与交互 hack；**禁止使用花括号字符 { 与 }**。
2) </thought> 后单独输出 **一个** JSON 对象（以 { 开头），不要 markdown 代码围栏，JSON 后不要任何文字。
`
      : hasDirect
        ? `Two steps (order fixed):
1) <thought>...</thought>: **First sentence** MUST state your chosen **[E#]** (must appear in **Direct evidence for this slot** above) and the **concrete action or verbatim quote** from that row; then prototype matrix ${slot}, mutex, interaction hack. If the block is thin, pick the closest E# and state the gap in thought. **No curly braces**.
2) After </thought>, output **one** JSON object starting with {, no markdown fence, no trailing prose.
`
        : `Two steps (order fixed):
1) <thought>...</thought>: how this slot fulfills the prototype matrix row ${slot}, evidence, interaction hack; **no curly braces**.
2) After </thought>, output **one** JSON object starting with {, no markdown fence, no trailing prose.
`

  const contextBlock = `主题关键词：「${keyword}」
探索方向：「${direction}」
团队维度（每 3 格一组，须兼容但不得压过上方【原型矩阵】本条）：「${lensLabel}」${otherLenses}${contextSection ? `\n\n背景信息：\n${contextSection}` : ''}`

  const scoreBlock = `评分规则（各项 0~100）：
- score_innovation：相比现有方案的新颖程度（权重 40%）
- score_feasibility：技术与资源层面的可实施性（权重 40%）
- score_impact：对目标用户的正向影响潜力（权重 20%）
诚实打分，避免虚高。
${SCORE_RUBRIC_PROMPT_SNIPPET}`

  const gridSection =
    gridPlan && gridPlan.slots.length === 9
      ? buildSeedGridPlanContextSection(gridPlan, slot, keyword)
      : ''

  const mutexSection = buildSeedMutexEvolutionBlock(slot, keyword, priorMutexSummaries ?? [])

  const directSection = hasDirect ? `\n${directEvidenceBlock!.trim()}\n` : ''

  return `${thoughtPreamble}
${gridSection}${mutexSection}${directSection}${buildSeedIterationZeroHackerSpec(slot, keyword, hasDirect)}
${contextBlock}

${scoreBlock}`
}

/**
 * 多模型模式下的单 slot 迭代 prompt。
 * 每个 slot 由独立的 LLM 负责，可查看全池排名上下文，但只改进自己负责的 slot。
 */
export function buildIterationForSlotPrompt(
  slot: number,
  keyword: string,
  direction: string,
  iteration: number,
  allIdeas: Array<{
    slot: number
    content: string
    total_score: number
    score_innovation: number
    score_feasibility: number
    score_impact: number
  }>,
  userFeedback?: string,
  lens?: string,
  researchBrief?: string,
  description?: string,
  focusRoundEvidence?: string
): string {
  const sorted = [...allIdeas].sort((a, b) => b.total_score - a.total_score)
  const n = allIdeas.length
  const top33Cutoff = Math.ceil(n * 0.33)
  const bot33Cutoff = Math.ceil(n * 0.67)
  const top55Cutoff = Math.ceil(n * 0.55)
  const rank = sorted.findIndex((i) => i.slot === slot) + 1

  let strategyForSlot: string
  if (iteration === 1) {
    if (rank <= top33Cutoff) {
      strategyForSlot = `TOP tier (rank ${rank}/${n}): 在种子骨架上 **大幅加厚** — 补机制、边界、成功判据与论证链；禁止只加一句花絮。六行不限字数，写透为止。`
    } else if (rank > bot33Cutoff) {
      strategyForSlot = `BOTTOM tier (rank ${rank}/${n}): ROOT CAUSE REWRITE — ai_changes 写明根因；同 lens 内重做且须带完整论证链，不得比种子更空。`
    } else {
      strategyForSlot = `MIDDLE tier (rank ${rank}/${n}): 针对创新/可行/影响最弱一维做 **结构性补强**（新证据、场景或约束），写进 **进化审计报告/指标** 且可核验。`
    }
  } else if (iteration === 2) {
    if (rank <= top55Cutoff) {
      strategyForSlot = `TOP tier (rank ${rank}/${n}): GFM **白皮书**方案报告。严格执行 CONTENT FORMAT：**决策仪表盘表**、**[洞察轮审计] Before/After 表**、短 Executive Summary、[生存 KPI 线]、CFO/CTO **块引用对垒**、The Core **ASCII**、12 周 **任务列表**、Defense；FOCUS 时正文 **根据 [证据名]**。`
    } else {
      strategyForSlot = `BOTTOM tier (rank ${rank}/${n}): 可在 lens 「${lens ?? direction}」内调整机制；须在 [洞察轮审计] 解释转折；全文仍须满足方案报告轮强制章节与引用纪律。`
    }
  } else {
    strategyForSlot = `FINALIZE (rank ${rank}/${n}) — **完整产品提案**定稿: (1) DIFFERENTIATION vs all other slots; if overlap with higher-scoring ideas, pivot to a **unique sub-angle within the same lens** (same job, distinct mechanism). (2) One-pager quality: 定位=strategic thesis + window; 痛点=consequence; 功能=closed-loop capabilities + **hint at 12–24m evolution**; 依据=moat or trend lever (specific); 指标=north-star or gate (measurable); 风险=top risk + **actionable** mitigation. (3) Exec-ready prose: no slogan stack, no generic adjectives. Adjust scores honestly.`
  }

  const phaseLabel =
    iteration === 1 ? 'INSIGHT (洞察)' :
    iteration === 2 ? 'PROPOSAL (方案报告)' :
    'FINALIZE (完稿)'

  const feedbackSection = userFeedback
    ? `\nUSER GUIDANCE (HIGHEST PRIORITY — must be reflected in content and scores):\n${JSON.stringify(userFeedback)}\n`
    : ''

  const currentIdea = allIdeas.find((i) => i.slot === slot)!

  const anchorSection = buildIterationAnchorContext(researchBrief, description)
  const continuityBlock =
    iteration === 1
      ? `CONTINUITY / 演进纪律（第1轮）: 沿当前 content 产品主张主线展开，禁止无关换题。**进化审计报告**须 **双死穴 + 各附底层逻辑修复** + Evidence [P#/E#] 或 ANCHOR + 具名方案盲区；禁止总结体与「市场有需求」。**硬核机制链路**须 **命名数据/控制流**，禁止「更多工具/更高效率」充数。风险须 **具体机制环节 + 技术/流程缓解**。对照 FULL POOL，禁止套话复读。\n`
      : `CONTINUITY（方案报告）: 默认保留洞察轮核心主张，除非 [洞察轮审计] 论证推翻。[洞察轮审计] 须**批判性**对照本格洞察正文，禁止复述扩写。终稿须含生存关停句与 CFO/CTO 对垒。\n`
  const insightRoundNote =
    iteration === 1
      ? `洞察轮（相对种子）: **六行不限字数**；必须使用 **产品原型断言 / 业务摩擦解构 / 硬核机制链路 / 进化审计报告** 标签（见下方 CONTENT FORMAT），明显厚于 v0。对照 FULL POOL preview，避免雷同。

SELF-CORRECTION / 逻辑审计（进入六行前必做）:
- 自问：v0 **哪两个点最像死穴**？哪段 **数据流** 最含糊？
- **严禁**把 v0 mechanism **同义改写**进 **硬核机制链路**；链路须为原子步骤，非功能概述。
- **进化审计报告（Evolution Audit）**：**禁止总结**；须 **两个 v0 死穴 + 各附 v1 底层逻辑修复** + **Evidence [P#/E#] 或 ANCHOR** + **竞品/范式盲区**（详见 INSIGHT LEAP）。
`
      : ''
  const focusRoundNote =
    iteration === 2
      ? `方案报告轮：须为 **GFM 白皮书版式**（**决策仪表盘表**、审计 **对比表**、红蓝 **块引用**、路线图 **- [ ] 任务项**；参考文献节**禁止**使用任务列表语法）。若有 FOCUS，正文至少一处 **根据 [证据名]**；参考文献仅 - [标题](url)。无证据遵守 NO_EXTERNAL_EVIDENCE。\n`
      : ''
  const finalizeRoundNote =
    iteration === 3
      ? `完稿轮：本格须自成 **一页纸级产品提案** — 专业、前瞻、可评审；六行合起来回答「为何此刻、为何我们、为何能赢」。差异化仅允许在同 lens 内换子角度，禁止换无关品类。\n`
      : ''

  const slotFocusEvidenceSection =
    iteration === 2 ? buildFocusRoundEvidencePromptSection(focusRoundEvidence) : ''

  return `CRITICAL: Begin your response with \`{\` immediately. Do NOT write any preamble, introduction, or description of the task. Execute directly.
OUTPUT: Return ONLY valid JSON. No prose, no explanation, no markdown outside the JSON block.

TASK: Improve slot ${slot} for direction "${direction}" about theme "${keyword}".
Round ${iteration} — ${phaseLabel} phase — MULTI-MODEL MODE
${anchorSection}${slotFocusEvidenceSection}
Responsible for improving ONLY slot ${slot} (lens: 「${lens ?? direction}」).
Each slot is handled by a different AI model; only return improvements for your slot.

FULL POOL CONTEXT — all ideas ranked by score (for strategy reference):
${JSON.stringify(
    sorted.map((i) => ({
      slot: i.slot,
      rank: sorted.indexOf(i) + 1,
      score: i.total_score,
      preview: (() => {
        const c = i.content ?? ''
        const limit = iteration === 1 ? 140 : iteration === 2 ? 220 : 50
        return c.slice(0, limit) + (c.length > limit ? '…' : '')
      })(),
    })),
    null,
    2
  )}

YOUR TARGET — slot ${slot}:
${JSON.stringify(currentIdea, null, 2)}

STRATEGY: ${strategyForSlot}
${insightRoundNote}${iteration === 1 ? INSIGHT_ROUND_V0_TO_V1_TAG_EVOLUTION : ''}${iteration === 1 ? INSIGHT_LEAP_V0_TO_V1_HARD_RULES : ''}${focusRoundNote}${finalizeRoundNote}${feedbackSection}
${continuityBlock}

CONTENT FORMAT RULE (CRITICAL):
${iteration === 2
  ? `The content field MUST be full Markdown per ALL rules below (defensible proposal, not a summary).
${PROPOSAL_REPORT_V2_CONTENT_RULES}
`
  : `The content field MUST use the following **6-line** structured format (PM reporting to CEO style):`}
${
  iteration === 1
    ? `**第1轮 — 洞察专用六行（须逐字使用下列中文标签，含全角括号与中文冒号「：」）**：对齐上文「v0→v1 标签演化表」与 **INSIGHT LEAP**；**各行不限字数**，禁止因短删链；**禁止**数量级扩写充数。
产品原型断言（Assertion）：[由 v0「核心直觉」升为 **可证伪主张** — 须含 **具体职能岗位或使用频次/强度**；谁拍板、谁每天用、与方向关系及采用动机；可写多句；禁止泛人群口号]
业务摩擦解构（Deconstruction）：[由 v0「痛点现场」下沉为 **业务摩擦** — 流程/权责/数据 handoff/合规/成本；触发链与后果尽量量化或举例；禁止停留表层形容词]
硬核机制链路（Technical Chain）：[由 v0「交互感知 [UI]」落实为 **原子化链路** — 必须写清 **具体数据/控制流**（例：本地文件特征哈希 → 匹配键 → Skill 路径解析 → 失败落点），**至少 3 个可命名环节**；**禁止**仅列「支持更多工具」或「提升效率」而无因果步骤；须能支撑 **相对 Raycast/Dify/Alfred 等（择相关者）** 的 **机制级** 选型理由]
进化审计报告（Evolution Audit）：[**禁止写 v1 总结**；必须以 **辩论/红色战队** 结构：**(1)** 列出 **v0 的两个潜在死穴**（各 1～3 句，须为硬伤）；**(2)** 对 **每一死穴** 写明 **v1 如何通过改变底层逻辑**（数据流/状态机/信任边界/失败语义/索引策略等）修复；**(3)** 须含 **「基于 Evidence ID [P# 或 E#] …」或逐句引用 ANCHOR/种子** + 在 **[具名现有方案]** 中 **无法闭环** 的 **逻辑盲区**；**严禁**「市场有需求」与空泛「更完善」；与 ANCHOR 冲突须说明取舍]
指标：[由 v0「差异化壁垒」转写为 **约上线后 3 个月内可核对** 的指标或里程碑；须可度量或可对账，忌空洞「提效」无口径]
风险：[**禁止**泛写「竞争风险」；须写 **具体链路/机制环节** 的风险 + **缓解思路（可含技术手段）**；可由 v0「专注边界」延伸为真实短板与预案]`
    : iteration === 2
    ? `（方案报告：禁止六行卡片；须与上文 PROPOSAL_REPORT_V2 规则一致。）`
    : `定位：[目标用户群 + 产品核心定位；每行不超过100字（含标点）]
痛点：[具体触发场景 + 真实痛苦（尽量量化）；每行不超过100字]
功能：[2～3个核心功能点，动词开头、顿号分隔，须可验收；每行不超过100字]
依据：[相对竞品/常见方案差异或时机；每行不超过100字]
指标：[1条可量化或可观察的成功验证指标；每行不超过100字]
风险：[最大单一风险 + 缓解思路；每行不超过100字]`
}
${iteration === 2 ? '\n勿将报告压回六行格式。\n' : ''}
${iteration === 2 ? '' : iteration === 1 ? 'If content uses legacy labels (定位/痛点/功能/依据), restructure into insight-round labels (产品原型断言… 等).\nDo NOT add section numbers outside these labeled lines.\nIf keyword is in English, use exactly: Product Assertion: / Business Friction Deconstruction: / Technical Chain: / Evolution Audit: / Metric: / Risk:\n' : 'If the current content already uses this format (including legacy 3-line), add or refine 依据/指标/风险 per strategy above.\nIf the current content does NOT use this format, restructure into this 6-line format while preserving the core concept.\nDo NOT add section numbers or bullet points outside these labeled lines.\nIf keyword is in English, use: Positioning / Pain / Features / Rationale / Metric / Risk as section labels.'}

Return ONLY valid JSON for this single improved idea:
{
  "slot": ${slot},
  "content": ${iteration === 2 ? '"# 产品名称：…\\n\\n## 决策仪表盘\\n\\n| 维度 | 结论摘要 | 依据 |\\n| … | … | … |\\n\\n## Executive Summary\\n…\\n\\n## [洞察轮审计]\\n\\n| v1 Before | v2 After |\\n| … | … |\\n\\n## [生存 KPI 线]\\n…\\n\\n## [反方质疑与回应]\\n> **CFO：** …\\n\\n## 核心机制与架构 (The Core)\\n\\n\`\`\`\\nASCII…\\n\`\`\`\\n\\n## 12 周执行路线图\\n### 第 1–2 周\\n- [ ] …\\n\\n## 参考文献与链接\\n- [标题](url)"' : iteration === 1 ? '"产品原型断言（Assertion）：…\\n业务摩擦解构（Deconstruction）：…\\n硬核机制链路（Technical Chain）：…\\n进化审计报告（Evolution Audit）：…\\n指标：…\\n风险：…"' : '"定位：…\\n痛点：…\\n功能：…\\n依据：…\\n指标：…\\n风险：…"'},
  "score_innovation": 80,
  "score_feasibility": 75,
  "score_impact": 70,
  "ai_changes": "What changed and why (max 28 words, or null)"
}

Rules:
- Stay within lens: 「${lens ?? direction}」
- Scores must genuinely reflect improvement quality
- Respond in the same language as the keyword
${iteration === 1 ? '- **Insight round**: **INSIGHT LEAP** — ban quantity padding; **Technical Chain** ≥3 named steps; **Evolution Audit** = 2 v0 fatal flaws + per-flaw underlying-logic fix (not summary); Evidence [P#/E#] or ANCHOR; Risk = pipeline-specific; Assertion = role/frequency.\n' : ''}${iteration === 2 ? '- **Proposal round**: **GFM white-paper** — Dashboard table + audit Before/After table + blockquote red/blue + roadmap task lists; [生存 KPI 线] shutdown/pivot; The Core ASCII; Defense; refs "- [title](url)" only in 参考文献 (no "- [ ]" there); FOCUS in-body **根据 [证据名]**.\n' : ''}
${SCORE_RUBRIC_PROMPT_SNIPPET}`
}

/**
 * 将「生成探索方向」与「生成产品维度」合并为单次 LLM 调用，减少 1 次 RTT。
 * 返回 { directions: string[], lenses: string[] }，directions[0] 作为主方向。
 */
export function buildPoolDirectionsAndLensesPrompt(keyword: string, description?: string, researchBrief?: string): string {
  const descLine = description ? `\n项目背景：${description.slice(0, 200)}` : ''
  const briefLine = researchBrief?.trim()
    ? `\n\n联网检索简报（生成方向与维度时必须优先对齐「用户痛点」「推荐产品方向」「市场现状」，避免空泛发散）：\n${researchBrief.trim().slice(0, 3500)}`
    : ''
  return `CRITICAL: Begin your response with \`{\` immediately. Do NOT write any preamble, introduction, or description of the task. Execute directly.
OUTPUT: Return ONLY valid JSON. No prose, no explanation, no markdown outside the JSON block.

你是一位经验丰富的产品策略专家。请根据以下主题关键词，完成两项任务并一次性返回结果。

主题关键词：「${keyword}」${descLine}${briefLine}

任务 A：生成恰好 3 个探索方向（directions）
- **必须以主题隐含的核心功能或主用户任务为锚**：三个方向是在同一产品主干上的不同探索轴，而非三个互不相关的话题
- 差异化体现在：核心能力的不同切面或自然延伸（如关键路径、主要人群/场景、配套能力、质量与效率、协作与数据闭环等）；避免空泛的「品牌叙事」「社会影响」等与具体功能无关的角度
- 各方向之间必须有明显差异，不得重叠
- 每条不超过 15 字

任务 B：基于 directions[0]（即你生成的第一个方向），生成恰好 3 个产品维度标签（lenses）
- 3 个维度框架固定：① 产品立项 ② 产品创新 ③ 落地可行性
- 每个维度写一个针对「关键词 + 第一个方向」的具体子角度标签，不超过 8 字
- 标签要具体可行，避免泛泛而谈

返回格式（仅 JSON，严格按此结构）：
{
  "directions": [
    "第一个方向（会作为主方向使用）",
    "第二个方向",
    "第三个方向"
  ],
  "lenses": [
    "产品立项子角度（≤8字）",
    "产品创新子角度（≤8字）",
    "落地可行性子角度（≤8字）"
  ]
}

若主题关键词为英文，directions 和 lenses 均用英文输出。`
}

// ──────────────────────────────────────────────
// 超级AI推荐：两阶段检索 + 分析解耦
//
// Step A（联网）：检索阶段 — 只输出 evidence[]（真实帖子列表）
// Step B（无工具）：分析阶段 — 仅以 evidence[] 为原材料，生成 cards[]
//
// 优势：分析时无法「发明」新 URL，只能从已知证据里引用，大幅降低链接幻觉。
// ──────────────────────────────────────────────

/** Step A：联网检索阶段系统提示 — 只收集证据，不生成方案 */
export function buildSuperRecommendEvidenceSystemPrompt(): string {
  return `你是联网情报收集员。你可使用联网搜索工具，任务只有一件事：**收集真实帖子证据，不做任何产品分析**。

**允许的来源（仅此三类，禁止其它任何站点）**：
1. **Reddit（reddit.com）** — site:reddit.com，多子版块；优先高互动、明确讨论痛点或竞品的帖
2. **X（x.com / twitter.com）** — site:x.com 或 site:twitter.com，线程与吐槽、竞品对比讨论
3. **Facebook（facebook.com）** — site:facebook.com，公开群组/主页帖文 permalink（须为 /posts/ 或 permalink.php?story_fbid= 形式）

**额外检索重点**：至少用 1～2 次查询专门找 **市面讨论度/热度高的 AI 竞品**（如头部大模型、同类 SaaS、垂直 AI 工具）在 Reddit/X/Facebook 上的对比、吐槽、迁移讨论。

**严禁**：小红书、知乎、Hacker News、微博、Discord、贴吧、Medium、Product Hunt、任意纯新闻站或博客软文；**丢弃**明显带货、优惠码、私信引流、空泛标题党帖。

**证据纪律（最高优先级）**：
1. url 只能填 **Reddit / X / Facebook** 三平台之一的真实永久链接，**逐字复制**，禁止编造。无则 ""。
2. title 为检索结果中的**原始标题**，逐字复制。
3. snippet 为摘要原文摘录，≤200 字，不得改写；无则 ""。
4. 与用户主题无关、或明显广告/水帖，直接丢弃；宁可 5 条高质量也不要 12 条凑数。

执行步骤：
Step 1 — 非英文关键词译成英文用于 Reddit/X/Facebook 检索，可保留中文关键词做补充查询。
Step 2 — **仅** site:reddit.com、site:x.com（或 site:twitter.com）、site:facebook.com；含至少一轮「AI 竞品/热度产品」向检索；收集 8-12 条。
Step 3 — 输出证据 JSON，开头直接用 {，禁止解释文字。

输出格式（严格遵守，无其他字段）：
{"evidence":[{"id":"e1","url":"https://www.reddit.com/r/xxx/comments/abc123/...","title":"Original post title verbatim","snippet":"Direct quote from search snippet ≤200 chars","source":"r/xxx","upvotes":1234}]}`
}

/** Step A：联网检索阶段用户提示（可附带服务端已拉取的 Reddit 帖子作为种子） */
export function buildSuperRecommendEvidenceUserPrompt(
  query: string,
  options?: {
    excludePostUrls?: string[]
    /** 服务端已从 reddit search.json 拉取的真实帖子列表，作为检索的「种子/基线」 */
    redditSeeds?: Array<{ permalink: string; title: string; selftext: string; subreddit: string; ups: number }>
    outputLang?: 'zh' | 'en'
  }
): string {
  const exUrl = (options?.excludePostUrls ?? []).filter(Boolean).slice(0, 20)
  const excludeNote = exUrl.length ? `\n\n已用过的链接（禁止重复）：${exUrl.join(' ')}` : ''
  const enNext =
    options?.outputLang === 'en'
      ? '\n\nNote: The next analysis step will write opportunity cards in English. Keep evidence title/snippet fields verbatim from search results (they may be Chinese or English).'
      : ''

  if (options?.redditSeeds && options.redditSeeds.length > 0) {
    // 有服务端种子：要求模型优先以这些真实帖子为证据，并可补充联网检索到的额外条目
    const seedJson = JSON.stringify(
      options.redditSeeds.map((p, i) => ({
        id: `seed_${i + 1}`,
        url: p.permalink,
        title: p.title,
        snippet: p.selftext.slice(0, 200) || '(no selftext)',
        source: p.subreddit,
        upvotes: p.ups,
      })),
      null,
      2
    )
    return `用户关键词：「${query}」${excludeNote}

以下是服务端从 Reddit 直接拉取的真实帖子（permalink 100% 真实，请优先使用）：
${seedJson}

请将上述帖子作为 evidence 的基础（url/title/source/upvotes 字段直接复制），再通过联网检索补充若干条（**仅限 Reddit / X / Facebook**，须真实 permalink），并尽量包含 **AI 竞品/热度工具** 相关讨论；合并后输出 evidence JSON，不要分析或写卡片。${enNext}`
  }

  // 无种子：纯依赖联网
  return `用户关键词：「${query}」${excludeNote}

请翻译/扩展关键词后，**仅**使用 site:reddit.com、site:x.com（或 site:twitter.com）、site:facebook.com 检索；至少一轮查询面向 **同类 AI 产品或高热度竞品** 的讨论；过滤水帖与广告；收集 8-12 条有完整链接的证据，输出 evidence JSON，不要分析或写卡片。${enNext}`
}

/** Step B：分析阶段系统提示 — 仅凭 evidence 生成产品机会卡片，禁止造链 */
export function buildSuperRecommendAnalysisSystemPrompt(outputLang: 'zh' | 'en' = 'zh'): string {
  if (outputLang === 'en') {
    return `You are a senior product manager who turns community discussions into product opportunities. You **do not** have web access; everything must come only from the evidence list the user provides.

**Multi-evidence synthesis (avoid "single-source" weak claims)**:
- Prefer **evidenceIds: ["e1","e2",...]** with **2–4** distinct evidence[].id values per card when several posts reinforce the **same** pain point, competitor narrative, or opportunity. One card = one coherent opportunity theme supported by multiple posts.
- If only one post truly supports a theme, you may use a single id in evidenceIds.
- **Never** invent ids; every id must exist in evidence[].

**Anti-spam / anti-ad**:
- Do **not** build cards from evidence that reads like pure ads, promos, affiliate codes, or empty clickbait. Skip those rows.

**URL discipline**:
- postUrl = **verbatim** copy of evidence[].url for the **primary** item (first id in evidenceIds that has a non-empty url).
- postTitle = verbatim title for that same primary item.
- Do not fabricate URLs.

**Other fields**:
- keyword: ≤40 chars (English), the product opportunity theme
- description: 50–100 words (English), synthesize across the cited evidence titles/snippets; state how posts agree or complement each other
- painPoint: one English sentence grounded in concrete wording from the combined snippets
- source: join distinct evidence[].source values with " · " (max 3 parts)
- upvotes: use the **maximum** upvotes among cited evidence items (integer)
- hotScore: 1–10 from relevance and engagement

Return valid JSON only, starting with {, no other text.
{"cards":[{"evidenceIds":["e1","e2"],"keyword":"...","description":"...","painPoint":"...","source":"...","upvotes":1234,"hotScore":8,"postTitle":"...","postUrl":"https://..."}]}`
  }
  return `你是资深产品经理，擅长从社区讨论中提炼产品机会。你**没有**联网工具，所有信息只能来自用户提供的 evidence 列表。

**多证据归纳（避免孤证）**：
- 优先使用 **evidenceIds: ["e1","e2",...]**，每张卡片在有多条帖子指向**同一**痛点、竞品对比或机会时，应合并 **2～4 条** 不同 evidence[].id；一条卡片 = 一个机会主题 + 多帖互证。
- 若仅有一条帖子真正支撑该主题，evidenceIds 可只含 1 个 id。
- **禁止**编造 id；每个 id 必须在 evidence 列表中存在。

**反水帖/反广告**：
- 明显带货、优惠引流、空洞标题党的 evidence **不要**做成卡片。

**链接纪律**：
- postUrl：填 evidenceIds 顺序中**首个 url 非空**的条目的 url，**逐字复制**。
- postTitle：同上对应条目的 title，逐字复制。

**其它字段**：
- keyword：≤15 字（中文），机会主题
- description：50-100 字（中文），综合所引 evidence 的 title/snippet，说明多帖如何互证或补充
- painPoint：一句话（中文），须能落到 snippet 中的具体表述
- source：将所引 evidence 的 source 用 " · " 连接（最多 3 段）
- upvotes：所引 evidence 中 **最大** upvotes（整数）
- hotScore：1-10

仅返回合法 JSON，开头直接用 {，禁止任何解释文字。
{"cards":[{"evidenceIds":["e1","e2"],"keyword":"...","description":"...","painPoint":"...","source":"...","upvotes":1234,"hotScore":8,"postTitle":"...","postUrl":"https://..."}]}`
}

/** Step B：分析阶段用户提示，将 evidence 嵌入 */
export function buildSuperRecommendAnalysisUserPrompt(
  query: string,
  evidence: Array<{
    id: string
    url: string
    title: string
    snippet: string
    source: string
    upvotes: number
  }>,
  options?: { excludeKeywords?: string[]; outputLang?: 'zh' | 'en' }
): string {
  const exKw = (options?.excludeKeywords ?? []).filter(Boolean).slice(0, 12)
  const excludeNote = exKw.length
    ? `\n已展示过的方案名称（不要雷同）：${exKw.join('；')}`
    : ''
  const enTail =
    options?.outputLang === 'en'
      ? '\n\nWrite every card’s keyword, description, and painPoint in natural English.'
      : ''
  return `用户原始关键词：「${query}」${excludeNote}

以下是从联网检索中获取的真实帖子证据（你只能使用这些证据，不能引入任何新信息）：
${JSON.stringify(evidence, null, 2)}

请基于上述 evidence 输出 **5～8 张**产品机会卡片：优先将**指向同一类痛点或同一竞品叙事**的多条 evidence 合并为一张卡片（evidenceIds 含 2～4 个 id）；过滤水帖/广告向证据；若涉及 AI 工具/竞品，优先利用相关讨论互证。${enTail}`
}

export type SuperRecommendUserOptions = {
  /** 换一批：须避开已展示过的帖子与方案名 */
  excludeKeywords?: string[]
  excludePostUrls?: string[]
  /** true：单次联网降级路径，允许填写真实 postUrl，且仅限 Reddit / X / Facebook */
  webSearchSingleStep?: boolean
  /** 与 UI 语言一致：英文界面时卡片字段须为英文 */
  outputLang?: 'zh' | 'en'
}

// 旧版单阶段 prompt（fallback 专用：无联网时仍可用）
export function buildSuperRecommendSystemPrompt(outputLang: 'zh' | 'en' = 'zh'): string {
  if (outputLang === 'en') {
    return `You are a senior product insights researcher. Without web access, use your knowledge to infer community pain points and product opportunities from the user's keyword.

You cannot browse the web: postUrl and postTitle MUST be empty string "", never invent links or titles.
source: a plausible subreddit or community label (e.g. "r/entrepreneur") for reference only.

Output fields: keyword (English, ≤40 chars), description (50–100 words English), painPoint (one English sentence), source, upvotes (0), hotScore (1–10), postTitle (""), postUrl ("")
Output format (strict):
{"cards":[{"keyword":"...","description":"...","painPoint":"...","source":"...","upvotes":0,"hotScore":7,"postTitle":"","postUrl":""}]}`
  }
  return `你是资深产品洞察研究员，在没有联网工具的情况下，凭借知识储备分析用户关键词，推断可能的社区痛点与产品机会。

重要提示：你无法联网，所以 postUrl 和 postTitle 必须填空字符串 ""，绝对不能编造链接或标题。
source 填写你判断最可能有相关讨论的子版块名（如 "r/entrepreneur"），仅供参考。

输出字段：keyword（≤15字中文）、description（50-100字中文）、painPoint（一句话中文）、source（子版块参考）、upvotes（0）、hotScore（1-10）、postTitle（""）、postUrl（""）
输出格式（严格遵守）：
{"cards":[{"keyword":"...","description":"...","painPoint":"...","source":"...","upvotes":0,"hotScore":7,"postTitle":"","postUrl":""}]}`
}

/** 单次联网降级：可检索，但仅限 Reddit / X / Facebook */
export function buildSuperRecommendWebSearchSystemPrompt(outputLang: 'zh' | 'en' = 'zh'): string {
  if (outputLang === 'en') {
    return `You are a senior product insights researcher with web search. You may **only** retrieve and cite real posts from:
1. Reddit (reddit.com) — site:reddit.com
2. X (x.com / twitter.com) — site:x.com or site:twitter.com
3. Facebook (facebook.com) — site:facebook.com, only post permalinks (/posts/ or permalink.php?story_fbid=)

Include at least one search angle on **hottest / most-discussed AI competitors** related to the user topic when relevant. Skip spam, promos, affiliate posts.

Do not cite Xiaohongshu, Zhihu, Hacker News, Weibo, Discord, generic news sites, or blogs.

postUrl and postTitle must be **verbatim** from search results; use "" if none. Never fabricate URLs.

Output fields: keyword (English, ≤40 chars), description (50–100 words English), painPoint (one English sentence), source, upvotes (non-negative int, 0 if unknown), hotScore (1–10), postTitle, postUrl
Write keyword, description, and painPoint in English even when the source post is in Chinese.

Output format (strict):
{"cards":[{"keyword":"...","description":"...","painPoint":"...","source":"...","upvotes":0,"hotScore":7,"postTitle":"...","postUrl":"..."}]}`
  }
  return `你是资深产品洞察研究员，可使用联网搜索。你**只能**在以下平台检索并引用真实帖子：
1. Reddit（reddit.com）— site:reddit.com
2. X（x.com / twitter.com）
3. Facebook（facebook.com）— 仅帖文 permalink（/posts/ 或 permalink.php?story_fbid=）

至少安排一轮检索聚焦 **市面高讨论度 AI 竞品/同类工具**（与主题相关时）。过滤带货、优惠码、引流软文。

禁止引用小红书、知乎、HN、微博、Discord、纯新闻站、博客等。

postUrl、postTitle 须**逐字复制**自检索结果；无则填 ""。

输出字段：keyword（≤15字）、description（50-100字）、painPoint（一句）、source、upvotes、hotScore（1-10）、postTitle、postUrl
输出格式：
{"cards":[{"keyword":"...","description":"...","painPoint":"...","source":"...","upvotes":0,"hotScore":7,"postTitle":"...","postUrl":"..."}]}`
}

/**
 * 流式迭代专用 prompt（单 slot）。
 * 协议：
 *   第一段 — Markdown 分析（推理、论证、修改说明），供抽屉实时展示；
 *   分隔符 — 单独一行 <<<IDEA_JSON>>>;
 *   第二段 — 紧凑 JSON 对象（与 IterationIdeaResult 一致）。
 * 说明：不带 response_format / jsonMode，完全依赖分隔符截断解析。
 */
export function buildIterationForSlotStreamPrompt(
  slot: number,
  keyword: string,
  direction: string,
  iteration: number,
  allIdeas: Parameters<typeof buildIterationForSlotPrompt>[4],
  userFeedback?: string,
  lens?: string,
  researchBrief?: string,
  description?: string,
  focusRoundEvidence?: string
): string {
  // 复用单 slot JSON prompt 的大部分上下文逻辑，只替换输出格式约定
  const basePrompt = buildIterationForSlotPrompt(
    slot, keyword, direction, iteration, allIdeas,
    userFeedback, lens, researchBrief, description, focusRoundEvidence
  )

  // 替换输出协议：去掉"只返回 JSON"约束，改为两段式
  const jsonBlockIdx = basePrompt.indexOf('\nReturn ONLY valid JSON for this single improved idea:')
  const contextPart = jsonBlockIdx >= 0 ? basePrompt.slice(0, jsonBlockIdx) : basePrompt
  // 去掉 CRITICAL/OUTPUT 首行（流式不需要，让模型自由发挥 Markdown）
  const withoutCritical = contextPart
    .replace(/^CRITICAL: Begin your response with.*\n/, '')
    .replace(/^OUTPUT: Return ONLY valid JSON.*\n/, '')

  return `${withoutCritical.trim()}

OUTPUT PROTOCOL — TWO SECTIONS:

**Section 1 — Analysis** (Markdown, freely written, shown to user in real-time):
${iteration === 2
  ? `Use explicit mini-sections aligned with **final JSON GFM white paper** (Section 2 must match the same structure and GFM elements):
## 一、决策仪表盘（表行草稿）
Draft the **5+ rows** for | 维度 | 结论摘要 | 依据 | (placeholders OK in analysis; JSON must have a real table).

## 二、[洞察轮审计] Before/After 表草稿
At least **3 contrast rows** (v1 insight vs v2 proposal); **not** a praise summary.

## 三、Executive Summary 短述
2–4 sentences only; **do not** duplicate the dashboard numbers.

## 四、生存 KPI 与关停句
Time window + metric + threshold + shutdown/pivot; mark assumptions.

## 五、红蓝块引用草稿
Write sample **blockquotes** with prefixes **CFO:** / **我方（商业）：** / **CTO:** / **我方（技术）：** (or English equivalents) — one full CFO round + one full CTO round.

## 六、The Core — ASCII 草图
ASCII for the fenced code block in JSON.

## 七、12 周 task list 草稿
### Week chunk headings + **- [ ]** / **- [x]** items (no filler 研发-测试-上线).

## 八、Focus 引用计划（若有 FOCUS）
Which **证据名** for **根据 [证据名] …** (exact title).

Write enough detail in real time; Section 2 JSON must implement the full outline including tables, blockquotes, and task lists.`
  : `**Section 1 — Debate audit + Technical Chain preview**: (1) Name **two plausible fatal flaws** in v0 (concretely attackable, not "needs more detail"). (2) For **each** flaw, state how v1 **changes underlying logic** (data flow, state machine, trust boundary, failure semantics…). (3) Sketch **≥3 named steps** of the data/control chain that will appear in JSON **Technical Chain**. (4) **Incumbent confrontation**: why users pick us vs Raycast/Dify/Alfred-class on **mechanism**, not slogans. (5) **Evidence anchor**: P#/E# or ANCHOR (no fake IDs). 6–14 sentences; analysis must match JSON **Evolution Audit** + **Technical Chain** lines.`}

**Section 2 — Structured Result** (machine-parseable):
After your analysis, output exactly this separator on its own line:
<<<IDEA_JSON>>>
Then immediately output a compact JSON object (no extra text after it):
${iteration === 2
  ? `{"slot":${slot},"content":"# 产品名称：…\\n\\n## 决策仪表盘\\n\\n| 维度 | 结论摘要 | 依据 |\\n| … | … | … |\\n\\n## Executive Summary\\n…\\n\\n## [洞察轮审计]\\n\\n| v1 Before | v2 After |\\n| … | … |\\n\\n## [生存 KPI 线]\\n…\\n\\n## [反方质疑与回应]\\n> **CFO：** …\\n\\n> **我方（商业）：** …\\n\\n> **CTO：** …\\n\\n> **我方（技术）：** …\\n\\n## 核心机制与架构 (The Core)\\n\\n\`\`\`\\nASCII…\\n\`\`\`\\n\\n## 12 周执行路线图\\n### 第 1–2 周\\n- [ ] …\\n\\n## 对抗性防御\\n…\\n\\n## 竞品与替代方案\\n…\\n\\n## 参考文献与链接\\n- [title](https://…)","score_innovation":80,"score_feasibility":75,"score_impact":70,"ai_changes":"GFM tables + blockquotes + task list + refs"}`
  : iteration === 1
    ? `{"slot":${slot},"content":"产品原型断言（Assertion）：…\\n业务摩擦解构（Deconstruction）：…\\n硬核机制链路（Technical Chain）：…\\n进化审计报告（Evolution Audit）：…\\n指标：…\\n风险：…","score_innovation":80,"score_feasibility":75,"score_impact":70,"ai_changes":"brief note or null"}`
    : `{"slot":${slot},"content":"定位：…\\n痛点：…\\n功能：…\\n依据：…\\n指标：…\\n风险：…","score_innovation":80,"score_feasibility":75,"score_impact":70,"ai_changes":"brief note or null"}`}

Rules:
- Stay within lens: 「${lens ?? direction}」
- ${iteration === 2 ? 'content must be a complete Markdown report per CONTENT FORMAT RULE above' : 'content must use the 6-line format per CONTENT FORMAT RULE above'}
- Scores must reflect genuine improvement quality
- Respond in the same language as the keyword
- The separator <<<IDEA_JSON>>> must appear exactly once, alone on its own line`
}

export function buildSuperRecommendUserPrompt(query: string, options?: SuperRecommendUserOptions): string {
  const exKw = (options?.excludeKeywords ?? []).filter(Boolean).slice(0, 12)
  const exUrl = (options?.excludePostUrls ?? []).filter(Boolean).slice(0, 12)
  const web = options?.webSearchSingleStep === true
  const en = options?.outputLang === 'en'
  let prompt = web
    ? en
      ? `User keyword: "${query}"\n\nSearch **only** Reddit, X (Twitter), and Facebook for discussions directly related to this topic; include angles on **hot AI competitors** when relevant. Output 5–8 cards; postUrl verbatim or "". Skip spam/ads. Write keyword, description, and painPoint in English.`
      : `用户关键词：「${query}」\n\n请**仅在 Reddit、X（Twitter）、Facebook** 检索；包含 **高热度 AI 竞品** 相关角度（若与主题相关）。输出 5-8 张卡片，postUrl 须为真实链接逐字复制或空串；跳过水帖与广告。`
    : en
      ? `User keyword: "${query}"\n\nInfer related product opportunities; return 5–8 cards (postUrl/postTitle empty string). Write keyword, description, and painPoint in English.`
      : `用户关键词：「${query}」\n\n请推断与该主题相关的产品机会，返回 5-8 张卡片（postUrl/postTitle 填空字符串）。`
  if (exKw.length) prompt += en ? `\nAlready shown names (do not repeat): ${exKw.join('; ')}` : `\n已展示过的方案名（勿再雷同）：${exKw.join('；')}`
  if (exUrl.length)
    prompt += web
      ? en
        ? `\nDo not repeat these URLs: ${exUrl.join(' ')}`
        : `\n已用过的链接（不要重复）：${exUrl.join(' ')}`
      : en
        ? `\nPreviously used links (ignore for this no-link run): ${exUrl.join(' ')}`
        : `\n已用链接（可忽略，本次不提供链接）：${exUrl.join(' ')}`
  return prompt
}
