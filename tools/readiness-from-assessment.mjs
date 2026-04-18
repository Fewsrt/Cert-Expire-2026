/**
 * Customer-facing readiness tiers from measurable Ansible fields only (no decision/ca2023_*).
 */

import { trackerStatusFromRow } from "./assessment-select-values.mjs";

/** @typedef {'not_impacted' | 'needs_review' | 'action_required'} CustomerTier */

const TIER_RANK = { not_impacted: 1, needs_review: 2, action_required: 3 };

/**
 * @param {string} hostname
 * @param {Record<string, unknown>} [inventoryContext]
 * @returns {string}
 */
export function esxiGenerationHint(hostname, inventoryContext) {
  const ctx = inventoryContext && typeof inventoryContext === "object" ? inventoryContext : {};
  const explicit = ctx.esxi_generation ?? ctx.esxi_major ?? ctx.ESXi;
  if (explicit != null && String(explicit).trim() !== "") return String(explicit).trim();
  const h = String(hostname || "").toLowerCase();
  if (/\besx8\b|esxi\s*8|esxi8/.test(h)) return "8";
  if (/\besx7\b|esxi\s*7|esxi7/.test(h)) return "7";
  return "unknown";
}

/**
 * @param {Record<string, unknown>} row
 * @returns {CustomerTier}
 */
export function getCustomerTier(row) {
  const st = trackerStatusFromRow(row);
  if (st === "pass") return "not_impacted";
  if (st === "fail") return "action_required";
  return "needs_review";
}

/**
 * @param {CustomerTier[]} tiers
 * @returns {CustomerTier}
 */
export function worstTier(tiers) {
  let best = "not_impacted";
  for (const t of tiers) {
    if ((TIER_RANK[t] ?? 0) > (TIER_RANK[best] ?? 0)) best = t;
  }
  return best;
}

const TIER_LABEL_TH = {
  not_impacted: "ความเสี่ยงต่ำ / ไม่โดนผลกระทบเชิงนโยบายชัดเจน",
  needs_review: "ต้องตรวจเพิ่ม / เก็บหลักฐาน",
  action_required: "ต้องดำเนินการตามคำแนะนำ",
};

/**
 * @param {Record<string, unknown>} row
 * @returns {string[]}
 */
function nextStepsFromRow(row) {
  const out = [];
  const hint = esxiGenerationHint(String(row.inventory_host || row.host || ""), row.inventory_context);
  const os = String(row.os_family ?? "").toLowerCase();

  if (hint === "7" && row.db_has_2023 === false) {
    out.push(
      "พิจารณาแผนโครงสร้าง: หากนโยบายองค์กรกำหนดให้ workload อยู่บน ESXi รุ่นใหม่ ให้วางแผนย้ายหรืออัปเกรด hypervisor ตามมาตรฐานที่อนุมัติ (ไม่อ้างอิงแค่ชื่อเครื่อง)"
    );
  }
  if (os === "linux" && String(row.active_bootloader_signature_method || "").includes("sbverify_not_installed")) {
    out.push("ติดตั้งแพ็กเกจ sbsigntools/sbverify จาก repo ที่อนุมัติ แล้วรันการประเมินซ้ำ");
  }
  if (os === "windows" && row.db_has_2023 === false) {
    out.push("ติดตั้ง cumulative update / Secure Boot update ตาม Microsoft แล้วรีบูตสองรอบตามแนวทางขององค์กร");
  }

  return [...new Set(out)].filter(Boolean).slice(0, 5);
}

/**
 * @param {Record<string, unknown>} row
 * @returns {string[]}
 */
function actionBucketsFromRow(row) {
  const buckets = [];
  const os = String(row.os_family ?? "").toLowerCase();
  const t = row.assessment_transport;
  if (t === "winrm_failed" || t === "ssh_failed") buckets.push("restore_transport");
  if (row.assessment_phase === "package_install") buckets.push("package_install");
  if (row.assessment_phase === "script_error" || row.assessment_phase === "report_gap") buckets.push("rerun_or_debug");
  if (row.secure_boot_enabled === false || row.db_has_2023 === false || row.kek_has_2023 === false) {
    if (os === "windows") buckets.push("windows_patch_secure_boot_update");
    if (os === "linux") buckets.push("linux_vendor_shim_grub_update");
  }
  if (String(row.active_bootloader_signature_method || "").includes("sbverify_not_installed")) buckets.push("install_sbsigntools");
  const hint = esxiGenerationHint(String(row.inventory_host || ""), row.inventory_context);
  if (hint === "7" && getCustomerTier(row) === "action_required") buckets.push("consider_hypervisor_policy");
  return [...new Set(buckets)];
}

/**
 * @param {Record<string, unknown>} row
 */
export function buildReadinessHostEntry(row) {
  const host = String(row.inventory_host || row.host || "").trim() || "?";
  const tier = getCustomerTier(row);
  const hint = esxiGenerationHint(host, row.inventory_context);
  const headline =
    tier === "not_impacted"
      ? `${host}: สถานะความพร้อมต่ำ — ติดตามอัปเดตตามปกติ`
      : tier === "action_required"
        ? `${host}: ต้องดำเนินการตามนโยบาย — ตรวจสอบ Secure Boot และ CA 2023 บน firmware/bootloader`
        : `${host}: ต้องตรวจสอบหรือเก็บหลักฐานเพิ่ม`;

  return {
    inventory_host: host,
    tier,
    tierLabelTh: TIER_LABEL_TH[tier],
    customerHeadline: headline,
    nextSteps: nextStepsFromRow(row),
    actionBuckets: actionBucketsFromRow(row),
    esxi_generation_hint: hint,
    inventory_context: row.inventory_context && typeof row.inventory_context === "object" ? row.inventory_context : {},
    source: {
      secure_boot_enabled: row.secure_boot_enabled,
      db_has_2023: row.db_has_2023,
      kek_has_2023: row.kek_has_2023,
      active_bootloader_signature_method: row.active_bootloader_signature_method ?? "",
    },
  };
}

/**
 * @param {Record<string, unknown>[]} rows — hosts merged for one case id
 * @param {string} caseId
 * @param {string} [updatedAtIso]
 */
export function buildCaseReadinessV1(rows, caseId, updatedAtIso) {
  const hosts = rows.map((r) => buildReadinessHostEntry(r));
  const tiers = hosts.map((h) => h.tier);
  const caseTier = worstTier(tiers);
  const iso = updatedAtIso || new Date().toISOString();

  const headline =
    caseTier === "not_impacted"
      ? `Test ${caseId}: กลุ่มนี้ไม่พบช่องว่างนโยบายหลักที่ต้องแก้ด่วน (ตามผลล่าสุด)`
      : caseTier === "action_required"
        ? `Test ${caseId}: มีเครื่องที่ต้องดำเนินการตาม remediation ก่อน Cert-Expire / CA 2023 rollout`
        : `Test ${caseId}: มีเครื่องที่ต้องเก็บหลักฐานเพิ่มหรือแก้การเชื่อมต่อก่อนสรุปผลให้ลูกค้า`;

  return {
    schemaVersion: 1,
    caseId,
    caseTier,
    caseTierLabelTh: TIER_LABEL_TH[caseTier],
    customerSummary: headline,
    hosts,
    sources: {
      ansibleUpdatedAt: iso,
      generator: "readiness-from-assessment.mjs",
    },
  };
}
