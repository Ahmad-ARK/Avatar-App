import fs from 'fs';
import { apiRequest } from './apiClient.js';
import config from '../config.js';

/**
 * Generates an image using Modal.com Flux API.
 * The endpoint returns raw PNG bytes.
 *
 * @param {string} prompt - image generation prompt
 * @param {string} outputPath - where to save the PNG
 * @param {object} options - { width, height, steps, guidance, seed }
 * @returns {Promise<string>} - outputPath
 */
export async function generateImage(prompt, outputPath, options = {}) {
  const response = await apiRequest(config.modal.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Modal proxy auth headers
      'Modal-Key': config.modal.tokenId,
      'Modal-Secret': config.modal.tokenSecret,
    },
    body: JSON.stringify({
      prompt,
      width: options.width || 1280,
      height: options.height || 720,
      steps: options.steps || 28,
      guidance: options.guidance || 3.5,
      seed: options.seed || null,
    }),
    timeout: 180000, // 3 min for cold start + generation
  });

  // Response is raw PNG bytes
  const { pipeline } = await import('stream/promises');
  await pipeline(response.body, fs.createWriteStream(outputPath));

  return outputPath;
}
