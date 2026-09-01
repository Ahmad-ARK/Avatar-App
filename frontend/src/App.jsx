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

const BACKEND_URL = 'http://localhost:3001';
const socket = io(BACKEND_URL);

function App() {
  const [activeTab, setActiveTab] = useState('generator');
  const [jobState, setJobState] = useState(null); 
  const [settings, setSettings] = useState({
    useAiImages: false,
    verifyAssets: true,
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
      </main>

    </div>
  );
}

export default App;
