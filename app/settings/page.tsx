'use client';

import { useEffect, useState } from 'react';

import type { AgentConfigUpdate } from '@/types/agent';
import { getAgentConfig, updateAgentConfig } from '@/lib/agent';
import Icon from '@/components/Icon';

export default function SettingsPage() {

  const [folders, setFolders] = useState('');
  const [scanInterval, setScanInterval] = useState(300);
  const [staleDays, setStaleDays] = useState(30);
  const [deadDays, setDeadDays] = useState(90);
  const [autoFetch, setAutoFetch] = useState(false);
  const [fetchInterval, setFetchInterval] = useState(60);

  const [geminiKey, setGeminiKey] = useState('');
  const [aiMode, setAiMode] = useState<'auto'|'ollama'|'gemini'|'disabled'>('auto');
  const [geminiKeySet, setGeminiKeySet] = useState(false);
  const [geminiModel, setGeminiModel] = useState('gemini-2.5-flash');
  const [providerStatus, setProviderStatus] = useState<any>(null);
  const [aiStats, setAiStats] = useState<{ollama_requests: number, gemini_requests: number} | null>(null);
  
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [agentOffline, setAgentOffline] = useState(false);

  useEffect(() => {
    fetch('/api/agent/ai/stats').then(r => r.json()).then(data => {
      if (data && typeof data.ollama_requests === 'number') setAiStats(data);
    }).catch(() => {});
    fetch('/api/agent/ai/provider-status').then(r => r.json()).then(data => {
      if (data && data.gemini) setProviderStatus(data);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    getAgentConfig().then(cfg => {
      if (!cfg) { setAgentOffline(true); return; }
      setFolders(cfg.watched_folders.join('\n'));
      setScanInterval(cfg.scan_interval_seconds);
      setStaleDays(cfg.stale_threshold_days);
      setDeadDays(cfg.dead_threshold_days);
      setAutoFetch(cfg.auto_fetch ?? false);
      setFetchInterval(cfg.fetch_interval_minutes ?? 60);
      setAiMode(cfg.ai_mode || 'auto');
      setGeminiKeySet(cfg.gemini_key_set || false);
      if (cfg.gemini_model) setGeminiModel(cfg.gemini_model);
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    const updates: AgentConfigUpdate = {
      watched_folders: folders.split('\n').map(f => f.trim()).filter(Boolean),
      scan_interval_seconds: scanInterval,
      stale_threshold_days: staleDays,
      dead_threshold_days: deadDays,
      auto_fetch: autoFetch,
      fetch_interval_minutes: fetchInterval,
      ai_enabled: aiMode !== 'disabled',
      ai_mode: aiMode,
      gemini_model: geminiModel,
    };
    if (geminiKey) updates.gemini_api_key = geminiKey;

    const result = await updateAgentConfig(updates);
    setSaving(false);
    if (result) {
      setSaved(true);
      setSaveError('');
      if (geminiKey) {
        setGeminiKeySet(true);
        setGeminiKey(''); // Clear input after successful save
        fetch('/api/agent/ai/provider-status').then(r => r.json()).then(data => {
          if (data && data.gemini) setProviderStatus(data);
        }).catch(() => {});
      }
      setTimeout(() => setSaved(false), 3000);
    } else {
      setSaveError('Failed to save — is the agent running? Start it with: python agent/main.py');
    }
  };

  return (
    <div className="settings-page">
      {/* Page header — mirrors Dashboard */}
      <header className="page-head settings-header">
        <div className="page-head-text">
          <h1 className="page-head-title">Settings</h1>
          <p className="page-head-sub">Configure the local agent, thresholds and AI routing</p>
        </div>

        <button
          id="save-settings-btn"
          className={`btn-primary settings-save-btn${saving ? ' settings-save-btn--saving' : ''}`}
          onClick={handleSave}
          disabled={agentOffline || saving}
        >
          {saving ? (
            <>
              <span className="btn-spinner" />
              Saving…
            </>
          ) : saved ? (
            <><Icon name="check" size={15} /> Saved</>
          ) : (
            'Save Settings'
          )}
        </button>
      </header>

      {/* Agent offline banner */}
      {agentOffline && (
        <div className="settings-banner settings-banner--warn" role="alert">
          <span className="settings-banner-icon"><Icon name="alert" size={16} /></span>
          <div>
            <strong>Agent is offline.</strong> Settings cannot be saved until the agent is running.
            Start it with <code>python agent/main.py</code>
          </div>
        </div>
      )}

      {/* Save-error banner */}
      {saveError && (
        <div className="settings-banner settings-banner--error" role="alert">
          <span className="settings-banner-icon"><Icon name="alert" size={16} /></span>
          <div>{saveError}</div>
        </div>
      )}

      {/* Settings grid */}
      <div className="settings-grid">

        {/* ── Watched Folders ── */}
        <section className="settings-card settings-card--wide">
          <div className="settings-card-header">
            <div className="settings-card-icon"><Icon name="folder" size={18} /></div>
            <div>
              <h2 className="settings-card-title">Watched Folders</h2>
              <p className="settings-card-desc">
                One folder path per line. The agent will scan these recursively for git repos.
              </p>
            </div>
          </div>
          <textarea
            id="watched-folders"
            className="settings-textarea"
            value={folders}
            onChange={e => setFolders(e.target.value)}
            placeholder={'C:\\Users\\you\\projects\nD:\\work'}
            rows={5}
          />
          <p className="settings-hint">
            {folders.split('\n').filter(Boolean).length} folder
            {folders.split('\n').filter(Boolean).length !== 1 ? 's' : ''} configured
          </p>
        </section>

        {/* ── Scan Settings ── */}
        <section className="settings-card">
          <div className="settings-card-header">
            <div className="settings-card-icon"><Icon name="sliders" size={18} /></div>
            <div>
              <h2 className="settings-card-title">Scan Settings</h2>
              <p className="settings-card-desc">Control how often and when repos are analysed.</p>
            </div>
          </div>

          <div className="settings-fields">
            <div className="settings-field">
              <label htmlFor="scan-interval" className="settings-label">
                Scan interval
                <span className="settings-label-hint">seconds</span>
              </label>
              <input
                id="scan-interval"
                type="number"
                className="settings-input"
                value={scanInterval}
                onChange={e => setScanInterval(Number(e.target.value))}
                min={60} max={3600}
              />
            </div>
            <div className="settings-field">
              <label htmlFor="stale-days" className="settings-label">
                Stale threshold
                <span className="settings-label-hint">days</span>
              </label>
              <input
                id="stale-days"
                type="number"
                className="settings-input"
                value={staleDays}
                onChange={e => setStaleDays(Number(e.target.value))}
                min={7} max={365}
              />
            </div>
            <div className="settings-field">
              <label htmlFor="dead-days" className="settings-label">
                Dead threshold
                <span className="settings-label-hint">days</span>
              </label>
              <input
                id="dead-days"
                type="number"
                className="settings-input"
                value={deadDays}
                onChange={e => setDeadDays(Number(e.target.value))}
                min={30} max={730}
              />
            </div>
            <div className="settings-field">
              <label htmlFor="auto-fetch" className="settings-label">
                <input
                  id="auto-fetch"
                  type="checkbox"
                  checked={autoFetch}
                  onChange={e => setAutoFetch(e.target.checked)}
                  style={{ marginRight: 8 }}
                />
                Fetch remotes in the background
                <span className="settings-label-hint">off by default</span>
              </label>
              <p className="settings-hint">
                Runs <code>git fetch</code> for each repo&apos;s upstream so ahead/behind counts stay current.
                Skipped when offline.
              </p>
            </div>
            {autoFetch && (
              <div className="settings-field">
                <label htmlFor="fetch-interval" className="settings-label">
                  Fetch at most every
                  <span className="settings-label-hint">minutes, per repo</span>
                </label>
                <input
                  id="fetch-interval"
                  type="number"
                  className="settings-input"
                  value={fetchInterval}
                  onChange={e => setFetchInterval(Number(e.target.value))}
                  min={5} max={1440}
                />
              </div>
            )}
          </div>
        </section>

        {/* ── Security ── */}
        <section className="settings-card">
          <div className="settings-card-header">
            <div className="settings-card-icon"><Icon name="lock" size={18} /></div>
            <div>
              <h2 className="settings-card-title">Security</h2>
              <p className="settings-card-desc">
                The agent generates its own API token on first start and stores it in{' '}
                <code>agent/.env</code>, which git ignores. The Next.js server attaches it; the
                browser never sees it.
              </p>
            </div>
          </div>
          <p className="settings-hint">
            Signed-in GitHub access uses your OAuth session. A personal access token is not used
            yet: the agent makes no GitHub requests of its own.
          </p>
        </section>

        {/* ── Adaptive AI Routing ── */}
        <section className="settings-card">
          <div className="settings-card-header">
            <div className="settings-card-icon"><Icon name="cpu" size={18} /></div>
            <div>
              <h2 className="settings-card-title">Adaptive AI Routing™</h2>
              <p className="settings-card-desc">
                Automatically routes AI requests to minimize cost and optimize speed. 
                Ollama runs locally for free; Gemini is used as a cloud fallback.
              </p>
            </div>
          </div>

          <div className="settings-fields" style={{ marginTop: 16 }}>
            <div className="settings-field">
              <label className="settings-label">AI Mode</label>
              <div className="settings-radio-group">
                <label className="settings-radio-label">
                  <input type="radio" name="aiMode" value="auto" checked={aiMode === 'auto'} onChange={() => setAiMode('auto')} />
                  <span>Auto (Recommended)</span>
                </label>
                <label className="settings-radio-label">
                  <input type="radio" name="aiMode" value="ollama" checked={aiMode === 'ollama'} onChange={() => setAiMode('ollama')} />
                  <span>Ollama only (Local)</span>
                </label>
                <label className="settings-radio-label">
                  <input type="radio" name="aiMode" value="gemini" checked={aiMode === 'gemini'} onChange={() => setAiMode('gemini')} />
                  <span>Gemini only (Cloud)</span>
                </label>
                <label className="settings-radio-label">
                  <input type="radio" name="aiMode" value="disabled" checked={aiMode === 'disabled'} onChange={() => setAiMode('disabled')} />
                  <span>Disabled</span>
                </label>
              </div>
            </div>

            {(aiMode === 'auto' || aiMode === 'gemini') && (
              <div className="settings-field">
                <label htmlFor="gemini-key" className="settings-label">
                  Gemini API Key
                  {geminiKeySet && (
                    <span style={{ marginLeft: 8, color: 'var(--green-400)', fontSize: 12, fontWeight: 500 }}>
                      ✓ Saved
                    </span>
                  )}
                  <span className="settings-label-hint">leave blank to keep current</span>
                </label>
                <input
                  id="gemini-key"
                  type="password"
                  className="settings-input"
                  value={geminiKey}
                  onChange={e => setGeminiKey(e.target.value)}
                  placeholder={geminiKeySet ? "Key is set. Enter new key to change..." : "AIzaSy••••••••••••••••••••••••••••••"}
                  autoComplete="off"
                />
              </div>
            )}
            
            {(aiMode === 'auto' || aiMode === 'gemini') && (
              <div className="settings-field">
                <label htmlFor="gemini-model" className="settings-label">
                  Gemini model
                  <span className="settings-label-hint">model id</span>
                </label>
                <input
                  id="gemini-model"
                  type="text"
                  className="settings-input"
                  value={geminiModel}
                  onChange={e => setGeminiModel(e.target.value)}
                  placeholder="gemini-2.5-flash"
                />
              </div>
            )}

            {providerStatus && (
              <div className="settings-field" style={{ marginTop: 24, padding: 16, backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.05)' }}>
                <label className="settings-label" style={{ marginBottom: 12 }}>AI Provider Status</label>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 14 }}>
                  <span style={{ color: 'var(--gray-400)' }}>Gemini (Cloud):</span>
                  <span style={{ fontWeight: 500, color: providerStatus.gemini.configured ? 'var(--green-400)' : 'var(--gray-500)' }}>
                    {providerStatus.gemini.configured
                      ? `✓ ${providerStatus.gemini.model} answering`
                      : providerStatus.gemini.key_set ? `Not usable: ${providerStatus.gemini.detail}` : 'Missing Key'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 14 }}>
                  <span style={{ color: 'var(--gray-400)' }}>Ollama (Local):</span>
                  <span style={{ fontWeight: 500, color: providerStatus.ollama.available ? 'var(--green-400)' : 'var(--red-400)' }}>
                    {providerStatus.ollama.available ? '✓ Running' : 'Offline / Error'}
                  </span>
                </div>
              </div>
            )}

            {aiStats && (
              <div className="settings-field" style={{ marginTop: 24, padding: 16, backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.05)' }}>
                <label className="settings-label" style={{ marginBottom: 12 }}>Usage & Cost Tracking</label>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 14 }}>
                  <span style={{ color: 'var(--gray-400)' }}>Gemini Requests:</span>
                  <span style={{ fontWeight: 500 }}>{aiStats.gemini_requests}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 14 }}>
                  <span style={{ color: 'var(--gray-400)' }}>Estimated Cost:</span>
                  <span style={{ fontWeight: 500, color: 'var(--green-400)' }}>$0.00 <span style={{fontSize: 12, opacity: 0.7}}>(Free Tier)</span></span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                  <span style={{ color: 'var(--gray-400)' }}>Ollama Requests (Local):</span>
                  <span style={{ fontWeight: 500 }}>{aiStats.ollama_requests}</span>
                </div>
              </div>
            )}
          </div>
        </section>

      </div>
    </div>
  );
}
