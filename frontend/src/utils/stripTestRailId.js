/**
 * Strip leading TestRail IDs (e.g. "C1647217 ") and leading dashes/en-dashes
 * (e.g. "– Navigate to Tokens") from test case titles.
 */
export default function stripTestRailId(title) {
  if (!title) return '';
  return title
    .replace(/^C\d+\s*/, '')   // strip TestRail C-ID prefix
    .replace(/^[\u2013\u2014-]+\s*/, '') // strip leading dash/en-dash/em-dash
    .trim();
}