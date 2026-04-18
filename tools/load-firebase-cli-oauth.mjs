/**
 * OAuth client id/secret for exchanging Firebase CLI refresh tokens (same source as firebase-tools).
 * No literals in this repo: use env vars, or read from installed firebase-tools (npm install).
 */
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");

export function getFirebaseCliOAuthCredentials() {
  const fromEnv = process.env.FIREBASE_CLIENT_ID && process.env.FIREBASE_CLIENT_SECRET;
  if (fromEnv) {
    return {
      clientId: process.env.FIREBASE_CLIENT_ID,
      clientSecret: process.env.FIREBASE_CLIENT_SECRET,
    };
  }

  const apiPath = join(repoRoot, "node_modules", "firebase-tools", "lib", "api.js");
  if (!existsSync(apiPath)) {
    throw new Error(
      `Set FIREBASE_CLIENT_ID and FIREBASE_CLIENT_SECRET, or run npm install in the repo so ${apiPath} exists.`
    );
  }
  const api = require(apiPath);
  return { clientId: api.clientId(), clientSecret: api.clientSecret() };
}
