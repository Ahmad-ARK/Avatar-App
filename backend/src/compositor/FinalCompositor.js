import path from 'path';
import fs from 'fs-extra';
import { BasePipelineStage } from '../pipeline/BasePipelineStage.js';
import { runFFmpeg } from '../utils/ffmpegHelpers.js';
import { SegmentRenderer } from './SegmentRenderer.js';
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

    this.emitProgress(0, `Rendering ${segments.length} segments...`);

    // 1. Render all segments (each now includes synced audio)
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const progress = Math.round((i / segments.length) * 60);
      this.emitProgress(progress, `Rendering segment ${i + 1}/${segments.length}`);

      const segPath = await this.renderer.render(seg, videoPath, tempDir, context.nicheConfig);
      renderedPaths.push(segPath);
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
    await runFFmpeg(concatArgs);

    // 4. Burn subtitles onto the concatenated video
    this.emitProgress(80, 'Burning subtitles...');
    const finalOutputPath = path.join(config.paths.output, `${jobId}.mp4`);

    // Escape ASS path for FFmpeg on Windows
    const escapedAssPath = captionsPath.replace(/\\/g, '/').replace(/:/g, '\\:');

    const subtitleArgs = [
      '-i', concatOutputPath,
      '-vf', `ass='${escapedAssPath}'`,
      '-c:v', config.encoding.codec,
      '-preset', config.encoding.preset,
      '-c:a', 'copy', // Audio already good from concat
      '-shortest',
      '-y',
      finalOutputPath
    ];

    await runFFmpeg(subtitleArgs);

    context.finalVideoPath = finalOutputPath;
    this.emitProgress(100, 'Video rendering complete');
    return context;
  }
}
