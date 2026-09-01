import { BasePipelineStage } from './BasePipelineStage.js';
import { transcribe } from '../services/groqService.js';

export class Transcriber extends BasePipelineStage {
  constructor() {
    super('transcription');
  }

  async execute(context) {
    this.emitProgress(0, 'Sending audio to Groq Whisper...');

    const result = await transcribe(context.audioPath);

    context.transcript = {
      fullText: result.text,
      words: result.words,       // [{word, start, end}, ...]
      segments: result.segments, // [{id, start, end, text, words}, ...]
    };

    this.emitProgress(100, `Transcribed ${result.words.length} words`);
    return context;
  }
}
