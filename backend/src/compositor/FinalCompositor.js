import path from 'path';
import fs from 'fs-extra';
import { BasePipelineStage } from '../pipeline/BasePipelineStage.js';
import { runFFmpeg, detectNvenc } from '../utils/ffmpegHelpers.js';
import { SegmentRenderer } from './SegmentRenderer.js';
import { isUsableFile, quoteFilterPath } from '../utils/ffmpegSafe.js';
import { mapWithConcurrency } from '../utils/concurrency.js';
import { getColorGrade } from '../utils/colorGrade.js';
import { pickMusicTrack, buildMusicMixFilter } from '../utils/audioMix.js';
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

    // Resolve GPU encoding once per run when set to 'auto': probe NVENC and pin the result
    // so every segment (and its fallbacks) uses the same codec — concat needs consistency.
    if (config.encoding.gpuMode === 'auto') {
      const nvenc = await detectNvenc();
      config.encoding.setGpuDetected(nvenc);
      console.log(`[FinalCompositor] GPU encode ${nvenc ? 'enabled (h264_nvenc)' : 'unavailable → libx264 (CPU)'}`);
    }

    const concurrency = config.encoding.concurrency;
    this.emitProgress(0, `Rendering ${segments.length} segments (${config.encoding.codec}, x${concurrency})...`);

    // 1. Render segments in parallel (bounded) through a per-segment fallback chain, so ONE
    // bad segment can never kill the whole video: styled → safe avatar slice → blank clip.
    // Results come back in input order for concat; the fallbacks preserve each segment's
    // duration so audio and burned captions stay in sync.
    const tally = { ok: 0, safe: 0, blank: 0, skipped: 0 };
    let completed = 0;
    const orderedPaths = await mapWithConcurrency(segments, concurrency, async (seg) => {
      const p = await this.renderSegmentResilient(seg, videoPath, tempDir, context.nicheConfig, tally);
      completed++;
      this.emitProgress(Math.round((completed / segments.length) * 60), `Rendered ${completed}/${segments.length} segments`);
      return p;
    });
    for (const p of orderedPaths) {
      if (p) renderedPaths.push(p);
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

    // 4. Finalize: color grade + karaoke captions on video, ducked music bed on audio — all
    // in ONE re-encode (keeps it fast). Degrades gracefully: if the fancy pass fails, retry
    // with fewer features so a finished video is never lost at the last step.
    this.emitProgress(80, 'Finalizing (grade, captions, music)...');
    const finalOutputPath = path.join(config.paths.output, `${jobId}.mp4`);

    const gradeFilter = config.style.enableColorGrade ? getColorGrade(context.nicheConfig) : '';
    let musicPath = null;
    if (config.style.enableMusic) {
      musicPath = pickMusicTrack([config.paths.music, config.paths.userMusic]);
      if (musicPath) console.log(`[FinalCompositor] Music bed: ${path.basename(musicPath)}`);
    }

    const applied = await this.finalize({
      concatPath: concatOutputPath,
      outPath: finalOutputPath,
      captionsPath,
      gradeFilter,
      musicPath,
    });

    context.finalVideoPath = finalOutputPath;
    context.captionsApplied = applied.captions;
    context.musicApplied = applied.music;
    context.colorGradeApplied = applied.grade;
    this.emitProgress(100, 'Video rendering complete');
    return context;
  }

  /**
   * Assemble the final video, trying the richest feature set first and falling back on
   * failure. Returns which features actually made it in.
   */
  async finalize({ concatPath, outPath, captionsPath, gradeFilter, musicPath }) {
    const attempts = [];
    if (musicPath) attempts.push({ grade: gradeFilter, captions: captionsPath, music: musicPath });
    attempts.push({ grade: gradeFilter, captions: captionsPath, music: null });
    if (gradeFilter) attempts.push({ grade: '', captions: captionsPath, music: null });
    attempts.push({ passthrough: true }); // last resort: ship the concat as-is

    for (const a of attempts) {
      try {
        if (a.passthrough) {
          await fs.copy(concatPath, outPath, { overwrite: true });
          return { grade: false, captions: false, music: false };
        }
        await runFFmpeg(
          this.buildFinalizeArgs({ concatPath, outPath, ...a }),
          `finalize (grade=${!!a.grade} captions=${!!a.captions} music=${!!a.music})`
        );
        return { grade: !!a.grade, captions: !!a.captions, music: !!a.music };
      } catch (err) {
        console.warn(`[FinalCompositor] finalize attempt failed: ${err.message}`);
      }
    }
    return { grade: false, captions: false, music: false };
  }

  /** Build the single-pass finalize ffmpeg args for a given feature set. */
  buildFinalizeArgs({ concatPath, outPath, captionsPath, gradeFilter, musicPath }) {
    const inputs = ['-i', concatPath];

    // Video chain: [grade,] captions. Always non-empty here (captions present on every attempt
    // that isn't passthrough); use `null` as a safety if somehow both are absent.
    const vparts = [];
    if (gradeFilter) vparts.push(gradeFilter);
    if (captionsPath) vparts.push(`ass=${quoteFilterPath(captionsPath)}`);
    const videoChain = vparts.length ? vparts.join(',') : 'null';
    const fc = [`[0:v]${videoChain}[vout]`];

    const args = [];
    let audioMap = '0:a';
    let audioCodec = ['-c:a', 'copy'];
    if (musicPath) {
      inputs.push('-stream_loop', '-1', '-i', musicPath); // loop music to cover the whole video
      const { filter, outLabel } = buildMusicMixFilter({ musicInput: 1, volume: config.style.musicVolume });
      fc.push(filter);
      audioMap = outLabel;
      audioCodec = ['-c:a', 'aac', '-b:a', '192k'];
    }

    args.push(
      ...inputs,
      '-filter_complex', fc.join(';'),
      '-map', '[vout]',
      '-map', audioMap,
      '-c:v', config.encoding.codec,
      '-preset', config.encoding.preset,
      ...audioCodec,
      '-shortest',
      '-y',
      outPath,
    );
    return args;
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
