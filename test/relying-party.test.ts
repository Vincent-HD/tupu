import { describe, expect, it } from "@effect/vitest";
import { Option } from "effect";
import { Headers } from "effect/http";
import { partyFor } from "../server/relying-party.ts";

describe("passkey relying party", () => {
  it("binds passkeys to the host the browser used, behind a proxy", () => {
    const headers = Headers.fromInput({
      host: "tupu:8080",
      "x-forwarded-host": "tupu.example.com",
      "x-forwarded-proto": "https, http",
    });
    expect(partyFor({ headers, configured: Option.none() })).toEqual({
      origin: "https://tupu.example.com",
      rpId: "tupu.example.com",
    });
  });

  it("uses the Host header in development", () => {
    const headers = Headers.fromInput({ host: "localhost:5173" });
    expect(partyFor({ headers, configured: Option.none() })).toEqual({
      origin: "http://localhost:5173",
      rpId: "localhost",
    });
  });

  it("prefers TUPU_ORIGIN when it is set", () => {
    const headers = Headers.fromInput({ host: "evil.example" });
    expect(partyFor({ headers, configured: Option.some("https://play.tupu.app") })).toEqual({
      origin: "https://play.tupu.app",
      rpId: "play.tupu.app",
    });
  });
});
