'use client'
import { Fragment, useState, useEffect, useMemo, useRef } from 'react'
import type { ReactNode, InputHTMLAttributes } from 'react'
import { cn, scoreColor, formatScore } from '@/lib/utils'
import { POOL_THEMES } from '@/lib/color-themes'
import type { IdeaDetail, PoolDetail, FeedbackEntry } from '@/types'
import { X, Paperclip, Heart, Download, ExternalLink, MessageCircle, Check } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useLanguage } from '@/contexts/LanguageContext'

const ICONS = [
  '🧙', '🦸', '🦹', '🧝', '🧛', '🧟',
  '🧜', '🧚', '👷', '💂', '🕵', '🥷',
  '🤠', '🤴', '👸', '🤵', '🎅', '🤶',
  '🧞', '🧑', '🎭', '👑', '🧔', '👼',
]

const IDEA_GRADIENTS = [
  'bg-gradient-to-br from-violet-500 to-indigo-600',
  'bg-gradient-to-br from-rose-500 to-pink-600',
  'bg-gradient-to-br from-amber-400 to-orange-500',
  'bg-gradient-to-br from-emerald-400 to-teal-600',
  'bg-gradient-to-br from-sky-400 to-blue-600',
  'bg-gradient-to-br from-fuchsia-500 to-purple-600',
  'bg-gradient-to-br from-lime-400 to-green-600',
  'bg-gradient-to-br from-cyan-400 to-sky-600',
]

function pickIcon(id: string): string {
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0
  return ICONS[Math.abs(h) % ICONS.length]
}

function iconGradient(id: string): string {
  let h = 0
  for (const c of id) h = (h * 17 + c.charCodeAt(0)) | 0
  return IDEA_GRADIENTS[Math.abs(h) % IDEA_GRADIENTS.length]
}


const SECTION_META: Record<string, { icon: string; color: string; bg: string }> = {
  '核心直觉': { icon: '◆', color: 'text-violet-300', bg: 'bg-violet-500/10 border-violet-500/20' },
  '痛点现场 [Anchor]': { icon: '⚡', color: 'text-amber-300', bg: 'bg-amber-500/10 border-amber-500/20' },
  '交互感知 [UI]': { icon: '🔧', color: 'text-emerald-300', bg: 'bg-emerald-500/10 border-emerald-500/20' },
  '底层机制 [Logic]': { icon: '📌', color: 'text-sky-300', bg: 'bg-sky-500/10 border-sky-500/20' },
  '差异化壁垒 [Edge]': { icon: '📊', color: 'text-cyan-300', bg: 'bg-cyan-500/10 border-cyan-500/20' },
  '专注边界': { icon: '⚠️', color: 'text-orange-300', bg: 'bg-orange-500/10 border-orange-500/20' },
  '核心直觉 (Essence)': { icon: '◆', color: 'text-violet-300', bg: 'bg-violet-500/10 border-violet-500/20' },
  '痛点现场 (The Scene)': { icon: '⚡', color: 'text-amber-300', bg: 'bg-amber-500/10 border-amber-500/20' },
  '交互原型 (Visual/UI)': { icon: '🔧', color: 'text-emerald-300', bg: 'bg-emerald-500/10 border-emerald-500/20' },
  '底层机制 (Mechanism)': { icon: '📌', color: 'text-sky-300', bg: 'bg-sky-500/10 border-sky-500/20' },
  '差异化壁垒 (Edge)': { icon: '📊', color: 'text-cyan-300', bg: 'bg-cyan-500/10 border-cyan-500/20' },
  '专注边界 (Focus)': { icon: '⚠️', color: 'text-orange-300', bg: 'bg-orange-500/10 border-orange-500/20' },
  '定位': { icon: '🎯', color: 'text-violet-300', bg: 'bg-violet-500/10 border-violet-500/20' },
  '痛点': { icon: '⚡', color: 'text-amber-300', bg: 'bg-amber-500/10 border-amber-500/20' },
  '功能': { icon: '🔧', color: 'text-emerald-300', bg: 'bg-emerald-500/10 border-emerald-500/20' },
  '依据': { icon: '📌', color: 'text-sky-300', bg: 'bg-sky-500/10 border-sky-500/20' },
  '产品原型断言（Assertion）': { icon: '🎯', color: 'text-violet-300', bg: 'bg-violet-500/10 border-violet-500/20' },
  '业务摩擦解构（Deconstruction）': { icon: '⚡', color: 'text-amber-300', bg: 'bg-amber-500/10 border-amber-500/20' },
  '硬核机制链路（Technical Chain）': { icon: '🔗', color: 'text-emerald-300', bg: 'bg-emerald-500/10 border-emerald-500/20' },
  '进化审计报告（Evolution Audit）': { icon: '📋', color: 'text-sky-300', bg: 'bg-sky-500/10 border-sky-500/20' },
  '指标': { icon: '📊', color: 'text-cyan-300', bg: 'bg-cyan-500/10 border-cyan-500/20' },
  '风险': { icon: '⚠️', color: 'text-orange-300', bg: 'bg-orange-500/10 border-orange-500/20' },
  'Essence': { icon: '◆', color: 'text-violet-300', bg: 'bg-violet-500/10 border-violet-500/20' },
  'Pain scene [Anchor]': { icon: '⚡', color: 'text-amber-300', bg: 'bg-amber-500/10 border-amber-500/20' },
  'Interaction [UI]': { icon: '🔧', color: 'text-emerald-300', bg: 'bg-emerald-500/10 border-emerald-500/20' },
  'Mechanism [Logic]': { icon: '📌', color: 'text-sky-300', bg: 'bg-sky-500/10 border-sky-500/20' },
  'Differentiation [Edge]': { icon: '📊', color: 'text-cyan-300', bg: 'bg-cyan-500/10 border-cyan-500/20' },
  'Focus boundary': { icon: '⚠️', color: 'text-orange-300', bg: 'bg-orange-500/10 border-orange-500/20' },
  'The Scene': { icon: '⚡', color: 'text-amber-300', bg: 'bg-amber-500/10 border-amber-500/20' },
  'Visual/UI': { icon: '🔧', color: 'text-emerald-300', bg: 'bg-emerald-500/10 border-emerald-500/20' },
  'Mechanism': { icon: '📌', color: 'text-sky-300', bg: 'bg-sky-500/10 border-sky-500/20' },
  'Edge': { icon: '📊', color: 'text-cyan-300', bg: 'bg-cyan-500/10 border-cyan-500/20' },
  'Focus': { icon: '⚠️', color: 'text-orange-300', bg: 'bg-orange-500/10 border-orange-500/20' },
  'Positioning': { icon: '🎯', color: 'text-violet-300', bg: 'bg-violet-500/10 border-violet-500/20' },
  'Pain': { icon: '⚡', color: 'text-amber-300', bg: 'bg-amber-500/10 border-amber-500/20' },
  'Features': { icon: '🔧', color: 'text-emerald-300', bg: 'bg-emerald-500/10 border-emerald-500/20' },
  'Rationale': { icon: '📌', color: 'text-sky-300', bg: 'bg-sky-500/10 border-sky-500/20' },
  'Product Assertion': { icon: '🎯', color: 'text-violet-300', bg: 'bg-violet-500/10 border-violet-500/20' },
  'Business Friction Deconstruction': { icon: '⚡', color: 'text-amber-300', bg: 'bg-amber-500/10 border-amber-500/20' },
  'Technical Chain': { icon: '🔗', color: 'text-emerald-300', bg: 'bg-emerald-500/10 border-emerald-500/20' },
  'Evolution Audit': { icon: '📋', color: 'text-sky-300', bg: 'bg-sky-500/10 border-sky-500/20' },
  'Metric': { icon: '📊', color: 'text-cyan-300', bg: 'bg-cyan-500/10 border-cyan-500/20' },
  'Risk': { icon: '⚠️', color: 'text-orange-300', bg: 'bg-orange-500/10 border-orange-500/20' },
}

