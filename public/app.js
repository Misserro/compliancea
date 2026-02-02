// ============================================
// Tab Navigation
// ============================================
const tabBtns = document.querySelectorAll(".tab-btn");
const tabContents = document.querySelectorAll(".tab-content");

function switchTab(tabId) {
  tabBtns.forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tab === tabId);
  });
  tabContents.forEach(content => {
    content.classList.toggle("active", content.id === `tab-${tabId}`);
  });

  // Refresh document selects when switching to Desk tab
  if (tabId === "desk") {
    renderDeskDocumentSelects();
  }

  // Refresh statistics when switching to Statistics tab
  if (tabId === "statistics") {
    renderStatistics();
  }

  // Load settings when switching to Settings tab
  if (tabId === "settings") {
    loadSettings();
  }
}

tabBtns.forEach(btn => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

// ============================================
// Document Library Elements (Tab 1)
// ============================================
const scanBtn = document.getElementById("scanBtn");
const processAllBtn = document.getElementById("processAllBtn");
const embeddingStatusEl = document.getElementById("embeddingStatus");
const libraryStatusEl = document.getElementById("libraryStatus");
const documentListEl = document.getElementById("documentList");
const uploadFileInput = document.getElementById("uploadFileInput");
const uploadCategoryInput = document.getElementById("uploadCategoryInput");
const uploadBtn = document.getElementById("uploadBtn");

// ============================================
// Document Analyzer Elements (Tab 2)
// ============================================
const analyzeForm = document.getElementById("analyzeForm");
const analyzerFileInput = document.getElementById("analyzerFileInput");
const analyzerOutputsWrap = document.getElementById("analyzerOutputs");
const analyzerTranslateTo = document.getElementById("analyzerTranslateTo");
const analyzeBtn = document.getElementById("analyzeBtn");
const analyzerClearBtn = document.getElementById("analyzerClearBtn");
const analyzerStatusEl = document.getElementById("analyzerStatus");

// Analyzer Results
const analyzerResultsCard = document.getElementById("analyzerResultsCard");
const analyzerTranslationBlock = document.getElementById("analyzerTranslationBlock");
const analyzerSummaryBlock = document.getElementById("analyzerSummaryBlock");
const analyzerKeyPointsBlock = document.getElementById("analyzerKeyPointsBlock");
const analyzerTodosBlock = document.getElementById("analyzerTodosBlock");

const analyzerTranslatedDisclosure = document.getElementById("analyzerTranslatedDisclosure");
const analyzerTranslatedDocEl = document.getElementById("analyzerTranslatedDoc");
const analyzerSummaryEl = document.getElementById("analyzerSummary");
const analyzerKeyPointsEl = document.getElementById("analyzerKeyPoints");
const analyzerTodosEl = document.getElementById("analyzerTodos");

const exportAnalyzerTranslationBtn = document.getElementById("exportAnalyzerTranslationBtn");
const exportAnalyzerTodosBtn = document.getElementById("exportAnalyzerTodosBtn");

// ============================================
// Desk Elements (Tab 3)
// ============================================
const deskDocumentSelectEl = document.getElementById("deskDocumentSelect");
const deskCrossRefSelectEl = document.getElementById("deskCrossRefSelect");
const questionInput = document.getElementById("questionInput");
const askBtn = document.getElementById("askBtn");
const qaStatusEl = document.getElementById("qaStatus");
const answerSection = document.getElementById("answerSection");
const answerContent = document.getElementById("answerContent");
const sourcesSection = document.getElementById("sourcesSection");
const sourcesList = document.getElementById("sourcesList");

const deskExternalFile = document.getElementById("deskExternalFile");
const deskOutputsWrap = document.getElementById("deskOutputs");
const deskPrefillField = document.getElementById("deskPrefillField");
const deskPrefillToggle = document.getElementById("deskPrefillToggle");
const deskTranslateTo = document.getElementById("deskTranslateTo");
const deskAnalyzeBtn = document.getElementById("deskAnalyzeBtn");
const deskClearBtn = document.getElementById("deskClearBtn");
const deskStatusEl = document.getElementById("deskStatus");

// Select All buttons
const qaSelectAllBtn = document.getElementById("qaSelectAllBtn");
const crossRefSelectAllBtn = document.getElementById("crossRefSelectAllBtn");

// Cross-reference field (for showing/hiding)
const deskCrossRefField = document.getElementById("deskCrossRefField");

// Model indicator
const deskModelIndicator = document.getElementById("deskModelIndicator");

// Desk Results
const deskResultsCard = document.getElementById("deskResultsCard");
const deskCrossRefBlock = document.getElementById("deskCrossRefBlock");
const deskTemplateBlock = document.getElementById("deskTemplateBlock");
const deskCrossRefEl = document.getElementById("deskCrossRef");
const deskTemplateBoxEl = document.getElementById("deskTemplateBox");
const exportDeskTemplateBtn = document.getElementById("exportDeskTemplateBtn");

// ============================================
// Statistics Elements (Tab 4)
// ============================================
const statsContentEl = document.getElementById("statsContent");

// ============================================
// Settings Elements (Tab 5)
// ============================================
const settingHaikuEl = document.getElementById("settingHaiku");
const settingSkipTranslationEl = document.getElementById("settingSkipTranslation");
const settingRelevanceThresholdEl = document.getElementById("settingRelevanceThreshold");
const settingRelevanceValueEl = document.getElementById("settingRelevanceValue");
const relevanceValueDisplayEl = document.getElementById("relevanceValueDisplay");
const settingMinResultsEl = document.getElementById("settingMinResults");
const relevanceThresholdValueSettingEl = document.getElementById("relevanceThresholdValueSetting");
const minResultsSettingEl = document.getElementById("minResultsSetting");
const saveSettingsBtn = document.getElementById("saveSettingsBtn");
const resetSettingsBtn = document.getElementById("resetSettingsBtn");
const settingsStatusEl = document.getElementById("settingsStatus");

// ============================================
// Shared State
// ============================================
const DEPARTMENTS = ["Finance", "Compliance", "Operations", "HR", "Board", "IT"];
let documents = [];
let analyzerLastResult = null;
let deskLastResult = null;
let deskTemplateText = "";

// Statistics tracking
let lastStatistics = null;

// Settings state (moved up for availability)
let currentSettings = null;

// ============================================
// Utility Functions
// ============================================

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "'");
}

function normalizeArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
}

function setStatusElement(el, message, kind = "info") {
  el.style.display = "block";
  el.classList.remove("good", "bad", "warn");
  if (kind === "good") el.classList.add("good");
  if (kind === "bad") el.classList.add("bad");
  if (kind === "warn") el.classList.add("warn");
  el.textContent = message;
}

function hideStatusElement(el) {
  el.style.display = "none";
}

function downloadBlob(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function formatNumber(num) {
  return num.toLocaleString();
}

function formatCost(cost) {
  return `$${cost.toFixed(6)}`;
}

// ============================================
// Statistics Functions (Tab 4)
// ============================================

// Pricing constants (per 1M tokens)
const PRICING = {
  claude: {
    sonnet: {
      input: 3.00,  // $3.00 per 1M input tokens
      output: 15.00 // $15.00 per 1M output tokens
    },
    haiku: {
      input: 0.25,  // $0.25 per 1M input tokens
      output: 1.25  // $1.25 per 1M output tokens
    }
  },
  voyage: 0.02 // $0.02 per 1M tokens
};

function calculateCosts(tokenUsage) {
  const costs = {
    claude: { input: 0, output: 0, total: 0 },
    voyage: 0,
    total: 0
  };

  if (tokenUsage?.claude) {
    // Determine which pricing to use based on model
    const model = tokenUsage.claude.model || "sonnet";
    const pricing = PRICING.claude[model] || PRICING.claude.sonnet;

    costs.claude.input = (tokenUsage.claude.input / 1_000_000) * pricing.input;
    costs.claude.output = (tokenUsage.claude.output / 1_000_000) * pricing.output;
    costs.claude.total = costs.claude.input + costs.claude.output;
  }

  if (tokenUsage?.voyage) {
    costs.voyage = (tokenUsage.voyage.tokens / 1_000_000) * PRICING.voyage;
  }

  costs.total = costs.claude.total + costs.voyage;

  return costs;
}

function updateStatistics(actionType, tokenUsage) {
  lastStatistics = {
    actionType,
    timestamp: new Date(),
    tokenUsage,
    costs: calculateCosts(tokenUsage)
  };
}

function renderStatistics() {
  if (!lastStatistics) {
    statsContentEl.innerHTML = `
      <div class="stats-empty">
        <p class="subtle">No statistics available yet. Perform an action (ask a question, analyze a document, or use the desk) to see token usage.</p>
      </div>
    `;
    return;
  }

  const { actionType, timestamp, tokenUsage, costs } = lastStatistics;

  const timeStr = timestamp.toLocaleString();

  let html = `
    <div class="last-action-info">
      <div class="action-type">Last Action: ${escapeHtml(actionType)}</div>
      <div class="action-time">${escapeHtml(timeStr)}</div>
    </div>

    <div class="stats-summary">
      <h3>Total Estimated Cost</h3>
      <div class="summary-row">
        <span class="label">This action cost approximately</span>
        <span class="value">${formatCost(costs.total)}</span>
      </div>
    </div>

    <div class="stats-grid">
  `;

  // Claude stats
  if (tokenUsage?.claude) {
    const model = tokenUsage.claude.model || "sonnet";
    const modelDisplay = model === "haiku" ? "Haiku" : "Sonnet";
    const usedHaiku = tokenUsage.claude.usedHaikuForExtraction;

    html += `
      <div class="stat-card">
        <h4>
          <span class="service-badge claude">Claude</span>
          <span class="model-badge ${model}">${modelDisplay}</span>
          Token Usage
        </h4>
        ${usedHaiku ? `
          <div class="stat-note">
            <span class="note-icon">💡</span>
            Haiku was used for question extraction (cost optimization)
          </div>
        ` : ""}
        <div class="stat-row">
          <span class="stat-label">Input Tokens</span>
          <span class="stat-value">${formatNumber(tokenUsage.claude.input)}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Output Tokens</span>
          <span class="stat-value">${formatNumber(tokenUsage.claude.output)}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Total Tokens</span>
          <span class="stat-value highlight">${formatNumber(tokenUsage.claude.total)}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Estimated Cost</span>
          <span class="stat-value cost">${formatCost(costs.claude.total)}</span>
        </div>
      </div>
    `;
  }

  // Voyage stats
  if (tokenUsage?.voyage) {
    html += `
      <div class="stat-card">
        <h4>
          <span class="service-badge voyage">Voyage AI</span>
          Token Usage
        </h4>
        <div class="stat-row">
          <span class="stat-label">Embedding Tokens</span>
          <span class="stat-value">${formatNumber(tokenUsage.voyage.tokens)}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Estimated Cost</span>
          <span class="stat-value cost">${formatCost(costs.voyage)}</span>
        </div>
      </div>
    `;
  }

  html += `</div>`;

  statsContentEl.innerHTML = html;
}

// ============================================
// Document Library Functions (Tab 1)
// ============================================

async function checkEmbeddingStatus() {
  try {
    const res = await fetch("/api/embeddings/status");
    const data = await res.json();

    if (data.available) {
      embeddingStatusEl.textContent = "Voyage AI: Ready";
      embeddingStatusEl.className = "embedding-status ready";
    } else {
      embeddingStatusEl.textContent = `Voyage AI: ${data.error || "Not available"}`;
      embeddingStatusEl.className = "embedding-status error";
    }

    return data.available;
  } catch (err) {
    embeddingStatusEl.textContent = "Voyage AI: Connection error";
    embeddingStatusEl.className = "embedding-status error";
    return false;
  }
}

async function loadDocuments() {
  try {
    const res = await fetch("/api/documents");
    const data = await res.json();
    documents = data.documents || [];
    renderDocumentList();
  } catch (err) {
    console.error("Error loading documents:", err);
    documentListEl.innerHTML = `<p class="subtle">Error loading documents: ${escapeHtml(err.message)}</p>`;
  }
}

async function uploadDocument() {
  const file = uploadFileInput.files?.[0];
  if (!file) {
    setStatusElement(libraryStatusEl, "Please select a file to upload.", "warn");
    return;
  }

  if (!/\.(pdf|docx)$/i.test(file.name)) {
    setStatusElement(libraryStatusEl, "Only PDF and DOCX files are allowed.", "warn");
    return;
  }

  uploadBtn.disabled = true;
  setStatusElement(libraryStatusEl, "Uploading document...", "info");

  try {
    const fd = new FormData();
    fd.append("file", file);

    const category = uploadCategoryInput.value;
    if (category) {
      fd.append("category", category);
    }

    const res = await fetch("/api/documents/upload", {
      method: "POST",
      body: fd
    });

    const data = await res.json();

    if (res.ok) {
      setStatusElement(libraryStatusEl, `Uploaded: ${data.document.name}`, "good");
      uploadFileInput.value = "";
      uploadCategoryInput.value = "";
      await loadDocuments();
    } else {
      setStatusElement(libraryStatusEl, data.error || "Upload failed", "bad");
    }
  } catch (err) {
    setStatusElement(libraryStatusEl, `Error: ${err.message}`, "bad");
  } finally {
    uploadBtn.disabled = false;
  }
}

function renderDocumentList() {
  if (documents.length === 0) {
    documentListEl.innerHTML = `<p class="subtle">No documents found. Upload a document or scan the server folder.</p>`;
    return;
  }

  // Group documents by category
  const grouped = {};
  const uncategorized = [];

  for (const doc of documents) {
    if (doc.category && DEPARTMENTS.includes(doc.category)) {
      if (!grouped[doc.category]) {
        grouped[doc.category] = [];
      }
      grouped[doc.category].push(doc);
    } else {
      uncategorized.push(doc);
    }
  }

  const renderDocItem = (doc) => {
    const statusClass = doc.processed ? "processed" : "unprocessed";
    const statusText = doc.processed ? `${doc.word_count} words` : "Not processed";
    const dateStr = new Date(doc.added_at).toLocaleDateString();

    return `
      <div class="doc-item ${statusClass}" data-id="${doc.id}">
        <div class="doc-info">
          <span class="doc-name">${escapeHtml(doc.name)}</span>
          <div class="doc-meta">
            <span class="doc-status ${statusClass}">${statusText}</span>
            <span class="doc-date">${dateStr}</span>
          </div>
        </div>
        <div class="doc-category-select">
          <select class="category-select" data-id="${doc.id}">
            <option value="">No Category</option>
            ${DEPARTMENTS.map(dept => `<option value="${dept}" ${doc.category === dept ? "selected" : ""}>${dept}</option>`).join("")}
          </select>
        </div>
        <div class="doc-actions">
          ${!doc.processed ? `<button class="btn-process" data-id="${doc.id}">Process</button>` : ""}
          <button class="btn-delete" data-id="${doc.id}">Delete</button>
        </div>
      </div>
    `;
  };

  let html = "";

  // Render by category
  for (const dept of DEPARTMENTS) {
    if (grouped[dept] && grouped[dept].length > 0) {
      html += `<div class="doc-category-group">
        <div class="doc-category-header">${escapeHtml(dept)}</div>
        ${grouped[dept].map(renderDocItem).join("")}
      </div>`;
    }
  }

  // Render uncategorized
  if (uncategorized.length > 0) {
    html += `<div class="doc-category-group">
      <div class="doc-category-header">Uncategorized</div>
      ${uncategorized.map(renderDocItem).join("")}
    </div>`;
  }

  documentListEl.innerHTML = html;

  // Add event listeners
  documentListEl.querySelectorAll(".btn-process").forEach(btn => {
    btn.addEventListener("click", () => processDocument(parseInt(btn.dataset.id, 10)));
  });

  documentListEl.querySelectorAll(".btn-delete").forEach(btn => {
    btn.addEventListener("click", () => deleteDocument(parseInt(btn.dataset.id, 10)));
  });

  documentListEl.querySelectorAll(".category-select").forEach(select => {
    select.addEventListener("change", () => updateDocumentCategory(parseInt(select.dataset.id, 10), select.value));
  });
}

async function updateDocumentCategory(id, category) {
  try {
    const res = await fetch(`/api/documents/${id}/category`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: category || null })
    });

    const data = await res.json();

    if (res.ok) {
      // Update local documents array
      const docIndex = documents.findIndex(d => d.id === id);
      if (docIndex !== -1) {
        documents[docIndex].category = category || null;
      }
      renderDocumentList();
      renderDeskDocumentSelects();
    } else {
      setStatusElement(libraryStatusEl, data.error || "Failed to update category", "bad");
    }
  } catch (err) {
    setStatusElement(libraryStatusEl, `Error: ${err.message}`, "bad");
  }
}

