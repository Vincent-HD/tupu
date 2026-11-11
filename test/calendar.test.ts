import { describe, expect, it } from "@effect/vitest";
import { DateTime } from "effect";
import { dateInZone, latestDailyDate } from "../src/domain/calendar.ts";

const instant = (iso: string) => DateTime.makeUnsafe(iso);
const zone = DateTime.zoneMakeNamedUnsafe;

describe("daily dates across time zones", () => {
  const morning = instant("2026-11-11T09:30:00Z");

  it("gives each player the date on their own clock", () => {
    expect(dateInZone({ at: morning, zone: zone("Europe/Paris") })).toBe("2026-11-11");
    expect(dateInZone({ at: morning, zone: zone("America/Los_Angeles") })).toBe("2026-11-11");
    expect(dateInZone({ at: morning, zone: zone("Pacific/Pago_Pago") })).toBe("2026-11-10");
    expect(dateInZone({ at: morning, zone: zone("Pacific/Kiritimati") })).toBe("2026-11-11");
    expect(
      dateInZone({ at: instant("2026-11-11T10:30:00Z"), zone: zone("Pacific/Kiritimati") }),
    ).toBe("2026-11-12");
  });

  it("follows daylight saving changes", () => {
    expect(dateInZone({ at: instant("2026-03-29T22:30:00Z"), zone: zone("Europe/Paris") })).toBe(
      "2026-03-30",
    );
    expect(dateInZone({ at: instant("2026-01-15T22:30:00Z"), zone: zone("Europe/Paris") })).toBe(
      "2026-01-15",
    );
  });

  it("only allows the next date once it has started somewhere on Earth", () => {
    expect(latestDailyDate(instant("2026-11-11T09:59:59Z"))).toBe("2026-11-11");
    expect(latestDailyDate(instant("2026-11-11T10:00:00Z"))).toBe("2026-11-12");
  });

  it("never rejects a date a real player can see", () => {
    const zones = ["Pacific/Kiritimati", "Asia/Tokyo", "Europe/Paris", "Pacific/Pago_Pago"];
    for (let hour = 0; hour < 24; hour++) {
      const at = instant(`2026-11-11T${String(hour).padStart(2, "0")}:15:00Z`);
      for (const name of zones)
        expect(dateInZone({ at, zone: zone(name) }) <= latestDailyDate(at)).toBe(true);
    }
  });
});
