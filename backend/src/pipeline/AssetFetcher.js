import path from 'path';
import fs from 'fs-extra';
import { BasePipelineStage } from './BasePipelineStage.js';
import { SourceManager } from '../sources/SourceManager.js';
import { generateSceneImage } from '../services/imageGenerationService.js';
import { downloadFile } from '../services/apiClient.js';
import { downloadVideoSection } from '../services/videoDownloadService.js';
import { probeMedia } from '../utils/ffmpegHelpers.js';

export class AssetFetcher extends BasePipelineStage {
  constructor() {
    super('asset_fetching');
    this.sourceManager = new SourceManager();
  }

  async execute(context) {
    const { scenePlan, tempDir, settings } = context;
    const useAiImages = settings?.sources?.aiImages === true;
    this.settings = settings;
    this.usage = context.usage || (context.usage = { serperQueries: 0, generatedImages: 0, warnings: [] });
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
    if (settings?.missingAssetPolicy === 'fail' && visualSegments.some(s => !s.assetPath)) throw new Error('One or more required visual assets could not be resolved.');
    this.emitProgress(100, `All ${visualSegments.length} assets fetched`);
    return context;
  }

  async fetchOne(seg, assetsDir, useAiImages) {
    try {
      if (useAiImages) {
        const outputPath = path.join(assetsDir, `seg_${seg.id}_ai.png`);
        await generateSceneImage(seg, outputPath, { width: 1280, height: 720, stylePreset: this.settings.generation?.stylePreset });
        this.usage.generatedImages++;
        seg.assetPath = outputPath;
        seg.assetSource = 'ai_generated';
      } else {
        const preferredType = seg.visual_type || 'image';
        const limit = this.settings.search?.maxCandidatesPerScene || 8;
        let results = ['event_footage', 'person_reference'].includes(seg.visualCategory)
          ? await this.sourceManager.searchAll(seg.visual_query, preferredType, Math.min(4, limit), { settings: this.settings, usage: this.usage })
          : await this.sourceManager.search(seg.visual_query, preferredType, limit, { settings: this.settings, usage: this.usage });
        results = rankCandidates(results, seg.visual_query);

        if (results.length > 0) {
          const best = results[0];
          const ext = best.type === 'video' ? '.mp4' : '.jpg';
          const outputPath = path.join(assetsDir, `seg_${seg.id}${ext}`);
          if (best.localPath) await fs.copy(best.localPath, outputPath);
          else if (best.requiresDownloader) await downloadVideoSection(best.url, outputPath, { startSeconds: best.sourceInSeconds || 0, endSeconds: best.sourceOutSeconds || null });
          else await downloadFile(best.url, outputPath);
          if (best.type === 'video') { const info = await probeMedia(outputPath); const needed = seg.end_time - seg.start_time; const available = info.duration - (best.sourceInSeconds || 0); if (available + 0.05 < needed) throw new Error(`Selected video is too short (${available.toFixed(2)}s for ${needed.toFixed(2)}s scene)`); }
          seg.assetPath = outputPath;
          seg.assetId = best.assetId || null;
          seg.sourceInSeconds = best.sourceInSeconds || 0;
          seg.sourceOutSeconds = best.sourceOutSeconds || null;
          seg.assetSource = best.source;
          seg.assetAttribution = best.attribution;
        } else if (useAiImages) {
          const outputPath = path.join(assetsDir, `seg_${seg.id}_fallback.png`);
          await generateSceneImage(seg, outputPath, { stylePreset: this.settings.generation?.stylePreset });
          this.usage.generatedImages++;
          seg.assetPath = outputPath;
          seg.assetSource = 'ai_fallback';
        } else {
          seg.assetPath = null;
          seg.fallbackReason = 'No eligible asset found';
        }
      }
    } catch (error) {
      console.error(`[AssetFetcher] Failed for segment ${seg.id}:`, error.message);
      seg.assetPath = null;
      seg.assetError = error.message;
    }
  }
}

function rankCandidates(results, query) {
  const terms = String(query).toLowerCase().split(/\W+/).filter(v => v.length > 2);
  const sourceScore = { project_asset: 30, default_library: 25, wikimedia: 12, serper: 10, pexels: 8, pixabay: 7, duckduckgo: 3 };
  return [...results].map(r => { const text = `${r.title || ''} ${r.publisher || ''} ${r.attribution || ''}`.toLowerCase(); const relevance = terms.reduce((n,t)=>n+(text.includes(t)?3:0),0); const quality = Math.min(5, ((r.width||0)*(r.height||0))/(1280*720)); return { ...r, _rank: (r.score||0)+relevance+quality+(sourceScore[r.source]||0) }; }).sort((a,b)=>b._rank-a._rank);
}
