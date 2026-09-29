import path from 'path'; import crypto from 'crypto'; import fs from 'fs-extra';
export class SearchCache {
  constructor(root) { this.root=root; }
  key(provider,query,type,count) { return crypto.createHash('sha256').update(JSON.stringify([provider,query.trim().toLowerCase().replace(/\s+/g,' '),type,count])).digest('hex'); }
  async get(provider,query,type,count,ttlMs) { const file=path.join(this.root,`${this.key(provider,query,type,count)}.json`); try { const data=await fs.readJson(file); if(Date.now()-data.createdAt<=ttlMs)return data.results; } catch {} return null; }
  async put(provider,query,type,count,results) { await fs.ensureDir(this.root); const file=path.join(this.root,`${this.key(provider,query,type,count)}.json`); await fs.writeJson(file,{createdAt:Date.now(),provider,query,type,results},{spaces:0}); }
}
