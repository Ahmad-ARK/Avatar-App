/**
 * Post-LLM enforcement of rhythm + visual-density rules.
 *
 * The LLM is *asked* (in the scene-planning prompt) to keep the video visual-heavy,
 * but LLMs don't reliably hit a ratio. This module is the deterministic backstop that
 * GUARANTEES the avatar-vs-visual balance the user selected, and honors the PIP toggle.
 */

/**
 * Maps the user-facing "visual density" preset to the minimum fraction of segments
 * that must be a visual layout (anything other than full_avatar).
 */
export const VISUAL_DENSITY_TARGETS = {
  talking_head: 0.40, // avatar-forward — more speaker presence
  balanced: 0.65, // the original design intent (~60-70% visuals), now actually enforced
  visual_heavy: 0.82, // b-roll dominant — avatar appears only occasionally
};

/**
 * Max length (seconds) a full-screen b-roll (visual_only) scene may run before it's
 * downgraded to split_screen so the viewer doesn't lose the speaker. Density-aware:
 * visual-heavy tolerates long pure b-roll; talking-head brings the speaker back sooner.
 */
export const VISUAL_ONLY_MAX_SECONDS = {
  talking_head: 8,
  balanced: 10,
  visual_heavy: 15,
};

const PIP_LAYOUTS = ['pip_bottom_right', 'pip_bottom_left'];

// Words too generic to make a useful stock-footage search query.
const STOPWORDS = new Set([
  'the', 'and', 'that', 'this', 'with', 'from', 'have', 'has', 'had', 'will', 'would',
  'your', 'you', 'they', 'them', 'their', 'there', 'here', 'what', 'when', 'where', 'which',
  'about', 'into', 'onto', 'over', 'under', 'then', 'than', 'been', 'were', 'was', 'are',
  'for', 'but', 'not', 'all', 'any', 'can', 'could', 'should', 'just', 'like', 'get', 'got',
  'because', 'while', 'these', 'those', 'some', 'more', 'most', 'very', 'much', 'many',
  'going', 'gonna', 'really', 'actually', 'thing', 'things', 'stuff', 'okay', 'right',
]);

/**
 * Derive a stock-footage search query from the words spoken during a segment.
 * Used when converting a full_avatar segment into a visual one — that segment had no
 * visual_query, and AssetFetcher only fetches assets for segments that have one.
 *
 * @param {Array<{word:string,start:number,end:number}>|null} words - transcript words (absolute times)
 * @param {number} start - segment start time (seconds)
 * @param {number} end - segment end time (seconds)
 * @param {string} fallback - query to use if nothing meaningful can be extracted
 * @returns {string}
 */
