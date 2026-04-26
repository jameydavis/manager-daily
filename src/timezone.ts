/**
 * Default IANA zone for Fort Wayne, IN (Eastern Time, DST).
 * Override with TZ in .env (e.g. America/New_York).
 */
if (!process.env.TZ?.trim()) {
  process.env.TZ = "America/Indiana/Indianapolis";
}
