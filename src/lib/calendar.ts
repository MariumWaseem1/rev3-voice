import { DateTime } from "luxon";
import type { Configuration } from "./schemas";
export function slotWithinHours(
  startISO: string,
  minutes: number,
  c: Configuration,
  now = Date.now(),
) {
  const start = DateTime.fromISO(startISO, { setZone: true }).setZone(
    c.timezone,
  );
  const end = start.plus({ minutes });
  if (
    !start.isValid ||
    start.toMillis() <= now ||
    start.toMillis() > now + 90 * 86400000 ||
    start.offset !== end.offset
  )
    return false;
  const h = c.openingHours.find((h) => h.day === start.weekday);
  if (!h || !start.hasSame(end, "day")) return false;
  const mins = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
  return (
    start.hour * 60 + start.minute >= mins(h.open) &&
    end.hour * 60 + end.minute <= mins(h.close)
  );
}
export function candidateSlots(
  date: string,
  minutes: number,
  c: Configuration,
) {
  const day = DateTime.fromISO(date, { zone: c.timezone });
  if (!day.isValid) return [];
  const h = c.openingHours.find((h) => h.day === day.weekday);
  if (!h) return [];
  let point = day.set({
    hour: Number(h.open.slice(0, 2)),
    minute: Number(h.open.slice(3)),
  });
  const slots: string[] = [];
  for (let n = 0; n < 96; n++, point = point.plus({ minutes: 15 })) {
    const iso = point.toISO()!;
    if (slotWithinHours(iso, minutes, c)) slots.push(iso);
  }
  return [...new Set(slots)].slice(0, 40);
}
