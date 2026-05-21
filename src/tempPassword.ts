import { randomBytes } from "node:crypto";
import { PASSWORD_MIN_LEN } from "./passwords.js";

const ALPHANUM =
  "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Random password that satisfies signup rules (letter + number, min length). */
export function generateTemporaryPassword(length = 12): string {
  const n = Math.max(PASSWORD_MIN_LEN, length);
  const bytes = randomBytes(n);
  let pwd = "";
  for (let i = 0; i < n; i++) pwd += ALPHANUM[bytes[i]! % ALPHANUM.length];
  if (!/[A-Za-z]/.test(pwd)) pwd = `a${pwd.slice(1)}`;
  if (!/\d/.test(pwd)) pwd = `${pwd.slice(0, -1)}7`;
  return pwd;
}