async function scanDocuments() {
  scanBtn.disabled = true;
  setStatusElement(libraryStatusEl, "Scanning folder...", "info");

  try {
    const res = await fetch("/api/documents/scan", { method: "POST" });
    const data = await res.json();

    if (res.ok) {
      documents = data.documents || [];
      renderDocumentList();
      setStatusElement(libraryStatusEl, data.message, "good");
    } else {
      setStatusElement(libraryStatusEl, data.error || "Scan failed", "bad");
    }
  } catch (err) {
    setStatusElement(libraryStatusEl, `Error: ${err.message}`, "bad");
  } finally {
    scanBtn.disabled = false;
  }
}

async function processDocument(id) {
  const btn = documentListEl.querySelector(`.btn-process[data-id="${id}"]`);
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Processing...";
  }

  setStatusElement(libraryStatusEl, `Processing document ${id}...`, "info");

  try {
    const res = await fetch(`/api/documents/${id}/process`, { method: "POST" });
    const data = await res.json();

    if (res.ok) {
      setStatusElement(libraryStatusEl, `Processed: ${data.chunks} chunks, ${data.wordCount} words`, "good");
      await loadDocuments();
    } else {
      setStatusElement(libraryStatusEl, data.error || "Processing failed", "bad");
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Process";
      }
    }
  } catch (err) {
    setStatusElement(libraryStatusEl, `Error: ${err.message}`, "bad");
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Process";
    }
  }
}

