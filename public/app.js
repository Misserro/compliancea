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

  // Refresh document selects when switching to Analyze & Ask tab
  if (tabId === "analyze") {
    renderDeskDocumentSelects();
    renderQuestionnaireLibraryDocs();
  }

  // Load settings, stats, and maintenance when switching to Settings tab
  if (tabId === "settings") {
    loadSettings();
    renderStatistics();
    loadMaintenanceStatus();
  }

  // Load obligations when switching to Obligations tab
  if (tabId === "obligations") {
    loadObligationsTab();
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
// Analyze & Ask: Analyzer Elements (Tab 2)
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
// Analyze & Ask: Desk / Q&A Elements (Tab 2)
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

// Entire Library toggle
const qaEntireLibraryEl = document.getElementById("qaEntireLibrary");

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
// Settings: Statistics Elements (Tab 4)
// ============================================
const statsContentEl = document.getElementById("statsContent");

// ============================================
// Settings: Configuration Elements (Tab 4)
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
const settingGdriveServiceAccountEl = document.getElementById("settingGdriveServiceAccount");
const gdriveServiceAccountInfoEl = document.getElementById("gdriveServiceAccountInfo");
const settingGdriveFolderIdEl = document.getElementById("settingGdriveFolderId");
const saveGdriveSettingsBtn = document.getElementById("saveGdriveSettingsBtn");
const gdriveSettingsStatusEl = document.getElementById("gdriveSettingsStatus");

// ============================================
// Questionnaire Elements (Tab 2 Section C)
// ============================================
const questionnaireSection = document.getElementById("questionnaireSection");
const regulatorQuerySection = document.getElementById("regulatorQuerySection");
const qaUploadFile = document.getElementById("qaUploadFile");
const qaPastedText = document.getElementById("qaPastedText");
const qaLibraryDocSelect = document.getElementById("qaLibraryDocSelect");
const processQuestionnaireBtn = document.getElementById("processQuestionnaireBtn");
const qaClearBtn = document.getElementById("qaClearBtn");
const qaProcessStatus = document.getElementById("qaProcessStatus");
const questionnaireResultsCard = document.getElementById("questionnaireResultsCard");
const qaReviewList = document.getElementById("qaReviewList");
const qaReviewStats = document.getElementById("qaReviewStats");

// Obligations Tab Elements (Tab 3)
const obligationsTabList = document.getElementById("obligationsTabList");
const obligationSortBy = document.getElementById("obligationSortBy");
const obligationFilterStatus = document.getElementById("obligationFilterStatus");

// Evidence Modal
const evidenceModal = document.getElementById("evidenceModal");
const evidenceDocList = document.getElementById("evidenceDocList");

// ============================================
// Shared State
// ============================================
const DEPARTMENTS = ["Finance", "Compliance", "Operations", "HR", "Board", "IT"];
let documents = [];
let analyzerLastResult = null;
let deskLastResult = null;
let deskTemplateText = "";
let currentQuestionnaireData = null;
let currentContractDocId = null;
let allObligationsData = [];

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
// Statistics Functions (Settings Tab)
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

    // === ESSENTIAL BADGES (always visible) ===
    const docStatus = doc.status || "draft";
    const statusColors = { draft: "#888", in_review: "#e6a817", approved: "#2ea043", archived: "#666", disposed: "#f85149" };
    const statusBadge = `<span class="meta-badge" style="background:${statusColors[docStatus] || '#888'}">${docStatus.replace("_", " ")}</span>`;

    const typeBadge = doc.doc_type ? `<span class="meta-badge" style="background:#6e40c9">${escapeHtml(doc.doc_type)}</span>` : "";

    // In-force badge
    const inForceColors = { in_force: "#2ea043", archival: "#666" };
    const inForceLabels = { in_force: "IN FORCE", archival: "ARCHIVAL" };
    const inForceBadge = doc.in_force && inForceLabels[doc.in_force]
      ? `<span class="meta-badge" style="background:${inForceColors[doc.in_force]}">${inForceLabels[doc.in_force]}</span>`
      : "";

    // Sensitivity badge
    const sensitivityColors = { public: "#2ea043", internal: "#888", confidential: "#e6a817", restricted: "#f85149" };
    const sensitivityBadge = doc.sensitivity && doc.sensitivity !== "internal"
      ? `<span class="meta-badge" style="background:${sensitivityColors[doc.sensitivity] || '#888'}">${escapeHtml(doc.sensitivity)}</span>`
      : "";

    const essentialBadges = `${statusBadge}${typeBadge}${inForceBadge}${sensitivityBadge}`;

    // === EXPANDABLE BADGES (hidden by default) ===
    const sourceBadge = doc.source === "gdrive"
      ? `<span class="meta-badge" style="background:#4285f4">Drive</span>`
      : doc.source === "scan"
        ? `<span class="meta-badge" style="background:#666">Local</span>`
        : "";

    const syncBadge = doc.sync_status === "modified"
      ? `<span class="meta-badge" style="background:#e6a817">modified</span>`
      : doc.sync_status === "deleted"
        ? `<span class="meta-badge" style="background:#f85149">removed</span>`
        : "";

    const jurisdictionBadge = doc.jurisdiction
      ? `<span class="meta-badge meta-badge-outline" title="Jurisdiction">${escapeHtml(doc.jurisdiction)}</span>`
      : "";

    const languageBadge = doc.language && doc.language.toLowerCase() !== "english"
      ? `<span class="meta-badge meta-badge-outline" title="Language">${escapeHtml(doc.language)}</span>`
      : "";

    const holdBadge = doc.legal_hold ? `<span class="meta-badge" style="background:#f85149">HOLD</span>` : "";

    const tagsBadge = doc.confirmed_tags === 0 && doc.auto_tags
      ? `<span class="meta-badge" style="background:#888; border: 1px dashed #fff" title="Unconfirmed auto-tags">auto-tagged</span>`
      : "";

    let tagsList = "";
    let tagCount = 0;
    try {
      const tags = doc.tags ? JSON.parse(doc.tags) : [];
      tagCount = tags.length;
      if (tags.length > 0) {
        tagsList = tags.slice(0, 5).map(t => `<span class="tag-chip">${escapeHtml(t)}</span>`).join("");
        if (tags.length > 5) tagsList += `<span class="tag-chip tag-chip-more">+${tags.length - 5}</span>`;
      }
    } catch { /* ignore parse errors */ }

    // AI summary snippet
    let summarySnippet = "";
    try {
      if (doc.metadata_json) {
        const meta = JSON.parse(doc.metadata_json);
        if (meta.summary) {
          const text = meta.summary.length > 100 ? meta.summary.substring(0, 100) + "..." : meta.summary;
          summarySnippet = `<div class="doc-summary">${escapeHtml(text)}</div>`;
        }
      }
    } catch { /* ignore parse errors */ }

    const expandableBadges = `${jurisdictionBadge}${sourceBadge}${syncBadge}${holdBadge}${languageBadge}${tagsBadge}`;
    const hasExpandable = jurisdictionBadge || sourceBadge || syncBadge || holdBadge || languageBadge || tagsBadge || tagsList || summarySnippet;

    const toggleBtn = hasExpandable
      ? `<button class="btn-expand-meta" data-id="${doc.id}" title="Show details">&#9662;</button>`
      : "";

    // Tag count indicator (shown inline when collapsed, if tags exist)
    const tagCountHint = tagCount > 0 ? `<span class="tag-count-hint">${tagCount} tags</span>` : "";

    return `
      <div class="doc-item ${statusClass}" data-id="${doc.id}">
        <div class="doc-info">
          <span class="doc-name">${escapeHtml(doc.name)}</span>
          <div class="doc-meta">
            ${essentialBadges}
            ${toggleBtn}
            <span class="doc-status ${statusClass}">${statusText}</span>
            <span class="doc-date">${dateStr}</span>
            ${tagCountHint}
          </div>
          <div class="doc-meta-expanded" data-id="${doc.id}" style="display: none;">
            <div class="doc-meta">${expandableBadges} ${tagsList}</div>
            ${summarySnippet}
          </div>
        </div>
        <div class="doc-category-select">
          <select class="category-select" data-id="${doc.id}">
            <option value="">No Category</option>
            ${DEPARTMENTS.map(dept => `<option value="${dept}" ${doc.category === dept ? "selected" : ""}>${dept}</option>`).join("")}
          </select>
        </div>
        <div class="doc-actions">
          <button class="btn-metadata" data-id="${doc.id}" title="Edit metadata">Edit</button>
          ${!doc.processed ? `<button class="btn-process" data-id="${doc.id}">Process</button>` : ""}
          ${doc.processed && (doc.doc_type === "contract" || doc.doc_type === "agreement") ? `<button class="btn-contract" data-id="${doc.id}" title="Analyze contract obligations">Obligations</button>` : ""}
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

  // Phase 0: metadata edit buttons
  documentListEl.querySelectorAll(".btn-metadata").forEach(btn => {
    btn.addEventListener("click", () => openMetadataModal(parseInt(btn.dataset.id, 10)));
  });

  // Expand/collapse detail buttons
  documentListEl.querySelectorAll(".btn-expand-meta").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const docId = btn.dataset.id;
      const expanded = documentListEl.querySelector(`.doc-meta-expanded[data-id="${docId}"]`);
      if (expanded) {
        const isVisible = expanded.style.display !== "none";
        expanded.style.display = isVisible ? "none" : "block";
        btn.innerHTML = isVisible ? "&#9662;" : "&#9652;";
        btn.title = isVisible ? "Show details" : "Hide details";
      }
    });
  });

  // Contract analysis buttons
  documentListEl.querySelectorAll(".btn-contract").forEach(btn => {
    btn.addEventListener("click", () => analyzeContract(parseInt(btn.dataset.id, 10)));
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

// Show/Hide All Details toggle
let allMetaExpanded = false;
document.getElementById("toggleAllMeta").addEventListener("click", () => {
  allMetaExpanded = !allMetaExpanded;
  document.querySelectorAll(".doc-meta-expanded").forEach(el => {
    el.style.display = allMetaExpanded ? "block" : "none";
  });
  document.querySelectorAll(".btn-expand-meta").forEach(btn => {
    btn.innerHTML = allMetaExpanded ? "&#9652;" : "&#9662;";
    btn.title = allMetaExpanded ? "Hide details" : "Show details";
  });
  document.getElementById("toggleAllMeta").textContent = allMetaExpanded ? "Hide All Details" : "Show All Details";
});

// Retag All button
document.getElementById("retagAllBtn").addEventListener("click", async () => {
  const btn = document.getElementById("retagAllBtn");
  if (!confirm("Re-run AI tagger on all processed documents? This may take a while and use API tokens.")) return;
  btn.disabled = true;
  btn.textContent = "Retagging...";
  setStatusElement(libraryStatusEl, "Retagging all documents...", "info");
  try {
    const res = await fetch("/api/documents/retag-all", { method: "POST" });
    const data = await res.json();
    if (res.ok) {
      setStatusElement(libraryStatusEl, data.message, "good");
      await loadDocuments();
    } else {
      setStatusElement(libraryStatusEl, `Error: ${data.error}`, "bad");
    }
  } catch (err) {
    setStatusElement(libraryStatusEl, `Error: ${err.message}`, "bad");
  } finally {
    btn.disabled = false;
    btn.textContent = "Retag All";
  }
});

// ============================================
// Document Analyzer Functions (Analyze & Ask Tab)
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
// Desk / Q&A Functions (Analyze & Ask Tab)
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

    // Render by category with category-level checkboxes
    for (const dept of DEPARTMENTS) {
      if (grouped[dept] && grouped[dept].length > 0) {
        html += `<div class="doc-select-category" data-category="${escapeHtml(dept)}">
          <div class="doc-select-category-header">
            <label class="category-select-label">
              <input type="checkbox" class="${containerId}-category-checkbox" data-category="${escapeHtml(dept)}" />
              <span>${escapeHtml(dept)}</span>
              <span class="category-doc-count">(${grouped[dept].length})</span>
            </label>
          </div>
          ${grouped[dept].map(doc => `
            <label class="document-select-item">
              <input type="checkbox" class="${containerId}-checkbox" data-id="${doc.id}" data-category="${escapeHtml(dept)}" />
              <span class="doc-select-name">${escapeHtml(doc.name)}</span>
              <span class="doc-select-status processed">${doc.word_count} words</span>
            </label>
          `).join("")}
        </div>`;
      }
    }

    // Render uncategorized
    if (uncategorized.length > 0) {
      html += `<div class="doc-select-category" data-category="Uncategorized">
        <div class="doc-select-category-header">
          <label class="category-select-label">
            <input type="checkbox" class="${containerId}-category-checkbox" data-category="Uncategorized" />
            <span>Uncategorized</span>
            <span class="category-doc-count">(${uncategorized.length})</span>
          </label>
        </div>
        ${uncategorized.map(doc => `
          <label class="document-select-item">
            <input type="checkbox" class="${containerId}-checkbox" data-id="${doc.id}" data-category="Uncategorized" />
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

  // Add event listeners for individual doc checkboxes
  deskDocumentSelectEl.querySelectorAll(".qa-doc-checkbox").forEach(cb => {
    cb.addEventListener("change", () => {
      updateCategoryCheckboxStates("qa-doc");
      updateAskButtonState();
    });
  });

  deskCrossRefSelectEl.querySelectorAll(".crossref-doc-checkbox").forEach(cb => {
    cb.addEventListener("change", updateDeskAnalyzeState);
  });

  // Add event listeners for category checkboxes (Q&A)
  deskDocumentSelectEl.querySelectorAll(".qa-doc-category-checkbox").forEach(cb => {
    cb.addEventListener("change", () => {
      toggleCategoryDocs(cb, "qa-doc");
      updateAskButtonState();
    });
  });

  // Apply disabled overlay if entire library is toggled
  updateEntireLibraryState();

  updateAskButtonState();
  updateDeskAnalyzeState();
}

// Category checkbox: toggle all docs in that category
function toggleCategoryDocs(categoryCb, prefix) {
  const category = categoryCb.dataset.category;
  const container = prefix === "qa-doc" ? deskDocumentSelectEl : deskCrossRefSelectEl;
  const docCheckboxes = container.querySelectorAll(`.${prefix}-checkbox[data-category="${category}"]`);
  docCheckboxes.forEach(cb => {
    cb.checked = categoryCb.checked;
  });
}

// Sync category checkboxes with individual doc checkbox states
function updateCategoryCheckboxStates(prefix) {
  const container = prefix === "qa-doc" ? deskDocumentSelectEl : deskCrossRefSelectEl;
  const categoryCheckboxes = container.querySelectorAll(`.${prefix}-category-checkbox`);

  categoryCheckboxes.forEach(catCb => {
    const category = catCb.dataset.category;
    const docCbs = container.querySelectorAll(`.${prefix}-checkbox[data-category="${category}"]`);
    const checkedCount = container.querySelectorAll(`.${prefix}-checkbox[data-category="${category}"]:checked`).length;
    const totalCount = docCbs.length;

    if (checkedCount === 0) {
      catCb.checked = false;
      catCb.indeterminate = false;
    } else if (checkedCount === totalCount) {
      catCb.checked = true;
      catCb.indeterminate = false;
    } else {
      catCb.checked = false;
      catCb.indeterminate = true;
    }
  });
}

// Entire Library toggle state management
function updateEntireLibraryState() {
  const isEntireLibrary = qaEntireLibraryEl && qaEntireLibraryEl.checked;
  if (isEntireLibrary) {
    deskDocumentSelectEl.classList.add("disabled-overlay");
    if (qaSelectAllBtn) qaSelectAllBtn.disabled = true;
  } else {
    deskDocumentSelectEl.classList.remove("disabled-overlay");
    if (qaSelectAllBtn) qaSelectAllBtn.disabled = false;
  }
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
  const isEntireLibrary = qaEntireLibraryEl && qaEntireLibraryEl.checked;

  // Enable ask button if: has question AND (entire library OR at least one doc selected)
  askBtn.disabled = !hasQuestion || (!isEntireLibrary && selectedIds.length === 0);

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

  updateCategoryCheckboxStates("qa-doc");
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

// Entire Library toggle
if (qaEntireLibraryEl) {
  qaEntireLibraryEl.addEventListener("change", () => {
    updateEntireLibraryState();
    updateAskButtonState();
  });
}

// Q&A functionality
async function askQuestion() {
  const question = questionInput.value.trim();
  const isEntireLibrary = qaEntireLibraryEl && qaEntireLibraryEl.checked;
  const selectedIds = isEntireLibrary ? [] : getSelectedQADocumentIds();

  if (!question) {
    setStatusElement(qaStatusEl, "Please enter a question.", "warn");
    return;
  }

  if (!isEntireLibrary && selectedIds.length === 0) {
    setStatusElement(qaStatusEl, "Please select at least one document or enable 'Search entire library'.", "warn");
    return;
  }

  askBtn.disabled = true;
  const statusMsg = isEntireLibrary
    ? "Searching entire library and generating answer..."
    : "Searching and generating answer...";
  setStatusElement(qaStatusEl, statusMsg, "info");
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

function renderSourceCards(sources) {
  if (!sources || sources.length === 0) return "";

  return sources.map(s => {
    const badges = [];
    if (s.docType) badges.push(`<span class="source-badge source-badge-type">${escapeHtml(s.docType)}</span>`);
    if (s.category) badges.push(`<span class="source-badge source-badge-category">${escapeHtml(s.category)}</span>`);

    return `
      <div class="source-card">
        <a href="/api/documents/${s.documentId}/download" target="_blank" class="source-doc-link" title="Open document">
          ${escapeHtml(s.documentName)}
        </a>
        <div class="source-card-meta">
          ${badges.join("")}
          <span class="source-relevance">${s.relevance}% match</span>
        </div>
      </div>
    `;
  }).join("");
}

function renderAnswer(data) {
  answerSection.style.display = "block";

  // Render clean answer text — no citation markers
  answerContent.innerHTML = `<p>${escapeHtml(data.answer).replace(/\n/g, "<br>")}</p>`;

  // Render source document cards
  if (data.sources && data.sources.length > 0) {
    sourcesSection.style.display = "block";
    sourcesList.innerHTML = renderSourceCards(data.sources);
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
// Settings Functions (Settings Tab)
// ============================================

async function loadSettings() {
  try {
    const res = await fetch("/api/settings");
    const data = await res.json();
    currentSettings = data;
    renderSettings(data);

    // Also load Google Drive settings (separate persistence)
    loadGdriveSettings();

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
// Maintenance Functions (Settings tab)
// ============================================

async function loadMaintenanceStatus() {
  try {
    const res = await fetch("/api/maintenance/status");
    const data = await res.json();
    const statusEl = document.getElementById("maintenanceStatus");
    if (data.lastRun) {
      statusEl.textContent = `Last run: ${new Date(data.lastRun).toLocaleString()}`;
    }
  } catch { /* ignore */ }
}

async function runMaintenance() {
  const btn = document.getElementById("runMaintenanceBtn");
  const statusEl = document.getElementById("maintenanceStatus");
  const resultEl = document.getElementById("maintenanceResult");

  btn.disabled = true;
  statusEl.textContent = "Running...";

  try {
    const res = await fetch("/api/maintenance/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ force: true })
    });

    const data = await res.json();

    if (data.skipped) {
      statusEl.textContent = data.reason;
    } else {
      statusEl.textContent = `Completed at ${new Date(data.completedAt).toLocaleTimeString()}`;
      resultEl.style.display = "";
      resultEl.innerHTML = `<div class="card">
        <p><strong>Results:</strong></p>
        ${data.gdrive ? `<p>Google Drive: ${data.gdrive.skipped ? data.gdrive.reason : `Added ${data.gdrive.added}, Updated ${data.gdrive.updated}`}</p>` : ""}
        ${data.retention ? `<p>Retention: ${data.retention.tasksCreated} new disposal tasks</p>` : ""}
        ${data.unconfirmedTags ? `<p>Unconfirmed tags: ${data.unconfirmedTags.flagged} flagged</p>` : ""}
        ${data.tasks ? `<p>Open tasks: ${data.tasks.open}</p>` : ""}
      </div>`;
    }
  } catch (err) {
    statusEl.textContent = `Error: ${err.message}`;
  } finally {
    btn.disabled = false;
  }
}

document.getElementById("runMaintenanceBtn").addEventListener("click", runMaintenance);

// ============================================
// Phase 0: Google Drive Functions
// ============================================

async function checkGDriveStatus() {
  const gdriveStatusEl = document.getElementById("gdriveStatus");
  const scanGDriveBtn = document.getElementById("scanGDriveBtn");

  try {
    const res = await fetch("/api/gdrive/status");
    const data = await res.json();

    if (data.available) {
      gdriveStatusEl.textContent = `Google Drive: Connected${data.lastSync ? ` (last sync: ${new Date(data.lastSync).toLocaleTimeString()})` : ""}`;
      gdriveStatusEl.className = "gdrive-status ready";
      gdriveStatusEl.style.display = "";
      scanGDriveBtn.disabled = false;
    } else {
      gdriveStatusEl.textContent = `Google Drive: ${data.error || "Not configured"}`;
      gdriveStatusEl.className = "gdrive-status";
      gdriveStatusEl.style.display = "";
      scanGDriveBtn.disabled = true;
    }
  } catch {
    scanGDriveBtn.disabled = true;
  }
}

async function scanGDrive() {
  const scanGDriveBtn = document.getElementById("scanGDriveBtn");
  scanGDriveBtn.disabled = true;
  setStatusElement(libraryStatusEl, "Scanning Google Drive...", "info");

  try {
    const res = await fetch("/api/gdrive/scan", { method: "POST" });
    const data = await res.json();

    if (res.ok) {
      documents = data.documents || [];
      renderDocumentList();
      setStatusElement(libraryStatusEl, data.message || "Google Drive scan complete", "good");
      checkGDriveStatus(); // refresh status
    } else {
      setStatusElement(libraryStatusEl, data.error || "Google Drive scan failed", "bad");
    }
  } catch (err) {
    setStatusElement(libraryStatusEl, `Error: ${err.message}`, "bad");
  } finally {
    scanGDriveBtn.disabled = false;
  }
}

document.getElementById("scanGDriveBtn").addEventListener("click", scanGDrive);

// ============================================
// Google Drive Settings Functions
// ============================================

async function loadGdriveSettings() {
  try {
    const res = await fetch("/api/gdrive/settings");
    const data = await res.json();

    // Don't show the full credentials — just show status
    settingGdriveServiceAccountEl.value = "";
    if (data.hasCredentials && data.serviceAccountEmail) {
      gdriveServiceAccountInfoEl.textContent = `Connected as: ${data.serviceAccountEmail}`;
      gdriveServiceAccountInfoEl.style.color = "var(--success, #22c55e)";
    } else if (data.hasCredentials) {
      gdriveServiceAccountInfoEl.textContent = "Credentials saved (could not read email)";
      gdriveServiceAccountInfoEl.style.color = "var(--warning, #f59e0b)";
    } else {
      gdriveServiceAccountInfoEl.textContent = "";
    }
    settingGdriveFolderIdEl.value = data.folderId || "";
  } catch (err) {
    console.error("Error loading Google Drive settings:", err);
  }
}

async function saveGdriveSettings() {
  saveGdriveSettingsBtn.disabled = true;

  const updates = {};

  // Only send credentials if user entered new ones (empty = keep existing)
  const serviceAccountValue = settingGdriveServiceAccountEl.value.trim();
  if (serviceAccountValue) {
    updates.serviceAccountJson = serviceAccountValue;
  }

  updates.folderId = settingGdriveFolderIdEl.value.trim();

  try {
    const res = await fetch("/api/gdrive/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });

    const data = await res.json();

    if (res.ok) {
      setGdriveSettingsStatus("Google Drive settings saved", "good");
      // Clear textarea and update status info
      settingGdriveServiceAccountEl.value = "";
      if (data.hasCredentials && data.serviceAccountEmail) {
        gdriveServiceAccountInfoEl.textContent = `Connected as: ${data.serviceAccountEmail}`;
        gdriveServiceAccountInfoEl.style.color = "var(--success, #22c55e)";
      }
      settingGdriveFolderIdEl.value = data.folderId || "";
      // Refresh the GDrive status in the Library tab
      checkGDriveStatus();
    } else {
      setGdriveSettingsStatus(data.error || "Failed to save", "bad");
    }
  } catch (err) {
    setGdriveSettingsStatus(`Error: ${err.message}`, "bad");
  } finally {
    saveGdriveSettingsBtn.disabled = false;
  }
}

function setGdriveSettingsStatus(message, kind = "info") {
  gdriveSettingsStatusEl.textContent = message;
  gdriveSettingsStatusEl.className = "settings-status";
  if (kind === "good") gdriveSettingsStatusEl.classList.add("good");
  if (kind === "bad") gdriveSettingsStatusEl.classList.add("bad");

  setTimeout(() => {
    gdriveSettingsStatusEl.textContent = "";
    gdriveSettingsStatusEl.className = "settings-status";
  }, 3000);
}

saveGdriveSettingsBtn.addEventListener("click", saveGdriveSettings);

// ============================================
// Phase 0: Metadata Modal Functions
// ============================================

function openMetadataModal(docId) {
  const doc = documents.find(d => d.id === docId);
  if (!doc) return;

  document.getElementById("metadataDocId").value = docId;
  document.getElementById("metaDocType").value = doc.doc_type || "";
  document.getElementById("metaCategory").value = doc.category || "";
  document.getElementById("metaClient").value = doc.client || "";
  document.getElementById("metaJurisdiction").value = doc.jurisdiction || "";
  document.getElementById("metaSensitivity").value = doc.sensitivity || "internal";
  document.getElementById("metaStatus").value = doc.status || "draft";
  document.getElementById("metaInForce").value = doc.in_force || "unknown";
  document.getElementById("metaLanguage").value = doc.language || "";

  // Show AI summary if available
  const summaryEl = document.getElementById("metaSummary");
  let summary = null;
  try {
    const metaJson = doc.metadata_json ? JSON.parse(doc.metadata_json) : {};
    summary = metaJson.summary;
  } catch { /* ignore */ }
  if (summary) {
    summaryEl.textContent = summary;
    summaryEl.style.display = "";
  } else {
    summaryEl.style.display = "none";
  }

  let tags = [];
  try { tags = doc.tags ? JSON.parse(doc.tags) : []; } catch { tags = []; }
  document.getElementById("metaTags").value = tags.join(", ");

  document.getElementById("metadataModal").style.display = "flex";
}

function closeMetadataModal() {
  document.getElementById("metadataModal").style.display = "none";
}

async function saveMetadata() {
  const docId = parseInt(document.getElementById("metadataDocId").value, 10);
  const tagsStr = document.getElementById("metaTags").value;
  const tags = tagsStr ? tagsStr.split(",").map(t => t.trim().toLowerCase()).filter(Boolean) : [];

  const updates = {
    doc_type: document.getElementById("metaDocType").value || null,
    category: document.getElementById("metaCategory").value || null,
    client: document.getElementById("metaClient").value || null,
    jurisdiction: document.getElementById("metaJurisdiction").value || null,
    sensitivity: document.getElementById("metaSensitivity").value || "internal",
    in_force: document.getElementById("metaInForce").value || "unknown",
    language: document.getElementById("metaLanguage").value || null,
    tags: JSON.stringify(tags),
    confirmed_tags: 1,
  };

  try {
    const res = await fetch(`/api/documents/${docId}/metadata`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates)
    });

    if (res.ok) {
      closeMetadataModal();
      await loadDocuments();
      setStatusElement(libraryStatusEl, "Metadata updated", "good");
    } else {
      const data = await res.json();
      alert(data.error || "Failed to save metadata");
    }
  } catch (err) {
    alert(`Error: ${err.message}`);
  }

  // Handle status change separately (uses state machine endpoint)
  const newStatus = document.getElementById("metaStatus").value;
  const doc = documents.find(d => d.id === docId);
  if (doc && newStatus !== (doc.status || "draft")) {
    try {
      await fetch(`/api/documents/${docId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus })
      });
      await loadDocuments();
    } catch { /* ignore status change errors in modal flow */ }
  }
}

