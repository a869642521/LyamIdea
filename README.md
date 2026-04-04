# IdeaBazaar 创意集市

> 一个面向产品探索场景的 AI 创意工作台。  
> 输入一个关键词，系统会从多个方向生成候选方案，经过 3 轮迭代、打分、筛选和补强，最终沉淀为更接近真实产品文档的方案输出。

## 这是什么

`IdeaBazaar` 不是一个简单的 “AI 帮你写点子” 工具，它更像一个可以陪产品经理一起做早期探索的创意系统。

在很多真实场景里，问题不在于“没有想法”，而在于：

- 想法太散，难以横向比较
- 第一版概念看起来都不错，但没有证据支撑
- 缺少从灵感走向可讨论方案的中间层
- 输出结果像模型草稿，不像可以拿去沟通的产品材料

这个项目想解决的，就是从一个关键词出发，把创意生成、方向比较、用户指导、证据补强和方案输出串成一个完整流程。

## 适合谁用

- 产品经理：快速展开多个方向，形成可讨论的方案池
- 创业者：在早期探索阶段验证机会点和叙事方式
- AI 产品团队：把大模型从“回答问题”升级为“参与产品推演”
- 需要做概念验证的人：希望得到结构化、可比较、可导出的结果

## 产品体验概览

整个体验可以理解为一句话：

**先广泛发散，再逐轮收敛，最后形成可交付的产品方案。**

### 1. 创建主题池

输入关键词后，系统会先围绕该主题创建多个差异化方向的池子。每个池子内部以九宫格形式展开候选创意，方便横向比较，而不是只看单一答案。

### 2. 第一轮：生成种子想法

第一轮更强调“广度”和“差异化”。

- AI 会根据关键词给出多个不同视角
- 每个池子生成 9 个候选创意
- 每个创意都带有基础结构化表达，便于快速浏览

这一轮的目标不是直接产出最终方案，而是尽可能把空间打开。

### 3. 第二轮：补强洞察与判断

第二轮开始强调“为什么值得做”。

- 补充问题定义、用户价值、可行性判断
- 加强风险、指标、论证深度
- 支持用户在轮次之间插入指导，影响下一轮生成方向

这一轮让创意从“有意思”逐渐变成“值得讨论”。

### 4. 第三轮：形成完整方案

第三轮会把入选创意升级成长文结构，输出更接近产品方案文档的内容，例如：

- Executive Summary
- 机会判断
- 用户痛点与场景
- 方案设计
- 风险与边界
- 竞品 / 外部参考
- 深度思考与决策建议

如果配置了联网检索能力，系统还会自动补入外部参考资料，并在界面里以链接卡片形式呈现。

## 核心能力

### 1. 3 池 × 9 格的创意探索方式

不是一次只给一个答案，而是同时展开多个方向、多组候选，避免团队过早收敛在单一路径上。

### 2. 3 轮迭代机制

从“创意种子”到“洞察补强”再到“完整方案”，让结果更符合真实产品工作流，而不是一次性生成一段漂亮文本。

### 3. 用户指导可介入

用户可以在轮次之间补充意见、修正方向、强调重点，让 AI 不是单向输出，而是参与协作。

### 4. 流式生成体验

系统通过 SSE 实时推送生成状态，可以看到每个格子独立进度，减少等待黑盒感。

### 5. 多模型并行竞争

支持配置多个 LLM，并把不同格子分配给不同模型，让结果天然形成对比，便于挑选优胜方案。

### 6. 联网证据补强

在高级轮次中可接入外部检索，自动补充竞品、案例和参考资料，让方案更像“做过研究”，而不是“只会生成”。

### 7. 排名与偏好机制

支持按总分、创新性、可行性、影响力等维度排序，也支持点赞加成，帮助团队更快收敛到值得继续推进的方向。

### 8. 导出能力

支持导出 Markdown / CSV，适合继续加工为提案、汇报材料或知识库文档。

## 当前产品亮点

- 首页支持“超级推荐”，从真实讨论中提取潜在机会点
- 支持中英文界面切换
- 第三轮结果可展示参考文献链接卡片
- 支持查看历史轮次，理解方案是如何演化出来的
- 可在详情抽屉中查看流式内容、分数变化和指导采纳情况

## 快速开始

### 本地启动

```bash
git clone https://github.com/a869642521/LyamIdea.git
cd LyamIdea
npm install
cp .env.local.example .env.local
npm run dev
```

如果本机存在网络或地址绑定问题，建议使用：

```bash
npx next dev --hostname 127.0.0.1
```

