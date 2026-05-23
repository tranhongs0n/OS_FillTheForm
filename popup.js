/**
 * Enterprise LLM Auto-Filler Suite - Sidebar Controller
 * 
 * Elegant side panel orchestrator caching DOM nodes, coordinating scanners,
 * executing single & batch data synthesis, exporting datasets (CSV),
 * importing templates (JSON), and presenting the interactive Inline Record Editor.
 */

// Cache DOM elements at startup to avoid expensive queries later
const DOM = {
  captureBtn: document.getElementById('capture-btn'),
  scanBtn: document.getElementById('scanButton'),
  fillBtn: document.getElementById('fillButton'),
  status: document.getElementById('status'),
  scanStatus: document.getElementById('scanStatus'),
  summary: document.getElementById('summary'),
  fieldsList: document.getElementById('fieldsList'),
  jsonPreview: document.getElementById('jsonPreview'),
  toggleJson: document.getElementById('toggleJson'),
  formSelector: document.getElementById('formSelector'),
  llmOutput: document.getElementById('llmOutput'),
  batchList: document.getElementById('batchList'),
  clearBatchBtn: document.getElementById('clearBatchBtn'),
  openOptionsBtn: document.getElementById('openOptionsLink'),
  
  // CSV / JSON utilities
  exportCsvBtn: document.getElementById('exportCsvBtn'),
  importJsonBtn: document.getElementById('importJsonBtn'),
  importBatchFileInput: document.getElementById('importBatchFileInput'),
  
  // Interactive Editor Overlay
  editorOverlay: document.getElementById('editorOverlay'),
  editorFieldsContainer: document.getElementById('editorFieldsContainer'),
  closeEditorBtn: document.getElementById('closeEditorBtn'),
  cancelEditorBtn: document.getElementById('cancelEditorBtn'),
  saveEditorBtn: document.getElementById('saveEditorBtn')
};

// Global state variables
let capturedForms = [];
let editingRecordId = null;

const CONFIG = {
  LLM_TIMEOUT_MS: 30000
};

// -------------------------------------------------------------------------
// Event Listeners Initialization
// -------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  DOM.captureBtn.addEventListener('click', handleContextCapture);
  DOM.scanBtn.addEventListener('click', handlePageScan);
  DOM.fillBtn.addEventListener('click', handleAutoFill);
  DOM.clearBatchBtn.addEventListener('click', handleBatchClear);
  DOM.toggleJson.addEventListener('click', handleToggleJsonPreview);
  DOM.openOptionsBtn.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
  
  // Batch Size generation buttons
  document.querySelectorAll('.batch-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const count = parseInt(btn.dataset.count);
      handleBatchGenerate(count);
    });
  });

  // CSV & JSON utility buttons
  DOM.exportCsvBtn.addEventListener('click', handleExportCSV);
  DOM.importJsonBtn.addEventListener('click', () => DOM.importBatchFileInput.click());
  DOM.importBatchFileInput.addEventListener('change', handleImportJSON);

  // Overlay modal buttons
  DOM.closeEditorBtn.addEventListener('click', closeEditorModal);
  DOM.cancelEditorBtn.addEventListener('click', closeEditorModal);
  DOM.saveEditorBtn.addEventListener('click', saveEditedRecord);

  // Sync batch records lists from local storage
  chrome.storage.local.get(['batchData'], (result) => {
    renderBatchData(result.batchData || []);
  });

  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.batchData) {
      renderBatchData(changes.batchData.newValue || []);
    }
  });

  // Listen for LLM generation response events
  chrome.runtime.onMessage.addListener(handleRuntimeMessage);
});

// Update standard visual status badges
function setStatus(text, type = 'info') {
  DOM.status.textContent = text;
  DOM.status.className = `badge badge-${type}`;
}

// -------------------------------------------------------------------------
// Core Actions Handlers
// -------------------------------------------------------------------------

