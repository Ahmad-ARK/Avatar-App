import { BaseAssetSource } from './BaseAssetSource.js';
import { apiJson } from '../services/apiClient.js';
import config from '../config.js';

export class PixabaySource extends BaseAssetSource {
  constructor() {
    super('pixabay');
  }

  async search(query, type = 'image', count = 5) {
    // Pixabay: key goes in query param, NOT header
    const params = new URLSearchParams({
      key: config.pixabay.apiKey,
      q: query,
      image_type: 'photo',
      orientation: 'horizontal',
      per_page: String(count),
      safesearch: 'true',
    });

    const data = await apiJson(`${config.pixabay.endpoint}?${params}`);

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
