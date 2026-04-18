/**
 * List vmCa2023Cases and vmCa2023Results (document id + key fields) using Firebase CLI auth.
 * Usage: node tools/firestore-read-collections.mjs
 */

import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "cert-expire-2026-ca";

const FIREBASE_CLI_CLIENT_ID =
  process.env.FIREBASE_CLIENT_ID || "563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com";
const FIREBASE_CLI_CLIENT_SECRET = process.env.FIREBASE_CLIENT_SECRET || "j9iVZfS8kkCEFUPaAeJV0sAi";

async function getAccessToken() {
  const configPath =
    process.env.FIREBASE_TOOLS_CONFIG ||
    join(homedir(), ".config", "configstore", "firebase-tools.json");
  if (!existsSync(configPath)) throw new Error(`Missing ${configPath}`);
  const cfg = JSON.parse(readFileSync(configPath, "utf8"));
  const rt = cfg?.tokens?.refresh_token;
  if (!rt) throw new Error("No refresh_token");
  const { OAuth2Client } = await import("google-auth-library");
  const o = new OAuth2Client(FIREBASE_CLI_CLIENT_ID, FIREBASE_CLI_CLIENT_SECRET);
  o.setCredentials({ refresh_token: rt });
  const r = await o.getAccessToken();
  return typeof r === "string" ? r : r.token;
}

/** Decode Firestore REST Document to plain object (shallow + one level maps) */
function decodeFields(fields) {
  if (!fields) return {};
  const out = {};
  for (const [k, v] of Object.entries(fields)) {
    out[k] = decodeValue(v);
  }
  return out;
}

function decodeValue(v) {
  if (v.nullValue != null) return null;
  if (v.booleanValue != null) return v.booleanValue;
  if (v.integerValue != null) return v.integerValue;
  if (v.doubleValue != null) return v.doubleValue;
  if (v.stringValue != null) return v.stringValue;
  if (v.timestampValue != null) return v.timestampValue;
  if (v.arrayValue?.values) return v.arrayValue.values.map(decodeValue);
  if (v.mapValue?.fields) return decodeFields(v.mapValue.fields);
  return v;
}

async function listCollection(accessToken, collectionId, pageSize = 300) {
  const base = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collectionId}`;
  const out = [];
  let url = `${base}?pageSize=${pageSize}`;
  while (url) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    const data = await res.json();
    for (const doc of data.documents || []) {
      const id = doc.name.split("/").pop();
      out.push({
        id,
        fields: decodeFields(doc.fields),
      });
    }
    url = data.nextPageToken
      ? `${base}?pageSize=${pageSize}&pageToken=${encodeURIComponent(data.nextPageToken)}`
      : null;
  }
  return out;
}

async function main() {
  const token = await getAccessToken();
  const cases = await listCollection(token, "vmCa2023Cases");
  const results = await listCollection(token, "vmCa2023Results");

  const summary = {
    projectId: PROJECT_ID,
    casesCount: cases.length,
    resultsCount: results.length,
    caseIds: cases.map((c) => c.id),
    resultIds: results.map((r) => r.id),
    casesSample: cases.map((c) => ({
      id: c.id,
      title: c.fields?.title,
      section: c.fields?.section,
      os: c.fields?.os,
      esxi: c.fields?.esxi,
    })),
    resultsSample: results.slice(0, 5).map((r) => ({
      id: r.id,
      vmName: r.fields?.vmName,
      status: r.fields?.status,
    })),
  };

  const outPath = join(__dirname, "..", "ansible", "reports", "firestore-snapshot.json");
  writeFileSync(outPath, JSON.stringify({ cases, results: results.map((r) => ({ id: r.id, fields: r.fields })) }, null, 2), "utf8");

  console.log(JSON.stringify(summary, null, 2));
  console.error("\nFull snapshot:", outPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