async function handleContextCapture() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  setStatus("Capturing...", "violet");
  chrome.tabs.sendMessage(tab.id, { action: "captureContext" }, (response) => {
    if (chrome.runtime.lastError) {
      setStatus("Err Capturing", "warning");
      console.error(chrome.runtime.lastError);
      return;
    }
    
    chrome.storage.local.set({ contextSnapshot: response }, () => {
      setStatus("Captured!", "success");
      setTimeout(() => setStatus("Ready", "violet"), 2000);
    });
  });
}

async function handlePageScan() {
  setScanLoadingState();
  
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) throw new Error("No active tab found");

    chrome.tabs.sendMessage(tab.id, { action: "scan_form" }, (response) => {
      if (chrome.runtime.lastError) {
        DOM.scanStatus.textContent = "Error: " + chrome.runtime.lastError.message;
        DOM.scanBtn.disabled = false;
        setStatus("Scan Fail", "warning");
        return;
      }
      
      if (response && response.forms) {
        processScanResults(response.forms);
      }
    });
  } catch (err) {
    DOM.scanStatus.textContent = "Error: " + err.message;
    DOM.scanBtn.disabled = false;
    setStatus("Scan Fail", "warning");
  }
}

async function handleAutoFill() {
  setStatus("Generating...", "warning");
  DOM.fillBtn.disabled = true;
  
  const selectedForms = getFormsToSend();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  chrome.runtime.sendMessage({
    action: "get_data", 
    inputs: selectedForms, 
    tabId: tab.id,
    url: tab.url
  });

  // Track attempt telemetry
  incrementAttemptsTelemetry();

  // Fail-safe network timeout
  setTimeout(() => {
    if (DOM.fillBtn.disabled && DOM.status.textContent === "Generating...") {
      DOM.fillBtn.disabled = false;
      setStatus("Timed Out", "warning");
    }
  }, CONFIG.LLM_TIMEOUT_MS);
}

async function handleBatchGenerate(count) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const selectedForms = getFormsToSend();
  
  if (selectedForms.length === 0) {
    setStatus("Scan Page First", "warning");
    return;
  }

  setStatus(`Creating ${count}...`, "warning");
  chrome.runtime.sendMessage({
    action: "get_data", 
    inputs: selectedForms, 
    tabId: tab.id, 
    batchCount: count,
    url: tab.url
  });
  
  // Track attempt telemetry
  incrementAttemptsTelemetry(count);
}

function handleBatchClear() {
  if (confirm("Are you sure you want to clear all batch records in storage?")) {
    chrome.storage.local.set({ batchData: [] }, () => {
      renderBatchData([]);
    });
  }
}

function handleToggleJsonPreview(e) {
  e.preventDefault();
  const isHidden = DOM.jsonPreview.style.display === 'none' || !DOM.jsonPreview.style.display;
  DOM.jsonPreview.style.display = isHidden ? 'block' : 'none';
  DOM.toggleJson.textContent = isHidden ? 'Hide Form JSON' : 'Show Scraped Form Context (JSON)';
}

function handleRuntimeMessage(request) {
  if (request.action === "llm_result") {
    renderSingleResults(request.json);
  } else if (request.action === "fill_complete") {
    setStatus("Filled!", "success");
    DOM.fillBtn.disabled = false;
    setTimeout(() => setStatus("Ready", "violet"), 3000);
  } else if (request.action === "fill_error") {
    setStatus("Error", "warning");
    DOM.fillBtn.disabled = false;
  }
}

// Telemetry Helpers
function incrementAttemptsTelemetry(count = 1) {
  chrome.storage.local.get(['telemetry_totalAttempts'], (res) => {
    const current = res.telemetry_totalAttempts || 0;
    chrome.storage.local.set({ telemetry_totalAttempts: current + count });
  });
}

// -------------------------------------------------------------------------
// Scanned Form Renderers
// -------------------------------------------------------------------------

