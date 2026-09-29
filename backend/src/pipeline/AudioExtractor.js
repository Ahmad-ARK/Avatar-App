import path from 'path';
import { BasePipelineStage } from './BasePipelineStage.js';
import { runFFmpeg, probeMedia } from '../utils/ffmpegHelpers.js';
import { validateJobSettings } from '../config/jobSettings.js';

export class AudioExtractor extends BasePipelineStage {
  constructor() {
    super('audio_extraction');
  }

  async execute(context) {
    this.emitProgress(0, 'Extracting audio from video...');

    const { videoPath, tempDir } = context;
    const audioPath = path.join(tempDir, 'audio.mp3');

    // Also probe the video for duration and resolution
    const videoInfo = await probeMedia(videoPath);
    context.videoDuration = videoInfo.duration;
    context.videoWidth = videoInfo.width;
    context.videoHeight = videoInfo.height;
    const validation = validateJobSettings(context.settings, videoInfo.duration);
    if (!validation.valid) throw new Error(validation.errors.join(' '));

    // Extract audio as MP3 (Groq accepts mp3, max 25MB)
    await runFFmpeg([
      '-i', videoPath,
      '-vn',                    // No video
      '-acodec', 'libmp3lame',
      '-q:a', '4',             // Good quality, ~128kbps → ~1MB/min
      '-y',                     // Overwrite
      audioPath,
    ]);

    context.audioPath = audioPath;
    this.emitProgress(100, 'Audio extracted');
    return context;
  }
}
