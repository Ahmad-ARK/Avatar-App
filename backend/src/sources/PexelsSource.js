import { BaseAssetSource } from './BaseAssetSource.js';
import { apiJson } from '../services/apiClient.js';
import config from '../config.js';

export class PexelsSource extends BaseAssetSource {
  constructor() {
    super('pexels');
  }

  async search(query, type = 'image', count = 5) {
    const headers = { Authorization: config.pexels.apiKey };

    if (type === 'video') {
      const data = await apiJson(
        `${config.pexels.videoEndpoint}?query=${encodeURIComponent(query)}&per_page=${count}&orientation=landscape`,
        { headers }
      );
      return (data.videos || []).map(v => {
        const hdFile = v.video_files.find(f => f.quality === 'hd') || v.video_files[0];
        return {
          id: `pexels-v-${v.id}`,
          url: hdFile.link,
          thumbUrl: v.image,
          width: hdFile.width,
          height: hdFile.height,
          type: 'video',
          source: 'pexels',
          attribution: `Video by ${v.user?.name || 'Pexels'}`,
        };
      });
    }

    // Image search
    const data = await apiJson(
      `${config.pexels.imageEndpoint}?query=${encodeURIComponent(query)}&per_page=${count}&orientation=landscape`,
      { headers }
    );
    return (data.photos || []).map(p => ({
      id: `pexels-i-${p.id}`,
      url: p.src.large2x || p.src.large,
      thumbUrl: p.src.medium,
      width: p.width,
      height: p.height,
      type: 'image',
      source: 'pexels',
      attribution: `Photo by ${p.photographer}`,
    }));
  }
}
