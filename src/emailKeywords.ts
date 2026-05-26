/** Shared keyword parsing/matching for IMAP and Microsoft Graph inbox scans. */

export function parseEmailKeywords(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[\r\n,]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function emailKeywordsConfigured(): boolean {
  return parseEmailKeywords(process.env.EMAIL_KEYWORDS).length > 0;
}

export function emailKeywordsForMatch(): string[] {
  return parseEmailKeywords(process.env.EMAIL_KEYWORDS);
}

export function textMatchesEmailKeywords(haystack: string, keywords: string[]): string[] {
  const lower = haystack.toLowerCase();
  return keywords.filter((k) => lower.includes(k));
}
