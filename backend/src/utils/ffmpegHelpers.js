import { spawn } from 'child_process';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';

const ffmpegPath = ffmpegStatic;
const ffprobePath = ffprobeStatic.path;

/**
 * Runs FFmpeg with the given arguments via child_process.spawn.
 * Safer than fluent-ffmpeg on Windows (no escaping issues).
 *
 * @param {string[]} args - FFmpeg arguments array
 * @param {string} [label] - human label for error messages (e.g. "segment 3 (split_screen)")
 * @returns {Promise<void>}
 */
export function runFFmpeg(args, label = '') {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, args);

    let errorLog = '';
    proc.stderr.on('data', (data) => {
      errorLog += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) return resolve();
      const where = label ? ` while rendering ${label}` : '';
      reject(new Error(`FFmpeg failed${where} (exit ${code}): ${summarizeFFmpegError(errorLog)}`));
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to start FFmpeg${label ? ` for ${label}` : ''}: ${err.message}`));
    });
  });
}

/**
 * Turn FFmpeg's noisy stderr into a short, human-readable cause. Falls back to the last
 * couple of lines when nothing matches a known pattern.
 */
function summarizeFFmpegError(log) {
  if (!log) return 'no output from FFmpeg';

  const known = [
    [/No such file or directory/i, 'an input file was missing or unreadable'],
    [/Invalid argument[\s\S]*filter/i, 'a filter option was malformed (check text/color/path escaping)'],
    [/Unable to parse option value/i, 'an invalid option value (often a bad color or size)'],
    [/Error (?:parsing|initializing).*filter/i, 'the filtergraph could not be built'],
    [/Cannot find a matching stream/i, 'a referenced audio/video stream was missing'],
    [/Conversion failed/i, 'FFmpeg could not encode the output'],
    [/height not divisible by 2|width not divisible by 2/i, 'an odd output dimension (needs even width/height)'],
    [/Fontconfig error|Cannot load default config|no such font|Cannot find font/i, 'the caption/overlay font could not be loaded'],
    [/moov atom not found|Invalid data found/i, 'a corrupt or incomplete input media file'],
  ];
  for (const [re, msg] of known) {
    if (re.test(log)) return msg;
  }
  // Fall back to the last non-empty stderr lines, trimmed.
  const lines = log.trim().split('\n').map(l => l.trim()).filter(Boolean);
  return lines.slice(-2).join(' | ').slice(-300);
}

/**
 * Probes media file to get duration, width, height using ffprobe.
 *
 * @param {string} filePath
 * @returns {Promise<{duration: number, width: number, height: number}>}
 */
export function probeMedia(filePath) {
  return new Promise((resolve, reject) => {
    const args = [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height,duration',
      '-of', 'json',
      filePath,
    ];

    const proc = spawn(ffprobePath, args);
    let output = '';

    proc.stdout.on('data', (data) => { output += data.toString(); });

    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error('ffprobe failed'));
      try {
        const info = JSON.parse(output);
        const stream = info.streams[0];
        // If duration missing in video stream, fallback to format duration (omitted for brevity, assume valid for now)
        resolve({
          duration: parseFloat(stream.duration || 0),
          width: parseInt(stream.width || 0),
          height: parseInt(stream.height || 0),
        });
      } catch (e) {
        reject(new Error('Failed to parse ffprobe output'));
      }
    });
  });
}
