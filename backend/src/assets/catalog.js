import config from '../config.js';
import { AssetCatalog } from './AssetCatalog.js';
export const assetCatalog = new AssetCatalog({ catalogPath: config.paths.assetCatalog, assetsRoot: config.paths.assets });

