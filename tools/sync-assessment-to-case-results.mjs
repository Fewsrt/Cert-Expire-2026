/**
 * Read Firestore vmCa2023Cases + local Ansible JSON, map inventory_host -> test case id,
 * merge multi-VM rows that share one case id, PATCH vmCa2023Results/{caseId} so the web UI can see them.
 *
 * Depends on: ansible/reports/inventory-host-to-case-id.json (edit if your VM naming differs)
 * Usage: node tools/sync-assessment-to-case-results.mjs [path/to/secureboot_ca_assessment.json]
 */

import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  beforeCaSelectValue,
  beforeKekSelectValue,
  mergeBeforeSelect,
  mergeImpactSelect,
  perHostBeforeLine,
  impactSelectValue,
  perHostImpactLine,
} from "./assessment-select-values.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "cert-expire-2026-ca";
const COLLECTION = "vmCa2023Results";

const FIREBASE_CLI_CLIENT_ID =
  process.env.FIREBASE_CLIENT_ID || "563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com";
const FIREBASE_CLI_CLIENT_SECRET = process.env.FIREBASE_CLIENT_SECRET || "j9iVZfS8kkCEFUPaAeJV0sAi";

function mapStatus(decision) {
  const d = String(decision || "");
  if (d === "PASS_OR_LOW_RISK") return "pass";
  if (d.startsWith("IMPACTED") || d === "NON_COMPLIANT_OR_OUT_OF_SCOPE") return "fail";
  return "exception";
}

function rankStatus(s) {
  if (s === "fail") return 3;
  if (s === "exception") return 2;
  if (s === "pass") return 1;
  return 0;
}

function worstStatus(statuses) {
  let best = "pass";
  for (const s of statuses) {
    if (rankStatus(s) > rankStatus(best)) best = s;
  }
  return best;
}

/** Top-level fields for console/export (also in ansibleAssessments[]). */
function ansibleVmDetailFromRow(r) {
  return {
    inventory_host: r.inventory_host || r.host || "",
    active_bootloader_file: r.active_bootloader_file || "",
    active_bootloader_has_2011: !!r.active_bootloader_has_2011,
    active_bootloader_has_2023: !!r.active_bootloader_has_2023,
    ca2023_alignment: r.ca2023_alignment || "",
    ca2023_summary: r.ca2023_summary || "",
  };
}

/**
 * Persist the full Ansible assessment object (variables, efi_files, bootloader_chain, …).
 * Uses JSON round-trip so only serializable data is sent to Firestore.
 */
function fullAssessmentRecord(a) {
  if (!a || typeof a !== "object") return {};
  try {
    return JSON.parse(JSON.stringify(a));
  } catch {
    return { ...a };
  }
}

function encodeValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (typeof v === "string") return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map((x) => encodeValue(x)) } };
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
    throw new Error(`No GOOGLE_APPLICATION_CREDENTIALS and no Firebase CLI config at ${configPath}`);
  }
  const cfg = JSON.parse(readFileSync(configPath, "utf8"));
  const refreshToken = cfg?.tokens?.refresh_token;
  if (!refreshToken) throw new Error("firebase-tools.json missing refresh_token");
  const { OAuth2Client } = await import("google-auth-library");
  const oauth2 = new OAuth2Client(FIREBASE_CLI_CLIENT_ID, FIREBASE_CLI_CLIENT_SECRET);
  oauth2.setCredentials({ refresh_token: refreshToken });
  const r = await oauth2.getAccessToken();
  const token = typeof r === "string" ? r : r?.token;
  if (!token) throw new Error("No access token");
  return token;
}

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