const SECTION_LABELS: Record<string, string> = {
  '核心直觉': '核心直觉',
  '痛点现场 [Anchor]': '痛点现场 [Anchor]',
  '交互感知 [UI]': '交互感知 [UI]',
  '底层机制 [Logic]': '底层机制 [Logic]',
  '差异化壁垒 [Edge]': '差异化壁垒 [Edge]',
  '专注边界': '专注边界',
  '核心直觉 (Essence)': '核心直觉 (Essence)',
  '痛点现场 (The Scene)': '痛点现场 (The Scene)',
  '交互原型 (Visual/UI)': '交互原型 (Visual/UI)',
  '底层机制 (Mechanism)': '底层机制 (Mechanism)',
  '差异化壁垒 (Edge)': '差异化壁垒 (Edge)',
  '专注边界 (Focus)': '专注边界 (Focus)',
  '定位': '产品定位',
  '痛点': '解决痛点',
  '功能': '功能概述',
  '依据': '判断依据',
  '产品原型断言（Assertion）': '产品原型断言',
  '业务摩擦解构（Deconstruction）': '业务摩擦解构',
  '硬核机制链路（Technical Chain）': '硬核机制链路',
  '进化审计报告（Evolution Audit）': '进化审计报告',
  '指标': '成功指标',
  '风险': '主要风险',
  'Essence': 'Essence',
  'Pain scene [Anchor]': 'Pain scene [Anchor]',
  'Interaction [UI]': 'Interaction [UI]',
  'Mechanism [Logic]': 'Mechanism [Logic]',
  'Differentiation [Edge]': 'Differentiation [Edge]',
  'Focus boundary': 'Focus boundary',
  'The Scene': 'The Scene',
  'Visual/UI': 'Visual / UI',
  'Mechanism': 'Mechanism',
  'Edge': 'Edge',
  'Focus': 'Focus',
  'Positioning': 'Positioning',
  'Pain': 'Pain Points',
  'Features': 'Features',
  'Rationale': 'Rationale',
  'Product Assertion': 'Product Assertion',
  'Business Friction Deconstruction': 'Business Friction Deconstruction',
  'Technical Chain': 'Technical Chain',
  'Evolution Audit': 'Evolution Audit',
  'Metric': 'Success metric',
  'Risk': 'Key risk',
}

/** 底层机制段：代码块风展示 */
function isMechanismCodeSection(sectionKey: string): boolean {
  return (
    sectionKey.includes('[Logic]') ||
    sectionKey === 'Mechanism' ||
    sectionKey.includes('(Mechanism)') ||
    sectionKey.includes('硬核机制链路') ||
    sectionKey === 'Technical Chain'
  )
}

const EVIDENCE_ID_SPLIT_RE = /(\b(?:P|E)[1-9]\d*\b)/gi

/** 将正文中的 Evidence ID（P1、E2…）做成「溯源成功」芯片 + 可读分段中的高亮 */
function renderEvidenceHighlights(
  text: string,
  keyPrefix: string,
  opts?: { traceOkLabel: string; idTitle: (id: string) => string }
): ReactNode {
  if (!text) return null
  const parts = text.split(EVIDENCE_ID_SPLIT_RE)
  return parts.map((part, i) => {
    if (!part) return null
    if (/^(?:P|E)[1-9]\d*$/i.test(part)) {
      const id = part.toUpperCase()
      if (opts?.traceOkLabel) {
        return (
          <span
            key={`${keyPrefix}-ev-${i}-${id}`}
            className="inline-flex items-center gap-1 align-middle mx-0.5 rounded-md border border-emerald-400/45 bg-emerald-950/75 pl-1 pr-1.5 py-0.5 shadow-sm shadow-emerald-950/40"
            title={opts.idTitle(id)}
          >
            <Check size={12} className="shrink-0 text-emerald-400" strokeWidth={2.75} aria-hidden />
            <span className="inline-flex flex-col items-start gap-0.5 leading-none">
              <span className="text-[8px] font-semibold text-emerald-300/95 tracking-tight">
                {opts.traceOkLabel}
              </span>
              <span className="font-mono text-[11px] font-bold text-emerald-100 tabular-nums">{id}</span>
            </span>
          </span>
        )
      }
      return (
        <span
          key={`${keyPrefix}-ev-${i}-${id}`}
          className="inline-flex items-center gap-0.5 font-bold text-violet-200 mx-0.5 align-middle"
          title={`Evidence ${id}`}
        >
          <MessageCircle size={11} className="inline shrink-0 text-violet-400 opacity-90" aria-hidden />
          {id}
        </span>
      )
    }
    return <Fragment key={`${keyPrefix}-t-${i}`}>{part}</Fragment>
  })
}

/** 种子/旧标签 → 洞察轮新标签 的上一版本正文查找（用于 Logic Δ） */
const SECTION_PREV_ALIASES: Record<string, readonly string[]> = {
  '产品原型断言（Assertion）': [
    '核心直觉',
    '核心直觉 (Essence)',
    'Essence',
    '定位',
    'Positioning',
    'Product Assertion',
  ],
  '业务摩擦解构（Deconstruction）': [
    '痛点现场 [Anchor]',
    '痛点现场',
    'Pain scene [Anchor]',
    '痛点',
    'Pain',
    'The Scene',
    'Business Friction Deconstruction',
  ],
  '硬核机制链路（Technical Chain）': [
    '交互感知 [UI]',
    '交互感知',
    'Interaction [UI]',
    '交互原型 (Visual/UI)',
    '功能',
    'Features',
    'Visual/UI',
    'Technical Chain',
  ],
  '进化审计报告（Evolution Audit）': [
    '底层机制 [Logic]',
    '底层机制',
    'Mechanism [Logic]',
    'Mechanism',
    '依据',
    'Rationale',
    'Evolution Audit',
  ],
  指标: ['差异化壁垒 [Edge]', '差异化壁垒', 'Differentiation [Edge]', 'Edge', 'Metric'],
  风险: ['专注边界', '专注边界 (Focus)', 'Focus boundary', 'Focus', 'Risk'],
}

function sectionTextByKeyOrAlias(
  prevSections: Array<{ key: string; text: string }> | null,
  key: string
): string {
  if (!prevSections?.length) return ''
  const map = new Map(prevSections.map((s) => [s.key, s.text]))
  const direct = map.get(key)
  if (direct != null) return direct
  for (const alt of SECTION_PREV_ALIASES[key] ?? []) {
    const x = map.get(alt)
    if (x != null) return x
  }
  return ''
}

/** 长段拆成多行/多句，避免单行堆字 */
function splitSectionTextForReadability(text: string): string[] {
  const raw = text.trim()
  if (!raw) return []
  const chunks: string[] = []
  for (const para of raw.split(/\n{2,}/)) {
    const p = para.trim()
    if (!p) continue
    const lines = p.split(/\n/).map((l) => l.trim()).filter(Boolean)
    if (lines.length > 1) {
      chunks.push(...lines)
      continue
    }
    const line = lines[0] ?? p
    if (line.length <= 96) {
      chunks.push(line)
      continue
    }
    const byPeriod = line.split(/(?<=[。！？])\s+/).filter(Boolean)
    if (byPeriod.length > 1) {
      chunks.push(...byPeriod)
      continue
    }
    const bySemi = line.split(/；\s+/).filter(Boolean)
    if (bySemi.length > 1) {
      chunks.push(...bySemi)
      continue
    }
    const byEn = line.split(/(?<=[.!?])\s+/).filter(Boolean)
    if (byEn.length > 1) {
      chunks.push(...byEn)
      continue
    }
    chunks.push(line)
  }
  return chunks
}

function computeLogicDeltaHint(
  prevBody: string,
  currBody: string,
  msg: {
    newSection: () => string
    charsMore: (n: number) => string
    mechanismCue: () => string
    rewritten: () => string
  }
): string | null {
  const p = normSectionBody(prevBody)
  const c = normSectionBody(currBody)
  if (!c) return null
  if (!p) return msg.newSection()
  if (p === c) return null
  const hints: string[] = []
  const d = c.length - p.length
  if (d >= 16) hints.push(msg.charsMore(d))
  const cue = /数据流|链路|哈希|状态|索引|重试|失败|API|Skill|skill|token|TLS|合规/i
  if (cue.test(c) && !cue.test(p)) hints.push(msg.mechanismCue())
  if (hints.length === 0) hints.push(msg.rewritten())
  return hints.slice(0, 2).join(' · ')
}

/** 从 Markdown 内容的 ## 参考文献与链接 节提取链接列表 */
function parseRefLinks(content: string): Array<{ title: string; url: string }> {
  const refMatch = /##\s*参考文献与链接[\s\S]*?(?=\n##\s|\s*$)/.exec(content)
  if (!refMatch) return []
  const section = refMatch[0]
  const results: Array<{ title: string; url: string }> = []
  const pattern = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g
  let m: RegExpExecArray | null
  while ((m = pattern.exec(section)) !== null) {
    results.push({ title: m[1].trim(), url: m[2].trim() })
  }
  return results
}

/** 方案报告轮：h2 标题命中则加左边框/浅底（与 prompts 强制目录对齐） */
const PROPOSAL_H2_MODULE_RE =
  /决策仪表盘|Executive\s*Dashboard|洞察轮审计|生存\s*KPI|反方质疑|决策者四问|核心机制与架构|12\s*周|对抗性防御|Executive\s*Summary|Decision\s*Matrix|The\s*Core|Roadmap|Defense|竞品与替代/i

