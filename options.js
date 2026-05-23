/**
 * Enterprise LLM Auto-Filler Suite - Options Controller
 * 
 * Elegant options coordinator managing general LLM configurations, Base-64 api obfuscation,
 * dynamic tabs switching, prompt templates CRUD (with JSON backup/restore), selector adapters,
 * and high-fidelity telemetry metrics rendering.
 */

// Cache DOM elements
const DOM = {
  tabButtons: document.querySelectorAll('.tab-btn'),
  tabContents: document.querySelectorAll('.tab-content'),
  
  // Settings Tab
  apiKeyInput: document.getElementById('apiKey'),
  toggleApiKeyBtn: document.getElementById('toggleApiKey'),
  modelSelect: document.getElementById('modelSelect'),
  timeoutInput: document.getElementById('timeoutMs'),
  saveSettingsBtn: document.getElementById('saveButton'),
  connStatus: document.getElementById('connStatus'),
  
  // Templates Tab
  overrideTableBody: document.getElementById('overrideTableBody'),
  addOverrideBtn: document.getElementById('addOverride'),
  saveOverridesBtn: document.getElementById('saveOverrides'),
  exportTemplatesBtn: document.getElementById('exportTemplatesBtn'),
  importTemplatesBtn: document.getElementById('importTemplatesBtn'),
  importFileInput: document.getElementById('importFileInput'),
  
  // Custom Selectors Tab
  selectorsTableBody: document.getElementById('selectorsTableBody'),
  addSelectorBtn: document.getElementById('addSelector'),
  saveSelectorsBtn: document.getElementById('saveSelectors'),
  
  // Telemetry Tab
  statTotalFills: document.getElementById('statTotalFills'),
  statSuccessRate: document.getElementById('statSuccessRate'),
  statHoursSaved: document.getElementById('statHoursSaved'),
  velocityChart: document.getElementById('velocityChart'),
  velocityLabels: document.getElementById('velocityLabels'),
  resetTelemetryBtn: document.getElementById('resetTelemetryBtn'),
  
  // Toast notifications
  toast: document.getElementById('toast')
};

// Default custom selectors
const DEFAULT_SELECTORS = [
  { type: 'Virtual Select', selector: '.vscomp-wrapper' },
  { type: 'DatePicker', selector: '.osui-datepicker, .input-date' }
];

// -------------------------------------------------------------------------
// Event Listeners & Startup Initialization
// -------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  setupTabs();
  setupSettingsTab();
  setupTemplatesTab();
  setupSelectorsTab();
  setupTelemetryTab();
});

// Show styled toast notifications
function showToast(message, isError = false) {
  DOM.toast.textContent = message;
  DOM.toast.style.background = isError ? 'var(--error-color)' : 'var(--accent-color)';
  DOM.toast.classList.add('show');
  setTimeout(() => {
    DOM.toast.classList.remove('show');
  }, 3000);
}

// -------------------------------------------------------------------------
// Beautiful Tab Panel Management
// -------------------------------------------------------------------------
function setupTabs() {
  DOM.tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      // Toggle button states
      DOM.tabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      // Toggle sections
      const targetId = btn.dataset.tab;
      DOM.tabContents.forEach(content => {
        if (content.id === targetId) {
          content.classList.add('active');
        } else {
          content.classList.remove('active');
        }
      });
      
      // Specially reload telemetry view when clicked
      if (targetId === 'telemetryTab') {
        loadTelemetryData();
      }
    });
  });
}

// -------------------------------------------------------------------------
// Tab 1: General Settings Management
// -------------------------------------------------------------------------
function setupSettingsTab() {
  // Load initial settings
  chrome.storage.local.get(['apiKey', 'selectedModel', 'timeoutMs'], (result) => {
    if (result.apiKey) {
      try {
        DOM.apiKeyInput.value = atob(result.apiKey);
        DOM.connStatus.textContent = "Obfuscated & Active";
        DOM.connStatus.className = "badge badge-success";
      } catch (e) {
        DOM.apiKeyInput.value = result.apiKey;
        DOM.connStatus.textContent = "Active (Plaintext)";
        DOM.connStatus.className = "badge badge-warning";
      }
    } else {
      DOM.connStatus.textContent = "Awaiting API Key";
      DOM.connStatus.className = "badge badge-warning";
    }
    
    if (result.selectedModel) {
      DOM.modelSelect.value = result.selectedModel;
    }
    
    if (result.timeoutMs) {
      DOM.timeoutInput.value = result.timeoutMs;
    }
  });

  // Password visibility toggle
  DOM.toggleApiKeyBtn.addEventListener('click', () => {
    const isPassword = DOM.apiKeyInput.type === 'password';
    DOM.apiKeyInput.type = isPassword ? 'text' : 'password';
    DOM.toggleApiKeyBtn.textContent = isPassword ? '🔒' : '👁️';
  });

  // Save Settings
  DOM.saveSettingsBtn.addEventListener('click', () => {
    const key = DOM.apiKeyInput.value.trim();
    const obfuscated = key ? btoa(key) : '';
    const model = DOM.modelSelect.value;
    const timeout = parseInt(DOM.timeoutInput.value) || 6000;
    
    chrome.storage.local.set({
      apiKey: obfuscated,
      selectedModel: model,
      timeoutMs: timeout
    }, () => {
      if (key) {
        DOM.connStatus.textContent = "Obfuscated & Active";
        DOM.connStatus.className = "badge badge-success";
      } else {
        DOM.connStatus.textContent = "Awaiting API Key";
        DOM.connStatus.className = "badge badge-warning";
      }
      showToast("Settings saved successfully!");
    });
  });
}

