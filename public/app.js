const STORAGE_KEY = "vm-ca2023-results";
const CONFIG_KEY = "vm-ca2023-firebase-config";
const COLLECTION_NAME = "vmCa2023Results";

const statusLabels = {
  pending: "ยังไม่เริ่ม",
  "in-progress": "กำลังทดสอบ",
  pass: "ผ่าน",
  fail: "ไม่ผ่าน",
  exception: "Exception"
};

const CASES_COLLECTION_NAME = "vmCa2023Cases";
const CASES_STORAGE_KEY = "vm-ca2023-cases";
const REPORT_FIELDS = [
  "inventory_host",
  "os_family",
  "esxi_version",
  "secure_boot_enabled",
  "db_has_2011",
  "db_has_2023",
  "kek_has_2023",
  "dbx_readable",
  "active_bootloader_file",
  "active_bootloader_has_2011",
  "active_bootloader_has_2023",
  "active_bootloader_signature_method"
];

let cases = loadLocalCases();
let editingCaseId = null;
let unsubscribeCases = null;

let activeFilter = "all";
let activeView = "tests";
let searchTerm = "";
let firebaseApi = null;
let unsubscribe = null;
let results = loadLocalResults();
let csvRows = [];

const elements = {
  testsView: document.querySelector("#tests-view"),
  summaryView: document.querySelector("#summary-view"),
  list: document.querySelector("#case-list"),
  template: document.querySelector("#case-template"),
  total: document.querySelector("#metric-total"),
  pass: document.querySelector("#metric-pass"),
  fail: document.querySelector("#metric-fail"),
  impact: document.querySelector("#metric-impact"),
  sync: document.querySelector("#sync-state"),
  caseForm: document.querySelector("#case-form"),
  caseFormMode: document.querySelector("#case-form-mode"),
  cancelCaseEdit: document.querySelector("#cancel-case-edit"),
  configInput: document.querySelector("#firebase-config-input"),
  saveConfig: document.querySelector("#save-config"),
  clearConfig: document.querySelector("#clear-config"),
  search: document.querySelector("#search-input"),
  csvInput: document.querySelector("#csv-input"),
  csvImportDialog: document.querySelector("#csv-import-dialog"),
  csvImportPanel: document.querySelector("#csv-import-panel"),
  csvImportSummary: document.querySelector("#csv-import-summary"),
  csvImportList: document.querySelector("#csv-import-list"),
  saveCsvImport: document.querySelector("#save-csv-import"),
  cancelCsvImport: document.querySelector("#cancel-csv-import"),
  exportJson: document.querySelector("#export-json"),
  resetLocal: document.querySelector("#reset-local"),
  resetAll: document.querySelector("#reset-all"),
  summaryHeadline: document.querySelector("#summary-headline"),
  summaryPercent: document.querySelector("#summary-percent"),
  summaryCoverage: document.querySelector("#summary-coverage"),
  summaryPass: document.querySelector("#summary-pass"),
  summaryFail: document.querySelector("#summary-fail"),
  summaryImpact: document.querySelector("#summary-impact"),
  platformSummary: document.querySelector("#platform-summary"),
  keyFindings: document.querySelector("#key-findings"),
  summaryCaseCards: document.querySelector("#summary-case-cards")
};

init();

function init() {
  wireEvents();
  render();
  connectFirebase();
}

function wireEvents() {
  document.querySelectorAll(".nav-tab").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".nav-tab").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      activeView = button.dataset.view;
      switchView();
    });
  });

  document.querySelectorAll(".filter").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".filter").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      activeFilter = button.dataset.filter;
      render();
    });
  });

  elements.search.addEventListener("input", (event) => {
    searchTerm = event.target.value.trim().toLowerCase();
    render();
  });

  elements.csvInput.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await loadCsvFile(file);
    event.target.value = "";
  });

  elements.saveCsvImport.addEventListener("click", async () => {
    await saveCsvImport();
  });

  elements.cancelCsvImport.addEventListener("click", () => {
    clearCsvImport();
  });

  elements.csvImportDialog.addEventListener("click", (event) => {
    if (event.target === elements.csvImportDialog) clearCsvImport();
  });
  elements.csvImportDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    clearCsvImport();
  });

  if (elements.caseForm) {
    elements.caseForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      await saveCaseFromForm();
    });
  }

  if (elements.cancelCaseEdit) {
    elements.cancelCaseEdit.addEventListener("click", () => {
      clearCaseForm();
    });
  }

  if (elements.saveConfig) {
    elements.saveConfig.addEventListener("click", () => {
      try {
        const value = JSON.parse(elements.configInput.value);
        localStorage.setItem(CONFIG_KEY, JSON.stringify(value));
        window.location.reload();
      } catch (error) {
        alert("Firebase config ต้องเป็น JSON ที่ถูกต้อง");
      }
    });
  }

  if (elements.clearConfig) {
    elements.clearConfig.addEventListener("click", () => {
      localStorage.removeItem(CONFIG_KEY);
      window.location.reload();
    });
  }

  elements.exportJson.addEventListener("click", () => {
    const payload = JSON.stringify(results, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "vm-ca2023-results.json";
    link.click();
    URL.revokeObjectURL(url);
  });

  elements.resetLocal.addEventListener("click", () => {
    if (!confirm("ล้าง local results ใน browser นี้? ข้อมูลใน Firestore จะไม่ถูกลบ")) return;
    localStorage.removeItem(STORAGE_KEY);
    results = {};
    render();
  });

  elements.resetAll.addEventListener("click", async () => {
    const firstConfirm = confirm("ต้องการล้างผลทดสอบทั้งหมดจาก Firestore และ local browser ใช่ไหม?");
    if (!firstConfirm) return;
    const secondConfirm = prompt('พิมพ์ RESET เพื่อยืนยันการล้างข้อมูลทั้งหมด');
    if (secondConfirm !== "RESET") return;
    await resetAllResults();
  });

}

/**
 * Keep report fields from Ansible when the user saves manual fields.
 */
function pickPreservedAnsibleFields(previous) {
  if (!previous || typeof previous !== "object") return {};
  const out = {};
  REPORT_FIELDS.forEach((field) => {
    if (Object.hasOwn(previous, field)) out[field] = previous[field];
  });
  return out;
}

function render() {
  const visibleCases = filterCases();
  elements.list.innerHTML = "";
  if (!cases.length) {
    const empty = document.createElement("article");
    empty.className = "case-card";
    empty.innerHTML = "<p class=\"empty-state\">ยังไม่มี test case ใน DB กดสร้าง test case ใหม่ด้านบน</p>";
    elements.list.appendChild(empty);
  } else if (!visibleCases.length) {
    const empty = document.createElement("article");
    empty.className = "case-card";
    empty.innerHTML = "<p class=\"empty-state\">ไม่พบ test case ตาม filter/search ที่เลือก</p>";
    elements.list.appendChild(empty);
  } else {
    visibleCases.forEach((testCase) => elements.list.appendChild(renderCase(testCase)));
  }
  renderMetrics();
  renderSummary();
  switchView();
}

function renderCase(testCase) {
  const fragment = elements.template.content.cloneNode(true);
  const card = fragment.querySelector(".case-card");
  const result = results[testCase.id] || defaultResult();
  const badge = fragment.querySelector(".badge");

  fragment.querySelector(".case-id").textContent = `Test ${testCase.id} · ${testCase.section}`;
  fragment.querySelector("h2").textContent = testCase.title;
  fragment.querySelector(".purpose").textContent = testCase.purpose;
  badge.textContent = statusLabels[result.status] || statusLabels.pending;
  badge.className = `badge ${result.status || "pending"}`;

  const heading = fragment.querySelector(".case-heading");
  const actions = document.createElement("div");
  actions.className = "case-actions";
  actions.appendChild(makeCaseActionButton("โหลด script รวม", "secondary", () => downloadCaseScript(testCase)));
  actions.appendChild(badge);
  heading.appendChild(actions);

  const meta = fragment.querySelector(".case-meta");
  [
    `OS: ${testCase.os}`,
    `ESXi: ${testCase.esxi}`,
    `Firmware: ${testCase.firmware}`,
    `Secure Boot: ${testCase.secureBoot}`,
    `vTPM: ${testCase.vtpm}`,
    `Encryption: ${testCase.encryption}`
  ].forEach((item) => {
    const span = document.createElement("span");
    span.textContent = item;
    meta.appendChild(span);
  });

  fillList(fragment.querySelector(".steps"), testCase.steps);
  fillList(fragment.querySelector(".expected"), testCase.expected);
  fillList(fragment.querySelector(".remediation"), testCase.remediation);
  fillCommands(fragment.querySelector(".commands"), getCaseCommands(testCase), testCase);

  const form = fragment.querySelector(".result-form");

  Object.entries(result).forEach(([key, value]) => {
    const field = form.elements[key];
    if (field && field.type !== "file") field.value = value || "";
  });
  renderReportFields(fragment, result, testCase);

  fragment.querySelector(".updated-at").textContent = result.updatedAt
    ? `บันทึกล่าสุด: ${formatDate(result.updatedAt)}`
    : "ยังไม่บันทึก";

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const nextResult = {
      ...pickPreservedAnsibleFields(result),
      caseId: testCase.id,
      caseTitle: testCase.title,
      section: testCase.section,
      status: formData.get("status") || "pending",
      rootCause: formData.get("rootCause") || "",
      actualRemediation: formData.get("actualRemediation") || "",
      notes: formData.get("notes") || "",
      updatedAt: new Date().toISOString()
    };

    await saveResult(testCase.id, nextResult);
    results[testCase.id] = nextResult;
    saveLocalResults(results);
    render();
  });

  card.dataset.caseId = testCase.id;
  return fragment;
}

