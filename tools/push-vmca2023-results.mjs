/**
 * Upload Ansible secureboot_ca_assessment.json into Firestore vmCa2023Results.
 * Document ID = inventory_host (VM name from inventory).
 *
 * Auth (first match wins):
 * 1) GOOGLE_APPLICATION_CREDENTIALS — service account JSON (firebase-admin)
 * 2) Firebase CLI login — reads ~/.config/configstore/firebase-tools.json (Windows: %USERPROFILE%\.config\...)
 *    OAuth: set FIREBASE_CLIENT_ID / FIREBASE_CLIENT_SECRET, or rely on installed firebase-tools (see load-firebase-cli-oauth.mjs).
 */

import "./bootstrap-env.mjs";
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  beforeCaSelectValue,
  beforeKekSelectValue,
  impactSelectValue,
  trackerStatusFromRow,
} from "./assessment-select-values.mjs";
import { getFirebaseCliOAuthCredentials } from "./load-firebase-cli-oauth.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "cert-expire-2026-ca";
const COLLECTION = "vmCa2023Results";

function mapStatus(decision) {
  const d = String(decision || "");
  if (d === "PASS_OR_LOW_RISK") return "pass";
  if (d.startsWith("IMPACTED") || d === "NON_COMPLIANT_OR_OUT_OF_SCOPE") return "fail";
  return "exception";
}

function ansibleVmDetailFromRow(a) {
  return {
    inventory_host: a.inventory_host || a.host || "",
    active_bootloader_file: a.active_bootloader_file || "",
    active_bootloader_has_2011: !!a.active_bootloader_has_2011,
    active_bootloader_has_2023: !!a.active_bootloader_has_2023,
    ca2023_alignment: a.ca2023_alignment || "",
    ca2023_summary: a.ca2023_summary || "",
  };
}

/** Full Ansible row for Firestore (variables, efi_files, bootloader_chain, …). */
function fullAssessmentRecord(a) {
  if (!a || typeof a !== "object") return {};
  try {
    return JSON.parse(JSON.stringify(a));
  } catch {
    return { ...a };
  }
}

function toUiPayload(a) {
  const inv = a.inventory_host || a.host || "unknown";
  const iso = new Date().toISOString();
  const decision = a.decision || "";
  return {
    status: mapStatus(decision),
    vmName: inv,
    esxiBuild: "",
    owner: "",
    beforeCa: beforeCaSelectValue(a),
    beforeKek: beforeKekSelectValue(a),
    afterCa: "",
    afterKek: "",
    events: `ansible ${iso} inventory=${inv} os=${a.os_family || ""}\nImpact (ansible): ${inv}: impact=${impactSelectValue(a) || "pending"} decision=${decision || "(none)"}`,
    impact: impactSelectValue(a),
    rootCause: a.root_cause || "",
    actualRemediation: a.fix || "",
    notes: [a.ca2023_alignment, a.ca2023_summary].filter(Boolean).join("\n\n"),
    evidenceImages: [],
    updatedAt: iso,
    updatedAtIso: iso,
    ansibleVmDetails: [ansibleVmDetailFromRow(a)],
    ansibleAssessment: fullAssessmentRecord(a),
  };
}

/** Firestore REST v1 Value encoding */
function encodeValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") {
    return Number.isInteger(v)
      ? { integerValue: String(v) }
      : { doubleValue: v };
  }
  if (typeof v === "string") return { stringValue: v };
  if (Array.isArray(v)) {
    return { arrayValue: { values: v.map((x) => encodeValue(x)) } };
  }
  if (typeof v === "object") {
    const fields = {};
    for (const [k, val] of Object.entries(v)) {
      if (val === undefined) continue;
      fields[k] = encodeValue(val);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(v) };
}

function toFirestoreDocumentFields(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    fields[k] = encodeValue(v);
  }
  return fields;
}

async function getAccessTokenFromFirebaseCli() {
  const configPath =
    process.env.FIREBASE_TOOLS_CONFIG ||
    join(homedir(), ".config", "configstore", "firebase-tools.json");
  if (!existsSync(configPath)) {
    throw new Error(
      `No service account (GOOGLE_APPLICATION_CREDENTIALS) and no Firebase CLI config at ${configPath}. Run: firebase login`
    );
  }
  const cfg = JSON.parse(readFileSync(configPath, "utf8"));
  const refreshToken = cfg?.tokens?.refresh_token;
  if (!refreshToken) {
    throw new Error("firebase-tools.json has no tokens.refresh_token; run: firebase login");
  }
  const { clientId, clientSecret } = getFirebaseCliOAuthCredentials();
  const { OAuth2Client } = await import("google-auth-library");
  const oauth2 = new OAuth2Client(clientId, clientSecret);
  oauth2.setCredentials({ refresh_token: refreshToken });
  const r = await oauth2.getAccessToken();
  const token = typeof r === "string" ? r : r?.token;
  if (!token) throw new Error("Could not obtain access token from Firebase CLI credentials");
  return token;
}

async function restPatchDocument(accessToken, docId, payload) {
  const fields = toFirestoreDocumentFields(payload);
  const mask = Object.keys(fields)
    .map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`)
    .join("&");
  const name = `projects/${PROJECT_ID}/databases/(default)/documents/${COLLECTION}/${docId}`;
  const url = `https://firestore.googleapis.com/v1/${name}?${mask}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Firestore PATCH ${res.status}: ${text}`);
  }
}

async function main() {
  const jsonPath =
    process.argv[2] ||
    join(__dirname, "..", "ansible", "reports", "secureboot_ca_assessment.json");

  if (!existsSync(jsonPath)) {
    console.error("Missing JSON:", jsonPath);
    process.exit(1);
  }

  const raw = readFileSync(jsonPath, "utf8");
  const rows = JSON.parse(raw);
  if (!Array.isArray(rows)) {
    console.error("Expected JSON array");
    process.exit(1);
  }

  const useServiceAccount =
    process.env.GOOGLE_APPLICATION_CREDENTIALS &&
    existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS);

  let accessToken = null;
  const admin = await import("firebase-admin");
  let db = null;

  if (useServiceAccount) {
    const serviceAccount = JSON.parse(
      readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, "utf8")
    );
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: PROJECT_ID,
      });
    }
    db = admin.firestore();
  } else {
    accessToken = await getAccessTokenFromFirebaseCli();
  }

  let n = 0;
  for (const row of rows) {
    const id = String(row.inventory_host || row.host || "").trim();
    if (!id) continue;
    const payload = toUiPayload(row);
    if (db) {
      await db.collection(COLLECTION).doc(id).set(payload, { merge: true });
    } else {
      await restPatchDocument(accessToken, id, payload);
    }
    n += 1;
    console.log("Written:", id);
  }
  console.log("Done,", n, "documents in", COLLECTION);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
