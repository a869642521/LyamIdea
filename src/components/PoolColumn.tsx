'use client'
import { useMemo, useState, useEffect, useLayoutEffect, useRef, useCallback, memo } from 'react'
import Link from 'next/link'
import { useLanguage } from '@/contexts/LanguageContext'
import { ITERATION_PROGRESS_PHASES } from '@/lib/iteration-copy'
import { cn, ideaCellTitle, ideaTypewriterBodyText, hashSeed } from '@/lib/utils'
import { scoreColor, trendIcon, trendColor } from '@/lib/utils'
import { POOL_THEMES } from '@/lib/color-themes'
import type { PoolDetail, IdeaDetail, Attachment } from '@/types'
import IdeaCard from './IdeaCard'
import { JiqirenWithText } from './JiqirenWithText'
import MentionTextarea from './MentionTextarea'
import {
  ArrowRight,
  Paperclip,
  Pencil,
  X,
  Loader2,
  Check,
  Play,
  Trash2,
  Upload,
  FileText,
  Image,
  AlertTriangle,
  RefreshCw,
  LayoutGrid,
  MessageSquare,
} from 'lucide-react'

const PHASES = [...ITERATION_PROGRESS_PHASES]

/** 剩余毫秒 → 分:秒（或 时:分:秒），按整秒递减 */
function formatCountdownMs(ms: number): string {
  const sec = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

const ACCEPT_FILES = '.txt,.md,.pdf,.doc,.docx,.png,.jpg,.jpeg,.webp'

/** 机器人屏幕打字机文案：以项目细节为主，避免只闪标题关键词 */
function poolRobotTypewriterText(pool: PoolDetail): string {
  const desc = pool.description?.replace(/\s+/g, ' ').trim()
  if (desc) return desc
  const dir = pool.direction?.trim()
  const kw = pool.keyword?.trim()
  const parts = [dir, kw].filter(Boolean) as string[]
  return parts.length ? parts.join(' · ') : '创意池'
}

interface PoolEditPanelProps {
  poolId: string
  poolKeyword: string
  attachments: Attachment[]
  removeNames: string[]
  newFiles: File[]
  deleteConfirm: boolean
  saving: boolean
  fileInputRef: React.RefObject<HTMLInputElement | null>
  description: string
  initialDescription: string
  onDescriptionChange: (v: string) => void
  onToggleRemove: (name: string) => void
  onAddFiles: (files: File[]) => void
  onRemoveNewFile: (index: number) => void
  onSave: () => Promise<void>
  onDeleteConfirm: () => void
  onDeleteCancel: () => void
  onDelete: () => Promise<void>
  onClose: () => void
  /** 笔形菜单内：项目细节与参考文件仅只读展示（补充与修改通过「进入下一轮」弹窗） */
  readOnlyDetails?: boolean
}

function fileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (['png','jpg','jpeg','webp','gif','svg'].includes(ext)) return <Image size={12} className="text-sky-400" />
  return <FileText size={12} className="text-zinc-400" />
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ── 项目细节 + 参考文件（编辑浮层）；下一轮弹窗用 variant=advanceSupplement（只读已有 + 补充） ──

interface PoolDetailsAndAttachmentsFieldsProps {
  /** default：可改全文；advanceSupplement：上方只读已有内容，下方仅补充 */
  variant?: 'default' | 'advanceSupplement'
  /** variant=advanceSupplement 时只读展示的已有项目细节 */
  lockedDescription?: string
  attachments: Attachment[]
  removeNames: string[]
  newFiles: File[]
  description: string
  onDescriptionChange: (v: string) => void
  onToggleRemove: (name: string) => void
  onAddFiles: (files: File[]) => void
  onRemoveNewFile: (index: number) => void
  onClickUpload: () => void
  disabled?: boolean
  /** 每次进入下一轮弹窗打开时递增，用于收起「补充细节」并清理预览态 */
  advanceSupplementUiEpoch?: number
  /** 笔形菜单：项目细节与参考文件仅展示，不可改 */
  readOnly?: boolean
}

function PoolDetailsAndAttachmentsFields({
  variant = 'default',
  lockedDescription = '',
  attachments,
  removeNames,
  newFiles,
  description,
  onDescriptionChange,
  onToggleRemove,
  onAddFiles,
  onRemoveNewFile,
  onClickUpload,
  disabled = false,
  advanceSupplementUiEpoch = 0,
  readOnly = false,
}: PoolDetailsAndAttachmentsFieldsProps) {
  const isAdvanceSupplement = variant === 'advanceSupplement'
  const existing = attachments.filter((a) => !removeNames.includes(a.name))
  const allMentionFiles = isAdvanceSupplement
    ? [...attachments, ...newFiles.map((f) => ({ name: f.name }))]
    : [...existing, ...newFiles.map((f) => ({ name: f.name }))]

  type PreviewTarget =
    | { kind: 'attachment'; data: Attachment }
    | { kind: 'newfile'; file: File; objectUrl: string }
  const [previewTarget, setPreviewTarget] = useState<PreviewTarget | null>(null)
  /** 下一轮弹窗：补充细节输入区默认收起，点右侧按钮后展开 */
  const [advanceSupplementDescOpen, setAdvanceSupplementDescOpen] = useState(false)

  useEffect(() => {
    if (!isAdvanceSupplement) return
    if (description.trim()) setAdvanceSupplementDescOpen(true)
  }, [isAdvanceSupplement, description])

  useEffect(() => {
    if (!isAdvanceSupplement || advanceSupplementUiEpoch <= 0) return
    setAdvanceSupplementDescOpen(false)
    setPreviewTarget((prev) => {
      if (prev?.kind === 'newfile' && prev.objectUrl) URL.revokeObjectURL(prev.objectUrl)
      return null
    })
  }, [advanceSupplementUiEpoch, isAdvanceSupplement])

  const openAttachmentPreview = (a: Attachment) => {
    setPreviewTarget((prev) =>
      prev?.kind === 'attachment' && prev.data.name === a.name ? null : { kind: 'attachment', data: a }
    )
  }

  const openNewFilePreview = (f: File, idx: number) => {
    setPreviewTarget((prev) => {
      if (prev?.kind === 'newfile' && prev.file === f) {
        URL.revokeObjectURL(prev.objectUrl)
        return null
      }
      if (prev?.kind === 'newfile') URL.revokeObjectURL(prev.objectUrl)
      const isImage = /\.(png|jpe?g|gif|webp|svg)$/i.test(f.name) || f.type.startsWith('image/')
      if (!isImage) return { kind: 'newfile', file: f, objectUrl: '' }
      return { kind: 'newfile', file: f, objectUrl: URL.createObjectURL(f) }
    })
    void idx
  }

  const filePreviewBlock =
    previewTarget &&
    (() => {
      const isAttachment = previewTarget.kind === 'attachment'
      const fileName = isAttachment ? previewTarget.data.name : previewTarget.file.name
      const textContent = isAttachment ? previewTarget.data.textContent : undefined
      const imgSrc = isAttachment
        ? previewTarget.data.dataUrl
        : previewTarget.objectUrl || undefined
      const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
      const isImg = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext)
      return (
        <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/70 overflow-hidden animate-fade-in">
          <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800/60">
            <div className="flex items-center gap-2 min-w-0">
              {fileIcon(fileName)}
              <span className="text-[11px] text-zinc-300 truncate">{fileName}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                if (previewTarget.kind === 'newfile' && previewTarget.objectUrl) {
                  URL.revokeObjectURL(previewTarget.objectUrl)
                }
                setPreviewTarget(null)
              }}
              className="shrink-0 w-4 h-4 flex items-center justify-center text-zinc-600 hover:text-zinc-300 transition-colors"
            >
              <X size={10} />
            </button>
          </div>
          <div className="px-3 py-2.5 max-h-48 overflow-y-auto flex items-center justify-center">
            {imgSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imgSrc} alt={fileName} className="max-w-full max-h-40 rounded-lg object-contain" />
            ) : textContent ? (
              <pre className="w-full text-[10px] text-zinc-400 whitespace-pre-wrap leading-relaxed font-mono">
                {textContent.slice(0, 2000)}
                {textContent.length > 2000 && <span className="text-zinc-600">…（内容已截断）</span>}
              </pre>
            ) : (
              <p className="text-[11px] text-zinc-600 italic py-2">
                {isImg ? '图片尚未保存，预览不可用' : 'PDF / Word 文件无法在此预览'}
              </p>
            )}
          </div>
        </div>
      )
    })()

  if (isAdvanceSupplement) {
    return (
      <div className="space-y-4 min-w-0">
        <div className="space-y-2 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-1.5 flex-wrap min-w-0">
              <span className="text-[11px] font-semibold text-zinc-400">已有项目细节</span>
              <span className="text-[10px] text-zinc-600 bg-zinc-800/50 px-1.5 py-0.5 rounded-md shrink-0">
                不可更改
              </span>
            </div>
            {advanceSupplementDescOpen ? (
              <button
                type="button"
                disabled={disabled}
                onClick={() => setAdvanceSupplementDescOpen(false)}
                aria-label="收起补充细节输入"
                className="shrink-0 text-[10px] font-medium text-zinc-500 hover:text-zinc-300 px-2 py-1 rounded-lg border border-zinc-700/50 bg-zinc-900/40 hover:bg-zinc-800/60 transition-colors disabled:opacity-40"
              >
                收起
              </button>
            ) : (
              <button
                type="button"
                disabled={disabled}
                onClick={() => setAdvanceSupplementDescOpen(true)}
                aria-label="填写补充细节"
                className="shrink-0 flex items-center gap-1 text-[10px] font-medium text-amber-500/90 hover:text-amber-400 px-2 py-1 rounded-lg border border-amber-500/25 bg-amber-500/5 hover:bg-amber-500/10 transition-colors disabled:opacity-40"
              >
                <Pencil size={12} strokeWidth={2.5} aria-hidden />
                补充细节
              </button>
            )}
          </div>
          <textarea
            readOnly
            value={lockedDescription.trim() ? lockedDescription : ''}
            placeholder="暂无"
            rows={4}
            className="w-full rounded-xl border border-zinc-800/60 bg-zinc-950/60 px-3 py-2.5 text-xs text-zinc-500 leading-relaxed resize-none min-h-[72px] cursor-default focus:outline-none focus-visible:ring-1 focus-visible:ring-zinc-700 placeholder:text-zinc-600"
            aria-label="已有项目细节（只读）"
          />
          {advanceSupplementDescOpen && (
            <div className="space-y-1.5 pt-2">
              {allMentionFiles.length > 0 && (
                <span className="text-[10px] text-zinc-600 bg-zinc-800/60 px-1.5 py-0.5 rounded-md inline-block">
                  输入 @ 引用文件
                </span>
              )}
              <MentionTextarea
                value={description}
                onChange={onDescriptionChange}
                mentionFiles={allMentionFiles}
                placeholder="可补充新约束、反馈摘要等；确认后将追加到题目说明，供下一轮参考…"
                maxLength={3000}
                rows={3}
                disabled={disabled}
                onPasteFiles={(files) => onAddFiles(files)}
              />
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-1.5 flex-wrap min-w-0">
              <span className="text-[11px] font-semibold text-zinc-400">已有参考文件</span>
              <span className="text-[10px] text-zinc-600 bg-zinc-800/50 px-1.5 py-0.5 rounded-md shrink-0">
                不可更改
              </span>
              {attachments.length > 0 && (
                <span className="text-[10px] text-zinc-600 tabular-nums bg-zinc-800/60 px-1.5 py-0.5 rounded-md">
                  {attachments.length}
                </span>
              )}
              {newFiles.length > 0 && (
                <span className="text-[10px] text-violet-400/90 tabular-nums bg-violet-500/10 border border-violet-500/20 px-1.5 py-0.5 rounded-md">
                  +{newFiles.length} 待上传
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={onClickUpload}
              disabled={disabled}
              aria-label="添加补充文件"
              className="shrink-0 flex items-center gap-1 text-[10px] font-medium text-amber-500/90 hover:text-amber-400 px-2 py-1 rounded-lg border border-amber-500/25 bg-amber-500/5 hover:bg-amber-500/10 transition-colors disabled:opacity-40"
            >
              <Upload size={12} strokeWidth={2.5} aria-hidden />
              补充文件
            </button>
          </div>
          {attachments.length === 0 ? (
            <div className="rounded-xl border border-zinc-800/50 bg-zinc-900/30 py-3 flex items-center justify-center">
              <p className="text-[11px] text-zinc-600">暂无参考文件</p>
            </div>
          ) : (
            <ul className="space-y-1.5">
              {attachments.map((a) => (
                <li
                  key={a.name}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-xl border bg-zinc-900/40 border-zinc-800/60 hover:border-zinc-700/70 cursor-pointer transition-colors"
                  onClick={() => openAttachmentPreview(a)}
                >
                  <div className="w-6 h-6 rounded-md bg-zinc-800 flex items-center justify-center shrink-0">
                    {fileIcon(a.name)}
                  </div>
                  <span className="flex-1 text-[11px] text-zinc-400 truncate min-w-0">{a.name}</span>
                </li>
              ))}
            </ul>
          )}
          {newFiles.length > 0 && (
            <ul className="space-y-1.5 pt-2">
              {newFiles.map((f, i) => (
                <li
                  key={`${f.name}-${i}`}
                  className="group flex items-center gap-2.5 px-3 py-2 rounded-xl bg-violet-500/5 border border-violet-500/20 hover:border-violet-500/35 cursor-pointer transition-colors"
                  onClick={() => openNewFilePreview(f, i)}
                >
                  <div className="w-6 h-6 rounded-md bg-violet-500/15 flex items-center justify-center shrink-0">
                    {fileIcon(f.name)}
                  </div>
                  <span className="flex-1 text-[11px] text-zinc-300 truncate min-w-0">{f.name}</span>
                  <span className="shrink-0 text-[10px] text-zinc-600 tabular-nums mr-1">{formatFileSize(f.size)}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onRemoveNewFile(i)
                    }}
                    className="shrink-0 opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded-full text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
                    aria-label="移除"
                  >
                    <X size={10} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {filePreviewBlock}
      </div>
    )
  }

  if (readOnly) {
    return (
      <div className="space-y-4 min-w-0">
        <div className="space-y-2 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-semibold text-zinc-300">项目细节</span>
            <span className="text-[10px] text-zinc-600 bg-zinc-800/50 px-1.5 py-0.5 rounded-md shrink-0">只读</span>
          </div>
          <div className="rounded-xl border border-zinc-800/60 bg-zinc-950/60 px-3 py-2.5 min-h-[72px] min-w-0 overflow-hidden">
            <p className="text-xs text-zinc-400 leading-relaxed whitespace-pre-wrap break-words">
              {description.trim() ? description : '暂无细节'}
            </p>
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-semibold text-zinc-300">参考文件</span>
            {attachments.length > 0 && (
              <span className="text-[10px] text-zinc-600 tabular-nums bg-zinc-800/60 px-1.5 py-0.5 rounded-md">
                {attachments.length}
              </span>
            )}
            <span className="text-[10px] text-zinc-600 bg-zinc-800/50 px-1.5 py-0.5 rounded-md shrink-0">只读</span>
          </div>
          {attachments.length === 0 ? (
            <div className="rounded-xl border border-zinc-800/50 bg-zinc-900/30 py-3 flex items-center justify-center">
              <p className="text-[11px] text-zinc-600">暂无参考文件</p>
            </div>
          ) : (
            <ul className="space-y-1.5">
              {attachments.map((a) => (
                <li
                  key={a.name}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-xl border bg-zinc-900/40 border-zinc-800/60 hover:border-zinc-700/70 cursor-pointer transition-colors"
                  onClick={() => openAttachmentPreview(a)}
                >
                  <div className="w-6 h-6 rounded-md bg-zinc-800 flex items-center justify-center shrink-0">
                    {fileIcon(a.name)}
                  </div>
                  <span className="flex-1 text-[11px] text-zinc-400 truncate min-w-0">{a.name}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        {filePreviewBlock}
      </div>
    )
  }

  return (
    <div className="space-y-4 min-w-0">
      {/* 项目细节 */}
      <div className="space-y-2 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold text-zinc-300">项目细节</span>
          {allMentionFiles.length > 0 && (
            <span className="text-[10px] text-zinc-600 bg-zinc-800/60 px-1.5 py-0.5 rounded-md">
              输入 @ 引用文件
            </span>
          )}
        </div>
        <MentionTextarea
          value={description}
          onChange={onDescriptionChange}
          mentionFiles={allMentionFiles}
          placeholder="描述背景、目标用户、约束条件，AI 下一轮将参考此内容优化方案…"
          maxLength={3000}
          rows={3}
          disabled={disabled}
          onPasteFiles={(files) => onAddFiles(files)}
        />
      </div>

      {/* 参考文件 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold text-zinc-300">参考文件</span>
            {(existing.length + newFiles.length) > 0 && (
              <span className="text-[10px] text-zinc-600 tabular-nums bg-zinc-800/60 px-1.5 py-0.5 rounded-md">
                {existing.length + newFiles.length}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClickUpload}
            disabled={disabled}
            className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-300 hover:text-zinc-100 px-2.5 py-1.5 rounded-lg bg-zinc-800/80 hover:bg-zinc-700/80 border border-zinc-700/50 hover:border-zinc-600/80 transition-all disabled:opacity-40"
          >
            <Upload size={11} />
            添加文件
          </button>
        </div>

        {/* 文件列表 */}
        {existing.length === 0 && newFiles.length === 0 ? (
          <button
            type="button"
            onClick={onClickUpload}
            disabled={disabled}
            className="w-full py-4 rounded-xl border border-zinc-800 hover:border-zinc-700 bg-zinc-900/30 hover:bg-zinc-900/60 transition-all flex flex-col items-center gap-1.5 text-zinc-600 hover:text-zinc-400 disabled:opacity-40 disabled:pointer-events-none"
          >
            <Paperclip size={16} />
            <span className="text-[11px]">点击添加参考文件</span>
            <span className="text-[10px] text-zinc-700">支持 TXT、MD、PDF、Word、图片</span>
          </button>
        ) : (
          <ul className="space-y-1.5">
            {existing.map((a) => (
              <li
                key={a.name}
                className="group flex items-center gap-2.5 px-3 py-2 rounded-xl border bg-zinc-900/50 border-zinc-800/60 hover:border-zinc-700/80 cursor-pointer transition-colors"
                onClick={() => openAttachmentPreview(a)}
              >
                <div className="w-6 h-6 rounded-md bg-zinc-800 flex items-center justify-center shrink-0">
                  {fileIcon(a.name)}
                </div>
                <span className="flex-1 text-[11px] text-zinc-300 truncate min-w-0">{a.name}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggleRemove(a.name)
                  }}
                  className="shrink-0 opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded-full text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
                  aria-label="移除"
                >
                  <X size={10} />
                </button>
              </li>
            ))}
            {newFiles.map((f, i) => (
              <li
                key={`${f.name}-${i}`}
                className="group flex items-center gap-2.5 px-3 py-2 rounded-xl bg-violet-500/5 border border-violet-500/20 hover:border-violet-500/35 cursor-pointer transition-colors"
                onClick={() => openNewFilePreview(f, i)}
              >
                <div className="w-6 h-6 rounded-md bg-violet-500/15 flex items-center justify-center shrink-0">
                  {fileIcon(f.name)}
                </div>
                <span className="flex-1 text-[11px] text-zinc-300 truncate min-w-0">{f.name}</span>
                <span className="shrink-0 text-[10px] text-zinc-600 tabular-nums mr-1">{formatFileSize(f.size)}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onRemoveNewFile(i)
                  }}
                  className="shrink-0 opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded-full text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-all"
                  aria-label="移除"
                >
                  <X size={10} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {filePreviewBlock}

        {/* 待移除标记 */}
        {removeNames.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {removeNames.map((name) => (
              <span
                key={name}
                className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400"
              >
                <X size={8} />
                {name.length > 18 ? name.slice(0, 16) + '…' : name}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function PoolEditPanel({
  poolKeyword,
  attachments,
  removeNames,
  newFiles,
  deleteConfirm,
  saving,
  fileInputRef,
  description,
  initialDescription,
  onDescriptionChange,
  onToggleRemove,
  onAddFiles,
  onRemoveNewFile,
  onSave,
  onDeleteConfirm,
  onDeleteCancel,
  onDelete,
  onClose,
  readOnlyDetails = false,
}: PoolEditPanelProps) {
  const hasChanges = !readOnlyDetails && (removeNames.length > 0 || newFiles.length > 0 || description !== initialDescription)

  return (
    <div className="relative rounded-2xl border border-zinc-800/50 bg-zinc-950/90 backdrop-blur-xl shadow-2xl shadow-black/60 overflow-hidden animate-fade-in">
      {!readOnlyDetails && (
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT_FILES}
          multiple
          className="sr-only"
          aria-label="添加文件"
          onChange={(e) => {
            const files = e.target.files
            if (files?.length) onAddFiles(Array.from(files))
            e.target.value = ''
          }}
        />
      )}

      {/* 关闭按钮 */}
      <button
        type="button"
        onClick={onClose}
        aria-label="关闭"
        className="absolute top-3 right-3 w-6 h-6 rounded-full flex items-center justify-center text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors z-10"
      >
        <X size={13} />
      </button>

      {/* ── 主体内容 ── */}
      <div className="px-5 py-4 pt-8 space-y-5 min-w-0 overflow-hidden">
        <PoolDetailsAndAttachmentsFields
          readOnly={readOnlyDetails}
          attachments={attachments}
          removeNames={removeNames}
          newFiles={newFiles}
          description={description}
          onDescriptionChange={onDescriptionChange}
          onToggleRemove={onToggleRemove}
          onAddFiles={onAddFiles}
          onRemoveNewFile={onRemoveNewFile}
          onClickUpload={() => fileInputRef.current?.click()}
          disabled={saving}
        />

        {/* 保存按钮 */}
        {hasChanges && (
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="w-full h-10 rounded-xl text-sm font-semibold bg-violet-600 hover:bg-violet-500 active:bg-violet-700 text-white transition-all shadow-lg shadow-violet-900/30 hover:shadow-violet-900/50 disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2"
          >
            {saving ? (
              <><Loader2 size={14} className="animate-spin" />保存中…</>
            ) : (
              <>保存更改</>
            )}
          </button>
        )}
      </div>

      {/* ── 危险区 ── */}
      <div className="px-5 pb-4">
        <div className="h-px bg-zinc-800/60 mb-3" />
        {!deleteConfirm ? (
          <button
            type="button"
            onClick={onDeleteConfirm}
            disabled={saving}
            className="w-full h-9 rounded-xl text-[11px] font-medium text-zinc-600 hover:text-rose-400 hover:bg-rose-500/8 border border-transparent hover:border-rose-500/20 transition-all flex items-center justify-center gap-1.5 disabled:opacity-40"
          >
            <Trash2 size={12} />
            删除此创意池
          </button>
        ) : (
          <div className="space-y-2.5">
            <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl bg-rose-500/8 border border-rose-500/20">
              <Trash2 size={13} className="text-rose-400 shrink-0 mt-0.5" />
              <p className="text-[11px] text-rose-300 leading-relaxed">
                确定删除「<span className="font-semibold">{poolKeyword}</span>」？<br />
                <span className="text-rose-400/70">所有创意方案将被永久移除，无法恢复。</span>
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onDeleteCancel}
                className="flex-1 h-9 rounded-xl text-xs font-medium text-zinc-400 hover:text-zinc-200 bg-zinc-800/60 hover:bg-zinc-800 transition-colors border border-zinc-700/40"
              >
                取消
              </button>
              <button
                type="button"
                onClick={onDelete}
                disabled={saving}
                className="flex-1 h-9 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                <span className="flex items-center justify-center w-3 h-3 shrink-0">
                  {saving ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                </span>
                确认删除
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

interface PoolColumnProps {
  pool: PoolDetail
  poolIndex: number
  /** 第二个参数为池子 id，便于父组件用稳定回调绑定，避免子列因内联函数整列重渲染 */
  onIdeaClick: (idea: IdeaDetail, poolId: string) => void
  /** 点击「留指导」时触发（未传则与 onIdeaClick 相同） */
  onIdeaFeedback?: (idea: IdeaDetail, poolId: string) => void
  isRunning?: boolean
  /** 详情页模式：隐藏底部「查看详情」 */
  detailView?: boolean
  /** 当前池子是否已被跟踪 */
  isTracked?: boolean
  /** 点击跟踪/取消跟踪 */
  onTrack?: (poolId: string) => void
  /** 点击进度节点触发下一轮迭代（仅下一轮可触发）；返回 Promise 时弹窗内可 await */
  onRunIteration?: (poolId: string, nextIteration: number) => void | Promise<void>
  /** 点击已完成轮次查看该轮状态；round 为 undefined 表示返回最新 */
  onViewRound?: (poolId: string, round: number | undefined) => void
  /** 当前查看的轮次（用于显示历史状态，不传则显示最新） */
  viewRound?: number
  /** 当前池子内正在显示的气泡：ideaId -> 气泡文案 */
  bubbleTextMap?: Record<string, string>
  /** 保存附件变更（移除名列表 + 新增文件），下一轮作为题目资料；返回 true 表示成功 */
  onEdit?: (poolId: string, payload: { remove: string[]; files: File[]; description?: string }) => Promise<boolean>
  /** 删除整个池子 */
  onDelete?: (poolId: string) => Promise<void>
  /** 切换探索方向后回调，用于更新本地 pool 数据（仅第 0 轮可用） */
  onDirectionSwitch?: (pool: PoolDetail) => void
  /** 用户确认进入下一轮后回调，用于更新本地 pool 数据 */
  onConfirmRound?: (pool: PoolDetail) => void
  /** 更新池子详情（如第二轮勾选「带入第三轮」后同步服务端） */
  onPoolUpdated?: (pool: PoolDetail) => void
}

function PoolColumnInner({
  pool,
  poolIndex,
  onIdeaClick,
  onIdeaFeedback,
  isRunning = false,
  detailView = false,
  isTracked = false,
  onTrack,
  onRunIteration,
  onViewRound,
  viewRound,
  bubbleTextMap,
  onEdit,
  onDelete,
  onDirectionSwitch,
  onConfirmRound,
  onPoolUpdated,
}: PoolColumnProps) {
  const { t } = useLanguage()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const editPopoverRef = useRef<HTMLDivElement>(null)
  const editBtnRef = useRef<HTMLButtonElement>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [removeNames, setRemoveNames] = useState<string[]>([])
  const [newFiles, setNewFiles] = useState<File[]>([])
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [descriptionEdit, setDescriptionEdit] = useState(pool.description ?? '')
  useEffect(() => {
    setDescriptionEdit(pool.description ?? '')
  }, [pool.description])
  const [advanceModalOpen, setAdvanceModalOpen] = useState(false)
  const [advanceModalBusy, setAdvanceModalBusy] = useState(false)
  const [advanceModalError, setAdvanceModalError] = useState<string | null>(null)
  /** 弹窗每次从关→开递增，用于重置补充区 UI（收起细节输入、关预览） */
  const [advanceSupplementUiEpoch, setAdvanceSupplementUiEpoch] = useState(0)
  const prevAdvanceModalOpenRef = useRef(false)
  // 弹窗内仅「补充」草稿；已有细节与附件只读展示，不可在此删除
  const [advanceSupplementDesc, setAdvanceSupplementDesc] = useState('')
  const [advanceNewFiles, setAdvanceNewFiles] = useState<File[]>([])
  const advanceFileInputRef = useRef<HTMLInputElement>(null)

  const mountedRef = useRef(true)
  useEffect(() => () => { mountedRef.current = false }, [])

  useEffect(() => {
    if (!advanceModalOpen) return
    setAdvanceSupplementDesc('')
    setAdvanceNewFiles([])
  }, [advanceModalOpen])

  useEffect(() => {
    if (advanceModalOpen && !prevAdvanceModalOpenRef.current) {
      setAdvanceSupplementUiEpoch((e) => e + 1)
    }
    prevAdvanceModalOpenRef.current = advanceModalOpen
  }, [advanceModalOpen])

  // 首页浮动框：点击外部关闭
  useEffect(() => {
    if (!editOpen || detailView) return
    const handler = (e: MouseEvent) => {
      if (
        editPopoverRef.current?.contains(e.target as Node) ||
        editBtnRef.current?.contains(e.target as Node)
      ) return
      setEditOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [editOpen, detailView])

  useEffect(() => {
    if (!advanceModalOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !advanceModalBusy) setAdvanceModalOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [advanceModalOpen, advanceModalBusy])
  const poolTheme = POOL_THEMES[poolIndex % POOL_THEMES.length]
  const colorClass = poolTheme.poolColumnBg
  const iteration = pool.iteration ?? 0
  const ROUND_TOTAL = 3
  const completedUserRounds = Math.min(iteration + 1, ROUND_TOTAL)
  const currentUserRound = !((pool.iteration ?? 0) >= 2) ? completedUserRounds + 1 : null
  const isDone = iteration >= 2
  /** 自动等待下一轮时，倒计时画在「当前完成轮 → 下一轮」之间的线段上（最后一格为 phase2–phase3 之间） */
  const countdownConnectorIndex = Math.min(Math.max(completedUserRounds - 1, 0), Math.max(0, PHASES.length - 2))

  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!pool.next_iterate_at || isDone) return
    setNow(Date.now())
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [pool.next_iterate_at, isDone])
  const nextAt = pool.next_iterate_at ? new Date(pool.next_iterate_at).getTime() : 0
  const countdownMs = nextAt > now ? nextAt - now : 0
  const countdownStr = countdownMs > 0 ? formatCountdownMs(countdownMs) : ''

  // 与 iteratePoolReal 里的 next_iterate_at 间隔（5 分钟）保持一致，避免进度条几乎空白
  const ROUND_DURATION_MS = 5 * 60 * 1000
  // 当前轮内时间进度 0~1
  const roundProgress =
    isDone
      ? 1
      : pool.next_iterate_at && countdownMs > 0
      ? Math.max(0, Math.min(1, 1 - countdownMs / ROUND_DURATION_MS))
      : pool.next_iterate_at
      ? 1
      : 0
  // 总进度条填充百分比 0~100
  const barFill = isDone
    ? 100
    : ((completedUserRounds / ROUND_TOTAL) + roundProgress / ROUND_TOTAL) * 100

  const tooltipText = isDone
    ? t('allDone')
    : countdownStr
    ? t('nextRoundCountdown', countdownStr)
    : t('waitingIteration')

  const nextIter = iteration + 1
  /** 种子刚完成（第 1 轮 → 第 2 轮）：auto 下旧数据可能仍带 5 分钟冷却，允许立刻手动进入下一轮 */
  const canPlayFirstIterAfterSeed =
    pool.iteration_mode === 'auto' && iteration === 0 && pool.status === 'done'
  const canPlayNext =
    !!onRunIteration &&
    !isDone &&
    !isRunning &&
    !pool.awaiting_round_confirm &&
    nextIter >= 1 &&
    nextIter <= 2 &&
    (pool.iteration_mode === 'manual'
      ? countdownMs === 0 && (iteration > 0 || (iteration === 0 && pool.status === 'done'))
      : canPlayFirstIterAfterSeed ||
        !pool.next_iterate_at ||
        new Date(pool.next_iterate_at).getTime() <= Date.now())

  // 当 viewRound 有值时，使用该轮次的版本数据展示
  const displayIdeas = useMemo(() => {
    if (viewRound == null) return pool.ideas
    const versionIter = viewRound - 1
    const ideas = pool.ideas
    const withScores = ideas.map((i) => {
      const v = i.versions?.find((x) => x.iteration === versionIter) ?? i.current_version
      return { idea: i, version: v, total_score: v?.total_score ?? 0 }
    })
    const sorted = [...withScores].sort((a, b) => b.total_score - a.total_score)
    return withScores
      .map(({ idea, version, total_score }) => {
        if (!version?.content) return null
        const rankAtRound = sorted.findIndex((s) => s.idea.id === idea.id) + 1 || null
        return {
          ...idea,
          current_version: version,
          total_score,
          rank: rankAtRound,
          trend: 'same' as const,
        } as IdeaDetail
      })
      .filter((i): i is IdeaDetail => i != null)
  }, [pool.ideas, viewRound])

  const ideasWithContent = displayIdeas.filter((i) => i.current_version?.content)
  const avgScore =
    ideasWithContent.length > 0
      ? ideasWithContent.reduce((s, i) => s + i.total_score, 0) / ideasWithContent.length
      : 0
  const improvedCount =
    viewRound != null ? 0 : displayIdeas.filter((i) => i.trend === 'up').length

  const top3 = useMemo(
    () => [...ideasWithContent].sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999)).slice(0, 3),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [displayIdeas] // displayIdeas 变化时才重新排序
  )

  /**
   * 仅「首轮正在生成 9 个种子创意」为 true。
   * 注意：开始第 2 / 3 轮时引擎只把 status 设为 running，不会立刻改 iteration，
   * 在完成前 pool.iteration 仍为上一轮（第一次优化前仍为 0）。若只用 iteration===0
   * 会把「第 2 轮生成中」误判成种子生成，九宫格一直显示「生成中…」。
   */
  const filledSeedSlotCount =
    pool.ideas?.filter((i) => (i.current_version?.content ?? '').toString().trim().length > 0).length ?? 0
  const seedingNow =
    pool.status === 'running' &&
    pool.iteration === 0 &&
    filledSeedSlotCount < 9

  /** 第 2 / 3 轮迭代进行中（非种子）：格子覆层与阶段按钮加载态一致 */
  const iteratingNow = !seedingNow && (isRunning || pool.status === 'running')
  /** 迭代完成前 pool.iteration 仍为上一轮序号；UI 正在生成的轮次 = 已完成轮次 + 2 */
  const insightIdeaCount = Math.min(9, pool.ideas?.length ?? 9)
  const iteratingCellLabel = iteratingNow
    ? (pool.iteration ?? 0) === 0
      ? t('insightDeepeningStatus', insightIdeaCount)
      : t('roundOptimizingStatus', (pool.iteration ?? 0) + 2)
    : ''

  const showFinalRoundPickUi = useMemo(() => {
    if ((pool.iteration ?? 0) !== 1) return false
    if (seedingNow || iteratingNow) return false
    if (pool.status === 'running') return false
    if (viewRound != null && viewRound !== 2) return false
    return true
  }, [pool.iteration, pool.status, seedingNow, iteratingNow, viewRound])

  const [finalRoundPickBusy, setFinalRoundPickBusy] = useState(false)
  const handleFinalRoundSlotToggle = useCallback(
    async (slot: number) => {
      if (finalRoundPickBusy) return
      const current = pool.final_round_extra_slots ?? []
      const next = current.includes(slot)
        ? current.filter((s) => s !== slot)
        : [...current, slot].sort((a, b) => a - b)
      setFinalRoundPickBusy(true)
      try {
        const r = await fetch(`/api/pools/${pool.id}/final-round-slots`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slots: next }),
        })
        const d = await r.json().catch(() => ({}))
        if (!r.ok) {
          console.error(typeof d.error === 'string' ? d.error : '保存失败')
          return
        }
        if (d.pool && onPoolUpdated) onPoolUpdated(d.pool)
      } catch (e) {
        console.error(e)
      } finally {
        setFinalRoundPickBusy(false)
      }
    },
    [finalRoundPickBusy, pool.id, pool.final_round_extra_slots, onPoolUpdated]
  )

  /** 仅当九宫格内帖子顺序真的变化时才跑 FLIP，避免兄弟池迭代 / fetchPools 换引用导致误触发动画 */
  const rankedGridOrderKey = useMemo(() => {
    if (seedingNow) return `seed:${pool.id}`
    if (viewRound == null) {
      const top9 = [...pool.ideas]
        .filter((i) => i.current_version?.content)
        .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999))
        .slice(0, 9)
      return `latest:${pool.iteration ?? 0}:${top9.map((i) => i.id).join('>')}`
    }
    const versionIter = viewRound - 1
    const ideas = pool.ideas
    const withScores = ideas.map((i) => {
      const v = i.versions?.find((x) => x.iteration === versionIter) ?? i.current_version
      return { idea: i, version: v, total_score: v?.total_score ?? 0 }
    })
    const sorted = [...withScores]
      .filter((x) => x.version?.content)
      .sort((a, b) => b.total_score - a.total_score)
    return `r${viewRound}:${sorted.slice(0, 9).map((x) => x.idea.id).join('>')}`
  }, [seedingNow, viewRound, pool.id, pool.iteration, pool.ideas])

  const handleIdeaCardClick = useCallback(
    (idea: IdeaDetail) => onIdeaClick(idea, pool.id),
    [onIdeaClick, pool.id]
  )
  const handleIdeaCardFeedbackOnly = useCallback(
    (idea: IdeaDetail) => {
      if (onIdeaFeedback) onIdeaFeedback(idea, pool.id)
    },
    [onIdeaFeedback, pool.id]
  )

  /** 排名九宫格切换轮次时 FLIP：卡片从旧格平滑移到新格（仅带 data-idea-id 的格子参与） */
  const rankedGridRef = useRef<HTMLDivElement>(null)
  const prevRankedCellRectsRef = useRef<Map<string, { left: number; top: number }>>(new Map())

  useLayoutEffect(() => {
    if (seedingNow) {
      prevRankedCellRectsRef.current = new Map()
      return
    }
    const useRankedTop9Layout = detailView || (!detailView && !seedingNow)
    if (!useRankedTop9Layout) {
      prevRankedCellRectsRef.current = new Map()
      return
    }
    const root = rankedGridRef.current
    if (!root) return
    const cells = root.querySelectorAll<HTMLElement>('[data-idea-id]')
    const nowRects = new Map<string, { left: number; top: number }>()
    cells.forEach((el) => {
      const id = el.getAttribute('data-idea-id')
      if (!id) return
      const r = el.getBoundingClientRect()
      nowRects.set(id, { left: r.left, top: r.top })
    })
    const prev = prevRankedCellRectsRef.current
    const toAnimate: HTMLElement[] = []
    cells.forEach((el) => {
      const id = el.getAttribute('data-idea-id')
      if (!id) return
      const p = prev.get(id)
      const n = nowRects.get(id)
      if (!p || !n) return
      const dx = p.left - n.left
      const dy = p.top - n.top
      if (Math.abs(dx) < 0.75 && Math.abs(dy) < 0.75) return
      el.style.transition = 'none'
      el.style.transform = `translate(${dx}px, ${dy}px)`
      el.style.zIndex = '2'
      toAnimate.push(el)
    })
    prevRankedCellRectsRef.current = nowRects
    if (toAnimate.length === 0) return
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        toAnimate.forEach((el) => {
          el.style.transition = 'transform 0.38s cubic-bezier(0.22, 1, 0.36, 1)'
          el.style.transform = 'translate(0, 0)'
        })
      })
    })
    const t = window.setTimeout(() => {
      toAnimate.forEach((el) => {
        el.style.transition = ''
        el.style.transform = ''
        el.style.zIndex = ''
      })
    }, 450)
    return () => window.clearTimeout(t)
  }, [rankedGridOrderKey, detailView, seedingNow, viewRound])

  const handleAdvanceConfirmSubmit = async () => {
    if (!onConfirmRound || advanceModalBusy) return
    setAdvanceModalBusy(true)
    setAdvanceModalError(null)
    const n = iteration + 1
    try {
      const baseDesc = pool.description ?? ''
      const combinedSupplement = advanceSupplementDesc.trim()
      const hasSupplementText = combinedSupplement.length > 0
      const hasNewFiles = advanceNewFiles.length > 0
      const hasChanges = hasSupplementText || hasNewFiles
      if (hasChanges && onEdit) {
        const payload: { remove: string[]; files: File[]; description?: string } = {
          remove: [],
          files: advanceNewFiles,
        }
        if (hasSupplementText) {
          payload.description = baseDesc ? `${baseDesc}\n\n${combinedSupplement}` : combinedSupplement
        }
        const ok = await onEdit(pool.id, payload)
        if (!ok) {
          setAdvanceModalError('保存补充内容失败，请检查网络后重试')
          return
        }
        setDescriptionEdit(
          hasSupplementText ? (baseDesc ? `${baseDesc}\n\n${combinedSupplement}` : combinedSupplement) : baseDesc
        )
        setRemoveNames([])
        setNewFiles([])
      }

      const r1 = await fetch(`/api/pools/${pool.id}/confirm-round`, { method: 'POST' })
      const d1 = await r1.json().catch(() => ({}))
      if (!r1.ok) {
        setAdvanceModalError(typeof d1.error === 'string' ? d1.error : '确认失败')
        return
      }
      if (d1.pool) onConfirmRound(d1.pool)

      // 确认成功后立即关闭弹窗，AI 迭代在后台运行（卡片自身有加载态）
      setAdvanceModalOpen(false)
      if (onRunIteration) {
        void Promise.resolve(onRunIteration(pool.id, n))
      }
    } catch {
      setAdvanceModalError('网络错误')
    } finally {
      setAdvanceModalBusy(false)
    }
  }

  return (
    <div className={cn('flex flex-col rounded-3xl border bg-gradient-to-b p-6', colorClass)}>
      {/* 头部：标题 */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5 min-w-0">
          <h3 className="text-xl font-bold text-zinc-100 leading-snug">
            {pool.keyword || t('unnamed')}
          </h3>
          {/* 种子生成进度计数器 */}
          {seedingNow && (
            <div className="flex items-center gap-1.5">
              <Loader2 size={11} className="animate-spin text-violet-400 shrink-0" />
              <span className="text-[11px] text-zinc-400">
                {t('aiGenerating')}
                <span className="ml-1 font-semibold tabular-nums text-violet-300">
                  {ideasWithContent.length} / 9
                </span>
              </span>
            </div>
          )}
          {iteratingNow && !seedingNow && (pool.iteration ?? 0) === 0 && (
            <div className="flex items-center gap-1.5 min-w-0">
              <Loader2 size={11} className="animate-spin text-violet-400 shrink-0" />
              <span className="text-[11px] text-zinc-400 leading-snug line-clamp-2">
                {t('insightDeepeningStatus', insightIdeaCount)}
              </span>
            </div>
          )}
          {iteratingNow && !seedingNow && (pool.iteration ?? 0) >= 1 && (
            <div className="flex items-center gap-1.5">
              <Loader2 size={11} className="animate-spin text-violet-400 shrink-0" />
              <span className="text-[11px] text-zinc-400">
                {t('roundOptimizingStatus', (pool.iteration ?? 0) + 2)}
              </span>
            </div>
          )}
        </div>
        {/* 首页：纯编辑按钮 + 浮动弹出框 */}
        {!detailView && (onEdit != null || onDelete != null) && (
          <div className="relative shrink-0">
            <button
              ref={editBtnRef}
              type="button"
              onClick={() => {
                setEditOpen((o) => !o)
                if (!editOpen) { setRemoveNames([]); setNewFiles([]); setDeleteConfirm(false) }
              }}
              aria-label="查看池子资料"
              className={cn(
                'w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-200 bg-zinc-800',
                editOpen ? 'bg-zinc-700 text-zinc-200' : 'text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
              )}
            >
              <Pencil size={13} />
            </button>

            {/* 浮动编辑框 */}
            {editOpen && (
              <div ref={editPopoverRef} className="absolute right-0 top-10 z-50 w-[min(94vw,380px)] max-w-[380px]">
                <PoolEditPanel
                  poolId={pool.id}
                  poolKeyword={pool.keyword}
                  attachments={pool.attachments ?? []}
                  removeNames={removeNames}
                  newFiles={newFiles}
                  deleteConfirm={deleteConfirm}
                  saving={saving}
                  fileInputRef={fileInputRef}
                  description={descriptionEdit}
                  initialDescription={pool.description ?? ''}
                  onDescriptionChange={setDescriptionEdit}
                  onToggleRemove={(name) => setRemoveNames((prev) => (prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]))}
                  onAddFiles={(files) => setNewFiles((prev) => prev.concat(files).slice(0, 10))}
                  onRemoveNewFile={(index) => setNewFiles((prev) => prev.filter((_, i) => i !== index))}
                  readOnlyDetails
                  onSave={async () => {
                    if (onEdit) {
                      setSaving(true)
                      try {
                        await onEdit(pool.id, { remove: removeNames, files: newFiles, description: descriptionEdit })
                        setEditOpen(false)
                      } finally { setSaving(false) }
                    }
                  }}
                  onDeleteConfirm={() => setDeleteConfirm(true)}
                  onDeleteCancel={() => setDeleteConfirm(false)}
                  onDelete={async () => {
                    if (!onDelete) return
                    setSaving(true)
                    try {
                      await onDelete(pool.id)
                      if (mountedRef.current) setEditOpen(false)
                    } finally {
                      if (mountedRef.current) setSaving(false)
                    }
                  }}
                  onClose={() => setEditOpen(false)}
                />
              </div>
            )}
          </div>
        )}

        {/* 详情页：状态/编辑（进入下一轮请点进度条当前节点上的播放） */}
        {detailView && (onEdit != null || onDelete != null) && (
          <button
            type="button"
            onClick={() => {
              if (isRunning) return
              setEditOpen((o) => !o)
              if (!editOpen) { setRemoveNames([]); setNewFiles([]); setDeleteConfirm(false) }
            }}
            disabled={isRunning}
            title={isRunning ? '迭代进行中…' : isDone ? '已全部完成' : '查看池子资料（可删除池子）'}
            aria-label="查看池子资料"
            className={cn(
              'shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-200 bg-zinc-800',
              isRunning ? 'cursor-default text-violet-400'
                : isDone ? 'text-emerald-400 hover:bg-zinc-700'
                : 'text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200',
              editOpen && !isRunning && 'bg-zinc-700 text-zinc-200'
            )}
          >
            <span className="flex items-center justify-center w-4 h-4 shrink-0">
              {isRunning ? (
                <Loader2 size={15} className="animate-spin" />
              ) : isDone ? (
                <Check size={15} />
              ) : (
                <Pencil size={13} />
              )}
            </span>
          </button>
        )}
      </div>

      {/* 详情页编辑面板（内联展开，详情页用） */}
      {detailView && editOpen && (onEdit != null || onDelete != null) && (
        <PoolEditPanel
          poolId={pool.id}
          poolKeyword={pool.keyword}
          attachments={pool.attachments ?? []}
          removeNames={removeNames}
          newFiles={newFiles}
          deleteConfirm={deleteConfirm}
          saving={saving}
          fileInputRef={fileInputRef}
          description={descriptionEdit}
          initialDescription={pool.description ?? ''}
          onDescriptionChange={setDescriptionEdit}
          onToggleRemove={(name) => setRemoveNames((prev) => (prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]))}
          onAddFiles={(files) => setNewFiles((prev) => prev.concat(files).slice(0, 10))}
          onRemoveNewFile={(index) => setNewFiles((prev) => prev.filter((_, i) => i !== index))}
          readOnlyDetails
          onSave={async () => {
            if (onEdit) {
              setSaving(true)
              try {
                await onEdit(pool.id, { remove: removeNames, files: newFiles, description: descriptionEdit })
                setEditOpen(false)
              } finally { setSaving(false) }
            }
          }}
          onDeleteConfirm={() => setDeleteConfirm(true)}
          onDeleteCancel={() => setDeleteConfirm(false)}
          onDelete={async () => {
            if (!onDelete) return
            setSaving(true)
            try {
              await onDelete(pool.id)
              if (mountedRef.current) setEditOpen(false)
            } finally {
              if (mountedRef.current) setSaving(false)
            }
          }}
          onClose={() => setEditOpen(false)}
        />
      )}

      {/* 失败状态：seed 后台失败时展示错误提示 + 删除/重试入口 */}
      {pool.status === 'failed' && (
        <div className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/8 px-4 py-3 space-y-2.5">
          <div className="flex items-start gap-2.5">
            <AlertTriangle size={14} className="text-rose-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold text-rose-300">创意生成失败</p>
              {pool.error_message && (
                <p className="text-[10px] text-rose-400/80 leading-relaxed mt-0.5 break-words">
                  {pool.error_message}
                </p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            {onDelete && (
              <button
                type="button"
                onClick={() => onDelete(pool.id)}
                className="flex-1 h-7 rounded-lg text-[11px] font-medium text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 border border-zinc-700/40 hover:border-rose-500/20 transition-all"
              >
                删除
              </button>
            )}
            <button
              type="button"
              onClick={async () => {
                try {
                  const res = await fetch(`/api/pools/${pool.id}/retry-seed`, { method: 'POST' })
                  const data = await res.json().catch(() => ({}))
                  if (res.ok && data.pool && onDirectionSwitch) onDirectionSwitch(data.pool)
                } catch { /* ignore */ }
              }}
              className="flex-1 h-7 rounded-lg text-[11px] font-medium text-violet-400 hover:text-violet-300 hover:bg-violet-500/10 border border-violet-500/30 hover:border-violet-500/50 transition-all flex items-center justify-center gap-1"
            >
              <RefreshCw size={10} />
              重试
            </button>
          </div>
        </div>
      )}

      {/* 进度条：三节点按钮 + 连接线（倒计时在「当前段 → 下一段」之间的连线中央，每秒刷新） */}
      <div className="mb-6 select-none relative">
        <div className="flex items-center w-full min-w-0">
          {PHASES.map((p, i) => {
            const phaseVersionIter = p.phase - 1
            const isDonePhase = completedUserRounds >= p.phase
            const isCurrent = currentUserRound === p.phase && !isDone
            const needsConfirmModal =
              isCurrent &&
              !!pool.awaiting_round_confirm &&
              !!onConfirmRound &&
              !isRunning
            const canPlayCurrentPhase = isCurrent && canPlayNext && phaseVersionIter === nextIter
            const showPlayCue = canPlayCurrentPhase || needsConfirmModal
            const isHistoryClick = isDonePhase && !!onViewRound
            const isClearClickable = isCurrent && viewRound != null && !canPlayCurrentPhase && !needsConfirmModal
            const isAdvancingHere = isRunning && isCurrent
            const canClick = isHistoryClick || isClearClickable || canPlayCurrentPhase || needsConfirmModal
            const isLast = i === PHASES.length - 1
            const amberPlayFixed = showPlayCue || isAdvancingHere
            return (
              <div key={p.phase} className={cn('flex items-center min-w-0', isLast ? 'shrink-0' : 'flex-1')}>
                <button
                  type="button"
                  disabled={!canClick}
                  onClick={() => {
                    if (needsConfirmModal) {
                      setAdvanceModalError(null)
                      setAdvanceModalOpen(true)
                      return
                    }
                    if (canPlayCurrentPhase && onRunIteration) {
                      void onRunIteration(pool.id, phaseVersionIter)
                      return
                    }
                    if (isHistoryClick) onViewRound?.(pool.id, p.phase)
                    else if (isClearClickable) onViewRound?.(pool.id, undefined)
                  }}
                  title={
                    amberPlayFixed
                      ? undefined
                      : isHistoryClick
                      ? `查看第 ${p.phase} 轮`
                      : isCurrent
                      ? tooltipText
                      : `第 ${p.phase} 轮`
                  }
                  aria-label={
                    amberPlayFixed
                      ? isAdvancingHere
                        ? `第 ${p.phase} 轮迭代进行中`
                        : needsConfirmModal
                          ? '打开说明并进入下一轮'
                          : `开始第 ${p.phase} 轮`
                      : undefined
                  }
                  className={cn(
                    // 固定占位，避免「迭代中 / 可播放 / 已完成」切换时按钮尺寸跳变牵连整行布局
                    'shrink-0 rounded-full text-[11px] font-semibold flex flex-col items-center justify-center leading-tight h-[43px] min-w-[52px] max-w-[4.5rem] px-1 gap-0.5',
                    isDonePhase
                      ? 'bg-violet-600 text-white shadow-sm shadow-violet-900/50 cursor-pointer hover:bg-violet-500 hover:shadow-violet-600/60 hover:scale-105 transition-all duration-200'
                      : isAdvancingHere
                      ? 'border border-violet-400/50 bg-violet-500/10 text-violet-300 cursor-default transition-colors duration-200'
                      : showPlayCue
                      ? 'border-2 border-amber-400/50 bg-gradient-to-b from-amber-400/18 to-amber-600/8 text-amber-100 cursor-pointer shadow-[0_0_22px_-10px_rgba(251,191,36,0.55),inset_0_1px_0_0_rgba(255,255,255,0.06)] hover:border-amber-300/65 hover:from-amber-400/26 hover:to-amber-600/14 hover:shadow-[0_0_26px_-8px_rgba(251,191,36,0.5),inset_0_1px_0_0_rgba(255,255,255,0.1)] transition-[color,background-color,border-color,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/45 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950'
                      : isCurrent
                      ? 'bg-indigo-500/15 border border-indigo-400/60 text-indigo-300 transition-colors duration-200'
                      : 'bg-zinc-800/60 border border-zinc-700/50 text-zinc-500 cursor-not-allowed transition-colors duration-200'
                  )}
                >
                  {isDonePhase ? (
                    <>
                      <span>{p.label}</span>
                      {p.theme ? (
                        <span className="text-[9px] font-normal opacity-90">{p.theme}</span>
                      ) : null}
                    </>
                  ) : isAdvancingHere ? (
                    <Loader2 size={20} className="animate-spin text-violet-400" aria-hidden />
                  ) : showPlayCue ? (
                    <Play size={22} className="fill-current text-amber-200 shrink-0 opacity-[0.98] drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]" aria-hidden />
                  ) : (
                    <>
                      <span>{p.label}</span>
                      {p.theme ? (
                        <span className="text-[9px] font-normal opacity-90">{p.theme}</span>
                      ) : null}
                    </>
                  )}
                </button>
                {!isLast && (
                  <div className="relative flex-1 min-w-[2.5rem] h-7 mx-1.5 flex items-center justify-center">
                    <div className="pointer-events-none absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[2px] rounded-full overflow-hidden bg-zinc-800">
                      <div
                        className="absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-violet-600 to-violet-400 transition-[width] duration-1000 linear"
                        style={{
                          width: isDonePhase ? '100%' : isCurrent ? `${roundProgress * 100}%` : '0%',
                        }}
                      />
                    </div>
                    {pool.next_iterate_at &&
                      !isDone &&
                      !isRunning &&
                      countdownMs > 0 &&
                      i === countdownConnectorIndex && (
                        <span
                          className="relative z-10 text-[10px] tabular-nums font-semibold text-zinc-100 bg-zinc-950/92 px-2 py-0.5 rounded-md border border-zinc-600/70 shadow-sm whitespace-nowrap"
                          title={`距下一轮：${countdownStr}`}
                        >
                          {countdownStr}
                        </span>
                      )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {showFinalRoundPickUi && (
        <div className="mb-3 rounded-lg border border-amber-500/25 bg-amber-500/[0.07] px-3 py-2">
          <p className="text-[10px] text-amber-200/90 leading-relaxed">
            <span className="font-semibold text-amber-300">第三轮入选</span>
            {' '}
            前三名将自动参与深度方案；其余格子可点「带入第三轮」追加（可多选），未选格子在第三轮将保留第二轮内容。
          </p>
        </div>
      )}

      {/* 九宫格（详情页按排名前 9，首页同）；ref 供排名格 FLIP 用 */}
      <div
        ref={rankedGridRef}
        className={cn(
          'grid gap-3',
          'grid-cols-3'
        )}
      >
        {(() => {
          /** 空格子：生成中显示脉冲动效，否则显示机器人占位 */
          const EmptyCell = ({
            slotKey,
            ci,
            theme,
            cellStyle,
            forDetailView,
          }: {
            slotKey: string
            ci: number
            theme: typeof POOL_THEMES[number]
            cellStyle: React.CSSProperties
            forDetailView?: boolean
          }) => {
            if (seedingNow) {
              return (
                <div
                  key={slotKey}
                  className="relative aspect-square overflow-hidden rounded-2xl border"
                  style={cellStyle}
                >
                  <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-zinc-800/30 via-zinc-700/10 to-zinc-800/30" />
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                    <Loader2 size={forDetailView ? 16 : 13} className="animate-spin text-violet-400/60" />
                    <span className="text-[10px] text-zinc-600 tracking-wide">生成中…</span>
                  </div>
                </div>
              )
            }
            return (
              <div
                key={slotKey}
                className={cn(
                  'relative overflow-hidden rounded-2xl border',
                  forDetailView ? 'aspect-square' : 'aspect-square'
                )}
                style={cellStyle}
              >
                <JiqirenWithText
                  typewriterText={poolRobotTypewriterText(pool)}
                  typewriterSeed={hashSeed(`${pool.id}:${slotKey}`)}
                  maxCaptionLen={136}
                  svgSrc={theme.svgSrc}
                  className="absolute inset-0 z-0 block h-full w-full object-contain"
                  iterating={forDetailView && iteratingNow}
                  iteratingLabel={iteratingCellLabel}
                />
              </div>
            )
          }

          if (detailView) {
            const top9 = [...displayIdeas]
              .filter((idea) => idea.current_version?.content)
              .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999))
              .slice(0, 9)
            return Array.from({ length: 9 }, (_, i) => {
              const idea = top9[i]
              // slot 固定在创意创建时（1-9），以此决定颜色可保持跨排名轮次稳定
              const ci = idea
                ? (poolIndex + idea.slot - 1) % POOL_THEMES.length
                : (poolIndex + i) % POOL_THEMES.length
              const theme = POOL_THEMES[ci]
              const cellStyle = { borderColor: theme.containerBorder, backgroundColor: theme.containerBg }
              if (!idea) {
                return (
                  <EmptyCell
                    key={`empty-${i}`}
                    slotKey={`empty-${i}`}
                    ci={ci}
                    theme={theme}
                    cellStyle={cellStyle}
                    forDetailView
                  />
                )
              }
              const robotBody = ideaTypewriterBodyText(idea.current_version?.content ?? '', idea.slot)
              return (
                <div
                  key={idea.id}
                  data-idea-id={idea.id}
                  className="relative overflow-hidden rounded-2xl border"
                  style={cellStyle}
                >
                  <JiqirenWithText
                    typewriterText={robotBody}
                    typewriterSeed={hashSeed(idea.id)}
                    maxCaptionLen={136}
                    svgSrc={theme.svgSrc}
                    className="absolute inset-0 z-0 block h-full w-full object-contain"
                    iterating={iteratingNow}
                    iteratingLabel={iteratingCellLabel}
                  />
                  <div className="relative z-10">
                    <IdeaCard
                      idea={idea}
                      onClick={handleIdeaCardClick}
                      onFeedback={onIdeaFeedback ? handleIdeaCardFeedbackOnly : undefined}
                      bubbleText={bubbleTextMap?.[idea.id]}
                      hasFeedback={!!idea.user_feedback}
                      detailView
                      colorIndex={ci}
                      iterating={iteratingNow}
                      iteratingLabel={iteratingCellLabel}
                      finalRoundPickMode={showFinalRoundPickUi}
                      finalRoundPickSelected={(pool.final_round_extra_slots ?? []).includes(idea.slot)}
                      finalRoundPickBusy={finalRoundPickBusy}
                      onToggleFinalRoundPick={() => {
                        void handleFinalRoundSlotToggle(idea.slot)
                      }}
                    />
                  </div>
                </div>
              )
            })
          }
          // 首页非详情视图：生成中按 slot 顺序展示，完成后按排名展示
          if (seedingNow) {
            const bySlot = new Map(displayIdeas.map((idea) => [idea.slot, idea]))
            return Array.from({ length: 9 }, (_, i) => {
              const slot = i + 1
              const idea = bySlot.get(slot)
              const hasContent = !!idea?.current_version?.content
              const ci = (poolIndex + i) % POOL_THEMES.length
              const theme = POOL_THEMES[ci]
              const cellStyle = { borderColor: theme.containerBorder, backgroundColor: theme.containerBg }
              if (!hasContent) {
                return (
                  <EmptyCell
                    key={`generating-${slot}`}
                    slotKey={`generating-${slot}`}
                    ci={ci}
                    theme={theme}
                    cellStyle={cellStyle}
                  />
                )
              }
              return (
                <div key={idea!.id} data-idea-id={idea!.id}>
                  <IdeaCard
                    idea={idea!}
                    onClick={handleIdeaCardClick}
                    onFeedback={onIdeaFeedback ? handleIdeaCardFeedbackOnly : undefined}
                    bubbleText={bubbleTextMap?.[idea!.id]}
                    hasFeedback={!!idea!.user_feedback}
                    colorIndex={ci}
                    iterating={iteratingNow}
                    iteratingLabel={iteratingCellLabel}
                    finalRoundPickMode={showFinalRoundPickUi}
                    finalRoundPickSelected={(pool.final_round_extra_slots ?? []).includes(idea!.slot)}
                    finalRoundPickBusy={finalRoundPickBusy}
                    onToggleFinalRoundPick={() => {
                      void handleFinalRoundSlotToggle(idea!.slot)
                    }}
                  />
                </div>
              )
            })
          }

          const top9 = [...displayIdeas]
            .filter((idea) => idea.current_version?.content)
            .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999))
            .slice(0, 9)
          return Array.from({ length: 9 }, (_, i) => {
            const idea = top9[i]
            const ci = idea
              ? (poolIndex + idea.slot - 1) % POOL_THEMES.length
              : (poolIndex + i) % POOL_THEMES.length
            const theme = POOL_THEMES[ci]
            const cellStyle = { borderColor: theme.containerBorder, backgroundColor: theme.containerBg }
            if (!idea) {
              return (
                <div
                  key={`empty-${i}`}
                  className="aspect-square rounded-2xl border"
                  style={cellStyle}
                />
              )
            }
            return (
              <div key={idea.id} data-idea-id={idea.id}>
                <IdeaCard
                  idea={idea}
                  onClick={handleIdeaCardClick}
                  onFeedback={onIdeaFeedback ? handleIdeaCardFeedbackOnly : undefined}
                  bubbleText={bubbleTextMap?.[idea.id]}
                  hasFeedback={!!idea.user_feedback}
                  colorIndex={ci}
                  iterating={iteratingNow}
                  iteratingLabel={iteratingCellLabel}
                  finalRoundPickMode={showFinalRoundPickUi}
                  finalRoundPickSelected={(pool.final_round_extra_slots ?? []).includes(idea.slot)}
                  finalRoundPickBusy={finalRoundPickBusy}
                  onToggleFinalRoundPick={() => {
                    void handleFinalRoundSlotToggle(idea.slot)
                  }}
                />
              </div>
            )
          })
        })()}
      </div>

      {/* 底部：前三名排行榜 + 统计行 + 跟踪一栏 + 按钮（仅首页池子卡片） */}
      {!detailView && (
        <div className="mt-6 pt-4 border-t border-zinc-800/60 space-y-2 w-full min-w-0">
          <div className="flex w-full min-w-0 items-center justify-between gap-2 flex-wrap">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              {t('top3')}
            </div>
            {ideasWithContent.length > 0 && (
              <div className="text-[10px] text-zinc-600 min-w-0">
                <span className="text-zinc-500">{t('avgScore')}</span>{' '}
                <span className={cn('font-bold tabular-nums', scoreColor(Math.round(avgScore)))}>
                  {Math.round(avgScore)}
                </span>
                <span className="text-zinc-600">{t('avgScoreNote')}</span>
              </div>
            )}
          </div>
          {top3.map((idea) => (
            <button
              key={idea.id}
              type="button"
              onClick={() => handleIdeaCardClick(idea)}
              className="w-full flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-white/5 text-left transition-colors"
            >
              <div
                className={cn(
                  'w-6 h-6 rounded-md bg-gradient-to-br flex-shrink-0 flex items-center justify-center text-xs',
                  POOL_THEMES[(poolIndex + ((idea.rank ?? 1) - 1)) % POOL_THEMES.length].gradient
                )}
              >
                #{idea.rank ?? idea.slot}
              </div>
              <span className="flex-1 text-xs text-zinc-300 truncate min-w-0">
                {ideaCellTitle(idea.current_version?.content ?? '', idea.slot)}
              </span>
              <span className={cn('text-xs font-bold flex-shrink-0', scoreColor(idea.total_score))}>
                {idea.total_score}
              </span>
            </button>
          ))}
          <div className="flex w-full min-w-0 gap-2 mt-2">
            <button
              type="button"
              onClick={() => onTrack?.(pool.id)}
              className={cn(
                'w-[20%] min-w-[4rem] shrink-0 py-2.5 rounded-xl border text-sm font-medium transition-colors',
                isTracked
                  ? 'border-violet-500 bg-violet-600/20 text-violet-300 hover:bg-violet-600/30'
                  : 'border-zinc-700 hover:border-zinc-500 text-zinc-300 hover:text-zinc-100'
              )}
            >
              {isTracked ? t('tracked') : t('track')}
            </button>
            <Link
              href={`/pools/${pool.id}`}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-zinc-700 hover:border-zinc-500 text-zinc-300 hover:text-zinc-100 text-sm font-medium transition-colors"
            >
              {t('viewDetails')}
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      )}

      {advanceModalOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="advance-modal-title"
          aria-describedby="advance-modal-fields"
        >
          <div
            className="absolute inset-0 backdrop-blur-xl backdrop-saturate-150"
            style={{ background: 'rgba(9,9,11,0.62)' }}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget && !advanceModalBusy) setAdvanceModalOpen(false)
            }}
            aria-hidden
          />
          <div
            className="relative z-10 w-full max-w-[min(92vw,560px)] min-w-0 rounded-3xl border border-white/[0.08] bg-zinc-950/88 backdrop-blur-2xl shadow-[0_24px_80px_-12px_rgba(0,0,0,0.75),0_0_0_1px_rgba(251,191,36,0.06)_inset] ring-1 ring-amber-500/[0.12] animate-modal-in overflow-hidden"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-400/35 to-transparent pointer-events-none" />
            <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4 border-b border-zinc-800/55">
              <div className="flex items-start gap-3 min-w-0">
                <div
                  className="shrink-0 w-11 h-11 rounded-2xl flex items-center justify-center bg-gradient-to-br from-amber-400/18 to-amber-600/[0.08] border border-amber-500/22 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]"
                  aria-hidden
                >
                  <Play size={20} className="fill-amber-300/95 text-amber-300/95 drop-shadow-[0_0_12px_rgba(251,191,36,0.35)]" />
                </div>
                <div className="min-w-0 pt-0.5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-500/90 mb-1">
                    {t('nextIterationLabel')}
                  </p>
                  <h2 id="advance-modal-title" className="text-base font-semibold text-zinc-50 leading-snug tracking-tight">
                    {t('prepareRound', iteration === 0 ? 1 : nextIter)}
                  </h2>
                </div>
              </div>
              <button
                type="button"
                disabled={advanceModalBusy}
                onClick={() => !advanceModalBusy && setAdvanceModalOpen(false)}
                className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/90 transition-colors disabled:opacity-40"
                aria-label="关闭"
              >
                <X size={17} />
              </button>
            </div>

            {/* 隐藏文件 input，供弹窗内上传使用 */}
            <input
              ref={advanceFileInputRef}
              type="file"
              accept={ACCEPT_FILES}
              multiple
              className="sr-only"
              aria-label="添加补充文件"
              onChange={(e) => {
                const files = e.target.files
                if (files?.length) {
                  setAdvanceNewFiles((prev) => [...prev, ...Array.from(files)].slice(0, 10))
                }
                e.target.value = ''
              }}
            />

            {/* 可滚动主体 */}
            <div className="px-5 py-4 space-y-4 overflow-y-auto max-h-[min(60vh,520px)]">
              {/* 已有内容只读 + 补充细节 / 补充文件 */}
              <div className="rounded-2xl border border-zinc-700/40 bg-zinc-900/30 px-4 py-4" id="advance-modal-fields">
                <PoolDetailsAndAttachmentsFields
                  variant="advanceSupplement"
                  lockedDescription={pool.description ?? ''}
                  attachments={pool.attachments ?? []}
                  removeNames={[]}
                  newFiles={advanceNewFiles}
                  description={advanceSupplementDesc}
                  onDescriptionChange={setAdvanceSupplementDesc}
                  onToggleRemove={() => {}}
                  onAddFiles={(files) =>
                    setAdvanceNewFiles((prev) => [...prev, ...files].slice(0, 10))
                  }
                  onRemoveNewFile={(i) =>
                    setAdvanceNewFiles((prev) => prev.filter((_, idx) => idx !== i))
                  }
                  onClickUpload={() => advanceFileInputRef.current?.click()}
                  disabled={advanceModalBusy}
                  advanceSupplementUiEpoch={advanceSupplementUiEpoch}
                />
              </div>

              {advanceModalError && (
                <div
                  className="rounded-xl border border-rose-500/25 bg-rose-950/35 px-3.5 py-2.5 text-xs text-rose-200/95 leading-relaxed"
                  role="alert"
                >
                  {advanceModalError}
                </div>
              )}
            </div>

            <div className="px-5 pb-5 pt-1 flex justify-end bg-zinc-950/40">
              <button
                type="button"
                disabled={advanceModalBusy}
                aria-label={advanceModalBusy ? '正在进入下一轮' : '确认并进入下一轮'}
                onClick={() => void handleAdvanceConfirmSubmit()}
                className="w-[52px] h-[43px] min-w-[52px] min-h-[43px] max-w-[52px] max-h-[43px] rounded-xl p-0 text-zinc-950 bg-gradient-to-b from-amber-400 to-amber-600 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.22),0_4px_14px_rgba(245,158,11,0.22),0_1px_3px_rgba(0,0,0,0.45)] hover:from-amber-300 hover:to-amber-500 hover:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.25),0_6px_20px_rgba(245,158,11,0.28)] active:brightness-[0.93] active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none disabled:shadow-none transition-[filter,background-color,transform,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/55 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 flex items-center justify-center"
              >
                {advanceModalBusy ? (
                  <Loader2 size={22} className="animate-spin text-zinc-950/90" aria-hidden />
                ) : (
                  <Play size={22} className="fill-current text-zinc-950 shrink-0 drop-shadow-[0_1px_1px_rgba(255,255,255,0.25)]" aria-hidden />
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default memo(PoolColumnInner)
