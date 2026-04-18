const STORAGE_KEY = "vm-ca2023-results";
const CONFIG_KEY = "vm-ca2023-firebase-config";
const COLLECTION_NAME = "vmCa2023Results";
const EVIDENCE_PATH = "vmCa2023Evidence";

const statusLabels = {
  pending: "ยังไม่เริ่ม",
  "in-progress": "กำลังทดสอบ",
  pass: "ผ่าน",
  fail: "ไม่ผ่าน",
  exception: "Exception"
};

const CASES_COLLECTION_NAME = "vmCa2023Cases";
const CASES_STORAGE_KEY = "vm-ca2023-cases";

let cases = loadLocalCases();
let editingCaseId = null;
let unsubscribeCases = null;

let activeFilter = "all";
let activeView = "tests";
let searchTerm = "";
let firebaseApi = null;
let storageApi = null;
let unsubscribe = null;
let results = loadLocalResults();
let activeImage = null;
let imageZoom = 1;

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
  setup: document.querySelector("#setup-panel"),
  caseForm: document.querySelector("#case-form"),
  caseFormMode: document.querySelector("#case-form-mode"),
  cancelCaseEdit: document.querySelector("#cancel-case-edit"),
  configInput: document.querySelector("#firebase-config-input"),
  saveConfig: document.querySelector("#save-config"),
  clearConfig: document.querySelector("#clear-config"),
  search: document.querySelector("#search-input"),
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
  summaryCaseCards: document.querySelector("#summary-case-cards"),
  imageModal: document.querySelector("#image-modal"),
  modalImage: document.querySelector("#modal-image"),
  modalCaption: document.querySelector("#modal-caption"),
  closeImageModal: document.querySelector("#close-image-modal"),
  zoomOutImage: document.querySelector("#zoom-out-image"),
  zoomResetImage: document.querySelector("#zoom-reset-image"),
  zoomInImage: document.querySelector("#zoom-in-image"),
  downloadImage: document.querySelector("#download-image")
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

  elements.caseForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveCaseFromForm();
  });

  elements.cancelCaseEdit.addEventListener("click", () => {
    clearCaseForm();
  });

  elements.saveConfig.addEventListener("click", () => {
    try {
      const value = JSON.parse(elements.configInput.value);
      localStorage.setItem(CONFIG_KEY, JSON.stringify(value));
      window.location.reload();
    } catch (error) {
      alert("Firebase config ต้องเป็น JSON ที่ถูกต้อง");
    }
  });

  elements.clearConfig.addEventListener("click", () => {
    localStorage.removeItem(CONFIG_KEY);
    window.location.reload();
  });

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

  elements.closeImageModal.addEventListener("click", () => closeImageModal());
  elements.imageModal.addEventListener("click", (event) => {
    if (event.target === elements.imageModal) closeImageModal();
  });
  elements.zoomOutImage.addEventListener("click", () => setImageZoom(imageZoom - 0.25));
  elements.zoomResetImage.addEventListener("click", () => setImageZoom(1));
  elements.zoomInImage.addEventListener("click", () => setImageZoom(imageZoom + 0.25));
  elements.downloadImage.addEventListener("click", () => {
    if (activeImage) downloadImage(activeImage);
  });
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
  actions.appendChild(makeCaseActionButton("Edit", "secondary", () => editCase(testCase)));
  actions.appendChild(makeCaseActionButton("Delete case", "danger", () => deleteCase(testCase.id)));
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
  renderEvidenceGallery(fragment.querySelector(".evidence-gallery"), testCase.id, result.evidenceImages || []);

  fragment.querySelector(".updated-at").textContent = result.updatedAt
    ? `บันทึกล่าสุด: ${formatDate(result.updatedAt)}`
    : "ยังไม่บันทึก";

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const files = Array.from(form.elements.evidenceImages.files || []);
    const uploadedImages = await uploadEvidenceImages(testCase.id, files);
    const existingImages = result.evidenceImages || [];
    const nextResult = {
      caseId: testCase.id,
      caseTitle: testCase.title,
      section: testCase.section,
      status: formData.get("status") || "pending",
      vmName: formData.get("vmName") || "",
      esxiBuild: formData.get("esxiBuild") || "",
      owner: formData.get("owner") || "",
      beforeCa: formData.get("beforeCa") || "",
      beforeKek: formData.get("beforeKek") || "",
      afterCa: formData.get("afterCa") || "",
      afterKek: formData.get("afterKek") || "",
      events: formData.get("events") || "",
      impact: formData.get("impact") || "",
      rootCause: formData.get("rootCause") || "",
      actualRemediation: formData.get("actualRemediation") || "",
      notes: formData.get("notes") || "",
      evidenceImages: [...existingImages, ...uploadedImages],
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

function renderEvidenceGallery(container, caseId, images) {
  container.innerHTML = "";
  if (!images.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "ยังไม่มีรูป evidence";
    container.appendChild(empty);
    return;
  }

  images.forEach((image, index) => {
    const item = document.createElement("div");
    item.className = "evidence-item";
    const preview = document.createElement("button");
    preview.type = "button";
    preview.className = "evidence-preview";
    preview.title = image.name || "evidence";
    preview.innerHTML = `<img src="${escapeHtml(image.url)}" alt="${escapeHtml(image.name || "evidence image")}">`;
    preview.addEventListener("click", () => openImageModal(image));

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "delete-image";
    remove.textContent = "ลบรูป";
    remove.addEventListener("click", async () => {
      await deleteEvidenceImage(caseId, index);
    });

    const download = document.createElement("button");
    download.type = "button";
    download.className = "download-image";
    download.textContent = "Download";
    download.addEventListener("click", () => downloadImage(image));

    item.appendChild(preview);
    item.appendChild(download);
    item.appendChild(remove);
    container.appendChild(item);
  });
}

function openImageModal(image) {
  activeImage = image;
  elements.modalImage.src = image.url;
  elements.modalImage.alt = image.name || "evidence preview";
  elements.modalCaption.textContent = `${image.name || "evidence"} · ${formatBytes(image.size || 0)} · ${image.source || "image"}`;
  setImageZoom(1);
  elements.imageModal.showModal();
}

function closeImageModal() {
  elements.imageModal.close();
  activeImage = null;
  elements.modalImage.removeAttribute("src");
  elements.modalCaption.textContent = "";
  setImageZoom(1);
}

function setImageZoom(nextZoom) {
  imageZoom = Math.min(4, Math.max(0.25, nextZoom));
  elements.modalImage.style.width = `${imageZoom * 100}%`;
  elements.zoomResetImage.textContent = `${Math.round(imageZoom * 100)}%`;
}

function downloadImage(image) {
  const link = document.createElement("a");
  link.href = image.url;
  link.download = image.name || "evidence-image.jpg";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

async function deleteEvidenceImage(caseId, index) {
  const current = results[caseId] || defaultResult();
  const images = [...(current.evidenceImages || [])];
  images.splice(index, 1);
  const nextResult = {
    ...current,
    caseId,
    evidenceImages: images,
    updatedAt: new Date().toISOString()
  };
  await saveResult(caseId, nextResult);
  results[caseId] = nextResult;
  saveLocalResults(results);
  render();
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
      result.vmName,
      result.owner,
      result.rootCause,
      result.notes
    ].join(" ").toLowerCase();
    return matchesFilter && (!searchTerm || haystack.includes(searchTerm));
  });
}

