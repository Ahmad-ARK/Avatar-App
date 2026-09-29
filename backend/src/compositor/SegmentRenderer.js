import path from 'path';
import { runFFmpeg } from '../utils/ffmpegHelpers.js';
import { layouts } from './layouts.js';
import config from '../config.js';
import {
  escapeDrawtextText,
  quoteFilterPath,
  sanitizeHexColor,
  resolveFontFile,
} from '../utils/ffmpegSafe.js';

export class SegmentRenderer {
  /**
   * Render a single video segment with:
   * - Synced audio (fixes lip sync drift)
   * - Ken Burns/zoom effects on images
   * - Fade in/out transitions
   */
  async render(segment, avatarVideoPath, tempDir, nicheConfig = null, renderOptions = {}) {
    const segmentPath = path.join(tempDir, `seg_${segment.id}.mp4`);
    const duration = segment.end_time - segment.start_time;
    const { width, height, fps } = this.output(renderOptions);
    const isImage = segment.assetPath && 
      (segment.assetPath.endsWith('.jpg') || segment.assetPath.endsWith('.png') || segment.assetPath.endsWith('.jpeg'));
    const hasAsset = segment.assetPath && segment.layout !== 'full_avatar';

    const args = [
      '-ss', segment.start_time.toString(),
      '-t', duration.toString(),
      '-i', avatarVideoPath,
    ];

    let filterParts = [];

    if (!hasAsset && renderOptions.exactVisibility && segment.avatarAppearanceId == null) {
      return this.renderNeutral(segment, avatarVideoPath, tempDir, renderOptions);
    } else if (!hasAsset) {
      // === FULL AVATAR (with subtle zoom motion) ===
      const motion = segment.motion || 'slow_zoom_in';
      const zoomFilter = this.getAvatarMotion(motion, duration, fps, width, height);
      filterParts.push(`[0:v]${zoomFilter}[outv]`);
    } else {
      // === ASSET-BASED LAYOUTS ===
      if (isImage) {
        // Add image with Ken Burns effect (DO NOT use -loop 1, zoompan generates the frames)
        args.push('-i', segment.assetPath);
        const kbEffect = this.getKenBurnsEffect(segment.motion, duration, fps, width, height);
        // Supersampling Anti-Aliasing (SSAA) Fix:
        // We upscale the input to 3x (5760x3240) BEFORE zoompan.
        // We set zoompan's output 's' to 1x (1920x1080).
        // This forces zoompan to DOWNSCALE the image on every frame. Downscaling perfectly masks the 
        // 1-pixel integer rounding errors of zoompan, giving a buttery smooth sub-pixel CSS-like transform.
        const preW = width * 3;
        const preH = height * 3;
        filterParts.push(`[1:v]scale=${preW}:${preH}:force_original_aspect_ratio=increase,crop=${preW}:${preH},${kbEffect}[asset]`);
      } else {
        // Video asset
        const sourceStart = Math.max(0, Number(segment.sourceInSeconds) || 0);
        args.push('-ss', sourceStart.toString(), '-t', duration.toString(), '-i', segment.assetPath);
        filterParts.push(`[1:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}[asset]`);
      }

      // Apply the layout using [0:v] and [asset] 
      const layoutFilter = this.getLayoutFilter(segment.layout, width, height);
      filterParts.push(layoutFilter);
    }

    let finalPad = '[outv]';

    // Apply text overlay if the LLM generated one. Every dynamic value (text, colors, font
    // path) is sanitized through ffmpegSafe — a malformed one used to crash the whole render.
    // If no usable font is found, we skip the overlay rather than fail the segment.
    const fontFile = resolveFontFile(config.paths.fonts);
    if (segment.text_overlay && fontFile) {
      const text = escapeDrawtextText(segment.text_overlay);

      // Colors from nicheConfig, validated (bad hex falls back instead of breaking the filter)
      let bgColor = 'black@0.6';
      let fontColor = 'white';
      if (nicheConfig && nicheConfig.color_palette) {
        bgColor = sanitizeHexColor(nicheConfig.color_palette.primary, 'black', 0.8);
        fontColor = sanitizeHexColor(nicheConfig.color_palette.accent, 'white');
      }

      const drawtextFilter = `drawtext=text='${text}':fontfile=${quoteFilterPath(fontFile)}:fontcolor=${fontColor}:fontsize=110:x=(w-text_w)/2:y=(h-text_h)/2:box=1:boxcolor=${bgColor}:boxborderw=25:shadowcolor=black@0.5:shadowx=5:shadowy=5`;

      filterParts.push(`${finalPad}${drawtextFilter}[withtext]`);
      finalPad = '[withtext]';
    }

    // Output formatting (hard cuts are preferred)
    filterParts.push(`${finalPad}fps=${fps},format=yuv420p[final]`);

    const filterComplex = filterParts.join(';');

    args.push(
      '-filter_complex', filterComplex,
      '-map', '[final]',
      '-map', '0:a',  // Keep audio synced with video
      ...this._encodeTail(segmentPath, renderOptions)
    );

    await runFFmpeg(args, `segment ${segment.id} (${segment.layout})`);
    return segmentPath;
  }

