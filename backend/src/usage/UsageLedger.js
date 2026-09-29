import fs from 'fs-extra';
import path from 'path';
export class UsageLedger {
  constructor(filePath) { this.filePath = filePath; this.queue = Promise.resolve(); }
  async read() { try { return await fs.readJson(this.filePath); } catch { return { schemaVersion: 1, serper: { used: 0, exhausted: false, unknown: 0 }, modal: { estimatedUsd: 0, requests: 0 } }; } }
  async reserveSerper(limit = 2500, amount = 1) { let allowed = false; await this._mutate(data => { const s = data.serper; if (!s.exhausted && s.used + s.unknown + amount <= limit) { s.unknown += amount; allowed = true; } }); return allowed; }
  async confirmSerper(amount = 1) { await this._mutate(data => { data.serper.unknown = Math.max(0, data.serper.unknown - amount); data.serper.used += amount; }); }
  async releaseSerper(amount = 1) { await this._mutate(data => { data.serper.unknown = Math.max(0, data.serper.unknown - amount); }); }
  async exhaustSerper() { await this._mutate(data => { data.serper.exhausted = true; }); }
  async _mutate(fn) { this.queue = this.queue.then(async () => { const data = await this.read(); fn(data); const tmp = `${this.filePath}.${process.pid}.tmp`; await fs.ensureDir(path.dirname(this.filePath)); await fs.writeJson(tmp, data, { spaces: 2 }); await fs.move(tmp, this.filePath, { overwrite: true }); }); return this.queue; }
}
