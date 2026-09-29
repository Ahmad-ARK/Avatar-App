import express from 'express';
import multer from 'multer';
import path from 'path';
import config from '../config.js';
import { normalizeJobSettings, validateJobSettings, publicSettings } from '../config/jobSettings.js';
import { assetCatalog } from '../assets/catalog.js';
import { usageLedger } from '../usage/ledger.js';
import { analyzeAsset } from '../services/assetAnalysisService.js';
import { inspectVideoUrl, downloadVideoSection } from '../services/videoDownloadService.js';

const SECRET_KEYS = new Set(['groqApiKey', 'deepseekApiKey', 'pexelsApiKey', 'pixabayApiKey', 'serperApiKey', 'modalTokenId', 'modalTokenSecret']);
const MASK = '••••••••';
function sanitizeSettings(raw) { const out = { ...raw }; for (const key of SECRET_KEYS) if (out[key]) out[key] = MASK; return out; }
function mergeMaskedSettings(incoming) { const current = config.getSettings(); const clean = { ...incoming }; for (const key of SECRET_KEYS) { if (clean[key] === MASK) clean[key] = current[key]; else if (clean[key] === '') delete clean[key]; } return clean; }
function publicAsset(asset) { const { managedPath, ...safe } = asset; return { ...safe, previewUrl: `/assets/${path.relative(config.paths.assets, managedPath).replace(/\\/g, '/')}` }; }

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
  const assetUpload = multer({ storage, limits: { files: 100, fileSize: 1024 * 1024 * 1024 } });

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
    res.json(sanitizeSettings(config.getSettings()));
  });

  // Save new settings
  router.post('/settings', (req, res) => {
    try {
      config.updateSettings(mergeMaskedSettings(req.body || {}));
      res.json({ success: true, settings: sanitizeSettings(config.getSettings()) });
    } catch (e) {
      console.error('/settings update error:', e);
      res.status(500).json({ error: 'Failed to update settings' });
    }
  });

  router.post('/plans/validate', (req, res) => {
    const settings = normalizeJobSettings(config.getSettings(), req.body?.settings || req.body || {});
    const result = validateJobSettings(settings, req.body?.durationSeconds);
    res.status(result.valid ? 200 : 400).json({ ...result, settings: publicSettings(settings) });
  });

  router.get('/providers/status', async (req, res) => {
    const usage = await usageLedger.read();
    res.json({
      groq: { configured: !!config.groq.apiKey }, deepseek: { configured: !!config.deepseek.apiKey },
      pexels: { configured: !!config.pexels.apiKey }, pixabay: { configured: !!config.pixabay.apiKey },
      serper: { configured: !!config.serper.apiKey, enabled: config.serper.enabled, freeCreditsRemaining: Math.max(0, config.serper.freeCreditsRemaining - usage.serper.used - usage.serper.unknown), exhausted: usage.serper.exhausted, paymentSupported: false },
      modalImage: { configured: !!config.modal.imageEndpoint && !!config.modal.tokenId }, modalVision: { configured: !!config.modal.visionEndpoint && !!config.modal.tokenId },
    });
  });

  router.post('/assets/import', assetUpload.array('assets', 100), async (req, res) => {
    try {
      const scope = req.body.scope === 'library' ? 'library' : 'project'; const imported = [];
      for (const file of req.files || []) imported.push(await assetCatalog.importFile(file.path, { originalName: file.originalname, scope, projectId: req.body.projectId || 'draft', collectionId: req.body.collectionId || 'default', description: req.body.description || '' }));
      res.json({ assets: imported.map(publicAsset) });
    } catch (error) { res.status(400).json({ error: error.message }); }
  });
  router.post('/assets/import-url', async (req,res)=>{ try { const metadata=await inspectVideoUrl(req.body?.url); const tempPath=path.join(config.paths.temp,`url-${Date.now()}-${Math.round(Math.random()*1e9)}.mp4`); await downloadVideoSection(req.body.url,tempPath,{startSeconds:Number(req.body.startSeconds)||0,endSeconds:req.body.endSeconds==null?null:Number(req.body.endSeconds)}); const asset=await assetCatalog.importFile(tempPath,{originalName:`${metadata.title||'web-video'}.mp4`,scope:req.body.scope==='library'?'library':'project',projectId:req.body.projectId||'draft',collectionId:req.body.collectionId||'default',description:req.body.description||metadata.title,source:'user_url',originalPageUrl:metadata.webpageUrl,publisher:metadata.uploader,attribution:metadata.uploader?`Video by ${metadata.uploader}`:null,license:metadata.license}); res.json({asset:publicAsset(asset),metadata}); } catch(error){res.status(400).json({error:error.message});} });
  router.get('/assets', async (req, res) => { try { res.json({ assets: (await assetCatalog.list(req.query)).map(publicAsset) }); } catch (error) { res.status(500).json({ error: error.message }); } });
  router.patch('/assets/:id', async (req, res) => { try { res.json({ asset: publicAsset(await assetCatalog.update(req.params.id, req.body || {})) }); } catch (error) { res.status(error.message === 'Asset not found' ? 404 : 400).json({ error: error.message }); } });
  router.post('/assets/:id/analyze', async (req, res) => { try { let asset=await assetCatalog.analyze(req.params.id); const analysis=await analyzeAsset(asset, path.join(config.paths.cache,'analysis')); asset=await assetCatalog.applyAnalysis(asset.id,analysis); res.json({ asset:publicAsset(asset) }); } catch (error) { res.status(error.message === 'Asset not found' ? 404 : 400).json({ error: error.message }); } });
  router.get('/jobs/:jobId/report', (req, res) => { const job = jobManager.getJob(req.params.jobId); if (!job) return res.status(404).json({ error: 'Job not found' }); res.json(job.result?.report || { status: job.status, message: 'Report is available after rendering.' }); });

  return router;
}