async function processAllDocuments() {
  const unprocessed = documents.filter(d => !d.processed);

  if (unprocessed.length === 0) {
    setStatusElement(libraryStatusEl, "All documents are already processed.", "good");
    return;
  }

  processAllBtn.disabled = true;
  scanBtn.disabled = true;

  for (let i = 0; i < unprocessed.length; i++) {
    const doc = unprocessed[i];
    setStatusElement(libraryStatusEl, `Processing ${i + 1}/${unprocessed.length}: ${doc.name}...`, "info");

    try {
      const res = await fetch(`/api/documents/${doc.id}/process`, { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        setStatusElement(libraryStatusEl, `Failed on ${doc.name}: ${data.error}`, "bad");
        break;
      }
    } catch (err) {
      setStatusElement(libraryStatusEl, `Error processing ${doc.name}: ${err.message}`, "bad");
      break;
    }
  }

  await loadDocuments();
  setStatusElement(libraryStatusEl, `Finished processing ${unprocessed.length} document(s).`, "good");

  processAllBtn.disabled = false;
  scanBtn.disabled = false;
}

async function deleteDocument(id) {
  if (!confirm("Are you sure you want to delete this document from the library?")) {
    return;
  }

  try {
    const res = await fetch(`/api/documents/${id}`, { method: "DELETE" });
    const data = await res.json();

    if (res.ok) {
      setStatusElement(libraryStatusEl, "Document deleted.", "good");
      await loadDocuments();
    } else {
      setStatusElement(libraryStatusEl, data.error || "Delete failed", "bad");
    }
  } catch (err) {
    setStatusElement(libraryStatusEl, `Error: ${err.message}`, "bad");
  }
}

// Library event listeners
scanBtn.addEventListener("click", scanDocuments);
processAllBtn.addEventListener("click", processAllDocuments);
uploadBtn.addEventListener("click", uploadDocument);

// ============================================
// Document Analyzer Functions (Tab 2)
// ============================================

function getAnalyzerOutputs() {
  const checks = [...analyzerOutputsWrap.querySelectorAll('input[type="checkbox"]')];
  return checks.filter(c => c.checked).map(c => c.value);
}

function updateAnalyzeEnabled() {
  const outputs = getAnalyzerOutputs();
  const enabled = outputs.length >= 1;
  analyzeBtn.disabled = !enabled;

  if (!enabled) {
    setStatusElement(analyzerStatusEl, "Choose at least one output to enable Analyze.", "warn");
  } else {
    setStatusElement(analyzerStatusEl, "Ready.", "info");
  }
}

function hideAnalyzerResultBlocks() {
  analyzerResultsCard.style.display = "none";
  analyzerTranslationBlock.style.display = "none";
  analyzerSummaryBlock.style.display = "none";
  analyzerKeyPointsBlock.style.display = "none";
  analyzerTodosBlock.style.display = "none";
}

function resetAnalyzerResults() {
  analyzerLastResult = null;
  analyzerTranslatedDocEl.textContent = "No data yet.";
  analyzerSummaryEl.textContent = "No data yet.";
  analyzerKeyPointsEl.textContent = "No data yet.";
  analyzerTodosEl.textContent = "No data yet.";
  hideAnalyzerResultBlocks();
}

function renderAnalyzerTranslatedDoc(data) {
  const t = data?.translated_text ?? "";
  analyzerTranslatedDocEl.classList.remove("subtle");
  analyzerTranslatedDocEl.innerHTML = t
    ? `<pre class="doc">${escapeHtml(t)}</pre>`
    : `<p class="subtle">No translated text in response.</p>`;
  if (t) analyzerTranslatedDisclosure.open = true;
}

function renderAnalyzerSummary(data) {
  const summary = data?.summary ?? "";
  analyzerSummaryEl.classList.remove("subtle");
  analyzerSummaryEl.innerHTML = summary
    ? `<p>${escapeHtml(summary)}</p>`
    : `<p class="subtle">No summary in response.</p>`;
}

function renderAnalyzerKeyPoints(data) {
  const items = normalizeArray(data?.key_points ?? []);
  analyzerKeyPointsEl.classList.remove("subtle");

  if (!items.length) {
    analyzerKeyPointsEl.innerHTML = `<p class="subtle">No key points in response.</p>`;
    return;
  }

  analyzerKeyPointsEl.innerHTML = items.map((kp) => {
    const text = kp?.point ?? "";
    const dept = kp?.department ?? "";
    const tags = normalizeArray(kp?.tags).filter(Boolean);
    const deptLabel = DEPARTMENTS.includes(dept) ? dept : "Unassigned";

    return `
      <div class="kp">
        <div class="kp-top">
          <span class="badge">${escapeHtml(deptLabel)}</span>
          ${tags.length
            ? `<div class="tags">${tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join("")}</div>`
            : `<span class="subtle">No tags</span>`
          }
        </div>
        <div>${text ? escapeHtml(text) : "<span class='subtle'>No text</span>"}</div>
      </div>
    `;
  }).join("");
}

function renderAnalyzerTodos(data) {
  const byDeptObj = data?.todos_by_department ?? null;
  analyzerTodosEl.classList.remove("subtle");

  if (!byDeptObj || typeof byDeptObj !== "object" || Array.isArray(byDeptObj)) {
    analyzerTodosEl.innerHTML = `<p class="subtle">No to-dos in response.</p>`;
    return;
  }

  analyzerTodosEl.innerHTML = DEPARTMENTS.map((dept) => {
    const items = normalizeArray(byDeptObj[dept]);
    return `
      <div class="todo-dept">
        <strong>${escapeHtml(dept)}</strong>
        <div style="margin-top:8px;">
          ${items.length ? items.map(renderTodoItem).join("") : `<div class="subtle">No tasks.</div>`}
        </div>
      </div>
    `;
  }).join("");
}

function renderTodoItem(item) {
  const task = item?.task ?? "";
  const source = item?.source_point ?? "";
  return `
    <div class="todo-item">
      <div>${task ? escapeHtml(task) : "<span class='subtle'>No task text</span>"}</div>
      ${source ? `<div class="todo-meta">Source: ${escapeHtml(source)}</div>` : ""}
    </div>
  `;
}

async function safeReadError(res) {
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    const j = await res.json().catch(() => null);
    return j?.error || j?.message || JSON.stringify(j);
  }
  return await res.text().catch(() => "Unknown error");
}

