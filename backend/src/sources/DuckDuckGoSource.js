import { BaseAssetSource } from './BaseAssetSource.js';
import { apiJson } from '../services/apiClient.js';

export class DuckDuckGoSource extends BaseAssetSource {
  constructor() {
    super('duckduckgo');
  }

  async search(query, type = 'image', count = 5) {
    try {
      // DuckDuckGo image search via their vqd token flow
      // Step 1: Get vqd token
      const tokenResponse = await fetch(`https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      });
      const html = await tokenResponse.text();
      const vqdMatch = html.match(/vqd=['"]([^'"]+)['"]/);
      if (!vqdMatch) return [];

      // Step 2: Fetch images
      const params = new URLSearchParams({
        l: 'us-en', o: 'json', q: query,
        vqd: vqdMatch[1], f: ',,,,,', p: '1',
      });
      const data = await apiJson(`https://duckduckgo.com/i.js?${params}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      });

      return (data.results || []).slice(0, count).map((r, i) => ({
        id: `ddg-${i}-${Date.now()}`,
        url: r.image,
        thumbUrl: r.thumbnail,
        width: r.width || 1280,
        height: r.height || 720,
        type: 'image',
        source: 'duckduckgo',
        attribution: `Image from ${r.source || 'web'}`,
      }));
    } catch (error) {
      console.warn('[DuckDuckGo] Search failed (expected — fragile source):', error.message);
      return [];
    }
  }
}
