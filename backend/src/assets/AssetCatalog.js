import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';
import { probeMedia } from '../utils/ffmpegHelpers.js';

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);

export class AssetCatalog {
  constructor({ catalogPath, assetsRoot }) { this.catalogPath = catalogPath; this.assetsRoot = assetsRoot; this.queue = Promise.resolve(); }
  async init() { await fs.ensureDir(this.assetsRoot); if (!(await fs.pathExists(this.catalogPath))) await this._write({ schemaVersion: 1, assets: [] }); }
  async _read() { await this.init(); try { const data = await fs.readJson(this.catalogPath); return data?.schemaVersion === 1 && Array.isArray(data.assets) ? data : { schemaVersion: 1, assets: [] }; } catch { return { schemaVersion: 1, assets: [] }; } }
  async _write(data) { await fs.ensureDir(path.dirname(this.catalogPath)); const tmp = `${this.catalogPath}.${process.pid}.tmp`; await fs.writeJson(tmp, data, { spaces: 2 }); await fs.move(tmp, this.catalogPath, { overwrite: true }); }
  async list(filters = {}) { const data = await this._read(); return data.assets.filter(a => (!filters.scope || a.scope === filters.scope) && (!filters.collectionId || a.collectionId === filters.collectionId) && (!filters.projectId || a.projectId === filters.projectId)); }
  async get(id) { return (await this.list()).find(a => a.id === id) || null; }
  async importFile(filePath, { originalName = path.basename(filePath), scope = 'project', projectId = 'draft', collectionId = null, description = '', source = 'user_upload', originalPageUrl = null, publisher = null, attribution = null, license = null } = {}) {
    const hash = await sha256(filePath); const existing = (await this.list()).find(a => a.contentHash === hash && a.scope === scope);
    if (existing) return existing;
    const ext = path.extname(originalName).toLowerCase(); const kind = IMAGE_EXT.has(ext) ? 'image' : 'video';
    let metadata = { duration: null, width: null, height: null, fps: null, hasAudio: false };
    try { metadata = await probeMedia(filePath); } catch (error) { if (kind === 'video') throw new Error(`Unsupported or corrupt media: ${originalName}`); }
    const id = crypto.randomUUID(); const dir = path.join(this.assetsRoot, scope === 'library' ? 'library' : 'projects', scope === 'library' ? (collectionId || 'default') : (projectId || 'draft'));
    await fs.ensureDir(dir); const managedPath = path.join(dir, `${id}${ext || (kind === 'image' ? '.jpg' : '.mp4')}`); await fs.copy(filePath, managedPath, { overwrite: false });
    const words = `${description} ${path.basename(originalName, ext)}`.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(v => v.length > 2);
    const record = { id, contentHash: hash, schemaVersion: 1, analyzerVersion: 'metadata-1', scope, projectId: scope === 'project' ? projectId : null, collectionId: scope === 'library' ? (collectionId || 'default') : null, enabled: true, originalName, managedPath, kind, ...metadata, source, originalPageUrl, publisher, attribution, license, acquiredAt: new Date().toISOString(), userDescription: description, userTags: [], machineDescription: '', machineTags: [...new Set(words)], analysisState: 'limited', suggestedRanges: [], generated: false, realPersonRelevant: false, eventRelevant: false, usageCount: 0, instructions: { prefer: false, required: false, excluded: false, trimStart: null, trimEnd: null, audioMode: 'mute' } };
    await this._mutate(data => { data.assets.push(record); }); return record;
  }
  async update(id, patch) { let updated; await this._mutate(data => { const item = data.assets.find(a => a.id === id); if (!item) throw new Error('Asset not found'); const safe = {}; for (const key of ['enabled','userDescription','userTags','instructions','collectionId']) if (Object.hasOwn(patch, key)) safe[key] = patch[key]; Object.assign(item, safe); updated = { ...item }; }); return updated; }
  async analyze(id) { let updated; await this._mutate(data => { const a = data.assets.find(v => v.id === id); if (!a) throw new Error('Asset not found'); const ext = path.extname(a.originalName); a.machineTags = [...new Set(`${a.userDescription} ${path.basename(a.originalName, ext)}`.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(v => v.length > 2))]; a.analysisState = 'limited'; a.analyzerVersion = 'metadata-1'; updated = { ...a }; }); return updated; }
  async applyAnalysis(id, analysis) { let updated; await this._mutate(data=>{ const a=data.assets.find(v=>v.id===id); if(!a)throw new Error('Asset not found'); a.machineDescription=analysis.description||''; a.machineTags=[...new Set([...(a.machineTags||[]),...(analysis.tags||[])])]; a.analysisState=analysis.state||'limited'; a.analysisEvidence=analysis.evidence||null; a.analyzerVersion=analysis.state==='ready'?'modal-vision-1':'metadata-1'; updated={...a}; }); return updated; }
  async search(query, { kinds = ['image','video'], scopes = ['project','library'], excludedIds = [], selectedIds = [], collectionIds = [] } = {}, count = 8) {
    const terms = query.toLowerCase().split(/\W+/).filter(v => v.length > 2); const all = await this.list();
    return all.filter(a => a.enabled && !a.instructions?.excluded && kinds.includes(a.kind) && scopes.includes(a.scope) && !excludedIds.includes(a.id) && (!selectedIds.length || selectedIds.includes(a.id) || a.scope === 'library') && (!collectionIds.length || a.scope !== 'library' || collectionIds.includes(a.collectionId)))
      .map(a => { const hay = `${a.userDescription} ${(a.userTags||[]).join(' ')} ${a.machineDescription} ${(a.machineTags||[]).join(' ')}`.toLowerCase(); const score = terms.reduce((n,t) => n + (hay.includes(t) ? 2 : 0), 0) + (a.instructions?.required ? 100 : a.instructions?.prefer ? 10 : 0); return { ...a, score }; }).filter(a => a.score > 0 || a.instructions?.required).sort((a,b) => b.score-a.score).slice(0,count);
  }
  async _mutate(fn) { this.queue = this.queue.then(async () => { const data = await this._read(); await fn(data); await this._write(data); }); return this.queue; }
}

function sha256(file) { return new Promise((resolve, reject) => { const hash = crypto.createHash('sha256'); const stream = fs.createReadStream(file); stream.on('data', d => hash.update(d)); stream.on('end', () => resolve(hash.digest('hex'))); stream.on('error', reject); }); }

