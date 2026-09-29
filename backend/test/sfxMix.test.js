import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { renderSfxTrack } from '../src/utils/sfxMix.js';
import { probeMedia } from '../src/utils/ffmpegHelpers.js';

test('renders indexed SFX at an exact timeline offset', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'avatar-sfx-'));
  try {
    const assetPath = path.resolve('..', 'assets', 'defaults', 'sfx', 'hit-slam.wav');
    const output = await renderSfxTrack([{ assetPath, atSeconds: 1.25, sourceInSeconds: 0, sourceOutSeconds: 0.5, gain: 1 }], 3, dir, 0.25);
    assert.ok(await fs.pathExists(output));
    const info = await probeMedia(output);
    assert.ok(Math.abs(Number(info.duration) - 3) < 0.05);
  } finally {
    await fs.remove(dir);
  }
});

test('multiple delayed SFX cues finish promptly without an infinite padded stream', { timeout: 10000 }, async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'avatar-sfx-many-'));
  try {
    const slam = path.resolve('..', 'assets', 'defaults', 'sfx', 'hit-slam.wav');
    const whoosh = path.resolve('..', 'assets', 'defaults', 'sfx', 'whoosh-analog.wav');
    const cues = [
      { assetPath: whoosh, atSeconds: 3, sourceInSeconds: 0.15, sourceOutSeconds: 2.1, gain: 0.4 },
      { assetPath: slam, atSeconds: 8, sourceInSeconds: 0, sourceOutSeconds: 0.8, gain: 0.4 },
      { assetPath: whoosh, atSeconds: 13, sourceInSeconds: 0.15, sourceOutSeconds: 2.1, gain: 0.4 },
      { assetPath: slam, atSeconds: 18, sourceInSeconds: 0, sourceOutSeconds: 0.8, gain: 0.4 },
    ];
    const output = await renderSfxTrack(cues, 24, dir, 0.25);
    const info = await probeMedia(output);
    assert.ok(Math.abs(Number(info.duration) - 24) < 0.05);
  } finally {
    await fs.remove(dir);
  }
});
