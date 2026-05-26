import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import {
  emailKeywordsConfigured,
  emailKeywordsForMatch,
  textMatchesEmailKeywords,
} from "./emailKeywords.js";

export type EmailMatch = {
  fingerprint: string;
  subject: string;
  from: string;
  dateLabel: string;
  snippet: string;
  matchedKeywords: string[];
};

export function importantEmailConfigured(): boolean {
  const host = process.env.EMAIL_IMAP_HOST?.trim();
  const user = process.env.EMAIL_IMAP_USER?.trim();
  const pass = process.env.EMAIL_IMAP_PASS?.trim();
  return Boolean(host && user && pass && emailKeywordsConfigured());
}

function keywordsForMatch(): string[] {
  return emailKeywordsForMatch();
}

function textMatchesKeywords(haystack: string, keywords: string[]): string[] {
  return textMatchesEmailKeywords(haystack, keywords);
}

function fingerprintFor(messageId: string | undefined, uid: number, folder: string): string {
  const mid = messageId?.replace(/[<>]/g, "").trim();
  if (mid) return mid.slice(0, 500);
  return `${folder}:${uid}`.slice(0, 500);
}

function formatInternalDate(d: Date | string | undefined | null): string {
  if (d == null) return "";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function plainFromParsed(text: string | undefined, html: string | undefined | false): string {
  if (text?.trim()) return text;
  if (!html || typeof html !== "string") return "";
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Scan recent IMAP messages and return those whose subject or body contains any configured keyword.
 */
export async function fetchImportantEmailMatches(
  dismissed: Set<string>
): Promise<{ matches: EmailMatch[]; error: string | null }> {
  const host = process.env.EMAIL_IMAP_HOST?.trim();
  const user = process.env.EMAIL_IMAP_USER?.trim();
  const pass = process.env.EMAIL_IMAP_PASS?.trim();
  const folder = (process.env.EMAIL_IMAP_FOLDER ?? "INBOX").trim() || "INBOX";
  const keywords = keywordsForMatch();
  const maxScan = Math.min(200, Math.max(5, Number(process.env.EMAIL_MAX_SCAN) || 60));

  if (!host || !user || !pass || !keywords.length) {
    return { matches: [], error: null };
  }

  const client = new ImapFlow({
    host,
    port: Number(process.env.EMAIL_IMAP_PORT) || 993,
    secure: process.env.EMAIL_IMAP_SECURE !== "false",
    auth: { user, pass },
    logger: false,
  });

  const matches: EmailMatch[] = [];

  try {
    await client.connect();
    const opened = await client.mailboxOpen(folder);
    const total = opened.exists;
    if (total === 0) {
      await client.logout();
      return { matches: [], error: null };
    }

    const n = Math.min(total, maxScan);
    const startSeq = Math.max(1, total - n + 1);
    const range = `${startSeq}:*`;

    for await (const msg of client.fetch(range, {
      uid: true,
      envelope: true,
      internalDate: true,
      source: true,
    })) {
      const uid = msg.uid;
      if (uid == null || !msg.source) continue;

      let parsed;
      try {
        parsed = await simpleParser(msg.source);
      } catch {
        continue;
      }

      const subject = parsed.subject?.trim() || "(no subject)";
      const from = parsed.from?.text?.trim() || "";
      const bodyText = plainFromParsed(parsed.text, parsed.html);
      const combined = `${subject}\n${bodyText}`;
      const matchedKw = textMatchesKeywords(combined, keywords);
      if (!matchedKw.length) continue;

      const fp = fingerprintFor(parsed.messageId, uid, folder);
      if (dismissed.has(fp)) continue;

      const snippetSource = bodyText || subject;
      const snippet = snippetSource.replace(/\s+/g, " ").trim().slice(0, 220);

      matches.push({
        fingerprint: fp,
        subject,
        from,
        dateLabel: formatInternalDate(msg.internalDate),
        snippet,
        matchedKeywords: matchedKw,
      });
    }

    await client.logout();
  } catch (e) {
    try {
      await client.logout();
    } catch {
      /* ignore */
    }
    return {
      matches: [],
      error: e instanceof Error ? e.message : String(e),
    };
  }

  matches.reverse();
  return { matches, error: null };
}
