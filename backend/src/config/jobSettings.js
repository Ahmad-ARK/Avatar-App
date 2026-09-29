const MODES = new Set(['auto', 'exact', 'off']);
const PLACEMENTS = new Set(['even', 'topic_aware', 'manual']);
const AVATAR_LAYOUTS = new Set(['full_avatar', 'split_screen', 'pip_bottom_right', 'pip_bottom_left']);

export const DEFAULT_JOB_SETTINGS = Object.freeze({
  schemaVersion: 2,
  avatar: Object.freeze({ mode: 'auto', appearanceCount: 5, secondsPerAppearance: 5, placement: 'topic_aware', layout: 'full_avatar', minimumGapSeconds: 1, manualStartSeconds: [] }),
  sources: Object.freeze({ projectAssets: true, defaultLibrary: true, pexels: true, pixabay: true, wikimedia: true, duckduckgo: true, serper: false, webVideoDownload: true, aiImages: false }),
  assetTypes: Object.freeze({ images: true, videos: true }),
  excludedAssetIds: Object.freeze([]), projectAssetIds: Object.freeze([]), libraryCollectionIds: Object.freeze([]),
  transcription: Object.freeze({ provider: 'auto', model: 'large-v3' }),
  generation: Object.freeze({ provider: 'modal_qwen', allowRealPersonPortraits: false, maxImagesPerVideo: 12, stylePreset: 'neutral' }),
  search: Object.freeze({ maxQueriesPerTopic: 2, maxSerperQueriesPerJob: 25, maxCandidatesPerScene: 8, maxDownloadsPerScene: 2 }),
  budget: Object.freeze({ modalTargetUsdPerJob: 2.5 }),
  verification: Object.freeze({ provider: 'auto', enabled: true }),
  missingAssetPolicy: 'neutral_card',
  clipAudio: Object.freeze({ mode: 'mute' }),
  output: Object.freeze({ resolution: '1920x1080', fps: 30 }),
  style: Object.freeze({ enableMusic: true, enableSfx: true, enableColorGrade: true, enableTransitions: true, musicVolume: 0.18, sfxVolume: 0.28, maxSfxPerMinute: 6, transitionDuration: 0.3 }),
  performance: Object.freeze({ useGpu: 'auto', renderConcurrency: 'auto' }),
  visualDensity: 'balanced', enableAvatarPip: false,
});

const clone = value => JSON.parse(JSON.stringify(value));
const bool = (value, fallback) => value === undefined ? fallback : value === true || value === 'true';
const number = (value, fallback, min, max) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const stringArray = value => Array.isArray(value) ? [...new Set(value.filter(v => typeof v === 'string' && v.trim()).map(v => v.trim()))] : [];

function merge(base, extra) {
  if (!extra || typeof extra !== 'object' || Array.isArray(extra)) return clone(base);
  const out = clone(base);
  for (const [key, value] of Object.entries(extra)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && out[key] && typeof out[key] === 'object' && !Array.isArray(out[key])) out[key] = merge(out[key], value);
    else out[key] = clone(value);
  }
  return out;
}

