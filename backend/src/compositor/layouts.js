import config from '../config.js';

/**
 * Generates FFmpeg filtergraphs for different visual layouts.
 *
 * Inputs:
 * [0:v] - Avatar video
 * [1:v] - Background/Stock asset
 */
export const layouts = {

  full_avatar: () => {
    const { width, height } = config.output;
    return `[0:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}[outv]`;
  },

  visual_only: () => {
    const { width, height } = config.output;
    return `[1:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}[outv]`;
  },

  split_screen: () => {
    const { width, height } = config.output;
    const halfW = width / 2;
    // Avatar on left (scale to fit half without cutting off, pad with black), Asset on right
    return `
      [0:v]scale=${halfW}:${height}:force_original_aspect_ratio=decrease,pad=${halfW}:${height}:(ow-iw)/2:(oh-ih)/2[left];
      [1:v]scale=${halfW}:${height}:force_original_aspect_ratio=increase,crop=${halfW}:${height}[right];
      [left][right]hstack=inputs=2:shortest=1[outv]
    `.trim().replace(/\s+/g, '');
  },

  pip_bottom_right: () => {
    const { width, height } = config.output;
    const pipW = Math.floor(width * 0.3); // 30% of screen
    const pipH = Math.floor(height * 0.3);
    const padding = 40;
    const x = width - pipW - padding;
    const y = height - pipH - padding;

    return `
      [1:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}[bg];
      [0:v]scale=${pipW}:${pipH}:force_original_aspect_ratio=decrease,pad=${pipW}:${pipH}:(ow-iw)/2:(oh-ih)/2[pip];
      [bg][pip]overlay=x=${x}:y=${y}:shortest=1[outv]
    `.trim().replace(/\s+/g, '');
  },

  pip_bottom_left: () => {
    const { width, height } = config.output;
    const pipW = Math.floor(width * 0.3);
    const pipH = Math.floor(height * 0.3);
    const padding = 40;
    const x = padding;
    const y = height - pipH - padding;

    return `
      [1:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}[bg];
      [0:v]scale=${pipW}:${pipH}:force_original_aspect_ratio=decrease,pad=${pipW}:${pipH}:(ow-iw)/2:(oh-ih)/2[pip];
      [bg][pip]overlay=x=${x}:y=${y}:shortest=1[outv]
    `.trim().replace(/\s+/g, '');
  }
};
