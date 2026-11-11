import { Option } from "effect";
import { Headers } from "effect/http";

export interface Party {
  readonly origin: string;
  readonly rpId: string;
}

const firstValue = (headers: Headers.Headers, name: string) =>
  Headers.get(headers, name).pipe(Option.map((value) => value.split(",")[0]?.trim() ?? value));

// Passkeys are bound to the site's hostname. Without TUPU_ORIGIN, the origin is
// read from the request so one build serves any host: a reverse proxy, a
// Cloudflare Worker or the Vite dev proxy.
export const partyFor = (input: {
  readonly headers: Headers.Headers;
  readonly configured: Option.Option<string>;
}): Party => {
  const origin = Option.getOrElse(input.configured, () => {
    const host = firstValue(input.headers, "x-forwarded-host").pipe(
      Option.orElse(() => firstValue(input.headers, "host")),
      Option.getOrElse(() => "localhost"),
    );
    const protocol = firstValue(input.headers, "x-forwarded-proto").pipe(
      Option.getOrElse(() => "http"),
    );
    return `${protocol}://${host}`;
  });
  return { origin, rpId: new URL(origin).hostname };
};