function makeCaseActionButton(label, className, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

async function loadCsvFile(file) {
  try {
    const text = await file.text();
    csvRows = parseCsv(text).map((row, index) => ({
      index,
      data: normalizeCsvReportRow(row),
      selectedCaseId: guessCaseId(row),
    }));
    renderCsvImport();
  } catch (error) {
    console.error(error);
    alert(`อ่าน CSV ไม่สำเร็จ: ${error.message}`);
  }
}

function renderCsvImport() {
  elements.csvImportList.innerHTML = "";
  elements.csvImportPanel.hidden = csvRows.length === 0;
  elements.csvImportSummary.textContent = `พบ ${csvRows.length} แถวจาก CSV`;
  if (csvRows.length && !elements.csvImportDialog.open) {
    elements.csvImportDialog.showModal();
  }
  if (!csvRows.length && elements.csvImportDialog.open) {
    elements.csvImportDialog.close();
  }

  csvRows.forEach((item) => {
    const row = document.createElement("article");
    row.className = "csv-map-row";

    const select = document.createElement("select");
    select.innerHTML = [
      "<option value=\"\">ไม่บันทึกแถวนี้</option>",
      ...cases.map((testCase) => {
        const selected = item.selectedCaseId === testCase.id ? " selected" : "";
        return `<option value="${escapeHtml(testCase.id)}"${selected}>${escapeHtml(testCase.id)} · ${escapeHtml(testCase.title)}</option>`;
      }),
    ].join("");
    select.addEventListener("change", () => {
      item.selectedCaseId = select.value;
    });

    row.innerHTML = `
      <div class="csv-cell csv-host">
        <span>inventory_host</span>
        <strong>${escapeHtml(item.data.inventory_host || "—")}</strong>
      </div>
      <div class="csv-cell">
        <span>os_family</span>
        <strong>${escapeHtml(formatOsFamily(item.data.os_family))}</strong>
      </div>
      <div class="csv-cell">
        <span>ESXi version</span>
        <strong>${escapeHtml(item.data.esxi_version || "—")}</strong>
      </div>
      <div class="csv-cell">
        <span>Secure Boot</span>
        <strong>${escapeHtml(formatBooleanThai(item.data.secure_boot_enabled, "secureBoot").label)}</strong>
      </div>
      <div class="csv-cell">
        <span>DB 2011 / 2023</span>
        <strong>${escapeHtml(formatBooleanThai(item.data.db_has_2011).label)} / ${escapeHtml(formatBooleanThai(item.data.db_has_2023).label)}</strong>
      </div>
      <div class="csv-cell">
        <span>Bootloader 2011 / 2023</span>
        <strong>${escapeHtml(formatBooleanThai(item.data.active_bootloader_has_2011).label)} / ${escapeHtml(formatBooleanThai(item.data.active_bootloader_has_2023).label)}</strong>
      </div>
      <label class="csv-case-select">
        <span>Test case</span>
      </label>
    `;
    row.querySelector(".csv-case-select").appendChild(select);
    elements.csvImportList.appendChild(row);
  });
}

async function saveCsvImport() {
  const selected = csvRows.filter((item) => item.selectedCaseId);
  if (!selected.length) {
    alert("กรุณาเลือก test case อย่างน้อย 1 แถว");
    return;
  }

  try {
    setSync("กำลังบันทึก CSV ลง Firestore");
    for (const item of selected) {
      const current = results[item.selectedCaseId] || defaultResult();
      const testCase = cases.find((caseItem) => caseItem.id === item.selectedCaseId);
      const payload = {
        ...defaultResult(),
        ...item.data,
        caseId: item.selectedCaseId,
        caseTitle: testCase?.title || current.caseTitle || "",
        section: testCase?.section || current.section || "",
        rootCause: current.rootCause || "",
        actualRemediation: current.actualRemediation || "",
        notes: current.notes || "",
        status: current.status || "pending",
        updatedAt: new Date().toISOString(),
      };
      await saveResult(item.selectedCaseId, payload);
      results[item.selectedCaseId] = payload;
    }
    saveLocalResults(results);
    clearCsvImport();
    render();
    setSync(firebaseApi ? "บันทึก CSV แล้ว และ Firestore sync อัตโนมัติ" : "บันทึก CSV ใน local browser แล้ว");
  } catch (error) {
    console.error(error);
    alert(`บันทึก CSV ไม่สำเร็จ: ${error.message}`);
    setSync(`บันทึก CSV ไม่สำเร็จ: ${error.message}`);
  }
}

function clearCsvImport() {
  csvRows = [];
  elements.csvImportList.innerHTML = "";
  elements.csvImportPanel.hidden = true;
  elements.csvImportSummary.textContent = "";
  if (elements.csvImportDialog.open) elements.csvImportDialog.close();
}

function normalizeCsvReportRow(row) {
  const out = {};
  REPORT_FIELDS.forEach((field) => {
    if (field === "esxi_version") {
      out[field] = String(row.esxi_version ?? row.esxi ?? row.esxi_build ?? row.vmware_esxi_version ?? "").trim();
      return;
    }
    out[field] = ["secure_boot_enabled", "db_has_2011", "db_has_2023", "kek_has_2023", "dbx_readable", "active_bootloader_has_2011", "active_bootloader_has_2023"].includes(field)
      ? normalizeBooleanValue(row[field])
      : String(row[field] ?? "").trim();
  });
  return out;
}

function guessCaseId(row) {
  const explicitCaseId = String(row.caseId || row.case_id || row.testCaseId || row.test_case || "").trim();
  if (cases.some((testCase) => testCase.id === explicitCaseId)) return explicitCaseId;
  const host = String(row.inventory_host || "").trim();
  if (cases.some((testCase) => testCase.id === host)) return host;
  const hostLower = host.toLowerCase();
  const matched = cases.find((testCase) => {
    const haystack = [testCase.id, testCase.title, testCase.section, testCase.os, testCase.esxi].join(" ").toLowerCase();
    return hostLower && haystack.includes(hostLower);
  });
  return matched?.id || "";
}

function parseCsv(text) {
  const rows = [];
  let current = [];
  let value = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === "\"") {
      if (inQuotes && next === "\"") {
        value += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      current.push(value);
      value = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      current.push(value);
      rows.push(current);
      current = [];
      value = "";
    } else {
      value += char;
    }
  }
  current.push(value);
  rows.push(current);

  const [headerRow, ...dataRows] = rows.filter((row) => row.some((cell) => String(cell).trim()));
  if (!headerRow) return [];
  const headers = headerRow.map((header, index) => {
    const text = String(header).trim();
    return index === 0 ? text.replace(/^\uFEFF/, "") : text;
  });
  return dataRows.map((row) => {
    const item = {};
    headers.forEach((header, index) => {
      item[header] = row[index] ?? "";
    });
    return item;
  });
}

function renderReportFields(fragment, result, testCase) {
  const report = getReportSource(result);
  setReportText(fragment, "inventory_host", report.inventory_host || result.vmName || testCase.id);
  setReportText(fragment, "os_family", formatOsFamily(report.os_family || testCase.os));
  setReportText(fragment, "esxi_version", report.esxi_version || testCase.esxi);
  setReportBool(fragment, "secure_boot_enabled", report.secure_boot_enabled, "secureBoot");
  setReportBool(fragment, "db_has_2011", report.db_has_2011, "cert");
  setReportBool(fragment, "db_has_2023", report.db_has_2023, "cert");
  setReportBool(fragment, "kek_has_2023", report.kek_has_2023, "cert");
  setReportBool(fragment, "dbx_readable", report.dbx_readable, "readable");
  setReportText(fragment, "active_bootloader_file", report.active_bootloader_file);
  setReportBool(fragment, "active_bootloader_has_2011", report.active_bootloader_has_2011, "cert");
  setReportBool(fragment, "active_bootloader_has_2023", report.active_bootloader_has_2023, "cert");
  setReportText(fragment, "active_bootloader_signature_method", report.active_bootloader_signature_method);
}

function getReportSource(result) {
  return result || {};
}

function setReportText(fragment, field, value) {
  const element = fragment.querySelector(`[data-report-field="${field}"]`);
  if (!element) return;
  element.textContent = value && String(value).trim() ? String(value) : "ยังไม่มีข้อมูล";
  element.className = value && String(value).trim() ? "report-value" : "report-value empty";
}

function setReportBool(fragment, field, value, type) {
  const element = fragment.querySelector(`[data-report-field="${field}"]`);
  if (!element) return;
  const display = formatBooleanThai(value, type);
  element.textContent = display.label;
  element.className = `report-value ${display.className}`;
}

function formatBooleanThai(value, type = "cert") {
  const normalized = normalizeBooleanValue(value);
  if (normalized === true) {
    return {
      label: type === "secureBoot" ? "เปิดใช้งาน" : type === "readable" ? "อ่านได้" : "พบ",
      className: "true"
    };
  }
  if (normalized === false) {
    return {
      label: type === "secureBoot" ? "ปิดอยู่" : type === "readable" ? "อ่านไม่ได้" : "ไม่พบ",
      className: "false"
    };
  }
  return {
    label: "ยังไม่มีข้อมูล",
    className: "empty"
  };
}

function normalizeBooleanValue(value) {
  if (value === true || value === false) return value;
  const text = String(value ?? "").trim().toLowerCase();
  if (["true", "yes", "y", "1", "on", "enabled"].includes(text)) return true;
  if (["false", "no", "n", "0", "off", "disabled"].includes(text)) return false;
  return "";
}

function formatOsFamily(value) {
  const text = String(value || "").trim();
  if (!text) return "ยังไม่มีข้อมูล";
  if (/windows/i.test(text)) return "Windows";
  if (/linux|ubuntu|rhel|sles|suse|rocky|alma|oracle/i.test(text)) return "Linux";
  return text;
}

