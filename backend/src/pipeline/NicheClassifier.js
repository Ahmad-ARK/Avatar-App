import { BasePipelineStage } from './BasePipelineStage.js';
import { chatCompletion } from '../services/llmService.js';
import { NICHE_CLASSIFICATION_PROMPT } from '../presets/nichePresets.js';

export class NicheClassifier extends BasePipelineStage {
  constructor() {
    super('niche_classification');
  }

  async execute(context) {
    this.emitProgress(0, 'AI is classifying content type...');

    const result = await chatCompletion(
      NICHE_CLASSIFICATION_PROMPT.system,
      NICHE_CLASSIFICATION_PROMPT.user(context.transcript.fullText)
    );

    // Result: { niche, sub_niche, font_family, font_weight, caption_font_size,
    //           caption_color, caption_highlight_color, caption_bg_color,
    //           color_palette, motion_style, layout_preferences, reasoning }
    context.nicheConfig = result;

    this.emitProgress(100, `Classified as: ${result.niche} → ${result.sub_niche}`);
    return context;
  }
}
