import type { AuthUser } from "./authTypes.js";

declare module "express-serve-static-core" {
  interface Request {
    authUser?: AuthUser | null;
  }
}

export {};
