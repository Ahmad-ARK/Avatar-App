import path from 'path';
import fs from 'fs-extra';
import { BasePipelineStage } from '../pipeline/BasePipelineStage.js';
import { runFFmpeg } from '../utils/ffmpegHelpers.js';
import { SegmentRenderer } from './SegmentRenderer.js';
import { isUsableFile, quoteFilterPath } from '../utils/ffmpegSafe.js';
import config from '../config.js';

export class FinalCompositor extends BasePipelineStage {
  constructor() {
    super('final_compositing');
    this.renderer = new SegmentRenderer();
  }

  async execute(context) {
    const { videoPath, scenePlan, tempDir, captionsPath, jobId } = context;
    const segments = scenePlan.segments;
    const renderedPaths = [];

    // 0. Preflight: drop assets that didn't download cleanly so a zero-byte/missing file
    // degrades to a full-avatar scene instead of failing the render deep in FFmpeg.
    let droppedAssets = 0;
    for (const seg of segments) {
      if (seg.assetPath && !isUsableFile(seg.assetPath)) {
        seg.assetPath = null;
        if (seg.layout !== 'full_avatar') seg.layout = 'full_avatar';
        droppedAssets++;
      }
    }
    if (droppedAssets > 0) {
      console.warn(`[FinalCompositor] Preflight dropped ${droppedAssets} unusable asset(s) → full_avatar`);
    }

    this.emitProgress(0, `Rendering ${segments.length} segments...`);

    // 1. Render each segment through a fallback chain so ONE bad segment can never kill the
    // whole video: styled render → safe avatar slice → blank clip (exact duration). The last
    // two both preserve the segment's duration, so concat and burned captions stay in sync.
    const tally = { ok: 0, safe: 0, blank: 0, skipped: 0 };
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const progress = Math.round((i / segments.length) * 60);
      this.emitProgress(progress, `Rendering segment ${i + 1}/${segments.length}`);

      const segPath = await this.renderSegmentResilient(seg, videoPath, tempDir, context.nicheConfig, tally);
      if (segPath) renderedPaths.push(segPath);
    }

    if (renderedPaths.length === 0) {
      throw new Error('Every segment failed to render — check the avatar video and FFmpeg setup.');
    }
    const degraded = tally.safe + tally.blank + tally.skipped;
    if (degraded > 0) {
      console.warn(`[FinalCompositor] Render summary: ${tally.ok} ok, ${tally.safe} safe-fallback, ${tally.blank} blank, ${tally.skipped} skipped`);
      this.emitProgress(60, `Rendered ${tally.ok}/${segments.length} cleanly (${degraded} recovered)`);
    }

    this.emitProgress(60, 'Concatenating segments...');

    // 2. Concat list
    const concatListPath = path.join(tempDir, 'concat.txt');
    const concatContent = renderedPaths.map(p => `file '${p.replace(/\\/g, '/')}'`).join('\n');
    await fs.writeFile(concatListPath, concatContent);

    // 3. Concat without re-encoding (segments already have correct codec + audio)
    const concatOutputPath = path.join(tempDir, 'concat_output.mp4');
    const concatArgs = [
      '-f', 'concat',
      '-safe', '0',
      '-i', concatListPath,
      '-c', 'copy', // No re-encode — fast!
      '-y',
      concatOutputPath
    ];
    await runFFmpeg(concatArgs, 'concatenating segments');

    // 4. Burn subtitles onto the concatenated video. Captions are an enhancement — if the
    // burn fails (e.g. a font issue), ship the concatenated video WITHOUT captions rather
    // than losing a fully-rendered video at the final step.
    this.emitProgress(80, 'Burning subtitles...');
    const finalOutputPath = path.join(config.paths.output, `${jobId}.mp4`);

    const subtitleArgs = [
      '-i', concatOutputPath,
      '-vf', `ass=${quoteFilterPath(captionsPath)}`,
      '-c:v', config.encoding.codec,
      '-preset', config.encoding.preset,
      '-c:a', 'copy', // Audio already good from concat
      '-shortest',
      '-y',
      finalOutputPath
    ];

    try {
      await runFFmpeg(subtitleArgs, 'burning captions');
      context.finalVideoPath = finalOutputPath;
    } catch (err) {
      console.warn(`[FinalCompositor] Caption burn failed (${err.message}); shipping video without captions.`);
      await fs.copy(concatOutputPath, finalOutputPath, { overwrite: true });
      context.finalVideoPath = finalOutputPath;
      context.captionsSkipped = true;
    }

    this.emitProgress(100, 'Video rendering complete');
    return context;
  }

  /**
   * Render one segment through a fallback chain, updating `tally`. Returns the output path,
   * or null only if every strategy failed (that segment is then dropped from the timeline).
   */
  async renderSegmentResilient(seg, videoPath, tempDir, nicheConfig, tally) {
    // 1. Full styled render.
    try {
      const p = await this.renderer.render(seg, videoPath, tempDir, nicheConfig);
      tally.ok++;
      return p;
    } catch (err) {
      console.warn(`[FinalCompositor] Segment ${seg.id} styled render failed: ${err.message}`);
    }

    // 2. Safe fallback — plain avatar slice (keeps voice + duration).
    try {
      const p = await this.renderer.renderSafe(seg, videoPath, tempDir);
      tally.safe++;
      return p;
    } catch (err) {
      console.warn(`[FinalCompositor] Segment ${seg.id} safe fallback failed: ${err.message}`);
    }

    // 3. Blank fallback — black + silence of the exact duration (keeps the timeline intact).
    try {
      const p = await this.renderer.renderBlank(seg, tempDir);
      tally.blank++;
      return p;
    } catch (err) {
      console.error(`[FinalCompositor] Segment ${seg.id} blank fallback failed: ${err.message} — dropping segment`);
      tally.skipped++;
      return null;
    }
  }
}
