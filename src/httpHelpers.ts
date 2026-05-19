/** Max gamify queue size for desk-buddy redirect params (must match client caps). */
export const MAX_DESK_PET_QUEUE = 50;

const MAX_TASK_TITLE_FLASH_LEN = 120;

/** Limit open redirects: only same-origin relative paths. */
export function safeRedirectPath(raw: unknown, fallback = "/"): string {
  if (typeof raw !== "string") return fallback;
  const t = raw.trim();
  if (!t.startsWith("/") || t.startsWith("//")) return fallback;
  if (t.includes("\r") || t.includes("\n")) return fallback;
  return t;
}

/** Build `/?date=…` with optional desk-buddy gamify query params (stripped client-side after use). */
export function homeForDay(
  day: string,
  deskPet?: {
    create?: number;
    complete?: number;
    completedTitle?: string | null;
    carryOver?: number;
  }
): string {
  const u = new URL("http://_/");
  u.pathname = "/";
  u.searchParams.set("date", day);
  if (deskPet?.carryOver != null && deskPet.carryOver > 0) {
    u.searchParams.set(
      "deskPetCarryOver",
      String(Math.min(MAX_DESK_PET_QUEUE, Math.floor(deskPet.carryOver)))
    );
  }
  if (deskPet?.create != null && deskPet.create > 0) {
    u.searchParams.set(
      "deskPetCreate",
      String(Math.min(MAX_DESK_PET_QUEUE, Math.floor(deskPet.create)))
    );
  }
  if (deskPet?.complete != null && deskPet.complete > 0) {
    u.searchParams.set(
      "deskPetComplete",
      String(Math.min(MAX_DESK_PET_QUEUE, Math.floor(deskPet.complete)))
    );
    if (deskPet.completedTitle) {
      const t = deskPet.completedTitle.trim().slice(0, MAX_TASK_TITLE_FLASH_LEN);
      if (t) u.searchParams.set("taskTitle", t);
    }
  }
  return `${u.pathname}${u.search}`;
}

/** Append one-time query params read by `toasts.js` for a removed-task notification. */
export function withTaskRemovedFlash(pathWithQuery: string, title: string | null): string {
  const u = new URL(pathWithQuery, "http://_/");
  u.searchParams.set("taskRemoved", "1");
  u.searchParams.set("deskPetRemove", "1");
  if (title) {
    const t = title.trim().slice(0, MAX_TASK_TITLE_FLASH_LEN);
    if (t) u.searchParams.set("taskTitle", t);
  }
  return `${u.pathname}${u.search}`;
}
