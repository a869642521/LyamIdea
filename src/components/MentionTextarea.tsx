'use client'
import { useRef, useState, useCallback, useEffect, useLayoutEffect } from 'react'
import { cn } from '@/lib/utils'
import { FileText, Image as ImageIcon } from 'lucide-react'

interface MentionFile {
  name: string
}

interface MentionTextareaProps {
  value: string
  onChange: (v: string) => void
  mentionFiles: MentionFile[]
  placeholder?: string
  maxLength?: number
  rows?: number
  disabled?: boolean
  className?: string
  showCount?: boolean
  /** 粘贴图片/文件时的回调，不传则图片会被忽略 */
  onPasteFiles?: (files: File[]) => void
}

/** 将文件名编码为 mention token：含空格时加引号 */
function encodeMention(name: string): string {
  return name.includes(' ') ? `@"${name}"` : `@${name}`
}

function fileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext)) return 'image'
  return 'file'
}

/**
 * 使用原生 textarea，避免 contentEditable + 手写 DOM 与 React 19 协调冲突（removeChild 等）。
 * @引用 以纯文本形式插入（@文件名 或 @"文件名 含空格"）。
 */
export default function MentionTextarea({
  value,
  onChange,
  mentionFiles,
  placeholder,
  maxLength = 400,
  rows = 3,
  disabled,
  className,
  showCount = false,
  onPasteFiles,
}: MentionTextareaProps) {
  const taRef = useRef<HTMLTextAreaElement>(null)
  const dropdownRef = useRef<HTMLUListElement>(null)
  const isComposingRef = useRef(false)
  const mentionStartRef = useRef(-1)
  /** onChange 后恢复光标（受控 textarea 在部分情况下需手动恢复） */
  const cursorRestoreRef = useRef<{ start: number; end: number } | null>(null)

  const [query, setQuery] = useState<string | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)

  const filtered =
    query === null
      ? []
      : mentionFiles
          .filter((f) => f.name.toLowerCase().includes(query.toLowerCase()))
          .slice(0, 6)

  const updateMentionQuery = useCallback(
    (str: string, cursor: number) => {
      const textBefore = str.slice(0, cursor)
      const atIdx = textBefore.lastIndexOf('@')
      if (atIdx >= 0 && mentionFiles.length > 0) {
        mentionStartRef.current = atIdx
        setQuery(textBefore.slice(atIdx + 1))
        setActiveIndex(0)
      } else {
        setQuery(null)
      }
    },
    [mentionFiles.length]
  )

  useLayoutEffect(() => {
    const ta = taRef.current
    const r = cursorRestoreRef.current
    if (!ta || !r) return
    try {
      const max = value.length
      const s = Math.min(r.start, max)
      const e = Math.min(r.end, max)
      ta.setSelectionRange(s, e)
    } catch {
      /* ignore */
    }
    cursorRestoreRef.current = null
  }, [value])

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      let str = e.target.value
      if (maxLength && str.length > maxLength) str = str.slice(0, maxLength)
      const cursor = e.target.selectionStart ?? str.length
      // 始终更新 value（即使在 IME 组合期间），防止 React re-render 把 DOM 重置为旧值
      onChange(str)
      // 仅在 IME 组合结束后更新 mention 下拉，避免干扰输入法候选框
      if (!isComposingRef.current) {
        updateMentionQuery(str, cursor)
      }
    },
    [onChange, maxLength, updateMentionQuery]
  )

  const handleCompositionEnd = useCallback(
    (e: React.CompositionEvent<HTMLTextAreaElement>) => {
      isComposingRef.current = false
      let str = e.currentTarget.value
      if (maxLength && str.length > maxLength) str = str.slice(0, maxLength)
      const cursor = e.currentTarget.selectionStart ?? str.length
      onChange(str)
      updateMentionQuery(str, cursor)
    },
    [onChange, maxLength, updateMentionQuery]
  )

  const insertMention = useCallback(
    (file: MentionFile) => {
      const ta = taRef.current
      const start = mentionStartRef.current
      if (start < 0) return
      const cursor = ta?.selectionStart ?? value.length
      const token = encodeMention(file.name) + ' '
      const newStr = value.slice(0, start) + token + value.slice(cursor)
      const capped = maxLength ? newStr.slice(0, maxLength) : newStr
      const pos = Math.min(start + token.length, capped.length)
      cursorRestoreRef.current = { start: pos, end: pos }
      onChange(capped)
      setQuery(null)
      mentionStartRef.current = -1
    },
    [value, onChange, maxLength]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (query !== null && filtered.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setActiveIndex((i) => Math.min(i + 1, filtered.length - 1))
          return
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          setActiveIndex((i) => Math.max(i - 1, 0))
          return
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault()
          if (filtered[activeIndex]) insertMention(filtered[activeIndex])
          return
        }
        if (e.key === 'Escape') {
          setQuery(null)
        }
      }
    },
    [query, filtered, activeIndex, insertMention]
  )

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const items = Array.from(e.clipboardData.items)
      const fileItems = items.filter(
        (item) => item.kind === 'file' && (item.type.startsWith('image/') || item.type === 'application/octet-stream')
      )
      if (fileItems.length > 0) {
        e.preventDefault()
        if (onPasteFiles) {
          const files = fileItems.map((item) => item.getAsFile()).filter((f): f is File => f !== null)
          if (files.length > 0) onPasteFiles(files)
        }
        return
      }
      if (!maxLength) return
      e.preventDefault()
      const text = e.clipboardData.getData('text/plain')
      if (!text) return
      const ta = taRef.current
      if (!ta) return
      const start = ta.selectionStart
      const end = ta.selectionEnd
      const newStr = value.slice(0, start) + text + value.slice(end)
      const capped = newStr.slice(0, maxLength)
      const pos = Math.min(start + text.length, capped.length)
      cursorRestoreRef.current = { start: pos, end: pos }
      onChange(capped)
      updateMentionQuery(capped, pos)
    },
    [onPasteFiles, maxLength, value, onChange, updateMentionQuery]
  )

  const syncQueryFromCaret = useCallback(() => {
    const ta = taRef.current
    if (!ta || isComposingRef.current) return
    updateMentionQuery(ta.value, ta.selectionStart)
  }, [updateMentionQuery])

  useEffect(() => {
    if (query === null) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (!taRef.current?.contains(target) && !dropdownRef.current?.contains(target)) setQuery(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [query])

  const charCount = value.length

  return (
    <div className="relative w-full min-w-0 overflow-hidden">
      <textarea
        ref={taRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onSelect={syncQueryFromCaret}
        onClick={syncQueryFromCaret}
        onCompositionStart={() => { isComposingRef.current = true }}
        onCompositionEnd={handleCompositionEnd}
        disabled={disabled}
        placeholder={placeholder}
        rows={rows}
        aria-label={placeholder}
        spellCheck
        className={cn(
          'mention-editor w-full rounded-xl px-3 py-2.5 text-[11px] text-zinc-200',
          'bg-zinc-900/60 border border-zinc-800/60',
          'focus:outline-none focus:border-violet-500/50',
          'transition-colors disabled:opacity-50 resize-none',
          className
        )}
        style={{ minHeight: rows * 24 + 20, maxHeight: rows * 24 + 20, overflowY: 'auto' }}
      />

      {showCount && maxLength ? (
        <div className="flex justify-end mt-1">
          <span className="text-[10px] text-zinc-700 tabular-nums">
            {charCount}/{maxLength}
          </span>
        </div>
      ) : null}

      {query !== null && filtered.length > 0 ? (
        <ul
          ref={dropdownRef}
          className="absolute left-0 right-0 z-[60] mt-1 rounded-xl border border-zinc-700/60 bg-zinc-950/95 backdrop-blur-sm shadow-xl shadow-black/40 overflow-hidden animate-fade-in"
          role="listbox"
        >
          <li className="px-3 py-1.5 flex items-center gap-1.5 border-b border-zinc-800/60">
            <span className="text-[10px] text-zinc-500">选择要引用的文件</span>
            {query ? <span className="text-[10px] text-violet-400 font-mono">@{query}</span> : null}
          </li>
          {filtered.map((f, i) => (
            <li
              key={f.name}
              role="option"
              aria-selected={i === activeIndex}
              onMouseEnter={() => setActiveIndex(i)}
              onMouseDown={(e) => {
                e.preventDefault()
                insertMention(f)
              }}
              className={cn(
                'flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors text-[11px]',
                i === activeIndex ? 'bg-violet-600/20 text-zinc-100' : 'text-zinc-300 hover:bg-zinc-800/60'
              )}
            >
              {fileIcon(f.name) === 'image' ? (
                <ImageIcon size={11} className="text-sky-400 shrink-0" />
              ) : (
                <FileText size={11} className="text-zinc-400 shrink-0" />
              )}
              <span className="truncate flex-1">{f.name}</span>
              {i === activeIndex ? <span className="shrink-0 text-[9px] text-zinc-600 font-mono">↵</span> : null}
            </li>
          ))}
        </ul>
      ) : null}

      {query !== null && mentionFiles.length === 0 ? (
        <div className="absolute left-0 right-0 z-[60] mt-1 rounded-xl border border-zinc-800/40 bg-zinc-950/90 backdrop-blur-sm px-3 py-2 text-[11px] text-zinc-600 animate-fade-in">
          还没有上传文件，先添加参考资料
        </div>
      ) : null}
    </div>
  )
}



