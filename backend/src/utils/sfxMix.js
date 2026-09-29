import path from 'path';
import fs from 'fs-extra';
import { runFFmpeg } from './ffmpegHelpers.js';

export async function renderSfxTrack(cues, durationSeconds, tempDir, masterVolume = 0.28) {
  const valid = (cues || []).filter(c => fs.existsSync(c.assetPath) && c.sourceOutSeconds > c.sourceInSeconds && c.atSeconds < durationSeconds);
  if (!valid.length) return null;
  // A finite silent base establishes the exact output duration. Do not use an unbounded
  // `apad` followed by `atrim`: ffmpeg-static can process that graph pathologically slowly
  // when several delayed inputs are mixed (a 43-second track was observed running >35 min).
  const inputs = ['-f', 'lavfi', '-t', String(durationSeconds), '-i', 'anullsrc=r=48000:cl=stereo'];
  const filters = [];
  const labels = [];
  valid.forEach((cue, i) => {
    inputs.push('-i', cue.assetPath);
    const delay = Math.max(0, Math.round(cue.atSeconds * 1000));
    const gain = Math.max(0, Math.min(1, Number(cue.gain || 1) * Number(masterVolume || 0)));
    filters.push(`[${i + 1}:a]atrim=start=${cue.sourceInSeconds}:end=${cue.sourceOutSeconds},asetpts=PTS-STARTPTS,volume=${gain},adelay=${delay}|${delay}[s${i}]`);
    labels.push(`[s${i}]`);
  });
  filters.push(`[0:a]${labels.join('')}amix=inputs=${labels.length + 1}:duration=longest:normalize=0[out]`);
  const output = path.join(tempDir, 'sfx_mix.wav');
  await runFFmpeg([...inputs, '-filter_complex', filters.join(';'), '-map', '[out]', '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', '-y', output], 'rendering SFX timeline', 120000);
  return output;
}

export function appendSfxMix(filters, voiceLabel, sfxInput) {
  filters.push(`${voiceLabel}[${sfxInput}:a]amix=inputs=2:duration=first:normalize=0[sfxout]`);
  return '[sfxout]';
}
