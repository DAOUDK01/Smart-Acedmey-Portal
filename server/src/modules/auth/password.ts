import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const KEY_LENGTH = 64;
const PREFIX = "scrypt";
const LEGACY_SHA256 = /^[0-9a-f]{64}$/;

/** Salted, memory-hard password hash: `scrypt$<salt>$<hash>` (base64). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, KEY_LENGTH);
  return `${PREFIX}$${salt.toString("base64")}$${derived.toString("base64")}`;
}

function safeEqual(a: Buffer, b: Buffer) {
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Checks a password against a stored hash. Accounts created before salted hashing
 * hold an unsalted SHA-256 hex digest; those still verify, and `upgrade` carries a
 * fresh hash the caller should persist so the account moves to scrypt.
 */
export async function verifyPassword(
  password: string,
  stored: string | null | undefined,
): Promise<{ valid: boolean; upgrade?: string }> {
  if (!stored) return { valid: false };

  if (stored.startsWith(`${PREFIX}$`)) {
    const [, salt, hash] = stored.split("$");
    if (!salt || !hash) return { valid: false };
    const derived = await scrypt(password, Buffer.from(salt, "base64"), KEY_LENGTH);
    return { valid: safeEqual(derived, Buffer.from(hash, "base64")) };
  }

  if (LEGACY_SHA256.test(stored)) {
    const digest = createHash("sha256").update(password).digest();
    if (!safeEqual(digest, Buffer.from(stored, "hex"))) return { valid: false };
    return { valid: true, upgrade: await hashPassword(password) };
  }

  return { valid: false };
}
