/**
 * Map Ansible assessment rows to form <select> values.
 * Before CA/KEK: public/index.html — "", "true", "false", "na"
 * Impact: public/index.html — "", "no", "yes"
 */

export function getDbVar(row) {
  const v = row.variables;
  if (!v) return null;
  return v.db ?? v.DB ?? null;
}

export function getKekVar(row) {
  const v = row.variables;
  if (!v) return null;
  return v.kek ?? v.KEK ?? null;
}

/** Single host: db UEFI CA 2023 present in firmware db (assessment heuristic). */
export function beforeCaSelectValue(row) {
  const db = getDbVar(row);
  if (db && db.readable === false) return "na";
  return row.db_has_2023 === true ? "true" : "false";
}

/** Single host: KEK 2K CA 2023 present in KEK variable. */
export function beforeKekSelectValue(row) {
  const kek = getKekVar(row);
  if (kek && kek.readable === false) return "na";
  return row.kek_has_2023 === true ? "true" : "false";
}

/** Multiple hosts on one test case: any unreadable db/kek => na; else all true => true; else false. */
export function mergeBeforeSelect(vals) {
  const v = vals.filter((x) => x !== "");
  if (!v.length) return "";
  if (v.some((x) => x === "na")) return "na";
  if (v.every((x) => x === "true")) return "true";
  return "false";
}

export function perHostBeforeLine(row) {
  const h = row.inventory_host || row.host || "?";
  return `${h}: CA2023=${beforeCaSelectValue(row)} KEK2023=${beforeKekSelectValue(row)}`;
}

/**
 * pass | fail | exception — derived only from measurable Ansible fields (no decision/ca2023_* in JSON).
 */
export function trackerStatusFromRow(row) {
  const t = row.assessment_transport;
  if (t === "winrm_failed" || t === "ssh_failed") return "exception";
  const ph = row.assessment_phase;
  if (ph === "package_install" || ph === "script_error" || ph === "report_gap") return "exception";

  if (row.secure_boot_enabled === false) return "fail";
  if (row.db_has_2023 === false || row.kek_has_2023 === false) return "fail";

  const method = String(row.active_bootloader_signature_method || "");
  if (method === "sbverify_not_installed" || method === "sbverify_failed" || method === "unreadable") {
    return "exception";
  }

  const os = String(row.os_family || "").toLowerCase();
  if (!row.active_bootloader_file && os === "linux") return "fail";

  if (row.active_bootloader_has_2011 === true && row.active_bootloader_has_2023 === false) {
    return "fail";
  }

  if (row.active_bootloader_has_2023 === true) return "pass";

  if (method === "sbverify" || method === "windows_authenticode") return "exception";

  return "exception";
}

/** Operational impact for UI — from technical fields only. */
export function impactSelectValue(row) {
  const t = row.assessment_transport;
  if (t === "winrm_failed" || t === "ssh_failed") return "yes";
  const ph = row.assessment_phase;
  if (ph === "package_install" || ph === "script_error" || ph === "report_gap") return "yes";
  if (row.secure_boot_enabled === false) return "yes";
  if (row.db_has_2023 === false || row.kek_has_2023 === false) return "yes";
  if (row.active_bootloader_has_2011 === true && row.active_bootloader_has_2023 === false) return "yes";
  if (!row.active_bootloader_file && String(row.os_family || "").toLowerCase() === "linux") return "yes";
  return "no";
}

/** Multiple VMs: any yes → yes; else all no → no; otherwise unset (pending / mixed review). */
export function mergeImpactSelect(vals) {
  if (!vals.length) return "";
  if (vals.some((x) => x === "yes")) return "yes";
  if (vals.every((x) => x === "no")) return "no";
  return "";
}

export function perHostImpactLine(row) {
  const h = row.inventory_host || row.host || "?";
  const st = trackerStatusFromRow(row);
  return `${h}: impact=${impactSelectValue(row) || "pending"} compliance=${st}`;
}
