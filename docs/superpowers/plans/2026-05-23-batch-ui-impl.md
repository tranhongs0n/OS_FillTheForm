# Batch Management UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update the extension popup to support batch data generation and management.

**Architecture:** Use `chrome.storage.local` to sync batch data between background and popup. Popup renders the list and communicates with content script via messages.

**Tech Stack:** HTML, CSS, JavaScript (Chrome Extension APIs)

---

### Task 1: Update popup.html for Batch UI

**Files:**
- Modify: `popup.html`

- [ ] **Step 1: Add styles for batch section**

```html
<style>
  /* ... existing styles ... */
  .section-title { font-weight: bold; margin-top: 15px; border-top: 1px solid #ccc; padding-top: 10px; font-size: 14px; }
  .batch-controls { display: flex; gap: 5px; margin: 10px 0; align-items: center; }
  .batch-btn { padding: 3px 8px; font-size: 11px; }
  .danger-btn { background: #ffebee; color: #c62828; border: 1px solid #ef9a9a; font-size: 11px; padding: 3px 8px; margin-left: auto; }
  #batchContainer { max-height: 250px; overflow-y: auto; border: 1px solid #eee; margin-top: 5px; }
  .batch-item { display: flex; justify-content: space-between; align-items: center; padding: 5px; border-bottom: 1px solid #f5f5f5; font-size: 11px; }
  .batch-item.used { opacity: 0.5; text-decoration: line-through; background: #fafafa; }
  .batch-item-text { flex-grow: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-right: 5px; }
  .apply-btn { font-size: 10px; padding: 2px 5px; }
</style>
```

- [ ] **Step 2: Add HTML structure for batch section**

Place this before the "LLM Generated Data" section.

```html
  <div class="section-title">Batch Generation</div>
  <div class="batch-controls">
    <span style="font-size: 11px; color: #666;">Create:</span>
    <button class="batch-btn" data-count="5">5</button>
    <button class="batch-btn" data-count="10">10</button>
    <button class="batch-btn" data-count="20">20</button>
    <button id="clearBatchBtn" class="danger-btn">Clear Batch</button>
  </div>
  <div id="batchContainer">
    <div id="batchList"></div>
  </div>
```

- [ ] **Step 3: Commit**

```bash
git add popup.html
git commit -m "feat: add batch generation UI to popup.html"
```

### Task 2: Implement Batch Logic in popup.js

**Files:**
- Modify: `popup.js`

- [ ] **Step 1: Add event listeners for batch buttons**

```javascript
document.querySelectorAll('.batch-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    const count = parseInt(btn.dataset.count);
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    
    // Get captured forms first
    let formsToSend = capturedForms;
    if (formSelector.value !== 'all') {
      formsToSend = [capturedForms[parseInt(formSelector.value)]];
    }
    
    if (formsToSend.length === 0) {
      status.textContent = "Please scan the page first.";
      return;
    }

    status.textContent = `Generating ${count} records...`;
    chrome.runtime.sendMessage({
      action: "get_data", 
      inputs: formsToSend, 
      tabId: tab.id, 
      batchCount: count,
      url: tab.url
    });
  });
});

document.getElementById('clearBatchBtn').addEventListener('click', () => {
  chrome.storage.local.set({ batchData: [] }, () => {
    renderBatchData([]);
  });
});
```

- [ ] **Step 2: Implement renderBatchData function**

```javascript
function renderBatchData(batchData) {
  const batchList = document.getElementById('batchList');
  if (!batchData || batchData.length === 0) {
    batchList.innerHTML = '<div style="padding: 10px; color: #999; text-align: center;">No batch data.</div>';
    return;
  }

  batchList.innerHTML = '';
  batchData.forEach((item, index) => {
    const data = JSON.parse(item.data);
    const div = document.createElement('div');
    div.className = `batch-item ${item.used ? 'used' : ''}`;
    
    // Create summary from first few fields
    const summaryText = Object.entries(data).slice(0, 3).map(([k, v]) => `${k}: ${v}`).join(', ');
    
    div.innerHTML = `
      <div class="batch-item-text" title="${JSON.stringify(data, null, 2)}">#${index + 1}: ${summaryText}</div>
      <button class="apply-btn" ${item.used ? 'disabled' : ''}>Apply</button>
    `;

    div.querySelector('.apply-btn').addEventListener('click', async () => {
      const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
      chrome.tabs.sendMessage(tab.id, { action: "apply_data", json: item.data, submit: false });
      
      // Mark as used in storage
      const result = await chrome.storage.local.get(['batchData']);
      const updatedBatch = result.batchData;
      updatedBatch[index].used = true;
      chrome.storage.local.set({ batchData: updatedBatch });
    });

    batchList.appendChild(div);
  });
}
```

- [ ] **Step 3: Add initialization and storage listener**

```javascript
// Initialize
chrome.storage.local.get(['batchData'], (result) => {
  renderBatchData(result.batchData || []);
});

// Listen for changes (e.g. from background script or other popup instances)
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.batchData) {
    renderBatchData(changes.batchData.newValue || []);
  }
});
```

- [ ] **Step 4: Commit**

```bash
git add popup.js
git commit -m "feat: implement batch management logic in popup.js"
```

### Task 3: Verification

- [ ] **Step 1: Test Batch Generation**
1. Open popup on a page with a form.
2. Click "Scan Page".
3. Click "5" in Batch Generation.
4. Verify notification shows "Đang tạo 5 bản ghi...".
5. Wait for completion, verify batch list updates.

- [ ] **Step 2: Test Apply Record**
1. Click "Apply" on one of the batch records.
2. Verify the form on the page is filled.
3. Verify the record in the popup is grayed out/struck through.

- [ ] **Step 3: Test Keyboard Shortcut Sync**
1. Use Ctrl+Shift+B to fill a record.
2. Verify the popup (if open) updates the status of that record.

- [ ] **Step 4: Test Clear Batch**
1. Click "Clear Batch".
2. Verify the list is empty.
