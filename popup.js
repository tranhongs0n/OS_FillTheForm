let capturedInputs = [];

const scanBtn = document.getElementById('scanButton');
const fillBtn = document.getElementById('fillButton');
const status = document.getElementById('status');

scanBtn.addEventListener('click', async () => {
  status.textContent = "Scanning...";
  scanBtn.disabled = true;
  
  try {
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    if (!tab) throw new Error("No active tab found");

    chrome.tabs.sendMessage(tab.id, {action: "scan_form"}, (response) => {
      if (chrome.runtime.lastError) {
        status.textContent = "Error: " + chrome.runtime.lastError.message;
        scanBtn.disabled = false;
        return;
      }
      
      if (response && response.inputs) {
        capturedInputs = response.inputs;
        const list = document.getElementById('fieldsList');
        list.innerHTML = capturedInputs.map(i => `<div>${i.label || i.name} (${i.type})</div>`).join('');
        
        status.textContent = `Found ${capturedInputs.length} fields.`;
        scanBtn.disabled = false;
        fillBtn.disabled = false;
      } else {
        status.textContent = "No fields found or invalid response.";
        scanBtn.disabled = false;
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
  chrome.runtime.sendMessage({action: "get_data", inputs: capturedInputs, tabId: tab.id});
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
