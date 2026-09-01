import path from 'path';
import fs from 'fs-extra';
import config from '../config.js';

import { AudioExtractor } from './AudioExtractor.js';
import { Transcriber } from './Transcriber.js';
import { NicheClassifier } from './NicheClassifier.js';
import { ScenePlanner } from './ScenePlanner.js';
import { AssetFetcher } from './AssetFetcher.js';
import { AssetVerifier } from './AssetVerifier.js';
import { CaptionEngine } from './CaptionEngine.js';
import { FinalCompositor } from '../compositor/FinalCompositor.js';

export class PipelineOrchestrator {
  constructor(job) {
    this.job = job;
    this.jobId = job.id;
    this.context = {
      jobId: job.id,
      videoPath: job.videoPath,
      settings: job.settings,
      tempDir: path.join(config.paths.temp, job.id),
    };
    this.onProgress = null; // Set by JobManager

    // Define the sequence of stages
    this.stages = [
      new AudioExtractor(),
      new Transcriber(),
      new NicheClassifier(),
      new ScenePlanner(),
      new AssetFetcher(),
      new AssetVerifier(),
      new CaptionEngine(),
      new FinalCompositor(),
    ];
  }

  async run() {
    // Setup temp dir
    await fs.ensureDir(this.context.tempDir);

    // Execute each stage sequentially
    for (const stage of this.stages) {
      if (this.job.isCancelled) {
        throw new Error('Pipeline cancelled by user');
      }

      // Bind progress emitter for this stage
      stage.onProgress = (stageName, percent, message) => {
        if (this.job.isCancelled) return;
        if (this.onProgress) {
          this.onProgress(stageName, percent, message);
        }
      };

      try {
        console.log(`[Pipeline ${this.jobId}] Starting: ${stage.name}`);
        this.context = await stage.execute(this.context);
      } catch (error) {
        throw new Error(`Stage '${stage.name}' failed: ${error.message}`);
      }
    }

    if (this.job.isCancelled) {
      throw new Error('Pipeline cancelled by user');
    }

    // Cleanup temp dir (optional, disabled for debugging)
    // await fs.remove(this.context.tempDir);

    return this.context;
  }
}