function setScanLoadingState() {
  DOM.scanStatus.textContent = "Scanning forms...";
  DOM.scanBtn.disabled = true;
  DOM.summary.textContent = "";
  DOM.fieldsList.innerHTML = '<div style="color: var(--text-muted); text-align: center; padding: 10px;">Scanning DOM...</div>';
  DOM.jsonPreview.style.display = 'none';
  DOM.llmOutput.textContent = "No data generated yet.";
  DOM.formSelector.innerHTML = '<option value="all">All Forms Scanned</option>';
  DOM.formSelector.disabled = true;
}

function processScanResults(forms) {
  capturedForms = forms;
  let totalFields = 0;
  let html = '';
  
  capturedForms.forEach((form, index) => {
    totalFields += form.fields.length;
    html += `<div class="form-header-node">📂 ${escapeHtml(form.name)}</div>`;
    form.fields.forEach(f => {
      const detail = f.type === 'select' ? ` (${f.options.length} options)` : ` (${f.type})`;
      html += `
        <div class="field-item-node">
          <span>↳ ${escapeHtml(f.label || f.name || 'Unnamed')}</span>
          <span style="color: var(--text-muted); font-size: 9px;">${escapeHtml(detail)}</span>
        </div>`;
    });
    
    const option = document.createElement('option');
    option.value = index;
    option.textContent = form.name;
    DOM.formSelector.appendChild(option);
  });

  DOM.fieldsList.innerHTML = html || '<div style="color: var(--text-muted); text-align: center; padding: 10px;">No input fields discovered.</div>';
  DOM.summary.textContent = `Scanned ${capturedForms.length} Form(s) | ${totalFields} Input(s)`;
  DOM.jsonPreview.textContent = JSON.stringify(capturedForms, null, 2);
  
  DOM.scanStatus.textContent = "";
  DOM.scanBtn.disabled = false;
  DOM.fillBtn.disabled = totalFields === 0;
  DOM.formSelector.disabled = totalFields === 0;
  setStatus("Scan Complete", "success");
  setTimeout(() => setStatus("Ready", "violet"), 2000);
}

function getFormsToSend() {
  const selectedValue = DOM.formSelector.value;
  if (selectedValue === 'all') {
    return capturedForms;
  }
  return [capturedForms[parseInt(selectedValue)]];
}

// -------------------------------------------------------------------------
// CSV / JSON Utilities Implementation
// -------------------------------------------------------------------------

