export function ftsQuery(raw: string): string | null {
  const tokens = raw
    .split(/\s+/)
    .map((token) => token.replace(/["*]/g, ''))
    .filter((token) => token.length > 0);
  if (tokens.length === 0) return null;
  // The star stays outside the quotes. FTS5 only treats that star as "starts with".
  // A star typed by the person is stripped above, so it cannot change the query shape.
  return tokens.map((token) => `"${token}"*`).join(' ');
}