/** 红蓝块引用：按首段文字粗分角色样式（与 prompts 要求的前缀对齐） */
function classifyProposalBlockquote(flat: string): 'cfo' | 'cto' | 'commercial' | 'technical' | 'default' {
  const s = flat.replace(/^\s+/, '').slice(0, 160)
  if (/\bCFO\b/.test(s) && /[：:]/.test(s.slice(0, 24))) return 'cfo'
  if (/\bCTO\b/.test(s) && /[：:]/.test(s.slice(0, 24))) return 'cto'
  if (/我方（商业）|Response\s*\(\s*Commercial\s*\)/i.test(s)) return 'commercial'
  if (/我方（技术）|Response\s*\(\s*Technical\s*\)/i.test(s)) return 'technical'
  if (/首席财务|Chief\s*Financial/i.test(s)) return 'cfo'
  return 'default'
}

function flattenMarkdownChildren(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(flattenMarkdownChildren).join('')
  if (typeof node === 'object' && 'props' in (node as object)) {
    const p = (node as { props?: { children?: ReactNode } }).props
    return flattenMarkdownChildren(p?.children)
  }
  return ''
}

/** 单张参考文献卡片 */
function RefLinkCard({ title, url }: { title: string; url: string }) {
  let domain = ''
  try { domain = new URL(url).hostname.replace(/^www\./, '') } catch { /* ignore */ }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg border border-zinc-700/60 bg-zinc-800/50 hover:border-violet-500/40 hover:bg-zinc-800/80 transition-colors group"
    >
      {/* favicon */}
      <img
        src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
        alt=""
        width={16}
        height={16}
        className="mt-0.5 rounded shrink-0 opacity-80 group-hover:opacity-100"
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-zinc-200 group-hover:text-violet-300 transition-colors leading-snug line-clamp-2">
          {title}
        </p>
        <p className="text-[11px] text-zinc-500 mt-0.5 truncate">{domain}</p>
      </div>
      <ExternalLink size={12} className="shrink-0 text-zinc-600 group-hover:text-violet-400 mt-1 transition-colors" />
    </a>
  )
}

/** 参考文献卡片区块 */
function RefLinkCards({
  refs,
  proposalShell,
}: {
  refs: Array<{ title: string; url: string }>
  proposalShell?: boolean
}) {
  const { t } = useLanguage()
  if (!refs.length) return null
  const list = (
    <div className="flex flex-col gap-1.5">
      {refs.map((ref, i) => (
        <RefLinkCard key={`${ref.url}-${i}`} title={ref.title} url={ref.url} />
      ))}
    </div>
  )
  if (proposalShell) {
    return (
      <div className="mt-6 rounded-xl border border-zinc-700/50 bg-zinc-900/60 p-4 shadow-inner shadow-black/15">
        <div className="flex items-center justify-between gap-2 border-b border-zinc-700/70 pb-2.5 mb-3">
          <span className="text-xs font-semibold text-zinc-300 tracking-wide">{t('references2')}</span>
          <span className="text-[10px] text-zinc-500 tabular-nums">{refs.length}</span>
        </div>
        {list}
      </div>
    )
  }
  return (
    <div className="mt-5">
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">{t('references2')}</span>
        <span className="text-[10px] text-zinc-600">({refs.length})</span>
      </div>
      {list}
    </div>
  )
}

/** 解析 PM 三段结构内容，返回 sections 列表；失败返回 null */
function parseIdeaSections(content: string): Array<{ key: string; text: string }> | null {
  let body = content.trim()
  // 去掉「标题」前缀
  const book = /^「[^」]+」\n?/u.exec(body)
  if (book) body = body.slice(book[0].length).trim()

  const labelPattern = new RegExp(
    '^(' +
      [
        '核心直觉',
        String.raw`痛点现场 \[Anchor\]`,
        String.raw`交互感知 \[UI\]`,
        String.raw`底层机制 \[Logic\]`,
        String.raw`差异化壁垒 \[Edge\]`,
        '专注边界',
        String.raw`核心直觉 \(Essence\)`,
        String.raw`痛点现场 \(The Scene\)`,
        String.raw`交互原型 \(Visual/UI\)`,
        String.raw`底层机制 \(Mechanism\)`,
        String.raw`差异化壁垒 \(Edge\)`,
        String.raw`专注边界 \(Focus\)`,
        String.raw`产品原型断言（Assertion）`,
        String.raw`业务摩擦解构（Deconstruction）`,
        String.raw`硬核机制链路（Technical Chain）`,
        String.raw`进化审计报告（Evolution Audit）`,
        '定位',
        '痛点',
        '功能',
        '依据',
        '指标',
        '风险',
        'Essence',
        String.raw`Pain scene \[Anchor\]`,
        String.raw`Interaction \[UI\]`,
        String.raw`Mechanism \[Logic\]`,
        String.raw`Differentiation \[Edge\]`,
        'Focus boundary',
        'The Scene',
        String.raw`Visual/UI`,
        'Mechanism',
        'Edge',
        'Focus',
        'Positioning',
        'Pain',
        'Features',
        'Rationale',
        'Product Assertion',
        'Business Friction Deconstruction',
        'Technical Chain',
        'Evolution Audit',
        'Metric',
        'Risk',
      ].join('|') +
      ')[：:]\\s*(.+)$',
    'gm'
  )
  const sections: Array<{ key: string; text: string }> = []
  let match: RegExpExecArray | null
  while ((match = labelPattern.exec(body)) !== null) {
    sections.push({ key: match[1], text: match[2].trim() })
  }
  return sections.length >= 2 ? sections : null
}

/** 与上一轮对比时，对「依据 / 风险」等段落做 🆕 标记的 key（中英模板） */
const SECTION_ENRICH_COMPARE_KEYS = new Set([
  '依据',
  '进化审计报告（Evolution Audit）',
  '风险',
  'Rationale',
  'Evolution Audit',
  'Risk',
])

function normSectionBody(s: string) {
  return s.replace(/\s+/g, ' ').trim()
}

/** 相对 baseline，当前内容里哪些小节明显新增或加厚（用于 0→1 等轮次的「进化感知」） */
function computeEnrichedSectionKeys(
  baselineContent: string | null | undefined,
  currentContent: string
): Set<string> {
  const out = new Set<string>()
  const cur = parseIdeaSections(currentContent)
  if (!cur) return out
  const prevParsed = baselineContent ? parseIdeaSections(baselineContent) : null
  const prevMap = new Map(prevParsed?.map((s) => [s.key, s.text]) ?? [])
  for (const { key, text } of cur) {
    if (!SECTION_ENRICH_COMPARE_KEYS.has(key)) continue
    const p = normSectionBody(prevMap.get(key) ?? '')
    const c = normSectionBody(text)
    if (c.length < 12) continue
    if (!p) {
      if (c.length >= 15) out.add(key)
      continue
    }
    if (c === p) continue
    if (c.length >= p.length + 20 || (c.length >= p.length * 1.18 && c.length > p.length + 8)) {
      out.add(key)
    }
  }
  return out
}

