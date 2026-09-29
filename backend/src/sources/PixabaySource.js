import { BaseAssetSource } from './BaseAssetSource.js';
import { apiJson } from '../services/apiClient.js';
import config from '../config.js';

export class PixabaySource extends BaseAssetSource {
  constructor() {
    super('pixabay');
    this.capabilities = new Set(['image', 'video']);
  }

  async search(query, type = 'image', count = 5) {
    if (!config.pixabay.apiKey) return [];
    // Pixabay: key goes in query param, NOT header
    const params = new URLSearchParams({
      key: config.pixabay.apiKey,
      q: query,
      image_type: 'photo',
      orientation: 'horizontal',
      per_page: String(count),
      safesearch: 'true',
    });

    const endpoint = type === 'video' ? `${config.pixabay.endpoint}videos/` : config.pixabay.endpoint;
    if (type === 'video') params.delete('image_type');
    const data = await apiJson(`${endpoint}?${params}`);
    if (type === 'video') return (data.hits || []).map(h => { const v = h.videos?.medium || h.videos?.small || h.videos?.large; return { id: `pixabay-v-${h.id}`, url: v?.url, thumbUrl: null, width: v?.width, height: v?.height, type: 'video', source: 'pixabay', attribution: `Video by ${h.user} on Pixabay` }; }).filter(v => v.url);

    return (data.hits || []).map(h => ({
      id: `pixabay-${h.id}`,
      url: h.largeImageURL,
      thumbUrl: h.webformatURL,
      width: h.imageWidth,
      height: h.imageHeight,
      type: 'image',
      source: 'pixabay',
      attribution: `Image by ${h.user} on Pixabay`,
    }));
  }
}