export function deriveVisualQuery(words, start, end, fallback = 'cinematic b-roll') {
  if (!Array.isArray(words) || words.length === 0) return fallback;

  const inRange = words.filter(w => w.end > start && w.start < end);
  const picked = [];

  for (const w of inRange) {
    const token = (w.word || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (token.length >= 4 && !STOPWORDS.has(token) && !picked.includes(token)) {
      picked.push(token);
    }
    if (picked.length >= 5) break;
  }

  return picked.length > 0 ? picked.join(' ') : fallback;
}

/** Turn a segment into a full-screen b-roll (visual_only) scene with a real query. */
function convertToVisual(seg, words, fallbackQuery) {
  seg.layout = 'visual_only';
  seg.visual_query = deriveVisualQuery(words, seg.start_time, seg.end_time, fallbackQuery);
  seg.visual_type = seg.visual_type || 'image';
  seg.motion = 'ken_burns';
}

export function enforceRhythmRules(segments, videoDuration, options = {}) {
  const {
    transcriptWords = null,
    targetVisualRatio = VISUAL_DENSITY_TARGETS.balanced,
    enablePip = false,
    fallbackQuery = 'cinematic b-roll',
    visualOnlyMaxSeconds = VISUAL_ONLY_MAX_SECONDS.balanced,
  } = options;

  if (!segments || segments.length === 0) {
    return [{
      id: 1,
      start_time: 0,
      end_time: videoDuration,
      layout: 'full_avatar',
      motion: 'slow_zoom_in',
      visual_query: null,
    }];
  }

  // Ensure first segment starts at 0
  if (segments[0].start_time > 0) {
    segments[0].start_time = 0;
  }

  // Rule 1: First segment must be full_avatar (builds viewer trust)
  if (segments[0].layout !== 'full_avatar') {
    segments[0].layout = 'full_avatar';
    segments[0].motion = segments[0].motion || 'slow_zoom_in';
    segments[0].visual_query = null;
  }

  // Rule 2: PIP toggle — when disabled, the small corner-avatar scenes become
  // full-screen b-roll. The visual_query is already present (PIP is a visual layout).
  if (!enablePip) {
    for (const seg of segments) {
      if (PIP_LAYOUTS.includes(seg.layout)) {
        seg.layout = 'visual_only';
        seg.visual_type = seg.visual_type || 'image';
        seg.motion = 'ken_burns';
        if (!seg.visual_query) {
          seg.visual_query = deriveVisualQuery(transcriptWords, seg.start_time, seg.end_time, fallbackQuery);
        }
      }
    }
  }

  // Rule 3: Visual-density enforcement — guarantee at least targetVisualRatio of segments
  // are visual by converting excess full_avatar scenes into b-roll. Never touches segment 0.
  const isVisual = (seg) => seg.layout !== 'full_avatar';
  const desiredVisualCount = Math.ceil(segments.length * targetVisualRatio);
  let currentVisualCount = segments.filter(isVisual).length;
  let need = desiredVisualCount - currentVisualCount;

  if (need > 0) {
    // Candidate avatar segments to convert (never the first one).
    const candidates = [];
    for (let i = 1; i < segments.length; i++) {
      if (segments[i].layout === 'full_avatar') candidates.push(i);
    }
    // Prefer converting avatars that sit next to another avatar first — this breaks up
    // talking-head clusters rather than removing isolated avatar "breathers".
    candidates.sort((a, b) => {
      const clusteredA = (segments[a - 1]?.layout === 'full_avatar' || segments[a + 1]?.layout === 'full_avatar') ? 0 : 1;
      const clusteredB = (segments[b - 1]?.layout === 'full_avatar' || segments[b + 1]?.layout === 'full_avatar') ? 0 : 1;
      return clusteredA - clusteredB || a - b;
    });

    for (const idx of candidates) {
      if (need <= 0) break;
      convertToVisual(segments[idx], transcriptWords, fallbackQuery);
      need--;
    }
  }

  // Rule 4: No more than 2 consecutive identical layouts.
  // Breaking an avatar run adds a visual (advances the goal); breaking a visual run just
  // alternates between visual sub-layouts so we never re-inflate the avatar count.
  for (let i = 2; i < segments.length; i++) {
    if (segments[i].layout === segments[i - 1].layout &&
        segments[i - 1].layout === segments[i - 2].layout) {
      if (segments[i].layout === 'full_avatar') {
        convertToVisual(segments[i], transcriptWords, fallbackQuery);
      } else {
        segments[i].layout = segments[i].layout === 'visual_only' ? 'split_screen' : 'visual_only';
      }
    }
  }

  // Rule 5: full_avatar must have motion
  for (const seg of segments) {
    if (seg.layout === 'full_avatar' && (!seg.motion || seg.motion === 'none')) {
      seg.motion = 'slow_zoom_in';
    }
  }

  // Rule 6: visual_only capped (viewer forgets the speaker). Downgrade the long ones to
  // split_screen — still a visual layout, so the density target is preserved. The cap is
  // density-aware, so visual-heavy keeps long pure b-roll instead of half-screen avatar.
  for (const seg of segments) {
    if (seg.layout === 'visual_only') {
      const duration = seg.end_time - seg.start_time;
      if (duration > visualOnlyMaxSeconds) {
        seg.layout = 'split_screen';
      }
    }
  }

  // Ensure continuous timeline
  for (let i = 1; i < segments.length; i++) {
    segments[i].start_time = segments[i - 1].end_time;
  }

  // Ensure the last segment goes all the way to videoDuration
  let validSegments = segments.filter(seg => (seg.end_time - seg.start_time) >= 1);
  if (validSegments.length === 0) validSegments = [segments[0]];

  const lastSeg = validSegments[validSegments.length - 1];
  if (lastSeg.end_time < videoDuration) {
    // If the gap is small, extend the last segment
    if (videoDuration - lastSeg.end_time < 3) {
      lastSeg.end_time = videoDuration;
    } else {
      // Add a filler segment as b-roll (keeps the density intent; AssetFetcher runs after
      // this and will fetch for it, and SegmentRenderer safely falls back if that fails).
      validSegments.push({
        id: lastSeg.id + 1,
        start_time: lastSeg.end_time,
        end_time: videoDuration,
        layout: 'visual_only',
        motion: 'ken_burns',
        visual_type: 'image',
        visual_query: deriveVisualQuery(transcriptWords, lastSeg.end_time, videoDuration, fallbackQuery),
      });
    }
  } else if (lastSeg.end_time > videoDuration) {
    lastSeg.end_time = videoDuration;
  }

  return validSegments;
}
