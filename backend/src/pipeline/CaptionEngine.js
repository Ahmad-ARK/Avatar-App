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
   * Build ASS subtitles with per-word "karaoke" highlighting: a short phrase stays on
   * screen while the word currently being spoken is recolored + bolded. This reads as the
   * modern short-form caption style and uses the word-level timestamps we already have.
   */
  buildASS(words, nicheConfig = {}) {
    const { width, height } = config.output;
    const fontName = nicheConfig.font_family || 'Arial';
    // Scale font to the frame so it looks right at any resolution.
    const fontSize = nicheConfig.caption_font_size || Math.round(height * 0.055);

    const primaryHex = nicheConfig.caption_color || '#FFFFFF';
    const highlightHex = nicheConfig.caption_highlight_color || '#FFD400';
    const primaryColor = this.hexToASS(primaryHex);
    const highlightColor = this.hexToASS(highlightHex);
    const highlightInline = this.assInlineColor(highlightHex); // for the \c override on the active word
    const outlineColor = '&H00101010'; // near-black outline for legibility on any footage
    const marginV = Math.round(height * 0.12);

    let ass = `[Script Info]
Title: Avatar Pipeline Captions
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontName},${fontSize},${primaryColor},${highlightColor},${outlineColor},&H66000000,-1,0,0,0,100,100,0,0,1,${Math.round(fontSize*0.12)},2,2,${Math.round(width*0.06)},${Math.round(width*0.06)},${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

    const phrases = this.groupIntoPhrases(words);
    for (const phrase of phrases) {
      // One Dialogue event per word so the active word can be highlighted, made contiguous
      // (each ends exactly when the next begins) so the line never flickers.
      for (let i = 0; i < phrase.length; i++) {
        const start = phrase[i].start;
        const end = (i < phrase.length - 1) ? phrase[i + 1].start : phrase[i].end;
        if (end <= start) continue;
        const text = phrase.map((w, idx) => {
          const clean = this.escapeAss(w.word);
          return idx === i
            ? `{\\c${highlightInline}\\b1}${clean}{\\r}`
            : clean;
        }).join(' ');
        ass += `Dialogue: 0,${this.formatTime(start)},${this.formatTime(end)},Default,,0,0,0,,${text}\n`;
      }
    }

    return ass;
  }

  /**
   * Group words into readable on-screen phrases. Breaks on: max word count, max on-screen
   * duration, a noticeable pause between words, or sentence-ending punctuation.
   */
  groupIntoPhrases(words, { maxWords = 4, maxDuration = 2.6, gap = 0.6 } = {}) {
    const phrases = [];
    let cur = [];
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      cur.push(w);
      const spanned = w.end - cur[0].start;
      const nextGap = i + 1 < words.length ? words[i + 1].start - w.end : Infinity;
      const endsSentence = /[.!?]$/.test(w.word);
      if (cur.length >= maxWords || spanned >= maxDuration || nextGap >= gap || endsSentence) {
        phrases.push(cur);
        cur = [];
      }
    }
    if (cur.length) phrases.push(cur);
    return phrases;
  }

  /** Escape text for the ASS event field (braces start override blocks; backslash is special). */
  escapeAss(text) {
    return String(text == null ? '' : text)
      .replace(/\\/g, '')       // drop stray backslashes (would be read as override escapes)
      .replace(/[{}]/g, '')     // drop braces (would open/close an override block)
      .replace(/\r?\n/g, ' ');  // no literal newlines inside an event
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
   * Inline override color for \c — ASS wants &HBBGGRR& (6 hex, BGR, trailing &), which is
   * different from the 8-hex style-field format produced by hexToASS.
   */
  assInlineColor(hex) {
    let h = String(hex || '').replace('#', '');
    if (!/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(h)) h = 'FFFFFF';
    const r = h.substring(0, 2), g = h.substring(2, 4), b = h.substring(4, 6);
    return `&H${b}${g}${r}&`.toUpperCase();
  }

  /**
   * Convert hex color (#RRGGBB or #RRGGBBAA) to ASS format (&HAABBGGRR)
   */
  hexToASS(hex) {
    hex = String(hex || '').replace('#', '');
    if (!/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(hex)) hex = 'FFFFFF';
    let r, g, b, a = '00';
    r = hex.substring(0, 2);
    g = hex.substring(2, 4);
    b = hex.substring(4, 6);
    if (hex.length === 8) a = hex.substring(6, 8);
    return `&H${a}${b}${g}${r}`.toUpperCase();
  }
}