function handleExportCSV() {
  chrome.storage.local.get(['batchData'], (result) => {
    const batch = result.batchData || [];
    if (batch.length === 0) {
      alert("No batch records available to export!");
      return;
    }
    
    // Parse records
    const parsedRecords = batch.map(item => JSON.parse(item.data));
    
    // Get unique headers across all records
    const headers = [...new Set(parsedRecords.flatMap(record => Object.keys(record)))];
    
    // Construct CSV string
    const csvRows = [];
    csvRows.push(headers.join(',')); // Add header row
    
    parsedRecords.forEach(record => {
      const values = headers.map(header => {
        const val = record[header] !== undefined ? String(record[header]) : '';
        // Escape quotes and wrap in quotes if commas/quotes exist
        const escaped = val.replace(/"/g, '""');
        return `"${escaped}"`;
      });
      csvRows.push(values.join(','));
    });
    
    const csvContent = "\uFEFF" + csvRows.join('\n'); // Add UTF-8 BOM for Excel compatibility
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `autofill_dataset_batch_${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setStatus("CSV Exported", "success");
  });
}

function handleImportJSON(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = async (event) => {
    try {
      const parsed = JSON.parse(event.target.result);
      let recordsToSave = [];
      
      if (Array.isArray(parsed)) {
        // Direct batch array of raw flat records or structured records
        recordsToSave = parsed.map(item => {
          // If already in structured extension layout, preserve it, else structure it
          if (item.id && item.data) {
            return {
              id: item.id,
              data: typeof item.data === 'string' ? item.data : JSON.stringify(item.data),
              used: item.used !== undefined ? item.used : false,
              timestamp: item.timestamp || Date.now()
            };
          } else {
            return {
              id: crypto.randomUUID(),
              data: JSON.stringify(item),
              used: false,
              timestamp: Date.now()
            };
          }
        });
      } else if (typeof parsed === 'object') {
        // Single record wrapper
        recordsToSave.push({
          id: crypto.randomUUID(),
          data: JSON.stringify(parsed),
          used: false,
          timestamp: Date.now()
        });
      } else {
        throw new Error("Invalid structure. Must be a flat JSON array or single object.");
      }
      
      const { batchData: existing } = await chrome.storage.local.get('batchData');
      const updated = [...(existing || []), ...recordsToSave];
      await chrome.storage.local.set({ batchData: updated });
      
      setStatus("Batch Imported!", "success");
      DOM.importBatchFileInput.value = ''; // clear input
    } catch (err) {
      alert("Failed to parse JSON file: " + err.message);
      setStatus("Import Err", "warning");
    }
  };
  reader.readAsText(file);
}

// -------------------------------------------------------------------------
// Interactive Record Editor Modal Portal
// -------------------------------------------------------------------------

function openEditorModal(recordId, recordData) {
  editingRecordId = recordId;
  DOM.editorFieldsContainer.innerHTML = '';
  
  try {
    const dataObj = JSON.parse(recordData);
    
    // Create text input elements for each key in the JSON object
    for (const [key, value] of Object.entries(dataObj)) {
      const fieldContainer = document.createElement('div');
      fieldContainer.className = 'modal-field';
      
      const label = document.createElement('label');
      label.textContent = key;
      
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'editor-field-input';
      input.dataset.key = key;
      input.value = value !== null ? String(value) : '';
      
      fieldContainer.appendChild(label);
      fieldContainer.appendChild(input);
      DOM.editorFieldsContainer.appendChild(fieldContainer);
    }
    
    DOM.editorOverlay.classList.add('active');
  } catch (e) {
    alert("Cannot edit record. Invalid JSON structure: " + e.message);
  }
}

function closeEditorModal() {
  DOM.editorOverlay.classList.remove('active');
  editingRecordId = null;
}

async function saveEditedRecord() {
  if (!editingRecordId) return;
  
  const inputs = DOM.editorFieldsContainer.querySelectorAll('.editor-field-input');
  const updatedData = {};
  
  inputs.forEach(input => {
    const key = input.dataset.key;
    const value = input.value.trim();
    
    // Handle true/false boolean conversions
    if (value.toLowerCase() === 'true') {
      updatedData[key] = true;
    } else if (value.toLowerCase() === 'false') {
      updatedData[key] = false;
    } else if (!isNaN(value) && value !== '') {
      updatedData[key] = Number(value);
    } else {
      updatedData[key] = value;
    }
  });
  
  const { batchData } = await chrome.storage.local.get('batchData');
  if (batchData) {
    const record = batchData.find(r => r.id === editingRecordId);
    if (record) {
      record.data = JSON.stringify(updatedData);
      await chrome.storage.local.set({ batchData });
      setStatus("Record Edited", "success");
      setTimeout(() => setStatus("Ready", "violet"), 1500);
    }
  }
  
  closeEditorModal();
}

// -------------------------------------------------------------------------
// Batch Records Layout Renderer
// -------------------------------------------------------------------------

function renderBatchData(batchData) {
  if (!batchData || batchData.length === 0) {
    DOM.batchList.innerHTML = '<div style="padding: 10px; color: var(--text-muted); text-align: center; font-size: 11px;">No active batch records.</div>';
    return;
  }

  DOM.batchList.innerHTML = '';
  batchData.forEach((item, index) => {
    const data = JSON.parse(item.data);
    const div = document.createElement('div');
    div.className = `batch-card-item ${item.used ? 'used' : ''}`;
    
    const summaryText = Object.entries(data).slice(0, 2).map(([k, v]) => `${k}: ${v}`).join(', ');
    
    div.innerHTML = `
      <div class="batch-card-summary" title='${escapeHtml(JSON.stringify(data, null, 2))}'>
        <strong>#${index + 1}</strong>: ${escapeHtml(summaryText)}
      </div>
      <div class="batch-card-btns">
        <button class="btn btn-xs edit-btn" style="padding: 2px 4px; font-size: 9px;" title="Edit Record">✏️</button>
        <button class="btn btn-primary btn-xs apply-btn" ${item.used ? 'disabled' : ''} style="padding: 2px 5px; font-size: 9px;" title="Apply Record">⚡ Fill</button>
        <button class="btn btn-danger btn-xs delete-record-btn" style="padding: 2px 4px; font-size: 9px;" title="Delete Record">&times;</button>
      </div>
    `;

    // Edit button portal trigger
    div.querySelector('.edit-btn').addEventListener('click', () => {
      openEditorModal(item.id, item.data);
    });

    // Apply button
    div.querySelector('.apply-btn').addEventListener('click', async () => {
      await applyBatchRecord(item.id);
    });

    // Individual delete
    div.querySelector('.delete-record-btn').addEventListener('click', async () => {
      if (confirm(`Delete record #${index + 1}?`)) {
        const { batchData: latest } = await chrome.storage.local.get('batchData');
        const filtered = latest.filter(r => r.id !== item.id);
        await chrome.storage.local.set({ batchData: filtered });
      }
    });

    DOM.batchList.appendChild(div);
  });
}

