import { apiJson } from './apiClient.js';
import { repairAndParseJSON } from '../utils/jsonRepair.js';
import config from '../config.js';

/**
 * Sends a chat completion request to DeepSeek API.
 * Returns parsed JSON object from the response.
 * Includes automatic retry with exponential backoff and JSON repair.
 *
 * @param {string} systemPrompt
 * @param {string} userPrompt
 * @param {object} options - { model, temperature, maxTokens, retries }
 * @returns {Promise<object>} - parsed JSON from LLM response
 */
export async function chatCompletion(systemPrompt, userPrompt, options = {}) {
  const model = options.model || config.deepseek.model;
  const maxRetries = options.retries || 3;
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // retries=0 on apiJson — we handle retries at THIS level only
      const data = await apiJson(config.deepseek.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.deepseek.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          response_format: { type: 'json_object' },
          temperature: options.temperature ?? 0.3,
          max_tokens: options.maxTokens ?? 8192,
          stream: false,
        }),
        timeout: 180000, // 3 min timeout
      }, 0); // <-- retries=0: no retries inside apiClient

      // === DIAGNOSTIC: Log the full response structure if something looks wrong ===
      if (!data || !data.choices || data.choices.length === 0) {
        console.error(`[LLM Service] DIAGNOSTIC — Unexpected API response structure:`, JSON.stringify(data).substring(0, 500));
        throw new Error(`Unexpected API response: no choices array. Keys: ${Object.keys(data || {}).join(', ')}`);
      }

      const choice = data.choices[0];

      if (!choice.message || choice.message.content === null || choice.message.content === undefined) {
        console.error(`[LLM Service] DIAGNOSTIC — Choice object:`, JSON.stringify(choice).substring(0, 500));
        throw new Error(`Empty content in response. finish_reason=${choice.finish_reason}, role=${choice.message?.role}`);
      }

      const content = choice.message.content;

      if (content.trim() === '') {
        console.error(`[LLM Service] DIAGNOSTIC — Got empty string content. finish_reason=${choice.finish_reason}`);
        throw new Error(`Empty string content. finish_reason=${choice.finish_reason}`);
      }

      // Log if the model hit its token limit (output was truncated)
      if (choice.finish_reason === 'length') {
        console.warn(`[LLM Service] Response was truncated (finish_reason=length). Will attempt JSON repair.`);
      }

      // Use the repair utility — handles truncation, bad escapes, missing brackets
      return repairAndParseJSON(content);

    } catch (error) {
      lastError = error;
      console.warn(`[LLM Service] Attempt ${attempt}/${maxRetries} failed: ${error.message}`);
      if (attempt < maxRetries) {
        // Longer backoff: 3s, 6s, 12s — give DeepSeek breathing room
        const waitMs = 3000 * Math.pow(2, attempt - 1);
        console.log(`[LLM Service] Waiting ${waitMs / 1000}s before retry...`);
        await new Promise(r => setTimeout(r, waitMs));
      }
    }
  }

  throw new Error(`LLM request failed after ${maxRetries} attempts. Last error: ${lastError.message}`);
}
