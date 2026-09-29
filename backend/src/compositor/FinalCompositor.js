import path from 'path';
import fs from 'fs-extra';
import { BasePipelineStage } from '../pipeline/BasePipelineStage.js';
import { runFFmpeg, detectNvenc } from '../utils/ffmpegHelpers.js';
import { SegmentRenderer } from './SegmentRenderer.js';
import { isUsableFile, quoteFilterPath } from '../utils/ffmpegSafe.js';
import { mapWithConcurrency } from '../utils/concurrency.js';
import { getColorGrade } from '../utils/colorGrade.js';
import { pickMusicTrack, buildMusicMixFilter } from '../utils/audioMix.js';
import { renderSfxTrack, appendSfxMix } from '../utils/sfxMix.js';
import { canTransition, buildXfadeChain, buildAcrossfadeChain, retimeWords } from './transitions.js';
import { CaptionEngine } from '../pipeline/CaptionEngine.js';
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

    const concurrency = Number.isFinite(Number(context.settings?.performance?.renderConcurrency)) ? Number(context.settings.performance.renderConcurrency) : config.encoding.concurrency;
    this.emitProgress(0, `Rendering ${segments.length} segments (${config.encoding.codec}, x${concurrency})...`);

    // 1. Render segments in parallel (bounded) through a per-segment fallback chain, so ONE
    // bad segment can never kill the whole video: styled → safe avatar slice → blank clip.
    // Results come back in input order for concat; the fallbacks preserve each segment's
    // duration so audio and burned captions stay in sync.
    const tally = { ok: 0, safe: 0, blank: 0, skipped: 0 };
    let completed = 0;
    const orderedPaths = await mapWithConcurrency(segments, concurrency, async (seg) => {
      const p = await this.renderSegmentResilient(seg, videoPath, tempDir, context.nicheConfig, tally, context.settings);
      completed++;
      this.emitProgress(Math.round((completed / segments.length) * 60), `Rendered ${completed}/${segments.length} segments`);
      return p;
    });
    // Keep each rendered file with its intended duration (needed for crossfade offsets).
    const rendered = [];
    orderedPaths.forEach((p, i) => {
      if (p) {
        renderedPaths.push(p);
        rendered.push({ path: p, duration: Math.max(0.1, segments[i].end_time - segments[i].start_time) });
      }
    });

    if (renderedPaths.length === 0) {
      throw new Error('Every segment failed to render — check the avatar video and FFmpeg setup.');
    }
    const hadDrops = rendered.length !== segments.length;
    const degraded = tally.safe + tally.blank + tally.skipped;
    if (degraded > 0) {
      console.warn(`[FinalCompositor] Render summary: ${tally.ok} ok, ${tally.safe} safe-fallback, ${tally.blank} blank, ${tally.skipped} skipped`);
      this.emitProgress(60, `Rendered ${tally.ok}/${segments.length} cleanly (${degraded} recovered)`);
    }

    // Shared finalize inputs
    const finalOutputPath = path.join(config.paths.output, `${jobId}.mp4`);
    const gradeFilter = context.settings?.style?.enableColorGrade !== false && config.style.enableColorGrade ? getColorGrade(context.nicheConfig) : '';
    let musicPath = null;
    if (context.settings?.style?.enableMusic !== false && config.style.enableMusic) {
      musicPath = pickMusicTrack([config.paths.music, config.paths.userMusic]);
      if (musicPath) console.log(`[FinalCompositor] Music bed: ${path.basename(musicPath)}`);
    }
    const sfxPath = await renderSfxTrack(context.sfxCues, context.videoDuration, tempDir, context.settings?.style?.sfxVolume ?? 0.28);
    if (sfxPath) console.log(`[FinalCompositor] SFX timeline: ${context.sfxCues.length} cue(s)`);

    // 2. TRANSITIONS PATH (preferred): crossfade the segments and burn everything in one pass.
    // Only when it's safe (no dropped segments, every clip longer than the overlap). Captions
    // are re-timed to the shortened timeline. Any failure falls back to hard cuts below.
    const D = context.settings?.style?.transitionDuration || config.style.transitionDuration;
    const durations = rendered.map(r => r.duration);
    let applied = null;
    const exactVisibility = context.settings?.avatar?.mode !== 'auto';
    if (!sfxPath && !exactVisibility && context.settings?.style?.enableTransitions !== false && config.style.enableTransitions && !hadDrops && canTransition(durations, D)) {
      this.emitProgress(70, 'Finalizing (transitions, grade, captions, music)...');
      try {
        const retimedCaptions = this.writeRetimedCaptions(context, D, tempDir);
        applied = await this.finalizeWithTransitions({
          segmentFiles: rendered.map(r => r.path),
          durations, transitionD: D,
          outPath: finalOutputPath,
          captionsPath: retimedCaptions,
          gradeFilter, musicPath, encoder: this.encoderFor(context.settings), musicVolume: context.settings?.style?.musicVolume,
        });
      } catch (err) {
        console.warn(`[FinalCompositor] Transition assembly failed (${err.message}); falling back to hard cuts.`);
        applied = null;
      }
    }

    // 3. FALLBACK: hard-cut concat (fast, -c copy) + the proven finalize ladder.
    if (!applied) {
      this.emitProgress(75, 'Concatenating segments...');
      const concatListPath = path.join(tempDir, 'concat.txt');
      const concatContent = renderedPaths.map(p => `file '${p.replace(/\\/g, '/')}'`).join('\n');
      await fs.writeFile(concatListPath, concatContent);
      const concatOutputPath = path.join(tempDir, 'concat_output.mp4');
      await runFFmpeg([
        '-f', 'concat', '-safe', '0', '-i', concatListPath, '-c', 'copy', '-y', concatOutputPath,
      ], 'concatenating segments');

      this.emitProgress(80, 'Finalizing (grade, captions, music)...');
      applied = await this.finalize({
        concatPath: concatOutputPath,
        outPath: finalOutputPath,
        captionsPath,
        gradeFilter,
        musicPath,
        narrationPath: exactVisibility ? videoPath : null, sfxPath, encoder: this.encoderFor(context.settings), musicVolume: context.settings?.style?.musicVolume,
      });
    }

    context.finalVideoPath = finalOutputPath;
    context.captionsApplied = applied.captions;
    context.musicApplied = applied.music;
    context.colorGradeApplied = applied.grade;
    context.transitionsApplied = !!applied.transitions;
    const intervals = context.avatarSchedule?.intervals || [];
    context.renderReport = {
      schemaVersion: 1,
      requestedAvatar: { mode: context.settings?.avatar?.mode, appearanceCount: context.settings?.avatar?.appearanceCount, secondsPerAppearance: context.settings?.avatar?.secondsPerAppearance },
      renderedAvatar: { appearanceCount: intervals === null ? null : intervals.length, totalSeconds: context.avatarSchedule?.renderedSeconds ?? null, intervals },
      assets: segments.filter(s => s.assetSource).map(s => ({ segmentId: s.id, source: s.assetSource, attribution: s.assetAttribution || null, verification: s.verification?.status || s.verification || null })),
      warnings: segments.filter(s => s.fallbackReason || s.assetError).map(s => s.fallbackReason || s.assetError),
      transitionsApplied: !!applied.transitions,
      usage: context.usage || {},
      soundEffects: (context.sfxCues || []).map(({ assetPath, ...cue }) => ({ ...cue, file: path.relative(config.paths.bundledDefaults, assetPath).replace(/\\/g, '/') })),
    };
    await fs.writeJson(path.join(config.paths.output, `${jobId}.report.json`), context.renderReport, { spaces: 2 });
    this.emitProgress(100, 'Video rendering complete');
    return context;
  }

  /**
   * Regenerate the caption file with word times shifted onto the crossfaded (shorter)
   * timeline, so captions stay in sync with the also-crossfaded voice.
   */
  writeRetimedCaptions(context, D, tempDir) {
    const words = context.transcript?.words || [];
    const segments = context.scenePlan.segments;
    const retimed = retimeWords(words, segments, D);
    const ass = new CaptionEngine().buildASS(retimed, context.nicheConfig);
    const outPath = path.join(tempDir, 'captions_retimed.ass');
    fs.writeFileSync(outPath, ass, 'utf-8');
    return outPath;
  }

  /**
   * Single-pass assembly with crossfades: xfade video + acrossfade audio, then color grade +
   * captions on the video and the ducked music bed on the audio. Tries with music first, then
   * without, so a weird music track can't sink the transition path. Throws if it can't produce
   * a video at all (caller then falls back to hard cuts).
   */
  async finalizeWithTransitions({ segmentFiles, durations, transitionD, outPath, captionsPath, gradeFilter, musicPath, encoder, musicVolume }) {
    const attempts = musicPath ? [musicPath, null] : [null];
    let lastErr;
    for (const music of attempts) {
      try {
        await runFFmpeg(
          this.buildTransitionFinalizeArgs({ segmentFiles, durations, transitionD, outPath, captionsPath, gradeFilter, musicPath: music, encoder, musicVolume }),
          `transition finalize (music=${!!music})`
        );
        return { grade: !!gradeFilter, captions: !!captionsPath, music: !!music, transitions: true };
      } catch (err) {
        lastErr = err;
        console.warn(`[FinalCompositor] transition finalize (music=${!!music}) failed: ${err.message}`);
      }
    }
    throw lastErr || new Error('transition finalize failed');
  }

  /** Build the combined xfade + grade + captions + music single-pass args. */
  buildTransitionFinalizeArgs({ segmentFiles, durations, transitionD, outPath, captionsPath, gradeFilter, musicPath, encoder = { codec: config.encoding.codec, preset: config.encoding.preset }, musicVolume = config.style.musicVolume }) {
    const n = segmentFiles.length;
    const inputs = [];
    for (const f of segmentFiles) inputs.push('-i', f);

    const { filter: vChain, outLabel: vAcc } = buildXfadeChain(n, durations, transitionD);
    const { filter: aChain, outLabel: aAcc } = buildAcrossfadeChain(n, transitionD);

    const fc = [];
    if (vChain) fc.push(vChain);
    const vparts = [];
    if (gradeFilter) vparts.push(gradeFilter);
    if (captionsPath) vparts.push(`ass=${quoteFilterPath(captionsPath)}`);
    fc.push(`${vAcc}${vparts.length ? vparts.join(',') : 'null'}[vout]`);

    if (aChain) fc.push(aChain);

    let audioMap = aAcc;
    let audioCodec = ['-c:a', 'aac', '-b:a', '192k'];
    if (musicPath) {
      inputs.push('-stream_loop', '-1', '-i', musicPath);
      const { filter, outLabel } = buildMusicMixFilter({ musicInput: n, volume: musicVolume, voiceLabel: aAcc });
      fc.push(filter);
      audioMap = outLabel;
    }

    return [
      ...inputs,
      '-filter_complex', fc.join(';'),
      '-map', '[vout]',
      '-map', audioMap,
      '-c:v', encoder.codec,
      '-preset', encoder.preset,
      ...audioCodec,
      '-shortest',
      '-y',
      outPath,
    ];
  }

  /**
   * Assemble the final video, trying the richest feature set first and falling back on
   * failure. Returns which features actually made it in.
   */
  async finalize({ concatPath, outPath, captionsPath, gradeFilter, musicPath, narrationPath = null, sfxPath = null, encoder, musicVolume }) {
    const attempts = [];
    if (musicPath) attempts.push({ grade: gradeFilter, captions: captionsPath, music: musicPath });
    attempts.push({ grade: gradeFilter, captions: captionsPath, music: null });
    if (gradeFilter) attempts.push({ grade: '', captions: captionsPath, music: null });
    if (!narrationPath) attempts.push({ passthrough: true }); // auto-mode last resort

    for (const a of attempts) {
      try {
        if (a.passthrough) {
          await fs.copy(concatPath, outPath, { overwrite: true });
          return { grade: false, captions: false, music: false };
        }
        await runFFmpeg(
          this.buildFinalizeArgs({ concatPath, outPath, narrationPath, sfxPath, encoder, musicVolume, ...a }),
          `finalize (grade=${!!a.grade} captions=${!!a.captions} music=${!!a.music})`
        );
        return { grade: !!a.grade, captions: !!a.captions, music: !!a.music };
      } catch (err) {
        console.warn(`[FinalCompositor] finalize attempt failed: ${err.message}`);
      }
    }
    if (narrationPath) throw new Error('Could not finalize exact timeline with continuous narration');
    return { grade: false, captions: false, music: false };
  }

  /** Build the single-pass finalize ffmpeg args for a given feature set. */
  buildFinalizeArgs({ concatPath, outPath, captionsPath, gradeFilter, musicPath, narrationPath = null, sfxPath = null, encoder = { codec: config.encoding.codec, preset: config.encoding.preset }, musicVolume = config.style.musicVolume }) {
    const inputs = ['-i', concatPath];
    if (narrationPath) inputs.push('-i', narrationPath);

    // Video chain: [grade,] captions. Always non-empty here (captions present on every attempt
    // that isn't passthrough); use `null` as a safety if somehow both are absent.
    const vparts = [];
    if (gradeFilter) vparts.push(gradeFilter);
    if (captionsPath) vparts.push(`ass=${quoteFilterPath(captionsPath)}`);
    const videoChain = vparts.length ? vparts.join(',') : 'null';
    const fc = [`[0:v]${videoChain}[vout]`];

    const args = [];
    let audioMap = narrationPath ? '1:a' : '0:a';
    let audioCodec = narrationPath ? ['-c:a', 'aac', '-b:a', '192k'] : ['-c:a', 'copy'];
    if (musicPath) {
      inputs.push('-stream_loop', '-1', '-i', musicPath); // loop music to cover the whole video
      const musicInput = narrationPath ? 2 : 1;
      const voiceLabel = narrationPath ? '[1:a]' : '[0:a]';
      const { filter, outLabel } = buildMusicMixFilter({ musicInput, volume: musicVolume, voiceLabel });
      fc.push(filter);
      audioMap = outLabel;
      audioCodec = ['-c:a', 'aac', '-b:a', '192k'];
    }
    if (sfxPath) {
      inputs.push('-i', sfxPath);
      audioMap = appendSfxMix(fc, audioMap.startsWith('[') ? audioMap : `[${audioMap}]`, inputs.filter(v => v === '-i').length - 1);
      audioCodec = ['-c:a', 'aac', '-b:a', '192k'];
    }

    args.push(
      ...inputs,
      '-filter_complex', fc.join(';'),
      '-map', '[vout]',
      '-map', audioMap,
      '-c:v', encoder.codec,
      '-preset', encoder.preset,
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
  async renderSegmentResilient(seg, videoPath, tempDir, nicheConfig, tally, settings = {}) {
    const renderOptions = { output: settings.output, performance: settings.performance, exactVisibility: settings.avatar?.mode !== 'auto' };
    // 1. Full styled render.
    try {
      const p = await this.renderer.render(seg, videoPath, tempDir, nicheConfig, renderOptions);
      tally.ok++;
      return p;
    } catch (err) {
      console.warn(`[FinalCompositor] Segment ${seg.id} styled render failed: ${err.message}`);
    }

    // 2. Safe fallback — plain avatar slice (keeps voice + duration).
    try {
      const p = renderOptions.exactVisibility && seg.avatarAppearanceId == null
        ? await this.renderer.renderNeutral(seg, videoPath, tempDir, renderOptions)
        : await this.renderer.renderSafe(seg, videoPath, tempDir, renderOptions);
      tally.safe++;
      return p;
    } catch (err) {
      console.warn(`[FinalCompositor] Segment ${seg.id} safe fallback failed: ${err.message}`);
      if (renderOptions.exactVisibility) throw new Error(`Exact-visibility segment ${seg.id} could not preserve its required video/audio timeline: ${err.message}`);
    }

    // 3. Blank fallback — black + silence of the exact duration (keeps the timeline intact).
    try {
      const p = await this.renderer.renderBlank(seg, tempDir, renderOptions);
      tally.blank++;
      return p;
    } catch (err) {
      console.error(`[FinalCompositor] Segment ${seg.id} blank fallback failed: ${err.message} — dropping segment`);
      tally.skipped++;
      return null;
    }
  }

  encoderFor(settings = {}) {
    const requested = settings.performance?.useGpu;
    const useGpu = requested === true || requested === 'true' ? true : requested === false || requested === 'false' ? false : config.encoding.useGpu;
    return { codec: useGpu ? 'h264_nvenc' : 'libx264', preset: useGpu ? 'p4' : 'fast' };
  }
}
