// Only accept exact, unique UTF-16 source ranges. Never guess an anchor from rendered text.
export function locateReviewSelection(source: string, quote: string): { start: number; end: number } | null {
  if (!quote.trim()) return null;
  const start = source.indexOf(quote);
  if (start < 0 || source.indexOf(quote, start + 1) !== -1) return null;
  return { start, end: start + quote.length };
}
