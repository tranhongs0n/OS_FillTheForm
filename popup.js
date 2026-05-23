document.getElementById('capture-btn').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
  const response = await chrome.tabs.sendMessage(tab.id, {action: "captureContext"});
  chrome.storage.local.set({contextSnapshot: response}, () => {
      document.getElementById('status').innerText = "Context Captured!";
  });
});

let capturedForms = [];

const scanBtn = document.getElementById('scanButton');
const fillBtn = document.getElementById('fillButton');
const status = document.getElementById('status');
const summary = document.getElementById('summary');
const fieldsList = document.getElementById('fieldsList');
const jsonPreview = document.getElementById('jsonPreview');
const toggleJson = document.getElementById('toggleJson');
const formSelector = document.getElementById('formSelector');
const llmOutput = document.getElementById('llmOutput');

scanBtn.addEventListener('click', async () => {
  status.textContent = "Scanning...";
  scanBtn.disabled = true;
  summary.textContent = "";
  fieldsList.textContent = "";
  jsonPreview.style.display = 'none';
  llmOutput.textContent = "No data generated yet.";
  formSelector.innerHTML = '<option value="all">All Forms</option>';
  formSelector.disabled = true;
  
  try {
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    if (!tab) throw new Error("No active tab found");

    chrome.tabs.sendMessage(tab.id, {action: "scan_form"}, (response) => {
      if (chrome.runtime.lastError) {
        status.textContent = "Error: " + chrome.runtime.lastError.message;
        scanBtn.disabled = false;
        return;
      }
      
      if (response && response.forms) {
        capturedForms = response.forms;
        let totalFields = 0;
        let html = '';
        
        capturedForms.forEach((form, index) => {
          totalFields += form.fields.length;
          html += `<div class="form-group">${form.name}</div>`;
          form.fields.forEach(f => {
            const detail = f.type === 'select-one' ? ` (${f.options.length} options)` : ` (${f.type})`;
            html += `<div class="field-item">${f.label || f.name || 'Unnamed'}${detail}</div>`;
          });
          
          const option = document.createElement('option');
          option.value = index;
          option.textContent = form.name;
          formSelector.appendChild(option);
        });

        fieldsList.innerHTML = html || 'No fields found.';
        summary.textContent = `Found ${capturedForms.length} form(s) with ${totalFields} total fields.`;
        jsonPreview.textContent = JSON.stringify(capturedForms, null, 2);
        
        status.textContent = "Scan complete.";
        scanBtn.disabled = false;
        fillBtn.disabled = totalFields === 0;
        formSelector.disabled = totalFields === 0;
      }
    });
  } catch (err) {
    status.textContent = "Error: " + err.message;
    scanBtn.disabled = false;
  }
});

fillBtn.addEventListener('click', async () => {
  status.textContent = "Generating...";
  fillBtn.disabled = true;
  
  const selectedValue = formSelector.value;
  let formsToSend = [];
  
  if (selectedValue === 'all') {
    formsToSend = capturedForms;
  } else {
    formsToSend = [capturedForms[parseInt(selectedValue)]];
  }

  const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
  chrome.runtime.sendMessage({action: "get_data", inputs: formsToSend, tabId: tab.id});
});

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
      <div class="batch-item-text" title='${JSON.stringify(data, null, 2)}'>#${index + 1}: ${summaryText}</div>
      <button class="apply-btn" ${item.used ? 'disabled' : ''}>Apply</button>
    `;

    div.querySelector('.apply-btn').addEventListener('click', async () => {
      const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
      chrome.tabs.sendMessage(tab.id, { action: "apply_data", json: item.data, submit: false });
      
      // Mark as used in storage
      const result = await chrome.storage.local.get(['batchData']);
      const updatedBatch = result.batchData;
      if (updatedBatch && updatedBatch[index]) {
        updatedBatch[index].used = true;
        chrome.storage.local.set({ batchData: updatedBatch });
      }
    });

    batchList.appendChild(div);
  });
}

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

toggleJson.addEventListener('click', (e) => {
  e.preventDefault();
  const isHidden = jsonPreview.style.display === 'none' || !jsonPreview.style.display;
  jsonPreview.style.display = isHidden ? 'block' : 'none';
  toggleJson.textContent = isHidden ? 'Hide JSON Context' : 'Show JSON Context';
});

chrome.runtime.onMessage.addListener((request) => {
  if (request.action === "llm_result") {
    try {
      const data = JSON.parse(request.json);
      llmOutput.innerHTML = '';
      
      for (const [key, val] of Object.entries(data)) {
        const block = document.createElement('div');
        block.className = 'copy-block';
        
        const header = document.createElement('div');
        header.className = 'copy-header';
        header.innerText = key;
        
        const btn = document.createElement('button');
        btn.className = 'copy-btn';
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
        llmOutput.appendChild(block);
      }
    } catch (e) {
      llmOutput.textContent = request.json;
    }
  } else if (request.action === "fill_complete") {
    status.textContent = "Filled successfully!";
    fillBtn.disabled = false;
  } else if (request.action === "fill_error") {
    status.textContent = "Error: " + request.error;
    fillBtn.disabled = false;
  }
});
