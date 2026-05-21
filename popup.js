let capturedForms = [];

const scanBtn = document.getElementById('scanButton');
const fillBtn = document.getElementById('fillButton');
const status = document.getElementById('status');
const summary = document.getElementById('summary');
const fieldsList = document.getElementById('fieldsList');
const jsonPreview = document.getElementById('jsonPreview');
const toggleJson = document.getElementById('toggleJson');

scanBtn.addEventListener('click', async () => {
  status.textContent = "Scanning...";
  scanBtn.disabled = true;
  summary.textContent = "";
  fieldsList.textContent = "";
  jsonPreview.style.display = 'none';
  
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
        
        capturedForms.forEach(form => {
          totalFields += form.fields.length;
          html += `<div class="form-group">${form.name}</div>`;
          form.fields.forEach(f => {
            html += `<div class="field-item">${f.label || f.name || 'Unnamed'} (${f.type})</div>`;
          });
        });

        fieldsList.innerHTML = html || 'No fields found.';
        summary.textContent = `Found ${capturedForms.length} form(s) with ${totalFields} total fields.`;
        jsonPreview.textContent = JSON.stringify(capturedForms, null, 2);
        
        status.textContent = "Scan complete.";
        scanBtn.disabled = false;
        fillBtn.disabled = totalFields === 0;
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
  
  const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
  // Flatten for the LLM to process easier, or send the whole structured object
  chrome.runtime.sendMessage({action: "get_data", inputs: capturedForms, tabId: tab.id});
});

toggleJson.addEventListener('click', (e) => {
  e.preventDefault();
  const isHidden = jsonPreview.style.display === 'none' || !jsonPreview.style.display;
  jsonPreview.style.display = isHidden ? 'block' : 'none';
  toggleJson.textContent = isHidden ? 'Hide JSON Context' : 'Show JSON Context';
});

chrome.runtime.onMessage.addListener((request) => {
  if (request.action === "fill_complete") {
    status.textContent = "Filled successfully!";
    fillBtn.disabled = false;
  } else if (request.action === "fill_error") {
    status.textContent = "Error: " + request.error;
    fillBtn.disabled = false;
  }
});
