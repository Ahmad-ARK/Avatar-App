import React, { useCallback, useState } from 'react';
import { UploadCloud } from 'lucide-react';

const UploadZone = ({ onUpload }) => {
  const [isDragActive, setIsDragActive] = useState(false);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragActive(true);
    } else if (e.type === 'dragleave') {
      setIsDragActive(false);
    }
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  }, []);

  const handleChange = (e) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleFile = (file) => {
    if (!file.type.startsWith('video/')) {
      alert('Please upload a valid video file (mp4, mov, etc).');
      return;
    }
    onUpload(file);
  };

  return (
    <div 
      className={`upload-zone ${isDragActive ? 'drag-active' : ''}`}
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
      onClick={() => document.getElementById('file-upload').click()}
    >
      <input
        type="file"
        id="file-upload"
        className="hidden"
        accept="video/*"
        onChange={handleChange}
        style={{ display: 'none' }}
      />
      
      <div className="flex flex-col items-center justify-center">
        <UploadCloud size={64} className="upload-icon" />
        <h2 className="text-2xl font-semibold mb-2">Upload Avatar Video</h2>
        <p className="text-secondary mb-6">Drag and drop, or click to browse</p>
        
        <button className="btn btn-primary" onClick={(e) => { e.stopPropagation(); document.getElementById('file-upload').click(); }}>
          Select Video
        </button>
      </div>
    </div>
  );
};

export default UploadZone;
