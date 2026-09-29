import { v4 as uuidv4 } from 'uuid';
import { PipelineOrchestrator } from '../pipeline/PipelineOrchestrator.js';
import config from '../config.js';
import { normalizeJobSettings, validateJobSettings } from '../config/jobSettings.js';

export class JobManager {
  constructor(io) {
    this.io = io;
    this.jobs = new Map(); // jobId -> Job state
  }

  createJob(videoPath, settings) {
    const jobId = uuidv4();
    const settingsSnapshot = normalizeJobSettings(config.getSettings(), settings || {});
    const initialValidation = validateJobSettings(settingsSnapshot);
    if (!initialValidation.valid) throw new Error(initialValidation.errors.join(' '));
    const job = {
      id: jobId,
      status: 'pending',
      videoPath,
      settings: settingsSnapshot,
      progress: 0,
      stage: 'queued',
      result: null,
      error: null,
    };
    this.jobs.set(jobId, job);
    return jobId;
  }

  getJob(jobId) {
    return this.jobs.get(jobId);
  }

  async startJob(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) return;

    job.status = 'processing';
    this._emitUpdate(jobId);

    try {
      const orchestrator = new PipelineOrchestrator(job);

      // Listen to pipeline progress and broadcast via WebSocket
      orchestrator.onProgress = (stage, percent, message) => {
        // If cancelled while emitting progress, don't overwrite the cancelled status
        if (job.isCancelled) return;
        
        job.stage = stage;
        job.progress = percent;
        job.message = message;
        this._emitUpdate(jobId);
      };

      const resultContext = await orchestrator.run();

      job.status = 'completed';
      job.result = {
        videoUrl: `/output/${jobId}.mp4`,
        nicheConfig: resultContext.nicheConfig,
        report: resultContext.renderReport || null,
      };
      job.progress = 100;
      job.message = 'Done';
      this._emitUpdate(jobId);

    } catch (error) {
      console.error(`[JobManager] Job ${jobId} failed:`, error);
      job.status = 'failed';
      job.error = error.message;
      this._emitUpdate(jobId);
    }
  }

  cancelJob(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) return;

    if (job.status === 'processing' || job.status === 'pending') {
      job.isCancelled = true;
      job.status = 'failed';
      job.error = 'Cancelled by user';
      this._emitUpdate(jobId);
    }
  }

  _emitUpdate(jobId) {
    const job = this.jobs.get(jobId);
    if (this.io && job) {
      this.io.to(jobId).emit('job_update', job);
    }
  }
}
