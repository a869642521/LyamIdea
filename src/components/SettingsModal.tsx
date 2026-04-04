'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Settings, X, Check, Loader2, AlertCircle, Wifi, WifiOff, Plus, Trash2 } from 'lucide-react'
import { LLM_PRESETS } from '@/lib/llm-presets'
import { useLanguage } from '@/contexts/LanguageContext'

interface SettingsModalProps {
  open: boolean
  onClose: () => void
  onModeChange?: (useMock: boolean) => void
}

export interface LLMConfigItem {
  id: string
  name: string
  apiKey: string
  baseUrl: string
  model: string
  useMock: boolean
  /** 是否参与多模型随机分配（≥2 个时启用多模型模式） */
  participating?: boolean
}

type SaveStatus = 'idle' | 'saving' | 'success' | 'error'
type TestStatus = 'idle' | 'testing' | 'ok' | 'fail'

const LS_KEY = 'idea_llm_configs'
const DEFAULT_BASE_URL = 'https://api.openai.com/v1'
const DEFAULT_MODEL = 'gpt-4o-mini'

interface StoredData {
  configs: LLMConfigItem[]
  activeId: string
}

function loadStoredConfigs(): StoredData {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return { configs: [], activeId: '' }
    const parsed = JSON.parse(raw)
    if (!parsed || !Array.isArray(parsed.configs)) return { configs: [], activeId: '' }
    return {
      configs: parsed.configs,
      activeId: typeof parsed.activeId === 'string' ? parsed.activeId : '',
    }
  } catch {
    return { configs: [], activeId: '' }
  }
}

/** 兼容旧版单配置 localStorage，迁移后移除旧 key 并写入新格式 */
export function migrateFromLegacy(): StoredData | null {
  try {
    const raw = localStorage.getItem('idea_llm_config')
    if (!raw) return null
    const old = JSON.parse(raw)
    if (!old || typeof old !== 'object') return null
    const id = 'legacy-' + Date.now()
    const config: LLMConfigItem = {
      id,
      name: '默认配置',
      apiKey: old.apiKey ?? '',
      baseUrl: old.baseUrl ?? DEFAULT_BASE_URL,
      model: old.model ?? DEFAULT_MODEL,
      useMock: old.useMock ?? true,
    }
    const result: StoredData = { configs: [config], activeId: id }
    localStorage.removeItem('idea_llm_config')
    saveStoredConfigs(result)
    return result
  } catch {
    return null
  }
}

function saveStoredConfigs(data: StoredData) {
  localStorage.setItem(LS_KEY, JSON.stringify(data))
}

function generateId() {
  return 'llm-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9)
}