function MarkdownContent({
  content,
  hideRefSection = false,
  proposalReportLayout = false,
}: {
  content: string
  hideRefSection?: boolean
  proposalReportLayout?: boolean
}) {
  const { t } = useLanguage()
  const displayContent = hideRefSection
    ? content.replace(/\n##\s*参考文献与链接[\s\S]*$/, '').trimEnd()
    : content

  const components = {
    h1: ({ children }: { children?: ReactNode }) => (
      <h1
        className={cn(
          'text-xl font-semibold text-zinc-100 mb-3',
          proposalReportLayout ? 'mt-1 border-b border-zinc-700/60 pb-3' : 'mt-1'
        )}
      >
        {children}
      </h1>
    ),
    h2: ({ children }: { children?: ReactNode }) => {
      const raw = flattenMarkdownChildren(children)
      const moduleHit = proposalReportLayout && PROPOSAL_H2_MODULE_RE.test(raw)
      return (
        <h2
          className={cn(
            'text-lg font-semibold text-zinc-100',
            proposalReportLayout
              ? 'mt-8 mb-3 pb-2 border-b border-zinc-700/80'
              : 'mt-5 mb-2',
            moduleHit && 'border-l-2 border-violet-500/70 pl-3 bg-violet-500/[0.06] rounded-r-md -ml-0.5'
          )}
        >
          {children}
        </h2>
      )
    },
    h3: ({ children }: { children?: ReactNode }) => (
      <h3
        className={cn(
          'text-sm font-semibold text-zinc-100 mt-4 mb-2',
          proposalReportLayout && 'ml-2 pl-2 border-l border-zinc-600/50'
        )}
      >
        {children}
      </h3>
    ),
    p: ({ children }: { children?: ReactNode }) => (
      <p className="text-sm leading-7 text-zinc-200 mb-3">{children}</p>
    ),
    ul: ({ className, children }: { className?: string; children?: ReactNode }) => {
      const isTask = className?.includes('contains-task-list')
      return (
        <ul
          className={cn(
            'mb-3 text-sm text-zinc-200',
            isTask
              ? proposalReportLayout
                ? 'list-none space-y-2.5 pl-0 rounded-lg border border-zinc-700/50 bg-zinc-900/40 px-3 py-3'
                : 'list-none space-y-1.5 pl-0'
              : 'list-disc space-y-1.5 pl-5'
          )}
        >
          {children}
        </ul>
      )
    },
    ol: ({ children }: { children?: ReactNode }) => (
      <ol className="list-decimal pl-5 space-y-1.5 mb-3 text-sm text-zinc-200">{children}</ol>
    ),
    li: ({ className, children }: { className?: string; children?: ReactNode }) => {
      const isTask = className?.includes('task-list-item')
      if (isTask && proposalReportLayout) {
        return (
          <li className={cn(className, 'flex items-start gap-2.5 leading-6')}>
            {children}
          </li>
        )
      }
      return <li className={cn('leading-6', className)}>{children}</li>
    },
    blockquote: ({ children }: { children?: ReactNode }) => {
      if (!proposalReportLayout) {
        return (
          <blockquote className="border-l-2 border-violet-400/40 pl-3 text-sm text-zinc-300 italic mb-3">
            {children}
          </blockquote>
        )
      }
      const flat = flattenMarkdownChildren(children)
      const role = classifyProposalBlockquote(flat)
      const roleClass =
        role === 'cfo'
          ? 'border-l-rose-400/85 bg-rose-500/[0.07] text-zinc-200'
          : role === 'cto'
            ? 'border-l-sky-400/80 bg-sky-500/[0.07] text-zinc-200'
            : role === 'commercial'
              ? 'border-l-emerald-400/75 bg-emerald-500/[0.06] text-zinc-200'
              : role === 'technical'
                ? 'border-l-violet-400/75 bg-violet-500/[0.06] text-zinc-200'
                : 'border-l-zinc-500/70 bg-zinc-800/40 text-zinc-300'
      return (
        <blockquote
          className={cn(
            'border-l-[3px] rounded-r-md pl-3 pr-2 py-2.5 text-sm mb-3 not-italic leading-relaxed',
            roleClass
          )}
        >
          {children}
        </blockquote>
      )
    },
    input: (props: InputHTMLAttributes<HTMLInputElement>) => {
      const { type, checked, className, ...rest } = props
      if (proposalReportLayout && type === 'checkbox') {
        return (
          <input
            type="checkbox"
            checked={checked}
            readOnly
            disabled
            aria-label={t('proposalRoadmapTaskCheckbox')}
            className={cn(
              'mt-1 h-3.5 w-3.5 shrink-0 rounded border-zinc-600 bg-zinc-800 text-violet-500 accent-violet-500 cursor-default',
              className
            )}
            {...rest}
          />
        )
      }
      return <input type={type} checked={checked} className={className} {...rest} />
    },
    pre: ({ children }: { children?: ReactNode }) => (
      <pre
        className={cn(
          'overflow-x-auto rounded-lg p-3 mb-3 text-[13px] leading-relaxed',
          proposalReportLayout
            ? 'bg-zinc-950/90 border border-zinc-600/45 text-zinc-100'
            : 'bg-zinc-900/80 border border-zinc-800/80 text-zinc-100'
        )}
      >
        {children}
      </pre>
    ),
    code: ({ className, children }: { className?: string; children?: ReactNode }) => {
      const isBlock = /language-/.test(className ?? '')
      if (isBlock) {
        return (
          <code
            className={cn(
              className,
              'block whitespace-pre font-mono bg-transparent p-0',
              proposalReportLayout ? 'text-[13px] text-zinc-100' : 'text-[13px]'
            )}
          >
            {children}
          </code>
        )
      }
      return (
        <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-[12px] text-zinc-100">{children}</code>
      )
    },
    table: ({ children }: { children?: ReactNode }) => (
      <div
        className={cn(
          'overflow-x-auto mb-4',
          proposalReportLayout &&
            'rounded-xl border border-zinc-700/55 bg-zinc-900/45 p-1 shadow-inner shadow-black/15'
        )}
      >
        <table
          className={cn(
            'min-w-full border-collapse border border-zinc-700/90',
            proposalReportLayout ? 'text-[13px]' : 'text-xs border-zinc-700'
          )}
        >
          {children}
        </table>
      </div>
    ),
    thead: ({ children }: { children?: ReactNode }) => (
      <thead
        className={cn(
          proposalReportLayout
            ? 'bg-zinc-800 text-zinc-100 [&_th]:border-b [&_th]:border-zinc-600/80'
            : 'bg-zinc-800/80 text-zinc-200'
        )}
      >
        {children}
      </thead>
    ),
    tbody: ({ children }: { children?: ReactNode }) => (
      <tbody
        className={cn(
          proposalReportLayout
            ? 'bg-zinc-950/40 [&_tr:nth-child(even)]:bg-zinc-900/35 [&_tr:hover]:bg-zinc-800/25'
            : 'bg-zinc-900/40'
        )}
      >
        {children}
      </tbody>
    ),
    tr: ({ children }: { children?: ReactNode }) => (
      <tr className="border-b border-zinc-800/90 transition-colors">{children}</tr>
    ),
    th: ({ children }: { children?: ReactNode }) => (
      <th className="px-3 py-2.5 text-left font-semibold tracking-wide">{children}</th>
    ),
    td: ({ children }: { children?: ReactNode }) => (
      <td className="px-3 py-2.5 align-top text-zinc-300 leading-relaxed">{children}</td>
    ),
    strong: ({ children }: { children?: ReactNode }) => (
      <strong className="font-semibold text-zinc-100">{children}</strong>
    ),
    a: ({ href, children }: { href?: string; children?: ReactNode }) => {
      const safeHref = href && /^https?:\/\//i.test(href) ? href : '#'
      return (
        <a
          href={safeHref}
          target={safeHref !== '#' ? '_blank' : undefined}
          rel="noopener noreferrer"
          className="text-violet-400 hover:text-violet-300 underline underline-offset-2 decoration-violet-500/40 hover:decoration-violet-400 transition-colors inline-flex items-center gap-0.5"
        >
          {children}
          {safeHref !== '#' && <ExternalLink size={10} className="shrink-0 opacity-60 ml-0.5" />}
        </a>
      )
    },
  }

  return (
    <div className={cn('mb-3 text-zinc-200', proposalReportLayout ? 'max-w-none space-y-0.5' : 'space-y-3')}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {displayContent}
      </ReactMarkdown>
    </div>
  )
}

function IdeaContentBlock({
  content,
  preferMarkdown = false,
  enrichedSectionKeys,
  enrichedBadgeTitle,
  baselineContent,
  showLogicDelta,
}: {
  content: string
  preferMarkdown?: boolean
  enrichedSectionKeys?: Set<string>
  enrichedBadgeTitle?: string
  baselineContent?: string | null
  showLogicDelta?: boolean
}) {
  const { t } = useLanguage()
  const sections = parseIdeaSections(content)

  const prevSections = useMemo(() => {
    if (!baselineContent?.trim()) return null
    return parseIdeaSections(baselineContent)
  }, [baselineContent])

  const evidenceOpts = useMemo(
    () => ({
      traceOkLabel: t('evidenceTraceOk'),
      idTitle: (id: string) => t('evidenceIdTitle', id),
    }),
    [t]
  )

  const deltaMsg = useMemo(
    () => ({
      newSection: () => t('logicDeltaNewSection'),
      charsMore: (n: number) => t('logicDeltaCharsMore', n),
      mechanismCue: () => t('logicDeltaMechanismCue'),
      rewritten: () => t('logicDeltaRewritten'),
    }),
    [t]
  )

  if (preferMarkdown) {
    const refs = parseRefLinks(content)
    return (
      <>
        <MarkdownContent
          content={content}
          hideRefSection={refs.length > 0}
          proposalReportLayout={preferMarkdown}
        />
        <RefLinkCards refs={refs} proposalShell={refs.length > 0} />
      </>
    )
  }

  if (sections) {
    return (
      <div className="space-y-3 mb-3">
        {sections.map(({ key, text }, idx) => {
          const meta = SECTION_META[key] ?? { icon: '•', color: 'text-zinc-300', bg: 'bg-zinc-800/60 border-zinc-700/30' }
          const label = SECTION_LABELS[key] ?? key
          const rowKey = `${key}-${idx}`
          const codeLike = isMechanismCodeSection(key)
          const prevBody =
            showLogicDelta && prevSections ? sectionTextByKeyOrAlias(prevSections, key) : ''
          const deltaLine =
            showLogicDelta && prevSections
              ? computeLogicDeltaHint(prevBody, text, deltaMsg)
              : null
          const blocks = splitSectionTextForReadability(text)
          return (
            <div
              key={rowKey}
              className="rounded-lg border border-zinc-700/45 bg-zinc-900/35 px-3 py-2.5 shadow-sm shadow-black/20"
            >
              <div className="mb-2 flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
                <div className="flex flex-wrap items-center gap-1 min-w-0">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-semibold tracking-wide',
                      meta.bg,
                      meta.color
                    )}
                  >
                    <span className="select-none opacity-90" aria-hidden>
                      {meta.icon}
                    </span>
                    {label}
                    {enrichedSectionKeys?.has(key) && (
                      <span
                        className="ml-1 text-[11px] font-normal opacity-95"
                        title={enrichedBadgeTitle}
                        aria-label={enrichedBadgeTitle}
                      >
                        🆕
                      </span>
                    )}
                  </span>
                </div>
                {deltaLine ? (
                  <div
                    className="shrink-0 text-right max-w-[min(100%,15rem)] pl-1"
                    title={deltaLine}
                  >
                    <div className="text-[9px] font-semibold text-teal-400/95 tracking-wide tabular-nums">
                      {t('logicDeltaBadge')}
                    </div>
                    <div className="text-[9px] text-zinc-500 leading-snug mt-0.5 text-pretty">
                      {deltaLine}
                    </div>
                  </div>
                ) : null}
              </div>
              {codeLike ? (
                <div
                  className={cn(
                    'rounded-lg px-3 py-2.5 font-mono text-[12.5px] leading-relaxed break-words',
                    'border border-emerald-700/40 bg-emerald-950/55 text-emerald-100/92',
                    'ring-1 ring-inset ring-emerald-500/15 shadow-inner shadow-black/20'
                  )}
                >
                  <div className="text-[9px] font-medium uppercase tracking-wider text-emerald-500/80 mb-1.5">
                    {t('technicalChainStrip')}
                  </div>
                  <div className="space-y-2">
                    {blocks.map((blk, bi) => (
                      <p
                        key={`${rowKey}-b-${bi}`}
                        className="whitespace-pre-wrap last:mb-0 text-zinc-200/95"
                      >
                        {renderEvidenceHighlights(blk, `${rowKey}-${bi}`, evidenceOpts)}
                      </p>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {blocks.map((blk, bi) => (
                    <p
                      key={`${rowKey}-b-${bi}`}
                      className="text-sm text-zinc-200 leading-[1.65] text-pretty"
                    >
                      {renderEvidenceHighlights(blk, `${rowKey}-${bi}`, evidenceOpts)}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  // 旧格式回退：纯文本（仍做证据芯片与分段）
  const fallbackBlocks = splitSectionTextForReadability(content)
  return (
    <div className="space-y-2.5 mb-3">
      {fallbackBlocks.map((blk, i) => (
        <p key={i} className="text-sm text-zinc-200 leading-[1.65] text-pretty">
          {renderEvidenceHighlights(blk, `fb-${i}`, evidenceOpts)}
        </p>
      ))}
    </div>
  )
}

/** UI「第 n 轮」对应数据里版本的 iteration（首轮为 0，与 mock-engine 一致） */
function versionIterationForUiRound(uiRound: number): number {
  return uiRound - 1
}

/**
 * 第3轮（API iteration=2）：入选格为 GFM 方案长文；未入选格仍写入同 iteration 但沿用洞察轮六行正文。
 * 仅对真实方案长文启用 Markdown/GFM 布局，避免六行被误用白皮书样式。
 */
function useProposalMarkdownLayout(
  uiRound: number,
  content: string,
  aiChanges: string | null | undefined
): boolean {
  if (uiRound !== 3) return false
  if (
    typeof aiChanges === 'string' &&
    (aiChanges.includes('本轮未参与深度方案生成') || aiChanges.includes('保留第二轮内容'))
  ) {
    return false
  }
  if (parseIdeaSections(content) != null) return false
  return true
}

/** 池内某 idea 在指定 iteration 的排名（1 起，需有该轮版本） */
function rankAtIteration(
  pool: PoolDetail,
  ideaId: string,
  iteration: number
): number | null {
  const withScore = pool.ideas
    .map((i) => {
      const v = i.versions?.find((x) => x.iteration === iteration)
      return { ideaId: i.id, total_score: v?.total_score ?? -1 }
    })
    .filter((x) => x.total_score >= 0)
  if (!withScore.length) return null
  withScore.sort((a, b) => b.total_score - a.total_score)
  const idx = withScore.findIndex((x) => x.ideaId === ideaId)
  return idx >= 0 ? idx + 1 : null
}


interface IdeaDrawerProps {
  idea: IdeaDetail | null
  poolId: string
  poolDirection: string
  onClose: () => void
  /** 提交反馈后可选刷新池子数据以更新 user_feedback 展示 */
  onFeedbackSaved?: () => void
  /** 进入弹窗时默认选中的轮次，undefined 表示最新 */
  initialViewRound?: number | undefined
  /** 池子当前已完成的轮数，用于禁用尚未存在的轮次 */
  poolIteration?: number
  /** 池子详情，传入时可根据选中轮次计算该创意在该轮排名 */
  pool?: PoolDetail | null
  /** 打开时自动聚焦到用户指导输入区域（从卡片「留指导」入口触发时使用） */
  autoFocusFeedback?: boolean
  /** 与格子对应的主题颜色索引（0-4），传入时 emoji icon 颜色与格子保持一致 */
  colorIndex?: number
}

export default function IdeaDrawer({
  idea,
  poolId,
  poolDirection,
  onClose,
  onFeedbackSaved,
  initialViewRound,
  poolIteration = 0,
  pool,
  autoFocusFeedback,
  colorIndex,
}: IdeaDrawerProps) {
  const { t, lang } = useLanguage()
  const ROUND_TABS_I18N = [
    { iteration: 1, label: t('round1Label') },
    { iteration: 2, label: t('round2Label') },
    { iteration: 3, label: t('round3Label') },
  ]
  const [feedbackInput, setFeedbackInput] = useState('')
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false)
  const [likeSubmitting, setLikeSubmitting] = useState(false)
  const [likeError, setLikeError] = useState<string | null>(null)
  const [feedbackTextareaRef] = [useRef<HTMLTextAreaElement>(null)]

  // ── 流式生成状态（在 selectedRound 之前声明，useEffect 在其之后添加）──────
  const [streamText, setStreamText] = useState('')
  const [streamStatus, setStreamStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [streamError, setStreamError] = useState('')
  const esRef = useRef<EventSource | null>(null)

  // 当前轮次的可编辑条目列表（本地维护，初始化自 feedbackHistory 中当前轮的条目）
  const [feedbackLines, setFeedbackLines] = useState<string[]>(() =>
    (idea?.feedbackHistory ?? [])
      .filter((e) => e.atIteration === poolIteration)
      .map((e) => e.text)
  )
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [editingValue, setEditingValue] = useState('')

  /** 将当前轮条目列表同步到服务端（overwrite） */
  const syncToServer = async (lines: string[]) => {
    const text = lines.join('\n')
    await fetch(`/api/pools/${poolId}/ideas/${idea!.id}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feedback: text, append: false }),
    })
    onFeedbackSaved?.()
  }

  // 惰性初始化：与 PoolColumn 一致，当前阶段 = poolIteration + 1（poolIteration 为已完成轮数）
  const computeInitialRound = () => {
    if (!idea) return 1
    const vers = idea.versions ?? []
    const maxVer = vers.length ? Math.max(...vers.map((v) => v.iteration)) : -1
    const maxUiFromData = maxVer >= 0 ? Math.min(maxVer + 1, 3) : 1
    const inRange = (r: number) => r >= 1 && r <= 3
    if (initialViewRound !== undefined && inRange(initialViewRound)) return initialViewRound
    const p = poolIteration ?? 0
    const done = p >= 2
    const activeUi = !done && p < 2 ? p + 2 : null
    if (activeUi && inRange(activeUi)) {
      const need = versionIterationForUiRound(activeUi)
      if (vers.some((v) => v.iteration === need)) return activeUi
    }
    return inRange(maxUiFromData) ? maxUiFromData : 1
  }
  const [selectedRound, setSelectedRound] = useState<number>(computeInitialRound)

  // 正在生成的 UI 轮次（pool.status=running 时，pool.iteration 尚未递增，故 +2）
  const streamingUiRound = pool?.status === 'running' ? (pool.iteration ?? 0) + 2 : null

  // SSE 订阅：当池子运行中且当前 tab 对应正在生成的轮次时，实时推送文本增量
  useEffect(() => {
    if (!idea || pool?.status !== 'running' || streamingUiRound == null) {
      setStreamText('')
      setStreamStatus('idle')
      esRef.current?.close()
      esRef.current = null
      return
    }
    if (selectedRound !== streamingUiRound) return

    const slot = idea.slot
    const es = new EventSource(`/api/pools/${poolId}/iteration-stream?slot=${slot}`)
    esRef.current = es
    setStreamText('')
    setStreamStatus('running')
    setStreamError('')

    es.addEventListener('delta', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as { text?: string }
        if (typeof data.text === 'string') setStreamText((prev) => prev + data.text)
      } catch { /* ignore */ }
    })
    es.addEventListener('done', () => {
      setStreamStatus('done')
      es.close()
      esRef.current = null
    })
    es.addEventListener('error', (ev: MessageEvent) => {
      try {
        const data = JSON.parse(ev.data) as { message?: string }
        setStreamError(data.message ?? '生成出错')
      } catch { /* ignore */ }
      setStreamStatus('error')
      es.close()
      esRef.current = null
    })
    es.onerror = () => {
      es.close()
      esRef.current = null
    }
    return () => {
      es.close()
      esRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idea?.id, idea?.slot, pool?.status, pool?.iteration, selectedRound, streamingUiRound, poolId])

  useEffect(() => {
    setFeedbackInput('')
    setEditingIdx(null)
    setEditingValue('')
    setLikeError(null)
    setFeedbackLines(
      (idea?.feedbackHistory ?? [])
        .filter((e) => e.atIteration === poolIteration)
        .map((e) => e.text)
    )
  }, [idea?.id, poolIteration])

  useEffect(() => {
    setLikeError(null)
  }, [selectedRound])

  useEffect(() => {
    if (autoFocusFeedback && feedbackTextareaRef.current) {
      // 延迟一帧确保抽屉动画完成后再滚动并聚焦
      const t = setTimeout(() => {
        feedbackTextareaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        feedbackTextareaRef.current?.focus()
      }, 120)
      return () => clearTimeout(t)
    }
  }, [autoFocusFeedback, idea?.id])

  const versions = idea ? [...(idea.versions ?? [])].sort((a, b) => a.iteration - b.iteration) : []
  const maxIteration = versions.length ? Math.max(...versions.map((v) => v.iteration)) : 0

  const versionIterations = versions.map((v) => v.iteration).join(',')

  // 下面这些变量必须在所有 useMemo / useEffect 前计算，以满足 React Hooks 调用顺序要求
  const poolIter = poolIteration ?? 0
  /** 用户三轮：当前可编辑阶段 = 已完成用户轮次 + 1 = poolIter + 2（种子完成后下一轮是第2轮） */
  const isDone = poolIter >= 2
  const activeUiRound = !isDone && poolIter < 2 ? poolIter + 2 : null
  /** 当前是否在查看「当前阶段」（可编辑提交指导） */
  const isViewingCurrentRound = activeUiRound != null && selectedRound === activeUiRound
  const versionIterForSelected = versionIterationForUiRound(selectedRound)
  const currentVersion = versions.find((v) => v.iteration === versionIterForSelected)

  // 当切换到不同的 idea（id 变化）或 initialViewRound / 池进度 变化时，重新校准选中轮次
  useEffect(() => {
    if (!idea) return
    const vers = idea.versions ?? []
    const maxVer = vers.length ? Math.max(...vers.map((v) => v.iteration)) : -1
    const maxUiFromData = maxVer >= 0 ? Math.min(maxVer + 1, 3) : 1
    const inRange = (r: number) => r >= 1 && r <= 3
    const p = poolIteration ?? 0
    const done = p >= 2
    const activeUi = !done && p < 2 ? p + 2 : null
    let target: number
    if (initialViewRound !== undefined && inRange(initialViewRound)) {
      target = initialViewRound
    } else if (activeUi && inRange(activeUi)) {
      const need = versionIterationForUiRound(activeUi)
      target = vers.some((v) => v.iteration === need) ? activeUi : (inRange(maxUiFromData) ? maxUiFromData : 1)
    } else {
      target = inRange(maxUiFromData) ? maxUiFromData : 1
    }
    setSelectedRound(target)
  }, [idea?.id, initialViewRound, maxIteration, versionIterations, poolIteration])

  const rankAtRound = useMemo(() => {
    if (!idea || !pool?.ideas || currentVersion == null) return null
    return rankAtIteration(pool, idea.id, versionIterForSelected)
  }, [idea, pool, versionIterForSelected, currentVersion])

  const rankAtPrevRound = useMemo(() => {
    if (!idea || !pool?.ideas || selectedRound <= 1 || currentVersion == null) return null
    const prevVer = versionIterForSelected - 1
    if (prevVer < 0) return null
    const prevV = versions.find((v) => v.iteration === prevVer)
    if (!prevV) return null
    return rankAtIteration(pool!, idea.id, prevVer)
  }, [idea, pool, selectedRound, versionIterForSelected, currentVersion, versions])

  const baselineContentForSections = useMemo(() => {
    if (!idea || versionIterForSelected <= 0) return null
    return versions.find((v) => v.iteration === versionIterForSelected - 1)?.content ?? null
  }, [idea, versions, versionIterForSelected])

  const enrichedSectionKeys = useMemo(() => {
    if (!currentVersion?.content) return new Set<string>()
    return computeEnrichedSectionKeys(baselineContentForSections, currentVersion.content)
  }, [baselineContentForSections, currentVersion?.content])

  const historyFeedbackForSelectedRound: FeedbackEntry[] = useMemo(() => {
    if (!idea || isViewingCurrentRound || selectedRound <= 1) return []
    const atIter = selectedRound - 2
    return (idea.feedbackHistory ?? [])
      .filter((e) => e.atIteration === atIter)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }, [idea, selectedRound, isViewingCurrentRound])

  /** 当前待迭代的指导是否已被下一轮采纳 */
  const feedbackAlreadyAdopted = useMemo(() => {
    if (!feedbackLines.length) return false
    const adoptedInIteration = poolIteration + 1
    const adoptedVersion = versions.find((v) => v.iteration === adoptedInIteration)
    return !!(adoptedVersion?.ai_changes?.includes('用户指导已采纳'))
  }, [feedbackLines.length, poolIteration, versions])

  if (!idea) return null

  const downloadMarkdown = () => {
    if (!currentVersion) return
    const safeKeyword = (pool?.keyword ?? poolDirection ?? 'idea').replace(/[\\/:*?"<>|]/g, '-').slice(0, 40)
    const blob = new Blob([currentVersion.content], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${safeKeyword}-slot-${idea.slot}-round-${selectedRound}.md`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  /** 名次变好：数字变小。rankDelta = 上一轮名次 − 当前名次，正数表示上升 */
  const rankDelta =
    rankAtPrevRound != null && rankAtRound != null ? rankAtPrevRound - rankAtRound : null

  const displayRank = rankAtRound ?? idea.rank

  /** 当前轮次的 ai_changes 是否包含「用户指导已采纳」标记 */
  const feedbackAdoptedInRound = !!(currentVersion?.ai_changes?.includes('用户指导已采纳'))

  const likedRounds = idea.liked_rounds ?? []
  const likeBonusTotal = likedRounds.length * 3
  const poolRunning = pool?.status === 'running'
  /**
   * 此前用 selectedRound === activeUiRound 才显示输入框：种子完成后必须点到「第2轮」、第一轮迭代后必须点到「第3轮」才能提交，留在「第1轮」时输入区被隐藏，易被误认为「提交不了」。
   * 现在在「可指导下轮」阶段一律显示编辑区；迭代运行中禁用，避免与生成冲突。
   */
  const showFeedbackEditor = activeUiRound != null && !poolRunning
  const poolDoneIter = pool?.iteration ?? 0
  const hasVersionForSelectedRound = versions.some(
    (v) => v.iteration === versionIterForSelected
  )
  const selectedRoundEnded = poolDoneIter >= selectedRound - 1
  const canLikeThisRound =
    !!pool &&
    !poolRunning &&
    hasVersionForSelectedRound &&
    selectedRoundEnded
  const likedThisRound = likedRounds.includes(selectedRound)

  const handleLikeRound = async () => {
    if (!canLikeThisRound || likedThisRound || likeSubmitting) return
    setLikeSubmitting(true)
    setLikeError(null)
    try {
      const res = await fetch(`/api/pools/${poolId}/ideas/${idea.id}/like`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uiRound: selectedRound }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (res.ok) {
        onFeedbackSaved?.()
      } else {
        setLikeError(typeof data?.error === 'string' ? data.error : '点赞失败')
      }
    } finally {
      setLikeSubmitting(false)
    }
  }

  const handleSubmitFeedback = async () => {
    const text = feedbackInput.trim()
    if (!text) return
    setFeedbackSubmitting(true)
    try {
      const res = await fetch(`/api/pools/${poolId}/ideas/${idea.id}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedback: text, append: true }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (res.ok) {
        setFeedbackLines((prev) => [...prev, text])
        setFeedbackInput('')
        onFeedbackSaved?.()
      } else {
        console.warn('[IdeaDrawer] feedback POST failed', res.status, data)
      }
    } finally {
      setFeedbackSubmitting(false)
    }
  }

  const handleDeleteLine = async (idx: number) => {
    const next = feedbackLines.filter((_, i) => i !== idx)
    setFeedbackLines(next)
    await syncToServer(next)
  }

  const handleSaveEdit = async (idx: number) => {
    const trimmed = editingValue.trim()
    if (!trimmed) { handleDeleteLine(idx); return }
    const next = feedbackLines.map((v, i) => (i === idx ? trimmed : v))
    setFeedbackLines(next)
    setEditingIdx(null)
    await syncToServer(next)
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
        onClick={onClose}
      />
      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-full max-w-lg bg-zinc-900 border-l border-zinc-800 z-50 flex flex-col overflow-hidden animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-3 min-w-0">
            {/* 格子头像（与 IdeaCard 一致，colorIndex 有值时用主题色） */}
            <div className={cn(
              'shrink-0 w-9 h-9 rounded-xl flex items-center justify-center',
              colorIndex != null
                ? POOL_THEMES[colorIndex % POOL_THEMES.length].gradient
                : iconGradient(idea.id)
            )}>
              <span className="text-xl select-none leading-none">{pickIcon(idea.id)}</span>
            </div>
            <h2 className="text-sm font-semibold text-zinc-100 truncate leading-snug min-w-0">
              {pool?.keyword ?? poolDirection ?? '—'}
            </h2>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {currentVersion && selectedRound === 3 && (
              <button
                type="button"
                onClick={downloadMarkdown}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-zinc-700 bg-zinc-800/70 text-[11px] text-zinc-300 hover:text-zinc-100 hover:border-violet-500/40 hover:bg-zinc-800"
              >
                <Download size={14} />
                导出 Markdown
              </button>
            )}
            <button
              onClick={onClose}
              className="shrink-0 p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* 轮次进度（与主页池子样式一致：胶囊 + 渐变连接线） */}
        <div className="px-5 pt-3 pb-3">
          <div className="flex items-center w-full min-w-0" role="tablist">
            {ROUND_TABS_I18N.map(({ iteration, label }, i) => {
              const hasVersion = versions.some((v) => v.iteration === versionIterationForUiRound(iteration))
              const isStreaming = iteration === streamingUiRound
              const canShow = hasVersion || isStreaming
              const isActive = selectedRound === iteration
              const isDonePhase = hasVersion && !isActive
              const isLast = i === ROUND_TABS_I18N.length - 1
              return (
                <div key={iteration} className={cn('flex items-center min-w-0', isLast ? 'shrink-0' : 'flex-1')}>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    disabled={!canShow}
                    onClick={() => canShow && setSelectedRound(iteration)}
                    className={cn(
                      'shrink-0 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all duration-200 whitespace-nowrap flex items-center gap-1',
                      isDonePhase
                        ? 'bg-violet-600 text-white shadow-sm shadow-violet-900/50 cursor-pointer hover:bg-violet-500 hover:shadow-violet-600/60 hover:scale-105'
                        : isActive
                          ? 'bg-indigo-500/15 border border-indigo-400/60 text-indigo-300'
                          : isStreaming
                            ? 'bg-amber-500/10 border border-amber-500/40 text-amber-300 cursor-pointer hover:bg-amber-500/20'
                            : 'bg-zinc-800/60 border border-zinc-700/50 text-zinc-500 cursor-not-allowed'
                    )}
                  >
                    {label}
                    {isStreaming && !hasVersion && (
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                    )}
                  </button>
                  {!isLast && (
                    <div className="relative flex-1 min-w-[8px] h-[2px] mx-1.5 rounded-full overflow-hidden bg-zinc-800">
                      <div
                        className="absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-violet-600 to-violet-400 transition-[width] duration-700"
                        style={{ width: hasVersion ? '100%' : isStreaming ? '40%' : '0%' }}
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* 项目细节 + 参考文件 */}
        {(pool?.description || (pool?.attachments?.length ?? 0) > 0) && (
          <div className="px-5 py-3">
            <div className="rounded-xl border border-zinc-800 bg-zinc-800/50 p-3 space-y-3">
              {pool?.description && (
                <div className="min-w-0 overflow-hidden">
                  <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">项目细节</div>
                  <p className="text-xs text-zinc-400 leading-relaxed line-clamp-3 break-words">{pool.description}</p>
                </div>
              )}
              {(pool?.attachments?.length ?? 0) > 0 && (
                <div className={pool?.description ? 'pt-2 border-t border-zinc-700/50' : ''}>
                  <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">参考文件</div>
                  <ul className="space-y-1.5">
                    {(pool?.attachments ?? []).map((a, i) => (
                      <li key={`${a.name}-${i}`} className="flex items-center gap-2 text-[11px] text-zinc-400 py-0.5">
                        <Paperclip size={10} className="text-zinc-500 shrink-0" />
                        <span className="truncate">{a.name}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 单轮内容 */}
        <div className="flex-1 overflow-y-auto px-5 pt-3 pb-5">
          {/* 流式生成过程展示（无版本时显示；有版本后由版本内容接管） */}
          {!currentVersion && selectedRound === streamingUiRound && (
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4 mb-3">
              <div className="flex items-center gap-2 mb-3">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
                <span className="text-[11px] font-semibold text-amber-300 uppercase tracking-wide leading-snug">
                  {streamStatus === 'error'
                    ? t('streamError')
                    : streamingUiRound === 2
                      ? t('insightDeepeningStatus', Math.min(9, pool?.ideas?.length ?? 9))
                      : t('generating')}
                </span>
              </div>
              {streamStatus === 'error' ? (
                <p className="text-xs text-rose-400">{streamError || t('unknownError')}</p>
              ) : streamText ? (
                <>
                  {selectedRound === 3 ? (
                    <div className="text-sm leading-relaxed">
                      <MarkdownContent content={streamText} hideRefSection proposalReportLayout />
                    </div>
                  ) : (
                    <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap font-mono">
                      {streamText}
                    </p>
                  )}
                  {streamStatus === 'running' && (
                    <span className="inline-block w-0.5 h-4 bg-amber-400 ml-0.5 animate-pulse align-text-bottom" />
                  )}
                </>
              ) : (
                <div className="flex gap-1.5 items-center">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-500/70 animate-bounce [animation-delay:0ms]" />
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-500/70 animate-bounce [animation-delay:150ms]" />
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-500/70 animate-bounce [animation-delay:300ms]" />
                </div>
              )}
            </div>
          )}
          {!currentVersion && selectedRound !== streamingUiRound && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-800/30 p-8 text-center">
              <p className="text-sm text-zinc-500">{t('notGenerated')}</p>
            </div>
          )}
          {currentVersion && (
            <div className="rounded-xl border border-violet-500/30 bg-violet-500/10 p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-base font-bold text-zinc-300 tabular-nums shrink-0">
                  {displayRank != null ? t('rankOrdinal', displayRank) : '—'}
                </span>
                <div className="flex items-center justify-end gap-2">
                  {rankDelta != null && (
                    rankDelta !== 0 ? (
                      <span
                        className={cn(
                          'text-[11px] font-medium',
                          rankDelta > 0 ? 'text-emerald-400' : 'text-rose-400'
                        )}
                      >
                        {rankDelta > 0
                          ? t('rankUp', rankDelta)
                          : t('rankDown', Math.abs(rankDelta))}
                      </span>
                    ) : selectedRound > 0 && rankAtRound != null && rankAtPrevRound != null ? (
                      <span className="text-[11px] text-zinc-500">{t('rankUnchanged')}</span>
                    ) : null
                  )}
                </div>
              </div>
              <IdeaContentBlock
                content={currentVersion?.content ?? ''}
                preferMarkdown={useProposalMarkdownLayout(
                  selectedRound,
                  currentVersion?.content ?? '',
                  currentVersion?.ai_changes
                )}
                enrichedSectionKeys={enrichedSectionKeys}
                enrichedBadgeTitle={t('sectionNewThisRound')}
                baselineContent={baselineContentForSections}
                showLogicDelta={versionIterForSelected > 0 && !!baselineContentForSections}
              />
              <div className="grid gap-2 items-stretch grid-cols-[1fr_1fr_1fr_auto]">
                <ScorePill label={t('scoreInnovationFull')} score={currentVersion.score_innovation ?? 0} weight="40%" />
                <ScorePill label={t('scoreFeasibilityFull')} score={currentVersion.score_feasibility ?? 0} weight="40%" />
                <ScorePill label={t('scoreImpactFull')} score={currentVersion.score_impact ?? 0} weight="20%" />
                <div className="flex flex-col justify-start rounded-lg bg-zinc-900/60 px-2.5 py-2 min-w-[60px] text-center">
                  <span className={cn('text-sm font-bold tabular-nums', scoreColor(currentVersion.total_score ?? 0))}>
                    {formatScore(currentVersion.total_score)}
                  </span>
                  <div className="text-[10px] text-zinc-500">{t('totalScore')}</div>
                  <div className="text-[9px] invisible select-none">0%</div>
                </div>
              </div>
              {likeBonusTotal > 0 && (
                <p className="mt-2 text-[11px] text-rose-300/90">
                  {t('likeBonusNote', likeBonusTotal)}
                </p>
              )}
              {canLikeThisRound && (
                <div className="mt-3 flex flex-col gap-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleLikeRound}
                      disabled={likedThisRound || likeSubmitting}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors border',
                        likedThisRound
                          ? 'border-rose-500/40 bg-rose-500/15 text-rose-300 cursor-default'
                          : 'border-zinc-600 bg-zinc-800/80 text-zinc-200 hover:border-rose-500/50 hover:bg-rose-500/10 hover:text-rose-200 disabled:opacity-50'
                      )}
                      aria-label={likedThisRound ? t('likedWithBonus') : t('likeThisRound')}
                    >
                      <Heart className={cn('w-4 h-4 shrink-0', likedThisRound && 'fill-current')} />
                      {likedThisRound ? t('likedWithBonus') : likeSubmitting ? '…' : t('likeThisRound')}
                    </button>
                    {!likedThisRound && (
                      <span className="text-[10px] text-zinc-500">{t('likeOnce')}</span>
                    )}
                  </div>
                  {likeError && (
                    <p className="text-[11px] text-amber-400/95">{likeError}</p>
                  )}
                </div>
              )}
              {feedbackAdoptedInRound && (
                <div className="mt-3 flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
                  <span className="shrink-0 font-semibold">✓</span>
                  <span>{t('feedbackAdopted')}</span>
                </div>
              )}
              {currentVersion.ai_changes && (
                <div className="mt-2 text-xs text-zinc-400 bg-zinc-900/60 rounded-lg px-3 py-2">
                  <span className="text-zinc-500 font-medium">{t('roundChangeSummaryFull')}</span>{' '}
                  {currentVersion.ai_changes.replace(/^【用户指导已采纳】/, '').trim()}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 用户指导 */}
        <div className="border-t border-zinc-800 p-5 bg-zinc-900/80 shrink-0">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-medium text-zinc-300">
              {showFeedbackEditor ? t('userGuidance') : t('roundGuidance', selectedRound)}
            </span>
            {showFeedbackEditor && feedbackAlreadyAdopted && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 font-medium">
                {t('adoptedBadge')}
              </span>
            )}
            {showFeedbackEditor && feedbackLines.length === 0 && (
              <span className="text-[10px] text-zinc-600">{t('nextRoundWillUse')}</span>
            )}
            {!showFeedbackEditor && historyFeedbackForSelectedRound.length === 0 && (
              <span className="text-[10px] text-zinc-600">{t('noGuidanceForRound')}</span>
            )}
          </div>

          {showFeedbackEditor ? (
            <>
              {!isViewingCurrentRound && activeUiRound != null && (
                <p className="text-[10px] text-amber-400/90 leading-relaxed mb-3">
                  {t('viewingOtherRoundHint', selectedRound, activeUiRound)}
                </p>
              )}
              {/* 查看非「当前进度」轮次时，仍可只读展示该轮曾提交的指导 */}
              {!isViewingCurrentRound && historyFeedbackForSelectedRound.length > 0 && (
                <div className="flex flex-col gap-1.5 mb-3">
                  <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">{t('historyGuidance', selectedRound)}</span>
                  {historyFeedbackForSelectedRound.map((entry, idx) => (
                    <div
                      key={idx}
                      className="text-xs text-violet-300/70 bg-violet-500/5 border border-violet-500/15 rounded-lg px-2.5 py-2 leading-relaxed"
                    >
                      {entry.text}
                    </div>
                  ))}
                </div>
              )}
              {/* 当前轮可编辑条目列表 */}
              {feedbackLines.length > 0 && (
                <div className="flex flex-col gap-1.5 mb-3">
                  {feedbackLines.map((line, idx) => (
                    <div key={idx}>
                      {editingIdx === idx ? (
                        <div className="flex gap-1.5">
                          <input
                            autoFocus
                            type="text"
                            value={editingValue}
                            onChange={(e) => setEditingValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveEdit(idx)
                              if (e.key === 'Escape') setEditingIdx(null)
                            }}
                            className="flex-1 min-w-0 rounded-lg border border-violet-500/50 bg-violet-500/10 text-violet-100 text-xs px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-violet-500"
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveEdit(idx)}
                            className="shrink-0 text-[10px] px-2 py-1 rounded-lg bg-violet-600 text-white hover:bg-violet-500"
                          >
                            {t('save')}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingIdx(null)}
                            className="shrink-0 text-[10px] px-2 py-1 rounded-lg border border-zinc-700 text-zinc-400 hover:text-zinc-200"
                          >
                            {t('cancelLabel')}
                          </button>
                        </div>
                      ) : (
                        <div className="group flex items-start gap-1.5 text-xs text-violet-400 bg-violet-500/10 border border-violet-500/20 rounded-lg px-2.5 py-2">
                          <span className="flex-1 min-w-0 leading-relaxed">{line}</span>
                          <button
                            type="button"
                            onClick={() => { setEditingIdx(idx); setEditingValue(line) }}
                            className="shrink-0 opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-zinc-300 transition-opacity text-[10px] px-1"
                            title={t('editLabel')}
                          >
                            {t('editLabel')}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteLine(idx)}
                            className="shrink-0 opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-rose-400 transition-opacity px-1"
                            title="删除"
                          >
                            ×
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {/* 快捷标签 */}
              <div className="flex flex-wrap gap-1.5 mb-2">
                {(lang === 'en'
                  ? ['Strengthen feasibility', 'Boost innovation', 'Add metrics', 'Simplify', 'Weak impact']
                  : ['强化可行性', '提升创新性', '补充量化指标', '简化表述', '影响力太弱']
                ).map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setFeedbackInput((prev) => prev ? `${prev}，${tag}` : tag)}
                    className="text-[10px] px-2 py-0.5 rounded-full border border-zinc-700 bg-zinc-800 text-zinc-400 hover:border-violet-500/50 hover:text-violet-300 hover:bg-violet-500/10 transition-colors"
                  >
                    {tag}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <textarea
                  ref={feedbackTextareaRef}
                  value={feedbackInput}
                  onChange={(e) => setFeedbackInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmitFeedback()
                  }}
                  placeholder={t('guidancePlaceholderFull')}
                  className="flex-1 min-h-[60px] rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-100 text-sm px-3 py-2 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
                  rows={2}
                />
                <button
                  type="button"
                  onClick={handleSubmitFeedback}
                  disabled={feedbackSubmitting || !feedbackInput.trim()}
                  className="shrink-0 self-end px-3 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {feedbackSubmitting ? '…' : t('submit')}
                </button>
              </div>
            </>
          ) : (
            <>
              {/* 历史轮次：只读展示该轮对应的历史指导 */}
              {historyFeedbackForSelectedRound.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  {historyFeedbackForSelectedRound.map((entry, idx) => (
                    <div
                      key={idx}
                      className="text-xs text-violet-300/70 bg-violet-500/5 border border-violet-500/15 rounded-lg px-2.5 py-2 leading-relaxed"
                    >
                      {entry.text}
                    </div>
                  ))}
                </div>
              ) : (
                isDone && selectedRound === 3 ? (
                  <p className="text-[11px] text-zinc-600">所有轮次已完成，指导记录为空</p>
                ) : null
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}

function ScorePill({ label, score, weight }: { label: string; score: number; weight: string }) {
  const n = score ?? 0
  return (
    <div className="flex flex-col justify-start bg-zinc-900/60 rounded-lg px-2.5 py-2 text-center">
      <div className={cn('text-sm font-bold tabular-nums', scoreColor(n))}>{n}</div>
      <div className="text-[10px] text-zinc-500">{label}</div>
      <div className="text-[9px] text-zinc-600">{weight}</div>
    </div>
  )
}
