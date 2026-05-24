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

function isWeekday(d: Date): boolean {
  const dow = d.getDay();
  return dow >= 1 && dow <= 5;
}

/** Inclusive day count between two ISO dates (Mon–Fri only). */
export function countWeekdaysInclusive(fromISO: string, toISO: string): number {
  const from = parseDay(fromISO);
  const to = parseDay(toISO);
  if (!from || !to) return 0;
  let start = from;
  let end = to;
  if (start.getTime() > end.getTime()) {
    start = to;
    end = from;
  }
  let count = 0;
  const cursor = new Date(start);
  while (cursor.getTime() <= end.getTime()) {
    if (isWeekday(cursor)) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

/** Round a day count to the nearest half-day increment. */
export function roundToHalfDay(days: number): number {
  if (!Number.isFinite(days) || days <= 0) return 0;
  return Math.round(days * 2) / 2;
}

/** Inclusive days from today through sprint end (Mon–Fri only); 0 if today is after end. */
export function sprintDaysLeftInclusive(todayISO: string, sprintEndISO: string): number {
  const t = parseDay(todayISO);
  const e = parseDay(sprintEndISO);
  if (!t || !e) return 0;
  if (t.getTime() > e.getTime()) return 0;
  return countWeekdaysInclusive(todayISO, sprintEndISO);
}

/**
 * Sprint days remaining rounded to half-day increments.
 * Treats the rest of today as a fractional weekday based on local time elapsed.
 */
export function sprintDaysLeftHalfDay(
  todayISO: string,
  sprintEndISO: string,
  now: Date = new Date()
): number {
  const whole = sprintDaysLeftInclusive(todayISO, sprintEndISO);
  if (whole === 0) return 0;

  const today = parseDay(todayISO);
  if (!today || !isWeekday(today)) return roundToHalfDay(whole);

  const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const elapsed = Math.min(1, Math.max(0, (now.getTime() - dayStart) / 86_400_000));
  const todayRemaining = 1 - elapsed;
  return roundToHalfDay(whole - 1 + todayRemaining);
}

export function sprintDaysLeftPhrase(todayISO: string, sprintEndISO: string): string {
  const days = sprintDaysLeftInclusive(todayISO, sprintEndISO);
  if (days === 1) return "1 day left";
  return `${days} days left`;
}

/** Inclusive day count for a sprint window (Mon–Fri only). */
export function sprintInclusiveDaysBetween(startISO: string, endISO: string): number | null {
  const s = parseDay(startISO);
  const e = parseDay(endISO);
  if (!s || !e) return null;
  const count = countWeekdaysInclusive(startISO, endISO);
  return count > 0 ? count : null;
}

/** Inclusive elapsed days from sprint start through today, clamped to the sprint window (Mon–Fri only). */
export function sprintElapsedInclusive(todayISO: string, startISO: string, endISO: string): number {
  const t = parseDay(todayISO);
  const s = parseDay(startISO);
  const e = parseDay(endISO);
  if (!t || !s || !e) return 0;
  if (t.getTime() < s.getTime()) return 0;
  if (t.getTime() > e.getTime()) {
    return countWeekdaysInclusive(startISO, endISO);
  }
  return countWeekdaysInclusive(startISO, todayISO);
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