async function listCollectionDocs(accessToken, collectionId) {
  const base = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collectionId}`;
  const out = [];
  let url = `${base}?pageSize=300`;
  while (url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    const data = await res.json();
    for (const doc of data.documents || []) {
      const id = doc.name.split("/").pop();
      out.push({ id, fields: decodeFields(doc.fields) });
    }
    url = data.nextPageToken
      ? `${base}?pageSize=300&pageToken=${encodeURIComponent(data.nextPageToken)}`
      : null;
  }
  return out;
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
  if (!res.ok) throw new Error(`Firestore PATCH ${res.status}: ${await res.text()}`);
}

function buildMergedPayload(caseId, caseMeta, rows) {
  const iso = new Date().toISOString();
  const statuses = rows.map((r) => mapStatus(r.decision));
  const hosts = rows.map((r) => r.inventory_host || r.host).filter(Boolean);
  const slims = rows.map((r) => fullAssessmentRecord(r));

  const notesBlocks = rows.map((r) => {
    const h = r.inventory_host || r.host;
    return `[${h}] ${r.ca2023_alignment || ""}\n${r.ca2023_summary || ""}\nDecision: ${r.decision || ""}`;
  });

  const eventsLines = rows.map(
    (r) => `${r.inventory_host || r.host}: ${r.decision} (${r.os_family}) ansible ${iso}`
  );
  const beforeDetail = rows.map(perHostBeforeLine).join(" | ");
  const impactDetail = rows.map(perHostImpactLine).join(" | ");

  return {
    caseId,
    caseTitle: caseMeta?.title || "",
    section: caseMeta?.section || "",
    status: worstStatus(statuses),
    vmName: hosts.join(", "),
    esxiBuild: "",
    owner: "",
    beforeCa: mergeBeforeSelect(rows.map(beforeCaSelectValue)),
    beforeKek: mergeBeforeSelect(rows.map(beforeKekSelectValue)),
    afterCa: "",
    afterKek: "",
    events: [
      eventsLines.join("\n"),
      `Before CA/KEK (ansible): ${beforeDetail}`,
      `Impact (ansible): ${impactDetail}`,
    ].join("\n"),
    impact: mergeImpactSelect(rows.map(impactSelectValue)),
    rootCause: rows.map((r) => `${r.inventory_host}: ${r.root_cause || ""}`).join("\n"),
    actualRemediation: rows.map((r) => `${r.inventory_host}: ${r.fix || ""}`).join("\n"),
    notes: [caseMeta?.purpose && `Purpose: ${caseMeta.purpose}`, ...notesBlocks].filter(Boolean).join("\n\n"),
    evidenceImages: [],
    updatedAt: iso,
    updatedAtIso: iso,
    ansibleVmDetails: rows.map(ansibleVmDetailFromRow),
    ansibleAssessment: slims[0],
    ansibleAssessments: slims,
  };
}

async function main() {
  const jsonPath =
    process.argv[2] ||
    join(__dirname, "..", "ansible", "reports", "secureboot_ca_assessment.json");
  const mapPath = join(__dirname, "..", "ansible", "reports", "inventory-host-to-case-id.json");

  if (!existsSync(jsonPath)) {
    console.error("Missing:", jsonPath);
    process.exit(1);
  }
  if (!existsSync(mapPath)) {
    console.error("Missing mapping:", mapPath);
    process.exit(1);
  }

  const rows = JSON.parse(readFileSync(jsonPath, "utf8"));
  const hostToCase = JSON.parse(readFileSync(mapPath, "utf8"));

  const byCase = new Map();
  const unmapped = [];
  for (const row of rows) {
    const host = String(row.inventory_host || row.host || "").trim();
    if (!host) continue;
    const caseId = hostToCase[host];
    if (!caseId) {
      unmapped.push(host);
      continue;
    }
    if (!byCase.has(caseId)) byCase.set(caseId, []);
    byCase.get(caseId).push(row);
  }

  if (unmapped.length) {
    console.warn("Unmapped inventory hosts (skipped):", unmapped.join(", "));
  }

  const accessToken = await getAccessTokenFromFirebaseCli();
  const cases = await listCollectionDocs(accessToken, "vmCa2023Cases");
  const caseById = new Map(cases.map((c) => [c.id, c.fields]));

  const report = { patched: [], skipped: [] };
  for (const [caseId, group] of byCase) {
    const meta = caseById.get(caseId);
    if (!meta) {
      console.warn("Unknown case id in mapping (no vmCa2023Cases doc):", caseId);
      report.skipped.push(caseId);
      continue;
    }
    const payload = buildMergedPayload(caseId, meta, group);
    await restPatchDocument(accessToken, caseId, payload);
    report.patched.push({ caseId, hosts: group.map((r) => r.inventory_host || r.host) });
    console.log("Patched vmCa2023Results/", caseId, "<-", report.patched.at(-1).hosts.join(", "));
  }

  const outReport = join(__dirname, "..", "ansible", "reports", "firestore-sync-report.json");
  writeFileSync(outReport, JSON.stringify(report, null, 2), "utf8");
  console.log("\nWrote", outReport);
  console.log("Done. Open the web app — results are keyed by test id (e.g. 1.1), not VM hostname.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