function getCaseCommands(testCase) {
  return (testCase.commands && testCase.commands.length) ? testCase.commands : getCommands(testCase);
}

function downloadCaseScript(testCase) {
  const commands = getCaseCommands(testCase);
  const isWindows = /Windows/i.test(testCase.os || "");
  const extension = isWindows ? "ps1" : "sh";
  const script = isWindows ? buildPowerShellScript(testCase, commands) : buildShellScript(testCase, commands);
  const fileName = `${sanitizeFileName(`${testCase.id}-${testCase.os || "vm"}-${testCase.esxi || "esxi"}`)}.${extension}`;
  downloadTextFile(fileName, isWindows ? `\uFEFF${script}` : script, isWindows ? "text/plain;charset=utf-8" : "text/x-shellscript;charset=utf-8");
}

function editCase(testCase) {
  editingCaseId = testCase.id;
  elements.caseForm.elements.caseId.value = testCase.id || "";
  elements.caseForm.elements.caseId.disabled = true;
  elements.caseForm.elements.section.value = testCase.section || "";
  elements.caseForm.elements.title.value = testCase.title || "";
  elements.caseForm.elements.order.value = testCase.order || "";
  elements.caseForm.elements.purpose.value = testCase.purpose || "";
  elements.caseForm.elements.os.value = testCase.os || "";
  elements.caseForm.elements.esxi.value = testCase.esxi || "";
  elements.caseForm.elements.firmware.value = testCase.firmware || "";
  elements.caseForm.elements.secureBoot.value = testCase.secureBoot || "";
  elements.caseForm.elements.vtpm.value = testCase.vtpm || "";
  elements.caseForm.elements.encryption.value = testCase.encryption || "";
  elements.caseForm.elements.steps.value = (testCase.steps || []).join("\n");
  elements.caseForm.elements.expected.value = (testCase.expected || []).join("\n");
  elements.caseForm.elements.remediation.value = (testCase.remediation || []).join("\n");
  elements.caseForm.elements.commands.value = serializeCommands((testCase.commands && testCase.commands.length) ? testCase.commands : getCommands(testCase));
  elements.caseFormMode.textContent = `กำลังแก้ไข ${testCase.id}`;
  elements.caseForm.closest("details").open = true;
  elements.caseForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function clearCaseForm() {
  editingCaseId = null;
  elements.caseForm.reset();
  elements.caseForm.elements.caseId.disabled = false;
  elements.caseFormMode.textContent = "สร้าง test case ใหม่";
}

async function saveCaseFromForm() {
  const formData = new FormData(elements.caseForm);
  const rawId = editingCaseId || formData.get("caseId") || `case-${Date.now()}`;
  const id = sanitizeCaseId(rawId);
  const payload = {
    id,
    section: formData.get("section") || "",
    title: formData.get("title") || "",
    order: Number(formData.get("order")) || cases.length + 1,
    purpose: formData.get("purpose") || "",
    os: formData.get("os") || "",
    esxi: formData.get("esxi") || "",
    firmware: formData.get("firmware") || "",
    secureBoot: formData.get("secureBoot") || "",
    vtpm: formData.get("vtpm") || "",
    encryption: formData.get("encryption") || "",
    steps: parseLines(formData.get("steps")),
    expected: parseLines(formData.get("expected")),
    remediation: parseLines(formData.get("remediation")),
    commands: parseCommands(formData.get("commands")),
    updatedAt: new Date().toISOString()
  };

  if (!payload.section || !payload.title) {
    alert("กรุณาใส่ Section และ Title");
    return;
  }

  if (firebaseApi) {
    const ref = firebaseApi.doc(firebaseApi.db, CASES_COLLECTION_NAME, id);
    await firebaseApi.setDoc(ref, payload, { merge: true });
  }
  cases = upsertCase(cases, payload);
  saveLocalCases(cases);
  clearCaseForm();
  render();
}

async function deleteCase(caseId) {
  const ok = confirm(`ลบ test case ${caseId} และผลลัพธ์ของ case นี้?`);
  if (!ok) return;

  if (firebaseApi) {
    const caseRef = firebaseApi.doc(firebaseApi.db, CASES_COLLECTION_NAME, caseId);
    const resultRef = firebaseApi.doc(firebaseApi.db, COLLECTION_NAME, caseId);
    await Promise.all([
      firebaseApi.deleteDoc(caseRef),
      firebaseApi.deleteDoc(resultRef)
    ]);
  }
  cases = cases.filter((item) => item.id !== caseId);
  delete results[caseId];
  saveLocalCases(cases);
  saveLocalResults(results);
  render();
}

function fillList(container, items) {
  items.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    container.appendChild(li);
  });
}

function fillCommands(container, commands, testCase) {
  container.innerHTML = "";
  if (!commands.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "ยังไม่มี command สำหรับ case นี้";
    container.appendChild(empty);
    return;
  }
  commands.forEach((item) => {
    const box = document.createElement("div");
    box.className = "command-box";
    const downloadButton = document.createElement("button");
    downloadButton.type = "button";
    downloadButton.className = "secondary command-download";
    downloadButton.textContent = "โหลด command นี้";
    downloadButton.addEventListener("click", () => downloadSingleCommandScript(testCase, item));
    box.innerHTML = `
      <strong>${escapeHtml(item.label)}</strong>
      ${item.description ? `<p>${escapeHtml(item.description)}</p>` : ""}
      <pre><code>${escapeHtml(item.code)}</code></pre>
    `;
    box.appendChild(downloadButton);
    container.appendChild(box);
  });
}

function downloadSingleCommandScript(testCase, command) {
  const isWindows = /Windows/i.test(testCase.os || "");
  const extension = isWindows ? "ps1" : "sh";
  const commands = [command];
  const script = isWindows ? buildPowerShellScript(testCase, commands) : buildShellScript(testCase, commands);
  const fileName = `${sanitizeFileName(`${testCase.id}-${command.label || "command"}`)}.${extension}`;
  downloadTextFile(fileName, isWindows ? `\uFEFF${script}` : script, isWindows ? "text/plain;charset=utf-8" : "text/x-shellscript;charset=utf-8");
}

function buildPowerShellScript(testCase, commands) {
  const title = `Test ${testCase.id} - ${testCase.section} - ${testCase.title}`;
  const sections = commands.map((item) => {
    return `Write-ResultSection -Name ${quotePowerShellString(item.label || "Command")} -Block {\n${item.code || ""}\n}`;
  }).join("\n\n");

  return `# ${title}
# Run as Administrator on the target Windows VM.
# This script writes command results only to a timestamped TXT report next to this script.

$ErrorActionPreference = "Continue"
$ReportPath = Join-Path $PSScriptRoot (${quotePowerShellString(sanitizeFileName(`${testCase.id}-report`))} + "-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".txt")

function Write-ResultSection {
  param(
    [string]$Name,
    [scriptblock]$Block
  )

  "===== $Name =====" | Out-File -FilePath $ReportPath -Encoding UTF8 -Append
  try {
    & $Block *>&1 | Out-File -FilePath $ReportPath -Encoding UTF8 -Append
  } catch {
    $_ | Out-File -FilePath $ReportPath -Encoding UTF8 -Append
  }
  "" | Out-File -FilePath $ReportPath -Encoding UTF8 -Append
}

"${escapeForPowerShellDoubleQuoted(title)}" | Out-File -FilePath $ReportPath -Encoding UTF8
("Generated: " + (Get-Date -Format "yyyy-MM-dd HH:mm:ss zzz")) | Out-File -FilePath $ReportPath -Encoding UTF8 -Append
"" | Out-File -FilePath $ReportPath -Encoding UTF8 -Append

${sections}

Write-Host "Report saved to $ReportPath"
`;
}

function buildShellScript(testCase, commands) {
  const title = `Test ${testCase.id} - ${testCase.section} - ${testCase.title}`;
  const sections = commands.map((item) => {
    return `run_section ${quoteShellString(item.label || "Command")} <<'COMMAND_BLOCK'\n${item.code || ""}\nCOMMAND_BLOCK`;
  }).join("\n\n");

  return `#!/bin/sh
# ${title}
# Run on the target Linux/ESXi VM or shell.
# This script writes command results only to a timestamped TXT report next to this script.

set +e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPORT_PATH="$SCRIPT_DIR/${sanitizeFileName(`${testCase.id}-report`)}-$(date +%Y%m%d-%H%M%S).txt"

run_section() {
  name="$1"
  echo "===== $name =====" >> "$REPORT_PATH"
  sh -s >> "$REPORT_PATH" 2>&1
  echo "" >> "$REPORT_PATH"
}

echo ${quoteShellString(title)} > "$REPORT_PATH"
echo "Generated: $(date '+%Y-%m-%d %H:%M:%S %z')" >> "$REPORT_PATH"
echo "" >> "$REPORT_PATH"

${sections}

echo "Report saved to $REPORT_PATH"
`;
}

