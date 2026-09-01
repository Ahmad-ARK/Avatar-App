import path from 'path';
import { BasePipelineStage } from './BasePipelineStage.js';
import { runFFmpeg, probeMedia } from '../utils/ffmpegHelpers.js';

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