  output(options = {}) {
    const resolution = options.output?.resolution || config.output.resolution;
    return { width: Number(resolution.split('x')[0]), height: Number(resolution.split('x')[1]), fps: Number(options.output?.fps || config.output.fps) };
  }

  async renderNeutral(segment, avatarVideoPath, tempDir, renderOptions = {}) {
    const out = path.join(tempDir, `seg_${segment.id}_neutral.mp4`);
    const duration = Math.max(0.1, segment.end_time - segment.start_time);
    const { width, height, fps } = this.output(renderOptions);
    await runFFmpeg(['-ss', String(segment.start_time), '-t', String(duration), '-i', avatarVideoPath,
      '-f', 'lavfi', '-i', `color=c=0x111827:s=${width}x${height}:r=${fps}:d=${duration}`,
      '-map', '1:v', '-map', '0:a', '-shortest', ...this._encodeTail(out, renderOptions)], `segment ${segment.id} (neutral card)`);
    return out;
  }

  /**
   * Shared output-encoding args so every render path (full, safe, blank) produces
   * concat-compatible files with identical codec, timescale, and audio settings.
   */
  _encodeTail(outPath, renderOptions = {}) {
    const requested = renderOptions.performance?.useGpu;
    const useGpu = requested === true || requested === 'true' ? true : requested === false || requested === 'false' ? false : config.encoding.useGpu;
    return [
      '-c:v', useGpu ? 'h264_nvenc' : 'libx264',
      '-preset', useGpu ? 'p4' : 'fast',
      '-video_track_timescale', '90000', // STRICT TIMELINE FIX: prevents the 1-hour concat duration bug
      '-c:a', 'aac',
      '-b:a', '128k',
      '-y',
      outPath,
    ];
  }

  /**
   * FALLBACK 1 — the simplest render that can't really fail: the avatar video slice,
   * scaled to frame, with its own audio. No asset, no overlay, no fancy filters.
   * Preserves the segment's duration and voice, so the timeline and captions stay in sync.
   */
  async renderSafe(segment, avatarVideoPath, tempDir, renderOptions = {}) {
    const segmentPath = path.join(tempDir, `seg_${segment.id}_safe.mp4`);
    const duration = segment.end_time - segment.start_time;
    const { width, height, fps } = this.output(renderOptions);

    const args = [
      '-ss', segment.start_time.toString(),
      '-t', duration.toString(),
      '-i', avatarVideoPath,
      '-filter_complex',
      `[0:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},fps=${fps},format=yuv420p,setpts=PTS-STARTPTS[final]`,
      '-map', '[final]',
      '-map', '0:a',
      ...this._encodeTail(segmentPath, renderOptions),
    ];

    await runFFmpeg(args, `segment ${segment.id} (safe fallback)`);
    return segmentPath;
  }

  /**
   * FALLBACK 2 — last resort that depends on nothing: a black clip of the exact duration
   * with silent audio. Only reached if even the avatar slice fails. Guarantees the timeline
   * length is preserved so nothing downstream (concat, burned captions) desyncs.
   */
  async renderBlank(segment, tempDir, renderOptions = {}) {
    const segmentPath = path.join(tempDir, `seg_${segment.id}_blank.mp4`);
    const duration = Math.max(0.1, segment.end_time - segment.start_time);
    const { width, height, fps } = this.output(renderOptions);

    const args = [
      '-f', 'lavfi', '-i', `color=c=black:s=${width}x${height}:r=${fps}:d=${duration}`,
      '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
      '-t', duration.toString(),
      '-map', '0:v', '-map', '1:a',
      '-pix_fmt', 'yuv420p',
      ...this._encodeTail(segmentPath, renderOptions),
    ];

    await runFFmpeg(args, `segment ${segment.id} (blank fallback)`);
    return segmentPath;
  }

