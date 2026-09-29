import React from 'react';
import { Settings, UserRound, Database, Cpu } from 'lucide-react';

const Toggle = ({ checked, onChange }) => <label className="toggle"><input type="checkbox" checked={!!checked} onChange={e => onChange(e.target.checked)} /><span className="slider" /></label>;
const Field = ({ label, children }) => <div className="form-group"><label className="form-label">{label}</label>{children}</div>;

export default function SettingsPanel({ settings, setSettings }) {
  const update = (group, key, value) => setSettings(prev => ({ ...prev, [group]: { ...(prev[group] || {}), [key]: value } }));
  const avatar = settings.avatar || {}; const sources = settings.sources || {}; const style = settings.style || {};
  return <div style={{ marginTop: '2rem' }}>
    <div className="flex-center" style={{ marginBottom: '1rem' }}><Settings size={20} color="#3b82f6" /><h3>Project configuration</h3></div>
    <section className="settings-section">
      <h3 className="section-title"><UserRound size={16}/> Avatar appearances</h3>
      <div className="grid-2">
        <Field label="Mode"><select className="form-input" value={avatar.mode || 'auto'} onChange={e=>update('avatar','mode',e.target.value)}><option value="auto">Automatic</option><option value="exact">Exact count and duration</option><option value="off">Never show avatar</option></select></Field>
        <Field label="Placement"><select className="form-input" value={avatar.placement || 'topic_aware'} onChange={e=>update('avatar','placement',e.target.value)} disabled={avatar.mode !== 'exact'}><option value="topic_aware">Topic-aware</option><option value="even">Even distribution</option><option value="manual">Manual start times</option></select></Field>
        <Field label="Number of appearances"><input className="form-input" type="number" min="0" value={avatar.appearanceCount ?? 5} onChange={e=>update('avatar','appearanceCount',Number(e.target.value))} disabled={avatar.mode !== 'exact'} /></Field>
        <Field label="Seconds per appearance"><input className="form-input" type="number" min="0.1" step="0.1" value={avatar.secondsPerAppearance ?? 5} onChange={e=>update('avatar','secondsPerAppearance',Number(e.target.value))} disabled={avatar.mode !== 'exact'} /></Field>
        <Field label="Avatar layout"><select className="form-input" value={avatar.layout || 'full_avatar'} onChange={e=>update('avatar','layout',e.target.value)} disabled={avatar.mode !== 'exact'}><option value="full_avatar">Full screen</option><option value="split_screen">Split screen</option><option value="pip_bottom_right">PIP bottom right</option><option value="pip_bottom_left">PIP bottom left</option></select></Field>
        <Field label="Minimum invisible gap"><input className="form-input" type="number" min="0.1" step="0.1" value={avatar.minimumGapSeconds ?? 1} onChange={e=>update('avatar','minimumGapSeconds',Number(e.target.value))} disabled={avatar.mode !== 'exact'} /></Field>
      </div>
      {avatar.placement === 'manual' && avatar.mode === 'exact' && <Field label="Manual start seconds (comma separated)"><input className="form-input" value={(avatar.manualStartSeconds||[]).join(', ')} onChange={e=>update('avatar','manualStartSeconds',e.target.value.split(',').map(v=>Number(v.trim())).filter(Number.isFinite))}/></Field>}
      {avatar.mode === 'exact' && <p className="setting-note">Requested avatar screen time: {(avatar.appearanceCount ?? 5) * (avatar.secondsPerAppearance ?? 5)} seconds. Exact mode uses frame-accurate hard boundaries.</p>}
    </section>
    <section className="settings-section"><h3 className="section-title"><Database size={16}/> Visual sources</h3><div className="settings-grid">
      {Object.entries({projectAssets:'Project assets',defaultLibrary:'Default library',pexels:'Pexels',pixabay:'Pixabay',wikimedia:'Wikimedia',duckduckgo:'DuckDuckGo',serper:'Serper free credits',webVideoDownload:'Supported web video',aiImages:'AI image fallback'}).map(([key,label])=><div className="flex-between" key={key}><span className="form-label mb-0">{label}</span><Toggle checked={sources[key] ?? !['serper','aiImages'].includes(key)} onChange={v=>update('sources',key,v)}/></div>)}
    </div><p className="setting-note">AI fallback is called only when enabled. Serper failures automatically continue through other enabled sources.</p></section>
    <section className="settings-section"><h3 className="section-title">Sound effects</h3><div className="grid-2">
      <div className="flex-between"><span className="form-label mb-0">Use bundled SFX</span><Toggle checked={style.enableSfx ?? true} onChange={v=>update('style','enableSfx',v)}/></div>
      <Field label="SFX volume"><input className="form-input" type="number" min="0" max="1" step="0.05" value={style.sfxVolume ?? 0.28} onChange={e=>update('style','sfxVolume',Number(e.target.value))} disabled={style.enableSfx === false}/></Field>
      <Field label="Maximum cues per minute"><input className="form-input" type="number" min="0" max="30" value={style.maxSfxPerMinute ?? 6} onChange={e=>update('style','maxSfxPerMinute',Number(e.target.value))} disabled={style.enableSfx === false}/></Field>
    </div><p className="setting-note">Cues are chosen from the local indexed library and recorded with exact timeline and source trim ranges in the render report.</p></section>
    <section className="settings-section"><h3 className="section-title"><Cpu size={16}/> Processing</h3><div className="grid-2">
      <Field label="Transcription"><select className="form-input" value={settings.transcription?.provider || 'auto'} onChange={e=>update('transcription','provider',e.target.value)}><option value="auto">Auto: Groq then local</option><option value="groq">Groq only</option><option value="local">Local faster-whisper</option></select></Field>
      <Field label="Missing visual"><select className="form-input" value={settings.missingAssetPolicy || 'neutral_card'} onChange={e=>setSettings(p=>({...p,missingAssetPolicy:e.target.value}))}><option value="neutral_card">Neutral card</option><option value="fail">Fail the job</option></select></Field>
      <div className="flex-between"><span className="form-label mb-0">Verify selected assets</span><Toggle checked={settings.verification?.enabled ?? true} onChange={v=>update('verification','enabled',v)}/></div>
      <div className="flex-between"><span className="form-label mb-0">NVIDIA encoding</span><Toggle checked={settings.performance?.useGpu === true} onChange={v=>update('performance','useGpu',v)}/></div>
    </div></section>
  </div>;
}
