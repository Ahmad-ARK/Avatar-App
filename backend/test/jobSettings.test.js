import test from 'node:test'; import assert from 'node:assert/strict';
import { normalizeJobSettings, validateJobSettings } from '../src/config/jobSettings.js';

test('explicit v2 source setting wins over legacy force images', () => { const s = normalizeJobSettings({}, { useAiImages: true, sources: { aiImages: false } }); assert.equal(s.sources.aiImages, false); assert.ok(Object.isFrozen(s)); });
test('snapshots do not share nested state', () => { const a = normalizeJobSettings({}, { avatar: { appearanceCount: 3 } }); const b = normalizeJobSettings({}, { avatar: { appearanceCount: 8 } }); assert.equal(a.avatar.appearanceCount, 3); assert.equal(b.avatar.appearanceCount, 8); });
test('manual and duration validation is actionable', () => { const s = normalizeJobSettings({}, { avatar: { mode: 'exact', appearanceCount: 5, secondsPerAppearance: 5, placement: 'manual', manualStartSeconds: [0] } }); const v = validateJobSettings(s, 20); assert.equal(v.valid, false); assert.ok(v.errors.length >= 2); });
test('SFX settings are bounded and can be disabled', () => { const s = normalizeJobSettings({}, { style: { enableSfx: false, sfxVolume: 9, maxSfxPerMinute: 999 } }); assert.equal(s.style.enableSfx, false); assert.equal(s.style.sfxVolume, 1); assert.equal(s.style.maxSfxPerMinute, 30); });

