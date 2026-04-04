'use client'

import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

const DEFAULT_MAX_CAPTION_LEN = 128
const DEFAULT_CHAR_MS = 88
const DEFAULT_PAUSE_BEFORE_RESTART_MS = 4800

function normalizeCaption(raw: string, maxLen: number): string {
  const t = raw.replace(/\s+/g, ' ').trim()
  if (!t) return '创意池'
  return t.length > maxLen ? t.slice(0, maxLen) + '…' : t
}

function timingFromSeed(seed: number) {
  const s = seed >>> 0
  return {
    charMs: 58 + (s % 56),
    pauseMs: 3200 + ((s >>> 4) % 3600),
    initialExtraMs: s % 1000,
  }
}

/** 注入迭代模式 CSS（每个 contentDocument 只注入一次） */
function ensureIteratingStyles(doc: Document): void {
  if (doc.getElementById('jiq-iterating-screen-styles')) return
  const style = doc.createElement('style')
  style.id = 'jiq-iterating-screen-styles'
  style.textContent = `
    #jiqiren-typewriter-host.jiq-mode-iterating {
      display: flex !important;
      flex-direction: column;
      justify-content: center;
      gap: 10px;
      padding: 12px 16px !important;
      background: linear-gradient(135deg, rgba(93,12,180,0.08) 0%, rgba(120,40,220,0.04) 100%);
      border-radius: 4px;
      overflow: hidden;
      position: relative;
    }

    /* 横向扫光 */
    #jiqiren-typewriter-host.jiq-mode-iterating::before {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(90deg, transparent 0%, rgba(160,100,255,0.08) 50%, transparent 100%);
      background-size: 200% 100%;
      animation: jiq-sweep 2.4s linear infinite;
      pointer-events: none;
    }

    @keyframes jiq-sweep {
      0%   { background-position: -100% 0; }
      100% { background-position: 200%  0; }
    }

    /* 主状态行 */
    .jiq-iter-main {
      font-size: 17px;
      font-weight: 700;
      letter-spacing: 0.03em;
      color: rgba(210, 180, 255, 0.92);
      text-shadow:
        0 0 8px rgba(180, 120, 255, 0.9),
        0 0 20px rgba(130,  60, 220, 0.6);
      animation: jiq-neon-pulse 2s ease-in-out infinite;
      font-family: ui-monospace, monospace;
      line-height: 1.3;
      position: relative;
    }

    @keyframes jiq-neon-pulse {
      0%, 100% {
        text-shadow:
          0 0 6px  rgba(180,120,255,0.85),
          0 0 18px rgba(130, 60,220,0.55);
        opacity: 1;
      }
      50% {
        text-shadow:
          0 0 12px rgba(200,150,255,1),
          0 0 30px rgba(160, 80,255,0.8),
          0 0 48px rgba(100, 30,200,0.4);
        opacity: 0.92;
      }
    }

    /* 副行：伪终端 */
    .jiq-iter-sub {
      font-size: 12px;
      font-family: ui-monospace, 'Cascadia Code', monospace;
      color: rgba(160, 210, 255, 0.65);
      letter-spacing: 0.06em;
      display: flex;
      align-items: center;
      gap: 3px;
      line-height: 1;
    }

    .jiq-iter-sub .jiq-prompt {
      color: rgba(130, 255, 160, 0.70);
      margin-right: 4px;
    }

    /* 三点 stagger 闪烁 */
    .jiq-dot {
      display: inline-block;
      width: 4px;
      height: 4px;
      border-radius: 50%;
      background: rgba(160, 210, 255, 0.7);
      animation: jiq-dot-blink 1.2s ease-in-out infinite;
    }
    .jiq-dot:nth-child(2) { animation-delay: 0.2s; }
    .jiq-dot:nth-child(3) { animation-delay: 0.4s; }

    @keyframes jiq-dot-blink {
      0%, 80%, 100% { opacity: 0.2; transform: scaleY(0.7); }
      40%           { opacity: 1;   transform: scaleY(1); }
    }

    /* 进度条扫描线 */
    .jiq-iter-bar {
      height: 2px;
      border-radius: 2px;
      background: linear-gradient(90deg,
        rgba(93,12,180,0.15) 0%,
        rgba(160,80,255,0.85) 50%,
        rgba(93,12,180,0.15) 100%
      );
      background-size: 200% 100%;
      animation: jiq-bar-scan 1.8s linear infinite;
      margin-top: 4px;
    }

    @keyframes jiq-bar-scan {
      0%   { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
  `
  ;(doc.head || doc.documentElement).appendChild(style)
}

/** 向 host 写入迭代态 DOM */
function renderIteratingContent(
  doc: Document,
  host: Element,
  label: string
): void {
  host.classList.add('jiq-mode-iterating')

  const main = doc.createElement('div')
  main.className = 'jiq-iter-main'
  main.textContent = label

  const sub = doc.createElement('div')
  sub.className = 'jiq-iter-sub'
  const prompt = doc.createElement('span')
  prompt.className = 'jiq-prompt'
  prompt.textContent = '>'
  sub.appendChild(prompt)
  const genText = doc.createTextNode('generating')
  sub.appendChild(genText)
  for (let i = 0; i < 3; i++) {
    const dot = doc.createElement('span')
    dot.className = 'jiq-dot'
    sub.appendChild(dot)
  }

  const bar = doc.createElement('div')
  bar.className = 'jiq-iter-bar'

  host.replaceChildren(main, sub, bar)
}

