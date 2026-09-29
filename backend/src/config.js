import fs from 'fs';
import os from 'os';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Result of runtime GPU (NVENC) detection: null = not yet probed, true/false = probed.
// Set once per run by the compositor before rendering (see detectNvenc in ffmpegHelpers).
let _gpuDetected = null;

// Load .env from project root (one level above backend/)
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Save settings.json in the writable user data path (APP_ROOT), or fallback to project root
const rootPath = process.env.APP_ROOT || path.resolve(__dirname, '../..');
const settingsPath = path.resolve(rootPath, 'settings.json');

// Read settings.json if it exists
let localSettings = {};
try {
  if (fs.existsSync(settingsPath)) {
    const data = fs.readFileSync(settingsPath, 'utf-8');
    localSettings = JSON.parse(data);
  }
} catch (e) {
  console.warn('Could not read settings.json:', e.message);
}

// Helper to get from localSettings first, then env, then default
function getVal(key, envKey, defaultVal) {
  if (localSettings[key] !== undefined && localSettings[key] !== '') {
    return localSettings[key];
  }
  if (process.env[envKey] !== undefined && process.env[envKey] !== '') {
    return process.env[envKey];
  }
  return defaultVal;
}

const config = {
  // The Electron host sets PORT=0 to request a free OS-assigned port. Runtime process
  // configuration must win over an old persisted `port` value from earlier releases.
  port: parseInt(process.env.PORT !== undefined && process.env.PORT !== '' ? process.env.PORT : getVal('port', 'PORT', '3001')),
  frontendUrl: getVal('frontendUrl', 'FRONTEND_URL', 'http://localhost:5173'),

  groq: {
    get apiKey() { return getVal('groqApiKey', 'GROQ_API_KEY'); },
    model: 'whisper-large-v3',
    endpoint: 'https://api.groq.com/openai/v1/audio/transcriptions',
  },

  serper: {
    get apiKey() { return getVal('serperApiKey', 'SERPER_API_KEY'); },
    get enabled() { const v = getVal('serperEnabled', 'SERPER_ENABLED', 'false'); return v === true || v === 'true'; },
    get freeCreditsRemaining() { return Math.max(0, Math.min(2500, parseInt(getVal('serperFreeCreditsRemaining', 'SERPER_FREE_CREDITS_REMAINING', '2500'), 10) || 0)); },
    endpoint: 'https://google.serper.dev',
  },

  deepseek: {
    get apiKey() { return getVal('deepseekApiKey', 'DEEPSEEK_API_KEY'); },
    get model() { return getVal('deepseekModel', 'DEEPSEEK_MODEL', 'deepseek-v4-flash'); },
    endpoint: 'https://api.deepseek.com/chat/completions',
  },

  modal: {
    get endpoint() { return getVal('modalEndpoint', 'MODAL_ENDPOINT', 'https://ahmadkhalid236997--flux-api-model-web.modal.run'); },
    get tokenId() { return getVal('modalTokenId', 'MODAL_TOKEN_ID'); },
    get tokenSecret() { return getVal('modalTokenSecret', 'MODAL_TOKEN_SECRET'); },
    get imageEndpoint() { return getVal('modalImageEndpoint', 'MODAL_IMAGE_ENDPOINT', this.endpoint); },
    get visionEndpoint() { return getVal('modalVisionEndpoint', 'MODAL_VISION_ENDPOINT', ''); },
  },

  pexels: {
    get apiKey() { return getVal('pexelsApiKey', 'PEXELS_API_KEY'); },
    imageEndpoint: 'https://api.pexels.com/v1/search',
    videoEndpoint: 'https://api.pexels.com/videos/search',
  },

  pixabay: {
    get apiKey() { return getVal('pixabayApiKey', 'PIXABAY_API_KEY'); },
    endpoint: 'https://pixabay.com/api/',
  },

  wikimedia: {
    endpoint: 'https://commons.wikimedia.org/w/api.php',
  },

  output: {
    get resolution() { return getVal('outputResolution', 'OUTPUT_RESOLUTION', '1920x1080'); },
    get fps() { return parseInt(getVal('outputFps', 'OUTPUT_FPS', '30')); },
    get width() { return parseInt(this.resolution.split('x')[0]); },
    get height() { return parseInt(this.resolution.split('x')[1]); },
  },

  encoding: {
    // 'on' | 'off' | 'auto'. Default 'auto' → use the GPU when NVENC is actually available,
    // else fall back to CPU. An explicit true/false from Settings always wins.
    get gpuMode() {
      const val = getVal('useGpu', 'USE_GPU', 'auto');
      if (val === 'true' || val === true) return 'on';
      if (val === 'false' || val === false) return 'off';
      return 'auto';
    },
    get useGpu() {
      const mode = this.gpuMode;
      if (mode === 'on') return true;
      if (mode === 'off') return false;
      return _gpuDetected === true; // 'auto': only once detection confirms NVENC works
    },
    // Called once per run after probing the GPU.
    setGpuDetected(v) { _gpuDetected = v === true; },
    get codec() { return this.useGpu ? 'h264_nvenc' : 'libx264'; },
    get preset() { return this.useGpu ? 'p4' : 'fast'; },
    // How many segments to render in parallel. 'auto' scales with CPU cores; GPU encode
    // sessions are limited on consumer cards, so cap lower when using the GPU.
    get concurrency() {
      const raw = getVal('renderConcurrency', 'RENDER_CONCURRENCY', 'auto');
      const explicit = parseInt(raw, 10);
      if (Number.isFinite(explicit) && explicit >= 1) return explicit;
      const cores = (os.cpus() || []).length || 4;
      const base = Math.max(2, Math.min(4, Math.floor(cores / 2)));
      return this.useGpu ? Math.min(base, 2) : base;
    },
  },

  planning: {
    // Avatar-vs-visual balance for the scene plan.
    // One of: 'talking_head' | 'balanced' | 'visual_heavy'
    // (mapped to a target visual ratio by VISUAL_DENSITY_TARGETS in utils/rhythmRules.js)
    get visualDensity() { return getVal('visualDensity', 'VISUAL_DENSITY', 'balanced'); },
    // When false, the small corner-avatar (picture-in-picture) layouts are never used;
    // those scenes become full-screen b-roll (visual_only) instead.
    get enableAvatarPip() {
      const val = getVal('enableAvatarPip', 'ENABLE_AVATAR_PIP', 'false');
      return val === 'true' || val === true;
    },
  },

  // Output styling: background music, color grade (captions are always on).
  style: {
    get enableMusic() {
      const val = getVal('enableMusic', 'ENABLE_MUSIC', 'true');
      return !(val === 'false' || val === false);
    },
    get musicVolume() {
      const v = parseFloat(getVal('musicVolume', 'MUSIC_VOLUME', '0.18'));
      return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.18;
    },
    get enableColorGrade() {
      const val = getVal('enableColorGrade', 'ENABLE_COLOR_GRADE', 'true');
      return !(val === 'false' || val === false);
    },
    get enableTransitions() {
      const val = getVal('enableTransitions', 'ENABLE_TRANSITIONS', 'true');
      return !(val === 'false' || val === false);
    },
    get transitionDuration() {
      const v = parseFloat(getVal('transitionDuration', 'TRANSITION_DURATION', '0.3'));
      return Number.isFinite(v) ? Math.min(1, Math.max(0.1, v)) : 0.3;
    },
  },

  paths: {
    root: process.env.APP_ROOT || path.resolve(__dirname, '../..'),
    uploads: path.join(process.env.APP_ROOT || path.resolve(__dirname, '../..'), 'uploads'),
    output: path.join(process.env.APP_ROOT || path.resolve(__dirname, '../..'), 'output'),
    temp: path.join(process.env.APP_ROOT || path.resolve(__dirname, '../..'), 'temp'),
    cache: path.join(process.env.APP_ROOT || path.resolve(__dirname, '../..'), 'cache'),
    fonts: path.join(process.env.APP_ROOT || path.resolve(__dirname, '../..'), 'backend', 'fonts'),
    // Bundled music ships with the app (source-relative so it resolves in dev AND packaged);
    // userMusic is a writable folder recipients can drop their own tracks into.
    music: path.resolve(__dirname, '..', 'assets', 'music'),
    userMusic: path.join(process.env.APP_ROOT || path.resolve(__dirname, '../..'), 'music'),
    assets: path.join(process.env.APP_ROOT || path.resolve(__dirname, '../..'), 'assets'),
    bundledDefaults: path.resolve(__dirname, '..', '..', 'assets', 'defaults'),
    assetCatalog: path.join(process.env.APP_ROOT || path.resolve(__dirname, '../..'), 'asset-catalog.json'),
    usage: path.join(process.env.APP_ROOT || path.resolve(__dirname, '../..'), 'usage.json'),
  },

  tools: {
    get ytDlpPath() { return getVal('ytDlpPath', 'YT_DLP_PATH', 'yt-dlp'); },
    get pythonPath() { return getVal('pythonPath', 'PYTHON_PATH', 'python'); },
    get localWhisperModel() { return getVal('localWhisperModel', 'LOCAL_WHISPER_MODEL', 'large-v3'); },
  },

  // Update in-memory settings and persist to disk
  updateSettings: (newSettings) => {
    localSettings = { ...localSettings, ...newSettings };
    fs.writeFileSync(settingsPath, JSON.stringify(localSettings, null, 2), 'utf-8');
  },

  // Retrieve current active settings
  getSettings: () => {
    return { ...localSettings };
  }
};

export default config;
