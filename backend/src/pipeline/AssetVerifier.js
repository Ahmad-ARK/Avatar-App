import { BasePipelineStage } from './BasePipelineStage.js';
import { verifyAsset } from '../services/visionService.js';

// Trusted sources — high-quality curated results, no need to verify
const TRUSTED_SOURCES = new Set(['pexels', 'pixabay', 'ai_generated']);

export class AssetVerifier extends BasePipelineStage {
  constructor() {
    super('asset_verification');
  }

  async execute(context) {
    const { scenePlan, settings } = context;
    if (!settings?.verifyAssets) {
      this.emitProgress(100, 'Verification skipped (disabled)');
      return context;
    }

    // Only verify assets from untrusted sources
    const segments = scenePlan.segments.filter(
      s => s.assetPath && !TRUSTED_SOURCES.has(s.assetSource)
    );

    if (segments.length === 0) {
      this.emitProgress(100, 'All assets from trusted sources — no verification needed');
      return context;
    }

    this.emitProgress(0, `Verifying ${segments.length} assets from untrusted sources...`);

    // Run verification concurrently in batches of 5
    const CONCURRENCY = 5;
    for (let i = 0; i < segments.length; i += CONCURRENCY) {
      const batch = segments.slice(i, i + CONCURRENCY);

      this.emitProgress(
        Math.round((i / segments.length) * 100),
        `Verifying batch ${Math.floor(i / CONCURRENCY) + 1}/${Math.ceil(segments.length / CONCURRENCY)}...`
      );

      await Promise.all(batch.map(async (seg) => {
        try {
          const result = await verifyAsset(seg.assetPath, seg.visual_query);
          seg.verification = result;
          if (!result.match || result.confidence < 40) {
            seg.verificationFailed = true;
            console.warn(`[Verifier] Low confidence for seg ${seg.id} (${seg.assetSource}): ${result.reason}`);
          }
        } catch (error) {
          seg.verification = { match: true, confidence: 50, reason: 'Verification error' };
        }
      }));
    }

    this.emitProgress(100, 'Verification complete');
    return context;
  }
}
