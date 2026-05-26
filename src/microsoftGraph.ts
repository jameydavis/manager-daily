import { randomBytes } from "node:crypto";
import {
  deleteUserMicrosoftMailTokens,
  getUserMicrosoftMailTokens,
  saveUserMicrosoftMailTokens,
  type UserMicrosoftMailTokens,
} from "./db.js";
import {
  emailKeywordsForMatch,
  textMatchesEmailKeywords,
} from "./emailKeywords.js";
import type { EmailMatch } from "./importantEmail.js";

const GRAPH_SCOPE = "openid profile offline_access User.Read Mail.Read";
const MS_OAUTH_STATE_COOKIE = "ms_oauth_state";

export { MS_OAUTH_STATE_COOKIE };

export type MicrosoftGraphConfig = {
  clientId: string;
  clientSecret: string;
  tenantId: string;
  redirectUri: string;
};

export function appBaseUrl(): string {
  const raw = process.env.APP_BASE_URL?.trim() || "http://127.0.0.1:3000";
  return raw.replace(/\/$/, "");
}

export function microsoftGraphConfigured(): boolean {
  const clientId = process.env.MS_GRAPH_CLIENT_ID?.trim();
  const clientSecret = process.env.MS_GRAPH_CLIENT_SECRET?.trim();
  return Boolean(clientId && clientSecret);
}

export function readMicrosoftGraphConfig(): MicrosoftGraphConfig | null {
  const clientId = process.env.MS_GRAPH_CLIENT_ID?.trim();
  const clientSecret = process.env.MS_GRAPH_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  const tenantId = (process.env.MS_GRAPH_TENANT_ID?.trim() || "organizations").trim();
  const redirectPath = (process.env.MS_GRAPH_REDIRECT_PATH?.trim() || "/auth/microsoft/callback").trim();
  const redirectUri = `${appBaseUrl()}${redirectPath.startsWith("/") ? redirectPath : `/${redirectPath}`}`;
  return { clientId, clientSecret, tenantId, redirectUri };
}

export function createMicrosoftOAuthState(): string {
  return randomBytes(24).toString("hex");
}

export function buildMicrosoftAuthorizeUrl(state: string): string | null {
  const cfg = readMicrosoftGraphConfig();
  if (!cfg) return null;
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    response_type: "code",
    redirect_uri: cfg.redirectUri,
    response_mode: "query",
    scope: GRAPH_SCOPE,
    state,
  });
  return `https://login.microsoftonline.com/${encodeURIComponent(cfg.tenantId)}/oauth2/v2.0/authorize?${params}`;
}

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
};

async function postToken(body: Record<string, string>): Promise<TokenResponse> {
  const cfg = readMicrosoftGraphConfig();
  if (!cfg) throw new Error("Microsoft Graph is not configured.");

  const res = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(cfg.tenantId)}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        ...body,
      }),
    }
  );

  const data = (await res.json()) as TokenResponse;
  if (!res.ok || data.error) {
    throw new Error(data.error_description || data.error || `Token request failed (${res.status})`);
  }
  return data;
}

export async function exchangeMicrosoftAuthCode(code: string): Promise<UserMicrosoftMailTokens> {
  const cfg = readMicrosoftGraphConfig();
  if (!cfg) throw new Error("Microsoft Graph is not configured.");

  const data = await postToken({
    grant_type: "authorization_code",
    code,
    redirect_uri: cfg.redirectUri,
    scope: GRAPH_SCOPE,
  });

  if (!data.access_token || !data.refresh_token) {
    throw new Error("Microsoft did not return mail tokens.");
  }

  const expiresIn = typeof data.expires_in === "number" ? data.expires_in : 3600;
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + expiresIn * 1000,
    scope: typeof data.scope === "string" ? data.scope : GRAPH_SCOPE,
  };
}

export async function refreshMicrosoftAccessToken(
  refreshToken: string
): Promise<UserMicrosoftMailTokens> {
  const data = await postToken({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    scope: GRAPH_SCOPE,
  });

  if (!data.access_token) {
    throw new Error("Microsoft token refresh failed.");
  }

  const expiresIn = typeof data.expires_in === "number" ? data.expires_in : 3600;
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token || refreshToken,
    expires_at: Date.now() + expiresIn * 1000,
    scope: typeof data.scope === "string" ? data.scope : GRAPH_SCOPE,
  };
}

