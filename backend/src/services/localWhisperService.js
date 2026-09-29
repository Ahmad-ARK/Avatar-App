import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import config from '../config.js';
const worker = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../workers/local_transcribe.py');
export function transcribeLocal(audioPath, { model = config.tools.localWhisperModel, signal } = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(config.tools.pythonPath, [worker, '--input', audioPath, '--model', model], { shell: false, windowsHide: true }); let out='', err='';
    const abort = () => { proc.kill(); reject(new Error('Local transcription cancelled')); }; if (signal) signal.addEventListener('abort', abort, { once: true });
    proc.stdout.on('data', d => out += d); proc.stderr.on('data', d => err += d);
    proc.on('error', e => reject(new Error(`Local Whisper is not installed or configured: ${e.message}`)));
    proc.on('close', code => { if (signal) signal.removeEventListener('abort', abort); if (code !== 0) return reject(new Error(`Local Whisper failed. Run the setup instructions. ${err.slice(-300)}`)); try { resolve(JSON.parse(out)); } catch { reject(new Error('Local Whisper returned invalid JSON')); } });
  });
}

