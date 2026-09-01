/**
 * Background-music mixing. The narrator's voice is the anchor; a music bed sits under it and
 * automatically ducks (drops in volume) whenever the narrator speaks, via sidechaincompress.
 *
 * Music tracks are user-supplied — drop royalty-free files into the music folder (see
 * backend/assets/music/README). If none are present, mixing is skipped and the voice is used
 * as-is, so this is always safe to leave enabled.
 */

import fs from 'fs';
import path from 'path';

const AUDIO_EXTS = /\.(mp3|m4a|aac|wav|ogg|flac)$/i;

/**
 * Pick a music track from one or more directories. Random so different videos get different
 * beds. Returns an absolute path, or null if nothing usable is found.
 *
 * @param {string|string[]} dirs
 */
export function pickMusicTrack(dirs, seed = Math.random()) {
  const list = Array.isArray(dirs) ? dirs : [dirs];
  const files = [];
  for (const dir of list) {
    try {
      for (const f of fs.readdirSync(dir)) {
        if (!AUDIO_EXTS.test(f)) continue;
        const p = path.join(dir, f);
        try { if (fs.statSync(p).size > 1024) files.push(p); } catch { /* skip */ }
      }
    } catch { /* dir missing — skip */ }
  }
  if (files.length === 0) return null;
  return files[Math.floor(seed * files.length) % files.length];
}

/**
 * Build the audio side of the final mix.
 *
 * @param {object} opts
 * @param {number} opts.musicInput - the ffmpeg input index of the music (e.g. 1)
 * @param {number} [opts.volume=0.18] - music bed level (0..1) before ducking
 * @returns {{ filter: string, outLabel: string }}
 */
export function buildMusicMixFilter({ musicInput, volume = 0.18 }) {
  const v = Math.min(1, Math.max(0, volume));
  // Split the voice: one copy is mixed in, the other drives the ducking sidechain.
  // Music is leveled, then compressed by the voice, then mixed with the voice at unity
  // (normalize=0 keeps the voice from being halved by amix).
  const filter = [
    `[0:a]asplit=2[voice_mix][voice_sc]`,
    `[${musicInput}:a]volume=${v}[music_lvl]`,
    `[music_lvl][voice_sc]sidechaincompress=threshold=0.02:ratio=8:attack=15:release=350[music_duck]`,
    `[voice_mix][music_duck]amix=inputs=2:duration=first:normalize=0[aout]`,
  ].join(';');
  return { filter, outLabel: '[aout]' };
}