export default function SettingsModal({ open, onClose, onModeChange }: SettingsModalProps) {
  const { t } = useLanguage()
  const [configs, setConfigs] = useState<LLMConfigItem[]>([])
  const [activeId, setActiveId] = useState('')
  const [editingId, setEditingId] = useState<string | 'new' | null>(null)
  const [form, setForm] = useState<LLMConfigItem>({
    id: '',
    name: '',
    apiKey: '',
    baseUrl: DEFAULT_BASE_URL,
    model: DEFAULT_MODEL,
    useMock: true,
  })
  const [presetName, setPresetName] = useState('')
  const [modelNote, setModelNote] = useState('')
  const [presetModels, setPresetModels] = useState<string[]>([])
  const [customModelInput, setCustomModelInput] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [testStatus, setTestStatus] = useState<TestStatus>('idle')
  const [testMsg, setTestMsg] = useState('')
  const [serverInfo, setServerInfo] = useState<{ hasKey: boolean; model: string; useMock: boolean } | null>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const presetSelectRef = useRef<HTMLSelectElement>(null)
  /** 保存成功后的「恢复 idle」定时器，关弹窗或卸载时需清理 */
  const statusIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const openRef = useRef(open)

  const persist = useCallback((nextConfigs: LLMConfigItem[], nextActiveId: string) => {
    setConfigs(nextConfigs)
    setActiveId(nextActiveId)
    saveStoredConfigs({ configs: nextConfigs, activeId: nextActiveId })
  }, [])

  const resetValidationState = useCallback(() => {
    setStatus('idle')
    setErrorMsg('')
    setTestStatus('idle')
    setTestMsg('')
  }, [])

  const updateForm = useCallback(
    (updater: (prev: LLMConfigItem) => LLMConfigItem) => {
      setForm((prev) => updater(prev))
      resetValidationState()
    },
    [resetValidationState]
  )

  useEffect(() => {
    openRef.current = open
  }, [open])

  useEffect(() => {
    if (!open) {
      if (statusIdleTimerRef.current) {
        clearTimeout(statusIdleTimerRef.current)
        statusIdleTimerRef.current = null
      }
    }
  }, [open])

  // Load from server + localStorage on open
  useEffect(() => {
    if (!open) return
    const ac = new AbortController()
    fetch('/api/llm-config', { signal: ac.signal })
      .then((r) => r.json())
      .then((data) => {
        if (!openRef.current) return
        setServerInfo({ hasKey: data.hasKey, model: data.model, useMock: data.useMock })
      })
      .catch(() => {})

    const migrated = migrateFromLegacy()
    const stored = migrated ?? loadStoredConfigs()
    queueMicrotask(() => {
      if (!openRef.current) return
      setConfigs(stored.configs)
      setActiveId(stored.activeId)
      setEditingId(null)
      resetValidationState()
    })
    if (migrated) saveStoredConfigs(stored)

    // 恢复多模型参与配置到服务端
    const participating = stored.configs.filter(
      (c) => c.participating && !c.useMock && c.apiKey && c.baseUrl && c.model
    )
    if (participating.length > 0) {
      fetch('/api/llm-config/multi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          configs: participating.map((c) => ({
            apiKey: c.apiKey,
            baseUrl: c.baseUrl,
            model: c.model,
            useMock: false,
          })),
        }),
      }).catch(() => {})
    }
    return () => ac.abort()
  }, [open, resetValidationState])


  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === overlayRef.current) onClose()
  }

  function startAdd() {
    const preset = LLM_PRESETS.find((p) => p.name && p.baseUrl)
    setForm({
      id: '',
      name: '',
      apiKey: '',
      baseUrl: preset?.baseUrl ?? DEFAULT_BASE_URL,
      model: preset?.model ?? DEFAULT_MODEL,
      useMock: true,
    })
    setPresetName('')
    setModelNote('')
    setPresetModels([])
    setCustomModelInput(false)
    setEditingId('new')
    resetValidationState()
  }

  function startEdit(c: LLMConfigItem) {
    setForm({ ...c })
    const match = LLM_PRESETS.find((p) => p.baseUrl === c.baseUrl)
    setPresetName(match?.name ?? '')
    setModelNote(match?.modelNote ?? '')
    const models = match?.models ?? []
    setPresetModels(models)
    setCustomModelInput(models.length > 0 && !models.includes(c.model))
    setEditingId(c.id)
    resetValidationState()
  }

  function cancelEdit() {
    setEditingId(null)
    setPresetModels([])
    setCustomModelInput(false)
    setTestStatus('idle')
    setTestMsg('')
  }

  function handlePresetChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const name = e.target.value
    setPresetName(name)
    const preset = LLM_PRESETS.find((p) => p.name === name)
    if (preset && preset.baseUrl) {
      updateForm((p) => ({ ...p, baseUrl: preset.baseUrl, model: preset.model }))
      setModelNote(preset.modelNote ?? '')
      setPresetModels(preset.models ?? [])
      setCustomModelInput(false)
    } else {
      setModelNote('')
      setPresetModels([])
      setCustomModelInput(false)
    }
  }

  function handleSetActive(c: LLMConfigItem) {
    persist(configs, c.id)
    fetch('/api/llm-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(c),
    })
      .then((r) => r.json())
      .then((data) => {
        if (!openRef.current) return
        setServerInfo({ hasKey: data.hasKey, model: data.model, useMock: data.useMock })
        onModeChange?.(data.useMock)
      })
      .catch(() => {})
  }

  /** 同步「参与多模型」配置列表到服务端 */
  function syncParticipatingToServer(cfgs: LLMConfigItem[]) {
    const participating = cfgs.filter((c) => c.participating && !c.useMock && c.apiKey && c.baseUrl && c.model)
    fetch('/api/llm-config/multi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        configs: participating.map((c) => ({
          apiKey: c.apiKey,
          baseUrl: c.baseUrl,
          model: c.model,
          useMock: false,
        })),
      }),
    }).catch(() => {})
  }

  function handleToggleParticipating(id: string) {
    const next = configs.map((c) =>
      c.id === id ? { ...c, participating: !c.participating } : c
    )
    persist(next, activeId)
    syncParticipatingToServer(next)
  }

  function handleDelete(id: string, e?: React.MouseEvent) {
    e?.preventDefault()
    e?.stopPropagation()
    const deletedWasActive = activeId === id
    const next = configs.filter((c) => c.id !== id)
    const nextActive = deletedWasActive ? (next[0]?.id ?? '') : activeId
    persist(next, nextActive)
    if (editingId === id) setEditingId(null)

    if (next.length === 0) {
      fetch('/api/llm-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          useMock: true,
          apiKey: '',
          baseUrl: DEFAULT_BASE_URL,
          model: DEFAULT_MODEL,
        }),
      })
        .then((r) => r.json())
        .then((d) => {
          if (!openRef.current) return
          setServerInfo({ hasKey: d.hasKey, model: d.model, useMock: d.useMock })
          onModeChange?.(d.useMock)
        })
        .catch(() => {})
      fetch('/api/llm-config/multi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ configs: [] }),
      }).catch(() => {})
      return
    }

    if (deletedWasActive && nextActive && next.find((c) => c.id === nextActive)) {
      handleSetActive(next.find((c) => c.id === nextActive)!)
    }
    syncParticipatingToServer(next)
  }

  async function handleSave() {
    setStatus('saving')
    setErrorMsg('')
    const name = form.name.trim() || (LLM_PRESETS.find((p) => p.baseUrl === form.baseUrl && p.model === form.model)?.name ?? '未命名')
    const toSave: LLMConfigItem = { ...form, name }

    try {
      const res = await fetch('/api/llm-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toSave),
      })
      const data = await res.json()
      if (!openRef.current) return
      if (!res.ok) {
        setStatus('error')
        setErrorMsg(data.error ?? '保存失败')
        return
      }

      if (editingId === 'new') {
        toSave.id = generateId()
        persist([...configs, toSave], toSave.id)
        // 新配置保存后设为当前并已 POST，无需再调用 handleSetActive
      } else {
        const next = configs.map((c) => (c.id === editingId ? { ...toSave, id: c.id } : c))
        persist(next, activeId)
        if (activeId === editingId) {
          fetch('/api/llm-config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...toSave, id: editingId }),
          })
            .then((r) => r.json())
            .then((d) => {
              if (!openRef.current) return
              setServerInfo({ hasKey: d.hasKey, model: d.model, useMock: d.useMock })
              onModeChange?.(d.useMock)
            })
            .catch(() => {})
        }
      }
      setStatus('success')
      setServerInfo({ hasKey: data.hasKey, model: data.model, useMock: data.useMock })
      onModeChange?.(data.useMock)
      setEditingId(null)
      if (statusIdleTimerRef.current) clearTimeout(statusIdleTimerRef.current)
      statusIdleTimerRef.current = setTimeout(() => {
        statusIdleTimerRef.current = null
        setStatus('idle')
      }, 2000)
    } catch (e) {
      if (!openRef.current) return
      setStatus('error')
      setErrorMsg(e instanceof Error ? e.message : '网络错误')
    }
  }

  const activeConfig = configs.find((c) => c.id === activeId)
  const isFormOpen = editingId === 'new' || editingId !== null
  const selectedPreset = LLM_PRESETS.find((p) => p.baseUrl === form.baseUrl && p.model === form.model)
  const requiredMissing = (() => {
    if (form.useMock) return []
    const missing: string[] = []
    if (!form.apiKey.trim()) missing.push('API Key')
    if (!form.baseUrl.trim()) missing.push('Base URL')
    if (!form.model.trim()) missing.push('模型')
    return missing
  })()
  const canTest = !form.useMock && requiredMissing.length === 0 && testStatus !== 'testing'
  const canSave = form.useMock || requiredMissing.length === 0

  if (!open) return null

  const renderEditForm = () => (
    <>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-violet-300">
          {editingId === 'new' ? t('addNewConfig') : t('editConfig')}
        </span>
        <button onClick={cancelEdit} className="text-[11px] text-zinc-500 hover:text-zinc-300">
          {t('cancelLabel')}
        </button>
      </div>
      <div className="space-y-1.5">
        <label className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">{t('selectPreset')}</label>
        <select
          ref={presetSelectRef}
          value={presetName || (LLM_PRESETS.find((p) => p.baseUrl === form.baseUrl && p.model === form.model)?.name ?? '')}
          onChange={handlePresetChange}
          className="w-full px-3 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700/60 text-sm text-zinc-100 focus:outline-none focus:border-violet-500/60 appearance-none cursor-pointer"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 12px center',
            paddingRight: '2.5rem',
          }}
        >
          <option value="">{t('manualInput')}</option>
          {LLM_PRESETS.filter((p) => p.name !== '自定义').map((p) => (
            <option key={p.name} value={p.name}>{p.name}</option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <label className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">{t('configName')}</label>
        <input
          type="text"
          placeholder={t('configNamePlaceholder')}
          value={form.name}
          onChange={(e) => updateForm((p) => ({ ...p, name: e.target.value }))}
          className="w-full px-3 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700/60 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500/60"
        />
      </div>
      <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-800/60 border border-zinc-700/40">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex shrink-0 w-4 h-4 items-center justify-center">
            {form.useMock ? (
              <WifiOff size={15} className="text-zinc-400 shrink-0" />
            ) : (
              <Wifi size={15} className="text-emerald-400 shrink-0" />
            )}
          </span>
          <span className="text-xs text-zinc-300">{form.useMock ? t('mockModeLabel') : t('realAILabel')}</span>
        </div>
        <button
          onClick={() => updateForm((p) => ({ ...p, useMock: !p.useMock }))}
          className={`relative w-10 h-5 rounded-full transition-colors ${form.useMock ? 'bg-zinc-600' : 'bg-violet-600'}`}
        >
          <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${form.useMock ? 'left-0.5' : 'left-5'}`} />
        </button>
      </div>
      {!form.useMock && (
        <div className="space-y-2">
          {selectedPreset?.name && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5 text-[11px] text-emerald-300/90">
              {t('currentPreset')}{selectedPreset.name}
            </div>
          )}
          {requiredMissing.length > 0 && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 text-[11px] leading-relaxed text-amber-300/90">
              {t('missingFields')}{requiredMissing.join('、')}
            </div>
          )}
        </div>
      )}
      <div className="space-y-1.5">
        <label className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">{t('apiKey')}</label>
        <div className="relative">
          <input
            type={showKey ? 'text' : 'password'}
            placeholder="sk-..."
            value={form.apiKey}
            onChange={(e) => updateForm((p) => ({ ...p, apiKey: e.target.value }))}
            className="w-full px-3 py-2.5 pr-16 rounded-xl bg-zinc-800 border border-zinc-700/60 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500/60 font-mono"
          />
          <button onClick={() => setShowKey((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-zinc-500 hover:text-zinc-300">
            {showKey ? t('hideKey') : t('showKey')}
          </button>
        </div>
      </div>
      <div className="space-y-1.5">
        <label className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">{t('baseUrl')}</label>
        <input
          type="text"
          placeholder={DEFAULT_BASE_URL}
          value={form.baseUrl}
          onChange={(e) => updateForm((p) => ({ ...p, baseUrl: e.target.value }))}
          className="w-full px-3 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700/60 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500/60 font-mono"
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">{t('modelLabel')}</label>
        {presetModels.length > 0 && !customModelInput ? (
          <select
            value={form.model}
            onChange={(e) => {
              if (e.target.value === '__custom__') {
                setCustomModelInput(true)
                updateForm((p) => ({ ...p, model: '' }))
              } else {
                updateForm((p) => ({ ...p, model: e.target.value }))
              }
            }}
            className="w-full px-3 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700/60 text-sm text-zinc-100 focus:outline-none focus:border-violet-500/60 appearance-none cursor-pointer font-mono"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 12px center',
              paddingRight: '2.5rem',
            }}
          >
            {presetModels.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
            <option value="__custom__">{t('otherModel')}</option>
          </select>
        ) : (
          <div className="flex gap-2">
            <input
              type="text"
              placeholder={modelNote ? t('modelLabel') : DEFAULT_MODEL}
              value={form.model}
              onChange={(e) => updateForm((p) => ({ ...p, model: e.target.value }))}
              className="flex-1 px-3 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700/60 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500/60 font-mono"
            />
            {customModelInput && (
              <button
                onClick={() => {
                  setCustomModelInput(false)
                  updateForm((p) => ({ ...p, model: presetModels[0] ?? '' }))
                }}
                className="px-3 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700/60 text-[11px] text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 whitespace-nowrap"
              >
                {t('backToList')}
              </button>
            )}
          </div>
        )}
        {modelNote && <p className="text-[11px] text-amber-400/80 leading-relaxed">{modelNote}</p>}
      </div>
      {/* 测试连接 */}
      {!form.useMock && (
        <div className="space-y-2">
          <button
            type="button"
            disabled={!canTest}
            onClick={async () => {
              setTestStatus('testing')
              setTestMsg('')
              try {
                const res = await fetch('/api/llm-config/test', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ apiKey: form.apiKey, baseUrl: form.baseUrl, model: form.model }),
                })
                const data = await res.json()
                if (data.ok) {
                  setTestStatus('ok')
                  setTestMsg('连接成功，模型可正常响应')
                } else {
                  setTestStatus('fail')
                  setTestMsg(data.error ?? '连接失败')
                }
              } catch {
                setTestStatus('fail')
                setTestMsg('网络错误，无法连接到测试服务')
              }
            }}
            className={`w-full py-2 rounded-xl text-sm font-medium flex items-center justify-center gap-2 border transition-all ${
              testStatus === 'testing'
                ? 'bg-zinc-800 border-zinc-700 text-zinc-400 cursor-not-allowed'
                : testStatus === 'ok'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : testStatus === 'fail'
                ? 'bg-red-500/10 border-red-500/30 text-red-400'
                : !canTest
                ? 'bg-zinc-800/40 border-zinc-700/40 text-zinc-600 cursor-not-allowed'
                : 'bg-zinc-800 border-zinc-700/60 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100'
            }`}
          >
            <span className="flex items-center justify-center w-3.5 h-3.5 shrink-0">
              {testStatus === 'testing' ? (
                <Loader2 size={13} className="animate-spin" />
              ) : testStatus === 'ok' ? (
                <Check size={13} />
              ) : testStatus === 'fail' ? (
                <AlertCircle size={13} />
              ) : (
                <Wifi size={13} />
              )}
            </span>
            {testStatus === 'testing' ? t('testing') : testStatus === 'ok' ? t('connectionOk') : testStatus === 'fail' ? t('connectionFail') : t('testConnection')}
          </button>
          {testMsg && (
            <div className={`rounded-xl border px-3 py-2.5 text-[11px] leading-relaxed ${
              testStatus === 'ok'
                ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400/90'
                : 'border-red-500/20 bg-red-500/5 text-red-400/90'
            }`}>
              <p className="font-medium mb-1">{testStatus === 'ok' ? t('connSuccessHeader') : t('connFailHeader')}</p>
              <p>{testMsg}</p>
              {testStatus === 'fail' && form.baseUrl.includes('kimi') && (
                <div className="mt-2 pt-2 border-t border-red-500/10 text-red-300/80">
                  <p className="font-medium">{t('kimiTroubleshoot')}</p>
                  <ul className="list-disc list-inside mt-1 space-y-0.5">
                    <li>{t('kimiTip1')}</li>
                    <li>{t('kimiTip2')}</li>
                    <li>{t('kimiTip3')}</li>
                    <li>{t('kimiTip4')}</li>
                  </ul>
                </div>
              )}
              {testStatus === 'fail' && form.baseUrl.includes('volces') && (
                <div className="mt-2 pt-2 border-t border-red-500/10 text-red-300/80">
                  <p className="font-medium">{t('volcanoTroubleshoot')}</p>
                  <ul className="list-disc list-inside mt-1 space-y-0.5">
                    <li>{t('volcanoTip1')}</li>
                    <li>{t('volcanoTip2')}</li>
                    <li>{t('volcanoTip3')}</li>
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {status === 'error' && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
          <AlertCircle size={14} className="text-red-400 shrink-0 mt-0.5" />
          <p className="text-xs text-red-300">{errorMsg}</p>
        </div>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={cancelEdit}
          className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-zinc-700/60 bg-zinc-800 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 transition-all"
        >
          {t('cancelLabel')}
        </button>
        <button
          onClick={handleSave}
          disabled={status === 'saving' || !canSave}
          className={`flex-[1.4] py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-all ${
            status === 'success'
              ? 'bg-emerald-600/80 text-white border border-emerald-500/40'
              : status === 'saving'
                ? 'bg-violet-700/60 text-violet-300 cursor-not-allowed border border-violet-600/30'
                : !canSave
                  ? 'bg-zinc-800/40 border border-zinc-700/40 text-zinc-600 cursor-not-allowed'
                  : 'bg-violet-600 hover:bg-violet-500 text-white border border-violet-500/40'
          }`}
        >
          <span className="flex items-center justify-center w-3.5 h-3.5 shrink-0">
            {status === 'saving' ? <Loader2 size={14} className="animate-spin" /> : status === 'success' ? <Check size={14} /> : null}
          </span>
          {status === 'saving' ? t('savingLabel') : status === 'success' ? t('savedLabel') : form.useMock ? t('saveConfig') : t('saveAndSet')}
        </button>
      </div>
    </>
  )

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm"
    >
      <div className="relative w-full max-w-lg mx-4 max-h-[90vh] overflow-hidden flex flex-col rounded-2xl border border-zinc-700/60 bg-zinc-900 shadow-2xl shadow-black/60">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-violet-600/20 border border-violet-500/30 flex items-center justify-center">
              <Settings size={15} className="text-violet-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-zinc-100">{t('settingsTitle')}</p>
              <p className="text-[11px] text-zinc-500">{t('settingsSubtitle')}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* 帮助提示 - 仅在无配置或添加新配置时显示 */}
          {(configs.length === 0 || editingId === 'new') && (
            <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-3 space-y-2">
              <p className="text-[11px] font-medium text-violet-300">{t('settingsGuideTitle')}</p>
              <div className="grid grid-cols-1 gap-2 text-[11px] text-zinc-400">
                <div className="flex items-start gap-2">
                  <span className="text-violet-400 shrink-0">①</span>
                  <span>{t('settingsGuide1')}</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-violet-400 shrink-0">②</span>
                  <span>
                    <strong className="text-zinc-300">{t('settingsGuide2Prefix')}</strong>
                    {t('settingsGuide2Body')}
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-violet-400 shrink-0">③</span>
                  <span>
                    <strong className="text-zinc-300">{t('settingsGuide3Prefix')}</strong>
                    {t('settingsGuide3Body')}
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-violet-400 shrink-0">④</span>
                  <span>{t('settingsGuide4')}</span>
                </div>
              </div>
            </div>
          )}

          {/* 配置列表 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">{t('savedConfigs')}</span>
              <button
                onClick={startAdd}
                className="text-[11px] text-violet-400 hover:text-violet-300 flex items-center gap-1"
              >
                <Plus size={12} />
                {t('addModel')}
              </button>
            </div>

            {/* 添加新配置：表单在列表上方 */}
            {editingId === 'new' && (
              <div key="form-new" className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-4 space-y-4">
                {renderEditForm()}
              </div>
            )}

            {configs.length === 0 && editingId !== 'new' ? (
              <div className="rounded-xl border border-dashed border-zinc-700/60 py-6 text-center text-zinc-500 text-sm">
                {t('noConfig')}
              </div>
            ) : (
              <div className="space-y-2">
                {configs.map((c) => (
                  <div key={c.id} className="space-y-2">
                    <div
                      className={`rounded-xl border p-3 flex flex-col gap-0 ${
                        activeId === c.id
                          ? 'bg-violet-500/10 border-violet-500/40'
                          : 'bg-zinc-800/40 border-zinc-700/50'
                      }`}
                    >
                    {/* 第一行：名称 + 操作按钮 */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-zinc-200 truncate">{c.name || '未命名'}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px]">
                          <span className={`px-1.5 py-0.5 rounded border ${c.useMock ? 'border-zinc-700 text-zinc-400' : 'border-emerald-500/30 text-emerald-400'}`}>
                            {c.useMock ? t('mockModeLabel') : t('realAILabel')}
                          </span>
                          {activeId === c.id && (
                            <span className="px-1.5 py-0.5 rounded border border-violet-500/30 text-violet-300">
                              {t('currentLabel')}
                            </span>
                          )}
                          {c.participating && !c.useMock && (
                            <span className="px-1.5 py-0.5 rounded border border-emerald-500/25 text-emerald-400">
                              {t('multiModelLabel')}
                            </span>
                          )}
                          {/* Provider 类型标签 */}
                          {!c.useMock && (
                            <>
                              {c.baseUrl.includes('kimi.com/coding') && (
                                <span className="px-1.5 py-0.5 rounded bg-sky-500/10 border border-sky-500/20 text-sky-400">
                                  Kimi Code
                                </span>
                              )}
                              {c.baseUrl.includes('volces.com') && c.baseUrl.includes('coding') && (
                                <span className="px-1.5 py-0.5 rounded bg-orange-500/10 border border-orange-500/20 text-orange-400">
                                  火山 CodingPlan
                                </span>
                              )}
                              {c.baseUrl.includes('openai.com') && (
                                <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                                  OpenAI
                                </span>
                              )}
                              {c.baseUrl.includes('deepseek.com') && (
                                <span className="px-1.5 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-400">
                                  DeepSeek
                                </span>
                              )}
                            </>
                          )}
                          <span className="text-zinc-500 truncate">{c.model || '未设置模型'}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {activeId !== c.id && (
                          <button
                            onClick={() => handleSetActive(c)}
                            className="text-[10px] px-2 py-1 rounded-md bg-violet-600/60 hover:bg-violet-600 text-white"
                          >
                            {t('setCurrent')}
                          </button>
                        )}
                        <button
                          onClick={() => startEdit(c)}
                          className="w-7 h-7 rounded-md flex items-center justify-center text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700"
                          title="编辑"
                        >
                          <Settings size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={(ev) => handleDelete(c.id, ev)}
                          className="w-7 h-7 rounded-md flex items-center justify-center text-zinc-400 hover:text-red-400 hover:bg-red-500/10"
                          title="删除"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>

                    {/* 第二行：多模型开关 */}
                    {(() => {
                      // 目前两类 Coding Plan 都已通过对应方式兼容，暂无需禁用
                      // Kimi For Coding：通过 User-Agent 伪装成 RooCode 绕过客户端门控
                      // 火山方舟 CodingPlan：标准 OpenAI 兼容接口，无 User-Agent 限制
                      const isCodingOnly = false
                      const isDisabled = c.useMock || isCodingOnly
                      return (
                        <div className={`flex flex-col gap-1.5 mt-2.5 pt-2.5 border-t ${
                          activeId === c.id ? 'border-violet-500/20' : 'border-zinc-700/40'
                        }`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 min-w-0 flex-1">
                              <span className={`text-[11px] ${isDisabled ? 'text-zinc-500' : 'text-zinc-400'}`}>
                                {t('participateMulti')}
                              </span>
                              {c.useMock ? (
                                <button
                                  onClick={() => startEdit(c)}
                                  className="text-[10px] text-amber-500/80 hover:text-amber-400 underline underline-offset-2"
                                >
                                  {t('needRealAI')}
                                </button>
                              ) : !isCodingOnly && c.participating ? (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                                  {t('joinedLabel')}
                                </span>
                              ) : null}
                            </div>
                            <button
                              onClick={() => {
                                if (!isDisabled) handleToggleParticipating(c.id)
                              }}
                              className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${
                                isDisabled
                                  ? 'bg-zinc-700/30 opacity-30 cursor-not-allowed'
                                  : c.participating
                                  ? 'bg-emerald-600 cursor-pointer'
                                  : 'bg-zinc-600 hover:bg-zinc-500 cursor-pointer'
                              }`}
                            >
                              <span
                                className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${
                                  c.participating && !isDisabled ? 'left-4' : 'left-0.5'
                                }`}
                              />
                            </button>
                          </div>
                          {isCodingOnly && !c.useMock && (
                            <p className="text-[10px] text-amber-500/80 leading-relaxed">
                              ⚠️ 该端点仅限特定 Agent 使用，不支持加入多模型池
                            </p>
                          )}
                        </div>
                      )
                    })()}
                    </div>

                    {/* 编辑配置：表单紧挨着该配置卡片下方 */}
                    {editingId === c.id && (
                      <div key={`form-edit-${c.id}`} className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-4 space-y-4">
                        {renderEditForm()}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>


          {/* Server status + multi-model status */}
          {!isFormOpen && (
            <div className="space-y-2">
              {serverInfo && (
                <p className="text-[11px] text-zinc-600">
                  {t('currentUsing')}{serverInfo.useMock ? t('mockModeLabel') : activeConfig ? `${activeConfig.name} · ${serverInfo.model}` : '-'}
                </p>
              )}
              {(() => {
                const participatingCount = configs.filter((c) => c.participating && !c.useMock).length
                const isEnabled = participatingCount >= 2
                if (participatingCount === 0) return null
                return (
                  <div className={`flex items-start gap-2 px-3 py-2 rounded-xl border text-[11px] ${
                    isEnabled
                      ? 'bg-emerald-500/8 border-emerald-500/20 text-emerald-400/80'
                      : 'bg-amber-500/8 border-amber-500/20 text-amber-400/80'
                  }`}>
                    <span className={`mt-0.5 w-1.5 h-1.5 rounded-full shrink-0 ${isEnabled ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                    <span>
                      {isEnabled
                        ? t('multiReady', participatingCount)
                        : t('multiNeedMore', participatingCount, 2 - participatingCount)}
                    </span>
                  </div>
                )
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export { Settings as SettingsIcon }
