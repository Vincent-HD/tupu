import { fromBase64Url, toBase64Url } from "./encoding.ts";

// A software passkey (ES256, "none" attestation) so tests can run the real
// WebAuthn verification on the server without a browser.

// The JSON shape navigator.credentials returns, as SimpleWebAuthn sends it.
interface Credential {
  readonly id: string;
  readonly rawId: string;
  readonly type: "public-key";
  readonly clientExtensionResults: Record<string, never>;
  readonly response: Readonly<Record<string, string | ReadonlyArray<string>>>;
}

type Cbor = number | string | Uint8Array | ReadonlyMap<number | string, Cbor>;

const head = (major: number, length: number) => {
  if (length < 24) return [(major << 5) | length];
  if (length < 256) return [(major << 5) | 24, length];
  return [(major << 5) | 25, length >> 8, length & 0xff];
};

const cbor = (value: Cbor): Array<number> => {
  if (typeof value === "number") return value >= 0 ? head(0, value) : head(1, -1 - value);
  if (typeof value === "string") {
    const bytes = new TextEncoder().encode(value);
    return [...head(3, bytes.length), ...bytes];
  }
  if (value instanceof Uint8Array) return [...head(2, value.length), ...value];
  return [
    ...head(5, value.size),
    ...[...value.entries()].flatMap(([key, item]) => [...cbor(key), ...cbor(item)]),
  ];
};

const sha256 = async (bytes: Uint8Array<ArrayBuffer>) =>
  new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));

const concat = (...parts: ReadonlyArray<Uint8Array>) => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
};

const derInteger = (raw: Uint8Array) => {
  let start = 0;
  while (start < raw.length - 1 && raw[start] === 0) start++;
  const trimmed = raw.slice(start);
  const padded = (trimmed[0] ?? 0) & 0x80 ? concat(new Uint8Array([0]), trimmed) : trimmed;
  return concat(new Uint8Array([0x02, padded.length]), padded);
};

// WebAuthn ES256 signatures are DER encoded; WebCrypto returns raw r || s.
const toDer = (raw: Uint8Array) => {
  const body = concat(derInteger(raw.slice(0, 32)), derInteger(raw.slice(32)));
  return concat(new Uint8Array([0x30, body.length]), body);
};

const flags = { userPresent: 0x01, userVerified: 0x04, attestedData: 0x40 } as const;

const clientData = (input: {
  readonly type: "webauthn.create" | "webauthn.get";
  readonly challenge: string;
  readonly origin: string;
}) =>
  new TextEncoder().encode(
    JSON.stringify({ type: input.type, challenge: input.challenge, origin: input.origin }),
  );

export const makeAuthenticator = async () => {
  const keys = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ]);
  const jwk = await crypto.subtle.exportKey("jwk", keys.publicKey);
  const credentialId = crypto.getRandomValues(new Uint8Array(16));
  const id = toBase64Url(credentialId);
  let counter = 0;

  const authenticatorData = async (rpId: string, attested: Uint8Array | null) => {
    counter += 1;
    const flagByte = flags.userPresent | flags.userVerified | (attested ? flags.attestedData : 0);
    return concat(
      await sha256(new TextEncoder().encode(rpId)),
      new Uint8Array([flagByte, 0, 0, (counter >> 8) & 0xff, counter & 0xff]),
      attested ?? new Uint8Array(),
    );
  };

  const register = async (input: {
    readonly challenge: string;
    readonly rpId: string;
    readonly origin: string;
  }): Promise<Credential> => {
    const coseKey = new Uint8Array(
      cbor(
        new Map<number, Cbor>([
          [1, 2],
          [3, -7],
          [-1, 1],
          [-2, fromBase64Url(jwk.x ?? "")],
          [-3, fromBase64Url(jwk.y ?? "")],
        ]),
      ),
    );
    const attested = concat(
      new Uint8Array(16),
      new Uint8Array([credentialId.length >> 8, credentialId.length & 0xff]),
      credentialId,
      coseKey,
    );
    const authData = await authenticatorData(input.rpId, attested);
    const attestationObject = new Uint8Array(
      cbor(
        new Map<string, Cbor>([
          ["fmt", "none"],
          ["attStmt", new Map()],
          ["authData", authData],
        ]),
      ),
    );
    return {
      id,
      rawId: id,
      type: "public-key",
      clientExtensionResults: {},
      response: {
        clientDataJSON: toBase64Url(clientData({ type: "webauthn.create", ...input })),
        attestationObject: toBase64Url(attestationObject),
        transports: ["internal"],
      },
    };
  };

  const login = async (input: {
    readonly challenge: string;
    readonly rpId: string;
    readonly origin: string;
  }): Promise<Credential> => {
    const authData = await authenticatorData(input.rpId, null);
    const data = clientData({ type: "webauthn.get", ...input });
    const signature = new Uint8Array(
      await crypto.subtle.sign(
        { name: "ECDSA", hash: "SHA-256" },
        keys.privateKey,
        concat(authData, await sha256(data)),
      ),
    );
    return {
      id,
      rawId: id,
      type: "public-key",
      clientExtensionResults: {},
      response: {
        clientDataJSON: toBase64Url(data),
        authenticatorData: toBase64Url(authData),
        signature: toBase64Url(toDer(signature)),
      },
    };
  };

  return { id, register, login };
};