document.getElementById("saveMetadataBtn").addEventListener("click", saveMetadata);
document.getElementById("cancelMetadataBtn").addEventListener("click", closeMetadataModal);

// Close modal on overlay click
document.getElementById("metadataModal").addEventListener("click", (e) => {
  if (e.target.id === "metadataModal") closeMetadataModal();
});

// ============================================
// Obligations Tab Functions (Tab 3)
// ============================================

async function loadObligationsTab() {
  try {
    const res = await fetch("/api/obligations");
    const data = await res.json();
    allObligationsData = data.obligations || [];

    // Update stats bar
    updateObligationsStats(data.stats || {});

    // Update badge
    updateObligationBadge(data.stats?.overdue || 0);

    // Render with current sort/filter
    renderObligationsTab();
  } catch (err) {
    obligationsTabList.innerHTML = `<p class="subtle">Error loading obligations.</p>`;
  }
}

function updateObligationsStats(stats) {
  const el = document.getElementById("obligationsStats");
  el.innerHTML = `
    <span class="ob-stat ob-stat-total">Total: <strong>${stats.total || 0}</strong></span>
    <span class="ob-stat ob-stat-active">Active: <strong>${stats.active || 0}</strong></span>
    <span class="ob-stat ob-stat-overdue">Overdue: <strong>${stats.overdue || 0}</strong></span>
    <span class="ob-stat ob-stat-upcoming">Due soon: <strong>${stats.upcoming || 0}</strong></span>
    <span class="ob-stat ob-stat-met">Met: <strong>${stats.met || 0}</strong></span>
  `;
}

