import { BasePipelineStage } from './BasePipelineStage.js';
import { transcribe } from '../services/groqService.js';
import { transcribeLocal } from '../services/localWhisperService.js';

export class Transcriber extends BasePipelineStage {
  constructor() {
    super('transcription');
  }

  async execute(context) {
    const provider = context.settings?.transcription?.provider || 'auto';
    this.emitProgress(0, provider === 'local' ? 'Transcribing locally...' : 'Transcribing with Groq Whisper...');
    let result;
    if (provider === 'local') result = await transcribeLocal(context.audioPath, { model: context.settings.transcription.model });
    else if (provider === 'groq') result = await transcribe(context.audioPath, { model: context.settings.transcription.model });
    else {
      try { result = await transcribe(context.audioPath, { model: context.settings.transcription.model }); }
      catch (error) { this.emitProgress(10, `Groq unavailable (${error.message}); using local Whisper...`); result = await transcribeLocal(context.audioPath, { model: context.settings.transcription.model }); }
    }

    context.transcript = {
      fullText: result.text,
      words: result.words,       // [{word, start, end}, ...]
      segments: result.segments, // [{id, start, end, text, words}, ...]
      provider: result.provider || provider,
    };

    this.emitProgress(100, `Transcribed ${result.words.length} words`);
    return context;
  }
}
