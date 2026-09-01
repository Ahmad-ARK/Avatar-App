import { BasePipelineStage } from './BasePipelineStage.js';
import { chatCompletion } from '../services/llmService.js';
import { enforceRhythmRules, VISUAL_DENSITY_TARGETS, VISUAL_ONLY_MAX_SECONDS } from '../utils/rhythmRules.js';
import { SCENE_PLANNING_PROMPT } from '../presets/nichePresets.js';
import config from '../config.js';

export class ScenePlanner extends BasePipelineStage {
  constructor() {
    super('scene_planning');
  }

  /**
   * Split transcript words into chunks at natural sentence boundaries.
   * Target ~60s per chunk, but always break at the nearest sentence end
   * (period, question mark, exclamation) so the AI never gets a half-sentence.
   */
  buildChunks(words, targetChunkDuration = 60) {
    if (words.length === 0) return [];

    const chunks = [];
    let chunkStartIdx = 0;
    const totalDuration = words[words.length - 1].end;

    while (chunkStartIdx < words.length) {
      const chunkStartTime = words[chunkStartIdx].start;
      const targetEndTime = chunkStartTime + targetChunkDuration;

      // Find the ideal split point: nearest sentence-ending word AFTER targetEndTime
      let splitIdx = words.length - 1; // default: rest of transcript

      for (let i = chunkStartIdx; i < words.length; i++) {
        // Past the target time? Look for the next sentence boundary
        if (words[i].end >= targetEndTime) {
          // Search forward (up to 15 words) for a sentence-ending word
          for (let j = i; j < Math.min(i + 15, words.length); j++) {
            const w = words[j].word;
            if (w.endsWith('.') || w.endsWith('?') || w.endsWith('!') || w.endsWith(',')) {
              splitIdx = j;
              break;
            }
            // If we can't find punctuation, just split here
            if (j === Math.min(i + 14, words.length - 1)) {
              splitIdx = j;
            }
          }
          break;
        }
      }

      const chunkWords = words.slice(chunkStartIdx, splitIdx + 1);
      if (chunkWords.length > 0) {
        chunks.push({
          words: chunkWords,
          startTime: chunkWords[0].start,
          endTime: chunkWords[chunkWords.length - 1].end,
        });
      }

      chunkStartIdx = splitIdx + 1;
    }

    return chunks;
  }

  async execute(context) {
    this.emitProgress(0, 'AI is planning video scenes...');

    const { transcript, nicheConfig, videoDuration } = context;

    // Resolve the user's avatar-vs-visual preference (Settings → Video Style).
    const visualDensity = config.planning.visualDensity;
    const enablePip = config.planning.enableAvatarPip;
    const targetVisualRatio = VISUAL_DENSITY_TARGETS[visualDensity] ?? VISUAL_DENSITY_TARGETS.balanced;
    const fallbackQuery = `${nicheConfig?.niche || 'cinematic'} ${nicheConfig?.sub_niche || 'b-roll'}`
      .replace(/_/g, ' ')
      .trim();
    console.log(`[ScenePlanner] Visual density=${visualDensity} (target ${Math.round(targetVisualRatio * 100)}% visual), PIP=${enablePip}`);

    // Build smart chunks at sentence boundaries (~60s each)
    const chunks = this.buildChunks(transcript.words, 60);
    console.log(`[ScenePlanner] Split transcript into ${chunks.length} chunks`);

    // Process chunks concurrently in batches of 4
    const CONCURRENCY = 4;
    const chunkResults = new Array(chunks.length).fill(null);

    for (let batchStart = 0; batchStart < chunks.length; batchStart += CONCURRENCY) {
      const batchEnd = Math.min(batchStart + CONCURRENCY, chunks.length);
      const batch = chunks.slice(batchStart, batchEnd);

      this.emitProgress(
        Math.round((batchStart / chunks.length) * 90),
        `Planning scenes (batch ${Math.floor(batchStart / CONCURRENCY) + 1}/${Math.ceil(chunks.length / CONCURRENCY)})...`
      );

      const promises = batch.map((chunk, batchIdx) => {
        const globalIdx = batchStart + batchIdx;
        const chunkDuration = chunk.endTime - chunk.startTime;

        const chunkTranscript = {
          words: chunk.words,
          fullText: chunk.words.map(w => w.word).join(' ')
        };

        return chatCompletion(
          SCENE_PLANNING_PROMPT.system,
          SCENE_PLANNING_PROMPT.user(chunkTranscript, nicheConfig, chunkDuration, chunk.startTime, { targetVisualRatio, enablePip }),
          { maxTokens: 16384 }
        )
        .then(result => {
          if (result && result.segments && Array.isArray(result.segments) && result.segments.length > 0) {
            // Normalize durations to exactly match chunkDuration
            let sumDuration = 0;
            for (const seg of result.segments) {
              seg.duration = Math.max(0.1, (seg.end_time || 0) - (seg.start_time || 0));
              sumDuration += seg.duration;
            }
            
            let currentTime = chunk.startTime;
            for (let i = 0; i < result.segments.length; i++) {
              const seg = result.segments[i];
              const normalizedDuration = (seg.duration / sumDuration) * chunkDuration;
              seg.start_time = currentTime;
              seg.end_time = currentTime + normalizedDuration;
              currentTime = seg.end_time;
            }
            // Fix floating point errors on the last segment
            result.segments[result.segments.length - 1].end_time = chunk.endTime;

            chunkResults[globalIdx] = result.segments;
            console.log(`[ScenePlanner] Chunk ${globalIdx + 1}: ${result.segments.length} segments OK`);
          } else {
            throw new Error('No segments returned');
          }
        })
        .catch(error => {
          console.warn(`[ScenePlanner] Chunk ${globalIdx + 1} failed: ${error.message}. Filling with full_avatar.`);
          chunkResults[globalIdx] = [{
            start_time: chunk.startTime,
            end_time: chunk.endTime,
            layout: 'full_avatar',
            motion: 'slow_zoom_in',
            visual_query: null,
            visual_type: null,
          }];
        });
      });

      await Promise.all(promises);
    }

    // Flatten results in order and assign sequential IDs
    let allSegments = [];
    let lastSegmentId = 0;
    for (const segments of chunkResults) {
      if (segments) {
        for (const seg of segments) {
          lastSegmentId++;
          seg.id = lastSegmentId;
        }
        allSegments.push(...segments);
      }
    }

    // Enforce rhythm + visual-density rules (deterministic backstop for the LLM plan)
    const enforcedSegments = enforceRhythmRules(allSegments, videoDuration, {
      transcriptWords: transcript.words,
      targetVisualRatio,
      enablePip,
      fallbackQuery,
      visualOnlyMaxSeconds: VISUAL_ONLY_MAX_SECONDS[visualDensity] ?? VISUAL_ONLY_MAX_SECONDS.balanced,
    });

    context.scenePlan = {
      segments: enforcedSegments,
      totalSegments: enforcedSegments.length,
    };

    this.emitProgress(100, `Planned ${enforcedSegments.length} segments`);
    return context;
  }
}