export function normalizeJobSettings(saved = {}, overrides = {}) {
  const legacy = merge(saved, overrides);
  const raw = merge(DEFAULT_JOB_SETTINGS, legacy);
  if (legacy.useAiImages !== undefined && !(legacy.sources && Object.hasOwn(legacy.sources, 'aiImages'))) raw.sources.aiImages = bool(legacy.useAiImages, false);
  if (legacy.verifyAssets !== undefined && !(legacy.verification && Object.hasOwn(legacy.verification, 'enabled'))) raw.verification.enabled = bool(legacy.verifyAssets, true);
  if (legacy.outputResolution !== undefined) raw.output.resolution = legacy.outputResolution;
  if (legacy.outputFps !== undefined) raw.output.fps = legacy.outputFps;
  if (legacy.useGpu !== undefined) raw.performance.useGpu = legacy.useGpu;
  for (const key of ['enableMusic', 'enableSfx', 'enableColorGrade', 'enableTransitions', 'musicVolume', 'sfxVolume', 'maxSfxPerMinute', 'transitionDuration']) if (legacy[key] !== undefined) raw.style[key] = legacy[key];

  raw.schemaVersion = 2;
  raw.avatar.mode = MODES.has(raw.avatar.mode) ? raw.avatar.mode : 'auto';
  raw.avatar.appearanceCount = Math.floor(number(raw.avatar.appearanceCount, 5, 0, 1000));
  raw.avatar.secondsPerAppearance = number(raw.avatar.secondsPerAppearance, 5, 0.01, 3600);
  raw.avatar.minimumGapSeconds = number(raw.avatar.minimumGapSeconds, 1, 0.01, 3600);
  raw.avatar.placement = PLACEMENTS.has(raw.avatar.placement) ? raw.avatar.placement : 'topic_aware';
  raw.avatar.layout = AVATAR_LAYOUTS.has(raw.avatar.layout) ? raw.avatar.layout : 'full_avatar';
  raw.avatar.manualStartSeconds = Array.isArray(raw.avatar.manualStartSeconds) ? raw.avatar.manualStartSeconds.map(Number).filter(Number.isFinite) : [];
  if (raw.avatar.mode === 'off') raw.avatar.appearanceCount = 0;

  for (const key of Object.keys(DEFAULT_JOB_SETTINGS.sources)) raw.sources[key] = bool(raw.sources[key], DEFAULT_JOB_SETTINGS.sources[key]);
  raw.assetTypes.images = bool(raw.assetTypes.images, true); raw.assetTypes.videos = bool(raw.assetTypes.videos, true);
  raw.excludedAssetIds = stringArray(raw.excludedAssetIds); raw.projectAssetIds = stringArray(raw.projectAssetIds); raw.libraryCollectionIds = stringArray(raw.libraryCollectionIds);
  raw.transcription.provider = ['auto', 'groq', 'local'].includes(raw.transcription.provider) ? raw.transcription.provider : 'auto';
  raw.transcription.model = ['large-v3', 'turbo'].includes(raw.transcription.model) ? raw.transcription.model : 'large-v3';
  raw.generation.allowRealPersonPortraits = false;
  raw.generation.maxImagesPerVideo = Math.floor(number(raw.generation.maxImagesPerVideo, 12, 0, 100));
  raw.search.maxQueriesPerTopic = Math.floor(number(raw.search.maxQueriesPerTopic, 2, 0, 10));
  raw.search.maxSerperQueriesPerJob = Math.floor(number(raw.search.maxSerperQueriesPerJob, 25, 0, 2500));
  raw.search.maxCandidatesPerScene = Math.floor(number(raw.search.maxCandidatesPerScene, 8, 1, 50));
  raw.search.maxDownloadsPerScene = Math.floor(number(raw.search.maxDownloadsPerScene, 2, 0, 10));
  raw.budget.modalTargetUsdPerJob = number(raw.budget.modalTargetUsdPerJob, 2.5, 0, 30);
  raw.verification.enabled = bool(raw.verification.enabled, true);
  raw.missingAssetPolicy = ['neutral_card', 'fail'].includes(raw.missingAssetPolicy) ? raw.missingAssetPolicy : 'neutral_card';
  raw.clipAudio.mode = ['mute', 'duck'].includes(raw.clipAudio.mode) ? raw.clipAudio.mode : 'mute';
  raw.output.resolution = /^\d{2,5}x\d{2,5}$/.test(String(raw.output.resolution)) ? String(raw.output.resolution) : '1920x1080';
  raw.output.fps = Math.round(number(raw.output.fps, 30, 1, 120));
  raw.style.enableMusic = bool(raw.style.enableMusic, true); raw.style.enableSfx = bool(raw.style.enableSfx, true); raw.style.enableColorGrade = bool(raw.style.enableColorGrade, true); raw.style.enableTransitions = bool(raw.style.enableTransitions, true);
  raw.style.musicVolume = number(raw.style.musicVolume, 0.18, 0, 1); raw.style.sfxVolume = number(raw.style.sfxVolume, 0.28, 0, 1); raw.style.maxSfxPerMinute = Math.floor(number(raw.style.maxSfxPerMinute, 6, 0, 30)); raw.style.transitionDuration = number(raw.style.transitionDuration, 0.3, 0.1, 1);
  raw.visualDensity = ['talking_head', 'balanced', 'visual_heavy'].includes(raw.visualDensity) ? raw.visualDensity : 'balanced';
  raw.enableAvatarPip = bool(raw.enableAvatarPip, false);
  return deepFreeze(raw);
}

export function validateJobSettings(settings, durationSeconds = null) {
  const errors = [];
  const a = settings.avatar;
  if (a.mode === 'exact' && a.appearanceCount > 0 && a.secondsPerAppearance <= 0) errors.push('Avatar duration must be positive.');
  if (a.mode === 'exact' && a.placement === 'manual' && a.manualStartSeconds.length !== a.appearanceCount) errors.push(`Manual placement requires exactly ${a.appearanceCount} start time(s).`);
  if (durationSeconds != null && Number.isFinite(Number(durationSeconds)) && a.mode === 'exact') {
    const required = a.appearanceCount * a.secondsPerAppearance + Math.max(0, a.appearanceCount - 1) * a.minimumGapSeconds;
    if (required > Number(durationSeconds) + 1e-9) errors.push(`Avatar schedule needs ${required.toFixed(2)} seconds but the video is ${Number(durationSeconds).toFixed(2)} seconds.`);
    for (const start of a.manualStartSeconds) if (start < 0 || start + a.secondsPerAppearance > durationSeconds) errors.push(`Manual avatar start ${start} is outside the video.`);
  }
  if (!settings.assetTypes.images && !settings.assetTypes.videos && settings.missingAssetPolicy === 'fail' && a.mode !== 'auto') errors.push('Images and videos are disabled while missing-asset policy is fail.');
  return { valid: errors.length === 0, errors };
}

export function publicSettings(settings) { return clone(settings); }
export function deepFreeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); } return value; }

