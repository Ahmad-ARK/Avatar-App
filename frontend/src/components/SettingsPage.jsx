import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Save, Key, Video, Server, Layout } from 'lucide-react';
import { motion } from 'framer-motion';

const SettingsPage = ({ backendUrl }) => {
  const [formData, setFormData] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    axios.get(`${backendUrl}/api/settings`)
      .then(res => setFormData(res.data))
      .catch(err => console.error('Failed to load settings', err));
  }, [backendUrl]);

  const handleChange = (e) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await axios.post(`${backendUrl}/api/settings`, formData);
      alert('Settings saved successfully!');
    } catch (e) {
      console.error('Save failed', e);
      alert('Failed to save settings');
    }
    setSaving(false);
  };

  return (
    <motion.div 
      className="content-wrapper"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
    >
      <div className="glass-panel">
        <div className="flex-between mb-8" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '1.5rem' }}>
          <div>
            <h2 className="page-title flex-center gap-2">
              <Key color="#3b82f6" />
              Global Configuration
            </h2>
            <p className="page-subtitle mt-1">Configure API keys, engine defaults, and hardware encoding.</p>
          </div>
          <button 
            onClick={handleSave} 
            disabled={saving}
            className="btn btn-primary flex-center"
            style={{ padding: '0.75rem 1.5rem' }}
          >
            {saving ? 'Saving...' : <><Save size={18} /> Save Settings</>}
          </button>
        </div>
        
        <div>
          <section className="settings-section">
            <h3 className="section-title">
              <Key size={16} /> API Keys
            </h3>
            <div className="form-group mb-4">
              <label className="form-label">Groq API Key (Whisper)</label>
              <input type="password" name="groqApiKey" value={formData.groqApiKey || ''} onChange={handleChange} className="form-input" placeholder="gsk_..." />
            </div>
            <div className="form-group mb-4">
              <label className="form-label">DeepSeek API Key (Vision & Planning)</label>
              <input type="password" name="deepseekApiKey" value={formData.deepseekApiKey || ''} onChange={handleChange} className="form-input" placeholder="sk-..." />
            </div>
            <div className="form-group mb-4">
              <label className="form-label">Pexels API Key (Stock Video)</label>
              <input type="password" name="pexelsApiKey" value={formData.pexelsApiKey || ''} onChange={handleChange} className="form-input" />
            </div>
            <div className="form-group">
              <label className="form-label">Pixabay API Key (Stock Assets)</label>
              <input type="password" name="pixabayApiKey" value={formData.pixabayApiKey || ''} onChange={handleChange} className="form-input" />
            </div>
          </section>

          <section className="settings-section">
            <h3 className="section-title">
              <Server size={16} /> Modal.com Credentials
            </h3>
            <div className="form-group mb-4">
              <label className="form-label">Modal Endpoint URL</label>
              <input type="text" name="modalEndpoint" value={formData.modalEndpoint || ''} onChange={handleChange} className="form-input" placeholder="https://username--flux-api-model-web.modal.run" />
            </div>
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Token ID</label>
                <input type="password" name="modalTokenId" value={formData.modalTokenId || ''} onChange={handleChange} className="form-input" placeholder="ak-..." />
              </div>
              <div className="form-group">
                <label className="form-label">Token Secret</label>
                <input type="password" name="modalTokenSecret" value={formData.modalTokenSecret || ''} onChange={handleChange} className="form-input" placeholder="as-..." />
              </div>
            </div>
          </section>

          <section className="settings-section">
            <h3 className="section-title">
              <Layout size={16} /> Video Style
            </h3>
            <div className="form-group mb-4">
              <label className="form-label">Avatar vs. Visuals Balance</label>
              <select name="visualDensity" value={formData.visualDensity || 'balanced'} onChange={handleChange} className="form-input">
                <option value="talking_head">Talking-head — more avatar, less b-roll</option>
                <option value="balanced">Balanced — recommended</option>
                <option value="visual_heavy">Visual-heavy — mostly b-roll, avatar occasional</option>
              </select>
              <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', display: 'block', marginTop: '0.35rem', lineHeight: '1.4' }}>
                Controls how often the video shows the speaker vs. stock footage and images.
              </span>
            </div>
            <div className="flex-between">
              <div>
                <span className="form-label mb-0">Show avatar in corner over b-roll (PIP)</span>
                <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', display: 'block', marginTop: '0.25rem', lineHeight: '1.4' }}>
                  When off, b-roll scenes play full-screen instead of showing a small avatar in the corner.
                </span>
              </div>
              <label className="toggle">
                <input type="checkbox" name="enableAvatarPip" checked={formData.enableAvatarPip === true || formData.enableAvatarPip === 'true'} onChange={(e) => setFormData(prev => ({ ...prev, enableAvatarPip: e.target.checked }))} />
                <span className="slider"></span>
              </label>
            </div>
            <div className="flex-between" style={{ marginTop: '1.25rem' }}>
              <div>
                <span className="form-label mb-0">Background music</span>
                <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', display: 'block', marginTop: '0.25rem', lineHeight: '1.4' }}>
                  Adds a music bed (ducked under the voice) if you place tracks in the music folder. No effect until you add music.
                </span>
              </div>
              <label className="toggle">
                <input type="checkbox" name="enableMusic" checked={formData.enableMusic !== false && formData.enableMusic !== 'false'} onChange={(e) => setFormData(prev => ({ ...prev, enableMusic: e.target.checked }))} />
                <span className="slider"></span>
              </label>
            </div>
            <div className="flex-between" style={{ marginTop: '1.25rem' }}>
              <div>
                <span className="form-label mb-0">Cinematic color grade</span>
                <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', display: 'block', marginTop: '0.25rem', lineHeight: '1.4' }}>
                  Applies a subtle, niche-matched grade so mixed footage looks like one film.
                </span>
              </div>
              <label className="toggle">
                <input type="checkbox" name="enableColorGrade" checked={formData.enableColorGrade !== false && formData.enableColorGrade !== 'false'} onChange={(e) => setFormData(prev => ({ ...prev, enableColorGrade: e.target.checked }))} />
                <span className="slider"></span>
              </label>
            </div>
          </section>

          <div className="grid-2 gap-4">
            <section className="settings-section" style={{ marginBottom: 0 }}>
              <h3 className="section-title">
                <Video size={16} /> Output Format
              </h3>
              <div className="form-group mb-4">
                <label className="form-label">Resolution</label>
                <select name="outputResolution" value={formData.outputResolution || '1920x1080'} onChange={handleChange} className="form-input">
                  <option value="1920x1080">1920x1080 (Landscape)</option>
                  <option value="1080x1920">1080x1920 (Portrait)</option>
                  <option value="1080x1080">1080x1080 (Square)</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Framerate</label>
                <select name="outputFps" value={formData.outputFps || '30'} onChange={handleChange} className="form-input">
                  <option value="24">24 FPS</option>
                  <option value="30">30 FPS</option>
                  <option value="60">60 FPS</option>
                </select>
              </div>
            </section>

            <section className="settings-section" style={{ marginBottom: 0 }}>
              <h3 className="section-title">
                <Server size={16} /> Performance
              </h3>
              <div className="flex-between">
                <div>
                  <span className="form-label mb-0">Use NVIDIA GPU (NVENC)</span>
                  <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', display: 'block', marginTop: '0.25rem', lineHeight: '1.4' }}>
                    Dramatically speeds up FFmpeg rendering if you have a supported NVIDIA GPU.
                  </span>
                </div>
                <label className="toggle">
                  <input type="checkbox" name="useGpu" checked={formData.useGpu === true || formData.useGpu === 'true'} onChange={(e) => setFormData(prev => ({ ...prev, useGpu: e.target.checked }))} />
                  <span className="slider"></span>
                </label>
              </div>
            </section>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default SettingsPage;