/**
 * 通过 <object> 加载指定机器人 SVG，在 SVG 内 #jiqiren-typewriter-host 上逐字呈现池子文案（若 SVG 无该元素则静默跳过）。
 * 当 iterating=true 时切换为霓虹迭代态屏显，停止打字机循环。
 */
export const JiqirenWithText = memo(function JiqirenWithText({
  typewriterText,
  className,
  svgSrc = '/jiqiren01.svg',
  typewriterSeed,
  maxCaptionLen = DEFAULT_MAX_CAPTION_LEN,
  iterating = false,
  iteratingLabel = '优化中…',
}: {
  typewriterText: string
  className?: string
  /** SVG 文件路径，根据容器颜色传入对应机器人 SVG */
  svgSrc?: string
  /** 传入稳定种子后，每格打字间隔、停顿、首字延迟会不同，避免九宫格完全同步 */
  typewriterSeed?: number
  /** 打字机文案最大字符数（详细正文时可略增大） */
  maxCaptionLen?: number
  /** 迭代进行中：切换为迭代屏显模式，停止打字机 */
  iterating?: boolean
  /** 迭代模式下屏幕主文案，如「第 N 轮优化中」 */
  iteratingLabel?: string
}) {
  const objRef = useRef<HTMLObjectElement>(null)
  const [docReady, setDocReady] = useState(false)
  const caption = useMemo(
    () => normalizeCaption(typewriterText, maxCaptionLen),
    [typewriterText, maxCaptionLen]
  )
  const chars = useMemo(() => Array.from(caption), [caption])
  const [charIndex, setCharIndex] = useState(0)

  const timing = useMemo(() => {
    if (typewriterSeed === undefined) {
      return {
        charMs: DEFAULT_CHAR_MS,
        pauseMs: DEFAULT_PAUSE_BEFORE_RESTART_MS,
        initialExtraMs: 0,
      }
    }
    return timingFromSeed(typewriterSeed)
  }, [typewriterSeed])

  useEffect(() => {
    const el = objRef.current
    if (!el) return

    const tryReady = () => {
      try {
        const d = el.contentDocument
        if (d?.getElementById('jiqiren-typewriter-host')) setDocReady(true)
      } catch {
        /* cross-origin */
      }
    }

    tryReady()
    el.addEventListener('load', tryReady)
    return () => el.removeEventListener('load', tryReady)
  }, [])

  useEffect(() => {
    setCharIndex(0)
  }, [caption])

  // 迭代态：注入样式 + 渲染迭代 DOM
  useEffect(() => {
    if (!docReady || !iterating) return
    const el = objRef.current
    let doc: Document | null = null
    try {
      doc = el?.contentDocument ?? null
    } catch {
      return
    }
    const host = doc?.getElementById('jiqiren-typewriter-host')
    if (!host || !doc) return

    ensureIteratingStyles(doc)
    renderIteratingContent(doc, host, iteratingLabel)
  }, [docReady, iterating, iteratingLabel])

  // 闲置态：普通打字机 DOM 更新（iterating 时跳过）
  useEffect(() => {
    if (!docReady || iterating) return
    const el = objRef.current
    let doc: Document | null = null
    try {
      doc = el?.contentDocument ?? null
    } catch {
      return
    }
    const host = doc?.getElementById('jiqiren-typewriter-host')
    if (!host || !doc) return

    // 从迭代态恢复时移除 class
    host.classList.remove('jiq-mode-iterating')

    host.replaceChildren()
    const text = chars.slice(0, charIndex).join('')
    host.appendChild(doc.createTextNode(text))

    const typing = charIndex < chars.length
    if (typing) {
      const caret = doc.createElement('span')
      caret.className = 'jiq-caret'
      caret.textContent = '▍'
      caret.setAttribute('aria-hidden', 'true')
      host.appendChild(caret)
    }
  }, [docReady, iterating, charIndex, chars])

  // 打字机计时（iterating 时不推进 charIndex）
  useEffect(() => {
    if (!docReady || iterating) return
    if (charIndex >= chars.length) {
      const t = window.setTimeout(() => setCharIndex(0), timing.pauseMs)
      return () => window.clearTimeout(t)
    }
    const stepMs =
      charIndex === 0 ? timing.charMs + timing.initialExtraMs : timing.charMs
    const t = window.setTimeout(() => setCharIndex((n) => n + 1), stepMs)
    return () => window.clearTimeout(t)
  }, [docReady, iterating, charIndex, chars.length, timing.charMs, timing.pauseMs, timing.initialExtraMs])

  return (
    <object
      ref={objRef}
      type="image/svg+xml"
      data={svgSrc}
      className={cn('pointer-events-none select-none', className)}
      aria-hidden
      tabIndex={-1}
    />
  )
})