function renderMetrics() {
  const allResults = getAllResults();
  elements.total.textContent = cases.length;
  elements.pass.textContent = allResults.filter((item) => item.status === "pass").length;
  elements.fail.textContent = allResults.filter((item) => item.status === "fail").length;
  elements.impact.textContent = allResults.filter((item) => item.impact === "yes").length;
}

function renderSummary() {
  const allResults = getAllResults();
  const completed = allResults.filter((item) => item.status !== "pending").length;
  const pass = allResults.filter((item) => item.status === "pass").length;
  const fail = allResults.filter((item) => item.status === "fail").length;
  const impact = allResults.filter((item) => item.impact === "yes").length;
  const percent = cases.length ? Math.round((completed / cases.length) * 100) : 0;

  elements.summaryPercent.textContent = `${percent}%`;
  elements.summaryCoverage.textContent = `${completed} / ${cases.length}`;
  elements.summaryPass.textContent = pass;
  elements.summaryFail.textContent = fail;
  elements.summaryImpact.textContent = impact;
  elements.summaryHeadline.textContent = buildSummaryHeadline(completed, pass, fail, impact);

  renderPlatformSummary();
  renderKeyFindings({ completed, pass, fail, impact });
  renderSummaryCards();
}

function buildSummaryHeadline(completed, pass, fail, impact) {
  if (!completed) return "ยังไม่มีผลทดสอบที่บันทึก เริ่มจากชุด minimum test ก่อนเพื่อเห็น risk เร็วที่สุด";
  if (fail || impact) return `บันทึกผลแล้ว ${completed} test case พบ fail ${fail} รายการ และ impact ${impact} รายการที่ต้องติดตาม remediation`;
  return `บันทึกผลแล้ว ${completed} test case ยังไม่พบ impact จากชุดที่ทดสอบ`;
}