// Analyzer exports
function exportAnalyzerTranslationDocx() {
  if (!analyzerLastResult || !analyzerLastResult.translated_text) {
    setStatusElement(analyzerStatusEl, "No translated text to export.", "warn");
    return;
  }
  const html = `<html><body><pre>${escapeHtml(analyzerLastResult.translated_text)}</pre></body></html>`;
  downloadBlob(html, "translation.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
}

function exportAnalyzerTodosCsv() {
  if (!analyzerLastResult || !analyzerLastResult.todos_by_department) {
    setStatusElement(analyzerStatusEl, "No to-dos to export.", "warn");
    return;
  }

  const rows = [["department", "task", "source_point"]];
  for (const dept of DEPARTMENTS) {
    const items = normalizeArray(analyzerLastResult.todos_by_department[dept]);
    for (const item of items) {
      const task = item?.task ?? "";
      const source = item?.source_point ?? "";
      rows.push([
        dept,
        task.replaceAll('"', '""'),
        source.replaceAll('"', '""')
      ]);
    }
  }

  const csv = rows.map(r => r.map(v => `"${v}"`).join(",")).join("\n");
  downloadBlob(csv, "todos.csv", "text/csv;charset=utf-8;");
}

exportAnalyzerTranslationBtn.addEventListener("click", exportAnalyzerTranslationDocx);
exportAnalyzerTodosBtn.addEventListener("click", exportAnalyzerTodosCsv);

analyzerOutputsWrap.addEventListener("change", updateAnalyzeEnabled);
updateAnalyzeEnabled();

analyzerClearBtn.addEventListener("click", () => {
  resetAnalyzerResults();
  analyzerFileInput.value = "";
  setStatusElement(analyzerStatusEl, "Cleared. Ready.", "info");
});

analyzeForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const file = analyzerFileInput.files?.[0];
  if (!file) {
    setStatusElement(analyzerStatusEl, "Choose a PDF or DOCX file first.", "warn");
    return;
  }

  const outputs = getAnalyzerOutputs();
  if (outputs.length < 1) {
    setStatusElement(analyzerStatusEl, "Choose at least one output.", "warn");
    return;
  }

  analyzeBtn.disabled = true;
  resetAnalyzerResults();
  setStatusElement(analyzerStatusEl, "Uploading and analyzing...", "info");

  try {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("targetLanguage", analyzerTranslateTo.value);
    outputs.forEach(o => fd.append("outputs", o));

    const res = await fetch("/api/analyze", { method: "POST", body: fd });

    if (!res.ok) {
      const details = await safeReadError(res);
      setStatusElement(analyzerStatusEl, `Request failed (${res.status}). ${details || ""}`.trim(), "bad");
      return;
    }

    const data = await res.json();
    analyzerLastResult = data;

    // Update statistics
    if (data.tokenUsage) {
      updateStatistics("Document Analyzer", data.tokenUsage);
    }

    setStatusElement(analyzerStatusEl, "Done.", "good");
    analyzerResultsCard.style.display = "block";

    if (outputs.includes("translation")) {
      analyzerTranslationBlock.style.display = "block";
      renderAnalyzerTranslatedDoc(data);
    }

    if (outputs.includes("summary")) {
      analyzerSummaryBlock.style.display = "block";
      renderAnalyzerSummary(data);
    }

    if (outputs.includes("key_points")) {
      analyzerKeyPointsBlock.style.display = "block";
      renderAnalyzerKeyPoints(data);
    }

    if (outputs.includes("todos")) {
      analyzerTodosBlock.style.display = "block";
      renderAnalyzerTodos(data);
    }
  } catch (err) {
    setStatusElement(analyzerStatusEl, `Network error: ${err?.message || String(err)}`, "bad");
  } finally {
    updateAnalyzeEnabled();
  }
});

// ============================================
// Desk Functions (Tab 3)
// ============================================

function renderDeskDocumentSelects() {
  const processedDocs = documents.filter(d => d.processed);

  if (processedDocs.length === 0) {
    const emptyHtml = `<p class="subtle">No processed documents. Go to Document Library to upload and process documents.</p>`;
    deskDocumentSelectEl.innerHTML = emptyHtml;
    deskCrossRefSelectEl.innerHTML = emptyHtml;
    updateAskButtonState();
    updateDeskAnalyzeState();
    return;
  }

  // Group documents by category
  const grouped = {};
  const uncategorized = [];

  for (const doc of processedDocs) {
    if (doc.category && DEPARTMENTS.includes(doc.category)) {
      if (!grouped[doc.category]) {
        grouped[doc.category] = [];
      }
      grouped[doc.category].push(doc);
    } else {
      uncategorized.push(doc);
    }
  }

  const renderSelectList = (containerId) => {
    let html = "";

    // Render by category
    for (const dept of DEPARTMENTS) {
      if (grouped[dept] && grouped[dept].length > 0) {
        html += `<div class="doc-select-category">
          <div class="doc-select-category-header">${escapeHtml(dept)}</div>
          ${grouped[dept].map(doc => `
            <label class="document-select-item">
              <input type="checkbox" class="${containerId}-checkbox" data-id="${doc.id}" />
              <span class="doc-select-name">${escapeHtml(doc.name)}</span>
              <span class="doc-select-status processed">${doc.word_count} words</span>
            </label>
          `).join("")}
        </div>`;
      }
    }

    // Render uncategorized
    if (uncategorized.length > 0) {
      html += `<div class="doc-select-category">
        <div class="doc-select-category-header">Uncategorized</div>
        ${uncategorized.map(doc => `
          <label class="document-select-item">
            <input type="checkbox" class="${containerId}-checkbox" data-id="${doc.id}" />
            <span class="doc-select-name">${escapeHtml(doc.name)}</span>
            <span class="doc-select-status processed">${doc.word_count} words</span>
          </label>
        `).join("")}
      </div>`;
    }

    return html;
  };

  deskDocumentSelectEl.innerHTML = renderSelectList("qa-doc");
  deskCrossRefSelectEl.innerHTML = renderSelectList("crossref-doc");

  // Add event listeners
  deskDocumentSelectEl.querySelectorAll(".qa-doc-checkbox").forEach(cb => {
    cb.addEventListener("change", updateAskButtonState);
  });

  deskCrossRefSelectEl.querySelectorAll(".crossref-doc-checkbox").forEach(cb => {
    cb.addEventListener("change", updateDeskAnalyzeState);
  });

  updateAskButtonState();
  updateDeskAnalyzeState();
}

