/**
 * Customer / executive view: renders readinessV1 from Firestore with legacy fallback.
 */

const LEGACY_STATUS_TH = {
  pending: "ยังไม่เริ่ม",
  "in-progress": "กำลังทดสอบ",
  pass: "ผ่าน",
  fail: "ไม่ผ่าน",
  exception: "Exception",
};

const TIER_CLASS = {
  not_impacted: "tier-not-impacted",
  needs_review: "tier-needs-review",
  action_required: "tier-action-required",
};

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value == null ? "" : String(value);
  return div.innerHTML;
}

/**
 * @param {HTMLElement} container
 * @param {Array<{ id: string, section?: string, title?: string }>} casesSorted
 * @param {Record<string, Record<string, unknown>>} resultsMap
 */
export function renderCustomerReadinessView(container, casesSorted, resultsMap) {
  if (!container) return;
  container.innerHTML = "";

  if (!casesSorted.length) {
    const p = document.createElement("p");
    p.className = "empty-state";
    p.textContent = "ยังไม่มี test case ใน DB";
    container.appendChild(p);
    return;
  }

  for (const tc of casesSorted) {
    const result = resultsMap[tc.id] || {};
    const r1 = result.readinessV1;
    const article = document.createElement("article");
    article.className = "readiness-card";

    if (r1 && typeof r1 === "object" && r1.schemaVersion != null) {
      article.appendChild(buildReadinessV1Card(tc, r1));
    } else {
      article.appendChild(buildLegacyCard(tc, result));
    }
    container.appendChild(article);
  }
}

/**
 * @param {{ id: string, section?: string, title?: string }} tc
 * @param {Record<string, unknown>} r1
 */
function buildReadinessV1Card(tc, r1) {
  const wrap = document.createElement("div");
  wrap.className = "readiness-card-inner";

  const eyebrow = document.createElement("p");
  eyebrow.className = "readiness-eyebrow";
  eyebrow.textContent = `Test ${tc.id} · ${tc.section || ""}`;

  const title = document.createElement("h3");
  title.className = "readiness-title";
  title.textContent = tc.title || tc.id;

  const tier = String(r1.caseTier || "");
  const badge = document.createElement("span");
  badge.className = `readiness-tier-badge ${TIER_CLASS[tier] || ""}`;
  badge.textContent = String(r1.caseTierLabelTh || tier || "—");

  const headRow = document.createElement("div");
  headRow.className = "readiness-card-head";
  headRow.appendChild(eyebrow);
  const headRight = document.createElement("div");
  headRight.className = "readiness-card-head-right";
  headRight.appendChild(badge);
  headRow.appendChild(headRight);

  const summary = document.createElement("p");
  summary.className = "readiness-summary";
  summary.textContent = String(r1.customerSummary || "");

  wrap.appendChild(headRow);
  wrap.appendChild(title);
  wrap.appendChild(summary);

  const src = r1.sources && typeof r1.sources === "object" ? r1.sources : {};
  if (src.ansibleUpdatedAt) {
    const plain = document.createElement("p");
    plain.className = "readiness-meta";
    try {
      const d = new Date(String(src.ansibleUpdatedAt));
      plain.textContent = Number.isNaN(d.getTime())
        ? `อ้างอิงผลประเมิน: ${src.ansibleUpdatedAt}`
        : `อ้างอิงผลประเมินล่าสุด: ${d.toLocaleString()}`;
    } catch {
      plain.textContent = `อ้างอิงผลประเมิน: ${src.ansibleUpdatedAt}`;
    }
    wrap.appendChild(plain);
  }

  const hosts = Array.isArray(r1.hosts) ? r1.hosts : [];
  if (hosts.length) {
    const hostSection = document.createElement("section");
    hostSection.className = "readiness-hosts";
    const h4 = document.createElement("h4");
    h4.textContent = "รายเครื่อง";
    hostSection.appendChild(h4);

    hosts.forEach((h) => {
      hostSection.appendChild(buildHostBlock(h));
    });
    wrap.appendChild(hostSection);
  }

  return wrap;
}

/**
 * @param {Record<string, unknown>} h
 */