function renderPlatformSummary() {
  const groups = new Map();
  cases.forEach((testCase) => {
    const result = results[testCase.id] || defaultResult();
    const key = testCase.section;
    const item = groups.get(key) || { total: 0, done: 0, pass: 0, fail: 0, impact: 0 };
    item.total += 1;
    if (result.status !== "pending") item.done += 1;
    if (result.status === "pass") item.pass += 1;
    if (result.status === "fail") item.fail += 1;
    if (result.impact === "yes") item.impact += 1;
    groups.set(key, item);
  });

  elements.platformSummary.innerHTML = "";
  groups.forEach((item, name) => {
    const percent = item.total ? Math.round((item.done / item.total) * 100) : 0;
    const row = document.createElement("div");
    row.className = "platform-row";
    row.innerHTML = `
      <span class="platform-name">${escapeHtml(name)}</span>
      <span>${item.done}/${item.total} done · ${item.pass} pass · ${item.fail} fail · ${item.impact} impact</span>
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
    if (summary.impact) findings.push(`มี impact ${summary.impact} test cases ต้องติดตาม owner/root cause`);
    if (!summary.fail && !summary.impact) findings.push("ยังไม่พบ impact จากผลที่บันทึกไว้");
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
    const card = document.createElement("article");
    card.className = "summary-mini-card";
    const badgeClass = result.impact === "yes" ? "impact" : result.status;
    card.innerHTML = `
      <p class="case-id">Test ${escapeHtml(testCase.id)} · ${escapeHtml(testCase.section)}</p>
      <span class="badge ${escapeHtml(badgeClass || "pending")}">${escapeHtml(statusLabels[result.status] || statusLabels.pending)}</span>
      <h4>${escapeHtml(testCase.title)}</h4>
      <p>Impact: ${escapeHtml(result.impact || "ยังไม่สรุป")}</p>
      <p>VM: ${escapeHtml(result.vmName || "-")}</p>
      <p>Root cause: ${escapeHtml(result.rootCause || "-")}</p>
      <p>Updated: ${escapeHtml(result.updatedAt ? formatDate(result.updatedAt) : "-")}</p>
    `;
    const images = (result.evidenceImages || []).slice(0, 4);
    if (images.length) {
      const row = document.createElement("div");
      row.className = "summary-thumb-row";
      images.forEach((image) => {
        const button = document.createElement("button");
        button.type = "button";
        button.title = image.name || "evidence";
        button.innerHTML = `<img src="${escapeHtml(image.url)}" alt="${escapeHtml(image.name || "evidence image")}">`;
        button.addEventListener("click", () => openImageModal(image));
        row.appendChild(button);
      });
      card.appendChild(row);
    }
    elements.summaryCaseCards.appendChild(card);
  });
}

function statusWeight(result) {
  if (result.impact === "yes") return 0;
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
    elements.setup.open = true;
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
    await connectStorageIfEnabled(app, config);
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

async function connectStorageIfEnabled(app, config) {
  storageApi = null;
  if (!config.enableStorage || !config.storageBucket) return;

  try {
    const { getStorage, ref, uploadBytes, getDownloadURL } = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js");
    const storage = getStorage(app, `gs://${config.storageBucket}`);
    storageApi = { storage, ref, uploadBytes, getDownloadURL };
  } catch (error) {
    console.warn("Firebase Storage is disabled; using Firestore inline image fallback.", error);
    storageApi = null;
  }
}

async function uploadEvidenceImages(caseId, files) {
  if (!files.length) return [];
  if (!storageApi) {
    return filesToInlineEvidence(files, "Firebase Storage ยังไม่พร้อม ใช้ Firestore inline fallback");
  }

  const uploaded = [];
  for (const file of files) {
    if (!file.type.startsWith("image/")) {
      alert(`ข้ามไฟล์ ${file.name}: รองรับเฉพาะรูปภาพ`);
      continue;
    }
    const prepared = await compressImageFile(file);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${EVIDENCE_PATH}/${caseId}/${Date.now()}-${safeName}`;
    try {
      const fileRef = storageApi.ref(storageApi.storage, path);
      await storageApi.uploadBytes(fileRef, prepared.blob, {
        contentType: prepared.contentType,
        customMetadata: { caseId }
      });
      const url = await storageApi.getDownloadURL(fileRef);
      uploaded.push({
        name: file.name,
        path,
        url,
        contentType: prepared.contentType,
        originalSize: file.size,
        size: prepared.blob.size,
        source: "firebase-storage",
        uploadedAt: new Date().toISOString()
      });
    } catch (error) {
      console.warn("Storage upload failed; using Firestore inline fallback.", error);
      const fallback = await fileToInlineEvidence(file, "Storage upload failed");
      if (fallback) uploaded.push(fallback);
    }
  }
  return uploaded;
}

async function filesToInlineEvidence(files, reason) {
  const uploaded = [];
  for (const file of files) {
    const fallback = await fileToInlineEvidence(file, reason);
    if (fallback) uploaded.push(fallback);
  }
  return uploaded;
}

function fileToInlineEvidence(file, reason) {
  return new Promise(async (resolve) => {
    if (!file.type.startsWith("image/")) {
      alert(`ข้ามไฟล์ ${file.name}: รองรับเฉพาะรูปภาพ`);
      resolve(null);
      return;
    }
    const prepared = await compressImageFile(file, { maxBytes: 420 * 1024 });
    const reader = new FileReader();
    reader.onload = () => {
      resolve({
        name: file.name,
        path: "",
        url: reader.result,
        contentType: prepared.contentType,
        originalSize: file.size,
        size: prepared.blob.size,
        source: "firestore-inline",
        note: reason,
        uploadedAt: new Date().toISOString()
      });
    };
    reader.onerror = () => {
      alert(`อ่านไฟล์ ${file.name} ไม่สำเร็จ`);
      resolve(null);
    };
    reader.readAsDataURL(prepared.blob);
  });
}

async function compressImageFile(file, options = {}) {
  const maxBytes = options.maxBytes || 650 * 1024;
  const image = await loadImage(file);
  let maxDimension = options.maxDimension || 1600;
  let quality = 0.82;
  let blob = null;

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const { canvas } = drawImageToCanvas(image, maxDimension);
    blob = await canvasToBlob(canvas, "image/jpeg", quality);
    if (blob.size <= maxBytes) break;
    if (quality > 0.45) {
      quality -= 0.12;
    } else {
      maxDimension = Math.max(720, Math.floor(maxDimension * 0.78));
      quality = 0.72;
    }
  }

  return {
    blob,
    contentType: "image/jpeg"
  };
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Cannot load image ${file.name}`));
    };
    image.src = url;
  });
}

