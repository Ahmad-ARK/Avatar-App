import fs from 'fs-extra';
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
  if (!config.modal.imageEndpoint) throw new Error('Modal image endpoint is not configured');
  const headers = { 'Content-Type': 'application/json' };
  // Public Modal web endpoints need no caller credentials. These optional headers remain
  // available for users who put the endpoint behind a protected Modal proxy.
  if (config.modal.tokenId && config.modal.tokenSecret) {
    headers['Modal-Key'] = config.modal.tokenId;
    headers['Modal-Secret'] = config.modal.tokenSecret;
  }
  let response = await apiRequest(config.modal.imageEndpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      prompt,
      width: options.width || 1280,
      height: options.height || 720,
      steps: options.steps || 28,
      true_cfg_scale: options.guidance || 3.5,
      seed: options.seed || null,
      negative_prompt: options.negativePrompt || '',
      num_images: 1,
      output_format: 'png',
    }),
    timeout: 145000,
  });

  if (response.status === 202) {
    const pending = await response.json();
    if (!pending.poll_url) throw new Error('Modal returned 202 without a poll_url');
    const pollUrl = new URL(pending.poll_url, config.modal.imageEndpoint.endsWith('/') ? config.modal.imageEndpoint : `${config.modal.imageEndpoint}/`).toString();
    const deadline = Date.now() + 10 * 60 * 1000;
    do {
      await new Promise(resolve => setTimeout(resolve, 3000));
      response = await apiRequest(pollUrl, { headers: Object.fromEntries(Object.entries(headers).filter(([k]) => k !== 'Content-Type')), timeout: 30000 }, 0);
      if (response.status !== 202) break;
    } while (Date.now() < deadline);
    if (response.status === 202) throw new Error('Modal image generation did not finish within 10 minutes');
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.startsWith('image/')) throw new Error(`Modal image endpoint returned ${contentType || 'an unknown content type'} instead of an image`);
  await fs.writeFile(outputPath, Buffer.from(await response.arrayBuffer()));

  return outputPath;
}
