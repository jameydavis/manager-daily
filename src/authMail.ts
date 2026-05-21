import nodemailer from "nodemailer";

export function authMailConfigured(): boolean {
  return Boolean(
    process.env.AUTH_SMTP_HOST?.trim() &&
      process.env.AUTH_SMTP_USER?.trim() &&
      process.env.AUTH_SMTP_PASS?.trim() &&
      process.env.AUTH_MAIL_FROM?.trim()
  );
}

/** In non-production, log reset mail when SMTP is not configured. */
export function authMailDevFallbackEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && !authMailConfigured();
}

function appBaseUrl(): string {
  const raw = process.env.APP_BASE_URL?.trim() || "http://127.0.0.1:3000";
  return raw.replace(/\/$/, "");
}

export async function sendTemporaryPasswordEmail(opts: {
  to: string;
  temporaryPassword: string;
  displayName?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const host = process.env.AUTH_SMTP_HOST?.trim();
  const user = process.env.AUTH_SMTP_USER?.trim();
  const pass = process.env.AUTH_SMTP_PASS?.trim();
  const from = process.env.AUTH_MAIL_FROM?.trim();
  if (!host || !user || !pass || !from) {
    return { ok: false, error: "Password reset email is not configured on this server." };
  }

  const port = Number(process.env.AUTH_SMTP_PORT) || 587;
  const secure =
    process.env.AUTH_SMTP_SECURE === "true" || (port === 465 && process.env.AUTH_SMTP_SECURE !== "false");

  const greeting = opts.displayName?.trim() ? `Hi ${opts.displayName.trim()},` : "Hi,";
  const loginUrl = `${appBaseUrl()}/login`;
  const changeUrl = `${appBaseUrl()}/account/password`;

  const text = `${greeting}

We received a request to reset your Manager Daily password.

Your temporary password is: ${opts.temporaryPassword}

Sign in: ${loginUrl}
Then change your password when you are ready: ${changeUrl}

If you did not request this, contact your administrator.`;

  const html = `<p>${greeting}</p>
<p>We received a request to reset your <strong>Manager Daily</strong> password.</p>
<p>Your temporary password is:</p>
<p style="font-family:monospace;font-size:1.1em">${opts.temporaryPassword}</p>
<p><a href="${loginUrl}">Sign in</a>, then <a href="${changeUrl}">change your password</a> when you are ready.</p>
<p>If you did not request this, contact your administrator.</p>`;

  try {
    const transport = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    });
    await transport.sendMail({
      from,
      to: opts.to,
      subject: "Manager Daily — temporary password",
      text,
      html,
    });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to send email.";
    return { ok: false, error: msg };
  }
}