function drawImageToCanvas(image, maxDimension) {
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0, width, height);
  return { canvas, width, height };
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Image compression failed"));
        return;
      }
      resolve(blob);
    }, type, quality);
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
  }, { merge: true });
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
    elements.configInput.value = JSON.stringify(config, null, 2);
    return config.projectId ? config : null;
  } catch {
    return null;
  }
}

function defaultResult() {
  return {
    status: "pending",
    vmName: "",
    esxiBuild: "",
    owner: "",
    beforeCa: "",
    beforeKek: "",
    afterCa: "",
    afterKek: "",
    events: "",
    impact: "",
    rootCause: "",
    actualRemediation: "",
    notes: "",
    evidenceImages: [],
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
    label: "RHEL-family Secure Boot check",
    description: "ตรวจ Secure Boot state และอ่าน PK/KEK/db/dbx ด้วย mokutil พร้อมเช็ค shim, GRUB และ kernel จาก repo ที่ support",
    code: `mokutil --sb-state
mokutil --pk
mokutil --kek
mokutil --db
mokutil --dbx
rpm -q shim grub2-efi-x64 grub2-tools kernel`
  };

  const linuxUbuntu = {
    label: "Ubuntu Secure Boot check",
    description: "ตรวจ Secure Boot state และอ่าน PK/KEK/db/dbx ด้วย mokutil พร้อมเช็ค shim-signed, signed GRUB และ kernel",
    code: `mokutil --sb-state
mokutil --pk
mokutil --kek
mokutil --db
mokutil --dbx
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

  if (testCase.os.includes("Ubuntu")) return [linuxUbuntu];
  if (testCase.os.includes("RHEL") || testCase.os.includes("Rocky") || testCase.os.includes("Oracle")) return [linuxRhel];
  if (testCase.id === "1.2") return [{ label: "Windows Secure Boot state", code: "Confirm-SecureBootUEFI" }];
  if (testCase.id === "1.3") return [windowsPatchCheck, windowsCheck, windowsBootloader, windowsBootloaderChain, windowsEventCheck, windowsEventGuide, pkCheck, windowsOnlineUpdate, windowsOfflineUpdate];
  if (testCase.id === "2.2") return [windowsPatchCheck, windowsCheck, windowsBootloader, windowsBootloaderChain, windowsEventCheck, windowsEventGuide, windowsTrigger, esxiNvram, windowsOnlineUpdate, windowsOfflineUpdate];
  if (testCase.id === "4.2") return [bitLocker, windowsPatchCheck, windowsCheck, windowsBootloader, windowsBootloaderChain, windowsEventCheck, windowsTrigger, windowsOnlineUpdate, windowsOfflineUpdate];
  return [windowsPatchCheck, windowsCheck, windowsBootloader, windowsBootloaderChain, windowsEventCheck, windowsEventGuide, windowsTrigger, windowsOnlineUpdate, windowsOfflineUpdate];
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

function formatBytes(bytes) {
  if (!bytes) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
