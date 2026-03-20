/**
 * Strip leading TestRail IDs (e.g. "C1647217 ") from test case titles.
 */
export default function stripTestRailId(title) {
  if (!title) return '';
  return title.replace(/^C\d+\s*/, '').trim();
}