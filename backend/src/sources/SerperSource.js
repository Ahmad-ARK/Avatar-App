import config from '../config.js'; import { usageLedger } from '../usage/ledger.js';
export class SerperSource {
  constructor() { this.name = 'serper'; this.capabilities = new Set(['image', 'video']); this.failed = false; }
  async search(query, type = 'image', count = 5, { settings = {}, usage = null } = {}) {
    if (this.failed || !settings.sources?.serper || !config.serper.apiKey || !config.serper.enabled) return [];
    const jobLimit = Math.min(settings.search?.maxSerperQueriesPerJob ?? 25, config.serper.freeCreditsRemaining);
    if ((usage?.serperQueries || 0) >= jobLimit || !(await usageLedger.reserveSerper(config.serper.freeCreditsRemaining, 1))) return [];
    try {
      const endpoint = type === 'video' ? 'videos' : 'images'; const response = await fetch(`${config.serper.endpoint}/${endpoint}`, { method: 'POST', headers: { 'X-API-KEY': config.serper.apiKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ q: query, num: Math.min(count, 10) }), signal: AbortSignal.timeout(12000) });
      if (response.status === 401 || response.status === 403) { await usageLedger.releaseSerper(); this.failed = true; return []; }
      if (response.status === 429) { await usageLedger.exhaustSerper(); this.failed = true; return []; }
      if (!response.ok) { await usageLedger.releaseSerper(); return []; }
      const data = await response.json(); await usageLedger.confirmSerper(); if (usage) usage.serperQueries = (usage.serperQueries || 0) + 1;
      const rows = type === 'video' ? (data.videos || []) : (data.images || []);
      return rows.slice(0, count).map((r, i) => ({ id: `serper-${type}-${i}-${Date.now()}`, url: type === 'image' ? r.imageUrl : r.link, pageUrl: r.link, thumbUrl: r.thumbnailUrl || r.imageUrl, width: r.imageWidth || null, height: r.imageHeight || null, type, source: 'serper', publisher: r.source || r.channel || null, attribution: `${r.source || r.channel || 'Web result'} via Google/Serper`, title: r.title || '', date: r.date || null, requiresDownloader: type === 'video' }));
    } catch { return []; }
  }
}
