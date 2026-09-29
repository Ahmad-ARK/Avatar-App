const secToFrame = (seconds, fps) => Math.round(seconds * fps);

export function buildAvatarSchedule({ durationSeconds, fps, avatar, topicBoundaries = [] }) {
  const totalFrames = Math.max(0, secToFrame(durationSeconds, fps));
  if (avatar.mode === 'off' || avatar.appearanceCount === 0) return { fps, totalFrames, intervals: [], requestedSeconds: 0, renderedSeconds: 0 };
  if (avatar.mode !== 'exact') return { fps, totalFrames, intervals: null, requestedSeconds: null, renderedSeconds: null };
  const count = avatar.appearanceCount;
  const length = Math.max(1, secToFrame(avatar.secondsPerAppearance, fps));
  const gap = Math.max(1, secToFrame(avatar.minimumGapSeconds, fps));
  if (count * length + Math.max(0, count - 1) * gap > totalFrames) throw new Error('Exact avatar schedule does not fit inside the video.');

  let starts;
  if (avatar.placement === 'manual') {
    if (avatar.manualStartSeconds.length !== count) throw new Error(`Manual placement requires exactly ${count} start time(s).`);
    starts = avatar.manualStartSeconds.map(v => secToFrame(v, fps));
  }
  else {
    const free = totalFrames - count * length;
    starts = count === 1 ? [Math.floor(free / 2)] : Array.from({ length: count }, (_, i) => Math.round((i * free) / (count - 1)));
    if (avatar.placement === 'topic_aware' && topicBoundaries.length) starts = snapToBoundaries(starts, topicBoundaries.map(v => secToFrame(v, fps)), length, gap, totalFrames);
  }
  const intervals = starts.map((startFrame, i) => ({ id: i + 1, startFrame, endFrame: startFrame + length, startSeconds: startFrame / fps, endSeconds: (startFrame + length) / fps, layout: avatar.layout }));
  validateIntervals(intervals, totalFrames, gap);
  return { fps, totalFrames, intervals, requestedSeconds: count * avatar.secondsPerAppearance, renderedSeconds: count * length / fps };
}

function snapToBoundaries(targets, boundaries, length, gap, total) {
  const used = [];
  for (const target of targets) {
    const ordered = [...boundaries].filter(v => v >= 0 && v + length <= total).sort((a, b) => Math.abs(a - target) - Math.abs(b - target));
    const fits = v => used.every(u => v >= u + length + gap || u >= v + length + gap);
    let chosen = ordered.find(fits);
    if (chosen == null) {
      const candidates = Array.from({ length: Math.max(1, total - length + 1) }, (_, i) => i).sort((a,b) => Math.abs(a-target)-Math.abs(b-target));
      chosen = candidates.find(fits);
    }
    if (chosen == null) throw new Error('Could not place topic-aware avatar intervals.');
    used.push(chosen);
  }
  return used.sort((a, b) => a - b);
}

export function validateIntervals(intervals, totalFrames, minimumGapFrames = 1) {
  let previousEnd = null;
  for (const interval of intervals) {
    if (!Number.isInteger(interval.startFrame) || !Number.isInteger(interval.endFrame) || interval.startFrame < 0 || interval.endFrame > totalFrames || interval.endFrame <= interval.startFrame) throw new Error('Invalid avatar interval.');
    if (previousEnd !== null && interval.startFrame - previousEnd < minimumGapFrames) throw new Error('Avatar appearances overlap or do not have the required invisible gap.');
    previousEnd = interval.endFrame;
  }
}

export function applyAvatarSchedule(segments, schedule, fps, durationSeconds) {
  if (schedule.intervals === null) return segments;
  const cuts = new Set([0, schedule.totalFrames]);
  for (const segment of segments) { cuts.add(Math.max(0, secToFrame(segment.start_time, fps))); cuts.add(Math.min(schedule.totalFrames, secToFrame(segment.end_time, fps))); }
  for (const interval of schedule.intervals) { cuts.add(interval.startFrame); cuts.add(interval.endFrame); }
  const points = [...cuts].filter(v => v >= 0 && v <= schedule.totalFrames).sort((a, b) => a - b);
  const result = [];
  for (let i = 0; i < points.length - 1; i++) {
    const startFrame = points[i], endFrame = points[i + 1];
    if (endFrame <= startFrame) continue;
    const source = segments.find(s => secToFrame(s.start_time, fps) < endFrame && secToFrame(s.end_time, fps) > startFrame) || {};
    const interval = schedule.intervals.find(v => v.startFrame <= startFrame && v.endFrame >= endFrame);
    const seg = { ...source, startFrame, endFrame, start_time: startFrame / fps, end_time: Math.min(durationSeconds, endFrame / fps) };
    if (interval) { seg.layout = interval.layout; seg.avatarAppearanceId = interval.id; if (interval.layout === 'full_avatar') { seg.visual_query = null; seg.assetPath = null; } }
    else { seg.layout = 'visual_only'; seg.avatarAppearanceId = null; if (!seg.visual_query) seg.visual_query = wordsForRange(source) || 'cinematic relevant background'; }
    result.push(seg);
  }
  return result.map((s, i) => ({ ...s, id: i + 1 }));
}

function wordsForRange(segment) { return typeof segment.visual_query === 'string' ? segment.visual_query : ''; }

