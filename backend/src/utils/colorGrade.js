/**
 * Subtle per-niche color grading. Mixed stock footage + AI images + an avatar clip tend to
 * look disjointed; a light, consistent grade makes them feel like one film. Kept deliberately
 * gentle — this is polish, not an Instagram filter.
 *
 * Returns an FFmpeg video-filter fragment (no leading/trailing comma), or '' to disable.
 */

const GRADES = {
  // niche keyword -> eq params. contrast ~1.0, saturation ~1.0 = neutral.
  news:        'eq=contrast=1.08:saturation=1.05:brightness=0.01',
  finance:     'eq=contrast=1.07:saturation=1.04:gamma=0.98',
  tech:        'eq=contrast=1.08:saturation=1.10:gamma=0.97',
  health:      'eq=contrast=1.04:saturation=1.10:brightness=0.02',
  education:   'eq=contrast=1.05:saturation=1.08',
  legal:       'eq=contrast=1.06:saturation=0.98:gamma=1.02',
  documentary: 'eq=contrast=1.10:saturation=0.94:gamma=1.03', // filmic, slightly desaturated
  lifestyle:   'eq=contrast=1.04:saturation=1.12:brightness=0.02',
};

const DEFAULT_GRADE = 'eq=contrast=1.05:saturation=1.06';

/**
 * @param {object} nicheConfig - the classifier output ({ niche, motion_style, ... })
 * @returns {string} an FFmpeg filter fragment, or '' when grading is off
 */
export function getColorGrade(nicheConfig = {}) {
  const niche = String(nicheConfig?.niche || '').toLowerCase();
  return GRADES[niche] || DEFAULT_GRADE;
}
