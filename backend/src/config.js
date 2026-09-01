import fs from 'fs';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
  port: parseInt(getVal('port', 'PORT', '3001')),
  frontendUrl: getVal('frontendUrl', 'FRONTEND_URL', 'http://localhost:5173'),

  groq: {
    get apiKey() { return getVal('groqApiKey', 'GROQ_API_KEY'); },
    model: 'whisper-large-v3',
    endpoint: 'https://api.groq.com/openai/v1/audio/transcriptions',
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
    get useGpu() {
      const val = getVal('useGpu', 'USE_GPU', 'false');
      return val === 'true' || val === true;
    },
    get codec() { return this.useGpu ? 'h264_nvenc' : 'libx264'; },
    get preset() { return this.useGpu ? 'p4' : 'fast'; },
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

  paths: {
    root: process.env.APP_ROOT || path.resolve(__dirname, '../..'),
    uploads: path.join(process.env.APP_ROOT || path.resolve(__dirname, '../..'), 'uploads'),
    output: path.join(process.env.APP_ROOT || path.resolve(__dirname, '../..'), 'output'),
    temp: path.join(process.env.APP_ROOT || path.resolve(__dirname, '../..'), 'temp'),
    cache: path.join(process.env.APP_ROOT || path.resolve(__dirname, '../..'), 'cache'),
    fonts: path.join(process.env.APP_ROOT || path.resolve(__dirname, '../..'), 'backend', 'fonts'),
  },

  // Update in-memory settings and persist to disk
  updateSettings: (newSettings) => {
    localSettings = { ...localSettings, ...newSettings };
    fs.writeFileSync(settingsPath, JSON.stringify(localSettings, null, 2), 'utf-8');
  },

  // Retrieve current active settings
  getSettings: () => {
    return localSettings;
  }
};

export default config;