  /**
   * Ken Burns effect variations for still images.
   */
  getKenBurnsEffect(motion, duration, fps, width, height) {
    const totalFrames = Math.ceil(duration * fps);
    const s = `${width}x${height}`;

    // Calculate exact zoom increments so it never hits the limit early and stops
    // And use 'on' (frame counter) to prevent floating point accumulation wobble!
    // We calculate exactly how much to zoom per frame based on the total frames!
    const zIn = (0.3 / totalFrames).toFixed(6); // Zoom from 1.0 to 1.3 precisely over the duration
    const zOut = (0.3 / totalFrames).toFixed(6); // Zoom from 1.3 to 1.0
    
    switch (motion) {
      case 'ken_burns':
      case 'slow_zoom_in':
        // Perfect deterministic zoom into center
        return `zoompan=z='1.0+(on*${zIn})':d=${totalFrames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${s}:fps=${fps}`;
      case 'slow_zoom_out':
        // Perfect deterministic zoom out from center
        return `zoompan=z='1.3-(on*${zOut})':d=${totalFrames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${s}:fps=${fps}`;
      case 'subtle_drift':
        // Pan perfectly from left to right at constant zoom 1.15 over the exact duration
        return `zoompan=z='1.15':d=${totalFrames}:x='(iw-(iw/zoom))*(on/${totalFrames})':y='ih/2-(ih/zoom/2)':s=${s}:fps=${fps}`;
      default:
        // Default: gentle zoom in
        const zDef = (0.2 / totalFrames).toFixed(6);
        return `zoompan=z='1.0+(on*${zDef})':d=${totalFrames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${s}:fps=${fps}`;
    }
  }

  /**
   * Subtle motion for full_avatar segments (applied directly to avatar video).
   */
  getAvatarMotion(motion, duration, fps, width, height) {
    // For video inputs, we use scale + crop with slight zoom to simulate motion
    // True zoompan on video is expensive; use a simpler approach
    const padW = Math.floor(width * 1.05);
    const padH = Math.floor(height * 1.05);

    switch (motion) {
      case 'slow_zoom_in':
        return `scale=${padW}:${padH}:force_original_aspect_ratio=increase,crop=${width}:${height},setpts=PTS-STARTPTS`;
      case 'slow_zoom_out':
        return `scale=${padW}:${padH}:force_original_aspect_ratio=increase,crop=${width}:${height}:exact=1,setpts=PTS-STARTPTS`;
      default:
        return `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setpts=PTS-STARTPTS`;
    }
  }

  /**
   * Generate the layout filter using pre-processed [asset] and [0:v].
   */
  getLayoutFilter(layout, width, height) {
    const halfW = Math.floor(width / 2);
    const pipW = Math.floor(width * 0.3);
    const pipH = Math.floor(height * 0.3);
    const pad = 40;

    switch (layout) {
      case 'visual_only':
        return `[asset]copy[outv]`;

      case 'split_screen':
        return [
          `[0:v]scale=${halfW}:${height}:force_original_aspect_ratio=increase,crop=${halfW}:${height}[left]`,
          `[asset]scale=${halfW}:${height}:force_original_aspect_ratio=increase,crop=${halfW}:${height}[right]`,
          `[left][right]hstack=inputs=2:shortest=1[outv]`
        ].join(';');

      case 'pip_bottom_right':
        return [
          `[asset]copy[bg]`,
          `[0:v]scale=${pipW}:${pipH}:force_original_aspect_ratio=decrease,pad=${pipW}:${pipH}:(ow-iw)/2:(oh-ih)/2[pip]`,
          `[bg][pip]overlay=x=${width - pipW - pad}:y=${height - pipH - pad}:shortest=1[outv]`
        ].join(';');

      case 'pip_bottom_left':
        return [
          `[asset]copy[bg]`,
          `[0:v]scale=${pipW}:${pipH}:force_original_aspect_ratio=decrease,pad=${pipW}:${pipH}:(ow-iw)/2:(oh-ih)/2[pip]`,
          `[bg][pip]overlay=x=${pad}:y=${height - pipH - pad}:shortest=1[outv]`
        ].join(';');

      default:
        // Fallback: if layout is unrecognized but we have an asset, use visual_only
        // MUST consume [asset] to prevent FFmpeg unconnected output error
        return `[asset]copy[outv]`;
    }
  }
}
