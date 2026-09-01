/**
 * Attempts to repair malformed JSON from LLM output.
 * Handles: truncated JSON, unterminated strings, trailing commas,
 * unescaped control characters, missing closing brackets.
 *
 * @param {string} raw - raw JSON string from LLM
 * @returns {object} - parsed JSON object
 * @throws {Error} - if repair is impossible
 */
export function repairAndParseJSON(raw) {
  let str = raw.trim();

  // Strip markdown code fences if present
  if (str.startsWith('```')) {
    str = str.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?\s*```$/, '');
  }

  // Try direct parse first (fast path)
  try {
    return JSON.parse(str);
  } catch (e) {
    // Continue to repair
  }

  // === REPAIR PHASE ===

  // 1. Remove any trailing text after the last } or ]
  const lastBrace = str.lastIndexOf('}');
  const lastBracket = str.lastIndexOf(']');
  const lastClose = Math.max(lastBrace, lastBracket);
  if (lastClose > 0 && lastClose < str.length - 1) {
    str = str.substring(0, lastClose + 1);
  }

  // 2. Fix unescaped control characters inside strings
  //    Walk through and escape any raw newlines/tabs inside quoted strings
  str = fixUnescapedControlChars(str);

  // 3. Remove trailing commas before } or ]
  str = str.replace(/,\s*([}\]])/g, '$1');

  // 4. Try parsing again after basic repairs
  try {
    return JSON.parse(str);
  } catch (e) {
    // Continue to more aggressive repair
  }

  // 5. Balance brackets/braces — close any that are still open
  str = balanceBrackets(str);

  // 6. If string was truncated mid-value, try to close it
  //    Find the last complete object in a segments array
  str = truncateToLastCompleteObject(str);

  // 7. Final attempt
  try {
    return JSON.parse(str);
  } catch (e) {
    throw new Error(`JSON repair failed: ${e.message}. First 200 chars: ${raw.substring(0, 200)}`);
  }
}

/**
 * Escapes raw control characters (newlines, tabs) that appear inside JSON strings.
 */
function fixUnescapedControlChars(str) {
  let result = '';
  let inString = false;
  let escaped = false;

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];

    if (escaped) {
      result += ch;
      escaped = false;
      continue;
    }

    if (ch === '\\' && inString) {
      escaped = true;
      result += ch;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      result += ch;
      continue;
    }

    if (inString) {
      // Replace raw control characters with escaped versions
      if (ch === '\n') { result += '\\n'; continue; }
      if (ch === '\r') { result += '\\r'; continue; }
      if (ch === '\t') { result += '\\t'; continue; }
    }

    result += ch;
  }

  // If we ended inside a string, close it
  if (inString) {
    result += '"';
  }

  return result;
}

/**
 * Counts open brackets/braces and appends closing ones.
 */
function balanceBrackets(str) {
  let braces = 0;   // { }
  let brackets = 0; // [ ]
  let inString = false;
  let escaped = false;

  for (const ch of str) {
    if (escaped) { escaped = false; continue; }
    if (ch === '\\' && inString) { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;

    if (ch === '{') braces++;
    else if (ch === '}') braces--;
    else if (ch === '[') brackets++;
    else if (ch === ']') brackets--;
  }

  // Append missing closers
  while (brackets > 0) { str += ']'; brackets--; }
  while (braces > 0) { str += '}'; braces--; }

  return str;
}

/**
 * If the JSON was truncated mid-object inside a "segments" array,
 * find the last complete object and rebuild valid JSON from it.
 */
function truncateToLastCompleteObject(str) {
  // Find the segments array
  const segIdx = str.indexOf('"segments"');
  if (segIdx === -1) return str;

  // Find all complete objects by looking for pattern: },
  // Work backwards from end to find last complete segment object
  let depth = 0;
  let lastCompleteEnd = -1;
  let inStr = false;
  let esc = false;
  let arrayStart = str.indexOf('[', segIdx);
  if (arrayStart === -1) return str;

  for (let i = arrayStart + 1; i < str.length; i++) {
    const ch = str[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\' && inStr) { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;

    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        lastCompleteEnd = i;
      }
    }
  }

  if (lastCompleteEnd > arrayStart) {
    // Rebuild: everything up to and including last complete object, then close array and root
    return str.substring(0, lastCompleteEnd + 1) + ']}';
  }

  return str;
}
