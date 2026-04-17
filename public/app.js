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

const cases = [
  {
    id: "1.1",
    section: "Windows Server 2019 บน ESXi 7.0",
    title: "Baseline EFI + Secure Boot ON",
    purpose: "ดูว่า Windows Server 2019 บน ESXi 7.0 update CA 2023 ได้และค่า persist หลัง reboot หรือไม่",
    os: "Windows Server 2019",
    esxi: "ESXi 7.0",
    firmware: "EFI",
    secureBoot: "ON",
    vtpm: "OFF",
    encryption: "OFF",
    steps: [
      "ติดตั้ง Windows Server 2019",
      "Windows Update ให้ล่าสุด",
      "Install VMware Tools",
      "run check ก่อนเริ่ม",
      "trigger Secure Boot update",
      "reboot 2 รอบ",
      "run check ซ้ำหลัง reboot แต่ละรอบ"
    ],
    expected: [
      "Confirm-SecureBootUEFI = True",
      "Windows UEFI CA 2023 = True",
      "Microsoft Corporation KEK 2K CA 2023 = True",
      "ค่าไม่หายหลัง reboot รอบที่ 2"
    ],
    remediation: [
      "ถ้า CA/KEK หายหลัง reboot ให้สงสัย ESXi 7 / NVRAM persistence",
      "patch ESXi 7 ให้ล่าสุด",
      "ตรวจ datastore/snapshot chain",
      "ถ้ายัง fail ให้ migrate ไป ESXi 8.0.2+ แล้ว retest"
    ]
  },
  {
    id: "1.2",
    section: "Windows Server 2019 บน ESXi 7.0",
    title: "EFI + Secure Boot OFF",
    purpose: "ยืนยันว่า VM ที่ปิด Secure Boot จะไม่โดน enforcement โดยตรง แต่เป็น compliance exception",
    os: "Windows Server 2019",
    esxi: "ESXi 7.0",
    firmware: "EFI",
    secureBoot: "OFF",
    vtpm: "N/A",
    encryption: "N/A",
    steps: ["boot VM", "run Confirm-SecureBootUEFI", "บันทึกผล"],
    expected: [
      "command จะ return False หรือไม่สามารถ confirm Secure Boot ได้",
      "VM ไม่อยู่ในกลุ่มที่ Windows Secure Boot CA 2023 rollout มีผลโดยตรง"
    ],
    remediation: [
      "ถ้า policy ต้องเปิด Secure Boot ให้เปิด Secure Boot แล้วกลับไปทำ test 1.1",
      "ถ้าเปิดไม่ได้ ให้บันทึกเป็น exception"
    ]
  },
  {
    id: "1.3",
    section: "Windows Server 2019 บน ESXi 7.0",
    title: "Invalid PK / Missing KEK check",
    purpose: "ตรวจว่า VM มีปัญหา PK invalid หรือ KEK 2023 missing หรือไม่",
    os: "Windows Server 2019",
    esxi: "ESXi 7.0",
    firmware: "EFI",
    secureBoot: "ON",
    vtpm: "Optional",
    encryption: "Optional",
    steps: ["check KEK 2023", "export และ dump PK.der ด้วย certutil"],
    expected: ["KEK 2023 ควรเป็น True", "certutil -dump PK.der ต้องอ่าน certificate ได้ปกติ"],
    remediation: [
      "ถ้า KEK 2023 missing และ VM เกิดจาก ESXi เก่า ให้ regenerate .nvram",
      "ถ้า PK invalid ให้ทำ manual PK update ตาม Broadcom KB 423919"
    ]
  },
  {
    id: "2.1",
    section: "Windows Server 2019 บน ESXi 8.0",
    title: "Baseline EFI + Secure Boot ON",
    purpose: "ใช้เป็น baseline ว่า Windows Server 2019 บน ESXi 8.0 update ได้ปกติหรือไม่",
    os: "Windows Server 2019",
    esxi: "ESXi 8.0.2+",
    firmware: "EFI",
    secureBoot: "ON",
    vtpm: "OFF",
    encryption: "OFF",
    steps: ["ติดตั้ง Windows Server 2019", "patch OS ให้ล่าสุด", "install VMware Tools", "run check ก่อนเริ่ม", "trigger Secure Boot update", "reboot 2 รอบ", "run check ซ้ำ"],
    expected: ["CA 2023 และ KEK 2023 เป็น True", "ไม่มี event 1801/1795/1796 วนซ้ำ"],
    remediation: ["ตรวจว่า VM ถูกสร้างบน ESXi ก่อน 8.0.2 หรือไม่", "ตรวจ .nvram", "ตรวจ PK invalid"]
  },
  {
    id: "2.2",
    section: "Windows Server 2019 บน ESXi 8.0",
    title: "VM เก่าที่ย้ายมาจาก ESXi 7.0",
    purpose: "จำลอง production VM ที่สร้างบน ESXi 7 แล้ว migrate มา ESXi 8",
    os: "Windows Server 2019",
    esxi: "ESXi 8.0.2+",
    firmware: "EFI",
    secureBoot: "ON",
    vtpm: "Optional",
    encryption: "Optional",
    steps: ["power on VM บน ESXi 8.0.2+", "check KEK 2023", "trigger update", "reboot 2 รอบ", "check CA/KEK ซ้ำ"],
    expected: ["ถ้า VM ไม่มี legacy NVRAM issue ต้องผ่านเหมือน test 2.1"],
    remediation: ["power off VM", "upgrade VM compatibility เป็น latest supported", "rename .nvram เป็น backup", "power on ให้ ESXi generate NVRAM ใหม่", "check KEK/CA ใหม่"]
  },
  {
    id: "3.1",
    section: "Windows Server 2022 บน ESXi 7.0",
    title: "Baseline EFI + Secure Boot ON",
    purpose: "ทดสอบกลุ่มเสี่ยงสำคัญ เพราะ Windows Server 2022 + Secure Boot เคยมีประเด็นกับ ESXi 7.x",
    os: "Windows Server 2022",
    esxi: "ESXi 7.0",
    firmware: "EFI",
    secureBoot: "ON",
    vtpm: "OFF",
    encryption: "OFF",
    steps: ["ติดตั้ง Windows Server 2022", "patch OS ให้ล่าสุด", "install VMware Tools", "run check ก่อนเริ่ม", "trigger Secure Boot update", "reboot 2 รอบ", "check CA/KEK/Event log"],
    expected: ["CA 2023 และ KEK 2023 เป็น True", "VM boot ได้ทุก reboot", "ค่า persist หลัง reboot"],
    remediation: ["ถ้า boot เข้า UEFI Boot Manager หรือ boot ไม่ขึ้น ให้ capture screenshot", "ถ้า event 1801/1795/1796 วนซ้ำ ให้ตรวจ PK/KEK/NVRAM", "ถ้าเป็น production pattern ให้พิจารณา migrate ไป ESXi 8.0.2+"]
  },
  {
    id: "3.2",
    section: "Windows Server 2022 บน ESXi 7.0",
    title: "Reboot persistence test",
    purpose: "ทดสอบเฉพาะว่า UEFI variable บน ESXi 7 หายหลัง reboot หรือไม่",
    os: "Windows Server 2022",
    esxi: "ESXi 7.0",
    firmware: "EFI",
    secureBoot: "ON",
    vtpm: "OFF",
    encryption: "OFF",
    steps: ["หลัง test 3.1 ผ่าน ให้จดผล CA/KEK", "reboot VM รอบที่ 1 แล้ว check", "reboot VM รอบที่ 2 แล้ว check", "power off VM แล้ว power on ใหม่ แล้ว check"],
    expected: ["CA/KEK 2023 ยังเป็น True ทุกครั้ง"],
    remediation: ["จัดว่า impacted จาก NVRAM persistence", "patch ESXi 7", "ตรวจ datastore", "migrate ไป ESXi 8 แล้ว retest"]
  },
  {
    id: "4.1",
    section: "Windows Server 2022 บน ESXi 8.0",
    title: "Baseline EFI + Secure Boot ON",
    purpose: "ใช้เป็น baseline หลักสำหรับ Windows Server รุ่นใหม่",
    os: "Windows Server 2022",
    esxi: "ESXi 8.0.2+",
    firmware: "EFI",
    secureBoot: "ON",
    vtpm: "OFF",
    encryption: "OFF",
    steps: ["ติดตั้ง Windows Server 2022", "patch OS ให้ล่าสุด", "install VMware Tools", "run check ก่อนเริ่ม", "trigger Secure Boot update", "reboot 2 รอบ", "check CA/KEK/Event log"],
    expected: ["CA 2023 และ KEK 2023 เป็น True", "ไม่มี event failure วนซ้ำ", "VM boot ได้ปกติ"],
    remediation: ["ตรวจว่า VM สร้างก่อน ESXi 8.0.2 หรือไม่", "ตรวจ PK invalid", "regenerate .nvram ถ้า KEK 2023 missing"]
  },
  {
    id: "4.2",
    section: "Windows Server 2022 บน ESXi 8.0",
    title: "vTPM + BitLocker",
    purpose: "ทดสอบ risk ตอน Secure Boot key เปลี่ยนกับ VM ที่ encrypt disk",
    os: "Windows Server 2022",
    esxi: "ESXi 8.0.2+",
    firmware: "EFI",
    secureBoot: "ON",
    vtpm: "ON",
    encryption: "BitLocker",
    steps: ["ตรวจ BitLocker ด้วย manage-bde", "Suspend-BitLocker -MountPoint C: -RebootCount 2", "trigger Secure Boot update", "reboot 2 รอบ", "check CA/KEK", "ตรวจว่า BitLocker กลับมาปกติ"],
    expected: ["VM boot ได้", "ไม่ถาม recovery key หรือถ้าถามต้อง recover ได้", "CA/KEK 2023 เป็น True"],
    remediation: ["ใช้ recovery key", "restore snapshot ถ้า boot ไม่ได้", "ทำ change control ใหม่ก่อน retry"]
  },
  {
    id: "5.1",
    section: "Windows Server 2025 บน ESXi 8.0",
    title: "New OS baseline",
    purpose: "ใช้ยืนยันว่า OS รุ่นใหม่ไม่มีปัญหาใน ESXi 8 baseline",
    os: "Windows Server 2025",
    esxi: "ESXi 8.0.2+",
    firmware: "EFI",
    secureBoot: "ON",
    vtpm: "OFF",
    encryption: "OFF",
    steps: ["ติดตั้ง Windows Server 2025", "patch OS ให้ล่าสุด", "install VMware Tools", "run check ก่อนเริ่ม", "trigger Secure Boot update", "reboot 2 รอบ", "check CA/KEK/Event log"],
    expected: ["CA 2023 และ KEK 2023 เป็น True", "VM boot ได้ปกติ"],
    remediation: ["ตรวจ PK/KEK/NVRAM", "ตรวจ ESXi patch level"]
  },
  {
    id: "6.1",
    section: "Windows 10 22H2 บน ESXi 7.0",
    title: "Client legacy baseline",
    purpose: "ทดสอบ Windows 10 VM ที่ยังมีอยู่ใน production",
    os: "Windows 10 22H2",
    esxi: "ESXi 7.0",
    firmware: "EFI",
    secureBoot: "ON",
    vtpm: "Optional",
    encryption: "Optional",
    steps: ["ติดตั้งหรือ clone Windows 10 22H2", "patch ให้ล่าสุดตาม support/ESU ที่มี", "run check ก่อนเริ่ม", "trigger Secure Boot update", "reboot 2 รอบ", "check CA/KEK/Event log"],
    expected: ["ถ้าอยู่ใน supported servicing/ESU ต้อง update ได้", "ถ้าไม่มี support/ESU ให้จัดเป็น exception"],
    remediation: ["ตรวจ ESXi 7 NVRAM persistence", "ตรวจ PK/KEK", "พิจารณา upgrade เป็น Windows 11 หรือ supported OS"]
  },
  {
    id: "7.1",
    section: "Windows 11 บน ESXi 8.0",
    title: "Windows 11 baseline",
    purpose: "baseline สำหรับ Windows client รุ่นใหม่",
    os: "Windows 11 24H2",
    esxi: "ESXi 8.0.2+",
    firmware: "EFI",
    secureBoot: "ON",
    vtpm: "ON",
    encryption: "Optional",
    steps: ["ติดตั้ง Windows 11", "patch ให้ล่าสุด", "install VMware Tools", "run check ก่อนเริ่ม", "trigger Secure Boot update", "reboot 2 รอบ", "check CA/KEK/Event log"],
    expected: ["CA 2023 และ KEK 2023 เป็น True", "boot manager update สำเร็จ", "VM boot ได้ปกติ"],
    remediation: ["ตรวจ vTPM requirement", "ตรวจ PK/KEK/NVRAM", "ถ้าเป็น standalone ESXi ที่จัดการ vTPM ไม่ได้ ให้ทดสอบบน vCenter-managed environment"]
  },
  {
    id: "8.1",
    section: "Linux RHEL-family บน ESXi 8.0",
    title: "Secure Boot baseline",
    purpose: "ตรวจว่า Linux VM boot chain ยังผ่าน Secure Boot หลัง update package",
    os: "RHEL/Rocky/Alma/Oracle Linux 8/9",
    esxi: "ESXi 8.0.2+",
    firmware: "EFI",
    secureBoot: "ON",
    vtpm: "Optional",
    encryption: "Optional",
    steps: ["ติดตั้ง OS จาก supported ISO", "update package ล่าสุด", "run mokutil --sb-state/--pk/--kek/--db/--dbx", "rpm -q shim grub2-efi-x64 grub2-tools kernel", "reboot 2 รอบ", "run check ซ้ำ"],
    expected: ["SecureBoot enabled", "boot ได้ทุกครั้ง", "shim/grub/kernel มาจาก supported repo"],
    remediation: ["ปิด Secure Boot ชั่วคราว", "boot เข้า OS", "update shim, grub2, kernel", "เปิด Secure Boot กลับแล้ว retest"]
  },
  {
    id: "9.1",
    section: "Ubuntu LTS บน ESXi 8.0",
    title: "Secure Boot baseline",
    purpose: "ตรวจ Ubuntu VM ที่เปิด Secure Boot",
    os: "Ubuntu 22.04/24.04 LTS",
    esxi: "ESXi 8.0.2+",
    firmware: "EFI",
    secureBoot: "ON",
    vtpm: "Optional",
    encryption: "Optional",
    steps: ["ติดตั้ง OS จาก supported ISO", "update package ล่าสุด", "run mokutil --sb-state/--pk/--kek/--db/--dbx", "dpkg -l shim-signed shim grub-efi-amd64-signed grub2-common linux-image-generic", "reboot 2 รอบ", "run check ซ้ำ"],
    expected: ["SecureBoot enabled", "boot ได้ทุกครั้ง", "shim-signed และ GRUB เป็น package จาก supported repo"],
    remediation: ["ปิด Secure Boot ชั่วคราว", "update shim-signed, signed GRUB, kernel", "เปิด Secure Boot กลับแล้ว retest"]
  }
];

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
  visibleCases.forEach((testCase) => elements.list.appendChild(renderCase(testCase)));
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
  fillCommands(fragment.querySelector(".commands"), getCommands(testCase));

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

