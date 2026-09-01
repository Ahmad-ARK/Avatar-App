/**
 * FFmpeg safety helpers — the single place where user/LLM-derived strings are made
 * safe to drop into a filtergraph. Hand-rolled escaping scattered across the compositor
 * is exactly what caused the drawtext apostrophe crash; everything funnels through here now.
 */

import fs from 'fs';
import path from 'path';

/**
 * Escape arbitrary text for use inside a drawtext `text='...'` value.
 *
 * Two parsing layers are involved:
 *  1. drawtext itself expands `%{...}` and treats `\` as an escape.
 *  2. the filtergraph parser strips one layer of single-quotes; a literal `'` inside a
 *     single-quoted region can only be written by closing the quote, adding \', reopening.
 *
 * We escape for layer 1 first (backslash, percent), then for layer 2 (the quote), and
 * normalize newlines so a stray line break can't truncate the filter string.
 */
export function escapeDrawtextText(input) {
  const text = String(input == null ? '' : input)
    .replace(/\r\n?|\n/g, ' ') // collapse newlines — they break the single-line filter string
    .replace(/\\/g, '\\\\') // drawtext: backslash is an escape char
    .replace(/%/g, '\\%'); // drawtext: prevent %{...} expansion
  // filtergraph: a ' inside '...' must be written as '\''
  return text.replace(/'/g, "'\\''");
}

/**
 * Quote a filesystem path for a filter option that takes a path (fontfile=, ass=, etc.).
 * Windows backslashes become forward slashes, the drive colon is escaped, and the whole
 * thing is wrapped in single quotes — the form empirically accepted by both fontfile and ass.
 */
export function quoteFilterPath(p) {
  const norm = String(p == null ? '' : p)
    .replace(/\\/g, '/') // backslashes → forward slashes
    .replace(/:/g, '\\:'); // escape the drive colon (C: → C\:)
  return `'${norm}'`;
}

const NAMED_COLORS = new Set([
  'white', 'black', 'red', 'green', 'blue', 'yellow', 'cyan', 'magenta',
  'gray', 'grey', 'orange', 'transparent',
]);

/**
 * Validate an LLM/user-supplied color and return an FFmpeg-safe color token, or the
 * fallback if it can't be trusted. Accepts `#RRGGBB`, `RRGGBB`, or a known color name.
 * An optional alpha (0..1) is appended as `@a`. A malformed color here previously
 * cascaded into a filter-parse failure on an unrelated option.
 *
 * @returns {string} e.g. "0A2540@0.8" or "white"
 */
export function sanitizeHexColor(input, fallback = 'black', alpha = null) {
  const raw = String(input == null ? '' : input).trim();
  const hex = raw.replace(/^#/, '');
  let color;

  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    color = hex.toUpperCase();
  } else if (/^[0-9a-fA-F]{3}$/.test(hex)) {
    // expand shorthand #abc → #aabbcc
    color = hex.split('').map(c => c + c).join('').toUpperCase();
  } else if (NAMED_COLORS.has(raw.toLowerCase())) {
    color = raw.toLowerCase();
  } else {
    color = String(fallback).replace(/^#/, '');
  }

  if (alpha != null && Number.isFinite(alpha)) {
    const a = Math.min(1, Math.max(0, alpha));
    return `${color}@${a}`;
  }
  return color;
}

// Candidate font files, in priority order. A font bundled into backend/fonts wins, so
// dropping a .ttf there gives every recipient a consistent typeface regardless of OS.
const SYSTEM_FONT_CANDIDATES = [
  'C:/Windows/Fonts/arialbd.ttf',
  'C:/Windows/Fonts/arial.ttf',
  'C:/Windows/Fonts/segoeuib.ttf',
  'C:/Windows/Fonts/segoeui.ttf',
  'C:/Windows/Fonts/calibrib.ttf',
  'C:/Windows/Fonts/calibri.ttf',
  'C:/Windows/Fonts/verdanab.ttf',
  'C:/Windows/Fonts/tahomabd.ttf',
];

let _resolvedFont; // cache across calls

/**
 * Resolve an existing font file, preferring a bundled one, then common system fonts.
 * Returns an absolute forward-slashed path, or null if nothing was found (callers should
 * treat null as "skip the drawtext overlay" rather than crash).
 *
 * @param {string|null} bundledDir - directory to look in first (e.g. config.paths.fonts)
 */
export function resolveFontFile(bundledDir = null) {
  if (_resolvedFont !== undefined) return _resolvedFont;

  const candidates = [];
  if (bundledDir) {
    try {
      for (const f of fs.readdirSync(bundledDir)) {
        if (/\.(ttf|otf)$/i.test(f)) candidates.push(path.join(bundledDir, f));
      }
    } catch { /* dir missing/empty — fall through to system fonts */ }
  }
  candidates.push(...SYSTEM_FONT_CANDIDATES);

  for (const c of candidates) {
    try {
      if (fs.existsSync(c) && fs.statSync(c).size > 0) {
        _resolvedFont = c.replace(/\\/g, '/');
        return _resolvedFont;
      }
    } catch { /* keep looking */ }
  }

  _resolvedFont = null;
  return _resolvedFont;
}

/** Test seam: forget the cached font (used by tests, harmless in prod). */
export function _resetFontCache() { _resolvedFont = undefined; }

/**
 * Is this a usable media asset on disk? Guards against zero-byte / missing downloads that
 * would otherwise make FFmpeg fail deep in the render. Cheap enough to run in preflight.
 */
export function isUsableFile(p, minBytes = 1024) {
  try {
    return !!p && fs.existsSync(p) && fs.statSync(p).size >= minBytes;
  } catch {
    return false;
  }
}
