import crypto from "crypto";
import { getSettings, setSetting } from "./sheets.js";

// Owner dashboard credential. OWNER_DASHBOARD_PASSWORD bootstraps the account;
// once the owner changes their password from the dashboard, the new one lives
// in the Settings sheet as a salted scrypt hash and the env var stops working.
// Lockout recovery: delete the `owner_password_hash` row from the Settings tab
// and the env password takes over again.
const CONFIRM_SECRET = process.env.CRON_SECRET || "dev-confirm-secret";
const ENV_PASSWORD = process.env.OWNER_DASHBOARD_PASSWORD || "";

export const PASSWORD_HASH_KEY = "owner_password_hash";

const STORED_SHAPE = /^[0-9a-f]{32}:[0-9a-f]{64}$/;

function scryptHex(password, saltHex) {
  return crypto.scryptSync(String(password), Buffer.from(saltHex, "hex"), 32).toString("hex");
}

function timingSafeEqualStr(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/**
 * The credential logins are checked against right now: the stored hash if the
 * owner has set one, else the env password. Null means neither is configured.
 */
async function activeCredential() {
  const settings = await getSettings();
  const stored = (settings[PASSWORD_HASH_KEY] || "").trim();
  if (STORED_SHAPE.test(stored)) return { kind: "stored", value: stored };
  return ENV_PASSWORD ? { kind: "env", value: ENV_PASSWORD } : null;
}

/** False only when no password is configured anywhere (setup-needed state). */
export async function hasCredential() {
  return Boolean(await activeCredential());
}

export async function passwordMatches(input) {
  if (!input) return false;
  const cred = await activeCredential();
  if (!cred) return false;
  if (cred.kind === "env") return timingSafeEqualStr(input, cred.value);
  const [salt, hash] = cred.value.split(":");
  return timingSafeEqualStr(scryptHex(input, salt), hash);
}

/**
 * Session token for the HttpOnly cookie, derived from the active credential so
 * the plaintext password never lives in the browser — and so changing the
 * password signs every existing session out.
 */
export async function sessionToken() {
  const cred = await activeCredential();
  if (!cred) return null;
  return crypto
    .createHmac("sha256", CONFIRM_SECRET)
    .update(`owner-session:${cred.value}`)
    .digest("hex")
    .slice(0, 40);
}

export async function isAuthed(req) {
  const raw = req.headers?.cookie || "";
  let cookie = "";
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === "owner_session") cookie = decodeURIComponent(part.slice(i + 1).trim());
  }
  const expected = await sessionToken();
  return Boolean(expected) && timingSafeEqualStr(cookie, expected);
}

/**
 * Replaces the password. Needs the Settings sheet — without it there is nowhere
 * durable to keep the hash, so the change is refused rather than pretended.
 */
export async function setOwnerPassword(newPassword) {
  const salt = crypto.randomBytes(16).toString("hex");
  return setSetting(PASSWORD_HASH_KEY, `${salt}:${scryptHex(newPassword, salt)}`);
}
