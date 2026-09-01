import { BaseAssetSource } from './BaseAssetSource.js';
import { apiJson } from '../services/apiClient.js';
import config from '../config.js';

export class WikimediaSource extends BaseAssetSource {
  constructor() {
    super('wikimedia');
  }

  async search(query, type = 'image', count = 5) {
    const params = new URLSearchParams({
      action: 'query',
      generator: 'search',
      gsrsearch: query,
      gsrnamespace: '6', // File namespace
      gsrlimit: String(count),
      prop: 'imageinfo',
      iiprop: 'url|size|mime|extmetadata',
      format: 'json',
      origin: '*',
    });

    const data = await apiJson(`${config.wikimedia.endpoint}?${params}`, {
      headers: { 'User-Agent': 'AvatarPipeline/1.0 (contact@example.com)' },
    });

    const pages = data?.query?.pages || {};
    return Object.values(pages)
      .filter(p => p.imageinfo && p.imageinfo[0]?.mime?.startsWith('image/'))
      .map(p => {
        const info = p.imageinfo[0];
        return {
          id: `wiki-${p.pageid}`,
          url: info.url,
          thumbUrl: info.url.replace('/commons/', '/commons/thumb/') + '/640px-' + p.title.replace('File:', ''),
          width: info.width,
          height: info.height,
          type: 'image',
          source: 'wikimedia',
          attribution: `${info.extmetadata?.Artist?.value || 'Wikimedia Commons'} (${info.extmetadata?.LicenseShortName?.value || 'CC'})`,
        };
      });
  }
}