function getSelectedQADocumentIds() {
  const checkboxes = deskDocumentSelectEl.querySelectorAll(".qa-doc-checkbox:checked");
  return Array.from(checkboxes).map(cb => parseInt(cb.dataset.id, 10));
}

function getSelectedCrossRefDocumentIds() {
  const checkboxes = deskCrossRefSelectEl.querySelectorAll(".crossref-doc-checkbox:checked");
  return Array.from(checkboxes).map(cb => parseInt(cb.dataset.id, 10));
}

function updateAskButtonState() {
  const selectedIds = getSelectedQADocumentIds();
  const hasQuestion = questionInput.value.trim().length > 0;
  askBtn.disabled = selectedIds.length === 0 || !hasQuestion;

  // Update Select All button text
  const allCheckboxes = deskDocumentSelectEl.querySelectorAll(".qa-doc-checkbox");
  const checkedCount = deskDocumentSelectEl.querySelectorAll(".qa-doc-checkbox:checked").length;
  qaSelectAllBtn.textContent = checkedCount === allCheckboxes.length && allCheckboxes.length > 0 ? "Deselect All" : "Select All";
}

function getDeskOutputs() {
  const checks = [...deskOutputsWrap.querySelectorAll('input[type="checkbox"]')];
  return checks.filter(c => c.checked).map(c => c.value);
}

function updateDeskPrefillVisibility() {
  const outputs = getDeskOutputs();
  const wantsTemplate = outputs.includes("generate_template");
  deskPrefillField.style.display = wantsTemplate ? "block" : "none";

  if (!wantsTemplate) {
    deskPrefillToggle.checked = false;
  }

  // Update cross-ref field visibility based on whether library docs are needed
  updateDeskCrossRefFieldVisibility();
}

function updateDeskCrossRefFieldVisibility() {
  const outputs = getDeskOutputs();
  const wantsCrossRef = outputs.includes("cross_reference");
  const wantsPrefill = deskPrefillToggle.checked;

  // Library documents are only needed for cross-reference or pre-fill
  const needsLibraryDocs = wantsCrossRef || wantsPrefill;

  // Show/hide the cross-ref field and update its required state
  if (deskCrossRefField) {
    deskCrossRefField.style.display = needsLibraryDocs ? "block" : "none";
  }
}

function updateDeskAnalyzeState() {
  const hasExternalFile = deskExternalFile.files?.length > 0;
  const selectedCrossRefIds = getSelectedCrossRefDocumentIds();
  const outputs = getDeskOutputs();

  const wantsCrossRef = outputs.includes("cross_reference");
  const wantsPrefill = deskPrefillToggle.checked;
  const needsLibraryDocs = wantsCrossRef || wantsPrefill;

  // Button is enabled if:
  // 1. External file is selected
  // 2. At least one output is selected
  // 3. If library docs are needed (cross-ref or pre-fill), at least one library doc is selected
  const enabled = hasExternalFile && outputs.length > 0 && (!needsLibraryDocs || selectedCrossRefIds.length > 0);
  deskAnalyzeBtn.disabled = !enabled;

  // Update Select All button text
  const allCheckboxes = deskCrossRefSelectEl.querySelectorAll(".crossref-doc-checkbox");
  const checkedCount = deskCrossRefSelectEl.querySelectorAll(".crossref-doc-checkbox:checked").length;
  crossRefSelectAllBtn.textContent = checkedCount === allCheckboxes.length && allCheckboxes.length > 0 ? "Deselect All" : "Select All";

  // Update model indicator based on current settings
  updateDeskModelIndicator(needsLibraryDocs);
}

function updateDeskModelIndicator(needsLibraryDocs) {
  if (!currentSettings) {
    deskModelIndicator.innerHTML = "";
    return;
  }

  const willUseHaiku = currentSettings.useHaikuForExtraction && needsLibraryDocs;

  if (willUseHaiku) {
    deskModelIndicator.innerHTML = `
      <span class="model-badge-inline sonnet">Sonnet</span> for analysis +
      <span class="model-badge-inline haiku">Haiku</span> for extraction
      <span class="model-savings">💰 Cost optimized</span>
    `;
  } else if (needsLibraryDocs) {
    deskModelIndicator.innerHTML = `
      <span class="model-badge-inline sonnet">Sonnet</span> for all tasks
    `;
  } else {
    deskModelIndicator.innerHTML = `
      <span class="model-badge-inline sonnet">Sonnet</span> for analysis
    `;
  }
}

// Select All functionality
function toggleSelectAllQA() {
  const checkboxes = deskDocumentSelectEl.querySelectorAll(".qa-doc-checkbox");
  const allChecked = Array.from(checkboxes).every(cb => cb.checked);

  checkboxes.forEach(cb => {
    cb.checked = !allChecked;
  });

  updateAskButtonState();
}

function toggleSelectAllCrossRef() {
  const checkboxes = deskCrossRefSelectEl.querySelectorAll(".crossref-doc-checkbox");
  const allChecked = Array.from(checkboxes).every(cb => cb.checked);

  checkboxes.forEach(cb => {
    cb.checked = !allChecked;
  });

  updateDeskAnalyzeState();
}

qaSelectAllBtn.addEventListener("click", toggleSelectAllQA);
crossRefSelectAllBtn.addEventListener("click", toggleSelectAllCrossRef);

