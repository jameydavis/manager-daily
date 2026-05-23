/** Local calendar date as YYYY-MM-DD (no timezone conversion). */
export function formatDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseDay(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return dt;
}

export function today(): string {
  return formatDay(new Date());
}

/** Inclusive calendar days from today through sprint end; 0 if today is after end. */
export function sprintDaysLeftInclusive(todayISO: string, sprintEndISO: string): number {
  const t = parseDay(todayISO);
  const e = parseDay(sprintEndISO);
  if (!t || !e) return 0;
  const msPerDay = 24 * 60 * 60 * 1000;
  const diff = Math.round((e.getTime() - t.getTime()) / msPerDay);
  return Math.max(0, diff + 1);
}

export function sprintDaysLeftPhrase(todayISO: string, sprintEndISO: string): string {
  const days = sprintDaysLeftInclusive(todayISO, sprintEndISO);
  if (days === 1) return "1 day left";
  return `${days} days left`;
}

/** Inclusive day count for a sprint window (minimum 1). */
export function sprintInclusiveDaysBetween(startISO: string, endISO: string): number | null {
  const s = parseDay(startISO);
  const e = parseDay(endISO);
  if (!s || !e) return null;
  const msPerDay = 24 * 60 * 60 * 1000;
  const diff = Math.round((e.getTime() - s.getTime()) / msPerDay);
  return Math.max(1, diff + 1);
}

/** Inclusive elapsed days from sprint start through today, clamped to the sprint window. */
export function sprintElapsedInclusive(todayISO: string, startISO: string, endISO: string): number {
  const t = parseDay(todayISO);
  const s = parseDay(startISO);
  const e = parseDay(endISO);
  if (!t || !s || !e) return 0;
  const msPerDay = 24 * 60 * 60 * 1000;
  if (t.getTime() < s.getTime()) return 0;
  if (t.getTime() > e.getTime()) {
    return sprintInclusiveDaysBetween(startISO, endISO) ?? 0;
  }
  const diff = Math.round((t.getTime() - s.getTime()) / msPerDay);
  return diff + 1;
}

/** Sprint timeline progress as 0–100 for dashboard charts. */
export function sprintProgressPercent(todayISO: string, startISO: string, endISO: string): number | null {
  const total = sprintInclusiveDaysBetween(startISO, endISO);
  if (total == null) return null;
  const elapsed = sprintElapsedInclusive(todayISO, startISO, endISO);
  return Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)));
}

export function prevCalendarDay(day: string): string | null {
  const d = parseDay(day);
  if (!d) return null;
  d.setDate(d.getDate() - 1);
  return formatDay(d);
}

/** The `count` calendar days immediately before `anchorDay` (yesterday first). */
export function previousCalendarDays(anchorDay: string, count: number): string[] {
  const anchor = parseDay(anchorDay);
  if (!anchor || count < 1) return [];
  const n = Math.floor(count);
  const out: string[] = [];
  for (let i = 1; i <= n; i++) {
    const d = new Date(anchor);
    d.setDate(d.getDate() - i);
    out.push(formatDay(d));
  }
  return out;
}

export type CalendarCell = {
  day: string;
  label: number;
  inMonth: boolean;
  isToday: boolean;
  inSprint: boolean;
};

export function monthGrid(
  year: number,
  monthIndex0: number,
  todayISO: string,
  sprintStart: string | null,
  sprintEnd: string | null
): CalendarCell[][] {
  const first = new Date(year, monthIndex0, 1);
  const startWeekday = first.getDay();
  const gridStart = new Date(year, monthIndex0, 1 - startWeekday);
  const weeks: CalendarCell[][] = [];
  let cursor = new Date(gridStart);
  for (let w = 0; w < 6; w++) {
    const row: CalendarCell[] = [];
    for (let i = 0; i < 7; i++) {
      const iso = formatDay(cursor);
      const inMonth = cursor.getMonth() === monthIndex0;
      const isToday = iso === todayISO;
      const inSprint =
        sprintStart != null &&
        sprintEnd != null &&
        iso >= sprintStart &&
        iso <= sprintEnd;
      row.push({
        day: iso,
        label: cursor.getDate(),
        inMonth,
        isToday,
        inSprint,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(row);
  }
  return weeks;
}