async function accessTokenForUser(userId: number): Promise<string | null> {
  const row = getUserMicrosoftMailTokens(userId);
  if (!row) return null;

  if (row.expires_at > Date.now() + 60_000) {
    return row.access_token;
  }

  try {
    const refreshed = await refreshMicrosoftAccessToken(row.refresh_token);
    saveUserMicrosoftMailTokens(userId, refreshed);
    return refreshed.access_token;
  } catch {
    deleteUserMicrosoftMailTokens(userId);
    return null;
  }
}

type GraphMessage = {
  id?: string;
  subject?: string;
  bodyPreview?: string;
  receivedDateTime?: string;
  internetMessageId?: string;
  from?: { emailAddress?: { name?: string; address?: string } };
};

function formatGraphDate(iso: string | undefined): string {
  if (!iso) return "";
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function fingerprintForGraph(msg: GraphMessage): string {
  const mid = msg.internetMessageId?.replace(/[<>]/g, "").trim();
  if (mid) return mid.slice(0, 500);
  if (msg.id) return `graph:${msg.id}`.slice(0, 500);
  return `graph:${randomBytes(8).toString("hex")}`;
}

function fromLabel(msg: GraphMessage): string {
  const name = msg.from?.emailAddress?.name?.trim();
  const address = msg.from?.emailAddress?.address?.trim();
  if (name && address) return `${name} <${address}>`;
  return name || address || "";
}

/**
 * Scan the signed-in user's Outlook inbox via Graph and return keyword matches.
 */
export async function fetchImportantEmailMatchesGraph(
  userId: number,
  dismissed: Set<string>
): Promise<{ matches: EmailMatch[]; error: string | null; disconnected: boolean }> {
  const keywords = emailKeywordsForMatch();
  if (!keywords.length) {
    return { matches: [], error: null, disconnected: false };
  }

  const accessToken = await accessTokenForUser(userId);
  if (!accessToken) {
    return { matches: [], error: null, disconnected: true };
  }

  const maxScan = Math.min(200, Math.max(5, Number(process.env.EMAIL_MAX_SCAN) || 60));
  const url = new URL("https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages");
  url.searchParams.set("$top", String(maxScan));
  url.searchParams.set("$orderby", "receivedDateTime desc");
  url.searchParams.set("$select", "id,subject,from,receivedDateTime,bodyPreview,internetMessageId");

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (res.status === 401) {
      deleteUserMicrosoftMailTokens(userId);
      return { matches: [], error: null, disconnected: true };
    }

    if (!res.ok) {
      const text = await res.text();
      return {
        matches: [],
        error: text.slice(0, 240) || `Graph mail request failed (${res.status})`,
        disconnected: false,
      };
    }

    const payload = (await res.json()) as { value?: GraphMessage[] };
    const messages = Array.isArray(payload.value) ? payload.value : [];
    const matches: EmailMatch[] = [];

    for (const msg of messages) {
      const subject = msg.subject?.trim() || "(no subject)";
      const bodyPreview = msg.bodyPreview?.trim() || "";
      const combined = `${subject}\n${bodyPreview}`;
      const matchedKw = textMatchesEmailKeywords(combined, keywords);
      if (!matchedKw.length) continue;

      const fp = fingerprintForGraph(msg);
      if (dismissed.has(fp)) continue;

      const snippetSource = bodyPreview || subject;
      matches.push({
        fingerprint: fp,
        subject,
        from: fromLabel(msg),
        dateLabel: formatGraphDate(msg.receivedDateTime),
        snippet: snippetSource.replace(/\s+/g, " ").trim().slice(0, 220),
        matchedKeywords: matchedKw,
      });
    }

    return { matches, error: null, disconnected: false };
  } catch (e) {
    return {
      matches: [],
      error: e instanceof Error ? e.message : String(e),
      disconnected: false,
    };
  }
}
