export class LocalAssetSource {
  constructor(catalog) { this.name = 'local_assets'; this.catalog = catalog; this.capabilities = new Set(['image', 'video']); }
  async search(query, type, count, { settings = {} } = {}) {
    const scopes = []; if (settings.sources?.projectAssets !== false) scopes.push('project'); if (settings.sources?.defaultLibrary !== false) scopes.push('library');
    if (!scopes.length || (type === 'image' && settings.assetTypes?.images === false) || (type === 'video' && settings.assetTypes?.videos === false)) return [];
    const hits = await this.catalog.search(query, { kinds: [type], scopes, excludedIds: settings.excludedAssetIds, selectedIds: settings.projectAssetIds, collectionIds: settings.libraryCollectionIds }, count);
    return hits.map(a => ({ id: a.id, assetId: a.id, url: a.managedPath, localPath: a.managedPath, thumbUrl: null, width: a.width, height: a.height, duration: a.duration, type: a.kind, source: a.scope === 'library' ? 'default_library' : 'project_asset', attribution: a.attribution || `User asset: ${a.originalName}`, score: a.score, sourceInSeconds: a.instructions?.trimStart || 0, sourceOutSeconds: a.instructions?.trimEnd || a.duration }));
  }
}