// Q&A functionality
async function askQuestion() {
  const question = questionInput.value.trim();
  const selectedIds = getSelectedQADocumentIds();

  if (!question) {
    setStatusElement(qaStatusEl, "Please enter a question.", "warn");
    return;
  }

  if (selectedIds.length === 0) {
    setStatusElement(qaStatusEl, "Please select at least one document.", "warn");
    return;
  }

  askBtn.disabled = true;
  setStatusElement(qaStatusEl, "Searching and generating answer...", "info");
  answerSection.style.display = "none";

  try {
    const res = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, documentIds: selectedIds })
    });

    const data = await res.json();

    if (res.ok) {
      hideStatusElement(qaStatusEl);
      renderAnswer(data);

      // Update statistics
      if (data.tokenUsage) {
        updateStatistics("Q&A Question", data.tokenUsage);
      }
    } else {
      setStatusElement(qaStatusEl, data.error || "Failed to get answer", "bad");
    }
  } catch (err) {
    setStatusElement(qaStatusEl, `Error: ${err.message}`, "bad");
  } finally {
    updateAskButtonState();
  }
}

function renderAnswer(data) {
  answerSection.style.display = "block";
  answerContent.innerHTML = `<p>${escapeHtml(data.answer).replace(/\n/g, "<br>")}</p>`;

  if (data.sources && data.sources.length > 0) {
    sourcesSection.style.display = "block";
    sourcesList.innerHTML = data.sources.map(s => `
      <div class="source-item">
        <span class="source-name">${escapeHtml(s.documentName)}</span>
        <span class="source-relevance">${s.relevance}% relevance</span>
      </div>
    `).join("");
  } else {
    sourcesSection.style.display = "none";
  }
}

// Cross-reference & Template functionality
function hideDeskResultBlocks() {
  deskResultsCard.style.display = "none";
  deskCrossRefBlock.style.display = "none";
  deskTemplateBlock.style.display = "none";
}

function resetDeskResults() {
  deskLastResult = null;
  deskTemplateText = "";
  deskCrossRefEl.textContent = "No data yet.";
  deskTemplateBoxEl.textContent = "No data yet.";
  hideDeskResultBlocks();
}

function renderDeskCrossReference(data) {
  const findings = normalizeArray(data?.cross_reference ?? []);
  deskCrossRefEl.classList.remove("subtle");

  if (!findings.length) {
    deskCrossRefEl.innerHTML = `<p class="subtle">No cross-reference output.</p>`;
    return;
  }

  deskCrossRefEl.innerHTML = findings.map((f) => {
    const q = f?.question ?? "";
    const a = f?.answer ?? "";
    const found = f?.found_in ?? "";
    const confidence = f?.confidence ?? "";

    return `
      <div class="kp">
        <div class="kp-top">
          <span class="badge">Cross-reference</span>
          ${found ? `<span class="badge">${escapeHtml(found)}</span>` : ""}
          ${confidence ? `<span class="badge">Confidence: ${escapeHtml(confidence)}</span>` : ""}
        </div>
        <div><strong>Q:</strong> ${escapeHtml(q)}</div>
        <div><strong>A:</strong> ${a ? escapeHtml(a) : "<span class='subtle'>Not found.</span>"}</div>
      </div>
    `;
  }).join("");
}

function renderDeskTemplate(data) {
  const tmpl = data?.response_template ?? "";
  deskTemplateBoxEl.classList.remove("subtle");

  deskTemplateText = tmpl || "";
  if (!tmpl) {
    deskTemplateBoxEl.innerHTML = `<p class="subtle">No template in response.</p>`;
    return;
  }

  deskTemplateBoxEl.innerHTML = `<pre class="doc">${escapeHtml(tmpl)}</pre>`;
}

function exportDeskTemplateDocx() {
  if (!deskTemplateText) {
    setStatusElement(deskStatusEl, "No template to export.", "warn");
    return;
  }
  const html = `<html><body><pre>${escapeHtml(deskTemplateText)}</pre></body></html>`;
  downloadBlob(html, "response-template.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
}

exportDeskTemplateBtn.addEventListener("click", exportDeskTemplateDocx);

async function deskAnalyze() {
  const externalFile = deskExternalFile.files?.[0];
  if (!externalFile) {
    setStatusElement(deskStatusEl, "Please select an external document.", "warn");
    return;
  }

  const outputs = getDeskOutputs();
  if (outputs.length === 0) {
    setStatusElement(deskStatusEl, "Please select at least one output.", "warn");
    return;
  }

  const wantsCrossRef = outputs.includes("cross_reference");
  const wantsTemplate = outputs.includes("generate_template");
  const prefillTemplate = wantsTemplate && deskPrefillToggle.checked;

  // Library docs are only required for cross-reference or pre-fill
  const needsLibraryDocs = wantsCrossRef || prefillTemplate;
  const crossRefDocIds = getSelectedCrossRefDocumentIds();

  if (needsLibraryDocs && crossRefDocIds.length === 0) {
    setStatusElement(deskStatusEl, "Please select at least one library document for cross-reference or pre-fill.", "warn");
    return;
  }

  deskAnalyzeBtn.disabled = true;
  resetDeskResults();
  setStatusElement(deskStatusEl, "Analyzing and generating...", "info");

  try {
    const fd = new FormData();
    fd.append("file", externalFile);
    fd.append("targetLanguage", deskTranslateTo.value);
    fd.append("libraryDocumentIds", JSON.stringify(crossRefDocIds));
    outputs.forEach(o => fd.append("outputs", o));

    if (wantsTemplate) {
      fd.append("prefillTemplate", prefillTemplate ? "true" : "false");
    }

    const res = await fetch("/api/desk/analyze", { method: "POST", body: fd });

    if (!res.ok) {
      const details = await safeReadError(res);
      setStatusElement(deskStatusEl, `Request failed (${res.status}). ${details || ""}`.trim(), "bad");
      return;
    }

    const data = await res.json();
    deskLastResult = data;

    // Update statistics - customize action name based on what was done
    if (data.tokenUsage) {
      let actionName = "Desk ";
      if (wantsCrossRef && wantsTemplate) {
        actionName += "Cross-Reference & Template";
      } else if (wantsCrossRef) {
        actionName += "Cross-Reference";
      } else {
        actionName += "Response Template";
      }
      updateStatistics(actionName, data.tokenUsage);
    }

    setStatusElement(deskStatusEl, "Done.", "good");
    deskResultsCard.style.display = "block";

    if (wantsCrossRef) {
      deskCrossRefBlock.style.display = "block";
      renderDeskCrossReference(data);
    }

    if (wantsTemplate) {
      deskTemplateBlock.style.display = "block";
      renderDeskTemplate(data);
    }
  } catch (err) {
    setStatusElement(deskStatusEl, `Network error: ${err?.message || String(err)}`, "bad");
  } finally {
    updateDeskAnalyzeState();
  }
}

// Desk event listeners
questionInput.addEventListener("input", updateAskButtonState);
questionInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    if (!askBtn.disabled) {
      askQuestion();
    }
  }
});
askBtn.addEventListener("click", askQuestion);