function fillList(container, items) {
  items.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    container.appendChild(li);
  });
}

function fillCommands(container, commands) {
  container.innerHTML = "";
  commands.forEach((item) => {
    const box = document.createElement("div");
    box.className = "command-box";
    box.innerHTML = `
      <strong>${escapeHtml(item.label)}</strong>
      <pre><code>${escapeHtml(item.code)}</code></pre>
    `;
    container.appendChild(box);
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
    findings.push("เริ่มจาก Windows Server 2022 บน ESXi 8.0 และ ESXi 7.0 เพื่อเทียบ baseline กับ risk");
  } else {
    findings.push(`ความคืบหน้ารวม ${summary.completed}/${cases.length} test cases`);
    findings.push(`ผ่านแล้ว ${summary.pass} test cases`);
    if (summary.fail) findings.push(`มี fail ${summary.fail} test cases ต้องทำ remediation และ retest`);
    if (summary.impact) findings.push(`มี impact ${summary.impact} test cases ต้องติดตาม owner/root cause`);
    if (!summary.fail && !summary.impact) findings.push("ยังไม่พบ impact จากผลที่บันทึกไว้");
  }

  const pendingCritical = ["3.1", "3.2", "4.1", "4.2"].filter((id) => (results[id] || defaultResult()).status === "pending");
  if (pendingCritical.length) findings.push(`minimum critical tests ที่ยัง pending: ${pendingCritical.join(", ")}`);

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
    subscribeToResults();
  } catch (error) {
    console.error(error);
    setSync(`เชื่อม Firebase ไม่สำเร็จ, ใช้ local fallback: ${error.message}`);
  }
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
    label: "Windows check CA / KEK / events",
    code: `Confirm-SecureBootUEFI

[System.Text.Encoding]::ASCII.GetString((Get-SecureBootUEFI db).Bytes) -match 'Windows UEFI CA 2023'
[System.Text.Encoding]::ASCII.GetString((Get-SecureBootUEFI KEK).Bytes) -match 'Microsoft Corporation KEK 2K CA 2023'

Get-ItemProperty -Path HKLM:\\SYSTEM\\CurrentControlSet\\Control\\SecureBoot -Name AvailableUpdates -ErrorAction SilentlyContinue
Get-ItemProperty -Path HKLM:\\SYSTEM\\CurrentControlSet\\Control\\SecureBoot\\Servicing -ErrorAction SilentlyContinue

Get-WinEvent -FilterHashtable @{LogName='System'; Id=1795,1796,1801,1808} -MaxEvents 20 |
  Select-Object TimeCreated, Id, ProviderName, Message`
  };

  const windowsTrigger = {
    label: "Windows trigger Secure Boot update",
    code: `reg add HKLM\\SYSTEM\\CurrentControlSet\\Control\\SecureBoot /v MicrosoftUpdateManagedOptIn /t REG_DWORD /d 1 /f
Start-ScheduledTask -TaskName "\\Microsoft\\Windows\\PI\\Secure-Boot-Update"`
  };

  const bitLocker = {
    label: "BitLocker check / suspend",
    code: `manage-bde -status
manage-bde -protectors -get C:
Suspend-BitLocker -MountPoint C: -RebootCount 2`
  };

  const pkCheck = {
    label: "Windows PK check",
    code: `$pk = Get-SecureBootUEFI -Name PK
$bytes = $pk.Bytes
$cert = $bytes[44..($bytes.Length-1)]
[IO.File]::WriteAllBytes("PK.der", $cert)
certutil -dump PK.der`
  };

  const linuxRhel = {
    label: "RHEL-family Secure Boot check",
    code: `mokutil --sb-state
mokutil --pk
mokutil --kek
mokutil --db
mokutil --dbx
rpm -q shim grub2-efi-x64 grub2-tools kernel`
  };

  const linuxUbuntu = {
    label: "Ubuntu Secure Boot check",
    code: `mokutil --sb-state
mokutil --pk
mokutil --kek
mokutil --db
mokutil --dbx
dpkg -l shim-signed shim grub-efi-amd64-signed grub2-common linux-image-generic`
  };

  const esxiNvram = {
    label: "ESXi NVRAM remediation reference",
    code: `# Power off VM first
# Datastore browser or ESXi shell:
mv vmname.nvram vmname.nvram_old

# Power on VM to regenerate NVRAM
# Then rerun Windows CA/KEK checks`
  };

  if (testCase.os.includes("Ubuntu")) return [linuxUbuntu];
  if (testCase.os.includes("RHEL") || testCase.os.includes("Rocky") || testCase.os.includes("Oracle")) return [linuxRhel];
  if (testCase.id === "1.2") return [{ label: "Windows Secure Boot state", code: "Confirm-SecureBootUEFI" }];
  if (testCase.id === "1.3") return [windowsCheck, pkCheck];
  if (testCase.id === "2.2") return [windowsCheck, windowsTrigger, esxiNvram];
  if (testCase.id === "4.2") return [bitLocker, windowsCheck, windowsTrigger];
  return [windowsCheck, windowsTrigger];
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
