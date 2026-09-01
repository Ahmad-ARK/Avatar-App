import express from 'express';
import multer from 'multer';
import path from 'path';
import config from '../config.js';

export function createApiRouter(jobManager) {
  const router = express.Router();

  // Configure Multer for video uploads
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, config.paths.uploads);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    }
  });
  const upload = multer({ storage });

  // Upload endpoint
  router.post('/upload', upload.single('video'), (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No video file provided' });
      }

      // Parse settings from frontend (e.g. { useAiImages: true })
      let settings = {};
      if (req.body.settings) {
        try {
          settings = JSON.parse(req.body.settings);
        } catch (e) {
          console.warn('Invalid settings JSON, using defaults');
        }
      }

      // Create and start job
      const videoPath = req.file.path;
      const jobId = jobManager.createJob(videoPath, settings);

      // Start processing in background
      jobManager.startJob(jobId);

      // Return job ID immediately
      res.json({ jobId, status: 'pending' });

    } catch (error) {
      console.error('/upload error:', error);
      res.status(500).json({ error: 'Upload failed' });
    }
  });

  // Status check endpoint (for HTTP polling if WebSocket fails)
  router.get('/jobs/:jobId', (req, res) => {
    const job = jobManager.getJob(req.params.jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    res.json(job);
  });

  // Get current settings
  router.get('/settings', (req, res) => {
    res.json(config.getSettings());
  });

  // Save new settings
  router.post('/settings', (req, res) => {
    try {
      config.updateSettings(req.body);
      res.json({ success: true, settings: config.getSettings() });
    } catch (e) {
      console.error('/settings update error:', e);
      res.status(500).json({ error: 'Failed to update settings' });
    }
  });

  return router;
}