deskExternalFile.addEventListener("change", updateDeskAnalyzeState);
deskOutputsWrap.addEventListener("change", () => {
  updateDeskPrefillVisibility();
  updateDeskAnalyzeState();
});
deskPrefillToggle.addEventListener("change", () => {
  updateDeskCrossRefFieldVisibility();
  updateDeskAnalyzeState();
});
deskAnalyzeBtn.addEventListener("click", deskAnalyze);

deskClearBtn.addEventListener("click", () => {
  resetDeskResults();
  deskExternalFile.value = "";
  // Uncheck all cross-ref document selections
  deskCrossRefSelectEl.querySelectorAll(".crossref-doc-checkbox").forEach(cb => {
    cb.checked = false;
  });
  hideStatusElement(deskStatusEl);
  updateDeskAnalyzeState();
});

// Initialize prefill visibility and cross-ref field visibility
updateDeskPrefillVisibility();
updateDeskCrossRefFieldVisibility();

// ============================================
// Settings Functions (Tab 5)
// ============================================

async function loadSettings() {
  try {
    const res = await fetch("/api/settings");
    const data = await res.json();
    currentSettings = data;
    renderSettings(data);

    // Update desk model indicator if settings changed
    updateDeskAnalyzeState();
  } catch (err) {
    console.error("Error loading settings:", err);
    setSettingsStatus("Error loading settings", "bad");
  }
}

function renderSettings(settings) {
  // Set toggle values
  settingHaikuEl.checked = settings.useHaikuForExtraction;
  settingSkipTranslationEl.checked = settings.skipTranslationIfSameLanguage;
  settingRelevanceThresholdEl.checked = settings.useRelevanceThreshold;

  // Set slider and number values
  const relevancePercent = Math.round(settings.relevanceThresholdValue * 100);
  settingRelevanceValueEl.value = relevancePercent;
  relevanceValueDisplayEl.textContent = `${relevancePercent}%`;
  settingMinResultsEl.value = settings.minResultsGuarantee;

  // Update visibility of sub-settings based on relevance threshold toggle
  updateRelevanceSubSettings();
}

function updateRelevanceSubSettings() {
  const isEnabled = settingRelevanceThresholdEl.checked;
  relevanceThresholdValueSettingEl.style.display = isEnabled ? "flex" : "none";
  minResultsSettingEl.style.display = isEnabled ? "flex" : "none";
}

async function saveSettings() {
  const updates = {
    useHaikuForExtraction: settingHaikuEl.checked,
    skipTranslationIfSameLanguage: settingSkipTranslationEl.checked,
    useRelevanceThreshold: settingRelevanceThresholdEl.checked,
    relevanceThresholdValue: parseInt(settingRelevanceValueEl.value, 10) / 100,
    minResultsGuarantee: parseInt(settingMinResultsEl.value, 10)
  };

  saveSettingsBtn.disabled = true;

  try {
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates)
    });

    const data = await res.json();

    if (res.ok) {
      currentSettings = data;
      setSettingsStatus("Settings saved successfully", "good");

      // Update desk model indicator with new settings
      updateDeskAnalyzeState();
    } else {
      setSettingsStatus(data.error || "Failed to save settings", "bad");
    }
  } catch (err) {
    setSettingsStatus(`Error: ${err.message}`, "bad");
  } finally {
    saveSettingsBtn.disabled = false;
  }
}

async function resetToDefaults() {
  if (!confirm("Are you sure you want to reset all settings to defaults?")) {
    return;
  }

  resetSettingsBtn.disabled = true;

  try {
    const res = await fetch("/api/settings/reset", { method: "POST" });
    const data = await res.json();

    if (res.ok) {
      currentSettings = data;
      renderSettings(data);
      setSettingsStatus("Settings reset to defaults", "good");

      // Update desk model indicator with new settings
      updateDeskAnalyzeState();
    } else {
      setSettingsStatus(data.error || "Failed to reset settings", "bad");
    }
  } catch (err) {
    setSettingsStatus(`Error: ${err.message}`, "bad");
  } finally {
    resetSettingsBtn.disabled = false;
  }
}

function setSettingsStatus(message, kind = "info") {
  settingsStatusEl.textContent = message;
  settingsStatusEl.className = "settings-status";
  if (kind === "good") settingsStatusEl.classList.add("good");
  if (kind === "bad") settingsStatusEl.classList.add("bad");

  // Auto-hide after 3 seconds
  setTimeout(() => {
    settingsStatusEl.textContent = "";
    settingsStatusEl.className = "settings-status";
  }, 3000);
}

// Settings event listeners
settingRelevanceThresholdEl.addEventListener("change", updateRelevanceSubSettings);

settingRelevanceValueEl.addEventListener("input", () => {
  relevanceValueDisplayEl.textContent = `${settingRelevanceValueEl.value}%`;
});

saveSettingsBtn.addEventListener("click", saveSettings);
resetSettingsBtn.addEventListener("click", resetToDefaults);

// ============================================
// Initialize on Page Load
// ============================================
checkEmbeddingStatus();
loadDocuments();
loadSettings(); // Load settings on startup
