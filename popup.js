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