async function applyBatchRecord(recordId) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  // Guard record states immediately to prevent click-spamming races
  const { batchData: latestBatch } = await chrome.storage.local.get('batchData');
  if (latestBatch) {
    const record = latestBatch.find(r => r.id === recordId);
    if (record && !record.used) {
      record.used = true;
      await chrome.storage.local.set({ batchData: latestBatch });
      chrome.tabs.sendMessage(tab.id, { action: "apply_data", json: record.data, submit: false });
      
      // Record telemetry success
      incrementFillsTelemetry();
    }
  }
}

// Record Telemetry Success
function incrementFillsTelemetry() {
  chrome.storage.local.get(['telemetry_totalFills', 'telemetry_weeklyVelocity'], (res) => {
    const total = (res.telemetry_totalFills || 0) + 1;
    const weekly = res.telemetry_weeklyVelocity || {
      'Mon': 0, 'Tue': 0, 'Wed': 0, 'Thu': 0, 'Fri': 0, 'Sat': 0, 'Sun': 0
    };
    
    // Get current day of week
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const currentDay = days[new Date().getDay()];
    
    if (weekly[currentDay] !== undefined) {
      weekly[currentDay] += 1;
    }
    
    chrome.storage.local.set({
      telemetry_totalFills: total,
      telemetry_weeklyVelocity: weekly
    });
  });
}

// -------------------------------------------------------------------------
// Single Copy Sandbox Renderer
// -------------------------------------------------------------------------

function renderSingleResults(jsonStr) {
  try {
    const data = JSON.parse(jsonStr);
    DOM.llmOutput.innerHTML = '';
    
    // Also track standard autofill success telemetry
    incrementFillsTelemetry();
    
    for (const [key, val] of Object.entries(data)) {
      const block = createCopyBlock(key, val);
      DOM.llmOutput.appendChild(block);
    }
  } catch (e) {
    DOM.llmOutput.textContent = jsonStr;
  }
}

function createCopyBlock(key, val) {
  const block = document.createElement('div');
  block.className = 'copy-block';
  
  const header = document.createElement('div');
  header.className = 'copy-header';
  header.innerText = key;
  
  const btn = document.createElement('button');
  btn.className = 'btn btn-primary btn-xs copy-btn';
  btn.innerText = 'Copy';
  
  btn.onclick = () => {
    navigator.clipboard.writeText(String(val));
    btn.innerText = 'Copied!';
    setTimeout(() => btn.innerText = 'Copy', 1500);
  };
  
  header.appendChild(btn);
  
  const valDiv = document.createElement('div');
  valDiv.className = 'copy-val';
  valDiv.innerText = String(val);
  
  block.appendChild(header);
  block.appendChild(valDiv);
  return block;
}

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
}
