import fs from 'fs';
import path from 'path';
import FormData from 'form-data';
import { apiRequest } from './apiClient.js';
import config from '../config.js';

/**
 * Transcribes an audio file using Groq Whisper API.
 * Returns word-level timestamps.
 *
 * @param {string} audioPath - absolute path to audio file (mp3/wav/m4a, max 25MB)
 * @returns {Promise<{text: string, words: Array<{word: string, start: number, end: number}>, segments: Array}>}
 */
export async function transcribe(audioPath) {
  const form = new FormData();
  form.append('file', fs.createReadStream(audioPath));
  form.append('model', config.groq.model);
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'word');
  form.append('timestamp_granularities[]', 'segment');

  const response = await apiRequest(config.groq.endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.groq.apiKey}`,
      ...form.getHeaders(),
    },
    body: form,
    timeout: 120000, // 2 min for long audio
  });

  const data = await response.json();

  // Flatten all words from all segments into one array
  const words = [];
  if (data.words) {
    // Some Groq responses have top-level words array
    words.push(...data.words);
  } else if (data.segments) {
    for (const seg of data.segments) {
      if (seg.words) {
        words.push(...seg.words);
      }
    }
  }

  return {
    text: data.text,
    words: words.map(w => ({
      word: w.word.trim(),
      start: w.start,
      end: w.end,
    })),
    segments: data.segments || [],
  };
}
