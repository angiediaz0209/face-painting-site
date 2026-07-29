// Loads .env.local into process.env.
//
// This MUST be imported before any api/ module. ES module imports are hoisted
// and evaluated before the importing module's body runs, so loading the env
// inside api-dev-server.js was too late: modules like api/owner.js read
// process.env at module scope (OWNER_DASHBOARD_PASSWORD, CRON_SECRET) and would
// capture undefined. That's why the owner dashboard always showed
// "Setup needed" locally no matter what was in .env.local.
//
// Only used for local development; on Vercel the platform provides the env.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const envPath = path.join(path.dirname(fileURLToPath(import.meta.url)), ".env.local");

if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    // Don't clobber anything already set in the real environment.
    if (process.env[key] === undefined) process.env[key] = trimmed.slice(eq + 1).trim();
  }
  console.log("Loaded .env.local");
} else {
  console.warn("No .env.local found — API routes needing credentials will fail.");
}

// Loud warning for a footgun that costs real time: without APP_BASE_URL, the
// notification emails sent from this machine contain PRODUCTION links, but are
// signed with the local fallback secret. Production rejects them as invalid, and
// nothing about the error hints that the cause is local configuration.
if (!process.env.APP_BASE_URL) {
  console.warn(
    "WARNING: APP_BASE_URL is not set. Emails sent from here will link to the " +
      "production site but be signed with the local secret, so their approve/" +
      "decline links will always fail. Set APP_BASE_URL=http://localhost:3001."
  );
}
