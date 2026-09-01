import React from 'react';
import { Settings, Image as ImageIcon, ShieldCheck } from 'lucide-react';

const SettingsPanel = ({ settings, setSettings }) => {
  const toggleSetting = (key) => {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div style={{ marginTop: '2rem', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1.5rem' }}>
      <div className="flex-center" style={{ marginBottom: '1rem', color: 'white' }}>
        <Settings size={20} color="#3b82f6" />
        <h3 style={{ fontSize: '1.125rem', fontWeight: 600 }}>Pipeline Configurations</h3>
      </div>
      
      <div className="settings-grid">
        
        {/* Toggle 1 */}
        <div className="settings-section" style={{ marginBottom: 0 }}>
          <div className="flex-between" style={{ alignItems: 'flex-start', marginBottom: '0.5rem' }}>
            <div className="flex-center">
              <ImageIcon size={18} color="#60a5fa" />
              <span style={{ fontWeight: 500 }}>Force AI Images</span>
            </div>
            <label className="toggle">
              <input 
                type="checkbox" 
                checked={settings.useAiImages}
                onChange={() => toggleSetting('useAiImages')}
              />
              <span className="slider"></span>
            </label>
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.5rem', lineHeight: '1.4' }}>
            Bypass stock asset search (Pexels/Pixabay) and generate all visuals exclusively using Modal Flux API.
          </p>
        </div>

        {/* Toggle 2 */}
        <div className="settings-section" style={{ marginBottom: 0 }}>
          <div className="flex-between" style={{ alignItems: 'flex-start', marginBottom: '0.5rem' }}>
            <div className="flex-center">
              <ShieldCheck size={18} color="#4ade80" />
              <span style={{ fontWeight: 500 }}>Vision Verification</span>
            </div>
            <label className="toggle">
              <input 
                type="checkbox" 
                checked={settings.verifyAssets}
                onChange={() => toggleSetting('verifyAssets')}
              />
              <span className="slider"></span>
            </label>
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.5rem', lineHeight: '1.4' }}>
            Use DeepSeek Vision to verify fetched assets match the semantic query. Discards poor matches.
          </p>
        </div>

        {/* Toggle 3 - GPU Acceleration */}
        <div className="settings-section" style={{ marginBottom: 0 }}>
          <div className="flex-between" style={{ alignItems: 'flex-start', marginBottom: '0.5rem' }}>
            <div className="flex-center">
              <Settings size={18} color="#facc15" />
              <span style={{ fontWeight: 500 }}>NVIDIA GPU Acceleration</span>
            </div>
            <label className="toggle">
              <input 
                type="checkbox" 
                checked={settings.useGpu || false}
                onChange={() => toggleSetting('useGpu')}
              />
              <span className="slider"></span>
            </label>
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.5rem', lineHeight: '1.4' }}>
            Enable blazing fast hardware encoding (h264_nvenc). Turn this off if you don't have an NVIDIA graphics card!
          </p>
        </div>

      </div>
    </div>
  );
};

export default SettingsPanel;
