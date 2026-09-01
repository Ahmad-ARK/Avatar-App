import React from 'react';
import { Check, Loader2, Circle } from 'lucide-react';
import { motion } from 'framer-motion';

const PIPELINE_STAGES = [
  { id: 'audio_extraction', label: 'Extracting Audio' },
  { id: 'transcription', label: 'Transcribing with Whisper' },
  { id: 'niche_classification', label: 'AI Niche Classification' },
  { id: 'scene_planning', label: 'Planning Scenes & Rhythm' },
  { id: 'asset_fetching', label: 'Fetching Stock Assets & Generating AI Images' },
  { id: 'asset_verification', label: 'Vision Verification (Quality Check)' },
  { id: 'caption_generation', label: 'Generating ASS Subtitles' },
  { id: 'final_compositing', label: 'Rendering Final Composited Video' }
];

const ProgressTracker = ({ job, onReset, onCancel }) => {
  const currentStageIndex = Math.max(
    0,
    PIPELINE_STAGES.findIndex(s => s.id === job.stage)
  );

  return (
    <div className="progress-container">
      <div className="flex justify-between items-center mb-2">
        <h2 className="text-xl font-semibold text-white">Pipeline Execution</h2>
        <span className="text-accent-primary font-mono">{job.progress}%</span>
      </div>
      
      <div className="progress-bar-wrapper">
        <motion.div 
          className="progress-bar"
          initial={{ width: 0 }}
          animate={{ width: `${job.progress}%` }}
          transition={{ ease: "linear", duration: 0.5 }}
        />
      </div>
      
      <div className="flex justify-between items-center mb-4">
        {job.message && (
          <p className="text-sm text-secondary italic font-mono m-0">{job.message}</p>
        )}
        
        {onCancel && job.status !== 'failed' && (
          <button 
            onClick={onCancel}
            className="px-3 py-1 bg-red-900/40 hover:bg-red-700/60 text-red-300 rounded text-sm transition-colors border border-red-800/50"
          >
            Cancel Generation
          </button>
        )}
      </div>

      <div className="stage-list">
        {PIPELINE_STAGES.map((stage, index) => {
          const isCompleted = index < currentStageIndex || job.status === 'completed';
          const isActive = index === currentStageIndex && job.status !== 'completed';
          
          return (
            <div 
              key={stage.id} 
              className={`stage-item ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}
            >
              <div className="stage-icon">
                {isCompleted ? (
                  <Check size={16} />
                ) : isActive ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Circle size={12} opacity={0.3} />
                )}
              </div>
              <span>{stage.label}</span>
            </div>
          );
        })}
      </div>
      
      {job.error && (
        <div className="mt-6 p-4 bg-red-900/30 border border-red-500/50 rounded-lg text-red-200">
          <h3 className="font-bold text-red-400 mb-1">Pipeline Error</h3>
          <p className="font-mono text-sm break-words">{job.error}</p>
          {onReset && (
            <button 
              onClick={onReset}
              className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded font-medium transition-colors"
            >
              Restart Video
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default ProgressTracker;
