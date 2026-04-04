'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Globe, X, Loader2, Check, AlertCircle, ExternalLink } from 'lucide-react'
import { useLanguage } from '@/contexts/LanguageContext'
import type { FocusEvidenceProviderMode } from '@/lib/web-search-config'

interface BraveSearchConfigModalProps {
  open: boolean
  onClose: () => void
}

type TestStatus = 'idle' | 'testing' | 'ok' | 'fail'

export default function BraveSearchConfigModal({ open, onClose }: BraveSearchConfigModalProps) {
  const { t } = useLanguage()
  const overlayRef = useRef<HTMLDivElement>(null)
  const [tokenInput, setTokenInput] = useState('')
  const [clearOverride, setClearOverride] = useState(false)
  const [providerMode, setProviderMode] = useState<FocusEvidenceProviderMode>('auto')
  const [braveKeyMasked, setBraveKeyMasked] = useState('')
  const [braveOverrideActive, setBraveOverrideActive] = useState(false)
  const [hasBraveKey, setHasBraveKey] = useState(false)
  const [effectiveProvider, setEffectiveProvider] = useState<'brave' | 'google' | null>(null)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'ok' | 'err'>('idle')
  const [saveErr, setSaveErr] = useState('')
  const [testStatus, setTestStatus] = useState<TestStatus>('idle')
  const [testMsg, setTestMsg] = useState('')
  const openRef = useRef(open)

  useEffect(() => {
    openRef.current = open
  }, [open])

  const load = useCallback(() => {
    fetch('/api/web-search-config')
      .then((r) => r.json())
      .then((d) => {
        if (!openRef.current) return
        setBraveKeyMasked(typeof d.braveKeyMasked === 'string' ? d.braveKeyMasked : '')
        setBraveOverrideActive(!!d.braveOverrideActive)
        setHasBraveKey(!!d.hasBraveKey)
        setEffectiveProvider(d.effectiveProvider ?? null)
        const mode = d.focusProviderMode
        setProviderMode(mode === 'brave' || mode === 'google' ? mode : 'auto')
        setTokenInput('')
        setClearOverride(false)
        setSaveStatus('idle')
        setSaveErr('')
        setTestStatus('idle')
        setTestMsg('')
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (open) load()
  }, [open, load])

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === overlayRef.current) onClose()
  }

  async function handleSave() {
    setSaveStatus('saving')
    setSaveErr('')
    try {
      const body: {
        clearBraveApiKey?: boolean
        braveApiKey?: string
        focusEvidenceProvider?: FocusEvidenceProviderMode
      } = { focusEvidenceProvider: providerMode }

      if (clearOverride) {
        body.clearBraveApiKey = true
      } else if (tokenInput.trim()) {
        body.braveApiKey = tokenInput.trim()
      }

      const res = await fetch('/api/web-search-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        setSaveStatus('err')
        setSaveErr(typeof data.error === 'string' ? data.error : '保存失败')
        return
      }
      setBraveKeyMasked(data.braveKeyMasked ?? '')
      setBraveOverrideActive(!!data.braveOverrideActive)
      setHasBraveKey(!!data.hasBraveKey)
      setEffectiveProvider(data.effectiveProvider ?? null)
      setTokenInput('')
      setClearOverride(false)
      setSaveStatus('ok')
      setTimeout(() => setSaveStatus('idle'), 2000)
    } catch (e) {
      setSaveStatus('err')
      setSaveErr(e instanceof Error ? e.message : '网络错误')
    }
  }

  async function handleTest() {
    setTestStatus('testing')
    setTestMsg('')
    try {
      const trimmed = tokenInput.trim()
      const res = await fetch('/api/web-search-config/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(trimmed ? { braveApiKey: trimmed } : {}),
      })
      const data = await res.json()
      if (data.ok) {
        setTestStatus('ok')
        setTestMsg(data.sampleTitle ? String(data.sampleTitle).slice(0, 120) : t('braveConnOk'))
      } else {
        setTestStatus('fail')
        setTestMsg(typeof data.error === 'string' ? data.error : t('braveConnFail'))
      }
    } catch {
      setTestStatus('fail')
      setTestMsg(t('braveConnFail'))
    }
  }

  if (!open) return null

  const effLabel =
    effectiveProvider === 'brave' ? 'Brave' : effectiveProvider === 'google' ? 'Google' : '—'

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm"
    >
      <div className="relative w-full max-w-md mx-4 max-h-[90vh] overflow-hidden flex flex-col rounded-2xl border border-zinc-700/60 bg-zinc-900 shadow-2xl shadow-black/60">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-orange-500/15 border border-orange-500/30 flex items-center justify-center shrink-0">
              <Globe size={16} className="text-orange-400" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-zinc-100">{t('braveSearchConfigTitle')}</p>
              <p className="text-[11px] text-zinc-500">{t('braveSearchConfigSubtitle')}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors shrink-0"
          >
            <X size={15} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 px-3 py-2.5 text-[11px] text-zinc-400 leading-relaxed">
            <p>{t('braveDashboardHint')}</p>
            <a
              href="https://api-dashboard.search.brave.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 mt-2 text-orange-400/90 hover:text-orange-300"
            >
              {t('braveOpenDashboard')}
              <ExternalLink size={11} />
            </a>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">
              {t('braveSubscriptionToken')}
            </label>
            {(braveOverrideActive || hasBraveKey) && (
              <p className="text-[11px] text-zinc-500 font-mono">
                {t('braveEffectiveLabel')}: {braveKeyMasked || '—'}
              </p>
            )}
            <input
              type="password"
              autoComplete="off"
              placeholder={t('braveKeyPlaceholder')}
              value={tokenInput}
              onChange={(e) => {
                setTokenInput(e.target.value)
                setClearOverride(false)
              }}
              className="w-full px-3 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700/60 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-orange-500/50 font-mono"
            />
            <p className="text-[10px] text-zinc-600">{t('braveKeyLeaveBlank')}</p>
            <label className="flex items-center gap-2 cursor-pointer text-[11px] text-zinc-400">
              <input
                type="checkbox"
                checked={clearOverride}
                onChange={(e) => {
                  setClearOverride(e.target.checked)
                  if (e.target.checked) setTokenInput('')
                }}
                className="rounded border-zinc-600 bg-zinc-800 text-orange-500"
              />
              {t('braveClearOverride')}
            </label>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">
              {t('braveProviderMode')}
            </label>
            <select
              value={providerMode}
              onChange={(e) => setProviderMode(e.target.value as FocusEvidenceProviderMode)}
              className="w-full px-3 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700/60 text-sm text-zinc-100 focus:outline-none focus:border-orange-500/50"
            >
              <option value="auto">{t('braveProviderAuto')}</option>
              <option value="brave">{t('braveProviderBrave')}</option>
              <option value="google">{t('braveProviderGoogle')}</option>
            </select>
            <p className="text-[10px] text-zinc-600">
              {t('braveEffectiveLabel')}: {effLabel}
            </p>
          </div>

          {testStatus !== 'idle' && (
            <div
              className={`rounded-xl border px-3 py-2.5 text-[11px] ${
                testStatus === 'ok'
                  ? 'border-emerald-500/25 bg-emerald-500/5 text-emerald-300/90'
                  : testStatus === 'fail'
                    ? 'border-red-500/25 bg-red-500/5 text-red-300/90'
                    : 'border-zinc-700 bg-zinc-800/50 text-zinc-400'
              }`}
            >
              <div className="flex items-center gap-2 font-medium">
                {testStatus === 'testing' && <Loader2 size={12} className="animate-spin" />}
                {testStatus === 'ok' && <Check size={12} />}
                {testStatus === 'fail' && <AlertCircle size={12} />}
                {testStatus === 'ok' ? t('braveConnOk') : testStatus === 'fail' ? t('braveConnFail') : '…'}
              </div>
              {testMsg && <p className="mt-1 text-zinc-400 break-words">{testMsg}</p>}
            </div>
          )}

          {saveStatus === 'err' && saveErr && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
              <AlertCircle size={14} className="text-red-400 shrink-0 mt-0.5" />
              <p className="text-xs text-red-300">{saveErr}</p>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={handleTest}
              disabled={testStatus === 'testing' || (!hasBraveKey && !tokenInput.trim())}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-zinc-700/60 bg-zinc-800 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {testStatus === 'testing' ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <Loader2 size={14} className="animate-spin" />
                  …
                </span>
              ) : (
                t('braveTestSearch')
              )}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saveStatus === 'saving'}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-all ${
                saveStatus === 'ok'
                  ? 'bg-emerald-600/80 text-white border border-emerald-500/40'
                  : saveStatus === 'saving'
                    ? 'bg-orange-700/60 text-orange-200 cursor-wait border border-orange-600/30'
                    : 'bg-orange-600 hover:bg-orange-500 text-white border border-orange-500/40'
              }`}
            >
              {saveStatus === 'saving' && <Loader2 size={14} className="animate-spin" />}
              {saveStatus === 'ok' && <Check size={14} />}
              {saveStatus === 'saving' ? '…' : saveStatus === 'ok' ? t('savedLabel') : t('braveSave')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
