import { PexelsSource } from './PexelsSource.js';
import { PixabaySource } from './PixabaySource.js';
import { WikimediaSource } from './WikimediaSource.js';
import { DuckDuckGoSource } from './DuckDuckGoSource.js';

export class SourceManager {
  constructor() {
    // Priority order: Pexels (best quality) → Pixabay → Wikimedia → DuckDuckGo (fallback)
    this.sources = [
      new PexelsSource(),
      new PixabaySource(),
      new WikimediaSource(),
      new DuckDuckGoSource(),
    ];
  }

  /**
   * Search across all sources. Returns first successful results.
   * Falls through to next source if previous returns empty.
   *
   * @param {string} query
   * @param {'image'|'video'} type
   * @param {number} count
   * @returns {Promise<Array>} - asset results
   */
  async search(query, type = 'image', count = 3) {
    for (const source of this.sources) {
      try {
        const results = await source.search(query, type, count);
        if (results.length > 0) {
          console.log(`[SourceManager] Found ${results.length} results from ${source.name} for "${query}"`);
          return results;
        }
      } catch (error) {
        console.warn(`[SourceManager] ${source.name} failed for "${query}":`, error.message);
      }
    }
    console.warn(`[SourceManager] No results from any source for "${query}"`);
    return [];
  }

  /**
   * Search ALL sources in parallel and merge results.
   * Useful for asset review mode — shows user all options.
   */
  async searchAll(query, type = 'image', countPerSource = 2) {
    const allResults = await Promise.allSettled(
      this.sources.map(source =>
        source.search(query, type, countPerSource).catch(() => [])
      )
    );
    return allResults
      .filter(r => r.status === 'fulfilled')
      .flatMap(r => r.value);
  }
}