function updateObligationBadge(overdueCount) {
  const badge = document.getElementById("obligationBadge");
  if (overdueCount > 0) {
    badge.textContent = overdueCount;
    badge.style.display = "";
  } else {
    badge.style.display = "none";
  }
}

function renderObligationsTab() {
  const sortBy = obligationSortBy.value;
  const filterStatus = obligationFilterStatus.value;

  // Filter
  let filtered = allObligationsData;
  if (filterStatus) {
    if (filterStatus === "overdue") {
      filtered = filtered.filter(ob => ob.status === "active" && ob.due_date && new Date(ob.due_date) < new Date());
    } else {
      filtered = filtered.filter(ob => ob.status === filterStatus);
    }
  }

  if (filtered.length === 0) {
    obligationsTabList.innerHTML = `<p class="subtle">${allObligationsData.length === 0
      ? 'No obligations found. Process a contract in the Documents tab and click "Obligations" to extract them.'
      : 'No obligations match the current filter.'}</p>`;
    return;
  }

  // Sort
  const sorted = [...filtered];
  if (sortBy === "deadline") {
    sorted.sort((a, b) => {
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return new Date(a.due_date) - new Date(b.due_date);
    });
  } else if (sortBy === "type") {
    sorted.sort((a, b) => a.obligation_type.localeCompare(b.obligation_type));
  } else {
    // contract — group by document_id
    sorted.sort((a, b) => {
      const nameCompare = (a.document_name || "").localeCompare(b.document_name || "");
      if (nameCompare !== 0) return nameCompare;
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return new Date(a.due_date) - new Date(b.due_date);
    });
  }

  // Render
  const typeColors = {
    renewal: "#4f46e5",
    termination_notice: "#dc2626",
    duty: "#059669",
    penalty: "#dc2626",
    reporting: "#d97706",
    payment: "#7c3aed",
  };

  let html = "";
  let currentGroup = null;

  for (const ob of sorted) {
    // Group headers for contract sort
    if (sortBy === "contract") {
      const groupKey = ob.document_name || "Unknown Contract";
      if (groupKey !== currentGroup) {
        currentGroup = groupKey;
        html += `<div class="ob-group-header">${escapeHtml(groupKey)}</div>`;
      }
    } else if (sortBy === "type") {
      const groupKey = ob.obligation_type.replace(/_/g, " ");
      if (groupKey !== currentGroup) {
        currentGroup = groupKey;
        html += `<div class="ob-group-header">${escapeHtml(groupKey.charAt(0).toUpperCase() + groupKey.slice(1))}</div>`;
      }
    }

    const evidence = JSON.parse(ob.evidence_json || "[]");
    const dueDateClass = getDueDateClass(ob.due_date);
    const isOverdue = ob.status === "active" && ob.due_date && new Date(ob.due_date) < new Date();

    const statusBadge = isOverdue
      ? `<span class="ob-status-badge ob-status-overdue">Overdue</span>`
      : ob.status === "active"
        ? `<span class="ob-status-badge ob-status-active">Active</span>`
        : ob.status === "met"
          ? `<span class="ob-status-badge ob-status-met">Met</span>`
          : `<span class="ob-status-badge ob-status-waived">Waived</span>`;

    const typeBadge = `<span class="ob-type-badge" style="background:${typeColors[ob.obligation_type] || '#6b7280'}">${ob.obligation_type.replace(/_/g, " ")}</span>`;

    const evidenceHtml = evidence.length > 0
      ? evidence.map((ev, idx) => `
          <div class="ob-evidence-item">
            <a href="/api/documents/${ev.documentId}/download" target="_blank" class="ob-evidence-link">${escapeHtml(ev.documentName)}</a>
            ${ev.note ? `<span class="subtle">${escapeHtml(ev.note)}</span>` : ""}
            <button class="btn-sm btn-remove-evidence" onclick="removeEvidence(${ob.id}, ${idx})">×</button>
          </div>`).join("")
      : `<p class="subtle">No evidence linked yet.</p>`;

    // Show contract name if not grouping by contract
    const contractLabel = sortBy !== "contract"
      ? `<span class="ob-contract-label" title="${escapeHtml(ob.document_name || "")}">${escapeHtml(ob.document_name || "Unknown")}</span>`
      : "";

    html += `
      <div class="obligation-card" data-id="${ob.id}">
        <div class="ob-header">
          <div class="ob-title-row">
            ${typeBadge}
            <strong>${escapeHtml(ob.title)}</strong>
            ${statusBadge}
            ${contractLabel}
          </div>
          <div class="ob-meta-row">
            ${ob.clause_reference ? `<span class="ob-clause">${escapeHtml(ob.clause_reference)}</span>` : ""}
            ${ob.due_date ? `<span class="ob-due-date ${dueDateClass}">${ob.due_date}</span>` : `<span class="ob-due-date">Ongoing</span>`}
            ${ob.recurrence && ob.recurrence !== "one_time" ? `<span class="ob-recurrence">${ob.recurrence}</span>` : ""}
          </div>
        </div>
        ${ob.description ? `<p class="ob-description">${escapeHtml(ob.description)}</p>` : ""}
        <div class="ob-details">
          <div class="ob-field">
            <label>Owner:</label>
            <input type="text" value="${escapeHtml(ob.owner || "")}" class="ob-inline-input" data-id="${ob.id}" data-field="owner" placeholder="Assign owner..." onchange="updateObligationField(${ob.id}, 'owner', this.value)" />
          </div>
          <div class="ob-field">
            <label>Escalation:</label>
            <input type="text" value="${escapeHtml(ob.escalation_to || "")}" class="ob-inline-input" data-id="${ob.id}" data-field="escalation_to" placeholder="Escalation contact..." onchange="updateObligationField(${ob.id}, 'escalation_to', this.value)" />
          </div>
        </div>
        ${ob.proof_description ? `<div class="ob-proof"><strong>Required proof:</strong> ${escapeHtml(ob.proof_description)}</div>` : ""}
        <div class="ob-evidence">
          <div class="ob-evidence-header">
            <strong>Evidence</strong>
            <button class="btn-secondary btn-sm" onclick="openAddEvidenceModal(${ob.id})">Add Evidence</button>
          </div>
          ${evidenceHtml}
        </div>
        <div class="ob-actions">
          <button class="btn-secondary btn-sm" onclick="checkCompliance(${ob.id})">Check Compliance</button>
          <select class="ob-status-select" onchange="updateObligationField(${ob.id}, 'status', this.value); setTimeout(loadObligationsTab, 300);">
            <option value="active" ${ob.status === "active" ? "selected" : ""}>Active</option>
            <option value="met" ${ob.status === "met" ? "selected" : ""}>Met</option>
            <option value="waived" ${ob.status === "waived" ? "selected" : ""}>Waived</option>
          </select>
        </div>
        <div class="ob-compliance-result" id="compliance-${ob.id}" style="display: none;"></div>
      </div>
    `;
  }

  obligationsTabList.innerHTML = html;
}

