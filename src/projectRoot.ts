import path from "node:path";
import { fileURLToPath } from "node:url";

/** Repo root (folder with package.json), not process.cwd(). */
export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
