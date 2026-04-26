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
export function sprintDaysLeftPhrase(todayISO: string, sprintEndISO: string): string {
  const t = parseDay(todayISO);
  const e = parseDay(sprintEndISO);
  if (!t || !e) return "";
  const msPerDay = 24 * 60 * 60 * 1000;
  const diff = Math.round((e.getTime() - t.getTime()) / msPerDay);
  const inclusive = diff + 1;
  const days = Math.max(0, inclusive);
  if (days === 1) return "1 day left";
  return `${days} days left`;
}

export function prevCalendarDay(day: string): string | null {
  const d = parseDay(day);
  if (!d) return null;
  d.setDate(d.getDate() - 1);
  return formatDay(d);
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