// Sort/filter change listeners
obligationSortBy.addEventListener("change", renderObligationsTab);
obligationFilterStatus.addEventListener("change", renderObligationsTab);

// ============================================
// Contract Analysis Functions
// ============================================

async function analyzeContract(docId) {
  const doc = documents.find(d => d.id === docId);
  if (!doc) return;

  // Check if obligations already exist
  try {
    const res = await fetch(`/api/documents/${docId}/obligations`);
    const data = await res.json();
    if (data.obligations && data.obligations.length > 0) {
      currentContractDocId = docId;
      // Navigate to Obligations tab
      switchTab("obligations");
      return;
    }
  } catch { /* ignore, proceed with analysis */ }

  // No existing obligations — run extraction
  const btn = documentListEl.querySelector(`.btn-contract[data-id="${docId}"]`);
  if (btn) { btn.disabled = true; btn.textContent = "Analyzing..."; }

  setStatusElement(libraryStatusEl, "Analyzing contract obligations...", "warn");

  try {
    const res = await fetch(`/api/documents/${docId}/analyze-contract`, { method: "POST" });
    const data = await res.json();

    if (!res.ok) {
      setStatusElement(libraryStatusEl, data.error || "Contract analysis failed", "bad");
      return;
    }

    currentContractDocId = docId;

    setStatusElement(libraryStatusEl, `Extracted ${data.obligations.length} obligations, created ${data.tasksCreated} tasks`, "good");

    // Update statistics
    if (data.tokenUsage) {
      lastStatistics = {
        actionType: "Contract Analysis",
        timestamp: new Date().toISOString(),
        tokenUsage: data.tokenUsage,
      };
    }

    // Navigate to Obligations tab to show results
    switchTab("obligations");
  } catch (err) {
    setStatusElement(libraryStatusEl, `Error: ${err.message}`, "bad");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "Obligations"; }
  }
}