function downloadTextFile(fileName, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function sanitizeFileName(value) {
  return String(value || "download")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "download";
}

function quotePowerShellString(value) {
  return `'${String(value || "").replace(/'/g, "''")}'`;
}

function quoteShellString(value) {
  return `'${String(value || "").replace(/'/g, "'\\''")}'`;
}

function escapeForPowerShellDoubleQuoted(value) {
  return String(value || "")
    .replace(/`/g, "``")
    .replace(/\$/g, "`$")
    .replace(/"/g, "`\"");
}

function parseLines(value) {
  return String(value || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseCommands(value) {
  return String(value || "")
    .split(/\n---+\n/g)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const [label, ...lines] = block.split("\n");
      const description = lines[0]?.startsWith("คำอธิบาย:")
        ? lines.shift().replace("คำอธิบาย:", "").trim()
        : "";
      return {
        label: (label || "Command").trim(),
        description,
        code: lines.join("\n").trim()
      };
    })
    .filter((item) => item.code);
}

function serializeCommands(commands) {
  return (commands || [])
    .map((item) => [
      item.label || "Command",
      item.description ? `คำอธิบาย: ${item.description}` : "",
      item.code || ""
    ].filter(Boolean).join("\n").trim())
    .join("\n---\n");
}

function sanitizeCaseId(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || `case-${Date.now()}`;
}

function upsertCase(list, payload) {
  const next = list.filter((item) => item.id !== payload.id);
  next.push(payload);
  return sortCases(next);
}

function sortCases(list) {
  return [...list].sort((a, b) => {
    const orderDiff = (Number(a.order) || 9999) - (Number(b.order) || 9999);
    if (orderDiff) return orderDiff;
    return String(a.id).localeCompare(String(b.id), undefined, { numeric: true });
  });
}

function filterCases() {
  return cases.filter((testCase) => {
    const result = results[testCase.id] || defaultResult();
    const matchesFilter = activeFilter === "all" || result.status === activeFilter;
    const haystack = [
      testCase.id,
      testCase.section,
      testCase.title,
      testCase.purpose,
      testCase.os,
      testCase.esxi,
      result.inventory_host,
      result.os_family,
      result.esxi_version,
      result.active_bootloader_file,
      result.active_bootloader_signature_method,
      result.rootCause,
      result.notes,
      result.actualRemediation
    ].join(" ").toLowerCase();
    return matchesFilter && (!searchTerm || haystack.includes(searchTerm));
  });
}

function renderMetrics() {
  const allResults = getAllResults();
  elements.total.textContent = cases.length;
  elements.pass.textContent = allResults.filter((item) => item.status === "pass").length;
  elements.fail.textContent = allResults.filter((item) => item.status === "fail").length;
  elements.impact.textContent = allResults.filter((item) => normalizeBooleanValue(getReportSource(item).active_bootloader_has_2023) === true).length;
}

function renderSummary() {
  const allResults = getAllResults();
  const completed = allResults.filter((item) => item.status !== "pending").length;
  const pass = allResults.filter((item) => item.status === "pass").length;
  const fail = allResults.filter((item) => item.status === "fail").length;
  const bootloader2023 = allResults.filter((item) => normalizeBooleanValue(getReportSource(item).active_bootloader_has_2023) === true).length;
  const percent = cases.length ? Math.round((completed / cases.length) * 100) : 0;

  elements.summaryPercent.textContent = `${percent}%`;
  elements.summaryCoverage.textContent = `${completed} / ${cases.length}`;
  elements.summaryPass.textContent = pass;
  elements.summaryFail.textContent = fail;
  elements.summaryImpact.textContent = bootloader2023;
  elements.summaryHeadline.textContent = buildSummaryHeadline(completed, pass, fail);

  renderPlatformSummary();
  renderKeyFindings({ completed, pass, fail, bootloader2023 });
  renderSummaryCards();
}

function buildSummaryHeadline(completed, pass, fail) {
  if (!completed) return "ยังไม่มีผลทดสอบที่บันทึก เริ่มจากชุด minimum test ก่อนเพื่อเห็น risk เร็วที่สุด";
  if (fail) return `บันทึกผลแล้ว ${completed} test case พบ fail ${fail} รายการ`;
  return `บันทึกผลแล้ว ${completed} test case`;
}

function renderPlatformSummary() {
  const groups = new Map();
  cases.forEach((testCase) => {
    const result = results[testCase.id] || defaultResult();
    const key = testCase.section;
    const item = groups.get(key) || { total: 0, done: 0, pass: 0, fail: 0, bootloader2023: 0 };
    item.total += 1;
    if (result.status !== "pending") item.done += 1;
    if (result.status === "pass") item.pass += 1;
    if (result.status === "fail") item.fail += 1;
    if (normalizeBooleanValue(getReportSource(result).active_bootloader_has_2023) === true) item.bootloader2023 += 1;
    groups.set(key, item);
  });

  elements.platformSummary.innerHTML = "";
  groups.forEach((item, name) => {
    const percent = item.total ? Math.round((item.done / item.total) * 100) : 0;
    const row = document.createElement("div");
    row.className = "platform-row";
    row.innerHTML = `
      <span class="platform-name">${escapeHtml(name)}</span>
      <span>${item.done}/${item.total} done · ${item.pass} pass · ${item.fail} fail · ${item.bootloader2023} bootloader CA 2023</span>
      <div class="platform-bar"><span style="width: ${percent}%"></span></div>
    `;
    elements.platformSummary.appendChild(row);
  });
}

function renderKeyFindings(summary) {
  const findings = [];
  if (!summary.completed) {
    findings.push("ยังไม่มี result ที่บันทึกในระบบ");
    if (cases.length) {
      findings.push(`เริ่มจาก test case ลำดับแรก: ${cases.slice(0, 3).map((testCase) => testCase.id).join(", ")}`);
    } else {
      findings.push("ยังไม่มี test case ใน DB ให้สร้าง case แรกก่อนเริ่มบันทึกผล");
    }
  } else {
    findings.push(`ความคืบหน้ารวม ${summary.completed}/${cases.length} test cases`);
    findings.push(`ผ่านแล้ว ${summary.pass} test cases`);
    if (summary.fail) findings.push(`มี fail ${summary.fail} test cases ต้องทำ remediation และ retest`);
    findings.push(`Bootloader พบ CA 2023 แล้ว ${summary.bootloader2023} test cases`);
  }

  const pendingTopCases = cases
    .filter((testCase) => (results[testCase.id] || defaultResult()).status === "pending")
    .slice(0, 4)
    .map((testCase) => testCase.id);
  if (pendingTopCases.length) findings.push(`test cases ที่ยัง pending ลำดับแรก: ${pendingTopCases.join(", ")}`);

  elements.keyFindings.innerHTML = "";
  findings.forEach((finding) => {
    const li = document.createElement("li");
    li.textContent = finding;
    elements.keyFindings.appendChild(li);
  });
}

function renderSummaryCards() {
  const orderedCases = [...cases].sort((a, b) => {
    const aResult = results[a.id] || defaultResult();
    const bResult = results[b.id] || defaultResult();
    return statusWeight(aResult) - statusWeight(bResult);
  });

  elements.summaryCaseCards.innerHTML = "";
  orderedCases.forEach((testCase) => {
    const result = results[testCase.id] || defaultResult();
    const report = getReportSource(result);
    const card = document.createElement("article");
    card.className = "result-summary-card";
    const badgeClass = result.status;

    card.innerHTML = `
      <header class="result-card-head">
        <div class="result-card-titles">
          <p class="case-id">Test ${escapeHtml(testCase.id)} · ${escapeHtml(testCase.section)}</p>
          <h4>${escapeHtml(testCase.title)}</h4>
        </div>
        <span class="badge ${escapeHtml(badgeClass || "pending")}">${escapeHtml(statusLabels[result.status] || statusLabels.pending)}</span>
      </header>
      <div class="result-chip-strip" aria-label="สรุปผลหลัก">
        ${resultChipHtml("Secure Boot", formatBooleanThai(report.secure_boot_enabled, "secureBoot").label)}
        ${resultChipHtml("DB CA 2011", formatBooleanThai(report.db_has_2011, "cert").label)}
        ${resultChipHtml("DB CA 2023", formatBooleanThai(report.db_has_2023, "cert").label)}
        ${resultChipHtml("KEK CA 2023", formatBooleanThai(report.kek_has_2023, "cert").label)}
        ${resultChipHtml("DBX", formatBooleanThai(report.dbx_readable, "readable").label)}
        ${resultChipHtml("Bootloader CA 2011", formatBooleanThai(report.active_bootloader_has_2011, "cert").label)}
        ${resultChipHtml("Bootloader CA 2023", formatBooleanThai(report.active_bootloader_has_2023, "cert").label)}
      </div>
      <dl class="result-kv-grid">
        ${resultKvRow("inventory_host", report.inventory_host || result.vmName)}
        ${resultKvRow("os_family", formatOsFamily(report.os_family || testCase.os))}
        ${resultKvRow("esxi_version", report.esxi_version || testCase.esxi)}
        ${resultKvRow("active_bootloader_file", report.active_bootloader_file)}
        ${resultKvRow("active_bootloader_signature_method", report.active_bootloader_signature_method)}
        ${resultKvRow("อัปเดตล่าสุด", result.updatedAt ? formatDate(result.updatedAt) : "")}
      </dl>
      <div class="result-details-stack">
        <details class="result-block">
          <summary>สาเหตุ &amp; Remediation ที่ใช้จริง</summary>
          <div class="result-subblocks">
            <p class="result-inline-label">Root cause</p>
            <pre class="result-pre result-pre--tight">${blockText(result.rootCause)}</pre>
            <p class="result-inline-label">Remediation</p>
            <pre class="result-pre result-pre--tight">${blockText(result.actualRemediation)}</pre>
          </div>
        </details>
        <details class="result-block">
          <summary>หมายเหตุ / Notes</summary>
          <pre class="result-pre">${blockText(result.notes)}</pre>
        </details>
      </div>
    `;

    elements.summaryCaseCards.appendChild(card);
  });
}

function resultChipHtml(label, value) {
  return `<span class="result-chip"><span class="result-chip-label">${escapeHtml(label)}</span> ${escapeHtml(value)}</span>`;
}

function resultKvRow(label, value) {
  const display = value && String(value).trim() ? String(value) : "—";
  return `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(display)}</dd>`;
}

function blockText(value) {
  if (value == null || value === "") return escapeHtml("—");
  return escapeHtml(String(value));
}

function statusWeight(result) {
  if (result.status === "fail") return 1;
  if (result.status === "in-progress") return 2;
  if (result.status === "exception") return 3;
  if (result.status === "pending") return 4;
  return 5;
}

function getAllResults() {
  return cases.map((testCase) => results[testCase.id] || defaultResult());
}

function switchView() {
  elements.testsView.classList.toggle("active-view", activeView === "tests");
  elements.summaryView.classList.toggle("active-view", activeView === "summary");
}

async function connectFirebase() {
  const config = getFirebaseConfig();
  if (!config) {
    setSync("ยังไม่ได้เชื่อม Firebase, กำลังเก็บใน local browser");
    return;
  }

  try {
    setSync("กำลังเชื่อม Firebase");
    const [{ initializeApp }, { getFirestore, collection, doc, onSnapshot, setDoc, deleteDoc, serverTimestamp }] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js")
    ]);

    const app = initializeApp(config);
    const db = getFirestore(app);

    firebaseApi = { db, collection, doc, onSnapshot, setDoc, deleteDoc, serverTimestamp };
    subscribeToCases();
    subscribeToResults();
  } catch (error) {
    console.error(error);
    setSync(`เชื่อม Firebase ไม่สำเร็จ, ใช้ local fallback: ${error.message}`);
  }
}

function subscribeToCases() {
  if (!firebaseApi) return;
  if (unsubscribeCases) unsubscribeCases();

  const ref = firebaseApi.collection(firebaseApi.db, CASES_COLLECTION_NAME);
  unsubscribeCases = firebaseApi.onSnapshot(ref, (snapshot) => {
    const nextCases = [];
    snapshot.forEach((item) => {
      nextCases.push(normalizeRemoteCase(item.id, item.data()));
    });
    cases = sortCases(nextCases);
    saveLocalCases(cases);
    render();
  }, (error) => {
    console.error(error);
    setSync(`Cases sync error: ${error.message}`);
  });
}

function subscribeToResults() {
  if (!firebaseApi) return;
  if (unsubscribe) unsubscribe();

  const ref = firebaseApi.collection(firebaseApi.db, COLLECTION_NAME);
  unsubscribe = firebaseApi.onSnapshot(ref, (snapshot) => {
    const next = {};
    snapshot.forEach((item) => {
      next[item.id] = normalizeRemoteResult(item.data());
    });
    results = next;
    saveLocalResults(results);
    setSync("เชื่อม Firestore แล้ว, ข้อมูล sync อัตโนมัติ");
    render();
  }, (error) => {
    console.error(error);
    setSync(`Firestore sync error: ${error.message}`);
  });
}

async function saveResult(caseId, payload) {
  if (!firebaseApi) return;
  const ref = firebaseApi.doc(firebaseApi.db, COLLECTION_NAME, caseId);
  await firebaseApi.setDoc(ref, {
    ...payload,
    updatedAt: firebaseApi.serverTimestamp(),
    updatedAtIso: payload.updatedAt
  });
}

async function resetAllResults() {
  try {
    setSync("กำลังล้างข้อมูลทั้งหมด");
    if (firebaseApi) {
      await Promise.all(cases.map((testCase) => {
        const ref = firebaseApi.doc(firebaseApi.db, COLLECTION_NAME, testCase.id);
        return firebaseApi.deleteDoc(ref);
      }));
    }
    localStorage.removeItem(STORAGE_KEY);
    results = {};
    render();
    setSync(firebaseApi ? "ล้างข้อมูลทั้งหมดแล้ว และ Firestore sync อัตโนมัติ" : "ล้าง local data แล้ว");
  } catch (error) {
    console.error(error);
    alert(`ล้างข้อมูลไม่สำเร็จ: ${error.message}`);
    setSync(`ล้างข้อมูลไม่สำเร็จ: ${error.message}`);
  }
}

function normalizeRemoteResult(data) {
  return {
    ...defaultResult(),
    ...data,
    updatedAt: data.updatedAtIso || data.updatedAt?.toDate?.().toISOString?.() || data.updatedAt || ""
  };
}

function normalizeRemoteCase(id, data) {
  return {
    id: data.id || id,
    section: data.section || "",
    title: data.title || "",
    order: Number(data.order) || 9999,
    purpose: data.purpose || "",
    os: data.os || "",
    esxi: data.esxi || "",
    firmware: data.firmware || "",
    secureBoot: data.secureBoot || "",
    vtpm: data.vtpm || "",
    encryption: data.encryption || "",
    steps: Array.isArray(data.steps) ? data.steps : [],
    expected: Array.isArray(data.expected) ? data.expected : [],
    remediation: Array.isArray(data.remediation) ? data.remediation : [],
    commands: Array.isArray(data.commands) ? data.commands : [],
    updatedAt: data.updatedAtIso || data.updatedAt?.toDate?.().toISOString?.() || data.updatedAt || ""
  };
}

function getFirebaseConfig() {
  if (window.FIREBASE_CONFIG?.projectId) return window.FIREBASE_CONFIG;
  const localConfig = localStorage.getItem(CONFIG_KEY);
  if (!localConfig) return null;
  try {
    const config = JSON.parse(localConfig);
    if (elements.configInput) elements.configInput.value = JSON.stringify(config, null, 2);
    return config.projectId ? config : null;
  } catch {
    return null;
  }
}

function defaultResult() {
  return {
    status: "pending",
    inventory_host: "",
    os_family: "",
    esxi_version: "",
    secure_boot_enabled: "",
    db_has_2011: "",
    db_has_2023: "",
    kek_has_2023: "",
    dbx_readable: "",
    active_bootloader_file: "",
    active_bootloader_has_2011: "",
    active_bootloader_has_2023: "",
    active_bootloader_signature_method: "",
    rootCause: "",
    actualRemediation: "",
    notes: "",
    updatedAt: ""
  };
}

function getCommands(testCase) {
  const windowsCheck = {
    label: "Windows check CA / KEK / db / dbx",
    description: "ตรวจ Secure Boot state, หา CA 2023 ใน db, หา KEK 2023 ใน KEK และอ่าน db/dbx เพื่อเก็บหลักฐานก่อน/หลัง update",
    code: `Confirm-SecureBootUEFI

$vars = "PK","KEK","db","dbx"
foreach ($name in $vars) {
  $var = Get-SecureBootUEFI -Name $name -ErrorAction SilentlyContinue
  if ($var) {
    $text = [System.Text.Encoding]::ASCII.GetString($var.Bytes)
    [PSCustomObject]@{
      Name = $name
      Has_Windows_UEFI_CA_2023 = $text -match "Windows UEFI CA 2023"
      Has_MS_KEK_2K_CA_2023 = $text -match "Microsoft Corporation KEK 2K CA 2023"
      Has_MS_UEFI_CA_2023 = $text -match "Microsoft UEFI CA 2023"
      Has_MS_Option_ROM_UEFI_CA_2023 = $text -match "Microsoft Option ROM UEFI CA 2023"
      Bytes = $var.Bytes.Length
    }
  }
}

Get-ItemProperty -Path HKLM:\\SYSTEM\\CurrentControlSet\\Control\\SecureBoot -Name AvailableUpdates -ErrorAction SilentlyContinue
Get-ItemProperty -Path HKLM:\\SYSTEM\\CurrentControlSet\\Control\\SecureBoot\\Servicing -ErrorAction SilentlyContinue`
  };

  const windowsPatchCheck = {
    label: "Windows patch level check",
    description: "ใช้ดูว่า OS build/KB เก่าเกินไปไหม ก่อนสรุปผล CA 2023 ควร patch เป็น cumulative update ล่าสุดแล้ว retest",
    code: `Get-ComputerInfo | Select-Object WindowsProductName, WindowsVersion, OsBuildNumber, OsHardwareAbstractionLayer

Get-HotFix |
  Sort-Object InstalledOn -Descending |
  Select-Object -First 10 HotFixID, Description, InstalledOn, InstalledBy

dism /online /get-packages /format:table |
  findstr /i "Package_for_RollupFix"`
  };

  const windowsOnlineUpdate = {
    label: "Windows online / WSUS update path",
    description: "ใช้เมื่อเครื่องออกเน็ตหรือรับ patch ผ่าน WSUS/SCCM/Windows Update ได้ หลัง update ต้อง reboot แล้วตรวจ CA/KEK/db/dbx และ bootloader ซ้ำ",
    code: `# GUI / Server with Desktop Experience
start ms-settings:windowsupdate

# Server Core หรือใช้เมนู built-in ของ Windows Server
sconfig
# เลือก option 6: Download and Install Updates

# หลังติดตั้ง cumulative update แล้ว reboot
Restart-Computer`
  };

  const windowsOfflineUpdate = {
    label: "Windows offline update path",
    description: "ใช้เมื่อ VM ออกเน็ตไม่ได้ ให้โหลด cumulative update .msu/.cab จากเครื่องอื่นหรือ WSUS export แล้วนำมาติดตั้งใน VM",
    code: `New-Item -ItemType Directory -Force -Path C:\\Patch

# MSU package
Get-ChildItem C:\\Patch\\*.msu | ForEach-Object {
  Start-Process wusa.exe -ArgumentList "\`"$($_.FullName)\`" /quiet /norestart" -Wait
}

# CAB package
Get-ChildItem C:\\Patch\\*.cab | ForEach-Object {
  dism /online /add-package /packagepath:"$($_.FullName)"
}

# ตรวจ pending reboot แล้ว reboot
reg query "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\WindowsUpdate\\Auto Update\\RebootRequired"
Restart-Computer`
  };

  const windowsEventCheck = {
    label: "Windows Secure Boot event check",
    description: "ตรวจ event โดยไม่ lock ProviderName เพื่อเลี่ยง error บาง OS ที่ไม่มี provider TPM-WMI แต่ยังค้นหา event ID ที่เกี่ยวข้องได้",
    code: `$ids = 1032,1036,1043,1044,1045,1795,1796,1797,1798,1799,1800,1801,1802,1803,1808

$providers = Get-WinEvent -ListProvider * -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -match "TPM|SecureBoot|Secure-Boot" } |
  Select-Object -ExpandProperty Name

Write-Host "Matching providers on this OS:"
$providers

try {
  Get-WinEvent -FilterHashtable @{LogName='System'; Id=$ids} -MaxEvents 50 -ErrorAction Stop |
    Select-Object TimeCreated, Id, ProviderName, LevelDisplayName, Message
} catch {
  Write-Host "No matching Secure Boot update events found in System log for the selected IDs."
  Write-Host $_.Exception.Message
}`
  };

  const windowsEventGuide = {
    label: "Windows event meaning guide",
    description: "ใช้อ่านความหมาย event ตอนสรุปผล test และระบุ root cause/remediation ในเว็บ",
    code: `# 1036 = Windows UEFI CA 2023 ถูกเพิ่มเข้า db สำเร็จ
# 1043 = Microsoft Corporation KEK 2K CA 2023 ถูกเพิ่มเข้า KEK สำเร็จ
# 1044 = Microsoft Option ROM UEFI CA 2023 ถูกเพิ่มเข้า db สำเร็จ
# 1045 = Microsoft UEFI CA 2023 ถูกเพิ่มเข้า db สำเร็จ
# 1795 = firmware/platform คืน error ตอน update DB, DBX หรือ KEK; ใน VM ให้สงสัย hypervisor/firmware/NVRAM
# 1796 = unexpected error ระหว่าง Secure Boot update; ดู message เพื่อรู้ว่าเป็น DB, DBX, KEK หรือ policy
# 1797 = DBX update ถูก block เพราะ Windows UEFI CA 2023 ยังไม่อยู่ใน db
# 1798 = DBX update ถูก block เพราะ boot manager ยังไม่ได้ signed ด้วย Windows UEFI CA 2023
# 1799 = boot manager signed ด้วย Windows UEFI CA 2023 ถูกติดตั้งสำเร็จ
# 1800 = ต้อง reboot ก่อน Secure Boot update รอบถัดไป
# 1801 = certificate/key update ยัง apply เข้า firmware ไม่สำเร็จหรือยัง pending
# 1802 = update ถูก block จาก known firmware/platform issue
# 1803 = หา OEM PK-signed KEK payload ไม่เจอ จึง update KEK ไม่ได้
# 1808 = เครื่องมี Secure Boot CA/key ใหม่ครบตามเงื่อนไขที่ Windows ต้องการแล้ว`
  };

  const windowsTrigger = {
    label: "Windows trigger Secure Boot update",
    description: "สั่ง opt-in ให้ Windows ทำ Secure Boot certificate update แล้วรัน scheduled task จากนั้นต้อง reboot และตรวจ CA/KEK/db/dbx ซ้ำ",
    code: `reg add HKLM\\SYSTEM\\CurrentControlSet\\Control\\SecureBoot /v MicrosoftUpdateManagedOptIn /t REG_DWORD /d 1 /f
Start-ScheduledTask -TaskName "\\Microsoft\\Windows\\PI\\Secure-Boot-Update"`
  };

  const windowsBootloader = {
    label: "Windows bootloader signing CA check",
    description: "ตรวจว่าไฟล์ boot manager มีอยู่จริงไหม และ signed ด้วย certificate chain 2011 หรือ 2023 ถ้า SignerCertificate ไม่ออก ให้ใช้ signtool fallback",
    code: `$bootFiles = @(
  "$env:SystemRoot\\Boot\\EFI\\bootmgfw.efi",
  "$env:SystemDrive\\EFI\\Microsoft\\Boot\\bootmgfw.efi"
)

$bootFiles | ForEach-Object {
  $exists = Test-Path $_
  if ($exists) {
    Write-Host "\\n===== $_ ====="
    $sig = Get-AuthenticodeSignature $_
    $cert = $sig.SignerCertificate
    $text = (($cert.Subject, $cert.Issuer) -join " ")

    [PSCustomObject]@{
      Path = $_
      Bootloader_File_Exists = $true
      Status = $sig.Status
      Subject = $cert.Subject
      Issuer = $cert.Issuer
      NotBefore = $cert.NotBefore
      NotAfter = $cert.NotAfter
      Thumbprint = $cert.Thumbprint
      Bootloader_Uses_2011_CA = $text -match "2011|Windows Production PCA"
      Bootloader_Uses_2023_CA = $text -match "2023|Windows UEFI CA"
      NeedSigntoolFallback = -not $cert
    } | Format-List

    if (-not $cert) {
      Write-Host "SignerCertificate is empty. If signtool is installed, run:"
      Write-Host "signtool verify /pa /v \`"$_\`""
    }
  } else {
    [PSCustomObject]@{
      Path = $_
      Bootloader_File_Exists = $false
    } | Format-List
  }
}`
  };

  const windowsBootloaderChain = {
    label: "Windows bootloader full certificate chain check",
    description: "แตก certificate chain ของ bootmgfw.efi ทุกชั้น เพื่อดูว่า leaf/intermediate/root มี 2011 หรือ 2023 ตรงไหนบ้าง",
    code: `$bootFiles = @(
  "$env:SystemRoot\\Boot\\EFI\\bootmgfw.efi",
  "$env:SystemDrive\\EFI\\Microsoft\\Boot\\bootmgfw.efi"
)

$bootFiles | ForEach-Object {
  if (Test-Path $_) {
    Write-Host "\\n===== Authenticode Signature: $_ ====="
    $sig = Get-AuthenticodeSignature $_
    $sig | Format-List Status, StatusMessage, Path

    $cert = $sig.SignerCertificate
    if (-not $cert) {
      Write-Host "SignerCertificate is empty. Cannot build chain with Get-AuthenticodeSignature."
      Write-Host "Fallback: signtool verify /pa /v \`"$_\`""
      return
    }

    Write-Host "\\n===== Signer Certificate ====="
    $cert | Format-List Subject, Issuer, NotBefore, NotAfter, Thumbprint

    Write-Host "\\n===== Certificate Chain ====="
    $chain = New-Object System.Security.Cryptography.X509Certificates.X509Chain
    $chain.ChainPolicy.RevocationMode = [System.Security.Cryptography.X509Certificates.X509RevocationMode]::NoCheck
    $chain.Build($cert) | Out-Null

    $index = 0
    $chain.ChainElements | ForEach-Object {
      $text = ($_.Certificate.Subject + " " + $_.Certificate.Issuer)
      [PSCustomObject]@{
        Index = $index
        Subject = $_.Certificate.Subject
        Issuer = $_.Certificate.Issuer
        NotBefore = $_.Certificate.NotBefore
        NotAfter = $_.Certificate.NotAfter
        Thumbprint = $_.Certificate.Thumbprint
        Status = ($_.ChainElementStatus | ForEach-Object { $_.Status }) -join ","
        StatusInformation = ($_.ChainElementStatus | ForEach-Object { $_.StatusInformation.Trim() }) -join "; "
        Chain_Element_Uses_2011_CA = $text -match "2011|Windows Production PCA"
        Chain_Element_Uses_2023_CA = $text -match "2023|Windows UEFI CA"
      } | Format-List
      $index += 1
    }
  } else {
    [PSCustomObject]@{
      Path = $_
      Bootloader_File_Exists = $false
    } | Format-List
  }
}`
  };

  const bitLocker = {
    label: "BitLocker check / suspend",
    description: "ใช้กับ VM ที่มี vTPM/BitLocker เพื่อลดโอกาสถาม recovery key หลัง Secure Boot variable เปลี่ยน",
    code: `manage-bde -status
manage-bde -protectors -get C:
Suspend-BitLocker -MountPoint C: -RebootCount 2`
  };

  const pkCheck = {
    label: "Windows PK check",
    description: "ตรวจ Platform Key เพิ่มเติมเมื่อสงสัย PK invalid หรือ firmware variable ผิดปกติ",
    code: `$pk = Get-SecureBootUEFI -Name PK
$bytes = $pk.Bytes
$cert = $bytes[44..($bytes.Length-1)]
[IO.File]::WriteAllBytes("PK.der", $cert)
certutil -dump PK.der`
  };

  const linuxRhel = {
    label: "RHEL-family Secure Boot summary check",
    description: "สรุปผล PK/KEK/db/dbx, boot entry, package owner และ signature ของ shim/GRUB โดยแยกคำสั่งชัดเจนไม่ให้ grep อ่านไฟล์ .efi",
    code: `echo "===== Secure Boot state ====="
mokutil --sb-state

summarize_var() {
  name="$1"
  echo
  echo "===== $name summary ====="
  output="$(mokutil --"$name" 2>&1)"
  echo "$output" | grep -E "^\\[key|Owner:|SHA1 Fingerprint:|Issuer:|Subject:|Not Before:|Not After :" || true
  echo "Has_MS_KEK_2K_CA_2023=$(echo "$output" | grep -qi "Microsoft Corporation KEK 2K CA 2023" && echo true || echo false)"
  echo "Has_Windows_UEFI_CA_2023=$(echo "$output" | grep -qi "Windows UEFI CA 2023" && echo true || echo false)"
  echo "Has_MS_UEFI_CA_2023=$(echo "$output" | grep -qi "Microsoft UEFI CA 2023" && echo true || echo false)"
  echo "Has_MS_Option_ROM_UEFI_CA_2023=$(echo "$output" | grep -qi "Microsoft Option ROM UEFI CA 2023" && echo true || echo false)"
  echo "Has_2011_CA=$(echo "$output" | grep -qi "2011" && echo true || echo false)"
}

summarize_var pk
summarize_var kek
summarize_var db

echo
echo "===== dbx summary ====="
dbx_output="$(mokutil --dbx 2>&1)"
echo "$dbx_output" | grep -E "^\\[key|\\[SHA|^[[:space:]]+[0-9a-f]{64}$" | head -80 || true
echo "DBX_Readable=$(echo "$dbx_output" | grep -qi "SHA\\|Certificate\\|Fingerprint" && echo true || echo false)"

echo
echo "===== EFI boot path ====="
if command -v efibootmgr >/dev/null 2>&1; then
  efibootmgr -v
else
  echo "efibootmgr not installed"
fi

echo
echo "===== EFI files ====="
if [ -d /boot/efi/EFI ]; then
  find /boot/efi/EFI -type f -iname "*.efi" -exec file {} \\;
else
  echo "/boot/efi/EFI not found"
fi

echo
echo "===== package versions ====="
rpm -qa | grep -Ei "^(shim|shim-x64|grub2-efi|grub2-tools|kernel)-" || true
rpm -q shim-x64 shim grub2-efi-x64 grub2-tools kernel || true

echo
echo "===== EFI file package owners ====="
for efi_file in \\
  /boot/efi/EFI/redhat/shimx64.efi \\
  /boot/efi/EFI/redhat/grubx64.efi \\
  /boot/efi/EFI/BOOT/BOOTX64.EFI
do
  if [ -f "$efi_file" ]; then
    echo "$efi_file"
    rpm -qf "$efi_file" || true
  else
    echo "$efi_file not found"
  fi
done

echo
echo "===== EFI signatures ====="
if command -v sbverify >/dev/null 2>&1; then
  for efi_file in \\
    /boot/efi/EFI/redhat/shimx64.efi \\
    /boot/efi/EFI/redhat/grubx64.efi \\
    /boot/efi/EFI/BOOT/BOOTX64.EFI
  do
    if [ -f "$efi_file" ]; then
      echo
      echo "===== sbverify: $efi_file ====="
      sbverify --list "$efi_file" || true
    fi
  done
else
  echo "sbverify not installed; install sbsigntools to inspect EFI signatures"
fi`
  };

  const linuxUbuntu = {
    label: "Ubuntu Secure Boot summary check",
    description: "สรุปผล PK/KEK/db/dbx แบบอ่านง่าย ไม่ dump certificate ทั้งใบ และเช็ค shim-signed, signed GRUB, kernel",
    code: `echo "===== Secure Boot state ====="
mokutil --sb-state

summarize_var() {
  name="$1"
  echo
  echo "===== $name summary ====="
  output="$(mokutil --"$name" 2>&1)"
  echo "$output" | grep -E "^\\[key|Owner:|SHA1 Fingerprint:|Issuer:|Subject:|Not Before:|Not After :" || true
  echo "Has_MS_KEK_2K_CA_2023=$(echo "$output" | grep -qi "Microsoft Corporation KEK 2K CA 2023" && echo true || echo false)"
  echo "Has_Windows_UEFI_CA_2023=$(echo "$output" | grep -qi "Windows UEFI CA 2023" && echo true || echo false)"
  echo "Has_MS_UEFI_CA_2023=$(echo "$output" | grep -qi "Microsoft UEFI CA 2023" && echo true || echo false)"
  echo "Has_MS_Option_ROM_UEFI_CA_2023=$(echo "$output" | grep -qi "Microsoft Option ROM UEFI CA 2023" && echo true || echo false)"
  echo "Has_2011_CA=$(echo "$output" | grep -qi "2011" && echo true || echo false)"
}

summarize_var pk
summarize_var kek
summarize_var db

echo
echo "===== dbx summary ====="
dbx_output="$(mokutil --dbx 2>&1)"
echo "$dbx_output" | grep -E "^\\[key|\\[SHA|^[[:space:]]+[0-9a-f]{64}$" | head -80 || true
echo "DBX_Readable=$(echo "$dbx_output" | grep -qi "SHA\\|Certificate\\|Fingerprint" && echo true || echo false)"

echo
echo "===== package versions ====="
dpkg -l shim-signed shim grub-efi-amd64-signed grub2-common linux-image-generic`
  };

  const esxiNvram = {
    label: "ESXi NVRAM remediation reference",
    description: "ใช้เมื่อ CA/KEK/db/dbx หายหลัง reboot หรือสงสัย .nvram persistence บน VM ที่สร้างจาก ESXi รุ่นเก่า",
    code: `# Power off VM first
# Datastore browser or ESXi shell:
mv vmname.nvram vmname.nvram_old

# Power on VM to regenerate NVRAM
# Then rerun Windows CA/KEK checks`
  };

  const windowsFinalAssessment = {
    label: "Windows final Secure Boot impact assessment",
    description: "รันครั้งเดียวเพื่อสรุป Secure Boot, CA/KEK/db/dbx, event, boot manager CA chain และ remediation decision",
    code: `$ErrorActionPreference = "Continue"

function Test-TextFlag {
  param([string]$Text, [string]$Pattern)
  return [bool]($Text -match [regex]::Escape($Pattern))
}

Write-Host "===== Secure Boot state ====="
$secureBoot = $null
try { $secureBoot = Confirm-SecureBootUEFI } catch { Write-Host $_.Exception.Message }
"SecureBoot=$secureBoot"

Write-Host "\`n===== OS and patch level ====="
Get-ComputerInfo | Select-Object WindowsProductName, WindowsVersion, OsBuildNumber, OsHardwareAbstractionLayer
Get-HotFix | Sort-Object InstalledOn -Descending | Select-Object -First 10 HotFixID, Description, InstalledOn, InstalledBy

Write-Host "\`n===== Secure Boot variables summary ====="
$summary = @()
foreach ($name in "PK","KEK","db","dbx") {
  $var = Get-SecureBootUEFI -Name $name -ErrorAction SilentlyContinue
  if (-not $var) {
    $summary += [PSCustomObject]@{ Name=$name; Readable=$false; Bytes=0; KEK2023=$false; WindowsUEFICA2023=$false; MicrosoftUEFICA2023=$false; OptionROM2023=$false; Has2011=$false }
    continue
  }
  $text = [System.Text.Encoding]::ASCII.GetString($var.Bytes)
  $summary += [PSCustomObject]@{
    Name=$name
    Readable=$true
    Bytes=$var.Bytes.Length
    KEK2023=Test-TextFlag $text "Microsoft Corporation KEK 2K CA 2023"
    WindowsUEFICA2023=Test-TextFlag $text "Windows UEFI CA 2023"
    MicrosoftUEFICA2023=Test-TextFlag $text "Microsoft UEFI CA 2023"
    OptionROM2023=Test-TextFlag $text "Microsoft Option ROM UEFI CA 2023"
    Has2011=($text -match "2011")
  }
}
$summary | Format-Table -AutoSize

Write-Host "\`n===== Boot manager signature and CA chain ====="
$bootFiles = @(
  "$env:SystemRoot\\Boot\\EFI\\bootmgfw.efi",
  "$env:SystemDrive\\EFI\\Microsoft\\Boot\\bootmgfw.efi"
) | Select-Object -Unique

$bootChainUses2023 = $false
$bootChainUses2011 = $false
$bootFileFound = $false
foreach ($path in $bootFiles) {
  if (-not (Test-Path $path)) {
    [PSCustomObject]@{ Path=$path; Exists=$false } | Format-List
    continue
  }
  $bootFileFound = $true
  Write-Host "\`n----- $path -----"
  $sig = Get-AuthenticodeSignature $path
  $sig | Format-List Status, StatusMessage, Path
  $cert = $sig.SignerCertificate
  if (-not $cert) {
    Write-Host "SignerCertificate is empty. Use signtool fallback if available: signtool verify /pa /v \`"$path\`""
    continue
  }

  $chain = New-Object System.Security.Cryptography.X509Certificates.X509Chain
  $chain.ChainPolicy.RevocationMode = [System.Security.Cryptography.X509Certificates.X509RevocationMode]::NoCheck
  $chain.Build($cert) | Out-Null
  $index = 0
  foreach ($element in $chain.ChainElements) {
    $text = $element.Certificate.Subject + " " + $element.Certificate.Issuer
    $uses2023 = $text -match "2023|Windows UEFI CA"
    $uses2011 = $text -match "2011|Windows Production PCA"
    $bootChainUses2023 = $bootChainUses2023 -or $uses2023
    $bootChainUses2011 = $bootChainUses2011 -or $uses2011
    [PSCustomObject]@{
      Index=$index
      Subject=$element.Certificate.Subject
      Issuer=$element.Certificate.Issuer
      NotAfter=$element.Certificate.NotAfter
      Uses2023CA=$uses2023
      Uses2011CA=$uses2011
    } | Format-List
    $index += 1
  }
}

Write-Host "\`n===== Secure Boot update events ====="
$ids = 1032,1036,1043,1044,1045,1795,1796,1797,1798,1799,1800,1801,1802,1803,1808
Get-WinEvent -FilterHashtable @{LogName='System'; Id=$ids} -MaxEvents 50 -ErrorAction SilentlyContinue |
  Select-Object TimeCreated, Id, ProviderName, LevelDisplayName, Message

Write-Host "\`n===== Final decision ====="
$kek2023 = [bool](($summary | Where-Object Name -eq "KEK").KEK2023)
$db = $summary | Where-Object Name -eq "db"
$dbHas2023 = [bool]($db.WindowsUEFICA2023 -or $db.MicrosoftUEFICA2023)
$dbxReadable = [bool](($summary | Where-Object Name -eq "dbx").Readable)

if ($secureBoot -ne $true) {
  "Decision=NON_COMPLIANT_OR_OUT_OF_SCOPE"
  "Fix=Enable UEFI Secure Boot if policy requires it, then rerun this assessment."
} elseif (-not $kek2023) {
  "Decision=IMPACTED"
  "RootCause=KEK 2023 missing. Firmware may not accept future db/dbx updates."
  "Fix=Patch Windows, set MicrosoftUpdateManagedOptIn, run Secure-Boot-Update task, reboot twice. If still missing on VMware VM, regenerate NVRAM or fix PK."
} elseif (-not $dbHas2023) {
  "Decision=IMPACTED"
  "RootCause=db is missing Microsoft/Windows UEFI CA 2023."
  "Fix=Patch Windows, opt in, run Secure-Boot-Update task, reboot twice, then rerun assessment."
} elseif (-not $bootFileFound) {
  "Decision=NEEDS_MANUAL_REVIEW"
  "RootCause=bootmgfw.efi not found in expected paths."
  "Fix=Verify EFI system partition and boot entry manually."
} elseif ($bootChainUses2011 -and -not $bootChainUses2023) {
  "Decision=IMPACTED_OR_PENDING_BOOTMGR_TRANSITION"
  "RootCause=Active boot manager chain appears to use 2011 CA only."
  "Fix=After CA/KEK 2023 are present, install latest cumulative update, run Secure-Boot-Update task, reboot twice, then rerun assessment."
} elseif (-not $dbxReadable) {
  "Decision=NEEDS_MANUAL_REVIEW"
  "RootCause=dbx was not readable."
  "Fix=Check firmware/UEFI variable access and vendor platform health."
} else {
  "Decision=PASS_OR_LOW_RISK"
  "Fix=No emergency remediation. Keep OS patched and keep evidence from this run."
}`
  };

  const windowsFinalFix = {
    label: "Windows final remediation workflow",
    description: "ใช้แก้จริงตามลำดับ: patch, opt-in, trigger task, reboot, retest; มี VMware NVRAM/PK branch ถ้า KEK/db ยังไม่เข้า",
    code: `# 1) Patch first: install latest cumulative update from Windows Update, WSUS, SCCM, or offline MSU/CAB.
# GUI: start ms-settings:windowsupdate
# Server Core: sconfig -> option 6

# 2) Opt in to Microsoft-managed Secure Boot updates.
reg add HKLM\\SYSTEM\\CurrentControlSet\\Control\\SecureBoot /v MicrosoftUpdateManagedOptIn /t REG_DWORD /d 1 /f

# 3) Trigger the Secure Boot update task.
Start-ScheduledTask -TaskName "\\Microsoft\\Windows\\PI\\Secure-Boot-Update"

# 4) Reboot, rerun "Windows final Secure Boot impact assessment", then reboot once more and rerun again.
Restart-Computer

# 5) If KEK 2023/db 2023 is still missing after patch + task + two reboots:
# - Check System events 1795/1796/1801/1802/1803.
# - For VMware VM created from old ESXi/NVRAM lineage: power off, snapshot, rename/regenerate .nvram, then retest.
# - If PK is invalid or unreadable: repair/enroll platform key using vendor/VM firmware procedure, then retest.
# - If boot manager still uses only 2011 CA after CA/KEK 2023 are present: install latest CU again, trigger task, reboot twice.`
  };

  const linuxFinalAssessment = {
    label: "Linux final Secure Boot impact assessment",
    description: "รันครั้งเดียวเพื่อสรุป Secure Boot, firmware CA/KEK/db/dbx, active EFI boot path, package ownership และ shim/GRUB signatures",
    code: `echo "===== Secure Boot state ====="
mokutil --sb-state 2>&1 || true

summarize_var() {
  name="$1"
  echo
  echo "===== $name summary ====="
  output="$(mokutil --"$name" 2>&1)"
  echo "$output" | grep -E "^\\[key|Owner:|SHA1 Fingerprint:|Issuer:|Subject:|Not Before:|Not After :" || true
  echo "Has_MS_KEK_2K_CA_2023=$(echo "$output" | grep -qi "Microsoft Corporation KEK 2K CA 2023" && echo true || echo false)"
  echo "Has_Windows_UEFI_CA_2023=$(echo "$output" | grep -qi "Windows UEFI CA 2023" && echo true || echo false)"
  echo "Has_MS_UEFI_CA_2023=$(echo "$output" | grep -qi "Microsoft UEFI CA 2023" && echo true || echo false)"
  echo "Has_MS_Option_ROM_UEFI_CA_2023=$(echo "$output" | grep -qi "Microsoft Option ROM UEFI CA 2023" && echo true || echo false)"
  echo "Has_2011_CA=$(echo "$output" | grep -qi "2011" && echo true || echo false)"
}

summarize_var pk
summarize_var kek
summarize_var db

echo
echo "===== dbx summary ====="
dbx_output="$(mokutil --dbx 2>&1)"
echo "$dbx_output" | grep -E "^\\[key|\\[SHA|^[[:space:]]+[0-9a-f]{64}$" | head -80 || true
echo "DBX_Readable=$(echo "$dbx_output" | grep -qi "SHA\\|Certificate\\|Fingerprint" && echo true || echo false)"

echo
echo "===== active EFI boot path ====="
if command -v efibootmgr >/dev/null 2>&1; then
  efibootmgr -v
else
  echo "efibootmgr not installed"
fi

echo
echo "===== EFI files ====="
if [ -d /boot/efi/EFI ]; then
  find /boot/efi/EFI -type f -iname "*.efi" -exec file {} \\;
else
  echo "/boot/efi/EFI not found"
fi

echo
echo "===== package versions ====="
if command -v rpm >/dev/null 2>&1; then
  rpm -qa | grep -Ei "^(shim|shim-x64|grub2|kernel)-" || true
  rpm -q shim-x64 shim grub2-efi-x64 grub2-tools grub2-x86_64-efi kernel kernel-default || true
elif command -v dpkg >/dev/null 2>&1; then
  dpkg -l shim-signed shim grub-efi-amd64-signed grub2-common linux-image-generic 2>/dev/null || true
fi

echo
echo "===== EFI file package owners ====="
for efi_file in \\
  /boot/efi/EFI/redhat/shimx64.efi \\
  /boot/efi/EFI/redhat/grubx64.efi \\
  /boot/efi/EFI/ubuntu/shimx64.efi \\
  /boot/efi/EFI/ubuntu/grubx64.efi \\
  /boot/efi/EFI/sles/shim.efi \\
  /boot/efi/EFI/sles/grub.efi \\
  /boot/efi/EFI/BOOT/BOOTX64.EFI
do
  [ -f "$efi_file" ] || continue
  echo "$efi_file"
  if command -v rpm >/dev/null 2>&1; then
    rpm -qf "$efi_file" || true
  elif command -v dpkg >/dev/null 2>&1; then
    dpkg -S "$efi_file" || true
  fi
done

echo
echo "===== EFI signatures ====="
if command -v sbverify >/dev/null 2>&1; then
  find /boot/efi/EFI -type f -iname "*.efi" -print 2>/dev/null | while IFS= read -r efi_file; do
    echo
    echo "===== sbverify: $efi_file ====="
    sbverify --list "$efi_file" || true
  done
else
  echo "sbverify not installed. Install sbsigntools to inspect shim/GRUB signatures."
fi

echo
echo "===== Final decision guide ====="
echo "PASS/LOW_RISK when: SecureBoot enabled, active boot path points to vendor shim, shim/GRUB files are owned by supported packages, packages are current, and system reboots twice."
echo "IMPACTED when: Secure Boot fails, boot files are unowned/stale, shim/GRUB packages are pinned/old/unsupported, sbverify shows unexpected or revoked chain, or db/dbx update causes boot failure."
echo "FIX: update vendor shim/GRUB/kernel packages from supported repos, reboot twice, rerun this assessment. If unbootable, temporarily disable Secure Boot, update boot chain, re-enable Secure Boot, retest."`
  };

  const linuxFinalFix = {
    label: "Linux final remediation workflow",
    description: "ใช้แก้จริงเมื่อ boot chain เก่า, package ไม่ครบ, หรือ Secure Boot/dbx update แล้ว boot fail",
    code: `# RHEL / Rocky / Alma / Oracle Linux
sudo dnf clean all
sudo dnf update 'shim*' 'grub2*' 'kernel*'
sudo reboot

# Ubuntu / Debian family
sudo apt update
sudo apt install --only-upgrade shim-signed shim grub-efi-amd64-signed grub2-common linux-image-generic
sudo reboot

# SLES / SUSE
sudo zypper refresh
sudo zypper update shim grub2-x86_64-efi kernel-default
sudo reboot

# If the VM cannot boot with Secure Boot enabled:
# 1. Temporarily disable Secure Boot in VM firmware/settings.
# 2. Boot the OS.
# 3. Apply the vendor package update above.
# 4. Re-enable Secure Boot.
# 5. Rerun "Linux final Secure Boot impact assessment" and reboot twice.`
  };

  if (testCase.os.includes("Ubuntu")) return [linuxFinalAssessment, linuxFinalFix];
  if (testCase.os.includes("RHEL") || testCase.os.includes("Rocky") || testCase.os.includes("Oracle") || testCase.os.includes("SLES")) return [linuxFinalAssessment, linuxFinalFix];
  if (testCase.id === "1.2") return [windowsFinalAssessment];
  if (testCase.id === "1.3" || testCase.id === "2.2") return [windowsFinalAssessment, windowsFinalFix, pkCheck, esxiNvram];
  if (testCase.id === "4.2") return [bitLocker, windowsFinalAssessment, windowsFinalFix];
  return [windowsFinalAssessment, windowsFinalFix];
}

function loadLocalResults() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function saveLocalResults(nextResults) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(nextResults));
}

function loadLocalCases() {
  try {
    return sortCases(JSON.parse(localStorage.getItem(CASES_STORAGE_KEY)) || []);
  } catch {
    return [];
  }
}

function saveLocalCases(nextCases) {
  localStorage.setItem(CASES_STORAGE_KEY, JSON.stringify(nextCases));
}

function setSync(message) {
  elements.sync.textContent = message;
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
