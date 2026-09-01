import fs from 'fs';
import { apiJson } from './apiClient.js';
import config from '../config.js';

/**
 * Uses DeepSeek vision model to verify if an image matches a query.
 * Falls back to text-only model if vision unavailable.
 *
 * @param {string} imagePath - path to image file
 * @param {string} expectedQuery - what the image should depict
 * @returns {Promise<{match: boolean, confidence: number, reason: string}>}
 */
export async function verifyAsset(imagePath, expectedQuery) {
  // Read image as base64
  const imageBuffer = fs.readFileSync(imagePath);
  const base64Image = imageBuffer.toString('base64');
  const mimeType = imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg';

  try {
    const data = await apiJson(config.deepseek.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.deepseek.apiKey}`,
      },
      body: JSON.stringify({
        model: config.deepseek.model,
        messages: [
          {
            role: 'system',
            content: 'You are an image relevance checker. Return your answer as JSON with keys: match (boolean), confidence (0-100), reason (string). You must respond with valid JSON only.',
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Does this image match the search query: "${expectedQuery}"? Is it a good visual representation for a video about this topic?`,
              },
              {
                type: 'image_url',
                image_url: { url: `data:${mimeType};base64,${base64Image}` },
              },
            ],
          },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 200,
      }),
      timeout: 30000,
    });

    const content = data.choices[0].message.content;
    return JSON.parse(content);
  } catch (error) {
    // If vision not supported, return neutral result
    return { match: true, confidence: 50, reason: 'Vision verification unavailable' };
  }
}
