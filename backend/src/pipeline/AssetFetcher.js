import path from 'path';
import fs from 'fs-extra';
import { BasePipelineStage } from './BasePipelineStage.js';
import { SourceManager } from '../sources/SourceManager.js';
import { generateImage } from '../services/modalFluxService.js';
import { downloadFile } from '../services/apiClient.js';

export class AssetFetcher extends BasePipelineStage {
  constructor() {
    super('asset_fetching');
    this.sourceManager = new SourceManager();
  }

  async execute(context) {
    const { scenePlan, tempDir, settings } = context;
    const useAiImages = settings?.useAiImages || false;
    const segments = scenePlan.segments;

    // Only fetch for segments that need visuals
    const visualSegments = segments.filter(s => s.visual_query && s.layout !== 'full_avatar');

    this.emitProgress(0, `Fetching assets for ${visualSegments.length} segments...`);
    const assetsDir = path.join(tempDir, 'assets');
    await fs.ensureDir(assetsDir);

    // Process in concurrent batches of 5
    const CONCURRENCY = 5;
    for (let batchStart = 0; batchStart < visualSegments.length; batchStart += CONCURRENCY) {
      const batch = visualSegments.slice(batchStart, batchStart + CONCURRENCY);

      this.emitProgress(
        Math.round((batchStart / visualSegments.length) * 100),
        `Fetching assets (batch ${Math.floor(batchStart / CONCURRENCY) + 1}/${Math.ceil(visualSegments.length / CONCURRENCY)})...`
      );

      await Promise.all(batch.map(seg => this.fetchOne(seg, assetsDir, useAiImages)));
    }

    context.scenePlan.segments = segments;
    this.emitProgress(100, `All ${visualSegments.length} assets fetched`);
    return context;
  }

  async fetchOne(seg, assetsDir, useAiImages) {
    try {
      if (useAiImages) {
        const outputPath = path.join(assetsDir, `seg_${seg.id}_ai.png`);
        await generateImage(seg.visual_query, outputPath, { width: 1280, height: 720 });
        seg.assetPath = outputPath;
        seg.assetSource = 'ai_generated';
      } else {
        const preferredType = seg.visual_type || 'image';
        const results = await this.sourceManager.search(seg.visual_query, preferredType, 3);

        if (results.length > 0) {
          const best = results[0];
          const ext = best.type === 'video' ? '.mp4' : '.jpg';
          const outputPath = path.join(assetsDir, `seg_${seg.id}${ext}`);
          await downloadFile(best.url, outputPath);
          seg.assetPath = outputPath;
          seg.assetSource = best.source;
          seg.assetAttribution = best.attribution;
        } else {
          const outputPath = path.join(assetsDir, `seg_${seg.id}_fallback.png`);
          await generateImage(seg.visual_query, outputPath);
          seg.assetPath = outputPath;
          seg.assetSource = 'ai_fallback';
        }
      }
    } catch (error) {
      console.error(`[AssetFetcher] Failed for segment ${seg.id}:`, error.message);
      seg.assetPath = null;
      seg.assetError = error.message;
    }
  }
}