function getDueDateClass(dueDate) {
  if (!dueDate) return "";
  const now = new Date();
  const due = new Date(dueDate);
  const daysUntil = Math.ceil((due - now) / (1000 * 60 * 60 * 24));
  if (daysUntil < 0) return "ob-overdue";
  if (daysUntil <= 30) return "ob-upcoming";
  return "ob-future";
}

async function updateObligationField(obId, field, value) {
  try {
    await fetch(`/api/obligations/${obId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
  } catch (err) {
    console.error("Error updating obligation:", err);
  }
}

function openAddEvidenceModal(obligationId) {
  document.getElementById("evidenceObligationId").value = obligationId;
  document.getElementById("evidenceNote").value = "";

  // Render processed library documents for selection
  const processed = documents.filter(d => d.processed);
  const grouped = {};
  const uncategorized = [];

  for (const doc of processed) {
    const cat = doc.category || null;
    if (cat) {
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(doc);
    } else {
      uncategorized.push(doc);
    }
  }

  let html = "";
  for (const dept of DEPARTMENTS) {
    if (grouped[dept] && grouped[dept].length > 0) {
      html += `<div class="doc-category-header" style="margin-top: 0.5rem;">${dept}</div>`;
      html += grouped[dept].map(d => `
        <div class="evidence-doc-item" data-doc-id="${d.id}" onclick="selectEvidence(${d.id}, this)">
          <span>${escapeHtml(d.name)}</span>
          ${d.source === "gdrive" ? `<span class="meta-badge" style="background:#1a73e8; font-size: 0.6rem;">Drive</span>` : ""}
        </div>`).join("");
    }
  }
  if (uncategorized.length > 0) {
    html += `<div class="doc-category-header" style="margin-top: 0.5rem;">Uncategorized</div>`;
    html += uncategorized.map(d => `
      <div class="evidence-doc-item" data-doc-id="${d.id}" onclick="selectEvidence(${d.id}, this)">
        <span>${escapeHtml(d.name)}</span>
      </div>`).join("");
  }

  evidenceDocList.innerHTML = html || `<p class="subtle">No processed documents available.</p>`;
  evidenceModal.style.display = "flex";
}

async function selectEvidence(documentId, el) {
  const obligationId = parseInt(document.getElementById("evidenceObligationId").value, 10);
  const note = document.getElementById("evidenceNote").value.trim();

  try {
    const res = await fetch(`/api/obligations/${obligationId}/evidence`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId, note: note || null }),
    });

    if (res.ok) {
      evidenceModal.style.display = "none";
      // Refresh obligations tab
      loadObligationsTab();
    } else {
      const data = await res.json();
      alert(data.error || "Failed to add evidence");
    }
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

async function removeEvidence(obligationId, evidenceIndex) {
  if (!confirm("Remove this evidence link?")) return;

  try {
    const res = await fetch(`/api/obligations/${obligationId}/evidence/${evidenceIndex}`, { method: "DELETE" });
    if (res.ok) {
      loadObligationsTab();
    }
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

async function checkCompliance(obligationId) {
  const resultEl = document.getElementById(`compliance-${obligationId}`);
  resultEl.innerHTML = `<p class="subtle">Checking compliance...</p>`;
  resultEl.style.display = "";

  try {
    const res = await fetch(`/api/obligations/${obligationId}/check-compliance`, { method: "POST" });
    const data = await res.json();

    if (!res.ok) {
      resultEl.innerHTML = `<p class="bad">${escapeHtml(data.error || "Failed")}</p>`;
      return;
    }

    const metClass = data.met ? "compliance-met" : "compliance-not-met";
    const metText = data.met ? "OBLIGATION MET" : "OBLIGATION NOT MET";
    resultEl.innerHTML = `
      <div class="compliance-result ${metClass}">
        <strong>${metText}</strong> (${data.confidence} confidence)
        <p>${escapeHtml(data.assessment)}</p>
      </div>
    `;

    if (data.tokenUsage) {
      lastStatistics = {
        actionType: "Compliance Check",
        timestamp: new Date().toISOString(),
        tokenUsage: data.tokenUsage,
      };
    }
  } catch (err) {
    resultEl.innerHTML = `<p class="bad">Error: ${escapeHtml(err.message)}</p>`;
  }
}

// Close evidence modal
document.getElementById("cancelEvidenceBtn").addEventListener("click", () => {
  evidenceModal.style.display = "none";
});
evidenceModal.addEventListener("click", (e) => {
  if (e.target === evidenceModal) evidenceModal.style.display = "none";
});

// ============================================
// Questionnaire Processing Functions
// ============================================

// Document type switching
document.querySelectorAll('input[name="deskDocType"]').forEach(radio => {
  radio.addEventListener("change", () => {
    const type = radio.value;
    if (type === "questionnaire") {
      regulatorQuerySection.style.display = "none";
      questionnaireSection.style.display = "";
      deskResultsCard.style.display = "none";
      renderQuestionnaireLibraryDocs();
    } else {
      regulatorQuerySection.style.display = "";
      questionnaireSection.style.display = "none";
      questionnaireResultsCard.style.display = "none";
    }
  });
});

function renderQuestionnaireLibraryDocs() {
  const processed = documents.filter(d => d.processed);
  const grouped = {};
  const uncategorized = [];

  for (const doc of processed) {
    const cat = doc.category || null;
    if (cat) {
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(doc);
    } else {
      uncategorized.push(doc);
    }
  }

  let html = "";
  for (const dept of DEPARTMENTS) {
    if (grouped[dept] && grouped[dept].length > 0) {
      html += `<div class="doc-category-header">${dept}
        <label class="category-select-label"><input type="checkbox" class="qa-lib-cat-cb" data-category="${dept}" onchange="toggleQaLibCategory(this)"/> Select all</label>
      </div>`;
      html += grouped[dept].map(d => `
        <label class="doc-select-item">
          <input type="checkbox" class="qa-lib-doc-cb" value="${d.id}" data-category="${dept}" />
          <span>${escapeHtml(d.name)}</span>
          <span class="subtle">${d.word_count ? `${d.word_count} words` : ""}</span>
        </label>`).join("");
    }
  }
  if (uncategorized.length > 0) {
    html += `<div class="doc-category-header">Uncategorized</div>`;
    html += uncategorized.map(d => `
      <label class="doc-select-item">
        <input type="checkbox" class="qa-lib-doc-cb" value="${d.id}" />
        <span>${escapeHtml(d.name)}</span>
      </label>`).join("");
  }

  qaLibraryDocSelect.innerHTML = html || `<p class="subtle">No processed documents.</p>`;
}

function toggleQaLibCategory(cb) {
  const cat = cb.dataset.category;
  const checked = cb.checked;
  qaLibraryDocSelect.querySelectorAll(`.qa-lib-doc-cb[data-category="${cat}"]`).forEach(el => {
    el.checked = checked;
  });
  updateProcessQuestionnaireState();
}

// Select All for questionnaire library docs
document.getElementById("qaLibSelectAllBtn").addEventListener("click", () => {
  const cbs = qaLibraryDocSelect.querySelectorAll(".qa-lib-doc-cb");
  const allChecked = Array.from(cbs).every(cb => cb.checked);
  cbs.forEach(cb => cb.checked = !allChecked);
  qaLibraryDocSelect.querySelectorAll(".qa-lib-cat-cb").forEach(cb => cb.checked = !allChecked);
  updateProcessQuestionnaireState();
});

// Update process button state
function updateProcessQuestionnaireState() {
  const hasFile = qaUploadFile.files.length > 0;
  const hasText = qaPastedText.value.trim().length > 10;
  processQuestionnaireBtn.disabled = !(hasFile || hasText);
}

qaUploadFile.addEventListener("change", updateProcessQuestionnaireState);
qaPastedText.addEventListener("input", updateProcessQuestionnaireState);
qaLibraryDocSelect.addEventListener("change", updateProcessQuestionnaireState);

// Clear questionnaire
qaClearBtn.addEventListener("click", () => {
  qaUploadFile.value = "";
  qaPastedText.value = "";
  qaProcessStatus.style.display = "none";
  questionnaireResultsCard.style.display = "none";
  currentQuestionnaireData = null;
  updateProcessQuestionnaireState();
});

// Process questionnaire
processQuestionnaireBtn.addEventListener("click", async () => {
  processQuestionnaireBtn.disabled = true;
  processQuestionnaireBtn.textContent = "Processing...";
  setStatusElement(qaProcessStatus, "Extracting questions and searching library...", "warn");

  try {
    const formData = new FormData();

    if (qaUploadFile.files.length > 0) {
      formData.append("file", qaUploadFile.files[0]);
    } else {
      formData.append("pastedText", qaPastedText.value.trim());
    }

    // Get selected library doc IDs
    const selectedIds = Array.from(qaLibraryDocSelect.querySelectorAll(".qa-lib-doc-cb:checked")).map(cb => parseInt(cb.value, 10));
    formData.append("libraryDocumentIds", JSON.stringify(selectedIds));

    const res = await fetch("/api/desk/questionnaire", { method: "POST", body: formData });
    const data = await res.json();

    if (!res.ok) {
      setStatusElement(qaProcessStatus, data.error || "Processing failed", "bad");
      return;
    }

    currentQuestionnaireData = data;
    renderQuestionnaireReview(data);
    questionnaireResultsCard.style.display = "";
    questionnaireResultsCard.scrollIntoView({ behavior: "smooth" });

    setStatusElement(qaProcessStatus, `Extracted ${data.stats.total} questions (${data.stats.autoFilled} auto-filled, ${data.stats.drafted} drafted)`, "good");

    if (data.tokenUsage) {
      lastStatistics = {
        actionType: "Questionnaire Processing",
        timestamp: new Date().toISOString(),
        tokenUsage: data.tokenUsage,
      };
    }
  } catch (err) {
    setStatusElement(qaProcessStatus, `Error: ${err.message}`, "bad");
  } finally {
    processQuestionnaireBtn.disabled = false;
    processQuestionnaireBtn.textContent = "Process Questionnaire";
  }
});

function renderQuestionnaireReview(data) {
  // Stats
  qaReviewStats.innerHTML = `
    <span class="qa-stat">${data.stats.total} questions</span>
    <span class="qa-stat qa-stat-good">${data.stats.autoFilled} auto-filled</span>
    <span class="qa-stat qa-stat-draft">${data.stats.drafted} drafted</span>
  `;

  // Review cards
  qaReviewList.innerHTML = data.questions.map((q, i) => {
    const confClass = q.confidence === "high" ? "qa-conf-high" : q.confidence === "medium" ? "qa-conf-med" : "qa-conf-low";
    const sourceLabel = q.source === "auto-filled" ? `<span class="qa-autofill-badge">Auto-filled</span>` : "";

    const evidenceHtml = q.evidence && q.evidence.length > 0
      ? q.evidence.map(ev => `
          <a href="/api/documents/${ev.documentId}/download" target="_blank" class="qa-evidence-link">
            ${escapeHtml(ev.documentName)} <span class="subtle">(${ev.relevance}%)</span>
          </a>`).join("")
      : `<span class="subtle">No evidence found</span>`;

    return `
      <div class="qa-review-card ${confClass}" data-index="${i}">
        <div class="qa-card-header">
          <span class="qa-q-number">Q${q.number}</span>
          <span class="qa-confidence-badge ${confClass}">${q.confidence}</span>
          ${sourceLabel}
        </div>
        <div class="qa-question">${escapeHtml(q.text)}</div>
        <div class="qa-answer-section">
          <label>Proposed Answer:</label>
          <textarea class="qa-answer-edit" data-index="${i}" rows="3">${escapeHtml(q.answer)}</textarea>
        </div>
        <div class="qa-evidence-section">
          <label>Evidence:</label>
          <div class="qa-evidence-list">${evidenceHtml}</div>
        </div>
      </div>
    `;
  }).join("");
}

// Approve All High Confidence
document.getElementById("qaApproveAllHighBtn").addEventListener("click", () => approveQuestionnaireItems("high"));

// Approve All
document.getElementById("qaApproveAllBtn").addEventListener("click", () => approveQuestionnaireItems("all"));

async function approveQuestionnaireItems(filter = "all") {
  if (!currentQuestionnaireData) return;

  const items = [];
  currentQuestionnaireData.questions.forEach((q, i) => {
    if (filter === "all" || q.confidence === filter) {
      // Get potentially edited answer from textarea
      const textarea = qaReviewList.querySelector(`.qa-answer-edit[data-index="${i}"]`);
      const answer = textarea ? textarea.value : q.answer;

      items.push({
        questionText: q.text,
        approvedAnswer: answer,
        evidence: q.evidence || [],
        sourceQuestionnaire: qaUploadFile.files[0]?.name || "Pasted text",
      });
    }
  });

  if (items.length === 0) {
    alert("No items to approve.");
    return;
  }

  const btn = filter === "high"
    ? document.getElementById("qaApproveAllHighBtn")
    : document.getElementById("qaApproveAllBtn");
  btn.disabled = true;
  btn.textContent = "Saving...";

  try {
    const res = await fetch("/api/desk/questionnaire/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items,
        sourceQuestionnaire: qaUploadFile.files[0]?.name || "Pasted text",
      }),
    });

    const data = await res.json();

    if (res.ok) {
      setStatusElement(qaProcessStatus, `${data.saved} Q&A cards saved successfully!`, "good");
    } else {
      setStatusElement(qaProcessStatus, data.error || "Failed to save", "bad");
    }
  } catch (err) {
    setStatusElement(qaProcessStatus, `Error: ${err.message}`, "bad");
  } finally {
    btn.disabled = false;
    btn.textContent = filter === "high" ? "Approve All High Confidence" : "Approve All";
  }
}

// Export questionnaire as CSV
document.getElementById("qaExportBtn").addEventListener("click", () => {
  if (!currentQuestionnaireData) return;

  const rows = [["Number", "Question", "Answer", "Confidence", "Source", "Evidence Documents"]];
  currentQuestionnaireData.questions.forEach((q, i) => {
    const textarea = qaReviewList.querySelector(`.qa-answer-edit[data-index="${i}"]`);
    const answer = textarea ? textarea.value : q.answer;
    const evidenceDocs = (q.evidence || []).map(e => e.documentName).join("; ");
    rows.push([q.number, q.text, answer, q.confidence, q.source, evidenceDocs]);
  });

  const csv = rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "questionnaire_answers.csv";
  a.click();
  URL.revokeObjectURL(url);
});

// ============================================
// Initialize on Page Load
// ============================================
checkEmbeddingStatus();
checkGDriveStatus();
loadDocuments();
loadSettings(); // Load settings on startup

// Load obligation overdue count for badge
fetch("/api/obligations").then(r => r.json()).then(data => {
  updateObligationBadge(data.stats?.overdue || 0);
}).catch(() => {});