// -------------------------------------------------------------------------
// Tab 2: Prompt Overrides / Templates CRUD
// -------------------------------------------------------------------------
function setupTemplatesTab() {
  // Load templates list
  chrome.storage.local.get(['promptOverrides'], (result) => {
    const overrides = result.promptOverrides || [];
    DOM.overrideTableBody.innerHTML = '';
    
    if (overrides.length === 0) {
      insertDefaultOverrideRows();
    } else {
      overrides.forEach(o => addOverrideRow(o.pattern, o.instruction));
    }
  });

  DOM.addOverrideBtn.addEventListener('click', () => addOverrideRow('', ''));
  DOM.saveOverridesBtn.addEventListener('click', saveTemplates);
  
  // JSON Backup / Restore Actions
  DOM.exportTemplatesBtn.addEventListener('click', exportTemplates);
  DOM.importTemplatesBtn.addEventListener('click', () => DOM.importFileInput.click());
  DOM.importFileInput.addEventListener('change', importTemplates);
}

function insertDefaultOverrideRows() {
  addOverrideRow('*giamsat*', 'Vai trò: BA/Tester giám sát Quốc hội. Định dạng Số/Kí hiệu: [Số]/KH-UBTVQH15. Sử dụng đa dạng tên tiếng Việt...');
  addOverrideRow('*public-form*', 'Vai trò: Đại diện nộp hồ sơ công dân. Điền chính xác thông tin cá nhân giả lập thực tế.');
}

function addOverrideRow(pattern = '', instruction = '') {
  const row = document.createElement('tr');
  
  row.innerHTML = `
    <td>
      <input type="text" class="pattern form-control" value="${escapeHtml(pattern)}" placeholder="e.g. *giamsat* or URL regex">
    </td>
    <td>
      <textarea class="instruction form-control" rows="2" placeholder="Write custom prompt instruction directives..." style="resize: vertical; min-height: 40px;">${escapeHtml(instruction)}</textarea>
    </td>
    <td style="text-align: center;">
      <button class="btn btn-danger btn-xs delete-row-btn">Delete</button>
    </td>
  `;
  
  row.querySelector('.delete-row-btn').addEventListener('click', () => {
    row.remove();
  });
  
  DOM.overrideTableBody.appendChild(row);
}

function saveTemplates() {
  const overrides = [];
  const rows = DOM.overrideTableBody.querySelectorAll('tr');
  
  rows.forEach(row => {
    const pattern = row.querySelector('.pattern').value.trim();
    const instruction = row.querySelector('.instruction').value.trim();
    
    if (pattern && instruction) {
      overrides.push({ pattern, instruction });
    }
  });
  
  chrome.storage.local.set({ promptOverrides: overrides }, () => {
    showToast("Prompt overrides saved successfully!");
  });
}

