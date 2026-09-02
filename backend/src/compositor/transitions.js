/**
 * Scene transitions (cross-dissolves) via xfade/acrossfade.
 *
 * A crossfade OVERLAPS consecutive scenes, so the timeline gets shorter by one transition
 * duration per cut. That shift has to be pushed back into the caption timings (retimeWords)
 * or the karaoke captions drift out of sync with the (also-crossfaded) voice.
 *
 * All of this is best-effort: the compositor falls back to plain hard cuts if anything here
 * can't be applied safely.
 */

/**
 * Is it safe to crossfade these segments with duration D? Every clip must be comfortably
 * longer than the overlap (both the tail of one and the head of the next need room).
 */
export function canTransition(durations, D) {
  if (!Array.isArray(durations) || durations.length < 2 || !(D > 0)) return false;
  return durations.every(d => d > D * 1.5);
}

/**
 * Build the video xfade chain over inputs [0:v]..[n-1:v].
 * @returns {{ filter: string, outLabel: string }} filter is ';'-joined; '' when n<2.
 */
export function buildXfadeChain(n, durations, D, type = 'fade') {
  if (n < 2) return { filter: '', outLabel: '[0:v]' };
  const parts = [];
  let prev = '[0:v]';
  let acc = durations[0]; // accumulated output duration of `prev`
  for (let i = 1; i < n; i++) {
    const out = i === n - 1 ? '[vxout]' : `[vx${i}]`;
    const offset = Math.max(0, acc - D).toFixed(3); // transition starts D before prev ends
    parts.push(`${prev}[${i}:v]xfade=transition=${type}:duration=${D}:offset=${offset}${out}`);
    acc = acc + durations[i] - D;
    prev = out;
  }
  return { filter: parts.join(';'), outLabel: prev };
}

/**
 * Build the audio acrossfade chain over inputs [0:a]..[n-1:a]. acrossfade auto-overlaps the
 * tail of one stream with the head of the next, matching the video xfade shortening.
 * @returns {{ filter: string, outLabel: string }}
 */
export function buildAcrossfadeChain(n, D) {
  if (n < 2) return { filter: '', outLabel: '[0:a]' };
  const parts = [];
  let prev = '[0:a]';
  for (let i = 1; i < n; i++) {
    const out = i === n - 1 ? '[axout]' : `[ax${i}]`;
    parts.push(`${prev}[${i}:a]acrossfade=d=${D}${out}`);
    prev = out;
  }
  return { filter: parts.join(';'), outLabel: prev };
}

/** Index of the segment that contains time t (by end_time), clamped to the last segment. */
function segmentIndexForTime(segments, t) {
  for (let k = 0; k < segments.length; k++) {
    if (t < segments[k].end_time) return k;
  }
  return segments.length - 1;
}

/**
 * Shift caption word times to the crossfaded (shorter) timeline. A word in segment k moves
 * earlier by k*D, because k transitions before it have each removed D of runtime.
 */
export function retimeWords(words, segments, D) {
  if (!D || D <= 0 || segments.length < 2) return words;
  let prevStart = 0;
  return words.map(w => {
    const k = segmentIndexForTime(segments, w.start);
    const shift = k * D;
    // A phrase straddling a scene boundary would otherwise shift its words by different
    // amounts and could move the active-word highlight backwards; clamp to non-decreasing.
    const start = Math.max(0, prevStart, w.start - shift);
    const end = Math.max(start + 0.05, w.end - shift);
    prevStart = start;
    return { ...w, start, end };
  });
}
