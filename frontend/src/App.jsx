import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import axios from 'axios';
import { Sparkles, Video, Settings as SettingsIcon, LayoutTemplate } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import UploadZone from './components/UploadZone';
import ProgressTracker from './components/ProgressTracker';
import SettingsPanel from './components/SettingsPanel';
import VideoResult from './components/VideoResult';
import SettingsPage from './components/SettingsPage';
import AssetLibrary from './components/AssetLibrary';

const BACKEND_URL = window.location.port === '5173' ? 'http://localhost:3001' : window.location.origin;
const socket = io(BACKEND_URL);

class ContentErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('Page rendering failed', error, info); }
  render() {
    if (!this.state.error) return this.props.children;
    return <div className="content-wrapper"><div className="glass-panel">
      <h2 className="page-title">This page could not be displayed</h2>
      <p className="page-subtitle">{this.state.error.message || 'Unexpected interface error'}</p>
      <button className="btn btn-primary" onClick={this.props.onBack}>Return to Video Generator</button>
    </div></div>;
  }
}

function App() {
  const [activeTab, setActiveTab] = useState('generator');
  const [jobState, setJobState] = useState(null); 
  const [settings, setSettings] = useState({
    schemaVersion: 2,
    avatar: { mode: 'auto', appearanceCount: 5, secondsPerAppearance: 5, placement: 'topic_aware', layout: 'full_avatar', minimumGapSeconds: 1, manualStartSeconds: [] },
    sources: { projectAssets: true, defaultLibrary: true, pexels: true, pixabay: true, wikimedia: true, duckduckgo: true, serper: false, webVideoDownload: true, aiImages: false },
    assetTypes: { images: true, videos: true }, projectAssetIds: [], excludedAssetIds: [], libraryCollectionIds: ['default'],
    transcription: { provider: 'auto', model: 'large-v3' }, verification: { provider: 'auto', enabled: true },
    generation: { provider: 'modal_qwen', maxImagesPerVideo: 12, stylePreset: 'neutral' }, missingAssetPolicy: 'neutral_card',
    style: { enableMusic: true, enableSfx: true, sfxVolume: 0.28, maxSfxPerMinute: 6, enableColorGrade: true, enableTransitions: true, musicVolume: 0.18, transitionDuration: 0.3 },
    output: { resolution: '1920x1080', fps: 30 }, performance: { useGpu: 'auto' }
  });

  useEffect(() => {
    socket.on('job_update', (job) => {
      setJobState(job);
    });
    return () => socket.off('job_update');
  }, []);

  const handleUpload = async (file) => {
    setJobState('uploading');
    const formData = new FormData();
    formData.append('video', file);
    formData.append('settings', JSON.stringify(settings));

    try {
      const response = await axios.post(`${BACKEND_URL}/api/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const { jobId } = response.data;
      socket.emit('subscribe_job', jobId);
    } catch (error) {
      console.error('Upload failed:', error);
      alert('Failed to upload video. Check console for details.');
      setJobState(null);
    }
  };

  const resetPipeline = () => setJobState(null);

  const cancelPipeline = () => {
    if (jobState && jobState.id) {
      socket.emit('cancel_job', jobState.id);
    }
    setJobState(null);
  };

  return (
    <div className="dashboard-container">
      
      {/* LEFT SIDEBAR */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1 className="sidebar-title">
            <Sparkles size={20} className="text-blue-400" />
            Avatar Editor
          </h1>
          <p className="sidebar-subtitle">Autonomous Video Pipeline</p>
        </div>

        <nav className="sidebar-nav">
          <button 
            onClick={() => setActiveTab('generator')}
            className={`nav-item ${activeTab === 'generator' ? 'active' : ''}`}
          >
            <LayoutTemplate size={18} />
            Video Generator
          </button>
          
          <button 
            onClick={() => setActiveTab('settings')}
            className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
          >
            <SettingsIcon size={18} />
            Global Settings
          </button>
        </nav>
        
        <div className="sidebar-footer">
          <div className="status-indicator">
            <div className="status-online">
              <div className="pulse-dot"></div>
              <span>System Online</span>
            </div>
            <p className="status-text">v2.0 Backend Connected</p>
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="main-content">
        <ContentErrorBoundary key={activeTab} onBack={() => setActiveTab('generator')}>
        <AnimatePresence mode="wait">
          {activeTab === 'settings' ? (
            <SettingsPage key="settings" backendUrl={BACKEND_URL} />
          ) : (
            <motion.div 
              key="generator"
              className="content-wrapper"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              {!jobState && (
                <div>
                  <div className="page-header">
                    <h2 className="page-title">New Video Project</h2>
                    <p className="page-subtitle">Upload a talking-head video to automatically generate B-roll, subtitles, and layout transitions.</p>
                  </div>
                  <div className="glass-panel mb-8">
                    <UploadZone onUpload={handleUpload} />
                  </div>
                  <SettingsPanel settings={settings} setSettings={setSettings} />
                  <AssetLibrary backendUrl={BACKEND_URL} settings={settings} setSettings={setSettings} />
                </div>
              )}

              {jobState === 'uploading' && (
                <div className="glass-panel" style={{textAlign: 'center', padding: '4rem 0'}}>
                  <div style={{display: 'inline-block', marginBottom: '1rem', color: '#3b82f6'}}>
                    <Video size={48} style={{animation: 'pulse 2s infinite'}} />
                  </div>
                  <h2 className="page-title">Uploading Video...</h2>
                  <p className="page-subtitle">Securely transferring payload to pipeline.</p>
                </div>
              )}

              {jobState && typeof jobState === 'object' && jobState.status !== 'completed' && (
                <div className="glass-panel">
                  <ProgressTracker job={jobState} onReset={resetPipeline} onCancel={cancelPipeline} />
                </div>
              )}

              {jobState?.status === 'completed' && (
                <div className="glass-panel">
                  <VideoResult 
                    job={jobState} 
                    backendUrl={BACKEND_URL} 
                    onReset={resetPipeline} 
                  />
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
        </ContentErrorBoundary>
      </main>

    </div>
  );
}

export default App;
