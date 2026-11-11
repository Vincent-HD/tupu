import { describe, expect, it } from "@effect/vitest";
import { replacesServerVersion } from "../src/domain/reconcile.ts";

const at = (minute: number) => `2026-11-11T10:${String(minute).padStart(2, "0")}:00.000Z`;

describe("replacesServerVersion", () => {
  it("lets a solve replace an unfinished game, even an older solve", () => {
    expect(
      replacesServerVersion({
        server: { status: "playing", updatedAt: at(30) },
        client: { status: "solved", updatedAt: at(10) },
      }),
    ).toBe(true);
  });

  it("never lets an unfinished game replace a solve, even a newer one", () => {
    expect(
      replacesServerVersion({
        server: { status: "solved", updatedAt: at(10) },
        client: { status: "playing", updatedAt: at(30) },
      }),
    ).toBe(false);
  });

  it("keeps the most recent version when both have the same status", () => {
    for (const status of ["playing", "solved"] as const) {
      expect(
        replacesServerVersion({
          server: { status, updatedAt: at(10) },
          client: { status, updatedAt: at(20) },
        }),
      ).toBe(true);
      expect(
        replacesServerVersion({
          server: { status, updatedAt: at(20) },
          client: { status, updatedAt: at(10) },
        }),
      ).toBe(false);
    }
  });

  it("keeps the server version on an exact tie", () => {
    expect(
      replacesServerVersion({
        server: { status: "playing", updatedAt: at(15) },
        client: { status: "playing", updatedAt: at(15) },
      }),
    ).toBe(false);
  });
});