function exportTemplates() {
  chrome.storage.local.get(['promptOverrides'], (result) => {
    const overrides = result.promptOverrides || [];
    const blob = new Blob([JSON.stringify(overrides, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `autofill_prompt_templates_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("Templates exported!");
  });
}

function importTemplates(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const imported = JSON.parse(event.target.result);
      if (!Array.isArray(imported)) {
        throw new Error("Invalid structure. Expected an array of templates.");
      }
      
      DOM.overrideTableBody.innerHTML = '';
      imported.forEach(o => {
        if (o.pattern && o.instruction) {
          addOverrideRow(o.pattern, o.instruction);
        }
      });
      
      saveTemplates();
      showToast("Templates imported and saved!");
    } catch (err) {
      showToast("Import error: " + err.message, true);
    }
  };
  reader.readAsText(file);
}

// -------------------------------------------------------------------------
// Tab 3: Dynamic Selector Mappings CRUD
// -------------------------------------------------------------------------
function setupSelectorsTab() {
  // Load custom selectors
  chrome.storage.local.get(['customSelectors'], (result) => {
    const custom = result.customSelectors || [];
    DOM.selectorsTableBody.innerHTML = '';
    
    if (custom.length === 0) {
      DEFAULT_SELECTORS.forEach(s => addSelectorRow(s.type, s.selector));
    } else {
      custom.forEach(s => addSelectorRow(s.type, s.selector));
    }
  });

  DOM.addSelectorBtn.addEventListener('click', () => addSelectorRow('Standard', ''));
  DOM.saveSelectorsBtn.addEventListener('click', saveSelectors);
}

function addSelectorRow(type = 'Standard', selector = '') {
  const row = document.createElement('tr');
  
  row.innerHTML = `
    <td>
      <select class="selector-type">
        <option value="Virtual Select" ${type === 'Virtual Select' ? 'selected' : ''}>Virtual Select Dropdown</option>
        <option value="DatePicker" ${type === 'DatePicker' ? 'selected' : ''}>Date Picker Wrapper</option>
        <option value="Standard" ${type === 'Standard' ? 'selected' : ''}>Standard Input Class</option>
      </select>
    </td>
    <td>
      <input type="text" class="selector-val form-control" value="${escapeHtml(selector)}" placeholder="e.g. .custom-dropdown-container">
    </td>
    <td style="text-align: center;">
      <button class="btn btn-danger btn-xs delete-row-btn">Delete</button>
    </td>
  `;
  
  row.querySelector('.delete-row-btn').addEventListener('click', () => {
    row.remove();
  });
  
  DOM.selectorsTableBody.appendChild(row);
}

function saveSelectors() {
  const selectors = [];
  const rows = DOM.selectorsTableBody.querySelectorAll('tr');
  
  rows.forEach(row => {
    const type = row.querySelector('.selector-type').value;
    const selector = row.querySelector('.selector-val').value.trim();
    
    if (selector) {
      selectors.push({ type, selector });
    }
  });
  
  chrome.storage.local.set({ customSelectors: selectors }, () => {
    showToast("Selector adapters saved successfully!");
  });
}

// -------------------------------------------------------------------------
// Tab 4: Telemetry Metrics & css-bar-chart Rendering
// -------------------------------------------------------------------------
function setupTelemetryTab() {
  loadTelemetryData();
  DOM.resetTelemetryBtn.addEventListener('click', resetTelemetry);
}

function loadTelemetryData() {
  chrome.storage.local.get(['telemetry_totalFills', 'telemetry_totalAttempts', 'telemetry_weeklyVelocity'], (result) => {
    const fills = result.telemetry_totalFills || 0;
    const attempts = result.telemetry_totalAttempts || 0;
    const weeklyData = result.telemetry_weeklyVelocity || {
      'Mon': 0, 'Tue': 0, 'Wed': 0, 'Thu': 0, 'Fri': 0, 'Sat': 0, 'Sun': 0
    };
    
    // 1. Fill primary ROI figures
    DOM.statTotalFills.textContent = fills;
    
    const rate = attempts > 0 ? Math.round((fills / attempts) * 100) : 100;
    DOM.statSuccessRate.textContent = `${rate}%`;
    
    // Average 3.5 minutes saved per form filled (standard OutSystems complex legal workflow)
    const hoursSaved = parseFloat(((fills * 3.5) / 60).toFixed(1));
    DOM.statHoursSaved.textContent = `${hoursSaved}h`;
    
    // 2. Draw CSS Bar Chart
    drawVelocityChart(weeklyData);
  });
}

function drawVelocityChart(weeklyData) {
  DOM.velocityChart.innerHTML = '';
  DOM.velocityLabels.innerHTML = '';
  
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  
  // Find maximum value to normalize heights (default at least 5 to keep a nice grid)
  let maxVal = 5;
  days.forEach(d => {
    if (weeklyData[d] && weeklyData[d] > maxVal) {
      maxVal = weeklyData[d];
    }
  });
  
  days.forEach(day => {
    const val = weeklyData[day] || 0;
    const heightPercent = Math.max(5, Math.round((val / maxVal) * 100)); // Keep at least 5% visual bar
    
    // Create the visual chart bar
    const bar = document.createElement('div');
    bar.className = 'chart-bar';
    bar.style.height = `${heightPercent}%`;
    
    // Create the hover tooltip
    const tooltip = document.createElement('span');
    tooltip.className = 'chart-bar-tooltip';
    tooltip.textContent = `${val} fills`;
    bar.appendChild(tooltip);
    
    // Create the label text
    const label = document.createElement('span');
    label.style.flex = '1';
    label.style.textAlign = 'center';
    label.textContent = day;
    
    DOM.velocityChart.appendChild(bar);
    DOM.velocityLabels.appendChild(label);
  });
}

function resetTelemetry() {
  if (confirm("Are you sure you want to clear all local time-saving and telemetry stats?")) {
    chrome.storage.local.set({
      telemetry_totalFills: 0,
      telemetry_totalAttempts: 0,
      telemetry_weeklyVelocity: {
        'Mon': 0, 'Tue': 0, 'Wed': 0, 'Thu': 0, 'Fri': 0, 'Sat': 0, 'Sun': 0
      }
    }, () => {
      loadTelemetryData();
      showToast("Telemetry metrics reset!");
    });
  }
}

// -------------------------------------------------------------------------
// Helper Utilities
// -------------------------------------------------------------------------
function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
}
