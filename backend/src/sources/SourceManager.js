import { PexelsSource } from './PexelsSource.js';
import { PixabaySource } from './PixabaySource.js';
import { WikimediaSource } from './WikimediaSource.js';
import { DuckDuckGoSource } from './DuckDuckGoSource.js';
import { LocalAssetSource } from './LocalAssetSource.js';
import { assetCatalog } from '../assets/catalog.js';
import { SerperSource } from './SerperSource.js';
import { SearchCache } from './SearchCache.js';
import config from '../config.js';

export class SourceManager {
  constructor(sources = null) {
    this.cache = sources ? null : new SearchCache(config.paths.cache + '/search');
    // Priority order: Pexels (best quality) → Pixabay → Wikimedia → DuckDuckGo (fallback)
    this.sources = sources || [
      new LocalAssetSource(assetCatalog),
      new PexelsSource(),
      new PixabaySource(),
      new WikimediaSource(),
      new SerperSource(),
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
  async search(query, type = 'image', count = 3, options = {}) {
    for (const source of this.sources) {
      const enabled = source.name === 'local_assets' || options.settings?.sources?.[source.name] !== false;
      if (!enabled || (source.capabilities && !source.capabilities.has(type))) continue;
      try {
        const ttl = /\b(today|latest|current|breaking|202[5-9])\b/i.test(query) ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
        let results = this.cache ? await this.cache.get(source.name, query, type, count, ttl) : null;
        if (!results) { results = await source.search(query, type, count, options); if (this.cache && results.length) await this.cache.put(source.name, query, type, count, results); }
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
  async searchAll(query, type = 'image', countPerSource = 2, options = {}) {
    const allResults = await Promise.allSettled(
      this.sources.filter(source => (source.name === 'local_assets' || options.settings?.sources?.[source.name] !== false) && (!source.capabilities || source.capabilities.has(type))).map(async source => {
        const ttl = /\b(today|latest|current|breaking|202[5-9])\b/i.test(query) ? 3600000 : 86400000;
        let cached = this.cache ? await this.cache.get(source.name, query, type, countPerSource, ttl) : null;
        if (cached) return cached;
        const rows = await source.search(query, type, countPerSource, options).catch(() => []);
        if (this.cache && rows.length) await this.cache.put(source.name, query, type, countPerSource, rows);
        return rows;
      })
    );
    return allResults
      .filter(r => r.status === 'fulfilled')
      .flatMap(r => r.value);
  }
}
