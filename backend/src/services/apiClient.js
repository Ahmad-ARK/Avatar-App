import fetch from 'node-fetch';

/**
 * Makes an HTTP request with error handling and retries.
 * Uses AbortController for timeouts (node-fetch v3 compatible).
 *
 * @param {string} url
 * @param {object} options - fetch options + { timeout }
 * @param {number} retries - number of retries on failure (0 = no retries)
 * @returns {Promise<Response>}
 */
export async function apiRequest(url, options = {}, retries = 2) {
  const timeoutMs = options.timeout || 30000;
  // Remove our custom 'timeout' key so it doesn't pass through to fetch
  const { timeout, ...fetchOptions } = options;
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorBody}`);
      }
      return response;
    } catch (error) {
      clearTimeout(timer);
      if (error.name === 'AbortError') {
        lastError = new Error(`Request timed out after ${timeoutMs}ms`);
      } else {
        lastError = error;
      }
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

/**
 * Makes a JSON API request and returns parsed JSON.
 * @param {number} retries - pass 0 to disable retries (if caller handles retries)
 */
export async function apiJson(url, options = {}, retries = 2) {
  const response = await apiRequest(url, options, retries);
  return response.json();
}

/**
 * Downloads a file from URL and saves to disk.
 * @param {string} url
 * @param {string} destPath - absolute path to save file
 * @returns {Promise<string>} - the destPath
 */
export async function downloadFile(url, destPath, headers = {}) {
  const response = await apiRequest(url, { headers, timeout: 60000 });
  const fs = await import('fs');
  const { pipeline } = await import('stream/promises');
  await pipeline(response.body, fs.createWriteStream(destPath));
  return destPath;
}
