import fs from 'fs';
import path from 'path';
import { BasePipelineStage } from './BasePipelineStage.js';
import config from '../config.js';

export class CaptionEngine extends BasePipelineStage {
  constructor() {
    super('caption_generation');
  }

  async execute(context) {
    this.emitProgress(0, 'Generating styled captions...');

    const { transcript, nicheConfig, tempDir } = context;
    const assPath = path.join(tempDir, 'captions.ass');

    const assContent = this.buildASS(transcript.words, nicheConfig);
    fs.writeFileSync(assPath, assContent, 'utf-8');

    context.captionsPath = assPath;
    this.emitProgress(100, 'Captions generated');
    return context;
  }

  /**
   * Build ASS subtitle content from words and niche config.
   * Groups words into 3-4 word chunks for readability.
   */
  buildASS(words, nicheConfig) {
    const { width, height } = config.output;
    const fontName = nicheConfig.font_family || 'Inter';
    const fontSize = nicheConfig.caption_font_size || 52;

    // ASS color format: &HAABBGGRR (alpha, blue, green, red)
    const primaryColor = this.hexToASS(nicheConfig.caption_color || '#FFFFFF');
    const highlightColor = this.hexToASS(nicheConfig.caption_highlight_color || '#FFCC00');
    const outlineColor = '&H00000000'; // Black outline
    const bgColor = this.hexToASS(nicheConfig.caption_bg_color || '#00000080');

    let ass = `[Script Info]
Title: Avatar Pipeline Captions
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontName},${fontSize},${primaryColor},${highlightColor},${outlineColor},${bgColor},-1,0,0,0,100,100,0,0,3,4,0,2,40,40,60,1
Style: Highlight,${fontName},${fontSize},${highlightColor},${primaryColor},${outlineColor},${bgColor},-1,0,0,0,100,100,0,0,3,4,0,2,40,40,60,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

    // Group words into chunks of 3-4 for readability
    const chunkSize = 3;
    for (let i = 0; i < words.length; i += chunkSize) {
      const chunk = words.slice(i, i + chunkSize);
      const start = chunk[0].start;
      const end = chunk[chunk.length - 1].end;
      const text = chunk.map(w => w.word).join(' ');

      ass += `Dialogue: 0,${this.formatTime(start)},${this.formatTime(end)},Default,,0,0,0,,${text}\n`;
    }

    return ass;
  }

  /**
   * Convert seconds to ASS time format: H:MM:SS.CC
   */
  formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const cs = Math.round((seconds % 1) * 100);
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
  }

  /**
   * Convert hex color (#RRGGBB or #RRGGBBAA) to ASS format (&HAABBGGRR)
   */
  hexToASS(hex) {
    hex = hex.replace('#', '');
    let r, g, b, a = '00';
    if (hex.length === 8) {
      r = hex.substring(0, 2);
      g = hex.substring(2, 4);
      b = hex.substring(4, 6);
      a = hex.substring(6, 8);
    } else {
      r = hex.substring(0, 2);
      g = hex.substring(2, 4);
      b = hex.substring(4, 6);
    }
    return `&H${a}${b}${g}${r}`;
  }
}