function buildHostBlock(h) {
  const details = document.createElement("details");
  details.className = "readiness-host-details";
  const summary = document.createElement("summary");
  const tier = String(h.tier || "");
  summary.innerHTML = `<span class="readiness-host-name">${escapeHtml(h.inventory_host)}</span> <span class="readiness-host-tier ${escapeHtml(TIER_CLASS[tier] || "")}">${escapeHtml(h.tierLabelTh || tier)}</span>`;

  const headline = document.createElement("p");
  headline.className = "readiness-host-headline";
  headline.textContent = String(h.customerHeadline || "");

  const steps = document.createElement("div");
  steps.className = "readiness-next-steps";
  const ul = document.createElement("ul");
  const next = Array.isArray(h.nextSteps) ? h.nextSteps : [];
  next.forEach((line) => {
    const li = document.createElement("li");
    li.textContent = String(line);
    ul.appendChild(li);
  });
  const stepsLabel = document.createElement("strong");
  stepsLabel.textContent = "ขั้นตอนถัดไป";
  steps.appendChild(stepsLabel);
  steps.appendChild(ul);

  const body = document.createElement("div");
  body.className = "readiness-host-body";
  body.appendChild(headline);
  if (next.length) body.appendChild(steps);

  const buckets = Array.isArray(h.actionBuckets) ? h.actionBuckets : [];
  if (buckets.length) {
    const b = document.createElement("p");
    b.className = "readiness-buckets";
    b.innerHTML = `<strong>หมวดการดำเนินการ:</strong> ${escapeHtml(buckets.join(", "))}`;
    body.appendChild(b);
  }

  const hint = h.esxi_generation_hint != null ? String(h.esxi_generation_hint) : "";
  if (hint && hint !== "unknown") {
    const p = document.createElement("p");
    p.className = "readiness-hint";
    p.textContent = `ESXi generation hint: ${hint} (ถ้า production ควรอ้างอิงข้อมูล inventory/vCenter จริง ไม่ใช่แค่ชื่อเครื่อง)`;
    body.appendChild(p);
  }

  details.appendChild(summary);
  details.appendChild(body);

  const tech = document.createElement("div");
  tech.className = "readiness-tech";
  const src = h.source && typeof h.source === "object" ? h.source : {};
  tech.innerHTML = [
    `<div><strong>decision</strong> <code>${escapeHtml(src.decision)}</code></div>`,
    `<div><strong>ca2023_alignment</strong> <code>${escapeHtml(src.ca2023_alignment)}</code></div>`,
    `<div><strong>failure_category</strong> <code>${escapeHtml(src.failure_category)}</code></div>`,
  ].join("");

  const inv = h.inventory_context && typeof h.inventory_context === "object" ? h.inventory_context : null;
  if (inv && Object.keys(inv).length) {
    const pre = document.createElement("pre");
    pre.className = "readiness-json";
    pre.textContent = JSON.stringify(inv, null, 2);
    const invLabel = document.createElement("strong");
    invLabel.textContent = "inventory_context";
    tech.appendChild(invLabel);
    tech.appendChild(pre);
  }

  details.appendChild(tech);
  return details;
}

/**
 * @param {{ id: string, section?: string, title?: string }} tc
 * @param {Record<string, unknown>} result
 */
function buildLegacyCard(tc, result) {
  const wrap = document.createElement("div");
  wrap.className = "readiness-card-inner readiness-legacy";

  const eyebrow = document.createElement("p");
  eyebrow.className = "readiness-eyebrow";
  eyebrow.textContent = `Test ${tc.id} · ${tc.section || ""}`;

  const title = document.createElement("h3");
  title.className = "readiness-title";
  title.textContent = tc.title || tc.id;

  const badge = document.createElement("span");
  badge.className = `readiness-tier-badge legacy-status-${result.status || "pending"}`;
  badge.textContent = LEGACY_STATUS_TH[result.status] || LEGACY_STATUS_TH.pending;

  const headRow = document.createElement("div");
  headRow.className = "readiness-card-head";
  headRow.appendChild(eyebrow);
  const headRight = document.createElement("div");
  headRight.className = "readiness-card-head-right";
  headRight.appendChild(badge);
  headRow.appendChild(headRight);

  const explain = document.createElement("p");
  explain.className = "readiness-legacy-msg";
  explain.textContent =
    "ยังไม่มีข้อมูล readinessV1 จากการ sync Ansible ล่าสุด — แสดงสถานะจาก Tracker เดิมด้านล่าง (หรือรอรัน node tools/sync-assessment-to-case-results.mjs)";

  const p = document.createElement("p");
  p.className = "readiness-summary";
  const snippet =
    (typeof result.notes === "string" && result.notes.trim()) ||
    (typeof result.rootCause === "string" && result.rootCause.trim()) ||
    (typeof result.actualRemediation === "string" && result.actualRemediation.trim()) ||
    "—";
  p.textContent = snippet.length > 500 ? `${snippet.slice(0, 497)}…` : snippet;

  wrap.appendChild(headRow);
  wrap.appendChild(title);
  wrap.appendChild(explain);
  wrap.appendChild(p);
  return wrap;
}
