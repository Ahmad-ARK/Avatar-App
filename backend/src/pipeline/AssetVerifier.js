import path from 'path';
import { BasePipelineStage } from './BasePipelineStage.js';
import { verifyAsset } from '../services/visionService.js';
import { runFFmpeg } from '../utils/ffmpegHelpers.js';

export class AssetVerifier extends BasePipelineStage {
  constructor() { super('asset_verification'); }
  async execute(context) {
    const { scenePlan, settings } = context;
    if (!settings?.verification?.enabled) { this.emitProgress(100, 'Verification skipped (disabled)'); return context; }
    const segments = scenePlan.segments.filter(s => s.assetPath);
    if (!segments.length) { this.emitProgress(100, 'No assets require verification'); return context; }
    this.emitProgress(0, `Verifying ${segments.length} assets...`);
    for (let i = 0; i < segments.length; i += 5) {
      await Promise.all(segments.slice(i, i + 5).map(async seg => {
        try {
          let inspectPath = seg.assetPath;
          if (/\.(mp4|mov|mkv|webm)$/i.test(seg.assetPath)) {
            inspectPath = path.join(context.tempDir, `verify_${seg.id}.jpg`);
            await runFFmpeg(['-ss', String(seg.sourceInSeconds || 0), '-i', seg.assetPath, '-frames:v', '1', '-y', inspectPath], `verification frame ${seg.id}`);
          }
          const result = await verifyAsset(inspectPath, seg.visual_query || 'relevant supporting visual');
          seg.verification = result;
          if (result.status === 'rejected') { seg.verificationFailed = true; seg.assetPath = null; seg.fallbackReason = `Rejected asset: ${result.reason}`; }
        } catch (error) { seg.verification = { status: 'unverified', match: null, confidence: 0, reason: error.message }; }
      }));
      this.emitProgress(Math.round((Math.min(i + 5, segments.length) / segments.length) * 100), `Verified ${Math.min(i + 5, segments.length)}/${segments.length}`);
    }
    this.emitProgress(100, 'Verification complete'); return context;
  }
}
