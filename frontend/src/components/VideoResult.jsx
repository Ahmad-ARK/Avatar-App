import React from 'react';
import { Download, RotateCcw, Palette } from 'lucide-react';

const VideoResult = ({ job, backendUrl, onReset }) => {
  const { videoUrl, nicheConfig } = job.result;
  const fullVideoUrl = `${backendUrl}${videoUrl}`;

  return (
    <div className="result-container">
      <div className="flex justify-between items-end mb-2">
        <div>
          <h2 className="text-2xl font-bold text-white mb-1">Editing Complete</h2>
          <p className="text-success flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-success animate-pulse"></span>
            Pipeline successfully executed
          </p>
        </div>
        <div className="flex gap-3">
          <a href={fullVideoUrl} download className="btn btn-primary bg-white/10 hover:bg-white/20 border border-white/20 shadow-none">
            <Download size={18} />
            Download
          </a>
          <button onClick={onReset} className="btn bg-white/10 text-white hover:bg-white/20">
            <RotateCcw size={18} />
            New Video
          </button>
        </div>
      </div>

      <div className="video-wrapper">
        <video 
          src={fullVideoUrl} 
          controls 
          autoPlay 
          playsInline
          className="w-full h-full rounded-xl"
        />
      </div>

      {nicheConfig && (
        <div className="mt-6 bg-white/5 p-6 rounded-xl border border-white/10">
          <div className="flex items-center gap-2 mb-4">
            <Palette size={20} className="text-purple-400" />
            <h3 className="text-lg font-semibold">AI Style Decisions</h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <p className="text-sm text-secondary mb-1">Classification</p>
              <p className="text-lg font-medium text-white capitalize">
                {nicheConfig.niche} &rarr; {nicheConfig.sub_niche?.replace(/_/g, ' ')}
              </p>
              
              <p className="text-sm text-secondary mt-4 mb-1">Typography</p>
              <p className="text-md text-white font-mono bg-black/30 px-3 py-1 rounded inline-block">
                {nicheConfig.font_family} ({nicheConfig.font_weight})
              </p>
            </div>
            
            <div>
              <p className="text-sm text-secondary mb-2">Color Palette</p>
              <div className="flex gap-3">
                {nicheConfig.color_palette && Object.entries(nicheConfig.color_palette).map(([key, hex]) => (
                  <div key={key} className="flex flex-col items-center gap-1">
                    <div 
                      className="w-10 h-10 rounded-full border-2 border-white/20 shadow-lg" 
                      style={{ backgroundColor: hex }}
                      title={`${key}: ${hex}`}
                    />
                  </div>
                ))}
              </div>

              <p className="text-sm text-secondary mt-4 mb-1">AI Reasoning</p>
              <p className="text-sm text-white/80 italic border-l-2 border-accent-primary pl-3 py-1">
                "{nicheConfig.reasoning}"
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoResult;
