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

/** Operational/compliance impact from assessment decision → UI Impact field. */
export function impactSelectValue(row) {
  const d = String(row.decision || "").trim();
  if (!d) return "";
  if (d === "PASS_OR_LOW_RISK") return "no";
  if (d.startsWith("IMPACTED")) return "yes";
  if (d === "NON_COMPLIANT_OR_OUT_OF_SCOPE") return "yes";
  return "";
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
  const raw = String(row.decision || "").trim() || "(none)";
  return `${h}: impact=${impactSelectValue(row) || "pending"} decision=${raw}`;
}
