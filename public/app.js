// Use relative path - works for any deployment
const ENDPOINT = "/api/analyze";

// ============================================
// Document Library Elements
// ============================================
const scanBtn = document.getElementById("scanBtn");
const processAllBtn = document.getElementById("processAllBtn");
const ollamaStatusEl = document.getElementById("ollamaStatus");
const libraryStatusEl = document.getElementById("libraryStatus");
const documentListEl = document.getElementById("documentList");
const questionInput = document.getElementById("questionInput");
const askBtn = document.getElementById("askBtn");
const qaStatusEl = document.getElementById("qaStatus");
const answerSection = document.getElementById("answerSection");
const answerContent = document.getElementById("answerContent");
const sourcesSection = document.getElementById("sourcesSection");
const sourcesList = document.getElementById("sourcesList");

// ============================================
// Analyze Form Elements
// ============================================
const form = document.getElementById("analyzeForm");
const fileInput = document.getElementById("fileInput");
const crossFilesInput = document.getElementById("crossFiles");
const translateTo = document.getElementById("translateTo");
const analyzeBtn = document.getElementById("analyzeBtn");
const clearBtn = document.getElementById("clearBtn");
const outputsWrap = document.getElementById("outputs");

const statusEl = document.getElementById("status");

// Result blocks
const resultsCard = document.getElementById("resultsCard");
const translationBlock = document.getElementById("translationBlock");
const summaryBlock = document.getElementById("summaryBlock");
const keyPointsBlock = document.getElementById("keyPointsBlock");
const todosBlock = document.getElementById("todosBlock");
const crossRefBlock = document.getElementById("crossRefBlock");
const templateBlock = document.getElementById("templateBlock");

// Result elements
const translatedDisclosure = document.getElementById("translatedDisclosure");
const translatedDocEl = document.getElementById("translatedDoc");
const summaryEl = document.getElementById("summary");
const keyPointsEl = document.getElementById("keyPoints");
const todosEl = document.getElementById("todos");
const crossRefEl = document.getElementById("crossRef");
const templateBoxEl = document.getElementById("templateBox");

// Pre-fill toggle in the form
const prefillField = document.getElementById("prefillField");
const templateFillToggle = document.getElementById("templateFillToggle");

// Export buttons
const exportTranslationBtn = document.getElementById("exportTranslationBtn");
const exportTodosBtn = document.getElementById("exportTodosBtn");
const exportTemplateBtn = document.getElementById("exportTemplateBtn");

const DEPARTMENTS = ["Finance", "Compliance", "Operations", "HR", "Board", "IT"];

let lastResult = null;
let originalTemplateText = "";
let documents = [];

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

function setStatus(message, kind = "info") {
  setStatusElement(statusEl, message, kind);
}

// ============================================
// Document Library Functions
// ============================================

