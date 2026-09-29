import path from 'path';
import fs from 'fs-extra';
import { BasePipelineStage } from './BasePipelineStage.js';
import config from '../config.js';

const TYPE_RULES = [
  ['paper', /document|paper|letter|newspaper|report|archive/i],
  ['glitch', /technology|computer|internet|television|broadcast|cyber/i],
  ['tension', /war|battle|danger|crisis|attack|death|threat/i],
  ['reveal', /reveals?|finally|conclusion|result|secret/i],
  ['riser', /build|rise|increas|approach|coming/i],
];

export class SoundEffectPlanner extends BasePipelineStage {
  constructor() { super('sound_effect_planning'); }

  async execute(context) {
    const style = context.settings?.style || {};
    context.sfxCues = [];
    if (style.enableSfx === false || Number(style.maxSfxPerMinute) === 0) return context;
    const manifestPath = path.join(config.paths.bundledDefaults, 'manifest.json');
    if (!(await fs.pathExists(manifestPath))) return context;
    const manifest = await fs.readJson(manifestPath);
    const assets = (manifest.assets || []).filter(a => a.kind === 'sfx');
    const duration = Number(context.videoDuration || 0);
    const maxCues = Math.max(duration >= 8 ? 1 : 0, Math.floor(duration * (style.maxSfxPerMinute ?? 6) / 60));
    if (!maxCues || !assets.length) return context;

    const candidates = (context.scenePlan?.segments || []).slice(1).filter(s => s.assetPath || s.visual_query || s.layout !== 'full_avatar');
    const spaced = [];
    for (const segment of candidates) {
      if (spaced.length >= maxCues) break;
      if (spaced.length && segment.start_time - spaced.at(-1).start_time < 4) continue;
      spaced.push(segment);
    }
    const counts = new Map();
    context.sfxCues = spaced.map((segment, index) => {
      const text = `${segment.visual_query || ''} ${segment.visualCategory || ''}`;
      const type = TYPE_RULES.find(([, rule]) => rule.test(text))?.[0] || (index % 3 === 0 ? 'whoosh' : 'hit');
      const pool = assets.filter(a => a.cueType === type);
      const usable = pool.length ? pool : assets.filter(a => a.cueType === 'hit');
      const used = counts.get(type) || 0; counts.set(type, used + 1);
      const asset = usable[used % usable.length];
      const clipDuration = asset.sourceOut - asset.sourceIn;
      const leadIn = type === 'riser' ? clipDuration : 0;
      return {
        id: `cue-${index + 1}`,
        assetId: asset.id,
        cueType: type,
        atSeconds: Math.max(0, Number(segment.start_time) - leadIn),
        sourceInSeconds: asset.sourceIn,
        sourceOutSeconds: asset.sourceOut,
        gain: asset.gain,
        assetPath: path.join(config.paths.bundledDefaults, asset.file),
        reason: `Scene ${segment.id} ${type} cue`,
      };
    });
    this.emitProgress(100, `Planned ${context.sfxCues.length} local sound-effect cue(s)`);
    return context;
  }
}
