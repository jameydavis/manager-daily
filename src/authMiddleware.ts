import type { RequestHandler } from "express";
import { consumeAndValidateSession, deleteSession, type AuthUserRow } from "./db.js";
import type { AuthUser } from "./authTypes.js";

export const SESSION_COOKIE = "md_session";

export const SESSION_TTL_SECONDS = Math.min(
  90 * 24 * 60 * 60,
  Math.max(60 * 60, Math.trunc(Number(process.env.SESSION_TTL_SECONDS) || 30 * 24 * 60 * 60))
);

function rowToAuthUser(r: AuthUserRow): AuthUser {
  return {
    id: r.id,
    email: r.email,
    firstName: r.first_name,
    lastName: r.last_name,
  };
}

export const attachAuthUser: RequestHandler = (req, res, next) => {
  res.locals.currentUser = null;
  const token = req.cookies?.[SESSION_COOKIE];
  if (typeof token !== "string" || !token) {
    req.authUser = null;
    next();
    return;
  }
  const row = consumeAndValidateSession(token);
  if (!row) {
    res.clearCookie(SESSION_COOKIE, { path: "/" });
    req.authUser = null;
    next();
    return;
  }
  const u = rowToAuthUser(row);
  req.authUser = u;
  res.locals.currentUser = u;
  next();
};

export function setSessionCookie(res: import("express").Response, token: string): void {
  const maxAgeMs = SESSION_TTL_SECONDS * 1000;
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: maxAgeMs,
    path: "/",
  });
}

export function clearSessionCookie(res: import("express").Response): void {
  res.clearCookie(SESSION_COOKIE, { path: "/" });
}

export function logoutSession(res: import("express").Response, token: string | undefined): void {
  if (token) deleteSession(token);
  clearSessionCookie(res);
}

export const requireAuth: RequestHandler = (req, res, next) => {
  if (req.authUser) {
    next();
    return;
  }
  const path = req.originalUrl || "/";
  res.redirect(`/login?redirect=${encodeURIComponent(path)}`);
};