启动后访问 [http://127.0.0.1:3000](http://127.0.0.1:3000)。

### 零配置体验

默认可使用 `Mock` 模式体验完整交互流程：

- 不依赖外部 LLM
- 不依赖 Supabase
- 数据保存在内存中
- 服务重启后数据会重置

这适合先体验产品结构和交互逻辑。

### 接入真实模型

如果要接入真实 AI 能力，请在 `.env.local` 中配置以下变量：

```bash
USE_MOCK_DATA=false
LLM_API_KEY=sk-...
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4o-mini
```

然后重启服务，并在右上角 `Settings` 中测试连接即可。

## 环境变量说明

项目使用 `.env.local` 管理本地配置，该文件已被 `.gitignore` 忽略，不会提交到仓库。

```bash
# 模式切换
USE_MOCK_DATA=true

# LLM（OpenAI 兼容接口）
LLM_API_KEY=sk-...
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4o-mini
LLM_MAX_TOKENS=2000
# LLM_LONGFORM_MAX_TOKENS=16000

# 种子首轮：默认会汇总 Reddit/网页证据为「锚点简报」再生成九格；设为 0 可跳过以减轻延迟与费用
# SEED_EVIDENCE_BRIEF=0

# 种子首轮：默认先 1 次 LLM 生成「九格执行规划」再并发/逐格执行；设为 0 则仍为 9 次独立脑暴（少 1 次规划调用）
# SEED_GRID_PLAN=0

# Supabase（可选）
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# 网页搜索（聚焦轮第二轮证据 + 首页「超级推荐」 Reddit 之外的网页证据共用）
# 二选一；不设则上述能力无 Brave/Google 结果（超级推荐仍可有 Reddit；Kimi 端点另有内置联网）
# Brave Search API：https://api-dashboard.search.brave.com
BRAVE_SEARCH_API_KEY=your-brave-subscription-token
# 或 Google Custom Search
GOOGLE_CSE_API_KEY=your-google-api-key
GOOGLE_CSE_CX=your-search-engine-id
# 可选：显式指定 brave | google（默认：有 Brave Key 则优先 Brave，否则 Google）
# FOCUS_EVIDENCE_PROVIDER=brave

# 调试
# NEXT_PUBLIC_DEBUG_POOL_STEPS=true
```

## 评分机制

系统当前采用三维评分：

| 维度 | 权重 | 说明 |
|------|------|------|
| 创新性 | 40% | 是否有足够的新意，是否跳出常规答案 |
| 可行性 | 40% | 是否具备现实落地条件 |
| 影响力 | 20% | 是否能为目标用户或业务带来实际价值 |

总分计算方式：

```text
总分 = 创新性 × 0.4 + 可行性 × 0.4 + 影响力 × 0.2
```

评分并非为了制造“精确幻觉”，而是为了帮助团队快速比较多个候选方向。系统会尽量拉开分差，避免所有结果都集中在一个分段里失去判断意义。

## 技术实现

| 模块 | 技术方案 |
|------|----------|
| 前端 | Next.js 16 + React 19 + TypeScript + Tailwind CSS |
| 后端 | Next.js Route Handlers |
| 实时更新 | Server-Sent Events（SSE） |
| 数据层 | Mock 内存存储 / Supabase |
| 模型接入 | OpenAI SDK 兼容接口 |
| Markdown 渲染 | `react-markdown` + `remark-gfm` |

## 项目结构

```text
src/
├── app/
│   ├── page.tsx
│   ├── pools/[id]/page.tsx
│   └── api/
├── components/
│   ├── CreatePoolModal.tsx
│   ├── PoolColumn.tsx
│   ├── IdeaCard.tsx
│   ├── IdeaDrawer.tsx
│   ├── ProgressBanner.tsx
│   └── SettingsModal.tsx
├── contexts/
│   └── LanguageContext.tsx
├── lib/
│   ├── mock-engine.ts
│   ├── real-engine.ts
│   ├── iteration-stream-buffer.ts
│   └── ai/
└── types/
```

## 部署建议

推荐优先部署到 [Vercel](https://vercel.com) 进行预览和演示：

```bash
npx vercel --prod
```

如果要长期稳定运行，建议注意以下问题：

- 当前 `Mock` 模式依赖进程内存，不适合多实例生产环境
- SSE 与状态写入在 Serverless 多实例下可能不在同一个实例中
- 真正上线建议接入 Supabase 或其他持久化状态层
- 若重视长连接稳定性，可优先考虑单实例部署方案

## 这个项目接下来还能怎么演进

从产品角度看，`IdeaBazaar` 已经具备“可用的 AI 创意探索流程”，下一步值得继续打磨的方向包括：

- 更完整的方案模板体系：按行业或场景切换输出结构
- 更强的证据链能力：增加来源可信度、摘要引用和观点对照
- 更好的协作体验：多人评论、标记、筛选和共识收敛
- 更明确的阶段控制：从发散、评审、收敛到立项建议
- 更强的资产沉淀：把优秀方案沉淀为团队知识库，而不只是一次性结果

---

如果你在找一个“让 AI 参与产品探索，而不仅仅是写文案”的项目，这个仓库就是为这个方向设计的。