async function checkOllamaStatus() {
  try {
    const res = await fetch("/api/ollama/status");
    const data = await res.json();

    if (data.available) {
      ollamaStatusEl.textContent = "Ollama: Ready";
      ollamaStatusEl.className = "ollama-status ready";
    } else {
      ollamaStatusEl.textContent = `Ollama: ${data.error || "Not available"}`;
      ollamaStatusEl.className = "ollama-status error";
    }

    return data.available;
  } catch (err) {
    ollamaStatusEl.textContent = "Ollama: Connection error";
    ollamaStatusEl.className = "ollama-status error";
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

function renderDocumentList() {
  if (documents.length === 0) {
    documentListEl.innerHTML = `<p class="subtle">No documents found. Add files to the documents/ folder and click "Scan Folder".</p>`;
    updateAskButtonState();
    return;
  }

  documentListEl.innerHTML = documents.map(doc => {
    const statusClass = doc.processed ? "processed" : "unprocessed";
    const statusText = doc.processed ? `${doc.word_count} words` : "Not processed";
    const dateStr = new Date(doc.added_at).toLocaleDateString();

    return `
      <div class="doc-item ${statusClass}" data-id="${doc.id}">
        <label class="doc-checkbox">
          <input type="checkbox" class="doc-select" data-id="${doc.id}" ${doc.processed ? "" : "disabled"} />
          <span class="doc-name">${escapeHtml(doc.name)}</span>
        </label>
        <div class="doc-meta">
          <span class="doc-status ${statusClass}">${statusText}</span>
          <span class="doc-date">${dateStr}</span>
        </div>
        <div class="doc-actions">
          ${!doc.processed ? `<button class="btn-process" data-id="${doc.id}">Process</button>` : ""}
          <button class="btn-delete" data-id="${doc.id}">Delete</button>
        </div>
      </div>
    `;
  }).join("");

  // Add event listeners
  documentListEl.querySelectorAll(".btn-process").forEach(btn => {
    btn.addEventListener("click", () => processDocument(parseInt(btn.dataset.id, 10)));
  });

  documentListEl.querySelectorAll(".btn-delete").forEach(btn => {
    btn.addEventListener("click", () => deleteDocument(parseInt(btn.dataset.id, 10)));
  });

  documentListEl.querySelectorAll(".doc-select").forEach(checkbox => {
    checkbox.addEventListener("change", updateAskButtonState);
  });

  updateAskButtonState();
}

function getSelectedDocumentIds() {
  const checkboxes = documentListEl.querySelectorAll(".doc-select:checked");
  return Array.from(checkboxes).map(cb => parseInt(cb.dataset.id, 10));
}

function updateAskButtonState() {
  const selectedIds = getSelectedDocumentIds();
  const hasQuestion = questionInput.value.trim().length > 0;
  askBtn.disabled = selectedIds.length === 0 || !hasQuestion;
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

async function askQuestion() {
  const question = questionInput.value.trim();
  const selectedIds = getSelectedDocumentIds();

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

// Event listeners for document library
scanBtn.addEventListener("click", scanDocuments);
processAllBtn.addEventListener("click", processAllDocuments);
askBtn.addEventListener("click", askQuestion);
questionInput.addEventListener("input", updateAskButtonState);
questionInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    if (!askBtn.disabled) {
      askQuestion();
    }
  }
});

// Initialize document library on page load
checkOllamaStatus();
loadDocuments();

// ============================================
// Analyze Form Functions
// ============================================

function getSelectedOutputs() {
  const checks = [...outputsWrap.querySelectorAll('input[type="checkbox"][name="outputs"]')];
  return checks.filter(c => c.checked).map(c => c.value);
}

function updateAnalyzeEnabled(showStatus = true) {
  const outputs = getSelectedOutputs();
  const enabled = outputs.length >= 1;
  analyzeBtn.disabled = !enabled;

  if (!showStatus) return;
  if (!enabled) setStatus("Choose at least one output to enable Analyze.", "warn");
  else setStatus("Ready.", "info");
}

// Show/hide pre-fill option based on whether "Generate response template" is selected
function updatePrefillVisibility() {
  const outputs = getSelectedOutputs();
  const wantsTemplate = outputs.includes("generate_template");
  prefillField.style.display = wantsTemplate ? "flex" : "none";

  // If template is unchecked, also uncheck the prefill toggle
  if (!wantsTemplate) {
    templateFillToggle.checked = false;
  }
}

outputsWrap.addEventListener("change", () => {
  updateAnalyzeEnabled(true);
  updatePrefillVisibility();
});

updateAnalyzeEnabled(true);
updatePrefillVisibility();

function hideAllResultBlocks() {
  resultsCard.style.display = "none";
  translationBlock.style.display = "none";
  summaryBlock.style.display = "none";
  keyPointsBlock.style.display = "none";
  todosBlock.style.display = "none";
  crossRefBlock.style.display = "none";
  templateBlock.style.display = "none";
}

function resetResults() {
  lastResult = null;
  originalTemplateText = "";

  translatedDocEl.textContent = "No data yet.";
  summaryEl.textContent = "No data yet.";
  keyPointsEl.textContent = "No data yet.";
  todosEl.textContent = "No data yet.";
  crossRefEl.textContent = "No data yet.";
  templateBoxEl.textContent = "No data yet.";

  translatedDocEl.classList.add("subtle");
  summaryEl.classList.add("subtle");
  keyPointsEl.classList.add("subtle");
  todosEl.classList.add("subtle");
  crossRefEl.classList.add("subtle");
  templateBoxEl.classList.add("subtle");

  hideAllResultBlocks();
}

clearBtn.addEventListener("click", () => {
  resetResults();
  fileInput.value = "";
  crossFilesInput.value = "";
  templateFillToggle.checked = false;
  setStatus("Cleared. Ready.", "info");
});

function renderTranslatedDoc(data) {
  const t = data?.translated_text ?? "";
  translatedDocEl.classList.remove("subtle");
  translatedDocEl.innerHTML = t
    ? `<pre class="doc">${escapeHtml(t)}</pre>`
    : `<p class="subtle">No translated text in response.</p>`;
  if (t) translatedDisclosure.open = true;
}

function renderSummary(data) {
  const summary = data?.summary ?? "";
  summaryEl.classList.remove("subtle");
  summaryEl.innerHTML = summary
    ? `<p>${escapeHtml(summary)}</p>`
    : `<p class="subtle">No summary in response.</p>`;
}

function renderKeyPoints(data) {
  const items = normalizeArray(data?.key_points ?? []);
  keyPointsEl.classList.remove("subtle");

  if (!items.length) {
    keyPointsEl.innerHTML = `<p class="subtle">No key points in response.</p>`;
    return;
  }

  keyPointsEl.innerHTML = items.map((kp) => {
    const text = kp?.point ?? "";
    const dept = kp?.department ?? "";
    const tags = normalizeArray(kp?.tags).filter(Boolean);
    const deptLabel = DEPARTMENTS.includes(dept) ? dept : "Unassigned";

    return `
      <div class="kp">
        <div class="kp-top">
          <span class="badge">${escapeHtml(deptLabel)}</span>
          ${
            tags.length
              ? `<div class="tags">${tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join("")}</div>`
              : `<span class="subtle">No tags</span>`
          }
        </div>
        <div>${text ? escapeHtml(text) : "<span class='subtle'>No text</span>"}</div>
      </div>
    `;
  }).join("");
}

function renderTodos(data) {
  const byDeptObj = data?.todos_by_department ?? null;
  todosEl.classList.remove("subtle");

  if (!byDeptObj || typeof byDeptObj !== "object" || Array.isArray(byDeptObj)) {
    todosEl.innerHTML = `<p class="subtle">No to-dos in response.</p>`;
    return;
  }

  todosEl.innerHTML = DEPARTMENTS.map((dept) => {
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

function renderCrossReference(data) {
  const findings = normalizeArray(data?.cross_reference ?? []);
  crossRefEl.classList.remove("subtle");

  if (!findings.length) {
    crossRefEl.innerHTML = `<p class="subtle">No cross-reference output.</p>`;
    return;
  }

  crossRefEl.innerHTML = findings.map((f) => {
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

function renderTemplate(data) {
  const tmpl = data?.response_template ?? "";
  templateBoxEl.classList.remove("subtle");

  originalTemplateText = tmpl || "";
  if (!tmpl) {
    templateBoxEl.innerHTML = `<p class="subtle">No template in response.</p>`;
    return;
  }

  templateBoxEl.innerHTML = `<pre class="doc">${escapeHtml(tmpl)}</pre>`;
}

async function safeReadError(res) {
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    const j = await res.json().catch(() => null);
    return j?.error || j?.message || JSON.stringify(j);
  }
  return await res.text().catch(() => "Unknown error");
}

// Export helpers

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

function exportTranslationDocx() {
  if (!lastResult || !lastResult.translated_text) {
    setStatus("No translated text to export.", "warn");
    return;
  }
  const html = `<html><body><pre>${escapeHtml(lastResult.translated_text)}</pre></body></html>`;
  downloadBlob(html, "translation.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
}

function exportTodosCsv() {
  if (!lastResult || !lastResult.todos_by_department) {
    setStatus("No to-dos to export.", "warn");
    return;
  }

  const rows = [["department", "task", "source_point"]];
  for (const dept of DEPARTMENTS) {
    const items = normalizeArray(lastResult.todos_by_department[dept]);
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

  const csv = rows
    .map(r => r.map(v => `"${v}"`).join(","))
    .join("\n");

  downloadBlob(csv, "todos.csv", "text/csv;charset=utf-8;");
}

function exportTemplateDocx() {
  if (!lastResult || !originalTemplateText) {
    setStatus("No template to export.", "warn");
    return;
  }
  const html = `<html><body><pre>${escapeHtml(originalTemplateText)}</pre></body></html>`;
  downloadBlob(html, "response-template.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
}

exportTranslationBtn.addEventListener("click", exportTranslationDocx);
exportTodosBtn.addEventListener("click", exportTodosCsv);
exportTemplateBtn.addEventListener("click", exportTemplateDocx);

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const file = fileInput.files?.[0];
  if (!file) {
    setStatus("Choose a PDF or DOCX file first.", "warn");
    return;
  }

  const outputs = getSelectedOutputs();
  if (outputs.length < 1) {
    setStatus("Choose at least one output.", "warn");
    return;
  }

  const wantsCrossRef = outputs.includes("cross_reference");
  const wantsTemplate = outputs.includes("generate_template");
  const wantsPrefill = wantsTemplate && templateFillToggle.checked;

  analyzeBtn.disabled = true;
  resetResults();
  setStatus("Uploading and analyzing...", "info");

  try {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("targetLanguage", translateTo.value);
    outputs.forEach(o => fd.append("outputs", o));

    // Send prefill preference to backend
    if (wantsTemplate) {
      fd.append("prefillTemplate", wantsPrefill ? "true" : "false");
    }

    // Always send cross files if cross-reference or template is requested
    if (wantsCrossRef || wantsTemplate) {
      const crossFiles = [...(crossFilesInput?.files || [])];
      crossFiles.forEach(f => fd.append("crossFiles", f));
    }

    const res = await fetch(ENDPOINT, { method: "POST", body: fd });

    if (!res.ok) {
      const details = await safeReadError(res);
      setStatus(`Request failed (${res.status}). ${details || ""}`.trim(), "bad");
      return;
    }

    const data = await res.json();
    lastResult = data;

    setStatus("Done.", "good");

    // Show results card
    resultsCard.style.display = "block";

    // Show only the blocks that were requested and render their content
    if (outputs.includes("translation")) {
      translationBlock.style.display = "block";
      renderTranslatedDoc(data);
    }

    if (outputs.includes("summary")) {
      summaryBlock.style.display = "block";
      renderSummary(data);
    }

    if (outputs.includes("key_points")) {
      keyPointsBlock.style.display = "block";
      renderKeyPoints(data);
    }

    if (outputs.includes("todos")) {
      todosBlock.style.display = "block";
      renderTodos(data);
    }

    if (outputs.includes("cross_reference")) {
      crossRefBlock.style.display = "block";
      renderCrossReference(data);
    }

    if (outputs.includes("generate_template")) {
      templateBlock.style.display = "block";
      renderTemplate(data);
    }
  } catch (err) {
    setStatus(`Network error: ${err?.message || String(err)}`, "bad");
  } finally {
    updateAnalyzeEnabled(false);
  }
});
