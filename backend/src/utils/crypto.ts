import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const sha256Hex = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");

/** Deterministic JSON (sorted object keys) for hashing. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as object).sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

export const randomToken = (bytes = 16) => randomBytes(bytes).toString("hex");

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Signs a JSON payload as `base64url(payload).base64url(hmac)`. */
export function signPayload(secret: string, payload: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const mac = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${mac}`;
}

/** Returns the payload only if the HMAC is valid; never throws on malformed input. */
export function verifySignedPayload<T = Record<string, unknown>>(secret: string, token: string): T | null {
  const [body, mac, extra] = token.split(".");
  if (!body || !mac || extra !== undefined) return null;
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  if (!safeEqual(mac, expected)) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

// ---- authenticated encryption for short-lived opaque tokens (AES-256-GCM, key derived from a server secret) ----
import { createCipheriv, createDecipheriv } from "node:crypto";

const deriveKey = (secret: string) => createHash("sha256").update(`securex:enc:${secret}`).digest();

/** Encrypts a JSON payload into `base64url(iv.tag.ciphertext)`; the client cannot read or forge it. */
export function encryptJson(secret: string, payload: Record<string, unknown>): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(secret), iv);
  const enc = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString("base64url");
}

export function decryptJson<T = Record<string, unknown>>(secret: string, token: string): T | null {
  try {
    const raw = Buffer.from(token, "base64url");
    if (raw.length < 29) return null;
    const decipher = createDecipheriv("aes-256-gcm", deriveKey(secret), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8")) as T;
  } catch {
    return null;
  }
}
