import { DateTime, Effect } from "effect";

const isoDateOf = (date: DateTime.DateTime) => {
  const parts = DateTime.toParts(date);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
};

export const today = Effect.map(DateTime.now, (now) =>
  isoDateOf(DateTime.setZone(now, DateTime.zoneMakeLocal())),
);

export const parseIsoDate = (isoDate: string) => {
  const [year = 1970, month = 1, day = 1] = isoDate.split("-").map(Number);
  return { year, month, day };
};

const utcNoon = (isoDate: string) => {
  const { year, month, day } = parseIsoDate(isoDate);
  return DateTime.makeUnsafe({ year, month, day, hours: 12 });
};

export const weekdayOf = (isoDate: string) => DateTime.toParts(utcNoon(isoDate)).weekDay;

export const shiftDate = (isoDate: string, days: number) =>
  isoDateOf(DateTime.add(utcNoon(isoDate), { days }));

export const monthDays = (year: number, month: number) => {
  const first = `${year}-${String(month).padStart(2, "0")}-01`;
  const days: Array<string> = [];
  for (let date = first; parseIsoDate(date).month === month; date = shiftDate(date, 1))
    days.push(date);
  return days;
};

export const formatLongDate = (isoDate: string) =>
  DateTime.toDateUtc(utcNoon(isoDate)).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
