/**
 * Abstract base class for asset sources.
 * All sources must implement the search() method.
 * Follows Liskov Substitution — any source can replace any other.
 */
export class BaseAssetSource {
  constructor(name) {
    this.name = name;
    if (new.target === BaseAssetSource) {
      throw new Error('BaseAssetSource is abstract — cannot instantiate directly');
    }
  }

  /**
   * Search for assets matching a query.
   * @param {string} query - search query
   * @param {'image'|'video'} type - asset type
   * @param {number} count - max results
   * @returns {Promise<Array<{
   *   id: string,
   *   url: string,
   *   thumbUrl: string,
   *   width: number,
   *   height: number,
   *   type: 'image'|'video',
   *   source: string,
   *   attribution: string
   * }>>}
   */
  async search(query, type = 'image', count = 5) {
    throw new Error('search() must be implemented by subclass');
  }
}
